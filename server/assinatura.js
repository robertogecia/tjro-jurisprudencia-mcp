// v1.42.3 (relato de 04/11/2026, 1.6): nome e data do campo do índice da SENTENÇA podem divergir da assinatura do próprio documento.
// Medido nos recibos (2.913 sentenças): assinatura legível em 2.075; nome divergente em ~17 (a maioria erro da extração, 2 troca real
// de juiz); data da assinatura diferente da do índice em 46 (2,2%). Só avisa quando diverge, e diz que prevalece o texto.
const MES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const n = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/​/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** { nome, data } da assinatura ao fim do texto de uma sentença ("<dd de mês de aaaa> <Nome> Juiz(a) de Direito"), ou null. */
export function assinaturaDaSentenca(texto) {
  const t = n(String(texto || "").slice(-500));
  // 1.42.4: a ÚLTIMA ocorrência (a assinatura), não a primeira ("audiência no dia X perante este juiz de direito").
  const todas = [...t.matchAll(/(?:(\d{1,2}) de (\w+) de (\d{4})[ ,.]*(?:assinado eletronicamente )?)?([a-z. ]{6,70}?) juiz(?:a|\(a\))? de direito/g)];
  const m = todas[todas.length - 1];
  if (!m) return null;
  const data = m[1] && MES[m[2]] ? `${String(+m[1]).padStart(2, "0")}/${String(MES[m[2]]).padStart(2, "0")}/${m[3]}` : "";
  return { nome: m[4].trim(), data };
}
/** Aviso curto quando a data da assinatura difere da do índice; "" se não diverge ou não há assinatura legível. O nome não entra: a extração erra mais do que o índice. */
export function avisoAssinatura(texto, dataIndice) {
  const a = assinaturaDaSentenca(texto);
  if (!a || !a.data || !dataIndice) return "";
  const di = String(dataIndice).slice(0, 10);
  return a.data === di ? "" : ` · ⚠️ assinatura no texto: ${a.data} (índice: ${di}); prevalece o texto`;
}
