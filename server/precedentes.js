// v1.36.0 (pedido do autor, 15/10/2026): apoio a distinguishing, superação (overruling), natureza do julgado (precedente
// qualificado × jurisprudência persuasiva) e leading case. NADA aqui decide: a ferramenta devolve texto LITERAL do julgado e
// sinais lexicais medidos às cegas; quem decide se distingue, se foi superado e qual é o leading case é o advogado.
// Base normativa conferida no Planalto (15/10/2026): art. 927 (o que se observa), art. 947 §3º (IAC vincula salvo revisão),
// art. 985 (IRDR vale para todos os processos do tribunal, salvo revisão, art. 986), art. 489 §1º V e VI (fundamentos
// determinantes; distinção ou superação). Situação de precedente qualificado se confere no BNP do CNJ, não aqui.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { norm1, faixasAlheias } from "./custodia.js";
import { teseDaEmenta, fatosDoJulgado, secoesDaEmenta } from "./posicao.js";
import { listarRecibos, reciboPorId, recibosDoProcesso, soDigitos } from "./recibos.js";
import { tokens } from "./similares.js";
import { cadeiaDoProcesso, blocoCadeia, semaforo } from "./cadeia.js";
import { fold, ancoras, frasesDoTexto, cnj, resultadoComOrigem, rotuloDoConjunto, ROTULOS_RESULTADO, dataDoFecho, VERSAO, dirCache, extrairOrgaoComOrigem, extrairRelatorDoTexto } from "./lib.js";
import { STOP_SIM } from "./similares.js";

// ------------------------------------------------------------------- natureza ---
const RE_TESE_FIXADA = /\b(?:fix\w+|firm\w+|aprov\w+)(?:-se)? (?:\w+ ){0,3}(?:seguinte )?tese|\btese juridica\b|\bteses? (?:fixada|firmada)/;
/** Natureza do julgado no sistema do art. 927 do CPC: linha pronta para a saída. */
export function naturezaDoJulgado(s, texto) {
  const classe = fold(s?.classe || s?.ds_classe_judicial || ""), tipo = String(s?.tipo || "").toUpperCase();
  const tn = fold(texto || "");
  const anc = ancoras(texto);
  const ancTxt = anc.length ? ` Cita precedente(s) qualificado(s): ${anc.join(", ")}; o que vincula é ele, não este julgado (confira a situação no BNP do CNJ).` : "";
  if (/resolucao de demandas repetitivas|\birdr\b/.test(classe) || /assuncao de competencia/.test(classe)) {
    const qual = /assuncao/.test(classe) ? "IAC (art. 947, § 3º)" : "IRDR (art. 985)";
    return RE_TESE_FIXADA.test(tn)
      ? `🏛️ NATUREZA: PRECEDENTE QUALIFICADO, ${qual}, art. 927, III, do CPC. Vincula juízes e órgãos do TJRO, salvo revisão de tese. É o leading case da tese que fixa. Confira no BNP se a tese continua vigente.`
      : `🏛️ NATUREZA: acórdão em ${qual} sem tese fixada no texto (pode ser admissibilidade ou incidente). Só o julgamento de mérito que fixa a tese é precedente qualificado; confira no BNP.`;
  }
  if (/arguicao de inconstitucionalidade/.test(classe) || /\b(?:tribunal pleno|orgao especial)\b/.test(fold(s?.orgao_indice || s?.ds_orgao_julgador_colegiado || "")))
    return `🏛️ NATUREZA: decisão do Pleno ou do Órgão Especial (art. 927, V, do CPC): de observância pelos órgãos do TJRO.${ancTxt}`;
  if (["SENTENÇA", "SENTENCA"].includes(tipo)) return "🏛️ NATUREZA: decisão de 1º grau. Não é precedente nem jurisprudência de tribunal; serve só como exemplo de como o juízo decide.";
  if (/^DECIS/.test(tipo)) return `🏛️ NATUREZA: decisão monocrática. Não é precedente; no máximo, indica o entendimento do relator.${ancTxt}`;
  return `🏛️ NATUREZA: JURISPRUDÊNCIA (persuasiva). Acórdão de câmara não está no rol do art. 927 do CPC: serve de argumento, não vincula.${ancTxt}`;
}

// --------------------------------------------------------------- citações / leading case ---
const RE_CNJ = /(?<![0-9])(\d{7})-?(\d{2})\.?(\d{4})\.?(?:8\.?22|822)\.?(\d{4})(?![0-9])/g; // lookaround por dígito, igual ao Python (red-team 17/10/2026)
// v1.39.0 (ideia do eyecite/CourtListener): o recurso interno ou os embargos dentro de um REsp ("AgInt nos EDcl no REsp 123")
// são o MESMO processo do STJ — a chave é a classe-base + número, e "AgInt no REsp 123" e "REsp 123/RO" contam uma vez.
// Classes novas medidas nos 6.395 recibos de 17/10/2026 (EAREsp 580, ADI 397, HC/RHC 309, RMS 44, Rcl 44): a regra antiga
// perdia ~25% das citações a tribunal superior. AI e CC ficam de fora (AI nº 0804416-91… é agravo de TJ; CC é o Código Civil);
// MS nunca colado ao número (evita "OAB nº MS5871A"); número seguido de "-NN.NNNN" é CNJ, não classe superior ("MS 0800197-56.2018…").
// "/2019/0334073-4" depois do número é o registro do STJ no formato JusBrasil ("AREsp: 1615833 MS 2019/…": MS é a UF), não citação.
// Aceita "REsp1234567/SP" (sem espaço) e o sufixo do STF "-AgR", "-RG", "-9", e a UF depois de "/" ou "-" ("REsp 1.234.567-MA").
const UF_SUP = "AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO";
const RE_SUP = new RegExp(`\\b((?:(?:AgInt|AgRg|EDcl)\\s+n[oa]s?\\s+)*)(REsp|AREsp|EREsp|EAREsp|RE|ARE|RMS|RHC|HC|Rcl|ADI|ADPF|ADC|MS)(?::?\\s+(?:n[º°.]*\\s*)?|\\s*n[º°.]+\\s*|(?<!MS))(\\d{1,3}(?:\\.\\d{3})+|\\d{4,7})(?!\\d|\\.\\d|-\\d{2}\\.\\d|\\/\\d)(?:-(?:AgR|RG|ED|\\d)\\b)?(?:\\s*[/-]\\s*(${UF_SUP})\\b)?`, "g");
/** Processos citados no texto (TJRO pelo CNJ; STJ/STF pela classe-base e número), sem repetir. */
export function citacoesDoTexto(texto) {
  const t = String(texto || ""), out = new Set(), sup = new Map();
  for (const m of t.matchAll(RE_CNJ)) out.add(cnj(`${m[1]}${m[2]}${m[3]}822${m[4]}`));
  for (const m of t.matchAll(RE_SUP)) {
    const k = `${m[2]} ${m[3].replace(/\./g, "")}`;
    if (!sup.has(k) || (!sup.get(k) && m[4])) sup.set(k, m[4] || "");
  }
  for (const [k, uf] of sup) out.add(uf ? `${k}/${uf}` : k);
  return [...out];
}
/** Leading case candidato num conjunto de decisões do MESMO tema: IRDR/IAC com tese fixada primeiro; depois o mais citado
 * pelas demais (indício: o mais citado aplica a tese com frequência, mas não é necessariamente o que a fixou). */
