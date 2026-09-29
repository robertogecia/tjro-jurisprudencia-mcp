// verificar_citacao_tjro (v1.10.0): a frase que vai entre aspas está LITERALMENTE no documento,
// e é palavra do TJRO? Mesmo contrato dos MCPs do TRF1, TRT14, TCE-RO, TJSE e OAB: comparação
// por palavra inteira, tolerante a caixa, acento e pontuação; mínimo de 4 palavras; `[...]`
// separa fragmentos que devem aparecer em ordem, a no máximo 1.500 caracteres um do outro.
// Lê primeiro o RECIBO local (zero requisição); sem recibo, o chamador busca o inteiro teor.
// A atribuição vem de custodia.js — a mesma conta que vai para o recibo e para o lint: o
// agente descobre ANTES de escrever a ficha que a frase era ementa do STJ copiada no voto,
// ou o voto vencido, em vez de descobrir no build da peça.
import { norm1, faixasAlheias, RE_VOZ_PROPRIA } from "./custodia.js";
import { recibo, cnj, dirRecibos } from "./lib.js";
import { reciboPorId, recibosDoProcesso, soDigitos } from "./recibos.js";

export const PISO_TRECHO_PALAVRAS = 4, PISO_TRECHO_CHARS = 25, VAO_MAXIMO = 1500;
const W = "a-z0-9";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE_CORTE = /\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\)|…/;

// Portados do verificador do TRF1 (v1.1.0), sobre texto norm1 (minúsculas, sem acento).
const RE_ALEGACAO = /\b(sustent\w+|aleg\w+|aduz\w*|argument\w+|pugn\w+|requer\w*|assever\w+|defende\w*|afirm\w+|em suas razoes|nas razoes|em contrarrazoes|irresignad\w+|insurg\w+)\b/g;
const RE_QUEM_ALEGA = /\b(apelante|apelad[oa]|agravante|agravad[oa]|recorrente|recorrid[oa]|embargante|embargad[oa]|autor[a]?|reu|re|requerente|requerid[oa]|impetrante|parte|banco|estado|municipio|ministerio publico|parquet|procuradoria|defensoria|executad[oa]|exequente)\b/;
const RE_NEGACAO = /\b(nao|jamais|nunca|inexist\w*|descab\w*|incabivel|incabiveis|inaplicav\w*|indevid\w*|afast\w*|improced\w*|nega\w*|rejeit\w*|sem\s+raz(?:ao|oes)|carece\w*|impossibilidade|vedad[oa]s?)\b[^.;:]{0,60}$/;
const RE_NEGACAO_FALSA = /\bnao\s+(obstante|so\b|apenas|somente|se\s+confunde)/;
const RE_TESE_PROPRIA = /\btese\s+(?:juridica\s+)?(?:fixada|firmada|proposta)\b|\bfixando a seguinte tese\b|\bseguinte tese\b/;

const sobrepoe = (a, b, x, y) => a < y && b > x;

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
  if (fx.divergente && spans.some(([a, b]) => sobrepoe(a, b, fx.divergente[0], fx.divergente[1])))
    alertas.push("VOTO DIVERGENTE: o trecho está na parte do acórdão que pode ser o voto VENCIDO (pedido de vênia, voto-vista ou relator vencido). Leia o fecho (\"por maioria, vencido…\") antes de citar como entendimento do órgão.");
  if (!emTranscricao && !naCasa && !fx.ementaDaCasa) {
    const antesQ = tn.slice(Math.max(0, ini0 - 1200), ini0);
    const depoisQ = tn.slice(pos, pos + 1200);
    const aspas = [...antesQ.matchAll(/(?<![a-z])'|'(?![a-z])/g)].map((m) => m.index);
    const abre = aspas.length ? aspas[aspas.length - 1] : 0;
    if (aspas.length % 2 === 1 && /'(?![a-z])/.test(depoisQ) && !RE_TESE_PROPRIA.test(antesQ.slice(Math.max(0, abre - 80), abre)))
      alertas.push("ENTRE ASPAS: o trecho parece estar dentro de aspas no acórdão — é o tribunal citando alguém (doutrina, lei, sentença, outro julgado). Confira de quem é a frase antes de atribuí-la ao TJRO.");
    const jan = tn.slice(Math.max(0, ini0 - 400), ini0);
    const alegs = [...jan.matchAll(RE_ALEGACAO)];
    const ult = alegs.length ? Math.max(...alegs.map((m) => m.index + m[0].length)) : -1;
    if (ult >= 0 && RE_QUEM_ALEGA.test(jan.slice(Math.max(0, ult - 160), ult + 160)) && !RE_VOZ_PROPRIA.test(jan.slice(ult)))
      alertas.push("ALEGAÇÃO DA PARTE: pouco antes do trecho o texto relata o que uma parte (apelante, banco, Estado…) sustenta/alega — pode ser tese da parte, não decisão do tribunal. Confira no relatório/voto quem fala.");
  }
  const antes = tn.slice(Math.max(0, ini0 - 90), ini0);
  if (RE_NEGACAO.test(antes) && !RE_NEGACAO_FALSA.test(antes.slice(-40)))
    alertas.push("NEGAÇÃO: há negativa logo antes do trecho — o recorte pode inverter o julgado. Não citar sem ler a frase inteira.");
  const contexto = String(texto || "").slice(Math.max(0, ini0 - 120), pos + 120).replace(/\s+/g, " ").trim();
  return { ok: true, alertas, notas, contexto, spans };
}

/** Recibos a partir de uma resposta do portal (mesmo formato de gravarRecibos), sem tocar no disco. */
export const recibosDeResposta = (data) => ((data?.hits?.hits) || []).map((h) => recibo(h._source || {})).filter(Boolean);

const RODAPE =
  `\nCobre o TEXTO INTEIRO de cada documento (ementa, relatório, voto, fecho) e diz DE QUEM é a frase: TRANSCRIÇÃO (ementa de outro tribunal/julgado copiada no voto), VOTO DIVERGENTE (pode ser o vencido), ENTRE ASPAS, ALEGAÇÃO DA PARTE e NEGAÇÃO. Trecho com alerta NÃO entra na ficha como posição do órgão sem resolver a atribuição. ` +
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
