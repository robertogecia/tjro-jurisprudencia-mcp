// v1.39.0 — auditar_citacoes_tjro e citações a STJ/STF pela classe-base. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditarCitacoes, dvCnjValido } from "../server/auditoria.js";
import { citacoesDoTexto } from "../server/precedentes.js";
import { _limparMemoParaTeste } from "../server/recibos.js";
import { recibo } from "../server/lib.js";

const A = "70000013420248220001"; // 7000001-34.2024.8.22.0001 (dígito válido)
const B = "70000025020238220002"; // 7000002-50.2023.8.22.0002
const NAO_LIDO = "0800003-59.2025.8.22.0000";
const fecho = (c) => ` VOTO Nego provimento. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da ${c} do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE.`;

function pasta() {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-auditoria-"));
  const g = (s) => { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); };
  g({ id_processo_documento: 11, nr_processo: A, tipo: "ACÓRDÃO", dtjulgamento_str: "21/11/2023", ds_orgao_julgador_colegiado: "3ª Câmara Cível",
    ds_modelo_documento: "Relator: Des. SANSÃO SALDANHA Processo: Apelação. RELATÓRIO Trata-se de apelação. Sessão de 14/11/2023." + fecho("1ª Câmara Cível") });
  g({ id_processo_documento: 12, nr_processo: B, tipo: "ACÓRDÃO", dtjulgamento_str: "05/03/2024",
    ds_modelo_documento: "Relator: Juiz ILISIR BUENO RODRIGUES RELATÓRIO Recurso inominado." + fecho("2ª Turma Recursal") });
  return p;
}
const linha = (out, nr) => out.split("\n").find((l) => l.includes(nr)) || "";

test("dvCnjValido: Resolução CNJ 65/2008", () => {
  assert.ok(dvCnjValido(A) && dvCnjValido(B));
  assert.ok(!dvCnjValido(A.slice(0, 8) + "9" + A.slice(9)));
});

test("câmara da peça × FECHO: 3ª Câmara Cível de acórdão julgado pela 1ª sai 🔴; a certa sai ✅", () => {
  const p = pasta();
  const ruim = auditarCitacoes(`Nesse sentido (TJRO, Apelação 7000001-34.2024.8.22.0001, 3ª Câmara Cível, Rel. Des. Sansão Saldanha, j. 21/11/2023).`, p);
  assert.match(linha(ruim, "7000001-34"), /^🔴 .*a peça diz 3ª Câmara Cível, o FECHO diz 1ª Câmara Cível/);
  const boa = auditarCitacoes(`Nesse sentido (TJRO, Apelação 7000001-34.2024.8.22.0001, Primeira Câmara Cível, Rel. Des. Sansão Saldanha, j. 21/11/2023).`, p);
  assert.match(linha(boa, "7000001-34"), /^✅ .*Bate com a peça: câmara, relator, data/);
  const abrev = auditarCitacoes(`(TJRO, AC 70000013420248220001, 1ª CC, relatoria de Sansão Saldanha)`, p);
  assert.match(linha(abrev, "7000001-34"), /^✅/);
});

test("dígito errado 🔴 sem consultar nada; número válido não lido 🟡; outro tribunal ⚪", () => {
  const p = pasta();
  const out = auditarCitacoes(`Ver 7000001-35.2024.8.22.0001, ${NAO_LIDO} e 1000000-00.2020.8.26.0100.`, p);
  assert.match(linha(out, "7000001-35"), /^🔴 .*dígito verificador NÃO confere/);
  assert.match(linha(out, "0800003-59"), /^🟡 .*NÃO lido nesta máquina/);
  assert.match(linha(out, "1000000-00"), /^🔴 .*dígito/);
});

test("data e relator do REsp citado na mesma frase NÃO contaminam o acórdão do TJRO", () => {
  const p = pasta();
  const out = auditarCitacoes(`Aplicado pelo STJ (REsp 1.846.649/MA, Rel. Min. Fulano de Tal, j. 03/05/2019) e pelo TJRO na Apelação 7000001-34.2024.8.22.0001, relatoria do Desembargador Sansão Saldanha, 1ª Câmara Cível.`, p);
  assert.match(linha(out, "7000001-34"), /^✅/);
  assert.match(out, /STJ\/STF citados.*REsp 1846649\/MA/);
});

