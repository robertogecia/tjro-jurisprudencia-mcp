// Reataque da amostra B (24/10/2026) — regressão sintética, sem rede, recibos só em os.tmpdir().
// (1) "Data julgamento:" do cabeçalho do PJe: só a data COLADA ao rótulo vale; a de distribuição ao lado não confirma ✅.
// (2) Relator vencido que assina o fecho ("VENCIDOS O RELATOR … LAVRARÁ O ACÓRDÃO O DES. X"): a citação do vencido sai 🟠;
//     a de quem lavra sai ✅.
// (3) DOUTRINA: "Explica-se:", "A explicação é simples:", "Ensina a experiência comum, e assim decide esta Câmara:" são o relator.
// Opcional: com TJRO_COPIA_RECIBOS_B apontando para uma CÓPIA dos recibos em os.tmpdir(), confere os ids reais 23688921 e 21363380.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { auditarCitacoes, regiaoDoJulgamento, dataColadaAoRotulo, relatorVencidoNoFecho, mesmaPessoa } from "../server/auditoria.js";
import { conferirTrecho } from "../server/verificar.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

let seq = 940000;
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-reataque-b-"));
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num)) || "";
const NUM = "7000001-34.2024.8.22.0001", NR = "70000013420248220001";

// ---------- (1) ----------
const FECHO1 = "ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados das Câmaras Especiais Reunidas do Tribunal de Justiça do Estado de Rondônia, em, AÇÃO JULGADA IMPROCEDENTE, À UNANIMIDADE. Porto Velho, 8 de março de 2024 DESEMBARGADOR GLODNER LUIZ PAULETTO RELATOR";
const DIRETA = "Câmaras Especiais Reunidas / Gabinete Des. Glodner Pauletto Data do julgamento: 08/03/2024 Data de distribuição: 01/02/2018 Processo : 7000001-34.2024.8.22.0001 Ação Rescisória RELATÓRIO Ação rescisória. VOTO Improcedente. ";
const INVERTIDA = "Processo: 7000001-34.2024.8.22.0001 - APELAÇÃO CÍVEL (198) Relator: Des. GLODNER LUIZ PAULETTO Data distribuição: 11/05/2019 16:51:50 Data julgamento: 08/03/2024 Polo Ativo: A Polo Passivo: B RELATÓRIO Apelação. VOTO Improcedente. ";
const SEM_DIST_DE = "Gabinete Des. Glodner Pauletto Data julgamento: 08/03/2024 Data distribuição: 01/02/2018 Processo: 7000001-34.2024.8.22.0001 RELATÓRIO x. VOTO y. ";
test("reataque B (1): só a data colada ao rótulo 'Data (do) julgamento:' entra; a de distribuição, antes ou depois, não", () => {
  for (const cab of [DIRETA, INVERTIDA, SEM_DIST_DE]) {
    const reg = regiaoDoJulgamento(cab + FECHO1);
    assert.match(reg, /08\/03\/2024/);
    assert.doesNotMatch(reg, /01\/02\/2018|11\/05\/2019/, cab.slice(0, 40));
    const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "29/04/2024", ds_modelo_documento: cab + FECHO1 });
    const cita = (dt) => linhaDe(auditarCitacoes(`TJRO, Ação Rescisória n. ${NUM}, j. ${dt}.`, p), NUM);
    assert.doesNotMatch(cita("01/02/2018"), /^✅/);
    assert.doesNotMatch(cita("11/05/2019"), /^✅/);
    assert.match(cita("08/03/2024"), /^✅ .*data/);   // a data correta não perde o ✅
  }
  // o nome da sessão entre o rótulo e a data, e o intervalo da sessão virtual, continuam valendo
  assert.equal(dataColadaAoRotulo(": Sessão Eletrônica n. 935 de 09/12/2024 a 13/12/2024 Data da distribuição : 6/9/2024"), "Sessão Eletrônica n. 935 de 09/12/2024 a 13/12/2024");
  assert.equal(dataColadaAoRotulo(" 18/10/2023 Polo Ativo: X"), "18/10/2023");
  assert.equal(dataColadaAoRotulo(": 1º/07/2025 Data da distribuição: 25/02/2025"), "1º/07/2025");
  assert.equal(dataColadaAoRotulo(" na data de 02/07/2018, contudo"), "");   // narrativa, não rótulo
  assert.match(regiaoDoJulgamento("Sessão Virtual de 30/09/2026 a 04/10/2026 EMENTA x."), /30\/09\/2026 a 04\/10\/2026/);
});

