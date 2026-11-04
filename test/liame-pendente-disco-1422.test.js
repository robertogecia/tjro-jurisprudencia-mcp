// 1.42.2 (build local) — o recuo/sucesso do Liame que não achou a trava passa a viver num arquivo-lateral por processo e é
// absorvido pela próxima transação de qualquer processo. Sem rede: fetch injetado, estado em os.tmpdir().
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  chamarLiame, estadoLiame, reservarLiame, LIAME_PESQUISA,
  _setArquivoEstadoLiameParaTeste, _resetLiameParaTeste, _setRelogioLiameParaTeste, _setPrazoTravaRegistroLiameParaTeste,
  _pendenteLiameParaTeste, _esquecerMemoriaLiameParaTeste,
} from "../server/liame.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tjro-pend1422-"));
const ARQ = path.join(tmp, "estado-liame.json");
_setArquivoEstadoLiameParaTeste(ARQ);
process.env.TJRO_MCP_DIR_CACHE = path.join(tmp, "cache");
let T;
beforeEach(() => {
  T = Date.now();   // relógio simulado parte do real: o mtime da trava é real, e uma data fixa no passado faz a trava parecer do futuro
  _setRelogioLiameParaTeste(() => T, async (ms) => { T += ms; });
  _setPrazoTravaRegistroLiameParaTeste(50);
  try { fs.unlinkSync(ARQ + ".lock"); } catch {}
  _resetLiameParaTeste();
});
const resposta = (status, corpo) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
  text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)),
});
const DIRP = path.join(tmp, "estado-liame.json.pendentes");
const laterais = () => { try { return fs.readdirSync(DIRP).filter((n) => n.endsWith(".json")); } catch { return []; } };
const recusaSemTrava = async (status = 403) => {
  const f = async () => { fs.writeFileSync(ARQ + ".lock", "outro processo"); return resposta(status, "{}"); };
  await assert.rejects(() => chamarLiame(LIAME_PESQUISA, {}, f), /HTTP/);
};

test("recuo sem trava vai para o arquivo-lateral e sobrevive ao fim do processo", async () => {
  await recusaSemTrava();
  assert.equal(laterais().length, 1, "arquivo-lateral gravado");
  assert.equal(_pendenteLiameParaTeste()?.noDisco, true);
  _esquecerMemoriaLiameParaTeste();           // o processo "morreu"
  fs.unlinkSync(ARQ + ".lock");
  T += 7000;
  assert.equal(reservarLiame().tipo, "bloqueio", "outro processo herda o recuo");
  assert.ok(estadoLiame().incidentes >= 1);
  assert.equal(laterais().length, 0, "arquivo-lateral apagado depois de aplicado");
});

test("aplica uma vez só: segunda transação não repete o recuo", async () => {
  await recusaSemTrava();
  _esquecerMemoriaLiameParaTeste();
  fs.unlinkSync(ARQ + ".lock");
  T += 7000;
  reservarLiame();
  const n = estadoLiame().incidentes;
  T += 1000;
  reservarLiame();
  assert.equal(estadoLiame().incidentes, n);
});

test("o mesmo processo não aplica em dobro (memória + disco)", async () => {
  await recusaSemTrava();
  fs.unlinkSync(ARQ + ".lock");
  T += 7000;
  reservarLiame();
  assert.equal(estadoLiame().incidentes, 1);
  assert.equal(_pendenteLiameParaTeste(), null);
});

test("arquivo-lateral vencido (> 1 h) é descartado sem efeito", async () => {
  await recusaSemTrava();
  _esquecerMemoriaLiameParaTeste();
  fs.unlinkSync(ARQ + ".lock");
  T += 2 * 3600_000;
  reservarLiame();
  assert.equal(estadoLiame().incidentes, 0);
  assert.equal(laterais().length, 0);
});

test("arquivo-lateral ilegível ou adulterado é apagado e ignorado; valores são limitados", () => {
  fs.mkdirSync(DIRP, { recursive: true });
  fs.writeFileSync(path.join(DIRP, "999991.json"), "{lixo");
  fs.writeFileSync(path.join(DIRP, "999992.json"), JSON.stringify({ motivo: "x".repeat(500), recuoMs: 1e15, curto: false, quando: T }));
  fs.writeFileSync(path.join(DIRP, "999993.json"), JSON.stringify([1, 2]));
  reservarLiame();
  assert.equal(laterais().length, 0);
  const s = estadoLiame();
  assert.ok(s.incidentes <= 1);
  assert.ok(s.bloqueadoPorS <= 3600 + 5, `bloqueadoPorS=${s.bloqueadoPorS}`);
});

test("achado do revisor: arquivo absorvido por outro processo e nova falha não reaplicam o recuo antigo", async () => {
  await recusaSemTrava();                       // grava v1
  const f1 = laterais()[0];
  fs.unlinkSync(ARQ + ".lock");
  fs.unlinkSync(path.join(DIRP, f1));            // "outro processo" absorveu e apagou v1
  await recusaSemTrava();                       // nova falha sem trava
  assert.equal(_pendenteLiameParaTeste()?.noDisco, true);
  fs.unlinkSync(ARQ + ".lock");
  T += 7000;
  reservarLiame();
  assert.equal(estadoLiame().incidentes, 1, "v1 (aplicada pelo outro processo) não conta de novo: só o incidente da v2");
});
