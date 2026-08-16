# beyon.0 — transferência de contexto

**Última atualização:** 2026-08-16 · **Branch ativa:** `rebuild` · **HEAD:** `e267d45`

Leia este arquivo primeiro. Depois `docs/auditoria-performance.md` — ele contém
as medições que justificam toda a arquitetura atual e evita repetir erros caros.

---

## 1. O projeto

Landing page one-page para captar clientes que querem site.

- **Local:** `C:\Vault - Fernando\Beyon 0`
- **No ar:** https://beyon0-site.vercel.app
- **Repo:** github.com/fernando123-hue/beyon0-site (privado)
- **Deploy:** todo `git push` na `main` publica automaticamente na Vercel.
- **Contato:** WhatsApp `5521977167944`
- **Stack:** HTML + CSS + JS puro. **Sem build, sem bundler.** CSP
  `script-src 'self'`. Windows, PowerShell + Bash.

---

## 2. Estado das branches — LEIA ANTES DE MEXER

| Branch | HEAD | O que é |
|---|---|---|
| `origin/main` (**no ar**) | `0d1ea34` | Site publicado. **Não tem nada das sessões recentes.** Roda a 20–30fps. |
| `main` (local) | `716bf35` | 9 commits **não pushados**: tipografia viva, GSAP, specs do 3D, 3 rodadas de otimização. Roda a 8–10fps. **Caminho abandonado.** |
| `feat/ai-core-3d` | `df0458f` | 13 commits: Three.js + reator 3D, 66 testes passando. **Pausado**, não descartado. |
| **`rebuild`** (atual) | `e267d45` | **A reconstrução + intro em vídeo + linha viva que persegue o scroll. É onde o trabalho continua.** |

O dono pediu a reconstrução do zero depois que a otimização incremental falhou.
Nada foi deletado: `main` e `feat/ai-core-3d` seguem intactas como referência.

---

## 3. A história curta (por que chegamos aqui)

O site travava — 20–30fps no publicado, 8–10 no local. Foram feitas **três
rodadas de otimização por dedução, todas erradas**, e a terceira piorou o site
(foi revertida). O erro de método: media-se **contagens** (quantos elementos,
quantos gradientes, quantos pixels) tratando-as como **tempo**.

Ao finalmente medir, o gargalo apareceu:

| Etapa | Custo |
|---|---|
| Layout | 0 ms |
| `getBoundingClientRect` × 574 | 1,06 ms |
| Desenho em canvas | ~1 ms |
| **Recálculo de estilo** | **76–92 ms** |

O orçamento de um frame a 60fps é 16,7ms. O site escrevia variáveis CSS **a cada
frame** — cada escrita custava 5 frames. A tipografia viva (205 spans) respondia
por 52ms disso, 68% do total.

**Detalhe importante: 68% do gargalo era código escrito por mim em sessão
anterior.**

---

## 4. As cinco leis (não negociáveis)

Saíram da medição, não de preferência. Violá-las traz o problema de volta.

1. **Nada visual contínuo passa pelo CSS.** Movimento e brilho vivem no canvas
   (~1ms a cena inteira).
2. **Variável CSS só muda em evento discreto** — nunca por frame, nunca no
   `:root` quando muitos elementos a leem.
3. **Efeito contínuo que precisa de centenas de unidades é desenhado, não
   estilizado.**
4. **Instrumentação sempre presente** (`?perf`).
5. **Degradação preventiva**: checa orçamento antes de gastar; sobe de novo
   quando há folga.

### Hipóteses já testadas e DESCARTADAS — não investigar de novo
- **Número de canvas**: sem degrau entre 1 e 24 (0,45–1,19 ms).
- **Gradientes por frame**: custam ~1 ms. Trocá-los por sprites em cache
  **piorou 1,4x** e foi revertido.
- **`backdrop-filter`**: era caro (2 MP reblurrados/frame) e foi removido, mas
  **não era o gargalo**.

---

