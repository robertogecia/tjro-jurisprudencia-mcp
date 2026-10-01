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

// v1.10.0 — a mesma conta, mostrada a quem lê o acórdão na hora.
import { faixasAlheias, linhaCustodia } from "../server/custodia.js";
import { formatInteiro } from "../server/lib.js";

test("faixasAlheias: posições batem com os recortes de camposAlheios", () => {
  const f = faixasAlheias(acordao.texto, acordao.tipo);
  const c = camposAlheios(acordao.texto, acordao.tipo);
  assert.deepEqual(f.transcritas.map(([a, b]) => acordao.texto.slice(a, b)), c.trechos_transcritos);
  assert.equal(acordao.texto.slice(f.divergente[0], f.divergente[1]), c.trecho_divergente);
  assert.equal(acordao.texto.slice(f.casaIni), c.texto_voz_propria);
  assert.deepEqual(faixasAlheias("Ementa. Recurso provido.", "EMENTA"), { transcritas: [], divergente: null, casaIni: 24, fecho: 24, ementaDaCasa: true });
});

test("linhaCustodia: conta transcrições, aponta voto que pode ser o vencido e a voz da casa; null para EMENTA/RELATÓRIO", () => {
  const l = linhaCustodia(acordao.texto, acordao.tipo);
  assert.match(l, /^Custódia do texto \(heurística; a mesma do recibo\): \d+ trecho\(s\) transcrito\(s\) de OUTROS julgados \(~\d+% do voto/);
  assert.match(l, /voto que pode ser o VENCIDO a partir de «VOTO DESEMBARGADOR RELATOR ORIGINÁRIO/);
  assert.match(l, /voz da casa \(ementa \+ fecho\) a partir de «EMENTA DIREITO PROCESSUAL CIVIL/);
  assert.match(l, /verificar_citacao_tjro/);
  assert.match(linhaCustodia("VOTO. Nego provimento porque sim. É como voto.", "VOTO"), /nenhuma transcrição de outro julgado detectada · sem sinal de voto divergente/);
  assert.equal(linhaCustodia("Ementa. Provido.", "EMENTA"), null);
  assert.equal(linhaCustodia("Relatório. Trata-se.", "RELATÓRIO"), null);
});

test("formatInteiro: a linha de custódia entra no ACÓRDÃO e no VOTO, não na EMENTA", () => {
  const src = (tipo, texto, id) => ({ tipo, nr_processo: "70000000000000000000", ds_classe_judicial: "APELAÇÃO CÍVEL", dtjulgamento_str: "27/03/2026",
    nome_relator_acordao: "X", ds_orgao_julgador_colegiado: "1ª Câmara Cível", ds_modelo_documento: texto, id_processo_documento: id });
  const t = formatInteiro({ hits: { total: { value: 3 }, hits: [{ _source: src("ACÓRDÃO", acordao.texto, 1) }, { _source: src("VOTO", voto.texto, 2) }, { _source: src("EMENTA", "Ementa. Provido.", 3) }] } }, "70000000000000000000");
  const blocos = t.split("\n## ");
  assert.match(blocos[1], /^ACÓRDÃO[\s\S]*Custódia do texto/);
  assert.match(blocos[2], /^VOTO[\s\S]*Custódia do texto/);
  assert.doesNotMatch(blocos[3], /Custódia do texto/);
});

// v1.10.1 — falso positivo real (recibo 35889208, EDcl na Apelação 7001808-38.2024.8.22.0018, 30/09/2026): um único
// bloco de 8.327 caracteres, do "Ementa ID …" do relatório até a lista de precedentes do fim do voto, engolia a
// fundamentação própria da relatora. Texto sintético com a mesma estrutura.
const EDCL_IDS =
  "RELATÓRIO Trata-se de embargos de declaração opostos pelo Banco X S.A. contra o acórdão proferido por esta 2ª Câmara Cível " +
  "na Sessão nº 1011 (ID 100, Relatório ID 101, Voto ID 102, Ementa ID 103), que, por unanimidade, deu parcial provimento à apelação. ";
const PRECEDENTES =
  "Este Tribunal de Justiça, em casos que envolvem fraude contratual comprovada por perícia grafotécnica, tem reiteradamente decidido que os " +
  "juros de mora sobre a repetição do indébito devem incidir desde o evento danoso.( Apelação Cível nº 7000998-63.2024.8.22.0018, Rel. Des. Fulano, " +
  "j. 22/10/2025; Apelação Cível nº 7004855-45.2023.8.22.0021, Rel. Des. Beltrano, j. 26/09/2024; Apelação Cível nº 7000353-75.2023.8.22.0017, " +
  "Rel. Des. Cicrano, j. 13/05/2025) ";
const PROPRIA =
  "O argumento do embargante de que a mera disponibilização de crédito na conta do autor atrairia a aplicação do art. 405 do Código Civil " +
  "não se sustenta diante dos fatos comprovados nos autos, porque a contratação foi fraudulenta e o dano é anterior ao pedido. ";
const FECHO_EDCL =
  "EMENTA Embargos de declaração. Rejeitados. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 2ª Câmara Cível " +
  "do Tribunal de Justiça do Estado de Rondônia, em, EMBARGOS REJEITADOS, À UNANIMIDADE.";

test("'Ementa ID nnn' do relatório não abre bloco transcrito; lista de precedentes do relator só marca o parêntese", () => {
  const texto = EDCL_IDS + "VOTO Sem omissão. " + PROPRIA + PRECEDENTES + "Ante o exposto, rejeito os embargos. É como voto. " + FECHO_EDCL;
  const c = camposAlheios(texto, "ACÓRDÃO");
  assert.equal(c.trechos_transcritos.length, 1);
  assert.ok(c.trechos_transcritos[0].length < 400, `bloco de ${c.trechos_transcritos[0].length} caracteres`);
  assert.match(c.trechos_transcritos[0], /^\( ?Apelação Cível nº 7000998-63/);
  assert.ok(c.trechos_transcritos[0].endsWith("j. 13/05/2025)"));
  const alheio = [...c.trechos_transcritos, c.trecho_divergente].join(" ");
  assert.ok(!alheio.includes("O argumento do embargante de que a mera disponibilização"), "fundamentação própria marcada como alheia");
  assert.ok(!alheio.includes("Este Tribunal de Justiça, em casos que envolvem fraude"), "frase do relator marcada como alheia");
  assert.ok(!alheio.includes("ID 103"), "cabeçalho de IDs marcado como alheio");
  // a cauda da casa continua sendo só ementa + fecho
  assert.match(c.texto_voz_propria, /^EMENTA Embargos de declaração\. Rejeitados\./);
  const f = faixasAlheias(texto, "ACÓRDÃO");
  assert.equal(f.transcritas.length, 1);
});

test("ementa transcrita de verdade continua marcada inteira, mesmo com 'Ementa:' e parêntese de UM julgado", () => {
  const texto = "VOTO O relator entende. Nesse sentido, julgado deste Tribunal — Ementa: Apelação cível. Consumidor. Fraude bancária. " +
    "Responsabilidade objetiva. Recurso desprovido. (Apelação Cível, Processo nº 7000000-00.2020.8.22.0001, Relator(a) do Acórdão: Des. Fulano, Data de julgamento: 06/07/2023). " +
    "Assim, nego provimento.";
  const c = camposAlheios(texto, "VOTO");
  assert.equal(c.trechos_transcritos.length, 1);
  assert.match(c.trechos_transcritos[0], /Apelação cível\. Consumidor\. Fraude bancária\./);
  assert.ok(!c.trechos_transcritos[0].includes("Assim, nego provimento"));
});
