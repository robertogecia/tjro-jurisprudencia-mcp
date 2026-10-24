// Reataque Fable 4 (24/10/2026), caso N9 — regressão sintética, sem rede, recibos só em os.tmpdir().
// Rótulo "Data julgamento: Sessão Eletrônica n. 993 de 02/02/2026 a 06/03/2026" (erro de mês: intervalo de 32 dias), fecho próprio
// "Porto Velho, 22 de janeiro de 2026", índice 20/03/2026. O intervalo é dividido em duas datas; 06/03/2026 ficava a 43 dias depois do
// fecho e a 14 antes do índice e saía ✅ pela regra da sessão depois do voto. As duas metades caem depois do voto, então não se sabe
// qual foi digitada errado: metade de intervalo dividido só se confirma por proximidade (±10 dias) do fecho/assinatura. Se a outra
// metade é impossível (mais de 10 dias antes de todo fecho: "06/12/2023 a 01/02/2018", B3c), a regra da sessão continua valendo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { auditarCitacoes } from "../server/auditoria.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

let seq = 960000;
const NUM = "7000001-34.2024.8.22.0001", NR = "70000013420248220001";
const pastas = [];
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-reataque-datas4-"));
  pastas.push(p);
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", nr_processo: NR, ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num)) || "";
const cita = (p, dt) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, j. ${dt}.`, p), NUM);
const FECHO = (data) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, RECURSO NÃO PROVIDO NOS TERMOS DO VOTO DO RELATOR, À UNANIMIDADE. Porto Velho, ${data} Desembargador FULANO DE TAL RELATOR`;
const CAB = (rot) => `1ª Câmara Cível / Gabinete Des. Kiyochi Mori Processo: ${NUM} - APELAÇÃO CÍVEL (198) Relator: Des. PAULO KIYOCHI MORI Data distribuição: 12/09/2023 11:39:03 Data julgamento: ${rot} Polo Ativo: A Polo Passivo: B `;

test("reataque Fable 4 (N9): metade de intervalo dividido não se confirma pela sessão depois do voto", () => {
  const p = pastaCom({ dtjulgamento_str: "20/03/2026", ds_modelo_documento: CAB("Sessão Eletrônica n. 993 de 02/02/2026 a 06/03/2026") + " RELATÓRIO x. VOTO y. " + FECHO("22 de janeiro de 2026") });
  assert.doesNotMatch(cita(p, "06/03/2026"), /^✅/);
  assert.doesNotMatch(cita(p, "02/02/2026"), /^✅/);
  assert.match(cita(p, "22/01/2026"), /^✅/);
});

test("reataque Fable 4: metade dividida com a outra impossível (B3c) e rótulo inteiro (22165638) continuam ✅", () => {
  const b3c = pastaCom({ dtjulgamento_str: "12/12/2023", ds_modelo_documento: "2ª Câmara Cível Processo " + NUM + " Data do julgamento: Sessão Virtual de 06/12/2023 a 01/02/2018 RELATÓRIO x. VOTO y. " + FECHO("22 de Novembro de 2023") });
  assert.match(cita(b3c, "06/12/2023"), /^✅/);
  assert.doesNotMatch(cita(b3c, "01/02/2018"), /^✅/);
  const inteiro = pastaCom({ dtjulgamento_str: "12/12/2023", ds_modelo_documento: CAB("06/12/2023") + "RELATÓRIO x. VOTO y. " + FECHO("22 de Novembro de 2023") });
  assert.match(cita(inteiro, "06/12/2023"), /^✅/);
  // ano errado no fim do intervalo (30445817): a certa pela proximidade do fecho, a errada não
  const a7 = pastaCom({ dtjulgamento_str: "12/02/2026", ds_modelo_documento: "1ª Câmara Cível Data do julgamento: Sessão Eletrônica n. 993 de 02/02/2026 a 06/02/2025 Autos n. " + NUM + " RELATÓRIO x. VOTO y. " + FECHO("06 de fevereiro de 2026") });
  assert.match(cita(a7, "06/02/2026"), /^✅/);
  assert.match(cita(a7, "02/02/2026"), /^✅/);
  assert.doesNotMatch(cita(a7, "06/02/2025"), /^✅/);
});

test.after(() => { for (const p of pastas) fs.rmSync(p, { recursive: true, force: true }); });
