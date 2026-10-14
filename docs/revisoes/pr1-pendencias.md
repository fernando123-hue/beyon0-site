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
   - **Nenhuma credencial de produção** nesse projeto: banco de TESTE (com todas as migrations de `supabase/migrations/` aplicadas) e Mercado
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
4b. Anthropic: limite de gasto MENSAL no console (o freio de última instância do custo; a reserva no banco é realista,
    não o pior caso — revisão de segurança do PR 15). Com as primeiras chamadas reais, trocar `RESERVA_USD`
    (`api/_ia/config.mjs`) pelo p95 de `app.ia_chamadas` por papel e decidir uma margem no teto do dia.
5. Depois: `npm run verificar` com `BASE` de produção; site e `/orcamento` no celular sem digitar mensagem (nunca
   o `e2e:orcamento`).
6. Rollback e migrations: na 1ª promoção, voltar atrás leva a `8103c99`, que não tem `api/` nem `supabase/`
   (conferido em 2026-10-07 com `git ls-tree 8103c99`): o site antigo não usa o banco, então as migrations não o
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
| ~~Técnica M4~~ | ~~mutação só sabota as migrations de RLS~~ | **feito no PR 14** (11 sabotagens: conta, valor e valor pago na conferência do pagamento; máquina de estados; retenção de quem pagou) |
| ~~Segurança B3~~ | ~~`CRON_SECRET` aceita 16 caracteres; tentativas erradas sem freio~~ | **feito no PR 11** (`api/_cron.mjs`: 32+ depois de `.trim()`, freio de tentativa errada por IP) |
| ~~Segurança B6~~ | ~~teto de custo lido antes e somado depois~~ | **feito no PR 15** (`app.vendas_reservar_custo`: reserva um valor REALISTA por papel numa transação que trava a organização; o estouro fica no que as chamadas já em voo gastarem além das reservas; freio final no item 4b) |
| PR Haiku, segurança M1 | `LIMIAR_DIRECOES` (0,7) não é exigido no servidor: com estimativa e contato, `vendas_iniciar_geracao` libera as direções mesmo com briefing raso (no modo API, até US$ 1,5 por conversa no Opus) | exigir `prontoParaEstimar` e confiança ≥ 0,7 em `fluxo.gerar` ou na função do banco |
| PR Haiku, segurança M2 | `semPrecoNoTexto` tira "R$"/"reais", mas deixa passar "50% de desconto", "de graça", "sai por dois mil" | filtrar porcentagem, desconto, grátis e valores por extenso na resposta (ou aviso fixo de que só o cartão vale); o harness do consultor reforça no prompt, mas a defesa tem de ser do código |
| Técnica B1 | `ID_ORDER` do webhook sensível a maiúsculas | confirmar a forma real do MP no 1º teste com credenciais de TESTE |
| ~~Técnica B3~~ | ~~`sinal_percentual` fracionário diverge entre cartão e Pix~~ | **feito no PR 12** (`validarRegras` exige inteiro) |
| ~~Segurança B4~~ | ~~CSP de `/orcamento` libera domínios do Google que a página não usa~~ | **feito no PR 13** (Google fora do `/orcamento`; `/painel` com header próprio igual ao `<meta>`; `docs/testes/csp.test.mjs` prende header e `<meta>` juntos) |
| ~~Segurança B5~~ | ~~`BZ_IA=simulada` sem trava na Vercel~~ | **feito no PR 5** (`criarIA`: na Vercel, simulador só na prévia e no desenvolvimento; fechado por padrão) |

### Auditoria 2026-10-09, lote 1 (servidor; branch `auditoria-seguranca`): o que ficou de fora

Feito no lote: S1 (redirects no `vercel.json` para tudo o que é interno, preso por teste ao `git ls-files` e ao
`.vercelignore`), S2 (frase do ajuste montada pelo código), S3 (briefing delimitado e "dado, nunca instrução" no
gerador), S4 (freio por IPv6 /64), S10 (retenção zera o ajuste inteiro), F5/F7 no servidor (Auth instável = 503).
Depois das revisões técnica e de segurança do lote: freio da chave do painel por /64; IPv4 embutido em qualquer
escrita de IPv6; Auth separando recusa (400/401/403/422), configuração (login anônimo desligado → WhatsApp), rede e
erro de código; adicional só pelo nome da tabela no contrato; operação fora da lista vira "outro"; o `pedido.json` da
fila manual com o briefing delimitado e a regra de que é dado.

