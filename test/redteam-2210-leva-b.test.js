// Leva B do red team de 22/10/2026 — exatidão e robustez. Tudo sintético, sem rede, em os.tmpdir().
// (5) qualificador parcial do provimento; sentença que julga embargos de declaração; (6) pedido contraposto/reconvenção;
// (7) sentença penal com classe que não diz "penal"; (8) diário de erros sem nome de relator; (9) atribuição solta do STJ
// com ponto de milhar; (10) limpar() e faixasDeclaradas lineares, ligaduras, disco cheio em gravarRecibos.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resultadoComOrigem, rotuloDoConjunto, desfechoDeSentenca, limpar, semScriptStyle, semTags, gravarRecibos, podarRecibosDeBusca, TMP_ORFAO_MS } from "../server/lib.js";
import { norm1, faixasDeclaradas, faixasAlheias, atribuicoes, expandirLigaduras } from "../server/custodia.js";
import { conferirTrecho } from "../server/verificar.js";
import * as E from "../server/erros.js";
import { linhaDoTempo } from "../server/linhadotempo.js";

const rotulo = (fecho, classe = "APELAÇÃO CÍVEL") => {
  const t = `VOTO Fundamentos do voto. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, ${fecho}, À UNANIMIDADE.`;
  const ro = resultadoComOrigem(t, "ACÓRDÃO");
  return rotuloDoConjunto(ro.conjunto, classe, ro.embargos);
};

// ---------- (5) parcial ----------
test("leva B (5): 'CONHECIDO E, EM PARTE, PROVIDO' e 'DADO PROVIMENTO EM PARTE' são parcial; 'conhecido em parte e provido' não", () => {
  assert.equal(rotulo("RECURSO CONHECIDO E, EM PARTE, PROVIDO"), "PARCIAL");
  assert.equal(rotulo("DADO PROVIMENTO EM PARTE AO RECURSO"), "PARCIAL");
  assert.equal(rotulo("RECURSO PROVIDO, EM PARTE"), "PARCIAL");
  assert.equal(rotulo("DADO PROVIMENTO AO RECURSO"), "PROVIDO");
  // controles que já funcionavam
  assert.equal(rotulo("RECURSO PROVIDO EM PARTE"), "PARCIAL");
  assert.equal(rotulo("RECURSO CONHECIDO E PARCIALMENTE PROVIDO"), "PARCIAL");
  assert.equal(rotulo("RECURSO CONHECIDO E PROVIDO"), "PROVIDO");
  // conhecimento parcial não é provimento parcial
  assert.equal(rotulo("RECURSO CONHECIDO EM PARTE E PROVIDO"), "PROVIDO");
  assert.equal(rotulo("RECURSO NÃO PROVIDO"), "DESPROVIDO");
});

const sentenca = (dispositivo, classe = "PROCEDIMENTO COMUM CÍVEL") =>
  desfechoDeSentenca(`Processo 7000001-34.2024.8.22.0001 Classe ${classe} Vistos. Trata-se de ação. Fundamentação longa do juízo sobre os fatos. ${dispositivo} Publique-se. Intimem-se. Porto Velho, 10 de outubro de 2025. Juiz de Direito`, "SENTENÇA", classe);

test("leva B (5): sentença que julga embargos de declaração com advérbio fica sem rótulo; embargos à execução continuam", () => {
  assert.equal(sentenca("Ante o exposto, JULGO PARCIALMENTE PROCEDENTES os embargos de declaração, apenas para corrigir o termo inicial dos juros."), null);
  assert.equal(sentenca("Ante o exposto, ACOLHO EM PARTE os embargos de declaração para sanar a omissão."), null);
  assert.equal(sentenca("Ante o exposto, ACOLHO os embargos de declaração para sanar a omissão."), null);
  // embargos à execução julgados em parte: desfecho de mérito legítimo
  assert.equal(sentenca("Ante o exposto, JULGO PARCIALMENTE PROCEDENTES os embargos à execução para excluir os juros.", "EMBARGOS À EXECUÇÃO"), "PARCIAL");
});

