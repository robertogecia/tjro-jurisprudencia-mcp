#!/bin/sh
# Instala o servidor MCP "Jurisprudência TJRO" para usar no aplicativo Gemini (macOS/Linux).
# Baixa a versão mais recente do GitHub, descompacta numa pasta própria e mostra o comando para colar no Gemini.
set -e
REPO="robertogecia/tjro-jurisprudencia-mcp"
PASTA="$HOME/TJRO-Jurisprudencia-MCP"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode este script de novo."; exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js $(node -v) é antigo demais. Instale a versão LTS em https://nodejs.org"; exit 1
fi
NODE_BIN=$(node -p 'process.execPath')

TMP=$(mktemp -d)
echo "Baixando a versão mais recente..."
curl -fsSL -o "$TMP/ext.mcpb" "https://github.com/$REPO/releases/latest/download/Jurisprudencia-TJRO.mcpb"
rm -rf "$PASTA"; mkdir -p "$PASTA"
unzip -q "$TMP/ext.mcpb" -d "$PASTA"
rm -rf "$TMP"

# teste rápido: o servidor sobe e responde?
if ! "$NODE_BIN" -e "import('$PASTA/server/lib.js').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"; then
  echo "O servidor não carregou. Mande esta mensagem para quem lhe forneceu o pacote."; exit 1
fi

VERSAO=$("$NODE_BIN" -p "require('$PASTA/package.json').version")
echo ""
echo "Instalado: versão $VERSAO em $PASTA"
echo ""
echo "No Gemini: Personalizar > Conectores > Criar app personalizado > MCP local"
echo "  Nome do servidor: Jurisprudência TJRO"
echo "  Comando (copie a linha inteira):"
echo ""
echo "  $NODE_BIN $PASTA/server/index.js"
echo ""
echo "Leia o arquivo LEIA-ME.md antes da primeira busca."
