// verificar_citacao_tjro (v1.10.0): a frase que vai entre aspas está LITERALMENTE no documento,
// e é palavra do TJRO? Mesmo contrato dos MCPs do TRF1, TRT14, TCE-RO, TJSE e OAB: comparação
// por palavra inteira, tolerante a caixa, acento e pontuação; mínimo de 4 palavras; `[...]`
// separa fragmentos que devem aparecer em ordem, a no máximo 1.500 caracteres um do outro.
// Lê primeiro o RECIBO local (zero requisição); sem recibo, o chamador busca o inteiro teor.
// A atribuição vem de custodia.js — a mesma conta que vai para o recibo e para o lint: o
// agente descobre ANTES de escrever a ficha que a frase era ementa do STJ copiada no voto,
// ou o voto vencido, em vez de descobrir no build da peça.
import { norm1, expandirLigaduras, faixasAlheias, RE_VOZ_PROPRIA, trechosCitados, coberturaCitada, RE_TESE_PROPRIA, ASPAS_SPAN_MAX } from "./custodia.js";
export { trechosCitados, coberturaCitada, ASPAS_SPAN_MAX };
import { recibo, cnj, dirRecibos } from "./lib.js";
import { reciboPorId, recibosDoProcesso, soDigitos } from "./recibos.js";
import { posicaoNoJulgado, ehRelatoDaEmenta } from "./posicao.js";
import { RE_OBITER } from "./custodia.js";
// ALEGAÇÃO DA PARTE e DOUTRINA/SENTENÇA TRANSCRITA moraram aqui até a 1.41.9; agora em voz.js (sem mudança de lógica), para o
// recibo e o lint lerem a mesma conta. Reexportados para quem já importava daqui.
import { inicioDaFrase, alegacaoDaParte, concessivaNegativa, sentencaAnunciadaAntes, faixasIntroduzidas, INTRODUZIDA_MAX, INTRODUZIDA_MIN, ALEGACAO_DIST_MAX, ALEGACAO_SUJEITO_JANELA, ALEGACAO_CABECA } from "./voz.js";
export { alegacaoDaParte, faixasIntroduzidas, INTRODUZIDA_MAX, INTRODUZIDA_MIN, ALEGACAO_DIST_MAX, ALEGACAO_SUJEITO_JANELA, ALEGACAO_CABECA };
export { posicaoNoJulgado };

export const PISO_TRECHO_PALAVRAS = 4, PISO_TRECHO_CHARS = 25, VAO_MAXIMO = 1500;
const W = "a-z0-9";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE_CORTE = /\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\)|…/;


// NEGAÇÃO (v1.12.0, remedida em gabarito cego e duplo: a regra herdada disparava com "inexistente", "negativo", "vedada"
// ou "improcedente" em qualquer ponto dos 60 caracteres anteriores, e com negação que só alcançava a 1ª palavra do
// trecho; precisão de 35%). Agora conta o ALCANCE: um operador de negação ou rejeição (não, jamais, nem, "não há que se
// falar", afasta-se, rejeito, julgou improcedente…; adjetivo solto não conta) a até 80 caracteres do trecho, sem quebra
// de oração entre ele e o trecho, e alcançando ao menos 3 palavras do trecho antes da 1ª quebra de oração dentro dele.
const RE_NEG_OPERADOR = /(?<![a-z0-9])(?:nao|jamais|nunca|nem|descabe|descabid[oa]s?|incabive(?:l|is)|afasta-se|afasto|afastad[oa]s?|rejeita-se|rejeito|rejeitad[oa]s?|nego|negou|negar|nega-se|negam|improcede|julg(?:ou|o|ar|aram|ada|ado|ados|adas)\s+improcedentes?|inexist(?:e|em|ir|iu|indo)|carece|carecem|impossibilidade de|sem razao|sem razoes)(?![a-z0-9])/g;
// v1.14.0: "não havendo/há/resta dúvida de que…" afirma, não nega (achado no porte ao STJ/TRT14)
const RE_NEG_FALSA = /^\s*(?:obstante|so\b|apenas|somente|se\s+confunde|fosse\b|(?:havendo|ha|houve|resta|restam|restando|pairam?)\s+(?:qualquer\s+|mais\s+)?duvidas?|(?:e|era|foi|sao|seria)\s+(?:outr[oa]s?|diferente|divers[oa]s?)\b|se\s+(?:desconhece|ignora|olvida|nega|discute|questiona)\b|(?:se\s+)?pode\s+(?:deixar|olvidar|ignorar|negar)\b|deixa\s+de\b|ha\s+como\s+negar|ha\s+negar)/;
// gabarito cego de 06/10/2026 (validação em 120 trechos novos: falso alarme 42% → 31%, cobertura 100% → 98%): negação a mais de 6
// palavras já fechou a própria oração; "não utilizado pelo…" nega o particípio; "…, e não sobre…" recusa uma alternativa
const NEGACAO_DIST_MAX = 6;
const RE_NEG_PARTICIPIO = /^\s*(?:\w+mente\s+)?[a-z]+(?:ad|id)[oa]s?\b/;
const RE_NEG_AUX = /^\s*(?:tenha|tem|ha|havia|foi|for|seja|sido|esta|estava)\b/;
const RE_NEG_PREP = /^\s*(?:sobre|pel[oa]s?|para|por|com|contra|ante|perante|apenas|so|somente|mais|menos)\b/;
const RE_QUEBRA_ORACAO = /[.;:]|,\s*(?:mas|e|ou|que|o que|de forma|de modo|sendo|alem|conforme|porque|pois|porquanto|embora|ainda|razao pela|motivo pelo|[a-z]+ndo)(?![a-z0-9])|\smas\s/;
export const NEGACAO_JANELA = 80, NEGACAO_ALCANCE_MIN = 3;

/** O trecho que começa em `ini0` (texto norm1) e termina em `fim` está sob o alcance de uma negação anterior? */
export function negacaoAntes(tn, ini0, fim, bruto = null) {
  const jan = tn.slice(Math.max(0, ini0 - NEGACAO_JANELA), ini0);
  let op = null;
  for (const m of jan.matchAll(RE_NEG_OPERADOR)) {
    if (m[0] === "nao" && RE_NEG_FALSA.test(jan.slice(m.index + 3))) continue;
    op = m;
  }
  if (!op) return false;
  const ponte = jan.slice(op.index + op[0].length);
  if (/[.;:]/.test(ponte)) return false;
  if (ponte.includes(",") && ponte.trim().length > 15) return false;     // ", portanto, a" passa; oração nova não
  if ((ponte.match(/[^ \t\n\r\f\v]+/g) || []).length > NEGACAO_DIST_MAX) return false;
  if (op[0] === "nao" && (RE_NEG_PREP.test(ponte) || (RE_NEG_PARTICIPIO.test(ponte) && !RE_NEG_AUX.test(ponte)))) return false;
  const tr = tn.slice(ini0, fim);
  // trecho que começa pela conjunção "e" é oração nova; "é" (verbo) não — olha o caractere ORIGINAL, porque o norm1 dobra os dois
  // para "e" ("NÃO é devido" citado como "é devido…" passava sem alerta; achado no porte para o TRT14, 05/10/2026)
  if (/^\s*[eE][\s,]/.test(bruto !== null ? bruto.slice(ini0, fim) : tr)) return false;
  const q = tr.search(RE_QUEBRA_ORACAO);
  const alcance = (q < 0 ? tr : tr.slice(0, q)).trim().split(/\s+/).filter(Boolean).length;
  return alcance >= NEGACAO_ALCANCE_MIN;
}

