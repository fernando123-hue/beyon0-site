# O orçamento vira a conversa com o Zero: especificação

> Data: 2026-11-13, **revisão 3**. As revisões 1 e 2 passaram pelo arquiteto e pelo revisor de segurança independentes, que conferiram contra o código; os achados estão aplicados (Anexos A e B). A revisão 3 acrescenta os pedidos do dono do mesmo dia: estruturas variadas no mapa (seção 7), mesmo ramo com desenho diferente (seção 9) e o JEV acompanhando (seção 8B).
> Autor: agente (sessão planta-espetaculo, a pedido da sessão principal). Ramo `zero-fluxo` (de `origin/main` = `31dcbab`).
> Só documentação. O código vem em PRs pequenos, um por vez (seção 10).
> Marcas: **[D]** = decisão do dono (registrada em `01 Empresa/Decisões.md`, no cofre, não neste repositório); **[A]** = decisão do agente, o dono pode mudar.

## 0. O que o dono decidiu

| Ponto | Quem | O quê |
|---|---|---|
| Perguntas e formulário | [D] 13/11 | "eu quero que isso seja excluído ou fique já integrado ao Zero (considerando a segurança dos dados do cliente). Quero algo mais intuitivo e fluido possivel, sem criar um pingo de resistência". A página abre direto na conversa; as perguntas do começo e o formulário final dos três modelos viram toques dentro do chat; o consentimento continua explícito; nenhum dado novo |
| Preço | [D] 13/11, opção A | O radar primeiro preenche o que entra (páginas, prazo, integrações); o VALOR só aparece depois que o Zero entende o caso e mostra o que o site vai fazer pela pessoa. O topo deixa de prometer "veja o preço na hora" |
| Planta | [D] 13/11 | "você enxerga aquilo sendo algo unico e específico para cada cliente e intuitivo de se ver e entender só de passar os olhos?" e "não vamos nos prender nesse padrão de cards certo? Também poderão vir outras estruturas animadas que representem essa situação? Cada atendimento de fato ser unico para cada cliente?" Referência: o vídeo de 04/11 (cenário do caso com "o que trava" e "onde quer chegar", mapa de nós com setas rotuladas, "Montei o mapa do seu caso. Ficou certo?" com nó novo "Ajustado"; análise no cofre, `01 Empresa/Referências/`). E: "para áreas iguais, o atendimento também será unico para cada um usuário?" Sim, pelo que cada pessoa conta, nunca sorteado |
| `BZ_PLANTA` | [D] | Segue desligada em produção até o dono ver o teste com a IA de verdade (seção 9) |

Como é hoje:

- **As perguntas.** `#o-perguntas` tem 3 telas: ramo + cidade, objetivos, site + logo. O botão "Ver o preço" nasce a sessão (Turnstile), chama `simular` e mostra o valor na hora.
- **A conversa.** Fica atrás de "Prefere conversar? Fale com o Zero", um botão que aparece já antes do preço quando há consultor (`js/orcamento.js:49-62`).
- **O formulário de detalhes** abre sozinho com qualquer estimativa salva (`js/orcamento-detalhes.js:125-139`), venha ela do Zero ou do "Quero os três modelos".
- **O radar** mostra o valor assim que existe simulação ou estimativa (`js/orcamento-escopo-estado.js:195-214`).
- **A planta** só é pedida no turno depois da primeira estimativa (`api/_vendas/consultor.mjs:311`, `planta.mjs:147`, `agente.mjs:152`). Ela é sempre uma de 3 topologias de 8 ou 9 caixas iguais (`js/orcamento-planta-forma.js:28`).

Regras permanentes que valem aqui:

- celular primeiro (390 e 320 px);
- sem blur, brilho suave ou "tubo" de linhas;
- nada de tela de carregamento: a página em si se move;
- otimizar nunca tira movimento aprovado;
- CSP sem inline;
- voz humana em todo texto de cliente;
- zero dado inventado;
- o Zero nunca nega ser IA, e a etiqueta "assistente virtual (IA)" fica fixa;
- os módulos da planta continuam em ES5 sintático.

## 1. O fluxo novo, do jeito que a pessoa vê (celular 390)

A página abre com um título curto, uma linha e a caixa da conversa à vista. Não há tela de perguntas nem botão "Prefere conversar?".

O radar fica abaixo da caixa no celular e ao lado no computador, como hoje. Cada passo é uma fala do Zero com opções para tocar, e a resposta tocada vira a bolha da pessoa. Ela pode sempre escrever em vez de tocar.

| # | O Zero diz (rascunho; a versão final passa por voz-humana e por revisor) | A pessoa | O que vai ao servidor |
|---|---|---|---|
| 1 | "Oi, eu sou o Zero, a IA da Beyon Zero. Vou entender o seu negócio e desenhar o site que trabalha por você. Que tipo de negócio é o seu?" | Toca um dos 8 ramos de hoje (com os exemplos) ou "Outro", que abre uma escrita de 60 caracteres. | Nada ainda. O 1º toque nasce a sessão (Turnstile invisível) e chama `simular` para o radar. |
| 2 | "E o que o site precisa trazer para você?" | Toca um ou mais objetivos de hoje e "Pronto", ou "Não sei, escolha por mim". | `simular` (radar) |
| 3 | "Duas coisas práticas: já tem site ou endereço próprio?" e "Logo e textos?" | Toques (as opções de hoje), ou "Não sei". | `simular` (radar) |
| 4 | "Agora me conta como os clientes chegam até você hoje e o que mais dá trabalho no dia a dia." | Escreve. Embaixo, 4 a 6 sugestões do ramo para tocar ("Pelo Instagram", "Indicação", "Me chamam no WhatsApp", "Respondo preço e horário na mão"…), que se somam ao texto. | **1º turno da IA:** `mensagem` com o texto e as `respostas` dos passos 1 a 4 (seção 6.1) |
| 5 | Se o caso ainda não está entendido (a dor ficou vaga), a IA responde em 1 ou 2 frases e faz **no máximo 1 pergunta** (cidade, detalhe do serviço). | Escreve ou toca. | `mensagem` |
| 6 | **O turno do valor** (seção 2): o Zero mostra o que o site vai fazer por ela, com a fala nas palavras dela e, com a flag, **o mapa do caso** (seção 7). | Lê; pode tocar "Está certo" ou "Quero ajustar algo". | O mesmo turno grava o mapa e a estimativa |
| 7 | **O valor aparece** no radar e numa frase do Zero (seção 2), seguido de "Quer ver três modelos do seu site? Você só paga se escolher um." | "Quero os três modelos", "Mudar o que eu respondi" ou continua conversando. | |
| 8 | **O pedido vira conversa** (seção 5). | Escreve e toca. | Só no aceite: `detalhes`, o endpoint de hoje |
| 9 | "Pedido recebido" com o código, como hoje. | | |

Decisões [A]:

- **Os passos 1, 2 e 3 são toques instantâneos, sem IA.** As listas e os códigos são os de hoje (`api/_classificador/contrato.mjs:12-15`).
  - Os toques **não viram mensagens**. Vão ao servidor junto com a primeira mensagem de texto (passo 4) e entram no briefing antes do turno, sob a mesma trava da IA, então não há escrita concorrente.
  - **O cliente guarda os toques até o turno entrar.** Num 503, 429 ou recusa, eles vão de novo na nova tentativa ou no `confirmar-pacote` do "Seguir tocando". Nada se perde.
  - Recarregar antes do passo 4 recomeça os toques, como hoje acontece com as perguntas.
  - Na retomada, a conversa mostra uma linha "Você contou: Saúde · mais agendamentos", tirada do briefing.
- **Se ela escrever em vez de tocar nos passos 1 a 3**, o texto vira a 1ª mensagem e vai à IA na hora, junto com os toques já feitos. Os toques fixos que faltavam saem da tela. O Zero pergunta o que faltar conversando, com as mesmas opções como sugestões tocáveis, que vão junto com a mensagem seguinte. Por isso `respostas` vale em qualquer turno de preço aberto (seção 6.1).
- **Por que os toques práticos vêm antes da dor:** todos os toques chegam no 1º turno. Se ela tocar uma sugestão no passo 4, esse mesmo turno já começa com o caso entendido e é o turno do valor: é o caminho mais curto.
- **A cidade sai das perguntas fixas.** Era um campo de texto obrigatório e é a parte que mais pesa. A IA pergunta se fizer falta; para o servidor ela já é opcional (falta vira `assumido`).
- **O Turnstile dentro da caixa.**
  - Se a Cloudflare pedir interação, o widget aparece como fala do Zero ("Só confirmo que você é uma pessoa").
  - Se falhar, ou vier o 503 `nao_configurado` (`api/vendas.mjs:113-118`), a fala oferece "Tentar de novo" e "Deixar um recado". Nunca há falha muda.
