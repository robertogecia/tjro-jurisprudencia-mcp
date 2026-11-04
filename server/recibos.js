// Recibos locais (v1.10.0): o que esta máquina já leu do TJRO, sem tocar no portal.
// `obter_inteiro_teor_tjro` grava um JSON por documento em ~/.tjro-jurisprudencia-recibos
// (id, número, tipo, data, texto e custódia). Aqui eles viram (1) fonte do verificador de
// citação — zero requisição quando o acórdão já foi lido — e (2) uma busca local, no
// molde do `buscar_recibos_trt14`: com o WAF do JURIS contando VOLUME em poucos minutos,
// reabrir um acórdão da semana passada para citá-lo de novo é cota jogada fora.
// Zero resultado aqui NUNCA é "não localizado": só cobre o que já passou por esta máquina.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { dirRecibos, cnj, link, relator, extrairOrgaoComOrigem, extrairRelatorDoTexto } from "./lib.js";
import { norm1, CUSTODIA_VERSAO } from "./custodia.js";
import { camposCustodia } from "./voz.js";
import { rankearPorConsulta } from "./vocabulario.js";

// memo por (arquivo, mtime): 600+ recibos de até 100 KB não se releem a cada chamada.
const MEMO = new Map();
const nomeValido = (n) => /^\d{1,20}\.json$/.test(n);   // norma-<id>.json e .indice-leve.json ficam de fora

export function reciboIntegro(r) {
  return !!r && typeof r === "object" && /^\d{1,20}$/.test(String(r.id_documento || "")) && typeof r.texto === "string" && r.texto.length > 0;
}

/** Todos os recibos íntegros da pasta, mais recentes primeiro. */
export function listarRecibos(pasta = dirRecibos()) {
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter(nomeValido); } catch { return []; }
  const out = [];
  for (const n of nomes) {
    const cam = path.join(pasta, n);
    let mt;
    try { mt = fs.statSync(cam).mtimeMs; } catch { continue; }
    let memo = MEMO.get(cam);
    if (!memo || memo.mt !== mt) {
      let r = null;
      try { r = JSON.parse(fs.readFileSync(cam, "utf8")); } catch { r = null; }
      if (!reciboIntegro(r)) { MEMO.delete(cam); continue; }
      memo = { mt, r, tn: norm1(r.texto) };
      MEMO.set(cam, memo);
      atualizarEntradaLeve(pasta, n, cam, r);
    }
    out.push(memo);
  }
  out.sort((a, b) => b.mt - a.mt);
  gravarIndiceLeve(pasta);
  return out.map((m) => ({ ...m.r, _tn: m.tn }));
}
export function _limparMemoParaTeste() { MEMO.clear(); INDICE_LEVE.clear(); SUJO.clear(); }

// Índice LEVE (17/10/2026): só os campos do cabeçalho de cada recibo (sem texto), para quem não precisa do texto — o aviso de grafia
// do relator rodava listarRecibos() inteiro (JSON.parse de 6.395 arquivos, ~2 s na 1ª busca de cada sessão) só para ler relator_indice.
// Fica em disco (.indice-leve.json na pasta de recibos) e revalida por (nome, mtime): recibo novo ou alterado entra, apagado sai.
// Red-team de 17/10/2026 (4 achados confirmados): (1) mt comparado com === não casava com o float gravado pelo Python; (2) sem versão de
// esquema, entrada antiga com mt igual passava sem os campos novos; (3) recibo reescrito com mtime preservado (cp -p, rsync -a) ficava
// com cabeçalho velho; (4) arquivo com "[]" era aceito e nunca se regenerava. Chave agora = (mt em ms inteiro, tamanho em bytes), igual nos
// dois lados; arquivo = { v, m }; array ou versão diferente descartam o índice inteiro.
// Achado próprio após o red-team: recibo reescrito com MESMO tamanho e mtime preservado (ex.: só a caixa do relator mudou) escapa da chave
// (mt, tam). Não dá para hashear 142 MB a cada chamada rápida; então quem já leu o arquivo inteiro (listarRecibos, ao parsear) atualiza a
// entrada leve com um hash curto do conteúdo, e o índice nunca fica mais velho que a última listagem completa.
const INDICE_LEVE = new Map();
export const INDICE_LEVE_VERSAO = 3;
const chaveMt = (st) => Math.round(st.mtimeMs);
const hashCurto = (r) => crypto.createHash("sha1").update(`${r.relator_indice ?? ""}|${r.data_julgamento ?? ""}|${r.orgao_indice ?? ""}|${r.classe ?? ""}|${r.nr_processo ?? ""}|${r.tipo ?? ""}|${r.texto.length}`).digest("hex").slice(0, 12);
const entradaLeve = (mt, tam, r) => ({ mt, tam, h: hashCurto(r), id_documento: String(r.id_documento), nr_processo: r.nr_processo ?? null, tipo: r.tipo ?? null, data_julgamento: r.data_julgamento ?? null,
  classe: r.classe ?? null, relator_indice: r.relator_indice ?? null, orgao_indice: r.orgao_indice ?? null, tamanho: r.texto.length });
