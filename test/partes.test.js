// "Favorável a quem" (partes.js) e julgados similares (similares.js) — sem rede.
// Fixture: 92 cabeçalhos+fechos de acórdãos reais do cache (26/09/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extrairPartes, extrairRecorrente, maisDeUmRecurso, linhaFavoravel } from "../server/partes.js";
import { ordenarPorSimilaridade, notaSimilares, tokens } from "../server/similares.js";
import { resultadoDe, rotuloDoConjunto, formatInteiro } from "../server/lib.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(fs.readFileSync(path.join(aqui, "fixtures", "acordaos-partes.json"), "utf8"));
const corpoDe = (o) => `${o.cabeca} ... ${o.fecho}`;
const acha = (nr) => FX.find((o) => o.nr_processo === nr);

test("extrairPartes: Polo Ativo/Passivo do cabeçalho; sem cabeçalho = null; SEM/DES não é parte", () => {
  const o = FX.find((o) => /Polo Ativo: SHIRLEY/.test(o.cabeca));
  assert.deepEqual(extrairPartes(corpoDe(o)), { poloAtivo: "SHIRLEY DE JESUS MONTEIRO", poloPassivo: "MASSA FALIDA DO BANCO CRUZEIRO DO SUL, B6 ASSIGNEE ASSETS LTDA" });
  assert.deepEqual(extrairPartes("RELATÓRIO Trata-se de recurso"), { poloAtivo: null, poloPassivo: null });
  assert.deepEqual(extrairPartes("Polo Ativo: SEM ADVOGADO Polo Passivo: DESEMBARGADOR X"), { poloAtivo: null, poloPassivo: "DESEMBARGADOR X" });
  assert.equal(extrairPartes("Polo Ativo: DES EMBARGADO").poloAtivo, null);
});

test("extrairRecorrente: 'interposto por X', 'X interpôs', 'opostos por X'; descrição genérica não é nome", () => {
  assert.equal(extrairRecorrente("RELATÓRIO Trata-se de recurso de apelação interposto por Shirley de Jesus Monteiro, pleiteando a reforma"), "Shirley de Jesus Monteiro");
  assert.equal(extrairRecorrente("RELATÓRIO ESTADO DE RONDÔNIA interpôs recurso de apelação em face da sentença"), "ESTADO DE RONDÔNIA");
  assert.equal(extrairRecorrente("RELATÓRIO Trata-se de Embargos de Declaração opostos pelo ESTADO DE RONDÔNIA em face da decisão"), "ESTADO DE RONDÔNIA");
  assert.equal(extrairRecorrente("RELATÓRIO Trata-se de recurso inominado interposto pelo autor/servidor, em relação à sentença"), null);
  assert.equal(extrairRecorrente("RELATÓRIO Trata-se de recurso adesivo interposto pela empresa apelada contra"), null);
  assert.equal(extrairRecorrente("Relatório dispensado, nos moldes do art. 38 da Lei nº 9.099/95. VOTO Conheço do recurso"), null);
  // nome com "S.A" não é cortado no ponto
  assert.equal(extrairRecorrente("RELATÓRIO Trata-se de apelação interposta por Banco Bradesco S.A contra a sentença"), "Banco Bradesco S.A");
});

test("maisDeUmRecurso: recurso adesivo, ambas as partes, 'X e Y'", () => {
  assert.equal(maisDeUmRecurso("O Estado interpôs apelação e a Sociedade, recurso adesivo", "Estado"), true);
  assert.equal(maisDeUmRecurso("Trata-se de apelações interpostas por ambas as partes", null), true);
  assert.equal(maisDeUmRecurso("Trata-se de apelação interposta por Banco BMG S/A e Alaíde Soares", "Banco BMG S/A e Alaíde Soares"), true);
  assert.equal(maisDeUmRecurso("Trata-se de apelação interposta por Banco BMG S/A", "Banco BMG S/A"), false);
});

