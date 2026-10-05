#!/usr/bin/env node
// Sorteia janelas de 12 palavras para rotulagem CEGA dos alertas ALEGAÇÃO DA PARTE, NEGAÇÃO e ENTRE ASPAS — nenhuma
// requisição ao portal. Para cada alerta, dois estratos: janelas em que o alerta DISPARA (mede precisão) e janelas em
// que ele fica CALADO mas há o gatilho bruto por perto (verbo de relato / negação / aspas: mede o que ele deixa
// passar). Grava dois arquivos por alerta: `<alerta>-cegas.json` (só código, contexto e trecho, embaralhado: é o que o
// rotulador vê) e `<alerta>-chave.json` (código → recibo, trecho, estrato: o rotulador NÃO vê). Exclui o que já está
// no gabarito local de alegação. Só ACÓRDÃO/VOTO, fora de transcrição, divergência e ementa/fecho da casa.
//   node harness/amostrar-alertas.mjs --saida <pasta> [--semente 23]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conferirTrecho } from "../server/verificar.js";
import { faixasAlheias, norm1 } from "../server/custodia.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const saida = args[args.indexOf("--saida") + 1];
const semente = Number(args.includes("--semente") ? args[args.indexOf("--semente") + 1] : 23);
if (!saida) { console.error("use --saida <pasta>"); process.exit(2); }
fs.mkdirSync(saida, { recursive: true });
const dir = path.join(os.homedir(), ".tjro-jurisprudencia-recibos");
const recs = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
}).filter((r) => r && r.texto && /AC[ÓO]RD[ÃA]O|VOTO/.test(r.tipo || ""));
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jaRotulados = new Set();
try { for (const g of JSON.parse(fs.readFileSync(path.join(aqui, "gold-alegacao.local.json"), "utf8")).itens) jaRotulados.add(g.id + "|" + g.t); } catch {}

// gatilhos brutos (o que um leitor procuraria), deliberadamente mais largos que as heurísticas
const VERBO = /(?<![a-z0-9])(sustent\w*|aleg\w*|defend\w*|aduz\w*|requer\w*|pleite\w*|afirm\w*|argument\w*|pugn\w*|narr\w*|relat\w*|invoc\w*|insist\w*|reiter\w*|impugn\w*|refer\w*|disse|inform\w*|asser\w*|postul\w*|suscit\w*|apont\w*|pretend\w*)(?![a-z0-9])/;
const NEGA = /(?<![a-z0-9])(nao|jamais|nunca|nem|inexist\w*|descab\w*|incabiv\w*|inaplicav\w*|indevid\w*|afast\w*|improced\w*|neg\w*|rejeit\w*|sem|carec\w*|impossib\w*|vedad\w*|ausencia|ausente)(?![a-z0-9])/;
const ASPA = /['"“”‘’«»]/;

const TIPOS = {
  alegacao: { alerta: "ALEGAÇÃO DA PARTE", perto: (r, a0, b0) => VERBO.test(norm1(r.texto.slice(Math.max(0, a0 - 400), a0))), n: [50, 70] },
  negacao: { alerta: "NEGAÇÃO", perto: (r, a0, b0) => NEGA.test(norm1(r.texto.slice(Math.max(0, a0 - 160), a0))), n: [40, 40] },
  aspas: { alerta: "ENTRE ASPAS", perto: (r, a0, b0) => ASPA.test(r.texto.slice(Math.max(0, a0 - 400), Math.min(r.texto.length, b0 + 400))), n: [30, 30] },
};

const candidatos = Object.fromEntries(Object.keys(TIPOS).map((k) => [k, { dispara: [], calado: [] }]));
for (const r of recs) {
  const f = faixasAlheias(r.texto, r.tipo);
  const pal = []; const re = /\S+/g; for (let m; (m = re.exec(r.texto));) pal.push([m.index, m.index + m[0].length]);
  for (let i = 57; i + 14 < pal.length; i += 41) {
    const a0 = pal[i][0], b0 = pal[i + 11][1];
    if (a0 >= f.casaIni) continue;
    if (f.transcritas.some(([x, y]) => a0 < y && b0 > x) || (f.divergente && a0 < f.divergente[1] && b0 > f.divergente[0])) continue;
    const t = r.texto.slice(a0, b0);
    if (jaRotulados.has(r.id_documento + "|" + t)) continue;
    const c = conferirTrecho(r.texto, t, r.tipo);
    if (!c.ok || c.spans[0][0] !== a0) continue;   // a 1ª ocorrência literal tem de ser esta janela
    for (const [k, T] of Object.entries(TIPOS)) {
      const dispara = c.alertas.some((x) => x.startsWith(T.alerta));
      const item = { id: r.id_documento, a0, b0, t };
      if (dispara) candidatos[k].dispara.push(item);
      else if (T.perto(r, a0, b0)) candidatos[k].calado.push(item);
    }
  }
}
const rand = rng(semente);
const sorteia = (lista, n) => lista.map((x) => [rand(), x]).sort((p, q) => p[0] - q[0]).slice(0, n).map((x) => x[1]);
const porId = new Map(recs.map((r) => [r.id_documento, r]));
const resumo = {};
for (const [k, T] of Object.entries(TIPOS)) {
  const escolhidos = [...sorteia(candidatos[k].dispara, T.n[0]).map((x) => ({ ...x, estrato: "dispara" })),
                      ...sorteia(candidatos[k].calado, T.n[1]).map((x) => ({ ...x, estrato: "calado" }))];
  const embaralhados = escolhidos.map((x) => [rand(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
  const cegas = [], chave = {};
  embaralhados.forEach((x, i) => {
    const cod = `${k.slice(0, 3).toUpperCase()}${String(i + 1).padStart(3, "0")}`;
    const txt = porId.get(x.id).texto;
    cegas.push({ cod, antes: txt.slice(Math.max(0, x.a0 - 650), x.a0).replace(/\s+/g, " "), trecho: x.t.replace(/\s+/g, " "), depois: txt.slice(x.b0, x.b0 + 200).replace(/\s+/g, " ") });
    chave[cod] = { id: x.id, t: x.t, estrato: x.estrato };
  });
  fs.writeFileSync(path.join(saida, `${k}-cegas.json`), JSON.stringify(cegas, null, 1));
  fs.writeFileSync(path.join(saida, `${k}-chave.json`), JSON.stringify(chave, null, 1));
  resumo[k] = { populacao: { dispara: candidatos[k].dispara.length, calado: candidatos[k].calado.length }, amostra: { dispara: Math.min(T.n[0], candidatos[k].dispara.length), calado: Math.min(T.n[1], candidatos[k].calado.length) } };
}
fs.writeFileSync(path.join(saida, "resumo.json"), JSON.stringify({ semente, recibos: recs.length, ...resumo }, null, 1));
console.log(JSON.stringify(resumo));
