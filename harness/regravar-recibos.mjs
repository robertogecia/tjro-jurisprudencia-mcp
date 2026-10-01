#!/usr/bin/env node
// Acrescenta os campos de custódia da v1.7.16 aos recibos gravados por versões anteriores — offline, só com o
// `texto` e o `tipo` que já estão no arquivo; nenhuma requisição ao portal. Sem --gravar, só conta.
//   node harness/regravar-recibos.mjs            (mostra quantos mudariam)
//   node harness/regravar-recibos.mjs --gravar   (regrava, arquivo a arquivo, de forma atômica)
//   node harness/regravar-recibos.mjs --recalcular [--gravar]
//        recalcula os campos de custódia de TODOS os recibos com a lógica atual (v1.10.1: depois de corrigir a
//        heurística, os recibos gravados antes carregam o resultado antigo). Conta e mostra quantos mudariam;
//        só grava com --gravar. Nunca toca em texto, id, tipo ou data: só nos campos que camposAlheios produz.
import fs from "node:fs";
import path from "node:path";
import { camposAlheios } from "../server/custodia.js";
import { dirRecibos } from "../server/lib.js";

const dir = dirRecibos(), gravar = process.argv.includes("--gravar"), recalcular = process.argv.includes("--recalcular");
const CAMPOS = ["trechos_transcritos", "trecho_divergente", "texto_voz_propria"];
let n = 0, mudou = 0;
for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
  const p = path.join(dir, f);
  let r;
  try { r = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
  if (!r.texto) continue;
  n++;
  if (recalcular) {
    const novo = camposAlheios(r.texto, r.tipo);
    if (CAMPOS.every((k) => JSON.stringify(r[k]) === JSON.stringify(novo[k]))) continue;
    mudou++;
    console.log(`  ${f}: ${(r.trechos_transcritos || []).map((x) => x.length).join("+") || "0"} → ${novo.trechos_transcritos.map((x) => x.length).join("+") || "0"} caracteres transcritos`);
    if (!gravar) continue;
    for (const k of CAMPOS) delete r[k];
    Object.assign(r, novo, { normalizacao: "trechos em bruto, recortados de `texto` — normalize com a sua própria função" });
  } else {
    if ("trechos_transcritos" in r) continue;
    mudou++;
    if (!gravar) continue;
    Object.assign(r, camposAlheios(r.texto, r.tipo), { normalizacao: "trechos em bruto, recortados de `texto` — normalize com a sua própria função" });
  }
  const tmp = path.join(dir, `.${f}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(r));
  fs.renameSync(tmp, p);
}
console.log(`${n} recibos em ${dir}; ${mudou} ${recalcular ? "com custódia diferente da lógica atual" : "sem os campos de custódia"}${gravar ? " — regravados" : " (use --gravar)"}`);