test("linhaFavoravel: provido = favorável a quem recorreu; desprovido = contrário, e diz o outro polo", () => {
  const o = FX.find((o) => /Polo Ativo: SHIRLEY/.test(o.cabeca));
  const corpo = corpoDe(o);
  const r = rotuloDoConjunto(resultadoDe(corpo), o.classe);
  assert.equal(r, "DESPROVIDO");
  const l = linhaFavoravel(corpo, r);
  assert.match(l, /^Partes e lado \(heurística sobre o texto; confira no dispositivo\): Polo Ativo: SHIRLEY DE JESUS MONTEIRO · Polo Passivo: MASSA FALIDA/);
  assert.match(l, /Recorreu \(pelo relatório\): Shirley de Jesus Monteiro → resultado CONTRÁRIO a quem recorreu \(Shirley de Jesus Monteiro\), favorável a MASSA FALIDA DO BANCO CRUZEIRO DO SUL, B6 ASSIGNEE ASSETS LTDA$/);
  const p = FX.find((o) => /Polo Ativo: MUNICIPIO DE BURITIS/.test(o.cabeca));
  const lp = linhaFavoravel(corpoDe(p), rotuloDoConjunto(resultadoDe(corpoDe(p)), p.classe));
  assert.match(lp, /→ resultado FAVORÁVEL a quem recorreu \(Município de Buritis\)$/);
  // parcial
  const q = FX.find((o) => /Polo Ativo: ZILDA DILVA/.test(o.cabeca));
  assert.match(linhaFavoravel(corpoDe(q), "PARCIAL"), /PARCIALMENTE favorável a quem recorreu \(ZILDA DILVA BATISTA\); o que foi e o que não foi está no dispositivo$/);
  // sem resultado: pede o dispositivo
  assert.match(linhaFavoravel(corpoDe(q), null), /sem resultado identificável no fecho: leia o dispositivo$/);
  // sem partes nem recorrente: null
  assert.equal(linhaFavoravel("Relatório dispensado. VOTO. RECURSO PROVIDO", "PROVIDO"), null);
});

test("linhaFavoravel: recurso duplo não arrisca o lado; recorrente ausente só lista as partes", () => {
  const o = FX.find((o) => /Polo Ativo: BANCO BRADESCO, SERGIO BUENO/.test(o.cabeca));
  const l = linhaFavoravel(corpoDe(o), "PROVIDO");
  assert.match(l, /mais de um recurso \(ou recorrentes em conjunto\): o lado favorecido depende de cada recurso — leia o dispositivo$/);
  assert.doesNotMatch(l, /FAVORÁVEL a quem/);
  const s = FX.find((o) => /Polo Ativo: ELIAS FERNANDES/.test(o.cabeca)); // "Relatório dispensado"
  const ls = linhaFavoravel(corpoDe(s), "DESPROVIDO");
  assert.match(ls, /Quem recorreu: não identificado no relatório$/);
});

test("cobertura na amostra de 92 acórdãos: linha em 80+, lado em 45+, e nunca lado com recurso duplo", () => {
  let linhas = 0, lados = 0;
  for (const o of FX) {
    const corpo = corpoDe(o);
    const l = linhaFavoravel(corpo, rotuloDoConjunto(resultadoDe(corpo), o.classe));
    if (!l) continue;
    linhas++;
    if (/→/.test(l)) {
      lados++;
      assert.doesNotMatch(l, /mais de um recurso/);
    }
  }
  assert.ok(linhas >= 80, `linhas: ${linhas}`);
  assert.ok(lados >= 45, `lados: ${lados}`);
});

