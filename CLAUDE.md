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
| `docs/restructure/DIRECAO-V4.md` | **Comece aqui.** A direção da V4 "Tech refinado" (2026-10-01): a identidade da V1 (escuro, ciano, Sora + Mono, régua de 1px) com luz; celular primeiro; AI Core reservado para uma fase futura. |
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
js/ancoras.js (head: html.js + âncoras antigas) · tel.js · core.js (loop, estado S, fps, reduzir)
js/pagina.js (nav, WA, seção atual, barra do celular, prova, interruptor)
js/anima.js (GSAP: boot do hero por linhas, entradas por seção) · lead-form.js (só automação)
```

Sem canvas nesta fase: o AI Core e os pulsos voltam numa fase seguinte,
repensados para fundo claro (quando o dono pedir). Os módulos antigos
(`campo.js`, `profundidade.js`, `organismo.js`, `palavras.js`) estão no
histórico, commit `051b2a8`; o AI Core original (orbe) em `abd83fe` (V1).

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
8. **Mono só onde há rótulo, índice, dado ou controle.** Copy em Sora; títulos em Sora 300; ênfase em ciano 500.
9. **Celular primeiro.** Cada página nasce em 390px e cresce. Conferir os
   screenshots `*-cel` e `*-320` ANTES do desktop; regressão no celular bloqueia.
10. **Nenhuma caixa mais larga que a viewport no celular.** O Chrome alarga a
   viewport inteira (medido: 390 → 469px) e a barra fixa some. Nada de
   `left/right` negativos ou `vw` > 100 em caixas em fluxo.

## Como o dono trabalha

Português, direto. Valoriza bug apontado sem ser perguntado e decisão de
não-fazer justificada. Commits em português, explicando o PORQUÊ.
