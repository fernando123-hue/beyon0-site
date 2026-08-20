# beyon.0 — transferência de contexto

**Última atualização:** 2026-08-20 · **Branch ativa:** `rebuild` · **HEAD:** `7fa082c` (NÃO PUBLICADO)

> **Se você é a próxima sessão, comece pela seção 12 (ESTADO ATUAL) — é a mais
> recente e resume tudo.** A seção 11 é o estado consolidado da sessão anterior e
> segue válida no que não foi substituído. As seções datadas acima delas são o
> histórico de como chegamos aqui; leia-as se precisar do porquê de uma decisão.
>
> **ATENÇÃO: há 11 commits prontos e NÃO PUBLICADOS.** Ver 12.1 — publicar ou não
> é a próxima decisão do dono.

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
| `origin/main` (**no ar**) | `9383f6d` | **Tudo publicado e alinhado com `rebuild`.** É o que o mundo vê. |
| `main` (local) | `9383f6d` | Igual a `origin/main`. |
| **`rebuild`** (atual) | `9383f6d` | Onde o trabalho continua. **0 à frente do ar** — tudo foi publicado. |
| `feat/ai-core-3d` | `df0458f` | 13 commits: Three.js + reator 3D, 66 testes passando. **Pausado**, não descartado. |

**Fluxo desta fase (muitos ciclos):** o dono pede um efeito → implemento na
`rebuild`, commito em separado com o PORQUÊ → ele diz "publica" → faço o
fast-forward + push → ele testa no celular e dá o próximo pedido. **Publica só
quando ele pede** (mas nesta fase ele pede a cada passo, pra ver no aparelho).

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

Rampa ciano, âncora + contraponto (ver EXCEÇÃO abaixo). Nenhum hex fora dela em repouso.

```
--void #000000 · --deep #0B1E3A · --mid #0F5E78
--glow #00F5FF · --hi #9FF8FF · --core #F2FEFF
--gold #FFC96B (raríssimo, só no Singular) · --led #E61A1A (só no medidor)
```

Fontes: **Sora** (300/600) + **JetBrains Mono** (400/500). Site 100% dark.
Sem holofote seguindo o cursor.

O Sora **400 saiu** em `01c990d`: nenhuma regra pedia esse peso. Ele só era
baixado porque `em` declarava 500 — peso que nunca esteve na lista — e o
navegador caía no 400, então a ênfase nunca acontecia de fato. `em` virou 600 e o
arquivo do 400 deixou de ser baixado. **Se alguém precisar de Sora 400 ou 500,
tem que adicionar ao `<link>` do Google Fonts** — não presumir que está lá.

**EXCEÇÃO do dono (2026-08-19): "matiz único" foi revogado.** A rampa passa a ter
uma âncora (ciano `#00F5FF`, intocada) mais um contraponto (violeta `#7C5CFF` no
repouso, brasa `#FF6B2C` no Singular). O motivo: com 4° de variação de matiz a
identidade lia monocromática. Varredura agora 70° no frio (34° só na folha de
CSS; os 70° só existem contando o violeta, que vive em `js/field.js` e não é
token de CSS), 37° no quente.
O **"zero verde" do Singular continua valendo** e agora é verificado por script.
Violeta/brasa vivem em `js/field.js`, não como token de CSS.
Spec: `docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md`.

**EXCEÇÃO do dono (2026-08-18): "sem vidro" foi revogado para os cards.** Ele
pediu de volta o efeito antigo — glass (`backdrop-filter`) + borda de energia
correndo a moldura (`b9b0463`). Não é regressão a corrigir: é decisão explícita
de quem manda na identidade. O `backdrop-filter` volta SÓ no desktop (fallback
opaco no celular). A borda de energia é um `@property --nrg` local (paint de
anel fino), pausado fora da viewport — **não** é a var-CSS-por-frame que causou
os 76ms (essa continua proibida). Se o medidor do dono acusar travada, o
primeiro a cortar é o `backdrop-filter` do desktop, depois a borda.

---

## 6. Arquitetura atual (branch `rebuild`)

