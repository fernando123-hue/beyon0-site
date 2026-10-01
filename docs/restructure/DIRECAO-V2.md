# Direção V2 — "O instrumento acorda" (2026-10-01)

Pedido do dono: recriação completa da experiência (design, copy, motion,
interação, arquitetura, performance, segurança), tratando o código atual como
matéria-prima. Este documento fixa a direção ANTES do código. O que não está
aqui não entra sem motivo registrado.

## 1. Diagnóstico do que existia (auditoria, medido)

| Achado | Evidência | Decisão |
|---|---|---|
| Google Fonts bloqueia o primeiro render | Hub: `load` em 25,6s na primeira visita medida (folha externa travou) | Self-host (`assets/fonts`, woff2 variáveis, 65 KB) |
| Duas máquinas do organismo | Pulso/Singular duplicados em `pagina.js` e `dom.js` (item 6 da 12.3) | Um módulo: `js/organismo.js` |
| GSAP só na página de automação | Hub e Sites entram por CSS, automação por GSAP: dois idiomas de movimento | GSAP em todas, um vocabulário |
| three.js para três cenas de planos sem luz | 670 KB vendorado, 163 KB gz por visita desktop, 4 revisões de bugs de contexto/SwiftShader | Profundidade em canvas 2D projetado (`js/profundidade.js`): mesmo visual, 0 KB extra, roda no toque |
| "Nada se move em repouso" | O site parecia travado; o dono pediu vida | Um organismo contínuo: o AI Core viaja pela página e liga cada seção |
| CSP só em meta | sem `vercel.json`: sem `frame-ancestors`, sem `nosniff`, sem Permissions-Policy | Headers na Vercel + `cleanUrls` |
| Mono em botões e nav | pesquisa: "monospace como atalho de tech" é clichê | Mono só onde há DADO (índice, medida, coordenada); copy e controles em Sora |

Recálculo de estilo em 6s (desktop): Hub 53ms, Sites 141ms, Automação 332ms.
Alvo depois: nenhum acima do baseline; fps ≥ 58 parado e rolando.

## 2. A ideia

O site é um instrumento que acorda quando alguém chega. Um núcleo (a
abertura hexagonal) nasce no hero, e a partir dali ATRAVESSA a página: ao
rolar, ele desce pela régua lateral e se liga ao conteúdo de cada seção.
Cada seção não "aparece": ela é energizada pelo núcleo que chegou nela.

Causalidade visual, em uma frase: tudo que acende tem uma fonte, e a fonte
está sempre na tela.

## 3. Sistema de movimento (vocabulário fechado)

| Tipo | Ease | Duração | Stagger |
|---|---|---|---|
| Entrada de bloco | `expo.out` | 0,9s | 0,08s |
| Título (linhas mascaradas) | `expo.out` | 0,9s | 0,09s |
| Display do hero (palavras mascaradas) | `expo.out` | 1,1s | 0,07s |
| Cobertura / troca de estado | `expo.inOut` | 0,9s | — |
| Micro (hover, press) | `cubic-bezier(.2,0,0,1)` | 160–220ms | — |
| Scroll-driven | sem duração | `scrub: 0.6` | — |
| Regime (Singular) | `ease-mid` | 1,1s | — |

Proibido: bounce/elastic, loop em texto, movimento em texto sendo lido,
mudança de peso no hover, glow como atmosfera, blur animado, scroll
hijacking. Scroll é nativo. Reduced-motion: entradas viram fade ≤ 300ms,
canvas parado, cursor sem retículo.

## 4. Arquitetura

```
css/tokens.css        paleta, tipografia, @font-face, @property, reset, a11y
css/base.css          tipo, layout, nav, botões, rodapé, régua lateral
css/componentes.css   índice, malha, laudo, método, aplicações, faq, cta, spec, prova, palco, portal, modal, medidor
css/motion.css        estados de revelação (.js), regimes do organismo, reduced-motion
js/tel.js             número
js/ancoras.js         <head>: redireciona âncoras antigas + marca html.js
js/core.js            loop único, orçamento, regime, estado S
js/organismo.js       Pulso, Singular, status, reconhecimento (UM lugar)
js/campo.js           canvas: partículas, brumas, régua + núcleo viajante, abertura, elos, retículo do cursor
js/profundidade.js    canvas: planos projetados (cubo, painéis, portal) — substitui three
js/pagina.js          nav, WhatsApp, ano, Escape, prova medida, medidor, índice de seção
js/anima.js           GSAP: boot do hero, entradas por seção, scrub, matchMedia
js/palavras.js        palavra viva (automação)
js/lead-form.js       modal antes do WhatsApp (automação)
```

GSAP dirige NÚMEROS no estado compartilhado (`B.S.boot`, `B.S.secao`)
quando o canvas precisa acompanhar — nunca variáveis de CSS. A lei da
medição continua: nenhuma custom property muda por frame.

## 5. Copy

Hero do Hub: "Menos promessa. Mais prova." — a honestidade que já é o
diferencial (site que se mede, preço fechado, "se não valer eu digo") vira
a primeira frase. "Ideias ganham forma" continua como linha de marca
(rodapé, Open Graph). Regra 2 (zero dado inventado) intacta.

## 6. O que NÃO entra, e por quê

- Remotion: nenhuma peça do site se beneficia de vídeo pré-renderizado — a
  prova de performance é medida ao vivo e um MP4 de fundo contradiz isso.
  Fica para peças de rede (skill video-matriz), fora do site.
- Lenis / smooth scroll: instrumento não tem atraso; risco de acessibilidade;
  `scrub` já entrega a inércia visual.
- Preloader: esconde o LCP (Shopify mediu até 1,4s perdidos).
- `cursor: none`: o cursor do sistema é recurso de acessibilidade.
