# Fase 2 — operação do agente de vendas (/orcamento)

Como ligar, ajustar e desligar o agente. A base (migrations, testes, segredos, backup) está em `docs/fundacao/02-OPERACAO.md`; aqui só o que a Fase 2 acrescenta.

**Nada disto foi feito em produção.** A branch `rebuild-v2` tem o código; a `main` (o site no ar) não foi tocada.

## 1. Ligar, na ordem

1. **Supabase**, no projeto da Fase 1:
   - aplicar as migrations novas: `supabase db push` (de `20261007120000` a `20261007120500`);
   - **Authentication › Sign In / Providers › Anonymous sign-ins: ligar.** O visitante do orçamento é um usuário anônimo;
   - **API › Exposed schemas: incluir `app`.** O backend chama `/rest/v1/rpc/vendas_*` com `Content-Profile: app`. Nenhuma função `vendas_*` aceita chamada de `anon` ou `authenticated`: só a chave secreta executa;
   - **Rate Limits › anonymous sign-ins: subir o limite.** O login anônimo é feito pelo servidor, então TODOS os visitantes chegam ao Supabase com os IPs da Vercel. Com o limite padrão por IP, poucas dezenas de sessões por hora derrubariam o orçamento para todo mundo;
   - recomendado pelo próprio Supabase para login anônimo: CAPTCHA (Turnstile) no cadastro. Fica para a etapa do Cloudflare, junto com a decisão de criar a sessão direto do navegador (aí o limite por IP volta a ser o de cada visitante). Até lá, o freio é o do servidor (8 sessões por IP a cada 10 minutos, na memória de cada instância).
2. **Tabela de preços.** O rascunho `docs/fase2/regras-rascunho-v1.json` precisa da aprovação do dono. **Antes de ativar**, validar
   com a mesma regra do servidor: `npm run validar:regras -- <arquivo.json>` tem de dizer "Tabela válida." (porcentagem
   do sinal inteira de 1 a 100, passo de arredondamento inteiro, etc.). Uma versão ativa inválida não quebra o site, mas
   faz o orçamento responder "tabela em atualização" para todos até entrar uma versão nova. Depois, um dono ou admin
   grava a versão como `ativa`:
   ```sql
   insert into app.regras_comerciais (org_id, versao, status, regras, fontes, aprovada_em)
   select id, 1, 'ativa', '<json aprovado>'::jsonb, 'aprovada pelo dono em <data>', now()
   from app.organizacoes where slug = 'beyon-zero';
   ```
   Sem versão ativa, a conversa avisa "tabela em atualização" e oferece o WhatsApp. Uma versão aprovada não muda mais: preço novo é versão nova, e cada estimativa guarda a versão que usou.
3. **Variáveis na Vercel** (nomes em `.env.example`):
   - `ANTHROPIC_API_KEY`, só no ambiente onde o agente deve funcionar;
   - as do Mercado Pago (`MP_*` e `CRON_SECRET`): ver `docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md` §9 e §10. Sem elas, o pagamento online fica desligado e o site oferece o WhatsApp.
4. **Plano da Vercel.** O plano Hobby proíbe uso comercial, então o site que vende precisa do Pro. A geração de cada direção roda numa chamada própria, com até 300 s (`vercel.json › functions`).
5. **Retenção** (o que a página de privacidade promete). Agendar no Supabase (pg_cron), uma vez por dia:
   ```sql
   select cron.schedule('bz-retencao', '17 4 * * *', $$ select app.vendas_reter('{}'::jsonb) $$);
   ```
   A função apaga o texto das conversas paradas há 60 dias que não fecharam (2 meses, decisão do dono de 2026-10-07;
   "fechou" = pagamento pago/estornado, cobrança pendente recente ou em produção) e anonimiza o lead do orçamento
   com IA de quem não fechou (migration `…120500_retencao_leads.sql`). Lead manual do painel nunca é tocado.
   **Procedimento da equipe:** lead do orçamento que está sendo atendido pelo WhatsApp precisa ser marcado como
   `proposta` no painel (ou editado) a cada 2 meses; `em_conversa` é o status com que o agente cria todo lead e não
   protege. Quem volta numa conversa anonimizada informa o contato de novo antes de pagar (a API recusa sem contato).
   A 1ª execução em produção pega todo o acumulado: antes de promover, contar com o mesmo critério.
   Ficam os números do funil.

