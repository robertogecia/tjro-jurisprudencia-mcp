// Capa e movimentos de UM processo pela API pública de processos do próprio TJRO
// (Portal da Transparência → TIC → "Acesso Automatizado Via API - Judiciário",
// documento de 12/03/2026; base: art. 6º, § 4º, II, da Resolução CNJ 215/2015).
// Endereço separado do portal JURIS e, em 24/09/2026, respondendo normalmente à
// identificação desta extensão. Só metadado: sem partes, peças nem teor de decisão.
// Uma consulta por processo, a pedido; a lista de processos da API NÃO é usada
// (permitiria varredura, que esta extensão não faz).
// Red team de 24/09/2026 (11 achados) aplicado: erros com mensagem própria (nunca a
// do JURIS), sem herdar o disjuntor do JURIS, dígito verificador e segmento 8.22
// conferidos antes de gastar cota, cache conferido, movimentos defensivos.
import fs from "node:fs";
import path from "node:path";
import { HEADERS, reservarRequisicao, dirCache } from "./lib.js";

export const API_PROCESSOS = "https://datajud-api-transparencia.tjro.jus.br/processos";
export const CACHE_PROCESSO_MS = 60 * 60 * 1000; // 1 h: processo anda todo dia
const TIMEOUT_MS = 30000;

// Erro desta ferramenta: o texto já é a mensagem final ao usuário.
export class ErroProcesso extends Error {}

