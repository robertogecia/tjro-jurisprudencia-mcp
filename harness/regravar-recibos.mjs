#!/usr/bin/env node
// Acrescenta os campos de custódia da v1.7.16 aos recibos gravados por versões anteriores — offline, só com o
// `texto` e o `tipo` que já estão no arquivo; nenhuma requisição ao portal. Sem --gravar, só conta.
//   node harness/regravar-recibos.mjs            (mostra quantos mudariam)
//   node harness/regravar-recibos.mjs --gravar   (regrava, arquivo a arquivo, de forma atômica)
import fs from "node:fs";
import path from "node:path";
import { camposAlheios } from "../server/custodia.js";
import { dirRecibos } from "../server/lib.js";

const dir = dirRecibos(), gravar = process.argv.includes("--gravar");
let n = 0, mudou = 0;
for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
  const p = path.join(dir, f);
  let r;
  try { r = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
  if (!r.texto) continue;
  n++;
  if ("trechos_transcritos" in r) continue;
  mudou++;
  if (!gravar) continue;
  Object.assign(r, camposAlheios(r.texto, r.tipo), { normalizacao: "trechos em bruto, recortados de `texto` — normalize com a sua própria função" });
  const tmp = path.join(dir, `.${f}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(r));
  fs.renameSync(tmp, p);
}
console.log(`${n} recibos em ${dir}; ${mudou} sem os campos de custódia${gravar ? " — regravados" : " (use --gravar)"}`);
