#!/usr/bin/env node
/**
 * Servidor MCP — Jurisprudência do TJRO (Tribunal de Justiça de Rondônia)
 * Busca pública no portal JURIS (juris.tjro.jus.br), sem login.
 * Porte Node.js para empacotamento .mcpb (1 clique no Claude Desktop).
 *
 * Wiring do protocolo MCP e chamada de rede. Toda a lógica pura (formatação,
 * montagem de query, escaping) está em lib.js e é coberta por testes em test/.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ORDENACOES,
  JANELA_MAXIMA,
  normTipos,
  buildBuscaBody,
  buildInteiroBody,
  GRUPOS_MAX,
  TERMOS_POR_GRUPO_MAX,
  formatBusca,
  formatInteiro,
  msgErro,
  post,
  diagnosticoRitmo,
  comCredito,
} from "./lib.js";

// --------------------------------------------------------------- MCP server -
const server = new McpServer({ name: "Jurisprudência TJRO", version: "1.7.0" });

server.registerTool(
  "buscar_jurisprudencia_tjro",
  {
    title: "Buscar jurisprudência do TJRO",
    description:
      "Pesquisa jurisprudência do Tribunal de Justiça de Rondônia (TJRO) no portal público JURIS. " +
      "Cobre ~4 milhões de documentos (ementas, acórdãos, sentenças, votos) de 1º e 2º grau. " +
      "Fonte dos precedentes LOCAIS de Rondônia, de todos os períodos. " +
      "Cada resultado traz citação pronta para peça, o ID DO DOCUMENTO (chave única daquela decisão) e link direto para a decisão no portal. " +
      "Um NÚMERO de processo pode ter vários julgados (acórdão original, embargos, segundos embargos, voto vencido): " +
      "a resposta avisa quando o mesmo número aparece mais de uma vez e quando dois documentos do mesmo julgamento " +
      "declaram resultado oposto (provável voto vencido indexado) — cite pelo id + data de julgamento, nunca só pelo número. " +
      "Use relator para amostragem dirigida por um(a) desembargador(a) específico(a) (ex.: saber como ele(a) decide " +
      "uma tese antes de sortear ministro/câmara): filtro SERVER-SIDE exato sobre o relator do acórdão — grafia e " +
      "maiúsculas IGUAIS ao índice (confirmado por teste: este campo NÃO tem padrão único de caixa — o mesmo índice " +
      "guarda relatores em Title Case e outros em CAIXA ALTA; se vier zero, rode sem o filtro, copie o texto exato " +
      "do campo \"Relator(a)\" de um resultado e repita). Só funciona com tipo incluindo ACÓRDÃO — em EMENTA esse " +
      "campo costuma vir vazio no índice. Quando a página trouxer 3 ou mais resultados, o rodapé soma quantos " +
      "declaram cada resultado (provido/desprovido/acolhido/rejeitado) NESTA página, uma vez por julgamento " +
      "(nº do processo + data — ementa e acórdão do mesmo julgado não contam em dobro): é indício para escolher o " +
      "que ler, nunca conclusão sobre a tese (recurso provido por outro fundamento também conta como provido). " +
      "Termos soltos combinam por OR (use \"a AND b\" ou termo_exato). O trecho exibido é um FRAGMENTO " +
      "(até 800 caracteres) do local do match, não a peça inteira, e só corresponde à ementa oficial quando o " +
      "tipo é EMENTA: ementa numerada costuma ENUNCIAR a tese nos primeiros itens e APLICÁ-LA nos últimos, às " +
      "vezes com alcance menor — abra o inteiro teor antes de fichar ou citar. " +
      "Sempre confirme número, relator, câmara, data e ementa no inteiro teor antes de citar. " +
      "USE SOMENTE para casos da jurisdição do TJRO (1º ou 2º grau de Rondônia) — jurisprudência " +
      "do TJRO não tem autoridade em outro tribunal. " +
      "A busca casa PALAVRAS, não sentido, e julgados do mesmo assunto usam vocabulários diferentes " +
      "— então monte a busca com `grupos`: cada grupo é uma lista de sinônimos ou expressões " +
      "equivalentes (combinados por OR) e os grupos se somam por AND; ex.: " +
      'grupos=[["dano moral"],["negativação","inscrição indevida","cadastro de inadimplentes","apontamento"]] ' +
      "(teste real: +37% de julgados frente ao termo único, na mesma requisição). Duas técnicas que " +
      "rendem mais que várias buscas: (1) ancorar pela súmula, tema ou IRDR que os julgados do assunto " +
      'citam (ex.: um grupo ["Súmula 385"]) — acha quem fala do mesmo tema com outras palavras; ' +
      "(2) depois da 1ª busca, abrir o inteiro teor do resultado mais certeiro e colher as palavras e " +
      "citações que ele usa para a próxima. O portal limita acesso automatizado: prefira UMA busca " +
      "bem construída (com por_pagina maior) a várias seguidas; um ciclo completo cabe em 4 a 6 consultas.",
    inputSchema: {
      consulta: z.string().describe('Termo(s) de busca livres — pode ser "" quando usar grupos; termos soltos combinam por OR — use "a AND b" para exigir todos, ou termo_exato para a frase exata. Curinga no FIM da palavra é aceito e rende mais numa só busca: "consign*" pega consignado/consignação/consignatário (curinga no início não é permitido). Ex.: "dano moral negativação".'),
      tipo: z
        .array(z.string())
        .optional()
        .describe('Tipos de documento. Padrão ["EMENTA","ACÓRDÃO"]. Opções: ACÓRDÃO, EMENTA, DECISÃO, "DECISÃO DA PRESIDÊNCIA", SENTENÇA, VOTO, RELATÓRIO. Todos são peças de 2º grau, exceto SENTENÇA (única de 1º grau).'),
      grau: z.number().int().optional().describe("1 (primeiro grau) ou 2 (câmaras). Omitir = ambos. Com grau=1, a busca é ajustada automaticamente para tipo=SENTENÇA."),
      classe_judicial: z.string().optional().describe('Classe EXATA em CAIXA ALTA (aplicada automaticamente). Ex.: "APELAÇÃO CÍVEL", "RECURSO INOMINADO CÍVEL".'),
      orgao_colegiado: z.string().optional().describe('Câmara EXATA em Formato de Título, sensível a maiúsculas. Ex.: "1ª Câmara Cível", "2ª Câmara Criminal", "1ª Turma Recursal".'),
      relator: z
        .string()
        .optional()
        .describe(
          'Filtra pelo(a) relator(a) do acórdão (filtro SERVER-SIDE, exato). Grafia e acentuação IGUAIS ao índice — ' +
            "NÃO há padrão único de maiúsculas (diferente de classe_judicial): o mesmo índice guarda relatores em " +
            'Title Case (ex.: "Alexandre Miguel") e outros em CAIXA ALTA. Se vier zero resultados, rode uma busca ' +
            'sem este filtro, copie o texto exato do campo "Relator(a)" de um resultado e repita — não adivinhe a ' +
            "caixa. Só filtra o campo do ACÓRDÃO: inclua ACÓRDÃO em tipo (esse campo costuma vir vazio em EMENTA)."
        ),
      grupos: z
        .array(z.array(z.string()))
        .optional()
        .describe(
          "Grupos de sinônimos: cada grupo é uma lista de palavras ou expressões equivalentes, combinadas por OR; " +
            "os grupos se somam por AND (e somam por AND à consulta, se houver). Expressão com espaço vira frase " +
            'exata. Curinga só no FIM de palavra única ("consign*"). A ferramenta monta os parênteses e escapa cada ' +
            `termo — não escreva sintaxe. Até ${GRUPOS_MAX} grupos e ${TERMOS_POR_GRUPO_MAX} termos por grupo. ` +
            'Ex.: [["dano moral"],["negativação","inscrição indevida","cadastro de inadimplentes"]].'
        ),
      assunto: z
        .string()
        .optional()
        .describe(
          'Filtra pelo assunto CNJ (Tabela Processual Unificada), grafia EXATA — copie do campo "Assunto:" de um ' +
            "resultado. É RUIDOSO: o assunto é lançado na distribuição, cada processo tem vários e recurso herda o " +
            "do principal (teste real: 7 de 20 resultados eram de outro tema). Use SEMPRE junto com consulta ou " +
            "grupos, nunca sozinho."
        ),
      data_inicio: z.string().optional().describe("Data inicial de julgamento, formato AAAA-MM-DD."),
      data_fim: z.string().optional().describe("Data final de julgamento, formato AAAA-MM-DD."),
      nr_processo: z.string().optional().describe("Filtra por um número de processo específico (com ou sem máscara)."),
      termo_exato: z.boolean().optional().describe("true para buscar a expressão exata (entre aspas)."),
      ordenacao: z.enum(["relevantes", "recentes", "antigos"]).optional().describe('Padrão "relevantes".'),
      pagina: z.number().int().optional().describe("Página dos resultados (1+). O portal expõe no máximo os 10.000 primeiros."),
      por_pagina: z.number().int().optional().describe("Resultados por página (1–50; padrão 10)."),
    },
  },
  async (a) => {
    try {
      let tipo = normTipos(a.tipo, ["EMENTA", "ACÓRDÃO"]);
      let nota = "";
      if (a.grau === 1 && !tipo.includes("SENTENÇA")) {
        // No índice, EMENTA/ACÓRDÃO/VOTO/RELATÓRIO/DECISÃO só existem no 2º grau.
        tipo = ["SENTENÇA"];
        nota = "Nota: EMENTA/ACÓRDÃO são peças de 2º grau; a busca em 1º grau foi ajustada para tipo=SENTENÇA.\n";
      }
      const porPagina = Math.max(1, Math.min(a.por_pagina ?? 10, 50));
      const pagina = Math.max(1, a.pagina ?? 1);
      if (pagina * porPagina > JANELA_MAXIMA)
        return {
          content: [{
            type: "text",
            text:
              "O portal JURIS só expõe os 10.000 primeiros resultados de cada busca " +
              `(pagina=${pagina} × por_pagina=${porPagina} passa desse limite). ` +
              "Refine com filtros (tipo, grau, classe, datas) ou mude a ordenação (recentes/antigos) para alcançar outros documentos.",
          }],
        };
      const temGrupos = Array.isArray(a.grupos) && a.grupos.some((g) => Array.isArray(g) && g.some((t) => String(t).trim()));
      if (!String(a.consulta || "").trim() && !temGrupos)
        return { content: [{ type: "text", text: "Informe a consulta ou pelo menos um grupo de termos." }] };
      const ordenacao = ORDENACOES[a.ordenacao] ? a.ordenacao : "relevantes";
      const filtros = [];
      if (a.classe_judicial) filtros.push(`classe_judicial="${a.classe_judicial}"`);
      if (a.orgao_colegiado) filtros.push(`orgao_colegiado="${a.orgao_colegiado}"`);
      if (a.relator)
        filtros.push(
          `relator="${a.relator}" (grafia e maiúsculas EXATAS como no índice — não há padrão único de caixa; ` +
            'confira o campo "Relator(a)" de um resultado sem filtro antes de repetir; só vale para tipo ACÓRDÃO)'
        );
      if (a.assunto)
        filtros.push(
          `assunto="${a.assunto}" (grafia EXATA da Tabela Processual Unificada do CNJ — copie do campo "Assunto:" de um resultado)`
        );
      const corpo = buildBuscaBody({
          consulta: a.consulta,
          tipo,
          grau: a.grau,
          classe: a.classe_judicial,
          orgaoColegiado: a.orgao_colegiado,
          relator: a.relator,
          grupos: a.grupos,
          assunto: a.assunto,
          dataInicio: a.data_inicio,
          dataFim: a.data_fim,
          nrProcesso: a.nr_processo,
          termoExato: !!a.termo_exato,
          ordenacao,
          pagina,
          porPagina,
        });
      const data = await post(corpo);
      return {
        content: [{
          type: "text",
          text: comCredito(
            formatBusca(data, a.consulta, tipo, ordenacao, pagina, porPagina, filtros, nota, !!a.termo_exato, temGrupos ? corpo.fields.query : "")
          ),
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Erro ao consultar o TJRO: ${msgErro(e)}` }], isError: true };
    }
  }
);

server.registerTool(
  "obter_inteiro_teor_tjro",
  {
    title: "Obter inteiro teor de um processo do TJRO",
    description:
      "Retorna o texto integral dos documentos de UM processo do TJRO (acórdão, ementa, voto, relatório), " +
      "com citação pronta para peça e link do portal. " +
      "Use o nr_processo devolvido por buscar_jurisprudencia_tjro quando precisar do teor completo, não só da ementa. " +
      "Se o processo tiver julgamentos distintos (original, embargos, segundos embargos), a resposta lista todos com data, relator e id " +
      "do documento — a Citação do cabeçalho é só da decisão mais recente. Cada peça avisa quando a câmara ou o relator do índice " +
      "divergem do que o texto do acórdão declara (prevalece o texto; o cadastro do portal já saiu errado nesse campo). " +
      "A saída é deduplicada e limitada a ~50 mil caracteres — se algo for truncado, um aviso indica como buscar o restante (filtrando por tipo).",
    inputSchema: {
      nr_processo: z.string().describe("Número do processo (CNJ), com ou sem máscara."),
      tipo: z
        .array(z.string())
        .optional()
        .describe('Quais peças trazer. Padrão ["ACÓRDÃO","EMENTA","VOTO","RELATÓRIO"].'),
    },
  },
  async (a) => {
    if (!String(a.nr_processo || "").replace(/\D/g, ""))
      return { content: [{ type: "text", text: "Informe o número do processo (CNJ)." }] };
    try {
      const tipo = normTipos(a.tipo, ["ACÓRDÃO", "EMENTA", "VOTO", "RELATÓRIO"]);
      const data = await post(buildInteiroBody(a.nr_processo, tipo));
      return { content: [{ type: "text", text: comCredito(formatInteiro(data, a.nr_processo)) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Erro ao consultar o TJRO: ${msgErro(e)}` }], isError: true };
    }
  }
);

server.registerTool(
  "diagnostico_ritmo_tjro",
  {
    title: "Diagnóstico do controle de ritmo (TJRO)",
    description:
      "Mostra por que as buscas do TJRO podem estar falhando: nível atual do limite de ritmo, " +
      "orçamento já consumido, se há bloqueio por suspeita de automação em curso (e quanto falta " +
      "para liberar) e o histórico de bloqueios com o que estava acontecendo em cada um. " +
      "USE ISTO antes de concluir que 'o portal está fora do ar' — o sintoma é parecido, mas a " +
      "causa e a solução são outras. Não faz nenhuma requisição ao TJRO.",
    inputSchema: {},
  },
  async () => ({ content: [{ type: "text", text: diagnosticoRitmo() }] })
);

const transport = new StdioServerTransport();
await server.connect(transport);
