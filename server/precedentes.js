// v1.36.0 (pedido do autor, 15/10/2026): apoio a distinguishing, superação (overruling), natureza do julgado (precedente
// qualificado × jurisprudência persuasiva) e leading case. NADA aqui decide: a ferramenta devolve texto LITERAL do julgado e
// sinais lexicais medidos às cegas; quem decide se distingue, se foi superado e qual é o leading case é o advogado.
// Base normativa conferida no Planalto (15/10/2026): art. 927 (o que se observa), art. 947 §3º (IAC vincula salvo revisão),
// art. 985 (IRDR vale para todos os processos do tribunal, salvo revisão, art. 986), art. 489 §1º V e VI (fundamentos
// determinantes; distinção ou superação). Situação de precedente qualificado se confere no BNP do CNJ, não aqui.
import { norm1, faixasAlheias } from "./custodia.js";
import { teseDaEmenta, fatosDoJulgado, secoesDaEmenta } from "./posicao.js";
import { listarRecibos, reciboPorId, recibosDoProcesso, soDigitos } from "./recibos.js";
import { tokens } from "./similares.js";
import { fold, ancoras, frasesDoTexto, cnj, resultadoComOrigem, rotuloDoConjunto, ROTULOS_RESULTADO, dataDoFecho } from "./lib.js";
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
const RE_CNJ = /\b(\d{7})-?(\d{2})\.?(\d{4})\.?(?:8\.?22|822)\.?(\d{4})\b/g;
const RE_SUP = /\b(REsp|AREsp|AgInt no AREsp|AgInt no REsp|EREsp|RE|ARE|AgRg no AREsp|AgRg no REsp)\s*(?:n[º°.]*\s*)?(\d{1,3}(?:\.\d{3})+|\d{4,7})(?:\s*\/\s*([A-Z]{2}))?/g;
/** Processos citados no texto (TJRO pelo CNJ; STJ/STF pela classe e número), sem repetir. */
export function citacoesDoTexto(texto) {
  const t = String(texto || ""), out = new Set();
  for (const m of t.matchAll(RE_CNJ)) out.add(cnj(`${m[1]}${m[2]}${m[3]}822${m[4]}`));
  for (const m of t.matchAll(RE_SUP)) out.add(`${m[1]} ${m[2].replace(/\./g, "")}${m[3] ? "/" + m[3] : ""}`.replace(/\s+/g, " "));
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
    maisCitados: [...cont.entries()].filter(([, q]) => q >= 2).sort((a, b) => b[1] - a[1]).slice(0, max),
    ancoras: [...ancs.entries()].sort((a, b) => b[1] - a[1]).slice(0, max),
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
/** Para cada termo dos fatos do caso, a frase do precedente (voz do próprio julgado, fora de transcrição) em que aparece,
 * ou ausência. Ausência de palavra NÃO prova fato diferente: o julgado pode dizer o mesmo com outras palavras. */
export function compararFatos(fatos, texto, tipo = "ACÓRDÃO") {
  const t = String(texto || "");
  const fx = faixasAlheias(t, tipo);
  const fora = (i) => !fx.transcritas.some(([a, b]) => i >= a && i < b);
  const frases = [];
  // o cabeçalho (partes, advogados, gabinete) não é fato do julgado: começa no RELATÓRIO quando ele vem no início
  const rel = t.slice(0, 4000).search(/\bRELAT[ÓO]RIO\b/);
  let pos = rel > 0 ? rel : 0;
  for (const f of frasesDoTexto(t)) {
    const i = t.indexOf(f, pos);
    if (i >= 0) pos = i + f.length;
    if (i >= 0 && fora(i)) frases.push({ i, f, x: fold(f) });
  }
  const presentes = [], ausentes = [];
  for (const termo of termosDosFatos(fatos)) {
    const raiz = termo.length > 6 ? termo.slice(0, termo.length - 2) : termo;
    const re = new RegExp(`\\b${raiz}\\w*`);
    const fr = frases.find((x) => re.test(x.x));
    if (fr) presentes.push({ termo, frase: fr.f.replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, 300) });
    else ausentes.push(termo);
  }
  return { presentes, ausentes };
}


