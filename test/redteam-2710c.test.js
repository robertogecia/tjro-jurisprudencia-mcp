import { fileURLToPath } from "node:url";
// 1.42.0 (não publicada) — 4º red team de 27/10/2026. Sem rede, sem portal, sem Liame de verdade: fetch INJETADO, estado do
// Liame e cache em os.tmpdir(). Nenhum teste lê ~/.tjro-*. Importa por namespace para rodar também contra o código anterior.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as lib from "../server/lib.js";
import * as L from "../server/liame.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-rt2710c-"));
const ARQ = path.join(tmp, "estado-liame.json");
L._setArquivoEstadoLiameParaTeste(ARQ);
process.env.TJRO_MCP_DIR_CACHE = path.join(tmp, "cache");
let T;
beforeEach(() => {
  T = Date.UTC(2026, 9, 27, 12, 0, 0);
  L._setRelogioLiameParaTeste(() => T, async (ms) => { T += ms; });
  L._setPrazoTravaRegistroLiameParaTeste(50);
  try { fs.unlinkSync(ARQ + ".lock"); } catch {}
  L._resetLiameParaTeste();
  fs.rmSync(process.env.TJRO_MCP_DIR_CACHE, { recursive: true, force: true });
});
const resposta = (status, corpo, tipo = "application/json") => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => (k.toLowerCase() === "content-type" ? tipo : null) },
  text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)),
});
const ehSync = (u) => /\/api\/sync\//.test(String(u));
const vazio = (has_next = false) => ({ data: { results: [], total: has_next ? 60 : 0, page: 1, total_pages: has_next ? 3 : 1, has_next } });

for (const [nome, recusa] of [["403", () => resposta(403, "{}")], ["HTML", () => resposta(200, "<html><script src='/TSPD/x'></script></html>", "text/html")]]) {
  test(`(1) sync com ${nome}: 12 buscas idênticas fazem no máximo 1 pesquisa + 2 syncs vivas`, async () => {
    let pesquisas = 0, syncs = 0;
    const f = async (u) => { if (ehSync(u)) { syncs++; return recusa(); } pesquisas++; return resposta(200, vazio()); };
    for (let i = 0; i < 12; i++) { await L.buscarLiame({ texto: "cartão" }, f); T += 8000; }
    assert.ok(pesquisas <= 1, `pesquisas=${pesquisas}`);
    assert.ok(syncs <= 2, `syncs vivas=${syncs}`);
  });
}

test("(1) verificarLiame com 3 páginas lê a sync no máximo uma vez", async () => {
  let pesquisas = 0, syncs = 0;
  const f = async (u) => { if (ehSync(u)) { syncs++; return resposta(403, "{}"); } pesquisas++; return resposta(200, vazio(true)); };
  const v = await L.verificarLiame({ numero: "15", sigla: "TJRO" }, f);
  assert.equal(v.paginasLidas, 3);
  assert.equal(pesquisas, 3);
  assert.ok(syncs <= 1, `syncs vivas=${syncs}`);
});

test("(2) recuo pendente com relógio efetivo 23 h à frente: a vaga seguinte é recusada", async () => {
  fs.writeFileSync(ARQ, JSON.stringify({ ultimoAgora: T + 23 * 3600_000 }));
  const f = async () => { fs.writeFileSync(ARQ + ".lock", "outro processo"); return resposta(403, "{}"); };
  await assert.rejects(() => L.chamarLiame(L.LIAME_PESQUISA, {}, f), /HTTP 403/);
  assert.ok(L._pendenteLiameParaTeste(), "recuo ficou pendente");
  fs.unlinkSync(ARQ + ".lock");
  T += 7000;
  const r = L.reservarLiame();
  assert.equal(r.tipo, "bloqueio", `a vaga não pode ser dada: ${JSON.stringify(r)}`);
});

test("(3) espera síncrona pela trava soma até 10 s (2 s + 8 s)", () => {
  assert.equal(L.PRAZO_TRAVA_REGISTRO_MS, 8000);
});

test("(4) link só de host exato conhecido", () => {
  for (const u of ["https://evil.cnj.jus.br/", "https://x.pdpj.jus.br/", "https://a.stf.jus.br/", "https://qualquer.tjro.jus.br/"]) assert.equal(L.linkConfiavel(u), null, u);
  for (const h of ["stf.jus.br", "www.stf.jus.br", "portal.stf.jus.br", "stj.jus.br", "www.stj.jus.br", "processo.stj.jus.br", "scon.stj.jus.br", "tjro.jus.br", "www.tjro.jus.br", "pangeabnp.pdpj.jus.br", "pangeabnp.cnj.jus.br", "www.planalto.gov.br", "planalto.gov.br"])
    assert.ok(L.linkConfiavel(`https://${h}/x`), h);
  // hosts que aparecem nas respostas gravadas do Liame continuam com link
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "liame");
  const hosts = new Set();
  for (const a of fs.readdirSync(dir)) for (const m of fs.readFileSync(path.join(dir, a), "utf8").replace(/\\\//g, "/").matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
  for (const h of hosts) if (/(stf|stj|tjro)\.jus\.br$/.test(h) && !/^liame-back\./.test(h)) assert.ok(L.linkConfiavel(`https://${h}/x`), `fixture: ${h}`);
});

test("(5) curtoLiame: sem bidi nem largura zero, escapa _ | ~ e desarma www.", () => {
  const c = L.curtoLiame("A\u202EB\u2066C\u200BD\u200DE _f_ g|h~i www.evil.example/x ACORDAO_PUBLICADO");
  assert.doesNotMatch(c, /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/);
  assert.match(c, /\\_/); assert.match(c, /\\\|/); assert.match(c, /\\~/);
  assert.doesNotMatch(c, /(^|[^\\])www\.evil/);
  assert.match(c, /ACORDAO_PUBLICADO/, "_ dentro de palavra fica como está");
});

test("(6) assuntos passam pela validação: sem objeto, sem NUL", () => {
  assert.throws(() => L.buildCorpoLiame({ assuntos: [{ a: 1 }] }), /Assunto 1 inválido/);
  assert.deepEqual(L.buildCorpoLiame({ assuntos: ["a\u0000b", "  "] }).assuntos, ["ab"]);
});

test("(7) limitarSaida: separador do modo compacto e cabeçalho maior que o teto", () => {
  const linhas = Array.from({ length: 400 }, (_, i) => `${i + 1}. ACÓRDÃO · ${"x".repeat(200)}`);
  const compacto = `**Busca**\n\n**Lista compacta**:\n${linhas.join("\n")}\n_fim_`;
  const o = lib.limitarSaida(compacto, 60000, { pagina: 1 });
  const m = /SAÍDA CORTADA: (\d+) de (\d+)/.exec(o);
  assert.ok(m && Number(m[1]) > 0 && Number(m[2]) === 400, o.slice(-400));
  assert.match(o, /pagina=2 com por_pagina=\d+/);
  const grande = `${"c".repeat(70000)}\n---\n**1. resultado`;
  assert.match(lib.limitarSaida(grande, 60000), /INCOMPLETO/);
});
