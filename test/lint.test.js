// v1.7.16 — ponta a ponta com o CONSUMIDOR do recibo: o lint de citações da peça (skill peticao-rg, só no Mac
// do escritório). Grava recibos reais anonimizados com recibo() e pede ao lint que confira fichas do TJRO.
// Sem o lint na máquina (CI, outro computador), o teste é pulado — e diz isso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { recibo } from "../server/lib.js";

const LINT = process.env.TJRO_LINT_CITACOES || join(homedir(), ".claude/skills/peticao-rg/scripts/lint_citacoes.py");
const pula = existsSync(LINT) ? false : `lint de citações ausente em ${LINT}`;
const [acordao, voto] = JSON.parse(readFileSync(new URL("./fixtures/custodia-tjro.json", import.meta.url), "utf8")).documentos;
const NR = "7000000-00.2020.8.22.0001";

function pasta() {
  const p = mkdtempSync(join(tmpdir(), "recibos-lint-"));
  for (const [id, d] of [["900001", acordao], ["900002", voto]]) {
    const r = recibo({ id_processo_documento: id, nr_processo: NR, tipo: d.tipo, ds_modelo_documento: d.texto });
    writeFileSync(join(p, `${id}.json`), JSON.stringify(r));
  }
  // o mesmo VOTO gravado no formato ANTERIOR (sem os campos): controle de que é o campo novo que faz avisar
  writeFileSync(join(p, "900003.json"), JSON.stringify({ id_documento: "900003", nr_processo: "7000000-00.2020.8.22.0002", texto: voto.texto }));
  return p;
}

/** avisos + erros do lint para uma ficha do TJRO com `trecho` contra o recibo `id`. */
function confere(dir, id, trecho) {
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(dirname(LINT))})
from lint_citacoes import lint
dir_recibos, ident, trecho = sys.argv[1:4]
nr = "7000000-00.2020.8.22.0002" if ident == "900003" else ${JSON.stringify(NR)}
ficha = {"chave": nr, "tribunal": "TJRO", "orgao": "2ª Câmara Cível", "orgao_fonte": "fecho",
         "relator": "Des. Fulano", "julgamento": "2025-03-14", "id_documento": ident,
         "verificado_em": "2026-09-23", "verificacao": "inteiro teor lido", "trecho": trecho}
cita = [{"tipo": "paragrafo", "texto": "Nesse sentido (TJRO, %s, 2ª Câmara Cível, Rel. Des. Fulano, j. 14/03/2025)." % nr}]
r = lint({"blocks": cita, "dir_recibos": dir_recibos, "precedentes": [ficha]})
print(json.dumps({"erros": r.erros, "avisos": r.avisos}, ensure_ascii=False))
`;
  return JSON.parse(execFileSync("python3", ["-c", py, dir, id, trecho], { encoding: "utf8" }));
}

test("lint: trecho da ementa de outro processo transcrita no VOTO → aviso de TRANSCRIÇÃO", { skip: pula }, () => {
  const d = pasta();
  const t = "A fraude praticada por terceiro que se passa por preposto da instituição caracteriza fortuito interno";
  const r = confere(d, "900002", t);
  assert.deepEqual(r.erros, []);
  assert.ok(r.avisos.some((a) => /TRANSCREVE/.test(a)), JSON.stringify(r.avisos));
  // controle: o mesmo texto num recibo sem os campos novos passava calado — era o buraco
  const antes = confere(d, "900003", t);
  assert.ok(!antes.avisos.some((a) => /TRANSCREVE/.test(a)), JSON.stringify(antes.avisos));
});

test("lint: frase do próprio relator no VOTO → sem aviso de transcrição", { skip: pula }, () => {
  const r = confere(pasta(), "900002", "Assim, evidenciada a falha na prestação do serviço, correta a sentença ao reconhecer o dever de indenizar");
  assert.deepEqual(r.erros, []);
  assert.ok(!r.avisos.some((a) => /TRANSCREVE|VENCIDO/.test(a)), JSON.stringify(r.avisos));
});

test("lint: ACÓRDÃO com relator vencido — voto vencido avisa; tese da ementa da casa passa", { skip: pula }, () => {
  const d = pasta();
  const vencido = confere(d, "900001", "verifico que o agravado efetuou a notificação extrajudicial do agravante");
  assert.ok(vencido.avisos.some((a) => /VENCIDO/.test(a)), JSON.stringify(vencido.avisos));
  const tese = confere(d, "900001", "A necessidade de maior dilação probatória inviabiliza a apreciação da matéria em sede de tutela de urgência");
  assert.deepEqual(tese.erros, []);
  assert.ok(!tese.avisos.some((a) => /TRANSCREVE|VENCIDO/.test(a)), JSON.stringify(tese.avisos));
});

test("lint: --selftest continua passando", { skip: pula }, () => {
  const out = execFileSync("python3", [LINT, "--selftest"], { encoding: "utf8" });
  assert.match(out, /selftest OK/);
});
