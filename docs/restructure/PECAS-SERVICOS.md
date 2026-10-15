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
