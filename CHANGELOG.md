# Changelog

Versões anteriores estão descritas nas mensagens de commit (`git log`).

## v1.37.0

Conferência dos 20 itens de 08/10/2026 e novas hipóteses, todas medidas às cegas com dois modelos (Sonnet e Opus).

- **Fatos do julgado:** quando o voto transcreve a ementa de outro processo, a ferramenta pegava o primeiro "caso em exame" (o do processo citado). Agora fica o último fora de transcrição, que é a ementa do próprio acórdão. Mudou o trecho de 498 de 2.382 acórdãos; numa amostra de 30, o trecho novo era o certo em 24, os dois serviam em 4 e o antigo nunca era melhor.
- **Relator vencido:** quando o fecho diz que o relator ficou vencido, o trecho de fatos avisa que o voto logo após o relatório é o vencido.
- **Mesmo tema:** o núcleo da ementa lia só os 15.000 primeiros caracteres e podia pegar a ementa citada; agora usa a ementa do próprio acórdão. Com isso, "resultado oposto" com semelhança de 0,25 ou mais tratou da mesma questão em 34 de 36 pares; a diferença veio de fatos diferentes em 32 de 36 e de mudança de entendimento em 2 de 36. A saída diz isso: é material de distinguishing, e overruling é exceção.
- **Distinguishing:** os termos dos seus fatos que o precedente não menciona saem como primeiro candidato a distinção (nos casos de teste, o fato que mudava a solução apareceu ali em 10 de 10).
- **Velocidade:** `distinguir_tjro` guarda o que calcula de cada recibo; da segunda chamada em diante cai de 0,8 s para 0,05 s.
- **`sugerir_termos`:** no acórdão do TJRO a ementa vem no fim, e o vocabulário saía do cabeçalho (gabinete, endereço, advogados, OAB) e do relatório. Agora lê a ementa do próprio acórdão, descarta fórmulas de redação e termos com algarismo, e mostra só pares de palavras (palavra solta era útil em 18 de 222). Na validação cega em 30 páginas novas, a parte útil subiu de 22% para 45%, com mais termos úteis no total (86 contra 75).
- **Cache em disco do `distinguir_tjro`:** o que se calcula por recibo (núcleo da ementa e citações, só tokens, nunca texto de decisão) fica num arquivo do cache, invalidado por versão e por hash do código. A conta da primeira chamada de cada sessão caiu de cerca de 2 s para 0,15 a 0,6 s; ler os recibos do disco (cerca de 2 s) continua igual, porque as outras ferramentas também usam.
- **`sugerir_termos`, segunda rodada:** lista de pares de ruído (institucionais e de fórmula) e de palavras de fórmula; em 40 páginas novas, 51% de termos úteis (121 de 239; 46% sem a lista). Os pares de forma acrescentados no fim não passaram por nova validação.
- **Overruling por estrutura (julgado posterior cita o anterior + resultado oposto):** testado às cegas em 72 pares: mudança de entendimento em 3 de 66, fato diferente em 59. Refutado como sinal; a saída diz isso.
- **Perfil do julgador (skill):** a seção 5 usa as mesmas funções e passou a mostrar os acertos novos.
- **`distinguir_tjro` em camadas (Destilar, do método CODE):** o resultado abre com um resumo de 5 linhas (tese, fatos, seus fatos × precedente, superação, leading case), cada uma literal ou contagem; conferido por programa: as 101 citações do resumo em 60 acórdãos aparecem inteiras no detalhe. Novo `formato: "ficha"` (Expressar): rascunho JSON da ficha de precedente (contrato do pesquisador-juridico) só com o que o texto do recibo permite ler; `link`, `sustenta`, `trecho` e `relator_para_acordao` ficam vazios (link nunca se fabrica) e `verificacao` sai "não conferido".
- **`buscar_recibos_tjro` com consulta em linguagem natural:** o E de todas as palavras deu zero nas 40 consultas de teste (relatos de fatos escritos por modelo). Agora, com 3 ou mais palavras e zero no E, devolve os recibos com MAIS delas, por ranking BM25 sobre a ementa com palavras e pares vizinhos, e avisa que mudou de modo: top 10 em 17 de 20 na amostra de escolha e em 16 de 20 na amostra nova (top 3: 12 de 20). Cortar a consulta nas palavras mais raras piorou (5 e 9 de 20), por isso não se corta.
- **Pesquisa de técnicas (web, 15/10/2026):** BM25 é linha de base forte em recuperação de casos (COLIEE), e a busca booleana sofre com vocabulário diferente (Blair e Maron, 1985: recall medido de cerca de 20% contra 75% estimado); extração de ratio é o rótulo mais difícil da literatura (F1 de 0,54 num corpus de 12 papéis); não achei artigo com acerto medido para classificar tratamento negativo de citação, só patentes de citadores. O Gemini respondeu sem pesquisar (estado 3) e suas referências não foram usadas.
- Testado e descartado: exigir que a palavra solta apareça duas vezes no voto (acerto igual, cerca de 80%, com 1, 2 ou 3+ ocorrências).

## v1.36.0 (15/10/2026): distinguishing, superação, natureza do julgado e leading case

- Distinção: o marcador tem de estar perto do precedente; súmula citada como fonte de que uma lei não se aplica conta como aplicação; tese da parte não conta. Validada às cegas em amostra nova: 20 de 28 (antes 18 de 29).
- Comparação de fatos medida às cegas (10 precedentes, 20 relatos hipotéticos): expressões 53 de 53 trataram do mesmo fato; palavras soltas, 61 de 75.
- Mudança de entendimento: 1 de 9 na amostra nova; "superada" passou a exigir entendimento, tese ou súmula como sujeito. Frase de overruling é rara nos acórdãos; o sinal mais útil continua sendo a seção 5 (julgados posteriores).

- `distinguir_tjro`, comparação de fatos: compara EXPRESSÕES dos seus fatos (palavras vizinhas, encadeadas numa linha quando caem na mesma frase), prefere a frase do voto e diz se ela vem do voto ou do relatório (alegação). Palavra solta só com 6+ letras e no voto: no teste ao vivo, "comum" e "banco" pescavam "prazo comum" e "FEBRABAN".
- Frase de "aplica precedente qualificado": acerto remedido às cegas em amostra nova (26 de 37). Exigir verbo de aplicação foi testado e descartado: as frases que ele cortava eram todas aplicação.
- Precedente qualificado (IRDR/IAC): a tese vem inteira, sem corte.
- Verbo no pretérito ("contratou") não casa mais com o substantivo ("contrato").

- **Nova ferramenta `distinguir_tjro`.** Para um julgado já lido nesta máquina, sem consultar o portal, ela monta uma ficha com sete partes:
  - **Natureza no art. 927 do CPC:** precedente qualificado (IRDR/IAC do TJRO com tese fixada), decisão do Pleno/Órgão Especial, jurisprudência persuasiva de câmara, monocrática ou 1º grau. Quando o acórdão aplica um tema ou súmula, aponta que o vinculante é o precedente, não o acórdão.
  - **Razão de decidir declarada:** tese e razões de decidir da ementa, mais o resultado, em texto literal.
  - **Fatos do precedente:** em texto literal.
  - **Seus fatos × o precedente:** com `fatos_do_caso`, cada termo dos seus fatos ao lado da frase do precedente que o menciona, ou listado como ausente. Os fatos não são gravados.
  - **Frases candidatas:** trechos em que o julgado aplica precedente, distingue, muda de entendimento ou ressalva posição pessoal.
  - **Sinais de superação em julgados posteriores:** os que citam o processo, os do mesmo tema com frase de mudança de entendimento e os do mesmo tema com resultado oposto.
  - **Leading case do tema:** IRDR/IAC com tese, precedentes qualificados mais invocados e julgados mais citados.
- **O que foi medido às cegas** (Sonnet e Opus, amostra nova):
  - **Frases candidatas:** ressalva pessoal acertou 7 de 7, distinção 18 de 29, aplicação de precedente 14 de 23 e mudança de entendimento 3 de 9. Como só a ressalva passa, as frases saem como candidatas, com o acerto ao lado, e nunca como rótulo.
  - **"Mesmo tema":** medido pelo núcleo da ementa. Com semelhança de 0,25 ou mais, era a mesma questão jurídica em 9 de 9 pares; entre 0,20 e 0,24, em 19 de 28. O sinal de resultado oposto exige 0,25.
- **Nada é decidido pela ferramenta.** Distinção, superação e leading case são conclusões do advogado. A situação de precedente qualificado se confere no BNP.
- **Base normativa conferida no Planalto:** arts. 927, 947, § 3º, 985, 986 e 489, § 1º, V e VI, do CPC.

## v1.35.0 (15/10/2026): correções vindas de uma jurimetria de honorários da 1ª Câmara Cível

