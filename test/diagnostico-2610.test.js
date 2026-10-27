// 1.41.11 (não publicada) — itens de ATRIBUIÇÃO do diagnóstico de uso de 26/10/2026 (5, 6, 7, 9, 10). Sem rede, sem portal:
// recibos sintéticos em os.tmpdir(); a busca de inteiro teor é simulada; o lint só é LIDO da skill instalada (pulado sem ela).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { conferirTrecho, verificarCitacao } from "../server/verificar.js";
import { auditarCitacoes } from "../server/auditoria.js";
import { camposDeVoz } from "../server/voz.js";
import { recibo, formatInteiro, formatBusca, rotuloDatas } from "../server/lib.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

const NR = "70000013420248220001"; // 7000001-34.2024.8.22.0001 (dígito válido)
const NR2 = "70000025020238220002"; // 7000002-50.2023.8.22.0002
const fecho = (c, data = "") => ` ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da ${c} do Tribunal de Justiça do Estado de Rondônia, em, RECURSO NÃO PROVIDO, À UNANIMIDADE.${data ? ` Porto Velho, ${data} Desembargador FULANO DE TAL` : ""}`;
function pasta(docs) {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-diag2610-"));
  for (const s of docs) { const r = recibo(s); fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r)); }
  return p;
}

// ------------------------------------------------------------------------------------------------ item 5 ---
test("(5) trecho fora do id informado, mas em outro documento do mesmo processo: o ❌ aponta o documento e o tipo", async () => {
  const frase = "a contratação eletrônica exige prova da autenticação biométrica do consumidor";
  const p = pasta([
    { id_processo_documento: 801, nr_processo: NR, tipo: "VOTO", dtjulgamento_str: "10/03/2025", ds_modelo_documento: "VOTO O recurso é tempestivo. Ante o exposto, nego provimento. É como voto." },
    { id_processo_documento: 802, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "10/03/2025", ds_modelo_documento: `RELATÓRIO Trata-se de apelação. VOTO Entendo que ${frase}, o que não houve. Nego provimento. É como voto.` + fecho("1ª Câmara Cível") },
  ]);
  let chamou = false;
  const out = await verificarCitacao({ id_documento: "801", trecho: frase, pasta: p, buscar: async () => { chamou = true; throw new Error("sem rede"); } });
  assert.equal(chamou, false, "não vai ao portal");
  const l801 = out.split("\n").find((l) => / · id 801 · /.test(l));
  assert.match(l801, /^❌ NÃO ENCONTRADO/);
  assert.match(out, /↪ NÃO está no id 801, mas ESTÁ no documento 802 \(tipo ACÓRDÃO, julgado em 10\/03\/2025, mesmo julgamento\) do mesmo processo/);   // 1.42.0: diz se é o mesmo julgamento
  assert.match(out, /❌ no id informado \(801\)/);
  // o outro documento leva o próprio selo (voto: nunca ✅ pleno)
  assert.match(out.split("\n").find((l) => / · id 802 · /.test(l)), /^✅ LITERAL, VOZ NÃO CONFIRMADA/);
  // trecho em nenhum: sem ponteiro, o ❌ final continua
  const nada = await verificarCitacao({ id_documento: "801", trecho: "a frase que não está em documento algum deste processo", pasta: p });
  assert.doesNotMatch(nada, /↪/);
  assert.match(nada, /❌ Em nenhum documento/);
});

