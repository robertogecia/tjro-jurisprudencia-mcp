// Red team de 22/10/2026 — regressões dos achados de gravidade alta (dados sintéticos, sem rede, sem gravar em disco).
import { test } from "node:test";
import assert from "node:assert/strict";
import { faixasAlheias, camposAlheios } from "../server/custodia.js";
import { conferirTrecho } from "../server/verificar.js";
import { resultadoComOrigem, rotuloDoConjunto } from "../server/lib.js";

// ---------------------------------------------------------------------------------------------------------------
// VOZ DA CASA: rótulo "EMENTA" de julgado de OUTRO tribunal transcrito no voto não é o início da ementa da casa
// quando a ementa da casa vem no modelo CNJ, sem rótulo.
const STJ = "EMENTA PROCESSUAL CIVIL. AGRAVO INTERNO NO RECURSO ESPECIAL. CONTRATO BANCÁRIO. A instituição financeira responde objetivamente pelos danos decorrentes de fraude praticada por terceiro no âmbito de operações bancárias, independentemente de culpa. Agravo interno desprovido. (AgInt no REsp 9.999.999/XX, Rel. Ministro Fulano de Tal, Quarta Turma, julgado em 01/01/2020).";
const acordaoVoz = (rotuloCasa, anuncio = "Sobre o tema, o Superior Tribunal de Justiça assim decidiu:") =>
  `Classe: Apelação Cível. RELATÓRIO Trata-se de apelação interposta pelo banco contra sentença que julgou procedente o pedido. É o relatório. VOTO O recurso é tempestivo e dele conheço. No caso dos autos, a autora comprova desconto não autorizado. ${anuncio} ${STJ} Ante o exposto, nego provimento ao recurso. É como voto. ${rotuloCasa}DIREITO CIVIL. APELAÇÃO CÍVEL. DESCONTO INDEVIDO EM CONTA. DANO MORAL CONFIGURADO. I. Caso em exame. Apelação contra sentença de procedência. II. Questão em discussão. Saber se há dano moral. III. Razões de decidir. O desconto indevido gera dever de indenizar. IV. Dispositivo e tese. Recurso desprovido. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos, em, "RECURSO NÃO PROVIDO, À UNANIMIDADE." Porto Velho, 01 de janeiro de 2026.`;
const FRASE_STJ = "A instituição financeira responde objetivamente pelos danos decorrentes de fraude praticada por terceiro no âmbito de operações bancárias";

test("VOZ DA CASA: ementa do STJ com rótulo EMENTA transcrita no voto, ementa da casa CNJ sem rótulo → TRANSCRIÇÃO, nunca VOZ DA CASA", () => {
  for (const anuncio of ["Sobre o tema, o Superior Tribunal de Justiça assim decidiu:", "O STJ firmou entendimento, conforme a seguinte ementa:", "Confira-se:"]) {
    const t = acordaoVoz("", anuncio);
    const fx = faixasAlheias(t, "ACÓRDÃO");
    assert.ok(fx.casaIni > t.indexOf("É como voto."), `casaIni ${fx.casaIni} caiu dentro do voto (${anuncio})`);
    const c = conferirTrecho(t, FRASE_STJ, "ACÓRDÃO");
    assert.ok(c.ok);
    assert.ok(!c.notas.some((n) => n.startsWith("VOZ DA CASA")), `VOZ DA CASA indevida (${anuncio})`);
    assert.ok(c.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), `sem alerta de TRANSCRIÇÃO (${anuncio})`);
    const ca = camposAlheios(t, "ACÓRDÃO");
    assert.ok(!String(ca.texto_voz_propria || "").includes("AGRAVO INTERNO NO RECURSO ESPECIAL"));
    assert.ok(ca.trechos_transcritos.some((x) => x.includes("responde objetivamente")));
  }
});

test("VOZ DA CASA: controle — ementa da casa rotulada continua voz da casa; a ementa do STJ continua TRANSCRIÇÃO", () => {
  const t = acordaoVoz("EMENTA ");
  const fx = faixasAlheias(t, "ACÓRDÃO");
  assert.equal(fx.casaIni, t.lastIndexOf("EMENTA "));
  const c = conferirTrecho(t, "O desconto indevido gera dever de indenizar", "ACÓRDÃO");
  assert.ok(c.notas.some((n) => n.startsWith("VOZ DA CASA")));
  assert.ok(conferirTrecho(t, FRASE_STJ, "ACÓRDÃO").alertas.some((a) => a.startsWith("TRANSCRIÇÃO")));
});

