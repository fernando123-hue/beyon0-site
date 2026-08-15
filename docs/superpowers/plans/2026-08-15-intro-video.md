# Intro em vídeo + scanline de boot — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar a intro em vídeo e a scanline de boot da implementação pré-reconstrução (commits `d1814ff`/`f39df30`) pra arquitetura atual (`core.js`+`field.js`+`dom.js`), conforme `docs/superpowers/specs/2026-08-15-intro-video-design.md`.

**Architecture:** Overlay `<video>` fullscreen com guardas de rede/motion, controlado por um IIFE novo (`js/intro.js`) que só mexe em classes do `<body>` — nunca escreve CSS por frame. O fim da intro dispara a classe `.booted`, que aciona uma scanline CSS e um stagger de entrada no hero, ambos `@keyframes` puros.

**Tech Stack:** HTML/CSS/JS vanilla, sem build, sem framework de teste (ver Global Constraints).

## Global Constraints

- **Cinco leis** (`docs/auditoria-performance.md`): nada visual contínuo passa por CSS; variável CSS só muda em evento discreto; efeito com centenas de unidades é desenhado no canvas, não estilizado; instrumentação sempre presente via `?perf`; degradação é preventiva e reversível. Nenhum código deste plano escreve CSS a cada frame — só toggles de classe em eventos (`ended`, `error`, `click`, `loadedmetadata`, timeouts).
- **Replay:** intro toca em toda visita. Proibido usar `sessionStorage`/`localStorage` pra suprimir replay.
- **Guardas obrigatórias:** `B.reduced` (já exposto por `core.js`), `B.saveData` (já exposto), OU `navigator.connection.effectiveType` em `{slow-2g, 2g, 3g}` → pula a intro instantaneamente, sem baixar o vídeo.
- **Vídeo:** `data-src="assets/intro.mp4"` (placeholder funcional, já existe e está otimizado — dono ainda vai trocar pelo oficial depois; troca é só sobrescrever o arquivo, zero código).
- **CSP:** `index.html` já tem `media-src 'self'` e `script-src 'self'` — cobre vídeo local e `js/intro.js` sem mudança nenhuma no bloco de CSP.
- **Sem framework de teste:** `package.json` não tem devDependency de teste, projeto é sem build. Verificação é manual via browser preview (mesmo padrão já usado nesta sessão: `preview_start` do servidor estático, `navigate` pra `?perf`, `javascript_tool` pra inspecionar estado, `read_console_messages` pra erros, `computer screenshot` quando o painel compuser frame — se não compuser, cair pro `javascript_tool`/`read_page` como evidência).
- **`prefers-reduced-motion`:** regra global já existe em `styles.css:400` (zera `animation-duration`/`transition-duration` pra `.001ms` em `*`). As animações novas deste plano (`boot-scan`, `boot-down`, `boot-rise`) caem nela automaticamente — não criar `@media` novo pra isso.

---

## File Structure

```
index.html    modificado — bloco <div id="intro"> + <script src="js/intro.js" defer>
styles.css    modificado — .intro/.intro__video/.intro__skip (Task 1)
                          — .booted .hero::after + boot-down/boot-rise (Task 3)
js/intro.js   novo — guardas, ciclo de vida do vídeo, finish()
```

`js/core.js`, `js/field.js`, `js/dom.js` — sem alteração em nenhuma task.

---

### Task 1: Markup + CSS do overlay de intro

**Files:**
- Modify: `index.html:56-64` (logo após `<body>`, antes de `<canvas id="fx">`)
- Modify: `styles.css` (novo bloco no final do arquivo)

**Interfaces:**
- Produces: elementos DOM `#intro`, `#introVid` (`<video>`, atributo `data-src`), `#introSkip` (`<button>`) — consumidos por `js/intro.js` na Task 2.
- Produces: classes CSS `.intro`, `.intro--done`, `.intro__video`, `.intro__skip`, `.intro__skip.show` — controladas por `js/intro.js` na Task 2.

