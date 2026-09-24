// Atualização SEMIAUTOMÁTICA (v1.7.21): a extensão baixa o arquivo da versão nova,
// confere e o deixa na pasta Downloads. Quem instala é o usuário (dois cliques e
// "Instalar"): a extensão NUNCA se instala sozinha, nunca executa o arquivo e
// nunca abre o instalador. Só roda quando o usuário pede.
//
// Salvaguardas: só o endereço FIXO do repositório oficial; só o asset com o nome
// exato; tamanho máximo; SHA-256 conferido contra o digest que o GitHub publica
// para o asset; assinatura de arquivo zip. Limite honesto: o digest vem do próprio
// GitHub, então isto protege contra download corrompido ou desviado no caminho, NÃO
// contra uma conta do GitHub comprometida (aí o release inteiro estaria trocado).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VERSAO, RELEASES_API, RELEASES_PAGINA, versaoMaisNova } from "./lib.js";

export const PREFIXO_DOWNLOAD =
  "https://github.com/robertogecia/tjro-jurisprudencia-mcp/releases/download/";
export const NOME_ASSET = "Jurisprudencia-TJRO.mcpb";
export const TAMANHO_MAXIMO = 30 * 1024 * 1024;
const RE_DIGEST = /^sha256:([0-9a-f]{64})$/;
const RE_TAG = /^v\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export class ErroAtualizacao extends Error {}

export const pastaDownloads = () => path.join(os.homedir(), "Downloads");