## 1b. Fila manual das direções (modo econômico, decisão do dono 2026-10-08)

Enquanto não há verba para a API, as três direções não são geradas pelo modelo: o dono as produz no Claude Code e o dono avisa o cliente à mão, pelo WhatsApp dele (o painel monta a mensagem). O prazo prometido na tela é de até 24 horas úteis.

**Desde 30/10 todo pedido entra direto na fila (sem WhatsApp e sem confirmação).** A pessoa preenche os detalhes (nome do negócio, o que vende, telefone) e recebe um código **`BZ-XXXXX`**; o pedido nasce confirmado e as três direções entram na fila na mesma hora. As travas que sobraram: anti-robô, limite por IP, por /48, por telefone e por conversa, o teto de 10 pedidos na fila e o limite global de 5 pedidos por hora (ao passar, a página oferece o recado). O dono recebe um aviso pelo ntfy (`ALERTA_NTFY_TOPICO`): "Pedido novo na fila", "Recado novo" e, urgente, quando a fila enche. Curioso ou pedido sem sentido: **Descartar** no painel antes de produzir. Pedidos que estavam "aguardando" na hora da migration 20261030120000 foram promovidos a confirmados.

**Ao promover o PR 2a** (detalhe e consultas em `docs/revisoes/pr1-pendencias.md`, linha PR2a): aplicar as migrations e o código JUNTOS, nesta ordem: (1) `20261013120000_pedidos.sql` e `20261013120100_pedidos_dono.sql`; (2) rodar as duas consultas de `docs/revisoes/fila-antiga-vazia.sql` (direção na fila antiga sem pedido, e conversa antiga parada em `contato`): **têm que dar 0**; se não der, entregar e avisar esses pedidos pelo jeito antigo ou resolver pelo WhatsApp; (3) aplicar `20261013120200_fila_confirmados.sql`; (4) promover o código e rodar as consultas de novo. As conversas do fluxo antigo não têm linha em `app.pedidos` e somem da fila nova.

**Ligar, na ordem:**
1. Aplicar no banco a migration `20261009120000_fila_direcoes.sql`. Ela só acrescenta: a coluna `app.direcoes.avisada_em` e as funções `vendas_fila_direcoes`, `vendas_direcao_info` e `vendas_marcar_avisado`.
2. Definir `BZ_DIRECOES=manual` na Vercel e publicar. A tela troca "alguns minutos" por "até 24 horas úteis, avisamos pelo seu WhatsApp", o WhatsApp vira obrigatório no contato, e `gerar-direcao` responde `na_fila` sem chamar o modelo. O consultor diz o mesmo, porque `api/_vendas/consultor.mjs` lê `modoDirecoes()`.

**Como o dono atende** (precisa de `PAINEL_CHAVE`):
- `GET /api/painel?fila=direcoes` lista a fila, só com pedidos confirmados. Cada pedido traz o código `BZ-XXXXX`, a hora do pedido, o contato, o briefing, o escopo (`fatores`), as redes que a pessoa autorizou olhar e as 3 direções com a estratégia de cada uma.
- `POST /api/painel {descartar_pedido: <conversa_id>}` encerra (e para a geração, se já começou); `{arquivar_pedido: <conversa_id>}` tira da fila um pedido resolvido por fora. (Saíram `?fila=pendentes` e `confirmar_whatsapp`.)
- `POST /api/painel {entregar_direcao: <id>, conteudo: <direção>}` entrega uma direção.
  - O conteúdo segue o `ESQUEMA_DIRECAO` de `api/_vendas/direcao.mjs` e passa pelo mesmo `higienizar` da geração automática.
  - A estratégia vem do banco, nunca do arquivo.
  - Recusa com 422 o que o filtro recusa.
  - Quando as 3 ficam prontas, o cliente já pode escolher.
