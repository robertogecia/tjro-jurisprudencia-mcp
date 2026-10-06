// v1.10.0 — verificar_citacao_tjro: literalidade + de quem é a frase. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { conferirTrecho, verificarCitacao, PISO_TRECHO_PALAVRAS, VAO_MAXIMO } from "../server/verificar.js";
import { recibo } from "../server/lib.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/custodia-tjro.json", import.meta.url), "utf8")).documentos;
const [acordao, voto] = fx;

test("conferirTrecho: literal tolerante a caixa, acento, pontuação e cortes [...]; piso de palavras; vão máximo", () => {
  const t = "RELATÓRIO. Trata-se de apelação. VOTO. A cessão de crédito não vale, em relação ao devedor, senão quando a este notificada. Assim, nego provimento. É como voto.";
  assert.equal(conferirTrecho(t, "a CESSAO de credito nao vale em relacao ao devedor", "VOTO").ok, true);
  assert.equal(conferirTrecho(t, "a cessão de crédito [...] senão quando a este notificada", "VOTO").ok, true);
  assert.equal(conferirTrecho(t, "a cessão de crédito vale sempre ao devedor", "VOTO").ok, false);
  const curto = conferirTrecho(t, "nego provimento", "VOTO");
  assert.equal(curto.ok, false);
  assert.match(curto.erro, new RegExp(`mínimo ${PISO_TRECHO_PALAVRAS} palavras`));
  // ordem dos fragmentos importa
  assert.equal(conferirTrecho(t, "senão quando a este notificada [...] a cessão de crédito não vale", "VOTO").ok, false);
  // vão maior que o máximo entre fragmentos
  const longe = "início da frase que interessa muito. " + "x ".repeat(VAO_MAXIMO) + " fim da frase que interessa muito.";
  const r = conferirTrecho(longe, "início da frase que interessa [...] fim da frase que interessa", "VOTO");
  assert.equal(r.ok, false);
  assert.match(r.erro, /não pode costurar/);
});

test("conferirTrecho: TRANSCRIÇÃO quando o trecho está em ementa de outro julgado copiada no voto", () => {
  const trecho = voto.texto.includes("A fraude praticada por terceiro que se passa por preposto da instituição caracteriza fortuito interno")
    ? "A fraude praticada por terceiro que se passa por preposto da instituição caracteriza fortuito interno" : null;
  assert.ok(trecho, "fixture mudou");
  const r = conferirTrecho(voto.texto, trecho, voto.tipo);
  assert.equal(r.ok, true);
  assert.ok(r.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), r.alertas.join(" | "));
  // fala do relator entre as transcrições: sem alerta de transcrição
  const proprio = conferirTrecho(voto.texto, "Assim, evidenciada a falha na prestação do serviço, correta a sentença ao reconhecer o dever de indenizar", voto.tipo);
  assert.equal(proprio.ok, true);
  assert.ok(!proprio.alertas.some((a) => a.startsWith("TRANSCRIÇÃO")), proprio.alertas.join(" | "));
});

test("conferirTrecho: VOTO DIVERGENTE no voto do relator vencido; VOZ DA CASA na ementa/fecho do acórdão", () => {
  const r = conferirTrecho(acordao.texto, "Pelo exposto, nego provimento ao agravo. É como voto.", acordao.tipo);
  assert.equal(r.ok, true);
  assert.ok(r.alertas.some((a) => a.startsWith("VOTO DIVERGENTE")), r.alertas.join(" | "));
  const tese = "A necessidade de maior dilação probatória inviabiliza a apreciação da matéria em sede de tutela de urgência";
  const casa = conferirTrecho(acordao.texto, tese, acordao.tipo);
  assert.equal(casa.ok, true);
  assert.deepEqual(casa.alertas, []);
  assert.ok(casa.notas.some((n) => n.startsWith("VOZ DA CASA")));
  // EMENTA nunca leva alerta de custódia
  const em = conferirTrecho("Apelação cível. Dano moral. Inscrição indevida. Recurso provido.", "dano moral inscrição indevida recurso provido", "EMENTA");
  assert.equal(em.ok, true);
  assert.deepEqual(em.alertas, []);
  assert.ok(em.notas[0].startsWith("VOZ DA CASA"));
});

