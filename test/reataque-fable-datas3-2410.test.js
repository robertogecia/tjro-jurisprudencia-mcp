// Reataque Fable 3 (24/10/2026) sobre as datas — regressão sintética, sem rede, recibos só em os.tmpdir().
// (a) Rótulo de sessão com intervalo fora de ordem ou de mais de 10 dias ("02/02/2026 a 06/02/2025", ano errado no próprio documento,
//     30445817): cada data se confirma sozinha; a errada não sai ✅ e a certa continua ✅ ("06/12/2023 a 01/02/2018").
//     Assinatura final anterior ao ano do número CNJ (126372232, 129335081: "19 de Agosto de 2022" em processo de 2025) ou a mais de 30
//     dias do índice sem outra âncora sai 🟠. "Porto Velho - RO," é assinatura.
// (b) Em recibo que NÃO é ACÓRDÃO (SENTENÇA, VOTO, DECISÃO…), todo fecho "acordam" é transcrito: a data dele nunca sai ✅ (A1, A2, A6,
//     A10 como VOTO), e a câmara desse fecho não confirma a câmara da peça (143609392).
// (c) Fecho próprio com a palavra quebrada pelo PDF ("acordam os d esembargadores", "os m agistrados", "os a(s) magistrados (as)") é
//     fecho; "(TJRO, AC …)" encerra a janela do fecho transcrito (A14).
// (d) Proclamação com "SESSÃO DO TRIBUNAL DO JÚRI REALIZADA EM", "SESSÃO DE <data>" ou "ACÓRDÃO JULGADO EM" não é sessão do fecho.
// (e) "sessão realizada no dia <data>" narrada sai 🟠 "sessão ANTERIOR", não 🔴.
// Opcional: com TJRO_COPIA_RECIBOS_B apontando para uma CÓPIA dos recibos em os.tmpdir(), confere os ids reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { auditarCitacoes } from "../server/auditoria.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

let seq = 950000;
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-reataque-datas3-"));
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", nr_processo: NR, ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num)) || "";
const NUM = "7000001-34.2024.8.22.0001", NR = "70000013420248220001";
const cita = (p, dt) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, j. ${dt}.`, p), NUM);
const citaTxt = (p, txt) => linhaDe(auditarCitacoes(txt, p), NUM);

const TRANSCRITO = (data) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Desembargadores da 2ª Câmara Especial do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas em, POR UNANIMIDADE, NEGAR PROVIMENTO AO RECURSO. Porto Velho, ${data} DESEMBARGADOR(A) Fulano de Tal (PRESIDENTE) `;
const FECHO = (data, procl = "RECURSO NÃO PROVIDO NOS TERMOS DO VOTO DO RELATOR, À UNANIMIDADE.", quem = "acordam os Magistrados da") => `ACÓRDÃO Vistos, relatados e discutidos estes autos, ${quem} 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${procl} Porto Velho, ${data} Desembargador FULANO DE TAL RELATOR`;
const PROSA = "Sendo assim, considerando que o requerente pode realizar atividades laborais para sustento próprio, o que afasta a concessão do benefício pretendido, tenho que os pedidos iniciais merecem a improcedência, conforme fundamentos acima expostos e a jurisprudência colacionada. ";
const CAB = (rot) => `2ª Câmara Cível / Gabinete Des. Kiyochi Mori Processo: ${NUM} - APELAÇÃO CÍVEL (198) Relator: Des. PAULO KIYOCHI MORI Data distribuição: 12/09/2023 11:39:03 Data julgamento: ${rot} Polo Ativo: A Polo Passivo: B `;