// NEGAÇÃO forte × distante (07/10/2026, gabarito cego e duplo neg-val2: 120 trechos novos, ponderado): negação colada ao trecho (até 1
// palavra antes) ou existencial ("não há/houve/existe …", até 5) — precisão 80%, falso alarme 6%; o resto da regra larga vira
// "NEGAÇÃO (distante)?" para não perder cobertura
const RE_NEG_EXISTENCIAL = /^[ \t\n\r\f\v]*(?:ha|houve|havia|existe|existem|existia)(?![a-z0-9])/;
/** _negacao_proxima */
export function negacaoProxima(tn, ini0) {
  const jan = tn.slice(Math.max(0, ini0 - NEGACAO_JANELA), ini0);
  let op = null;
  for (const m of jan.matchAll(RE_NEG_OPERADOR)) {
    if (m[0] === "nao" && RE_NEG_FALSA.test(jan.slice(m.index + 3))) continue;
    op = m;
  }
  if (op === null) return false;
  const ponte = jan.slice(op.index + op[0].length);
  const n = (ponte.match(/[^ \t\n\r\f\v]+/g) || []).length;
  return n <= 1 || (n <= 5 && RE_NEG_EXISTENCIAL.test(ponte));
}


// OBITER DICTUM? (v1.15.0): marca de raciocínio hipotético ou fundamento alternativo na MESMA frase do trecho, antes dele
// ou na cabeça dele ("Ainda que se admitisse X, …", "De todo modo, Y"). Devolve a marca, ou null.
export const OBITER_JANELA = 400, OBITER_CABECA = 0.4;
export function obiterAntes(tn, ini0, fim, bruto, sentenca = false) {
  const r = obiterAntesComPos(tn, ini0, fim, bruto, sentenca);
  return r ? r.marca : null;
}
// v1.33.0: além da marca, onde ela está (posição no bruto), para o alerta mostrar a frase e não só a marca.
export function obiterAntesComPos(tn, ini0, fim, bruto, sentenca = false) {
  const cabeca = ini0 + Math.floor((fim - ini0) * OBITER_CABECA);
  const piso = Math.max(0, ini0 - OBITER_JANELA);
  const frase0 = inicioDaFrase(bruto, tn, piso, cabeca);
  let m = null;
  for (const x of tn.slice(frase0, cabeca).matchAll(RE_OBITER)) {
    if (sentenca && x[0].startsWith("registre-se")) continue;   // 08/10/2026: em sentença é fórmula de cartório, não aparte
    m = x;
  }
  return m ? { marca: m[0], de: frase0, pos: frase0 + m.index } : null;
}
const emUmaLinha = (x) => String(x).replace(/\s+/g, " ").trim();
const RE_JULGADO_NO_BLOCO = /relator\(?a?\)?(?: do acordao)?\s*:|data de julgamento|(?<![a-z])rel\.\s|\(tj-?[a-z]{2}|(?<![a-z0-9])(?:stj|stf|ementa)(?![a-z0-9])/;
// A frase onde está a marca, do começo da marca (com 40 caracteres antes) até o trecho; se a marca já está na cabeça do próprio trecho, diz isso.
export function fraseDoObiter(texto, ob, ini0) {
  if (ob.pos >= ini0) return " A marca está no começo do próprio trecho citado.";
  const ini = Math.max(ob.de, ob.pos - 40);
  const f = emUmaLinha(texto.slice(ini, ini0));
  return ` A frase: «${f.length > 260 ? f.slice(0, 260) + "…" : f}» + o trecho.`;
}

const sobrepoe = (a, b, x, y) => a < y && b > x;

/** A proclamação do fecho ("…em, RECURSO PROVIDO NOS TERMOS DO VOTO DIVERGENTE…, VENCIDO O RELATOR"), para o alerta. */
export function proclamacao(texto, fecho) {
  if (!(fecho >= 0) || fecho >= texto.length) return "";
  const cauda = texto.slice(fecho, fecho + 1800).replace(/\s+/g, " ");
  const m = /\bem,\s*["“]?\s*([^]*?)(?=\s*["”]?\s*(?:Dou f[eé]|Porto Velho|Ji-Paran[aá]|Cacoal|Vilhena|Ariquemes|Guajar[aá]|Rolim|Jaru|Ouro Preto|$))/i.exec(cauda);
  const p = (m ? m[1] : cauda).trim().slice(0, 420);
  return p ? ` Fecho: «${p}${p.length >= 420 ? "…" : ""}». Se o fecho diz "vencido o relator"/"nos termos do voto divergente", o voto do RELATOR é o vencido (ao menos no ponto decidido por maioria: preliminar unânime no mesmo acórdão continua sendo do órgão).` : "";
}

// NEGAÇÃO OMITIDA NO CORTE (Leva A, red team 22/10/2026): "a cobrança da tarifa [...] é devida" sobre "a cobrança da tarifa NÃO é
// devida" saía ✅ LITERAL sem alerta — negacaoAntes só olha antes do 1º fragmento e o vão entre fragmentos não era lido. Porte da regra
// já calibrada no MCP do TRT14 (rodadas 2, 3 e final de 22/10/2026, sobre recibos reais: negação em QUALQUER ponto da lacuna alarmava
// 31% das elipses aleatórias curtas e 83% das longas). Só conta a negação que REGE o fragmento seguinte: na mesma oração dele (depois
// do último . ; : da lacuna), sem quebra de oração entre ela e o fragmento e a até NEG_CORTE_DIST palavras; ou presa ao fragmento
// ANTERIOR, seguida só de aposto(s) ("não é, conforme o laudo, devido"). Negação dentro de inciso entre vírgulas ou parênteses, inteiro
// na lacuna (", e não tributária,"), não rege o seguinte. Remedido nos recibos do TJRO (harness/medir-negacao-corte.mjs).
const RE_NEG_LACUNA = new RegExp(String.raw`(?<![a-z0-9])(?:nao|nem|nunca|jamais|inexist[a-z]*|indevid[a-z]*|improced[a-z]*|` +
  String.raw`improvid[a-z]*|afast[a-z]*|descab[a-z]*|incabive[a-z]*|rejeit[a-z]*|indefer[a-z]*|nego|negou|negar|negad[oa]s?|sem razao|` +
  String.raw`exclu(?:i|ir|o|iu|indo|id[oa]s?|sao|soes|a|am|e|em|ira|iram)|descaracteriz[a-z]*|absolv[a-z]*|extirp[a-z]*|decot[a-z]*|` +
  String.raw`retir(?:ar|o|a|ou|ada|ado|adas|ados|ando|e|em)(?= (?:d[aeo]s?|na|no) (?:condenacao|sentenca|comando|titulo|calculo))|` +
  String.raw`exim(?:ir|o|e|em|iu|ida|ido|idas|idos|indo)|isent(?:ar|o|a|os|as|ou|ando|e|em)|inviav[a-z]*|impossib[a-z]*|impossive[a-z]*|` +
  String.raw`sem(?! (?:prejuizo|embargo|duvida|razao)(?![a-z0-9]))|deix(?:o|a|ou|ar|ando|ei|amos|aram|e|em) de)(?![a-z0-9])`, "g");
