// verificar_citacao_tjro (v1.10.0): a frase que vai entre aspas está LITERALMENTE no documento,
// e é palavra do TJRO? Mesmo contrato dos MCPs do TRF1, TRT14, TCE-RO, TJSE e OAB: comparação
// por palavra inteira, tolerante a caixa, acento e pontuação; mínimo de 4 palavras; `[...]`
// separa fragmentos que devem aparecer em ordem, a no máximo 1.500 caracteres um do outro.
// Lê primeiro o RECIBO local (zero requisição); sem recibo, o chamador busca o inteiro teor.
// A atribuição vem de custodia.js — a mesma conta que vai para o recibo e para o lint: o
// agente descobre ANTES de escrever a ficha que a frase era ementa do STJ copiada no voto,
// ou o voto vencido, em vez de descobrir no build da peça.
import { norm1, faixasAlheias, RE_VOZ_PROPRIA, trechosCitados, coberturaCitada, RE_TESE_PROPRIA, ASPAS_SPAN_MAX } from "./custodia.js";
export { trechosCitados, coberturaCitada, ASPAS_SPAN_MAX };
import { recibo, cnj, dirRecibos } from "./lib.js";
import { reciboPorId, recibosDoProcesso, soDigitos } from "./recibos.js";
import { posicaoNoJulgado } from "./posicao.js";
import { RE_OBITER } from "./custodia.js";
export { posicaoNoJulgado };

export const PISO_TRECHO_PALAVRAS = 4, PISO_TRECHO_CHARS = 25, VAO_MAXIMO = 1500;
const W = "a-z0-9";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE_CORTE = /\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\)|…/;

// ALEGAÇÃO DA PARTE (v1.11.0, remedido). A versão portada do TRF1 disparava em ~20% das janelas da voz do próprio
// tribunal: bastava um "afirmar"/"requerida"/"argumento" nos 400 caracteres anteriores, e cada nome de parte
// ("requerida", "autor") valia como sujeito. Medida sobre 90 janelas rotuladas à mão (harness/medir-verificador.mjs):
// precisão de 33% e 58-64% de falso alarme. Agora é estrutural: um VERBO DE RELATO conjugado (sustenta, alega,
// aduz, defende, requer, pleiteia… e as formas em -ndo e no subjuntivo) com sujeito de parte nos 200 caracteres
// anteriores, OU no início de frase (o relatório diz "Alega que…", "No mérito, aduz que…" sem repetir o sujeito); o
// trecho vem a até 350 caracteres e a no máximo 2 frases do verbo; e nenhuma marca de voz do tribunal no meio
// ("contudo", "verifico", "homologo", "ora,", RE_VOZ_PROPRIA…). Substantivo ("a alegação", "o argumento") nunca conta.
const VERBO_RELATO = new RegExp(
  String.raw`(?<![a-z0-9])(?:sustent(?:a|am|ou|aram|ando)|alega(?:m|ram|ndo)?|alegou|aduz(?:em|iu|indo)?|defende(?:m|u|ram|ndo)?|afirma(?:m|ram|ndo)?|afirmou` +
    String.raw`|argument(?:a|am|ou|ando)|requer(?:em|eu|eram|endo)?|pleite(?:ia|iam|ou|aram|ando)|pugn(?:a|am|ou|ando)|invoc(?:a|am|ou|ando)` +
    String.raw`|insist(?:e|em|iu|indo)|impugn(?:a|am|ou|ando)|assever(?:a|am|ou|ando)|ressalt(?:a|am|ou)|enfatiz(?:a|am|ou)|reiter(?:a|am|ou)` +
    String.raw`|postul(?:a|am|ou)|narr(?:a|am|ou)|inform(?:a|am|ou)|disse|suscit(?:a|am|ou)|apont(?:a|am|ou)` +
    String.raw`|alegue|alegu?em|sustente|sustentem|defenda|defendam|afirme|argumente|pretend(?:a|e|em|eu)|pretendam|ped(?:e|em|iu|iram|indo)|propugn(?:a|am|ou|ando)|acrescent(?:a|am|ou|ando)|destac(?:a|am|ou|ando)|pondera(?:m|ram|ndo)?|ponderou|anota(?:m|ram|ndo)?|anotou|diz)(?![a-z0-9])`,
  "g"
);
const PARTE_NO_TEXTO =
  /(?<![a-z0-9])(?:apelantes?|apelad[oa]s?|agravantes?|agravad[oa]s?|recorrentes?|recorrid[oa]s?|embargantes?|embargad[oa]s?|autor(?:a|es|as)?|reus?|re|requerentes?|requerid[oa]s?|impetrantes?|impetrad[oa]s?|exequentes?|executad[oa]s?|partes?|banco|instituicao financeira|estado|municipio|uniao|ministerio publico|parquet|defensoria|procuradoria|arguentes?|arguid[oa]s?|reclamantes?|reclamad[oa]s?|seguradora|fundo|cessionari[oa]|devedor[a]?|credor[a]?|locatari[oa]|locador[a]?|consumidor[a]?)(?![a-z0-9])/;
