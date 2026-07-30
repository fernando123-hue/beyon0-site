# Sistema de Energia Viva — arquitetura

> Fonte da verdade da direção "organismo energético único".
> Rampa de cor permanece imutável (ver `docs/design-tokens.md`).
> Stack: HTML/CSS/JS puro, sem build. Servido via http-server 8777.

## Filosofia

O site é uma IA viva: respira, percebe, responde, acumula energia, processa.
Nada reage isolado. Toda interação gera reação em cadeia. Um único conceito:
**energia inteligente**. Sem glow genérico, sem partícula aleatória, sem neon de
template, sem luz seguindo o cursor. O cursor é normal — quem reage é o ambiente.

## Modelo mental

```
cursor → deforma o CAMPO → partículas reorganizam → linhas reagem
       → iluminação muda → texto responde → componentes vizinhos → fundo
```

Cadeia emergente, não hardcoded: um componente ativo escreve de volta no campo;
os vizinhos amostram esse campo no frame seguinte.

## Arquitetura

Núcleo único + subsistemas plugados. 1 rAF só.

```
EnergyField  (fonte única da verdade, 1 rAF orquestrador)
 ├─ state: {E(0..1), t, quality, res, sing, mood, core}
 ├─ stageExc(pos) → excitação do elo em pos ∈ [0..1]   ◄── PRIMITIVA 1
 └─ subs[]: cada subsistema registra um tick(now); loop chama todos/frame

Subsistemas (leem do núcleo, NENHUM tem rAF próprio):
 1. PointerReactors — magnetismo + tilt + nav (do globalLoop atual)
 2. ParticleLayer   — neural field refatorado; intensidade = f(E)
 3. MemoryLayer     — nós que decaem onde o cursor pausou (substitui trail)
 4. CoreNucleus     — AI Core no hero; rege partículas + reage a cursor/E
 5. DomReactors     — amostram o campo no próprio centro → --energy  ◄── PRIMITIVA 2
 6. Typography      — corrente + faíscas nas letras (canvas overlay)
 7. Resonance       — orquestra o ACONTECIMENTO (silêncio→compressão→release→eco)
 8. Accumulator     — calcula E de scroll + dwell + interação
```

### Primitiva 1 — `stageExc(pos)`
Corcova gaussiana viajando com a frente da ressonância: dado o elo em `pos`,
devolve quanta energia está passando por ele agora. Canvas E DOM perguntam à
mesma função — é o que faz a onda propagar em ordem, e não como flash global.

> Histórico: a spec original previa `influenceAt(x,y)` como Primitiva 1. Ela foi
> implementada mas nunca chamada — o campo do núcleo (`AICore.fieldAt`) e a
> proximidade do cursor dos `DomReactors` cobriram o papel — e foi removida na
> auditoria de 2026-07-29. `stageExc` é a primitiva que de fato compartilha campo.

### Primitiva 2 — convenção `--energy`
Todo elemento reativo expõe `--energy` (0..1). JS seta do campo; CSS lê para
glow/lift/text. Mata duplicação: 1 sampler JS + 1 padrão CSS no lugar de hover
bespoke por componente. Usa `@property --energy` (interpolação compositor-friendly).

## Decisões travadas

- **Tipografia (Fase 4): full canvas.** Partículas reais escapam de cada glyph via
  canvas overlay por palavra. Restrito a hero + títulos, só em viewport + perto do
  cursor, com budget de partículas capado e degrade por fps.
- **Cursor:** `#cursorLight` (halo) e o `trail[]` do neural são REMOVIDOS. Memória
  vira nós de energia que decaem, não rastro de linha.

## Componentes no ecossistema

| Componente | Papel |
|---|---|
| `#atmos` canvas | ParticleLayer + MemoryLayer + Heartbeat |
| Hero emblem + aura | AI Core |
| Hero `<h1>` + `.kicker`/`h2` | tipografia viva |
| `.pain/.service/.step/.qa` (`.lit`) | reatores DOM + acoplamento vizinho |
| `.mock` (`.tilt`) | reatores + parallax de profundidade |
| `.btn`/`.nav__cta`/`.wa-float` | sequência "despertar" (proximidade) |
| `.cta-panel` | reator + eco do núcleo |
| footer | cauda de baixa energia (auge acumulado) |
| medidor | inalterado (métrica real) |

## Riscos de performance + mitigação

| Risco | Mitigação |
|---|---|
| `getBoundingClientRect` por frame = layout thrash | cache de rects; recalcula em scroll/resize throttled; IO só on-screen; amostra só perto do cursor |
| escrever `--energy` em muitos elementos/frame | só se Δ > epsilon; cap de reatores ativos; `@property` typed |
| sinapses O(n²) + E subindo N | localidade por hub; cap N por device E por fps medido (recicla degrade do vórtice) |
| tipografia canvas por glyph | limita hero+títulos; só viewport+perto do cursor; budget capado; degrade por fps |
| scroll jank | E lê scrollY no rAF (read-only); zero handler de scroll com layout |
| mobile sem hover | campo cai pra heartbeat + scroll-energy; sem sampling DOM/frame; N reduzido; tap mantém `.is-lit` |
| blur backdrop (nav/medidor) | não adiciona blur novo |
| reduced-motion / saveData / memory<4 | organismo desliga → estático |

## Plano por fases (cada uma testável antes de avançar)

- **Fase 0 — Fundação (invisível + limpeza).** Fundir os 2 rAF num `EnergyField`;
  expor state + `influenceAt()`; refatorar neural + magnet/tilt pra consumir; matar
  `#cursorLight`. *Gate:* site idêntico (menos halo), 60fps, console limpo, 1 rAF.
- **Fase 1 — Acúmulo + batimento.** `Accumulator` (E de scroll+dwell) + `Heartbeat`.
  1 consumidor: intensidade do neural escala com E + pulso global sutil.
  *Gate:* rolar hero→footer intensifica; pulso discreto; `?debug` mostra E.
- **Fase 2 — Reatores DOM.** `--energy` + `DomReactors`. Cards e botões despertam
  antes do hover + acoplam vizinhos. *Gate:* vizinhos reagem; 60fps; mobile ok.
- **Fase 3 — Memória + AI Core.** `MemoryLayer` + `CoreNucleus`. *Gate:* pausa deixa
  energia que desvanece; núcleo vivo; zero rastro de linha.
- **Fase 4 — Tipografia viva (full canvas).** Corrente + faíscas escapando nas letras.
  *Gate:* aproximar do `<h1>` → corrente + faíscas; reduced-motion estático; perf ok.
- **Fase 5 — Profundidade + polish.** Parallax de camadas, reflexos, curva de E,
  passes mobile/reduced-motion, Lighthouse. *Gate:* matriz 360–1920, sem overflow.

## RESSONÂNCIA ENERGÉTICA (fenômeno físico — timeline mestre Anime.js)

O `pulse`/`beat` foi REMOVIDO. No lugar, um ACONTECIMENTO com narrativa física,
dirigido por uma **timeline mestre única do Anime.js** (`vendor/anime.umd.min.js`,
v4). A timeline (`autoplay:false`) tweena os números de `EnergyField.res`; o loop
único do organismo faz `seek(resElapsed)` a cada frame → **1 rAF só** (anime = só
motor de interpolação/keyframes, não um segundo loop). Fallback numérico
(`stepResonanceFallback`) se o anime faltar. Todos os subsistemas SÓ observam `res`.

Estado compartilhado `EnergyField.res`:
- `charge` 0..1 — tensão ("prende a respiração"); segura na compressão.
- `space` 0..1 — COMPRESSÃO ESPACIAL: `#atmos`/`#resfx` escalam de leve (origem no
  núcleo) → o próprio vazio participa. Solta no release.
- `front` 0..1 — frente da onda percorrendo a cadeia (só se move no release).
- `reveal` 0..1 — revelação temporária.
- `amp` 0..1 — envelope global (dispara no release, decai no eco = absorção).
- `arch`/`w` — arquétipo do evento + pesos dos elos (ver abaixo). `gen` — geração.

Primitiva `stageExc(pos)` = corcova gaussiana viajando com `front`. Elos:
**núcleo 0.0 → campo 0.12 → conexões 0.25 → partículas 0.40 → tipografia 0.55 →
cards 0.70 → botões 0.85 → fundo 1.0**. Propagação em ordem, nunca flash.

**OVERLAP real:** offsets `_c` (compressão entra a 55% do silêncio), `_r` (release
a 60% da compressão), `_e` (eco a 62% do release). Verificado headless: no início
do release `front≈.11` com `charge≈1.0` — sem fronteira perceptível.

**FÍSICA da compressão:** partículas CONVERGEM pro núcleo (gravitação, gated por
`charge` e `front<0.2`) ANTES do release empurrar pra fora → o release tem origem
física. Núcleo = coração: a ressonância nasce nele (`stageExc(0.0)` primeiro).

