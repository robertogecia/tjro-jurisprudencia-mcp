# Jurisprudência TJRO no Claude

[![tests](https://github.com/robertogecia/tjro-jurisprudencia-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/robertogecia/tjro-jurisprudencia-mcp/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Faz o Claude pesquisar a jurisprudência do TJRO por você, dentro da conversa. Você pede em português,
e ele traz a decisão com a citação pronta e o link. Sem login e sem senha.

Minhas redes sociais: @robertogrecia

## Antes de instalar

Você precisa do **Claude Desktop**, o programa do Claude instalado no computador (Mac ou Windows).
Ainda não tem? Baixe em **[claude.com/download](https://claude.com/download)** e entre com a sua conta.

## Como instalar

**1. Baixe o arquivo**

### ⬇️ [CLIQUE AQUI PARA BAIXAR](https://github.com/robertogecia/tjro-jurisprudencia-mcp/releases/latest/download/Jurisprudencia-TJRO.mcpb)

Ele vai para a pasta Downloads. Use só este botão: o botão verde "Code" baixa o arquivo errado.

**2. Abra o arquivo**

Dê dois cliques em `Jurisprudencia-TJRO.mcpb`. O Claude Desktop abre e pergunta se quer instalar. Clique em **Instalar**.
Se nada abrir: no Claude Desktop, vá em Configurações, depois Extensões, e arraste o arquivo para lá.

**3. Comece uma conversa nova**

Reinicie o Claude Desktop se ele pedir, abra uma **conversa nova** e escreva, por exemplo:
*pesquise no TJRO acórdãos sobre dano moral por negativação indevida*.

**4. Responda a uma pergunta (só na primeira vez)**

O site do TJRO às vezes recusa pesquisas feitas por programas. O Claude vai perguntar se você autoriza que a
extensão se apresente ao site **como um navegador comum**, o que costuma evitar a recusa.

- Responda **"sim, autorizo"** para liberar. Há um risco: o tribunal pode entender como uso indevido e bloquear a internet
  do seu escritório. A decisão e a responsabilidade são suas.
- Responda **"não"** para a extensão continuar se declarando como programa. Ela pode ser recusada pelo site.

A resposta fica gravada. Para mudar depois, peça ao Claude: *mude a identificação da extensão do TJRO para navegador*
(ou *para honesta*), ou use a chave em Configurações, Extensões, Jurisprudência TJRO.

## Distinguir um precedente e ver se ele foi superado

Depois de ler um acórdão, peça ao Claude, por exemplo:
*use distinguir_tjro no acórdão id 12345, com estes fatos do meu caso: ...*

Ele mostra, sem consultar o site de novo:
- se o julgado **vincula** (IRDR ou IAC do TJRO) ou é só **jurisprudência**, que convence mas não obriga;
- a **tese** e os **fatos** do julgado, com as palavras dele;
- quais pontos dos **seus fatos** aparecem ou não no julgado;
- **sinais de superação** em decisões posteriores e o **leading case** do tema.

O resultado abre com um **resumo de 5 linhas**; o detalhe vem logo abaixo. Se pedir `formato: ficha`, sai um rascunho da ficha de precedente para você conferir e guardar.

A ferramenta não decide se o caso é diferente ou se o precedente caiu: isso é com você, depois de ler.

## Algo deu errado?

| O que aconteceu | O que fazer |
|---|---|
| Abriu uma pasta cheia de arquivos | Você baixou o arquivo errado. Use o botão do passo 1. |
| Dois cliques e nada abriu | Use o caminho alternativo do passo 2. |
| O Claude diz que não tem a ferramenta | Abra uma **conversa nova** e confira se a extensão está **ativada** em Configurações, Extensões. |
| A pesquisa falha com "verificação de navegador" ou "página de bloqueio" | O site recusou o acesso. Veja ["Se a busca parar de funcionar"](#se-a-busca-parar-de-funcionar). |
| Uso o Claude só pelo site ou pelo celular | Não funciona. Precisa do programa no computador. |
| Nada resolveu | Mostre esta tabela a alguém do escritório ou [abra uma issue](../../issues). |

## Onde funciona

Só no **Claude Desktop** (e no Claude Code), no computador. **Não funciona** no claude.ai pelo navegador nem no celular.

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

## Consultar um processo (capa e movimentos)

A ferramenta `consultar_processo_tjro` traz, pelo número CNJ, a capa (vara ou câmara,
classe, data de autuação, se está baixado, se tem gratuidade, liminar ou segredo) e
os movimentos mais recentes de um processo do TJRO, de 1º e 2º grau. Ela usa a
**API pública de processos do próprio tribunal** (Portal da Transparência, "Acesso
Automatizado Via API - Judiciário"), que é outro endereço, e por isso **funciona
mesmo quando a pesquisa de jurisprudência está bloqueada**. Peça, por exemplo:
_"Como está o processo 0000000-00.0000.8.22.0000 no TJRO?"_

O que ela **não** faz: não mostra partes, advogados, peças nem o texto das decisões
(isso está no PJe); muitos movimentos antigos aparecem só como "Movimento Local",
sem dizer o que aconteceu; e **as datas não servem para contar prazo** (prazo sai da
publicação no Diário). Se a consulta voltar vazia, o número está errado ou o
processo está em segredo de justiça, e isso não prova que ele não existe. É uma
consulta por processo, a pedido: a ferramenta não varre processos.

## Favorável a quem? E julgados parecidos — desde a 1.9.0

Duas leituras a mais, sem nenhuma consulta extra ao portal:

- **Partes e lado, no inteiro teor.** Em cada ACÓRDÃO aberto por `obter_inteiro_teor_tjro`,
  a extensão lê o cabeçalho ("Polo Ativo", "Polo Passivo") e o primeiro período do
  relatório ("X interpôs recurso…", "recurso interposto por X"), cruza com o resultado
  declarado no fecho e escreve uma linha do tipo: _"Recorreu (pelo relatório): Banco Y →
  resultado CONTRÁRIO a quem recorreu (Banco Y), favorável a Fulana"_. Quando há mais de
  um recurso (recurso adesivo, apelações de ambas as partes), ela avisa e **não** arrisca
  o lado. É heurística sobre o texto, marcada como tal: numa amostra de 92 acórdãos ela
  identificou as partes em 84 e o lado em 55; confira sempre no dispositivo. Só existe
  no inteiro teor: o cabeçalho que vem na busca não traz partes legíveis.
- **`similares_a`, na busca.** Achou um julgado bom na página? Repita a mesma busca
  (mesma consulta, filtros e página, `por_pagina` alto) passando o id dele em
  `similares_a`: a página volta **reordenada pela semelhança de texto** com esse julgado
  (cosseno TF-IDF calculado no seu computador), com a semelhança em % no cabeçalho.
  Como a resposta da busca fica em cache, isso não gasta consulta. Semelhança de
  palavras não é semelhança de tese: ementa e acórdão do mesmo julgado pontuam alto
  entre si, e um julgado do mesmo assunto com outro vocabulário pontua baixo. Serve
  para escolher o que ler, não para concluir.
- **`sugerir_termos`, na busca (v1.32.0).** O motor do TJRO casa palavras, e o julgador pode ter escrito o mesmo com outras. Com `sugerir_termos=true` (e `por_pagina`
  de 50 a 250), a resposta termina com o **vocabulário das ementas que casaram**: termos e pares característicos (frequentes nos resultados, raros nos julgados que
  a extensão já leu), as variantes dos seus termos com o radical para `termo*` e, com `relator`, as expressões que ele repete. Use para montar a 2ª rodada em
  `grupos` (alternativas em OU) e `excluir`. Não gasta consulta; a rodada seguinte gasta. Medido às cegas: 65% das sugestões descrevem o assunto, 4% são ruído,
  o resto é fórmula de acórdão; é sugestão, confira que a nova busca traz o assunto. Com `similares_a`, a nota também lista os termos que distinguem o julgado-modelo ("mais como este").
- **`modo="triagem"` no inteiro teor (v1.33.0).** Antes de gastar uma leitura integral de um acórdão contrário, peça `obter_inteiro_teor_tjro` com `modo="triagem"`:
  por julgamento, o resultado declarado, as peças com id e link, a tese da ementa, os fatos do julgado, o fecho e os precedentes qualificados citados, sem o texto
  (uns 10 a 15% do tamanho). Serve para decidir o que ler; para pôr trecho entre aspas, use o modo completo ou `verificar_citacao_tjro`. Os alertas desta também dizem
  onde: o voto divergente mostra como a parte divergente começa, e o obiter mostra a frase da marca.

## Antes das aspas: verificar a citação, e o que já foi lido — desde a 1.10.0

Três coisas novas, e nenhuma delas gasta consulta no portal quando o acórdão já foi lido:

- **`verificar_citacao_tjro`** confere se a frase que vai entre aspas na peça está
  **literalmente** no documento (por palavra inteira, ignorando caixa, acento e
  pontuação; `[...]` marca cortes, desde que os pedaços apareçam em ordem e perto um do
  outro) e diz **de quem é a frase**. Um acórdão transcreve ementas inteiras do STJ e de
  outros tribunais, e o documento ACÓRDÃO traz também o voto que perdeu. Uma frase copiada
  de lá está no texto, mas não é palavra do TJRO naquele processo. O verificador avisa:
  TRANSCRIÇÃO, VOTO DIVERGENTE, ENTRE ASPAS, ALEGAÇÃO DA PARTE (o relatório contando o que
  o apelante sustenta) e NEGAÇÃO (um "não" logo antes do recorte). O aviso de VOTO DIVERGENTE
  traz a proclamação do fecho ("…nos termos do voto divergente, vencido o relator"), para
  você ler quem venceu sem reabrir o acórdão. Desde a 1.15.0 a resposta também diz ONDE a
  frase está (nota POSIÇÃO NO JULGADO: seção da ementa do CNJ, relatório, fundamentação ou
  dispositivo do voto, fecho) e avisa OBITER DICTUM? quando ela vem sob marca de raciocínio
  hipotético ou fundamento alternativo — é a evidência para dizer se a frase é ratio ou
  dictum, não a decisão. Ele lê primeiro o recibo
  que `obter_inteiro_teor_tjro` gravou no seu computador; só vai ao portal se o documento
  nunca foi lido. Passe o `id_documento` da peça citada; com só o número, confere em todos
  os documentos do processo.
  Todos os avisos foram medidos contra gabaritos **cegos e duplos** (1.12.0 e 1.13.0): 630 trechos reais, cada um
  rotulado por dois revisores independentes que não sabiam o que o verificador dizia (kappa de 0,93 a 1,00).

  | Aviso | acerta quando avisa | pega dos casos reais | avisa à toa sobre frase limpa |
  |---|---|---|---|
  | TRANSCRIÇÃO (outro julgado, ou sentença/decisão que o relator anuncia copiar) | ~91% | ~84% | ~4% |
  | VOTO DIVERGENTE | ~77% | ~89% | ~5% |
  | ENTRE ASPAS | ~100% | ~70% | ~0% |
  | ALEGAÇÃO DA PARTE | 71% a 90% | ~83% | 2% a 8% |
  | NEGAÇÃO | ~68% | ~75% | ~7% |
  | OBITER DICTUM? ("ainda que assim não fosse", "a título de argumentação") | ~86% | ~8% | ~0% |

  A nota POSIÇÃO NO JULGADO (onde a frase está) foi medida do mesmo jeito em 06/10/2026: acerta a parte do julgado em 94%
  dos trechos de uma validação cega de 72 (STJ 81%, TJSE 99%).

  A faixa da ALEGAÇÃO vem de duas amostras (120 e 160 trechos). São avisos de cautela, não garantia: a ausência
  deles não prova que a frase é do tribunal. Os números antigos de TRANSCRIÇÃO e VOTO DIVERGENTE (97% e 100% de
  detecção) vinham de um gabarito rotulado por quem desenhou a regra e não mediam alarme falso; às cegas, o VOTO
  DIVERGENTE acertava só 43% das vezes em que avisava, e a 1.13.0 corrigiu a maior causa (acórdão unânime).
- **`buscar_recibos_tjro`** procura nos documentos que **esta máquina já leu**, sem tocar no
  portal. Serve para reencontrar o acórdão da semana passada antes de gastar cota do JURIS,
  que conta volume em poucos minutos. Mostra id, número, câmara do fecho, um trecho em
  volta do termo e se o recibo tem custódia. Com `nr_processo` (o início do número basta)
  ou `id_documento` reencontra um acórdão já lido sem precisar de termos; `relator` lista o
  que você já leu de um desembargador. Não é pesquisa no
  acervo do tribunal: zero resultado aqui nunca é "não localizado".
- **`auditar_citacoes_tjro`** (1.39.0) confere, sem tocar no portal, cada número de processo de
  uma peça que você cola: se o dígito verificador do CNJ fecha (número errado ou inventado sai
  em vermelho antes de gastar consulta), de que tribunal é, e, quando o acórdão já foi lido
  nesta máquina, se a câmara escrita na peça é a do **fecho** (pega a "3ª Câmara Cível" posta
  em acórdão julgado pela 1ª ou pela 2ª), se o relator e a data batem. Lista à parte as
  citações a STJ e STF, contando uma vez o AgInt e os EDcl dentro do mesmo REsp. Medido em
  amostra nova de 30 citações escritas em estilos variados: achou 12 dos 15 erros plantados e
  não acusou nenhuma das 15 corretas; em 64 notas reais do acervo, nenhum alarme vermelho
  falso. Não diz se o julgado sustenta a tese: isso continua sendo leitura.
- **Cadeia do processo e semáforo no `distinguir_tjro`** (1.40.0), sem tocar no portal. Uma
  seção nova lista os julgamentos do MESMO processo já lidos nesta máquina e marca em vermelho o
  que modificou o acórdão depois: juízo de retratação exercido, embargos acolhidos que mudaram o
  dispositivo (honorários, juros, sucumbência, resultado) ou anulação. Embargos acolhidos em que
  a regra não acha a mudança saem em laranja, "confira". O resumo ganha a linha "Situação", um
  semáforo **sem verde**: vermelho, laranja ou branco. Branco quer dizer "nenhum sinal aqui", nunca
  "está vigente". Medido às cegas com dois rotuladores: nas amostras de ajuste, 36 de 37
  marcações vermelhas corretas; numa amostra nova de 39 casos difíceis, nenhum vermelho falso,
  2 das 3 modificações reais em laranja e 1 que passou.
- **`lista_de_leitura_tjro`** (1.41.0), sem tocar no portal: para um tema, os processos do TJRO
  que os acórdãos já lidos mais citam e que você ainda não abriu, os já lidos e os STJ/STF mais
  citados. A rede de citações local costuma ser rasa (na máquina do autor, cerca de 5% dos citados tinham
  sido lidos em 18/10/2026); a lista diz onde abrir primeiro, contando relatores distintos para
  não confundir o parágrafo-padrão de um gabinete com jurisprudência da câmara. "Mais citado" é candidato a ler, não leading case.
  O formato `ficha` do `distinguir_tjro` passou a levar `situacao_local`, que o lint da
  `peticao-rg` usa para barrar ficha de acórdão modificado depois.
- **`julgados_que_citam_tjro` com `direcao="citados"`** (1.40.0) mostra o que UM acórdão já lido
  cita, sem consulta: cada processo do TJRO com câmara do fecho e resultado, se já foi lido
  aqui, e as citações a STJ e STF. Marca como indício a citação que parece estar só dentro da
  ementa de outro julgado transcrita no voto. Às cegas, a marca acertou 7 de 9 e deixou passar
  parte; até os rotuladores divergiram em metade dos casos, então confira no texto.
- **Linha de custódia no inteiro teor.** Cada ACÓRDÃO e VOTO abertos vêm com uma linha
  dizendo quantos trechos são de outros julgados (e que fatia do voto isso é), onde começa o
  voto que pode ser o vencido e onde começa a ementa da casa. É a mesma conta que vai para
  o recibo e que o lint da peça lê; antes só o lint via.

## Normas do próprio TJRO (resoluções, provimentos, instruções) — desde a 1.8.0

Muita tese em Rondônia depende de um ato do próprio tribunal, não de lei: a instrução
da Presidência sobre licença-prêmio, o provimento da Corregedoria sobre custas ou
registro de imóveis, as Diretrizes Gerais Judiciais, o Regimento Interno. Esses atos
vivem no portal oficial `atos.tjro.jus.br`, e duas ferramentas o consultam:

- `buscar_norma_tjro` pesquisa por **argumento** (uma expressão curta, procurada no
  texto integral do ato, não só na ementa), por **número e ano** (para um ato que você
  já conhece), por **tipo** (Resolução, Provimento, Instrução, Regimento Interno…),
  **origem** (Presidência, Corregedoria Geral da Justiça…), **situação** e **tema** do
  cadastro. Vêm 10 por página, com a situação do portal (Vigente, Alterado, Revogado…),
  **os vigentes primeiro**, e o id de cada ato. Peça, por exemplo:
  _"Que norma do TJRO trata da conversão de licença-prêmio em pecúnia?"_ ou
  _"Abra a Instrução 11/2016 da Presidência do TJRO."_
- `obter_norma_tjro` abre um ato pelo id e traz a situação, a ementa, **quem o alterou
  ou revogou** (com o id do ato novo, para seguir a cadeia até a norma que vale hoje), a
  **legislação correlata** que o portal cadastra, os PDFs e o **texto compilado**, com
  as alterações marcadas no próprio texto. Dá para pedir só um artigo (`artigo="4"`) e
  ler textos longos em fatias.

O que vale saber: a situação é a do cadastro do portal (o próprio TJRO avisa quando um
ato está "em fila de revisão"); ato **Alterado** se cita pela redação compilada e pela
norma que a deu; ato **Revogado** não se cita como em vigor. Alguns atos antigos só
existem em PDF, e aí a ferramenta dá o link e diz que não há texto para citar. Cada ato aberto deixa um
recibo local (`~/.tjro-jurisprudencia-recibos/norma-<id>.json`) com o texto e a situação, para quem confere
citações contra a fonte. Zero
resultado nunca é "a norma não existe": o portal procura o termo exato, então varie a
grafia ("licença especial", "licença-prêmio", "assiduidade") ou tire os filtros. Essas
consultas dividem a cota de ritmo da extensão, como as demais.

## Quando usar isto (e quando usar outra coisa)

**Só faz sentido para casos da jurisdição do TJRO** (1º ou 2º grau de Rondônia).
Jurisprudência do TJRO não tem autoridade em outro tribunal — para um processo
que tramita em outro estado, use a fonte daquele tribunal ou uma base nacional.

Esta extensão consulta o **próprio portal oficial** do TJRO (JURIS), que indexa
cerca de 4 milhões de documentos de 1º e 2º grau. Ela vale o que o portal indexa:
o que não está no índice do JURIS não aparece aqui. O que a extensão entrega:

- **Documentos anteriores a 2020** — o índice do portal inclui peças de anos
  anteriores (numa busca de 21/09/2026 vieram sentenças de 2017 e 2018).
- **Texto de SENTENÇA (1º grau)** — o índice tem a sentença do juízo de origem
  como documento próprio, tanto de Juizados Especiais quanto de varas cíveis
  (conferido em 21/09/2026, de 2017 a 2026, com link para a peça). Use
  `tipo=["SENTENÇA"]` ou `grau=1`. **Sentença de 1º grau não é precedente:** serve
  para ver como um juízo ou comarca decide e para achar os fundamentos que ele
  cita, não para citar como jurisprudência. Nos resultados, o campo
  "Relator(a)" de uma sentença é o(a) juiz(a).
- **Sem custo por consulta** — a busca usa a API pública do próprio site do TJRO;
  não consome cota de plano pago. Isso não quer dizer sem limite: o portal bloqueia
  rajadas, e por isso a extensão limita o próprio ritmo (ver "Se a busca parar de
  funcionar").
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
o rodapé soma quantos declaram cada resultado (provido / parcialmente provido /
desprovido / acolhido / rejeitado), por exemplo `Nesta página: 7 desprovidos, 3 providos, 2 sem
resultado identificável`. É **100% offline** (lê só o texto já trazido pela
página, nenhuma requisição a mais) e existe para tornar a amostragem dirigida
barata — ver como um relator específico costuma decidir, sem ler acórdão por
acórdão. Três ressalvas que valem sempre:

- **Não é posição sobre a tese.** Um recurso pode ser provido por um fundamento
  que nada tem a ver com a tese que você está pesquisando.
- **É a amostra desta página, na ordenação pedida.** `relevantes` tende a
  enviesar (a resposta avisa quando isso ocorre); para amostragem, prefira
  `recentes` ou `antigos`, e aumente `por_pagina` (até 250, com `modo="compacto"`) em vez de paginar.
- **É indício para escolher o que ler, nunca conclusão.** Documento que declara
  os dois lados de um resultado (ex.: ementa que registra o voto vencido) entra
  em "sem resultado identificável", nunca é forçado para um lado.

A contagem é por **julgamento** (nº do processo + data), não por documento: a
ementa e o acórdão do mesmo julgado contam uma vez só.

### Panorama, lista compacta e filtro por resultado (v1.7.27)

Três recursos que custam **zero consulta a mais** ao portal:

- **Panorama do resultado inteiro.** Toda busca com 3 ou mais documentos abre
  com a distribuição de TODOS os documentos que casaram (não só da página) por
  câmara/vara, gabinete, classe e ano de julgamento. O portal já devolve essas
  agregações em cada resposta; a extensão só passou a mostrá-las. Serve para
  ver onde e quando o tema é julgado e escolher os filtros (`orgao_colegiado`,
  `relator`, `classe_judicial`, datas) antes de gastar a próxima consulta.
  Câmara e gabinete ali são os do **cadastro** do portal, que erra a câmara.
- **`modo="compacto"` e `por_pagina` até 250.** O portal entrega até 250
  julgados numa única consulta (medido em 26/09/2026), pelo mesmo custo de 10
  no ritmo. No modo compacto cada documento vira uma linha (órgão, data,
  relator, resultado declarado, assunto, processo, id), sem trecho — é o modo
  para **varrer** um tema; depois abra em modo completo só os que interessam.
  Com 10 ou mais julgamentos na página, o rodapé traz a **quebra por relator,
  por órgão e por ano** (só chaves com 3+ julgamentos).
- **`resultado="provido" | "parcial" | "desprovido" | "acolhido" | "rejeitado" | "sem"`.**
  Filtra **no cliente**, só dentro da página trazida, os documentos cujo
  julgamento declara aquele resultado no dispositivo. Use com `por_pagina`
  alto; o total do cabeçalho continua sendo o do índice.

**O que isso é e o que não é.** Resultado declarado é o dispositivo extraído do
fim do texto, e "parcialmente provido" é um qualificador do provido. A taxa de
provimento de um relator diz quem costuma reformar ou manter, não por quê; a
mudança de proporção entre anos é sinal para ler os julgados dos dois períodos,
nunca conclusão de "mudança de entendimento". Nada disso é posição sobre a
tese, e nada disso entra em peça como número sem a leitura dos acórdãos.
Medição de 26/09/2026 sobre 4.840 acórdãos em cache: 73 % trazem marcador de
resultado legível; o resto sai como "sem resultado identificável", nunca é
chutado.

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
   **Cada grupo descreve o assunto ou o fato, nunca a conclusão do julgado.** Medido
   em 22/09/2026, em 7 teses reais com buscas escritas às cegas: um grupo com as
   palavras da conclusão ("não equivale", "é inócua", "não afasta") zerou a busca numa
   tese e escondeu o acórdão certo noutra, que voltou ao 1º lugar só tirando esse
   grupo. Cada acórdão escreve a conclusão de um jeito; a conclusão se confere lendo
   o resultado. No mesmo teste, texto livre e grupos acharam o acórdão certo entre os
   10 primeiros em 4 de 7 teses cada, errando em teses diferentes: se uma tese
   decisiva não apareceu numa forma, tente a outra.
   **Não filtre por família de câmara por padrão** ("só cíveis", "só criminais"). Nas
   mesmas 7 teses, 2 dos 8 julgados certos vinham de outra família (Câmara Especial,
   Turma Recursal) e 2 tinham o órgão em branco no cadastro, e qualquer filtro de órgão
   os perde. O filtro `orgao_colegiado` aceita **um órgão só**: vírgula ou "ou" não
   somam órgãos (o portal devolveria zero, e a extensão agora recusa com explicação).
   Use-o para ver como uma câmara específica decide, conferindo a câmara no fecho.
   **Grupos estreitos vencem listas longas de sinônimos** (medido em 25/09/2026, 7
   teses): grupos com 2 a 4 termos do fato acharam o julgado certo no top-10 em 4
   de 7 teses; a mesma busca com 8 a 15 sinônimos por grupo caiu para 3 de 7 e
   alargou o resultado (de 2 para 14.031 documentos numa tese). Expanda só quando
   a busca zerar ou vier com poucos resultados sem o julgado esperado. Acento não
   faz diferença ("repeticao" acha "repetição").
   **Proximidade** (desde a v1.7.24): num termo de grupo, `repetição dobro ~3` acha
   as duas palavras a até 3 posições uma da outra, em qualquer ordem ("repetição em
   dobro", "repetição do indébito em dobro"): 3.208 documentos, contra 16 da frase
   exata. Use quando a frase exata der pouco e o conceito for um par de palavras;
   medido em 7 teses, empata com os grupos estreitos, acertando teses diferentes.
   **Excluir palavras** (desde a v1.7.25): `excluir=["energia elétrica", "telefonia"]`
   tira da busca os documentos que citam esses termos. Numa busca de "dano moral" por
   negativação, caiu de 13.573 para 10.573 documentos e zerou o ruído de energia e
   telefonia nos 20 primeiros. Cuidado: tira também o julgado certo que cite o termo de
   passagem. Use só para ruído evidente, nunca na única busca de uma tese.
2. **Âncora pela citação.** Julgados do mesmo assunto costumam citar a mesma
   súmula, tema repetitivo ou IRDR, mesmo quando descrevem o fato com outras
   palavras. Um grupo como `["Súmula 385"]` acha esses julgados. A âncora tem
   de ser específica (número de lei, súmula ou tema): um artigo de uso geral, como
   `["art. 42"]`, traz milhares de documentos e afunda o julgado certo.
3. **Colher o vocabulário do melhor resultado.** Abra o inteiro teor do julgado
   mais certeiro, veja que palavras e que citações ele usa, e busque de novo com
   elas. É o que acha o vocabulário da própria câmara, que nenhuma lista prevê.

**Pesquisa longa com agentes (Cowork ou Claude Code).** Se você usa o Claude
com subagentes, uma pesquisa extensa (várias teses, leitura de muitos inteiros
teores) pode ir para **um agente separado, no modelo Sonnet**, que dá conta da
busca e da leitura com custo menor; deixe a conclusão (o que o julgado decide e
se serve ao caso) para a conversa principal. Duas regras: **um agente por vez
consultando o TJRO, nunca vários em paralelo** — todos dividem o mesmo limite de
ritmo desta máquina, e rajada é o que dispara o bloqueio do portal; e peça ao
agente que abra o inteiro teor antes de afirmar o que um acórdão decide. Na
conversa comum do Claude Desktop não há subagentes, e nada disso é necessário.

**Pesquisa longa e a espera.** Quando a ferramenta manda esperar (limite de ritmo ou
bloqueio do tribunal), a resposta traz o tempo em segundos e o tipo, no formato
`[espera_segundos=N tipo=...]`. Quem conduz uma pesquisa longa com agentes (Claude
Code ou Cowork) pode esperar esse tempo em segundo plano e retomar de onde parou,
em vez de desistir. Insistir antes da hora não ajuda: cada bloqueio dobra o tempo de
recuo, de 10 minutos até 1 hora.

**Economize consultas: o limite do TJRO é de volume.** Num teste de 23/09/2026,
18 consultas espaçadas de 5 a 8 segundos foram bloqueadas em cerca de 3 minutos:
espaçar não basta, o que conta é quantas saem em poucos minutos, somando todas as
conversas abertas nesta máquina. Por isso: prefira 2 ou 3 buscas amplas (até 250 em modo compacto
resultados cada) a várias pequenas; escolha pela ementa e pelo trecho que a busca
já mostra; e abra o inteiro teor só do que vai citar. **Inteiro teor já aberto nos
últimos 7 dias volta do disco, sem nova consulta** (a resposta avisa "Do cache
local"), então reabrir o mesmo acórdão não gasta nada. **A mesma busca refeita em
24 horas também volta do disco**, inclusive depois de reiniciar o Claude. E 50
resultados numa busca custam uma consulta, o mesmo que 10.

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
  batem com o que o **texto do acórdão** declara. Cite pelo id + data de
  julgamento, e pelo que o texto do acórdão diz. No inteiro teor, cada peça traz
  o **próprio link** do portal: se a peça que você escreve leva link para o
  julgado citado (para o juiz clicar e conferir), use o link e o id da mesma
  peça, nunca os de outra peça do mesmo número.
- **A câmara do cadastro erra com frequência.** Numa amostra de 82 acórdãos
  reais (14/09/2026), 15 dos 24 processos que o portal cadastra na "3ª Câmara
  Cível" foram julgados pela 1ª ou pela 2ª, e outras bases herdam o mesmo
  cadastro. Por isso a extensão lê a câmara no **fecho do acórdão** ("acordam os
  Magistrados da(o) 1ª Câmara Cível do Tribunal de Justiça..."), que é a ata do
  julgamento; quando ele diverge do cadastro, a busca e o inteiro teor mostram a
  câmara do fecho com um aviso, e a **citação pronta já sai com ela**. Sem fecho
  no texto (ementa, decisão monocrática), vale o cabeçalho, com o mesmo aviso. O
  filtro por câmara (`orgao_colegiado`) usa o cadastro: julgados de uma câmara
  cadastrados em outra ficam de fora, o que pesa quando se quer a posição de uma
  câmara.
- **Rede do escritório:** se o escritório usa proxy que intercepta HTTPS e a busca
  falhar com erro de certificado, fale com o suporte de TI (pode ser necessário
  ajustar o certificado/CA do sistema).

## Se a busca parar de funcionar

O site do TJRO tem um filtro de segurança, e às vezes ele recusa a pesquisa. Há dois casos.

**1. A mensagem fala em "verificação de navegador".** O site exigiu um teste que só um navegador faz. Esperar não resolve, e a
extensão não consegue fazer esse teste. O que fazer: tentar em outra internet (outro Wi-Fi, ou o celular como roteador), usar o
site do TJRO direto no navegador enquanto isso, ou pedir a liberação ao tribunal pelo e-mail `suporte@tjro.jus.br`, assunto
"Acesso Bloqueado", dizendo que é uso próprio, de poucas consultas, sobre dado público.

**2. A mensagem fala em "página de bloqueio" ou a extensão foi recusada logo na primeira busca.** Foi a identificação honesta
da extensão que o site recusou. Se você aceita o risco, autorize que ela se apresente como navegador (passo 4 da instalação).

Por precaução, a extensão pesquisa devagar. Se o site bloquear, ela para sozinha por um tempo e avisa quanto falta. Para
saber o que está acontecendo, peça ao Claude: *"rode o diagnóstico de ritmo do TJRO"*. Ele não consulta o site.

Se continuar, [abra uma issue](../../issues) dizendo a versão instalada (o diagnóstico mostra na primeira linha).

## Segurança e auditoria

Pensado para ser fácil de verificar antes de instalar, não só "confie em mim":

- **Só leitura, sem credenciais.** As buscas fazem apenas requisições HTTP `POST`
  ao portal público do TJRO (o diagnóstico não faz requisição nenhuma). Não pedem login, token, chave
  de API nem qualquer dado além do texto da sua pesquisa — o mesmo que você
  digitaria na busca do próprio portal.
- **Sem coleta de dados.** Nenhuma telemetria ou analytics. A pesquisa só vai
  para o `juris-back.tjro.jus.br` (o backend do próprio TJRO). A única outra
  conexão é o **aviso de versão nova** (abaixo): um `GET` sem dados seus a
  `api.github.com`, uma vez por sessão.
- **Sinais do julgado, sem nota inventada.** Cada resultado que cita um precedente
  qualificado (súmula, súmula vinculante, tema repetitivo ou de repercussão geral,
  IRDR, IAC) ganha uma linha `Cita: …` com o que foi citado. Serve para dois fins:
  é indício de peso do julgado e é **âncora para a próxima busca** — julgados do
  mesmo assunto costumam citar a mesma súmula, mesmo escrevendo o fato com outras
  palavras. Em 83 acórdãos reais (21/09/2026), 24 traziam alguma citação dessas.
  Resultado de 1º grau ganha o aviso de que **sentença não é precedente**, e o de
  Turma Recursal, o de que é dos **Juizados Especiais** (pesa em processo do Juizado;
  em recurso do rito comum, prefira acórdão de Câmara). A leitura
  é feita no texto que já veio, sem nenhuma requisição a mais, e a extensão **não
  pontua nem reordena** os resultados: nota calculada por máquina vira autoridade
  aparente, e a situação de cada precedente citado (vigente, superado, distinguido)
  continua sendo para conferir na fonte.
- **Quando algo dá errado, a própria mensagem de erro diz o que fazer.** Se
  houver versão mais nova da extensão, o erro avisa (ela pode já ter a correção).
  E, se o problema continuar, traz um link para **relatar o erro ao autor**: ele
  abre o formulário de relato do GitHub já preenchido com dados técnicos —
  versão, sistema operacional, tipo do erro e o estado do limitador de ritmo.
  **Nada é enviado sozinho**: você lê, completa se quiser e decide se envia (é
  preciso ter conta gratuita no GitHub). O relato é público, por isso ele **nunca
  leva o texto da sua busca nem número de processo** — a busca pode descrever o
  caso de um cliente. Erro de "muitas consultas em pouco tempo" não traz link de
  relato, porque se resolve esperando.
- **Recibo do inteiro teor (anti-alucinação).** Toda vez que o inteiro teor de
  um processo é aberto, o texto que o portal entregou fica gravado em
  `~/.tjro-jurisprudencia-recibos/<id do documento>.json`. Serve para conferir
  depois, por script ou a olho, se o trecho que foi para a peça está mesmo no
  documento do tribunal, e não só no que a IA diz ter lido. É texto público de
  acórdão e fica só na sua máquina; pode apagar a pasta quando quiser. Outra
  pasta: variável de ambiente `TJRO_MCP_DIR_RECIBOS`.
  Desde a v1.7.16, o recibo também registra o que **não** é palavra do TJRO:
  `trechos_transcritos` (ementas de outros julgados que o voto copia),
  `trecho_divergente` (o voto que pode ter sido vencido) e, no ACÓRDÃO,
  `texto_voz_propria` (ementa da casa e fecho). Assim, quem confere a peça é
  avisado quando o trecho citado está no documento, mas foi escrito por outro
  tribunal ou pelo voto vencido. Medição e limites estão no `CHANGELOG.md`.
- **Recibo da busca (v1.31.0).** A busca e a linha do tempo também guardam o texto dos documentos que trouxeram, marcados `origem: "busca"`.
  Isso poupa reabrir um acórdão só para citá-lo, mas não prova que a lista de documentos do processo esteja completa: o verificador de citação
  só declara "não encontrado" por número de processo quando há recibo do inteiro teor (ou lê o processo no portal). A busca nunca sobrescreve
  um recibo existente, e acima de 300 MB (`TJRO_MCP_RECIBOS_BUSCA_MAX_MB`) saem os recibos de busca mais antigos, nunca os do inteiro teor.
- **Aviso de versão nova.** Ao subir, a extensão pergunta ao GitHub qual é a
  release mais recente. Se houver uma mais nova que a instalada, a primeira
  resposta da sessão termina com uma linha avisando, com o endereço da página
  de releases (fixo no código, nunca tirado da resposta do GitHub). Esse aviso
  **não baixa nem instala nada**. Se você quiser, pode pedir ao Claude para
  **"atualizar a extensão do TJRO"** (ferramenta `atualizar_extensao_tjro`, só a
  seu pedido): ela baixa o arquivo novo do repositório oficial para a pasta
  Downloads e confere o SHA-256 publicado pelo GitHub, o tamanho e o formato,
  sem sobrescrever nada seu. **Quem instala é você**: dois cliques no arquivo e
  "Instalar". A extensão nunca se instala nem abre o instalador sozinha. A
  conferência protege contra arquivo corrompido ou desviado no caminho; não
  protege contra uma conta do GitHub comprometida, porque o SHA vem do próprio
  GitHub. O GitHub vê o IP de quem consulta, como em qualquer acesso a
  página sua; nenhum dado da pesquisa ou do caso vai junto. Sem internet, o
  aviso simplesmente não aparece (a espera é de no máximo 2 segundos). Para
  desligar, defina a variável de ambiente `TJRO_MCP_SEM_AVISO_ATUALIZACAO=1`.
- **Código pequeno e legível, sem código gerado.** Toda a lógica fica em dois
  arquivos, cerca de 1.600 linhas no total: [`server/lib.js`](server/lib.js)
  (montagem da busca, chamadas ao portal, formatação, controle de ritmo, recibos
  e aviso de versão) e [`server/index.js`](server/index.js) (só o registro das
  três ferramentas MCP).
- **Três dependências**, todas de projetos estabelecidos:
  [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
  (SDK oficial da Anthropic para servidores MCP),
  [`zod`](https://www.npmjs.com/package/zod) (validação de schema) e
  [`he`](https://www.npmjs.com/package/he) (decodificação de entidades HTML).
- **Testado.** `server/lib.js` tem [testes automatizados](test/lib.test.js) que
  rodam em CI a cada mudança (badge no topo deste README) — inclusive regressões
  específicas dos bugs já encontrados e corrigidos neste projeto.
- **Limite de ritmo próprio, compartilhado entre sessões.** A extensão se limita
  a 10 consultas por janela de tempo, espaça as consultas em pelo menos 7
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

No **Claude Code**, depois do `npm install`, registre o servidor com o caminho
absoluto da pasta:

```bash
claude mcp add tjro_jurisprudencia -- node /caminho/para/tjro-jurisprudencia-mcp/server/index.js
```

## Apoie o projeto

A extensão é gratuita e de código aberto, e é mantida no tempo livre de um advogado:
cada mudança do portal do TJRO exige diagnóstico, correção, testes e versão nova.
Se ela economiza o seu tempo, você pode apoiar a continuidade do trabalho com
qualquer valor, por **Pix**:

> **Chave Pix (e-mail):** `robertogrecia@hotmail.com`

O apoio é voluntário e não muda nada no uso: a extensão continua igual para todos.

## Autor

**Roberto Grécia Bessa** — OAB/RO 7865-A
Instagram: [@robertogrecia](https://instagram.com/robertogrecia)

## Licença

MIT — veja [LICENSE](LICENSE).
