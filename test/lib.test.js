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
  reservarRequisicao,
  registrarBloqueioDetectado,
  registrarSucesso,
  diagnosticoRitmo,
  _resetDisjuntorParaTeste,
  _setArquivoEstadoParaTeste,
  _limparCacheParaTeste,
  _statusPersistencia,
} from "../server/lib.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Redireciona a persistência do disjuntor pra um arquivo temporário em TODO o
// arquivo de teste — nunca deve gravar por cima do estado real do usuário.
_setArquivoEstadoParaTeste(path.join(os.tmpdir(), "_teste_disjuntor_tjro.json"));

// Estado limpo + cache limpo antes de cada caso que toca a camada de ritmo.
const limparTudo = () => {
  _resetDisjuntorParaTeste();
  _limparCacheParaTeste();
};

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
  limparTudo();
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
  limparTudo();
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
  limparTudo();
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

test("reservarRequisicao: libera sem espera na 1ª chamada e impõe espaçamento na 2ª", () => {
  limparTudo();
  const t0 = 1_000_000;
  const r1 = reservarRequisicao(t0);
  assert.equal(r1.erro, undefined);
  assert.equal(r1.esperarMs, 0, "1ª requisição não deveria esperar");

  // 2ª imediata: recebe uma vaga ~2s à frente em vez de disparar junto.
  const r2 = reservarRequisicao(t0 + 1);
  assert.equal(r2.erro, undefined);
  assert.ok(r2.esperarMs >= 1500, `esperava espaçamento, veio ${r2.esperarMs}ms`);
});

test("reservarRequisicao: barra ao estourar o teto da janela", () => {
  limparTudo();
  const t0 = 2_000_000;
  // Consome o teto (avançando o relógio p/ não esbarrar só no espaçamento).
  for (let i = 0; i < 10; i++) {
    const r = reservarRequisicao(t0 + i * 3000);
    assert.equal(r.erro, undefined, `requisição ${i + 1}/10 deveria passar`);
  }
  const estourou = reservarRequisicao(t0 + 10 * 3000);
  assert.match(estourou.erro, /Muitas consultas/);
  assert.match(estourou.erro, /compartilhado por todos os processos/);
});

test("reservarRequisicao: durante o cooldown do disjuntor, recusa de imediato", () => {
  limparTudo();
  const t0 = 3_000_000;
  registrarBloqueioDetectado(t0);
  const r = reservarRequisicao(t0 + 1000);
  assert.match(r.erro, /evitando novas tentativas/);
  assert.match(r.erro, /9min/); // ~10min de cooldown menos 1s
  // Passado o cooldown, volta a liberar.
  assert.equal(reservarRequisicao(t0 + 10 * 60_000 + 1).erro, undefined);
});

test("estado do ritmo é COMPARTILHADO via arquivo — outro processo enxerga o mesmo orçamento", () => {
  limparTudo();
  const t0 = 4_000_000;
  // Simula "processo A" consumindo todo o teto da janela.
  for (let i = 0; i < 10; i++) reservarRequisicao(t0 + i * 3000);

  // "Processo B" = mesma lógica lendo o MESMO arquivo (sem reset em memória).
  // Antes desta versão, cada processo tinha contador próprio e B teria 10 vagas.
  const doProcessoB = reservarRequisicao(t0 + 10 * 3000);
  assert.match(doProcessoB.erro, /Muitas consultas/, "processo B deveria ver o orçamento já gasto");
});

test("bloqueio detectado por um processo faz TODOS recuarem (é o mesmo IP)", () => {
  limparTudo();
  const t0 = 5_000_000;
  registrarBloqueioDetectado(t0); // "processo A" levou bloqueio
  const doProcessoB = reservarRequisicao(t0 + 500); // "processo B" tenta em seguida
  assert.match(doProcessoB.erro, /evitando novas tentativas/);
});

test("escada adaptativa: cada bloqueio real alarga a janela, até o teto de 30min", () => {
  limparTudo();
  let t = 6_000_000;
  const janelaVisivel = () => {
    for (let i = 0; i < 10; i++) reservarRequisicao(t + i * 3000);
    const msg = reservarRequisicao(t + 10 * 3000).erro;
    t += 40 * 60_000; // avança além de qualquer janela p/ a próxima medição ser limpa
    return msg;
  };
  assert.match(janelaVisivel(), /1min/); // nível 0

  registrarBloqueioDetectado(t);
  t += 40 * 60_000;
  assert.match(janelaVisivel(), /5min/); // nível 1

  registrarBloqueioDetectado(t);
  t += 40 * 60_000;
  assert.match(janelaVisivel(), /10min/); // nível 2

  // Muitos bloqueios: nunca passa do topo da escada.
  for (let i = 0; i < 8; i++) {
    registrarBloqueioDetectado(t);
    t += 70 * 60_000;
  }
  assert.match(janelaVisivel(), /30min/);
});

