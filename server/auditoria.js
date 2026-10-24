// v1.39.0 — auditoria das citações de uma peça, SEM REDE (ideia do citation lookup do CourtListener e do
// auditor de "citação alucinada" de john-walkoe/courtlistener_citations_mcp, adaptada ao TJRO).
// Para cada número de processo no texto: dígito verificador (Res. CNJ 65/2008), tribunal pelo segmento,
// e — se o acórdão já foi lido nesta máquina — câmara do FECHO e relator contra o que a peça afirma ao lado do número.
// Citação a STJ/STF só é listada: quem confere é o MCP do STJ / JusRatio. Nada aqui diz que o julgado sustenta a tese.
import { recibosDoProcesso } from "./recibos.js";
import { extrairOrgaoComOrigem, extrairRelatorDoTexto, compararRelator, nomesDoRelator, fold } from "./lib.js";
import { citacoesDoTexto } from "./precedentes.js";
import { relatorVencidoTotal, RE_LAVRARA, RE_PARA_ACORDAO } from "./vencido.js";

const RE_NUM = /(?<![0-9])(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})(?![0-9])/g;
const ORDINAL = { "1": "1ª", "2": "2ª", "3": "3ª", "4": "4ª", primeira: "1ª", segunda: "2ª", terceira: "3ª", quarta: "4ª", quinta: "5ª", sexta: "6ª", i: "1ª", ii: "2ª", iii: "3ª", iv: "4ª", v: "5ª", vi: "6ª" };
const RE_CAMARA_PECA = /(?<![\p{L}\d])(\d{1,2}|primeira|segunda|terceira|quarta|quinta|sexta|i{1,3}|iv|vi?)\s*(?:\.?ª|\.?º|°|a\b)?\s*((?:c[âa]m(?:ara|\.)?|c\.)\s*(?:c[íi]v(?:el|\.)?|crim(?:inal|\.)?|esp(?:ecial|\.)?)|cc(?:rim)?\b|ce\b|turma\s+recursal|tr\b)/giu;
const RE_REL_PECA = /\b(?:[Rr]el(?:ator|atora|a\.|\.)?|REL(?:ATOR|ATORA|\.)?|(?:sob\s+a\s+|de\s+|da\s+)?[Rr]elatoria\s+d[eoa]|da\s+lavra\s+d[oa])\s*(?:p\/\s*(?:o\s+)?ac[óo]rd[ãa]o\s*)?(?:\(a\))?[:.]?\s*(?:(?:[Dd]es(?:embargador[a]?|\.)?(?:\(a\))?|[Jj]u[ií]z[a]?(?:\(a\))?(?:\s+[Cc]onvocad[oa](?:\(a\))?)?|[Mm]in(?:istro|istra|\.)?|DES(?:EMBARGADOR[A]?)?\.?|JU[IÍ]Z[A]?)\s*\.?\s*)?((?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç.'-]+)(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç.'-]+){0,5})/;
const RE_DATA_PECA = /\b(?:j(?:ulgad[oa])?\.?\s*(?:em\s*)?|em\s+|data\s+d[eo]\s+julgamento\s*:?\s*|data\s+julgamento\s*:\s*|julgamento\s*(?:em|:)\s*|sess[ãa]o\s+(?:de|em|do\s+dia)\s+)(\d{1,2})(?:[./](\d{1,2})[./](\d{2,4})|\s*(?:º|o)?\s+de\s+([a-zç]+)\s+de\s+(\d{4}))/i;
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const AUDITORIA_MAX_CHARS = 400000;

export function dvCnjValido(d20) {
  if (!/^\d{20}$/.test(d20)) return false;
  return 98n - (BigInt(d20.slice(0, 7) + d20.slice(9) + "00") % 97n) === BigInt(d20.slice(7, 9));
}
const mascara = (d) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
const camaraNorm = (n, tipo) => { const t = fold(tipo).replace(/[\s.]+/g, " ").trim(); const o = ORDINAL[fold(n)] || `${String(n).replace(/^0+/, "")}ª`; if (/^(turma|tr$)/.test(t)) return `${o} Turma Recursal`; if (t === "cc") return `${o} Câmara Cível`; if (t === "ccrim") return `${o} Câmara Criminal`; if (t === "ce") return `${o} Câmara Especial`; return `${o} Câmara ${/ civ/.test(t) ? "Cível" : / crim/.test(t) ? "Criminal" : "Especial"}`; };
const dataBr = (dd, mm, aa) => `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${aa.length === 2 ? "20" + aa : aa}`;

// Fronteira da citação: quebra de linha, "; " ou o começo de OUTRA citação (STJ/STF, outro TJ, classe superior). Medido em 64 notas reais
// do acervo (17/10/2026): sem a fronteira, a câmara do item seguinte da lista e a data/relator do REsp citado na mesma frase viravam alerta falso.
const FRONTEIRA = /\n|;\s|\b(?:STJ|STF|TST|TJ-?(?!RO)[A-Z]{2}|TRF-?\d|(?:AgInt|AgRg|EDcl)\s+n[oa]s?|REsp|AREsp|EREsp|EAREsp|RE\s+\d|ARE\s+\d|RMS|HC|Tema\s+\d)\b/;
// "em <data>" solto só vale como data do julgamento se a palavra anterior não for de leitura/publicação/protocolo
// ("LIDO em 11/10/2026", "publicado em", "DJe em" — nota real do acervo de 17/10/2026).
const NAO_E_JULGAMENTO = /\b(?:lid[oa]|acessad[oa]|consultad[oa]|redigid[oa]|protocolad[oa]|publicad[oa]|disponibilizad[oa]|dje|djen|dj|visto|vista|pesquisad[oa]|atualizad[oa]|verificad[oa])\s*$/i;
function dataDoJulgamento(trecho) {
  const re = new RegExp(RE_DATA_PECA.source, "gi");
  for (const m of trecho.matchAll(re)) {
    if (/^em\s/i.test(m[0]) && NAO_E_JULGAMENTO.test(trecho.slice(Math.max(0, m.index - 25), m.index))) continue;
    return m;
  }
  return null;
}

