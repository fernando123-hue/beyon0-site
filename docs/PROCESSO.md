# Processo de desenvolvimento, verificação e publicação

> Modelo da skill `processo-qualidade` (derivado do processo do Sistema SBP), adotado em 2026-10-07 depois da
> auditoria do Harness (`06 Operação/Auditoria do Harness — 2026-10-07.md`, achado CRITICAL nº 1: não havia
> barreira entre o código e a produção). Registro em `../../01 Empresa/Decisões.md`.

```text
ESPECIFICAÇÃO → TESTE (visto vermelho) → IMPLEMENTAÇÃO → VERIFICAÇÃO COMPORTAMENTAL → REVISÃO TÉCNICA
→ REVISÃO DE SEGURANÇA → TESTES DETERMINÍSTICOS → REGRESSÃO → ACEITAÇÃO → (o dono) PUBLICA

Problema em qualquer etapa: PROBLEMA → CAUSA → CORREÇÃO → NOVA VERIFICAÇÃO → TESTES → REGRESSÃO
```

**Nenhum agente é o único juiz do próprio trabalho. Compilar não é estar correto. Aprovar exige evidência.**

## Nível de risco — decidido pelos arquivos

Fonte: `scripts/processo/niveis.json` (vale o arquivo mais sensível; caminho sem regra = nível 3).
Calcular antes do PR: `node scripts/processo/nivel-de-risco.mjs origin/main HEAD`.

| Nível | Exemplos neste projeto |
|---|---|
| 0 — documentação | `docs/*.md`, `*.md` (menos `CLAUDE.md` e este arquivo) |
| 1 — visual | `*.html`, `css/`, `assets/`, `robots.txt`, `sitemap.xml` |
| 2 — comportamento | `js/` (menos os de dado e pagamento), testes e ferramentas em `docs/` |
| 3 — sensível | `api/`, `supabase/`, `vercel.json` (CSP, cron, deploy), `.github/`, `.claude/`, `CLAUDE.md`, dependências, `.env.example`, `js/orcamento*`, `js/lead-form.js`, `js/medicao.js`, `vendor/`, este processo |

## Evidência exigida no PR

| Evidência | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Especificação | ✔ | ✔ | ✔ | ✔ |
| Visto rodando (celular primeiro) | | ✔ | ✔ | ✔ |
| Regressão | | ✔ | ✔ | ✔ |
| Verificação comportamental | | | ✔ | ✔ |
| Teste visto vermelho | | | ✔ | ✔ |
| Revisão técnica (agente diferente, link do comentário no PR) | | | ✔ | ✔ |
| Revisão de segurança (link do comentário no PR) | | | | ✔ |

O job **Processo** (`.github/workflows/processo.yml`) calcula o nível e falha se faltar evidência; roda de novo
quando o corpo do PR é editado. O job **CI** (`.github/workflows/ci.yml`) roda os testes a cada push, o gitleaks,
o `npm audit` das dependências de produção e, no PR para a `main`, o E2E do orçamento.

## Comandos de verificação

`npm run testar` · `npm run testar:mutacao` · `npm run e2e:orcamento` (servidor local ligado) · `npm run verificar`
· `npm run acessibilidade` (os dois últimos quando a mudança toca as páginas) · `npm run e2e:turnstile` (quando a
mudança toca o anti-robô; servidor local com as chaves de TESTE da Cloudflare, ver o cabeçalho de `docs/e2e-turnstile.mjs`).
Detalhes no `CLAUDE.md`.

## A CI em paralelo (fatias da mutação e rodadas do E2E)

O guarda e o gate de promoção leem dois checks **pelo nome**: "Testes (banco real, IA e pagamento simulados) e mutação" e
"E2E do orçamento (Chromium, do 1º texto ao projeto pago)". Os dois continuam existindo como **um check só cada**, mas agora são
**agregados** (jobs `testes` e `e2e` do `ci.yml`) que esperam o trabalho real, feito em paralelo em outros jobs:

