// posicao.js (v1.15.0): ONDE o trecho está no julgado — seção da ementa do CNJ (Res. 2023: caso em exame, questão em
// discussão, razões de decidir, dispositivo e tese), relatório / fundamentação / dispositivo do voto, fecho — e a marca de
// raciocínio hipotético ou fundamento alternativo (obiter dictum). É um LOCALIZADOR, não um juiz: diz onde a frase está,
// para o agente preencher `ratio_ou_dictum` da ficha com evidência; decidir se o julgado dependeu dela continua sendo de
// quem lê o acórdão. Distinguishing não mora aqui: exige os fatos do caso, que o servidor nunca vê.
import { norm1, RE_OBITER, faixasAlheias } from "./custodia.js";
export { RE_OBITER };

// fórmulas que abrem o dispositivo do voto (as frequentes nos 826 recibos: "ante o exposto" 275, "diante do exposto" 107…);
// "diante disso"/"assim sendo" ficam de fora — aparecem no meio da fundamentação
export const RE_DISPOSITIVO = /(?<![a-z0-9])(?:ante o exposto|diante do exposto|pelo exposto|em face do exposto|por todo o exposto|posto isso|posto isto|isso posto|isto posto|por tais razoes|por essas razoes|por todas essas razoes|com essas consideracoes|com tais consideracoes|ex positis|forte nessas razoes)(?![a-z0-9])/g;
const RE_RESULTADO = /(?<![a-z0-9])(?:nego|dou|conheco|nao conheco|julgo|rejeito|acolho|mantenho|reformo|provimento|provido|desprovido|improcedente|procedente|prejudicado|homologo|declaro|defiro|indefiro|concedo|denego|extingo|anulo|casso|confirmo|voto (?:pelo|por|no sentido))(?![a-z0-9])/;
// marcas de obiter: "ainda que assim não fosse", "mesmo que se admitisse", "a título de argumentação", "de todo modo"…
// "em tese" e "não é o caso dos autos" ficam de fora: o primeiro quase sempre é "em abstrato"; o segundo fecha a regra que o
// voto acabou de APLICAR ("…só quando irrisórios ou exorbitantes, o que não é o caso dos autos")

/** Seções da ementa no intervalo [ini, fim) do texto: [{nome, a, b}] em ordem; vazio se não houver o modelo do CNJ. */
const RE_SECAO_EMENTA_N1 = /(?<![a-z0-9])(?:(i{1,3}|iv|v)[ \t\n\r\f\v]*[.)-]?[ \t\n\r\f\v]*)?(caso em exame|quest(?:ao|oes) em discussao|razoes de decidir|dispositivos? e teses?|dispositivo)(?![a-z0-9])/g;
const RE_CAUDA_EMENTA = /\b(?:Dispositivos? relevantes? citados?|Jurisprud[êe]ncia relevante citada|Legisla[çc][ãa]o relevante citada|Resumo em linguagem simples|RESUMO[ \t]*:)/;
/** Seções da ementa do CNJ em [ini, fim) — espelho de _secoes_da_ementa (06/10/2026): número romano em qualquer caixa, ou nome
 * abrindo a linha e fechando com ".", ":", quebra ou o item numerado. Busca sobre norm1 (1:1); a linha confere no bruto. */
export function secoesDaEmenta(texto, ini, fim) {
  const seg = texto.slice(ini, fim), nt = norm1(seg);
  const marcas = [];
  for (const m of nt.matchAll(RE_SECAO_EMENTA_N1)) {
    const i2 = m.index + m[0].length - m[2].length;
    if (!m[1]) {
      const antes = seg.slice(0, i2).replace(/[ \t]+$/, "");
      const depois = seg.slice(i2 + m[2].length, i2 + m[2].length + 4).replace(/^[ \t]+/, "");
      const c = depois.slice(0, 1);
      if (!(antes === "" || antes.endsWith("\n")) || !(c === "." || c === ":" || c === "\n" || (c !== "" && "0123456789".includes(c)))) continue;
    }
    const nome = m[2].replace(/^quest(?:ao|oes) em discussao$/, "questao em discussao").replace(/^dispositivos? e teses?$/, "dispositivo e tese");
    if (marcas.length && marcas[marcas.length - 1].nome === nome && ini + m.index - marcas[marcas.length - 1].a < 40) continue;
    marcas.push({ nome, a: ini + m.index });
  }
  if (!marcas.length) return [];
  const cauda = seg.search(RE_CAUDA_EMENTA);
  const out = marcas.map((mk, i) => ({ nome: mk.nome, a: mk.a, b: i + 1 < marcas.length ? marcas[i + 1].a : (cauda >= 0 && ini + cauda > mk.a ? ini + cauda : fim) }));
  if (cauda >= 0 && ini + cauda > out[out.length - 1].a) out.push({ nome: "cauda", a: ini + cauda, b: fim });
  return out;
}