```
index.html      411 linhas   markup semântico, UM canvas (#fx), overlay #intro, FAQ accordion
styles.css      985 linhas   identidade estática, zero var por frame, entrada 2 níveis, vidro+borda de energia
js/core.js      180 linhas   estado, loop único, orçamento, profilador
js/field.js     580 linhas   o canvas: campo + reator + cards + AI Core + TIPOGRAFIA POR GLIFO + Singular (aurora, onda, overdrive)
js/dom.js       344 linhas   reveal, nav+menu mobile, seção-atual, Pulso, SINGULAR em 4 fases, medidor, CTAs
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

### Passada de 2026-08-18 — vidro, tipografia por glifo, Singular reformulado
Três pedidos do dono, com autonomia total e ciclo executar-revisar-corrigir.
Publicado ao fim (ele pediu).

**1. Cards: vidro + borda de energia** (`b9b0463`) — pedido explícito de trazer
de volta o efeito da versão antiga. Ver a EXCEÇÃO registrada na seção 5. O
`@property --nrg` anima só o ângulo de um anel de 1px mascarado; **não** é a
var-CSS-por-frame que causou os 76ms. Pausa fora da viewport (`.is-idle`, IO).
`backdrop-filter` só no desktop. Depois estendido ao painel de CTA (`30861d1`),
mais lento (7,5s) porque a peça é grande.

**2. Tipografia viva por CARACTERE** (`37e5419`, `568d64a`) — **⚠ REMOVIDA em
`fcb7d15` (2026-08-18b).** O dono viu rodando e rejeitou: a luz redonda difusa
atrás dos títulos dava cara de mal feito ("não quero luzes"). Saiu inteira, com
todo o aparato (medirGlifos por Range, caches de glifo/palavra/card). Junto
saíram o brilho de proximidade dos cards e os glows externos (hover/Pulso/
Singular). **Não reintroduzir brilho atrás de texto ou card sem ele pedir.** O
registro abaixo fica como história do que foi tentado. — a alma do efeito
antigo (energia por glifo: campo ao redor do cursor, frente varrendo letra a
letra) SEM os 205 spans que custavam 68% do gargalo. O truque: **um Range sobre
o nó de texto devolve a caixa de qualquer caractere** — nenhum elemento novo,
nada para recalcular. As caixas são medidas só em mudança de LAYOUT (boot,
`document.fonts.ready`, resize com debounce de 180ms, `entrada-pronta`) e ficam
RELATIVAS ao título, então rolar custa 1 retângulo por título.
- Fontes de energia por glifo: percepção (cursor, raio 170px), frente do Pulso
  (na ORDEM DA FRASE via `cp`, então título de duas linhas acende certo) e a
  onda de choque do Singular.
- **A vida ambiente é UM gradiente por título, não um halo por letra.** Isto foi
  uma correção: na primeira versão o "respiro" somava energia e passava do
  limiar, fazendo TODO glifo visível desenhar um halo por frame (~40 halos,
  ≈0,6ms constantes — 6× o custo total do site). Agora o respiro MODULA a luz
  existente: em repouso, zero halos.

**3. Estado Singular reformulado — BRANCO + DOURADO** (`16a7993`, `43a450d`) —
pedido de "algo exagerado, que gere desejo". Virou evento em 4 fases (18s):
CARGA (campo puxado para o reator) → IGNIÇÃO (estouro branco + onda de choque
que **acende as letras que atravessa**) → REINADO (dourado com núcleos brancos,
aurora, reator em overdrive com serpentinas) → RESFRIAMENTO.
- `cor()` ganhou 2º estágio: ciano → dourado → branco.
- **O primeiro Singular agora vem aos 22-30s** (antes 45-85s). Motivo: a sessão
  típica de landing page é mais curta, e a maioria ia embora sem ver o
  espetáculo — que é o argumento de venda mais forte do site.

**Bugs pegos por medição, não por leitura** (o dono valoriza isto):
- Alfas passando de 1 (`rgba(...,3.380)`) com o Singular somando luminância.
  Alfa inválido em canvas é recusado em SILÊNCIO — o desenho sairia com a cor
  anterior, só no auge. Todos travados por `a1()`.
- Energia por glifo chegando a ~4 na ignição, inflando o raio do halo a 2,6× a
  letra: teto em 1,5.
- **Dois degraus na curva do Singular**, achados simulando a máquina de fases
  fora do browser (4000 amostras, medindo variação entre passos): `whiteHot`
  saltava 1,00→0,30 na virada ignição→reinado (a cena "pipocava") e dava outro
  degrau de 4% no resfriamento. Hoje a maior variação por passo é 0,007.
- `var(--nrg)` sem fallback: eu tinha DOCUMENTADO que o anel degradaria para
  estático sem `@property`. Era falso — um var() sem fallback invalida a
  declaração inteira e o anel sumiria. Corrigido para `var(--nrg, 0deg)`.

**Invariantes conferidas ao fim:** 3 subsistemas no loop
(`campo`,`eventos`,`medidor`), zero escrita de estilo por frame (só o LED do
medidor, 2×/s e guardado por comparação).

**Continua NÃO verificado ao vivo:** o servidor do agente segue inalcançável e
`file://` cai em snapshot sem a folha externa. Nada disto foi visto animando.
O que substituiu o olho: `node --check`, balanço de chaves, simulação numérica
das fases, e revisão linha a linha. **O medidor de fps do dono é o juiz** — e o
maior risco a vigiar é o `backdrop-filter` no desktop (primeiro a cortar se
travar; depois a borda de energia).

### Passada de OTIMIZAÇÃO + preparo pro futuro (2026-08-18, `80d1dc7`)
Pente fino de perf, por medição do custo. **Nenhum comportamento mudou — só o
custo.** Invariantes intactas (3 subsistemas, zero estilo por frame no loop).

- **DPR capado (`js/core.js`, `TETO_DPR`)** — a causa provável do 30fps no
  celular do dono: o canvas é tela cheia e o fill-rate cresce com DPR². Celular
  reporta DPR 2.5-3.5; agora o teto é 2 no desktop (ponteiro fino), 1,5 no
  mobile, 1,25 no fraco. ~40% menos fill no celular; como a cena é brilho suave
  (não texto), 1,5 é indistinguível. **Se ainda travar no mobile, o próximo
  lever é PAUSAR a animação da borda de aurora no celular** (o conic `@property`
  repinta por frame; hoje só a camada base roda no mobile, `::after` e o pulso
  já são `@media (pointer: fine)`).