test("formatInteiro: a linha de partes entra só no ACÓRDÃO, junto dos avisos", () => {
  const o = FX.find((o) => /Polo Ativo: SHIRLEY/.test(o.cabeca));
  const src = (tipo) => ({
    tipo, nr_processo: "70000000000000000000", ds_classe_judicial: "APELAÇÃO CÍVEL", dtjulgamento_str: "27/03/2026",
    nome_relator_acordao: "RADUAN MIGUEL FILHO", ds_orgao_julgador_colegiado: "1ª Câmara Cível", ds_modelo_documento: corpoDe(o), id_processo_documento: tipo === "ACÓRDÃO" ? 1 : 2,
  });
  const t = formatInteiro({ hits: { total: { value: 2 }, hits: [{ _source: src("ACÓRDÃO") }, { _source: src("EMENTA") }] } }, "70000000000000000000");
  const blocos = t.split("\n## ");
  assert.match(blocos[1], /^ACÓRDÃO[\s\S]*Partes e lado \(heurística/);
  assert.doesNotMatch(blocos[2], /Partes e lado/);
});

// ------------------------------------------------------------ similares -
const hit = (id, texto, extra = {}) => ({ _source: { id_processo_documento: id, tipo: "ACÓRDÃO", ds_classe_judicial: "APELAÇÃO CÍVEL", dtjulgamento_str: "01/01/2026", ds_modelo_documento: texto, ...extra } });

test("tokens: minúsculas sem acento, 4+ letras, sem números e sem palavras de forma", () => {
  assert.deepEqual(tokens("Licença-prêmio por ASSIDUIDADE, art. 123 da LC 68/1992 do Estado"), ["licenca", "premio", "assiduidade"]);
});

test("ordenarPorSimilaridade: alvo primeiro, depois por semelhança; ids fora da página = alvoNaoEncontrado", () => {
  const hits = [
    hit(1, "servidor cedido sem ônus licença-prêmio assiduidade quinquênio cedência órgão cessionário"),
    hit(2, "dano moral inscrição indevida cadastro inadimplentes banco consumidor"),
    hit(3, "licença-prêmio assiduidade servidor cedido cedência quinquênio conversão pecúnia"),
    hit(4, "dano moral negativação indevida banco consumidor"),
  ];
  const r = ordenarPorSimilaridade(hits, "3");
  assert.equal(r.alvoNaoEncontrado, undefined);
  assert.deepEqual(r.hits.map((h) => h._source.id_processo_documento), [3, 1, 2, 4].slice(0, 2).concat(r.hits.slice(2).map((h) => h._source.id_processo_documento)));
  assert.equal(r.hits[0]._source.id_processo_documento, 3);
  assert.equal(r.hits[1]._source.id_processo_documento, 1);
  assert.ok(r.scores.get("1") > r.scores.get("2"));
  assert.ok(r.scores.get("1") > 0.5 && r.scores.get("2") < 0.2);
  assert.deepEqual(ordenarPorSimilaridade(hits, "99"), { alvoNaoEncontrado: true });
  assert.deepEqual(ordenarPorSimilaridade([], "1"), { alvoNaoEncontrado: true });
  // id numérico ou string
  assert.equal(ordenarPorSimilaridade(hits, 3).hits[0]._source.id_processo_documento, 3);
});

test("notaSimilares: alvo, contagem, numeração a partir do 2º da página e aviso do que a semelhança não é; alvo ausente orienta", () => {
  const hits = [hit(1, "a b c licença prêmio assiduidade"), hit(2, "licença prêmio assiduidade servidor"), hit(3, "dano moral banco")];
  const r = ordenarPorSimilaridade(hits, "1");
  const n = notaSimilares(r, "1", 0);
  assert.match(n, /^Similares a id 1 \(ACÓRDÃO · APELAÇÃO CÍVEL · 01\/01\/2026\): a página foi REORDENADA no cliente/);
  assert.match(n, /sobre os 3 documentos trazidos; zero consulta extra/);
  assert.match(n, /nº 2 \(id 2\): \d+%, nº 3 \(id 3\): \d+%/);
  assert.match(n, /Semelhança de palavras não é semelhança de tese/);
  // página 2 com 10 por página: o alvo é o nº 11, o 1º similar o nº 12
  assert.match(notaSimilares(r, "1", 10), /nº 12 \(id 2\)/);
  const na = notaSimilares(ordenarPorSimilaridade(hits, "7"), "7", 0);
  assert.match(na, /^similares_a="7": esse id não está entre os documentos desta página, então a ordem ficou a da busca/);
});
