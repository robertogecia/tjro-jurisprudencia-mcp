# Jurisprudência TJRO no aplicativo Gemini

Este pacote instala, no seu computador, um servidor que deixa o aplicativo Gemini pesquisar a jurisprudência pública do Tribunal de Justiça de Rondônia (TJRO). É o mesmo servidor que existe para o Claude Desktop (código aberto: https://github.com/robertogecia/tjro-jurisprudencia-mcp).

## Leia antes de instalar

1. **Tudo o que a ferramenta devolve passa pelo modelo do Google.** As decisões do TJRO são públicas, mas o que você pergunta também vai para o Google: não escreva nome de cliente, número de processo seu, valor, nem a estratégia do caso. Pesquise por tema ("repetição de indébito em consignado"), nunca por caso. Confira a política de retenção e treinamento do seu plano antes de usar com qualquer coisa sensível.
2. **O servidor roda no seu computador, com as permissões do seu usuário.** No teste que fizemos, o Gemini só o executou com a sandbox em "acesso total". Se você conseguir fazê-lo funcionar com uma opção mais restrita, prefira essa.
3. **O portal do TJRO pode bloquear a ferramenta.** Ele recusa programas que se identificam como programa. Na primeira busca o servidor não consulta nada e pede que o Gemini pergunte a você se aceita a opção de se identificar como navegador, por sua conta e risco (o tribunal pode considerar uso indevido e restringir o acesso da sua rede). A resposta fica gravada; você pode desfazer depois. O ritmo mínimo entre consultas continua valendo.
4. **Nada aqui é peça pronta.** É rascunho de pesquisa. Antes de citar um julgado, abra-o pelo id e confira. Trecho entre aspas só depois de `verificar_citacao_tjro`.

## Instalar

**Pré-requisito:** Node.js, versão LTS, instalado pelo instalador oficial de https://nodejs.org (outras instalações podem ser bloqueadas pelo sistema).

**macOS ou Linux:** abra o Terminal, entre na pasta deste pacote e rode:

```
sh instalar-mac-linux.sh
```

**Windows (não testado):** clique com o botão direito em `instalar-windows.ps1` e escolha "Executar com o PowerShell".

O instalador baixa a versão mais recente do GitHub, instala em `TJRO-Jurisprudencia-MCP` na sua pasta pessoal e mostra o **comando** para colar no Gemini. Para atualizar, rode o instalador de novo.

## Conectar no Gemini

1. Abra o Gemini e vá em **Personalizar > Conectores > Criar app personalizado**.
2. Escolha **MCP local**.
3. **Nome do servidor:** Jurisprudência TJRO. **Descrição:** pesquisa de jurisprudência do TJRO.
4. **Comando:** cole a linha que o instalador mostrou.
5. Sandbox: veja a nota 2 acima.
6. Antes, confira que o servidor sobe: no Terminal, `node testar-servidor.mjs` (nesta pasta) deve imprimir "OK: Jurisprudência TJRO … 13 ferramentas". Se falhar, o erro aparece ali.
7. Avance e faça um teste com uma pergunta genérica, sem caso: "busque jurisprudência do TJRO sobre dano moral por negativação indevida".

## Instruções para o Gemini (cole nas instruções do app ou de um Gem)

```
Ao pesquisar jurisprudência do TJRO, use as ferramentas Jurisprudência TJRO. Nunca cite julgado, súmula, tema ou relator de memória: só o que a ferramenta devolveu nesta conversa. Se a ferramenta falhar ou for bloqueada, diga "pesquisa não realizada", nunca "não localizado". Antes de pôr um trecho entre aspas, use verificar_citacao_tjro e respeite os alertas (transcrição, voto divergente, obiter dictum). A câmara de um acórdão é a do fecho, não a do cadastro. Se a ferramenta pedir uma escolha sobre a identificação perante o portal, pergunte ao usuário e espere a resposta; nunca escolha por ele. Não receba nem repita dados de clientes ou de processos do usuário: peça que ele pesquise por tema.
```

## Problemas comuns

- **"Operation not permitted" ou "Timed out waiting for MCP server":** o Node não foi executado. Instale o Node LTS pelo instalador oficial e use o caminho que o instalador do pacote mostrou.
- **Erro de bloqueio do portal:** é o filtro do TJRO. Veja o ponto 3 acima ou use o site do tribunal (juris.tjro.jus.br).
- **Dúvidas e erros:** https://github.com/robertogecia/tjro-jurisprudencia-mcp/issues
