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

## B6: `wrangler.jsonc` e `package.json`
Vermelho: `Error: ENOENT: no such file or directory, open '...\wrangler.jsonc'` nos 3 testes novos (crons, produção
fechada/prévia declarada, scripts e lock).
Verde: `worker.test.mjs` com 18 testes. `npm install wrangler@4.136.3 --save-dev --save-exact --ignore-scripts` (versão do plano;
não troquei por uma mais nova: o dono mandou fixar 4.136.3). O schema instalado (`config-schema.json` 4.136.3) tem
`previews` e `preview_urls` em `RawEnvironment`.
Dry-run (sem login, sem publicar): `wrangler deploy --dry-run --outdir .wrangler/saida` e `... --env previa --outdir
.wrangler/saida-previa` passam; Total Upload 1047,69 KiB / gzip 211,55 KiB; a prévia sai como Worker
`beyon-zero-site-previa`, vars de prévia, sem rota nem domínio. Aviso do Wrangler no deploy do topo: "Multiple environments
... no target environment" (só aviso; o Deploy command do P9 pode levar `--env=""` (topo explícito) se o dono preferir
silenciar; é decisão do P9, não mexi).
Observações: (1) o `npm install` avisa "4 high severity vulnerabilities" nas dependências transitivas do Wrangler (devDependency;
o CI audita só `--omit=dev`); (2) o script `cpu:rotas` aponta para `docs/cpu-rotas.mjs`, que é da M1 e NÃO está na base
deste PR (a M1 não foi mesclada na `origin/main`): o script existe no `package.json` como manda o plano e falha até a M1 entrar.
próxima tarefa: B7

## B7: fumaça no workerd (rodada local feita; o job "Worker" roda no CI)
`docs/worker-fumaca.mjs` + job `worker` no `ci.yml` (`permissions: contents: read`, `npm ci --ignore-scripts`, `npm run cf:fumaca`).
Local (Windows, sem login e sem publicar): TUDO passa: dry-run de produção e de prévia (prévia sem rota nem domínio),
`/orcamento` 200 com UMA CSP, `/orcamento.html` 307, `/docs/PROCESSO.md`, `/_headers`, `/publico/index.html`,
`/wrangler.jsonc`, `/api/_freio` 404, `sessao-config` fechado, POST de 70 KB 413, o freio por `cf-connecting-ip` (2º lote
com outro `x-forwarded-for` dá 429), o cron `41 6 * * *` disparado à mão loga "rotina desligada" (caminho
`/cdn-cgi/handler/scheduled` no 4.136.3), `check startup` ativo 79,4 ms (janela 358 ms) contra o limite de 400 ms.
ACHADO IMPORTANTE: o workerd embutido no Wrangler 4.136.3 só aceita `compatibility_date` até 2026-09-28; o `wrangler.jsonc`
pede 2026-10-21 (o plano manda). A produção real aceita a data; só o ensaio LOCAL (`wrangler dev --local` e `check startup`)
falha com "This Worker requires compatibility date ... newest ... 2026-09-28". Adaptação mínima: a fumaça repete com a data
máxima que o workerd diz aceitar (`--compatibility-date` só na linha de comando; o arquivo não muda) e imprime AVISO.
Decisão que fica para o dono/revisor: subir o Wrangler para uma versão cujo workerd aceite 2026-10-21 (o plano já previa
rever a versão antes do PR B; a 4.151.3 aparece como disponível), o que faria o desvio deixar de ser usado. Não troquei,
porque o dono mandou fixar 4.136.3.
Vermelho (Step 2): com `run_worker_first: []` o dry-run é recusado pelo Wrangler (3 falhas); com `run_worker_first: false` a
fumaça fica vermelha (1 falha: o log do cron). O `[]` do plano não chega a produzir o "sessao-config sem JSON" descrito;
vale como prova de que a fumaça pega o desvio, por outro caminho.
Pendência de CI: confirmar no 1º run do job que `wrangler check startup` não pede login/token no runner (aqui não pediu).
próxima tarefa: B8

