#!/usr/bin/env node
// Mede os ALERTAS do verificador (conferirTrecho) sobre os recibos já gravados — nenhuma requisição ao portal.
//   node harness/medir-verificador.mjs [pasta-dos-recibos]
//   node harness/medir-verificador.mjs --amostra-alegacao N [semente]   imprime N janelas em que ALEGAÇÃO DA PARTE dispara (para rotular à mão)
// Três blocos:
//  1. gabarito de custódia (gold-custodia.json, 53 trechos rotulados à mão: transcrito / proprio / divergente):
//     detecção de TRANSCRIÇÃO e de VOTO DIVERGENTE e, nos trechos da voz do relator, quantos recebem cada alerta;
//  2. taxa de cada alerta em janelas de 12 palavras da voz do próprio tribunal (fora de transcrição, divergência e
//     da cauda da casa) — é o que o advogado vê ao conferir uma frase do relator: ENTRE ASPAS, ALEGAÇÃO e NEGAÇÃO
//     são avisos de cautela, mas quando disparam em TODA frase deixam de informar;
//  3. gabarito de ALEGAÇÃO DA PARTE (gold-alegacao.local.json, local, rotulado à mão: "parte" = a frase é a tese que o acórdão
//     relata como da parte; "tribunal" = é o tribunal falando): precisão e cobertura do alerta, separando o conjunto de
//     ajuste do de validação (v=true, rotulado depois do ajuste).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conferirTrecho } from "../server/verificar.js";
import { faixasAlheias } from "../server/custodia.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--") && fs.existsSync(a)) || path.join(os.homedir(), ".tjro-jurisprudencia-recibos");
const recs = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
}).filter((r) => r && r.texto);
const porId = new Map(recs.map((r) => [r.id_documento, r]));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : "—") + ` % (${a}/${b})`;
const ALERTAS = ["TRANSCRIÇÃO", "VOTO DIVERGENTE", "ENTRE ASPAS", "ALEGAÇÃO DA PARTE", "NEGAÇÃO"];
const quais = (r) => ALERTAS.filter((a) => r.alertas.some((x) => x.startsWith(a)));
// gerador pseudoaleatório com semente (mulberry32)
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- amostra para rotular
const iA = args.indexOf("--amostra-alegacao");
if (iA >= 0) {
  const n = Number(args[iA + 1]) || 40, rand = rng(Number(args[iA + 2]) || 7);
  const achados = [];
  for (const r of recs) {
    if (!/AC[ÓO]RD[ÃA]O|VOTO/.test(r.tipo)) continue;
    const pal = r.texto.split(/\s+/);
    for (let i = 40; i + 14 < pal.length; i += 37) {
      const t = pal.slice(i, i + 12).join(" ");
      const c = conferirTrecho(r.texto, t, r.tipo);
      if (c.ok && c.alertas.some((a) => a.startsWith("ALEGAÇÃO DA PARTE")) && !c.alertas.some((a) => /^(TRANSCRIÇÃO|VOTO DIVERGENTE)/.test(a))) {
        const a0 = r.texto.indexOf(t);
        achados.push({ id: r.id_documento, t, antes: r.texto.slice(Math.max(0, a0 - 420), a0).replace(/\s+/g, " "), depois: r.texto.slice(a0 + t.length, a0 + t.length + 90).replace(/\s+/g, " ") });
      }
    }
  }
  const sorteio = achados.map((a) => [rand(), a]).sort((x, y) => x[0] - y[0]).slice(0, n).map((x) => x[1]);
  console.log(JSON.stringify({ total_disparos: achados.length, amostra: sorteio }, null, 1));
  process.exit(0);
}