- **Mutação:** o harness (`docs/testes/mutacao.mjs`) aceita `MUTACAO_FATIA=i/N`: a fatia `i` roda as sabotagens de índice
  `i-1, i-1+N, …` da lista (revezamento; cada sabotagem em exatamente uma fatia). O CI roda N=8 jobs "Mutação (fatia i/8)", só na
  `main` e à mão (`workflow_dispatch`, em qualquer ramo). Fatia vazia não é erro; `MUTACAO_FATIA` malformada é.
- **E2E:** dois jobs "E2E do orçamento – sem consultor" e "– com consultor" (uma máquina cada), só no PR e à mão.
- **O agregado só passa se tudo passou:** roda com `if: always()` e exige `success` da suíte e do conjunto de fatias (o
  resultado agregado de uma matriz) **e** confere cada fatia pelo nome na API do GitHub (`scripts/ci/conferir-jobs.mjs`,
  `actions: read`): fatia faltando, repetida, pulada, cancelada ou sem conclusão reprova. Onde a mutação não é esperada
  (PR, ramo de promoção) ela tem de estar `skipped`/`success`. No push comum o agregado do E2E fica `skipped`, como antes.
- **Ler os checks do PR:** o agregado só **aparece** na lista (`gh pr checks`) depois que todas as partes terminam. Enquanto
  as partes rodam, a lista mostra só elas. **Agregado ausente = pendente**, nunca "tudo verde": só vale o PR com o
  "Testes (…) e mutação" (e, no PR, o "E2E do orçamento (Chromium…)") presentes e `pass`. O guarda de promoção já trata
  o agregado ausente como falta (exige o check por nome) e barra também qualquer fatia pendente ou vermelha. Reexecutar:
  reexecute **todos** os jobs, não só os que falharam (o conferidor conta cada fatia da última tentativa).
- **Nenhum passo dos jobs de trabalho tem `if:`** (o teste confere): um passo pulado deixaria o job verde sem ter testado nada.
- **Mais fatias:** troque a lista `fatia: ['1/8', …]` do job `mutacao` **e** `MUTACAO_FATIAS` do job `testes` para o mesmo N
  (nada mais). `docs/testes/ci-paralela.test.mjs` falha se as duas não baterem ou se a lista não for `1/N..N/N`. Escolha N
  para a fatia ficar em ~8-10 min (≈ 8-15 s por sabotagem).
- Provas na CI de verdade (sabotagem não pega, fatia pulada, rodada do E2E quebrada deixando o agregado vermelho): PR de
  implantação desta mudança.

## Como se publica (a barreira)

Desde a migração para a Cloudflare (PR C; plano em `docs/superpowers/plans/2026-10-21-migracao-cloudflare.md`, § 5.3):
**uma conta Cloudflare, dois Workers**. A Vercel não será promovida: o que sobrou dela é legado até o PR D (ver o fim
desta seção).

| Papel | Worker | Branch → o que acontece | Segredos |
|---|---|---|---|
| Produção | `beyon-zero-site` (`beyonzero.com.br`) | só a branch **`producao`** constrói e publica; nenhuma outra | os de produção (dono) |
| Prévias e staging | `beyon-zero-site-previa` (`workers.dev`, atrás do Access) | `main` → staging fixo; outra branch → prévia | os de teste |

1. O agente trabalha numa branch (uma por tarefa) e faz push: o Builds do Worker de prévias gera uma **prévia** com
   os segredos de teste. **Push que mude** `.github/workflows/**`, `cloudflare/**`, `wrangler.jsonc` ou `package*.json`
   deve pedir o "sim" do dono (regra de confirmação do plano § 5.5, item 1; **vale só depois que o dono aplicar o P2**,
   até lá é regra de conduta, sem mecanismo; ver "O risco que fica"): são os arquivos que o build executa ou que
   decidem para onde o deploy vai.