const SUJO = new Set();
function carregarIndiceLeve(pasta) {
  let disco = INDICE_LEVE.get(pasta);
  if (disco) return disco;
  let bruto = null;
  try { bruto = JSON.parse(fs.readFileSync(path.join(pasta, ".indice-leve.json"), "utf8")); } catch { bruto = null; }
  disco = bruto && typeof bruto === "object" && !Array.isArray(bruto) && bruto.v === INDICE_LEVE_VERSAO && bruto.m && typeof bruto.m === "object" && !Array.isArray(bruto.m) ? bruto.m : {};
  INDICE_LEVE.set(pasta, disco);
  return disco;
}
function atualizarEntradaLeve(pasta, n, cam, r) {
  // carrega o índice do disco se esta sessão ainda não o abriu: senão a listagem completa não sincronizava nada (achado do teste de 17/10/2026)
  const disco = carregarIndiceLeve(pasta);
  let st; try { st = fs.statSync(cam); } catch { return; }
  const e = entradaLeve(chaveMt(st), st.size, r);
  const atual = disco[n];
  if (!atual || atual.h !== e.h || atual.mt !== e.mt || atual.tam !== e.tam) { disco[n] = e; SUJO.add(pasta); }
}
function gravarIndiceLeve(pasta) {
  const disco = INDICE_LEVE.get(pasta);
  if (!disco || !SUJO.has(pasta)) return;
  const arq = path.join(pasta, ".indice-leve.json");
  try { const tmp = `${arq}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ v: INDICE_LEVE_VERSAO, m: disco })); fs.renameSync(tmp, arq); SUJO.delete(pasta); } catch { /* índice é só aceleração */ }
}
export function indiceLeve(pasta = dirRecibos()) {
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter(nomeValido); } catch { return []; }
  const arq = path.join(pasta, ".indice-leve.json");
  const disco = carregarIndiceLeve(pasta);
  const out = []; let sujo = false; const vivos = new Set();
  for (const n of nomes) {
    const cam = path.join(pasta, n);
    let st; try { st = fs.statSync(cam); } catch { continue; }
    const mt = chaveMt(st), tam = st.size;
    vivos.add(n);
    let e = disco[n];
    if (!e || e.mt !== mt || e.tam !== tam) {
      const memo = MEMO.get(cam);
      let r = memo && Math.round(memo.mt) === mt ? memo.r : null;
      if (!r) { try { r = JSON.parse(fs.readFileSync(cam, "utf8")); } catch { r = null; } }
      if (!reciboIntegro(r)) { if (disco[n]) { delete disco[n]; sujo = true; } continue; }
      e = entradaLeve(mt, tam, r);
      disco[n] = e; sujo = true;
    }
    out.push(e);
  }
  for (const n of Object.keys(disco)) if (!vivos.has(n)) { delete disco[n]; sujo = true; }
  if (sujo) SUJO.add(pasta);
  gravarIndiceLeve(pasta);
  return out;
}

export const soDigitos = (n) => String(n || "").replace(/\D/g, "");

export function reciboPorId(id, pasta = dirRecibos()) {
  const i = String(id || "").trim();
  if (!/^\d{1,20}$/.test(i)) return null;
  try {
    const r = JSON.parse(fs.readFileSync(path.join(pasta, `${i}.json`), "utf8"));
    return reciboIntegro(r) ? r : null;
  } catch { return null; }
}

/** Recibos do processo (20 dígitos exatos, ou prefixo quando o número veio incompleto). */
export function recibosDoProcesso(numero, pasta = dirRecibos()) {
  const d = soDigitos(numero);
  if (d.length < 7) return [];
  return listarRecibos(pasta).filter((r) => {
    const nd = soDigitos(r.nr_processo);
    return nd && (nd === d || (d.length < 20 && nd.startsWith(d)));
  });
}

/** 1.42.0 (red team de 27/10/2026, achados 1 e 8): recibos do processo só com número de 20 dígitos e igualdade EXATA, lendo o texto
 *  só dos ids que o índice leve aponta para esse número (a 1ª listagem completa custava ~3 s e ~574 MB a cada obter_inteiro_teor). */
export function recibosDoProcessoExato(numero, pasta = dirRecibos()) {
  const d = soDigitos(numero);
  if (d.length !== 20) return [];
  return indiceLeve(pasta).filter((e) => soDigitos(e.nr_processo) === d).map((e) => reciboPorId(e.id_documento, pasta)).filter((r) => r && soDigitos(r.nr_processo) === d);
}

// ------------------------------------------------------------------ busca local ---
const STOP = new Set("a o as os e de da do das dos em no na nos nas um uma por para com que se ao aos à às ou não nao sob sobre".split(" "));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const W = "a-z0-9";
/** regex de termo sobre texto norm1 (minúsculas, sem acento, mesmo comprimento do bruto): palavra inteira;
 * `*` no fim = prefixo; espaço = frase. */
export function regexTermo(termo) {
  const t = norm1(String(termo || "")).trim();
  if (!t) return null;
  const partes = t.split(/\s+/).map((p) => {
    const pref = p.endsWith("*");
    const nucleo = p.replace(/\*+$/, "").replace(new RegExp(`[^${W}]+`, "g"), " ").trim().split(" ").filter(Boolean);
    if (!nucleo.length) return null;
    const corpo = nucleo.map(esc).join(`[^${W}]+`);
    return pref ? `${corpo}[${W}]*` : corpo;
  }).filter(Boolean);
  if (!partes.length) return null;
  return new RegExp(`(?<![${W}])` + partes.join(`[^${W}]+`) + `(?![${W}])`, "g");
}
const conta = (re, tn) => { if (!re) return 0; let n = 0; re.lastIndex = 0; while (re.exec(tn)) n++; return n; };


// 1.42.3 (relato de uso de 04/11/2026): a varredura offline só ficava aceitável depois de tirar, por script, o que o próprio recibo marca
// como transcrição, aspas, alegação da parte, doutrina e voto divergente. Agora é opção. Os trechos são recortes em bruto de `texto`;
// norm1 preserva o comprimento, então a posição no `_tn` é a do bruto.
const CAMPOS_ALHEIOS = ["trechos_transcritos", "trechos_entre_aspas", "trechos_alegacao_parte", "trechos_doutrina", "trechos_sentenca_transcrita"];
export function textoSemAlheios(r) {
  const tn = r._tn;
  const faixas = [];
  const marca = (trecho) => {
    const t = norm1(String(trecho || ""));
    if (t.length < 20) return;
    let i = tn.indexOf(t);
    while (i >= 0) { faixas.push([i, i + t.length]); i = tn.indexOf(t, i + t.length); }
  };
  for (const c of CAMPOS_ALHEIOS) for (const x of Array.isArray(r[c]) ? r[c] : []) marca(typeof x === "string" ? x : x && x.texto);
  if (typeof r.trecho_divergente === "string") marca(r.trecho_divergente);
  if (!faixas.length) return tn;
  faixas.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [a, b] of faixas) { if (b <= pos) continue; const ini = Math.max(a, pos); out += tn.slice(pos, ini) + " ".repeat(b - ini); pos = b; }
  return out + tn.slice(pos);
}
/** Os termos aparecem todos numa janela de até `n` palavras? `conjuntos` = lista de listas de regex (OU dentro, E entre). */
export function dentroDaProximidade(tn, conjuntos, n, tnPalavras = tn) {
  if (!conjuntos.length) return true;
  const inicios = [];
  const re = /[a-z0-9]+/g;
  for (let m = re.exec(tnPalavras); m; m = re.exec(tnPalavras)) inicios.push(m.index);
  const palavraDe = (pos) => { let a = 0, b = inicios.length - 1, r = 0; while (a <= b) { const mid = (a + b) >> 1; if (inicios[mid] <= pos) { r = mid; a = mid + 1; } else b = mid - 1; } return r; };
  const ev = [];
  conjuntos.forEach((g, k) => g.forEach((rx) => { rx.lastIndex = 0; for (let m = rx.exec(tn); m; m = rx.exec(tn)) { ev.push([palavraDe(m.index), k]); if (m[0].length === 0) rx.lastIndex++; } }));
  if (new Set(ev.map((e) => e[1])).size < conjuntos.length) return false;
  ev.sort((a, b) => a[0] - b[0]);
  const cont = new Array(conjuntos.length).fill(0);
  let tem = 0, i = 0;
  for (let j = 0; j < ev.length; j++) {
    if (cont[ev[j][1]]++ === 0) tem++;
    while (ev[j][0] - ev[i][0] > n) { if (--cont[ev[i][1]] === 0) tem--; i++; }
    if (tem === conjuntos.length) return true;
  }
  return false;
}


// 1.42.3 (relato de uso de 04/11/2026): o índice do portal dá só quem assinou; quando o juiz convocado substitui um desembargador, o titular
// só aparece no texto ("Juiz Convocado X, em substituição ao Des. Y"). Marca onde o texto diz isso; não adivinha onde não diz.
const RE_SUBST = /ju[ií]z[a]?\s+convocad[oa][^.]{0,160}?em\s+substitui[çc][ãa]o\s+(?:ao|à|a)\s+(?:des\.?|desembargador(?:a)?)\s+/gi;
export function substituicaoNoTexto(texto) {
  const t = String(texto || "");
  RE_SUBST.lastIndex = 0;
  const m = RE_SUBST.exec(t);
  if (!m) return null;
  const resto = t.slice(m.index + m[0].length, m.index + m[0].length + 70);
  const palavras = [];
  for (const w of resto.split(/\s+/)) {
    if (/^(relator[a]?|para|tratam-se|acordam|voto|processo|apela[çc][ãa]o|agravo|embargos|ac[óo]rd[ãa]o)$/i.test(w)) break;
    if (/^(d[aeo]s?|e)$/i.test(w) && palavras.length) { palavras.push(w); continue; }
    if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}'-]*[,.;:)]?$/u.test(w)) { palavras.push(w.replace(/[,.;:)]+$/, "")); if (/[,.;:)]$/.test(w)) break; } else break;
    if (palavras.length >= 4) break;
  }
  while (palavras.length && /^(d[aeo]s?|e)$/i.test(palavras[palavras.length - 1])) palavras.pop();
  const nome = palavras.join(" ").trim();
  return nome.length >= 5 ? nome : null;
}

export const RECIBOS_LIMITE_MAX = 20, GRUPOS_MAX = 6, TERMOS_POR_GRUPO_MAX = 12;

export function buscarRecibos(consulta, grupos, limite = 10, pasta = dirRecibos(), { nrProcesso = "", idDocumento = "", relator: relatorFiltro = "", excluirTranscricao = false, soVozDoRelator = false, proximidade = 0, agruparPor = "" } = {}) {
  const palavras = norm1(String(consulta || "")).split(/[^a-z0-9*]+/).filter((p) => p && !STOP.has(p.replace(/\*+$/, "")));
  const gs = Array.isArray(grupos) ? grupos.filter((g) => Array.isArray(g) && g.length).slice(0, GRUPOS_MAX)
    .map((g) => g.map((t) => String(t || "").trim()).filter(Boolean).slice(0, TERMOS_POR_GRUPO_MAX)).filter((g) => g.length) : [];
  // v1.14.0: filtro por processo (prefixo de dígitos) ou por id do documento — reencontrar um acórdão já lido, com ou sem termos
  const dig = soDigitos(nrProcesso), idDoc = String(idDocumento || "").trim();
  if (idDoc && !/^\d{1,20}$/.test(idDoc)) return `BUSCA LOCAL NÃO REALIZADA — id_documento deve ser numérico (recebi «${idDoc.slice(0, 40)}»).`;
  if (String(nrProcesso || "").trim() && dig.length < 7) return "BUSCA LOCAL NÃO REALIZADA — nr_processo precisa de pelo menos 7 dígitos (número CNJ, com ou sem máscara, ou o início dele).";
  const relN = norm1(String(relatorFiltro || "")).replace(/[^a-z0-9]+/g, " ").trim();
  if (!palavras.length && !gs.length && !dig && !idDoc && !relN) return "BUSCA LOCAL NÃO REALIZADA — informe `consulta` (palavras), `grupos` (sinônimos), `nr_processo`, `id_documento` ou `relator`.";
  const lim = Math.max(1, Math.min(Number(limite) || 10, RECIBOS_LIMITE_MAX));
  let todos = listarRecibos(pasta);
  const totalGeral = todos.length;
  if (idDoc) todos = todos.filter((r) => String(r.id_documento) === idDoc);
  if (dig) todos = todos.filter((r) => { const nd = soDigitos(r.nr_processo); return nd && (nd === dig || (dig.length < 20 && nd.startsWith(dig))); });
  if (relN) todos = todos.filter((r) => norm1(String(r.relator_indice || extrairRelatorDoTexto(r.texto) || "")).replace(/[^a-z0-9]+/g, " ").includes(relN));
  const resP = palavras.map(regexTermo).filter(Boolean);
  const resG = gs.map((g) => g.map(regexTermo).filter(Boolean)).filter((g) => g.length);
  const achados = [];
  const prox = Math.max(0, Math.min(Math.trunc(Number(proximidade) || 0), 50));
  const filtrandoTexto = !!(excluirTranscricao || soVozDoRelator || prox);
  const universo = todos;
  let semVoz = 0, naoProximos = 0, soAlheio = 0;
  for (const r of todos) {
    let tn = r._tn, bruto = r.texto;
    if ((excluirTranscricao || soVozDoRelator) && (!resP.every((re) => conta(re, tn) > 0) || !resG.every((g) => g.some((re) => conta(re, tn) > 0)))) continue;   // sem o termo no texto inteiro, não há no recorte
    if (soVozDoRelator) {
      bruto = String(r.texto_voz_propria || "");
      if (!bruto) { semVoz++; continue; }
      tn = norm1(bruto);
    } else if (excluirTranscricao) tn = textoSemAlheios(r);
    if (!resP.every((re) => conta(re, tn) > 0) || !resG.every((g) => g.some((re) => conta(re, tn) > 0))) { if (excluirTranscricao || soVozDoRelator) soAlheio++; continue; }
    if (prox && !dentroDaProximidade(tn, [...resP.map((re) => [re]), ...resG], prox, r._tn)) { naoProximos++; continue; }
    let soma = 0;
    for (const re of resP) soma += conta(re, tn);
    for (const g of resG) for (const re of g) soma += conta(re, tn);
    const peso = soma / Math.log(tn.length + 10);
    achados.push([peso, dataIso(r.data_julgamento), r, tn, bruto]);
  }
  achados.sort((a, b) => (b[0] - a[0]) || (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  // E de todas as palavras deu zero com consulta em linguagem natural: devolve os que têm MAIS delas (ranking BM25), dizendo isso
  let ranqueado = false;
  if (!achados.length && !gs.length && !dig && !idDoc && !filtrandoTexto && palavras.length >= 3 && todos.length) {
    const rk = rankearPorConsulta(consulta, todos, lim);
    if (rk.length) { ranqueado = true; for (const [r, sc] of rk) achados.push([sc, dataIso(r.data_julgamento), r]); }
  }
  // 1.42.3: EMENTA, VOTO e RELATÓRIO não têm fecho; o do ACÓRDÃO do MESMO julgamento (mesmo processo e data, fechos concordantes) vale por eles.
  const irmaos = new Map();
  const completa = universo.length === totalGeral ? universo : listarRecibos(pasta);
  for (const x of completa) if (x.tipo === "ACÓRDÃO") { const k = `${soDigitos(x.nr_processo)}|${x.data_julgamento || ""}`; (irmaos.get(k) || irmaos.set(k, []).get(k)).push(x); }
  const EMPRESTAM = new Set(["EMENTA", "VOTO", "VOTO VENCEDOR", "RELATÓRIO"]);
  const orgaoDe = (r) => {
    const o = extrairOrgaoComOrigem(r.texto);
    if (o) return { orgao: o.orgao, origem: o.origem };
    if (EMPRESTAM.has(String(r.tipo || "").toUpperCase()) && r.data_julgamento) {
      const fechos = (irmaos.get(`${soDigitos(r.nr_processo)}|${r.data_julgamento}`) || []).map((x) => extrairOrgaoComOrigem(x.texto));
      const nomes = new Set(fechos.map((f) => f && f.origem === "fecho" ? f.orgao : null));
      if (fechos.length && nomes.size === 1 && !nomes.has(null)) return { orgao: [...nomes][0], origem: "fecho do ACÓRDÃO do mesmo processo e data" };
    }
    return r.orgao_indice ? { orgao: r.orgao_indice, origem: "índice" } : null;
  };
  const filtroTxt = [dig ? `processo ${dig.length === 20 ? cnj(dig) : dig + "…"}` : "", idDoc ? `id ${idDoc}` : "", relN ? `relator «${relatorFiltro.trim()}»` : ""].filter(Boolean).join(", ");
  const termosMostrados = [...palavras, ...gs.flat()].join(", ") || "(sem termos)";
  const linhas = [
    ranqueado
      ? `**Recibos locais do TJRO — nenhum dos ${totalGeral} documento(s) já lidos tem TODAS as palavras de «${termosMostrados}»; abaixo, os ${achados.length} que têm MAIS delas (ranking BM25 sobre a ementa, palavras e pares vizinhos; em amostra nova de 20 consultas em linguagem natural, pôs o julgado certo no top 10 em 16 e no top 3 em 12; o E de todas as palavras deu zero nas 20) · ZERO requisição ao portal**`
      : `**Recibos locais do TJRO — ${achados.length} de ${totalGeral} documento(s) já lidos nesta máquina atendem a «${termosMostrados}»${filtroTxt ? ` em ${filtroTxt}` : ""} · ZERO requisição ao portal**`,
    "⚠️ Isto NÃO é pesquisa no acervo do TJRO: só olha o que obter_inteiro_teor_tjro já trouxe para esta máquina. Zero aqui NUNCA é \"não localizado\" — para isso, buscar_jurisprudencia_tjro. Classe e câmara do índice só existem em recibos gravados a partir da v1.10.0; nos antigos, a câmara vem do fecho do texto.",
    "",
  ];
  if (!todos.length) linhas.push(`_(nenhum recibo em ${pasta})_`);
  if (filtrandoTexto) {
    const f = [excluirTranscricao && !soVozDoRelator ? `sem transcrição, aspas, alegação da parte, doutrina, sentença transcrita e voto divergente (${soAlheio} recibo(s) só tinham os termos nesses trechos)` : "", soVozDoRelator ? `só a voz própria do relator (${semVoz} recibo(s) sem esse recorte foram pulados; ${soAlheio} só tinham os termos fora dele)` : "", prox ? `termos a até ${prox} palavras uns dos outros (${naoProximos} recibo(s) têm os termos, mas mais longe)` : ""].filter(Boolean);
    linhas.push(`🔎 Filtro de texto: ${f.join("; ")}. Classificação automática dos recibos, sem rotulagem cega: confira no inteiro teor antes de citar.`, "");
  }
  if (agruparPor && ranqueado) linhas.push("_(contagem agrupada omitida: nenhum recibo atende a todos os termos; o ranking acima é aproximado)_", "");
  else if (agruparPor) {
    const chave = { orgao: (r) => { const o = orgaoDe(r); return o ? (o.origem === "índice" ? `${o.orgao} (só índice, câmara não verificada)` : o.orgao) : "órgão não identificado"; }, relator_titular: (r) => String(substituicaoNoTexto(r.texto) || r.relator_indice || extrairRelatorDoTexto(r.texto) || "—").trim().toUpperCase(), relator: (r) => String(r.relator_indice || extrairRelatorDoTexto(r.texto) || "—").trim().toUpperCase(), ano: (r) => (String(r.data_julgamento || "").slice(-4) || "?") }[agruparPor];
    if (chave) {
      const c = new Map();
      for (const [, , r] of achados) { const k = chave(r); c.set(k, (c.get(k) || 0) + 1); }
      const ord = [...c.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      linhas.push(`**Contagem por ${agruparPor === "orgao" ? "órgão (do fecho quando legível)" : agruparPor === "relator_titular" ? "relator titular (juiz convocado entra no titular que o texto indica)" : agruparPor}** — sobre os ${achados.length} recibo(s) que atendem, não só os ${Math.min(lim, achados.length)} mostrados:`, ...ord.slice(0, 40).map(([k, n]) => `- ${k}: ${n}`), ord.length > 40 ? `- … e mais ${ord.length - 40} grupo(s)` : "", "");
    }
  }
  achados.slice(0, lim).forEach(([, , r, tnU, brutoU], i) => {
    const s = { nr_processo: r.nr_processo, id_processo_documento: r.id_documento, tipo: r.tipo, ds_classe_judicial: r.classe,
      nome_relator_acordao: r.relator_indice, ds_orgao_julgador_colegiado: r.orgao_indice };
    const org = orgaoDe(r);
    const orgaoTxt = org ? `${org.orgao} (${org.origem})${org.origem !== "índice" && r.orgao_indice && org.orgao !== r.orgao_indice ? `; índice: ${r.orgao_indice}` : ""}` : "órgão não identificado";
    const rel = relator(s) !== "—" ? relator(s) : extrairRelatorDoTexto(r.texto) || "—";
    const titular = substituicaoNoTexto(r.texto);
    const relTxt = titular ? `${rel} (Juiz Convocado, em substituição ao Des. ${titular}, segundo o texto)` : rel;
    linhas.push(`${i + 1}. ${r.tipo || "?"}${r.classe ? ` · ${r.classe}` : ""} · ${orgaoTxt} · julgado em ${r.data_julgamento || "?"} · Rel. ${relTxt} · ${cnj(r.nr_processo)} · id ${r.id_documento} · link ${link(s)}`);
    const re = resP[0] || (resG[0] && resG[0][0]);
    const tre = trechoEmVolta(brutoU ?? r.texto, tnU ?? r._tn, re);
    if (tre) linhas.push(`   «…${tre}…»`);
    linhas.push(`   recibo lido do portal em ${String(r.obtido_em || "?").slice(0, 16).replace("T", " ")}${r.trechos_transcritos ? ` · custódia: ${r.trechos_transcritos.length} transcrição(ões)${r.trecho_divergente ? ", voto divergente" : ""}` : " · sem campos de custódia (recibo antigo)"}`);
  });
  if (achados.length > lim) linhas.push(`\n_(mais ${achados.length - lim} recibo(s) atendem; aumente \`limite\` até ${RECIBOS_LIMITE_MAX} ou refine os termos)_`);
  linhas.push("\nPara o teor completo: obter_inteiro_teor_tjro(nr_processo) — se foi lido há menos de 7 dias, vem do cache sem gastar consulta. Para conferir uma frase antes das aspas: verificar_citacao_tjro(id_documento, trecho).");
  return linhas.join("\n");
}

// "dd/mm/aaaa" (recibo) ou ISO → "aaaa-mm-dd", para ordenar; vazio quando não há data.
function dataIso(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d || ""));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const i = /^(\d{4}-\d{2}-\d{2})/.exec(String(d || ""));
  return i ? i[1] : "";
}