- [ ] **Step 1: Adicionar markup do overlay em `index.html`**

Logo após a abertura de `<body>` (linha 56), antes do comentário "CAMADA DE ENERGIA" e do `<canvas id="fx">`:

```html
<body>
  <a href="#hero" class="skip-link">Pular para o conteúdo</a>

  <!-- INTRO — overlay de vídeo no boot. src fica em data-src de propósito: com
       ele no markup, o parser começaria a baixar os 4,2 MB do vídeo antes de o
       JS (defer) poder decidir, pelas guardas de rede/motion, que esta visita
       não deve pagar por eles. Ver js/intro.js. -->
  <div class="intro" id="intro">
    <video class="intro__video" id="introVid" muted playsinline preload="auto"
           data-src="assets/intro.mp4" aria-hidden="true"></video>
    <button class="intro__skip" id="introSkip" type="button">Pular introdução</button>
  </div>

  <!-- CAMADA DE ENERGIA — um canvas só, em tela cheia, atrás de tudo.
```

(o restante do arquivo, a partir do `<canvas id="fx">`, continua idêntico — só a `<div class="intro">` entra antes dele, e o `<a class="skip-link">` já existente continua sendo a primeira coisa no `<body>`)

- [ ] **Step 2: Adicionar CSS do overlay no final de `styles.css`**

```css

/* ============================================================
   INTRO — overlay de vídeo no boot.
   Toda visita. Guardas (motion/rede) e ciclo de vida em js/intro.js —
   este bloco só define a aparência das classes que o JS alterna.
   ============================================================ */
.intro {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--void);
  display: grid;
  place-items: center;
  opacity: 1;
  transition: opacity .9s var(--ease);
}
.intro--done {
  opacity: 0;
  pointer-events: none;
}
.intro__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.intro__skip {
  position: absolute;
  right: clamp(1rem, 3vw, 2rem);
  bottom: clamp(1rem, 3vw, 2rem);
  font-family: var(--mono);
  font-size: .72rem;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--hi);
  background: rgb(0 0 0 / .4);
  border: 1px solid rgb(var(--glow-rgb) / .35);
  border-radius: 999px;
  padding: .6rem 1.2rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity .5s ease, background var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease);
}
.intro__skip.show { opacity: 1; }
.intro__skip:hover {
  background: rgb(0 0 0 / .7);
  box-shadow: 0 0 24px rgb(var(--glow-rgb) / .35);
}
```

- [ ] **Step 3: Verificar visualmente sem JS ainda ligado**

Sem `js/intro.js` ainda, nada adiciona `.intro-active` ou `.booted` — a página deve carregar exatamente igual a antes (overlay presente no DOM mas invisível-por-classe-ausente é falso: `.intro` por padrão tem `opacity:1` e `z-index:1000`, ou seja, **vai cobrir a tela** assim que este CSS existir, mesmo sem JS algum, porque `.intro` não depende de nenhuma classe pra aparecer — só `.intro--done` some com ele). Isso é esperado só até a Task 2 existir; não é regressão a ignorar, é ordem de tasks. Confirmar assim:

Servidor já configurado em `.claude/launch.json` (`beyon0-static`, porta 8777). Abrir preview, navegar pra `http://localhost:8777/`, e checar:

```js
document.getElementById('intro') !== null &&
document.getElementById('introVid') !== null &&
document.getElementById('introSkip') !== null &&
getComputedStyle(document.getElementById('intro')).position
```

Esperado: `true`/`true`/`true` e `"fixed"`. Tela deve estar preta (overlay cobrindo tudo) — confirma que o CSS está carregado e correto. Não commitar sem a Task 2 no mesmo commit, ou o site fica quebrado em produção (tela preta permanente sem JS pra tirar).

- [ ] **Step 4: Commit conjunto com Task 2**

Não commitar isoladamente — ver Step final da Task 2.

---

### Task 2: `js/intro.js` — guardas e ciclo de vida

