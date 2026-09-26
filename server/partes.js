// "Favorável a quem?" — heurística sobre o TEXTO do acórdão (só no inteiro teor: o
// cabeçalho que vem na busca não traz partes legíveis em ~80% dos casos, medido em
// 26/09/2026). Lê o "Polo Ativo/Polo Passivo" do cabeçalho da peça e o primeiro
// período do relatório ("X interpôs recurso…", "recurso interposto por X"), e cruza
// com o resultado declarado no fecho: recurso provido favorece quem recorreu;
// desprovido, o outro polo. Amostra de 92 acórdãos do cache (26/09/2026): partes em
// 79, recorrente em 63; nomes truncados ("S.A") e recursos de ambas as partes são os
// erros típicos — por isso a saída é sempre marcada como heurística e, havendo mais
// de um recurso, não se arrisca o lado. Sem regex com retrocesso: cada passo lê um
// trecho curto e fixo.
const STOP_POLO = /\b(?:Advogad|ADVOGAD|Polo Passivo|RELAT|EMENTA|Defensor|DEFENSOR|Procurador|PROCURADOR|VOTO|Apelad|APELAD|Agravad|AGRAVAD|Recorrid|RECORRID|Embargad|EMBARGAD)/;

const limpaNome = (n) =>
  String(n || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\((?:ID|id|Id)[^)]*\)?\s*$/, "")
    .replace(/^[\s.,;:]+|[\s.,;:]+$/g, "");

function polo(texto, rotulo) {
  const i = texto.indexOf(rotulo + ":");
  if (i < 0) return null;
  let seg = texto.slice(i + rotulo.length + 1, i + rotulo.length + 201);
  const m = seg.match(STOP_POLO);
  if (m) seg = seg.slice(0, m.index);
  seg = limpaNome(seg);
  // "SEM" sobra de "SEM ADVOGADO"; "DES" de "DESEMBARGADOR" cortado: não é parte.
  if (!seg || seg.length < 4 || /^(SEM|DES)$/i.test(seg)) return null;
  return seg;
}

// { poloAtivo, poloPassivo } a partir do cabeçalho da peça (PJe 2º grau).
export function extrairPartes(corpo) {
  const t = String(corpo || "").slice(0, 3000);
  return { poloAtivo: polo(t, "Polo Ativo"), poloPassivo: polo(t, "Polo Passivo") };
}

const VERBO_POS = /\b(?:interpost[oa]s?|opost[oa]s?|manejad[oa]s?|apresentad[oa]s?|aviad[oa]s?|ofertad[oa]s?)\s+(?:pel[oa]s?|por)\s+(?:a |o |os |as )?/i;
const CORTE = /,|;|\(|\s(?:em face|contra|em rela[çc][ãa]o|em desfavor|pleiteando|visando|objetivando|buscando|insurgindo|nos autos|em raz[ãa]o|que\s|para\s|no qual|na qual|ao argumento|alegando|requerendo|sustentando|com pedido|com fundamento|e (?:por|pel[oa]) |ID\b|id\.|Id\b|doc\.)|\.\s+[A-ZÁ-Ú]|\.$/i;
const VERBO_PRE = /\b(?:interp[õôo]s|interp[ôõo]e|interp[õôo]em|interpuseram|op[õo]s|op[õo]e|op[õo]em|opuseram|apresentou|apresentaram|manejou|manejaram)\s+(?:o presente |os presentes |a presente |o |os |a )?(?:recurso|apela[çc][ãa]o|agravo|embargos)/i;
const CONECT = new Set(["de", "da", "do", "dos", "das", "e", "&", "-", "s/a", "s.a.", "s.a", "ltda", "ltda.", "me", "epp", "sa", "s/a.", "eireli", "cia", "cia."]);
const PARA_DE_NOME = new Set(["relatório", "relatorio", "trata-se", "cuida-se", "vistos", "voto"]);
// Descrição genérica no lugar do nome: não serve para dizer o lado.
const NAO_E_NOME = /RELAT[ÓO]RIO|OAB|\bautor|(?:^|\s)ré[u]?(?:\s|$)|\bre[qc]|\bparte\b|\bembargante|\bapelad|\bagravad|\brecorrid|\bempresa\b|\bpessoa\b|\bmagistrad|\bju[ií]z/i;

function nomeAntes(t, fim) {
  const toks = t.slice(Math.max(0, fim - 160), fim).split(/\s+/).filter(Boolean);
  const nome = [];
  for (let k = toks.length - 1; k >= 0; k--) {
    const tk = toks[k];
    const tl = tk.toLowerCase().replace(/[,.;]+$/, "");
    if (PARA_DE_NOME.has(tl)) break;
    if (CONECT.has(tl) || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9]/.test(tk)) nome.unshift(tk);
    else break;
  }
  while (nome.length && CONECT.has(nome[0].toLowerCase().replace(/[,.]+$/, ""))) nome.shift();
  return limpaNome(nome.join(" "));
}