- **README reescrito para advogados leigos.** Instalação em 4 passos curtos, com o passo 4 explicando a pergunta da primeira pesquisa (autorizar ou não que a extensão se apresente como navegador, com o risco dito claramente e como mudar depois). Tabela de problemas e seção "Onde funciona" encurtadas, e a seção "Se a busca parar de funcionar" sem detalhes técnicos.
- **Data da sessão ao lado da data do índice.** O fecho do acórdão ("Porto Velho, 28 de agosto de 2026") traz a data da sessão; o índice traz a data do documento no sistema, que é a usada pela citação padrão do TJRO. Nos 412 acórdãos do cache com data no fecho, 398 diferem, e em 397 o fecho vem antes (mediana de 6 dias). O inteiro teor e a busca mostram as duas lado a lado.
- **"RECURSO PROVIDO PARCIALMENTE" agora é parcialmente provido.** O rotulador só reconhecia a ordem "parcialmente provido"; a inversa saía como "provido". Nenhum rótulo dos 4.070 recibos mudou (os 26 que têm a forma inversa também têm a usual), mas a ementa nova que só tiver a inversa não é mais rotulada errado.
- **Julgamentos do mesmo número com resultados diferentes.** Quando dois julgamentos sob o mesmo número declaram provido, parcialmente provido ou desprovido diferentes, o aviso diz qual é qual, com id e data. Embargos rejeitados depois da apelação provida não disparam (é o normal).
- **Citação de VOTO ou EMENTA aponta o ACÓRDÃO.** A Citação do inteiro teor diz o tipo da peça e, se não for acórdão, o id do ACÓRDÃO do mesmo julgamento; na busca, a peça que não é acórdão aponta o acórdão do mesmo julgamento quando ele está na página.
- **Consulta pouco seletiva.** Com 1.000 documentos ou mais, a busca avisa que a página é só o topo da ordenação e sugere restringir por classe, assunto, resultado ou termo próprio antes de concluir algo sobre o conjunto.
- **Embargos acolhidos mostram a frase do dispositivo, sem rótulo.** Subtipo pedido (erro material, omissão, efeito infringente) medido às cegas em 40 acórdãos novos, com 2 rotuladores (concordância de 40/40 no vício e 32/40 no efeito): a regra acertou o vício declarado em 14 de 18 e o efeito em 12 de 32. Rótulo assim enganaria; o ED acolhido traz a frase literal que o acolhe.

- **Red-team antes de publicar (15/10/2026).** Quatro caçadores (Opus, Sonnet, Fable) e quatro verificadores de outro modelo revisaram a 1.34 e a 1.35; dos 26 achados, 24 foram confirmados e corrigidos:
  - **Citação do PJe com número antigo.** Também reconhece o número antigo do TJRO (".822.") e o número com espaço vindo do PDF. "Relator (a)", "Relatora" e "Relator para o Acórdão:" não abrem mais bloco de transcrição. Conferência cega e dupla dos trechos que mudaram de lado (60 trechos, Sonnet e Opus, concordância 59/60): 49 de 51 novas transcrições e 8 de 9 devoluções à voz do relator confirmadas.
  - **Resultados entre julgamentos.** Embargos saem da comparação de resultados (ED "parcialmente acolhido" não é apelação "parcialmente provida"). Embargos ACOLHIDOS ganham aviso próprio, porque podem ter mudado o resultado.
  - **Frase literal.** A frase literal (má-fé, embargos) não é mais cortada em "art." ou "Des.". A dos embargos prefere a do voto e tira a fórmula do fecho.
  - **Datas.** Data do fecho impossível ("31 de novembro") ou posterior ao índice gera aviso em vez de "use a do fecho". A busca da data no fecho foi ampliada para alcançar o dispositivo longo de IRDR. Data inválida no índice não derruba mais o espelho Python.
  - **Artigo trocado.** Só avisa quando um dos artigos não existe no diploma declarado (CPC até 1.072, CC até 2.046); pares legítimos como 1.012 e 1.021 do CPC não disparam mais.
  - **Reemissão.** A reemissão é comparada a partir da EMENTA ou do RELATÓRIO, sem o cabeçalho do PJe.
  - **Citação de sentença ou decisão.** A citação de SENTENÇA, DECISÃO ou DESPACHO não diz mais que "o acórdão não veio".
  - **Placar de ritmo.** O placar diz que conta só as consultas deste servidor.

## v1.34.0 (14/10/2026): correções vindas do relato de uso de uma pesquisa de litigância de má-fé

- **Falso alerta de TRANSCRIÇÃO corrigido.** O verificador marcava como transcrição a frase do próprio relator quando o voto citava uma ementa no formato do PJe, sem parênteses ("…Processo nº …, Relator(a) do Acórdão: … Data de julgamento: dd/mm/aaaa."). Duas causas: "Relator(a) do Acórdão:" abria bloco e essa citação não fechava bloco, então o bloco seguinte atravessava três parágrafos do relator. Nos 1.672 acórdãos dos recibos, 50 mudaram; a conferência cega e dupla dos 55 trechos que mudaram de lado confirmou 46 de 49 novas transcrições e 5 de 6 devoluções à voz do relator, sem erro confirmado pelos dois rotuladores (concordância 52/55).
- **Fecho do acórdão cortado agora aparece.** Quando o limite de tamanho corta o acórdão antes do "acordam os Magistrados", o fecho (câmara, votação, resultado) vem logo abaixo do aviso de corte, em trecho literal.
- **Reemissão do mesmo acórdão.** O PJe às vezes emite o mesmo acórdão duas vezes, com ids e datas diferentes, uma delas sem o voto. Antes saíam como "julgamentos distintos"; agora um aviso REEMISSÃO diz que é o mesmo julgamento (mesmo começo e mesmo fecho), aponta o id mais completo e manda conferir a publicação no PJe. Disparou em 1 de 383 processos do cache, justamente o do relato.
- **Artigo com algarismos trocados.** O inteiro teor avisa quando o texto cita dois artigos com os mesmos algarismos em outra ordem e sem diploma diferente (ex.: art. 1.103 e art. 1.013 do CPC), e diz quando o número não existe no CPC (acima do art. 1.072). Nos 3.754 recibos: 5 avisos, 4 erros reais de digitação e 1 par legítimo (por isso é "confira", não afirmação).
- **Julgado recente marcado na busca.** Decisão julgada há até 30 dias leva 🆕: pode ainda não ter sido publicada e cabe embargos.
- **Placar do limitador no fim da busca.** Quantas consultas ao portal esta máquina fez na janela atual e o nível do limitador, para o agente não estourar o próprio teto por frente sem saber.
- **Busca sobre má-fé mostra a frase, não um rótulo.** Pedido de rótulo "aplicada / afastada / só citada" medido às cegas (60 frases novas, 2 rotuladores, concordância 58/60): afastada 87%, aplicada 71%, pedido da parte 60%, só citada 50%. Rótulo assim enganaria; em busca que menciona má-fé, cada resultado traz a frase literal sobre litigância de má-fé mais próxima do fim do texto, e quem lê decide.

## v1.33.0 (14/10/2026): correções vindas do relato de uso de um caso real

Relato de uma sessão que fez jurimetria de um juiz e de um relator (120 consultas em 2 dias, 0 bloqueios abaixo de 7 s). Dos 10 achados, entram os que têm correção segura:

- **HTTP 500 em consulta grande.** O portal respondeu 500 em 18 de 19 falhas registradas, sempre com 2 ou mais grupos e 9 ou mais termos. Em teste controlado (três séries de consultas, sem pontuação especial, com frases e com até 18 termos simples) só uma consulta de 4 grupos de frases reproduziu o erro; o gatilho exato não está provado e não é só o número de termos. Quando ocorre, o erro diz o tamanho da consulta e manda reduzir para 2 grupos de poucos termos ou dividir em duas buscas, sem prometer limiar.
- **Vocabulário medido de ponta a ponta** (`sugerir_termos`, 10 tópicos, rotulagem cega e dupla de 400 julgados novos): os julgados trazidos pelos termos originais mais 3 sugeridos foram 92% pertinentes ao tema, contra 74% da página 2 da mesma busca; concordância dos rotuladores 195/200. Ajuda de forma mensurável, sem ser garantia: os termos sugeridos variam de qualidade e a amostra é pequena.
- **Resultado grande não é mais desviado para arquivo.** Acima de 80 mil caracteres a busca corta no limite de um resultado e avisa quantos cabem, com a instrução de usar `modo="compacto"` ou `por_pagina` menor. Antes o cliente salvava a saída num arquivo que o subagente de pesquisa não consegue abrir.
- **Cache do inteiro teor aproveitado.** Ler o processo com mais tipos (acórdão, ementa, relatório, voto) agora cobre o pedido de menos tipos (só acórdão): antes refazia a requisição à toa. Pedido de tipo que o cache não tem vai ao portal.
- **`resultado=` filtra sentenças.** `procedente`, `parcialmente_procedente`, `improcedente`, `extinto`, `homologado`, pelo desfecho lido do dispositivo. Faltava um jeito de separar as sentenças de um juiz por resultado.
- **A mensagem de escolha pendente manda o subagente devolver ao agente principal,** em vez de ficar parado sem interlocutor. A escolha continua sendo só do usuário.
- **Servidor Python:** o rótulo de versão do diário de erros ainda dizia 1.26 (era isso que aparecia misturado com a 1.32 no mesmo dia); agora acompanha a versão. Mesmas correções espelhadas no Python (cache 300 de 300 idêntico, corte de saída idêntico).
- **Modo `triagem` em `obter_inteiro_teor_tjro`** (`modo="triagem"`): leitura barata para decidir se vale ler uma decisão contrária por inteiro. Um bloco por julgamento: resultado declarado, peças com id e link, tese da ementa, fatos do julgado (trecho literal), fecho e precedentes qualificados citados, sem o texto das peças (cerca de 10 a 15% do tamanho). Para aspas continua valendo o modo completo ou `verificar_citacao_tjro`. Idêntico no Node e no Python em 483 processos do cache.
- **Alertas que dizem onde.** `VOTO DIVERGENTE` agora mostra como a parte divergente começa ("peço vênia ao Relator para divergir no sentido de…"); `OBITER DICTUM?` mostra a frase onde está a marca (ou diz que a marca está no começo do próprio trecho). Idênticos no Node e no Python em 160 conferências (8 de voto divergente, 23 de obiter).
- **Divergência antiga achada pela paridade (só no Python):** o corte da tese da ementa acima de 1.000 caracteres usava `rfind` sem a folga que o `lastIndexOf` do Node tem, e cortava uma palavra antes em 6 de 483 casos.
- 281 testes no Node.

