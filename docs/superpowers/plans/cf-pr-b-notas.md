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

## B5: servidor local pela mesma porta
Vermelho (servidor antigo, sem roteador): `AssertionError: The "string" argument must be of type string. Received type object (null)`
em `assert.match(r404.headers.get('content-type'), /json/)` (o 404 antigo vinha vazio, sem JSON).
Verde: 1 teste novo (sobe `docs/servidor.mjs` numa porta livre; 404 JSON em `/api/_freio`, 405 no PUT, 413 do roteador
com 70 KB em `/api/vendas`, 150 KB em `/api/painel` chega ao handler; cabeçalhos de `/`, `/orcamento`, `/painel` == `_headers`).
Desvios: (1) o teste do painel dá ao servidor filho uma `PAINEL_CHAVE` de teste: sem ela o painel responde 503
("desligado"), não 401; (2) o servidor passa a importar o `rotas.mjs` por `import()` tardio (depois de preparar o
ambiente local); (3) os cabeçalhos das páginas normalizam `/x.html` e `/index.html` para `/x` e `/`, como o
`html_handling` da Cloudflare.
NÃO FEITO, fica para o agendamento (proibido agora: outro agente roda E2E e Chrome): Step 4 do plano, `npm run
e2e:orcamento` com e sem consultor contra o servidor local (agora o E2E atravessa o `rotear`).
próxima tarefa: B6

## Correção achada pela suíte inteira (rodada isolada dos commits B1/B2)
`csp.test.mjs` ("deploy: nada do repositório que não é página nem asset fica no ar") ficou vermelho a partir da B1: a
pasta nova `cloudflare/` (e depois `_headers`, `wrangler.jsonc`) não tinha regra no `vercel.json` nem linha no
`.vercelignore`, ou seja, a prévia da Vercel passaria a servir o código do Worker. Em vez de reescrever os 3 testes
"deploy:" (a Vercel segue no ar até o PR D e eles continuam guardando o `vercel.json`), a correção coerente foi dar às
três entradas novas o mesmo tratamento das outras: linhas no `.vercelignore` e 3 `redirects` no `vercel.json`
(`/cloudflare/:caminho*`, `/wrangler.jsonc`, `/_headers`). No PR D, junto do `vercel.json`, isso some.
Lição: eu só rodava os arquivos de teste novos a cada tarefa; a partir daqui `npm run testar` inteiro (via pasta isolada) a cada commit.