// ---------- (6) pedido contraposto ----------
test("leva B (6): improcedência (substantivo) e pedido contraposto não invertem o desfecho", () => {
  // S1: "pela improcedência" + contraposto procedente → sem rótulo (antes: PROCEDENTE)
  assert.equal(sentenca("Ante o exposto, JULGO PELA IMPROCEDÊNCIA dos pedidos iniciais e JULGO PROCEDENTE o pedido contraposto para condenar a parte autora ao pagamento de R$ 1.000,00."), null);
  // S3: o substantivo sozinho agora é lido
  assert.equal(sentenca("Ante o exposto, JULGO PELA IMPROCEDÊNCIA dos pedidos iniciais, com resolução do mérito."), "IMPROCEDENTE");
  // S2: três âncoras — a do meio sem rótulo não esconde o "improcedente" de duas âncoras atrás
  assert.equal(sentenca("Ante o exposto, JULGO IMPROCEDENTE o pedido inicial. Em consequência, condeno o autor ao pagamento das custas. Desse modo, resolvo o mérito nos termos do art. 487, I. Quanto ao pedido contraposto, julgo-o PROCEDENTE para condenar o autor."), null);
  // S4: reconvenção
  assert.equal(sentenca("Ante o exposto, JULGO IMPROCEDENTE o pedido inicial. Em consequência, condeno o autor às custas. Desse modo, resolvo o mérito. Quanto à reconvenção, julgo-a PROCEDENTE."), null);
  // pedido do RÉU julgado em parte → sem rótulo; parcial do AUTOR com reconvenção improcedente (caso comum) → mantém
  assert.equal(sentenca("Ante o exposto, JULGO IMPROCEDENTE o pedido inicial e PARCIALMENTE PROCEDENTE o pedido contraposto."), null);
  assert.equal(sentenca("Ante o exposto, JULGO PARCIALMENTE PROCEDENTES os pedidos iniciais para condenar a ré a pagar R$ 5.000,00. Julgo IMPROCEDENTE o pleito reconvencional."), "PARCIAL");
  // narrativa com o substantivo solto não vira rótulo
  assert.equal(sentenca("Ante o exposto, JULGO EXTINTO o feito sem resolução do mérito, com fulcro no art. 485, I, do CPC. A lei de custas prevê o fato gerador no trânsito em julgado da sentença de improcedência na revisão criminal."), "EXTINTO");
  // controle: o PARCIAL de antes da âncora final não colide com um "improcedente" de sub-pedido mais atrás
  assert.equal(sentenca("Pelo exposto, concluo ser improcedente o pedido de reparação de danos morais. A medida imposta é mais justa. DISPOSITIVO Ante o exposto, resolvo o mérito e JULGO PARCIALMENTE PROCEDENTE o pedido inicial para condenar a requerida a pagar R$ 1.587,76."), "PARCIAL");
});

// ---------- (7) penal ----------
test("leva B (7): sentença penal sem 'penal' na classe fica sem rótulo cível; cível com 'condeno o réu' continua", () => {
  const cond = "O Ministério Público ofereceu denúncia pelo art. 33 da Lei 11.343/06. Ante o exposto, JULGO PROCEDENTE a pretensão punitiva estatal para CONDENAR o réu à pena de 5 anos de reclusão, em regime inicial semiaberto.";
  const abs = "Ante o exposto, JULGO IMPROCEDENTE a pretensão punitiva e ABSOLVO o réu, com fundamento no art. 386, VII, do CPP.";
  for (const classe of ["PROCEDIMENTO ESPECIAL DA LEI ANTITÓXICOS", "PROCEDIMENTO SUMÁRIO", "PROCEDIMENTO SUMARÍSSIMO", ""]) {
    assert.equal(sentenca(cond, classe), null, `condenação, classe «${classe}»`);
    assert.equal(sentenca(abs, classe), null, `absolvição, classe «${classe}»`);
  }
  assert.equal(sentenca("Ante o exposto, JULGO PROCEDENTE o pedido para condenar o réu ao pagamento de R$ 3.000,00 a título de danos morais."), "PROCEDENTE");
  assert.equal(sentenca("Ante o exposto, JULGO PROCEDENTE o pedido para condenar o réu ao pagamento de R$ 3.000,00.", "PROCEDIMENTO SUMÁRIO"), "PROCEDENTE");
});

