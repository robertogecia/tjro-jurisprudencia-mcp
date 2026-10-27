// 1.41.11 (não publicada) — itens 8, 11, 12 e 13 do diagnóstico de uso de 26/10/2026. Sem rede, sem portal: recibos sintéticos em
// os.tmpdir(); o inteiro teor é formatado a partir de um retorno simulado do índice.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { distinguir, LIMIAR_RESULTADO_OPOSTO } from "../server/precedentes.js";
import { buildBuscaBody, formatInteiro, formatTriagem, grafiaJuizSentenca } from "../server/lib.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

// ------------------------------------------------------------------------------------------------ item 8 ---
// Vocabulário inventado: A e B têm o mesmo núcleo (mesmo tema); C partilha 14 de 40 palavras (semelhança ~0,29: "mesma palavra").
const W = (p, a, b) => Array.from({ length: b - a }, (_, i) => `${p}${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}vocabulo`).join(" ");
const em = (pal, res) => `EMENTA I. CASO EM EXAME 1. ${pal} II. QUESTÃO EM DISCUSSÃO 2. questao. III. RAZÕES DE DECIDIR 3. razoes. IV. DISPOSITIVO E TESE 4. Recurso ${res}. Acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO ${res.toUpperCase()} À UNANIMIDADE.`;
function pastaDistinguir(extra = []) {
  _limparMemoParaTeste();
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-2610c-dist-"));
  const w = (id, nr, data, texto) => fs.writeFileSync(path.join(d, `${id}.json`), JSON.stringify({ id_documento: id, nr_processo: nr, tipo: "ACÓRDÃO", data_julgamento: data, classe: "APELAÇÃO CÍVEL", texto }));
  w("500", "70000010120208220001", "05/01/2024", em(W("x", 0, 40), "desprovido"));
  w("501", "70000020120208220001", "05/06/2024", em(W("x", 0, 40), "provido"));
  w("502", "70000030120208220001", "05/07/2024", em(W("x", 0, 14) + " " + W("y", 0, 26), "provido"));
  for (const [id, nr, data, t] of extra) w(id, nr, data, t);
  return d;
}
test("(8) distinguir resumo: lista os ids do 'mesmo tema, resultado oposto' com a semelhança de 0 a 1, e separa a 'mesma palavra'", () => {
  const pasta = pastaDistinguir();
  const o = distinguir({ id_documento: "500", pasta, formato: "resumo" });
  assert.match(o, /- Mesmo tema, resultado oposto \(1; semelhança de 0 a 1\): 501 \(05\/06\/2024 · provido · semelhança 1\.00\)/);
  assert.match(o, /- Mesma palavra, resultado oposto, assunto pode ser outro \(1; fora do semáforo\): 502 \(05\/07\/2024 · provido · semelhança 0\.2\d\)/);
  assert.match(o, /1 do mesmo tema com resultado oposto/);
  assert.match(o, /Situação \(indício, sem verde\): 🟠 ler antes de citar: 1 do mesmo tema com resultado oposto/);
});
test("(8) só a 'mesma palavra' (semelhança abaixo do corte) não acende o 🟠", () => {
  assert.ok(LIMIAR_RESULTADO_OPOSTO >= 0.3);
  const pasta = pastaDistinguir();
  fs.unlinkSync(path.join(pasta, "501.json"));
  _limparMemoParaTeste();
  const o = distinguir({ id_documento: "500", pasta, formato: "resumo" });
  assert.match(o, /0 do mesmo tema com resultado oposto \(em regra, fato diferente\); 1 só com a mesma palavra \(fora do semáforo\)/);
  assert.doesNotMatch(o, /Situação[^\n]*🟠/);
  assert.match(o, /Situação[^\n]*⚪/);
});
test("(8) resumo com muitos opostos: teto de 10 ids e a contagem do que ficou de fora", () => {
  const extra = Array.from({ length: 12 }, (_, i) => [String(600 + i), `7000${String(100 + i)}0120208220001`, `0${1 + (i % 9)}/08/2024`, em(W("x", 0, 40), "provido")]);
  const pasta = pastaDistinguir(extra);
  const o = distinguir({ id_documento: "500", pasta, formato: "resumo" });
  const linha = o.split("\n").find((l) => l.startsWith("- Mesmo tema, resultado oposto"));
  assert.ok(linha, o);
  assert.match(linha, /\(13; semelhança de 0 a 1\)/);
  assert.equal((linha.match(/semelhança 1\.00/g) || []).length, 10);
  assert.match(linha, /e mais 3 \(formato "completo"\)/);
});

