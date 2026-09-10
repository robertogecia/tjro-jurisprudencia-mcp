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

São três ferramentas:

- **`buscar_jurisprudencia_tjro`** — pesquisa por tema, com **grupos de sinônimos**
  e filtros de tipo de peça, grau, classe judicial, câmara, **relator**, **assunto
  do CNJ** e período. Cada resultado traz uma
  citação pronta para colar em peça e o link direto para a decisão no portal.
  Com 3 ou mais resultados na página, o rodapé soma quantos declaram cada
  resultado (provido/desprovido/acolhido/rejeitado) — ver "Filtro por relator e
  resumo de resultados" abaixo.
- **`obter_inteiro_teor_tjro`** — texto integral das peças (acórdão, ementa, voto,
  relatório) de um processo específico.
- **`diagnostico_ritmo_tjro`** — explica por que as buscas podem estar falhando
  (limite de ritmo, bloqueio em curso, histórico). Não consulta o portal.

> A busca casa **palavras**, não sentido: um julgado que diga "inscrição indevida
> em cadastro de inadimplentes" não aparece numa busca por "negativação". Por isso
> a extensão aceita **grupos de sinônimos** — ver "Como pesquisar bem" abaixo.

## Quando usar isto (e quando usar outra coisa)

**Só faz sentido para casos da jurisdição do TJRO** (1º ou 2º grau de Rondônia).
Jurisprudência do TJRO não tem autoridade em outro tribunal — para um processo
que tramita em outro estado, use a fonte daquele tribunal ou uma base nacional.

Esta extensão consulta o **próprio portal oficial** do TJRO, e por isso cobre o
tribunal inteiro: todos os períodos, 1º e 2º grau. Algumas bases nacionais com
busca semântica também indexam acórdãos do TJRO de 2020 em diante e podem
complementar, se você tiver acesso — mas elas herdam o mesmo cadastro de
metadados do tribunal, e não alcançam o que vem abaixo. O que a extensão entrega:

- **Precedente anterior a 2020** — o portal oficial do TJRO tem histórico mais
  longo do que a maioria das bases indexadas por terceiros.
- **Texto de SENTENÇA (1º grau)** — esta extensão busca a peça do juízo de origem
  como documento próprio; bases de jurisprudência costumam indexar só acórdãos
  de 2º grau.
- **Pesquisa sem gastar cota** — a API do próprio TJRO é pública e sem limite de
  uso; não consome nenhuma cota de plano pago.
- **Link direto para o portal oficial do tribunal** — em vez do link de um
  intermediário, útil quando a peça exige citar a fonte primária.
- **Saber como um(a) desembargador(a) específico(a) decide uma tese** — antes de
  o processo ter câmara/relator sorteados, ou para achar (ou afastar) um
  precedente próprio dele(a), o filtro `relator` restringe a busca, no próprio
  servidor do TJRO, a um só relator — sem precisar ler acórdão por acórdão.

Para teses vinculantes (Súmula Vinculante, Tema Repetitivo, Repercussão Geral),
qualquer base nacional (STF/STJ) já resolve, já que obrigam o juízo de Rondônia
de qualquer forma.

## Filtro por relator e resumo de resultados

**`relator` é filtro no SERVIDOR do TJRO** (não é filtro sobre a página trazida
pelo Claude) — confirmado por teste real: pedir um relator muda o total de
documentos e todos os resultados voltam daquele relator. Mas é comparação
EXATA, sensível a maiúsculas e acentos, e **este campo não tem uma única
convenção de caixa no índice** — o mesmo teste achou relatores gravados em
Title Case ("Alexandre Miguel") e outros em CAIXA ALTA. Se vier zero
resultados:

1. Repita a mesma busca sem o filtro `relator`;
2. Copie o texto exato do campo **Relator(a)** de um resultado real;
3. Refaça com esse texto — não tente adivinhar a caixa.

O filtro só enxerga o relator do **ACÓRDÃO**: no índice, documentos do tipo
EMENTA costumam trazer esse campo vazio — inclua `ACÓRDÃO` em `tipo` para o
filtro valer.

**Resumo de resultados da página** — quando a busca traz 3 ou mais resultados,
o rodapé soma quantos declaram cada resultado (provido/desprovido/acolhido/
rejeitado), por exemplo `Nesta página: 7 desprovidos, 3 providos, 2 sem
resultado identificável`. É **100% offline** (lê só o texto já trazido pela
página, nenhuma requisição a mais) e existe para tornar a amostragem dirigida
barata — ver como um relator específico costuma decidir, sem ler acórdão por
acórdão. Três ressalvas que valem sempre:

- **Não é posição sobre a tese.** Um recurso pode ser provido por um fundamento
  que nada tem a ver com a tese que você está pesquisando.
- **É a amostra desta página, na ordenação pedida.** `relevantes` tende a
  enviesar (a resposta avisa quando isso ocorre); para amostragem, prefira
  `recentes` ou `antigos`, e aumente `por_pagina` (até 50) em vez de paginar.
- **É indício para escolher o que ler, nunca conclusão.** Documento que declara
  os dois lados de um resultado (ex.: ementa que registra o voto vencido) entra
  em "sem resultado identificável", nunca é forçado para um lado.