async function pegar(fetchImpl, url, opcoes, timeoutMs) {
  try {
    return await fetchImpl(url, { ...opcoes, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const causa = e?.name === "TimeoutError" ? "tempo esgotado" : e?.cause?.code || e?.message || "erro de rede";
    throw new ErroAtualizacao(`Não consegui falar com o GitHub (${causa}). Tente de novo em alguns minutos, ou baixe pela página: ${RELEASES_PAGINA}`);
  }
}

export async function baixarAtualizacao({
  atual = VERSAO,
  fetchImpl = globalThis.fetch,
  destino = pastaDownloads(),
  env = process.env,
} = {}) {
  if (env.TJRO_MCP_SEM_AVISO_ATUALIZACAO === "1")
    throw new ErroAtualizacao("A verificação de atualização está desligada neste computador (TJRO_MCP_SEM_AVISO_ATUALIZACAO=1).");
  if (typeof fetchImpl !== "function") throw new ErroAtualizacao("Esta instalação não consegue acessar a internet.");

  const r = await pegar(fetchImpl, RELEASES_API, { headers: { Accept: "application/vnd.github+json", "User-Agent": "tjro-jurisprudencia-mcp" } }, 15000);
  if (!r.ok) throw new ErroAtualizacao(`O GitHub respondeu HTTP ${r.status}. Tente mais tarde, ou baixe pela página: ${RELEASES_PAGINA}`);
  let rel;
  try {
    rel = await r.json();
  } catch {
    throw new ErroAtualizacao(`Resposta inesperada do GitHub. Baixe pela página: ${RELEASES_PAGINA}`);
  }
  const tag = String(rel?.tag_name ?? "").trim();
  if (!RE_TAG.test(tag)) throw new ErroAtualizacao(`A versão publicada tem formato inesperado. Baixe pela página: ${RELEASES_PAGINA}`);
  if (!versaoMaisNova(atual, tag)) return { jaAtualizada: true, versao: atual, tag };

  const asset = (Array.isArray(rel.assets) ? rel.assets : []).find((a) => a?.name === NOME_ASSET);
  if (!asset) throw new ErroAtualizacao(`A versão ${tag} não traz o arquivo ${NOME_ASSET}. Baixe pela página: ${RELEASES_PAGINA}`);
  const url = String(asset.browser_download_url || "");
  const esperado = `${PREFIXO_DOWNLOAD}${tag}/${NOME_ASSET}`;
  if (url !== esperado) throw new ErroAtualizacao("O endereço do arquivo não é o do repositório oficial; por segurança, não baixei.");
  const m = RE_DIGEST.exec(String(asset.digest || ""));
  if (!m) throw new ErroAtualizacao("O GitHub não informou o SHA-256 do arquivo, então não há como conferir a integridade; por segurança, não baixei.");
  const tamanho = Number(asset.size);
  if (!Number.isInteger(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO)
    throw new ErroAtualizacao("O tamanho informado do arquivo é inválido; por segurança, não baixei.");

  const d = await pegar(fetchImpl, url, { headers: { "User-Agent": "tjro-jurisprudencia-mcp" } }, 60000);
  if (!d.ok) throw new ErroAtualizacao(`O download respondeu HTTP ${d.status}. Baixe pela página: ${RELEASES_PAGINA}`);
  const declarado = Number(d.headers?.get?.("content-length"));
  if (Number.isFinite(declarado) && declarado > tamanho) throw new ErroAtualizacao("O arquivo é maior do que o publicado; descartei.");
  const buf = await lerComTeto(d, tamanho);
  if (buf.length !== tamanho) throw new ErroAtualizacao("O arquivo baixado tem tamanho diferente do publicado; descartei.");
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (sha !== m[1]) throw new ErroAtualizacao("A verificação de integridade (SHA-256) falhou: o arquivo baixado NÃO é o publicado. Descartei; não instale nada e avise o autor.");
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new ErroAtualizacao("O arquivo baixado não é um pacote válido; descartei.");

  return gravar(buf, sha, tag, destino);
}

// Lê o corpo em pedaços e aborta assim que passar do tamanho publicado (nunca
// carrega na memória mais do que `teto` + um pedaço).
async function lerComTeto(resposta, teto) {
  try {
    if (resposta.body && typeof resposta.body.getReader === "function") {
      const leitor = resposta.body.getReader();
      const partes = [];
      let total = 0;
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.length;
        if (total > teto) {
          await leitor.cancel().catch(() => {});
          throw new ErroAtualizacao("O arquivo é maior do que o publicado; descartei.");
        }
        partes.push(Buffer.from(value));
      }
      return Buffer.concat(partes);
    }
    const b = Buffer.from(await resposta.arrayBuffer());
    if (b.length > teto) throw new ErroAtualizacao("O arquivo é maior do que o publicado; descartei.");
    return b;
  } catch (e) {
    if (e instanceof ErroAtualizacao) throw e;
    throw new ErroAtualizacao(`O download foi interrompido (${e?.name === "TimeoutError" ? "tempo esgotado" : e?.message || "erro"}). Tente de novo.`);
  }
}

// Gravação segura: temporário exclusivo (flag wx, nome aleatório), nunca sobrescreve
// arquivo alheio; se já existe um igual, reaproveita; se é diferente, usa sufixo.
function gravar(buf, sha, tag, destino) {
  try {
    fs.mkdirSync(destino, { recursive: true });
    let alvo = path.join(destino, `Jurisprudencia-TJRO-${tag}.mcpb`);
    for (let n = 2; fs.existsSync(alvo); n++) {
      const igual = crypto.createHash("sha256").update(fs.readFileSync(alvo)).digest("hex") === sha;
      if (igual) return { baixado: true, jaExistia: true, tag, versao: tag.slice(1), caminho: alvo, sha256: sha, tamanho: buf.length };
      alvo = path.join(destino, `Jurisprudencia-TJRO-${tag}-${n}.mcpb`);
      if (n > 20) throw new ErroAtualizacao("Já há muitos arquivos com esse nome na pasta de destino; apague os antigos.");
    }
    const tmp = path.join(destino, `.tjro-${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(tmp, buf, { flag: "wx", mode: 0o644 });
      fs.renameSync(tmp, alvo);
    } finally {
      try { fs.rmSync(tmp, { force: true }); } catch { /* já renomeado */ }
    }
    return { baixado: true, tag, versao: tag.slice(1), caminho: alvo, sha256: sha, tamanho: buf.length };
  } catch (e) {
    if (e instanceof ErroAtualizacao) throw e;
    throw new ErroAtualizacao(`Não consegui salvar o arquivo em ${destino} (${e?.code || "erro de disco"}).`);
  }
}

export function textoAtualizacao(res) {
  if (res.jaAtualizada) return `A extensão já está na versão mais nova (v${res.versao}). Nada a baixar.`;
  return [
    `**${res.jaExistia ? "Esta versão já estava baixada" : "Baixei a versão " + res.versao}** (versão ${res.versao}); conferi a integridade (SHA-256 ${res.sha256.slice(0, 16)}…, ${(res.tamanho / 1048576).toFixed(1)} MB).`,
    `Arquivo: \`${res.caminho}\``,
    "",
    "**Para instalar (a extensão não se instala sozinha):**",
    "1. Deixe o Claude Desktop aberto.",
    "2. Dê dois cliques no arquivo acima.",
    "3. Confira o nome (Jurisprudência TJRO) e a versão na tela de instalação e confirme **Instalar**. Em regra isso substitui a versão anterior.",
    "4. Feche e abra o Claude para carregar a versão nova.",
    "",
    "_A conferência protege contra download corrompido ou desviado. Ela não substitui a sua confiança no repositório oficial (github.com/robertogecia/tjro-jurisprudencia-mcp)._",
  ].join("\n");
}