test("conferirTrecho: ENTRE ASPAS, ALEGAÇÃO DA PARTE e NEGAÇÃO", () => {
  const aspas = 'VOTO. O apelante junta doutrina que diz: "o dano moral in re ipsa dispensa prova do prejuízo concreto". Todavia, não é o caso.';
  const r1 = conferirTrecho(aspas, "o dano moral in re ipsa dispensa prova do prejuízo concreto", "VOTO");
  assert.ok(r1.alertas.some((a) => a.startsWith("ENTRE ASPAS")), r1.alertas.join(" | "));
  const aleg = "VOTO. O apelante sustenta que a cobrança foi abusiva porque não houve contratação válida do serviço de seguro. Sem razão.";
  const r2 = conferirTrecho(aleg, "a cobrança foi abusiva porque não houve contratação válida", "VOTO");
  assert.ok(r2.alertas.some((a) => a.startsWith("ALEGAÇÃO DA PARTE")), r2.alertas.join(" | "));
  const neg = "VOTO. Não há que se falar em dano moral indenizável pela simples cobrança indevida de tarifa bancária. Nego provimento.";
  const r3 = conferirTrecho(neg, "dano moral indenizável pela simples cobrança indevida de tarifa", "VOTO");
  assert.ok(r3.alertas.some((a) => a.startsWith("NEGAÇÃO")), r3.alertas.join(" | "));
});

const pastaTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tjro-recibos-"));
const grava = (pasta, r) => fs.writeFileSync(path.join(pasta, `${r.id_documento}.json`), JSON.stringify(r));

test("verificarCitacao: lê o recibo local por id (zero rede), depois por número; sem recibo e sem buscar, orienta", async () => {
  const pasta = pastaTmp();
  const r = recibo({ id_processo_documento: 501, nr_processo: "70000000020258220001", tipo: voto.tipo, dtjulgamento_str: "01/02/2026", ds_modelo_documento: voto.texto });
  grava(pasta, r);
  const trecho = "Assim, evidenciada a falha na prestação do serviço, correta a sentença ao reconhecer o dever de indenizar";
  let out = await verificarCitacao({ id_documento: "501", trecho, pasta });
  assert.match(out, /^\*\*Verificação literal — id 501 \(TJRO, 1 documento\(s\), fonte: recibo local\)\*\*/);
  assert.match(out, /✅ LITERAL · id 501 · VOTO · 7000000-00\.2025\.8\.22\.0001 · julgado em 01\/02\/2026/);
  out = await verificarCitacao({ nr_processo: "7000000-00.2025.8.22.0001", trecho, pasta });
  assert.match(out, /fonte: recibo local/);
  out = await verificarCitacao({ nr_processo: "7000000-00.2025.8.22.0001", trecho: "frase que não existe em lugar nenhum do voto", pasta });
  assert.match(out, /❌ NÃO ENCONTRADO/);
  assert.match(out, /Em nenhum documento: não cite entre aspas/);
  out = await verificarCitacao({ id_documento: "999", trecho, pasta });
  assert.match(out, /^Sem recibo local para o id 999/);
  assert.match(await verificarCitacao({ trecho, pasta }), /^Informe o id do documento/);
  assert.match(await verificarCitacao({ id_documento: "501", trecho: "  ", pasta }), /^Informe o trecho/);
});

