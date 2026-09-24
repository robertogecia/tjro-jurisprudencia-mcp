#!/usr/bin/env node
// Gera os fixtures de teste da custódia a partir de recibos REAIS, anonimizados. Roda só na máquina que
// tem os recibos (~/.tjro-jurisprudencia-recibos). Depois de rodar, LEIA o fixture antes de commitar: o
// inteiro teor nomeia partes, às vezes menores de idade. Os NOMES a trocar ficam em
// harness/_anonimizar.local.json (fora do git: a lista de nomes é ela mesma o dado que não pode vazar),
// no formato {"<id>": [["regex", "substituto"], …]}.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const aqui = path.dirname(new URL(import.meta.url).pathname);
const locais = JSON.parse(fs.readFileSync(path.join(aqui, "_anonimizar.local.json"), "utf8"));
const nomes = (id) => (locais[id] || []).map(([re, s]) => [new RegExp(re, "g"), s]);

const dir = path.join(os.homedir(), ".tjro-jurisprudencia-recibos");
const FIXTURES = [
  // [id, tipo no fixture, corta a partir de (texto)]
  ["27805582", "ACÓRDÃO", "VOTO DESEMBARGADOR"],
  ["32288297", "VOTO", "VOTO"],
];
const GERAL = [
  [/\b\d{7}-?\s?\d{2}\.\s?\d{4}\.\s?8\.\s?22\.\s?\d{4}\b/g, "7000000-00.2020.8.22.0001"],   // nº CNJ do TJRO
  [/\b\d{7}-\d{2}\.\d{4}\.822\.\d{4}\b/g, "7000000-00.2020.822.0001"],
  [/\bOAB[^,]{0,6}\d{3,6}[A-Z]?\b/g, "OAB nº 0000"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "000.000.000-00"],                                      // CPF
  [/\bid\s*\d{6,}\b/gi, "id 0000000"],
];
const out = [];
for (const [id, tipo, corte] of FIXTURES) {
  const subs = nomes(id);
  const r = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));
  let t = r.texto.slice(r.texto.indexOf(corte));
  for (const [re, s] of [...subs, ...GERAL]) t = t.replace(re, s);
  out.push({ tipo, texto: t });
}
fs.writeFileSync(path.join(aqui, "..", "test", "fixtures", "custodia-tjro.json"),
  JSON.stringify({ _sobre: "Recibos reais do TJRO (2 documentos), cortados no início do voto e anonimizados por harness/_anonimizar.mjs; conferidos à mão em 23/09/2026.", documentos: out }, null, 1));