// ---------- (8) diário de erros ----------
test("leva B (8): linha do tempo [PESQUISA INCOMPLETA] não grava o nome do relator no diário nem no relatório", async () => {
  const diario = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tjro-leva-b-diario-")), "erros.jsonl");
  E._definirArquivoParaTeste(diario);
  const handlers = {};
  const server = { registerTool: (nome, cfg, h) => { handlers[nome] = h; } };
  E.comDiario(server);
  let n = 0;
  const postImpl = async () => { n++; if (n === 1) return { hits: { total: { value: 3 }, hits: [] } }; throw new Error("HTTP 503"); };
  server.registerTool("linha_do_tempo_tjro", {}, async (a) => ({ content: [{ type: "text", text: await linhaDoTempo({ consulta: a.consulta, relator: a.relator, orgaoColegiado: a.orgao_colegiado, anoInicio: 2023, anoFim: 2024, porPagina: 20 }, postImpl, async () => {}) }] }));
  const r = await handlers.linha_do_tempo_tjro({ consulta: "tese sigilosa x", relator: "DES. FULANO SINTETICO DE TAL", orgao_colegiado: "2ª Câmara Cível" });
  assert.match(r.content[0].text, /FULANO SINTETICO/);   // a resposta ao usuário continua com o filtro
  const gravado = fs.readFileSync(diario, "utf8");
  assert.doesNotMatch(gravado, /FULANO|SINTETICO/);
  assert.match(gravado, /PESQUISA INCOMPLETA\] parou no ano 2024: HTTP 503/);   // a causa, que antes ficava fora do corte
  assert.doesNotMatch(E.relatorioParaAnalise(E.lerErros(30)), /FULANO|SINTETICO/);
  // 2ª camada: sanitizar mascara o nome depois de "relator"
  assert.equal(E.sanitizar("(ACÓRDÃO · relator DES. BELTRANO DE TAL · 2ª Câmara Cível)"), "(ACÓRDÃO · relator <nome> · 2ª Câmara Cível)");
  assert.equal(E.trechoDaFalha("cabeçalho relator X\n| 2023 | 3 |\n⚠️ [PESQUISA INCOMPLETA] parou no ano 2024: HTTP 503.\naviso"), "[PESQUISA INCOMPLETA] parou no ano 2024: HTTP 503.");
});

// ---------- (9) atribuição solta do STJ ----------
const VOTO_STJ = (atrib) =>
  "VOTO A apelante sustenta a nulidade do contrato. Confira-se: AGRAVO INTERNO NO RECURSO ESPECIAL. CONSUMIDOR. CONTRATO BANCÁRIO. " +
  "A instituição financeira responde objetivamente pelos danos decorrentes de fraude praticada por terceiros no âmbito de operações bancárias. Agravo interno não provido. " +
  `${atrib} Ministro Fulano de Tal, Quarta Turma, julgado em 10/10/2020, DJe 15/10/2020. No caso dos autos, a contratação não foi comprovada. Ante o exposto, nego provimento ao recurso. É como voto.`;
const FRASE_STJ = "A instituição financeira responde objetivamente pelos danos decorrentes de fraude praticada por terceiros";

