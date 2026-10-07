# Quadro de referências — rodada de lapidação (2026-10-06)

Pesquisa feita por agente (Magic UI, Aceternity, React Bits, Motion Primitives, Cult UI,
Hover.dev, Animata, 21st.dev, Osmo; Awwwards Annual 2025 + SOTD/Dev Award set–out 2026 em
Technology; lista hontran.dev 2026). Filtro: identidade "tech refinado", **sem blur/glow**,
celular primeiro, movimento é acréscimo, só transform/opacity por quadro. Custo: **baixo** =
compositor ou CSS estático; **médio** = paint local, DOM moderado, JS por evento, canvas pequeno
pausável; **alto** = canvas/WebGL por quadro, filtro SVG, variável CSS por quadro.

## O que pode entrar

| # | Ideia | Link | O que faz | Onde entraria | Custo | Veredito |
|---|---|---|---|---|---|---|
| 1 | Scramble em rótulos mono | magicui.design/docs/components/hyper-text · motion-primitives.com/docs/text-scramble · osmo.supply/resource/text-scramble-load-scroll-hover | letras passam por caracteres aleatórios e assentam | rótulos JetBrains Mono (kicker `01 Garantias`, "↑ AI CORE", status) no encaixe do mini; CTA no hover | baixo-médio (textContent a cada ~30 ms, só do rótulo; mono não reflui) | Alfabeto restrito (`0-9 A-F │ ─ ·`), 250–400 ms. Katakana/binário = Matrix, não. |
| 2 | Contador em mono (Sliding Number) | motion-primitives.com/docs/sliding-number · magicui.design/docs/components/number-ticker | número sobe até o valor; colunas 0–9 deslizando (transform) | prova/números; readout do rodapé | baixo (translateY) | O dado em mono com régua é a prova do "tech refinado". |
| 3 | Split-flap | ui.aceternity.com/components/text-flipping-board | cada caractere vira como placa mecânica (rotateX) | rodapé/estado, ≤ 24 caracteres | médio | Mecânico, não "IA". Escolher scramble OU split-flap, nunca os dois. |
| 7 | Draw Outline Button | hover.dev/components/buttons | a borda é desenhada no hover por 4 traços (scaleX/Y em cadeia) | botões secundários, links do rodapé/nav | baixo (zero JS) | A régua de 1 px ganhando vida. Entra. |
| 8 | Autofoco dos cantos de mira | 21st.dev/@shadcnspace/components/shine-border-06 | 4 colchetes que "travam" como autofoco de câmera (vêm de fora e encostam) | os cantos que os cards já têm: na entrada/hover saltam de +8 px para 0 | baixo (transform) | Versão original tem glow: só o movimento, cor chapada. |
| 11 | Circuit Board + ponto viajando | cult-ui.com/docs/components (Circuit Board) · magicui.design/docs/components/animated-beam | traços de PCB (45°/90°) com luz correndo por `stroke-dashoffset` | ramos das estações | baixo-médio | Já temos ramos em canvas; a ideia é só o traçado ortogonal. Segurar a mão: é o hero da Magic UI. |
| 12 | Grid / hachura estática | magicui.design/docs/components/grid-pattern · striped-pattern | padrão SVG de 1 px no fundo | zona técnica atrás das estações; células vazias como "área reservada" | zero | A página inteira na mesma prancheta. |
| 13 | Célula de mira na grade | magicui.design/docs/components/interactive-grid-pattern | célula sob o cursor acende | fundo das estações (desktop) | original médio-alto; versão "um quadrado 1 px que salta de célula em célula" = baixo | Opcional. |
| 17 | Crosshair + readout de coordenadas | reactbits.dev/animations/crosshair | duas linhas 1 px seguindo o cursor + `x 0412 y 0188` | só no hero, desktop | baixo (linhas) / médio (texto a 10 fps) | O hero de Sites já tem a mira com coordenada. O mini é a personalidade do cursor: não duplicar. |
| 18 | Click Spark em traço | reactbits.dev/animations/click-spark | 6–8 traços radiais curtos no clique | clique no CTA; encaixe do mini | baixo (só no evento; 8 spans + transform) | Luz em traço de verdade, sem glow. |
| 20 | Pixel Transition | reactbits.dev/animations/pixel-transition | reveal por células (opacity) | imagem dos cards de projeto | médio | Só se as células seguirem a grade das réguas (8 px). Retrô se não. |
| 21 | Espinha de processo scroll-driven | ui.aceternity.com/components/tracing-beam | path cuja luz avança com a rolagem | "Método" 01→04; trilho para o mini | baixo-médio (`animation-timeline: scroll()`; fallback ScrollTrigger) | Traço 1 px chapado, sem o ponto com glow. |
| 22 | Marquee mono entre réguas | magicui.design/docs/components/marquee · scroll-based-velocity | faixa correndo (translateX) | stack/serviços entre seções | baixo | Clichê 2021–24; em mono, miúdo, entre réguas, vira ticker. Nunca em título. |

