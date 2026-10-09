// Linha do tempo por ano e "julgados que citam este" (v1.25, 09/10/2026). Espelho de _linha_do_tempo e _citacoes_de (servidor_tjro.py).
import { buildBuscaBody, post, limpar, resultadoDe, rotuloDoConjunto, cnj, orgao, relator, idDocumento, gravarRecibos } from "./lib.js";
import { norm1 } from "./custodia.js";

const RE_SINAL_AFASTA = /(?<![a-z0-9])(?:distingue|distinguish\w*|distincao|nao se aplica|inaplicavel|nao se amolda|nao guarda similitude|nao ha similitude|situacao diversa|hipotese diversa|caso diverso|em sentido contrario|em sentido diverso|contrariamente|diverge|divergente|afasta(?:-se)? a aplicacao|nao ha identidade|nao incide|nao se verifica a mesma)(?![a-z0-9])/;
const WS = /[ \t\n\r\f\v]+/g;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** post que espera o tempo que o limitador de ritmo pede ([espera_segundos=N]); nunca contorna o limite. */
export async function postComEspera(body, tentativas = 8, postImpl = post, dormirImpl = dormir) {
  for (let k = 0; k < tentativas; k++) {
    try {
      return await postImpl(body);
    } catch (e) {
      const msg = String((e && e.message) || e);
      const m = msg.match(/espera_segundos=(\d+)/);
      // só espera rajada curta do limitador (até 75 s); bloqueio do tribunal ou espera longa: devolve o erro na hora (a ferramenta não trava por minutos)
      if (!m || k === tentativas - 1 || /bloqueio_do_tribunal/.test(msg) || Number(m[1]) > 75) throw e;
      await dormirImpl((Number(m[1]) + 1) * 1000);
    }
  }
  return {};
}

/** Janelas de texto em volta das ocorrências do número CNJ `numero` (com máscara) no texto de OUTRO julgado. */
export function janelasDeCitacao(texto, numero, antes = 350, depois = 250, maximo = 3) {
  if (!texto || !numero) return [];
  const out = [];
  let ult = -1e9, i = -1;
  while ((i = texto.indexOf(numero, i + 1)) >= 0) {
    if (i - ult < depois) continue;
    ult = i;
    out.push(texto.slice(Math.max(0, i - antes), i + numero.length + depois).replace(WS, " ").trim());
    if (out.length >= maximo) break;
  }
  return out;
}

/** Sinal lexical FRACO (62% de precisão, 50% de cobertura em 486 janelas medidas às cegas) de afastamento do citado. */
export const sinalAfastamento = (janela) => RE_SINAL_AFASTA.test(norm1(janela));

/** Um resultado por JULGAMENTO (nº + data), unindo os documentos do mesmo julgado. */
export function contarJulgamentos(hits) {
  const por = new Map();
  for (const h of hits) {
    const s = h._source || {};
    const k = `${s.nr_processo}|${s.dtjulgamento_str || s.dtjulgamento}`;
    const e = por.get(k) || { r: new Set(), cl: s.ds_classe_judicial };
    for (const r of resultadoDe(limpar(s.ds_modelo_documento || "", 0))) e.r.add(r);
    por.set(k, e);
  }
  const cont = {};
  for (const e of por.values()) {
    const rot = rotuloDoConjunto(e.r, e.cl);
    const key = rot || "SEM";
    cont[key] = (cont[key] || 0) + 1;
  }
  return { n: por.size, cont };
}

export function formatarLinhaDoTempo(linhas, filtros, incompleta = "") {
  const out = [
    `**Linha do tempo por ano (ACÓRDÃO${filtros})** — uma consulta por ano, até a amostra pedida dos acórdãos mais recentes de cada ano`,
    "| Ano | Docs no índice | Julgamentos na amostra | provido | parcial | desprovido | acolhido | rejeitado | sem resultado |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const l of linhas) {
    const c = (k) => String(l.cont[k] || 0);
    out.push(`| ${l.ano} | ${l.total} | ${l.n} | ${c("PROVIDO")} | ${c("PARCIAL")} | ${c("DESPROVIDO")} | ${c("ACOLHIDO")} | ${c("REJEITADO")} | ${c("SEM")} |`);
  }
  out.push(
    "_Amostra por ano (os mais recentes do ano), não o universo. Resultado declarado no dispositivo não é posição sobre a tese: provido por outro fundamento conta como provido. " +
      "Mudança de proporção entre anos é sinal para LER os julgados dos dois períodos, nunca prova de superação nem de mudança de entendimento (efeito de câmara, de relator e de precedente novo se misturam)._"
  );
  if (incompleta) out.push(incompleta);
  return out.join("\n");
}

