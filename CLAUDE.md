# Beyon Zero — instruções para o agente

## Revisar é parte de terminar, não um extra

**Rode o revisor de código antes de considerar qualquer trabalho pronto** — de
forma casual e frequente, não só em entrega grande. O que ele deve olhar:
estrutura, organização, otimização e se o código faz sentido.

```
/code-review
```

Vale para: código novo, refatoração, e qualquer lote que tenha crescido durante
a conversa. Se a revisão apontar algo, corrija antes de dizer que acabou.

## Ver o site rodando antes de dizer que está pronto

Na máquina do dono (Windows), fora do sandbox do agente:

```bash
node docs/servidor.mjs . 8899
BASE=http://127.0.0.1:8899 CHROMIUM="$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe" npm run verificar
```

| Script | O que faz |
|---|---|
| `npm run verificar` | 10 alvos (3 páginas × desktop/celular/320px + resumo + interruptor de movimento no boot): boot, conteúdo preso invisível, rolagem lateral, links de WhatsApp, erros de console, fps, LCP |
| `npm run acessibilidade` | sem JS, movimento reduzido, teclado (foco visível, menu do celular) |
| `npm run olhar -- <pasta>` | screenshots em 5 pontos de rolagem, desktop e celular — abra os PNG e OLHE |
| `npm run medir -- <rótulo>` | bytes, nós, LCP, CLS, fps parado/rolando, ms de script/estilo/layout por 6s |
| `node docs/fps.mjs 1440,900,390` | fps e rolagem lateral por largura, rápido; para A/B por camada |

O primeiro carregamento de cada execução no headless é lento (processo de GPU
subindo); ignore a primeira medição de DCL/LCP.

## Onde está o contexto

| Arquivo | O que é |
|---|---|
| `docs/restructure/DIRECAO-V4.md` | **Comece aqui.** A direção da V4 "Tech refinado" (2026-10-01): a identidade da V1 (escuro, ciano, Sora + Mono, régua de 1px) com luz; celular primeiro. |
| `docs/restructure/PLANO-AI-CORE.md` | **O AI Core** (2026-10-02): o reator em three.js no hero do Hub (v2, seção 11: simetria de 12 tempos, energia correndo para o núcleo; a v1, esfera de vidro da imagem do dono, foi vista como "emaranhado de fios"); medidas, rodadas da crítica e a proposta de motion. |
| `docs/restructure/DIRECAO-V3.md` | A V3 clara ("Luz e vida"), rejeitada pelo dono no mesmo dia. Vale pela regra de celular primeiro. |
| `docs/restructure/DIRECAO-V2.md` | A V2 escura ("o instrumento acorda"), chamada de "mórbida" pelo dono. Vale pelo diagnóstico medido e pelo vocabulário de movimento. |
| `docs/restructure/PLANO-REESTRUTURACAO.md` | **Seção 16 = o loop de auto-aprimoramento com painel de agentes (rodadas feitas, próximo passo).** Seção 15 = V4. Seção 14 = V3. Seção 13 = V2. Seções 11–12 = história anterior. |
| `docs/workflows/critica-premio.js` | O painel de críticos (júri, tipografia, motion, celular + síntese). Roda pela ferramenta Workflow com `args: { rodada, pasta }`. |
| `docs/HANDOFF.md` | História longa do projeto e as leis de performance (seções 3 e 4). Identidade/arquitetura das seções 5–6 e 14–16 estão SUPERADAS pela V2. |
| `docs/auditoria-performance.md` | As medições que justificam a arquitetura. |

## Arquitetura (V4)

```
css/tokens.css (paleta, fontes, atmosfera) · base.css (tipo, nav, botões, hero, trilha, feixe, barra do celular, rodapé)
css/componentes.css (painel, serviços, passos, laudo, prova, malha, cenários, FAQ, conversa, spec, planos, janela, instrumento, modal)
css/motion.css (estados iniciais html.js, varredura do painel, régua do kicker, reduced-motion)
js/ancoras.js (head: html.js + âncoras antigas) · tel.js · core.js (loop, estado S, fps, reduzir, B.num pt-BR)
js/pagina.js (nav, menu, WA, seção atual, barra do celular, medidas: carga, peso, fps, FCP, cascata, log do console, interruptor)
js/anima.js (GSAP: boot do hero, cota, rota, palco da prova, fecho, entradas por seção, pilha do celular, pouso em âncora) · lead-form.js (só automação)
js/nucleo/ (AI Core, só no Hub): boot.js (clássico: porteiro, import() depois do load, laço via B.add) · cena.js · pecas.js (emissor + shader do vidro) · spec.js (a esfera em dados) · lab.js (laboratório, fora do deploy)
vendor/three/three-nucleo.min.js (three r160 reduzido às classes da esfera; receita em vendor/three/README.md)
```

