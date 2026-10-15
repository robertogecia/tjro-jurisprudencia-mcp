// Teste de 30 segundos: o servidor sobe e responde? Uso: node testar-servidor.mjs [pasta do servidor]
// (sem argumento, usa a pasta TJRO-Jurisprudencia-MCP na pasta pessoal). Não consulta o tribunal.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const pasta = process.argv[2] || path.join(os.homedir(), "TJRO-Jurisprudencia-MCP");
const index = path.join(pasta, "server", "index.js");
if (!fs.existsSync(index)) { console.error(`Não achei ${index}. Rode primeiro o instalador.`); process.exit(1); }
const filho = spawn(process.execPath, [index], { stdio: ["pipe", "pipe", "pipe"], cwd: pasta });
let buf = "", erro = "";
filho.stderr.on("data", (d) => (erro += d));
const esperando = new Map();
filho.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!linha) continue;
    try { const m = JSON.parse(linha); if (m.id !== undefined && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id); } } catch { /* linha que não é JSON */ }
  }
});
const chamar = (id, method, params) => new Promise((ok, falha) => {
  const t = setTimeout(() => falha(new Error(`sem resposta a ${method} em 20 s`)), 20000);
  esperando.set(id, (m) => { clearTimeout(t); ok(m); });
  filho.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});
try {
  const ini = await chamar(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "teste", version: "1" } });
  filho.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const lista = await chamar(2, "tools/list", {});
  const nomes = (lista.result?.tools || []).map((t) => t.name);
  console.log(`OK: ${ini.result?.serverInfo?.name} ${ini.result?.serverInfo?.version}, ${nomes.length} ferramentas`);
  if (!nomes.includes("buscar_jurisprudencia_tjro") || !nomes.includes("configurar_identificacao_tjro")) throw new Error("faltam ferramentas esperadas: " + nomes.join(", "));
  filho.kill(); process.exit(0);
} catch (e) {
  console.error("FALHOU:", e.message); if (erro) console.error(erro.slice(0, 600)); filho.kill(); process.exit(1);
}
