// v1.40.0 — cadeia do processo (o acórdão foi modificado depois?), "o que este acórdão cita" e semáforo sem verde. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { efeitoSobreAnterior, cadeiaDoProcesso, citadosPor, semaforo } from "../server/cadeia.js";
import { citacoesDoTexto } from "../server/precedentes.js";
import { _limparMemoParaTeste } from "../server/recibos.js";
import { recibo } from "../server/lib.js";

const NR = "70000013420248220001";
const fecho = (x) => ` ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, ${x}, À UNANIMIDADE. Porto Velho.`;
const doc = (texto, classe = "APELAÇÃO CÍVEL") => ({ texto, classe, tipo: "ACÓRDÃO" });

test("ED rejeitado / pedido do embargante / 'não se prestam a efeitos infringentes' NÃO modificam", () => {
  assert.equal(efeitoSobreAnterior(doc("RELATÓRIO Trata-se de embargos de declaração opostos pelo banco. Requer o acolhimento com efeitos infringentes. VOTO Os embargos não se prestam a conferir efeitos infringentes. Ante o exposto, rejeito os embargos." + fecho("EMBARGOS DE DECLARAÇÃO REJEITADOS"))), null);
});

test("ED acolhido que fixa honorários modifica; só para erro material não", () => {
  const e = efeitoSobreAnterior(doc("RELATÓRIO Trata-se de embargos de declaração opostos pela autora. VOTO Há omissão. Ante o exposto, acolho os embargos para integrar o acórdão e fixar os honorários advocatícios em 15% sobre o valor da condenação." + fecho("EMBARGOS DE DECLARAÇÃO ACOLHIDOS")));
  assert.equal(e && e.tipo, "embargos acolhidos que alteram o dispositivo");
  assert.equal(efeitoSobreAnterior(doc("RELATÓRIO Trata-se de embargos de declaração opostos. VOTO Ante o exposto, acolho os embargos com efeitos modificativos, exclusivamente para correção de erro material, com republicação." + fecho("EMBARGOS DE DECLARAÇÃO ACOLHIDOS"))), null);
});

test("retratação exercida modifica (mesmo com parêntese e 'art. 1.030' no meio); mantenho o acórdão não", () => {
  const e = efeitoSobreAnterior(doc("RELATÓRIO Retornam os autos da Vice-Presidência. VOTO Ante o exposto, em juízo de retratação (inciso II do art. 1.030 do CPC) e em observância ao Tema 793, voto no sentido de determinar ao juízo de origem que avalie os precatórios." + fecho("EM JUÍZO DE RETRATAÇÃO, DETERMINADO AO JUÍZO DE ORIGEM")));
  assert.equal(e && e.tipo, "retratação exercida");
  assert.equal(efeitoSobreAnterior(doc("VOTO Ante o exposto, não é caso de juízo de retratação: mantenho o acórdão." + fecho("ACÓRDÃO MANTIDO"))), null);
});

test("apelação NOVA do mesmo processo que reforma a SENTENÇA não é modificação do acórdão; voto vencido também não", () => {
  assert.equal(efeitoSobreAnterior(doc("RELATÓRIO Trata-se de recurso de apelação interposto contra a nova sentença. VOTO Diante do exposto, dou parcial provimento ao recurso de apelação para reduzir a indenização por danos morais para R$ 3.000,00." + fecho("RECURSO PARCIALMENTE PROVIDO"))), null);
  assert.equal(efeitoSobreAnterior(doc("RELATÓRIO Trata-se de embargos de declaração. VOTO DIVERGENTE Diante do exposto, divirjo da relatora e acolho os embargos, com efeitos infringentes, para majorar os honorários." + fecho("EMBARGOS DE DECLARAÇÃO REJEITADOS, VENCIDO O VOGAL"))), null);
});

test("cadeiaDoProcesso + semáforo: posterior que modifica acende 🔴; sem sinal é ⚪ e nunca verde", () => {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-cadeia-"));
  const g = (s) => { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); return r; };
  const a = g({ id_processo_documento: 1, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "10/01/2025", ds_classe_judicial: "APELAÇÃO CÍVEL", ds_modelo_documento: "RELATÓRIO Apelação. VOTO Nego provimento." + fecho("RECURSO NÃO PROVIDO") });
  g({ id_processo_documento: 2, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "10/03/2025", ds_classe_judicial: "EMBARGOS DE DECLARAÇÃO CÍVEL", ds_modelo_documento: "RELATÓRIO Trata-se de embargos de declaração opostos pela autora. VOTO Ante o exposto, acolho os embargos, atribuindo-lhes efeitos infringentes, para dar provimento à apelação e condenar o réu em danos morais." + fecho("EMBARGOS DE DECLARAÇÃO ACOLHIDOS") });
  const c = cadeiaDoProcesso(a, p);
  assert.equal(c.itens.length, 2);
  assert.equal(c.modificado.length, 1);
  assert.match(semaforo({ modificado: c.modificado }), /^🔴/);
  assert.match(semaforo({}), /^⚪ .*NÃO prova que está vigente/);
  assert.doesNotMatch(semaforo({ opostos: 2 }) + semaforo({}), /🟢/);
});

test("citadosPor: marca citação que só aparece dentro de trecho transcrito de outro julgado", () => {
  const r = { nr_processo: NR, texto: "VOTO Aplico o REsp 1.846.649/MA. Transcrevo: \"Apelação. Precedente 7000002-50.2023.8.22.0002.\" Fim.", trechos_transcritos: ["Apelação. Precedente 7000002-50.2023.8.22.0002."] };
  const c = citadosPor(r, citacoesDoTexto, fs.mkdtempSync(path.join(os.tmpdir(), "tjro-citados-")));
  assert.equal(c.nTj, 1); assert.equal(c.nSup, 1);
  assert.match(c.linhas.join("\n"), /7000002-50\.2023\.8\.22\.0002 · provavelmente dentro de trecho TRANSCRITO/);
});

