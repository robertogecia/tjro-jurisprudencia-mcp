// Red team de 22/10/2026, rodada 3 — escopo reduzido do TJRO: concessiva antes do "não" (provimentoNegado) e
// variantes de fecho do relator (RE_DISPOSITIVO_1A_PESSOA). As duas correções foram REVERTIDAS na rodada final;
// os testes fixam o comportamento conservador da rodada 2. Dados sintéticos, sem rede, sem gravar em disco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { faixasAlheias, camposAlheios } from "../server/custodia.js";
import { conferirTrecho } from "../server/verificar.js";
import { resultadoComOrigem } from "../server/lib.js";

const rotulos = (t) => [...resultadoComOrigem(t, "ACÓRDÃO").conjunto].sort();

// ---------------------------------------------------------------------------------------- concessiva (achado 9) ---
// A correção da concessiva foi REVERTIDA na rodada final: "ainda que não … dou provimento" fica sem rótulo (conservador),
// e o "dar provimento" dentro da concessiva negada nunca vira PROVIDO.
test("rodada final — concessiva negada antes do verbo: o rótulo some, nunca vira PROVIDO", () => {
  assert.ok(!rotulos("Ainda que não se trate de matéria de ordem pública dou provimento ao recurso.").includes("PROVIDO"));
  assert.ok(!rotulos("Mesmo que não seja o caso de dar provimento ao recurso, mantenho a sentença.").includes("PROVIDO"));
  assert.ok(!rotulos("Embora não seja possível dar provimento ao recurso, corrijo de ofício o erro material.").includes("PROVIDO"));
  assert.ok(!rotulos("Posto que não há como dar provimento ao recurso, mantenho a sentença.").includes("PROVIDO"));
});

test("rodada final — o 2º 'não' e as negações não coladas continuam negando", () => {
  assert.deepEqual(rotulos("Ainda que não se trate de matéria de ordem pública não dou provimento ao recurso."), ["DESPROVIDO"]);
  assert.deepEqual(rotulos("Ainda que relevante o argumento não dou provimento ao recurso."), ["DESPROVIDO"]);
  assert.ok(!rotulos("Ainda que relevante o argumento, não é possível dar provimento ao recurso.").includes("PROVIDO"));
  assert.ok(!rotulos("Não há como dar provimento ao recurso.").includes("PROVIDO"));
  assert.ok(!rotulos("Embora a parte insista, não vejo como dar provimento ao recurso.").includes("PROVIDO"));
});

// ------------------------------------------------------------------------------ fecho do relator (achado 2/8, B5) ---
const STJ = "EMENTA RECURSO ESPECIAL. TARIFA DE AVALIAÇÃO DO BEM. A cobrança da tarifa de avaliação do bem dado em garantia é válida desde que o serviço seja efetivamente prestado ao consumidor contratante. (REsp 1.578.553/SP, Rel. Ministro Paulo de Tarso Sanseverino, Segunda Seção, DJe 06/12/2018).";
const CASA = "APELAÇÃO CÍVEL. DIREITO DO CONSUMIDOR. CONTRATO BANCÁRIO. I. Caso em exame: apelação contra sentença. II. Questão em discussão: legalidade da tarifa. III. Razões de decidir: serviço não prestado. IV. Dispositivo: recurso provido.";
const FECHO = "ACORDAM os Desembargadores da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata, em, RECURSO PROVIDO À UNANIMIDADE. Porto Velho, 01 de outubro de 2026.";
const doc = (fechoRelator, casa = CASA) =>
  `RELATÓRIO Trata-se de apelação interposta pelo autor contra a sentença. É o relatório. VOTO O recurso é tempestivo. Sobre o tema, o Superior Tribunal de Justiça firmou entendimento: ${STJ} No caso dos autos, a avaliação não foi comprovada. ${fechoRelator} ${casa} ${FECHO}`;
const TRECHO_STJ = "A cobrança da tarifa de avaliação do bem dado em garantia é válida desde que o serviço seja efetivamente prestado";

