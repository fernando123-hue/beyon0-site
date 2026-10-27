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

---

# Correções da revisão do PR B (22/10/2026): vermelho visto, verde, pendências

Revisão: "APROVAR COM CORREÇÕES" (agente diferente do autor, nível 3). Um commit por correção; o vermelho de cada uma foi
visto antes do verde. (Escrito sem os comandos por extenso: estas notas passam pela trava anti-publicação.)
Avisos da ferramenta: nos scripts de edição, barra invertida dupla em heredoc do Bash vira simples (os scripts com regex
foram escritos pela ferramenta Write); e o `worker.test.mjs` estava com fim de linha CRLF na árvore (os scripts de edição
normalizam para LF; o Git guarda LF).

## ALTO-1: o token do Access só vai ao staging da conta do dono (`docs/acesso.mjs`)
Vermelho: `SyntaxError: The requested module '../../docs/acesso.mjs' does not provide an export named 'SUB_CONTA'`.
Verde: 24 testes em `worker.test.mjs`. A constante `SUB_CONTA` (exportada, `null` até o dono informar, P3) monta o host
`beyon-zero-site-previa.<SUB_CONTA>.workers.dev`; a prévia de branch é `<branch>-` + esse host. Comparação EXATA de nome
(não mais expressão). Com `SUB_CONTA = null` (ou subdomínio inválido) o token não vai a host nenhum. As funções ganharam um
parâmetro `sub` (padrão `SUB_CONTA`) para os testes usarem um subdomínio de teste (`irineu`). Testes novos: outra conta
(`atacante`, `irineu2`, `xirineu`, o `sub-conta` que o teste antigo aceitava) devolve `{}`; a conta certa devolve os 2
cabeçalhos; `null` e subdomínios inválidos devolvem `{}`; porta recusada.
Commit f390677.

## ALTO-2: a trava anti-publicação (`scripts/processo/anti-publicacao.mjs`)
Vermelhos (5 testes novos, um por grupo de formas): o deploy com @versão no meio não era achado; o deploy em lista de
argumentos (spawn de npx com a lista do Wrangler) não era achado; o push da branch de produção no fim da linha não era
achado; a action oficial do Wrangler num workflow não era achada; `env.previa.name` no `wrangler.jsonc` não era achado.
Verde: 13 testes em `anti-publicacao.test.mjs`. Formas cobertas (um teste por forma, com os casos que DEVEM passar ao
lado, como o dry-run ligado, o push de outra branch e o workflow só de leitura): Wrangler com `@versão`, opção antes do
subcomando, `--dry-run=false` / `--dry-run false` / `--no-dry-run`, `delete`, `preview`, `publish`, `pages deploy`,
`versions deploy|upload|secret`, `secret put|bulk|delete`, `rollback`, `triggers deploy`, o `wrangler.js` do
node_modules, dois comandos na mesma linha (`&&`, `;`, `|`), lista de argumentos (inclusive quebrada em várias linhas);
push da branch de produção em qualquer posição, todas as branches, espelho, em lista de argumentos; workflow com
`wrangler-action`, qualquer `uses: cloudflare/`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, qualquer
`<escopo>: write` (também em linha e no job), `write-all` e SEM `permissions:` no topo; `wrangler.jsonc` com `build` em
qualquer lugar, `workers_dev` / `preview_urls` diferentes de `false` no topo, `routes` / `route` / `account_id` no topo, e
`name` / `route` / `account_id` / `routes` não vazio dentro de `env.*`. A varredura no repositório continua "limpo" (o
teste do repositório real e o comando da trava). Continua autônoma (sem import) para o P2.
Atenção para o PR C: quando o domínio entrar, o `routes` do topo passa a existir e a trava (regra do topo) acusa; ajustar a
regra no mesmo PR, de propósito.
Commit 5008aa5.

