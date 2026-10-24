// Falhas da medição cega da amostra A (23/10/2026) — regressão sintética, sem rede, recibos só em os.tmpdir().
// (1) relator cortado em 6 palavras contando título e partícula; (2) ALEGAÇÃO DA PARTE nas seções I/II da ementa do CNJ, sem
// "VOZ DA CASA"; (3) DOUTRINA / SENTENÇA TRANSCRITA sem aspas depois de dois-pontos; (4) "Data julgamento:" do cabeçalho;
// (5) folga de data contada do fecho legível, não do índice; (6) TRANSCRIÇÃO pela maioria do trecho.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extrairRelatorDoTexto, compararRelator, recibo } from "../server/lib.js";
import { auditarCitacoes, regiaoDoJulgamento } from "../server/auditoria.js";
import { conferirTrecho } from "../server/verificar.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

const FECHO = (camara, data) => `ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da ${camara} do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE. Porto Velho, ${data}. RELATOR `;
let seq = 920000;
function pastaCom(...docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-amostra-a-"));
  for (const d of docs) {
    const r = recibo({ id_processo_documento: ++seq, tipo: "ACÓRDÃO", ...d });
    fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  }
  return p;
}
const linhaDe = (saida, num) => saida.split("\n").find((l) => l.includes(num)) || "";

// ---------- (1) ----------
test("amostra A (1): o corte em 6 conta NOMES, não título nem partícula", () => {
  assert.equal(extrairRelatorDoTexto("Relator: JORGE LUIZ DE MOURA GURGEL DO AMARAL\nData"), "JORGE LUIZ DE MOURA GURGEL DO AMARAL");
  assert.equal(extrairRelatorDoTexto("Relator: Juiz de Direito JOSE AUGUSTO ALVES MARTINS Processo: 1"), "Juiz de Direito JOSE AUGUSTO ALVES MARTINS");
  assert.equal(extrairRelatorDoTexto("Relatora: JUÍZA DE DIREITO SILVANA MARIA DE FREITAS Origem: x"), "JUÍZA DE DIREITO SILVANA MARIA DE FREITAS");
  // o lixo depois do nome continua fora: no máximo 6 nomes, e partícula solta no fim sai
  assert.equal(extrairRelatorDoTexto("Relator: Des. UM DOIS TRES QUATRO CINCO SEIS SETE OITO"), "Des. UM DOIS TRES QUATRO CINCO SEIS");
  assert.equal(extrairRelatorDoTexto("Relator: Juiz(a) Convocado(a) HARUO MIZUSAKI Da"), "Juiz(a) Convocado(a) HARUO MIZUSAKI");
  // o que já existia
  assert.equal(extrairRelatorDoTexto("Relator: Des. Alexandre Miguel Revisor: Des. Fulano"), "Des. Alexandre Miguel");
  assert.equal(extrairRelatorDoTexto("Relator: Des. SANSÃO SALDANHA substituído por DALMO ANTONIO DE CASTRO BEZERRA Data distribuição"), "DALMO ANTONIO DE CASTRO BEZERRA");
});

test("amostra A (1): nome completo com partícula sai ✅; sobrenome em comum e nome único continuam fora do ✅", () => {
  const num = "7000001-34.2024.8.22.0001";
  const p = pastaCom({ nr_processo: "70000013420248220001", dtjulgamento_str: "22/11/2024", ds_modelo_documento:
    "Relator: JORGE LUIZ DE MOURA GURGEL DO AMARAL\nRELATÓRIO Apelação. VOTO Nego provimento. " + FECHO("1ª Câmara Cível", "19 de novembro de 2024") });
  const cita = (rel) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${num}, 1ª Câmara Cível, Rel. ${rel}, j. 19/11/2024.`, p), num);
  assert.match(cita("Jorge Luiz de Moura Gurgel do Amaral"), /^✅ .*relator/);
  assert.doesNotMatch(cita("Raduan Miguel Filho"), /^✅/);
  assert.doesNotMatch(cita("Jorge Luiz Amaral Pereira"), /^✅/);   // nome a mais na peça

  const p2 = pastaCom({ nr_processo: "70000013420248220001", dtjulgamento_str: "22/11/2024", ds_modelo_documento:
    "Relator: Desembargador RADUAN MIGUEL FILHO\nRELATÓRIO Apelação. VOTO Nego provimento. " + FECHO("1ª Câmara Cível", "19 de novembro de 2024") });
  const cita2 = (rel) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${num}, 1ª Câmara Cível, Rel. ${rel}, j. 19/11/2024.`, p2), num);
  assert.match(cita2("Raduan Miguel Filho"), /^✅/);
  assert.doesNotMatch(cita2("Alexandre Miguel"), /^✅/);
  assert.doesNotMatch(cita2("Des. Miguel"), /^✅/);
  assert.equal(compararRelator("Alexandre Miguel", "Desembargador RADUAN MIGUEL FILHO"), "diverge");
  assert.equal(compararRelator("Miguel", "Desembargador RADUAN MIGUEL FILHO"), "ambiguo");
});