## v1.32.0 (14/10/2026): vocabulário das ementas que casaram e "mais como este"

Resposta à pergunta "como achar o que o julgador escreveu com outras palavras?". O motor do TJRO casa palavras; pesquisa semântica por vetores não cabe (o índice é do tribunal e não aceita vetor, o corpus local é pequeno e exigiria baixar modelo). O que cabe, sem consulta extra e sem dependência:

- **`sugerir_termos=true` na busca** acrescenta, no fim, o vocabulário das ementas da página: **termos e pares característicos** (frequentes nos resultados e raros no corpus local de recibos), **variantes dos seus termos** com o radical para `termo*` ("desconto" → `descont*`), e, com `relator`, as **expressões que ele repete** (3 palavras em sequência). É realimentação por relevância feita no cliente: serve para montar a 2ª rodada em `grupos` (alternativas em OU) e `excluir`. Fora, por medição: nomes de quem assina, endereço do fórum e fórmulas de cabeçalho.
- **`similares_a` ganha "mais como este":** a nota lista os termos que distinguem o julgado-modelo do corpus local, para a 2ª rodada em `grupos` (antes só reordenava a página).
- **Medido às cegas** (2 rotuladores Sonnet, 40 páginas de resultados por rodada, cada termo ou par julgado "pertinente ao assunto / genérico / ruído"): na 1ª amostra, 59% de precisão e 16% de ruído; depois de tirar nomes, endereço e fórmulas e de encurtar a lista (8 termos, 5 pares), **na amostra inédita de validação: 65% de precisão (290 de 444 itens com consenso), 4% de ruído, 31% genéricos; 31 de 40 páginas com 3 termos pertinentes ou mais**. É sugestão, não conclusão: confira que a nova busca traz o assunto. Concordância entre rotuladores 86%.
- Paridade Node × Python: 80 de 80 páginas, byte a byte. 274 testes no Node, asserts espelhados no Python. Opt-in: sem `sugerir_termos`, a saída da busca não muda.
- Inclui tudo da v1.31.0 (recibo da busca, embargos parcialmente acolhidos, grafias de relator).

## v1.31.0 (14/10/2026): recibo a partir da busca, embargos parcialmente acolhidos e grafias de relator atualizadas

- **Recibo gravado pela própria busca (H01).** `buscar_jurisprudencia_tjro` e `linha_do_tempo_tjro` passam a guardar o texto dos documentos que trouxeram (marcado `origem: "busca"`; o texto é idêntico ao do inteiro teor: 1.224 de 1.224 ids em comum no cache de 14/10/2026). Reabrir um acórdão só para citá-lo deixa de gastar consulta. Três salvaguardas: a busca **nunca sobrescreve** recibo existente (o do inteiro teor vale mais, e o inteiro teor promove o de busca); acima de 300 MB os recibos de busca **mais antigos** saem (`TJRO_MCP_RECIBOS_BUSCA_MAX_MB`; nunca os de inteiro teor); e `verificar_citacao_tjro` por número do processo **não declara ausência** quando só há recibos de busca: se o trecho não está neles, lê o processo inteiro no portal ou manda chamar `obter_inteiro_teor_tjro` (a busca traz só os documentos que casaram). Por id, o recibo continua valendo como antes. Recibos idênticos em Node e Python (200 de 200).
- **Embargos de declaração parcialmente acolhidos.** "Embargos parcialmente acolhidos/providos" ou "acolhidos em parte" agora rotulam PARCIAL (antes: acolhido), com a regra de que o "parcial" tem de ser da oração dos embargos: "embargos acolhidos, para dar parcial provimento ao recurso" continua acolhimento integral. Medido às cegas (2 rotuladores, 50 itens inéditos, concordância 50 de 50): precisão do novo rótulo 22 de 22; um caso de embargos de partes diferentes com resultados opostos (um provido, outro desprovido) segue como acolhido, limite conhecido. Nas amostras de ajuste, 6 de 12 divergências viraram acerto (89,6% → 94,8%). Paridade Node × Python em 2.049 documentos.
- **Semente de grafias de relator** refeita sobre 10.476 acórdãos e ementas (antes 7.711): entra José Augusto Alves Martins (26 relatores com duas grafias ou mais).
- Testes: 269 no Node; asserts espelhados no Python. CI verde em Linux, macOS e Windows.

## v1.30.0 (13/10/2026): menos ruído na busca, resultado por julgamento mais correto e opção de identificação

Origem: pedido de "diminuir o ruído no uso da skill". Medido primeiro (678 buscas em cache, 458 inteiros teores), hipótese por hipótese, com leitores e rotuladores cegos em amostras novas. Zero requisição ao portal.

- **Alarme de "resultado oposto" quase todo falso.** Em 366 alarmes das 678 buscas, 84% envolviam RELATÓRIO (que narra a decisão recorrida e não tem dispositivo). Dois rotuladores cegos, 25 alarmes com RELATÓRIO: 25 de 25 "um dos documentos não declara resultado". Agora RELATÓRIO não entra na leitura de resultado (como SENTENÇA) e o par ACOLHIDO × REJEITADO só vale em embargos de declaração ("preliminar rejeitada" com mérito acolhido gerava 7 dos 10 falsos fora de RELATÓRIO). Alarmes: 366 → 48, em 68 → 10 respostas. Nos 25 sem RELATÓRIO o alarme acertava ~50% (12 reais, 10 "mesmo resultado", 2 "um não declara").
- **Rótulo do JULGAMENTO (resumo da página, filtro `resultado`, linha do tempo).** (a) Se algum documento traz o FECHO do acórdão com o resultado do mérito, só o fecho vale; voto, ementa e histórico sujavam o rótulo; "preliminar rejeitada/acolhida" sozinha no fecho não conta como resultado. (b) Embargos de declaração são reconhecidos pelo próprio texto (fecho ou ementa), não só pela classe do índice, que é a do processo principal. (c) "Embargos NÃO acolhidos" e a leitura do fecho passam a usar a última ocorrência do "acordam os Magistrados…", igual ao Python. Dos 9.947 julgamentos em cache, 56 mudam de rótulo (0,6%); dos 7.711 acórdãos, 34. **Medição cega (2 rotuladores, concordância 31/31 e 42/51, kappa 0,76):** nos julgamentos que mudam, a regra antiga acertava 0 de 31 e 4 de 23; a nova, 29 de 31 e 22 de 23; nos controles que não mudam, nada muda (15 de 19 nos dois). Atenção: a regra foi ajustada nessas duas amostras (a primeira rodada, validada na segunda, acertou 18 de 23 com 4 regressões, que motivaram a regra do fecho do mérito), então o número final é de ajuste, não de validação independente.
- **Rodapés e avisos mais curtos.** As notas fixas de panorama, fragmentos, "Nesta página", taxa de provimento e lista compacta ficaram mais curtas; o "Cita:" por resultado perdeu a explicação repetida; os avisos de 1º grau e Turma Recursal ficaram em uma frase; "mesmo número" lista os documentos agrupados por data de julgamento (relator uma vez só, quando único), e as linhas "mesmo número que…" ficaram menores; a linha TESE DA EMENTA não repete o que o trecho de 800 caracteres já mostra inteiro. Busca completa −3,3% de caracteres, compacta −6,6% (o rodapé era 27% do modo compacto). **Teste de leitura (4 leitores Sonnet, 12 páginas, 6 perguntas cada, resposta conferida nos dados):** versão antiga 72 de 72; nova 210 de 216 (97,2%). Os 6 erros vêm de um único item e de leitores que repetiram a resposta do documento anterior (o id citado nem existia na página), não de texto cortado: o leitor que leu o mesmo item em ordem inversa acertou. Não houve perda de informação medida.
- **Hipóteses testadas e descartadas por medida:** tirar o cabeçalho do tribunal do trecho (só 1,2% dos trechos, quase todos ACÓRDÃO, 0,9% dos caracteres); unir as linhas Processo/Relator/Órgão/Julgado em (ganho de ~2,5%, mas elas alimentam a leitura rápida e a citação); deduplicar FATOS e encurtar a custódia no inteiro teor (ganho ≤1%: o inteiro teor é 84% texto da peça e os avisos são 11%).
- **Nova opção, desligada por padrão: "Identificar-se como navegador (assumo o risco)"** (Configurações da extensão, ou `TJRO_MCP_IDENTIFICACAO=navegador`). Reverte a decisão de 22/09/2026 de nunca oferecer isso: por pedido do autor, quem decidir assumir o risco pode ligar. A extensão avisa de três jeitos: a mensagem de bloqueio apresenta a opção com o risco dito (disfarce, o tribunal pode restringir o acesso, o risco é de quem liga e de quem divide a rede); com a opção ligada, a primeira resposta da sessão lembra que ela está ativa; o `diagnostico_ritmo_tjro` mostra a identificação em uso. **Pergunta antes da primeira consulta:** sem a chave ligada e sem resposta anterior, nenhuma requisição sai; a mensagem manda o Claude perguntar ao usuário, explicando o risco, e a resposta é gravada pela nova ferramenta `configurar_identificacao_tjro` (arquivo próprio `~/.tjro-jurisprudencia-mcp-identificacao.json`, vale na hora e nas próximas sessões; "sim" liga o navegador, "não" mantém a identificação honesta e encerra a pergunta). Não muda ritmo, teto, espaçamento mínimo nem disjuntor, e não resolve a "verificação de navegador" (desafio JavaScript). A build pessoal passa a só ligar essa opção por padrão (antes trocava o texto do código).
- **Desfecho da SENTENÇA de 1º grau (procedente, parcialmente procedente, improcedente, extinta sem resolução do mérito, acordo/desistência homologados).** Lido só do dispositivo (última fórmula "ante o exposto…" com verbo decisório até a assinatura), aparece na linha de cada sentença da busca, como "(1º grau)" na lista compacta, num resumo próprio "Sentenças nesta página" (que sai da contagem de 2º grau, onde virava "sem resultado identificável") e como aviso no inteiro teor. **Diz o que foi decidido sobre o pedido, não quem ganhou** (em embargos à execução e impugnação, "procedente" favorece o devedor). Fica sem rótulo: decisão de embargos de declaração ou que corrige outra ("onde se lê"), processo penal ("procedente a pretensão punitiva" é condenação), homologação junto de outro desfecho (vários réus), âncora anterior que discorda ("parcialmente procedentes" e, adiante, "improcedente a reconvenção"), "extinta a execução" por pagamento (art. 924) e sentença sem dispositivo localizável (9%). **Medição cega (2 rotuladores, 80 decisões sorteadas por amostra simples, fora do conjunto de desenho):** 1ª amostra, regra inicial: precisão 40 de 54 (74%), com 10 dos 14 erros em ação penal e 3 por janela curta do rotulador; regra ajustada (penal, âncora anterior). 2ª amostra, inédita (kappa 0,97, concordância 78/80): **precisão 40 de 41 (98%)**, cobertura 41 de 55 sentenças com desfecho de mérito identificável (75%); o único erro (homologação de desistência de um réu junto de "improcedente" para outro) virou regra "sem rótulo" depois, então o 98% é anterior a esse ajuste. 24 de 80 decisões do índice são penais, 22% das cíveis são decisões de embargos de declaração ou integrativas. Python e Node idênticos nas 537 sentenças dos recibos.
- **CI em Windows, macOS e Linux** (antes só Linux). A extensão é distribuída para as três plataformas e o manifesto as declara; o que se testava só no Linux e no Mac do autor passa a rodar também no Windows.
- **Paridade:** ordem das quebras e do panorama em caso de empate agora é por ordem de código nos dois lados (o Node usava `localeCompare`, que põe "Á" antes de "F"); Node e Python idênticos em 1.946 de 1.946 saídas de busca (completa e compacta) e 458 de 458 inteiros teores.
- 265 testes no Node (5 de identificação, 3 de julgamento, 1 de lista "mesmo número", 2 de desfecho da sentença), asserts espelhados no Python.

