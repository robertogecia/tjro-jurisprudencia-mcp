/**
 * Funções puras do servidor MCP TJRO — sem I/O de rede, sem estado.
 * Separadas de index.js para permitir testes automatizados diretos
 * (index.js conecta o transporte MCP no import e não pode ser importado em teste).
 */
import he from "he";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const SITE = "https://juris.tjro.jus.br";
export const API = "https://juris-back.tjro.jus.br";
export const ENDPOINT = `${API}/search/varios_parametros/`;

export const HEADERS = {
  Origin: SITE,
  Referer: SITE + "/",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; MCP-TJRO-Jurisprudencia/1.1)",
};

export const TIPOS_VALIDOS = [
  "ACÓRDÃO",
  "EMENTA",
  "DECISÃO",
  "DECISÃO DA PRESIDÊNCIA",
  "SENTENÇA",
  "VOTO",
  "RELATÓRIO",
];

export const HIGHLIGHT = {
  type: "plain",
  number_of_fragments: 1,
  fragment_size: 3000,
  require_field_match: "true",
  pre_tags: ["«"],
  post_tags: ["»"],
  fields: [{ ds_modelo_documento: { number_of_fragments: 1 } }],
};

export const ORDENACOES = {
  relevantes: [{ _score: "desc" }, { dtjulgamento: "desc" }],
  recentes: [{ dtjulgamento: "desc" }, { _score: "desc" }],
  antigos: [{ dtjulgamento: "asc" }, { _score: "desc" }],
};

// O Elasticsearch do portal não pagina além dos 10.000 primeiros resultados.
export const JANELA_MAXIMA = 10000;

// Orçamento máximo de caracteres da resposta do inteiro teor (evita afogar o contexto).
export const ORCAMENTO_INTEIRO = 50000;