// ------------------------------------------------------------------------------------------------ item 6 ---
const acSemVoto = (meio) => `Poder Judiciário do Estado de Rondônia 1ª Câmara Cível RELATÓRIO Trata-se de apelação interposta pelo banco. O apelante sustenta que a contratação foi regular. ${meio} A contratação eletrônica sem prova da autenticação do consumidor não produz efeito contra ele. Ante o exposto, nego provimento ao recurso. É como voto. EMENTA Apelação cível. Contrato bancário. Recurso desprovido.` + fecho("1ª Câmara Cível");
const TR6 = "A contratação eletrônica sem prova da autenticação do consumidor não produz efeito contra ele";
const pos = (r) => (r.notas.find((n) => n.startsWith("POSIÇÃO")) || "");
test("(6) acórdão sem cabeçalho VOTO: 'É o relatório.' / 'Presentes os requisitos de admissibilidade' / 'Voto.' abrem o voto", () => {
  for (const marca of ["É o relatório.", "É o breve relatório. Decido.", "Presentes os requisitos de admissibilidade, conheço do recurso.", "Feito o relatório, passo a decidir.", "Passa-se à decisão.", "Voto. Conheço do recurso."]) {
    const r = conferirTrecho(acSemVoto(marca), TR6, "ACÓRDÃO");
    assert.equal(r.ok, true, marca);
    assert.match(pos(r), /fundamentação do voto do relator/, marca);
    assert.equal(r.naoEVoz, false, marca);
    assert.equal(r.vozConfirmada, false, "voto nunca vira voz confirmada");   // o selo fica "VOZ NÃO CONFIRMADA", nunca ✅ pleno
  }
});
test("(6) sem marca, continua RELATÓRIO; a narração antes da marca continua RELATÓRIO", () => {
  const r = conferirTrecho(acSemVoto(""), TR6, "ACÓRDÃO");
  assert.match(pos(r), /RELATÓRIO/);
  const rel = conferirTrecho(acSemVoto("É o relatório."), "Trata-se de apelação interposta pelo banco", "ACÓRDÃO");
  assert.match(pos(rel), /RELATÓRIO/);
  assert.equal(rel.naoEVoz, true);
  // "presentes os requisitos" narrado no meio de frase do relatório não abre o voto
  const narr = conferirTrecho(acSemVoto("A decisão agravada entendeu presentes os requisitos de admissibilidade do pedido."), TR6, "ACÓRDÃO");
  assert.match(pos(narr), /RELATÓRIO/);
});

// ------------------------------------------------------------------------------------------------ item 7 ---
const TESE = "A instituição financeira responde pela contratação eletrônica sem prova de autenticação válida";
const EMENTAS7 = [
  `Direito do consumidor. Apelação cível. I. CASO EM EXAME 1. Apelação contra sentença. O apelante sustenta que a contratação foi regular. II. QUESTÃO EM DISCUSSÃO 2. A questão em discussão consiste em saber se houve fraude. III. RAZÕES DE DECIDIR 3. O banco não provou a autenticação. IV. DISPOSITIVO E TESE 4. Recurso desprovido. Tese de julgamento: "${TESE}". Dispositivos relevantes citados: CDC, art. 14.`,
  `Direito do consumidor. Caso em exame: Apelação contra sentença. O apelante sustenta que a contratação foi regular. Questão em discussão: saber se houve fraude. Razões de decidir: O banco não provou a autenticação. Dispositivo e tese: Recurso desprovido. Tese de julgamento: ${TESE}.`,
  `RECURSO DESPROVIDO. CASO EM EXAME Apelação. O apelante alega que a contratação foi regular. QUESTÃO EM DISCUSSÃO Saber se houve fraude. RAZÕES DE DECIDIR O banco não provou. DISPOSITIVO E TESE Recurso desprovido. Tese de julgamento: ${TESE}.`,
];
test("(7) tese da seção IV da ementa: fora das faixas de ALEGAÇÃO DA PARTE do recibo e sem o alerta no verificador (já corrigido)", () => {
  for (const e of EMENTAS7) {
    const c = camposDeVoz(e, "EMENTA");
    assert.ok(c.trechos_alegacao_parte.length >= 1, "a alegação do caso em exame continua marcada");
    assert.ok(!c.trechos_alegacao_parte.some((x) => x.includes("autenticação válida")), JSON.stringify(c.trechos_alegacao_parte));
    const r = conferirTrecho(e, TESE, "EMENTA");
    assert.ok(!r.alertas.some((a) => a.startsWith("ALEGAÇÃO")), r.alertas.join(" | "));
    assert.match(pos(r), /IV\. DISPOSITIVO E TESE/);
  }
});
const LINT = process.env.TJRO_LINT_CITACOES || path.join(os.homedir(), ".claude/skills/peticao-rg/scripts/lint_citacoes.py");
test("(7) lint da peticao-rg: a tese da seção IV não leva aviso de ALEGAÇÃO DA PARTE; o relato da seção I leva", { skip: fs.existsSync(LINT) ? false : `lint ausente em ${LINT}` }, () => {
  const p = pasta([{ id_processo_documento: 900870, nr_processo: NR, tipo: "EMENTA", dtjulgamento_str: "10/03/2025", ds_modelo_documento: EMENTAS7[0] }]);
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(LINT))})
from lint_citacoes import lint
d, trecho = sys.argv[1:3]
ficha = {"chave": "7000001-34.2024.8.22.0001", "tribunal": "TJRO", "orgao": "1ª Câmara Cível", "orgao_fonte": "fecho", "relator": "Des. Fulano",
         "julgamento": "2025-03-10", "id_documento": "900870", "verificado_em": "2026-10-26", "verificacao": "inteiro teor lido", "trecho": trecho}
