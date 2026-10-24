// Correções de 24/10/2026 (estatística estratificada + reataque Fable) — sintético, sem rede, recibos só em os.tmpdir().
// PRINCIPAL: a data_julgamento do ÍNDICE do portal não é a do julgamento e não confirma ✅ sozinha.
// (a) faixa de ALEGAÇÃO / bloco introduzido cortados no meio da palavra; verificador × recibo nas faixas introduzidas;
// (b) concessiva pós-posta terminada em ponto e vírgula interna (aposto curto); (c) relator vencido em grafias novas;
// (d) julgador/órgão afirmado e não comparado → 🟠; (e) hífen de quebra do PDF no trecho; (f) costura de 3+ fragmentos.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { auditarCitacoes, relatorVencidoNoFecho } from "../server/auditoria.js";
import { conferirTrecho } from "../server/verificar.js";
import { faixasAlegacao, faixasIntroduzidas, camposDeVoz } from "../server/voz.js";
import { norm1 } from "../server/custodia.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

let seq = 980000;
const NUM = "7000001-34.2024.8.22.0001", NR = "70000013420248220001";
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-corrige-indice-"));
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", nr_processo: NR, ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num)) || "";
const aud = (p, cit) => linhaDe(auditarCitacoes(`Nesse sentido: TJRO, Apelação Cível n. ${NUM}, ${cit}.`, p), NUM);
const CAB = (rot) => `1ª Câmara Cível / Gabinete Des. Fulano Processo: ${NUM} - APELAÇÃO CÍVEL (198) Relator: Des. RADUAN MIGUEL FILHO Data distribuição: 12/09/2021 11:39:03 Data julgamento: ${rot} Polo Ativo: A Polo Passivo: B `;
const FECHO = (proc, data, ass = "Desembargador RADUAN MIGUEL FILHO RELATOR") => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${proc} Porto Velho, ${data} ${ass}`;

// ------------------------------------------------------------------------------------------------ PRINCIPAL ---
test("principal: data igual só ao ÍNDICE não é ✅ — 🟠 com a data do documento; a do documento continua ✅", () => {
  const p = pastaCom({ dtjulgamento_str: "21/03/2022", ds_modelo_documento: CAB("15/03/2022") + "RELATÓRIO x. VOTO y. " + FECHO("RECURSO NÃO PROVIDO, À UNANIMIDADE.", "15 de março de 2022") });
  const l = aud(p, "j. 21/03/2022");
  assert.match(l, /^🟠/);
  assert.match(l, /data do índice do portal difere da do documento: 15\/03\/2022/);
  assert.match(aud(p, "j. 15/03/2022"), /^✅ .*data/);
  assert.match(aud(p, "j. 30/04/2022"), /^🔴/);   // data longe continua 🔴
});
test("principal: sem nenhuma âncora no documento, a data do índice sai 🟠 'não confirmada no documento'", () => {
  const p = pastaCom({ dtjulgamento_str: "10/05/2023", ds_modelo_documento: "EMENTA Apelação cível. Contrato bancário. Juros. Recurso não provido. RELATÓRIO x. VOTO Nego provimento ao recurso, mantendo a sentença por seus próprios fundamentos." });
  const l = aud(p, "j. 10/05/2023");
  assert.match(l, /^🟠/);
  assert.match(l, /não confirmada no documento/);
});

// ------------------------------------------------------------------------------------------------------ (a) ---
const LETRA = /[A-Za-zÀ-ÿ0-9]/;
test("(a) faixa de alegação que bate no teto termina em fronteira de palavra", () => {
  const corpo = "a cobrança indevida das parcelas do contrato firmado entre as partes em razão de vícios de consentimento sobre os imóveis da família ".repeat(8);
  const bruto = "RELATÓRIO Trata-se de apelação. O apelante sustenta que " + corpo + "fim.";
  const tn = norm1(bruto);
  const fx = faixasAlegacao(bruto, tn, 0, bruto.length);
  assert.ok(fx.length, "faixa esperada");
  for (const [, b] of fx) assert.ok(!(LETRA.test(bruto[b - 1] || "") && LETRA.test(bruto[b] || "")), `corte no meio da palavra: «${bruto.slice(b - 10, b + 10)}»`);
});
test("(a) bloco introduzido que bate em INTRODUZIDA_MAX termina em fronteira de palavra", () => {
  const corpo = "A boa-fé objetiva impõe deveres anexos de lealdade e cooperação entre os contratantes durante toda a execução do pacto ".repeat(30);
  const bruto = "VOTO Araken de Assis leciona: XY" + corpo;   // o prefixo põe o teto de 2.500 no meio de "pacto"
  const fx = faixasIntroduzidas(norm1(bruto), bruto, 0, bruto.length);
  assert.ok(fx.length);
  for (const [, b] of fx) assert.ok(!(LETRA.test(bruto[b - 1] || "") && LETRA.test(bruto[b] || "")), `corte no meio da palavra: «${bruto.slice(b - 10, b + 10)}»`);
});
test("(a) verificador e recibo usam as mesmas faixas introduzidas (retomada depois do trecho)", () => {
  const texto = "RELATÓRIO Apelação. VOTO Transcrevo o trecho da sentença: Consta dos autos que o contrato foi assinado pela parte autora sem qualquer vício aparente de consentimento. O juízo examinou bem a prova documental juntada aos autos e, portanto, mantenho a sentença. É como voto.";
  const trecho = "O juízo examinou bem a prova documental juntada aos autos";
  const r = conferirTrecho(texto, trecho, "VOTO");
  assert.ok(r.ok);
  const doRecibo = camposDeVoz(texto, "VOTO").trechos_sentenca_transcrita.some((b) => norm1(b).includes(norm1(trecho)));
  const doVerificador = r.alertas.some((a) => a.startsWith("SENTENÇA TRANSCRITA"));
  assert.equal(doVerificador, doRecibo, JSON.stringify({ alertas: r.alertas, doRecibo }));
});

// ------------------------------------------------------------------------------------------------------ (b) ---
const temConc = (texto, trecho, tipo = "SENTENÇA") => { const r = conferirTrecho(texto, trecho, tipo); assert.ok(r.ok, JSON.stringify(r)); return r.alertas.some((a) => a.startsWith("OBITER DICTUM? (concessiva)")); };
test("(b) concessiva pós-posta terminada em ponto leva OBITER DICTUM? (concessiva)", () => {
  const t1 = "FUNDAMENTAÇÃO A autoria está comprovada pelas testemunhas ouvidas em juízo, e ainda que não seja possível delimitar com absoluta precisão o horário do crime. Basta que a prova seja segura quanto ao fato.";
  assert.ok(temConc(t1, "não seja possível delimitar com absoluta precisão o horário do crime"));
  const t2 = "VOTO O Ministério Público atua como fiscal da ordem jurídica, mesmo que não intervenha diretamente no processo. A imparcialidade do juízo não se confunde com a do órgão ministerial.";
  assert.ok(temConc(t2, "não intervenha diretamente no processo", "VOTO"));
  // concessiva ANTEPOSTA com ponto (sem oração principal antes) continua sem alerta: o ponto não fecha a concessiva
  assert.ok(!temConc("FUNDAMENTAÇÃO Embora não haja prova documental do pagamento integral da dívida. O réu confessou em juízo.", "não haja prova documental do pagamento integral da dívida"));
});
test("(b) vírgula interna (aposto curto) não fecha a concessiva cedo", () => {
  const t1 = "FUNDAMENTAÇÃO Embora os documentos não permitam individualizar, unidade por unidade, quais mercadorias adquiridas permaneciam no estoque no momento do acidente, o registro contábil demonstra o prejuízo.";
  assert.ok(temConc(t1, "não permitam individualizar, unidade por unidade, quais mercadorias adquiridas permaneciam no estoque"));
  const t2 = "FUNDAMENTAÇÃO Embora não haja, nos autos, prova documental do pagamento integral da dívida, o réu confessou em juízo o débito.";
  assert.ok(temConc(t2, "prova documental do pagamento integral da dívida"));
  // a oração principal continua sem alerta
  assert.ok(!temConc(t2, "o réu confessou em juízo o débito"));
});

// ------------------------------------------------------------------------------------------------------ (c) ---
const CAB2 = `Processo: ${NUM} - APELAÇÃO CÍVEL (198) Relator: Des. JORGE LUIZ DOS SANTOS LEAL Data distribuição: 31/08/2023 09:36:49 Data julgamento: 22/11/2023 Polo Ativo: A Polo Passivo: B RELATÓRIO Apelação. VOTO Nego provimento. `;
const FECHO2 = (proc) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${proc} Porto Velho, 22 de Novembro de 2023 Desembargador JORGE LUIZ DOS SANTOS LEAL RELATOR`;
test("(c) relator vencido: nome em CAIXA ALTA, 'RELATOR VENCIDO', 'relator(a) vencido(a)', 'VENCIDO O E. RELATOR'", () => {
  for (const proc of ["RECURSO PROVIDO, POR MAIORIA, VENCIDO O DESEMBARGADOR JORGE LUIZ DOS SANTOS LEAL, RELATOR.", "RECURSO PROVIDO, POR MAIORIA, RELATOR VENCIDO.", "RECURSO PROVIDO, POR MAIORIA, RELATOR(A) VENCIDO(A).", "RECURSO PROVIDO, POR MAIORIA, VENCIDO O E. RELATOR."]) {
    const txt = CAB2 + FECHO2(proc);
    assert.equal(relatorVencidoNoFecho(txt).vencido, true, proc);
    const p = pastaCom({ dtjulgamento_str: "19/12/2023", ds_modelo_documento: txt });
    assert.doesNotMatch(aud(p, "2ª Câmara Cível, Rel. Des. Jorge Luiz dos Santos Leal, j. 22/11/2023"), /^✅/, proc);
  }
  // narrativa em minúsculas e "VENCIDO EM PARTE O RELATOR" não mudam
  assert.equal(relatorVencidoNoFecho(CAB2 + FECHO2("RECURSO PROVIDO, POR MAIORIA, VENCIDO EM PARTE O RELATOR.")).vencido, false);
  assert.equal(relatorVencidoNoFecho(CAB2 + FECHO2("RECURSO PROVIDO, À UNANIMIDADE, vencido o des. Fulano de Tal, que acompanhou o voto originário do relator.")).vencido, false);
});

