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
import { camposAlheios, linhaCustodia, CUSTODIA_VERSAO, norm1 } from "./custodia.js";
import { linhaFavoravel } from "./partes.js";
import { fatosDoJulgado, FATOS_MAX, FATOS_MAX_SENT, RE_ALEGACAO, secoesDaEmenta, teseDaEmenta, desfechoDaSentenca, ROTULOS_SENTENCA } from "./posicao.js";
import { chaveRelator } from "./relatores.js";
import { anotarRequisicao, lerRitmo, contextoDoBloqueio, analisarBloqueios, formatarRelatorio } from "./bloqueios.js";

export const SITE = "https://juris.tjro.jus.br";
export const API = "https://juris-back.tjro.jus.br";
export const ENDPOINT = `${API}/search/varios_parametros/`;

// v1.30.0: identificação perante o portal. PADRÃO = honesta (a extensão se declara). O usuário pode, por decisão e risco
// próprios, escolher se identificar como navegador (Configurações da extensão › "Identificar-se como navegador", ou
// TJRO_MCP_IDENTIFICACAO=navegador). Não muda ritmo, limite nem disjuntor: o espaçamento mínimo e o teto continuam valendo.
export const UA_HONESTO = "Mozilla/5.0 (compatible; MCP-TJRO-Jurisprudencia/1.1)";
export const UA_NAVEGADOR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
export const modoNavegadorAtivo = (env = process.env) => {
  const v = String(env.TJRO_MCP_IDENTIFICACAO || "").trim().toLowerCase();
  return ["navegador", "true", "1", "sim", "on"].includes(v);
};
export const HEADERS = {
  Origin: SITE,
  Referer: SITE + "/",
  "Content-Type": "application/json",
  // v1.30.0: lido a cada requisição, para a escolha feita na conversa valer sem reiniciar a extensão
  get "User-Agent"() {
    return identidadeAtual === "navegador" ? UA_NAVEGADOR : UA_HONESTO;
  },
};

// v1.30.0: escolha do usuário, feita na conversa (ferramenta configurar_identificacao_tjro) e guardada em arquivo próprio,
// fora do estado do disjuntor. Valores: "navegador" | "honesta"; ausente = ainda não perguntado. A opção das
// Configurações da extensão, quando ligada, vale por cima do arquivo. Sob o test runner o arquivo é outro e a pergunta
// não é exigida, salvo se o teste pedir.
let arquivoEscolha = process.env.NODE_TEST_CONTEXT
  ? path.join(os.tmpdir(), `tjro-mcp-identificacao-teste-${process.pid}.json`)
  : path.join(os.homedir(), ".tjro-jurisprudencia-mcp-identificacao.json");
let exigirEscolha = !process.env.NODE_TEST_CONTEXT;
export function _setArquivoEscolhaParaTeste(caminho) {
  arquivoEscolha = caminho;
}
export function _setExigirEscolhaParaTeste(v) {
  exigirEscolha = !!v;
}
export function lerEscolha() {
  try {
    const d = JSON.parse(fs.readFileSync(arquivoEscolha, "utf-8"));
    return d?.escolha === "navegador" || d?.escolha === "honesta" ? d.escolha : null;
  } catch {
    return null;
  }
}
export const identificacaoEfetiva = (env = process.env) => (modoNavegadorAtivo(env) ? "navegador" : lerEscolha() || "honesta");
export const escolhaPendente = (env = process.env) => exigirEscolha && !modoNavegadorAtivo(env) && lerEscolha() === null;
export function gravarEscolha(escolha, agora = new Date()) {
  if (escolha !== "navegador" && escolha !== "honesta") throw new Error("escolha inválida");
  const tmp = `${arquivoEscolha}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ escolha, em: agora.toISOString() }));
  fs.renameSync(tmp, arquivoEscolha);
  identidadeAtual = identificacaoEfetiva();
  return identidadeAtual;
}

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
// Medido em 26/09/2026: o portal honra size=250 numa única resposta (2,8 MB); acima
// disso não foi testado. 250 julgados numa consulta custam o mesmo que 10 no ritmo.
export const POR_PAGINA_MAX = 250;

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
  // Proximidade (medido em 25/09/2026): `repetição dobro ~3` vira "repetição dobro"~3 —
  // as duas palavras a até 3 posições, em qualquer ordem. "repetição dobro" adjacente
  // = 16 docs; com ~3 = 3.208 (acha "repetição em dobro", "repetição do indébito em
  // dobro"). Só para frase de 2+ palavras, N de 1 a 20; fora disso é frase comum.
  const prox = /^(.+\S)\s*~(\d{1,2})$/.exec(t);
  if (prox && /\s/.test(prox[1].trim()) && +prox[2] >= 1 && +prox[2] <= 20)
    return `"${prox[1].trim().replace(LUCENE, "\\$1")}"~${+prox[2]}`;
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

/** Trecho de até `limite` caracteres que MOSTRA o primeiro termo destacado («...») do portal (espelho de _trecho_centrado;
 * medido em 15.089 resultados: o corte simples escondia todos os termos em 7%). */
export const trechoCentrado = (bruto, limite = 800) => {
  const t = limpar(bruto, 0);
  const i = t.indexOf("«");
  if (i < 0 || i + 40 <= limite) return limpar(bruto, limite);
  let ini = Math.max(0, i - 200);
  const sp = t.indexOf(" ", ini);
  if (ini && sp >= 0 && sp < i) ini = sp + 1;
  const cauda = t.slice(ini);
  const corte = cauda.length <= limite ? cauda : cauda.slice(0, limite).replace(/\s+\S*$/, "") + "…";
  return "…" + corte;
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

const RE_ACORDAM = /acordam\s+os\s+magistrados/gi;
const RE_PROCL = /(?:\bem,|decis[ãa]o:|taquigr[áa]ficas,)\s*["\u201c]?\s*(.*?)(?=\s*["\u201d]?\s*(?:Dou f[eé]|(?:Porto Velho|Ji-Paran[aá]|Cacoal|Vilhena|Ariquemes|Guajar[aá]-Mirim|Rolim de Moura|Jaru|Ouro Preto do Oeste),?\s*(?:\/\s*RO,?\s*)?\d{1,2}\b|$)|(?<=\d{4})\s+(?:Desembargador|Juiz)a?\b)/is;
/** Votação declarada na proclamação do FECHO do acórdão (espelho de _votacao_do_fecho, 08/10/2026): "unânime", "por maioria",
 * "por maioria, voto divergente prevaleceu" e/ou "com declaração de voto"; "" quando não reconhece (nunca chuta). */
export function votacaoDoFecho(texto) {
  const t = String(texto || "");
  let ult = -1;
  for (const m of t.matchAll(RE_ACORDAM)) ult = m.index;
  if (ult < 0) return "";
  const cauda = t.slice(ult, ult + 2200).replace(/[ \t\n\r\f\v]+/g, " ");
  const m = RE_PROCL.exec(cauda);
  if (!m) return "";
  const p = fold(m[1].slice(0, 900)).toUpperCase();
  let v;
  if (/\bMAIORIA\b|\bVENCID[OA]S?\b/.test(p)) {
    const diverg = /VOTO DIVERGENTE|VOTO-VISTA DIVERGENTE|\bDIVERGENCIA\b|LAVRARA O ACORDAO|VENCID[OA]S? (?:A|O|AS|OS) RELATOR/.test(p) && !/VENCIDO[^.]{0,40}DIVERGENTE/.test(p);
    v = diverg ? "por maioria, voto divergente prevaleceu" : "por maioria";
  } else if (/UNANIMIDADE|\bUNANIME\b|\bUNANIMEMENTE\b/.test(p)) v = "unânime";
  else return "";
  if (/DECLARACAO DE VOTO/.test(p)) v += ", com declaração de voto";
  return v;
}

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
// Fecho do acórdão ("acordam os Magistrados da(o) ... em, RECURSO PROVIDO, À
// UNANIMIDADE"): é o dispositivo do colegiado. Quando existe, só ele é lido —
// tudo antes é relatório, voto e histórico (medido em 26/09/2026 contra 80
// acórdãos rotulados às cegas: de 69% para 91% de concordância). O que vem depois
// de "VENCIDO(A)(S)" é o voto perdedor e sai. Em fecho de embargos de declaração,
// "PROVIDOS"/"NÃO PROVIDOS" é acolhimento/rejeição, e assim entra no conjunto.
// v1.30.0: a ÚLTIMA ocorrência do fecho por regex, como o Python (antes: a 1ª ocorrência decidia o prefixo e lastIndexOf achava
// outro ponto quando havia dois "ACORDAM OS …" na cauda — 2 respostas de 1.946 divergiam entre Node e Python).
const RE_FECHO_DISPOSITIVO = /ACORDAM\s+(?:OS|AS)\s+(?:MAGISTRADOS|DESEMBARGADORES|JUIZES|JUIZAS)/g;
export const trechoDispositivo = (cauda) => {
  let ultimo = -1;
  for (const m of cauda.matchAll(RE_FECHO_DISPOSITIVO)) ultimo = m.index;
  if (ultimo < 0) return null;
  let f = cauda.slice(ultimo);
  const v = f.search(/\bVENCID[OA]S?\b/);
  if (v > 40) f = f.slice(0, v);
  return f;
};
// v1.29.0: SENTENÇA nunca recebe rótulo de 2º grau (PROVIDO/ACOLHIDO…): "acolho o pedido",
// "rejeito a preliminar" e acórdão citado davam rótulo enganoso em 38% das 537 sentenças dos
// recibos (medição offline de 12/10/2026). Rótulo errado é pior que nenhum; o desfecho de
// 1º grau (procedente/improcedente) é outro extrator, ainda não publicado.
export const resultadoDe = (texto, tipo) => resultadoComOrigem(texto, tipo).conjunto;
const RE_EMBARGOS_DECL = /\bEMBARGOS (DE DECLARACAO|DECLARATORIOS|(NAO )?PROVIDOS?|REJEITADOS?|ACOLHIDOS?|PARCIALMENTE)/;
const RE_ED_PARCIAL = /\bPARCIALMENTE (ACOLH|PROVID)|\b(ACOLHID|PROVID)\w* (PARCIALMENTE|EM PARTE)|\bPARCIAL (ACOLHIMENTO|PROVIMENTO)/;
const RE_ED_OUTRO_OBJETO = /\b(AGRAVO|APELACAO|RECURSO|REMESSA|RECURSAL|RECURSOS)\b/;
// O qualificador "parcial" é dos EMBARGOS só quando a oração dele fala dos embargos (ou de ninguém mais): "embargos acolhidos, ... para dar parcial
// provimento ao recurso" e "embargos acolhidos e agravo parcialmente provido" são acolhimento integral dos embargos.
export const parcialDosEmbargos = (cauda) =>
  String(cauda || "").split(/[,.;:]/).some((seg) => RE_ED_PARCIAL.test(seg) && (!RE_ED_OUTRO_OBJETO.test(seg) || /\bEMBARGOS( DE DECLARACAO)?( \w+)? (PARCIALMENTE|EM PARTE)|\bEMBARGOS( DE DECLARACAO)? (ACOLHID|PROVID)\w* (PARCIALMENTE|EM PARTE)/.test(seg)));
const RE_EMBARGOS_OUTROS = /\bEMBARGOS (DE TERCEIRO|A EXECUCAO|MONITORIOS|INFRINGENTES)/;
// {conjunto, origem}: origem = "fecho" (proclamação do acórdão), "ementa-IV" (seção IV da ementa
// CNJ, só em documento do tipo EMENTA, sem fecho), "cauda" (últimos 2.500 caracteres) ou "nenhuma".
// v1.29.0 (H05): na EMENTA do modelo CNJ, as seções I e III narram a decisão recorrida e o
// recurso anterior ("recurso provido") — e a classe do índice de embargos de declaração é a do
// processo principal (APELAÇÃO), então ehEmbargos falhava e a ementa de ED recebia o resultado
// da apelação. Lendo só a seção IV (dispositivo e tese) e reconhecendo "embargos de declaração"
// nela, o rótulo muda em ~6,7% das ementas CNJ sem fecho (medição offline 12/10/2026).
export const resultadoComOrigem = (texto, tipo) => {
  // v1.30.0: RELATÓRIO também não tem dispositivo: a cauda narra a decisão recorrida e o histórico. Nos avisos de
  // "resultado oposto" 25 de 25 casos com RELATÓRIO eram falsos (2 rotuladores cegos), e o relatório sujava o rótulo do julgamento.
  if (["SENTENÇA", "RELATÓRIO"].includes(String(tipo || "").toUpperCase())) return { conjunto: new Set(), origem: "nenhuma", embargos: false };
  const t = fold(texto).toUpperCase();
  const caudaToda = t.length > 2500 ? t.slice(-2500) : t;
  const fecho = trechoDispositivo(caudaToda);
  let cauda = fecho || caudaToda;
  let origem = fecho ? "fecho" : "cauda";
  let embargos = !!fecho && RE_EMBARGOS_DECL.test(fecho) && !RE_EMBARGOS_OUTROS.test(fecho);
  if (!fecho && String(tipo || "").toUpperCase() === "EMENTA") {
    const iv = secoesDaEmenta(String(texto || ""), 0, String(texto || "").length).find((x) => x.nome === "dispositivo e tese" || x.nome === "dispositivo");
    if (iv) {
      // Só a linha de resultado: a tese enunciada depois de "Tese(s) de julgamento" cita "embargos
      // de declaração" e "provimento" de outros contextos (validação cega 12/10/2026).
      cauda = fold(String(texto).slice(iv.a, iv.b)).toUpperCase().replace(/\bTESES? DE JULGAMENTO\b[^]*$/, "");
      origem = "ementa-IV";
      // É julgamento de embargos? Decide o cabeçalho + seção I (caso em exame) + a linha de
      // resultado — nunca as razões (III) nem a tese, que citam ED de passagem (prequestionamento).
      const secs = secoesDaEmenta(String(texto || ""), 0, String(texto || "").length);
      const fimI = secs.find((x) => x.nome === "caso em exame");
      const cabeca = fold(String(texto).slice(0, fimI ? fimI.b : Math.min(iv.a, 400))).toUpperCase();
      embargos = (RE_EMBARGOS_DECL.test(cauda) || RE_EMBARGOS_DECL.test(cabeca)) && !RE_EMBARGOS_OUTROS.test(cauda) && !RE_EMBARGOS_OUTROS.test(cabeca);
    }
  }
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
  // "embargos NÃO acolhidos" é rejeição, não acolhimento (validação cega 12/10/2026).
  if (/\bREJEIT|\bNAO ACOLH/.test(cauda)) r.add("REJEITADO");
  if (/(?<!NAO )\bACOLH/.test(cauda)) r.add("ACOLHIDO");
  // PARCIAL é qualificador do PROVIDO (o par OPOSTOS não muda): "parcial
  // provimento", "parcialmente provido", "provido em parte".
  if (/\bPARCIAL(MENTE)? PROVI|\bPARCIAL PROVIMENTO|\bPROVIMENTO PARCIAL|\bPROVID[OA]S? EM PARTE|\bPROVID[OA]S? PARCIALMENTE/.test(cauda)) r.add("PARCIAL");
  if (embargos) {
    // v1.31.0: "embargos PARCIALMENTE acolhidos/providos" (ou "acolhidos em parte") guarda o qualificador PARCIAL: o esquema só
    // tinha PARCIAL para provimento e esses embargos viravam "acolhido" (6 das 12 divergências da amostra cega de 12/10/2026).
    const parcialED = parcialDosEmbargos(cauda);
    // "EMBARGOS PROVIDOS" = acolhidos; "EMBARGOS NÃO PROVIDOS" = rejeitados. Com "ACOLHIDOS"
    // explícito, "negar provimento ao recurso" é o efeito infringente sobre o recurso
    // originário, não rejeição dos embargos (validação cega 12/10/2026).
    if (r.has("PROVIDO")) { r.delete("PROVIDO"); r.delete("PARCIAL"); r.add("ACOLHIDO"); }
    if (parcialED && r.has("ACOLHIDO") && !r.has("REJEITADO")) r.add("PARCIAL");
    // No fecho do acórdão isso NÃO vale: "embargos do autor acolhidos, do réu não providos" é ambíguo
    // (21 de 21 nos acórdãos rotulados às cegas em 12/10/2026) — só na linha de resultado da ementa.
    if (r.has("DESPROVIDO")) { r.delete("DESPROVIDO"); if (!(origem === "ementa-IV" && r.has("ACOLHIDO"))) r.add("REJEITADO"); }
  }
  return { conjunto: r, origem: r.size ? origem : "nenhuma", embargos };
};
// Lado de um par declarado por um documento; null se nenhum ou se ambos (ambíguo).
export const ladoDe = (conjunto, [a, b]) =>
  conjunto.has(a) && conjunto.has(b) ? null : conjunto.has(a) ? a : conjunto.has(b) ? b : null;

export const ROTULOS_RESULTADO = { PROVIDO: "provido", PARCIAL: "parcialmente provido", DESPROVIDO: "desprovido", ACOLHIDO: "acolhido", REJEITADO: "rejeitado" };

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
// Rótulo único de um julgamento a partir do conjunto de resultados declarados:
// PROVIDO/PARCIAL/DESPROVIDO/ACOLHIDO/REJEITADO, ou null (sem sinal ou ambíguo).
// Prioridade entre os pares (medido em 26/09/2026 contra 80 acórdãos rotulados às
// cegas): fora de embargos de declaração, decide o par do MÉRITO (provido ×
// desprovido) — "preliminar rejeitada" e "acolho a preliminar" disparavam o par
// acolhido × rejeitado e mandavam o julgamento para "ambíguo" sem ser. Em embargos
// (classe), o par acolhido × rejeitado vem primeiro, porque a cauda costuma repetir
// o histórico do recurso julgado ("recurso provido"). Provido E desprovido no mesmo
// texto continua ambíguo (red team 04/09/2026).
const ehEmbargos = (classe) => /EMBARGOS DE DECLARA/i.test(String(classe || ""));
// v1.30.0: `embargosDetectado` vem do próprio texto (fecho "EMBARGOS … REJEITADOS" ou ementa de ED): a classe do índice de um ED costuma ser a do
// processo principal (APELAÇÃO), e sem isso "embargos rejeitados" + "nego provimento" do voto viravam "desprovido" (7 dos 9 erros restantes da amostra cega).
export const rotuloDoConjunto = (conjunto, classe = "", embargosDetectado = false) => {
  const ordem = ehEmbargos(classe) || embargosDetectado ? [OPOSTOS[1], OPOSTOS[0]] : [OPOSTOS[0], OPOSTOS[1]];
  for (const par of ordem) {
    const [a, b] = par;
    if (conjunto.has(a) && conjunto.has(b)) return null; // os dois lados do mesmo par: ambíguo, não força
    const lado = ladoDe(conjunto, par);
    if (lado) return (lado === "PROVIDO" || lado === "ACOLHIDO") && conjunto.has("PARCIAL") ? "PARCIAL" : lado;
  }
  return null;
};
// Julgamento = união dos documentos do mesmo nº + data. v1.30.0: se algum documento traz o FECHO do acórdão com resultado, só o fecho vale
// (o dispositivo do colegiado); voto, ementa e histórico sujavam o rótulo (J07: fecho "RECURSO PROVIDO", voto citando "parcial provimento" de outro ponto).
export const novoJulgamento = (classe = "") => ({ conjunto: new Set(), fecho: null, embargos: false, classe });
export function somarResultado(j, r) {
  for (const x of r.conjunto) j.conjunto.add(x);
  if (r.origem === "fecho" && r.conjunto.size) { j.fecho = j.fecho || new Set(); for (const x of r.conjunto) j.fecho.add(x); }
  if (r.embargos) j.embargos = true;
  return j;
}
// O fecho só manda quando traz o resultado do MÉRITO (provido/desprovido/parcial) ou, em embargos, acolhido/rejeitado. "PRELIMINAR REJEITADA/ACOLHIDA"
// sozinha no fecho não é o resultado: ali a ementa/voto ainda diz o mérito (validação cega 13/10/2026: 4 regressões antes desta regra).
const usaFecho = (j) => !!(j.fecho && j.fecho.size && (["PROVIDO", "DESPROVIDO", "PARCIAL"].some((x) => j.fecho.has(x)) || (j.embargos && (j.fecho.has("ACOLHIDO") || j.fecho.has("REJEITADO")))));
export const rotuloDoJulgamento = (j) => rotuloDoConjunto(usaFecho(j) ? j.fecho : j.conjunto, j.classe, j.embargos);
const PLURAL_SENTENCA = { PROCEDENTE: "procedentes", PARCIAL: "parcialmente procedentes", IMPROCEDENTE: "improcedentes", EXTINTO: "extintas sem resolução do mérito", HOMOLOGADO: "com acordo ou desistência homologados" };
// v1.31.0: desfecho de 1º grau de um documento do tipo SENTENÇA (texto já limpo); null para outros tipos ou sem desfecho identificável.
export const desfechoDeSentenca = (textoLimpo, tipo, classe = "") => (String(tipo || "").toUpperCase() === "SENTENÇA" ? desfechoDaSentenca(norm1(textoLimpo), classe) : null);
const CONTAGEM_VAZIA = () => ({ PROVIDO: 0, PARCIAL: 0, DESPROVIDO: 0, ACOLHIDO: 0, REJEITADO: 0, sem: 0 });
export function resumoResultadosPagina(hits) {
  const porJulgamento = new Map();
  hits.forEach((h, i) => {
    const s = h._source || {};
    const proc = String(s.nr_processo || "").replace(/\D/g, "");
    const data = String(s.dtjulgamento || "");
    const chave = proc && data ? `${proc}|${data}` : `#${i}`;
    if (!porJulgamento.has(chave)) porJulgamento.set(chave, { ...novoJulgamento(s.ds_classe_judicial || ""), relator: relator(s), orgao: orgao(s), ano: String(s.dtjulgamento || "").slice(0, 4) || "?", tipos: new Set(), desfecho: null });
    const j = porJulgamento.get(chave); const texto = limpar(s.ds_modelo_documento || "", 0);
    j.tipos.add(String(s.tipo || "").toUpperCase());
    somarResultado(j, resultadoComOrigem(texto, s.tipo));
    const d = desfechoDeSentenca(texto, s.tipo, s.ds_classe_judicial); if (d && !j.desfecho) j.desfecho = d;
  });
  // v1.31.0: julgamento só de SENTENÇA (1º grau) não entra na contagem de 2º grau (virava "sem resultado identificável"): tem contagem própria.
  const sentencas = { contagem: {}, sem: 0, total: 0 };
  for (const [k, j] of [...porJulgamento]) {
    if (j.tipos.size === 1 && j.tipos.has("SENTENÇA")) {
      sentencas.total += 1; if (j.desfecho) sentencas.contagem[j.desfecho] = (sentencas.contagem[j.desfecho] || 0) + 1; else sentencas.sem += 1;
      porJulgamento.delete(k);
    }
  }
  const contagem = { PROVIDO: 0, PARCIAL: 0, DESPROVIDO: 0, ACOLHIDO: 0, REJEITADO: 0 };
  let semResultado = 0;
  // Quebra por relator, órgão (do ÍNDICE, que erra a câmara — indício) e ano:
  // é o mesmo dado, só agrupado, para ver tendência e quem decide o quê.
  const porRelatorChave = new Map(), grafias = new Map(), porOrgao = new Map(), porAno = new Map();
  const soma = (mapa, k, r) => {
    if (!mapa.has(k)) mapa.set(k, CONTAGEM_VAZIA());
    mapa.get(k)[r || "sem"] += 1;
  };
  for (const j of porJulgamento.values()) {
    const r = rotuloDoJulgamento(j);
    if (r) contagem[r] += 1;
    else semResultado += 1;
    // v1.29.0 (H07): o índice guarda o MESMO relator em 2–3 grafias (caixa, acento); a quebra
    // os unia como se fossem dois e perdia linhas abaixo do mínimo. Chave sem caixa nem acento.
    const ck = chaveRelator(j.relator) || j.relator;
    soma(porRelatorChave, ck, r);
    if (!grafias.has(ck)) grafias.set(ck, new Map());
    grafias.get(ck).set(j.relator, (grafias.get(ck).get(j.relator) || 0) + 1);
    soma(porOrgao, j.orgao, r);
    soma(porAno, j.ano, r);
  }
  // Rótulo: a grafia mais frequente (empate: ordem de código, igual no Python), com a contagem de grafias unidas.
  const porRelator = new Map();
  for (const [ck, c] of porRelatorChave) {
    const gs = [...grafias.get(ck).entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    porRelator.set(gs.length > 1 ? `${gs[0][0]} [grafias unidas: ${gs.length}]` : gs[0][0], c);
  }
  return { contagem, semResultado, totalJulgamentos: porJulgamento.size, porRelator, porOrgao, porAno, sentencas };
}