const soDigitos = (n) => String(n || "").replace(/\D/g, "");
export const cnjMascara = (n) => {
  const d = soDigitos(n);
  return d.length === 20 ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}` : null;
};

// Resolução CNJ 65/2008: DD = 98 - (NNNNNNN AAAA J TR OOOO 00 mod 97).
export function validarCnjTjro(n) {
  const d = soDigitos(n);
  if (d.length !== 20) return "Número de processo inválido: informe os 20 dígitos do CNJ.";
  if (d.slice(13, 16) !== "822")
    return `O número ${cnjMascara(d)} não é do TJRO (o segmento do tribunal é .${d[13]}.${d.slice(14, 16)}., o do TJRO é .8.22.).`;
  const base = BigInt(d.slice(0, 7) + d.slice(9) + "00");
  const dv = 98n - (base % 97n);
  if (dv !== BigInt(d.slice(7, 9))) return `O número ${cnjMascara(d)} tem dígito verificador inválido; confira se foi digitado certo.`;
  return null;
}

const arqCache = (d) => path.join(dirCache(), `processo-${d}.json`);

export function lerCacheProcesso(nr, agora = Date.now()) {
  try {
    const d = soDigitos(nr);
    const c = JSON.parse(fs.readFileSync(arqCache(d), "utf8"));
    const idade = agora - c.quando;
    if (c.nr !== d || !Number.isFinite(idade) || idade < 0 || idade > CACHE_PROCESSO_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function gravarCacheProcesso(nr, dados, agora = Date.now()) {
  try {
    const d = soDigitos(nr);
    fs.mkdirSync(dirCache(), { recursive: true });
    const alvo = arqCache(d);
    fs.writeFileSync(`${alvo}.${process.pid}.tmp`, JSON.stringify({ nr: d, quando: agora, dados }));
    fs.renameSync(`${alvo}.${process.pid}.tmp`, alvo);
  } catch {
    /* cache é economia, nunca condição */
  }
}

const temConteudo = (p) =>
  !!p && typeof p === "object" &&
  !!(p.orgaoJulgador || p.classe || p.dtAutuacao || (Array.isArray(p.movimentos) && p.movimentos.length));

const NAO_E_INEXISTENCIA = "Isso não indica que o processo não existe.";

// Devolve { dados } ou { vazio: true } (número incorreto OU segredo de justiça —
// o próprio tribunal diz que a consulta não distingue os dois).
export async function consultarProcesso(nr, fetchImpl = fetch) {
  const invalido = validarCnjTjro(nr);
  if (invalido) throw new ErroProcesso(invalido);
  const c = lerCacheProcesso(nr);
  if (c) return { dados: c.dados, doCache: c.quando };
  const reserva = reservarRequisicao(Date.now(), { ignorarBloqueio: true });
  if (reserva.erro) throw new ErroProcesso(reserva.erro);
  if (reserva.esperarMs > 0) await new Promise((r) => setTimeout(r, reserva.esperarMs));
  let r;
  try {
    r = await fetchImpl(`${API_PROCESSOS}/${cnjMascara(nr)}`, {
      headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError")
      throw new ErroProcesso(`A API de processos do TJRO não respondeu em ${TIMEOUT_MS / 1000} s. Tente de novo em alguns minutos. ${NAO_E_INEXISTENCIA}`);
    throw new ErroProcesso(
      "Falha de conexão com a API de processos do TJRO " +
        `(${e?.cause?.code || e?.cause?.message || e?.message || "erro de rede"}). Tente de novo em alguns minutos. ${NAO_E_INEXISTENCIA}`
    );
  }
  if (r.status === 404 || r.status === 204) return { vazio: true };
  if (r.status === 429)
    throw new ErroProcesso(`A API de processos do TJRO pediu para reduzir o ritmo (HTTP 429). Aguarde alguns minutos. ${NAO_E_INEXISTENCIA}`);
  if (r.status === 401 || r.status === 403)
    throw new ErroProcesso(
      `A API de processos do TJRO recusou o acesso (HTTP ${r.status}). Ela pode ter passado a exigir autenticação. ${NAO_E_INEXISTENCIA}`
    );
  if (!r.ok) throw new ErroProcesso(`A API de processos do TJRO respondeu com erro (HTTP ${r.status}). Tente mais tarde. ${NAO_E_INEXISTENCIA}`);
  let dados;
  try {
    dados = await r.json();
  } catch {
    throw new ErroProcesso(
      `A API de processos do TJRO devolveu conteúdo que não é JSON (possível página de bloqueio ou manutenção). ${NAO_E_INEXISTENCIA}`
    );
  }
  if (!dados || typeof dados !== "object" || (!temConteudo(dados.processoPg) && !temConteudo(dados.processoSg))) return { vazio: true };
  gravarCacheProcesso(nr, dados);
  return { dados };
}

const SN = (v) => (v === "S" ? "sim" : v === "N" ? "não" : null);

// ISO ("2026-09-19T00:25:15.915") ou BR ("19/09/2026"); qualquer outra coisa = sem data.
function instante(s) {
  if (typeof s !== "string") return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) + (Date.parse(s.slice(0, 19) + "Z") % 86400000 || 0);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}
const dataBr = (t) => {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const ehLocal = (m) => /^movimento local$/i.test(m?.movimento?.dsMovimentoExterno || m?.movimento?.dsMovimento || "");
const descricao = (m) => {
  const mv = m?.movimento || {};
  // A descrição externa às vezes vem com o modelo sem preencher ("Expedição de
  // #{tipo_de_documento}."); a interna ("Expedição de documento") é a melhor.
  const limpa = (x) => (x ? String(x).replace(/#\{[^}]*\}/g, "").replace(/\s+([.,])/g, "$1").trim() : "");
  const ext = mv.dsMovimentoExterno && !/#\{/.test(mv.dsMovimentoExterno) ? mv.dsMovimentoExterno : "";
  const t = limpa(mv.dsMovimento) || limpa(ext) || limpa(mv.dsMovimentoExterno);
  if (!t) return "(sem descrição)";
  if (/^movimento local$/i.test(t)) return "Movimento Local (código de migração, sem descrição do que ocorreu)";
  return t;
};

function blocoGrau(rotulo, p, maxMov) {
  if (!temConteudo(p)) return "";
  const l = [`## ${rotulo}`];
  const campo = (nome, v) => v && l.push(`- ${nome}: ${v}`);
  campo("Órgão julgador", p.orgaoJulgador?.dsOrgaoJulgador);
  campo("Classe", p.classe?.dsClasse);
  campo("Competência", p.competencia?.dsCompetencia);
  const aut = instante(p.dtAutuacao);
  campo("Autuado em", aut != null && dataBr(aut));
  const flags = [
    ["baixado/arquivado", SN(p.flBaixado)],
    ["justiça gratuita", SN(p.flJusticaGratuita)],
    ["liminar", SN(p.flLiminar)],
    ["Juízo 100% Digital", SN(p.flJuizoDigital)],
    ["segredo de justiça", SN(p.flSegredoJustica)],
  ].filter(([, v]) => v);
  if (flags.length) l.push(`- Indicadores do cadastro: ${flags.map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
  const todos = Array.isArray(p.movimentos) ? p.movimentos : [];
  const comData = todos.map((m) => ({ m, t: instante(m?.dtMovimento) })).filter((x) => x.t != null).sort((a, b) => b.t - a.t);
  const semData = todos.length - comData.length;
  if (!todos.length) {
    l.push("- Movimentos: a API não trouxe movimentos (isso não prova que o processo está parado).");
    return l.join("\n");
  }
  const locais = todos.filter(ehLocal).length;
  const obs = [locais && `${locais} só como "Movimento Local", sem descrição`, semData && `${semData} sem data legível, fora da lista`].filter(Boolean);
  l.push(`- Movimentos: ${todos.length} no total${obs.length ? ` (${obs.join("; ")})` : ""}; os ${Math.min(maxMov, comData.length)} mais recentes:`);
  for (const { m, t } of comData.slice(0, maxMov)) l.push(`  - ${dataBr(t)} · ${descricao(m)}`);
  return l.join("\n");
}

export function formatProcesso(res, nr, maxMov = 15) {
  const mascara = cnjMascara(nr) || nr;
  if (res.vazio)
    return (
      `**Processo ${mascara}:** a API de processos do TJRO não retornou dados. Pelo próprio tribunal, isso acontece ` +
      "com número incorreto OU processo em segredo de justiça — não prova que o processo não existe. Confira o número; " +
      "se estiver certo, o caminho é o PJe."
    );
  const d = res.dados;
  const partes = [`**Processo ${mascara}** — API pública de processos do TJRO`];
  if (res.doCache)
    partes.push(
      `_(Do cache local: consultado em ${new Date(res.doCache).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho" })}; vale por 1 hora.)_`
    );
  const pg = blocoGrau("1º grau", d.processoPg, maxMov);
  const sg = blocoGrau("2º grau", d.processoSg, maxMov);
  partes.push(pg || "## 1º grau\n- Sem dados de 1º grau nesta API.", sg || "## 2º grau\n- Sem dados de 2º grau nesta API.");
  partes.push(
    "_Só metadado do cadastro: sem partes, advogados, peças nem teor de decisão (o teor está no PJe). " +
      "NUNCA use estas datas para contar prazo: prazo sai da publicação no DJEN. Movimento sem descrição não diz o que " +
      "aconteceu; \"sem movimento novo\" aqui não prova que o processo parou._"
  );
  return partes.join("\n\n");
}