/** 11/10/2026: fatos da SENTENÇA (espelho de _fatos_da_sentenca). Relatório formal ou, nos Juizados, a narrativa que o substitui. */
export const FATOS_MAX_SENT = 2000;
const RE_SENT_CAB = /S\s?E\s?N\s?T\s?E\s?N\s?[ÇC]\s?A|\bSENTEN[ÇC]A\b|\bVistos\b/i;
const RE_SENT_REL = /(?:\bRELAT[ÓO]RIO\b|(?:^|\n)\s*(?:[IVX]+|\d)\s*[-–.)]\s*Relat[óo]rio\b)\s*[:.\-–]?\s*/;
const RE_SENT_DISP = /relat[óo]rio\s+(?:formal\s+)?(?:é\s+|foi\s+)?dis\s?pensad[oa]|dispensad[oa]\s+o\s+relat[óo]rio(?:\s+formal)?|sem\s+relat[óo]rio/i;
const RE_SENT_ABRE = /\b(?:Trata-se|Tr\s?ata-se|Cuida-se|Versam os autos|Registra-se|[A-ZÀ-Ú][A-Za-zÀ-ú\.,\s]{3,90}?(?<![A-Za-zÀ-ú])(?:ajuiz(?:ou|aram)|ingress(?:ou|aram)|prop[ôo]s|propuseram|requer(?:em)?|sustent(?:a|am|ou|aram)|aleg(?:a|am|ou|aram)|narr(?:a|am|ou|aram)|aduz(?:em|iu|iram)?|afirm(?:a|am|ou|aram)|pretend(?:e|em)|relat(?:a|am|ou|aram))(?![A-Za-zÀ-ú]))/g;
/** relatório formal: termina só em marcador formal (conectivo de raciocínio aparece ao narrar as teses das partes) */
const RE_SENT_FIM_FORMAL = /(?:é\s+o\s+(?:breve\s+|sucinto\s+|necessário\s+)?relat[óo]rio|é\s+a\s+s[íi]ntese|\brelatados\b|\bPois\s+bem\b|passo\s+a\s+decidir|\bDecido\b|Fundamento\s+e\s+decido|\bFUNDAMENTA[ÇC][ÃA]O\b|\bDO\s+M[ÉE]RITO\b|(?:^|\n)\s*(?:II|2)\s*[-–.)]|\bjulgo\b)/gi;
const RE_SENT_FIM = /(?:é\s+o\s+(?:breve\s+|sucinto\s+|necessário\s+)?relat[óo]rio|é\s+a\s+s[íi]ntese|\brelatados\b|\bPois\s+bem\b|passo\s+a\s+decidir|\bDecido\b|Fundamento\s+e\s+decido|\bFUNDAMENTA[ÇC][ÃA]O\b|\bDO\s+M[ÉE]RITO\b|\bPreliminarmente\b|\bDe\s+in[íi]cio\b|O\s+processo\s+comporta|Presentes\s+(?:as|os)\s+(?:condi|pressupost)|julgamento\s+antecipado|\brejeito\b|\bacolho\b|\bjulgo\b|\bdefiro\b|\bindefiro\b|(?<=[.;:!?]\s)(?:Portanto|Assim|Logo|Consequentemente|Nesse\s+sentido|Neste\s+sentido|A\s+prop[óo]sito|Veja-se|De\s+igual\s+modo|Igualmente|Com\s+efeito|Destarte|Desse\s+modo|Ademais|Ora|É\s+que|Imp[õo]e-se|N[ãa]o\s+prospera|Configurad[oa]|Nul[oa]\b|Entendo|Verifica-se|Constata-se|Conclui-se|Restou|N[ãa]o\s+h[áa]\b|H[áa]\s+de|Merece|N[ãa]o\s+merece|N[ãa]o\s+assiste|Assiste\s+raz[ãa]o|Inoportuna|Agora,|Em\s+que\s+pese|Contudo|Todavia|Entretanto|No\s+entanto|Ocorre\s+que|Quanto\s+ao\s+m[ée]rito|No\s+m[ée]rito|Analisando|Da\s+an[áa]lise|Compulsando|Em\s+an[áa]lise))/gi;
function buscaDesde(re, t, ini, fim) { re.lastIndex = ini; const m = re.exec(t.slice(0, fim)); return m; }
export function fatosDaSentenca(t) {
  const mc = RE_SENT_CAB.exec(t.slice(0, 3000)); const base = mc ? mc.index + mc[0].length : 0;
  const cab = t.slice(base, base + 3500);
  const mr = RE_SENT_REL.exec(cab); const md = RE_SENT_DISP.exec(cab);
  let ini, onde;
  if (mr && !(md && md.index < mr.index + mr[0].length + 120)) { ini = base + mr.index + mr[0].length; onde = "relatório da sentença"; }
  else {
    const start = base + (md ? md.index + md[0].length : 0);
    const ma = buscaDesde(RE_SENT_ABRE, t, start, start + 600);
    if (!ma) return null;
    // Sem relatório formal o corte é heurístico (validação cega 11/10/2026: 10 de 25 completos, 3 vazaram fundamento): só aponta, não transcreve.
    return { onde: "sem relatório formal" + (md ? " (dispensado, art. 38 da Lei 9.099)" : ""), texto: "" };
  }
  const mf = buscaDesde(onde === "relatório da sentença" ? RE_SENT_FIM_FORMAL : RE_SENT_FIM, t, ini + 60, Math.min(t.length, ini + 9000));
  const fim = mf ? mf.index : ini + FATOS_MAX_SENT;
  const txt = t.slice(ini, fim).replace(/^[ \t\n:.\-–]+|[ \t\n:.\-–]+$/g, "");
  return txt.length > 40 ? { onde, texto: txt.slice(0, FATOS_MAX_SENT) } : null;
}

