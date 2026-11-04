import test from "node:test";
import assert from "node:assert/strict";
import { dicaConsultaGrande } from "../server/lib.js";
import { descreverArgs, formaDosTermos } from "../server/erros.js";

test("diário: a forma dos termos entra só como contagem, nunca como termo", () => {
  const g = [["consign*", "dano moral", "cartão crédito ~3"], ["Maria Silva"]];
  assert.equal(formaDosTermos(g), ", 1 curinga(s), 2 frase(s), 1 proximidade(s)");
  const d = descreverArgs({ grupos: g, classe_judicial: "APELAÇÃO CÍVEL" });
  assert.equal(d.grupos, "2 grupo(s), 4 termo(s), 1 curinga(s), 2 frase(s), 1 proximidade(s)");
  assert.doesNotMatch(JSON.stringify(d), /consign|dano|Maria|cartão|crédito/);
  assert.equal(descreverArgs({ grupos: [["a", "b"], ["c"]] }).grupos, "2 grupo(s), 3 termo(s)");
});

test("500 em consulta pequena: uma tentativa só, sem repetir termo da consulta", () => {
  const g = [["consign*", "segredo do cliente"]];
  const t = dicaConsultaGrande("HTTP 500", g, { classe_judicial: "APELAÇÃO CÍVEL", excluir: ["x"], data_inicio: "2026-01-01" });
  assert.match(t, /consulta pequena \(1 grupos, 2 termos\)/);
  assert.match(t, /UMA tentativa sem classe_judicial/);
  assert.match(t, /classe_judicial, excluir, data, curinga \(\*\)/);
  assert.match(t, /PARE/);
  assert.doesNotMatch(t, /segredo|consign\*|Repita tirando/);
});

test("revisão adversarial 03/11: consulta livre longa não vira 'pequena'; sem args, sem dica de curinga", () => {
  const longa = "uma consulta livre muito longa com muitas palavras seguidas para passar do limite e mais algumas *";
  assert.equal(dicaConsultaGrande("HTTP 500", undefined, { consulta: longa, classe_judicial: "X" }), "");
  assert.match(dicaConsultaGrande("HTTP 500", undefined, { consulta: "dano moral", classe_judicial: "X" }), /0 grupos, 0 termos/);
  assert.equal(dicaConsultaGrande("HTTP 500", [["consign*"]]), "");
});

test("revisão adversarial 03/11: a forma segue o termo que o portal recebe", () => {
  assert.equal(formaDosTermos([["a b ~25", "*inicio", "\"x*\" y"]]), ", 2 frase(s)");
  assert.equal(formaDosTermos([["consign*", "cartão crédito ~3"]]), ", 1 curinga(s), 1 proximidade(s)");
  const longo = "a" + " ".repeat(40000) + "b ~3";
  const t0 = Date.now();
  formaDosTermos([[longo]]);
  assert.ok(Date.now() - t0 < 100, "termo longo não pode travar o diário");
});

test("revisão adversarial 03/11: grupo null não derruba a descrição dos parâmetros", () => {
  assert.doesNotThrow(() => descreverArgs({ grupos: [["a"], null] }));
  assert.match(descreverArgs({ grupos: [["a"], null] }).grupos, /2 grupo\(s\), 2 termo\(s\)/);
});

test("500 em consulta grande: regra concreta de redução, sem termo da consulta", () => {
  const g = [["a1", "b1", "c1", "d1"], ["e1", "f1", "g1", "h1"], ["i1", "j1", "k1"]];
  const t = dicaConsultaGrande("HTTP 500", g, { classe_judicial: "APELAÇÃO CÍVEL" });
  assert.match(t, /no máximo 2 grupos e 9 termos/);
  assert.match(t, /2 grupos que descrevem o assunto e o fato, com até 4 termos cada/);
  assert.doesNotMatch(t, /a1|k1/);
});
