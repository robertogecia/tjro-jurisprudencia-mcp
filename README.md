# Jurisprudência TJRO no Claude — instalação em 1 clique

[![tests](https://github.com/robertogecia/tjro-jurisprudencia-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/robertogecia/tjro-jurisprudencia-mcp/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Extensão MCP que dá ao **Claude Desktop** a capacidade de **pesquisar jurisprudência
do Tribunal de Justiça de Rondônia** (portal oficial JURIS), sem login e sem programar.

## Instalar (2 minutos)

1. Baixe o arquivo **`Jurisprudencia-TJRO.mcpb`** na aba [Releases](../../releases) deste repositório.
2. Abra o **Claude Desktop** → **Configurações** (Settings) → **Extensões** (Extensions).
3. **Arraste o arquivo `.mcpb`** para essa janela — ou clique em *Instalar extensão* e selecione o arquivo.
4. Confirme a instalação e, se pedir, **reinicie o Claude Desktop**.
5. Pronto. Não precisa instalar mais nada (o Claude Desktop já traz o Node.js necessário).

> Requisitos: Claude Desktop recente, no **Mac ou Windows**.

## Como usar

Peça em linguagem natural, por exemplo:

> "Pesquise no TJRO ementas de 2º grau sobre dano moral por negativação indevida, julgadas em 2024."
>
> "Acórdãos da 1ª Câmara Criminal sobre tráfico privilegiado, mais recentes primeiro."
>
> "Traga o inteiro teor do processo 7009829-15.2024.8.22.0014."

São duas ferramentas:

- **`buscar_jurisprudencia_tjro`** — pesquisa por tema, com filtros de tipo de peça,
  grau, classe judicial, câmara e período. Cada resultado traz uma citação pronta
  para colar em peça e o link direto para a decisão no portal.
- **`obter_inteiro_teor_tjro`** — texto integral das peças (acórdão, ementa, voto,
  relatório) de um processo específico.

## Quando usar isto (e quando usar outra coisa)

Bases nacionais de jurisprudência com busca semântica (ex.: JusRatio) hoje **já
indexam acórdãos do TJRO** de 2020 em diante, e para a maioria das pesquisas são
o melhor ponto de partida — trazem síntese, verificação de precedentes superados
e cotas generosas. Esta extensão é complementar, e vale a pena especificamente
quando você precisa de:

- **Precedente anterior a 2020** — o portal oficial do TJRO tem histórico mais
  longo do que a maioria das bases indexadas por terceiros.
- **Texto de SENTENÇA (1º grau)** — esta extensão busca a peça do juízo de origem
  como documento próprio; bases de jurisprudência costumam indexar só acórdãos
  de 2º grau.
- **Pesquisa sem gastar cota** — a API do próprio TJRO é pública e sem limite de
  uso; não consome nenhuma cota de plano pago.
- **Link direto para o portal oficial do tribunal** — em vez do link de um
  intermediário, útil quando a peça exige citar a fonte primária.

Para teses vinculantes (Súmula Vinculante, Tema Repetitivo, Repercussão Geral),
qualquer base nacional (STF/STJ) já resolve, já que obrigam o juízo de Rondônia
de qualquer forma.

## Avisos importantes

- **Integração não-oficial.** Os dados vêm do portal oficial do TJRO, mas por uma
  via não documentada (a API pública do próprio site, a mesma que o navegador do
  usuário do portal chama — não é uma rota escondida). Funciona hoje; se o TJRO
  mudar o portal, pode parar até ser atualizada. Veja "Segurança e auditoria" abaixo.
- **Confirme antes de citar.** Sempre abra o *inteiro teor* (o link vem em cada
  resultado) e confira número, relator, câmara, data e a ementa literal antes de
  usar em peça. Vale para qualquer ferramenta de IA jurídica.
- **Rede do escritório:** se o escritório usa proxy que intercepta HTTPS e a busca
  falhar com erro de certificado, fale com o suporte de TI (pode ser necessário
  ajustar o certificado/CA do sistema).

## Segurança e auditoria

Pensado para ser fácil de verificar antes de instalar, não só "confie em mim":

- **Só leitura, sem credenciais.** As duas ferramentas fazem apenas requisições
  HTTP `POST` de busca ao portal público do TJRO. Não pedem login, token, chave
  de API nem qualquer dado além do texto da sua pesquisa — o mesmo que você
  digitaria na busca do próprio portal.
- **Sem coleta de dados.** Nenhuma telemetria, analytics ou envio de dados a
  qualquer servidor além do `juris-back.tjro.jus.br` (o backend do próprio TJRO).
- **Pouco código, fácil de ler.** Toda a lógica fica em dois arquivos:
  [`server/lib.js`](server/lib.js) (funções puras — sem rede) e
  [`server/index.js`](server/index.js) (só o registro das duas ferramentas MCP
  e a chamada HTTP). Juntos, menos de 500 linhas.
- **Três dependências**, todas de projetos estabelecidos:
  [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
  (SDK oficial da Anthropic para servidores MCP),
  [`zod`](https://www.npmjs.com/package/zod) (validação de schema) e
  [`he`](https://www.npmjs.com/package/he) (decodificação de entidades HTML).
- **Testado.** `server/lib.js` tem [testes automatizados](test/lib.test.js) que
  rodam em CI a cada mudança (badge no topo deste README) — inclusive regressões
  específicas dos bugs já encontrados e corrigidos neste projeto.
- **Licença MIT**, sem cláusula que restrinja leitura ou uso do código-fonte.

## Desinstalar

Claude Desktop → Configurações → Extensões → remover "Jurisprudência TJRO".

## Desenvolvimento

Servidor MCP em Node.js ([@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk))
que consulta a API de busca do portal [juris.tjro.jus.br](https://juris.tjro.jus.br)
(pública, sem autenticação).

```bash
npm install
npm test                      # roda os testes automatizados (server/lib.js)
node server/index.js          # roda o servidor via stdio
npx @anthropic-ai/mcpb@latest pack . Jurisprudencia-TJRO.mcpb   # empacota a extensão
```

## Autor

**Roberto Grécia Bessa** — OAB/RO 7865-A
Instagram: [@robertogrecia](https://instagram.com/robertogrecia)

## Licença

MIT — veja [LICENSE](LICENSE).
