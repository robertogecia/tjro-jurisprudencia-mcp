/**
 * Funções puras do servidor MCP TJRO — sem I/O de rede, sem estado.
 * Separadas de index.js para permitir testes automatizados diretos
 * (index.js conecta o transporte MCP no import e não pode ser importado em teste).
 */
import he from "he";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
export const citacao = (s) => {
  const partes = [`TJ-RO - ${s.ds_classe_judicial || s.tipo || "Julgado"}: ${cnj(s.nr_processo || "")}`];
  const rel = relator(s);
  if (rel !== "—") partes.push(`Relator: ${rel}`);
  const dj = s.dtjulgamento_str || dataBr(s.dtjulgamento);
  if (dj) partes.push(`Data de Julgamento: ${dj}`);
  const org = orgao(s);
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

// Índice é indício, texto é prova: o campo "Câmara" do cadastro do TJRO já saiu
// errado (índice "3ª Câmara Cível", acórdão "1ª Câmara Cível" duas vezes —
// 04/09/2026), e o JusRatio herda o mesmo cadastro. Extração conservadora: só
// devolve quando o texto é unânime (uma única câmara mencionada).
const TIPO_CAMARA = { civel: "Cível", criminal: "Criminal", especial: "Especial" };
const ORDINAL = { primeira: "1", segunda: "2", terceira: "3", quarta: "4", quinta: "5" };
// Só o CABEÇALHO (timbre): a fundamentação cita câmaras alheias ("como decidiu a
// 4ª Câmara Cível", "1ª Câmara Especializada do TJSP") e isso ou desligava a
// checagem ou, pior, apontava a câmara alheia como a do julgado (red team
// 04/09/2026, achados 5 e 7). "\b" após o tipo impede "Especializada" ≈ "Especial".
export const extrairOrgaoDoTexto = (texto) => {
  const cab = String(texto || "").slice(0, 600);
  const achados = new Set();
  for (const m of cab.matchAll(/\b(\d{1,2}\s*[ªa°º]|primeira|segunda|terceira|quarta|quinta)\s*C[âa]mara\s+(C[íi]vel|Criminal|Especial)\b/gi)) {
    const n = ORDINAL[fold(m[1])] || m[1].replace(/\D/g, "");
    achados.add(`${n}ª Câmara ${TIPO_CAMARA[fold(m[2])] || m[2]}`);
  }
  return achados.size === 1 ? [...achados][0] : null;
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
  const c = o.consulta.trim();
  const q = o.termoExato && c ? `"${escapeLucene(c)}"` : escapeLucene(o.consulta);
  // A API espera "tipo" como string ("A,B" p/ OR); array JSON zera os resultados,
  // mesmo com 1 único elemento.
  const fields = { query: q, tipo: o.tipo.join(",") };
  if (o.grau === 1 || o.grau === 2) fields.grau_jurisdicao = String(o.grau);
  // O índice grava classes em CAIXA ALTA e o filtro .raw é sensível a caixa.
  if (o.classe) fields["ds_classe_judicial.raw"] = o.classe.toUpperCase();
  if (o.orgaoColegiado) fields["ds_orgao_julgador_colegiado.raw"] = o.orgaoColegiado;
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
export function diagnosticarRespostaNaoJson(contentType, texto) {
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
const SUCESSOS_PARA_RELAXAR = 100; // sucessos seguidos no nível atual antes de afrouxar 1 degrau
const BACKOFF_INICIAL_MS = 10 * 60_000; // 10 min na primeira detecção de bloqueio (disjuntor reativo)
const BACKOFF_MAXIMO_MS = 60 * 60_000; // nunca ultrapassa 1h de recuo automático
// Intervalo mínimo entre requisições: sem isso o teto da janela permite 10
// disparos no MESMO segundo — o padrão "metralhadora" que WAF detecta. Em vez
// de recusar, a chamada espera sua vez (a vaga é reservada na transação, então
// chamadas concorrentes recebem instantes distintos, sem acordar todas juntas).
const ESPACAMENTO_MIN_MS = 2_000;
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
          "Para jurisprudência recente, uma base com busca semântica pode atender enquanto isso.",
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
export function registrarBloqueioDetectado(agora = Date.now(), operacao = "?", opts = {}) {
  const { subirEscada = true, esperaMinimaMs = 0 } = opts;
  transacao((e) => {
    // Fotografa o que estava acontecendo ANTES de mexer no estado — é isso que
    // permite descobrir depois se o bloqueio veio de rajada nossa ou de algo
    // fora do nosso controle (ex.: outra máquina no mesmo IP, ou aperto do WAF).
    const reqs = e.requisicoes || [];
    const incidente = {
      quando: agora,
      operacao,
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
    "**Controle de ritmo do MCP TJRO**",
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
        `intervalo desde a anterior: ${intervalo} · operação: ${i.operacao}`
    );
  }

  // Leitura do padrão: rajada nossa (muitas consultas antes) x algo fora do
  // nosso controle (bloqueio mesmo com pouquíssimo tráfego daqui).
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
        "próprio portal apertando o filtro). Espaçar mais as consultas aqui tende a não resolver."
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
export function registrarSucesso() {
  transacao((e) => {
    e.backoffMs = BACKOFF_INICIAL_MS;
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

export function _limparCacheParaTeste() {
  cacheRespostas.clear();
}

function cacheLer(chave, agora) {
  const item = cacheRespostas.get(chave);
  if (!item) return null;
  if (agora - item.quando > CACHE_TTL_MS) {
    cacheRespostas.delete(chave);
    return null;
  }
  return item.dados;
}

function cacheGravar(chave, dados, agora) {
  if (cacheRespostas.size >= CACHE_MAX_ENTRADAS) {
    cacheRespostas.delete(cacheRespostas.keys().next().value); // descarta a mais antiga
  }
  cacheRespostas.set(chave, { dados, quando: agora });
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
  if (ehBloqueio || r.status === 403 || r.status === 429) {
    const campos = body?.fields || {};
    const operacao = campos.nr_processo && !campos.query ? "inteiro_teor" : "busca";
    const retryAfterMs = (Number(r.headers.get("retry-after")) || 0) * 1000;
    registrarBloqueioDetectado(Date.now(), operacao, {
      subirEscada: ehBloqueio, // status seco arma o disjuntor, mas não alarga a janela
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
export function formatBusca(data, consulta, tipo, ordenacao, pagina, porPagina, filtros = [], nota = "", termoExato = false) {
  const hitsObj = data.hits || {};
  const total = (hitsObj.total || {}).value || 0;
  const hits = hitsObj.hits || [];
  const out = [];
  if (nota) out.push(nota.trimEnd());
  const criterio = termoExato
    ? `contêm a expressão exata "${consulta}"`
    : `contêm ao menos um dos termos de "${consulta}" (busca OR; ementa e acórdão do MESMO julgado contam separado)`;
  out.push(
    `**${total} documento(s)** ${criterio} · tipo: ${tipo.join(", ")} · ordenação: ${ordenacao} · página ${pagina}`
  );
  if (total > 5000 && !termoExato)
    out.push(
      '_Dica: para restringir, use operador AND na consulta (ex.: "dano AND moral") ou termo_exato=true para expressão exata._'
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
              '"negativação". Tente sinônimos, termos mais amplos, ou o curinga final ' +
              '(ex.: "consign*" pega consignado/consignação). Para jurisprudência de 2020 em ' +
              "diante, uma base com busca semântica tende a achar o que a busca por palavras não acha."
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
  const resultados = hits.map((h) => resultadoDe(limpar((h._source || {}).ds_modelo_documento || "", 0)));
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
    const linhas = [
      `\n---\n**${inicio + i}. ${s.tipo} · ${s.ds_classe_judicial || ""}**`,
      `- Processo: ${cnj(s.nr_processo || "")}`,
      `- Id. do documento: ${idDocumento(s) || "—"} (chave única desta decisão)`,
      `- Relator(a): ${relator(s)}`,
      `- Órgão: ${orgao(s)} (${s.grau_jurisdicao}º grau)`,
      `- Julgado em: ${s.dtjulgamento_str || s.dtjulgamento || "—"}${assunto}`,
      `- Citação: ${citacao(s)}`,
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
  const out = [
    `**Processo ${cnj(nrProcesso)} — ${s0.ds_classe_judicial || ""}**`,
    `Relator(a): ${relator(s0)} · ${orgao(s0)} · Julgado em ${s0.dtjulgamento_str || s0.dtjulgamento || "—"}`,
    `Citação: ${citacao(s0)}` + (idDocumento(s0) ? ` · id ${idDocumento(s0)}` : ""),
    `Inteiro teor no portal: ${link(s0)}`,
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
      (idDocumento(s) ? ` · id ${idDocumento(s)}` : "");
    if (usado >= ORCAMENTO_INTEIRO) {
      out.push(
        "\n_(limite de tamanho da resposta atingido — peças restantes omitidas; chame novamente filtrando por tipo ou abra o link do portal acima)_"
      );
      break;
    }
    // Índice × texto: o campo do cadastro pode divergir do que o acórdão diz.
    const avisos = [];
    const orgTexto = extrairOrgaoDoTexto(corpo);
    if (orgTexto && orgao(s) !== "—" && fold(orgTexto) !== fold(orgao(s)))
      avisos.push(
        `⚠️ Índice: ${orgao(s)} · cabeçalho desta peça: ${orgTexto} — prevalece o texto (o cadastro do portal já saiu errado; cite pela câmara que o acórdão declara).`
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
