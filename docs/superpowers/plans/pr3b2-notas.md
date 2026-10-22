# PR 3b-2: notas da execução (modo leve)

Branch `pr3b2` (parte de `pr3b1`, que parte do PR #49). Base: `aff2146`. Modo leve: só `node --test <arquivo da tarefa>`;
suíte e mutação rodam uma vez no fim; nada de E2E, `verificar`, `acessibilidade`, `olhar`, servidor ou Chrome (Task 19 PENDENTE).

## Task 1: base (sem commit)

- Base `aff2146`; `node_modules` é junção; `pglite ok`.
- 3b-1 presente: `BZPix` em `js/orcamento.js:556`; "Quando fica pronto?" em `orcamento.html:471`; `AINDA_NAO` em
  `pagar-sem-medo.test.mjs:46`; última migration `20261022120000_pr3b1_entrada.sql` (as `20261023…` do plano seguem valendo).
- Testes que listam `ACOES`: `ajustes-api.test.mjs`, `opcoes.test.mjs` (Tasks 8 a 10 atualizam).
- "Sim" do dono (3b D1 a D6, 21/10) em `01 Empresa/Decisões.md` linhas 26 a 31. Captação (só leitura) presente.
- Linha de base da suíte: 585 testes (notas do 3b-1); a suíte inteira roda no fim.

## Task 2: esquema do material e bytes

- Vermelho visto: `Cannot find module '.../js/orcamento-material-esquema.js'` (módulo tirado do lugar; testes escritos junto).
- Verde: material-esquema 10/10; captacao-igual 4/4 (rodaram contra a pasta da captação, não pularam).

## Andamento

próxima tarefa: 3