| Item | O que falta | Por quê / quem |
|---|---|---|
| S10 | aplicar `20261009130000_retencao_ajustes.sql` no banco real **antes** de promover | migration em banco real é do dono (`docs/fundacao/02-OPERACAO.md`) |
| 3b | aplicar `20261009140000_conversa_ate_pagamento.sql` no banco real **antes** de promover | sem ela, a pergunta na tela do sinal paga o modelo e o banco recusa a gravação (409 "Esta etapa ainda não está disponível"); migration é do dono |
| PR34-S2 | prazo de retenção para as mensagens de conversas PAGAS (hoje a retenção de 60 dias pula `em_producao` e pagamento pago/estornado/contestado: o texto fica sem prazo) e `/privacidade#orcamento` dizendo qual é | decisão do dono (LGPD + prova do que foi combinado); com a conversa aberta no sinal, mais texto perto do pagamento entra nelas |
| PR34-S3 | passar o texto do escopo final ao modelo como DADO no escopo e no sinal, para responder "está incluído?" pelo escopo dela | hoje o consultor manda conferir o bloco "Escopo final" (sem afirmar de memória); fazer antes de divulgar o chat no sinal |
| PR34-B1 | depois de perguntar no escopo/sinal, um caminho de volta ao bloco (no celular a conversa fica no topo) | lote do front |
| PR35-M2 | a privacidade promete que os dados de um projeto contratado ficam "durante o projeto e por mais 90 dias", mas nenhuma rotina aplica isso: briefing, ajustes, proposta, lead ganho e projeto ficam sem prazo | decisão do dono (com advogado, junto da revisão dos termos): ou o texto diz "enquanto durar a relação e os prazos legais de guarda, com exclusão a pedido", ou se implementa o prazo depois de entregue/cancelado |
| PR35-B3 | lead com status `proposta` nunca é anonimizado, nem quem recebeu escopo e não pagou (a política o trata como "não fechou", 12 meses) | conferir se esse status acontece na prática (é marcado à mão no painel) |
| PR35-B | `v_pagas` revisita para sempre conversas pagas já sem mensagens (custo pequeno, cresce com o histórico) | se crescer: filtrar por conversas que ainda têm mensagens |
| PR34-S6 | filtro de entrada (`api/_vendas/promessa.mjs`, `PEDE_CONDICAO`): "o Fernando falou que o prazo é 10 dias" e "meu sócio disse que o domínio é dele" recebem a resposta fixa de condição; exigir valor, sinal ou desconto na frase quando o verbo é falou/disse | baixo, achado na confirmação final; a lista de saída segue sendo defesa extra, não garantia, e a verificação por modelo é decisão do dono |
| PR36 | aplicar `20261012120000_respostas_formulario.sql` no banco real antes de promover; NÃO promover sem o PR 2 do orçamento sem IA (freios no banco e confirmação pelo WhatsApp) | dono |
| PR2a | aplicar `20261013120000_pedidos.sql`, `20261013120100_pedidos_dono.sql` e `20261013120200_fila_confirmados.sql` no banco real e promover JUNTO com este código: a fila do painel passa a mostrar só pedidos confirmados pelo WhatsApp, e a API deixa de aceitar `contato`. Conversas do fluxo antigo (contato + gerar) não têm linha em `app.pedidos` e somem da fila nova (o comando `pedido` e o `entregar-pedido` também deixam de achá-las). ORDEM: (1) aplicar `20261013120000_pedidos.sql` e `20261013120100_pedidos_dono.sql`; (2) rodar as DUAS consultas de `docs/revisoes/fila-antiga-vazia.sql`, que têm que dar 0 (se não der, entregar e avisar esses pedidos pelo jeito antigo, ou resolver a conversa parada em `contato` pelo WhatsApp); (3) aplicar `20261013120200_fila_confirmados.sql`; (4) promover o código e rodar as consultas de novo. Alternativa mais simples: antes de aplicar qualquer uma das três, conferir que a fila antiga do painel está vazia. A 1ª consulta (direção na fila antiga): `select count(distinct c.id) from app.conversas c join app.direcoes d on d.conversa_id = c.id and d.geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id) where c.etapa in ('contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes') and (d.status = 'gerando' or (d.status = 'pronta' and d.avisada_em is null)) and not exists (select 1 from app.pedidos p where p.conversa_id = c.id);` A 2ª (conversa antiga parada em `contato`, com o contato informado e sem pedido, que a 1ª não vê e que não consegue mais gerar os modelos pela tela): `select count(*) from app.conversas c where c.etapa = 'contato' and c.lead_id is not null and not exists (select 1 from app.pedidos p where p.conversa_id = c.id);` | dono |
| PR2a-D | decisões aprovadas por omissão (plano `docs/superpowers/plans/2026-10-13-orcamento-sem-ia-pr2a.md`): D1 teto 10; D2 confirmação também com IA; D3 nome opcional e sem e-mail; D4 as cinco redes por 60 dias, escrito em /privacidade; D5 estilo por imagem no PR 3; D6 confirmar fora da conversão do Ads; D7 nada guardado no navegador | dono pode rever |
| PR2a-recontato | quem volta depois da retenção de 12 meses (contato anonimizado) não informa o contato de novo pela tela: o pagar pede o WhatsApp, e o dono não tem ainda a ação no painel para recolocar o contato | PR 3: uma tela de contato reduzida (só WhatsApp e aceite) ou a ação do dono no painel |
| PR2a-banco | `vendas_iniciar_geracao` ainda aceita a conversa sem pedido (só a API recusa) | 2b: exigir o pedido confirmado também no banco, depois de conferir que nenhuma conversa antiga em produção depende disso |
| PR2a-alarme | o alarme da fila e dos pendentes aparece no painel, não no aviso diário do ntfy | se o dono quiser o aviso no celular: um tipo novo em `rotinas_conferir` |
| PR2a-selo | o selo de texto suspeito herda os falsos positivos do `pareceInjecao` (PR34-S5: "tem desconto?") | junto do PR34-S5 |
| PR2a-cloudflare | `ipDe` (`api/_freio.mjs:27`) lê o `x-forwarded-for`; atrás da Cloudflare ele vira o IP da própria Cloudflare e o freio de 3 pedidos por dia por IP barra gente de verdade (todos dividem poucos IPs). Tem de ler `cf-connecting-ip`, aceitando-o só de conexões que vêm da Cloudflare | fazer ANTES de ligar a Cloudflare (que só entra com o site 100% pronto e a autorização do dono); com teste |
| PR2a-telefone | `normalizarTelefone` (`api/_valida-app.mjs`) não trata o 0 de tronco (`021…`), o DDD inválido nem o 9º dígito (`21 8765-0000` e `21 98765-0000` viram números diferentes), então a cota por telefone (1 aberto e 2 por dia) pode dobrar para a mesma pessoa | PR 3: normalizar para E.164 completo (tirar o 0, conferir o DDD, completar o 9) antes do hash, com teste |
| PR2a-confirmar-1-toque | "Chegou: confirmar" confirma com um toque só; quem confirma o pedido errado dispara três modelos feitos à mão. Decisão do dono pendente; a recomendação é 2 toques (o mesmo `botaoDuplo` de Arquivar e Descartar) | dono decide; a troca é pequena em `js/painel-pedidos.js` |
| PR2a-antiga | quem já estava em `contato` pelo fluxo antigo (sem pedido) ainda vê o botão "Gerar as três direções" e leva "O pedido ainda não foi confirmado pelo WhatsApp" (409). Não há texto próprio com o WhatsApp para esse caso | some se as duas consultas de PR2a derem 0 antes de promover; senão, uma mensagem própria em `js/orcamento.js` |
| PR37-T3 | `fale_comigo` (ex.: loja sem `loja_plataforma` na tabela) e `sugestoes` chegam à tela e não aparecem: a pessoa vê o preço do institucional sem saber que a loja pede conversa | PR 3 do orçamento (ajustes); some sozinho quando a tabela v2, que tem a loja, for ativada |
| PR37-T4 / S2 | um `freioPacote` só para simular e confirmar (quem mexe muito pode levar 429 no "Quero"); `catalogo` sem freio; freio só na memória; 3 idas ao Supabase por chamada (`vendas_estado` pesado só para checar o dono) | PR 2 (freios no banco): freio separado para confirmar, RPC leve de dono, cache curto da tabela ativa |
| PR37-S3 | `confirmar-pacote` repetido insere uma estimativa e um evento por chamada (teto real: o freio) | PR 2: ignorar quando os fatores forem iguais, ou teto por conversa |
| PR37-S5 / T6 | o catálogo manda `max` por extra e `urgencia.prazo_fator`, que a tela não usa; `NOMES` em `formatos[]` sem efeito | PR 3: tirar do catálogo |
| PR37-S6 | `vendas_registrar_respostas`: `||` raso substitui `negocio`/`projeto`/`conteudo` inteiros e a confiança vira 0,4 (não `greatest`); sem teto de tamanho | PR 2: merge profundo, `greatest`, `pg_column_size` |
| PR37-T7 | antes de gravar o cartão diz "Site com várias páginas"; depois de recarregar, o nome da tabela ("Site institucional"), também no resumo | PR 4 (linguagem) |
| PR37-T8 | no pacote sem valor, "Esse pacote precisa de uma conversa." e o bloco do diagnóstico repetem a ideia | PR 4 (linguagem) |
| PR37-T5 | `opcoes.aoConfirmar` em `js/orcamento-perguntas.js` nunca é passado (código morto) | PR 3 |
| PR37-S7 | só com o JEV ligado: resposta sem `respostas` validadas quebra `respostasParaBriefing` (500); `alternativa`/`sugestoes`/`assumido` do JEV sem validar; `PAGINAS` duplica a tabela | antes de ligar o JEV (`BZ_JEV`) |
| PR37-T2 | sem `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET` em produção ninguém vê o preço | dono, antes de promover (ver `docs/fase2/02-OPERACAO.md` §2) |
| PR34-S5 | `pareceInjecao` marca "qual a chave do Pix?" e "tem desconto à vista?" como tentativa: só polui a métrica do funil | separar pergunta comercial de injeção |
| S1 | conferir com `curl -I` na prévia: `/CLAUDE.md`, `/scripts/processo/niveis.json`, `/.github/workflows/ci.yml`, `/vercel.json` → redirect para `/`. E as variações que o revisor pediu, **todas redirect ou 404, nunca 200**: `/%2Egithub/workflows/ci.yml`, `/CLAUDE.md/`, `//scripts/processo/niveis.json`, `/Scripts/processo/niveis.json`, `/.ENV.example` | só dá para ver numa prévia da Vercel (precisa de push); se alguma der 200, a regra precisa da forma insensível a maiúsculas ou da barra final |
| S10 (baixa) | retomada de conversa limpa pela retenção: se a pessoa voltar depois dos 60 dias e seguir até a proposta, o escopo novo sai **sem os ajustes** (as operações foram apagadas) e a prévia volta à direção escolhida, sem aviso | aceito por ora; se acontecer, avisar na tela "os ajustes de antes foram apagados pelo prazo de privacidade" (lote do front) |
| S2 | ajustes JÁ gravados guardam o motivo antigo ("não cabe…: " + texto do modelo), que a lista de ajustes mostra | só ajustes novos mudaram; os antigos saem com a retenção (60 dias) |
| F5/F7 | o navegador ainda trata 503 `recuperavel` da sessão como erro genérico; "Sua sessão terminou" + Recomeçar no 401 | lote do front (`js/orcamento-api.js`) |
| S4 | regra de limite por IP no firewall da Vercel (o freio do código é por instância) | painel da Vercel, dono |