## O que NÃO entra (viola "sem blur" ou "um WebGL só", ou é clichê)

Aceternity: Spotlight, Card Spotlight, Glowing Effect, Lamp, Aurora, Meteors, Background Beams,
Shooting/Glowing Stars, Vortex, Evervault Card, Dotted Glow, Dither Shader. Magic UI: Backlight, Light
Rays, Neon Gradient Card, Magic Card, Blur Fade, Progressive Blur, Shine Border (glow), Shiny
Text/Shimmer/Shiny Button, Flickering Grid (Vercel 2023), Terminal como seção. Motion Primitives: Glow
Effect, Progressive Blur, Spotlight, Text Shimmer, Border Trail (box-shadow). Cult UI: família Halo, Edge
Blur, Shader Lens Blur, Distorted/Fluted Glass. React Bits: Electric Border (feTurbulence por quadro),
Star Border, Shape Blur, Metallic Paint, Faulty Terminal, Letter Glitch. Hover.dev: Spotlight Button,
Gradient Shadow Button. Qualquer "AI Button". Border Beam / Moving Border / Hover Border Gradient: já
temos a luz circulando; as versões deles usam `@property --angle` por quadro ou `offset-distance`
(main thread) — servem só de régua para não regredir. Magnet/Magnetic Button: o mini já vai até o
botão; o botão ir até o cursor vira briga.

## TOP 6 (ganho visual ÷ custo), na ordem

1. Scramble em rótulos mono (#1) · 2. Draw Outline em botões/links (#7) · 3. Autofoco dos cantos de
mira (#8) · 4. Contador/readout em mono (#2) · 5. Click Spark em traço (#18) · 6. Espinha de processo
scroll-driven (#21). Reserva: marquee mono (#22) e hachura estática (#12).

## O que os premiados têm e o site não

Base: Lando Norris / OFF+BRAND (SOTY 2025, 2 cores), Cerebrium (Dev Award set-2026), Lidar Drone
Scanning / Riotters (SOTD out-2026, varredura LIDAR), Aspen Search, By-Kin, Mat Voyce, Uncommon, Minh
Pham, Obys, Unseen.

- Readout de ambiente em mono no rodapé/cabeçalho (hora local, cidade, versão, "DISPONÍVEL").
- Numeração de índice (`01/06`) presa à régua. Preloader com porcentagem (o boot do hero já é o
  preloader; falta o número).
- Smooth scroll com peso (Lenis-like): maior risco de performance no celular; medir antes.
- Paleta ainda mais disciplinada: os vencedores usam 2 cores; reduzir prata/metal a um tom ajuda mais
  que qualquer efeito.
- Scan line em imagens (Lidar): linha 1 px ciano atravessa o screenshot e revela (clip-path).
- Transição "movimento de câmera" dentro da página (elemento que persiste entre seções: o mini já faz).
- Grain estático: decisão do dono (não é blur, mas é atmosfera). Animado, nunca.
- Tipografia de display com peso misto: hierarquia, não efeito.
- Não copiar: cursor custom "VIEW/DRAG" (o mini ocupa esse lugar), WebGL extra, Lottie.

## Decisão desta rodada

Ver `PLANO-AI-CORE.md` §33 (o que entrou, o que ficou de fora e por quê).