**Files:**
- Create: `js/intro.js`
- Modify: `index.html` (adicionar `<script src="js/intro.js" defer>`)

**Interfaces:**
- Consumes: `window.BEYON.reduced` (bool), `window.BEYON.saveData` (bool) — expostos por `js/core.js:162-164`.
- Consumes: `#intro`, `#introVid`, `#introSkip` — produzidos na Task 1.
- Produces: classe `body.booted` — consumida pela Task 3 (scanline + stagger do hero).
- Produces: classe `body.intro-active` — sem consumidor nesta versão (reservada pra CSS futuro que precise saber "intro está tocando agora"; hoje nada lê).

- [ ] **Step 1: Criar `js/intro.js`**

```js
/* ==========================================================================
   INTRO — overlay de vídeo no boot.

   Evento-só: sem tick de rAF, não se registra em B.add(). Só alterna classes
   do <body> em resposta a eventos do <video> (ended/error/loadedmetadata) e
   do botão de pular. Quem desenha a scanline de boot é puro CSS (styles.css),
   disparado pela classe .booted que este arquivo adiciona ao terminar.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B) return;

  var intro = document.getElementById('intro');
  var vid = document.getElementById('introVid');
  var skip = document.getElementById('introSkip');

  /* markup ausente: não trava o boot esperando um evento que nunca vem */
  if (!intro || !vid) {
    document.body.classList.add('booted');
    return;
  }

  var done = false;
  function finish(instant) {
    if (done) return;
    done = true;
    document.body.classList.remove('intro-active');
    document.body.classList.add('booted');
    intro.classList.add('intro--done');
    try { vid.pause(); } catch (e) {}
    if (instant) {
      if (intro.parentNode) intro.parentNode.removeChild(intro);
    } else {
      setTimeout(function () {
        if (intro.parentNode) intro.parentNode.removeChild(intro);
      }, 900);
    }
  }

  /* rede fraca: mesma política de guarda que o campo neural já aplica
     (core.js expõe B.saveData; effectiveType não é exposto lá, checa aqui) */
  var conn = navigator.connection;
  var redeFraca = !!conn && (conn.saveData === true ||
    conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g');

  if (B.reduced || B.saveData || redeFraca) {
    finish(true);
    return;
  }

  document.body.classList.add('intro-active');

  vid.addEventListener('ended', function () { finish(false); });
  vid.addEventListener('error', function () { finish(true); });
  if (skip) skip.addEventListener('click', function () { finish(false); });

  /* trava de segurança: se o vídeo travar, entra após duração + folga */
  vid.addEventListener('loadedmetadata', function () {
    var cap = Math.min(30000, (vid.duration || 12) * 1000 + 2000);
    setTimeout(function () { finish(false); }, cap);
  });

  /* o download começa AQUI, depois das guardas acima — nunca no parser */
  var src = vid.getAttribute('data-src');
  if (!src) { finish(true); return; }
  vid.src = src;

  var p = vid.play();
  if (p && p.catch) p.catch(function () { finish(true); });

  if (skip) setTimeout(function () { skip.classList.add('show'); }, 1200);

  /* fallback se metadata nunca carregar */
  setTimeout(function () {
    if (!done && (!vid.duration || isNaN(vid.duration))) finish(true);
  }, 8000);
})();
```

- [ ] **Step 2: Ligar o script em `index.html`**

No final do `<body>`, depois de `<script src="js/dom.js" defer></script>` (linha 271):

```html
  <script src="js/core.js" defer></script>
  <script src="js/field.js" defer></script>
  <script src="js/dom.js" defer></script>
  <script src="js/intro.js" defer></script>
</body>
```

- [ ] **Step 3: Verificar o caminho principal (vídeo toca até o fim)**

Abrir preview em `http://localhost:8777/`, aguardar ~5s (duração do `intro.mp4`), então checar:

```js
({
  bodyClasses: document.body.className,
  introInDom: !!document.getElementById('intro'),
  videoPaused: document.getElementById('introVid') ? document.getElementById('introVid').paused : 'removido'
})
```

