import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { anotarRequisicao, lerRitmo, contextoDoBloqueio, analisarBloqueios, recomendacao, formatarRelatorio, RITMO_MAX_LINHAS } from "../server/bloqueios.js";

const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
const req = (s, res = "ok", extra = {}) => ({ t: T0 + s * 1000, impl: "node", pid: 1, id: "honesta", op: "busca", res, ...extra });

test("livro-razão: anota, relê em ordem e nunca grava texto de busca", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ritmo-")), "r.jsonl");
  anotarRequisicao({ t: T0 + 5000, op: "busca", res: "ok", status: 200, durMs: 300, consulta: "segredo", nr_processo: "123" }, f);
  anotarRequisicao({ t: T0, op: "inteiro_teor", res: "bloqueio", status: 403 }, f);
  const r = lerRitmo(f);
  assert.equal(r.length, 2);
  assert.ok(r[0].t < r[1].t);
  const cru = fs.readFileSync(f, "utf-8");
  assert.ok(!/segredo|123/.test(cru));
});

test("livro-razão: rotaciona sem passar do limite", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ritmo-")), "r.jsonl");
  const linha = JSON.stringify(req(0)) + "\n";
  fs.writeFileSync(f, linha.repeat(Math.ceil(700_000 / linha.length) + 5));
  anotarRequisicao({ t: T0, res: "ok" }, f);
  assert.ok(lerRitmo(f).length <= RITMO_MAX_LINHAS);
});

test("contexto: intervalo abaixo do mínimo, rajada e processos", () => {
  const ritmo = [req(0), req(4.3), req(8.6), req(12.9), req(17.2)];
  const c = contextoDoBloqueio(ritmo, T0 + 21_500, 7000, { status: 200 });
  assert.equal(c.gapAntesS, 4.3);
  assert.equal(c.abaixoDoMinimo, true);
  assert.equal(c.reqs60s, 5);
  assert.equal(c.processos120s, 1);
  assert.equal(c.sequencia.length, 5);
  assert.equal(c.sequencia[4].antesS, 4.3);
});

test("análise: taxa por faixa e rajada máxima sem bloqueio", () => {
  const ritmo = [req(0), req(8), req(16), req(20), req(24, "corrompida")];
  const a = analisarBloqueios({ ritmo, incidentes: [], espacamentoMinMs: 7000, janelaMax: 10, agora: T0 + 30_000 });
  const f48 = a.faixas.find((f) => f.nome === "< 5 s");
  assert.equal(f48.reqs, 2); // 16→20 e 20→24
  assert.equal(f48.bloqueios, 1);
  assert.equal(a.bloqueios, 1);
  assert.equal(a.blocAbaixo, 1);
  assert.equal(a.maxRajadaOk, 4);
});

test("recomendação: poucos dados não mexe nos parâmetros", () => {
  const a = analisarBloqueios({ ritmo: [req(0), req(8)], incidentes: [], agora: T0 + 9000 });
  assert.match(recomendacao(a).join(" "), /Dados insuficientes/);
  assert.match(recomendacao(a).join(" "), /Manter os parâmetros atuais/);
});

test("recomendação: 120 requisições ≥7 s sem bloqueio confirma o espaçamento; bloqueio com intervalo ok aponta outra causa", () => {
  const ok = Array.from({ length: 120 }, (_, i) => req(i * 8));
  assert.match(recomendacao(analisarBloqueios({ ritmo: ok, agora: T0 + 1_000_000 })).join(" "), /nenhum bloqueio/);
  const com = [...ok, req(121 * 8, "bloqueio")];
  assert.match(recomendacao(analisarBloqueios({ ritmo: com, agora: T0 + 1_000_000 })).join(" "), /NÃO é só o espaçamento/);
});

test("relatório: mostra tabela, veredito do incidente e a sequência", () => {
  const ritmo = [req(0), req(4.3), req(8.6)];
  const contexto = contextoDoBloqueio(ritmo, T0 + 12_900, 7000, { status: 200, ctype: "text/html", server: "x", retryAfter: null, bytes: 10, assinatura: "STIC - Página Bloqueada" });
  const inc = [{ quando: T0 + 12_900, operacao: "busca", tipo: "resposta_corrompida", identidade: "honesta", contexto }];
  const txt = formatarRelatorio(analisarBloqueios({ ritmo, incidentes: inc, agora: T0 + 20_000 }));
  assert.match(txt, /Relatório de bloqueios/);
  assert.match(txt, /\| < 5 s \|/);
  assert.match(txt, /abaixo do mínimo de 7 s/);
  assert.match(txt, /últimas 3 antes do bloqueio/);
  assert.match(txt, /STIC - Página Bloqueada/);
});

test("incidente antigo (sem contexto) ainda sai no relatório", () => {
  const inc = [{ quando: T0, operacao: "busca", tipo: "resposta_corrompida", reqsUltimos60s: 1 }];
  const txt = formatarRelatorio(analisarBloqueios({ ritmo: [], incidentes: inc, agora: T0 + 1000 }));
  assert.match(txt, /anterior à v1\.28/);
});

import { post, _setArquivoEstadoParaTeste, relatorioDeBloqueios } from "../server/lib.js";

test("post() com bloqueio: grava o livro-razão (sem texto de busca) e o incidente leva o contexto e a resposta do portal", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bloq-e2e-"));
  const livro = path.join(dir, "ritmo.jsonl");
  _setArquivoEstadoParaTeste(path.join(dir, "estado.json"));
  const antes = process.env.TJRO_MCP_ARQUIVO_RITMO;
  process.env.TJRO_MCP_ARQUIVO_RITMO = livro;
  try {
    const bloqueio = { ok: true, status: 200, headers: { get: (k) => (k === "content-type" ? "text/html" : k === "server" ? "stic" : null) }, text: async () => "<html>STIC - Página Bloqueada. Robotização detectada</html>" };
    // duas consultas anteriores bem-sucedidas, para a sequência ter o que mostrar
    const ok = { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ hits: { hits: [] } }), text: async () => "" };
    await post({ fields: { query: "segredo-confidencial-1" } }, async () => ok);
    await post({ fields: { query: "segredo-confidencial-2" } }, async () => ok);
    await assert.rejects(() => post({ fields: { query: "segredo-confidencial-3" } }, async () => bloqueio));
    const r = lerRitmo(livro);
    assert.equal(r.length, 3);
    assert.deepEqual(r.map((x) => x.res), ["ok", "ok", "bloqueio"]);
    assert.ok(!/segredo/.test(fs.readFileSync(livro, "utf-8")), "o livro-razão não pode guardar texto de busca");
    const rel = relatorioDeBloqueios();
    assert.match(rel, /Incidentes de bloqueio: 1/);
    assert.match(rel, /últimas 2 antes do bloqueio/);
    assert.match(rel, /STIC - Página Bloqueada/);
    assert.match(rel, /Dados insuficientes/);
  } finally {
    if (antes === undefined) delete process.env.TJRO_MCP_ARQUIVO_RITMO; else process.env.TJRO_MCP_ARQUIVO_RITMO = antes;
  }
});
