# Changelog

Versões anteriores estão descritas nas mensagens de commit (`git log`).

## v1.11.0 (02/10/2026): pausa por identificação, recibos que se atualizam sozinhos, alerta de alegação medido

Três melhorias que saíram de uma sessão de teste (a pública e a build pessoal convivem no mesmo computador).

**1. Pausa do disjuntor por identificação.** O filtro do TJRO recusa a identificação honesta da extensão pública, não o
volume. Esse bloqueio armava a pausa que a build pessoal (identificação de navegador) também respeitava: um teste da
pública parou a pessoal por ~20 minutos. Agora `bloqueadoAte`, `backoffMs` e `ultimoSucessoEm` são de cada
identificação (`porIdentidade` no arquivo de estado, versão 3); a janela de volume, o espaçamento e a escada continuam
somados, porque o IP é o mesmo. Cada incidente leva a etiqueta da identificação; o bloqueio sistemático só conta os da
própria identificação; o diagnóstico mostra a identificação da instalação e avisa se a outra está em pausa. Arquivo
antigo migra sozinho (pausa em curso vale para as duas). O Python tem estado próprio e identificação única: não muda.

**2. Recibo carimbado e recálculo automático.** O recibo leva `custodia_v` (a versão da heurística de custódia, hoje 2).
Ao iniciar, o servidor refaz em segundo plano, sem rede, os recibos com carimbo diferente ou ausente (só os campos de
custódia; atômico; não sobrescreve recibo que mudou no meio). Antes, depois de cada correção como a da 1.10.1, os
recibos já gravados ficavam com o resultado antigo até alguém rodar o recálculo à mão, e o lint lia o campo gravado
enquanto o verificador recalculava na hora. Um teste fixa o hash da saída da custódia por versão: mudou a heurística
sem subir `CUSTODIA_VERSAO`, o teste falha.

**3. ALEGAÇÃO DA PARTE medida e refeita.** Gabarito rotulado à mão (90 janelas de 12 palavras; o arquivo fica fora do
git por trazer nomes de parte): o alerta herdado do TRF1 tinha 33% de precisão e 58-64% de falso alarme, porque um
"afirmar" ou "requerida" nos 400 caracteres anteriores bastava. Agora é estrutural: verbo de relato conjugado com
sujeito de parte (ou no início de frase, quando o relatório não repete o sujeito), trecho a até 350 caracteres e 2
frases do verbo, sem marca de voz do tribunal no meio; "a alegação"/"o argumento" (substantivo) não conta.

| Gabarito de ALEGAÇÃO DA PARTE | ajuste (60) | validação (30, separada antes do ajuste) |
|---|---|---|
| precisão: antes → depois | 33% → 81% | 45% → 75% |
| cobertura: antes → depois | 72% → 94% | 82% → 55% |
| falso alarme sobre o tribunal: antes → depois | 64% → 10% | 58% → 11% |

A cobertura da validação caiu (n=11): o alerta ficou mais calado. É aviso consultivo (o lint da peça não dispara por
ele), e o preço de avisar em toda frase era não informar nada. `harness/medir-verificador.mjs` mede os três blocos.
Paridade Node × Python: 25.003 casos, 0 divergentes.

## v1.10.1 (30/09/2026): dois falsos positivos da custódia

**Problema.** No recibo do acórdão de embargos de declaração da Apelação Cível 7001808-38.2024.8.22.0018, a
heurística de TRANSCRIÇÃO gravou um único bloco de 8.327 caracteres, do meio do relatório até a lista de
precedentes no fim do voto, e engolia a fundamentação própria da relatora. `verificar_citacao_tjro` e o lint da
peça acusavam "não é palavra do TJRO" para frase que é do tribunal.

**Causa.** O relatório cita "(ID 1, Relatório ID 2, Voto ID 3, Ementa ID 4)". O marcador de abertura de bloco
"ementa" seguido de palavra casava com "Ementa ID …". A única atribuição do voto era a lista de precedentes que a
própria relatora arrola no fim (vários julgados num parêntese), e o bloco ligou as duas pontas.

**O que mudou.** (1) "Ementa ID nnn" deixa de abrir bloco transcrito. (2) Parêntese com 2+ julgados indicados
("Rel." duas vezes e ";") é lista de precedentes do relator: só o parêntese é marcado, não a frase que o antecede.
Medido nos 636 recibos reais: só 2 mudam (o reportado e o voto irmão); o gabarito rotulado à mão fica idêntico.
`harness/regravar-recibos.mjs --recalcular [--gravar]` refaz a custódia dos recibos já gravados com a lógica
atual (só os campos que `camposAlheios` produz). Porte idêntico no servidor Python.