test("data: sessão escrita no acórdão vale; até 45 dias é 🟠 'confira'; 'LIDO em' não é data de julgamento", () => {
  const p = pasta();
  assert.match(linha(auditarCitacoes(`Apelação 7000001-34.2024.8.22.0001, j. 14/11/2023.`, p), "7000001-34"), /^✅/);
  assert.match(linha(auditarCitacoes(`Apelação 7000001-34.2024.8.22.0001, julgado em 10 de dezembro de 2023.`, p), "7000001-34"), /^🟠 .*até 45 dias/);
  assert.match(linha(auditarCitacoes(`Apelação 7000001-34.2024.8.22.0001, j. 10/06/2025.`, p), "7000001-34"), /^🔴 .*a peça diz julgado em 10\/06\/2025/);
  assert.match(linha(auditarCitacoes(`Apelação 7000001-34.2024.8.22.0001 (1ª Câmara Cível): LIDO em 11/10/2026.`, p), "7000001-34"), /^✅/);
});

test("relator divergente é 🟠 (pode mudar entre julgamentos); Turma Recursal compara pelo fecho", () => {
  const p = pasta();
  assert.match(linha(auditarCitacoes(`RI 7000002-50.2023.8.22.0002, Rel. Juiz Fulano Beltrano, 2ª Turma Recursal.`, p), "7000002-50"), /^🟠 .*a peça dá como relator Fulano Beltrano/);
  assert.match(linha(auditarCitacoes(`RI 7000002-50.2023.8.22.0002 (1ª Turma Recursal).`, p), "7000002-50"), /^🔴 .*o FECHO diz 2ª Turma Recursal/);
});

test("lista vizinha não contamina: câmara do item seguinte da lista fica no item seguinte", () => {
  const p = pasta();
  const out = auditarCitacoes(`- TJRO, 1ª Câmara Cível, AC 7000001-34.2024.8.22.0001 (Sansão Saldanha,\n  2023): nova procuração.\n- TJRO, 2ª Câmara Especial, Ap. ${NAO_LIDO} (outro).`, p);
  assert.match(linha(out, "7000001-34"), /^✅/);
});

test("citacoesDoTexto: classe-base, AgInt/EDcl no mesmo REsp contam uma vez; classes novas; sem falso MS/AI/CC", () => {
  assert.deepEqual(citacoesDoTexto("AgInt no REsp 1.846.649/MA e REsp 1846649."), ["REsp 1846649/MA"]);
  assert.deepEqual(citacoesDoTexto("EDcl no AgRg nos EAREsp n. 1.231.405/SC; ADI 4.167/DF; AgRg no HC n. 641.694/SC; RMS 59.842/PR"), ["EAREsp 1231405/SC", "ADI 4167/DF", "HC 641694/SC", "RMS 59842/PR"]);
  assert.deepEqual(citacoesDoTexto("ARE nº 1.234.567-AgR/SP; RE 593.849-RG/SE; REsp1234567/RS; REsp 1.111.111-MA"), ["ARE 1234567/SP", "RE 593849/SE", "REsp 1234567/RS", "REsp 1111111/MA"]);
  assert.deepEqual(citacoesDoTexto("OAB nº MS5871A; TJ-MS - AC: 0800 MS 0800197-56.2018.8.12.0041; art. 186 do CC 2002"), []);
  assert.deepEqual(citacoesDoTexto("(STJ - AREsp: 1615833 MS 2019/0334073-4, Relator"), ["AREsp 1615833"]);
});

