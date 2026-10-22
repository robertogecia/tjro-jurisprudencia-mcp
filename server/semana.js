// Aviso de versão nova com no máximo UMA consulta ao GitHub por semana (pedido do autor, 22/10/2026).
// O arquivo de registro guarda só a data da última checagem e a última versão vista; nada da pesquisa nem do caso.
// Nas demais sessões da semana, a sugestão sai do registro, sem rede. Falha de rede ou de gravação: silêncio,
// e a consulta é tentada de novo na sessão seguinte.
import fs from "node:fs";
import path from "node:path";

export const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

export function lerRegistro(arquivo) {
  try {
    const j = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    return {
      ultima_checagem: typeof j.ultima_checagem === "string" ? j.ultima_checagem : null,
      versao_vista: typeof j.versao_vista === "string" ? j.versao_vista : null,
    };
  } catch {
    return { ultima_checagem: null, versao_vista: null };
  }
}

export function gravarRegistro(arquivo, versaoVista, agoraMs) {
  try {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(
      arquivo,
      JSON.stringify({ ultima_checagem: new Date(agoraMs).toISOString(), versao_vista: versaoVista }) + "\n",
      { mode: 0o600 },
    );
  } catch { /* sem registro, consulta de novo na próxima sessão */ }
}

// Vencida se nunca houve checagem, se a data está no futuro (relógio mexido) ou se passou uma semana.
export function consultaVencida(registro, agoraMs) {
  const t = Date.parse(registro.ultima_checagem ?? "");
  return !Number.isFinite(t) || t > agoraMs || agoraMs - t >= SEMANA_MS;
}

// `consultar()` devolve a tag da última release (ex. "1.7.4") ou null se a consulta falhou.
// `arquivo` null = sem registro (consulta sempre; usado quando o fetch é injetado em teste).
export async function checarSemanal({ arquivo, consultar, versaoMaisNova, atual, agora = Date.now }) {
  try {
    const agoraMs = agora();
    const reg = arquivo ? lerRegistro(arquivo) : { ultima_checagem: null, versao_vista: null };
    let vista = reg.versao_vista;
    if (consultaVencida(reg, agoraMs)) {
      const tag = await consultar();
      if (tag) {
        vista = tag;
        if (arquivo) gravarRegistro(arquivo, tag, agoraMs);
      }
    }
    return vista && versaoMaisNova(atual, vista) ? String(vista).replace(/^v/, "") : null;
  } catch {
    return null;
  }
}
