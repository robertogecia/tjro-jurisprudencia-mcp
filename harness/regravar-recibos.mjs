#!/usr/bin/env node
// Refaz a custódia (trechos_transcritos / trecho_divergente / texto_voz_propria) dos recibos já gravados, offline: só
// com o `texto` e o `tipo` que estão no arquivo, nenhuma requisição ao portal. Desde a v1.11.0 o próprio servidor faz
// isso ao iniciar para os recibos com `custodia_v` diferente da heurística atual; este script serve para ver o efeito
// antes (dry-run) ou para FORÇAR o recálculo de todos.
//   node harness/regravar-recibos.mjs                       mostra quantos estão desatualizados (carimbo diferente)
//   node harness/regravar-recibos.mjs --gravar              regrava só os desatualizados
//   node harness/regravar-recibos.mjs --recalcular [--gravar]   ignora o carimbo: recalcula todos
import { recalcularRecibos } from "../server/recibos.js";
import { dirRecibos } from "../server/lib.js";
import { CUSTODIA_VERSAO } from "../server/custodia.js";

const gravar = process.argv.includes("--gravar"), forcar = process.argv.includes("--recalcular");
const r = await recalcularRecibos({ gravar, forcar });
for (const [n, antes, depois] of r.mudancas) console.log(`  ${n}: ${antes} → ${depois} caracteres transcritos`);
console.log(
  `${r.total} recibos em ${dirRecibos()} (custódia v${CUSTODIA_VERSAO}); ${r.desatualizados} ${forcar ? "recalculados" : "com carimbo diferente"}; ` +
    `${r.alterados} com custódia diferente${gravar ? `; ${r.regravados} regravados` : " (use --gravar)"}`
);