- **"Mudar o que eu respondi"** (no passo 7 e no radar) reabre os toques 1, 2 e 3 dentro da conversa, com a resposta atual marcada. Não volta a uma tela.
  - **Com IA**, a mudança segue numa `mensagem` com as `respostas` e uma fala curta ("Mudei: Beleza no lugar de Saúde"), e o turno estima de novo.
    - A fala é montada pelo **módulo comum de rótulos** (ES5, usado pelo cliente e pelo servidor, como `orcamento-planta-forma.js`).
    - O servidor remonta a fala e recusa se não bater. Assim a deduplicação do cliente (`entrouComTexto`/`falaConfere`, `orcamento.js:270-295`) continua comparando texto com texto, e a bolha otimista é igual à gravada.
  - **Sem IA**, o `simular` recalcula.
- **Do 1º toque ao valor:** 3 toques e 1 texto (ou toques de sugestão), com 1 ou 2 turnos da IA. Com a IA real, ~21 s por turno (rodada real 9), dá 20 a 45 s. Medir na seção 9.
- **"Ver o preço" e a tela `#o-perguntas` saem da página.** O `orc-nova` (`js/ancoras.js:50-64`) passa a mostrar a caixa da conversa antes do JS; sem JS continua o aviso de `noscript` de hoje.
- **Os controles do painel não somem.** Extras sugeridos, "Ver todos os extras", urgência, vizinhos e formato sugerido (`#o-est-acoes`, hoje em `js/orcamento-perguntas.js`) passam para um módulo próprio. Aparecem depois do valor, com a mesma regra de visibilidade de hoje, com IA ou sem.

## 2. O preço: quando aparece e como o radar se preenche antes

**O caso entendido.** O servidor decide pela função `casoEntendido(briefing)` (`api/_vendas/consultor.mjs`), avaliada **no começo do turno**, como o resto do ESTADO (`agente.mjs:114-120`). Ela exige:

- o negócio (segmento ou descrição);
- pelo menos um objetivo;
- `situacao_atual` com `como_chegam` ou `o_que_se_perde`. Vale até "não sei": o `proximoPasso` de hoje já manda registrar a resposta da dor mesmo vaga (`consultor.mjs:338`).

**Não exige o formato.** O formato continua sendo escolha do Zero, e o ramo da dor de hoje continua antes dele.

**O turno do valor** é o primeiro que **começa** com `casoEntendido`. Pode ser:

- **o 1º turno da IA**, quando ela tocou uma sugestão no passo 4: as `respostas.situacao` entram no briefing antes do ESTADO;
- **o 2º turno**, quando ela só escreveu: o 1º grava a dor (`situacao_atual`), mesmo vaga.

O "caso entendido" nunca depende do formato nem dos toques práticos, que já vieram todos no 1º turno.

**Para o 2º turno não depender do modelo:**

- **O 1º turno de texto tem um `proximoPasso` próprio:** "a mensagem dela responde como os clientes chegam e o que trava: registre em `situacao_atual` com as palavras dela; não pergunte de novo". Hoje o ramo da dor (`consultor.mjs:338`) repetiria a pergunta que ela acabou de responder.
- **Uma rede no código:** depois de um turno completo que respondeu à pergunta fixa da dor, o caso conta como entendido mesmo que o modelo não tenha gravado nada. Assim o valor nunca fica preso à exceção "pediu duas vezes".

**Um predicado só, `turnoDoValor(briefing, historico)`**, que junta o `casoEntendido`, a rede acima e o adiamento do JEV (seção 8B). Ele decide:

- a recusa do `estimar`;
- o `pedePlanta`;
- o `proximoPasso`;
- a contagem do plano padrão (`planta.mjs:173-178`);
- o `valor_liberado` do `estado`.

Assim a planta e o valor nunca saem em turnos diferentes.

Nele:

- o `proximoPasso` pede, nesta ordem:
  1. diga em 2 ou 3 frases o que o site vai fazer por ela, com as palavras dela;
  2. se ainda não há formato, recomende um;
  3. com a flag, `desenhar_planta`;
  4. `estimar`.
- O `ler_caso` (a leitura do radar) **nunca roda no turno do valor**: ele fica no turno seguinte, para caber nas `MAX_ITERACOES = 4` (`agente.mjs:32`; nesse turno: briefing, planta com uma correção, `estimar`).
- Se o desenho falhar duas vezes, o plano padrão do nicho entra, como hoje (`fecharTurno`).
- O `estado` passa a devolver `valor_liberado` (calculado, sem coluna nova), que o cliente usa na liberação do valor.

**O servidor garante a ordem.**

- **A ferramenta `estimar` continua sempre na lista.** A lista é prefixo do cache e muda só por etapa e flag, nunca por turno (`consultor.mjs:245-247`).
- **O agente recusa o `estimar` antes do caso entendido**, do mesmo jeito que recusa o `pedir_contato` (`agente.mjs:174-175`). A recusa diz ao modelo "falta entender o caso: pergunte como os clientes chegam e o que trava".
- **Exceção:** se a pessoa pediu o preço **duas vezes** (o detector de pedido de preço do `garantirValor`, `zero.mjs:288`, contado nas mensagens dela), o `estimar` é liberado. Quem manda é ela: segurar o número contra um pedido repetido seria a resistência que o dono não quer.
- **O prompt muda junto.** Ele é texto aprovado pelo dono (cabeçalho de `consultor.mjs:14`). A mudança aplica a decisão dele de 13/11 (opção A). O diff do prompt e o `docs/zero/prompt-efetivo.txt` regravado vão à sessão principal para o dono ver antes do merge.
  - O trecho "se perguntaram o preço logo de cara… estime o site de uma página" (`montarSistema`, ~`:172`) passa a dizer "diga que falta uma coisa para o valor certo e pergunte a dor; se ela pedir de novo, estime".
  - Os trechos de `:168`, `:200` e `:209` ("chame estimar", "recomende e escreva o valor") ganham "depois de entender o caso".
  - A descrição da ferramenta da planta ("é depois da estimativa", `planta.mjs:64`) muda no mesmo PR, porque faz parte do cache.
  - Faixa de preço sem estimar: não existe e não se promete. A regra 2 proíbe reais sem `estimar`.
- **A planta deixa de depender do preço.**
  - O `pedePlanta` e as travas de `planta.mjs:147` e `agente.mjs:152/155` passam a exigir `casoEntendido` e não mais a estimativa.
  - O plano padrão depois de dois turnos sem desenho já conta a partir do pedido da planta (`planta.mjs:173-178`), então acompanha sozinho.
  - O simulado (`api/_ia/simulado.mjs:121-138`) segue a mesma ordem, para o E2E e os vídeos.

**A ordem na tela é coreografia do cliente**, porque a resposta chega inteira.

1. A fala do Zero entra.
2. Com a flag, o mapa cresce e consagra.
3. Só então o valor conta no miolo do radar.

Sem a flag, o valor entra 1,2 s depois da fala, o mesmo respiro do cartão da planta. O número continua sendo o do motor (`[[total]]`); o modelo nunca o escreve.

**A regra da liberação do valor no cliente:**

- **Com IA**, o valor que aparece é **sempre o da estimativa gravada**; o do `simular` nunca aparece. Ele é liberado:
  - no turno em que a estimativa chega, depois da fala e, com a flag, da consagração do mapa;
  - na exceção "pediu duas vezes" (estimativa sem mapa), 1,2 s depois da fala;
  - **ao recarregar com uma estimativa já gravada, na hora**, sem coreografia.
- **Sem IA**, o valor é o do `simular`, liberado depois do resumo fixo do passo 6.

**O radar antes do valor.**

- A cada toque, o novo módulo dos toques chama o `simular` silencioso (calcula e não grava; hoje quem chama é `js/orcamento-perguntas.js`). A pessoa vê o projeto tomar forma enquanto conversa:
  - **Entrega:** o formato;
  - **Escopo:** páginas e extras;
  - **Prazo:** dias úteis;
  - **Integrações:** WhatsApp, agenda, mapa…
- **A retenção mora em `estadoDoEscopo`** (`js/orcamento-escopo-estado.js:195-214`), não no `dimDaFonte`:
  - novo estado `entendendo`, entre `identificando` e `estimativa`;
  - o miolo diz "Sai depois que eu entender o seu caso";
  - os cantos se preenchem;
  - o valor, o sinal e o "Ver como o valor é formado" esperam a liberação.
  - A liberação vem do cliente (seção 2, ordem na tela), nunca de um campo novo no banco.