export const FATOS_MAX = 1200;
/** Resíduo de Word colado no começo de alguns relatórios ("15.00 800x600 Normal 0 21 false false false PT-BR X-NONE X-NONE MicrosoftInternetExplorer4"). */
const RE_LIXO_WORD = /^\s*(?:\d+(?:\.\d+)?\s+\d+x\d+\s+)?(?:Normal\s+)?(?:\d+\s+){0,3}(?:(?:false|true)\s+){1,3}(?:[A-Z]{2}-[A-Z]{2}\s+|X-NONE\s+){1,3}(?:MicrosoftInternetExplorer\d\s+)?/;
export const RE_ALEGACAO = /\b(?:(?:agravante|agravad[oa]s?|apelante|apelad[oa]s?|recorrente|recorrid[oa]s?|embargante|embargad[oa]s?|autor(?:a|es|as)?|r[ée]u|requerente|requerid[oa]s?|parte|banco|impetrante|exequente|executad[oa]s?)\W+(?:\w+\W+){0,2}?(?:sustent|alega|aleg[oó]u|alegava|aduz|afirm|argument|narra|defende|insurg)\w*|(?:sustent|alega|aleg[oó]u|alegava|aduz|afirm|argument|narra|defende|insurg)\w*\W+(?:(?:a|o|as|os|que)\W+)?(?:agravante|agravad[oa]s?|apelante|apelad[oa]s?|recorrente|recorrid[oa]s?|embargante|embargad[oa]s?|autor(?:a|es|as)?|r[ée]u|requerente|requerid[oa]s?|parte|banco|impetrante|exequente|executad[oa]s?)|(?:alegava|alegando|sustentando|afirmando|argumentando|aduzindo|alegaç[ãa]o))/i;
/** Trecho LITERAL em que o próprio julgado resume os fatos (espelho de _fatos_do_julgado, 08/10/2026): "I. CASO EM EXAME" da
 * ementa do CNJ, ou o RELATÓRIO do acórdão até o VOTO. Nunca resume; sem seção reconhecível devolve null. */
const RE_RELATOR_VENCIDO = /\bvencid[oa]s? (?:\w+ ){0,6}?(?:o|a|o\(a\)) relator(?:a|\(a\))?\b/;
export function fatosDoJulgado(corpo, tipo) {
  const t = String(tipo || "").toUpperCase();
  if (corpo && (t === "SENTENÇA" || t === "SENTENCA")) return fatosDaSentenca(corpo);
  if (!corpo || !["EMENTA", "ACÓRDÃO", "ACORDAO", "RELATÓRIO", "RELATORIO"].includes(t)) return null;
  // conferência de 15/10/2026 (B7): o voto pode TRANSCREVER a ementa de outro julgado, com seu próprio "caso em exame"; a ementa
  // do acórdão vem no fim. Fica o ÚLTIMO "caso em exame" fora de transcrição (492 de 1.645 acórdãos têm mais de um).
  const secs = secoesDaEmenta(corpo, 0, corpo.length).filter((x) => x.nome === "caso em exame");
  const trans = secs.length > 1 || t !== "EMENTA" ? faixasAlheias(corpo, t).transcritas : [];
  const proprias = secs.filter((x) => !trans.some(([a, b]) => x.a >= a && x.a < b));
  for (const sec of proprias.slice(-1)) {
    const m = /^\s*(?:[IVXivx]{1,3}\s*[.)-]?\s*)?caso em exame\s*[.:]?\s*/i.exec(corpo.slice(sec.a, sec.b));
    const txt = corpo.slice(sec.a + (m ? m[0].length : 0), sec.b).trim();
    return { onde: "ementa › caso em exame", texto: txt.slice(0, FATOS_MAX) };
  }
  const mr = /\bRELAT[ÓO]RIO\b/.exec(corpo.slice(0, 4000));
  if (mr) {
    const ini = mr.index + mr[0].length;
    const mv = /\bVOTO\b/g; mv.lastIndex = ini;
    const v = mv.exec(corpo);
    const fim = v ? v.index : Math.min(corpo.length, ini + FATOS_MAX);
    const txt = corpo.slice(ini, fim).replace(/^[ \t\n:.-]+|[ \t\n:.-]+$/g, "").replace(RE_LIXO_WORD, "").trim();
    // conferência de 15/10/2026 (B8): com o relator VENCIDO, o voto logo após o relatório é o vencido; a ficha copiou os fatos dele
    const vencido = RE_RELATOR_VENCIDO.test(norm1(corpo.slice(-6000)));
    if (txt.length > 40) return { onde: vencido ? "relatório do acórdão (⚠️ relator VENCIDO: o voto que segue o relatório é o vencido; os fatos e fundamentos que decidem estão no voto vencedor)" : "relatório do acórdão", texto: txt.slice(0, FATOS_MAX) };
  }
  return null;
}