// ---------- (2) ----------
const CAB2 = (rel) => `Processo: ${NUM} - APELAÇÃO CÍVEL (198) Relator: Des. ${rel} Data distribuição: 31/08/2023 09:36:49 Data julgamento: 22/11/2023 Polo Ativo: A Polo Passivo: B RELATÓRIO Apelação. VOTO Nego provimento. `;
const FECHO2 = (proclamacao, assinatura) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${proclamacao} Porto Velho, 22 de Novembro de 2023 ${assinatura}`;
test("reataque B (2): relator vencido que assina o fecho não confirma ✅; quem lavra o acórdão confirma", () => {
  const txt = CAB2("ISAIAS FONSECA MORAES") + FECHO2("RECURSO NÃO PROVIDO NOS TERMOS DO VOTO DIVERGENTE DO DES. KIYOCHI MORI, POR MAIORIA, VENCIDOS O RELATOR E O DES. TORRES FERREIRA. LAVRARÁ O ACÓRDÃO O DES. KIYOCHI MORI.", "Relator Des. ISAIAS FONSECA MORAES RELATOR");
  assert.deepEqual(relatorVencidoNoFecho(txt), { vencido: true, redator: "KIYOCHI MORI" });
  const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/12/2023", ds_modelo_documento: txt, nome_relator_acordao: "PAULO KIYOCHI MORI" });
  const cita = (rel) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. ${rel}, j. 22/11/2023.`, p), NUM);
  const venc = cita("Isaias Fonseca Moraes");
  assert.match(venc, /^🟠/);
  assert.match(venc, /ORIGINÁRIO, vencido; o acórdão é de KIYOCHI MORI/);
  assert.match(cita("Kiyochi Mori"), /^✅ .*relator/);
  assert.match(cita("Paulo Kiyochi Mori"), /^✅ .*relator/);
  assert.doesNotMatch(cita("Torres Ferreira"), /^✅/);   // vogal vencido

  // "VENCIDO O RELATOR" sem dizer quem lavra e sem relator no índice: nenhum relator lido confirma ✅
  const semRedator = CAB2("ROOSEVELT QUEIROZ COSTA") + FECHO2("EMBARGOS PROVIDOS, POR MAIORIA. VENCIDO O RELATOR E O DES. GLODNER LUIZ PAULETTO.", "Desembargador ROOSEVELT QUEIROZ COSTA RELATOR");
  assert.deepEqual(relatorVencidoNoFecho(semRedator), { vencido: true, redator: null });
  const p2 = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/12/2023", ds_modelo_documento: semRedator });
  const c2 = linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Roosevelt Queiroz Costa, j. 22/11/2023.`, p2), NUM);
  assert.match(c2, /^🟠 .*RELATOR FICOU VENCIDO/);
  // … com o índice do portal (que guarda o relator para o acórdão) igual ao cabeçalho: ✅ (amostra A, id 17284486)
  const p2b = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/12/2023", ds_modelo_documento: semRedator, nome_relator_acordao: "ROOSEVELT QUEIROZ COSTA" });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Roosevelt Queiroz Costa, j. 22/11/2023.`, p2b), NUM), /^✅ .*relator/);
  // … com o índice DIFERENTE do cabeçalho: o do cabeçalho é o originário (🟠); o do índice confere
  const p2c = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/12/2023", ds_modelo_documento: semRedator, nome_relator_acordao: "MIGUEL MONICO NETO" });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Roosevelt Queiroz Costa, j. 22/11/2023.`, p2c), NUM), /^🟠 .*ORIGINÁRIO, vencido; o acórdão é de MIGUEL MONICO NETO/);
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Miguel Monico Neto, j. 22/11/2023.`, p2c), NUM), /^✅ .*relator \(só contra o índice/);

  // relator para o acórdão no cabeçalho E na assinatura (vencido o relator originário, que não aparece): continua ✅
  const redatorNoCab = CAB2("GILBERTO BARBOSA") + FECHO2("RECURSOS PROVIDOS, POR MAIORIA. VENCIDO O RELATOR. JULGADO CONFORME A TÉCNICA DO ART. 942 DO CPC.", "Relator Des. GILBERTO BARBOSA RELATOR PARA O ACÓRDÃO");
  assert.deepEqual(relatorVencidoNoFecho(redatorNoCab), { vencido: true, redator: "GILBERTO BARBOSA" });
  const p3 = pastaCom({ nr_processo: NR, dtjulgamento_str: "24/11/2023", ds_modelo_documento: redatorNoCab });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Gilberto Barbosa, j. 22/11/2023.`, p3), NUM), /^✅/);
  assert.doesNotMatch(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Daniel Ribeiro Lagos, j. 22/11/2023.`, p3), NUM), /^✅/);

  // unânime, sem vencido nem relator para o acórdão: nada muda
  const unanime = CAB2("ISAIAS FONSECA MORAES") + FECHO2("RECURSO NÃO PROVIDO, À UNANIMIDADE.", "Relator Des. ISAIAS FONSECA MORAES RELATOR");
  assert.deepEqual(relatorVencidoNoFecho(unanime), { vencido: false, redator: null });
  const p4 = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/12/2023", ds_modelo_documento: unanime });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023.`, p4), NUM), /^✅/);

  // erro de grafia do fecho não faz do relator do cabeçalho um "originário"
  assert.ok(mesmaPessoa("ROWILSON TEIXEIRA", "ROWLSON TEIXEIRA"));
  assert.ok(mesmaPessoa("ROWILSON TEIXEIRA", "ROWILSON TEIXIERA"));
  assert.ok(!mesmaPessoa("ISAIAS FONSECA MORAES", "KIYOCHI MORI"));
  const grafia = CAB2("ROWILSON TEIXEIRA") + FECHO2("RECURSO PROVIDO, POR MAIORIA, VENCIDO O DES. FULANO DE TAL.", "Desembargador ROWLSON TEIXEIRA RELATOR PARA O ACÓRDÃO");
  const p5 = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/12/2023", ds_modelo_documento: grafia });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Rowilson Teixeira, j. 22/11/2023.`, p5), NUM), /^✅/);
  // o redator de OUTRO julgamento do mesmo processo não faz do relator deste um "originário"
  const p6 = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/12/2023", ds_modelo_documento: unanime }, { nr_processo: NR, dtjulgamento_str: "10/06/2024", ds_modelo_documento: txt.replace(/22 de Novembro de 2023/, "5 de junho de 2024").replace("Data julgamento: 22/11/2023", "Data julgamento: 05/06/2024") });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, 2ª Câmara Cível, Rel. Isaias Fonseca Moraes.`, p6), NUM), /^✅/);
  // "LAVRARÁ O DES. X" (sem "o acórdão") e "X PROLATOR DO ACÓRDÃO"
  assert.equal(relatorVencidoNoFecho(FECHO2("VENCIDOS O RELATOR E O DES. ISAIAS FONSECA MORAES. LAVRARÁ O DES. ALEXANDRE MIGUEL.", "Desembargador MARCOS ALAOR DINIZ GRANGEIA RELATOR")).redator, "ALEXANDRE MIGUEL");
  assert.equal(relatorVencidoNoFecho(FECHO2("NOS TERMOS DO VOTO DO JUIZ DE DIREITO ILISIR BUENO RODRIGUES. VENCIDO O RELATOR.", "ILISIR BUENO RODRIGUES PROLATOR DO ACÓRDÃO")).redator, "ILISIR BUENO RODRIGUES");
});