- **Proximidade sem thrash (`js/dom.js`)** — `varrer()` lia `getBoundingClientRect`
  de todos os cards por frame de movimento (layout síncrono após escrever
  `--near`). Agora os centros ficam em cache em coordenadas de DOCUMENTO e o
  frame só subtrai o scroll: zero leitura de layout por frame. Recalcula em
  resize/load/entrada-pronta.
- **Arrays do reator izados (`js/field.js`, `GRADE`/`ANEIS`)** — eram recriados
  por frame; viraram const de módulo.
- **`.grid--2` removido** — morto desde o FAQ virar accordion.

### GUIA DE EXTENSÃO — como somar coisas sem quebrar a arquitetura
Pensado para as próximas implementações. As regras da seção 4 continuam valendo.
- **Nova seção**: `<section class="section" id="x" aria-labelledby="x-t">` com
  `.section__head.reveal` + `<h2 class="glow">`. Ganha ritmo automático; se pedir
  densidade própria, add override por `#id` no bloco "ritmo entre seções". Add o
  link na nav e no rodapé.
- **Novo card**: qualquer `.card` já herda vidro, borda de aurora, proximidade
  (`--near`) e o pico no hover/foco — nada a fazer. Ícone estilo dores? use
  `.card--dor`. Serviço com elo ao AI Core? use `.card--service` (o `field.js`
  mede `.card--service` e liga os elos).
- **Novo efeito contínuo**: desenhe no canvas (`js/field.js`, dentro do `tick`),
  NUNCA em CSS por frame. Gate por `orc` (orçamento) e culle por visibilidade.
  Se for um sistema à parte com estado próprio, registre com `B.add(nome, fn)` —
  mas saiba que isso quebra a invariante dos "3 subsistemas"; documente o porquê.
- **Cor que reage ao Singular**: use `cor(BASE, warmth, whiteHot)` no canvas, ou
  no CSS leia os tokens (`--glow/--hi/--core/--mid`) — o `.is-singular` já
  remapeia a rampa inteira para ouro+branco. Nunca hardcode ciano/teal (vira
  verde no dourado — ver `1ad7907`).
- **Novo evento do organismo**: escreva NÚMEROS em `S` (add o campo em
  `core.js`) e troque UMA classe no `<body>`; o canvas lê `S`, o CSS acompanha a
  classe. Modelo: Pulso e Singular em `js/dom.js`.

### Ainda pendente
1. **Publicar todo o lote** (`rebuild` está à frente do ar). Fazer em bloco,
   quando o dono pedir e depois de ele conferir o feel. **Não pushar sem pedir.**
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

---

## 11. Estado consolidado de 2026-08-18 (SUPERADO EM PARTE — ver seção 12)

> **Esta seção não é mais o estado atual.** Ela era o consolidado do fim de
> 2026-08-18 e continua válida em tudo que a seção 12 não substituiu — em
> particular o ecossistema (11.3), o inventário de efeitos (11.4) e o que
> preservar (11.6). O que ela diz de **publicação e paleta está desatualizado**:
> a rampa deixou de ser de matiz único (12.3) e há commits não publicados (12.1).

Na data desta seção estava tudo publicado (`9383f6d`). Site rico em efeitos,
**tudo ecoando num único ecossistema**, dentro da rampa ciano, sem travar
(segundo o dono, testando no celular a cada passo). As seções 1–10 são o
histórico; esta consolidava o hoje daquela data.

### 11.1 Arquivos
```
index.html      419 linhas   markup; carrega vendor/gsap + os js/ (defer, nesta ordem)
styles.css     1209 linhas   identidade + TODOS os efeitos CSS (bordas, aurora, glitch, caractere vivo, Singular)
js/core.js      185 linhas   estado (S), loop único (rAF), orçamento, profilador, TETO_DPR
js/field.js     443 linhas   o canvas: partículas, brumas, reator (engenharia de precisão), mini AI Core, Singular (aurora/onda/overdrive)
js/dom.js       411 linhas   reveals(cede ao GSAP), nav/menu, seção-atual, Pulso, Singular(4 fases), medidor, proximidade dos cards
js/intro.js      99 linhas   overlay de vídeo no boot — evento-só
js/entrada.js    80 linhas   a LINHA (nível 1) — evento único no boot
js/anima.js     197 linhas   CAMADA GSAP: entrada do hero, reveals de scroll, parallax, caractere vivo
vendor/gsap/                 gsap.min.js + ScrollTrigger.min.js + SplitText.min.js (hospedado local pela CSP)
```

### 11.2 GSAP — re-adicionado com disciplina (2026-08-18)
GSAP foi a dependência que a reconstrução **removeu** quando o site travava. O
dono pediu de volta ("animações impressionantes"). Re-adicionado assim:
- **Hospedado local** (`vendor/gsap`) porque a CSP é `script-src 'self'` — CDN é
  bloqueado. SplitText é grátis desde o GSAP 3.13; vendorada a 3.15.
- **É GSAP puro. NÃO há anime.js** (o arquivo `js/anima.js` é "animação" em
  português, não a lib). Confirmado — zero referência a anime.js.
- `js/anima.js` é **ADITIVO e OPCIONAL**: se o GSAP não carregar, ele sai sem
  tocar em nada e o site funciona igual (hero nasce visível; `dom.js` volta a
  ser dono dos reveals via `gsapReveal`). reduced-motion: não anima.