**O AI Core** (PLANO-AI-CORE.md) é o único canvas do site: monta por cima
de um desenho em CSS que reserva o lugar (sem CLS) e fica sozinho sem JS,
sem GPU (o WebGL é testado ANTES de baixar o three) ou com economia de
dados. Movimento reduzido: um quadro, parado e aceso. Degrada medindo
(pixel ratio 1, depois sai) pela cadência do próprio aparelho. Para VER a
esfera nos screenshots: `GPU=1 npm run olhar` (sem GPU o headless é
SwiftShader e o porteiro barra). O verificador tem `hub-3d`/`hub-3d-cel`
(`?3d=forcar`); `?3d=nao` desliga para A/B. Laboratório lado a lado com a
referência: `docs/lab-nucleo.html`. Os módulos de canvas antigos
(`campo.js`, `profundidade.js`, `organismo.js`, `palavras.js`) estão no
histórico, commit `051b2a8`; o AI Core original (orbe) em `abd83fe` (V1).

## A assinatura (o que sobreviveu a 8 rodadas do painel)

Um gesto só, "a luz passa e imprime", em quatro atos. Mexer neles exige
reler `docs/restructure/PLANO-REESTRUTURACAO.md` §16 (os achados medidos).

1. **Boot do hero** (`heroEntra` em `js/anima.js`): o fio de 1px atravessa
   e cada peça acende no instante em que a luz passa por ela (`tFeixe` no
   desktop, `tEm` no celular, onde a luz desce e LÊ o título em três
   trechos). Palavras do H1 com "tinta molhada" (ciano por um instante,
   secam para o branco). A **cota** do H1 é desenhada pela luz com a 1ª
   pintura real (FCP). O h1 fica dividido em palavras: **nunca `revert`
   no h1** (o Chrome re-registra o LCP: 0,9 → 2,5 s). O parágrafo do hero é
   o LCP: entra no máximo em 0,3 s.
2. **A rota** dos passos (`rota()`): traço que nasce embaraçado e se
   desenha pela rolagem até um LED "no ar". Frações por trecho, nunca
   amostrando `getPointAtLength` (tarefa longa de 400 ms).
3. **O palco da prova** (`palco()`, desktop): pin + scrub + snap; UMA
   função (`pintar(t)`) pinta as três máscaras a partir do tempo da
   timeline; largura medida por `offsetWidth` (o `scrollWidth` soma o
   deslocamento por transform e crescia a cada refresh); no refresh mede
   de novo e repinta. No celular cada medida acende e conta ao aparecer.
4. **O fecho** (`fechamento()`): a luz atravessa a Conversa, a palavra
   enfatizada fica ciano e a luz pousa no botão como mira (quatro cantos).

Regras que vieram daí: medir largura de LAYOUT de quem se move por
transform; nada de `to` com partida implícita em timeline com
`invalidateOnRefresh`; o desktop com movimento nasce sem `scroll-behavior:
smooth` (o snap rastejava; o ScrollTrigger religa o smooth inline a cada
refresh); âncoras usam só `scroll-padding-top`.

## Regras que não se negociam

1. **Nenhuma variável de CSS muda por frame.** Movimento contínuo (feixe,
   planos, LED) é `@keyframes` só de transform/opacity, no compositor. Um
   rAF só, via `B.add` (hoje só o medidor de fps).
2. **Zero invenção de dado.** Nada de "+300 projetos" ou "98% de satisfação".
   Se o número não foi medido ou confirmado pelo dono, ele não existe.
3. **A marca é Beyon Zero.** Não `beyon.0`, não `Beyond`, não `MYKER`.
4. **O movimento é acréscimo, nunca substituição.** Tudo aparece inteiro
   sem JS, sem GSAP e em `prefers-reduced-motion` (loops de CSS desligados). O contrato `html.js`/`has-gsap` tem rede de
   segurança em `js/pagina.js`; `npm run acessibilidade` confere.
5. **Medir, não deduzir.** A/B na mesma sessão. O projeto já piorou o site três
   vezes otimizando por palpite.
6. **Não publicar sem o dono pedir.** Push na `main` é deploy.
7. **CSP sem inline.** `style-src 'self'`: nenhum `style=""` no HTML, nenhum
   `<style>`; só classes. `el.style.x` via JS continua permitido.
8. **Mono só onde há rótulo, índice, dado ou controle.** Copy em Sora; títulos em Sora 300.
   **Ciano em texto só no H1, no h2 da Conversa e em dado** (rodada 3: a
   ênfase em todo h2 tinha virado tique). Os outros h2 são Sora 300 inteiros.
9. **Celular primeiro.** Cada página nasce em 390px e cresce. Conferir os
   screenshots `*-cel` e `*-320` ANTES do desktop; regressão no celular bloqueia.
10. **Nenhuma caixa mais larga que a viewport no celular.** O Chrome alarga a
   viewport inteira (medido: 390 → 469px) e a barra fixa some. Nada de
   `left/right` negativos ou `vw` > 100 em caixas em fluxo.

## Como o dono trabalha

Português, direto. Valoriza bug apontado sem ser perguntado e decisão de
não-fazer justificada. Commits em português, explicando o PORQUÊ.