**ARQUÉTIPOS (comportamento, não randomização):** `core`/`web`/`swarm`/`deep`. O
sistema ESCOLHE um por contexto (perto do núcleo→core, movimento→swarm, jornada
funda→eco longo) e nunca repete o anterior. Cada um redistribui pesos `wCore/wConn/
wPart/wType` (consumidos por núcleo, sinapses, impulso, tipografia, filamentos) e
durações → cada evento tem protagonista diferente. No fim: `evolveBehavior()` deriva
o humor persistente NA DIREÇÃO do arquétipo (não `rnd` puro) + `gen++` → `remutate`.

Gatilhos: carga que enche com o tempo mas acelera por contexto. Cooldown mín. 4.5s.
DOM via CSS vars gated (`--res`, `--res-reveal`, `--res-space`, `--res-cards/-btns/
-bg`). Revelação = `#resfx` (grade+bordas) + filamentos no canvas. Reduced-motion off.

PENDENTE (afinar no vivo, aba em foco) + autoavaliação do dono:
- Q4 (escala) e Q5 (núcleo comanda) parcialmente atendidas — a ressonância ainda é
  majoritariamente screen-space no canvas, e "o resto obedece ao núcleo" pode ir além
  (núcleo gatilhando/gateando outros subsistemas explicitamente). Próximo alvo.
- Calibrar no vivo: `power`, durações por arquétipo, pesos, `stageExc` sigma (0.05),
  escala de `--res-space` (0.018), convergência (0.02), impulso (0.3).

## AI CORE — A ENTIDADE (reconstruído do zero)

Não é componente: é o coração do universo. Módulo próprio `AICore` (main.js),
estado público em `EnergyField.core`. Atualizado ANTES de todo o resto no frame —
o ecossistema segue o núcleo, nunca o contrário. Sem rAF próprio.

**Cinco camadas.** (1) NÚCLEO: casca de energia contida; o pico de luz fica em
0.68R e o miolo recebe alfa ZERO — o interior nunca se revela (verificado: centro
luminância 0, casca 510). (2) CAMPO: `fieldAt(x,y)` = gravidade real 1/r² com
softening, componente tangencial e canalização em linhas de campo (harmônico
angular + viés da atenção) MENOS pressão de radiação 1/r³ — o núcleo não só
engole, devolve. Sem raio de órbita alvo. (3) ESTRUTURA: 4 braços em espiral
logarítmica; uma onda de tensão revela só fragmentos. (4) CONSCIÊNCIA: `decide()`
a cada 3.8–9.2s escolhe intenção (mudar atenção / condensar / difundir / emitir
sonda), com transição eased — deliberação, não ruído. (5) RESPIRAÇÃO: envelope
assimétrico (inspira lento, contém, expira) com período que deriva sozinho;
oscilação de raio ~5% (quase imperceptível).

**Emergência verificada** — as decisões mudam a física de verdade:
| estado | capturadas | escapam | orbitando |
|---|---|---|---|
| difunde / repouso | 0 | 20 | 180 |
| condensa (o núcleo decide) | 32 | 20 | 148 |
| Singular | 152 | 0 | 48 |
Em repouso o núcleo CONTÉM a energia; captura quando decide condensar ou quando o
usuário se aproxima (excite soma em gN); no Singular a atração supera a própria
pressão e o colapso é inevitável. Energia absorvida não some: `emitPoint()` a
reemite por um dos braços.

**Sem loop perceptível**: todas as frequências em razão áurea (φ) — a deriva de
posição não se refecha. **Campo escala com a presença**: ao rolar, o núcleo recua
e afrouxa o domínio (sem força fantasma com o hero fora de tela); no Singular a
presença é imposta e ignora o scroll.

**Exaustão**: ao fim do Singular, `exhaust()` → fatigue=1, decai em ~13s: respiração
mais lenta e funda, energia menor. Não é desligamento, é cansaço.

## ESTADO SINGULAR — METAMORFOSE DE 20s (a IA assume; design system inteiro muda)

Não é efeito num componente: é a interface INTEIRA virando ciano→dourado plasma por
12s exatos, e voltando. Timeline mestre Anime.js (`buildSingularityTL`, autoplay:false,
seek pelo loop → 1 rAF). Total 12000ms verificado.

**O evento NÃO começa na interface — começa DENTRO do núcleo.** Fases:
compressão `[0–2600]` (o núcleo comprime a própria energia: strain sobe, R encolhe
de 92→59, campo intensifica, partículas convergem, ciano→BRANCO; a interface fica
quieta, amp≤0.12) → instante de **silêncio absoluto** (`hush`, ~150ms, tudo
escurece) → transcendência `[2600–4200]` (branco→dourado) → ápice `[4200–17000]`
(dourado pleno, circuitos sustentados) → resfriamento `[17000–20000]`.

**Gatilho**: escada `SING_P=[.15,.30,.55,1.00]` indexada por ressonâncias
concluídas — índice 0 = ENTRADA no site (pode ser o primeiro acontecimento).
Verificado: 14.9% entrada / 25.5% após 1ª / 32.9% após 2ª / 26.7% após 3ª,
zero casos passando da 3ª. Cooldown 30s.

**Estado `EnergyField.sing`**: `warmth` (temperatura 0..1), `grip` (domínio; cursor
autoridade = 1-grip), `amp`, `depth` (expansão), `front`, `reveal` (circuitos, sustentado).

**METAMORFOSE GLOBAL (`metamorph`)**: durante o evento o JS reescreve os TOKENS VIVOS
do `:root` (`--glow`, `--glow-rgb`, `--hi`, `--hi-rgb`, `--core-rgb`) a partir de
`warmth` via `plasmaColor` (ciano `#00f0ff` → branco `#fffbf0` → corona `#ffd000` /
central `#ffea9f`). Como o site inteiro já usa esses tokens, TODO glow/borda/texto/
ambiente/scrollbar vira dourado sem refatorar CSS. `body.singularity-active` liga
`::selection`, scrollbar e a moldura de circuito dos cards. Fim → `metamorphClear`
remove overrides → snap de volta ao ciano. (Verificado: card + ambiente viram dourado.)

**Canvas**: vórtice gravitacional reforçado (radial+tangencial forte+sucção, cursor
suspenso ×1-grip); partículas/sinapses/bruma em plasma; núcleo = estrela (centro
branco-quente, corona dourada, cresce c/ depth); FEIXES núcleo→cards visíveis no ápice
(rects amostrados a cada 15 frames); `#singfx` = radiação volumétrica de fundo.

**Clichês removidos** (refinamento): anel de partículas no cursor parado + ripple
circular do cursor rápido (template-y).

PENDENTE (calibração no vivo, aba em foco): intensidade do dourado/contraste, força do
vórtice, opacidade dos feixes/circuitos. Refinamento ecossistêmico restante: acoplar
magnet/tilt/vórtice-WebGL ao campo `E`.

## Auditoria adversarial (2026-07-25) — corrigido

- **Cor com degrau**: `plasmaColor` partia de ciano saturado para TODOS os papéis, então
  em `warmth=0` `--hi` pulava de `#9FF8FF` e `--core-rgb` de quase-branco para ciano puro.
  Agora tem `role` (0=glow/1=hi/2=core) e cada papel parte do valor EXATO do token em
  repouso → entra e sai da metamorfose sem degrau (verificado nos 3 papéis).
- **Duração NEGATIVA** no keyframe `amp` da ressonância (`r._r - a.durS` dava −97/−33/−24/−51ms
  nos 4 arquétipos) → salto de amp num frame. Segmento reescrito direto até `r._r`.
- **`--energy` preso aceso** após o Singular quando o ponteiro nunca se moveu (o tick dos
  reatores fazia `return` antes de decair). Agora decai mesmo sem ponteiro.
- **Pop das bordas**: `.singularity-active .lit` SUBSTITUÍA a lista de sombras base (e tinha
  constante `.4`), então cards piscavam ao entrar/sair. A regra agora reproduz a lista base
  e só SOMA os circuitos dirigidos por `--sing-reveal`.
- **Carga por frame, não por tempo**: `scheduleResonance` usava 16ms fixo → em 120Hz os
  eventos vinham 2x mais rápido. Agora usa `efDt` real. E o avanço de `efReach` é consumido
  sempre (antes ficava represado durante o cooldown e despejava de uma vez).
- **Órfãos removidos**: `--px/--py` (escritos todo frame, nenhum CSS lia) e o array `ripples`.

REFUTADO: "AICore.exhaust() é ReferenceError" — `requestAnimationFrame` é assíncrono, a
atribuição de `AICore` já ocorreu quando o loop roda (console limpo comprova).

### Resolvido (2026-07-25)
- **Seção 5 (vórtice WebGL) REMOVIDA** — 261 linhas mortas + `HERO_IMG` órfão. main.js
  2105→1871 linhas.
