// 1.42.3 (build local) — relato de uso de 04/11/2026: continuação em qualquer página, fecho emprestado às peças irmãs,
// filtros de texto e contagem agrupada em buscar_recibos_tjro. Sem rede: recibos em pasta temporária.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buscarRecibos, dentroDaProximidade, regexTermo, _limparMemoParaTeste } from "../server/recibos.js";
import { recibo, dicaContinuacao, limitarSaida } from "../server/lib.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tjro-1423-"));
const grava = (p, r) => fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
const FECHO = " ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, POR UNANIMIDADE, negar provimento. Porto Velho, 10 de março de 2026.";

test("dicaContinuacao: página 1 como na 1.42.2; página 2+ com deslocamento exato; sem por_pagina, nada", () => {
  assert.match(dicaContinuacao({ pagina: 1 }, 40), /pagina=2 com por_pagina=40/);
  assert.match(dicaContinuacao({ pagina: 2, porPagina: 173 }, 173), /viu 174 a 346.*pagina=3 com por_pagina=173/);
  const d = dicaContinuacao({ pagina: 2, porPagina: 250 }, 170);   // deslocamento 420: maior divisor <= 170 é 140
  assert.match(d, /viu 251 a 420.*pagina=4 com por_pagina=140/);
  assert.equal(dicaContinuacao({ pagina: 3 }, 10), "");
  assert.equal(dicaContinuacao({ pagina: null, porPagina: 10 }, 10), "");   // distinguir/resultado=/similares_a: sem deslocamento confiável
  assert.match(dicaContinuacao({ pagina: 2, porPagina: 250 }, 171), /pagina=2 com por_pagina=171|pagina=3 com por_pagina=171/);   // deslocamento primo: não manda por_pagina=1
  assert.equal(dicaContinuacao({ pagina: 2, porPagina: 10 }, 0), "");
});

test("limitarSaida em página 2 traz a dica quando recebe por_pagina", () => {
  const t = "cab\n" + Array.from({ length: 40 }, (_, i) => `\n## R${i}\n` + "x".repeat(3000)).join("");
  const c = limitarSaida(t, undefined, { pagina: 2, porPagina: 40 });
  assert.match(c, /Para continuar.*viu 41 a \d+/);
});

test("recibos: EMENTA e VOTO emprestam o fecho do ACÓRDÃO do mesmo julgamento; julgamentos distintos não se misturam", () => {
  _limparMemoParaTeste();
  const p = tmp();
  const base = { nr_processo: "70000000020258220001", dtjulgamento_str: "10/03/2026", ds_orgao_julgador_colegiado: "3ª Câmara Cível" };
  grava(p, recibo({ ...base, id_processo_documento: 1, tipo: "ACÓRDÃO", ds_modelo_documento: "licença prêmio." + FECHO }));
  grava(p, recibo({ ...base, id_processo_documento: 2, tipo: "EMENTA", ds_modelo_documento: "licença prêmio ementa" }));
  grava(p, recibo({ ...base, nr_processo: "70000000120268220001", id_processo_documento: 3, tipo: "EMENTA", ds_modelo_documento: "licença prêmio ementa de outro" }));
  const out = buscarRecibos("licença prêmio", null, 10, p);
  assert.match(out, /EMENTA.*1ª Câmara Cível \(fecho do ACÓRDÃO do mesmo processo e data\); índice: 3ª Câmara Cível.*id 2 /);
  assert.match(out, /EMENTA.*3ª Câmara Cível \(índice\).*id 3 /);
});

test("proximidade: termos a até N palavras; fora disso não entra; N é limitado", () => {
  assert.ok(dentroDaProximidade("a liquidacao por arbitramento", [[regexTermo("arbitramento")], [regexTermo("liquidacao")]], 3));
  assert.ok(!dentroDaProximidade("arbitramento de dano moral " + "x ".repeat(20) + "liquidacao", [[regexTermo("arbitramento")], [regexTermo("liquidacao")]], 6));
  assert.ok(!dentroDaProximidade("so arbitramento", [[regexTermo("arbitramento")], [regexTermo("liquidacao")]], 6));
  _limparMemoParaTeste();
  const p = tmp();
  grava(p, recibo({ id_processo_documento: 10, nr_processo: "1", tipo: "ACÓRDÃO", dtjulgamento_str: "01/01/2026", ds_modelo_documento: "Fixo o dano moral por arbitramento. " + "palavra ".repeat(40) + "Na liquidação da sentença." }));
  grava(p, recibo({ id_processo_documento: 11, nr_processo: "2", tipo: "ACÓRDÃO", dtjulgamento_str: "01/01/2026", ds_modelo_documento: "A liquidação será por arbitramento." }));
  const sem = buscarRecibos("arbitramento liquidação", null, 10, p);
  assert.match(sem, /2 de 2 documento/);
  const com = buscarRecibos("arbitramento liquidação", null, 10, p, { proximidade: 5 });
  assert.match(com, /1 de 2 documento/);
  assert.match(com, /id 11 /);
  assert.doesNotMatch(com, /id 10 /);
  assert.match(com, /1 recibo\(s\) têm os termos, mas mais longe/);
});