## 5. Identidade visual — SAGRADA

Rampa ciano, matiz único. Nenhum hex fora dela em repouso.

```
--void #000000 · --deep #06272B · --mid #0F6A73
--glow #00F5FF · --hi #9FF8FF · --core #F2FEFF
--gold #FFC96B (raríssimo, só no Singular) · --led #E61A1A (só no medidor)
```

Fontes: **Sora** (300/400/600) + **JetBrains Mono**. Site 100% dark.
Sem vidro/plástico — "material tecnológico". Sem holofote seguindo o cursor.

---

## 6. Arquitetura atual (branch `rebuild`)

```
index.html      286 linhas   markup semântico, UM canvas (#fx), overlay #intro
styles.css      506 linhas   identidade estática, zero var por frame, linha viva
js/core.js      166 linhas   estado, loop único, orçamento, profilador
js/field.js     209 linhas   o canvas: campo + reator + brilho da tipografia
js/dom.js       160 linhas   reveals, nav, eventos (Pulso/Singular), medidor
js/intro.js      84 linhas   overlay de vídeo no boot — evento-só, sem rAF
js/sweep.js      92 linhas   a linha viva — dentro do loop único, persegue o scroll
```

Total **1.503 linhas**, contra 5.783 antes.

### `js/intro.js`
Overlay de vídeo (`assets/intro.mp4`) que toca antes do conteúdo aparecer.
**Não entra no loop `B.add`** — só ouve eventos do `<video>` (`ended`, `error`,
`loadedmetadata`) e do botão de pular. Guardas antes de baixar o vídeo:
`prefers-reduced-motion`, `saveData`, e `effectiveType` 2g/3g/slow-2g. Se
qualquer uma disparar, ou se `#intro`/`#introVid` não existir no markup, pula
direto pro `bootSemIntro()` — nunca trava o boot esperando um evento que não
vem. Ao terminar, adiciona `.booted` no `<body>` **e emite `'booted'`** — a
cascata do hero (CSS) e a linha viva (`js/sweep.js`) escutam os dois.

### `js/sweep.js` (novo desde a última transferência)
A linha que varre a página, dentro do loop único — não é mais CSS puro. Um
elemento real (`.sweep`), UM `transform` escrito por frame, nada mais.
Três estados, sem lógica de alvo: **atrás** do que o usuário vê → corre
rápido (5x); **dentro** da viewport → ritmo devagar (o da scanline antiga,
1287px/1,3s); **adiante** → para e espera, nunca foge de quem não rolou.
Ao cruzar cada `.reveal`, adiciona `.is-in` — a mesma classe que o
`IntersectionObserver` de `js/dom.js` já usa (intocado; os dois convivem,
quem chegar primeiro revela). Escuta o evento `'booted'` de `js/intro.js`
com uma checagem defensiva (`emit` não tem memória — se o listener registra
depois do disparo, perde o evento pra sempre; por isso os scripts carregam
nessa ordem: `sweep.js` antes de `intro.js`, e ainda assim `sweep.js` checa
se `.booted` já está no `<body>` antes de só esperar o evento).

Substituiu a scanline CSS estática (`body.booted::after` + `@keyframes
boot-scan`) do handoff anterior — pedido do dono depois de ver a linha
antiga parar só no hero: "eu gostaria que ela não parasse apenas no Hero...
o ideal é que dê a impressão que ela percorre sobre o site inteiro."
Primeira tentativa (só esticar o percurso da linha CSS pro tamanho do
documento, mesma duração) rodou visível pro dono e falhou — rápida demais
pra enxergar, sem parecer animação nenhuma. É a `js/sweep.js` atual que
resolve isso de verdade.