const LUCENE = /([+\-=&|><!(){}\[\]^"~*?:\\/])/g;

// ---------------------------------------------------------------- helpers ---
// Escapa os operadores do Elasticsearch, MAS preserva o curinga no FIM de uma
// palavra: `consign*` acha consignado/consignação/consignatário numa só busca —
// mais alcance com menos requisições, que é o que interessa aqui. O curinga
// INICIAL (`*signado`) continua escapado de propósito: força varredura do índice
// inteiro, é lento no servidor do tribunal e é vetor clássico de sobrecarga.
export const escapeLucene = (t) => {
  if (!t || !t.trim()) return "";
  return t.replace(LUCENE, "\\$1").replace(/([\p{L}\p{N}])\\\*(?=\s|$)/gu, "$1*");
};

// ------------------------------------------------------ grupos de sinônimos ---
// A busca do portal casa PALAVRAS, e julgados do mesmo assunto usam vocabulários
// diferentes ("negativação", "inscrição indevida", "cadastro de inadimplentes").
// Teste real de 10/09/2026: `"dano moral" AND negativação` = 36.922 documentos;
// com o grupo `(negativação OR "inscrição indevida" OR "cadastro de inadimplentes")`
// = 50.792, +37% numa requisição só. O backend aceita parênteses e frases, mas a
// consulta livre escapa os dois (proteção contra sintaxe malformada), então o
// agrupamento é montado AQUI, termo a termo, nunca a partir de sintaxe crua:
// cada termo é escapado, expressão com espaço vira frase entre aspas, e os
// grupos são sempre parentizados — o query_string do Lucene NÃO respeita
// precedência entre AND e OR (documentação da Elastic), então sem parênteses
// explícitos a consulta sairia com outro sentido.
export const GRUPOS_MAX = 6;
export const TERMOS_POR_GRUPO_MAX = 12;
export const TERMO_MAX_CHARS = 80;
const RESERVADAS = /^(AND|OR|NOT)$/;

export const termoParaQuery = (bruto) => {
  const t = String(bruto ?? "").replace(/\s+/g, " ").trim().slice(0, TERMO_MAX_CHARS).trim();
  if (!t) return "";
  // Frase: o Lucene não expande curinga dentro de aspas, então tudo é literal,
  // inclusive o "*" (escapado junto com o resto).
  if (/\s/.test(t)) return `"${t.replace(LUCENE, "\\$1")}"`;
  // Palavra reservada isolada viraria operador e quebraria a consulta.
  if (RESERVADAS.test(t)) return `"${t}"`;
  // Palavra única: mesmo escape da consulta livre — curinga FINAL preservado
  // ("consign*"), curinga inicial escapado (varredura do índice inteiro).
  return escapeLucene(t);
};

export function montarGrupos(grupos) {
  if (!Array.isArray(grupos)) return "";
  const partes = [];
  for (const g of grupos.slice(0, GRUPOS_MAX)) {
    const termos = (Array.isArray(g) ? g : [g]).slice(0, TERMOS_POR_GRUPO_MAX).map(termoParaQuery).filter(Boolean);
    const unicos = [...new Set(termos)];
    if (unicos.length) partes.push(`(${unicos.join(" OR ")})`);
  }
  return partes.join(" AND ");
}

export const cnj = (nr) => {
  const d = String(nr || "").replace(/\D/g, "");
  return d.length === 20
    ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`
    : String(nr || "");
};

export const limpar = (texto, limite = 800) => {
  if (!texto) return "";
  let t = String(texto).replace(/data:image\/[^)"'\s]+/g, ""); // remove imagens base64
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<[^>]+>/g, " "); // remove tags
  t = he.decode(t); // decodifica entidades (&Ccedil; etc.)
  t = t.replace(/\s+/g, " ").trim();
  if (limite && t.length > limite) t = t.slice(0, limite).replace(/\s+\S*$/, "") + "…";
  return t;
};

// Chaves nulas ficam FORA da URL: o portal redireciona para a home se receber o
// texto literal "None"/"null". %20 (e não "+") para espaço, imune a mudança de
// parser no frontend.
export const link = (s) => {
  const params = {
    id: s.id_processo_documento,
    sistema_origem: s.sistema_origem,
    tipo: s.tipo,
    id_documento_principal: s.id_documento_principal,
  };
  const qs = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${SITE}/jurisprudencia/?${qs}`;
};

export const relator = (s) =>
  s.nome_relator_acordao || s.nome_relator_processo || s.ds_nome || "—";
export const orgao = (s) => s.ds_orgao_julgador_colegiado || s.ds_orgao_julgador || "—";

export const dataBr = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

// Citação pronta para colar em peça, no padrão forense. Segmentos sem dado são omitidos.
// `orgaoDoFecho`: câmara que o próprio acórdão declara, quando diverge do índice.
// A Citação vai para a peça, e a câmara errada do cadastro ("3ª Câmara Cível" no
// lugar da 1ª) já chegou a uma peça protocolada (14/09/2026).
export const citacao = (s, orgaoDoFecho = null) => {
  const partes = [`TJ-RO - ${s.ds_classe_judicial || s.tipo || "Julgado"}: ${cnj(s.nr_processo || "")}`];
  const rel = relator(s);
  if (rel !== "—") partes.push(`Relator: ${rel}`);
  const dj = s.dtjulgamento_str || dataBr(s.dtjulgamento);
  if (dj) partes.push(`Data de Julgamento: ${dj}`);
  const org = orgaoDoFecho || orgao(s);
  if (org !== "—") partes.push(org);
  const dp = dataBr(s.dtpublicacao);
  if (dp) partes.push(`Data de Publicação: ${dp}`);
  return `(${partes.join(", ")})`;
};

export const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Id único da decisão no portal. O NÚMERO do processo não identifica um julgado:
// sob o mesmo número convivem o acórdão original, os embargos, os segundos
// embargos e, em julgamento por maioria, às vezes o voto vencido como documento
// próprio. Erro real (04/09/2026): peça citou o conteúdo de um acórdão com o
// relator de OUTRO, ambos sob o mesmo número.
export const idDocumento = (s) => String(s.id_processo_documento ?? "").trim();

// Resultado(s) declarados num texto de julgado. Só a cauda, onde fica o
// dispositivo — o corpo cita outros julgados com resultados que não são o dele.
// Um documento que declara os dois lados de um par (ex.: "recurso do autor
// provido, do réu desprovido") é ambíguo para aquele par e não gera aviso.
// CONHECIDO × NÃO CONHECIDO fica FORA dos pares comparados: "não conheço do
// agravo retido; dou provimento à apelação" fala de objetos diferentes, e
// compará-lo com um voto que só trata da apelação daria aviso falso (red team
// 04/09/2026, achado 3). O rótulo continua sendo extraído, só não é confrontado.
export const OPOSTOS = [
  ["PROVIDO", "DESPROVIDO"],
  ["ACOLHIDO", "REJEITADO"],
];
export const resultadoDe = (texto) => {
  const t = fold(texto).toUpperCase();
  const cauda = t.length > 2500 ? t.slice(-2500) : t;
  const r = new Set();
  // Cada lado é testado de forma INDEPENDENTE (não é if/else): texto que
  // menciona os dois — ementa que registra o voto vencido ("vencido o relator,
  // que negava provimento"), "recurso do autor provido e do réu desprovido",
  // histórico da decisão de origem — fica AMBÍGUO e não gera aviso (red team
  // 04/09/2026, achados 1 e 2). Só a negação colada ("NÃO PROVIDO", "NÃO
  // CONHECIDO") é excluída do lado positivo, por lookbehind.
  if (/\bNAO (SE )?CONHEC/.test(cauda)) r.add("NÃO CONHECIDO");
  if (/(?<!NAO )(?<!NAO SE )\bCONHEC/.test(cauda)) r.add("CONHECIDO");
  if (/\b(DESPROVI|IMPROVI|NAO PROVI|NEG\w*(-SE| SE)? PROVIMENTO|PROVIMENTO NEGADO)/.test(cauda)) r.add("DESPROVIDO");
  if (/(?<!NAO )\b(PROVI(DO|DOS|DA|DAS)\b|D(A|AO|AR|OU|ERAM|EU)(-SE| SE)? (PARCIAL )?PROVIMENTO)/.test(cauda)) r.add("PROVIDO");
  if (/\bREJEIT/.test(cauda)) r.add("REJEITADO");
  if (/\bACOLH/.test(cauda)) r.add("ACOLHIDO");
  return r;
};
// Lado de um par declarado por um documento; null se nenhum ou se ambos (ambíguo).
export const ladoDe = (conjunto, [a, b]) =>
  conjunto.has(a) && conjunto.has(b) ? null : conjunto.has(a) ? a : conjunto.has(b) ? b : null;

export const ROTULOS_RESULTADO = { PROVIDO: "provido", DESPROVIDO: "desprovido", ACOLHIDO: "acolhido", REJEITADO: "rejeitado" };

// Resumo 100% OFFLINE (só sobre o texto já trazido pela página, nenhuma requisição
// nova) de quantos JULGAMENTOS declaram cada resultado. Dedup por julgamento — nº do
// processo + data de julgamento — e não por documento: ementa e acórdão do MESMO
// julgado não podem contar em dobro e inflar a amostra. Sem data, cada documento
// conta por si (mesma cautela do red team 04/09/2026, achado 6: nunca presumir
// "mesmo julgamento" por falta de dado). Um julgamento só entra num lado quando
// ladoDe() é inequívoco para ALGUM par de OPOSTOS e nenhum outro par também decide
// (um acórdão que resolve dois recursos diferentes com resultados diferentes não diz
// uma coisa só) — do contrário cai em "sem resultado identificável", nunca é forçado
// para um lado. Índice é indício: isto é amostragem para decidir o que ler, nunca
// posição sobre a tese (recurso provido por outro fundamento também conta como
// provido e nada diz sobre a tese buscada).
export function resumoResultadosPagina(hits) {
  const porJulgamento = new Map();
  hits.forEach((h, i) => {
    const s = h._source || {};
    const proc = String(s.nr_processo || "").replace(/\D/g, "");
    const data = String(s.dtjulgamento || "");
    const chave = proc && data ? `${proc}|${data}` : `#${i}`;
    if (!porJulgamento.has(chave)) porJulgamento.set(chave, new Set());
    const acumulado = porJulgamento.get(chave);
    for (const r of resultadoDe(limpar(s.ds_modelo_documento || "", 0))) acumulado.add(r);
  });
  const contagem = { PROVIDO: 0, DESPROVIDO: 0, ACOLHIDO: 0, REJEITADO: 0 };
  let semResultado = 0;
  for (const conjunto of porJulgamento.values()) {
    const lados = OPOSTOS.map((par) => ladoDe(conjunto, par)).filter(Boolean);
    if (lados.length === 1) contagem[lados[0]] += 1;
    else semResultado += 1; // 0 lados (sem sinal) ou >1 (decide mais de uma coisa): não força
  }
  return { contagem, semResultado, totalJulgamentos: porJulgamento.size };
}

// Índice é indício, texto é prova: o campo "Câmara" do cadastro do TJRO sai
// errado com frequência, e o JusRatio herda o mesmo cadastro. Medição de
// 14/09/2026 sobre 82 acórdãos reais já trazidos por sessões anteriores: dos 24
// processos que o índice põe na "3ª Câmara Cível", 15 foram julgados pela 1ª ou
// pela 2ª. Extração conservadora: só devolve quando o texto é unânime.
const TIPO_CAMARA = { civel: "Cível", criminal: "Criminal", especial: "Especial" };
const ORDINAL = { primeira: "1", segunda: "2", terceira: "3", quarta: "4", quinta: "5" };
const RE_CAMARA = /\b(\d{1,2}\s*[ªa°º]|primeira|segunda|terceira|quarta|quinta)\s*C[âa]mara\s+(C[íi]vel|Criminal|Especial)\b/gi;
const RE_CAMARA_UMA = /\b(\d{1,2}\s*[ªa°º]|primeira|segunda|terceira|quarta|quinta)\s*C[âa]mara\s+(C[íi]vel|Criminal|Especial)\b/i;
const nomeCamara = (m) => `${ORDINAL[fold(m[1])] || m[1].replace(/\D/g, "")}ª Câmara ${TIPO_CAMARA[fold(m[2])] || m[2]}`;
// 1º) O FECHO do acórdão, que é a ata do julgamento: "acordam os Magistrados
// da(o) <órgão> do Tribunal de Justiça...". Fonte mais forte, por isso vem antes
// do cabeçalho. Achado real de 14/09/2026 (sessão "Esther - SERASA - Embargos"):
// no 0803974-52.2025.8.22.0000 (índice "3ª Câmara Cível") a "1ª Câmara Cível" só
// aparece no fecho — o modelo novo de acórdão do PJe (46 das 82 peças medidas)
// não traz câmara nenhuma no cabeçalho. Nas peças medidas, o fecho estava a menos
// de 450 chars do fim; a janela de 2000 afasta o fecho de OUTRO acórdão transcrito
// no relatório. Pega também colegiado sem número ("das Câmaras Criminais
// Reunidas"): numa revisão criminal real (0804804-57.2021.8.22.0000), o relatório
// cita a "1ª Câmara Criminal" do acórdão revisado dentro dos 600 chars, e o
// cabeçalho sozinho mandava citar a câmara errada.
const RE_FECHO = /acordam\s+os\s+(?:Magistrados|Desembargadores)\s+d(?:as|os|a|o)(?:\(o\))?\s+([^,;:.]{3,60}?)[\s,]+do\s+Tribunal\s+de\s+Justi[çc]a/gi;
// 2º) Sem fecho (ementa, decisão, voto, acórdão antigo com o fecho no alto): o
// CABEÇALHO, só os 600 primeiros chars — a fundamentação cita câmaras alheias
// ("como decidiu a 4ª Câmara Cível") e isso apontava a câmara alheia como a do
// julgado (red team 04/09/2026, achados 5 e 7). "\b" após o tipo impede
// "Especializada" ≈ "Especial". Cabeçalho que nomeia colegiado sem número
// (Reunidas, Pleno) não confia na câmara numerada ao lado: é a de origem.
export const extrairOrgaoComOrigem = (texto) => {
  const t = String(texto || "");
  const doFecho = new Map();
  for (const m of t.slice(-2000).matchAll(RE_FECHO)) {
    const bruto = m[1].replace(/\s+/g, " ").trim();
    const num = RE_CAMARA_UMA.exec(bruto);
    const nome = num ? nomeCamara(num) : bruto;
    doFecho.set(fold(nome), nome);
  }
  if (doFecho.size) return doFecho.size === 1 ? { orgao: [...doFecho.values()][0], origem: "fecho" } : null;
  const cab = t.slice(0, 600);
  if (/\b(Reunidas|Pleno)\b/i.test(cab)) return null;
  const achados = new Set([...cab.matchAll(RE_CAMARA)].map(nomeCamara));
  return achados.size === 1 ? { orgao: [...achados][0], origem: "cabeçalho" } : null;
};
export const extrairOrgaoDoTexto = (texto) => extrairOrgaoComOrigem(texto)?.orgao ?? null;
// Órgão do texto × do índice. Câmara numerada compara exato; colegiado sem número
// tolera variação de nome ("Tribunal Pleno" ⊂ "Tribunal Pleno Judiciário").
export const orgaoDiverge = (doTexto, doIndice) => {
  if (!doTexto || !doIndice || doIndice === "—") return false;
  const a = fold(doTexto).replace(/\s+/g, " ").trim();
  const b = fold(doIndice).replace(/\s+/g, " ").trim();
  if (a === b) return false;
  if (!/^\d/.test(a) && !/^\d/.test(b) && (a.includes(b) || b.includes(a))) return false;
  return true;
};
const ROTULOS_APOS_RELATOR =
  /\s+(Revisor|Vogal|Presidente|Processo|Agravante|Agravad[oa]|Apelante|Apelad[oa]|Embargante|Embargad[oa]|Recorrente|Recorrid[oa]|Origem|Data|Relat[oó]rio|Ementa|Assunto|Classe|[ÓO]rg[ãa]o|Sess[ãa]o)\b.*$/i;
export const extrairRelatorDoTexto = (texto) => {
  // Só o cabeçalho: o corpo cita julgados alheios com "Relator:" próprios.
  const cab = String(texto || "").slice(0, 1500);
  // Julgamento por maioria com redator diferente do sorteado: o índice guarda o
  // "relator para o acórdão" — é ele que vale para citação (red team 04/09/2026,
  // achado 4a). Limite conhecido: embargos que reproduzem o cabeçalho do acórdão
  // embargado ANTES do próprio ainda podem devolver o relator do embargado.
  const paraAcordao = /(?:Relator|Redator)(?:a)?\s+(?:para|p\/|p\.)\s*o?\s*ac[óo]rd[ãa]o\s*:\s*([^\n;:]{3,90})/i.exec(cab);
  const m = paraAcordao || /Relator(?:a)?(?:\s*\(a\))?\s*:\s*([^\n;:]{3,90})/i.exec(cab);
  if (!m) return null;
  const nome = m[1].replace(ROTULOS_APOS_RELATOR, "").trim().split(/\s+/).slice(0, 6).join(" ");
  return nome.length >= 3 ? nome : null;
};
const TITULOS = new Set([
  "desembargador", "desembargadora", "juiz", "juiza", "convocado", "convocada",
  "ministro", "ministra", "relator", "relatora", "substituto", "substituta",
]);
const sobrenomes = (nome) => fold(nome).split(/[^a-z]+/).filter((w) => w.length >= 4 && !TITULOS.has(w));
export const relatorDiverge = (doTexto, doIndice) => {
  if (!doTexto || !doIndice || doIndice === "—") return false;
  const a = sobrenomes(doTexto);
  const b = new Set(sobrenomes(doIndice));
  return a.length > 0 && b.size > 0 && !a.some((w) => b.has(w));
};

// Agrega correções "você quis dizer" de TODOS os tokens da consulta. A API devolve
// uma entrada por token e por variante com/sem acento (mesmo offset); usa-se a
// variante que bate com o texto digitado e descartam-se "correções" que só diferem
// por acento do próprio token.
export const sugestoes = (data, consulta) => {
  const entradas = (data.suggest || {}).sugestoes || [];
  const grupos = new Map();
  for (const e of entradas) {
    const off = e.offset ?? 0;
    if (!grupos.has(off)) grupos.set(off, []);
    grupos.get(off).push(e);
  }
  const out = [];
  for (const off of [...grupos.keys()].sort((a, b) => a - b)) {
    const grupo = grupos.get(off);
    const e0 =
      grupo.find((e) => consulta.slice(off, off + (e.length ?? 0)) === e.text) || grupo[0];
    const token = e0.text || "";
    for (const e of grupo) {
      const opcao = (e.options || []).find((o) => fold(o.text) !== fold(token));
      if (opcao) {
        out.push(`**${opcao.text}** (para "${token}")`);
        break;
      }
    }
  }
  return out.slice(0, 3);
};

export const normTipos = (arr, padrao) => {
  const t = (arr || padrao)
    .map((x) => String(x).toUpperCase())
    .filter((x) => TIPOS_VALIDOS.includes(x));
  return t.length ? t : padrao;
};

// ----------------------------------------------------------- request bodies -
export function buildBuscaBody(o) {
  // Escapar ANTES de aspear: na ordem inversa as aspas da frase exata viram
  // \" literais e a API trata os termos como busca solta (OR).
  const c = String(o.consulta ?? "").trim();
  const q = o.termoExato && c ? `"${escapeLucene(c)}"` : escapeLucene(c);
  // Consulta livre e grupos se somam por AND; a livre vai parentizada para não
  // ser reinterpretada pela falta de precedência do query_string.
  const g = montarGrupos(o.grupos);
  const query = g ? (q ? `(${q}) AND ${g}` : g) : q;
  // A API espera "tipo" como string ("A,B" p/ OR); array JSON zera os resultados,
  // mesmo com 1 único elemento.
  const fields = { query, tipo: o.tipo.join(",") };
  if (o.grau === 1 || o.grau === 2) fields.grau_jurisdicao = String(o.grau);
  // O índice grava classes em CAIXA ALTA e o filtro .raw é sensível a caixa.
  if (o.classe) fields["ds_classe_judicial.raw"] = o.classe.toUpperCase();
  if (o.orgaoColegiado) fields["ds_orgao_julgador_colegiado.raw"] = o.orgaoColegiado;
  // Filtro SERVER-SIDE confirmado por investigação real em 09/09/2026 (4
  // requisições ao portal, espaçadas ≥30s): "dano moral"/ACÓRDÃO sem filtro deu
  // total=203480; com este campo = "Alexandre Miguel" deu total=7202 e os 3
  // hits da amostra vieram todos daquele relator — mudança coerente, não
  // ignorada nem zerada. Só ESTA hipótese foi testada: metade do orçamento de
  // 4 requisições foi gasta descobrindo que tipo=EMENTA não carrega
  // nome_relator_acordao/processo (vêm vazios, mesmo em ementas de 2017) — só
  // ACÓRDÃO carrega —, então "nome_relator_acordao" sem .raw e
  // "nome_relator_processo.raw" ficaram sem testar. NÃO uppercase aqui — ao
  // contrário de ds_classe_judicial (sempre CAIXA ALTA no índice), o relator
  // testado saiu em Title Case (outro relator da MESMA amostra estava em CAIXA
  // ALTA) — forçar maiúscula quebraria exatamente o caso que funcionou. Grafia
  // e acentuação exigidas são as do índice; ver aviso de zero-resultado.
  if (o.relator) fields["nome_relator_acordao.raw"] = o.relator;
  // Assunto CNJ (Tabela Processual Unificada): filtro SERVER-SIDE confirmado em
  // 10/09/2026 — com "Inclusão Indevida em Cadastro de Inadimplentes", todos os
  // resultados vieram desse assunto. Mas é RUIDOSO por construção (Manual das
  // TPU do CNJ): lançado pelo advogado na distribuição, vários por processo,
  // recurso herda o do principal — 7 dos 20 primeiros eram casos de energia
  // elétrica. Grafia exata, sem forçar caixa. Só serve somado a texto.
  if (o.assunto) fields["ds_assunto_trf.raw"] = o.assunto;
  if (o.nrProcesso) fields.nr_processo = String(o.nrProcesso).replace(/\D/g, "");
  if (o.dataInicio) fields.dtjulgamento_inicio = o.dataInicio;
  if (o.dataFim) fields.dtjulgamento_fim = o.dataFim;
  return {
    from: (o.pagina - 1) * o.porPagina,
    size: o.porPagina,
    fields,
    sort: ORDENACOES[o.ordenacao] || ORDENACOES.relevantes,
    token: "",
    highlight: HIGHLIGHT,
  };
}

export function buildInteiroBody(nrProcesso, tipo) {
  return {
    from: 0,
    size: 50,
    fields: { query: "", nr_processo: String(nrProcesso).replace(/\D/g, ""), tipo: tipo.join(",") },
    sort: [{ dtjulgamento: "desc" }],
    token: "",
  };
}

export const msgErro = (e) =>
  e.name === "TimeoutError"
    ? "tempo esgotado após 45s — o portal JURIS pode estar lento; tente novamente"
    : e.cause?.code ?? e.cause?.message ?? e.message;

// Interpreta uma resposta 200 OK que não é JSON. O portal tem um WAF que devolve
// uma página HTML "Página Bloqueada" em vez de erro HTTP quando suspeita de
// automação — merece mensagem própria, não um erro cru de JSON.parse.
// Desafio de navegador (F5 BIG-IP / TSPD): a página bloqueada traz o carregador
// `/TSPD/` e `loaderConfig`. Aqui isso NÃO é problema de ritmo — esperar não
// resolve, e subir a escada do disjuntor só pune o usuário por algo que ele não
// causou. Relato de 21/09/2026 (defensor público em Sergipe): 2 buscas no dia,
// bloqueio já na 1ª, navegador abrindo o portal normalmente no mesmo IP. Nesta
// máquina, no mesmo dia, o cliente da extensão passava e só o `curl` era barrado
// — ou seja, o que o filtro recusa varia por cliente e por rede, e a ferramenta
// não tem como saber qual é o caso: diz o que observou e para por aí.
export const ehDesafioNavegador = (texto) => /\/TSPD\/|loaderConfig/i.test(texto || "");

export function diagnosticarRespostaNaoJson(contentType, texto) {
  if (ehDesafioNavegador(texto)) {
    return (
      "O portal do TJRO respondeu com uma verificação de navegador (desafio JavaScript do " +
      "filtro de segurança), em vez dos dados. Isso NÃO é excesso de consultas: esperar não " +
      "resolve, e a extensão não executa esse desafio nem contorna a proteção do tribunal. " +
      "Enquanto isso, o portal continua funcionando no navegador (juris.tjro.jus.br). Para acesso pela " +
      "extensão, o caminho é pedir liberação ao tribunal: suporte@tjro.jus.br, assunto " +
      '"Acesso Bloqueado", citando o endpoint juris-back.tjro.jus.br/search/varios_parametros/.'
    );
  }
  if (/robotiza|p[aá]gina bloqueada|\bstic\b/i.test(texto || "")) {
    return (
      'O portal do TJRO bloqueou esta consulta por suspeita de automação ("robotização"). ' +
      "Costuma ser temporário (ex.: muitas buscas em pouco tempo) — aguarde alguns minutos " +
      'antes de tentar de novo. Se persistir, abra um chamado em suporte@tjro.jus.br com ' +
      'assunto "Acesso Bloqueado".'
    );
  }
  return (
    `O portal respondeu algo inesperado (não é JSON; content-type="${contentType}"). ` +
    "Pode ser instabilidade temporária do TJRO — tente novamente em alguns minutos."
  );
}

// --------------------------------------------------------------------------- //
// Disjuntor + limite preventivo — evita repetir o padrão que já causou um
// bloqueio por robotização (observado 15/07/2026: rajada de requisições
// automatizadas escalou de bloqueio por User-Agent para bloqueio por
// IP/comportamento). Não sabemos o limiar exato do WAF do TJRO — em vez de
// descobrir na marra (mais uma rajada automatizada contra o servidor deles),
// o disjuntor DETECTA o bloqueio quando ocorre e recua sozinho, com backoff
// crescente; o limite preventivo mantém o ritmo abaixo do que causou o
// bloqueio de hoje mesmo se nada disparar. Números são estimativas
// conservadoras, não medição precisa — ajustar se a experiência mostrar que
// folgam ou apertam demais.
// --------------------------------------------------------------------------- //
const JANELA_MAX_REQS = 10; // sempre no máx. 10 requisições por janela
// Escada de larguras da janela preventiva — mesmo teto de 10 requisições, mas a
// janela ALARGA a cada bloqueio real detectado (evidência de que o nível atual
// ainda é generoso demais) e RELAXA um degrau após uma sequência longa sem
// incidente (o WAF pode ter sido ajustado, ou o bloqueio anterior foi pontual).
const ESCADA_JANELA_MS = [60_000, 5 * 60_000, 10 * 60_000, 20 * 60_000, 30 * 60_000]; // 1,5,10,20,30min
const SUCESSOS_PARA_RELAXAR = 20; // sucessos seguidos no nível atual antes de afrouxar 1 degrau
const BACKOFF_INICIAL_MS = 10 * 60_000; // 10 min na primeira detecção de bloqueio (disjuntor reativo)
const BACKOFF_MAXIMO_MS = 60 * 60_000; // nunca ultrapassa 1h de recuo automático
// Intervalo mínimo entre requisições: sem isso o teto da janela permite 10
// disparos no MESMO segundo — o padrão "metralhadora" que WAF detecta. Em vez
// de recusar, a chamada espera sua vez (a vaga é reservada na transação, então
// chamadas concorrentes recebem instantes distintos, sem acordar todas juntas).
const ESPACAMENTO_MIN_MS = 7_000; // 23/09/2026: 6 s passou 50x seguidas, 5 s bloqueou; 7 s dá margem
const ESPERA_MAXIMA_MS = 30_000; // acima disso, melhor erro claro que travar a conversa
const TRAVA_TIMEOUT_MS = 2_000;
// PRECISA ser menor que TRAVA_TIMEOUT_MS: senão quem espera desiste ANTES de ganhar o
// direito de limpar uma trava órfã e acaba executando sem exclusão nenhuma (medido:
// 14 vagas concedidas para um teto de 10). 1s ainda é ~14.000x a posse real da seção
// crítica (mediana 0,072ms), então não há risco de roubar a trava de um processo vivo.
const TRAVA_OBSOLETA_MS = 1_000;

// O estado do ritmo vive em ARQUIVO, não em memória: o Claude Desktop e cada
// sessão do Claude Code sobem seu PRÓPRIO processo deste servidor (foram
// observados 4 simultâneos). Com estado em memória, cada processo contaria até
// 10 sozinho — 4 processos = 40 req/min contra o portal, cada um "achando" que
// estava educado. Com arquivo + trava, todos dividem o mesmo orçamento e, se um
// leva bloqueio, TODOS recuam (é o mesmo IP; não faz sentido só um recuar).
// Limite conhecido: coordena processos da mesma MÁQUINA. Duas máquinas no mesmo
// escritório saem pelo mesmo IP público e não há como coordenar sem servidor.
let arquivoEstadoDisjuntor = path.join(os.homedir(), ".tjro-jurisprudencia-mcp-estado.json");

// Só para uso em testes: redireciona a persistência pra um arquivo temporário,
// pra não gravar por cima do estado real aprendido do usuário.
export function _setArquivoEstadoParaTeste(caminho) {
  arquivoEstadoDisjuntor = caminho;
}

const MAX_INCIDENTES = 20; // histórico curto: serve para diagnosticar padrão, não para auditoria

const ESTADO_PADRAO = {
  versao: 2,
  requisicoes: [], // carimbos epoch(ms) das requisições dentro da janela
  proximoLivreEm: 0, // epoch(ms) da próxima vaga livre (espaçamento)
  bloqueadoAte: 0, // epoch(ms) do fim do cooldown do disjuntor
  indiceJanela: 0, // nível aprendido na ESCADA_JANELA_MS
  sucessos: 0, // sucessos consecutivos no nível atual
  backoffMs: BACKOFF_INICIAL_MS,
  // Diário de bordo: o que estava acontecendo QUANDO cada bloqueio veio. Sem
  // isso a ferramenta reage ao bloqueio mas ninguém aprende com ele — e uma
  // sessão futura acaba diagnosticando errado ("o portal está fora do ar").
  incidentes: [],
  ultimaRequisicaoEm: 0,
  totalRequisicoes: 0,
  ultimoSucessoEm: 0, // epoch(ms) da última consulta que trouxe dados (qualquer sessão)
};

// Pausa síncrona curta (só usada para esperar a trava, na casa dos milissegundos).
const dormirSync = (ms) => {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // ambiente sem SharedArrayBuffer: segue direto, a trava vira best-effort.
  }
};

// Exclusão mútua entre processos via lockfile (open "wx" é atômico e funciona
// em mac/Windows/Linux). Se a trava não puder ser obtida a tempo, executa mesmo
// assim: perder um pouco de precisão no contador é melhor que travar a busca.
function comTrava(fn) {
  const lock = arquivoEstadoDisjuntor + ".lock";
  const limite = Date.now() + TRAVA_TIMEOUT_MS;
  let fd = null;
  for (;;) {
    try {
      fd = fs.openSync(lock, "wx");
      break;
    } catch (e) {
      if (e.code !== "EEXIST" || Date.now() > limite) break;
      try {
        const st = fs.statSync(lock);
        if (Date.now() - st.mtimeMs > TRAVA_OBSOLETA_MS) fs.unlinkSync(lock);
      } catch {
        // trava sumiu no meio do caminho — tenta de novo
      }
      dormirSync(5);
    }
  }
  try {
    return fn();
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
      try {
        fs.unlinkSync(lock);
      } catch {}
    }
  }
}