## MÉDIO-1: data de compatibilidade
Mantido o Wrangler 4.136.3 (fixado pelo dono, workerd 1.20260921.1); `compatibility_date` do `wrangler.jsonc` baixou para
`2026-09-28`. A troca automática de data saiu da fumaça (`DATA_RECUSADA`, `--compatibility-date`, `dataLocal`): data
recusada pelo workerd agora é falha. Vermelho: `AssertionError: a data que o workerd do Wrangler fixado (4.136.3) aceita...`
e `AssertionError: data recusada pelo workerd tem de falhar, não repetir com outra data`. Verde: 25 testes.
Achado de passagem: na primeira rodada da fumaça sem o atalho, o log do cron não apareceu em 1,5 s (a máquina estava
carregada, 4 min de rodada); a espera virou tentativas de 0,5 s por até 10 s.
Commit 99be57b. Subir o Wrangler fica para um PR próprio, a partir de ~03/11 (14 dias depois da versão escolhida).

## MÉDIO-3: a fumaça prova no workerd o que antes só o leitor local provava
Acrescentado à fumaça: `/painel` com UMA CSP e sem Google, `x-robots-tag` com `noindex`, `cache-control: no-store`; fonte
real (`/assets/fonts/sora-latin.woff2`) com UM `Cache-Control` (`public, max-age=31536000, immutable`, sem soma com o padrão
dos assets); `/orcament%6F` redireciona para `/orcamento` ou sai com a CSP do orçamento (nunca a geral).
Vermelho (sabotando o `_headers` na pasta de trabalho por alguns segundos, só para a fumaça copiar; depois restaurado, o
`git diff` do `_headers` ficou vazio): `FALHOU /painel 200 com UMA CSP, sem Google` e
`FALHOU fonte com UM cache-control` (veio `public, max-age=60`). Verde: ver "Resultado final" abaixo.
Commit 8c74bd6.

## M4: hosts do `scripts/direcoes.mjs`
Vermelho: `Got unwanted exception: https://beyonzero.com.br` e `TypeError: hostsPermitidos is not a function`.
Agora lista de NOMES EXATOS: `beyonzero.com.br`, o staging montado com o `SUB_CONTA` (nada enquanto `null`) e
`beyon0-site.vercel.app` SÓ enquanto existir o `vercel.json` (o teste liga os dois: se o `vercel.json` não existe,
nenhum host `vercel.app` na lista; o PR D, que apaga o `vercel.json`, fica vermelho até o host sair). Prévias de branch
(da Cloudflare e da Vercel) saíram, e a expressão `beyon0-site-*-beyond0.vercel.app` também. Porta e usuário/senha na
URL são recusados. Funções exportadas: `hostsPermitidos(sub)`, `validarBase(valor, sub)`. Os testes de aceitar e recusar
do relatório estão em `fila-direcoes.test.mjs`. A nota antiga da B9 ("aceitar o staging é a C3, não é B") está superada:
aceitar o staging agora é este commit (a chave só vai quando o dono informar o `SUB_CONTA`).
Commit 75bb73a.

## BAIXOs de código (um commit só, 2112246)
Vermelhos: `Error: cliente cortou` (a rejeição saía crua do roteador); a lista de cabeçalhos entregue ao handler ainda
tinha `x-vercel-id`, `x-vercel-ip-country`, `x-real-ip`, `true-client-ip` e `forwarded`; `Error: continue segue o
redirecionamento com o token` (o teste novo do Playwright exige busca sem seguir redirecionamento); `cpu:rotas →
docs/cpu-rotas.mjs não existe`. Verde: 28 testes em `worker.test.mjs`.
- BAIXO-1: corpo e cabeçalhos de IP dentro do `try` do roteador (500 genérico com `x-request-id`).
- BAIXO-2: na Cloudflare, apaga todo `x-vercel-*`, `x-real-ip`, `true-client-ip`, `forwarded`.
- BAIXO-5: `autorizarContexto` usa busca com `maxRedirects: 0` + entrega da resposta, em vez de `route.continue`.
  Conferido num Chromium real (servidor local A redireciona para o servidor B): A recebeu o token, B não.
