// Reataque Fable (24/10/2026) — dois falsos ✅ de data pelo rótulo do cabeçalho. Regressão sintética, sem rede, recibos só em os.tmpdir().
// (A) "sessão de julgamento de DD.MM.AAAA" NARRADA no relatório (embargos que contam o julgamento anterior) não é rótulo: a data
//     sai 🟠 "sessão ANTERIOR narrada", nunca ✅; a data do fecho continua ✅.
// (B) "Data de Julgamento:" de PRECEDENTE TRANSCRITO nos primeiros 2.500 caracteres (depois de vírgula, "Relator:", "Relator(a) do
//     Acórdão", sigla de outro tribunal, dentro de parênteses) não é data deste julgamento: nunca ✅. O rótulo do próprio cabeçalho
//     que diverge do fecho/assinatura (> 10 dias), ou dois rótulos distantes sem fecho, saem 🟠; o rótulo que bate continua ✅.
// Opcional: com TJRO_COPIA_RECIBOS_B apontando para uma CÓPIA dos recibos em os.tmpdir(), confere os ids reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { auditarCitacoes, regiaoDoJulgamento, rotulosForaDoJulgamento } from "../server/auditoria.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

let seq = 950000;
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-reataque-datas-"));
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num)) || "";
const NUM = "7000001-34.2024.8.22.0001", NR = "70000013420248220001";
const cita = (p, dt) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, j. ${dt}.`, p), NUM);

const CAB = "1ª Câmara Especial / Gabinete Des. Gilberto Barbosa Processo: 7000001-34.2024.8.22.0001 - APELAÇÃO CÍVEL (198) Relator: Des. GILBERTO BARBOSA Data distribuição: 24/11/2021 11:24:03 Data julgamento: 19/10/2023 Polo Ativo: A Polo Passivo: B ";
const FECHO = (data) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Especial do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, EMBARGOS PROVIDOS, À UNANIMIDADE Porto Velho, ${data} Relator Des. GILBERTO BARBOSA RELATOR`;

// ---------- (A) ----------
const NARRATIVAS = [
  "O Apelo, apreciado na sessão de julgamento de 10.02.2022, foi, à unanimidade, não provido, pois",
  "Apreciados na sessão de julgamento de 10.02.2022, foram, à unanimidade, não acolhidos,",
  "Os embargos de declaração, apreciados na sessão de julgamento de 10/02/2022, foram rejeitados.",
  "tendo em vista que na sessão do dia 10/02/2022, o Tribunal Pleno julgou o pedido",
  "alegando nulidade porque a pauta da sessão de 10/02/2022 não foi publicada",
  "O recurso foi julgado na sessão virtual de 10/02/2022, por unanimidade.",
  "conforme decidido em sessão ordinária de 10/02/2022, à unanimidade.",
];
test("reataque Fable (A): sessão NARRADA no relatório não é rótulo — 🟠 'sessão ANTERIOR', nunca ✅; o fecho continua ✅", () => {
  for (const narr of NARRATIVAS) {
    const txt = CAB + `RELATÓRIO Embargos de declaração opostos pelo autor. ${narr} Agora, alega omissão. É o relatório. VOTO Acolho. ` + FECHO("19 de Outubro de 2023");
    assert.doesNotMatch(regiaoDoJulgamento(txt), /10[./]02[./]2022/, narr.slice(0, 40));
    assert.ok(rotulosForaDoJulgamento(txt).narrados.length, narr.slice(0, 40));
    const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "20/10/2023", ds_modelo_documento: txt });
    const l = cita(p, "10/02/2022");
    assert.match(l, /^🟠 .*sessão ANTERIOR narrada no relatório/, narr.slice(0, 40));
    assert.match(cita(p, "19/10/2023"), /^✅ .*data/);
  }
  // sem fecho (voto avulso): a sessão narrada também não confirma
  const voto = "VOTO DESEMBARGADORA FULANA Conheço do agravo. Transcrevo a decisão: tendo em vista que na sessão do dia 05/12/2016, o Tribunal Pleno julgou o pedido. Nego provimento. É como voto.";
  const pv = pastaCom({ nr_processo: NR, tipo: "VOTO", dtjulgamento_str: "27/10/2017", ds_modelo_documento: voto });
  assert.doesNotMatch(cita(pv, "05/12/2016"), /^✅/);
  // rótulo legítimo de sessão continua valendo: início do texto, depois de "Data do julgamento:", depois do gabinete, "Data da sessão:"
  assert.match(regiaoDoJulgamento("Sessão Virtual de 30/09/2026 a 04/10/2026 EMENTA x."), /30\/09\/2026 a 04\/10\/2026/);
  assert.match(regiaoDoJulgamento("2ª Câmara Cível / Gabinete Des. X Data do julgamento: Sessão Eletrônica n. 927 de 30/10/2024 Data da distribuição: 6/9/2024 EMENTA x."), /30\/10\/2024/);
  assert.match(regiaoDoJulgamento("1ª Câmara Cível Sessão Virtual de 30/09/2026 a 04/10/2026 EMENTA x."), /30\/09\/2026/);
  assert.match(regiaoDoJulgamento("Data da sessão: 12/03/2025 EMENTA x."), /12\/03\/2025/);
});