- **Nova rede de proteção de fps** (`watchQuality` no loop, `EnergyField.quality`): uma só,
  cobre o canvas neural. Só desce (1 → 0.62 → piso 0.38), sem oscilação. Cortes por degrau:
  bruma volumétrica (qual>0.7), sinapses O(n²) (qual≥0.5), halo dos nós de memória (qual>0.6),
  feixes do Singular (qual>0.5). Verificado.
- `will-change` permanente removido do `#singfx`.

### Aberto (decisão do dono)
- `EnergyField.sing.gen` é incrementado e nunca lido (o Singular não muta o humor no fim,
  só a ressonância — pode ser intencional).
- `assets/` passou a separar **arte-mestre** (`Logo.gif`, `introdução.mp4` — nunca
  baixadas pelo visitante) de **derivados servidos** (`Logo-definitiva.mp4`, `intro.mp4`,
  `og-cover.jpg`). Detalhes e comandos de reexport em `assets/README.txt`.
- `og:image` ainda é caminho relativo: crawlers precisam de URL absoluta. Resolver junto
  com o domínio (mesmo `[PREENCHER]` do `canonical`/`og:url`).

## Auditoria de evolução contínua (2026-07-29)

- **Logo quebrado corrigido** — os dois `<video>` de `Logo-definitiva.mp4` renderizavam
  vazio (404 confirmado em rede). O arquivo foi **gerado a partir de `assets/Logo.gif`**:
  a arte tem fundo transparente (verificado compositando sobre magenta), então o alpha foi
  achatado sobre **preto**, que é exatamente o que o `mix-blend-mode: screen` do CSS espera.
  Encode: H.264 `yuv420p`, 640×200 (aspecto nativo 3.2, ~3× o tamanho de exibição),
  30fps, 5.03s, `+faststart`, sem áudio, CRF 21 → **172 KB** (era 20 MB de GIF).
  Os atributos `width`/`height` estavam em 266×119 (aspecto 2.24, errado) e passaram a
  640×200 — some a fonte de layout shift. O wordmark segue como fallback automático se o
  arquivo sumir ou o codec falhar.
- **Logo fora de tela pausa** — o logo do rodapé passa quase toda a sessão fora da
  viewport; `IntersectionObserver` pausa/retoma o `<video>` em vez de decodificar 30fps à toa.
- **Intro 30MB → 4,2MB** — `introdução.mp4` estava a **48 Mbps** (bitrate muito acima do
  necessário). Reencodada para `intro.mp4` em CRF 26 mantendo a resolução nativa
  1732×1152: testado que baixar para 1280 amassava o detalhe fino do líquido, então só o
  bitrate caiu. −85% de peso, sem perda visível no crop 1:1. O master fica intacto.
- **`og:image` restaurado** — apontava para `assets/hero.jpg`, que não existe mais.
  Novo `og-cover.jpg` 1200×630 (88KB) gerado de um frame do vórtice, + `og:image:width/height`.
- **Nomes de arquivo servidos** — convenção só-ASCII registrada no README: `introdução.mp4`
  exigiria percent-encoding e alguns CDNs mangam acento. Por isso o derivado servido é
  `intro.mp4`, e o acentuado ficou só como master local.
- **Bug de especificidade no CTA** — `.cta-panel > :not(.cta-panel__glow)` (0,2,0) vencia
  `.energy-glow` (0,1,0) e transformava o halo injetado num bloco `relative` de altura 0
  no topo do painel: o glow virava uma barra de luz horizontal. Selector passou a excluir
  também `.energy-glow`.
- **Reatores mortos removidos** — `.btn`/`.nav__cta` recebiam `.energy-glow` mas têm
  `overflow:hidden` e nenhuma regra que leia o `--energy` deles: nada pintava. Fora do
  seletor (20 reatores em vez de 25) + regra CSS órfã removida.
- **Sinapses sem lixo** — o agrupamento por hub varria `ps` inteiro por hub e alocava um
  array novo por hub **a cada frame**. Agora buckets reaproveitados: O(N) e zero alocação.
- **Módulos fora da viewport pausam** — a borda condutiva repintava conic-gradients a
  60fps mesmo fora de tela. `IntersectionObserver` → `.is-idle` → `animation-play-state:
  paused` (a fase retoma de onde parou, nada pipoca).
- **`updateNav`** só escreve no DOM quando o estado realmente vira (antes: `classList.toggle`
  a cada frame).
- **Paleta com fonte única** — canvas e tipografia liam literais RGB duplicados dos tokens
  (`0,245,255` etc.). Agora `PALETTE` lê `--glow-rgb/--hi-rgb/--core-rgb/--gold-rgb` do
  `:root` uma vez no boot; `PLASMA_REST` deriva daí. Zero risco de drift JS↔CSS.
- **Segurança** — CSP via `<meta>` (script-src sem `unsafe-inline`, verificado bloqueando
  script inline), `referrer` policy, `rel="noopener noreferrer"` aplicado também pelo JS,
  e o painel do medidor deixou de usar `innerHTML` (montagem por nó).
- **Robustez** — guardas de null na intro e no medidor (a assinatura virou IIFE própria:
  sem o markup dela, o resto do organismo segue vivo).
- **Acessibilidade** — `<main>` adicionado; `aria-hidden` saiu do container da intro (ele
  continha o botão "pular", que precisa ser alcançável) e foi para o `<video>`;
  `aria-controls` no botão do medidor.
- **Morto removido** — `--px`/`--py`, `.sr-only`, `.hero__canvas` do `<noscript>`,
  `influenceAt`, regras `.nav__cta` e `.btn--ghost:hover` duplicadas, comentários de
  seções que não existem mais.
- **Pendente (precisa de ferramenta externa)** — reencodar `upscaled-video.mp4` e exportar
  `Logo.gif` para MP4/WebM. Não há `ffmpeg` no ambiente.
- **Pendente (precisa de servidor)** — `frame-ancestors`/`X-Frame-Options`, HSTS,
  `X-Content-Type-Options`, `Permissions-Policy`: `<meta>` não suporta esses cabeçalhos.

## BORDA CONDUTIVA (referência: Shine Border / Magic UI, adaptada)

Anel de borda em 20 superfícies (`.lit` ×16, `.cta-panel`, `.mock__frame` ×3),
`::after` recortado por `mask-composite: exclude` (só a moldura pinta). Não há
giro, scanner ou gradiente dando a volta. A borda é composta por três estratos:
um circuito-base assimétrico e fixo + dois campos largos que só oscilam dentro de
setores locais, em contra-deriva e com períodos desencontrados (16s/23s), além de
uma variação lenta de condutividade (9s). Isso cria concentrações de energia que
se formam e enfraquecem como material vivo, nunca como LED decorativo.

