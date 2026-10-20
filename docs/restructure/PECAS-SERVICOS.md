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

**Passagem 2026-10-20 (10ª) — #44 MESCLADO; direção C escolhida; o dono escolhe o número do cartão:**
- Feito: PR #44 mesclado (`f6cf7da` = `main`; SHA para promover comentado; corpo com a pendência da pilha 2: o card
  acende ~24 px antes de assentar porque algo acima da pilha cresce depois da medição do ScrollTrigger — PR próprio
  depois). Direções A/B/C mostradas (`d7039a9`); o dono escolheu a **C** e pediu um número "menos genérico" (Decisões.md,
  20/10). Prévia do número na branch `cartoes-direcoes` (`7879625`, com a `main` trazida):
  https://beyon0-site-git-cartoes-direcoes-beyond0.vercel.app/cartoes-direcoes — Atual / 1 Contagem ("01 / 03") /
  2 Grande (Sora 300) / 3 Na linha (número na borda, a luz sai dele). Contorno vazado descartado (vira "tubo").
- **Próximo passo exato:** registrar a escolha do número em Decisões.md; implementar C + número em `css/cartoes.css`
  (e o HTML que precisar) em PR próprio a partir da `main`, celular primeiro. A luz da C na prévia usa `offset-distance`
  (thread principal): no site, outra técnica (traço por `transform`, como a `.energia-volta`) ou medida. Cuidados da
  implementação em `docs/restructure/CARTOES-DIRECOES.md`. Tirar a página de prévia ao implementar. Revisão por outro
  agente, verificar/acessibilidade/pilha-celular, checks um a um, mesclar pelo processo.