## v1.29.0 (12/10/2026): seis hipóteses testadas (workflow de 29 agentes), cinco entraram

Origem: workflow agêntico (4 geradores Opus/Sonnet → fusão → verificador com busca na web → refutador Opus) sobre o dossiê da arquitetura: 41 hipóteses, 12 fundidas, 6 sobreviveram ao refutador. Tudo medido offline no cache local (zero requisição ao portal) e, onde há classificação, com gabarito cego e duplo em amostra inédita.

- **Inteiro teor sem repetição (H04).** EMENTA, RELATÓRIO e VOTO do mesmo julgamento vêm contidos letra a letra no ACÓRDÃO em 98,7% das peças; repetir o texto gastava o orçamento e cortava justamente o fecho do acórdão. A peça contida vira ponteiro ("texto idêntico a um trecho do ACÓRDÃO id N acima"), com cabeçalho, id, link e avisos próprios intactos; contenção exata (sem similaridade), só entre peças de mesma data, só quando o trecho cabe na parte exibida do acórdão (senão, ponteiro honesto "na parte não exibida acima" ou o corpo). Medido nas 433 leituras em cache: acórdãos truncados de 152 para 70, respostas que batem no limite de 34 para 4, caracteres −12,5%, zero id ou link perdido, zero aviso alterado, nenhum acórdão que saía inteiro passou a sair cortado, Python e Node idênticos em 433/433.
- **SENTENÇA nunca recebe rótulo de 2º grau (H02, parte a).** "Acolho o pedido", "rejeito a preliminar" e acórdão citado davam provido/acolhido/rejeitado em 38% das 537 sentenças dos recibos; agora sai "sem resultado identificável" (rótulo errado é pior que nenhum). O extrator de 1º grau (procedente/improcedente) fica para uma versão futura, com validação própria.
- **Resultado da EMENTA lido da seção IV (H05).** Na ementa do modelo CNJ sem fecho, o rótulo sai só da linha de resultado da seção IV ("Dispositivo e tese", antes de "Tese de julgamento"), marcado "(lido da seção IV da ementa)" na lista compacta; "embargos de declaração" é reconhecido no cabeçalho + seção I + linha de resultado (a classe do índice de ED é a do processo principal e enganava). Muda o rótulo em 152 de 1.750 ementas do cache (8,7%). **Validação cega (2 rotuladores Sonnet, amostra inédita de 40 ementas divergentes + 20 de controle, kappa 0,91):** nas divergentes a regra nova acerta 32 de 38 (antiga: 5 de 38), rótulo emitido errado 5 (antiga: 19); no controle 17 de 18 (1 regressão: apelação cuja seção I narra embargos). Dos 6 erros, 4 são "embargos parcialmente acolhidos", que o esquema de rótulos não distingue de "acolhidos". A primeira amostra (40+20), usada para ajustar a regra, fechou em 35 de 40 e 19 de 19; não é número de validação. Também no ACÓRDÃO: "embargos NÃO acolhidos" vira rejeitado (antes: acolhido); 31 acórdãos do cache mudam, rotulados às cegas: 29 certos, 2 errados (antes: 0 certos). Uma regra testada e descartada: "acolhidos explícito descarta o desprovido" — no fecho do acórdão, 21 de 21 casos eram ambíguos de verdade (dois embargos com destinos opostos).
- **TESE DA EMENTA na busca (H06).** Hit do tipo EMENTA, modo completo, ganha a linha literal "TESE DA EMENTA (literal; tese enunciada pelo órgão, não prova de ratio)": o trecho depois de "Tese(s) de julgamento" na seção IV, do texto integral do hit (nunca do fragmento destacado), teto de 1.000 caracteres cortando em item inteiro com "⚠️ TESE INCOMPLETA: N de M itens". Antes, a tese aparecia no trecho de 800 caracteres em só ~8% das ementas. Cobertura: 79,4% das 1.750 ementas do cache; 4,5% incompletas; 0 fora da seção IV; Python e Node idênticos em 1.750/1.750. **Validação cega (50 ementas inéditas, 2 rotuladores):** 49 "tese inteira", 1 "parcial com aviso correto", 0 vazamento, concordância 50/50. Não sai em ACÓRDÃO (o rótulo repete em 33% deles, muitas vezes de outro julgado transcrito) nem no modo compacto.
- **Relator em duas grafias (H07).** O índice guarda o mesmo desembargador em "Title Case" (2016–2021) e "CAIXA ALTA" (recentes): 25 de 68 relatores em 7.711 acórdãos. A quebra por relator passa a unir as grafias ("[grafias unidas: 2]", grafia mais frequente como rótulo; desempate por ordem de código, igual nos dois lados) — em 51 das 373 páginas com quebra: 10 relatores deixam de aparecer duplicados, 27 linhas que sumiam abaixo do mínimo aparecem, 38 contagens sobem para o valor real; soma por relator conservada em 373/373. Com `relator=` (busca e linha do tempo), quando a grafia pedida tem outra conhecida (semente pública de grafias + recibos locais), a resposta avisa qual, com anos e quantidade vistos, e manda repetir com a outra grafia (uma requisição a mais, pelo ritmo). Sem aviso, a troca de grafia simulava queda no ano da mudança.
- **Dois bugs antigos de paridade corrigidos de passagem:** no Python, `_RE_ACORDAM` era definida duas vezes e a segunda sobrescrevia a da custódia, apagando a "voz da casa" em acórdãos com "acordam os Desembargadores" (17 de 433 leituras divergiam do Node); no Node, o orçamento do inteiro teor contava emoji dos avisos como 2 caracteres e deslocava o corte das peças em relação ao Python. Agora 433/433 idênticos.
- Refutadas pelo próprio workflow, com medida: colapsar documentos do mesmo julgamento num cartão (ganho de 4–6% de tokens, sem ganho de correção); ficha pré-preenchida pelo servidor (o lint da peticao-rg já barra os erros); cache de busca com subsunção de página (1,8% das requisições); rodapé de procedência/orçamento; teto de caracteres na busca (o modo compacto já resolve); rigor estatístico no harness (só Wilson vale a pena). Adiadas, não refutadas: gravar recibo a partir da própria busca (ganho real de 5–15% das requisições, com três condições de segurança no verificador) e o desfecho de 1º grau na sentença.
- 10 testes novos no Node (255), asserts espelhados no selftest Python; módulo novo `server/relatores.js`.