const ROTULO = {
  "caso em exame": "ementa › I. CASO EM EXAME — resumo do caso, não tese",
  "questao em discussao": "ementa › II. QUESTÃO EM DISCUSSÃO — a pergunta posta, não a resposta",
  "razoes de decidir": "ementa › III. RAZÕES DE DECIDIR — fundamento que a ementa apresenta como razão de decidir (candidato a ratio; confira no voto se o resultado dependeu dele)",
  "dispositivo e tese": "ementa › IV. DISPOSITIVO E TESE — resultado e tese enunciada",
  "dispositivo": "ementa › IV. DISPOSITIVO — resultado do julgamento",
  "cauda": "ementa › parte final (dispositivos e jurisprudência citados, resumo) — referência, não tese",
};

const RE_FIM_VOTO = /\be (?:como|o) (?:voto|meu voto)\b/g;
/** {relIni, votoIni, fimRelator, dispIni, fimVoto} do voto do relator no texto (ACÓRDÃO/VOTO). No ACÓRDÃO o voto do relator
 * vai do cabeçalho VOTO (depois do RELATÓRIO) até o 1º "é como voto" fora de transcrição, ou até o 1º vogal/divergência;
 * dispIni = -1 se a fórmula de dispositivo não aparece. */
export function partesDoVoto(texto, tipo, fx) {
  const t = String(tipo || "").toUpperCase();
  const n = texto.length, acordao = /AC[ÓO]RD[ÃA]O/.test(t);
  let votoIni = 0, fimVoto = acordao ? fx.casaIni : n, relIni = -1;
  if (acordao) {
    relIni = texto.slice(0, 4000).search(/\bRELAT[ÓO]RIO\b/);
    const r = /\bVOTO\b/g; r.lastIndex = Math.max(0, relIni);
    const v = r.exec(texto);
    votoIni = v && v.index < fimVoto ? v.index : (relIni >= 0 ? -1 : 0);
  }
  let fimRelator = fimVoto;
  if (acordao && votoIni >= 0) {
    const tn = norm1(texto);
    RE_FIM_VOTO.lastIndex = votoIni;
    for (let m; (m = RE_FIM_VOTO.exec(tn)) && m.index < fimVoto;) {
      if (fx.transcritas.some(([x, y]) => m.index >= x && m.index < y)) continue;
      fimRelator = Math.min(fimVoto, m.index + m[0].length + 1); break;
    }
    // relator vencido: a faixa divergente É o voto dele; senão, o voto acaba onde a divergência começa
    if (fx.divergente && fx.divergente[0] < fimVoto && fx.divergente[1] > votoIni)
      fimRelator = Math.min(fimRelator, fx.divergente[0] <= votoIni + 5 ? fx.divergente[1] : fx.divergente[0]);
  }
  let dispIni = -1;
  if (votoIni >= 0) {
    const tn = norm1(texto.slice(votoIni, fimRelator));
    for (const m of tn.matchAll(RE_DISPOSITIVO)) {
      if (RE_RESULTADO.test(tn.slice(m.index, m.index + 300))) dispIni = votoIni + m.index;
    }
  }
  return { relIni, votoIni, fimRelator, dispIni, fimVoto };
}