- `POST /api/painel {avisado: <conversa_id>}`: depois de mandar a mensagem pelo WhatsApp, o pedido sai da fila (conclui). Se a pessoa escolher um modelo antes do aviso, ou se as três direções falharem, o pedido conclui sozinho.

**No dia a dia:**
- **Painel, seção "Fila de trabalho"**: o selo "Texto suspeito: leia antes de produzir" marca o pedido cujo texto parece ordem ao modelo (às vezes é falso positivo; leia antes de produzir). Não há mais lista de espera nem "Chegou: confirmar".
- **Painel, seção "Direções na fila"** (`js/painel-fila.js`):
  - mostra cada pedido confirmado com o código `BZ-XXXXX` (para achar a conversa no WhatsApp), há quanto tempo chegou e quantas das 3 estão prontas; no teto de 10, o alarme da fila;
  - o pedido fica destacado quando passa de 20 horas;
  - com as 3 prontas, aparece **"Preparar aviso"**, que gera o link de retomada e mostra a mensagem pronta numa caixa só de leitura, com "Copiar a mensagem" e "Abrir a conversa no WhatsApp" (abre só a conversa, sem texto: o dono cola a mensagem; o link de uso único nunca vai num endereço); o link abre o pedido em qualquer aparelho, vale 7 dias e abre uma vez (preparar de novo invalida o anterior). Sem telefone, depois do "Preparar aviso" aparece "Abrir o e-mail";
  - depois de mandar, **"Já avisei"**, que conclui o pedido e o tira da fila;
  - **"Arquivar"** (resolvido por fora) e **"Descartar"** (encerra e para a geração), cada um com um segundo toque.
