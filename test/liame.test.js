import { fileURLToPath } from "node:url";
// 1.41.11: Liame. Só fetch INJETADO e fixtures reais (test/fixtures/liame/); nenhuma chamada de rede de verdade.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCorpoLiame, normEspecies, normSiglas, normData, normalizarRegistro, formatarBuscaLiame, formatarRegistro,
  buscarLiame, verificarLiame, formatarVerificacaoLiame, chamarLiame, reservarLiame, reservarLiameComEspera,
  estadoLiame, dataDaSync, ErroLiame, LIAME_PESQUISA, LIAME_SYNC, ROTULO_LIAME, ESPECIES_LIAME,
  _setArquivoEstadoLiameParaTeste, _resetLiameParaTeste, _setRelogioLiameParaTeste,
} from "../server/liame.js";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "liame");
const TJRO = JSON.parse(fs.readFileSync(path.join(FIX, "resposta_tjro_irdr.json"), "utf8"));
const SUP = JSON.parse(fs.readFileSync(path.join(FIX, "resposta_stj_stf.json"), "utf8"));
const LANDING = fs.readFileSync(path.join(FIX, "landing.html"), "utf8");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-liame-"));
_setArquivoEstadoLiameParaTeste(path.join(tmp, "estado-liame.json"));
process.env.TJRO_MCP_DIR_CACHE = path.join(tmp, "cache");
assert.ok(!path.join(tmp, "estado-liame.json").startsWith(path.join(os.homedir(), ".tjro")), "nunca o estado real");

let T;
beforeEach(() => {
  T = Date.UTC(2026, 9, 27, 12, 0, 0);
  _setRelogioLiameParaTeste(() => T, async (ms) => { T += ms; });
  _resetLiameParaTeste();
  fs.rmSync(process.env.TJRO_MCP_DIR_CACHE, { recursive: true, force: true });
});

const resposta = (status, corpo, ct = "application/json") => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => (k.toLowerCase() === "content-type" ? ct : null) },
  text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)),
});
const SYNC = { status: "SUCCESS", iniciado_em: "2026-10-26T02:00:00", finalizado_em: "2026-10-26T03:15:00" };
function falso(principal) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, init, t: T });
    if (Object.values(LIAME_SYNC).includes(url)) return resposta(200, SYNC);
    return typeof principal === "function" ? principal(url, init) : principal;
  };
  f.chamadas = chamadas;
  return f;
}

test("corpo: padrões, apelidos, datas, teto de 20 por página", () => {
  const c = buildCorpoLiame({ texto: " cartão consignado ", especies: ["irdr", "IAC"], siglas: ["tjro"], data_inicio: "01/02/2025", por_pagina: 99, pagina: 2 });
  assert.deepEqual(c.siglas, ["TJRO"]);
  assert.deepEqual(c.especies, ["incidente_demanda_repetitiva", "incidente_assuncao_competencia", "incidente_assuncao_competencia_stj"]);
  assert.equal(c.texto, "cartão consignado");
  assert.equal(c.data_inicio, "2025-02-01");
  assert.equal(c.page_size, 20);
  assert.equal(c.page, 2);
  assert.equal(c.ordenacao, "dataAtualizacao_desc");
  assert.deepEqual(Object.keys(c).sort(), ["assuntos", "data_final", "data_inicio", "especies", "numero", "numero_processo_paradigma", "ordenacao", "page", "page_size", "siglas", "situacao", "texto"].sort());
  const d = buildCorpoLiame({});
  assert.deepEqual(d.siglas, ["STF", "STJ", "TJRO"]);
  assert.deepEqual(d.especies, ESPECIES_LIAME);
  assert.equal(d.texto, null);
  assert.equal(buildCorpoLiame({ situacao: "acordao publicado" }).situacao, "ACORDAO_PUBLICADO");
});

