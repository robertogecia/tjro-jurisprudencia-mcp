// Relatório de bloqueios do portal do TJRO (v1.28.0, 12/10/2026).
//
// Objetivo: descobrir (1) O QUE aconteceu para disparar cada bloqueio e (2) qual é o ritmo seguro hoje, a partir de DADOS e
// não de palpite. Para isso cada requisição ao portal deixa uma linha num livro-razão local (`~/.tjro-jurisprudencia-ritmo.jsonl`):
// instante, quem fez (implementação Node ou Python, pid, identificação), o tipo de operação e o desfecho. NUNCA grava texto de
// busca, nome de parte, relator nem número de processo. Com o livro-razão dá para medir o intervalo que precedeu cada bloqueio,
// o tamanho da rajada, se havia outro processo no mesmo IP e a taxa de bloqueio por faixa de intervalo.
//
// O relatório recomenda; quem altera os parâmetros é uma pessoa (nunca o programa sozinho): afrouxar o ritmo sem evidência já
// custou um bloqueio de 10 minutos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ARQUIVO_RITMO = path.join(os.homedir(), ".tjro-jurisprudencia-ritmo.jsonl");
// Lido a cada chamada: os testes apontam para um arquivo temporário (TJRO_MCP_ARQUIVO_RITMO) e nunca tocam o livro-razão real.
// Sob o test runner do Node (NODE_TEST_CONTEXT) e sem arquivo explícito, o livro-razão fica DESLIGADO: um teste que chame post()
// com fetch falso jamais pode gravar no livro-razão real (já aconteceu uma vez, em 12/10/2026, e o arquivo foi apagado).
const arquivoRitmo = () => process.env.TJRO_MCP_ARQUIVO_RITMO || (process.env.NODE_TEST_CONTEXT ? null : ARQUIVO_RITMO);
export const RITMO_MAX_LINHAS = 3000;
const TAMANHO_PARA_RODAR = 700_000; // bytes; ~3000 linhas de ~200 B ficam abaixo disso, passou = roda o arquivo

// Faixas de intervalo (s) desde a requisição anterior de QUALQUER processo desta máquina. 5 s bloqueou e 6 s passou (23/09/2026).
export const FAIXAS_S = [
  [0, 5, "< 5 s"],
  [5, 6, "5–6 s"],
  [6, 7, "6–7 s"],
  [7, 10, "7–10 s"],
  [10, 30, "10–30 s"],
  [30, Infinity, "≥ 30 s"],
];

const pct = (a, b) => (b ? Math.floor((100 * a) / b + 0.5) : 0);
const utc = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16);

export function anotarRequisicao(reg, arquivo = arquivoRitmo()) {
  if (!arquivo) return;
  try {
    const linha = JSON.stringify({
      t: Math.round(reg.t),
      impl: reg.impl || "node",
      pid: reg.pid ?? process.pid,
      id: reg.id || null,
      op: reg.op || "?",
      res: reg.res || "ok", // ok | bloqueio | corrompida | desafio | http | rede
      status: reg.status ?? null,
      durMs: reg.durMs ?? null,
    });
    fs.appendFileSync(arquivo, linha + "\n", { mode: 0o600 });
    if (fs.statSync(arquivo).size > TAMANHO_PARA_RODAR) {
      const linhas = fs.readFileSync(arquivo, "utf-8").split("\n").filter(Boolean);
      const tmp = arquivo + ".tmp";
      fs.writeFileSync(tmp, linhas.slice(-RITMO_MAX_LINHAS).join("\n") + "\n", { mode: 0o600 });
      fs.renameSync(tmp, arquivo);
    }
  } catch {
    /* o livro-razão nunca derruba uma consulta */
  }
}