export function leadingCase(docs, max = 5) {
  const qualificados = docs.filter((d) => /resolucao de demandas repetitivas|assuncao de competencia/.test(fold(d.classe || "")) && RE_TESE_FIXADA.test(fold(d.texto || "")));
  // conta PROCESSOS que citam (acórdão e ementa do mesmo processo contam uma vez)
  const quem = new Map();
  for (const d of docs) {
    const proprio = cnj(d.nr_processo || "");
    for (const c of citacoesDoTexto(d.texto)) if (c !== proprio) { if (!quem.has(c)) quem.set(c, new Set()); quem.get(c).add(proprio || d.id_documento); }
  }
  const cont = new Map([...quem.entries()].map(([c, ps]) => [c, ps.size]));
  const ancs = new Map();
  for (const d of docs) for (const a of ancoras(d.texto)) ancs.set(a, (ancs.get(a) || 0) + 1);
  return {
    qualificados: qualificados.map((d) => ({ id: d.id_documento, nr: cnj(d.nr_processo || ""), data: d.data_julgamento || "" })),
    // empate desempata pelo nome (ordem de código, igual ao sorted() do Python): red-team 17/10/2026 achou os 5 "mais citados" em ordem diferente nos dois servidores
    maisCitados: [...cont.entries()].filter(([, q]) => q >= 2).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, max),
    ancoras: [...ancs.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, max),
  };
}