test("verificarCitacao: sem recibo, vai ao portal pelo número (função buscar injetada) e marca a fonte; erro vira NÃO REALIZADA", async () => {
  const pasta = pastaTmp();
  const trecho = "Assim, evidenciada a falha na prestação do serviço, correta a sentença ao reconhecer o dever de indenizar";
  let chamadas = 0;
  const buscar = async (d) => { chamadas++; assert.equal(d, "70000000020258220001"); return { hits: { hits: [{ _source: { id_processo_documento: 77, nr_processo: d, tipo: "VOTO", dtjulgamento_str: "01/02/2026", ds_modelo_documento: voto.texto } }] } }; };
  const out = await verificarCitacao({ nr_processo: "7000000-00.2025.8.22.0001", trecho, pasta, buscar });
  assert.equal(chamadas, 1);
  assert.match(out, /fonte: portal/);
  assert.match(out, /✅ LITERAL · id 77/);
  const falha = await verificarCitacao({ nr_processo: "7000000-00.2025.8.22.0001", trecho, pasta, buscar: async () => { throw new Error("bloqueio"); } });
  assert.match(falha, /^\[VERIFICAÇÃO NÃO REALIZADA\]/);
});

// v1.11.0 — ALEGAÇÃO DA PARTE remedida (era 33% de precisão no gabarito de 90 janelas rotuladas à mão; os exemplos abaixo
// são sintéticos: o gabarito real traz nomes de parte e fica fora do git, em harness/gold-alegacao.local.json).
import { alegacaoDaParte } from "../server/verificar.js";
import { norm1 } from "../server/custodia.js";
const aleg = (texto, trecho) => { const i = norm1(texto).indexOf(norm1(trecho)); assert.ok(i >= 0, "trecho fora do texto: " + trecho); return alegacaoDaParte(norm1(texto), i, i + trecho.length, texto); };

test("ALEGAÇÃO DA PARTE dispara no relato da tese da parte: verbo conjugado com sujeito, sujeito elíptico, razões, gerúndio, subjuntivo", () => {
  assert.equal(aleg("RELATÓRIO O banco apelante defende que a contratação ocorreu por meio eletrônico, com assinatura digital e validação biométrica do consumidor.", "assinatura digital e validação biométrica do consumidor"), true);
  // sujeito elíptico no início de frase ("Alega, ainda, que…", "No mérito, aduz que…")
  assert.equal(aleg("RELATÓRIO A autora ajuizou a ação. Alega, ainda, que a manutenção da decisão acarreta risco de dano irreversível ao imóvel residencial.", "a manutenção da decisão acarreta risco de dano irreversível"), true);
  assert.equal(aleg("RELATÓRIO Em suas razões, preliminarmente, aponta nulidade do ato. No mérito, aduz que a sentença desconsiderou a condição de consumidor idoso e analfabeto.", "a sentença desconsiderou a condição de consumidor idoso"), true);
  assert.equal(aleg("RELATÓRIO O apelante insiste em tese de nulidade, afirmando que a prova pericial era indispensável para a elucidação da controvérsia dos autos.", "a prova pericial era indispensável para a elucidação da controvérsia"), true);
  assert.equal(aleg("VOTO Ainda que o apelante alegue que os descontos totalizam valor inferior ao limite legal, a norma não se refere ao desconto por instituição.", "os descontos totalizam valor inferior ao limite legal"), true);
});

