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
  POR_PAGINA_MAX,
  filtrarPorResultado,
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
  comAvisos,
  comAjudaNoErro,
  gravarRecibos,
  iniciarChecagemVersao,
  VERSAO,
  orgaoMultiplo,
  ehOrgao1oGrau,
  lerCacheInteiro,
  gravarCacheInteiro,
  notaCache,
} from "./lib.js";
import { consultarProcesso, formatProcesso, ErroProcesso } from "./processo.js";
import { baixarAtualizacao, textoAtualizacao, ErroAtualizacao } from "./atualizar.js";
import {
  buscarNormas,
  obterNorma,
  formatListaNormas,
  formatNormaDetalhe,
  resolverOpcao,
  TIPOS_ATO,
  SITUACOES_ATO,
  ORIGENS_ATO,
  TEMAS_ATO,
  NORMA_TEXTO_MAX,
  ErroNorma,
} from "./normas.js";

// --------------------------------------------------------------- MCP server -
const server = new McpServer({ name: "Jurisprudência TJRO", version: VERSAO });
iniciarChecagemVersao();

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
      "declaram cada resultado (provido / parcialmente provido / desprovido / acolhido / rejeitado) NESTA página, uma vez por julgamento " +
      "(nº do processo + data — ementa e acórdão do mesmo julgado não contam em dobro) e, com 10+ julgamentos, a quebra por relator, " +
      "órgão e ano: é indício para escolher o que ler, nunca conclusão sobre a tese (recurso provido por outro fundamento também conta como provido). " +
      "Toda busca com 3+ documentos abre com um PANORAMA do resultado inteiro (câmara/vara, gabinete, classe e ano — agregações que o " +
      "próprio portal devolve, sem consulta extra; câmara e gabinete são os do cadastro) para escolher filtros antes da próxima consulta. " +
      "Para varrer um tema: UMA busca com por_pagina 100–250 e modo=\"compacto\", depois abra em modo completo só o que interessa. " +
      "Termos soltos combinam por OR (use \"a AND b\" ou termo_exato). O trecho exibido é um FRAGMENTO " +
      "(até 800 caracteres) do local do match, não a peça inteira, e só corresponde à ementa oficial quando o " +
      "tipo é EMENTA: ementa numerada costuma ENUNCIAR a tese nos primeiros itens e APLICÁ-LA nos últimos, às " +
      "vezes com alcance menor — abra o inteiro teor antes de fichar ou citar. " +
      "A CÂMARA do cadastro do portal erra com frequência (amostra real de 14/09/2026: 15 de 24 processos " +
      "cadastrados na \"3ª Câmara Cível\" foram julgados pela 1ª ou pela 2ª): quando o acórdão da página declara " +
      "outra câmara no fecho (\"acordam os Magistrados da(o) ...\"), o resultado mostra a câmara do fecho, avisa, " +
      "e a Citação já sai com ela. Pela mesma razão, orgao_colegiado filtra pelo cadastro, não pelo julgamento. " +
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
      consulta: z.string().default("").describe('Termo(s) de busca livres — pode ser "" quando usar grupos; termos soltos combinam por OR — use "a AND b" para exigir todos, ou termo_exato para a frase exata. Curinga no FIM da palavra é aceito e rende mais numa só busca: "consign*" pega consignado/consignação/consignatário (curinga no início não é permitido). Ex.: "dano moral negativação".'),
      tipo: z
        .array(z.string())
        .optional()
        .describe('Tipos de documento. Padrão ["EMENTA","ACÓRDÃO"]. Opções: ACÓRDÃO, EMENTA, DECISÃO, "DECISÃO DA PRESIDÊNCIA", SENTENÇA, VOTO, RELATÓRIO. Todos são peças de 2º grau, exceto SENTENÇA (única de 1º grau).'),
      grau: z.number().int().optional().describe("1 (primeiro grau) ou 2 (câmaras). Omitir = ambos. Com grau=1, a busca é ajustada automaticamente para tipo=SENTENÇA."),
      classe_judicial: z.string().optional().describe('Classe EXATA em CAIXA ALTA (aplicada automaticamente). Ex.: "APELAÇÃO CÍVEL", "RECURSO INOMINADO CÍVEL".'),
      orgao_colegiado: z.string().optional().describe('Órgão EXATO em Formato de Título, sensível a maiúsculas. 2º grau: "1ª Câmara Cível", "2ª Câmara Criminal", "1ª Turma Recursal". 1º grau (vara/juizado, só SENTENÇA): "Comarca - Vara", ex.: "Porto Velho - 4ª Vara Cível" — copie do campo "Órgão" de um resultado; com vara, a busca vai sozinha para tipo=SENTENÇA. Filtra pelo CADASTRO do portal, que erra a câmara com frequência (sobretudo "3ª Câmara Cível"): para a posição de uma câmara, confira a câmara declarada no fecho de cada acórdão, e saiba que julgados dela cadastrados em outra ficam de fora. UM órgão só: vírgula ou "ou" não somam órgãos (o portal devolve 0). Não filtre por família de câmara por padrão: nas teses medidas, 2 de 8 julgados essenciais vinham de Câmara Especial ou Turma Recursal e 2 tinham órgão vazio no índice.'),
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
      excluir: z
        .array(z.string())
        .optional()
        .describe(
          'Termos ou expressões que NÃO podem aparecer (até 8), ex.: ["energia elétrica", "telefonia", "plano de saúde"]. ' +
            "Vira AND NOT (termo1 OR termo2). Corta também o julgado certo que cite o termo de passagem: use só para " +
            "tirar ruído evidente, nunca na única busca de uma tese. Não funciona sozinho: precisa de consulta ou grupos."
        ),
      grupos: z
        .array(z.array(z.string()))
        .optional()
        .describe(
          "Proximidade: termo `a b ~N` (2+ palavras, N 1-20) vira \"a b\"~N, palavras a até N posições em qualquer ordem — use quando a frase exata der pouco. Grupos de sinônimos: cada grupo é uma lista de palavras ou expressões equivalentes, combinadas por OR; " +
            "os grupos se somam por AND (e somam por AND à consulta, se houver). Expressão com espaço vira frase " +
            'exata. Curinga só no FIM de palavra única ("consign*"). A ferramenta monta os parênteses e escapa cada ' +
            `termo — não escreva sintaxe. Até ${GRUPOS_MAX} grupos e ${TERMOS_POR_GRUPO_MAX} termos por grupo. ` +
            'Cada grupo descreve o ASSUNTO ou o FATO (o instituto, o objeto, a conduta), nunca a CONCLUSÃO do julgado: cada acórdão escreve a conclusão de um jeito ("não equivale", "é inócua", "não afasta"), e um grupo assim derruba a busca — medido em 22/09/2026, em 2 de 7 teses: numa zerou os resultados, noutra o acórdão certo sumiu e voltou ao 1º lugar só tirando o grupo da conclusão. ' +
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
      por_pagina: z.number().int().optional().describe("Resultados por página (1–250; padrão 10). Acima de ~30, use modo=\"compacto\" para a resposta caber: 250 numa consulta custam o mesmo que 10 no ritmo do portal."),
      modo: z.enum(["completo", "compacto"]).optional().describe('"compacto" = uma linha por documento (órgão, data, relator, resultado declarado, assunto, processo, id), sem trecho — para varrer 100–250 resultados e escolher o que abrir. Padrão "completo" (com trecho).'),
      resultado: z.enum(["provido", "parcial", "desprovido", "acolhido", "rejeitado", "sem"]).optional().describe("Filtra, NO CLIENTE e só dentro da página trazida, os documentos cujo julgamento declara esse resultado no dispositivo (provido / parcialmente provido / desprovido / acolhido / rejeitado; \"sem\" = sem resultado identificável). Use com por_pagina alto. O total do cabeçalho continua sendo o do índice."),
    },
  },
  async (a) => {
    try {
      let tipo = normTipos(a.tipo, ["EMENTA", "ACÓRDÃO"]);
      let nota = "";
      if (ehOrgao1oGrau(a.orgao_colegiado) && !tipo.includes("SENTENÇA")) {
        tipo = ["SENTENÇA"];
        nota = "Nota: o órgão indicado é de 1º grau, onde o índice só tem SENTENÇA; a busca foi ajustada para tipo=SENTENÇA.\n";
      } else if (a.grau === 1 && !tipo.includes("SENTENÇA")) {
        // No índice, EMENTA/ACÓRDÃO/VOTO/RELATÓRIO/DECISÃO só existem no 2º grau.
        tipo = ["SENTENÇA"];
        nota = "Nota: EMENTA/ACÓRDÃO são peças de 2º grau; a busca em 1º grau foi ajustada para tipo=SENTENÇA.\n";
      }
      const porPagina = Math.max(1, Math.min(a.por_pagina ?? 10, POR_PAGINA_MAX));
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
      const multi = orgaoMultiplo(a.orgao_colegiado);
      if (multi) return { content: [{ type: "text", text: multi }] };
      const ordenacao = ORDENACOES[a.ordenacao] ? a.ordenacao : "relevantes";
      const filtros = [];
      if (a.classe_judicial) filtros.push(`classe_judicial="${a.classe_judicial}"`);
      if (a.orgao_colegiado) filtros.push(`orgao_colegiado="${a.orgao_colegiado}"`);
      if (Array.isArray(a.excluir) && a.excluir.some((t) => String(t).trim()))
        filtros.push(`excluir=${JSON.stringify(a.excluir.filter((t) => String(t).trim()).slice(0, 8))}`);
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
          excluir: a.excluir,
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
      if (a.resultado) {
        const antes = ((data.hits || {}).hits || []).length;
        const { hits, removidos } = filtrarPorResultado((data.hits || {}).hits || [], a.resultado);
        data.hits = { ...(data.hits || {}), hits };
        nota += `Filtro resultado="${a.resultado}" aplicado no cliente: dos ${antes} documentos trazidos nesta página, ${hits.length} ficaram (${removidos} removidos). O total do cabeçalho é o do índice, sem esse filtro.\n`;
        filtros.push(`resultado="${a.resultado}" (no cliente, só nesta página)`);
      }
      return {
        content: [{
          type: "text",
          text: await comAvisos(
            formatBusca(data, a.consulta, tipo, ordenacao, pagina, porPagina, filtros, nota, !!a.termo_exato, temGrupos || (Array.isArray(a.excluir) && a.excluir.length) ? corpo.fields.query : "", { modo: a.modo })
          ),
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: await comAjudaNoErro(msgErro(e)) }], isError: true };
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
      "Parâmetro obrigatório: nr_processo (número CNJ). O id do documento NÃO é parâmetro e não substitui o número: a ferramenta busca pelo processo e devolve todos os julgamentos dele, cada um com o seu id; para citar um deles, use o id que aparece na resposta. " +
      "Se o processo tiver julgamentos distintos (original, embargos, segundos embargos), a resposta lista todos com data, relator e id " +
      "do documento — a Citação do cabeçalho é só da decisão mais recente. Cada peça avisa quando a câmara ou o relator do índice " +
      "divergem do que o texto do acórdão declara (prevalece o texto; o cadastro do portal erra a câmara com frequência). " +
      "A câmara vem do FECHO do acórdão (\"acordam os Magistrados da(o) ...\"), a ata do julgamento; sem fecho, do cabeçalho. " +
      "Quando o fecho diverge do índice, a Citação do cabeçalho já sai com a câmara do fecho. " +
      "Cada peça traz o PRÓPRIO link do portal (\"· link ...\" no título da peça); o link do topo é o da peça mais recente. " +
      "Para citar, use o link e o id da peça citada, nunca os de outra peça do mesmo número. " +
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
      const cache = lerCacheInteiro(a.nr_processo, tipo);
      if (cache)
        return { content: [{ type: "text", text: await comAvisos(notaCache(cache.obtido_em) + formatInteiro(cache.data, a.nr_processo)) }] };
      const data = await post(buildInteiroBody(a.nr_processo, tipo));
      gravarRecibos(data);
      gravarCacheInteiro(a.nr_processo, tipo, data);
      return { content: [{ type: "text", text: await comAvisos(formatInteiro(data, a.nr_processo)) }] };
    } catch (e) {
      return { content: [{ type: "text", text: await comAjudaNoErro(msgErro(e)) }], isError: true };
    }
  }
);

