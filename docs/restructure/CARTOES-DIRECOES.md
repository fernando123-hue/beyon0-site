# Cartões — três direções para o visual (2026-10-17)

Pedido do dono (16/10, `01 Empresa/Decisões.md`): "após refinar o efeito que estamos mexendo agora, reformule o visual
dos cards". Por ser redesenho, as direções são mostradas antes de implementar. Ele não deu referência; disse só que os
cartões "não estão me deixando feliz faz um tempo".

Prévia: `cartoes-direcoes.html` (página interna, `noindex`, fora do menu), com `css/cartoes-direcoes.css`. Os mesmos
cartões do site, com o texto real (laudo do Início, níveis do atendente, capacidades da Automação e, só no computador,
a faixa do hero). Uma barra embaixo troca Hoje / A / B / C sem JS (`:has` no rádio marcado). O cartão "aceso" mostra o
da frente na pilha B do celular (borda ciano 60 %, letras acesas).

## Diagnóstico (o cartão de hoje)

O módulo empilha sinais do mesmo peso, todos de 1 px:

- quatro tiras de luz de canto (tinta num canto, reflexo prata no oposto);
- a aresta de cima, que acende no foco;
- marcas de canto em L (serviços);
- número mono com traço de 40 px;
- link mono com seta que anda e sublinhado;
- no desktop, ainda a carga (barra, aro, letras), a volta de energia e as estações.

E o mesmo traje vale para tudo: linha do laudo, pergunta, item de especificação, faixa do hero, célula, serviço. Sem
hierarquia entre tipos de cartão, a decoração disputa com o título. Lido de longe, vira "painel de HUD", cara de modelo.

## Comum às três direções

Sai o empilhamento: tiras de canto, aresta de cima, marcas em L e traço do número. Cada direção fica com UMA ideia.

Preservado (aprovado antes, não muda): módulos separados com vão e o barramento do campo entre eles (03/10); as
estações no desktop; a carga do desktop (04/10, "B e D"); a pilha B do celular com as letras acesas (16/10); a
identidade V4 (preto, grafite, ciano, Sora + Mono); sem desfoque; uma linha por borda; regra 8 do ciano (ciano em texto
só no H1, na Conversa e em dado).

## As direções

**A · Placa.** O cartão vira uma peça da placa de circuito: canto de cima à direita cortado em 45°, o mesmo chanfro dos
fios do barramento do fundo. A borda é uma linha só que segue o corte, e só a diagonal do corte acende, na tinta do
cartão. O número vira etiqueta serigrafada (bloco grafite). Liga o cartão ao campo do reator. Técnica: a linha é o fundo
do cartão e a superfície é um `::before` recortado 1 px para dentro (o `clip-path` cortaria uma borda comum na diagonal).

**B · Editorial.** Menos enfeite, mais letra. Um traço de 2 px no topo (prata em repouso, ciano no aceso) e o número em
Sora 200, grande e apagado, no canto de cima. Título maior. Hierarquia pela escala, não por linhas.

**C · Linha viva.** Uma linha só, com a luz andando por ela, o que o dono pediu para bordas em 06/10 ("uma linha, com a
energia circulando"). Parada, a luz descansa perto do canto de cima à esquerda (o lugar da luz de canto de hoje); no
cartão aceso, e no hover do desktop, ela dá a volta. Técnica da prévia: um traço de 1 px que segue a própria borda por
`offset-path: inset(... round ...)` e gira nas curvas, recortado pela curva do cartão. **Não serve como está para o
site:** `offset-distance` anima na thread principal, não no compositor (fere a regra 1 do `CLAUDE.md`). Se o dono
escolher a C, a implementação precisa de outra técnica (por exemplo, a volta só por `transform` em trechos, como a
`.energia-volta` de hoje) ou de medida que mostre custo desprezível. Falta também conferir o `offset-path` com `inset()`
no Safari do iPhone.

## Cuidados da implementação (revisão da prévia, 17/10)

- A prévia não carrega `css/motion.css`. No site, ele anima o `::before` dos cartões (entrada da malha, aresta do
  serviço no celular) e o `.painel::after` (varredura). Na A o `::before` é a superfície: zerar `transform`, `animation`
  e `transition` dele. Em B e C, esconder a varredura do `::after` ou ela volta a acender a aresta.
- A: o `clip-path` corta o contorno de foco de fora; o foco precisa vir por dentro.
- B: o número sai do grid; no laudo largo (≥ 821 px) o título e o texto ficam com as duas colunas.
- "Hoje" na prévia aparece parado, sem o movimento da página.

## Escolhas do dono (20/10, `01 Empresa/Decisões.md`)

1. **Direção C** ("Gostei da opção C, mas também quero uma melhoria no número do card, acabou ficando um pouco
   genérico"). Como o pedido do número era aberto, a prévia mostrou o atual e três opções (`7879625`): 1 Contagem
   ("01 / 03"), 2 Grande (Sora 300) e 3 Na linha. Um número vazado em contorno ficou de fora: vira duas linhas
   paralelas por traço, o "tubo" proibido.
2. **Número: a opção 3, na linha**, "um pouquinho maior e que seus efeitos sejam mais perceptivos".

## O que foi implementado (branch `cartoes-c`)

- **Módulo** (`css/cartoes.css`, "o módulo: A LINHA VIVA"): uma linha só (`--line-2`), canto de 10 px (`--mod-raio`).
  Saíram as quatro tiras de luz de canto, a aresta de cima (o `::before` fica escondido), as marcas em L (o HTML segue
  com os spans, escondidos) e o traço do número. A sombra interna de 1 px no topo também saiu (era uma 2ª linha).
- **Número na linha**: `.servico__n`, `.celula__n`, `.laudo__n` ficam na borda de cima, 13 px (era 11), como etiqueta
  com fundo opaco; acendem em `--ac-2` no hover e no aceso. Os grids do laudo perderam a coluna do número (inclusive
  o índice grande em Sora 200 das dores do Início, que passou para a linha como os outros).
- **Luz pousada**: um traço de 124 px pintado no FUNDO do cartão (não em pseudo-elemento: o `motion.css` anima os
  `::before` na entrada), logo depois do número, mais forte que na prévia (pico no branco). Sai quando outra luz dá a
  volta (o aceso, a carga cheia no desktop).
- **A volta** (`js/linha-viva.js`): no cartão aceso do celular e do tablet a luz decola de onde pousava e dá a volta,
  a 260 px/s, na construção da luz que circula da carga (quatro lados recortados, faixa do tamanho do perímetro,
  só `transform`; o JS mede só quando o tamanho muda). Pausada fora do aceso. No desktop com mouse não é montada: a
  carga aprovada (04/10, "B e D") segue dando a volta lá. Sem JS ou com movimento reduzido, a luz fica pousada.
- **Teste**: `docs/pecas/linha-viva.mjs` (número na linha, luz pousada, volta só no aceso e com 4 faixas, nada no
  reduzido nem no desktop, sem rolagem lateral, sem sinais antigos).
- A página de prévia (`cartoes-direcoes.html` e o CSS dela) saiu do site.
