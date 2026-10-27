// Lista os arquivos de teste em JavaScript (o cmd/PowerShell do Windows não expande "test/*.test.js").
// Red team 22/10/2026 (achado 19): os testes rodam com HOME/USERPROFILE e as pastas TJRO_MCP_* apontando para uma
// pasta temporária nova, para que nenhum teste grave na pasta real do usuário (~/.tjro-jurisprudencia-recibos etc.),
// mesmo um teste que esqueça de redirecionar a própria pasta. A pasta temporária fica em os.tmpdir().
import { readdirSync, mkdtempSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
const dir = path.dirname(fileURLToPath(import.meta.url));
const arquivos = readdirSync(dir).filter((f) => f.endsWith(".test.js")).sort().map((f) => path.join(dir, f));
const casa = mkdtempSync(path.join(os.tmpdir(), "tjro-teste-home-"));
mkdirSync(path.join(casa, "Downloads"));
const env = {
  ...process.env,
  HOME: casa,
  USERPROFILE: casa,
  TJRO_MCP_DIR_RECIBOS: path.join(casa, ".tjro-jurisprudencia-recibos"),
  TJRO_MCP_DIR_CACHE: path.join(casa, ".tjro-jurisprudencia-cache"),
  TJRO_MCP_ARQUIVO_AVISO_VERSAO: path.join(casa, ".tjro-jurisprudencia-aviso-versao.json"),
  TJRO_MCP_ARQUIVO_ESTADO_LIAME: path.join(casa, ".tjro-jurisprudencia-liame-estado.json"),
  // o lint de citações é só LIDO da instalação real da skill (o teste o executa sobre recibos em os.tmpdir())
  TJRO_LINT_CITACOES:
    process.env.TJRO_LINT_CITACOES || path.join(os.homedir(), ".claude/skills/peticao-rg/scripts/lint_citacoes.py"),
};
const r = spawnSync(process.execPath, ["--test", ...arquivos], { stdio: "inherit", env });
process.exit(r.status ?? 1);
