import { test } from "node:test";
import assert from "node:assert/strict";
import { desfechoPenal, causaDaExtincao } from "../server/desfecho-penal.js";

test("desfechoPenal: condenação, absolvição, parcial, extinção", () => {
  assert.equal(desfechoPenal("julgo procedente a pretensao punitiva estatal para condenar o reu"), "CONDENADO");
  assert.equal(desfechoPenal("absolvo o reu com fundamento no artigo 386, inciso vii, do cpp"), "ABSOLVIDO");
  assert.equal(desfechoPenal("condeno o reu pelo art. 306 e absolvo do art. 329, art. 386, iii"), "CONDENADO_PARCIAL");
  assert.equal(desfechoPenal("declaro extinta a punibilidade, art. 89, § 5o, da lei 9.099"), "PUNIBILIDADE_SCP");
  assert.equal(desfechoPenal("absolvo sumariamente o acusado, art. 397 do cpp"), "ABSOLVICAO_SUMARIA");
});
test("desfechoPenal: palavra partida pelo recibo e casos fora do mérito", () => {
  assert.equal(desfechoPenal("julgo parcialmente procedente a denuncia e co ndeno o reu; absolvo do art. 329"), "CONDENADO_PARCIAL");
  assert.equal(desfechoPenal("impronuncio o acusado"), null);
  assert.equal(desfechoPenal("homologo por sentenca o acordo de transacao penal; declarada extinta a punibilidade apos o cumprimento"), null);
  assert.equal(desfechoPenal(""), null);
  assert.equal(desfechoPenal("fixo as custas e determino a expedicao de guia"), null);
});
test("causaDaExtincao", () => {
  assert.match(causaDaExtincao("art. 89 da lei 9.099"), /suspensão condicional/);
  assert.match(causaDaExtincao("art. 28-a, § 13, do cpp"), /ANPP/);
  assert.equal(causaDaExtincao("sem causa"), "");
});

import { assinaturaDaSentenca, avisoAssinatura } from "../server/assinatura.js";
test("assinatura da sentença: data diverge do índice só avisa quando difere", () => {
  const t = "... Intimem-se. Porto Velho/RO, 30 de junho de 2025 Aureo Virgilio Queiroz Juiz de Direito";
  assert.deepEqual(assinaturaDaSentenca(t), { nome: "aureo virgilio queiroz", data: "30/06/2025" });
  assert.equal(avisoAssinatura(t, "30/06/2025"), "");
  assert.match(avisoAssinatura(t, "02/07/2025"), /assinatura no texto: 30\/06\/2025 \(índice: 02\/07\/2025\)/);
  assert.equal(avisoAssinatura("sem assinatura legível", "02/07/2025"), "");
});
test("subtipos de extinção da punibilidade", () => {
  assert.equal(desfechoPenal("declaro extinta a punibilidade, art. 89, § 5o, da lei 9.099"), "PUNIBILIDADE_SCP");
  assert.equal(desfechoPenal("com fundamento no artigo 28-a, § 13, declaro extinta a punibilidade"), "PUNIBILIDADE_ANPP");
  assert.equal(desfechoPenal("declaro extinta a punibilidade pela morte do agente"), "PUNIBILIDADE_EXTINTA");
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirInstalador } from "../server/atualizar.js";
test("abrirInstalador: só .mcpb da pasta Downloads, sem shell, comando por sistema", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "dl-"));
  const arq = path.join(pasta, "Jurisprudencia-TJRO.mcpb");
  fs.writeFileSync(arq, "x");
  const chamadas = [];
  const falso = (cmd, args, op) => (chamadas.push({ cmd, args, op }), { unref() {} });
  assert.equal(abrirInstalador(arq, { plataforma: "darwin", spawnImpl: falso, pasta }), "open");
  assert.equal(abrirInstalador(arq, { plataforma: "win32", spawnImpl: falso, pasta }), "explorer.exe");
  assert.equal(chamadas[0].op.shell, false);
  assert.throws(() => abrirInstalador(path.join(pasta, "x.sh"), { spawnImpl: falso, pasta }), /só abro o arquivo \.mcpb/);
  assert.throws(() => abrirInstalador("/etc/passwd.mcpb", { spawnImpl: falso, pasta }), /só abro/);
  assert.equal(chamadas.length, 2);
});

import { formaDaRequisicao, assinaturaDoErro, buildBuscaBody } from "../server/lib.js";
test("forma da requisição e assinatura do 500 não levam texto da consulta", () => {
  const corpo = buildBuscaBody({ consulta: "", tipo: ["ACÓRDÃO"], grupos: [["fulano de tal", "segredo"], ["7000000-00.2026.8.22.0001"]], pagina: 1, porPagina: 50, ordenacao: "recentes" });
  const f = JSON.stringify(formaDaRequisicao(corpo));
  assert.doesNotMatch(f, /fulano|segredo|7000000/);
  assert.match(f, /"ord":"recentes"/);
  const a = assinaturaDoErro('{"error":{"type":"query_shard_exception","reason":"Failed to parse query [fulano]"}}', "application/json", "nginx");
  assert.deepEqual(a.tipos, ["query_shard_exception"]);
  assert.doesNotMatch(JSON.stringify(a), /fulano/);
});

import { normalizarDataBusca } from "../server/lib.js";
test("data da busca: dd/mm/aaaa convertida, data impossível recusada (causa medida de HTTP 500)", () => {
  assert.deepEqual(normalizarDataBusca("01/01/2024"), { ok: true, valor: "2024-01-01" });
  assert.equal(normalizarDataBusca("2024-02-30").ok, false);
  assert.equal(normalizarDataBusca("31/02/2024").ok, false);
  assert.deepEqual(normalizarDataBusca("2024"), { ok: true, valor: "2024" });
  assert.deepEqual(normalizarDataBusca(undefined), { ok: true, valor: undefined });
  assert.equal(normalizarDataBusca("ontem").ok, false);
});

import { desfechoAnpp } from "../server/desfecho-penal.js";
test("ANPP: extinção pelo cumprimento, homologação, e o que não é", () => {
  assert.equal(desfechoAnpp(null, "com fulcro no artigo 28-a, § 13, do codigo de processo penal, declaro extinta sua punibilidade"), "PUNIBILIDADE_ANPP");
  assert.equal(desfechoAnpp("nos termos do art. 28-a, §4o, do cpp, homologo o acordo de nao persecucao penal celebrado"), "ANPP_HOMOLOGADO");
  assert.equal(desfechoAnpp("com fulcro no artigo 107, inciso i, do codigo penal, declaro extinta a punibilidade"), "PUNIBILIDADE_EXTINTA");
  assert.equal(desfechoAnpp("verifico que foi oferecida denuncia em face do investigado"), null);
  assert.equal(desfechoPenal("julgo procedente os presentes embargos declaratorios para aclarar: onde se lia 'julgo procedente a pretensao punitiva'"), null);
  assert.equal(desfechoPenal("condeno o reu pelo art. 306. antecedentes: sentenca de extincao da punibilidade proferida em 2019"), "CONDENADO");
  assert.equal(desfechoPenal("julgo procedente em parte a denuncia: a) julgo extinta a punibilidade quanto ao art. 28; b) condeno o reu pelo art. 33"), "CONDENADO_PARCIAL");
});