// TJRO (medido nos recibos, 22/10/2026): "não é demais ressaltar" afirma; "declaratória de inexistência de débito/relação" é o NOME da ação
const RE_NOME_DA_ACAO = /declaratoria (?:de )?$/;
const RE_NEG_LACUNA_FALSA = /^nao (?:e demais|obstante|so|apenas|somente|(?:havendo|ha|houve|resta|restam|restando|pairam?) (?:qualquer |mais )?duvidas?|(?:se )?pode (?:deixar|olvidar|ignorar|negar)|se (?:desconhece|ignora|olvida|nega)|ha como negar|(?:se )?deix[a-z]* de)(?![a-z0-9])/;
const RE_NEG_ANTES_DE_DEIXAR = /(?<![a-z0-9])(?:nao|nem|nunca|jamais)(?: (?:se|lhe|lhes|o|a|os|as|me|nos))?\s*$/;
const RE_FIM_ORACAO_LACUNA = /[.;:!?](?!\d)/g;
const RE_QUEBRA_PONTE = /[.;:!?](?!\d)|,\s*(?:mas|e|ou|que|o que|porque|pois|porquanto|embora|ainda|conforme|sendo)(?![a-z0-9])|\smas\s/;
const RE_QUEBRA_ANTES_NEG = /[,]|(?<![a-z0-9])(?:e|mas|ou|que|pois|porque|porquanto|embora|quando|onde|se|enquanto|conquanto)(?![a-z0-9])/;
const RE_INCISO_COORDENADO = /^\s*(?:e|mas|ou|porem|todavia|contudo|entretanto|logo|portanto)(?![a-z0-9])/;
const RE_VIRGULA_LACUNA = /(?<!\d),|,(?!\d)|\s-\s/g;
export const NEG_CORTE_DIST = 6, NEG_CORTE_APOSTO_MAX = 24;
const nPalavras = (x) => (x.match(/[a-z0-9]+/g) || []).length;
/** Negação no texto omitido `lac` (norm1, com pontuação) que rege o fragmento `seguinte` → [ini, fim) dela em `lac`, ou null. */
export function negacaoNoCorte(lac, seguinte = "", anterior = "") {
  let corte = 0;
  for (const m of lac.matchAll(RE_FIM_ORACAO_LACUNA)) corte = m.index + 1;
  const cauda = lac.slice(corte);
  const sep = [...cauda.matchAll(RE_VIRGULA_LACUNA)];
  const virg = sep.map((m) => m.index), virgFim = sep.map((m) => m.index + m[0].length);
  const nSeg = virg.length;
  const comSeguinte = cauda + " " + seguinte;
  const parens = [];
  { const pilha = [];
    for (let k = 0; k < cauda.length; k++) {
      if (cauda[k] === "(") pilha.push(k);
      else if (cauda[k] === ")" && pilha.length) { const ab = pilha.pop(); if (!pilha.length) parens.push([ab, k]); }
    } }
  const dentroDeParenteses = (idx) => parens.some(([ab, fe]) => idx > ab && idx < fe);
  const cands = [];
  for (const m of comSeguinte.matchAll(RE_NEG_LACUNA)) {
    if (m.index >= cauda.length) break;
    if (RE_NEG_LACUNA_FALSA.test(comSeguinte.slice(m.index).replace(/[^a-z0-9]+/g, " "))) continue;
    if (m[0].startsWith("deix") && RE_NEG_ANTES_DE_DEIXAR.test(cauda.slice(0, m.index).replace(/[^a-z0-9]+/g, " "))) continue;
    if (dentroDeParenteses(m.index)) continue;
    if (m[0].startsWith("inexist") && RE_NOME_DA_ACAO.test(((corte ? "" : anterior) + cauda.slice(0, m.index)).slice(-24).replace(/[^a-z0-9]+/g, " "))) continue;
    cands.push(m);
  }
  for (const op of cands.reverse()) {
    const fimOp = op.index + op[0].length;
    const i = virg.filter((v) => v < op.index).length;
    if (i === nSeg) {
      const ponte = cauda.slice(fimOp);
      if (RE_QUEBRA_PONTE.test(ponte) || nPalavras(ponte) > NEG_CORTE_DIST) continue;
      return [corte + op.index, corte + fimOp];
    }
    if (i === 0) {
      if (RE_QUEBRA_ANTES_NEG.test(cauda.slice(0, op.index))) continue;
      const ponte0 = cauda.slice(fimOp, virg[0]);
      if (RE_QUEBRA_PONTE.test(ponte0) || nPalavras(ponte0) > NEG_CORTE_DIST) continue;
      if (cauda.slice(virgFim[nSeg - 1]).trim()) continue;
      const incisos = [];
      for (let k = 0; k + 1 < nSeg; k++) incisos.push(cauda.slice(virgFim[k], virg[k + 1]));
      if (!incisos.length || incisos.some((x) => RE_INCISO_COORDENADO.test(x))) continue;
      if (incisos.reduce((n, x) => n + nPalavras(x), 0) > NEG_CORTE_APOSTO_MAX) continue;
      return [corte + op.index, corte + fimOp];
    }
  }
  return null;
}


