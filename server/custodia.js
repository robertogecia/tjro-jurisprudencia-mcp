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

const _cache = new Map();
/** minúsculas, sem acento, aspas e travessões unificados — 1 unidade UTF-16 → 1 unidade. */
export function norm1(s) {
  let o = "";
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
    o += d;
  }
  return o;
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
const RE_ATRIB_SOLTA = /\b(?:tj-?[a-z]{2}|tjro|stj|stf)\s*[-,]\s*(?:resp|aresp|agint|agrg|edcl|re|are|hc|rhc|apelacao|ac|ai)\b[^.\n]{0,200}\brel\b/g;

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
    const pt = tn.indexOf(". ", m.index + m[0].length);
    out.push([m.index, pt >= 0 && pt - m.index < 400 ? pt + 1 : m.index + m[0].length]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

// ------------------------------------------------------------ faixas transcritas ---
// Onde começa um bloco transcrito. A posição que conta é o FIM do marcador: o texto
// que vem depois é do outro julgado.
const RE_ABRE_BLOCO = new RegExp(
  String.raw`\bementa\s*[:.-]|\bementa\b(?=\s+[a-z])|\bacordao\s*:|\bsumula\s+(?:vinculante\s+)?n?\.?\s*\d+\s*[:-]` +
  String.raw`|\b(?:transcrevo|in verbis|verbis|litteris|nos seguintes termos|assim (?:decidiu|se manifestou|ementado))\b\s*:?` +
  String.raw`|\b(?:vejamos|veja-se|confira-se|elucida-se|observe-se|transcreve-se|destaco|assim ementad[oa]|confiram-se|colaciono|colaciona-se|cito|cita-se|a saber|a proposito|exemplificativamente` +
  String.raw`|seguintes?(?: teor| julgados?| precedentes?| ementas?| termos)?|nesse sentido|neste sentido|nessa linha|na mesma linha` +
  String.raw`|nessa esteira|nesse diapasao|precedentes?(?: desta corte| deste tribunal| do stj)?|julgados?|jurisprudencia|decidiu|decidido)\s*:`,
  "g");
// Marcas de que o texto voltou a ser do relator — um bloco não atravessa uma delas.
const RE_VOZ_PROPRIA = /\b(?:nesse sentido|neste sentido|com efeito|no caso dos autos|no caso em tela|no caso concreto|in casu|na hipotese dos autos|na especie|entendo|ante o exposto|diante do exposto|pelo exposto|isso posto|e como voto|e o voto|voto por|voto pelo|passo a|compulsando|assim sendo|dessa forma|desta forma|rejeito|nao vejo|submeto aos pares|como se sabe|como foi narrado|nesse contexto)\b|\b[ivx]{1,4}\s*[-.)]\s*d[aeo]s?\s+(?:merito|preliminar|recurso|apelacao|dano|pedido)/;
// As fracas também aparecem DENTRO de ementa ("In casu, ante a inexistência…", "o que se verifica no caso
// concreto"): toleradas quando a abertura é seguida de cabeçalho de ementa e o bloco é curto.
const RE_VOZ_FORTE = /\b(?:e como voto|e o voto|voto por|voto pelo|passo a|compulsando|nesse sentido|neste sentido)\b/;
const TOLERA_FRACA = 4000;
const RE_CARA_DE_EMENTA = /\brecurso\s+(?:\w+\s+){0,3}(?:conhecido|provido|desprovido|improvido|nao provido)\b|\btese de julgamento\b|\bcaso em exame\b|\bquestao em discussao\b|\bdispositivos? relevantes?\b|\bsentenca (?:mantida|reformada)\b|\bapelacao\s+(?:civel\s+)?(?:conhecida|provida|desprovida)\b/;
export const ENCADEIA_MAX = 1200, ABERTURA_MAX = 9000, RECUO = 300;

