// v1.42.3 (relato de 04/11/2026, seção 2): sem saber quantos documentos o índice tem por órgão e ano,
// "zero resultado" vira "não há julgados". Esta ferramenta conta o que o índice do portal TEM; não diz
// quantos julgamentos existem de fato.
import { buildBuscaBody, normalizarOrgao } from "./lib.js";

const buckets = (data, k) => ((((data || {}).aggregations || {})[k] || {}).buckets || []).filter((b) => b && b.doc_count > 0);
const chave = (b) => (Array.isArray(b.key) ? b.key.join(" ") : String(b.key)).trim() || "(sem cadastro)";
const total = (data) => ((((data || {}).hits || {}).total || {}).value) || 0;

export function anosDe(data) {
  const m = new Map();
  for (const b of buckets(data, "datas_julgamento")) {
    const ano = typeof b.key === "number" ? new Date(b.key).getUTCFullYear() : String(b.key_as_string || b.key).slice(0, 4);
    m.set(String(ano), (m.get(String(ano)) || 0) + b.doc_count);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function formatCobertura(tipo, painel, porOrgao) {
  const out = [`**Cobertura do índice do portal JURIS, tipo ${tipo}** (contagem de documentos INDEXADOS; não é o total de julgamentos que existem).`];
  if (painel) {
    out.push(`Total no índice para o tipo: ${total(painel)}.`);
    const orgs = [...buckets(painel, "orgaos_julgadores"), ...buckets(painel, "orgaos_julgadores_colegiados")]
      .map((b) => [chave(b), b.doc_count]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    if (orgs.length) out.push("Órgãos (maiores primeiro; o portal devolve só os primeiros): " + orgs.map(([k, c]) => `${k} ${c}`).join(" · "));
    const an = anosDe(painel);
    if (an.length) out.push("Por ano (tudo): " + an.map(([a, c]) => `${a}: ${c}`).join(" · "));
  }
  for (const { orgao, normalizado, data } of porOrgao || []) {
    const t = total(data);
    const an = anosDe(data);
    out.push(`- ${orgao}${normalizado ? ` (usado como "${normalizado}")` : ""}: ${t} documentos` + (an.length ? ` · ${an.map(([a, c]) => `${a}: ${c}`).join(" · ")}` : ""));
    if (t === 0) out.push("  ⚠️ Zero: ou o órgão não existe com esta grafia, ou não há nada indexado dele neste tipo. Confira a grafia contra a lista de órgãos acima; zero aqui NÃO prova que não houve julgamentos.");
  }
  out.push("\nLeitura: ano com poucos documentos ao lado de anos cheios indica indexação esparsa; nesse caso, busca com zero resultado não prova ausência de julgado.");
  return out.join("\n");
}

export async function diagnosticoCobertura({ tipo, orgaos, post }) {
  const t = String(tipo || "SENTENÇA").toUpperCase();
  const base = (orgao) => buildBuscaBody({ consulta: "", tipo: [t], orgaoColegiado: orgao, pagina: 1, porPagina: 1, ordenacao: "relevantes" });
  const lista = (orgaos || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
  const painel = lista.length ? null : await post(base(undefined));
  const porOrgao = [];
  for (const o of lista) {
    const n = normalizarOrgao(o);
    porOrgao.push({ orgao: o, normalizado: n !== o ? n : "", data: await post(base(n)) });
  }
  return formatCobertura(t, painel, porOrgao);
}
