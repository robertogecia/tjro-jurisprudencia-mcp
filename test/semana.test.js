// Aviso de versão: uma consulta por semana, com registro local. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checarSemanal, lerRegistro, consultaVencida, SEMANA_MS } from "../server/semana.js";

const maisNova = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number); for (let i = 0; i < 3; i++) if (y[i] !== x[i]) return y[i] > x[i]; return false; };
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "aviso-")), "aviso.json");
const DIA = 24 * 60 * 60 * 1000, T0 = Date.parse("2026-10-22T12:00:00Z");

test("1ª sessão consulta e registra; as da mesma semana usam o registro, sem rede", async () => {
  const arquivo = tmp(); let consultas = 0;
  const consultar = async () => { consultas++; return "1.8.0"; };
  assert.equal(await checarSemanal({ arquivo, consultar, versaoMaisNova: maisNova, atual: "1.7.0", agora: () => T0 }), "1.8.0");
  assert.equal(consultas, 1);
  const reg = lerRegistro(arquivo);
  assert.equal(reg.versao_vista, "1.8.0");
  assert.equal(reg.ultima_checagem, new Date(T0).toISOString());
  // 3 dias depois: não consulta, mas continua sugerindo (a versão instalada ainda é a antiga)
  assert.equal(await checarSemanal({ arquivo, consultar, versaoMaisNova: maisNova, atual: "1.7.0", agora: () => T0 + 3 * DIA }), "1.8.0");
  assert.equal(consultas, 1);
  // depois de atualizar, para de sugerir, ainda sem rede
  assert.equal(await checarSemanal({ arquivo, consultar, versaoMaisNova: maisNova, atual: "1.8.0", agora: () => T0 + 4 * DIA }), null);
  assert.equal(consultas, 1);
});

test("passada a semana, consulta de novo e atualiza o registro", async () => {
  const arquivo = tmp(); let tag = "1.8.0", consultas = 0;
  const consultar = async () => { consultas++; return tag; };
  await checarSemanal({ arquivo, consultar, versaoMaisNova: maisNova, atual: "1.7.0", agora: () => T0 });
  tag = "1.9.0";
  assert.equal(await checarSemanal({ arquivo, consultar, versaoMaisNova: maisNova, atual: "1.7.0", agora: () => T0 + 7 * DIA }), "1.9.0");
  assert.equal(consultas, 2);
  assert.equal(lerRegistro(arquivo).ultima_checagem, new Date(T0 + 7 * DIA).toISOString());
});

test("consulta que falha não grava registro: tenta de novo na sessão seguinte; nunca lança", async () => {
  const arquivo = tmp(); let consultas = 0;
  const falha = async () => { consultas++; return null; };
  assert.equal(await checarSemanal({ arquivo, consultar: falha, versaoMaisNova: maisNova, atual: "1.7.0", agora: () => T0 }), null);
  assert.equal(fs.existsSync(arquivo), false);
  assert.equal(await checarSemanal({ arquivo, consultar: falha, versaoMaisNova: maisNova, atual: "1.7.0", agora: () => T0 + DIA }), null);
  assert.equal(consultas, 2);
  assert.equal(await checarSemanal({ arquivo, consultar: async () => { throw new Error("x"); }, versaoMaisNova: maisNova, atual: "1.7.0" }), null);
});

test("registro ilegível ou com data no futuro vale como vencido; sem arquivo consulta sempre", async () => {
  const arquivo = tmp(); fs.writeFileSync(arquivo, "{não é json");
  assert.deepEqual(lerRegistro(arquivo), { ultima_checagem: null, versao_vista: null });
  assert.ok(consultaVencida({ ultima_checagem: new Date(T0 + 30 * DIA).toISOString(), versao_vista: "9.9.9" }, T0));
  assert.ok(!consultaVencida({ ultima_checagem: new Date(T0 - 6 * DIA).toISOString(), versao_vista: null }, T0));
  assert.ok(consultaVencida({ ultima_checagem: new Date(T0 - SEMANA_MS).toISOString(), versao_vista: null }, T0));
  let n = 0; const c = async () => { n++; return "2.0.0"; };
  await checarSemanal({ arquivo: null, consultar: c, versaoMaisNova: maisNova, atual: "1.0.0" });
  await checarSemanal({ arquivo: null, consultar: c, versaoMaisNova: maisNova, atual: "1.0.0" });
  assert.equal(n, 2);
});

test("o registro guarda só data e versão, com modo 0600", async () => {
  const arquivo = tmp();
  await checarSemanal({ arquivo, consultar: async () => "1.8.0", versaoMaisNova: maisNova, atual: "1.7.0", agora: () => T0 });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(arquivo, "utf8"))).sort(), ["ultima_checagem", "versao_vista"]);
  if (process.platform !== "win32") assert.equal(fs.statSync(arquivo).mode & 0o777, 0o600);
});

test("checarVersaoSemanal (integração): usa o arquivo informado e o desligador da variável de ambiente", async () => {
  const { checarVersaoSemanal, VERSAO } = await import("../server/lib.js");
  const arquivo = tmp(); let n = 0;
  const fetchImpl = async () => { n++; return { ok: true, status: 200, json: async () => ({ tag_name: "v99.0.0" }) }; };
  assert.equal(await checarVersaoSemanal({ atual: VERSAO, fetchImpl, env: {}, arquivoAviso: arquivo }), "99.0.0");
  assert.equal(await checarVersaoSemanal({ atual: VERSAO, fetchImpl, env: {}, arquivoAviso: arquivo }), "99.0.0");
  assert.equal(n, 1, "a segunda sessão da semana não consulta");
  assert.equal(await checarVersaoSemanal({ atual: VERSAO, fetchImpl, env: { TJRO_MCP_SEM_AVISO_ATUALIZACAO: "1" }, arquivoAviso: arquivo }), null);
});