## v1.10.0 (29/09/2026): verificar antes das aspas, recibos locais e custódia visível

**Problema.** Dos MCPs de jurisprudência do escritório (TRF1, TRT14, TCE-RO, STJ, TJSE, OAB), só o do TJRO,
o mais usado, não tinha um verificador de citação: o agente descobria que a frase entre aspas era ementa do
STJ copiada no voto, ou o voto vencido, só no lint da peça, depois da ficha e da minuta prontas. A custódia
(v1.7.16) existia, mas só no recibo, que ninguém lê na hora. E o servidor Python pessoal, o caminho do
`pesquisador-juridico`, nunca recebeu o porte da custódia: 228 dos 616 recibos desta máquina estavam sem os
campos, e o lint "se comportava como antes" com eles.

**O que mudou.**

- **`verificar_citacao_tjro(trecho, id_documento | nr_processo)`**: literalidade por palavra inteira,
  tolerante a caixa, acento e pontuação; mínimo de 4 palavras; `[...]` separa fragmentos em ordem, a até
  1.500 caracteres. Lê o recibo local primeiro (zero requisição); sem recibo, busca o inteiro teor pelo
  número e grava. ✅ pode vir com ALERTA DE ATRIBUIÇÃO: TRANSCRIÇÃO, VOTO DIVERGENTE, ENTRE ASPAS,
  ALEGAÇÃO DA PARTE, NEGAÇÃO — e uma nota VOZ DA CASA quando o trecho está na ementa/fecho do próprio
  acórdão. Mesma heurística do recibo que o lint da `peticao-rg` lê.
- **`buscar_recibos_tjro(consulta | grupos, limite)`**: busca local nos documentos já lidos, sem rede
  (palavra inteira, `*` de prefixo, frase, sinônimos), com id, número, câmara do fecho, trecho em volta e
  estado da custódia. Zero aqui nunca é "não localizado".
- **Linha de custódia no inteiro teor** de ACÓRDÃO e VOTO: quantos trechos são de outros julgados (e a fatia
  do voto), onde começa o voto que pode ser o vencido, onde começa a voz da casa.
- **Recibo** ganha `classe`, `relator_indice` e `orgao_indice` (do índice, para a busca local listar sem
  reabrir o texto). Recibos antigos continuam válidos; `harness/regravar-recibos.mjs --gravar` acrescenta a
  custódia aos que não têm.
- **Python** ganha o porte inteiro (custódia, recibos, verificador). Paridade Node × Python medida em
  `harness/custodia/paridade_custodia.py`: 619 documentos (todos os recibos reais + fixtures), 4.780 casos,
  0 divergentes.


## v1.7.16 (23/09/2026): o recibo diz o que NÃO é palavra do TJRO

**Problema.** O recibo gravava só o `texto` do documento. O lint de citações da peça conferia se o trecho
estava no inteiro teor, mas não se era palavra do TJRO. O voto transcreve ementas inteiras de outros julgados
(STJ, TJMG, e o próprio TJRO em outro processo), e o documento ACÓRDÃO traz também os votos dos vogais. Um
trecho copiado de lá passava aprovado. É o mesmo caso que o CHANGELOG do TJSE registra (fecho do TJCE
transcrito no voto). Dos MCPs de jurisprudência do escritório, só o do TJRO ainda não tinha essa proteção.

**O que mudou.** O recibo agora traz, no dialeto do TJSE e do TRF1 que o lint já lê:

- `trechos_transcritos` (lista): blocos que o documento transcreve de outro julgado, da abertura
  ("Nesse sentido:", "A propósito:", ": APELAÇÃO CÍVEL. …") até a atribuição que os fecha ("(APELAÇÃO CÍVEL,
  Processo nº …, Relator(a) do Acórdão: …)", "(TJ-MG - AC: …)", "(REsp n. …, Rel. Min. …, julgado em …)");
- `trecho_divergente` (string): o voto que pode ser o **vencido**. Se o fecho diz "vencido o relator" /
  "nos termos do voto divergente" / "lavrará o acórdão", esse voto é o **do relator**. Isso aconteceu em 3 dos 5
  acórdãos por maioria dos recibos medidos. Nos outros casos, é o voto do vogal que diverge;
