#!/usr/bin/env node
// Sorteia janelas de 12 palavras para rotulagem CEGA da custódia (TRANSCRIÇÃO e VOTO DIVERGENTE) e de uma 2ª rodada
// de ALEGAÇÃO DA PARTE — nenhuma requisição ao portal. Mesmo desenho de amostrar-alertas.mjs: estratos "dispara" e
// "calado" (perto de gatilho) e, na transcrição, também "longe" (calado sem gatilho: mede o que escapa de vez).
//   node harness/amostrar-custodia.mjs --saida <pasta> [--semente 31]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conferirTrecho } from "../server/verificar.js";
import { faixasAlheias, atribuicoes, norm1 } from "../server/custodia.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const saida = args[args.indexOf("--saida") + 1];
const semente = Number(args.includes("--semente") ? args[args.indexOf("--semente") + 1] : 31);
fs.mkdirSync(saida, { recursive: true });
const dir = path.join(os.homedir(), ".tjro-jurisprudencia-recibos");
const recs = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
}).filter((r) => r && r.texto && /AC[ÓO]RD[ÃA]O|VOTO/.test(r.tipo || ""));
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ja = new Set();
for (const arq of ["gold-alegacao.local.json", "gold-alertas.local.json"]) try { for (const g of JSON.parse(fs.readFileSync(path.join(aqui, arq), "utf8")).itens) ja.add(g.id + "|" + g.t); } catch {}

const VERBO = /(?<![a-z0-9])(sustent\w*|aleg\w*|defend\w*|aduz\w*|requer\w*|pleite\w*|afirm\w*|argument\w*|pugn\w*|narr\w*|relat\w*|invoc\w*|insist\w*|reiter\w*|impugn\w*|refer\w*|disse|inform\w*|asser\w*|postul\w*|suscit\w*|apont\w*|pretend\w*)(?![a-z0-9])/;
const ABRE = /(?<![a-z0-9])(ementa|transcrev\w*|in verbis|verbis|litteris|nos seguintes termos|vejamos|veja-se|confira-se|colaciono|nesse sentido|neste sentido|precedentes?|julgados?|jurisprudencia|sentenca|decisao|assim decidiu|consignou|registrou|fundamentou|assentou)(?![a-z0-9])/;
const cand = { transcricao: { dispara: [], calado: [], longe: [] }, divergente: { dispara: [], calado: [] }, alegacao2: { dispara: [], calado: [] } };
for (const r of recs) {
  const f = faixasAlheias(r.texto, r.tipo);
  const tn = norm1(r.texto);
  const atr = atribuicoes(tn, 0, f.casaIni);
  const maioria = /por maioria|vencid[oa]/i.test(r.texto.slice(-1500));
  const pal = []; const re = /\S+/g; for (let m; (m = re.exec(r.texto));) pal.push([m.index, m.index + m[0].length]);
  for (let i = 61; i + 14 < pal.length; i += 43) {
    const a0 = pal[i][0], b0 = pal[i + 11][1];
    if (a0 >= f.casaIni) continue;
    const t = r.texto.slice(a0, b0);
    if (r.texto.indexOf(t) !== a0) continue;                      // só a 1ª ocorrência literal
    const emT = f.transcritas.some(([x, y]) => a0 < y && b0 > x);
    const emD = !!f.divergente && a0 < f.divergente[1] && b0 > f.divergente[0];
    const item = { id: r.id_documento, a0, b0, t };
    // transcrição
    if (emT) cand.transcricao.dispara.push(item);
    else if (atr.some(([x]) => x > a0 && x - a0 < 2500) || ABRE.test(tn.slice(Math.max(0, a0 - 700), a0))) cand.transcricao.calado.push(item);
    else cand.transcricao.longe.push(item);
    // divergência: só em ACÓRDÃO (o documento VOTO isolado não tem fecho para decidir)
    if (/AC[ÓO]RD[ÃA]O/.test(r.tipo)) {
      if (emD) cand.divergente.dispara.push(item);
      else if (maioria || f.divergente) cand.divergente.calado.push(item);
    }
    // alegação, 2ª rodada (fora de transcrição/divergência)
    if (!emT && !emD && !ja.has(r.id_documento + "|" + t)) {
      const c = conferirTrecho(r.texto, t, r.tipo);
      if (c.ok && c.spans[0][0] === a0) {
        if (c.alertas.some((x) => x.startsWith("ALEGAÇÃO DA PARTE"))) cand.alegacao2.dispara.push(item);
        else if (VERBO.test(tn.slice(Math.max(0, a0 - 400), a0))) cand.alegacao2.calado.push(item);
      }
    }
  }
}
const N = { transcricao: { dispara: 50, calado: 50, longe: 30 }, divergente: { dispara: 40, calado: 40 }, alegacao2: { dispara: 80, calado: 80 } };
const rand = rng(semente);
const sorteia = (lista, n) => lista.map((x) => [rand(), x]).sort((p, q) => p[0] - q[0]).slice(0, n).map((x) => x[1]);
const porId = new Map(recs.map((r) => [r.id_documento, r]));
const RE_FALANTE = /\b(?:VOTO\s+)?(?:DESEMBARGADORA?|JU[IÍ]ZA?(?: CONVOCAD[OA])?)\s+[A-ZÀ-Ý][A-ZÀ-Ý.' ]{3,60}?(?=\s+[A-ZÀ-Ý]?[a-zà-ÿ])/g;
const resumo = { semente, recibos: recs.length };
for (const k of Object.keys(cand)) {
  let esc = [];
  for (const e of Object.keys(cand[k])) esc.push(...sorteia(cand[k][e], N[k][e]).map((x) => ({ ...x, estrato: e })));
  esc = esc.map((x) => [rand(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
  const cegas = [], chave = {};
  const pre = { transcricao: "TRA", divergente: "DIV", alegacao2: "AL2" }[k];
  esc.forEach((x, i) => {
    const cod = `${pre}${String(i + 1).padStart(3, "0")}`;
    const txt = porId.get(x.id).texto;
    const antesN = k === "alegacao2" ? 650 : 1600;
    const it = { cod, antes: txt.slice(Math.max(0, x.a0 - antesN), x.a0).replace(/\s+/g, " "), trecho: x.t.replace(/\s+/g, " "), depois: txt.slice(x.b0, x.b0 + (k === "alegacao2" ? 200 : 700)).replace(/\s+/g, " ") };
    if (k === "divergente") {
      const fal = [...txt.slice(0, x.a0).matchAll(RE_FALANTE)].slice(-3).map((m) => txt.slice(m.index, m.index + 260).replace(/\s+/g, " "));
      it.quem_falou_antes = fal;
      it.fim_do_documento = txt.slice(-1100).replace(/\s+/g, " ");
    }
    cegas.push(it);
    chave[cod] = { id: x.id, t: x.t, estrato: x.estrato };
  });
  fs.writeFileSync(path.join(saida, `${k}-cegas.json`), JSON.stringify(cegas, null, 1));
  fs.writeFileSync(path.join(saida, `${k}-chave.json`), JSON.stringify(chave, null, 1));
  resumo[k] = { populacao: Object.fromEntries(Object.entries(cand[k]).map(([e, l]) => [e, l.length])), amostra: Object.fromEntries(Object.entries(cand[k]).map(([e, l]) => [e, Math.min(N[k][e], l.length)])) };
}
fs.writeFileSync(path.join(saida, "resumo.json"), JSON.stringify(resumo, null, 1));
console.log(JSON.stringify(resumo));
