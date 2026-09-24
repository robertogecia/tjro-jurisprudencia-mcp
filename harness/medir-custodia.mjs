#!/usr/bin/env node
// Mede os campos de custódia (trechos_transcritos / trecho_divergente) sobre os recibos
// JÁ GRAVADOS em disco — nenhuma requisição ao portal. Uso:
//   node harness/medir-custodia.mjs [pasta-dos-recibos]
// Três números:
//  1. detecção: itens "transcrito"/"divergente" do gabarito que caem num campo alheio;
//  2. falso alarme no relator: itens "proprio" do gabarito que caem num campo alheio;
//  3. falso alarme na ementa DA CASA: frases (≥ 6 palavras) de cada documento EMENTA que o
//     lint acusaria contra os recibos do mesmo processo — o caso real de citar a ementa do TJRO.
// A comparação imita o lint da peça (janela de 6 palavras, normalização própria).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { camposAlheios } from "../server/custodia.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] || path.join(os.homedir(), ".tjro-jurisprudencia-recibos");
const recs = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
}).filter((r) => r && r.texto);

const nl = (s) => s.normalize("NFKD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const JAN = 6;
function toca(trecho, blocos) {
  const p = nl(trecho).split(" ");
  const j = Math.min(JAN, p.length);
  for (const b of blocos) for (let i = 0; i + j <= p.length; i++) if ((" " + b + " ").includes(" " + p.slice(i, i + j).join(" ") + " ")) return true;
  return false;
}

const t0 = Date.now();
const campos = new Map(recs.map((r) => [r.id_documento, camposAlheios(r.texto, r.tipo)]));
const ms = Date.now() - t0;
const voz = (id) => { const v = campos.get(id)?.texto_voz_propria; return v ? [nl(v)] : []; };
const absolvido = (id, t) => voz(id).some((v) => (" " + v + " ").includes(" " + nl(t) + " "));
const blocos = (id) => { const c = campos.get(id); return c ? [...c.trechos_transcritos, c.trecho_divergente].filter(Boolean).map(nl) : []; };
const blocosT = (id) => (campos.get(id)?.trechos_transcritos || []).map(nl);
const blocosD = (id) => { const d = campos.get(id)?.trecho_divergente; return d ? [nl(d)] : []; };

const gold = JSON.parse(fs.readFileSync(path.join(aqui, "gold-custodia.json"), "utf8")).itens;
const zera = () => ({ transcrito: [0, 0], divergente: [0, 0], proprio: [0, 0] });
const contas = { ajuste: zera(), validacao: zera() }, falhas = [];
for (const g of gold) {
  const r = recs.find((x) => x.id_documento === g.id);
  if (!r) { falhas.push(`sem recibo ${g.id}`); continue; }
  if (!nl(r.texto).includes(nl(g.t))) { falhas.push(`trecho não está no ${g.id}: ${g.t.slice(0, 40)}`); continue; }
  const alvo = g.r === "transcrito" ? blocosT(g.id) : g.r === "divergente" ? blocosD(g.id) : blocos(g.id);
  const hit = toca(g.t, alvo) && !absolvido(g.id, g.t);
  const conta = contas[g.v ? "validacao" : "ajuste"];
  conta[g.r][1]++;
  if (hit) conta[g.r][0]++;
  if (hit === (g.r === "proprio")) falhas.push(`${g.v ? "[validação] " : ""}${g.r === "proprio" ? "FALSO ALARME" : "PERDIDO"} ${g.id}: ${g.t.slice(0, 70)}`);
}

// ementa da casa: a frase é citada com o id de um documento do mesmo processo que a contém literalmente
// (é o que o lint confere); acusada se tocar um campo alheio desse documento sem estar na voz própria dele
const porProc = new Map();
for (const r of recs) { const k = r.nr_processo || r.id_documento; (porProc.get(k) || porProc.set(k, []).get(k)).push(r); }
let frases = 0, acusadas = 0; const exFA = [], faPorTipo = {};
for (const [, docs] of porProc) {
  for (const e of docs.filter((d) => d.tipo === "EMENTA")) {
    for (const f of e.texto.split(/(?<=[.;:])\s+/)) {
      const nf = nl(f);
      if (nf.split(" ").length < JAN) continue;
      for (const d of docs) {
        if (d === e || !(" " + nl(d.texto) + " ").includes(" " + nf + " ")) continue;
        frases++;
        const ft = (faPorTipo[d.tipo] ||= [0, 0]);
        ft[1]++;
        if (toca(f, blocos(d.id_documento)) && !absolvido(d.id_documento, f)) {
          acusadas++;
          ft[0]++;
          if (exFA.length < 8) exFA.push(`${d.id_documento} ${d.tipo}: ${f.slice(0, 90)}`);
        }
      }
    }
  }
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : "—") + ` % (${a}/${b})`;
const tipos = {};
for (const r of recs) { const c = campos.get(r.id_documento); const t = (tipos[r.tipo] ||= [0, 0, 0]); t[0]++; if (c.trechos_transcritos.length) t[1]++; if (c.trecho_divergente) t[2]++; }
console.log(`recibos: ${recs.length} (${ms} ms)`);
for (const [t, [n, a, d]] of Object.entries(tipos)) console.log(`  ${t}: ${n} docs, ${a} com transcrição, ${d} com divergência`);
for (const [nome, c] of Object.entries(contas)) {
  console.log(`gabarito — ${nome}:`);
  console.log(`  detecção de transcrição:        ${pct(...c.transcrito)}`);
  if (c.divergente[1]) console.log(`  detecção de divergência:        ${pct(...c.divergente)}`);
  console.log(`  falso alarme (voz do relator):  ${pct(...c.proprio)}`);
}
console.log(`falso alarme (ementa da casa), por documento citado:`);
for (const [t, [a, n]] of Object.entries(faPorTipo)) console.log(`  ${t}: ${pct(a, n)}`);
console.log(`  total: ${pct(acusadas, frases)}`);
for (const f of falhas) console.log("  - " + f);
for (const f of exFA) console.log("  ~ ementa acusada " + f);
