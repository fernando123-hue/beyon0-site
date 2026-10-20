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
3. Migrations aplicadas no banco de produção antes de promover, entre elas a do PR 2b-2: aplicar `20261016120000_pr2b2_retomada.sql`
   (link de retomada do aviso; sem ela o painel não consegue montar o link nem a página abri-lo), e a do PR 3a: aplicar
   `20261017120000_pr3a_ajustes.sql` (ajustes sem IA; sem ela, ajustar, desfazer e o pedido livre dão erro e o estado não
   traz a origem dos ajustes). Ela ainda não foi aplicada em lugar nenhum. **Depois dela**, aplicar
   `20261020120000_auditoria_correcoes.sql` (correções da auditoria de segurança run-1: freio do consultor também por /48,
   teto do dia pelo gasto registrado, sem recálculo de preço depois da escolha, fim da porta antiga do ajuste; o nome com
   data a põe depois da do PR 3a, e ela é reaplicável). Código e migration: o código novo (`origem` sempre enviada,
   `ETAPAS_COM_PRECO`) funciona com a migration ainda não aplicada; a migration aplicada recusa (400, falha fechada) um
   código antigo que mande o ajuste sem `origem`, e esse código não está no ar (a produção ainda é a versão sem API).
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
| PR2a-D | decisões aprovadas por omissão (plano `docs/superpowers/plans/2026-10-13-orcamento-sem-ia-pr2a.md`): D1 teto 10; D2 confirmação também com IA; D3 nome opcional e sem e-mail; D4 as cinco redes por 60 dias, escrito em /privacidade; D5 estilo por imagem no PR 3b; D6 confirmar fora da conversão do Ads; D7 nada guardado no navegador | dono pode rever |
| PR2a-recontato | quem volta depois da retenção de 12 meses (contato anonimizado) não informa o contato de novo pela tela: o pagar pede o WhatsApp, e o dono não tem ainda a ação no painel para recolocar o contato | PR 3b: uma tela de contato reduzida (só WhatsApp e aceite) ou a ação do dono no painel |
| PR2a-banco | ~~`vendas_iniciar_geracao` ainda aceita a conversa sem pedido (só a API recusa)~~ | feito na revisão final do PR 2a: o banco exige o pedido confirmado também sem linha em `app.pedidos`. As duas consultas de PR2a (acima), antes de promover, são a conferência de que nenhuma conversa antiga depende disso |
| PR2a-alarme | o alarme da fila e dos pendentes aparece no painel, não no aviso diário do ntfy | se o dono quiser o aviso no celular: um tipo novo em `rotinas_conferir` |
| PR2a-selo | o selo de texto suspeito herda os falsos positivos do `pareceInjecao` (PR34-S5: "tem desconto?") | junto do PR34-S5 |
| PR2a-cloudflare | `ipDe` (`api/_freio.mjs:27`) lê o `x-forwarded-for`; atrás da Cloudflare ele vira o IP da própria Cloudflare e o freio de 3 pedidos por dia por IP barra gente de verdade (todos dividem poucos IPs). Tem de ler `cf-connecting-ip`, aceitando-o só de conexões que vêm da Cloudflare | fazer ANTES de ligar a Cloudflare (que só entra com o site 100% pronto e a autorização do dono); com teste |
| PR2a-telefone | `normalizarTelefone` (`api/_valida-app.mjs`) não trata o 0 de tronco (`021…`), o DDD inválido nem o 9º dígito (`21 8765-0000` e `21 98765-0000` viram números diferentes), então a cota por telefone (1 aberto e 2 por dia) pode dobrar para a mesma pessoa | PR 3b: normalizar para E.164 completo (tirar o 0, conferir o DDD, completar o 9) antes do hash, com teste |
| PR2a-confirmar-1-toque | ~~"Chegou: confirmar" confirma com um toque só; quem confirma o pedido errado dispara três modelos feitos à mão. Decisão do dono pendente; a recomendação é 2 toques (o mesmo `botaoDuplo` de Arquivar e Descartar)~~ | **feito no PR #41** (2 toques, decisão do dono 2026-10-14) |
| PR2a-antiga | quem já estava em `contato` pelo fluxo antigo (sem pedido) ainda vê o botão "Gerar as três direções" e leva "O pedido ainda não foi confirmado pelo WhatsApp" (409). Não há texto próprio com o WhatsApp para esse caso | some se as duas consultas de PR2a derem 0 antes de promover; senão, uma mensagem própria em `js/orcamento.js` |
| PR2a-ordem-trava | ~~`vendas_mudar_pedido` trava as direções com `for update of d` sem `order by`: duas travas da mesma conversa em ordens diferentes podem esperar uma pela outra (40P01)~~ | **feito no PR 2b-1** |
| PR2b-avisado | `vendas_marcar_avisado` (migration 20261013120100_pedidos_dono.sql) atualiza direções sem ordem de trava: um "Já avisei" e um "Descartar/Arquivar" ao mesmo tempo no mesmo pedido ainda podem dar 40P01 (achado da revisão do PR 2b-1); o mesmo vale para `vendas_escolher` (trava a conversa e, pela chave estrangeira de `app.escolhas`, a direção), ver PR2b1-escolher-trava | **feito no PR 3a** (`privado.travar_direcoes`: uma ordem só, direções por id e depois a conversa, com teste de ordem) |
| PR2b1-varredura-fp | ~~varredura (`scripts/varredura.mjs`): falsos positivos conhecidos, todos para o lado seguro: faixa de preço "R$ 2500-3500" vira telefone (`fixoSemDdd`); IPv4 com octeto acima de 255; texto longo com hífens e dígitos vira chave; achado repetido (chave AIza também como telefone); "Um ponto com desconto" (endereço por extenso); "Fale com @equipe" (perfil); "10 Ω" (letra de outro alfabeto); código de barras de 14 dígitos (CNPJ); qualquer sequência de 11 dígitos (CPF). Falsos negativos: domínios fora da lista de TLDs (`.pt`, `.fr`, `.digital`) passam sem achado; telefone com o "9" solto e sem parênteses (`21 9 8765-4321`, `21 9.8765.4321`); ponto disfarçado com espaço ou sinal (`golpe . com`, `golpe(dot)com`, `golpe·com`); hoje quem cobre é a leitura do dono. O servidor também recusa desde o PR #43; corrigir com teste por caso~~ | **corrigido no PR 2b-2** (um teste por caso, em `docs/testes/varredura-casos.test.mjs`; os alarmes e as perdas que sobram estão declarados no cabeçalho de `api/_vendas/varredura.mjs`) |
| PR2b1-conferir-caminho | ~~`arquivoDeDirecao` (`scripts/direcoes.mjs`) compara o caminho resolvido sem seguir junção/link e aceita a pasta de outro pedido (`../<outro>/conversao.json`); `prepararPastaSessao` grava `.sessao.json` e `.instrucoes.md` seguindo um link já existente. Hoje a sessão isolada não tem terminal (não cria link) e o `conferir`, que agora é só do dono, só devolve OK/RECUSADA, o nome do conceito e trechos curtos (o achado de segurança que a tornava grave, o conferir repetir o argumento, foi corrigido no PR #43)~~ | **corrigido no PR 2b-2** (`realpath` + `lstat` em `pastaReal`/`direcaoReal`, `gravarNovo` apaga antes de gravar) |
| PR2b1-motivo-request | o log de motivo desconhecido (`recusaDoMotivo`, `api/_vendas/fluxo-pedido.mjs`) sai sem `request_id` | **feito no PR 3a** (o `requestId` de `criarAcoesDoPedido` chega ao log do motivo) |
| PR2b1-escolher-trava | `vendas_escolher` trava a conversa e depois, pela chave estrangeira de `app.escolhas`, a direção; `vendas_mudar_pedido` trava as direções e depois a conversa. "Arquivar" no painel no mesmo instante em que o cliente escolhe pode dar 40P01. O "sem espera circular" da migration 20261015120000 vale só contra `vendas_concluir_direcao` | **feito no PR 3a**, junto do PR2b-avisado: uma ordem só (direções por id, depois a conversa) em todas as funções que tocam as duas, com teste |
| PR2b1-entrega-teste | ~~a parte do `entregar-pedido` que mostra o texto, pede o código e só então faz o POST (`scripts/direcoes.mjs`) não tem teste; a ordem está provada só por leitura~~ | **corrigido no PR 2b-2** (`entregarPedido`/`planejarEntrega` extraídos, com teste de que a recusa não faz POST) |
| PR2b1-ancestrais | ~~`prepararPastaSessao` confere `CLAUDE.md`/`.claude` só em `~/BeyonZero-direcoes`; o Claude Code lê `CLAUDE.md` de todas as pastas acima (ex.: `~/CLAUDE.md`)~~ | **corrigido no PR 2b-2** (`configsAcima` sobe até a raiz do disco; o preparo recusa antes de tocar em qualquer coisa) |
| PR2b2-prazo-vencido | o texto que aparece quando o prazo das 24 horas úteis já passou ("O prazo era <data>. Os seus modelos ainda estão em produção; avisamos pelo seu WhatsApp assim que ficarem prontos.") é uma sugestão do agente, não texto aprovado | **dono confirma** o texto antes de promover; fica na constante `PRAZO_VENCIDO` de `js/orcamento-preparo.js` |
| PR2b2-a | o tempo esgota depois de o servidor gastar o link de retomada (resposta perdida depois do commit): o novo toque dá 410 e, sem sessão, só sobra o WhatsApp | aceito: corrida rara, e a saída pelo WhatsApp é honesta; corrigir pede idempotência no servidor |
| PR2b2-b | "Reduzir movimento" recarrega a página antes do toque em "Abrir o meu pedido" e perde o código do link | aceito: raro (quem vem pelo link vem para tocar); saída: pedir outro link pelo WhatsApp; corrigir mexe no interruptor de todas as páginas |
| PR2b2-c | se a releitura do estado falha depois de abrir o pedido, o aviso nasce quieto e o foco vai ao título; `focarTitulo` repete `irPara` | aceito: o caminho de erro já mostra o aviso; a repetição coube no limite de linhas de `js/orcamento.js` |
| PR2b2-e | a checagem de rolagem lateral da retomada no E2E passou de 375x667 para 320x400 | aceito: 320x400 é o caso mais apertado, sem ganho em voltar |
| PR2b2-g | a rede de segurança do load da retomada não cobre falha do próprio `js/orcamento.js` | pré-existente: sem esse arquivo a página inteira não funciona, com ou sem link |
| PR2b2-j | o fuso do aparelho decide o que é fim de semana na conta das 24 horas úteis; feriado não entra na conta | aceito: o brief escolheu assim, o público está no Brasil, e o prazo vencido agora tem frase própria (PR2b2-prazo-vencido) |
| PR2b2-k | sem teste de mutação para "some com as três prontas" (Task 4, M1) | o E2E isola o caso (`manualTodasProntas`); a mutação é extra |
| PR2b2-n | o teste de link simbólico de ARQUIVO real (`direcaoReal`) não roda no Windows (sem permissão de symlink) | o hard link cobre o mesmo caminho de código (`nlink`); roda onde o symlink existe |
| PR2b2-o | alarmes novos e aceitos da varredura: "Salão.Vip", "Fit.Live", "Promoção . Me"; "(ponto" seguido de palavra que também é TLD (co-working, tv, vip, live, shop, digital); número no formato de CPF com pontos alarma com qualquer rótulo (~1%); perda: "Golpe.Sh" | lado seguro, o dono lê e libera; declarados no cabeçalho de `api/_vendas/varredura.mjs` |
| PR2b2-M3 | `docs/e2e-orcamento.mjs` tem 894 linhas, acima do teto de 800 das restrições do plano | dividir depois: levar "retomada + lembretes" (~linhas 320–560) para `docs/e2e-retomada.mjs` |
| PR2b2-M5 | o "7 dias" do link está escrito à mão em `js/painel-fila.js`, `js/painel-lembretes.js` e `js/painel-pedido-comum.js`; repete `DIAS_RETOMADA` do servidor, e a mensagem ao cliente mentiria se ele mudasse | o servidor já devolve `expira_em`: usar o valor dele, ou um comentário de ligação em cada arquivo |
| PR2b2-M6 | o aparelho que já tinha OUTRA conversa em andamento a perde, sem aviso, quando abre o link de retomada (`js/orcamento-api.js`, `js/orcamento-retomada.js`) | aceito: raro (dois orçamentos no mesmo aparelho), e a conversa antiga continua no servidor |
| PR2b2-M7 / B2 | cada código errado ou já usado cria um usuário anônimo sem conversa no Auth, e o aparelho antigo também vira órfão; não existe limpeza de anônimos (vale também para toda `sessao` abandonada) | Turnstile e o freio de 8 por 10 min limitam; junto da Segurança M1 (acima): `vendas_reter` apagar anônimos sem conversa, ou apagar o visitante recém-criado no 410 |
| PR2b2-B3 | o código do link fica no histórico global do navegador até o toque (o `replaceState` limpa só a barra e a entrada atual); num aparelho compartilhado, quem abre o histórico pode usar o código por até 7 dias | aceito e escrito no comentário de `js/orcamento-retomada.js`; opções: prazo menor para o link nunca usado (72 h) ou só aceitar com a etapa `direcoes`/`escolhida` |
| PR2b2-B4 | o painel monta o link com a origem (`location.origin`) em que está aberto: aberto num domínio de prévia, a mensagem ao cliente leva esse domínio | **o dono abre o painel sempre pelo endereço de produção**; opção: constante de produção ou aviso quando o host não é o oficial |
| PR2b2-menores | das Tasks 1–2: `vendas_lembretes` não valida `dias`; `vendas_usar_retomada` com `visitante_id` inválido lança erro em vez de devolver `{ok:false}`; `vendas_marcar_lembrete` não confere a etapa (marca qualquer pedido confirmado da organização); o total do lembrete é recalculado na API; `app.retomadas` não tem retenção (só hash, sem dado pessoal); a corrida de dois usos do mesmo link está provada por raciocínio, não por teste (o PGlite tem uma conexão só) | inalcançáveis de fora (o servidor manda um uuid próprio e `dias=2`, e só o painel chama); a retenção entra na rotina diária depois |
| PR2a-quero-repetido | o "Quero" com o mesmo pacote volta cedo (PR37-S3) e não grava as respostas: mudar só a cidade ou o material e tocar "Quero" de novo não chega ao briefing | PR 3b: gravar as respostas quando só elas mudaram (sem estimativa nova) |
| PR2a-motivo-log | ~~motivo desconhecido de `vendas_registrar_detalhes` vira 409 "só uma vez" sem log (`api/_vendas/fluxo-pedido.mjs`)~~ | **feito no PR 2b-1** |
| PR2a-testes-borda | ~~faltam, nas funções novas do PR 2a, os testes de outro visitante (P0002) e de entrada inválida (22023) que as antigas têm, uma por uma~~ | **feito no PR 2b-1** |
| PR2a-congelar | `regrasAtivas` congela a tabela só quando ela vem do cache; a leitura sem cache volta mutável (quem a alterar muda só a sua cópia, mas o contrato fica diferente nos dois caminhos) | PR 3b: congelar nos dois caminhos |
| PR2a-chips | chips do "o que você vende": no modo consultor aparecem os genéricos (o ramo não está no briefing); o chip continua marcado depois que a pessoa apaga o texto à mão; o toque que passaria de 200 caracteres é ignorado sem aviso | PR 3b (front dos detalhes) |
| PR2a-regex-codigo | o formato do código `BZ-XXXXX` (alfabeto sem as letras que confundem) está escrito em uns 5 lugares (migration, `js/orcamento-detalhes.js`, `api/painel.mjs`, testes, E2E) | PR 3b: uma constante por lado (servidor e navegador), com teste de que são iguais |
| PR2a-truncada | ~~`truncada` da fila em `api/painel.mjs` é sempre falso: `vendas_fila_direcoes` não corta mais em 50, então `total` é sempre o tamanho da lista~~ | **feito no PR 2b-1** |
| PR2a-testes-nomes | ~~um nome de teste repetido (achado da revisão técnica final) e o gerador de telefone de teste escrito três vezes (`telefoneNovo`, `telefoneDeTeste`, `telefone()`)~~ | **feito no PR 2b-1** |
| PR2a-log-versao | ~~o log de "tabela de preços ativa inválida" (`api/_vendas/regras-ativas.mjs`) grava `r.versao`, mas a linha vem com `id`: o campo sai sempre nulo~~ | **feito no PR 2b-1** |
| PR2a-api-para-manual | trocar do modo API para o manual com uma conversa cujas três direções falharam deixa a pessoa sem "Gerar de novo" (o manual aceita uma geração só) | dono resolve pelo WhatsApp se acontecer; PR 3b: o dono regera pelo painel |
| PR2a-plano-expirar | ~~o plano diz que `vendas_expirar_pedidos` é "por organização"; ela roda para todas as organizações de uma vez (é a rotina diária)~~ | **feito no PR 2b-1** |
| PR2a-teto-pacotes | ~~o teto de 30 pacotes por conversa vale só em `vendas_registrar_respostas`; `vendas_registrar_estimativa` (o caminho do consultor) não tem teto~~ | **feito no PR 2b-1** |
| PR2a-dono-leitura | ~~`vendas_conversa_dono`, uma leitura, trava a conversa com FOR UPDATE (via `privado.conversa_do`): a consulta leve espera atrás de quem grava~~ | **feito no PR 2b-1** |
| PR2a-22P02 | ~~parâmetro malformado que chega ao banco (número que não é número num campo convertido) dá 22P02, que `traduzirErro` não traduz: vira 500~~ | **feito no PR 2b-1** |
| PR2a-freio-segredo | o HMAC do IP e do telefone usa `FREIO_SEGREDO` ou, sem ele, reaproveita `SUPABASE_CHAVE_SECRETA`: trocar a chave do Supabase muda todas as chaves do freio, e um vazamento de uma vale para a outra | **dono:** criar a variável `FREIO_SEGREDO` própria na Vercel (32+ caracteres aleatórios) antes de promover |
| PR37-T3 | `fale_comigo` (ex.: loja sem `loja_plataforma` na tabela) e `sugestoes` chegam à tela e não aparecem: a pessoa vê o preço do institucional sem saber que a loja pede conversa | PR 3b do orçamento; some sozinho quando a tabela v2, que tem a loja, for ativada |
| PR37-T4 / S2 | um `freioPacote` só para simular e confirmar (quem mexe muito pode levar 429 no "Quero"); `catalogo` sem freio; freio só na memória; 3 idas ao Supabase por chamada (`vendas_estado` pesado só para checar o dono) | PR 2 (freios no banco): freio separado para confirmar, RPC leve de dono, cache curto da tabela ativa |
| PR37-S3 | `confirmar-pacote` repetido insere uma estimativa e um evento por chamada (teto real: o freio) | PR 2: ignorar quando os fatores forem iguais, ou teto por conversa |
| PR37-S5 / T6 | o catálogo manda `max` por extra e `urgencia.prazo_fator`, que a tela não usa; `NOMES` em `formatos[]` sem efeito | PR 3b: tirar do catálogo |
| PR37-S6 | `vendas_registrar_respostas`: `||` raso substitui `negocio`/`projeto`/`conteudo` inteiros e a confiança vira 0,4 (não `greatest`); sem teto de tamanho | PR 2: merge profundo, `greatest`, `pg_column_size` |
| PR37-T7 | antes de gravar o cartão diz "Site com várias páginas"; depois de recarregar, o nome da tabela ("Site institucional"), também no resumo | PR 4 (linguagem) |
| PR37-T8 | no pacote sem valor, "Esse pacote precisa de uma conversa." e o bloco do diagnóstico repetem a ideia | PR 4 (linguagem) |
| PR37-T5 | `opcoes.aoConfirmar` em `js/orcamento-perguntas.js` nunca é passado (código morto) | PR 3b |
| PR37-S7 | só com o JEV ligado: resposta sem `respostas` validadas quebra `respostasParaBriefing` (500); `alternativa`/`sugestoes`/`assumido` do JEV sem validar; `PAGINAS` duplica a tabela | antes de ligar o JEV (`BZ_JEV`) |
| PR37-T2 | sem `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET` em produção ninguém vê o preço | dono, antes de promover (ver `docs/fase2/02-OPERACAO.md` §2) |
| PR34-S5 | `pareceInjecao` marca "qual a chave do Pix?" e "tem desconto à vista?" como tentativa: só polui a métrica do funil | separar pergunta comercial de injeção |
| S1 | conferir com `curl -I` na prévia: `/CLAUDE.md`, `/scripts/processo/niveis.json`, `/.github/workflows/ci.yml`, `/vercel.json` → redirect para `/`. E as variações que o revisor pediu, **todas redirect ou 404, nunca 200**: `/%2Egithub/workflows/ci.yml`, `/CLAUDE.md/`, `//scripts/processo/niveis.json`, `/Scripts/processo/niveis.json`, `/.ENV.example` | só dá para ver numa prévia da Vercel (precisa de push); se alguma der 200, a regra precisa da forma insensível a maiúsculas ou da barra final |
| S10 (baixa) | retomada de conversa limpa pela retenção: se a pessoa voltar depois dos 60 dias e seguir até a proposta, o escopo novo sai **sem os ajustes** (as operações foram apagadas) e a prévia volta à direção escolhida, sem aviso | aceito por ora; se acontecer, avisar na tela "os ajustes de antes foram apagados pelo prazo de privacidade" (lote do front) |
| S2 | ajustes JÁ gravados guardam o motivo antigo ("não cabe…: " + texto do modelo), que a lista de ajustes mostra | só ajustes novos mudaram; os antigos saem com a retenção (60 dias) |
| F5/F7 | o navegador ainda trata 503 `recuperavel` da sessão como erro genérico; "Sua sessão terminou" + Recomeçar no 401 | lote do front (`js/orcamento-api.js`) |
| S4 | regra de limite por IP no firewall da Vercel (o freio do código é por instância) | painel da Vercel, dono |

### PR 3a (ajustes sem IA; branch `orcamento-pr3a`): o que ficou de fora

Das revisões técnica e de segurança finais do PR 3a (`.superpowers/sdd/pr3a-final-tecnica-review.md` e `pr3a-final-seguranca-review.md`).
Corrigido no próprio PR: seção acrescentada com 12 seções (agora 422), privacidade e aviso do pedido escrito, pedido livre
arquivado no meio (WhatsApp), a fila de pedidos livres com 50 e o total, código `RECUSAR-`, conferência da pasta antes de apagar.
Fora da lista abaixo, já previsto no plano: a troca de "direção" por "modelo" nos textos antigos, incluindo o resumo
(`linhaAlteracao`: "cores da direção N"), fica para o PR 4; mudança de preço a partir dos ajustes, a tela de pedidos livres
no painel, "Pagar sem medo" (§5) e D5 ficam para o PR 3b.

| id | pendência | quando |
|---|---|---|
| PR3a-reter-trava | ciclo de travas novo com a retenção: `vendas_desfazer_alteracao`/`vendas_resolver_pedido_livre` travam conversa→alteração; `vendas_reter` faz alteracoes→conversas. Raro (conversa parada 60 dias), o Postgres detecta 40P01 | registrar pendência ou fazer a retenção travar a conversa antes |
| PR3a-fluxo-api-tamanho | `docs/testes/fluxo-api.test.mjs` tem 838 linhas (teto de 800) | compensar (dividir o arquivo) depois |
| PR3a-apagador-contato | o texto do pedido livre vai à sessão isolada só redigido, sem o `apagador(contato)` do briefing (`scripts/direcoes.mjs`); a tela e a privacidade já pedem para não escrever nome nem contato | se o nome do cliente aparecer nos pedidos, aplicar o mesmo apagador do briefing |
| PR3a-ordem-teste | o teste da ordem de travas usa uma lista fixa de funções | varrer `pg_proc` para pegar função nova que insira em escolhas/alterações/propostas |
| PR3a-fila-resumo | pedido livre "aguardando" quando o cliente vai ao resumo sai da fila do dono (a fila só lista a etapa de ajustes) e não aparece em lugar nenhum, embora a tela tenha prometido "Seu pedido entra junto; não atrasa o início" | PR 3b: mostrar ao dono, no projeto ou no painel, os pedidos que ficaram aguardando |
| PR3a-recontagem-concorrente | se outra leitura do estado estiver em andamento, a releitura depois de um erro de rede pode não ver o ajuste gravado, e o aviso de erro aparece mesmo assim (a lista se corrige logo depois) | aceito; é o mesmo comportamento da conversa (`falhaNoEnvio`) |
| PR3a-botoes-em-voo | botões refeitos durante uma ação nascem sem `aria-disabled` (o toque é engolido sem efeito colateral) | aceito |
| PR3a-e2e | falta E2E do foco indo para `#o-livre-conta` no 3º pedido; o harness usa uma flag só para os dois tipos de falha forçada | PR 3b |
| PR3a-testes-fracos | `auditoria-p1` conta só o papel `extracao` (a prova real, com dublê que falha se chamado, está em `ajustes-api`); `ajustes-api` compara `contas.ia` em valor absoluto; numeração das seções do `auditoria-p0` | aceito |
| PR3a-script-servidor-antigo | o comando `ajustes`, contra um servidor sem o PR 3a, diz "Nenhum ajuste" (verdade nesse caso) | aceito |
| PR3a-pedido-em | `pedidoParaModelo` grava `pedido_em` como vem do servidor (já existia; o valor vem do banco) | aceito |
| PR3a-pagina-antiga | uma página em cache que chame a ação `alterar` (o ajuste pela IA, que saiu) recebe 404 "Ação inválida." | aceito; a API e o JS são publicados juntos |
| PR3a-botoes-mono | "Está bom assim: ver o resumo", "Abrir prévia" e "Escolher esta" continuam em mono e caixa alta (`orcamento.html`, `js/orcamento.js`) | dono decide, olhando as fotos `8-ajustes-*`; visual já aprovado antes do PR |
| ~~PR3a-origem-ia~~ | ~~sem `origem`, `vendas_registrar_alteracao` assume `'ia'` (sem teto de 30, aceita `estimativa`): porta antiga aberta de propósito para o código velho funcionar enquanto a migration chega antes. Só `service_role`; nenhum código do PR usa (segurança #1)~~ | **feito no PR de correções da auditoria** (`20261020120000_auditoria_correcoes.sql`: só a origem `'opcao'` grava; sem origem ou `'ia'` é 22023; a função deixou de chamar `vendas_registrar_estimativa`. A produção ainda é a versão sem API, então não havia código antigo a proteger) |
| PR3a-resumo-base | o resumo (`vendas_apresentar_escopo`) não fica preso à versão lida: o "feito" do dono entre a leitura e a gravação deixa o contrato descrevendo a versão anterior (segurança #2) | mandar o `ajuste_atual` como `base_id` do escopo e recusar com 40001 se mudou |
| PR3a-desfazer-descartado | `vendas_desfazer_alteracao` não confere "descartado" no banco (a API barra com `exigirNaoDescartado`); camada extra opcional (segurança #8) | só se quiser defesa em profundidade |
| ~~PR3a-consultor-preco~~ | ~~a pista 4 da auditoria (o consultor recalcula preço depois da escolha, pelo `estimar` em escolhida/alterações) NÃO é corrigida pelo PR 3a, que só melhora um pouco (sai o `alterar`)~~ | **feito no PR de correções da auditoria** (`ETAPAS_COM_PRECO` em `api/_vendas/consultor.mjs`: a lista de ferramentas, a recusa do agente e o que o turno grava só deixam `estimar` e `pedir_contato` até o pedido ser confirmado pelo WhatsApp; `app.vendas_registrar_estimativa` recusa o resto, e também a conversa com pedido já confirmado mesmo em `contato` (as três direções falham e a conversa volta para lá), 55000; `precoAberto(etapa, statusDoPedido)` fecha igual no JS; o prompt diz "até a confirmação do pedido pelo WhatsApp") |

## Depois / quando acontecer

- **Auditoria de segurança run-1 (20/10/2026)** — `06 Operação/Auditoria de segurança/run-1/NEEDS-VALIDATION.md`
  (as 9 pistas). **Feitas no PR de correções da auditoria:** pista 1 (o freio diário do consultor também por /48; fica
  de fora quem tem vários IPv4: Firewall da Vercel na criação da sessão e limite de gasto na Anthropic, com o dono),
  pista 2 (o teto do dia lê o gasto registrado de hoje, `app.ia_chamadas`), pista 4 (o consultor não recalcula o preço
  depois da escolha) e pista 6 (`*.sql`, `*.dump` e `*.7z` no `.vercelignore`; o backup é gravado fora da pasta do
  projeto), mais a PR3a-origem-ia. **Seguem abertas:** pistas 3 (disjuntor da IA), 5 (`POST /api/evento` sem limite
  global), 7 e 8 (retenção e exclusão a pedido, LGPD) e 9 (as cópias de segurança e a exclusão).

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
  **Aceitos:** a soma do gasto do dia roda sob a trava (desde a auditoria run-1 ela lê `app.ia_chamadas` pelo índice
  `ia_chamadas_org (org_id, created_at desc)`; medir com o volume real);
  `privado.conversa_do` trava a conversa antes do `lock_timeout` (só espera sem limite quem martela a própria
  conversa); a função de reserva ausente (42883) segue sem reserva por desenho — as migrations `120700` e `120800`
  entram no banco ANTES do código que as usa.
- Feito no PR 16: tabela de preços com adicional ou formato nulo (ou que não é objeto) dava `TypeError` em
  `validarRegras` (500 em vez de "tabela em atualização"); agora é erro na lista.
