// 1.42.1: rótulo de sentença para "rejeito os pedidos", "acolho em parte" e "procedent e" (palavra partida no recibo).
// Só entra quando nenhum termo já rotulava o dispositivo: os rótulos antigos não mudam.
import { test } from "node:test";
import assert from "node:assert/strict";
import { desfechoDaSentenca } from "../server/posicao.js";
import { norm1 } from "../server/custodia.js";

const d = (trecho) => desfechoDaSentenca(norm1(`Vistos. ante o exposto, ${trecho} Intimem-se. Porto Velho, 1 de outubro de 2026. Juiz de Direito`), "PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL");

test("rejeito os pedidos é improcedência", () => {
  assert.equal(d("nos termos do art. 487, i, do CPC, rejeito os pedidos formulados na inicial."), "IMPROCEDENTE");
});

test("acolho em parte é parcialmente procedente", () => {
  assert.equal(d("nos termos do art. 487, i, do CPC, acolho em parte a pretensao contida na inicial, para declarar a nulidade."), "PARCIAL");
});

test("procedent e (palavra partida) é procedência", () => {
  assert.equal(d("julgo procedent e a acao, nos termos do art. 487, i, do CPC, para condenar a requerida."), "PROCEDENTE");
});

test("rótulo que já existia não muda com o termo novo", () => {
  // "julgo procedente" + "rejeito" no mesmo trecho: a regra antiga já decidia (procedência e improcedência juntas calam)
  assert.equal(d("julgo procedente o pedido A e rejeito o pedido B, nos termos do art. 487, i, do CPC."), "PROCEDENTE");
});