test("edAcolhidoDepois: 'embargos providos' no fecho sem mudança achada vira 🟠 confira; rejeitados não", async () => {
  const { edAcolhidoDepois } = await import("../server/cadeia.js");
  assert.ok(edAcolhidoDepois({ texto: "VOTO Trato do ponto." + fecho("“EMBARGOS PROVIDOS, POR UNANIMIDADE.”") }));
  assert.ok(!edAcolhidoDepois({ texto: "VOTO Trato do ponto." + fecho("EMBARGOS DE DECLARAÇÃO REJEITADOS") }));
  assert.ok(!edAcolhidoDepois({ texto: "VOTO Trato do ponto." + fecho("EMBARGOS DE DECLARAÇÃO NÃO ACOLHIDOS") }));
  assert.match(semaforo({ conferir: [{}] }), /^🟠 .*embargos acolhidos\/providos depois/);
});

test("listaDeLeitura: mais citados do tema NÃO lidos, contados por processo citante distinto; já lidos à parte", async () => {
  const { listaDeLeitura } = await import("../server/cadeia.js");
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-leitura-"));
  const g = (s) => { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); };
  const NAO_LIDO = "0800003-59.2025.8.22.0000";
  g({ id_processo_documento: 1, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "10/01/2025", ds_modelo_documento: `Consignado em dobro. Ver ${NAO_LIDO} e 7000002-50.2023.8.22.0002.` + fecho("RECURSO NÃO PROVIDO") });
  g({ id_processo_documento: 2, nr_processo: "70000025020238220002", tipo: "ACÓRDÃO", dtjulgamento_str: "10/02/2025", ds_modelo_documento: `Consignado em dobro. Ver ${NAO_LIDO} e ${NAO_LIDO}.` + fecho("RECURSO PROVIDO") });
  const out = listaDeLeitura({ grupos: [["consignado"], ["dobro"]] }, citacoesDoTexto, p);
  assert.match(out, new RegExp(`${NAO_LIDO.replace(/\./g, "\\.")} — citado em 2 processo\\(s\\) por 2 relator`));
  assert.match(out, /Já lidos e citados pelo tema:\*\* 7000002-50\.2023\.8\.22\.0002 \(1\)/);
  assert.match(listaDeLeitura({}, citacoesDoTexto, p), /Informe o tema/);
});

test("cadeia agrupa por SESSÃO do fecho: acórdão reemitido (mesma sessão, outra data no índice) não é 'posterior'", () => {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-sessao-"));
  const g = (s) => { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); return r; };
  const f = " ACÓRDÃO Vistos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, EMBARGOS DE DECLARAÇÃO ACOLHIDOS, À UNANIMIDADE. Porto Velho, 19 de novembro de 2024.";
  const txt = "RELATÓRIO Trata-se de embargos de declaração opostos. VOTO Ante o exposto, acolho os embargos para fixar os honorários em 15% sobre o valor da condenação." + f;
  const a = g({ id_processo_documento: 11, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "22/11/2024", ds_modelo_documento: txt });
  g({ id_processo_documento: 12, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "27/11/2024", ds_modelo_documento: txt + " " });
  const c = cadeiaDoProcesso(a, p);
  assert.equal(c.itens.length, 1);
  assert.equal(c.modificado.length, 0);
});

test("listaDeLeitura: parágrafo-padrão do mesmo gabinete conta 1 relator e cai abaixo de citação por 2 relatores", async () => {
  const { listaDeLeitura } = await import("../server/cadeia.js");
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-relatores-"));
  const g = (s) => { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); };
  const BLOCO = "0800003-59.2025.8.22.0000", OUTRO = "7000002-50.2023.8.22.0002";
  const nrs = ["70000013420248220001", "70000040220258220001", "70000050720258220001"];
  g({ id_processo_documento: 1, nr_processo: nrs[0], tipo: "ACÓRDÃO", nome_relator_acordao: "PAULO KIYOCHI MORI", ds_modelo_documento: `Tarifa de avaliação. ${BLOCO}. ${OUTRO}.` });
  g({ id_processo_documento: 2, nr_processo: nrs[1], tipo: "ACÓRDÃO", nome_relator_acordao: "PAULO KIYOCHI MORI", ds_modelo_documento: `Tarifa de avaliação. ${BLOCO}.` });
  g({ id_processo_documento: 3, nr_processo: nrs[2], tipo: "ACÓRDÃO", nome_relator_acordao: "JOSE ANTONIO ROBLES", ds_modelo_documento: `Tarifa de avaliação. ${OUTRO}. ${BLOCO}.` });
  const out = listaDeLeitura({ grupos: [["tarifa"], ["avaliação"]] }, citacoesDoTexto, p);
  assert.match(out, /0800003-59\.2025\.8\.22\.0000 — citado em 3 processo\(s\) por 2 relator/);
  assert.match(out, /7000002-50\.2023\.8\.22\.0002 — citado em 2 processo\(s\) por 2 relator/);
});

test("norm1: vetor + join dá a mesma saída (acentos, aspas, travessões, espaços, emoji) e aguenta texto grande sem estourar", async () => {
  const { norm1 } = await import("../server/custodia.js");
  assert.equal(norm1("Ação “Câmara” – Rô\tÇ\n— 🔴 X"), "acao 'camara' - ro c - 🔴 x");
  const grande = "Apelação cível. Negativação indevida. ".repeat(60000);
  assert.equal(norm1(grande).length, grande.length);
});
