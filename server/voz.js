// voz.js (1.41.9, pendências de desenho de 24/10/2026): DE QUEM é a frase — alegação da parte e texto anunciado por
// dois-pontos (doutrina, sentença transcrita). A lógica é a do verificar_citacao_tjro, movida para cá SEM mudança para que o
// RECIBO (custódia) e o lint da peticao-rg vejam os mesmos alertas que o verificador já emitia: antes, ALEGAÇÃO DA PARTE,
// DOUTRINA e SENTENÇA TRANSCRITA só existiam na resposta do verificador, e a mesma frase passava no lint como voz do tribunal.
// Importa só custodia.js e posicao.js (nenhum dos dois importa este arquivo): sem ciclo.
import { norm1, RE_VOZ_PROPRIA, faixasAlheias, camposAlheios } from "./custodia.js";
import { secoesDaEmenta } from "./posicao.js";

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
export function inicioDaFrase(bruto, tn, piso, p) {
  let ini = piso;
  const seg = bruto.slice(piso, p);
  for (const m of seg.matchAll(/[.;!?]["”’)\]]?\s+(?=["“‘(\[]?[A-ZÀ-Ý0-9])/g)) {
    if (m[0][0] === "." && ABREV.test(tn.slice(Math.max(piso, piso + m.index - 8), piso + m.index))) continue;
    ini = piso + m.index + m[0].length;
  }
  return ini;
}

/** O verbo de relato `verbo`, em `pos` (texto norm1), numa frase que começa em `frase0`, relata o que uma PARTE diz? (Não: "-se"
 * impessoal, verbo negado, "ao contrário do que sustenta", sem sujeito de parte e fora do início da frase.) Extraído de
 * alegacaoDaParte sem mudança (1.41.9), para a custódia do recibo usar a mesma regra. */
export function verboDeRelatoDaParte(tn, frase0, pos, verbo) {
  const depois = tn.slice(pos + verbo.length, pos + verbo.length + 45);
  if (/^-se/.test(depois)) return false;                                              // "reitera-se", "alega-se"
  if (/(?:^|[^a-z0-9])(?:nao|nem|jamais|nunca)\s+(?:se\s+)?$/.test(tn.slice(Math.max(frase0, pos - 12), pos))) return false;   // "não narra"
  if (RE_AO_CONTRARIO.test(tn.slice(Math.max(frase0, pos - 30), pos))) return false;                                         // "ao contrário do que sustenta"
  const antes = tn.slice(Math.max(frase0, pos - ALEGACAO_SUJEITO_JANELA), pos);
  // verbo abrindo a frase, com até dois adjuntos curtos antes: "Alega,", "No mérito, aduz", "Ao final, com base nessa retórica, propugna"
  const noInicio = /^\s*(?:[a-z]+(?: [a-z]+){0,4},\s+){0,2}(?:[a-z]+\s+){0,2}$/.test(tn.slice(frase0, pos));
  const sujeito = PARTE_NO_TEXTO.test(antes) || SUJEITO_EM_RAZOES.test(antes) || PARTE_NO_TEXTO.test(depois.slice(0, 40).split(/[,.;]| que /)[0]);   // "Alega o agravante que…"
  return verbo === "diz" ? noInicio : sujeito || noInicio;
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
    const pos = frase0 + m.index;
    if (!verboDeRelatoDaParte(tn, frase0, pos, m[0])) continue;
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

// DOUTRINA / SENTENÇA TRANSCRITA sem aspas (medição cega da amostra A, 23/10/2026: v08 "explicação do Ministro Paulo Brossard quando
// aduz que:", v15 "Araken de Assis, que leciona:", v23 "Segue o trecho da sentença que explica a dinâmica da questão:" passavam como
// voz do relator). O bloco começa nos dois-pontos de um introdutor e vai até a primeira marca de retomada do relator (RE_VOZ_PROPRIA,
// conectivo de conclusão, vocabulário de 2º grau, verbo de relato da parte, nova citação — aspas, súmula, jurisprudência —, cabeçalho
// VOTO/EMENTA), até a referência da obra entre parênteses, ou até
// INTRODUZIDA_MAX caracteres. Fica aqui, no verificador (alerta), e não na custódia do recibo.
const RE_INTRO_SENTENCA = /(?<![a-z0-9])(?:(?:trecho|trechos|excerto|parte|fundamentos?|fundamentacao|dispositivo)\s+(?:d[ao]\s+)?(?:r\.?\s*|douta\s+|respeitavel\s+)?(?:sentenca|decisao\s+(?:recorrida|agravada|de\s+origem|de\s+primeiro\s+grau|singular|monocratica))|(?:a|da|na)\s+(?:r\.?\s*)?sentenca(?:\s+recorrida)?[^.:;']{0,60}(?<![a-z0-9])(?:consignou|assentou|registrou|asseverou|destacou|fundamentou|dispos|decidiu|pontuou|ponderou|esclareceu))(?![a-z0-9])[^.:;']{0,140}:/g;
const RE_INTRO_DOUTRINA = /(?<![a-z0-9])(?:lecion(?:a|am|ou)|prelecion(?:a|am|ou)|ensin(?:a|am|ou)|ensinamentos?|explicacao|explica|explicam|explicou|aduz(?:em)?\s+que|licao|licoes|magisterio|escolio|nas\s+palavras\s+d[eoa]s?|na\s+visao\s+d[eoa]s?|obtempera|pontifica|doutrinador[a]?|jurista|professor[a]?|prof\.|autor[a]?\s+citad[oa])(?![a-z0-9])[^.:;']{0,140}:/g;
const RE_FIM_INTRODUZIDA = /(?<![a-z0-9])(?:fica claro|pois bem|como se ve|como visto|portanto|destarte|desse modo|dessa forma|desta forma|logo,|assim,|verifica-se|constata-se|nota-se|ve-se|infere-se|depreende-se|apelantes?|apelad[oa]s?|agravantes?|embargantes?|recorrentes?|a sentenca|sentenca recorrida|juizo a quo|e o relatorio|e como voto|razoes recursais|em suas razoes|irresignad[oa]s?|inconformad[oa]s?|jurisprudencia|sumula|precedentes?|relata|relatou|informou|narra|narrou|pleiteou|requereu|sustentou|alegou)(?![a-z0-9])|'/g;
// referência da obra fechando a citação: "(autor citado in Comentários…, 2ª edição 2017)", "(MARINONI, …, p. 120)"
const RE_REF_OBRA = /\([^()]{0,240}?(?:(?<![0-9])(?:19|20)\d\d(?![0-9])|(?<![a-z0-9])p\.\s*\d|(?<![a-z0-9])in(?![a-z0-9])|ed\.)[^()]{0,120}\)/g;
export const INTRODUZIDA_MAX = 2500, INTRODUZIDA_MIN = 60;
// Reataque da amostra B (24/10/2026): "A tese não se sustenta. Explica-se: …", "A explicação é simples: …" e "Ensina a experiência
// comum, e assim decide esta Câmara: …" são o RELATOR falando e saíam DOUTRINA. Os introdutores FRACOS (explica/explicação/ensina/
// aduz que) só valem como DOUTRINA com sujeito autoral na mesma frase: nome próprio (duas palavras com maiúscula, "Araken de Assis",
// ou sobrenome em CAIXA ALTA) ou "o autor/doutrinador/professor/ministro/desembargador/jurista/a doutrina". Sem isso, fica só uma
// nota de baixa confiança (DOUTRINA?), que não é alerta. Os fortes (leciona, magistério, nas palavras de…) não mudam.
const RE_INTRO_FRACA = /^(?:ensin(?:a|am|ou)|explicacao|explica|explicam|explicou|aduz(?:em)?\s+que)(?![a-z0-9])/;
// Fonte nomeada também conta (medido nos recibos: "como ensina a jurisprudência deste Egrégio Tribunal:", "Os arts. 28 e 29 da Lei
// n. 10.931/2004 ensinam:", "como nos ensina o julgado do Supremo Tribunal Federal:" anunciam texto ALHEIO e continuam com alerta).
const RE_SUJEITO_AUTORAL = /(?<![a-z0-9])(?:autor(?:a|es)?|doutrina|doutrinador(?:a|es)?|professor(?:a|es)?|prof\.|ministr[oa]|desembargador(?:a)?|jurista|mestre|processualista|civilista|constitucionalista|tributarista|penalista|jurisprudencia|julgados?|precedentes?|acordaos?|ementa|sumula|artigos?|arts?\.|lei|codigo|dispositivo)(?![a-z0-9])/;
const INSTITUCIONAIS = new Set(["camara", "camaras", "tribunal", "turma", "corte", "colegiado", "superior", "supremo", "justica", "federal", "estado", "estadual", "codigo", "civil", "penal", "processo", "lei", "leis", "constituicao", "republica", "ministerio", "publico", "fazenda", "rondonia", "porto", "velho", "sumula", "tema", "relator", "relatora", "poder", "judiciario", "egregio", "egregia", "colenda", "colendo", "plenario", "pleno", "secao", "especial", "reunidas", "cpc", "cdc", "stj", "stf", "tjro", "clt", "ctn", "inss", "banco", "uniao", "municipio"]);
const ehNomeProprio = (w) => /^[A-ZÀ-Ý]/.test(w) && w.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 3 && !INSTITUCIONAIS.has(norm1(w).replace(/[^a-z]/g, ""));
/** Sujeito autoral na frase do introdutor (do início da frase até os dois-pontos), no texto BRUTO. */
function temSujeitoAutoral(tn, bruto, iniVerbo, fimDoisPontos) {
  let ini = iniVerbo;
  for (let k = iniVerbo - 1, lim = Math.max(0, iniVerbo - 160); k >= lim; k--) { if (/[.;:!?]/.test(bruto[k]) && !/[0-9]/.test(bruto[k + 1] || "") && !/(?:^|[^A-Za-z])(?:art|arts|n|fl|fls|p|des|min|rel|dr|dra|prof)$/i.test(bruto.slice(Math.max(0, k - 5), k))) break; ini = k; }
  if (RE_SUJEITO_AUTORAL.test(tn.slice(ini, fimDoisPontos))) return true;
  const ws = bruto.slice(ini, fimDoisPontos).split(/[\s,()]+/).filter(Boolean);
  for (let i = 0; i < ws.length; i++) {
    if (i === 0) continue;   // a palavra que abre a frase tem maiúscula por ser a primeira
    const w = ws[i];
    if (/^[A-ZÀ-Ý]{4,}$/.test(w.replace(/[^A-Za-zÀ-ÿ]/g, "")) && w === w.toUpperCase() && !INSTITUCIONAIS.has(norm1(w).replace(/[^a-z]/g, ""))) return true;   // MARINONI
    if (ehNomeProprio(w)) {
      const prox = ws[i + 1], prox2 = ws[i + 2];
      if (prox && ehNomeProprio(prox)) return true;   // Humberto Theodoro
      if (prox && /^d[aeo]s?$/.test(prox) && prox2 && ehNomeProprio(prox2)) return true;   // Araken de Assis
    }
  }
  return false;
}
/** Faixas [ini, fim, tipo] de doutrina ("DOUTRINA") ou de sentença ("SENTENÇA TRANSCRITA") anunciadas por dois-pontos, sem aspas. */
export function faixasIntroduzidas(tn, bruto, inicio = 0, fim = tn.length) {
  const out = [];
  const achados = [];
  for (const [re, tipo] of [[RE_INTRO_SENTENCA, "SENTENÇA TRANSCRITA"], [RE_INTRO_DOUTRINA, "DOUTRINA"]]) {
    const r = new RegExp(re.source, "g");
    r.lastIndex = inicio;
    // "…dispositivo da sentença, que passa a vigorar com a seguinte redação:" é o TJRO redigindo, não transcrevendo
    for (let m; (m = r.exec(tn)) && m.index < fim;) {
      if (/passa\w* a (?:vigorar|ter)|seguinte redacao|leia-se|onde se le/.test(m[0])) continue;
      const t2 = tipo === "DOUTRINA" && RE_INTRO_FRACA.test(m[0]) && !temSujeitoAutoral(tn, bruto, m.index, m.index + m[0].length) ? "DOUTRINA?" : tipo;
      achados.push([m.index + m[0].length, t2]);
    }
  }
  achados.sort((x, y) => x[0] - y[0] || (x[1].startsWith("DOUTRINA") ? 1 : -1));
  for (const [ini, tipo] of achados) {
    if (out.length && ini < out[out.length - 1][1]) continue;
    // o bloco abre com texto corrido (maiúscula), não com aspas (ENTRE ASPAS cuida) nem com lista/número de processo
    const abre = bruto.slice(ini, ini + 6).replace(/^\s+/, "");
    if (!/^[A-ZÀ-Ý]/.test(abre)) continue;
    let fimB = Math.min(fim, ini + INTRODUZIDA_MAX);
    if (fimB === ini + INTRODUZIDA_MAX) fimB = recuarAteFronteira(bruto, ini, fimB);   // teto no meio da palavra: recua (Fable 24/10)
    // o relator resumindo ("Dispositivo da sentença: A sentença julgou improcedente…") não é transcrição
    const rf0 = new RegExp(RE_FIM_INTRODUZIDA.source, "g"); rf0.lastIndex = ini;
    const mf0 = rf0.exec(tn);
    if (mf0 && mf0.index < ini + 40) continue;
    // a retomada vale do início da FRASE em que aparece (ponto + maiúscula no bruto; "art. 966" não fecha frase)
    const inicioFrase = (p) => { let r = -1; for (const m of bruto.slice(ini, p).matchAll(/[.;\]\)][\s"”']+(?=[A-ZÀ-Ý])/g)) if (!/(?:^|[^a-z])(?:art|arts|n|fl|fls|p|pag|inc|des|min|rel|dr|dra)$/i.test(bruto.slice(Math.max(ini, ini + m.index - 5), ini + m.index))) r = ini + m.index + 1; return r > ini ? r : p; };
    const rf = new RegExp(RE_FIM_INTRODUZIDA.source, "g"); rf.lastIndex = ini + 40;
    const mf = rf.exec(tn);
    if (mf && mf.index < fimB) fimB = inicioFrase(mf.index);
    const rv = new RegExp(RE_VOZ_PROPRIA.source, "g"); rv.lastIndex = ini + 40;
    const mv = rv.exec(tn);
    if (mv && mv.index < fimB) fimB = inicioFrase(mv.index);
    const ro = new RegExp(RE_REF_OBRA.source, "g"); ro.lastIndex = ini;
    const mo = ro.exec(tn);
    if (mo && mo.index < fimB) fimB = mo.index + mo[0].length;
    const cab = bruto.slice(ini, fimB).search(/\b(?:VOTO|EMENTA|AC[ÓO]RD[ÃA]O)\b\s+[A-ZÀ-Ý]/);
    if (cab >= 0) fimB = ini + cab;
    if (fimB - ini >= INTRODUZIDA_MIN) out.push([ini, fimB, tipo]);
  }
  return out;
}

// ------------------------------------------------------------------------- custódia de voz no RECIBO (1.41.9) ---
// Pendência de desenho (24/10/2026): o recibo e o lint da peticao-rg só viam TRANSCRIÇÃO, VOTO DIVERGENTE, ENTRE ASPAS e OBITER.
// ALEGAÇÃO DA PARTE, DOUTRINA e SENTENÇA TRANSCRITA saíam no verificar_citacao_tjro, mas a mesma frase posta na ficha passava no
// lint como voz do tribunal. Agora o recibo leva as faixas, nas MESMAS regiões em que o verificador procura:
//  - alegação: fora da voz da casa (relatório, voto, sentença, relatório avulso) e, na ementa do CNJ, nas seções I (caso em
//    exame) e II (questão em discussão); a faixa começa logo depois do verbo de relato aceito por verboDeRelatoDaParte e vai até o
//    fim da frase, cortada na 1ª marca de voz do tribunal, na adversativa ("não X, mas Y" não corta) e, com concessiva antes do
//    verbo, na 1ª vírgula — as mesmas paradas de alegacaoDaParte; verbo dentro de transcrição não abre faixa (lá vale TRANSCRIÇÃO);
//  - doutrina e sentença: os blocos de faixasIntroduzidas antes da voz da casa, sem os de baixa confiança (DOUTRINA?), que no
//    verificador são só nota.
// Heurística, como o resto da custódia: diz onde PARECE haver texto alheio; quem decide é quem lê o acórdão.
const RE_FIM_FRASE_VOZ = /[.;!?]["”’)\]]?\s+(?=["“‘(\[]?[A-ZÀ-Ý0-9])/g;
const FAIXA_ALEGACAO_MIN = 20;
/** Fim (exclusivo) da frase que contém `de`, no bruto, até `teto` (abreviações não fecham frase, como em inicioDaFrase). */
function fimDaFrase(bruto, tn, de, teto) {
  const r = new RegExp(RE_FIM_FRASE_VOZ.source, "g");
  r.lastIndex = de;
  for (let m; (m = r.exec(bruto)) && m.index < teto;) {
    if (m[0][0] === "." && ABREV.test(tn.slice(Math.max(0, m.index - 8), m.index))) continue;
    return m.index + 1;
  }
  return recuarAteFronteira(bruto, de, teto);
}
// Reataque Fable (24/10/2026): o teto (ALEGACAO_DIST_MAX, INTRODUZIDA_MAX) caía no meio da palavra ("…sobre os imóvei") e o lint, que
// procura o bloco por palavra inteira, não o achava — a faixa ficava morta no recibo. Corte no teto recua à última fronteira de palavra.
const LETRA = /[A-Za-zÀ-ÿ0-9]/;
export function recuarAteFronteira(bruto, de, teto) {
  if (teto >= bruto.length || !LETRA.test(bruto[teto] || "") || !LETRA.test(bruto[teto - 1] || "")) return teto;
  let k = teto;
  while (k > de && LETRA.test(bruto[k - 1])) k--;
  while (k > de && /\s/.test(bruto[k - 1])) k--;
  return k > de ? k : teto;
}
/** Faixas [ini, fim) de alegação da parte em [z0, z1) do texto (tn = norm1(bruto)); `fora` = faixas transcritas. */
export function faixasAlegacao(bruto, tn, z0, z1, fora = []) {
  const out = [];
  const r = new RegExp(VERBO_RELATO.source, "g");
  r.lastIndex = z0;
  for (let m; (m = r.exec(tn)) && m.index < z1;) {
    const pos = m.index, fimV = pos + m[0].length;
    if (fora.some(([a, b]) => pos >= a && pos < b)) continue;
    // até o FIM do verbo: a quebra de frase exige a maiúscula seguinte dentro do segmento ("…tutela. Aduz que…")
    const frase0 = inicioDaFrase(bruto, tn, Math.max(z0, pos - ALEGACAO_DIST_MAX), fimV);
    if (!verboDeRelatoDaParte(tn, frase0, pos, m[0])) continue;
    let fim = fimDaFrase(bruto, tn, fimV, Math.min(z1, fimV + ALEGACAO_DIST_MAX));
    for (const [a] of fora) if (a > fimV && a < fim) fim = a;
    const seg = tn.slice(fimV, fim);
    let corte = seg.length;
    const mv = new RegExp(RE_VOZ_PROPRIA.source).exec(seg);
    if (mv) corte = Math.min(corte, mv.index);
    const mt = VOZ_DO_TRIBUNAL.exec(seg);
    if (mt) corte = Math.min(corte, mt.index);
    const adv = RE_ADVERSATIVA.exec(seg);
    if (adv && !(adv[0] === "mas" && /(?<![a-z0-9])nao(?![a-z0-9])[^.;]{0,70}$/.test(seg.slice(0, adv.index)))) corte = Math.min(corte, adv.index);
    if (RE_CONCESSIVA.test(tn.slice(frase0, fimV))) { const v = seg.indexOf(","); if (v >= 0) corte = Math.min(corte, v); }
    if (corte >= FAIXA_ALEGACAO_MIN) out.push([fimV, fimV + corte]);
  }
  // une as sobrepostas (dois verbos na mesma frase)
  const u = [];
  for (const f of out.sort((x, y) => x[0] - y[0])) {
    if (u.length && f[0] <= u[u.length - 1][1]) u[u.length - 1][1] = Math.max(u[u.length - 1][1], f[1]);
    else u.push([...f]);
  }
  return u;
}
/** Campos de voz do recibo: trechos (em bruto) de alegação da parte, doutrina e sentença anunciadas por dois-pontos. */
export function camposDeVoz(texto, tipo) {
  const vazio = { trechos_alegacao_parte: [], trechos_doutrina: [], trechos_sentenca_transcrita: [] };
  if (!texto) return vazio;
  const t = String(tipo || "").trim().toUpperCase();
  const n = texto.length, tn = norm1(texto);
  const fx = faixasAlheias(texto, tipo);
  const relato = (ini, fim) => secoesDaEmenta(texto, ini, fim).filter((x) => x.nome === "caso em exame" || x.nome === "questao em discussao");
  const aleg = [];
  if (t === "EMENTA") for (const s of relato(0, n)) aleg.push(...faixasAlegacao(texto, tn, s.a, s.b));
  else {
    aleg.push(...faixasAlegacao(texto, tn, 0, fx.casaIni, fx.transcritas));
    if (/AC[ÓO]RD[ÃA]O/.test(t) && fx.casaIni < n) for (const s of relato(fx.casaIni, fx.fecho)) aleg.push(...faixasAlegacao(texto, tn, s.a, s.b));
  }
  const intro = t === "EMENTA" ? [] : faixasIntroduzidas(tn, texto, 0, fx.casaIni);
  const corta = (xs) => xs.map(([a, b]) => texto.slice(a, b));
  return {
    trechos_alegacao_parte: corta(aleg),
    trechos_doutrina: corta(intro.filter((x) => x[2] === "DOUTRINA")),
    trechos_sentenca_transcrita: corta(intro.filter((x) => x[2] === "SENTENÇA TRANSCRITA")),
  };
}
/** Todos os campos de custódia do recibo: os de camposAlheios (transcrição, divergente, aspas, obiter, voz própria) + os de voz. */
export function camposCustodia(texto, tipo) {
  return { ...camposAlheios(texto, tipo), ...camposDeVoz(texto, tipo) };
}

// ------------------------------------------------------------------ concessiva negativa (1.41.9, item 3) ---
// "Ainda que não se trate de matéria de ordem pública, dou provimento…", "Embora não haja documento formal, a prova testemunhal
// confirma…": o tribunal ADMITE o ponto e decide apesar dele. O conteúdo da concessiva ("não haja documento formal") não é a razão
// do resultado e, citado sem a oração principal, parece apoiar o resultado OPOSTO; nenhum alerta cobria (o "não" está dentro do
// trecho, então NEGAÇÃO não dispara, e RE_OBITER só pega o contrafactual "ainda que assim não fosse"). Medido na cópia dos recibos
// (24/10/2026): 548 orações assim, em 475 documentos, todas sem alerta de NEGAÇÃO ou OBITER. Só a concessiva NEGATIVA (o caso
// do achado); a afirmativa fica de fora para não alarmar à toa. Entre o conectivo e o "não" cabem até 2 palavras (o sujeito:
// "embora o Município não seja…"), nunca um particípio ("apesar de devidamente intimado não houve…" é a oração principal).
const RE_CONCESSIVA_NEG = /(?<![a-z0-9])(ainda que|embora|mesmo que|conquanto|em que pese|nao obstante|apesar de|a despeito de|se bem que)\s+((?:[a-z-]+\s+){0,2}?)(?:nao|nem|jamais|nunca)(?![a-z0-9])/g;
const CONCESSIVA_MAX = 260;
/** O trecho [ini0, fim) (norm1) está, na MAIORIA, dentro do conteúdo de uma oração concessiva negativa que começa ANTES dele e é
 * seguida de oração principal (vírgula)? Devolve {marca, a, b, principal} (a = início do conectivo, b = a vírgula), ou null. */
export function concessivaNegativa(tn, ini0, fim) {
  const r = new RegExp(RE_CONCESSIVA_NEG.source, "g");
  r.lastIndex = Math.max(0, ini0 - CONCESSIVA_MAX);
  for (let m; (m = r.exec(tn)) && m.index < ini0;) {
    if (/(?:ad|id)[oa]s?\s/.test(m[2])) continue;   // particípio entre o conectivo e o "não"
    // "afirma ainda que não possui…", "entendeu ainda que o apelante não…": é "ainda" + "que" integrante, não concessiva — vale só
    // depois de pontuação, no início ou depois de conjunção (medido na cópia: 27 de 109 "ainda que" vinham depois de verbo)
    if (m[1] === "ainda que" && !/(?:^|[,;:.(\[\u2014\u2013-]|(?<![a-z0-9])(?:e|mas|que|pois|porque|ou|porem|todavia|contudo|entretanto|mesmo|assim|portanto|logo))\s*$/.test(tn.slice(Math.max(0, m.index - 30), m.index))) continue;
    const naoIni = m.index + m[0].length - m[0].split(/\s+/).pop().length;
    const resto = tn.slice(naoIni, naoIni + CONCESSIVA_MAX);
    // Reataque Fable (24/10/2026): (1) concessiva PÓS-POSTA ("…, mesmo que não intervenha diretamente no processo. A imparcialidade…",
    // "…e ainda que não seja possível delimitar … o horário do crime. Basta…") termina em ponto: vale quando o conectivo vem depois de
    // vírgula ou "e" com a oração principal antes dele na mesma frase; (2) vírgula INTERNA ("Embora não haja, nos autos, prova…, o réu
    // confessou"; "não permitam individualizar, unidade por unidade, quais…") não fecha a concessiva: aposto curto (até 4 palavras)
    // entre vírgulas é pulado. Se depois de pular apostos não vier vírgula que feche, vale a 1ª vírgula (como antes).
    const posposta = /(?:,|(?<![a-z0-9])(?:e|ou|nem))\s*$/.test(tn.slice(Math.max(0, m.index - 4), m.index)) && /[a-z]{3,}[^.;:!?]*[,\s]$/.test(tn.slice(Math.max(0, m.index - 200), m.index).split(/[.;:!?]\s/).pop());
    // Reataque Fable (24/10/2026, 6 documentos reais): o "." de abreviatura ("pág.", "art.", "n.") ou de número ("23.669") não fecha a frase
    const ps = [...resto.matchAll(/[,.;:!?]/g)].filter((x) => !(x[0] === "." && (/\d$/.test(resto.slice(0, x.index)) && /^\d/.test(resto.slice(x.index + 1)) || /(?:^|[^a-z])(?:pag|pags|art|arts|fl|fls|n|no|inc|par|p|v|ss|cf|dr|dra|sr|sra|des|min|exmo|exma|ob|op|cit|ex|etc|rel|rela|desa)$/.test(resto.slice(0, x.index))))).map((x) => x.index);
    if (!ps.length) continue;
    let v = -1;
    if (resto[ps[0]] === ",") {
      v = ps[0];
      // um aposto curto só: ", nos autos," / ", unidade por unidade," — e só se depois dele vier a vírgula que fecha
      const seg = ps.length > 2 && resto[ps[1]] === "," ? resto.slice(ps[0] + 1, ps[1]).trim() : "";
      const nPal = seg ? seg.split(/\s+/).length : 0;
      if (nPal >= 1 && nPal <= 4 && resto[ps[2]] === ",") v = ps[2];
    } else if (posposta && /[.;!?]/.test(resto[ps[0]])) v = ps[0];
    if (v < 0) continue;
    const a = m.index, b = naoIni + v;
    if (ini0 < m.index + m[1].length) continue;     // o conectivo está no trecho: quem lê a citação vê a concessão
    const dentro = Math.max(0, Math.min(fim, b) - Math.max(ini0, naoIni));
    if (dentro * 2 > fim - ini0) {
      if (resto[v] !== ",") { const pi = Math.max(0, m.index - 120); return { marca: m[0], a, b, posposta: true, pi, pf: m.index, principal: tn.slice(pi, m.index) }; }
      return { marca: m[0], a, b, pi: b + 1, pf: b + 121, principal: tn.slice(b + 1, b + 1 + 120) };
    }
  }
  return null;
}

// ------------------------------------------------- sentença transcrita em bloco "[...]" (1.41.9, item 4) ---
// A custódia marca como transcrição o bloco aberto por "[...]" ou por aspas depois de "Em sentença, consignou o juízo de origem:",
// e o verificador dizia TRANSCRIÇÃO "de OUTRO julgado/tribunal" — na amostra B, 5 de 5 sentenças transcritas saíram assim, e
// SENTENÇA TRANSCRITA nunca disparava (faixasIntroduzidas só roda fora de transcrição). Agora o tipo do alerta olha a frase que
// ANUNCIA o bloco: menciona a sentença ou o juízo/magistrado/decisão de origem (nos últimos 200 caracteres, ou antes com verbo de
// decisão perto do fim: "…que julgou procedentes os pedidos, nos seguintes termos:"), termina em dois-pontos, "in verbis" ou "[...]",
// e não fala de acórdão, ementa, precedente, tribunal/câmara/turma, nem é o dispositivo do próprio voto ("dou provimento para
// reformar a sentença nos seguintes termos:"). Medido na cópia dos recibos (24/10/2026): 941 de 10.702 blocos transcritos mudam de
// tipo; lidos 170 em três sorteios ao longo do ajuste, os erros que sobraram na regra final (denúncia, laudo, cláusula de contrato,
// lei) saíram com a exigência do verbo de decisão; 50 de 50 certos no último sorteio. Só muda o TIPO: o alerta continua.
const RE_SENT_BLOCO = /(?<![a-z0-9])(?:sentenca|juizo (?:de origem|a quo|singular|sentenciante|primevo|de primeiro grau)|magistrad[oa] (?:de origem|a quo|sentenciante|singular|primevo|de primeiro grau)|decisao (?:recorrida|de origem|de primeiro grau|singular))(?![a-z0-9])/;
const RE_DECISAO_BLOCO = /(?<![a-z0-9])(?:julgou|julgando|julgad[oa]s? (?:parcialmente )?(?:procedentes?|improcedentes?|nos seguintes)|decidindo|declarou|fundamentado|denegou|concedeu|extinguiu|indeferiu|deferiu|condenou|absolveu|pronunciou|homologou|rejeitou|acolheu|consignou|assentou|fundamentou|decidiu|dispos|parte dispositiva|dispositivo|razoes de decidir)(?![a-z0-9])/;
const RE_NAO_SENT_BLOCO = /(?<![a-z0-9])(?:acordaos?|ementa|ementad[oa]|precedentes?|jurisprudencia|julgados|stj|stf|superior|supremo|tribunal|corte|camara|turma|embargad[oa]|(?:dou|dar|nego|negar|dando|negando)(?:-lhe| lhe)? (?:parcial )?provimento|reformar|reformando|reformo|(?:ante|diante|pelo|por todo) o? ?exposto|conceder a seguranca)(?![a-z0-9])/;
const RE_FIM_ANUNCIO = /(?::|verbis|\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\))\s*[.:]?\s*["“']?\s*$/;
/** A frase que anuncia o bloco transcrito que começa em `a` anuncia a SENTENÇA/decisão de 1º grau? Devolve a frase (bruto) ou null. */
export function sentencaAnunciadaAntes(texto, tn, a) {
  const de = Math.max(0, a - 300);
  let ini = de;
  for (const m of texto.slice(de, a).matchAll(/[.;!?]["”’)\]]?\s+(?=["“‘(\[]?[A-ZÀ-Ý])/g)) ini = de + m.index + m[0].length;
  const n = tn.slice(ini, a), bruto = texto.slice(ini, a);
  if (!RE_SENT_BLOCO.test(n) || !(RE_SENT_BLOCO.test(n.slice(-200)) || RE_DECISAO_BLOCO.test(n.slice(-200)))) return null;
  if (RE_NAO_SENT_BLOCO.test(n) || !RE_FIM_ANUNCIO.test(bruto)) return null;
  return bruto;
}
