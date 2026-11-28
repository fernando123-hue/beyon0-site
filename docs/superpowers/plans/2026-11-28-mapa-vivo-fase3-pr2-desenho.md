# Mapa vivo v2, Fase 3, PR 2: o nó em esboço na tela

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** com o mapa do caso na tela, ela escreve "quero também um formulário" e, depois da pausa de 250 ms, o nó aparece em esboço (~34% de opacidade, parado, sem tracejado animado, sem brilho) no lugar certo; se ela apaga ou muda a frase, o esboço sai ou muda. No Enter o nó fica firme com a marca "Ajustado" e a luz passa pelas setas dele. Quando o Zero responde: plano novo → o mapa oficial entra pelo caminho de hoje (`js/orcamento-planta.js`); plano igual → o esboço firme sai, quieto (o oficial manda).

**Architecture:** só aparelho, sem rede e sem IA (o servidor é o PR 3). Duas partes:
1. `js/mapa-desenho.js`: `atualizar(plano, { rascunho: true })` = ajuste QUIETO (sem status, sem som, sem luz; quem fica desliza só por transform; o nó novo nasce com `is-rascunho`, parado). A opção vale só naquela chamada (não fica guardada em `inst.opcoes`). `atualizar(mesmoPlano, { rascunho: false })` com esboço na tela = FIRMAR: tira `is-rascunho`, anuncia "Ajustei o mapa do seu caso.", luz nas setas que tocam o nó (sem luz no movimento reduzido), devolve `{ ok, refeita: false, firmou: [ids] }`.
2. `js/orcamento-reacao.js` (fase 1a, já ouve a caixa com 250 ms): com `E.planta.plano` de forma v3 e `window.BZMapa`, baixa sob demanda, de URL CONSTANTE, uma vez e em ordem, `js/oracao.js` e `js/mapa-ajuste.js`; em `reagir()`: `rotear(texto)` → `aplicarAjuste(oficial, ajuste)` → `BZMapa.atualizar(plano, { rascunho: true })`; nada roteado com esboço na tela → volta ao oficial (quieto). `submit` do form com esboço → firmar e guardar quantas mensagens havia. Render com o Zero respondido (`mensagens.length >= guardado + 2`) e o MESMO plano oficial → volta ao oficial (quieto); plano oficial novo → nada (a cola da planta já o desenhou).

**Global Constraints:** o rascunho nunca sai do aparelho (nenhum fetch novo, nada no corpo da `mensagem`); ES5, sem innerHTML, nunca lança (falha fechada: tira o esboço e avisa `[beyon] reacao`); movimento reduzido: o nó aparece parado e o firmar não anima; o quadro já reserva a altura (`BZMapaLayout.compor`), medir CLS no Visto.

## Tasks

- [ ] **1. Desenho (TDD)** em `docs/testes/planta-mapa-desenho.test.mjs`: rascunho quieto (classe no nó e nas setas dele, nenhuma animação de luz/opacidade do nó novo, status intacto, sem som); opção não persiste (o próximo `atualizar` sem opção anima normal); firmar (classe sai, status, luz, `firmou`); firmar com movimento reduzido sem animação; voltar ao oficial quieto (o nó sai, sem status). Ver vermelho, implementar, verde.
- [ ] **2. CSS** `css/orcamento-mapa.css`: `.mpc-no.is-rascunho`, `.mpc-seta.is-rascunho`, `.mpc-rot.is-rascunho` a .34; `transition: opacity` curta só sem movimento reduzido.
- [ ] **3. Tela (TDD)** em `docs/testes/mapa-vivo-reacao.test.mjs`: sem planta v3 nada novo é baixado; com ela, `oracao.js` e `mapa-ajuste.js` uma vez, em ordem; digitar "quero também um formulário" chama `BZMapa.atualizar(plano com aj_form, {rascunho:true})`; texto sem pedido devolve o oficial; submit firma; resposta do Zero sem plano novo devolve o oficial; com plano novo não chama; exceção tira tudo e avisa.
- [ ] **4. Página** `orcamento.html` não muda (os módulos vêm sob demanda); conferir o CSP (mesma origem).
- [ ] **5. Visto:** `docs/olhar-*.mjs` novo (390/320/1280) com `BZ_PLANTA` ligada: esboço, firme e volta; CLS do quadro.
- [ ] **6.** suíte inteira, typescript-reviewer + security-reviewer, push, PR nível 3, CI, mesclar, promover, conferir.