## v1.28.0 (12/10/2026): relatório de bloqueios do portal

- **Livro-razão de requisições** (`~/.tjro-jurisprudencia-ritmo.jsonl`, modo 600, últimas 3.000; Node e Python escrevem no mesmo arquivo e formato): cada requisição ao portal anota instante, origem (node/py, pid), identificação, operação (busca/inteiro_teor) e desfecho (ok, bloqueio, desafio, corrompida, http, rede). **Nunca guarda texto de busca, parte, relator nem número de processo.** Sob o test runner o livro-razão fica desligado, para teste nunca gravar no arquivo real.
- **Cada incidente de bloqueio agora leva o contexto do gatilho:** intervalo desde a requisição anterior, quantas consultas em 30 s / 60 s / 5 min / 24 h, quantos processos usavam o portal ao mesmo tempo, as 12 requisições anteriores (segundos antes, origem, desfecho) e a resposta do portal (status, tipo, servidor, retry-after, tamanho e assinatura de 80 caracteres da página de bloqueio).
- **`diagnostico_ritmo_tjro(relatorio=true)`**: taxa de bloqueio por faixa de intervalo (< 5 s, 5–6, 6–7, 7–10, 10–30, ≥ 30 s), maior rajada em 60 s sem bloqueio, veredito de cada incidente (abaixo do espaçamento mínimo, rajada, vários processos, pouco tráfego = gatilho fora do ritmo, verificação de navegador) e recomendação baseada nos dados. **Nenhum parâmetro é alterado automaticamente**: com menos de 100 requisições registradas o relatório manda manter o ritmo atual. Por que existe: em 12/10/2026 uma sonda a 4,3 s de intervalo levou bloqueio na 6ª consulta, coerente com a calibração de 23/09 (5 s bloqueia, 7 s é o mínimo), mas esse tipo de conclusão precisa de dados contínuos, não de sonda.
- Python e Node produzem texto idêntico para o mesmo livro-razão; 9 testes novos (inclui fim a fim: `post()` com bloqueio falso grava o livro-razão sem texto de busca e o incidente leva a sequência e a resposta do portal).

## v1.27.1 (12/10/2026): o trecho da busca mostra o termo que casou

- Em `buscar_jurisprudencia_tjro` o trecho exibido era os primeiros 800 caracteres do fragmento destacado pelo portal (que tem até 3.000). Medido em 15.089 resultados do cache local: em **7,1% (1.070)** nenhum termo destacado aparecia no trecho, porque o primeiro «termo» ficava depois do caractere 800. Agora, quando o primeiro termo cai fora da janela, o trecho é recentrado 200 caracteres antes dele (começa em fronteira de palavra, marcado com "…"). Resultado: termo visível em **100%** (antes 92,9%), nenhum trecho passa de 801 caracteres. Python e Node idênticos (300/300 pares); 2 testes novos. Métrica objetiva (presença do termo), então sem rotulagem.

## v1.27.0 (11/10/2026): FATOS DO JULGADO também na SENTENÇA

- `obter_inteiro_teor_tjro` de SENTENÇA passa a trazer a linha 📌 FATOS DO JULGADO com o **relatório da sentença** literal (título "RELATÓRIO"/"I – Relatório" até "É o relatório", "Decido", "FUNDAMENTAÇÃO" ou o dispositivo; teto de 2000 caracteres, corte declarado). Validação cega independente (2 rotuladores Sonnet, 15 sentenças de vara cível, amostra nova): 14 de 15 "é o relatório inteiro", 0 vazamentos de fundamentação.
- Sentença de Juizado (art. 38 da Lei 9.099, relatório dispensado) ou sem relatório formal: a linha só APONTA que a narrativa está no início do texto e não transcreve. Motivo medido: o corte automático dessa narrativa saiu completo em 10 de 25 e vazou fundamentação em 3 de 25 na mesma validação, então transcrever enganaria.
- Texto indexado que já começa na análise (sem narrativa) não ganha a linha.
- Python e Node idênticos nas 99 sentenças de teste; 3 testes novos.

## v1.26.2 (11/10/2026): aviso de alegação com mais cobertura

- O aviso "alegação da parte" passa a reconhecer o gênero (apelado, agravada), a ordem inversa ("sustenta a autora"), "alegava", "alegando/sustentando/afirmando", "alegação", "narra", "defende" e "insurge". Fora ficaram "pleiteia/pleiteando" (pedido da parte, não fato contestável) e "alegado" solto, que geravam falso aviso. Em 95 trechos com consenso de dois rotuladores cegos (50 alegações reais): 40 marcados, 0 falsos, 10 perdidos (cobertura 80%, contra 58% da v1.26.1). A regra final foi ajustada olhando os falsos avisos da mesma amostra, então o número é indicativo, não validação independente. **Reconferido em amostra aleatória simples e inédita (12/10/2026, 60 trechos, 2 rotuladores cegos; os rotuladores divergiram em 11 de 60, o conceito é elástico):** prevalência de alegação 27% (consenso) a 45% (qualquer rotulador); com consenso, precisão 87% (13 de 15 marcados; IC 95% 62–96%) e cobertura 81% (13 de 16; IC 57–93%); com o critério frouxo, precisão 100% e cobertura 56%. Estimador de captura-recaptura (Chapman) deu cobertura ≈ 81%, coerente. Leia 'sem falso aviso' e '80%' como o melhor cenário, não como garantia.

## v1.26.1 (11/10/2026): FATOS DO JULGADO mais limpo e com aviso de alegação

- Resíduo de Word colado no começo do relatório ("15.00 800x600 Normal 0 21 false false false PT-BR X-NONE X-NONE MicrosoftInternetExplorer4") deixa de entrar no trecho literal de fatos.
- Quando o trecho de fatos traz uma parte como sujeito de "sustenta/alega/afirma/aduz", a linha ganha o aviso de que aquilo é alegação da parte, não fato reconhecido pelo julgado (achado da conferência humana de 10/10/2026: a ficha tratava como fato o que o agravante sustentou). Sinaliza cerca de 19% dos trechos em 278 acórdãos de amostra. Python e Node idênticos; 2 testes novos.

## v1.26.0 (10/10/2026): diário de erros e `diagnostico_erros_tjro`

- **Diário local de erros** (`~/.tjro-jurisprudencia-erros.jsonl`, 500 linhas, modo 600): toda falha de QUALQUER ferramenta (exceção, `isError`, HTTP 4xx/5xx, timeout, bloqueio, rede, `[PESQUISA NÃO REALIZADA]`/`[PESQUISA INCOMPLETA]`) é anotada com data, versão, sistema, ferramenta, tipo, HTTP, duração, estado do limitador e os PARÂMETROS descritos sem conteúdo (presença/tamanho; valor só de enumerações). **Nunca grava texto de busca, grupos, nome de relator/parte nem número de processo**; a mensagem é sanitizada. O registro nunca quebra a ferramenta. `limite_de_ritmo` não é anotado (é esperado). Python e Node escrevem no mesmo arquivo e formato.
- **`diagnostico_erros_tjro`** (`dias`, `limite`, `relatorio`): resume o diário por tipo e ferramenta, com causa provável, o que fazer e QUEM corrige (usuário, portal ou autor); com `relatorio=true` devolve relatório técnico sanitizado, pronto para issue ou para entregar ao desenvolvedor. Não consulta o portal.
- A mensagem de erro agora avisa que o erro foi anotado e aponta a ferramenta. Testes novos (privacidade, resumo, wrapper); selftest do Python cobre o diário.

## v1.25.0 (09/10/2026): `linha_do_tempo_tjro` e `julgados_que_citam_tjro`

- **`linha_do_tempo_tjro`**: o resultado declarado (provido / parcial / desprovido / acolhido / rejeitado) dos acórdãos de uma tese, ano a ano, com uma consulta por ano (até 9) e amostra dos acórdãos mais recentes de cada ano; contagem por julgamento (nº + data). É amostra, e mudança de proporção é sinal para ler, nunca prova de superação. Espera o limitador de ritmo só em rajada curta (até 75 s); bloqueio do tribunal ou espera longa devolve `[PESQUISA INCOMPLETA]` na hora (nunca "zero", nunca trava a ferramenta por minutos).
- **`julgados_que_citam_tjro`**: acórdãos que citam um julgado pelo número CNJ, com o trecho em volta e um sinal lexical FRACO de afastamento. Leitura assistida. **Não detecta superação:** em 486 citações reais, medidas às cegas por dois rotuladores (478/486 concordantes), 51% seguem o citado, 44% só mencionam, 3% o afastam e nenhuma o declarou superado; o sinal de afastamento acertou 8 de 13 e pegou 8 de 16. Um detector de superação foi tentado e descartado por falta de casos para validar.
- Python e Node em paridade (sinal de afastamento idêntico nas 486 janelas); testes novos.

