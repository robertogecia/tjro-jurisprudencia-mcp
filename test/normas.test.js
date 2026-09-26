// Atos normativos do TJRO (atos.tjro.jus.br) — parsers e formatação sobre páginas
// reais capturadas em 26/09/2026 (test/fixtures/normas/). Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { _setArquivoEstadoParaTeste, _resetDisjuntorParaTeste } from "../server/lib.js";
import {
  ATOS_BASE,
  NORMAS_POR_PAGINA,
  TIPOS_ATO,
  SITUACOES_ATO,
  ORIGENS_ATO,
  TEMAS_ATO,
  ErroNorma,
  resolverOpcao,
  buildNormasUrl,
  parseListaNormas,
  parseNormaDetalhe,
  ordenarVigentesPrimeiro,
  formatListaNormas,
  formatNormaDetalhe,
  recortarArtigo,
  buscarNormas as _buscarNormas,
  obterNorma as _obterNorma,
} from "../server/normas.js";

_setArquivoEstadoParaTeste(path.join(os.tmpdir(), "_teste_disjuntor_tjro_normas.json"));
_resetDisjuntorParaTeste();
process.env.TJRO_MCP_DIR_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-normas-"));

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => fs.readFileSync(path.join(aqui, "fixtures", "normas", n), "utf8");
const LISTA = fx("lista-assiduidade-p1.html");
const VAZIA = fx("lista-vazia.html");
const DET_ALTERADA = fx("detalhe-3438-instrucao-alterada.html");
const DET_REVOGADO = fx("detalhe-982-ato-revogado.html");
const DET_SO_PDF = fx("detalhe-5345-provimento-so-pdf.html");
const DET_LC = fx("detalhe-3341-lc.html");

// ------------------------------------------------------------- opções -
test("resolverOpcao: nome exato, sem acento, parte única, ambíguo e inexistente", () => {
  assert.deepEqual(resolverOpcao(TIPOS_ATO, "Instrução", "tipo"), { codigo: 7, rotulo: "Instrução" });
  assert.deepEqual(resolverOpcao(TIPOS_ATO, "instrucao", "tipo"), { codigo: 7, rotulo: "Instrução" });
  assert.deepEqual(resolverOpcao(ORIGENS_ATO, "governo do estado", "origem"), { codigo: 20, rotulo: "Governo do Estado de Rondônia" });
  assert.deepEqual(resolverOpcao(TEMAS_ATO, "precat", "tema"), { codigo: 21, rotulo: "Precatórios" });
  assert.equal(resolverOpcao(TEMAS_ATO, "", "tema"), null);
  assert.equal(resolverOpcao(TEMAS_ATO, undefined, "tema"), null);
  // "corregedoria" casa três origens, mas só uma COMEÇA assim
  assert.deepEqual(resolverOpcao(ORIGENS_ATO, "corregedoria", "origem"), { codigo: 10, rotulo: "Corregedoria Geral da Justiça" });
  assert.throws(() => resolverOpcao(ORIGENS_ATO, "secretaria", "origem"), (e) => e instanceof ErroNorma && /ambíguo/.test(e.message) && /Secretaria Administrativa/.test(e.message));
  assert.throws(() => resolverOpcao(TEMAS_ATO, "xyz-nada", "tema"), (e) => e instanceof ErroNorma && /não existe/.test(e.message));
  // "Corregedoria Geral da Justiça" exato resolve mesmo havendo outra origem que o contém
  assert.deepEqual(resolverOpcao(ORIGENS_ATO, "Corregedoria Geral da Justiça", "origem"), { codigo: 10, rotulo: "Corregedoria Geral da Justiça" });
  assert.equal(SITUACOES_ATO.Vigente, 4);
});