// ---- POSIÇÃO NA SENTENÇA de 1º grau (08/10/2026; espelho de _posicao_sentenca; gabarito cego e duplo em sentenças do JURIS) ----
const ROT_CAB = "cabeçalho da sentença (autuação, partes, advogados) — não é texto decisório";
const ROT_REL = "RELATÓRIO da sentença — narração do processo e das teses das partes, não decisão";
const ROT_FUN = "fundamentação da sentença — razões do juiz";
const ROT_DIS = "DISPOSITIVO da sentença — é o que foi decidido, não a razão de decidir";
const ROT_ASS = "assinatura e expedientes da sentença (data, juiz, cláusula de cumprimento) — não é texto decisório";
const RE_INICIO_CORPO_SENT = /(?<![a-z0-9])(?:vistos|dispens\w*[ \t\n\r\f\v]+(?:o[ \t\n\r\f\v]+)?relatorio|dispensad\w*[ \t\n\r\f\v]+o[ \t\n\r\f\v]+relatorio|trata-se|tratam-se|cuida-se|cuidam-se|relatorio|s[ \t\n\r\f\v]?e[ \t\n\r\f\v]?n[ \t\n\r\f\v]?t[ \t\n\r\f\v]?e[ \t\n\r\f\v]?n[ \t\n\r\f\v]?c[ \t\n\r\f\v]?a)(?![a-z0-9])/;
const RE_FUNDAMENTO_SENT = /(?<![a-z0-9])(?:fundamento[ \t\n\r\f\v]+e[ \t\n\r\f\v]+decido|fundamento[ \t\n\r\f\v]+e[ \t\n\r\f\v]+passo|fundamentacao|passo[ \t\n\r\f\v]+a[ \t\n\r\f\v]+decidir|passo[ \t\n\r\f\v]+a[ \t\n\r\f\v]+fundamentar|e[ \t\n\r\f\v]+o[ \t\n\r\f\v]+(?:[a-z]+[ \t\n\r\f\v]+)?relatorio|relatorio[ \t\n\r\f\v]+dispensado|dispensad[oa][ \t\n\r\f\v]+o[ \t\n\r\f\v]+relatorio|dispenso[ \t\n\r\f\v]+o[ \t\n\r\f\v]+relatorio|dispensa-se[ \t\n\r\f\v]+o[ \t\n\r\f\v]+relatorio)(?![a-z0-9])/g;
const RE_DISPOSITIVO_SENT = /(?<![a-z0-9])(?:dispositivo|ante[ \t\n\r\f\v]+o[ \t\n\r\f\v]+exposto|ante[ \t\n\r\f\v]+do[ \t\n\r\f\v]+exposto|diante[ \t\n\r\f\v]+do[ \t\n\r\f\v]+exposto|isso[ \t\n\r\f\v]+posto|isto[ \t\n\r\f\v]+posto|posto[ \t\n\r\f\v]+isto|posto[ \t\n\r\f\v]+isso|pelo[ \t\n\r\f\v]+exposto|em[ \t\n\r\f\v]+face[ \t\n\r\f\v]+do[ \t\n\r\f\v]+exposto|por[ \t\n\r\f\v]+todo[ \t\n\r\f\v]+o[ \t\n\r\f\v]+exposto|ante[ \t\n\r\f\v]+tais[ \t\n\r\f\v]+fundamentos|ante[ \t\n\r\f\v]+o[ \t\n\r\f\v]+contexto|ex[ \t\n\r\f\v]+positis|assim[ \t\n\r\f\v]+sendo|desse[ \t\n\r\f\v]+modo|dessa[ \t\n\r\f\v]+forma|em[ \t\n\r\f\v]+consequencia)(?![a-z0-9])/g;
const RE_VERBO_DECISORIO_SENT = /(?<![a-z0-9])(?:julgo|julgar|condeno|declaro|extingo|homologo|defiro|indefiro|acolho|rejeito|determino|resolvo|concedo|nego|decreto|absolvo|dou[ \t\n\r\f\v]+provimento|confirmo|torno|revogo|reconheco|decido)(?![a-z0-9])/g;
const RE_DATA_SENT = /(?<![a-z0-9])\d{1,2}[ \t\n\r\f\v]+de[ \t\n\r\f\v]+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[ \t\n\r\f\v]+de[ \t\n\r\f\v]+(?:19|20)\d\d(?![a-z0-9])/g;

