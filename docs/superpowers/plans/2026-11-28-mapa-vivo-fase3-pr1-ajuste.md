# Mapa vivo v2, Fase 3, PR 1: o ajuste do mapa no aparelho (partes puras)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quando ela pede "quero também um formulário" ou "tira o agendamento", o aparelho sabe, sem rede e sem IA, qual nó entra ou sai do mapa e devolve um plano novo válido. Se não souber ou não couber, não devolve nada e o Zero decide no turno, como hoje.

**Architecture:** um módulo PURO novo, `js/mapa-ajuste.js` (ES5, UMD como `js/cena-dicionario.js`: `window.BZMapaAjuste` na tela, CommonJS no Node), que usa `js/oracao.js` (negação na oração) e `js/orcamento-mapa-forma.js` (`validarFormaMapa`). Três partes: a tabela fixa `PECAS` (opção A da spec), `rotear(texto)` e `aplicarAjuste(plano, ajuste)`. Este PR não liga nada na tela nem no servidor.

**Tech Stack:** JavaScript ES5 (navegador) / Node ESM nos testes (`node:test`), mutação por `docs/testes/mutacao.mjs`.

**Spec:** cofre `01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md`, "FASE 3" e seção 5, item 5. O dono não respondeu o item 5 por escrito. Entra a opção RECOMENDADA (A, tabela fixa da Beyon: custo zero, sem risco de promessa), pela regra dele de 26/11 ("trabalho já decidido começa sem esperar o sim"). A opção B (o modelo escreve com as palavras dela) só entra com o "sim" dele.

## Global Constraints

- O rascunho é cosmético e local: nunca vai ao servidor como plano; o plano oficial continua só do `desenhar_planta` validado (`api/_vendas/planta.mjs`).
- Só peças vendáveis: das `FUNCIONALIDADES` de `api/_vendas/briefing.mjs`, ficam FORA `area_restrita` (Decisões 28/10), `loja`, `ia`, `automacao`, `integracao`, `idioma` e `depoimentos` (nicho regulado). "Sinal pelo Pix" não é peça do catálogo, então não vira nó. Isso troca o exemplo do aceite 3 da spec ("quero cobrar um sinal" → `pagamento`) por "quero também um formulário" → `formulario`.
- Limites da forma: 2 a 6 nós, 5 camadas, 2 por camada, no máximo 2 `ajustado` (= o limite de 2 rascunhos por vez da spec).
- Textos: título 3 a 28, frase 20 a 60, rótulo 3 a 24 caracteres; sem número, preço, prazo, marca ou promessa (`validarPlano` do servidor com as travas, regulado ou não).
- ES5 em `js/` (sem `=>`, `let`, `const`), nunca lança, nenhuma mutação da entrada.
- Teste novo da planta: `docs/testes/planta-<assunto>.test.mjs` entra sozinho na suíte pelo agregador `planta-todos.test.mjs` (sem mexer no `package.json`).

## File Structure

- Create: `js/mapa-ajuste.js`: `PECAS`, `rotear`, `aplicarAjuste`.
- Create: `docs/testes/planta-mapa-ajuste.test.mjs`: aceites 1, 2, 3, 4, 6 e o roteador.
- Modify: `docs/testes/mutacao.mjs`: a sabotagem do aceite 8 (tirar a revalidação).

---

### Task 1: a tabela, o roteador e `aplicarAjuste` (TDD)

**Files:**
- Create: `js/mapa-ajuste.js`
- Test: `docs/testes/planta-mapa-ajuste.test.mjs`