test("buildNormasUrl manda TODOS os campos, mesmo vazios, e tipoAto[] repetido", () => {
  const u = buildNormasUrl({ argumento: "licença-prêmio" });
  assert.ok(u.startsWith(ATOS_BASE + "/?"));
  for (const k of ["numero=", "ano=", "argumento=licen", "origem=", "situacao=", "tema="]) assert.ok(u.includes(k), k);
  assert.ok(!u.includes("page="));
  const u2 = buildNormasUrl({ numero: " 11 ", ano: "2016", tipos: [7, 21], situacao: 4, origem: 1, tema: 13, pagina: 3 });
  assert.ok(u2.includes("numero=11&ano=2016"));
  assert.ok(u2.includes("tipoAto%5B%5D=7") && u2.includes("tipoAto%5B%5D=21"));
  assert.ok(u2.includes("situacao=4") && u2.includes("origem=1") && u2.includes("tema=13") && u2.includes("page=3"));
});

// ------------------------------------------------------------- lista -
test("parseListaNormas: 10 itens, total 38 e 4 páginas na página real", () => {
  const r = parseListaNormas(LISTA);
  assert.equal(r.itens.length, 10);
  assert.equal(r.total, 38);
  assert.equal(r.paginas, 4);
  assert.deepEqual(r.itens[0], {
    id: "3341", tipo: "Lei Complementar", numero: "1303", data: "06/10/2025", origem: "Governo do Estado de Rondônia", situacao: "Vigente",
    ementa: "Dispõe sobre o cômputo, para fins de direitos e vantagens funcionais do tempo de serviço prestado por magistrados(as) e servidores(as) do Tribunal de Justiça do Estado de Rondônia, durante o estado de calamidade pública decorrente da pandemia da Covid-19.",
  });
  assert.equal(r.itens[6].situacao, "Revogado");
  assert.equal(r.itens[9].id, "6053");
});

test("parseListaNormas: página vazia dá zero itens sem quebrar; sem paginação total = itens", () => {
  assert.deepEqual(parseListaNormas(VAZIA), { itens: [], total: 0, paginas: 1 });
  assert.deepEqual(parseListaNormas(""), { itens: [], total: 0, paginas: 1 });
  const semPag = LISTA.replace(/Mostrando[\s\S]*?resultados/, "");
  const r = parseListaNormas(semPag);
  assert.equal(r.total, 10);
  assert.equal(r.paginas, 1);
});

test("ordenarVigentesPrimeiro: Vigente antes de Alterado antes de Revogado, ordem original dentro do grupo", () => {
  const itens = [{ situacao: "Revogado", n: 1 }, { situacao: "Vigente", n: 2 }, { situacao: "Alterado", n: 3 }, { situacao: "Vigente", n: 4 }, { situacao: null, n: 5 }];
  assert.deepEqual(ordenarVigentesPrimeiro(itens).map((i) => i.n), [2, 4, 3, 1, 5]);
});

test("formatListaNormas: cabeçalho com total/página, vigentes primeiro, id e link, aviso dos não vigentes", () => {
  const r = { ...parseListaNormas(LISTA), url: "https://atos.tjro.jus.br/?x" };
  const t = formatListaNormas(r, ['argumento="assiduidade"'], 1);
  assert.match(t, /38 ato\(s\) no total, página 1 de 4 \(10 por página\)/);
  assert.match(t, /1\. \*\*Lei Complementar n\. 1303\/2025\*\* \(Governo do Estado de Rondônia\) · 06\/10\/2025 · Vigente · id 3341/);
  assert.match(t, /https:\/\/atos\.tjro\.jus\.br\/detalhar\/3341/);
  // Revogado e Alterado descem para o fim e ficam em negrito
  const iRev = t.indexOf("**Revogado**");
  const iUltVig = t.lastIndexOf("· Vigente ·");
  assert.ok(iRev > iUltVig);
  assert.match(t, /2 ato\(s\) desta página não estão "Vigente"/);
  assert.match(t, /Próxima página: pagina=2/);
  assert.match(t, /obter_norma_tjro\(id=\.\.\.\)/);
  // página 2 numera a partir de 11
  const t2 = formatListaNormas(r, [], 2);
  assert.match(t2, /\n11\. \*\*/);
});

