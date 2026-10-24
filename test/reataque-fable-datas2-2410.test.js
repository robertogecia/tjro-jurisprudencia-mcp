// Reataque Fable 2 (24/10/2026) sobre a rodada das datas — regressão sintética, sem rede, recibos só em os.tmpdir().
// (1) Fecho de acórdão TRANSCRITO no voto/sentença (seguido de texto corrido, data longe do índice/cabeçalho/assinatura) não é o fecho
//     deste julgamento: a data dele nunca sai ✅ (🔴 com âncora que o desmente; 🟠 sem âncora). "acordam os (as) magistrados (as)"
//     é fecho próprio. Fecho no fim do texto, repetido ("ACÓRDÃO Vistos" de novo) ou antes do documento concatenado continua valendo.
// (2) Data dentro da PROCLAMAÇÃO do fecho ("PARCELAS ANTERIORES A 26/02/2019") não confirma; assinatura e sessão do fecho sim.
// (3) Rótulo "Data julgamento:" do cabeçalho do PJe até 45 dias DEPOIS do fecho e 0 a 30 dias ANTES do índice (sessão virtual × voto
//     depositado) vale ✅; sem essa âncora independente continua 🟠; distribuição e precedente transcrito continuam 🔴.
// (4) Sessão narrada em outras formas ("Em sessão de julgamento, em 25.03.2021", "na data de", "sessão do Pleno … do dia") sai 🟠
//     "sessão ANTERIOR", não 🔴; rótulo de precedente transcrito depois de ponto ("TJ-MG.", "Relator Des.") não sai ✅.
// Opcional: com TJRO_COPIA_RECIBOS_B apontando para uma CÓPIA dos recibos em os.tmpdir(), confere os ids reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { auditarCitacoes, regiaoDoJulgamento, relatorVencidoNoFecho } from "../server/auditoria.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

