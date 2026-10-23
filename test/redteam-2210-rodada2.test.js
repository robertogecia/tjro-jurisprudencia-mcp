// Red team de 22/10/2026, rodada 2 — regressões da 1ª rodada de correções e variantes não cobertas.
// Dados sintéticos (modelados sobre a FORMA de recibos reais, sem nome de parte), sem rede, sem gravar em disco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { faixasAlheias, camposAlheios } from "../server/custodia.js";
import { conferirTrecho } from "../server/verificar.js";
import { resultadoComOrigem, rotuloDoConjunto } from "../server/lib.js";

const temAlerta = (c, p) => (c.alertas || []).some((a) => a.startsWith(p));
const temNota = (c, p) => (c.notas || []).some((a) => a.startsWith(p));
const FECHO = (procl, camara = "2ª Câmara Cível") => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da ${camara} do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${procl} Porto Velho, 01 de outubro de 2026.`;

// =====================================================================================================================
// RELATOR VENCIDO — a faixa só sai com as duas pontas: cabeçalho VOTO do relator e cabeçalho do vogal seguinte.

// Questão de ordem (forma do recibo 29911948): não há voto do relator no documento; o vogal suscita a questão de ordem
// e ela vence "por maioria, vencido o relator". Antes da rodada 2 a faixa ia do RELATÓRIO até a ementa e engolia o
// voto VENCEDOR.
const QO = `Classe: Apelação Cível RELATÓRIO Ação declaratória de inexistência de débito. Sentença de improcedência. Razões recursais pela procedência. QUESTÃO DE ORDEM DESEMBARGADOR BELTRANO SILVA O relator traz o feito a julgamento, contudo, pedindo vênia, suscito questão de ordem ao entendimento de que o processo deve ser suspenso em razão da determinação oriunda do incidente de resolução de demandas repetitivas sobre cartão consignado. O caso presente inclui-se na temática do incidente, devendo, portanto, ser suspenso até a resolução do IRDR. DESEMBARGADOR CICRANO SOUZA Acompanho o voto do desemb. Beltrano Silva. Ementa : APELAÇÃO CÍVEL. QUESTÃO DE ORDEM. IRDR. SUSPENSÃO. I. CASO EM EXAME Ação declaratória. IV. DISPOSITIVO E TESE Processo suspenso. ${FECHO("“QUESTÃO DE ORDEM ADMITIDA PARA SUSPENDER O PROCESSO, NOS TERMOS DO VOTO DO DES. BELTRANO SILVA, POR MAIORIA, VENCIDO O RELATOR. LAVRARÁ O ACÓRDÃO O DES. BELTRANO SILVA.”")}`;
const RATIO_QO = "o processo deve ser suspenso em razão da determinação oriunda do incidente de resolução de demandas repetitivas";

test("rodada 2 — relator vencido sem voto do relator no documento (questão de ordem): nenhuma faixa, o vencedor não é marcado", () => {
  const fx = faixasAlheias(QO, "ACÓRDÃO");
  assert.equal(fx.divergente, null);
  assert.ok(!temAlerta(conferirTrecho(QO, RATIO_QO, "ACÓRDÃO"), "VOTO DIVERGENTE"));
  assert.equal(camposAlheios(QO, "ACÓRDÃO").trecho_divergente, "");
});

// Turma Recursal (forma do recibo 36882160): cabeçalho do vogal em caixa mista, "Voto JUIZ Guilherme…".
const TR = `Classe: Recurso Inominado Cível RELATÓRIO Trata-se de recurso inominado da concessionária. É o relatório. VOTO Da inovação recursal. A recorrente sustenta fato novo apenas em sede recursal. Mérito. A interrupção indevida do fornecimento atingiu serviço essencial, circunstância suficiente para caracterizar o dano moral, e a redução da indenização para R$ 2.000,00 atende à razoabilidade. Diante do exposto, VOTO no sentido de DAR PARCIAL PROVIMENTO ao recurso. É como voto. Voto JUIZ Fulano Ribeiro Tal Acompanho integralmente o voto do eminente relator, à exceção do valor fixado a título de dano moral, que considero acima dos parâmetros desta Turma, razão pela qual reduzo a indenização para R$ 1.000,00. EMENTA TURMA RECURSAL. DIREITO DO CONSUMIDOR. CORTE INDEVIDO. ${FECHO("RECURSO INOMINADO CÍVEL PARCIALMENTE PROVIDO, POR MAIORIA, NOS TERMOS DO VOTO PARCIALMENTE DIVERGENTE DO JUIZ DE DIREITO FULANO RIBEIRO TAL. VENCIDO O RELATOR.", "2ª Turma Recursal")}`;

test("rodada 2 — vogal com cabeçalho em caixa mista ('Voto JUIZ Fulano…'): a faixa para nele; o voto vencedor fica de fora", () => {
  const fx = faixasAlheias(TR, "ACÓRDÃO");
  assert.ok(fx.divergente, "relator vencido sem marca");
  assert.equal(fx.divergente[1], TR.indexOf("Voto JUIZ Fulano"));
  assert.ok(temAlerta(conferirTrecho(TR, "A interrupção indevida do fornecimento atingiu serviço essencial", "ACÓRDÃO"), "VOTO DIVERGENTE"));
  assert.ok(!temAlerta(conferirTrecho(TR, "considero acima dos parâmetros desta Turma, razão pela qual reduzo a indenização", "ACÓRDÃO"), "VOTO DIVERGENTE"));
});

// Formato antigo (forma do recibo 1037526): ementa e fecho no ALTO, votos depois. O voto do relator está depois do
// fecho, fora do alcance da faixa — a marca não pode cair no cabeçalho do documento.
const ANTIGO = `Poder Judiciário do Estado de Rondônia 1ª Câmara Cível Data do julgamento: 14/05/2019 Apelação Origem: Comarca X Relator originário: Desembargador Fulano de Tal Relator para o acórdão: Desembargador Beltrano Silva EMENTA Apelação. Ilegitimidade ativa. Preliminar acolhida. ${FECHO("POR MAIORIA, ACOLHER A PRELIMINAR, VENCIDOS O RELATOR E O DESEMBARGADOR CICRANO, NOS TERMOS DO VOTO DIVERGENTE DO DESEMBARGADOR BELTRANO SILVA.", "1ª Câmara Cível")} RELATÓRIO Trata-se de apelação. VOTO DESEMBARGADOR FULANO DE TAL Rejeito a preliminar de ilegitimidade e passo ao mérito. É como voto. DESEMBARGADOR BELTRANO SILVA Peço vênia para acolher a preliminar.`;

test("rodada 2 — formato antigo (fecho no alto, votos depois): o cabeçalho do documento nunca vira 'voto divergente'", () => {
  const fx = faixasAlheias(ANTIGO, "ACÓRDÃO");
  assert.ok(!fx.divergente || fx.divergente[0] > ANTIGO.indexOf("RELATÓRIO"), `faixa no cabeçalho: ${JSON.stringify(fx.divergente)}`);
  assert.ok(!temAlerta(conferirTrecho(ANTIGO, "Relator para o acórdão: Desembargador Beltrano Silva", "ACÓRDÃO"), "VOTO DIVERGENTE"));
});

const docC = ({ votoRel = "Conheço do recurso. A tarifa de avaliação do bem é devida quando comprovada a efetiva prestação do serviço, o que não se verifica nos autos, razão pela qual a restituição se impõe. Ante o exposto, dou provimento ao recurso. É como voto.", voto2 = "Com a devida vênia ao eminente relator, entendo de forma diversa. No caso, o laudo de avaliação consta dos autos e demonstra a efetiva prestação do serviço, de modo que a cobrança é legítima. Nego provimento ao recurso.", procl }) => `Classe: Apelação Cível
RELATÓRIO
Trata-se de apelação interposta pela parte autora contra sentença que julgou improcedente o pedido.
É o relatório.
VOTO
DESEMBARGADOR FULANO DE TAL
${votoRel}
DESEMBARGADOR BELTRANO SILVA
${voto2}
DESEMBARGADOR CICRANO SOUZA
Acompanho o voto do Desembargador Beltrano Silva.
EMENTA
Apelação cível. Tarifa de avaliação do bem. Serviço comprovado. Recurso não provido.
${FECHO(procl)}`;
const TESE_REL = "A tarifa de avaliação do bem é devida quando comprovada a efetiva prestação do serviço, o que não se verifica nos autos";
const TESE_VENC = "o laudo de avaliação consta dos autos e demonstra a efetiva prestação do serviço";

test("rodada 2 — relator sem 'É como voto': a faixa para no cabeçalho do vogal, não engole o vencedor", () => {
  const t = docC({ votoRel: "A tarifa de avaliação do bem é devida quando comprovada a efetiva prestação do serviço, o que não se verifica nos autos. Dou provimento ao recurso.", procl: "POR MAIORIA, VENCIDO O RELATOR, NEGAR PROVIMENTO AO RECURSO." });
  const fx = faixasAlheias(t, "ACÓRDÃO");
  assert.ok(fx.divergente);
  assert.equal(fx.divergente[1], t.indexOf("DESEMBARGADOR BELTRANO SILVA"));
  assert.ok(temAlerta(conferirTrecho(t, TESE_REL, "ACÓRDÃO"), "VOTO DIVERGENTE"));
  assert.ok(!temAlerta(conferirTrecho(t, TESE_VENC, "ACÓRDÃO"), "VOTO DIVERGENTE"));
});

test("rodada 2 — fecho só com 'nos termos do voto divergente…, que lavrará o acórdão' e 'vencido EM PARTE o relator' marcam o relator", () => {
  for (const procl of ["NEGAR PROVIMENTO AO RECURSO, NOS TERMOS DO VOTO DIVERGENTE DO DESEMBARGADOR BELTRANO SILVA, QUE LAVRARÁ O ACÓRDÃO.",
    "POR MAIORIA, VENCIDO EM PARTE O RELATOR, DAR PARCIAL PROVIMENTO AO RECURSO.",
    "POR MAIORIA, VENCIDO PARCIALMENTE O RELATOR, DAR PARCIAL PROVIMENTO AO RECURSO."]) {
    const t = docC({ procl });
    assert.ok(temAlerta(conferirTrecho(t, TESE_REL, "ACÓRDÃO"), "VOTO DIVERGENTE"), procl);
    assert.ok(!temAlerta(conferirTrecho(t, TESE_VENC, "ACÓRDÃO"), "VOTO DIVERGENTE"), procl);
  }
  // 'vencido em parte o relator' com fórmula clássica do vogal: antes a faixa ia do vogal (VENCEDOR) até a ementa
  const cl = docC({ voto2: "Peço vênia ao eminente relator para divergir. O laudo de avaliação consta dos autos e demonstra a efetiva prestação do serviço. Nego provimento.", procl: "POR MAIORIA, VENCIDO EM PARTE O RELATOR, DAR PARCIAL PROVIMENTO AO RECURSO." });
  assert.ok(temAlerta(conferirTrecho(cl, TESE_REL, "ACÓRDÃO"), "VOTO DIVERGENTE"));
  assert.ok(!temAlerta(conferirTrecho(cl, TESE_VENC, "ACÓRDÃO"), "VOTO DIVERGENTE"));
});

test("rodada 2 — controles do relator vencido: unânime, 'voto divergente' + unanimidade e vogal vencido não marcam", () => {
  for (const procl of ["RECURSO PROVIDO NOS TERMOS DO VOTO DO RELATOR, À UNANIMIDADE.",
    "NEGAR PROVIMENTO AO RECURSO, NOS TERMOS DO VOTO DIVERGENTE DO DESEMBARGADOR BELTRANO SILVA, À UNANIMIDADE.",
    "POR MAIORIA, DAR PROVIMENTO AO RECURSO, VENCIDO O DESEMBARGADOR CICRANO SOUZA."]) {
    const t = docC({ voto2: "Acompanho o relator.", procl });
    assert.ok(!temAlerta(conferirTrecho(t, TESE_REL, "ACÓRDÃO"), "VOTO DIVERGENTE"), procl);
  }
});

// =====================================================================================================================
// VOZ DA CASA — o rótulo EMENTA da casa não pode ser descartado sem indício de que está dentro de um voto.
const CASA = "APELAÇÃO CÍVEL. DIREITO DO CONSUMIDOR. DESCONTO INDEVIDO. I. CASO EM EXAME Apelação contra sentença de procedência. II. QUESTÃO EM DISCUSSÃO Saber se há dano moral. III. RAZÕES DE DECIDIR O desconto indevido em benefício previdenciário gera dever de indenizar. IV. DISPOSITIVO E TESE Recurso desprovido.";
const FRASE_CASA = "O desconto indevido em benefício previdenciário gera dever de indenizar";
const FECHO_UN = FECHO("RECURSO NÃO PROVIDO, À UNANIMIDADE.");
const baseVoto = "Classe: Apelação Cível RELATÓRIO Trata-se de apelação. É o relatório. VOTO No caso dos autos, a autora comprova desconto não autorizado. Ante o exposto, nego provimento ao recurso. É como voto.";

test("rodada 2 — 'Acompanho' sem ponto antes do rótulo EMENTA da casa não desloca a voz da casa para dentro da ementa", () => {
  for (const vogal of ["DESEMBARGADOR BELTRANO SILVA Acompanho o relato", "DESEMBARGADOR BELTRANO SILVA Acompanho", "DESEMBARGADOR BELTRANO SILVA Acompanho o Relator DESEMBARGADOR CICRANO SOUZA", "DESEMBARGADOR BELTRANO SILVA Acompanho a divergência"]) {
    for (const rot of ["EMENTA ", "Ementa : "]) {
      const t = `${baseVoto} ${vogal} ${rot}${CASA} ${FECHO_UN}`;
      const fx = faixasAlheias(t, "ACÓRDÃO");
      assert.equal(fx.casaIni, t.indexOf(rot), `${vogal} | ${rot}`);
      assert.ok(temNota(conferirTrecho(t, FRASE_CASA, "ACÓRDÃO"), "VOZ DA CASA"));
    }
  }
});

test("rodada 2 — 'de acordo.' no TEXTO da ementa da casa não joga a voz da casa para o meio dela", () => {
  const casa = "APELAÇÃO CÍVEL. AUDIÊNCIA DE CONCILIAÇÃO. I. CASO EM EXAME Apelação. III. RAZÕES DE DECIDIR 1. A ausência da audiência não gera nulidade diante da impossibilidade absoluta de acordo. 2. O desconto indevido em benefício previdenciário gera dever de indenizar. IV. DISPOSITIVO E TESE Recurso desprovido.";
  const t = `${baseVoto} DESEMBARGADOR BELTRANO SILVA De acordo. EMENTA ${casa} ${FECHO_UN}`;
  assert.equal(faixasAlheias(t, "ACÓRDÃO").casaIni, t.indexOf("EMENTA "));
  assert.ok(temNota(conferirTrecho(t, "A ausência da audiência não gera nulidade", "ACÓRDÃO"), "VOZ DA CASA"));
  assert.ok(temNota(conferirTrecho(t, FRASE_CASA, "ACÓRDÃO"), "VOZ DA CASA"));
});

test("rodada 2 — ementa da casa posta no ALTO do documento continua voz da casa", () => {
  const t = `EMENTA ${CASA} RELATÓRIO Trata-se de apelação. É o relatório. VOTO No caso dos autos, a autora comprova desconto não autorizado. Ante o exposto, nego provimento ao recurso. É como voto. ${FECHO_UN}`;
  const fx = faixasAlheias(t, "ACÓRDÃO");
  assert.equal(fx.casaIni, 0);
  assert.ok(temNota(conferirTrecho(t, FRASE_CASA, "ACÓRDÃO"), "VOZ DA CASA"));
});

const STJ = "EMENTA PROCESSUAL CIVIL. AGRAVO INTERNO NO RECURSO ESPECIAL. A instituição financeira responde objetivamente pelos danos decorrentes de fraude praticada por terceiro no âmbito de operações bancárias, independentemente de culpa. Agravo interno desprovido. (AgInt no REsp 9.999.999/XX, Rel. Ministro Fulano de Tal, Quarta Turma, julgado em 01/01/2020).";
const FRASE_STJ = "A instituição financeira responde objetivamente pelos danos decorrentes de fraude praticada por terceiro";

test("rodada 2 — ementa do STJ transcrita, relator SEM 'É como voto' e casa CNJ sem rótulo: TRANSCRIÇÃO, não VOZ DA CASA", () => {
  const t = `Classe: Apelação Cível. RELATÓRIO Trata-se de apelação. É o relatório. VOTO O recurso é tempestivo. Sobre o tema: ${STJ} Ante o exposto, nego provimento ao recurso. DIREITO CIVIL. APELAÇÃO CÍVEL. I. Caso em exame. III. Razões de decidir. ${FRASE_CASA}. IV. Dispositivo e tese. Recurso desprovido. ${FECHO_UN}`;
  const fx = faixasAlheias(t, "ACÓRDÃO");
  assert.ok(fx.casaIni > t.indexOf("nego provimento ao recurso."), `casaIni ${fx.casaIni}`);
  const c = conferirTrecho(t, FRASE_STJ, "ACÓRDÃO");
  assert.ok(!temNota(c, "VOZ DA CASA"));
  assert.ok(temAlerta(c, "TRANSCRIÇÃO"));
  assert.ok(temNota(conferirTrecho(t, FRASE_CASA, "ACÓRDÃO"), "VOZ DA CASA"));
});

// =====================================================================================================================
// NEGAÇÃO de "dar provimento": procurada na mesma oração.
const rot = (texto, tipo = "VOTO", classe = "APELAÇÃO CÍVEL") => { const r = resultadoComOrigem(texto, tipo); return rotuloDoConjunto(r.conjunto, classe, r.embargos); };

test("rodada 2 — negação afastada de 'dar provimento' nunca vira PROVIDO", () => {
  for (const t of ["Não há como se dar provimento ao recurso.", "Não há que se dar provimento ao recurso.", "Não é possível dar provimento ao recurso.",
    "Não se justifica dar provimento ao recurso.", "Inviável dar provimento ao recurso.", "Não vejo como dar provimento ao recurso.",
    "Assim, este recurso não deve ser provido, tendo em vista que inexistiram vícios no voto prolatado.", "Sem dar provimento ao recurso, mantenho a sentença."]) {
    assert.ok(!resultadoComOrigem(t, "VOTO").conjunto.has("PROVIDO"), t);
    assert.notEqual(rot(t), "PROVIDO", t);
  }
  assert.equal(rot("Não lhe dou provimento."), "DESPROVIDO");
  assert.equal(rot("Não dou provimento ao recurso."), "DESPROVIDO");
});

test("rodada 2 — negação: controles em que a negação é de OUTRA oração continuam PROVIDO", () => {
  for (const t of ["Não há como negar: dou provimento ao recurso.", "Não conheço do recurso do réu e dou provimento ao do autor.",
    "Não obstante as alegações, dou provimento ao recurso.", "Sem razão o apelado. Dou provimento ao recurso.",
    "Deixo de conhecer do agravo retido e dou provimento à apelação."])
    assert.equal(rot(t), "PROVIDO", t);
  assert.equal(rot("Ante o exposto, dou parcial provimento ao recurso."), "PARCIAL");
  assert.equal(rot("Nego provimento ao recurso do réu e dou provimento ao recurso do autor."), null);
});
