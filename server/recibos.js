// Recibos locais (v1.10.0): o que esta máquina já leu do TJRO, sem tocar no portal.
// `obter_inteiro_teor_tjro` grava um JSON por documento em ~/.tjro-jurisprudencia-recibos
// (id, número, tipo, data, texto e custódia). Aqui eles viram (1) fonte do verificador de
// citação — zero requisição quando o acórdão já foi lido — e (2) uma busca local, no
// molde do `buscar_recibos_trt14`: com o WAF do JURIS contando VOLUME em poucos minutos,
// reabrir um acórdão da semana passada para citá-lo de novo é cota jogada fora.
// Zero resultado aqui NUNCA é "não localizado": só cobre o que já passou por esta máquina.
import fs from "node:fs";
import path from "node:path";
import { dirRecibos, cnj, link, relator, extrairOrgaoComOrigem, extrairRelatorDoTexto } from "./lib.js";
import { norm1, camposAlheios, CUSTODIA_VERSAO } from "./custodia.js";

// memo por (arquivo, mtime): 600+ recibos de até 100 KB não se releem a cada chamada.
const MEMO = new Map();
const nomeValido = (n) => /^\d{1,20}\.json$/.test(n);   // norma-<id>.json fica de fora

export function reciboIntegro(r) {
  return !!r && typeof r === "object" && /^\d{1,20}$/.test(String(r.id_documento || "")) && typeof r.texto === "string" && r.texto.length > 0;
}

/** Todos os recibos íntegros da pasta, mais recentes primeiro. */
export function listarRecibos(pasta = dirRecibos()) {
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter(nomeValido); } catch { return []; }
  const out = [];
  for (const n of nomes) {
    const cam = path.join(pasta, n);
    let mt;
    try { mt = fs.statSync(cam).mtimeMs; } catch { continue; }
    let memo = MEMO.get(cam);
    if (!memo || memo.mt !== mt) {
      let r = null;
      try { r = JSON.parse(fs.readFileSync(cam, "utf8")); } catch { r = null; }
      if (!reciboIntegro(r)) { MEMO.delete(cam); continue; }
      memo = { mt, r, tn: norm1(r.texto) };
      MEMO.set(cam, memo);
    }
    out.push(memo);
  }
  out.sort((a, b) => b.mt - a.mt);
  return out.map((m) => ({ ...m.r, _tn: m.tn }));
}
export function _limparMemoParaTeste() { MEMO.clear(); }

export const soDigitos = (n) => String(n || "").replace(/\D/g, "");

export function reciboPorId(id, pasta = dirRecibos()) {
  const i = String(id || "").trim();
  if (!/^\d{1,20}$/.test(i)) return null;
  try {
    const r = JSON.parse(fs.readFileSync(path.join(pasta, `${i}.json`), "utf8"));
    return reciboIntegro(r) ? r : null;
  } catch { return null; }
}

/** Recibos do processo (20 dígitos exatos, ou prefixo quando o número veio incompleto). */
export function recibosDoProcesso(numero, pasta = dirRecibos()) {
  const d = soDigitos(numero);
  if (d.length < 7) return [];
  return listarRecibos(pasta).filter((r) => {
    const nd = soDigitos(r.nr_processo);
    return nd && (nd === d || (d.length < 20 && nd.startsWith(d)));
  });
}

// ------------------------------------------------------------------ busca local ---
const STOP = new Set("a o as os e de da do das dos em no na nos nas um uma por para com que se ao aos à às ou não nao sob sobre".split(" "));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const W = "a-z0-9";
/** regex de termo sobre texto norm1 (minúsculas, sem acento, mesmo comprimento do bruto): palavra inteira;
 * `*` no fim = prefixo; espaço = frase. */
export function regexTermo(termo) {
  const t = norm1(String(termo || "")).trim();
  if (!t) return null;
  const partes = t.split(/\s+/).map((p) => {
    const pref = p.endsWith("*");
    const nucleo = p.replace(/\*+$/, "").replace(new RegExp(`[^${W}]+`, "g"), " ").trim().split(" ").filter(Boolean);
    if (!nucleo.length) return null;
    const corpo = nucleo.map(esc).join(`[^${W}]+`);
    return pref ? `${corpo}[${W}]*` : corpo;
  }).filter(Boolean);
  if (!partes.length) return null;
  return new RegExp(`(?<![${W}])` + partes.join(`[^${W}]+`) + `(?![${W}])`, "g");
}
const conta = (re, tn) => { if (!re) return 0; let n = 0; re.lastIndex = 0; while (re.exec(tn)) n++; return n; };

