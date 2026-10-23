// Leva A do red team de 22/10/2026 — riscos de falso "confere". Tudo sintético, sem rede, em os.tmpdir().
// (1) relator: um sobrenome em comum não confere; (2) data do julgamento ancorada ao fecho/sessão/assinatura;
// (3) "[...]" que tira a negação; (4) câmara do acórdão REVISADO no cabeçalho de revisão criminal/embargos infringentes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditarCitacoes, regiaoDoJulgamento } from "../server/auditoria.js";
import { _limparMemoParaTeste } from "../server/recibos.js";
import { recibo, compararRelator, relatorDiverge, extrairRelatorDoTexto, extrairOrgaoComOrigem, formatInteiro } from "../server/lib.js";
import { conferirTrecho, negacaoNoCorte } from "../server/verificar.js";
import { citacoesDoTexto } from "../server/precedentes.js";

const A = "70000013420248220001"; // 7000001-34.2024.8.22.0001 (dígito válido)
const fecho = (c, data = "21 de novembro de 2023") => ` VOTO Nego provimento. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da ${c} do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE. Porto Velho, ${data}.`;
function pasta(docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-leva-a-"));
  for (const s of docs) { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); }
  return p;
}
const linha = (out, nr) => out.split("\n").find((l) => l.includes(nr)) || "";

// ---------- (1) relator ----------
test("leva A (1): compararRelator — sobrenome em comum não basta; nome único ambíguo; forma curta", () => {
  assert.equal(compararRelator("Raduan Miguel Filho", "Alexandre Miguel"), "diverge");
  assert.equal(compararRelator("Rel. Des. Raduan Miguel Filho", "ALEXANDRE MIGUEL"), "diverge");
  assert.equal(compararRelator("Des. Miguel", "Alexandre Miguel"), "ambiguo");          // Alexandre Miguel, Raduan Miguel Filho, Miguel Monico Neto
  assert.equal(compararRelator("Marcos Alaor Diniz Grangeia", "Alaor Diniz"), "ambiguo"); // forma curta com outro último sobrenome
  assert.equal(compararRelator("Des. Kiyochi Mori", "PAULO KIYOCHI MORI"), "confere");
  assert.equal(compararRelator("Paulo Kiyochi Mori", "KIYOCHI MORI"), "confere");
  assert.equal(compararRelator("Des. Alexandre Miguel", "ALEXANDRE MIGUEL"), "confere");
  assert.equal(compararRelator("Desembargador", "ALEXANDRE MIGUEL"), null);
  // o agnome não identifica: "X Filho" × "Y Filho" não casa pelo Filho
  assert.equal(compararRelator("Raduan Miguel Filho", "Rinaldo Forti Filho"), "diverge");
  // compatibilidade: relatorDiverge só para divergência de fato
  assert.equal(relatorDiverge("Raduan Miguel Filho", "Alexandre Miguel"), true);
  assert.equal(relatorDiverge("Des. Miguel", "Alexandre Miguel"), false);
});

test("leva A (1): cabeçalho — rótulos depois do nome e 'substituído por' (medido nos recibos reais)", () => {
  assert.equal(extrairRelatorDoTexto("Relator: DES. KIYOCHI MORI Interpostos em 19/05/2023 Embargante: X"), "DES. KIYOCHI MORI");
  assert.equal(extrairRelatorDoTexto("Relator: DESEMBARGADOR KIYOCHI MORI REDISTRIBUÍDO POR PREVENÇÃO"), "DESEMBARGADOR KIYOCHI MORI");
  assert.equal(extrairRelatorDoTexto("Relator: Desembargador Francisco Borges Impedido Embargante: X"), "Desembargador Francisco Borges");
  assert.equal(extrairRelatorDoTexto("Relator: Desembargador(a) OSNY CLARO DE OLIVEIRA JUNIOR Apelante: X"), "Desembargador(a) OSNY CLARO DE OLIVEIRA JUNIOR");
  assert.equal(extrairRelatorDoTexto("Relator: Juiz Jorge Gurgel do Amaral(Desembargador Alexandre Miguel) Apelante: X"), "Juiz Jorge Gurgel do Amaral");
  // quem relata é o substituto
  assert.equal(extrairRelatorDoTexto("Relator: Des. RADUAN MIGUEL FILHO substituído por ALDEMIR DE OLIVEIRA Apelante: X"), "ALDEMIR DE OLIVEIRA");
  assert.equal(extrairRelatorDoTexto("Relator: Des. RADUAN MIGUEL FILHO substituído por"), null);
  assert.equal(compararRelator(extrairRelatorDoTexto("Relator: JUÍZA DE DIREITO SILVANA MARIA DE FREITAS"), "SILVANA MARIA DE FREITAS"), "confere");
});

