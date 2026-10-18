// v1.40.0 — cadeia do processo e citações de saída, 100% local (recibos), zero requisição ao portal.
// Ideia do backlog do GitHub (17/10/2026): "case_history" do tw-legal-rag e o "cited_by/citing" do CourtListener, adaptados ao TJRO.
// O que importa para quem vai citar: o acórdão foi MODIFICADO depois no próprio processo? (juízo de retratação exercido após tema
// do STJ/STF, embargos acolhidos com efeito modificativo, anulação). Isso é o sinal mais forte de "não cite este" que existe nos recibos.
import { recibosDoProcesso, soDigitos } from "./recibos.js";
import { extrairOrgaoComOrigem, fold, cnj, resultadoComOrigem, rotuloDoConjunto, ROTULOS_RESULTADO } from "./lib.js";
// mesmo rótulo do distinguir (precedentes.js), sem import circular
const rotulo = (r) => { const ro = resultadoComOrigem(r.texto, r.tipo); const k = rotuloDoConjunto(ro.conjunto, r.classe, ro.embargos); return k ? ROTULOS_RESULTADO[k] : ""; };

const isoBr = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || "")); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const W = "[ \\t\\n\\r\\f\\v]+";
// retratação EXERCIDA (não a mera remessa nem a recusa)
const RE_RETRATA_SIM = new RegExp(`em${W}juizo${W}de${W}(?:retratacao|conformidade)(?:${W})?(?:\\([^)]{0,120}\\))?[^;]{0,260}?\\b(?:voto${W}(?:no${W}sentido${W}de|para|por)|determin\\w+|dou|da-se|reformo|revejo|reconhec\\w+|declar\\w+|acolho|adequ\\w+|alter\\w+)|(?:exerc\\w*|realiz\\w*|procedo a[o]?|proceder a[o]?)${W}(?:o${W})?(?:juizo${W}de${W})?retratacao|juizo${W}de${W}retratacao${W}(?:positivo|exercido|para)|em${W}juizo${W}de${W}retratacao,?${W}(?:dou|da-se|dar|nego|reformo|reforma|acolho|adequ\\w*|altero|alterar|revejo|reve-se|reconhec\\w*|declar\\w*|exer\\w*)|retratacao${W}(?:positiva|exercida)`);
const RE_RETRATA_NAO = new RegExp(`(?:nao|deixo${W}de|descabe|inviavel)${W}(?:\\S+${W}){0,4}(?:juizo${W}de${W})?retratacao|mantenho${W}(?:o|integralmente${W}o)${W}acordao|manutencao${W}do${W}acordao|retratacao${W}negativa`);
// efeito modificativo AFIRMADO (os embargos "não se prestam a efeitos infringentes" é o contrário)
const RE_EFEITO_SIM = new RegExp(`(?:atribu\\w+|confer\\w+|conced\\w+|empresta\\w*|dar|dando|dou|com)(?:-lhes)?${W}(?:lhes${W}|aos${W}embargos${W})?(?:excepcionais${W})?efeitos?${W}(?:infringentes|modificativos)`);
const RE_EFEITO_NAO = new RegExp(`(?:sem|nao${W}(?:\\S+${W}){0,3}|inviavel${W}(?:\\S+${W}){0,2}|descabe${W}(?:\\S+${W}){0,2})(?:atribu\\w+${W}|confer\\w+${W}|emprest\\w+${W})?(?:lhes${W})?efeitos?${W}(?:infringentes|modificativos)`);
const RE_ANULA = new RegExp(`(?:anular|anulo|anula-se|(?:declaro|declarar|declarando|decreto|decretar)${W}a${W}nulidade${W}d[oe]|tornar${W}sem${W}efeito|torno${W}sem${W}efeito)${W}(?:o${W})?(?:v\\.?${W})?acordao`);
const RE_ORIGEM = /(?:processo\s+de\s+origem|origem)\s*:?\s*(?:n[º°.]*\s*)?(\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4})/i;