test("formatListaNormas: vazio orienta a variar o termo e nunca diz 'não existe'", () => {
  const t = formatListaNormas({ itens: [], total: 0, paginas: 1, url: "u" }, ['argumento="licença-prêmio"'], 1);
  assert.match(t, /Nenhum ato encontrado/);
  assert.match(t, /Zero aqui nunca é "não existe"/);
  assert.doesNotMatch(t, /não existe\b(?!")/);
});

// ------------------------------------------------------------- detalhe -
test("parseNormaDetalhe: instrução alterada — campos, link de alteração, correlatas, PDFs e texto compilado", () => {
  const d = parseNormaDetalhe(DET_ALTERADA);
  assert.equal(d.tipo, "Instrução");
  assert.equal(d.numero, "11");
  assert.equal(d.data, "30/09/2016");
  assert.equal(d.situacao, "Alterado");
  assert.equal(d.situacaoStf, null);
  assert.equal(d.origem, "Presidência");
  assert.equal(d.publicacao, "DJe n. 185, de 30/9/2016, p. 1-3");
  assert.deepEqual(d.temas, ["Direitos Servidores - Auxílios, Gratificação e outros", "Gestão de Pessoas"]);
  assert.match(d.ementa, /^Dispõe sobre a concessão de gozo ou conversão em pecúnia de licença-prêmio/);
  assert.equal(d.alteracao.texto, "Alterada pela Instrução n. 065/2021-TJRO");
  assert.deepEqual(d.alteracao.links, [{ texto: "Instrução n. 065/2021-TJRO", href: "https://atos.tjro.jus.br/detalhar/6053", id: "6053" }]);
  assert.equal(d.correlatas.length, 2);
  assert.equal(d.correlatas[0].texto, "LC n. 68/1992");
  assert.match(d.correlatas[0].href, /^https:\/\/rondonia\.ro\.gov\.br/);
  assert.equal(d.processo, "n. 36099-86.2016");
  assert.match(d.pdfs.original, /^https:\/\/atos\.tjro\.jus\.br\/files\/original/);
  assert.match(d.pdfs.compilado, /^https:\/\/atos\.tjro\.jus\.br\/files\/compilado/);
  assert.equal(d.emRevisao, false);
  assert.match(d.texto, /^O PRESIDENTE DO TRIBUNAL DE JUSTIÇA DO ESTADO DE RONDÔNIA/);
  assert.match(d.texto, /\(Alterado pela Instrução n\. 065\/2021-PR\)/);
  assert.doesNotMatch(d.texto, /Texto Original|Texto Compilado/);
  assert.doesNotMatch(d.texto, /<[a-z]+>/i);
});

test("parseNormaDetalhe: ato revogado aponta o revogador com id", () => {
  const d = parseNormaDetalhe(DET_REVOGADO);
  assert.equal(d.situacao, "Revogado");
  assert.equal(d.alteracao.texto, "Revogado pelo Ato n. 602/2022.");
  assert.equal(d.alteracao.links[0].id, "1035");
  assert.deepEqual(d.correlatas, []);
  assert.equal(d.pdfs.compilado, undefined);
});

test("parseNormaDetalhe: provimento só em PDF — sem texto, em revisão, link da outra janela, correlatas sem link", () => {
  const d = parseNormaDetalhe(DET_SO_PDF);
  assert.equal(d.tipo, "Provimento");
  assert.equal(d.situacao, "Vigente");
  assert.equal(d.publicacao, null);
  assert.equal(d.texto, "");
  assert.equal(d.emRevisao, true);
  assert.equal(d.outraJanela, "https://atos.tjro.jus.br/files/Provimentos/PJRO_Provimento_CCJ_2016_11.pdf");
  assert.deepEqual(d.correlatas.map((c) => c.texto), ["Lei n. 11.977, de 7 de julho de 2009", "Provimento nº 021/2015-CG", "Regimento Interno do TJRO, art. 157"]);
  assert.ok(d.correlatas.every((c) => c.href === null));
});

test("parseNormaDetalhe: LC estadual catalogada, correlata com id do próprio portal", () => {
  const d = parseNormaDetalhe(DET_LC);
  assert.equal(d.tipo, "Lei Complementar");
  assert.equal(d.numero, "1303");
  assert.equal(d.origem, "Governo do Estado de Rondônia");
  assert.deepEqual(d.correlatas, [{ texto: "Resolução n. 364/2025", href: "https://atos.tjro.jus.br/detalhar/3274", id: "3274" }]);
  assert.equal(d.alteracao.texto, "");
  assert.match(d.texto, /^O GOVERNADOR DO ESTADO DE RONDÔNIA:/);
});

test("recortarArtigo: pega o artigo (repetido quando alterado) até o próximo, sem o título do capítulo seguinte", () => {
  const d = parseNormaDetalhe(DET_ALTERADA);
  const a4 = recortarArtigo(d.texto, "4º");
  assert.match(a4, /^Art\. 4º O servidor deverá requerer a licença ao Departamento/);
  assert.match(a4, /Art\. 4º O servidor deverá requerer a licença a Secretaria de Gestão de Pessoas.*\(Alterado pela Instrução n\. 065\/2021-PR\)/);
  assert.match(a4, /§ 2º O número de servidores/);
  assert.doesNotMatch(a4, /Art\. 5º/);
  const a3 = recortarArtigo(d.texto, "3");
  assert.match(a3, /^Art\. 3º/);
  assert.doesNotMatch(a3, /CAPÍTULO II/);
  assert.doesNotMatch(a3, /Art\. 4º/);
  // "1" não casa "Art. 12" nem "Art. 1º" com "10"
  const a1 = recortarArtigo("Art. 12 x\nArt. 1º y\nArt. 10 z", "1");
  assert.equal(a1, "Art. 1º y");
  assert.equal(recortarArtigo(d.texto, "999"), null);
  assert.equal(recortarArtigo(d.texto, ""), null);
});

test("formatNormaDetalhe: cabeçalho, aviso de alterado, cadeia de alteração com id, correlatas, artigo recortado e fatia", () => {
  const d = { ...parseNormaDetalhe(DET_ALTERADA), id: "3438" };
  const t = formatNormaDetalhe(d, { artigo: "4" });
  assert.match(t, /^\*\*Instrução n\. 11\/2016\*\* \(Presidência\) · 30\/09\/2016 · id 3438 · https:\/\/atos\.tjro\.jus\.br\/detalhar\/3438/);
  assert.match(t, /Situação no portal: \*\*Alterado\*\*/);
  assert.match(t, /⚠️ Ato alterado: o texto abaixo é o COMPILADO/);
  assert.match(t, /Alteração\/revogação: Alterada pela Instrução n\. 065\/2021-TJRO \[Instrução n\. 065\/2021-TJRO → id 6053\]/);
  assert.match(t, /- LC n\. 68\/1992 — https:\/\/rondonia/);
  assert.match(t, /PDF: original https:.* · compilado https:/);
  assert.match(t, /\*\*Art\. 4 \(texto compilado/);
  assert.match(t, /Art\. 4º O servidor deverá requerer/);
  assert.doesNotMatch(t, /CONSIDERANDO/);
  // fatia
  const f = formatNormaDetalhe(d, { maxCaracteres: 1000 });
  assert.match(f, /texto cortado: 1000 de \d+ caracteres; continue com inicio=1000/);
  const f2 = formatNormaDetalhe(d, { maxCaracteres: 1000, inicio: 1000 });
  assert.match(f2, /continue com inicio=2000/);
  assert.notEqual(f.slice(-300), f2.slice(-300));
  // artigo inexistente cai no texto inteiro, avisando
  const f3 = formatNormaDetalhe(d, { artigo: "999" });
  assert.match(f3, /Não achei "Art\. 999"/);
  assert.match(f3, /\*\*Texto compilado/);
});

test("formatNormaDetalhe: revogado avisa para não citar e aponta o substituto; só-PDF dá o link; inexistente não afirma inexistência da norma", () => {
  const r = formatNormaDetalhe({ ...parseNormaDetalhe(DET_REVOGADO), id: "982" });
  assert.match(r, /⚠️ Ato revogado: não cite como norma em vigor/);
  assert.match(r, /Revogado pelo Ato n\. 602\/2022\. \[.*→ id 1035\]/);
  const p = formatNormaDetalhe({ ...parseNormaDetalhe(DET_SO_PDF), id: "5345" });
  assert.match(p, /o portal não exibe o texto deste ato em HTML \(só o PDF: https:\/\/atos\.tjro\.jus\.br\/files\/Provimentos\/PJRO_Provimento_CCJ_2016_11\.pdf\)/);
  assert.match(p, /fila de revisão/);
  assert.match(p, /- Regimento Interno do TJRO, art\. 157$/m);
  const i = formatNormaDetalhe({ id: "1", inexistente: true });
  assert.match(i, /Não há ato com id 1/);
  assert.match(i, /isso não diz nada sobre a existência da norma/);
});

// ------------------------------------------------------------- rede (fetch falso) -
// Cada chamada zera o espaçamento do controle de ritmo (compartilhado com o JURIS),
// senão o teste espera 7 s por requisição.
const fetchFalso = (status, corpo, ctype = "text/html") => async () => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => (k.toLowerCase() === "content-type" ? ctype : null) },
  text: async () => corpo,
});
const buscarNormas = async (...a) => (_resetDisjuntorParaTeste(), _buscarNormas(...a));
const obterNorma = async (...a) => (_resetDisjuntorParaTeste(), _obterNorma(...a));

