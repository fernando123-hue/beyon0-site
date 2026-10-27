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
   pede o "sim" do dono (regra de confirmação do plano § 5.5, item 1; ver "O risco que fica"): são os arquivos que o
   build executa ou que decidem para onde o deploy vai.
2. Abre um PR para a `main` com a evidência; o CI e o Processo rodam. Os checks são lidos um a um.
3. **O agente** mescla o PR (`gh pr merge`, nunca `--admin`) só depois de: todos os checks lidos e verdes,
   revisão técnica (e de segurança, no nível 3) por agente diferente do autor publicadas no PR, achados
   críticos/altos corrigidos. Qualquer check vermelho ou achado sem destino: não mescla. **A `main` não publica
   produção**: ela só atualiza o staging. (Dono, 2026-10-07: "desde que você sempre siga o processo de verificação e
   revisão, você pode mexer na main".)
4. **O dono** promove para produção, e só ele: o agente confere o staging, abre o PR **"Promover para produção:
   `<sha>`"** de `main` para `producao`, pedindo **"Create a merge commit"** (nunca squash nem rebase), e o dono abre
   no celular e clica **Merge**. Em seguida o agente confere a produção e que `git diff origin/main origin/producao`
   sai vazio. A conferência de produção: `BASE=https://beyonzero.com.br npm run verificar` (só abre as páginas, não o
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
5. Migration de banco: **antes** do passo 4, pelo dono, no roteiro de `docs/fundacao/02-OPERACAO.md`
   (o código novo nunca vai ao ar antes da migration que ele usa).

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
do dono, passo P2 do plano) nega push direto na `main`, na `producao` ou forçado, merge com `--admin`/`--auto`,
`gh pr merge` de PR com base `producao`, `wrangler deploy` sem `--dry-run`, `wrangler versions`/`secret`/`login`,
`gh workflow run` nos projetos da Beyon, `gh api` de escrita em `/contents`, `/git/` e `/merges`, `supabase db push` e
a leitura de `.env`/`.dev.vars`; e as regras `permissions.deny` do `~/.claude/settings.json` repetem os principais. O
agente nunca altera o próprio guarda. O agente também nunca tem token da Cloudflare.

**Legado até o PR D:** `vercel.json`, `.vercelignore` e as regras da Vercel no guarda continuam no repositório só até
o PR D (com a produção da Cloudflare conferida); o projeto da Vercel é apagado depois que a captação trocar os links
para `beyonzero.com.br`. Nada novo é promovido na Vercel.

## Sempre pedir o dono

Apagar dado, trocar segredo, publicar ao vivo (o Merge do PR "Promover para produção" na `producao`), migration no banco
real, decisão de negócio, e mexer em qualquer ajuste de domínio, zona ou produção da Cloudflare (e da Vercel, enquanto ela existir).

## Limites (ditos como são)

O portão confere declaração e links, não a verdade do texto. Revisores são o mesmo modelo em outra instância.
Sem proteção de branch (repositório privado no plano gratuito), check vermelho não bloqueia o botão de mesclar:
ler os checks é obrigatório antes de mesclar, e o que vale é a leitura, não o botão. O guarda é trava contra erro e instrução injetada,
não contra quem quer burlar: o texto livre de shell tem muitas formas.
