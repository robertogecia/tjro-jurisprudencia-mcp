// 1.41.11 — auditoria: (A) números agrupados no mesmo parêntese; (B) cauda entre dois parênteses é do número anterior.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditarCitacoes } from "../server/auditoria.js";
import { recibo } from "../server/lib.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

const NR = "70000013420248220001", NR2 = "70000025020238220002";
const fecho = (c) => ` ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da ${c} do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE.`;
function pasta(c1, c2, r1 = "SANSÃO SALDANHA", r2 = "RADUAN MIGUEL FILHO") {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-aud2610b-"));
  for (const s of [
    { id_processo_documento: 921, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "21/11/2023", ds_modelo_documento: `Relator: Des. ${r1} RELATÓRIO Trata-se de apelação. VOTO Nego provimento.` + fecho(c1) },
    { id_processo_documento: 922, nr_processo: NR2, tipo: "ACÓRDÃO", dtjulgamento_str: "05/03/2024", ds_modelo_documento: `Relator: Des. ${r2} RELATÓRIO Trata-se de apelação. VOTO Nego provimento.` + fecho(c2) },
  ]) { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); }
  return p;
}
const linha = (out, nr) => out.split("\n").find((l) => l.includes(nr)) || "";
const A1 = "7000001-34.2024.8.22.0001", A2 = "7000002-50.2023.8.22.0002";

test("(A) dois números no mesmo parêntese: a câmara dita depois do último vale para o primeiro (🔴 se diverge)", () => {
  const p = pasta("1ª Câmara Cível", "3ª Câmara Cível");
  for (const txt of [
    `Nesse sentido (Apelações ${A1} e ${A2}, 3ª Câmara Cível, Rel. Des. Raduan Miguel Filho).`,
    `Nesse sentido (Apelações ${A1} e ${A2}, ambas da 3ª Câmara Cível).`,
    `Nesse sentido, Apelações ${A1} e ${A2}, 3ª Câmara Cível.`,
  ]) {
    const out = auditarCitacoes(txt, p);
    assert.doesNotMatch(linha(out, "7000001-34"), /^✅/, txt + "\n" + out);
    assert.match(linha(out, "7000001-34"), /^🔴 .*3ª Câmara Cível.*1ª Câmara Cível/, txt + "\n" + out);
    assert.match(linha(out, "7000002-50"), /^✅/, out);
  }
});
test("(A) grupo com a mesma câmara: os dois saem ✅; o relator do grupo vale para o primeiro", () => {
  const p = pasta("3ª Câmara Cível", "3ª Câmara Cível");
  const out = auditarCitacoes(`(Apelações ${A1} e ${A2}, 3ª Câmara Cível)`, p);
  assert.match(linha(out, "7000001-34"), /^✅ .*câmara/, out);
  assert.match(linha(out, "7000002-50"), /^✅ .*câmara/, out);
  const out2 = auditarCitacoes(`(Apelações ${A1} e ${A2}, 3ª Câmara Cível, Rel. Des. Raduan Miguel Filho)`, p);
  // relator do grupo vale para o primeiro também: diverge do acórdão lido → não sai ✅
  assert.match(linha(out2, "7000001-34"), /^🟠 .*relator Raduan Miguel Filho/, out2);
  assert.doesNotMatch(linha(out2, "7000001-34"), /nada a comparar/, out2);
  // órgão do grupo não lido: pendente nos dois, nunca ✅
  const out3 = auditarCitacoes(`(Apelações ${A1} e ${A2}, Câm. Reunidas)`, p);
  assert.match(linha(out3, "7000001-34"), /^🟠/, out3);
  // números separados por prosa com câmara não se agrupam (cada um com o seu)
  const out4 = auditarCitacoes(`(Apelação ${A1}, 3ª Câmara Cível; Apelação ${A2}, 3ª Câmara Cível)`, p);
  assert.match(linha(out4, "7000001-34"), /^✅/, out4);
});
test("(B) cauda entre dois parênteses vale para o número anterior, não para o seguinte", () => {
  const p = pasta("1ª Câmara Cível", "2ª Câmara Cível", "SANSÃO SALDANHA", "RADUAN MIGUEL FILHO");
  const out = auditarCitacoes(`Veja-se (${A1}), Rel. Des. Fulano de Tal, j. 01/01/1999, e (${A2}, 2ª Câmara Cível).`, p);
  assert.doesNotMatch(linha(out, "7000002-50"), /^🔴/, out);
  assert.match(linha(out, "7000002-50"), /^✅/, out);
  assert.doesNotMatch(linha(out, "7000001-34"), /^✅/, out);   // relator/data errados atribuídos a A
});
test("(B) parêntese anterior já diz câmara: a câmara entre os parênteses continua sendo a introdução do seguinte", () => {
  const p = pasta("1ª Câmara Cível", "2ª Câmara Cível");
  const out = auditarCitacoes(`Veja-se (${A1}, 1ª Câmara Cível), e na 3ª Câmara Cível (${A2}).`, p);
  assert.match(linha(out, "7000002-50"), /^🔴 .*3ª Câmara Cível/, out);
  assert.match(linha(out, "7000001-34"), /^✅/, out);
  // relator entre os parênteses, que o anterior não tomou (já tinha o seu): pendente no seguinte, nunca ✅
  const out2 = auditarCitacoes(`Veja-se (${A1}, 1ª Câmara Cível, Rel. Des. Sansão Saldanha), Rel. Des. Fulano de Tal, e (${A2}, 2ª Câmara Cível).`, p);
  assert.match(linha(out2, "7000002-50"), /^🟠 .*entre os dois parênteses/, out2);
});