// Margem de "futuro legítimo": uma vaga reservada pode estar até ESPERA_MAXIMA à
// frente, mais um espaçamento. Carimbo além disso só pode vir de relógio adiantado
// (NTP/fuso). Errar essa margem para MENOS devolveria vaga legítima e aumentaria o
// tráfego — por isso ela domina os dois casos por construção.
const MARGEM_FUTURO_MS = ESPERA_MAXIMA_MS + ESPACAMENTO_MIN_MS;

function lerEstado() {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(arquivoEstadoDisjuntor, "utf-8"));
  } catch {
    return { ...ESTADO_PADRAO }; // 1ª execução, arquivo ilegível ou sem permissão
  }
  const agora = Date.now();
  // Saneamento contra relógio que andou (para frente ou para trás) e contra valores
  // absurdos num arquivo corrompido — sem isso, um bloqueadoAte inflado trava a
  // ferramenta por horas e um backoff negativo faz o disjuntor nunca engatar.
  const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
  return {
    ...ESTADO_PADRAO,
    ...d,
    requisicoes: (Array.isArray(d.requisicoes) ? d.requisicoes : [])
      .filter(Number.isFinite)
      .filter((t) => t <= agora + MARGEM_FUTURO_MS),
    proximoLivreEm: Math.min(num(d.proximoLivreEm, 0), agora + MARGEM_FUTURO_MS),
    bloqueadoAte: Math.max(0, Math.min(num(d.bloqueadoAte, 0), agora + BACKOFF_MAXIMO_MS)),
    indiceJanela: Math.max(0, Math.min(num(d.indiceJanela, 0), ESCADA_JANELA_MS.length - 1)),
    backoffMs: Math.max(BACKOFF_INICIAL_MS, Math.min(num(d.backoffMs, BACKOFF_INICIAL_MS), BACKOFF_MAXIMO_MS)),
    incidentes: Array.isArray(d.incidentes) ? d.incidentes.slice(-MAX_INCIDENTES) : [],
    ultimoSucessoEm: Math.max(0, Math.min(num(d.ultimoSucessoEm, 0), agora + MARGEM_FUTURO_MS)),
  };
}