- BAIXO-3: comentários do `wrangler.jsonc` e a mensagem do teste falam de "uma conta, dois Workers".
- BAIXO-6: saiu o script `cpu:rotas` do `package.json` (o arquivo é da M1 e não existe nesta base; volta com a M1) e um
  teste novo confere que todo script com arquivo node aponta para arquivo que existe.
- BAIXO-4 (`npm audit` de desenvolvimento): SÓ REGISTRADO. 4 avisos altos, todos transitivos do Wrangler (`undici` 7.0.0
  a 7.29.0 e o `miniflare`/`wrangler` que dependem dele; a correção do `npm audit` pede o Wrangler 4.152.0). Rever na
  troca de versão do Wrangler (PR próprio, ~03/11).

## O que NÃO foi feito, de propósito
- M6 (`blob:` e Supabase no `_headers`): fica para quando o 3b-2 entrar na `main`. Regra: quem mesclar por segundo
  sincroniza o `_headers` com a string do `vercel.json`, sem mudar um caractere; trocar o curinga `*.supabase.co` pelo host
  exato quando o dono informar o projeto, nos três lugares num commit só.
- MÉDIO-2 (HSTS): é da zona. Pendência do dono antes do PR C (ligar o domínio): SSL/TLS, Edge Certificates, HSTS, mais
  "Always Use HTTPS"; ou o cabeçalho no `/*` do `_headers` com exceção explícita no teste de paridade.

## Pendências do dono (atualizadas)
1. P1: GitHub, Settings, Actions, General, Workflow permissions = Read repository contents.
2. P2: aprovar a confirmação no push e o `deny` de escrita do `gh api`; copiar `anti-publicacao.mjs` (já corrigido) para
   `~/.claude/guarda/` SÓ depois de este PR ser mesclado.
3. P3: anotar o subdomínio `workers.dev` da conta e escrevê-lo na constante `SUB_CONTA` de `docs/acesso.mjs` (hoje `null`).
   Até lá o staging fica fechado para o token do Access e para a chave do painel. Token do Builds com o mínimo
   (Workers Scripts: Edit + Account Settings: Read).
4. Builds (P9): Worker de produção com branch `producao` e "Enable Preview Builds" desligado. Worker `beyon-zero-site-previa`:
   a `main` publica com o ambiente de prévia (`--env previa`); as outras branches usam o comando de prévia do Builds. O
   comando padrão dele (o de enviar versão, SEM `--env`) mandaria versões para o Worker de PRODUÇÃO: no painel do Builds,
   o comando de prévia precisa levar `--env previa`.
5. Access no `beyon-zero-site-previa`: "All traffic"; service token "agente-previas" com política Service Auth; Bypass só em
   `/api/pagamentos` do host fixo do staging.
6. P8 (staging no ar): `curl -sI` em `/orcamento`, `/painel` (uma CSP) e nas fontes (um `Cache-Control`; a fumaça já prova no
   workerd, mas o ensaio no staging real fecha); formato real da URL de prévia (confere o `SUB_CONTA` e a forma
   `<branch>-beyon-zero-site-previa`); a regra de 10 pedidos em 10 s; o A4.
7. Data de compatibilidade: confirmar a recomendação (Wrangler 4.136.3 com 2026-09-28). Subir o Wrangler num PR próprio
   depois de ~03/11 (resolve também o `npm audit` de desenvolvimento).
8. Antes do PR C (domínio): HSTS na zona (MÉDIO-2) e ajustar a regra de `routes` do topo na trava anti-publicação.
9. M6: informar o endereço exato do projeto Supabase de produção.
10. PR D (apagar o projeto da Vercel): o teste do M4 obriga tirar `beyon0-site.vercel.app` do `direcoes.mjs` no mesmo PR.
    Não apagar o projeto antes do PR D estar mesclado.