test("escada adaptativa: sequência longa de sucessos relaxa 1 degrau; nunca abaixo do nível 0", () => {
  limparTudo();
  let t = 7_000_000;
  registrarBloqueioDetectado(t); // -> nível 1
  registrarBloqueioDetectado(t + 1000); // -> nível 2 (10min)
  t += 70 * 60_000;

  for (let i = 0; i < 100; i++) registrarSucesso();
  for (let i = 0; i < 10; i++) reservarRequisicao(t + i * 3000);
  assert.match(reservarRequisicao(t + 10 * 3000).erro, /5min/, "deveria ter relaxado de 10min p/ 5min");

  // Muito além do limiar, nunca relaxa abaixo do nível 0 (1min).
  limparTudo();
  const t2 = 8_000_000;
  for (let i = 0; i < 300; i++) registrarSucesso();
  for (let i = 0; i < 10; i++) reservarRequisicao(t2 + i * 3000);
  assert.match(reservarRequisicao(t2 + 10 * 3000).erro, /1min/);
});

test("cache: repetir a MESMA busca não gera segunda requisição ao portal", async () => {
  limparTudo();
  let chamadasDeRede = 0;
  const fetchContador = async () => {
    chamadasDeRede += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ hits: { total: { value: 7 }, hits: [] } }),
    };
  };
  const corpo = { fields: { query: "mesma busca" } };
  const a = await post(corpo, fetchContador);
  const b = await post(corpo, fetchContador);
  assert.equal(a.hits.total.value, 7);
  assert.equal(b.hits.total.value, 7);
  assert.equal(chamadasDeRede, 1, "a 2ª chamada idêntica deveria vir do cache");
});

test("escapeLucene: curinga no FIM é preservado; no INÍCIO continua escapado", () => {
  assert.equal(escapeLucene("consign*"), "consign*");
  assert.equal(escapeLucene("dano consign*"), "dano consign*");
  assert.equal(escapeLucene("*signado"), "\\*signado");
  // Demais operadores seguem escapados.
  assert.equal(escapeLucene('a"b'), 'a\\"b');
});

test("formatBusca: sugere aumentar por_pagina em vez de paginar (menos requisições)", () => {
  const fake = {
    hits: {
      total: { value: 500 },
      hits: [{ _source: { tipo: "EMENTA", ds_modelo_documento: "t", nr_processo: "1" } }],
    },
  };
  const out = formatBusca(fake, "x", ["EMENTA"], "relevantes", 1, 10);
  assert.match(out, /por_pagina maior/);
});

test("incidente registra o contexto do bloqueio (rajada, nível, intervalo, operação)", () => {
  limparTudo();
  const t0 = 9_000_000;
  // Simula rajada: 6 consultas no minuto anterior ao bloqueio.
  for (let i = 0; i < 6; i++) reservarRequisicao(t0 + i * 3000);
  registrarBloqueioDetectado(t0 + 20_000, "busca");

  const rel = diagnosticoRitmo(t0 + 21_000);
  assert.match(rel, /BLOQUEADO/);
  assert.match(rel, /Bloqueios registrados: 1/);
  assert.match(rel, /consultas no minuto anterior/);
  assert.match(rel, /operação: busca/);
  assert.match(rel, /Padrão observado/);
});

test("diagnóstico distingue bloqueio por rajada de bloqueio com pouco tráfego", () => {
  limparTudo();
  // Cenário A: bloqueios sempre após rajada -> orienta a espaçar consultas.
  let t = 10_000_000;
  for (let n = 0; n < 3; n++) {
    for (let i = 0; i < 8; i++) reservarRequisicao(t + i * 3000);
    registrarBloqueioDetectado(t + 30_000, "busca");
    t += 4 * 60 * 60_000; // bem depois, p/ a janela seguinte começar limpa
  }
  assert.match(diagnosticoRitmo(t), /após rajadas/);

  // Cenário B: bloqueios com quase nenhum tráfego daqui -> causa externa.
  limparTudo();
  let t2 = 20_000_000;
  for (let n = 0; n < 3; n++) {
    reservarRequisicao(t2);
    registrarBloqueioDetectado(t2 + 1000, "busca");
    t2 += 4 * 60 * 60_000;
  }
  assert.match(diagnosticoRitmo(t2), /fora do controle desta ferramenta/);
});

