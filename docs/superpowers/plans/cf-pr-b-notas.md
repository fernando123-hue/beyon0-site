# Notas da execução do PR B (Cloudflare): vermelho visto, desvios, pendências

Base: `cf-pr-b` (de `origin/main` df24808 + plano 60a90d9). Linha de base antes de mexer (Node 24.18, Windows):
suíte `node --test docs/testes/*.test.mjs` = 590 ok, 0 falha; mutação = 39 de 39 sabotagens pegas.
(Aviso: nesta ferramenta, barra invertida dupla em heredoc do Bash vira simples; arquivos com regex foram escritos
pela ferramenta Write.)

## B1: tabela de rotas
Vermelho:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\cloudflare\rotas.mjs' imported from ...\docs\testes\worker.test.mjs
```
Verde: 10 testes. próxima tarefa: B2

## B2: agenda (crons) e leitor de JSONC
Vermelho 1 (leitor de JSONC inexistente): `ERR_MODULE_NOT_FOUND ... cloudflare\jsonc.mjs`.
Vermelho 2 (com `agendar` vazio): `✖ crons: reconciliar de 3 em 3 h e a diária ...` e `✖ a AGENDA tem só as duas rotinas`.
Verde: 14 testes em `worker.test.mjs`.
Desvio: o 3º teste do plano (crons do `wrangler.jsonc` == chaves da AGENDA) vai junto da B6, que cria o arquivo
(o plano já dizia "depois do B6"); assim nenhum commit fica vermelho. próxima tarefa: B3

## B3: assets por lista de permissão
Vermelho: `ERR_MODULE_NOT_FOUND ... cloudflare\montar-publico.mjs imported from ...\docs\testes\publico.test.mjs`.
Verde: paridade com a Vercel nos dois sentidos (93 arquivos em `publico/`) e a lista de "nunca sobe".
Desvios: (1) o `assert` de que `_headers` está na saída foi para a B4 (o arquivo só nasce lá);
(2) os 3 testes "deploy:" do `csp.test.mjs` NÃO foram reescritos: a Vercel continua no ar até o PR D e eles ainda
protegem o `vercel.json`; a garantia equivalente da Cloudflare é a paridade deste teste e os testes da B4.
próxima tarefa: B4

## B4: `_headers`
Vermelho: `ERR_MODULE_NOT_FOUND ... cloudflare\cabecalhos.mjs imported from ...\docs\testes\cabecalhos.test.mjs`.
Verde: 7 testes novos (leitor, soma de valores, uma CSP por caminho, `<meta>` == CSP do `_headers` em todas as páginas
da saída do `montar-publico`, `/orcamento` sem Google, `/painel` noindex+no-store, formato, paridade com o `vercel.json`
em 10 caminhos) + o `assert` de que `_headers` sobe.
Desvios: (1) testes num arquivo novo `docs/testes/cabecalhos.test.mjs` em vez de dentro do `csp.test.mjs` (que segue
guardando o `vercel.json` até o PR D); (2) `/painel` usa `X-Robots-Tag: noindex, nofollow`, o valor real do `vercel.json`
(o plano dizia `noindex`); (3) o caminho das fontes é `/assets/fonts/` (não `fontes`).
Ensaio do P8 (não dá para fazer aqui): confirmar na prévia que `! Content-Security-Policy` + novo valor dá UMA CSP em
`/orcamento` e `/painel` (`curl -sI`) e que o `Cache-Control` das fontes/vendor não vira soma com o padrão dos assets.
próxima tarefa: B5