export const RECIBOS_LIMITE_MAX = 20, GRUPOS_MAX = 6, TERMOS_POR_GRUPO_MAX = 12;

export function buscarRecibos(consulta, grupos, limite = 10, pasta = dirRecibos()) {
  const palavras = norm1(String(consulta || "")).split(/[^a-z0-9*]+/).filter((p) => p && !STOP.has(p.replace(/\*+$/, "")));
  const gs = Array.isArray(grupos) ? grupos.filter((g) => Array.isArray(g) && g.length).slice(0, GRUPOS_MAX)
    .map((g) => g.map((t) => String(t || "").trim()).filter(Boolean).slice(0, TERMOS_POR_GRUPO_MAX)).filter((g) => g.length) : [];
  if (!palavras.length && !gs.length) return "BUSCA LOCAL NÃO REALIZADA — informe `consulta` (palavras) ou `grupos` (sinônimos).";
  const lim = Math.max(1, Math.min(Number(limite) || 10, RECIBOS_LIMITE_MAX));
  const todos = listarRecibos(pasta);
  const resP = palavras.map(regexTermo).filter(Boolean);
  const resG = gs.map((g) => g.map(regexTermo).filter(Boolean)).filter((g) => g.length);
  const achados = [];
  for (const r of todos) {
    const tn = r._tn;
    if (!resP.every((re) => conta(re, tn) > 0)) continue;
    if (!resG.every((g) => g.some((re) => conta(re, tn) > 0))) continue;
    let soma = 0;
    for (const re of resP) soma += conta(re, tn);
    for (const g of resG) for (const re of g) soma += conta(re, tn);
    const peso = soma / Math.log(tn.length + 10);
    achados.push([peso, dataIso(r.data_julgamento), r]);
  }
  achados.sort((a, b) => (b[0] - a[0]) || (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const termosMostrados = [...palavras, ...gs.flat()].join(", ");
  const linhas = [
    `**Recibos locais do TJRO — ${achados.length} de ${todos.length} documento(s) já lidos nesta máquina atendem a «${termosMostrados}» · ZERO requisição ao portal**`,
    "⚠️ Isto NÃO é pesquisa no acervo do TJRO: só olha o que obter_inteiro_teor_tjro já trouxe para esta máquina. Zero aqui NUNCA é \"não localizado\" — para isso, buscar_jurisprudencia_tjro. Classe e câmara do índice só existem em recibos gravados a partir da v1.10.0; nos antigos, a câmara vem do fecho do texto.",
    "",
  ];
  if (!todos.length) linhas.push(`_(nenhum recibo em ${pasta})_`);
  achados.slice(0, lim).forEach(([, , r], i) => {
    const s = { nr_processo: r.nr_processo, id_processo_documento: r.id_documento, tipo: r.tipo, ds_classe_judicial: r.classe,
      nome_relator_acordao: r.relator_indice, ds_orgao_julgador_colegiado: r.orgao_indice };
    const org = extrairOrgaoComOrigem(r.texto);
    const orgaoTxt = org ? `${org.orgao} (${org.origem})` : (r.orgao_indice ? `${r.orgao_indice} (índice)` : "órgão não identificado");
    const rel = relator(s) !== "—" ? relator(s) : extrairRelatorDoTexto(r.texto) || "—";
    linhas.push(`${i + 1}. ${r.tipo || "?"}${r.classe ? ` · ${r.classe}` : ""} · ${orgaoTxt} · julgado em ${r.data_julgamento || "?"} · Rel. ${rel} · ${cnj(r.nr_processo)} · id ${r.id_documento} · link ${link(s)}`);
    const re = resP[0] || (resG[0] && resG[0][0]);
    const tre = trechoEmVolta(r.texto, r._tn, re);
    if (tre) linhas.push(`   «…${tre}…»`);
    linhas.push(`   recibo lido do portal em ${String(r.obtido_em || "?").slice(0, 16).replace("T", " ")}${r.trechos_transcritos ? ` · custódia: ${r.trechos_transcritos.length} transcrição(ões)${r.trecho_divergente ? ", voto divergente" : ""}` : " · sem campos de custódia (recibo antigo)"}`);
  });
  if (achados.length > lim) linhas.push(`\n_(mais ${achados.length - lim} recibo(s) atendem; aumente \`limite\` até ${RECIBOS_LIMITE_MAX} ou refine os termos)_`);
  linhas.push("\nPara o teor completo: obter_inteiro_teor_tjro(nr_processo) — se foi lido há menos de 7 dias, vem do cache sem gastar consulta. Para conferir uma frase antes das aspas: verificar_citacao_tjro(id_documento, trecho).");
  return linhas.join("\n");
}

// "dd/mm/aaaa" (recibo) ou ISO → "aaaa-mm-dd", para ordenar; vazio quando não há data.
function dataIso(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d || ""));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const i = /^(\d{4}-\d{2}-\d{2})/.exec(String(d || ""));
  return i ? i[1] : "";
}