test("diagnóstico funciona (e não mente) quando nunca houve bloqueio", () => {
  limparTudo();
  const rel = diagnosticoRitmo(30_000_000);
  assert.match(rel, /Nenhum bloqueio registrado/);
  assert.match(rel, /liberado/);
});


// ---------------------------------------------------------------------------
// Regressões do red team (v1.4.1)
// ---------------------------------------------------------------------------

const respostaFalsa = (status, ctype, corpo, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (h.toLowerCase() === "content-type" ? ctype : headers[h.toLowerCase()] ?? null) },
  text: async () => corpo,
  json: async () => JSON.parse(corpo),
});

test("WAF com HTTP 403 e corpo de bloqueio arma o disjuntor (antes, o status furava tudo)", async () => {
  limparTudo();
  await assert.rejects(() =>
    post({ fields: { query: "x" } }, async () => respostaFalsa(403, "text/html", HTML_BLOQUEIO_STIC))
  );
  // Disjuntor armado -> próxima chamada é barrada sem tocar a rede.
  let tocouRede = false;
  await assert.rejects(
    () => post({ fields: { query: "y" } }, async () => { tocouRede = true; return respostaFalsa(200, "application/json", "{}"); }),
    (err) => {
      assert.match(err.message, /evitando novas tentativas/);
      return true;
    }
  );
  assert.equal(tocouRede, false);
  assert.match(diagnosticoRitmo(), /Bloqueios registrados: 1/);
});

test("HTTP 429 respeita Retry-After e NÃO alarga a janela (403/429 seco não sobe a escada)", async () => {
  limparTudo();
  await assert.rejects(() =>
    post({ fields: { query: "x" } }, async () =>
      respostaFalsa(429, "text/html", "<html>rate limited</html>", { "retry-after": "1800" })
    )
  );
  const rel = diagnosticoRitmo();
  // Cooldown de 30min (Retry-After) prevalece sobre o backoff inicial de 10min...
  assert.match(rel, /BLOQUEADO/);
  assert.match(rel, /29min|30min/);
  // ...mas a janela continua no nível 1 (1min), porque não houve assinatura do WAF.
  assert.match(rel, /Nível atual: 1 de 5/);
});

test("HTTP 503 é instabilidade, não bloqueio: não arma disjuntor nem registra incidente", async () => {
  limparTudo();
  await assert.rejects(() =>
    post({ fields: { query: "x" } }, async () => respostaFalsa(503, "text/html", "<html>manutenção</html>"))
  );
  const rel = diagnosticoRitmo();
  assert.match(rel, /Situação: liberado/);
  assert.match(rel, /Nenhum bloqueio registrado/);
});

test("escrita do estado é atômica: nenhum .tmp residual e o arquivo final é JSON válido", () => {
  limparTudo();
  const alvo = path.join(os.tmpdir(), "_teste_disjuntor_tjro.json");
  reservarRequisicao(Date.now());
  const conteudo = fs.readFileSync(alvo, "utf-8");
  assert.doesNotThrow(() => JSON.parse(conteudo));
  const residuos = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("_teste_disjuntor_tjro.json.") && f.endsWith(".tmp"));
  assert.deepEqual(residuos, [], `sobraram temporários: ${residuos.join(", ")}`);
});