// ---------- (a) ----------
test("reataque Fable 3 (a): intervalo do rótulo fora de ordem — cada data se confirma sozinha", () => {
  const p = pastaCom({ dtjulgamento_str: "12/02/2026", ds_modelo_documento: "1ª Câmara Cível Data do julgamento: Sessão Eletrônica n. 993 de 02/02/2026 a 06/02/2025 Autos n. " + NUM + " RELATÓRIO x. VOTO y. " + FECHO("06 de fevereiro de 2026") });
  assert.doesNotMatch(cita(p, "06/02/2025"), /^✅/);
  assert.match(cita(p, "06/02/2026"), /^✅/);
  assert.match(cita(p, "02/02/2026"), /^✅/);
  const q = pastaCom({ dtjulgamento_str: "12/12/2023", ds_modelo_documento: "2ª Câmara Cível Processo " + NUM + " Data do julgamento: Sessão Virtual de 06/12/2023 a 01/02/2018 RELATÓRIO x. VOTO y. " + FECHO("22 de Novembro de 2023") });
  assert.match(cita(q, "06/12/2023"), /^✅/);   // não perde o ✅ legítimo
  assert.doesNotMatch(cita(q, "01/02/2018"), /^✅/);
  // intervalo ordenado e curto continua valendo em bloco
  const r = pastaCom({ dtjulgamento_str: "20/12/2024", ds_modelo_documento: "1ª Câmara Cível Data do julgamento: Sessão Eletrônica n. 935 de 09/12/2024 a 13/12/2024 RELATÓRIO x. VOTO y. " + FECHO("13 de dezembro de 2024") });
  assert.match(cita(r, "09/12/2024"), /^✅/);
});

test("reataque Fable 3 (a): assinatura final anterior ao ano do processo ou longe do índice sai 🟠; 'Porto Velho - RO,' é assinatura", () => {
  const sent = (ass) => "SENTENÇA Vistos. " + PROSA + "Julgo improcedente. P.R.I. " + ass + ". MÁRCIA Juíza de Direito";
  const p = pastaCom({ tipo: "SENTENÇA", dtjulgamento_str: "16/09/2025", ds_modelo_documento: sent("Porto Velho, 19 de Agosto de 2022") });
  assert.match(cita(p, "19/08/2022"), /^🟠 .*assinatura final/);
  assert.match(cita(p, "16/09/2025"), /^🟠 .*ÍNDICE/); // 24/10/2026: data só do ÍNDICE não confirma ✅
  // VOTO sem fecho que termina com a assinatura da sentença transcrita (A5): longe do índice, sem outra âncora
  const v = pastaCom({ tipo: "VOTO", dtjulgamento_str: "05/10/2026", ds_modelo_documento: "VOTO A sentença decidiu: 'Ante o exposto, julgo improcedente. P.R.I. Porto Velho, 10 de março de 2025. MÁRCIA Juíza de Direito'. Mantenho-a. É como voto." });
  assert.match(cita(v, "10/03/2025"), /^🟠/);
  // grafia "Porto Velho - RO," (25 sentenças reais) confirma a assinatura perto do índice
  const h = pastaCom({ tipo: "SENTENÇA", dtjulgamento_str: "14/03/2026", ds_modelo_documento: sent("Porto Velho - RO, 12 de março de 2026") });
  assert.match(cita(h, "12/03/2026"), /^✅/);
  // …mas não a 77 dias do índice (107623237: mesma data de outro processo, modelo reaproveitado)
  const l = pastaCom({ tipo: "SENTENÇA", dtjulgamento_str: "25/06/2024", ds_modelo_documento: sent("Porto Velho - RO, 9 de abril de 2024") });
  assert.match(cita(l, "09/04/2024"), /^🟠 .*assinatura final/);
});