cita = [{"tipo": "paragrafo", "texto": "Nesse sentido (TJRO, 7000001-34.2024.8.22.0001, 1ª Câmara Cível, Rel. Des. Fulano, j. 10/03/2025)."}]
r = lint({"blocks": cita, "dir_recibos": d, "precedentes": [ficha]})
print(json.dumps({"erros": r.erros, "avisos": r.avisos}, ensure_ascii=False))
`;
  const roda = (tr) => JSON.parse(execFileSync("python3", ["-c", py, p, tr], { encoding: "utf8" }));
  const tese = roda(TESE);
  assert.ok(![...tese.erros, ...tese.avisos].some((x) => /ALEGAÇÃO/.test(x)), JSON.stringify(tese));
  const rel = roda("que a contratação foi regular");
  assert.ok([...rel.erros, ...rel.avisos].some((x) => /ALEGAÇÃO/.test(x)), JSON.stringify(rel));
});

// ------------------------------------------------------------------------------------------------ item 9 ---
function pasta9() {
  return pasta([
    { id_processo_documento: 911, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "21/11/2023", ds_modelo_documento: "Relator: Des. SANSÃO SALDANHA RELATÓRIO Trata-se de apelação. VOTO Nego provimento." + fecho("1ª Câmara Cível") },
    { id_processo_documento: 912, nr_processo: NR2, tipo: "ACÓRDÃO", dtjulgamento_str: "05/03/2024", ds_modelo_documento: "Relator: Des. RADUAN MIGUEL FILHO RELATÓRIO Trata-se de apelação. VOTO Nego provimento." + fecho("3ª Câmara Cível") },
  ]);
}
const linha = (out, nr) => out.split("\n").find((l) => l.includes(nr)) || "";
test("(9) parágrafo com dois julgados de câmaras diferentes: cada câmara/relator fica com o seu número", () => {
  const p = pasta9();
  const out = auditarCitacoes("O entendimento é firme na 1ª Câmara Cível (Apelação 7000001-34.2024.8.22.0001, 1ª Câmara Cível, Rel. Des. Sansão Saldanha) e na 3ª Câmara Cível (Apelação 7000002-50.2023.8.22.0002, 3ª Câmara Cível, Rel. Des. Raduan Miguel Filho).", p);
  assert.match(linha(out, "7000001-34"), /^✅ .*Bate com a peça: câmara, relator/);
  assert.match(linha(out, "7000002-50"), /^✅ .*Bate com a peça: câmara, relator/);
});
test("(9) sem falso ✅: câmara errada dentro do parêntese continua 🔴; câmara dita depois do parêntese ainda é conferida", () => {
  const p = pasta9();
  const errado = auditarCitacoes("Na 1ª Câmara Cível (Apelação 7000001-34.2024.8.22.0001, 3ª Câmara Cível, Rel. Des. Sansão Saldanha) e na 3ª Câmara Cível (Apelação 7000002-50.2023.8.22.0002, 3ª Câmara Cível).", p);
  assert.match(linha(errado, "7000001-34"), /^🔴 .*a peça diz 3ª Câmara Cível, o FECHO diz 1ª Câmara Cível/);
  assert.match(linha(errado, "7000002-50"), /^✅/);
  // o parêntese não diz câmara: o que vem depois dele volta a valer para ele (comportamento anterior, conservador)
  const depois = auditarCitacoes("Ver (Apelação 7000001-34.2024.8.22.0001), julgada pela 3ª Câmara Cível, e (Apelação 7000002-50.2023.8.22.0002, 3ª Câmara Cível).", p);
  assert.match(linha(depois, "7000001-34"), /^🔴 .*a peça diz 3ª Câmara Cível/);
  // número único: nada muda
  assert.match(linha(auditarCitacoes("(Apelação 7000001-34.2024.8.22.0001, 3ª Câmara Cível)", p), "7000001-34"), /^🔴/);
});

// ------------------------------------------------------------------------------------------------ item 10 ---
test("(10) cabeçalho de cada julgamento: sessão (fecho) · índice, ou 'só índice'", () => {
  const ac = { tipo: "ACÓRDÃO", dtjulgamento_str: "04/09/2026" };
  const corpo = "VOTO Nego provimento." + fecho("1ª Câmara Cível", "28 de agosto de 2026");
  assert.equal(rotuloDatas(corpo, ac), "sessão (fecho): 28/08/2026 · índice: 04/09/2026");
  assert.match(rotuloDatas("VOTO Nego provimento.", ac), /^só índice: 04\/09\/2026/);
  assert.match(rotuloDatas(corpo, { tipo: "EMENTA", dtjulgamento_str: "04/09/2026" }), /^só índice: 04\/09\/2026/);
  const hit = (id, tipo, txt) => ({ _source: { id_processo_documento: id, nr_processo: NR, tipo, dtjulgamento_str: "04/09/2026", ds_classe_judicial: "Apelação Cível", ds_orgao_julgador_colegiado: "3ª Câmara Cível", ds_modelo_documento: txt } });
  const it = formatInteiro({ hits: { total: { value: 2 }, hits: [hit(1, "ACÓRDÃO", corpo), hit(2, "EMENTA", "Apelação cível. Recurso desprovido.")] } }, NR);
  assert.match(it, /## ACÓRDÃO[^\n]*\n📅 sessão \(fecho\): 28\/08\/2026 · índice: 04\/09\/2026/);
  assert.match(it, /## EMENTA[^\n]*\n📅 só índice: 04\/09\/2026/);
  const bu = formatBusca({ hits: { total: { value: 1 }, hits: [hit(1, "ACÓRDÃO", corpo)] } }, "contrato", ["ACÓRDÃO"], "relevantes", 1, 10);
  assert.match(bu, /Julgado em: 04\/09\/2026 \(sessão \(fecho\): 28\/08\/2026 · índice: 04\/09\/2026\)/);
});

// ===================================================================== itens de FLUXO (1 a 4) do mesmo diagnóstico ===
import * as L from "../server/lib.js";
import { lerTrechoDoRecibo } from "../server/recibos.js";

function ritmoCheio() {
  L._setArquivoEstadoParaTeste(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tjro-diag2610-ritmo-")), "estado.json"));
  L._resetDisjuntorParaTeste();
  const t0 = Date.now() - 5 * 60_000; // no passado: o saneamento descarta carimbo no futuro
  L.registrarBloqueioDetectado(t0, "busca", { subirEscada: true }); // nível 2: 10 consultas a cada 5 min
  for (let i = 0; i < 10; i++) assert.equal(L.reservarRequisicao(t0 + i * 7000, { ignorarBloqueio: true }).erro, undefined);
  return t0;
}

test("(1) aguardar: espera a vaga do limite de ritmo e então reserva; sem aguardar, o erro de antes", async () => {
  const t0 = ritmoCheio();
  let relogio = t0 + 5 * 60_000 - 20_000; // a 1ª consulta sai da janela em 20 s
  const dormidas = [];
  L._setDormirParaTeste(async (ms) => { dormidas.push(ms); relogio += ms; });
  try {
    // sem aguardar: erro de ritmo, nenhuma espera
    const sem = await L.comEspera(undefined, () => L.reservarComEspera({ ignorarBloqueio: true }), () => relogio);
    assert.match(sem.valor.erro, /tipo=limite_de_ritmo/);
    assert.equal(dormidas.length, 0);
    // com aguardar 30: dorme ~20 s e reserva; a vaga continua a 7 s da anterior (nada afrouxa)
    const com = await L.comEspera(30, () => L.reservarComEspera({ ignorarBloqueio: true }), () => relogio);
    assert.equal(com.valor.erro, undefined);
    assert.ok(com.esperouMs >= 20_000 && com.esperouMs <= 21_000, String(com.esperouMs));
    assert.match(L.notaDeEspera(com.esperouMs), /Esperou 2\d s/);
    // aguardar curto demais: erro que diz quanto falta; teto de 30 s mesmo pedindo mais
    const t1 = ritmoCheio();
    relogio = t1 + 5 * 60_000 - 100_000;
    const curto = await L.comEspera(999, () => L.reservarComEspera({ ignorarBloqueio: true }), () => relogio);
    assert.match(curto.valor.erro, /aguardar=30 s não basta/);
    assert.equal(L.normAguardar(999), 30);
    // diagnóstico diz que o teto é por máquina e mostra a janela
    assert.match(L.diagnosticoRitmo(relogio), /teto é POR MÁQUINA/);
    assert.match(L.linhaDeRitmo(relogio), /10 de 10 consultas na janela atual de 5 min.*por máquina/);
  } finally { L._setDormirParaTeste(null); L._resetDisjuntorParaTeste(); }
});

test("(2) HTTP 500 com consulta grande: diz o limite em grupos/termos e que a consulta contou no ritmo", () => {
  const g3 = [["a", "b", "c", "d"], ["e", "f", "g", "h"], ["i", "j", "k"]];
  assert.match(L.dicaConsultaGrande("HTTP 500", g3), /no máximo 2 grupos e 9 termos/);
  assert.match(L.notaErroContado("HTTP 500"), /CONTOU no limite de ritmo/);
  assert.equal(L.notaErroContado("tempo esgotado"), "");
});

test("(3) saída grande: corta abaixo do limite do cliente e diz a próxima página exata", () => {
  assert.ok(L.SAIDA_MAX_CHARS <= 60000);
  const t = "cab\n" + Array.from({ length: 40 }, (_, i) => `\n## R${i}\n` + "x".repeat(3000)).join("");
  const c = L.limitarSaida(t, undefined, { pagina: 1 });
  assert.ok(c.length < 62000);
  const m = /SAÍDA CORTADA: (\d+) de 40/.exec(c);
  assert.ok(m);
  assert.match(c, new RegExp(`proxima_pagina = pagina=2 com por_pagina=${m[1]}`));
  assert.doesNotMatch(L.limitarSaida(t, undefined, { pagina: 3 }), /proxima_pagina/);
});

