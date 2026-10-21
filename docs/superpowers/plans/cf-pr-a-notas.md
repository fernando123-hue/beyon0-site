# Notas do PR A (Cloudflare) — execução

próxima tarefa: A5

Linha de base (antes de mexer): `testar` = 544 testes, 0 falhas; `testar:mutacao` = 34 de 34 sabotagens pegas.

## Desvios do plano e observações
- A0: no checkout real o trecho está nas linhas 67-68 do `docs/fundacao/03-STATUS.md` (o plano diz 68-69); mesma troca de texto.

## Falhas vistas (teste vermelho)
- A1 vermelho: `node --test docs/testes/ambiente.test.mjs` → `ERR_MODULE_NOT_FOUND: Cannot find module '…\api\_ambiente.mjs'`. Verde: 5 testes; suíte 549/549.
- A2 vermelho: `node --test docs/testes/ambiente.test.mjs docs/testes/pedido.test.mjs` → 5 falhas, 26 → 21 passam: Turnstile `exigido: false` ("sem chaves: fecha"), pagamento `actual: false`, IA simulada/`banco` em memória ligados, e o teste estático listando exatamente `agente.mjs: modoDirecoes()`, `fluxo-pedido.mjs: chaveDoTelefone com 2 argumentos`, `fluxo-pedido.mjs: naVercel()`, `fluxo.mjs: modoDirecoes()`. O novo `assert` de `chaveDoTelefone(..., undefined)` sem env em `pedido.test.mjs` já passava (sem segredo e sem env = null também antes, porque o teste roda sem `BZ_LOCAL` em `process.env`); ele fica como regressão.
- A2 desvio (teste antigo): `docs/testes/detalhes-api.test.mjs` simulava a produção com `process.env.VERCEL_ENV = 'production'` (2 testes de "fecha com 503"). O código não lê mais `process.env` (esse é o objetivo da A2), então o `env` do pedido ficou `{}` = local e a trava abria. Os dois testes agora passam `env: { VERCEL_ENV: 'production' }` pelo `deps` (`navegador(ip, { env })`); expectativas intactas. Foi a única mudança de teste antigo; suíte 554/554.
- A2 detalhe: o `README`/comentário de cabeçalho de `api/_pagamentos/config.mjs` ainda fala "na Vercel" (a regra vale agora para qualquer produção/prévia); mensagens de `motivo` mudaram para "produção exige…" / "prévia exige…" / "credencial de produção fora da produção" (nenhum teste conferia o texto antigo).
- A3 vermelho: `node --test docs/testes/ambiente.test.mjs` → `AssertionError … + 'BZ_DIRECOES', + 'TURNSTILE_SECRET', + 'TURNSTILE_SITE_KEY'` (o `BZ_AMBIENTE` e o `MP_METODOS` não aparecem porque nenhum código os lê como `env.X` ainda: o primeiro é lido como `e.BZ_AMBIENTE` em `_ambiente.mjs`, o segundo entra na A7; o `.env.example` já os traz, como o plano manda). `.env.example` não foi barrado pelo guarda.
- A4: refatoração sem teste novo (como o plano manda); `pagamentos.test` + `api.test` 33/33 e suíte 554/554.
