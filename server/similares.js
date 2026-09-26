// Julgados SIMILARES a um resultado da própria página, no cliente, sem consulta
// extra: o portal ignora corpo customizado (more_like_this, agregações — medido em
// 26/09/2026), então a semelhança é calculada aqui, sobre o texto que a busca já
// trouxe (até 250 documentos por consulta). Cosseno entre vetores TF-IDF de
// palavras (sem acento, minúsculas, 4+ letras, sem as palavras de forma comuns
// a todo acórdão). Serve para achar, entre os resultados, os que tratam do MESMO
// fato/tese que um julgado bom — indício para escolher o que ler, nunca prova.
import { limpar, idDocumento } from "./lib.js";

const STOP = new Set(
  (
    "para pela pelo pelos pelas como mais pois sobre entre sendo seja sejam este esta estes estas esse essa " +
    "isso isto aquele aquela quando onde qual quais cujo cuja cujos cujas assim ainda também porém contudo " +
    "todavia entretanto portanto logo então apenas mesmo mesma mesmos mesmas outro outra outros outras cada " +
    "todo toda todos todas nada tudo muito muita muitos muitas pouco pouca desde após antes depois durante " +
    "conforme segundo mediante perante contra através acerca junto face razão termos nos nas dos das uma uns " +
    "umas pelo caso autos processo recurso apelação apelante apelado agravo agravante agravado relator relatora " +
    "desembargador desembargadora juiz juízo vara comarca tribunal justiça rondônia rondonia estado porto velho " +
    "acórdão acordam magistrados câmara cível especial turma recursal unanimidade voto votos sessão julgamento " +
    "julgado julgada decisão decisões sentença sentenca parte partes autor autora réu ré requerente requerido " +
    "requerida ação acao artigo artigos inciso parágrafo código civil processo processual constituição federal " +
    "nesse nessa neste nesta deste desta desse dessa pelo pela sido foram será serão seria seriam tendo haver " +
    "havendo houve fica ficam ficou deve devem devendo pode podem podendo forma modo sentido entendimento " +
    "presente presentes referido referida referidos referidas respectivo respectiva ementa relatório dispositivo " +
    "provimento provido desprovido improvido conhecido conhecimento mérito preliminar preliminares fundamento " +
    "fundamentos fundamentação demais outrossim ademais igualmente inclusive além aliás afinal"
  ).split(/\s+/)
);

export const tokens = (texto) => {
  const t = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const out = [];
  for (const w of t.split(/[^a-z0-9]+/)) if (w.length >= 4 && !/^\d+$/.test(w) && !STOP.has(w)) out.push(w);
  return out;
};

function vetor(toks, idf) {
  const tf = new Map();
  for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
  const v = new Map();
  let norma = 0;
  for (const [w, n] of tf) {
    const p = (1 + Math.log(n)) * (idf.get(w) || 0);
    if (p > 0) {
      v.set(w, p);
      norma += p * p;
    }
  }
  return { v, norma: Math.sqrt(norma) };
}

function cosseno(a, b) {
  if (!a.norma || !b.norma) return 0;
  let s = 0;
  const [menor, maior] = a.v.size <= b.v.size ? [a, b] : [b, a];
  for (const [w, p] of menor.v) {
    const q = maior.v.get(w);
    if (q) s += p * q;
  }
  return s / (a.norma * b.norma);
}

// Devolve { hits (alvo primeiro, depois por semelhança decrescente), scores: Map(id -> 0..1),
// alvo } ou { alvoNaoEncontrado: true }.
export function ordenarPorSimilaridade(hits, idAlvo) {
  const alvoStr = String(idAlvo || "").trim();
  const lista = hits || [];
  const iAlvo = lista.findIndex((h) => String(idDocumento(h._source || {}) || "") === alvoStr);
  if (iAlvo < 0) return { alvoNaoEncontrado: true };
  const docs = lista.map((h) => tokens(limpar((h._source || {}).ds_modelo_documento || "", 0)));
  const df = new Map();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  const idf = new Map();
  for (const [w, n] of df) idf.set(w, Math.log((1 + N) / (1 + n)) + 1);
  const vs = docs.map((d) => vetor(d, idf));
  const scores = new Map();
  const ordem = [];
  lista.forEach((h, i) => {
    if (i === iAlvo) return;
    const sc = cosseno(vs[iAlvo], vs[i]);
    scores.set(i, sc);
    ordem.push(i);
  });
  ordem.sort((a, b) => scores.get(b) - scores.get(a) || a - b);
  const porId = new Map();
  for (const i of ordem) porId.set(String(idDocumento(lista[i]._source || {}) || `#${i}`), scores.get(i));
  return { hits: [lista[iAlvo], ...ordem.map((i) => lista[i])], scores: porId, alvo: lista[iAlvo] };
}

// Nota para o cabeçalho da busca: o alvo e os 10 mais parecidos, com a semelhança.
export function notaSimilares(res, idAlvo, inicio = 1) {
  if (res.alvoNaoEncontrado)
    return (
      `similares_a="${idAlvo}": esse id não está entre os documentos desta página, então a ordem ficou a da busca. ` +
      "A semelhança é calculada só sobre a página trazida: repita a busca que trouxe o documento (mesma consulta, filtros e página, por_pagina alto) e passe o id dele.\n"
    );
  const s = res.alvo._source || {};
  const top = [...res.scores.entries()].slice(0, 10);
  // O alvo ocupa a 1ª posição da página reordenada; o 1º similar é o nº seguinte.
  const linhas = top.map(([id, sc], k) => `nº ${inicio + k + 2} (id ${id}): ${Math.round(sc * 100)}%`);
  return (
    `Similares a id ${idAlvo} (${s.tipo || "documento"} · ${s.ds_classe_judicial || ""} · ${s.dtjulgamento_str || ""}): a página foi REORDENADA no cliente pela semelhança do texto ` +
    `com esse documento (cosseno TF-IDF sobre os ${res.hits.length} documentos trazidos; zero consulta extra). O nº 1 é o próprio; ` +
    `depois, do mais ao menos parecido: ${linhas.join(", ")}. Semelhança de palavras não é semelhança de tese: ementa e acórdão do mesmo julgado ` +
    "pontuam alto entre si, e um julgado do mesmo assunto com vocabulário diferente pontua baixo. Indício para escolher o que ler.\n"
  );
}