// ------------------------------------------------------------------------------------------------------ (d) ---
test("(d) 'Des.' sem 'Rel.', 'Redator', 'Juiz de Direito' e 'Vara' afirmados e não comparados → 🟠", () => {
  const p = pastaCom({ dtjulgamento_str: "21/03/2022", ds_modelo_documento: CAB("15/03/2022") + "RELATÓRIO x. VOTO y. " + FECHO("RECURSO NÃO PROVIDO, À UNANIMIDADE.", "15 de março de 2022") });
  assert.match(aud(p, "j. 15/03/2022"), /^✅/);   // sanidade
  assert.match(aud(p, "Des. Fulano Inexistente da Silva, j. 15/03/2022"), /^🟠/);
  assert.match(aud(p, "Redator p/ acórdão Des. Fulano Inexistente, j. 15/03/2022"), /^🟠/);
  assert.match(aud(p, "99ª Vara Cível de Nova Mamoré, Juiz de Direito Fulano Inexistente, j. 15/03/2022"), /^🟠/);
});

// ------------------------------------------------------------------------------------------------------ (e) ---
test("(e) trecho com quebra de hífen do PDF casa com o texto sem a quebra; número e negação continuam exatos", () => {
  const texto = "RELATÓRIO Trata-se de apelação cível interposta contra a sentença que julgou procedentes os pedidos. O Ministério Público manifestou-se pela manutenção da sentença em 10 laudas. VOTO Nego provimento.";
  assert.equal(conferirTrecho(texto, "Trata- se de apelação cível interposta contra a sentença", "ACÓRDÃO").ok, true);
  assert.equal(conferirTrecho(texto, "O Ministério Público manifestou- se pela manutenção da sentença", "ACÓRDÃO").ok, true);
  assert.equal(conferirTrecho(texto, "manifestou- se pela manutenção da sentença em 11 laudas", "ACÓRDÃO").ok, false);
  assert.equal(conferirTrecho(texto, "manifestou- se pela não manutenção da sentença", "ACÓRDÃO").ok, false);
  // a quebra no TEXTO continua tratada como antes ("con- trato" × "contrato")
  assert.equal(conferirTrecho("VOTO O con- trato foi firmado validamente entre as partes, sem vício.", "O contrato foi firmado validamente entre as partes", "VOTO").ok, true);
});

// ------------------------------------------------------------------------------------------------------ (f) ---
test("(f) costura de 3 fragmentos de 3 palavras leva FRAGMENTOS CURTOS", () => {
  const texto = "VOTO Não se verifica erro ou omissão no julgado embargado. Cumpre observar que a tese, esta que não foi suscitada antes, é inovação recursal. A parte embargante revela conduta contraditória ao recorrer do que pediu.";
  const r = conferirTrecho(texto, "erro ou omissão [...] esta que não [...] revela conduta contraditória", "VOTO");   // exemplo do Fable (1111897)
  assert.ok(r.ok);
  assert.ok(r.alertas.some((a) => a.startsWith("FRAGMENTOS CURTOS")), JSON.stringify(r.alertas));
});