11. Rever o R4a depois da 1ª venda: 2ª conta ou GitHub Pro (ruleset na `producao`).

---

# Fechamento: merge da main (36a790f, com o 3b-2) e números finais

Merge `origin/main` na `cf-pr-b` (1ddb451). Dois conflitos, os dois de texto:
- `package.json`: a lista do `testar`. Resolvi com a lista da main inteira mais os 4 testes da Cloudflare
  (`worker`, `publico`, `cabecalhos`, `anti-publicacao`). Os outros 18 arquivos novos da main (material, prazo, link do
  pedido, entrega, armazém etc.) entram sozinhos.
- `docs/servidor.mjs`: mantive a rota `/_armazem-local/` da main e a `api(req, res)` pelo roteador do Worker (sem o terceiro
  argumento `pathname` que a main passava, porque o roteador já lê a URL do pedido).
- `vercel.json` e `.env.example` mesclaram sozinhos. (Os 4 testes novos entram na lista; antes eram 629 ok e 39/39.)

## M6 feito (2b59795)
O `/orcamento` do `_headers` agora tem `img-src 'self' data: blob:` e o `connect-src` com
`https://*.supabase.co/storage/v1/object/upload/sign/`, a mesma string do `vercel.json`. `cabecalhos.test.mjs` (paridade
com o `vercel.json` e `<meta>` == `_headers`): 7 de 7. Troca do curinga pelo host exato do Supabase: quando o dono informar,
nos três lugares (`vercel.json`, `_headers`, `<meta>` de `orcamento.html`) num commit só.

## Achado do merge: a fumaça do Worker
A main nova faz `api/_material/pacote.mjs` e `api/_vendas/fluxo-material.mjs` importarem `js/orcamento-material-esquema.js`
(fora de `api/`). A cópia temporária da fumaça não levava esse arquivo e o empacotamento falhava ("Could not resolve", as 3
etapas dry-run/execução vermelhas). No repositório real o caminho resolve; o erro era só da cópia. Corrigi: a fumaça copia
`js/orcamento-material-esquema.js`. Cuidado no futuro: todo arquivo de fora de `api/` que a API importar tem de entrar nessa
cópia (e o Worker o empacota; o deploy parte da raiz do repositório, então não há problema lá).

## Números finais (Node 24.18, Windows)
- Suíte inteira (`testar` do `package.json`, `node --test`): 829 testes, 828 ok, 0 falha, 1 pulado (antes: 629 ok na base velha).
- Mutação (`node docs/testes/mutacao.mjs`): 59 de 59 sabotagens pegas (antes: 39 de 39).
- Fumaça local do Worker (`cf:fumaca`, workerd 4.136.3, sem login e sem publicar): "fumaça ok"; inicialização ativa 215 ms
  (janela 516 ms; limite 400 ms; a máquina estava carregada pela mutação rodando ao lado).
- Varredura anti-publicação no repositório: limpa (o teste "o repositório real passa limpo" está na suíte).

## Pendências do dono (resumo final)
P1 (permissões do Actions), P2 (guarda local copia a trava depois do merge), P3 (`SUB_CONTA` em `docs/acesso.mjs`, hoje
`null`), P4–P8 (Builds, Access, ensaios no staging), HSTS na zona antes do PR C, host exato do Supabase (M6), subir o Wrangler
depois de ~03/11. Builds: o comando de prévia do Builds do Worker `beyon-zero-site-previa` precisa levar `--env previa`; sem
isso as versões iriam para o Worker de produção. Detalhes na lista "Pendências do dono (atualizadas)" acima.

A trava `scripts/processo/anti-publicacao.mjs` e defesa em profundidade por texto (normaliza e casa, mas nao pega tudo); a protecao principal sao CI sem token, Builds com `--env previa` e producao sem rota.
