// Pendências de desenho de 24/10/2026 (1.41.9) — regressão sintética, sem rede, recibos só em os.tmpdir().
// (1) recibo/lint passam a ver ALEGAÇÃO DA PARTE, DOUTRINA e SENTENÇA TRANSCRITA (antes só o verificador via);
// (2) relator vencido em grafia antiga: medido, NÃO mudou — o teste fixa a decisão ("vencido em parte o relator" não é vencido);
// (3) conteúdo de concessiva negativa ("ainda que não…, dou provimento") leva OBITER DICTUM? (concessiva);
// (4) bloco "[...]" anunciado como a sentença sai SENTENÇA TRANSCRITA, não TRANSCRIÇÃO; "Razão de decidir" no singular é seção III.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recibo } from "../server/lib.js";
import { conferirTrecho, posicaoNoJulgado } from "../server/verificar.js";
import { faixasAlheias, norm1, CUSTODIA_VERSAO } from "../server/custodia.js";
import { recalcularRecibos, _limparMemoParaTeste } from "../server/recibos.js";
import { auditarCitacoes, relatorVencidoNoFecho } from "../server/auditoria.js";

const LINT = process.env.TJRO_LINT_CITACOES || path.join(os.homedir(), ".claude/skills/peticao-rg/scripts/lint_citacoes.py");
const semLint = fs.existsSync(LINT) ? false : `lint de citações ausente em ${LINT}`;
const NR = "7000000-00.2020.8.22.0001";
const FECHO = "ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Desembargadores da 2ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata, em, RECURSO PROVIDO À UNANIMIDADE. Porto Velho, 14 de março de 2025.";
const EMENTA_CASA = "EMENTA DIREITO DO CONSUMIDOR. APELAÇÃO CÍVEL. TARIFA DE REGISTRO. I. CASO EM EXAME 1. Apelação contra sentença de improcedência. O apelante sustenta que a cobrança da tarifa de registro de contrato é indevida por ausência de registro no órgão de trânsito. II. QUESTÃO EM DISCUSSÃO 2. Saber se a tarifa é devida. III. RAZÕES DE DECIDIR 3. A cobrança da tarifa de avaliação só é válida quando o serviço é efetivamente prestado ao consumidor contratante. IV. DISPOSITIVO 4. Recurso provido. ";
const ACORDAO =
  "RELATÓRIO Trata-se de apelação interposta contra a sentença que julgou improcedentes os pedidos. O apelante sustenta que a tarifa de avaliação do bem é abusiva porque o serviço nunca foi prestado ao consumidor. " +
  "Requer, ao final, condenar o réu à restituição da tarifa de avaliação do bem em dobro, com juros desde a citação. É o relatório. " +
  "VOTO Conheço do recurso. Sobre o tema, Araken de Assis, que leciona: A execução forçada pressupõe título líquido, certo e exigível, sem o qual nenhum ato executivo pode ser praticado validamente pelo órgão judiciário. (ASSIS, Araken de. Manual da execução. 2020, p. 120). " +
  "Na sentença, o juízo de origem consignou: Os documentos apresentados pela instituição financeira comprovam a contratação regular do financiamento pelo autor, com assinatura e documentos pessoais. " +
  "No caso dos autos, a avaliação do veículo não foi comprovada, razão pela qual a cobrança é indevida e deve ser restituída. " +
  "Ante o exposto, dou provimento ao recurso para condenar o réu à restituição da tarifa de avaliação do bem, de forma simples. É como voto. " +
  EMENTA_CASA + FECHO;
const T = {
  alegacao: "a tarifa de avaliação do bem é abusiva porque o serviço nunca foi prestado ao consumidor",
  doutrina: "A execução forçada pressupõe título líquido, certo e exigível, sem o qual nenhum ato executivo pode ser praticado",
  sentenca: "Os documentos apresentados pela instituição financeira comprovam a contratação regular do financiamento pelo autor",
  casa: "a avaliação do veículo não foi comprovada, razão pela qual a cobrança é indevida e deve ser restituída",
  dispositivo: "para condenar o réu à restituição da tarifa de avaliação do bem, de forma simples",
  casoEmExame: "a cobrança da tarifa de registro de contrato é indevida por ausência de registro no órgão de trânsito",
  razoes: "A cobrança da tarifa de avaliação só é válida quando o serviço é efetivamente prestado ao consumidor",
};
const contem = (lista, s) => (lista || []).some((b) => norm1(b).replace(/\s+/g, " ").includes(norm1(s)));

