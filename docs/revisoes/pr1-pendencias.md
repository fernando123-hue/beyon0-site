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
   - IA: uma chave Anthropic só do ensaio, com limite de gasto baixo no console. Nunca a chave de produção. O
     simulador NÃO serve aqui: promovido, o projeto roda como produção e, desde o PR 5, o código recusa o simulador
     nesse ambiente (o consultor responde 503 com o WhatsApp — esse também é um resultado válido do ensaio sem
     chave). O simulador vale só na prévia e no servidor local.
   - No fim: apagar o projeto de ensaio, apagar o banco de TESTE do ensaio e revogar a chave Anthropic do ensaio.
   - Se o ensaio for feito sem chave, o caminho da IA real só roda pela 1ª vez em produção: conferir o 1º turno
     real logo depois de promover.
2. Variáveis de Produção: Supabase de produção, Mercado Pago de produção + webhook, `CRON_SECRET` com 32+
   caracteres, e **sem** `BZ_IA=simulada` nem `BZ_LOCAL` (desde o PR 5 o código já recusa o simulador na Vercel fora da
   prévia: sem `ANTHROPIC_API_KEY`, o consultor fica desligado com o WhatsApp). Prévias com a proteção de deploy
   da Vercel ligada (quem tem o link não vê proposta simulada).
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
| ~~Segurança M2~~ | ~~redação de dado pessoal com furos~~ | **feito no PR 6** (números de 10–19 dígitos com qualquer separador, celular sem DDD, `+55`, e-mail por extenso em português e inglês; casos que NÃO são dado pessoal também testados) |
| Segurança M3 | `app.leads` de quem nunca pagou não tem prazo; a política de privacidade não diz | **decisão do dono**: prazo (ex.: 12 meses) + texto em `privacidade.html` + `vendas_reter` |
| ~~Técnica M2~~ | ~~4xx da IA conta como "entrada"~~ | **feito no PR 4** (402/403/404 e o 400 de limite de gasto/saldo → `indisponivel`) |
| Técnica M4 | mutação só sabota as migrations de RLS | sabotagens em `pagamentos_aplicar` e `conferir_transicao` |
| ~~Segurança B3~~ | ~~`CRON_SECRET` aceita 16 caracteres; tentativas erradas sem freio~~ | **feito no PR 11** (`api/_cron.mjs`: 32+ depois de `.trim()`, freio de tentativa errada por IP) |
| Segurança B6 | teto de custo lido antes e somado depois: 3 direções em paralelo passam do teto em ~1/3 | reservar o custo no banco antes de chamar |
| Técnica B1 | `ID_ORDER` do webhook sensível a maiúsculas | confirmar a forma real do MP no 1º teste com credenciais de TESTE |
| Técnica B3 | `sinal_percentual` fracionário diverge entre cartão e Pix | aceitar só inteiro no motor de preço |
| ~~Segurança B4~~ | ~~CSP de `/orcamento` libera domínios do Google que a página não usa~~ | **feito no PR 13** (Google fora do `/orcamento`; `/painel` com header próprio igual ao `<meta>`; `docs/testes/csp.test.mjs` prende header e `<meta>` juntos) |
| ~~Segurança B5~~ | ~~`BZ_IA=simulada` sem trava na Vercel~~ | **feito no PR 5** (`criarIA`: na Vercel, simulador só na prévia e no desenvolvimento; fechado por padrão) |

## Depois / quando acontecer

- Segurança B7: com Cloudflare na frente, usar `cf-connecting-ip` **só** com a origem restrita à Cloudflare.
- Segurança B8: injeção de fórmula no CSV do painel (só o dono controla o parâmetro).
- Técnica B2: o portão aceita revisão anterior ao último commit; comparar datas.
- Técnica B4: alerta quando a rotina diária não roda há > 36 h (passo no `reconciliar.yml`).
- Feito no PR 3 (documentação): nota datada do guarda em `docs/HANDOFF.md`; saída do "não promover";
  `e2e:orcamento` nunca em produção; credenciais do ensaio; rollback × migrations (item 6 acima).
- PR 2 técnica B3 / segurança B4: os casos de entrada inválida provam o status, não que o modelo e o banco
  ficaram sem chamada; separar em testes por caso.
- Das revisões do PR 4: alerta de surto de 400 da IA (se o provedor mudar a frase do limite de gasto, o erro volta
  a ser "entrada" em silêncio); alerta `ia_falhando` exigir 2 conversas, como o disjuntor; `.gitattributes` com
  `*.sql text eol=lf`. Feitos no PR 5: o log de 4xx inclui 401 e 429 e o campo virou `request_id_provedor`.
- Das revisões do PR 3: precisões na nota do guarda (`--admin`/`--auto` negados só nos projetos da Beyon; deploy de
  prévia passa de propósito; merge pela API do GitHub não é coberto). Feito no PR 5: `BASE` inválida no E2E dá a
  mensagem de recusa em vez de `TypeError`.
- Da revisão do PR 5: o E2E olha só o nome do host; um túnel ou `vercel dev` local apontando para produção
  passaria. Exigir que `GET /api/vendas?acao=pagamento-config` responda o ambiente simulado antes de rodar.
- Teste: rodadas seguidas do E2E estouram o freio por IP (90/min) — esperar 1 min entre rodadas.