test("leva A (1): auditoria — Raduan Miguel Filho contra acórdão de Alexandre Miguel sai 🟠, nunca ✅", () => {
  const p = pasta([{ id_processo_documento: 900001, nr_processo: A, tipo: "ACÓRDÃO", dtjulgamento_str: "21/11/2023", nome_relator_acordao: "ALEXANDRE MIGUEL",
    ds_modelo_documento: "Relator: Des. ALEXANDRE MIGUEL Processo: Apelação. RELATÓRIO Trata-se de apelação." + fecho("2ª Câmara Cível") }]);
  const errado = auditarCitacoes("(TJRO, Apelação 7000001-34.2024.8.22.0001, 2ª Câmara Cível, Rel. Des. Raduan Miguel Filho, j. 21/11/2023)", p);
  assert.match(linha(errado, "7000001-34"), /^🟠 .*a peça dá como relator Raduan Miguel Filho/);
  const ambiguo = auditarCitacoes("(TJRO, Apelação 7000001-34.2024.8.22.0001, 2ª Câmara Cível, Rel. Des. Miguel, j. 21/11/2023)", p);
  assert.match(linha(ambiguo, "7000001-34"), /^🟠 .*só bate EM PARTE/);
  const certo = auditarCitacoes("(TJRO, Apelação 7000001-34.2024.8.22.0001, 2ª Câmara Cível, Rel. Des. Alexandre Miguel, j. 21/11/2023)", p);
  assert.match(linha(certo, "7000001-34"), /^✅ .*Bate com a peça: câmara, relator, data/);
});

test("leva A (1): inteiro teor avisa Raduan Miguel Filho × ALEXANDRE MIGUEL do índice", () => {
  const nr = "08053155020248220000";
  const data = { hits: { total: { value: 1 }, hits: [{ _source: {
    tipo: "ACÓRDÃO", nr_processo: nr, id_processo_documento: 5, dtjulgamento: "2025-03-10", nome_relator_acordao: "ALEXANDRE MIGUEL",
    ds_orgao_julgador_colegiado: "2ª Câmara Cível",
    ds_modelo_documento: "Relator: Des. RADUAN MIGUEL FILHO Agravante: A " + "w ".repeat(400) + fecho("2ª Câmara Cível", "10 de março de 2025"),
  } }] } };
  assert.match(formatInteiro(data, nr), /Índice: relator ALEXANDRE MIGUEL · cabeçalho desta peça: "Des. RADUAN MIGUEL FILHO"/);
});

test("leva A (1): lista de leitura conta Alexandre Miguel e Raduan Miguel Filho como 2 relatores; DV inválido fica fora", async () => {
  const { listaDeLeitura } = await import("../server/cadeia.js");
  const corpo = (extra) => "EMENTA tarifa de avaliação do bem. Precedentes: Apelação 7000001-34.2024.8.22.0001 e Apelação 7000009-99.2020.8.22.0001. " + extra;
  const p = pasta([
    { id_processo_documento: 111, nr_processo: "70000025020238220002", tipo: "ACÓRDÃO", dtjulgamento_str: "01/02/2024", nome_relator_acordao: "ALEXANDRE MIGUEL", ds_modelo_documento: corpo("a") },
    { id_processo_documento: 222, nr_processo: "70000033420228220003", tipo: "ACÓRDÃO", dtjulgamento_str: "02/02/2024", nome_relator_acordao: "RADUAN MIGUEL FILHO", ds_modelo_documento: corpo("b") },
  ]);
  const out = listaDeLeitura({ grupos: [["tarifa"], ["avaliação"]] }, citacoesDoTexto, p);
  assert.match(out, /7000001-34\.2024\.8\.22\.0001 — citado em 2 processo\(s\) por 2 relator\(es\)/);
  assert.doesNotMatch(out, /- 7000009-99\.2020\.8\.22\.0001 — citado/);
  assert.match(out, /DV inválido.*7000009-99\.2020\.8\.22\.0001/);
});

