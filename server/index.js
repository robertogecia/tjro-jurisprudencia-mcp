#!/usr/bin/env node
/**
 * Servidor MCP — Jurisprudência do TJRO (Tribunal de Justiça de Rondônia)
 * Busca pública no portal JURIS (juris.tjro.jus.br), sem login.
 * Porte Node.js para empacotamento .mcpb (1 clique no Claude Desktop).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import he from "he";

const API = "https://juris-back.tjro.jus.br";
const SITE = "https://juris.tjro.jus.br";
const ENDPOINT = `${API}/search/varios_parametros/`;

const HEADERS = {
  Origin: SITE,
  Referer: SITE + "/",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; MCP-TJRO-Jurisprudencia/1.1)",
};

const TIPOS_VALIDOS = [
  "ACÓRDÃO",
  "EMENTA",
  "DECISÃO",
  "DECISÃO DA PRESIDÊNCIA",
  "SENTENÇA",
  "VOTO",
  "RELATÓRIO",
];

const HIGHLIGHT = {
  type: "plain",
  number_of_fragments: 1,
  fragment_size: 3000,
  require_field_match: "true",
  pre_tags: ["«"],
  post_tags: ["»"],
  fields: [{ ds_modelo_documento: { number_of_fragments: 1 } }],
};

const ORDENACOES = {
  relevantes: [{ _score: "desc" }, { dtjulgamento: "desc" }],
  recentes: [{ dtjulgamento: "desc" }, { _score: "desc" }],
  antigos: [{ dtjulgamento: "asc" }, { _score: "desc" }],
};

// O Elasticsearch do portal não pagina além dos 10.000 primeiros resultados.
const JANELA_MAXIMA = 10000;

// Orçamento máximo de caracteres da resposta do inteiro teor (evita afogar o contexto).
const ORCAMENTO_INTEIRO = 50000;

const LUCENE = /([+\-=&|><!(){}\[\]^"~*?:\\/])/g;

// ---------------------------------------------------------------- helpers ---
const escapeLucene = (t) => (!t || !t.trim() ? "" : t.replace(LUCENE, "\\$1"));

const cnj = (nr) => {
  const d = String(nr || "").replace(/\D/g, "");
  return d.length === 20
    ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`
    : String(nr || "");
};

const limpar = (texto, limite = 800) => {
  if (!texto) return "";
  let t = String(texto).replace(/data:image\/[^)"'\s]+/g, ""); // remove imagens base64
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<[^>]+>/g, " "); // remove tags
  t = he.decode(t); // decodifica entidades (&Ccedil; etc.)
  t = t.replace(/\s+/g, " ").trim();
  if (limite && t.length > limite) t = t.slice(0, limite).replace(/\s+\S*$/, "") + "…";
  return t;
};

// Chaves nulas ficam FORA da URL: o portal redireciona para a home se receber o
// texto literal "None"/"null". %20 (e não "+") para espaço, imune a mudança de
// parser no frontend.
const link = (s) => {
  const params = {
    id: s.id_processo_documento,
    sistema_origem: s.sistema_origem,
    tipo: s.tipo,
    id_documento_principal: s.id_documento_principal,
  };
  const qs = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${SITE}/jurisprudencia/?${qs}`;
};

const relator = (s) =>
  s.nome_relator_acordao || s.nome_relator_processo || s.ds_nome || "—";
const orgao = (s) => s.ds_orgao_julgador_colegiado || s.ds_orgao_julgador || "—";

const dataBr = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

// Citação pronta para colar em peça, no padrão forense. Segmentos sem dado são omitidos.
const citacao = (s) => {
  const partes = [`TJ-RO - ${s.ds_classe_judicial || s.tipo || "Julgado"}: ${cnj(s.nr_processo || "")}`];
  const rel = relator(s);
  if (rel !== "—") partes.push(`Relator: ${rel}`);
  const dj = s.dtjulgamento_str || dataBr(s.dtjulgamento);
  if (dj) partes.push(`Data de Julgamento: ${dj}`);
  const org = orgao(s);
  if (org !== "—") partes.push(org);
  const dp = dataBr(s.dtpublicacao);
  if (dp) partes.push(`Data de Publicação: ${dp}`);
  return `(${partes.join(", ")})`;
};

const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Agrega correções "você quis dizer" de TODOS os tokens da consulta. A API devolve
// uma entrada por token e por variante com/sem acento (mesmo offset); usa-se a
// variante que bate com o texto digitado e descartam-se "correções" que só diferem
// por acento do próprio token.
const sugestoes = (data, consulta) => {
  const entradas = (data.suggest || {}).sugestoes || [];
  const grupos = new Map();
  for (const e of entradas) {
    const off = e.offset ?? 0;
    if (!grupos.has(off)) grupos.set(off, []);
    grupos.get(off).push(e);
  }
  const out = [];
  for (const off of [...grupos.keys()].sort((a, b) => a - b)) {
    const grupo = grupos.get(off);
    const e0 =
      grupo.find((e) => consulta.slice(off, off + (e.length ?? 0)) === e.text) || grupo[0];
    const token = e0.text || "";
    for (const e of grupo) {
      const opcao = (e.options || []).find((o) => fold(o.text) !== fold(token));
      if (opcao) {
        out.push(`**${opcao.text}** (para "${token}")`);
        break;
      }
    }
  }
  return out.slice(0, 3);
};

const normTipos = (arr, padrao) => {
  const t = (arr || padrao)
    .map((x) => String(x).toUpperCase())
    .filter((x) => TIPOS_VALIDOS.includes(x));
  return t.length ? t : padrao;
};

// ----------------------------------------------------------- request bodies -
function buildBuscaBody(o) {
  // Escapar ANTES de aspear: na ordem inversa as aspas da frase exata viram
  // \" literais e a API trata os termos como busca solta (OR).
  const c = o.consulta.trim();
  const q = o.termoExato && c ? `"${escapeLucene(c)}"` : escapeLucene(o.consulta);
  // A API espera "tipo" como string ("A,B" p/ OR); array JSON zera os resultados,
  // mesmo com 1 único elemento.
  const fields = { query: q, tipo: o.tipo.join(",") };
  if (o.grau === 1 || o.grau === 2) fields.grau_jurisdicao = String(o.grau);
  // O índice grava classes em CAIXA ALTA e o filtro .raw é sensível a caixa.
  if (o.classe) fields["ds_classe_judicial.raw"] = o.classe.toUpperCase();
  if (o.orgaoColegiado) fields["ds_orgao_julgador_colegiado.raw"] = o.orgaoColegiado;
  if (o.nrProcesso) fields.nr_processo = String(o.nrProcesso).replace(/\D/g, "");
  if (o.dataInicio) fields.dtjulgamento_inicio = o.dataInicio;
  if (o.dataFim) fields.dtjulgamento_fim = o.dataFim;
  return {
    from: (o.pagina - 1) * o.porPagina,
    size: o.porPagina,
    fields,
    sort: ORDENACOES[o.ordenacao] || ORDENACOES.relevantes,
    token: "",
    highlight: HIGHLIGHT,
  };
}

function buildInteiroBody(nrProcesso, tipo) {
  return {
    from: 0,
    size: 50,
    fields: { query: "", nr_processo: String(nrProcesso).replace(/\D/g, ""), tipo: tipo.join(",") },
    sort: [{ dtjulgamento: "desc" }],
    token: "",
  };
}

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

const msgErro = (e) =>
  e.name === "TimeoutError"
    ? "tempo esgotado após 45s — o portal JURIS pode estar lento; tente novamente"
    : e.cause?.code ?? e.cause?.message ?? e.message;

// --------------------------------------------------------------- formatters -
function formatBusca(data, consulta, tipo, ordenacao, pagina, porPagina, filtros = [], nota = "", termoExato = false) {
  const hitsObj = data.hits || {};
  const total = (hitsObj.total || {}).value || 0;
  const hits = hitsObj.hits || [];
  const out = [];
  if (nota) out.push(nota.trimEnd());
  const criterio = termoExato
    ? `contêm a expressão exata "${consulta}"`
    : `contêm ao menos um dos termos de "${consulta}" (busca OR; ementa e acórdão do MESMO julgado contam separado)`;
  out.push(
    `**${total} documento(s)** ${criterio} · tipo: ${tipo.join(", ")} · ordenação: ${ordenacao} · página ${pagina}`
  );
  if (total > 5000 && !termoExato)
    out.push(
      '_Dica: para restringir, use operador AND na consulta (ex.: "dano AND moral") ou termo_exato=true para expressão exata._'
    );

  if (total === 0 || hits.length === 0) {
    if (filtros.length) {
      out.push(
        `\nNenhum resultado com os filtros ativos (${filtros.join("; ")}). ` +
          'Os filtros exigem grafia EXATA e sensível a maiúsculas: classes em CAIXA ALTA (ex.: "APELAÇÃO CÍVEL"), ' +
          'câmaras em Formato de Título (ex.: "1ª Câmara Cível"). Confira a grafia ou repita sem o filtro.'
      );
    } else {
      const sugg = sugestoes(data, consulta);
      out.push(
        sugg.length
          ? `\nNenhum resultado. Você quis dizer: ${sugg.join(", ")}?`
          : "\nNenhum resultado. Tente termos mais amplos ou remova filtros."
      );
    }
    return out.join("\n");
  }

  const inicio = (pagina - 1) * porPagina + 1;
  hits.forEach((h, i) => {
    const s = h._source || {};
    const hl = (h.highlight || {}).ds_modelo_documento;
    const trecho = limpar(hl ? hl[0] : s.ds_modelo_documento || "", 800);
    const t = s.tipo || "documento";
    let rotulo;
    if (t === "EMENTA") rotulo = "Ementa (trecho)";
    else {
      const artigo = ["SENTENÇA", "DECISÃO", "DECISÃO DA PRESIDÊNCIA"].includes(t) ? "da" : "do";
      rotulo = `Trecho ${artigo} ${t} com os termos da busca`;
    }
    const assunto = s.ds_assunto_trf ? ` · Assunto: ${s.ds_assunto_trf}` : "";
    out.push(
      `\n---\n**${inicio + i}. ${s.tipo} · ${s.ds_classe_judicial || ""}**\n` +
        `- Processo: ${cnj(s.nr_processo || "")}\n` +
        `- Relator(a): ${relator(s)}\n` +
        `- Órgão: ${orgao(s)} (${s.grau_jurisdicao}º grau)\n` +
        `- Julgado em: ${s.dtjulgamento_str || s.dtjulgamento || "—"}${assunto}\n` +
        `- Citação: ${citacao(s)}\n` +
        `- Inteiro teor: ${link(s)}\n` +
        `- ${rotulo}: ${trecho || "(sem trecho)"}`
    );
  });
  if (total > pagina * porPagina) {
    if ((pagina + 1) * porPagina <= JANELA_MAXIMA)
      out.push(`\n_(há mais resultados — chame novamente com pagina=${pagina + 1})_`);
    else
      out.push(
        "\n_(há mais resultados, mas o portal só expõe os 10.000 primeiros — refine com filtros ou mude a ordenação)_"
      );
  }
  return out.join("\n");
}

function formatInteiro(data, nrProcesso) {
  const hitsObj = data.hits || {};
  const total = (hitsObj.total || {}).value || 0;
  const hits = hitsObj.hits || [];
  if (!hits.length) return `Nenhum documento encontrado para o processo ${cnj(nrProcesso)}.`;

  // O índice às vezes devolve a mesma peça duplicada (ids distintos, texto idêntico).
  const unicos = [];
  const vistos = new Set();
  for (const h of hits) {
    const s = h._source || {};
    const corpo = limpar(s.ds_modelo_documento || "", 0); // 0 = sem truncar
    const chave = `${s.tipo} ${corpo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push([s, corpo]);
  }

  const s0 = unicos[0][0];
  const out = [
    `**Processo ${cnj(nrProcesso)} — ${s0.ds_classe_judicial || ""}**`,
    `Relator(a): ${relator(s0)} · ${orgao(s0)} · Julgado em ${s0.dtjulgamento_str || s0.dtjulgamento || "—"}`,
    `Citação: ${citacao(s0)}`,
    `Inteiro teor no portal: ${link(s0)}`,
  ];
  if (total > hits.length)
    out.push(
      `⚠️ O processo tem ${total} documentos; vieram os ${hits.length} mais recentes — refine o parâmetro tipo para alcançar os demais.`
    );

  // Orçamento global com teto por peça dinâmico: uma peça sozinha pode usar
  // o orçamento inteiro (há acórdãos de ~80k chars).
  const tetoPeca = Math.max(15000, Math.floor(ORCAMENTO_INTEIRO / Math.max(1, unicos.length)));
  let usado = out.reduce((n, x) => n + x.length, 0);
  for (const [s, corpo] of unicos) {
    const quando = s.dtjulgamento_str || s.dtjulgamento || "";
    const cab = `\n## ${s.tipo}` + (quando ? ` — julgado em ${quando}` : "");
    if (usado >= ORCAMENTO_INTEIRO) {
      out.push(
        "\n_(limite de tamanho da resposta atingido — peças restantes omitidas; chame novamente filtrando por tipo ou abra o link do portal acima)_"
      );
      break;
    }
    let texto = corpo || "(documento sem texto)";
    const teto = Math.min(tetoPeca, ORCAMENTO_INTEIRO - usado);
    if (texto.length > teto) {
      const corte = texto.slice(0, teto).replace(/\s+\S*$/, "");
      texto =
        `${corte}…\n_[peça exibida parcialmente (${corte.length} de ${corpo.length} caracteres) — ` +
        `para o texto integral, chame obter_inteiro_teor_tjro(tipo=["${s.tipo}"]) ou abra o link do portal]_`;
    }
    out.push(`${cab}\n${texto}`);
    usado += cab.length + texto.length;
  }
  return out.join("\n");
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