// PISO DE SURPRESA POR FRAGMENTO (1.41.9). "a cobrança [...] é [...] devida" saía ✅ LITERAL: cada palavra solta aparece em qualquer
// acórdão a menos de 1.500 caracteres da anterior. A surpresa do fragmento é a soma, em bits, da frequência inversa de DOCUMENTO das
// palavras e dos pares de palavras (P(w1)·P(w2|w1)…, tabela gerada dos recibos por harness/gerar-raridade.mjs; termo fora da tabela
// conta como presente em DF_MIN/2 documentos). Calibrado na cópia dos recibos (6.555; estatística de 24/10/2026): 3.489 citações
// elididas sintetizadas de texto real × 2.451 costuras de 1–2 palavras em ordem. Com fragmento < 2 bits, ou de 1 palavra, ou total
// < 24 bits, ou nenhum fragmento de 3+ palavras: 0 costura sai ✅ pleno; ficam com aviso 0,7–1,7% das elididas de fragmentos longos
// e ~25% das que têm cabeça ou cauda de 2–3 palavras comuns ("[...] é devida") — o aviso é o certo nesses: o fragmento comum não
// prova que a frase seja aquela. Só vale com 2+ fragmentos (citação sem corte já tem o piso de 4 palavras e 25 caracteres).
import { TABELA as RARIDADE } from "./raridade-tabela.js";
export const PISO_FRAGMENTO_BITS = 2, PISO_TOTAL_BITS = 24, FRAGMENTO_LONGO_PALAVRAS = 3, FRAGMENTO_LONGO_3MAIS = 5;
const bitsPalavra = (w) => Math.log2(RARIDADE.N / (RARIDADE.uni[w] || RARIDADE.DF_MIN / 2));
/** Surpresa do fragmento (palavras norm1), em bits. */
export function surpresaFragmento(ws) {
  if (!ws.length) return 0;
  let b = bitsPalavra(ws[0]);
  for (let i = 1; i < ws.length; i++)
    b += Math.max(0, Math.log2(RARIDADE.N / (RARIDADE.bi[ws[i - 1] + " " + ws[i]] || RARIDADE.DF_MIN / 2)) - bitsPalavra(ws[i - 1]));
  return b;
}
/** Costura de fragmentos curtos? → { frags: [{texto, palavras, bits}], total, motivos } ou null. */
export function costuraCurta(fragsPalavras) {
  if (fragsPalavras.length < 2) return null;
  const fs = fragsPalavras.map((ws) => ({ texto: ws.join(" "), palavras: ws.length, bits: surpresaFragmento(ws) }));
  const total = fs.reduce((s, f) => s + f.bits, 0), motivos = [];
  const curtos = fs.filter((f) => f.palavras < 2 || f.bits < PISO_FRAGMENTO_BITS);
  if (curtos.length) motivos.push(`fragmento(s) abaixo do piso (${PISO_FRAGMENTO_BITS} bits ou 1 palavra): ${curtos.map((f) => `«${f.texto}» ${f.bits.toFixed(1)} bits`).join(", ")}`);
  if (total < PISO_TOTAL_BITS) motivos.push(`surpresa total ${total.toFixed(1)} bits (piso ${PISO_TOTAL_BITS})`);
  if (!fs.some((f) => f.palavras >= FRAGMENTO_LONGO_PALAVRAS)) motivos.push(`nenhum fragmento com ${FRAGMENTO_LONGO_PALAVRAS}+ palavras`);
  // Reataque Fable (24/10/2026): 3+ fragmentos de 3 palavras de frases vizinhas passavam sem aviso em 20% (sintético). Com 3 ou mais
  // fragmentos, ao menos um precisa ter FRAGMENTO_LONGO_3MAIS palavras (um pedaço de frase de verdade).
  if (fs.length >= 3 && !fs.some((f) => f.palavras >= FRAGMENTO_LONGO_3MAIS)) motivos.push(`${fs.length} fragmentos e nenhum com ${FRAGMENTO_LONGO_3MAIS}+ palavras`);
  return motivos.length ? { frags: fs, total, motivos } : null;
}

// CASAMENTO APROXIMADO (1.41.9), só para o que não muda o conteúdo: hífen de quebra de linha ("con- trato"), hífen invisível U+00AD
// (norm1 o mantém e ele partia a palavra) e o ponto de milhar ("1.000" = "1000", o mesmo valor). Números, dígitos e negadores continuam
// exatos: nenhuma palavra é omitida nem trocada, não há distância de edição. Palavra do texto partida por quebra não casa pela METADE
// ("procedente" dentro de "im- procedente" deixa de casar).
const RE_QUEBRA_TEXTO = /[a-z](?:\u00ad|-\s+)[a-z]/;
const SEP_QUEBRA = String.raw`(?:\u00ad\s*|-\s+)?`;
// só número solto ("e1.025" e "2019.822" de número CNJ não são milhar)
const RE_MILHAR = /(?<![\dA-Za-zÀ-ÿ.,])\d{1,3}(?:\.\d{3})+(?!\d|[.,]?[A-Za-zÀ-ÿ]|[.]\d)/g;
function padraoPalavra(w, quebra) {
  if (/^\d{4,}$/.test(w)) {
    // 1000 ≡ 1.000 (todos os pontos de milhar ou nenhum); com pontos, nunca o começo de número maior ("1.000" dentro de "1.000.000")
    const r = w.length % 3, gs = [];
    if (r) gs.push(w.slice(0, r));
    for (let i = r; i < w.length; i += 3) gs.push(w.slice(i, i + 3));
    return `(?:${w}|${gs.join(String.raw`\.`)}${String.raw`(?!\.\d{3}(?!\d))`})`;
  }
  if (quebra && /^[a-z]{2,}$/.test(w)) return w.split("").join(SEP_QUEBRA);
  return esc(w);
}
/** O trecho como a pessoa o colou: hífen invisível fora, quebra "con- trato" juntada, milhar sem ponto. */
// `hifen`: a 2ª tentativa mantém o hífen ("Trata- se" → "Trata-se"), para o texto que tem o composto/ênclise SEM a quebra
const limparTrecho = (s, milhar = true, hifen = false) => { const x = String(s || "").replace(/\u00ad/g, "").replace(/([a-zà-ÿ])-\s+([a-zà-ÿ])/g, hifen ? "$1-$2" : "$1$2"); return milhar ? x.replace(RE_MILHAR, (m) => m.replace(/\./g, "")) : x; };
// metade final de palavra partida no texto depois de PREFIXO NEGATIVO ("im- procedente", "in- devido", "des- provido", "ir- regular"):
// "procedente" não casa ali. Medido na cópia: quase todo "x- y" do portal é composto ou ênclise ("trata- se", "fático- probatório"), e
// bloquear toda metade perdia citação legítima; só o prefixo que inverte o sentido é bloqueado (negadores continuam exatos).
const RE_METADE_ANTES = /(?<![a-zà-ÿ])(?:(?:in|im|i|ir|des|dis|n[ãa]o)(?:\u00ad\s*|-\s+)|n[ãa]o-)$/i;   // "não-incidência" colado também
const metadeDePalavra = (bruto, a) => RE_METADE_ANTES.test(bruto.slice(Math.max(0, a - 12), a)) && /[a-zà-ÿ]/i.test(bruto[a] || "");

