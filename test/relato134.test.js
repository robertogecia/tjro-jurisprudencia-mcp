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

test("artigo com algarismos trocados: avisa; CPC acima de 1.072 não existe; diplomas diferentes não", () => {
  assert.match(artigosTrocados("nos termos do art. 1.103, § 3º, III, do CPC. Ementa: art. 1.013, § 3º, do CPC."), /art\. 1\.103 do CPC não existe/);
  assert.match(artigosTrocados("art. 1.583 do Código Civil e 550 do CPC; § 5º do art. 1.538 do CC/02"), /ALGARISMOS TROCADOS/);
  assert.doesNotMatch(artigosTrocados("art. 1.583 do Código Civil e 550 do CPC; § 5º do art. 1.538 do CC/02"), /não existe/);
  assert.equal(artigosTrocados("art. 1.022 do CPC e art. 1.220 do Código Civil"), "");
  assert.equal(artigosTrocados("art. 1.022 do CPC e art. 489 do CPC"), "");
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
