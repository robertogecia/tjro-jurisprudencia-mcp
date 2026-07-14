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
  SITE,
  ORDENACOES,
  JANELA_MAXIMA,
  normTipos,
  buildBuscaBody,
  buildInteiroBody,
  formatBusca,
  formatInteiro,
  msgErro,
} from "./lib.js";

const API = "https://juris-back.tjro.jus.br";
const ENDPOINT = `${API}/search/varios_parametros/`;

const HEADERS = {
  Origin: SITE,
  Referer: SITE + "/",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; MCP-TJRO-Jurisprudencia/1.1)",
};

async function post(body) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// --------------------------------------------------------------- MCP server -
const server = new McpServer({ name: "Jurisprudência TJRO", version: "1.1.0" });

server.registerTool(
  "buscar_jurisprudencia_tjro",
  {
    title: "Buscar jurisprudência do TJRO",
    description:
      "Pesquisa jurisprudência do Tribunal de Justiça de Rondônia (TJRO) no portal público JURIS. " +
      "Cobre ~4 milhões de documentos (ementas, acórdãos, sentenças, votos) de 1º e 2º grau. " +
      "Ideal para precedentes LOCAIS de Rondônia, que bases nacionais não trazem. " +
      "Cada resultado traz citação pronta para peça e link direto para a decisão no portal. " +
      "Termos soltos combinam por OR (use \"a AND b\" ou termo_exato). O trecho exibido é o local " +
      "do match — só corresponde à ementa oficial quando o tipo é EMENTA. " +
      "Sempre confirme número, relator, câmara, data e ementa no inteiro teor antes de citar.",
    inputSchema: {
      consulta: z.string().describe('Termo(s) de busca; termos soltos combinam por OR — use "a AND b" para exigir todos, ou termo_exato para a frase exata. Ex.: "dano moral negativação".'),
      tipo: z
        .array(z.string())
        .optional()
        .describe('Tipos de documento. Padrão ["EMENTA","ACÓRDÃO"]. Opções: ACÓRDÃO, EMENTA, DECISÃO, "DECISÃO DA PRESIDÊNCIA", SENTENÇA, VOTO, RELATÓRIO. Todos são peças de 2º grau, exceto SENTENÇA (única de 1º grau).'),
      grau: z.number().int().optional().describe("1 (primeiro grau) ou 2 (câmaras). Omitir = ambos. Com grau=1, a busca é ajustada automaticamente para tipo=SENTENÇA."),
      classe_judicial: z.string().optional().describe('Classe EXATA em CAIXA ALTA (aplicada automaticamente). Ex.: "APELAÇÃO CÍVEL", "RECURSO INOMINADO CÍVEL".'),
      orgao_colegiado: z.string().optional().describe('Câmara EXATA em Formato de Título, sensível a maiúsculas. Ex.: "1ª Câmara Cível", "2ª Câmara Criminal", "1ª Turma Recursal".'),
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
      const ordenacao = ORDENACOES[a.ordenacao] ? a.ordenacao : "relevantes";
      const filtros = [];
      if (a.classe_judicial) filtros.push(`classe_judicial="${a.classe_judicial}"`);
      if (a.orgao_colegiado) filtros.push(`orgao_colegiado="${a.orgao_colegiado}"`);
      const data = await post(
        buildBuscaBody({
          consulta: a.consulta,
          tipo,
          grau: a.grau,
          classe: a.classe_judicial,
          orgaoColegiado: a.orgao_colegiado,
          dataInicio: a.data_inicio,
          dataFim: a.data_fim,
          nrProcesso: a.nr_processo,
          termoExato: !!a.termo_exato,
          ordenacao,
          pagina,
          porPagina,
        })
      );
      return {
        content: [{
          type: "text",
          text: formatBusca(data, a.consulta, tipo, ordenacao, pagina, porPagina, filtros, nota, !!a.termo_exato),
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
      return { content: [{ type: "text", text: formatInteiro(data, a.nr_processo) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Erro ao consultar o TJRO: ${msgErro(e)}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
