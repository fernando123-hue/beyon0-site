# As peças dos serviços (2026-10-14)

Pedido do dono, com três imagens de referência (sites, automações, atendente de IA):

> "ao invés de imagens estáticas nós vamos criar nossos próprios elementos interativos dentro do site.
> Vamos tentar fugir do padrão mas sem deixar o site lento… Faça uma por vez, tire a essência, faça
> pesquisas sobre como os melhores do mundo fazem, e forme algum elemento, alguma 'obra de arte' que
> represente a ideia daquela imagem, que seja claro para o usuário… gerando conversão de leads, gerando
> confiança e desejo."

Lugar: os três cartões de `#frentes` no Hub (`index.html`). Hoje só o de Sites tinha visual (a janelinha em
CSS, só no desktop). Regras que valem para as três peças:

- nada de copiar o AI Core (o dono: "não quero de forma alguma que você replique");
- sem desfoque e sem brilho difuso (memória do dono); traço nítido de 1 px, como o resto do site;
- celular primeiro: a peça aparece e funciona no celular (antes, o celular não tinha visual nenhum);
- leve: HTML, SVG e CSS; JS pequeno que só acorda com a peça na tela; só `transform`/`opacity` em
  movimento contínuo; nenhuma variável de CSS por quadro;
- nada se move sozinho em repouso: uma demonstração na primeira vez, depois só com a mão do visitante;
- movimento reduzido: a peça aparece pronta e parada, e continua usável;
- zero dado inventado: a peça demonstra, não promete número.

## 1. Sites — "A Planta"

**Essência da referência:** o mesmo site no computador e no celular, bem montado e rápido (o raio com
linhas de velocidade, a malha de construção com pontos nas cruzes).

**A peça:**
- **A planta:** um mini site desenhado como planta, em traço fino. Quando a peça entra na tela, a luz
  desce e "imprime" o site. É a assinatura do site ("a luz passa e imprime"), agora contando a construção.
- **A régua:** embaixo, uma régua (o mesmo vocabulário da cota do H1). Arrastar de 360 a 1440 px
  reorganiza o mesmo site ao vivo:
  - no computador: menu com links, título e foto lado a lado, quatro recursos;
  - no tablet: o menu vira ícone e o hero empilha;
  - no celular: uma coluna e botão inteiro.

  Abaixo de 600 px a moldura vira celular: a barra do navegador recolhe e aparece o recorte da câmera. Ao
  cruzar uma faixa, os blocos deslizam para o lugar novo (FLIP) em vez de pular. Uma marca na régua mostra
  "sua tela", a largura de verdade de quem está vendo.
- **O nome:** o campo "Seu negócio aqui" põe o nome do visitante na marca e no endereço do mini site.
  Ver o próprio nome num site pronto gera desejo, e é o mesmo gesto da prospecção, que manda modelos por
  nicho com o nome do negócio. O nome não sai da página.
- **A primeira vez:** depois de impressa, a peça mostra uma vez que encolhe até o celular e volta para o
  tamanho da tela de quem está vendo. Qualquer toque cancela essa demonstração.

**Pesquisa:**
- Peças premiadas (Awwwards) animam só `transform`/`opacity`, orquestram a sequência de entrada e testam
  em celular fraco.
- Demos interativas de produto não dependem de hover no toque (Navattic, componentes do Framer).
- As container queries estão maduras para produção. Aqui elas são o próprio layout do mini site: a demo
  usa a mesma técnica que entregamos.

**Custo:** `css/peca-sites.css` e `js/peca-sites.js`, sem canvas e sem imagem. A moldura é um bloco de
cerca de 60 nós, com `contain: layout paint` no palco.

### Rodada 1 da crítica (três críticos independentes: júri, motion, celular e conversão)

Notas: júri 6,0; celular e conversão 6,5. A peça foi chamada de "competente, mas não é obra de arte". Os
achados que mudaram a peça:

