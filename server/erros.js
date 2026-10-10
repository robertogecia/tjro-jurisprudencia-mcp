// Diário de erros e diagnóstico (v1.26, 10/10/2026). Registra, em arquivo local, as falhas de TODAS as ferramentas, só com dado técnico, para
// análise e correção depois. Privacidade: NUNCA grava texto de busca, grupos, nome de relator/parte nem número de processo; a mensagem passa
// por `sanitizar`. O registro jamais pode quebrar uma ferramenta: tudo vai dentro de try/catch.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tipoDoErro, VERSAO, estadoLimitadorResumo, ISSUES_NOVA } from "./lib.js";

export const MAX_LINHAS = 500;
const MAX_BYTES = 400_000;
let arquivo = path.join(os.homedir(), ".tjro-jurisprudencia-erros.jsonl");
export const arquivoDeErros = () => arquivo;
export const _definirArquivoParaTeste = (p) => { arquivo = p; };

// Valores que podem aparecer nos parâmetros sem expor caso: enumerações e números.
const VALORES_SEGUROS = new Set(["tipo", "modo", "ordenacao", "grau", "pagina", "por_pagina", "limite", "ano_inicio", "ano_fim", "classe_judicial", "resultado", "base", "orgao_colegiado"]);

export function sanitizar(texto, max = 300) {
  return String(texto ?? "")
    .replace(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g, "<nº-processo>")
    .replace(/\b\d{20}\b/g, "<nº-processo>")
    .replace(/\b\d{8,}\b/g, "<nº>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
    .replace(/https?:\/\/[^\s)"']+/g, (u) => { try { const x = new URL(u); return `${x.origin}${x.pathname}`; } catch { return "<url>"; } })
    .replace(/["“”][^"“”]{4,}["“”]/g, "«…»")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Descreve os parâmetros SEM o conteúdo: presença/tamanho, e valor só para enumerações seguras. */
export function descreverArgs(args) {
  const out = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (v === undefined || v === null || v === "") continue;
    if (VALORES_SEGUROS.has(k) && (typeof v === "number" || typeof v === "string" || Array.isArray(v))) out[k] = Array.isArray(v) ? v.map((x) => sanitizar(x, 40)) : typeof v === "string" ? sanitizar(v, 60) : v;
    else if (Array.isArray(v)) out[k] = Array.isArray(v[0]) ? `${v.length} grupo(s), ${v.reduce((a, g) => a + g.length, 0)} termo(s)` : `${v.length} item(ns)`;
    else if (typeof v === "string") out[k] = `<texto: ${v.length} car.>`;
    else out[k] = typeof v;
  }
  return out;
}

const MARCADORES_PARCIAIS = /\[PESQUISA (?:NÃO REALIZADA|INCOMPLETA)\b/;

/** Anota uma falha. `erro` (exceção) ou `texto` (resposta de erro da ferramenta). Nunca lança. */
export function registrarErro({ ferramenta, erro, texto, args, ms, parcial = false, agora = new Date() }) {
  try {
    const msg = erro ? String((erro && (erro.cause?.code ?? erro.message)) || erro) : String(texto || "");
    const http = (msg.match(/\bHTTP (\d{3})\b/) || [])[1] || null;
    const entrada = {
      quando: agora.toISOString(),
      versao: VERSAO,
      sistema: `${process.platform}/${process.arch} node ${process.version}`,
      ferramenta,
      tipo: tipoDoErro(msg),
      http,
      parcial,
      ms: ms ?? null,
      args: descreverArgs(args),
      limitador: estadoLimitadorResumo(agora.getTime()),
      mensagem: sanitizar(msg),
    };
    fs.appendFileSync(arquivo, JSON.stringify(entrada) + "\n", { mode: 0o600 });
    try {
      if (fs.statSync(arquivo).size > MAX_BYTES) {
        const linhas = fs.readFileSync(arquivo, "utf8").split("\n").filter(Boolean);
        fs.writeFileSync(arquivo, linhas.slice(-MAX_LINHAS).join("\n") + "\n", { mode: 0o600 });
      }
    } catch { /* rotação é só conforto */ }
    return entrada;
  } catch {
    return null;
  }
}

/** Envolve o `server.registerTool`: anota exceção, isError e marcadores [PESQUISA NÃO REALIZADA/INCOMPLETA] de qualquer ferramenta. */
export function comDiario(server) {
  const original = server.registerTool.bind(server);
  server.registerTool = (nome, cfg, handler) =>
    original(nome, cfg, async (a, extra) => {
      const t0 = Date.now();
      let r;
      try {
        r = await handler(a, extra);
      } catch (e) {
        registrarErro({ ferramenta: nome, erro: e, args: a, ms: Date.now() - t0 });
        throw e;
      }
      try {
        const t = r?.content?.[0]?.text ?? "";
        if (nome !== "diagnostico_erros_tjro" && (r?.isError || MARCADORES_PARCIAIS.test(t)) && tipoDoErro(t) !== "limite_de_ritmo")
          registrarErro({ ferramenta: nome, texto: t, args: a, ms: Date.now() - t0, parcial: !r?.isError });
      } catch { /* nunca quebra a ferramenta */ }
      return r;
    });
  return server;
}

export function lerErros(dias = 30, agora = Date.now()) {
  try {
    const corte = agora - dias * 86_400_000;
    return fs.readFileSync(arquivo, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && Date.parse(e.quando) >= corte);
  } catch {
    return [];
  }
}

// Causa provável e o que fazer, por tipo. "autor" = só o desenvolvedor corrige; "usuario" = esperar/usar o site; "portal" = fora do controle.
const CAUSAS = {
  limite_de_ritmo: ["Muitas consultas na janela do limitador local.", "Espere o tempo indicado; use `buscar_recibos_tjro` para o que já foi lido.", "usuario"],
  bloqueio_robotizacao: ["O filtro anti-robô do portal recusou a consulta.", "Espere a pausa terminar e faça UMA busca; o site juris.tjro.jus.br segue como alternativa. Se repetir com pouco tráfego, a causa é externa.", "portal"],
  desafio_navegador: ["O portal pediu verificação de navegador (WAF).", "Use o site pelo navegador; a extensão não contorna.", "portal"],
  resposta_corrompida: ["O portal devolveu a página de bloqueio com cabeçalho defeituoso.", "Aguarde; se for recorrente, o portal está recusando esta extensão. Relate com o relatório abaixo.", "portal"],
  timeout: ["O portal demorou mais que 45 s.", "Repita com por_pagina menor ou mais tarde.", "portal"],
  rede_ou_certificado: ["Falha de rede, DNS ou certificado.", "Confira a conexão/VPN/proxy. Se só esta extensão falha, relate.", "usuario"],
  outro: ["Erro não classificado.", "É o mais útil para o autor: envie o relatório abaixo.", "autor"],
};
const causaDe = (tipo) => CAUSAS[tipo] || (tipo.startsWith("http_5") ? ["O portal respondeu erro de servidor.", "Repita depois; se só acontece com certos filtros, pode ser consulta mal formada (relate).", "portal"] : tipo.startsWith("http_4") ? ["O portal recusou a requisição (4xx).", "Provável filtro com grafia errada ou consulta mal formada: relate.", "autor"] : CAUSAS.outro);

export function resumirErros(entradas, limite = 15) {
  if (!entradas.length) return "Nenhum erro registrado no período. O diário só anota falhas das ferramentas (nunca o que foi pesquisado).";
  const grupos = new Map();
  for (const e of entradas) {
    const k = `${e.tipo}|${e.ferramenta}`;
    const g = grupos.get(k) || { tipo: e.tipo, ferramenta: e.ferramenta, n: 0, parciais: 0, primeiro: e.quando, ultimo: e.quando, versoes: new Set(), amostra: e };
    g.n++; if (e.parcial) g.parciais++;
    if (e.quando < g.primeiro) g.primeiro = e.quando;
    if (e.quando >= g.ultimo) { g.ultimo = e.quando; g.amostra = e; }
    g.versoes.add(e.versao);
    grupos.set(k, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.n - a.n);
  const fmt = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const out = [`**Diário de erros** — ${entradas.length} registro(s) em ${lista.length} padrão(ões), de ${fmt(entradas[0].quando)} a ${fmt(entradas[entradas.length - 1].quando)}. Arquivo: ${arquivoDeErros()}`, ""];
  for (const g of lista.slice(0, Math.max(1, limite))) {
    const [causa, acao, quem] = causaDe(g.tipo);
    out.push(`- **${g.tipo}** em \`${g.ferramenta}\` · ${g.n}× (${g.parciais} parcial/incompleto) · de ${fmt(g.primeiro)} a ${fmt(g.ultimo)} · v${[...g.versoes].join(", v")}\n  Causa provável: ${causa} Ação: ${acao} _(quem corrige: ${quem})_\n  Última mensagem: ${g.amostra.mensagem}${g.amostra.http ? ` (HTTP ${g.amostra.http})` : ""} · parâmetros: ${JSON.stringify(g.amostra.args)}`);
  }
  const autor = lista.filter((g) => causaDe(g.tipo)[2] === "autor").reduce((a, g) => a + g.n, 0);
  out.push("", autor ? `⚠️ ${autor} registro(s) são de causa que o AUTOR pode corrigir: rode \`diagnostico_erros_tjro\` com relatorio=true e entregue o relatório.` : "Nenhum registro de causa corrigível pelo autor neste período (os demais vêm do portal, da rede ou do ritmo).");
  return out.join("\n");
}

export function relatorioParaAnalise(entradas, limite = 20) {
  const ult = entradas.slice(-limite);
  const linhas = ult.map((e) => `| ${e.quando.slice(0, 16).replace("T", " ")} | ${e.ferramenta} | ${e.tipo}${e.http ? ` (${e.http})` : ""}${e.parcial ? " parcial" : ""} | ${e.ms ?? ""} | ${e.limitador ? `${e.limitador.nivel}/${e.limitador.de}, ${e.limitador.ultimoMinuto}/min` : ""} | ${e.mensagem.replace(/\|/g, "/")} | ${JSON.stringify(e.args).replace(/\|/g, "/")} |`);
  return ["**Relatório técnico para análise** (sem texto de busca, sem nomes e sem número de processo; pode ser colado em issue pública)", "",
    `- Versão: ${VERSAO} · Sistema: ${process.platform}/${process.arch} · Node ${process.version}`, `- Registros: ${entradas.length} (últimos ${ult.length} abaixo)`, "",
    "| Quando | Ferramenta | Tipo | ms | Limitador | Mensagem | Parâmetros |", "|---|---|---|---|---|---|---|", ...linhas, "",
    `Abrir issue: ${ISSUES_NOVA}`].join("\n");
}
