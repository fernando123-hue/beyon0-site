# beyon.0 — transferência de contexto

**Última atualização:** 2026-08-16 · **Branch ativa:** `rebuild` · **HEAD:** `349f202`

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
| **`rebuild`** (atual) | `349f202` | **A reconstrução + intro em vídeo + entrada em 2 níveis (linha única no load + fade sutil no scroll). É onde o trabalho continua.** |

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
index.html      372 linhas   markup semântico, UM canvas (#fx), overlay #intro
styles.css      654 linhas   identidade estática, zero var por frame, entrada 2 níveis
js/core.js      178 linhas   estado, loop único, orçamento, profilador
js/field.js     261 linhas   o canvas: campo + reator + tipografia + aura + barramento
js/dom.js       218 linhas   reveal sutil (nível 2), nav, eventos, medidor, CTAs
js/intro.js      99 linhas   overlay de vídeo no boot — evento-só, sem rAF
js/entrada.js    80 linhas   a LINHA (nível 1) — checagem única no boot, sem rAF loop
```

Total **~1.860 linhas**, contra 5.783 antes. Não há mais `main.js` nem
`vendor/` (GSAP): eram 305 KB de código morto, sem nenhuma referência no
`index.html`, que ainda assim subiam no deploy. **O projeto não tem
dependência de runtime nenhuma.**

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

### Deixado deliberadamente de fora (herdado da reconstrução original)
- **Glitch/aurora nas palavras-chave** (`<em>` dos serviços) — hoje só cor.
- **Barramento animado** sob os serviços — hoje é texto estático.
- **Tilt nos cards** e o campo de "memória" do cursor.
- **Reescrita de frases no Singular** (só o status do hero reescreve hoje).

### Próximos passos naturais
1. Dono roda e dá o veredito visual da entrada em dois níveis: (a) load no
   topo → só o hero anima com a linha; (b) F5 no meio/fim → a seção visível
   roda a linha + cascata (não aparece pronta); (c) rolar depois → só o fade
   sutil, nunca a linha; (d) voltar a uma seção já vista → sem replay. Fps
   pelo `?perf`.
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