// ": " seguido de cabeçalho de ementa — "…desta Corte: APELAÇÃO CÍVEL. AÇÃO DECLARATÓRIA…" ou
// "…julgado desta Corte: Apelação cível. Empréstimo consignado." (o JURIS grava a ementa do TJRO em caixa baixa)
const TERMOS_EMENTA = String.raw`(?:ementa|apelac\w*|agravo|embargos|recurso|reclamac\w*|direito|processual|processo civil|civil|consumidor|mandado|ac[aã]o|habeas|responsabilidade|contrato|dano|indeniza\w*|revis[aã]o|execu\w*|tutela|cumprimento)`;
// caixa alta só conta se trouxer vocabulário de ementa — "ADVOGADOS DO AGRAVANTE: FULANO DE TAL" não é ementa
const RE_CABECALHO_EMENTA = new RegExp(String.raw`^\s*['(]?\s*(?:(?:tjro|stj|stf|tj-?[a-z]{2})\s*[-.,]\s*)?(?:` + TERMOS_EMENTA + String.raw`\b[^.]{0,80}\.\s)`, "i");

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
    } else if (faixas.length && !RE_VOZ_PROPRIA.test(intervalo) &&
      (intervalo.length < ENCADEIA_MAX || (intervalo.length < 6000 && RE_CARA_DE_EMENTA.test(intervalo)))) {
      ini = piso;   // ementas em sequência, sem o relator falar entre elas
    } else if (q >= piso && a - q < 3000) {
      ini = q;
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

// ------------------------------------------------------------------- divergência ---
const RE_DIVERGENCIA = /\b(?:peco|pedi[dn]o\s+de?|com a devida|com a maxima|data)\s+venia\b[^.]{0,120}\b(?:diverg|discord)|\bdivirjo\b|\bouso\s+divergir\b|\bvoto\s+(?:vencido|divergente)\b|\bvoto[- ]vista\b|\b(?:acompanho|acompanhando|sigo|seguindo)\s+a\s+divergencia\b|\binaugur\w*\s+(?:a\s+)?divergencia\b|\babr\w*\s+(?:a\s+)?divergencia\b|\bdivergencia\s+inaugurada\b|\brelator(?:a)?\s+vencid[oa]\b|\bvencid[oa]s?\s+(?:o|a|os|as)\s+(?:relator|relatora|desembargador|desembargadora|juiz|juiza)/;
// cabeçalho do voto de vogal no documento ACÓRDÃO: "DESEMBARGADOR RADUAN MIGUEL FILHO De acordo."
const RE_VOGAL = /\b(?:DESEMBARGADORA?|JU[IÍ]ZA?(?: CONVOCAD[OA])?)\s+[A-ZÀ-Ý][A-ZÀ-Ý.' ]{3,60}?(?=\s+[A-ZÀ-Ý]?[a-zà-ÿ])/g;
const RE_FIM_VOTO_RELATOR = /\be (?:como|o) (?:voto|meu voto)\b/;

/** [ini, fim) da parte do documento que pode ser voto VENCIDO, ou null. */
export function faixaDivergente(tn, bruto, inicio = 0, fim = tn.length, transcritas = []) {
  const r0 = new RegExp(RE_DIVERGENCIA.source, "g");
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
  for (let m; (m = dv.exec(bruto)) && m.index < fim;)
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
/** {ini, fecho} do documento ACÓRDÃO: `ini` é onde começa a cauda que é voz do próprio TJRO (ementa + fecho);
 * sem fecho, os dois valem o fim do texto. */
export function vozDaCasa(tn, bruto) {
  let fecho = -1;
  for (const m of tn.matchAll(/\bacordam\b/g))
    if (/rondonia/.test(tn.slice(m.index, m.index + 400))) fecho = m.index;
  if (fecho < 0) return { ini: tn.length, fecho: tn.length };
  let em = -1;
  for (const m of bruto.slice(0, fecho).matchAll(/\bEMENTA\b/g)) em = m.index;
  if (em >= 0 && fecho - em < 20000) return { ini: em, fecho };
  // sem o rótulo EMENTA (formato da Res. CNJ 2023, que começa direto no cabeçalho em caixa alta): a ementa começa
  // logo depois do último voto — "É como voto." do relator ou "Acompanho…"/"De acordo." do último vogal
  let fimVotos = -1;
  for (const m of tn.slice(0, fecho).matchAll(/\be (?:como|o) (?:voto|meu voto)\.|\bacompanho\b[^.]{0,120}\.|\bde acordo\./g))
    fimVotos = m.index + m[0].length;
  return { ini: fimVotos >= 0 && fecho - fimVotos < 20000 ? fimVotos : fecho, fecho };
}

// "POR MAIORIA, VENCIDO O RELATOR", "VENCIDOS A RELATORA E O DESEMBARGADOR…", "NOS TERMOS DO VOTO DIVERGENTE…,
// LAVRARÁ O ACÓRDÃO": quem perdeu foi o RELATOR — o voto dele, que vem primeiro, é o vencido. Em 3 dos 5
// acórdãos com divergência dos recibos medidos (23/09/2026) foi assim.
const RE_RELATOR_VENCIDO = /\bvencid[oa]s?\s+(?:o|a)\s+relator|\brelator(?:a)?\s+vencid|\bnos termos do voto divergente\b|\blavrara o acordao\b|\brelator(?:a)? para o acordao\b/;

/** [ini, fim) do voto do relator: do cabeçalho VOTO depois do relatório até o voto seguinte. */
function votoDoRelator(tn, bruto, ate) {
  const rel = bruto.search(/\bRELAT[ÓO]RIO\b/);
  const r = /\bVOTO\b/g;
  r.lastIndex = Math.max(0, rel);
  const v = r.exec(bruto);
  return v && v.index < ate ? v.index : -1;
}

// --------------------------------------------------------------------- recibo ---
/** Campos de custódia do recibo: o que no `texto` não é palavra do TJRO. */
export function camposAlheios(texto, tipo) {
  const vazio = { trechos_transcritos: [], trecho_divergente: "" };
  const t = String(tipo || "").trim().toUpperCase();
  if (!texto || t === "EMENTA") return vazio;   // a ementa é a voz da casa
  const tn = norm1(texto);
  const casa = /AC[ÓO]RD[ÃA]O/.test(t) ? vozDaCasa(tn, texto) : { ini: tn.length, fecho: tn.length };
  const fim = casa.ini;
  const faixas = faixasTranscritas(tn, 0, fim, texto);
  // VOTO VENCEDOR é, por definição, o que prevaleceu: o "divirjo" dele não é o vencido
  let div = t === "VOTO VENCEDOR" ? null : faixaDivergente(tn, texto, 0, fim, faixas);
  if (div && RE_RELATOR_VENCIDO.test(tn.slice(casa.fecho, casa.fecho + 800))) {
    const v = votoDoRelator(tn, texto, div[0]);
    div = v >= 0 ? [v, div[0]] : div;
  }
  // a cauda (ementa da casa + fecho) vai como voz própria: o lint absolve o trecho que está nela, mesmo que o
  // voto tenha transcrito um precedente com a mesma frase (as câmaras reusam ementas-modelo)
  const voz = fim < tn.length ? { texto_voz_propria: texto.slice(fim) } : {};
  return {
    trechos_transcritos: faixas.map(([a, b]) => texto.slice(a, b)),
    trecho_divergente: div ? texto.slice(div[0], div[1]) : "",
    ...voz,
  };
}