test("(4) leitura por offset / trecho_em_torno_de sai do recibo local, sem portal", () => {
  const longo = "INÍCIO " + "palavra ".repeat(6000) + "o fecho diz acordam os Magistrados da 2ª Câmara Cível " + "fim ".repeat(500);
  const p = pasta([{ id_processo_documento: 901, nr_processo: NR, tipo: "ACÓRDÃO", dtjulgamento_str: "01/02/2025", ds_modelo_documento: longo }]);
  const a = lerTrechoDoRecibo({ id_documento: "901", offset: 0, pasta: p });
  assert.match(a, /sem consulta ao portal\), caracteres 0 a 25000 de \d+ .*continua: offset=25000/);
  const b = lerTrechoDoRecibo({ id_documento: "901", offset: 25000, pasta: p });
  assert.match(b, /caracteres 25000 a/);
  const c = lerTrechoDoRecibo({ id_documento: "901", trecho_em_torno_de: "ACORDAM os magistrados da 2ª camara", pasta: p });
  assert.match(c, /acordam os Magistrados da 2ª Câmara Cível/);
  const d = lerTrechoDoRecibo({ nr_processo: NR, offset: 0, pasta: p });
  assert.match(d, /id 901/);
  assert.match(lerTrechoDoRecibo({ id_documento: "999", offset: 0, pasta: p }), /Sem recibo local.*nenhuma consulta ao portal/);
  assert.match(lerTrechoDoRecibo({ id_documento: "901", trecho_em_torno_de: "inexistente xyz", pasta: p }), /não está no recibo/);
});