test("apelidos: rg, sv, súmula, repetitivo, adi, nome técnico; desconhecido recusa", () => {
  assert.deepEqual(normEspecies(["rg"]), ["repercussao_geral"]);
  assert.deepEqual(normEspecies(["SV", "súmula"]), ["sumulas_vinculantes_stf", "sumulas_stf"]);
  assert.deepEqual(normEspecies(["repetitivo", "recurso_repetitivo"]), ["recurso_repetitivo"]);
  assert.deepEqual(normEspecies(["adi", "adpf"]), ["adi_stf", "adpf_stf"]);
  assert.deepEqual(normEspecies(["Repercussão geral"]), ["repercussao_geral"]);
  assert.throws(() => normEspecies(["habeas"]), ErroLiame);
  assert.throws(() => normSiglas(["TJSP"]), /cobre STF, STJ, TJRO/);
  assert.throws(() => normData("2025/01/01"), /Data inválida/);
});

test("parse TJRO (IRDR 15): número, situação, relator, paradigma CNJ sem link, datas, sem 'Não informado(a)'", () => {
  const p = normalizarRegistro(TJRO.data.results[0]);
  assert.equal(p.sigla, "TJRO");
  assert.equal(p.rotuloEspecie, "IRDR");
  assert.equal(p.numero, "15");
  assert.equal(p.situacao, "ACORDAO_PUBLICADO");
  assert.equal(p.relator, "Des. Alexandre Miguel");
  assert.equal(p.paradigmas[0].numero, "0802205-09.2025.8.22.0000");
  assert.equal(p.paradigmas[0].link, null);
  assert.equal(p.datas.julgamento, "19/12/2025");
  assert.equal(p.datas["trânsito"], null);
  assert.equal(p.extras["tema sobrestado"], "1414");
  assert.match(p.tese, /^1\) O cartão de crédito com reserva de margem/);
  assert.doesNotMatch(JSON.stringify(p), /Não informado/);
});

test("parse STJ (repetitivo): HTML da tese limpo, paradigmas com link, tese firmada", () => {
  const p = normalizarRegistro(SUP.data.results[0]);
  assert.equal(p.sigla, "STJ");
  assert.equal(p.numero, "66");
  assert.equal(p.possuiTeseFirmada, true);
  assert.doesNotMatch(p.tese, /<p>|<br|<b>/);
  assert.match(p.tese, /Tese após revisão/);
  assert.ok(p.paradigmas.every((x) => /^https:\/\/processo\.stj\.jus\.br/.test(x.link)));
  assert.equal(p.datas.atualizacao, "23/10/2026");
  assert.equal(p.situacao, "ACORDAO_PUBLICADO_RE_PENDENTE");
});

test("parse STF (repercussão geral): tema, processo, órgão, relator, ementa, situação atual", () => {
  const p = normalizarRegistro(SUP.data.results[2]);
  assert.equal(p.formato, "STF");
  assert.equal(p.numero, "Tema 1484");
  assert.equal(p.processo, "RE 1620626 RG");
  assert.equal(p.orgao, "Tribunal Pleno");
  assert.equal(p.relator, "MINISTRO PRESIDENTE");
  assert.match(p.situacao, /AFETADO · Há repercussão geral; Acórdão de Repercussão Geral publicado/);
  assert.match(p.ementa, /^Ementa Sobre Repercussão Geral/);
  assert.equal(p.datas.julgamento, "25/09/2026");
  assert.match(p.paradigmas[0].link, /portal\.stf\.jus\.br/);
});