- **Só transform/opacity** (compositor) — nunca layout, nunca var-CSS-por-frame.
  O gargalo antigo era o COMO (var lida por 126 regras + 205 spans), não o GSAP.
- GSAP tem ticker próprio (2º rAF). Aceito: só trabalha com tween ativo, custo
  ocioso ínfimo. `lagSmoothing(0)`.
- **Segurança dos reveals**: `dom.js` cede quando `gsap+ScrollTrigger` presentes
  (`gsapReveal`); `anima.js` revela via `ScrollTrigger.batch` em 'entrada-pronta',
  com fallback no 'booted' (+4,5s), try/catch, e reveal imediato de quem já está
  no/acima do viewport (F5-no-meio). **Conteúdo NUNCA fica invisível** — vários
  guardas.

### 11.3 O ECOSSISTEMA — o que ecoa, e como (a alma do site)
O "organismo" é o estado `S` (core.js), dirigido por eventos discretos em
dom.js. Dois eventos raros varrem o site:
- **PULSO** (a cada 9–20s, 2,6s): uma onda. `S.pulse`/`S.pulseFront`. DOM ganha
  `.is-pulse`.
- **SINGULAR** (a cada ~70–130s, 18s, 1º aos 22–30s): o espetáculo em 4 fases
  (carga→ignição→reinado→resfriamento). BRANCO+DOURADO. `S.singular/warmth/
  whiteHot/shock`. DOM ganha `.is-singular` (+`.is-igniting` no estouro).

**Regra que dá unidade: todo efeito CONTÍNUO ecoa esses dois eventos.** Mapa:
| Efeito | onde | ecoa Pulso | ecoa Singular |
|---|---|---|---|
| reator, partículas, mini AI Core, brumas | canvas | ✓ (S.pulse) | ✓ (S.warmth→ouro) |
| aurora curtains, onda de choque, overdrive | canvas | — | ✓ (só existem no Singular) |
| **borda de energia** (cards + CTA) | CSS conic `@property` | ✓ acelera | ✓ acelera + ouro |
| **aurora text** (palavras `em`) | CSS bg-clip | ✓ acelera | ✓ acelera + ouro |
| **caractere vivo** (títulos) | CSS `ressoar` | ✓ acelera | ✓ acelera |
| **glitch** da wordmark | CSS | ✓ mais rápido | — |
| tokens de cor (rampa inteira) | CSS `.is-singular` | — | ✓ vira ouro+branco |

Num Pulso, o site inteiro acelera/aviva junto; num Singular, tudo vira
branco+ouro. **Sempre a mesma rampa ciano.** Se você adicionar um efeito novo
contínuo e ele NÃO reagir a `.is-pulse`/`.is-singular`, ele quebra o ecossistema
— conecte-o.

### 11.4 Inventário de efeitos (todos entregues, todos publicados)
- **Vidro + borda de aurora nos cards** (`b9b0463`, `3cd7ba7`): `backdrop-filter`
  (só desktop; mobile cai pra fundo opaco), + borda de 2,5px com DUAS correntes
  de conic contra-rotativas (aurora) + um pulso de energia (desktop). Exceção de
  identidade "sem vidro", revogada pelo dono para os cards (seção 5).
- **Proximidade dos cards** (`4dbf345`): a ESTRUTURA do card reage ao cursor (`--near`
  em js/dom.js, escrito só nos cards perto, só no pointermove/rAF — cache de
  centros em coords de documento, sem thrash). Nada de luz em volta (o dono
  vetou halos redondos).
- **Reator do hero = engenharia de precisão** (`5e20c1e`): bezel graduado (60
  marcas), grade concêntrica, raios, giroscópio de 3 anéis, núcleo poligonal.
- **Mini AI Core** (serviços): nó na folga acima do rótulo "Conectado ao AI
  Core", elos que ENCAIXAM na borda de baixo dos cards de serviço (curva Bézier).
- **Sem verde no Singular** (`1ad7907`): `.is-singular` remapeia a RAMPA INTEIRA
  (`--hi/--core/--mid/--deep`) pra ouro/branco; mock frames deixaram de ter teal
  hardcoded. Regra: **nunca hardcode ciano/teal** (vira verde no dourado).
- **Aurora text** (`073eba9`, `77abe19`): palavra `em` com preenchimento de
  gradiente fluindo (glow→hi→core, sem teal). Duas camadas (glint + aurora rica),
  `@supports` com fallback sólido. Distribuída pelos `em` (hero, serviços, CTA).
- **Glitch** (`77abe19`): aberração cromática ciano/branco + fatias `clip-path`.
  Kicker glitcha ao revelar; wordmark pisca (mais no Pulso) + hover; nav no hover.
- **Contraste/espaço** (`53a7537`): gap e padding dos cards maiores, cards mais
  opacos (destacam do preto), `em` com peso 500.
- **GSAP entrada do hero** (`51cb415`): título sobe por LINHAS atrás de máscara
  (SplitText), cascata até os botões.
- **Reveals de scroll** (`e4d44f4`): `ScrollTrigger.batch` sobe cada `.reveal` ao
  entrar; parallax sutil do reator.
