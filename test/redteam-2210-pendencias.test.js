// Pendências do red team de 22/10/2026 — regressão sintética, sem rede, tudo em os.tmpdir().
// (b) normas.js: remoção de <script>/<style>, comentários e tags em tempo linear, com a mesma saída das regexes antigas.
// (c) regiaoDoJulgamento: a janela do fecho para no cabeçalho do documento seguinte.
// (d) "Relator: A em substituição a B" → A.  Ponte Datajud+DJEN nas descrições.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { semScriptStyle, semComentariosHtml, semTags, extrairRelatorDoTexto, recibo } from "../server/lib.js";
import { quebrasDeLinhaHtml } from "../server/normas.js";
import { regiaoDoJulgamento, auditarCitacoes } from "../server/auditoria.js";
import { _limparMemoParaTeste } from "../server/recibos.js";

// ---------- (b) ----------
const velho = (h) => String(h || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h\d|\/dt|\/dd|hr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
const novo = (h) => semTags(quebrasDeLinhaHtml(semComentariosHtml(semScriptStyle(String(h || ""), { troca: "", exigeFimDaAbertura: false }))));

test("pendência (b): limpeza de HTML de normas.js tem a mesma saída das regexes antigas (fuzz + fixtures)", () => {
  const pecas = ["<script", "<SCRIPT", "</script>", "</SCRIPT>", "<style", "</style>", "<StYlE>", "<!--", "-->", "<!-->", "<br", "<BR/>", "< br >",
    "</p>", "</P", "<h1>", "</h3>", "</h3", "<hr", "<>", "<", ">", "a", " ", "\n", "x<", "</div>", "</tr >", "<scriptx>", "</scriptx>"];
  let s = 11;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 40000; n++) {
    let t = "";
    for (let i = 1 + Math.floor(r() * 12); i > 0; i--) t += pecas[Math.floor(r() * pecas.length)];
    assert.equal(novo(t), velho(t), JSON.stringify(t));
  }
  const dir = new URL("./fixtures/normas/", import.meta.url);
  for (const f of fs.readdirSync(dir)) { const t = fs.readFileSync(new URL(f, dir), "utf8"); assert.equal(novo(t), velho(t), f); }
  // o padrão default de semScriptStyle (usado por limpar) não mudou
  assert.equal(semScriptStyle("a<script>x</script>b"), "a b");
});

test("pendência (b): HTML malformado não trava (milhares de aberturas sem fechamento)", () => {
  const mal = "<script".repeat(60000) + "<style".repeat(30000) + "<br".repeat(60000) + "<!--".repeat(60000) + "<x".repeat(60000);
  const t0 = Date.now();
  novo(mal);
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
});

// ---------- (c) ----------
const FECHO = "ACÓRDÃO Vistos, relatados e discutidos estes autos, acordam os Magistrados da 1ª Câmara Cível do Tribunal de Justiça do Estado de Rondônia, em, EMBARGOS ACOLHIDOS, À UNANIMIDADE. Porto Velho, 18 de novembro de 2019. DESEMBARGADOR SANSÃO SALDANHA RELATOR ";
// o rótulo de sessão só vale nos primeiros 2.500 caracteres (cabeçalho do PRÓPRIO documento): voto longo o bastante para o
// cabeçalho do documento seguinte ficar fora dessa faixa, como nos inteiros teores reais
const VOTO_LONGO = "VOTO " + "A matéria foi devidamente examinada no acórdão embargado. ".repeat(50);
const CAB_SEGUINTE = "Poder Judiciário do Estado de Rondônia 1ª Câmara Cível Data de distribuição: 31/08/2015 Data do julgamento: 14/08/2018 Apelação Origem: Rolim de Moura";
test("pendência (c): a janela do fecho para no cabeçalho do documento seguinte (e na ementa alheia transcrita)", () => {
  const reg = regiaoDoJulgamento("RELATÓRIO texto. " + VOTO_LONGO + FECHO + CAB_SEGUINTE + " RELATÓRIO Trata-se de apelação.");
  assert.match(reg, /18 de novembro de 2019/);
  assert.doesNotMatch(reg, /14\/08\/2018/);
  assert.doesNotMatch(reg, /31\/08\/2015/);
  const transc = regiaoDoJulgamento(VOTO_LONGO + "Nesse sentido: " + FECHO + "(TJ-RO - APELAÇÃO CÍVEL: 70072660620238220007, Data de Julgamento: 13/03/2025). Ante o exposto, nego provimento.");
  assert.doesNotMatch(transc, /13\/03\/2025/);
  // sem cabeçalho adiante, a data da assinatura do fecho continua na região (Reataque Fable 2, 24/10/2026: a região guarda só as
  // datas do fecho — assinatura e sessão —, não o texto inteiro da janela, para a data da PROCLAMAÇÃO não confirmar nada)
  assert.match(regiaoDoJulgamento("VOTO texto. " + FECHO + " Dou fé."), /18 de novembro de 2019/);
});

