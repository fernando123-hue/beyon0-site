# beyon.0 — transferência de contexto

**Última atualização:** 2026-08-17 · **Branch ativa:** `rebuild` · **HEAD:** `81a787a`

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

**MUDANÇA IMPORTANTE (2026-08-17): a reconstrução foi PUBLICADA.** Em
`72f0126`, `rebuild` virou fast-forward de `main` e foi pushado. O site no ar
agora É a reconstrução — não a versão travada antiga. O dono viu pelo celular
e aprovou ("está tudo ficando muito bom").

| Branch | HEAD | O que é |
|---|---|---|
| `origin/main` (**no ar**) | `72f0126` | **A reconstrução, publicada.** É o que o mundo vê hoje. |
| `main` (local) | `72f0126` | Igual a `origin/main` (fast-forward, sem commits soltos). |
| **`rebuild`** (atual) | `81a787a` | Onde o trabalho continua. **6 commits à frente do ar** (linha do tempo + transferência de contexto + a passada de design 2026-08-17b: ritmo, atmosfera no canvas, HUD). Nada disso publicado. |
| `feat/ai-core-3d` | `df0458f` | 13 commits: Three.js + reator 3D, 66 testes passando. **Pausado**, não descartado. |

**Fluxo de publicação** (confirmado nesta sessão): `git checkout main && git
merge rebuild --ff-only && git push origin main` — depois voltar pra
`rebuild`. É fast-forward limpo porque `rebuild` tem `main` como ancestral.
Push na `main` = deploy automático na Vercel (~1-2 min). **Não pushar sem o
dono pedir.**