## v1.24.0 (09/10/2026): votação do fecho no inteiro teor

- `obter_inteiro_teor_tjro` mostra, em cada ACÓRDÃO, a linha "🗳️ Votação no fecho" (unânime / por maioria / voto divergente prevaleceu / com declaração de voto), a mesma função da lista da busca (medida às cegas, ~99%), com o aviso de que ela não diz quem foi vencido. Python e Node em paridade; teste novo.

## v1.23.0 (08/10/2026): votação também na linha da ementa; corte da proclamação corrigido

- A linha da EMENTA na lista da busca passa a mostrar a votação do ACÓRDÃO do mesmo julgamento na página ("por maioria, do acórdão do mesmo julgamento"), pela mesma regra do órgão do fecho: casa por nº do processo + data; sem data não se presume; votações divergentes no mesmo julgamento: não arrisca.
- Corrigido o ponto de parada da proclamação: um nome de cidade no meio dela ("MUNICÍPIO DE PORTO VELHO, POR UNANIMIDADE") cortava o texto antes de "por unanimidade". Agora só vale como assinatura quando vem com a data ("Porto Velho, 29 de…"). Reconferido nas duas amostras cegas: votação 184/184, divergente prevalecente 172/173. Python e Node em paridade (2.139 textos, 0 diferenças).
- Medição cega nova de FATOS DO JULGADO em 24 acórdãos julgados POR MAIORIA (dois rotuladores, 74 fatos): 72/74 concordantes, nenhuma ficha invertida ou com omissão material; 2 fatos parciais nos dois rotuladores. Amostra pequena; não autoriza percentual para peça.

## v1.22.0 (08/10/2026): votação do fecho na lista da busca

- Na lista da busca (modo compacto e completo), cada ACÓRDÃO passa a mostrar a votação declarada na proclamação do fecho: "unânime", "por maioria", "por maioria, voto divergente prevaleceu" e, quando o fecho cita, "com declaração de voto". Serve para ver de relance se o resultado é voto do relator ou de divergente, sem abrir o inteiro teor. Lê só a proclamação (depois de "em," / "a seguinte decisão:" / "taquigráficas," até a assinatura); não diz quem foi vencido e fica em branco quando não reconhece (ementa não tem fecho).
- Medido às cegas (dois rotuladores, 193 fechos em duas amostras; a 1ª serviu de ajuste, a 2ª de validação): votação 183/183, divergente prevalecente 171/172, declaração de voto afirmada 27/27. A validação 2 achou um defeito de corte (o nome "JUIZ …" do voto divergente cortava a proclamação) e foi corrigido. Limite: a ausência de "com declaração de voto" não prova que não houve (omitiu 7 de 72 na 1ª passagem), e em 9 de 193 fechos a função não reconheceu a proclamação. Python e Node em paridade (2.095 textos, 0 diferenças).

## v1.21.1 (08/10/2026): descrição do filtro relator

- A descrição de `relator` na ferramenta passa a dizer que, com tipo=["SENTENÇA"], filtra o nome do juiz (v1.21), e avisa que o relator do índice pode ser o relator para o acórdão ou outro nome no fecho, então o papel do magistrado se confere no fecho. Só texto; sem mudança de comportamento.

## v1.21.0 (08/10/2026): relator= funciona em SENTENÇA (nome do juiz)

- Com tipo=["SENTENÇA"], o filtro `relator` passa a casar o NOME DO JUIZ (campo ds_nome.raw do índice; nas sentenças nome_relator_* vêm vazios e o filtro devolvia sempre zero). Medido ao vivo: "DENISE PIPINO FIGUEIREDO" + cartão consignado/RMC = 164 sentenças, todas dela. Com outros tipos ou tipos misturados, nada muda. Serve para ler como um juiz decide um assunto (e comparar com o que ele decide hoje como relator, se subiu a desembargador). Grafia exata, como no índice; é amostra do índice, não o universo.

## v1.20.2 (08/10/2026): FATOS DO JULGADO avisa quando o trecho é o relatório

- Medição cega em 30 acórdãos longos (2 rotuladores, 115 fatos): 113/115 de concordância, 3 fatos parciais. Achado: em um agravo regimental, o trecho do RELATÓRIO narrava as alegações do agravante e a ficha feita só dele inverteu o resultado (os dois rotuladores marcaram). A linha "FATOS DO JULGADO" passa a dizer, quando o trecho vem do relatório, que ele narra o pedido e as alegações, não o fundamento nem o resultado, e manda conferir o voto e o fecho. Python e Node em paridade.

## v1.20.1 (08/10/2026): OBITER DICTUM? em sentença

- "Registre-se, por oportuno" e "registre-se, de passagem" deixam de disparar OBITER DICTUM? quando o julgado é SENTENÇA: ali é fórmula de cartório (medido: 2 disparos indevidos em sentenças típicas). Em acórdão a marca continua como antes. Python e Node em paridade.

## v1.20.0 (08/10/2026): fatos do julgado, em trecho literal

- `obter_inteiro_teor_tjro` passa a trazer, em cada ementa, acórdão ou relatório, a linha "📌 FATOS DO JULGADO" com o trecho LITERAL em que o próprio julgado resume os fatos: a seção "I. CASO EM EXAME" da ementa do CNJ ou, sem ela, o RELATÓRIO até o VOTO (até 1.200 caracteres, com "[…]" quando corta). Não resume nem reescreve: serve de âncora para o campo `fatos_relevantes` da ficha de precedente e para o distinguishing no mapa de caso. Sem seção reconhecível, não emite nada. Em 707 peças dos recibos locais emitiu em 630 (89%); paridade Python×Node: 707 peças, 0 diferenças. Cobertura medida; a fidelidade do trecho ainda não passou por gabarito cego.

## v1.19.0 (08/10/2026): posição na SENTENÇA de 1º grau

- **POSIÇÃO NO JULGADO também para sentenças.** `verificar_citacao_tjro` em documento do tipo SENTENÇA diz se a frase está no cabeçalho (autuação, partes, advogados), no relatório, na fundamentação, no dispositivo ou na assinatura/expedientes. Antes devolvia vazio. Como o texto da sentença vem numa linha só, o localizador se guia por marcas no meio do texto ("Vistos", "Dispensado o relatório", "É o relatório", "Fundamento e decido", "Ante o exposto, julgo…", a data por extenso da assinatura). Medido às cegas (dois rotuladores, 60/60 concordes) em 60 trechos de 100 sentenças que não entraram no ajuste: **89% ponderado pela população, 56 de 60 sem ponderar**; erros nas fronteiras (relatório que termina antes de "É o relatório", cláusula "SERVE A PRESENTE" colada ao arquivamento). Nas rodadas de ajuste (sentenças que usei para acertar as marcas) deu 81% e 92%.
- Sentença continua não sendo precedente (o aviso já existia). Avisos de atribuição em sentenças, medidos às cegas em 136 trechos de sentenças comuns: TRANSCRIÇÃO 87% de precisão, ALEGAÇÃO DA PARTE 88%, NEGAÇÃO forte 69%; o conjunto ENTRE ASPAS + TRANSCRIÇÃO + ALEGAÇÃO acusa voz alheia com 88% de precisão e 77% de cobertura. Limite conhecido: ementa colada DEPOIS da citação ("(Processo n…, TJ/RO) DIREITO DO CONSUMIDOR…") e decisão do STJ colada sem aspas não são reconhecidas como transcrição.
- Paridade Python×Node: custódia, 74.298 casos, 0 divergentes; posição em sentença, 11.191 casos em 300 sentenças, 0 divergentes.

## v1.18.0 (07/10/2026): negação em dois níveis

- NEGAÇÃO em dois níveis. Continua "NEGAÇÃO:" quando a negação está colada ao trecho (até uma palavra antes) ou é existencial ("não há/houve/existe …", até cinco palavras). O resto que a regra anterior pegava sai como "NEGAÇÃO (distante)?", dizendo que em geral ela fecha a própria oração e não inverte o recorte. Gabarito cego e duplo em 120 trechos NOVOS de cinco tribunais (TJRO, TJSE, STJ, TCE-RO e TED-OAB; concordância 108/120, 12 adjudicados pela definição escrita), ponderado pela população: o alerta forte acerta 80% (falso alarme 6%); a regra anterior, sozinha, acertava 50% (falso alarme 33%) nesta amostra. Somados, os dois níveis avisam nos mesmos 72% das negações reais; o forte sozinho pega 53%.
- Paridade Python×Node da custódia: 55.936 casos, 0 divergentes.

## v1.17.0 (06/10/2026): negação mais estreita e uma marca nova de obiter