// Ajuste de 18/10/2026 (amostra cega A, 34 julgamentos, Sonnet+Opus): a 1ª regra lia o PEDIDO do embargante ("requer… com efeitos
// infringentes") e a negação distante ("não são cabíveis… para conferir efeitos infringentes") — 6 falsos em 15 marcados; e perdia o ED
// provido que muda honorários/juros/consectários sem a palavra "infringentes" (4 de 13). Agora: só o DISPOSITIVO conta (voto a partir de
// "ante o exposto" e afins, seção IV da ementa, fecho), frase de pedido da parte sai, e mudança concreta do dispositivo também é modificação.
const RE_DISP_INI = /(?:ante o exposto|diante do exposto|pelo exposto|em face do exposto|isso posto|posto isso|com essas consideracoes|da conclusao|iv\.? dispositivo|dispositivo e tese|acordam os (?:magistrados|desembargadores|juizes))/g;
const RE_PEDIDO = /\b(?:requer\w*|pugna\w*|postula\w*|pleite\w*|pede|pedem|pretend\w*|busca\w*|alega\w*|sustenta\w*|aduz\w*|insurge\w*)\b/;
const RE_MUDA = new RegExp(`\\b(?:integr\\w*${W}(?:o${W})?(?:v\\.?${W})?acordao|acordao${W}integrado|fix(?:ar|o|ando|ada|ados)|major(?:ar|o|ando|ados)|reduz\\w*|redimension\\w*|alter(?:ar|o|ando)|modific(?:ar|o|ando)|invert\\w*|readequ\\w*|adequ(?:ar|o|ando|acao d)\\w*|retific\\w*|corrig\\w*|passa(?:m)?${W}a${W}constar|onde${W}se${W}le|exclu(?:ir|o|indo)|acrescent\\w*|esclarecendo${W}que|reconhecendo${W}a${W}sucumbencia|suprir${W}a${W}omissao${W}quanto)\\b`);
const RE_OBJ = /honorari|juros|correcao monetaria|consectari|selic|termo inicial|\bvalor(?:es)?\b|condenac|sucumb|indeniza|\bdanos?\b|\bmulta\b|astreinte|repeticao|onus/;
const RE_SO_ERRO_MATERIAL = /para corrigir a ementa|corrigir a ementa do acordao|vicio formal|exclusivamente para (?:a )?correcao de erro material|apenas para (?:corrigir|sanar) (?:o )?erro material|sem alteracao (?:do|de) (?:merito|resultado)|ainda que nao haja alteracao/;
/** Dispositivo: o último "ante o exposto" do voto (até 1.500 caracteres), a seção IV da ementa (até a tese) e o fecho. */
function regiaoDoDispositivo(t) {
  const partes = [];
  let v = -1; for (const m of t.matchAll(/ante o exposto|diante do exposto|pelo exposto|em face do exposto|isso posto|posto isso|com essas consideracoes|da conclusao|por (?:essas|tais|estas) razoes|diante disso|nesses termos|assim sendo|ante o quanto exposto|em conclusao|diante de todo o exposto|ante todo o exposto|por todo o exposto/g)) v = m.index;
  if (v >= 0) { const sl = t.slice(v, v + 1500); const k = sl.slice(20).search(/\bementa\s*:|\bementa (?:direito|apelac|embargos|agravo|processual|civil|consumidor)|i\.? caso em exame|acordam os |e como voto/); partes.push(k >= 0 ? sl.slice(0, k + 20) : sl); }
  const e = /iv\.? dispositivo(?: e tese)?/.exec(t);
  if (e) { const resto = t.slice(e.index, e.index + 900); const k = resto.search(/tese de julgamento|dispositivos relevantes|jurisprudencia relevante|\bacordao vistos/); partes.push(k > 0 ? resto.slice(0, k) : resto); }
  const f = t.lastIndexOf("acordam os "); if (f >= 0) partes.push(t.slice(f));
  return partes.length ? partes.join(" ") : t.slice(-2500);
}
// "para que conste a ementa e o dispositivo acima transcritos, passando a integrar o acórdão" (amostra D)
const RE_INTEGRA = new RegExp(`(?:conste|passa(?:ndo)?${W}a${W}integrar)[^.]{0,120}(?:dispositivo|ementa)|(?:ementa${W}e${W})?(?:o${W})?dispositivo${W}(?:acima${W})?transcrit[oa]s?`);
const frasesDe = (t) => t.split(/(?<=[.;:])\s+/);
/** O que um julgamento POSTERIOR do mesmo processo fez com o anterior: {tipo, frase} ou null. */
export function efeitoSobreAnterior(doc) {
  const t = fold(String(doc.texto || "")).replace(/[ \t\n\r\f\v]+/g, " ");
  const lab = fold(rotulo(doc) || "");
  const disp = regiaoDoDispositivo(t);
  // voto vencido não modifica nada ("divirjo da relatora e acolho"): fora
  const fr = frasesDe(disp).filter((f) => !RE_PEDIDO.test(f) && !/divirjo|diverg\w+ d[ao] relator|voto vencido|vencid[oa] (?:o|a) relator/.test(f));
  const achar = (re, extra = () => true) => fr.find((f) => re.test(f) && extra(f)) || "";
  const cur = (f) => f.trim().slice(0, 260);
  // retratação: no dispositivo inteiro (já sem pedido nem voto vencido) — "art. 1.030" partia a frase ao meio
  const junto = fr.join(" ");
  const mr = RE_RETRATA_SIM.exec(junto);
  if (mr && !RE_RETRATA_NAO.test(junto.slice(mr.index, mr.index + 400))) return { tipo: "retratação exercida", frase: cur(junto.slice(mr.index)) };
  let f;
  f = achar(RE_ANULA);
  if (f) return { tipo: "anulação do acórdão", frase: cur(f) };
  // Amostra cega C (18/10/2026): sem esta trava, a apelação NOVA do mesmo processo (após sentença anulada e refeita) que reforma a
  // SENTENÇA saía como "modificou o acórdão" — 22 falsos em 32. Mudança de dispositivo só conta em EMBARGOS DE DECLARAÇÃO contra o acórdão.
  const fechoT = t.lastIndexOf("acordam os ") >= 0 ? t.slice(t.lastIndexOf("acordam os ")) : "";
  const cab = t.slice(0, 2500);
  const ehED = /embargos de declarac/.test(fold(doc.classe || "")) || /\bembargos\b/.test(fechoT) ||
    (!/apelacao interposta|interp\w+ (?:recurso de )?apelacao|recurso de apelacao interposto/.test(cab) && /embargos de declaracao (?:opostos|interpostos)|op\w+ embargos de declaracao|aclaratorios|\bembargante\b/.test(cab));
  if (!ehED) return null;
  const providos = (/acolhid|parcial|(?<!des)provid/.test(lab) && !/rejeit|nao prov|desprov|nao conhec/.test(lab)) || /\b(?:dou|dar|da-se) (?:parcial )?provimento (?:aos|ao recurso de|aos embargos)|\bacolho\b|acolhe-se/.test(disp) || /(?<!nao )(?:acolhid|(?<!des)provid)\w*/.test(fechoT);
  const integradoDeOficio = /de oficio,? (?:o )?acordao integrado|integr\w* (?:o acordao )?de oficio/.test(disp);
  if (providos || integradoDeOficio) {
    f = achar(RE_EFEITO_SIM, (x) => !RE_EFEITO_NAO.test(x) && !RE_SO_ERRO_MATERIAL.test(x));
    if (f) return { tipo: "embargos acolhidos com efeito modificativo", frase: cur(f) };
    f = achar(RE_INTEGRA, (x) => !RE_SO_ERRO_MATERIAL.test(x));
    if (f) return { tipo: "embargos acolhidos que alteram o dispositivo", frase: cur(f) };
    f = achar(RE_MUDA, (x) => RE_OBJ.test(x) && !RE_SO_ERRO_MATERIAL.test(x) && !/recurso de apelacao|reformar a sentenca|ao apelo\b/.test(x) && !/sem efeitos? (?:infringentes|modificativos)/.test(x) && !/^(?:mantem-se|mantenho)/.test(x.trim()));
    if (f) return { tipo: integradoDeOficio && !providos ? "acórdão integrado de ofício" : "embargos acolhidos que alteram o dispositivo", frase: cur(f) };
  }
  return null;
}

