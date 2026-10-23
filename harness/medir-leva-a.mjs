// Leva A (red team 22/10/2026) — medição ANTES × DEPOIS nos recibos reais, sem rede.
// Uso: node harness/medir-leva-a.mjs <pasta-server> <pasta-recibos-COPIA> [saida.json]
//   <pasta-server>: server/ da versão a medir (copie a versão anterior para outra pasta para comparar).
//   <pasta-recibos-COPIA>: CÓPIA da pasta de recibos em os.tmpdir() — auditarCitacoes grava o índice leve na pasta que lê;
//   nunca aponte para ~/.tjro-jurisprudencia-recibos. Rode com HOME e TJRO_MCP_DIR_* apontando para uma pasta temporária.
// Mede: (1) relator do cabeçalho × índice (aviso do inteiro teor); (2) auditoria de citações REAIS — cada número 8.22 citado no texto
// de um recibo e lido nesta máquina vira uma "peça" (a janela da citação) e sai com o emoji da auditoria; (3) câmara do cabeçalho;
// (4) elipses aleatórias "[...]" sobre recibos reais: quantas o alerta NEGAÇÃO OMITIDA NO CORTE pega, e uma amostra para ler.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [dirServer, pasta, saida] = process.argv.slice(2);
if (!dirServer || !pasta) { console.error("uso: node medir-leva-a.mjs <pasta-server> <pasta-recibos-copia> [saida.json]"); process.exit(2); }
if (path.resolve(pasta) === path.resolve(process.env.HOME || "", ".tjro-jurisprudencia-recibos")) { console.error("use uma CÓPIA"); process.exit(2); }
const imp = (f) => import(pathToFileURL(path.join(dirServer, f)).href);
const lib = await imp("lib.js");
const aud = await imp("auditoria.js");
const ver = await imp("verificar.js");

const arqs = fs.readdirSync(pasta).filter((f) => /^\d+\.json$/.test(f)).sort();
const recs = [];
for (const f of arqs) { try { const r = JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8")); if (r && r.texto) recs.push(r); } catch { /* ignora */ } }
const dig = (x) => String(x || "").replace(/\D/g, "");
const lidos = new Set(recs.map((r) => dig(r.nr_processo)));
const out = { recibos: recs.length };

// (1) relator do cabeçalho × índice
const cmp = lib.compararRelator || ((a, b) => (lib.relatorDiverge(a, b) ? "diverge" : a && b ? "confere" : null));
const rel = { comparados: 0, diverge: 0, ambiguo: 0, exemplos: [] };
for (const r of recs) {
  const t = lib.extrairRelatorDoTexto(r.texto);
  if (!t || !r.relator_indice) continue;
  const c = cmp(t, r.relator_indice);
  if (!c) continue;
  rel.comparados++;
  if (c !== "confere") { rel[c]++; if (rel.exemplos.length < 40) rel.exemplos.push([r.id_documento, c, t, r.relator_indice]); }
}
out.relator_cabecalho_indice = rel;

// (2) auditoria de citações reais
const RE_CNJ = /(?<![0-9])(\d{7})-(\d{2})\.(\d{4})\.8\.22\.(\d{4})(?![0-9])/g;
const cit = [];
for (const r of recs) {
  const meu = dig(r.nr_processo);
  for (const m of r.texto.matchAll(RE_CNJ)) {
    const d = dig(m[0]);
    if (d === meu || !lidos.has(d)) continue;
    cit.push({ de: r.id_documento, num: m[0], janela: r.texto.slice(Math.max(0, m.index - 160), m.index + m[0].length + 200) });
  }
}
const lim = Math.min(cit.length, Number(process.env.LIMITE_CITACOES || 4000));
const contagem = {}, linhas = [];
for (let i = 0; i < lim; i++) {
  const c = cit[i];
  const res = aud.auditarCitacoes(c.janela, pasta).split("\n").find((l) => l.includes(c.num)) || "";
  const em = res.slice(0, 2);
  contagem[em] = (contagem[em] || 0) + 1;
  linhas.push({ de: c.de, num: c.num, res });
}
out.auditoria = { citacoes_encontradas: cit.length, auditadas: lim, contagem, linhas };

// (3) câmara: origem e órgão
const org = { fecho: 0, "cabeçalho": 0, nenhum: 0, cab: [] };
for (const r of recs) {
  const o = lib.extrairOrgaoComOrigem(r.texto);
  if (!o) { org.nenhum++; continue; }
  org[o.origem]++;
  if (o.origem === "cabeçalho") org.cab.push([r.id_documento, r.tipo, o.orgao, r.orgao_indice, r.classe]);
}
out.orgao = org;

// (4) elipses aleatórias
let seed = 20261022;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const alvo = recs.filter((r) => /AC[ÓO]RD|VOTO/.test(String(r.tipo || "").toUpperCase()) && r.texto.length > 3000);
const faixas = [[1, 8], [8, 37], [60, 200]];
const neg = {};
const amostra = [];
const RE_NEG_INGENUO = /(?<![a-z0-9])(?:nao|nem|nunca|jamais|sem)(?![a-z0-9])/;
for (const [gmin, gmax] of faixas) {
  const k = `${gmin}-${gmax}`; neg[k] = { elipses: 0, alarme: 0, lacuna_com_negacao: 0 };
  for (let n = 0; n < 1500; n++) {
    const r = alvo[Math.floor(rnd() * alvo.length)];
    const ws = [...r.texto.matchAll(/\S+/g)];
    const g = gmin + Math.floor(rnd() * (gmax - gmin + 1));
    const f1 = 4 + Math.floor(rnd() * 6), f2 = 4 + Math.floor(rnd() * 6);
    if (ws.length < f1 + g + f2 + 10) continue;
    const i0 = Math.floor(rnd() * (ws.length - (f1 + g + f2)));
    const fim1 = ws[i0 + f1 - 1].index + ws[i0 + f1 - 1][0].length;
    const ini2 = ws[i0 + f1 + g].index;
    const fim2 = ws[i0 + f1 + g + f2 - 1].index + ws[i0 + f1 + g + f2 - 1][0].length;
    const trecho = r.texto.slice(ws[i0].index, fim1) + " [...] " + r.texto.slice(ini2, fim2);
    const v = ver.conferirTrecho(r.texto, trecho, r.tipo);
    if (!v.ok) continue;
    neg[k].elipses++;
    const lac = r.texto.slice(fim1, ini2).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    if (RE_NEG_INGENUO.test(lac)) neg[k].lacuna_com_negacao++;
    const al = (v.alertas || []).find((a) => a.startsWith("NEGAÇÃO OMITIDA"));
    if (al) {
      neg[k].alarme++;
      if (amostra.filter((x) => x.faixa === k).length < 25) amostra.push({ faixa: k, id: r.id_documento, trecho, original: r.texto.slice(ws[i0].index, fim2).replace(/\s+/g, " ") });
    }
  }
}
out.negacao_corte = { por_faixa: neg, amostra };
const res = { ...out, auditoria: { ...out.auditoria, linhas: undefined }, orgao: { ...org, cab: org.cab.length }, negacao_corte: { por_faixa: neg, amostra: amostra.length } };
console.log(JSON.stringify(res, null, 1));
if (saida) fs.writeFileSync(saida, JSON.stringify(out, null, 1));