Esperado: `bodyClasses` contém `"booted"` e não contém `"intro-active"`; `introInDom: false` (removido do DOM 900ms depois do fim); vídeo já não existe mais pra checar `paused`.

Se o vídeo ainda não tiver acabado quando checar, rodar antes:

```js
({ currentTime: document.getElementById('introVid').currentTime, duration: document.getElementById('introVid').duration, paused: document.getElementById('introVid').paused })
```

pra confirmar que está tocando (`paused: false`, `currentTime` subindo).

- [ ] **Step 4: Verificar o botão de pular**

Recarregar a página. Logo após o load:

```js
document.getElementById('introSkip').className
```

Esperado: sem `"show"` (ainda não passaram 1.2s). Esperar >1.2s e checar de novo — esperado: `"intro__skip show"`. Então:

```js
document.getElementById('introSkip').click();
setTimeout(() => console.log(document.body.className, !!document.getElementById('intro')), 950);
```

Esperado no console: `"...booted"` (sem `intro-active`) e `false` — pular funcionou e removeu o overlay.

- [ ] **Step 5: Verificar o caminho de erro (vídeo falha)**

Editar temporariamente `data-src="assets/intro.mp4"` pra `data-src="assets/nao-existe.mp4"` em `index.html`, recarregar, checar após ~1s:

```js
({ bodyClasses: document.body.className, introInDom: !!document.getElementById('intro') })
```

Esperado: `bodyClasses` contém `"booted"` imediatamente (sem esperar 900ms — caminho `instant`), `introInDom: false` na hora. Confirma que `error` → `finish(true)` funciona e que o `instant` de fato pula a espera de fade.

Reverter `data-src` de volta pra `"assets/intro.mp4"` antes de continuar.

- [ ] **Step 6: Checar console limpo**

`read_console_messages` sem erros não relacionados ao teste do Step 5 (que já foi revertido). Nenhum erro deve sobrar depois da reversão.

- [ ] **Step 7: Commit (Task 1 + Task 2 juntas)**

```bash
git add index.html styles.css js/intro.js
git commit -m "feat: intro em video no boot, com guardas de rede e motion"
```

---

### Task 3: Scanline de boot + stagger do hero

**Files:**
- Modify: `styles.css` (novo bloco no final do arquivo, depois do bloco `.intro` da Task 1)

**Interfaces:**
- Consumes: classe `body.booted`, produzida por `js/intro.js` (Task 2).
- Consumes: seletores já existentes no hero (`index.html:80-104`): `.hero`, `.nav` (`#nav`), `.hero__status`, `.hero__title`, `.hero__sub`, `.hero__actions`, `.scroll-hint` — nenhum precisa de classe nova, a animação entra por `.booted .hero__x`.

- [ ] **Step 1: Adicionar CSS da scanline + stagger no final de `styles.css`**

```css

/* ============================================================
   BOOT — scanline varre o hero uma vez, elementos entram em cascata.
   Disparado por .booted (js/intro.js, ao fim da intro). Puro @keyframes:
   nenhuma variável CSS escrita por frame, nenhum JS por tick — cai
   automaticamente sob prefers-reduced-motion (styles.css:400).
   ============================================================ */
.booted .hero::after {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 2px;
  z-index: 4;
  pointer-events: none;
  background: linear-gradient(90deg,
    transparent,
    rgb(var(--glow-rgb) / .7) 30%,
    rgb(var(--core-rgb) / .9) 50%,
    rgb(var(--glow-rgb) / .7) 70%,
    transparent);
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
@keyframes boot-down {
  from { opacity: 0; transform: translateY(-14px); }
  to   { opacity: 1; transform: none; }
}

.booted .hero__status  { animation: boot-rise .6s var(--ease) .5s both; }
.booted .hero__title   { animation: boot-rise .7s var(--ease) .65s both; }
.booted .hero__sub     { animation: boot-rise .7s var(--ease) .95s both; }
.booted .hero__actions { animation: boot-rise .7s var(--ease) 1.12s both; }
.booted .scroll-hint   { animation: boot-rise .8s var(--ease) 1.5s both; }
@keyframes boot-rise {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: none; }
}
```