// ------------------------------------------------------------------------------------------------- (1) recibo ---
test("(1) o recibo leva ALEGAÇÃO DA PARTE, DOUTRINA e SENTENÇA TRANSCRITA nas mesmas regiões do verificador", () => {
  const r = recibo({ id_processo_documento: 930001, nr_processo: NR, tipo: "ACÓRDÃO", ds_modelo_documento: ACORDAO });
  assert.equal(r.custodia_v, CUSTODIA_VERSAO);
  assert.ok(contem(r.trechos_alegacao_parte, T.alegacao), JSON.stringify(r.trechos_alegacao_parte));
  assert.ok(contem(r.trechos_alegacao_parte, T.casoEmExame), "seção I da ementa da casa (relato da parte) fora da faixa");
  assert.ok(contem(r.trechos_doutrina, T.doutrina), JSON.stringify(r.trechos_doutrina));
  assert.ok(contem(r.trechos_sentenca_transcrita, T.sentenca), JSON.stringify(r.trechos_sentenca_transcrita));
  for (const k of ["trechos_alegacao_parte", "trechos_doutrina", "trechos_sentenca_transcrita"]) {
    assert.ok(!contem(r[k], T.casa), `voz do relator caiu em ${k}`);
    assert.ok(!contem(r[k], T.razoes), `razões de decidir da ementa caíram em ${k}`);
  }
  // o verificador diz o mesmo dos mesmos trechos
  const v = (t) => conferirTrecho(ACORDAO, t, "ACÓRDÃO").alertas.map((a) => a.split(":")[0]);
  assert.ok(v(T.alegacao).includes("ALEGAÇÃO DA PARTE"));
  assert.ok(v(T.doutrina).includes("DOUTRINA"));
  assert.ok(v(T.sentenca).includes("SENTENÇA TRANSCRITA"));
  assert.deepEqual(v(T.casa), []);
});

test("(1) ementa avulsa do CNJ: só as seções I e II entram como alegação", () => {
  const r = recibo({ id_processo_documento: 930002, nr_processo: NR, tipo: "EMENTA", ds_modelo_documento: EMENTA_CASA });
  assert.ok(contem(r.trechos_alegacao_parte, T.casoEmExame));
  assert.ok(!contem(r.trechos_alegacao_parte, T.razoes));
  assert.deepEqual([r.trechos_doutrina, r.trechos_sentenca_transcrita], [[], []]);
});

test("(1) recalcularRecibos leva o recibo da custódia v4 à v5 com os campos novos", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-pend-recalc-"));
  const r = recibo({ id_processo_documento: 930003, nr_processo: NR, tipo: "ACÓRDÃO", ds_modelo_documento: ACORDAO });
  for (const k of ["trechos_alegacao_parte", "trechos_doutrina", "trechos_sentenca_transcrita"]) delete r[k];
  fs.writeFileSync(path.join(pasta, "930003.json"), JSON.stringify({ ...r, custodia_v: 4 }));
  const res = await recalcularRecibos({ pasta });
  assert.equal(res.regravados, 1);
  const novo = JSON.parse(fs.readFileSync(path.join(pasta, "930003.json"), "utf8"));
  assert.equal(novo.custodia_v, CUSTODIA_VERSAO);
  assert.ok(contem(novo.trechos_alegacao_parte, T.alegacao));
});

// --------------------------------------------------------------------------------------------------- (1) lint ---
function lint(dir, ident, trecho) {
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(LINT))})
from lint_citacoes import lint
dir_recibos, ident, trecho = sys.argv[1:4]
ficha = {"chave": ${JSON.stringify(NR)}, "tribunal": "TJRO", "orgao": "2ª Câmara Cível", "orgao_fonte": "fecho",
         "relator": "Des. Fulano", "julgamento": "2025-03-14", "id_documento": ident,
         "verificado_em": "2026-10-24", "verificacao": "inteiro teor lido", "trecho": trecho}