// Quando o disco não aceita escrita (home somente-leitura, ENOSPC, dotfile criado
// sob sudo), o estado passa a viver em memória DESTE processo. Sem isso, cada
// chamada releria o padrão e nada acumularia: o limitador inteiro se desligaria em
// silêncio — medido, 40 de 40 chamadas admitidas e 25 requisições em 3ms, o padrão
// metralhadora que a v1.4.0 existe para evitar. Degradado (cada processo conta
// sozinho) é muito melhor que ilimitado.
let estadoMemoria = null;
let persistenciaIndisponivel = null; // código do erro (EACCES/EROFS/ENOSPC/EISDIR…)

export function _statusPersistencia() {
  return persistenciaIndisponivel;
}

// Read-modify-write atômico: lê o estado mais recente do disco (não um cache de
// processo — senão volta a corrida de last-write-wins), aplica fn e regrava.
function transacao(fn) {
  return comTrava(() => {
    // Enquanto a persistência estiver quebrada, a memória manda: reler o disco
    // sobreporia o contador com um arquivo congelado (caso do arquivo 444).
    const estado = persistenciaIndisponivel && estadoMemoria ? estadoMemoria : lerEstado();
    const resultado = fn(estado);
    try {
      // Escrita atômica: writeFileSync direto é truncate+write e pode ser lido pela
      // metade (medido: 4,8% de leituras inválidas sob escrita concorrente). rename
      // no mesmo volume nunca deixa arquivo incompleto.
      const tmp = `${arquivoEstadoDisjuntor}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(estado));
      fs.renameSync(tmp, arquivoEstadoDisjuntor);
      persistenciaIndisponivel = null;
      estadoMemoria = null;
    } catch (e) {
      persistenciaIndisponivel = e?.code || "EIO";
      estadoMemoria = estado; // segue contando dentro deste processo
    }
    return resultado;
  });
}

// Reseta o estado — só para uso em testes (evita vazar estado entre casos).
export function _resetDisjuntorParaTeste() {
  try {
    fs.unlinkSync(arquivoEstadoDisjuntor);
  } catch {}
  try {
    fs.unlinkSync(arquivoEstadoDisjuntor + ".lock");
  } catch {}
  // Limpar o fallback em memória também: sem isso o estado de um teste vaza para
  // o seguinte (e, em produção, um erro de disco transitório manteria o processo
  // preso à cópia em memória mesmo depois de o disco voltar).
  estadoMemoria = null;
  persistenciaIndisponivel = null;
}

const fmtDuracao = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h${String(m).padStart(2, "0")}min`;
  if (m) return `${m}min${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
};

// Ponto único de admissão: decide bloqueio, orçamento e espaçamento numa só
// transação (separar em checagens independentes abriria janela para duas
// chamadas passarem juntas). Devolve {esperarMs} com a vaga já reservada, ou
// {erro} com mensagem pronta para o usuário.
export function reservarRequisicao(agora = Date.now()) {
  return transacao((e) => {
    if (agora < e.bloqueadoAte) {
      return {
        erro:
          "O TJRO bloqueou uma consulta recente por suspeita de automação; para não " +
          "prolongar o bloqueio, esta ferramenta está evitando novas tentativas por " +
          `mais ${fmtDuracao(e.bloqueadoAte - agora)}. Tente novamente depois disso. ` +
          "Enquanto isso, o portal juris.tjro.jus.br segue acessível no navegador.",
      };
    }
    const janelaMs = ESCADA_JANELA_MS[e.indiceJanela];
    e.requisicoes = e.requisicoes.filter((t) => agora - t <= janelaMs);
    if (e.requisicoes.length >= JANELA_MAX_REQS) {
      const espera = janelaMs - (agora - e.requisicoes[0]);
      return {
        erro:
          `Muitas consultas em pouco tempo (limite atual: ${JANELA_MAX_REQS} a cada ` +
          `${fmtDuracao(janelaMs)}, compartilhado por todos os processos desta extensão nesta máquina ` +
          "e ajustado conforme bloqueios anteriores do TJRO). " +
          `Aguarde ${fmtDuracao(espera)} e tente de novo.`,
      };
    }
    const vaga = Math.max(agora, e.proximoLivreEm);
    const esperarMs = vaga - agora;
    if (esperarMs > ESPERA_MAXIMA_MS) {
      return {
        erro:
          `Fila de espera longa demais (${fmtDuracao(esperarMs)}) — há consultas demais ` +
          "em andamento em paralelo. Refaça a busca daqui a pouco, de preferência uma por vez.",
      };
    }
    e.proximoLivreEm = vaga + ESPACAMENTO_MIN_MS;
    e.requisicoes.push(vaga);
    e.ultimaRequisicaoEm = vaga;
    e.totalRequisicoes = (e.totalRequisicoes || 0) + 1;
    return { esperarMs };
  });
}

// WAF do TJRO bloqueou: ativa/estende o disjuntor reativo (backoff dobra a cada
// nova detecção dentro do cooldown, até o teto) E, como isso só acontece se o
// limite preventivo atual não foi suficiente, avança um degrau na escada
// (janela mais larga) para o futuro — persistido, sobrevive a reinício.
// opts.subirEscada=false: arma o disjuntor mas NÃO alarga a janela. Usado quando o
// bloqueio é inferido só do status HTTP (403/429) sem a assinatura do WAF no corpo —
// um 403 espúrio (proxy corporativo, hiccup de CDN) não pode alargar a janela de
// forma quase permanente, já que a escada só relaxa após 100 sucessos consecutivos.
// opts.esperaMinimaMs: piso do cooldown, para respeitar um cabeçalho Retry-After.
// Bloqueio só ALARGA a janela quando veio depois de volume desta máquina. Relatos
// de 21 e 22/09/2026 (defensor em Sergipe; advogado em Rondônia): bloqueio já na
// 1ª consulta isolada, repetido, e a escada subindo a cada um — no 2º relato a
// ferramenta chegou ao nível 3 (10 consultas a cada 10 min) sem nunca ter feito
// rajada. A escada existe para responder a volume; subir por bloqueio que não
// veio de volume só deixa a ferramenta lenta pelo motivo errado. O disjuntor (a
// pausa depois do bloqueio) continua armando sempre — isso não muda.
export const MIN_REQS_PARA_ESCADA = 3; // consultas desta máquina no minuto anterior
export function consultasRecentes(agora = Date.now(), ms = 60_000) {
  const e = comTrava(() => lerEstado());
  return (e.requisicoes || []).filter((t) => agora - t <= ms).length;
}

export function registrarBloqueioDetectado(agora = Date.now(), operacao = "?", opts = {}) {
  const { subirEscada = true, esperaMinimaMs = 0, tipo = null } = opts;
  transacao((e) => {
    // Fotografa o que estava acontecendo ANTES de mexer no estado — é isso que
    // permite descobrir depois se o bloqueio veio de rajada nossa ou de algo
    // fora do nosso controle (ex.: outra máquina no mesmo IP, ou aperto do WAF).
    const reqs = e.requisicoes || [];
    const incidente = {
      quando: agora,
      operacao,
      tipo, // "desafio_navegador" | "robotizacao" | "status_NNN" — o diagnóstico separa os dois

      nivel: e.indiceJanela,
      janelaS: Math.round(ESCADA_JANELA_MS[e.indiceJanela] / 1000),
      reqsUltimos60s: reqs.filter((t) => agora - t <= 60_000).length,
      reqsNaJanela: reqs.filter((t) => agora - t <= ESCADA_JANELA_MS[e.indiceJanela]).length,
      desdeUltimaReqS: e.ultimaRequisicaoEm ? Math.round((agora - e.ultimaRequisicaoEm) / 1000) : null,
      desdeIncidenteAnteriorS: e.incidentes?.length
        ? Math.round((agora - e.incidentes[e.incidentes.length - 1].quando) / 1000)
        : null,
    };
    e.incidentes = [...(e.incidentes || []), incidente].slice(-MAX_INCIDENTES);

    e.bloqueadoAte = agora + Math.max(e.backoffMs, esperaMinimaMs);
    e.backoffMs = Math.min(e.backoffMs * 2, BACKOFF_MAXIMO_MS);
    if (subirEscada && e.indiceJanela < ESCADA_JANELA_MS.length - 1) e.indiceJanela += 1;
    e.sucessos = 0;
  });
}

// Relatório legível do estado e do histórico de bloqueios. Existe para que
// qualquer sessão (ou o próprio usuário) consiga responder "por que parou?" sem
// abrir arquivo nenhum — e para não repetir o diagnóstico errado de "portal
// fora do ar" quando na verdade é bloqueio por automação.
export function diagnosticoRitmo(agora = Date.now()) {
  const e = comTrava(() => lerEstado());
  const janelaMs = ESCADA_JANELA_MS[e.indiceJanela];
  const naJanela = (e.requisicoes || []).filter((t) => agora - t <= janelaMs).length;
  const linhas = [
    `**Controle de ritmo do MCP TJRO** (versão instalada: ${VERSAO})`,
    `- Nível atual: ${e.indiceJanela + 1} de ${ESCADA_JANELA_MS.length} ` +
      `(limite: ${JANELA_MAX_REQS} consultas a cada ${fmtDuracao(janelaMs)})`,
    `- Orçamento usado agora: ${naJanela}/${JANELA_MAX_REQS} nesta janela`,
    `- Consultas desde o início (nesta máquina): ${e.totalRequisicoes || 0}`,
    agora < e.bloqueadoAte
      ? `- ⚠️ BLOQUEADO por suspeita de automação — liberando em ${fmtDuracao(e.bloqueadoAte - agora)}`
      : "- Situação: liberado",
  ];
  if (persistenciaIndisponivel) {
    linhas.splice(
      1,
      0,
      `- ⚠️ AVISO: não foi possível gravar ${arquivoEstadoDisjuntor} (${persistenciaIndisponivel}) — ` +
        "o orçamento NÃO está sendo compartilhado entre processos; cada um conta sozinho. " +
        "Verifique permissão/espaço em disco."
    );
  }

  const inc = e.incidentes || [];
  if (!inc.length) {
    linhas.push("\nNenhum bloqueio registrado até agora nesta máquina.");
    return linhas.join("\n");
  }

  linhas.push(`\n**Bloqueios registrados: ${inc.length}** (mais recentes primeiro)`);
  for (const i of [...inc].reverse().slice(0, 8)) {
    const quando = new Date(i.quando).toISOString().replace("T", " ").slice(0, 16);
    const intervalo = i.desdeUltimaReqS === null ? "—" : `${i.desdeUltimaReqS}s`;
    linhas.push(
      `- ${quando} · ${i.reqsUltimos60s} consultas no minuto anterior, ` +
        `${i.reqsNaJanela} na janela de ${fmtDuracao(i.janelaS * 1000)} · ` +
        `intervalo desde a anterior: ${intervalo} · operação: ${i.operacao}` +
        (i.tipo === "desafio_navegador" ? " · **verificação de navegador** (não é ritmo)" : "")
    );
  }

  // Leitura do padrão: rajada nossa (muitas consultas antes) x algo fora do
  // nosso controle (bloqueio mesmo com pouquíssimo tráfego daqui).
  const desafios = inc.filter((i) => i.tipo === "desafio_navegador").length;
  if (desafios) {
    linhas.push(
      `\n**${desafios} de ${inc.length} foram verificação de navegador** (desafio JavaScript do filtro ` +
        "de segurança do portal), e não excesso de consultas: aumentar o intervalo entre buscas não " +
        "resolve esse caso. O portal segue abrindo no navegador; o que varia é a rede e o programa que " +
        "faz o acesso. Para liberar o acesso pela extensão, o caminho é o tribunal (suporte@tjro.jus.br)."
    );
  }
  const media = inc.reduce((n, i) => n + i.reqsUltimos60s, 0) / inc.length;
  const comPoucoTrafego = inc.filter((i) => i.reqsUltimos60s <= 2).length;
  linhas.push(
    `\n**Padrão observado:** em média ${media.toFixed(1)} consultas no minuto que antecedeu ` +
      `cada bloqueio.`
  );
  if (comPoucoTrafego > inc.length / 2) {
    linhas.push(
      "A maioria dos bloqueios veio com pouquíssimo tráfego desta máquina — indício de que a " +
        "causa está fora do controle desta ferramenta (outro equipamento no mesmo IP, ou o " +
        "próprio portal apertando o filtro). Espaçar mais as consultas aqui tende a não resolver. " +
        "Desde a v1.7.8, bloqueio assim não aperta mais o limite de ritmo. Em 22/09/2026 o autor " +
        "confirmou que o filtro do TJRO está recusando as consultas desta extensão em si (pela forma " +
        "como ela se identifica), e não a rede de quem usa: trocar de conexão não resolve. O caminho " +
        "é pesquisar pelo site (juris.tjro.jus.br) e acompanhar as versões novas. Esta ferramenta não " +
        "troca de IP nem se disfarça para contornar o filtro sem que você decida isso."
    );
  } else if (media >= 5) {
    linhas.push(
      "Os bloqueios vieram após rajadas — evitar várias consultas seguidas (preferir uma busca " +
        "ampla, com por_pagina maior) é o que mais ajuda."
    );
  }
  return linhas.join("\n");
}

// Consulta bem-sucedida: reseta o backoff reativo (um incidente passado não
// deve continuar penalizando o uso normal futuro) e conta pra relaxar a escada
// — depois de uma sequência longa sem novo bloqueio no nível atual, afrouxa um
// degrau (o bloqueio anterior pode ter sido pontual, ou o TJRO ajustou o WAF).
// Bloqueio SISTEMÁTICO (22/09/2026): o filtro do TJRO muda com o tempo, e há
// fases em que ele recusa TODA consulta desta extensão, qualquer que seja o ritmo.
// A ferramenta aprende isso pelo próprio histórico, que é compartilhado por todas
// as sessões do computador: 2+ bloqueios nas últimas 24 h, cada um com pouco
// tráfego (<= 2 consultas no minuto anterior), sem nenhuma consulta bem-sucedida
// entre o primeiro deles e agora. Nesse caso, insistir ou esperar minutos não
// resolve, e o usuário leigo precisa saber disso em linguagem simples.
export const JANELA_SISTEMATICO_MS = 24 * 60 * 60_000;
export function bloqueioSistematico(agora = Date.now()) {
  const e = comTrava(() => lerEstado());
  const recentes = (e.incidentes || []).filter(
    (i) => agora - i.quando <= JANELA_SISTEMATICO_MS && (i.reqsUltimos60s ?? 99) <= 2
  );
  const semSucessoDepois = recentes.filter((i) => i.quando > (e.ultimoSucessoEm || 0));
  if (semSucessoDepois.length < 2) return null;
  return { vezes: semSucessoDepois.length, desde: semSucessoDepois[0].quando };
}

export function registrarSucesso() {
  transacao((e) => {
    e.backoffMs = BACKOFF_INICIAL_MS;
    e.ultimoSucessoEm = Date.now();
    e.sucessos += 1;
    if (e.sucessos >= SUCESSOS_PARA_RELAXAR) {
      e.sucessos = 0; // reseta sempre, mesmo já no nível mínimo (não cresce sem limite)
      if (e.indiceJanela > 0) e.indiceJanela -= 1;
    }
  });
}

// Cache de respostas idênticas (por processo): repetir a MESMA busca na mesma
// conversa não deve gerar uma segunda requisição ao portal. Não substitui o
// orçamento compartilhado — é só o tráfego que dá pra evitar de graça.
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRADAS = 32;
const cacheRespostas = new Map();

// Camada em DISCO (v1.7.15): a mesma busca refeita em outra conversa ou depois de
// reiniciar o Claude não gasta consulta por 24 h. O WAF bloqueia pico curto
// (medido em 23/09/2026); cada consulta evitada é margem.
export const CACHE_DISCO_MS = 24 * 3600 * 1000;
const arqResposta = (chave) =>
  path.join(dirCache(), `resp-${crypto.createHash("sha1").update(chave).digest("hex")}.json`);

export function _limparCacheMemoriaParaTeste() {
  cacheRespostas.clear();
}

export function _limparCacheParaTeste() {
  cacheRespostas.clear();
  try {
    for (const f of fs.readdirSync(dirCache())) if (f.startsWith("resp-")) fs.rmSync(path.join(dirCache(), f), { force: true });
  } catch {
    /* sem pasta, nada a limpar */
  }
}

function cacheLer(chave, agora) {
  const item = cacheRespostas.get(chave);
  if (item && agora - item.quando <= CACHE_TTL_MS) return item.dados;
  if (item) cacheRespostas.delete(chave);
  try {
    const d = JSON.parse(fs.readFileSync(arqResposta(chave), "utf8"));
    if (agora - d.quando <= CACHE_DISCO_MS) return d.dados;
  } catch {
    /* sem cache em disco */
  }
  return null;
}

function cacheGravar(chave, dados, agora) {
  if (cacheRespostas.size >= CACHE_MAX_ENTRADAS) {
    cacheRespostas.delete(cacheRespostas.keys().next().value); // descarta a mais antiga
  }
  cacheRespostas.set(chave, { dados, quando: agora });
  try {
    if (!(dados?.hits?.hits || []).length) return; // zero resultado não vai para o disco
    fs.mkdirSync(dirCache(), { recursive: true });
    const alvo = arqResposta(chave);
    const tmp = `${alvo}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ quando: agora, dados }));
    fs.renameSync(tmp, alvo);
  } catch {
    /* cache é economia, nunca condição */
  }
}

export async function post(body, fetchImpl = fetch) {
  const chave = JSON.stringify(body);
  const emCache = cacheLer(chave, Date.now());
  if (emCache) return emCache; // não consome vaga: nenhuma requisição é feita

  const reserva = reservarRequisicao();
  if (reserva.erro) throw new Error(reserva.erro);
  if (reserva.esperarMs > 0) {
    await new Promise((r) => setTimeout(r, reserva.esperarMs));
  }

  const r = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  // O corpo é lido ANTES de decidir pelo status: se o WAF um dia escalar de página
  // 200-com-HTML para 403/429, a detecção de bloqueio precisa rodar do mesmo jeito.
  // Com a ordem antiga (status primeiro), disjuntor, escada e diário de incidentes
  // eram furados por inteiro e o diagnóstico passava a afirmar "Situação: liberado"
  // enquanto a ferramenta seguia batendo num portal que estava bloqueando.
  const ctype = (r.headers.get("content-type") || "").toLowerCase();
  let texto = null;
  if (!r.ok || !ctype.includes("json")) {
    try {
      texto = await r.text(); // uma única vez: r.text() duas vezes lança e some com a mensagem útil
    } catch {
      texto = "";
    }
  }
  const ehBloqueio = !!texto && /robotiza|p[aá]gina bloqueada|\bstic\b/i.test(texto);
  // Desafio de navegador não é ritmo: arma o disjuntor curto (não adianta insistir
  // em rajada), mas NÃO alarga a janela — a escada existe para volume, e punir o
  // ritmo aqui deixaria a ferramenta lenta por um motivo que não é o dela.
  const ehDesafio = !!texto && ehDesafioNavegador(texto);
  if (ehBloqueio || r.status === 403 || r.status === 429) {
    const campos = body?.fields || {};
    const operacao = campos.nr_processo && !campos.query ? "inteiro_teor" : "busca";
    const retryAfterMs = (Number(r.headers.get("retry-after")) || 0) * 1000;
    registrarBloqueioDetectado(Date.now(), operacao, {
      // status seco, desafio de navegador e bloqueio após consulta isolada armam o
      // disjuntor, sem alargar a janela (ver MIN_REQS_PARA_ESCADA)
      subirEscada: ehBloqueio && !ehDesafio && consultasRecentes() >= MIN_REQS_PARA_ESCADA,
      tipo: ehDesafio ? "desafio_navegador" : ehBloqueio ? "robotizacao" : "status_" + r.status,
      esperaMinimaMs: retryAfterMs,
    });
  }
  // 503 e demais erros seguem como instabilidade: não são bloqueio, e insistir dentro
  // do orçamento já é o comportamento certo.
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!ctype.includes("json")) throw new Error(diagnosticarRespostaNaoJson(ctype, texto));
  registrarSucesso();
  const dados = await r.json();
  cacheGravar(chave, dados, Date.now());
  return dados;
}