### Armadilha de CSS conhecida — `styles.css:68`
```css
body > *:not(#fx):not(.intro):not(.nav):not(.wa):not(.sweep) { position: relative; z-index: 1; }
```
`:not(#fx)` carrega a especificidade do seletor de ID que nega, então essa
regra tem especificidade (1,0,1) — mais alta que qualquer seletor de classe,
não importa a ordem no arquivo. **Qualquer filho direto de `<body>` que
precise de `position` diferente de `relative` tem que entrar nessa lista de
exclusão**, senão essa regra ganha e o elemento para de flutuar/varrer.
Já mordeu três vezes: `.intro` (overlay de vídeo), `.nav`/`.wa` (nav fixo e
botão de WhatsApp, corrigido em `cc36558`) e `.sweep` (a linha viva, pega
nesta mesma sessão antes de virar bug — `.sweep` é `position: absolute`,
não `fixed`, mas a regra intercepta qualquer valor não-`relative` do mesmo
jeito). Antes de adicionar um novo filho direto de `<body>` com `position`
próprio, checar esta linha primeiro.

### `js/core.js`
Expõe `window.BEYON = { S, add, on, emit, iniciar, reduced, fine, saveData, weak, PERF }`.
`S` é o estado compartilhado que todos leem: `t, dt, now, w, h, dpr, scroll,
px, py, pointerOn, energy, pulse, pulseFront, singular, warmth, budget, fps`.

Subsistemas registram com `B.add(nome, fn)` e recebem `S` por frame. **Um rAF
só.** O orçamento (`S.budget`, 0.25–1) cai quando o frame passa de 15ms e sobe
devagar quando sobra folga.

### `js/field.js`
O único canvas. Desenha em ordem: partículas → brumas (só com folga) → reator →
brilho da tipografia. Lê `S`, nunca escreve. Mede o DOM (retângulos do reator e
dos títulos `.glow`) **apenas em scroll/resize**, com flag `sujo`.

A cor sai da função `cor(base, warmth)`, que mistura ciano→dourado **dentro do
canvas** — nunca passa por token de CSS.

### `js/dom.js`
Links de WhatsApp, ano, reveals (IntersectionObserver com `unobserve` após
disparar), nav `.is-stuck`, o glitch de reescrita do status, e a máquina de
eventos: Pulso (a cada 9–20s, 2,6s de duração) e Estado Singular (a cada
~70–130s, 14s). Ambos escrevem **números** em `S` e trocam **uma classe** no
`<body>` (`.is-pulse`, `.is-singular`).

---

## 7. O que foi verificado, e o que NÃO foi

**Verificado por medição:** recálculo de estilo caiu de 76,5ms para **2,49ms**
(31x). 209 elementos, 1 canvas, 3 subsistemas, zero erro de console, sintaxe OK.

**NÃO verificado — e é importante:** o painel do navegador deste ambiente roda
com `document.hidden = true` e reporta `innerWidth: 0`. Consequências:
- `requestAnimationFrame` **nunca dispara** → nada anima, nada pode ser medido
  em tempo de frame.
- Sem viewport, o IntersectionObserver não intersecta → reveals ficam em 0.
- Custo de **pintura e composição é imensurável** aqui.

**Nada visual da reconstrução foi visto funcionando.** Layout, reator, reveals,
Pulso e Singular dependem do olho do dono, num navegador de verdade.

### Como testar (o dono roda no terminal DELE)
```bash
npx --yes http-server -p 8080 -c-1 -a 0.0.0.0
```
- PC: `http://localhost:8080/?perf`
- Celular: `http://192.168.0.111:8080/?perf`

No console: `copy(JSON.stringify(__perf(), null, 1))`.
Há um medidor de fps ao vivo no canto inferior esquerdo.

**Servidor iniciado pelo agente não serve** — roda em ambiente isolado e fica
preso em `127.0.0.1`. E abrir `index.html` por `file://` quebra tudo: a CSP
`script-src 'self'` bloqueia todo o JavaScript.

---

## 8. PONTO EXATO ONDE PAROU

