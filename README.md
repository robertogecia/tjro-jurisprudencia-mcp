# Jurisprudência TJRO no Claude

[![tests](https://github.com/robertogecia/tjro-jurisprudencia-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/robertogecia/tjro-jurisprudencia-mcp/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Isto ensina qualquer advogado — **sem conhecimento nenhum de informática** — a dar
ao Claude a capacidade de pesquisar jurisprudência do TJRO (o portal oficial JURIS)
dentro da própria conversa, sem precisar abrir o site do tribunal. Sem login e sem
mexer em código.

## Antes de começar: você já tem o "Claude Desktop"?

O "Claude Desktop" é o **programa** do Claude que você instala no computador
(diferente de usar o Claude pelo site, no navegador). É ele que faz a pesquisa
funcionar — sem ele instalado, nada dos passos abaixo funciona.

- **Já tenho** (uso o Claude num aplicativo separado, não numa aba do navegador) →
  pule para "Passo 1" abaixo.
- **Não sei, ou uso só pelo navegador** → baixe primeiro o programa em
  **[claude.com/download](https://claude.com/download)**, instale, crie sua conta
  (ou entre com a que já tem) e volte aqui.

## Instalar a pesquisa do TJRO (3 passos, uns 2 minutos)

### Passo 1 — Baixe o arquivo

### ⬇️ [CLIQUE AQUI PARA BAIXAR (`Jurisprudencia-TJRO.mcpb`)](https://github.com/robertogecia/tjro-jurisprudencia-mcp/releases/latest/download/Jurisprudencia-TJRO.mcpb)

Um arquivo chamado `Jurisprudencia-TJRO.mcpb` vai para a pasta **Downloads** (ou
"Transferências") do seu computador — o mesmo lugar onde caem os PDFs que você
baixa da internet. Você não precisa abri-lo agora, só saber onde ele está.

> **⚠️ Atenção a um erro comum:** se em vez de clicar no botão acima você navegou
> até a página principal do projeto no GitHub e clicou no botão verde
> **"Code" → "Download ZIP"**, isso baixou o arquivo errado (o código-fonte do
> programa, que não serve para instalar). Apague esse zip e use só o link do
> botão acima.

### Passo 2 — Abra o arquivo baixado

1. Abra a pasta **Downloads** do seu computador (no Mac, o ícone de seta para
   baixo na barra de baixo da tela costuma abrir direto nela; no Windows, é
   "Este Computador" → "Downloads", ou o ícone de pasta na barra de tarefas).
2. Procure o arquivo **`Jurisprudencia-TJRO.mcpb`** e **dê dois cliques** nele,
   como você faria para abrir uma foto ou um PDF.
3. O programa Claude Desktop deve abrir sozinho, numa tela perguntando se você
   quer instalar a extensão "Jurisprudência TJRO". Clique em **Instalar**
   (ou "Install").

   *Se, em vez disso, nada abrir:* o passo alternativo é abrir você mesmo o
   Claude Desktop, ir em **Configurações** (o ícone de engrenagem) →
   **Extensões**, e arrastar o arquivo `Jurisprudencia-TJRO.mcpb` para dentro
   dessa janela com o mouse.

### Passo 3 — Confirme e teste

1. Se o Claude Desktop pedir para **reiniciar**, feche e abra o programa de novo.
2. Comece uma **conversa nova** (bem importante: se você estava numa conversa
   já aberta antes de instalar, abra outra).
3. Digite algo como:
   > *pesquise no TJRO acórdãos sobre dano moral por negativação indevida*
4. O Claude deve perguntar se pode usar a ferramenta de pesquisa do TJRO — é
   sinal de que funcionou. Autorize, e a busca aparece na conversa.

**Pronto.** Você não precisa instalar mais nada além do Claude Desktop — o
programa já traz tudo que a extensão precisa para rodar.

> Funciona em computador **Mac ou Windows**. Em celular ou tablet, e no Claude
> pelo site (sem instalar o programa), esta pesquisa não funciona — veja por quê
> em ["Onde funciona"](#onde-funciona) mais abaixo.

## Algo deu errado? Veja aqui antes de pedir ajuda

| O que aconteceu | O que fazer |
|---|---|
| Baixei um arquivo, mas quando abro vira uma **pasta cheia de arquivos**, e não a tela de instalação | Você baixou o arquivo errado (o código-fonte, não o instalador). Volte ao topo desta página e use o botão **"CLIQUE AQUI PARA BAIXAR"**. |
| Dei dois cliques no `.mcpb` e **não abriu nada** | Tente o caminho alternativo do Passo 2: abra o Claude Desktop → Configurações → Extensões, e arraste o arquivo para essa janela. |
| Instalei, mas quando pergunto sobre o TJRO o Claude diz que **não tem essa ferramenta** | Confira se você abriu uma **conversa nova** depois de instalar (conversa antiga não percebe a instalação). Confira também se a extensão aparece **ativada** em Configurações → Extensões. |
| A pesquisa dá erro dizendo que o portal pediu uma **"verificação de navegador"** | Não é um erro da extensão, nem falta de instalação correta: é o próprio site do TJRO recusando o acesso automático vindo da sua internet. Não adianta tentar de novo na hora — veja a explicação em ["Se a busca parar de funcionar"](#se-a-busca-parar-de-funcionar). |
| Não tenho o Claude Desktop, só uso pelo site (navegador) ou pelo celular | Essa pesquisa **não funciona** nesses casos — precisa ser o programa instalado no computador. Veja ["Onde funciona"](#onde-funciona). |
| Nenhuma linha acima resolveu | Peça ajuda a alguém com mais prática em informática do escritório, mostrando esta tabela — ou [abra uma issue](../../issues) aqui no GitHub descrevendo o que aconteceu. |

## Onde funciona

A extensão roda **no seu computador**: é ele que consulta o portal do TJRO. Por
isso ela só aparece onde o Claude também roda instalado na máquina.

| Onde | Funciona? |
|---|---|
| Claude Desktop, conversa normal | Sim |
| Claude Desktop, modo Cowork (inclusive tarefas agendadas) | Sim — o Cowork enxerga as extensões instaladas no Desktop |
| Claude Code | Sim, registrando o servidor manualmente (ver [Desenvolvimento](#desenvolvimento)) |
| claude.ai no navegador | **Não** |
| App do Claude no celular | **Não** |

**Por que não no navegador nem no celular:** ali o Claude só usa conectores
hospedados na internet, com endereço público. Para isso a extensão teria de rodar
num servidor central, e as buscas de todos os usuários sairiam do mesmo IP — o
bloqueio anti-automação do portal do TJRO derrubaria esse servidor em pouco tempo,
e contorná-lo seria burlar a proteção do tribunal. Rodar em cada computador, com
limite de ritmo próprio, é o que mantém a pesquisa estável e respeitosa com o portal.

Uma skill que você suba no claude.ai continua funcionando no navegador, mas **sem**
esta pesquisa: a jurisprudência do TJRO precisa ser buscada no Desktop (ou no Claude Code).

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
2. **Âncora pela citação.** Julgados do mesmo assunto costumam citar a mesma
   súmula, tema repetitivo ou IRDR, mesmo quando descrevem o fato com outras
   palavras. Um grupo como `["Súmula 385"]` acha esses julgados.
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

**Economize consultas: o limite do TJRO é de volume.** Num teste de 23/09/2026,
18 consultas espaçadas de 5 a 8 segundos foram bloqueadas em cerca de 3 minutos:
espaçar não basta, o que conta é quantas saem em poucos minutos, somando todas as
conversas abertas nesta máquina. Por isso: prefira 2 ou 3 buscas amplas (até 50
resultados cada) a várias pequenas; escolha pela ementa e pelo trecho que a busca
já mostra; e abra o inteiro teor só do que vai citar. **Inteiro teor já aberto nos
últimos 7 dias volta do disco, sem nova consulta** (a resposta avisa "Do cache
local"), então reabrir o mesmo acórdão não gasta nada.

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

São dois casos diferentes, e a mensagem de erro agora diz qual é.

**1. "Verificação de navegador" (desafio JavaScript).** O filtro de segurança do
portal (F5/TSPD) exige que o acesso execute um desafio em JavaScript, coisa que só
navegador faz. **Não é excesso de consultas: esperar não resolve**, e a extensão
não executa esse desafio nem contorna a proteção do tribunal. Isso varia por rede,
por provedor e pelo programa que faz o acesso — em 21/09/2026 um usuário em Sergipe
foi barrado já na primeira busca do dia, enquanto na máquina do autor, no mesmo dia,
a extensão consultava normalmente e só o `curl` era recusado. O que fazer:

- **teste em outra rede** (outro Wi-Fi, ou o celular como roteador);
- **use o portal no navegador** enquanto isso — ele continua aberto a qualquer um;
- **peça liberação ao tribunal**: `suporte@tjro.jus.br`, assunto "Acesso Bloqueado",
  citando o endpoint `juris-back.tjro.jus.br/search/varios_parametros/` e dizendo que
  é uso próprio, de baixo volume, sobre dado público.

Se acontecer com você, [abra uma issue](../../issues) dizendo o estado, o provedor
e a **versão instalada** (o `diagnostico_ritmo_tjro` mostra na primeira linha): é
assim que dá para saber o alcance real do filtro.

**⚠️ Situação em 22/09/2026: a extensão está sendo barrada pelo filtro do TJRO
para todos.** Chegaram relatos de bloqueio logo na 1ª busca (Sergipe e Rondônia),
e o diagnóstico inicial do autor foi que a causa estava na rede de quem relatou.
**Esse diagnóstico estava errado**: a comparação foi feita com um cliente diferente
do que a extensão usa. O teste controlado de 22/09 mostrou a causa real: o filtro
do portal recusa requisições que se identificam como ferramenta automatizada — e a
extensão, por princípio, se identifica honestamente. Com a identificação de
navegador, a mesma requisição passa. Ou seja: não adianta trocar de rede nem
esperar. **Decisão do autor:** a extensão continua se identificando honestamente — ela não
será disfarçada de navegador, nem como opção, porque isso seria contornar a
proteção do tribunal. O caminho escolhido é pedir ao TJRO a liberação formal do
acesso. Enquanto isso, a pesquisa pelo site (juris.tjro.jus.br) continua
funcionando normalmente no navegador.

**Desde a v1.7.10, a própria extensão reconhece essa situação e avisa em linguagem
simples.** Quando o portal bloqueia, a primeira linha da resposta diz que foi o
sistema anti-robô do tribunal, e não um erro de quem usa. Se o bloqueio se repete
com poucas pesquisas e sem nenhuma que tenha dado certo no meio (2 ou mais vezes em
24 horas, contando todas as conversas abertas no computador), a extensão conclui que
é sistemático e diz com clareza que esperar não resolve, indicando o site do
tribunal. Basta uma pesquisa dar certo, em qualquer conversa, para esse diagnóstico
se desfazer sozinho. Desde a v1.7.8, esses bloqueios não apertam
mais o limite de ritmo da ferramenta.

**2. Bloqueio por volume ("robotização").** O mesmo filtro bloqueia
temporariamente quando detecta muitas requisições em pouco tempo —
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
30 minutos); depois de 20 consultas seguidas sem bloqueio, ela afrouxa um degrau.
O espaçamento mínimo entre consultas (7 segundos) foi medido em 23/09/2026: 125
consultas em 16 minutos, a 6 s ou mais uma da outra, passaram sem bloqueio; a 5 s
o TJRO bloqueou. O que dispara o filtro é o pico curto, não o volume. Esse aprendizado fica salvo em `~/.tjro-jurisprudencia-mcp-estado.json`
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
- **Aviso de versão nova.** Ao subir, a extensão pergunta ao GitHub qual é a
  release mais recente. Se houver uma mais nova que a instalada, a primeira
  resposta da sessão termina com uma linha avisando, com o endereço da página
  de releases (fixo no código, nunca tirado da resposta do GitHub). Ela **não
  baixa nem instala nada** — atualizar continua sendo abrir o `.mcpb` novo e
  confirmar. O GitHub vê o IP de quem consulta, como em qualquer acesso a
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