- NEGAÇÃO mais estreita: só avisa com a negação até 6 palavras antes do trecho; não avisa quando ela nega um particípio ("não utilizado pelo…") ou recusa uma alternativa ("…, e não sobre…"); "não é outro o entendimento", "não se desconhece" e "não se pode deixar de" afirmam. Gabarito cego e duplo: ajuste em 617 trechos já rotulados (TJSE, STJ, TRT14, OAB, TCE-RO), validação em 120 trechos NOVOS de cinco tribunais (concordância 114/120, 6 adjudicados): precisão 38% → 44%, falso alarme 42% → 31%, cobertura 100% → 98%. Continua o alerta mais fraco do bloco: é aviso para ler a frase, não veredito.
- OBITER DICTUM? reconhece também "registre-se, por oportuno", "a título de registro" e "apenas para registro" (6 de 6 obiter às cegas). Outras marcas testadas ficaram de fora por imprecisas: "de passagem" 67%, "por cautela" 25%, "ainda que se entenda/admita" 30%.
- Paridade Python×Node da custódia: 53.373 casos, 0 divergentes.

## v1.16.0 (06/10/2026): obiter no recibo, POSIÇÃO medida às cegas, harmonização com os irmãos

- **O recibo leva `trechos_obiter`** (custódia v4): cada frase do voto sob marca de obiter, da marca ao fim da frase, fora de
  transcrição e de aspas. O lint da `peticao-rg` avisa quando a ficha cita uma delas, e avisa mais duro se a ficha diz
  `ratio_ou_dictum: "ratio"`. Os recibos antigos são recalculados sozinhos ao iniciar (sem rede).
- **POSIÇÃO NO JULGADO medida às cegas pela primeira vez** (dois rotuladores, kappa 0,96-0,97): **94% numa validação de 72
  trechos novos, sorteados depois dos ajustes** (90% na amostra de ajuste, antes deles); o único erro sistemático da validação
  (a parte final da ementa avançando sobre o "ACÓRDÃO Vistos…") foi corrigido depois dela, então o número dela não o inclui. Ajustes vindos da medição: seções da
  ementa em caixa mista ("IV. Dispositivo e tese") ou sem número romano no início da linha; ementa da casa escrita "Ementa :"
  e "É como voto" sem ponto (a custódia achava que o voto ia até o fecho); acórdão sem cabeçalho RELATÓRIO; ementa sem rótulo
  logo depois do voto; o fecho começa no "ACÓRDÃO Vistos…", não no "acordam"; "Resumo em linguagem simples" é parte final.
  Nenhum número do gabarito cego dos alertas mudou.
- **"Ainda que assim não fosse" não é NEGAÇÃO** do que vem depois: o "não" é da marca de obiter (achado no porte à OAB).
- Mesma regra em todos os verificadores com MCP próprio (TJRO, STJ, TJSE, TRF1/TNU, TRT14, TCE-RO, OAB), `atribuicao13.js`
  idêntico entre os Node. Python espelhado: paridade 50.464 casos, 0 divergentes.

## v1.15.1 (06/10/2026): obiter mais estreito, "sem razão" nega

Correções depois de levar o OBITER DICTUM? aos irmãos (STJ, TRT14, TJSE, TRF1) e medi-lo lá às cegas:

