# beyon.0 — Design Tokens (fonte da verdade)

> **REV 2 (2026-07-23, decisão do dono):** rampa migrou do matiz medido H≈160°
> para **ciano elétrico** ancorado em `#00F5FF`. Nova rampa:
> `--void #000000 · --deep #06272B · --mid #0F6A73 · --glow #00F5FF · --hi #9FF8FF · --core #F2FEFF`
> Energia secundária: **dourado tecnológico `#FFC96B`** — uso raro, restrito a
> pulsos de energia do Neural Energy Field. LED `#E61A1A` inalterado (regra própria).
> A arte do hero (hero.jpg) permanece no matiz original — é artefato, não token.
> As seções abaixo documentam a Rev 1 (histórico e regras estruturais, que seguem valendo).

> **Status: IMUTÁVEL após aprovação da Fase 0.**
> Todo agente/fase recebe este arquivo como entrada. Propostas que conflitem com ele perdem.
> Origem: briefing de direção de arte (2026-07-23), seção 5 — valores medidos por amostragem
> da arte original do vórtice. Não reinterpretar.

---

## 1. Rampa canônica de cor (H≈160°)

Matiz único em toda a identidade. Saturação **cresce quando a luz cai** (física de bloom:
o núcleo dessatura para branco). Nunca clarear cor adicionando branco — subir a rampa.

| Token | Hex | S (medida) | Papel |
|---|---|---|---|
| `--void` | `#000000` | — | Fundo absoluto. O vórtice depende dele. |
| `--deep` | `#0F1F19` | ~50% | Penumbra, superfícies elevadas, bordas |
| `--mid`  | `#36584D` | ~26% | Traços de baixa energia, divisores, texto desativado |
| `--glow` | `#7FAB9D` | ~26% | **Acento primário.** Estados, bordas ativas, dados |
| `--hi`   | `#CBE8DF` | ~12% | Texto secundário sobre escuro |
| `--core` | `#F8FEFC` | ~2%  | Texto principal, núcleo do brilho |

### Contraste (sobre `--void`)
- `--core` = 20:1 · `--hi` = 15:1 · `--glow` = 7.3:1 (AA texto normal)
- `--mid` **REPROVA** — proibido para qualquer texto que precise ser lido.

### Regras de derivação
- Transparências: sempre `rgba()` de um token da rampa. Nunca hex novo.
- Linhas/bordas: `rgba(--glow)` (ativa) ou `rgba(--hi, ~0.07)` (passiva).
- Glow/sombra luminosa: `rgba(--glow, 0.3–0.4)`, raio ≥ 30px.
- Texto sobre acento claro (`--glow`/`--hi` como fundo): `--void`.
- Proibido: `lighten()`/`darken()` genéricos, mistura com branco, matiz fora de H≈160°.

### Fora da rampa — status
- `#E61A1A` (ponto vermelho 4×4px sob o logo na referência): **PENDENTE confirmação do dono**
  — acento deliberado, elemento de UI, ou artefato de captura? Não replicar até resposta.
- Cores quentes do mockup "Restaurante" na vitrine (conteúdo demonstrativo emoldurado):
  **decisão de direção pendente na Fase 1** — exceção de conteúdo ou remoção.

---

## 2. Estrutura de luminância da página

- **Herói: escuro** (`--void` + vórtice).
- **Corpo: claro** (confirmado na referência). A transição escuro→claro é o momento mais
  forte da página — projetada como evento, não como fim de seção.
- Tokens de superfície clara **ainda não definidos** — derivar da rampa na Fase 1
  (candidatos: fundo `--core`, texto `--void`/`--deep`, acento `--glow`).
- Estado atual do site: 100% escuro. Divergência estrutural registrada (ver §7).

---

## 3. Tipografia

### Em uso hoje (extraído do código)
| Papel | Família | Pesos | Carregamento |
|---|---|---|---|
| Display + texto | Space Grotesk | 400, 500, 600, 700 | Google Fonts `<link>` |
| Utilitária/dados | JetBrains Mono | 400, 500 | Google Fonts `<link>` |

### Logotipo (Anexo A do briefing)
- Original: geométrica **leve**, minúscula, "o" circular. Candidatas: **Outfit 300** (par mais
  próximo) ou **Sora 300** (mais caráter). Atual usa Space Grotesk **700** — peso errado.
- Métricas medidas (recorte 385px): baseline y=101 · altura-x 58→101 (43px) ·
  ascendente do "b" y=38 (63px) · ponto final x 295–301, y 96–100.
- Defeito a corrigir: o `0` flutua acima da baseline. Alvo: base do `0` **na** baseline,
  topo no ascendente do "b", com compensação **óptica**.
- Entrega final: texto vivo → validar por sobreposição `difference` → **converter para
  paths SVG**. `<h1>` com `beyon.0` real no DOM. Proibido PNG.

### Escala em uso (extraída)
| Papel | Valor |
|---|---|
| h1 (hero) | `clamp(2.4rem, 6.5vw, 4.6rem)` / 700 / -0.02em |
| h2 | `clamp(1.7rem, 4vw, 3rem)` / 600 |
| h3 | `1.2rem` / 600 |
| Corpo | `1rem` / 400 / lh 1.6 |
| Sub-hero | `clamp(1rem, 1.4vw, 1.18rem)` |
| Lead de seção | `1.05rem` |
| Card/step body | `0.95–0.96rem` |
| Kicker/eyebrow (mono) | `0.78–0.8rem` / tracking 0.14–0.18em / uppercase |
| Labels mono pequenos | `0.74–0.82rem` |

---

## 4. Espaçamento, layout, raios