/** Confere `trecho` em `texto` (documento do TJRO do `tipo` dado). Posições em norm1 = posições no bruto. */
// Reataque Fable (24/10/2026), regressão: o trecho colado do PDF com quebra de hífen ("Trata- se", "manifestou- se", "fático-
// probatório") era juntado num token só ("tratase") e não casava com o texto que tem "Trata-se" (❌ em 61% dos recibos reais). Se a
// 1ª tentativa (quebra juntada) não casa e o trecho tem "x- y" entre LETRAS, tenta de novo mantendo o hífen; números e negadores
// seguem exatos (só muda o separador entre duas letras).
export function conferirTrecho(texto, trecho, tipo) {
  const r = conferirTrecho0(texto, trecho, tipo, false);
  if (!r.ok && r.fragmento !== undefined && /[a-zà-ÿ]-\s+[a-zà-ÿ]/.test(String(trecho || ""))) {
    const r2 = conferirTrecho0(texto, trecho, tipo, true);
    if (r2.ok) return r2;
  }
  return r;
}
function conferirTrecho0(texto, trecho, tipo, hifen) {
  // leva B: ligadura (ﬁ, ﬂ) vira letras dos DOIS lados antes de comparar — norm1 é 1 → 1 e ficava só com a 1ª letra
  texto = expandirLigaduras(texto);
  const comPontos = limparTrecho(expandirLigaduras(trecho), false, hifen);   // o piso de tamanho conta o trecho como foi escrito
  trecho = limparTrecho(expandirLigaduras(trecho), true, hifen);
  const frags = String(trecho || "").split(RE_CORTE).map((f) => f.trim()).filter(Boolean);
  if (!frags.length) return { ok: false, erro: "trecho vazio" };
  const util = norm1(comPontos.split(RE_CORTE).map((f) => f.trim()).filter(Boolean).join(" ")).trim();
  const nPal = (util.match(new RegExp(`[${W}]+`, "g")) || []).length;
  if (nPal < PISO_TRECHO_PALAVRAS || util.length < PISO_TRECHO_CHARS)
    return { ok: false, erro: `trecho curto demais para conferência útil (mínimo ${PISO_TRECHO_PALAVRAS} palavras e ${PISO_TRECHO_CHARS} caracteres): qualquer acórdão contém isso` };
  const bruto = String(texto || "");
  const tn = norm1(bruto);
  const quebra = RE_QUEBRA_TEXTO.test(tn);
  let pos = 0, ini0 = null;
  const spans = [], fragsPalavras = [];
  for (const f of frags) {
    const palavras = norm1(f).match(new RegExp(`[${W}]+`, "g"));
    if (!palavras) return { ok: false, fragmento: f };
    fragsPalavras.push(palavras);
    const re = new RegExp(`(?<![${W}])` + palavras.map((w) => padraoPalavra(w, quebra)).join(`[^${W}]+`) + `(?![${W}])`, "g");
    re.lastIndex = pos;
    let m = re.exec(tn);
    while (m && metadeDePalavra(bruto, m.index)) { re.lastIndex = m.index + 1; m = re.exec(tn); }
    if (!m) return { ok: false, fragmento: f };
    const a = m.index, b = a + m[0].length;
    if (spans.length && a - spans[spans.length - 1][1] > VAO_MAXIMO)
      return { ok: false, fragmento: f, erro: `o fragmento aparece, mas a ${a - spans[spans.length - 1][1]} caracteres do anterior (máximo ${VAO_MAXIMO}): \`[...]\` não pode costurar partes distantes do acórdão` };
    spans.push([a, b]);
    if (ini0 === null) ini0 = a;
    pos = b;
  }
  const alertas = [], notas = [];
  const cost = costuraCurta(fragsPalavras);
  if (cost)
    alertas.push(`FRAGMENTOS CURTOS (costura de [...]): os fragmentos estão no documento, na ordem, mas são comuns demais para provar que a frase citada é a do acórdão — ${cost.motivos.join("; ")}. Palavras soltas aparecem em qualquer acórdão a poucas linhas umas das outras. Cite a frase inteira, ou fragmentos maiores, e confira o contexto.`);
  const fx = faixasAlheias(String(texto || ""), tipo);
  // Medição cega da amostra A (23/10/2026): qualquer sobreposição rotulava o trecho inteiro como TRANSCRIÇÃO — o voto divergente
  // VENCEDOR de v16 levou o alerta por duas palavras finais ("Vejamos: Apelação cível."). Agora, como no VOTO DIVERGENTE, conta a
  // MAIORIA do trecho; o trecho que só encosta no bloco leva um aviso próprio, sem ser rotulado como transcrição.
  const tocaTranscricao = spans.some(([a, b]) => fx.transcritas.some(([x, y]) => sobrepoe(a, b, x, y)));
  const cobTranscrita = tocaTranscricao ? coberturaCitada(fx.transcritas, ini0, pos) : 0;
  const emTranscricao = tocaTranscricao && cobTranscrita * 2 > pos - ini0;
  const naCasa = !fx.ementaDaCasa && fx.casaIni < tn.length && spans.every(([a]) => a >= fx.casaIni);
  // v1.15.0: onde o trecho está (seção da ementa, relatório/fundamentação/dispositivo do voto) e marca de obiter
  const posicao = posicaoNoJulgado(String(texto || ""), tipo, ini0, pos, fx);
  // Medição cega da amostra A (23/10/2026): na ementa da casa, "I. CASO EM EXAME" e "II. QUESTÃO EM DISCUSSÃO" relatam a tese da
  // parte ("Os agravantes sustentam…") e a ferramenta afirmava VOZ DA CASA sem rodar ALEGAÇÃO DA PARTE. Nessas duas seções não há
  // nota de voz da casa e a alegação da parte é procurada como no voto.
  const relatoNaEmenta = (naCasa || fx.ementaDaCasa) && !emTranscricao && ehRelatoDaEmenta(posicao);
  if (relatoNaEmenta) { /* sem VOZ DA CASA: a seção relata o caso, a POSIÇÃO NO JULGADO diz qual */ }
  else if (fx.ementaDaCasa) notas.push("VOZ DA CASA: o documento é a EMENTA do próprio julgado.");
  else if (naCasa) notas.push("VOZ DA CASA: o trecho está na ementa/fecho do próprio acórdão (parte que é palavra do TJRO, mesmo que o voto transcreva frase igual de outro julgado).");
  // 1.41.9 (item 4): o bloco transcrito anunciado como a SENTENÇA/decisão de origem ("Em sentença, consignou o juízo de origem:
  // [...]") é o 1º grau do MESMO processo, não "outro julgado/tribunal". Só o tipo muda; o alerta continua (voz.js).
  const blocoSent = emTranscricao ? (() => {
    const b = fx.transcritas.map(([x, y]) => [x, y, Math.max(0, Math.min(pos, y) - Math.max(ini0, x))]).sort((p, q) => q[2] - p[2])[0];
    // a custódia une blocos vizinhos: depois de uma atribuição de julgado ("Relator(a) do Acórdão", "Data de julgamento", STJ, ementa) entre o
    // início do bloco e o trecho, o trecho já pode ser o julgado transcrito em seguida — aí fica TRANSCRIÇÃO
    return b && !RE_JULGADO_NO_BLOCO.test(tn.slice(b[0], ini0)) ? sentencaAnunciadaAntes(String(texto || ""), tn, b[0]) : null;
  })() : null;
  if (emTranscricao && blocoSent)
    alertas.push(`SENTENÇA TRANSCRITA: o trecho está no bloco em que o voto transcreve a sentença/decisão de 1º grau deste processo («${emUmaLinha(blocoSent).slice(-160)}») — é o juízo de origem falando, não o TJRO. Se o acórdão adota a sentença (por seus próprios fundamentos, art. 46 da Lei 9.099/95), diga isso ao citar; senão, cite o que o voto decidiu sobre ela.`);
  else if (emTranscricao)
    alertas.push("TRANSCRIÇÃO: o trecho está dentro de bloco que o voto transcreve de OUTRO julgado/tribunal — não é palavra do TJRO neste processo. Se for citar, cite como o TJRO citando; melhor: pesquise o original.");
  else if (tocaTranscricao) {
    const [x, y] = fx.transcritas.find(([a, b]) => sobrepoe(ini0, pos, a, b));
    const ponta = emUmaLinha(String(texto || "").slice(Math.max(ini0, x), Math.min(pos, y))).slice(0, 120);
    alertas.push(`ENCOSTA EM TRANSCRIÇÃO: ${cobTranscrita} de ${pos - ini0} caracteres do trecho estão num bloco que o voto transcreve de outro julgado — o grosso não está no bloco, mas a ponta («${ponta}») é de outro texto. Corte o trecho fora do bloco transcrito antes de citar.`);
  }
  // v1.14.0: conta a MAIORIA do trecho dentro da faixa (trecho que só encosta na fronteira — "…é como voto. DECLARAÇÃO DE
  // VOTO…" — não é o vencido), e o alerta já traz a proclamação do fecho, para o agente ler quem venceu sem reabrir o acórdão.
  if (fx.divergente && coberturaCitada([fx.divergente], ini0, pos) * 2 > pos - ini0)
    alertas.push("VOTO DIVERGENTE: o trecho está na parte do acórdão que pode ser o voto VENCIDO (pedido de vênia, voto-vista ou relator vencido). Leia o fecho (\"por maioria, vencido…\") antes de citar como entendimento do órgão." +
      ` Essa parte começa assim: «${emUmaLinha(String(texto || "").slice(fx.divergente[0], fx.divergente[0] + 220))}…».` + proclamacao(String(texto || ""), fx.fecho));
  if (!emTranscricao && !naCasa && !fx.ementaDaCasa) {
    const cit = trechosCitados(String(texto || ""));
    const dentro = coberturaCitada(cit, ini0, pos);
    const abreCit = cit.find(([x, y]) => x <= ini0 + (pos - ini0) / 2 && y >= ini0);
    if (dentro * 2 > pos - ini0 && !(abreCit && RE_TESE_PROPRIA.test(tn.slice(Math.max(0, abreCit[0] - 80), abreCit[0]))))
      alertas.push("ENTRE ASPAS: o trecho parece estar dentro de aspas no acórdão — é o tribunal citando alguém (doutrina, lei, sentença, outro julgado). Confira de quem é a frase antes de atribuí-la ao TJRO.");
    else {
      // a MAIORIA do trecho dentro do bloco anunciado (como no VOTO DIVERGENTE)
      // Reataque Fable (24/10/2026): as MESMAS faixas do recibo (início 0, fim na voz da casa) — com fim no trecho, a retomada do
      // relator achada depois dele não fechava o bloco aqui e fechava no recibo (29 pontos em 25 documentos divergiam do lint)
      const intro = faixasIntroduzidas(tn, String(texto || ""), 0, fx.casaIni)
        .find(([x, y]) => coberturaCitada([[x, y]], ini0, pos) * 2 > pos - ini0);
      if (intro && intro[2] === "DOUTRINA?")
        notas.push(`DOUTRINA? (baixa confiança): o trecho vem depois de um introdutor com dois-pontos («${emUmaLinha(String(texto || "").slice(Math.max(0, intro[0] - 90), intro[0]))}») que pode anunciar texto alheio, mas a frase não nomeia autor — é provável que seja o próprio relator explicando. Confira se há citação de doutrina antes de atribuir ao TJRO.`);
      else if (intro && intro[2] === "DOUTRINA")
        alertas.push(`DOUTRINA: o trecho vem depois de o voto anunciar uma lição doutrinária (ou outro texto citado) com dois-pontos («${emUmaLinha(String(texto || "").slice(Math.max(0, intro[0] - 90), intro[0]))}»), sem aspas — é o autor citado, não o TJRO. Cite como doutrina citada no acórdão, ou confira onde o voto retoma a palavra.`);
      else if (intro)
        alertas.push(`SENTENÇA TRANSCRITA: o trecho vem depois de o voto anunciar a transcrição da sentença/decisão com dois-pontos («${emUmaLinha(String(texto || "").slice(Math.max(0, intro[0] - 90), intro[0]))}»), sem aspas — é o 1º grau falando (pode ser só o relato do juiz), não o TJRO. Se o acórdão adota a sentença, diga isso ao citar.`);
    }
    if (alegacaoDaParte(tn, ini0, pos, String(texto || "")))
      alertas.push("ALEGAÇÃO DA PARTE: o texto relata o que uma parte (apelante, banco, Estado…) sustenta, alega ou requer logo antes do trecho — pode ser tese da parte, não decisão do tribunal. Confira no relatório/voto quem fala.");
  } else if (relatoNaEmenta && alegacaoDaParte(tn, ini0, pos, String(texto || "")))
    alertas.push("ALEGAÇÃO DA PARTE: o trecho está na seção da ementa que RELATA o caso (caso em exame / questão em discussão) e vem depois de a parte sustentar, alegar ou requerer — é a tese da parte resumida na ementa, não o que o tribunal decidiu. Cite pelas razões de decidir ou pelo dispositivo.");
  if (negacaoAntes(tn, ini0, pos, String(texto || "")))
    alertas.push(negacaoProxima(tn, ini0) ? "NEGAÇÃO: há negativa logo antes do trecho — o recorte pode inverter o julgado. Não citar sem ler a frase inteira."
      : "NEGAÇÃO (distante)?: há uma negativa algumas palavras antes do trecho, fora dele. Na maioria das vezes ela fecha a própria oração e não inverte o recorte (medido às cegas), mas leia a frase inteira antes de citar.");
  for (let k = 1; k < spans.length; k++) {
    const a = spans[k - 1][1], b = spans[k][0];
    const neg = negacaoNoCorte(tn.slice(a, b), tn.slice(b, b + 40), tn.slice(Math.max(0, a - 30), a));
    if (!neg) continue;
    const omitido = emUmaLinha(String(texto || "").slice(a, b));
    const curto = omitido.length > 140 ? "…" + omitido.slice(-140) : omitido;
    const negTxt = emUmaLinha(String(texto || "").slice(a + neg[0], a + neg[1]));
    alertas.push(`NEGAÇÃO OMITIDA NO CORTE: o [...] tira «${curto}»${negTxt === omitido ? ", negativa que rege o trecho seguinte" : `, com a negativa «${negTxt}» regendo o trecho seguinte`} — o recorte pode inverter o julgado. Não citar sem a negativa ou sem ler a frase inteira.`);
    break;
  }
  if (posicao) notas.push(`POSIÇÃO NO JULGADO: ${posicao}.`);
  const ob = !emTranscricao && !naCasa && !fx.ementaDaCasa && !alertas.some((a) => a.startsWith("ENTRE ASPAS") || a.startsWith("DOUTRINA:") || a.startsWith("SENTENÇA TRANSCRITA:")) ? obiterAntesComPos(tn, ini0, pos, String(texto || ""), String(tipo || "").trim().toUpperCase() === "SENTENÇA") : null;   // frase alheia entre aspas não é obiter do tribunal
  // 1.41.9 (item 3): conteúdo de concessiva negativa ("ainda que não…, dou provimento"): o tribunal admite o ponto e decide apesar
  // dele. Fora de transcrição e de texto alheio (aspas, doutrina, sentença), como o OBITER; vale também na ementa da casa.
  const conc = !ob && !emTranscricao && !alertas.some((a) => a.startsWith("ENTRE ASPAS") || a.startsWith("DOUTRINA:") || a.startsWith("SENTENÇA TRANSCRITA:")) ? concessivaNegativa(tn, ini0, pos) : null;
  if (conc)
    alertas.push(`OBITER DICTUM? (concessiva): o trecho é o conteúdo de uma oração concessiva («${emUmaLinha(String(texto || "").slice(conc.a, conc.b))}») — o tribunal ADMITE o ponto e decide APESAR dele; não é a razão do resultado e, citado sem a oração principal («${conc.posposta ? "…" : ""}${emUmaLinha(String(texto || "").slice(conc.pi, conc.pf))}${conc.posposta ? "" : "…"}»), pode parecer apoiar o resultado oposto. Cite a frase inteira ou só a oração principal.`);
  if (ob)
    alertas.push(`OBITER DICTUM?: o trecho vem sob «${ob.marca}» — raciocínio hipotético ou fundamento alternativo; o resultado do julgado não dependeu dele. Vale como reforço, não como ratio decidendi; cite dizendo que é obiter.${fraseDoObiter(String(texto || ""), ob, ini0)}`);
  const contexto = String(texto || "").slice(Math.max(0, ini0 - 120), pos + 120).replace(/\s+/g, " ").trim();
  // 1.41.9: "só confirma com evidência". Sem alerta NÃO é prova de que a frase é do tribunal (medição cega de 24/10/2026: 17 de 43
  // trechos ✅ sem alerta eram relatório de parte, sentença/artigo/voto de outro tribunal transcritos sem marca). A voz do TJRO só
  // é afirmada com marca positiva: ementa/fecho do próprio acórdão. Voto: LITERAL, mas a voz fica por conferir.
  const naoEVoz = /^(?:RELAT[ÓO]RIO|antes do voto|cabeçalho da peça|cabeçalho da sentença)/.test(posicao || "");
  // Reataque Fable (24/10/2026): "casa" não é prova por si — (1) formato antigo com fecho no alto e relatório/voto/voto vencido depois
  // (33 de 39 ✅ falsos): cabeçalho RELATÓRIO/VOTO dentro da casa antes do trecho, ou trecho a mais de 2.000 caracteres do fecho, tira a
  // confirmação; (2) tese da parte relatada na ementa fora das seções I/II; (3) texto entre aspas dentro da ementa (lei, tema, IRDR).
  const brutoT = String(texto || "");
  const casaIni = fx.ementaDaCasa ? 0 : fx.casaIni;
  const cabAntes = /(?<![A-Za-zÀ-ú])(?:RELAT[ÓO]RIO|VOTO(?:\s+VENCID[OA]|\s+DIVERGENTE|\s+VENCEDOR)?|DECLARA[ÇC][ÃA]O\s+DE\s+VOTO|SENTEN[ÇC]A)\b/.test(brutoT.slice(casaIni, ini0));
  const longeDoFecho = !fx.ementaDaCasa && fx.fecho < tn.length && ini0 - fx.fecho > 1000;
  const aspasNaCasa = coberturaCitada(trechosCitados(brutoT), ini0, pos) * 2 > pos - ini0;
  const parteNaCasa = alegacaoDaParte(tn, ini0, pos, brutoT);
  // Reataque Fable (25/10/2026): o trecho que atravessa o fecho e entra no cabeçalho do documento concatenado seguinte ("… Relator Poder
  // Judiciário do Estado de Rondônia 2ª Câmara") não é a palavra do colegiado.
  const cruzaDocumento = /poder judiciario do estado de rondonia|acordao vistos|tribunal de justica do estado de rondonia/.test(tn.slice(ini0, pos)) && /^fecho/.test(posicao || "");
  const vozConfirmada = !alertas.length && !naoEVoz && notas.some((n) => n.startsWith("VOZ DA CASA")) && !cabAntes && !longeDoFecho && !aspasNaCasa && !parteNaCasa && !cruzaDocumento;
  return { ok: true, alertas, notas, contexto, spans, vozConfirmada, naoEVoz };
}

