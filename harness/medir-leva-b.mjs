// Leva B (red team 22/10/2026) — medição ANTES × DEPOIS nos recibos reais, sem rede e sem gravar nada.
// Uso: node harness/medir-leva-b.mjs <pasta-server> <pasta-recibos-COPIA> [saida.json]
//   <pasta-server>: server/ da versão a medir (copie a versão anterior para outra pasta para comparar).
//   <pasta-recibos-COPIA>: CÓPIA da pasta de recibos em os.tmpdir(); a pasta real é recusada. Rode com HOME temporário.
// Mede, por recibo: (5) rótulo de resultado do acórdão/ementa/voto; (6/7) desfecho da sentença; (9) faixas transcritas
// da custódia (camposAlheios); (10) tempo de faixasDeclaradas e norm1 com ligadura. Compare as duas saídas com
// harness/comparar-leva-b.mjs.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [dirServer, pasta, saida] = process.argv.slice(2);
if (!dirServer || !pasta) { console.error("uso: node medir-leva-b.mjs <pasta-server> <pasta-recibos-copia> [saida.json]"); process.exit(2); }
if (path.resolve(pasta) === path.resolve(process.env.HOME || "", ".tjro-jurisprudencia-recibos")) { console.error("use uma CÓPIA"); process.exit(2); }
const imp = (f) => import(pathToFileURL(path.join(dirServer, f)).href);
const lib = await imp("lib.js");
const cus = await imp("custodia.js");

const arqs = fs.readdirSync(pasta).filter((f) => /^\d+\.json$/.test(f)).sort();
const out = { resultado: {}, desfecho: {}, transcritas: {} };
let tCustodia = 0;
for (const f of arqs) {
  let r;
  try { r = JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8")); } catch { continue; }
  if (!r || !r.texto) continue;
  const id = String(r.id_documento);
  const tipo = String(r.tipo || "").toUpperCase();
  if (tipo === "SENTENÇA") out.desfecho[id] = lib.desfechoDeSentenca(r.texto, r.tipo, r.classe) || null;
  else if (["ACÓRDÃO", "EMENTA", "VOTO", "VOTO VENCEDOR", "DECISÃO"].includes(tipo)) {
    const ro = lib.resultadoComOrigem(r.texto, r.tipo);
    out.resultado[id] = lib.rotuloDoConjunto(ro.conjunto, r.classe, ro.embargos) || null;
  }
  if (["ACÓRDÃO", "EMENTA", "VOTO", "VOTO VENCEDOR", "DECISÃO", "RELATÓRIO", "SENTENÇA"].includes(tipo)) {
    const t0 = Date.now();
    const c = cus.camposAlheios(r.texto, r.tipo);
    tCustodia += Date.now() - t0;
    out.transcritas[id] = (c.trechos_transcritos || []).map((x) => x.length + ":" + x.slice(0, 60));
  }
}
out.tempo_custodia_ms = tCustodia;
const json = JSON.stringify(out);
if (saida) fs.writeFileSync(saida, json); else process.stdout.write(json);
console.error(`resultado=${Object.keys(out.resultado).length} desfecho=${Object.keys(out.desfecho).length} custódia=${Object.keys(out.transcritas).length} em ${tCustodia} ms`);