A contagem é por **julgamento** (nº do processo + data), não por documento: a
ementa e o acórdão do mesmo julgado contam uma vez só.

## Como pesquisar bem

A busca é por palavras, e julgados do mesmo assunto usam vocabulários diferentes.
Não é detalhe: num estudo clássico sobre uma base de litígio real, advogados
acreditavam ter encontrado 75% dos documentos relevantes, e o que de fato
encontraram foi cerca de 20%. Três técnicas resolvem a maior parte disso, e cabem juntas em
quatro a seis consultas:

1. **Grupos de sinônimos.** O parâmetro `grupos` recebe listas de expressões
   equivalentes: dentro de cada lista os termos se somam por OU, e as listas se
   combinam por E. A extensão monta os parênteses e protege cada termo, então não
   é preciso escrever sintaxe. Exemplo:
   `grupos = [["dano moral"], ["negativação", "inscrição indevida", "cadastro de inadimplentes"]]`.
   No teste real, isso trouxe **37% mais julgados** do que o termo único, na mesma
   consulta. Curinga só no fim de palavra única (`consign*`).
2. **Âncora pela citação.** Julgados do mesmo assunto costumam citar a mesma
   súmula, tema repetitivo ou IRDR, mesmo quando descrevem o fato com outras
   palavras. Um grupo como `["Súmula 385"]` acha esses julgados.
3. **Colher o vocabulário do melhor resultado.** Abra o inteiro teor do julgado
   mais certeiro, veja que palavras e que citações ele usa, e busque de novo com
   elas. É o que acha o vocabulário da própria câmara, que nenhuma lista prevê.

O filtro `assunto` (classificação da Tabela Processual Unificada do CNJ) funciona,
mas é **ruidoso**: o assunto é escolhido na distribuição, cada processo tem vários
e o recurso herda o do processo principal. No teste real, 7 dos 20 primeiros
resultados eram de outro tema. Use sempre junto com texto, nunca sozinho, e copie
a grafia exata do campo "Assunto:" de um resultado.

## Avisos importantes

- **Integração não-oficial.** Os dados vêm do portal oficial do TJRO, mas por uma
  via não documentada (a API pública do próprio site, a mesma que o navegador do
  usuário do portal chama — não é uma rota escondida). Funciona hoje; se o TJRO
  mudar o portal, pode parar até ser atualizada. Veja "Segurança e auditoria" abaixo.
- **Confirme antes de citar.** Sempre abra o *inteiro teor* (o link vem em cada
  resultado) e confira número, relator, câmara, data e a ementa literal antes de
  usar em peça. Vale para qualquer ferramenta de IA jurídica.
- **O trecho exibido é um fragmento, não a ementa.** A busca mostra até 800
  caracteres a partir do ponto onde os termos casaram. Ementa numerada
  (I. Caso em exame, II. Questão em discussão, III. Razões de decidir...)
  costuma **enunciar** a tese nos primeiros itens e **aplicá-la** nos últimos,
  às vezes com alcance menor do que o enunciado sugere — citar pelo fragmento é
  o jeito mais fácil de atribuir ao julgado uma tese que ele não sustenta. Abra
  o inteiro teor antes de citar; a resposta avisa quando houve corte.
- **Um número, vários julgados.** Sob o mesmo número de processo convivem o
  acórdão original, os embargos de declaração, os segundos embargos e, em
  julgamento por maioria, às vezes o voto vencido como documento próprio no
  índice. O número sozinho não identifica uma decisão — foi assim que uma peça
  real citou o conteúdo de um acórdão com o relator de outro. Por isso cada
  resultado traz o **id do documento** (chave única daquela decisão), e a
  extensão avisa quando o mesmo número aparece mais de uma vez, quando dois
  documentos do mesmo julgamento declaram resultado oposto (provável voto
  vencido) e, no inteiro teor, quando a câmara ou o relator do **índice** não
  batem com o que o **texto do acórdão** declara — o cadastro do portal já saiu
  errado nesse campo, e outras bases herdam o mesmo cadastro. Cite pelo id +
  data de julgamento, e pelo que o texto do acórdão diz.
- **Rede do escritório:** se o escritório usa proxy que intercepta HTTPS e a busca
  falhar com erro de certificado, fale com o suporte de TI (pode ser necessário
  ajustar o certificado/CA do sistema).

## Se a busca parar de funcionar

O portal do TJRO tem um filtro de segurança que pode bloquear temporariamente o
acesso automatizado quando detecta volume alto de requisições em pouco tempo —
mesmo sendo dados públicos. Se isso acontecer, a mensagem de erro vai dizer
claramente que é um bloqueio por suspeita de automação, não um bug. Não é uma
falha permanente: costuma liberar sozinho depois de um tempo. A extensão já
evita insistir durante esse período (ver "Limite de ritmo próprio" acima) — o
mais eficaz é simplesmente aguardar um pouco antes de tentar de novo, em vez
de repetir a consulta várias vezes seguidas.