function trechoEmVolta(texto, tn, re) {
  if (!re) return "";
  re.lastIndex = 0;
  const m = re.exec(tn);
  if (!m) return "";
  // norm1 preserva o comprimento: a posição no normalizado é a posição no bruto.
  const a = Math.max(0, m.index - 140), b = Math.min(texto.length, m.index + m[0].length + 140);
  return texto.slice(a, b).replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------ recálculo da custódia ---
const CAMPOS_CUSTODIA = ["trechos_transcritos", "trecho_divergente", "trechos_entre_aspas", "trechos_obiter", "texto_voz_propria",
  "trechos_alegacao_parte", "trechos_doutrina", "trechos_sentenca_transcrita"];   // 1.41.9 (custódia v5): os três de voz.js
const NORMALIZACAO = "trechos em bruto, recortados de `texto` — normalize com a sua própria função";
const cedeAoEventLoop = () => new Promise((r) => setImmediate(r));

/**
 * Refaz a custódia dos recibos gravados por uma heurística diferente da atual (sem `custodia_v` ou com número
 * diferente de CUSTODIA_VERSAO). Só os campos que camposCustodia (voz.js) produz mudam; texto, id, tipo e data ficam como estão.
 * Atômico (arquivo temporário + rename) e sem sobrescrever um recibo que mudou desde a leitura (outro processo pode
 * estar gravando o mesmo). `forcar` recalcula todos, ignorando o carimbo (harness). `gravar:false` só conta.
 * Assíncrono em blocos: no 1º início depois de uma atualização são centenas de arquivos, e a busca do usuário não
 * pode esperar por isso.
 */
export async function recalcularRecibos({ pasta = dirRecibos(), gravar = true, forcar = false, bloco = 25 } = {}) {
  const r = { total: 0, desatualizados: 0, alterados: 0, regravados: 0, ignorados: 0, mudancas: [] };
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter(nomeValido); } catch { return r; }
  let k = 0;
  for (const n of nomes) {
    if (++k % bloco === 0) await cedeAoEventLoop();
    const cam = path.join(pasta, n);
    let mt, rec;
    try {
      mt = fs.statSync(cam).mtimeMs;
      rec = JSON.parse(fs.readFileSync(cam, "utf8"));
    } catch { r.ignorados++; continue; }
    if (!reciboIntegro(rec)) { r.ignorados++; continue; }
    r.total++;
    if (!forcar && rec.custodia_v === CUSTODIA_VERSAO) continue;
    r.desatualizados++;
    let novo;
    try { novo = camposCustodia(rec.texto, rec.tipo); } catch { r.ignorados++; continue; }   // custódia falhou: deixa como está
    const mudouCampo = CAMPOS_CUSTODIA.some((c) => JSON.stringify(rec[c]) !== JSON.stringify(novo[c]));
    if (mudouCampo) {
      r.alterados++;
      r.mudancas.push([n, (rec.trechos_transcritos || []).reduce((a, x) => a + x.length, 0), novo.trechos_transcritos.reduce((a, x) => a + x.length, 0)]);
    }
    if (!gravar) continue;
    try {
      if (fs.statSync(cam).mtimeMs !== mt) continue;   // alguém regravou no meio: a próxima vez pega
      for (const c of CAMPOS_CUSTODIA) delete rec[c];
      Object.assign(rec, novo, { custodia_v: CUSTODIA_VERSAO, normalizacao: NORMALIZACAO });
      const tmp = path.join(pasta, `.${n}.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(rec));
      fs.renameSync(tmp, cam);
      r.regravados++;
    } catch { r.ignorados++; }
  }
  return r;
}

// ------------------------------------------------------------- leitura por trecho ---
// 1.41.11 (diagnóstico de 26/10/2026, item 4): o inteiro teor corta peças grandes (~25 mil caracteres por peça quando o
// processo tem várias). Ler a parte cortada não pode custar outra consulta ao portal: lê o RECIBO local, que guarda o
// texto inteiro. Sem recibo, não vai à rede: manda abrir o inteiro teor uma vez (é isso que grava o recibo).
export const JANELA_LEITURA = 25000;
export function lerTrechoDoRecibo({ id_documento = "", nr_processo = "", offset, trecho_em_torno_de = "", tamanho = JANELA_LEITURA, pasta = dirRecibos() } = {}) {
  let r = id_documento ? reciboPorId(id_documento, pasta) : null;
  if (!r && !id_documento && nr_processo) {
    // 1.42.0 (red team, achado 2): sem id, só número completo. Número curto casava por prefixo e lia o acórdão de OUTRO processo.
    const d = soDigitos(nr_processo);
    if (d.length !== 20) {
      const cand = d.length >= 7 ? indiceLeve(pasta).filter((e) => soDigitos(e.nr_processo).startsWith(d)) : [];
      const lista = cand.slice(0, 30).map((e) => `- id ${e.id_documento} · ${e.tipo || "?"} · processo ${e.nr_processo || "?"}${e.data_julgamento ? ` · ${e.data_julgamento}` : ""}`);
      return `Número de processo incompleto (${d.length} dígitos; são 20): sem id_documento, a leitura do recibo local exige o número inteiro, para não ler peça de outro processo. Nenhuma consulta ao portal foi feita.` +
        (lista.length ? ` Recibos locais com esse início (escolha o id e repita com id_documento):\n${lista.join("\n")}${cand.length > 30 ? `\n- … e mais ${cand.length - 30}` : ""}` : " Nenhum recibo local começa com esse número.");
    }
    const docs = recibosDoProcessoExato(d, pasta).filter((x) => x.tipo === "ACÓRDÃO");
    r = docs.sort((a, b) => (b.texto || "").length - (a.texto || "").length)[0] || null;
  }
  if (!r)
    return `Sem recibo local ${id_documento ? `do id ${id_documento}` : `de ACÓRDÃO do processo ${nr_processo}`}: nenhuma consulta ao portal foi feita. ` +
      "Chame obter_inteiro_teor_tjro uma vez SEM offset/trecho_em_torno_de (isso grava o recibo) e repita com o id da peça.";
  const texto = String(r.texto || "");
  const total = texto.length;
  const tam = Math.max(1000, Math.min(Number(tamanho) || JANELA_LEITURA, JANELA_LEITURA));
  let ini;
  let nota = "";
  if (String(trecho_em_torno_de || "").trim()) {
    const alvo = norm1(String(trecho_em_torno_de).replace(/\s+/g, " ").trim());
    // 1.42.0 (red team, achado 9): colapsa os espaços também no TEXTO e mapeia a posição de volta ao texto bruto
    const tn = norm1(texto);
    let col = "", mapa = [];
    for (let i = 0; i < tn.length; i++) {
      if (/\s/.test(tn[i])) { if (col.endsWith(" ")) continue; col += " "; } else col += tn[i];
      mapa.push(i);
    }
    const pc = col.indexOf(alvo);
    const pos = pc < 0 ? -1 : mapa[pc]; // norm1 preserva o comprimento: a posição vale no texto bruto
    if (pos < 0) return `O trecho "${String(trecho_em_torno_de).slice(0, 120)}" não está no recibo do id ${r.id_documento} (${total} caracteres). Nenhuma consulta ao portal foi feita. Tente uma expressão mais curta, ou leia por offset.`;
    ini = Math.max(0, pos - Math.floor(tam / 2));
    nota = `trecho encontrado no caractere ${pos}`;
  } else {
    ini = Math.max(0, Math.min(Number.isFinite(Number(offset)) ? Math.floor(Number(offset)) : 0, total));
  }
  const fim = Math.min(total, ini + tam);
  const prox = fim < total ? ` · continua: offset=${fim}` : " · fim do documento";
  return `## ${r.tipo || "?"} · id ${r.id_documento} · processo ${r.nr_processo || "?"}${r.data_julgamento ? ` · julgado em ${r.data_julgamento}` : ""}\n` +
    `_Lido do recibo local (sem consulta ao portal), caracteres ${ini} a ${fim} de ${total}${nota ? ` (${nota})` : ""}${prox}. ` +
    "Para aspas, confirme com verificar_citacao_tjro, que diz de quem é a frase._\n\n" +
    texto.slice(ini, fim);
}
