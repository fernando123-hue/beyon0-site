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
| `npm run verificar` | 7 alvos (3 páginas × desktop/celular + resumo): boot, conteúdo preso invisível, rolagem lateral, links de WhatsApp, erros de console, fps |
| `npm run acessibilidade` | sem JS, movimento reduzido, teclado (foco visível, menu do celular) |
| `npm run olhar -- <pasta>` | screenshots em 5 pontos de rolagem, desktop e celular — abra os PNG e OLHE |
| `npm run medir -- <rótulo>` | bytes, nós, LCP, CLS, fps parado/rolando, ms de script/estilo/layout por 6s |

O primeiro carregamento de cada execução no headless é lento (processo de GPU
subindo); ignore a primeira medição de DCL/LCP.

## Onde está o contexto

| Arquivo | O que é |
|---|---|
| `docs/restructure/DIRECAO-V2.md` | **Comece aqui.** A direção da reconstrução de 2026-10-01: diagnóstico medido, a ideia, o vocabulário de movimento, a arquitetura, o que NÃO entra e por quê. |
| `docs/restructure/PLANO-REESTRUTURACAO.md` | Seção 13 = estado da V2 e pendências. Seções 11–12 = história da reestruturação anterior (Hub + páginas). |
| `docs/HANDOFF.md` | História longa do projeto e as leis de performance (seções 3 e 4). Identidade/arquitetura das seções 5–6 e 14–16 estão SUPERADAS pela V2. |
| `docs/auditoria-performance.md` | As medições que justificam a arquitetura. |

## Arquitetura (V2)

```
css/tokens.css · base.css · componentes.css · motion.css
js/ancoras.js (head: html.js + âncoras antigas) · tel.js · core.js (loop, estado S)
js/organismo.js (Pulso, Singular) · campo.js (canvas: núcleo viajante, régua, retículo)
js/profundidade.js (planos projetados, canvas 2D) · pagina.js (nav, WA, prova, régua)
js/anima.js (GSAP: boot do hero, entradas, scrub) · palavras.js · lead-form.js
```

## Regras que não se negociam

1. **Nenhuma variável de CSS muda por frame.** Movimento contínuo vive no
   canvas. Um rAF só, via `B.add`. O GSAP tweena números em `B.S` quando o
   canvas precisa acompanhar — nunca custom properties.
2. **Zero invenção de dado.** Nada de "+300 projetos" ou "98% de satisfação".
   Se o número não foi medido ou confirmado pelo dono, ele não existe.
3. **A marca é Beyon Zero.** Não `beyon.0`, não `Beyond`, não `MYKER`.
4. **A profundidade é acréscimo, nunca substituição.** Tudo que o canvas
   enfeita existe em CSS por baixo e aparece inteiro sem JS, sem GSAP e em
   `prefers-reduced-motion`. O contrato `html.js`/`has-gsap` tem rede de
   segurança em `js/pagina.js`; `npm run acessibilidade` confere.
5. **Medir, não deduzir.** A/B na mesma sessão. O projeto já piorou o site três
   vezes otimizando por palpite.
6. **Não publicar sem o dono pedir.** Push na `main` é deploy.
7. **CSP sem inline.** `style-src 'self'`: nenhum `style=""` no HTML, nenhum
   `<style>`; só classes. `el.style.x` via JS continua permitido.
8. **Mono só onde há dado** (índice, medida, coordenada). Copy e controles em Sora.

## Como o dono trabalha

Português, direto. Valoriza bug apontado sem ser perguntado e decisão de
não-fazer justificada. Commits em português, explicando o PORQUÊ.
