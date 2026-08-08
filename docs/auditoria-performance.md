# Auditoria de performance — beyon.0

**Data:** 2026-08-07 · **Método:** medição direta no navegador, não inspeção de código.

Três rodadas anteriores de otimização falharam porque eu inferi o gargalo em vez
de medir. Este documento registra o que foi **medido**, para que a reconstrução
nasça de dados.

---

## O gargalo

Medido na página real, isolando cada etapa do pipeline de renderização:

| Etapa | Custo |
|---|---|
| Leitura de layout | **0 ms** |
| `getBoundingClientRect` em 574 elementos | 1,06 ms |
| Desenho em canvas (600 operações) | ~1 ms |
| Gradientes radiais (64 halos/frame) | 1,13 ms |
| **Recálculo de estilo após invalidação** | **76–92 ms** |

Layout é grátis. Desenho é barato. **Todo o custo está em recalcular estilo.**

O site escreve variáveis CSS **a cada frame** (`--ef-e`, `--par-amb`, `--res-*`,
`--sing-*`, `--ty-*`, `--dim`, `--tilt-*`). Cada escrita dispara um recálculo de
76–92 ms. O orçamento de um frame a 60fps é 16,7 ms — **uma única escrita já
custa 5 frames**.

Isso explica todos os sintomas de uma vez: lentidão contínua, queda repentina
quando mais subsistemas acendem, e o fato de nenhuma otimização de desenho ter
mudado nada.

## De onde vem o custo

Removendo partes da página e remedindo:

| Estado | ms por recálculo | Delta |
|---|---|---|
| Página completa | 76,5 | — |
| Sem os 205 glifos da tipografia | 24,7 | **−52 ms (68%)** |
| Sem glifos e sem os 20 cards | 7,2 | −17,5 ms (23%) |

- **Tipografia viva: 52 ms.** ~254 µs por caractere. É o maior custo isolado do
  site e foi introduzido na sessão de 2026-07-31.
- **Cards (`.card-mat`/`.service`): 17,5 ms.** ~875 µs por card.
- **Resto da página: 7,2 ms.**

A conta fecha com o observado: o site publicado (sem a tipografia) tem ~25 ms de
recálculo e roda a 20–30fps; com a tipografia, 76 ms e roda a 8–10fps.

## Causa raiz

Testado com elementos sintéticos, 205 unidades:

| Estrutura | ms |
|---|---|
| Cadeia de 7 variáveis dependentes (como a tipografia) | 50,6 |
| Uma única variável direta, sem cadeia | 33,1 |

A cadeia de `calc()` só responde por 1,5x. **Mesmo com uma variável simples, 205
elementos custam 33 ms.** O custo não está na complexidade da expressão — está na
quantidade de elementos que precisam ser reavaliados e repintados quando uma
variável herdada muda.

**Conclusão: o número de elementos DOM que reagem a variáveis CSS por frame é o
custo dominante do projeto.**

## Hipóteses testadas e descartadas

Registradas para não serem investigadas de novo:

- **Número de canvas.** Distribuir a mesma carga entre 1 e 24 canvas não mostrou
  degrau (0,45–1,19 ms). A suspeita de queda para renderização por software não
  se confirmou.
- **Gradientes por frame.** Custam ~1 ms. Foram trocados por sprites em cache
  numa tentativa anterior, o que **piorou** o desempenho (sprite escalado é 1,4x
  mais lento que o gradiente) e foi revertido.
- **`backdrop-filter`.** Corrigido antes (área reblurrada por frame caiu de
  1.989k px² para 3k px²) e o ganho foi real, mas não era o gargalo principal.

## Leis para a reconstrução

Derivadas das medições acima, não de preferência:

1. **Nada visual por frame passa pelo CSS.** Movimento e brilho contínuos vivem
   no canvas, que custa ~1 ms para a cena inteira.
2. **Variáveis CSS só mudam em eventos discretos**, nunca a cada frame, e nunca
   no `:root` quando muitos elementos as leem.
3. **Nenhum efeito contínuo pode depender de centenas de elementos DOM.** Se um
   efeito precisa de 205 unidades animadas, ele é desenhado, não estilizado.
4. **Instrumentação desde o primeiro commit.** O projeto nasce com medição de
   custo por subsistema.
5. **Degradação preventiva, não reativa.** O orçamento de frame é verificado
   antes de gastar, em vez de cortar depois de já ter travado.

## Nota de responsabilidade

O maior custo isolado (52 ms, 68% do total) veio de código que escrevi nesta
mesma série de sessões. As três tentativas de correção anteriores erraram o alvo
porque mediram **contagens** (quantos elementos, quantos gradientes, quantos
pixels) e as trataram como se fossem **tempo**. Contagem alta não é custo alto —
foi preciso medir tempo de verdade para achar o gargalo.