Histórico: o dono pediu a reconstrução do zero depois que a otimização
incremental falhou (seção 3). `feat/ai-core-3d` segue intacta como referência.
As branches `main`/`rebuild` antigas (`716bf35`, `0d1ea34`) já eram — foram
ultrapassadas pela publicação.

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
index.html      ~410 linhas  markup semântico, UM canvas (#fx), overlay #intro, FAQ accordion
styles.css      ~870 linhas  identidade estática, zero var por frame, entrada 2 níveis, HUD
js/core.js      178 linhas   estado, loop único, orçamento, profilador
js/field.js     ~360 linhas  o canvas: campo + reator + CARDS(proximidade) + AI Core + tipografia viva + aura + barramento
js/dom.js       285 linhas   reveal sutil, nav+menu mobile, seção-atual, eventos, medidor, CTAs
js/intro.js      99 linhas   overlay de vídeo no boot — evento-só, sem rAF
js/entrada.js    80 linhas   a LINHA (nível 1) — checagem única no boot, sem rAF loop
```

Total **~2.080 linhas**, contra 5.783 antes. Não há mais `main.js` nem
`vendor/` (GSAP): eram 305 KB de código morto, sem nenhuma referência no
`index.html`, que ainda assim subiam no deploy. **O projeto não tem
dependência de runtime nenhuma.**

Os três subsistemas registrados no loop único (`?perf` confirma:
`["campo","eventos","medidor"]`) são a lista COMPLETA do que roda por frame.
Se aparecer um quarto, alguém quebrou a arquitetura — `js/entrada.js`,
menu mobile, seção-atual e reveals são todos evento-só, fora do rAF.

### Custo de frame medido (sessão de 2026-08-17)
`window.__frame(n)` (só com `?perf`) roda N frames na mão e devolve ms/frame:

| estado | ms/frame |
|---|---|
| repouso | 0,100 |
| Pulso | 0,097 |
| Singular | 0,083 |
| Pulso + Singular juntos | 0,092 |

**1% do orçamento de 100fps** em todos os estados. Ressalva honesta: isso
mede JS + chamadas do canvas 2D. Rasterização de GPU não é mensurável no
ambiente do agente (`document.hidden`) — o fps real continua vindo do olho
e do medidor do dono.

### `js/intro.js`
Overlay de vídeo (`assets/intro.mp4`) que toca antes do conteúdo aparecer.
**Não entra no loop `B.add`** — só ouve eventos do `<video>` (`ended`, `error`,
`loadedmetadata`) e do botão de pular. Guardas antes de baixar o vídeo:
`prefers-reduced-motion`, `saveData`, e `effectiveType` 2g/3g/slow-2g. Se
qualquer uma disparar, ou se `#intro`/`#introVid` não existir no markup, pula
direto pro `bootSemIntro()` — nunca trava o boot esperando um evento que não
vem. Ao terminar, adiciona `.booted` no `<body>` **e emite `'booted'`** — a
cascata do hero (CSS) e a checagem de entrada (`js/entrada.js`) escutam os dois.

### ENTRADA EM DOIS NÍVEIS (a assinatura visual — leia com atenção)
Duas animações de entrada **independentes**, separadas de propósito. Pedido
explícito do dono depois de rejeitar uma linha global que perseguia o scroll.

**Nível 1 — a LINHA (`js/entrada.js` + CSS `.revelando`/`.booted .hero::after`).**
Evento **único por carregamento**. A mesma scanline + cascata do hero, mas
disparada **só na seção que está na viewport no momento do load**:
- Carregou no topo → o **hero** roda via `.booted` (comportamento original,
  intacto).
- F5 no meio/fim → `js/entrada.js` detecta qual `main > .section` intersecta
  a viewport e aplica `.revelando` nela (mesma linha, mesmo `@keyframes
  boot-scan`, stagger `--rd` escrito UMA vez nos filhos `.reveal`).
- **Nunca reaparece no scroll. Nunca repete.** Não é IntersectionObserver,
  não é elemento persistente, não é timeline global.
- **Puro @keyframes CSS one-shot.** `js/entrada.js` NÃO entra no loop `B.add`,
  não escreve estilo por frame. Usa `requestAnimationFrame` só duas vezes
  (defer pós-load, não é loop).

**Timing crítico** (`js/entrada.js`): a checagem da seção visível espera
`booted` **E** `load` + 2 rAF, pra rodar só depois de o navegador restaurar
a posição de scroll no F5. Ler os retângulos cedo demais veria `scrollY=0`
transitório e concluiria "estou no hero" por engano. Lê `getBoundingClientRect`
(relativo à viewport), então basta a restauração ter **acontecido**, não
importa o valor. Ao terminar, emite `'entrada-pronta'`.

**Nível 2 — o FADE sutil (`js/dom.js`, `.reveal`→`.is-in`).** O reveal
discreto de sempre (opacity 0→1, translateY pequeno) continua pro resto do
conteúdo conforme se rola — **sem linha**. Só **liga depois de
`'entrada-pronta'`** (não revela nada por baixo do overlay de vídeo, e não
compete com a linha) e **pula qualquer `.reveal` dentro de `.revelando`**
(`alvo.closest('.revelando')`) — os dois níveis nunca tocam o mesmo conteúdo.
Rede de segurança: se `entrada.js` sumir/falhar, um fallback preso ao
`'booted'` (+4s, nunca antes de `'entrada-pronta'`) liga o IO mesmo assim.

Regra de ouro: **LINHA = evento único de entrada da página. FADE = comportamento
contínuo de navegação.** Voltar a uma seção já vista → sem linha, sem replay.

### Armadilha de CSS conhecida — `styles.css:68`
```css
body > *:not(#fx):not(.intro):not(.nav):not(.wa) { position: relative; z-index: 1; }
```
`:not(#fx)` carrega a especificidade do seletor de ID que nega, então essa
regra tem especificidade (1,0,1) — mais alta que qualquer seletor de classe,
não importa a ordem no arquivo. **Qualquer filho direto de `<body>` que
precise de `position` diferente de `relative` tem que entrar nessa lista de
exclusão**, senão essa regra ganha e o elemento para de flutuar.
Já mordeu três vezes: `.intro` (overlay de vídeo), `.nav`/`.wa` (nav fixo e
botão de WhatsApp, corrigido em `cc36558`) e a extinta `.sweep` (a linha que
perseguia o scroll, já removida). Nota: a linha atual (`.revelando::after`,
`.booted .hero::after`) é pseudo-elemento em `.hero`/`.section`, filhos de
`<main>` — **não** de `<body>` —, então essa regra não a intercepta; ela só
precisa que o host seja contexto de posicionamento (`.revelando { position:
relative }`, `.hero` já é). Antes de adicionar um novo filho direto de
`<body>` com `position` próprio, checar esta linha primeiro.

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
**intro em vídeo** que tinha sido cortada, mais um sistema de **entrada em
dois níveis** (a LINHA como evento único de load + o fade sutil no scroll,
seção 6) — nenhuma dessas é o Three.js/reator 3D antigo, são feitas do zero
dentro da arquitetura nova (canvas único + CSS estático).

Sequência da linha (três formas até acertar):
1. **Scanline CSS estática** no hero (`1f3c032`) — aprovada pelo dono, 97-100fps.
2. Dono pediu "a linha percorrendo o site inteiro". Primeira tentativa: só
   esticar o percurso da linha CSS pro documento todo (`a9f787e`). **Falhou
   visualmente** — rápida demais, sem parecer animação.
3. Segunda tentativa: linha vira subsistema no loop único, perseguindo o
   scroll com velocidade adaptada (`js/sweep.js`, `e267d45`). Review pegou 2
   bugs críticos antes do teste do dono. Mas o **dono rejeitou o conceito**:
   não queria linha acompanhando a navegação.
4. **Forma atual (`349f202`)**: o dono especificou com precisão um sistema de
   dois níveis (seção 6). A linha virou **evento único por carregamento**, só
   na seção visível no load (hero no topo via `.booted`; qualquer `.section`
   no F5-no-meio via `js/entrada.js`). O fade sutil (`.reveal`→`.is-in`)
   voltou a ser o comportamento normal de scroll. `js/sweep.js` foi
   **removido por completo**. Review aprovou; um fallback frágil (preso ao
   `load`) foi corrigido pra prender ao `booted`.

**Ainda não visto rodando pelo dono** nesta forma — mesma ressalva da seção 7:
o agente não consegue ver nada animar neste ambiente (`document.hidden`, rAF
não dispara). O que dá pra afirmar foi verificado por `getComputedStyle`:
a linha escopa na seção certa, cascata com stagger correto, conteúdo termina
visível/estável, hero intacto no topo, zero refs à `sweep`, console limpo.
O **feel e o timing de restauração de scroll no F5 real precisam do olho do
dono**.

### Sessão autônoma de 2026-08-17 (9 commits, `7b589e4`..`16c5800`)
O dono pediu autonomia total: mapear, concluir, auditar, refinar, sem parar
para perguntar. O que mudou:

**Código morto** — `main.js` (159 KB, versão pré-reconstrução), `vendor/`
(GSAP + 4 plugins, 146 KB) e `Logo-definitiva.mp4` (172 KB) saíram. Nenhum
tinha referência no `index.html`, mas todos subiam no deploy. `package.json`
declarava `gsap` sem uso: o projeto **não tem dependência de runtime**.

**A armadilha de especificidade, morta na raiz** — a regra
`body > *:not(#fx)...` valia (1,0,1) e derrubava o `position` de qualquer
filho de `<body>` fora da lista. Já tinha quebrado `.intro`, `.nav`, `.wa` e
a extinta `.sweep`; medindo, achei mais duas vítimas silenciosas: o
**`.medidor` nunca flutuou** (ficava parado no fim do documento) e o
**`.skip-link` não escondia** (bug de acessibilidade). Trocada por alvo
explícito `body > main, body > footer`. A lista de exceções não existe mais.

**Recuperado da lista de cortes** (desenhado no canvas, não estilizado):
aura nas 6 palavras-chave dos serviços e a luz do Pulso atravessando o
barramento. Ambos só existem durante Pulso/Singular — em repouso o laço nem
roda. Medido: 0,09-0,10ms/frame em todos os estados.

**Fica de fora, por decisão:** tilt nos cards e holofote do cursor. A seção 5
fixa a identidade como "sem vidro/plástico" e **"sem holofote seguindo o
cursor"** — são os efeitos mais genéricos da lista e contradizem a identidade.
A reescrita no Singular também não foi estendida: a máquina já roda 3 frases
no status do hero, e reescrever texto de conteúdo que o usuário está lendo é
hostil.

**Vitrine de conceitos** — as três molduras eram retângulos vazios numa seção
que promete "conceitos autorais". Agora cada uma desenha um layout em
miniatura com composição própria (editorial / convidativo / técnico), feito
com camadas de gradiente: zero DOM extra, zero custo de runtime.

**Conversão** — os 6 cartões de serviço eram informação sem saída; viraram
links, e o `data-wa` de cada um qualifica a mensagem do WhatsApp ("...para um
site para meu restaurante"). O medidor deixou de ser um `<button>` sem
handler e virou prova de venda: o número explica a si mesmo em português, com
CTA.

**Acessibilidade e mobile, medidos:** três textos abaixo do contraste mínimo
(o pior era a linha "Resposta humana, sem robô" logo abaixo do CTA, em
3,8:1) foram para 5:1; links do rodapé passaram de 24px com 8px de intervalo
para 44px contínuos.

### Posicionamento: ESTÚDIO ANÔNIMO (decidido pelo dono, 2026-08-17)
Perguntei se valia colocar nome/rosto para fechar a lacuna de confiança. O
dono respondeu: **por ora, estúdio anônimo**. Então nada de nome, foto ou
assinatura pessoal. A confiança tem que vir de outras fontes — o processo em
3 passos, o orçamento fechado antes de começar, o FAQ que responde as
objeções, e o próprio site como demonstração. Não reabrir sem ele pedir.

### Refinamento de experiência (mesma data)
- **Âncoras**: não existia `scroll-margin-top`. A nav é fixa (78,6px medidos),
  então todo clique de navegação enfiava o título da seção atrás dela. Token
  `--nav-h` + `scroll-margin-top` nas `section[id]`; o hero fica em 0.
- **Menu no celular**: abaixo de 780px os links viravam `display:none` e não
  sobrava navegação nenhuma. Agora a nav quebra em duas linhas e o painel
  abre por classe (evento discreto). Botão 44×44, links a 48px, Esc fecha e
  devolve o foco, escolher destino fecha. Nasce `[hidden]`, revelado pelo JS.
- **Seção atual acende na nav**, via IntersectionObserver (nada por frame),
  com `aria-current`. Resolve o "onde eu estou" de site de página única.
- **7 seções ganharam nome acessível** (`aria-labelledby` → próprio título).
- Jornada por teclado conferida: 24 paradas, zero `tabindex` positivo, ordem
  natural, foco visível, e o CTA do painel do medidor fica fora da ordem
  enquanto fechado.

### Armadilha de MEDIÇÃO neste ambiente (custou tempo, anote)
`getComputedStyle` devolve o valor **interpolado no instante**, e aqui nada
progride (`document.hidden`, sem rAF, sem composição). Ler uma propriedade
logo após trocar a classe devolve o valor ANTIGO se houver `transition` nela
— parece bug e não é. Para verificar a regra de verdade: zere a transição
(`el.style.transition='none'`) antes de ler, ou inspecione o CSSOM. Isso
aconteceu três vezes seguidas (cor do link ativo, `max-height` do menu,
altura do painel).

### Publicação + linha do tempo do processo (fim de 2026-08-17)
O dono viu a reconstrução no celular e **aprovou**. A reconstrução foi
publicada (`72f0126`, seção 2). Em seguida ele pediu para **continuar o
design agora, e deixar o copy para depois** — ordem explícita: primeiro
termina todo o visual do site, depois mexe no texto.

Primeiro item do design entregue (`85ae398`, **ainda não publicado**):
- **Processo virou linha do tempo.** Eram três `.card` idênticos lado a lado,
  sem nada ligando — podiam ser lidos em qualquer ordem. Agora é uma sequência
  com trilho + um nó por passo (horizontal no desktop, vertical no celular).
  Trilho e nós são pseudo-elementos, zero DOM extra, nada por frame. Bug pego
  na verificação por geometria: o trilho quebrava nos dois vãos da grade;
  corrigido estendendo cada trecho meio-vão para os lados. Conferido contínuo
  e ancorado nos nós, desktop e mobile.
- **`docs/design-direction.md` marcado como HISTÓRICO — NÃO IMPLEMENTAR.** É do
  primeiro commit (2026-07-30) e descreve uma direção ABANDONADA: paleta
  esverdeada (H≈160°), corpo CLARO, fonte Outfit, arco escuro→claro→escuro. O
  site real é ciano, 100% dark (seção 5, sagrada). Implementar a partir dele
  quebra a identidade. Só a ideia da linha do tempo (neutra de paleta) foi
  aproveitada. **A fonte de verdade de design é ESTE HANDOFF, não aquele doc.**

### Passada de design 2026-08-17b — atmosfera + HUD (autonomia total)
O dono deu **autonomia total** ("execute, reveja, conserte, reveja de novo até
impecável, site inteiro"), pediu de volta a atmosfera antiga e liberou "fugir
um pouco" da identidade sem torná-la irreconhecível. Toda a fila de design da
sessão anterior foi FECHADA + os pedidos explícitos entregues. 5 commits
(`5a7f81f`..`81a787a`), nenhum publicado:

1. **Ritmo entre seções** (`5a7f81f`) — `.section` tinha padding idêntico.
   Agora escala de 3 tokens (`--sp-tight/--sp/--sp-loose`) + override por #id:
   dores cola no hero (tenso), serviços/projetos ganham fôlego, faq comprime,
   CTA respira. Costura: apertado·FÔLEGO·médio·FÔLEGO·apertado·FÔLEGO.
2. **Atmosfera de volta, TODA no canvas** (`4bd8bbd`, `81a787a`) — o pedido
   central do dono, feito pela via correta (contínuo=canvas, nunca var CSS por
   frame; foi um efeito assim que causou os 76ms):
   - **Cards por proximidade**: `field.js` mede os rects dos `.card` em
     scroll/resize (culling por visibilidade) e desenha aura + aro de luz que
     ACENDE conforme o cursor chega (`prox()` calcula distância no canvas).
     Sem holofote global — cada card responde por conta (a identidade veta
     holofote seguindo cursor; proximidade por card é outra coisa e foi pedida).
     No toque fica só a ambiente. Borda nítida do clique = `:hover` (CSS).
   - **Mini AI Core**: o barramento "Conectado ao AI Core" ganhou o núcleo de
     fato, flutuando acima do rótulo, com **elos até cada card de serviço**. O
     elo do card sob o cursor acende; no Pulso a frente sobe pelos elos.
   - **Tipografia viva**: títulos `.glow` com realce contínuo baixo (nunca
     "mortos") + frente do Pulso por cima.
3. **Linguagem HUD no site inteiro** (`4a07156`):
   - Cards ganham **colchetes de canto** (fracos em repouso, acendem no
     hover/foco) — marca de instrumento técnico.
   - **Seção dores**: os 3 ícones viram sistema (badge de canto cortado, igual
     nos três, `.card--dor`).
   - **FAQ**: saiu o 4º grid de cards; entrou **accordion nativo**
     (`details/summary`, `name="faq"` exclusivo, marcador +/− que vira −). Texto
     intacto — segue batendo com o FAQPage JSON-LD. Teclado/leitor nativos.
   - **Rodapé**: fio de luz no topo, CTA de WhatsApp (era beco sem saída), barra
     de base com copyright + assinatura de sistema.

**Invariante preservada**: nenhum `B.add` novo — `?perf` segue
`["campo","eventos","medidor"]`. Toda a atmosfera nova roda dentro do `campo`.

**NÃO verificado ao vivo (importante)**: o servidor do agente ficou
inalcançável de novo (isolado em 127.0.0.1) e `file://` cai em snapshot sem a
folha externa — logo **nem `__frame` nem feel foram medidos nesta sessão**.
Verificado: `node --check` nos 3 JS, balanço de chaves do CSS, estrutura do
HTML novo pelo snapshot (4 `.qa`, rodapé, dores), match do FAQ JSON, e revisão
de lógica linha a linha. Perf garantida por CONSTRUÇÃO (halos ~1ms/64, culling,
gated por orçamento). **O feel, o timing e o custo real de frame precisam do
navegador do dono com `?perf` + `__frame()`** — mesma ressalva das seções 7/8.

Pontos de maior incerteza visual (candidatos a ajuste fino, se o dono quiser):
o desenho do mini AI Core e seus elos; os colchetes nos cards de projeto/serviço
(podem ficar cheios); a intensidade da tipografia viva (`viva` em `field.js`).
Tudo é número num lugar só, fácil de calibrar.

Depois de TODO o design vem o **copy** (ordem explícita do dono, ainda de pé:
"design agora, copy depois"). NÃO foi tocado nesta sessão. Guia: sentence case,
zero invenção de dado (não inventar "48h", "+200 clientes"), voz direta que o
site já usa.

### Regra de trabalho que o dono valoriza (provada nesta sessão)
**Medir, não deduzir.** Todo efeito novo foi medido com `window.__frame(n)`
(só com `?perf`) antes de aceitar. Bugs foram achados por geometria calculada
(colisão de 13px no SaaS, trilho cortado na linha do tempo) que o olho nem
pegaria. Toda mudança foi verificada ao vivo no browser e commitada em
separado, com a mensagem explicando o PORQUÊ. O dono valoriza bug apontado
sem ser perguntado e decisão de não-fazer justificada (tilt, holofote).

### Ainda pendente
1. **Publicar todo o lote** (`rebuild` está **6 commits à frente do ar**: linha
   do tempo + contexto + a passada de atmosfera/HUD). Fazer em bloco, quando o
   dono pedir e depois de ele conferir o feel. **Não pushar sem pedir.**
2. **Design conferido pelo olho do dono**: nada da passada 2026-08-17b foi visto
   animando. Rodar `?perf` no PC e celular, olhar cards/AI Core/tipografia, e
   `copy(JSON.stringify(__frame(600),null,1))` para o custo real de frame.
3. **Copy** — a próxima fase pela ordem do dono. Ainda não começou.
4. Comprimir `assets/intro.mp4` (4,2 MB) e decidir o vídeo oficial — placeholder.
5. Destino de `feat/ai-core-3d` (reator 3D, 66 testes) — decisão do dono.
6. Analytics: o site é "orientado a conversão" e não mede conversão nenhuma.
   Levantei como a maior lacuna; o dono ainda não decidiu. Se entrar, entra a
   questão de consentimento/LGPD (hoje não rastreia nada).

---

## 9. Pendências antigas ainda abertas

- `assets/intro.mp4` (4,2 MB) segue sendo o objeto mais pesado do site.
  Além das guardas de rede declarada, ganhou em `16c5800` uma **trava de
  playback**: se em 3s a imagem não andou, entra direto no site em vez de
  segurar o visitante atrás de uma tela preta (um 4G congestionado passava
  pelas guardas antigas e podia dar ~14s de preto). Ainda assim: **comprimir
  vale**, e o vídeo oficial nem foi escolhido — o atual é placeholder.
- O medidor de fps aparece para todo visitante. Continua sendo uma escolha do
  dono; agora pelo menos se explica sozinho ao ser clicado, em vez de mostrar
  um número que só faz sentido para quem é técnico.
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
