// Fonte ÚNICA das fórmulas de "relator vencido" da proclamação do fecho (1.41.9). Até aqui havia duas listas que não batiam:
// auditoria.js (quem confirma o relator da citação) e custodia.js (onde começa o voto que pode ser o vencido). As expressões
// toleram caixa e acento, e servem tanto ao texto bruto (auditoria) quanto ao norm1 (custódia).
//
// Duas leituras, de propósito diferentes, sobre as MESMAS peças:
//  - relatorVencidoTotal: o relator perdeu e quem lavra é outro — a auditoria não aceita o relator do cabeçalho como o do acórdão.
//    "VENCIDO EM PARTE O RELATOR" fica de fora (nos acórdãos guardados quem assina continua sendo o relator).
//  - sinalDeRelatorVencido: qualquer sinal de que o voto do relator (o primeiro) perdeu, ao menos em parte — a custódia marca o
//    voto dele como possível vencido. Inclui "vencido em parte", "nos termos do voto divergente", "lavrará o acórdão" e
//    "relator para o acórdão" (a custódia exige ainda a maioria proclamada; ver faixasAlheias).
// o PDF parte a palavra ("VENCIDOS O R ELATOR", recibo 27390810): espaço único entre as letras é tolerado
const RELATOR = String.raw`r\s?e\s?l\s?a\s?t\s?o\s?r(?:\s?a)?\b`;
// Reataque Fable (24/10/2026): "VENCIDO O E. RELATOR" (e. = eminente), "relator(a) vencido(a)" e o nome em CAIXA ALTA entre
// "vencido o" e "relator" («POR MAIORIA, VENCIDO O DESEMBARGADOR JORGE LUIZ DOS SANTOS LEAL, RELATOR.») não eram lidos.
const QUEM = String.raw`(?:o\s+voto\s+d[oa]\s+|(?:o|a)\s+)(?:(?:eminente|ilustre|e\.|em\.|des\.?|desa\.?|desembargador(?:a)?)\s*)?${RELATOR}`;
export const RE_VENCIDO_RELATOR = new RegExp(String.raw`\bvencid[oa]s?\s+${QUEM}|\brelator(?:a)?(?:\s*\(\s*a\s*\))?\s+vencid[oa](?:\s*\(\s*a\s*\))?(?![a-z])(?!\s+em\s+parte)`, "i");
// nome em CAIXA ALTA (sem flag i: só a proclamação/assinatura em maiúsculas, nunca texto corrido como "vencido o Des. Fulano, que
// acompanhou o voto originário do relator"); "RELATOR PARA O ACÓRDÃO" depois do nome é quem lavra, não o vencido
const NOME_CX = String.raw`[A-ZÀ-Ý][A-ZÀ-Ý'-]+`;
export const RE_VENCIDO_NOME_RELATOR = new RegExp(String.raw`\b(?:VENCID[OA]S?|[Vv]encid[oa]s?)\s+(?:O|A|o|a)\s+(?:(?:DES|DESA|DESEMBARGADOR|DESEMBARGADORA|Des|Desa|Desembargador|Desembargadora|JUIZ|JUÍZA|Juiz|Juíza)\.?\s+)?${NOME_CX}(?:\s+(?:D[AEO]S?\s+)?${NOME_CX}){1,6}\s*,?\s*(?:RELATOR|RELATORA|[Rr]elator|[Rr]elatora)\b(?!\s+(?:PARA|P\/|para|p\/))`);
export const RE_VENCIDO_RELATOR_EM_PARTE = new RegExp(String.raw`\bvencid[oa]s?\s+(?:em\s+parte|parcialmente)\s+${QUEM}|\brelator(?:a)?\s+vencid[oa]\s+em\s+parte`, "i");
export const RE_TERMOS_VOTO_DIVERGENTE = /\bnos\s+termos\s+do\s+voto\s+divergente\b/i;
// "LAVRARÁ O ACÓRDÃO O DES. X" e "LAVRARÁ O DES. X" (sem "o acórdão"): o nome vem depois (auditoria lê o redator daqui)
export const RE_LAVRARA = /lavrar[áa]\s+(?:o\s+ac[óo]rd[ãa]o\s+)?(?:o|a)\s+/i;
const RE_LAVRARA_SINAL = /\blavrar[áa]\s+(?:o\s+ac[óo]rd[ãa]o\b|(?:o|a)\s+)/i;
export const RE_PARA_ACORDAO = /(?:relator(?:a)?\s+(?:para|p\/|p\.)\s*o|prolator(?:a)?\s+d[oe])\s+ac[óo]rd[ãa]o/i;

/** O relator ficou vencido (por inteiro) na proclamação `p`? */
export const relatorVencidoTotal = (p) => RE_VENCIDO_RELATOR.test(p) || RE_VENCIDO_NOME_RELATOR.test(p);
/** Algum sinal de que o voto do relator perdeu, ao menos em parte, na proclamação `p`? */
export const sinalDeRelatorVencido = (p) => RE_VENCIDO_RELATOR.test(p) || RE_VENCIDO_NOME_RELATOR.test(p) || RE_VENCIDO_RELATOR_EM_PARTE.test(p) || RE_TERMOS_VOTO_DIVERGENTE.test(p) ||
  RE_LAVRARA_SINAL.test(p) || RE_PARA_ACORDAO.test(p);
