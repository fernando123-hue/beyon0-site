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
| Técnica M3 | o processo mandava promover "a prévia do commit mesclado", que não existe | `docs/PROCESSO.md` passo 4, conferido na doc oficial da Vercel |

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
- Teste: rodadas seguidas do E2E estouram o freio por IP (90/min) — esperar 1 min entre rodadas.
