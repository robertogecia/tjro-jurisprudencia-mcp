# Instala o servidor MCP "Jurisprudência TJRO" para usar no aplicativo Gemini (Windows). NÃO testado em Windows.
# Clique com o botão direito > "Executar com o PowerShell".
$ErrorActionPreference = "Stop"
$repo = "robertogecia/tjro-jurisprudencia-mcp"
$pasta = Join-Path $env:USERPROFILE "TJRO-Jurisprudencia-MCP"

$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Host "Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo."; exit 1 }
$nodeBin = $node.Source
$major = [int]((& $nodeBin -p "process.versions.node.split('.')[0]"))
if ($major -lt 18) { Write-Host "Node.js antigo demais. Instale a versão LTS em https://nodejs.org"; exit 1 }

$tmp = Join-Path $env:TEMP ("tjro-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
Write-Host "Baixando a versão mais recente..."
Invoke-WebRequest -Uri "https://github.com/$repo/releases/latest/download/Jurisprudencia-TJRO.mcpb" -OutFile "$tmp\ext.zip"
if (Test-Path $pasta) { Remove-Item -Recurse -Force $pasta }
Expand-Archive -Path "$tmp\ext.zip" -DestinationPath $pasta
Remove-Item -Recurse -Force $tmp

$versao = & $nodeBin -p "require('$($pasta -replace '\\','/')/package.json').version"
Write-Host ""
Write-Host "Instalado: versão $versao em $pasta"
Write-Host ""
Write-Host "No Gemini: Personalizar > Conectores > Criar app personalizado > MCP local"
Write-Host "  Nome do servidor: Jurisprudência TJRO"
Write-Host "  Comando (copie a linha inteira):"
Write-Host ""
Write-Host "  `"$nodeBin`" `"$pasta\server\index.js`""
Write-Host ""
Write-Host "Leia o arquivo LEIA-ME.md antes da primeira busca."