test("leva B (9): 'STJ - REsp 1.578.553/SP, Rel.' e 'STJ, AgInt no REsp 1.578.553/SP, Rel.' marcam TRANSCRIÇÃO", () => {
  for (const atrib of ["STJ - REsp 1.578.553/SP, Rel.", "STJ, AgInt no REsp 1.578.553/SP, Rel.", "STJ - REsp 1578553/SP, Rel.", "STJ: EDcl nos EDcl no AREsp 1.234.567/RS, Rel."]) {
    const r = conferirTrecho(VOTO_STJ(atrib), FRASE_STJ, "VOTO");
    assert.ok(r.ok, atrib);
    assert.ok(r.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), `sem alerta TRANSCRIÇÃO para «${atrib}»`);
  }
  // a voz do relator depois da atribuição não é transcrição
  const r = conferirTrecho(VOTO_STJ("STJ - REsp 1.578.553/SP, Rel."), "No caso dos autos, a contratação não foi comprovada", "VOTO");
  assert.ok(r.ok && !r.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")));
});

test("leva B (9): item da lista 'Jurisprudência relevante citada' da ementa da CASA não vira transcrição", () => {
  const t = "RELATÓRIO Apelação. VOTO Nego provimento ao recurso. É como voto. EMENTA DIREITO DO CONSUMIDOR. APELAÇÃO CÍVEL. CARTÃO CONSIGNADO. " +
    "I. CASO EM EXAME 1. Apelação contra sentença. IV. DISPOSITIVO E TESE 2. Recurso desprovido. Dispositivos relevantes citados: CDC, art. 14. " +
    "Jurisprudência relevante citada: STJ, Súmula 54; TJRO, Apelação nº 0003210-74.2013.822.0015, Rel. Des. Fulano, j. 25.02.2016. " +
    "ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE.";
  const fx = faixasAlheias(t, "ACÓRDÃO");
  assert.deepEqual(fx.transcritas, []);
  const tn = norm1(t);
  assert.equal(atribuicoes(tn).length, 0);
});

test("leva B (9): o relator que retoma com 'Portanto,' depois da atribuição não entra no bloco seguinte", () => {
  const t = "VOTO O STJ possui jurisprudência consolidada sobre o tema: \"É devido o reembolso integral das despesas feitas pelo segurado fora da rede credenciada.\" — STJ, REsp 2.228.094, 3ª Turma, Rel. Min. Fulano, nov./2025. " +
    "Portanto, enquanto não houver rede credenciada no município, o reembolso deve ser integral. Dos danos morais A ré invocou o Tema 1.365/STJ (REsp nº 2.197.574/SP, Segunda Seção, j. 11/03/2026) para sustentar a tese. É como voto.";
  const r = conferirTrecho(t, "enquanto não houver rede credenciada no município, o reembolso deve ser integral", "VOTO");
  assert.ok(r.ok && !r.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), JSON.stringify(r.alertas));
  // e a frase do STJ, antes da referência, É transcrição
  const q = conferirTrecho(t, "É devido o reembolso integral das despesas feitas pelo segurado fora da rede credenciada", "VOTO");
  assert.ok(q.ok && q.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), JSON.stringify(q.alertas));
});

// ---------- (10) robustez ----------
test("leva B (10): limpar() é linear com <script>/<style> sem fechamento e '<' sem '>', e dá a mesma saída da regex antiga", () => {
  const velho = (t) => t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const velhoTags = (t) => t.replace(/<[^>]+>/g, " ");
  for (const s of ["a<script>x</script>b", "a<SCRIPT type=x>x</script>b<style>y</STYLE>c", "<script>sem fecho<style>z</style>", "<style>a</script>b</style>c", "<scripts>x</scripts>", "x<script", "<<a>b<>c<", "a<p>b</p>"]) {
    assert.equal(semScriptStyle(s), velho(s), s);
    assert.equal(semTags(s), velhoTags(s), s);
  }
  let t0 = Date.now();
  assert.equal(limpar("<script>".repeat(120000) + " fim", 0), "fim");
  limpar("<script".repeat(120000), 0);
  assert.ok(Date.now() - t0 < 2000, `limpar levou ${Date.now() - t0} ms`);
});