// Linha "Fulano: 5 providos · 2 parcialmente providos · 3 desprovidos (2 sem resultado)" por chave,
// só chaves com 3+ julgamentos, ordenadas por volume; no máximo `max` linhas.
export function linhasQuebra(mapa, max = 8, minimo = 3) {
  const ordem = ["PROVIDO", "PARCIAL", "DESPROVIDO", "ACOLHIDO", "REJEITADO"];
  return [...mapa.entries()]
    .map(([k, c]) => [k, c, ordem.reduce((n, r) => n + c[r], 0) + c.sem])
    .filter(([, , n]) => n >= minimo)
    // desempate por ORDEM DE CÓDIGO (igual ao sorted() do Python): localeCompare põe "Á" antes de "F" e o Python depois (v1.30.0)
    .sort((a, b) => b[2] - a[2] || (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0))
    .slice(0, max)
    .map(([k, c, n]) => {
      const partes = ordem.filter((r) => c[r] > 0).map((r) => `${c[r]} ${ROTULOS_RESULTADO[r]}${c[r] > 1 ? "s" : ""}`);
      return `${k} (${n}): ${partes.join(" · ") || "—"}${c.sem ? ` (${c.sem} sem resultado)` : ""}`;
    });
}

// Filtro de resultado, 100% no cliente, sobre os hits já trazidos: fica quem
// pertence a um julgamento cujo rótulo é o pedido. "sem" = sem resultado identificável.
export const ROTULOS_FILTRO = { provido: "PROVIDO", parcial: "PARCIAL", desprovido: "DESPROVIDO", acolhido: "ACOLHIDO", rejeitado: "REJEITADO", sem: null };
// v1.33.0: `resultado=` também filtra SENTENÇAS pelo desfecho lido do dispositivo (o relato de uso de 14/10/2026 não achava como separar procedentes de improcedentes).
export const FILTRO_SENTENCA = { procedente: "PROCEDENTE", parcialmente_procedente: "PARCIAL", improcedente: "IMPROCEDENTE", extinto: "EXTINTO", homologado: "HOMOLOGADO" };
export function filtrarPorResultado(hits, rotulo) {
  if (rotulo in FILTRO_SENTENCA) {
    const fica = hits.filter((h) => {
      const x = h._source || {};
      return desfechoDeSentenca(limpar(x.ds_modelo_documento || "", 0), x.tipo, x.ds_classe_judicial) === FILTRO_SENTENCA[rotulo];
    });
    return { hits: fica, removidos: hits.length - fica.length };
  }
  if (!(rotulo in ROTULOS_FILTRO)) return { hits, removidos: 0 };
  const alvo = ROTULOS_FILTRO[rotulo];
  const julgs = new Map();
  const chaveDe = (h, i) => {
    const s = h._source || {};
    const proc = String(s.nr_processo || "").replace(/\D/g, "");
    const data = String(s.dtjulgamento || "");
    return proc && data ? `${proc}|${data}` : `#${i}`;
  };
  hits.forEach((h, i) => {
    const k = chaveDe(h, i);
    if (!julgs.has(k)) julgs.set(k, novoJulgamento((h._source || {}).ds_classe_judicial || ""));
    somarResultado(julgs.get(k), resultadoComOrigem(limpar((h._source || {}).ds_modelo_documento || "", 0), (h._source || {}).tipo));
  });
  const fica = hits.filter((h, i) => rotuloDoJulgamento(julgs.get(chaveDe(h, i))) === alvo);
  return { hits: fica, removidos: hits.length - fica.length };
}

