# beyon.0 — Relatório de Entrega (Fases 2–5)

Data: 2026-07-23 · Escopo: briefing de direção de arte e engenharia de experiência.

---

## 1. O que foi entregue

| Arquivo | Papel |
|---|---|
| `index.html` | One-page: hero escuro → corpo claro → CTA escuro. Logo em paths SVG. |
| `styles.css` | 100% na rampa H≈160° (exceções documentadas). Lado escuro + claro espelhados. |
| `main.js` | Shader WebGL2 + fallbacks, sistema global de ponteiro, springs, medidor. |
| `docs/design-tokens.md` | Fonte da verdade (Fase 0). |
| `docs/design-direction.md` | Plano de direção (Fase 1). |

## 2. As 5 decisões de direção mais importantes

1. **Corpo claro.** O site saiu de "tema dark futurista" (genérico) para arco
   vazio→luz→vazio. A informação vive no claro; o escuro virou moldura rara.
   É a decisão que separa direção de template.
2. **Física de luz corrigida.** A v1 tinha cianos saturados nas luzes altas —
   o oposto da arte medida. Agora saturação cai quando a luz sobe, em CSS e
   no shader (rampa como função de transferência).
3. **Glitch morto, quebrado preservado.** A animação glitch RGB (banida pelo
   briefing) saiu. O caráter "quebrado" vem dos filamentos do vórtice cruzando
   o logotipo ao vivo — luz real, não filtro.
4. **Logo como geometria, não como fonte.** `beyon.0` reconstruído em paths SVG
   monoline (métricas do original; `0` assentado na baseline com overshoot
   óptico). Zero dependência de @font-face, nítido em qualquer densidade,
   texto real no DOM via `<h1>`.
5. **Vermelho com emprego.** O ponto `#E61A1A` virou o LED do medidor
   (pulsa medindo → sólido estável). Único pixel fora do matiz 160°,
   com regra própria: 1 instância, ≤6px, nunca texto.

## 3. Elemento-assinatura

**O medidor** — readout fixo (canto inferior esquerdo), JetBrains Mono:
`LCP 0.42s · 56kB · 60fps ●`. Clique expande painel com LCP, CLS, peso
transferido e fps. **Todos medidos ao vivo** (PerformanceObserver,
transferSize, rAF). API ausente → campo some; nada estimado, nada assado.
Por quê ele: é o único candidato que o dono de negócio e o dev do DevTools
respeitam pelo mesmo motivo — é verdade executando na frente deles.

## 4. Performance — números reais medidos

Medidos via Performance API no Chromium local (servidor http-server, sem gzip):

| Métrica | Medido | Observação |
|---|---|---|
| DOMContentLoaded | **81 ms** | localhost |
| Transferido total | **56 kB** | HTML+CSS+JS sem compressão; com gzip estimo ~20 kB (estimativa, não medição) |
| JS (main.js) | 22 kB raw | orçamento: 150 kB gzip — folga ~10× |
| Erros de console | **0** | — |
| Shader: compilação/link | **OK** (WebGL2) | validado por teste automatizado |
| Shader: composição | 50% vazio · 15% dim · 19% braços · 16% núcleo | pixels lidos de frame renderizado |
| Shader: disciplina de matiz | **100%** dos pixels acesos na família H160 | idem |
| Overflow horizontal @360px | **0 px** | medido |
| Alvos de toque | todos ≥44px (após correção) | medidor e nav CTA via hit-area expandida |

**Não medido (honestidade):** Lighthouse mobile/desktop, LCP em 4G simulado,
INP real — exigem Chrome/Lighthouse e rede real; rodar após deploy
(PageSpeed Insights na URL pública). O LCP é texto por construção (shader
monta 2 rAF após `load`; canvas entra com fade).

## 5. Cadeia de fallback do vórtice (implementada)

`WebGL2 → Canvas2D (streaks na rampa) → poster estático`
Gatilhos: `prefers-reduced-motion`, sem WebGL2, `deviceMemory < 4`,
`saveData`, ou <45fps sustentado por 2s (auto-degrada sozinho).
Pausa: aba oculta + hero fora do viewport. Debug: `?vortex=gl|2d|off`.

## 6. Teste da Chanel

Removido na passada final: o glow-que-segue-cursor dentro dos botões (v1).
Com a luz única global, era uma segunda fonte de luz contando outra história.
Sem ele, o magnetismo + a borda iluminada dos cards ficaram mais críveis.
Também contido: tilt só na vitrine; serviços/processo respondem apenas à luz.

## 7. Checklist de pendências (dados reais que faltam)

- [ ] `assets/hero.jpg` — imagem original como poster/fallback (site funciona sem, com gradiente na rampa).
- [ ] Lighthouse/PageSpeed na URL pública após deploy (meta: ≥90 mobile / ≥95 desktop).
- [ ] Teste com leitor de tela real (NVDA) no logo SVG + medidor (aria implementado, não testado com AT de verdade).
- [ ] Sobreposição `difference` do logo SVG contra o PNG original (validei por métricas numéricas, não por pixel-diff).
- [ ] Vídeo `hero.mp4` — quando existir, decisão: manter shader (recomendado pelo briefing) ou trocar.
- [ ] Domínio + deploy (Netlify/Vercel/GitHub Pages).

## 8. Avaliação honesta — o que ficou abaixo do nível

1. **O shader não foi visto por olhos humanos.** Calibrei por leitura de
   pixels (composição, matiz, luminância) — isso garante física e proporção,
   não beleza. Risco real: os fios podem parecer mais "ruído espiral" que os
   filamentos elegantes da tua arte. Se estiver feio, os parâmetros estão
   isolados e nomeados no FRAG; ajuste é rápido.
2. **Letterforms do logo são aproximação monoline.** Fiéis às métricas
   (baseline, x-height, ascendente, `0` corrigido), mas não são os glifos
   exatos da tua arte — o `y` e o `e` são os pontos mais prováveis de
   divergência visual. O pixel-diff do Anexo A está pendente.
3. **A transição escuro→claro é boa, não espetacular.** Gradiente radial
   parado + brilho do shader acoplado ao scroll. A versão "núcleo engole a
   página" exigiria o shader fora do hero — cortei por orçamento de
   performance. É o próximo upgrade se você quiser gastar ali.
4. **Springs são aproximação (integrador simples), não física completa** —
   perceptualmente corretos nos limites usados (6px/6°), mas sem massa
   configurável por elemento.
5. Métricas de laboratório (Lighthouse/INP/4G) ficaram pendentes — o que dá
   pra afirmar: 0 erros, 56kB total local, LCP-é-texto por arquitetura.