// amostra de janelas em que o alerta ficou CALADO perto de um verbo de alegação (para medir cobertura)
const iS = args.indexOf("--amostra-silenciosos");
if (iS >= 0) {
  const n = Number(args[iS + 1]) || 30, rand = rng(Number(args[iS + 2]) || 11);
  const VERBO = /\b(sustent\w+|aleg\w+|defende\w*|aduz\w*|requer\w*|pleite\w+|afirm\w+|argument\w+|pugn\w+|narr\w+|relat\w+|alude\w*|invoca\w*|insist\w+|reitera\w*|impugn\w+|refere\w*|disse|informa\w*|asser\w+)\b/i;
  const achados = [];
  for (const r of recs) {
    if (!/AC[ÓO]RD[ÃA]O|VOTO/.test(r.tipo)) continue;
    const f = faixasAlheias(r.texto, r.tipo);
    const pal = r.texto.split(/\s+/);
    let pos = 0;
    for (let i = 0; i + 14 < pal.length; i++) { /* posição de cada palavra */ }
    for (let i = 40; i + 14 < pal.length; i += 31) {
      const t = pal.slice(i, i + 12).join(" ");
      const a0 = r.texto.indexOf(t);
      if (a0 < 0 || a0 >= f.casaIni) continue;
      if (f.transcritas.some(([x, y]) => a0 < y && a0 + t.length > x) || (f.divergente && a0 < f.divergente[1] && a0 + t.length > f.divergente[0])) continue;
      const antes = r.texto.slice(Math.max(0, a0 - 420), a0);
      if (!VERBO.test(antes.slice(-300))) continue;
      const c = conferirTrecho(r.texto, t, r.tipo);
      if (!c.ok || c.alertas.some((a) => a.startsWith("ALEGAÇÃO DA PARTE"))) continue;
      achados.push({ id: r.id_documento, t, antes: antes.replace(/\s+/g, " "), depois: r.texto.slice(a0 + t.length, a0 + t.length + 90).replace(/\s+/g, " ") });
    }
  }
  const sorteio = achados.map((a) => [rand(), a]).sort((x, y) => x[0] - y[0]).slice(0, n).map((x) => x[1]);
  console.log(JSON.stringify({ total_silenciosos: achados.length, amostra: sorteio }, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- 1. gabarito de custódia
const gold = JSON.parse(fs.readFileSync(path.join(aqui, "gold-custodia.json"), "utf8")).itens;
const cont = { transcrito: {}, proprio: {}, divergente: {} }, tot = { transcrito: 0, proprio: 0, divergente: 0 };
let sem = 0;
for (const g of gold) {
  const r = porId.get(g.id);
  if (!r) { sem++; continue; }
  const c = conferirTrecho(r.texto, g.t, r.tipo);
  if (!c.ok) { sem++; continue; }
  tot[g.r]++;
  for (const a of quais(c)) cont[g.r][a] = (cont[g.r][a] || 0) + 1;
}
console.log(`recibos: ${recs.length} · gabarito de custódia: ${gold.length} trechos (${sem} sem recibo/trecho)`);
console.log(`  trechos TRANSCRITOS com alerta TRANSCRIÇÃO:      ${pct(cont.transcrito["TRANSCRIÇÃO"] || 0, tot.transcrito)}`);
console.log(`  trechos DIVERGENTES com alerta VOTO DIVERGENTE:  ${pct(cont.divergente["VOTO DIVERGENTE"] || 0, tot.divergente)}`);
console.log(`  trechos da voz do RELATOR (n=${tot.proprio}), com cada alerta:`);
for (const a of ALERTAS) console.log(`     ${a.padEnd(18)} ${pct(cont.proprio[a] || 0, tot.proprio)}`);

// ---------------------------------------------------------------- 2. janelas na voz do tribunal
const taxa = {}; let janelas = 0;
for (const r of recs) {
  if (!/AC[ÓO]RD[ÃA]O|VOTO/.test(r.tipo)) continue;
  const f = faixasAlheias(r.texto, r.tipo);
  const pal = []; const re = /\S+/g; for (let m; (m = re.exec(r.texto));) pal.push([m.index, m.index + m[0].length]);
  for (let i = 40; i + 14 < pal.length; i += 37) {
    const a = pal[i][0], b = pal[i + 11][1];
    if (a >= f.casaIni) continue;
    if (f.transcritas.some(([x, y]) => a < y && b > x) || (f.divergente && a < f.divergente[1] && b > f.divergente[0])) continue;
    const c = conferirTrecho(r.texto, r.texto.slice(a, b), r.tipo);
    if (!c.ok) continue;
    janelas++;
    for (const al of quais(c)) taxa[al] = (taxa[al] || 0) + 1;
  }
}
console.log(`janelas de 12 palavras fora de transcrição, divergência e ementa/fecho: ${janelas} (inclui o RELATÓRIO, onde ALEGAÇÃO DA PARTE é aviso correto: a taxa não é taxa de falso alarme; essa vem do gabarito do bloco 3)`);
for (const a of ALERTAS.slice(2)) console.log(`     ${a.padEnd(18)} ${pct(taxa[a] || 0, janelas)}`);

// ---------------------------------------------------------------- 3. gabarito de ALEGAÇÃO DA PARTE
const arqAleg = path.join(aqui, "gold-alegacao.local.json");
if (fs.existsSync(arqAleg)) {
  const itens = JSON.parse(fs.readFileSync(arqAleg, "utf8")).itens;
  const c3 = { ajuste: { tp: 0, fp: 0, fn: 0, tn: 0 }, validacao: { tp: 0, fp: 0, fn: 0, tn: 0 } };
  const erros = [];
  for (const g of itens) {
    const r = porId.get(g.id);
    if (!r) continue;
    const c = conferirTrecho(r.texto, g.t, r.tipo);
    if (!c.ok) continue;
    const dispara = c.alertas.some((a) => a.startsWith("ALEGAÇÃO DA PARTE"));
    const k = c3[g.v ? "validacao" : "ajuste"];
    (c3[g.origem] ||= { tp: 0, fp: 0, fn: 0, tn: 0 });
    if (g.r === "parte") dispara ? k.tp++ : k.fn++; else dispara ? k.fp++ : k.tn++;
    if ((g.r === "parte") !== dispara) erros.push(`${g.v ? "[validação] " : ""}${g.r === "parte" ? "PERDIDO" : "FALSO ALARME"} ${g.id}: ${g.t.slice(0, 80)}`);
  }
  console.log("gabarito de ALEGAÇÃO DA PARTE:");
  for (const [n, k] of Object.entries(c3)) {
    console.log(`  ${n}: precisão ${pct(k.tp, k.tp + k.fp)} · cobertura ${pct(k.tp, k.tp + k.fn)} · falso alarme sobre o tribunal ${pct(k.fp, k.fp + k.tn)}`);
  }
  for (const e of erros) console.log("  - " + e);
}
