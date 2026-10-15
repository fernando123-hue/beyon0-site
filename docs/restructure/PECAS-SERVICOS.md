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