server.registerTool(
  "consultar_processo_tjro",
  {
    title: "Capa e movimentos de um processo do TJRO",
    description:
      "Capa (órgão julgador, classe, competência, autuação, indicadores de baixa, gratuidade, liminar, segredo) e movimentos " +
      "de UM processo do TJRO, 1º e 2º grau, pela API pública de processos do próprio tribunal (Portal da Transparência). " +
      "Funciona mesmo quando o portal de jurisprudência está bloqueado (divide só a cota de ritmo). NÃO traz partes, advogados, peças nem teor de " +
      "decisão; boa parte dos movimentos migrados aparece só como \"Movimento Local\", sem descrição. NUNCA use as datas " +
      "para contar prazo (prazo sai do DJEN). Resposta vazia = número incorreto OU segredo de justiça, nunca \"não existe\". " +
      "Uma consulta por processo; não serve para varrer processos.",
    inputSchema: {
      nr_processo: z.string().describe("Número do processo (CNJ, 20 dígitos), com ou sem máscara."),
      max_movimentos: z.number().int().min(1).max(100).optional().describe("Quantos movimentos mais recentes mostrar por grau. Padrão 15."),
    },
  },
  async (a) => {
    try {
      const res = await consultarProcesso(a.nr_processo);
      return { content: [{ type: "text", text: await comAvisos(formatProcesso(res, a.nr_processo, a.max_movimentos ?? 15)) }] };
    } catch (e) {
      // Erro da API de processos tem mensagem própria: nunca o aviso de bloqueio do JURIS.
      const texto = e instanceof ErroProcesso ? e.message : `Erro inesperado na consulta de processo: ${e?.message || e}`;
      return { content: [{ type: "text", text: texto }], isError: true };
    }
  }
);