- **A assinatura passava sem ninguém ver.** A impressão rodava uma vez, cedo (com 40% do palco à vista, no
  meio da rolagem). O que mudou:
  - a entrada só acontece com 60% do palco à vista e a rolagem parada;
  - tocar a régua desmonta o site em planta (a grade de 12 colunas aparece) e soltar faz a luz imprimir de
    novo, sempre pela mão de quem vê;
  - parar de digitar o nome faz a luz atravessar e imprimir o nome, que passa por ciano e seca (a "tinta
    molhada" do H1).
- **Não havia próximo passo.** Agora existe "Quero este site para {nome} →", que leva ao orçamento. O nome só
  vai junto (sessionStorage, nesta aba, nunca na URL) se a pessoa clicar. *Pendente, num PR próprio: o
  orçamento pré-preencher o campo do negócio com esse nome (`js/orcamento*.js` é nível 3).*
- **O site de exemplo era genérico.** Agora há o tipo de negócio (clínica, escritório, loja, entidade). Cada um
  troca o título, os botões e o endereço, e o nome entra no título ("Sua consulta na Clínica Sorriso…"). É o
  mesmo gesto dos modelos por nicho da prospecção.
- **O parágrafo prometia "a prova de velocidade" e a peça não mostrava.** Agora mostra a primeira tela desta
  página, medida no aparelho de quem vê (FCP). Ela só aparece até 2,5 s, o "bom" do Google. Acima disso, a
  linha não aparece: nada é inventado.
- **Celular:**
  - título e preço vêm antes da peça, na ordem do HTML (no desktop a ordem visual fica a de antes);
  - no dedo, a régua só vira arraste com intenção horizontal (senão é rolagem), e um toque vai à parada;
  - as paradas viraram botões de 44 px, que o leitor de tela consegue usar;
  - o ímã é medido em pixels de tela;
  - ao focar o nome, o campo sobe e o site de exemplo fica à vista acima do teclado.
- **Coreografia:**
  - a luz é linear e o atraso de cada bloco usa a mesma conta, então o bloco acende quando a luz passa;
  - a demo tem três poses e pousa na largura real da tela ("sua tela");
  - a barra do navegador sai por transform, porque animar a altura dela fazia o conteúdo andar duas vezes.

### Medições (Chromium headless, servidor local; ouro já visto para não disparar a ignição do ouro)

- **Arrastar a régua × mover o mouse no vazio:** 1 × 1 tarefa longa, mediana de 16,7 ms nos dois. As 22 tarefas
  longas da primeira medição eram a ignição do estado dourado, que coincidiu com o teste.
- **Trocar texto com `textContent`:** recria o nó e aciona o MutationObserver do `js/rede.js`, que remede a
  página inteira. A peça só troca o `nodeValue`.
- **Entrada (impressão + demo), sem a peça × com a peça:**
  - **GPU a 1440:** 0 × 0 tarefas longas; quadros acima de 33 ms: 4 × 7 e 0 × 1.
  - **GPU a 390:** 0–1 × 1 tarefa longa.
  - **Só software (sem placa de vídeo) a 1440:** 1 × 8–14 tarefas longas. É o pior caso, raro num aparelho
    de verdade.

  A impressão passou a carimbar cada bloco na hora em que a luz passa (transição de duração 0, só com o
  atraso), em vez de desbotar meio segundo: o palco repinta ~10 vezes, não a cada quadro.
- **Movimento reduzido:** o site tira o `html.js` nesse modo, então a peça usa a classe própria `.is-viva`.
  A peça aparece impressa, parada e na largura da tela.

### Rodadas 2 e 3 da crítica

Notas: júri 6,8 e 7,3; celular e conversão 8,0 e 8,5. O que mudou:

- **Ordem:** a ordem do HTML vale em todas as larguras: título, preço, exemplo, régua, controles ("Agora com o
  seu negócio"), texto e ações.
- **"Quero este site para {nome}":** botão cheio, em Sora, com reticências. Ao lado, "ou peça pelo WhatsApp",
  com a mensagem pronta (a pessoa vê e decide enviar).
- **Carimbo:** sai pela borda de baixo do bloco, medida pelo layout. As palavras carimbam em ciano e secam
  em 500 ms.
- **Arraste:** desmontar só com intenção de arraste. No desmonte, o texto fica cinza e legível, e as 12 colunas
  usam fio de 1 px de tela. A reimpressão leva 600 ms. Um clique longe do cursor desliza até o ponto.
- **A prova:** passa a ser o LCP (é dele o "bom" de até 2,5 s do Google), e o número desce pendurado na luz.
- **"Sua tela":** só aparece quando é verdade.
- **Recursos do site de exemplo:** por nicho. Nada de promessa da Beyon dentro do site do cliente.
- **Apagar o nome** apaga o que ia para o orçamento.
- **A barra fixa e o WhatsApp flutuante** saem enquanto as ações de um cartão com peça estão na tela
  (`js/pagina.js`).
- **Rolagem lateral:** a coluna única dos serviços no celular passou a `minmax(0, 1fr)`, porque um nome longo
  no botão alargava a página. Uma checagem de 320 a 1440 px, no pior caso, ficou sem rolagem.
- **Não feito:** os contornos parados de 390/768/1280. Com a escala por encaixe, eles se sobrepõem de forma
  confusa (o júri concordou que pesa pouco).

## 2. Automação — "O Despacho"

**Essência da referência:** canais diferentes chegam a um centro que organiza e devolve trabalho feito.

**A peça:** uma placa de circuito no vocabulário do site (o barramento de 1 px com chanfro de 45°), com
três canais (WhatsApp, E-mail, Site), o **Agente** no meio e quatro saídas (Sistema, Finanças, Planilha,
Equipe). O visitante escolhe um pedido típico de entidade: 2ª via do boleto, nova filiação, atualizar
cadastro ou falar com uma pessoa.

- **O pacote:** um segmento de 1 × 10 px que corre pela trilha a velocidade constante (0,4 px/ms, linear),
  só por transform. A trilha acende por classe quando ele chega.
- **O agente** é o protagonista: um chip largo, com pinos, que escreve o que está fazendo ("conferindo
  CPF…"). Ele pensa em palavras, e não em luz como o AI Core.
- **O leque:** todas as saídas do pedido partem ao mesmo tempo. Um pedido vira várias tarefas, sem fila.
- **O retorno:** a resposta sobe pela trilha paralela, tracejada, até o canal, que recebe "✓".
- **No boleto, a Equipe fica tracejada e apagada:** "sem ninguém da equipe parar" vira imagem.
- **O registro** numera os passos na ordem real de chegada, e o mesmo número aparece no nó.
- **Honestidade:** a peça é dita como exemplo de rotina e não tem número. O resultado sai em texto normal,
  com o ciano só no marcador (regra 8).
- **O próximo passo:** "Quero o diagnóstico grátis", com o pedido escolhido indo junto por sessionStorage
  só no clique. Ao lado, o WhatsApp com a mensagem pronta. *Pendente, num PR próprio: o formulário de
  `/automacao#contato` usar esse pedido (`js/lead-form.js` é nível 3).*

Rodada 1 da crítica: júri 6,6, chamado de "o diagrama clássico de integração, vestido com a linguagem do
site". Celular e conversão 7,5. O leque, o retorno, o agente que fala, o pacote por transform e a Equipe
livre vieram dela.

## 3. Atendente de IA — "O Plantão"

**Essência da referência:** a conversa no WhatsApp respondida na hora pela IA, e a passagem para uma pessoa.

**A peça:** uma conversa no vocabulário do site, com uma **régua de 24 horas** em cima.

- **A hora de verdade:** a régua começa na hora real de quem está vendo (o relógio do aparelho).
- **As perguntas:** o visitante toca numa das respostas rápidas, como no WhatsApp (não outra grade de
  botões). O atendente "digita" e responde no mesmo minuto da régua.
- **O gesto:** arrastar até a madrugada tira a equipe do ar (o expediente de exemplo é das 8h às 18h) e
  escurece a tela. O atendente continua respondendo.
- **"Quero falar com uma pessoa":** no expediente, chama a pessoa certa. Fora dele, deixa o resumo para a
  equipe, e uma mensagem de sistema mostra o resumo, com o assunto da última pergunta e a hora.
- **Ligação com a Planta:** se a pessoa pôs nome e tipo de negócio na peça de Sites (evento
  `bz:negocio`), o atendente aparece com esse nome e com as perguntas do tipo dela.
- **Dados do negócio:** entram como **[espaço reservado]**, marcado, nunca inventado: preço, convênios,
  horários.
- **O próximo passo:** "Testar 10 dias grátis", no WhatsApp com a mensagem pronta (com o nome, se houver).

## Estado e retomada (2026-10-15)

**Dono:** "Quero que continue aprimorando agora somente a parte dos sites, as outras duas estão maravilhosas".
- **O Despacho e O Plantão estão APROVADOS:** não mexer neles sem pedido.
- **A Planta continua em aprimoramento.**

**Onde está:**
- branch `pecas-servicos` (worktree `03 Projetos/site-logo`), último commit `25a8d6b`, enviado; sem PR ainda;
- prévia da Vercel: `beyon0-site-git-pecas-servicos-beyond0.vercel.app` (pede login da conta do dono);
- servidor local: `node docs/servidor.mjs . 8897`.

**Ferramentas de verificação** (scripts no scratchpad da sessão; recriar a partir desta descrição se sumirem):
- `checar.mjs`: rolagem lateral de 320 a 1440 px no pior caso;
- `quadros.mjs <largura>`: sequências de quadros dos momentos principais;
- `medir-pecas.mjs`: A/B com GPU e CPU 4× a 390 px, sempre rolando até o topo de cada cartão;
- `rastro.mjs` e `camadas.mjs`: linha do tempo do navegador.

Ao medir, ponha `sessionStorage bz-ouro=1`, para a ignição do ouro não entrar no teste.

**Críticos usados:** júri de prêmio, diretor de motion, celular e conversão. As notas da Planta, por rodada:

| Rodada | Júri | Celular e conversão |
|---|---|---|
| 1 | 6,0 | 6,5 |
| 2 | 6,8 | 8,0 |
| 3 | 7,3 | 8,5 |
| 4 | 7,8 | 8,5 |
| 5 | 8,3 | 8,7 |

**O que ainda falta na Planta** (da rodada 4 dos críticos):
1. A cota do LCP pendurada na luz nunca foi vista numa captura (o headless passa de 2,5 s). Ver num celular de verdade ou com rede rápida, e conferir se dá para ler sobre a luz.
2. A tinta que seca na marca do topo quase não aparece; dar mais contraste.
3. Parada, a peça ainda lê "um navegador". Ideias do júri:
   - uma cota de largura colada embaixo da moldura (linha de 1 px com riscos nas pontas e "390 px"), que acompanha a largura por `scaleX`;
   - ou um contorno fantasma tracejado do tamanho de onde o arraste começou.
4. Continuidade: um selo "para {nome}" nos cartões quando há nome.
5. Teclado num celular de verdade: confirmar que o palco grudado funciona.
6. A demonstração ainda muda a largura a cada quadro. É uma exceção medida: no aparelho lento é pulada.

**PRs pendentes, separados (nível 3):**
- `/orcamento` pré-preencher o nome e o nicho (`bz-planta-nome`, `bz-planta-nicho`, apagando ao ler);
- `js/lead-form.js` usar `bz-despacho-pedido`.

**Antes de mesclar:**
- trazer a `main` (memória `atualizar-com-main-antes-de-mesclar`);
- abrir o PR com as revisões técnica e de segurança;
- o dono promove na Vercel.

### Atualização (2026-10-15, antes do /clear)

**"Universal primeiro" aplicado nas três.** O dono pediu uma abordagem "menos especifica porém precisa, pra
quem quer que seja" e escolheu a opção "Universal primeiro" (registrado em `01 Empresa/Decisões.md`).

- **Planta:**
  - abre com o título "Seu cliente te encontra, entende e chama em 1 minuto.";
  - os tipos, opcionais, passaram a ser Serviços · Comércio · Saúde · Organização (chaves `servicos`,
    `comercio`, `saude`, `organizacao`);
  - o exemplo de nome é "Studio Aurora".
- **Despacho:**
  - pedidos: Pedido de orçamento · Cobrança / 2ª via · Cadastro de cliente · Relatório do mês (chaves
    `orcamento`, `cobranca`, `cadastro`, `relatorio`);
  - a entrada roda `cobranca`;
  - o WhatsApp fala em "no meu negócio".
- **Plantão:**
  - o padrão é Quanto custa? · Tem horário amanhã? · Onde fica? · Quero falar com uma pessoa;
  - as perguntas acompanham os tipos novos da Planta.

**Verificado:** `csp.test.mjs` passa; sem rolagem lateral de 320 a 1440 px no pior caso.
**Não refeito depois desta troca:** a suíte completa, a acessibilidade e os críticos. Rodar ao retomar.

**Scripts de verificação** copiados para `docs/pecas/`:
- `checar.mjs`, `quadros.mjs`, `plantao.mjs`, `medir-pecas.mjs`, `rastro.mjs`, `camadas.mjs`, `perfil-pecas.mjs`
  e `entrada.mjs`;
- os caminhos de saída (`OUT`) apontam para o scratchpad da sessão antiga: trocar ao usar;
- eles usam o Playwright de `03 Projetos/site/node_modules` e o servidor local na porta 8897.

**Próximo passo (pedido do dono):** continuar aprimorando SÓ a Planta (Sites), com os pendentes da lista acima,
seguindo o "universal primeiro". O Despacho e o Plantão estão aprovados: não mexer sem pedido.

### Rodada 5 da Planta (2026-10-16) — ESTADO ATUAL, ler primeiro

**Feito (commit desta rodada, branch `pecas-servicos`):**
- **Computador cabe inteiro:** os recursos do site de exemplo saíam cortados no meio da palavra entre 960 e 1440 px
  (7 a 72 px fora da moldura). Título `min(62px, 4.9cqi)`, hero mais justo, foto 380 px. Medido: todos os nichos e
  nomes, de 920 a 1440 px, com folga ≥ 8 px. Tablet e celular continuam mostrando só a primeira tela (realista).
- **Tinta do nome (pendente 2):** `.pl-seca` segura o ciano 40% de 0,9 s antes de secar; a marca do topo agora mostra.
- **Cota da moldura (pendente 3):** `.planta__medida`, dois trechos de 1 px (scaleX) com a medida no vão e riscos de
  9 px nas pontas (translateX), 10 px abaixo do pé da moldura; a moldura sobe `COTA_RESERVA/2` (28 px reservados).
  Tudo em `encaixar()`, só transform. O número saiu do cursor da régua (duas vezes a 40 px era ruído): o cursor só diz
  "sua tela".
- **Prova:** `.servico p.planta__prova { max-width: none }` (o 44ch de `cartoes.css`, medido em mono, espremia a
  frase em 3 linhas); o `[hidden]` subiu junto para continuar vencendo.
- **LCP pendurado na luz (pendente 1):** visto pela primeira vez numa captura (1,3–1,7 s a 390 px): legível, chip opaco.
- Scripts de `docs/pecas/` aceitam `OUT=<pasta>` no ambiente.

**Verificado:** `verificar` OK (1ª rodada teve LCP de 11 s em `automacao`, página sem a Planta; 2ª rodada toda OK),
acessibilidade 23 OK, `csp.test.mjs` OK, sem rolagem lateral de 320 a 1440 px. A/B celular médio (GPU + CPU 4×, 390 px,
entrada + demo + arraste, 3 rodadas, antes = HEAD servido por rota): tarefas longas mediana 5 × 3; quadros > 33 ms 38 × 40
(ruído).

**Revisão e crítico da rodada 5 (refeitos depois da passagem, 2026-10-16):**
- **Revisão de código:** APROVAR COM AJUSTES. Feito no commit `b8d22d3`:
  - o título em `cqi` ficou só no computador (`@container planta (min-width: 900px)`); no tablet o nome longo caía
    para ~25–31 px;
  - a cota anda em pixel físico inteiro, contado da página (`px(v, base)`, `medida.centro`/`medida.topo`);
  - a letra da cota é medida de novo em `document.fonts.ready`;
  - saiu o `[hidden]` redundante da prova.
- **Crítico visual (júri 8,3, celular 8,7):** a cota ajuda (pendente 3 resolvido) e a tinta do nome aparece (pendente 2
  resolvido). Corrigido em seguida:
  - **o tempo "1,0 s" caía em cima do botão e da foto no celular** (o `Math.min` o empurrava para dentro da
    moldura). Agora: ao lado da moldura se cabe; senão no canto de baixo do palco, quando a luz chega ao pé; senão
    (computador com palco justo) na borda direita como antes;
  - o rótulo "4 colunas" sumia devagar por trás da reimpressão: agora some na hora;
  - "até 2,5 s" não quebra mais sozinho na última linha (espaço inquebrável).
- **Não feito, de propósito:**
  - bolinha da régua maior: no toque ela já tem 24 px e a régua inteira (34 px de altura) recebe o dedo; o crítico
    viu a versão de mouse do headless;
  - **sugestões de estilo para o dono decidir** (não mexem em defeito):
    - J2, a moldura no meio da demonstração mostra a foto por cima do título por um instante; o crítico sugere o
      estado "desmontando" (cinza) também na demonstração;
    - J3, sublinhar o número da cota (convenção de "fora de escala");
    - J4, riscos a 45° nas pontas da cota, para ela não parecer uma segunda régua;
    - J5 e M3, letras do site de exemplo pequenas (6–8 px) e o celular de exemplo ocupando 41% do cartão;
    - M4b, a luz vertical passa entre as letras de "AGENDAR" num quadro.
  - fora da Planta: o ponto que viaja da peça do fio passa por cima da borda da moldura a 1440.
- **Verificado depois das correções:** `verificar` 22 OK, acessibilidade 23 OK, `csp.test` 8/8, sem rolagem lateral
  de 320 a 1440 px. Quadros em 390 e 1440 conferidos a olho (o tempo no canto não colide nem com a demonstração em
  andamento).

**Retomado em 2026-10-16 (tarde), commit `b15d7b4`:** revisão de código das correções do crítico (agente
diferente do autor): APROVAR COM AJUSTES, sem crítico/alto. Feito: no movimento reduzido a moldura pousa antes de
`provar()` medir. Medido antes de mexer (script de amostras a cada 25 ms, 320–1440 px, com e sem movimento
reduzido): o tempo NÃO encosta na cota em nenhum quadro; só o comentário foi corrigido. No tablet/computador ele
passa sobre a borda direita da moldura (caso 3, de propósito). Verificado: acessibilidade 23 OK, `csp.test` sem
falha, `checar.mjs` sem rolagem lateral/erros 320–1440, fotos 390 conferidas. `verificar` falhou só por tempo em
páginas sem a Planta, com o processador em 100% (outras sessões): **rodar de novo com a máquina livre antes do PR.**
Prévia: https://beyon0-site-dd0qfd537-beyond0.vercel.app. **Próximo:** passos 3 e 4 abaixo (dono vê no celular e
decide J2–J5; depois PR).
- **Decisão em aberto (perguntada ao dono em 16/10, sem resposta antes do clear):** quais das sugestões J2, J3, J4 e
  J5 aplicar ("nenhuma" vale). Com a resposta: aplicar, re-rodar `verificar` com a máquina livre, `checar.mjs`,
  revisão por agente diferente, trazer a `main` (o #43 pode ter entrado), abrir o PR.
- **Ferramentas:** `docs/pecas/colisao.mjs [reduzido]` mede, a cada 25 ms, se o tempo encosta na cota ou na moldura
  (320–1440 px; servidor na 8897). Prévia local pelo painel: entrada `pecas-servicos` (porta 8897) no
  `.claude/launch.json` da raiz do Vault.
- **Armadilhas:** o painel do navegador em segundo plano não dispara a entrada da Planta nem registra LCP (medir no
  headless); a 1ª página de cada navegador headless tem LCP enorme (70 s) e esconde a prova — não é defeito;
  `verificar` com o processador em 100% falha em lugares diferentes a cada rodada.
- **Skills sugeridas:** `processo-qualidade` (antes do PR), `revisao-ui` (se aplicar J2–J5).

**Interrompido pela 2ª passagem automática (2026-10-16):** a revisão de código das correções do crítico (o tempo no
canto, o rótulo "4 colunas", o "até 2,5 s") foi lançada e parada antes de responder.

**Próximo passo exato:**
1. revisar o diff do commit "fix: Planta rodada 5 — correções do crítico visual" (`git show HEAD -- js css`) com o
   agente code-reviewer; o que olhar: o caso de movimento reduzido no chip (fica sem `opacity`?), o
   `fill: 'both'` com opacidade 0 durante o atraso, colisão no canto durante a demonstração, leitura de layout em
   `offsetWidth` logo após `hidden = false`;
2. corrigir o que apontar, e rodar de novo `verificar`, `acessibilidade`, `csp.test` e `docs/pecas/checar.mjs`
   (servidor: `node docs/servidor.mjs . 8897`);
3. mostrar ao dono (celular primeiro) e perguntar das sugestões J2–J5;
4. abrir o PR da branch `pecas-servicos` com as revisões técnica e de segurança (trazer a `main` antes; em
   2026-10-16 a branch estava em dia com `origin/main` `caec5eb`).

**Ainda pendentes:** 4 (selo "para {nome}" nos outros cartões: mexe no Despacho/Plantão, aprovados → só com pedido do
dono); 5 (teclado num celular de verdade); 6 (exceção medida). Defeito antigo visto, não corrigido: a borda da moldura
(1/escala px) entra na largura do container, então entre 600–606 e 900–906 px o JS diz uma faixa e o CSS mostra a
outra; o ímã quase nunca para ali. Correção possível: borda num `::after` sobreposto. PRs nível 3 seguem pendentes.

**Armadilha do ambiente:** no Git Bash, encadear vários `node` com pipe às vezes dá `fork: Permission denied`; rodar
um comando por chamada e mandar saída para arquivo.