/** Recibos a partir de uma resposta do portal (mesmo formato de gravarRecibos), sem tocar no disco. */
export const recibosDeResposta = (data) => ((data?.hits?.hits) || []).map((h) => recibo(h._source || {})).filter(Boolean);

const RODAPE =
  `\nCobre o TEXTO INTEIRO de cada documento (ementa, relatório, voto, fecho) e diz DE QUEM é a frase: TRANSCRIÇÃO (ementa de outro tribunal/julgado copiada no voto), VOTO DIVERGENTE (pode ser o vencido), ENTRE ASPAS, ALEGAÇÃO DA PARTE, DOUTRINA, SENTENÇA TRANSCRITA, NEGAÇÃO (antes do trecho ou omitida pelo \`[...]\`), FRAGMENTOS CURTOS (costura de \`[...]\` com pedaços comuns demais para provar a frase) e OBITER DICTUM? (raciocínio hipotético/alternativo ou conteúdo de concessiva negativa). Trecho com alerta NÃO entra na ficha como posição do órgão sem resolver a atribuição. A nota POSIÇÃO NO JULGADO diz ONDE a frase está (seção da ementa do CNJ, relatório, fundamentação ou dispositivo do voto): é a evidência para \`ratio_ou_dictum\` da ficha, não a decisão. ` +
  `Comparação por palavra inteira, tolerante a caixa, acento e pontuação; mínimo de ${PISO_TRECHO_PALAVRAS} palavras; \`[...]\` separa fragmentos em ordem, a até ${VAO_MAXIMO} caracteres. Se ❌: não cite entre aspas — parafraseie, ou confira no portal. A heurística é a mesma do recibo que o lint da peticao-rg lê: ✅ aqui e erro lá não deveriam divergir; se divergirem, vale o lint.`;