// ---------- (2) ----------
const VOTO2 = "RELATÓRIO Trata-se de agravo de instrumento. É o relatório. VOTO Conheço do recurso. O vício é sanável e a parte deve ser intimada para corrigi-lo, conforme o art. 76 do CPC. É como voto. ";
const EMENTA2 = "EMENTA: DIREITO PROCESSUAL CIVIL. AGRAVO DE INSTRUMENTO. EMBARGOS À EXECUÇÃO. VÍCIO FORMAL.\nI. CASO EM EXAME\n1. Agravo de instrumento contra decisão que rejeitou liminarmente os embargos. Os agravantes sustentam tratar-se de vício meramente formal, requerendo o recebimento dos embargos e a concessão de prazo para regularização.\nII. QUESTÃO EM DISCUSSÃO\n2. A questão em discussão consiste em saber se o vício formal autoriza a rejeição liminar dos embargos. O embargante alega que a omissão do valor da causa é irrelevante para o conhecimento dos embargos.\nIII. RAZÕES DE DECIDIR\n3. O vício formal sanável não autoriza a rejeição liminar dos embargos sem a prévia intimação da parte para corrigi-lo.\nIV. DISPOSITIVO E TESE\n4. Recurso provido.\n";
const FECHO2 = "ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO PROVIDO, À UNANIMIDADE. Porto Velho, 16 de abril de 2026.";
const nomes = (xs) => xs.map((x) => x.split(":")[0]);
test("amostra A (2): caso em exame / questão em discussão da ementa da casa — ALEGAÇÃO DA PARTE e nada de VOZ DA CASA", () => {
  for (const [texto, tipo] of [[VOTO2 + EMENTA2 + FECHO2, "ACÓRDÃO"], [EMENTA2, "EMENTA"]]) {
    for (const tr of ["tratar-se de vício meramente formal, requerendo o recebimento dos embargos", "a omissão do valor da causa é irrelevante para o conhecimento dos embargos"]) {
      const r = conferirTrecho(texto, tr, tipo);
      assert.ok(r.ok, tipo);
      assert.deepEqual(nomes(r.alertas), ["ALEGAÇÃO DA PARTE"], `${tipo}: ${tr}`);
      assert.ok(!r.notas.some((n) => n.startsWith("VOZ DA CASA")), `${tipo}: ${tr}`);
      assert.ok(r.notas.some((n) => /ementa › (I\. CASO EM EXAME|II\. QUESTÃO EM DISCUSSÃO)/.test(n)), `${tipo}: ${tr}`);
    }
    // a narração do caso sem verbo de relato da parte: sem alerta, mas também sem VOZ DA CASA
    const narr = conferirTrecho(texto, "Agravo de instrumento contra decisão que rejeitou liminarmente os embargos", tipo);
    assert.deepEqual(narr.alertas, []);
    assert.ok(!narr.notas.some((n) => n.startsWith("VOZ DA CASA")));
    // razões de decidir continuam voz da casa, sem alerta
    const razoes = conferirTrecho(texto, "O vício formal sanável não autoriza a rejeição liminar dos embargos", tipo);
    assert.deepEqual(razoes.alertas, []);
    assert.ok(razoes.notas.some((n) => n.startsWith("VOZ DA CASA")), tipo);
  }
});