import { inicioDoVotoSemCabecalho } from "../server/posicao.js";
test("1.41.11 (reataque): 'É o relatório' dentro de sentença copiada sem aspas não abre o voto", () => {
  const t = "RELATÓRIO A sentença tem o seguinte teor: É o relatório. Decido. Julgo procedente o pedido. Irresignado, apela o banco. É o relatório. Passo a decidir. O recurso merece provimento.";
  const i = inicioDoVotoSemCabecalho(t, 0, t.length, { transcritas: [] });
  assert.ok(i > t.indexOf("Irresignado"), `início do voto em ${i}`);
});

test("1.41.11 (reataque 2): 'É o relatório' dentro de aspas ou após 'Transcrevo a sentença:' não abre o voto; 'Voto Vencido' não é rótulo de voto", () => {
  const t1 = "RELATÓRIO A sentença decidiu: “É o relatório. Passo a decidir. Frase X da sentença. Julgo improcedente.” O apelante recorre. É o relatório. Passo a decidir. O recurso merece provimento.";
  const fx1 = { transcritas: [], aspas: [[t1.indexOf("“"), t1.indexOf("”") + 1]] };
  assert.ok(inicioDoVotoSemCabecalho(t1, 0, t1.length, fx1) > t1.indexOf("O apelante recorre"));
  const t2 = "RELATÓRIO Transcrevo a sentença: É o relatório. Decido. Julgo improcedente. O apelante recorre. É o relatório. Passo a decidir. Provejo.";
  assert.ok(inicioDoVotoSemCabecalho(t2, 0, t2.length, { transcritas: [], aspas: [] }) > t2.indexOf("O apelante recorre"));
});
