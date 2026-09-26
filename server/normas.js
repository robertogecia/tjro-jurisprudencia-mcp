// Atos normativos do TJRO (atos.tjro.jus.br): resoluções, provimentos da CGJ,
// instruções, atos da Presidência, Regimento Interno, leis estaduais que o
// tribunal cataloga. Sondado em 26/09/2026: aplicação Laravel, sem API JSON;
// a pesquisa é um GET na raiz com TODOS os campos do formulário presentes
// (numero, ano, argumento, origem, situacao, tema — vazios quando não usados;
// sem eles o portal devolve lista vazia), 10 resultados por página (`page=N`);
// `argumento` busca no texto integral, não só na ementa. A página `detalhar/ID`
// traz identificação, temas, ementa, SITUAÇÃO (Vigente/Alterado/Revogado…),
// origem, publicação, "Alteração" (quem alterou ou revogou, com link), a
// "Legislação Correlata" e o texto COMPILADO. Alguns atos antigos só têm PDF.
// Endereço separado do JURIS; responde normalmente à identificação desta
// extensão (medido com o mesmo User-Agent). Divide a cota de ritmo do JURIS.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import he from "he";
import { HEADERS, reservarRequisicao, dirCache, dirRecibos } from "./lib.js";

export const ATOS_BASE = "https://atos.tjro.jus.br";
const TIMEOUT_MS = 30000;
export const CACHE_LISTA_MS = 60 * 60 * 1000; // 1 h
export const CACHE_NORMA_MS = 24 * 60 * 60 * 1000; // 24 h: norma muda por outra norma, raro
export const NORMAS_POR_PAGINA = 10; // fixo no portal
export const NORMA_TEXTO_MAX = 12000;

// Erro desta ferramenta: o texto já é a mensagem final ao usuário.
export class ErroNorma extends Error {}