// --------------------------------------------------------------- formatters -
export function formatBusca(data, consulta, tipo, ordenacao, pagina, porPagina, filtros = [], nota = "", termoExato = false, consultaMontada = "") {
  const hitsObj = data.hits || {};
  const total = (hitsObj.total || {}).value || 0;
  const hits = hitsObj.hits || [];
  const out = [];
  if (nota) out.push(nota.trimEnd());
  // Com grupos, a consulta que foi de fato ao portal é a montada: mostrá-la deixa
  // conferível o que se buscou (e o que ficou de fora) sem adivinhar a sintaxe.
  const criterio = consultaMontada
    ? `casam a consulta montada \`${consultaMontada}\` (ementa e acórdão do MESMO julgado contam separado)`
    : termoExato
    ? `contêm a expressão exata "${consulta}"`
    : `contêm ao menos um dos termos de "${consulta}" (busca OR; ementa e acórdão do MESMO julgado contam separado)`;
  out.push(
    `**${total} documento(s)** ${criterio} · tipo: ${tipo.join(", ")} · ordenação: ${ordenacao} · página ${pagina}`
  );
  if (total > 5000 && !termoExato)
    out.push(
      consultaMontada
        ? "_Dica: para restringir, acrescente um grupo com o fato que distingue o seu caso (o tipo de réu, o produto, a conduta) — os grupos se somam por AND._"
        : '_Dica: para restringir, use operador AND na consulta (ex.: "dano AND moral"), termo_exato=true, ou `grupos` de sinônimos._'
    );

  if (total === 0 || hits.length === 0) {
    if (filtros.length) {
      out.push(
        `\nNenhum resultado com os filtros ativos (${filtros.join("; ")}). ` +
          'Os filtros exigem grafia EXATA e sensível a maiúsculas: classes em CAIXA ALTA (ex.: "APELAÇÃO CÍVEL"), ' +
          'câmaras em Formato de Título (ex.: "1ª Câmara Cível"). Confira a grafia ou repita sem o filtro.'
      );
    } else {
      const sugg = sugestoes(data, consulta);
      out.push(
        sugg.length
          ? `\nNenhum resultado. Você quis dizer: ${sugg.join(", ")}?`
          : "\nNenhum resultado. Esta busca casa PALAVRAS, não sentido: um julgado que diga " +
              '"inscrição indevida em cadastro de inadimplentes" não aparece numa busca por ' +
              '"negativação". Use `grupos` com sinônimos e expressões equivalentes ' +
              '(ex.: [["negativação","inscrição indevida","cadastro de inadimplentes"]]), o curinga ' +
              'final ("consign*" pega consignado/consignação), ou ancore pela súmula ou tema que ' +
              'os julgados do assunto costumam citar (ex.: grupo ["Súmula 385"]).'
      );
    }
    return out.join("\n");
  }

  const inicio = (pagina - 1) * porPagina + 1;
  // Agrupa por número: sob o mesmo número, vários julgados (ver idDocumento).
  const porProcesso = new Map();
  hits.forEach((h, i) => {
    const k = String((h._source || {}).nr_processo || "").replace(/\D/g, "") || `#${i}`;
    if (!porProcesso.has(k)) porProcesso.set(k, []);
    porProcesso.get(k).push(i);
  });
  const chaveProc = (i) => String((hits[i]._source || {}).nr_processo || "").replace(/\D/g, "") || `#${i}`;
  const chaveJulg = (i) => String((hits[i]._source || {}).dtjulgamento || "");
  const textos = hits.map((h) => limpar((h._source || {}).ds_modelo_documento || "", 0));
  const resultados = textos.map(resultadoDe);
  // Câmara declarada no FECHO de cada acórdão da página (offline, sobre o texto já
  // trazido). Vale também para os outros documentos do MESMO julgamento na página
  // (nº + data; sem data não se presume — red team 04/09/2026, achado 6): a ementa
  // não tem fecho. Fechos divergentes no mesmo julgamento: não arrisca.
  const fechos = textos.map((x) => {
    const r = extrairOrgaoComOrigem(x);
    return r && r.origem === "fecho" ? r.orgao : null;
  });
  const fechoDoJulgamento = new Map();
  hits.forEach((h, i) => {
    if (!fechos[i] || !chaveJulg(i) || chaveProc(i).startsWith("#")) return;
    const k = `${chaveProc(i)}|${chaveJulg(i)}`;
    const antes = fechoDoJulgamento.get(k);
    fechoDoJulgamento.set(k, antes === undefined || fold(antes) === fold(fechos[i]) ? fechos[i] : null);
  });
  const orgaoDoFechoDe = (i) =>
    fechos[i] || (chaveJulg(i) && !chaveProc(i).startsWith("#") ? fechoDoJulgamento.get(`${chaveProc(i)}|${chaveJulg(i)}`) : null) || null;
  let houveCorte = false;
  const quandoDe = (s) => s.dtjulgamento_str || dataBr(s.dtjulgamento) || "?";

  hits.forEach((h, i) => {
    const s = h._source || {};
    const hl = (h.highlight || {}).ds_modelo_documento;
    const inteiro = limpar(hl ? hl[0] : s.ds_modelo_documento || "", 0);
    const trecho = limpar(hl ? hl[0] : s.ds_modelo_documento || "", 800);
    if (inteiro.length > trecho.length) houveCorte = true;
    const t = s.tipo || "documento";
    let rotulo;
    if (t === "EMENTA") rotulo = "Ementa (trecho)";
    else {
      const artigo = ["SENTENÇA", "DECISÃO", "DECISÃO DA PRESIDÊNCIA"].includes(t) ? "da" : "do";
      rotulo = `Trecho ${artigo} ${t} com os termos da busca`;
    }
    if (t === "VOTO") rotulo += " (VOTO — pode ser voto vencido; não é o dispositivo do colegiado)";
    const assunto = s.ds_assunto_trf ? ` · Assunto: ${s.ds_assunto_trf}` : "";
    const doFecho = orgaoDoFechoDe(i);
    const corrige = doFecho && orgaoDiverge(doFecho, orgao(s)) ? doFecho : null;
    const linhas = [
      `\n---\n**${inicio + i}. ${s.tipo} · ${s.ds_classe_judicial || ""}**`,
      `- Processo: ${cnj(s.nr_processo || "")}`,
      `- Id. do documento: ${idDocumento(s) || "—"} (chave única desta decisão)`,
      `- Relator(a): ${relator(s)}`,
      corrige
        ? `- Órgão: ${corrige} (${s.grau_jurisdicao}º grau) — ⚠️ declarado no fecho do acórdão; o índice diz ${orgao(s)}`
        : `- Órgão: ${orgao(s)} (${s.grau_jurisdicao}º grau)`,
      `- Julgado em: ${s.dtjulgamento_str || s.dtjulgamento || "—"}${assunto}`,
      `- Citação: ${citacao(s, corrige)}`,
      `- Inteiro teor: ${link(s)}`,
    ];
    const grupo = porProcesso.get(chaveProc(i));
    if (grupo.length > 1) {
      if (grupo[0] === i) {
        const lista = grupo
          .map((j) => {
            const x = hits[j]._source || {};
            const rel = relator(x) !== "—" ? ` (Rel. ${relator(x)})` : "";
            return `nº ${inicio + j}: ${quandoDe(x)} ${x.tipo || ""}${rel}`;
          })
          .join("; ");
        linhas.push(
          `- ⚠️ Mesmo número, ${grupo.length} documentos nesta página (${lista}) — o número NÃO identifica a decisão: cite pelo id + data de julgamento.`
        );
      } else {
        linhas.push(`- ⚠️ Mesmo número que o resultado nº ${inicio + grupo[0]} — cite pelo id + data de julgamento.`);
      }
      // Resultado oposto no MESMO julgamento: provável voto vencido indexado.
      for (const j of grupo) {
        // Data ausente não é evidência de mesmo julgamento: nunca casa (red team, achado 6).
        if (j === i || !chaveJulg(i) || chaveJulg(j) !== chaveJulg(i)) continue;
        for (const par of OPOSTOS) {
          const meu = ladoDe(resultados[i], par);
          const dele = ladoDe(resultados[j], par);
          if (meu && dele && meu !== dele) {
            linhas.push(
              `- ⚠️ Resultado oposto a outro documento do mesmo julgamento: este diz ${meu}; o nº ${inicio + j} ` +
                `(${(hits[j]._source || {}).tipo}) diz ${dele}. Provável voto vencido indexado junto ao acórdão — ` +
                `o dispositivo do colegiado é o do ACÓRDÃO/EMENTA; confira o inteiro teor.`
            );
          }
        }
      }
    }
    linhas.push(...linhasDeSinais(s, inteiro));
    linhas.push(`- ${rotulo}: ${trecho || "(sem trecho)"}`);
    out.push(linhas.join("\n"));
  });
  // Aviso de UMA vez, no rodapé — por resultado viraria ruído (quase toda ementa
  // passa de 800 chars) e ruído faz o leitor parar de ler os avisos que importam.
  // Motivo real (08/09/2026): peça citou uma tese fichada só pelos primeiros itens
  // de uma ementa numerada, sem ler o item final, que aplicava o oposto.
  if (houveCorte)
    out.push(
      "\n_Os trechos acima são fragmentos (até 800 caracteres) do ponto onde os termos casaram, " +
        "não a ementa inteira. Ementa numerada costuma ENUNCIAR a tese nos primeiros itens e APLICÁ-LA " +
        "nos últimos, às vezes com alcance menor — abra o inteiro teor antes de fichar ou citar._"
    );

  // Resumo 100% offline dos resultados DESTA página (ver resumoResultadosPagina).
  // Só com amostra mínima (3+): com 1-2 hits, um resumo teria peso de conclusão
  // que a amostra não sustenta.
  if (hits.length >= 3) {
    const { contagem, semResultado } = resumoResultadosPagina(hits);
    const partes = Object.entries(contagem)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n} ${ROTULOS_RESULTADO[k]}${n > 1 ? "s" : ""}`);
    if (semResultado > 0) partes.push(`${semResultado} sem resultado identificável`);
    if (partes.length) {
      const enviesa = ordenacao === "relevantes" ? ' — enviesa a amostra; prefira "recentes" ou "antigos" para uma leitura mais honesta' : "";
      out.push(
        `\n_Nesta página: ${partes.join(", ")}. Contagem por JULGAMENTO (nº do processo + data de ` +
          "julgamento) — ementa e acórdão do MESMO julgado contam uma vez só. Documento que declara os " +
          'dois lados de um par entra em "sem resultado identificável", nunca num dos lados. Resultado ' +
          "não é posição sobre a tese: recurso provido por outro fundamento conta como provido e nada diz " +
          `sobre a tese buscada. É a amostra desta página, na ordenação "${ordenacao}"${enviesa}. Indício ` +
          "para escolher o que ler, nunca conclusão._"
      );
    }
  }

  if (total > pagina * porPagina) {
    if ((pagina + 1) * porPagina > JANELA_MAXIMA) {
      out.push(
        "\n_(há mais resultados, mas o portal só expõe os 10.000 primeiros — refine com filtros ou mude a ordenação)_"
      );
    } else if (porPagina < 50) {
      // Preferir UMA busca maior a várias páginas: cada página é uma requisição
      // a mais ao portal, e o orçamento de requisições é limitado.
      out.push(
        `\n_(há mais resultados — prefira repetir a busca com por_pagina maior (até 50) ` +
          `numa única chamada, em vez de paginar; se precisar mesmo paginar, use pagina=${pagina + 1})_`
      );
    } else {
      out.push(`\n_(há mais resultados — chame novamente com pagina=${pagina + 1})_`);
    }
  }
  return out.join("\n");
}

export function formatInteiro(data, nrProcesso) {
  const hitsObj = data.hits || {};
  const total = (hitsObj.total || {}).value || 0;
  const hits = hitsObj.hits || [];
  if (!hits.length) return `Nenhum documento encontrado para o processo ${cnj(nrProcesso)}.`;

  // O índice às vezes devolve a mesma peça duplicada (ids distintos, texto idêntico).
  const unicos = [];
  const vistos = new Set();
  for (const h of hits) {
    const s = h._source || {};
    const corpo = limpar(s.ds_modelo_documento || "", 0); // 0 = sem truncar
    const chave = `${s.tipo} ${corpo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push([s, corpo]);
  }

  const s0 = unicos[0][0];
  // Câmara que o FECHO declara para o julgamento da Citação: o da própria peça ou
  // o de outra peça do MESMO julgamento (a ementa não tem fecho). Sem data, só a
  // própria peça; fechos divergentes, não arrisca.
  const dataDe = (s) => s.dtjulgamento_str || dataBr(s.dtjulgamento) || "";
  const fechos0 = new Map();
  for (const [s, corpo] of unicos) {
    if (s !== s0 && (!dataDe(s0) || dataDe(s) !== dataDe(s0))) continue;
    const r = extrairOrgaoComOrigem(corpo);
    if (r && r.origem === "fecho") fechos0.set(fold(r.orgao), r.orgao);
  }
  const fecho0 = fechos0.size === 1 ? [...fechos0.values()][0] : null;
  const corrige0 = fecho0 && orgaoDiverge(fecho0, orgao(s0)) ? fecho0 : null;
  const out = [
    `**Processo ${cnj(nrProcesso)} — ${s0.ds_classe_judicial || ""}**`,
    `Relator(a): ${relator(s0)} · ${corrige0 ? `${corrige0} (⚠️ declarado no fecho do acórdão; o índice diz ${orgao(s0)})` : orgao(s0)} · Julgado em ${s0.dtjulgamento_str || s0.dtjulgamento || "—"}`,
    `Citação: ${citacao(s0, corrige0)}` + (idDocumento(s0) ? ` · id ${idDocumento(s0)}` : ""),
    // O link do topo é o da peça mais recente; cada peça abaixo traz o seu. A ficha
    // copia o link da peça CITADA: uma ficha real guardou o id do acórdão com o link
    // do relatório de outro julgamento, e a peça gerada levaria o juiz ao documento errado.
    `Inteiro teor no portal (${s0.tipo}${idDocumento(s0) ? `, id ${idDocumento(s0)}` : ""}): ${link(s0)}`,
  ];
  // Sob o mesmo número, julgamentos distintos: a Citação acima é só da peça
  // mais recente. Quem cita "pelo número" pode estar citando outra decisão.
  const julgamentos = new Map();
  for (const [s] of unicos) {
    // Sem data, cada peça é um julgamento à parte: não dá para afirmar que
    // duas peças sem data são do mesmo (red team 04/09/2026, achado 6).
    const d = s.dtjulgamento_str || dataBr(s.dtjulgamento) || `sem data (id ${idDocumento(s) || "?"})`;
    if (!julgamentos.has(d)) julgamentos.set(d, []);
    julgamentos.get(d).push(s);
  }
  if (julgamentos.size > 1) {
    const lista = [...julgamentos.entries()]
      .map(([d, ss]) =>
        `${d}: ${ss
          .map((s) => `${s.tipo}${relator(s) !== "—" ? `, Rel. ${relator(s)}` : ""}${idDocumento(s) ? `, id ${idDocumento(s)}` : ""}`)
          .join(" / ")}`
      )
      .join("; ");
    out.push(
      `⚠️ Este número tem ${julgamentos.size} julgamentos distintos — ${lista}. A Citação acima é da decisão mais recente; ` +
        `para citar outra, use a data e o id da peça correspondente. O número sozinho não identifica a decisão.`
    );
  }
  if (total > hits.length)
    out.push(
      `⚠️ O processo tem ${total} documentos; vieram os ${hits.length} mais recentes — refine o parâmetro tipo para alcançar os demais.`
    );

  // Orçamento global com teto por peça dinâmico: uma peça sozinha pode usar
  // o orçamento inteiro (há acórdãos de ~80k chars).
  const tetoPeca = Math.max(15000, Math.floor(ORCAMENTO_INTEIRO / Math.max(1, unicos.length)));
  let usado = out.reduce((n, x) => n + x.length, 0);
  for (const [s, corpo] of unicos) {
    const quando = s.dtjulgamento_str || s.dtjulgamento || "";
    const cab =
      `\n## ${s.tipo}` +
      (quando ? ` — julgado em ${quando}` : "") +
      (relator(s) !== "—" ? ` · Relator(a): ${relator(s)}` : "") +
      (idDocumento(s) ? ` · id ${idDocumento(s)}` : "") +
      ` · link ${link(s)}`;
    if (usado >= ORCAMENTO_INTEIRO) {
      out.push(
        "\n_(limite de tamanho da resposta atingido — peças restantes omitidas; chame novamente filtrando por tipo ou abra o link do portal acima)_"
      );
      break;
    }
    // Índice × texto: o campo do cadastro pode divergir do que o acórdão diz.
    const avisos = [];
    const org = extrairOrgaoComOrigem(corpo);
    if (org && orgaoDiverge(org.orgao, orgao(s)))
      avisos.push(
        `⚠️ Índice: ${orgao(s)} · ${org.origem === "fecho" ? 'fecho do acórdão ("acordam os Magistrados...")' : "cabeçalho desta peça"}: ` +
          `${org.orgao} — prevalece o texto (o cadastro do portal já saiu errado; cite pela câmara que o acórdão declara).`
      );
    const relTexto = extrairRelatorDoTexto(corpo);
    if (relatorDiverge(relTexto, relator(s)))
      avisos.push(
        `⚠️ Índice: relator ${relator(s)} · cabeçalho desta peça: "${relTexto}" — pode ser relator sorteado vencido ou o do acórdão embargado; confira no acórdão antes de citar.`
      );
    let texto = corpo || "(documento sem texto)";
    const teto = Math.min(tetoPeca, ORCAMENTO_INTEIRO - usado);
    if (texto.length > teto) {
      const corte = texto.slice(0, teto).replace(/\s+\S*$/, "");
      texto =
        `${corte}…\n_[peça exibida parcialmente (${corte.length} de ${corpo.length} caracteres) — ` +
        `para o texto integral, chame obter_inteiro_teor_tjro(tipo=["${s.tipo}"]) ou abra o link do portal]_`;
    }
    const bloco = `${cab}${avisos.length ? "\n" + avisos.join("\n") : ""}\n${texto}`;
    out.push(bloco);
    usado += bloco.length;
  }
  return out.join("\n");
}


// --------------------------------------------------------------- crédito ---
// Assinatura do autor, UMA vez por processo do servidor (na prática, a cada vez
// que o Claude sobe a extensão), na primeira resposta bem-sucedida. É assinatura
// factual, não instrução ao modelo: texto do tipo "diga ao usuário que..." dentro
// de resultado de ferramenta é o padrão clássico de prompt injection, que modelos
// bem treinados aprendem a ignorar. E em toda resposta viraria ruído — dez buscas,
// dez agradecimentos — minando a confiança que a seção "Segurança e auditoria"
// do README constrói. Nenhum dado sai da máquina por causa disto.
export const CREDITO =
  "_Esta extensão foi desenvolvida por @robertogrecia (Roberto Grécia Bessa, OAB/RO 7865-A). Obrigado por usar!_";
let creditoDado = false;
export function comCredito(texto) {
  if (creditoDado) return texto;
  creditoDado = true;
  return `${texto}\n\n${CREDITO}`;
}
export function _resetCreditoParaTeste() {
  creditoDado = false;
}

// --------------------------------------------------------- sinais do julgado ---
// Crítica pública a MCPs de jurisprudência (21/09/2026): busca por palavra não
// pesa autoridade. Aqui NÃO se inventa nota nem se reordena — um número calculado
// por mim viraria autoridade aparente, e citador comercial já erra o "treatment".
// O que se faz é etiquetar, de graça, dois sinais que já estão no texto trazido:
// (1) precedente QUALIFICADO citado pelo julgado — serve de peso e de âncora para
// a próxima busca (julgado do mesmo assunto cita a mesma súmula/tema); (2) peça de
// 1º grau, que não é precedente. Zero requisição a mais: lê só o que já veio.
const RE_ANCORAS = [
  [/s[úu]mula\s+vinculante\s+n?[º°.]*\s*(\d{1,4})/gi, (n) => `Súmula Vinculante ${n}`],
  [/s[úu]mula\s+n?[º°.]*\s*(\d{1,4})/gi, (n) => `Súmula ${n}`],
  [/tema\s+(?:repetitivo\s+|de\s+repercuss[ãa]o\s+geral\s+)?n?[º°.]*\s*(\d{1,4}(?:\.\d{3})?)/gi,
    (n) => `Tema ${n}`],
  [/\bIRDR\s+n?[º°.]*\s*(\d{1,4})/gi, (n) => `IRDR ${n}`],
  [/\bIAC\s+n?[º°.]*\s*(\d{1,4})/gi, (n) => `IAC ${n}`],
];
const ANCORAS_MAX = 6;

// Precedentes qualificados citados no texto, sem repetir, na ordem em que aparecem.
export function ancoras(texto, max = ANCORAS_MAX) {
  const achado = new Map();
  for (const [re, rotular] of RE_ANCORAS) {
    re.lastIndex = 0;
    for (const m of String(texto || "").matchAll(re)) {
      const n = m[1].replace(/\./g, "");
      if (!n || n === "0") continue;
      const nome = rotular(n);
      // "Súmula Vinculante 47" já casou na regra anterior: não duplicar como "Súmula 47".
      if (nome.startsWith("Súmula ") && achado.has(`Súmula Vinculante ${n}`)) continue;
      if (!achado.has(nome)) achado.set(nome, m.index ?? 0);
    }
  }
  return [...achado.entries()].sort((a, b) => a[1] - b[1]).map(([nome]) => nome).slice(0, max);
}

// true quando a peça é do 1º grau (sentença/juízo de origem): decisão de juiz não
// é precedente — serve para ver como um juízo decide, nunca para citar como tese.
export const ehPrimeiroGrau = (s) =>
  String(s.grau_jurisdicao ?? "") === "1" || String(s.tipo || "").toUpperCase() === "SENTENÇA";

export const ehTurmaRecursal = (s) =>
  /turma\s+recursal/i.test(`${s.ds_orgao_julgador_colegiado || ""} ${s.ds_orgao_julgador || ""}`);
export function linhasDeSinais(s, textoInteiro) {
  const linhas = [];
  if (ehPrimeiroGrau(s))
    linhas.push(
      "- ⚠️ 1º grau: sentença não é precedente — serve para ver como o juízo decide e que fundamentos cita, não para citar como jurisprudência."
    );
  if (ehTurmaRecursal(s))
    linhas.push(
      "- ⚠️ Turma Recursal (Juizados Especiais): não é o TJ em 2º grau comum. Pesa em processo do Juizado; em apelação no rito comum é só persuasivo — prefira acórdão de Câmara e diga o órgão na citação."
    );
  const a = ancoras(textoInteiro);
  if (a.length)
    linhas.push(
      `- Cita: ${a.join(" · ")} — precedente qualificado citado pelo julgado (peso, e âncora para a próxima busca); confirme a situação de cada um na fonte.`
    );
  return linhas;
}

// ----------------------------------------------------------------- recibos ---
// Cadeia de custódia da citação: cada peça de inteiro teor que o portal devolveu
// fica gravada em disco, por id do documento, com o texto limpo. Serve para
// conferir depois, por script, se o trecho que foi para a ficha/peça está mesmo
// no documento que o tribunal entregou — e não só no que o modelo diz ter lido.
// É texto público de acórdão; nada sai da máquina. Falha de gravação é silenciosa.
export const dirRecibos = (env = process.env) =>
  env.TJRO_MCP_DIR_RECIBOS || path.join(os.homedir(), ".tjro-jurisprudencia-recibos");

export function recibo(s, agora = new Date()) {
  const id = idDocumento(s);
  const texto = limpar(s.ds_modelo_documento || "", 0);
  if (!/^\d{1,20}$/.test(id) || !texto) return null;
  return {
    id_documento: id,
    nr_processo: s.nr_processo ?? null,
    tipo: s.tipo ?? null,
    data_julgamento: s.dtjulgamento_str || dataBr(s.dtjulgamento || "") || null,
    obtido_em: agora.toISOString(),
    texto,
  };
}

export function gravarRecibos(data, pasta = dirRecibos()) {
  let n = 0;
  try {
    fs.mkdirSync(pasta, { recursive: true });
    for (const h of data?.hits?.hits || []) {
      const r = recibo(h._source || {});
      if (!r) continue;
      const tmp = path.join(pasta, `.${r.id_documento}.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(r));
      fs.renameSync(tmp, path.join(pasta, `${r.id_documento}.json`));
      n++;
    }
  } catch {
    /* recibo é conferência extra, nunca condição da pesquisa */
  }
  return n;
}

// ------------------------------------------------ cache do inteiro teor ---
// O WAF do TJRO conta VOLUME em poucos minutos (teste de 23/09/2026: 18 consultas
// em ~3 min bloquearam mesmo espaçadas). Reabrir um acórdão já lido gastava cota à
// toa; agora a resposta inteira fica em disco por 7 dias e volta sem rede. Acórdão
// não muda, mas o processo pode ganhar peça nova (ED), por isso o prazo.
export const dirCache = (env = process.env) =>
  env.TJRO_MCP_DIR_CACHE || path.join(os.homedir(), ".tjro-jurisprudencia-cache");
export const CACHE_INTEIRO_MS = 7 * 24 * 3600 * 1000;
const chaveInteiro = (nr, tipo) =>
  `inteiro-${String(nr || "").replace(/\D/g, "")}-${[...(tipo || [])].sort().join("_").replace(/[^A-Za-zÀ-ú_]/g, "")}.json`;

export function lerCacheInteiro(nr, tipo, pasta = dirCache(), agora = Date.now()) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(pasta, chaveInteiro(nr, tipo)), "utf8"));
    if (!c?.obtido_em || agora - Date.parse(c.obtido_em) > CACHE_INTEIRO_MS) return null;
    return c;
  } catch {
    return null;
  }
}

export function gravarCacheInteiro(nr, tipo, data, pasta = dirCache(), agora = new Date()) {
  try {
    if (!(data?.hits?.hits || []).length) return false; // zero resultado nunca vai para o cache
    fs.mkdirSync(pasta, { recursive: true });
    const alvo = path.join(pasta, chaveInteiro(nr, tipo));
    const tmp = `${alvo}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ obtido_em: agora.toISOString(), data }));
    fs.renameSync(tmp, alvo);
    return true;
  } catch {
    return false;
  }
}