// ---------- (2) data ----------
test("leva A (2): data da sentença ou de precedente citado no voto NÃO confirma a data do julgamento", () => {
  const p = pasta([{ id_processo_documento: 900002, nr_processo: A, tipo: "ACÓRDÃO", dtjulgamento_str: "21/11/2023",
    ds_modelo_documento: "Relator: Des. SANSÃO SALDANHA RELATÓRIO Trata-se de apelação contra sentença proferida em 02/02/2022. VOTO Como já decidiu o STJ (REsp 1.111.111/SP, j. 03/05/2019), e esta Corte (Apelação 7000005-00.2020.8.22.0001, julgado em 10/03/2021)." + fecho("1ª Câmara Cível") }]);
  const cita = (dt) => linha(auditarCitacoes(`(TJRO, Apelação 7000001-34.2024.8.22.0001, 1ª Câmara Cível, Rel. Des. Sansão Saldanha, j. ${dt})`, p), "7000001-34");
  assert.match(cita("21/11/2023"), /^✅ .*data/);
  for (const dt of ["02/02/2022", "03/05/2019", "10/03/2021"]) {
    const l = cita(dt);
    assert.doesNotMatch(l, /^✅/, dt);
    assert.match(l, /aparece no texto, mas não como data do julgamento/, dt);
  }
});

test("leva A (2): âncoras — fecho/assinatura com data ≠ índice continua valendo; 'Jurisprudência relevante citada' colada ao fecho não", () => {
  // o índice guarda 06/10/2026 (assinatura), a sessão/fecho diz 05/10/2026: a peça pode citar 05/10/2026
  const ementaCnj = "EMENTA ... Jurisprudência relevante citada: TJRO, Apelação Cível n. 7022105-88.2022.8.22.0001, 2ª Câmara Cível, Rel. Des. Alexandre Miguel, j. 21/03/2024.";
  const p = pasta([{ id_processo_documento: 900003, nr_processo: A, tipo: "ACÓRDÃO", dtjulgamento_str: "06/10/2026",
    ds_modelo_documento: "Relator: Des. SANSÃO SALDANHA RELATÓRIO x. " + ementaCnj + fecho("1ª Câmara Cível", "05 de outubro de 2026") }]);
  const cita = (dt) => linha(auditarCitacoes(`(TJRO, Apelação 7000001-34.2024.8.22.0001, 1ª Câmara Cível, Rel. Des. Sansão Saldanha, j. ${dt})`, p), "7000001-34");
  assert.match(cita("05/10/2026"), /^✅/);
  assert.doesNotMatch(cita("21/03/2024"), /^✅/);
  // a região do julgamento tem o fecho e não tem a lista de precedentes da ementa
  const reg = regiaoDoJulgamento("Sessão Virtual de 30/09/2026 a 04/10/2026 " + ementaCnj + fecho("1ª Câmara Cível", "05 de outubro de 2026"));
  assert.match(reg, /30\/09\/2026 a 04\/10\/2026/);
  assert.match(reg, /05 de outubro de 2026/);
  assert.doesNotMatch(reg, /21\/03\/2024/);
  // sem fecho, sem sessão e sem assinatura: nada ancora
  assert.equal(regiaoDoJulgamento("EMENTA tese qualquer, sentença de 02/02/2022.").trim(), "");
});

// ---------- (3) negação no corte ----------
const TARIFA = "Com efeito, a cobrança da tarifa de avaliação do bem não é devida pelo consumidor, porque o serviço não foi prestado. Recurso provido. É como voto.";
test("leva A (3): '[...]' que tira o 'não' sai com NEGAÇÃO OMITIDA NO CORTE", () => {
  for (const corte of ["[...]", "(...)", "[…]"]) {
    const r = conferirTrecho(TARIFA, `a cobrança da tarifa de avaliação do bem ${corte} é devida pelo consumidor`, "VOTO");
    assert.ok(r.ok);
    assert.ok(r.alertas.some((a) => a.startsWith("NEGAÇÃO OMITIDA NO CORTE")), corte);
  }
  // "não é, conforme o laudo pericial, devido": negação presa ao fragmento anterior, seguida de aposto
  const t2 = "Assim, o adicional não é, conforme o laudo pericial juntado aos autos, devido ao autor desde a admissão.";
  assert.ok(conferirTrecho(t2, "Assim, o adicional [...] devido ao autor desde a admissão", "VOTO").alertas.some((a) => a.startsWith("NEGAÇÃO OMITIDA")));
});

