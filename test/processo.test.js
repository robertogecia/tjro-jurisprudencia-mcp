import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _setArquivoEstadoParaTeste, _resetDisjuntorParaTeste, registrarBloqueioDetectado } from "../server/lib.js";
import { cnjMascara, consultarProcesso, formatProcesso, validarCnjTjro, ErroProcesso, lerCacheProcesso } from "../server/processo.js";

_setArquivoEstadoParaTeste(path.join(os.tmpdir(), "_teste_disjuntor_tjro_proc.json"));
process.env.TJRO_MCP_DIR_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-proc-"));

const resp = (status, corpo) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => corpo });
const PROC = {
  processoPg: {
    orgaoJulgador: { dsOrgaoJulgador: "PORTO VELHO - 9ª VARA CÍVEL" },
    classe: { dsClasse: "CUMPRIMENTO DE SENTENÇA" },
    dtAutuacao: "2022-04-01T00:00:00",
    flBaixado: "N", flSegredoJustica: "N",
    movimentos: [
      { dtMovimento: "2026-09-10T00:00:00", movimento: { dsMovimento: "Conclusão" } },
      { dtMovimento: "2026-09-19T00:25:15", movimento: { dsMovimento: "Movimento Local", dsMovimentoExterno: "Movimento Local" } },
    ],
  },
};

test("máscara CNJ e recusa de número inválido", async () => {
  assert.equal(cnjMascara("70149494920228220001"), "7014949-49.2022.8.22.0001");
  assert.equal(cnjMascara("123"), null);
  await assert.rejects(() => consultarProcesso("123", resp(200, PROC)), /20 dígitos/);
  assert.equal(validarCnjTjro("7014949-49.2022.8.22.0001"), null);
  assert.match(validarCnjTjro("7014949-48.2022.8.22.0001"), /dígito verificador/);
  assert.match(validarCnjTjro("7014949-49.2022.8.26.0001"), /não é do TJRO/);
});

test("formata capa e movimentos, mais recente primeiro, e avisa sobre Movimento Local e prazo", async () => {
  _resetDisjuntorParaTeste();
  const res = await consultarProcesso("7014949-49.2022.8.22.0001", resp(200, PROC));
  const t = formatProcesso(res, "7014949-49.2022.8.22.0001");
  assert.match(t, /9ª VARA CÍVEL/);
  assert.ok(t.indexOf("19/09/2026") < t.indexOf("10/09/2026"), "mais recente primeiro");
  assert.match(t, /1 só como "Movimento Local"/);
  assert.match(t, /NUNCA use estas datas para contar prazo/);
  assert.match(t, /Sem dados de 2º grau/);
});

test("segunda consulta do mesmo processo vem do cache, sem rede", async () => {
  let rede = 0;
  const f = async () => { rede += 1; return { status: 200, ok: true, json: async () => PROC }; };
  const res = await consultarProcesso("7014949-49.2022.8.22.0001", f);
  assert.equal(rede, 0);
  assert.ok(res.doCache);
});

test("404 vira 'número incorreto ou segredo', nunca 'não existe'", async () => {
  _resetDisjuntorParaTeste();
  const res = await consultarProcesso("0000001-95.2020.8.22.0001", resp(404, null));
  const t = formatProcesso(res, "0000001-95.2020.8.22.0001");
  assert.match(t, /segredo de justiça/);
  assert.match(t, /não prova que o processo não existe/);
});

test("descrição com modelo sem preencher (#{...}) não vaza para a saída", async () => {
  _resetDisjuntorParaTeste();
  const P = { processoPg: { movimentos: [
    { dtMovimento: "2026-09-09T10:00:00", movimento: { dsMovimento: "Expedição de documento", dsMovimentoExterno: "Expedição de #{tipo_de_documento}." } },
    { dtMovimento: "2026-09-08T10:00:00", movimento: { dsMovimentoExterno: "Conclusos #{tipo_de_conclusao}" } },
  ] } };
  const t = formatProcesso(await consultarProcesso("0000002-80.2020.8.22.0001", resp(200, P)), "0000002-80.2020.8.22.0001");
  assert.doesNotMatch(t, /#\{/);
  assert.match(t, /Expedição de documento/);
  assert.match(t, /Conclusos/);
});

test("red team: nenhum erro da API de processos usa a mensagem do JURIS", async () => {
  _resetDisjuntorParaTeste();
  const casos = [
    [async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; }, /não respondeu em 30 s/],
    [async () => { const e = new TypeError("fetch failed"); e.cause = { message: "Response does not match the HTTP/1.1 protocol (Invalid header value char)" }; throw e; }, /Falha de conexão/],
    [resp(429, null), /reduzir o ritmo/],
    [resp(403, null), /exigir autenticação/],
    [resp(500, null), /HTTP 500/],
    [async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("Unexpected token <"); } }), /não é JSON/],
  ];
  for (const [f, re] of casos) {
    _resetDisjuntorParaTeste();
    await assert.rejects(() => consultarProcesso("0000003-65.2020.8.22.0001", f), (e) => e instanceof ErroProcesso && re.test(e.message) && !/juris\.tjro|bloqueou esta pesquisa/i.test(e.message) && /não indica que o processo não existe/.test(e.message));
  }
});

test("red team: bloqueio do JURIS não impede a consulta de processo", async () => {
  _resetDisjuntorParaTeste();
  registrarBloqueioDetectado(Date.now());
  const res = await consultarProcesso("0000004-50.2020.8.22.0001", resp(200, PROC));
  assert.ok(res.dados);
});

test("red team: processoPg vazio e movimentos malformados", async () => {
  _resetDisjuntorParaTeste();
  assert.ok((await consultarProcesso("0000005-35.2020.8.22.0001", resp(200, { processoPg: {} }))).vazio);
  _resetDisjuntorParaTeste();
  const P = { processoPg: { classe: { dsClasse: "X" }, movimentos: [
    { movimento: { dsMovimento: "Sem data" } },
    { dtMovimento: "10/09/2026", movimento: { dsMovimento: "Formato BR" } },
    { dtMovimento: "2026-09-19T08:00:00", movimento: { dsMovimento: "ISO" } },
  ] } };
  const t = formatProcesso(await consultarProcesso("0000006-20.2020.8.22.0001", resp(200, P)), "0000006-20.2020.8.22.0001");
  assert.ok(t.indexOf("19/09/2026 · ISO") < t.indexOf("10/09/2026 · Formato BR"));
  assert.match(t, /1 sem data legível/);
  assert.doesNotMatch(t, /\? ·/);
  _resetDisjuntorParaTeste();
  const Q = { processoPg: { classe: { dsClasse: "X" }, movimentos: { a: 1 } } };
  assert.match(formatProcesso(await consultarProcesso("0000007-05.2020.8.22.0001", resp(200, Q)), "0000007-05.2020.8.22.0001"), /não trouxe movimentos/);
});

test("red team: cache com data no futuro ou de outro processo é ignorado", () => {
  const dir = process.env.TJRO_MCP_DIR_CACHE;
  const d = "0000001-95.2020.8.22.0001".replace(/\D/g, "");
  fs.writeFileSync(path.join(dir, `processo-${d}.json`), JSON.stringify({ nr: d, quando: Date.now() + 86400000, dados: PROC }));
  assert.equal(lerCacheProcesso("0000001-95.2020.8.22.0001"), null);
  fs.writeFileSync(path.join(dir, `processo-${d}.json`), JSON.stringify({ nr: "99999999999999999999", quando: Date.now(), dados: PROC }));
  assert.equal(lerCacheProcesso("0000001-95.2020.8.22.0001"), null);
});
