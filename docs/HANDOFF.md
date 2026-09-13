# Beyon Zero — transferência de contexto

**Última atualização:** 2026-09-13d · **Branch ativa:** `rebuild` · **HEAD:** `d68cc8d` — **PUBLICADO** (`git push origin main` a pedido do dono, `origin/main` = `d68cc8d`, fast-forward de `b9b731e`). Inclui as seções 22 e 23. Nada da seção 23 foi visto rodando ao vivo pelo agente nesta sessão (ver seção 23) — conferir no navegador de verdade.

> **SEÇÃO 23 (COPY ALINHADA AO NICHO + FEE-ONLY NO CTA FINAL, 2026-09-13d)
> é a mais nova.** Trocou a headline genérica do CTA final ("não pela
> tecnologia", que o próprio briefing já tinha marcado como discurso
> padrão do setor) por algo que ataca a objeção real de compra do nicho
> (desconfiança de ROI/comissão escondida), declarou o modelo fee-only
> que já era decisão de negócio mas nunca tinha ido pro site, alinhou
> "negócio/empresa/cliente" pra "organização/associado" no hero e nas
> dores, e aumentou o espaçamento do painel de CTA final. Nada inventado
> — nenhum número/case novo. Não visto rodando (agente não alcança
> servidor próprio neste Windows por causa do espaço em `C:\Program
> Files\nodejs`, e `file://` é bloqueado pelas tools de navegador aqui).

> **SEÇÃO 22 (CRO + SEO DO NICHO + RESUMO PRA DIRETORIA, 2026-09-13c)**
> — ainda não publicada, ver seção 23 pro que veio depois dela. 3 pilares: (A) CRO aditivo na página atual — reassurance no
> form, escassez honesta sem número inventado; (B) SEO técnico pro nicho —
> `<title>`/description/JSON-LD agora citam associações/sindicatos/
> federações, `robots.txt`+`sitemap.xml` novos (não existiam); (C)
> `resumo.html` novo — página isolada (sem canvas/animação) pensada pra ser
> encaminhada dentro da diretoria de quem decide em grupo. Novo
> `js/tel.js` centraliza o telefone (antes só vivia dentro de `dom.js`).
> **Achado durante a pesquisa**: o site não tinha nenhum case/número de
> prova publicado — o que existia era plano interno (Canvas do app), não
> copy validada. Nada disso entrou no site; ver a spec pra detalhe.
> Spec: `docs/superpowers/specs/2026-09-13-cro-seo-resumo-design.md`.

> **SEÇÃO 21 (MODAL DE QUALIFICAÇÃO, 2026-09-13b) — publicada, com um
> bugfix retroativo.** Hero, CTA final e (desde a correção) o CTA do nav
> ("Agendar diagnóstico") abrem um modal antes do WhatsApp — hoje 4 campos
> (nome, organização, tipo com "Outro" livre, desafio opcional). Os outros
> 8 CTAs continuam sem fricção. **Bug crítico achado DUAS vezes na mesma
> sessão**: `[hidden]` do HTML e uma classe com `display:` próprio têm a
> MESMA especificidade, mas origem-autor sempre vence origem-UA — então
> `hidden` não tinha efeito nenhum, o elemento ficava sempre visível
> (a 1ª vez isso deixou o site INTEIRO sem responder a clique, coberto por
> um modal "invisível" fixed/inset:0/z-index:80). Resolvido na raiz com
> uma guarda global em `styles.css` (topo do arquivo, logo após o reset):
> `[hidden] { display: none !important; }` — cobre qualquer elemento
> futuro que precise de `hidden` junto de uma classe com display próprio.
> **Se você for a próxima sessão e for usar `hidden` em algo novo, essa
> guarda já cobre — não precisa de fix pontual de novo.**

> **A SEÇÃO 16 (CAMADA DE ATMOSFERA) é a mais nova, agora publicada.**
> Ela acrescenta uma camada por cima da 14 (que continua inteiramente válida) e
> traz a única mudança de REGRA desta sequência: a lei "nada anima sozinho em
> repouso" da 14.4 passou a ter uma fronteira explícita — atmosfera respira,
> conteúdo não. Ler a 14.4 sem a 16.1 dá uma regra que o código já não segue.
>
> **Se você é a próxima sessão, comece pela SEÇÃO 15 (ENTRADA PARA A
> PRÓXIMA SESSÃO) — é o atalho, escrito pra isso.** Ela aponta pra seção 14
> (RECONSTRUÇÃO VISUAL TOTAL, 2026-08-21), que substitui as seções 5 e 6 por
> inteiro: a identidade visual mudou de paleta, o AI Core foi redesenhado do
> zero, e uma camada de efeitos nova entrou. Ler as seções 5/6 sem saber
> disso vai te dar uma imagem ERRADA do estado atual — elas descrevem o
> ciano neon (`#00F5FF`) e o reator-orbe antigos, que não existem mais no
> código. A seção 13 é a entrada da sessão anterior, mantida como histórico.

> **Se você é a próxima sessão, comece pela SEÇÃO 13 (ENTRADA PARA A PRÓXIMA
> SESSÃO) — é o ponto de entrada rápido, escrito pra isso.** As seções 12.1–
> 12.11 são o histórico detalhado de como se chegou aqui; leia-as só se
> precisar do porquê de uma decisão específica. As seções datadas antes da
> 11 são histórico mais antigo ainda.
>
> **Tudo publicado, árvore limpa, zero commit pendente** neste ponto —
> primeira vez nesta sequência de sessões que o fechamento é limpo assim.
>
> **O nome certo da empresa é Beyon Zero, não beyon.0** — corrigido no código
> em 12.10. Se você é uma sessão nova e ainda pensa "beyon.0", pare e leia
> 12.10 antes de escrever qualquer copy nova.
>
> **Há uma peça separada, fora deste repositório**: um playbook comercial
> pro vendedor do dono, em `C:\Vault - Fernando\Beyon 0 - Playbook Comercial\`.
> Ver seção 13.3 antes de presumir que só existe o site.

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

## 5. Identidade visual — SAGRADA (SUPERADA — ver seção 14)

> **Esta seção descreve a paleta ANTES da reconstrução de 2026-08-21.** O
> ciano `#00F5FF` saturado, as superfícies tingidas (`--deep`/`--mid`), a
> "borda de aurora" e o vidro (`backdrop-filter`) nos cards foram TODOS
> substituídos. Fica aqui como registro histórico de como a identidade
> evoluiu — ver seção 14.1 pra paleta e regras atuais. Não implemente nada
> a partir do que está abaixo sem conferir a seção 14 primeiro.

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
uma âncora (ciano `#00F5FF`, intocada) mais um contraponto. O motivo: com 4° de
variação de matiz a identidade lia monocromática.
O **"zero verde" do Singular continua valendo** e agora é verificado por script.
Spec: `docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md`.

**EXCEÇÃO do dono (2026-08-20): o contraponto trocou de violeta para prata fria
— SUBSTITUI o parágrafo acima sobre o contraponto.** Motivo do dono: "acabou
ficando meio enjoativo, vamos redirecionar esse sentimento para algo tech, que
impressionem quem olhar". Diagnóstico: ciano+violeta é o par de dois néons
saturados que quase todo produto de IA usa hoje — era essa competição que lia
como enjoo, não a saturação em si. Escolhido entre 3 direções (dono pediu por
`AskUserQuestion`): **prata/branco frio no repouso** (`rgb(108,122,142)`, só em
`js/field.js`, nunca token de CSS) — desaturação, não um segundo matiz. **Ouro
continua sendo o contraponto do Singular**, sem mudança — o dono gostou
explicitamente dessa parte e pediu para preservar. A prata perdeu o alvo quente
próprio que o violeta tinha (era `BRASA #FF6B2C`, removida do código): agora
funde para ouro igual a tudo mais, porque o ouro é a assinatura única do
Singular, não dividida com uma segunda cor. Varredura de matiz não se aplica
mais do mesmo jeito — a prata é dessaturada de propósito, não um matiz a X° do
ciano. Detalhe completo, incluindo o porquê da luminância escolhida (120 contra
os 111 do violeta que ela substitui) e o que só o olho do dono fecha:
`docs/design-tokens.md` REV 4.

**EXCEÇÃO do dono (2026-08-18): "sem vidro" foi revogado para os cards.** Ele
pediu de volta o efeito antigo — glass (`backdrop-filter`) + borda de energia
correndo a moldura (`b9b0463`). Não é regressão a corrigir: é decisão explícita
de quem manda na identidade. O `backdrop-filter` volta SÓ no desktop (fallback
opaco no celular). A borda de energia é um `@property --nrg` local (paint de
anel fino), pausado fora da viewport — **não** é a var-CSS-por-frame que causou
os 76ms (essa continua proibida). Se o medidor do dono acusar travada, o
primeiro a cortar é o `backdrop-filter` do desktop, depois a borda.

---

## 6. Arquitetura atual (branch `rebuild`) (SUPERADA — ver seção 14)

> **Contagem de linhas, nomes de efeito ("TIPOGRAFIA POR GLIFO", "borda de
> aurora") e a descrição do AI Core abaixo são de ANTES da reconstrução de
> 2026-08-21.** A tipografia-por-glifo (cada letra oscilando pra sempre) foi
> REMOVIDA — rodava sem produzir efeito visual nenhum depois que a folha de
> estilo foi reescrita (achado da sessão de lapidação, ver 14.4). O AI Core
> não é mais um reator com bezel/grade/giroscópio — é uma abertura de
> lâminas. A seção 14.2 tem a contagem de linhas e o mapa de arquivos atuais.
> O resto desta seção (o rAF único, `js/core.js`, a entrada em dois níveis,
> a armadilha do `:not(#fx)`) continua **verdadeiro** — a arquitetura de
> performance não mudou, só o que é desenhado dentro dela.

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

**Reconfirmado em 2026-08-20, com condição explícita**: perguntei de novo
depois do reposicionamento para IA (ticket sobe de R$3-10K para os R$50-80K+
da seção 38 do documento mestre, e ticket alto normalmente pede confiança em
alguém). Resposta: **"Vamos manter em anônimo por enquanto, até a equipe
estiver completa."** Isso muda a natureza da decisão — não é mais "escolha de
posicionamento", é "estado transitório até um marco de negócio" (equipe
completa). Reabrir quando ele avisar que a equipe fechou, não antes.

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