- **CARACTERE VIVO** (`f8e29d3`, `32b4f65`, `37178f6`): cada letra dos títulos é
  um `.char` (SplitText) que faz uma onda `ressoar` defasada pelo índice `--i` —
  a ressonância percorre as letras e ecoa o organismo. **Duas classes**: `.split`
  (permanente: cor/estrutura, guarda anti-letra-invisível) e `.viva`
  (ligada/desligada pela viewport via ScrollTrigger — só o título VISÍVEL anima,
  segura o custo). O `em` NÃO é char-split: `vivaChars` restaura seu texto plano
  (e limpa o inline-block do SplitText, senão estoura no mobile) → a **aurora
  convive com a ressonância** na mesma palavra.

### 11.5 Perf — o pente fino (`80d1dc7`) e o que vigiar
- **TETO_DPR** (core.js): canvas em tela cheia, custo ∝ DPR². Teto: desktop 2,
  mobile 1,5, fraco 1,25. Corta ~40% do fill no celular. Foi o que resolveu o
  30fps que o dono viu.
- **Proximidade sem thrash**: centros em cache (coords de documento), zero
  `getBoundingClientRect` por frame de movimento.
- **Ainda a vigiar no mobile** (o dono é o juiz do fps): a soma de tudo animando
  num Pulso; as bordas conic; o caractere vivo. **Se travar, a ordem de alívio
  é:** (1) `backdrop-filter` do desktop, (2) a 2ª camada da borda (`::after`),
  (3) gatear a onda do caractere vivo só pra `@media (pointer: fine)`.
- **Instrumentação viva**: `?perf` liga `window.__perf()` e `window.__frame(n)`.
  O agente NÃO renderiza CSS nem compõe frames — validação aqui é `node --check`,
  balanço de chaves, simulação numérica e leitura. **O olho e o medidor do dono
  são o juiz final.**

### 11.6 O que PRESERVAR (não quebrar)
1. **As 5 leis (seção 4)**, com as exceções conscientes já registradas (vidro nos
   cards; GSAP como camada aditiva compositor-only; animações CSS contínuas
   localizadas — bordas/aurora/glitch/caractere — que são PAINT, não recálculo).
2. **Loop único** no canvas (`B.add`): 3 subsistemas (`campo`,`eventos`,`medidor`).
   O GSAP tem ticker próprio à parte — ok, mas nada de escrever estilo por frame.
3. **Rampa ciano sagrada**; nunca hardcode ciano/teal (vira verde no Singular).
4. **Todo efeito contínuo novo ECOA o organismo** (`.is-pulse`/`.is-singular`).
5. **Degradação**: tudo funciona sem GSAP e em reduced-motion. Conteúdo nunca
   fica invisível.
6. **Publicar em fast-forward, só quando o dono pede.**

### 11.7 PONTO EXATO ONDE PAROU
Acabei de publicar `9383f6d` (revisão: `em` não estoura no mobile + ressonância
do hero mais cedo) e o dono pediu ESTA transferência de contexto. **Nenhum
pedido novo pendente.** O ciclo atual é: o dono pede um efeito/refino → implemento
→ publico → ele testa no celular → próximo. Ele valoriza muito o processo
"executar → analisar → aprimorar → analisar" e pede revisões profundas de
coerência ("tudo ecoa entre si?").

Provável próximo: mais refino visual dos efeitos, ou — quando ele decidir —
começar o **COPY** (a fase que ficou pra depois de todo o design; ordem antiga
do dono, ainda de pé; guia: sentence case, zero invenção de dado, voz direta).

### 11.8 Pendências (as de sempre + novas)
1. **Copy** — a fase pós-design. Não começou.
2. `assets/intro.mp4` (4,2 MB) — comprimir + escolher o vídeo oficial (placeholder).
   `ffmpeg` NÃO está instalado no ambiente do agente.
3. `feat/ai-core-3d` (reator 3D, 66 testes) — decisão do dono.
4. Analytics/conversão — o site é "orientado a conversão" e não mede nada. LGPD
   entra se for adiante.
5. Histórico do git com ~50 MB de assets mortos (`Logo.gif`, `introdução.mp4`) —
   só `git filter-repo` limpa, destrutivo.

---

## 12. ESTADO ATUAL (2026-08-20) — LEIA PRIMEIRO

Duas sessões cobertas aqui: a de **contraste dos cards + pente fino** (publicada) e
a da **paleta de duas cores** (pronta, **não publicada**).

### 12.1 SITUAÇÃO DE PUBLICAÇÃO — a primeira coisa a resolver

| ref | commit | estado |
|---|---|---|
| `origin/main` | `01c990d` | no ar na Vercel |
| `origin/rebuild` | `01c990d` | igual |
| `rebuild` (local) | `7fa082c` | **11 commits à frente, prontos, revisados, não publicados** |
| `main` (local) | `9383f6d` | ref local desatualizado — irrelevante, o deploy sai do remoto |

Publicar é `git push origin rebuild:main` (fast-forward). **O dono não pediu ainda** —
a última publicação foi `01c990d`, e ele autorizou explicitamente. A regra dele é:
publicar só quando pedir.

### 12.2 Sessão A — contraste dos cards + pente fino (`01c990d`, PUBLICADO)

O dono disse que os cards estavam "sem sal". O diagnóstico foi mensurável, não
subjetivo: o corpo do card era `deep` a .26–.5 sobre **preto**, o que resolve em
`rgb(3,20,22)` — indistinguível do fundo. O painel não existia; só a borda de aurora
trabalhava.

O que entrou:

