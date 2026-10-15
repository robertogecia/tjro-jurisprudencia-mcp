// v1.37.0 — cache em disco do que se calcula por recibo (precedentes.js). Sem rede; pastas temporárias.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("distinguir grava só tokens e citações no cache, e a 2ª execução dá a mesma saída (processos separados)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tjro disco "));
  const rec = path.join(tmp, "recibos"), cache = path.join(tmp, "cache");
  fs.mkdirSync(rec); fs.mkdirSync(cache);
  const mk = (id, nr, data, texto, classe = "APELAÇÃO CÍVEL") => fs.writeFileSync(path.join(rec, `${id}.json`), JSON.stringify({ id_documento: id, nr_processo: nr, tipo: "ACÓRDÃO", data_julgamento: data, classe, texto }));
  const ementa = (x) => `EMENTA I. CASO EM EXAME 1. Apelação contra sentença sobre ${x}. II. QUESTÃO EM DISCUSSÃO 2. validade. III. RAZÕES DE DECIDIR 3. contrato de cartão de crédito consignado com reserva de margem. IV. DISPOSITIVO 4. Recurso desprovido. Acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO À UNANIMIDADE.`;
  mk("100", "70000010120208220001", "01/02/2025", "RELATÓRIO Apelação. VOTO " + ementa("cartão consignado"));
  mk("200", "70000020220258220001", "01/06/2026", "RELATÓRIO Apelação. VOTO Cita o processo 7000001-01.2020.8.22.0001. " + ementa("cartão consignado"));
  const roda = () => spawnSync(process.execPath, ["--input-type=module", "-e",
    `const M = await import(${JSON.stringify(path.join(RAIZ, "server/precedentes.js"))}); console.log(M.distinguir({ id_documento: "100", fatos_do_caso: "cartão de crédito consignado" }));`],
  { env: { ...process.env, TJRO_MCP_DIR_RECIBOS: rec, TJRO_MCP_DIR_CACHE: cache }, encoding: "utf8" });
  const a = roda(), b = roda();
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, b.stdout);
  const arq = path.join(cache, "precedentes-derivados.json");
  assert.ok(fs.existsSync(arq));
  const conteudo = fs.readFileSync(arq, "utf8");
  assert.ok(!/Apelação contra sentença sobre/.test(conteudo), "o cache não pode guardar texto de decisão");
  const d = JSON.parse(conteudo);
  assert.ok(d.assinatura && Object.keys(d.m).length >= 1);
  // assinatura diferente = arquivo descartado, saída igual
  d.assinatura = "outra";
  fs.writeFileSync(arq, JSON.stringify(d));
  assert.equal(roda().stdout, a.stdout);
});