test("resumo × completo: truncamento, ementa e suspensão só no completo; rótulo de defasagem sempre", () => {
  const r = formatarBuscaLiame(TJRO, { modo: "resumo", sync: { BNP: "26/10/2026 03:15" } });
  assert.ok(r.includes(ROTULO_LIAME));
  assert.match(r, /Última sincronização de dados do Liame: BNP: 26\/10\/2026 03:15/);
  assert.match(r, /\[truncado; modo="completo" traz inteiro\]/);
  assert.doesNotMatch(r, /Detalhe da suspensão/);
  assert.match(r, /0802205-09\.2025\.8\.22\.0000 \(sem link no registro\)/);
  assert.match(r, /não afirma superação/);
  const c = formatarBuscaLiame(TJRO, { modo: "completo", sync: {} });
  assert.doesNotMatch(c, /\[truncado/);
  assert.match(c, /Detalhe da suspensão/);
  assert.match(c, /4\) A utilização do cartão de crédito consignado/);
  assert.match(c, /\[ementa do mérito\]\(https:\/\/pjesg/);
  assert.match(c, /Última sincronização de dados do Liame: não lida/);
  const s = formatarBuscaLiame(SUP, { modo: "completo", sync: { BNP: null, STF: "x" } });
  assert.match(s, /  > Ementa: Ementa Sobre Repercussão Geral/);   // 1.42.0: dentro da cerca TEXTO DO REGISTRO
  assert.match(s, /160 registro\(s\) no Liame; página 1 de 54 \(há mais: pagina=2\)/);
  const t = formatarRegistro(normalizarRegistro(SUP.data.results[2]), "resumo");
  assert.doesNotMatch(t, /Ementa:/);
});

test("zero resultado é 'não localizado no Liame', nunca 'não há precedente'", () => {
  const vazio = { message: "ok", data: { total: 0, page: 1, page_size: 10, total_pages: 0, results: [] } };
  const t = formatarBuscaLiame(vazio, {});
  assert.match(t, /Não localizado no Liame/);
  assert.match(t, /NÃO quer dizer que não há precedente/);
  assert.ok(t.includes(ROTULO_LIAME));
});

test("busca: POST com corpo, cabeçalhos do site, sem dado extra; sincronização lida e guardada", async () => {
  const f = falso(resposta(200, TJRO));
  const r = await buscarLiame({ texto: "cartão consignado", siglas: ["TJRO"], especies: ["irdr", "iac"] }, f);
  const p = f.chamadas[0];
  assert.equal(p.url, LIAME_PESQUISA);
  assert.equal(p.init.method, "POST");
  assert.equal(p.init.headers.Origin, "https://liame.tjro.jus.br");
  assert.equal(p.init.headers.Referer, "https://liame.tjro.jus.br/");
  assert.match(p.init.headers["User-Agent"], /MCP-TJRO|Mozilla/);
  assert.equal(JSON.parse(p.init.body).texto, "cartão consignado");
  assert.ok(p.init.signal, "timeout");
  assert.equal(f.chamadas[1].url, LIAME_SYNC.BNP, "TJRO → só a sincronização do BNP");
  assert.equal(f.chamadas.length, 2);
  assert.equal(r.sync.BNP, "26/10/2026 03:15");
  assert.ok(f.chamadas[1].t - p.t >= 7000, "7 s entre chamadas, também para a sincronização");
});

test("cache de 24 h: consulta idêntica não vai à rede; vencido, vai", async () => {
  const f = falso(resposta(200, SUP));
  await buscarLiame({ texto: "consumidor", siglas: ["STJ", "STF"] }, f);
  const n = f.chamadas.length;
  assert.equal(n, 3, "busca + BNP + STF");
  const r2 = await buscarLiame({ texto: "consumidor", siglas: ["STJ", "STF"] }, f);
  assert.equal(f.chamadas.length, n);
  assert.ok(r2.doCache);
  assert.match(formatarBuscaLiame(r2.resp, { doCache: r2.doCache, sync: r2.sync }), /Do cache local de 24 h/);
  T += 25 * 3600_000;
  const antes = f.chamadas.length;
  await buscarLiame({ texto: "consumidor", siglas: ["STJ", "STF"] }, f);
  assert.ok(f.chamadas.length > antes, "cache vencido volta à rede");
});

for (const [nome, resp, rx] of [
  ["HTML no lugar de JSON (desafio)", () => resposta(200, LANDING, "text/html"), /página \(HTML\)/],
  ["HTTP 403", () => resposta(403, "forbidden", "text/plain"), /HTTP 403/],
  ["HTTP 429", () => resposta(429, "", "text/plain"), /HTTP 429/],
  ["200 com corpo que não é JSON", () => resposta(200, "ok!", "application/json"), /não é JSON/],
]) {
  test(`${nome} → [CONSULTA NÃO REALIZADA] + recuo; a próxima nem chega à rede`, async () => {
    const f = falso(resp());
    await assert.rejects(() => buscarLiame({ texto: "x" }, f), (e) => e instanceof ErroLiame && /^\[CONSULTA NÃO REALIZADA\]/.test(e.message) && rx.test(e.message) && !/não há precedente/.test(e.message));
    const n = f.chamadas.length;
    assert.ok(estadoLiame().bloqueadoPorS >= 600, "recuo de pelo menos 10 min");
    await assert.rejects(() => buscarLiame({ texto: "y" }, f), /tipo=bloqueio_do_liame/);
    assert.equal(f.chamadas.length, n, "em recuo, nenhuma chamada");
  });
}

test("recuo dobra a cada recusa até 1 h; Retry-After vira piso", async () => {
  const f = falso(resposta(429, "", "text/plain"));
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, f));
  assert.equal(estadoLiame().bloqueadoPorS, 600);
  T += 601_000;
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, f));
  assert.equal(estadoLiame().bloqueadoPorS, 1200);
  for (let i = 0; i < 4; i++) { T += 3601_000; await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, f)); }
  assert.equal(estadoLiame().bloqueadoPorS, 3600);
  _resetLiameParaTeste();
  const g = async () => ({ ...resposta(429, ""), headers: { get: (k) => (k === "retry-after" ? "1800" : "text/plain") } });
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, g));
  assert.equal(estadoLiame().bloqueadoPorS, 1800);
});