## Depois / quando acontecer

- **Renomeação "Experiência digital"** (dono, 2026-10-09):
  - Ao ATIVAR a tabela de preços no banco, use o nome "Experiência digital" no formato `sob_medida` e não inclua o adicional `dominio_email`; o rascunho `docs/fase2/regras-rascunho-v1.json` já está assim.
  - Antes de os anúncios irem ao ar, troque "Sob Medida" nos títulos e sitelinks de `docs/google-ads/README.md` e em `docs/estrutura/TABELA-DE-PRECOS.md`.

- ~~Revisão do PR "Monte seu orçamento" (2026-10-08): (a) `/orcamento` sem `js/medicao.js`; (b) clique em "Monte seu
  orçamento" sem evento.~~ Feito no PR da medição (2026-10-09): (a) entra com `data-sem-google` (só métricas
  próprias; a CSP do pagamento segue sem Google); (b) `orcamento_iniciar`. **Continua aberto:** medir lead e sinal pago
  como conversões de verdade (servidor, quando o GA4/Ads for ligado).
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
- Das revisões do PR 15 (reserva de custo). Feito no PR 16: teste do 55P03 (trava da organização além de 2 s → 503
  com WhatsApp, sem chamar o modelo) e do `lock_timeout` restrito à transação da função (com `commit`: o `rollback`
  desfaz também um ajuste de sessão e esconderia o vazamento). Também no PR 16 (revisão de segurança, M1): `gerar-direcao`
  sem trabalho a fazer não entra mais na trava da organização — id fora da geração atual da conversa → 404, direção em
  geração por outro pedido → `em_andamento` pela consulta sem trava `app.vendas_direcao_em_andamento` (migration
  `20261008120800`); antes, o repedido de 60 s do navegador, ou alguém martelando, enfileirava a trava (503 para outros
  visitantes) e segurava reservas no teto do dia. Reserva sem `reserva_id` na resposta agora fecha (503).
  **Aceitos:** a soma do gasto do dia roda sob a trava (índice `conversas_org_atividade`; medir com o volume real);
  `privado.conversa_do` trava a conversa antes do `lock_timeout` (só espera sem limite quem martela a própria
  conversa); a função de reserva ausente (42883) segue sem reserva por desenho — as migrations `120700` e `120800`
  entram no banco ANTES do código que as usa.
- Feito no PR 16: tabela de preços com adicional ou formato nulo (ou que não é objeto) dava `TypeError` em
  `validarRegras` (500 em vez de "tabela em atualização"); agora é erro na lista.
