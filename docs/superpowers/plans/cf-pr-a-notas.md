# Notas do PR A (Cloudflare) — execução

próxima tarefa: A2

Linha de base (antes de mexer): `testar` = 544 testes, 0 falhas; `testar:mutacao` = 34 de 34 sabotagens pegas.

## Desvios do plano e observações
- A0: no checkout real o trecho está nas linhas 67-68 do `docs/fundacao/03-STATUS.md` (o plano diz 68-69); mesma troca de texto.

## Falhas vistas (teste vermelho)
- A1 vermelho: `node --test docs/testes/ambiente.test.mjs` → `ERR_MODULE_NOT_FOUND: Cannot find module '…\api\_ambiente.mjs'`. Verde: 5 testes; suíte 549/549.