| Token | Valor |
|---|---|
| Largura máx. conteúdo | `1160px` |
| Padding de seção | `clamp(4.5rem, 10vw, 8rem)` vertical |
| Padding lateral | `clamp(1.2rem, 5vw, 2rem)` |
| Gap de grids | `1–1.4rem` |
| Padding de card | `1.8rem 1.6rem` |
| Raio padrão | `16px` |
| Raio de frame (mockups) | `14px` |
| Raio pequeno | `4–8px` |
| Pill | `999px` |

---

## 5. Movimento (estado atual + lacuna)

### Em uso hoje
| Uso | Duração/curva |
|---|---|
| Reveal no scroll | `.7s cubic-bezier(.2,.7,.2,1)` + translateY 26px, uma vez |
| Hovers (cards, botões) | `.2s–.35s ease` |
| Pulso WhatsApp | `2.4s ease-out infinite` |
| Glitch do logo | `steps()` 3.1s/4.2s — **a remover** (banido §6.1 do briefing) |

### Regras (briefing, imutáveis)
- Apenas `transform` e `opacity`. 60fps ou não entra.
- `linear` proibido em qualquer coisa perceptível.
- Massa real: spring/inércia — sistema de springs **a definir na Fase 1** (hoje não existe).
- Cursor: efeitos só sob `@media (pointer: fine)`. Nenhuma informação depende de hover.
- `prefers-reduced-motion` desliga movimento não-essencial sem quebrar layout.
- Reveal: `IntersectionObserver`, uma vez, stagger curto, nunca re-anima.

---

## 6. Interação (arquitetura, Fase 3)

- **Sistema global de ponteiro:** `--px`/`--py` em custom properties, 1 atualização por
  frame via rAF. Zero listener por componente.
- **Fonte de luz única:** cursor = luz física; todo card/borda calcula brilho e reflexo
  da mesma posição.
- Limites: magnetismo CTA ≤ 6px c/ spring; tilt 3D ≤ 6°; clique persiste e informa.
- Foco visível em tudo; alvos de toque ≥ 44px.

---

## 7. Desvios encontrados na Fase 0 (a corrigir nas fases seguintes)

Auditoria completa de `styles.css`, `main.js`, `index.html` contra a rampa §1.
**Nada foi corrigido ainda** — tabela é o mapa de substituição.

| # | Valor atual | Onde | Substituto proposto |
|---|---|---|---|
| 1 | `#050607` (`--bg`) | fundo global, veil, nav | `--void #000000` |
| 2 | `#080b0d` (`--bg-2`) | seções escuras | `--deep` |
| 3 | `#0c1114` (`--panel`) | cards, steps | `--deep` |
| 4 | `#7CF5E3` (`--cyan`) | grad de título, botões, canvas | `--hi` (luz alta = menos saturada) |
| 5 | `#2FE0C6` (`--cyan-2`) | acentos, glows, seleção | `--glow` |
| 6 | `#0E8F80` (`--cyan-deep`) | stroke dos números, gráfico | `--mid` |
| 7 | `#EAFFFB` (`--ink`) | títulos | `--core` |
| 8 | `#B8C6C4` (`--text`) | corpo | `--hi` |
| 9 | `#6D817E` (`--muted`) | metas, kickers, fine print | `--glow` p/ texto legível; `--mid` só divisor/desativado |
| 10 | `#FF3EA5` | camada glitch do logo | **remover** (efeito banido + fora do matiz) |
| 11 | `#04120F` / `#041310` | texto sobre botão claro, wa-float | `--void` |
| 12 | `rgba(124,245,227,.14)` (`--line`) | bordas ativas | `rgba(--glow, .2)` aprox. |
| 13 | `rgba(255,255,255,.07)` (`--line-soft`) | bordas passivas | `rgba(--hi, .08)` |
| 14 | `#05090A` + cianos saturados | mockup "neo" | remap rampa |
| 15 | `#120A09`, `rgba(255,150,90/90,120/180,120)` | mockup "warm" | **pendência de direção** (§1) |
| 16 | `#0A1418`, `#060B0D` | mockup "saas" | `--deep` |
| 17 | `#0A0E10`, `#0E1315`, `#2A3335`, `#364042` | chrome dos mockups | `--deep` / `rgba(--mid)` |
| 18 | `[124,245,227]`, `[47,224,198]`, `rgba(180,255,246,.28)`, `rgba(3,4,5,.2)` | main.js (canvas) | rampa §1; fade → `rgba(--void)` |
| 19 | `#030405` | poster do hero | `--void` |

### Desvios estruturais (não são cor)
| # | Desvio | Referência no briefing |
|---|---|---|
| A | Site 100% escuro; falta corpo claro + transição projetada | §5.3 |
| B | Logo: Space Grotesk 700 + animação glitch RGB/steps | §5.4, §6.1, Anexo A |
| C | Sem sistema de springs; hovers em `ease` genérico | §6.2 |
| D | Canvas 2D atual vira candidato a fallback intermediário; hero final é shader WebGL2 | Fase 2 |
| E | Sem sistema global de ponteiro (efeitos por componente) | Fase 3 §3.1 |
| F | Copy do hero promete "48h pro primeiro layout" — verificar se é compromisso real | Fase 4 (zero invenção) |

---

## 8. Pendências que exigem resposta do dono

1. **Ponto vermelho `#E61A1A`** — acento deliberado, UI, ou artefato? (§1)
2. **Mockup "warm" fora do matiz** — exceção de conteúdo emoldurado ou remoção? (§7 item 15)
3. **"48h pro primeiro layout"** — compromisso real ou placeholder? (§7 item F)
4. **Fonte do logotipo** — Outfit 300 vs Sora 300 (decide na Fase 1 com teste de sobreposição).
