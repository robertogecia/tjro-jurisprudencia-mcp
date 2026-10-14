// v1.32.0 — vocabulário das ementas que casaram (realimentação por relevância). Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sugerirVocabulario, blocoVocabulario, termosQueDistinguem, radicalDe, palavras, termosDaBusca } from "../server/vocabulario.js";

const hit = (id, txt) => ({ _source: { id_processo_documento: id, ds_modelo_documento: txt } });
const base = "Apelação cível. Negativação indevida em cadastro de inadimplentes, Serasa e SPC. Dano moral configurado. ";
const hits = Array.from({ length: 12 }, (_, i) => hit(100 + i, base + (i % 3 === 0 ? "Descontos indevidos em conta. " : "Inscrição indevida do nome do consumidor. ") + `Caso ${i} julgado.`));
const corpusGrande = { N: 400, df: new Map([["dano", 380], ["moral", 370], ["cadastro", 30], ["serasa", 12], ["negativacao", 25], ["indevida", 40], ["inscricao", 35], ["apelacao", 395], ["consumidor", 90], ["inadimplentes", 10], ["julgado", 399], ["configurado", 200]]) };

test("palavras: sem acento + forma escrita; sem palavra de ligação, número nem algarismo romano", () => {
  assert.deepEqual(palavras("A negativação do art. XVII, apelação 1234 e dívida"), [["negativacao", "negativação"], ["divida", "dívida"]]);
  assert.equal(radicalDe("desconto"), "descont");
  assert.equal(radicalDe("indevido"), "indev");
  assert.equal(radicalDe("dano"), "");
});

test("sugerirVocabulario: características aparecem com acento, sem o que o usuário já pediu; variantes dão o radical", () => {
  const r = sugerirVocabulario(hits, { consulta: "dano moral", grupos: [["descontos indevidos"]] }, corpusGrande);
  const nomes = r.caract.map((x) => x[0]);
  assert.ok(nomes.includes("negativação") && nomes.includes("cadastro"), nomes.join(","));
  assert.ok(!nomes.includes("dano") && !nomes.includes("moral") && !nomes.some((n) => n.startsWith("descont")), "não sugere o que já foi pedido");
  const v = r.variantes.find((x) => x.termo === "descontos");
  assert.ok(v == null || v.radical === "descont");
  const iv = sugerirVocabulario(hits, { consulta: "inscrição" }, corpusGrande).variantes.find((x) => x.termo === "inscrição");
  assert.ok(iv == null, "inscrição não tem variante na página (só a mesma forma)");
  const ind = sugerirVocabulario(hits, { consulta: "indevido" }, corpusGrande).variantes.find((x) => x.termo === "indevido" || x.radical === "indev");
  assert.ok(ind && ind.variantes.some(([w]) => w === "indevida"), JSON.stringify(ind));
});

test("sugerirVocabulario: página pequena e corpus pequeno não inventam sugestão", () => {
  assert.match(blocoVocabulario(sugerirVocabulario(hits.slice(0, 5), {}, corpusGrande)), /só 5 documento\(s\) na página/);
  const r = sugerirVocabulario(hits, {}, { N: 50, df: new Map() });
  assert.equal(r.caract.length, 0);
  assert.match(blocoVocabulario(r), /corpus local pequeno demais/);
});

test("blocoVocabulario: texto com contagem x/n e a instrução de uso; expressões do relator só com relator", () => {
  const sem = blocoVocabulario(sugerirVocabulario(hits, { consulta: "" }, corpusGrande));
  assert.match(sem, /\*\*Vocabulário das ementas desta página\*\* \(12 documentos; raridade medida em 400 documentos/);
  assert.match(sem, /negativação \(12\/12\)/);
  assert.doesNotMatch(sem, /Expressões recorrentes/);
  const com = blocoVocabulario(sugerirVocabulario(hits, { relator: "Fulano" }, corpusGrande), { relator: "Fulano" });
  assert.match(com, /Expressões recorrentes de Fulano/);
  assert.match(com, /Como usar: 2 a 4 desses termos em `grupos`/);
});

test("termosQueDistinguem: termos do documento-modelo raros no corpus, sem o que a busca já tem", () => {
  const t = termosQueDistinguem(hits, "100", { consulta: "dano moral" }, corpusGrande);
  assert.ok(t.length > 0 && t.includes("negativação") || t.includes("inadimplentes"), t.join(","));
  assert.ok(!t.includes("dano"));
  assert.deepEqual(termosQueDistinguem(hits, "999", {}, corpusGrande), []);
  assert.ok(termosDaBusca("dano moral", [["a b"]]).has("moral"));
});
