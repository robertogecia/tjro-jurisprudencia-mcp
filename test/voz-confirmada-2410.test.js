// 1.41.9: "só confirma com evidência" — LITERAL sem alerta e sem marca positiva de voz não é ✅ pleno.
import test from "node:test";
import assert from "node:assert/strict";
import { conferirTrecho } from "../server/verificar.js";

const EMENTA = "EMENTA: APELAÇÃO CÍVEL. CONSUMIDOR. I. CASO EM EXAME. Trata-se de apelação. III. RAZÕES DE DECIDIR. A instituição financeira responde objetivamente pela falha na prestação do serviço bancário. IV. DISPOSITIVO E TESE. Recurso desprovido.";

test("ementa da casa: voz confirmada", () => {
  const r = conferirTrecho(EMENTA, "responde objetivamente pela falha na prestação do serviço bancário", "EMENTA");
  assert.equal(r.ok, true);
  assert.equal(r.vozConfirmada, true);
});

test("relatório do voto: LITERAL mas não é voz do tribunal", () => {
  const t = "ACÓRDÃO\nRELATÓRIO\nO apelante sustenta que a instituição financeira praticou cobrança indevida sem qualquer autorização expressa.\nVOTO\nVoto pelo desprovimento. ACORDAM os Magistrados.";
  const r = conferirTrecho(t, "praticou cobrança indevida sem qualquer autorização expressa", "ACÓRDÃO");
  if (r.ok) assert.equal(r.vozConfirmada, false);
});

import { concessivaNegativa } from "../server/voz.js";
import { norm1 } from "../server/custodia.js";
test("concessiva: ponto de abreviatura/número não fecha a frase", () => {
  const t = norm1("Ainda que não conste a data na pág. 12 e no valor de 23.669 reais, o recurso é provido por outras razões.");
  const i = t.indexOf("conste");
  const c = concessivaNegativa(t, i, i + 60);
  assert.ok(c, "deveria reconhecer a concessiva");
});

import { secoesDaEmenta } from "../server/posicao.js";
test("ementa achatada: item numerado '2. A questão em discussão' e 'PROVIDO. CASO EM EXAME' são seções", () => {
  const t = "EMENTA: DIREITO CIVIL. 1. Caso em exame: apelação de banco. 2. A questão em discussão consiste em saber se o desconto é lícito. 3. As razões de decidir: o contrato é válido. 4. Dispositivo e tese: recurso desprovido.";
  assert.deepEqual(secoesDaEmenta(t, 0, t.length).map((x) => x.nome), ["caso em exame", "questao em discussao", "razoes de decidir", "dispositivo e tese"]);
  const u = "EMENTA: APELAÇÃO. RECURSO NÃO PROVIDO. CASO EM EXAME. O banco sustenta a licitude. QUESTÃO EM DISCUSSÃO. Saber se houve falha.";
  assert.ok(secoesDaEmenta(u, 0, u.length).length >= 2);
});