// --------------------------------------------------------------- comparação de fatos ---
/** Termos de conteúdo dos fatos do caso (sem palavra vazia, 4+ letras), na ordem, sem repetir. */
export function termosDosFatos(fatos, max = 25) {
  const out = [];
  for (const w of fold(fatos || "").split(/[^a-z0-9]+/)) {
    if (w.length < 4 || /^\d+$/.test(w) || STOP_SIM.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}
/** Expressões dos fatos: pares de palavras de conteúdo vizinhas (só palavra vazia entre elas), com a grafia original. */
export function expressoesDosFatos(fatos, max = 20) {
  const ws = String(fatos || "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = [];
  let ant = null;
  for (const w of ws) {
    const f = fold(w);
    if (f.length < 4 || /^\d+$/.test(f) || STOP_SIM.has(f)) continue;
    if (ant && !out.some((e) => e.a === ant.f && e.b === f)) out.push({ a: ant.f, b: f, rotulo: `${ant.w} … ${w}`, wb: w });
    ant = { f, w };
    if (out.length >= max) break;
  }
  return out;
}
// verbo no pretérito ("contratou") fica inteiro: a raiz curta casava com o substantivo ("contrato em empréstimo")
const raizDe = (t) => (/(?:ou|aram|eram|iram)$/.test(t) ? t : t.length > 6 ? t.slice(0, t.length - 2) : t);
/** Fatos do caso × precedente, em duas camadas: (1) EXPRESSÕES (duas palavras vizinhas dos seus fatos, no máximo duas palavras
 * entre elas no julgado), preferindo a frase do VOTO à do relatório; (2) palavra solta só com 6+ letras e só no voto, porque palavra
 * curta e genérica ("comum", "banco") casou com "prazo comum" e "FEBRABAN" no teste de 15/10/2026. Cada frase diz de onde vem:
 * relatório narra pedido e alegação; voto é o que o julgado afirma. Ausência de palavra NÃO prova fato diferente. */
export function compararFatos(fatos, texto, tipo = "ACÓRDÃO") {
  const t = String(texto || "");
  const fx = faixasAlheias(t, tipo);
  const fora = (i) => !fx.transcritas.some(([a, b]) => i >= a && i < b);
  // o cabeçalho (partes, advogados, gabinete) não é fato do julgado: começa no RELATÓRIO quando ele vem no início
  const rel = t.slice(0, 4000).search(/\bRELAT[ÓO]RIO\b/);
  const ini = rel > 0 ? rel : 0;
  const mv = t.slice(ini + 9).search(/\bVOTO\b|[ÉE] o relat[óo]rio|\bFUNDAMENTA[ÇC][ÃA]O\b/);
  const voto = rel >= 0 && mv >= 0 ? ini + 9 + mv : -1;
  const onde = (i) => (voto < 0 ? "texto" : i >= voto ? "voto" : "relatório: narra alegação, não fato reconhecido");
  const frases = [];
  let pos = ini;
  for (const f of frasesDoTexto(t)) {
    const i = t.indexOf(f, pos);
    if (i >= 0) pos = i + f.length;
    if (i >= 0 && fora(i)) frases.push({ i, f, x: fold(f) });
  }
  const achar = (re, soVoto) => {
    const cand = frases.filter((x) => re.test(x.x));
    const v = cand.find((x) => voto >= 0 && x.i >= voto);
    return v || (soVoto ? null : cand[0]) || null;
  };
  const lit = (fr) => fr.f.replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, 300);
  const expressoes = [], cobertos = new Set();
  for (const e of expressoesDosFatos(fatos)) {
    const re = new RegExp(`\\b${raizDe(e.a)}\\w*(?:\\W+\\w+){0,2}?\\W+${raizDe(e.b)}\\w*`);
    const fr = achar(re, false);
    if (!fr) continue;
    const ult = expressoes[expressoes.length - 1];
    // expressões encadeadas na mesma frase viram uma linha só ("cartão … crédito … reserva … margem")
    if (ult && ult.frase === lit(fr) && ult.fim === e.a) { ult.termo += ` … ${e.wb}`; ult.fim = e.b; }
    else expressoes.push({ termo: e.rotulo, frase: lit(fr), onde: onde(fr.i), fim: e.b });
    cobertos.add(e.a); cobertos.add(e.b);
  }
  const presentes = [], ausentes = [];
  for (const termo of termosDosFatos(fatos)) {
    if (cobertos.has(termo)) continue;
    const re = new RegExp(`\\b${raizDe(termo)}\\w*`);
    if (!frases.some((x) => re.test(x.x))) { ausentes.push(termo); continue; }
    const fr = termo.length >= 6 ? achar(re, true) : null;
    if (fr) presentes.push({ termo, frase: lit(fr), onde: onde(fr.i) });
  }
  return { expressoes: expressoes.map(({ fim, ...x }) => x), presentes, ausentes };
}


// ------------------------------------------------------------ frases candidatas ---
// Medidas às cegas (15/10/2026, 2 rotuladores Sonnet e Opus, amostra NOVA de 64 frases, concordância 61/64): distinção 18/29,
// aplicação de precedente qualificado 14/23, mudança de entendimento 3/9; ressalva pessoal 7/7 (1ª amostra). Nenhuma passa como
// Aplicação remedida em 15/10/2026 (amostra nova de 40, concordância 37/40): 26 de 37; exigir verbo de aplicação foi testado e
// descartado, porque as 10 frases que ele cortava eram todas aplicação para os dois rotuladores.
// RÓTULO: saem como FRASES CANDIDATAS, literais, com o acerto medido ao lado; quem lê decide.
export const ACERTO_FRASES = { distincao: "20 de 28", aplicacao: "26 de 37", mudanca: "1 de 9; regra estreitada depois, sem frases novas para remedir", ressalva: "7 de 7" };
const OBJ = "(?:tema|sumula|precedente|tese|irdr|iac|paradigma|julgado|acordao|entendimento firmado|orientacao firmada|jurisprudencia)";
const RE_MUDANCA = new RegExp("\\b(?:overruling|(?:entendimento|orientacao|tese|jurisprudencia|sumula|precedente|posicionamento)\\b.{0,60}\\b(?:encontra-se|esta|restou|foi|ficou) superad[ao]|revisao (?:da|de) tese|superacao (?:do|da|de) (?:precedente|entendimento|tese|jurisprudencia|orientacao)|" +
  "(?:revejo|reviso|revisito|altero|modifico|readequo|realinho|reformulo|supero|mudo|retifico) (?:\\w+ ){0,2}(?:meu |o meu |o |este |esse |aquele )?(?:entendimento|posicionamento|orientacao|posicao)|" +
  "(?:passo|passei|passamos) a (?:entender|adotar|decidir|admitir|reconhecer|seguir|acompanhar)|" +
  "(?:este|esta|deste|desta|o|a) (?:tribunal|corte|camara|colegiado|turma) (?:\\w+ ){0,3}(?:alterou|modificou|reviu|revisou|superou|passou a|mudou|evoluiu)|" +
  "(?:evolucao|alteracao|mudanca|modificacao|revisao) (?:\\w+ ){0,2}(?:do|da) (?:entendimento|jurisprudencia|orientacao|posicionamento) (?:\\w+ ){0,2}(?:desta|deste|da|do) (?:corte|tribunal|camara|colegiado|turma))\\b");
const RE_NEGA = /\bartigo 489|\b(?:nao houve|inexist\w+|ausencia de|sem) (?:\w+ ){0,4}(?:alterac|modificac|mudanc|superac|revis|fundamentos? nov)|rediscut|tentativa|pretende|pretensao|insurg|almeja|alega|relat(?:a|ou)\b|narra|art\. 489|ratio decidendi|common law|doutrina|demandaria|reexame|vedad\w+|nao havia razoes|nao havendo|passo a (?:decidir|analisar|examinar|apreciar)/;
const RE_PARTE = /\b(?:argument\w*|defende\w*|afirm\w*|aduz\w*|sustent\w*|aleg\w*|pugn\w*|requer\w*|pretend\w*|insurg\w*)\b/;
const RE_RESSALVA = /\b(?:ressalvad\w+ (?:o )?(?:meu|minha) (?:entendimento|posicionamento|posicao|opiniao|conviccao)|ressalva (?:de|do) (?:meu )?entendimento(?: pessoal)?|ressalvando (?:o )?meu (?:entendimento|posicionamento)|ressalvo (?:o )?meu (?:entendimento|posicionamento)|curvo-me|curvando-me|me curvo)\b/;
const RE_APLICA = /\b(?:tese (?:juridica )?(?:fixada|firmada)|em (?:observancia|atencao|cumprimento|obediencia) (?:a|ao) (?:tese|tema|irdr|iac|sumula|precedente)|aplicacao (?:da tese|do tema|do irdr|do iac|do precedente)|(?:conforme|consoante|nos termos d\w) (?:o |a )?(?:tema|irdr|iac) (?:n\w* )?\d)/;
const RE_DISTINCAO = /\b(?:distinguishing|distincao|distinguir|distingue|inaplic\w+|nao se (?:aplica|amolda|ajusta|enquadra|subsume)|afast\w+ (?:a )?(?:aplicacao|incidencia)|(?:hipotese|situacao|caso) (?:fatica |concreto )?(?:diversa|distinta|diverso|distinto)|peculiar\w*|diferentemente)\b/;
const RE_OBJ = new RegExp(`\\b${OBJ}\\b`);
// Ajuste de 15/10/2026 (1ª amostra, 93 frases, 2 rotuladores cegos): o marcador de distinção tem de estar PERTO do precedente
// (60 caracteres); súmula/tema citado como fonte de que uma LEI não se aplica é aplicação, não distinção; fórmula da ementa
// ("questão em discussão", "tese de julgamento"), "não se amolda à finalidade dos aclaratórios" e "distinção entre" conceitos não contam.
// "tese" sozinha pode ser tese da parte ("tese do desvio produtivo"): na distinção só conta tese fixada/firmada/de tema ou IRDR
const OBJ_D = "(?:tema|sumula|precedente|irdr|iac|paradigma|julgado|acordao|entendimento firmado|orientacao firmada|jurisprudencia|incidente de resolucao|demandas repetitivas|recursos? repetitivos?|tese (?:fixada|firmada|juridica|do tema|do irdr|repetitiva))";
const RE_DIST_PERTO = new RegExp(`${RE_DISTINCAO.source}.{0,120}\\b${OBJ_D}\\b|\\b${OBJ_D}\\b.{0,120}${RE_DISTINCAO.source}`);
const RE_DIST_FORA = /questao em discussao|tese de julgamento|ressalvad\w+ as peculiaridades|finalidade dos (?:aclaratorios|embargos)|distincao entre (?:os|as|o|a) |(?:conforme|consoante|nos termos d\w+|segundo|que afasta)\s.{0,40}\b(?:sumula|tema)\b|\bafastando\b|eventual distincao|deve ser apreciad|condic\w+ economic|quantum|doutrina/;
function ehDistincao(x) {
  return RE_DISTINCAO.test(x) && RE_DIST_PERTO.test(x) && !RE_PARTE.test(x) && !RE_DIST_FORA.test(x);
}
/** Frases candidatas, na voz do próprio julgado (fora de transcrição, voto divergente e declaração de voto). */
export function frasesDePrecedente(texto, tipo = "ACÓRDÃO", max = 3) {
  const t = String(texto || "");
  const fx = faixasAlheias(t, tipo);
  const alheias = [...fx.transcritas, ...(fx.divergente ? [fx.divergente] : [])];
  const out = { distincao: [], aplicacao: [], mudanca: [], ressalva: [] };
  let pos = 0;
  for (const f of frasesDoTexto(t)) {
    const i = t.indexOf(f, pos);
    if (i >= 0) pos = i + f.length;
    if (i < 0 || alheias.some(([a, b]) => i >= a && i < b)) continue;
    const x = fold(f);
    if (/declaracao de voto|voto divergente|voto vencido/.test(x)) continue;
    const lit = f.replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, 320);
    if (RE_RESSALVA.test(x)) out.ressalva.push(lit);
    else if (RE_MUDANCA.test(x) && !RE_NEGA.test(x) && !RE_PARTE.test(x)) out.mudanca.push(lit);
    else if (ehDistincao(x)) out.distincao.push(lit);
    else if (RE_APLICA.test(x) && !RE_PARTE.test(x)) out.aplicacao.push(lit);
  }
  for (const k of Object.keys(out)) out[k] = out[k].slice(0, max);
  return out;
}

// ----------------------------------------------------------------------- ficha ---
const isoBr = (br) => (/^\d{2}\/\d{2}\/\d{4}$/.test(br || "") ? br.split("/").reverse().join("-") : "");
// Núcleo do julgado para medir "mesmo tema": tese + razões de decidir + caso em exame da ementa do CNJ; sem o modelo, o começo
// do voto. O texto inteiro de acórdãos bancários se parece todo (partes, fórmulas) e misturava teses diferentes.
// 15/10/2026: a ementa do acórdão vem no FIM e o voto pode transcrever a de outro processo; antes lia só os 15.000 primeiros
// caracteres e o núcleo podia ser a ementa citada. Agora: seções fora de transcrição, a partir do último "caso em exame".
function nucleo(t, tipo = "ACÓRDÃO") {
  const x = String(t || "");
  const NOMES = ["caso em exame", "razoes de decidir", "dispositivo e tese", "dispositivo"];
  let sec = secoesDaEmenta(x, 0, x.length).filter((s) => NOMES.includes(s.nome));
  if (sec.length > 4 || (sec.length && sec[0].a > 15000)) {
    const tr = faixasAlheias(x, tipo).transcritas;
    sec = sec.filter((s) => !tr.some(([a, b]) => s.a >= a && s.a < b));
    const k = sec.map((s) => s.nome).lastIndexOf("caso em exame");
    if (k >= 0) sec = sec.slice(k);
  }
  if (sec.length) return sec.map((s) => x.slice(s.a, s.b)).join(" ");
  const v = x.search(/\bVOTO\b/);
  return x.slice(v > 0 ? v : 0, (v > 0 ? v : 0) + 3000);
}
const conj = (t) => new Set(tokens(nucleo(t)));
// memória por recibo (id + tamanho do texto): o servidor vive a sessão inteira e cada chamada recalculava núcleo, citações e
// frases de todos os recibos posteriores (0,8 s por chamada com 4.070 recibos; medido em 15/10/2026)
const MEMO_X = new Map();
// Disco (só na pasta de recibos padrão): o que se calcula por recibo (núcleo da ementa e citações) vai para um arquivo do cache, para
// a PRIMEIRA chamada de cada sessão não refazer 2 s de conta (medido em 15/10/2026, 4.070 recibos). A chave do arquivo é a versão
// do servidor + hash do código que calcula; mudou regra, o arquivo é descartado. Nunca guarda texto de decisão: só tokens e citações.
let DISCO = false, DERIV_LIDO = false, DERIV_SUJO = false;
const arqDeriv = () => path.join(dirCache(), "precedentes-derivados.json");
const assinaturaDeriv = () => crypto.createHash("sha1").update(VERSAO + nucleo.toString() + tokens.toString() + citacoesDoTexto.toString() + secoesDaEmenta.toString()).digest("hex").slice(0, 16);
function lerDeriv() {
  if (DERIV_LIDO || !DISCO) return;
  DERIV_LIDO = true;
  try {
    const d = JSON.parse(fs.readFileSync(arqDeriv(), "utf8"));
    if (d.assinatura !== assinaturaDeriv()) return;
    for (const [k, v] of Object.entries(d.m)) MEMO_X.set(k, { conj: v.c ? new Set(v.c) : undefined, cit: v.i });
  } catch { /* sem arquivo ou ilegível: recalcula */ }
}
function gravarDeriv() {
  if (!DISCO || !DERIV_SUJO) return;
  try {
    const m = {};
    for (const [k, v] of MEMO_X) if (v.conj || v.cit) m[k] = { c: v.conj ? [...v.conj] : undefined, i: v.cit };
    fs.mkdirSync(dirCache(), { recursive: true });
    const tmp = arqDeriv() + `.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ assinatura: assinaturaDeriv(), m }));
    fs.renameSync(tmp, arqDeriv());
    DERIV_SUJO = false;
  } catch { /* cache é só aceleração */ }
}
function memoX(x) {
  lerDeriv();
  const t = x.texto || "";
  const k = `${x.id_documento}:${t.length}:${t.charCodeAt(t.length >> 1) || 0}${t.charCodeAt(t.length >> 2) || 0}`;
  let v = MEMO_X.get(k);
  if (!v) {
    if (MEMO_X.size > 20000) MEMO_X.clear();
    v = {};
    MEMO_X.set(k, v);
  }
  return v;
}
const conjX = (x) => { const m = memoX(x); if (!m.conj) { m.conj = conj(x.texto); DERIV_SUJO = true; } return m.conj; };
const citX = (x) => { const m = memoX(x); if (!m.cit) { m.cit = citacoesDoTexto(x.texto); DERIV_SUJO = true; } return m.cit; };
const frasesX = (x) => (memoX(x).fr ??= frasesDePrecedente(x.texto, x.tipo, 1));
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); };
const rotulo = (r) => { const ro = resultadoComOrigem(r.texto, r.tipo); const k = rotuloDoConjunto(ro.conjunto, r.classe, ro.embargos); return k ? ROTULOS_RESULTADO[k] : ""; };
// medido às cegas (15/10/2026, 40 pares, Sonnet e Opus, concordância 37/40): núcleo ≥ 0,25 → mesma questão jurídica 9/9;
// 0,20–0,24 → 19/28 (o resto, assunto vizinho). Resultado oposto, que pesa na superação, só a partir de 0,25.
export const LIMIAR_TEMA = 0.2, LIMIAR_MESMA_QUESTAO = 0.25;
// 1.41.11 (diagnóstico de uso de 26/10/2026, item 8): o 🟠 "do mesmo tema com resultado oposto" apontava julgado de outra matéria.
// Leitura de 15 pares na cópia dos recibos: entre 0,25 e 0,30, 3 de 10 eram de outra matéria (honorários × embargos de declaração;
// descontos × tarifa/seguro; RMC × seguro não contratado); a partir de 0,30, 5 de 5 da mesma matéria. Só ≥ 0,30 conta no semáforo
// ("mesmo tema"); entre 0,25 e 0,30 sai listado à parte como "mesma palavra" (vocabulário parecido; o assunto pode ser outro).
export const LIMIAR_RESULTADO_OPOSTO = 0.3;
export const TETO_IDS_OPOSTOS = 10;
const OPOSTOS = [["provido", "desprovido"], ["parcialmente provido", "desprovido"], ["acolhido", "rejeitado"]];

function escolherRecibo(id, nr, pasta) {
  if (id) return reciboPorId(id, pasta);
  const rs = recibosDoProcesso(nr, pasta).filter((r) => /AC[ÓO]RD/.test(r.tipo || ""));
  return rs.sort((a, b) => (isoBr(b.data_julgamento) > isoBr(a.data_julgamento) ? 1 : -1))[0] || null;
}

/** Ficha para distinguishing, superação e leading case — 100% local (recibos), zero requisição ao portal. */
/** Rascunho da "ficha de precedente" (contrato do pesquisador-juridico), só com o que o texto do recibo permite ler. Campos que dependem de
 * leitura ou de decisão do advogado ficam vazios: `sustenta`, `trecho`, `chave`, `link` (o recibo não guarda os parâmetros do portal e link
 * nunca se fabrica), `relator_para_acordao`. `verificacao` sai "não conferido": quem confere é o pesquisador-juridico ou o advogado. */
function fichaDePrecedente({ r, t, ementa, tese, fonteSec, sessao, pasta, situacao = "" }) {
  const lit = (x, n) => String(x || "").replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, n);
  const ob = extrairOrgaoComOrigem(t);
  const disp = secoesDaEmenta(fonteSec, 0, Math.min(fonteSec.length, 15000)).find((x) => x.nome === "dispositivo e tese" || x.nome === "dispositivo");
  const outras = recibosDoProcesso(r.nr_processo || "", pasta).filter((x) => String(x.id_documento) !== String(r.id_documento))
    .map((x) => ({ id_documento: String(x.id_documento), tipo: x.tipo, julgamento: isoBr(x.data_julgamento) || null }));
  const ficha = {
    chave: "", numero: cnj(r.nr_processo || ""), tribunal: "TJRO", orgao: (ob && ob.orgao) || "", relator: extrairRelatorDoTexto(t) || "",
    relator_para_acordao: "", julgamento: isoBr(sessao) || isoBr(r.data_julgamento) || "", id_documento: String(r.id_documento), link: "",
    outras_decisoes_no_mesmo_numero: outras, situacao_local: situacao, dispositivo: disp ? lit(fonteSec.slice(disp.a, disp.b), 900) : "", tese: tese ? tese.texto : "",
    ementa: lit(ementa ? ementa.texto : r.tipo === "EMENTA" ? t : "", 3000), trecho: "", sustenta: "", verificado_em: new Date().toISOString().slice(0, 10),
    verificacao: "não conferido",
    _ferramenta: { natureza: naturezaDoJulgado(r, t).replace(/^🏛️ NATUREZA: /, "").slice(0, 160), observacao: "Rascunho do distinguir_tjro: órgão e relator lidos do texto do recibo; confira no inteiro teor (relator para o acórdão, votação, link) antes de usar." },
  };
  return ["# Rascunho de ficha de precedente (contrato do pesquisador-juridico)",
    "_Campos vazios dependem de leitura ou de decisão sua. `verificacao` sai \"não conferido\": só vira \"inteiro teor lido\" depois que alguém lê. Para depositar no segundo-cerebro, só com a sua confirmação._", "", "```json", JSON.stringify(ficha, null, 2), "```"].join("\n");
}

export function distinguir({ id_documento = "", nr_processo = "", fatos_do_caso = "", pasta, formato = "completo" } = {}) {
  if (!["completo", "resumo", "ficha"].includes(formato)) return `formato=${JSON.stringify(formato)} não existe. Use "completo" (padrão), "resumo" (só as 5 linhas e os ids) ou "ficha" (rascunho JSON).`;
  DISCO = !pasta;
  const r = escolherRecibo(String(id_documento || "").trim(), nr_processo, pasta);
  if (!r) return `Sem recibo local de ${id_documento ? `id ${id_documento}` : cnj(nr_processo || "") || "?"}. Leia o julgado antes com obter_inteiro_teor_tjro (grava o recibo) e repita; esta ferramenta não consulta o portal.`;
  const t = r.texto, L = [], P = (x) => L.push(x);
  const sessao = dataDoFecho(t);
  P(`# Distinguir, superação e leading case: ${cnj(r.nr_processo || "")} · ${r.tipo} · id ${r.id_documento} · ${r.data_julgamento || "sem data"}${sessao && sessao !== r.data_julgamento ? ` (sessão ${sessao})` : ""}`);
  P("_Tudo abaixo é texto LITERAL do julgado ou sinal lexical com acerto medido; a ferramenta não decide se distingue, se foi superado nem qual é o leading case. Confira no inteiro teor antes de citar._\n");
  P(naturezaDoJulgado(r, t));
  // 1. ratio: o que o próprio julgado declara como tese e razões
  P("\n## 1. Razão de decidir: o que o julgado declara (candidatos literais)");
  const doProc = recibosDoProcesso(r.nr_processo || "", pasta).filter((x) => x.data_julgamento === r.data_julgamento);
  const ementa = doProc.find((x) => x.tipo === "EMENTA");
  // precedente qualificado: a tese é o que vincula, vem inteira (teto 15000); nos demais, o corte de sempre
  const tetoTese = /resolucao de demandas repetitivas|\birdr\b|assuncao de competencia/.test(fold(r.classe || "")) ? 15000 : undefined;
  let tese = teseDaEmenta(r.tipo === "EMENTA" ? t : (ementa || {}).texto || "", tetoTese) || teseDaEmenta(t, tetoTese);
  // Verificação de 15/10/2026 (chamada real no IRDR 15): com o teto alto, a "tese" levava junto a causa piloto inteira (14 mil caracteres).
  // A tese termina onde começam os dispositivos citados, a jurisprudência citada ou a causa piloto.
  if (tese && tetoTese) {
    const k = tese.texto.search(/\s(?:Dispositivos relevantes citados|Jurisprud[êe]ncia relevante citada|CAUSA PILOTO)\b/);
    if (k > 0) tese = { ...tese, texto: tese.texto.slice(0, k).trim(), completa: true };
  }
  if (tese) P(`- **Tese da ementa** (literal${tese.completa ? "" : ", cortada"}): «${tese.texto}»`);
  const fonteSec = ementa ? ementa.texto : t;
  const razoes = secoesDaEmenta(fonteSec, 0, Math.min(fonteSec.length, 12000)).find((x) => x.nome === "razoes de decidir");
  if (razoes) P(`- **Razões de decidir** (seção III da ementa, literal): «${fonteSec.slice(razoes.a, razoes.b).replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, 900)}»`);
  const res = rotulo(r);
  // v1.41.0: a ficha sai depois do semáforo, para levar `situacao_local` (o lint da peticao-rg barra 🔴)
  if (res) P(`- **Resultado declarado:** ${res}.`);
  if (!tese && !razoes) P("- Sem tese nem seção \"razões de decidir\" no modelo do CNJ: a ratio tem de ser extraída do voto pela leitura (fundamento sem o qual o resultado mudaria, art. 489, § 1º, V).");
  P("- Fundamento que só reforça (\"ainda que assim não fosse\") é obiter, não ratio: `verificar_citacao_tjro` marca OBITER DICTUM? na frase.");
  // 2. fatos
  P("\n## 2. Fatos do precedente (literal)");
  const fatos = fatosDoJulgado(t, r.tipo) || (ementa ? fatosDoJulgado(ementa.texto, "EMENTA") : null);
  P(fatos ? `- (${fatos.onde}) «${fatos.texto.replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, 1200)}»` : "- Sem seção de fatos reconhecível; leia o relatório no inteiro teor.");
  if (fatos && /relat/.test(fatos.onde)) P("  ⚠️ É o relatório: narra pedido e alegações, não fato reconhecido pelo julgado.");
  // 3. comparação
  let cmp = null;
  if (String(fatos_do_caso || "").trim()) {
    const c = (cmp = compararFatos(fatos_do_caso, t, r.tipo));
    P("\n## 3. Seus fatos × o precedente");
    P("_Expressões dos seus fatos (duas palavras vizinhas) e a frase do precedente que as traz, do voto quando há; palavra solta só se longa e no voto. Acerto medido às cegas: expressões 53 de 53 trataram do mesmo fato; palavras soltas, 61 de 75. Ausência de palavra NÃO prova fato diferente: o julgado pode dizer o mesmo com outras palavras. A distinção exige comparar FATOS MATERIAIS e FUNDAMENTOS DETERMINANTES (art. 489, § 1º, VI), e isso é leitura sua._");
    for (const p of [...c.expressoes, ...c.presentes]) P(`- **${p.termo}** (${p.onde}) — «${p.frase}»`);
    if (!c.expressoes.length && !c.presentes.length) P("- Nenhuma expressão dos seus fatos aparece no precedente.");
    if (c.ausentes.length) P(`- **Seus termos que o precedente NÃO menciona:** ${c.ausentes.join(", ")}. Se algum é fato material, é o primeiro candidato a distinguishing (nos casos de teste, o fato que mudava a solução apareceu aqui em 10 de 10; a lista também traz palavras sem importância).`);
  }
  // 4. frases do próprio julgado
  const fr = frasesDePrecedente(t, r.tipo);
  const rot = { distincao: "distingue outro precedente", aplicacao: "aplica precedente qualificado", mudanca: "declara mudança de entendimento", ressalva: "ressalva pessoal do julgador (segue a maioria, pensa diferente)" };
  const tem = Object.values(fr).some((v) => v.length);
  P("\n## 4. O que o próprio julgado diz sobre precedentes (frases candidatas)");
  if (!tem) P("- Nenhuma frase candidata.");
  for (const k of ["aplicacao", "distincao", "mudanca", "ressalva"])
    for (const f of fr[k]) P(`- ${rot[k]} (acerto medido ${ACERTO_FRASES[k]}): «${f}»`);
  // 5. superação depois dele
  P("\n## 5. Superação (overruling): sinais em julgados POSTERIORES nos recibos locais");
  const iso = isoBr(r.data_julgamento), meu = cnj(r.nr_processo || ""), meusDig = soDigitos(r.nr_processo);
  const todos = listarRecibos(pasta).filter((x) => /AC[ÓO]RD|EMENTA/.test(x.tipo || "") && soDigitos(x.nr_processo) !== meusDig);
  const depois = todos.filter((x) => iso && isoBr(x.data_julgamento) > iso);
  const citam = depois.filter((x) => citX(x).includes(meu));
  const meusAnc = ancoras(t);
  const A = conj(t), meuRes = res;
  const similares = depois.map((x) => ({ x, s: jaccard(A, conjX(x)) })).filter((o) => o.s >= LIMIAR_TEMA).sort((a, b) => b.s - a.s).slice(0, 40);
  const linha = (x, extra = "") => `id ${x.id_documento} · ${cnj(x.nr_processo || "")} · ${x.data_julgamento || "?"} · ${x.orgao_indice || ""} · ${rotulo(x) || "sem rótulo"}${extra}`;
  let algum = false;
  if (citam.length) {
    algum = true;
    P(`- **Julgados posteriores que CITAM este processo** (${citam.length}):`);
    for (const x of citam.slice(0, 8)) {
      const f = frasesX(x);
      const sinal = f.mudanca[0] ? ` · mudança? «${f.mudanca[0]}»` : f.distincao[0] ? ` · distinção? «${f.distincao[0]}»` : "";
      P(`  - ${linha(x)}${sinal}`);
    }
  }
  const mudam = similares.filter((o) => frasesX(o.x).mudanca.length);
  if (mudam.length) {
    algum = true;
    P("- **Posteriores do mesmo tema com frase de MUDANÇA DE ENTENDIMENTO** (acerto medido 1 de 9 em amostra nova: quase sempre falso, leia):");
    for (const o of mudam.slice(0, 5)) P(`  - ${linha(o.x)} · «${frasesX(o.x).mudanca[0]}»`);
  }
  let opostosN = 0, opostos = [], mesmaPalavra = [];
  if (meuRes) {
    const contra = similares.filter((o) => o.s >= LIMIAR_MESMA_QUESTAO).filter((o) => { const rx = rotulo(o.x); return rx && OPOSTOS.some(([a, b]) => (a === meuRes && b === rx) || (b === meuRes && a === rx)); });
    opostos = contra.filter((o) => o.s >= LIMIAR_RESULTADO_OPOSTO);
    mesmaPalavra = contra.filter((o) => o.s < LIMIAR_RESULTADO_OPOSTO);
    opostosN = opostos.length;
    if (opostos.length) {
      algum = true;
      P(`- **Posteriores do MESMO TEMA com RESULTADO OPOSTO** (${opostos.length}; núcleo da ementa com semelhança ≥ ${LIMIAR_RESULTADO_OPOSTO.toFixed(2).replace(".", ",")}, de 0 a 1. Em regra a diferença vem de FATOS diferentes, não de mudança de entendimento: leia como material de distinguishing; overruling é a exceção):`);
      for (const o of opostos.slice(0, TETO_IDS_OPOSTOS)) P(`  - ${linha(o.x, ` · semelhança ${o.s.toFixed(2)}`)}`);
      if (opostos.length > TETO_IDS_OPOSTOS) P(`  - mais ${opostos.length - TETO_IDS_OPOSTOS} fora desta lista (os de maior semelhança vêm primeiro).`);
    }
    if (mesmaPalavra.length) {
      algum = true;
      P(`- **Resultado oposto com a MESMA PALAVRA, não necessariamente o mesmo tema** (${mesmaPalavra.length}; semelhança entre ${LIMIAR_MESMA_QUESTAO.toFixed(2).replace(".", ",")} e ${LIMIAR_RESULTADO_OPOSTO.toFixed(2).replace(".", ",")}: vocabulário parecido, o assunto pode ser outro — em 3 de 10 pares lidos era outra matéria. Não entra no semáforo):`);
      for (const o of mesmaPalavra.slice(0, 5)) P(`  - ${linha(o.x, ` · semelhança ${o.s.toFixed(2)}`)}`);
    }
  }
  if (!algum) P("- Nenhum sinal nos recibos locais. Isso NÃO prova que não foi superado: os recibos são só o que esta máquina já leu.");
  if (meusAnc.length) P(`- Precedentes qualificados que ele aplica (${meusAnc.join(", ")}): situação, revisão e cancelamento se conferem no BNP (\`buscar_precedentes_qualificados\` / \`verificar_precedente_bnp\`), nunca aqui.`);
  P("- Para ampliar além dos recibos: `julgados_que_citam_tjro` (quem cita este processo no portal) e `linha_do_tempo_tjro` (resultado por ano da tese).");
  P("- Superação só se afirma com o julgado que supera aberto: mesmo órgão ou superior, fundamentação específica (art. 927, § 4º), modulação (§ 3º). Resultado oposto pode ser distinção, não overruling (medido às cegas: julgado que cita o anterior e tem resultado oposto era mudança de entendimento em 3 de 66 casos; em 59 era fato diferente). Overruling de verdade se confirma pela situação do precedente no BNP e pelo julgado que o supera, aberto.");
  // 5-A. o mesmo processo depois deste julgamento (v1.40.0): o sinal mais forte de "não cite este" nos recibos
  const cad = cadeiaDoProcesso(r, pasta);
  for (const x of blocoCadeia(cad)) P(x);
  // 6. leading case
  P("\n## 6. Leading case do tema (recibos locais)");
  const tema = [r, ...similares.map((o) => o.x), ...todos.filter((x) => !depois.includes(x)).map((x) => ({ x, s: jaccard(A, conjX(x)) })).filter((o) => o.s >= LIMIAR_TEMA).sort((a, b) => b.s - a.s).slice(0, 40).map((o) => o.x)];
  const lc = leadingCase(tema);
  if (lc.qualificados.length) for (const q of lc.qualificados) P(`- **Precedente qualificado do TJRO no tema** (IRDR/IAC com tese): ${q.nr} · id ${q.id} · ${q.data}. É o leading case da tese que fixou.`);
  if (lc.ancoras.length) P(`- Precedentes qualificados mais invocados no tema: ${lc.ancoras.map(([a, q]) => `${a} (${q})`).join(", ")}. O leading case de cada um (processo paradigma) se confere no BNP.`);
  if (lc.maisCitados.length) P(`- Julgados mais citados pelos demais do tema (processos distintos que citam): ${lc.maisCitados.map(([c, q]) => `${c} (${q})`).join(", ")}. Mais citado é candidato, não prova: pode só aplicar a tese de outro.`);
  if (!lc.qualificados.length && !lc.ancoras.length && !lc.maisCitados.length) P("- Sem candidato nos recibos locais.");
  // Camada 1 (resumo progressivo, Forte): 5 linhas no topo, cada uma literal ou contagem; o detalhe fica nas seções
  const cur = (x, n) => { const y = String(x || "").replace(/[ \t\n\r\f\v]+/g, " ").trim(); if (y.length <= n) return y; const k = y.lastIndexOf(" ", n); return y.slice(0, k > 40 ? k : n) + "…"; };
  const RES = ["**Resumo (camada 1)** — cada linha é trecho literal ou contagem; o detalhe está nas seções abaixo:"];
  RES.push(`- Tese: ${tese ? `«${cur(tese.texto, 220)}»` : razoes ? `«${cur(fonteSec.slice(razoes.a, razoes.b), 220)}» (razões de decidir; a ementa não traz tese)` : "sem tese nem razões no modelo do CNJ (seção 1)"}`);
  RES.push(`- Fatos do julgado: ${fatos ? `«${cur(fatos.texto, 200)}»` : "sem seção reconhecível (seção 2)"}`);
  if (cmp) RES.push(`- Seus fatos: ${cmp.expressoes.length} expressão(ões) deles aparece(m) no precedente; ele NÃO menciona: ${cmp.ausentes.slice(0, 6).join(", ") || "nenhum termo seu"} (seção 3)`);
  RES.push(`- Superação: ${citam.length} julgado(s) posterior(es) citam este processo (${citam.filter((x) => frasesX(x).distincao.length).length} com frase de distinção); ${mudam.length} do mesmo tema com frase de mudança (quase sempre falsa); ${opostosN} do mesmo tema com resultado oposto (em regra, fato diferente)${mesmaPalavra.length ? `; ${mesmaPalavra.length} só com a mesma palavra (fora do semáforo)` : ""} (seção 5)`);
  const situacao = semaforo({ modificado: cad.modificado, conferir: cad.conferir, citamComSinal: citam.filter((x) => frasesX(x).distincao.length || frasesX(x).mudanca.length).length, opostos: opostosN, mudam: mudam.length });
  if (formato === "ficha") return fichaDePrecedente({ r, t, ementa, tese, fonteSec, sessao, pasta, situacao });
  RES.push(`- Situação (indício, sem verde): ${situacao} (seções 5 e 5-A)`);
  RES.push(`- Leading case: ${lc.qualificados[0] ? `${lc.qualificados[0].nr} · id ${lc.qualificados[0].id}` : "sem candidato nos recibos"} (seção 6)`);
  L.splice(3, 0, "", ...RES);
  // formato "resumo" (17/10/2026): camada 1 e os ids para abrir; ~420 tokens contra ~1.840 do completo (medido em 40 acórdãos)
  if (formato === "resumo") {
    const ids = [...citam.slice(0, 8), ...mudam.slice(0, 5).map((o) => o.x)].map((x) => `${x.id_documento} (${x.data_julgamento || "?"})`);
    const corte = Math.max(0, citam.length - 8) + Math.max(0, mudam.length - 5);
    const comS = (o) => `${o.x.id_documento} (${o.x.data_julgamento || "?"} · ${rotulo(o.x)} · semelhança ${o.s.toFixed(2)})`;
    const extra = [];
    if (opostos.length) extra.push(`- Mesmo tema, resultado oposto (${opostos.length}; semelhança de 0 a 1): ${opostos.slice(0, TETO_IDS_OPOSTOS).map(comS).join(", ")}${opostos.length > TETO_IDS_OPOSTOS ? ` e mais ${opostos.length - TETO_IDS_OPOSTOS} (formato "completo")` : ""}.`);
    if (mesmaPalavra.length) extra.push(`- Mesma palavra, resultado oposto, assunto pode ser outro (${mesmaPalavra.length}; fora do semáforo): ${mesmaPalavra.slice(0, 5).map(comS).join(", ")}${mesmaPalavra.length > 5 ? ` e mais ${mesmaPalavra.length - 5}` : ""}.`);
    return [...L.slice(0, 3 + 1 + RES.length), ...extra, `- Ids para abrir: ${ids.length ? ids.join(", ") : "nenhum julgado posterior nos recibos"}.${corte ? ` Mais ${corte} fora desta lista: peça o formato "completo".` : ""} Detalhe completo: mesma chamada com formato "completo"; rascunho de ficha: formato "ficha".`].join("\n");
  }
  P(`\n_Tema = este julgado + até 80 recibos com vocabulário parecido (semelhança do núcleo da ementa ≥ 0,2). Recibo é só o que esta máquina já leu, não o acervo do TJRO._`);
  gravarDeriv();
  return L.join("\n");
}

export { norm1, teseDaEmenta, fatosDoJulgado, resultadoComOrigem, rotuloDoConjunto, ROTULOS_RESULTADO, dataDoFecho };

// para o harness de validação (sem uso no servidor)
export const _harness = { nucleo, conj, jaccard, rotulo, OPOSTOS, RE_SUP };
export const _RE_SUP = RE_SUP;