test("buscarNormas: chave de cache distinta por consulta; página de bloqueio vira ErroNorma com 'NÃO realizada'; STIC do formulário não é bloqueio", async () => {
  const r = await buscarNormas({ argumento: "assiduidade-teste-" + Date.now() }, fetchFalso(200, LISTA));
  assert.equal(r.total, 38);
  assert.ok(r.url.includes("argumento=assiduidade-teste-"));
  await assert.rejects(
    buscarNormas({ argumento: "bloq-" + Date.now() }, fetchFalso(200, "<html>STIC - Página Bloqueada</html>")),
    (e) => e instanceof ErroNorma && /NÃO realizada/.test(e.message) && /não significa que a norma não exista/.test(e.message)
  );
  await assert.rejects(buscarNormas({ argumento: "403-" + Date.now() }, fetchFalso(403, "")), (e) => e instanceof ErroNorma && /HTTP 403/.test(e.message));
  await assert.rejects(buscarNormas({ argumento: "500-" + Date.now() }, fetchFalso(500, "")), (e) => e instanceof ErroNorma && /HTTP 500/.test(e.message));
  await assert.rejects(
    buscarNormas({ argumento: "estranho-" + Date.now() }, fetchFalso(200, "<html><body>manutenção</body></html>")),
    (e) => e instanceof ErroNorma && /página inesperada/.test(e.message)
  );
});