2. Abre um PR para a `main` com a evidência; o CI e o Processo rodam. Os checks são lidos um a um.
3. **O agente** mescla o PR (`gh pr merge`, nunca `--admin`) só depois de: todos os checks lidos e verdes,
   revisão técnica (e de segurança, no nível 3) por agente diferente do autor publicadas no PR, achados
   críticos/altos corrigidos. Qualquer check vermelho ou achado sem destino: não mescla. **A `main` não publica
   produção**: ela só atualiza o staging. (Dono, 2026-10-07: "desde que você sempre siga o processo de verificação e
   revisão, você pode mexer na main".)
4. **O agente promove para produção, depois do processo** (dono, 2026-11-09, 2026-11-12 e 2026-11-18; confirmado em
   2026-11-25): o agente confere o staging, abre o PR **"Promover para produção: `<sha>`"** de `main` para `producao`,
   lê os checks um a um e, com tudo verde, mescla com **merge commit** (nunca squash nem rebase):
   `gh pr merge <n> -R fernando123-hue/beyon0-site --merge --match-head-commit <sha completo>`, com o MESMO sha da
   `main` que ficou verde (se a `main` andar, recomeça a verificação). Em seguida o agente confere a produção e que
   `git diff origin/main origin/producao` sai vazio. A conferência de produção: `BASE=https://beyonzero.com.br npm run verificar` (só abre as páginas, não o
   `/orcamento`); `https://www.beyonzero.com.br/sites?x=1` responde 301 para `https://beyonzero.com.br/sites?x=1`;
   `/docs/PROCESSO.md`, `/api/_freio`, `/.env`, `/CLAUDE.md`, `/wrangler.jsonc` e `/_headers` respondem 404; o
   `workers.dev` da produção não responde (desligado). O dono abre o site e o `/orcamento` no celular **sem digitar
   mensagem** (a 1ª mensagem cria conversa e chama a IA paga). **`npm run e2e:orcamento` nunca roda contra produção**
   (cria conversa, chama a IA paga e cria pedido de pagamento real); o próprio script recusa `BASE` que não seja local.
   **Ainda não ensaiado aqui** (passos P15 e seguintes do plano): o primeiro corte é o ensaio.
   Com a fila de prévias cheia, o build da promoção espera (1 build por vez por conta no plano grátis): promover com a
   fila vazia.
   Voltar atrás: Workers & Pages → `beyon-zero-site` → Deployments → ⋯ → Rollback (dono). Não reconstrói e **não
   desfaz migration**. Voltar para uma versão sem a API tira do ar o `/orcamento`, o aviso do Mercado Pago e as
   rotinas: um Pix pago nesse intervalo só é aplicado depois de publicar de novo e a reconciliação rodar. Com
   clientes pagando, voltar só para uma versão que já tenha a API.
5. Migration de banco: **antes** do passo 4, pelo agente, sem pedir o "sim" do dono (dono, 2026-11-26: "Tem minha
   permissão para o banco também, após tudo revisado e passado pelos processos").
   - **Vale só para** um arquivo de `supabase/migrations/` que já está na `main` (PR revisado, CI verde, mesclado),
     rodado **inteiro e igual ao da `main`** (copiado do arquivo no sha da `main`, sem editar). **Proibido** no banco de
     produção: SQL que não seja esse arquivo (solto, de ramo não mesclado, editado, ou só um trecho). Qualquer outra
     mudança no banco real continua sendo do dono ("Sempre pedir o dono", abaixo).
   - **Como:** pelo SQL Editor do Supabase de produção (o agente não roda `supabase db push`: as permissões do Claude Code do dono o negam). Antes,
     conferir que ela ainda não foi aplicada (as colunas e funções que ela cria não existem) e que as anteriores estão;
     rodar; depois, conferir o que ela cria (colunas, funções, permissões; `docs/fundacao/02-OPERACAO.md` §4.4) e
     registrar a versão em `supabase_migrations.schema_migrations` como as anteriores estão registradas (conferir as
     colunas da tabela antes), para um `db push` futuro não a reaplicar.
   - **Se der erro:** parar; não tentar de novo nem corrigir à mão no banco. Conferir o estado (o SQL Editor costuma
     reverter o script inteiro, mas conferir, não presumir). A correção é uma migration nova, por PR, e o dono é avisado.
     O passo 4 não anda enquanto o banco não estiver no estado esperado.
   - O código novo nunca vai ao ar antes da migration que ele usa.
   - **Do dono:** só entrar no painel do Supabase quando a sessão do Chrome dele expira (o login pede o código de duas
     etapas do celular dele); com o painel aberto, o resto é do agente.

**O risco que fica (dito como é; decisão do dono, 2026-10-21, uma conta só até a 1ª venda).** O Builds do Worker de
prévias roda o código de **toda** branch empurrada (`npm ci`, o Build command, o `wrangler` lendo o `wrangler.jsonc`)
com um token que vale para a conta inteira, inclusive o Worker de produção. Uma branch maliciosa nesses arquivos
publicaria produção sem merge. Travas que compensam, da mais forte à mais fraca: a confirmação do dono no `git push`
desses arquivos (item 1); o `env.previa` sem `name` próprio e com `routes: []` (o teste de `wrangler.jsonc` prende) e
o `package.json` sem scripts de instalação; a varredura de `scripts/processo/anti-publicacao.mjs` (pega erro e
instrução óbvia, não contorno); o token do Builds com o mínimo; Actions só leitura. O que sobra: um push que não passe
pela confirmação (outra pessoa, outra ferramenta, o dono aprovar sem ler, defeito no guarda) com código malicioso
nesses arquivos publica produção. Só um ruleset na `producao` (GitHub Pro) ou uma 2ª conta fecham de vez; ficam para
**depois da 1ª venda**, junto da assinatura paga. O workflow do GitHub empurrado numa branch é a outra porta: contra o
agente enganado, a trava é a mesma confirmação no push.

O que impede o agente de pular isso (mecanismo, não texto): o guarda do Claude Code (`~/.claude/guarda/`, configuração
do dono). **Hoje** ele nega push direto na `main`, merge com `--admin`/`--auto` e `vercel`. **Depois do passo P2 do plano
(§ 5.5), que só o dono aplica e ainda não foi aplicado**, passa a negar também push direto na `main`, na `producao` ou forçado, merge com `--admin`/`--auto`,
`gh pr merge` de PR com base `producao` (exceto a forma exata do passo 4, com `--merge --match-head-commit <sha completo>`,
liberada pelo dono em 2026-11-09), `wrangler deploy` sem `--dry-run`, `wrangler versions`/`secret`/`login`,
`gh workflow run` nos projetos da Beyon, `gh api` de escrita em `/contents`, `/git/` e `/merges`, `supabase db push` e
a leitura de `.env`/`.dev.vars`; e as regras `permissions.deny` do `~/.claude/settings.json` repetem os principais. O
agente nunca altera o próprio guarda. O agente também nunca tem token da Cloudflare.

**Legado até o PR D:** `vercel.json`, `.vercelignore` e as regras da Vercel no guarda continuam no repositório só até
o PR D (com a produção da Cloudflare conferida); o projeto da Vercel é apagado depois que a captação trocar os links
para `beyonzero.com.br`. Nada novo é promovido na Vercel.

## Sempre pedir o dono

Apagar dado, trocar segredo, publicar ao vivo por qualquer caminho que não seja o PR "Promover para produção" do passo 4,
mudança no banco real que não seja uma migration já mesclada na `main`, aplicada inteira e sem alteração (item 5 do passo a passo de produção), decisão de negócio, e mexer em qualquer ajuste de domínio, zona ou produção da Cloudflare (e da Vercel, enquanto ela existir).

## Limites (ditos como são)

O portão confere declaração e links, não a verdade do texto. Revisores são o mesmo modelo em outra instância.
Sem proteção de branch (repositório privado no plano gratuito), check vermelho não bloqueia o botão de mesclar:
ler os checks é obrigatório antes de mesclar, e o que vale é a leitura, não o botão. O guarda é trava contra erro e instrução injetada,
não contra quem quer burlar: o texto livre de shell tem muitas formas.