// ---------- (b) ----------
test("reataque Fable 3 (b): fora de ACÓRDÃO, todo fecho 'acordam' é transcrito (data e câmara)", () => {
  const a1 = pastaCom({ tipo: "DECISÃO", dtjulgamento_str: "05/10/2026", ds_modelo_documento: "DECISÃO Trata-se de agravo. Nesse sentido, a jurisprudência desta Corte: " + TRANSCRITO("29 de maio de 2012") });
  assert.doesNotMatch(cita(a1, "29/05/2012"), /^✅/);
  assert.match(cita(a1, "05/10/2026"), /^🟠 .*ÍNDICE/); // 24/10/2026: data só do ÍNDICE não confirma ✅
  const a2 = pastaCom({ tipo: "DECISÃO", dtjulgamento_str: "05/10/2026", ds_modelo_documento: "DECISÃO Trata-se de agravo interno. Nesse sentido: " + TRANSCRITO("29 de maio de 2012") + "Ante o exposto, NEGO PROVIMENTO. Intime-se. Porto Velho, 05 de outubro de 2026. Desembargador BELTRANO RELATOR" });
  assert.doesNotMatch(cita(a2, "29/05/2012"), /^✅/);
  const a6 = pastaCom({ tipo: "SENTENÇA", dtjulgamento_str: "05/10/2026", ds_modelo_documento: "SENTENÇA Vistos. Nesse sentido: " + TRANSCRITO("05 de setembro de 2026") + PROSA + "Julgo improcedente. P.R.I. Porto Velho, 05 de outubro de 2026. Juiz de Direito" });
  assert.doesNotMatch(cita(a6, "05/09/2026"), /^✅/);
  assert.match(cita(a6, "05/10/2026"), /^✅/);
  const a10 = pastaCom({ tipo: "VOTO", dtjulgamento_str: "12/12/2023", ds_modelo_documento: CAB("06/12/2023") + "RELATÓRIO x. VOTO Nego provimento, como já decidido: " + TRANSCRITO("22 de novembro de 2023") });
  assert.doesNotMatch(cita(a10, "22/11/2023"), /^✅/);
  // câmara do fecho transcrito na sentença (143609392: "2ª Câmaras Especial") não confirma
  assert.doesNotMatch(citaTxt(a6, `TJRO, Apelação n. ${NUM}, 2ª Câmara Especial.`), /^✅/);
  // o mesmo fecho num ACÓRDÃO (fecho próprio no fim) continua valendo
  const ac = pastaCom({ dtjulgamento_str: "27/10/2016", ds_modelo_documento: "RELATÓRIO x. VOTO y. " + FECHO("26 de outubro de 2016") });
  assert.match(cita(ac, "26/10/2016"), /^✅/);
  assert.match(citaTxt(ac, `TJRO, Apelação n. ${NUM}, 1ª Câmara Cível.`), /^✅/);
});

// ---------- (c) ----------
test("reataque Fable 3 (c): fecho próprio com a palavra quebrada pelo PDF; '(TJRO' encerra a janela do transcrito", () => {
  for (const quem of ["acordam os d esembargadores da", "acordam os m agistrados da", "acordam os a(s) magistrados (as) da(o)"]) {
    const p = pastaCom({ dtjulgamento_str: "27/10/2016", ds_modelo_documento: "RELATÓRIO x. VOTO Como já decidiu esta Corte: " + TRANSCRITO("29 de maio de 2012") + "É como voto. " + FECHO("26 de outubro de 2016", undefined, quem) });
    assert.doesNotMatch(cita(p, "29/05/2012"), /^✅/, quem);
    assert.match(cita(p, "26/10/2016"), /^✅/, quem);
  }
  const p14 = pastaCom({ dtjulgamento_str: "27/10/2016", ds_modelo_documento: "RELATÓRIO x. VOTO Como já decidiu esta Corte: " + TRANSCRITO("29 de maio de 2012") + "(TJRO, AC 0001234-56.2011.8.22.0001, REL. DES. FULANO) " + PROSA + "É como voto. " + FECHO("26 de outubro de 2016", undefined, "acordam os d esembargadores da") });
  assert.doesNotMatch(cita(p14, "29/05/2012"), /^✅/);
  assert.match(cita(p14, "26/10/2016"), /^✅/);
});