for (const f of [
  "Ante o exposto, dou provimento ao recurso.",
  "Diante do exposto, nego provimento ao recurso.",
  "Por tais razões, dou provimento ao recurso.",
]) {
  test(`rodada 2 — relator sem 'É como voto' que fecha com "${f}": a ementa do STJ transcrita não vira voz da casa`, () => {
    const t = doc(f);
    const fx = faixasAlheias(t, "ACÓRDÃO");
    assert.ok(fx.casaIni > t.indexOf(STJ) + STJ.length, `casaIni ${fx.casaIni} caiu dentro/antes da ementa do STJ`);
    assert.ok(fx.casaIni <= t.indexOf("APELAÇÃO CÍVEL. DIREITO"));
    assert.match(camposAlheios(t, "ACÓRDÃO").texto_voz_propria || "", /^\s*APELAÇÃO CÍVEL\. DIREITO DO CONSUMIDOR/);
    const c = conferirTrecho(t, TRECHO_STJ, "ACÓRDÃO");
    assert.ok(!(c.ok && !(c.alertas || []).length), "trecho do STJ transcrito passou limpo como voz do TJRO");
  });
}

// As variantes da rodada 3 ("Em razão do exposto", "Assim, dou provimento", "Portanto, conheço") foram REVERTIDAS: com
// elas, a ementa da casa era descartada à toa. O relator que fecha só com elas, sem "É como voto", continua PENDENTE.
test("rodada final — ementa da casa com 'Portanto, conheço' / 'Assim, dou provimento' no corpo não é descartada", () => {
  for (const frase of ["Portanto, conheço do recurso.", "Assim, dou provimento ao recurso para afastar a tarifa."]) {
    const casa = `EMENTA APELAÇÃO CÍVEL. CONTRATO BANCÁRIO. TARIFA. ${"Serviço de avaliação não comprovado nos autos. ".repeat(10)}${frase} Recurso provido.`;
    const t = `RELATÓRIO Trata-se de apelação. É o relatório. VOTO O recurso é tempestivo. No mérito, a tarifa não se sustenta e o recurso merece acolhida. ${casa} ${FECHO}`;
    assert.equal(faixasAlheias(t, "ACÓRDÃO").casaIni, t.indexOf("EMENTA APELAÇÃO"), frase);
  }
});

test("rodada 3 — ementa CNJ da casa com 'IV. Dispositivo e tese … Assim, dou provimento' depois do 'É como voto' não é descartada", () => {
  const casa = "EMENTA DIREITO DO CONSUMIDOR. APELAÇÃO CÍVEL. TARIFA. RECURSO PROVIDO. I. Caso em exame Ação revisional. II. Questão em discussão Legalidade da tarifa. III. Razões de decidir Serviço não prestado. IV. Dispositivo e tese 10. Assim, dou provimento ao recurso para afastar a tarifa. Tese de julgamento: a tarifa de avaliação exige prova do serviço.";
  const t = `RELATÓRIO Trata-se de apelação. É o relatório. VOTO O recurso é tempestivo. No mérito, a tarifa não se sustenta. Ante o exposto, dou provimento ao recurso. É como voto. ${casa} ${FECHO}`;
  const fx = faixasAlheias(t, "ACÓRDÃO");
  assert.equal(fx.casaIni, t.indexOf("EMENTA DIREITO"));
  assert.match(camposAlheios(t, "ACÓRDÃO").texto_voz_propria || "", /Tese de julgamento: a tarifa de avaliação exige prova/);
});

test("rodada 3 — 'Assim, nos termos do voto…' no texto da ementa da casa não é fecho do relator", () => {
  const casa = "EMENTA APELAÇÃO CÍVEL. CONTRATO BANCÁRIO. Assim, nos termos do voto do relator, a tarifa é válida. Recurso provido.";
  const t = `RELATÓRIO Trata-se de apelação. É o relatório. VOTO O recurso é tempestivo. No mérito, a tarifa é válida. Ante o exposto, dou provimento. ${casa} ${FECHO}`;
  assert.equal(faixasAlheias(t, "ACÓRDÃO").casaIni, t.indexOf("EMENTA APELAÇÃO"));
});
