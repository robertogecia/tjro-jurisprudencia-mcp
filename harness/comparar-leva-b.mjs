// Compara duas saídas de medir-leva-b.mjs: node harness/comparar-leva-b.mjs antes.json depois.json [pasta-recibos-COPIA]
// Com a pasta, imprime o trecho do dispositivo/fecho de cada mudança, para LER (não é taxa de acerto).
import fs from "node:fs";
import path from "node:path";
const [fa, fb, pasta] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(fa, "utf8")), B = JSON.parse(fs.readFileSync(fb, "utf8"));
const ler = (id) => { try { return JSON.parse(fs.readFileSync(path.join(pasta, `${id}.json`), "utf8")); } catch { return null; } };
for (const campo of ["resultado", "desfecho"]) {
  const mud = {};
  const ex = [];
  for (const id of Object.keys(A[campo])) {
    const a = A[campo][id], b = B[campo][id];
    if (a === b) continue;
    const k = `${a}→${b}`;
    mud[k] = (mud[k] || 0) + 1;
    ex.push([id, k]);
  }
  console.log(`\n== ${campo}: ${Object.keys(A[campo]).length} documentos, ${ex.length} mudaram`, mud);
  if (pasta) for (const [id, k] of ex) {
    const r = ler(id);
    const t = r ? r.texto : "";
    const i = campo === "resultado" ? Math.max(t.search(/acordam\s+(?:os|as)\s+(?:magistrados|desembargadores|ju[ií]zes)/i), 0) : Math.max(0, t.length - 1800);
    const trecho = campo === "resultado" && i > 0 ? t.slice(i, i + 400) : t.slice(-1400);
    console.log(`--- ${id} ${k} [${r && r.tipo} | ${r && r.classe}]\n${trecho.replace(/\s+/g, " ")}`);
  }
}
let mudT = 0;
const exT = [];
for (const id of Object.keys(A.transcritas)) {
  const a = JSON.stringify(A.transcritas[id]), b = JSON.stringify(B.transcritas[id]);
  if (a !== b) { mudT++; exT.push([id, A.transcritas[id], B.transcritas[id]]); }
}
console.log(`\n== custódia (trechos_transcritos): ${Object.keys(A.transcritas).length} documentos, ${mudT} mudaram; tempo ${A.tempo_custodia_ms} → ${B.tempo_custodia_ms} ms`);
for (const [id, a, b] of exT.slice(0, 80)) console.log(`--- ${id}\n  antes:  ${JSON.stringify(a)}\n  depois: ${JSON.stringify(b)}`);
