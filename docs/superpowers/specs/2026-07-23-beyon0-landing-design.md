# beyon.0 — Landing Page (Design Spec)

**Data:** 2026-07-23
**Objetivo:** Landing one-page pra captar clientes que querem um site. Marca: beyon.0.

## Decisões
- **Público:** geral (qualquer projeto de site).
- **Portfólio:** nenhum real ainda → vitrine de conceitos/estilos criados no mesmo visual (honesto, não finge serem clientes).
- **Contato:** WhatsApp — `wa.me/5521977167944` com mensagem pré-preenchida. Botão flutuante + CTAs.
- **Escopo:** one-page, scroll.
- **Stack:** HTML + CSS + JS puro, sem build. Deploy grátis (Netlify/Vercel/GitHub Pages).

## Sistema visual
- Base preto `#050607`; energia ciano/turquesa `#7CF5E3`→`#2FE0C6`; branco pros textos-chave.
- Tipografia: Space Grotesk (títulos), JetBrains Mono (labels/números), com fallback system.
- Logo `beyon.0`: efeito glitch/quebrado — aberração RGB, scanlines, jitter no hover. CSS/SVG, sem imagem.
- Hero: fundo animado em `<canvas>` (streaks de energia ciano) + imagem `assets/hero.jpg` como poster/fallback. Trocável por `<video>` depois.
- Movimento: reveals no scroll, glow reativo. Respeita `prefers-reduced-motion`.

## Estrutura
1. Hero — logo glitch, headline, sub, CTA WhatsApp + "ver trabalhos", fundo animado.
2. Serviços — 4 cards (Landing, Institucional, Redesign, Presença Online).
3. Vitrine de conceitos — 3 mockups estilizados (CSS art) com labels de estilo.
4. Processo — 3 passos (Conversa → Design → Entrega).
5. Por que beyon.0 — diferenciais curtos.
6. CTA final + contato — bloco forte, WhatsApp grande.
7. Footer.

## Arquivos
```
Beyon 0/
├── index.html
├── styles.css
├── main.js          (canvas hero + scroll reveals + glitch)
└── assets/hero.jpg  (imagem do usuário; canvas funciona mesmo sem ela)
```

## Pendências do usuário
- Salvar imagem da energia em `assets/hero.jpg` (opcional; canvas cobre o visual).