A base da reconstrução (gargalo eliminado, `9b43e59`) recebeu de volta a
**intro em vídeo** que tinha sido cortada, mais uma **linha viva** que varre
o boot e persegue o scroll — nenhuma dessas é o Three.js/reator 3D antigo,
são feitas do zero dentro da arquitetura nova (canvas único + CSS estático).

Sequência desta sessão: spec → plano → implementação da intro
(`9b48883`) → scanline + cascata CSS (`1f3c032`) → três rodadas de fix
(overlay z-index/posição, fallback sem vídeo, scanline com percentual
errado) → bug pré-existente de `.nav`/`.wa` achado num review e corrigido
(`cc36558`) → dono testou ao vivo, **97-100fps confirmado, aprovado** →
dono pediu a linha percorrendo o site inteiro, não só o hero → primeira
tentativa (esticar a linha CSS pro tamanho do documento, mesma duração,
`a9f787e`) rodou pro dono e **falhou visualmente** ("rápida demais, sem
nenhuma animação") → brainstorm da versão certa: linha vira subsistema no
loop único, velocidade adaptada a estar dentro/atrás/adiante da viewport
do usuário → implementada (`js/sweep.js`) → review achou **2 bugs
críticos** antes de qualquer teste do dono: `emit('booted')` podia disparar
antes do listener registrar (linha nascia parada), e a lógica acelerava nos
dois sentidos (linha fugia e revelava o site inteiro em ~2,3s se o usuário
não rolasse) → corrigidos, re-revisados, aprovados → **`e267d45`**.

**Ainda não visto rodando pelo dono** nesta forma — mesma ressalva da seção 7:
o agente não consegue ver nada animar neste ambiente. A matemática da
velocidade foi validada por simulação isolada (fora do rAF real, que não
roda aqui), não por olho humano.

### Deixado deliberadamente de fora (herdado da reconstrução original)
- **Glitch/aurora nas palavras-chave** (`<em>` dos serviços) — hoje só cor.
- **Barramento animado** sob os serviços — hoje é texto estático.
- **Tilt nos cards** e o campo de "memória" do cursor.
- **Reescrita de frases no Singular** (só o status do hero reescreve hoje).

### Próximos passos naturais
1. Dono roda e dá o veredito visual da linha viva (`js/sweep.js`) — ela
   varre certo, para na borda da viewport quando ele não rola, acelera
   quando ele pula longe? Número de fps (`?perf`).
2. Trazer de volta o que fizer falta da lista acima, **um por vez**, cada um
   com orçamento de performance medido pelo `?perf`.
3. Decidir o destino de `feat/ai-core-3d` (o reator 3D em Three.js, 66 testes
   passando) — a reconstrução mudou a fundação, então aquela branch precisará de
   adaptação se for retomada.
4. Quando aprovado: merge `rebuild` → `main` e push (que publica).

---

## 9. Pendências antigas ainda abertas

- `assets/intro.mp4` (4,4 MB) está religado no boot desde `9b48883`, com
  guardas de rede/motion (seção 6). Vale comprimir antes do dono aprovar
  definitivo — ainda não medido o impacto real em conexão lenta.
- Histórico do git carrega ~50 MB de assets mortos (`Logo.gif` 20 MB,
  `introdução.mp4` 30 MB — nome antigo, não confundir com `intro.mp4` atual).
  Só `git filter-repo` limpa, e é destrutivo.
- O logo em vídeo (antigo, removido a pedido do dono) continua fora; a marca
  segue sendo o wordmark em texto. A intro em vídeo atual é conceito
  diferente (overlay de boot, não o logo). Não confundir os dois ao decidir
  o que recolocar.

---

## 10. Como trabalhar com este dono

- Português, direto, sem enrolação. Ele valoriza bug apontado sem ser perguntado.
- Ele testa no PC e no celular e dá o veredito visual — **o agente não consegue
  ver nada animar**.
- Commits em português, terminando com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Não pushar sem pedido** — push é deploy.
- Antes de otimizar: **medir**. Esta sessão provou o custo de não fazer isso.