- **Uma fonte só para o número.**
  - Com IA: a estimativa gravada pelo `estimar`. **O "Quero os três modelos" não chama o `confirmar-pacote`**, que sobrescreveria a estimativa do Zero com o pacote do classificador (`fluxo.mjs:432-436`).
  - Sem IA: o `simular` do passo 7, gravado pelo `confirmar-pacote` no "Quero", como hoje.
  - O radar já escolhe nessa ordem (`doSalvo` > `daSimulacao`).

**Textos que mudam junto** (os de clientes passam por voz-humana e por revisor diferente):

| Onde | Hoje | Novo (rascunho) |
|---|---|---|
| `orcamento.html:73` | "Responda umas perguntas rápidas e veja o preço na hora, sem cadastro…" | "Conte do seu negócio para o Zero. Ele desenha o site que trabalha por você e mostra quanto custa, sem cadastro. Depois a gente faz três modelos e você só paga se escolher um." |
| etapas `:74-80` (`passoAtual`, `data-passo`) | Perguntas · Preço · Modelos · Ajustes · Resumo · Entrada | Conversa · Modelos · Ajustes · Resumo · Entrada (o `data-passo="estimativa"` funde-se com `conversa`) |
| `:250` | "O preço aparece aqui assim que você responder as perguntas…" | "O valor aparece aqui depois que o Zero entender o seu caso. Ele vem da tabela da Beyon Zero." |
| meta e og (`:7, :13, :21`) | "veja o investimento calculado pela tabela" | "conte do seu negócio, veja o site que ele precisa e quanto custa pela tabela" |
| `sites.html:62` e `:268` (idênticos, `faq-identico.test.mjs`) | "mostra o valor do seu caso, na hora e sem cadastro" | "mostra o valor do seu caso depois de entender o que você precisa, sem cadastro" |
| `ABERTURA_PADRAO` (`zero.mjs:31`; texto aprovado, `zero.test.mjs:486-487, 547, 560`; `docs/zero/*.txt` regravados) | "…qual formato de site serve pro seu negócio e quanto fica." | a fala do passo 1. Vai **no PR da página**, junto com o HTML, porque o modelo é avisado de que a pessoa já a viu (`agente.mjs:61`) |

"O valor sai da tabela" e "Você vê o valor e o prazo antes de pagar" (`index.html`, `sites.html`) continuam verdade e ficam.

## 3. "O que o site vai fazer por você" (passo 6) sem a flag

O pedido do dono vale também com a planta desligada: cada pessoa lê o **seu** caso.

- **Com IA:** a fala do passo 6 é do modelo, presa pelo `proximoPasso` (2 ou 3 frases, as palavras dela, sem promessa de resultado). As travas de saída de hoje continuam (`agente.mjs:193-231`).
- **Sem IA:** um resumo montado das listas fechadas e dos toques, sem texto livre dela.
  - Exemplo para "Saúde" + agendamentos + "Pelo Instagram" + "Respondo preço e horário na mão": "Pelo que você contou: quem te acha no Instagram cai numa página sua, vê preço e horário sem precisar perguntar e já marca. Você para de responder tudo na mão."
  - As frases ficam numa lista fechada por objetivo e por sugestão, com voz-humana e revisor.

## 4. Quando a IA não está

A pessoa nunca fica sem caminho.

| Situação (como o código avisa) | Hoje | Novo |
|---|---|---|
| **Sem consultor:** `sessao-config` com `consultor:false`. Só acontece sem chave ou com `BZ_SEM_CONSULTOR` local (`api/vendas.mjs:86-92`). | Só as perguntas | A conversa abre igual. O passo 4 vira só toques nas sugestões; "Outro" abre uma escrita de 60 caracteres que **não vai à IA**, só ao briefing (vai no `confirmar-pacote`, seção 6.2). O passo 5 some, o passo 6 é o resumo fixo (seção 3), o resto é igual. |
| **A IA cai no meio:** `mensagem` devolve 503 com `recado:true` (`fluxo.mjs:44,62`, disjuntor `vendas_ia_disponivel` e custo do dia, `:260-268`), ou 429 do freio por IP (8 conversas por IP por dia; 12 por /48; `config.mjs:66`, `fluxo.mjs:221`). | Aviso com "Tentar de novo" e "Deixar um recado" | O aviso aparece **dentro da conversa**, com uma 3ª saída: **"Seguir tocando nas opções"**, que passa ao modo sem consultor a partir do ponto em que está. O texto escrito volta à caixa (`falhaNoEnvio`, como hoje). Todo erro com `recado:true` e todo 429 levam a esse aviso. |
| **Erro de rede num toque** | | Toque marcado com "Não foi. Tocar de novo". Nada se perde. |
| **Sempre** | Recado só no aviso | Uma linha discreta embaixo da caixa: "Prefere deixar um recado?" (`js/recado.js`) |

**"Seguir tocando" depois de uma estimativa do Zero** mantém a estimativa gravada e vai direto ao "Quero" e ao passo 8. Ele **nunca chama o `confirmar-pacote`**, que trocaria o valor e gravaria os padrões do `validarRespostas` (`contrato.mjs:26-33`).

**Atenção ao IP compartilhado.** Com a IA no passo 4 para todo visitante, celulares atrás do mesmo IP de operadora podem bater o teto de 8 conversas por dia. Eles caem no modo sem consultor, que fecha o pedido igual. Medir antes de ligar e, se pesar, discutir o teto com o dono, sem mudá-lo nesta frente.

O E2E roda os dois modos: com consultor (IA simulada) e com `BZ_SEM_CONSULTOR=1`.

## 5. O pedido dentro da conversa (passo 8)

**Os mesmos campos, o mesmo `API.detalhes` e a mesma validação de hoje** (`api/_vendas/pedido.mjs:92-126`, esquema fechado, `aceite===true`, redação, freios `PEDIDOS`). Muda só a forma: perguntas do Zero em sequência, respondidas na caixa de texto, que troca de tipo a cada passo.

| Passo | O Zero pergunta | Caixa |
|---|---|---|
| 8a | "Qual é o nome do negócio?" | texto, 2-60 |
| 8b | "E o que vocês vendem ou fazem, em poucas palavras?" | texto, 3-200, com as sugestões por ramo de hoje como toques |
| 8c | "Qual WhatsApp eu passo para a equipe te avisar quando os modelos ficarem prontos?" | `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`, mesma validação |
| 8d | "Quer me contar mais alguma coisa? Ajuda a acertar os modelos." | Opcional, em toques: "Como quer ser chamado", "Um site que eu admiro", "Para quem eu vendo", "O que me diferencia", "As redes do negócio" e **"Não, pode seguir"**. Cada toque abre a pergunta daquele campo. As redes (as 5 de hoje, `pedido.mjs:31-35`) pedem antes a **autorização própria** de hoje: um toque claro, nunca pré-marcado, que o servidor exige (`pedido.mjs:109`). |
| 8e | **Cartão de aceite na conversa** (abaixo) | |

**O cartão de aceite (8e).**

- Primeiro, o resumo do que ela passou: "Você me passou: nome do negócio · o que vende · WhatsApp (e os opcionais que deu)". Cada item tem **"Corrigir"**, que volta ao passo dele.
- Depois, o texto do aceite (rascunho, a passar por revisor de segurança e por voz-humana): "A Beyon Zero guarda estes dados e a nossa conversa para preparar os três modelos e te avisar no WhatsApp quando ficarem prontos. Não vendemos os seus dados. Usamos empresas que fazem o serviço funcionar (guardar os dados e a IA que conversa com você); a lista está em [Como tratamos os dados]. Sem contrato, a conversa é apagada em 2 meses e o contato em 12 meses, ou antes, se você pedir."
  - "Não passamos para ninguém" seria falso: o texto vai à Anthropic e os dados ficam no Supabase.
  - O prazo das redes (60 dias) entra no cartão só se ela as passou.
  - O link abre `/privacidade#orcamento` em nova aba, com `rel="noopener"`.
  - Os prazos são os de `privacidade.html:70`.
- Por fim, o botão **"Concordo e quero os modelos"**: um `<button>` real, com foco visível. Sem ele, nada é enviado.

**Garantias, ditas como são.**