// ---------- (3) ----------
const DOUT = "RELATÓRIO Embargos de declaração. É o relatório. VOTO Os embargos não apontam vício. Trago à baila ensinamentos do prof. Araken de Assis, que leciona: Ao órgão julgador compete o pronunciamento sobre questões de fato e de direito que sejam relevantes para o julgamento, não sendo permitido discriminar e não julgar algumas delas. A decisão será, então, omissa quando alguma proposição faltante tiver nela inserida. (autor citado in Comentários do Código de Processo Civil, Editora RT, 2ª edição 2017). Fica claro que o acórdão embargado enfrentou todas as questões relevantes do recurso. Ante o exposto, rejeito os embargos. É como voto. ";
const SENT = "RELATÓRIO Apelação. É o relatório. VOTO A apelada comprovou a quitação do débito antes do protesto. Segue o trecho da sentença que explica a dinâmica da questão: Constam nos autos documento referente a recibo de compra emitido pela requerida, vencimento em junho, pago em razão da novação; protesto realizado depois do pagamento. Em resumo, o protesto foi indevido. Portanto, a responsabilidade das demandadas está demonstrada nos autos do processo. Ante o exposto, nego provimento. É como voto. ";
test("amostra A (3): doutrina e sentença transcritas sem aspas depois de dois-pontos levam alerta próprio; a retomada do relator não", () => {
  const d = conferirTrecho(DOUT, "Ao órgão julgador compete o pronunciamento sobre questões de fato e de direito", "ACÓRDÃO");
  assert.deepEqual(nomes(d.alertas), ["DOUTRINA"]);
  assert.match(d.alertas[0], /Araken de Assis, que leciona:/);
  assert.deepEqual(conferirTrecho(DOUT, "Fica claro que o acórdão embargado enfrentou todas as questões relevantes do recurso", "ACÓRDÃO").alertas, []);
  const s2 = conferirTrecho(SENT, "Constam nos autos documento referente a recibo de compra emitido pela requerida", "ACÓRDÃO");
  assert.deepEqual(nomes(s2.alertas), ["SENTENÇA TRANSCRITA"]);
  assert.deepEqual(conferirTrecho(SENT, "a responsabilidade das demandadas está demonstrada nos autos do processo", "ACÓRDÃO").alertas, []);
  // o TJRO redigindo o dispositivo novo não é transcrição; o relator resumindo a sentença também não
  const red = "RELATÓRIO x. É o relatório. VOTO Acolho os embargos para alterar o dispositivo da sentença, que passa a vigorar com a seguinte redação: Condeno a ré ao pagamento de juros de mora desde a citação e correção monetária desde o arbitramento. É como voto. ";
  assert.deepEqual(conferirTrecho(red, "Condeno a ré ao pagamento de juros de mora desde a citação", "ACÓRDÃO").alertas, []);
  const resumo = "RELATÓRIO Dispositivo da sentença: A sentença julgou improcedente o pedido com fundamento na ausência de ilicitude na disponibilização dos dados processuais. É o relatório. VOTO Nego provimento. É como voto. ";
  assert.ok(!conferirTrecho(resumo, "julgou improcedente o pedido com fundamento na ausência de ilicitude", "ACÓRDÃO").alertas.some((a) => a.startsWith("SENTENÇA TRANSCRITA")));
  // entre aspas continua ENTRE ASPAS, sem alerta duplicado
  const asp = "RELATÓRIO x. É o relatório. VOTO Sobre o tema, leciona Fulano de Tal: “O órgão julgador deve enfrentar todas as questões relevantes para o julgamento da causa, sob pena de nulidade da decisão proferida.” Nego provimento. É como voto. ";
  assert.deepEqual(nomes(conferirTrecho(asp, "O órgão julgador deve enfrentar todas as questões relevantes para o julgamento", "ACÓRDÃO").alertas), ["ENTRE ASPAS"]);
});