// Panorama do RESULTADO INTEIRO (não da página): o portal devolve, em toda busca,
// agregações fixas sobre todos os documentos que casaram — câmara/vara, gabinete,
// classe e data de julgamento (medido em 26/09/2026: a soma dos buckets = total).
// Custa zero requisição. Órgão e gabinete são os do CADASTRO (que erra a câmara).
export function formatPanorama(data) {
  const ag = data.aggregations || {};
  const total = ((data.hits || {}).total || {}).value || 0;
  const buckets = (k) => ((ag[k] || {}).buckets || []).filter((b) => b && b.doc_count > 0);
  const top = (k, n) =>
    buckets(k)
      .map((b) => [(Array.isArray(b.key) ? b.key.join(" ") : String(b.key)).trim() || "(sem cadastro)", b.doc_count])
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) // ordem de código, igual ao Python
      .slice(0, n)
      .map(([k2, c]) => `${k2} ${c}`)
      .join(" · ");
  const anos = new Map();
  for (const b of buckets("datas_julgamento")) {
    const ano = typeof b.key === "number" ? new Date(b.key).getUTCFullYear() : String(b.key_as_string || b.key).slice(0, 4);
    anos.set(ano, (anos.get(ano) || 0) + b.doc_count);
  }
  const porAno = [...anos.entries()].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0)).map(([a, c]) => `${a}: ${c}`).join(" · ");
  const linhas = [];
  const org = top("orgaos_julgadores_colegiados", 6);
  const gab = top("orgaos_julgadores", 6);
  const cls = top("classes_judiciais", 5);
  if (org) linhas.push(`- Órgãos (cadastro): ${org}`);
  if (gab) linhas.push(`- Gabinetes/varas (cadastro): ${gab}`);
  if (cls) linhas.push(`- Classes: ${cls}`);
  if (porAno) linhas.push(`- Por ano de julgamento: ${porAno}`);
  if (!linhas.length) return "";
  return (
    `\n**Panorama dos ${total} documentos que casaram (índice, não só esta página; zero consulta extra):**\n` +
    linhas.join("\n") +
    "\n_Câmara e gabinete são do CADASTRO (câmara ATUAL do processo, não a que julgou). Serve para escolher filtros; nunca é posição sobre a tese._"
  );
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
// Vara/Juizado/Núcleo de 1º grau ("Comarca - Vara"), não câmara/turma de 2º grau.
export function ehOrgao1oGrau(orgao) {
  if (!orgao || /turma|c[âa]mara|pleno|tribunal|conselho/i.test(orgao)) return false;
  return /\bvara\b|juizado|n[úu]cleo|ju[íi]zo| - /i.test(orgao);
}

// Exclusão (25/09/2026): termos que NÃO podem aparecer. Sonda real: `"dano moral" AND
// negativação` = 8.924 docs (7 dos 20 primeiros citavam "energia"); com `NOT energia`
// = 7.284 e 0 de 20. Mesmo tratamento seguro dos grupos (frase entre aspas, escape),
// no máximo EXCLUIR_MAX termos. Corta também o julgado certo que cite o termo de
// passagem: serve para tirar ruído evidente, nunca na única busca de uma tese.
export const EXCLUIR_MAX = 8;
export function montarExclusao(excluir) {
  if (!Array.isArray(excluir)) return "";
  const termos = [...new Set(excluir.slice(0, EXCLUIR_MAX).map(termoParaQuery).filter(Boolean))];
  return termos.length ? `(${termos.join(" OR ")})` : "";
}

