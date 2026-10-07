# Pendências das revisões do PR 1 (rebuild-v2 → main)

Revisões: técnica https://github.com/fernando123-hue/beyon0-site/pull/1#issuecomment-6044752779 ·
segurança https://github.com/fernando123-hue/beyon0-site/pull/1#issuecomment-6044790839 (2026-10-07).
Nenhum achado crítico ou alto. A `main` não publica sozinha; estes itens valem **antes de promover para produção
com credenciais reais**, salvo onde diz outra coisa.

## Corrigido no PR 2 (`correcoes-revisao-pr1`)

| Achado | O que era | Correção |
|---|---|---|
| Técnica M1 = Segurança B2 | pedido de ajuste vazio ou > 2.000 caracteres virava a string `"null"` e ia ao modelo | valida antes de redigir (`api/_vendas/fluxo.mjs`); teste em `fluxo-api.test.mjs` |
| Segurança B1 | `?acao=constructor`/`toString`/`__proto__` davam 500 | só ações próprias da tabela (`Object.hasOwn`, `api/vendas.mjs`); teste idem |
| Técnica M3 | o processo mandava promover "a prévia do commit mesclado", que não existe | texto do `docs/PROCESSO.md` passo 4 corrigido pela doc da Vercel; **o ensaio continua pendente** (abaixo) |
| PR 2 segurança M1 = técnica B4 | seção/operação vinda do modelo com nome herdado (`constructor`) escrevia "[native code]" no escopo do contrato | `daTabela` com `Object.hasOwn` em `api/_vendas/escopo.mjs`; teste em `alteracoes.test.mjs` |
| PR 2 segurança M2, técnica M1/M2/B1/B2 | passo 4 afirmava sem ensaio; quem roda o `git diff`; caminho "Staged" perigoso; aviso temporário no processo | passo 4 reescrito (agente escreve "SHA para promover"; "ainda não ensaiado"; rollback não desfaz migration; caminho "Staged" só com decisão escrita; `deploymentEnabled` em "Sempre pedir o dono") |

## Antes da 1ª promoção (lista do dono, com o agente)

1. Ensaiar a promoção num projeto Vercel SEPARADO e anotar o que a Vercel fez de verdade (variáveis, domínio,
   rotinas, e o que o "Instant Rollback" faz com o domínio). Regras do ensaio:
   - **Nenhuma credencial de produção** nesse projeto: banco de TESTE (com as 18 migrations aplicadas) e Mercado
     Pago de TESTE.
   - **Pagamento desligado é o resultado esperado**: promovido, o projeto roda como produção (`VERCEL_ENV=production`)
     e `api/_pagamentos/config.mjs` só liga com `MP_AMBIENTE=producao`. Não "consertar" pondo `producao` nem
     credencial real: o pagamento de TESTE se ensaia na prévia.
   - IA: ou `BZ_IA=simulada` (ensaio sem custo), ou uma chave Anthropic só do ensaio com limite de gasto baixo no
     console. Nunca a chave de produção.
   - Apagar o projeto de ensaio no fim.
2. Variáveis de Produção: Supabase de produção, Mercado Pago de produção + webhook, `CRON_SECRET` com 32+
   caracteres, e **sem** `BZ_IA=simulada` nem `BZ_LOCAL` (os dois ligam o simulador).
3. Migrations aplicadas no banco de produção antes de promover.
4. O PR traz "SHA para promover"; promover exatamente esse.
5. Depois: `npm run verificar` com `BASE` de produção; site e `/orcamento` no celular sem digitar mensagem (nunca
   o `e2e:orcamento`).
6. Rollback e migrations: na 1ª promoção, voltar atrás leva a `8103c99`, que não tem `api/` nem `supabase/`
   (conferido em 2026-10-07 com `git ls-tree 8103c99`): o site antigo não usa o banco, então as 18 migrations não o
   quebram. Mas essa volta tira do ar o `/orcamento`, o aviso do Mercado Pago e as rotinas (reconciliação e
   retenção): Pix pago no intervalo só entra depois de promover de novo e reconciliar. Com clientes pagando, voltar
   só para uma versão que já tenha a API. Da 2ª promoção em diante, cada migration nova precisa funcionar com o
   código da promoção anterior: acrescentar tabela, função nova ou coluna que aceite vazio (ou tenha valor padrão)
   pode; coluna obrigatória sem padrão, `CHECK`/`UNIQUE` novo, gatilho novo, mudar função existente, renomear ou
   apagar exigem conferir o código anterior (ou ir em duas promoções).

## Antes de ligar credenciais reais / promover

| Achado | Risco | Direção |
|---|---|---|
| Segurança M1 | criar visitante anônimo sem CAPTCHA; freio em memória por instância; retenção não apaga conversas vazias nem anônimos | Turnstile (grátis) no `sessao` ou freio no banco; `vendas_reter` apagar anônimos sem conversa após N dias |
| Segurança M2 | redação de dado pessoal deixa passar telefone com espaços, "98765-4321", CPF com espaços, e-mail por extenso | ampliar `api/_vendas/seguranca.mjs` com casos de teste de cada formato |
| Segurança M3 | `app.leads` de quem nunca pagou não tem prazo; a política de privacidade não diz | **decisão do dono**: prazo (ex.: 12 meses) + texto em `privacidade.html` + `vendas_reter` |
| Técnica M2 | 4xx da IA (sem saldo, modelo fora) conta como "entrada": disjuntor e alerta não disparam | classificar 402/403/404 e o 400 de saldo como `indisponivel` em `api/_ia/anthropic.mjs` |
| Técnica M4 | mutação só sabota as migrations de RLS | sabotagens em `pagamentos_aplicar` e `conferir_transicao` |
| Segurança B3 | `CRON_SECRET` aceita 16 caracteres; tentativas erradas sem freio | mínimo 32 e freio nas rotas de rotina |
| Segurança B6 | teto de custo lido antes e somado depois: 3 direções em paralelo passam do teto em ~1/3 | reservar o custo no banco antes de chamar |
| Técnica B1 | `ID_ORDER` do webhook sensível a maiúsculas | confirmar a forma real do MP no 1º teste com credenciais de TESTE |
| Técnica B3 | `sinal_percentual` fracionário diverge entre cartão e Pix | aceitar só inteiro no motor de preço |
| Segurança B4 | CSP de `/orcamento` libera domínios do Google que a página não usa | enxugar `vercel.json` |
| Segurança B5 | `BZ_IA=simulada` sem trava na Vercel | recusar o simulador quando `VERCEL_ENV=production` |

## Depois / quando acontecer

- Segurança B7: com Cloudflare na frente, usar `cf-connecting-ip` **só** com a origem restrita à Cloudflare.
- Segurança B8: injeção de fórmula no CSV do painel (só o dono controla o parâmetro).
- Técnica B2: o portão aceita revisão anterior ao último commit; comparar datas.
- Técnica B4: alerta quando a rotina diária não roda há > 36 h (passo no `reconciliar.yml`).
- Feito no PR 3 (documentação): nota datada do guarda em `docs/HANDOFF.md`; saída do "não promover";
  `e2e:orcamento` nunca em produção; credenciais do ensaio; rollback × migrations (item 6 acima).
- PR 2 técnica B3 / segurança B4: os casos de entrada inválida provam o status, não que o modelo e o banco
  ficaram sem chamada; separar em testes por caso.
- Teste: rodadas seguidas do E2E estouram o freio por IP (90/min) — esperar 1 min entre rodadas.