// ------------------------------------------------------------ frases candidatas ---
// Medidas às cegas (15/10/2026, 2 rotuladores Sonnet e Opus, amostra NOVA de 64 frases, concordância 61/64): distinção 18/29,
// aplicação de precedente qualificado 14/23, mudança de entendimento 3/9; ressalva pessoal 7/7 (1ª amostra). Nenhuma passa como
// RÓTULO: saem como FRASES CANDIDATAS, literais, com o acerto medido ao lado; quem lê decide.
export const ACERTO_FRASES = { distincao: "18 de 29", aplicacao: "14 de 23", mudanca: "3 de 9", ressalva: "7 de 7" };
const OBJ = "(?:tema|sumula|precedente|tese|irdr|iac|paradigma|julgado|acordao|entendimento firmado|orientacao firmada|jurisprudencia)";
const RE_MUDANCA = new RegExp("\\b(?:overruling|revisao (?:da|de) tese|superacao (?:do|da|de) (?:precedente|entendimento|tese|jurisprudencia|orientacao)|" +
  "(?:revejo|reviso|revisito|altero|modifico|readequo|realinho|reformulo|supero|mudo|retifico) (?:\\w+ ){0,2}(?:meu |o meu |o |este |esse |aquele )?(?:entendimento|posicionamento|orientacao|posicao)|" +
  "(?:passo|passei|passamos) a (?:entender|adotar|decidir|admitir|reconhecer|seguir|acompanhar)|" +
  "(?:este|esta|deste|desta|o|a) (?:tribunal|corte|camara|colegiado|turma) (?:\\w+ ){0,3}(?:alterou|modificou|reviu|revisou|superou|passou a|mudou|evoluiu)|" +
  "(?:evolucao|alteracao|mudanca|modificacao|revisao) (?:\\w+ ){0,2}(?:do|da) (?:entendimento|jurisprudencia|orientacao|posicionamento) (?:\\w+ ){0,2}(?:desta|deste|da|do) (?:corte|tribunal|camara|colegiado|turma))\\b");
const RE_NEGA = /\b(?:nao houve|inexist\w+|ausencia de|sem) (?:\w+ ){0,4}(?:alterac|modificac|mudanc|superac|revis|fundamentos? nov)|rediscut|tentativa|pretende|pretensao|insurg|almeja|alega|relat(?:a|ou)\b|narra|art\. 489|ratio decidendi|common law|doutrina|demandaria|reexame|vedad\w+|nao havia razoes|nao havendo|passo a (?:decidir|analisar|examinar|apreciar)/;
const RE_PARTE = /\b(?:argument\w*|defende\w*|afirm\w*|aduz\w*|sustent\w*|aleg\w*|pugn\w*|requer\w*|pretend\w*|insurg\w*)\b/;
const RE_RESSALVA = /\b(?:ressalvad\w+ (?:o )?(?:meu|minha) (?:entendimento|posicionamento|posicao|opiniao|conviccao)|ressalva (?:de|do) (?:meu )?entendimento(?: pessoal)?|ressalvando (?:o )?meu (?:entendimento|posicionamento)|ressalvo (?:o )?meu (?:entendimento|posicionamento)|curvo-me|curvando-me|me curvo)\b/;
const RE_APLICA = /\b(?:tese (?:juridica )?(?:fixada|firmada)|em (?:observancia|atencao|cumprimento|obediencia) (?:a|ao) (?:tese|tema|irdr|iac|sumula|precedente)|aplicacao (?:da tese|do tema|do irdr|do iac|do precedente)|(?:conforme|consoante|nos termos d\w) (?:o |a )?(?:tema|irdr|iac) (?:n\w* )?\d)/;
const RE_DISTINCAO = /\b(?:distinguishing|distincao|distinguir|distingue|inaplic\w+|nao se (?:aplica|amolda|ajusta|enquadra|subsume)|afast\w+ (?:a )?(?:aplicacao|incidencia)|(?:hipotese|situacao|caso) (?:fatica |concreto )?(?:diversa|distinta|diverso|distinto)|peculiar\w*|diferentemente)\b/;
const RE_OBJ = new RegExp(`\\b${OBJ}\\b`);
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
    else if (RE_DISTINCAO.test(x) && RE_OBJ.test(x) && !RE_PARTE.test(x) && !/condic\w+ economic|quantum|doutrina/.test(x)) out.distincao.push(lit);
    else if (RE_APLICA.test(x) && !RE_PARTE.test(x)) out.aplicacao.push(lit);
  }
  for (const k of Object.keys(out)) out[k] = out[k].slice(0, max);
  return out;
}

