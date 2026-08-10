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
  diagnosticarRespostaNaoJson,
  post,
  checarDisjuntor,
  checarLimitePreventivo,
  registrarBloqueioDetectado,
  registrarSucesso,
  _resetDisjuntorParaTeste,
  _setArquivoEstadoParaTeste,
} from "../server/lib.js";
import os from "node:os";
import path from "node:path";

// Redireciona a persistência do disjuntor pra um arquivo temporário em TODO o
// arquivo de teste — nunca deve gravar por cima do estado real do usuário.
_setArquivoEstadoParaTeste(path.join(os.tmpdir(), "_teste_disjuntor_tjro.json"));

// Corpo real capturado em 14/07/2026: o WAF do portal ("STIC") devolve HTTP 200
// com uma página HTML em vez de erro quando suspeita de automação.
const HTML_BLOQUEIO_STIC = `<!DOCTYPE html>
<html lang="pt-br">
<head><title>STIC - Página Bloqueada</title></head>
<body>
<h1>Página Bloqueada</h1>
<p>Seu acesso a esta página foi bloqueado por suspeita de robotização.
Por favor, abra um chamado através do e-mail suporte@tjro.jus.br</p>
</body>
</html>`;

const fetchFake = (resposta) => async () => resposta;

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

test("diagnosticarRespostaNaoJson reconhece o bloqueio do WAF do TJRO (STIC) e orienta o usuário", () => {
  const msg = diagnosticarRespostaNaoJson("text/html", HTML_BLOQUEIO_STIC);
  assert.match(msg, /robotização/i);
  assert.match(msg, /suporte@tjro\.jus\.br/);
});

test("diagnosticarRespostaNaoJson cai numa mensagem genérica quando o HTML não é o bloqueio conhecido", () => {
  const msg = diagnosticarRespostaNaoJson("text/html", "<html>manutenção programada</html>");
  assert.ok(!/robotização/i.test(msg));
  assert.match(msg, /instabilidade temporária/);
});

test("post() dá mensagem acionável (não JSONDecodeError cru) quando o TJRO bloqueia por robotização", async () => {
  _resetDisjuntorParaTeste();
  const respostaFake = {
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    text: async () => HTML_BLOQUEIO_STIC,
  };
  await assert.rejects(
    () => post({ fields: { query: "x" } }, fetchFake(respostaFake)),
    (err) => {
      assert.match(err.message, /robotização/i);
      return true;
    }
  );
});

test("post() aciona o disjuntor ao detectar bloqueio — a PRÓXIMA chamada nem sai pela rede", async () => {
  _resetDisjuntorParaTeste();
  const respostaBloqueio = {
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    text: async () => HTML_BLOQUEIO_STIC,
  };
  let chamadasDeRede = 0;
  const fetchContador = async () => {
    chamadasDeRede += 1;
    return respostaBloqueio;
  };
  await assert.rejects(() => post({ fields: { query: "x" } }, fetchContador));
  assert.equal(chamadasDeRede, 1);
  // 2ª chamada: disjuntor já ativo — deve barrar ANTES de tocar a rede.
  await assert.rejects(
    () => post({ fields: { query: "x" } }, fetchContador),
    (err) => {
      assert.match(err.message, /evitando novas tentativas/);
      return true;
    }
  );
  assert.equal(chamadasDeRede, 1, "a 2ª chamada não deveria ter tocado a rede");
});