// Red team 22/10/2026: câmara/relator que a peça afirma e que o recibo NÃO permite comparar (só ementa gravada pela
// busca, fecho fora do padrão, sem "Relator:") não podem sair ✅ "Bate com a peça" — saem 🟠 "não conferidos".
test("câmara/relator sem fecho nem relator legível no recibo: 🟠 'não conferido', nunca ✅", () => {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-auditoria-semfecho-"));
  const C = "70000016820238220001"; // 7000001-68.2023.8.22.0001
  assert.ok(dvCnjValido(C));
  const g = (s, origem) => { const r = recibo(s, new Date(), origem); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); };
  // só EMENTA, origem busca, órgão do índice = 3ª CC, sem fecho e sem relator
  g({ id_processo_documento: 111, nr_processo: C, tipo: "EMENTA", dtjulgamento_str: "05/05/2024", ds_orgao_julgador_colegiado: "3ª Câmara Cível",
    ds_modelo_documento: "EMENTA APELAÇÃO CÍVEL. TARIFA. Recurso não provido." }, "busca");
  const out = auditarCitacoes(`(TJRO, Apelação 7000001-68.2023.8.22.0001, 2ª Câmara Cível, Rel. Des. Fulano de Tal Inventado, j. 05/05/2024).`, p);
  const l = linha(out, "7000001-68");
  assert.doesNotMatch(l, /^✅/);
  assert.doesNotMatch(l, /Bate com a peça: câmara/);
  assert.match(l, /^🟠 .*câmara da peça \(2ª Câmara Cível\) NÃO conferida/);
  assert.match(l, /relator da peça \(Fulano de Tal Inventado\) NÃO conferido/);
  assert.match(l, /cadastro: 3ª Câmara Cível/);
  assert.match(out, /✅ 0 conferido/);

  // fecho com redação fora do padrão ("acordam os Desembargadores da 1ª Câmara Cível, à unanimidade") e sem relator
  g({ id_processo_documento: 12, nr_processo: B, tipo: "ACÓRDÃO", dtjulgamento_str: "05/03/2024",
    ds_modelo_documento: "RELATÓRIO Apelação. VOTO Nego provimento. Acordam os Desembargadores da 1ª Câmara Cível, à unanimidade, negar provimento." });
  const out2 = auditarCitacoes(`Apelação 7000002-50.2023.8.22.0002, 3ª Câmara Cível, Rel. Des. Fulano Beltrano de Tal, j. 05/03/2024.`, p);
  assert.match(linha(out2, "7000002-50"), /^🟠 .*NÃO conferida/);

  // a peça só dá a data, e a data bate: continua ✅ (só data)
  const out3 = auditarCitacoes(`Apelação 7000001-68.2023.8.22.0001, j. 05/05/2024.`, p);
  assert.match(linha(out3, "7000001-68"), /^✅ .*Bate com a peça: data\./);
});

// Rodada 2 (22/10/2026): relator que bate só com o ÍNDICE do portal (recibo sem "Relator:" no texto) não foi lido no
// acórdão — o ✅ diz isso, em vez de "Bate com a peça: relator" sem ressalva.
test("relator conferido só contra o índice do portal: ✅ com a ressalva 'não lido no acórdão'", () => {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-auditoria-relindice-"));
  const g = (s) => { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); };
  g({ id_processo_documento: 21, nr_processo: A, tipo: "ACÓRDÃO", dtjulgamento_str: "21/11/2023", nome_relator_acordao: "SANSÃO SALDANHA",
    ds_modelo_documento: "RELATÓRIO Trata-se de apelação." + fecho("1ª Câmara Cível") });
  const l = linha(auditarCitacoes(`Apelação 7000001-34.2024.8.22.0001, 1ª Câmara Cível, Rel. Des. Sansão Saldanha.`, p), "7000001-34");
  assert.match(l, /^✅ .*Bate com a peça: câmara, relator \(só contra o índice do portal, não lido no acórdão\)/);
  // controle: com "Relator:" no texto, o relator foi lido — sem ressalva
  const l2 = linha(auditarCitacoes(`Apelação 7000001-34.2024.8.22.0001, 1ª Câmara Cível, Rel. Des. Sansão Saldanha.`, pasta()), "7000001-34");
  assert.match(l2, /^✅ .*Bate com a peça: câmara, relator\./);
});