- **O telefone e o "como quer ser chamado" nunca vão ao modelo nem às mensagens da conversa** (`pedido.mjs:8-9, 125`). O telefone vai só a `app.leads` e, como HMAC, ao freio.
- Os outros campos (nome do negócio, o que vende, público, diferencial, site admirado) **entram no briefing redigido**, como hoje (`pedido.mjs:117-122`). O modelo e o gerador dos modelos leem o briefing nos turnos seguintes. A política de privacidade passa a dizer isso (seção 8).
- As bolhas do passo 8 existem só na tela. **Nada do passo 8 fica guardado no aparelho:** nem `localStorage` nem `sessionStorage`.
  - Recarregar no meio mostra a conversa, o valor e o toque "Quero os três modelos" de novo. Entrar nele recomeça o 8a.
  - O pedido (o código BZ) só existe depois do envio dos detalhes.
  - "Voltar à conversa" e o recarregar limpam os campos do DOM, inclusive o telefone.
- **O `detalhes` é enviado uma vez**, no aceite, com um id de tentativa. O erro do servidor vira fala do Zero no passo certo, com as frases de hoje (inclusive a frase unificada de "telefone já tem pedido", que não revela se o número existe). Nada de reenvio automático.
- **Teste obrigatório** (PR do pedido), com um telefone marcado:
  - ele não aparece em `ia.mensagem`, nos logs nem em `vendas_registrar_evento`;
  - não aparece no `estado` (`fluxo.mjs:373-390`, que devolve só `tem_contato`, `:569`);
  - não aparece em `vendas_conversa_dono` nem no painel.
- **O formulário deixa de abrir sozinho** com `E.estimativa`. Ele abre no "Quero os três modelos" e no `pedir_contato`, que passa a abrir o 8a.
- **Os textos do prompt que falam do formulário mudam no mesmo PR**: `consultor.mjs:173, 187, 274, 346, 348` ("já aparece na tela abaixo do cartão").

**Versão do texto aceito [A]: pré-condição do PR 3.**

- **O problema:**
  - Hoje o servidor guarda `contato_aceite_em`, mas não qual texto foi aceito.
  - O ônus da prova do consentimento é do controlador (LGPD art. 8º, §2º).
  - Reconstruir pela data e pelo histórico do repositório é frágil: há staging e produção, a promoção é separada e rollback existe.
  - O caminho sem migration não existe: `vendas_registrar_evento` só aceita os tipos `ia_falhou` e `tentativa_bloqueada` (`supabase/migrations/20261007120100_vendas_funcoes.sql:393`).
- **O PR 3 traz a migration `aceite_versao`:**
  - O texto do aceite tem um id de versão. **O cliente envia o id do texto que ela viu.**
  - O servidor guarda a tabela das versões (id → hash do texto) e **só aceita versão conhecida e vigente**. Versão antiga ou desconhecida (página em cache, aba aberta antes de uma publicação) leva a 409 "recarregue a página".
  - O que se grava é a versão aceita e o hash dela, junto do aceite. O conteúdo vem sempre do servidor; o cliente só diz qual viu.
  - Testado no PGlite.
- **Aplicar a migration no banco de teste e no real é passo do dono** (`docs/PROCESSO.md`, "Sempre pedir o dono"), pedido pela sessão principal **antes da promoção do PR 3**.

## 6. O servidor: o que muda (nível 3; a única migration é a do aceite, no PR 3)

1. **`mensagem` aceita `respostas` (opcional)**, ao lado de `texto`.
   - **Esquema fechado por campo:** `ramo` (código), `outro` (≤ 60), `objetivos` (códigos), `site_atual` (código), `material` (código), `situacao` (códigos das sugestões).
   - Esse esquema **não aceita `cidade`** nem campo desconhecido, e **nunca preenche padrão** para campo que não veio. O `validarRespostas` de hoje preenche (`contrato.mjs:26-33`), então entra uma variante parcial.
   - **Só nas etapas de preço aberto** (`ETAPAS_PACOTE`, `fluxo.mjs:101`: descoberta e estimativa), depois de `donoDaConversa`, como o `confirmar-pacote`. Nas outras etapas: 409 e o briefing não muda. Com o pedido confirmado, ninguém reescreve ramo ou objetivos que o gerador e o painel leem. Isso vai num teste.
   - O `outro` passa por `semInvisiveis` + `textoLimpo` + `redigir` e pelo `pareceInjecao`.
     - Se este marcar, grava-se "outro" sem o texto e um evento `tentativa_bloqueada`, como `fluxo.mjs:460`.
     - Ele vai **só ao briefing**, nunca como mensagem. Lá vira `negocio.segmento`, que chega ao modelo marcado como DADO (`agente.mjs:53-54`), e ao gerador das direções, que também precisa tratá-lo como dado (conferir no PR 1).
   - **Quando o cliente manda `respostas`:**
     - os toques 1 a 3 e as sugestões do passo 4, com o primeiro texto livre ou, numa falha, na nova tentativa;
     - as sugestões tocáveis que o Zero oferecer depois, junto com a mensagem seguinte (qualquer turno de preço aberto);
     - os de "Mudar o que eu respondi", com a fala montada pelo módulo comum de rótulos (seção 1).
     - **Teto: no máximo 4 mensagens de "Mudar" por conversa.** Um script não queima os 40 turnos sem escrever.
     - **Contagem:** o servidor conta, no histórico da conversa, as mensagens da pessoa que casam com o molde da fala montada (o módulo comum de rótulos tem o molde). Sem coluna nova; um teste fixa o teto.
   - **Fusão no briefing lido no começo do turno**, antes da IA: o campo respondido vence (é a resposta explícita dela); o resto fica. O turno grava o briefing fundido (`fluxo.mjs:285-286`), sob a trava da IA que já existe, então não há atualização perdida.
   - **A fala do "Mudar":**
     - o servidor a remonta dos rótulos fechados e recusa (400) se não bater com o `texto`;
     - é um turno normal: conta no teto de 40 e é gravada como mensagem da pessoa;
     - texto vazio continua recusado (`fluxo.mjs:452-453`).
   - **Erros e logs:** o 400 de valor fora da lista não repete o valor, e nenhum log grava `respostas`.
   - **`site_atual`** ganha um campo fechado no briefing, `presenca.site_atual` (código). O briefing é `jsonb` com esquema no código (`briefing.mjs`), então não há migration. Hoje o `respostasParaBriefing` o ignora, e ele se perderia depois do 1º turno: no turno do valor, na retomada e no gerador.
   - **As sugestões do passo 4** são lista nova, fechada, por ramo (um arquivo de dados com teste). Os rótulos vão a `situacao_atual.como_chegam` e `o_que_se_perde`.
2. **`confirmar-pacote` aceita `situacao` (códigos)** para o modo sem consultor e grava `situacao_atual` pelos rótulos. O "Outro" dessa resposta passa pela mesma limpeza.
3. **`casoEntendido` e as mudanças da seção 2:**
   - a recusa do `estimar`, com a exceção das duas perguntas de preço;
   - o `pedePlanta`, `planta.mjs:147` e `agente.mjs:152/155`;
   - a ordem do turno do valor, com o `ler_caso` no turno da dor;
   - o simulado;
   - o prompt (`montarSistema`, `consultor.mjs` ~`:168, 172, 200, 209`) e a descrição da ferramenta da planta (`planta.mjs:64`);
   - `valor_liberado` no `estado`.
4. **Alarme de custo:** um aviso ao dono quando o custo de IA do dia passar de 80% do teto (`api/_aviso.mjs`, que já existe). Não muda nenhum limite.
5. **Nada muda** em:
   - `detalhes`, `simular`, pagamentos, Turnstile, as travas de saída e os limites de custo;
   - o banco, fora do PR 3: nenhuma migration; `situacao_atual` e `negocio.cidade` já existem no esquema do briefing (`briefing.mjs:31`).

## 7. O mapa do caso (atrás da flag): composição por caso, não caixas iguais

O dono pediu "outras estruturas animadas" e "cada atendimento de fato único". A planta de hoje é sempre uma de 3 topologias de 8 ou 9 caixas iguais. Ela vira uma **composição por caso**:

- **A IA escolhe**, de uma biblioteca fechada de **estruturas** e **peças** animadas da identidade do site, a que representa aquele caso, e escreve tudo com as palavras da pessoa.
- **Quem desenha continua sendo o código**, com esquema fechado e validado. Nunca SVG ou HTML livre vindo do modelo: isso protege a segurança, o layout e a qualidade.
- A unicidade vem da combinação de **estrutura + peças + palavras + ajustes**, e **sempre do que a pessoa contou**.
  - Dois negócios do mesmo ramo com histórias diferentes têm desenhos diferentes: o dono perguntou 13/11, "para áreas iguais, o atendimento também será unico?".
  - A estrutura muda quando a história muda; mesma história, mesmo desenho.
  - **A diferença nunca é sorteada:** seria falsa. Nem o código nem o prompt variam a estrutura ao acaso.
  - Os planos padrão por nicho (fallback) também saem do que se sabe do caso (origem e trava, quando houver), e não só do ramo.

