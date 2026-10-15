// v1.36.0 — distinguishing, superação, natureza do julgado e leading case. Sem rede, textos sintéticos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { naturezaDoJulgado, citacoesDoTexto, leadingCase, compararFatos, frasesDePrecedente, termosDosFatos } from "../server/precedentes.js";

test("natureza: IRDR com tese é precedente qualificado; câmara é persuasiva e aponta o vinculante; 1º grau não é precedente", () => {
  assert.match(naturezaDoJulgado({ classe: "INCIDENTE DE RESOLUÇÃO DE DEMANDAS REPETITIVAS", tipo: "ACÓRDÃO" }, "Fixa-se a seguinte tese jurídica: ..."), /PRECEDENTE QUALIFICADO, IRDR/);
  assert.match(naturezaDoJulgado({ classe: "INCIDENTE DE RESOLUÇÃO DE DEMANDAS REPETITIVAS", tipo: "ACÓRDÃO" }, "Admite-se o incidente."), /sem tese fixada/);
  assert.match(naturezaDoJulgado({ classe: "APELAÇÃO CÍVEL", tipo: "ACÓRDÃO" }, "Aplica-se o Tema 1061 do STJ."), /JURISPRUDÊNCIA \(persuasiva\).*Tema 1061; o que vincula é ele/);
  assert.match(naturezaDoJulgado({ classe: "PROCEDIMENTO COMUM", tipo: "SENTENÇA" }, "Julgo procedente."), /1º grau/);
});

test("citações e leading case contam processos distintos que citam", () => {
  assert.deepEqual(citacoesDoTexto("Veja 7001234-56.2023.8.22.0001 e REsp 1.846.649/MA."), ["7001234-56.2023.8.22.0001", "REsp 1846649/MA"]);
  const d = (nr, t, classe = "APELAÇÃO CÍVEL") => ({ nr_processo: nr, texto: t, classe, id_documento: nr.slice(0, 3) });
  const lc = leadingCase([d("70000010000000000000", "cita 7001234-56.2023.8.22.0001"), d("70000020000000000000", "cita 7001234-56.2023.8.22.0001"),
    d("08000010000000000000", "Fixa-se a seguinte tese: X.", "INCIDENTE DE RESOLUÇÃO DE DEMANDAS REPETITIVAS")]);
  assert.equal(lc.qualificados.length, 1);
  assert.deepEqual(lc.maisCitados[0], ["7001234-56.2023.8.22.0001", 2]);
});

test("comparar fatos: frase do julgado para o termo presente; ausente listado", () => {
  const t = "RELATÓRIO Trata-se de apelação. VOTO O aposentado sofreu descontos no benefício sem contrato assinado. Recurso provido.";
  const c = compararFatos("descontos em benefício de aposentado analfabeto", t);
  assert.ok(c.expressoes.some((p) => /descontos … benefício/.test(p.termo) && /sofreu descontos/.test(p.frase) && p.onde === "voto"));
  assert.ok(c.ausentes.includes("analfabeto"));
  assert.deepEqual(termosDosFatos("o banco e o banco"), ["banco"]);
});

test("frases candidatas: ressalva, mudança, distinção; argumento da parte não conta", () => {
  const t = "RELATÓRIO x. VOTO Ressalvado meu entendimento pessoal, acompanho a Câmara. Revejo meu entendimento anterior sobre o tema. " +
    "O Tema 1061 não se aplica ao caso, pois a hipótese é diversa. A apelante defende a necessidade de distinguishing em relação à Súmula 298. Recurso provido.";
  const f = frasesDePrecedente(t);
  assert.equal(f.ressalva.length, 1);
  assert.match(f.mudanca[0], /Revejo meu entendimento/);
  assert.match(f.distincao[0], /Tema 1061 não se aplica/);
  assert.ok(!f.distincao.some((x) => /apelante defende/.test(x)));
});

test("comparar fatos (teste ao vivo de 15/10/2026): palavra curta genérica não pesca frase; voto antes do relatório", () => {
  const t = "RELATÓRIO O autor alega cartão de crédito consignado sem informação. Houve prazo comum. A FEBRABAN ingressou. " +
    "VOTO O banco contratou cartão de crédito com reserva de margem consignável sem informar o consumidor. Recurso provido.";
  const c = compararFatos("aposentado contratou empréstimo comum, mas o banco lançou cartão de crédito com reserva de margem", t);
  const cc = c.expressoes.find((e) => /cartão … crédito/.test(e.termo));
  assert.equal(cc.onde, "voto");
  assert.match(cc.frase, /reserva de margem/);
  assert.ok(!c.presentes.some((p) => p.termo === "comum" || p.termo === "banco"));
});

test("verbo no pretérito não casa com substantivo de mesma raiz", () => {
  const c = compararFatos("contratou empréstimo", "RELATÓRIO x. VOTO A conversão do contrato em empréstimo consignado. Fim.");
  assert.equal(c.expressoes.length, 0);
});
