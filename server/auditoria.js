// v1.39.0 — auditoria das citações de uma peça, SEM REDE (ideia do citation lookup do CourtListener e do
// auditor de "citação alucinada" de john-walkoe/courtlistener_citations_mcp, adaptada ao TJRO).
// Para cada número de processo no texto: dígito verificador (Res. CNJ 65/2008), tribunal pelo segmento,
// e — se o acórdão já foi lido nesta máquina — câmara do FECHO e relator contra o que a peça afirma ao lado do número.
// Citação a STJ/STF só é listada: quem confere é o MCP do STJ / JusRatio. Nada aqui diz que o julgado sustenta a tese.
import { recibosDoProcesso } from "./recibos.js";
import { extrairOrgaoComOrigem, extrairRelatorDoTexto, compararRelator, fold } from "./lib.js";
import { citacoesDoTexto } from "./precedentes.js";

const RE_NUM = /(?<![0-9])(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})(?![0-9])/g;
const ORDINAL = { "1": "1ª", "2": "2ª", "3": "3ª", "4": "4ª", primeira: "1ª", segunda: "2ª", terceira: "3ª", quarta: "4ª" };
const RE_CAMARA_PECA = /\b(1|2|3|4|primeira|segunda|terceira|quarta)\s*(?:ª|a\b|º)?\s*(c[âa]m(?:ara|\.)?\s*(?:c[íi]v(?:el|\.)?|crim(?:inal|\.)?|esp(?:ecial|\.)?)|cc(?:rim)?\b|ce\b|turma\s+recursal|tr\b)/gi;
const RE_REL_PECA = /\b(?:[Rr]el(?:ator|atora|\.)?|REL(?:ATOR|ATORA|\.)?|(?:sob\s+a\s+|de\s+|da\s+)?[Rr]elatoria\s+d[eoa]|da\s+lavra\s+d[oa])\s*(?:p\/\s*(?:o\s+)?ac[óo]rd[ãa]o\s*)?(?:\(a\))?[:.]?\s*(?:(?:[Dd]es(?:embargador[a]?|\.)?|[Jj]u[ií]z[a]?(?:\s+[Cc]onvocad[oa])?|[Mm]in(?:istro|istra|\.)?|DES(?:EMBARGADOR[A]?)?\.?|JU[IÍ]Z[A]?)\s*\.?\s*)?((?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç.'-]+)(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç.'-]+){0,5})/;
const RE_DATA_PECA = /\b(?:j(?:ulgad[oa])?\.?\s*(?:em\s*)?|em\s+|data\s+de\s+julgamento\s*:\s*)(\d{1,2})(?:[./](\d{1,2})[./](\d{2,4})|\s*(?:º|o)?\s+de\s+([a-zç]+)\s+de\s+(\d{4}))/i;
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const AUDITORIA_MAX_CHARS = 400000;