// Códigos do formulário do portal (26/09/2026).
export const TIPOS_ATO = {
  "Assento Regimental": 1, Ato: 2, "Ato Conjunto": 3, "Diretrizes Gerais Extrajudiciais": 25,
  "Diretrizes Gerais Judiciais": 24, Edital: 5, Enunciado: 29, "Instrução": 7, "Instrução Conjunta": 8,
  Lei: 9, "Lei Complementar": 22, "Nota Técnica": 11, "Ordem de Serviço": 12, "Orientação": 26,
  Portaria: 13, "Portaria Conjunta": 14, "Portarias CGJ": 28, Provimento: 16, "Provimento Conjunto": 17,
  "Recomendação": 18, "Regimento Interno": 19, "Resolução": 21,
};
export const SITUACOES_ATO = {
  Vigente: 4, Alterado: 3, "Revogado parcialmente": 8, Suspenso: 6, Exaurido: 9, "Sem efeito": 7, Revogado: 5,
};
// Ordem de preferência: o que ainda produz efeito vem antes.
const RANK_SITUACAO = { Vigente: 0, Alterado: 1, "Revogado parcialmente": 2, Suspenso: 3, Exaurido: 4, "Sem efeito": 5, Revogado: 6 };
export const ORIGENS_ATO = {
  "Presidência": 1, "Secretaria Judiciária do 2º Grau": 2, "Secretaria Geral/Emeron": 3,
  "Secretaria da Corregedoria Geral da Justiça": 4, "Secretaria Administrativa": 5, "Secretaria de Orçamento e Finanças": 6,
  "Secretaria de Gestão de Pessoas": 7, "Secretaria de Tecnologia da Informação e Comunicação": 8,
  "Escola da Magistratura do Estado de Rondônia": 9, "Corregedoria Geral da Justiça": 10, "Juiz Secretário Geral": 11,
  "Auditoria Interna": 12, "Coordenadoria de Comunicação Institucional": 13, "Gabinete de Governança": 14,
  "Gabinete de Segurança Institucional": 15, "Secretaria Judiciária do 1º Grau": 16,
  "Grupo de Monitoramento e Fiscalização do Sistema Carcerário e de Medidas Socioeducativas": 17,
  "Assessoria Técnica para os Órgãos Colegiados Administrativos/Astec": 18, "Governo do Estado de Rondônia": 20,
  "Presidência e Corregedoria": 22, "Adesão do Poder Judiciário do Estado de Rondônia ao Juízo 100% digital": 23,
  "TJRO e MPRO": 24, "Comitê Gestor do Processo Judicial Eletrônico - PJe": 25, "Presidência do Fojur": 26,
  "Presidência - Corregedoria - Coordenadoria da Infância e Juventude": 27, "TJRO-CGJ": 28,
  "Presidência e Escola da Magistratura": 29, "Presidência e Vice-Presidência": 30,
  "Presidência e Comitê de Governança em Inteligência Artificial": 31, "TJRO e Governo do Estado de Rondônia": 32,
};
export const TEMAS_ATO = {
  "Acessibilidade, Diversidade, Inclusão e Sustentabilidade": 1, "Acesso à Justiça e Cidadania": 2, "Justiça 4.0": 3,
  "Concurso, Promoção e Disciplina": 4, "Controle Administrativo e Financeiro": 5, "Direitos e Deveres dos Magistrados": 6,
  "Direitos Servidores - Auxílios, Gratificação e outros": 7, "Execução Penal e Sistema Carcerário": 8,
  "Funcionamento do TJRO": 9, "Funcionamento dos Órgãos Judiciais": 10, "Gestão Administrativa": 11,
  "Gestão da Informação e de Demandas Judiciais": 12, "Gestão de Pessoas": 13, "Gestão Documental": 14,
  "Gestão e Organização Judiciária": 15, "Gestão Estratégica": 16, "Assédio Moral, Sexual e à Discriminação": 17,
  "Infância/Juventude": 18, "Nepotismo/ Cargos e Funções": 19, "Normas de Auditoria": 20, "Precatórios": 21,
  "Priorização do Primeiro Grau": 22, "Responsabilidade Social": 23, "Segurança do Judiciário": 24,
  "Tecnologia da Informação e Comunicação - STIC": 25, "Subsídio de magistrados (as)": 26, "Transparência": 27,
  "Astec - Comissões, Comitês, Núcleos - órgãos colegiados": 28, "Diretrizes Gerais Judiciais": 29,
  "Calendário de feriados e pontos facultativos": 30, "Extrajudicial - Corregedoria": 31,
  "Peritos, Auxiliares da Justiça, CPCAJ, edital, leiloeiro, corretores": 32, "Designação de juízes (as)": 33,
  "Escola da Magistratura - Emeron": 34, "Estrutura Organizacional": 35, "Prazo": 381, "Defensoria Pública": 382,
  "Sistema AtermaJus": 383, "Transformação Digital": 384, "Boas práticas": 385, "Eficiência gerencial dos gabinetes": 386,
  "Sistema Nacional de Gestão de Bens (SNGB)": 387, "Inteligência Artificial": 388, "Comissão e Grupo de Trabalho": 389,
};

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Resolve um nome digitado (com ou sem acento, inteiro ou parte) para o código
// do formulário. Devolve { codigo, rotulo } ou lança ErroNorma listando as opções.
export function resolverOpcao(tabela, valor, campo) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  const v = norm(valor);
  const entradas = Object.entries(tabela);
  const exata = entradas.find(([k]) => norm(k) === v);
  if (exata) return { codigo: exata[1], rotulo: exata[0] };
  const parciais = entradas.filter(([k]) => norm(k).includes(v));
  if (parciais.length === 1) return { codigo: parciais[0][1], rotulo: parciais[0][0] };
  // Várias casam: fica com a única cujo nome COMEÇA pelo que foi digitado
  // ("governo do estado" → "Governo do Estado de Rondônia", não "TJRO e Governo…").
  const prefixo = parciais.filter(([k]) => norm(k).startsWith(v));
  if (prefixo.length === 1) return { codigo: prefixo[0][1], rotulo: prefixo[0][0] };
  const lista = (parciais.length ? parciais : entradas).map(([k]) => `"${k}"`).join(", ");
  throw new ErroNorma(
    parciais.length
      ? `${campo}="${valor}" é ambíguo no portal de atos do TJRO. Opções que casam: ${lista}.`
      : `${campo}="${valor}" não existe no portal de atos do TJRO. Opções: ${lista}.`
  );
}