test("ALEGAÇÃO DA PARTE não dispara na voz do tribunal: substantivo, nome de parte, infinitivo, adversativo, performativo, frases demais", () => {
  // "alegação", "argumento": substantivo não é verbo de relato (era a causa do falso alarme do caso 35889208)
  assert.equal(aleg("VOTO A Súmula 54 do STJ é clara ao afirmar que os juros moratórios fluem a partir do evento danoso. O argumento do embargante de que a mera disponibilização de crédito atrairia o art. 405 do Código Civil não se sustenta diante dos fatos.", "O argumento do embargante de que a mera disponibilização de crédito atrairia o art. 405"), false);
  // "requerida" é nome de parte, não verbo
  assert.equal(aleg("VOTO Verifico que a empresa requerida não comprovou a contratação do serviço nem juntou o contrato assinado pelo consumidor aos autos.", "não comprovou a contratação do serviço nem juntou o contrato assinado"), false);
  // o tribunal responde: marca de voz própria entre o verbo e o trecho
  assert.equal(aleg("VOTO O apelante sustenta a nulidade da sentença. Contudo, a prova dos autos demonstra que a contratação foi regular e o crédito, disponibilizado.", "a prova dos autos demonstra que a contratação foi regular"), false);
  assert.equal(aleg("RELATÓRIO A parte recorrente requereu a desistência do recurso. Assim, nos termos do art. 998 do CPC, HOMOLOGO o pedido e condeno ao pagamento das custas e honorários advocatícios arbitrados.", "condeno ao pagamento das custas e honorários advocatícios arbitrados"), false);
  // o verbo está a mais de 2 frases do trecho: não é mais o mesmo relato
  assert.equal(aleg("RELATÓRIO O apelante alega nulidade da citação. O processo seguiu o rito comum. A prova pericial foi produzida em juízo. Ao final, a sentença julgou procedente o pedido da inicial.", "a sentença julgou procedente o pedido da inicial"), false);
  // sem verbo de relato nenhum
  assert.equal(aleg("VOTO O contrato eletrônico foi assinado digitalmente e o comprovante de transferência foi juntado aos autos pelo banco, o que afasta a fraude.", "o comprovante de transferência foi juntado aos autos pelo banco"), false);
});

test("conferirTrecho: o alerta ALEGAÇÃO DA PARTE sai com o texto novo e só fora da voz da casa", () => {
  const t = "RELATÓRIO O banco sustenta a regularidade da contratação eletrônica, afirmando que a operação foi realizada mediante senha pessoal do cliente. VOTO Nego provimento.";
  const r = conferirTrecho(t, "a operação foi realizada mediante senha pessoal do cliente", "VOTO");
  assert.ok(r.alertas.some((a) => a.startsWith("ALEGAÇÃO DA PARTE: o texto relata o que uma parte")), r.alertas.join(" | "));
  assert.deepEqual(conferirTrecho("Embargos de declaração. Banco sustenta a regularidade da contratação. Recurso desprovido.", "Banco sustenta a regularidade da contratação", "EMENTA").alertas, []);
});

// v1.12.0 — NEGAÇÃO por alcance e ENTRE ASPAS por pareamento, remedidas em gabarito CEGO e DUPLO (dois rotuladores
// independentes; kappa 0,93 e 1,00). Exemplos sintéticos: o gabarito real fica fora do git.
import { negacaoAntes, trechosCitados, coberturaCitada } from "../server/verificar.js";
const neg = (texto, trecho) => { const tn = norm1(texto), i = tn.indexOf(norm1(trecho)); return negacaoAntes(tn, i, i + trecho.length, texto); };

test("NEGAÇÃO dispara quando a negação alcança o trecho: 'não há que se falar em', vírgula de adjunto, 'rejeita-se, portanto,'", () => {
  assert.equal(neg("VOTO Não há que se falar em dano moral indenizável pela simples cobrança indevida de tarifa bancária.", "dano moral indenizável pela simples cobrança indevida de tarifa"), true);
  assert.equal(neg("VOTO Identifico que jamais foi contestada, em qualquer momento do processo, a nulidade daquela decisão em razão do impedimento.", "contestada, em qualquer momento do processo, a nulidade daquela decisão"), true);
  assert.equal(neg("VOTO Rejeita-se, portanto, a tese de ilegitimidade passiva da imobiliária requerida nestes autos.", "tese de ilegitimidade passiva da imobiliária requerida"), true);
  assert.equal(neg("VOTO A sentença julgou improcedentes os pedidos de repetição de indébito e danos morais formulados.", "os pedidos de repetição de indébito e danos morais"), true);
});