**Interfaces:**
- Consumes: `BZOracao.semAcento(texto)`, `BZOracao.achaSemNegar(texto, reGlobal)` (`js/oracao.js`); `BZMapaForma.validarFormaMapa(plano) -> { ok, plano }` (`js/orcamento-mapa-forma.js`); nos testes, `planoDoCaso(chave, saber)` e `CHAVES_DO_MAPA` (`api/_vendas/mapa-padrao.mjs`), `validarPlano(plano, { versoes: ['v3'], regulado })` (`api/_vendas/planta-esquema.mjs`).
- Produces (para os PRs 2 e 3):
  - `BZMapaAjuste.PECAS`: tabela congelada `{ whatsapp, formulario, agendamento, mapa, catalogo, galeria, blog }`, cada uma `{ id, icone, icones[], titulo, frase, rotulo }`.
  - `BZMapaAjuste.rotear(texto) -> { acao: 'entra' | 'sai', peca } | null`: só com UMA peça citada; "sai" quando a peça vem logo depois de tira/remove/sem/"não quero"/"não preciso (de)"; "entra" quando a peça aparece sem negação na oração.
  - `BZMapaAjuste.aplicarAjuste(plano, { acao, peca }) -> { ok: true, plano, mudou: [id] } | { ok: false, motivo: 'invalido' | 'ja_tem' | 'nao_tem' | 'nao_cabe' }`.
    - entra: o nó novo (papel `ajustado`) corta UMA seta (`de -> novo -> para`), tentando primeiro as que chegam ao objetivo; vale a 1ª que a forma aceita.
    - sai: tira o 1º nó da peça com papel `acao`, `conversa`, `volta` ou `ajustado`, liga cada seta que chegava nele a cada destino dele (rótulo da saída, sem laço nem repetida) e revalida.

- [x] Step 1: escrever `docs/testes/planta-mapa-ajuste.test.mjs` (tabela, não-mutação e validade em 8 bases × 3 saberes × 7 peças, travas do servidor regulado ou não, `ja_tem`/`sai`/`nao_tem`, só papéis que podem sair, estouro de 5 camadas e de 2 ajustados, entrada ruim, 14 frases do roteador).
- [x] Step 2: rodar `node --test docs/testes/planta-mapa-ajuste.test.mjs` → FALHOU: `Cannot find module '../../js/mapa-ajuste.js'`.
- [x] Step 3: escrever `js/mapa-ajuste.js` (código no commit deste plano).
- [x] Step 4: rodar de novo → 8/8 passam. Medido (`entra` e `sai` em 8 bases × 3 saberes × 7 peças): entra ok 111, ja_tem 33, nao_cabe 24; sai ok 10, nao_tem 141, nao_cabe 17. Ou seja, 111 de 168 pedidos de "entra" resolvidos no aparelho (meta da spec: ≥ 50%).

### Task 2: a sabotagem do aceite 8

**Files:**
- Modify: `docs/testes/mutacao.mjs` (antes da sabotagem "mapa: a seta pula camada sem exigir a faixa vazia")

- [x] Step 1: acrescentar
```js
  { nome: "mapa vivo, fase 3: o ajuste no aparelho devolve o plano sem revalidar (o rascunho estoura os limites)", fonte: "js/mapa-ajuste.js", testes: ['docs/testes/planta-mapa-ajuste.test.mjs'],
    de: "var v = valido(novo);", para: "var v = novo;" },
```
- [x] Step 2: `BZ_MUTACAO_FILTRO="fase 3: o ajuste" node docs/testes/mutacao.mjs` → `PEGOU` (2 testes caem), `1 de 1 sabotagens pegas`.

### Task 3: suíte, revisões, PR

- [ ] `npm run testar` inteiro; revisão técnica + de segurança por agentes diferentes do autor; PR no molde do #297.

---

## Os PRs seguintes da Fase 3 (fora deste)

- **PR 2, o desenho:** `BZMapa.atualizar(plano, { rascunho: true })` em `js/mapa-desenho.js` (nó a ~34% de opacidade, sem tracejado animado, sem brilho; movimento reduzido = parado). Na tela, `js/mapa-ajuste.js` vem sob demanda junto do leitor do mapa vivo e lê o que ela digita (o mesmo gatilho e o mesmo aviso de privacidade da Fase 1b). No Enter, o nó fica firme com a marca "Ajustado" e o mapa oficial só confirma. Aceite 7 (movimento reduzido) e medição de CLS.
- **PR 3, o servidor:** quando `rotear` dá `null`, a chamada de reação da Fase 1b devolve `ajuste` do mesmo conjunto fechado (conta nas 3 por mensagem e 12 por conversa). O Zero recebe as peças mostradas em rascunho só como dica de texto (`proximoPasso`). Aceite 5: forjar `plano` no corpo da mensagem não muda o gravado. Medição da coincidência entre rascunho e oficial (meta ≥ 85%).
