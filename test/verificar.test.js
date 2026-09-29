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
