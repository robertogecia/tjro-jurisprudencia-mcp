// v1.42.3 (relato de 04/11/2026, 3.1): desfecho de SENTENÇA PENAL lido do dispositivo. Texto de entrada = norm1 (sem acento, minúsculo).
// O par cível procedente/improcedente não serve ("procedente a pretensão punitiva" é condenação). Rótulo errado é pior que nenhum:
// dispositivo sem âncora, ou com marcas que não se somam, fica null.
export const ROTULOS_PENAL = {
  CONDENADO: "condenação",
  ABSOLVIDO: "absolvição",
  CONDENADO_PARCIAL: "condenação em parte (absolvição ou desclassificação de outro fato)",
  PUNIBILIDADE_EXTINTA: "extinção da punibilidade",
  PUNIBILIDADE_SCP: "extinção da punibilidade pela suspensão condicional do processo (art. 89 Lei 9.099)",
  PUNIBILIDADE_ANPP: "extinção da punibilidade pelo acordo de não persecução penal (art. 28-A CPP)",
  ABSOLVICAO_SUMARIA: "absolvição sumária (art. 397 CPP)",
  ANPP_HOMOLOGADO: "acordo de não persecução penal homologado (art. 28-A CPP)",
};
const RE_ABS_SUMARIA = /absolv\w+ sumariamente|absolvicao sumaria|art\.? 397/;
const RE_CONDENA = /\bcondeno\b|\bco ?n ?deno\b|\bcondenar\b|julgo (?:parcialmente )?procedente (?:a |o )?(?:pretensao punitiva|denuncia|acusacao|pedido (?:formulado )?(?:na|da) denuncia)|procedente em parte a pretensao punitiva|procedente a acao penal/;
const RE_ABSOLVE = /\babsolvo\b|\babsolver\b|julgo improcedente (?:a |o )?(?:pretensao punitiva|denuncia|acusacao|acao penal)|art\.? 386/;
const RE_EXTINTA = /declaro extinta a punibilidade|extinta a punibilidade|extincao da punibilidade|decreto a extincao da punibilidade/;
// Não são sentença de mérito penal: impronúncia (júri) e homologação de transação penal (a extinção vem depois, no cumprimento).
const RE_FORA = /impronunc|transacao penal/;
// Sentença que corrige outra (embargos de declaração, "onde se lê / leia-se") não tem desfecho próprio.
const RE_INTEGRATIVA_PENAL = /onde se lia|onde se le\b|leia-se|(?:acolho|rejeito|conheco|julgo (?:im)?procedentes?)(?: os)?(?: presentes)? embargos (?:declaratorios|de declaracao)/;
// Extinção DECIDIDA nesta sentença (verbo do juiz), não a narrada nos antecedentes ("sentença de extinção da punibilidade proferida em…").
const RE_EXT_DECIDIDA = /(?:declaro|julgo|decreto|reconheco)[^.]{0,60}extin\w+ (?:a |d[ae] )?(?:sua |seu )?punibilidade|extingo a punibilidade|reconheco a (?:decadencia|prescricao)/;
const RE_DESCLASSIF = /desclassific/;
const CAUSAS = [
  [/art(?:igo|\.)? ?89|suspensao condicional do processo/, "suspensão condicional do processo, art. 89 Lei 9.099"],
  [/art(?:igo|\.)? ?28-a|acordo de nao persecucao penal|\banpp\b/, "ANPP, art. 28-A CPP"],
  [/prescri[cç]ao|prescricao/, "prescrição"],
  [/\bmorte\b|obito|falecimento|art(?:igo|\.)? ?107,? (?:inciso )?i\b/, "morte do agente"],
  [/indulto|graca|anistia/, "indulto, graça ou anistia"],
  [/decadencia|renuncia|perempcao|retratacao|perdao/, "decadência, renúncia, perempção, retratação ou perdão"],
  [/cumprimento da pena|integral cumprimento|cumprida a pena/, "pena cumprida"],
];
/** Causa da extinção da punibilidade, em texto, ou "" (só para rótulo PUNIBILIDADE_EXTINTA). */
export function causaDaExtincao(disp) {
  for (const [re, nome] of CAUSAS) if (re.test(disp)) return nome;
  return "";
}
/** `disp`: dispositivo normalizado (posicao.js: dispositivoDaSentenca). Devolve a chave de ROTULOS_PENAL ou null. */
export function desfechoPenal(disp) {
  if (!disp) return null;
  const d = disp.slice(0, 6000);
  if (RE_INTEGRATIVA_PENAL.test(d)) return null;
  if (RE_FORA.test(d) && !RE_CONDENA.test(d) && !RE_ABSOLVE.test(d)) return null;
  const abs = RE_ABSOLVE.test(d), con = RE_CONDENA.test(d), ext = RE_EXTINTA.test(d), sum = RE_ABS_SUMARIA.test(d);
  if (sum && !con) return "ABSOLVICAO_SUMARIA";
  if (con && (abs || RE_DESCLASSIF.test(d) || RE_EXT_DECIDIDA.test(d))) return "CONDENADO_PARCIAL";
  if (con) return "CONDENADO";
  if (abs) return "ABSOLVIDO";
  if (ext) {
    const c = causaDaExtincao(d);
    return c.startsWith("suspensão") ? "PUNIBILIDADE_SCP" : c.startsWith("ANPP") ? "PUNIBILIDADE_ANPP" : "PUNIBILIDADE_EXTINTA";
  }
  return null;
}

// v1.42.3: classe "ACORDO DE NÃO PERSECUÇÃO PENAL". A sentença homologa o acordo ou, cumprido, declara extinta a punibilidade; 122 de
// 179 nos recibos não têm âncora de dispositivo ("ante o exposto…"), então lê os 2.500 caracteres finais quando ela falta.
const RE_EXTINCAO_ANPP = /extin\w+ (?:(?:a |d[ae] )?(?:sua |seu )?)punibilidade/;
const RE_HOMOLOGA_ANPP = /\bhomologo\b|\bhomologa-se\b|\bhomologar o acordo\b/;
export function desfechoAnpp(disp, textoTodo) {
  const d = (disp || String(textoTodo || "").slice(-2500));
  if (!d) return null;
  if (RE_CONDENA.test(d) || RE_ABSOLVE.test(d) || RE_INTEGRATIVA_PENAL.test(d)) return null;
  if (RE_EXTINCAO_ANPP.test(d)) {
    const c = causaDaExtincao(d);
    return c && !c.startsWith("ANPP") && !c.startsWith("pena cumprida") ? (c.startsWith("suspensão") ? "PUNIBILIDADE_SCP" : "PUNIBILIDADE_EXTINTA") : "PUNIBILIDADE_ANPP";
  }
  if (RE_HOMOLOGA_ANPP.test(d)) return "ANPP_HOMOLOGADO";
  return null;
}