**7.1 As estruturas (lista fechada, cada uma com o seu desenho e a sua animação)**

| Estrutura | Quando representa o caso (guia no prompt; a IA escolhe) | Desenho |
|---|---|---|
| `caminho` | Um fluxo direto: alguém procura, encontra, chama | Cena de hoje → o site → o objetivo, em linha |
| `antes_depois` | A dor é o trabalho repetido ou a perda fora de hora ("respondo tudo na mão", "à noite ninguém atende") | Duas faixas: em cima "Hoje", com o ponto que trava em destaque; embaixo "Com o site", o mesmo trecho resolvido; as duas chegam ao objetivo |
| `ramos` | Dois públicos ou dois serviços que pedem caminhos diferentes (visita × orçamento, varejo × atacado) | Uma entrada que se divide, com o rótulo em cada ramo, e se junta no objetivo |
| `ciclo` | O ganho está na volta (recompra, retorno, revisão, mensalidade) | Um caminho que fecha em laço, com a seta de volta rotulada |
| `mapa` | O caso tem várias forças (origem, trava, desejo, lacuna), como o mapa do vídeo de referência | Nós com setas **rotuladas**, cor por papel, até 7 nós |

**7.2 As peças (lista fechada)**

- **Papéis**, com cor própria na paleta V4 e, no objetivo, o ouro já aprovado: `hoje` (a cena de hoje), `trava` (o que trava, em destaque), `origem` (de onde chegam: Instagram, WhatsApp, indicação, Google, passa na frente…, a origem que ela disse), `site`, `conversa`, `acao` (agenda, pede, compra, chama), `volta` e `objetivo` (onde quer chegar), mais `ajustado` (marca do ajuste).
- **Ícones:** os 29 desenhos de hoje (`TIPOS`), mais os de cena e de origem que faltarem, em traço de 1 px, no mesmo módulo de desenho.
- **Setas:** de, para e **rótulo curto** (≤ 24 caracteres: "chega por", "trava aqui", "resolve", "volta para").

**7.3 O plano (esquema v3, no mesmo módulo comum de forma, `js/orcamento-planta-forma.js`)**

```text
{ estrutura: caminho|antes_depois|ramos|ciclo|mapa,
  hoje:     { origens: [códigos ≤ 3], texto ≤ 60, trava ≤ 60 },   // origens por CÓDIGO (instagram, whatsapp, google_busca, google_mapa, indicacao,
                                                                  // passa_na_frente, facebook, tiktok, site_atual, outro); "respondo preço e horário na mão"
  nos:      [ { id, papel, icone, origem?, titulo ≤ 28, frase ≤ 60 } ]   // 3 a 7, contagens e papéis obrigatórios por estrutura
  setas:    [ { de, para, rotulo ≤ 24 } ]        // ≤ 9, todas rotuladas
  objetivo: { titulo ≤ 28, frase ≤ 60 },
  fecho ≤ 80 }
```

**Regras de validação.** São as de hoje, estendidas: a caminhada de teto antes da forma, a normalização de cada texto (invisíveis, NFKC, sem `<` `>` nem controles) e a camada de texto (`planta-textos.mjs`). Acrescentam-se:

- `redigir` em todo texto;
- recusa de frase com `[` (marcador de redação), com 4 ou mais dígitos seguidos (como `orcamento-planta-forma.js:106`) ou com valor em reais (`semPrecoNoTexto`, `seguranca.mjs:123`);
- o corte por palavra **depois** da redação, para nunca partir um marcador ao meio;
- mecanismo, nunca promessa, número, preço ou prazo (as travas de hoje).

**As travas de texto de hoje e as palavras dela** (achado do arquiteto):

- **O conflito:** a trava de marca recusa Instagram, WhatsApp e Google (`planta-esquema.mjs:93`), e a de prazo recusa "hoje", "agora", "na hora" e "dias" (`:91`). Um "hoje" com as palavras dela cairia quase sempre no plano padrão.
- **A saída:**
  - **as origens vão só como código** (lista fechada acima); o rótulo ("Instagram", "WhatsApp") e o ícone são postos pelo cliente, de uma tabela;
  - **a palavra "Hoje:" é posta pela tela**, nunca vem do modelo;
  - os campos `hoje.texto` e `hoje.trava` ganham **regra própria**: a de marca e a de prazo **se afrouxam só para as palavras de tempo do cotidiano** ("hoje", "à noite", "na hora"), e marca continua fora (a frase descreve o problema sem nomear marca: "chamam no direct e eu respondo um por um"). **As travas de promessa, resultado, número e preço continuam valendo:** o rótulo "Hoje:" dá ao texto a autoridade de "o que a pessoa disse", e por isso ele não pode carregar promessa.
- **No cliente**, um código de origem desconhecido vira "outro". Ele nunca imprime o código cru.
- **Teste:** as frases do vídeo de referência e as das 5 conversas da seção 9 passam ou são recusadas como esperado. O teste **mede a taxa** de "hoje" recusados que levam ao plano padrão.

A tela usa só `textContent` e não põe texto da pessoa em atributo. O leitor de tela ouve por um nó de texto visualmente oculto, nunca por `aria-label` ou `title`.

**Fechamentos do esquema** (revisão de segurança da revisão 2):

- `estrutura`, `papel` e `icone` vêm de lista fechada.
- `id` casa com `^[a-z0-9_]{1,12}$`, e `de` e `para` têm de existir em `nos`.
- A tela **nunca monta classe, id, seletor ou atributo SVG concatenando** valor do plano: tudo é mapeado por tabela.
- Teto de bytes **do briefing com as 6 versões gravadas**, aplicado no servidor, assim como o `MAX_VERSOES`.
- O v3 é **revalidado a cada leitura** do `estado`, como o v2 já é (`fluxo.mjs:388`).
- `semPrecoNoTexto` e as travas de promessa valem em todos os textos: os do nó, o `hoje`, o `objetivo` e o `fecho`.

**O v2 continua lido, só para leitura.**

- O plano v3 tem `estrutura`; o v2, `topologia`. É assim que se distinguem (o `planta.v` é outra coisa, `planta.mjs:10, 135`).
- Planos v2 gravados em conversas antigas continuam desenhando como hoje, e o validador aceita as duas versões.
- **O ajuste de um plano v2 gera um v3 inteiro.** A ferramenta é uma só (cache), e o "nó novo cresce sem refazer o resto" vale só de v3 para v3.
- O `plantaParaModelo` (`planta.mjs:35-47`, que hoje só lê `etapas`) ganha a forma compacta do v3, com os `id`. Assim o ajuste mantém os nós.
- O cliente **ignora a versão que não conhece**: não desenha nada e a conversa segue.
- Os PRs 4 e 5 entram na `main` em sequência. A sessão principal pede ao dono para não promover entre os dois. A proteção de verdade é o cliente ignorar a versão que não conhece.
- Os 8 planos padrão por nicho (`planta-padrao.mjs`) ganham a versão v3 com estruturas variadas entre si.

**7.4 "Montei o mapa do seu caso. Ficou certo?"**

- Depois da consagração, dois toques: **"Está certo"** e **"Quero ajustar algo"**.
- O ajuste é texto livre. Vai à IA como mensagem normal (com as guardas de hoje), e a IA devolve o plano com um nó novo, ou trocado, com papel `ajustado` e a marca "Ajustado".
- O nó novo cresce ligado por uma seta rotulada, sem refazer o resto.
- O teto de versões sobe de 4 (`MAX_VERSOES`, `planta.mjs:21`) para 6.
- "Está certo" é só uma fala na tela; não gasta IA.
  - Hoje ele chama `enviar` e dispara um turno (`orcamento.js:333-334`); isso muda.
  - Nada é gravado: no turno seguinte o modelo vê o plano igual.
- **"Quero ajustar algo" só existe enquanto a planta é editável** (`planta_editavel` = preço aberto, `fluxo.mjs:388`). Com o pedido confirmado, o toque some e o servidor recusa.
- **Custo:** o pior caso (6 versões, cada uma com a reserva da planta, `fluxo.mjs:464`) entra no alarme de 80%.

**7.5 Na tela**

- **De relance, numa tela de celular:**
  - o mapa inteiro cabe na caixa da conversa (≤ 440 px de altura em 390 de largura), com o **objetivo sempre à vista**;
  - cada estrutura tem um layout próprio para o celular (coluna, duas faixas, ramo vertical, laço compacto, nós em grade de 2);
  - no computador, a faixa larga de hoje.
- **Legível para um dentista:**
  - rótulos em frase curta, em Sora, sem maiúsculas mono, sem números de etapa e sem grade no celular;
  - mono só no rótulo da seta.
