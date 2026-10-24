// Estatística e regras de 24/10/2026 (1.41.9) — regressão sintética, sem rede, recibos só em os.tmpdir().
// (1) Piso de surpresa por fragmento: costura de palavras soltas com [...] não sai ✅ LITERAL pleno.
// (2) Casamento aproximado só para hífen de quebra, U+00AD e ponto de milhar; números e negadores continuam exatos.
// (3) Fórmulas de relator vencido numa fonte única (vencido.js), lidas pela auditoria e pela custódia.
// (4) A auditoria só dá ✅ se tudo o que a peça afirmou ao lado do número foi extraído e comparado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { auditarCitacoes, relatorVencidoNoFecho } from "../server/auditoria.js";
import { conferirTrecho, verificarCitacao } from "../server/verificar.js";
import { faixasAlheias } from "../server/custodia.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

let seq = 960000;
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-estatistica-"));
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num) && /^[🔴🟠🟡✅⚪]/u.test(l)) || "";
const NUM = "7000001-34.2024.8.22.0001", NR = "70000013420248220001";

const VOTO = "RELATÓRIO Apelação do banco contra a sentença. É o relatório. VOTO Conheço do recurso. Assim, a cobrança da tarifa de cadastro, no início do relacionamento entre o consumidor e a instituição financeira, é devida, conforme o Tema 618 do STJ, e não há abusividade a reconhecer neste caso concreto. A parte autora não demonstrou cobrança em duplicidade nem venda casada do seguro prestamista. Ante o exposto, nego provimento ao recurso. É como voto. ";

// ---------- (1) ----------
test("estatística (1): costura de fragmentos curtos tem aviso FRAGMENTOS CURTOS e não sai ✅ LITERAL pleno; elisão real não", async () => {
  const costura = conferirTrecho(VOTO, "a cobrança [...] é [...] devida [...] conforme [...] neste caso", "ACÓRDÃO");
  assert.ok(costura.ok);
  assert.ok(costura.alertas.some((a) => a.startsWith("FRAGMENTOS CURTOS (costura de [...])")), JSON.stringify(costura.alertas));
  const real = conferirTrecho(VOTO, "a cobrança da tarifa de cadastro, no início do relacionamento entre o consumidor e a instituição financeira, [...] conforme o Tema 618 do STJ", "ACÓRDÃO");
  assert.ok(real.ok);
  assert.ok(!real.alertas.some((a) => a.startsWith("FRAGMENTOS CURTOS")), JSON.stringify(real.alertas));
  // sem [...] o piso não se aplica (já há o mínimo de 4 palavras e 25 caracteres)
  assert.ok(!conferirTrecho(VOTO, "conforme o Tema 618 do STJ", "ACÓRDÃO").alertas.some((a) => a.startsWith("FRAGMENTOS CURTOS")));
  const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "10/03/2024", ds_modelo_documento: VOTO });
  const out = await verificarCitacao({ nr_processo: NR, trecho: "a cobrança [...] é [...] devida [...] conforme [...] neste caso", pasta: p });
  assert.doesNotMatch(out, /^✅ LITERAL ·/m);
  assert.match(out, /FRAGMENTOS CURTOS/);
});

// ---------- (2) ----------
test("estatística (2): hífen de quebra, U+00AD e milhar casam; número, dígito e negador continuam exatos", () => {
  const T = "VOTO O con- trato de financiamento foi assinado pelas partes em cartório. O cer­tificado de registro veio aos autos depois. " +
    "O valor de R$ 1.000,00 foi pago na data aprazada. Restou comprovada a não-incidência do imposto sobre a operação. " +
    "A ação é im- procedente quanto ao pedido de danos morais. O débito de R$ 1.000.000,00 foi parcelado. É como voto.";
  const ok = (q) => conferirTrecho(T, q, "ACÓRDÃO").ok;
  assert.ok(ok("O contrato de financiamento foi assinado pelas partes"));
  assert.ok(ok("O certificado de registro veio aos autos"));
  assert.ok(ok("O valor de R$ 1000,00 foi pago na data aprazada"));
  assert.ok(ok("O valor de R$ 1.000,00 foi pago na data aprazada"));
  assert.ok(ok("A ação é improcedente quanto ao pedido de danos morais"));
  // negador e número continuam exatos: a metade depois de "im-"/"não-" não casa; dígito trocado e prefixo de número maior não casam
  assert.ok(!ok("procedente quanto ao pedido de danos morais"));
  assert.ok(!ok("incidência do imposto sobre a operação"));
  assert.ok(!ok("O valor de R$ 1.001,00 foi pago na data aprazada"));
  assert.ok(!ok("O débito de R$ 1.000 foi parcelado"));
  assert.ok(!ok("O débito de R$ 1000000,00 foi parcelado em vezes"));   // palavra a mais
  // número CNJ com o ponto do segmento não vira milhar
  assert.ok(conferirTrecho("Processo nº 7000123-45.2019.822.0007, 1ª Câmara Cível, julgado.", "Processo nº 7000123-45.2019.822.0007, 1ª Câmara", "ACÓRDÃO").ok);
});

