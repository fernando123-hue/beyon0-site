# beyon.0 — transferência de contexto

**Última atualização:** 2026-08-07 · **Branch ativa:** `rebuild` · **HEAD:** `9b43e59`

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
| **`rebuild`** (atual) | `9b43e59` | **A reconstrução. É onde o trabalho continua.** |

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
index.html      273 linhas   markup semântico, UM canvas (#fx)
styles.css      409 linhas   identidade estática, zero var por frame
js/core.js      166 linhas   estado, loop único, orçamento, profilador
js/field.js     209 linhas   o canvas: campo + reator + brilho da tipografia
js/dom.js       160 linhas   reveals, nav, eventos (Pulso/Singular), medidor
```

Total **1.217 linhas**, contra 5.783 antes.

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

A base da reconstrução está commitada e o gargalo foi eliminado. **Aguardando o
veredito visual do dono** — ele ainda não viu a reconstrução rodando.

### Deixado deliberadamente de fora do primeiro commit
Foi cortado para provar a base rápida antes de somar efeito. O dono foi avisado
e pediu para dizer do que sentiu falta:

- **Intro em vídeo** (`assets/intro.mp4`, 4,4 MB) — não religada. Vale comprimir
  ou trocar por poster antes de voltar.
- **Glitch/aurora nas palavras-chave** (`<em>` dos serviços) — hoje só cor.
- **Barramento animado** sob os serviços — hoje é texto estático.
- **Tilt nos cards** e o campo de "memória" do cursor.
- **Reescrita de frases no Singular** (só o status do hero reescreve hoje).

### Próximos passos naturais
1. Dono roda e dá o veredito visual + número de fps.
2. Trazer de volta o que fizer falta, **um por vez**, cada um com orçamento de
   performance medido pelo `?perf`.
3. Decidir o destino de `feat/ai-core-3d` (o reator 3D em Three.js, 66 testes
   passando) — a reconstrução mudou a fundação, então aquela branch precisará de
   adaptação se for retomada.
4. Quando aprovado: merge `rebuild` → `main` e push (que publica).

---

## 9. Pendências antigas ainda abertas

- `assets/intro.mp4` tem 4,4 MB em autoplay.
- Histórico do git carrega ~50 MB de assets mortos (`Logo.gif` 20 MB,
  `introdução.mp4` 30 MB). Só `git filter-repo` limpa, e é destrutivo.
- O logo em vídeo foi **removido a pedido do dono**; a marca é o wordmark em
  texto. Não recolocar sem ele pedir.

---

## 10. Como trabalhar com este dono

- Português, direto, sem enrolação. Ele valoriza bug apontado sem ser perguntado.
- Ele testa no PC e no celular e dá o veredito visual — **o agente não consegue
  ver nada animar**.
- Commits em português, terminando com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Não pushar sem pedido** — push é deploy.
- Antes de otimizar: **medir**. Esta sessão provou o custo de não fazer isso.
