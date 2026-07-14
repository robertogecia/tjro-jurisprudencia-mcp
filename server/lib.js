/**
 * Funções puras do servidor MCP TJRO — sem I/O de rede, sem estado.
 * Separadas de index.js para permitir testes automatizados diretos
 * (index.js conecta o transporte MCP no import e não pode ser importado em teste).
 */
import he from "he";

export const SITE = "https://juris.tjro.jus.br";

export const TIPOS_VALIDOS = [
  "ACÓRDÃO",
  "EMENTA",
  "DECISÃO",
  "DECISÃO DA PRESIDÊNCIA",
  "SENTENÇA",
  "VOTO",
  "RELATÓRIO",
];

export const HIGHLIGHT = {
  type: "plain",
  number_of_fragments: 1,
  fragment_size: 3000,
  require_field_match: "true",
  pre_tags: ["«"],
  post_tags: ["»"],
  fields: [{ ds_modelo_documento: { number_of_fragments: 1 } }],
};

export const ORDENACOES = {
  relevantes: [{ _score: "desc" }, { dtjulgamento: "desc" }],
  recentes: [{ dtjulgamento: "desc" }, { _score: "desc" }],
  antigos: [{ dtjulgamento: "asc" }, { _score: "desc" }],
};

// O Elasticsearch do portal não pagina além dos 10.000 primeiros resultados.
export const JANELA_MAXIMA = 10000;

// Orçamento máximo de caracteres da resposta do inteiro teor (evita afogar o contexto).
export const ORCAMENTO_INTEIRO = 50000;

const LUCENE = /([+\-=&|><!(){}\[\]^"~*?:\\/])/g;

// ---------------------------------------------------------------- helpers ---
export const escapeLucene = (t) => (!t || !t.trim() ? "" : t.replace(LUCENE, "\\$1"));

export const cnj = (nr) => {
  const d = String(nr || "").replace(/\D/g, "");
  return d.length === 20
    ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`
    : String(nr || "");
};

export const limpar = (texto, limite = 800) => {
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
export const link = (s) => {
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

export const relator = (s) =>
  s.nome_relator_acordao || s.nome_relator_processo || s.ds_nome || "—";
export const orgao = (s) => s.ds_orgao_julgador_colegiado || s.ds_orgao_julgador || "—";

export const dataBr = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

// Citação pronta para colar em peça, no padrão forense. Segmentos sem dado são omitidos.
export const citacao = (s) => {
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

export const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Agrega correções "você quis dizer" de TODOS os tokens da consulta. A API devolve
// uma entrada por token e por variante com/sem acento (mesmo offset); usa-se a
// variante que bate com o texto digitado e descartam-se "correções" que só diferem
// por acento do próprio token.
export const sugestoes = (data, consulta) => {
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

export const normTipos = (arr, padrao) => {
  const t = (arr || padrao)
    .map((x) => String(x).toUpperCase())
    .filter((x) => TIPOS_VALIDOS.includes(x));
  return t.length ? t : padrao;
};

// ----------------------------------------------------------- request bodies -
export function buildBuscaBody(o) {
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

export function buildInteiroBody(nrProcesso, tipo) {
  return {
    from: 0,
    size: 50,
    fields: { query: "", nr_processo: String(nrProcesso).replace(/\D/g, ""), tipo: tipo.join(",") },
    sort: [{ dtjulgamento: "desc" }],
    token: "",
  };
}

export const msgErro = (e) =>
  e.name === "TimeoutError"
    ? "tempo esgotado após 45s — o portal JURIS pode estar lento; tente novamente"
    : e.cause?.code ?? e.cause?.message ?? e.message;

// --------------------------------------------------------------- formatters -
export function formatBusca(data, consulta, tipo, ordenacao, pagina, porPagina, filtros = [], nota = "", termoExato = false) {
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

export function formatInteiro(data, nrProcesso) {
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
    const chave = `${s.tipo} ${corpo}`;
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