test("leva A (3): sem alarme falso — aposto entre vírgulas, oração encerrada, 'não é demais', nome da ação", () => {
  const sem = (texto, trecho) => assert.ok(!conferirTrecho(texto, trecho, "VOTO").alertas.some((a) => a.startsWith("NEGAÇÃO OMITIDA")), trecho);
  sem("A natureza da cobrança é administrativa, e não tributária, sendo inaplicável o prazo do CTN ao caso concreto.", "A natureza da cobrança é administrativa [...] sendo inaplicável o prazo do CTN");
  sem("Não houve recurso da parte ré. No mérito, a cobrança da tarifa é devida pelo consumidor nos termos do contrato.", "Não houve recurso da parte ré [...] a cobrança da tarifa é devida pelo consumidor");
  sem("Ficou provada a fraude. Não é demais ressaltar que o dano moral indenizável decorre do próprio fato.", "Ficou provada a fraude [...] o dano moral indenizável decorre do próprio fato");
  sem("Trata-se de ação declaratória de inexistência de débito cumulada com indenizatória ajuizada pela autora.", "Trata-se de ação declaratória [...] de débito cumulada com indenizatória");
  // controle: sem corte, conferência normal e sem alerta novo
  assert.equal(negacaoNoCorte(" e ", "nao tributaria"), null);
});

// ---------- (4) câmara do acórdão revisado ----------
test("leva A (4): relatório/voto de revisão criminal e embargos infringentes não dão a câmara do acórdão revisado", () => {
  assert.equal(extrairOrgaoComOrigem("RELATÓRIO Trata-se de revisão criminal ajuizada por FULANO contra o acórdão da 1ª Câmara Criminal deste Tribunal que o condenou."), null);
  assert.equal(extrairOrgaoComOrigem("VOTO O acórdão revisado, proferido pela 2ª Câmara Criminal, condenou o réu."), null);
  assert.equal(extrairOrgaoComOrigem("RELATÓRIO Embargos infringentes e de nulidade opostos contra acórdão da 1ª Câmara Criminal, por maioria."), null);
  assert.equal(extrairOrgaoComOrigem("RELATÓRIO Ação rescisória do acórdão da 2ª Câmara Cível."), null);
  // câmara precedida de "contra o acórdão"/"proferido pela" é de outro julgamento em qualquer classe (conservador: sem rótulo)
  assert.equal(extrairOrgaoComOrigem("RELATÓRIO Embargos de declaração opostos contra acórdão desta 1ª Câmara Cível que negou provimento."), null);
  // cabeçalho comum continua valendo
  assert.deepEqual(extrairOrgaoComOrigem("Tribunal de Justiça de Rondônia 1ª Câmara Cível Relator: Des. Y Apelante: X"), { orgao: "1ª Câmara Cível", origem: "cabeçalho" });
  // fecho do próprio acórdão continua mandando
  assert.deepEqual(extrairOrgaoComOrigem("RELATÓRIO revisão criminal contra o acórdão da 1ª Câmara Criminal. " + "x ".repeat(400) +
    "acordam os Magistrados das Câmaras Criminais Reunidas do Tribunal de Justiça do Estado de Rondônia, em, IMPROCEDENTE."), { orgao: "Câmaras Criminais Reunidas", origem: "fecho" });
});

test("leva A (4): inteiro teor de RELATÓRIO de revisão criminal não manda citar a câmara do acórdão revisado", () => {
  const nr = "08048045720218220000";
  const data = { hits: { total: { value: 1 }, hits: [{ _source: {
    tipo: "RELATÓRIO", nr_processo: nr, id_processo_documento: 9, dtjulgamento: "2022-12-16", nome_relator_acordao: "VALDECI CASTELLAR CITON",
    ds_orgao_julgador_colegiado: "Câmaras Criminais Reunidas", ds_classe_judicial: "REVISÃO CRIMINAL",
    ds_modelo_documento: "RELATÓRIO Trata-se de revisão criminal ajuizada por FULANO contra o acórdão da 1ª Câmara Criminal deste Tribunal que o condenou.",
  } }] } };
  const out = formatInteiro(data, nr);
  assert.doesNotMatch(out, /1ª Câmara Criminal — prevalece o texto/);
  assert.doesNotMatch(out, /cabeçalho desta peça: 1ª Câmara Criminal/);
  assert.match(out, /Citação: .*Câmaras Criminais Reunidas/);
});
