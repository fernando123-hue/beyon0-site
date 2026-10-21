# PR 3b-1: notas da execução

Branch `pr3b1` (= `pr3b-desenho` + merge de `cf-pr-a`, PR #49). Base: `ecea062`.

## Task 1: conferência da A7 (sem commit próprio; entra com o da Task 2)

- A7 vem do PR #49 (`cf-pr-a`), ainda não está na `origin/main` (`28d8de8`): **conferir na main antes do PR do 3b-1**.
- Os quatro: `metodosDe` em `api/_pagamentos/config.mjs:26`, `metodos:` (`:40`, `:64`, `:70`), `id="o-pag-metodos"` em
  `orcamento.html:381`, `docs/e2e-pix.mjs` presente.
- Extras: teste `não está disponível` em `docs/testes/pagamentos.test.mjs:447`; sabotagem "cartão aceito com só Pix (o
  servidor)" em `docs/testes/mutacao.mjs:110`; consultor: `Pix ou cartão` só dentro da condicional de `cfg.metodos`
  (`api/_vendas/consultor.mjs:59`). `promessa.mjs` e `servico.mjs` não têm mais "Pix ou cartão" (sem aviso a dar).
- `node --test docs/testes/pagamentos.test.mjs`: 22 de 22 passam.
- "Sim" do dono: `01 Empresa/Decisões.md` linhas 16 a 21 (3b D6, D4, D1, D5, D2, D3, todas de 21/10, "Valendo").
- Desvio do plano: `docs/e2e-pix.mjs` já tem `forcar = () => {}` e `cartaoDesligado(page, ok, forcar)` (bandeira
  `falhaForcada` do PR A); a parte da Task 5 que "passa `forcar`" já está feita, só se usa.
- Linha de base (antes de qualquer mudança): suíte 569 testes, 569 passam (2 min 30 s).

## Task 2: banco, a entrada sem o 50

- Vermelho visto: `vendas-banco.test.mjs`, teste "proposta sem percentual": `AssertionError: null: recusado com 23514 (null)` (com
  `null` o `coalesce` cobrava 1500). Servidor: `pagamentos.test.mjs`, "entrada sem percentual": o erro subia cru
  (`e.status` indefinido, "Received false" na função de validação).
- Verde: vendas-banco + pagamentos-banco 23 de 23; pagamentos 23 de 23; mutacao.test 3 de 3. `diff` da migration contra
  `20261007130000_pagamentos.sql:219-272`: só o `create or replace` e o bloco `(PR 3b-1)`.
- Suíte: 572 testes, 572 passam (eram 569). Sabotagem nova "entrada sem percentual cobra assim mesmo" na lista.
- A mutação não roda com `servico.mjs` sujo (ele é "fonte" de outra sabotagem): rodada depois do commit (ver abaixo).
- **Dono:** aplicar `supabase/migrations/20261022120000_pr3b1_entrada.sql` no Supabase real (só o arquivo e os testes PGlite aqui).

- Mutação depois do commit da Task 2: 39 de 39 pegas (a nova, "entrada sem percentual cobra assim mesmo", pegou).

## Task 3: rascunho a 40%

- Vermelho visto: `precos.test.mjs`, "rascunho: a entrada é 40%": `50 !== 40`.
- Números trocados (todos com a conta): `alteracoes.test.mjs:69` ('40% para começar', '2.400,00'); `precos.test.mjs` 46 (900 → 720),
  48 (3000 → 2400), 127 (2400 → 1920); `fluxo-api.test.mjs:76` (2175 → 1740, "40%"); `pagamentos.test.mjs` comentário :33,
  :150 e :314 (2175 → 1740).
- **Um oitavo ponto que o plano não listava:** `precos.test.mjs:67`, `assert.equal(e.sinal, e.valor_total / 2)` (falhou com
  `2700 !== 3375`); agora usa a conta do motor com `REGRAS.sinal_percentual` (sem 50 ou 40 à mão).
