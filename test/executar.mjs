// Lista os arquivos de teste em JavaScript (o cmd/PowerShell do Windows não expande "test/*.test.js").
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir = path.dirname(fileURLToPath(import.meta.url));
const arquivos = readdirSync(dir).filter((f) => f.endsWith(".test.js")).sort().map((f) => path.join(dir, f));
const r = spawnSync(process.execPath, ["--test", ...arquivos], { stdio: "inherit" });
process.exit(r.status ?? 1);