- **O movimento aprovado fica, adaptado a cada estrutura:**
  - o esboço cresce na conversa a cada resposta: o esboço de hoje (`js/planta-cresce.js`, listas fechadas) passa a mostrar só o que já se sabe, sem caixa tracejada, e com a origem que ela disse. A lista de origens ganha Instagram, WhatsApp e indicação;
  - o esboço vira o desenho final;
  - a luz percorre as setas na ordem da estrutura;
  - o objetivo vira ouro.
  - Tudo em transform e opacity, com `prefers-reduced-motion` (um quadro, parado e aceso), sem blur e com o som de hoje.
- **Antes de codar o desenho, o laboratório:** as 5 estruturas com 3 casos, em imagens de celular e computador, vão à sessão principal para o dono ver. O trabalho segue enquanto isso; uma correção dele entra antes do merge.
- **Bytes:** o teto de `planta-bytes.test.mjs` vale. Se as estruturas pedirem mais, a medida vai ao PR com o número.

## 8. Segurança e privacidade (revisão de segurança obrigatória nos PRs 1, 2, 3 e 4)

- **A política em `privacidade.html#orcamento` é reescrita no PR da página e publicada junto com ele**, nunca depois. Ela passa a dizer:
  - a sessão nasce no 1º toque e o aparelho guarda o identificador dela desde então;
  - as escolhas tocadas e o texto da conversa são guardados;
  - todo visitante conversa com a IA (Anthropic), e o que o modelo recebe é o texto da conversa e o briefing **redigidos**, incluindo os detalhes do negócio; nunca o telefone nem o "como quer ser chamado";
  - os prazos de hoje (`:70`), o controlador e o canal de direitos, que já estão lá.
- **Custo e abuso:**
  - Os freios de hoje valem: sessão 8 por IP a cada 10 min, IA 8 conversas por IP por dia, US$ 2 por conversa, US$ 25 por dia, 40 turnos.
  - O IP vem da borda da Cloudflare: `cloudflare/rotas.mjs:57-68` apaga o `x-forwarded-for` do cliente e monta um a partir do `cf-connecting-ip`, então não pode ser forjado.
  - O teto do dia é um balde só: quem o esgota derruba a IA para todos, mas a pessoa cai no modo sem consultor e fecha o pedido igual.
  - Alarme a 80% (seção 6.4). Medir a taxa de conversas que chegam à IA antes de ligar a flag.
- **Texto livre:** o do passo 4 e do ajuste do mapa passa pelas guardas de hoje (`limparMensagem`, `pareceInjecao`, redação na ida ao modelo, travas de saída). O "Outro" de 60 nunca vira mensagem (seção 6.1).
- **"Recomeçar" fica visível** dentro da conversa (aparelho compartilhado). A retomada por link (`#retomar=`/`#pedido=`) não muda; o E2E a cobre.

## 8B. O JEV acompanha

O dono, 13/11: "O nosso JEV está poderoso igual o original? Ele funciona especificamente para nós? Como estamos aumentando o escopo, precisamos garantir que ele também seja capaz de acompanhar."

**O JEV hoje** (`api/_classificador/`):

- Faz perguntas fechadas que devolvem probabilidade e nunca escrevem texto (`perguntas.mjs`):
  - 6 sobre a saída do Zero (`saida-1`);
  - 5 sobre a entrada da pessoa (`entrada-1`).
- **Haiku v2 em sombra na produção** (`JEV_SOMBRA`, tabela `app.jev_sombra`), com o gabarito em `docs/gabarito/classificador/` e as medições em `medicoes/LEIA-ME.md`.
- A política (`politica.mjs`) segue a regra de ouro: **o sinal do modelo só aumenta o cuidado**. Sem sinal, vale a base de código. Subir de nível (0 mede, 1 dá selo, 2 age) é decisão do dono, por PR.

**O que o fluxo novo pede de pergunta fechada**:

| Pergunta | Tarefa e versão | Quem decide (a base) | O papel do JEV | No nível 2 |
|---|---|---|---|---|
| `ramo_do_texto`, `tem_site` e `tem_material` (escolha). Quando a pessoa escreve em vez de tocar ("tenho uma clínica em Niterói e só tenho Instagram"), como o "descobre o segmento" do vídeo de referência | `entrada_do_visitante`, `entrada-2` | O Zero, pelo briefing | Pré-marcar o toque certo na tela | Só pré-marca. **Nunca grava** sem o toque dela. |
| `caso_entendido` (sim ou não): "a pessoa já contou como os clientes chegam ou o que trava no dia a dia?" | `entrada_do_visitante`, `entrada-2` | **O código** (`casoEntendido`, seção 2) | Só acrescenta cuidado: com o código dizendo "sim" e o JEV um "não" convicto, o valor espera **um** turno a mais (o Zero pergunta uma vez) | Nunca adia duas vezes, nunca contra a exceção "pediu o preço duas vezes" e **nunca libera** o valor que o código segura |
| Os textos do mapa: `promete_resultado`, `escreve_valor`, `oferece_proibido_saude` e a nova `fiel_ao_caso` ("as frases usam só o que a pessoa contou?") | `saida_do_zero`, `saida-2` (o mapa entra como texto lido) | As travas de código do esquema v3 (seção 7.3) | Segunda rede contra promessa, número, saúde e invenção | Trocar pelo plano padrão do nicho, o caminho que já existe |
| `ajuste_do_mapa` (escolha: confirma, pede mudança, outra coisa), para o texto livre depois do mapa | `entrada_do_visitante`, `entrada-2` | Os botões "Está certo" e "Quero ajustar algo"; no texto livre, o Zero | Dizer se o texto é pedido de mudança | O `proximoPasso` pede o redesenho (com "confirma", não gasta outro desenho) |

**Como cada pergunta entra** (as regras do gabarito, `docs/gabarito/classificador/LEIA-ME.md`, regra 3: pergunta nova = gabarito novo):

1. **Gabarito `g2`.** Os casos são escritos **antes** de rodar qualquer motor, com versão nova das perguntas e o hash congelado no teste.
2. **Conjunto separado**, escrito por **outro agente** sem ver nenhum erro, usado só para medir.
3. **Medição:** Haiku (o motor) e Sonnet (comparação) nos dois conjuntos, mais a coluna "código + modelo". O resultado vai a `medicoes/LEIA-ME.md`. **Nada age antes da medição boa.**
4. **Sombra na produção primeiro.** A tabela `app.jev_sombra` só aceita as tarefas `entrada_do_visitante` e `saida_do_zero` (`supabase/migrations/20261110120000_jev_sombra.sql:65`). Por isso as perguntas novas entram **nessas tarefas, com versão nova**.
   - **O banco hoje recusa as perguntas de escolha:** `jev_sombra_codigo_ok` só aceita `sim`, `nao`, `regulado` e `livre` (`20261110120000_jev_sombra.sql:38-43`). O "código diz" de `ramo_do_texto`, `tem_site` e `tem_material` é um código de lista, então a gravação falharia.
   - Por isso o PR 6b traz uma migration que amplia `jev_sombra_codigo_ok` e, se preciso, `sinais_ok` e `versoes_ok`. Ela é testada no PGlite e aplicada pelo dono.
   - **O mapa como texto lido** exige que o `observarNaSombra` receba o plano, e não só o texto da resposta. Isso também vai no PR 6b.
   - **Como o adiamento lê o sinal.** A sombra roda em segundo plano, depois da resposta, e nunca espera (`fluxo.mjs:313-323`). O sinal `caso_entendido` do turno N é gravado e lido **no começo do turno N+1** pelo `turnoDoValor` (seção 2). Não há chamada síncrona a mais nem latência nova. Se o sinal não estiver gravado a tempo, vale a base.
5. **Agir** (nível 1 ou 2) é PR próprio, com a medição na mão e **decisão do dono**.

**Cuidados da revisão de segurança:**

- **Privacidade.** Hoje a política diz que o segundo modelo lê o texto "só para medir a qualidade" (`privacidade.html:39`). Pré-marcar um toque e adiar o valor são **ação** sobre o texto dela. Por isso, **antes de qualquer pergunta passar do nível 0, a política tem de citar a finalidade nova**; até lá, só sombra de medição.
  - No PR 6b, conferir que a entrada enviada ao motor passa pelo mesmo `redigir` (o `fluxo.mjs:318` passa a mensagem crua à sombra: verificar dentro de `sombra.observar`).
- **Custo.** A sombra roda em segundo plano (`fluxo.mjs:309-323`), fora do `comReserva`. No PR 6b, conferir se o gasto dela entra no custo do dia (`vendas_custo_dia`).
  - Se não entrar, o alarme de 80% (seção 6.4) passa a somar o gasto de `app.jev_sombra`.
  - Com a IA aberta a todo visitante, esse gasto cresce com o tráfego.
