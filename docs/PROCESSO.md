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

1. O agente trabalha numa branch (`rebuild-v2` ou uma branch por tarefa) e faz push: a Vercel gera uma **prévia**.
2. Abre um PR para a `main` com a evidência; o CI e o Processo rodam. Os checks são lidos um a um.
3. **O agente** mescla o PR (`gh pr merge`, nunca `--admin`) só depois de: todos os checks lidos e verdes,
   revisão técnica (e de segurança, no nível 3) por agente diferente do autor publicadas no PR, achados
   críticos/altos corrigidos. Qualquer check vermelho ou achado sem destino: não mescla. A `main` **não publica
   sozinha**: `vercel.json → git.deploymentEnabled.main = false`. (Dono, 2026-10-07: "desde que você sempre siga
   o processo de verificação e revisão, você pode mexer na main"; antes, quem mesclava era ele.)
4. **O dono** promove para produção no painel da Vercel. Como a `main` não é construída, o que se promove é a
   **prévia do último commit da branch do PR**. Ao mesclar, **o agente** escreve no PR "SHA para promover: `<sha>`"
   depois de conferir que `git diff origin/main <sha>` sai vazio; se não sair vazio, escreve "não promover" e o
   motivo, e a saída é um PR novo a partir da `main` (um commit vazio, `git commit --allow-empty`, basta para o
   GitHub aceitar o PR); a Vercel gera a prévia certa no push e o SHA para promover passa a ser o dela. O dono só
   confere o SHA no painel: Deployments → a prévia desse SHA → ⋯ → "Promote to Production".
   Segundo a doc oficial da Vercel ("Promoting Deployments", lida em 2026-10-07; **ainda não ensaiado aqui**),
   promover uma prévia a reconstrói do zero com as variáveis de Produção ("You cannot use your preview environment
   variables in a production deployment"): banco, Mercado Pago e IA passam a ser os de produção.
   Antes da 1ª promoção: o ensaio e as DUAS listas de `docs/revisoes/pr1-pendencias.md` ("Antes da 1ª promoção" e
   "Antes de ligar credenciais reais / promover").
   Logo depois de promover: o agente roda `npm run verificar` com `BASE` de produção (só abre as páginas do site,
   não o `/orcamento`); o dono abre o site e o `/orcamento` no celular **sem digitar mensagem** (a 1ª mensagem cria
   conversa e chama a IA paga). **`npm run e2e:orcamento` nunca roda contra produção** (cria conversa, chama a IA
   paga e cria pedido de pagamento real); o próprio script recusa `BASE` que não seja local.
   Voltar atrás: "Instant Rollback". Não reconstrói e **não desfaz migration**. Voltar para uma versão sem a API
   (como a `8103c99`) tira do ar o `/orcamento`, o aviso do Mercado Pago e as rotinas: um Pix pago nesse intervalo
   só é aplicado depois de promover de novo e a reconciliação rodar. Com clientes pagando, voltar só para uma versão
   que já tenha a API.
   Existe outro caminho (a `main` construir como produção "Staged", sem domínio, e o dono clicar em "Promote"), mas
   ele exige tirar a trava do `vercel.json` e desligar "Auto-assign Custom Production Domains" ANTES; na ordem
   errada, o merge iria ao ar sozinho. **Não usar sem decisão escrita do dono e revisão própria.**
5. Migration de banco: **antes** do passo 4, pelo dono, no roteiro de `docs/fundacao/02-OPERACAO.md`
   (o código novo nunca vai ao ar antes da migration que ele usa).

O que impede o agente de pular isso (mecanismo, não texto): o guarda do Claude Code (`~/.claude/guarda/`)
nega `vercel --prod`/`promote`/`rollback`, push direto na `main` ou forçado, merge com `--admin`/`--auto`,
`gh workflow run` nos projetos da Beyon, `supabase db push` e a leitura de `.env`; e as regras `permissions.deny`
do `~/.claude/settings.json` repetem os principais. O agente nunca altera o próprio guarda.

## Sempre pedir o dono

Apagar dado, trocar segredo, publicar ao vivo (promover na Vercel), migration no banco real, decisão de negócio,
e mexer em `git.deploymentEnabled` ou em qualquer ajuste de domínio/produção da Vercel.

## Limites (ditos como são)

O portão confere declaração e links, não a verdade do texto. Revisores são o mesmo modelo em outra instância.
Sem proteção de branch (repositório privado no plano gratuito), check vermelho não bloqueia o botão de mesclar:
ler os checks é obrigatório antes de mesclar, e o que vale é a leitura, não o botão. O guarda é trava contra erro e instrução injetada,
não contra quem quer burlar: o texto livre de shell tem muitas formas.
