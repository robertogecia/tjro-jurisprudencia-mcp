# Jurisprudência TJRO no Claude — instalação em 1 clique

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

## Avisos importantes

- **Integração não-oficial.** Os dados vêm do portal oficial do TJRO, mas por uma
  via não documentada (a API pública do próprio site). Funciona hoje; se o TJRO
  mudar o portal, pode parar até ser atualizada.
- **Confirme antes de citar.** Sempre abra o *inteiro teor* (o link vem em cada
  resultado) e confira número, relator, câmara, data e a ementa literal antes de
  usar em peça. Vale para qualquer ferramenta de IA jurídica.
- **Rede do escritório:** se o escritório usa proxy que intercepta HTTPS e a busca
  falhar com erro de certificado, fale com o suporte de TI (pode ser necessário
  ajustar o certificado/CA do sistema).

## Desinstalar

Claude Desktop → Configurações → Extensões → remover "Jurisprudência TJRO".

## Desenvolvimento

Servidor MCP em Node.js ([@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk))
que consulta a API de busca do portal [juris.tjro.jus.br](https://juris.tjro.jus.br)
(pública, sem autenticação).

```bash
npm install
node server/index.js          # roda o servidor via stdio
npx @anthropic-ai/mcpb@latest pack . Jurisprudencia-TJRO.mcpb   # empacota a extensão
```

## Autor

**Roberto Grécia Bessa** — OAB/RO 7865-A
Instagram: [@robertogrecia](https://instagram.com/robertogrecia)

## Licença

MIT — veja [LICENSE](LICENSE).