/** Primeiro casamento de `re` (flag g) em tn[ini, fim) — como re.search(tn, ini, fim) do Python (fim corta a cadeia). */
function buscaEm(re, tn, ini, fim) { re.lastIndex = ini; const m = re.exec(fim < tn.length ? tn.slice(0, fim) : tn); return m; }
export function posicaoSentenca(texto, tn, meio) {
  const n = tn.length;
  if (n === 0) return "";
  const corpo = new RegExp(RE_INICIO_CORPO_SENT.source, "g");
  const mc = buscaEm(corpo, tn, 0, Math.min(n, 6000));
  const cab = mc ? mc.index : Math.min(n, 1200);
  let disp = -1;
  const rd = new RegExp(RE_DISPOSITIVO_SENT.source, "g"); rd.lastIndex = cab;
  for (let x; (x = rd.exec(tn)) !== null;) {
    const v = new RegExp(RE_VERBO_DECISORIO_SENT.source, "g");
    if (buscaEm(v, tn, x.index, Math.min(n, x.index + x[0].length + 400))) disp = x.index;
  }
  let ass = -1;
  const rt = new RegExp(RE_DATA_SENT.source, "g"); rt.lastIndex = Math.max(cab, n - 900);
  for (let x; (x = rt.exec(tn)) !== null;) ass = x.index;
  if (ass >= 0) {
    const a0 = Math.max(0, ass - 70);
    const j = tn.slice(a0, ass).lastIndexOf(". ");
    ass = j >= 0 ? a0 + j + 2 : ass;
    if (disp >= 0 && ass <= disp) ass = -1;
  }
  const limite = disp >= 0 ? disp : (ass >= 0 ? ass : n);
  const rf = new RegExp(RE_FUNDAMENTO_SENT.source, "g"); rf.lastIndex = cab;
  const mf = rf.exec(limite < n ? tn.slice(0, limite) : tn);
  const fund = mf ? mf.index : -1;
  if (meio < cab) return ROT_CAB;
  if (ass >= 0 && meio >= ass) return ROT_ASS;
  if (disp >= 0 && meio >= disp) return ROT_DIS;
  if (fund >= 0) return meio < fund ? ROT_REL : ROT_FUN;
  return ROT_FUN;
}


/** Nota "POSIÇÃO NO JULGADO" para o trecho [ini0, fim) do `texto` (tipo dado; `fx` = faixasAlheias), ou "". */
export function posicaoNoJulgado(texto, tipo, ini0, fim, fx) {
  const t = String(tipo || "").trim().toUpperCase();
  const n = texto.length;
  const meio = ini0 + Math.floor((fim - ini0) / 2);
  if (t === "SENTENÇA") return posicaoSentenca(texto, norm1(texto), meio);   // 08/10/2026: sentença de 1º grau não tem ementa nem voto
  const emEmenta = t === "EMENTA" ? [0, n] : (/AC[ÓO]RD[ÃA]O/.test(t) && fx.casaIni < n ? [fx.casaIni, fx.fecho] : null);
  // 1.16.0 (validação cega): o fecho começa no "ACÓRDÃO Vistos, relatados…", alguns caracteres antes do "acordam"
  if (emEmenta && t !== "EMENTA") {
    const cab = /\bAC[ÓO]RD[ÃA]O[ \t\n\r\f\v]+Vistos/g;
    cab.lastIndex = Math.max(emEmenta[0], emEmenta[1] - 400);
    const m = cab.exec(texto);
    if (m && m.index < emEmenta[1]) { if (meio >= m.index) return "fecho (ata do julgamento): o que o colegiado proclamou"; emEmenta[1] = m.index; }
  }
  if (emEmenta && meio >= emEmenta[0] && meio < emEmenta[1]) {
    const secs = secoesDaEmenta(texto, emEmenta[0], emEmenta[1]);
    const s = secs.find((x) => meio >= x.a && meio < x.b);
    return s ? ROTULO[s.nome] || s.nome : "ementa (modelo antigo, sem seções) — síntese do julgado";
  }
  if (/AC[ÓO]RD[ÃA]O/.test(t) && meio >= fx.fecho) return "fecho (ata do julgamento): o que o colegiado proclamou";
  if (t === "RELATÓRIO" || t === "RELATORIO") return "RELATÓRIO — narração do processo e das teses das partes, não decisão";
  if (!/AC[ÓO]RD[ÃA]O|VOTO/.test(t)) return "";
  const p = partesDoVoto(texto, tipo, fx);
  if (p.relIni > 0 && meio < p.relIni) return "cabeçalho da peça (autuação), antes do relatório";
  if (p.relIni >= 0 && (p.votoIni < 0 || meio < p.votoIni) && meio >= p.relIni) return "RELATÓRIO — narração do processo e das teses das partes, não decisão";
  // 1.16.0 (medição cega): acórdão sem o cabeçalho RELATÓRIO — o que vem antes do voto é a narração
  if (p.relIni < 0 && p.votoIni > 0 && meio < p.votoIni) return "antes do voto, sem cabeçalho RELATÓRIO — narração do processo, não decisão";
  if (p.votoIni < 0) return "";
  if (p.dispIni >= 0 && meio >= p.dispIni && meio < p.fimRelator) return "DISPOSITIVO do voto — é o que foi decidido, não a razão de decidir";
  if (meio >= p.votoIni && meio < p.fimRelator) {
    const d = p.dispIni >= 0 ? ` (o dispositivo começa ${p.dispIni - meio} caracteres adiante, em «${texto.slice(p.dispIni, p.dispIni + 60).replace(/[ \t\n\r\f\v]+/g, " ")}…»)` : " (dispositivo não localizado por fórmula)";
    return "fundamentação do voto do relator, antes do dispositivo" + d;
  }
  if (meio >= p.fimRelator && meio < p.fimVoto) {
    // 1.16.0: ementa sem rótulo reconhecido logo depois do voto (a custódia não achou onde começa): as seções a denunciam
    const secs = secoesDaEmenta(texto, p.fimRelator, p.fimVoto);
    if (secs.length && meio >= secs[0].a - 900) {
      const s = secs.find((x) => x.a <= meio && meio < x.b);
      return s ? ROTULO[s.nome] || s.nome : "ementa › verbetes iniciais (título da ementa, antes das seções)";
    }
    return "depois do voto do relator (voto de vogal, voto-vista ou declaração de voto) — veja quem assina e o fecho";
  }
  return "";
}