// ----------------------------------------------------------------------- ficha ---
const isoBr = (br) => (/^\d{2}\/\d{2}\/\d{4}$/.test(br || "") ? br.split("/").reverse().join("-") : "");
// Núcleo do julgado para medir "mesmo tema": tese + razões de decidir + caso em exame da ementa do CNJ; sem o modelo, o começo
// do voto. O texto inteiro de acórdãos bancários se parece todo (partes, fórmulas) e misturava teses diferentes.
function nucleo(t) {
  const x = String(t || "");
  const sec = secoesDaEmenta(x, 0, Math.min(x.length, 15000)).filter((s) => ["caso em exame", "razoes de decidir", "dispositivo e tese", "dispositivo"].includes(s.nome));
  if (sec.length) return sec.map((s) => x.slice(s.a, s.b)).join(" ");
  const v = x.search(/\bVOTO\b/);
  return x.slice(v > 0 ? v : 0, (v > 0 ? v : 0) + 3000);
}
const conj = (t) => new Set(tokens(nucleo(t)));
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); };
const rotulo = (r) => { const ro = resultadoComOrigem(r.texto, r.tipo); const k = rotuloDoConjunto(ro.conjunto, r.classe, ro.embargos); return k ? ROTULOS_RESULTADO[k] : ""; };
// medido às cegas (15/10/2026, 40 pares, Sonnet e Opus, concordância 37/40): núcleo ≥ 0,25 → mesma questão jurídica 9/9;
// 0,20–0,24 → 19/28 (o resto, assunto vizinho). Resultado oposto, que pesa na superação, só a partir de 0,25.
export const LIMIAR_TEMA = 0.2, LIMIAR_MESMA_QUESTAO = 0.25;
const OPOSTOS = [["provido", "desprovido"], ["parcialmente provido", "desprovido"], ["acolhido", "rejeitado"]];

function escolherRecibo(id, nr, pasta) {
  if (id) return reciboPorId(id, pasta);
  const rs = recibosDoProcesso(nr, pasta).filter((r) => /AC[ÓO]RD/.test(r.tipo || ""));
  return rs.sort((a, b) => (isoBr(b.data_julgamento) > isoBr(a.data_julgamento) ? 1 : -1))[0] || null;
}