const SUJEITO_EM_RAZOES = /(?<![a-z0-9])(?:(?:em|nas|suas) (?:suas )?razoes|contrarrazoes)(?![a-z0-9])/;
const VOZ_DO_TRIBUNAL =
  /(?<![a-z0-9])(?:contudo|todavia|entretanto|no entanto|ocorre que|porem|de fato|com efeito|sem razao|nao assiste|nao merece|nao prospera|improcede|conheco|constato|constatei|verifico|verifiquei|observo|observei|analisei|tenho que|consigno|cumpre|importante destacar|e importante|e certo|e sabido|como e sabido|ora,|logo,|assim,|portanto|dessa forma|neste caso|nesse caso|nesse cenario|nessa hipotese|no caso|a meu ver|na verdade|diante disso|nessa linha|revela|homologo|condeno|julgo|determino|arbitro|fixo|defiro|indefiro|nego|dou provimento|acolho|rejeito|declaro|reconheco|entendo|concluo|decido|passo a|tem-se|tem se|infere-se|conclui-se|depreende-se|extrai-se|verifica- ?se|constata- ?se|nota-se|observa- ?se|percebe-se|denota-se|ve-se|evidencia-se|trata-se|nao ha duvidas?|nao resta duvida|nao restam duvidas|compete ao|compete a|cabe ao|cabia ao|incumbe|incumbia|com razao|razao assiste|assiste razao)(?![a-z0-9])/;
export const ALEGACAO_DIST_MAX = 600, ALEGACAO_SUJEITO_JANELA = 200, ALEGACAO_CABECA = 0.4;
// v1.13.0 (2ª rodada cega, 160 trechos): o relato vale DENTRO DA FRASE. A frase que contém o grosso do trecho precisa
// trazer o verbo de relato (antes do trecho ou na cabeça dele: "Cacoal/RO. Requereram a declaração…"); frase nova sem
// verbo de relato é o tribunal ou narração ("Juntou cópia do contrato", "A norma invocada subordina…"). Não conta: verbo
// negado ("não narra nenhum prejuízo"), impessoal ("reitera-se"), oração concessiva em que o trecho é a principal
// ("Embora o banco sustente X, os documentos…"), adversativa entre o verbo e o trecho ("…, mas não demonstra"), e
// atribuição explícita dentro do próprio trecho ("que, segundo o apelado, tem…").
const ABREV = /(?:^|[^a-z0-9])(?:art|arts|n|no|nos|fl|fls|id|ids|des|desa|dr|dra|sr|sra|min|rel|inc|p|pp|pag|proc|cf|num|ex|exmo|exma|res|sum|ed|v|vol|cap|al|rr|c\/c|ss)$/;
const RE_ADVERSATIVA = /(?<![a-z0-9])(?:contudo|todavia|entretanto|no entanto|porem|mas(?! tambem))(?![a-z0-9])/;
const RE_CONCESSIVA = /(?<![a-z0-9])(?:embora|conquanto|ainda que|apesar de|em que pese|nao obstante|a despeito de|malgrado|se bem que)(?![a-z0-9])[^,.;]{0,90}$/;
// v1.14.0: "ao contrário do que sustenta o apelante, …" é o tribunal refutando — o verbo de relato não abre alegação
const RE_AO_CONTRARIO = /(?:ao contrario|diferentemente|diversamente|contrariamente)\s+(?:do|ao)\s+que\s+(?:[a-z]+\s+){0,2}$/;
const RE_ATRIB_EXPLICITA = /(?<![a-z0-9])(?:segundo|conforme|de acordo com|na visao d[eoa]|para)\s+(?:[oa]s?\s+)?(?:parte\s+)?(?:apelantes?|apelad[oa]s?|agravantes?|agravad[oa]s?|recorrentes?|recorrid[oa]s?|embargantes?|embargad[oa]s?|autor(?:a|es|as)?|reus?|requerentes?|requerid[oa]s?|banco|inicial|contestacao)(?![a-z0-9])/;