- **Cor** vem dos tokens vivos `--hi-rgb`/`--glow-rgb` → no Singular a `metamorph()`
  já os vira Dourado Plasma, então a borda acompanha a metamorfose global SEM lógica
  duplicada (verificado: ciano→#ffea9f/#ffd000→ciano).
- **Intensidade** segue `--energy` (proximidade/ressonância/sync do Singular) — a
  mesma var do ecossistema. Exigiu trocar `@property --energy` para `inherits:true`
  (senão o pseudo não lê a energia do card). Verificado: alfa 0.16→0.435→0.71.
- **Premium**: 1.3px, alfas baixos, deriva local e fases desincronizadas por
  `:nth-child`; nenhum ciclo completa uma volta.
- **Perf**: o 1º degrau de qualidade preserva o fluxo; só o piso (`q=.38`) adiciona
  `body.no-shine` e congela a borda. Reduced-motion idem.
- **AI Core está simples demais** (feedback do dono, Fase 3). Funciona (halo +
  filamentos + anel + centro pulsante, partículas orbitam, reage a cursor/E), mas
  o dono quer voltar e enriquecer o visual depois. Deixado como está por ora.
- **Tipografia viva PARKADA (Fase 4).** A v2 (letras feitas de energia / máscara
  recortando plasma) ficou ilegível — o dono pediu reverter. Restaurada a v1
  (pontos sutis sobre os glifos, só perto do cursor; em repouso título limpo).
  Rework do zero depois: o objetivo continua "letras vivas" mas SEM perder
  legibilidade. Ideias p/ próxima tentativa: efeito só no hover real, contraste
  garantido, talvez SVG/filtro em vez de canvas por cima do texto.
- DEV-CRANK **afinado na Fase 5**: brilho do campo (E*0.95), ambiente (.14/.06),
  sinapses (E*1.0), taxa de pulsos (E*2.5). O **batimento** foi REMOVIDO e trocado
  pela Ressonância (seção acima) — calibração fina no vivo ainda pendente.
- Parallax de profundidade adicionado (Fase 5): fundo ambiente `body::before`
  deriva com o scroll (`--par-amb` = scrollY*0.04, capado ±220), oversized sem gaps.

## CARDS DE SERVIÇO — referência de material (2026-07-29, etapa A)

O dono entregou uma imagem de referência dos 6 cards de serviço e pediu engenharia
reversa fiel + integração total, não inspiração. Os `.service` viraram a
**referência de material do site**; os demais `.lit` seguem intactos.

Decomposição aplicada (aparência):

- **Layout vertical**: tile de ícone 64px (radius 16) no topo, respiro de 2.35rem,
  título, régua, texto. `min-height: 16.5rem` — o vazio faz parte do design.
- **Tipografia**: título saiu do mono `.78rem` para Sora **300**, uppercase,
  `clamp(1.18rem, 1.6vw, 1.42rem)`, tracking `.055em`. Corpo `.95rem/1.62`.
- **Régua condutiva** (`.service__rule`) 42×2px sob o título — primeiro trecho de
  circuito exposto; escala em X com `--module-drive` e `--res-cards`.
- **Palavras-chave em ciano** (`<em>` no HTML, `font-style: normal`), com
  text-shadow que acompanha a energia.
- **Três nós** (`.service__nodes`, um span + 2 box-shadows) no rodapé: sinal de
  que a placa está no barramento. Alfas escalonados por `--module-drive`.
- **Frame duplo**: a câmara interna (`::before`) foi movida para `inset: 10px` com
  borda própria. O segundo anel não é decoração — é o limite visível do material.
- **Interior**: menos ruído (.18), luz radial atrás do ícone (16% 12%), vinheta
  inferior. Quase preto, como na referência.

Integração (sem sistema novo — tudo pendura no que já existia):

- Toda intensidade vem de `--module-drive`/`--module-sing`, então percepção,
  memória energética, Ressonância e Singular já regem o card inteiro.
- **`--shine-gain` / `--bloom-gain` / `--shine-w`**: knobs por tipo de módulo. O
  anel virou `--shine-m = --shine-k × --shine-gain`, uma linha, sem duplicar o
  background. `.service` usa 4.4 / 1.9 / 1.7px; todo o resto fica no default 1
  (verificado: pico `.service` .29 em repouso vs .067 nos demais — zero regressão).
- **Nó branco-quente**: setor estreito (95°–105°) do fluxo primário satura até
  `--core-rgb`. Continua dentro da rampa.
- **Bloom não-uniforme**: `drop-shadow` no `::after` mascarado → a luz segue o alfa
  do próprio anel, então só os trechos carregados irradiam. Um `box-shadow` daria
  halo uniforme e entregaria o truque. Cai no primeiro degrau da rede de FPS
  (`.no-shine … ::after { filter: none }`).
- Verificado: flip Dourado Plasma pega ícone, régua, nós, `em` e anel pelos tokens
  globais e volta 100% ao ciano; `.no-shine` mata animação e filtro; overflowX 0 em
  1280 e em 375 (mobile ajusta `--pad-x`, ícone 56px, min-height 14.5rem).

## BARRAMENTO DA SEÇÃO — filamentos card ↔ núcleo (etapa B)

`serviceBus()` em main.js (§3c-ter). Canvas próprio (`.bus__cv`) ATRÁS da grade,
dpr 1, blend aditivo, **sem rAF próprio** (registra em `EnergyField.add`). Aparece
só no vazio entre os módulos — por isso o `row-gap` da grade sobe para `5.5rem`
acima de 760px: o espaço é físico, não estético.

- **O núcleo da seção não é um segundo AI Core.** É a mesma entidade se
  manifestando localmente: raio, respiração, potência e ignição estelar saem de
  `EnergyField.core` (`pow`/`breath`/`strain`/`star`).
- **Âncora** de cada filamento = onde a reta centro-do-card → núcleo fura o
  retângulo do card. Sai sozinha na lateral certa, e no meio dela quando estão
  alinhados. Recalculada só em scroll/resize (`dirty`).
- **Sentido do fluxo conta a história**: em repouso o card ALIMENTA o núcleo
  (pacotes correm para dentro); durante a Ressonância o núcleo DEVOLVE (`dir=-1`).
- **Intensidade** usa a primitiva `stageExc(0.25)` — o elo "conexões" — então a
  onda chega aqui ANTES dos cards (0.70), na ordem da cadeia. Nada temporizado à mão.
- Curvatura com wobble lento em razão áurea e fase por card: o filamento é
  *sustentado*, não redesenhado. Pacotes nascem e morrem nas pontas (`sin(u·π)`).
- **Faixa "CONECTADO AO AI CORE"**: HTML/CSS (`.bus__label` + 2 SVG de waveform),
  reagindo a `--ef-e` e `--res-cards`. Sem custo de canvas.

Verificado (módulo extraído por XHR + `new Function` com stubs, desenhando no
canvas real e lendo pixels — a aba fica `hidden` e o rAF não roda):

- desenha: canvas assume 1096×689, núcleo branco-ciano no centro, anel em +16px,
  1.5% de pixels acesos (sutil), cantos limpos;
- `--energy` num card acende o filamento dele (11316 → 12429 px);
- Ressonância inunda o barramento (28096 px);
- **metamorfose**: média ciano `(12,245,253)` → Singular `(253,210,13)` Dourado
  Plasma → volta `(11,245,253)`, pelo mesmo `plasmaColor` do campo neural;
- `quality` no piso corta os pacotes; abaixo de 700px o canvas some (`display:none`)
  e o `row-gap` volta a 24px — em 1 coluna um núcleo central não descreve nada;
- overflowX 0 em 1280 e 375; console limpo; `node --check` OK.

NÃO medido: a inversão do fluxo é lógica de uma linha (`dir = R.active ? -1 : 1`),
verificada por leitura, não por pixel. E o movimento vivo (deriva, pacotes,
respiração) exige a aba em foco — validar no olho.

### Correção pós-review do dono (Singular): conduíte vivo + corpo etéreo

**Bug real encontrado:** `stageExc()` retorna 0 fora da Ressonância. No Singular
`link` era 0, então velocidade dos pacotes, alfa, raio do núcleo e a linha de
barramento caíam todos no piso — o barramento ficava apagado e quase parado
exatamente quando deveria estar carregando a estrutura. Além disso `dir` só
invertia na Ressonância, então no Singular o fluxo ainda apontava card → núcleo.

- Novos escalares: `surge` (carga do Singular, de `S.amp`/`S.grip`) e
  `flow = link + surge*1.3`. Tudo que usava `link` para *intensidade* passou a
  usar `flow`; `link` segue só onde o significado é "a cadeia está propagando".
- `dir = (R.active || singOn) ? -1 : 1` — no Singular o núcleo ALIMENTA os cards.
- Conduíte agora tem três estratos: **bainha** (tubo largo e fraco que incha com
  `flow`), **fio** (o condutor) e **fluxo** — traço `setLineDash` deslizando
  DENTRO do tubo via `lineDashOffset`, fase própria por filamento. É o dash que
  faz a energia *correr de ponta a ponta* em vez de piscar no lugar.
- Trem de pacotes enche sob carga (2 em repouso → 4 no ápice).
- `.bus__cv` ganhou `+ var(--sing) * .45` na opacidade.

Medido (módulo extraído, canvas real): repouso → ápice = pixels acesos 11.750 →
73.238 (6,2×), alfa médio 20 → 57,4 (2,9×), pixels quentes 233 → 12.454 (53×).
Movimento por 100ms: 15 px alterados em repouso → **9.990** no Singular.

**Corpo dos cards — etéreo** (bordas intocadas por pedido explícito do dono):
profundidade passou a nascer de LUZ, não de preto opaco. Stop mais denso caiu de
`.96` → `.44`; grão de energia mais fino (baseFrequency 1.1 / opacity .09); dois
focos de luz (glow atrás do ícone, `--mid` no canto oposto) no lugar da vinheta
preta; sombra interna de `void .5` → `.2`. Nenhum stop é opaco, então o barramento
atrás atravessa a matéria e o módulo lê como suspenso. Sem `backdrop-filter` —
vidro segue proibido nesta identidade.

**Legibilidade (achado próprio, não pedido):** com o corpo leve, o dourado do
ápice atravessava e o texto caía para **3,6:1** — abaixo do mínimo. O termo
`--module-sing` da camada de condensação foi para `.34/.42/.38`: a matéria adensa
quando a energia satura (que é também a física certa). Medido compondo as camadas
reais: **repouso 8,91:1 · ápice do Singular 5,59:1**, ambos acima de 4,5:1.

Bordas conferidas idênticas depois da mudança: anel `1.7px`, `--shine-gain 4.4`,
`--bloom-gain 1.9`, pico do anel `.29`, `drop-shadow .57`, frame duplo `inset 10px`.

### Corpo do card v3 — energia condensada (leitura de Liquid Glass)

Dono apontou estranheza no fundo do card e mandou o Liquid Glass do kokonutui
como referência, explicitamente para INSPIRAR, não copiar. A página não publica os
números; o que ela revela é o método: *Apple-inspired, SVG displacement filters
for a refractive effect* — ou seja, refração na BORDA. Borda aqui é território
travado por pedido do dono, então o conceito entrou pelo corpo.

**Duas causas concretas da estranheza (não era gosto, era bug):**

1. **`transparent` em gradiente.** A palavra-chave interpola para *preto*
   transparente (`rgba(0,0,0,0)`). Sob `screen`/`overlay` isso deixava uma faixa
   suja atravessando a placa — o banding que aparecia na captura. Todo
   desvanecimento passou a ser a própria cor com alpha 0.
2. **O barramento pintava por baixo das placas.** Com o corpo translúcido da v2,
   o filamento vazava e lia como arranhão dentro do conteúdo. O spec já dizia que
   a energia vive "só no vazio entre os módulos" — nunca havia sido imposto.
   `clipToVoid()` recorta o canvas em (área − placas arredondadas) com
   `clip('evenodd')` + `roundRect`. O filamento morre exatamente onde encosta,
   como se entrasse na matéria.

**Corpo novo:** grão fino (.07) · **lençol especular** diagonal em `soft-light`
(faixa larguíssima, alpha mínimo, sem aresta — é o que dá o aspecto líquido) ·
dois focos de luz com raio >100% para nunca fecharem dentro do corpo · condensação
com 4 stops (poucos stops em área grande sobre preto produzem banding) ·
**refração real** por `backdrop-filter: blur(7px) saturate(1.14)` sob `@supports`,
para o que está atrás entrar como luz difusa em vez de desenho legível.

Verificado: zero `transparent` e zero `rgba(0,0,0,0)` no corpo · **0 pixels acesos
dentro das 6 placas** (568.431 px amostrados, medido no ápice do Singular = pior
caso) contra 27.982 acesos no vazio · `roundRect` disponível, com fallback `rect` ·
`.no-shine` derruba o `backdrop-filter` · contraste **repouso 8,96:1 (título
18,8:1) · ápice dourado 5,59:1 (título 9,5:1)** · bordas conferidas idênticas
(anel `1.7px`, `--shine-gain 4.4`, pico `.29`, frame duplo `inset 10px`) ·
console limpo · `node --check` OK.

### Corpo v4 — legibilidade no Singular + superfície limpa

Dois retornos do dono: (a) no dourado o conteúdo perdia leitura; (b) o fundo ainda
parecia áspero e pesado, com referência visual de uma superfície teal escura, lisa
e uniforme.

**Erro de medição admitido:** a aferição de contraste da v3 compunha só a camada
de condensação e ignorava as camadas `screen`/`soft-light` e o plasma do
`::before` — justamente o que satura no Singular. Daí "5,59:1" medido contra uma
captura visivelmente ilegível. O medidor também quebrava a lista de camadas com
split por vírgula ingênuo (parênteses aninhados), desalinhando as blend modes.
Refeito com splitter que conta parênteses + interpolação de stop por posição.

**Causa do verde-oliva:** a densidade usava `--deep` (teal). Teal escurecendo
dourado dá **oliva**. Densidade e cor viraram camadas separadas: a *tinta* teal
(`--deep`) sai de cena no Singular (`* (1 - --module-sing)`) e a *densidade* é
`--void` puro — preto não desloca matiz, então o dourado escurece para âmbar e o
impacto do evento sobrevive.

Demais mudanças: **véu de leitura** (gradiente `to top`, alpha 0 em repouso — não
existe fora do evento) · lençol especular, focos de luz e câmara recuam no
Singular, onde `screen`/`soft-light` sobre dourado só sabem estourar · o
`color-dodge` e a malha herdados do `.lit::before` saíram do `.service` (eram a
"aspereza" e o estouro) · `text-shadow` escuro e opacidade cheia do corpo de texto
só no Singular · grão mais fino (baseFrequency 1.35, opacity .05) · blur do
backdrop 7px → 11px.

Medido (compositor com blend modes reais, por posição no card):

| | topo | zona do texto | corpo | título |
|---|---|---|---|---|
| repouso | `(5,43,46)` hue 184 | `(3,22,24)` | **8,69:1** | 18,02:1 |
| Singular | `(164,139,9)` hue **50** | `(102,83,0)` hue 49 | **6,25:1** | 6,84:1 |

Ou seja: teal escuro liso em repouso (a referência do dono), dourado forte no topo
durante o evento e âmbar legível onde o texto vive. 7 camadas ↔ 7 blend modes
alinhadas. Bordas conferidas idênticas pela enésima vez (anel `1.7px`,
`--shine-gain 4.4`, pico `.29`, frame duplo `inset 10px` / `.055`).

### Corpo v5 — mais translúcido + FOCO DE PRESENÇA (leitura de Spotlight Cards)

Translucidez: tinta teal `.62/.50/.66` → `.42/.32/.46`, densidade `.06…20` →
`.035…14`. Superfície de repouso `(4,34,38)`.

Referência do dono: kokonutui/spotlight-cards. De novo a página não publica
números — publica o comportamento: *ambient aurora glow, magnetic 3D tilt, focus
dimming on hover*. Os três foram **traduzidos para leis que o site já tinha**, em
vez de portados:

| modelo | tradução no organismo |
|---|---|
| spotlight que liga no hover | foco do campo já existente (`--module-e`): chega com atraso, FICA onde estava quando o cursor sai e dissipa junto com a memória energética |
| tilt 3D magnético | a placa cede ao campo, com a inércia do mesmo laço |
| focus dimming | o acoplamento entre reatores lido AO CONTRÁRIO — o sistema já sabia quem estava sendo observado |

Implementação: os três sinais (`--mx/--my`, `--tilt-x/-y`, `--dim`) nascem dentro
do **domReactors**, onde os rects já estão em cache e o laço já roda — nenhum
listener novo, nenhum layout novo, escrita gated por epsilon. `dominance` sai de
graça do mesmo varrimento que já calculava o `spill`.

Detalhe que evitou um bug: o `.tilt` dos mocks escreve `style.transform` direto e
`.lit:hover` tem `translateY` próprio — três donos do mesmo canal se atropelam.
Aqui a elevação do hover virou a variável `--lift` e tudo compõe numa expressão
só, em `.service.lit` (empata com `.lit:hover` e vence por ordem no arquivo).

Verificado (domReactors extraído, cursor simulado): foco segue `25%→80%` · tilt
inverte de lado (`+0.91deg → -0.90deg`) · o outro card recua (`--dim .53`)
enquanto o focado não (`.000`) · ao sair, foco permanece em `79.6%`, placa volta
ao plano (`-0.01deg`) e energia zera. Contraste: repouso **8,99:1** (título 19,0),
com foco aceso **8,91:1**, Singular **6,07:1** (título 6,64), topo hue 50.
`.no-shine` derruba transform, filter, backdrop-filter, anel e animação de uma vez.
Bordas idênticas. 8 camadas ↔ 8 blend modes.

### Ajuste v6 — foco removido, feixe vivo na seleção

Dono recusou o foco radial que seguia o cursor ("bola de luz"); o que ele queria
do modelo era só a placa cedendo ao movimento. Camada removida do `.service`
(8 → 7 camadas) e a escrita de `--mx/--my` saiu do domReactors — sem consumidor,
era custo por frame à toa. `--tilt-x/-y` e `--dim` permanecem.

**Dois bugs no conduíte, achados ao investigar "a linha tem luz estática":**

1. **`flow` só existia na Ressonância e no Singular.** `flow = link + surge*1.3`,
   com `link = stageExc()` (zero fora do evento) e `surge` (zero fora do Singular).
   Com o cursor sobre um card, `flow ≈ 0`: a bainha não abria (`flow > 0.02`), o
   tracejado nem ligava (`flow > 0.03`) e os pacotes andavam no piso. O feixe do
   card selecionado era literalmente o estado morto. Criado o **fluxo local**
   `lf = min(1.5, flow + l.e * 1.15)` — a energia da placa alimenta o próprio
   feixe. Toda a geometria do filamento passou a ler `lf`; `flow` global segue
   regendo núcleo e barramento.
2. **Velocidade do tracejado absurda.** `(0.06 + flow*0.62) * dt` dava ~14 px por
   frame contra um padrão de 38 px: ~22 ciclos/s, que o olho lê como cintilação,
   não como corrente. Recalibrado para `(0.015 + lf*0.05) * dt` — de ~14 px/s em
   repouso a ~90 px/s no ápice.

**Sentido contínuo em vez de interruptor:** `dir = 1 - 2*clamp((l.e - .15)/.35)`.
Com pouca energia a corrente vai da placa para o núcleo; conforme a placa é
escolhida a corrente desacelera, PARA e se inverte — o núcleo passa a alimentá-la.
Ressonância e Singular ainda forçam `-1`.

**O núcleo deixou de ser decorativo:** `maxE` (maior energia entre as placas)
entra em `pow`, `Rn` e na linha de barramento — quando uma placa é escolhida, o
núcleo carrega visivelmente.

Medido (módulo extraído, canvas real): selecionar uma placa leva o barramento de
8.171 → 14.761 px acesos (1,81×), brilho médio 24,1 → 43,3, e **movimento por
100 ms de 156 → 860 px (5,5×)**. Tilt segue vivo, 7 camadas ↔ 7 blend modes,
anel `1.7px` e `--shine-gain 4.4` intactos, console limpo.

NÃO medido por pixel: a inversão de sentido é a fórmula acima, verificada por
leitura — o padrão do tracejado é periódico e o centro de massa não dá sinal
confiável em janelas curtas.

### Ajuste v7 — corredor largo, traço mínimo, fonte única

**Espaço.** `row-gap` 5.5rem → **8.5rem** (9.5rem + `column-gap` 1.9rem acima de
1040px). O vão entre fileiras foi de 88px para **152px**: o caminho não é respiro
decorativo, é onde o fluxo tem lugar para acontecer.

**Núcleo no corredor, não no centro do retângulo.** As fileiras raramente têm a
mesma altura (um título que quebra em duas linhas já desalinha), e o núcleo estava
fixo em `H/2` — folga de 88px acima contra 64px abaixo. `measure()` ganhou uma
primeira passada que acha o corredor (maior `bottom` da fileira de cima, menor
`top` da de baixo) e ancora `coreY` no meio dele. Medido: folgas 74/78, núcleo em
y=362 contra centro do corredor 364.

**Traço mínimo.** A bainha larga (até 13,5px) era o "elemento pesado" e saiu.
No lugar, um **transbordo**: alargamento levíssimo que só existe na saída do
núcleo e se extingue antes do meio do caminho (`lf > 0.25`, alpha .012→.067).
Fio de `0.55 + lf*0.35` px — sub-pixel de propósito, porque a energia é lida pelo
que CORRE dentro dele, não pela espessura. Tracejado com traços curtos e vãos
longos (`[3+lf*5, 20+lf*12]`, `lineCap: round`) para ler como partícula viajando,
não como linha pontilhada de interface. Nó de contato e pacotes reduzidos ~45%.
Medida da espessura por varredura horizontal (que exagera diagonais): mediana
**3px**, p90 4px.

**Sentido único.** `dir` era contínuo e se invertia conforme a energia da placa —
dava um instante bonito de virada, mas contava a história errada: o núcleo é a
fonte, não um coletor. Agora `dir = -1` sempre; a seleção muda a INTENSIDADE do
fluxo, não o rumo. O gradiente do fio também foi invertido (claro no núcleo,
diluído na placa) para a direção estar na própria cor.

Medido: repouso 8.915px acesos / brilho médio 22,5 · placa selecionada 18.285px /
28,8 · movimento 736px por 100ms · 0 pixels dentro das placas (clip mantido) ·
mobile volta a 24px de gap e overflowX 0 · console limpo.

### Ajuste v8 — calibragem de brilho e corrente da linha

Dono pediu "um pouco" mais brilho e mais sensação de movimento. Medindo a linha
**isolada do núcleo** (círculo de raio 110px excluído), o repouso estava em 709px
acesos com brilho médio 11 e ZERO pixels acima de 90 de alfa — praticamente
invisível. Era esse o estado sendo julgado.

- `a` (alfa do fio) `.04 + drive*.20` → `.15 + drive*.34`; queda no meio do
  caminho suavizada (stop central `a*.5` → `a*.66`), então o traço não some no
  vão entre núcleo e placa.
- **Largura ~1px em vez de sub-pixel.** Um traço de 0.6px espalha o alfa por dois
  pixels no antialiasing e perde metade do brilho. `0.95 + lf*0.5` deixa a linha
  NÍTIDA e mais presente sem ficar mais grossa aos olhos — largura aparente
  medida continua em 3px (mediana), idêntica à v7.
- Velocidade do tracejado `+60%` (`.015+lf*.05` → `.024+lf*.075`): de ~23px/s em
  repouso a ~130px/s no ápice. Sobre um padrão de 23→48px isso dá 1 a 2,7 ciclos/s,
  bem longe da faixa de cintilação (a v5 chegou a ~22 ciclos/s por engano).
- Alfa e espessura do tracejado, transbordo e pacotes subiram junto, na mesma
  proporção.

Medido (linha isolada, módulo extraído): repouso 709 → **943px**, brilho médio
11 → **14,6**, luz total 7,8k → **13,7k (+76%)**, movimento por 100ms ~100 →
**278**. Placa selecionada: brilho **31,6**, luz 49,2k, movimento **914**.
Largura aparente inalterada (3px). Console limpo, overflowX 0, bordas intactas.

ARMADILHA DE MEDIÇÃO registrada: a primeira versão deste teste centrava o círculo
de exclusão no *pixel mais brilhante*, que se desloca para o nó de contato quando
uma placa é selecionada — o núcleo inteiro entrava na conta como se fosse "linha"
e inflava o número em ~8×. Centro fixo resolve.

### v9 — BUG: os pacotes morriam no primeiro pulso (+ halo do núcleo removido)

**Sintoma do dono:** "ao entrar no site os efeitos funcionam, mas depois do
primeiro pulso as bolinhas nas linhas param de vir e não voltam".

**Causa:** os pacotes e o tracejado viviam atrás de `if (qual >= 0.5)`. A rede de
FPS (`watchQuality`) é deliberadamente de UMA VIA — desce 1 → .62 → .38 e **nunca
volta a subir**. O primeiro pulso é o frame mais caro da página; ele derrubava
dois degraus e a assinatura visível do barramento sumia em definitivo. Não era
percepção: era um corte permanente disparado por um pico transitório.

**Correção em duas frentes:**

1. *Qualidade reduz a QUANTIDADE, nunca a presença.* `np` cai pela metade abaixo
   de .5 mas nunca abaixo de 1 pacote por feixe; o tracejado só desliga no piso
   real (`qual > 0.38`). Verificado com `quality` forçada a .38: movimento de
   **699px/100ms** onde antes seria zero.
2. *O desenho era parte do problema.* Cada pacote e cada nó de contato criavam um
   `createRadialGradient` por frame — até **31 gradientes/frame** no módulo. Todos
   trocados por dois arcos sólidos (halo + miolo), visualmente equivalentes num
   blob de 8px. Sobrou **1** gradiente por frame (o miolo do núcleo). Ou seja: o
   efeito que a rede de FPS matava era, em boa parte, quem derrubava o FPS.

**Singular intensifica**, como pedido: `np` agora escala `2 + lf*2.4` (array de
pacotes de 4 → 6 fases) e o alfa subiu. Medido no ápice: movimento
**6.189px/100ms** e brilho médio **99,7** contra 455 e ~15 em repouso.

**Halo do núcleo removido.** O gradiente radial de ~4× o raio lia como uma "bola
de luz" colada ao núcleo, competia com os feixes e era o maior gradiente por frame
do módulo. O núcleo se define agora por estrutura — anéis + miolo — como o resto
do sistema; luz difusa é trabalho do campo, não de uma esfera. Medido: a faixa de
40–90px ao redor do núcleo tem 596px acesos numa área de ~20.400 (≈3%), e o que
resta ali são os filamentos passando.

### v10 — a cintilação era JITTER, não velocidade

**Sintoma do dono:** a corrente das linhas "cintila" em vez de correr.

**Causa real (duas fontes, ambas de salto, nenhuma de velocidade):**

1. *O período do tracejado crescia com a energia.* Era `setLineDash([3+lf*5,
   20+lf*12])` → período `23+lf*17`. `lineDashOffset` conta em pixels absolutos,
   então o traço nº n mora em `n*período`: bastava `lf` respirar para CADA traço
   saltar um múltiplo da variação, todos de uma vez. Isso pisca. Régua agora é
   CONSTANTE (`DASH=[6,13]`, `DASHP=19`); só velocidade, alfa e densidade do trem
   respondem à energia — a geometria do tracejado não se mexe mais.
2. *Os pacotes apareciam por contador.* `np = 2 + round(lf*2.4)` era um degrau: ao
   subir, o pacote novo surgia no MEIO do fio com a fase guardada (pop seco); ao
   descer, um pacote em voo evaporava. Agora todos os 6 avançam sempre (fase nunca
   pula) e entram/saem por rampa de opacidade (`gain`), não por contagem. Abaixo de
   .5 de qualidade o teto de pacotes VISÍVEIS cai para 3, mas as fases seguem vivas.

**Pedidos do dono nesta rodada:**

- **No dourado a corrente DESACELERA.** `slow = 1 - surge*0.76`: no ápice do
  Singular a velocidade cai a ~24%, devolvendo a corrente à cadência de repouso
  (~29px/s) enquanto tudo em volta queima. O plasma é mais denso — intensidade
  sobe, pressa cai. Medido: tracejado 119→29px/s do ciano ao dourado no pico.
- **Bolinhas menores, foco no fluxo.** Raio do pacote `0.9+drive+lf*0.85` (miolo até
  2,75px, halo 6,9px) → `0.58+drive*0.42+lf*0.34` (~45% menor). O protagonista é a
  corrente; o pacote é só o grão que ela carrega.
- **Linhas continuam finas; o fluxo é que intensifica.** Espessura do fio inalterada
  (`0.95+lf*0.5`). O tracejado, que chegava a 2,08px (mais grosso que o fio de
  1,7px e por isso "engrossava" a linha aos olhos), agora fica sempre mais fino
  (`0.68+lf*0.34`); a intensidade veio para o ALFA (`0.17+lf*0.56`), não para a
  espessura. E a velocidade dos pacotes foi amarrada à do tracejado (termo de `lf`
  0.00115 → 0.00045): antes voavam a ~505px/s contra ~119px/s do tracejado — 4× de
  diferença no mesmo fio lê como ruído; agora ~2,2×, mesmo rumo, mesma ordem.

Verificado no navegador via extração do módulo + tick à mão nos 4 estados: renderiza
em todos (repouso 4.497px acesos → hover 5.334 → ressonância 7.584 → dourado 8.180),
matiz 182 (ciano) em repouso/hover/ressonância e 50 (dourado) no Singular.

### Aurora + Glitch do Evento Singular (nova frente)

Duas referências trazidas pelo dono, ambas ADAPTADAS ao ecossistema (nunca portadas):

**Aurora (magicui/aurora-text).** A técnica — `linear-gradient` + `background-size:
200%+` + `background-clip:text` + varredura de `background-position` — já era
exatamente o `.grad` que existia no hero. Descartado da referência: as 4 cores de
arco-íris e o `transform: rotate(±5deg) scale(.9–1.1)` (palavra girando/inflando não
é "material tecnológico"). Mantido: o mecanismo, sobre a rampa sagrada num só matiz
(`--hi → --glow → --core → --glow → --hi`), que já usa tokens que metamorfam → doura
sozinho no Singular. Estendido a +1 marquee: o "seu negócio" do CTA.

**Glitch (kokonutui/glitch-text).** RGB-split de 3 camadas (primária + 2 fantasmas
`inset:0` com translate/skew/opacity em loop). Adaptação: **só no dourado** — gate
`body.singularity-active` — como assinatura do Evento Singular (a IA assume o
controle absoluto do ecossistema, o universo muda de estado). Sem duplicar texto no
HTML: `content: attr(data-text)` nos pseudos `::before/::after` do próprio `.grad`.
Cores da referência (laranja arco-íris) trocadas pela rampa do plasma: eco A
branco-plasma `rgb(var(--core-rgb) / .82)`, eco B corona dourada
`rgb(var(--sing-rgb) / .9)`, ambos já metamorfados; `mix-blend-mode: screen`
(aditivo, como o `lighter` do campo de energia). Offsets ≤2,5px + bandas de
`clip-path: inset()` variando por quadro = fratura de fio, não CRT quebrado. A base
`.grad` acelera (`grad-pan` 9s → 3,4s) e treme 1px (`sing-glitch-core`): a matéria
participa, não só os ecos. Tudo sob `@media (prefers-reduced-motion: no-preference)`.

*Dois bugs de sintaxe pegos na medição (não repetir):* (1) `rgba(var(--core-rgb),
.82)` é INVÁLIDO — RGB por espaço + alpha por vírgula não casa; a convenção do
projeto é `rgb(var(--x-rgb) / a)` (slash). (2) `steps(1, jump-none)` é inválido —
`jump-none` exige n≥2; o shorthand `animation` inteiro caía e a base voltava a só
`grad-pan`. Corrigido para `steps(3, jump-none)`.

Verificado: em repouso os pseudos dormem (`content:none`, `position:static`, ciano
intacto); em `singularity-active` acordam com as cores/animações certas, `fill`
batendo o `color`, `overflowX 0`, zero erro de console.

### Hero — formatação + o bug dos "efeitos atrás das letras"

**Órfão do título.** Em telas estreitas (~790px) "Transformamos ideias em" quebrava
deixando "em" sozinho numa linha. Reestruturado: o `<br>` agora separa
"Transformamos ideias" / "em interfaces de elite." (o "em" puxa o punchline), mais
`text-wrap: balance` no `.hero__title` e no `h2` — nenhuma palavra cai órfã em
qualquer largura.

**O bug REAL atrás das letras.** `livingType` (overlay de pontos sobre os glifos)
reconstruía o layout do texto de `innerText.split('\n')` = só as linhas LÓGICAS do
`<br>`. Quando o browser reembrulhava (o "em" órfão), o texto real tinha 3 linhas e o
amostrador só 2 → os pontos eram desenhados no layout errado e acendiam FORA das
letras. Medido a 790px: `realLineCount` divergia de `innerTextLineCount`. Corrigido:
`sample()` agora reembrulha cada linha lógica na largura de conteúdo com a mesma
fonte (`measureText`), replicando a quebra da tela — o mapa de pontos bate com o que
se vê em qualquer largura. Verificado: sampler produz as 2 linhas certas, pontos
dentro da banda real do texto (drift de topo +4px). Vale para todos os títulos.

### Modelo de material portado aos demais cards — `.card-mat`

Pedido: usar o material dos cards de serviço em TODOS os outros cards, menos o mini
AI core (barramento). Feito via classe nova `.card-mat` que ESPELHA o material do
`.service` — os cards de serviço aprovados ficam intocados e o modelo é afinável/
reversível num lugar só, sem risco de regressão. `.card-mat` em 14 elementos (3
dores + 3 processo + 4 faq + 3 mocks + 1 CTA). Repartição por tipo:

- **corpo multicamada (7 camadas ↔ 7 blends) + `backdrop-filter: blur(11px)`** →
  cards de texto e CTA (`.card-mat:not(.mock__frame)`). Mock fica de fora: o
  screenshot cobre o corpo e o override mataria a sombra de profundidade da moldura.
- **knobs de borda/bloom (`--shine-gain 4.4 / --bloom-gain 1.9 / --shine-w 1.7px`) +
  frame duplo (`::before` inset:10px rarefeito)** → TODOS, inclusive mock (iguala a
  assinatura condutiva da borda; o `::after` do anel já era compartilhado e só
  esperava os knobs).
- **tilt/dim 3D** → só cards de texto (`.card-mat.lit`; domReactors já alimentava
  `--tilt/--dim` neles). Mock já inclina pelo módulo `.tilt`; o CTA é grande demais
  pra inclinar. Hover virou `--lift` (senão o `translateY` do `.lit:hover`
  atropelaria o transform 3D — mesma solução do `.service`).
- **assistentes de leitura do Singular** (`text-shadow` que só existe com
  `--module-sing>0`) espelhados no texto do `.card-mat` — senão no evento dourado o
  texto lavaria.

Verificado: pains/steps/qa/cta com 8 camadas de fundo + blend de 7 modos + backdrop +
knobs 4.4 + `::before` inset:10px + `matrix3d` (tilt); mock com corpo PRESERVADO (0
gradientes, sombra intacta) mas knobs aplicados; `.service` inalterado; screenshots
dos mocks renderizam (348×229, filhos intactos); `overflowX 0`; zero erro de console.
Contraste de repouso = idêntico ao `.service` (mesma fórmula de corpo, já aprovada em
8,99:1 / título 19,0).

*A julgar no olho (não dá pra ver aqui):* (1) knobs 4.4 na borda do CTA e dos mocks —
pode ficar quente demais num perímetro grande; (2) o frame duplo troca a sombra
inferior funda do CTA por uma menor — pode achatar o painel; (3) custo de FPS: +10
cards com `backdrop-filter` + transform 3D. A rede de FPS (`.no-shine`) derruba
filter/transform/backdrop no piso .38, então degrada sozinho sob pressão.

### Aurora + glitch nas palavras destacadas & a reescrita do sistema

**Aurora/glitch estendidos.** As palavras destacadas do site ganharam o tratamento
`.grad` (aurora em repouso — ciano — e no Singular — dourado, pelos tokens que
metamorfam; RGB-split só no dourado): os 6 `<em>` dos serviços, os numerais 01/02/03
do processo, "AI Core", a lead de projetos e (já existentes) o hero e "seu negócio"
do CTA. Total 13 `.grad`. Intensidade do glitch por porte via `--gl` (multiplica a
amplitude do deslocamento nos keyframes; o clip-path é em % e não escala): hero 1,
numerais .7, `<em>`/AI Core/lead .45. Ver **imutável**: fill vazado — `.grad` ganhou
`-webkit-text-fill-color: transparent` explícito porque, sobre elementos com `color`
mais específico (o `<b>` do AI Core, a `.section__lead`), só `color:transparent`
perdia a especificidade e a aurora sumia.

**Reescrita do sistema (`singText`, main.js §3e).** Pedido do dono: texto que muda no
dourado NÃO troca instantâneo — perde estabilidade e se reescreve caractere a
caractere pelo glitch, como uma "reescrita do sistema", rápido e sincronizado com o
onset do Singular. Módulo genérico: todo `[data-sing-text]` entra (e os futuros).
`morph(calm, sing, p)` interpola por porcentagem escalonada L→R (janela .42): `p=0`
devolve o texto calmo exato, `p=1` o dourado exato, no meio glifos de um alfabeto
tech018 mono. `prog` anda no loop ÚNICO (sem rAF próprio) a `dt/620ms`, e reverte ao
voltar ao ciano. Nas palavras `.grad` o `data-text` é reescrito junto → os ecos RGB
acompanham a reescrita. Reescrevem hoje: o prefixo do AI Core ("Conectado ao" →
"Sistema sob controle do") + o ponto final, e a lead de projetos ("Conceitos
autorais…" → "Arquitetura elevada. A identidade assume sua forma máxima."). "AI Core"
em si é estável (existe nas duas frases) e só faz aurora+glitch. Acessibilidade: a
lead tem `.sr-only` com o texto calmo estável e o trecho que reescreve é
`aria-hidden`; o label do barramento já era `aria-hidden`.

**O bug da imagem 4 (efeito atrás das letras), de novo.** O `text-wrap: balance` que
eu tinha posto nos títulos fazia o browser rebalancear as linhas de um jeito que o
meu reembrulho guloso no `sample()` não reproduzia — os pontos voltaram a cair fora
das letras. Consertado de vez: o `sample()` agora NÃO reconstrói layout nenhum; lê a
posição REAL de cada palavra com um `Range.getClientRects()` e desenha a palavra ali.
Casa com balance, centralização, letter-spacing e wrap reais. Medido na h2 do FAQ:
**100% dos pontos (955/955) dentro das caixas de glifo**.

Verificado: 13 `.grad` com fill transparente (aurora aparece mesmo sobre `color` mais
específico); no Singular os pseudos acordam dourados com `--gl` certo por porte
(.45/.7); `morph()` unit-testado (p=0 = calmo exato, p=1 = dourado exato, meio =
glifos escalonados); 3 `[data-sing-text]` achados pelo módulo; `overflowX 0`; zero
erro de console. *Não dá pra ver o MOVIMENTO do scramble aqui (loop congela no pane
oculto) — a cadência/elegância da reescrita é julgamento do dono.*

### AI Core — o reator do hero (`heroReactor`, main.js §3f)

O dono pediu a reconstrução fiel do reator da imagem de referência, substituindo o
"AI core do hero". Havia dois candidatos: o `.hero__emblem` (átomo SVG discreto no
topo) e o `AICore.draw()` (o núcleo OCO/misterioso pintado no campo de partículas —
"nunca uma esfera brilhante", interior oculto). A imagem é um DISPOSITIVO emoldurado
(base, brackets, anel-label, plasma visível) → o emblema. Substituí `.hero__emblem`
por um `<canvas class="hero__reactor">`.

**Sem estado paralelo.** O reator NÃO cria máquina própria: lê `EnergyField.core` (o
mesmo cérebro — `breath/pow/star/strain/pres`) + `E` + `sing` + `quality` + cursor.
Os estados (Idle→…→Singularity→Cooling) já emergem desses valores; o reator é só uma
VISTA nova deles. Anda no loop único (sem rAF próprio); degrada com a rede de FPS
(`lite = qual<0.6` corta longitudes do globo e metade das partículas). O núcleo de
fundo (`AICore.draw`, atrator do campo) fica intacto.

Camadas (trás→frente): halo/campo · órbitas pontilhadas com nós (oclusão frente/trás)
· base+feixe · emissor+feixe · esfera de vidro (fresnel na borda + wireframe do globo
recortado + rim light) · brackets (housing dark glossy com fio ciano, `source-over`
p/ ocluir) · anel equatorial + anéis internos · partículas · plasma-átomo (elétrons +
bloom + centro quente). Respira/comprime com `breath/strain`; no Singular satura em
branco→gold (`star`) via `plasmaColor`. Cursor: excita órbitas/partículas por
proximidade (lê `px/py` + centro em coords de documento, sem reflow por frame).

*Bug pego na medição:* `PALETTE` só expõe `glow/hi/core/gold` — usei `PALETTE.mid`/
`.void` (undefined → `rgba(undefined…)` inválido). Corrigido lendo `--mid-rgb`/
`--void-rgb` dos tokens no init do módulo.

Verificado (harness: extrai o `tick`, roda num canvas real): renderiza sem erro,
canvas dimensionado por `measure()` (dpr-aware), matiz **183 (ciano) em repouso** e
**50 (gold) no Singular**, pixels acesos escalam com `pow/star` (22k→62k); página com
`overflowX 0`, emblema antigo removido, zero erro de console. *NÃO consigo ver o
MOVIMENTO/fidelidade aqui (loop congela no pane oculto) — presença visual, "impressiona
à primeira vista" e naturalidade do movimento são julgamento do dono.*

**Glitch na reescrita de frase.** O `singText` agora liga `.sys-rewriting` no trecho
enquanto ele reescreve (não-`.grad`): um RGB-split temporário sobre o texto que muda,
nas duas direções (ciano↔dourado). As palavras `.grad` já glitcham por conta própria.

**Consolidação — o reator vira O núcleo único.** A pedido do dono: aumentei o reator
(`clamp` 190–268 → 260–400px) e REMOVI por completo o núcleo antigo — a função
`draw()` oca do AICore, sua chamada no campo, e os helpers/entranhas que só ela usava
(`grad`, `halo`, `fils`, `probes` + os ramos de sonda em `decide`/`update`). O AICore
virou só o CÉREBRO + a FÍSICA (estado, respiração, consciência, `fieldAt`,
`emitPoint`, `exhaust`). **Todas as funcionalidades do antigo passaram pro novo:**
- *campo gravitacional ancorado ao reator* — `coreAnchor` recebe, a cada frame, o
  centro do reator na viewport; `AICore.update` posiciona `st.x/st.y` ali. As
  partículas do site inteiro passam a ORBITAR o reator (fora do hero volta ao centro).
  Efeito colateral bom: o cérebro já calcula `excite` por proximidade do cursor a
  `st` — agora isso acontece no reator, então ele reage ao cursor de graça.
- *atenção* — o plasma do reator pende pra onde o núcleo "olha" (`st.attX/attY`).
- *estrela/respiração/compressão/exaustão* já vinham por `star/breath/strain/pow`.

**Revisão (passo 1) — origem do Pulso.** O reator lê `stageExc(0.0)` (o estágio mais
cedo da cadeia de ressonância) e ACENDE/expande no disparo, antes de campo→conexões→
cards. Medido: 42.988 → 59.109 px acesos com o pulso a 1. Agora o AI Core é a fonte
visível da propagação, não um reativo. Verificado: reator 400px, `overflowX 0`, zero
erro; `node --check` limpo; sem refs mortas a `fils`/`probes`/`AICore.draw`.

PENDENTE (fila pedida pelo dono, nesta ordem):
- **Auditoria técnica + refatoração ampla** do projeto inteiro (bugs, código morto,
  perf, responsividade, a11y, segurança, redundância) — preservando comportamento/
  identidade/animações/UX.
- **Revisão profunda do AI Core + ecossistema** (presença, comportamento, animações,
  interações, fluxo de energia) e implementação das melhorias. Depende do olho do dono
  no reator primeiro.
- **C**: máquina de estados explícita (Idle → Perceiving → Charging → Active →
  Resonating → Singularity → Cooling) na timeline mestre Anime.js. Hoje os estados
  existem de fato, mas emergem de `--energy`/`--res`/`--sing`, sem nomes.

## Estado atual (o que já servia de fundação)

- `globalLoop`: pointer suavizado (`--px/--py`), fps EMA, magnetismo, tilt, spring.
- `neuralEnergyField`: partículas com física, atração/deflexão do cursor, sinapses
  locais, pulsos, anel quando parado. ~60% da ParticleLayer.
- `.lit`/`.magnetic`/`.tilt`: registries DOM já no HTML.
- `watchPerf` do vórtice (<45fps → degrade): reciclável para cap dinâmico.