// 1.41.9 (item 4): a peça também diz órgão SEM número ("Câmaras Especiais Reunidas", "Tribunal Pleno", "Turma Recursal", "Câmara Cível")
// e câmara fora de 1ª–4ª ("5ª Câmara Cível"); antes nada disso era extraído e a linha saía ✅ só com o resto. Agora é extraído e
// comparado com o fecho; e o que a peça disser ao lado do número sem ter sido extraído (outra data, "Relator" sem nome legível,
// órgão em grafia desconhecida) vai para `pendentes` e a linha sai 🟠 com o que ficou sem conferir — ✅ só se TUDO foi comparado.
const RE_COLEGIADO_PECA = /\b(?:c[âa]maras\s+(?:(?:c[íi]veis|criminais|especiais)\s+)?reunidas|(?:tribunal\s+)?pleno(?:\s+(?:judici[áa]rio|administrativo))?|[óo]rg[ãa]o\s+especial|turma\s+de\s+uniformiza[çc][ãa]o|turmas?\s+recursa(?:l|is)(?:\s+reunidas)?|c[âa]mara\s+(?:c[íi]vel|criminal|especial))\b/gi;
const capitular = (s) => s.replace(/\s+/g, " ").trim().split(" ").map((w, i) => (i && /^(?:de|da|do)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(" ");
/** O órgão que a peça escreveu confere com o do fecho? Numerado: igual. Sem número: a mesma espécie de colegiado. */
export function orgaoConfere(peca, fecho) {
  const p = fold(peca).replace(/\s+/g, " ").trim(), f = fold(fecho).replace(/\s+/g, " ").trim();
  if (/^\d/.test(p)) return p === f;
  if (/reunid/.test(p)) return /reunid/.test(f) && (/civ/.test(p) ? /civ/.test(f) : true) && (/crim/.test(p) ? /crim/.test(f) : true) && (/espec/.test(p) ? /espec/.test(f) : true) && (/turma/.test(p) === /turma/.test(f));
  if (/pleno/.test(p)) return /pleno/.test(f) && (/administ/.test(p) ? /administ/.test(f) : true) && (/judic/.test(p) ? !/administ/.test(f) : true);
  if (/orgao especial/.test(p)) return /orgao especial/.test(f);
  if (/uniformiz/.test(p)) return /uniformiz/.test(f);
  if (/turma recursal/.test(p)) return /turma recursal/.test(f) && !/reunid/.test(f);
  if (/^camara (civel|criminal|especial)$/.test(p)) return /^\d+\S*\s+camara\s/.test(f) && f.endsWith(p);
  return false;
}
const RE_DATA_SOLTA = /(?<![\d./])\d{1,2}º?[./-]\d{1,2}[./-]\d{2,4}(?!\d)|(?<!\d)\d{1,2}\s*(?:º|o)?\s+de\s+(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}/gi;
const RE_NAO_DATA_DO_JULGAMENTO = /\b(?:dje|djen|dj|publicad[oa]|publica[çc][ãa]o|disponibilizad[oa]|lid[oa]|acessad[oa]|consultad[oa]|protocolad[oa]|distribu[íi]d[oa]|distribui[çc][ãa]o|autuad[oa]|pesquisad[oa]|atualizad[oa]|verificad[oa]|visto|vista|tr[âa]nsito|transitad[oa]|nascid[oa])\b[^\d]{0,15}$/i;
const RE_DEMONSTRATIVO_ORGAO = /\b(?:desta|dessa|nesta|nessa|esta|essa|deste|neste|desse|nesse|este|esse)\s+(?:(?:colenda|egr[ée]gia|e\.|c\.)\s+)?(?:c[âa]mara|turma|corte|tribunal)\b/gi;
const emLinha = (x) => x.replace(/\s+/g, " ").trim();
/** O que a peça afirma na citação e não foi extraído: órgão, relator ou data que sobram depois de tirar o que foi lido. */
function pendentesDaCitacao(cit, lidos) {
  let resto = cit;
  const tirar = (re) => { resto = resto.replace(re, (x) => " ".repeat(x.length)); };
  tirar(new RegExp(RE_CAMARA_PECA.source, "gi")); tirar(RE_COLEGIADO_PECA); tirar(RE_DEMONSTRATIVO_ORGAO);
  for (const x of lidos) if (x) { const k = resto.indexOf(x); if (k >= 0) resto = resto.slice(0, k) + " ".repeat(x.length) + resto.slice(k + x.length); }
  const out = [];
  // Reataque Fable (24/10/2026): "Vara", "Juizado" e "Comarca" (sentença citada) também são órgão afirmado; "Des. Fulano" sem "Rel.",
  // "Redator p/ acórdão" e "Juiz de Direito Fulano" também são julgador afirmado — não extraídos, ficam pendentes (🟠), nunca ✅.
  const oc = /(?<![\p{L}\d])(?:c[âa]maras?|c[âa]m\.|turmas?|pleno|plen[áa]rio|reunid[oa]s?|conselho\s+da\s+magistratura|se[çc](?:[ãa]o|[õo]es)(?:\s+c[ií]ve(?:l|is)|\s+criminais?|\s+especial)?|col[ée]gio\s+recursal|t\.\s*r\.|corte\s+(?:especial|suprema)|[óo]rg[ãa]o\s+(?:julgador|especial|fracion[áa]rio)|[óo]rg[ãa]o\s+especial|varas?|juizados?|comarcas?)(?![\p{L}\d])/iu.exec(resto);
  if (oc) out.push(`órgão julgador («${emLinha(cit.slice(Math.max(0, oc.index - 25), oc.index + 45))}»)`);
  const rl = /\b(?:rel(?:ator|atora|a)?\b\.?|relatoria|da\s+lavra|redator(?:a)?\b|reda[çc][ãa]o\s+do\s+ac)/i.exec(resto)
    || /\b(?:[Dd]es(?:embargador(?:a)?|a)?|DES(?:EMBARGADOR(?:A)?|A)?)(?:\(a\)|[ªº]|\b)\.?\s*[ªº]?\.?\s+[A-ZÀ-Ý]|\b(?:[Jj]u[ií]z(?:a)?|JU[IÍ]Z(?:A)?)\s+(?:(?:de\s+[Dd]ireito|DE\s+DIREITO|[Cc]onvocad[oa]|CONVOCAD[OA]|[Ss]ubstitut[oa]|SUBSTITUT[OA]|[Rr]elator(?:a)?|RELATOR(?:A)?)\b|[A-ZÀ-Ý])|\b(?:[Mm]in(?:istr[oa])?|MIN(?:ISTR[OA])?)\b\.?\s+[A-ZÀ-Ý]/.exec(resto);
  if (rl) out.push(`relator («${emLinha(cit.slice(rl.index, rl.index + 60))}»)`);
  for (const d of resto.matchAll(RE_DATA_SOLTA)) {
    if (RE_NAO_DATA_DO_JULGAMENTO.test(resto.slice(Math.max(0, d.index - 40), d.index))) continue;
    out.push(`data «${emLinha(d[0])}»`);
  }
  return out;
}

/** O que a peça diz ao lado de cada ocorrência, dentro da própria citação (entre a fronteira anterior e a seguinte, até 300 caracteres). */
function ocorrencias(t) {
  const ms = [...t.matchAll(RE_NUM)];
  return ms.map((m, i) => {
    const ini = Math.max(i ? ms[i - 1].index + ms[i - 1][0].length : 0, m.index - 300);
    const fim = Math.min(i + 1 < ms.length ? ms[i + 1].index : t.length, m.index + m[0].length + 300);
    let antes = t.slice(ini, m.index), depois = t.slice(m.index + m[0].length, fim);
    const f = FRONTEIRA.exec(depois); if (f) depois = depois.slice(0, f.index);
    const partes = antes.split(/\n|;\s/); antes = partes[partes.length - 1].slice(-160);
    const FG = new RegExp(FRONTEIRA.source, "g"); let ult = -1; for (const x of antes.matchAll(FG)) ult = x.index;
    if (ult >= 0) { const resto = antes.slice(ult); const fimCit = resto.search(/\)|,\s+(?:e\s+)?(?:quanto|como|pelo|pela|que|n[oa]\s|desta|deste|esta|este)\b/); antes = fimCit >= 0 ? resto.slice(fimCit + 1) : ""; }
    const jan = antes + " " + depois;
    const cams = [...jan.matchAll(RE_CAMARA_PECA)].map((c) => camaraNorm(c[1], c[2]));
    const semNum = jan.replace(new RegExp(RE_CAMARA_PECA.source, "gi"), (x) => " ".repeat(x.length));
    for (const c of semNum.matchAll(RE_COLEGIADO_PECA)) cams.push(capitular(c[0]));
    const rel = RE_REL_PECA.exec(depois) || RE_REL_PECA.exec(antes);
    const dt = dataDoJulgamento(depois) || dataDoJulgamento(antes);
    // a citação propriamente dita: do último "(", ":" ou "TJRO" antes do número em diante (a prosa anterior não é afirmação sobre o julgado)
    const kCit = Math.max(antes.lastIndexOf("("), antes.lastIndexOf(":"), antes.lastIndexOf("TJRO"));
    const pendentes = pendentesDaCitacao((kCit >= 0 ? antes.slice(kCit) : antes) + " " + depois, [rel && rel[0], dt && dt[0]]);
    return { d: m.slice(1, 7).join(""), camaras: [...new Set(cams)], pendentes, relator: rel ? rel[1].replace(/[.,;]+$/, "") : null, data: dt ? (dt[2] ? dataBr(dt[1], dt[2], dt[3]) : (MESES.indexOf(fold(dt[4])) >= 0 ? dataBr(dt[1], String(MESES.indexOf(fold(dt[4])) + 1), dt[5]) : null)) : null };
  });
}

const diaDe = (br) => { const [d, m, a] = String(br || "").split("/").map(Number); return d && m && a ? Date.UTC(a, m - 1, d) : NaN; };
/** A data que a peça dá aparece no próprio acórdão (sessão, assinatura), em número ou por extenso? */
function dataNoTexto(br, texto) {
  const [d, m, a] = br.split("/"); const tf = fold(texto);
  const num = new RegExp(`(?<![0-9])0?${+d}[./-]0?${+m}[./-](?:${a}|${a.slice(2)})(?![0-9])`);
  const ext = new RegExp(`(?<![0-9])0?${+d}\\s*(?:º|o)?\\s+de\\s+${MESES[+m - 1]}\\s+de\\s+${a}`);
  return num.test(tf) || ext.test(tf);
}

// Leva A (red team 22/10/2026): a data da peça casava com QUALQUER data do inteiro teor — a da sentença de 1º grau ("proferida em
// 02/02/2022") ou a de um REsp citado no voto — e a linha saía ✅ "data". Agora só vale a data do JULGAMENTO: o fecho (do último
// "acordam os Magistrados/Desembargadores" em diante, 1.500 caracteres: proclamação, "Porto Velho, 05 de outubro de 2026" e
// assinatura), o rótulo de sessão ou data do julgamento no cabeçalho, e a assinatura final de documento sem fecho. NÃO entram os
// últimos N caracteres soltos: nas ementas do modelo CNJ a "Jurisprudência relevante citada" fica colada ao fecho e traz
// "j. 21/03/2024" de outros processos (medido nos recibos reais). Sem âncora, a data não é confirmada pelo texto (fica a do índice).
// Reataque Fable 2 (24/10/2026, id 35982682): o fecho próprio do PJe também se escreve "acordam os (as) magistrados (as) da …" — a
// grafia não casava e o último "acordam" lido era o de um acórdão de 2007 TRANSCRITO no voto.
// Reataque Fable 3 (24/10/2026): o PDF quebra a palavra do fecho PRÓPRIO ("acordam os d esembargadores" — 1097247, 1107014, 1111897,
// 831062, 833502, 992244; "acordam os m agistrados" — 31582106; "acordam os a(s) magistrados (as)" — 30931415): tolera espaço entre as
// letras e o "a(s)". Sem isso, um fecho TRANSCRITO pouco antes virava o último "acordam" e a data dele saía ✅.
const soltas = (w) => w.split("").join(String.raw`\s?`);
const RE_FECHO_ACORDAM = new RegExp(String.raw`acordam\s+os\s*(?:\(\s*as\s*\)\s*|a\s*\(\s*s\s*\)\s*)?(?:${soltas("magistrad")}\s?[oa]\s?s|${soltas("desembargador")}\s?(?:e\s?s|a\s?s))`, "gi");
// Medição cega da amostra A (23/10/2026): o cabeçalho do PJe escreve "Data julgamento: 15/05/2023" (sem "de"), e quem citava essa
// data levava 🟠 "pode ser a da sentença". O rótulo sem preposição vale com os dois-pontos, e só aqui (primeiros 2.500 caracteres).
const RE_ROTULO_SESSAO = /(?:sess[ãa]o(?:\s+(?:virtual|presencial|ordin[áa]ria|extraordin[áa]ria|telepresencial|h[íi]brida|de\s+julgamento))*\s*(?:de|do\s+dia|realizada\s+em|iniciada\s+em|:)|data\s+d[oe]\s+julgamento\s*:?|data\s+julgamento\s*:)/gi;
const RE_ASSINATURA = /(?:Porto\s+Velho|Ji-Paran[aá]|Cacoal|Vilhena|Ariquemes|Guajar[aá]-Mirim|Rolim\s+de\s+Moura|Jaru|Ouro\s+Preto\s+do\s+Oeste)\s*(?:[\/–-]\s*RO\b)?\s*,?\s*(?:\d{1,2}\s*(?:º|o)?\s+de\s+[A-Za-zç]+\s+de\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi;
// Pendência do red team (22/10/2026): o TJRO concatena documentos no mesmo inteiro teor e os 1.500 caracteres depois do último
// "acordam" atravessavam o fecho e entravam no CABEÇALHO do documento seguinte ("Poder Judiciário do Estado de Rondônia 1ª Câmara
// Cível Data de distribuição: … Data do julgamento: 14/08/2018" — a data do julgamento ANTERIOR, rótulo de cadastro) ou na ementa
// de outro julgado transcrita adiante ("(TJ-RO - APELAÇÃO CÍVEL: …, Data de Julgamento: …)"). A janela agora para no primeiro
// desses marcos (depois dos primeiros 60 caracteres, que são o próprio "acordam os Magistrados da … Câmara").
// Reataque da amostra B (24/10/2026): o cabeçalho do PJe também escreve "Data distribuição:" (sem preposição) — entra aqui.
const RE_CABECALHO_SEGUINTE = /Poder\s+Judici[áa]rio|PODER\s+JUDICI[ÁA]RIO|Data\s+(?:d[eoa]\s+)?(?:distribui|redistribui|interposi|autua)|\bRELAT[ÓO]RIO\b|\bEMENTA\b|\((?:TJ-?[A-Z]{2}|TJ|STJ|STF|TRF|TST|TRT)\b/;   // "(TJRO, AC …)" também (Fable 3, A14)
// Reataque da amostra B (24/10/2026, id 23688921): a janela de 60 caracteres depois do rótulo engolia o rótulo SEGUINTE do
// cabeçalho ("Data do julgamento: 08/03/2024 Data de distribuição: 01/02/2018 …") e a data da DISTRIBUIÇÃO confirmava ✅ a
// citação que a dava como data do julgamento. Agora vale só a PRIMEIRA data colada ao rótulo (separada por espaço, dois-pontos ou
// hífen; hora "16:51:50" pode vir depois) e, na sessão virtual, o intervalo "de X a Y" — nada além.
// "Data do julgamento: Sessão Eletrônica n. 935 de 09/12/2024 a 13/12/2024" (cabeçalho real): o nome da sessão pode vir entre o
// rótulo e a data; "1º/07/2025" também é data colada.
const DATA_ROTULO = String.raw`(?:\d{1,2}º?[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s*(?:º|o)?\s+de\s+[A-Za-zÀ-ÿç]+\s+de\s+\d{4})`;
const NOME_SESSAO = String.raw`(?:Sess[ãa]o(?:\s+[A-Za-zÀ-ÿ]+){0,2}(?:\s+n[º°.o]*\s*\d+)?\s+(?:de|em|do\s+dia|realizada\s+em|iniciada\s+em)\s+)?`;
const RE_DATA_COLADA = new RegExp(String.raw`^[\s:–-]{0,4}${NOME_SESSAO}(${DATA_ROTULO})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?(?:\s*(?:a|até|à|e)\s+(${DATA_ROTULO}))?`, "i");
export function dataColadaAoRotulo(depoisDoRotulo) {
  const m = RE_DATA_COLADA.exec(String(depoisDoRotulo || "").slice(0, 80));
  return m ? m[0].trim().replace(/^[:–-]\s*/, "") : "";
}
export function fimDoFecho(janela) {
  const m = RE_CABECALHO_SEGUINTE.exec(janela.slice(60));
  return m ? janela.slice(0, 60 + m.index) : janela;
}
// Reataque da amostra B (24/10/2026, id 21363380): fecho "VENCIDOS O RELATOR E O DES. TORRES FERREIRA. LAVRARÁ O ACÓRDÃO O DES.
// KIYOCHI MORI" seguido da assinatura "Relator Des. ISAIAS FONSECA MORAES" — a citação com o relator VENCIDO saía ✅ pelo cabeçalho.
// Lê no fecho (último "acordam", até o cabeçalho seguinte) se o relator ficou vencido e quem lavra o acórdão ("lavrará o acórdão o
// Des. X" ou "X RELATOR PARA O ACÓRDÃO"). O nome só é aceito em MAIÚSCULAS iniciais (sem flag i), para não pegar texto corrido.
// 1.41.9: as fórmulas moram em vencido.js, fonte única com a custódia (aqui, só o relator vencido POR INTEIRO).
const PALAVRA_NOME = String.raw`[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]+`;
const RE_NOME_APOS = new RegExp(String.raw`^(?:(?:Des(?:embargador|embargadora|a)?|DES(?:EMBARGADOR|EMBARGADORA|A)?|Juiz|Juíza|JUIZ|JUÍZA)\.?\s+(?:(?:[Cc]onvocad[oa]|CONVOCAD[OA])\s+)?)?(${PALAVRA_NOME}(?:\s+(?:d[aeo]s?\s+|D[AEO]S?\s+)?${PALAVRA_NOME}){0,6})`);
const TITULO_FECHO = /^(?:DES|DESA|DESEMBARGADOR|DESEMBARGADORA|JUIZ|JUÍZA|CONVOCADO|CONVOCADA|RELATOR|RELATORA)\.?$/;
export function relatorVencidoNoFecho(texto, indice, rec = {}) {
  const t = String(texto || "");
  // Reataque Fable 2: o fecho é o do PRÓPRIO julgamento (escolherFecho), não o último "acordam" — que pode ser de acórdão transcrito
  const esc = escolherFecho(t, indice, candidatosDoCabecalho(t).cands, rec && rec.tipo).fecho;
  if (!esc) return { vencido: false, redator: null };
  const f = esc.janela;
  const vencido = relatorVencidoTotal(f);
  let redator = null;
  const lv = RE_LAVRARA.exec(f);
  const corta = (nome) => { const ws = nome.split(/\s+/); const k = ws.findIndex((w) => /^(?:Porto|PORTO|Relator|RELATOR|Relatora|RELATORA|Sess[ãa]o|SESS[ÃA]O|Vencid|VENCID)/.test(w)); const r = (k >= 0 ? ws.slice(0, k) : ws); while (r.length && /^(?:d[aeo]s?|D[AEO]S?)$/.test(r[r.length - 1])) r.pop(); return r.length >= 2 ? r.join(" ") : null; };
  if (lv) { const n = RE_NOME_APOS.exec(f.slice(lv.index + lv[0].length)); if (n) redator = corta(n[1]); }
  if (!redator) {
    const pa = RE_PARA_ACORDAO.exec(f);
    if (pa) {
      // assinatura: "DESEMBARGADOR GLODNER LUIZ PAULETTO RELATOR PARA O ACÓRDÃO" — a sequência de palavras em CAIXA ALTA antes do rótulo
      const antes = f.slice(Math.max(0, pa.index - 120), pa.index).trim().split(/\s+/);
      const nome = [];
      for (let i = antes.length - 1; i >= 0; i--) {
        const w = antes[i];
        if (!/^[A-ZÀ-Ý][A-ZÀ-Ý'-]*\.?$/.test(w) || TITULO_FECHO.test(w)) break;
        nome.unshift(w);
      }
      while (nome.length && /^D[AEO]S?$/.test(nome[0])) nome.shift();
      if (nome.length >= 2) redator = nome.join(" ");
      else {
        const n = RE_NOME_APOS.exec(f.slice(pa.index + pa[0].length).replace(/^\s*:\s*/, ""));
        if (n && /^\s*:/.test(f.slice(pa.index + pa[0].length))) redator = corta(n[1]);
      }
    }
  }
  return { vencido, redator };
}
// O fecho às vezes grafa o nome com erro ("ROWLSON TEIXEIRA", "ROWILSON TEIXIERA" para Rowilson Teixeira): mesma pessoa se confere
// pelo compararRelator ou se os nomes têm a mesma quantidade (2 ou mais) e cada um difere em no máximo 2 letras, 3 no total.
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
export function mesmaPessoa(x, y) {
  if (compararRelator(x, y) === "confere") return true;
  const A = nomesDoRelator(x), B = nomesDoRelator(y);
  if (A.length < 2 || A.length !== B.length) return false;
  const ds = A.map((w, i) => lev(w, B[i]));
  return ds.every((d) => d <= 2) && ds.reduce((x, y) => x + y, 0) <= 3;
}
// Reataque Fable (24/10/2026), dois falsos ✅ de data pelo rótulo do cabeçalho (primeiros 2.500 caracteres):
// (A) "O Apelo, apreciado na sessão de julgamento de 10.02.2022, foi, à unanimidade, não provido" — o relatório dos EMBARGOS narra
//     a sessão do julgamento ANTERIOR (21344385, 22363931 e outros 8 na cópia dos recibos). "sessão … de" só vale como RÓTULO: no
//     início do texto ou de linha, depois de dois-pontos/travessão/"Data (da)", ou depois do cabeçalho do gabinete; nunca depois de
//     artigo, preposição ou particípio narrativo ("apreciado na", "proferido na", "pauta da", "na sessão do dia", "realizada",
//     "anterior"). Nos 6.562 recibos da cópia, nenhuma das 11 "sessões" que davam data por esse caminho era rótulo (as do
//     cabeçalho real vêm depois de "Data do julgamento:", "Sessão Eletrônica n. 935 de …", e continuam valendo).
// (B) "(TJ-RS - AC: 5003998…, Relator: Marcelo Cezar Muller, Data de Julgamento: 26/07/2022, …)" e "Relator(a) do Acórdão: GUILHERME
//     RIBEIRO BALDAN Data de julgamento: 28/08/2024" — rótulo de PRECEDENTE TRANSCRITO na ementa/relatório (29501542, 30391646,
//     32147459, 36871792). O rótulo não vale depois de vírgula/ponto e vírgula, dentro de parênteses/colchetes/aspas abertos, nem
//     no mesmo trecho de "Rel.", "Relator:", "Relator(a) do Acórdão" ou sigla de outro tribunal/recurso (TJ-xx, STJ, STF, TRF, TST,
//     REsp, AgInt…). E o rótulo do próprio cabeçalho só CONFIRMA a data quando bate (±10 dias) com o fecho/assinatura legíveis
//     (o padrão dos rótulos legítimos medidos: bate com a assinatura); divergindo, ou com dois rótulos de datas distantes e sem
//     fecho, ele não entra na região e a citação com aquela data sai 🟠 (rotulosDivergentes), nunca ✅.
const RE_FIM_DO_CABECALHO = /\b(?:RELAT[ÓO]RIO|EMENTA|VOTO)\b|(?<=[\s\S]{20})Poder\s+Judici[áa]rio/;
const RE_PREV_NARRATIVO = /(?:\b(?:na|da|pela|nas|das|pelas|à|a|em|uma|outra|mesma|referida|aludida|citada|última|ultima|anterior|pr[óo]xima|desta|dessa|daquela|naquela|nesta|nessa)|apreciad[oa]s?|proferid[oa]s?|julgad[oa]s?|realizad[oa]s?|ocorrid[oa]s?|designad[oa]s?|pautad[oa]s?|inclu[íi]d[oa]s?|retirad[oa]s?|adiad[oa]s?|sustentad[oa]s?)\s*$/i;
const RE_PREV_ROTULO_SESSAO = /(?:^|[\n:|–—-]|\bdata(?:\s+d[ao])?)\s*$/i;
function sessaoEhRotulo(cab, m) {
  const prev = cab.slice(Math.max(0, m.index - 60), m.index);
  if (RE_PREV_ROTULO_SESSAO.test(prev)) return true;
  if (RE_PREV_NARRATIVO.test(prev)) return false;
  // sem preposição/artigo antes: só "Sessão"/"SESSÃO" com inicial maiúscula (rótulo de cabeçalho), não "sessão" no meio da frase
  return /^S/.test(m[0]);
}
const RE_CITACAO_PREV = /Relator(?:\s*\(\s*a\s*\))?\s+(?:p(?:ara|\/)\s+o\s+)?do\s+Ac[óo]rd[ãa]o|Relator(?:\s*\(\s*a\s*\)|a)?\s*\.?\s*:|\bRel\.\s|\bRelator(?:a)?\s+(?:Ministr|Min\.|Des(?:embargador(?:a)?|a)?\b\.?|Ju[ií]z(?:a)?\b)|\bTJ-?(?!RO\b)[A-Z]{2}\.|\((?:TJ|STJ|STF|TRF|TST|TRT)\b|\b(?:TJ-?(?!RO\b)[A-Z]{2}|STJ|STF|TRF\s*\d?|TST|TRT\s*\d*|REsp|AREsp|AgRg|AgInt|EDcl|RHC|HC|RE|ARE|AI|AC)\s*(?:[:\-–]|n[º°.]|\d)/;
function rotuloEmCitacao(cab, m) {
  const prev = cab.slice(Math.max(0, m.index - 250), m.index);
  if (/[,;]\s*$/.test(prev)) return true;
  const abre = (a, f) => (prev.split(a).length - 1) > (prev.split(f).length - 1);
  if (abre("(", ")") || abre("[", "]") || abre("“", "”") || (prev.split('"').length - 1) % 2 === 1) return true;
  // o trecho do rótulo: depois da última data (o cabeçalho do PJe tem "Relator: Des. X Data distribuição: 24/11/2021 11:24:03 Data
  // julgamento: …"; o "Relator:" fica antes da data de distribuição e não pesa)
  let ini = 0;
  for (const d of prev.matchAll(/\d{1,2}º?[./-]\d{1,2}[./-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g)) ini = d.index + d[0].length;
  return RE_CITACAO_PREV.test(prev.slice(ini).slice(-200));
}
/** Rótulos de data do julgamento no cabeçalho (primeiros 2.500 caracteres), antes da decisão: candidatos e sessões narradas. */
function candidatosDoCabecalho(texto) {
  const cab = String(texto || "").slice(0, 2500);
  const cands = [], narrados = [];
  // o cabeçalho do PRÓPRIO documento acaba no primeiro RELATÓRIO/EMENTA/VOTO ou no "Poder Judiciário" de um documento concatenado
  // (1107014: dois embargos no mesmo inteiro teor, "Data do julgamento: 18/08/2020" e, depois do fecho do 1º, "… 21/07/2020").
  // Na cópia dos recibos, nenhum rótulo que bate com o fecho/assinatura fica depois desse marco.
  const h = RE_FIM_DO_CABECALHO.exec(cab), fimCab = h ? h.index : cab.length;
  for (const m of cab.matchAll(RE_ROTULO_SESSAO)) {
    const dt = dataColadaAoRotulo(cab.slice(m.index + m[0].length));
    if (!dt) continue;
    if (/^sess/i.test(m[0]) && !sessaoEhRotulo(cab, m)) { narrados.push(`${m[0]} ${dt}`); continue; }
    if (!/^sess/i.test(m[0]) && rotuloEmCitacao(cab, m)) continue;   // precedente transcrito: não é data deste julgamento
    // Reataque Fable 3 (30445817: "Sessão Eletrônica n. 993 de 02/02/2026 a 06/02/2025", ano errado no próprio documento): o intervalo
    // só vale em bloco se for ordenado e de até 10 dias; fora disso, cada data é um candidato e se confirma (ou não) sozinha.
    const dd = datasDaRegiao(dt.replace(/º/g, ""));
    const soltasDt = dd.length === 2 && !(dd[1] >= dd[0] && dd[1] - dd[0] <= FOLGA_DATA_FECHO_DIAS * DIA_MS) ? [...dt.matchAll(new RegExp(DATA_ROTULO, "gi"))].map((x) => x[0]) : [];
    // Reataque Fable 4 (N9: "de 02/02/2026 a 06/03/2026", erro de mês, fecho 22/01, índice 20/03): a data que nasce de intervalo
    // dividido guarda a outra metade (dividido); ver sessaoDepoisDoVoto em decidirRotulos.
    for (const p of soltasDt.length === 2 ? soltasDt : [dt]) cands.push({ txt: `${m[0]} ${p}`, dias: datasDaRegiao(p.replace(/º/g, "")), proprio: m.index < fimCab,
      dividido: soltasDt.length === 2 ? datasDaRegiao(soltasDt.find((x) => x !== p).replace(/º/g, "")) : null });
  }
  return { cands, narrados };
}
const DIA_MS = 864e5;
// Reataque Fable 2 (24/10/2026), item 3 — 20 de 24 rótulos "Data julgamento:" do cabeçalho do PJe que divergiam do fecho por mais
// de 10 dias ficavam DEPOIS do fecho (11 a 28 dias) e ANTES da data do índice (3 a 29 dias): o fecho é a data do voto depositado e
// o rótulo, a da sessão virtual (22165638: voto 22/11/2023, rótulo 06/12/2023, índice 12/12/2023). Medido na cópia dos recibos (6.562):
// nos rótulos aceitos (±10 dias do fecho), o índice fica de 3 dias antes a mais de 45 depois do rótulo; nos divergentes, 3 a 29 dias
// depois. O rótulo do PRÓPRIO cabeçalho vale então quando TODO fecho/assinatura lido fica até 45 dias ANTES dele e o índice (âncora
// independente) fica de 0 a 30 dias DEPOIS dele. Sem índice, ou fora dessas faixas, continua 🟠 (rotulosDivergentes). Precedente
// transcrito e data de distribuição colada nem chegam aqui (rotuloEmCitacao, dataColadaAoRotulo).
export const FOLGA_ROTULO_APOS_FECHO_DIAS = 45, FOLGA_INDICE_APOS_ROTULO_DIAS = 30;
function decidirRotulos(cands, ancora, indice) {
  const perto = (xs, ys) => !xs.length || xs.some((x) => ys.some((y) => Math.abs(x - y) <= FOLGA_DATA_FECHO_DIAS * DIA_MS));
  if (ancora.length) {
    const idx = diaDe(indice);
    // Metade de intervalo dividido só usa esta regra se a outra metade for impossível como data deste julgamento (mais de 10 dias
    // ANTES de todo fecho/assinatura: B3c, "06/12/2023 a 01/02/2018"). Se as duas metades caem depois do voto (N9), não se sabe qual
    // foi digitada errado: só vale a proximidade (±10 dias) do fecho/assinatura.
    const outraMetadeImpossivel = (c) => !c.dividido || (c.dividido.length > 0 && c.dividido.every((d) => ancora.every((a) => a - d > FOLGA_DATA_FECHO_DIAS * DIA_MS)));
    const sessaoDepoisDoVoto = (c) => c.proprio && outraMetadeImpossivel(c) && !Number.isNaN(idx) && c.dias.length > 0 && c.dias.every((d) =>
      ancora.every((a) => d - a > 0 && d - a <= FOLGA_ROTULO_APOS_FECHO_DIAS * DIA_MS) && idx - d >= 0 && idx - d <= FOLGA_INDICE_APOS_ROTULO_DIAS * DIA_MS);
    const ok = cands.filter((c) => perto(c.dias, ancora) || sessaoDepoisDoVoto(c));
    return { aceitos: ok.map((c) => c.txt), divergentes: cands.filter((c) => !ok.includes(c)).map((c) => c.txt) };
  }
  // sem fecho/assinatura legíveis: vale o rótulo do cabeçalho do próprio documento; dois rótulos dele com datas distantes entre si
  // — nenhum confirma. Rótulo depois do cabeçalho só entra se bater com o do cabeçalho.
  const prop = cands.filter((c) => c.proprio);
  const brigam = prop.some((c) => prop.some((o) => o !== c && o.dias.length && !perto(c.dias, o.dias)));
  const ok = brigam ? [] : prop;
  const dias = ok.flatMap((c) => c.dias);
  const aceitos = cands.filter((c) => ok.includes(c) || (!c.proprio && dias.length && perto(c.dias, dias)));
  return { aceitos: aceitos.map((c) => c.txt), divergentes: cands.filter((c) => !aceitos.includes(c)).map((c) => c.txt) };
}
/** Compatível com a 1.41.9: rótulos aceitos e divergentes contra as datas-âncora dadas (sem índice). */
export function rotulosDoCabecalho(texto, ancora = [], indice) {
  const { cands, narrados } = candidatosDoCabecalho(texto);
  return { ...decidirRotulos(cands, ancora, indice), narrados };
}

// Reataque Fable 2 (24/10/2026), item 1 — FECHO TRANSCRITO. O voto/sentença transcreve acórdão com fecho próprio ("ACÓRDÃO Vistos …
// acordam os Desembargadores da 2ª Câmaras Especial … Porto Velho, 29 de maio de 2012 DESEMBARGADOR(A) … (PRESIDENTE) Sendo assim,
// considerando …" — 143609392, 143873392, 143887174; 35982682 no voto de 2007), e o último "acordam" virava o fecho DESTE
// julgamento. Medido na cópia dos recibos (6.562): dos 4.057 fechos datados, os 11 seguidos de texto corrido depois da assinatura
// eram todos transcritos (data 237 a 6.909 dias longe do índice), salvo 3 repetições do próprio fecho (o "ACÓRDÃO Vistos …"
// seguinte é limite, como "Poder Judiciário"/"RELATÓRIO" do documento concatenado). Fecho no FIM do texto (nada além da assinatura)
// continua valendo sem âncora (15 fechos reais ficam a mais de 90 dias do índice). Fecho seguido de texto só vale se uma âncora
// independente confirmar a data: índice ±45 dias, rótulo do cabeçalho do próprio documento ou assinatura final fora de fecho ±10
// dias. Sem confirmação, não entra na região: com âncora, é TRANSCRITO (citação com a data dele não é ✅); sem nenhuma âncora, 🟠.
const RE_LIMITE_APOS_FECHO = /Poder\s+Judici[áa]rio|PODER\s+JUDICI[ÁA]RIO|\bRELAT[ÓO]RIO\b|Data\s+(?:d[eoa]\s+)?(?:distribui|redistribui|interposi|autua)|\bAC[ÓO]RD[ÃA]O\s+Vistos|\b[Aa]cordam\s+os\b|\bACORDAM\s+OS\b/;
const RE_PALAVRA_MINUSCULA = /(?<![A-Za-zÀ-ÿ])[a-zà-ÿ]{4,}(?![A-Za-zÀ-ÿ])/g;
function seguidoDeTexto(resto) {
  let seg = resto.replace(/https?:\/\/\S+/g, " ");
  const h = RE_LIMITE_APOS_FECHO.exec(seg);
  if (h) seg = seg.slice(0, h.index);
  seg = seg.trim();
  // a assinatura real tem até ~100 caracteres ("Gabinete Des. X / Desembargador(a) Y RELATOR PARA O ACÓRDÃO"), quase sem minúsculas
  return seg.length > 300 || (seg.slice(0, 1500).match(RE_PALAVRA_MINUSCULA) || []).length >= 6;
}
// Reataque Fable 2, item 2 — no fecho só valem a data da assinatura ("Porto Velho, 05 de outubro de 2026") e a da SESSÃO ("NA SESSÃO N.
// 717, JULGADA ENTRE OS DIAS 21/07/2025 E 25/07/2025", 29892933). A data dentro da PROCLAMAÇÃO ("PRESCRIÇÃO … DAS PARCELAS ANTERIORES
// A 26/02/2019", 25907338, 35946026, 36323171) não é data do julgamento. Medido: nos fechos da cópia, fora da assinatura só aparecem
// essas datas de proclamação e a sessão do 29892933.
// Reataque Fable 3 (A4/A4b/A4c): "ANULAR A SESSÃO DO TRIBUNAL DO JÚRI REALIZADA EM 10/05/2022", "NULIDADE DA SESSÃO DE 10/05/2022",
// "ACÓRDÃO JULGADO EM 12/03/2020" são PROCLAMAÇÃO. Só vale "sessão" seguida de número, "eletrônica" ou "virtual" ("NA SESSÃO N. 717,
// JULGADA ENTRE OS DIAS …") e "julgado(a) entre os dias"; nunca "sessão do júri", "sessão de <data>" nem "julgado em" solto.
const RE_SESSAO_FECHO = new RegExp(String.raw`(?:sess[ãa]o\s+(?:n[º°.o]*\s*\d+|eletr[ôo]nica|virtual)\b[^;]{0,60}?(?:entre\s+os\s+dias|realizada\s+em|iniciada\s+em|do\s+dia|de|em|:)|julgad[oa]s?\s+entre\s+os\s+dias)\s*${DATA_ROTULO}(?:\s*(?:a|até|à|e)\s+${DATA_ROTULO})?`, "gi");
function datasDoFecho(janela) {
  return [...[...janela.matchAll(RE_ASSINATURA)].map((m) => m[0]), ...[...janela.matchAll(RE_SESSAO_FECHO)].map((m) => m[0])].join(" \n ");
}
function fechosDoTexto(t) {
  const out = [];
  for (const m of t.matchAll(RE_FECHO_ACORDAM)) {
    const janela = fimDoFecho(t.slice(m.index, m.index + 1500));
    // a assinatura do fecho é a PRIMEIRA da janela: a seguinte (depois de texto corrido) já é a da sentença/voto que transcreve
    const ass = new RegExp(RE_ASSINATURA.source, "i").exec(janela);
    const datas = datasDoFecho(ass && seguidoDeTexto(janela.slice(ass.index + ass[0].length)) ? janela.slice(0, ass.index + ass[0].length) : janela);
    // 24/10/2026: fecho seguido de texto termina na PRIMEIRA assinatura — a janela de 1.500 caracteres não pode engolir a assinatura
    // final do próprio documento (sentença que transcreve acórdão perto do fim perdia a sua data, e só o índice a confirmava)
    const corte = ass && seguidoDeTexto(janela.slice(ass.index + ass[0].length)) ? ass.index + ass[0].length : janela.length;
    out.push({ ini: m.index, fim: m.index + corte, janela, datas, dias: datasDaRegiao(datas),
      seguido: ass ? seguidoDeTexto(t.slice(m.index + ass.index + ass[0].length)) : false });
  }
  return out;
}
function assinaturaFinal(t, fora = []) {
  const base = Math.max(0, t.length - 600);
  let ass = null;
  for (const m of t.slice(base).matchAll(RE_ASSINATURA)) { const pos = base + m.index; if (!fora.some((f) => pos >= f.ini && pos < f.fim)) ass = m; }
  return ass;
}
// Reataque Fable 3 (A1, A2, A5, A6): em recibo de tipo diferente de ACÓRDÃO (SENTENÇA, VOTO, DECISÃO, RELATÓRIO, EMENTA) o fecho
// "acordam" é sempre de acórdão TRANSCRITO. Medido na cópia dos recibos (6.562): nenhum desses tem fecho próprio; os 7 que trazem
// fecho (5 sentenças, 2 votos) estão a mais de 200 dias do índice. Sem tipo (chamada antiga), nada muda.
export const tipoNaoAcordao = (tipo) => !!tipo && !/^\s*AC[ÓO]RD[ÃA]O\s*$/i.test(String(tipo));
function escolherFecho(t, indice, cands, tipo) {
  const fs = fechosDoTexto(t), transcritos = [], duvidosos = [];
  if (!fs.length) return { fecho: null, todos: fs, transcritos, duvidosos };
  const idx = diaDe(indice);
  const ass = assinaturaFinal(t, fs);
  const curtas = [...(ass ? datasDaRegiao(ass[0]) : []), ...cands.filter((c) => c.proprio).flatMap((c) => c.dias)];
  const temAncora = !Number.isNaN(idx) || curtas.length > 0;
  const confirma = (f) => f.dias.some((d) => (!Number.isNaN(idx) && Math.abs(d - idx) <= FOLGA_DATA_INDICE_DIAS * DIA_MS) || curtas.some((a) => Math.abs(a - d) <= FOLGA_DATA_FECHO_DIAS * DIA_MS));
  let fecho = null;
  for (let i = fs.length - 1; i >= 0; i--) {
    const f = fs[i];
    if (!tipoNaoAcordao(tipo)) {
      if (i === fs.length - 1 && !f.seguido) { fecho = f; break; }   // fecho no fim do texto: o do próprio julgamento
      if (f.dias.length && confirma(f)) { fecho = f; break; }
    }
    if (f.dias.length) (temAncora ? transcritos : duvidosos).push(f);
  }
  return { fecho, todos: fs, transcritos, duvidosos };
}
// Reataque Fable 2, item 4 — sessão de OUTRO julgamento narrada em qualquer ponto do texto ("Em sessão de julgamento, em 25.03.2021, o
// recurso foi provido", 16672067; "julgados em sessão de julgamento na data de 02/07/2018", 8263666; "julgado na sessão do Pleno
// Judiciário do dia 05.05.2014", 10166076; 36620143). Saía 🔴 DIVERGE; a política do item (A) é 🟠 "sessão ANTERIOR".
// Fable 3 (A11): "sessão realizada no dia 25/03/2021" também ("encerrada em" já caía no "em").
const RE_SESSAO_NARRADA = new RegExp(String.raw`sess[ãa]o\b[^;]{0,60}?(?:\b(?:de|em|do\s+dia|no\s+dia|na\s+data\s+de|ocorrida\s+em|realizada\s+em|iniciada\s+em)|,)\s*(${DATA_ROTULO})(?:\s*(?:a|até|à|e)\s+(${DATA_ROTULO}))?`, "gi");
// Reataque Fable 3 (126372232, 129335081: sentença de processo de 2025 assinada "Porto Velho, 19 de Agosto de 2022", modelo
// reaproveitado). A assinatura final fora de fecho não confirma a data quando é anterior ao ano do número CNJ, ou quando fica a mais
// de 30 dias do índice sem fecho/rótulo próprio a até 10 dias dela: sai 🟠. Medido na cópia (486 recibos sem fecho com assinatura
// final): 480 a até 10 dias do índice, 3 a 17–19 dias, 1 a 77 (107623237, mesma data "9 de abril de 2024" de outro processo) e os 2
// de 2022.
export const FOLGA_ASSINATURA_INDICE_DIAS = 30;
function analiseDoJulgamento(texto, indice, rec = {}) {
  const t = String(texto || "");
  const { cands, narrados } = candidatosDoCabecalho(t);
  const esc = escolherFecho(t, indice, cands, rec && rec.tipo);
  const partes = [], assinaturas = [];
  if (esc.fecho) partes.push(esc.fecho.datas);
  const ass = assinaturaFinal(t, esc.todos.filter((f) => f !== esc.fecho));
  if (ass) {
    const da = datasDaRegiao(ass[0]), idx = diaDe(indice), ano = Number(String((rec && rec.nr_processo) || "").replace(/\D/g, "").slice(9, 13));
    const outras = [...(esc.fecho ? esc.fecho.dias : []), ...cands.filter((c) => c.proprio).flatMap((c) => c.dias)];
    const confirmada = da.some((d) => outras.some((o) => Math.abs(o - d) <= FOLGA_DATA_FECHO_DIAS * DIA_MS));
    const antesDoAno = ano > 1900 && da.length > 0 && da.every((d) => new Date(d).getUTCFullYear() < ano);
    const longe = !Number.isNaN(idx) && da.length > 0 && da.every((d) => Math.abs(d - idx) > FOLGA_ASSINATURA_INDICE_DIAS * DIA_MS);
    if (antesDoAno || (longe && !confirmada)) assinaturas.push(ass[0]); else partes.push(ass[0]);
  }
  const ancora = datasDaRegiao(partes.join(" \n "));
  const { aceitos, divergentes } = decidirRotulos(cands, ancora, indice);
  const cab = t.slice(0, 2500), narr = [...narrados];
  for (const m of t.matchAll(RE_SESSAO_NARRADA)) {
    if (esc.fecho && m.index >= esc.fecho.ini && m.index < esc.fecho.fim) continue;   // a sessão do próprio fecho
    if (m.index < cab.length && /^sess/i.test(m[0]) && sessaoEhRotulo(cab, m)) continue;   // rótulo do cabeçalho: decidido acima
    narr.push(m[0]);
  }
  return { regiao: [...partes, ...aceitos].filter(Boolean).join(" \n "), divergentes, narrados: narr, assinaturas,
    transcritos: esc.transcritos.map((f) => f.datas), duvidosos: esc.duvidosos.map((f) => f.datas) };
}
/** As datas DESTE julgamento: assinatura/sessão do fecho próprio, assinatura final e rótulos do cabeçalho que se confirmam. `indice`
 *  (data do índice do portal, opcional) é âncora independente para fecho seguido de texto e rótulo de sessão posterior ao voto.
 *  `rec` (o recibo, opcional): `tipo` (fora de ACÓRDÃO, todo fecho é transcrito) e `nr_processo` (ano do número CNJ). */
export function regiaoDoJulgamento(texto, indice, rec) {
  return analiseDoJulgamento(texto, indice, rec).regiao;
}
/** Rótulos do próprio cabeçalho que NÃO se confirmam, sessões narradas, e fechos de acórdão transcrito (com âncora) ou duvidosos (sem). */
export function rotulosForaDoJulgamento(texto, indice, rec) {
  const { divergentes, narrados, transcritos, duvidosos, assinaturas } = analiseDoJulgamento(texto, indice, rec);
  return { divergentes, narrados, transcritos, duvidosos, assinaturas };
}

/** Datas (dd/mm/aaaa ou por extenso) que a região do julgamento traz, em dias UTC. */
function datasDaRegiao(reg) {
  const tf = fold(reg), out = [];
  for (const m of tf.matchAll(/(?<![0-9])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![0-9])/g)) out.push(diaDe(dataBr(m[1], m[2], m[3])));
  for (const m of tf.matchAll(/(?<![0-9])(\d{1,2})\s*(?:º|o)?\s+de\s+([a-zç]+)\s+de\s+(\d{4})/g)) {
    const k = MESES.indexOf(m[2]);
    if (k >= 0) out.push(diaDe(dataBr(m[1], String(k + 1), m[3])));
  }
  return out.filter((x) => !Number.isNaN(x));
}
// Medição cega da amostra A (23/10/2026): a folga de 45 dias contava da data do ÍNDICE, que fica em média 7 dias (até 59) depois do
// fecho — uma data a +40 dias do julgamento saía 🟠 em 20/20. Com fecho, sessão ou assinatura legíveis, a folga conta da data
// LIDA nelas e é curta (sessão virtual de vários dias, assinatura dias depois); fora dela é 🔴. Sem data legível, fica a dos 45 dias.
export const FOLGA_DATA_FECHO_DIAS = 10, FOLGA_DATA_INDICE_DIAS = 45;

export function auditarCitacoes(texto, pasta) {
  const t = String(texto || "").slice(0, AUDITORIA_MAX_CHARS);
  if (!t.trim()) return "Cole o texto da peça (ou o trecho com as citações) em `texto`.";
  const porNum = new Map();
  for (const o of ocorrencias(t)) {
    const a = porNum.get(o.d) || { camaras: new Set(), relatores: new Set(), datas: new Set(), pendentes: new Set(), vezes: 0 };
    o.camaras.forEach((c) => a.camaras.add(c)); o.pendentes.forEach((x) => a.pendentes.add(x)); if (o.relator) a.relatores.add(o.relator); if (o.data) a.datas.add(o.data); a.vezes++;
    porNum.set(o.d, a);
  }
  const L = [], cont = { vermelho: 0, confira: 0, amarelo: 0, ok: 0, outro: 0 };
  for (const [d, a] of porNum) {
    const num = mascara(d), seg = `${d[13]}.${d.slice(14, 16)}`;
    if (!dvCnjValido(d)) { cont.vermelho++; L.push(`🔴 ${num} — dígito verificador NÃO confere: número digitado errado ou inexistente. Não consulte o portal com ele; corrija pela fonte.`); continue; }
    if (seg !== "8.22") { cont.outro++; L.push(`⚪ ${num} — de outro tribunal (segmento .${seg}.); confira no motor daquele tribunal.`); continue; }
    const rs = recibosDoProcesso(d, pasta).filter((r) => r.texto);
    if (!rs.length) { cont.amarelo++; L.push(`🟡 ${num} — TJRO, número válido, NÃO lido nesta máquina: abra com obter_inteiro_teor_tjro antes de citar (câmara, relator e data não conferidos).`); continue; }
    // um item por JULGAMENTO lido (data), preferindo ACÓRDÃO; se a peça dá a data, compara só com ele
    const julg = new Map();
    for (const r of rs) { const k = r.data_julgamento || "?"; const atual = julg.get(k); if (!atual || (String(r.tipo).toUpperCase() === "ACÓRDÃO" && String(atual.tipo).toUpperCase() !== "ACÓRDÃO") || (r.texto.length > atual.texto.length && atual.tipo === r.tipo)) julg.set(k, r); }
    let alvo = [...julg.values()];
    const avisos = [];
    const confira = [];
    if (a.datas.size) {
      // Estatística estratificada (24/10/2026): a data_julgamento do ÍNDICE do portal não é a do julgamento (nos documentos com
      // cabeçalho "Data julgamento" coincide em 14 de 777; fica de dias a 2 meses depois) e confirmava ✅ sozinha (601/602 na cópia).
      // Só confirma a data uma âncora DO DOCUMENTO (fecho, assinatura, sessão, rótulo do cabeçalho que se confirma — regiaoDoJulgamento).
      // Igual só ao índice: 🟠 com a data que o documento traz (ou "não confirmada no documento" quando ele não traz nenhuma).
      const comData = alvo.filter((r) => [...a.datas].some((dt) => dataNoTexto(dt, regiaoDoJulgamento(r.texto, r.data_julgamento, r))));
      const soIndice = comData.length ? [] : alvo.filter((r) => a.datas.has(r.data_julgamento));
      if (comData.length) alvo = comData;
      else if (soIndice.length) {
        alvo = soIndice;
        const deDia = (x) => { const d = new Date(x); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; };
        const doDoc = [...new Set(alvo.flatMap((r) => datasDaRegiao(regiaoDoJulgamento(r.texto, r.data_julgamento, r))).map(deDia))];
        const dts = [...a.datas].filter((dt) => alvo.some((r) => r.data_julgamento === dt)).join(" / ");
        confira.push(doDoc.length
          ? `a peça diz julgado em ${dts}, que é a data do ÍNDICE do portal; a data do índice do portal difere da do documento: ${doDoc.join(", ")} (fecho/sessão/assinatura/cabeçalho) — confira no acórdão qual é a data do julgamento`
          : `a peça diz julgado em ${dts}, que é a data do ÍNDICE do portal, não confirmada no documento (o recibo não traz fecho, sessão, assinatura nem rótulo do cabeçalho com data legível; o índice costuma trazer data posterior ao julgamento) — confira no acórdão`);
      } else {
        const lidas = [...new Set(alvo.flatMap((r) => datasDaRegiao(regiaoDoJulgamento(r.texto, r.data_julgamento, r))))];
        const perto = lidas.length
          ? [...a.datas].every((dt) => lidas.some((k) => Math.abs(diaDe(dt) - k) <= FOLGA_DATA_FECHO_DIAS * 864e5))
          : [...a.datas].every((dt) => [...julg.keys()].some((k) => Math.abs(diaDe(dt) - diaDe(k)) <= FOLGA_DATA_INDICE_DIAS * 864e5));
        const deDia = (x) => { const d = new Date(x); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; };
        const folga = lidas.length
          ? ` (o fecho/sessão/assinatura lidos trazem ${[...new Set(lidas.map(deDia))].join(", ")}${perto ? `; a data da peça fica a até ${FOLGA_DATA_FECHO_DIAS} dias deles — sessão de vários dias ou assinatura posterior?` : ""})`
          : (perto ? ` (até ${FOLGA_DATA_INDICE_DIAS} dias da data do índice, e o recibo não tem fecho/sessão com data legível: o índice pode guardar a data da assinatura, não a da sessão)` : "");
        // a data existe em outro ponto do texto (cabeçalho de distribuição, sentença, precedente citado, juntada), não como data deste julgamento
        const noCorpo = [...a.datas].filter((dt) => alvo.some((r) => dataNoTexto(dt, r.texto)));
        // Reataque Fable (24/10/2026): data de rótulo do cabeçalho que diverge do fecho/assinatura, ou de sessão ANTERIOR narrada
        // no relatório — nem ✅ nem 🔴: pode ser a data de outro julgamento do mesmo processo (não lido aqui) ou o rótulo de cadastro.
        const fora = alvo.map((r) => rotulosForaDoJulgamento(r.texto, r.data_julgamento, r));
        let jaExplicada = false;
        const doRotulo = [...a.datas].filter((dt) => fora.some((f) => f.divergentes.some((x) => dataNoTexto(dt, x))));
        // Reataque Fable 2: data do fecho de acórdão TRANSCRITO (com âncora que o desmente) ou de fecho seguido de texto sem âncora
        const transcrita = [...a.datas].filter((dt) => fora.some((f) => f.transcritos.some((x) => dataNoTexto(dt, x))));
        const duvidosa = [...a.datas].filter((dt) => !transcrita.includes(dt) && fora.some((f) => f.duvidosos.some((x) => dataNoTexto(dt, x))));
        // Fable 3: assinatura final de modelo reaproveitado (anterior ao ano do processo, ou longe do índice sem outra âncora)
        const assinada = [...a.datas].filter((dt) => !transcrita.includes(dt) && !duvidosa.includes(dt) && fora.some((f) => f.assinaturas.some((x) => dataNoTexto(dt, x))));
        if (assinada.length) confira.push(`a peça diz julgado em ${assinada.join(" / ")}, que é a data da assinatura final do documento, mas ela é anterior ao ano do número do processo ou fica a mais de ${FOLGA_ASSINATURA_INDICE_DIAS} dias da data do índice sem fecho nem rótulo que a confirme (modelo reaproveitado?) — confira no documento`);
        const narrada = [...a.datas].filter((dt) => !transcrita.includes(dt) && !duvidosa.includes(dt) && !assinada.includes(dt) && fora.some((f) => f.narrados.some((x) => dataNoTexto(dt, x))));
        if (transcrita.length) avisos.push(`a peça diz julgado em ${transcrita.join(" / ")}, que é a data do fecho de um acórdão TRANSCRITO no texto (seguido de texto corrido e longe da data do índice, do cabeçalho e da assinatura deste documento): é outro julgamento, provavelmente de outro processo; os julgamentos lidos deste processo são de ${[...julg.keys()].join(", ")}`);
        if (duvidosa.length) confira.push(`a peça diz julgado em ${duvidosa.join(" / ")}, que é a data de um fecho seguido de texto corrido (pode ser acórdão TRANSCRITO) e o recibo não tem índice, cabeçalho nem assinatura datados que o confirmem — confira no acórdão`);
        if (transcrita.length || duvidosa.length || assinada.length) { if ([...a.datas].every((dt) => transcrita.includes(dt) || duvidosa.includes(dt) || assinada.includes(dt))) jaExplicada = true; }
        if (doRotulo.length || narrada.length) {
          const lidasTxt = lidas.length ? `o fecho/sessão/assinatura lidos trazem ${[...new Set(lidas.map(deDia))].join(", ")}` : `os julgamentos lidos deste processo são de ${[...julg.keys()].join(", ")}`;
          if (doRotulo.length) confira.push(`a peça diz julgado em ${doRotulo.join(" / ")}, que é a data do rótulo "data do julgamento"/sessão do cabeçalho, mas ${lidasTxt} (ou o cabeçalho traz dois rótulos de datas distantes): o rótulo diverge do fecho e não confirma — confira no acórdão qual é a data da sessão`);
          if (narrada.length) confira.push(`a peça diz julgado em ${narrada.join(" / ")}, que é a data de uma sessão ANTERIOR narrada no relatório/voto deste documento (outro julgamento, do mesmo processo ou de precedente citado, não lido aqui); ${lidasTxt} — se a peça cita aquele julgamento, abra o acórdão dele com obter_inteiro_teor_tjro`);
          if ([...a.datas].every((dt) => doRotulo.includes(dt) || narrada.includes(dt) || transcrita.includes(dt) || duvidosa.includes(dt) || assinada.includes(dt))) jaExplicada = true;
        }
        if (!jaExplicada) (perto ? confira : avisos).push(`a peça diz julgado em ${[...a.datas].join(" / ")}; os julgamentos lidos deste processo são de ${[...julg.keys()].join(", ")}${folga}${noCorpo.length ? ` — ${noCorpo.join(" / ")} aparece no texto, mas fora do fecho, da sessão, do rótulo "data (do) julgamento" do cabeçalho e da assinatura: provavelmente é data de outro ato (distribuição, sentença, precedente citado, juntada) — confira no acórdão` : ""}`);
      }
    }
    // Fable 3 (143609392): em SENTENÇA/VOTO/DECISÃO o "fecho" que extrairOrgaoComOrigem lê é de acórdão transcrito — não é câmara deste julgamento
    const fechos = [...new Set(alvo.filter((r) => !tipoNaoAcordao(r.tipo)).map((r) => extrairOrgaoComOrigem(r.texto)).filter((o) => o && o.origem === "fecho").map((o) => o.orgao))];
    if (a.camaras.size && fechos.length) {
      const errada = [...a.camaras].filter((c) => !fechos.some((f) => orgaoConfere(c, f)));
      if (errada.length) avisos.push(`a peça diz ${errada.join(" / ")}, o FECHO diz ${fechos.join(" / ")} (vale o fecho: o cadastro mostra a câmara atual do processo, não a que julgou)`);
    } else if (a.camaras.size) {
      // Red team 22/10/2026: sem fecho legível (só a ementa gravada pela busca, fecho fora do padrão) não houve comparação —
      // nunca ✅. O órgão do índice entra só como indício: é a câmara ATUAL do processo, não a que julgou.
      const cad = [...new Set(alvo.map((r) => r.orgao_indice).filter(Boolean))];
      confira.push(`câmara da peça (${[...a.camaras].join(" / ")}) NÃO conferida: o recibo lido não tem o fecho legível (só ementa/índice ou redação fora do padrão)${cad.length ? ` — cadastro: ${cad.join(" / ")}, que não é a câmara que julgou` : ""}; abra o ACÓRDÃO com obter_inteiro_teor_tjro`);
    }
    // Reataque da amostra B (24/10/2026): quem lavra o acórdão vem do FECHO; o relator do cabeçalho/assinatura que não é ele é o
    // relator ORIGINÁRIO (vencido, quando o fecho diz) e não confirma ✅. Fecho sem nome legível de quem lavra: vale o relator do
    // ÍNDICE do portal, que guarda o "relator para o acórdão" (red team 04/09/2026, achado 4a; amostra B, id 21363380: o índice
    // trazia quem lavrou e o cabeçalho, o vencido; amostra A, id 17284486: "VENCIDO O RELATOR" com assinatura de quem lavrou, igual
    // ao índice). Sem fecho legível e sem índice: nenhum relator lido confirma ✅. Tudo POR JULGAMENTO lido (o redator de um
    // julgamento não faz do relator de outro julgamento do mesmo processo um "originário").
    const porJulg = alvo.map((r) => {
      const x = relatorVencidoNoFecho(r.texto, r.data_julgamento, r), hdr = extrairRelatorDoTexto(r.texto), lido = hdr || r.relator_indice || null;
      let red = x.redator, peloIndice = false;
      if (x.vencido && !red && r.relator_indice) { red = r.relator_indice; peloIndice = true; }
      const orig = red && lido && !mesmaPessoa(lido, red) ? lido : null;
      return { vencido: x.vencido, red, peloIndice, orig, semRed: x.vencido && !red ? lido : null, bons: red ? [red, ...(lido && !orig ? [lido] : [])] : (x.vencido ? [] : (lido ? [lido] : [])),
        lido: red ? (!peloIndice || (hdr && mesmaPessoa(hdr, red))) : !x.vencido && !!hdr };
    });
    const uniq = (xs) => { const vistos = new Set(); return xs.filter((x) => { const k = fold(x).replace(/\s+/g, " ").trim(); if (vistos.has(k)) return false; vistos.add(k); return true; }); };
    const rels = uniq(porJulg.flatMap((j) => j.bons));
    const relLido = porJulg.some((j) => j.lido);
    const casa = (p, nomes) => nomes.some((o) => ["confere", "ambiguo"].includes(compararRelator(p, o)));
    const bate = (p) => rels.some((w) => compararRelator(p, w) === "confere");
    if (a.relatores.size) {
      const orig = [...a.relatores].filter((p) => !bate(p) && casa(p, porJulg.map((j) => j.orig).filter(Boolean)));
      if (orig.length) {
        const js = porJulg.filter((j) => j.orig && orig.some((p) => casa(p, [j.orig])));
        const red = uniq(js.map((j) => j.red));
        const como = js.some((j) => j.peloIndice) ? "o fecho diz que o relator ficou vencido e não nomeia quem lavra; o índice do portal guarda o relator para o acórdão" : js.some((j) => j.vencido) ? "o fecho diz que o relator ficou vencido e quem lavra o acórdão" : "relator para o acórdão, pelo fecho";
        confira.push(`a peça dá como relator ${orig.join(" / ")}, que é o relator ORIGINÁRIO${js.some((j) => j.vencido) ? ", vencido" : ""}; o acórdão é de ${red.join(" / ")} (${como}) — cite o relator para o acórdão`);
        a.relatores = new Set([...a.relatores].filter((p) => !orig.includes(p)));
      }
      const semRed = uniq(porJulg.map((j) => j.semRed).filter(Boolean));
      const duvida = [...a.relatores].filter((p) => !bate(p) && (casa(p, semRed) || (!rels.length && semRed.length)));
      if (duvida.length) {
        confira.push(`relator da peça (${duvida.join(" / ")}) NÃO confirmado: o fecho diz que o RELATOR FICOU VENCIDO e não diz, em forma legível, quem lavra o acórdão — o relator lido (${semRed.join(" / ")}) pode ser o vencido; confira no fecho/assinatura quem é o relator para o acórdão`);
        a.relatores = new Set([...a.relatores].filter((p) => !duvida.includes(p)));
      }
    }
    if (a.relatores.size && rels.length) {
      // Leva A (22/10/2026): um sobrenome em comum não confere mais ("Raduan Miguel Filho" × "Alexandre Miguel"); vale o melhor
      // resultado entre os relatores lidos deste julgamento, e o ambíguo (nome único de mais de um desembargador, forma curta com
      // outro último sobrenome) sai 🟠, nunca ✅.
      const ORDEM = { confere: 0, ambiguo: 1, diverge: 2 };
      const melhor = (p) => rels.map((x) => compararRelator(p, x)).reduce((m, r) => (r && (m === null || ORDEM[r] < ORDEM[m]) ? r : m), null);
      const res = [...a.relatores].map((p) => [p, melhor(p)]);
      const errados = res.filter(([, r]) => r === "diverge").map(([p]) => p);
      const ambiguos = res.filter(([, r]) => r === "ambiguo").map(([p]) => p);
      if (errados.length) confira.push(`a peça dá como relator ${errados.join(" / ")}, o acórdão lido tem ${rels.join(" / ")} (relator muda entre julgamentos do mesmo processo — IRDR, embargos, convocação: confira qual julgamento a peça cita)`);
      const curtos = res.filter(([, r]) => r === null).map(([p]) => p);
      if (curtos.length) confira.push(`relator da peça (${curtos.join(" / ")}) NÃO conferido: nome curto demais para comparar com o do acórdão lido (${rels.join(" / ")})`);
      if (ambiguos.length) confira.push(`relator da peça (${ambiguos.join(" / ")}) só bate EM PARTE com o do acórdão lido (${rels.join(" / ")}): nome único que serve a mais de um desembargador, ou sobrenome final diferente — escreva o nome como está no acórdão`);
    } else if (a.relatores.size) {
      confira.push(`relator da peça (${[...a.relatores].join(" / ")}) NÃO conferido: o recibo lido não traz o relator; abra o ACÓRDÃO com obter_inteiro_teor_tjro`);
    }
    // 1.41.9 (item 4): o que a peça disse ao lado do número e não foi extraído nem comparado — nunca ✅
    if (a.pendentes.size) confira.push(`a peça diz, ao lado do número, ${[...a.pendentes].join("; ")}, e isso NÃO foi lido nem comparado com o acórdão — confira à mão ou escreva no formato "câmara, Rel. Fulano, j. dd/mm/aaaa"`);
    const quem = alvo.map((r) => `id ${r.id_documento} · ${r.tipo || "?"} · ${r.data_julgamento || "data ?"}`).join("; ");
    const fechoTxt = fechos.length ? `fecho: ${fechos.join(" / ")}` : "câmara do fecho não legível";
    if (avisos.length) { cont.vermelho++; L.push(`🔴 ${num} — lido nesta máquina (${quem}; ${fechoTxt}). DIVERGE: ${[...avisos, ...confira].join("; ")}.`); }
    else if (confira.length) { cont.confira++; L.push(`🟠 ${num} — lido nesta máquina (${quem}; ${fechoTxt}). CONFIRA: ${confira.join("; ")}.`); }
    else {
      cont.ok++;
      // só o que foi de fato comparado (câmara sem fecho e relator sem relator já foram para `confira` acima)
      const conf = [a.camaras.size && fechos.length ? "câmara" : null, a.relatores.size && rels.length ? (relLido ? "relator" : "relator (só contra o índice do portal, não lido no acórdão)") : null, a.datas.size ? "data" : null].filter(Boolean);
      L.push(`✅ ${num} — lido nesta máquina (${quem}; ${fechoTxt}). ${conf.length ? `Bate com a peça: ${conf.join(", ")}.` : "A peça não diz câmara, relator nem data ao lado do número: nada a comparar."}`);
    }
  }
  const sup = citacoesDoTexto(t).filter((c) => !/^\d{7}-/.test(c));
  const cab = [
    `**Auditoria de citações (sem rede)** — ${porNum.size} número(s) de processo distinto(s)${sup.length ? `, ${sup.length} citação(ões) a STJ/STF` : ""}.`,
    `🔴 ${cont.vermelho} a corrigir · 🟠 ${cont.confira} a conferir · 🟡 ${cont.amarelo} não lido(s) nesta máquina · ✅ ${cont.ok} conferido(s) contra o acórdão lido · ⚪ ${cont.outro} de outro tribunal.`,
    "_Confere número, tribunal, câmara do fecho, relator e data — NÃO confere se o julgado sustenta o que a peça afirma (isso é a leitura, `verificar_citacao_tjro` para a frase entre aspas e o revisor-adversarial). Câmara e relator só são lidos quando aparecem perto do número._",
    "",
  ];
  if (t.length < String(texto || "").length) cab.push(`_Texto cortado em ${AUDITORIA_MAX_CHARS} caracteres; audite o resto em outra chamada._`, "");
  const rodape = sup.length ? ["", `**STJ/STF citados** (classe-base + número; AgInt/EDcl dentro do mesmo processo contam uma vez): ${sup.join("; ")}.`, "_Não conferidos aqui: STJ pelo MCP stj_jurisprudencia (+ JusRatio); STF pelo JusRatio; precedente qualificado pelo BNP._"] : [];
  return [...cab, ...(L.length ? L : ["Nenhum número de processo no padrão CNJ no texto."]), ...rodape].join("\n");
}