- Ambiente: Git Bash quebrado; comandos pelo vigia deste worktree (`.superpowers/sh/COMO-RODAR.md`; a aba "vigia
  site-logo (não fechar)" não pode ser fechada). `gh` pela credencial do git (`gh-com-git.ps1`). Headless shell do
  Playwright sumiu: Chrome instalado via `.superpowers/sh/com-chrome.mjs`. Dono: não pedir permissão (Decisões.md, 20/10); não abrir
  abas de terminal nem gravar fora de `C:\Vault - Fernando\Beyon Zero`.

**Passagem 2026-10-16 (noite, 9ª) — #44 com tudo e provado; próximo: dono no celular, mesclar; depois o visual dos cartões:**
- Feito desde a 8ª: revisão do `acf9d1b` com ajustes em `0357fd7` (transição do coberto, carga morta do celular fora;
  carga do desktop conferida com mouse: enche a 100 % e acende as letras); corpo do #44 reescrito com a pilha B, a
  Planta, os vermelhos e as revisões; **`verificar` no `0357fd7`: 77 OK e 1 FALHA de ruído** (`sites` desktop LCP 51,3 s com a CPU a 100 %, wallpaper e Roblox abertos; remedido sozinho em 4 cargas: 1404/1212/11128/900 ms, `sites-cel` 716 ms); CI do `0357fd7` todo verde; `main` parada em `5f11339` (já contida).
- **Próximo passo exato:** (1) FEITO (CI verde; repetir só se entrar commit novo); (2) o dono vê a prévia
  no celular (pilha B com letras; Planta) — ela está atrás do login da Vercel, só ele abre; (3) trazer a `main`
  (`git fetch`; se andou, mesclar e retestar: unidade, `pilha-celular.mjs`, `legivel.mjs`, `checar.mjs`), tirar do
  rascunho (`gh pr ready 44`) e mesclar pelo processo ([[main-liberada-com-processo]]); avisar a sessão "Beyon Zero".
- **Depois (decisão do dono, 16/10, Decisões.md):** reformular o VISUAL DOS CARTÕES em geral, em PR próprio, mostrando
  2–3 direções antes de implementar (skill `referencias-visuais`; ele não deu referência, só "não estão me deixando feliz
  faz um tempo"). Já levantado: o módulo de hoje empilha sinais — borda com luz de canto (tiras de 1 px), aresta de cima
  no foco, marcas de canto em L, número mono + traço, link mono, e no desktop a carga (barra/aro/letras), a volta de
  energia e as estações. Pontos aprovados a PRESERVAR: módulos separados com vão e a conexão do campo (03/10), estações
  (desktop), carga do desktop (04/10, "B e D"), a pilha B (16/10), identidade V4, sem desfoque, regra 8 do ciano.
  Primeiro passo: fotos de cada grupo (hub: faixa do hero, laudo, serviços; sites: formatos, spec; automação: malha,
  cenários, FAQ) a 390 e 1440 com movimento reduzido, diagnóstico curto e uma página com o mesmo cartão em 3 direções.
- Armadilhas novas: a prévia da Vercel exige login (headless cai em vercel.com/login): testar no servidor local; o fork
  do Git Bash falha com a CPU alta — repetir o comando sozinho, e conferir o que já rodou antes (commit/push podem ter
  passado); arquivos tocados por `git checkout` voltam com CRLF misto (scripts de troca devem normalizar `\r\n`).

**Passagem 2026-10-16 (noite, 8ª) — pilha do celular B e Planta (achado 4, J2–J5), decisões do dono aplicadas:**
- Decisões (01 Empresa/Decisões.md, 16/10): aplicar achado 4 e J2–J5 ("Sim aplique todas as sugestões"); a pilha do
  celular devia MELHORAR (não voltar à publicada: "tendo tanto o atual quanto o do publicado como dados"); entre três
  opções em teste (`b3df92f`, `?pilha=a|b|c`) ele escolheu a **B + letras acesas**. Uma troca direta pelo fichário da
  produção chegou a ser feita e foi desfeita antes de commit (patch fora do repo).
- Achado do teste do dono ("A e B iguais, C sem brilho"): não era disparo, era sinal fraco — o `.is-foco` só trocava o
  número de cor e a borda de 10 % para 18 %. Corrigido em `ebd34b3` (borda inteira ciano 60 %).
- Commits: `acf9d1b` pilha B definitiva (sem parâmetro; sai a pilha antiga com carga/deslize e o gatilho do ouro
  `carga:cheio`; 721–860 px seguem acendendo pelo meio; A/B do desktop 0 diferenças); `e6a9eba` Planta (achado 4: sem
  12ch em uma coluna; J2: demonstração desmontada + reimpressão, `cortarDemo`; J3 cota sublinhada; J4 riscos a 45°;
  J5: palco 1:1,16 no celular fora da digitação, botão/marca maiores — 390: celular 37→42 % do cartão, botão 6,6→9,1 px,
  foto 57→66 px; tentativa de encurtar o celular para 700 descartada: foto 13–17 px); `d1cb6fd` ajustes da revisão
  (blur espera 300 ms antes de o palco crescer).
- Testes novos em `docs/pecas/`: `pilha-celular.mjs`, `legivel.mjs`, `demo-desmontada.mjs`, `digitando.mjs` (todos
  vistos vermelhos antes). Unidade 394/394, acessibilidade 24 OK, varrer/cortes/checar/colisao/clique verdes.
- Revisões por outro agente, todas APROVAR COM AJUSTES, ajustes feitos: `b3df92f`, `e6a9eba` (em `d1cb6fd`) e `acf9d1b`
  (no commit desta passagem: transição de opacidade do título/texto do coberto, CSS/JS mortos da carga no celular —
  fio, doador, seguir —; o "reacender ao girar para 844" já acontecia pelo refresh, ficou só o teste).
- **Próximo:** (2) atualizar o corpo do #44 (pilha nova, Planta, provas acima) e o
  `verificar` com a CPU livre; (3) dono vê a prévia no celular; (4) trazer a `main`, tirar do rascunho, mesclar;
  (5) DEPOIS, decisão do dono: reformular o visual dos cartões em geral — mostrar 2–3 direções antes (PR próprio).

**Passagem 2026-10-16 (noite, 7ª) — revisões publicadas, corpo do #44 com a evidência, `verificar` só com ruído:**
- **`verificar` (código de `d702588`)**, duas rodadas com o processador em 100% (processos do sistema; o fork do Git
  Bash falhava a cada poucos comandos): nas duas, todos os 22 alvos sem preso, sem rolagem lateral, WhatsApp, campo,
  console, travessias e medições OK. Só LCP falhou, e em alvos diferentes por rodada (1ª: `automacao` 41 s; 2ª:
  `sites` 21 s, `resumo` 4,4 s, `autom-320` 7,7 s), todos verdes na outra; Automação e resumo não mudam na branch.
  **Falta uma rodada limpa com a máquina livre antes de mesclar.**
- **Revisão curta do `d702588`** (agente `code-reviewer`): APROVAR, sem achado de correção. BAIXO feito em `8538462`:
  gesto `arrastar` em `interromper.mjs` (o ramo `dx > 8` não tinha teste) — vermelho sem o `largarDeslize()` desse ramo
  (`parou em 1380`), verde 5/5; cabeçalho diz o limite dos ponteiros sintéticos. BAIXOS não feitos: caminho fixo do
  Chromium (os 13 scripts de `docs/pecas/` usam o mesmo) e a checagem da pergunta só por `!hidden`.
- **Publicado no #44:** revisão curta do `2a34d4d` (#issuecomment-6223428748), revisão do `d702588`
  (#issuecomment-6223430811); corpo editado com links das três revisões, os três vermelhos (clique 705→630,
  Plantão 0/4→4/4, arrasto 1380→verde), `clique.mjs`/`interromper.mjs`, acessibilidade 24 e o `verificar` acima.
  Prévia da branch: https://beyon0-site-git-pecas-servicos-beyond0.vercel.app.
- **Próximo passo exato:** (1) ler o CI do head `8538462` (`mcp__ccd_pr__get_status`; o portão de evidência deve
  passar agora); (2) `verificar` limpo quando a CPU baixar (medir antes com `Get-CimInstance Win32_Processor`) e
  atualizar a linha de Regressão do corpo; (3) dono vê a prévia no celular, decide achado 4 e J2–J5; (4) trazer a
  `main` (5f11339, 0 à frente), tirar do rascunho, mesclar.

**Passagem 2026-10-16 (noite, 6ª) — provas do `2a34d4d` feitas, revisão curta feita, Plantão corrigido:**
- **Clique (MÉDIO) provado:** `docs/pecas/clique.mjs` com o código de antes (`3cf763c`, servido de uma worktree
  temporária na 8896): `FALHA clique de 80 ms: parou em 705 (clicado ≈ 630)`; com `2a34d4d`: 630/630/630 nos 3.
  (A prévia antiga da Vercel não serve de vermelho: não mostra `.planta__slider` ao headless.)
- Com `2a34d4d`: unidade 394/394; acessibilidade 24 OK; CI do #44 9 verdes, 1 falha = só o portão de evidência.
- **Revisão curta do `2a34d4d`** (agente `code-reviewer`, NÃO publicada ainda no #44): APROVAR COM AJUSTES. ALTO e
  MÉDIO resolvidos, sem regressão em pointercancel/clique duplo/teclado. Ajustes: rodar `clique.mjs` (feito acima);
  BAIXO Plantão (abaixo, corrigido); BAIXO regex do nome com invisíveis crus (corrigido: escapes + U+061C);
  BAIXO opcionais não feitos: `clique.mjs` lê MIN/MAX fixos 360/1440; `acessibilidade.mjs:44` não confere o valor
  depois do `mouse.up()`.
- **Plantão corrigido** (commit desta passagem): mexer na régua no meio do deslize de entrada matava a 1ª pergunta
  (o `cancelAnimationFrame` pulava o `fim`), e rolar a página com o dedo por cima da régua travava o deslize no meio.
  Agora `largarDeslize()` cancela e roda o `fim`; no toque só larga quando o dedo arrasta (>8 px na horizontal) ou
  toca. Teste novo `docs/pecas/interromper.mjs` (relógio da página fixo em 10:00; gesto disparado de dentro da página
  quando a régua passa de 700 — pelo Playwright chegava tarde com a CPU ocupada). **Visto vermelho** em `335a53c`:
  mouse/teclado/toque "pergunta NÃO chegou", rolar "parou em 710"; **verde** 4/4 (rolar vai a 1380). Depois da
  correção: `csp.test` OK, `clique.mjs` OK, acessibilidade 24 OK. **`verificar` NÃO rodou** (parado pela passagem).
- **Próximo passo exato:** (1) `verificar` com a máquina livre (servidor e teste no MESMO comando, ver CLAUDE.md);
  (2) publicar a revisão curta como comentário no #44 (texto: resumo acima + veredito) e editar o corpo
  (`gh pr edit 44 --body-file`): em "Revisão técnica" os links da revisão da branch
  (#issuecomment-6222579435) e da revisão curta; em "Teste visto vermelho" o clique (705→630) e o Plantão
  (interromper 0/4→4/4); em "Regressão" 394/394, acessibilidade 24, verificar; em "Verificação comportamental"
  `interromper.mjs` e `clique.mjs`; (3) ler o CI (`mcp__ccd_pr__get_status`) — o portão deve passar; (4) revisão
  curta do commit do Plantão por outro agente (diff pequeno: `js/peca-atendente.js`, `js/peca-sites.js:445`,
  `docs/pecas/interromper.mjs`); (5) dono vê a prévia nova no celular, decide achado 4 e J2–J5; (6) trazer a
  `main` (estava em `5f11339`, 0 à frente), tirar do rascunho e mesclar.
- Armadilhas: fork do Git Bash falha (`errno 13`) com a CPU carregada e quando um comando tem `&&` antes de `&`
  (o `&` joga a cadeia inteira para o fundo) — pôr o servidor em linha própria; a página nasce na HORA REAL de quem
  vê (perto das 16h o valor 982 não é deslize); `scrollIntoView` no celular é suave por padrão — usar
  `behavior: 'instant'`; servidor de rodada anterior pode ficar na 8897 (conferir com `netstat` antes).

**Passagem 2026-10-16 (noite, 5ª) — revisão da branch publicada, correções em `2a34d4d`:**
- Revisão técnica da branch inteira (agente `code-reviewer`), APROVAR COM AJUSTES, publicada:
  https://github.com/fernando123-hue/beyon0-site/pull/44#issuecomment-6222579435 (o link AINDA NÃO está no corpo
  do PR: o portão "Nível de risco e evidência" falha só por isso).
- `2a34d4d` corrige o ALTO (arraste da Planta parado com movimento reduzido; visto vermelho `1440 → 1440` e verde
  `1440 → 1043` no teste novo de `docs/acessibilidade.mjs`), o MÉDIO do clique curto e os BAIXO baratos (lista no
  commit). Não feitos, com motivo no commit: leitor do `sessionStorage` (PR próprio) e helper comum às 3 peças.
- Conferido depois: `csp.test` 8/8; sintaxe dos 4 JS; acessibilidade verde até `/automacao.html` sem JS (o run foi
  parado pela passagem antes de terminar e antes do `verificar`).
- **Próximo passo exato:** (1) conferir que a branch subiu (`git status -sb` sem "ahead"); (2) provar o MÉDIO:
  `BASE=<prévia antiga https://beyon0-site-132vpq66k-beyond0.vercel.app> node docs/pecas/clique.mjs` deve FALHAR
  (vermelho) e com o servidor local (`BASE=http://127.0.0.1:8897`) PASSAR — é sensível a tempo, rodar com a máquina
  menos ocupada; (3) acessibilidade inteira + `verificar` + unidade (`node --test` do script `testar`); (4) pôr no
  corpo do #44 o link da revisão em "### Revisão técnica" e as provas em "Regressão" (`gh pr edit 44 --body-file`);
  (5) revisão curta do `2a34d4d` por outro agente (diff pequeno); (6) ler o CI (`mcp__ccd_pr__get_status`);
  (7) dono vê a prévia nova no celular, decide achado 4 e J2–J5; (8) trazer a `main`, tirar do rascunho e mesclar.
- Armadilhas novas: o servidor em segundo plano morre entre chamadas do Bash (exit 127) — rodar servidor e teste no
  MESMO comando (`node docs/servidor.mjs . 8897 & SP=$!; …; kill $SP`); outra sessão roda `e2e-orcamento` e um
  servidor na 8899 (não mexer); a CPU (4 núcleos) fica em 60–100% com explorer/svchost/wallpaper32; `$_` em
  `powershell -Command` dentro do Bash vira lixo — usar `.ps1` no scratchpad.
- Decisões do dono em aberto: achado 4 (título 12ch em 600–759), J2–J5; e se a borda em degradê da grade
  (`mask-image`, não é desfoque) é aceitável.

**Passagem 2026-10-16 (noite, 4ª) — PR #44 aberto (rascunho), head `5073de8`:**
- PR https://github.com/fernando123-hue/beyon0-site/pull/44 (rascunho, vinculado à sessão "Logo da Beyon Zero").
  Corpo já com toda a evidência de nível 2; CI ao abrir: 4 passando, 1 pendente, 0 falha.
- A revisão da branch inteira foi lançada e **parada pela passagem antes de responder**.
- **Próximo passo exato:** (1) relançar a revisão técnica da branch inteira (agente `code-reviewer`, só leitura,
  `git diff origin/main...HEAD`; olhar guards/vazamento de listeners-observers-rAF fora da tela, nome digitado só como
  texto e codificado em sessionStorage/URL/WhatsApp, CSP, slider acessível + movimento reduzido, trabalho por quadro
  no celular, NENHUM blur, integração com `mini.js`/`pagina.js`, código morto entre as 3 peças; saída por linha
  `arquivo:linha — SEVERIDADE — problema — correção` + veredito); (2) publicar o texto como comentário no #44
  (`gh pr comment 44 --body-file …`) e pôr o link em "Revisão técnica" do corpo (`gh pr edit 44 --body-file …`);
  corrigir crítico/alto; (3) `verificar` com a máquina livre (ver armadilha do CHROMIUM 1228 acima) e atualizar
  "Regressão" no corpo; (4) ler o CI um por um (`mcp__ccd_pr__get_status`); (5) dono vê a prévia no celular, decide o
  achado 4 (título 12ch em 600–759) e J2–J5; (6) só então tirar do rascunho e mesclar (trazer a `main` antes).
- Decisões em aberto do dono: achado 4; J2–J5 (sem urgência).
- Armadilha: fork do Git Bash falha muito com a CPU em 100%; um comando por chamada, saída em arquivo.
- Skills: `processo-qualidade` (PR), `revisao-ui` se o dono pedir o achado 4.

**Retomado em 2026-10-16 (noite, 3ª) — revisão do `5df81f5` feita, commits `bd5e886` e `18f2d37` (pushed):**
- Revisão do `5df81f5` (code-reviewer): APROVAR COM AJUSTES. Achado MÉDIO: o deslize (FLIP) não seguia o corte
  novo de 760. Corrigido com `disposicao()` (600/760/900). Medindo, apareceu a causa de fundo (o "defeito antigo"
  abaixo): a borda da moldura entrava na largura do container, e entre 600–603/760–763/900–903 o JS dizia uma faixa
  e o CSS mostrava outra. **Visto vermelho:** de 10 em 10 px, o CSS mudava em 760 e o deslize só disparava em 750
  (idem 600/590). Agora `faixa()`/`disposicao()` medem o `miolo()` (largura − 2 × borda).
- 2ª revisão (`bd5e886`): APROVAR COM AJUSTES, dois MÉDIO, corrigidos em `18f2d37`: a borda lida era a pedida
  (2,46 px) e o navegador usa 2 px — agora lê a computada, só em `espessuras()`; e a classe `is-celular` era
  decidida com a borda velha e o aria com a nova — agora a borda nova vem antes e tudo compara com
  `faixaAplicada`/`disposicaoAplicada`. BAIXO não feitos: `altura()` ainda usa `w < 600` (20 px de altura em
  600–603, invisível); 1ª chamada lê a borda da folha (se corrige no ResizeObserver).
- **Provado:** arrastando a régua de 1 em 1 px (DPR 1 e 2), classe e aria batem com o layout do CSS em todo
  passo, e o deslize dispara em 903→902, 762→761, 603→602, onde o CSS muda (`docs/pecas/cortes.mjs`).
  Varredura da régua sem nada passar do pé; `checar.mjs` sem rolagem/erros; acessibilidade 23 OK;
  `csp.test` 8/8; unidade 394/394.
- **Não feito (visual, decisão do dono):** achado 4 da 1ª revisão — de 600 a 759 px o título ainda tem
  `max-width: 12ch` (4 linhas) e a foto fica uma faixa baixa e larga com barras dos lados. Não corta. Correção
  possível: `.pl-titulo { max-width: none }` no bloco de 759. Também: o rótulo "8 colunas" aparece nessa faixa de
  uma coluna (já era assim).
- `verificar` rodado 2× com o processador em 100% (svchost/WMI/antivírus/Roblox — não são desta sessão): só falhas
  de tempo (LCP/fps/goto 30 s), em páginas diferentes a cada rodada, inclusive sem a Planta. **Rodar de novo com a
  máquina livre antes de mesclar.**
- Prévia do `18f2d37`: https://beyon0-site-132vpq66k-beyond0.vercel.app
- Nível de risco do PR: 2 (sem revisão de segurança obrigatória). Exige: especificação, visto rodando, regressão,
  verificação comportamental, teste visto vermelho, revisão técnica (link de comentário no PR).
- **Próximo passo exato:** abrir o PR (rascunho) da `pecas-servicos`; revisão técnica da branch inteira por agente
  diferente, publicada como comentário; `verificar` com a máquina livre; dono vê a prévia no celular (e decide o
  achado 4 e J2–J5); só então mesclar.

**Passagem 2026-10-16 (noite, 2ª) — corte no celular/tablet e falas de teste, commit `5df81f5`:**
- O dono viu a prévia no celular: no celular e no tablet o exemplo parecia bugado (cortado no pé da moldura;
  medido 215 px e 400 px além) e as falas davam a entender que o exemplo é o site que a pessoa recebe. Registrado
  em `01 Empresa/Decisões.md` (16/10). Ele escolheu os textos da **opção A** (de 3): rótulo "Teste ao vivo · o
  mesmo site em cada tela", "Teste com o seu negócio", nota "É só um teste: o seu site terá a sua cara...", botão
  fixo "Quero o meu site". Não respondeu sobre J2–J5 (seguem em aberto, sem urgência).
- Feito em `5df81f5`: tablet 760–899 em duas colunas, foto na proporção do desenho, recursos numa linha no pé; até
  759 uma coluna, a foto ocupa o resto, sem recursos; desenho com `meet` e fora do fluxo; respiro do hero no
  computador −12 px; falas da opção A; título de nome longo 38 px no tablet. Neste commit de passagem:
  `docs/pecas/varrer-planta.mjs` (varre a régua 360–1440 × 4 tipos × nome curto/longo e acusa o que passa do pé).
- Verificado: varredura sem nada passar do pé; `checar.mjs` sem rolagem lateral/erros 320–1440; `csp.test` 8/8;
  acessibilidade 23 OK; fotos 390/620/768/1280 conferidas e enviadas ao dono (cartão inteiro, celular, tablet).
- **Próximo passo exato:** (1) revisão do `5df81f5` por agente diferente (code-reviewer; foi lançada e parada pela
  passagem; olhar: cascata 899/759/599 × `.pl-titulo.is-longo`, foto com largura 0 em algum ponto, FLIP com
  recursos ocultos, tempo da luz em `imprimir` com conteúdo que não chega ao pé, sobra do `queroTexto`);
  (2) `node docs/verificar.mjs` com o processador livre (estava em 100% e foi parado). **Armadilha nova:** o
  `verificar.mjs` agora procura o headless `chromium_headless_shell-1243` (playwright atualizado) e falha; passar
  `CHROMIUM=$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`
  e `BASE=http://127.0.0.1:8897` (servidor: `node docs/servidor.mjs . 8897` ou a entrada `pecas-servicos` do painel);
  (3) push e prévia da Vercel para o dono ver no celular; (4) PR.
- Visto e não mexido: sob a régua, no meio da demonstração, "sua tela" apareceu sobreposto a "← sua tela: 1 px"
  numa foto (provavelmente um quadro da escrita caractere a caractere; conferir se repete).
- Lição: texto com crases dentro de `node -e "..."` no Bash vira comando; escrever o bloco num arquivo antes.

**Retomado em 2026-10-16 (noite):** `origin/main` (5f11339, PR #43) mesclada na branch sem conflito; suíte de unidade 394/394 verde. Falta: resposta do dono sobre J2–J5, `verificar` com o processador livre (estava em 100%), revisão, PR.

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
