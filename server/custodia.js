/**
 * O que NÃO é palavra do TJRO dentro de um documento do portal — para o recibo.
 *
 * O voto transcreve ementas inteiras de outros julgados (STJ, TJMG, e o próprio TJRO em
 * outro processo), e o documento ACÓRDÃO traz também os votos dos vogais, onde mora a
 * divergência. Um trecho copiado de lá está literalmente no inteiro teor: o lint de
 * citações da peça aprovava como palavra do TJRO. Agora o recibo leva
 * `trechos_transcritos` (lista) e `trecho_divergente` (string), no mesmo dialeto dos
 * MCPs do TJSE e do TRF1, recortados EM BRUTO do próprio `texto` — quem lê aplica a sua
 * normalização (red team do lint do TJSE, 21/09/2026, L1).
 *
 * Lógica portada de `mcp-tjse-jurisprudencia` (faixas_transcritas / faixa_divergente),
 * com as âncoras refeitas para o TJRO e medidas em harness/medir-custodia.mjs:
 *  - o documento ACÓRDÃO do PJe termina com a ementa DA CASA e o fecho ("acordam os
 *    Magistrados da … do Tribunal de Justiça do Estado de Rondônia"); essa cauda é voz do
 *    TJRO e nunca é marcada;
 *  - a atribuição que fecha uma transcrição segue o formato do JURIS ("(Apelação Cível,
 *    Processo nº …, Relator(a) do Acórdão: …, Data de julgamento: …)") ou dos repositórios
 *    comerciais ("(TJ-MG - AC: …, Relator: …)", "(REsp n. …, Rel. Min. …, julgado em …)");
 *  - a divergência aparece nos votos dos vogais ("DESEMBARGADOR FULANO Peço vênia para
 *    divergir…", "Acompanho a divergência").
 *
 * Todas as funções trabalham sobre um texto normalizado CARACTERE A CARACTERE (mesmo
 * comprimento do bruto), então a posição achada no normalizado é a posição no bruto —
 * sem a reconstrução aproximada que o TJSE precisa.
 */

/** Versão da heurística de custódia. SUBA sempre que a saída de camposAlheios ou de camposDeVoz (voz.js) mudar para algum texto: o recibo leva
 * este número em `custodia_v`, e o servidor refaz ao iniciar os recibos com número diferente ou ausente (antes, depois
 * de cada correção, os recibos já gravados ficavam com o resultado antigo até alguém rodar o recálculo à mão, e o lint
 * lia o campo gravado enquanto o verificador recalculava na hora). Um teste fixa o hash das saídas por versão.
 * 1 = v1.7.16 (sem carimbo) · 2 = v1.10.1 ("Ementa ID" e lista de precedentes do relator) · 3 = v1.13.0 (transcrição
 * declarada, cabeçalho fora, unanimidade e 1ª pessoa na divergência; medida às cegas). */
import { sinalDeRelatorVencido, RE_TERMOS_VOTO_DIVERGENTE } from "./vencido.js";
export const CUSTODIA_VERSAO = 7;   // v7 (1.42.0): voz própria cortada no RELATÓRIO/VOTO que vem DEPOIS do fecho no acórdão antigo (medido na cópia: 12 de 7.640 recibos mudam; fixtures iguais)
// v6 (1.41.9): fórmulas de relator vencido em vencido.js ("VENCIDO O VOTO DO RELATOR" marca o voto do relator; medido: 2 recibos mudam)
// v4 (1.16.0): trechos_obiter · v5 (1.41.9): trechos_alegacao_parte, trechos_doutrina e
// trechos_sentenca_transcrita (voz.js, camposCustodia = camposAlheios + camposDeVoz; é o que vai para o recibo)

/** Expande as ligaduras tipográficas (ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ) em letras: norm1 é 1 → 1 e guardava só a 1ª letra ("ﬁnanceira" → "fnanceira"),
 * e a frase literal saía "NÃO ENCONTRADO" (red team 22/10/2026; 1 dos 6.429 recibos locais tem "Indeﬁro"). */
export const expandirLigaduras = (s) => String(s ?? "").replace(/[\uFB00-\uFB06]/g, (c) => c.normalize("NFKC"));