/** início (no texto) da frase que contém a posição `p`, olhando só para trás até `piso`. Usa o BRUTO: ponto + espaço +
 * maiúscula, descontadas as abreviações ("art. 5º", "Des. Fulano", "fls. 12"). */
function inicioDaFrase(bruto, tn, piso, p) {
  let ini = piso;
  const seg = bruto.slice(piso, p);
  for (const m of seg.matchAll(/[.;!?]["”’)\]]?\s+(?=["“‘(\[]?[A-ZÀ-Ý0-9])/g)) {
    if (m[0][0] === "." && ABREV.test(tn.slice(Math.max(piso, piso + m.index - 8), piso + m.index))) continue;
    ini = piso + m.index + m[0].length;
  }
  return ini;
}

/** O trecho [ini0, fim) (texto norm1; `bruto` com as mesmas posições) é tese que o acórdão relata como DE UMA PARTE? */
export function alegacaoDaParte(tn, ini0, fim = ini0 + 80, bruto = null) {
  const cabeca = ini0 + Math.floor((fim - ini0) * ALEGACAO_CABECA);
  const piso = Math.max(0, ini0 - ALEGACAO_DIST_MAX);
  const frase0 = inicioDaFrase(bruto || tn, tn, piso, cabeca);
  // frase que começa DENTRO do trecho ("…do CPC. Diante disso, requer o provimento…"): o verbo pode estar até o fim dele
  const ate = frase0 > ini0 ? fim : cabeca;
  const frase = tn.slice(frase0, ate);
  if (RE_ATRIB_EXPLICITA.test(tn.slice(ini0, fim))) return false;
  let fimVerbo = -1, explicitoNoTrecho = false;
  for (const m of frase.matchAll(VERBO_RELATO)) {
    const pos = frase0 + m.index, depois = tn.slice(pos + m[0].length, pos + m[0].length + 45);
    if (/^-se/.test(depois)) continue;                                              // "reitera-se", "alega-se"
    if (/(?:^|[^a-z0-9])(?:nao|nem|jamais|nunca)\s+(?:se\s+)?$/.test(tn.slice(Math.max(frase0, pos - 12), pos))) continue;   // "não narra"
    if (RE_AO_CONTRARIO.test(tn.slice(Math.max(frase0, pos - 30), pos))) continue;                                         // "ao contrário do que sustenta"
    const antes = tn.slice(Math.max(frase0, pos - ALEGACAO_SUJEITO_JANELA), pos);
    // verbo abrindo a frase, com até dois adjuntos curtos antes: "Alega,", "No mérito, aduz", "Ao final, com base nessa retórica, propugna"
    const noInicio = /^\s*(?:[a-z]+(?: [a-z]+){0,4},\s+){0,2}(?:[a-z]+\s+){0,2}$/.test(tn.slice(frase0, pos));
    const sujeito = PARTE_NO_TEXTO.test(antes) || SUJEITO_EM_RAZOES.test(antes) || PARTE_NO_TEXTO.test(depois.slice(0, 40).split(/[,.;]| que /)[0]);   // "Alega o agravante que…"
    if (m[0] === "diz" ? !noInicio : !sujeito && !noInicio) continue;
    fimVerbo = pos + m[0].length;
    explicitoNoTrecho = pos >= ini0 && PARTE_NO_TEXTO.test(tn.slice(ini0, pos));     // "o embargante insiste…" dentro do trecho
  }
  if (fimVerbo < 0 || explicitoNoTrecho) return false;
  const entre = tn.slice(fimVerbo, Math.max(fimVerbo, cabeca));
  if (RE_VOZ_PROPRIA.test(entre) || VOZ_DO_TRIBUNAL.test(entre)) return false;
  const adv = RE_ADVERSATIVA.exec(entre);
  // "não X, mas Y" é correlação dentro da própria alegação, não o tribunal respondendo
  if (adv && !(adv[0] === "mas" && /(?<![a-z0-9])nao(?![a-z0-9])[^.;]{0,70}$/.test(entre.slice(0, adv.index)))) return false;
  // concessiva antes do verbo + vírgula depois dele: o trecho é a oração principal, do tribunal
  const ateVerbo = tn.slice(frase0, fimVerbo);
  if (RE_CONCESSIVA.test(ateVerbo.slice(0, ateVerbo.length)) && tn.slice(fimVerbo, ini0).includes(",")) return false;
  return true;
}

// NEGAÇÃO (v1.12.0, remedida em gabarito cego e duplo: a regra herdada disparava com "inexistente", "negativo", "vedada"
// ou "improcedente" em qualquer ponto dos 60 caracteres anteriores, e com negação que só alcançava a 1ª palavra do
// trecho; precisão de 35%). Agora conta o ALCANCE: um operador de negação ou rejeição (não, jamais, nem, "não há que se
// falar", afasta-se, rejeito, julgou improcedente…; adjetivo solto não conta) a até 80 caracteres do trecho, sem quebra
// de oração entre ele e o trecho, e alcançando ao menos 3 palavras do trecho antes da 1ª quebra de oração dentro dele.
const RE_NEG_OPERADOR = /(?<![a-z0-9])(?:nao|jamais|nunca|nem|descabe|descabid[oa]s?|incabive(?:l|is)|afasta-se|afasto|afastad[oa]s?|rejeita-se|rejeito|rejeitad[oa]s?|nego|negou|negar|nega-se|negam|improcede|julg(?:ou|o|ar|aram|ada|ado|ados|adas)\s+improcedentes?|inexist(?:e|em|ir|iu|indo)|carece|carecem|impossibilidade de|sem razao|sem razoes)(?![a-z0-9])/g;
// v1.14.0: "não havendo/há/resta dúvida de que…" afirma, não nega (achado no porte ao STJ/TRT14)
const RE_NEG_FALSA = /^\s*(?:obstante|so\b|apenas|somente|se\s+confunde|fosse\b|(?:havendo|ha|houve|resta|restam|restando|pairam?)\s+(?:qualquer\s+|mais\s+)?duvidas?)/;
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
  const tr = tn.slice(ini0, fim);
  // trecho que começa pela conjunção "e" é oração nova; "é" (verbo) não — olha o caractere ORIGINAL, porque o norm1 dobra os dois
  // para "e" ("NÃO é devido" citado como "é devido…" passava sem alerta; achado no porte para o TRT14, 05/10/2026)
  if (/^\s*[eE][\s,]/.test(bruto !== null ? bruto.slice(ini0, fim) : tr)) return false;
  const q = tr.search(RE_QUEBRA_ORACAO);
  const alcance = (q < 0 ? tr : tr.slice(0, q)).trim().split(/\s+/).filter(Boolean).length;
  return alcance >= NEGACAO_ALCANCE_MIN;
}