// ---------- (3) ----------
const V = (meio) => `RELATÓRIO Apelação. É o relatório. VOTO Conheço do recurso. ${meio} Ante o exposto, nego provimento. É como voto. `;
const INTERESSE = "O interesse de agir se desdobra no binômio necessidade e adequação do provimento jurisdicional pleiteado pela parte autora.";
const nomes = (xs) => xs.map((x) => x.split(":")[0]);
test("reataque B (3): introdutor fraco sem sujeito autoral é a voz do relator (só nota de baixa confiança); com autor continua DOUTRINA", () => {
  const voz = [
    ["A tese não se sustenta. Explica-se: A norma do art. 85 do CPC fixa os honorários entre dez e vinte por cento sobre o valor da condenação, e o juízo observou essa faixa.", "A norma do art. 85 do CPC fixa os honorários entre dez e vinte por cento"],
    ["A explicação é simples: O contrato previu expressamente a capitalização mensal dos juros, com taxa anual superior ao duodécuplo da mensal, o que basta.", "O contrato previu expressamente a capitalização mensal dos juros"],
    ["Ensina a experiência comum, e assim decide esta Câmara: Quem contrata o serviço e dele se utiliza por longo período não pode alegar desconhecimento da cobrança mensal.", "Quem contrata o serviço e dele se utiliza por longo período não pode alegar desconhecimento"],
  ];
  for (const [meio, tr] of voz) {
    const r = conferirTrecho(V(meio), tr, "ACÓRDÃO");
    assert.ok(r.ok);
    assert.deepEqual(r.alertas, [], meio.slice(0, 40));
    assert.ok(r.notas.some((n) => n.startsWith("DOUTRINA? (baixa confiança)")), meio.slice(0, 40));
  }
  for (const intro of ["Sobre o tema, explica Humberto Theodoro Júnior:", "Nesse ponto, o professor ensina com precisão:", "Vale lembrar a explicação do Ministro Paulo Brossard quando aduz que:", "Como bem explica MARINONI:", "Ensinam Nelson Nery Junior e Rosa Nery:", "Sobre o ponto, ensina Araken de Assis:", "como ensina a jurisprudência deste Egrégio Tribunal de Justiça:", "Os arts. 28 e 29 da Lei n. 10.931/2004 ensinam:"]) {
    const r = conferirTrecho(V(`${intro} ${INTERESSE}`), "O interesse de agir se desdobra no binômio necessidade e adequação", "ACÓRDÃO");
    assert.deepEqual(nomes(r.alertas), ["DOUTRINA"], intro);
  }
});