- `docs/fase2/REGRAS-RASCUNHO.md`: "Sinal: 50%" e a pergunta ao dono passaram a 40%.
- **Citação de linha de Decisões.md:** o arquivo ganhou linhas (as de 3b D1-D6 e outras), então ":25" e ":22" do plano estão
  velhas (a decisão de 40% está hoje na linha 41, "O site vende sozinho", "1 D - Sim"; o nome do Pix na 38). No JSON e no teste
  novo citei pela data e pelo título, sem número de linha. Os testes da Task 5 que citam ":22" no comentário: também por título.
- Suíte: 573 testes, 573 passam.

## Task 4: a tela lê a entrada da proposta (BZPix)

- Vermelho visto: `orcamento-pix.test.mjs` → `ENOENT … js/orcamento-pix.js` (4 testes caídos antes do módulo).
- Verde: orcamento-pix + csp 13 de 13; suíte 577 testes, 577 passam.
- E2E (servidor padrão, sem consultor, porta 8891): 246 OK, nenhuma FALHA. As 3 linhas novas OK ("sem percentual: não cobra",
  "nenhum percentual inventado", "a entrada de 40%"). **Chamadas a /api/vendas no trecho "sem percentual": 6** (2 recargas),
  e o 61 s de espera depois dele; nenhum 429.
- Vermelho do E2E: não foi visto contra o código antigo (o unitário já cobre o 50; o E2E só confirma a tela). A condição de
  `if (arguments.length > 1)` é conferida na Task 5 (E2E da configuração que falha).
- O `pagamento()` do código real era diferente do texto "antes" do plano (já não tinha `#o-pag-indisponivel` no `pagamento()`;
  o aviso vem de `tela.mostrar` quando `!c.ativo`): troquei as linhas pelas do plano, que também escondem o formulário.
- Arquivos do repositório estão em CRLF no disco (autocrlf): as edições preservam o fim de linha.

## Task 5: a tela do Pix na ordem nova

- Vermelho visto: `pagar-sem-medo.test.mjs`, os 2 testes caídos (o nome não estava na tela; `o-pix-valor@-1`). E2E antes
  de mexer na tela: `FALHA exceção: page.textContent: Timeout 30000ms exceeded … waiting for locator('#o-pix-valor')`.
  Vermelho da configuração que falha: sem o `if (arguments.length > 1)`, `FALHA configuração que falhou e voltou
  (configDeNovo): o percentual continua na linha do Pix`; restaurado.
- Verde: E2E servidor padrão sem consultor, 261 OK, 0 FALHA; E2E com `MP_METODOS=pix`, 260 OK, 0 FALHA; suíte 579/579.
- PNG abertos e vistos: `4-pix-cel`, `4-pix-so-pix-cel`, `4-pix-so-pix-320` (valor e nome legíveis, botão inteiro, nada
  saindo da tela; o QR aparece aberto porque o E2E já apertou Enter no "Pagar por outro aparelho" antes da foto).
- Desvios do plano (menores, o plano divergia do código real):
  1. `dinheiro()` da página usa `minimumFractionDigits: 0` ("R$ 1.840", sem ",00"): a regex do E2E do valor passou a
     `/^R\$\s?[\d.]+(,\d{2})? · 40% do total, por Pix$/`.
  2. O erro de rede que o E2E provoca na configuração (`route.abort`) aparece no console como `net::ERR_FAILED`: o filtro de
     `falhaForcada` em `docs/e2e-orcamento.mjs` (linha do `page.on('console'…)`) ganhou `|ERR_FAILED`. Mexe em uma linha
     além da chamada do `passoDoPix`.
  3. A `textarea` do código ficou com `rows="4"` (era 3): a 320 px o código do E2E ocupava 4 linhas e a última ficava cortada.
  4. A asserção "nenhum percentual inventado" da Task 4 estava com a regex errada no arquivo (`d+s?%`, passava à toa, por um
     erro meu ao gravar a barra invertida); corrigida para `/\d+\s?%/` e o E2E continua verde. As outras regexes foram
     conferidas.
  5. Comentários do teste e do HTML citam a decisão do nome do Pix pelo título em Decisões.md, não pelo número de linha (":22"
     já não é a linha).
- Revisor: o texto do status ("Esperando o pagamento…") continua no estilo mono pequeno de `.orc-pag-status` (é o de antes;
  a Task 5 não manda mudar). Vale olhar se o dono quer esse texto em 16 px.

## Andamento

próxima tarefa: 6