/** v1.29.0 (H06): tese literal da ementa do CNJ — o trecho depois do rótulo "Tese(s) de julgamento" dentro da seção IV,
 * cortado em item inteiro acima de `teto`. Só para documento do tipo EMENTA: no ACÓRDÃO o rótulo repete em 33% dos casos,
 * muitas vezes na ementa de outro julgado transcrita no voto (medição 12/10/2026). null sem seção IV ou sem o rótulo.
 * Devolve {texto, total, exibidos, completa}; `total` conta os itens numerados ("1. …") quando a tese é numerada. */
export const TESE_MAX = 1000;
const RE_TESE_ROTULO = /\bteses? de julgamento ?:? ?/;
const RE_ITEM_TESE = /(?<![^ ])\d{1,2}\. /g;
export function teseDaEmenta(texto, teto = TESE_MAX) {
  const t = String(texto || "");
  const iv = secoesDaEmenta(t, 0, t.length).find((x) => x.nome === "dispositivo e tese" || x.nome === "dispositivo");
  if (!iv) return null;
  const seg = t.slice(iv.a, iv.b);
  const m = RE_TESE_ROTULO.exec(norm1(seg));
  if (!m) return null;
  const tese = seg.slice(m.index + m[0].length).replace(/[ \t\n\r\f\v]+/g, " ").trim();
  if (!tese) return null;
  const inicios = [...tese.matchAll(RE_ITEM_TESE)].map((mm) => mm.index);
  const total = inicios.length >= 2 && inicios[0] < 5 ? inicios.length : 1;
  if (tese.length <= teto) return { texto: tese, total, exibidos: total, completa: true };
  if (total > 1) {
    const ate = inicios.filter((p) => p > 0 && p <= teto);
    if (ate.length) {
      const p = ate[ate.length - 1];
      return { texto: tese.slice(0, p).replace(/[ ]+$/, ""), total, exibidos: inicios.indexOf(p), completa: false };
    }
  }
  const fim = tese.lastIndexOf(". ", teto);
  const corte = fim > 0 ? tese.slice(0, fim + 1) : tese.slice(0, teto).replace(/ \S*$/, "");
  return { texto: corte.trim(), total, exibidos: 0, completa: false };
}

