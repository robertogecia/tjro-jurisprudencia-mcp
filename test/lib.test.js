import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBuscaBody,
  buildInteiroBody,
  link,
  citacao,
  cnj,
  escapeLucene,
  normTipos,
  sugestoes,
  formatBusca,
  formatInteiro,
} from "../server/lib.js";

test("termo_exato escapa ANTES de aspear (regressão: aspas não podem virar \\\")", () => {
  const b = buildBuscaBody({
    consulta: "dano moral",
    tipo: ["EMENTA"],
    termoExato: true,
    ordenacao: "relevantes",
    pagina: 1,
    porPagina: 3,
  });
  assert.equal(b.fields.query, '"dano moral"');
});

test("tipo vai sempre como string — a API zera resultados se receber array", () => {
  const b = buildBuscaBody({
    consulta: "x",
    tipo: ["EMENTA", "ACÓRDÃO"],
    ordenacao: "relevantes",
    pagina: 1,
    porPagina: 1,
  });
  assert.equal(b.fields.tipo, "EMENTA,ACÓRDÃO");
  const bi = buildInteiroBody("123", ["ACÓRDÃO", "VOTO"]);
  assert.equal(bi.fields.tipo, "ACÓRDÃO,VOTO");
});

test("classe_judicial é normalizada para CAIXA ALTA (o filtro .raw é sensível a caixa)", () => {
  const b = buildBuscaBody({
    consulta: "x",
    tipo: ["EMENTA"],
    classe: "Apelação Cível",
    ordenacao: "relevantes",
    pagina: 1,
    porPagina: 1,
  });
  assert.equal(b.fields["ds_classe_judicial.raw"], "APELAÇÃO CÍVEL");
});

test("link nunca inclui None/null nem espaço cru (o portal redireciona pra home nesses casos)", () => {
  const l = link({
    id_processo_documento: 1,
    sistema_origem: "PJESG",
    tipo: "DECISÃO DA PRESIDÊNCIA",
    id_documento_principal: null,
  });
  assert.ok(!l.includes("null"), l);
  assert.ok(!l.includes(" "), l);
  assert.ok(l.includes("%20"), l);
});

test("citacao monta o padrão forense e omite segmentos ausentes no índice", () => {
  const c = citacao({
    ds_classe_judicial: "APELAÇÃO CÍVEL",
    nr_processo: "70355391820208220001",
    nome_relator_acordao: "Sansão Saldanha",
    ds_orgao_julgador_colegiado: "3ª Câmara Cível",
    dtjulgamento_str: "01/10/2021",
    dtpublicacao: "2021-10-07",
  });
  assert.equal(
    c,
    "(TJ-RO - APELAÇÃO CÍVEL: 7035539-18.2020.8.22.0001, Relator: Sansão Saldanha, " +
      "Data de Julgamento: 01/10/2021, 3ª Câmara Cível, Data de Publicação: 07/10/2021)"
  );

  const semPublicacao = citacao({ nr_processo: "70355391820208220001" });
  assert.ok(!semPublicacao.includes("Data de Publicação"), semPublicacao);
});

test("cnj formata 20 dígitos no padrão NNNNNNN-DD.AAAA.J.TR.OOOO e devolve o original se inválido", () => {
  assert.equal(cnj("70355391820208220001"), "7035539-18.2020.8.22.0001");
  assert.equal(cnj("não é número válido"), "não é número válido");
});

test("escapeLucene escapa caracteres especiais do Elasticsearch", () => {
  assert.equal(escapeLucene('a"b'), 'a\\"b');
  assert.equal(escapeLucene(""), "");
  assert.equal(escapeLucene("   "), "");
});

test("normTipos filtra valores inválidos e cai no padrão se a lista ficar vazia", () => {
  assert.deepEqual(normTipos(["ementa", "lixo"], ["EMENTA"]), ["EMENTA"]);
  assert.deepEqual(normTipos(["lixo"], ["EMENTA", "ACÓRDÃO"]), ["EMENTA", "ACÓRDÃO"]);
});

test("formatInteiro deduplica peças idênticas e avisa quando o total supera os retornados", () => {
  const fake = {
    hits: {
      total: { value: 3 },
      hits: [
        {
          _source: {
            tipo: "EMENTA",
            ds_modelo_documento: "<p>texto</p>",
            nr_processo: "70355391820208220001",
            dtjulgamento_str: "01/10/2021",
          },
        },
        {
          _source: {
            tipo: "EMENTA",
            ds_modelo_documento: "<p>texto</p>",
            nr_processo: "70355391820208220001",
            dtjulgamento_str: "01/10/2021",
          },
        },
      ],
    },
  };
  const out = formatInteiro(fake, "70355391820208220001");
  assert.equal((out.match(/## EMENTA/g) || []).length, 1, "não deduplicou a peça repetida");
  assert.match(out, /O processo tem 3 documentos/);
});

test("formatBusca explica que o total é OR e sugere AND/termo_exato acima de 5000", () => {
  const fake = { hits: { total: { value: 6000 }, hits: [] } };
  const out = formatBusca(fake, "dano moral", ["EMENTA"], "relevantes", 1, 10);
  assert.match(out, /busca OR/);
  assert.match(out, /operador AND/);
});

test("formatBusca rotula o trecho como Ementa só quando o tipo do documento é EMENTA", () => {
  const fake = {
    hits: {
      total: { value: 1 },
      hits: [
        {
          _source: {
            tipo: "SENTENÇA",
            ds_modelo_documento: "texto qualquer",
            nr_processo: "70355391820208220001",
          },
        },
      ],
    },
  };
  const out = formatBusca(fake, "x", ["SENTENÇA"], "relevantes", 1, 10);
  assert.match(out, /Trecho da SENTENÇA/);
  assert.ok(!out.includes("Ementa (trecho)"));
});

test("sugestoes agrega correções de qualquer token da consulta, não só a primeira palavra", () => {
  const fake = {
    suggest: {
      sugestoes: [
        { text: "usucapiao", offset: 0, length: 9, options: [{ text: "usucapião" }] },
        { text: "usucapião", offset: 0, length: 9, options: [{ text: "usucapiao" }] },
        { text: "estraordinaria", offset: 10, length: 14, options: [{ text: "extraordinária" }] },
      ],
    },
  };
  const out = sugestoes(fake, "usucapião estraordinaria");
  assert.ok(
    out.some((s) => s.includes("extraordinária")),
    "deveria sugerir a correção da 2ª palavra, não só variantes de acento da 1ª"
  );
});