test("post() devolve o JSON normalmente quando o content-type é application/json", async () => {
  _resetDisjuntorParaTeste();
  const respostaFake = {
    ok: true,
    status: 200,
    headers: { get: () => "application/json; charset=utf-8" },
    json: async () => ({ hits: { total: { value: 1 }, hits: [] } }),
  };
  const data = await post({ fields: { query: "x" } }, fetchFake(respostaFake));
  assert.equal(data.hits.total.value, 1);
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

test("checarDisjuntor: sem incidente não bloqueia; após detecção, bloqueia com backoff crescente", () => {
  _resetDisjuntorParaTeste();
  assert.equal(checarDisjuntor(), null);

  const t0 = 1_000_000;
  registrarBloqueioDetectado(t0); // 1ª detecção: cooldown de ~10min
  const aviso1 = checarDisjuntor(t0 + 1000); // 1s depois, ainda bem dentro do cooldown
  assert.match(aviso1, /evitando novas tentativas/);
  assert.match(aviso1, /9min/); // ~10min - 1s arredonda pra "9minXXs"

  // 2ª detecção ainda dentro do cooldown da 1ª: o PRÓXIMO cooldown dobra p/ ~20min.
  registrarBloqueioDetectado(t0 + 1000);
  const aviso2 = checarDisjuntor(t0 + 1000);
  assert.match(aviso2, /19min|20min/);

  // Esse cooldown de ~20min expira -> disjuntor libera de novo.
  assert.equal(checarDisjuntor(t0 + 1000 + 20 * 60_000 + 1), null);

  // Sucesso reseta o backoff para o valor inicial — não fica acumulando pra sempre.
  registrarSucesso();
  registrarBloqueioDetectado(t0 + 5_000_000);
  const avisoAposReset = checarDisjuntor(t0 + 5_000_000 + 1000);
  assert.match(avisoAposReset, /9min/); // voltou a ser ~10min, não ~40min
});

test("checarLimitePreventivo: libera até o teto por minuto, barra a próxima e depois libera de novo", () => {
  _resetDisjuntorParaTeste();
  const t0 = 2_000_000;
  for (let i = 0; i < 10; i++) {
    assert.equal(checarLimitePreventivo(t0 + i), null, `requisição ${i + 1}/10 deveria passar`);
  }
  const aviso = checarLimitePreventivo(t0 + 10);
  assert.match(aviso, /Muitas consultas/);

  // Passado mais de 1 minuto da mais antiga, a janela desliza e libera de novo.
  assert.equal(checarLimitePreventivo(t0 + 60_001), null);
});

test("escada adaptativa: bloqueio real avança 1 degrau por vez, refletido no limite preventivo", () => {
  _resetDisjuntorParaTeste();
  const t0 = 3_000_000;

  // Nível 0 (padrão): janela de 1min.
  for (let i = 0; i < 10; i++) checarLimitePreventivo(t0 + i);
  assert.match(checarLimitePreventivo(t0 + 10), /1min/);

  // 1º bloqueio real -> avança pro nível 1 (5min). Salto de tempo > 5min pra
  // garantir que o histórico da fase anterior já saiu da janela (mais larga agora).
  const t1 = t0 + 6 * 60_000;
  registrarBloqueioDetectado(t1);
  for (let i = 0; i < 10; i++) checarLimitePreventivo(t1 + i);
  assert.match(checarLimitePreventivo(t1 + 10), /5min/);

  // 2º bloqueio real -> avança pro nível 2 (10min). Salto de tempo > 10min.
  const t2 = t1 + 11 * 60_000;
  registrarBloqueioDetectado(t2);
  for (let i = 0; i < 10; i++) checarLimitePreventivo(t2 + i);
  assert.match(checarLimitePreventivo(t2 + 10), /10min/);
});

test("escada adaptativa: nunca avança além do topo da escada (30min)", () => {
  _resetDisjuntorParaTeste();
  let t = 3_000_000;
  for (let i = 0; i < 10; i++) {
    // 10 bloqueios seguidos, cada um bem depois do teto da janela anterior — a
    // escada tem só 5 níveis, então a partir do 5º isso já devia estar no topo.
    registrarBloqueioDetectado(t);
    t += 40 * 60_000;
  }
  for (let i = 0; i < 10; i++) checarLimitePreventivo(t + i);
  assert.match(checarLimitePreventivo(t + 10), /30min/);
});

test("escada adaptativa: sequência longa de sucessos relaxa 1 degrau; nunca abaixo do nível 0", () => {
  _resetDisjuntorParaTeste();
  registrarBloqueioDetectado(4_000_000); // nível 0 -> 1
  registrarBloqueioDetectado(4_000_100); // nível 1 -> 2 (10min)
  for (let i = 0; i < 100; i++) registrarSucesso();
  for (let i = 0; i < 10; i++) checarLimitePreventivo(5_000_000 + i);
  const avisoAposRelaxar = checarLimitePreventivo(5_000_020);
  assert.match(avisoAposRelaxar, /5min/, avisoAposRelaxar); // relaxou de 10min pra 5min

  // Muito além do limiar, nunca relaxa abaixo do nível 0 (1min).
  _resetDisjuntorParaTeste();
  for (let i = 0; i < 300; i++) registrarSucesso();
  for (let i = 0; i < 10; i++) checarLimitePreventivo(6_000_000 + i);
  const avisoNivelMinimo = checarLimitePreventivo(6_000_020);
  assert.match(avisoNivelMinimo, /1min/, avisoNivelMinimo);
});
