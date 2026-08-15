# Intro em vídeo + scanline de boot (Design Spec)

**Data:** 2026-08-15
**Objetivo:** Trazer de volta a intro em vídeo (item do corte documentado em `docs/HANDOFF.md`) e a linha de boot que revela o hero, portadas pra arquitetura pós-reconstrução (`js/core.js` + `js/field.js` + `js/dom.js`, ver `docs/auditoria-performance.md`).

## Contexto

Existia implementação completa pré-reconstrução: overlay de vídeo (`main.js` `introSequence()`, commit `d1814ff`) e uma scanline que varria o hero revelando título/status/sub/ações em stagger (`.booted .hero::after`, commit `f39df30`). Nenhum dos dois sobreviveu à reconstrução — o hero atual nasce com tudo visível, sem entrada.

Asset de vídeo (`assets/intro.mp4`, 4.2MB, 5s, H.264, sem áudio) existe e está otimizado, mas **não é o vídeo oficial ainda** — dono ainda decidindo. Este spec constrói o sistema com `intro.mp4` como placeholder funcional; trocar o vídeo oficial depois é sobrescrever o arquivo em `assets/`, zero código mexido (convenção já documentada em `assets/README.txt`).

## Decisões

- **Replay:** toda visita. Sem `sessionStorage`/`localStorage`.
- **Guardas:** idênticas à implementação anterior — `prefers-reduced-motion`, `saveData`, rede `2g`/`3g`/`slow-2g` pulam a intro instantaneamente.
- **Vídeo:** placeholder `intro.mp4`, trocável sem mexer em código.
- **Escopo de arquivo:** módulo novo `js/intro.js`, não em `dom.js`. Intro é gate de boot, evento-só (sem tick de rAF) — tema diferente do que já mora em `dom.js` (reveals/Pulso/Singular/medidor).
- **Scanline + stagger do hero:** dispara pela mesma classe `.booted` que a intro adiciona ao `<body>` ao terminar. Puro CSS `@keyframes`, sem JS por frame — não quebra as cinco leis de `docs/auditoria-performance.md`.

## Markup (`index.html`)

Bloco novo logo no início do `<body>`, antes do `<canvas id="fx">`:

```html
<div class="intro" id="intro">
  <video class="intro__video" id="introVid" muted playsinline preload="auto"
         data-src="assets/intro.mp4" aria-hidden="true"></video>
  <button class="intro__skip" id="introSkip" type="button">Pular introdução</button>
</div>
```

`data-src` (não `src`) de propósito: com `src` no markup, o parser baixaria os 4,2 MB antes do JS decidir (via guardas) se esta visita deve pagar por eles. O `src` real só é atribuído em `intro.js`, depois das guardas passarem.

Sem mudança nos elementos do hero existentes (`.hero__title`, `.hero__status`, `.hero__sub`, `.hero__actions`, `.scroll-hint`) — a entrada deles vira puramente CSS, disparada pela classe `.booted` no `<body>`.

## `js/intro.js` (novo arquivo)

IIFE isolada, segue o padrão `window.BEYON` dos outros três arquivos. Não se registra em `B.add()` — não desenha nada por frame.

```
introSequence()
├─ pega #intro, #introVid, #introSkip — se faltar, sai (finish nunca chamado, sem 'booted': ver Casos de borda)
├─ guarda: B.reduced (já exposto por core.js) → finish(true) e sai
├─ guarda: B.saveData (já exposto) OU navigator.connection.effectiveType em {slow-2g,2g,3g} → finish(true) e sai
├─ body ganha 'intro-active'
├─ listeners: vid 'ended' → finish(false); vid 'error' → finish(true)
├─ skip.onclick → finish(false)
├─ vid 'loadedmetadata' → agenda finish(false) em min(30000, duration*1000 + 2000)
├─ atribui vid.src = data-src; vid.play() — se a Promise rejeitar (autoplay bloqueado), finish(true)
├─ setTimeout 1200ms → skip.classList.add('show')
├─ setTimeout 8000ms → se metadata nunca chegou (duration NaN), finish(true)
└─ finish(instant):
   ├─ idempotente (flag 'done')
   ├─ body perde 'intro-active', ganha 'booted' — dispara scanline + stagger do hero via CSS
   ├─ intro.classList.add('intro--done') → fade 0.9s (CSS)
   ├─ vid.pause()
   └─ remove #intro do DOM (instant: já; senão: depois de 900ms, esperando o fade)
```

Guarda de fallback pra `#intro`/`#introVid` ausentes do markup (não deveria acontecer, mas se acontecer): body ganha `.booted` direto, sem overlay — hero não fica travado esperando um evento que nunca vem.

## CSS (`styles.css`)

Dois blocos novos.

**1. Overlay da intro** (variante direta do que existia, tokens atualizados pro vocabulário atual — `--void`, `--glow-rgb`, `--hi`, `--mono`, `--ease`, `--t-fast`... `--void-rgb` não existe mais no CSS novo, troco por `rgb(0 0 0 / .4)` direto já que `--void` é preto fixo):