export async function linhaDoTempo(o, postImpl = post, dormirImpl = dormir) {
  const anoFim = Math.min(Number(o.anoFim), new Date().getFullYear());
  const anoInicio = Math.max(Number(o.anoInicio), anoFim - 8);
  const porPagina = Math.max(20, Math.min(Number(o.porPagina || 80), 150));
  const filtros = [o.relator ? ` · relator ${o.relator}` : "", o.orgaoColegiado ? ` · ${o.orgaoColegiado}` : "", o.classeJudicial ? ` · ${o.classeJudicial}` : "", o.consulta ? ` · "${o.consulta}"` : ""].join("");
  const linhas = [];
  let incompleta = "";
  for (let ano = anoInicio; ano <= anoFim; ano++) {
    const corpo = buildBuscaBody({ consulta: o.consulta || "", tipo: ["ACÓRDÃO"], grau: 2, classe: o.classeJudicial, orgaoColegiado: o.orgaoColegiado, relator: o.relator, grupos: o.grupos, dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31`, termoExato: false, ordenacao: "recentes", pagina: 1, porPagina });
    let data;
    try {
      data = await postComEspera(corpo, 8, postImpl, dormirImpl);
    } catch (e) {
      incompleta = `⚠️ [PESQUISA INCOMPLETA] parou no ano ${ano}: ${(e && e.message) || e}. Os anos acima são reais; os demais não foram consultados (não é "zero").`;
      break;
    }
    if (postImpl === post) gravarRecibos(data);
    const hits = ((data.hits || {}).hits) || [];
    const c = contarJulgamentos(hits);
    linhas.push({ ano, total: (((data.hits || {}).total) || {}).value || 0, n: c.n, cont: c.cont });
  }
  if (!linhas.length) return incompleta || "Sem resultado.";
  return formatarLinhaDoTempo(linhas, filtros, incompleta);
}

export async function citacoesDe(nrProcesso, limite = 10, postImpl = post, dormirImpl = dormir) {
  const digs = String(nrProcesso || "").replace(/\D/g, "");
  if (digs.length !== 20) return "Informe o número CNJ completo (20 dígitos), com ou sem máscara.";
  const numero = cnj(digs);
  const corpo = buildBuscaBody({ consulta: `"${numero}"`, tipo: ["ACÓRDÃO"], grau: 2, termoExato: true, ordenacao: "recentes", pagina: 1, porPagina: 50 });
  let data;
  try {
    data = await postComEspera(corpo, 8, postImpl, dormirImpl);
  } catch (e) {
    return `[PESQUISA NÃO REALIZADA] ${(e && e.message) || e}`;
  }
  if (postImpl === post) gravarRecibos(data);
  const hits = ((data.hits || {}).hits) || [];
  const achados = [];
  for (const h of hits) {
    const s = h._source || {};
    if (String(s.nr_processo || "").replace(/\D/g, "") === digs) continue;
    const jan = janelasDeCitacao(limpar(s.ds_modelo_documento || "", 0), numero);
    if (jan.length) achados.push([s, jan]);
  }
  const total = (((data.hits || {}).total) || {}).value || 0;
  const out = [`**Julgados do TJRO que citam ${numero}** — ${achados.length} nos ${hits.length} acórdãos mais recentes trazidos (o índice tem ${total} acórdãos com esse número no texto, contando o próprio).`];
  achados.slice(0, Math.max(1, Number(limite))).forEach(([s, jan], i) => {
    const sinal = jan.some(sinalAfastamento) ? " · ⚠️ sinal lexical de afastamento (fraco)" : "";
    out.push(`\n${i + 1}. ${cnj(s.nr_processo || "")} · ${orgao(s)} · ${s.dtjulgamento_str || "—"} · Rel. ${relator(s)} · id ${idDocumento(s) || "—"}${sinal}\n> ${jan[0].slice(0, 520)}`);
  });
  if (!achados.length) out.push("Nenhum outro acórdão do índice cita esse número (ou o citam sem a máscara). Zero aqui não prova que ninguém o aplicou.");
  out.push("\n_Só leitura assistida. Em 486 citações reais medidas às cegas: 51% seguem o citado, 44% só mencionam, 3% o afastam e nenhuma o declarou superado; o sinal de afastamento acerta ~62% e pega ~50%. Superação NÃO é detectada aqui: leia as janelas. Superação vinculante (IRDR/IAC/súmula) se confere no catálogo e no BNP._");
  return out.join("\n");
}