- **Comando `scripts/direcoes.mjs` e skill `produzir-direcoes`** (`.claude/skills/produzir-direcoes/SKILL.md`). A chave **nunca** fica na sessão do Claude Code que lê o briefing, porque o briefing é texto de visitante (revisão de segurança):
  - **O dono roda no terminal dele**, com `BZ_BASE` (https do site, conferido pelo comando) e `PAINEL_CHAVE` só ali. Sempre com o caminho ABSOLUTO do script (`node "<repo>/scripts/direcoes.mjs" <comando>`, `<repo>` com barras normais) ou com a linha que o comando anterior imprimiu: **nunca rode `node scripts/...` com caminho relativo de dentro da pasta de um pedido**, porque o que está lá é de quem escreve na pasta, não o script do projeto:
    - `fila`: só pedidos confirmados; cada linha traz o id curto, o código `BZ-XXXXX`, "avisar" ou "produzir" e, se for o caso, "TEXTO SUSPEITO";
    - `pedido <id>` (os 8 primeiros caracteres do id curto, não o código `BZ-`): grava em `~/BeyonZero-direcoes/<id>/pedido.json`, fora do repositório. O briefing vai com nome, telefone e e-mail do cliente apagados. Também imprime a linha que abre a sessão isolada (PowerShell). A produção acontece só nela: dontAsk, leitura só na pasta do pedido, escrita só nos 3 arquivos de direção, SEM Bash (a sessão não tem terminal), sem internet nem MCP. Sem Bash porque, no Windows, a guarda por hook pode não abrir ("fork: Permission denied", código 254) e deixar o comando passar, e comandos de "só leitura" (`nl`, `rg`) escapam de qualquer lista de proibições. O `pedido` também apaga um `.conferir.mjs` de versões anteriores. Antes da primeira vez, apague (ou mova para fora) `~/BeyonZero-direcoes/CLAUDE.md`, `~/BeyonZero-direcoes/.claude/` e `~/BeyonZero-direcoes/config/`, que sobraram da lista de proibições antiga. O motivo: o Claude Code lê o `CLAUDE.md` das pastas acima da pasta de trabalho, e o `pedido` se recusa a preparar a sessão enquanto eles existirem;
    - `entregar-pedido <id>` (o `pedido` imprime a linha pronta, com o caminho absoluto): as 3 de uma vez, cada arquivo no id certo, conferidas antes (filtro e varredura); recusa tudo se a pasta tiver arquivo fora do pedido; mostra o texto ao dono e pede o código sorteado (`ENTREGAR-XXXX`) antes de enviar qualquer coisa; apaga a pasta quando as 3 ficam prontas;
    - `ajustes`: lista os pedidos escritos (até 3 por cliente) esperando o dono, os 50 mais antigos e o total (o `fila` também avisa quantos há). Para cada um grava `~/BeyonZero-direcoes/<ajuste>/ajuste.json` (o texto do cliente na moldura de DADO, sem contato) e `versao.json` (a versão atual do site do cliente), e imprime a linha da sessão isolada do ajuste (só escreve o `versao.json`), a do `ajuste-feito` e a do `ajuste-recusado`. O texto do cliente nunca vai para o terminal: o dono o lê no `ajuste.json`, no editor dele;
    - `ajuste-feito <id> <versao.json>` (o `ajustes` imprime a linha pronta): confere o arquivo (filtro e varredura), a base (se o cliente ajustou depois de você baixar, recusa: apague a pasta e rode `ajustes` de novo), mostra o resultado e pede o código sorteado (`ENTREGAR-XXXX`) antes de enviar; apaga a pasta;
    - `ajuste-recusado <id>`: o cliente vê "Não incluído" e o resumo só conta. Irreversível: pede o código sorteado `RECUSAR-XXXX` (outro prefixo, para não recusar com o código de entregar). Pedido que muda o preço ou pede item da tabela se recusa aqui e se explica pelo WhatsApp;
    - `limpar [dias]`: apaga pastas esquecidas, padrão 3 dias (do dono; a sessão isolada não roda). Painel: `GET /api/painel?fila=ajustes`; sem tela por enquanto (PR 3b).
  - **O Claude Code (sessão isolada) não roda comando nenhum.** Quem confere é o dono, se quiser olhar antes de entregar:
    - `conferir <arquivo> <estrategia>` (`node "<repo>/scripts/direcoes.mjs" conferir "<pasta do pedido>/<estrategia>.json" <estrategia>`): o mesmo filtro e a mesma varredura do servidor; só abre `conversao.json`, `autoridade.json` ou `experiencia.json` dentro da pasta de um pedido.

**Voltar para a API:** apagar `BZ_DIRECOES`. Direções que estiverem na fila nesse momento são geradas pela API quando o cliente voltar à página.
- A confirmação pelo WhatsApp continua valendo no modo API (decisão D2): sem ela, nada é gerado.
- No modo API, cada pedido confirmado ainda passa pela fila do painel: com as três prontas, ele fica **"Pronto para avisar"** e **ocupa o teto de 10** até o dono tocar **"Já avisei"** ou o cliente escolher um modelo. Com a fila cheia, os detalhes de quem chega recebem o WhatsApp no lugar do pedido.
- Então, também no modo API, o dono avisa o cliente pelo WhatsApp e toca **"Já avisei"** para liberar o lugar na fila.

## 2. Desligar ou conter

- **Desligar o agente:** apagar `ANTHROPIC_API_KEY` e publicar. Desde o orçamento sem IA (PR 37), a página continua vendendo: some a conversa com o consultor e ficam as quatro perguntas, o preço pela tabela e o "Quer ajustar?". Os três modelos vão para a fila manual (o dono produz no Claude Code, skill `produzir-direcoes`). Sem as chaves do Turnstile (`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET`), ninguém vê o preço: "Ver o preço" cria a sessão e responde "O orçamento está indisponível agora". Confira as duas antes de promover.
- **Tetos de custo** (`api/_ia/config.mjs › TETOS`):
  - US$ 1,50 por conversa;
  - US$ 25 por dia;
  - 40 turnos por conversa;
  - 3 gerações de direções por conversa.
  Passou do teto: o modelo não é chamado, e a pessoa recebe o WhatsApp com o briefing salvo. Os valores são chute inicial: medir o custo real das primeiras conversas e ajustar.