test("obterNorma: id inválido é ErroNorma; 404 ou página sem campos = inexistente; página real devolve os campos", async () => {
  await assert.rejects(obterNorma(""), (e) => e instanceof ErroNorma && /id numérico/.test(e.message));
  assert.deepEqual(await obterNorma("999999901", fetchFalso(404, "")), { id: "999999901", inexistente: true });
  assert.deepEqual(await obterNorma("999999902", fetchFalso(200, "<html><body>nada</body></html>")), { id: "999999902", inexistente: true });
  const d = await obterNorma("999999903", fetchFalso(200, DET_LC));
  assert.equal(d.tipo, "Lei Complementar");
  assert.equal(d.id, "999999903");
});

test("constantes: 10 por página, tabelas com os códigos do formulário", () => {
  assert.equal(NORMAS_POR_PAGINA, 10);
  assert.equal(Object.keys(TIPOS_ATO).length, 22);
  // o formulário lista 31 origens, mas duas têm o mesmo nome (STIC, códigos 8 e 19): fica uma
  assert.equal(Object.keys(ORIGENS_ATO).length, 30);
  assert.equal(Object.keys(TEMAS_ATO).length, 44);
  assert.equal(TIPOS_ATO["Regimento Interno"], 19);
  assert.equal(TIPOS_ATO.Provimento, 16);
  assert.equal(ORIGENS_ATO["Corregedoria Geral da Justiça"], 10);
});
