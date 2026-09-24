// v1.7.16 — o recibo diz o que NÃO é palavra do TJRO. Fixtures: recibos reais anonimizados
// (harness/_anonimizar.mjs). Medição sobre os recibos em disco: harness/medir-custodia.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { camposAlheios, norm1, atribuicoes } from "../server/custodia.js";
import { recibo } from "../server/lib.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/custodia-tjro.json", import.meta.url), "utf8")).documentos;
const [acordao, voto] = fx;
const dentro = (trecho, blocos) => blocos.some((b) => b.includes(trecho));

test("norm1 preserva o comprimento (posição no normalizado = posição no bruto)", () => {
  const s = "AÇÃO “Ementa” — nº 1ª Câmara Cível";
  assert.equal(norm1(s).length, s.length);
  assert.equal(norm1(s), "acao 'ementa' - no 1a camara civel");
});

test("atribuição no formato do JURIS, com parêntese aninhado em Relator(a)", () => {
  const t = norm1("…recurso desprovido. (APELAÇÃO CÍVEL, Processo nº 7000000-00.2020.822.0001, Tribunal de Justiça do " +
    "Estado de Rondônia, 2ª Câmara Cível, Relator(a) do Acórdão: Des. Fulano, Data de julgamento: 06/07/2023). Texto.");
  const [[a, b]] = atribuicoes(t);
  assert.ok(t.slice(a, b).startsWith("(apelacao civel") && t.slice(a, b).endsWith("06/07/2023)"));
  // parêntese de lei não é atribuição
  assert.deepEqual(atribuicoes(norm1("nos termos do art. 85, § 11 (Lei 13.105/2015), majoro.")), []);
});

test("VOTO: ementa do TJRO de OUTRO processo transcrita no voto vai para trechos_transcritos, em bruto", () => {
  const c = camposAlheios(voto.texto, voto.tipo);
  assert.ok(c.trechos_transcritos.length >= 2);
  for (const b of c.trechos_transcritos) assert.ok(voto.texto.includes(b), "recorte em bruto do próprio texto");
  assert.ok(dentro("A fraude praticada por terceiro que se passa por preposto da instituição caracteriza fortuito interno", c.trechos_transcritos));
  assert.ok(dentro("Quando não comprovada a contratação apta a justificar os descontos realizados", c.trechos_transcritos));
  // a fala do relator entre as transcrições fica de fora
  assert.ok(!dentro("Assim, evidenciada a falha na prestação do serviço, correta a sentença ao reconhecer o dever de indenizar", c.trechos_transcritos));
  assert.ok(!dentro("Todavia, razão não lhe assiste", c.trechos_transcritos));
  assert.equal(c.trecho_divergente, "");
  assert.equal(c.texto_voz_propria, undefined);   // VOTO não tem ementa da casa nem fecho
});

test("ACÓRDÃO com relator VENCIDO: o voto do relator é o trecho_divergente; o vencedor e a ementa da casa não", () => {
  const c = camposAlheios(acordao.texto, acordao.tipo);
  assert.match(c.trecho_divergente, /^VOTO DESEMBARGADOR RELATOR ORIGINÁRIO/);
  assert.ok(c.trecho_divergente.includes("Pelo exposto, nego provimento ao agravo. É como voto."));
  assert.ok(!c.trecho_divergente.includes("divirjo do eminente Relator"));
  // ementa da casa + fecho vão como voz própria e não entram em campo alheio
  assert.match(c.texto_voz_propria, /^EMENTA DIREITO PROCESSUAL CIVIL/);
  assert.match(c.texto_voz_propria, /acordam os Magistrados/);
  const tese = "A necessidade de maior dilação probatória inviabiliza a apreciação da matéria em sede de tutela de urgência";
  assert.ok(!dentro(tese, [...c.trechos_transcritos, c.trecho_divergente]));
  // o precedente que o vogal vencedor transcreve continua marcado como transcrição
  assert.ok(dentro("É necessária a comprovação dos requisitos legais previstos no artigo 300", c.trechos_transcritos));
});

test("ACÓRDÃO unânime: sem trecho_divergente; relator citando voto divergente de OUTRO processo não conta", () => {
  const t = "RELATÓRIO Relatado. VOTO DESEMBARGADOR FULANO Cito declaração de voto: “Com a devida vênia ao voto " +
    "divergente, acompanho o relator.” Pelo exposto, nego provimento. É como voto. DESEMBARGADOR BELTRANO De acordo. " +
    "EMENTA Apelação cível. Recurso desprovido. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os " +
    "Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE.";
  const c = camposAlheios(t, "ACÓRDÃO");
  assert.equal(c.trecho_divergente, "");
  assert.match(c.texto_voz_propria, /^EMENTA Apelação cível/);
});

test("ACÓRDÃO por maioria com vogal vencido: o voto do vogal é o trecho_divergente", () => {
  const t = "RELATÓRIO Relatado. VOTO DESEMBARGADOR FULANO Nego provimento. É como voto. DESEMBARGADOR BELTRANO " +
    "Peço vênia para divergir do relator, pois entendo que a prescrição é trienal. DESEMBARGADOR CICRANO Acompanho o " +
    "relator. EMENTA Apelação cível. Prescrição quinquenal. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam " +
    "os Magistrados da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO NOS TERMOS " +
    "DO VOTO DO RELATOR, POR MAIORIA, VENCIDO O DES. BELTRANO.";
  const c = camposAlheios(t, "ACÓRDÃO");
  assert.match(c.trecho_divergente, /^DESEMBARGADOR BELTRANO Peço vênia/);
  assert.ok(!c.trecho_divergente.includes("Prescrição quinquenal"));
});

test("EMENTA e VOTO VENCEDOR: sem campo alheio que acuse a voz da casa", () => {
  assert.deepEqual(camposAlheios("Apelação cível. Recurso provido.", "EMENTA"), { trechos_transcritos: [], trecho_divergente: "" });
  assert.equal(camposAlheios("Com a devida vênia, divirjo do relator. É como voto.", "VOTO VENCEDOR").trecho_divergente, "");
});

test("recibo(): leva os campos e nunca perde o texto se a custódia falhar", () => {
  const r = recibo({ id_processo_documento: 7, tipo: voto.tipo, ds_modelo_documento: voto.texto });
  assert.ok(Array.isArray(r.trechos_transcritos) && r.trechos_transcritos.length >= 2);
  assert.equal(typeof r.trecho_divergente, "string");
  assert.match(r.normalizacao, /em bruto/);
  assert.equal(recibo({ id_processo_documento: 8, tipo: null, ds_modelo_documento: "texto qualquer" }).texto, "texto qualquer");
});