test("NEGAÇÃO não dispara: adjetivo solto, alcance de 1-2 palavras, oração nova no meio, trecho que abre com 'e,', 'não obstante'", () => {
  assert.equal(neg("VOTO O erro de fato exige que o julgado tenha admitido fato inexistente ou ignorado fato efetivamente ocorrido, verificável pelo exame dos autos.", "fato efetivamente ocorrido, verificável pelo exame dos autos"), false);
  assert.equal(neg("VOTO Os embargos declaratórios não constituem sucedâneo recursal, de forma que eventual insatisfação deve ensejar o recurso cabível.", "recursal, de forma que eventual insatisfação deve ensejar"), false);
  assert.equal(neg("VOTO O juízo julgou improcedente o pedido, além de condenar a parte autora por litigância de má-fé processual.", "autora por litigância de má-fé processual"), false);
  assert.equal(neg("RELATÓRIO Argumentou que o agravo não foi conhecido e, nessa condição, não acarretaria prevenção do órgão.", "e, nessa condição, não acarretaria prevenção do órgão"), false);
  // "é" (verbo) no começo do trecho não é a conjunção "e" (o norm1 dobra os dois): achado no porte para o TRT14, 05/10/2026
  assert.equal(neg("VOTO Diante da prova pericial, NÃO é devido o adicional de insalubridade em grau máximo.", "é devido o adicional de insalubridade em grau máximo"), true);
  assert.equal(neg("VOTO Não obstante o esforço argumentativo da apelante, a prova dos autos demonstra a contratação regular do empréstimo.", "a prova dos autos demonstra a contratação regular do empréstimo"), false);
});

test("trechosCitados: aspas curvas aninhadas com pilha, retas alternam, apóstrofo não abre citação, citação longa demais é descartada", () => {
  const t = "consta da decisão: “Vistos. O réu alegou que “não recebeu” o valor e requereu a extinção do feito.” Assim, decido.";
  const cit = trechosCitados(t);
  assert.deepEqual(cit.map(([a, b]) => t.slice(a, b)), ["“não recebeu”", "“Vistos. O réu alegou que “não recebeu” o valor e requereu a extinção do feito.”"]);
  const ini = t.indexOf("O réu"), fim = t.indexOf(" Assim");
  assert.equal(coberturaCitada(cit, ini, fim), fim - ini);    // a união não conta duas vezes a citação de dentro
  assert.deepEqual(trechosCitados('a lei diz "art. 1º" e "art. 2º".').length, 2);
  assert.deepEqual(trechosCitados("caixa d’água e pingo-d’água"), []);
  assert.deepEqual(trechosCitados("“" + "x".repeat(6100) + "”"), []);
});

test("conferirTrecho: ENTRE ASPAS pela maioria do trecho; tese fixada entre aspas é do tribunal; NEGAÇÃO com o texto de sempre", () => {
  const dec = "VOTO O juízo assim decidiu: “Vistos. O réu alegou que não recebeu o valor e requereu a extinção do feito por ausência de prova.” Assim, mantenho.";
  assert.ok(conferirTrecho(dec, "O réu alegou que não recebeu o valor e requereu a extinção", "VOTO").alertas.some((a) => a.startsWith("ENTRE ASPAS")));
  const borda = "VOTO Trata-se do processo n. 4510/2015, que trata da “Fiscalização de atos e contratos administrativos do município”. Nego provimento.";
  assert.ok(!conferirTrecho(borda, "Trata-se do processo n. 4510/2015, que trata da Fiscalização", "VOTO").alertas.some((a) => a.startsWith("ENTRE ASPAS")));
  const tese = "VOTO O Superior Tribunal julgou o repetitivo fixando a seguinte tese: “É devida a restituição em dobro independentemente da comprovação de má-fé do fornecedor.” Aplico-a.";
  assert.ok(!conferirTrecho(tese, "É devida a restituição em dobro independentemente da comprovação de má-fé", "VOTO").alertas.some((a) => a.startsWith("ENTRE ASPAS")));
  const n = conferirTrecho("VOTO Não há que se falar em dano moral indenizável pela simples cobrança indevida de tarifa bancária.", "dano moral indenizável pela simples cobrança indevida de tarifa", "VOTO");
  assert.ok(n.alertas.some((a) => a.startsWith("NEGAÇÃO: há negativa logo antes do trecho")), n.alertas.join(" | "));
});