/** Ficha para distinguishing, superação e leading case — 100% local (recibos), zero requisição ao portal. */
export function distinguir({ id_documento = "", nr_processo = "", fatos_do_caso = "", pasta } = {}) {
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
  const tese = teseDaEmenta(r.tipo === "EMENTA" ? t : (ementa || {}).texto || "") || teseDaEmenta(t);
  if (tese) P(`- **Tese da ementa** (literal${tese.completa ? "" : ", cortada"}): «${tese.texto}»`);
  const fonteSec = ementa ? ementa.texto : t;
  const razoes = secoesDaEmenta(fonteSec, 0, Math.min(fonteSec.length, 12000)).find((x) => x.nome === "razoes de decidir");
  if (razoes) P(`- **Razões de decidir** (seção III da ementa, literal): «${fonteSec.slice(razoes.a, razoes.b).replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, 900)}»`);
  const res = rotulo(r);
  if (res) P(`- **Resultado declarado:** ${res}.`);
  if (!tese && !razoes) P("- Sem tese nem seção \"razões de decidir\" no modelo do CNJ: a ratio tem de ser extraída do voto pela leitura (fundamento sem o qual o resultado mudaria, art. 489, § 1º, V).");
  P("- Fundamento que só reforça (\"ainda que assim não fosse\") é obiter, não ratio: `verificar_citacao_tjro` marca OBITER DICTUM? na frase.");
  // 2. fatos
  P("\n## 2. Fatos do precedente (literal)");
  const fatos = fatosDoJulgado(t, r.tipo) || (ementa ? fatosDoJulgado(ementa.texto, "EMENTA") : null);
  P(fatos ? `- (${fatos.onde}) «${fatos.texto.replace(/[ \t\n\r\f\v]+/g, " ").trim().slice(0, 1200)}»` : "- Sem seção de fatos reconhecível; leia o relatório no inteiro teor.");
  if (fatos && /relat/.test(fatos.onde)) P("  ⚠️ É o relatório: narra pedido e alegações, não fato reconhecido pelo julgado.");
  // 3. comparação
  if (String(fatos_do_caso || "").trim()) {
    const c = compararFatos(fatos_do_caso, t, r.tipo);
    P("\n## 3. Seus fatos × o precedente");
    P("_Para cada termo dos fatos que você deu, a primeira frase do precedente (voz do julgado) que o menciona. Ausência de palavra NÃO prova fato diferente: o julgado pode dizer o mesmo com outras palavras. A distinção exige comparar FATOS MATERIAIS e FUNDAMENTOS DETERMINANTES (art. 489, § 1º, VI), e isso é leitura sua._");
    for (const p of c.presentes) P(`- **${p.termo}** — «${p.frase}»`);
    if (c.ausentes.length) P(`- Não mencionados no texto do precedente: ${c.ausentes.join(", ")}.`);
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
  const citam = depois.filter((x) => citacoesDoTexto(x.texto).includes(meu));
  const meusAnc = ancoras(t);
  const A = conj(t), meuRes = res;
  const similares = depois.map((x) => ({ x, s: jaccard(A, conj(x.texto)) })).filter((o) => o.s >= LIMIAR_TEMA).sort((a, b) => b.s - a.s).slice(0, 40);
  const linha = (x, extra = "") => `id ${x.id_documento} · ${cnj(x.nr_processo || "")} · ${x.data_julgamento || "?"} · ${x.orgao_indice || ""} · ${rotulo(x) || "sem rótulo"}${extra}`;
  let algum = false;
  if (citam.length) {
    algum = true;
    P(`- **Julgados posteriores que CITAM este processo** (${citam.length}):`);
    for (const x of citam.slice(0, 8)) {
      const f = frasesDePrecedente(x.texto, x.tipo, 1);
      const sinal = f.mudanca[0] ? ` · mudança? «${f.mudanca[0]}»` : f.distincao[0] ? ` · distinção? «${f.distincao[0]}»` : "";
      P(`  - ${linha(x)}${sinal}`);
    }
  }
  const mudam = similares.filter((o) => frasesDePrecedente(o.x.texto, o.x.tipo, 1).mudanca.length || (meusAnc.length && frasesDePrecedente(o.x.texto, o.x.tipo, 1).mudanca.length));
  if (mudam.length) {
    algum = true;
    P("- **Posteriores do mesmo tema com frase de MUDANÇA DE ENTENDIMENTO** (acerto medido 3 de 9: leia):");
    for (const o of mudam.slice(0, 5)) P(`  - ${linha(o.x)} · «${frasesDePrecedente(o.x.texto, o.x.tipo, 1).mudanca[0]}»`);
  }
  if (meuRes) {
    const opostos = similares.filter((o) => o.s >= LIMIAR_MESMA_QUESTAO).filter((o) => { const rx = rotulo(o.x); return rx && OPOSTOS.some(([a, b]) => (a === meuRes && b === rx) || (b === meuRes && a === rx)); });
    if (opostos.length) {
      algum = true;
      P(`- **Posteriores do mesmo tema com RESULTADO OPOSTO** (${opostos.length}; núcleo da ementa com semelhança ≥ 0,25, mesma questão jurídica em 9 de 9 pares medidos; resultado oposto pode ser fato diferente, não superação):`);
      for (const o of opostos.slice(0, 5)) P(`  - ${linha(o.x, ` · semelhança ${o.s.toFixed(2)}`)}`);
    }
  }
  if (!algum) P("- Nenhum sinal nos recibos locais. Isso NÃO prova que não foi superado: os recibos são só o que esta máquina já leu.");
  if (meusAnc.length) P(`- Precedentes qualificados que ele aplica (${meusAnc.join(", ")}): situação, revisão e cancelamento se conferem no BNP (\`buscar_precedentes_qualificados\` / \`verificar_precedente_bnp\`), nunca aqui.`);
  P("- Para ampliar além dos recibos: `julgados_que_citam_tjro` (quem cita este processo no portal) e `linha_do_tempo_tjro` (resultado por ano da tese).");
  P("- Superação só se afirma com o julgado que supera aberto: mesmo órgão ou superior, fundamentação específica (art. 927, § 4º), modulação (§ 3º). Resultado oposto pode ser distinção, não overruling.");
  // 6. leading case
  P("\n## 6. Leading case do tema (recibos locais)");
  const tema = [r, ...similares.map((o) => o.x), ...todos.filter((x) => !depois.includes(x)).map((x) => ({ x, s: jaccard(A, conj(x.texto)) })).filter((o) => o.s >= LIMIAR_TEMA).sort((a, b) => b.s - a.s).slice(0, 40).map((o) => o.x)];
  const lc = leadingCase(tema);
  if (lc.qualificados.length) for (const q of lc.qualificados) P(`- **Precedente qualificado do TJRO no tema** (IRDR/IAC com tese): ${q.nr} · id ${q.id} · ${q.data}. É o leading case da tese que fixou.`);
  if (lc.ancoras.length) P(`- Precedentes qualificados mais invocados no tema: ${lc.ancoras.map(([a, q]) => `${a} (${q})`).join(", ")}. O leading case de cada um (processo paradigma) se confere no BNP.`);
  if (lc.maisCitados.length) P(`- Julgados mais citados pelos demais do tema (processos distintos que citam): ${lc.maisCitados.map(([c, q]) => `${c} (${q})`).join(", ")}. Mais citado é candidato, não prova: pode só aplicar a tese de outro.`);
  if (!lc.qualificados.length && !lc.ancoras.length && !lc.maisCitados.length) P("- Sem candidato nos recibos locais.");
  P(`\n_Tema = este julgado + até 80 recibos com vocabulário parecido (semelhança do núcleo da ementa ≥ 0,2). Recibo é só o que esta máquina já leu, não o acervo do TJRO._`);
  return L.join("\n");
}

export { norm1, teseDaEmenta, fatosDoJulgado, resultadoComOrigem, rotuloDoConjunto, ROTULOS_RESULTADO, dataDoFecho };