server.registerTool(
  "buscar_norma_tjro",
  {
    title: "Buscar atos normativos do TJRO (resoluções, provimentos, instruções, Regimento)",
    description:
      "Pesquisa o portal oficial de atos normativos do TJRO (atos.tjro.jus.br): resoluções e atos da Presidência, provimentos e " +
      "portarias da Corregedoria (CGJ), instruções, Regimento Interno, Diretrizes Gerais, enunciados, leis estaduais que o tribunal cataloga. " +
      "`argumento` procura no TEXTO INTEGRAL (não só na ementa), sem operadores: use uma expressão curta (\"licença-prêmio\", \"custas\", \"cedência\"); " +
      "número + ano localizam um ato conhecido (Instrução 11/2016 → numero=\"11\", ano=\"2016\", tipo=\"Instrução\"). " +
      "Devolve 10 por página com situação do cadastro (Vigente, Alterado, Revogado…), os vigentes primeiro; para ler o texto compilado, " +
      "quem alterou/revogou e a legislação correlata, use obter_norma_tjro(id). NÃO é jurisprudência (para acórdãos use buscar_jurisprudencia_tjro) " +
      "e não cobre legislação federal. Zero resultado nunca é \"não existe\": varie o termo ou tire filtros. Divide a cota de ritmo com o JURIS.",
    inputSchema: {
      argumento: z.string().optional().describe("Palavra ou expressão curta procurada no texto integral do ato."),
      numero: z.string().optional().describe("Número do ato, sem zeros à esquerda (\"11\", \"1300\")."),
      ano: z.string().optional().describe("Ano do ato (4 dígitos)."),
      tipo: z.enum(Object.keys(TIPOS_ATO)).optional().describe("Tipo do ato (um só). Sem tipo, todos."),
      situacao: z.enum(Object.keys(SITUACOES_ATO)).optional().describe("Filtra pela situação do cadastro. Sem filtro, todos (os vigentes vêm primeiro de qualquer jeito)."),
      origem: z.string().optional().describe("Órgão de origem, por nome ou parte dele: \"Presidência\", \"Corregedoria Geral da Justiça\", \"Governo do Estado\"…"),
      tema: z.string().optional().describe("Tema do cadastro, por nome ou parte: \"Prazo\", \"Precatórios\", \"Gestão de Pessoas\", \"Extrajudicial\"…"),
      pagina: z.number().int().min(1).max(200).optional().describe("Página (10 por página). Padrão 1."),
    },
  },
  async (a) => {
    try {
      const tipo = a.tipo ? { codigo: TIPOS_ATO[a.tipo], rotulo: a.tipo } : null;
      const situacao = a.situacao ? { codigo: SITUACOES_ATO[a.situacao], rotulo: a.situacao } : null;
      const origem = resolverOpcao(ORIGENS_ATO, a.origem, "origem");
      const tema = resolverOpcao(TEMAS_ATO, a.tema, "tema");
      if (!a.argumento?.trim() && !a.numero?.trim() && !a.ano?.trim() && !tipo && !situacao && !origem && !tema)
        return { content: [{ type: "text", text: "Informe ao menos um critério: argumento, numero/ano, tipo, situacao, origem ou tema." }], isError: true };
      const pagina = a.pagina ?? 1;
      const res = await buscarNormas({
        argumento: a.argumento, numero: a.numero, ano: a.ano, tipos: tipo ? [tipo.codigo] : [],
        situacao: situacao?.codigo, origem: origem?.codigo, tema: tema?.codigo, pagina,
      });
      const filtros = [
        a.argumento?.trim() && `argumento="${a.argumento.trim()}"`, a.numero?.trim() && `número ${a.numero.trim()}`, a.ano?.trim() && `ano ${a.ano.trim()}`,
        tipo && `tipo ${tipo.rotulo}`, situacao && `situação ${situacao.rotulo}`, origem && `origem "${origem.rotulo}"`, tema && `tema "${tema.rotulo}"`,
      ].filter(Boolean);
      return { content: [{ type: "text", text: formatListaNormas(res, filtros, pagina) }] };
    } catch (e) {
      const texto = e instanceof ErroNorma ? e.message : `Erro inesperado na pesquisa de atos normativos: ${e?.message || e}`;
      return { content: [{ type: "text", text: texto }], isError: true };
    }
  }
);