const _cache = new Map();
/** minúsculas, sem acento, aspas e travessões unificados — 1 unidade UTF-16 → 1 unidade. */
export function norm1(s) {
  // 18/10/2026: `o += d` por caractere montava uma árvore de milhões de nós (cons-strings) por recibo: a 1ª leitura de 6.400
  // recibos (131 MB) pedia mais de 2 GB de heap e o RSS ficava em 3 GB, com só 340 MB vivos. Vetor + join: mesma saída, pico baixo.
  const out = new Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    let d = _cache.get(c);
    if (d === undefined) {
      if (/\s/.test(c)) d = " ";
      else if (/[“”‘’"`´]/.test(c)) d = "'";
      else if (/[–—]/.test(c)) d = "-";
      else {
        const x = c.normalize("NFKD").replace(/\p{Mn}/gu, "").toLowerCase();
        d = x.length === 1 ? x : x.length ? x[0] : " ";
      }
      _cache.set(c, d);
    }
    out[i] = d;
  }
  return out.join("");
}

// ------------------------------------------------------------------ atribuição ---
// Início do conteúdo de um parêntese que atribui o texto anterior a outro julgado.
const RE_INICIO_ATRIB = new RegExp(
  String.raw`^\s*(?:` +
    String.raw`(?:tj-?[a-z]{2}|tjro|stj|stf|tst|tse|trf-?\d?|trt-?\d*|tnu)\b` +
    String.raw`|(?:resp|aresp|eresp|agint|agrg|edcl|rms|re|are|hc|rhc|adi|adpf|ai|ac|aci|apl|apel|ap|rcl|ms|ag|agr)\b` +
    String.raw`|(?:apelacao|agravo|embargos|recurso|reclamacao|incidente|mandado|acao|conflito|habeas)\b` +
    String.raw`|\d+a\s*t(?:urma)?\b|relator` +
  String.raw`)`);
const RE_TEM_JULGAMENTO = /\b(?:rel\b|rel\.|rela|relator|relatora|relatoria|julgad|julg\.|julgamento|j\.|dje?n?\b|dj\b|publicad|publicacao)/;
// "STJ - REsp 1.234/SP, Rel. …" sem parênteses (formato de alguns repositórios)
// v1.34.0: citação no formato do PJe, sem parênteses ("…Processo nº 7007178-54.2017.8.22.0014, 2ª Câmara Cível…, Relator(a) do
// Acórdão: FULANO Data de julgamento: 10/06/2021."). Sem ela, o bloco da ementa transcrita não tinha fim e o seguinte o
// atravessava, marcando como transcrição a voz do relator (relato de uso de 13/10/2026, id 26358276).
const RE_ATRIB_PJE = /\bprocesso\s+n\S{0,2}\s*\d{7}-\d{2}\s?\.\s?\d{4}\s?\.\s?(?:\d\.\d{2}|\d{3})\s?\.\s?\d{4}[^]{0,300}?\bdata de julgamento:?\s*\d{1,2}\/\d{1,2}\/\d{4}\.?/g;
// Leva B (red team 22/10/2026): o número oficial do STJ tem ponto de milhar ("STJ - REsp 1.578.553/SP, Rel. Min.") e "[^.]" parava
// nele — a atribuição não era vista e a ementa do STJ saía como voz do relator do TJRO. Agora o ponto seguido de dígito passa,
// "AgInt no REsp" / "EDcl nos EDcl no AREsp" entram entre a sigla e a classe, e ":" também separa.
const RE_ATRIB_SOLTA = /\b(?:tj-?[a-z]{2}|tjro|stj|stf)\s*[-,:]\s*(?:(?:agint|agrg|edcl)\s+n[oa]s?\s+(?:(?:agint|agrg|edcl)\s+n[oa]s?\s+)?)?(?:resp|aresp|agint|agrg|edcl|re|are|hc|rhc|apelacao|ac|ai)\b(?:[^.\n]|\.(?=\d)){0,200}\brel\b/g;

const RE_ATRIB_SOLTA_ANTIGA = /\b(?:tj-?[a-z]{2}|tjro|stj|stf)\s*[-,]\s*(?:resp|aresp|agint|agrg|edcl|re|are|hc|rhc|apelacao|ac|ai)\b[^.\n]{0,200}\brel\b/;
const RE_LISTA_CNJ = /\bjurisprudencia relevante citada\b/, LISTA_CNJ_MAX = 1500;

// Leva B: a referência solta ("STJ - REsp 1.578.553/SP, Rel. Min. Fulano, 3ª Turma, j. 10/10/2020.") terminava no 1º ". " — o de
// "Rel." —, e o resto da referência ("Min. Fulano, …, nov./2025.") ficava fora: a frase seguinte do relator ("Portanto, …") não
// era vista como retomada. O fim agora é a DATA da referência (julgamento/DJe, encadeadas a até 40 caracteres), procurada antes
// do 1º ". " que não fecha abreviatura, da 1ª aspa e de 300 caracteres; sem data, fica como antes. Ir até o ". " seguinte
// engolia a fala do relator quando a referência não termina em ponto ("…DJ 22/02/2022, altero, de ofício, a sentença…").
const ABREVIATURAS = new Set(["rel", "min", "des", "desa", "desemb", "dr", "dra", "n", "no", "nos", "j", "p", "art", "arts", "fl", "fls", "ex", "sr", "sra",
  "conv", "ac", "ap", "t", "v", "u", "pub", "publ", "julg", "cf", "c", "ed", "ob", "op", "cit", "pag", "pg", "proc", "inc", "par", "al", "red", "rela", "ministro", "ministra"]);
const RE_DATA_REF = /(?<![0-9])(?:\d{1,2}o?[./-]\d{1,2}[./-]\d{2,4}|(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\/\d{4})(?![0-9])/g;
function fimDaReferencia(tn, de, ate) {
  let lim = Math.min(ate, de + 300, tn.length);
  for (let k = tn.indexOf(". ", de); k >= 0 && k < lim; k = tn.indexOf(". ", k + 2)) {
    const w = /(?<![a-z0-9])([a-z]+)$/.exec(tn.slice(Math.max(0, k - 12), k));
    if (!w || !ABREVIATURAS.has(w[1])) { lim = k + 1; break; }
  }
  const aspa = tn.indexOf("'", de);
  if (aspa >= 0 && aspa < lim) lim = aspa;
  const r = new RegExp(RE_DATA_REF.source, "g");
  r.lastIndex = de;
  let fim = -1;
  for (let m; (m = r.exec(tn)) && m.index < lim;) {
    if (fim >= 0 && m.index - fim > 40) break;
    fim = m.index + m[0].length;
  }
  if (fim < 0) return -1;
  return tn[fim] === "." ? fim : fim - 1;   // devolve a posição do último caractere da referência
}

/** Parênteses de atribuição em [ini, fim): [[início, fim-exclusivo], …] em ordem. */
export function atribuicoes(tn, ini = 0, fim = tn.length) {
  const out = [];
  for (let a = tn.indexOf("(", ini); a >= 0 && a < fim; a = tn.indexOf("(", a + 1)) {
    let prof = 0, b = -1;
    for (let k = a; k < Math.min(fim, a + 700); k++) {   // aninhados: "Relator(a) do Acórdão", "Des.(a)"
      if (tn[k] === "(") prof++;
      else if (tn[k] === ")" && --prof === 0) { b = k + 1; break; }
    }
    if (b < 0) continue;
    const c = tn.slice(a + 1, b - 1);
    if (c.length < 12 || !/\d/.test(c) || !RE_INICIO_ATRIB.test(c) || !RE_TEM_JULGAMENTO.test(c)) continue;
    out.push([a, b]);
    a = b - 1;
  }
  const r = new RegExp(RE_ATRIB_SOLTA.source, "g");
  r.lastIndex = ini;
  for (let m; (m = r.exec(tn)) && m.index < fim;) {
    if (out.some(([x, y]) => m.index >= x && m.index < y)) continue;
    // item da lista "Jurisprudência relevante citada:" do modelo CNJ de ementa (a da casa ou a transcrita): é referência, não
    // atribuição de bloco — com o ponto de milhar aceito (leva B), a ementa da PRÓPRIA casa passava a sair como transcrição
    // (só para o que a forma ANTIGA não pegava: o que ela já marcava continua igual)
    const antiga = new RegExp(RE_ATRIB_SOLTA_ANTIGA.source, "y");
    antiga.lastIndex = m.index;
    if (!antiga.test(tn) && RE_LISTA_CNJ.test(tn.slice(Math.max(0, m.index - LISTA_CNJ_MAX), m.index))) { r.lastIndex = m.index + 1; continue; }
    let pt = fimDaReferencia(tn, m.index + m[0].length, m.index + 400);
    if (pt < 0) { pt = tn.indexOf(". ", m.index + m[0].length); if (pt - m.index >= 400) pt = -1; }
    out.push([m.index, pt >= 0 ? pt + 1 : m.index + m[0].length]);
  }
  const rp = new RegExp(RE_ATRIB_PJE.source, "g");
  rp.lastIndex = ini;
  for (let m; (m = rp.exec(tn)) && m.index < fim;) {
    if (out.some(([x, y]) => m.index < y && m.index + m[0].length > x)) continue;
    out.push([m.index, m.index + m[0].length]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

// ------------------------------------------------------------ faixas transcritas ---
// Onde começa um bloco transcrito. A posição que conta é o FIM do marcador: o texto
// que vem depois é do outro julgado.
const RE_ABRE_BLOCO = new RegExp(
  String.raw`\bementa\s*[:.-]|\bementa\b(?=\s+(?!id\b)[a-z])|(?<!relator\(a\) do )(?<!relator \(a\) do )(?<!relatora do )(?<!relator do )(?<!relator para o )(?<!relatora para o )(?<!relator\(a\) para o )\bacordao\s*:|\bsumula\s+(?:vinculante\s+)?n?\.?\s*\d+\s*[:-]` +
  String.raw`|\b(?:transcrevo|in verbis|verbis|litteris|nos seguintes termos|assim (?:decidiu|se manifestou|ementado))\b\s*:?` +
  String.raw`|\b(?:vejamos|veja-se|confira-se|elucida-se|observe-se|transcreve-se|destaco|assim ementad[oa]|confiram-se|colaciono|colaciona-se|cito|cita-se|a saber|a proposito|exemplificativamente` +
  String.raw`|seguintes?(?: teor| julgados?| precedentes?| ementas?| termos)?|nesse sentido|neste sentido|nessa linha|na mesma linha` +
  String.raw`|nessa esteira|nesse diapasao|precedentes?(?: desta corte| deste tribunal| do stj)?|julgados?|jurisprudencia|decidiu|decidido)\s*:`,
  "g");
// Marcas de que o texto voltou a ser do relator — um bloco não atravessa uma delas.
export const RE_VOZ_PROPRIA = /\b(?:nesse sentido|neste sentido|com efeito|no caso dos autos|no caso em tela|no caso concreto|in casu|na hipotese dos autos|na especie|entendo|ante o exposto|diante do exposto|pelo exposto|isso posto|e como voto|e o voto|voto por|voto pelo|passo a|compulsando|assim sendo|dessa forma|desta forma|rejeito|nao vejo|submeto aos pares|como se sabe|como foi narrado|nesse contexto)\b|\b[ivx]{1,4}\s*[-.)]\s*d[aeo]s?\s+(?:merito|preliminar|recurso|apelacao|dano|pedido)/;
// As fracas também aparecem DENTRO de ementa ("In casu, ante a inexistência…", "o que se verifica no caso
// concreto"): toleradas quando a abertura é seguida de cabeçalho de ementa e o bloco é curto.
const RE_VOZ_FORTE = /\b(?:e como voto|e o voto|voto por|voto pelo|passo a|compulsando|nesse sentido|neste sentido)\b/;
const TOLERA_FRACA = 4000;
const RE_CARA_DE_EMENTA = /\brecurso\s+(?:\w+\s+){0,3}(?:conhecido|provido|desprovido|improvido|nao provido)\b|\btese de julgamento\b|\bcaso em exame\b|\bquestao em discussao\b|\bdispositivos? relevantes?\b|\bsentenca (?:mantida|reformada)\b|\bapelacao\s+(?:civel\s+)?(?:conhecida|provida|desprovida)\b/;
// Leva B: o relator retoma a palavra logo depois da atribuição ("— STJ, REsp 2.228.094, Rel. Min. X, nov./2025. Portanto, enquanto
// não houver…"): o trecho até a atribuição seguinte é dele, não uma 2ª ementa em sequência.
const RE_RETOMA_RELATOR = /^[\s.,;)'"-]*(?:portanto|logo|assim|desse modo|destarte)\b/;
export const ENCADEIA_MAX = 1200, ABERTURA_MAX = 9000, RECUO = 300;

// ": " seguido de cabeçalho de ementa — "…desta Corte: APELAÇÃO CÍVEL. AÇÃO DECLARATÓRIA…" ou
// "…julgado desta Corte: Apelação cível. Empréstimo consignado." (o JURIS grava a ementa do TJRO em caixa baixa)
const TERMOS_EMENTA = String.raw`(?:ementa|apelac\w*|agravo|embargos|recurso|reclamac\w*|direito|processual|processo civil|civil|consumidor|mandado|ac[aã]o|habeas|responsabilidade|contrato|dano|indeniza\w*|revis[aã]o|execu\w*|tutela|cumprimento)`;
// caixa alta só conta se trouxer vocabulário de ementa — "ADVOGADOS DO AGRAVANTE: FULANO DE TAL" não é ementa
const RE_CABECALHO_EMENTA = new RegExp(String.raw`^\s*['(]?\s*(?:(?:tjro|stj|stf|tj-?[a-z]{2})\s*[-.,]\s*)?(?:` + TERMOS_EMENTA + String.raw`\b[^.]{0,80}\.\s)`, "i");

// Parêntese com 2+ julgados indicados pelo relator ("Rel." / "Relator") — lista de precedentes, não ementa transcrita.
const RE_REL_NO_PARENTESE = /\brel\b|\brel\.|\brelator/g;
function listaDeJulgados(par) {
  return (par.match(RE_REL_NO_PARENTESE) || []).length >= 2 && par.includes(";");
}

function aberturas(tn, de, ate, bruto) {
  const r = new RegExp(RE_ABRE_BLOCO.source, "g");
  r.lastIndex = de;
  const out = [];
  for (let m; (m = r.exec(tn)) && m.index < ate;) out.push(m.index + m[0].length);
  if (bruto)
    for (let k = tn.indexOf(": ", de); k >= 0 && k < ate; k = tn.indexOf(": ", k + 2)) {
      const seg = bruto.slice(k + 1, k + 120);
      if (RE_CABECALHO_EMENTA.test(norm1(seg))) out.push(k + 1);
    }
  return [...new Set(out)].sort((x, y) => x - y);
}

/** Faixas [ini, fim) do texto que são palavra de outro julgado. Alerta por PERTENCIMENTO. */
export function faixasTranscritas(tn, inicio = 0, fim = tn.length, bruto = null) {
  const faixas = [];
  let piso = inicio;
  for (const [a, b] of atribuicoes(tn, inicio, fim)) {
    if (a < piso) continue;
    const abre = aberturas(tn, Math.max(piso, a - ABERTURA_MAX), a, bruto);
    const intervalo = tn.slice(piso, a);
    let ini;
    // aspas que fecham logo antes do parêntese: "…tese…" (REsp …)
    const fechaAspas = /'[\s.,;]*$/.test(tn.slice(Math.max(piso, a - 4), a)) ? tn.lastIndexOf("'", a - 1) : -1;
    const q = fechaAspas > piso ? tn.lastIndexOf("'", fechaAspas - 1) : -1;
    if (abre.length) {
      // a abertura mais distante cujo trecho até a atribuição não tenha voz do relator; senão, a última
      const limpa = abre.find((x) => !RE_VOZ_PROPRIA.test(tn.slice(x, a)));
      const tolerada = abre.find((x) => a - x <= TOLERA_FRACA && RE_CABECALHO_EMENTA.test(tn.slice(x, x + 120)) &&
        !RE_VOZ_FORTE.test(tn.slice(x, a)));
      ini = Math.min(limpa ?? Infinity, tolerada ?? Infinity);
      if (ini === Infinity) ini = abre[abre.length - 1];
    } else if (faixas.length && !RE_VOZ_PROPRIA.test(intervalo) && !RE_RETOMA_RELATOR.test(intervalo) &&
      (intervalo.length < ENCADEIA_MAX || (intervalo.length < 6000 && RE_CARA_DE_EMENTA.test(intervalo)))) {
      ini = piso;   // ementas em sequência, sem o relator falar entre elas
    } else if (q >= piso && a - q < 3000) {
      ini = q;
    } else if (listaDeJulgados(tn.slice(a, b))) {
      // v1.10.1: "…tem reiteradamente decidido que X (Ap. nº A, Rel. …, j. …; Ap. nº B, Rel. …, j. …)" — vários
      // julgados no mesmo parêntese são o relator ARROLANDO precedentes em apoio da frase dele, não transcrevendo
      // um deles. Só o parêntese é de outros; a frase que o antecede é voz do tribunal.
      ini = a;
    } else {
      // sem abertura: só a frase em que está o parêntese — a anterior pode ser do relator
      // ("A caução deve… Essa compreensão é compatível com a jurisprudência do STJ (AgRg …)")
      const pt = tn.lastIndexOf(". ", a - 2);
      ini = Math.max(piso, pt >= 0 && a - pt <= RECUO ? pt + 2 : a - RECUO);
    }
    faixas.push([ini, b]);
    piso = b;
  }
  return faixas;
}

// ------------------------------------------------------- transcrição declarada ---
// v1.13.0 (custódia v3): o relator ANUNCIA que vai copiar a sentença, a decisão recorrida ou o acórdão embargado
// ("cuja parte dispositiva transcrevo:", "peço vênia para transcrever trecho da sentença:", "nos seguintes termos:") e o
// bloco vem sem aspas e sem parêntese de atribuição — a custódia por atribuição não vê o fim, e não há aspas para parear.
// Começa depois dos dois-pontos do anúncio e termina quando o texto volta a falar como 2º grau: vocabulário que a peça
// copiada (sentença) não usa — apelante, embargante, "a sentença", "juízo a quo", "É o relatório", cabeçalho VOTO… Sem
// retorno identificado em DECLARADA_MAX caracteres, não marca nada (melhor calar que marcar o voto inteiro).
const RE_ANUNCIO = /(?:\btranscrev(?:o|e-se|emos|er|endo)(?:-[ao]s?)?\b[^.:;]{0,70}|\b(?:sentenca|decisao|dispositivo|fundamentos?|acordao)\b[^.:;]{0,140}\b(?:nos seguintes termos|in verbis|verbis|litteris|assim (?:decidiu|fundamentou|consignou|dispos))[^.:;]{0,20}):/g;
const RE_RETORNO = /(?<![a-z0-9])(?:apelantes?|apelad[oa]s?|agravantes?|agravad[oa]s?|embargantes?|embargad[oa]s?|irresignad[oa]s?|inconformad[oa]s?|em suas razoes|e o relatorio|e como voto|a sentenca|r\. sentenca|sentenca recorrida|sentenca proferida|juizo a quo|juiz a quo|magistrado sentenciante|decisao agravada|decisao recorrida|acordao embargado|acordao recorrido|o acordao|pois bem|como se ve|como visto|da leitura d|extrai-se d|depreende-se d)(?![a-z0-9])/g;
// dois-pontos seguidos de marca de supressão ("transcrevo-a na íntegra: [...]", "nos seguintes termos: (...)"): quem
// abre com "[...]" está copiando. No texto norm1 a reticência "…" vira um ponto só.
const RE_ANUNCIO_ELISAO = /:\s*(?:\[\s*\.(?:\s*\.){0,2}\s*\]|\(\s*\.(?:\s*\.){0,2}\s*\))/g;
export const DECLARADA_MAX = 9000, DECLARADA_MIN = 200;
const RE_CAB_UM = /\b(?:VOTO|EMENTA|AC[ÓO]RD[ÃA]O)\b\s+[A-ZÀ-Ý]/;

/** Faixas [ini, fim) de blocos que o relator anuncia transcrever (sentença, decisão, acórdão anterior). */
export function faixasDeclaradas(tn, bruto, inicio = 0, fim = tn.length) {
  const out = [], inicios = [];
  for (const fonte of [RE_ANUNCIO, RE_ANUNCIO_ELISAO]) {
    const r = new RegExp(fonte.source, "g");
    r.lastIndex = inicio;
    for (let m; (m = r.exec(tn)) && m.index < fim;) inicios.push(m.index + m[0].length);
  }
  inicios.sort((x, y) => x - y);
  // Leva B (red team 22/10/2026): cada anúncio varria o texto até o FIM atrás do vocabulário de retorno; com centenas de
  // anúncios e nenhum retorno, o custo era quadrático (13 s em 816 KB, síncrono). A 1ª ocorrência a partir de uma posição é a
  // mesma para qualquer posição entre a anterior e ela: guarda-se a última achada (ou "nenhuma") e só se busca de novo além dela.
  const rr = new RegExp(RE_RETORNO.source, "g");
  const proxima = (re, txt) => {
    let de = -1, m = null;
    return (p) => {
      if (de >= 0 && p >= de && (m === null || p <= m.index)) return m;
      re.lastIndex = p; m = re.exec(txt); de = p;
      return m;
    };
  };
  const retorno = proxima(rr, tn);
  for (const ini of inicios) {
    if (out.length && ini < out[out.length - 1][1]) continue;
    const limite = Math.min(fim, ini + DECLARADA_MAX);
    // o retorno conta a partir do INÍCIO DA FRASE em que o vocabulário de 2º grau aparece
    let fimBloco = -1;
    const mr = retorno(ini + 40);
    if (mr && mr.index < limite) {
      const pt = Math.max(tn.lastIndexOf(". ", mr.index), tn.lastIndexOf("] ", mr.index), tn.lastIndexOf(") ", mr.index));
      fimBloco = pt > ini ? pt + 1 : mr.index;
    }
    // \b no início da fatia (bruto.slice) vale como fronteira: a busca é na fatia, como antes — limitada a DECLARADA_MAX
    const cab = bruto.slice(ini, limite).search(RE_CAB_UM);
    if (cab >= 0 && (fimBloco < 0 || ini + cab < fimBloco)) fimBloco = ini + cab;
    if (fimBloco < 0 || fimBloco - ini < DECLARADA_MIN) continue;
    out.push([ini, fimBloco]);
  }
  return out;
}

/** União de listas de faixas, ordenada e sem sobreposição. */
export function unirFaixas(...listas) {
  const todas = listas.flat().filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of todas) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

// ------------------------------------------------------------------- divergência ---
const RE_DIVERGENCIA = /\b(?:peco|pedi[dn]o\s+de?|com a devida|com a maxima|data)\s+venia\b[^.]{0,120}\b(?:diverg|discord)|\bdivirjo\b|\bouso\s+divergir\b|\bvoto\s+(?:vencido|divergente)\b|\bvoto[- ]vista\b|\b(?:acompanho|acompanhando|sigo|seguindo)\s+a\s+divergencia\b|\binaugur\w*\s+(?:a\s+)?divergencia\b|\babr\w*\s+(?:a\s+)?divergencia\b|\bdivergencia\s+inaugurada\b|\brelator(?:a)?\s+vencid[oa]\b|\bvencid[oa]s?\s+(?:o|a|os|as)\s+(?:relator|relatora|desembargador|desembargadora|juiz|juiza)/;
// cabeçalho do voto de vogal no documento ACÓRDÃO: "DESEMBARGADOR RADUAN MIGUEL FILHO De acordo."
const RE_VOGAL = /\b(?:DESEMBARGADORA?|JU[IÍ]ZA?(?: CONVOCAD[OA])?)\s+[A-ZÀ-Ý][A-ZÀ-Ý.' ]{3,60}?(?=\s+[A-ZÀ-Ý]?[a-zà-ÿ])/g;
const RE_FIM_VOTO_RELATOR = /\be (?:como|o) (?:voto|meu voto)\b/;

/** [ini, fim) da parte do documento que pode ser voto VENCIDO, ou null. */
// Só as marcas em 1ª pessoa (quem fala está divergindo AGORA). As demais de RE_DIVERGENCIA são substantivos ("voto
// divergente", "voto-vista", "relator vencido") que também aparecem quando o relator só MENCIONA um voto de outro
// processo: valem apenas quando o fecho confirma julgamento por maioria (v1.13.0).
const RE_DIVERGENCIA_1A_PESSOA = /\b(?:peco|pedi[dn]o\s+de?|com a devida|com a maxima|data)\s+venia\b[^.]{0,120}\b(?:diverg|discord)|\bdivirjo\b|\bouso\s+divergir\b|\b(?:acompanho|acompanhando|sigo|seguindo)\s+a\s+divergencia\b|\binaugur(?:o|ando)\s+(?:a\s+)?divergencia\b|\babr(?:o|indo)\s+(?:a\s+)?divergencia\b/;

export function faixaDivergente(tn, bruto, inicio = 0, fim = tn.length, transcritas = [], so1aPessoa = false) {
  const r0 = new RegExp((so1aPessoa ? RE_DIVERGENCIA_1A_PESSOA : RE_DIVERGENCIA).source, "g");
  let ini = -1;
  for (let m; (m = r0.exec(tn.slice(0, fim)));) {
    if (m.index < inicio) { r0.lastIndex = inicio; continue; }
    // o relator citando a declaração de voto de OUTRO processo ("“Com a devida vênia ao voto divergente…”")
    // ou uma ementa transcrita não é divergência neste julgamento
    if (/'\s*$/.test(tn.slice(Math.max(0, m.index - 4), m.index))) continue;
    if (transcritas.some(([a, b]) => m.index >= a && m.index < b)) continue;
    ini = m.index;
    break;
  }
  // "DECLARAÇÃO DE VOTO" só como cabeçalho (caixa alta): "cito trecho de declaração de voto do processo…" é o
  // relator citando outro julgamento
  const dv = /\bDECLARA[ÇC][ÃA]O DE VOTO\b/g;
  dv.lastIndex = inicio;
  for (let m; !so1aPessoa && (m = dv.exec(bruto)) && m.index < fim;)
    if (!transcritas.some(([a, b]) => m.index >= a && m.index < b)) { if (ini < 0 || m.index < ini) ini = m.index; break; }
  if (ini < 0) return null;
  // "Acompanho a divergência" é do 3º a votar; o voto divergente é o do vogal anterior.
  // Recua até o primeiro vogal depois do "É como voto." do relator.
  const fr = RE_FIM_VOTO_RELATOR.exec(tn.slice(inicio, ini));
  if (fr) {
    const r = new RegExp(RE_VOGAL.source, "g");
    r.lastIndex = inicio + fr.index;
    const v = r.exec(bruto);
    if (v && v.index < ini) ini = v.index;
  }
  return [ini, fim];
}

// ------------------------------------------------------------- cauda da casa ---
// dispositivo em 1ª pessoa: só o voto o tem — a ementa da casa diz "Recurso desprovido", nunca "nego provimento"
// Rodada 3 tentou mais fórmulas de fecho ("Em razão do exposto", "Por tais fundamentos") e conector curto ("Assim, dou
// provimento", "Portanto, conheço"), com filtro do item "IV. Dispositivo" da ementa CNJ; foi revertida na rodada final
// (22/10/2026): a ementa da casa usa esses conectores e passava a ser descartada à toa. Fica a lista da rodada 2.
const RE_DISPOSITIVO_1A_PESSOA = /\b(?:ante o exposto|diante do exposto|pelo exposto|em face do exposto|posto isso|isto posto|por essas razoes|por tais razoes|com essas consideracoes)\b,?[^.]{0,80}?\b(?:nego|dou|conheco|rejeito|acolho|julgo|voto)\b/;

/** {ini, fecho} do documento ACÓRDÃO: `ini` é onde começa a cauda que é voz do próprio TJRO (ementa + fecho);
 * sem fecho, os dois valem o fim do texto. */
export function vozDaCasa(tn, bruto) {
  let fecho = -1;
  for (const m of tn.matchAll(/\bacordam\b/g))
    if (/rondonia/.test(tn.slice(m.index, m.index + 400))) fecho = m.index;
  if (fecho < 0) return { ini: tn.length, fecho: tn.length };
  let em = -1;
  // 1.16.0: também "Ementa :" em caixa mista (achado na medição cega da POSIÇÃO: a ementa da casa virava fim do voto)
  for (const m of bruto.slice(0, fecho).matchAll(/\bEMENTA\b|\bEmenta[ \t]*:/g)) {
    // red team 22/10/2026: rótulo anunciado pelo voto ("conforme a seguinte ementa:", "assim ementado:") é de julgado transcrito
    if (/\b(?:seguinte|assim|cuja|com a|na|da)\s+ementa\b|\bementad[oa]\b/.test(tn.slice(Math.max(0, m.index - 150), m.index))) continue;
    em = m.index;
  }
  // red team 22/10/2026 (rodada 2): o rótulo EMENTA só é descartado com INDÍCIO de que está dentro de um voto — ele vem
  // depois do cabeçalho VOTO e uma fórmula que só voto tem COMEÇA depois dele ("É como voto", "Ante o exposto, nego
  // provimento"). A 1ª rodada usava o FIM do último voto ("Acompanho…" sem ponto atravessava o rótulo; "de acordo." do
  // texto da ementa — "impossibilidade de acordo." — jogava a voz da casa para o meio dela) e descartava a ementa
  // posta no ALTO do documento: 74 de 3.840 acórdãos reais pioraram.
  let descartado = false;
  if (em >= 0 && fecho - em < 20000) {
    // cabeçalho RELATÓRIO/VOTO em qualquer caixa ("Relatório", "Voto"): a ementa posta no ALTO, antes deles, é a da casa
    const cabVoto = tn.search(/\b(?:relatorio|voto)\b/);
    const depois = tn.slice(em, fecho);
    const fimRel = depois.search(/\be como (?:voto|meu voto)\b|\be o (?:voto|meu voto)\./);
    const disp = depois.search(RE_DISPOSITIVO_1A_PESSOA);
    if (!(cabVoto >= 0 && cabVoto < em && (fimRel >= 0 || disp >= 0))) return { ini: em, fecho };
    descartado = true;
  }
  // sem o rótulo EMENTA (formato da Res. CNJ 2023, que começa direto no cabeçalho em caixa alta), ou com o rótulo
  // dentro de um voto: a ementa da casa começa logo depois do último voto — "É como voto." do relator,
  // "Acompanho…"/"De acordo." do último vogal ou o dispositivo em 1ª pessoa do relator
  let fimVotos = -1;
  for (const m of tn.slice(0, fecho).matchAll(/\be como (?:voto|meu voto)\b\.?|\be o (?:voto|meu voto)\.|\bacompanho\b[^.]{0,120}\.|\bde acordo\.|\bcom (?:o|a) (?:relator|relatora|divergencia)\./g))
    fimVotos = m.index + m[0].length;
  if (descartado) {
    // dispositivo do relator sem "É como voto" ("Ante o exposto, nego provimento ao recurso."): o voto acaba no ponto
    const rd = new RegExp(RE_DISPOSITIVO_1A_PESSOA.source, "g");
    rd.lastIndex = em;
    let ult = -1;
    for (let m; (m = rd.exec(tn)) && m.index < fecho;) ult = m.index + m[0].length;
    if (ult > fimVotos) {
      const ponto = tn.indexOf(". ", ult);
      fimVotos = ponto >= 0 && ponto < fecho ? ponto + 1 : fimVotos;
    }
  }
  return { ini: fimVotos >= 0 && fecho - fimVotos < 20000 ? fimVotos : fecho, fecho };
}

// "POR MAIORIA, VENCIDO O RELATOR", "VENCIDOS A RELATORA E O DESEMBARGADOR…", "NOS TERMOS DO VOTO DIVERGENTE…,
// LAVRARÁ O ACÓRDÃO": quem perdeu foi o RELATOR — o voto dele, que vem primeiro, é o vencido. Em 3 dos 5
// acórdãos com divergência dos recibos medidos (23/09/2026) foi assim.
// 1.41.9: as fórmulas moram em vencido.js (fonte única com a auditoria); aqui vale qualquer sinal, inclusive "vencido em parte".

const RE_UNANIME = /\bunanimidade\b|\bunanime\b|\bunanimemente\b/;
const RE_MAIORIA = /\bmaioria\b|\bvencid[oa]s?\b|\bvoto de desempate\b|\bvoto medio\b/;

/** [ini, fim) do voto do relator: do cabeçalho VOTO depois do relatório até o voto seguinte. */
function votoDoRelator(tn, bruto, ate) {
  const rel = bruto.search(/\bRELAT[ÓO]RIO\b/);
  const r = /\bVOTO\b/g;
  r.lastIndex = Math.max(0, rel);
  const v = r.exec(bruto);
  return v && v.index < ate ? v.index : -1;
}

// cabeçalho de voto de vogal em caixa mista, antecedido da palavra "Voto": "Voto JUIZ Guilherme Ribeiro Baldan",
// "VOTO Desembargador Fulano", "Voto do Des. Fulano" (Turmas Recursais e gabinetes que não usam o nome em caixa alta)
const RE_VOGAL_MISTO = /\b(?:VOTO|Voto)\s+(?:(?:DO|DA|do|da)\s+)?(?:DESEMBARGADORA?|Desembargadora?|DES\.|Des\.|Desa\.|JU[IÍ]ZA?|Ju[ií]za?)\s+(?:(?:DE DIREITO|de Direito|CONVOCAD[OA]|[Cc]onvocad[oa])\s+)?[A-ZÀ-Ý]/g;
const CAB_RELATOR_MAX = 120;

/** Início do voto do vogal que segue o voto do relator que começa em `ini`, ou -1. Procura depois do "É como voto."
 * do relator; sem ele, depois do cabeçalho do próprio relator ("VOTO DESEMBARGADOR X", até CAB_RELATOR_MAX
 * caracteres) — um nome em caixa alta no corpo corta a faixa CEDO, o que só encurta a marca. Nunca dentro de citação
 * ("Rel. DESEMBARGADOR X"). Sem vogal achado, -1: a faixa não sai. */
function cabecalhoDoVogal(tn, bruto, ini, fim) {
  const fr = RE_FIM_VOTO_RELATOR.exec(tn.slice(ini, fim));
  let de = fr ? ini + fr.index : ini + 4;
  if (!fr) {
    // pula o cabeçalho do relator colado ao VOTO
    const c = new RegExp(`^\\s*(?:${RE_VOGAL.source})`).exec(bruto.slice(de, de + CAB_RELATOR_MAX));
    if (c) de += c[0].length;
  }
  let melhor = -1;
  for (const re of [RE_VOGAL, RE_VOGAL_MISTO]) {
    const r = new RegExp(re.source, "g");
    r.lastIndex = de;
    for (let m; (m = r.exec(bruto)) && m.index < fim;) {
      if (/\brel(?:ator(?:a)?)?\.?\s*:?\s*$|\bpelo\s+$|\bpela\s+$/i.test(bruto.slice(Math.max(0, m.index - 14), m.index))) continue;
      if (melhor < 0 || m.index < melhor) melhor = m.index;
      break;
    }
  }
  return melhor;
}

// ---------------------------------------------------------------------- aspas ---
// ENTRE ASPAS (v1.12.0, remedida: contar aspas numa janela de 1.200 caracteres invertia a paridade sempre que uma aspa
// ficava fora da janela; precisão de 57% e cobertura de 36%). Agora pareia as aspas no DOCUMENTO inteiro, no texto bruto:
// “ abre e ” fecha (aspas curvas têm direção), ‘ abre e ’ só fecha se houver ‘ aberta (senão é apóstrofo), " reto alterna;
// citação sem fechamento em 6.000 caracteres é descartada. O alerta sai quando a MAIORIA dos caracteres do trecho está
// dentro de citação. Aspas logo depois de "tese fixada/firmada" são a tese do próprio tribunal e não contam.
export const ASPAS_SPAN_MAX = 6000;
const ABRE_RETA = new Set([..." \t\n\r\u00a0([{\u2014\u2013-:/"]);
const FECHA_RETA = new Set([..." \t\n\r\u00a0.,;:)]}!?\u2014\u2013-/"]);
export function trechosCitados(bruto) {
  // v1.14.0 (regra trazida de volta do porte ao STJ/TRT14, 05/10/2026): curvas e retas numa pilha SÓ, porque o acórdão
  // mistura as duas ("…no sentido de que "a mora…” — abre reta, fecha curva); a reta é abertura ou fechamento pelo
  // vizinho (espaço/parêntese antes = abre; pontuação/espaço depois = fecha) em vez de alternar, e uma reta solta
  // deixava de embaralhar o resto do documento; « » entram; abertura a mais de ASPAS_SPAN_MAX caracteres descarta a pilha.
  const n = bruto.length, out = [], duplas = [], simples = [], angulares = [];
  const fecha = (pilha, i) => {
    if (pilha.length && i - pilha[pilha.length - 1] > ASPAS_SPAN_MAX) pilha.length = 0;
    if (pilha.length) out.push([pilha.pop(), i + 1]);
  };
  for (let i = 0; i < n; i++) {
    const c = bruto[i];
    if (c === "\u201c") duplas.push(i);
    else if (c === "\u201d") fecha(duplas, i);
    else if (c === '"') {
      const ant = i ? bruto[i - 1] : " ", prox = i + 1 < n ? bruto[i + 1] : " ";
      const abre = ABRE_RETA.has(ant) && !FECHA_RETA.has(prox);
      const fech = !ABRE_RETA.has(ant) && FECHA_RETA.has(prox);
      if (abre || (!fech && !duplas.length)) duplas.push(i);
      else if (duplas.length) fecha(duplas, i);
    } else if (c === "\u2018") simples.push(i);
    else if (c === "\u2019") { if (simples.length) fecha(simples, i); }
    else if (c === "\u00ab") angulares.push(i);
    else if (c === "\u00bb") fecha(angulares, i);
  }
  return out;
}

/** Quantos caracteres de [ini, fim) estão dentro de alguma citação (união dos intervalos, sem contar duas vezes). */
export function coberturaCitada(cit, ini, fim) {
  const pedacos = cit.map(([x, y]) => [Math.max(x, ini), Math.min(y, fim)]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
  let total = 0, ate = ini;
  for (const [x, y] of pedacos) { if (y <= ate) continue; total += y - Math.max(x, ate); ate = y; }
  return total;
}
export const RE_TESE_PROPRIA = /\btese\s+(?:juridica\s+)?(?:fixada|firmada|proposta)\b|\bfixando a seguinte tese\b|\bseguinte tese\b/;
export const ASPAS_MIN = 60;

/** Citações entre aspas do corpo do voto que vão para o recibo (v1.13.0): o lint da peça avisa quando o trecho citado
 * está dentro de uma delas. Só as de ASPAS_MIN caracteres ou mais (termo destacado não é citação), fora de bloco já
 * marcado como transcrição (lá o aviso é o de TRANSCRIÇÃO) e que não sejam a tese fixada pelo próprio tribunal. */
export function aspasDoCorpo(texto, tn, ini, fim, transcritas) {
  return trechosCitados(texto)
    .filter(([a, b]) => a >= ini && b <= fim && b - a >= ASPAS_MIN)
    .filter(([a, b]) => !transcritas.some(([x, y]) => a >= x && b <= y))
    .filter(([a]) => !RE_TESE_PROPRIA.test(tn.slice(Math.max(0, a - 80), a)))
    .sort((p, q) => p[0] - q[0]);
}

// --------------------------------------------------------------------- recibo ---
// OBITER (1.16.0): marca de raciocínio contrafactual ou fundamento alternativo (medida às cegas: 86% no TJRO, 82% no STJ,
// 100% no TJSE e no TRT14). Mora aqui porque o recibo leva os trechos sob ela; posicao.js e verificar.js importam daqui.
export const RE_OBITER = /(?<![a-z0-9])(?:ainda que assim nao fosse|se assim nao fosse|(?:ainda|mesmo) que (?:se )?(?:admitisse(?:mos)?|superad[ao]s?|ultrapassad[ao]s?|afastad[ao]s?|entendesse(?:mos)?|considerasse(?:mos)?|fosse|houvesse|pudesse)|a titulo de (?:argumentacao|reforco|ilustracao|obiter dictum)|(?:apenas|somente|so) para argumentar|ad argumentandum(?: tantum)?|por amor ao debate|obiter dictum|caso se entendesse|registre-se,? (?:por oportuno|de passagem)|a titulo de registro|apenas (?:para|a titulo de) registro)(?![a-z0-9])/g;
export const OBITER_BLOCO_MAX = 600;
const RE_FIM_FRASE = /[.;!?]["”’)\]]?\s+(?=["“‘(\[]?[A-ZÀ-Ý0-9])/g;
const ABREV_FIM = /(?:^|[^a-z0-9])(?:art|arts|n|no|nos|fl|fls|id|ids|des|desa|dr|dra|sr|sra|min|rel|inc|p|pp|pag|proc|cf|num|ex|res|sum|ed|v|vol|cap|al|ss)$/;
/** [ini, fim) de cada trecho sob marca de obiter no corpo [corpo, fim): da marca até o fim da frase (no máximo
 * OBITER_BLOCO_MAX caracteres), fora de transcrição e de citação entre aspas — lá a marca é de quem o tribunal cita. */
export function faixasObiter(texto, tn, corpo, fim, transcritas, aspas) {
  const out = [];
  const dentro = (i, fx) => fx.some(([a, b]) => i >= a && i < b);
  const re = new RegExp(RE_OBITER.source, "g");
  re.lastIndex = corpo;
  for (let m; (m = re.exec(tn)) && m.index < fim;) {
    if (dentro(m.index, transcritas) || dentro(m.index, aspas)) continue;
    if (out.length && m.index < out[out.length - 1][1]) continue;
    let b = Math.min(fim, m.index + OBITER_BLOCO_MAX);
    const rf = new RegExp(RE_FIM_FRASE.source, "g");
    rf.lastIndex = m.index + m[0].length;
    for (let f; (f = rf.exec(texto)) && f.index < b;) {
      if (f[0][0] === "." && ABREV_FIM.test(tn.slice(Math.max(0, f.index - 8), f.index))) continue;
      b = f.index + 1; break;
    }
    out.push([m.index, b]);
  }
  return out;
}

/** Posições [ini, fim) do que no `texto` não é palavra do TJRO, e onde começa a voz da casa.
 * É a mesma conta de camposAlheios, sem recortar — o verificador de citação e a linha de
 * custódia do inteiro teor leem daqui. `casaIni` = início da ementa da casa + fecho (ACÓRDÃO);
 * nos demais tipos, o fim do texto. */
export function faixasAlheias(texto, tipo) {
  const t = String(tipo || "").trim().toUpperCase();
  const n = texto ? texto.length : 0;
  if (!texto || t === "EMENTA") return { transcritas: [], divergente: null, casaIni: n, fecho: n, ementaDaCasa: t === "EMENTA", aspas: [], obiter: [] };
  const tn = norm1(texto);
  const casa = /AC[ÓO]RD[ÃA]O/.test(t) ? vozDaCasa(tn, texto) : { ini: tn.length, fecho: tn.length };
  const fim = casa.ini;
  // o cabeçalho da peça ("Classe: Apelação Cível Polo Ativo: … ADVOGADO…") não abre transcrição: a busca começa no
  // RELATÓRIO quando ele aparece logo no início (v1.13.0: um bloco de 5.320 caracteres nascia no "Classe:").
  const rel = texto.slice(0, 4000).search(/\bRELAT[ÓO]RIO\b/);
  const corpo = rel > 0 ? rel : 0;
  const transcritas = unirFaixas(faixasTranscritas(tn, corpo, fim, texto), faixasDeclaradas(tn, texto, corpo, fim));
  // VOTO VENCEDOR é, por definição, o que prevaleceu: o "divirjo" dele não é o vencido
  const proclamado0 = casa.fecho < tn.length ? tn.slice(casa.fecho, casa.fecho + 1800) : "";
  let div = t === "VOTO VENCEDOR" ? null : faixaDivergente(tn, texto, 0, fim, transcritas, /AC[ÓO]RD[ÃA]O/.test(t) && !RE_MAIORIA.test(proclamado0));
  // v1.13.0 (custódia v3): fecho que proclama UNANIMIDADE e não fala em maioria nem em vencido = ninguém ficou vencido.
  // Voto-vista que acompanha, "divirjo" superado no debate e "voto divergente" de OUTRO processo citado no voto marcavam
  // metade do acórdão como possível voto vencido (medido às cegas: 43% de precisão; 10 dos 12 falsos alarmes eram isto).
  if (div && casa.fecho < tn.length) {
    const proclamado = tn.slice(casa.fecho, casa.fecho + 1800);
    if (RE_UNANIME.test(proclamado) && !RE_MAIORIA.test(proclamado)) div = null;
  }
  if (div && sinalDeRelatorVencido(tn.slice(casa.fecho, casa.fecho + 800))) {
    const v = votoDoRelator(tn, texto, div[0]);
    div = v >= 0 ? [v, div[0]] : div;
  }
  // red team 22/10/2026: o FECHO proclama maioria com o relator vencido, mas o vogal divergiu sem fórmula reconhecível
  // ("entendo de forma diversa", "acompanho o voto do Desembargador X") — sem isto o voto vencido saía como palavra do órgão.
  // A faixa é o voto do relator: do cabeçalho VOTO até o cabeçalho do vogal seguinte (cabecalhoDoVogal).
  // Rodada 2: a faixa só sai com as DUAS pontas achadas — o cabeçalho VOTO do relator antes da ementa da casa e o
  // cabeçalho do vogal seguinte. Sem uma delas não há marca: cair no início do corpo ou no fim do voto engolia o
  // relatório, a questão de ordem e o voto VENCEDOR (recibos 29911948, 29912057, 36882160) ou marcava o cabeçalho
  // do documento no formato antigo, com os votos depois do fecho (1037526).
  if (!div && t !== "VOTO VENCEDOR" && casa.fecho < tn.length) {
    const proclamado = tn.slice(casa.fecho, casa.fecho + 800);
    const maioria = RE_MAIORIA.test(proclamado) || (RE_TERMOS_VOTO_DIVERGENTE.test(proclamado) && !RE_UNANIME.test(proclamado));
    if (sinalDeRelatorVencido(proclamado) && maioria) {
      const v = votoDoRelator(tn, texto, fim);
      const ate = v >= 0 ? cabecalhoDoVogal(tn, texto, v, fim) : -1;
      if (ate > v && v >= 0) div = [v, ate];
    }
  }
  const aspas = aspasDoCorpo(texto, tn, corpo, fim, transcritas);
  // as aspas curtas (< ASPAS_MIN) também calam a marca: "ainda que assim não fosse" dentro de citação é de quem o tribunal cita
  const todasAspas = trechosCitados(texto).filter(([a, b]) => a >= corpo && b <= fim);
  return { transcritas, divergente: div, casaIni: fim, fecho: casa.fecho, ementaDaCasa: false, aspas,
    obiter: faixasObiter(texto, tn, corpo, fim, transcritas, todasAspas) };
}

/** Campos de custódia do recibo: o que no `texto` não é palavra do TJRO. */
export function camposAlheios(texto, tipo) {
  const vazio = { trechos_transcritos: [], trecho_divergente: "", trechos_entre_aspas: [], trechos_obiter: [] };
  const t = String(tipo || "").trim().toUpperCase();
  if (!texto || t === "EMENTA") return vazio;   // a ementa é a voz da casa
  const f = faixasAlheias(texto, tipo);
  // a cauda (ementa da casa + fecho) vai como voz própria: o lint absolve o trecho que está nela, mesmo que o
  // voto tenha transcrito um precedente com a mesma frase (as câmaras reusam ementas-modelo)
  // Reataque Fable (25/10/2026): ementa posta no ALTO — a "casa" ia da ementa ao fecho e engolia RELATÓRIO e VOTO (5 acórdãos reais;
  // o lint absolvia a alegação da parte do relatório como voz do tribunal). Corta no 1º cabeçalho RELATÓRIO/VOTO (caixa alta, depois
  // dos 300 primeiros caracteres da ementa) que vier antes do fecho e mantém o fecho.
  let vozProp = f.casaIni < texto.length ? texto.slice(f.casaIni) : "";
  if (vozProp && f.fecho > f.casaIni) {
    const ate = f.fecho - f.casaIni, re = /(?<![A-Za-zÀ-ú])(?:RELAT[ÓO]RIO|VOTO)(?![A-Za-zÀ-ú])/g;
    re.lastIndex = 300;
    const h = re.exec(vozProp);
    // 1.42.0 (red team de 27/10/2026): no acórdão antigo a ementa E o "acordam" vêm no alto e o RELATÓRIO/VOTO vem DEPOIS do fecho —
    // aí a voz própria fica só com a ementa e o fecho do alto (antes ia até o fim e absolvia relatório e voto no lint)
    // (cabeçalho depois do fecho só vale se não for a proclamação "NOS TERMOS DO VOTO DO RELATOR")
    const reDepois = /(?<![A-Za-zÀ-ú])(?<!\b(?:DO|DE|AO|NO|O|UM|COM|PELO|SEU|MEU|CUJO|APRESENTOU|PROFERIU|PROFERIDO|JUNTOU|ACOMPANHOU|DECLAROU|DECLARA|RETIFICOU|RETIFICA)\s+)(?:RELAT[ÓO]RIO|VOTO)(?![A-Za-zÀ-ú])(?!\s+(?:DO|DA|DE|DIVERGENTE|VENCID|VISTA|VOGAL|CONDUTOR|DESEMPATE))/g;
    reDepois.lastIndex = Math.max(300, ate);
    const h2 = h && h.index < ate ? null : reDepois.exec(vozProp);
    if (h && h.index < ate) vozProp = vozProp.slice(0, h.index) + " " + vozProp.slice(ate);
    else if (h2) vozProp = vozProp.slice(0, h2.index);
  }
  const voz = vozProp ? { texto_voz_propria: vozProp } : {};
  return {
    trechos_transcritos: f.transcritas.map(([a, b]) => texto.slice(a, b)),
    trecho_divergente: f.divergente ? texto.slice(f.divergente[0], f.divergente[1]) : "",
    trechos_entre_aspas: f.aspas.map(([a, b]) => texto.slice(a, b)),
    trechos_obiter: (f.obiter || []).map(([a, b]) => texto.slice(a, b)),
    ...voz,
  };
}

// ------------------------------------------------------ linha para o inteiro teor ---
const primeirasPalavras = (s, n = 7) => {
  const p = String(s || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return p.slice(0, n).join(" ") + (p.length > n ? "…" : "");
};

/** Uma linha, para quem lê o acórdão na hora: quanto do texto é palavra de outro julgado, se há
 * voto que pode ser o vencido e onde começa a voz da casa. Mesma conta que vai para o recibo;
 * null para EMENTA e RELATÓRIO (não têm o que marcar) e quando a custódia falhar. */
export function linhaCustodia(texto, tipo) {
  try {
    const t = String(tipo || "").trim().toUpperCase();
    if (!texto || t === "EMENTA" || t === "RELATÓRIO" || t === "RELATORIO") return null;
    const f = faixasAlheias(texto, tipo);
    const partes = [];
    if (f.transcritas.length) {
      const chars = f.transcritas.reduce((n, [a, b]) => n + (b - a), 0);
      const pct = Math.round((100 * chars) / Math.max(1, f.casaIni));
      partes.push(`${f.transcritas.length} trecho(s) transcrito(s) de OUTROS julgados (~${pct}% do voto: ementa do STJ/TJ copiada não é palavra do TJRO)`);
    } else partes.push("nenhuma transcrição de outro julgado detectada");
    if (f.divergente)
      partes.push(`voto que pode ser o VENCIDO a partir de «${primeirasPalavras(texto.slice(f.divergente[0], f.divergente[0] + 120))}» — leia quem venceu no fecho`);
    else partes.push("sem sinal de voto divergente");
    if (f.casaIni < texto.length)
      partes.push(`voz da casa (ementa + fecho) a partir de «${primeirasPalavras(texto.slice(f.casaIni, f.casaIni + 120))}»`);
    else if (/AC[ÓO]RD[ÃA]O/.test(t)) partes.push("sem ementa/fecho da casa identificados nesta peça");
    return `Custódia do texto (heurística; a mesma do recibo): ${partes.join(" · ")}. Antes de pôr aspas: verificar_citacao_tjro diz de quem é a frase.`;
  } catch {
    return null;
  }
}