- `texto_voz_propria` (só no documento ACÓRDÃO): a ementa da casa e o fecho. O lint absolve o trecho que está
  ali, mesmo que o voto tenha transcrito um precedente com a mesma frase (as câmaras reutilizam ementas-modelo).

Os trechos são recortados **em bruto** do próprio `texto` (lição L1 do red team do lint do TJSE). O documento
EMENTA nunca recebe marcação: ele é a voz da casa. O VOTO VENCEDOR não recebe `trecho_divergente`.

**Âncoras refeitas para o TJRO.** As do TJSE não são portáveis: lá o voto só começa depois do fecho ("acordam …
Estado de Sergipe"). No PJe do TJRO, o documento ACÓRDÃO vem na ordem relatório → voto → votos dos vogais →
ementa da casa → fecho. A cauda (ementa + fecho) é localizada e excluída das marcações. A normalização é
caractere a caractere (mesmo comprimento do bruto), por isso não precisa da reconstrução aproximada de
posição que o TJSE usa.

**Medição** (`harness/medir-custodia.mjs`, offline, sobre os 397 recibos que já estavam em disco, nenhuma
requisição ao portal). O gabarito foi rotulado à mão (`harness/gold-custodia.json`). A amostra de ajuste
(semente 7, 30 janelas) serviu para calibrar as âncoras. A de validação (semente 11, 14 janelas) foi
rotulada **depois** do ajuste e não foi usada para calibrar.

| Medida | Ajuste | Validação |
|---|---|---|
| Detecção de transcrição | 95,8 % (23/24) | 100 % (10/10) |
| Detecção de voto divergente/vencido | 100 % (4/4) | 100 % (1/1) |
| Falso alarme em frase do relator | 8,3 % (1/12) | 0 % (0/2) |

Falso alarme sobre a **ementa da casa**: cada frase (≥ 6 palavras) de cada documento EMENTA foi conferida,
como o lint faz, contra os documentos do mesmo processo que a contêm literalmente.

| Documento citado na ficha | Frases acusadas |
|---|---|
| ACÓRDÃO | 0,8 % (11/1.439) |
| EMENTA / RELATÓRIO | 0 % (0/65; 0/13) |
| VOTO | 58,8 % (50/85): **correto** nesse documento. Conferidos à mão: são frases que a ementa copiou do precedente que o voto transcreve. Dentro do VOTO, a frase é transcrição. Cite pelo id do ACÓRDÃO ou da EMENTA |

Nas 8 marcações de divergência em documentos ACÓRDÃO, todos os fechos são "por maioria" ou "com
declaração de voto". Nenhum acórdão unânime foi marcado, e nenhum fecho por maioria ficou sem marcação.

**Limites conhecidos.**

- O documento VOTO avulso não tem fecho. Se o relator foi vencido, o recibo do VOTO dele não sabe disso.
  Nesse caso, confira pelo ACÓRDÃO.
- Transcrição sem nenhuma abertura, cujo texto traz uma marca de voz do relator ("in casu"), perde o início
  do bloco. Esse é o único item perdido do gabarito.
- O lint compara por janelas de 6 palavras. Uma frase do relator que repete 6 palavras seguidas de uma
  ementa transcrita ao lado ("a certidão de trânsito em julgado") é avisada. O único falso alarme do gabarito
  é esse, e vem do comparador do lint, não da faixa marcada.
- "Declaração de voto convergente" também entra em `trecho_divergente`. O aviso ("pode ser o voto vencido")
  exagera, mas a cautela vale: declaração de voto não é a razão de decidir do órgão.

**Recibos antigos.** Continuam valendo como antes, sem os campos novos. `node harness/regravar-recibos.mjs
--gravar` acrescenta os campos offline, a partir do `texto` que já está no arquivo.

**Testes.** `test/custodia.test.js` usa fixtures de recibos reais anonimizados (`test/fixtures/`, gerados por
`harness/_anonimizar.mjs` e conferidos à mão). `test/lint.test.js` roda o lint de citações da peça contra
recibos gravados por `recibo()`. Ele mostra: o aviso de TRANSCRIÇÃO numa citação do TJRO cujo trecho cai na
faixa transcrita; o mesmo texto passando calado no recibo antigo; o aviso de VENCIDO no voto do relator
vencido; a tese da ementa da casa sem aviso; e o `--selftest` do lint passando. Sem o lint na máquina, esse
arquivo é pulado.
