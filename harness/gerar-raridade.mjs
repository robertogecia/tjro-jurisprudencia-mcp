// Gera server/raridade-tabela.js: frequência de DOCUMENTO de palavras e pares de palavras nos recibos, para o piso de surpresa
// por fragmento do verificar_citacao_tjro (1.41.9). Só entram termos presentes em pelo menos DF_MIN documentos (vocabulário
// comum, nenhum dado de caso). Lê uma CÓPIA dos recibos em os.tmpdir(); a pasta real é recusada.
// Uso: node harness/gerar-raridade.mjs <pasta-recibos-COPIA>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { norm1, expandirLigaduras } from "../server/custodia.js";

const DF_MIN = 200;
const pasta = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.realpathSync(pasta).startsWith(fs.realpathSync(os.tmpdir()))) {
  console.error(`uso: node harness/gerar-raridade.mjs <cópia dos recibos em ${os.tmpdir()}>`);
  process.exit(2);
}
const uni = new Map(), bi = new Map();
let N = 0;
for (const f of fs.readdirSync(pasta)) {
  if (!/^\d+\.json$/.test(f)) continue;
  let r;
  try { r = JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8")); } catch { continue; }
  if (!r.texto) continue;
  N++;
  const ws = norm1(expandirLigaduras(r.texto).replace(/­/g, "")).match(/[a-z0-9]+/g) || [];
  const sb = new Set();
  for (let i = 1; i < ws.length; i++) sb.add(ws[i - 1] + " " + ws[i]);
  for (const w of new Set(ws)) uni.set(w, (uni.get(w) || 0) + 1);
  for (const w of sb) bi.set(w, (bi.get(w) || 0) + 1);
}
const corta = (m) => Object.fromEntries([...m].filter(([, v]) => v >= DF_MIN).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
const tab = { N, DF_MIN, uni: corta(uni), bi: corta(bi) };
const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "raridade-tabela.js");
fs.writeFileSync(destino, `// GERADO por harness/gerar-raridade.mjs (${N} recibos, termos em >= ${DF_MIN} documentos). Não edite à mão.\nexport const TABELA = ${JSON.stringify(tab)};\n`);
console.log({ N, palavras: Object.keys(tab.uni).length, pares: Object.keys(tab.bi).length, destino });