// Monta a URL da pesquisa. Todos os campos vão sempre, mesmo vazios (medido:
// sem eles o portal devolve lista vazia).
export function buildNormasUrl(o = {}) {
  const p = new URLSearchParams();
  p.set("numero", o.numero ? String(o.numero).trim() : "");
  p.set("ano", o.ano ? String(o.ano).trim() : "");
  p.set("argumento", o.argumento ? String(o.argumento).trim() : "");
  p.set("origem", o.origem ? String(o.origem) : "");
  p.set("situacao", o.situacao ? String(o.situacao) : "");
  p.set("tema", o.tema ? String(o.tema) : "");
  for (const t of o.tipos || []) p.append("tipoAto[]", String(t));
  if (o.pagina && o.pagina > 1) p.set("page", String(o.pagina));
  return `${ATOS_BASE}/?${p.toString()}`;
}

// ------------------------------------------------------------------- parsers -
const semTags = (h) =>
  he
    .decode(
      String(h || "")
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h\d|\/dt|\/dd|hr)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
    .replace(/ /g, " ");
const linhas = (h) =>
  semTags(h)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
const textoPlano = (h) => linhas(h).join(" ").replace(/\s+/g, " ").trim();

export function parseListaNormas(html) {
  const s = String(html || "");
  const itens = [];
  const corpo = (s.match(/<tbody>([\s\S]*?)<\/tbody>/i) || [])[1] || "";
  for (const tr of corpo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cel = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => textoPlano(m[1]));
    if (cel.length < 6) continue;
    const id = (tr[1].match(/detalhar\/(\d+)/) || [])[1] || null;
    itens.push({ id, tipo: cel[0], numero: cel[1], data: cel[2], origem: cel[3], situacao: cel[4], ementa: cel[5] });
  }
  const m = s.match(/Mostrando\s*(?:<[^>]+>\s*)*(\d+)\s*(?:<[^>]+>\s*)*at[ée]\s*(?:<[^>]+>\s*)*(\d+)\s*(?:<[^>]+>\s*)*de\s*(?:<[^>]+>\s*)*(\d+)\s*(?:<[^>]+>\s*)*resultados/i);
  const total = m ? Number(m[3]) : itens.length;
  const paginas = Math.max(1, Math.ceil(total / NORMAS_POR_PAGINA));
  return { itens, total, paginas };
}

const RE_ID_DETALHE = /detalhar\/(\d+)/;
const anosDe = (h) => {
  const out = [];
  for (const a of String(h || "").matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const texto = textoPlano(a[2]);
    if (!texto) continue;
    const href = he.decode(a[1]);
    out.push({ texto, href, id: (href.match(RE_ID_DETALHE) || [])[1] || null });
  }
  return out;
};

