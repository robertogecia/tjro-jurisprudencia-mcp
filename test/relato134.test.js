// v1.34.0 — relato de uso de 13/10/2026 (pesquisa de litigância de má-fé). Sem rede, textos sintéticos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fechoForaDoCorte, reemissoesDoAcordao, artigosTrocados, diasDesdeJulgamento, fraseDeMaFe, formatBusca } from "../server/lib.js";
import { faixasAlheias } from "../server/custodia.js";
import { conferirTrecho } from "../server/verificar.js";

const FECHO = "Acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos, em, RECURSO PROVIDO À UNANIMIDADE.";

test("fecho cortado: vem mesmo assim; fecho exibido: nada", () => {
  const corpo = "Voto. ".repeat(500) + FECHO;
  const f = fechoForaDoCorte(corpo, 100);
  assert.match(f, /📍 FECHO \(estava na parte cortada/);
  assert.match(f, /RECURSO PROVIDO À UNANIMIDADE/);
  assert.equal(fechoForaDoCorte(corpo, corpo.length), "");
  assert.equal(fechoForaDoCorte("sem fecho nenhum", 0), "");
});

test("reemissão: mesmo começo e mesmo fecho = mesmo julgamento; o mais longo primeiro", () => {
  const ini = "APELAÇÃO CÍVEL. Relatório. ".repeat(60);
  const curto = ini + "Relatório repetido. " + FECHO;
  const longo = ini + "Voto completo do relator. ".repeat(40) + FECHO;
  const outro = "EMBARGOS DE DECLARAÇÃO. ".repeat(80) + FECHO;
  const u = [[{ tipo: "ACÓRDÃO", id_processo_documento: 1 }, curto], [{ tipo: "ACÓRDÃO", id_processo_documento: 2 }, longo], [{ tipo: "ACÓRDÃO", id_processo_documento: 3 }, outro]];
  const g = reemissoesDoAcordao(u);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].map((x) => x[0].id_processo_documento), [2, 1]);
});

test("artigo trocado: só avisa quando um dos dois não existe no diploma (red-team de 15/10/2026)", () => {
  assert.match(artigosTrocados("nos termos do art. 1.103, § 3º, III, do CPC. Ementa: art. 1.013, § 3º, do CPC."), /ARTIGO QUE NÃO EXISTE: o texto cita art\. 1\.103 do CPC/);
  assert.equal(artigosTrocados("art. 1.583 do Código Civil e 550 do CPC; § 5º do art. 1.538 do CC/02"), "");
  assert.equal(artigosTrocados("Nos termos do art. 1.012 do CPC, a apelação; e o art. 1.021 do CPC trata do agravo interno."), "");
  assert.equal(artigosTrocados("art. 1.022 do CPC e art. 1.220 do Código Civil"), "");
});

test("julgado recente: até 30 dias; data futura ou antiga, nada", () => {
  const ag = Date.UTC(2026, 9, 14, 12);
  assert.equal(diasDesdeJulgamento({ dtjulgamento: "2026-10-06" }, ag), 8);
  assert.equal(diasDesdeJulgamento({ dtjulgamento: "2026-08-01" }, ag), null);
  assert.equal(diasDesdeJulgamento({ dtjulgamento: "2026-10-20" }, ag), null);
  assert.equal(diasDesdeJulgamento({}, ag), null);
});

test("busca sobre má-fé: frase literal por resultado, sem rótulo; busca de outro tema não mostra", () => {
  const texto = "Relatório. O réu pediu a condenação por litigância de má-fé. Voto. Afasto a condenação por litigância de má-fé, ausente dolo processual. Dispositivo.";
  const data = { hits: { total: { value: 1 }, hits: [{ _source: { tipo: "ACÓRDÃO", ds_classe_judicial: "Apelação Cível", nr_processo: "70000000000000000000", dtjulgamento: "2020-01-01", ds_modelo_documento: texto, id_processo_documento: 9, grau_jurisdicao: 2 } }] } };
  assert.match(fraseDeMaFe(texto), /^Afasto a condenação/);
  const o = formatBusca(data, "litigância de má-fé", ["ACÓRDÃO"], "recentes", 1, 1, [], "", false, "", { agora: Date.UTC(2026, 9, 14) });
  assert.match(o, /Má-fé \(frase literal mais próxima do fim do texto, para triagem; não é rótulo\): «Afasto a condenação/);
  const o2 = formatBusca(data, "dano moral", ["ACÓRDÃO"], "recentes", 1, 1, [], "", false, "", { agora: Date.UTC(2026, 9, 14) });
  assert.doesNotMatch(o2, /Má-fé \(frase literal/);
});

test("transcrição: citação no formato do PJe fecha o bloco da ementa transcrita (relato, id 26358276)", () => {
  const t =
    "RELATÓRIO Apelação. VOTO 10. Nesse sentido, inclusive, já decidiu este Tribunal: Apelação cível. Seguro DPVAT. Ofensa ao princípio da dialeticidade. Não ocorrência. Recurso provido. " +
    "APELAÇÃO CÍVEL, Processo nº 7007178-54.2017.8.22.0014, 2ª Câmara Cível / Gabinete Des. Fulano, Relator(a) do Acórdão: FULANO DE TAL Data de julgamento: 10/06/2021. " +
    "11. Portanto, se as teses recursais combateram os fundamentos da decisão impugnada, não há que se falar em inadmissibilidade do recurso. " +
    "12. Diante disso, rejeito a preliminar de não conhecimento do recurso por violação ao princípio da dialeticidade. " +
    "13. Superada a preliminar acima, ausentes outras a examinar ou nulidades a serem declaradas, passo à análise do pedido de condenação à litigância de má-fé. " +
    "16. Nesse sentido é a jurisprudência do Colendo STJ: ( AgRg no AREsp 328.749/SC, Rel. Ministro MARCO BUZZI, QUARTA TURMA, julgado em 05/12/2017, DJe 13/12/2017). Fim do voto.";
  const r = conferirTrecho(t, "Superada a preliminar acima, ausentes outras a examinar ou nulidades a serem declaradas, passo à análise do pedido de condenação à litigância de má-fé.", "ACÓRDÃO");
  assert.equal(r.ok, true);
  assert.ok(!r.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), JSON.stringify(r.alertas));
  const fx = faixasAlheias(t, "ACÓRDÃO").transcritas;
  const fimPje = t.indexOf("10/06/2021.") + "10/06/2021.".length;
  assert.ok(fx.some(([a, b]) => a < t.indexOf("Seguro DPVAT") && b <= fimPje + 1), JSON.stringify(fx));
});