- **"Um turno, nunca duas vezes"** no adiamento do valor tem de ser verificável sem coluna nova. Ele se deriva do histórico: se já houve um turno da pessoa depois de o `casoEntendido` do código virar verdadeiro sem que o valor saísse, não há novo adiamento. Um teste fixa isso.

**Nada do JEV trava a conversa.** Ele roda com o prazo e o disjuntor de hoje. Falhou, demorou ou o motor está fora: vale a base de código, que é o caminho de hoje (`politica.mjs`: "sem sinal, o resultado é exatamente a base"). A pré-marcação que não chegou a tempo simplesmente não aparece.

**Custo**, contado no teto de testes de US$ 3 (seção 9):

- Haiku: ~US$ 0,06 por 225 casos. Sonnet: ~US$ 1,2 por 225 (medição de 10/11).
- Com ~120 casos no `g2` e ~80 no separado: ~US$ 0,05 no Haiku e ~US$ 0,7 no Sonnet.
- Somado às 5 conversas reais (~US$ 1), dá ~US$ 1,8. Se passar do teto, aviso antes.

**Quando.** PR 6, depois dos PRs 1 a 5, porque as perguntas dependem dos textos novos:

- **6a:** gabarito, conjunto separado e medição (documentação e scripts);
- **6b:** as perguntas em sombra (nível 3).

## 9. Antes de pedir para ligar a planta: a IA de verdade (C) e os vídeos (D)

- **Teste com o modelo real**, local, com `BZ_IA_REAL=1` e a chave de `~/.beyon-segredos` por `scripts/com-chave.mjs`, sem o agente ver o valor.
  - **5 conversas.** 3 negócios bem diferentes (clínica odontológica, técnico de ar-condicionado e loja de roupas) e **2 do mesmo ramo com histórias diferentes** [D] 13/11. Exemplo: duas clínicas, uma com pacientes vindos do Instagram e faltas na consulta, outra vinda da busca e perdendo tempo respondendo preço no WhatsApp. Roteiro curto e humano.
  - **Teto: US$ 3** [D]. A estimativa é de ~US$ 0,20 por conversa (rodada real 9: US$ 2,43 em 12 roteiros): 5 conversas ~US$ 1, cabem no teto. O gasto real vai no relatório.
  - **Critério de aceite para o dono:**
    - os 3 ramos diferentes saem com **estruturas visivelmente diferentes**, não só textos diferentes;
    - as 2 clínicas saem com **desenhos visivelmente diferentes** entre si (estrutura e destaque, não só texto), porque as histórias são diferentes;
    - cada "hoje" e cada "trava" é reconhecível no que a pessoa escreveu;
    - a pessoa entende o mapa de relance no celular;
    - o valor aparece só depois do mapa.
  - **Entrega:** os 3 mapas lado a lado (celular e computador), com o que cada pessoa disse ao lado, e o tempo de cada turno.
  - Se as estruturas saírem iguais, o prompt da escolha é ajustado e medido de novo, dentro do teto.
- **Vídeos** [D] 13/11 ("Quando tudo estiver pronto quero um video de apresentação geral. E alguns vídeos da tabela viva"), em `00 Entrada/orcamento-conversa/videos/` (cofre), com `LEIA.md`:
  1. **Apresentação geral**, celular 390 primeiro (computador opcional), com som: da página inicial até "Pedido recebido", passando pelo orçamento novo inteiro (toques, dor, mapa do caso, valor depois, pedido na conversa e cartão de aceite), em ritmo de uso real, sem corte que esconda espera. Quando as seções 1 a 7 estiverem na `main`.
  2. **Um vídeo do mapa do caso para cada uma das 5 conversas do teste com a IA real**, gravado na própria rodada (as conversas não se pagam duas vezes). Se a câmera lenta não combinar com a IA real, a página real reproduz a resposta gravada da IA, e o `LEIA.md` diz como foi.
  - Mesmo gravador e mesmas regras dos de 13/11: câmera lenta controlada se a CPU estiver cheia (com a velocidade dita), conferência quadro a quadro (nada cortado, nenhum salto, sem blur), cópias até 25 MB. Os caminhos vão à sessão principal, nunca ao dono direto.

## 9E. O pente fino (parte E), antes do teste dos amigos e da promoção

O dono, 13/11: "E a parte da tabela viva, orçamento e o Zero? Estão perfeitos? Eles também merecem um pente fino quando concluídos."

**Quando:** depois das partes C (a IA real) e D (os vídeos).

**Onde:** no site de teste (staging), com a IA **real** e a flag ligada só lá.

**Processo de referência:** o dos criativos, no cofre (`04 Comercial/Instagram/PENTE-FINO.md`), adaptado ao site.

**A rodada:**

1. **Inventário:** o caminho inteiro do orçamento novo, no celular 390 primeiro e depois no computador.
2. **Análise:** pelo menos dois revisores independentes, que não veem o parecer um do outro. Cada um percorre a lista abaixo por conta própria, com fotos e quadros da página real.
3. **Juntar:** cada achado vira uma linha na tabela da rodada, com onde, o achado, a gravidade (obrigatório ou opcional), a correção e quem confere.
4. **Correção:** cada correção vai em PR com o processo de sempre.
5. **Conferência:** a correção é conferida na página real. A que não resolveu volta para a rodada seguinte.

**Fim:** **duas rodadas seguidas sem nenhum achado obrigatório**, com revisores diferentes a cada rodada. Só então vêm o teste dos 2 amigos do dono e a promoção (do dono).

**A lista** (cada item: ok, achado ou não se aplica):

- **A tela:** leitura de relance; nada cortado nem sobreposto; vãos iguais; sem blur nem brilho suave; o movimento aprovado intacto. Celular 390 e 320 primeiro, depois 768, 1280 e 1440.
- **O Zero em conversas reais e difíceis:**
  - insiste no preço logo de cara;
  - "é golpe?";
  - cliente irritado;
  - área de saúde (regulada);
  - tentativa de dar ordens ao sistema;
  - pede uma pessoa;
  - muda de ramo no meio;
  - escreve em vez de tocar.
- **O mapa do caso:**
  - as 5 estruturas;
  - a unicidade, incluindo dois negócios do mesmo ramo com histórias diferentes;
  - o "Ficou certo?" e o ajuste;
  - legível para um leigo de relance.
- **O momento do preço:** o valor só depois do caso; a exceção do pedido repetido; recarregar com o valor já dado.
- **O pedido na conversa:** o cartão de aceite (LGPD, o texto, o "Corrigir", o link da política) e o caminho sem IA (sem chave, limite, "Seguir tocando").
- **Acessibilidade:** teclado, leitor de tela, contraste, 200% de zoom e movimento reduzido.
- **Tempo de resposta:** a mediana e o pior turno, medidos.
- **Os textos:** voz humana em todas as falas fixas, no resumo fixo, no aceite e nos avisos.

**Custo:** as conversas reais do pente fino entram no teto de testes do dono; se for passar, aviso antes.

**Registro:** os achados, as correções e as rodadas ficam em `docs/superpowers/pente-fino-orcamento.md` (neste repositório, sem dado de cliente). A sessão principal recebe o arquivo quando as duas rodadas limpas fecharem.

## 10. Os PRs (na ordem, um por vez, porque os arquivos se cruzam)

Todos são nível 3, exceto onde dito. Cada um traz teste visto vermelho, revisão de código e de segurança por agentes diferentes, suíte inteira, checks lidos um a um e `--match-head-commit`.

| PR | O quê | A produção fica coerente? |
|---|---|---|
| 1 servidor do fluxo | Tudo da seção 6, mais o simulado e os testes (`zero.test.mjs`, `consultor.test.mjs`, `formulario-api.test.mjs`) | Sim. A página velha não manda `respostas`. No Zero de hoje (o "Prefere conversar?"), o valor passa a vir depois da dor, salvo pedido repetido. A planta só existe com a flag. |
| 2 página | A seção 1: conversa primeiro, toques, modo sem consultor e radar com retenção, mais os textos da seção 2 (com `ABERTURA_PADRAO`, `sites.html`, metas), a política (seção 8), a saída de `#o-perguntas` e o módulo dos controles do painel. O E2E (`docs/e2e-orcamento.mjs`) é reescrito para a conversa, nos dois modos. Até o PR 3, o "Quero" com IA só rola até o formulário de hoje, que ainda abre sozinho com a estimativa. | Sim |
| 3 pedido | Seção 5: os passos 8a-8e, o formulário que deixa de abrir sozinho, `pedir_contato` no 8a, os textos do prompt sobre o formulário e o teste do telefone | Sim |
| 4 composição: servidor | Esquema v3, validação, prompt da escolha da estrutura, planos padrão v3 e o teto de versões; com o v2 ainda lido | Só com a flag |
| 5 composição: desenho | O laboratório das 5 estruturas (imagens para o dono), o desenho e a animação por estrutura, o esboço sem tracejado, o "Ficou certo?" e o ajuste. Nível 2 nos módulos `js/planta-*`; nível 3 onde tocar `js/orcamento*` | Só com a flag |
| — | Teste com a IA real (seção 9), relatório e imagens para o dono | Não |
| 6 JEV | Seção 8B: 6a gabarito `g2`, conjunto separado e medição; 6b as perguntas novas em sombra | Só mede (sombra) |
| — | Vídeos da página real | Não |

