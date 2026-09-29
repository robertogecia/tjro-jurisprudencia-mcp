// v1.10.0 — buscar_recibos_tjro: busca local nos recibos, sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listarRecibos, recibosDoProcesso, reciboPorId, buscarRecibos, regexTermo, _limparMemoParaTeste } from "../server/recibos.js";
import { recibo } from "../server/lib.js";

const pastaTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tjro-recibos-"));
const grava = (pasta, r) => fs.writeFileSync(path.join(pasta, `${r.id_documento}.json`), JSON.stringify(r));
const FECHO = " EMENTA Apelação cível. Recurso desprovido. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 2ª Câmara Especial do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE.";

function pastaComTres() {
  const pasta = pastaTmp();
  grava(pasta, recibo({ id_processo_documento: 1, nr_processo: "70000000020258220001", tipo: "ACÓRDÃO", dtjulgamento_str: "10/01/2026", ds_classe_judicial: "APELAÇÃO CÍVEL", nome_relator_acordao: "FULANO", ds_orgao_julgador_colegiado: "3ª Câmara Cível",
    ds_modelo_documento: "RELATÓRIO. VOTO. Servidor cedido sem ônus para o cessionário faz jus à licença-prêmio por assiduidade; a cedência não interrompe o quinquênio." + FECHO }));
  grava(pasta, recibo({ id_processo_documento: 2, nr_processo: "70000000020258220001", tipo: "EMENTA", dtjulgamento_str: "10/01/2026", ds_modelo_documento: "Licença-prêmio. Servidor cedido. Cedência. Recurso desprovido." }));
  grava(pasta, recibo({ id_processo_documento: 3, nr_processo: "70000000120268220001", tipo: "ACÓRDÃO", dtjulgamento_str: "05/03/2026", ds_modelo_documento: "RELATÓRIO. VOTO. Dano moral por inscrição indevida em cadastro de inadimplentes; banco responde." + FECHO }));
  fs.writeFileSync(path.join(pasta, "norma-3438.json"), JSON.stringify({ id_norma: "3438", texto: "licença-prêmio norma" }));
  fs.writeFileSync(path.join(pasta, "lixo.json"), "{nao é json");
  return pasta;
}

test("listarRecibos ignora norma-*.json e arquivo corrompido; por id; por número (exato e prefixo)", () => {
  _limparMemoParaTeste();
  const pasta = pastaComTres();
  const todos = listarRecibos(pasta);
  assert.equal(todos.length, 3);
  assert.equal(reciboPorId("1", pasta).classe, "APELAÇÃO CÍVEL");
  assert.equal(reciboPorId("norma-3438", pasta), null);
  assert.equal(reciboPorId("42", pasta), null);
  assert.deepEqual(recibosDoProcesso("7000000-00.2025.8.22.0001", pasta).map((r) => String(r.id_documento)).sort(), ["1", "2"]);
  assert.equal(recibosDoProcesso("7000000-00.2025", pasta).length, 2);
  assert.equal(recibosDoProcesso("123", pasta).length, 0);
  assert.equal(listarRecibos(path.join(pasta, "nao-existe")).length, 0);
});

test("regexTermo: palavra inteira sem acento/caixa, prefixo com *, frase com espaço", () => {
  assert.ok(regexTermo("licença-prêmio").test("faz jus a licenca-premio por"));
  assert.ok(!regexTermo("cede").test("a cedencia nao interrompe"));
  assert.ok(regexTermo("ced*").test("a cedencia nao interrompe"));
  assert.ok(regexTermo("servidor cedido").test("o servidor cedido sem onus"));
  assert.ok(!regexTermo("servidor cedido").test("o servidor foi cedido"));
  assert.equal(regexTermo("  "), null);
});

test("buscarRecibos: todas as palavras (E), grupos (OU dentro, E entre), ordem por densidade, limite, zero nunca é 'não localizado'", () => {
  _limparMemoParaTeste();
  const pasta = pastaComTres();
  let out = buscarRecibos("licença-prêmio cedência", null, 10, pasta);
  assert.match(out, /^\*\*Recibos locais do TJRO — 2 de 3 documento\(s\) já lidos nesta máquina atendem/);
  assert.match(out, /NUNCA é "não localizado"/);
  // a ementa (mais densa) vem antes do acórdão; a classe do índice aparece no acórdão gravado na 1.10.0
  assert.ok(out.indexOf("id 2 ") < out.indexOf("id 1 "), out);
  assert.match(out, /1\. EMENTA · órgão não identificado · julgado em 10\/01\/2026/);
  assert.match(out, /2\. ACÓRDÃO · APELAÇÃO CÍVEL · 2ª Câmara Especial \(fecho\) · julgado em 10\/01\/2026 · Rel\. FULANO · 7000000-00\.2025\.8\.22\.0001 · id 1 · link https:\/\/juris\.tjro\.jus\.br/);
  assert.match(out, /custódia: 0 transcrição\(ões\)/);
  out = buscarRecibos("", [["negativação", "inscrição indevida"], ["banco"]], 10, pasta);
  assert.match(out, /1 de 3 documento/);
  assert.match(out, /id 3 /);
  out = buscarRecibos("licença-prêmio", null, 1, pasta);
  assert.match(out, /mais 1 recibo\(s\) atendem/);
  assert.match(buscarRecibos("inexistente", null, 10, pasta), /0 de 3 documento/);
  assert.match(buscarRecibos("", null, 10, pasta), /^BUSCA LOCAL NÃO REALIZADA/);
  assert.match(buscarRecibos("banco", null, 10, path.join(pasta, "vazia")), /nenhum recibo em/);
});

test("recibo() da 1.10.0 leva classe, relator e órgão do índice; ausentes viram null", () => {
  const r = recibo({ id_processo_documento: 9, tipo: "EMENTA", ds_modelo_documento: "x y z", ds_classe_judicial: "AGRAVO DE INSTRUMENTO", nome_relator_acordao: "BELTRANO", ds_orgao_julgador_colegiado: "1ª Câmara Cível" });
  assert.equal(r.classe, "AGRAVO DE INSTRUMENTO");
  assert.equal(r.relator_indice, "BELTRANO");
  assert.equal(r.orgao_indice, "1ª Câmara Cível");
  const v = recibo({ id_processo_documento: 10, tipo: "EMENTA", ds_modelo_documento: "x" });
  assert.equal(v.classe, null);
  assert.equal(v.relator_indice, null);
  assert.equal(v.orgao_indice, null);
});