export const notaCache = (obtidoEm) =>
  `_(Do cache local: lido do TJRO em ${new Date(obtidoEm).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho" })}; esta leitura não gastou consulta. Vale por 7 dias.)_\n\n`;

// ------------------------------------------------------- aviso de versão ---
// Uma consulta ao GitHub (releases/latest) por processo, em segundo plano desde
// a subida do servidor. Se houver versão MAIS NOVA, a primeira resposta ganha uma
// linha factual com o endereço FIXO da página de releases (nunca uma URL vinda da
// resposta da API). Sem rede, com erro ou em mais de 2 s: silêncio, a busca segue.
// Só o GitHub vê o IP de quem consulta; nada da pesquisa nem do caso sai daqui.
// Desligar: variável de ambiente TJRO_MCP_SEM_AVISO_ATUALIZACAO=1.
export const VERSAO = "1.7.15";
export const RELEASES_API =
  "https://api.github.com/repos/robertogecia/tjro-jurisprudencia-mcp/releases/latest";
export const RELEASES_PAGINA =
  "https://github.com/robertogecia/tjro-jurisprudencia-mcp/releases/latest";
const RE_TAG = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;

// true só se `outra` for estritamente maior que `atual`; qualquer formato estranho é false.
export function versaoMaisNova(atual, outra) {
  const a = RE_TAG.exec(String(atual ?? "").trim());
  const b = RE_TAG.exec(String(outra ?? "").trim());
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    const x = Number(a[i]), y = Number(b[i]);
    if (y !== x) return y > x;
  }
  return false;
}