// ----------------------------------------------------------------------------------------------- item 11 ---
test("(11) juiz de 1º grau: grafia normalizada (CAIXA ALTA, sem acento) no filtro da SENTENÇA; 2º grau intacto", () => {
  const base = { consulta: "", grupos: [["cobrança"]], pagina: 1, porPagina: 5, ordenacao: "recentes" };
  assert.equal(grafiaJuizSentenca("  Gleucival  Zeed Estevão "), "GLEUCIVAL ZEED ESTEVAO");
  const a = buildBuscaBody({ ...base, tipo: ["SENTENÇA"], relator: "Gleucival Zeed Estevão" });
  const b = buildBuscaBody({ ...base, tipo: ["SENTENÇA"], relator: "GLEUCIVAL ZEED ESTEVAO" });
  assert.equal(a.fields["ds_nome.raw"], "GLEUCIVAL ZEED ESTEVAO");
  assert.equal(b.fields["ds_nome.raw"], "GLEUCIVAL ZEED ESTEVAO");
  const c = buildBuscaBody({ ...base, tipo: ["ACÓRDÃO"], relator: "Alexandre Miguel" });
  assert.equal(c.fields["nome_relator_acordao.raw"], "Alexandre Miguel");
});

// ------------------------------------------------------------------------------------------- itens 12/13 ---
const NR = "70000013420248220001";
const hit = (id, tipo, txt, data = "10/03/2025") => ({ _source: { id_processo_documento: id, nr_processo: NR, tipo, dtjulgamento_str: data, ds_classe_judicial: "APELAÇÃO CÍVEL", ds_orgao_julgador_colegiado: "3ª Câmara Cível", nome_relator_acordao: "Fulano de Tal", ds_modelo_documento: txt } });
const semFecho = { hits: { total: { value: 2 }, hits: [hit(901, "VOTO", "VOTO O recurso é tempestivo. Nego provimento. É como voto."), hit(902, "EMENTA", "EMENTA I. CASO EM EXAME 1. Apelação. IV. DISPOSITIVO 4. Recurso desprovido.")] } };
const acordaoLocal = { id_documento: "900", nr_processo: NR, tipo: "ACÓRDÃO", data_julgamento: "10/03/2025", texto: "RELATÓRIO x. VOTO Nego provimento. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE." };
test("(12) documento sem fecho: usa o fecho de outro documento do mesmo número e data nos recibos locais, marcado", () => {
  const o = formatInteiro(semFecho, NR, { locais: [acordaoLocal] });
  assert.match(o, /1ª Câmara Cível \(⚠️ declarado no fecho do acórdão; o índice diz 3ª Câmara Cível\) \(fecho tirado do documento 900, ACÓRDÃO do mesmo número e data, recibo local\)/);
  assert.match(o, /🏛️ 10\/03\/2025: nenhum documento desta resposta tem fecho; câmara pelo fecho tirado do documento 900/);
  const t = formatTriagem(semFecho, NR, { locais: [acordaoLocal] });
  assert.match(t, /1ª Câmara Cível \(fecho tirado do documento 900, ACÓRDÃO do mesmo número e data, recibo local\)/);
});
test("(12) sem fecho em lugar nenhum: não deduz câmara, diz para citar sem câmara; recibo de OUTRA data não serve", () => {
  const outraData = { ...acordaoLocal, data_julgamento: "11/04/2025" };
  const o = formatInteiro(semFecho, NR, { locais: [outraData] });
  assert.doesNotMatch(o, /fecho tirado do documento/);
  assert.match(o, /sem fecho \("acordam os Magistrados…"\) em nenhum documento deste julgamento.*não deduza a câmara pelo relator nem pela data/);
  assert.doesNotMatch(o, /1ª Câmara Cível/);
  // retrocompatível: sem recibos locais, mesma mensagem
  assert.match(formatInteiro(semFecho, NR), /sem fecho \("acordam os Magistrados…"\) em nenhum documento/);
});
test("(13) uma linha por julgamento: id do acórdão · id da ementa · id do voto (o que só está no recibo local vem marcado)", () => {
  const o = formatInteiro(semFecho, NR, { locais: [acordaoLocal] });
  assert.match(o, /- 10\/03\/2025: id do acórdão 900 \(recibo local\) · id da ementa 902 · id do voto 901/);
  const s = formatInteiro(semFecho, NR);
  assert.match(s, /- 10\/03\/2025: id do acórdão — · id da ementa 902 · id do voto 901/);
});