## B8: trava anti-publicação e níveis
Vermelho 1: `ERR_MODULE_NOT_FOUND ... scripts\processo\anti-publicacao.mjs imported from ...\docs\testes\anti-publicacao.test.mjs`.
Vermelho 2 (níveis, antes da regra nova): `níveis: wrangler.jsonc, _headers, cloudflare/ ... actual: 2, expected: 3`
(`cloudflare/*.mjs` caía na regra "comportamento da página", nível 2).
Verde: 8 testes (workflow com escrita; comandos de publicação, versão e segredo; `package.json` com script de instalação;
`wrangler.jsonc` com `build`; exceções só dos 3 `.md`; um `.mjs`/`.yml` em `docs/superpowers/plans/` é achado; o repositório
real passa limpo; níveis). Os termos proibidos são montados por partes no verificador e no teste.
O verificador é AUTÔNOMO (sem import do repositório, leitor de JSONC embutido) porque o dono o copia para o guarda.
A própria trava acusou, na primeira rodada, a minha nota da B6 (que citava o comando de deploy por extenso): corrigi o texto.
Exceção a lembrar: as notas deste PR (`cf-pr-b-notas.md`) NÃO são exceção; não escrever esses comandos por extenso aqui.
Ensaio: `node scripts/processo/anti-publicacao.mjs` no repositório = "limpo", saída 0.
P2 (do dono, NÃO feito por mim): copiar `scripts/processo/anti-publicacao.mjs` do PR B para `~/.claude/guarda/anti-publicacao.mjs`
e fazer o guarda rodá-lo (`node ~/.claude/guarda/anti-publicacao.mjs <pasta da árvore a empurrar>`) antes de todo `git push`,
mais a confirmação do dono no push de mudanças em workflows, `cloudflare/`, `wrangler.jsonc` e `package*.json` (§ 5.5 do plano).
Nada em `~/.claude/` foi tocado.
próxima tarefa: B9

## B9: os scripts alcançam o staging atrás do Access (só o que roda sem rede)
Vermelho: `ERR_MODULE_NOT_FOUND ... docs\acesso.mjs imported from ...\docs\testes\worker.test.mjs`; depois, para o Playwright,
`SyntaxError: The requested module '../../docs/acesso.mjs' does not provide an export named 'autorizarContexto'`.
Verde: 4 testes novos (cabeçalhos só com as duas variáveis e BASE de prévia; `{}` para produção, domínio, local, host
parecido, `http:`, usuário/senha na URL; só uma variável; rota por origem no Playwright). `worker.test.mjs` = 22 testes.
Desvio de segurança: o plano diz que o Playwright usa `extraHTTPHeaders`; isso mandaria o token do Access também aos
terceiros que a página chama (Turnstile, Mercado Pago, Google). Em vez disso `autorizarContexto(ctx, BASE)` registra
`ctx.route(<origem do staging>/**)` e só ali soma os 2 cabeçalhos. Ligado em `docs/verificar.mjs` (2 contextos) e
`docs/acessibilidade.mjs` (4); `scripts/direcoes.mjs` soma os cabeçalhos ao pedido do painel (só vão se BZ_BASE for o staging).
O token é lido de `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (o dono os põe no arquivo local do vigia, P3/§ 5.4).
NÃO FEITO: `docs/cpu-rotas.mjs` (a bancada da M1) NÃO existe nesta base (a M1 não foi mesclada); quando entrar, basta
chamar `cabecalhosDeAcesso(process.env, BASE)` nos `fetch` dele (`--remoto`). O `validarBase` de `scripts/direcoes.mjs`
ainda só aceita o site antigo e o servidor local: aceitar o endereço do staging é a C3 (não é B).
NÃO FEITO e depende do dono (staging no ar): P3–P8, a M2, o ensaio de Access/Bypass, a CSP única no `curl -sI`, a regra de
10 pedidos/10 s, o A4 no Supabase staging, o formato real da URL de prévia (a expressão `HOST_DE_PREVIA` de `docs/acesso.mjs`
assume `[<prévia>-]beyon-zero-site-previa.<SUB_CONTA>.workers.dev`: conferir na M2).