// ---------- (d) e (e) ----------
test("reataque Fable 3 (d)(e): proclamação não é sessão do fecho; 'sessão realizada no dia' narrada sai 🟠", () => {
  const casos = [
    ["APELAÇÃO PROVIDA PARA ANULAR A SESSÃO DO TRIBUNAL DO JÚRI REALIZADA EM 10/05/2022, À UNANIMIDADE.", "10/05/2022", "12 de março de 2024", "20/03/2024", "12/03/2024"],
    ["NULIDADE DA SESSÃO DE 10/05/2022 RECONHECIDA. RECURSO PROVIDO, À UNANIMIDADE.", "10/05/2022", "12 de março de 2024", "20/03/2024", "12/03/2024"],
    ["EMBARGOS DE DECLARAÇÃO OPOSTOS AO ACÓRDÃO JULGADO EM 12/03/2020 REJEITADOS, À UNANIMIDADE.", "12/03/2020", "11 de agosto de 2020", "20/08/2020", "11/08/2020"],
  ];
  for (const [procl, falsa, ext, idx, certa] of casos) {
    const p = pastaCom({ dtjulgamento_str: idx, ds_modelo_documento: "RELATÓRIO x. VOTO y. " + FECHO(ext, procl) });
    assert.doesNotMatch(cita(p, falsa), /^✅/, procl);
    assert.match(cita(p, certa), /^✅/, procl);
  }
  // a sessão do fecho na forma real continua valendo (29892933)
  const s = pastaCom({ dtjulgamento_str: "28/07/2025", ds_modelo_documento: "RELATÓRIO x. VOTO y. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, NA SESSÃO N. 717, JULGADA ENTRE OS DIAS 21/07/2025 E 25/07/2025, RECURSO NÃO PROVIDO, À UNANIMIDADE. Porto Velho, 25 de julho de 2025 Desembargador FULANO DE TAL RELATOR" });
  assert.match(cita(s, "21/07/2025"), /^✅/);
  const n = pastaCom({ dtjulgamento_str: "28/07/2022", ds_modelo_documento: "RELATÓRIO O recurso foi julgado na sessão realizada no dia 25/03/2021 e, após, opostos embargos. VOTO Nego provimento. " + FECHO("21 de julho de 2022") });
  assert.match(cita(n, "25/03/2021"), /^🟠 .*sessão ANTERIOR/);
});

// ---------- ids reais (opcional) ----------
const COPIA = process.env.TJRO_COPIA_RECIBOS_B;
test("reataque Fable 3: ids reais na cópia dos recibos", { skip: !COPIA && "defina TJRO_COPIA_RECIBOS_B (cópia em os.tmpdir())" }, () => {
  assert.ok(fs.realpathSync(COPIA).startsWith(fs.realpathSync(os.tmpdir())), "a cópia precisa estar em os.tmpdir()");
  _limparMemoParaTeste();
  const mask = (n) => `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n[13]}.${n.slice(14, 16)}.${n.slice(16)}`;
  const linha = (id, dt) => { const r = JSON.parse(fs.readFileSync(path.join(COPIA, `${id}.json`), "utf8")); const n = mask(r.nr_processo); return linhaDe(auditarCitacoes(`TJRO, Apelação n. ${n}, j. ${dt}.`, COPIA), n); };
  assert.doesNotMatch(linha(30445817, "06/02/2025"), /^✅/);
  assert.match(linha(30445817, "06/02/2026"), /^✅/);
  assert.match(linha(126372232, "19/08/2022"), /^🟠/);
  assert.match(linha(129335081, "19/08/2022"), /^🟠/);
  assert.match(linha(107623237, "09/04/2024"), /^🟠/);
  assert.match(linha(29892933, "21/07/2025"), /^✅/);
  assert.match(linha(22165638, "06/12/2023"), /^✅/);
  assert.match(linha(35982682, "12/09/2025"), /^✅/);
  assert.doesNotMatch(linha(143609392, "29/05/2012"), /^✅/);
});