test("leva B (10): faixasDeclaradas linear com anúncios repetidos sem retorno; resultado de texto normal intacto", () => {
  const bruto = "Sentença, nos seguintes termos: Lorem ipsum dolor. ".repeat(16000);
  const t0 = Date.now();
  assert.deepEqual(faixasDeclaradas(norm1(bruto), bruto), []);
  assert.ok(Date.now() - t0 < 1500, `faixasDeclaradas levou ${Date.now() - t0} ms`);
  // com retorno: o bloco ainda é marcado
  const b2 = "VOTO O juízo proferiu a sentença nos seguintes termos: " + "Julgo procedente o pedido e condeno a ré ao pagamento da indenização por danos morais fixada. ".repeat(4) + "Irresignada, a apelante sustenta o contrário. Nego provimento.";
  const f = faixasDeclaradas(norm1(b2), b2);
  assert.equal(f.length, 1);
  assert.match(b2.slice(f[0][0], f[0][1]), /condeno a ré/);
  assert.doesNotMatch(b2.slice(f[0][0], f[0][1]), /Irresignada/);
});

test("leva B (10): ligadura (ﬁ, ﬂ) no documento ou no trecho não dá 'NÃO ENCONTRADO'", () => {
  assert.equal(expandirLigaduras("inﬂação ﬁnanceira ﬀ ﬃ ﬄ ﬆ"), "inflação financeira ff ffi ffl st");
  const doc = "VOTO A instituição ﬁnanceira ré não comprovou a contratação do serviço de seguro.";
  assert.ok(conferirTrecho(doc, "A instituição financeira ré não comprovou a contratação do serviço", "VOTO").ok);
  assert.ok(conferirTrecho(doc.replace("ﬁ", "fi"), "A instituição ﬁnanceira ré não comprovou a contratação do serviço", "VOTO").ok);
  assert.equal(limpar("<p>Indeﬁro o pedido</p>", 0), "Indefiro o pedido");
});

test("leva B (10): disco cheio no meio de gravarRecibos — temporário removido, gravados entram no índice de poda", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-leva-b-enospc-"));
  const hits = [1, 2, 3, 4, 5, 6].map((i) => ({ _source: { id_processo_documento: 2000 + i, tipo: "ACÓRDÃO", nr_processo: "70000013420248220001", ds_modelo_documento: `Acórdão sintético número ${i} com texto suficiente.` } }));
  const original = fs.writeFileSync;
  let k = 0;
  fs.writeFileSync = function (f, ...resto) {
    if (String(f).endsWith(".tmp") && !String(f).includes("busca-indice") && ++k === 4) {
      original.call(fs, f, "parcial");
      const e = new Error("ENOSPC: no space left on device"); e.code = "ENOSPC"; throw e;
    }
    return original.call(fs, f, ...resto);
  };
  let n;
  try { n = gravarRecibos({ hits: { hits } }, pasta, { origem: "busca" }); } finally { fs.writeFileSync = original; }
  assert.equal(n, 3);
  const arqs = fs.readdirSync(pasta).sort();
  assert.ok(!arqs.some((f) => f.endsWith(".tmp")), `temporário órfão: ${arqs}`);
  const idx = JSON.parse(fs.readFileSync(path.join(pasta, ".busca-indice.json"), "utf8"));
  assert.deepEqual(Object.keys(idx).sort(), ["2001", "2002", "2003"]);
  // a poda alcança os gravados
  assert.equal(podarRecibosDeBusca(pasta, 10), 3);
  // temporário órfão antigo (outro processo) sai na poda; o recente fica
  const velho = path.join(pasta, ".2009.99999.tmp"), novo = path.join(pasta, ".2010.99999.tmp");
  fs.writeFileSync(velho, "x"); fs.writeFileSync(novo, "x");
  const antigo = (Date.now() - TMP_ORFAO_MS - 60_000) / 1000;
  fs.utimesSync(velho, antigo, antigo);
  podarRecibosDeBusca(pasta, 10);
  assert.ok(!fs.existsSync(velho));
  assert.ok(fs.existsSync(novo));
});