// OBITER DICTUM? (v1.15.0): marca de raciocínio hipotético ou fundamento alternativo na MESMA frase do trecho, antes dele
// ou na cabeça dele ("Ainda que se admitisse X, …", "De todo modo, Y"). Devolve a marca, ou null.
export const OBITER_JANELA = 400, OBITER_CABECA = 0.4;
export function obiterAntes(tn, ini0, fim, bruto) {
  const cabeca = ini0 + Math.floor((fim - ini0) * OBITER_CABECA);
  const piso = Math.max(0, ini0 - OBITER_JANELA);
  const frase0 = inicioDaFrase(bruto, tn, piso, cabeca);
  let m = null;
  for (const x of tn.slice(frase0, cabeca).matchAll(RE_OBITER)) m = x;
  return m ? m[0] : null;
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

/** Confere `trecho` em `texto` (documento do TJRO do `tipo` dado). Posições em norm1 = posições no bruto. */
export function conferirTrecho(texto, trecho, tipo) {
  const frags = String(trecho || "").split(RE_CORTE).map((f) => f.trim()).filter(Boolean);
  if (!frags.length) return { ok: false, erro: "trecho vazio" };
  const util = norm1(frags.join(" ")).trim();
  const nPal = (util.match(new RegExp(`[${W}]+`, "g")) || []).length;
  if (nPal < PISO_TRECHO_PALAVRAS || util.length < PISO_TRECHO_CHARS)
    return { ok: false, erro: `trecho curto demais para conferência útil (mínimo ${PISO_TRECHO_PALAVRAS} palavras e ${PISO_TRECHO_CHARS} caracteres): qualquer acórdão contém isso` };
  const tn = norm1(String(texto || ""));
  let pos = 0, ini0 = null;
  const spans = [];
  for (const f of frags) {
    const palavras = norm1(f).match(new RegExp(`[${W}]+`, "g"));
    if (!palavras) return { ok: false, fragmento: f };
    const re = new RegExp(`(?<![${W}])` + palavras.map(esc).join(`[^${W}]+`) + `(?![${W}])`);
    const m = re.exec(tn.slice(pos));
    if (!m) return { ok: false, fragmento: f };
    const a = pos + m.index, b = a + m[0].length;
    if (spans.length && a - spans[spans.length - 1][1] > VAO_MAXIMO)
      return { ok: false, fragmento: f, erro: `o fragmento aparece, mas a ${a - spans[spans.length - 1][1]} caracteres do anterior (máximo ${VAO_MAXIMO}): \`[...]\` não pode costurar partes distantes do acórdão` };
    spans.push([a, b]);
    if (ini0 === null) ini0 = a;
    pos = b;
  }
  const alertas = [], notas = [];
  const fx = faixasAlheias(String(texto || ""), tipo);
  const emTranscricao = spans.some(([a, b]) => fx.transcritas.some(([x, y]) => sobrepoe(a, b, x, y)));
  const naCasa = !fx.ementaDaCasa && fx.casaIni < tn.length && spans.every(([a]) => a >= fx.casaIni);
  if (fx.ementaDaCasa) notas.push("VOZ DA CASA: o documento é a EMENTA do próprio julgado.");
  else if (naCasa) notas.push("VOZ DA CASA: o trecho está na ementa/fecho do próprio acórdão (parte que é palavra do TJRO, mesmo que o voto transcreva frase igual de outro julgado).");
  if (emTranscricao)
    alertas.push("TRANSCRIÇÃO: o trecho está dentro de bloco que o voto transcreve de OUTRO julgado/tribunal — não é palavra do TJRO neste processo. Se for citar, cite como o TJRO citando; melhor: pesquise o original.");
  // v1.14.0: conta a MAIORIA do trecho dentro da faixa (trecho que só encosta na fronteira — "…é como voto. DECLARAÇÃO DE
  // VOTO…" — não é o vencido), e o alerta já traz a proclamação do fecho, para o agente ler quem venceu sem reabrir o acórdão.
  if (fx.divergente && coberturaCitada([fx.divergente], ini0, pos) * 2 > pos - ini0)
    alertas.push("VOTO DIVERGENTE: o trecho está na parte do acórdão que pode ser o voto VENCIDO (pedido de vênia, voto-vista ou relator vencido). Leia o fecho (\"por maioria, vencido…\") antes de citar como entendimento do órgão." + proclamacao(String(texto || ""), fx.fecho));
  if (!emTranscricao && !naCasa && !fx.ementaDaCasa) {
    const cit = trechosCitados(String(texto || ""));
    const dentro = coberturaCitada(cit, ini0, pos);
    const abreCit = cit.find(([x, y]) => x <= ini0 + (pos - ini0) / 2 && y >= ini0);
    if (dentro * 2 > pos - ini0 && !(abreCit && RE_TESE_PROPRIA.test(tn.slice(Math.max(0, abreCit[0] - 80), abreCit[0]))))
      alertas.push("ENTRE ASPAS: o trecho parece estar dentro de aspas no acórdão — é o tribunal citando alguém (doutrina, lei, sentença, outro julgado). Confira de quem é a frase antes de atribuí-la ao TJRO.");
    if (alegacaoDaParte(tn, ini0, pos, String(texto || "")))
      alertas.push("ALEGAÇÃO DA PARTE: o texto relata o que uma parte (apelante, banco, Estado…) sustenta, alega ou requer logo antes do trecho — pode ser tese da parte, não decisão do tribunal. Confira no relatório/voto quem fala.");
  }
  if (negacaoAntes(tn, ini0, pos, String(texto || "")))
    alertas.push("NEGAÇÃO: há negativa logo antes do trecho — o recorte pode inverter o julgado. Não citar sem ler a frase inteira.");
  // v1.15.0: onde o trecho está (seção da ementa, relatório/fundamentação/dispositivo do voto) e marca de obiter
  const posicao = posicaoNoJulgado(String(texto || ""), tipo, ini0, pos, fx);
  if (posicao) notas.push(`POSIÇÃO NO JULGADO: ${posicao}.`);
  const ob = !emTranscricao && !naCasa && !fx.ementaDaCasa && !alertas.some((a) => a.startsWith("ENTRE ASPAS")) ? obiterAntes(tn, ini0, pos, String(texto || "")) : null;   // frase alheia entre aspas não é obiter do tribunal
  if (ob)
    alertas.push(`OBITER DICTUM?: o trecho vem sob «${ob}» — raciocínio hipotético ou fundamento alternativo; o resultado do julgado não dependeu dele. Vale como reforço, não como ratio decidendi; cite dizendo que é obiter.`);
  const contexto = String(texto || "").slice(Math.max(0, ini0 - 120), pos + 120).replace(/\s+/g, " ").trim();
  return { ok: true, alertas, notas, contexto, spans };
}

/** Recibos a partir de uma resposta do portal (mesmo formato de gravarRecibos), sem tocar no disco. */
export const recibosDeResposta = (data) => ((data?.hits?.hits) || []).map((h) => recibo(h._source || {})).filter(Boolean);

const RODAPE =
  `\nCobre o TEXTO INTEIRO de cada documento (ementa, relatório, voto, fecho) e diz DE QUEM é a frase: TRANSCRIÇÃO (ementa de outro tribunal/julgado copiada no voto), VOTO DIVERGENTE (pode ser o vencido), ENTRE ASPAS, ALEGAÇÃO DA PARTE, NEGAÇÃO e OBITER DICTUM? (raciocínio hipotético/alternativo). Trecho com alerta NÃO entra na ficha como posição do órgão sem resolver a atribuição. A nota POSIÇÃO NO JULGADO diz ONDE a frase está (seção da ementa do CNJ, relatório, fundamentação ou dispositivo do voto): é a evidência para \`ratio_ou_dictum\` da ficha, não a decisão. ` +
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
  const linhas = [];
  let algumOk = false;
  for (const d of docs) {
    const r = conferirTrecho(d.texto, trecho, d.tipo);
    let marca = r.ok ? "✅ LITERAL" : "❌ NÃO ENCONTRADO";
    if (r.ok && r.alertas.length) marca = "✅ LITERAL, MAS COM ALERTA DE ATRIBUIÇÃO";
    algumOk = algumOk || r.ok;
    const motivo = r.ok ? "trecho encontrado literalmente" : (r.erro || "trecho NÃO encontrado literalmente neste documento");
    linhas.push(`${marca} · id ${d.id_documento} · ${d.tipo || "?"} · ${cnj(d.nr_processo)} · julgado em ${d.data_julgamento || "?"} · ${motivo}`);
    for (const n of r.notas || []) linhas.push(`   ℹ️ ${n}`);
    for (const al of r.alertas || []) linhas.push(`   ⚠️ ${al}`);
    if (r.ok && r.contexto) linhas.push(`   contexto: …${r.contexto.slice(0, 320)}…`);
    if (!r.ok && r.fragmento) linhas.push(`   fragmento sem correspondência: «${String(r.fragmento).slice(0, 160)}»`);
    if (id && String(d.id_documento) === id && docs.length > 1) linhas.push("   (os demais documentos abaixo são do mesmo processo; a ficha cita pelo id que trouxe ✅)");
  }
  const cab = `**Verificação literal — ${id ? `id ${id}` : cnj(digitos)} (TJRO, ${docs.length} documento(s), fonte: ${origem})**`;
  const fecho = algumOk ? "" : "\n❌ Em nenhum documento: não cite entre aspas. Se o trecho veio de outra peça do mesmo número (ementa × acórdão × embargos), confira o id; se veio de memória, parafraseie ou abra o inteiro teor.";
  return [cab, ...linhas].join("\n") + fecho + RODAPE;
}