test("se o disco não aceitar escrita, o limite CONTINUA valendo em memória (não vira ilimitado)", () => {
  limparTudo();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-somente-leitura-"));
  const alvo = path.join(dir, "estado.json");
  _setArquivoEstadoParaTeste(alvo);
  try {
    fs.chmodSync(dir, 0o500); // diretório sem permissão de escrita
    const t0 = Date.now();
    let admitidas = 0;
    // 40 chamadas dentro da MESMA janela de 1min (1ms entre elas) — sem o fallback
    // em memória, todas as 40 passariam, que é o padrão metralhadora.
    for (let i = 0; i < 40; i++) {
      if (!reservarRequisicao(t0 + i).erro) admitidas += 1;
    }
    assert.equal(admitidas, 10, `esperava o teto de 10, veio ${admitidas} — limitador desligado`);
    assert.ok(_statusPersistencia(), "deveria registrar que a persistência falhou");
    assert.match(diagnosticoRitmo(), /AVISO: não foi possível gravar/);
  } finally {
    try { fs.chmodSync(dir, 0o700); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    _setArquivoEstadoParaTeste(path.join(os.tmpdir(), "_teste_disjuntor_tjro.json"));
    limparTudo();
  }
});

test("trava órfã é limpa a tempo — não se executa sem exclusão mútua", () => {
  limparTudo();
  const alvo = path.join(os.tmpdir(), "_teste_disjuntor_tjro.json");
  const lock = alvo + ".lock";
  fs.writeFileSync(lock, "");
  const velho = new Date(Date.now() - 5000); // 5s > TRAVA_OBSOLETA_MS (1s)
  fs.utimesSync(lock, velho, velho);
  const inicio = Date.now();
  const r = reservarRequisicao(Date.now());
  assert.equal(r.erro, undefined);
  assert.ok(Date.now() - inicio < 1500, "não deveria ter esperado o timeout inteiro");
  assert.equal(fs.existsSync(lock), false, "a trava órfã deveria ter sido removida");
});

test("relógio adiantado: cooldown absurdo é limitado ao teto (falha fechada, mas não 99h)", () => {
  limparTudo();
  const alvo = path.join(os.tmpdir(), "_teste_disjuntor_tjro.json");
  const agora = Date.now();
  fs.writeFileSync(alvo, JSON.stringify({
    versao: 2,
    requisicoes: [],
    proximoLivreEm: 0,
    bloqueadoAte: agora + 99 * 60 * 60_000, // 99h — muito além do teto de backoff
    indiceJanela: 0,
    sucessos: 0,
    backoffMs: 600000,
    incidentes: [],
  }));
  const r = reservarRequisicao(agora);
  // Continua barrando DE PROPÓSITO: não dá para distinguir relógio adiantado de
  // bloqueio legítimo, e errar para o lado de não martelar o portal é o certo.
  // O que não pode é ficar inutilizável por 99h — o teto é 1h.
  assert.match(r.erro, /evitando novas tentativas/);
  assert.match(r.erro, /1h/);
  assert.ok(!/\d\dh/.test(r.erro), `cooldown não foi limitado ao teto: ${r.erro}`);
});

test("relógio adiantado: carimbos de requisição no futuro não consomem o orçamento", () => {
  limparTudo();
  const alvo = path.join(os.tmpdir(), "_teste_disjuntor_tjro.json");
  const agora = Date.now();
  fs.writeFileSync(alvo, JSON.stringify({
    versao: 2,
    // 10 carimbos 4h à frente: sem saneamento ocupariam o teto e barrariam tudo.
    requisicoes: Array.from({ length: 10 }, (_, i) => agora + 4 * 60 * 60_000 + i),
    proximoLivreEm: agora + 4 * 60 * 60_000,
    bloqueadoAte: 0,
    indiceJanela: 0,
    sucessos: 0,
    backoffMs: -5000, // negativo: faria o disjuntor nunca engatar
    incidentes: [],
  }));
  const r = reservarRequisicao(agora);
  // Os 10 carimbos futuros foram descartados: a recusa, se houver, NÃO é por
  // orçamento estourado.
  assert.ok(!/Muitas consultas/.test(r.erro || ""), `orçamento consumido pelo futuro: ${r.erro}`);
  // E o estrago do relógio fica contido em dezenas de segundos, não em 4 horas.
  if (r.erro) {
    assert.match(r.erro, /Fila de espera longa demais \(\d\ds\)/, r.erro);
  } else {
    assert.ok(r.esperarMs <= 32_000, `espera herdou o futuro: ${r.esperarMs}ms`);
  }
});

test("estado corrompido não é herdado: campos inválidos caem em valores seguros", () => {
  limparTudo();
  const alvo = path.join(os.tmpdir(), "_teste_disjuntor_tjro.json");
  fs.writeFileSync(alvo, JSON.stringify({
    requisicoes: "não é array",
    indiceJanela: 999,
    bloqueadoAte: "amanhã",
    backoffMs: Infinity,
    incidentes: { não: "é array" },
  }));
  const r = reservarRequisicao(Date.now());
  assert.equal(r.erro, undefined);
  const rel = diagnosticoRitmo();
  assert.match(rel, /Nível atual: 5 de 5/); // 999 foi clampado ao topo, não estourou
  assert.match(rel, /Nenhum bloqueio registrado/); // incidentes inválido virou lista vazia
});