/** Embargos acolhidos/providos DEPOIS, em que a regra não achou a mudança: vira "confira" (🟠), nunca "modificou".
 * Validação cega de 18/10/2026, amostra nova E: as modificações que a regra deixou passar eram, em 2 de 3, "embargos providos" no fecho. */
export function edAcolhidoDepois(doc) {
  const t = fold(String(doc.texto || "")).replace(/[ \t\n\r\f\v]+/g, " ");
  const f = t.lastIndexOf("acordam os "); const fecho = f >= 0 ? t.slice(f) : t.slice(-600);
  return /\bembargos\b[^.]{0,120}?(?<!nao )(?<!nao foram )(?:acolhid|(?<!des)provid)/.test(fecho) && !/\bembargos\b[^.]{0,60}(?:rejeitad|nao acolhid|nao provid|desprovid|nao conhecid)[^.]{0,40}$/.test(fecho.slice(0, 260));
}

/** Julgamentos do mesmo processo (um por data, preferindo ACÓRDÃO), com o efeito de cada posterior sobre o anterior. */
export function cadeiaDoProcesso(r, pasta) {
  const docs = recibosDoProcesso(r.nr_processo || "", pasta).filter((x) => x.texto && /AC[ÓO]RD|EMENTA|SENTEN/.test(String(x.tipo || "").toUpperCase()));
  const porData = new Map();
  for (const x of docs) {
    const k = x.data_julgamento || "?"; const a = porData.get(k);
    const pref = (y) => (/AC[ÓO]RD/.test(String(y.tipo || "").toUpperCase()) ? 2 : 1) * 1e7 + String(y.texto).length;
    if (!a || pref(x) > pref(a)) porData.set(k, x);
  }
  const lista = [...porData.values()].sort((a, b) => (isoBr(a.data_julgamento) < isoBr(b.data_julgamento) ? -1 : isoBr(a.data_julgamento) > isoBr(b.data_julgamento) ? 1 : 0));
  const meuIso = isoBr(r.data_julgamento);
  const itens = lista.map((x) => {
    const ob = extrairOrgaoComOrigem(x.texto);
    const depois = meuIso && isoBr(x.data_julgamento) > meuIso;
    return { x, iso: isoBr(x.data_julgamento), este: String(x.id_documento) === String(r.id_documento) || x.data_julgamento === r.data_julgamento, depois,
      orgao: ob && ob.origem === "fecho" ? ob.orgao : "", rotulo: rotulo(x) || "", efeito: depois ? efeitoSobreAnterior(x) : null };
  }).map((i) => ({ ...i, confira: i.depois && !i.efeito && edAcolhidoDepois(i.x) }));
  const om = RE_ORIGEM.exec(String(r.texto || "").slice(0, 2500));
  const origem = om && soDigitos(om[1]) !== soDigitos(r.nr_processo) ? cnj(soDigitos(om[1])) : "";
  return { itens, modificado: itens.filter((i) => i.efeito), conferir: itens.filter((i) => i.confira), origem, origemLida: origem ? recibosDoProcesso(origem, pasta).some((x) => x.texto) : false };
}