- **"De todo modo" / "de toda forma" / "de qualquer forma/modo" e "em caráter subsidiário" saíram das marcas de obiter.**
  No TJRO abriam obiter 4 vezes em 5; no TRT14, fundamento principal 4 vezes em 5 ("em caráter subsidiário" é a
  responsabilidade subsidiária do tomador). Combinado, cara ou coroa — e aviso que erra metade das vezes faz mal. Ficam só
  as marcas contrafactuais ("ainda que assim não fosse", "mesmo que se admitisse", "ainda que superada", "a título de
  argumentação", "apenas para argumentar"…). No gabarito cego do TJRO: precisão 86% (igual), cobertura 12% → 8%.
- **OBITER não dispara em frase que já está ENTRE ASPAS**: ali a marca é de quem o tribunal cita, não do tribunal.
- **"Sem razão" conta como operador de NEGAÇÃO** ("sem razão o apelante ao dizer que X" inverte X). No gabarito cego do TJRO
  nada mudou (68/75/7); veio do selftest do TJSE.

## v1.15.0 (06/10/2026): onde a frase está no julgado, e se é obiter

Pergunta do autor: valeria uma ferramenta de distinguishing, ratio decidendi e obiter dictum? Distinguishing não cabe no
servidor (exige os fatos do caso, que ele nunca vê — mora no `mapa-de-caso`). Ratio × dictum cabe como LOCALIZADOR, não
como juiz:

- **Nota POSIÇÃO NO JULGADO** em `verificar_citacao_tjro`: seção da ementa do CNJ em que o trecho está (I. caso em exame
  = resumo, II. questão em discussão = a pergunta, III. razões de decidir = candidato a ratio, IV. dispositivo e tese,
  lista de dispositivos/jurisprudência citados), ou, no corpo, cabeçalho / RELATÓRIO / fundamentação do voto do relator
  (com a distância até o dispositivo e a fórmula que o abre) / DISPOSITIVO do voto / depois do voto do relator (vogal,
  voto-vista) / fecho. Ementa no modelo antigo é dita como tal. É a evidência para o campo `ratio_ou_dictum` da ficha;
  decidir continua sendo de quem lê. Dois terços dos acórdãos locais já vêm no modelo seccionado do CNJ.
- **Alerta OBITER DICTUM?**: marca de raciocínio contrafactual ou fundamento alternativo na MESMA frase do trecho
  ("ainda que assim não fosse", "mesmo que se admitisse", "ainda que superada a preliminar", "a título de argumentação",
  "apenas para argumentar", "de todo modo"…). Medido em gabarito CEGO e DUPLO novo (`harness/gold-obiter.local.json`,
  114 janelas, dois rotuladores, kappa 0,92): **precisão 86%** nas duas metades, cobertura ~12% — a maior parte do obiter
  real não tem marca nenhuma, e o alerta não promete achá-lo; promete não gritar à toa (falso alarme 0% nas janelas com
  pista genérica). Concessiva no presente ("ainda que se admita X, …") foi EXCLUÍDA depois da medição: os rotuladores a
  leram como o tribunal enfrentando X (precisão subia de 70% para 86%). "Em tese" e "não é o caso dos autos" ficam de fora
  por desenho (o primeiro é "em abstrato"; o segundo fecha a regra que o voto acabou de aplicar).
- **`buscar_recibos_tjro` ganha `relator`**: o que esta máquina já leu de um desembargador ou juiz, sem rede. A linha
  dele no acervo continua sendo `buscar_jurisprudencia_tjro(relator=…)`, com o teto de leitura da jurimetria dirigida.

Python espelhado (paridade 50.463 casos, 0 divergentes); 216 testes Node. Nada mudou nos outros avisos.

## v1.14.0 (06/10/2026): o que os irmãos ensinaram volta para casa

Três regras achadas no porte das heurísticas ao STJ e ao TRT14 (05-06/10/2026), remedidas no gabarito cego do TJRO
(`harness/medir-verificador.mjs`, sem rede) — nada piorou:

- **ENTRE ASPAS**: aspas curvas e retas numa pilha só (o acórdão abre com uma e fecha com a outra); a reta é abertura ou
  fechamento pelo vizinho, não por alternância, e uma reta solta (`12" de tela`) deixa de embaralhar o resto do documento;
  « » contam. Disparos em janelas da voz do tribunal: 4,0% → 3,3%; "transcrição ou aspas" na validação cega: 82% → 92%.
- **NEGAÇÃO**: "não havendo/há/resta dúvida de que…" afirma, não nega.
- **ALEGAÇÃO DA PARTE**: "ao contrário do que sustenta o apelante, …" é o tribunal refutando, não relatando.
- **VOTO DIVERGENTE**: só com a MAIORIA do trecho dentro da faixa (trecho que só encosta na fronteira "…é como voto.
  DECLARAÇÃO DE VOTO…" não é o vencido), e o alerta já traz a proclamação do fecho («RECURSO PROVIDO NOS TERMOS DO VOTO
  DIVERGENTE…, VENCIDO O RELATOR»), para o agente ler quem venceu sem reabrir o acórdão. Precisão cega: 74% → 77% (validação
  62% → 67%). O que resta de erro é acórdão em que o relator foi vencido só em parte (preliminar unânime, mérito por
  maioria) ou com questão de ordem — regra nenhuma resolve, e por isso o alerta mostra o fecho.
- **`buscar_recibos_tjro`** ganha `nr_processo` (prefixo de dígitos basta) e `id_documento`: reencontra um acórdão já lido
  com ou sem termos, e diz se um id já passou por esta máquina.
- **`buscar_jurisprudencia_tjro`** com `orgao_colegiado` = "1ª Câmara Cível" ou "2ª Câmara Cível" avisa que os julgados
  dessa câmara cujo relator foi para a 3ª ficam fora da página, e sugere buscar pelo relator.

Python (`servidor_tjro.py`) espelhado: paridade de custódia 50.463 casos, 0 divergentes.

## v1.13.4 (06/10/2026): diagnóstico fala com a identificação certa

O diagnóstico de ritmo dizia a TODA instalação que "o filtro do TJRO está recusando as consultas desta extensão em si" e
mandava pesquisar pelo site. Isso vale para a identificação honesta (a extensão pública). Com a identificação de navegador o
texto agora diz para esperar a pausa e retomar com uma busca só, e aponta as causas prováveis de bloqueio com pouco tráfego.

## v1.13.3 (06/10/2026): por que o cadastro mostra a 3ª Câmara Cível

O cadastro do portal não "erra" a câmara: mostra a câmara ATUAL do processo. Com a criação da 3ª Câmara Cível, relatores
da 1ª e da 2ª foram realocados para ela e levaram, preventos, os processos que relatavam — daí acórdãos julgados pela 1ª ou
pela 2ª aparecerem cadastrados na 3ª (15 de 24 na amostra de 14/09/2026). A regra não muda (cita-se pela câmara do fecho,
quem julgou); mudam as explicações nas descrições das ferramentas e nos avisos. Para a linha de um desembargador, buscar
pelo relator rende mais que filtrar pela câmara. Informação do autor (06/10/2026).

## v1.13.2 (06/10/2026): marcador de espera nunca passa do teto de 1 h

O teste "arquivo ilegível ou valores absurdos" falhou de forma intermitente na publicação da 1.13.1: o saneamento do estado
usa o próprio relógio, que pode estar 1 ms à frente do `agora` da reserva, e o marcador saía `[espera_segundos=3601]` com a
pausa já limitada a 1 h. O marcador agora é limitado ao teto. Nenhuma mudança de regra; a 1.13.1 funciona igual.

## v1.13.1 (05/10/2026): "é" não é a conjunção "e" na NEGAÇÃO

O porte das regras para o MCP do TRT14 achou, no selftest de lá, um defeito que já existia aqui: a regra que tira do alcance
da negação o trecho que começa pela conjunção "e" também tirava o trecho que começa pelo verbo "é", porque o `norm1` dobra os
dois para "e". "NÃO é devido o adicional", citado como "é devido o adicional…", passava sem aviso de NEGAÇÃO. Agora a regra
olha o caractere original. Números do gabarito cego inalterados (NEGAÇÃO 68% de precisão, 75% de cobertura, 7% de alarme
falso: o caso não aparecia na amostra). Teste novo em `test/verificar.test.js` e no selftest do Python; paridade de custódia
50.463 casos, 0 divergentes.

## v1.13.0 (05/10/2026): a custódia medida às cegas, transcrição anunciada e aspas no recibo

**Por quê.** Os números de TRANSCRIÇÃO e VOTO DIVERGENTE (97% e 100% de detecção) vinham de 53 trechos rotulados em
23/09 por quem desenhou a custódia, e não mediam alarme falso. São os dois avisos que o lint da peça usa. Repetido o
método cego e duplo da 1.12.0 (mais 370 trechos: 130 de transcrição em três estratos, 80 de divergência, 160 de
alegação; kappa 0,94, 1,00 e 0,93; 11 divergências adjudicadas lendo o documento inteiro):

| Aviso (ponderado) | 1.12.0 às cegas | 1.13.0 na validação | 1.13.0 no total |
|---|---|---|---|
| TRANSCRIÇÃO × qualquer transcrição | 82% · 79% · 8% (com aspas) | 92% · 83% · 3% | 91% · 84% · 4% |
| VOTO DIVERGENTE | 43% · 89% · 23% | 62% · 100% · 10% | 74% · 89% · 6% |
| ALEGAÇÃO DA PARTE (160 trechos novos) | 66% · 81% · 10% | 96% · 73% · 1% | 90% · 84% · 2% |
| ALEGAÇÃO DA PARTE (120 trechos da 1.12.0) | 69% · 76% · 8% | 64% · 75% · 11% | 71% · 82% · 8% |

(precisão · cobertura · falso alarme; validação de 65, 40, 80 e 60 trechos: ordem de grandeza.)

**O que mudou (custódia v3; os recibos são refeitos sozinhos ao iniciar).**
- **VOTO DIVERGENTE.** Fecho que proclama unanimidade e não fala em maioria nem em vencido = ninguém ficou vencido
  (10 dos 12 alarmes falsos do ajuste eram voto-vista que acompanha, "divirjo" superado no debate ou menção a voto
  divergente de outro processo). Em ACÓRDÃO sem maioria no fecho, só marcas em 1ª pessoa contam ("peço vênia para
  divergir", "divirjo"); substantivos ("voto divergente", "voto-vista") deixam de bastar.
- **Transcrição anunciada.** "cuja parte dispositiva transcrevo:", "nos seguintes termos:", ou dois-pontos seguidos de
  "[...]"/"(...)": o bloco copiado (sentença, decisão recorrida, acórdão embargado) é marcado até o texto voltar a
  falar como 2º grau (apelante, embargante, "a sentença", "É o relatório", cabeçalho VOTO). Sem retorno identificado,
  não marca nada. O cabeçalho da peça ("Classe: … Polo Ativo: …") deixa de abrir transcrição.
- **ALEGAÇÃO DA PARTE por frase.** O verbo de relato precisa estar na frase que contém o grosso do trecho (antes dele
  ou na cabeça dele). Não contam: verbo negado, impessoal ("reitera-se"), concessiva em que o trecho é a oração
  principal, adversativa entre o verbo e o trecho, atribuição explícita dentro do trecho. Passam a contar: sujeito
  depois do verbo ("Alega o agravante que"), "Diz que" abrindo frase, "Contrarrazões …, pugnando".
- **Aspas no recibo.** `trechos_entre_aspas` leva ao recibo as citações longas entre aspas do corpo do voto (fora de
  transcrição, fora de tese fixada pelo tribunal); o lint da `peticao-rg` passa a AVISAR quando o trecho da ficha
  está dentro de uma delas. O pareamento de aspas foi para `custodia.js`.

Paridade Node × Python: 50.463 casos, 0 divergentes. 209 testes no Node.

**Irmãos.** O mesmo método aplicado aos avisos do STJ (162 trechos) e do TRT14 (130), sem tocar em nenhum tribunal,
mostra precisão bem menor lá (por exemplo, ENTRE ASPAS 41% e 48%; NEGAÇÃO entre 11% e 67% conforme o rotulador;
FALA DE TERCEIRO do TRT14 1 em 8). O material fica fora deste repositório; as regras desta versão são candidatas a
porte para aqueles servidores.

## v1.12.0 (05/10/2026): os três avisos de atribuição remedidos às cegas, e uma correção de números

**Correção.** Os números que a 1.11.0 publicou para ALEGAÇÃO DA PARTE (precisão de 81%, falso alarme de 10%) foram
medidos num gabarito rotulado pelo próprio autor da regra, depois de desenhá-la. Num gabarito **cego e duplo** (dois
rotuladores independentes, sem ver o estrato nem a decisão do verificador; kappa 0,96 em alegação, 0,93 em negação e
1,00 em aspas; 5 divergências em 260 adjudicadas pelo autor), a 1.11.0 tinha 56% de precisão em alegação. Os números
abaixo substituem os anteriores.

**Gabarito.** 260 janelas de 12 palavras de acórdãos e votos reais, sorteadas em dois estratos por aviso: onde ele
dispara e onde fica calado com o gatilho por perto (verbo de relato, negação, aspas). As métricas são ponderadas pela
população de cada estrato. Metade dos itens serviu ao ajuste; a outra metade só foi olhada depois, uma vez, como
validação. O arquivo traz trechos com nomes de parte e fica fora do git (`harness/*.local.json`); o sorteio
(`harness/amostrar-alertas.mjs`), a consolidação (`harness/consolidar-rotulos.py`) e a medida
(`harness/medir-verificador.mjs`) estão no repositório.

**O que mudou.**
- **NEGAÇÃO por alcance.** Antes, qualquer "inexistente", "negativo", "vedada" ou "improcedente" nos 60 caracteres
  anteriores disparava, e também a negação que só alcançava a primeira palavra do trecho. Agora conta só operador de
  negação ou rejeição (não, jamais, nem, "não há que se falar", afasta-se, rejeito, julgou improcedente…), sem quebra
  de oração até o trecho, alcançando ao menos 3 palavras dele.
- **ENTRE ASPAS por pareamento.** Antes contava aspas numa janela de 1.200 caracteres, e uma aspa fora da janela
  invertia a conta. Agora pareia as aspas no documento inteiro (pilha para as curvas, que se aninham; a reta alterna;
  apóstrofo não abre citação) e avisa quando a maioria do trecho está dentro de citação. Tese fixada entre aspas segue
  sendo palavra do tribunal.
- **ALEGAÇÃO DA PARTE**: marcas impessoais do tribunal ("tem-se que", "verifica-se", "trata-se", "não há dúvida"…),
  "Estado"/"recurso" deixam de valer como sujeito de parte, "diz" sai dos verbos de relato, e o relato só se estende
  por 1 frase depois do verbo (era 2).

| Aviso (ponderado) | 1.11.0: precisão · cobertura · falso alarme | 1.12.0 na VALIDAÇÃO | 1.12.0 no total |
|---|---|---|---|
| ALEGAÇÃO DA PARTE | 56% · 79% · 15% | 62% · 70% · 11% | 69% · 76% · 8% |
| NEGAÇÃO | 35% · 70% · 26% | 67% · 71% · 11% | 68% · 75% · 7% |
| ENTRE ASPAS | 57% · 36% · 10% | 100% · 100% · 0% | 97% · 72% · 1% |

A validação tem 60, 40 e 30 itens: ordem de grandeza, não casa decimal. Paridade Node × Python: 50.440 casos, 0
divergentes. 202 testes no Node.

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