export function parseNormaDetalhe(html) {
  const s = String(html || "");
  const campos = {};
  const partes = s.split(/<div class="col-2 identificacao">/);
  for (const parte of partes.slice(1)) {
    const rotulo = textoPlano(parte.slice(0, parte.indexOf("</div>"))).replace(/:$/, "");
    const i = parte.indexOf('dsc_conteudo">');
    if (i < 0) continue;
    campos[norm(rotulo)] = parte.slice(i + 'dsc_conteudo">'.length);
  }
  const pega = (k) => campos[k] || "";
  const ident = textoPlano(pega("identificacao"));
  const mi = ident.match(/^(.*?)\s+N[ºo°.]*\s*([\w./-]+),?\s*de\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const alteracaoHtml = pega("alteracao");
  const textoHtml = pega("texto");
  const pdfs = {};
  for (const a of textoHtml.matchAll(/href="([^"]*files\/(original|compilado)[^"]*)"/gi)) {
    pdfs[a[2]] = a[1].replace(/^(\.\.\/)+/, `${ATOS_BASE}/`);
  }
  const iHr = textoHtml.search(/<hr\s*\/?>/i);
  const corpoHtml = iHr >= 0 ? textoHtml.slice(iHr) : textoHtml.replace(/<a[^>]*>[\s\S]*?<\/a>/gi, "");
  const corpo = linhas(corpoHtml).filter((l) => !/^Texto (Original|Compilado)$/i.test(l));
  const emRevisao = /fila de revis[ãa]o/i.test(textoHtml);
  const outraJanela = (textoHtml.match(/<a[^>]*href=['"]([^'"]+)['"][^>]*>\s*Clique aqui/i) || [])[1] || null;
  const texto = corpo.filter((l) => !/fila de revis[ãa]o|Clique aqui para visualizar/i.test(l)).join("\n");
  const situacaoStf = textoPlano(pega("situacao stf"));
  return {
    tipo: mi ? mi[1].trim() : ident || null,
    numero: mi ? mi[2] : null,
    data: mi ? mi[3] : null,
    identificacao: ident,
    temas: textoPlano(pega("temas")).split(";").map((t) => t.trim()).filter(Boolean),
    ementa: textoPlano(pega("ementa")),
    situacao: textoPlano(pega("situacao")) || null,
    situacaoStf: situacaoStf && situacaoStf !== "---" ? situacaoStf : null,
    origem: textoPlano(pega("origem")) || null,
    publicacao: (() => { const p = textoPlano(pega("publicacao")); return p && p !== "---" ? p : null; })(),
    alteracao: { texto: linhas(alteracaoHtml).join(" ").trim(), links: anosDe(alteracaoHtml) },
    correlatas: linhas(pega("legislacao correlata")).map((l) => {
      const link = anosDe(pega("legislacao correlata")).find((a) => a.texto === l);
      return { texto: l, href: link ? link.href : null, id: link ? link.id : null };
    }),
    processo: textoPlano(pega("processo")) || null,
    pdfs,
    emRevisao,
    outraJanela,
    texto,
  };
}

// ------------------------------------------------------------------- rede -
const arqLista = (chave) => path.join(dirCache(), `normas-lista-${chave}.json`);
const arqNorma = (id) => path.join(dirCache(), `norma-${id}.json`);
function lerCache(arq, validadeMs, agora = Date.now()) {
  try {
    const c = JSON.parse(fs.readFileSync(arq, "utf8"));
    const idade = agora - c.quando;
    if (!Number.isFinite(idade) || idade < 0 || idade > validadeMs) return null;
    return c;
  } catch {
    return null;
  }
}
function gravarCache(arq, dados, agora = Date.now()) {
  try {
    fs.mkdirSync(dirCache(), { recursive: true });
    fs.writeFileSync(`${arq}.${process.pid}.tmp`, JSON.stringify({ quando: agora, dados }));
    fs.renameSync(`${arq}.${process.pid}.tmp`, arq);
  } catch {
    /* cache é economia, nunca condição */
  }
}

async function baixarAtos(url, fetchImpl = fetch) {
  const reserva = reservarRequisicao(Date.now(), { ignorarBloqueio: true });
  if (reserva.erro) throw new ErroNorma(reserva.erro);
  if (reserva.esperarMs > 0) await new Promise((r) => setTimeout(r, reserva.esperarMs));
  let r;
  try {
    r = await fetchImpl(url, {
      headers: { "User-Agent": HEADERS["User-Agent"], Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError")
      throw new ErroNorma(`O portal de atos normativos do TJRO não respondeu em ${TIMEOUT_MS / 1000} s. Tente de novo em alguns minutos.`);
    throw new ErroNorma(`Falha de conexão com atos.tjro.jus.br (${e?.cause?.code || e?.cause?.message || e?.message || "erro de rede"}). Tente de novo em alguns minutos.`);
  }
  let texto = "";
  try {
    texto = await r.text();
  } catch {
    texto = "";
  }
  // "STIC" sozinho não serve de sinal aqui: o formulário do portal traz o tema
  // "Tecnologia da Informação e Comunicação - STIC" (falso positivo medido em 26/09/2026).
  if (/robotiza|p[aá]gina bloqueada/i.test(texto) || r.status === 403 || r.status === 429)
    throw new ErroNorma(
      `O portal de atos normativos do TJRO recusou a consulta (HTTP ${r.status}). Pesquisa NÃO realizada; abra ${url} no navegador. ` +
        "Isso não significa que a norma não exista."
    );
  if (r.status === 404) return null;
  if (!r.ok) throw new ErroNorma(`O portal de atos normativos do TJRO respondeu com erro (HTTP ${r.status}). Tente mais tarde.`);
  return texto;
}

export async function buscarNormas(o, fetchImpl = fetch) {
  const url = buildNormasUrl(o);
  // Mesma chave que o servidor Python (sha256 da URL): os dois compartilham a pasta de cache.
  const chave = crypto.createHash("sha256").update(url).digest("hex").slice(0, 40);
  const c = lerCache(arqLista(chave), CACHE_LISTA_MS);
  if (c) return { ...c.dados, url, doCache: c.quando };
  const html = await baixarAtos(url, fetchImpl);
  if (html === null) throw new ErroNorma("O portal de atos normativos do TJRO não encontrou a página de pesquisa (HTTP 404).");
  if (!/formPesquisa|<tbody>/i.test(html)) throw new ErroNorma("O portal de atos normativos do TJRO devolveu uma página inesperada (sem o formulário de pesquisa). Pesquisa NÃO realizada.");
  const dados = parseListaNormas(html);
  gravarCache(arqLista(chave), dados);
  return { ...dados, url };
}

// Recibo da norma para o lint da peticao-rg: o que o portal entregou, por id, em
// `~/.tjro-jurisprudencia-recibos/norma-<id>.json` (mesma pasta dos acórdãos).
export function gravarReciboNorma(d, id, pasta = dirRecibos(), agora = new Date()) {
  try {
    if (!d || d.inexistente || !d.texto) return false;
    fs.mkdirSync(pasta, { recursive: true });
    const r = {
      id_norma: String(id), identificacao: d.identificacao, tipo: d.tipo, numero: d.numero, data: d.data,
      situacao: d.situacao, alteracao: d.alteracao?.texto || "", obtido_em: agora.toISOString(), texto: d.texto,
    };
    const tmp = path.join(pasta, `.norma-${id}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(r));
    fs.renameSync(tmp, path.join(pasta, `norma-${id}.json`));
    return true;
  } catch {
    return false; /* recibo é conferência extra, nunca condição */
  }
}

export async function obterNorma(id, fetchImpl = fetch) {
  const n = String(id || "").replace(/\D/g, "");
  if (!n) throw new ErroNorma("Informe o id numérico da norma (o número depois de detalhar/ no link, ou o id da lista de buscar_norma_tjro).");
  const c = lerCache(arqNorma(n), CACHE_NORMA_MS);
  if (c) {
    gravarReciboNorma(c.dados, n);
    return { ...c.dados, id: n, doCache: c.quando };
  }
  const html = await baixarAtos(`${ATOS_BASE}/detalhar/${n}`, fetchImpl);
  if (html === null || !/identificacao/i.test(html)) return { id: n, inexistente: true };
  const dados = parseNormaDetalhe(html);
  if (!dados.identificacao) return { id: n, inexistente: true };
  gravarCache(arqNorma(n), dados);
  gravarReciboNorma(dados, n);
  return { ...dados, id: n };
}

// ------------------------------------------------------------- formatters -
const rotuloNorma = (tipo, numero, data) => {
  const ano = (String(data || "").match(/(\d{4})$/) || [])[1];
  return `${tipo || "Ato"} n. ${numero || "?"}${ano ? "/" + ano : ""}`;
};
const marcaSituacao = (s) => (s === "Vigente" ? "Vigente" : s ? `**${s}**` : "situação não informada");

export function ordenarVigentesPrimeiro(itens) {
  return itens
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (RANK_SITUACAO[a.it.situacao] ?? 9) - (RANK_SITUACAO[b.it.situacao] ?? 9) || a.i - b.i)
    .map((x) => x.it);
}

export function formatListaNormas(res, filtros, pagina = 1) {
  const { itens, total, paginas, url } = res;
  const desc = filtros.length ? filtros.join("; ") : "sem filtro";
  const linhasOut = [];
  linhasOut.push(`**Atos normativos do TJRO (atos.tjro.jus.br)** — ${desc}`);
  if (!itens.length) {
    linhasOut.push(`Nenhum ato encontrado nesta pesquisa (página ${pagina}).`);
    linhasOut.push(
      "Antes de dizer que não há norma: `argumento` procura no texto integral, então tente a palavra sem hífen/acento, um sinônimo (\"licença especial\" para \"licença-prêmio\"), " +
        "o número e ano sem outros filtros, ou tire o filtro de situação/tema. Zero aqui nunca é \"não existe\"."
    );
    linhasOut.push(`Fonte: ${url}`);
    return linhasOut.join("\n");
  }
  linhasOut.push(`${total} ato(s) no total, página ${pagina} de ${paginas} (${NORMAS_POR_PAGINA} por página). Os VIGENTES aparecem primeiro nesta página; a situação é a do cadastro do portal.`);
  linhasOut.push("");
  const ordenados = ordenarVigentesPrimeiro(itens);
  ordenados.forEach((it, i) => {
    linhasOut.push(
      `${(pagina - 1) * NORMAS_POR_PAGINA + i + 1}. **${rotuloNorma(it.tipo, it.numero, it.data)}** (${it.origem || "origem não informada"}) · ${it.data || "sem data"} · ${marcaSituacao(it.situacao)} · id ${it.id}`
    );
    if (it.ementa) linhasOut.push(`   ${it.ementa}`);
    linhasOut.push(`   ${ATOS_BASE}/detalhar/${it.id}`);
  });
  const naoVigentes = ordenados.filter((it) => it.situacao && it.situacao !== "Vigente").length;
  linhasOut.push("");
  linhasOut.push(
    `Para ler o texto compilado, quem alterou/revogou e a legislação correlata: obter_norma_tjro(id=...).` +
      (naoVigentes ? ` ${naoVigentes} ato(s) desta página não estão "Vigente": antes de citar, abra o detalhe e siga o campo "Alteração" até a norma que vale hoje.` : "") +
      (paginas > pagina ? ` Próxima página: pagina=${pagina + 1}.` : "")
  );
  if (res.doCache) linhasOut.push(`(resultado em cache local desde ${new Date(res.doCache).toLocaleString("pt-BR")}; o portal não foi consultado agora)`);
  linhasOut.push(`Fonte: ${url}`);
  return linhasOut.join("\n");
}

// Recorta o texto compilado no artigo pedido ("4", "4º", "art. 4") até o artigo seguinte.
export function recortarArtigo(texto, artigo) {
  const n = String(artigo || "").replace(/\D/g, "");
  if (!n) return null;
  const ls = String(texto || "").split("\n");
  const inicio = ls.findIndex((l) => new RegExp(`^Art\\.?\\s*${n}\\s*[ºo°.]?(?![\\d.])`, "i").test(l));
  if (inicio < 0) return null;
  let fim = ls.length;
  for (let i = inicio + 1; i < ls.length; i++) {
    const m = ls[i].match(/^Art\.?\s*(\d+)/i);
    if (m && m[1] !== n) {
      fim = i;
      break;
    }
  }
  // Não arrasta o título do capítulo/seção seguinte (linhas só em maiúsculas no fim).
  while (fim - 1 > inicio && /^[A-ZÀ-Ú0-9\s.,ºª§-]+$/.test(ls[fim - 1]) && !/^Art/i.test(ls[fim - 1])) fim--;
  return ls.slice(inicio, fim).join("\n");
}

export function formatNormaDetalhe(d, opcoes = {}) {
  if (d.inexistente) return `Não há ato com id ${d.id} em ${ATOS_BASE}/detalhar/${d.id}. Confira o id na lista de buscar_norma_tjro; isso não diz nada sobre a existência da norma.`;
  const max = Math.max(1000, Number(opcoes.maxCaracteres) || NORMA_TEXTO_MAX);
  const inicio = Math.max(0, Number(opcoes.inicio) || 0);
  const out = [];
  out.push(`**${rotuloNorma(d.tipo, d.numero, d.data)}** (${d.origem || "origem não informada"}) · ${d.data || "sem data"} · id ${d.id} · ${ATOS_BASE}/detalhar/${d.id}`);
  out.push(`Situação no portal: ${marcaSituacao(d.situacao)}${d.situacaoStf ? ` · Situação STF: ${d.situacaoStf}` : ""}`);
  if (d.situacao && d.situacao !== "Vigente") {
    out.push(
      d.situacao === "Alterado" || d.situacao === "Revogado parcialmente"
        ? "⚠️ Ato alterado: o texto abaixo é o COMPILADO do portal (as alterações vêm marcadas no próprio texto, ex.: \"(Alterado pela Instrução n. X)\"). Cite o dispositivo com a redação vigente e a norma que a deu."
        : `⚠️ Ato ${d.situacao.toLowerCase()}: não cite como norma em vigor. Veja em "Alteração" qual ato o substituiu e leia esse.`
    );
  }
  if (d.ementa) out.push(`Ementa: ${d.ementa}`);
  if (d.temas.length) out.push(`Temas: ${d.temas.join("; ")}`);
  if (d.publicacao) out.push(`Publicação: ${d.publicacao}`);
  if (d.alteracao?.texto) {
    const ids = d.alteracao.links.filter((l) => l.id).map((l) => `${l.texto} → id ${l.id}`);
    out.push(`Alteração/revogação: ${d.alteracao.texto}${ids.length ? ` [${ids.join("; ")}]` : ""}`);
  }
  if (d.correlatas.length) {
    out.push("Legislação correlata (como o portal cadastra):");
    for (const c of d.correlatas) out.push(`- ${c.texto}${c.id ? ` (id ${c.id} neste portal)` : c.href ? ` — ${c.href}` : ""}`);
  }
  if (d.processo) out.push(`Processo administrativo: ${d.processo}`);
  if (d.pdfs.original || d.pdfs.compilado)
    out.push(`PDF: ${[d.pdfs.original && `original ${d.pdfs.original}`, d.pdfs.compilado && `compilado ${d.pdfs.compilado}`].filter(Boolean).join(" · ")}`);
  if (d.emRevisao) out.push("Aviso do portal: este ato está em fila de revisão de classificação (tema, origem, situação); a situação pode não estar atualizada.");
  out.push("");
  if (!d.texto) {
    out.push(
      `**Texto:** o portal não exibe o texto deste ato em HTML${d.outraJanela ? ` (só o PDF: ${d.outraJanela.startsWith("http") ? d.outraJanela : ATOS_BASE + "/" + d.outraJanela.replace(/^(\.\.\/)+/, "")})` : d.pdfs.original ? ` (só o PDF acima)` : ""}. Abra o PDF para ler; não há texto para citar aqui.`
    );
    if (d.doCache) out.push(`(detalhe em cache local desde ${new Date(d.doCache).toLocaleString("pt-BR")})`);
    return out.join("\n");
  }
  let texto = d.texto;
  let cabecalho = "**Texto compilado (como o portal exibe):**";
  if (opcoes.artigo) {
    const rec = recortarArtigo(d.texto, opcoes.artigo);
    if (rec) {
      texto = rec;
      cabecalho = `**Art. ${String(opcoes.artigo).replace(/\D/g, "")} (texto compilado; o portal repete o artigo quando houve alteração, com a nota "(Alterado pela ...)" na redação nova):**`;
    } else {
      out.push(`Não achei "Art. ${String(opcoes.artigo).replace(/\D/g, "")}" no texto compilado; segue o texto inteiro.`);
    }
  }
  const total = texto.length;
  const fatia = texto.slice(inicio, inicio + max);
  out.push(cabecalho);
  out.push(fatia);
  if (inicio + max < total)
    out.push(`… (texto cortado: ${inicio + max} de ${total} caracteres; continue com inicio=${inicio + max}, ou peça só um artigo com artigo="N")`);
  if (d.doCache) out.push(`(detalhe em cache local desde ${new Date(d.doCache).toLocaleString("pt-BR")}; o portal não foi consultado agora)`);
  return out.join("\n");
}