**O limite se ajusta sozinho.** Como não há como saber de antemão o limiar
exato do filtro do TJRO, a extensão aprende com a experiência: cada vez que um
bloqueio real acontece, ela torna o próprio limite preventivo mais rígido (a
janela de "10 consultas" alarga — de 1 minuto para 5, depois 10, até um teto de
30 minutos); depois de uma sequência longa sem novos bloqueios, ela afrouxa de
novo. Esse aprendizado fica salvo em `~/.tjro-jurisprudencia-mcp-estado.json`
para não ser esquecido a cada reinício do Claude Desktop. O arquivo guarda só
números de controle (nível atual, horários das últimas consultas e um histórico
curto dos bloqueios) — **nenhum termo de pesquisa, processo ou dado de cliente**.

**Descubra o que aconteceu.** A ferramenta `diagnostico_ritmo_tjro` responde
"por que parou?" sem fazer nenhuma consulta ao portal: mostra o nível atual, o
quanto do orçamento já foi usado, se há bloqueio em curso (e quanto falta para
liberar) e o histórico de bloqueios com o contexto de cada um — quantas
consultas houve no minuto anterior, o intervalo entre elas e qual operação
disparou. Com isso dá para separar dois casos que se parecem: bloqueio causado
por rajada sua (espaçar resolve) e bloqueio que veio com pouquíssimo tráfego
desta máquina (a causa está fora do alcance da extensão — outro equipamento no
mesmo IP, ou o portal apertando o filtro). Basta pedir ao Claude: *"rode o
diagnóstico de ritmo do TJRO"*.

**Três limitações honestas:** (1) o orçamento coordena processos da mesma
**máquina** — dois advogados do mesmo escritório, em computadores diferentes,
saem pelo mesmo IP público e não há como coordenar isso sem um servidor central;
(2) se o arquivo de estado não puder ser gravado (disco cheio, pasta pessoal
somente-leitura), cada processo passa a contar sozinho em memória — o limite
continua valendo, mas deixa de ser compartilhado. Nesse caso o
`diagnostico_ritmo_tjro` avisa em vez de dizer que está tudo certo; (3) a
coordenação só enxerga outras cópias **desta mesma extensão** na máquina — um
script separado (seu ou de outra pessoa) que fale com o portal do TJRO por
fora dela mantém seu próprio controle, sem visibilidade sobre o desta. Rodar
os dois ao mesmo tempo na mesma máquina soma dois orçamentos independentes no
mesmo IP; não registre as duas coisas simultaneamente.

Apagar `~/.tjro-jurisprudencia-mcp-estado.json` zera o aprendizado (nível,
histórico de bloqueios e orçamento em curso) — útil se quiser recomeçar do zero.

## Segurança e auditoria

Pensado para ser fácil de verificar antes de instalar, não só "confie em mim":

- **Só leitura, sem credenciais.** As buscas fazem apenas requisições HTTP `POST`
  ao portal público do TJRO (o diagnóstico não faz requisição nenhuma). Não pedem login, token, chave
  de API nem qualquer dado além do texto da sua pesquisa — o mesmo que você
  digitaria na busca do próprio portal.
- **Sem coleta de dados.** Nenhuma telemetria, analytics ou envio de dados a
  qualquer servidor além do `juris-back.tjro.jus.br` (o backend do próprio TJRO).
- **Pouco código, fácil de ler.** Toda a lógica fica em dois arquivos:
  [`server/lib.js`](server/lib.js) (funções puras — sem rede) e
  [`server/index.js`](server/index.js) (só o registro das ferramentas MCP
  e a chamada HTTP). Juntos, menos de 500 linhas.
- **Três dependências**, todas de projetos estabelecidos:
  [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
  (SDK oficial da Anthropic para servidores MCP),
  [`zod`](https://www.npmjs.com/package/zod) (validação de schema) e
  [`he`](https://www.npmjs.com/package/he) (decodificação de entidades HTML).
- **Testado.** `server/lib.js` tem [testes automatizados](test/lib.test.js) que
  rodam em CI a cada mudança (badge no topo deste README) — inclusive regressões
  específicas dos bugs já encontrados e corrigidos neste projeto.
- **Limite de ritmo próprio, compartilhado entre sessões.** A extensão se limita
  a 10 consultas por janela de tempo, espaça as consultas em pelo menos 2
  segundos (para não disparar em rajada) e, se o portal sinalizar bloqueio por
  automação, para de tentar sozinha por um tempo em vez de insistir. Esse
  orçamento é **compartilhado por todos os processos da extensão na mesma
  máquina** — se você tiver o Claude Desktop e várias sessões do Claude Code
  abertas ao mesmo tempo, todas dividem o mesmo limite, em vez de cada uma
  contar o seu. Ver "Se a busca parar de funcionar" abaixo.
- **Uma linha de crédito, uma vez.** A primeira resposta bem-sucedida de cada
  sessão da extensão termina com uma assinatura do autor ("Esta extensão foi
  desenvolvida por @robertogrecia..."). É só texto na resposta, uma única vez:
  não é propaganda repetida, não é instrução ao Claude e **não envia nada a
  lugar nenhum** — está em [`server/lib.js`](server/lib.js), função `comCredito`.
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