```css
.intro {
  position: fixed; inset: 0; z-index: 1000;
  background: var(--void);
  display: grid; place-items: center;
  opacity: 1; transition: opacity .9s var(--ease);
}
.intro--done { opacity: 0; pointer-events: none; }
.intro__video { width: 100%; height: 100%; object-fit: cover; }
.intro__skip {
  position: absolute; right: clamp(1rem, 3vw, 2rem); bottom: clamp(1rem, 3vw, 2rem);
  font-family: var(--mono); font-size: .72rem; letter-spacing: .12em; text-transform: uppercase;
  color: var(--hi); background: rgb(0 0 0 / .4);
  border: 1px solid rgb(var(--glow-rgb) / .35); border-radius: 999px; padding: .6rem 1.2rem;
  cursor: pointer; opacity: 0;
  transition: opacity .5s ease, background var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease);
}
.intro__skip.show { opacity: 1; }
.intro__skip:hover { background: rgb(0 0 0 / .7); box-shadow: 0 0 24px rgb(var(--glow-rgb) / .35); }
```

**2. Scanline + stagger do hero** (porta de `f39df30`, token `--ease-reveal` → `--ease`, que é o equivalente no CSS novo):

```css
.booted .hero::after {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2px; z-index: 4;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgb(var(--glow-rgb) / .7) 30%,
    rgb(var(--core-rgb) / .9) 50%, rgb(var(--glow-rgb) / .7) 70%, transparent);
  box-shadow: 0 0 24px rgb(var(--glow-rgb) / .5);
  animation: boot-scan 1.3s var(--ease) 0s 1 both;
}
@keyframes boot-scan {
  0%   { transform: translateY(0); opacity: 0; }
  8%   { opacity: 1; }
  85%  { opacity: .9; }
  100% { transform: translateY(100svh); opacity: 0; }
}

.booted .nav { animation: boot-down .7s var(--ease) 0s both; }
@keyframes boot-down { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }

.booted .hero__status { animation: boot-rise .6s var(--ease) .5s both; }
.booted .hero__title  { animation: boot-rise .7s var(--ease) .65s both; }
.booted .hero__sub    { animation: boot-rise .7s var(--ease) .95s both; }
.booted .hero__actions{ animation: boot-rise .7s var(--ease) 1.12s both; }
.booted .scroll-hint  { animation: boot-rise .8s var(--ease) 1.5s both; }
@keyframes boot-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
```

`.hero__title` no CSS antigo tinha `.line--1`/`.line--2` (título quebrado em spans, hoje não existe — hero atual é um `<h1>` só, `<br>` interno). Animação aplicada no `<h1>` inteiro, sem split — mais simples, sem recriar a materialização por linha que foi cortada por custar caro.

`.hero__reactor` (o reator do AI Core, hoje 100% canvas) não ganha animação própria — a linha passa por cima dele visualmente e o campo já está desenhando desde o primeiro frame; não há necessidade de coordenar com `S` pra isso.

`@media (prefers-reduced-motion: reduce)` já existe em `styles.css:400` e zera `animation-duration`/`transition-duration` global (`.001ms !important`) — `boot-scan`, `boot-down`, `boot-rise` e o fade do `.intro` caem nessa regra automaticamente, sem CSS novo. Sob `reduced-motion`, `B.reduced` também força `finish(true)` em `intro.js` (sem overlay visível) — os dois mecanismos se somam: hero aparece direto, sem linha nem cascata perceptível.

## Fluxo completo

1. Load: `core.js` mede viewport, expõe `B`. `field.js` desenha campo por trás (invisível, coberto pelo overlay opaco). `dom.js` liga reveals/Pulso/nav — hero já está com opacity 0 nos elementos-alvo (via CSS, esperando `.booted`).
2. `intro.js` roda: guarda passa → intro toca (5s) → `ended` → `finish(false)`.
3. `finish`: body troca `intro-active` por `booted`. Overlay começa a sumir (fade CSS 0.9s) enquanto scanline desce e hero aparece em cascata por baixo.
4. Guarda reprovada (motion reduzido / rede fraca) → `finish(true)` imediato: sem overlay visível, `.booted` aplicado na hora, hero aparece sem a coreografia (animação desativada por `reduced-motion`; em rede fraca a coreografia roda normal, é barata — só o vídeo que é pesado).

## Arquivos tocados

```
index.html    + bloco .intro (markup)
styles.css    + .intro/.intro__video/.intro__skip
              + .booted .hero::after + boot-down/boot-rise + keyframes
js/intro.js   novo arquivo
```

`js/core.js`, `js/field.js`, `js/dom.js` — sem mudança. `js/intro.js` só lê `B.reduced`/`B.saveData`, não escreve em `S`.

## Pendências do usuário

- Decidir o vídeo oficial (`intro.mp4` é placeholder funcional, não a versão final).