test("excluir_transcricao tira o que o recibo marca como transcrição; so_voz_do_relator pula recibo sem recorte e conta", () => {
  _limparMemoParaTeste();
  const p = tmp();
  const transcrito = "EMENTA transcrita de outro julgado: o arbitramento da liquidação exige perito.";
  const r = recibo({ id_processo_documento: 20, nr_processo: "3", tipo: "ACÓRDÃO", dtjulgamento_str: "01/01/2026", ds_modelo_documento: "Voto do relator sem o tema. " + transcrito + " Fim." });
  r.trechos_transcritos = [transcrito];
  r.texto_voz_propria = "Voto do relator sem o tema.";
  grava(p, r);
  grava(p, { ...recibo({ id_processo_documento: 21, nr_processo: "4", tipo: "ACÓRDÃO", dtjulgamento_str: "01/01/2026", ds_modelo_documento: "O arbitramento da liquidação é cabível aqui." }), trechos_transcritos: [], texto_voz_propria: "" });
  assert.match(buscarRecibos("arbitramento liquidação", null, 10, p), /2 de 2 documento/);
  const ex = buscarRecibos("arbitramento liquidação", null, 10, p, { excluirTranscricao: true });
  assert.match(ex, /1 de 2 documento/);
  assert.match(ex, /id 21 /);
  assert.doesNotMatch(ex, /id 20 /);
  const voz = buscarRecibos("arbitramento liquidação", null, 10, p, { soVozDoRelator: true });
  assert.match(voz, /0 de 2 documento/);
  assert.match(voz, /1 recibo\(s\) sem esse recorte foram pulados/);
});

test("agrupar_por conta todos os que atendem, não só os mostrados", () => {
  _limparMemoParaTeste();
  const p = tmp();
  for (let i = 0; i < 5; i++) grava(p, recibo({ id_processo_documento: 30 + i, nr_processo: String(100 + i), tipo: "ACÓRDÃO", dtjulgamento_str: `01/01/${2024 + (i % 2)}`, ds_modelo_documento: "tema comum." + FECHO }));
  const out = buscarRecibos("tema comum", null, 1, p, { agruparPor: "ano" });
  assert.match(out, /sobre os 5 recibo\(s\) que atendem, não só os 1 mostrados/);
  assert.match(out, /- 2024: 3/);
  assert.match(out, /- 2025: 2/);
  assert.match(buscarRecibos("tema comum", null, 1, p, { agruparPor: "orgao" }), /- 1ª Câmara Cível: 5/);
});

test("revisão Opus: janela exata, proximidade não atravessa trecho apagado, SENTENÇA não empresta fecho, grupo de índice é marcado", () => {
  assert.ok(dentroDaProximidade("dano moral", [[regexTermo("dano")], [regexTermo("moral")]], 1));
  _limparMemoParaTeste();
  const p = tmp();
  const alheio = "a sentença transcrita diz uma coisa longa e sem relação alguma com o tema aqui";
  const r = recibo({ id_processo_documento: 40, nr_processo: "5", tipo: "ACÓRDÃO", dtjulgamento_str: "01/01/2026", ds_modelo_documento: `arbitramento ${alheio} liquidação` });
  r.trechos_transcritos = [alheio];
  grava(p, r);
  assert.match(buscarRecibos("arbitramento liquidação", null, 5, p, { proximidade: 3 }), /0 de 1 documento/);
  assert.match(buscarRecibos("arbitramento liquidação", null, 5, p, { proximidade: 3, excluirTranscricao: true }), /0 de 1 documento/);
  _limparMemoParaTeste();
  const q = tmp();
  const base = { nr_processo: "6", dtjulgamento_str: "10/03/2026", ds_orgao_julgador_colegiado: "3ª Câmara Cível" };
  grava(q, recibo({ ...base, id_processo_documento: 50, tipo: "ACÓRDÃO", ds_modelo_documento: "tema." + FECHO }));
  grava(q, recibo({ ...base, id_processo_documento: 51, tipo: "SENTENÇA", ds_modelo_documento: "tema da sentença" }));
  const out = buscarRecibos("tema", null, 10, q, { agruparPor: "orgao" });
  assert.match(out, /SENTENÇA.*3ª Câmara Cível \(índice\).*id 51 /);
  assert.match(out, /- 3ª Câmara Cível \(só índice, câmara não verificada\): 1/);
});

test("juiz convocado: o texto diz quem ele substituiu; sem a frase, nada é inventado; agrupar_por relator_titular soma no titular", () => {
  _limparMemoParaTeste();
  const p = tmp();
  const base = { dtjulgamento_str: "10/03/2026", tipo: "ACÓRDÃO" };
  grava(p, { ...recibo({ ...base, id_processo_documento: 60, nr_processo: "7", nome_relator_acordao: "HARUO MIZUSAKI", ds_modelo_documento: "tema comum. Relator: Juiz Convocado Haruo Mizusaki, em substituição ao Des. Kiyochi Mori, acordam os Magistrados." + FECHO }) });
  grava(p, recibo({ ...base, id_processo_documento: 61, nr_processo: "8", nome_relator_acordao: "KIYOCHI MORI", ds_modelo_documento: "tema comum. Relator Des. Kiyochi Mori." + FECHO }));
  grava(p, recibo({ ...base, id_processo_documento: 62, nr_processo: "9", nome_relator_acordao: "OUTRO RELATOR", ds_modelo_documento: "tema comum. O Juiz Convocado de outro tribunal ficou." + FECHO }));
  const out = buscarRecibos("tema comum", null, 5, p, { agruparPor: "relator_titular" });
  assert.match(out, /Juiz Convocado, em substituição ao Des\. Kiyochi Mori, segundo o texto/);
  assert.match(out, /- KIYOCHI MORI: 2/);
  assert.doesNotMatch(out.split("id 62")[0].split("\n").pop(), /em substituição/);
});

