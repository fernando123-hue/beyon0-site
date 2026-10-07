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
· `npm run acessibilidade` (os dois últimos quando a mudança toca as páginas). Detalhes no `CLAUDE.md`.

## Como se publica (a barreira)

1. O agente trabalha numa branch (`rebuild-v2` ou uma branch por tarefa) e faz push: a Vercel gera uma **prévia**.
2. Abre um PR para a `main` com a evidência; o CI e o Processo rodam. Os checks são lidos um a um.
3. **O dono** mescla o PR (um clique no GitHub). A `main` **não publica sozinha**: `vercel.json →
   git.deploymentEnabled.main = false`.
4. **O dono** promove para produção no painel da Vercel: Deployments → a prévia do commit mesclado →
   "Promote to Production". Voltar atrás: "Instant Rollback" no mesmo painel.
5. Migration de banco: **antes** do passo 4, pelo dono, no roteiro de `docs/fundacao/02-OPERACAO.md`
   (o código novo nunca vai ao ar antes da migration que ele usa).

O que impede o agente de pular isso (mecanismo, não texto): o guarda do Claude Code (`~/.claude/guarda/`)
nega `vercel --prod`/`promote`/`rollback`, push na `main` ou forçado, `gh pr merge` e `gh workflow run` nos
projetos da Beyon, `supabase db push` e a leitura de `.env`; e as regras `permissions.deny` do
`~/.claude/settings.json` repetem os principais.

## Sempre pedir o dono

Apagar dado, trocar segredo, publicar ao vivo (mesclar na `main` e promover), migration no banco real, decisão de negócio.

## Limites (ditos como são)

O portão confere declaração e links, não a verdade do texto. Revisores são o mesmo modelo em outra instância.
Sem proteção de branch (repositório privado no plano gratuito), check vermelho não bloqueia o botão de mesclar:
ler os checks é obrigatório — por isso quem mescla é o dono. O guarda é trava contra erro e instrução injetada,
não contra quem quer burlar: o texto livre de shell tem muitas formas.
