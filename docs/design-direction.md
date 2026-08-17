# beyon.0 — Plano de Direção de Arte (Fase 1)

> ## ⚠️ DOCUMENTO HISTÓRICO — NÃO IMPLEMENTAR
>
> Escrito em 2026-07-30, no primeiro commit do projeto. Descreve uma direção
> que **nunca foi executada e foi abandonada**: paleta esverdeada (H≈160°,
> `--glow: #7FAB9D`), **corpo claro** ("o escuro vira moldura rara"), fonte
> Outfit no logotipo, arco de luz escuro→claro→escuro.
>
> **O site real é outro:** rampa CIANO (`--glow: #00F5FF`), 100% dark, Sora +
> JetBrains Mono. Essa identidade está declarada como SAGRADA na seção 5 do
> `docs/HANDOFF.md`, foi aprovada pelo dono e está publicada.
>
> Implementar a partir daqui **quebra a identidade do site**. Guardado só como
> registro do que foi considerado e descartado. A fonte de verdade é o
> `docs/HANDOFF.md`.
>
> Aproveitável (neutro de paleta): a ideia de "Processo — três passos numa
> linha do tempo, não três caixas" (§4), implementada em 2026-08-17.

> Entrada imutável: `docs/design-tokens.md`. Este plano decide; as fases 2–5 executam.

---

## 1. Decisões herdadas da Fase 0 (delegadas pelo dono)

### 1.1 Ponto vermelho `#E61A1A` — ADOTADO, com regra própria
Não é artefato: vira o **LED do medidor** (elemento-assinatura, §5). Semântica de
gravação/ao-vivo: pulsa enquanto mede, fica sólido quando estabiliza.
**Regra:** uma única instância por viewport, nunca maior que 6px, nunca em texto,
nunca fora do medidor. É o único pixel fora de H≈160° no site inteiro — e é isso
que o torna visível.

### 1.2 Mockups quentes na vitrine — MANTIDOS, como exceção emoldurada
A vitrine vende **alcance** ("teu site não vai ser verde só porque o meu é").
**Regra:** matiz livre **apenas** dentro de `.mock__screen` (conteúdo de portfólio
emoldurado). Todo chrome do site — molduras, labels, fundo — permanece na rampa.

### 1.3 "48h pro primeiro layout" — REMOVIDO (dado não confirmado, regra zero invenção).

---

## 2. Paleta final

A rampa canônica inteira, sem adições. Croma dominante: H≈160°. Acento: o LED.

| Nome | Hex | Lado escuro | Lado claro |
|---|---|---|---|
| `--void` | `#000000` | fundo | texto sobre acento |
| `--deep` | `#0F1F19` | superfícies, bordas | **títulos e texto forte** |
| `--mid`  | `#36584D` | divisores, desativado (nunca texto) | **corpo de texto** (AA sobre `--core`) |
| `--glow` | `#7FAB9D` | acento, dados, bordas ativas | decorativo/UI grande (REPROVA como texto sobre claro) |
| `--hi`   | `#CBE8DF` | texto secundário | superfícies elevadas suaves |
| `--core` | `#F8FEFC` | texto principal, núcleo | **fundo do corpo claro** |
| LED | `#E61A1A` | só no medidor, ≤6px, 1 por viewport | idem |

A rampa funciona espelhada: no escuro, luz = texto; no claro, luz = papel.
Mesmos 6 tokens, papéis invertidos. Nenhum hex novo em nenhum dos lados.

---

## 3. Tipografia

| Papel | Face | Pesos | Nota |
|---|---|---|---|
| Logotipo | **Outfit 300** → paths SVG | 300 | par métrico do original; `0` corrigido na baseline; congelado em SVG, zero dependência de font |
| Display (h1/h2) | **Sora** | 300 + 600 | 300 nos displays grandes (leveza tecnológica rara — todo mundo usa bold), 600 nos h3 |
| Corpo | **Sora** | 400 | uma família só = disciplina + menos bytes |
| Dados/labels/medidor | **JetBrains Mono** | 400, 500 | única voz secundária |

Space Grotesk sai (era veículo neutro; Sora 300 em display grande é a escolha memorável).
O que é memorável aqui não é a face — é o **peso**: display fino sobre vazio preto.

---

## 4. Conceito de layout

Arco de luz da página: **vazio → luz → vazio**. O usuário entra no escuro (impacto),
lê no claro (informação), e a saída (CTA) volta ao escuro — fechando o ciclo no vórtice.

### Hero — escuro
"Você está dentro de algo grande demais pra caber na tela."
```
┌──────────────────────────────────────────────┐
│ beyon.0                       01 LCP 0.8s ●  │  ← medidor mono, canto
│                                              │
│        (vazio ~30%)              ~~~~~~~     │
│                              ~~~ vórtice ~~  │
│  beyon.0                    ~~~ (centro   ~  │
│  Seu cliente te acha no     ~~  fora da   ~  │
│  Google. E chama no Whats.   ~~ tela, à   ~  │
│  [Falar no WhatsApp]           ~ direita) ~  │
└──────────────────────────────────────────────┘
```
Logo grande = texto vivo Outfit 300. O "quebrado" da arte original não vira animação
glitch (banida): vem dos **filamentos do vórtice cruzando sobre as letras** — luz real
compondo ao vivo. Estética preservada, técnica honesta.