export function blocoCadeia(c) {
  const L = ["\n## 5-A. O mesmo processo depois deste julgamento (recibos locais)"];
  const post = c.itens.filter((i) => i.depois);
  if (!post.length) L.push("- Nenhum julgamento posterior deste processo nos recibos. Isso NÃO prova que não houve (embargos, retratação, recurso): só o que esta máquina leu.");
  for (const i of c.itens) {
    const marca = i.este ? "▶ este" : i.efeito ? "🔴" : i.confira ? "🟠" : i.depois ? "·" : "◦ antes";
    L.push(`- ${marca} ${i.x.data_julgamento || "?"} · ${i.x.classe || i.x.tipo || "?"} · id ${i.x.id_documento}${i.orgao ? ` · ${i.orgao}` : ""} · ${i.rotulo || "sem rótulo"}${i.efeito ? ` · **${i.efeito.tipo}**: «${i.efeito.frase.slice(0, 240)}»` : i.confira ? " · embargos acolhidos/providos: a regra não achou mudança no dispositivo — CONFIRA" : ""}`);
  }
  if (!c.modificado.length && c.conferir.length) L.push("- 🟠 Há embargos acolhidos ou providos depois deste julgamento. A regra não achou mudança no dispositivo, mas deixa passar parte delas (validação cega: 3 de 3 numa amostra nova): abra e confira.");
  if (c.modificado.length) L.push("- ⚠️ Um julgamento posterior do PRÓPRIO processo parece ter modificado este acórdão. Abra-o antes de citar: o que vale é o resultado final.");
  if (c.origem) L.push(`- Processo de origem citado no cabeçalho: ${c.origem}${c.origemLida ? " (lido nesta máquina)" : " (não lido nesta máquina)"}.`);
  return L;
}

/** Semáforo SEM VERDE: ausência de sinal local não prova vigência (decisão de 17/10/2026, para não virar atalho). */
export function semaforo({ modificado = [], conferir = [], citamComSinal = 0, opostos = 0, mudam = 0 }) {
  if (modificado.length) return `🔴 o próprio processo modificou este acórdão depois (${modificado.map((m) => m.efeito.tipo).join("; ")}) — abra antes de citar`;
  const s = [];
  if (conferir.length) s.push(`${conferir.length} julgamento(s) de embargos acolhidos/providos depois, no próprio processo`);
  if (citamComSinal) s.push(`${citamComSinal} posterior(es) que o citam com frase de distinção ou mudança`);
  if (opostos) s.push(`${opostos} do mesmo tema com resultado oposto (em regra, fato diferente)`);
  if (mudam) s.push(`${mudam} com frase de mudança de entendimento (quase sempre falsa)`);
  return s.length ? `🟠 ler antes de citar: ${s.join("; ")}` : "⚪ nenhum sinal nos recibos locais — NÃO prova que está vigente (não há verde: confira o BNP para precedente qualificado e a cadeia no portal)";
}