// v1.35.0 — segundo relato (jurimetria de honorários, 14/10/2026)
import { dataDoFecho, linhaDatas, pecaEAcordao, resultadosPorJulgamento } from "../server/lib.js";

test("data da sessão pelo fecho, ao lado da do índice", () => {
  const c = "Voto. Acordam os Magistrados da 1ª Câmara Cível, em, RECURSO PROVIDO À UNANIMIDADE. Porto Velho, 28 de agosto de 2026 Desembargador FULANO";
  assert.equal(dataDoFecho(c), "28/08/2026");
  assert.match(linhaDatas(c, { dtjulgamento_str: "04/09/2026" }), /Sessão de julgamento \(data no fecho\): 28\/08\/2026 · índice: 04\/09\/2026/);
  assert.equal(linhaDatas(c, { dtjulgamento_str: "28/08/2026" }), "");
  assert.equal(dataDoFecho("sem fecho"), "");
});

test("citação de VOTO aponta o ACÓRDÃO do mesmo julgamento", () => {
  const dataDe = (s) => s.d || "";
  const voto = { tipo: "VOTO", id_processo_documento: 36055403, d: "01/09/2026" };
  const ac = { tipo: "ACÓRDÃO", id_processo_documento: 36055394, d: "01/09/2026" };
  assert.match(pecaEAcordao(voto, [[voto, ""], [ac, ""]], dataDe), /peça: VOTO; o ACÓRDÃO deste julgamento é o id 36055394/);
  assert.equal(pecaEAcordao(ac, [[ac, ""]], dataDe), "");
  assert.match(pecaEAcordao(voto, [[voto, ""]], dataDe), /não veio nesta resposta/);
});

test("resultados diferentes entre julgamentos do mesmo número; embargos rejeitados não contam", () => {
  const e1 = { tipo: "ACÓRDÃO", id_processo_documento: 1, ds_classe_judicial: "Apelação Cível" };
  const e2 = { tipo: "ACÓRDÃO", id_processo_documento: 2, ds_classe_judicial: "Apelação Cível" };
  const F = (r) => `Voto. Acordam os Magistrados da 1ª Câmara Cível, na conformidade da ata, em, ${r} À UNANIMIDADE. Porto Velho, 1 de setembro de 2026`;
  const J = new Map([["04/09/2026", [e1]], ["01/09/2026", [e2]]]);
  assert.match(resultadosPorJulgamento(J, [[e1, F("RECURSO PROVIDO")], [e2, F("RECURSO PROVIDO PARCIALMENTE")]]), /resultados diferentes: 04\/09\/2026 \(ACÓRDÃO, id 1\): provido; 01\/09\/2026 \(ACÓRDÃO, id 2\): parcialmente provido/);
  assert.equal(resultadosPorJulgamento(J, [[e1, F("RECURSO PROVIDO")], [e2, F("RECURSO PROVIDO")]]), "");
});

test("consulta pouco seletiva: aviso a partir de 1.000 documentos", () => {
  const d = (n) => ({ hits: { total: { value: n }, hits: [] } });
  assert.match(formatBusca(d(2110), "honorários", ["ACÓRDÃO"], "recentes", 1, 10), /Consulta pouco seletiva \(2110 documentos\)/);
  assert.doesNotMatch(formatBusca(d(400), "honorários", ["ACÓRDÃO"], "recentes", 1, 10), /pouco seletiva/);
});