// Devolve a tag nova (ex. "1.7.4") ou null. Nunca lança.
export async function checarVersaoNova({
  atual = VERSAO,
  fetchImpl = globalThis.fetch,
  env = process.env,
  timeoutMs = 2000,
} = {}) {
  try {
    if (env.TJRO_MCP_SEM_AVISO_ATUALIZACAO === "1" || typeof fetchImpl !== "function") return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(RELEASES_API, {
        signal: ctrl.signal,
        headers: { Accept: "application/vnd.github+json", "User-Agent": "tjro-jurisprudencia-mcp" },
      });
      if (!r.ok) return null;
      const tag = String((await r.json()).tag_name ?? "").trim();
      return versaoMaisNova(atual, tag) ? tag.replace(/^v/, "") : null;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

export const avisoAtualizacao = (novaVersao) =>
  `_Há uma versão mais nova desta extensão (v${novaVersao}; a instalada é a v${VERSAO})._ Baixe em: ${RELEASES_PAGINA}`;

let checagem = null;
let avisoDado = false;
export function iniciarChecagemVersao(opcoes) {
  if (!checagem) checagem = checarVersaoNova(opcoes);
  return checagem;
}
// Crédito + (uma vez) aviso de versão. Nunca atrasa a resposta além do timeout da checagem.
export async function comAvisos(texto) {
  const base = comCredito(texto);
  if (avisoDado) return base;
  const nova = await iniciarChecagemVersao();
  if (!nova) return base;
  avisoDado = true;
  return `${base}\n\n${avisoAtualizacao(nova)}`;
}
// ------------------------------------------------- ajuda quando algo falha ---
// Pedido do autor (22/09/2026): diante de um problema, a extensão sugere ao
// usuário (a) atualizar, se houver versão mais nova, e (b) relatar o erro. Os
// relatos que chegavam vinham sem versão, sem tipo de erro e às vezes com
// sugestões de contornar o filtro do tribunal. O link abre o formulário de issue
// do GitHub JÁ PREENCHIDO, para o usuário ler e decidir enviar — nada é enviado
// sozinho. O texto leva só dado técnico: versão, sistema, tipo do erro e o
// estado do limitador. NUNCA o texto da busca nem número de processo: a busca
// pode descrever o caso de um cliente, e issue no GitHub é pública.
export const ISSUES_NOVA = "https://github.com/robertogecia/tjro-jurisprudencia-mcp/issues/new";

export function tipoDoErro(mensagem) {
  const m = String(mensagem || "");
  if (/verificação de navegador/i.test(m)) return "desafio_navegador";
  if (/robotiza|suspeita de automação/i.test(m)) return "bloqueio_robotizacao";
  if (/evitando novas tentativas|Muitas consultas em pouco tempo/i.test(m)) return "limite_de_ritmo";
  if (/tempo esgotado/i.test(m)) return "timeout";
  if (/^HTTP \d{3}/i.test(m)) return "http_" + m.slice(5, 8);
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|certificate|CERT_/i.test(m)) return "rede_ou_certificado";
  return "outro";
}

// Erros que o próprio usuário resolve esperando não merecem relato.
const SEM_RELATO = new Set(["limite_de_ritmo"]);

export function linkRelato(tipo, agora = Date.now(), plataforma = process.platform) {
  let estado = "";
  try {
    const e = comTrava(() => lerEstado());
    const inc = e.incidentes || [];
    const tipos = inc.map((i) => i.tipo || "sem_tipo").slice(-5).join(", ") || "nenhum";
    const recentes = (e.requisicoes || []).filter((t) => agora - t <= 60_000).length;
    estado =
      `- Nível do limitador: ${e.indiceJanela + 1} de ${ESCADA_JANELA_MS.length}\n` +
      `- Consultas no último minuto: ${recentes}\n` +
      `- Bloqueios registrados: ${inc.length} (últimos tipos: ${tipos})\n`;
  } catch {
    estado = "- Estado do limitador: indisponível\n";
  }
  const titulo = `Erro ${tipo} na v${VERSAO}`;
  const corpo =
    "**Relato gerado pela extensão** (revise antes de enviar; não inclua nome de parte, " +
    "número de processo nem o texto da sua busca — issues são públicas)\n\n" +
    `- Versão: ${VERSAO}\n- Sistema: ${plataforma}\n- Tipo do erro: ${tipo}\n` + estado +
    "\n**O que eu estava fazendo:** \n\n" +
    "**A pesquisa funciona direto no site do TJRO (juris.tjro.jus.br), pelo navegador?** sim / não\n\n" +
    "**Desde quando acontece?** \n";
  return `${ISSUES_NOVA}?title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(corpo)}`;
}

// Monta a mensagem de erro final: a causa, e em seguida o que o usuário pode fazer.
// URL sempre no fim da linha e FORA do itálico: um "_" colado no endereço é
// incorporado ao link por vários leitores de markdown e leva a uma página 404.
export async function comAjudaNoErro(mensagem, opcoes = {}) {
  const tipo = tipoDoErro(mensagem);
  const partes = [];
  if (tipo === "desafio_navegador" || tipo === "bloqueio_robotizacao") {
    let sis = null;
    try {
      sis = bloqueioSistematico(opcoes.agora);
    } catch {
      sis = null;
    }
    const quando = sis ? new Date(sis.desde).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
    partes.push(
      "🚫 **O site do TJRO bloqueou esta pesquisa.** Quem bloqueou foi o sistema anti-robô do próprio " +
        "tribunal — não foi erro seu, nem falha de instalação."
    );
    partes.push(
      sis
        ? `Isso já aconteceu ${sis.vezes} vezes desde ${quando}, sempre com poucas pesquisas e sem nenhuma ` +
            "que tenha dado certo no meio: o tribunal está recusando as consultas desta extensão, e esperar " +
            "ou tentar de novo agora não resolve. Enquanto isso, a pesquisa funciona direto no site do " +
            "tribunal, pelo navegador: https://juris.tjro.jus.br"
        : "Pode ser passageiro. Aguarde alguns minutos antes de tentar de novo; se voltar a acontecer, " +
            "a pesquisa também funciona direto no site do tribunal: https://juris.tjro.jus.br"
    );
  }
  // Com o aviso leigo presente, o detalhe técnico é só a classificação: a mensagem
  // técnica antiga manda "aguardar alguns minutos", o que contradiz o aviso quando
  // o bloqueio é sistemático.
  partes.push(
    partes.length
      ? `Detalhe técnico: o portal respondeu com a página de bloqueio do filtro anti-robô (tipo: ${tipo}).`
      : `Erro ao consultar o TJRO: ${mensagem}`
  );
  let nova = null;
  try {
    nova = await iniciarChecagemVersao(opcoes.checagem);
  } catch {
    nova = null;
  }
  if (nova)
    partes.push(
      `_Há uma versão mais nova desta extensão (v${nova}; a instalada é a v${VERSAO}), e ela pode já ` +
        `corrigir este problema._ Baixe em: ${RELEASES_PAGINA}`
    );
  if (!SEM_RELATO.has(tipo))
    partes.push(
      `_Se o problema continuar${nova ? " depois de atualizar" : ""}, dá para relatá-lo ao autor por este ` +
        `formulário, que já vem preenchido só com dados técnicos (versão, sistema e tipo do erro) — ` +
        `revise antes de enviar, porque o relato fica público (é preciso ter conta gratuita no GitHub)._ ` +
        `Formulário: ${linkRelato(tipo)}`
    );
  return partes.join("\n\n");
}


export function _resetAvisoParaTeste() {
  checagem = null;
  avisoDado = false;
}

// O portal filtra UM órgão por vez: "1ª Câmara Cível,2ª Câmara Cível" devolve total 0
// (medido em 22/09/2026), e zero silencioso vira falso "não localizado".
const SEP_ORGAO = /[,;|]|\s(?:ou|e|or|and)\s/i;
export function orgaoMultiplo(orgao) {
  if (!orgao || !SEP_ORGAO.test(String(orgao))) return null;
  return (
    `orgao_colegiado aceita UM órgão só; "${orgao}" parece ter vários, e o portal devolveria 0 resultado (que não é "não localizado"). ` +
    "Faça uma busca por órgão, ou, melhor, busque sem filtro de órgão e confira a câmara no fecho de cada acórdão: " +
    "o cadastro erra o número da câmara com frequência, e julgados úteis de outra família (Câmara Especial, Turma Recursal) ficam de fora com o filtro."
  );
}
