import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarOrgao } from "../server/lib.js";

test("normalizarOrgao: ordinal sem símbolo e caixa", () => {
  assert.equal(normalizarOrgao("Porto Velho - 4a Vara Criminal"), "Porto Velho - 4ª Vara Criminal");
  assert.equal(normalizarOrgao("1a camara civel"), "1ª Câmara Cível");
  assert.equal(normalizarOrgao("1o Juizado Especial"), "1º Juizado Especial");
  assert.equal(normalizarOrgao("2ª Câmara Criminal"), "2ª Câmara Criminal");
  assert.equal(normalizarOrgao(""), "");
});