### Transição escuro→claro — o evento
"A luz do núcleo vira o papel da página."
O brilho de `--core` no vórtice cresce com o scroll e **é** o fundo da seção seguinte
— sem costura, um wipe radial. O olho sai do vazio e entra na informação.

### Serviços — claro
"Densidade radical sobre papel de luz."
```
│ // o que eu faço                             │
│ Do zero ao ar, tudo resolvido.   (Sora 300)  │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│ │ 01  │ │ 02  │ │ 03  │ │ 04  │  foscos,    │
│ └─────┘ └─────┘ └─────┘ └─────┘  luz única  │
```

### Vitrine — claro
"Molduras na rampa, conteúdo livre." (exceção §1.2)
```
│ ┌[moldura]─┐  ┌[moldura]─┐  ┌[moldura]─┐     │
│ │ neo      │  │ warm     │  │ saas     │     │
│ └──────────┘  └──────────┘  └──────────┘     │
```

### Processo — claro
"Três passos numa linha do tempo, não três caixas."
```
│  01 ─────────── 02 ─────────── 03            │
│  Conversa       Design         Entrega       │
```

### Objeções — claro
"Cada bloco mata uma dúvida real." (substitui 'Por que beyon.0')
```
│  É caro?     Demora?    Vou depender   Funciona │
│  resposta    resposta   de você?       no cel?  │
```

### CTA final — volta ao escuro
"O vazio de novo — agora com uma porta."
```
│ ████████████ escuro ████████████             │
│        Bora tirar seu site do papel?         │
│        [Falar no WhatsApp]                   │
│ ██████ (eco do vórtice, discreto) ██████     │
```

### Footer — escuro, mínimo.

---

## 5. Elemento-assinatura: O MEDIDOR

Readout de performance **real** do próprio site, JetBrains Mono, canto do hero,
persistente e discreto:

```
LOAD 0.42s · 61KB · 60FPS ●
```

- `performance.now()` + `PerformanceNavigationTiming.transferSize` + FPS medido no rAF.
- **Só números medidos ao vivo.** Nada estimado, nada assado. Se a API falha, o campo some.
- LED vermelho §1.1: pulsa medindo, sólido estável.
- Vendável na frase exigida: *"isso prova que eu sei fazer sites rápidos — e a prova
  está rodando na tua frente."* É o argumento comercial + o gesto mais futurista
  da página (resposta instantânea, §6.2 do briefing).

**Por que ele e não os outros candidatos:**
- *Transição escuro→claro:* forte, mas é experiência — não prova capacidade mensurável.
- *Luz única do cursor:* vira a textura de qualidade do site inteiro (Fase 3), mas é
  sutil demais pra ser "a coisa lembrada". Sustenta; não assina.
- O medidor é o único que um dono de confeitaria **e** um dev com DevTools aberto
  respeitam pelo mesmo motivo: é verdade.

Tudo em volta do medidor fica quieto: sem HUD, sem colchetes, sem retícula.

---

## 6. Sistema de movimento (massa)

| Classe | Spec |
|---|---|
| Micro (hover, LED) | 140ms, `cubic-bezier(.2,.9,.25,1)` |
| UI (cards, magnetismo) | 320ms, spring JS (stiffness ~210, damping ~22) |
| Reveals | 700ms, `cubic-bezier(.16,1,.3,1)`, stagger 60ms, uma vez |
| Vórtice | contínuo, sem loop perceptível, lerp 0.06 no cursor |

`linear` proibido. Só `transform`/`opacity`.

---

## 7. Autocrítica (o que refiz por ser genérico)

1. **Primeira versão mental: site todo escuro com glow ciano.** É o que qualquer
   modelo produz pra "futurista" — e era o site atual. Refeito: corpo claro carrega
   a informação; o escuro vira moldura rara. A quebra de luminância é a diferença
   entre "tema dark" e direção.
2. **Glitch animado no logo.** Era meu (fiz na v1) e é 2015. Morto. O caráter
   quebrado agora vem da luz do vórtice cruzando o logotipo — física, não filtro.
3. **Medidor como HUD.** Risco de virar cockpit falso. Contido: uma linha mono,
   um canto, números reais, zero ornamento. Se um número não é medido, ele não existe.
4. **Tilt 3D em todos os cards.** Acumulação de demo. Contido: tilt só na vitrine
   (≤6°); serviços e processo respondem só com a luz única (borda + elevação).

---

## 8. Ordem de execução (fases seguintes)

Fase 2: shader do vórtice (WebGL2 → Canvas2D → imagem) + transição de luz.
Fase 3: sistema global de ponteiro + luz única + magnetismo + medidor.
Fase 4: copy de objeções, sentence case, zero invenção.
Fase 5: auditoria (orçamentos da tabela do briefing) + teste da Chanel.