export function lerRitmo(arquivo = arquivoRitmo()) {
  if (!arquivo) return [];
  try {
    return fs
      .readFileSync(arquivo, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((x) => x && Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

const ehBloqueio = (r) => r.res === "bloqueio" || r.res === "corrompida" || r.res === "desafio";

// O que estava acontecendo no instante `t0` em que o portal recusou: sequência anterior, intervalo, rajada e outros processos.
export function contextoDoBloqueio(ritmo, t0, espacamentoMinMs, resposta = null) {
  const antes = ritmo.filter((r) => r.t < t0);
  const ult = antes[antes.length - 1];
  const gapAntesS = ult ? Math.round((t0 - ult.t) / 100) / 10 : null;
  const na = (ms) => antes.filter((r) => t0 - r.t <= ms).length;
  const pids = new Set(antes.filter((r) => t0 - r.t <= 120_000).map((r) => `${r.impl}:${r.pid}`));
  return {
    gapAntesS,
    abaixoDoMinimo: gapAntesS !== null && gapAntesS * 1000 < espacamentoMinMs,
    reqs30s: na(30_000),
    reqs60s: na(60_000),
    reqs300s: na(300_000),
    reqs24h: na(86_400_000),
    processos120s: pids.size,
    sequencia: antes.slice(-12).map((r) => ({ antesS: Math.round((t0 - r.t) / 100) / 10, impl: r.impl, res: r.res, op: r.op })),
    resposta,
  };
}

function veredito(i, espacamentoMinMs) {
  const c = i.contexto;
  if (i.tipo === "desafio_navegador") return "verificação de navegador do filtro (não é ritmo)";
  if (c) {
    if (c.abaixoDoMinimo) return `intervalo de ${c.gapAntesS} s, abaixo do mínimo de ${espacamentoMinMs / 1000} s (outro processo, sonda ou execução sem o limitador)`;
    if (c.reqs60s >= 6) return `rajada: ${c.reqs60s} consultas no minuto anterior`;
    if (c.processos120s >= 2) return `${c.processos120s} processos usando o portal ao mesmo tempo (o orçamento é somado, mas a rajada conjunta pode ter passado)`;
    if (c.reqs60s <= 2) return "pouco tráfego nesta máquina: o gatilho não parece ser o ritmo (identificação, rede ou aperto do filtro)";
    return "indeterminado (tráfego moderado, intervalo dentro do mínimo)";
  }
  if ((i.reqsUltimos60s ?? 0) <= 2) return "pouco tráfego (incidente anterior à v1.28: sem sequência detalhada)";
  return "incidente anterior à v1.28: sem sequência detalhada";
}

export function analisarBloqueios({ ritmo, incidentes = [], espacamentoMinMs = 7000, janelaMax = 10, agora = Date.now() }) {
  const n = ritmo.length;
  const faixas = FAIXAS_S.map(([a, b, nome]) => ({ nome, de: a, ate: b, reqs: 0, bloqueios: 0 }));
  let maxRajadaOk = 0;
  const rajadasBloq = [];
  for (let k = 0; k < n; k++) {
    const r = ritmo[k];
    const gapS = k ? (r.t - ritmo[k - 1].t) / 1000 : null;
    const rajada = ritmo.slice(0, k + 1).filter((x) => r.t - x.t <= 60_000).length;
    if (gapS !== null) {
      const f = faixas.find((f) => gapS >= f.de && gapS < f.ate);
      f.reqs += 1;
      if (ehBloqueio(r)) f.bloqueios += 1;
    }
    if (ehBloqueio(r)) rajadasBloq.push(rajada);
    else maxRajadaOk = Math.max(maxRajadaOk, rajada);
  }
  const bloqueios = ritmo.filter(ehBloqueio).length;
  const inicio = n ? ritmo[0].t : null;
  const diasCobertos = inicio ? Math.max(1, Math.round((agora - inicio) / 86_400_000)) : 0;
  const acimaDoMinimo = faixas.filter((f) => f.de * 1000 >= espacamentoMinMs);
  const reqsAcima = acimaDoMinimo.reduce((s, f) => s + f.reqs, 0);
  const blocAcima = acimaDoMinimo.reduce((s, f) => s + f.bloqueios, 0);
  const abaixo = faixas.filter((f) => f.ate * 1000 <= espacamentoMinMs);
  const reqsAbaixo = abaixo.reduce((s, f) => s + f.reqs, 0);
  const blocAbaixo = abaixo.reduce((s, f) => s + f.bloqueios, 0);
  return { n, bloqueios, inicio, diasCobertos, faixas, maxRajadaOk, rajadasBloq, reqsAcima, blocAcima, reqsAbaixo, blocAbaixo, incidentes, espacamentoMinMs, janelaMax };
}

export function recomendacao(a) {
  const minimo = 100;
  if (a.n < minimo) {
    return [
      `Dados insuficientes: ${a.n} requisições registradas (mínimo ${minimo} para recomendar mudança).`,
      "**Manter os parâmetros atuais.** O livro-razão passa a acumular a cada consulta; rode este relatório de novo depois.",
    ];
  }
  const out = [];
  const taxaAcima = pct(a.blocAcima, a.reqsAcima);
  if (a.blocAcima === 0 && a.reqsAcima >= minimo) {
    out.push(`Com intervalo ≥ ${a.espacamentoMinMs / 1000} s: ${a.reqsAcima} requisições, **nenhum bloqueio**. O espaçamento mínimo atual está adequado.`);
  } else if (a.blocAcima > 0) {
    out.push(`Com intervalo ≥ ${a.espacamentoMinMs / 1000} s ainda houve ${a.blocAcima} bloqueio(s) em ${a.reqsAcima} requisições (${taxaAcima}%): o gatilho NÃO é só o espaçamento; ver o veredito de cada incidente (identificação, rede, outro equipamento no mesmo IP ou aperto do filtro).`);
  }
  if (a.blocAbaixo > 0) {
    out.push(`Com intervalo abaixo de ${a.espacamentoMinMs / 1000} s: ${a.blocAbaixo} bloqueio(s) em ${a.reqsAbaixo} requisições (${pct(a.blocAbaixo, a.reqsAbaixo)}%). Não reduzir o espaçamento.`);
  }
  const faixaSemBloqueio = a.faixas.filter((f) => f.reqs >= 50 && f.bloqueios === 0 && f.de >= 5 && f.de * 1000 < a.espacamentoMinMs);
  if (faixaSemBloqueio.length && a.blocAcima === 0) {
    out.push(`Evidência para considerar afrouxar: faixa(s) ${faixaSemBloqueio.map((f) => f.nome).join(", ")} com ≥ 50 requisições e nenhum bloqueio. Decisão humana; a calibração de 23/09/2026 deu 5 s bloqueando.`);
  }
  out.push(`Maior rajada em 60 s SEM bloqueio: ${a.maxRajadaOk} consultas (teto configurado: ${a.janelaMax} por janela).`);
  return out;
}

export function formatarRelatorio(a, agora = Date.now()) {
  const L = [];
  L.push("**Relatório de bloqueios do portal do TJRO**");
  L.push(`- Livro-razão: ${a.n} requisições registradas${a.inicio ? ` desde ${utc(a.inicio)} UTC (${a.diasCobertos} dia(s))` : ""}; bloqueios no livro-razão: ${a.bloqueios}.`);
  L.push(`- Parâmetros atuais: espaçamento mínimo ${a.espacamentoMinMs / 1000} s; teto de ${a.janelaMax} consultas por janela.`);
  if (a.n) {
    L.push("\n**Taxa de bloqueio por intervalo desde a requisição anterior (qualquer processo desta máquina):**");
    L.push("| Intervalo | Requisições | Bloqueios | Taxa |");
    L.push("|---|---|---|---|");
    for (const f of a.faixas) L.push(`| ${f.nome} | ${f.reqs} | ${f.bloqueios} | ${f.reqs ? pct(f.bloqueios, f.reqs) + "%" : "—"} |`);
  }
  const inc = a.incidentes || [];
  L.push(`\n**Incidentes de bloqueio: ${inc.length}** (mais recentes primeiro; o que disparou cada um)`);
  if (!inc.length) L.push("- Nenhum.");
  for (const i of [...inc].reverse().slice(0, 10)) {
    const c = i.contexto;
    L.push(`- ${utc(i.quando)} UTC · ${i.operacao}${i.identidade ? ` · ${i.identidade}` : ""}${i.tipo ? ` · ${i.tipo}` : ""} → **${veredito(i, a.espacamentoMinMs)}**`);
    if (c) {
      L.push(`  - intervalo desde a anterior: ${c.gapAntesS === null ? "—" : c.gapAntesS + " s"}; consultas em 30 s / 60 s / 5 min / 24 h: ${c.reqs30s} / ${c.reqs60s} / ${c.reqs300s} / ${c.reqs24h}; processos ativos (2 min): ${c.processos120s}`);
      if (c.sequencia?.length) L.push(`  - últimas ${c.sequencia.length} antes do bloqueio (segundos antes · origem · desfecho): ${c.sequencia.map((s) => `${s.antesS}s ${s.impl} ${s.res}`).join("; ")}`);
      if (c.resposta) L.push(`  - resposta do portal: status ${c.resposta.status ?? "—"}, tipo ${c.resposta.ctype || "—"}, servidor ${c.resposta.server || "—"}, retry-after ${c.resposta.retryAfter ?? "—"}, ${c.resposta.bytes ?? "—"} bytes; assinatura: "${c.resposta.assinatura || ""}"`);
    }
  }
  L.push("\n**Recomendação (a partir dos dados; nada é alterado automaticamente):**");
  for (const r of recomendacao(a)) L.push(`- ${r}`);
  L.push("\n_Privacidade: o livro-razão guarda só horário, operação, origem e desfecho; nunca texto de busca, partes ou números de processo._");
  return L.join("\n");
}
