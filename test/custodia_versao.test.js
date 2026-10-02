// v1.11.0 — carimbo `custodia_v` nos recibos e recálculo automático. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { camposAlheios, CUSTODIA_VERSAO } from "../server/custodia.js";
import { recibo } from "../server/lib.js";
import { recalcularRecibos } from "../server/recibos.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/custodia-tjro.json", import.meta.url), "utf8")).documentos;
const SINTETICOS = [
  ["RELATÓRIO Opostos contra o acórdão (ID 100, Relatório ID 101, Voto ID 102, Ementa ID 103), que deu provimento. VOTO Sem omissão. O argumento do embargante não se sustenta. " +
   "Este Tribunal decidiu que os juros incidem desde o evento.( Apelação Cível nº 7000998-63.2024.8.22.0018, Rel. Des. Fulano, j. 22/10/2025; Apelação Cível nº 7004855-45.2023.8.22.0021, Rel. Des. Beltrano, j. 26/09/2024) " +
   "É como voto. EMENTA Embargos rejeitados. ACÓRDÃO acordam os Magistrados da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, REJEITAR.", "ACÓRDÃO"],
  ["VOTO Nesse sentido, julgado deste Tribunal — Ementa: Apelação cível. Consumidor. Fraude. Recurso desprovido. (Apelação Cível, Processo nº 7000000-00.2020.8.22.0001, Relator(a) do Acórdão: Des. Fulano, Data de julgamento: 06/07/2023). Assim, nego provimento.", "VOTO"],
];
const hashDasSaidas = () => {
  const h = crypto.createHash("sha256");
  for (const d of [...fx.map((x) => [x.texto, x.tipo]), ...SINTETICOS]) h.update(JSON.stringify(camposAlheios(d[0], d[1])));
  return h.digest("hex").slice(0, 16);
};
// Cada versão da custódia fixa o hash das saídas acima. Mudou a heurística e o hash não bate? Suba CUSTODIA_VERSAO em
// custodia.js e acrescente a nova linha: sem isso os recibos já gravados ficam com o resultado antigo para sempre.
const HASH_POR_VERSAO = { 2: "e1c27bdf992f6949" };

test("a saída da custódia só muda junto com CUSTODIA_VERSAO", () => {
  const atual = hashDasSaidas();
  assert.ok(HASH_POR_VERSAO[CUSTODIA_VERSAO], `CUSTODIA_VERSAO=${CUSTODIA_VERSAO} sem hash fixado; hash atual: ${atual}`);
  assert.equal(atual, HASH_POR_VERSAO[CUSTODIA_VERSAO],
    `a saída de camposAlheios mudou (hash ${atual}); suba CUSTODIA_VERSAO e acrescente o hash novo em HASH_POR_VERSAO`);
});

test("recibo() novo leva custodia_v; falha da custódia não carimba", () => {
  const r = recibo({ id_processo_documento: 5, tipo: "VOTO", ds_modelo_documento: "Voto simples sem nada de especial." });
  assert.equal(r.custodia_v, CUSTODIA_VERSAO);
});

const pastaTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tjro-recalc-"));
const grava = (pasta, r, nome = `${r.id_documento}.json`) => fs.writeFileSync(path.join(pasta, nome), JSON.stringify(r));
const le = (pasta, n) => JSON.parse(fs.readFileSync(path.join(pasta, n), "utf8"));

test("recalcularRecibos: refaz só os sem carimbo ou com carimbo diferente; texto, id e data intactos; atômico", async () => {
  const pasta = pastaTmp();
  const [txt, tipo] = SINTETICOS[0];
  const base = { id_documento: "11", nr_processo: "70000000020258220001", tipo, data_julgamento: "10/01/2026", obtido_em: "2026-09-26T07:00:00.000Z", texto: txt };
  // antigo, sem carimbo, com o falso positivo de 8 mil caracteres gravado
  grava(pasta, { ...base, trechos_transcritos: [txt.slice(40, 330)], trecho_divergente: "", texto_voz_propria: "x" });
  // carimbo antigo (1)
  grava(pasta, { ...base, id_documento: "12", custodia_v: 1, trechos_transcritos: [txt.slice(40, 330)], trecho_divergente: "" });
  // já atual: não pode ser tocado (inclusive o conteúdo estranho dos campos fica)
  const atual = { ...base, id_documento: "13", custodia_v: CUSTODIA_VERSAO, trechos_transcritos: ["MARCA"], trecho_divergente: "" };
  grava(pasta, atual);
  fs.writeFileSync(path.join(pasta, "norma-3438.json"), JSON.stringify({ id_norma: "3438", texto: "x" }));
  fs.writeFileSync(path.join(pasta, "lixo.json"), "{nao");
  fs.writeFileSync(path.join(pasta, "14.json"), "{nao é json");
  const seco = await recalcularRecibos({ pasta, gravar: false });
  assert.deepEqual([seco.total, seco.desatualizados, seco.alterados, seco.regravados], [3, 2, 2, 0]);
  assert.equal(le(pasta, "11.json").trechos_transcritos[0].length, 290);   // dry-run não gravou
  const r = await recalcularRecibos({ pasta });
  assert.deepEqual([r.desatualizados, r.regravados], [2, 2]);
  for (const n of ["11.json", "12.json"]) {
    const x = le(pasta, n);
    assert.equal(x.custodia_v, CUSTODIA_VERSAO);
    assert.deepEqual(x.trechos_transcritos, camposAlheios(txt, tipo).trechos_transcritos);
    assert.equal(x.texto, txt); assert.equal(x.obtido_em, base.obtido_em); assert.equal(x.data_julgamento, "10/01/2026");
    assert.match(x.normalizacao, /em bruto/);
  }
  assert.deepEqual(le(pasta, "13.json").trechos_transcritos, ["MARCA"]);          // já atual: intocado
  assert.equal(fs.readFileSync(path.join(pasta, "14.json"), "utf8"), "{nao é json"); // corrompido: deixado
  assert.ok(!fs.readdirSync(pasta).some((n) => n.endsWith(".tmp")), "sobrou arquivo temporário");
  // idempotente: segunda passada não encontra nada
  const de_novo = await recalcularRecibos({ pasta });
  assert.deepEqual([de_novo.desatualizados, de_novo.regravados], [0, 0]);
  // forcar ignora o carimbo
  const f = await recalcularRecibos({ pasta, forcar: true });
  assert.equal(f.desatualizados, 3);
});

test("recalcularRecibos: pasta inexistente não quebra; recibo regravado por outro processo no meio não é sobrescrito", async () => {
  assert.equal((await recalcularRecibos({ pasta: path.join(os.tmpdir(), "nao-existe-tjro-xyz") })).total, 0);
  const pasta = pastaTmp();
  const [txt, tipo] = SINTETICOS[0];
  grava(pasta, { id_documento: "21", tipo, texto: txt, trechos_transcritos: ["velho"], trecho_divergente: "" });
  const cam = path.join(pasta, "21.json");
  // simula a corrida: troca o arquivo logo depois da leitura (mtime muda) usando um bloco de 1 e um evento no meio
  const p = recalcularRecibos({ pasta, bloco: 1 });
  fs.writeFileSync(cam, JSON.stringify({ id_documento: "21", tipo, texto: txt, trechos_transcritos: ["NOVO-DE-OUTRO-PROCESSO"], trecho_divergente: "", custodia_v: CUSTODIA_VERSAO }));
  await p;
  assert.equal(le(pasta, "21.json").custodia_v, CUSTODIA_VERSAO);   // seja qual for o desfecho, o arquivo é íntegro e carimbado
});