// ---------- (4) e (5) ----------
const CAB4 = (rotulo) => `Gabinete Des. Fulano Processo: 7000001-34.2024.8.22.0001 - APELAÇÃO CÍVEL (198) Relator: Des. SANSÃO SALDANHA Data distribuição: 14/02/2023 15:22:04 ${rotulo}: 15/05/2023 Polo Ativo: A Polo Passivo: B RELATÓRIO Apelação. VOTO Nego provimento. `;
test("amostra A (4): 'Data julgamento:' do cabeçalho vale como data do julgamento; depois de 2.500 caracteres (outro documento) não", () => {
  const num = "7000001-34.2024.8.22.0001";
  const p = pastaCom({ nr_processo: "70000013420248220001", dtjulgamento_str: "22/05/2023", ds_modelo_documento: CAB4("Data julgamento") + FECHO("1ª Câmara Cível", "10 de maio de 2023") });
  const cita = (dt, pp = p) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${num}, 1ª Câmara Cível, Rel. Sansão Saldanha, j. ${dt}.`, pp), num);
  assert.match(cita("15/05/2023"), /^✅ .*data/);
  assert.match(cita("10/05/2023"), /^✅ .*data/);
  assert.match(regiaoDoJulgamento(CAB4("Data julgamento")), /15\/05\/2023/);
  assert.doesNotMatch(regiaoDoJulgamento(CAB4("Data julgamento")), /14\/02\/2023/);   // distribuição não entra
  // o mesmo rótulo no cabeçalho de um documento concatenado adiante (fora dos 2.500 caracteres) não vale
  const longe = "Relator: Des. SANSÃO SALDANHA RELATÓRIO x. VOTO " + "A matéria já foi examinada. ".repeat(120) + FECHO("1ª Câmara Cível", "10 de maio de 2023") + " Poder Judiciário " + CAB4("Data julgamento").replace("15/05/2023", "03/03/2021");
  assert.doesNotMatch(regiaoDoJulgamento(longe), /03\/03\/2021/);
  const p2 = pastaCom({ nr_processo: "70000013420248220001", dtjulgamento_str: "22/05/2023", ds_modelo_documento: longe });
  assert.doesNotMatch(cita("03/03/2021", p2), /^✅/);
  // a data da distribuição não é "a da sentença": a mensagem não afirma de que ato é
  const dist = cita("14/02/2023");
  assert.match(dist, /^🔴/);
  assert.doesNotMatch(dist, /pode ser a da sentença/);
});

test("amostra A (5): com fecho legível, data a +40 dias sai 🔴 mesmo cabendo nos 45 dias do índice; perto do fecho é 🟠", () => {
  const num = "7000001-34.2024.8.22.0001";
  const p = pastaCom({ nr_processo: "70000013420248220001", dtjulgamento_str: "28/12/2024", ds_modelo_documento:
    "Relator: Des. SANSÃO SALDANHA RELATÓRIO x. VOTO Nego provimento. " + FECHO("1ª Câmara Cível", "19 de novembro de 2024") });
  const cita = (dt) => linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${num}, 1ª Câmara Cível, Rel. Sansão Saldanha, j. ${dt}.`, p), num);
  assert.match(cita("19/11/2024"), /^✅/);
  assert.match(cita("28/12/2024"), /^🟠 .*difere da do documento: 19\/11\/2024/); // 24/10/2026: data só do ÍNDICE não confirma ✅
  assert.match(cita("29/12/2024"), /^🔴 .*19\/11\/2024/);  // +40 do fecho, 1 dia do índice: antes 🟠
  assert.match(cita("10/10/2024"), /^🔴/);                 // −40
  assert.match(cita("25/11/2024"), /^🟠 .*até 10 dias/);   // assinatura dias depois da sessão
  // sem data no fecho: a folga de 45 dias da data do índice fica como antes
  const p2 = pastaCom({ nr_processo: "70000013420248220001", dtjulgamento_str: "28/12/2024", ds_modelo_documento:
    "Relator: Des. SANSÃO SALDANHA RELATÓRIO x. VOTO Nego provimento. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE." });
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${num}, j. 29/11/2024.`, p2), num), /^🟠 .*45 dias/);
  assert.match(linhaDe(auditarCitacoes(`TJRO, Apelação Cível n. ${num}, j. 01/11/2024.`, p2), num), /^🔴/);
});

// ---------- (6) ----------
const TRANSC = "RELATÓRIO Apelação. É o relatório. VOTO Nego provimento. DECLARAÇÃO DE VOTO Peço vênia para registrar que a matéria não é nova nesta Câmara. Colaciono o julgamento do qual participei e em que o recurso restou não provido, nos termos do voto do Relator, ante a não comprovação do dano. Vejamos: Apelação cível. Ação de indenização. Dano moral não comprovado. Recurso não provido. (TJRO, Apelação Cível 7000005-00.2020.8.22.0001, Rel. Des. Fulano de Tal, j. 10/03/2021). Por isso acompanho. ";
test("amostra A (6): trecho que só encosta no bloco transcrito não é rotulado TRANSCRIÇÃO; o que está dentro continua sendo", () => {
  const encosta = conferirTrecho(TRANSC, "Colaciono o julgamento do qual participei e em que o recurso restou não provido, nos termos do voto do Relator, ante a não comprovação do dano. Vejamos: Apelação cível", "ACÓRDÃO");
  assert.ok(encosta.ok);
  assert.ok(!encosta.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), JSON.stringify(encosta.alertas));
  assert.ok(encosta.alertas.some((a) => a.startsWith("ENCOSTA EM TRANSCRIÇÃO")), JSON.stringify(encosta.alertas));
  const dentro = conferirTrecho(TRANSC, "Ação de indenização. Dano moral não comprovado. Recurso não provido", "ACÓRDÃO");
  assert.ok(dentro.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), JSON.stringify(dentro.alertas));
});