export function buildBuscaBody(o) {
  // Escapar ANTES de aspear: na ordem inversa as aspas da frase exata viram
  // \" literais e a API trata os termos como busca solta (OR).
  const c = String(o.consulta ?? "").trim();
  const q = o.termoExato && c ? `"${escapeLucene(c)}"` : escapeLucene(c);
  // Consulta livre e grupos se somam por AND; a livre vai parentizada para não
  // ser reinterpretada pela falta de precedência do query_string.
  const g = montarGrupos(o.grupos);
  const base = g ? (q ? `(${q}) AND ${g}` : g) : q;
  const x = montarExclusao(o.excluir);
  const query = base && x ? `(${base}) AND NOT ${x}` : base;
  // A API espera "tipo" como string ("A,B" p/ OR); array JSON zera os resultados,
  // mesmo com 1 único elemento.
  const fields = { query, tipo: o.tipo.join(",") };
  if (o.grau === 1 || o.grau === 2) fields.grau_jurisdicao = String(o.grau);
  // O índice grava classes em CAIXA ALTA e o filtro .raw é sensível a caixa.
  if (o.classe) fields["ds_classe_judicial.raw"] = o.classe.toUpperCase();
  // 1º grau (24/09/2026): a vara vive em ds_orgao_julgador ("Porto Velho - 4ª Vara
  // Cível"); ds_orgao_julgador_colegiado vem VAZIO na sentença.
  if (o.orgaoColegiado)
    fields[ehOrgao1oGrau(o.orgaoColegiado) ? "ds_orgao_julgador.raw" : "ds_orgao_julgador_colegiado.raw"] = o.orgaoColegiado;
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
  // 08/10/2026: em SENTENÇA (1º grau) o juiz vive em ds_nome.raw (nome_relator_* vêm vazios); só vale quando TODOS os tipos pedidos são SENTENÇA.
  if (o.relator) fields[o.tipo.length && o.tipo.every((t) => String(t).toUpperCase() === "SENTENÇA") ? "ds_nome.raw" : "nome_relator_acordao.raw"] = o.relator;
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

// Resposta corrompida do filtro (24/09/2026): para a identificação desta extensão o
// portal devolve a página "STIC - Página Bloqueada" (a mesma de julho), agora com
// `Connection: close\0` (byte NUL) nos cabeçalhos — o Node recusa ("Response does not
// match the HTTP/1.1 protocol") e até o curl sai com erro 8. É recusa do filtro, não
// rede nem ritmo.
export const RESPOSTA_CORROMPIDA =
  "O portal do TJRO devolveu a página de bloqueio do filtro de segurança, com um cabeçalho defeituoso que o " +
  "programa não consegue ler: é o filtro do tribunal recusando a identificação desta extensão. Isso NÃO é excesso de " +
  "consultas nem falha da sua internet: esperar não resolve, e a extensão não contorna a proteção do " +
  "tribunal. A pesquisa continua funcionando no navegador (juris.tjro.jus.br). Para acesso pela " +
  'extensão, o caminho é pedir liberação ao tribunal: suporte@tjro.jus.br, assunto "Acesso Bloqueado".';
const ehRespostaCorrompida = (e) =>
  /HTTP\/1\.1 protocol|Invalid header|^HPE_/i.test(`${e?.cause?.code || ""} ${e?.cause?.message || ""}`.trim());

// v1.33.0: o portal responde HTTP 500 a consultas grandes (6 de 6 com 3 grupos e 11 a 17 termos em 14/10/2026; com 2 grupos e menos termos passou).
export const contaTermosDaConsulta = (grupos) => (Array.isArray(grupos) ? grupos.reduce((n, g) => n + (Array.isArray(g) ? g.length : 1), 0) : 0);
export function dicaConsultaGrande(mensagem, grupos) {
  const nG = Array.isArray(grupos) ? grupos.length : 0, nT = contaTermosDaConsulta(grupos);
  if (!/HTTP 500/.test(String(mensagem || "")) || (nG < 3 && nT < 10)) return "";
  return ` O portal respondeu 500 a uma consulta grande (${nG} grupos, ${nT} termos): consultas grandes falharam com mais frequência, mas o gatilho exato não está provado (não é pontuação nem só o número de termos). Reduza para 2 grupos de poucos termos, ou divida em duas buscas e junte os resultados.`;
}
// Resultado muito grande é desviado pelo cliente para um arquivo que o subagente não lê; corta no limite de um resultado e avisa.
export const SAIDA_MAX_CHARS = 80000;
export function limitarSaida(texto, max = SAIDA_MAX_CHARS) {
  const t = String(texto || "");
  if (t.length <= max) return t;
  const corte = t.lastIndexOf("\n## ", max);
  const ate = corte > max / 4 ? corte : max;
  const mostrados = (t.slice(0, ate).match(/\n## /g) || []).length;
  const total = (t.match(/\n## /g) || []).length;
  return `${t.slice(0, ate)}\n\n[SAÍDA CORTADA: ${mostrados} de ${total} resultados cabem aqui (limite de ${Math.round(max / 1000)} mil caracteres, para o resultado não ser desviado para arquivo). Repita com modo="compacto" ou por_pagina menor, ou peça a página seguinte.]\n`;
}
export const msgErro = (e) =>
  e.name === "TimeoutError"
    ? "tempo esgotado após 45s — o portal JURIS pode estar lento; tente novamente"
    : ehRespostaCorrompida(e)
      ? RESPOSTA_CORROMPIDA
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
      "resolve, e a extensão não executa esse desafio (trocar a identificação não o resolve). " +
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
      'assunto "Acesso Bloqueado".' +
      (identidadeAtual === "honesta" ? AVISO_OPCAO_NAVEGADOR : "")
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

// v1.11.0: a PAUSA do disjuntor é por IDENTIFICAÇÃO. Num mesmo computador convivem a extensão pública (identifica-se
// como extensão: "honesta") e, às vezes, uma build de uso pessoal que se identifica como navegador ("navegador").
// O filtro do TJRO recusa a primeira pela identificação, não pelo volume; esse bloqueio não diz nada sobre a segunda e
// não deve pará-la por 20 minutos (aconteceu em 02/10/2026: um teste da pública armou a pausa da pessoal). O que
// continua COMPARTILHADO, por ser o mesmo IP perante o portal: a janela de volume, o espaçamento e a escada. Por
// identificação: bloqueadoAte, backoffMs e ultimoSucessoEm. O diário de incidentes é um só, e cada incidente leva a
// identificação em que ocorreu; incidente sem etiqueta (arquivo antigo) vale para quem ler.
// Oferecido quando o filtro recusa a identificação honesta. É decisão do usuário, e o aviso diz o que ele assume.
export const AVISO_OPCAO_NAVEGADOR =
  "\n\nOpção SUA (desligada por padrão): nas Configurações da extensão há \"Identificar-se como navegador\" (ou, na conversa, a ferramenta configurar_identificacao_tjro, só depois de o usuário aceitar). Ela faz a extensão " +
  "se apresentar ao portal como um navegador comum, o que pode passar pelo filtro que recusa a identificação honesta. Mas é um " +
  "disfarce: o tribunal pode considerar uso indevido do portal e, se restringir o acesso (por exemplo, bloqueando o IP da sua " +
  "rede), o risco é inteiramente seu — e de quem divide a rede com você. O ritmo mínimo entre consultas continua valendo. " +
  "Ative só se aceitar isso; para voltar atrás, desligue a opção (ou peça configurar_identificacao_tjro com escolha=honesta).";
export const AVISO_MODO_NAVEGADOR =
  "_⚠️ Identificação de navegador ATIVA (escolha sua): o portal do TJRO pode tratar este tráfego como " +
  "uso indevido e o risco é seu. Para voltar à identificação honesta, desligue a opção nas Configurações ou peça configurar_identificacao_tjro com escolha=honesta._";
export const AVISO_ESCOLHA_PENDENTE =
  "ESCOLHA PENDENTE antes da primeira consulta ao TJRO (nada foi consultado). [tipo=escolha_pendente]\n" +
  "PERGUNTE ao usuário, em linguagem simples, e espere a resposta dele nesta conversa (não decida por ele, nem por inferência): " +
  "o portal do TJRO costuma recusar consultas que se identificam como extensão, e a consulta falha já na primeira requisição. " +
  "Se o usuário aceitar, a extensão passa a se apresentar ao portal como um navegador comum, de forma permanente, até ele desfazer. " +
  "É um disfarce: o tribunal pode considerar uso indevido do portal e, se restringir o acesso (por exemplo, bloqueando o IP da rede " +
  "dele), o risco é inteiramente do usuário e de quem divide a rede com ele. O ritmo mínimo entre consultas continua valendo.\n" +
  "Se você é um subagente (sem usuário para perguntar), PARE: devolva esta mensagem inteira ao agente principal e não escolha por ele.\n" +
  "Se ele disser SIM: chame configurar_identificacao_tjro com escolha=\"navegador\" e repita a consulta. " +
  "Se disser NÃO: chame com escolha=\"honesta\" (a extensão continua se declarando; a consulta pode ser bloqueada pelo portal, e o " +
  "caminho é o site juris.tjro.jus.br ou pedir liberação a suporte@tjro.jus.br). A escolha fica gravada e a pergunta não se repete.";
export const identidadeDoUA = (ua) => (/compatible;\s*MCP-TJRO/i.test(String(ua || "")) ? "honesta" : "navegador");
let identidadeAtual = identificacaoEfetiva();
export const identidadeDoDisjuntor = () => identidadeAtual;
export function _setIdentidadeParaTeste(id) {
  identidadeAtual = id === "navegador" ? "navegador" : "honesta";
}
const IDENTIDADES = ["honesta", "navegador"];
const POR_IDENTIDADE_PADRAO = { bloqueadoAte: 0, backoffMs: 0, ultimoSucessoEm: 0 };

// Só para uso em testes: redireciona a persistência pra um arquivo temporário,
// pra não gravar por cima do estado real aprendido do usuário.
export function _setArquivoEstadoParaTeste(caminho) {
  arquivoEstadoDisjuntor = caminho;
}

const MAX_INCIDENTES = 20; // histórico curto: serve para diagnosticar padrão, não para auditoria

const ESTADO_PADRAO = {
  versao: 3,
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

// Estado BRUTO do arquivo, saneado: campos compartilhados + `porIdentidade`. Arquivo da v2 (campos soltos, sem
// `porIdentidade`) migra assim: a pausa e o recuo valem para as DUAS identificações (conservador: uma pausa em curso
// na hora da atualização continua), e o último sucesso vai só para "navegador" (a pública nunca mais teve sucesso).
function lerEstadoBruto() {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(arquivoEstadoDisjuntor, "utf-8"));
  } catch {
    d = null; // 1ª execução, arquivo ilegível ou sem permissão
  }
  const agora = Date.now();
  if (!d || typeof d !== "object") d = {};
  // Saneamento contra relógio que andou (para frente ou para trás) e contra valores
  // absurdos num arquivo corrompido — sem isso, um bloqueadoAte inflado trava a
  // ferramenta por horas e um backoff negativo faz o disjuntor nunca engatar.
  const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
  const saneia = (x) => ({
    bloqueadoAte: Math.max(0, Math.min(num(x?.bloqueadoAte, 0), agora + BACKOFF_MAXIMO_MS)),
    backoffMs: Math.max(BACKOFF_INICIAL_MS, Math.min(num(x?.backoffMs, BACKOFF_INICIAL_MS), BACKOFF_MAXIMO_MS)),
    ultimoSucessoEm: Math.max(0, Math.min(num(x?.ultimoSucessoEm, 0), agora + MARGEM_FUTURO_MS)),
  });
  const temPorIdentidade = d.porIdentidade && typeof d.porIdentidade === "object";
  const porIdentidade = {};
  for (const id of IDENTIDADES) {
    porIdentidade[id] = temPorIdentidade
      ? saneia(d.porIdentidade[id])
      : saneia(id === "navegador" ? d : { ...d, ultimoSucessoEm: 0 });
  }
  const { bloqueadoAte: _b, backoffMs: _k, ultimoSucessoEm: _u, ...resto } = d;
  return {
    ...ESTADO_PADRAO,
    ...resto,
    versao: ESTADO_PADRAO.versao,
    porIdentidade,
    requisicoes: (Array.isArray(d.requisicoes) ? d.requisicoes : [])
      .filter(Number.isFinite)
      .filter((t) => t <= agora + MARGEM_FUTURO_MS),
    proximoLivreEm: Math.min(num(d.proximoLivreEm, 0), agora + MARGEM_FUTURO_MS),
    indiceJanela: Math.max(0, Math.min(num(d.indiceJanela, 0), ESCADA_JANELA_MS.length - 1)),
    incidentes: Array.isArray(d.incidentes) ? d.incidentes.slice(-MAX_INCIDENTES) : [],
  };
}

// Visão PLANA do estado para a identificação desta instalação: é o objeto que o resto do código lê e altera
// (e.bloqueadoAte, e.backoffMs, e.ultimoSucessoEm), como antes da v1.11.0.
function visaoDoEstado(bruto, id = identidadeAtual) {
  const { porIdentidade: _p, ...compartilhado } = bruto;
  return { ...compartilhado, ...POR_IDENTIDADE_PADRAO, ...bruto.porIdentidade[id] };
}

// Devolve ao bruto o que a visão alterou: os três campos voltam só para a identificação dona; o resto é comum.
function fundirVisao(bruto, visao, id = identidadeAtual) {
  const { bloqueadoAte, backoffMs, ultimoSucessoEm, ...compartilhado } = visao;
  return {
    ...bruto,
    ...compartilhado,
    porIdentidade: { ...bruto.porIdentidade, [id]: { bloqueadoAte, backoffMs, ultimoSucessoEm } },
  };
}

function lerEstado() {
  return visaoDoEstado(lerEstadoBruto());
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
    const bruto = persistenciaIndisponivel && estadoMemoria ? estadoMemoria : lerEstadoBruto();
    const estado = visaoDoEstado(bruto);
    const resultado = fn(estado);
    const novoBruto = fundirVisao(bruto, estado);
    try {
      // Escrita atômica: writeFileSync direto é truncate+write e pode ser lido pela
      // metade (medido: 4,8% de leituras inválidas sob escrita concorrente). rename
      // no mesmo volume nunca deixa arquivo incompleto.
      const tmp = `${arquivoEstadoDisjuntor}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(novoBruto));
      fs.renameSync(tmp, arquivoEstadoDisjuntor);
      persistenciaIndisponivel = null;
      estadoMemoria = null;
    } catch (e) {
      persistenciaIndisponivel = e?.code || "EIO";
      estadoMemoria = novoBruto; // segue contando dentro deste processo
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
// opts.ignorarBloqueio: a API de processos (outro host) divide a cota e o
// espaçamento, mas NÃO herda o disjuntor do bloqueio do JURIS.
export function reservarRequisicao(agora = Date.now(), opts = {}) {
  if (escolhaPendente()) return { erro: AVISO_ESCOLHA_PENDENTE };
  return transacao((e) => {
    if (!opts.ignorarBloqueio && agora < e.bloqueadoAte) {
      return {
        erro:
          "O TJRO bloqueou uma consulta recente por suspeita de automação; para não " +
          "prolongar o bloqueio, esta ferramenta está evitando novas tentativas por " +
          `mais ${fmtDuracao(e.bloqueadoAte - agora)}. Tente novamente depois disso. ` +
          "Enquanto isso, o portal juris.tjro.jus.br segue acessível no navegador. " +
          // teto: o saneamento usa o próprio Date.now(), que pode estar 1 ms à frente de `agora` (3601 s em vez de 3600)
          `[espera_segundos=${Math.min(Math.ceil((e.bloqueadoAte - agora) / 1000), BACKOFF_MAXIMO_MS / 1000)} tipo=bloqueio_do_tribunal]`,
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
          `Aguarde ${fmtDuracao(espera)} e tente de novo. [espera_segundos=${Math.ceil(espera / 1000)} tipo=limite_de_ritmo]`,
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

// v1.34.0 (relato de uso, 13/10/2026): o subagente estourou o teto de consultas por frente do próprio roteiro sem saber
// quantas já tinha feito. A busca passa a dizer o placar do limitador (todas as consultas desta máquina ao portal).
export function linhaDeRitmo(agora = Date.now()) {
  try {
    const e = comTrava(() => lerEstado());
    const janela = ESCADA_JANELA_MS[e.indiceJanela] || ESCADA_JANELA_MS[0];
    const reqs = e.requisicoes || [];
    const naJanela = reqs.filter((t) => agora - t <= janela).length;
    return `\n_Ritmo do portal: ${naJanela} de ${JANELA_MAX_REQS} consultas na janela atual de ${janela / 60_000} min (nível ${e.indiceJanela + 1} de ${ESCADA_JANELA_MS.length}), ` +
      `somando tudo o que esta máquina consultou. Se o seu roteiro tem teto de consultas por frente, conte as suas chamadas; este número só diz o fôlego do limitador._`;
  } catch {
    return "";
  }
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
      identidade: identidadeAtual, // v1.11.0: "honesta" | "navegador"
      // v1.28.0: o que estava acontecendo (sequência anterior do livro-razão, rajada, outros processos, resposta do portal)
      contexto: contextoDoBloqueio(lerRitmo(), opts.t0 ?? agora, ESPACAMENTO_MIN_MS, opts.resposta ?? null),

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
export function relatorioDeBloqueios(agora = Date.now()) {
  const bruto = comTrava(() => lerEstadoBruto());
  const e = visaoDoEstado(bruto);
  return formatarRelatorio(
    analisarBloqueios({ ritmo: lerRitmo(), incidentes: e.incidentes || [], espacamentoMinMs: ESPACAMENTO_MIN_MS, janelaMax: JANELA_MAX_REQS, agora }),
    agora
  );
}

export function diagnosticoRitmo(agora = Date.now(), opts = {}) {
  if (opts.relatorio) return diagnosticoRitmo(agora) + "\n\n" + relatorioDeBloqueios(agora);
  const bruto = comTrava(() => lerEstadoBruto());
  const e = visaoDoEstado(bruto);
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
    `- Identificação desta instalação: ${escolhaPendente() ? "ESCOLHA PENDENTE (o usuário ainda não foi perguntado; nenhuma consulta é feita até ele responder)" : identidadeAtual === "navegador" ? "navegador (opção ativada ou escolhida pelo usuário; risco assumido por quem a ativou)" : "extensão (identificação honesta)"}`,
  ];
  const outra = IDENTIDADES.find((id) => id !== identidadeAtual);
  if (agora < bruto.porIdentidade[outra].bloqueadoAte) {
    linhas.push(
      `- A outra identificação (${outra}) está em pausa por mais ${fmtDuracao(bruto.porIdentidade[outra].bloqueadoAte - agora)}; ` +
        "isso não afeta esta (a pausa é por identificação; o volume de consultas é o que continua somado)."
    );
  }
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
        (i.identidade ? ` · identificação: ${i.identidade}` : "") +
        (i.tipo === "desafio_navegador" ? " · **verificação de navegador** (não é ritmo)" : i.tipo === "resposta_corrompida" ? " · **página de bloqueio com cabeçalho defeituoso** (não é ritmo)" : "")
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
        "Desde a v1.7.8, bloqueio assim não aperta mais o limite de ritmo. " +
        // v1.13.4: a frase sobre a extensão barrada só vale para a identificação honesta — na build pessoal
        // (identificação de navegador) ela mandava pesquisar pelo site sem motivo
        (identidadeAtual === "honesta"
          ? "Em 22/09/2026 o autor confirmou que o filtro do TJRO está recusando as consultas desta extensão em si (pela forma " +
            "como ela se identifica), e não a rede de quem usa: trocar de conexão não resolve. O caminho " +
            "é pesquisar pelo site (juris.tjro.jus.br) e acompanhar as versões novas. Esta ferramenta não " +
            "troca de IP nem se disfarça para contornar o filtro sem que você decida isso."
          : "Nesta instalação (identificação de navegador) o filtro não recusa a ferramenta em si: espere a pausa terminar " +
            "e retome com uma busca só; se os bloqueios voltarem com pouco tráfego, a causa provável é outro equipamento na " +
            "mesma rede ou o portal apertando o filtro — o site (juris.tjro.jus.br) segue como alternativa.")
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
    (i) =>
      agora - i.quando <= JANELA_SISTEMATICO_MS &&
      (i.reqsUltimos60s ?? 99) <= 2 &&
      (!i.identidade || i.identidade === identidadeAtual) // bloqueio de OUTRA identificação não prova nada aqui
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

  let r;
  const t0 = Date.now();
  const opPost = (body?.fields || {}).nr_processo && !(body?.fields || {}).query ? "inteiro_teor" : "busca";
  const livro = (res, status = null) => anotarRequisicao({ t: t0, impl: "node", id: identidadeAtual, op: opPost, res, status, durMs: Date.now() - t0 });
  try {
    r = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    // Sonda de 24/09/2026: para a identificação desta extensão o filtro serve a página
    // "STIC - Página Bloqueada" com um cabeçalho defeituoso (byte NUL); o cliente
    // recusa a resposta antes de ler o HTML. É bloqueio: entra no diário e arma o
    // disjuntor (sem alargar a janela: não é problema de ritmo), senão o diagnóstico
    // diria "liberado" enquanto a ferramenta segue batendo num portal que bloqueia.
    if (ehRespostaCorrompida(e)) {
      const campos = body?.fields || {};
      registrarBloqueioDetectado(Date.now(), campos.nr_processo && !campos.query ? "inteiro_teor" : "busca", {
        subirEscada: false,
        tipo: "resposta_corrompida",
        t0,
        resposta: { status: null, ctype: null, server: null, retryAfter: null, bytes: null, assinatura: "cabeçalho defeituoso (byte NUL em Connection)" },
      });
      livro("corrompida");
    } else {
      livro("rede");
    }
    throw e;
  }
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
      t0,
      resposta: {
        status: r.status,
        ctype: ctype.slice(0, 40),
        server: (r.headers.get("server") || "").slice(0, 40) || null,
        retryAfter: r.headers.get("retry-after") || null,
        bytes: texto ? texto.length : null,
        assinatura: (texto || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
      },
    });
    livro(ehDesafio ? "desafio" : "bloqueio", r.status);
  } else if (!r.ok) {
    livro("http", r.status);
  }
  // 503 e demais erros seguem como instabilidade: não são bloqueio, e insistir dentro
  // do orçamento já é o comportamento certo.
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!ctype.includes("json")) throw new Error(diagnosticarRespostaNaoJson(ctype, texto));
  registrarSucesso();
  livro("ok", r.status);
  const dados = await r.json();
  cacheGravar(chave, dados, Date.now());
  return dados;
}

// --------------------------------------------------------------- formatters -
// v1.35.0 (relato de 14/10/2026): pedido de subtipo do ED acolhido (erro material / omissão / efeito infringente). Regra medida
// às cegas (40 acórdãos novos, 2 rotuladores; concordância 40/40 no vício e 32/40 no efeito): vício declarado certo em 14/18,
// efeito em 12/32. Rótulo assim enganaria; o ED acolhido mostra a FRASE do dispositivo que o acolhe, e quem lê decide.
const RE_VICIOS_ED = [/erros? materia/, /omiss|omit/, /contradi/, /obscur/];
export function fraseDosEmbargos(texto) {
  const t = String(texto || "");
  const zona = t.length > 7000 ? t.slice(0, 3000) + " " + t.slice(-4000) : t;
  const fr = zona.split(/(?<=[.;])\s+(?=[A-ZÀ-Ý0-9])/).filter((f) => {
    const x = fold(f);
    return /embargos|aclarator|declarator/.test(x) && /\bacolh|\bdou provimento|providos?\b/.test(x) && !/\bnao (se )?acolh|rejeit|1\.?022|cabem embargos|cabimento|prestam|destinam|hipoteses/.test(x) &&
      RE_VICIOS_ED.filter((r) => r.test(x)).length < 3;
  });
  if (!fr.length) return "";
  const f = fr[fr.length - 1].replace(/[ \t\n\r\f\v]+/g, " ").trim();
  return f.length > 320 ? f.slice(0, 320) + "…" : f;
}

// v1.34.0 (relato de uso, 13/10/2026): pedido de rótulo "má-fé aplicada / afastada / só citada". A regra medida às cegas
// (60 frases novas, 2 rotuladores, concordância 58/60) acertou afastada 87%, aplicada 71%, pedido da parte 60%, só citada
// 50%: rótulo assim enganaria. Na busca sobre má-fé, cada resultado mostra a FRASE literal, e quem lê decide.
const RE_MA_FE = /litiga\w*\s+de\s+ma[\s-]*fe/;
export function fraseDeMaFe(texto) {
  const fr = String(texto || "").split(/(?<=[.;])\s+(?=[A-ZÀ-Ý0-9])/).filter((f) => RE_MA_FE.test(fold(f)));
  if (!fr.length) return "";
  const f = fr[fr.length - 1].replace(/[ \t\n\r\f\v]+/g, " ").trim();
  return f.length > 320 ? f.slice(0, 320) + "…" : f;
}

// v1.34.0 (relato de uso, 13/10/2026): a busca devolveu o próprio acórdão embargado, julgado dias antes, sem nada que o
// distinguisse. Julgado há até RECENTE_DIAS dias: ainda pode não ter sido publicado e cabe embargos.
export const RECENTE_DIAS = 30;
export function diasDesdeJulgamento(s, agora) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String((s || {}).dtjulgamento || ""));
  if (!m) return null;
  const dias = Math.floor((agora - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
  return dias >= 0 && dias <= RECENTE_DIAS ? dias : null;
}

export function formatBusca(data, consulta, tipo, ordenacao, pagina, porPagina, filtros = [], nota = "", termoExato = false, consultaMontada = "", opcoes = {}) {
  const compacto = opcoes.modo === "compacto";
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
  // v1.35.0 (relato de 14/10/2026): relator + 3 grupos genéricos devolveu 2.110 e 1.310 documentos, e o agente tirou conclusão do topo.
  if (total >= 1000)
    out.push(`⚠️ Consulta pouco seletiva (${total} documentos): a página mostra só o topo da ordenação, que não representa o conjunto. Antes de concluir algo sobre ele, restrinja por classe, assunto (ex.: "Sucumbenciais"), resultado ou um termo próprio do tema.`);

  if (total >= 3 && opcoes.semPanorama !== true) {
    const pan = formatPanorama(data);
    if (pan) out.push(pan);
  }

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
  const comOrigem = textos.map((x, i) => resultadoComOrigem(x, (hits[i]._source || {}).tipo));
  const resultados = comOrigem.map((x) => x.conjunto);
  const desfechos = textos.map((x, i) => desfechoDeSentenca(x, (hits[i]._source || {}).tipo, (hits[i]._source || {}).ds_classe_judicial));
  const sufixoOrigem = (i) => (comOrigem[i].origem === "ementa-IV" ? " (lido da seção IV da ementa)" : "");
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
  const agora = opcoes.agora ?? Date.now();
  const buscaDeMaFe = /\bma[\s-]*fe\b/.test(fold(`${consulta || ""} ${consultaMontada || ""}`));
  const recente = (s) => diasDesdeJulgamento(s, agora);
  // data da sessão pelo fecho, só no ACÓRDÃO e só quando difere do índice
  const fechoData = (i) => {
    const s = hits[i]._source || {};
    if (s.tipo !== "ACÓRDÃO") return "";
    const f = dataDoFecho(textos[i]), idx = s.dtjulgamento_str || dataBr(s.dtjulgamento) || "";
    return f && idx && f !== idx ? ` (índice; sessão pelo fecho: ${f})` : "";
  };

  // Votação do fecho: o ACÓRDÃO tem a sua; a EMENTA (sem fecho) empresta a do acórdão do MESMO julgamento na página (nº + data;
  // sem data não se presume; votações divergentes no mesmo julgamento: não arrisca) — mesma regra do órgão do fecho.
  const votacoes = hits.map((h, i) => ((h._source || {}).tipo === "ACÓRDÃO" ? votacaoDoFecho(textos[i]) : ""));
  const votDoJulgamento = new Map();
  hits.forEach((_h, i) => {
    if (!votacoes[i] || !chaveJulg(i) || chaveProc(i).startsWith("#")) return;
    const k = `${chaveProc(i)}|${chaveJulg(i)}`;
    votDoJulgamento.set(k, !votDoJulgamento.has(k) || votDoJulgamento.get(k) === votacoes[i] ? votacoes[i] : null);
  });
  const votSufixoI = (i, antes = " (", depois = ")") => {
    if (votacoes[i]) return `${antes}${votacoes[i]}${depois}`;
    if (((hits[i]._source || {}).tipo || "") === "EMENTA" && chaveJulg(i) && !chaveProc(i).startsWith("#")) {
      const v = votDoJulgamento.get(`${chaveProc(i)}|${chaveJulg(i)}`);
      if (v) return `${antes}${v}, do acórdão do mesmo julgamento${depois}`;
    }
    return "";
  };

  if (compacto) {
    // Uma linha por documento: serve para varrer 100–250 resultados e escolher o
    // que abrir; o modo completo (com trecho) é para os poucos que interessam.
    out.push("\n**Lista compacta** (nº · tipo · classe · órgão do cadastro · julgado em · relator · resultado declarado · assunto · processo · id):");
    hits.forEach((h, i) => {
      const s = h._source || {};
      const r = rotuloDoConjunto(resultados[i], s.ds_classe_judicial, comOrigem[i].embargos);
      const doFecho = orgaoDoFechoDe(i);
      const org = doFecho && orgaoDiverge(doFecho, orgao(s)) ? `${doFecho} (fecho; índice: ${orgao(s)})` : orgao(s);
      out.push(
        `${inicio + i}. ${s.tipo || "?"} · ${s.ds_classe_judicial || "—"} · ${org} · ${quandoDe(s)} · ${relator(s)} · ` +
          `${r ? ROTULOS_RESULTADO[r] + sufixoOrigem(i) : desfechos[i] ? ROTULOS_SENTENCA[desfechos[i]] + " (1º grau)" : "sem resultado identificável"}${votSufixoI(i)} · ${s.ds_assunto_trf || "—"} · ${cnj(s.nr_processo || "")} · id ${idDocumento(s) || "—"}${recente(s) !== null ? ` · 🆕 recente (${recente(s)} dia(s))` : ""}`
      );
    });
    out.push("_Resultado declarado vem do fim do texto e não é posição sobre a tese; ementa e acórdão do mesmo julgado aparecem em linhas separadas. A votação entre parênteses vem do fecho do ACÓRDÃO; ausência não prova unanimidade. Abra o inteiro teor antes de citar._");
  }

  if (!compacto) hits.forEach((h, i) => {
    const s = h._source || {};
    const hl = (h.highlight || {}).ds_modelo_documento;
    const inteiro = limpar(hl ? hl[0] : s.ds_modelo_documento || "", 0);
    const trecho = trechoCentrado(hl ? hl[0] : s.ds_modelo_documento || "", 800);
    if (inteiro.length > trecho.length - (trecho.startsWith("…") ? 1 : 0)) houveCorte = true;
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
    const maFe = buscaDeMaFe ? fraseDeMaFe(limpar(s.ds_modelo_documento || "", 0)) : "";
    const rotI = rotuloDoConjunto(resultados[i], s.ds_classe_judicial, comOrigem[i].embargos);
    const edFrase = (rotI === "ACOLHIDO" || (rotI === "PARCIAL" && comOrigem[i].embargos)) ? fraseDosEmbargos(textos[i]) : "";
    const linhas = [
      `\n---\n**${inicio + i}. ${s.tipo} · ${s.ds_classe_judicial || ""}**`,
      `- Processo: ${cnj(s.nr_processo || "")}`,
      `- Id. do documento: ${idDocumento(s) || "—"} (chave única desta decisão)`,
      `- Relator(a): ${relator(s)}`,
      corrige
        ? `- Órgão: ${corrige} (${s.grau_jurisdicao}º grau) — ⚠️ declarado no fecho do acórdão; o índice diz ${orgao(s)}`
        : `- Órgão: ${orgao(s)} (${s.grau_jurisdicao}º grau)`,
      `- Julgado em: ${s.dtjulgamento_str || s.dtjulgamento || "—"}${fechoData(i)}${votSufixoI(i, " · Votação no fecho: ", "")}${assunto}`,
      ...(maFe ? [`- Má-fé (frase literal mais próxima do fim do texto, para triagem; não é rótulo): «${maFe}»`] : []),
      ...(edFrase ? [`- Embargos acolhidos, frase do dispositivo (literal, para ver se foi erro material, omissão ou efeito infringente; não é rótulo): «${edFrase}»`] : []),
      ...(recente(s) !== null ? [`- 🆕 JULGADO RECENTE (${recente(s)} dia(s)): pode ainda não ter sido publicado e cabe embargos de declaração; confira a publicação no PJe antes de citar.`] : []),
      `- Citação: ${citacao(s, corrige)}`,
      `- Inteiro teor: ${link(s)}`,
    ];
    const grupo = porProcesso.get(chaveProc(i));
    if ((s.tipo || "") !== "ACÓRDÃO" && chaveJulg(i)) {
      const j = grupo.find((j) => j !== i && ((hits[j]._source || {}).tipo || "") === "ACÓRDÃO" && chaveJulg(j) === chaveJulg(i));
      if (j !== undefined) linhas.push(`- ACÓRDÃO deste julgamento nesta página: nº ${inicio + j}, id ${idDocumento(hits[j]._source || {}) || "—"} (para citar a decisão do colegiado, use o acórdão, não o ${s.tipo})`);
    }
    if (grupo.length > 1) {
      if (grupo[0] === i) {
        linhas.push(
          `- ⚠️ Mesmo número, ${grupo.length} documentos nesta página (${listaMesmoNumero(grupo.map((j) => ({ n: inicio + j, s: hits[j]._source || {} })), quandoDe)}) — o número NÃO identifica a decisão: cite pelo id + data de julgamento.`
        );
      } else {
        linhas.push(`- ⚠️ Mesmo número do nº ${inicio + grupo[0]} — cite pelo id + data de julgamento.`);
      }
      // Resultado oposto no MESMO julgamento: provável voto vencido indexado.
      for (const j of grupo) {
        // Data ausente não é evidência de mesmo julgamento: nunca casa (red team, achado 6).
        if (j === i || !chaveJulg(i) || chaveJulg(j) !== chaveJulg(i)) continue;
        for (const par of OPOSTOS) {
          // v1.30.0: ACOLHIDO × REJEITADO só vale em embargos de declaração; em apelação, "preliminar rejeitada" + mérito
          // acolhido não é voto vencido (7 dos 10 alarmes falsos fora de RELATÓRIO, validação cega de 13/10/2026).
          if (par[0] === "ACOLHIDO" && !ehEmbargos((hits[i]._source || {}).ds_classe_judicial)) continue;
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
    if (desfechos[i]) linhas.push(`- Desfecho da sentença (lido do dispositivo; é o que foi decidido sobre o pedido, não quem ganhou): ${ROTULOS_SENTENCA[desfechos[i]]}`);
    // v1.29.0 (H06): a tese da ementa CNJ fica fora do trecho de 800 caracteres em ~92% das EMENTAS; sai literal,
    // do texto integral do hit (nunca do fragmento do destaque), só no tipo EMENTA e só no modo completo.
    if (s.tipo === "EMENTA") {
      const te = teseDaEmenta(limpar(s.ds_modelo_documento || "", 0));
      // v1.30.0: se o trecho de 800 caracteres já mostra a tese inteira, a linha só repetiria o mesmo texto.
      const semMarcas = (x) => String(x).replace(/[«»…]/g, "").replace(/[ \t\n\r\f\v]+/g, " ");
      if (te && !(te.completa && semMarcas(trecho).includes(semMarcas(te.texto)))) linhas.push(linhaTese(te));
    }
    linhas.push(`- ${rotulo}: ${trecho || "(sem trecho)"}`);
    out.push(linhas.join("\n"));
  });
  // Aviso de UMA vez, no rodapé — por resultado viraria ruído (quase toda ementa
  // passa de 800 chars) e ruído faz o leitor parar de ler os avisos que importam.
  // Motivo real (08/09/2026): peça citou uma tese fichada só pelos primeiros itens
  // de uma ementa numerada, sem ler o item final, que aplicava o oposto.
  if (houveCorte)
    out.push(
      "\n_Os trechos são fragmentos (até 800 caracteres), não a ementa inteira: ementa numerada ENUNCIA a tese nos primeiros itens " +
        "e a APLICA nos últimos, às vezes com alcance menor. Abra o inteiro teor antes de fichar ou citar._"
    );

  // Resumo 100% offline dos resultados DESTA página (ver resumoResultadosPagina).
  // Só com amostra mínima (3+): com 1-2 hits, um resumo teria peso de conclusão
  // que a amostra não sustenta.
  if (hits.length >= 3) {
    const { contagem, semResultado, totalJulgamentos, porRelator, porOrgao, porAno, sentencas } = resumoResultadosPagina(hits);
    if (sentencas.total >= 3) {
      const ps = Object.entries(sentencas.contagem).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${PLURAL_SENTENCA[k]}`);
      if (sentencas.sem > 0) ps.push(`${sentencas.sem} sem desfecho identificável`);
      out.push(
        `\n_Sentenças nesta página: ${ps.join(", ")}. Desfecho do PEDIDO lido do dispositivo, não diz quem ganhou (em embargos à execução e ` +
          "impugnação, procedente favorece o devedor). Decisão sobre embargos de declaração e sentença sem dispositivo localizável ficam sem desfecho. " +
          "Amostra desta página; indício para escolher o que ler, nunca conclusão._"
      );
    }
    const partes = Object.entries(contagem)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n} ${ROTULOS_RESULTADO[k]}${n > 1 ? "s" : ""}`);
    if (semResultado > 0) partes.push(`${semResultado} sem resultado identificável`);
    if (partes.length) {
      const enviesa = ordenacao === "relevantes" ? ' (enviesa a amostra; prefira "recentes" ou "antigos")' : "";
      out.push(
        `\n_Nesta página: ${partes.join(", ")}. Contagem por JULGAMENTO (ementa e acórdão do mesmo julgado contam uma vez); ` +
          'quem declara os dois lados de um par vai para "sem resultado identificável". Resultado não é posição sobre a tese ' +
          `(provido por outro fundamento conta como provido). Amostra desta página, ordenação "${ordenacao}"${enviesa}. Indício ` +
          "para escolher o que ler, nunca conclusão._"
      );
      // Quebra por relator / órgão / ano só com amostra que a sustente (10+ julgamentos).
      if (totalJulgamentos >= 10) {
        const blocos = [
          ["Por relator", linhasQuebra(porRelator)],
          ["Por órgão (cadastro)", linhasQuebra(porOrgao)],
          ["Por ano", linhasQuebra(porAno, 12)],
        ].filter(([, l]) => l.length);
        if (blocos.length)
          out.push(
            "\n_Quebra da mesma amostra (só chaves com 3+ julgamentos):_\n" +
              blocos.map(([t, l]) => `- ${t}: ${l.join("; ")}`).join("\n") +
              "\n_Taxa de provimento não é taxa de acolhimento da tese. Mudança de proporção entre anos é sinal para ler os julgados dos dois períodos, não conclusão._"
          );
      }
    }
  }

  if (total > pagina * porPagina) {
    if ((pagina + 1) * porPagina > JANELA_MAXIMA) {
      out.push(
        "\n_(há mais resultados, mas o portal só expõe os 10.000 primeiros — refine com filtros ou mude a ordenação)_"
      );
    } else if (porPagina < POR_PAGINA_MAX) {
      // Preferir UMA busca maior a várias páginas: cada página é uma requisição
      // a mais ao portal, e o orçamento de requisições é limitado.
      out.push(
        `\n_(há mais resultados — prefira repetir a busca com por_pagina maior (até ${POR_PAGINA_MAX}; com modo="compacto" cabe na resposta) ` +
          `numa única chamada, em vez de paginar; se precisar mesmo paginar, use pagina=${pagina + 1})_`
      );
    } else {
      out.push(`\n_(há mais resultados — chame novamente com pagina=${pagina + 1})_`);
    }
  }
  return out.join("\n");
}

export const linhaTese = (te) =>
  `- TESE DA EMENTA (literal; tese enunciada pelo órgão, não prova de ratio): "${te.texto}${te.completa ? "" : " […]"}"` +
  (te.completa ? "" : ` ⚠️ TESE INCOMPLETA: ${te.total > 1 ? `${te.exibidos} de ${te.total} itens` : "trecho parcial"}; abra o inteiro teor antes de fichar.`);

// v1.33.0 (relato de uso de 14/10/2026): leitura BARATA para decidir se vale gastar uma leitura integral. Um bloco por julgamento do processo,
// sem o texto das peças: resultado declarado, peças com id e link, tese da ementa, fatos do julgado (trecho literal), proclamação do fecho e
// precedentes qualificados citados. Para ler o teor: chamar de novo sem `modo`; para aspas: verificar_citacao_tjro.
export const TRIAGEM_DISPOSITIVO_MAX = 700;
const RE_FECHO_BRUTO = /acordam\s+(?:os|as)\s+(?:magistrados|desembargadores|juizes|juizas)/gi;
const RE_FIM_DO_FECHO = /\s(?:Porto Velho|Ji-Paran[aá]|Cacoal|Vilhena|Ariquemes|Guajar[aá]-Mirim|Rolim de Moura|Jaru|Ouro Preto)[^.,]{0,30},\s*\d{1,2} de /i;
export function formatTriagem(data, nrProcesso) {
  const hits = (data.hits || {}).hits || [];
  if (!hits.length) return `Nenhum documento encontrado para o processo ${cnj(nrProcesso)}.`;
  const unicos = [];
  const vistos = new Set();
  for (const h of hits) {
    const s = h._source || {};
    const corpo = limpar(s.ds_modelo_documento || "", 0);
    const chave = `${s.tipo} ${corpo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push([s, corpo]);
  }
  const dataDe = (s) => s.dtjulgamento_str || dataBr(s.dtjulgamento) || `sem data (id ${idDocumento(s) || "?"})`;
  const grupos = new Map();
  for (const [s, corpo] of unicos) {
    const d = dataDe(s);
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d).push([s, corpo]);
  }
  const iso = (docs) => String(docs[0][0].dtjulgamento || "");
  const ordenados = [...grupos.entries()].sort((a, b) => (iso(b[1]) > iso(a[1]) ? 1 : iso(b[1]) < iso(a[1]) ? -1 : 0));
  const out = [
    `**Triagem do processo ${cnj(nrProcesso)}** (${ordenados.length} julgamento(s), ${unicos.length} documento(s)). Modo triagem: resultado, tese, fatos, fecho e precedentes citados, SEM o texto das peças. ` +
      "Para ler o teor, chame de novo sem `modo`; para pôr trecho entre aspas, use `verificar_citacao_tjro`. Indício para decidir o que ler, não citação.",
  ];
  const preferir = (docs, tipos) => { for (const t of tipos) { const d = docs.find(([s]) => String(s.tipo || "").toUpperCase() === t); if (d) return d; } return docs[0]; };
  for (const [d, docs] of ordenados) {
    const [s0] = preferir(docs, ["ACÓRDÃO", "EMENTA", "SENTENÇA", "VOTO", "RELATÓRIO"]);
    const fechos = new Map();
    for (const [, corpo] of docs) { const r = extrairOrgaoComOrigem(corpo); if (r && r.origem === "fecho") fechos.set(fold(r.orgao), r.orgao); }
    const orgaoTxt = fechos.size === 1 ? `${[...fechos.values()][0]} (fecho)` : `${orgao(s0)} (índice; confira o fecho)`;
    const j = novoJulgamento(s0.ds_classe_judicial || "");
    let origemFecho = false;
    for (const [s, corpo] of docs) { const r = resultadoComOrigem(corpo, s.tipo); somarResultado(j, r); if (r.origem === "fecho") origemFecho = true; }
    const rot = rotuloDoJulgamento(j);
    const desf = docs.map(([s, corpo]) => desfechoDeSentenca(corpo, s.tipo, s.ds_classe_judicial)).find(Boolean);
    const resTxt = desf ? `sentença ${ROTULOS_SENTENCA[desf]} (lido do dispositivo)` : rot ? `${ROTULOS_RESULTADO[rot]}${origemFecho ? " (fecho)" : ""}` : "sem resultado identificável: leia o dispositivo";
    const linhas = [`### ${d} · Rel. ${relator(s0)} · ${orgaoTxt} · ${s0.ds_classe_judicial || ""}`, `- Resultado declarado: ${resTxt}`];
    linhas.push(`- Peças: ${docs.map(([s]) => `${s.tipo} id ${idDocumento(s) || "?"} (${link(s)})`).join(" · ")}`);
    const [sE, corpoE] = preferir(docs, ["EMENTA", "ACÓRDÃO"]);
    const te = teseDaEmenta(corpoE);
    if (te) linhas.push(linhaTese(te));
    const [sF, corpoF] = preferir(docs, ["EMENTA", "ACÓRDÃO", "SENTENÇA", "RELATÓRIO"]);
    const fatos = fatosDoJulgado(corpoF, sF.tipo);
    if (fatos && !fatos.onde.startsWith("sem relatório formal")) {
      const teto = fatos.onde.includes("sentença") ? FATOS_MAX_SENT : FATOS_MAX;
      const cautela = fatos.onde.startsWith("relatório do") || fatos.onde.includes("sentença") ? " ⚠️ relatório: alegações e andamento, não fundamento nem resultado" : RE_ALEGACAO.test(fatos.texto) ? " ⚠️ contém alegação da parte" : "";
      linhas.push(`- Fatos (trecho literal, ${fatos.onde}${cautela}): "${fatos.texto.replace(/[ \t\n\r\f\v]+/g, " ")}${fatos.texto.length >= teto ? " […]" : ""}"`);
    }
    let fechoTxt = null;
    for (const [, corpo] of docs) {
      let ult = -1;
      for (const m of corpo.matchAll(RE_FECHO_BRUTO)) ult = m.index;
      if (ult >= 0) {
        let f = corpo.slice(ult, ult + TRIAGEM_DISPOSITIVO_MAX + 200).replace(/[ \t\n\r\f\v]+/g, " ").trim();
        const fim = RE_FIM_DO_FECHO.exec(f);
        f = fim ? f.slice(0, fim.index).trim() : f.slice(0, TRIAGEM_DISPOSITIVO_MAX).trim();
        fechoTxt = f;
        break;
      }
    }
    linhas.push(fechoTxt ? `- Fecho: «${fechoTxt}»` : "- Fecho: não há proclamação no texto (documento sem fecho)");
    const anc = ancoras(docs.map(([, corpo]) => corpo).join("\n"));
    if (anc.length) linhas.push(`- Cita precedente qualificado: ${anc.join(", ")} (o que o julgado cita, não o que decide sobre eles)`);
    out.push(linhas.join("\n"));
  }
  return out.join("\n\n");
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
    `Citação: ${citacao(s0, corrige0)}` + (idDocumento(s0) ? ` · id ${idDocumento(s0)}` : "") + pecaEAcordao(s0, unicos, dataDe),
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
    const dif = resultadosPorJulgamento(julgamentos, unicos);
    if (dif) out.push(dif);
  }
  for (const g of reemissoesDoAcordao(unicos)) {
    const desc = (x) => `id ${idDocumento(x[0]) || "?"} (${dataDe(x[0]) || "sem data"}, ${x[1].length} caracteres)`;
    out.push(
      `⚠️ REEMISSÃO: os ACÓRDÃOS ${g.map(desc).join(" e ")} têm o mesmo começo e o mesmo fecho: é o mesmo julgamento emitido mais de uma vez, ` +
        `não julgamentos distintos. O índice não diz qual foi publicado; o mais completo é o id ${idDocumento(g[0][0]) || "?"}. Confira no PJe a publicação antes de citar o id.`
    );
  }
  if (total > hits.length)
    out.push(
      `⚠️ O processo tem ${total} documentos; vieram os ${hits.length} mais recentes — refine o parâmetro tipo para alcançar os demais.`
    );

  // v1.29.0: EMENTA/RELATÓRIO/VOTO do mesmo julgamento vêm, no índice, contidos
  // letra a letra no ACÓRDÃO (672 de 681 peças em 433 leituras do cache, 12/10/2026).
  // Repetir o texto gastava o orçamento e cortava justamente o fecho do acórdão
  // (134 de 336 acórdãos saíam truncados). A peça contida vira um ponteiro para o
  // acórdão, mas só se o trecho couber na parte do acórdão efetivamente exibida;
  // cabeçalho, id, link e avisos continuam calculados sobre o corpo dela.
  // Contenção EXATA sobre o corpo já normalizado por limpar (espaços colapsados):
  // sem fold, sem limiar — "idêntico" precisa ser verdade. Só com data igual.
  const contidoEm = contencoesDoInteiro(unicos, dataDe);
  const redundantes = contidoEm.size;
  // Orçamento global com teto por peça dinâmico: uma peça sozinha pode usar
  // o orçamento inteiro (há acórdãos de ~80k chars). Peças redundantes não contam.
  // Reserva de orçamento para os ponteiros (cabeçalho + avisos + 1 linha): a peça
  // contida nunca é omitida, mesmo que o acórdão seja gigante.
  const RESERVA_PONTEIRO = 1500;
  const tetoPeca = Math.max(
    15000,
    Math.floor((ORCAMENTO_INTEIRO - RESERVA_PONTEIRO * redundantes) / Math.max(1, unicos.length - redundantes))
  );
  // Orçamento contado em caracteres (pontos de código), como no Python: `.length`
  // conta emoji dos avisos como 2 e deslocava o corte das peças em relação ao espelho.
  const tam = (x) => { let n = 0; for (const _ of x) n++; return n; };
  let usado = out.reduce((n, x) => n + tam(x), 0);
  let avisouLimite = false;
  // Ordem de emissão: a do índice, mas o acórdão contentor sai antes da peça que
  // aponta para ele (o leitor precisa encontrar o texto acima, não abaixo).
  const ordem = [];
  const emitidos = new Set();
  for (let i = 0; i < unicos.length; i++) {
    const c = contidoEm.get(i);
    if (c !== undefined && !emitidos.has(c)) { ordem.push(c); emitidos.add(c); }
    if (!emitidos.has(i)) { ordem.push(i); emitidos.add(i); }
  }
  const exibido = new Map(); // índice do contentor -> texto efetivamente exibido
  for (let k = 0; k < ordem.length; k++) {
    const i = ordem[k];
    const [s, corpo] = unicos[i];
    const c = contidoEm.get(i);
    const restantes = ordem.slice(k + 1).filter((x) => contidoEm.has(x)).length;
    const quando = s.dtjulgamento_str || s.dtjulgamento || "";
    const cab =
      `\n## ${s.tipo}` +
      (quando ? ` — julgado em ${quando}` : "") +
      (relator(s) !== "—" ? ` · Relator(a): ${relator(s)}` : "") +
      (idDocumento(s) ? ` · id ${idDocumento(s)}` : "") +
      ` · link ${link(s)}`;
    // Orçamento desta peça: o teto por peça, menos a reserva dos ponteiros que ainda virão.
    const teto = Math.min(tetoPeca, ORCAMENTO_INTEIRO - usado - RESERVA_PONTEIRO * restantes);
    if (teto <= 0 && c === undefined) {
      if (!avisouLimite)
        out.push(
          "\n_(limite de tamanho da resposta atingido — peças restantes sem ponteiro omitidas; chame novamente filtrando por tipo ou abra o link do portal acima)_"
        );
      avisouLimite = true;
      continue;
    }
    // Índice × texto: o campo do cadastro pode divergir do que o acórdão diz.
    const avisos = [];
    const org = extrairOrgaoComOrigem(corpo);
    if (org && orgaoDiverge(org.orgao, orgao(s)))
      avisos.push(
        `⚠️ Índice: ${orgao(s)} · ${org.origem === "fecho" ? 'fecho do acórdão ("acordam os Magistrados...")' : "cabeçalho desta peça"}: ` +
          `${org.orgao} — prevalece o texto (o cadastro mostra a câmara atual do processo, não a que julgou; cite pela câmara que o acórdão declara).`
      );
    const relTexto = extrairRelatorDoTexto(corpo);
    if (relatorDiverge(relTexto, relator(s)))
      avisos.push(
        `⚠️ Índice: relator ${relator(s)} · cabeçalho desta peça: "${relTexto}" — pode ser relator sorteado vencido ou o do acórdão embargado; confira no acórdão antes de citar.`
      );
    // "Favorável a quem": só no ACÓRDÃO (a ementa não tem partes nem fecho) e só
    // aqui, no inteiro teor — o cabeçalho da busca não traz partes legíveis.
    if (s.tipo === "ACÓRDÃO") {
      const ld = linhaDatas(corpo, s);
      if (ld) avisos.push(ld);
    }
    if (s.tipo === "ACÓRDÃO") {
      const vf = votacaoDoFecho(corpo);
      if (vf) avisos.push(`🗳️ Votação no fecho: ${vf}. (Lida da proclamação; não diz quem foi vencido: confira o fecho antes de citar como posição do órgão.)`);
    }
    if (s.tipo === "ACÓRDÃO") {
      const roF = resultadoComOrigem(corpo, s.tipo);
      const lado = linhaFavoravel(corpo, rotuloDoConjunto(roF.conjunto, s.ds_classe_judicial, roF.embargos));
      if (lado) avisos.push(lado);
      const rotF = rotuloDoConjunto(roF.conjunto, s.ds_classe_judicial, roF.embargos);
      const edF = rotF === "ACOLHIDO" || (rotF === "PARCIAL" && roF.embargos) ? fraseDosEmbargos(corpo) : "";
      if (edF) avisos.push(`🧾 Embargos acolhidos, frase do dispositivo (literal; diga você se foi erro material, omissão ou efeito infringente): «${edF}»`);
    }
    // v1.10.0: custódia na hora da leitura — a mesma conta do recibo, que antes só o lint via.
    const cust = linhaCustodia(corpo, s.tipo);
    if (cust) avisos.push(cust);
    const troca = artigosTrocados(corpo);
    if (troca) avisos.push(troca);
    const desf = desfechoDeSentenca(corpo, s.tipo, s.ds_classe_judicial);
    if (desf) avisos.push(`⚖️ DESFECHO DA SENTENÇA (lido do dispositivo; é o que foi decidido sobre o pedido, não quem ganhou; confira o dispositivo antes de citar): ${ROTULOS_SENTENCA[desf]}.`);
    const fatos = fatosDoJulgado(corpo, s.tipo);
    if (fatos && fatos.onde.startsWith("sem relatório formal")) {
      avisos.push(`📌 FATOS DO JULGADO: sentença ${fatos.onde}; a narrativa dos fatos vem logo no início do texto abaixo e emenda na fundamentação sem marco; leia-a lá (não transcrevo porque o corte automático seria incerto).`);
    } else if (fatos) {
      const sent = fatos.onde.includes("sentença"); const teto = sent ? FATOS_MAX_SENT : FATOS_MAX;
      const aviso = sent ? " ⚠️ É o relatório da sentença: pedido, alegações e andamento, NÃO o fundamento nem o resultado; confira os dois na fundamentação e no dispositivo." + (fatos.texto.length >= FATOS_MAX_SENT ? " (corte no teto: continua no texto abaixo)" : "")
        : fatos.onde.startsWith("relatório do") ? " ⚠️ É o relatório: narra o pedido e as alegações das partes, NÃO o fundamento nem o resultado; confira os dois no voto e no fecho."
        : RE_ALEGACAO.test(fatos.texto) ? " ⚠️ O trecho contém alegação da parte (sustentou/alega/afirma): é o que a parte diz, não fato reconhecido pelo julgado; não o transforme em fato na ficha." : "";
      avisos.push(`📌 FATOS DO JULGADO (trecho literal, ${fatos.onde}; não é resumo meu): "${fatos.texto.replace(/[ \t\n\r\f\v]+/g, " ")}${fatos.texto.length >= teto ? " […]" : ""}"${aviso}`);
    }
    let texto = corpo || "(documento sem texto)";
    const mae = c !== undefined ? exibido.get(c) : undefined;
    const idMae = c !== undefined && idDocumento(unicos[c][0]) ? ` id ${idDocumento(unicos[c][0])}` : "";
    if (mae !== undefined && mae.includes(corpo)) {
      texto =
        `_[texto idêntico a um trecho do ACÓRDÃO${idMae} acima ` +
        `(${corpo.length} caracteres, contido letra a letra); não repetido para poupar espaço — os avisos acima são desta peça]_`;
    } else if (c !== undefined && teto < 1000) {
      // Contida, mas na parte que o teto cortou do acórdão, e sem orçamento para o corpo:
      // ponteiro honesto em vez de omitir a peça.
      texto =
        `_[texto contido letra a letra no ACÓRDÃO${idMae}, na parte não exibida acima ` +
        `(${corpo.length} caracteres); para lê-lo, chame obter_inteiro_teor_tjro(tipo=["${s.tipo}"]) ou abra o link desta peça]_`;
    } else {
      if (texto.length > teto) {
        const corte = texto.slice(0, teto).replace(/\s+\S*$/, "");
        exibido.set(i, corte);
        texto =
          `${corte}…\n_[peça exibida parcialmente (${corte.length} de ${corpo.length} caracteres) — ` +
          `para o texto integral, chame obter_inteiro_teor_tjro(tipo=["${s.tipo}"]) ou abra o link do portal]_`
        if (s.tipo === "ACÓRDÃO") texto += fechoForaDoCorte(corpo, corte.length);
      } else {
        exibido.set(i, corpo);
      }
    }
    const bloco = `${cab}${avisos.length ? "\n" + avisos.join("\n") : ""}\n${texto}`;
    out.push(bloco);
    usado += tam(bloco);
  }
  return out.join("\n");
}