// ---------------------------------------------------------------------------------------------------------------
// Relator VENCIDO: o fecho proclama "por maioria, vencido o relator, nos termos do voto divergente", mas o vogal
// diverge sem a fórmula de vênia/"divirjo" ("entendo de forma diversa") — o voto do relator tem de sair como possível vencido.
const acordaoVencido = (voto2, proclamacao) => `Classe: Apelação Cível
RELATÓRIO
Trata-se de apelação interposta pela parte autora contra sentença que julgou improcedente o pedido de restituição de tarifa de avaliação do bem cobrada em contrato de financiamento de veículo.
É o relatório.
VOTO
DESEMBARGADOR FULANO DE TAL
Conheço do recurso. A tarifa de avaliação do bem é devida quando comprovada a efetiva prestação do serviço, o que não se verifica nos autos, razão pela qual a restituição se impõe. Ante o exposto, dou provimento ao recurso. É como voto.
DESEMBARGADOR BELTRANO SILVA
${voto2} No caso, o laudo de avaliação consta dos autos e demonstra a efetiva prestação do serviço, de modo que a cobrança é legítima. Nego provimento ao recurso.
DESEMBARGADOR CICRANO SOUZA
Acompanho o voto do Desembargador Beltrano Silva.
EMENTA
Apelação cível. Tarifa de avaliação do bem. Serviço comprovado. Legitimidade da cobrança. Recurso não provido.
ACÓRDÃO
Vistos, relatados e discutidos estes autos, acordam os Magistrados da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${proclamacao}
Porto Velho, 01 de outubro de 2026.`;
const TESE_RELATOR = "A tarifa de avaliação do bem é devida quando comprovada a efetiva prestação do serviço, o que não se verifica nos autos";
const VENCIDO = "POR MAIORIA, NEGAR PROVIMENTO AO RECURSO, VENCIDO O RELATOR, NOS TERMOS DO VOTO DIVERGENTE DO DESEMBARGADOR BELTRANO SILVA, QUE LAVRARÁ O ACÓRDÃO.";

test("relator VENCIDO pelo fecho, sem fórmula de divergência no voto: VOTO DIVERGENTE no voto do relator, não no do vogal", () => {
  const t = acordaoVencido("Com a devida vênia ao eminente relator, entendo de forma diversa.", VENCIDO);
  const fx = faixasAlheias(t, "ACÓRDÃO");
  assert.ok(fx.divergente, "faixa divergente nula");
  const c = conferirTrecho(t, TESE_RELATOR, "ACÓRDÃO");
  assert.ok(c.alertas.some((a) => a.startsWith("VOTO DIVERGENTE")), "tese do relator vencido sem alerta");
  // o voto vencedor (do vogal) não é marcado como vencido
  const v = conferirTrecho(t, "o laudo de avaliação consta dos autos e demonstra a efetiva prestação do serviço", "ACÓRDÃO");
  assert.ok(!v.alertas.some((a) => a.startsWith("VOTO DIVERGENTE")), "voto vencedor marcado como vencido");
});

test("relator VENCIDO: controles — unanimidade não marca nada; a fórmula clássica de divergência continua marcando", () => {
  const un = acordaoVencido("Acompanho o relator.", "RECURSO PROVIDO NOS TERMOS DO VOTO DO RELATOR, À UNANIMIDADE.");
  assert.equal(faixasAlheias(un, "ACÓRDÃO").divergente, null);
  assert.ok(!conferirTrecho(un, TESE_RELATOR, "ACÓRDÃO").alertas.some((a) => a.startsWith("VOTO DIVERGENTE")));
  const cl = acordaoVencido("Peço vênia ao eminente relator para divergir.", VENCIDO);
  assert.ok(conferirTrecho(cl, TESE_RELATOR, "ACÓRDÃO").alertas.some((a) => a.startsWith("VOTO DIVERGENTE")));
});

// ---------------------------------------------------------------------------------------------------------------
// Negação afastada de "dar provimento" não pode virar rótulo "provido".
const rot = (texto, tipo, classe = "AGRAVO DE INSTRUMENTO") => { const r = resultadoComOrigem(texto, tipo); return rotuloDoConjunto(r.conjunto, classe, r.embargos); };

test("negação de 'dar provimento' (não se dá, não há como, não é o caso de, deixo de) nunca vira 'provido'", () => {
  const casos = [
    ["DECISÃO", "Vistos. Trata-se de agravo. Não há como dar provimento ao recurso. Ante o exposto, nego seguimento ao agravo, nos termos do art. 932, IV, do CPC. Publique-se."],
    ["DECISÃO", "Não é o caso de dar provimento ao pedido. Indefiro a tutela."],
    ["VOTO", "Razão pela qual não se dá provimento ao recurso. Mantenho a sentença."],
    ["VOTO", "Deixo de dar provimento ao apelo."],
    ["ACÓRDÃO", "Vistos, relatados e discutidos estes autos, ACORDAM os Magistrados da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos, em, RECURSO A QUE NÃO SE DÁ PROVIMENTO, À UNANIMIDADE."],
  ];
  for (const [tipo, t] of casos) {
    const r = resultadoComOrigem(t, tipo);
    assert.ok(!r.conjunto.has("PROVIDO"), `PROVIDO indevido: ${t.slice(0, 50)}`);
    assert.notEqual(rot(t, tipo), "PROVIDO");
  }
  // a negação colada ao verbo é desprovimento
  assert.equal(rot(casos[4][1], "ACÓRDÃO"), "DESPROVIDO");
  assert.equal(rot(casos[2][1], "VOTO"), "DESPROVIDO");
});

test("negação: controles — 'dou provimento', 'nego provimento' e os dois recursos continuam como antes", () => {
  assert.equal(rot("Ante o exposto, dou provimento ao recurso.", "VOTO"), "PROVIDO");
  assert.equal(rot("Ante o exposto, nego provimento ao recurso.", "VOTO"), "DESPROVIDO");
  assert.equal(rot("Ante o exposto, dou parcial provimento ao recurso.", "VOTO"), "PARCIAL");
  // dois lados no mesmo texto continua ambíguo
  assert.equal(rot("Nego provimento ao recurso do réu e dou provimento ao recurso do autor.", "VOTO"), null);
  assert.equal(rot("Não conheço do recurso do réu e dou provimento ao do autor.", "VOTO"), "PROVIDO");
});