// Quem recorreu, pelo primeiro período do relatório. null se não achou nome limpo.
export function extrairRecorrente(corpo) {
  const t = String(corpo || "").slice(0, 3000);
  const i = t.search(/RELAT[ÓO]RIO/);
  const rel = (i >= 0 ? t.slice(i) : t).slice(0, 1600);
  let m = rel.match(VERBO_POS);
  if (m) {
    const seg = rel.slice(m.index + m[0].length, m.index + m[0].length + 130);
    const c = seg.match(CORTE);
    const n = limpaNome(c ? seg.slice(0, c.index) : seg);
    if (n.length >= 3 && n.length <= 110 && !NAO_E_NOME.test(n)) return n;
  }
  m = rel.match(VERBO_PRE);
  if (m) {
    const n = nomeAntes(rel, m.index);
    if (n.length >= 3 && n.length <= 110 && !NAO_E_NOME.test(n)) return n;
  }
  return null;
}

const MULTI = /recurso adesivo|ambas as partes|ambos os recursos|recursos (?:de apela[çc][ãa]o )?interpostos por|opostos por [^.]{3,80}? e por /i;
// "X e Y" como recorrente = dois recursos (ou litisconsortes): não arrisca o lado.
const NOME_DUPLO = /\s+e\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/;
export function maisDeUmRecurso(corpo, recorrente) {
  const t = String(corpo || "").slice(0, 3000);
  return MULTI.test(t) || (!!recorrente && NOME_DUPLO.test(recorrente));
}

const fold = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9 ]+/g, " ");
// O recorrente está neste polo? Tokens significativos em comum (nome vem com grafias distintas: "S.A" × "SA").
function mesmoNome(a, b) {
  if (!a || !b) return false;
  const ta = new Set(fold(a).split(/\s+/).filter((x) => x.length >= 3 && !CONECT.has(x)));
  const tb = new Set(fold(b).split(/\s+/).filter((x) => x.length >= 3 && !CONECT.has(x)));
  if (!ta.size || !tb.size) return false;
  let comum = 0;
  for (const x of ta) if (tb.has(x)) comum++;
  return comum >= Math.max(1, Math.ceil(Math.min(ta.size, tb.size) / 2));
}

// Linha para o inteiro teor: partes + quem recorreu + de que lado ficou o resultado.
// `resultado` = rótulo do fecho: PROVIDO | PARCIAL | DESPROVIDO | ACOLHIDO | REJEITADO | null.
export function linhaFavoravel(corpo, resultado) {
  const { poloAtivo, poloPassivo } = extrairPartes(corpo);
  const recorrente = extrairRecorrente(corpo);
  if (!poloAtivo && !poloPassivo && !recorrente) return null;
  const partes = [];
  if (poloAtivo) partes.push(`Polo Ativo: ${poloAtivo}`);
  if (poloPassivo) partes.push(`Polo Passivo: ${poloPassivo}`);
  const multi = maisDeUmRecurso(corpo, recorrente);
  let quem = recorrente ? `Recorreu (pelo relatório): ${recorrente}` : "Quem recorreu: não identificado no relatório";
  let lado = "";
  if (multi) {
    lado = " · mais de um recurso (ou recorrentes em conjunto): o lado favorecido depende de cada recurso — leia o dispositivo";
  } else if (recorrente && resultado) {
    const noAtivo = mesmoNome(recorrente, poloAtivo);
    const noPassivo = mesmoNome(recorrente, poloPassivo);
    const outro = noAtivo && !noPassivo ? poloPassivo : noPassivo && !noAtivo ? poloAtivo : null;
    if (resultado === "PROVIDO" || resultado === "ACOLHIDO") lado = ` → resultado FAVORÁVEL a quem recorreu (${recorrente})`;
    else if (resultado === "PARCIAL") lado = ` → resultado PARCIALMENTE favorável a quem recorreu (${recorrente}); o que foi e o que não foi está no dispositivo`;
    else if (resultado === "DESPROVIDO" || resultado === "REJEITADO")
      lado = ` → resultado CONTRÁRIO a quem recorreu (${recorrente})${outro ? `, favorável a ${outro}` : ""}`;
  } else if (recorrente && !resultado) {
    lado = " · sem resultado identificável no fecho: leia o dispositivo";
  }
  return `Partes e lado (heurística sobre o texto; confira no dispositivo): ${[...partes, quem].join(" · ")}${lado}`;
}
