# Mapa vivo v2, Fase 3, PR 3: o servidor (ajuste pela reação, dica ao Zero, coincidência)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** quando o aparelho não sabe rotear o pedido ("bota um lugar pra ver as fotos dos trabalhos"), a MESMA chamada de reação da Fase 1b devolve
`ajuste: { acao, peca }` do conjunto fechado, e o nó em esboço aparece igual ao do roteador local. Depois do Enter, o Zero recebe a peça que a tela
mostrou só como dica de texto, e o servidor mede quanto o plano oficial coincide com o esboço (meta ≥ 85%).

**Spec:** cofre `01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md`, "FASE 3" (aceites 5 e medição). Plano do PR 1 (`2026-11-28-mapa-vivo-fase3-pr1-ajuste.md`),
"Os PRs seguintes". Opção A (tabela fixa) continua: o modelo só ESCOLHE a peça, nunca escreve texto de nó.

## Dois PRs, nesta ordem

### PR 3a: o ajuste vem da reação

- **Servidor (`api/_vendas/reacao.mjs`, `fluxo-reacao.mjs`):**
  - corpo do `reagir` ganha `mapa: true` (opcional, booleano estrito). Só com ele o pedido ao Haiku usa o sistema e o esquema com `ajuste`
    (`{ acao: 'entra' | 'sai' | 'nada', peca: <chave de PECAS> | '' }`, enum fechado das chaves de `js/mapa-ajuste.js`). Sem `mapa`, o pedido é
    byte a byte o de hoje (o que foi medido com o Haiku real em 26/11 não muda).
  - `conferirAjuste(json)`: estrutural, só `entra`/`sai` com peça da tabela (o modelo só escolhe; o texto do nó é da tabela). A anotação continua
    conferida como hoje; o ajuste sai mesmo quando a anotação cai (são independentes).
  - resposta: `{ reacao: { anotacao? , ajuste? }, seq, motivo }`; a chamada é a mesma (conta nas 3 por mensagem e 12 por conversa, nenhum gasto a mais).
- **Tela:** `js/orcamento-reacao.js` expõe `precisaDoServidor(texto)` (oficial na tela, ajuste carregado, `rotear` local deu null) e
  `ajusteDoServidor(ajuste, texto)` (aplica só se a caixa ainda tem esse texto e o local segue null; mesma regra do esboço local).
  `js/orcamento-anotacao.js` manda `mapa: true` quando `precisaDoServidor` diz sim e repassa `r.reacao.ajuste`. A anotação some ou fica como hoje.
- **Testes:** conferência (peça fora da lista, ação inventada, tipo errado, `nada` = null), pedido sem `mapa` idêntico ao de hoje, ponta a ponta com IA falsa,
  tela (ajuste velho descartado, local manda primeiro). Mutação: tirar a checagem do conjunto fechado derruba teste.

### PR 3b: a dica ao Zero e a coincidência

- corpo da `mensagem` ganha `rascunho: { acao, peca }` (o esboço FIRME no Enter), conferido contra a tabela; vai ao `proximoPasso` só como texto
  ("a tela mostrou em esboço: <título da peça>; se o plano novo não trouxer, diga em uma frase por quê"). Nunca vira plano.
- Aceite 5: forjar `plano` (ou `planta`) no corpo da `mensagem` não muda o gravado.
- Coincidência: no turno com `rascunho` e plano novo validado, log `{ evento: 'coincidencia', acao, peca, coincidiu }` (sem texto); sem plano novo, `coincidiu: null`.

## Global Constraints

- O plano oficial só vem do `desenhar_planta` validado (`api/_vendas/planta.mjs`). Nada do aparelho vira plano no servidor.
- Nada do texto vai ao banco ou ao log (regra da Fase 1b).
- ES5 em `js/`; nunca lança; sem mutação.
- Reação continua desligada em produção (`BZ_REACAO`) até o dono ver a fase inteira.