`.hero` precisa de `position: relative` (ou `absolute`/`fixed`) pra `.hero::after` se posicionar corretamente contra ele em vez do viewport/ancestral mais próximo. Checar antes de dar por pronto:

- [ ] **Step 2: Confirmar que `.hero` tem contexto de posicionamento**

```js
getComputedStyle(document.querySelector('.hero')).position
```

Se vier `"static"`, adicionar em `styles.css` no seletor `.hero` já existente:

```css
.hero {
  position: relative;
  /* ...resto das propriedades existentes continua igual... */
}
```

(ler o bloco `.hero { ... }` atual em `styles.css` antes de editar, pra inserir a linha sem duplicar ou sobrescrever propriedades já lá.)

- [ ] **Step 3: Verificar a cascata via trigger manual (determinístico, sem esperar a intro)**

Recarregar a página, então forçar a classe direto (sem esperar os 5s do vídeo):

```js
document.body.classList.remove('intro-active');
document.body.classList.add('booted');
```

Tirar screenshot logo em seguida (`computer` action `screenshot`) — se o painel não compuser frame (limitação já conhecida deste ambiente), usar como evidência:

```js
['.hero__status', '.hero__title', '.hero__sub', '.hero__actions', '.scroll-hint'].map(function (sel) {
  var el = document.querySelector(sel);
  var cs = getComputedStyle(el);
  return { sel: sel, animationName: cs.animationName, opacity: cs.opacity };
})
```

Esperado: cada seletor com `animationName` igual ao respectivo `boot-rise`/`boot-down` (não `"none"`).

- [ ] **Step 4: Verificar o fluxo real de ponta a ponta**

Recarregar a página (sem forçar classe manualmente desta vez), esperar a intro terminar sozinha (~5s + até 900ms de fade), então:

```js
document.body.classList.contains('booted')
```

Esperado: `true`. Confirma que o caminho real (`js/intro.js` → `finish` → `.booted`) aciona a mesma cascata testada no Step 3.

- [ ] **Step 5: Checar fps não regrediu**

Navegar pra `http://localhost:8777/?perf`, esperar a intro passar, observar o medidor no canto inferior esquerdo por alguns segundos de scroll. Esperado: mesma faixa de antes (97-100fps confirmada pelo usuário) — a scanline/stagger são animações CSS que rodam uma vez só, no boot, não competem com o loop de `core.js`.

- [ ] **Step 6: Commit**

```bash
git add styles.css
git commit -m "feat: scanline de boot e cascata de entrada do hero"
```

---

## Self-Review

**Spec coverage:** markup/CSS do overlay (Task 1), guardas + ciclo de vida (Task 2), scanline + stagger (Task 3), placeholder de vídeo trocável sem código (Task 1/2, `data-src` aponta pro asset existente), replay toda visita (Task 2, sem storage em lugar nenhum do código), `reduced-motion` coberto pela regra global existente (anotado em Global Constraints e Task 3, sem CSS novo) — todas as seções do spec têm task correspondente.

**Placeholder scan:** nenhum "TBD"/"depois"/"tratar erros" solto — todo código é completo e executável como escrito.

**Type consistency:** `finish(instant)` usado com a mesma assinatura em todos os call sites (`ended`→`finish(false)`, `error`→`finish(true)`, `skip.click`→`finish(false)`, guarda de rede/motion→`finish(true)`, `data-src` ausente→`finish(true)`, cap de segurança→`finish(false)`, timeout de metadata→`finish(true)`). Classes `intro-active`/`booted`/`intro--done` nomeadas de forma consistente entre `js/intro.js` (Task 2) e `styles.css` (Tasks 1 e 3).