// ---------- ids reais (opcional, só com cópia dos recibos em os.tmpdir()) ----------
const COPIA = process.env.TJRO_COPIA_RECIBOS_B;
const copiaOk = COPIA && fs.existsSync(COPIA) && fs.realpathSync(COPIA).startsWith(fs.realpathSync(os.tmpdir()));
test("reataque B: ids reais 23688921 (data de distribuição) e 21363380 (relator vencido) na CÓPIA dos recibos", { skip: !copiaOk && "defina TJRO_COPIA_RECIBOS_B com uma cópia dos recibos em os.tmpdir()" }, () => {
  _limparMemoParaTeste();
  const a09 = "0803080-57.2017.8.22.0000", a30 = "7001639-30.2023.8.22.0004";
  const l = (t, n) => linhaDe(auditarCitacoes(t, COPIA), n);
  assert.match(l(`TJRO, Ação Rescisória n. ${a09}, Rel. Glodner Luiz Pauletto, j. 01/02/2018.`, a09), /^🔴/);
  assert.match(l(`TJRO, Ação Rescisória n. ${a09}, Rel. Glodner Luiz Pauletto, j. 08/03/2024.`, a09), /^✅/);
  assert.match(l(`TJRO, Apelação Cível n. ${a30}, 2ª Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023.`, a30), /^🟠 .*ORIGINÁRIO, vencido/);
  assert.match(l(`TJRO, Apelação Cível n. ${a30}, 2ª Câmara Cível, Rel. Kiyochi Mori, j. 22/11/2023.`, a30), /^✅/);
});
