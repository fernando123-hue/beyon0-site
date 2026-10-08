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

Enquanto não há verba para a API, as três direções não são geradas pelo modelo: o dono as produz no Claude Code e o cliente é avisado pelo WhatsApp. O prazo prometido na tela é de até 24 horas úteis.

**Ligar, na ordem:**
1. Aplicar no banco a migration `20261009120000_fila_direcoes.sql`. Ela só acrescenta: a coluna `app.direcoes.avisada_em` e as funções `vendas_fila_direcoes`, `vendas_direcao_info` e `vendas_marcar_avisado`.
2. Definir `BZ_DIRECOES=manual` na Vercel e publicar. A tela troca "alguns minutos" por "até 24 horas úteis, avisamos pelo seu WhatsApp", o WhatsApp vira obrigatório no contato, e `gerar-direcao` responde `na_fila` sem chamar o modelo. O consultor diz o mesmo, porque `api/_vendas/consultor.mjs` lê `modoDirecoes()`.

**Como o dono atende** (precisa de `PAINEL_CHAVE`):
- `GET /api/painel?fila=direcoes` lista a fila. Cada pedido traz a hora do pedido, o contato, o briefing, o escopo (`fatores`) e as 3 direções com a estratégia de cada uma.
- `POST /api/painel {entregar_direcao: <id>, conteudo: <direção>}` entrega uma direção.
  - O conteúdo segue o `ESQUEMA_DIRECAO` de `api/_vendas/direcao.mjs` e passa pelo mesmo `higienizar` da geração automática.
  - A estratégia vem do banco, nunca do arquivo.
  - Recusa com 422 o que o filtro recusa.
  - Quando as 3 ficam prontas, o cliente já pode escolher.
- `POST /api/painel {avisado: <conversa_id>}`: depois de mandar a mensagem pelo WhatsApp, o pedido sai da fila.

A tela da fila no painel e o comando local do Claude Code vêm no PR seguinte.

**Voltar para a API:** apagar `BZ_DIRECOES`. Direções que estiverem na fila nesse momento são geradas pela API quando o cliente voltar à página.

## 2. Desligar ou conter

- **Desligar o agente:** apagar `ANTHROPIC_API_KEY` e publicar. A página continua de pé, com a resposta "indisponível" e o WhatsApp.
- **Tetos de custo** (`api/_ia/config.mjs › TETOS`):
  - US$ 1,50 por conversa;
  - US$ 25 por dia;
  - 40 turnos por conversa;
  - 3 gerações de direções por conversa.
  Passou do teto: o modelo não é chamado, e a pessoa recebe o WhatsApp com o briefing salvo. Os valores são chute inicial: medir o custo real das primeiras conversas e ajustar.
- **Preço do modelo** (`PRECO_POR_MILHAO`): conferir na página de preços da Anthropic antes de ligar. O custo gravado por conversa é calculado com essa tabela.

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
- **Funil** (`app.eventos_funil`): `conversa_iniciada`, `estimativa_mostrada`, `contato_informado`, `direcoes_solicitadas`, `direcoes_prontas`, `direcoes_falharam`, `direcao_escolhida`, `alteracao_pedida`, `escopo_apresentado`, `escopo_confirmado`, `pagamento_iniciado`, `pagamento_confirmado`, `ia_falhou`, `tentativa_bloqueada`. É onde se vê em que etapa as pessoas param.
- **Pagamento** (`app.pagamentos_auditoria`, `app.tentativas_pagamento`): a trilha financeira completa. Consultas prontas em `docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md` §7.
