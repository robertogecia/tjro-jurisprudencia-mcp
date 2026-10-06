#!/usr/bin/env node
// Sorteia janelas de 12 palavras para rotulagem CEGA do alerta OBITER DICTUM? (v1.15.0) — nenhuma requisição ao portal.
// Dois estratos: "dispara" (TODAS as janelas logo depois de uma marca de obiter em que o alerta dispara) e "calado"
// (janelas em que há uma pista genérica de hipótese/alternativa por perto — "ainda que", "mesmo que", "caso", "em tese",
// "eventual", "subsidiari", "alternativ"… — e o alerta fica calado). Mesmos arquivos de amostrar-alertas.mjs.
//   node harness/amostrar-obiter.mjs --saida <pasta> [--semente 31]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { conferirTrecho } from "../server/verificar.js";
import { faixasAlheias, norm1 } from "../server/custodia.js";
import { RE_OBITER } from "../server/posicao.js";

const args = process.argv.slice(2);
const saida = args[args.indexOf("--saida") + 1];
const semente = Number(args.includes("--semente") ? args[args.indexOf("--semente") + 1] : 31);
if (!saida) { console.error("use --saida <pasta>"); process.exit(2); }
fs.mkdirSync(saida, { recursive: true });
const dir = path.join(os.homedir(), ".tjro-jurisprudencia-recibos");
const recs = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
}).filter((r) => r && r.texto && /AC[ÓO]RD[ÃA]O|VOTO/.test(r.tipo || ""));
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const PISTA = /(?<![a-z0-9])(?:ainda que|mesmo que|se assim|caso\s|em tese|hipotes|hipotetic|argument|subsidiari|alternativ|eventual|de todo|de qualquer|de toda|admitisse|superad)/;

const vistos = new Set(), dispara = [], calado = [];
const dedup = (lista, item) => { const k = norm1(item.t).replace(/\s+/g, " "); if (vistos.has(k)) return; vistos.add(k); lista.push(item); };
for (const r of recs) {
  const f = faixasAlheias(r.texto, r.tipo), tn = norm1(r.texto);
  const pal = []; const re = /\S+/g; for (let m; (m = re.exec(r.texto));) pal.push([m.index, m.index + m[0].length]);
  const fora = (a0, b0) => a0 >= f.casaIni || f.transcritas.some(([x, y]) => a0 < y && b0 > x) || (f.divergente && a0 < f.divergente[1] && b0 > f.divergente[0]);
  const janela = (i) => { if (i < 0 || i + 12 > pal.length) return null; const a0 = pal[i][0], b0 = pal[i + 11][1]; if (fora(a0, b0)) return null; const t = r.texto.slice(a0, b0); const c = conferirTrecho(r.texto, t, r.tipo); if (!c.ok || c.spans[0][0] !== a0) return null; return { id: r.id_documento, a0, b0, t, ob: c.alertas.some((x) => x.startsWith("OBITER")) }; };
  // dispara: logo depois de cada marca (1ª palavra após a marca, e 8 palavras adiante)
  for (const m of tn.matchAll(RE_OBITER)) {
    const fimMarca = m.index + m[0].length;
    let i = pal.findIndex(([a]) => a >= fimMarca);
    for (const salto of [0, 8]) { const j = janela(i + salto); if (j && j.ob) dedup(dispara, j); }
  }
  // calado: janelas em passo fixo com pista genérica nos 300 caracteres anteriores
  for (let i = 41; i + 14 < pal.length; i += 23) {
    const j = janela(i);
    if (j && !j.ob && PISTA.test(tn.slice(Math.max(0, j.a0 - 300), j.a0))) dedup(calado, j);
  }
}
const rand = rng(semente);
const sorteia = (lista, n) => lista.map((x) => [rand(), x]).sort((p, q) => p[0] - q[0]).slice(0, n).map((x) => x[1]);
const N = [80, 60];
const escolhidos = [...sorteia(dispara, N[0]).map((x) => ({ ...x, estrato: "dispara" })), ...sorteia(calado, N[1]).map((x) => ({ ...x, estrato: "calado" }))];
const emb = escolhidos.map((x) => [rand(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const porId = new Map(recs.map((r) => [r.id_documento, r]));
const cegas = [], chave = {};
emb.forEach((x, i) => {
  const cod = `OBI${String(i + 1).padStart(3, "0")}`, txt = porId.get(x.id).texto;
  cegas.push({ cod, antes: txt.slice(Math.max(0, x.a0 - 2000), x.a0).replace(/\s+/g, " "), trecho: x.t.replace(/\s+/g, " "), depois: txt.slice(x.b0, x.b0 + 500).replace(/\s+/g, " ") });
  chave[cod] = { id: x.id, t: x.t, estrato: x.estrato };
});
fs.writeFileSync(path.join(saida, "obiter-cegas.json"), JSON.stringify(cegas, null, 1));
fs.writeFileSync(path.join(saida, "obiter-chave.json"), JSON.stringify(chave, null, 1));
const resumo = { obiter: { populacao: { dispara: dispara.length, calado: calado.length }, amostra: { dispara: Math.min(N[0], dispara.length), calado: Math.min(N[1], calado.length) } } };
fs.writeFileSync(path.join(saida, "resumo.json"), JSON.stringify({ semente, recibos: recs.length, ...resumo }, null, 1));
console.log(JSON.stringify(resumo));