function trechoEmVolta(texto, tn, re) {
  if (!re) return "";
  re.lastIndex = 0;
  const m = re.exec(tn);
  if (!m) return "";
  // norm1 preserva o comprimento: a posição no normalizado é a posição no bruto.
  const a = Math.max(0, m.index - 140), b = Math.min(texto.length, m.index + m[0].length + 140);
  return texto.slice(a, b).replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------ recálculo da custódia ---
const CAMPOS_CUSTODIA = ["trechos_transcritos", "trecho_divergente", "texto_voz_propria"];
const NORMALIZACAO = "trechos em bruto, recortados de `texto` — normalize com a sua própria função";
const cedeAoEventLoop = () => new Promise((r) => setImmediate(r));

/**
 * Refaz a custódia dos recibos gravados por uma heurística diferente da atual (sem `custodia_v` ou com número
 * diferente de CUSTODIA_VERSAO). Só os campos que camposAlheios produz mudam; texto, id, tipo e data ficam como estão.
 * Atômico (arquivo temporário + rename) e sem sobrescrever um recibo que mudou desde a leitura (outro processo pode
 * estar gravando o mesmo). `forcar` recalcula todos, ignorando o carimbo (harness). `gravar:false` só conta.
 * Assíncrono em blocos: no 1º início depois de uma atualização são centenas de arquivos, e a busca do usuário não
 * pode esperar por isso.
 */
export async function recalcularRecibos({ pasta = dirRecibos(), gravar = true, forcar = false, bloco = 25 } = {}) {
  const r = { total: 0, desatualizados: 0, alterados: 0, regravados: 0, ignorados: 0, mudancas: [] };
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter(nomeValido); } catch { return r; }
  let k = 0;
  for (const n of nomes) {
    if (++k % bloco === 0) await cedeAoEventLoop();
    const cam = path.join(pasta, n);
    let mt, rec;
    try {
      mt = fs.statSync(cam).mtimeMs;
      rec = JSON.parse(fs.readFileSync(cam, "utf8"));
    } catch { r.ignorados++; continue; }
    if (!reciboIntegro(rec)) { r.ignorados++; continue; }
    r.total++;
    if (!forcar && rec.custodia_v === CUSTODIA_VERSAO) continue;
    r.desatualizados++;
    let novo;
    try { novo = camposAlheios(rec.texto, rec.tipo); } catch { r.ignorados++; continue; }   // custódia falhou: deixa como está
    const mudouCampo = CAMPOS_CUSTODIA.some((c) => JSON.stringify(rec[c]) !== JSON.stringify(novo[c]));
    if (mudouCampo) {
      r.alterados++;
      r.mudancas.push([n, (rec.trechos_transcritos || []).reduce((a, x) => a + x.length, 0), novo.trechos_transcritos.reduce((a, x) => a + x.length, 0)]);
    }
    if (!gravar) continue;
    try {
      if (fs.statSync(cam).mtimeMs !== mt) continue;   // alguém regravou no meio: a próxima vez pega
      for (const c of CAMPOS_CUSTODIA) delete rec[c];
      Object.assign(rec, novo, { custodia_v: CUSTODIA_VERSAO, normalizacao: NORMALIZACAO });
      const tmp = path.join(pasta, `.${n}.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(rec));
      fs.renameSync(tmp, cam);
      r.regravados++;
    } catch { r.ignorados++; }
  }
  return r;
}