- ~~`assets/intro.mp4` segue sendo o objeto mais pesado do site~~ **RESOLVIDO
  em 2026-08-21c: a intro em vídeo foi removida por inteiro.** Ver seção 18.
- O medidor de fps aparece para todo visitante. Continua sendo uma escolha do
  dono; agora pelo menos se explica sozinho ao ser clicado, em vez de mostrar
  um número que só faz sentido para quem é técnico.
- Histórico do git carrega ~54 MB de assets mortos (`Logo.gif` 20 MB,
  `introdução.mp4` 30 MB — tracked no commit inicial `d1814ff`, destrancado
  do git em `adc4a3d` mas continua nos commits antigos — e agora `intro.mp4`
  4,2 MB, removido em 2026-08-21c mas ainda vivo nos commits anteriores). Só
  `git filter-repo` limpa, e é destrutivo.
- O logo em vídeo (antigo, removido a pedido do dono) continua fora; a marca
  segue sendo o wordmark em texto. **Agora os DOIS vídeos que o site já teve
  estão fora** (o logo, e a intro de boot — seção 18): a Beyon Zero não usa
  vídeo em lugar nenhum do site hoje.

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
2. ~~**Copy** — a fase pós-design, nunca começou.~~ **FEITA em 2026-08-20** (`0bdbaf1`),
   e é uma MUDANÇA DE POSICIONAMENTO, não um passe de texto. O dono entregou um
   documento mestre de 76 seções ("BEYON.0 — AI-FIRST") definindo a empresa como
   **AI-first**, e a copy antiga vendia websites — contradição direta (§21 "A Beyon
   não faz sites", §59 "a palavra mais importante é INTELLIGENCE"). Reescrito: head,
   metadados, os dois JSON-LD, as 7 seções, rodapé, medidor e a mensagem de WhatsApp
   em `js/dom.js`. Estrutura, ids, classes e paleta intactos; zero CSS tocado.
   **Ainda não revisada pelo olho do dono.** Decisões que ele pode querer reverter
   estão no corpo do commit — em especial: sites viraram 1 card entre 6 em vez de
   6 de 6, e o CTA saiu de "Solicitar orçamento" para "Agendar diagnóstico".
   Guia que continua valendo: sentence case, **zero invenção de dado** (§63), voz direta.
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

---

## 12.9 — Sessão de 2026-08-20b: reposicionamento de copy + contraponto vira prata

Continuação da sessão que fechou em 12.6-12.8. Modelo trocou de Opus para Sonnet 5
no meio (o dono trocou via `/model`); nada no processo mudou por causa disso.

### O que aconteceu, em ordem

1. **O dono trouxe um documento mestre de 76 seções** ("BEYON.0 — AI-FIRST")
   redefinindo a empresa como AI-first: IA é o núcleo, não uma feature. Pediu
   para reformular TODA a copy do site com base nele.
2. **Copy inteira reescrita** (`0bdbaf1`) — ver pendência 2 acima para o resumo;
   a mudança de posicionamento completa está no corpo daquele commit.
3. **Voz unificada em primeira pessoa** (`acaf5f0`) — a copy nova tinha rachadura
   de plural/singular (hero prometia "nós", o resto entregava "eu"); o dono pediu
   "unifica tudo em eu" depois de eu apontar o risco. `Achamos` virou `Encontro`
   (não `Acho`, que em PT também significa "suponho" — enfraqueceria a promessa).
4. **Duas perguntas resolvidas**: estúdio anônimo reconfirmado com condição nova
   (ver seção 8 acima, "Reconfirmado em 2026-08-20"). Sites-como-1-card-entre-6
   ficou **sem resposta** — não é bloqueio, é decisão que segue aberta.
5. **Paleta REV 4 — contraponto de violeta para prata fria.** O dono, no celular,
   sem conseguir ver nada renderizado: "acabou ficando meio enjoativo, vamos
   redirecionar esse sentimento para algo tech, que impressionem quem olhar."
   Ofereci 3 direções por `AskUserQuestion` (âmbar/ouro promovido a contraponto
   de repouso · ciano puro sem contraponto · ciano + prata/branco frio) porque é
   decisão de gosto, sem loop de verificação visual possível, e a paleta é
   "SAGRADA" — errar custa um ciclo inteiro de publicar-e-esperar ele checar no
   celular. **Escolheu prata/branco frio**, e junto: "a ideia do âmbar/ouro me
   cativou, ela pode ser usada para complementar o estado Singular" — ou seja,
   manter o ouro exatamente como já estava (raro, só no Singular), não expandir.
   Implementado (`js/field.js`): `VIOLETA` (`124,92,255`) → `PRATA`
   (`108,122,142`); `BRASA` removida (a prata não tem mais alvo quente próprio —
   funde para ouro como tudo mais); `cor()` perdeu o 4º parâmetro `alvo`, hoje
   morto. Renomeado `vio`→`pr` nas ~12 chamadas. Luminância da prata escolhida
   por cálculo (BT.709), não por olho — 120 contra os 111 do violeta que ela
   substitui — de propósito: preserva o peso visual de cada alfa já calibrado no
   arquivo (bruma, halo, elo, núcleo) e a auditoria de contraste da REV 3, em vez
   de recalibrar dezenas de números às cegas. Detalhe completo:
   `docs/design-tokens.md` REV 4.

### O que só o olho do dono fecha (novo, além do que já estava em 12.7)

Nada disto foi verificável neste ambiente — a aba não compõe frames, e o dono
está no celular, só vai ver depois de publicado.

1. **A prata lê como "metal frio" ou como "cinza morto"?** É a pergunta central
   da REV 4. O risco maior está no elo card→núcleo AI Core: antes ia de ciano
   vivo a violeta vivo (duas cores acesas); agora vai de ciano vivo a prata
   discreta (uma acesa, uma discreta) — pode ler como o núcleo "apagando" em vez
   de "resfriando". Se ficar fraco, subir a LUMINÂNCIA da prata em
   `js/field.js:56`, não a saturação (o ponto é ficar frio, não virar um
   terceiro néon).
2. **Itens 1, 2, 4, 5, 6 de 12.7 continuam abertos** — nunca foram resolvidos, e
   a troca de contraponto não muda a pergunta sobre o núcleo do hero, a bruma
   (`.016` já aplicado, `6c1117f`), o elo, ou o Singular. O item 3 de 12.7 (bruma
   violeta) está tecnicamente resolvido por tabela — não há mais violeta.
3. **A copy nova bate com o visual?** Ninguém comparou os dois lado a lado ainda
   fora deste ambiente — nem eu (não vi nada renderizar), nem o dono (só copy,
   ele leu; só paleta, ele não viu).

### Pendências que MUDARAM de estado

- ~~Sites-como-1-card-entre-6~~ e ~~estúdio anônimo agora que o ticket subiu~~:
  a segunda foi respondida (ver seção 8). A primeira **segue sem resposta**.
- Contraponto violeta: RESOLVIDO — virou prata. Não reabrir sem novo pedido.
- Tudo mais de 12.8 (intro.mp4, ai-core-3d, analytics, histórico do git)
  **inalterado, ainda pendente**.

### Publicar

**Ainda não publicado.** `rebuild` está ~17 commits à frente de `origin/main`
neste ponto. Fluxo de publicação continua o mesmo do §2: fast-forward,
`git push origin rebuild:main`, só quando o dono pedir.

---

## 12.10 — Correção de nome: a empresa se chama Beyon Zero, não beyon.0

O dono, numa sessão à parte (playbook comercial do vendedor), disse: **"a
empresa se chama Beyon Zero, considere isso"** — marcado como muito
importante. Corrigido em todo o site, não só no playbook, porque "volte a
focar no site" + "analise tudo que você fez" foi pedido explícito depois.

**24 ocorrências corrigidas** em `index.html`, `js/dom.js`, `styles.css`:
título, meta OG/Twitter, `name` do JSON-LD `ProfessionalService`, wordmark
(nav + rodapé, `beyon<b>.0</b>` → `Beyon <b>Zero</b>`), status do hero (2
lugares no HTML + 3 no `dom.js`, que precisam bater IDÊNTICOS — são o texto
de repouso do glitch morph), mensagem padrão do WhatsApp, copyright do
rodapé. Também os títulos de `docs/HANDOFF.md` e `docs/design-tokens.md`
("fonte da verdade").

**O que NÃO mudou, de propósito:**
- **O domínio** (`beyon0-site.vercel.app`) — em toda URL absoluta (canonical,
  og:url, og:image, twitter:image, JSON-LD `url`/`image`). Trocar domínio é
  decisão de infraestrutura separada (DNS, redirecionamento, Vercel), não
  uma correção de texto. Não presumi que o dono queria isso também.
- **Um trecho histórico** em `docs/design-tokens.md` (~linha 156, análise do
  briefing original de logo, 2026-07-23) — é registro do que foi medido
  NAQUELE momento; reescrever história para "consertar" o nome falsearia o
  registro. Só os títulos (identidade atual) foram corrigidos.
- **A grade CSS do wordmark** — sem largura fixa em `.nav__logo`/`.wordmark`,
  confirmado por leitura; "Beyon Zero" (10 caracteres) cabe sem risco de
  estouro onde "beyon.0" (7) cabia.

**Verificado:** os dois JSON-LD parseiam e a `FAQPage` continua batendo
palavra por palavra com a seção visível (5 pares — o rename não tocou
nenhum texto de FAQ). Zero tag desbalanceada. `js/dom.js` e `js/field.js`
passam `node --check`. Busca ampla por `beyon\.0` no repo inteiro (HTML/JS/
CSS) retorna zero fora de `vendor/gsap` (biblioteca de terceiros, não é
nosso texto).

**Passada de revisão geral** (pedido do dono: "analise tudo que você fez, e
aprimore") além do nome: reli a copy AI-first inteira e o CSS à procura de
resíduo da copy antiga ("landing page", "e-commerce", "interfaces de elite")
— achei uma única ocorrência de "landing page", em comentário técnico do
`dom.js` sobre timing do Singular, usando o termo no sentido genérico de
formato de página (não como oferta de serviço) — não é resíduo, é descrição
precisa, mantido. Conferi as 6 âncoras internas (`#hero` a `#faq`) — todas
resolvem. Considerei adicionar ao FAQ a objeção "isso é coisa de empresa
grande?" (aparece no playbook do vendedor e lá faz sentido — abordagem de
rua a negócio pequeno) mas decidi não adicionar aqui: quem chega ao SITE
already passou por um funil diferente do de abordagem fria, e enfiar uma
pergunta especulativa sem sinal real de que é dúvida comum do visitante
seria inventar problema pra copy resolver — contra a própria regra do
documento mestre (§63, não inventar).

Nada mais mudou nesta passada — o resto da copy, paleta e estrutura seguem
exatamente como as sessões anteriores deixaram (seções 12.1–12.9).

---

## 12.11 — Bug real na borda do Singular + cards reformulados

O dono publicou, olhou no celular e mandou print: no Estado Singular, o
painel do card vira marrom/dourado certinho, mas a **borda de aurora
continua ciano**. Pediu correção da borda (mais espessa, mais energia) e
reformulação dos cards ("parecem genéricos... liberdade criativa... TUDO").

### O bug — causa raiz, não falta de regra

`--aurora-rampa`/`--aurora-contra`/`--aurora-nos` (`styles.css`) são custom
properties que **referenciam outras** custom properties (`--glow-rgb` etc.)
dentro da própria definição, e só existiam declaradas no `:root`. O
mecanismo do CSS: uma `var()` dentro de uma custom property resolve **no
elemento onde ELA PRÓPRIA é declarada** — não onde é consumida depois. Como
`--aurora-rampa` só existia no `:root`, o gradiente que ela guarda já
nasceu resolvido em ciano; herdar a variável herda o resultado pronto, não
a fórmula. Redeclarar `--glow-rgb` em `.is-singular` (o que já acontecia)
não alcançava um cálculo que já tinha sido feito lá em cima.

Prova por comparação: `--painel` (o fundo do card) usa `--mid-rgb`/
`--deep-rgb` **direto** na declaração de `.card` — sem indireção — e por
isso vira marrom certinho. `.mock__frame` também usa `--glow-rgb` direto e
tem um comentário confirmando que funciona por causa disso. Só as três
variáveis de aurora, por serem indiretas, ficavam presas.

**Correção**: redeclarar as três rampas dentro do bloco `.is-singular`
(mesma fórmula, resolvendo agora com os tokens dourados já trocados no
mesmo bloco). É duplicação de propósito — documentada com um comentário
grande para NINGUÉM "limpar" achando redundante e reintroduzir o bug. Como
`.cta::after` usa o mesmo `--aurora-contra`, o CTA final ganhou a correção
de graça.

### Borda — mais espessa, mais presente

- `padding` da moldura (`.card::before/::after` e `.cta::before/::after`):
  `2.5px` → `3.5px`. Pedido explícito do dono ("se necessário, mais
  espessas").
- Opacidade de repouso subiu: `.card::before` de `.55` para `.72` (piso), o
  `::after` do desktop de `.45` para `.6` — a borda lê como ligada olhando
  de longe, não só no hover.
- As paradas de cor das três rampas ficaram mais saturadas (ex.: `.5` →
  `.68` no pico do ciano) — mais presença sem trocar a paleta.

### Cards — a "etiqueta de instrumento" (`.card__tag`)

Diagnóstico do "genérico": o site inteiro já se apresenta como painel
medido (medidor de FPS, kickers `// NN`, linha do tempo numerada) e o card
era a única peça que não falava essa língua — texto solto num retângulo.

Não mexi na geometria do card nem no sistema de máscara da borda (frágil,
sem forma de verificar visualmente neste ambiente — risco alto pra ganho
incerto). Em vez disso, um número pequeno, mono, no canto superior direito
de cada um dos 12 cards (3 dores + 6 capacidades + 3 aplicações),
reaproveitando a MESMA gramática tipográfica dos kickers — sem `//` de
propósito, porque isso já marca cabeçalho de seção; aqui é só o índice, cru,
como etiqueta de peça numerada. Acende com a proximidade do cursor (mesma
variável `--near` que já acende o resto do card) e vira dourado sozinho no
Singular, porque usa `var(--glow-rgb)` direto — o mesmo padrão que funciona,
não o que tinha o bug.

Um ajuste de colisão: só `.card--service h3` nasce na mesma faixa vertical
da etiqueta (nos outros dois tipos, ícone ou moldura empurram o título pra
baixo primeiro) — ganhou `padding-right: 1.8rem` pra "Sistemas &
interfaces" (o título mais longo) nunca correr por baixo do número.

**Verificado**: chaves do CSS balanceadas (299/299); 12 cards, 12
etiquetas, sequência correta por seção (01–03, 01–06, 01–03); zero tag HTML
desbalanceada; as duas cópias da rampa de aurora (`:root` e `.is-singular`)
continuam estruturalmente idênticas depois do ajuste de saturação
(conferido por diff). **Não verificado**: nada visual — mesma limitação de
sempre, a aba deste ambiente não compõe frames. A ideia da causa raiz foi
confirmada por raciocínio sobre a especificação de custom properties do
CSS, não por captura de tela.

### O que fica pro olho do dono

1. A borda ficou "mais espessa" o suficiente, ou ainda pede mais? `3.5px`
   foi o valor escolhido; se pedir mais, é só o `padding` de
   `.card::before, .card::after` (e o par em `.cta`).
2. O número no canto lê como "instrumento" ou como ruído? É a aposta
   central desta passada.
3. A borda do Singular virou dourada de verdade agora? Essa parte eu tenho
   confiança alta (é matemática de cascade, não gosto), mas o "fica bonito"
   só o dono julga.

---

## 13. Entrada da sessão de 2026-08-20 (HISTÓRICO — ver seção 15 pra entrada atual)

> Esta seção foi o ponto de entrada rápido até a reconstrução de 2026-08-21.
> 13.1/13.2/13.4 estão desatualizadas (branch, lista de mudanças, decisões
> em aberto — tudo isso a seção 15 substitui). **13.3 (Playbook Comercial)
> e 13.6 (como o dono trabalha) continuam válidas, sem mudança.** 13.5
> (armadilhas do ambiente) continua válida E ganhou itens novos — ver 14.5.

Fechamento limpo, de propósito: tudo publicado, árvore limpa, nada
pendente de decisão técnica. As seções 12.1–12.11 são o histórico
detalhado de COMO se chegou aqui (leia se precisar do porquê de uma
decisão específica); esta seção é o ponto de entrada rápido.

### 13.1 Estado agora

```
main = rebuild = origin/main = a60e414
```

Árvore limpa, zero commit pendente, zero divergência. `git status` deve dar
"nothing to commit, working tree clean" — se não der, algo mudou desde que
isto foi escrito; leia `git log` antes de confiar neste resumo.

Fluxo de publicação (testado e confirmado várias vezes nesta sessão):
```
git checkout main && git merge rebuild --ff-only && git push origin main && git checkout rebuild
```
O dono pede publicação de forma direta ("publica isso", "publique o
site") — não é preciso perguntar de novo se o pedido já veio assim.

### 13.2 O que esta sessão fez, em ordem

1. Ajuste fino de bruma (alfa `.022`→`.016`) — pendência antiga da sessão
   anterior, aplicada no início desta.
2. **Reposicionamento total da copy**: de "estúdio de sites" para "IA
   aplicada", a partir de um documento mestre de 76 seções que o dono
   trouxe. Ver 12.2 pro detalhe — foi troca de negócio, não de tom.
3. **Unificação de voz**: a copy nova tinha plural/singular misturado
   ("achamos" vs "eu digo"); virou tudo primeira pessoa do singular.
4. **Paleta REV 4**: contraponto trocou de violeta pra prata fria
   (`js/field.js`), por pedido direto do dono ("ficou enjoativo"). Ouro
   continua raro, só no Singular — isso não mudou.
5. **Correção de nome em todo o código**: a empresa se chama **Beyon
   Zero**, não "beyon.0". 24 ocorrências corrigidas — título, meta tags,
   JSON-LD, wordmark, status do hero, WhatsApp, copyright. O domínio
   (`beyon0-site.vercel.app`) foi DELIBERADAMENTE mantido — trocar domínio
   é decisão de infraestrutura separada, ninguém pediu isso ainda.
6. **Bug real corrigido**: a borda de energia dos cards não virava dourada
   no Singular. Causa: `--aurora-rampa` e afins são custom properties que
   referenciam OUTRAS custom properties, e só existiam no `:root` — uma
   `var()` aninhada resolve no elemento onde é DECLARADA, não onde é
   consumida. Ver 12.11 pro raciocínio completo; é conhecimento que vale
   pra qualquer token novo que algum dia precise reagir ao Estado Singular.
7. **Cards ganharam etiqueta de instrumento** (`.card__tag`): número mono
   no canto, mesma gramática dos kickers `//`. Não mexi na geometria do
   card nem no sistema de máscara da borda — decisão deliberada de reduzir
   risco num ambiente sem verificação visual.
8. **Playbook comercial do vendedor** — peça SEPARADA, fora deste repo.
   Ver 13.3.

### 13.3 O Playbook Comercial — não está neste repositório

O dono contratou o primeiro vendedor e pediu um guia de vendas mobile.
Isso é **deliberadamente separado do site**:

- **Arquivo fonte**: `C:\Vault - Fernando\Beyon 0 - Playbook Comercial\playbook.html`
  — pasta irmã desta (`Beyon 0`), fora do git deste projeto, fora do
  deploy da Vercel. Zero risco de vazar junto com um push do site.
- **Publicado como Artifact** (privado, específico pra essa conversa) —
  16 telas, scroll-snap vertical, identidade herdada do site (mesmos
  tokens de cor, mesmas fontes), reescrito do zero pra vender IA aplicada
  em vez de site institucional (o playbook original, v1, vendia
  "presença digital" — ficou desalinhado assim que o site virou AI-first).
- Conteúdo: prospecção, diagnóstico (reaproveita os 3 pilares do próprio
  site — trabalho repetitivo / oportunidade parada / conhecimento
  disperso — e o método Mapa·Prioridade·Construção), objeções, fechamento,
  funil. Guia interno de preço (R$10-80mil) explicitamente marcado como
  "nunca diga antes de mostrar o problema".
- Se o dono pedir mais mudanças nele numa sessão futura, **é um arquivo
  diferente, num diretório diferente** — não confundir com o site.

### 13.4 Decisões em aberto (nenhuma bloqueia nada, todas esperam o dono)

| Decisão | Estado | Onde foi discutido |
|---|---|---|
| Site como 1 card entre 6, ou volta a ser central? | Sem resposta, segue aberta | 12.9 |
| Estúdio anônimo | Mantido, condicional a "equipe completa" | 8, 12.9 |
| Domínio `beyon0-site.vercel.app` vs nome real | Não mudou, decisão separada | 12.10 |
| Borda `3.5px` é espessa o bastante? | Aplicado, aguarda veredito visual | 12.11 |
| Etiqueta de instrumento nos cards: lê bem ou é ruído? | Aplicado, aguarda veredito visual | 12.11 |
| `intro.mp4` 4,4 MB (reencodar ou só 1ª visita) | Nunca resolvida | 12.8 |
| `feat/ai-core-3d` (reator 3D, 66 testes) | Pausada, intocada | 2, 12.8 |
| Analytics/conversão | Site não mede nada ainda | 12.8 |
| Histórico do git (~50 MB de assets mortos) | Só `git filter-repo` resolve, destrutivo | 12.8 |

### 13.5 Armadilhas deste ambiente (sempre valem, repetido porque custam tempo)

- **A aba deste agente NÃO compõe frames.** Nenhuma sessão consegue ver
  animação, cor renderizada, ou espaçamento de verdade. Todo julgamento
  visual é do dono, sempre. Verificação aqui é estrutural (sintaxe, tags
  balanceadas, contraste calculado) — nunca "eu vi que ficou bom".
- Arquivo `file://` fora da pasta do projeto abre como **snapshot
  estático** — sem JS, sem interação. Só serve pra olhar HTML/CSS crus.
- `getComputedStyle` logo após trocar classe pode devolver o valor
  ANTIGO se houver `transition` — zerar a transição antes de ler, ou
  inspecionar o CSSOM.
- Custom property que referencia outra custom property (`--a: var(--b)`)
  resolve no elemento onde é DECLARADA — não onde é usada depois. Achou
  esse bug uma vez (12.11), pode aparecer de novo em token novo.

### 13.6 Como o dono trabalha (confirmado, não mudou)

Português direto. Pede publicação com uma frase curta ("publica isso") —
não precisa confirmar de novo. Manda print do celular quando algo não
bate com o esperado, espera que a causa seja investigada de verdade (não
só reaplicado um valor diferente no escuro). Corrige com "considere
isso" quando um fato mudou (ex.: nome da empresa) e espera que a correção
se espalhe por tudo que for relevante, não só o que foi perguntado.
Aprova subagente só quando pede explicitamente — regra do sistema, não do
dono, mas vale registrar que nunca foi preciso usar um nesta sessão.

---

## 14. RECONSTRUÇÃO VISUAL TOTAL (2026-08-21) — LEIA ANTES DE 5 E 6

O dono pediu uma reformulação completa do site — não restyling, reconstrução:
"não tenha apego ao código atual", "se alguma estrutura estiver prejudicando
o resultado, substitua". Cinco commits, nesta ordem: reformulação visual →
AI Core → camada de efeitos → varredura de lapidação → capa social. Esta
seção é a referência atual; **substitui as seções 5 e 6 por inteiro**.

### 14.1 A nova identidade — "INSTRUMENTO DE PRECISÃO"

Diagnóstico do porquê o site anterior (ciano neon + borda de aurora em 13
elementos + vidro) lia como "tem algo faltando", apesar de tecnicamente
correto: a cor não significava nada (o mesmo ciano saturado em ~20
componentes diferentes, incluindo as SUPERFÍCIES — nem o "cinza" era
neutro), ~25 elementos com `inset 0 0 0 1px` (tudo virava caixa flutuante),
e o hero era o template genérico que `design-quality.md` proíbe
explicitamente (centralizado, reator atrás do texto, pill de status).

Nova paleta — **5 neutros frios + 1 cor de ação + 1 estado quente**, e nada
mais:

```
--bg #050507 · --s1 #0A0A0D · --s2 #101015 · --line #1C1C22 · --line-hi #2C2C36
--t1 #EDEDF1 (17,4:1) · --t2 #9A9AA6 (7,3:1) · --t3 #7E7E8A (5,1:1) · --stroke #62626F (3,4:1, contorno de CONTROLE — WCAG 1.4.11)
--ac #4FD8F0 (a ÚNICA cor de ação) · --warm #F0B44F (o Singular troca só isto)
```

Todos os pares texto/fundo passam AA (conferido por script, não no olho — ver
14.5). `--ac` e `--ac-rgb` são **`@property` tipados** (`syntax: '<color>'` /
`'<number>+'`), com a transição declarada UMA vez em `body`: é isso que faz o
Singular trocar de ciano pra âmbar suavemente em vez de saltar — ver 14.5
pro porquê de precisar disso (não é o mesmo bug de `var()` aninhado da
12.11, é outro: gradiente/box-shadow não interpola cor via transição comum,
precisa do valor tipado).

**Regra de estrutura**: malha (grid com gap de 1px sobre `--line`) e régua,
não caixa. `.mesh` (capacidades) e `.apps` (aplicações) são os dois lugares
que usam isso — as frestas de 1px viram a grade, zero borda declarada por
célula. `.diag` (a seção "o problema") é três LINHAS com índice mono e
régua embaixo, não mais três cards.

**O que morreu, e por quê**: borda de aurora animada (13 elementos,
conic-gradient, o efeito mais caro e mais repetido do site antigo);
`em`/aurora-text (gradiente clipado no texto, 2 camadas animadas); todo
`backdrop-filter`/glassmorphism; `.mock__frame` (8 camadas de gradiente por
card simulando "uma interface", em `#projetos` — virou `.apps`, uma leitura
de estado: três marcos ligados por fio, só o último recebe cor); `--gold`
como paleta paralela do Singular (virou `--warm`, e a troca é só de temperatura
da MESMA luz — antes o Singular remapeava fundo+borda+texto+painel e o site
virava "outro site" por 18s).

### 14.2 Arquitetura atual — contagem real

```
index.html      486 linhas
styles.css     1353 linhas
js/core.js      185 linhas   INTOCADO — loop, orçamento, profilador, tudo igual
js/field.js     571 linhas   canvas: paleta realinhada + AI Core reconstruído (14.3)
js/dom.js       434 linhas   +3: `--near` passou a escrever em `.app` também, não só `.card`
js/anima.js     214 linhas   -75: `vivaChars()` (tipografia-por-glifo) removida por inteiro
js/entrada.js    80 linhas   intocado
js/intro.js      99 linhas   intocado
```
> `js/intro.js` **saiu do projeto em 2026-08-21c** (seção 18) — a tabela acima
> é o retrato desta sessão especificamente, não o estado atual do arquivo.

`js/anima.js` não existia como arquivo citado nas seções antigas com esse
peso — GSAP + ScrollTrigger + SplitText continuam sendo a única dependência
de runtime (vendored em `vendor/gsap/`, ~124KB bruto). O que mudou é que ele
ficou mais magro: a função que quebrava cada título em `.char` e fazia cada
letra oscilar pra sempre (`@keyframes ressoar`, 3s infinite) rodava **mesmo
depois** de `styles.css` perder as regras `.char`/`.viva`/`.split` na
reescrita — 220 `.char` + 40 `.palavra-viva`, ~260 nós de DOM, quase metade
dos elementos da página inteira, produzindo efeito visual **zero**. Achado e
removido na varredura de lapidação (commit `1ff4ec9`). A página caiu de 542
para 282 elementos. SplitText continua em uso na entrada do hero
(`type:'lines', mask:'lines'`) — isso é evento de entrada, não foi tocado.

### 14.3 O AI Core — de orbe a abertura

O reator do hero (e o "mini AI Core" no barramento das capacidades) era um
**orbe**: bezel de 60 marcas, grade concêntrica de 3 círculos, 12 raios,
giroscópio de 3 elipses inclinadas girando em ritmos diferentes, núcleo
poligonal, 2 halos (um do tamanho do núcleo inteiro). 9 elementos redondos,
7 rotações simultâneas — a "esfera neon genérica de produto de IA" que o
dono pediu explicitamente pra evitar, e que não tinha relação com o resto
da página, agora toda ortogonal (malha, régua, ângulo reto).

Virou uma **abertura de precisão** (diafragma de 6 lâminas retas), com o
MESMO vocabulário do site — malha, régua, marca de registro:

1. **Malha** — a mesma grade de `.mesh`, em círculo, estática.
2. **Anel de registro** — círculo fino + 4 marcas cardeais que NÃO giram.
3. **Varredura** — um arco curto percorrendo o anel. Único movimento
   contínuo (era 7 rotações; virou 1).
4. **Abertura** — 6 lâminas retas (corda tangente a um círculo interno,
   pontas na borda externa). No Singular ela ABRE (raio interno cresce) —
   resposta mecânica legível, no lugar dos 12 feixes radiais antigos.
5. **Eixos** — cruz de referência, completando a malha.
6. **Ponto** — uma luz central pequena. Era 2 halos; virou 1.

**Como a geometria foi validada sem conseguir ver o navegador renderizar**:
escrito um rasterizador PNG em Node.js puro (Float64Array + `zlib.deflateSync`,
sem `canvas`/`sharp`/dependência nenhuma — script descartável, não ficou no
repo) que reproduz a MESMA matemática do `field.js` e desenha os três
estados (repouso/pulso/Singular) lado a lado. Isso pegou um bug real antes
de publicar: com `rOut` fixo (`R*.74`), a lâmina passava **80px** do canto
do hexágono contra uma aresta de 55px — sobra maior que o trecho útil,
lendo como gravetos cruzados, não diafragma. Corrigido derivando `rOut` de
`rIn` pelo circunraio do hexágono (`K_HEX = 1/cos(π/n)`) com folga de 1.10 —
testado 1.04/1.10/1.16/1.22 no rasterizador antes de escolher. Custo: caiu
de 0,393ms/frame pra 0,241ms (repouso) — o bezel antigo sozinho fazia 60
`ctx.stroke()` individuais.

**Se a próxima sessão precisar validar geometria de canvas de novo**: este é
o caminho. Escrever um rasterizador Node.js standalone é mais rápido e mais
confiável do que tentar forçar screenshot no navegador do agente (ver 14.5).

### 14.4 Camada de instrumentação — os efeitos novos

Princípio: **um instrumento não brilha — ele REGISTRA, MEDE, VARRE e
ENERGIZA.** Só esses 4 verbos. Proibido: glow, halo, blur, gradiente
decorativo, sombra, bounce, qualquer coisa que se mova sozinha em repouso —
todo efeito é resposta a uma AÇÃO.

| Efeito | Onde | O quê |
|---|---|---|
| Malha viva | `.mesh`/`.apps` | célula acende a PRÓPRIA fresta com `--near` |
| Marcas de canto | `.card`/`.app` | 4 cantos em L fecham no hover — visor, não borda |
| Tick do índice | `.card__tag` | traço se estende até o número |
| Régua do laudo | `.diag__row` | régua com pontas percorre a divisória |
| Paquímetros | `h1 em`/`h2 em` | 2 traços verticais fecham sobre a palavra em destaque |
| Régua do kicker | `.kicker::after` | cresce da esquerda ao revelar a seção |
| Nível do botão | `.btn` | enche da esquerda, não acende |
| Corrente do fluxo | `.app__flow` | nós acendem em ordem, atraso escalonado |

**Bug real, achado só ao renderizar de propósito**: a primeira versão dos
paquímetros era um SUBLINHADO sob a palavra. Com `line-height: 1.08` num
título de 48px sobram ~3px até a linha seguinte — a régua cruzava
descendentes ("parada hu**m**ana") ou invadia a linha de baixo, e como
quase todo título aqui tem 2-3 linhas, isso acontecia sempre. Medir na
HORIZONTAL (2 traços verticais, não 1 linha embaixo) resolve — sobra espaço
lateral, nenhum descendente é atravessado. Achado com o MESMO truque do
rasterizador (14.3), estendido pra desenhar a camada de efeitos também.

**Outros 3 bugs achados só ao verificar, não ao escrever**: (1) `.btn:hover`
usava o shorthand `background:` — isso zerava o `background-image` do
preenchimento, então o nível do botão nunca apareceria; virou
`background-color` em toda variante de botão. (2) O SplitText do hero
(`mask:'lines'`) deixa um `<em>` VAZIO no `h1` durante a animação — sem
guarda, os paquímetros desenhariam dobrados, soltos, num ponto de largura
zero; toda regra de paquímetro tem `:not(:empty)`. (3) `--near` só era
escrito em `.card`, e `.apps > .app` não é `.card` — metade da regra da
malha viva era letra morta; `js/dom.js` passou a escrever em `.card, .app`.

### 14.5 Descoberta de ambiente — o rAF desta aba fica CONGELADO

**Isto é novo em relação à seção 13.5 e é importante**: além de a aba não
compor frames (já sabido), esta sessão provou que **`requestAnimationFrame`
para de disparar** quando a aba não está em foco/visível — medido com um
contador simples: 1 callback em 2 segundos de espera. Consequência prática:
`ScrollTrigger.update()`/`.refresh()` nunca avança sozinho aqui, e QUALQUER
`transition` CSS fica parada no valor inicial — testado até com uma
transição trivial (`opacity 400ms linear`) que também não avançou.

**Como isto invalida um jeito óbvio de testar**: ler `getComputedStyle` logo
depois de trocar uma classe vai devolver o valor DE PARTIDA de uma
transição, não o valor-alvo, e vai PARECER um bug que não é um. O caminho
que funciona: `element.style.transition = 'none'` antes de trocar o estado,
ler o valor (que agora resolve instantaneamente), depois desfazer. Ou,
melhor ainda pra geometria de canvas: nem tentar renderizar aqui — usar o
rasterizador Node.js standalone (14.3).

**Achado que também importa**: Chrome instalado no SISTEMA (fora do
navegador interativo do agente) roda em modo headless por linha de comando e
ESCREVE arquivo no disco via `--screenshot`:
```
chrome.exe --headless=new --window-size=1200,630 --screenshot=SAIDA.png
           --user-data-dir=<perfil temporário isolado> ALVO.html
```
Foi assim que a capa social (`assets/og-cover.jpg`) foi gerada e gravada
sem precisar de nenhuma ponte navegador→disco. **Cuidado real**: rodar
`chrome.exe` SEM `--user-data-dir` reaproveita a sessão do Chrome REAL do
dono, se ele tiver uma aberta — a primeira tentativa desta sessão fez
exatamente isso ("Abrindo em uma sessão de navegador existente"). Sempre
usar um `--user-data-dir` temporário isolado, e apagá-lo depois. Isto é
capacidade nova que a seção 13.5 não sabia que existia — pode valer pra
qualquer necessidade futura de gerar imagem/PDF a partir de HTML.

### 14.6 O que ficou pro olho do dono (nada disto foi visto renderizado)

- A malha acendendo ao aproximar o cursor das capacidades — é a aposta
  central da camada de efeitos.
- Os paquímetros fechando sobre a palavra em destaque quando o título entra.
- O núcleo — se a abertura hexagonal lê como mecanismo ou ainda como enfeite.
- O Singular — se a transição ciano→âmbar está de fato suave agora (era o
  pedido explícito que motivou os tokens `@property`).
- A capa social nova (`assets/og-cover.jpg`), ao compartilhar o link.

### 14.7 Ferramentas que ficaram no repo

- `docs/og-render.html` — alvo LIMPO (só o canvas 1200×630) pro Chrome
  headless fotografar. Se a composição da capa mudar, editar aqui e
  rodar o comando de 14.5 de novo.
- `docs/og-gerador.html` — mesma composição, com interface, pra gerar e
  baixar manualmente pelo navegador de verdade, sem linha de comando.
- Os dois ficam fora do deploy (`docs/` está no `.vercelignore`).

---

## 16. CAMADA DE ATMOSFERA (2026-08-21b) — LEIA JUNTO COM A 14

A seção 14 continua valendo por inteiro: a identidade visual, a paleta, o AI
Core e a camada de instrumentação não mudaram. Esta seção **acrescenta** uma
segunda camada por cima, pedida pelo dono num briefing de 27 itens ("adicionar
atmosfera, movimento, profundidade e magia, sem perder seriedade — e NÃO refaça
o design"). Dois commits: `7070470` (a camada) e `63d793c` (a revisão).

### 16.1 A tensão que precisou ser resolvida ANTES de escrever código

A regra vigente (14.4) diz **"nada anima sozinho em repouso — todo efeito é
resposta a uma ação"**. O pedido novo diz **"evite fundos completamente
estáticos"**. Não é contradição se a fronteira for a certa, e a fronteira
adotada é esta:

> **A ATMOSFERA respira. O CONTEÚDO não.**
> Campo, brumas, núcleo, profundidade e luz ambiente têm vida contínua no
> canvas. Texto, cards, réguas, paquímetros e estrutura continuam parados até
> serem provocados.

Isso preserva 14.4 onde ela importa (legibilidade e seriedade) e atende o
pedido onde ele importa (o fundo deixou de ser vazio). **Se uma sessão futura
for adicionar movimento, é desta linha que se decide de que lado a coisa
cai** — e a resposta padrão para qualquer coisa que envolva texto é "não".

### 16.2 A ESPINHA — arquitetura de estados (`js/core.js`)

O dono pediu explicitamente uma arquitetura de estados, não efeitos isolados.
Ela é **derivada**, não uma máquina paralela — nenhum temporizador novo,
nenhum subsistema novo (`?perf` segue em `["campo","eventos","medidor"]`):

```
S.wake    0..1   presença — cai sozinha após 32s de silêncio, volta em 60ms
S.focus   0..1   o cursor sobre algo que responde (js/dom.js publica)
S.sv      0..1   velocidade de rolagem, suavizada
S.sdy     px     rolagem do frame COM SINAL — é o que dá a paralaxe do campo
S.regime  dormant · active · focused · resonance · singularity
```

Prevalência: `singularity > resonance > dormant > focused > active`. **Dormant
vem ANTES de focused de propósito** — ver o bug 3 em 16.5.

`S.wake` multiplica a luminância da cena inteira num lugar só (`js/field.js`,
a linha do `lum`). É isso que faz DORMANT não ser um efeito à parte: é o mesmo
sistema operando 38% mais baixo. **Se você quiser que algo novo obedeça ao
regime, multiplique por `lum` — não escreva uma regra própria.**

Só `dormant` vira classe no `<body>` (`.is-dormant`). `focused` é usado, mas
dentro do canvas: quando o cursor pousa em algo, as brumas RECUAM até 40% para
o elemento apontado ganhar a atenção. No CSS ele não teria nada honesto a
mudar, e inventar regra só para "usar o estado" é como uma camada de efeitos
vira enfeite.

### 16.3 O que foi adicionado, e onde

| Efeito | Onde | O quê |
|---|---|---|
| Profundidade do campo | `field.js` | cada partícula tem `z`: tamanho, brilho, velocidade e resposta à rolagem |
| Gravidade do AI Core | `field.js` | tangencial 3× a radial — a poeira ORBITA, não cai |
| A COLUNA | `field.js` | a escala do documento na margem esquerda, com marca por seção |
| Leitura do cursor | `field.js` | duas marcas nas bordas dando a coordenada |
| Luz ambiente no cursor | `field.js` | quem acende é a poeira, não um foco |
| 2ª bruma | `field.js` | períodos incomensuráveis — movimento sem ritmo reconhecível |
| Grão | `styles.css` | `body::after`, estático, **custo zero por frame** |
| Ímã nos controles | `dom.js` | 4px em `translate` |
| Títulos por linha | `anima.js` | máscara SplitText nos `h2` de seção |
| Paralaxe cinemática | `anima.js` | 3 profundidades, `gsap.matchMedia`, off abaixo de 821px |
| RECONHECIMENTO | `dom.js` | passar por todas as 6 capacidades → o núcleo responde |

**Duas decisões que parecem omissões e não são:**
- **Não há holofote nem luz seguindo o cursor.** O dono já rejeitou luz redonda
  atrás de conteúdo uma vez (`fcb7d15`). A resposta do sistema à presença é a
  poeira ganhando densidade, não uma mancha. Não reintroduzir.
- **O ímã vai em `translate`, nunca em `transform`.** O GSAP dirige `transform`
  na entrada do hero; são canais separados que o navegador compõe. Trocar por
  `transform` faz os dois disputarem valor e a entrada do hero ganha.

### 16.4 O bug de acumulação — vale como padrão a procurar

A varredura do núcleo era `S.t * .006 * (1 + e*.5 + pulso)`: **velocidade
multiplicando tempo ACUMULADO**. Derivando, a taxa real é
`k·(1+p) + t·k·dp/dt` — o segundo termo cresce com o tempo de página. Medido
por simulação: o arco saltava até **1,086 radiano entre dois frames** quando o
Pulso subia aos poucos minutos de visita, e girava descontrolado. Acumular o
ângulo (`varr += velocidade · dt`) resolve na origem; o salto caiu para 0,018.

**Procure esse padrão em qualquer lugar.** `S.t * k * (fator variável)` está
errado sempre que o fator puder mudar. `rotA` tinha o mesmo problema latente e
foi convertido junto (`aber`).

### 16.5 Três bugs achados na revisão, não na escrita

1. **Ímã morto após rolar.** `getBoundingClientRect` de elemento `position:
   fixed` já vem em viewport, e o cache somava o scroll — o alvo virava um
   ponto de documento que andava com a página. O CTA da nav e o botão do
   medidor ficavam com o alvo centenas de px acima da tela. Agora controle
   fixo guarda viewport, o resto guarda documento.
2. **`.btn--primary` sem inércia.** Ele redeclara `transition` por inteiro e o
   valor mais específico SUBSTITUI a lista do `.btn` — **não há herança de
   itens entre transições**. Sem repetir `translate` ali, os três CTAs
   principais saltariam. Vale para qualquer property nova adicionada ao `.btn`.
3. **Regime incoerente.** `focused` era testado antes de `wake`: um cursor
   esquecido sobre um card mantinha o estado em "atenção" para sempre enquanto
   o canvas escurecia. Sem presença não há atenção.

### 16.6 O grão tem um teto MEDIDO — não mexa sem refazer a conta

A película clareia fundo e texto juntos, mas o fundo proporcionalmente mais:
ela come contraste. Pior caso (alfa cheio do ruído, cobertura efetiva 2,1%):

| par | antes | com grão |
|---|---|---|
| `--t1` no fundo | 17,44:1 | 16,83:1 |
| `--t2` no fundo | 7,32:1 | 7,16:1 |
| **`--t3` em `--s2`** | 4,73:1 | **4,65:1** |
| `--stroke` (controle) | 3,39:1 | 3,37:1 |

Todos passam AA, mas o par mais apertado tem **3% de margem** sobre o piso de
4,5:1. `opacity: .035` deixou de ser gosto e virou restrição.

### 16.7 Custo medido, e o que continua imensurável aqui

Censo de chamadas de desenho + tempo de JS, com o `field.js` real rodando
contra um contexto 2D falso em Node.js (o servidor local segue bloqueado no
sandbox e a aba do agente não compõe frames — 14.5 continua valendo):

| estado | chamadas | ms de JS/frame |
|---|---|---|
| repouso (antes) | 294 | 0,108 |
| **repouso (agora)** | **298** | **0,118** |
| Singular reinado (antes) | 439 | 0,158 |
| **Singular reinado (agora)** | **392** | **0,175** |

+9% em repouso, e o Singular ficou com **47 chamadas a menos** (o núcleo branco
por partícula passou a usar `z`, uniforme, em vez de `f`, enviesado). 0,12ms
contra um orçamento de 16,7ms.

**Rasterização de GPU continua imensurável aqui.** O medidor do dono é o juiz.

### 16.8 O que ficou pro olho do dono (nada disto foi visto rodando)

Em ordem de risco — o primeiro é o mais ousado e o primeiro a cortar:

1. **A COLUNA.** É o elemento novo mais visível e permanente. Deveria ler como
   a espinha de um desenho técnico; se ler como barra de rolagem enfeitada ou
   como sujeira na margem, corta (é um bloco só, `field.js`, seção 2a).
2. **O grão.** Se o medidor acusar queda no celular, é o segundo a cortar — é
   a única camada composta em tela cheia que entrou.
3. **O ímã.** 4px pode ser pouco (invisível) ou demais (botão solto).
4. **A leitura do cursor.** Risco oposto: sutil demais para alguém notar.
5. **DORMANT.** Só aparece depois de ~40s parado; testar deixando a página
   aberta sem tocar, e conferir se voltar a mexer devolve a vida na hora.
6. **O RECONHECIMENTO.** Passar o cursor pelas 6 capacidades e ver se o núcleo
   responde de forma perceptível.
7. **Os títulos por linha.** Seis seções com o mesmo gesto: confirmar se lê
   como sistema ou se cansa na terceira.

---

## 17. FLUXO NA LINHA DO TEMPO + PALAVRA VIVA DO HERO + ESTÁTICA (`d4a6469`)

Dois pedidos do dono, feitos por cima da camada de atmosfera (seção 16).

**Linha do tempo (`#processo`)**: antes, apontar o passo 03 acendia só ele —
01 e 02 ficavam inertes. Agora `:has()` olha à frente no documento ("existe um
passo depois de mim em `:hover`?") e cada nó/trilho ANTERIOR responde com o
MESMO peso que o passo 1 já usa em repouso. O passo efetivamente apontado
ganha tratamento mais forte que os que só foram atravessados: preenchido +
anel solto (0 de blur — é mira, não halo). Hardcoded pros 3 passos reais da
seção.

**A palavra viva do hero**: "aplicada" cicla por `calibrada, direcionada,
ajustada, voltada` — participios que fecham a frase ("Inteligência artificial
___ ao que o seu negócio perde hoje") sem forçar gramática. No Estado Singular
troca pra `implacável, decisiva, inevitável, imparável` — vocabulário mais
assertivo, pedido explícito do dono, **sem nenhuma palavra que evoque medo ou
ameaça** ("sem assustar ou ofender"). A TRANSIÇÃO reaproveita `morph()`, já
usada no status do hero: embaralha por glifos de sinal (binário/hex/símbolo)
até resolver na palavra nova — zero mecanismo novo.

Só começa a ciclar **5,2s depois de `'booted'`** (tempo de sobra pro SplitText
do título terminar/reverter), e busca o `<em>` só NESSE momento — não no load
do script — pra não apostar em como o revert do SplitText trata o nó original.
Cada troca emite `'remedir'` (novo evento): o comprimento da palavra pode
mudar a quebra do título e empurrar tudo abaixo do hero. `field.js` e `dom.js`
escutam e remedem os retângulos em cache **sem** resemear o campo de
partículas — resemear a cada 5-7s trocaria a poeira de lugar à toa.

**A marca de estática**: um flash de ruído branco (`feTurbulence` +
`feColorMatrix` pra alfa puro — não a mistura colorida que turbulence sozinho
produz) sobre um elemento, SEM mudar o conteúdo dele. Exposta em `B.estatica`
(definida em `js/dom.js`, usada também por `js/anima.js`). Aplicada em dois
pontos esparsos, ambos já ligados a eventos que o site já tinha: o kicker de
cada seção ao revelar (5×/visita, espalhado no scroll) e o wordmark da nav ao
trocar de regime (Singular liga/desliga). **Reduzida pra DUAS piscadas, não
três** — WCAG 2.3.1 marca mais de 3 flashes/segundo como risco de convulsão
fotossensível, e isso não é coberto por `reduced-motion` (que é preferência de
MOVIMENTO, não de FLASH); o limite vale independente da preferência do
visitante.

Verificado fora do navegador: máquina de estados da palavra simulada (200
trocas alternando normal/Singular) — zero string vazia, zero falha em
terminar na palavra-alvo, zero repetição da palavra anterior. Custo do canvas
sem mudança (0,12ms/frame — os eventos novos não rodam por frame).

Publicado em `a5989bf`, junto com a seção 18.

---

## 18. REMOÇÃO DA INTRO EM VÍDEO (2026-08-21c)

Pedido direto do dono: **"exclua o vídeo. Ele não se enquadra mais para
nossa identidade visual."** A intro de boot (`assets/intro.mp4`, o overlay
"sistema iniciando" que tocava antes do conteúdo aparecer) foi removida por
inteiro — não reencodada, não trocada por outra: **o site não usa vídeo em
lugar nenhum agora** (o logo em vídeo já tinha saído antes, seção 9).

### O que saiu
- `js/intro.js` (99 linhas) — deletado. Era o único dono de toda a lógica de
  overlay: reproduzir, checar rede fraca/`saveData`/`reduced-motion`, trava de
  playback aos 3s, skip, fallback de metadata.
- `assets/intro.mp4` (4,2 MB) — `git rm`, sai do deploy e do repositório daqui
  pra frente (continua nos commits antigos — ver a nota de histórico do git,
  seção 9).
- `index.html`: o `<div class="intro" id="intro">` com o `<video>` e o botão
  de skip; a regra `.intro { display:none }` do `<noscript>` (não fazia mais
  sentido sem o elemento); o `<script src="js/intro.js">`.
- `styles.css`: o bloco inteiro `.intro`/`.intro--done`/`.intro__video`/
  `.intro__skip`/`body.intro-active` (~28 linhas).

### O PROBLEMA REAL que isso cria, e como foi resolvido
`js/intro.js` não era só o vídeo — era quem **emitia o sinal `'booted'`** que
literalmente TUDO no site espera: a entrada do hero (`js/anima.js`), a linha
de entrada em seção (`js/entrada.js`), o fallback de reveals (`js/dom.js`), e
agora também a palavra viva do hero (seção 17). Remover o arquivo sem
substituir essa responsabilidade quebraria o boot do site inteiro — nada
apareceria, silenciosamente, porque `'booted'` nunca sairia.

**A substituição foi pra `js/core.js`**, que agora escuta `'DOMContentLoaded'`
e só então adiciona `.booted` + `emit('booted')`.

**Um bug real foi pego e corrigido ANTES de publicar** — vale registrar
porque é o tipo de erro fácil de repetir: a primeira versão testava
`if (document.readyState === 'loading') espera DOMContentLoaded; else boot()
na hora`. Parecia defensivo. Na prática, **scripts com `defer` só executam
DEPOIS que o parse termina** — `readyState` nesse ponto já é `'interactive'`,
NUNCA `'loading'` — então o `else boot()` disparava IMEDIATAMENTE, dentro da
própria execução de `core.js`, antes de `field.js`/`dom.js`/`entrada.js`/
`anima.js` sequer carregarem e registrarem `B.on('booted', …)`. Como o
barramento de eventos deste projeto (`emit`/`on`, também em `core.js`) não
guarda histórico — só alcança quem já está ouvindo no instante da chamada —
isso faria TODO listener de `'booted'` carregado depois perder o evento **pra
sempre**: hero nunca entraria, linha de entrada nunca dispararia. Achado
simulando a ordem real de carregamento em Node.js (fora do navegador, mesmo
método da seção 14.3) antes de escrever qualquer coisa no disco. Corrigido
removendo o atalho: `core.js` agora SEMPRE espera `'DOMContentLoaded'`, sem
condicional — que é o único ponto em que o navegador garante que todo script
`defer` já rodou.

### Assets
`assets/README.txt` atualizado: a entrada de `intro.mp4` saiu, e a de
`og-cover.jpg` foi CORRIGIDA — ela já não vinha mais de frame de vídeo desde
a sessão anterior (14.5/14.7, capa gerada por `docs/og-render.html` + Chrome
headless), mas o README ainda descrevia o método antigo (`ffmpeg` a partir de
`introdução.mp4`). Achado ao editar o arquivo por outro motivo — corrigido
junto.

`assets/introdução.mp4` (o master de 30 MB, gitignorado, nunca serviu o
visitante) **não foi apagado do disco**: é arquivo local, fora do
repositório, e apagar mais do que o pedido explícito não é decisão do agente.
Perdeu todo downstream (nem `intro.mp4` nem `og-cover.jpg` vêm mais dele) —
está documentado como órfão no README; apagar manualmente é seguro se o dono
quiser.

### Verificado
`node --check` nos 5 arquivos JS restantes (intro.js saiu da lista), balanço
de chaves do CSS, varredura de classes órfãs (zero novas), e a simulação da
ordem de boot em Node.js confirmando os 4 listeners de `'booted'` (dom.js×2,
entrada.js, anima.js) disparando corretamente. **Não visto rodando no
navegador** — mesma ressalva de sempre (13.5/14.5): o feel da entrada sem
vídeo (site aparece direto, sem tela preta) precisa do olho do dono.

### Ainda pendente desta remoção
- `assets/introdução.mp4` órfão no disco — decisão do dono, ver acima.
- Nada mais depende do vídeo removido; a arquitetura de boot está mais simples
  do que antes (um listener a menos, uma responsabilidade a menos).

---

## 19. CONSERTOS + FLUXO/AURA NA LINHA DO MÉTODO (2026-08-22) — `a7b48ac`

Quatro pedidos do dono numa sessão. Detalhe completo no corpo do commit
`a7b48ac`; o essencial:

**1. A palavra do hero não mudava — bug real, dois motivos combinados.**
- `querySelector('.hero__title em')` pegava o `<em>` VAZIO que o SplitText
  `mask:'lines'` deixa ao lado do `<em>aplicada</em>`. A troca escrevia num
  elemento de largura zero. **Agora captura o em NÃO-VAZIO** (filtra vazios).
- O gatilho era `setTimeout(booted+5200)` (palpite). **Agora anima.js emite
  `'hero-pronto'` após o revert do SplitText** e a palavra viva espera esse
  sinal; fallback em `booted+5s` pro caminho sem GSAP.
- Verificado carregando o `js/dom.js` REAL num harness Node (DOM/eventos
  falsos, loop avançado à mão) — **este é o jeito de testar lógica de loop
  neste ambiente**: o rAF morre em ~800ms no Chrome headless (`document.hidden`
  vira true), então screenshot não valida nada que dependa do loop rodar.

**2. "Contorno branco bugado" ao descer = a estática.** `inset:-6px` desenhava
o ruído 6px ALÉM do kicker (retângulo solto), e `steps(1,end)` sobre keyframes
0/50/100 travava em vez de piscar. Agora: `inset:0` + `width:12ch` (contido
sobre o rótulo, longe da régua flex) + keyframe de opacidades EXPLÍCITO (dois
pulsos, pico .4, sem `steps()`). Ruído só no kicker e no wordmark — no hero e
no CTA o `morph()` já É a estática (a palavra vira glifos de sinal).

**3. Palavra viva também no CTA** ("não pela _tecnologia_" →
ferramenta/moda/tendência; Singular: pressa/promessa). Um ciclador
reutilizável por elemento, estado isolado por closure.

**4. A linha do método:**
- **Fluxo de energia** na linha (CSS): pulso de luz correndo no sentido da
  leitura (`background-position` animado, 1px). A cadeia `:has()` agora sobe a
  INTENSIDADE via `opacity` (trocar `background` apagaria o fluxo).
- **Aura nos nós, não glow redondo** (canvas, `field.js` mede `.steps .step`):
  8 raios emanando com comprimento oscilando FORA DE FASE (as pontas nunca
  fecham um círculo — leem como faíscas, não anel) + arco de varredura girando,
  no vocabulário do AI Core. Viva em repouso, mais forte com o cursor perto.

Custo: repouso 298→361 chamadas (a aura dos 3 nós), 0,157ms/frame (~1% do
orçamento), culled fora da seção método. reduced-motion: fluxo para, aura some
com o canvas.

**Nota de método pra próxima sessão**: o Chrome do SISTEMA headless roda o site
de verdade (a aba do agente não). Truque pra manter o loop rAF vivo no
headless: injetar `Object.defineProperty(document,'hidden',{get:()=>false})` +
`setInterval(()=>BEYON.iniciar(), 50)`. E a CSP `script-src 'self'` bloqueia
`file://` — copiar o HTML removendo a meta CSP pra testar local.

---

## 20. RODADA DE AJUSTES (2026-08-22b) — palavra, auras, AI Core, aplicações

Sequência de pedidos do dono, todos publicados em `62981be`, `3c95d69`,
`aae82df`.

**Palavra viva (dois bugs + novo comportamento).**
- "Não muda": a primeira troca caía ~10-12s após o load — quem rolava até o CTA
  (fim da página) olhava, não via troca e concluía que não mudava. E a captura
  pegava o `<em>` VAZIO do SplitText mask. Corrigido: captura o em não-vazio,
  primeira troca ~2,6s, ciclo ~3-4,8s, e gatilhos MÚLTIPLOS idempotentes
  (`hero-pronto` + `entrada-pronta` + booted+3s — `entrada-pronta` SEMPRE emite).
- Comportamento pedido: ordem ALEATÓRIA sem repetição (saco embaralhado /
  shuffle bag) — uma palavra só volta depois que todas apareceram, e nunca
  repete na emenda entre um ciclo e o outro. Vale pro hero e pro CTA.
- CTA cicla também agora (tecnologia/ferramenta/moda/tendência; Singular:
  pressa/promessa/ferramenta da vez).

**Paquímetros REMOVIDOS** (as duas barras verticais ao lado da palavra em
destaque, em todos os títulos). A ênfase vem só da cor do `em` e do morph.

**Estática REMOVIDA por inteiro** (CSS, keyframe, `B.estatica`, todas as
chamadas). O flash de ruído branco no kicker ao revelar lia como "contorno
branco bugado ao descer" — reclamado duas vezes. A transição de sinal que
sobra é o morph da própria palavra.

**Aura dos nós do método → SISTEMA ORBITAL.** A versão de raios ainda lia como
"luz redonda genérica". Trocada por partículas de energia girando em volta de
cada nó (matéria em movimento, órbitas inclinadas cruzando, internas mais
rápidas com rastro). Saiu também o `box-shadow: 0 0 0 3px` do hover (era o glow
apontado). `field.js`, mede `.steps .step`.

**Mini AI Core — fluxo de energia sem fim.** Os elos (núcleo→cards) eram curvas
que só acendiam com proximidade ("sem vida"). Agora partículas correm pela
curva Bézier SEMPRE (vida contínua) e intensificam quando o card é o alvo do
cursor. Elo base subiu de alpha .06 → .12.

**Seção Aplicações — respiro + passagem suave.** Mais padding/gap/título,
marco final destacado (bolinha maior + anel de registro nítido). A cascata do
fluxo ficou LENTA: 720ms por marco, atrasos 0/320/640ms (era 340ms + 0/100/200)
— ~1,4s pra ler a passagem de estado, "devagar e suave" como pedido.

**Nota de teste** (repete 19, importante): o loop rAF morre em ~800ms no Chrome
headless (`document.hidden`), então screenshot NÃO valida nada que dependa do
loop rodar (palavra, órbitas, fluxo). Truque pra manter vivo: injetar
`Object.defineProperty(document,'hidden',{get:()=>false})` +
`setInterval(()=>BEYON.iniciar(),50)`. Para lógica pura (a palavra), o caminho
confiável é carregar o `dom.js` real num harness Node com DOM/eventos falsos e
avançar o loop à mão (está em scratchpad `pw_harness.js` na sessão).

---

## 15. ENTRADA PARA A PRÓXIMA SESSÃO — leia isto primeiro

Fechamento limpo: tudo publicado, árvore limpa, nada pendente de decisão
técnica. A seção 14 é o histórico detalhado de COMO se chegou aqui (leia se
precisar do porquê de uma decisão específica); esta seção é o atalho.

### 15.1 Estado agora

```
main = rebuild = origin/main = 1f9e93c
```

Publicado (o dono pediu). A camada de atmosfera (seção 16) está no ar; falta
só o veredito visual dele — ver 16.8 pra ordem de risco.

Fluxo de publicação (usado 3 vezes nesta sessão, sempre igual):
```
git checkout main && git merge rebuild --ff-only && git push origin main && git checkout rebuild && git push origin rebuild
```
O dono pede publicação de forma direta ("publica", "sim") — não precisa
confirmar de novo se o pedido já veio assim. Antes de publicar: registrar o
commit que está no ar (`git log --oneline origin/main -1`) como alvo de
rollback, e confirmar fast-forward limpo (`git log --oneline rebuild..origin/main`
tem que vir vazio) antes do merge.

### 15.2 O que esta sessão fez, em ordem

Pedido do dono, verbatim: reformular o site inteiro — "não tenha apego ao
código atual", depois "adicione efeitos, mas considere os antigos como
contra-exemplo", depois "analise tudo de novo e lapide — design, copy,
otimização". Cinco commits:

1. `88017ec` **Reformulação visual completa.** Nova direção ("instrumento de
   precisão"), nova paleta (5 neutros + 1 cor de ação), hero reconstruído
   assimétrico, `.diag`/`.mesh` substituindo os cards antigos. Ver 14.1.
2. `dd7699e` **AI Core reconstruído.** De orbe (9 elementos redondos, 7
   rotações) pra abertura de lâminas (6 elementos, 1 rotação). Validado com
   rasterizador Node.js standalone, não no navegador. Ver 14.3.
3. `e5859e6` **Camada de instrumentação.** 8 efeitos novos, 4 verbos só
   (registrar/medir/varrer/energizar). Ver 14.4.
4. `1ff4ec9` **Varredura de lapidação.** Achado grande: `vivaChars()`
   (tipografia-por-glifo) rodava produzindo ~260 nós de DOM mortos — a folha
   de estilo tinha perdido as regras dela na reescrita e ninguém tinha
   notado. Página caiu de 542 pra 282 elementos. Mais: `<br>` de título
   quebrando errado no celular, copy ("orbita" não fazia mais sentido sem o
   orbe), favicon com a marca antiga ("beyon.0") na paleta antiga. Ver 14.2/14.4.
5. `80ca91d` **Capa social atualizada.** `og-cover.jpg` era do PRIMEIRO
   commit do projeto (vórtice ciano antigo). Resolvido com Chrome do sistema
   em modo headless — ver 14.5 pro comando exato e o cuidado com
   `--user-data-dir`.

Verificação em TODAS as etapas foi estrutural (medição, script, rasterizador
Node.js) — nunca visual direta. Ver 14.6 pra lista do que só o olho do dono
fecha.

### 15.3 O Playbook Comercial — continua fora deste repositório

Sem mudança desde a seção 13.3: `C:\Vault - Fernando\Beyon 0 - Playbook Comercial\`,
pasta irmã, fora do git e do deploy. Se o dono pedir mudança nele, é arquivo
diferente — não confundir com o site. **Atenção**: o playbook herda a
identidade visual do site (mesmos tokens de cor, mesmas fontes) — se ele for
tocado numa sessão futura, os tokens antigos (`--glow`/`--gold` etc.) que ele
copiou não existem mais neste projeto. Conferir contra a seção 14.1 antes de
reusar qualquer valor.

### 15.4 Decisões em aberto

| Decisão | Estado |
|---|---|
| Tudo em 16.8 — coluna, grão, ímã, leitura do cursor, dormência, reconhecimento | Publicado, aguarda o olho do dono |
| Tudo em 14.6 — malha, paquímetros, núcleo, transição do Singular, capa nova | Publicado, ainda sem veredito visual do dono |
| Site como 1 card entre 6, ou volta a ser central? | Ainda sem resposta (13.4, nunca resolvida) |
| Domínio `beyon0-site.vercel.app` vs nome real | Não mudou, decisão separada |
| ~~`intro.mp4` 4,4 MB (reencodar ou só 1ª visita)~~ | **RESOLVIDA em 2026-08-21c — removida por inteiro, não reencodada.** Ver seção 18 |
| `feat/ai-core-3d` (reator 3D, Three.js, 66 testes) | Pausada, intocada — e agora desalinhada da identidade nova, se for retomada precisa revisão visual primeiro |
| Analytics/conversão | Site não mede nada ainda |

### 15.5 Armadilhas — ver 13.5 + 14.5 juntas

13.5 continua valendo por inteiro (aba não compõe frames, `file://` fora da
pasta abre estático, custom property aninhada resolve na declaração). 14.5
adiciona o achado desta sessão: **o rAF desta aba fica congelado** (para de
disparar sem foco), então nenhuma `transition`/`animation` avança sozinha
aqui — zerar a transição antes de ler valor, ou usar o rasterizador Node.js
standalone pra qualquer coisa visual que precise de confiança alta. E:
Chrome do SISTEMA em modo headless escreve arquivo no disco direto, sem
ponte nenhuma — útil pra qualquer geração de imagem/PDF futura, com o
cuidado de sempre isolar `--user-data-dir`.

### 15.6 Como o dono trabalha — sem mudança, ver 13.6

---

## 22. CRO + SEO do nicho + resumo pra diretoria (2026-09-13c)

Ver o resumo no topo do arquivo. Detalhe técnico que fica só aqui:

### Domínio-pronto — os 10 lugares onde `beyon0-site.vercel.app` aparece
Sem build/templating (projeto não tem), então trocar de domínio é
find-and-replace manual. Lista completa pra quando o domínio for
registrado:

```
index.html:12   <link rel="canonical">
index.html:13   og:url
index.html:19   og:image
index.html:27   twitter:image
index.html:53   JSON-LD ProfessionalService "url"
index.html:54   JSON-LD ProfessionalService "image"
resumo.html:8   <link rel="canonical">
sitemap.xml:4   <loc> da home
sitemap.xml:9   <loc> do /resumo.html
robots.txt:4    linha "Sitemap:"
```

### `js/tel.js` — novo, carregado antes de `js/core.js`
`window.BEYON_TEL = '5521977167944'`. `js/dom.js` lê de lá (com fallback
pro valor literal se por algum motivo não carregar — nunca trava).
`resumo.html` carrega só `js/tel.js` + `js/resumo.js` (não o `core.js`/
`field.js`/`dom.js` inteiros, que esperam o canvas `#fx` e o DOM do site
completo). Trocar o número: só em `js/tel.js`.

### `resumo.css` — tokens duplicados de propósito, não importados
Copiei os valores de cor/fonte do `:root` de `styles.css` pra dentro de
`resumo.css` em vez de carregar o `styles.css` inteiro (~1500 linhas de
efeito/animação que essa página não usa). Se a paleta mudar no site
principal, revisar os dois arquivos.

---

## 23. Copy alinhada ao nicho + fee-only declarado no CTA final (2026-09-13d, commit `e2d9836`, NÃO PUBLICADO)

Pedido do dono: melhorar espaçamento do painel de CTA final e aplicar
copy com base científica de conversão. Base usada: o próprio
`briefing-estrategico-validado.md` (raiz do projeto `beyon 0`, pasta
irmã) — não pesquisa nova, o documento já tinha o achado certo parado
sem uso no site.

- **"Diagnóstico antes de tecnologia" não diferencia mais** (seção 3.1
  do briefing: 10+ concorrentes já dizem a mesma frase). O H2 do CTA
  final trocou de "não pela tecnologia" pra "não pelo que alguém quer
  vender" — ataca a objeção de verdade.
- **Objeção nº1 de compra do nicho é ROI incerto/desconfiança de número
  inflado por quem vende a própria ferramenta** (34%, seção 2.3). O
  parágrafo do CTA final agora declara o modelo **fee-only** (preço
  fixo, sem comissão de fornecedor — decisão de negócio já tomada na
  seção 16 do briefing, nunca antes publicada no site). Novo item de
  FAQ (`index.html`, accordion + JSON-LD, texto idêntico nos dois)
  confirma o mesmo ponto por outra via. **Nenhum número/case
  inventado** — só o que já é decisão real do negócio.
- **"negócio"/"empresa"/"cliente" → "organização"/"associado"** no hero
  e na seção `#dores`: o `<title>`, a meta description, o JSON-LD e o
  `resumo.html` já falam a língua do nicho (associação/sindicato/
  federação); hero e dores ainda falavam genérico. Mensagem consistente
  = reconhecimento mais rápido de "isso é pra mim" (voice-of-customer).
- **Espaçamento do `.cta`**: padding vertical do painel subiu (`clamp(3rem,7vw,5.5rem)`
  → `clamp(3.5rem,8vw,6.5rem)`), e a separação entre o reforço de
  confiança ("Quem responde é humano") e o link secundário pro resumo
  aumentou (`1.4rem`→`1.6rem` e `2.2rem`→`2.8rem`) — hierarquia mais
  clara entre CTA primário e caminho alternativo.

**Não verificado ao vivo** — mesma limitação de sempre (seção 7): o
agente não alcança servidor próprio neste ambiente (`npx`/`npm` falham
na spawn porque o Node está instalado em `C:\Program Files\nodejs`,
caminho com espaço — erro `'C:\Program' não é reconhecido`, ambiente
Windows deste agente, não do projeto) e `file://` é bloqueado pelas
próprias tools do navegador do agente aqui. Layout/CSS não foram vistos
rodando; só lidos e raciocinados. **Pedir pro dono conferir no
navegador antes de publicar** — mesmo protocolo de sempre desta sessão.