// v1.35.0 (relato de 14/10/2026): a Citação do topo é da peça mais recente, que às vezes é o VOTO; o agente teve de descobrir
// sozinho qual id era o acórdão. Peça que não é acórdão diz o tipo e aponta o ACÓRDÃO do mesmo julgamento (mesma data).
export function pecaEAcordao(s0, unicos, dataDe) {
  if (s0.tipo === "ACÓRDÃO") return "";
  const ac = dataDe(s0) ? unicos.find(([s]) => s.tipo === "ACÓRDÃO" && dataDe(s) === dataDe(s0)) : null;
  return ` · peça: ${s0.tipo || "?"}` + (ac && idDocumento(ac[0]) ? `; o ACÓRDÃO deste julgamento é o id ${idDocumento(ac[0])}` : "; o ACÓRDÃO deste julgamento não veio nesta resposta");
}
// v1.35.0: dois julgamentos sob o mesmo número com resultados diferentes ("PROVIDO" × "PROVIDO PARCIALMENTE"): o aviso de
// julgamentos distintos não dizia em que diferiam. Resultado declarado de cada um (ACÓRDÃO; sem ele, a EMENTA).
export function resultadosPorJulgamento(julgamentos, unicos) {
  const res = [];
  for (const [d, ss] of julgamentos) {
    const peca = unicos.find(([s]) => ss.includes(s) && s.tipo === "ACÓRDÃO") || unicos.find(([s]) => ss.includes(s) && s.tipo === "EMENTA");
    if (!peca) continue;
    const ro = resultadoComOrigem(peca[1], peca[0].tipo);
    const r = rotuloDoConjunto(ro.conjunto, peca[0].ds_classe_judicial, ro.embargos);
    // só provido / parcialmente / desprovido: apelação provida e embargos rejeitados é o normal, não divergência
    if (r && ["PROVIDO", "PARCIAL", "DESPROVIDO"].includes(r)) res.push(`${d} (${peca[0].tipo}, id ${idDocumento(peca[0]) || "?"}): ${ROTULOS_RESULTADO[r]}`);
  }
  const rotulos = new Set(res.map((x) => x.split(": ").pop()));
  return rotulos.size > 1
    ? `⚠️ Os julgamentos declaram resultados diferentes: ${res.join("; ")}. O mais recente pode ser o dos embargos de declaração ou uma reemissão corrigida; confira qual é o vigente antes de citar o resultado.`
    : "";
}