- **Superfície real** com direção de luz (clara em cima, caindo para a sombra),
  aresta especular branca no topo, borda em .30 (era .12). Contraste vs `#000` no
  topo: 1.05–1.20 para 1.44–1.86; borda vs painel 1.30 para 2.32; aresta 1.28 para
  2.50. Sobre `#000` não existe sombra externa possível — o relevo vem do valor da
  superfície, nunca de glow em volta (vetado pelo dono).
- **`--painel` como token único**, lido por `.card`, `.qa` e `.cta`. Hierarquia na
  borda: .20 (FAQ) / .26 (CTA) / .30 (card).
- **As três conics de aurora viraram token** (`--aurora-rampa`, `--aurora-contra`,
  `--aurora-nos`). Cada uma estava escrita duas vezes e as cópias já divergiam — a do
  celular tinha perdido a aresta especular.

**Quatro bugs silenciosos corrigidos nesta sessão — não reintroduzir:**

1. **`transition` do card era `none` no navegador.** `.reveal` e `.has-gsap .reveal`
   também declaram `transition` e venciam `.card` (a primeira por ordem, a segunda por
   especificidade), levando embora `background` e `transform`. A proximidade do cursor
   pulava sem interpolar e o hover não elevava nada. Corrigido com o token `--t-card`
   mais as regras `.card.reveal` e `.has-gsap .card.reveal` — **a ordem dessas regras
   no arquivo importa** (a de 2 classes tem que vir depois de `.has-gsap .reveal`). O
   elevar do hover passou a usar `translate`, property independente, para não disputar
   valor com o `transform` do reveal.
2. **A cascata CSS de entrada do hero engolia a do GSAP.** Keyframes com `fill: both`
   vence estilo inline no cascade, e o fill forwards persiste: status, subtítulo, ações
   e dica de scroll **nunca animavam**. A entrada "mais lenta e suave" que o dono pediu
   estava escrita e não rodava. `has-gsap` agora entra no elemento raiz no topo do
   `anima.js`, antes de qualquer tween, e o CSS virou fallback explícito
   (`html:not(.has-gsap) .booted .hero__*`).
3. **`.is-pulse .card` e `.is-singular .card` sobrepunham o hover** — mesma
   especificidade e vinham depois no arquivo. Resolvido com
   `:not(:hover):not(:focus-within)`.
4. **`em` pedia Sora 500, peso que não é carregado** — o navegador caía no 400 e a
   ênfase nunca acontecia. Virou 600 (melhora também a aurora: letra fina quase não tem
   área para um gradiente fluir dentro) e o arquivo do Sora 400 saiu do carregamento.

Limpeza: classe `.glow` removida do HTML (7 usos, zero regras em CSS/JS);
`.is-igniting` e `ignitindo` removidos do `dom.js`; 5 `!important` do rodapé eliminados
escopando `.footer p` para `.footer__brand p`, com render idêntico; dois listeners de
scroll viraram um; `getElementById('nav')` duplicado com deref sem guarda; rede de
segurança no `heroEntra` (agora que o GSAP é o único caminho de entrada, um throw
deixaria a primeira tela invisível).

Também nesta sessão, a pedido do dono: o mini AI Core pipocava (o gate `orc > .55` era
corte seco, e o orçamento oscila perto do limiar) — trocado por LERP em `nucAlpha`. E o
**flash branco da ignição do Singular foi removido** (era `body::after` com o keyframe
`sing-flash`); a classe `.is-igniting` deixou de existir.

### 12.3 Sessão B — paleta de duas cores (11 commits, NÃO PUBLICADA)

Pedido: "melhorar a paleta, sem fugir da identidade, para não ficar tudo muito
monocromático. Também considere isso no estado dourado."

**Diagnóstico:** a rampa não era pouco saturada — era **um matiz só**. Tudo entre 182°
e 186°, o que dá **4,1°** de variação. O que faltava era **viagem de matiz**: sombra e
luz serem cores diferentes, não a mesma cor em brilhos diferentes.

**Decisão do dono (perguntada e respondida):** direção "B + elementos de B+" — viagem
de matiz na rampa, mais um contraponto vivendo na atmosfera do canvas E com papel
semântico. Sobre o reator, ele escolheu explicitamente **núcleo violeta, estrutura
ciano**: o hero continua lendo ciano de longe, e de perto tem duas cores conversando
dentro da mesma peça. A leitura é "a inteligência é a segunda cor, a interface é a
âncora".

**A rampa agora:**

