# Orçamento: mais detalhes no campo e no microfone (24/11)

**ESCOLHA DO DONO (24/11 tarde):** "Gostei da opção A gravando e símbolo. Gostei, bem minimalista. E o lugar aonde o cliente escreve com a energia passando, pode manter." = **microfone da A** (anel de 1 px; gravando, o traço gira pelo anel) + **campo e Enviar da B** (a luz dá uma volta na borda ao tocar; a seta no Enviar). É o que está no código.

**O pedido do dono (24/11, depois de ver o antes/depois no celular, escuro e claro):** "Dê um pouco mais de detalhes em tudo, com
ênfase no campo aonde o usuário escreve e no microfone e seu ícone. Tire os numeros ao lados das opções pré selecionadas."

**O que não muda (aprovado em 23/11, PR #229):** a ordem dos blocos, as opções um degrau abaixo do campo, o escuro de início com o
botão do tema, os textos. Regras de sempre: nada de desfoque nem brilho suave, nenhuma borda de várias linhas (uma linha só; movimento
só como uma luz que passa por ela), celular primeiro, nada cortado, contraste AA nos dois temas, alvo de toque de 44 px ou mais,
movimento reduzido respeitado.

## O que vale para as três

- **Os números saíram** das opções prontas (01, 02… à direita de Serviços, Saúde…). O texto fica sozinho, no mesmo recuo em todas;
  marcada (nas perguntas de várias escolhas), o ✓ continua à direita.
- **Opções:** recuo de 16 px dos dois lados (antes 14), a cor do contorno e do texto passa em 160 ms no toque, o dedo afunda a opção
  um tantinho (escala 0,985, só com movimento ligado) e o teclado ganha o anel da cor de ação.
- **Campo:** caixa um pouco mais folgada (14 × 18 px), entrelinha 1,45, o cursor na cor de ação; onde o navegador sabe (Chrome e
  Android), o campo cresce sozinho com o texto até 40 % da tela e a alça de esticar, que aparecia como um pontinho solto no canto, sai.
- **Microfone:** o desenho foi refeito na linha da logo (cápsula mais esguia, berço mais aberto, haste e base em proporção, o núcleo
  em ponto na cor de ação) e ficou **centrado** (antes ele ficava torto para cima e para a esquerda: uma regra geral dos botões,
  `.btn span { display: inline-block }`, ganhava da regra do ícone e o desalinhava; corrigido). O relógio da gravação usa algarismos
  de largura fixa, para não sacudir a cada segundo.
- **Enviar:** a seta (quando a variação tem) dá um passo de 2 px no toque e no foco, só com movimento ligado e nunca enquanto o
  botão está travado (o Zero pensando).

## As três variações (só o campo, o microfone e o Enviar mudam entre elas)

| | Campo | Microfone | Enviar |
|---|---|---|---|
| **A, quieta** | a linha da cor de ação, parada; no foco ela engrossa para 2 px | o ícone num **anel de 1 px** (cinza); gravando, o traço que gira corre **pelo anel** e o núcleo pisca | só a palavra |
| **B, a luz que passa (no código, recomendada)** | igual à A e, **ao entrar no campo, uma luz curta dá UMA volta pela linha** e apaga | o ícone num **disco chapado** da cor de ação bem clarinha; gravando, o traço gira pela borda do disco e o núcleo pisca | a palavra e **uma seta de traço** que dá um passo à frente no toque |
| **C, cheia** | o campo **um degrau mais claro** que a página, linha de 1,5 px e cantos de 20 px; a luz **fica girando** enquanto o campo está em foco e vazio, e para quando a pessoa começa a escrever | o ícone num **disco cheio** da cor de ação; gravando, **o botão inteiro acende** na cor de ação e o traço gira pela borda do disco | a palavra e a seta |

**Recomendo a B.** Ela dá ao campo e ao microfone o mesmo gesto da marca (a luz que passa por uma linha só) sem ficar mexendo: a volta
acontece uma vez, quando a pessoa toca no campo, e depois o campo fica quieto para ela escrever. O disco clarinho dá ao microfone um
corpo de botão de verdade sem gritar mais que o campo (a C faz o microfone competir com o "Enviar"; a A é correta, mas quase igual ao
que já está no ar). A seta no "Enviar" casa o botão com o campo: diz "isto vai para o Zero" sem texto a mais.

**O que eu não fiz, de propósito:** contador de letras (o limite é de 2.000, longe de qualquer mensagem normal; seria mais um número
na tela, e o dono acabou de pedir para tirar números) e dica de teclado ("Enter envia"): no celular, onde está a maioria, não ajuda.

## O CSS de cada uma

A B é o que está em `css/orcamento-palco.css` (o campo, a luz e o Enviar), `css/orcamento-voz.css` (o microfone) e
`orcamento.html` (a caixa `.orc-campo` com o `<svg class="orc-campo__luz">`, o ícone refeito e a seta do Enviar). A A e a C são
escritas **por cima** do código da B (o script `docs/detalhes-orcamento.mjs` as injeta para os prints). Se o dono escolher uma delas,
o bloco vira código nesses mesmos arquivos (e os testes de `docs/testes/orcamento-nasce.test.mjs` acompanham).

```css variacao-a
/* A, quieta: sem a volta da luz, o microfone num anel de 1 px, o Enviar só com a palavra */
.orc-campo__luz { display: none !important; }
.orc-mic .orc-mic__icone { background-color: transparent; border: 1px solid var(--line-2); }
.orc-mic:hover .orc-mic__icone { background-color: transparent; border-color: var(--t2); }
.orc-mic__icone::after { inset: -1px; border-width: 1px; }
.orc-mic.is-gravando .orc-mic__icone { border-color: var(--line-2); }
.orc-enviar__seta { display: none; }
.orc-envio #o-enviar { padding: 12px 22px; }
```

```css variacao-b no-codigo
```

```css variacao-c
/* C, cheia: o campo um degrau mais claro, linha de 1,5 px; a luz gira enquanto o campo está em foco e vazio; o microfone num disco
   cheio e, gravando, o botão inteiro aceso */
.orc-envio textarea { border-width: 1.5px; border-radius: 20px; background: var(--s2); }
html[data-tema="claro"] .orc-envio textarea { background: var(--s1); }
.orc-envio textarea::placeholder { color: var(--t2); }
.orc-campo__luz rect { x: 1px; y: 1px; width: calc(100% - 2px); height: calc(100% - 2px); rx: 19px; }
html:not(.menos-movimento) .orc-campo:focus-within:has(textarea:placeholder-shown) .orc-campo__luz rect { animation: orc-campo-volta 2.6s linear infinite; }
.orc-mic .orc-mic__icone { background-color: var(--ac); color: var(--ac-tinta); }
.orc-mic:hover .orc-mic__icone { background-color: var(--ac-2); }
.orc-mic__nucleo { fill: var(--ac-tinta); }
.orc-mic.is-gravando { background-color: var(--ac); border-color: var(--ac); color: var(--ac-tinta); }
.orc-mic.is-gravando .orc-mic__icone { background-color: rgb(var(--ac-tinta-rgb) / .14); }
.orc-mic.is-gravando .orc-mic__svg { stroke: var(--ac-tinta); }
.orc-mic.is-gravando .orc-mic__nucleo { fill: var(--ac-tinta); }
.orc-mic.is-gravando .orc-mic__icone::after { border-top-color: var(--ac-tinta); }
```