// ---------- (B) ----------
const TRANSCRITOS = [
  ["EMENTA RECURSO INOMINADO. Precedente: (TJ-RS - AC: 50039989120188210132 SAPIRANGA, Relator: Marcelo Cezar Muller, Data de Julgamento: 26/07/2022, Sexta Câmara Cível). Recurso desprovido. ", "26/07/2022"],
  ["EMENTA RECURSO INOMINADO. Turma Recursal - Gabinete 03, Relator(a) do Acórdão: GUILHERME RIBEIRO BALDAN Data de julgamento: 28/08/2024 Recurso desprovido. ", "28/08/2024"],
  ["RELATÓRIO Cita o autor: TJRO, Apelação Cível, 1ª Câmara Cível, Relator(a) do Acórdão: Des. Isaias Fonseca Moraes, Data de julgamento: 30/06/2023. É o relatório. ", "30/06/2023"],
  ["EMENTA x. Recurso Inominado 0001629-11.2014.8.22.0008. Data do Julgamento: 30/10/2014 (g.n.). ", "30/10/2014"],
  ["Nesse sentido: AgInt no REsp 1215023 SC 2015/0246157-9, Relator.: Ministra MARIA ISABEL GALLOTTI, Data de Julgamento: 21/11/2019, QUARTA TURMA. ", "21/11/2019"],
  ["Precedente: Relator: Des. Raduan Miguel Filho. Data do julgamento: 05/12/2014. ", "05/12/2014"],
];
test("reataque Fable (B): 'Data de Julgamento:' de precedente transcrito nunca confirma ✅; a do fecho continua ✅", () => {
  for (const [corpo, dt] of TRANSCRITOS) {
    const txt = "Turma Recursal / Gabinete 01 Processo: 7000001-34.2024.8.22.0001 - RECURSO INOMINADO " + corpo + "VOTO Nego provimento. " + FECHO("22 de setembro de 2025");
    assert.doesNotMatch(regiaoDoJulgamento(txt), new RegExp(dt.replace(/\//g, "\\/")), corpo.slice(0, 50));
    const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "29/09/2025", ds_modelo_documento: txt });
    assert.doesNotMatch(cita(p, dt), /^✅/, corpo.slice(0, 50));
    assert.match(cita(p, "22/09/2025"), /^✅ .*data/);
    // sem fecho (voto avulso, sentença): o precedente transcrito também não confirma
    const sem = "VOTO " + corpo + "Nego provimento. É como voto.";
    const ps = pastaCom({ nr_processo: NR, tipo: "VOTO", dtjulgamento_str: "29/09/2025", ds_modelo_documento: sem });
    assert.doesNotMatch(cita(ps, dt), /^✅/, "sem fecho: " + corpo.slice(0, 50));
  }
});

test("reataque Fable (B): rótulo do próprio cabeçalho só confirma se bate com o fecho/assinatura; dois rótulos distantes sem fecho saem 🟠", () => {
  // bate (±10 dias): continua ✅ — o padrão dos rótulos legítimos medidos na cópia dos recibos
  const bate = CAB.replace("19/10/2023", "26/10/2023") + "RELATÓRIO x. VOTO y. " + FECHO("19 de Outubro de 2023");
  const p1 = pastaCom({ nr_processo: NR, dtjulgamento_str: "01/11/2023", ds_modelo_documento: bate });
  assert.match(cita(p1, "26/10/2023"), /^✅ .*data/);
  assert.match(cita(p1, "19/10/2023"), /^✅ .*data/);
  // diverge do fecho por mais de 10 dias SEM âncora independente (índice antes do rótulo): 🟠, e a do fecho ✅. (Reataque Fable 2,
  // 24/10/2026: com o índice 0 a 30 dias DEPOIS do rótulo e o fecho até 45 dias ANTES, o rótulo é a sessão virtual e vale ✅ —
  // ver test/reataque-fable-datas2-2410.test.js; o índice deste caso era 12/12/2023 e passou a 23/11/2023.)
  const diverge = CAB.replace("19/10/2023", "06/12/2023") + "RELATÓRIO x. VOTO y. " + FECHO("22 de Novembro de 2023");
  const p2 = pastaCom({ nr_processo: NR, dtjulgamento_str: "23/11/2023", ds_modelo_documento: diverge });
  assert.match(cita(p2, "06/12/2023"), /^🟠 .*rótulo diverge do fecho/);
  assert.match(cita(p2, "22/11/2023"), /^✅ .*data/);
  // sem fecho datado: dois rótulos de datas distantes no cabeçalho — nenhum confirma
  const dois = "Poder Judiciário 1ª Câmara Cível Data do julgamento: 18/08/2020 Sessão de 03/03/2020 Embargos. RELATÓRIO x. VOTO Rejeito. É o voto.";
  const p3 = pastaCom({ nr_processo: NR, tipo: "VOTO", dtjulgamento_str: "19/08/2020", ds_modelo_documento: dois });
  assert.doesNotMatch(cita(p3, "18/08/2020"), /^✅/);
  assert.doesNotMatch(cita(p3, "03/03/2020"), /^✅/);
  // documentos concatenados (id real 1107014): o rótulo do 1º cabeçalho vale; o do documento seguinte, distante, sai 🟠
  const conc = "Poder Judiciário do Estado de Rondônia 1ª Câmara Cível Data de interposição: 21/01/2020 Data do julgamento: 18/08/2020 Embargos de Declaração EMENTA x. Porto Velho, 18 de agosto de 2020 . DESEMBARGADOR FULANO RELATOR Poder Judiciário do Estado de Rondônia 1ª Câmara Cível Data de interposição: 2/01/2020 Data do julgamento: 21/07/2020 Embargos de Declaração EMENTA y. RELATÓRIO z. VOTO Rejeito. É o voto.";
  const p4 = pastaCom({ nr_processo: NR, dtjulgamento_str: "19/08/2020", ds_modelo_documento: conc });
  assert.match(cita(p4, "18/08/2020"), /^✅ .*data/);
  assert.match(cita(p4, "21/07/2020"), /^🟠/);
});

// ---------- ids reais (opcional, só com cópia dos recibos em os.tmpdir()) ----------
const COPIA = process.env.TJRO_COPIA_RECIBOS_B;
const copiaOk = COPIA && fs.existsSync(COPIA) && fs.realpathSync(COPIA).startsWith(fs.realpathSync(os.tmpdir()));
test("reataque Fable: ids reais (sessão narrada e precedente transcrito) na CÓPIA dos recibos", { skip: !copiaOk && "defina TJRO_COPIA_RECIBOS_B com uma cópia dos recibos em os.tmpdir()" }, () => {
  _limparMemoParaTeste();
  const l = (n, dt) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${n}, j. ${dt}.`, COPIA), n);
  // (A) 21344385 e 22363931: a sessão anterior narrada sai 🟠; a do fecho continua ✅
  assert.match(l("7008030-03.2020.8.22.0005", "10/02/2022"), /^🟠 .*sessão ANTERIOR/);
  assert.match(l("7008030-03.2020.8.22.0005", "19/10/2023"), /^✅/);
  assert.match(l("7007657-23.2016.8.22.0001", "02/05/2019"), /^🟠 .*sessão ANTERIOR/);
  assert.match(l("7007657-23.2016.8.22.0001", "30/11/2023"), /^✅/);
  // (B) 29501542, 30391646, 32147459, 36871792: a data do precedente transcrito não confirma
  for (const [n, dt] of [["7010008-73.2024.8.22.0005", "26/07/2022"], ["7052133-68.2024.8.22.0001", "28/08/2024"], ["7014008-31.2024.8.22.0001", "11/09/2025"], ["7019304-63.2026.8.22.0001", "20/01/2023"]]) {
    assert.doesNotMatch(l(n, dt), /^✅/, `${n} ${dt}`);
  }
  assert.match(l("7010008-73.2024.8.22.0005", "22/09/2025"), /^✅/);
});