// v1.35.0 (relato de 14/10/2026): o índice dá "julgado em 04/09" e o fecho diz "Porto Velho, 28 de agosto". Nos 412 acórdãos
// do cache com data no fecho, 398 diferem e em 397 o fecho vem ANTES (mediana 6 dias, p90 17): o fecho é a sessão; o índice
// é a data do documento no sistema, a que a citação padrão do TJRO usa. As duas aparecem lado a lado.
const MESES = { janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const RE_DATA_FECHO = /\b(?:Porto Velho|Ji-Paran[aá]|Cacoal|Vilhena|Ariquemes|Guajar[aá]-Mirim|Rolim de Moura|Jaru|Ouro Preto do Oeste)\s*(?:\/\s*RO)?,?\s*(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i;
export function dataDoFecho(corpo) {
  const t = String(corpo || "");
  let ult = -1;
  for (const m of t.matchAll(RE_ACORDAM)) ult = m.index;
  if (ult < 0) return "";
  const m = RE_DATA_FECHO.exec(t.slice(ult, ult + 2500));
  const mes = m && MESES[m[2].toLowerCase()];
  return mes ? `${m[1].padStart(2, "0")}/${String(mes).padStart(2, "0")}/${m[3]}` : "";
}
export function linhaDatas(corpo, s) {
  const f = dataDoFecho(corpo), idx = s.dtjulgamento_str || dataBr(s.dtjulgamento) || "";
  if (!f || !idx || f === idx) return "";
  return `📅 Sessão de julgamento (data no fecho): ${f} · índice: ${idx} (data do documento no sistema, a que a citação padrão do TJRO usa). Para dizer quando o colegiado julgou, use a do fecho; para localizar a peça, o id.`;
}

// v1.34.0 (relato de uso, 14/10/2026): acórdão cortado pelo orçamento perdia o fecho, que diz a câmara,
// a votação e o resultado. Quando o último "acordam os Magistrados" cai na parte cortada, o fecho vem mesmo assim.
export function fechoForaDoCorte(corpo, exibidos) {
  const t = String(corpo || "");
  let ult = -1;
  for (const m of t.matchAll(RE_ACORDAM)) ult = m.index;
  if (ult < 0 || ult < exibidos) return "";
  const f = t.slice(ult, ult + 700).replace(/[ \t\n\r\f\v]+/g, " ").trim();
  return `\n📍 FECHO (estava na parte cortada; trecho literal a partir de "acordam os Magistrados"): «${f}${t.length > ult + 700 ? "…" : ""}»`;
}

// v1.34.0 (relato de uso, 13/10/2026): o PJe reemite o acórdão (ids e datas diferentes, um deles às vezes sem o voto),
// e a lista de "julgamentos distintos" tratava os dois como decisões diferentes. Mesmo começo e mesmo fecho = mesmo
// julgamento. Grupos de 2+ acórdãos, o mais longo primeiro.
export function reemissoesDoAcordao(unicos) {
  const grupos = new Map();
  for (const u of unicos) {
    const [s, c] = u;
    if (s.tipo !== "ACÓRDÃO" || !c || c.length < 1500) continue;
    let ult = -1;
    for (const m of c.matchAll(RE_ACORDAM)) ult = m.index;
    if (ult < 0) continue;
    const k = fold(c.slice(0, 1200)) + "|" + fold(c.slice(ult, ult + 400));
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(u);
  }
  return [...grupos.values()].filter((g) => g.length > 1).map((g) => [...g].sort((a, b) => b[1].length - a[1].length));
}

// v1.34.0 (relato de uso, 13/10/2026): voto com "art. 1.103, §3º, III, do CPC" e ementa com "art. 1.013". Dois artigos de
// 4+ algarismos com os mesmos algarismos em outra ordem, no mesmo texto e sem diploma diferente declarado logo depois, são
// candidato a erro de digitação (3 de 4 nos recibos de 14/10/2026). Artigo do CPC acima de 1.072 não existe.
const RE_ART_NUM = /\bart(?:igo)?s?\.?\s*(\d{1,2}\.\d{3}|\d{4,})(?![\d.])/gi;
// o diploma que aparece PRIMEIRO depois do número ("1.583 do Código Civil e 550 do CPC" é do CC)
const diplomaApos = (t) => {
  const m = /\b(cpc)\b|c[óo]digo de (processo) civil|\b(cc)\b|c[óo]digo (civil)/i.exec(t);
  return !m ? "" : m[1] || m[2] ? "CPC" : "CC";
};
export function artigosTrocados(texto) {
  const t = String(texto || ""), vistos = new Map();
  for (const m of t.matchAll(RE_ART_NUM)) {
    const k = m[1].replace(/\./g, ""), dip = diplomaApos(t.slice(m.index + m[0].length, m.index + m[0].length + 60));
    if (!vistos.has(k)) vistos.set(k, { rot: m[1], dips: new Set() });
    if (dip) vistos.get(k).dips.add(dip);
  }
  const ks = [...vistos.keys()];
  for (let i = 0; i < ks.length; i++)
    for (let j = i + 1; j < ks.length; j++) {
      const [a, b] = [vistos.get(ks[i]), vistos.get(ks[j])];
      if (ks[i].length !== ks[j].length || [...ks[i]].sort().join("") !== [...ks[j]].sort().join("")) continue;
      if (a.dips.size && b.dips.size && ![...a.dips].some((d) => b.dips.has(d))) continue;
      const fora = [[ks[i], a], [ks[j], b]].filter(([k, v]) => v.dips.size === 1 && v.dips.has("CPC") && Number(k) > 1072).map(([, v]) => v.rot);
      return `🔢 ARTIGO COM ALGARISMOS TROCADOS? O texto cita art. ${a.rot} e art. ${b.rot} (mesmos algarismos em outra ordem)` +
        (fora.length ? `; o CPC vai até o art. 1.072, então art. ${fora.join(" e ")} do CPC não existe` : "") +
        ". Pode ser erro de digitação do julgado: confira qual dispositivo a ementa e o dispositivo usam antes de citar.";
    }
  return "";
}

// Para cada peça que NÃO é acórdão, o índice (em `unicos`) do ACÓRDÃO do mesmo
// julgamento (mesma data, nunca sem data) que a contém letra a letra. Entre vários
// acórdãos candidatos, o maior; empate, o primeiro. Exportada para teste.
export function contencoesDoInteiro(unicos, dataDe) {
  const m = new Map();
  for (let i = 0; i < unicos.length; i++) {
    const [s, corpo] = unicos[i];
    if (s.tipo === "ACÓRDÃO" || !corpo) continue;
    const d = dataDe(s);
    if (!d) continue;
    let melhor = -1;
    for (let j = 0; j < unicos.length; j++) {
      const [sj, cj] = unicos[j];
      if (j === i || sj.tipo !== "ACÓRDÃO" || dataDe(sj) !== d) continue;
      if (cj.length <= corpo.length || !cj.includes(corpo)) continue;
      if (melhor < 0 || cj.length > unicos[melhor][1].length) melhor = j;
    }
    if (melhor >= 0) m.set(i, melhor);
  }
  return m;
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
// v1.30.0: lista compacta de "mesmo número": agrupa por data de julgamento ("18/08/2026: ACÓRDÃO nº1, RELATÓRIO nº2, VOTO nº3"),
// e só repete o relator quando ele muda dentro do grupo; relator único vai uma vez no fim. Antes: uma entrada por documento.
export function listaMesmoNumero(docs, quandoDe) {
  const relUnico = new Set(docs.map((d) => relator(d.s)).filter((r) => r !== "—"));
  const grupos = new Map();
  for (const d of docs) { const q = quandoDe(d.s); if (!grupos.has(q)) grupos.set(q, []); grupos.get(q).push(d); }
  const partes = [...grupos.entries()].map(([q, ds]) => {
    const tipos = ds.map((d) => `${d.s.tipo || ""} nº${d.n}` + (relUnico.size > 1 && relator(d.s) !== "—" ? ` (Rel. ${relator(d.s)})` : "")).join(", ");
    return `${q}: ${tipos}`;
  });
  return partes.join("; ") + (relUnico.size === 1 ? `; Rel. ${[...relUnico][0]}` : "");
}

export function linhasDeSinais(s, textoInteiro) {
  const linhas = [];
  if (ehPrimeiroGrau(s))
    linhas.push(
      "- ⚠️ 1º grau: sentença não é precedente; serve para ver como o juízo decide, não para citar como jurisprudência."
    );
  if (ehTurmaRecursal(s))
    linhas.push(
      "- ⚠️ Turma Recursal (Juizados): vale no rito do Juizado; no rito comum é só persuasivo. Diga o órgão na citação."
    );
  const a = ancoras(textoInteiro);
  if (a.length)
    linhas.push(
      `- Cita: ${a.join(" · ")} — citado pelo julgado; confirme a situação na fonte.`
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

// v1.31.0 (H01): `origem: "busca"` marca o recibo gravado a partir de uma BUSCA (texto idêntico ao do inteiro teor: 1.224 de 1.224 ids em
// comum no cache de 14/10/2026), que NÃO prova que a lista de documentos do processo esteja completa. Recibo do inteiro teor não leva o campo.
export function recibo(s, agora = new Date(), origem = "inteiro") {
  const id = idDocumento(s);
  const texto = limpar(s.ds_modelo_documento || "", 0);
  if (!/^\d{1,20}$/.test(id) || !texto) return null;
  return {
    id_documento: id,
    nr_processo: s.nr_processo ?? null,
    tipo: s.tipo ?? null,
    data_julgamento: s.dtjulgamento_str || dataBr(s.dtjulgamento || "") || null,
    // v1.10.0: classe, relator e órgão DO ÍNDICE, para a busca local de recibos listar sem reabrir o texto
    // (o órgão do índice erra a câmara; quem cita usa o fecho — extrairOrgaoComOrigem sobre `texto`).
    classe: s.ds_classe_judicial ?? null,
    relator_indice: relator(s) !== "—" ? relator(s) : null,
    orgao_indice: orgao(s) !== "—" ? orgao(s) : null,
    obtido_em: agora.toISOString(),
    ...(origem === "busca" ? { origem: "busca" } : {}),
    texto,
    ...alheios(texto, s.tipo),
  };
}

// v1.7.16: o que no `texto` NÃO é palavra do TJRO (ementa de outro julgado transcrita no voto, voto
// vencido), para o lint de citações avisar em vez de aprovar. Lógica e medição em server/custodia.js.
function alheios(texto, tipo) {
  try {
    return { ...camposAlheios(texto, tipo), custodia_v: CUSTODIA_VERSAO, normalizacao: "trechos em bruto, recortados de `texto` — normalize com a sua própria função" };
  } catch {
    return {};   /* recibo é conferência extra: falha aqui não pode custar o texto */
  }
}

const INDICE_BUSCA = ".busca-indice.json";
export const RECIBOS_BUSCA_MAX_BYTES = (env = process.env) => Math.max(10, Number(env.TJRO_MCP_RECIBOS_BUSCA_MAX_MB) || 300) * 1024 * 1024;
const lerIndiceBusca = (pasta) => {
  try { const d = JSON.parse(fs.readFileSync(path.join(pasta, INDICE_BUSCA), "utf8")); return d && typeof d === "object" ? d : {}; } catch { return {}; }
};
const gravarIndiceBusca = (pasta, idx) => {
  const tmp = path.join(pasta, `.${INDICE_BUSCA}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(idx));
  fs.renameSync(tmp, path.join(pasta, INDICE_BUSCA));
};
// Recibos de busca ocupam espaço sem que ninguém os tenha pedido: acima do teto (300 MB), os MAIS ANTIGOS saem até 80% do teto.
// Nunca se apaga recibo de inteiro teor (o arquivo é relido e só some se ainda for "busca").
export function podarRecibosDeBusca(pasta = dirRecibos(), maxBytes = RECIBOS_BUSCA_MAX_BYTES()) {
  let removidos = 0;
  try {
    const idx = lerIndiceBusca(pasta);
    let total = Object.values(idx).reduce((a, v) => a + (Number(v[0]) || 0), 0);
    if (total <= maxBytes) return 0;
    for (const [id, v] of Object.entries(idx).sort((x, y) => (x[1][1] || 0) - (y[1][1] || 0))) {
      if (total <= maxBytes * 0.8) break;
      const cam = path.join(pasta, `${id}.json`);
      try {
        const r = JSON.parse(fs.readFileSync(cam, "utf8"));
        if (r && r.origem === "busca") { fs.unlinkSync(cam); removidos++; }
      } catch { /* sumiu ou ilegível: só sai do índice */ }
      total -= Number(v[0]) || 0;
      delete idx[id];
    }
    gravarIndiceBusca(pasta, idx);
  } catch { /* poda é higiene, nunca condição */ }
  return removidos;
}

// `origem: "busca"` (busca e linha do tempo): NUNCA sobrescreve recibo existente (o do inteiro teor vale mais) e entra no índice de poda.
// `origem: "inteiro"` (padrão): sobrescreve, e assim promove o recibo de busca a recibo completo.
export function gravarRecibos(data, pasta = dirRecibos(), { origem = "inteiro" } = {}) {
  let n = 0;
  try {
    fs.mkdirSync(pasta, { recursive: true });
    const daBusca = origem === "busca";
    const novos = {};
    const promovidos = [];
    for (const h of data?.hits?.hits || []) {
      const r = recibo(h._source || {}, new Date(), origem);
      if (!r) continue;
      const alvo = path.join(pasta, `${r.id_documento}.json`);
      if (daBusca && fs.existsSync(alvo)) continue;
      const tmp = path.join(pasta, `.${r.id_documento}.${process.pid}.tmp`);
      const bruto = JSON.stringify(r);
      fs.writeFileSync(tmp, bruto);
      fs.renameSync(tmp, alvo);
      if (daBusca) novos[r.id_documento] = [Buffer.byteLength(bruto), Date.now()];
      else promovidos.push(r.id_documento);
      n++;
    }
    if (daBusca && n) {
      gravarIndiceBusca(pasta, { ...lerIndiceBusca(pasta), ...novos });
      podarRecibosDeBusca(pasta);
    } else if (promovidos.length) {
      const idx = lerIndiceBusca(pasta);
      if (promovidos.some((id) => id in idx)) { for (const id of promovidos) delete idx[id]; gravarIndiceBusca(pasta, idx); }
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
    if (c?.obtido_em && agora - Date.parse(c.obtido_em) <= CACHE_INTEIRO_MS) return c;
  } catch {
    /* sem cache exato: tenta um que cubra os tipos pedidos */
  }
  // v1.33.0: o mesmo processo lido com mais tipos ("ACÓRDÃO_EMENTA_RELATÓRIO_VOTO") cobre o pedido de menos tipos ("ACÓRDÃO"); antes refazia a requisição.
  try {
    const digitos = String(nr || "").replace(/\D/g, "");
    if (!digitos) return null;
    const pedidos = new Set((tipo || []).map((t) => String(t).toUpperCase()));
    const chaveDeTipos = (t) => new Set(String(t).split("_").map((x) => x.toUpperCase()));
    let melhor = null;
    for (const f of fs.readdirSync(pasta)) {
      const m = /^inteiro-(\d+)-(.*)\.json$/.exec(f);
      if (!m || m[1] !== digitos) continue;
      const tem = chaveDeTipos(m[2]);
      if (![...pedidos].every((t) => tem.has(t))) continue;
      const c = JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8"));
      if (!c?.obtido_em || agora - Date.parse(c.obtido_em) > CACHE_INTEIRO_MS) continue;
      if (!melhor || Date.parse(c.obtido_em) > Date.parse(melhor.obtido_em)) melhor = c;
    }
    if (!melhor) return null;
    const hits = (melhor.data?.hits?.hits || []).filter((h) => pedidos.has(String((h._source || {}).tipo || "").toUpperCase()));
    if (!hits.length) return null;
    return { ...melhor, data: { ...melhor.data, hits: { ...melhor.data.hits, hits } } };
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
export const VERSAO = "1.35.0";
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
  `_Há uma versão mais nova desta extensão (v${novaVersao}; a instalada é a v${VERSAO})._ Se o usuário quiser, pode pedir ao Claude para baixar a versão já conferida, ou baixar em: ${RELEASES_PAGINA}`;

let checagem = null;
let avisoDado = false;
export function iniciarChecagemVersao(opcoes) {
  if (!checagem) checagem = checarVersaoNova(opcoes);
  return checagem;
}
// Crédito + (uma vez) aviso de versão. Nunca atrasa a resposta além do timeout da checagem.
let navegadorAvisado = false;
export async function comAvisos(texto) {
  let base = comCredito(texto);
  if (identidadeAtual === "navegador" && !navegadorAvisado) {
    navegadorAvisado = true;
    base = `${base}\n\n${AVISO_MODO_NAVEGADOR}`;
  }
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
  // O marcador do limitador tem precedência: a prosa do disjuntor cita "suspeita de
  // automação" e não pode ser confundida com a página de bloqueio do portal.
  if (/\[espera_segundos=\d+ tipo=limite_de_ritmo\]/.test(m)) return "limite_de_ritmo";
  if (/verificação de navegador/i.test(m)) return "desafio_navegador";
  if (/cabeçalho defeituoso/i.test(m)) return "resposta_corrompida";
  if (/robotiza|suspeita de automação/i.test(m)) return "bloqueio_robotizacao";
  if (/evitando novas tentativas|Muitas consultas em pouco tempo/i.test(m)) return "limite_de_ritmo";
  if (/tempo esgotado/i.test(m)) return "timeout";
  if (/^HTTP \d{3}/i.test(m)) return "http_" + m.slice(5, 8);
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|certificate|CERT_/i.test(m)) return "rede_ou_certificado";
  return "outro";
}

// Erros que o próprio usuário resolve esperando não merecem relato.
const SEM_RELATO = new Set(["limite_de_ritmo"]);

/** Estado resumido do limitador para o diário de erros: nível e consultas no último minuto (nunca lança). */
export function estadoLimitadorResumo(agora = Date.now()) {
  try {
    const e = comTrava(() => lerEstado());
    return { nivel: e.indiceJanela + 1, de: ESCADA_JANELA_MS.length, ultimoMinuto: (e.requisicoes || []).filter((t) => agora - t <= 60_000).length, bloqueios: (e.incidentes || []).length };
  } catch {
    return null;
  }
}

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
  if (tipo === "desafio_navegador" || tipo === "bloqueio_robotizacao" || tipo === "resposta_corrompida") {
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
      tipo === "resposta_corrompida"
        ? "Esperar ou tentar de novo não resolve: o tribunal está recusando as consultas desta extensão. " +
            "Enquanto isso, a pesquisa funciona direto no site do tribunal, pelo navegador: https://juris.tjro.jus.br"
        : sis
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
  // A retomada automática lê este marcador; a mensagem amigável não pode engoli-lo.
  const marcador = String(mensagem || "").match(/\[espera_segundos=\d+ tipo=[a-z_]+\]/);
  if (marcador && !partes.some((x) => x.includes(marcador[0]))) partes.push(marcador[0]);
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
    partes.push("_Este erro foi anotado no diário local da extensão (só dados técnicos: ferramenta, tipo, versão, sem texto de busca nem número de processo). `diagnostico_erros_tjro` resume o histórico e gera um relatório para análise._");
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
    "o cadastro mostra a câmara ATUAL do processo (relatores realocados para a 3ª Câmara Cível levaram seus processos), não a que julgou, e julgados úteis de outra família (Câmara Especial, Turma Recursal) ficam de fora com o filtro."
  );
}