const RE_ABRE_REF = /^\(\s*(?:STJ|STF|TST|TJ|TRF|REsp|AREsp|EREsp|EAREsp|AgInt|AgRg|EDcl|RE\b|ARE\b|HC|RHC|RMS|Rcl|Apela|Agravo|Recurso|Embargos|Ac[óo]rd[ãa]o|Processo|Autos|Rel)/i;
/** Alguma ocorrência do número está numa referência "(Tribunal/classe … número …)" — a que identifica a ementa copiada logo antes? */
function ehReferencia(t, d) {
  const re = new RegExp(d.split("").join("[.\\-/ ]?"), "g");
  for (const m of t.matchAll(re)) {
    const antes = t.slice(Math.max(0, m.index - 160), m.index);
    const a = antes.lastIndexOf("("); if (a < 0 || antes.lastIndexOf(")") > a) continue;
    if (RE_ABRE_REF.test(antes.slice(a))) return true;
  }
  return false;
}

/** "O que este acórdão cita" (direção inversa de julgados_que_citam): processos citados no texto do recibo, cada um com o que esta máquina
 * sabe dele. Citação que só aparece dentro de ementa/voto de OUTRO julgado transcrito é marcada: quem citou foi o transcrito, não este. */
export function citadosPor(r, citacoesDoTexto, pasta) {
  const t = String(r.texto || "");
  const transcr = (Array.isArray(r.trechos_transcritos) ? r.trechos_transcritos : []).map((x) => soDigitos(String(x)));
  const meu = soDigitos(r.nr_processo);
  const L = [];
  let nTj = 0, nSup = 0;
  for (const c of citacoesDoTexto(t)) {
    const tj = /^\d{7}-\d{2}\.\d{4}\.8\.22\.\d{4}$/.test(c);
    const d = tj ? soDigitos(c) : soDigitos(c.split(" ")[1] || "");
    if (tj && d === meu) continue;
    // Validação cega de 18/10/2026 (60 citações, Sonnet+Opus): a 1ª regra marcava como "transcrita" a REFERÊNCIA entre parênteses logo
    // depois da ementa transcrita — "(STJ - AgInt no REsp: 2114745 PR …)" —, que é o relator citando aquele julgado (14 de 29 marcadas).
    // Agora: se alguma ocorrência do número é essa referência, a citação é do próprio acórdão. Amostra NOVA (42): os dois rotuladores só
    // concordaram em 22 — a pergunta é ambígua até para quem lê; nos 22, a marca acertou 7 de 9 e perdeu 4 de 11. Por isso o texto diz "provavelmente".
    const soTransc = d.length >= 6 && transcr.some((x) => x.includes(d)) && soDigitos(t).split(d).length - 1 <= transcr.filter((x) => x.includes(d)).length && !ehReferencia(t, d);
    const marca = soTransc ? " · provavelmente dentro de trecho TRANSCRITO de outro julgado (confira)" : "";
    if (!tj) { nSup++; L.push(`- ${c}${marca} — confira no MCP do STJ / JusRatio`); continue; }
    nTj++;
    const lidos = recibosDoProcesso(d, pasta).filter((x) => x.texto && /AC[ÓO]RD|EMENTA/.test(String(x.tipo || "").toUpperCase()));
    if (!lidos.length) { L.push(`- ${c}${marca} — não lido nesta máquina`); continue; }
    const ac = lidos.find((x) => /AC[ÓO]RD/.test(String(x.tipo || "").toUpperCase())) || lidos[0];
    const ob = extrairOrgaoComOrigem(ac.texto);
    const datas = [...new Set(lidos.map((x) => x.data_julgamento).filter(Boolean))];
    L.push(`- ${c}${marca} — lido: ${datas.join(", ")} · ${ob && ob.origem === "fecho" ? ob.orgao : "câmara do fecho não legível"} · ${rotulo(ac) || "sem rótulo"} · id ${ac.id_documento}`);
  }
  return { linhas: L, nTj, nSup };
}