test("erro 500 e timeout: NÃO REALIZADA com recuo CURTO (1.42.0), sem subir a escada", async () => {
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, async () => resposta(500, "{}")), /\[CONSULTA NÃO REALIZADA\].*HTTP 500/);
  assert.equal(estadoLiame().bloqueadoPorS, 120);
  assert.equal(estadoLiame().nivel, 1);
  _resetLiameParaTeste();
  const to = async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; };
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, to), /\[CONSULTA NÃO REALIZADA\].*não respondeu em 30 s/);
  assert.equal(estadoLiame().bloqueadoPorS, 120);
});

test("ritmo: 7 s entre reservas, 10 por minuto, sem duas vagas no mesmo instante", async () => {
  const vagas = [];
  for (let i = 0; i < 10; i++) {
    const r = reservarLiame();
    assert.ok(!r.erro, r.erro);
    vagas.push(T + r.esperarMs);
    T += r.esperarMs;
  }
  for (let i = 1; i < vagas.length; i++) assert.ok(vagas[i] - vagas[i - 1] >= 7000);
  // 10 vagas cabem em 63 s; para testar o teto puro, todas dentro de 1 min:
  _resetLiameParaTeste();
  const t0 = T;
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const r = reservarLiame();
    if (r.erro) { assert.match(r.erro, /tipo=limite_de_ritmo|Fila de espera/); break; }
    n++;
  }
  assert.ok(n <= 5, `sem avançar o relógio, a fila de 30 s limita a ${n} reservas`);
  T = t0;
});

test("teto de 10 por janela de 1 min e escada sobe com recusa depois de volume", async () => {
  // 10 reservas espaçadas de 7 s não cabem em 60 s; força a janela com o relógio parado no fim
  for (let i = 0; i < 10; i++) { const r = reservarLiame(); assert.ok(!r.erro); T += 5000; }
  const r = reservarLiame();
  assert.match(r.erro || "", /tipo=limite_de_ritmo|Fila/);
  assert.equal(estadoLiame().nivel, 1);
  T += 20_000;
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, async () => resposta(403, "x", "text/plain")));
  assert.equal(estadoLiame().nivel, 2, "recusa depois de volume alarga a janela para 5 min");
});

test("HTML de desafio não sobe a escada (não é volume)", async () => {
  for (let i = 0; i < 4; i++) { reservarLiame(); T += 7000; }
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, async () => resposta(200, LANDING, "text/html")));
  assert.equal(estadoLiame().nivel, 1);
});