// v1.31.0: DESFECHO da SENTENÇA (1º grau) lido só do dispositivo — o par PROVIDO/DESPROVIDO é de 2º grau e a sentença ficava sem rótulo.
// O rótulo diz o que foi decidido sobre o PEDIDO (procedente/improcedente…), nunca quem ganhou: em embargos à execução e impugnação,
// "procedente" favorece o devedor. Sentença que corrige/integra outra (ED, "onde se lê"), sem âncora de dispositivo ou com desfechos
// opostos fica sem rótulo (null), porque rótulo errado é pior que nenhum.
export const ROTULOS_SENTENCA = { PROCEDENTE: "procedente", PARCIAL: "parcialmente procedente", IMPROCEDENTE: "improcedente", EXTINTO: "extinto sem resolução do mérito", HOMOLOGADO: "acordo ou desistência homologados" };
// 22/10/2026: "embargos de declaracao" solto pegava a ADVERTÊNCIA de multa do rodapé ("a oposição de embargos de declaração meramente
// protelatórios ensejará multa…") e calava em ~44% das sentenças cíveis (384 de 875 nos recibos do autor; 11 de 22 silêncios na amostra cega).
// Agora só conta a sentença que JULGA embargos: "embargos de declaração opostos", "conheço/acolho/rejeito os embargos".
const RE_S_INTEGRATIVA = /onde se le\b|leia-se|passara a ter a seguinte|embargos de declarac(?:ao|oes) opostos|(?:conheco|acolho|rejeito|nao conheco) d?os embargos|julgo (?:im)?procedentes? os embargos|corrijo (?:de oficio )?o erro material|retifico a sentenca/;
const RE_S_PARCIAL = /parcialmente (?:procedente|procedentes|acolh)|procedentes? em parte|procedencia parcial|parcial procedencia|julgo parcialmente/;
const RE_S_IMPROC = /improcedente/;
const RE_S_PROC = /(?<![a-z0-9])procedente/;
const RE_S_HOMOLOGA = /homologo (?:o |a |, )?(?:o |a )?(?:acordo|transacao|desistencia|pedido de desistencia|renuncia|reconhecimento|composicao|autocomposicao|entabulad)/;
const RE_S_EXTINTO = /extin\w+[^.]{0,220}sem (?:resolucao|julgamento) (?:do|de) merito|sem (?:resolucao|julgamento) (?:do|de) merito[^.]{0,100}extin/;
/** Âncoras de dispositivo (fórmula de conclusão + verbo decisório em até 400 car.) depois do cabeçalho, em ordem; tn = norm1 do texto limpo. */
function ancorasDeDispositivo(tn) {
  const n = tn.length;
  const corpo = new RegExp(RE_INICIO_CORPO_SENT.source, "g");
  const mc = buscaEm(corpo, tn, 0, Math.min(n, 6000));
  const cab = mc ? mc.index : Math.min(n, 1200);
  const out = [];
  const rd = new RegExp(RE_DISPOSITIVO_SENT.source, "g"); rd.lastIndex = cab;
  for (let x; (x = rd.exec(tn)) !== null;) {
    const v = new RegExp(RE_VERBO_DECISORIO_SENT.source, "g");
    if (buscaEm(v, tn, x.index, Math.min(n, x.index + x[0].length + 400))) out.push(x.index);
  }
  return out;
}
/** Fim do dispositivo: a data da assinatura nos 900 últimos caracteres (depois de `ini`) ou o fim do texto. */
function fimDoDispositivo(tn, ini) {
  const n = tn.length; let ass = -1;
  const rt = new RegExp(RE_DATA_SENT.source, "g"); rt.lastIndex = Math.max(ini, n - 900);
  for (let x; (x = rt.exec(tn)) !== null;) ass = x.index;
  return ass > ini ? ass : n;
}
/** Trecho do dispositivo (da última âncora "ante o exposto…" seguida de verbo decisório até a data da assinatura) ou null; tn = norm1 do texto limpo. */
export function dispositivoDaSentenca(tn) {
  const a = ancorasDeDispositivo(tn);
  if (!a.length) return null;
  const disp = a[a.length - 1];
  return tn.slice(disp, fimDoDispositivo(tn, disp));
}
const PENAL = /acao penal|penal\b|criminal|inquerito|termo circunstanciado|medida protetiva|execucao da pena/;
function rotuloDoTrecho(d) {
  if (!d || RE_S_INTEGRATIVA.test(d)) return null;
  const im = RE_S_IMPROC.test(d), pr = RE_S_PROC.test(d.replace(/improcedente/g, " ")), pa = RE_S_PARCIAL.test(d);
  // homologação + outro desfecho no mesmo dispositivo (vários réus: "julgo improcedente… homologo a desistência quanto ao réu X"): sem rótulo
  if (RE_S_HOMOLOGA.test(d)) return im || pr || pa ? null : "HOMOLOGADO";
  if (pa) return "PARCIAL";
  if (im && pr) return null;
  if (pr) return "PROCEDENTE";
  if (im) return "IMPROCEDENTE";
  if (RE_S_EXTINTO.test(d)) return "EXTINTO";
  return null;
}
/** Rótulo do desfecho da sentença: PROCEDENTE | PARCIAL | IMPROCEDENTE | EXTINTO | HOMOLOGADO | null.
 * `classe`: processo penal fica sem rótulo ("procedente a pretensão punitiva" é condenação, "improcedente" é absolvição: não é o par cível).
 * Se a âncora anterior (até 2.500 car. antes) der outro desfecho (ex.: "parcialmente procedentes os pedidos" e, adiante, "improcedente a reconvenção"), null. */
export function desfechoDaSentenca(tn, classe = "") {
  if (PENAL.test(norm1(String(classe || "")))) return null;
  const a = ancorasDeDispositivo(tn);
  if (!a.length) return null;
  const ultima = a[a.length - 1];
  const rUlt = rotuloDoTrecho(tn.slice(ultima, fimDoDispositivo(tn, ultima)));
  if (!rUlt) return null;
  if (a.length > 1 && ultima - a[a.length - 2] < 2500) {
    const rAnt = rotuloDoTrecho(tn.slice(a[a.length - 2], ultima));
    if (rAnt && rAnt !== rUlt) return null;
  }
  return rUlt;
}
