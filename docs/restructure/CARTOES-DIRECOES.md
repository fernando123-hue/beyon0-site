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

## Próximo passo

O dono escolhe no celular (pode ser uma, uma mistura, ou nenhuma). Registrar a resposta em `01 Empresa/Decisões.md` na
hora. Depois: implementar a escolhida em `css/cartoes.css` (PR próprio, celular primeiro, revisão e verificar) e tirar
a página de prévia do site.