| | repouso (frio) | Singular (quente) |
|---|---|---|
| sombra | `--deep #0B1E3A` 216° | `42 14 12` (#2A0E0C) 4° |
| meio | `--mid #0F5E78` 195° | `138 58 22` (#8A3A16) 19° |
| **âncora** | `--glow #00F5FF` 182° **intocada** | `--gold #FFC96B` 38° **intocada** |
| luz | `--hi #9FF8FF` e `--core #F2FEFF` | `#FFE6B0` e `#FFFFFF` |
| **contraponto** | violeta `#7C5CFF` 252° | brasa `#FF6B2C` 18° |

**Varreduras autoritativas** (recalculadas dos hex reais — usar estas, não estimar):

| rampa | varredura |
|---|---|
| frio antigo | 4,1° |
| frio novo, só CSS | 33,4° |
| frio novo, paleta completa (com o violeta do JS) | 69,4° |
| quente antigo | **4,1°** |
| quente novo | 37,0° |

O quente antigo tinha **exatamente o mesmo problema** que o frio — os dois eram um
matiz só, com a luminância variando. (O spec afirmava "~20°" para o quente antigo; era
estimativa, nunca cálculo. Corrigido, com nota no spec, porque as mensagens de commit
das Tasks 2 e 6 já carregam o número errado e não podem ser reescritas.)

**Assimetria assumida:** o quente fica com 37° contra 70° do frio. É deliberado — fogo
é fenômeno de matiz estreito, e a riqueza vem da leveza e da saturação. Brasa e ouro
estão só 20° de matiz um do outro, mas têm 1.87 de contraste e 12 pontos de leveza
entre si: o olho lê laranja e ouro como cores distintas. Rosa `#FF5C7A` foi considerado
(49° do ouro, espelho estrutural mais puro) e **descartado** — briga com a identidade
de "ouro derretido", e a brasa é fisicamente correta para um núcleo em combustão. A
brasa foi escolha explícita do dono.

**REGRAS NOVAS que precisam ser preservadas:**

- **Violeta e brasa NÃO são tokens de CSS.** A cor do canvas nunca passa pela folha de
  estilo — lei antiga do projeto. Elas vivem **só** como constante em `js/field.js`.
  Declarar `--alt` no `:root` cria variável sem consumidor.
- **Violeta nunca carrega texto.** Dá 4,83 sobre `#000` mas **4,17 sobre o painel**,
  que passa AA só em texto grande. Ele é atmosfera, geometria e acento grande.
- **`--mid` segue proibido para texto** (2,89). Lei antiga, continua valendo.
- **Hex e par `-rgb` mudam sempre juntos.**
- **`cor()` tem 4 parâmetros:** `cor(base, w, hot, alvo)`, com `alvo` opcional caindo
  em `OURO`. O violeta é o único que passa alvo próprio (`BRASA`). O motivo é grave: em
  `warmth = 1` (o auge do Singular) o violeta misturado para `OURO` viraria exatamente
  `255,201,107` — **o mesmo ouro de todas as outras cores**. O contraponto
  desapareceria no pico do evento e o quente voltaria a ser mono-ouro.

**Onde o violeta vive** (12 linhas em `js/field.js`, todas verificadas): atmosfera —
resolução por frame (l.209), partículas de faixa fraca (l.243, ternário `p.f > .55`, o
**mesmo** corte que o núcleo branco do Singular já usava, para não criar dado novo por
partícula), bruma (l.258), cortina de baixo da aurora (l.272-273); AI Core — núcleo
poligonal do reator (l.400, 403, 405), gradiente do elo (l.434), nó do mini core
(l.458, 459, 462).

**Fica CIANO, e isto é a restrição central:** bezel, grade concêntrica, raios,
giroscópio e overdrive (linhas 312–391) têm **0** usos de `vio`. O ponto central de
ambos os núcleos segue `nuc` (branco) — fonte de luz satura ao branco. As portas nos
cards e o barramento também intactos.

**Os elos contam a história da paleta:** saem **ciano** no card e acendem para
**violeta** no nó, via `createLinearGradient(sn.cx, sn.cy, hx, hy)`. A transição entre
as duas cores acontece exatamente onde ela significa algo.

**Perf:** `__frame(300)` deu 0,128–0,214 ms (o teto de preocupação era 2). O gradiente
por elo não é categoria nova de custo — `halo()` já cria um radial por chamada. Medido
com a aba oculta, então a rasterização real do traço com gradiente não foi capturada;
risco baixo (lineWidth 1, 6 traços curtos), mas só o `?perf` na máquina do dono fecha.

### 12.4 Processo — como esta sessão trabalhou (o dono valoriza isso)

O processo dele, que ele mesmo confirmou: **executar, analisar, aprimorar, analisar**,
com revisão de coerência no fim ("tudo ecoa entre si?").

A paleta foi feita com o ciclo completo: **brainstorming, spec, plano, execução por
subagente**. Vale repetir para trabalho grande:

- `docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md` — o desenho aprovado
- `docs/superpowers/plans/2026-08-19-paleta-duas-cores.md` — 6 tarefas, cada uma um
  commit próprio, nenhuma mudando comportamento
- `.superpowers/sdd/progress.md` — o ledger, com o que cada tarefa entregou, os achados
  de cada revisão, e o veredicto final

**Subagentes só com pedido explícito do dono.** Ele autorizou escolhendo "1" quando
ofereci as duas formas de execução. Não presumir.

**Duas perguntas que ele respondeu e que valem como decisão permanente:** a direção da
paleta (B + elementos de B+) e o tratamento do reator (núcleo violeta, estrutura
ciano). Ele também pegou, por conta própria, que eu tinha silenciosamente trocado a cor
`#FF6B2C` que ele havia gostado — ele **lê os detalhes**. Se você trocar uma decisão
dele, avise.

### 12.5 Armadilhas DESTE ambiente (custaram tempo, anote)

- **`npx http-server` não sobe** no sandbox. Servidor node puro na porta 8899 funciona.
  O script fica no scratchpad como `srv.js` e está transcrito no plano, na seção
  "Servidor local para verificar no navegador".
- **`navigate` direto para localhost é negado.** `preview_start` com
  `url: http://127.0.0.1:8899/index.html` funciona.
- **A aba do agente não compõe frames.** `document.hidden` é `true`,
  `requestAnimationFrame` não roda, **screenshot é impossível**, animações CSS ficam
  congeladas em `currentTime: 0`. Consequência prática: valor computado de **custom
  property atualiza**, mas **`box-shadow` e `translate` NÃO** atualizam em resposta a
  pseudo-classe ou classe. Portanto: verificar tokens por `getPropertyValue`, e estados
  (hover, Pulso, Singular) por **inspeção de CSSOM**. Não concluir "quebrou" a partir de
  opacidade 0 durante a entrada — force `getAnimations().forEach(a=>a.finish())` e
  `gsap.globalTimeline.progress(1)` antes de medir estado final.
- **`window.__frame(n)`** roda os subsistemas na mão, fora do rAF — funciona mesmo com
  a aba oculta. É a única medição de perf disponível aqui.
- **Git no Windows normaliza CRLF** e pode mostrar um arquivo como modificado
  transitoriamente. Dois subagentes reportaram `js/field.js` sujo; a árvore estava
  limpa. Verificar antes de acreditar.
- **`python` não existe** no PATH (só o alias da Microsoft Store). Usar `node -e`.
- **Escrever check de verificação sem rodar contra o arquivo real dá errado.** Dois
  defeitos de plano nesta sessão, os dois do mesmo tipo: `grep -c 'var gb'` não casava
  porque a variável está em lista de vírgulas (`var NB = 12, gb = ...`), e o `sed` com
  `/NUCLEO POLIGONAL/` não casava porque o arquivo tem `NÚCLEO` **com acento** (o range
  vazava até o fim do arquivo e o check dava 5 em vez de 0, parecendo violação com tudo
  correto). Rodar o comando antes de escrevê-lo no plano.

### 12.6 PONTO EXATO ONDE PAROU

A paleta está **completa, revisada tarefa por tarefa, e com a revisão final de branch
inteiro feita**. Veredicto: **pronto para publicar, zero Critical, zero Important.**

A revisão final foi feita **inline pelo controlador**, não por subagente: o subagente
foi cortado pelo limite de sessão com 14 tool calls e nenhuma conclusão. Os 6 pontos de
atenção foram verificados por cálculo direto e estão registrados no ledger
(`.superpowers/sdd/progress.md`, seção final). O que ela achou de novo, e que nenhuma
revisão por tarefa tinha visto: **contraste no estado quente** — calculado nos três
pontos do painel, tudo passa AA (branco 17,8 a 20,0; `hi` quente cheio 14,6 a 16,4;
`hi` a .74 8,4 a 9,0; ouro 11,7 a 13,1).

**A próxima ação é do dono: publicar ou não.** Nada de código está pendente.

### 12.7 O que só o olho do dono fecha

Nada disso é verificável neste ambiente, porque a aba não compõe frames:

1. **O hero ainda lê ciano de longe?** Era a condição da escolha dele. Se o núcleo
   violeta dominar, baixar as alfas em `js/field.js:400,403,405`.
2. **O núcleo violeta conversa com a estrutura ciano ou briga?** São 70° de distância.
   Se brigar, o meio-termo é puxar o violeta para ~235° (mais azul, menos roxo).
3. **A bruma virou 100% violeta** e é a camada mais visível no celular. Implementador e
   revisor da Task 4 concordaram que há risco de a cena puxar demais para o violeta.
   **Ajuste pronto, não aplicado de propósito:** alfa `.022` para `.016` em
   `js/field.js:258`. É decisão de gosto dele.
4. **O elo lê como transição ou como duas linhas coladas?** Se ficou abrupto, mover o
   stop (ciano em 0, ciano em .45, violeta em 1) para o violeta só aparecer perto do nó.
5. **O Singular ficou rico ou sujo?**
6. **`?perf` com `__frame()` na máquina dele** — confirmar o custo de frame com a aba em
   primeiro plano, compondo de verdade.

### 12.8 Pendências

1. **Publicar os 11 commits** (ver 12.1) — decisão dele.
2. **Copy** — a fase pós-design, nunca começou. Ordem antiga dele, ainda de pé. Guia:
   sentence case, zero invenção de dado, voz direta.
3. **`assets/intro.mp4` (4,4 MB)** é o peso dominante do site — 43 vezes todo o resto
   (o código todo dá 103 KB gzip, dentro do orçamento). Duas saídas, as duas decisão
   dele: **re-encodar** (receita em `assets/README.txt`; `ffmpeg` **não** está instalado
   neste ambiente) ou **intro só na primeira visita** via `sessionStorage`, que corta
   4,4 MB de todo retorno. Não fiz porque o `styles.css` documenta "Toda visita" como
   escolha deliberada — é chamada de branding, não defeito.
4. `feat/ai-core-3d` (reator 3D, 66 testes, `df0458f`) — decisão dele. O ledger antigo
   está arquivado em `.superpowers/sdd/progress-ai-core-3d-arquivo.md`.
5. Analytics e conversão — o site é "orientado a conversão" e não mede nada. LGPD entra
   se for adiante.
6. Histórico do git com ~50 MB de assets mortos (`Logo.gif`, `introdução.mp4`) — já
   gitignorados e fora do deploy; só `git filter-repo` limpa o histórico, e é destrutivo.