// ---------- (3) ----------
test("estatística (3): fonte única do relator vencido — 'VENCIDO O VOTO DO RELATOR' e 'R ELATOR' partido valem na auditoria e na custódia", async () => {
  const v = await import("../server/vencido.js");
  assert.ok(v.relatorVencidoTotal("POR MAIORIA, VENCIDOS O R ELATOR E O DES. ISAIAS FONSECA MORAES"));
  assert.ok(!v.relatorVencidoTotal("VENCIDO EM PARTE O RELATOR"));
  assert.ok(v.sinalDeRelatorVencido("vencido em parte o relator"));
  assert.ok(v.sinalDeRelatorVencido("nos termos do voto divergente do des. x, por maioria"));
  const fecho = (p) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, ${p} Porto Velho, 22 de Novembro de 2023 Desembargador ROWILSON TEIXEIRA RELATOR PARA O ACÓRDÃO`;
  assert.equal(relatorVencidoNoFecho(fecho("NO MÉRITO, RECURSO PROVIDO NOS TERMOS DO VOTO DIVERGENTE DO DES. ROWILSON TEIXEIRA, POR MAIORIA, VENCIDOS O R ELATOR E O DES. ISAIAS FONSECA MORAES. LAVRARÁ O ACÓRDÃO O DES. ROWILSON TEIXEIRA.")).vencido, true);
  // custódia: "VENCIDO O VOTO DO RELATOR" — o voto do relator é o vencido, não o "VOTO DIVERGENTE VENCEDOR"
  const txt = "Processo: 7000001-34.2024.8.22.0001 RELATÓRIO Recurso inominado. É o relatório. VOTO Conheço do recurso. A sentença deve ser mantida por seus próprios fundamentos, pois o autor não provou o dano alegado nos autos. É como voto. " +
    "VOTO DIVERGENTE VENCEDOR DO JUIZ JOÃO LUIZ ROLIM SAMPAIO. Eminentes Pares, divirjo do relator: o dano está provado pelos documentos e deve ser indenizado. É como voto. " +
    "EMENTA Recurso inominado. Dano moral. Recurso provido. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da(o) 1ª Turma Recursal do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, RECURSO CONHECIDO E PROVIDO À MAIORIA, NOS TERMOS DO VOTO DO JUIZ JOÃO LUIZ ROLIM SAMPAIO. VENCIDO O VOTO DA RELATORA. Porto Velho, 24 de novembro de 2025 JOÃO LUIZ ROLIM SAMPAIO PROLATOR DO ACÓRDÃO";
  const div = faixasAlheias(txt, "ACÓRDÃO").divergente;
  assert.ok(div, "sem faixa divergente");
  assert.match(txt.slice(div[0], div[0] + 40), /^VOTO Conheço/);
});

// ---------- (4) ----------
const CAB = "Processo: 7000001-34.2024.8.22.0001 - APELAÇÃO CÍVEL (198) Relator: Des. ISAIAS FONSECA MORAES Data distribuição: 31/08/2023 09:36:49 Data julgamento: 22/11/2023 Polo Ativo: A Polo Passivo: B RELATÓRIO Apelação. VOTO Nego provimento. ";
const FECHO = (org) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da ${org} do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos e das notas taquigráficas, em, RECURSO NÃO PROVIDO À UNANIMIDADE. Porto Velho, 22 de Novembro de 2023 Desembargador ISAIAS FONSECA MORAES RELATOR`;
test("estatística (4): órgão sem número ou fora de 1ª–4ª, 'Data do julgamento:' e o que sobra sem conferir não saem ✅", () => {
  const p = pastaCom({ nr_processo: NR, dtjulgamento_str: "22/11/2023", ds_modelo_documento: CAB + FECHO("2ª Câmara Cível") });
  const cita = (meio) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${NUM}, ${meio}.`, p), NUM);
  assert.match(cita("2ª Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023"), /^✅ .*câmara, relator, data/);
  assert.match(cita("Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023"), /^✅ .*câmara/);   // espécie certa, sem número
  assert.doesNotMatch(cita("Câmaras Especiais Reunidas, Rel. Isaias Fonseca Moraes, j. 22/11/2023"), /^✅/);
  assert.doesNotMatch(cita("Tribunal Pleno, Rel. Isaias Fonseca Moraes, j. 22/11/2023"), /^✅/);
  assert.doesNotMatch(cita("5ª Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023"), /^✅/);
  assert.doesNotMatch(cita("Câmara Criminal, Rel. Isaias Fonseca Moraes, j. 22/11/2023"), /^✅/);
  assert.doesNotMatch(cita("2ª Câmara Cível, Rel. Isaias Fonseca Moraes, Data do julgamento: 01/01/2019"), /^✅/);
  assert.match(cita("2ª Câmara Cível, Rel. Isaias Fonseca Moraes, Data do julgamento: 22/11/2023"), /^✅ .*data/);
  // afirmação a mais que não foi lida: 🟠 com o que ficou sem conferir
  assert.match(cita("2ª Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023, sessão virtual encerrada em 01/01/2019"), /^🟠 .*NÃO foi lido nem comparado/);
  assert.match(cita("2ª Câmara Cível, Relatoria do gabinete 3, j. 22/11/2023"), /^🟠/);
  // data de publicação não é afirmação sobre o julgamento
  assert.match(cita("2ª Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023, DJe 05/12/2023"), /^✅/);
  // colegiado sem número, quando é o do fecho
  const q = pastaCom({ nr_processo: NR, dtjulgamento_str: "22/11/2023", ds_modelo_documento: CAB + FECHO("Câmaras Especiais Reunidas") });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Ação Rescisória n. ${NUM}, Câmaras Especiais Reunidas, Rel. Isaias Fonseca Moraes, j. 22/11/2023.`, q), NUM), /^✅ .*câmara/);
  assert.doesNotMatch(linhaDe(auditarCitacoes(`TJRO, Ação Rescisória n. ${NUM}, 1ª Câmara Cível, Rel. Isaias Fonseca Moraes, j. 22/11/2023.`, q), NUM), /^✅/);
});