export function dvCnjValido(d20) {
  if (!/^\d{20}$/.test(d20)) return false;
  return 98n - (BigInt(d20.slice(0, 7) + d20.slice(9) + "00") % 97n) === BigInt(d20.slice(7, 9));
}
const mascara = (d) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
const camaraNorm = (n, tipo) => { const t = fold(tipo).replace(/[\s.]+/g, " ").trim(); const o = ORDINAL[fold(n)] || n; if (/^(turma|tr$)/.test(t)) return `${o} Turma Recursal`; if (t === "cc") return `${o} Câmara Cível`; if (t === "ccrim") return `${o} Câmara Criminal`; if (t === "ce") return `${o} Câmara Especial`; return `${o} Câmara ${/ civ/.test(t) ? "Cível" : / crim/.test(t) ? "Criminal" : "Especial"}`; };
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
    const cams = [...(antes + " " + depois).matchAll(RE_CAMARA_PECA)].map((c) => camaraNorm(c[1], c[2]));
    const rel = RE_REL_PECA.exec(depois) || RE_REL_PECA.exec(antes);
    const dt = dataDoJulgamento(depois) || dataDoJulgamento(antes);
    return { d: m.slice(1, 7).join(""), camaras: [...new Set(cams)], relator: rel ? rel[1].replace(/[.,;]+$/, "") : null, data: dt ? (dt[2] ? dataBr(dt[1], dt[2], dt[3]) : (MESES.indexOf(fold(dt[4])) >= 0 ? dataBr(dt[1], String(MESES.indexOf(fold(dt[4])) + 1), dt[5]) : null)) : null };
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
const RE_FECHO_ACORDAM = /acordam\s+os\s+(?:magistrados|desembargadores)/gi;
const RE_ROTULO_SESSAO = /(?:sess[ãa]o(?:\s+(?:virtual|presencial|ordin[áa]ria|extraordin[áa]ria|telepresencial|h[íi]brida|de\s+julgamento))*\s*(?:de|do\s+dia|realizada\s+em|iniciada\s+em|:)|data\s+d[oe]\s+julgamento\s*:?)/gi;
const RE_ASSINATURA = /(?:Porto\s+Velho|Ji-Paran[aá]|Cacoal|Vilhena|Ariquemes|Guajar[aá]-Mirim|Rolim\s+de\s+Moura|Jaru|Ouro\s+Preto\s+do\s+Oeste)\s*(?:\/\s*RO)?\s*,?\s*(?:\d{1,2}\s*(?:º|o)?\s+de\s+[A-Za-zç]+\s+de\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi;
export function regiaoDoJulgamento(texto) {
  const t = String(texto || "");
  const partes = [];
  let ult = -1;
  for (const m of t.matchAll(RE_FECHO_ACORDAM)) ult = m.index;
  if (ult >= 0) partes.push(t.slice(ult, ult + 1500));
  const cab = t.slice(0, 2500);
  for (const m of cab.matchAll(RE_ROTULO_SESSAO)) partes.push(cab.slice(m.index, m.index + m[0].length + 60));
  const cauda = t.slice(-600);
  let ass = null;
  for (const m of cauda.matchAll(RE_ASSINATURA)) ass = m;
  if (ass) partes.push(ass[0]);
  return partes.join(" \n ");
}

export function auditarCitacoes(texto, pasta) {
  const t = String(texto || "").slice(0, AUDITORIA_MAX_CHARS);
  if (!t.trim()) return "Cole o texto da peça (ou o trecho com as citações) em `texto`.";
  const porNum = new Map();
  for (const o of ocorrencias(t)) {
    const a = porNum.get(o.d) || { camaras: new Set(), relatores: new Set(), datas: new Set(), vezes: 0 };
    o.camaras.forEach((c) => a.camaras.add(c)); if (o.relator) a.relatores.add(o.relator); if (o.data) a.datas.add(o.data); a.vezes++;
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
      const comData = alvo.filter((r) => a.datas.has(r.data_julgamento) || [...a.datas].some((dt) => dataNoTexto(dt, regiaoDoJulgamento(r.texto))));
      if (comData.length) alvo = comData;
      else {
        const perto = [...a.datas].every((dt) => [...julg.keys()].some((k) => Math.abs(diaDe(dt) - diaDe(k)) <= 45 * 864e5));
        // a data existe no corpo (sentença, precedente citado, juntada), mas não como data deste julgamento
        const noCorpo = [...a.datas].filter((dt) => alvo.some((r) => dataNoTexto(dt, r.texto)));
        (perto ? confira : avisos).push(`a peça diz julgado em ${[...a.datas].join(" / ")}; os julgamentos lidos deste processo são de ${[...julg.keys()].join(", ")}${perto ? " (até 45 dias: o índice pode guardar a data da assinatura, não a da sessão)" : ""}${noCorpo.length ? ` — ${noCorpo.join(" / ")} aparece no texto, mas não como data do julgamento (fecho, sessão ou assinatura): pode ser a da sentença ou de um precedente citado no voto` : ""}`);
      }
    }
    const fechos = [...new Set(alvo.map((r) => extrairOrgaoComOrigem(r.texto)).filter((o) => o && o.origem === "fecho").map((o) => o.orgao))];
    if (a.camaras.size && fechos.length) {
      const errada = [...a.camaras].filter((c) => !fechos.some((f) => fold(f) === fold(c)));
      if (errada.length) avisos.push(`a peça diz ${errada.join(" / ")}, o FECHO diz ${fechos.join(" / ")} (vale o fecho: o cadastro mostra a câmara atual do processo, não a que julgou)`);
    } else if (a.camaras.size) {
      // Red team 22/10/2026: sem fecho legível (só a ementa gravada pela busca, fecho fora do padrão) não houve comparação —
      // nunca ✅. O órgão do índice entra só como indício: é a câmara ATUAL do processo, não a que julgou.
      const cad = [...new Set(alvo.map((r) => r.orgao_indice).filter(Boolean))];
      confira.push(`câmara da peça (${[...a.camaras].join(" / ")}) NÃO conferida: o recibo lido não tem o fecho legível (só ementa/índice ou redação fora do padrão)${cad.length ? ` — cadastro: ${cad.join(" / ")}, que não é a câmara que julgou` : ""}; abra o ACÓRDÃO com obter_inteiro_teor_tjro`);
    }
    const rels = [...new Set(alvo.map((r) => extrairRelatorDoTexto(r.texto) || r.relator_indice).filter(Boolean))];
    // rodada 2: relator que só veio do índice do portal (recibo sem "Relator:" no texto) não foi LIDO no acórdão
    const relLido = alvo.some((r) => extrairRelatorDoTexto(r.texto));
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
