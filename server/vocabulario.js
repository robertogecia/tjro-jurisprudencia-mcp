// Vocabulário das ementas que casaram (v1.32.0): realimentação por relevância, 100% no cliente, zero consulta extra.
// O motor do TJRO casa palavras; o que o julgador escreveu com OUTRAS palavras não aparece. Aqui, a página já trazida diz com que
// vocabulário os julgados certos falam, e o corpus local (recibos desta máquina) diz o que é comum a todo julgado. Saída = sugestão para a
// próxima rodada em `grupos`/`excluir`: indício para escolher termos, nunca conclusão sobre a tese. Opt-in (`sugerir_termos`).
import { limpar } from "./lib.js";
import { STOP_SIM } from "./similares.js";
import { listarRecibos } from "./recibos.js";
import { GRAFIAS_RELATOR } from "./relatores.js";

// As palavras de ligação de similares.js estão com acento ("apelação"), mas os tokens são comparados sem acento: aqui as duas pontas se alinham.
const dobra = (t) => String(t).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const STOP = new Set([...STOP_SIM].map(dobra));
const ROMANO = /^[ivxlcdm]+$/;
// Pares que a validação cega de 15/10/2026 (3 rodadas, 90 páginas) marcou como ruído nas páginas de todo tema: institucionais ou de fórmula.
const PARES_RUIDO = new Set("ministerio publico|instituicao financeira|direito penal|ordem judicial|ofensa principio|negocio juridico|razoabilidade proporcionalidade|advocaticios fixados|valor fixado|criminal conformidade|dispositivos relevantes|dispositivos arts|arts jurisprudencia|procedentes pedidos|pedidos formulados|julgou parcialmente|questao consiste|excelentissimo senhor|indenizacao danos|resolucao demandas".split("|"));
// Medido às cegas em 14/10/2026 (40 páginas, 733 itens): 16% das sugestões eram ruído (nomes de magistrados, endereço do fórum) e 25% genéricas
// (fórmulas do cabeçalho do acórdão). Ficam fora: palavras de cabeçalho/fórmula e os nomes de quem assina (campos de relator e presidente da página).
const FORMULAS = new Set("relevantes relevante citados citado citada reais centavos iniciais dois tres quatro cinco quarenta cinquenta cem poder judiciario classe procedimento polo ativo passivo vieram conclusos decido replica relatorio relatório narrou narra narrando alegou alega alegando afirmou afirma afirmando requereu requer requerendo sustentou sustenta sustentando pleiteando pleiteia pleiteou postulou postula aduziu aduz colaciono transcrevo preceitua apresentadas contrarrazoes contrarrazões questoes questões discussao discussão exame decidir razoes razões dispositivo ementa olaria camacho impar ímpar advogado advogados advogada procurador procuradora patrono gabinete avenida pinheiro machado bairro forum fórum distribuicao distribuição vistos relatados discutidos notas taquigraficas taquigráficas desembargadores desembargador desembargadora turma inominado inominados juizado juizados presidente relator relatora julgamentos julgamento acordam acórdão acordao unanimidade sessao sessão virtual ordinaria ordinária extraordinaria data".split(" ").map((w) => w.normalize("NFD").replace(/\p{M}/gu, "")));
/** [[palavra sem acento, palavra como escrita]] (4+ letras, sem número, sem palavra de ligação, sem algarismo romano). */
/** Começa na palavra "Ementa" quando ela aparece nos primeiros 3.000 caracteres (acórdão abre com cabeçalho, gabinete e nomes). */
// 15/10/2026 (medição cega: 30% dos termos úteis): no acórdão do TJRO a ementa vem no FIM; antes, sem "Ementa" no começo, o vocabulário
// saía do cabeçalho (gabinete, endereço, advogados, OAB) e do relatório. Agora: a última "EMENTA" em caixa alta antes do fecho; senão,
// "Ementa" no começo; senão, o RELATÓRIO.
export const semCabecalho = (texto) => {
  const t = String(texto || "");
  const m = /\bementa\b/i.exec(t.slice(0, 3000));
  if (m) return t.slice(m.index);
  let u = -1;
  for (const x of t.matchAll(/\bEMENTA\b/g)) u = x.index;
  if (u > 0) return t.slice(u);
  const r = /\bRELAT[ÓO]RIO\b/.exec(t);
  return r ? t.slice(r.index) : t;
};
export function palavras(texto) {
  const out = [];
  for (const w of String(texto || "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 4) continue;
    const f = dobra(w);
    if (f.length < 4 || /\d/.test(f) || !/^[a-z]+$/.test(f) || STOP.has(f) || FORMULAS.has(f) || ROMANO.test(f)) continue;
    out.push([f, w]);
  }
  return out;
}
const tokens = (texto) => palavras(texto).map((x) => x[0]);
// radical de uma palavra: tira a terminação comum (o/os/a/as/e/es/ar/er/ir/ado/ido/ada/ida) e, não havendo, as 2 últimas letras; mínimo 5
export const radicalDe = (w) => {
  const sem = w.replace(/(ado|ido|ada|ida|ar|er|ir|os|as|es|o|a|e)$/, "");
  const r = sem !== w ? sem : w.slice(0, Math.max(4, w.length - 2));
  return r.length >= 5 ? r : "";
};

export const CABECA_CHARS = 4000;       // só o começo do documento (ementa/relatório): o voto inteiro traria o vocabulário de toda a causa
const CORPUS_MIN = 300, MEMO_MS = 15 * 60 * 1000;                 // abaixo disso a "raridade" no corpus não diz nada
const TERMOS_MAX = 8, PARES_MAX = 8, TRIOS_MAX = 6, VARIANTES_MAX = 4, PAGINA_MIN = 8;
const ordem = (a, b) => (a < b ? -1 : a > b ? 1 : 0);   // ordem de código, igual ao sorted() do Python
const q6 = (x) => Math.round(x * 1e6);                   // log() de V8 e do libm podem diferir no último bit: compara quantizado

/** {N, df: Map} sobre o começo de cada recibo de EMENTA/ACÓRDÃO. */
let memo = null;
export function corpusLocal(agora = Date.now(), recibos = null) {
  if (!recibos && memo && agora - memo.t < MEMO_MS) return memo.v;
  const rs = recibos || listarRecibos();
  const df = new Map();
  let N = 0;
  for (const r of rs) {
    const t = String(r.tipo || "").toUpperCase();
    if (t !== "EMENTA" && t !== "ACÓRDÃO") continue;
    N++;
    for (const w of new Set(tokens(semCabecalho(r.texto).slice(0, CABECA_CHARS)))) df.set(w, (df.get(w) || 0) + 1);
  }
  const v = { N, df };
  if (!recibos) memo = { t: agora, v };
  return v;
}

/** Palavras (4+ letras, sem acento) da consulta livre e dos grupos: para não sugerir o que o usuário já pediu. */
export const termosDaBusca = (consulta, grupos) => {
  const s = new Set(tokens(String(consulta || "")));
  for (const g of Array.isArray(grupos) ? grupos : []) for (const t of Array.isArray(g) ? g : [g]) for (const w of tokens(String(t || ""))) s.add(w);
  return s;
};

/** Palavras dos nomes de quem assina (relator, relator do acórdão, juiz, presidente) nos campos da página: nunca são vocabulário do assunto. */
export const nomesDaPagina = (hits) => {
  const s = new Set();
  for (const h of hits || []) {
    const x = h._source || {};
    for (const c of [x.nome_relator_acordao, x.nome_relator_processo, x.ds_nome, x.nmpresidente]) for (const w of tokens(c || "")) s.add(w);
  }
  for (const k of Object.keys(GRAFIAS_RELATOR)) for (const w of k.split(" ")) if (w.length >= 4) s.add(w);
  return s;
};

export function sugerirVocabulario(hits, { consulta = "", grupos = null, relator = "" } = {}, corpus = corpusLocal()) {
  const docs = (hits || []).map((h) => palavras(semCabecalho(limpar((h._source || {}).ds_modelo_documento || "", 0)).slice(0, CABECA_CHARS)));
  const n = docs.length;
  if (n < PAGINA_MIN) return { n, pouco: true };
  const nomes = nomesDaPagina(hits);
  const meus = termosDaBusca(consulta, grupos);
  const radicaisMeus = [...meus].map(radicalDe).filter(Boolean);
  const dfp = new Map(), dfPar = new Map(), dfTrio = new Map(), forma = new Map();   // forma: palavra sem acento -> como foi escrita (a mais frequente)
  const contaForma = new Map();
  for (const d of docs) {
    for (const [f, o] of d) { const k = `${f}\u0000${o}`; contaForma.set(k, (contaForma.get(k) || 0) + 1); }
    const ws = d.map((x) => x[0]);
    for (const w of new Set(ws)) dfp.set(w, (dfp.get(w) || 0) + 1);
    const ps = new Set(), ts = new Set();
    for (let i = 0; i + 1 < ws.length; i++) if (ws[i] !== ws[i + 1]) ps.add(`${ws[i]} ${ws[i + 1]}`);
    if (relator) for (let i = 0; i + 2 < ws.length; i++) ts.add(`${ws[i]} ${ws[i + 1]} ${ws[i + 2]}`);
    for (const p of ps) dfPar.set(p, (dfPar.get(p) || 0) + 1);
    for (const p of ts) dfTrio.set(p, (dfTrio.get(p) || 0) + 1);
  }
  for (const [k, c] of [...contaForma].sort((a, b) => b[1] - a[1] || ordem(a[0], b[0]))) { const [f, o] = k.split("\u0000"); if (!forma.has(f)) forma.set(f, o); }
  const mostra = (p) => p.split(" ").map((w) => forma.get(w) || w).join(" ");
  const temCorpus = corpus.N >= CORPUS_MIN;
  const idf = (w) => Math.log((corpus.N + 1) / ((corpus.df.get(w) || 0) + 1));
  const minPag = Math.max(3, Math.ceil(0.2 * n));
  const jaPedido = (w) => meus.has(w) || nomes.has(w) || radicaisMeus.some((r) => w.startsWith(r));
  const top = (arr, k) => arr.sort((a, b) => b[2] - a[2] || ordem(a[0], b[0])).slice(0, k).map(([t, c]) => [mostra(t), c]);
  const caract = temCorpus
    ? top([...dfp].filter(([w, c]) => w.length >= 5 && c >= minPag && !jaPedido(w)).map(([w, c]) => [w, c, q6((c / n) * idf(w))]), TERMOS_MAX)
    : [];
  const minPar = Math.max(3, Math.ceil(0.25 * n));
  const pares = temCorpus
    ? top([...dfPar].filter(([p, c]) => c >= minPar && !PARES_RUIDO.has(p) && !p.split(" ").some(jaPedido)).map(([p, c]) => [p, c, q6((c / n) * (p.split(" ").reduce((a, w) => a + idf(w), 0) / 2))]), PARES_MAX)
    : [];
  const trios = relator && temCorpus
    ? top([...dfTrio].filter(([p, c]) => c >= Math.max(3, Math.ceil(0.3 * n)) && !p.split(" ").some(jaPedido)).map(([p, c]) => [p, c, q6((c / n) * (p.split(" ").reduce((a, w) => a + idf(w), 0) / 3))]), TRIOS_MAX)
    : [];
  const variantes = [];
  for (const m of [...meus].sort(ordem)) {
    const radical = radicalDe(m);
    if (!radical) continue;
    const vs = [...dfp].filter(([w, c]) => w !== m && w.startsWith(radical) && w.length - radical.length <= 8 && c >= 2).sort((a, b) => b[1] - a[1] || ordem(a[0], b[0])).slice(0, VARIANTES_MAX);
    if (vs.length) variantes.push({ termo: forma.get(m) || m, radical, variantes: vs.map(([w, c]) => [forma.get(w) || w, c]) });
  }
  return { n, N: corpus.N, temCorpus, caract, pares, trios, variantes };
}

export function blocoVocabulario(res, { relator = "" } = {}) {
  if (!res) return "";
  if (res.pouco)
    return `\n**Vocabulário:** só ${res.n} documento(s) na página; são poucos para sugerir termos (use \`por_pagina\` maior, com a mesma consulta).\n`;
  const L = [`\n**Vocabulário das ementas desta página** (${res.n} documentos${res.temCorpus ? `; raridade medida em ${res.N} documentos já lidos nesta máquina` : "; corpus local pequeno demais para medir raridade"}; zero consulta extra). Sugestão para a próxima rodada, indício e não conclusão.`];
  const fmt = (l) => l.map(([t, c]) => `${t} (${c}/${res.n})`).join(", ");
  // 15/10/2026 (validação cega, 30 páginas novas): palavra solta útil em 18 de 222; par de palavras em 54 de 122. Só os pares saem.
  if (res.pares.length) L.push(`- Pares de palavras que se repetem: ${res.pares.map(([t, c]) => `«${t}» (${c}/${res.n})`).join(", ")}`);
  if (res.trios && res.trios.length) L.push(`- Expressões recorrentes${relator ? ` de ${relator}` : ""} (3 palavras em sequência, sem as de ligação): ${res.trios.map(([t, c]) => `«${t}» (${c}/${res.n})`).join(", ")}`);
  for (const v of res.variantes) L.push(`- Variantes de «${v.termo}» nos resultados: ${fmt(v.variantes)}; para pegar todas, \`${v.radical}*\` em \`grupos\``);
  if (L.length === 1) L.push("- Nada passou o corte de frequência (20% da página para termos, 25% para pares).");
  L.push("Como usar: 2 a 4 desses termos em `grupos`, como alternativas (OU) ao seu termo; se forem ruído, em `excluir`. Cada rodada gasta uma consulta.\n");
  return L.join("\n");
}

/** "Mais como este": termos do documento-modelo (id na página) que o distinguem do resto do corpus local, para a 2ª rodada em `grupos`. Zero consulta. */
export function termosQueDistinguem(hits, idAlvo, { consulta = "", grupos = null } = {}, corpus = corpusLocal()) {
  const alvo = (hits || []).find((h) => String((h._source || {}).id_processo_documento ?? "") === String(idAlvo || "").trim());
  if (!alvo || corpus.N < CORPUS_MIN) return [];
  const ps = palavras(semCabecalho(limpar((alvo._source || {}).ds_modelo_documento || "", 0)).slice(0, CABECA_CHARS));
  const nomes = nomesDaPagina(hits);
  const tf = new Map(), forma = new Map();
  for (const [f, o] of ps) { tf.set(f, (tf.get(f) || 0) + 1); if (!forma.has(f)) forma.set(f, o); }
  const meus = termosDaBusca(consulta, grupos);
  const radicais = [...meus].map(radicalDe).filter(Boolean);
  const idf = (w) => Math.log((corpus.N + 1) / ((corpus.df.get(w) || 0) + 1));
  return [...tf].filter(([w]) => w.length >= 5 && !meus.has(w) && !nomes.has(w) && !radicais.some((r) => w.startsWith(r)))
    .map(([w, c]) => [w, q6((1 + Math.log(c)) * idf(w))])
    .sort((a, b) => b[1] - a[1] || ordem(a[0], b[0])).slice(0, 8).map(([w]) => forma.get(w));
}

// ---- ranking BM25 de recibos por uma consulta em linguagem natural (usado por buscar_recibos_tjro quando o E de todas as palavras dá zero) ----
// Medido em 15/10/2026: o E de todas as palavras deu ZERO em 40 relatos de fatos escritos por modelo (20 + 20 de amostra nova). Este
// ranking (palavras + pares vizinhos, sobre a ementa) pôs o acórdão de origem no top 10 em 17 de 20 na amostra de escolha e em 16 de 20
// (top 3: 12) na amostra nova; sem os pares, 15 de 20; só as 5 ou 8 palavras de maior idf, 5 e 9 de 20 (cortar a consulta piora). Literatura: BM25 é linha de base forte em recuperação de casos (COLIEE) e a consulta booleana
// sofre com vocabulário diferente (Blair e Maron, 1985).
const IDX_RANK = new Map();
function docRank(r) {
  const k = `${r.id_documento}:${(r.texto || "").length}`;
  let v = IDX_RANK.get(k);
  if (!v) {
    if (IDX_RANK.size > 20000) IDX_RANK.clear();
    const t = tokens(semCabecalho(r.texto).slice(0, 6000));
    const tf = new Map(), tfb = new Map();
    for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
    for (let i = 0; i + 1 < t.length; i++) { const b = `${t[i]}_${t[i + 1]}`; tfb.set(b, (tfb.get(b) || 0) + 1); }
    v = { len: t.length, tf, tfb };
    IDX_RANK.set(k, v);
  }
  return v;
}
export function rankearPorConsulta(consulta, recibos, limite = 10) {
  const q = tokens(String(consulta || ""));
  if (q.length < 3 || !recibos.length) return [];
  const qb = [];
  for (let i = 0; i + 1 < q.length; i++) qb.push(`${q[i]}_${q[i + 1]}`);
  const docs = recibos.map((r) => ({ r, d: docRank(r) }));
  const N = docs.length, avg = docs.reduce((a, x) => a + x.d.len, 0) / N || 1;
  const df = new Map(), dfb = new Map();
  for (const w of new Set(q)) { let c = 0; for (const x of docs) if (x.d.tf.has(w)) c++; df.set(w, c); }
  for (const w of new Set(qb)) { let c = 0; for (const x of docs) if (x.d.tfb.has(w)) c++; dfb.set(w, c); }
  const K = 1.2, B = 0.75;
  const peso = (f, L) => (f * (K + 1)) / (f + K * (1 - B + (B * L) / avg));
  const out = [];
  for (const { r, d } of docs) {
    let sc = 0;
    for (const w of new Set(q)) { const f = d.tf.get(w); if (f) sc += Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5)) * peso(f, d.len); }
    for (const w of new Set(qb)) { const f = d.tfb.get(w); if (f) sc += 1.5 * Math.log(1 + (N - dfb.get(w) + 0.5) / (dfb.get(w) + 0.5)) * peso(f, d.len); }
    if (sc > 0) out.push([r, q6(sc)]);
  }
  const dt = (r) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(r.data_julgamento || "")); return m ? `${m[3]}${m[2]}${m[1]}` : ""; };
  out.sort((a, b) => b[1] - a[1] || (dt(b[0]) > dt(a[0]) ? 1 : dt(b[0]) < dt(a[0]) ? -1 : 0) || ordem(String(a[0].id_documento), String(b[0].id_documento)));
  return out.slice(0, limite);
}