## 11. Riscos, medidas e fora de escopo

- **Conversão: medir antes de afirmar.** `js/metricas.js` está desligado, e ligá-lo é decisão de privacidade do dono. A medida objetiva do PR 2 é:
  - passos até o valor;
  - caracteres obrigatórios antes do valor (hoje: 3 telas e a cidade; novo: um texto curto ou toques).
- **O tempo até o valor sobe** de instantâneo para ~1 minuto com a IA real. É o pedido do dono (opção A). O radar se preenchendo é a resposta ao risco de a pessoa sair. Medir na seção 9.
- **A IA para todo visitante** aumenta o custo diário. Os tetos de hoje seguram, o alarme avisa e o modo sem consultor não deixa ninguém sem saída.
- **Fora desta frente:**
  - pagamento, ajustes, escopo, entrega, painel do dono, captação e a página `/automacao`;
  - ligar `metricas.js`;

## 12. O que o dono pode querer mudar (sem bloquear o trabalho)

- As falas exatas do Zero nos passos 1 a 4, e o texto do aceite (rascunhos acima).
- A cidade fora das perguntas fixas.
- A exceção "pediu o preço duas vezes, o valor sai".
- As 5 estruturas do mapa e o desenho de cada uma (imagens do laboratório antes do PR 5).
- A migration da versão do aceite (pré-condição do PR 3): ele aplica no banco de teste e no real.

## Anexo A: o que a revisão 1 mudou

**Do arquiteto:**

- **Ordem do turno.** O ESTADO é calculado no começo do turno, então o valor e a planta saem no turno que já começa com o caso entendido (seção 2); os toques práticos passaram para antes da dor, então todos chegam no 1º turno. O `ler_caso` nunca roda no turno do valor.
- **O formato** deixa de ser exigido pelo `casoEntendido`.
- **O `estimar`** fica na lista (cache) e é recusado pelo agente. O trecho do prompt "preço logo de cara" muda, e a "faixa da tabela" sem estimar saiu.
- **O `acao=toque` saiu.** Exigiria migration, gravaria padrão inventado e criaria pares de mensagens com efeitos colaterais (`posicaoDaFala`, janela de 12, `semPerguntaRepetida`, abertura duplicada). As respostas agora vão junto da `mensagem` e do `confirmar-pacote`, sem migration.
- **O radar.** A retenção mora em `estadoDoEscopo`. Com IA, o "Quero" não chama `confirmar-pacote`. Quem chama o `simular` está definido.
- **Os controles do painel** ficam, num módulo próprio.
- **A tabela do modo sem consultor** foi corrigida (disjuntor, limite do dia e 429 só aparecem no `mensagem`).
- **O passo 8.**
  - O formulário deixa de abrir sozinho.
  - Recarregar: "com o pedido intacto" era errado.
  - Os textos do prompt sobre o formulário mudam junto.
  - A garantia ficou restrita ao telefone e ao "como quer ser chamado".
  - Faltavam "como quer ser chamado" e as 5 redes no 8d.
- **A ordem dos PRs.** `ABERTURA_PADRAO` vai no PR da página. "O Zero hoje abre depois do preço" estava errado.

**Do revisor de segurança:**

- A garantia "nada do passo 8 vai à IA" era falsa e foi restringida (seção 5).
- O "Outro" nunca vira mensagem (seção 6.1).
- O esquema das respostas é fechado e sem `cidade`; o 400 e os logs não refletem valor.
- O teste do telefone verifica três lugares, não um.
- O cartão de aceite traz o resumo com "Corrigir", o que se guarda, a finalidade e os prazos.
- A política é reescrita e publicada junto com a página.
- O texto do mapa tem filtros de redação, marcador, dígitos e preço, com o corte depois da redação.
- O `detalhes` é enviado uma vez, e o Turnstile tem estado de falha na conversa.
- O alarme de custo entrou.
- **Não confirmado: o IP forjável na Cloudflare.** A borda do Worker apaga o `x-forwarded-for` do cliente e o refaz a partir do `cf-connecting-ip` (`cloudflare/rotas.mjs:57-68`).
- **A versão do texto aceito** exige migration. Na revisão 2 ficou como proposta ao dono; a revisão 3 a tornou pré-condição do PR 3 (Anexo B, N6).

## Anexo B: o que a revisão 2 mudou (re-revisões)

**Do arquiteto:**

- **O turno do valor** ficou mal definido. Os toques práticos passaram para antes da dor, então todos chegam no 1º turno e o valor sai no primeiro turno que começa com o caso entendido (o 1º ou o 2º). O `ler_caso` nunca roda nesse turno, e o `estado` devolve `valor_liberado`.
- **As travas de texto da planta** recusariam as palavras dela. As origens vão por código, a palavra "Hoje:" é da tela e os campos do "hoje" têm regra própria, com teste.
- **v2 e v3:** a distinção é por `estrutura` contra `topologia`. O v2 fica só para leitura, o `plantaParaModelo` ganha a forma do v3, o cliente ignora a versão desconhecida e os PRs 4 e 5 entram em sequência.
- **A fala do "Mudar"** é montada pelo módulo comum de rótulos e conferida pelo servidor, o que mantém a deduplicação.
- **Os toques** ficam guardados no cliente até o turno entrar.
- **Linhas do prompt corrigidas**, e a mudança do prompt aprovado vai ao dono antes de entrar, junto com a descrição da ferramenta da planta.
- **A regra da liberação do valor** está escrita: com IA, nunca o valor do `simular`; ao recarregar, na hora; na exceção, sem mapa.
- **"Está certo"** deixa de chamar turno. No PR 2, até o PR 3, o "Quero" com IA rola até o formulário de hoje. "Seguir tocando" depois de uma estimativa do Zero nunca chama o `confirmar-pacote`.

**Do revisor de segurança:**

- N1: `respostas` só com o preço aberto, com 409 nas outras etapas.
- N2: `pareceInjecao` no "Outro".
- N3: quando o cliente manda `respostas`, com teto de 4 "Mudar".
- N4: os fechamentos do esquema v3 (ids, referências, mapeamento por tabela, bytes com 6 versões, revalidação na leitura, nó oculto para o leitor de tela).
- N5: o cartão de aceite deixou de dizer "não passamos para ninguém".
- N6: a versão do aceite **exige migration** (a função de eventos só aceita 2 tipos). Ela virou pré-condição do PR 3, aplicada pelo dono.
- N7: "Quero ajustar algo" só com a planta editável, e o pior caso de custo entra no alarme.

**Da re-revisão de segurança da revisão 3:**

- N3b: a contagem do teto de "Mudar" sai do histórico.
- N6b: o cliente diz a versão que viu, e o servidor só aceita a vigente, com 409 para a antiga.
- R1: as travas de promessa e resultado continuam nos campos do "hoje".
- R2: a política tem de citar a finalidade nova do JEV antes de qualquer nível acima de 0.
- R3: o custo da sombra entra no alarme.
- R4: o "uma vez só" do adiamento é derivável do histórico.
- R5: código de origem desconhecido vira "outro".

**Da re-revisão do arquiteto da revisão 3:**

- O 2º turno não depende do modelo: o 1º turno de texto tem `proximoPasso` próprio, e a rede no código conta o caso como entendido.
- Um predicado só, `turnoDoValor`.
- O texto escrito antes do passo 4 tem caminho definido, e `respostas` vale em qualquer turno de preço aberto.
- `presenca.site_atual` entra no briefing, sem migration.
- JEV:
  - o `codigo_ok` recusa as perguntas de escolha, o que pede migration no PR 6b;
  - o adiamento lê o sinal gravado no turno anterior;
  - o `observarNaSombra` passa a receber o plano.
- PRs 4 e 5: o dono é avisado para não promover entre os dois.
- O teste mede a taxa de "hoje" recusados pela trava de prazo.
