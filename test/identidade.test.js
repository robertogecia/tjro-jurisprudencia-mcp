// v1.11.0 — a pausa do disjuntor é por IDENTIFICAÇÃO (pública "honesta" × build pessoal "navegador"); o volume
// (janela, espaçamento, escada) continua somado, porque o IP é o mesmo perante o portal. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  identidadeDoUA,
  identidadeDoDisjuntor,
  _setIdentidadeParaTeste,
  _setArquivoEstadoParaTeste,
  _resetDisjuntorParaTeste,
  reservarRequisicao,
  registrarBloqueioDetectado,
  registrarSucesso,
  bloqueioSistematico,
  diagnosticoRitmo,
  HEADERS,
} from "../server/lib.js";

const ARQ = path.join(os.tmpdir(), `_teste_identidade_${process.pid}.json`);
_setArquivoEstadoParaTeste(ARQ);
const ORIGINAL = identidadeDoDisjuntor();
const como = (id, fn) => { _setIdentidadeParaTeste(id); try { return fn(); } finally { _setIdentidadeParaTeste(ORIGINAL); } };
const limpa = () => _resetDisjuntorParaTeste();

test("identidadeDoUA: a identificação da extensão é 'honesta'; qualquer outra é 'navegador'", () => {
  assert.equal(identidadeDoUA("Mozilla/5.0 (compatible; MCP-TJRO-Jurisprudencia/1.1)"), "honesta");
  assert.equal(identidadeDoUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"), "navegador");
  assert.equal(identidadeDoUA(""), "navegador");
  assert.ok(["honesta", "navegador"].includes(identidadeDoDisjuntor()));
  assert.equal(identidadeDoDisjuntor(), identidadeDoUA(HEADERS["User-Agent"]));
});

test("bloqueio da identificação honesta NÃO pausa a navegador (e vice-versa); a própria pausa continua valendo", () => {
  limpa();
  const t = Date.now();
  como("honesta", () => registrarBloqueioDetectado(t, "busca", { tipo: "resposta_corrompida", subirEscada: false }));
  assert.match(como("honesta", () => reservarRequisicao(t + 1000)).erro, /\[espera_segundos=\d+ tipo=bloqueio_do_tribunal\]/);
  assert.equal(como("navegador", () => reservarRequisicao(t + 1000)).erro, undefined);
  limpa();
  como("navegador", () => registrarBloqueioDetectado(t, "busca", { tipo: "robotizacao", subirEscada: false }));
  assert.match(como("navegador", () => reservarRequisicao(t + 1000)).erro, /bloqueio_do_tribunal/);
  assert.equal(como("honesta", () => reservarRequisicao(t + 1000)).erro, undefined);
  limpa();
});

test("o volume é compartilhado: o espaçamento e a janela contam as duas identificações juntas", () => {
  limpa();
  const t = Date.now();
  assert.equal(como("honesta", () => reservarRequisicao(t)).esperarMs, 0);
  // mesma máquina, mesmo IP: a vaga da outra identificação só vem depois do espaçamento mínimo
  assert.ok(como("navegador", () => reservarRequisicao(t)).esperarMs >= 6000);
  limpa();
});

test("backoff e último sucesso são de cada identificação; incidentes levam a etiqueta e o diagnóstico a mostra", () => {
  limpa();
  const t = Date.now();
  como("honesta", () => registrarBloqueioDetectado(t, "busca", { tipo: "resposta_corrompida", subirEscada: false }));
  como("navegador", () => registrarSucesso());
  const raw = JSON.parse(fs.readFileSync(ARQ, "utf8"));
  assert.equal(raw.versao, 3);
  assert.ok(raw.porIdentidade.honesta.bloqueadoAte > t);
  assert.equal(raw.porIdentidade.navegador.bloqueadoAte, 0);
  assert.equal(raw.porIdentidade.honesta.ultimoSucessoEm, 0);
  assert.ok(raw.porIdentidade.navegador.ultimoSucessoEm >= t);
  assert.equal(raw.incidentes.at(-1).identidade, "honesta");
  const dh = como("honesta", () => diagnosticoRitmo(t + 1000));
  assert.match(dh, /BLOQUEADO por suspeita de automação/);
  assert.match(dh, /Identificação desta instalação: extensão \(identificação honesta\)/);
  assert.match(dh, /identificação: honesta/);
  const dn = como("navegador", () => diagnosticoRitmo(t + 1000));
  assert.match(dn, /Situação: liberado/);
  assert.match(dn, /Identificação desta instalação: navegador \(build de uso pessoal\)/);
  assert.match(dn, /A outra identificação \(honesta\) está em pausa por mais/);
  limpa();
});

test("bloqueio sistemático só conta incidentes da própria identificação (sem etiqueta vale para quem ler)", () => {
  limpa();
  const t = Date.now();
  const inc = (identidade, dt) => ({ quando: t - dt, operacao: "busca", tipo: "resposta_corrompida", nivel: 0, janelaS: 60, reqsUltimos60s: 0, reqsNaJanela: 0, desdeUltimaReqS: null, desdeIncidenteAnteriorS: null, ...(identidade ? { identidade } : {}) });
  fs.writeFileSync(ARQ, JSON.stringify({ versao: 3, requisicoes: [], incidentes: [inc("honesta", 3000), inc("honesta", 2000)],
    porIdentidade: { honesta: { bloqueadoAte: 0, backoffMs: 600000, ultimoSucessoEm: 0 }, navegador: { bloqueadoAte: 0, backoffMs: 600000, ultimoSucessoEm: 0 } } }));
  assert.equal(como("honesta", () => bloqueioSistematico(t)).vezes, 2);
  assert.equal(como("navegador", () => bloqueioSistematico(t)), null);
  // sem etiqueta: vale para quem ler (compatível com o arquivo e os testes antigos)
  fs.writeFileSync(ARQ, JSON.stringify({ versao: 3, requisicoes: [], incidentes: [inc(null, 3000), inc(null, 2000)], porIdentidade: {} }));
  assert.equal(como("honesta", () => bloqueioSistematico(t)).vezes, 2);
  assert.equal(como("navegador", () => bloqueioSistematico(t)).vezes, 2);
  // um sucesso da própria identificação depois dos bloqueios desfaz a conclusão; o da outra, não
  fs.writeFileSync(ARQ, JSON.stringify({ versao: 3, requisicoes: [], incidentes: [inc(null, 3000), inc(null, 2000)],
    porIdentidade: { navegador: { bloqueadoAte: 0, backoffMs: 600000, ultimoSucessoEm: t - 1000 } } }));
  assert.equal(como("navegador", () => bloqueioSistematico(t)), null);
  assert.equal(como("honesta", () => bloqueioSistematico(t)).vezes, 2);
  limpa();
});

test("arquivo antigo (v2, campos soltos): pausa em curso vale para as duas; o último sucesso fica só na navegador", () => {
  limpa();
  const t = Date.now();
  fs.writeFileSync(ARQ, JSON.stringify({ versao: 2, requisicoes: [], proximoLivreEm: 0, bloqueadoAte: t + 600000, indiceJanela: 2, sucessos: 3,
    backoffMs: 1200000, incidentes: [], ultimaRequisicaoEm: 0, totalRequisicoes: 41, ultimoSucessoEm: t - 5000 }));
  assert.match(como("honesta", () => reservarRequisicao(t)).erro, /bloqueio_do_tribunal/);
  assert.match(como("navegador", () => reservarRequisicao(t)).erro, /bloqueio_do_tribunal/);
  // a escada e o contador são comuns e sobrevivem à migração; a regravação sai no formato novo
  como("navegador", () => registrarSucesso());
  const raw = JSON.parse(fs.readFileSync(ARQ, "utf8"));
  assert.equal(raw.versao, 3);
  assert.equal(raw.indiceJanela, 2);
  assert.equal(raw.totalRequisicoes, 41);
  assert.equal(raw.porIdentidade.honesta.ultimoSucessoEm, 0);
  assert.equal(raw.porIdentidade.honesta.backoffMs, 1200000);
  limpa();
});

test("arquivo ilegível ou valores absurdos: padrão seguro, sem pausa inflada", () => {
  limpa();
  fs.writeFileSync(ARQ, "{não é json");
  assert.equal(como("honesta", () => reservarRequisicao(Date.now())).erro, undefined);
  limpa();
  fs.writeFileSync(ARQ, JSON.stringify({ versao: 3, porIdentidade: { honesta: { bloqueadoAte: 9e15, backoffMs: -5, ultimoSucessoEm: "x" } } }));
  const e = como("honesta", () => reservarRequisicao(Date.now()));
  assert.ok(e.erro && /espera_segundos=(\d+)/.exec(e.erro)[1] <= 3600, e.erro);   // pausa limitada a 1 h
  limpa();
});
