// posicao.js (v1.15.0): ONDE o trecho está no julgado — seção da ementa do CNJ (Res. 2023: caso em exame, questão em
// discussão, razões de decidir, dispositivo e tese), relatório / fundamentação / dispositivo do voto, fecho — e a marca de
// raciocínio hipotético ou fundamento alternativo (obiter dictum). É um LOCALIZADOR, não um juiz: diz onde a frase está,
// para o agente preencher `ratio_ou_dictum` da ficha com evidência; decidir se o julgado dependeu dela continua sendo de
// quem lê o acórdão. Distinguishing não mora aqui: exige os fatos do caso, que o servidor nunca vê.
import { norm1 } from "./custodia.js";

export const RE_SECAO_EMENTA = /\b(?:I{1,3}|IV|V)[ \t\n\r\f\v]*[.)-]?[ \t\n\r\f\v]*(CASO EM EXAME|QUEST(?:ÃO|ÕES) EM DISCUSS[ÃA]O|RAZ[ÕO]ES DE DECIDIR|DISPOSITIVOS? E TESES?|DISPOSITIVO)\b/g;
export const RE_CAUDA_EMENTA = /\b(?:Dispositivos? relevantes? citados?|Jurisprud[êe]ncia relevante citada|Legisla[çc][ãa]o relevante citada)\b/g;
// fórmulas que abrem o dispositivo do voto (as frequentes nos 826 recibos: "ante o exposto" 275, "diante do exposto" 107…);
// "diante disso"/"assim sendo" ficam de fora — aparecem no meio da fundamentação
export const RE_DISPOSITIVO = /(?<![a-z0-9])(?:ante o exposto|diante do exposto|pelo exposto|em face do exposto|por todo o exposto|posto isso|posto isto|isso posto|isto posto|por tais razoes|por essas razoes|por todas essas razoes|com essas consideracoes|com tais consideracoes|ex positis|forte nessas razoes)(?![a-z0-9])/g;
const RE_RESULTADO = /(?<![a-z0-9])(?:nego|dou|conheco|nao conheco|julgo|rejeito|acolho|mantenho|reformo|provimento|provido|desprovido|improcedente|procedente|prejudicado|homologo|declaro|defiro|indefiro|concedo|denego|extingo|anulo|casso|confirmo|voto (?:pelo|por|no sentido))(?![a-z0-9])/;
// marcas de obiter: "ainda que assim não fosse", "mesmo que se admitisse", "a título de argumentação", "de todo modo"…
// "em tese" e "não é o caso dos autos" ficam de fora: o primeiro quase sempre é "em abstrato"; o segundo fecha a regra que o
// voto acabou de APLICAR ("…só quando irrisórios ou exorbitantes, o que não é o caso dos autos")
export const RE_OBITER = /(?<![a-z0-9])(?:ainda que assim nao fosse|se assim nao fosse|(?:ainda|mesmo) que (?:se )?(?:admitisse(?:mos)?|superad[ao]s?|ultrapassad[ao]s?|afastad[ao]s?|entendesse(?:mos)?|considerasse(?:mos)?|fosse|houvesse|pudesse)|a titulo de (?:argumentacao|reforco|ilustracao|obiter dictum)|(?:apenas|somente|so) para argumentar|ad argumentandum(?: tantum)?|por amor ao debate|obiter dictum|caso se entendesse|de todo modo|de toda forma|de qualquer forma|de qualquer modo|em carater subsidiario)(?![a-z0-9])/g;

/** Seções da ementa no intervalo [ini, fim) do texto: [{nome, a, b}] em ordem; vazio se não houver o modelo do CNJ. */
export function secoesDaEmenta(texto, ini, fim) {
  const seg = texto.slice(ini, fim);
  const marcas = [];
  for (const m of seg.matchAll(RE_SECAO_EMENTA)) marcas.push({ nome: norm1(m[1]).replace(/^quest(?:ao|oes) em discussao$/, "questao em discussao").replace(/^dispositivos? e teses?$/, "dispositivo e tese"), a: ini + m.index, corpo: ini + m.index + m[0].length });
  if (!marcas.length) return [];
  const cauda = seg.search(RE_CAUDA_EMENTA);
  const out = [];
  for (let i = 0; i < marcas.length; i++) {
    const b = i + 1 < marcas.length ? marcas[i + 1].a : (cauda >= 0 && ini + cauda > marcas[i].a ? ini + cauda : fim);
    out.push({ nome: marcas[i].nome, a: marcas[i].a, b });
  }
  if (cauda >= 0 && ini + cauda > out[out.length - 1].a) out.push({ nome: "cauda", a: ini + cauda, b: fim });
  return out;
}

const ROTULO = {
  "caso em exame": "ementa › I. CASO EM EXAME — resumo do caso, não tese",
  "questao em discussao": "ementa › II. QUESTÃO EM DISCUSSÃO — a pergunta posta, não a resposta",
  "razoes de decidir": "ementa › III. RAZÕES DE DECIDIR — fundamento que a ementa apresenta como razão de decidir (candidato a ratio; confira no voto se o resultado dependeu dele)",
  "dispositivo e tese": "ementa › IV. DISPOSITIVO E TESE — resultado e tese enunciada",
  "dispositivo": "ementa › IV. DISPOSITIVO — resultado do julgamento",
  "cauda": "ementa › lista de dispositivos/jurisprudência citados — referência, não tese",
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

/** Nota "POSIÇÃO NO JULGADO" para o trecho [ini0, fim) do `texto` (tipo dado; `fx` = faixasAlheias), ou "". */
export function posicaoNoJulgado(texto, tipo, ini0, fim, fx) {
  const t = String(tipo || "").trim().toUpperCase();
  const n = texto.length;
  const meio = ini0 + Math.floor((fim - ini0) / 2);
  const emEmenta = t === "EMENTA" ? [0, n] : (/AC[ÓO]RD[ÃA]O/.test(t) && fx.casaIni < n ? [fx.casaIni, fx.fecho] : null);
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
  if (p.votoIni < 0) return "";
  if (p.dispIni >= 0 && meio >= p.dispIni && meio < p.fimRelator) return "DISPOSITIVO do voto — é o que foi decidido, não a razão de decidir";
  if (meio >= p.votoIni && meio < p.fimRelator) {
    const d = p.dispIni >= 0 ? ` (o dispositivo começa ${p.dispIni - meio} caracteres adiante, em «${texto.slice(p.dispIni, p.dispIni + 60).replace(/[ \t\n\r\f\v]+/g, " ")}…»)` : " (dispositivo não localizado por fórmula)";
    return "fundamentação do voto do relator, antes do dispositivo" + d;
  }
  if (meio >= p.fimRelator && meio < p.fimVoto) return "depois do voto do relator (voto de vogal, voto-vista ou declaração de voto) — veja quem assina e o fecho";
  return "";
}