server.registerTool(
  "obter_norma_tjro",
  {
    title: "Ler um ato normativo do TJRO (texto compilado, situação, alterações, correlatas)",
    description:
      "Abre um ato do portal atos.tjro.jus.br pelo id (o número em detalhar/ID, devolvido por buscar_norma_tjro): identificação, situação " +
      "(Vigente/Alterado/Revogado…), ementa, temas, publicação, quem o alterou ou revogou (com o id do ato novo, para seguir a cadeia), " +
      "legislação correlata e o TEXTO COMPILADO, com as alterações marcadas no próprio texto. `artigo` devolve só aquele artigo; texto longo vem " +
      "em fatias (`inicio`). Atos antigos podem existir só em PDF: aí vem o link, sem texto. Cite sempre a redação compilada e a norma que a deu; " +
      "ato não vigente não se cita como em vigor. Divide a cota de ritmo com o JURIS.",
    inputSchema: {
      id: z.string().describe("Id do ato no portal (ex.: \"3438\")."),
      artigo: z.string().optional().describe("Número do artigo a recortar (\"4\", \"4º\"). Sem isso, o texto inteiro em fatias."),
      inicio: z.number().int().min(0).optional().describe("Posição (caracteres) de onde continuar o texto. Padrão 0."),
      max_caracteres: z.number().int().min(1000).max(60000).optional().describe(`Tamanho da fatia. Padrão ${NORMA_TEXTO_MAX}.`),
    },
  },
  async (a) => {
    try {
      const d = await obterNorma(a.id);
      return { content: [{ type: "text", text: formatNormaDetalhe(d, { artigo: a.artigo, inicio: a.inicio, maxCaracteres: a.max_caracteres }) }] };
    } catch (e) {
      const texto = e instanceof ErroNorma ? e.message : `Erro inesperado ao abrir o ato normativo: ${e?.message || e}`;
      return { content: [{ type: "text", text: texto }], isError: true };
    }
  }
);

server.registerTool(
  "atualizar_extensao_tjro",
  {
    title: "Baixar a versão mais nova desta extensão",
    description:
      "USE SÓ QUANDO O USUÁRIO PEDIR para atualizar a extensão. Consulta o GitHub oficial do projeto e, se houver versão " +
      "mais nova, baixa o arquivo para a pasta Downloads, confere o SHA-256 e diz onde ele está. NÃO instala: o usuário " +
      "instala dando dois cliques no arquivo e confirmando. Nunca use por iniciativa própria e nunca abra ou execute o arquivo. " +
      "Não consulta o TJRO.",
    inputSchema: {},
    annotations: { title: "Baixar atualização da extensão", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    try {
      return { content: [{ type: "text", text: textoAtualizacao(await baixarAtualizacao()) }] };
    } catch (e) {
      const texto = e instanceof ErroAtualizacao ? e.message : `Não consegui baixar a atualização (${e?.message || e}).`;
      return { content: [{ type: "text", text: texto }], isError: true };
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