test("pendência (c): data do cadastro do documento seguinte não sai ✅ na auditoria", () => {
  _limparMemoParaTeste();
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-pend-c-"));
  const r = recibo({ id_processo_documento: 910001, nr_processo: "70000013420248220001", tipo: "ACÓRDÃO", dtjulgamento_str: "18/11/2019",
    ds_modelo_documento: "Relator: Des. SANSÃO SALDANHA RELATÓRIO Embargos. " + VOTO_LONGO + FECHO + CAB_SEGUINTE });
  fs.writeFileSync(path.join(p, `${r.id_documento}.json`), JSON.stringify(r));
  const cita = (dt) => auditarCitacoes(`(TJRO, Apelação 7000001-34.2024.8.22.0001, 1ª Câmara Cível, Rel. Des. Sansão Saldanha, j. ${dt})`, p).split("\n").find((l) => l.includes("7000001-34")) || "";
  assert.match(cita("18/11/2019"), /^✅ .*data/);
  assert.doesNotMatch(cita("14/08/2018"), /^✅/);
});

// ---------- (d) ----------
test("pendência (d): 'Relator: A em substituição a B' devolve A; 'A substituído por B' continua devolvendo B", () => {
  assert.equal(extrairRelatorDoTexto("Relator: Des. RADUAN MIGUEL FILHO em substituição a Des. KIYOCHI MORI\nData"), "Des. RADUAN MIGUEL FILHO");
  assert.equal(extrairRelatorDoTexto("Relator: Juiz HARUO MIZUSAKI em substituição ao Desembargador Kiyochi Mori\nOrigem"), "Juiz HARUO MIZUSAKI");
  assert.equal(extrairRelatorDoTexto("Relator: Des. SANSÃO SALDANHA substituído por DALMO ANTONIO DE CASTRO BEZERRA Data distribuição"), "DALMO ANTONIO DE CASTRO BEZERRA");
});

test("ponte DJEN: descrições das ferramentas e manifest trazem o texto; subtítulo intacto", async () => {
  const { PONTE_DATAJUD, PONTE_DJEN, PONTES } = await import("../server/lib.js");
  assert.equal(PONTE_DJEN, "Para intimações e prazos, use o DJEN; prazo nunca sai desta ferramenta nem do Datajud.");
  const raiz = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
  const man = JSON.parse(fs.readFileSync(path.join(raiz, "manifest.json"), "utf8"));
  assert.ok(man.description.startsWith("Criado pelo advogado @robertogrecia"));
  const outros = man.long_description.split("\n\n").find((p) => p.startsWith("**Outros recursos.**"));
  assert.ok(outros.includes(PONTES), "long_description, seção Outros recursos");
  for (const nome of ["buscar_jurisprudencia_tjro", "obter_inteiro_teor_tjro"]) {
    const t = man.tools.find((x) => x.name === nome);
    assert.ok(t.description.includes(PONTE_DATAJUD + " " + PONTE_DJEN), nome);
  }
  const src = fs.readFileSync(path.join(raiz, "server", "index.js"), "utf8");
  assert.equal((src.match(/PONTES \+ " " \+/g) || []).length, 2);
});