cita = [{"tipo": "paragrafo", "texto": "Nesse sentido (TJRO, ${NR}, 2ª Câmara Cível, Rel. Des. Fulano, j. 14/03/2025)."}]
r = lint({"blocks": cita, "dir_recibos": dir_recibos, "precedentes": [ficha]})
print(json.dumps({"erros": r.erros, "avisos": r.avisos}, ensure_ascii=False))
`;
  return JSON.parse(execFileSync("python3", ["-c", py, dir, ident, trecho], { encoding: "utf8" }));
}
test("(1) lint: alegação, doutrina e sentença avisam; voz do relator e dispositivo com as palavras do pedido não", { skip: semLint }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-pend-lint-"));
  const r = recibo({ id_processo_documento: 930004, nr_processo: NR, tipo: "ACÓRDÃO", ds_modelo_documento: ACORDAO });
  fs.writeFileSync(path.join(dir, "930004.json"), JSON.stringify(r));
  const av = (t) => { const x = lint(dir, "930004", t); assert.deepEqual(x.erros, [], t); return x.avisos.join(" | "); };
  assert.match(av(T.alegacao), /ALEGAÇÃO/);
  assert.match(av(T.casoEmExame), /ALEGAÇÃO/);              // na ementa da casa (voz própria), mas é a tese da parte
  assert.match(av(T.doutrina), /lição doutrinária/);
  assert.match(av(T.sentenca), /1º grau falando/);
  assert.doesNotMatch(av(T.casa), /ALEGAÇÃO|doutrin|1º grau/);
  assert.doesNotMatch(av(T.razoes), /ALEGAÇÃO|doutrin|1º grau/);
  assert.doesNotMatch(av(T.dispositivo), /ALEGAÇÃO/);      // 6 palavras iguais às do pedido, mas a maioria do trecho está no dispositivo
});

// ---------------------------------------------------------------------------------------------- (2) vencido ---
test("(2) 'VENCIDO EM PARTE O RELATOR' (TJRO, art. 942): o relator que assina continua confirmando — medido, sem mudança", () => {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-pend-venc-"));
  const texto = "Relator: Desembargador JORGE LUIZ DOS SANTOS LEAL\nRELATÓRIO Apelação. VOTO Dou parcial provimento. É como voto. " +
    "ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da(o) 2ª Câmara Especial do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata de julgamentos, em, RECURSOS PARCIALMENTE PROVIDOS, POR MAIORIA. VENCIDO EM PARTE O RELATOR E DES. HIRAM SOUZA MARQUES. JULGADO CONFORME A TÉCNICA DO ART. 942 DO CPC. Porto Velho, 25 de setembro de 2026 Desembargador JORGE LUIZ DOS SANTOS LEAL Relator";
  const r = recibo({ id_processo_documento: 930005, nr_processo: "70000013420248220001", tipo: "ACÓRDÃO", dtjulgamento_str: "25/09/2026", ds_modelo_documento: texto });
  fs.writeFileSync(path.join(p, "930005.json"), JSON.stringify(r));
  assert.equal(relatorVencidoNoFecho(texto, "25/09/2026", { tipo: "ACÓRDÃO" }).vencido, false);
  const num = "7000001-34.2024.8.22.0001";
  const l = auditarCitacoes(`TJRO, Apelação Cível n. ${num}, 2ª Câmara Especial, Rel. Jorge Luiz dos Santos Leal, j. 25/09/2026.`, p).split("\n").find((x) => x.includes(num)) || "";
  assert.match(l, /^✅/, l);
});

// ------------------------------------------------------------------------------------------- (3) concessiva ---
const VOTO_C = "VOTO Conheço do recurso. Ainda que não se trate de matéria de ordem pública, dou provimento ao recurso para afastar a multa aplicada na origem. " +
  "Afirma ainda que não possui meios para efetuar a conversão do cartão em empréstimo consignado, por serem modalidades diferentes. " +
  "Apesar de devidamente intimado não houve apresentação de contrarrazões pelo apelado, conforme certidão. É como voto.";
const alertasC = (t) => conferirTrecho(VOTO_C, t, "VOTO").alertas;
test("(3) conteúdo de concessiva negativa: OBITER DICTUM? (concessiva); oração principal e falsas concessivas, não", () => {
  assert.ok(alertasC("não se trate de matéria de ordem pública").some((a) => a.startsWith("OBITER DICTUM? (concessiva)")));
  assert.ok(!alertasC("dou provimento ao recurso para afastar a multa aplicada na origem").some((a) => a.startsWith("OBITER")));
  assert.ok(!alertasC("Ainda que não se trate de matéria de ordem pública").some((a) => a.includes("concessiva")));   // conectivo no trecho
  assert.ok(!alertasC("não possui meios para efetuar a conversão do cartão").some((a) => a.includes("concessiva")));   // "afirma ainda que"
  assert.ok(!alertasC("não houve apresentação de contrarrazões pelo apelado").some((a) => a.includes("concessiva")));   // particípio
});

// -------------------------------------------------------------------------------------- (4) tipo de voz ---
const SENT = "No caso dos autos, a narrativa inicial apresentada pelo autor sugere a existência de um contrato estabelecido entre as partes, mas os documentos juntados pela ré demonstram a contratação regular, com validação biométrica e envio de documentos pessoais, inexistindo vício de consentimento.";
const TR = "RELATÓRIO Trata-se de recurso inominado interposto pelo autor contra a sentença. É o relatório. VOTO Conheço do recurso. O recorrente alega fraude na contratação. " +
  "Em sentença, consignou o juízo de origem: [...] " + SENT + " [...] A sentença, contudo, não pode ser integralmente mantida quanto aos honorários. É como voto. " +
  "EMENTA RECURSO INOMINADO. CONTRATO. Recurso parcialmente provido. ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Turma Recursal do Tribunal de Justiça do Estado de Rondônia, na conformidade da ata, em, RECURSO PARCIALMENTE PROVIDO À UNANIMIDADE. Porto Velho, 01 de outubro de 2026.";
test("(4) bloco transcrito anunciado como a sentença: SENTENÇA TRANSCRITA (o alerta continua); de outro julgado: TRANSCRIÇÃO", () => {
  assert.ok(faixasAlheias(TR, "ACÓRDÃO").transcritas.length >= 1);
  const a = conferirTrecho(TR, "os documentos juntados pela ré demonstram a contratação regular, com validação biométrica", "ACÓRDÃO").alertas;
  assert.ok(a.some((x) => x.startsWith("SENTENÇA TRANSCRITA:")), JSON.stringify(a));
  assert.ok(!a.some((x) => x.startsWith("TRANSCRIÇÃO:")));
  const outro = TR.replace("Em sentença, consignou o juízo de origem:", "Nesse sentido, já decidiu esta Corte:");
  const b = conferirTrecho(outro, "os documentos juntados pela ré demonstram a contratação regular, com validação biométrica", "ACÓRDÃO").alertas;
  assert.ok(b.some((x) => x.startsWith("TRANSCRIÇÃO:")), JSON.stringify(b));
  const disp = TR.replace("Em sentença, consignou o juízo de origem:", "Ante o exposto, dou provimento ao recurso para reformar a sentença, nos seguintes termos:");
  const c = conferirTrecho(disp, "os documentos juntados pela ré demonstram a contratação regular, com validação biométrica", "ACÓRDÃO").alertas;
  assert.ok(!c.some((x) => x.startsWith("SENTENÇA TRANSCRITA:")), "dispositivo do próprio voto não é sentença transcrita");
});

test("(4) 'III - Razão de decidir' no singular abre a seção III (voz da casa), e não estica a questão em discussão", () => {
  const ementa = "EMENTA APELAÇÃO CÍVEL. DANO MORAL. I - Caso em exame Apelação contra sentença que condenou a associação. II - Questão em discussão Consiste em averiguar a ocorrência do dano moral. III - Razão de decidir Descontos indevidos efetuados em benefício previdenciário acarretam dano moral presumido ao aposentado. IV - Dispositivo Recurso não provido.";
  const t = "Descontos indevidos efetuados em benefício previdenciário acarretam dano moral presumido";
  const i = ementa.indexOf(t);
  assert.match(posicaoNoJulgado(ementa, "EMENTA", i, i + t.length, faixasAlheias(ementa, "EMENTA")), /III\. RAZÕES DE DECIDIR/);
  const c = conferirTrecho(ementa, t, "EMENTA");
  assert.ok(c.notas.some((n) => n.startsWith("VOZ DA CASA")), JSON.stringify(c.notas));
});
