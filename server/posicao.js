// posicao.js (v1.15.0): ONDE o trecho está no julgado — seção da ementa do CNJ (Res. 2023: caso em exame, questão em
// discussão, razões de decidir, dispositivo e tese), relatório / fundamentação / dispositivo do voto, fecho — e a marca de
// raciocínio hipotético ou fundamento alternativo (obiter dictum). É um LOCALIZADOR, não um juiz: diz onde a frase está,
// para o agente preencher `ratio_ou_dictum` da ficha com evidência; decidir se o julgado dependeu dela continua sendo de
// quem lê o acórdão. Distinguishing não mora aqui: exige os fatos do caso, que o servidor nunca vê.
import { norm1, RE_OBITER } from "./custodia.js";
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
const RE_DISPOSITIVO_SENT = /(?<![a-z0-9])(?:dispositivo|ante[ \t\n\r\f\v]+o[ \t\n\r\f\v]+exposto|ante[ \t\n\r\f\v]+do[ \t\n\r\f\v]+exposto|diante[ \t\n\r\f\v]+do[ \t\n\r\f\v]+exposto|isso[ \t\n\r\f\v]+posto|posto[ \t\n\r\f\v]+isso|pelo[ \t\n\r\f\v]+exposto|em[ \t\n\r\f\v]+face[ \t\n\r\f\v]+do[ \t\n\r\f\v]+exposto|por[ \t\n\r\f\v]+todo[ \t\n\r\f\v]+o[ \t\n\r\f\v]+exposto|ante[ \t\n\r\f\v]+tais[ \t\n\r\f\v]+fundamentos|ante[ \t\n\r\f\v]+o[ \t\n\r\f\v]+contexto|ex[ \t\n\r\f\v]+positis|assim[ \t\n\r\f\v]+sendo|desse[ \t\n\r\f\v]+modo|dessa[ \t\n\r\f\v]+forma|em[ \t\n\r\f\v]+consequencia)(?![a-z0-9])/g;
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
