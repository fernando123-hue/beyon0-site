# Direção V3 — "Luz e vida" (2026-10-01)

Pedido do dono, depois de ver a V2 no ar: "ainda está passando uma sensação
mórbida" — fundo preto sem luz, falta de vida e movimento, cores frias.
Decisões dele: **claro e vivo**, repensando visual, estrutura e copy. O AI
Core e os pulsos voltam numa fase seguinte, repensados para fundo claro;
esta fase entrega o site sem o canvas.

O que continua valendo: regra 2 (zero dado inventado), fatos e decisões de
`01 Empresa\Decisões.md` (FAQ, preço fechado, diagnóstico grátis, sem nome
próprio, atende o Brasil online), CSP sem inline, nenhuma variável de CSS
por frame, movimento só por transform/opacity/clip-path, acessibilidade AA,
scroll nativo, sem preloader, mono só onde há dado.

## 1. A ideia

Uma folha de papel quente, com luz entrando. O site é editorial e humano:
serifa grande, itálico como voz, uma cor de ação de sinal (laranja-coral)
que aparece como marca-texto, botão e detalhe. A vida vem de auras de luz
que derivam atrás do conteúdo, de palavras que se acendem ao entrar na tela,
de blocos de cor por serviço e de uma única seção escura no fim (a conversa)
que fecha o arco luz → noite com a cor de ação brilhando.

Precisão continua: réguas, numeração, alinhamento rígido, dados em mono.
Mas a sala agora tem janela.

## 1b. Celular primeiro (pedido explícito do dono)

"A maioria das pessoas vai acessar pelo celular. Você estava pecando muito
nisso." Então, nesta fase, a ordem é outra: cada página é desenhada em
390px primeiro e só depois cresce.

Regras:
- A primeira tela do celular tem que conter: marca, a frase, o que é e o
  CTA principal — sem rolar.
- CTA principal sempre alcançável: botão largo no hero e barra fixa discreta
  no rodapé da tela com "Falar comigo" (some quando o CTA final está visível).
- Alvos de toque ≥ 48px; textos de corpo ≥ 1rem; nada depende de hover (o
  que o desktop mostra em hover, o celular mostra sempre ou no toque).
- Blocos de serviço são cartões de largura inteira com tinta própria, não
  uma grade encolhida; listas longas viram linhas com régua.
- Movimento no celular: entradas curtas por linha mascarada, auras paradas
  ou lentas, nenhum efeito preso ao cursor.
- Conferência: screenshots `*-cel` e 320px ANTES do desktop, em cada etapa.
  Regressão no celular bloqueia.

## 2. Sistema visual

**Paleta** (a confirmar com a pesquisa de referências; contraste conferido):

| Token | Valor | Uso |
|---|---|---|
| `--papel` | `#F7F2EA` | fundo |
| `--papel-2` | `#EFE6D8` | superfície, blocos |
| `--tinta` | `#17130E` | títulos, texto forte (16:1) |
| `--tinta-2` | `#4A433A` | corpo (8,6:1) |
| `--tinta-3` | `#766D62` | metadado (5:1) |
| `--linha` | `#DDD3C3` | réguas |
| `--sol` | `#FF5A1F` | cor de ação: botão, marca-texto, detalhe (preenchimentos) |
| `--sol-texto` | `#C8410B` | a mesma cor como TEXTO sobre papel (4,6:1) |
| `--mel` | `#FFD36E` | tinta do bloco Sites |
| `--salvia` | `#CFE3CF` | tinta do bloco Automação |
| `--ceu` | `#CFE1F2` | tinta do bloco Experiências |
| `--noite` | `#17130E` | a única seção escura (CTA) e o rodapé |

**Tipografia:** Instrument Serif (display e itálico de ênfase, 43 KB) +
Sora (corpo e controles, já local) + JetBrains Mono (só dados).

**Movimento** (vocabulário fechado, igual à V2): expo.out 0,9–1,1s nas
entradas por linha mascarada; micro 180ms; auras por `transform` em loops
longos e incomensuráveis (compositor); marca-texto que se desenha ao entrar
(`background-size` por classe, uma vez); cards que levantam no hover
(transform); seção escura entra por `clip-path` no scroll (scrub). Sem
canvas nesta fase.

## 3. Estrutura e copy

**Hub**
1. Hero: eyebrow "Sites · Automação & IA · Experiências digitais"; H1
   "Sites, automação e IA que *funcionam* de verdade."; sub "Feitos por uma
   pessoa, do primeiro rascunho ao ar. Começo pelo problema, fecho o preço
   antes, e o que é seu continua seu."; CTAs "Falar comigo" / "Ver os
   serviços"; linha de prova "Esta página, agora: 60 fps · pronta em 0,2 s".
2. Serviços: três blocos editoriais com tinta própria (mel, sálvia, céu),
   número, título serifa, texto, link. Não são três cards iguais: o
   primeiro é largo, os outros dois dividem a linha.
3. Como trabalho: três regras como lista grande com marca-texto nas
   palavras que importam.
4. Experiências digitais: bloco céu com texto e uma forma viva em CSS.
5. Conversa (seção noite): "Me diga o que precisa acontecer. Eu digo
   *como*." + CTA sol.
6. Rodapé noite.

**Sites:** hero com janela-mockup clara; formatos (3 blocos mel/papel-2);
padrão de entrega (lista com marca-texto); prova (banda com os três números
medidos); método (4 passos em linha); perguntas (9); conversa.

**Automação & IA:** hero mantém "Toda entidade perde dinheiro num ponto que
ninguém está *auditando*." (a melhor frase do site); o problema (3 linhas);
o que faço (6 blocos em bento sálvia/papel-2); método; cenários; perguntas
(10); conversa + modal.

**Resumo:** mesma pele clara, sem efeitos.

## 4. O que sai e o que fica

Sai desta fase: canvas (`campo.js`, `profundidade.js`, `organismo.js`,
`palavras.js`), régua lateral, retículo, cubo, portal, grão escuro. Ficam:
`core.js` (loop e estado, para a fase do AI Core), `pagina.js` (nav,
WhatsApp, prova, interruptor), `anima.js` (reescrito para a nova
coreografia), `lead-form.js`, `ancoras.js`, `tel.js`, ferramentas de
verificação. Os módulos removidos ficam no histórico (commit `051b2a8`).