- **Preço do modelo** (`PRECO_POR_MILHAO`): conferir na página de preços da Anthropic antes de ligar. O custo gravado por conversa é calculado com essa tabela.

## 2b. Prazo prometido × real (dono, 2026-10-28)

Sem trava de prazo, o prazo de cada formato (`prazo_dias` da tabela) precisa acompanhar o que a produção entrega. O caminho principal é o histórico inteiro: `node "<repo>/scripts/prazo-real.mjs" --sql` imprime uma consulta só de leitura; cole no SQL Editor do Supabase, exporte o resultado em JSON e rode `node "<repo>/scripts/prazo-real.mjs" --arquivo "<entregas.json>"`. Sai por formato: entregas, média e p75 dos dias úteis reais (do início do relógio ao dia no ar, sem a espera pelos ajustes), % no prazo e a sugestão (prazo da tabela × p75 de real ÷ prometido, arredondado para cima, só para cima, com 3 entregas ou mais). Sem argumento, com `BZ_BASE` e `PAINEL_CHAVE` no terminal, ele lê a lista do painel, que é só uma amostra parcial (as entregas concluídas saem dela) e avisa isso antes da tabela. Mudar a tabela é decisão do dono, numa versão nova.

## 3. Pagamento (Mercado Pago)

Escolhido pelo dono em 2026-10-07: Mercado Pago, Pix e cartão no próprio site. Tudo sobre o pagamento (arquitetura, credenciais, webhook, estados, incidentes, configuração de TESTE e PRODUÇÃO e o checklist do primeiro pagamento real) está em `docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md`. A pesquisa e as decisões estão em `docs/pagamentos/00-PESQUISA-E-PLANO.md`. O gateway simulado da Fase 2 foi removido. Local e testes usam um simulador fiel da Orders API (`docs/mp-simulado.mjs`).

## 4. Testar

| Comando | O que cobre |
|---|---|
| `npm run testar` | Banco real (PGlite com as migrations), motor de preço, agente, geração, alterações e o fluxo inteiro pela API. Inclui webhook forjado, velho e repetido, outro visitante, injeção, falha da IA, tetos e retenção. |
| `npm run testar:mutacao` | Sabotagens no banco que os testes precisam pegar. |
| `npm run e2e:orcamento` | A página `/orcamento` no Chromium, do primeiro texto ao projeto em produção (servidor local ligado). |
| `node docs/servidor.mjs . 8899` | Servidor local com banco, IA simulada (de graça) e a página de pagamento simulado. `BZ_IA_REAL=1` com `ANTHROPIC_API_KEY` usa o modelo de verdade, e isso **custa**. |

Antes de ligar com a IA real: rodar um conjunto de conversas de avaliação com o modelo de verdade. Conferir que os fatores extraídos batem com o caso, que nenhum valor aparece no texto e que as 3 direções saem boas o bastante para "vender sozinhas". Isso gasta crédito da API e precisa do aval do dono.

## 5. Onde olhar quando algo der errado

- **Logs da função** (Vercel): `[vendas] <ação>: código <SQLSTATE>` e `[pagamentos] aviso recusado: <motivo>`. Sem dado pessoal e sem texto da conversa.
- **Funil** (`app.eventos_funil`): `conversa_iniciada`, `estimativa_mostrada`, `contato_informado`, `direcoes_solicitadas`, `direcoes_prontas`, `direcoes_falharam`, `direcao_escolhida`, `alteracao_pedida`, `ajuste_desfeito`, `pedido_livre`, `pedido_livre_resolvido`, `escopo_apresentado`, `escopo_confirmado`, `pagamento_iniciado`, `pagamento_confirmado`, `ia_falhou`, `tentativa_bloqueada`. É onde se vê em que etapa as pessoas param.
- **Pagamento** (`app.pagamentos_auditoria`, `app.tentativas_pagamento`): a trilha financeira completa. Consultas prontas em `docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md` §7.