test("aguardar: espera a vaga do ritmo dentro do teto; sem aguardar, recusa", async () => {
  for (let i = 0; i < 10; i++) { reservarLiame(); T += 5500; }
  const sem = await reservarLiameComEspera(0);
  assert.ok(sem.erro);
  const com = await reservarLiameComEspera(30);
  assert.ok(!com.erro, com.erro);
  assert.ok(com.esperouMs > 0 && com.esperouMs <= 30_050);
});

test("aguardar nunca espera recuo de bloqueio", async () => {
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, async () => resposta(429, "")));
  const t0 = T;
  const r = await reservarLiameComEspera(30);
  assert.match(r.erro, /tipo=bloqueio_do_liame/);
  assert.equal(T, t0);
});

test("sincronização: formato desconhecido lido de forma defensiva; falha vira 'não lida' e não derruba a busca", async () => {
  assert.equal(dataDaSync({ job: { status: "ok", created_at: "2026-10-20T01:00:00", finished_at: "2026-10-20T02:30:00" } }), "20/10/2026 02:30");
  assert.equal(dataDaSync({ nada: 1 }), null);
  const f = async (url) => (url === LIAME_PESQUISA ? resposta(200, TJRO) : resposta(404, "{}"));
  const r = await buscarLiame({ siglas: ["TJRO"], texto: "a" }, f);
  assert.equal(r.sync.BNP, null);
  assert.match(formatarBuscaLiame(r.resp, { sync: r.sync }), /BNP: não lida/);
});

test("formato inesperado (sem data.results) é NÃO REALIZADA", async () => {
  await assert.rejects(() => buscarLiame({ texto: "z" }, falso(resposta(200, { message: "erro" }))), /\[CONSULTA NÃO REALIZADA\].*formato inesperado/);
});

test("verificar: número bate pelos dígitos; não bate = 'não localizado no Liame'; aviso de superação", async () => {
  const f = falso(resposta(200, TJRO));
  const v = await verificarLiame({ numero: "IRDR 15", especie: "irdr", sigla: "tjro" }, f);
  const corpo = JSON.parse(f.chamadas[0].init.body);
  assert.equal(corpo.numero, "15");
  assert.deepEqual(corpo.siglas, ["TJRO"]);
  assert.equal(v.achados.length, 1);
  const t = formatarVerificacaoLiame(v);
  assert.match(t, /Situação no registro: ACORDAO_PUBLICADO \(desde 09\/06\/2026\)/);
  assert.match(t, /Atualização do registro no Liame: 09\/06\/2026/);
  assert.match(t, /não afirma superação/);
  assert.ok(t.includes(ROTULO_LIAME));
  const v2 = await verificarLiame({ numero: "16", especie: "irdr", sigla: "TJRO" }, falso(resposta(200, TJRO)));
  assert.match(formatarVerificacaoLiame(v2), /Não localizado no Liame.*NÃO quer dizer que o precedente não existe/);
  const s = await verificarLiame({ numero: "Tema 1484", sigla: "STF", especie: "rg" }, falso(resposta(200, SUP)));
  assert.equal(s.achados.length, 1);
  assert.match(formatarVerificacaoLiame(s), /Tese firmada: o registro não diz/);
  const j = await verificarLiame({ numero: "66", sigla: "STJ" }, falso(resposta(200, SUP)));
  assert.match(formatarVerificacaoLiame(j), /Tese firmada: sim/);
  await assert.rejects(() => verificarLiame({ numero: "abc" }), /Informe o número/);
});

test("descrições: index.js e manifest.json trazem as duas ferramentas e o rótulo", () => {
  const raiz = path.join(FIX, "..", "..", "..");
  const idx = fs.readFileSync(path.join(raiz, "server", "index.js"), "utf8");
  const man = JSON.parse(fs.readFileSync(path.join(raiz, "manifest.json"), "utf8"));
  for (const n of ["buscar_precedentes_liame_tjro", "verificar_precedente_liame_tjro"]) {
    assert.ok(idx.includes(`"${n}"`));
    const t = man.tools.find((x) => x.name === n);
    assert.ok(t, n);
    assert.match(t.description, /Liame/);
    assert.match(t.description, /não localizado no Liame/i);
  }
});