// v1.13.0 — 2ª rodada cega de ALEGAÇÃO DA PARTE (160 trechos): o relato vale dentro da frase.
test("ALEGAÇÃO DA PARTE (v1.13.0): frase nova sem verbo de relato, verbo negado, impessoal, concessiva, adversativa e atribuição explícita não disparam", () => {
  assert.equal(aleg("RELATÓRIO O banco defendeu a regularidade da contratação, afirmando que o autor aderiu ao cartão. Juntou cópia do contrato e demais documentos aos autos do processo.", "Juntou cópia do contrato e demais documentos aos autos"), false);
  assert.equal(aleg("VOTO A parte autora não narra nenhum prejuízo além da frustração da relação contratual estabelecida entre as partes.", "nenhum prejuízo além da frustração da relação contratual"), false);
  assert.equal(aleg("VOTO Reitera-se que o excedente de energia possui natureza de empréstimo gratuito, não gerando fato gerador de ICMS.", "o excedente de energia possui natureza de empréstimo gratuito"), false);
  assert.equal(aleg("VOTO Embora o banco sustente a segurança de seus sistemas, os documentos apresentados são telas sistêmicas e registros unilaterais sem valor.", "os documentos apresentados são telas sistêmicas e registros unilaterais"), false);
  assert.equal(aleg("VOTO A parte reclamante invoca a inafastabilidade da jurisdição e a existência de teratologia, mas não demonstra aderência estrita entre o acórdão e o paradigma.", "mas não demonstra aderência estrita entre o acórdão e o paradigma"), false);
  assert.equal(aleg("VOTO O empréstimo foi efetivado por meio de terminal de autoatendimento que, segundo o apelado, tem como característica a facilidade de contratação.", "que, segundo o apelado, tem como característica a facilidade de contratação"), false);
});

test("ALEGAÇÃO DA PARTE (v1.13.0): verbo na cabeça do trecho, sujeito depois do verbo, 'Diz que', contrarrazões, 'não X, mas Y' da própria parte", () => {
  assert.equal(aleg("RELATÓRIO Sustentaram que foram induzidos a outorgar procuração relativa ao lote rural de Cacoal/RO. Requereram a declaração de inexistência da dívida e a nulidade dos títulos emitidos.", "Cacoal/RO. Requereram a declaração de inexistência da dívida e a nulidade"), true);
  assert.equal(aleg("VOTO 1. PRELIMINAR Alega o agravante que a inobservância do rito de publicação configurou cerceamento de defesa, pois obstou o pedido de sustentação oral.", "a inobservância do rito de publicação configurou cerceamento de defesa"), true);
  assert.equal(aleg("RELATÓRIO Alega que a decisão parte de premissa equivocada. Diz que atualmente tem como atividade laboral motorista de aplicativo e que sua renda é insuficiente.", "atualmente tem como atividade laboral motorista de aplicativo"), true);
  assert.equal(aleg("RELATÓRIO Contrarrazões juntadas, pugnando pela manutenção da sentença, sob o argumento de que a informação prestada decorre de dever regulatório do banco.", "a informação prestada decorre de dever regulatório do banco"), true);
  assert.equal(aleg("RELATÓRIO Assevera que o agravo de instrumento não se voltou contra a autoridade da sentença, mas contra a interpretação ampliativa conferida à fase executiva.", "a autoridade da sentença, mas contra a interpretação ampliativa"), true);
});