let seq = 960000;
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-reataque-datas2-"));
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num)) || "";
const NUM = "7000001-34.2024.8.22.0001", NR = "70000013420248220001";
const cita = (p, dt) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, j. ${dt}.`, p), NUM);

const TRANSCRITO = "ACÓRDAO Vistos, relatados e discutidos estes autos, acordam os Desembargadores da 2ª Câmara Especial do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas em, POR UNANIMIDADE, NEGAR PROVIMENTO AO RECURSO. Porto Velho, 29 de maio de 2012 DESEMBARGADOR(A) Fulano de Tal (PRESIDENTE) ";
const PROSA = "Sendo assim, considerando que o requerente pode realizar atividades laborais para sustento próprio, o que afasta a concessão do benefício pretendido, tenho que os pedidos iniciais merecem a improcedência. ";
const FECHO = (data, prolam = "RECURSO NÃO PROVIDO NOS TERMOS DO VOTO DO RELATOR, À UNANIMIDADE.", quem = "acordam os Magistrados da") => `ACÓRDÃO Vistos, relatados e discutidos estes autos, ${quem} 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${prolam} Porto Velho, ${data} Desembargador FULANO DE TAL RELATOR`;

// ---------- (1) ----------
test("reataque Fable 2 (1): fecho de acórdão TRANSCRITO na sentença/voto não confirma a data", () => {
  // sentença de 2026 que transcreve acórdão de 2012 com fecho próprio, seguido do texto da sentença (143609392)
  const sent = "SENTENÇA Vistos. I – RELATÓRIO Ação previdenciária. II – FUNDAMENTAÇÃO Nesse sentido: " + TRANSCRITO + PROSA + "III – DISPOSITIVO Julgo improcedentes os pedidos. P.R.I. Porto Velho, 05 de outubro de 2026 Fulano Juiz(a) de Direito";
  assert.doesNotMatch(regiaoDoJulgamento(sent, "05/10/2026"), /2012/);
  const p = pastaCom({ nr_processo: NR, tipo: "SENTENÇA", dtjulgamento_str: "05/10/2026", ds_modelo_documento: sent });
  assert.match(cita(p, "29/05/2012"), /^🔴 .*fecho de um acórdão TRANSCRITO/);
  assert.match(cita(p, "05/10/2026"), /^✅/);
  // acórdão cujo fecho próprio se escreve "acordam os (as) magistrados (as)" e cujo voto transcreve acórdão de 2007 (35982682)
  const ac = "RELATÓRIO x. VOTO Transcrevo: " + TRANSCRITO.replace("29 de maio de 2012", "29 de agosto de 2007") + "(…) Nesse cenário, a requerente tem direito de receber os valores referentes à prestação de serviço consistente em locação de máquinas. Dou provimento. " + FECHO("12 de setembro de 2025", "DEU-SE PROVIMENTO AO RECURSO, VENCIDO O RELATOR.", "acordam os (as) magistrados (as) da");
  const pa = pastaCom({ nr_processo: NR, dtjulgamento_str: "29/07/2026", ds_modelo_documento: ac });
  assert.doesNotMatch(cita(pa, "29/08/2007"), /^✅/);
  assert.match(cita(pa, "12/09/2025"), /^✅ .*data/);
  assert.equal(relatorVencidoNoFecho(ac, "29/07/2026").vencido, true);   // o fecho lido é o próprio (com "VENCIDO O RELATOR")
  // fecho seguido de texto e SEM nenhuma âncora (sem índice, cabeçalho ou assinatura datados): 🟠, nunca ✅
  const voto = "VOTO Nesse sentido: " + TRANSCRITO + PROSA + "É como voto.";
  const pv = pastaCom({ nr_processo: NR, tipo: "VOTO", ds_modelo_documento: voto });
  assert.match(cita(pv, "29/05/2012"), /^🟠 .*fecho seguido de texto corrido/);
});

test("reataque Fable 2 (1): o fecho próprio continua valendo — no fim, repetido e antes do documento concatenado", () => {
  const fim = "RELATÓRIO x. VOTO y. " + FECHO("22 de setembro de 2025");
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "20/11/2025", ds_modelo_documento: fim }), "22/09/2025"), /^✅ .*data/);   // 59 dias do índice: no fim do texto, vale
  const rep = "RELATÓRIO x. VOTO y. " + FECHO("30 de janeiro de 2026") + " " + FECHO("30 de janeiro de 2026");
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "05/02/2026", ds_modelo_documento: rep }), "30/01/2026"), /^✅ .*data/);
  const antigo = "EMENTA x. " + FECHO("26 de outubro de 2016") + " Poder Judiciário do Estado de Rondônia 2ª Câmara Cível Data de distribuição: 31/10/2014 RELATÓRIO Trata-se de apelação interposta contra a sentença que julgou procedente o pedido de cobrança dos aluguéis e encargos. VOTO Nego provimento ao recurso da requerida e mantenho a sentença inalterada em todos os seus termos. É como voto.";
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "27/10/2016", ds_modelo_documento: antigo }), "26/10/2016"), /^✅ .*data/);
  // antigo seguido de texto mas confirmado pelo índice (±45 dias): vale
  const antigo2 = "EMENTA x. " + FECHO("26 de outubro de 2016") + " " + PROSA + "É como voto.";
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "27/10/2016", ds_modelo_documento: antigo2 }), "26/10/2016"), /^✅ .*data/);
});

// ---------- (2) ----------
test("reataque Fable 2 (2): data da PROCLAMAÇÃO do fecho não confirma; assinatura e sessão do fecho sim", () => {
  const txt = "RELATÓRIO x. VOTO y. " + FECHO("26 de fevereiro de 2025", "PRESCRIÇÃO DA PRETENSÃO DE RESTITUIÇÃO DE PARCELAS ANTERIORES A 26/02/2019, RECONHECIDA, DE OFÍCIO. RECURSO PROVIDO, À UNANIMIDADE.");
  assert.doesNotMatch(regiaoDoJulgamento(txt), /2019/);
  const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "11/03/2025", ds_modelo_documento: txt });
  assert.doesNotMatch(cita(p, "26/02/2019"), /^✅/);
  assert.match(cita(p, "26/02/2025"), /^✅ .*data/);
  const sess = "RELATÓRIO x. VOTO y. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, a seguinte decisão: “NA SESSÃO N. 717, JULGADA ENTRE OS DIAS 21/07/2025 E 25/07/2025, O RELATOR APRESENTOU VOTO. RECURSO NÃO PROVIDO.” Porto Velho, 28 de julho de 2025 Desembargador FULANO DE TAL RELATOR";
  const ps = pastaCom({ nr_processo: NR, dtjulgamento_str: "30/07/2025", ds_modelo_documento: sess });
  assert.match(cita(ps, "21/07/2025"), /^✅ .*data/);
  assert.match(cita(ps, "25/07/2025"), /^✅ .*data/);
});

// ---------- (3) ----------
const CAB = (rot) => `2ª Câmara Cível / Gabinete Des. Kiyochi Mori Processo: 7000001-34.2024.8.22.0001 - APELAÇÃO CÍVEL (198) Relator: Des. PAULO KIYOCHI MORI Data distribuição: 12/09/2023 11:39:03 Data julgamento: ${rot} Polo Ativo: A Polo Passivo: B `;
test("reataque Fable 2 (3): rótulo da sessão virtual depois do voto depositado vale ✅ quando o índice confirma", () => {
  const txt = CAB("06/12/2023") + "RELATÓRIO x. VOTO y. " + FECHO("22 de Novembro de 2023");
  const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "12/12/2023", ds_modelo_documento: txt });
  assert.match(cita(p, "06/12/2023"), /^✅ .*data/);
  assert.match(cita(p, "22/11/2023"), /^✅ .*data/);
  // sem âncora independente (índice antes do rótulo, ou longe dele): 🟠
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "23/11/2023", ds_modelo_documento: txt }), "06/12/2023"), /^🟠 .*rótulo diverge do fecho/);
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "20/02/2024", ds_modelo_documento: txt }), "06/12/2023"), /^🟠 .*rótulo diverge do fecho/);
  // rótulo a mais de 45 dias depois do fecho: 🟠
  const longe = CAB("20/01/2024") + "RELATÓRIO x. VOTO y. " + FECHO("22 de Novembro de 2023");
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "25/01/2024", ds_modelo_documento: longe }), "20/01/2024"), /^🟠/);
  // distribuição colada a outro rótulo e precedente transcrito continuam fora (🔴)
  const dist = "2ª Câmara Cível / Gabinete X Data do julgamento: 06/12/2023 Data de distribuição: 01/02/2018 RELATÓRIO x. VOTO y. " + FECHO("22 de Novembro de 2023");
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "12/12/2023", ds_modelo_documento: dist }), "01/02/2018"), /^🔴/);
  const prec = "Turma Recursal / Gabinete 01 Processo: 7000001-34.2024.8.22.0001 EMENTA Precedente: (TJ-RS - AC: 5003998, Relator: Marcelo Cezar Muller, Data de Julgamento: 06/12/2023, Sexta Câmara Cível). VOTO y. " + FECHO("22 de Novembro de 2023");
  assert.match(cita(pastaCom({ nr_processo: NR, dtjulgamento_str: "12/12/2023", ds_modelo_documento: prec }), "06/12/2023"), /^🔴/);
});

// ---------- (4) ----------
test("reataque Fable 2 (4): sessão narrada em outras formas sai 🟠 'sessão ANTERIOR', não 🔴", () => {
  const formas = [
    ["O agravado não apresentou resposta. Em sessão de julgamento, em 25.03.2021, o recurso foi provido e reformada a interlocutória.", "25/03/2021"],
    ["Saliento que estes autos foram julgados em sessão de julgamento na data de 02/07/2018, contudo, em face do afastamento do relator.", "02/07/2018"],
    ["Por exemplo, o precedente do AI n. 0003356-29.2014.822.0000, julgado na sessão do Pleno Judiciário do dia 05.05.2014, que não reconheceu a prevenção.", "05/05/2014"],
    ["O habeas corpus já foi julgado na sessão de julgamento eletrônica ocorrida em 11/08/2026 a 14/08/2026, com denegação da ordem.", "11/08/2026"],
  ];
  for (const [narr, dt] of formas) {
    const txt = "RELATÓRIO Agravo. " + narr + " É o relatório. VOTO Nego provimento. " + FECHO("21 de julho de 2022");
    const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "28/07/2022", ds_modelo_documento: txt });
    assert.match(cita(p, dt), /^🟠 .*sessão ANTERIOR/, narr.slice(0, 40));
    assert.match(cita(p, "21/07/2022"), /^✅ .*data/);
  }
});

test("reataque Fable 2 (4): rótulo de precedente transcrito depois de ponto ('TJ-MG.', 'Relator Des.') não sai ✅ em documento sem fecho", () => {
  for (const corpo of [
    "Precedente do TJ-MG. Apelação 1.0000.19.012345-6. Relator Des. Fulano de Tal. Data de Julgamento: 12/03/2024. ",
    "Precedente do TJRO. Apelação 7000002-00.2020.8.22.0001. Relator Des. Fulano de Tal. Data de Julgamento: 12/03/2024. ",
  ]) {
    const txt = "Nego provimento. " + corpo + "É como voto.";
    assert.doesNotMatch(regiaoDoJulgamento(txt), /12\/03\/2024/, corpo.slice(0, 30));
    const p = pastaCom({ nr_processo: NR, tipo: "VOTO", dtjulgamento_str: "20/03/2024", ds_modelo_documento: txt });
    assert.doesNotMatch(cita(p, "12/03/2024"), /^✅/, corpo.slice(0, 30));
  }
});

// ---------- ids reais (opcional, só com cópia dos recibos em os.tmpdir()) ----------
const COPIA = process.env.TJRO_COPIA_RECIBOS_B;
const copiaOk = COPIA && fs.existsSync(COPIA) && fs.realpathSync(COPIA).startsWith(fs.realpathSync(os.tmpdir()));
test("reataque Fable 2: ids reais na CÓPIA dos recibos", { skip: !copiaOk && "defina TJRO_COPIA_RECIBOS_B com uma cópia dos recibos em os.tmpdir()" }, () => {
  _limparMemoParaTeste();
  const doId = (id) => JSON.parse(fs.readFileSync(path.join(COPIA, `${id}.json`), "utf8")).nr_processo;
  const mask = (n) => `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n[13]}.${n.slice(14, 16)}.${n.slice(16)}`;
  const l = (id, dt) => { const n = mask(doId(id)); return linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${n}, j. ${dt}.`, COPIA), n); };
  // (1) fecho transcrito
  for (const [id, dt] of [[143609392, "29/05/2012"], [143873392, "29/05/2012"], [143887174, "20/08/2025"], [35982682, "29/08/2007"]]) assert.doesNotMatch(l(id, dt), /^✅/, `${id} ${dt}`);
  assert.match(l(35982682, "12/09/2025"), /^✅/);
  // (2) proclamação × sessão do fecho
  for (const [id, dt] of [[25907338, "26/02/2019"], [35946026, "24/03/2020"], [36323171, "11/02/2020"]]) assert.doesNotMatch(l(id, dt), /^✅/, `${id} ${dt}`);
  assert.match(l(29892933, "21/07/2025"), /^✅/);
  assert.match(l(29892933, "25/07/2025"), /^✅/);
  // (3) rótulo da sessão virtual confirmado pelo índice
  for (const [id, dt] of [[22165638, "06/12/2023"], [12169921, "03/05/2021"], [12123126, "26/04/2021"], [36623156, "10/09/2026"], [36633213, "10/09/2026"]]) assert.match(l(id, dt), /^✅/, `${id} ${dt}`);
  // (4) sessão narrada
  for (const [id, dt] of [[16672067, "25/03/2021"], [10166076, "05/05/2014"], [36620143, "11/08/2026"]]) assert.match(l(id, dt), /^🟠 .*sessão ANTERIOR/, `${id} ${dt}`);
});