/**
 * Verifica `trecho` nos documentos do processo/id. `opcoes.buscar(nrProcesso)` é a função que vai ao portal
 * (index.js: post + gravarRecibos + cache) e devolve a resposta bruta; ausente, só recibos locais.
 */
export async function verificarCitacao({ nr_processo, id_documento, trecho, buscar = null, pasta = dirRecibos() } = {}) {
  if (!String(trecho || "").trim()) return "Informe o trecho que pretende citar entre aspas.";
  const id = String(id_documento || "").trim();
  const digitos = soDigitos(nr_processo);
  if (!id && digitos.length < 7) return "Informe o id do documento (id_documento, o mesmo da busca/inteiro teor) ou o número do processo (nr_processo).";
  let docs = [], origem = "recibo local";
  if (id) {
    const r = reciboPorId(id, pasta);
    if (r) docs = [r];
  }
  if (!docs.length && digitos.length >= 7) docs = recibosDoProcesso(digitos, pasta);
  if (id && docs.length > 1) docs = docs.filter((r) => String(r.id_documento) === id).concat(docs.filter((r) => String(r.id_documento) !== id));
  // v1.31.0 (H01): recibos gravados pela BUSCA (origem "busca") não provam que o processo esteja completo. Achado ✅ vale (o texto é o do tribunal);
  // "não encontrado" só vale como ausência no processo se houver recibo do inteiro teor. Sem ✅ e sem prova de completude: vai ao portal, ou avisa.
  const porId = !!id && docs.length > 0 && String(docs[0].id_documento) === id;
  if (docs.length && !porId && docs.every((d) => d.origem === "busca")) {
    if (!docs.some((d) => conferirTrecho(d.texto, trecho, d.tipo).ok)) {
      if (buscar && digitos.length >= 7) {
        try {
          docs = recibosDeResposta(await buscar(digitos));
          origem = "portal (inteiro teor lido agora; recibos gravados)";
        } catch (e) {
          return `[VERIFICAÇÃO NÃO REALIZADA] só há recibos de busca para ${cnj(digitos)} (${docs.length} documento(s), sem prova de que sejam todos) e o portal não pôde ser lido: ${e?.message || e}. Não cite entre aspas até conferir.`;
        }
        if (!docs.length) return `Nenhum documento sob o número ${cnj(digitos)} no portal — não há como verificar; não cite.`;
      } else {
        return `Só há recibos de BUSCA para ${cnj(digitos)} (${docs.length} documento(s)), e o trecho não está neles. Isso NÃO prova que o trecho esteja fora do processo: a busca traz só os documentos que casaram. Chame obter_inteiro_teor_tjro(nr_processo) (lê o processo inteiro e grava o recibo) e repita.`;
      }
    } else origem = "recibo local (de busca; o processo pode ter outros documentos)";
  }
  if (!docs.length) {
    if (!buscar || digitos.length < 7)
      return `Sem recibo local para ${id ? `o id ${id}` : `o processo ${cnj(digitos)}`} — o documento ainda não foi lido nesta máquina. Chame obter_inteiro_teor_tjro(nr_processo) primeiro (grava o recibo) e repita; com só o id não há como buscar no portal.`;
    try {
      docs = recibosDeResposta(await buscar(digitos));
      origem = "portal (inteiro teor lido agora; recibos gravados)";
    } catch (e) {
      return `[VERIFICAÇÃO NÃO REALIZADA] não foi possível ler o inteiro teor no portal: ${e?.message || e}. Sem texto, não há como conferir — não cite entre aspas até conferir.`;
    }
    if (id) docs = docs.filter((r) => String(r.id_documento) === id).concat(docs.filter((r) => String(r.id_documento) !== id));
    if (!docs.length) return `Nenhum documento sob o número ${cnj(digitos)} no portal — não há como verificar; não cite.`;
  }
  // 1.41.11 (diagnóstico 26/10, item 5): o id informado não tem o trecho, mas outro documento do MESMO processo (VOTO × ACÓRDÃO × EMENTA,
  // recibos locais) tem — o ❌ do id continua ❌ e passa a apontar onde a frase está. O outro documento leva o próprio selo e alertas.
  if (porId && docs.length === 1 && !conferirTrecho(docs[0].texto, trecho, docs[0].tipo).ok) {
    const dp = soDigitos(docs[0].nr_processo);   // nunca o parâmetro: recibo sem número não aponta para outro processo
    if (dp.length === 20) docs = docs.concat(recibosDoProcesso(dp, pasta).filter((r) => String(r.id_documento) !== id && r.texto));
  }
  const confs = docs.map((d) => conferirTrecho(d.texto, trecho, d.tipo));
  // 1.42.0 (red team de 27/10/2026): o ponteiro exclui também o selo NÃO É VOZ e diz quando o documento é de OUTRO julgamento (outra data)
  const dataCit = id && docs.length && String(docs[0].id_documento) === id ? String(docs[0].data_julgamento || "") : "";
  const achadoEm = id ? docs.filter((d, k) => confs[k].ok && !confs[k].naoEVoz && !(confs[k].alertas || []).some((x) => x.startsWith("FRAGMENTOS CURTOS")) && String(d.id_documento) !== id) : [];
  const outroJulg = (x) => !dataCit || !x.data_julgamento || String(x.data_julgamento) !== dataCit;
  let idSemTrecho = false;
  const linhas = [];
  let algumOk = false;
  for (const [k, d] of docs.entries()) {
    const r = confs[k];
    let marca = r.ok ? "✅ LITERAL" : "❌ NÃO ENCONTRADO";
    if (r.ok && r.alertas.length) marca = "✅ LITERAL, MAS COM ALERTA DE ATRIBUIÇÃO";
    // 1.41.9: costura de fragmentos curtos não é ✅ LITERAL pleno — os pedaços existem, a frase não está provada
    if (r.ok && r.alertas.some((a) => a.startsWith("FRAGMENTOS CURTOS"))) marca = "✅ FRAGMENTOS ACHADOS, MAS A COSTURA NÃO PROVA A FRASE (FRAGMENTOS CURTOS)";
    // 1.41.9: sem marca positiva de voz o selo não é ✅ pleno (a ausência de alerta não prova de quem é a frase)
    if (r.ok && !r.alertas.length && !r.vozConfirmada)
      marca = r.naoEVoz ? "✅ LITERAL, MAS NÃO É VOZ DO TRIBUNAL (RELATÓRIO/NARRAÇÃO): é o relato do processo ou das partes"
        : "✅ LITERAL, VOZ NÃO CONFIRMADA: a frase existe no documento, mas nada prova que seja do TJRO (pode ser parte, sentença, lei ou outro tribunal transcritos sem marca) — leia o contexto antes de atribuir";
    algumOk = algumOk || r.ok;
    const motivo = r.ok ? "trecho encontrado literalmente" : (r.erro || "trecho NÃO encontrado literalmente neste documento");
    linhas.push(`${marca} · id ${d.id_documento} · ${d.tipo || "?"} · ${cnj(d.nr_processo)} · julgado em ${d.data_julgamento || "?"} · ${motivo}`);
    for (const n of r.notas || []) linhas.push(`   ℹ️ ${n}`);
    for (const al of r.alertas || []) linhas.push(`   ⚠️ ${al}`);
    if (r.ok && r.contexto) linhas.push(`   contexto: …${r.contexto.slice(0, 320)}…`);
    if (!r.ok && r.fragmento) linhas.push(`   fragmento sem correspondência: «${String(r.fragmento).slice(0, 160)}»`);
    if (!r.ok && id && String(d.id_documento) === id && achadoEm.length)
      linhas.push(`   ↪ NÃO está no id ${id}, mas ESTÁ ${achadoEm.length > 1 ? "nos documentos" : "no documento"} ${achadoEm.map((x) => `${x.id_documento} (tipo ${x.tipo || "?"}${x.data_julgamento ? `, julgado em ${x.data_julgamento}` : ""}${outroJulg(x) ? `; OUTRO JULGAMENTO (${x.data_julgamento || "data ignorada"}), não é a decisão do id ${id}` : ", mesmo julgamento"})`).join(", ")} do mesmo processo — só cite por esse id se o selo dele abaixo for "✅ LITERAL" sem complemento e o julgamento for o que a peça quer citar.`);
    if (!r.ok && id && String(d.id_documento) === id) idSemTrecho = true;
    if (id && String(d.id_documento) === id && docs.length > 1) linhas.push("   (os demais documentos abaixo são do mesmo processo; só o selo \"✅ LITERAL\" sem complemento autoriza aspas como palavra do TJRO; qualquer outro ✅ vai para `limites`, com o selo copiado)");
  }
  const cab = `**Verificação literal — ${id ? `id ${id}` : cnj(digitos)} (TJRO, ${docs.length} documento(s), fonte: ${origem})**`;
  const fecho = algumOk ? "" : "\n❌ Em nenhum documento: não cite entre aspas. Se o trecho veio de outra peça do mesmo número (ementa × acórdão × embargos), confira o id; se veio de memória, parafraseie ou abra o inteiro teor.";
  const fechoId = algumOk && idSemTrecho ? `\n❌ no id informado (${id}): o trecho NÃO está nele. O ✅ acima é de outro documento e não vale para o id ${id}.` : "";
  return [cab, ...linhas].join("\n") + fecho + fechoId + RODAPE;
}
