# Auto-reparo do site — design (2026-11-15)

Pedido do dono (15/11): o site deve se vigiar, se consertar no que é previsível e melhorar toda semana, **sem gastar
crédito de IA para se vigiar**. Três camadas. Este documento é a especificação; o plano de execução vem depois.

## O que já existe (não refazer)

| Peça | Onde | O que faz |
|---|---|---|
| Repetição nas chamadas de IA | `api/_ia/anthropic.mjs` (`maxRetries`) | o SDK repete 2× em 408/409/429/5xx e queda de rede, com espera crescente |
| Fallback por **recusa** | idem (`fallbacks: 'default'`, Sonnet e Opus) | se o modelo recusar por política, a Anthropic tenta outro no mesmo pedido. **Não cobre queda nem sobrecarga** (referência da API) |
| Registro das chamadas | `app.ia_chamadas` | cada chamada: papel, modelo, custo, motivo do erro; sem texto de ninguém |
| Disjuntor | `app.vendas_ia_disponivel` | 5 falhas do provedor em 10 min, de 2+ conversas → o site para de chamar a IA por 10 min |
| Tetos de custo | `api/_ia/config.mjs` `TETOS` + reservas no banco | por conversa (US$ 2), por dia (US$ 25), por IP e /48 por dia; testados em `teto-dia.test.mjs` e outros |
| Reconciliação de pagamentos | cron `23 */3 * * *` → `servico.reconciliar` | confere abertos, pagos recentes (estorno/contestação) e varre orders desconhecidas; o que não coube no orçamento passa à frente na próxima |
| Rotina diária | cron `41 6 * * *` → `api/rotinas.mjs` | retenção, limpezas, alarmes de prazo; grava alertas em `app.alertas` (só no painel: **não manda nada a ninguém**) |
| Aviso ao dono | `api/_aviso.mjs` `avisarDono` | e-mail pelo binding `send_email` da Cloudflare (`AVISO_EMAIL`, só produção), textos fixos, sem dado pessoal |

O que falta: ninguém é avisado quando algo quebra fora de uma conversa (página fora, banco pausado, chave que expirou,
reconciliação parada, IA sem crédito), a queda de um modelo derruba o Zero em vez de passar para outro, e não há ciclo
de melhoria.

## Decisões

**D1. Canal: o aviso que já existe, com o Resend de reserva.** Os avisos ao dono já saem pelo binding `send_email`
(`AVISO_EMAIL` → `AVISO_PARA`, endereço verificado; grátis, sem subpedido externo). O `RESEND_API_KEY` entrou no
Worker de produção hoje (15/11) para o e-mail de confirmação ao cliente. O vigia usa `avisarDono` como os outros
avisos; `api/_aviso.mjs` ganha o Resend como **reserva**: se o binding faltar ou falhar e a chave existir, o mesmo texto
sai pelo Resend (de `avisos@beyonzero.com.br`, domínio verificado). Assim um alerta não se perde por um canal só. O
dono pediu (10/11) que o e-mail saia quando o app com push existir; troca-se num lugar só.

**D2. Memória do vigia: no banco, numa tabela própria (uma migration que o dono aplica).** O vigia precisa lembrar o
que já avisou (para não repetir toda hora). Descartados: Durable Object (o Worker de prévias deixaria de gerar os links
de prévia por branch: a Cloudflare não gera "Version URLs" para Worker que implementa Durable Object), KV (o dono
teria de criar o namespace, e o limite grátis de 1.000 gravações por dia é curto), Cache API (é por data center, e o
cron roda em qualquer um). A tabela `app.vigia` guarda, por item, `{ ativo, desde, avisado_em }`, só com
`service_role`, sem dado pessoal. Duas funções: `app.rotinas_vigia_ler` (o estado e os números que o vigia confere,
numa leitura) e `app.rotinas_vigia_gravar` (o estado novo). Bônus: a leitura de hora em hora impede o Supabase grátis
de pausar o projeto por inatividade.

**D3. Banco fora = sem memória: regra fixa.** Quando o banco não responde, o vigia não consegue ler o que já avisou.
Aí ele avisa "banco não responde" só nas rondas das 01h, 07h, 13h e 19h UTC (no máximo 4 e-mails por dia, o primeiro
em até 6 h) e, dentro do mesmo isolado do Worker, nunca duas vezes em 24 h. O caso é raro (o Supabase não pausa mais;
queda dele costuma voltar sozinha).

**D4. Cron: o de 3 em 3 horas vira de hora em hora.** O plano Free tem 5 crons por conta; hoje são 4 (2 por Worker).
Um cron novo por Worker passaria do limite. Então `23 */3 * * *` vira `23 * * * *`: nas horas múltiplas de 3 (UTC, as
mesmas de hoje) roda só a reconciliação, como sempre; nas outras 16 roda o vigia. Os dois nunca dividem a mesma
execução, então o orçamento de 50 subpedidos da reconciliação fica intacto (o vigia gasta no máximo 4). O maior
intervalo sem ronda é de 2 h. A rotina diária não muda.

**D5. Custo de IA do vigia: zero.** O vigia nunca chama modelo. A saúde da IA vem das conversas reais, pelo registro
que já existe (`app.ia_chamadas`: motivo do erro, sem conteúdo). Nada novo é anotado no caminho da conversa. (O
atendente dos sites de clientes tem tetos e avisos próprios e fica fora.)

## Camada 1 — o vigia

Arquivos novos: `api/_vigia/conferir.mjs` (as conferências feitas no Worker), `api/_vigia/decidir.mjs` (função pura:
estado + achados → novo estado + linhas do e-mail), `api/_vigia/rondar.mjs` (junta: lê, confere, decide, grava, avisa),
`supabase/migrations/20261115120000_vigia.sql`. Muda: `cloudflare/agenda.mjs`, `cloudflare/worker.mjs` (passa a hora
agendada), `wrangler.jsonc` (o cron), `api/_aviso.mjs` (o envio de texto composto e o Resend de reserva),
`api/_vendas/transporte.mjs` (o prefixo `rotinas_` já é aceito; nada muda se o nome couber).

### O que confere

| Item | Como | Falha quando |
|---|---|---|
| `paginas` | `env.ASSETS.fetch` de `/`, `/sites`, `/automacao`, `/orcamento` (sem rede externa) | status ≠ 200 ou o corpo não tem `<html` (2ª tentativa depois de 2 s) |
| `api` | `GET /api/vendas?acao=sessao-config` pelo roteador, em processo (não toca o banco nem a IA) | status ≠ 200 ou `consultor: false` (o Zero está desligado) (2ª tentativa) |
| `configuracao` | presença (sem ler valor) de Supabase, chave da Anthropic, `CRON_SECRET` com 32+, pagamentos ativos (`configPagamentos(env).ativo`), canal de aviso | falta algum; o e-mail diz qual, pelo nome |
| `banco` | `rotinas_vigia_ler` (2ª tentativa) | não responde |
| `pagamentos` | última `payment.reconciled` em `app.pagamentos_auditoria` | nenhuma em 6 h 30 (duas seguidas perdidas) |
| `rotina_diaria` | última linha `diaria` em `app.rotinas_execucoes` | nenhuma em 26 h |
| `alertas_urgentes` | `app.alertas` urgentes não resolvidos dos últimos 7 dias (pagamento que pede uma pessoa, prazo de entrega vencido, rotina que falhou…) | 1 ou mais (o e-mail diz quantos e manda abrir o painel) |
| `ia_falhando` | `app.ia_chamadas` com erro `tempo`, `limite` ou `falha` na última hora | 3 ou mais |
| `ia_conta` | `app.ia_chamadas` com erro `indisponivel` na última hora (crédito acabou, chave recusada, modelo não existe, cobrança) | 1 ou mais |

Os prazos de `pagamentos` e `rotina_diaria` contam a partir da estreia do vigia, se ela for mais recente (sem alarme
falso no 1º dia). No staging (`env.previa`) o vigia roda igual, mas sem canal de e-mail: só registra no log.

### Quando avisa (sem repetir)

- passou a falhar → entra no e-mail desta ronda;
- continua falhando → entra de novo só se o último aviso tem mais de 24 h;
- voltou ao normal depois de ter sido avisado → uma linha "voltou ao normal";
- uma ronda junta tudo num e-mail só; sem novidade, nenhum e-mail;
- o estado só é gravado como "avisado" depois que o e-mail saiu (se o envio falhar, sai na ronda seguinte).

Os textos são fixos por item; o único número é uma contagem (sem nada do cliente, nada de valor de configuração).
Exemplo:

```
URGENTE: a IA recusou a conta (crédito, chave ou modelo). O Zero está oferecendo o contato no lugar da conversa.
Voltou ao normal: as páginas do site.
Abra o painel: https://beyonzero.com.br/painel
```

**Teste de ponta a ponta:** na primeira ronda com a tabela vazia o vigia manda um e-mail único de estreia ("O vigia do
site está ligado. Ele confere o site ao longo do dia e só escreve quando algo quebra ou volta ao normal."). É o alerta
de teste que prova o caminho inteiro em produção (cron → conferências → banco → e-mail), logo depois da migration e
da promoção. Nos testes locais o mesmo caminho roda com o banco local (PGlite, as mesmas migrations) e um canal falso.

## Camada 2 — conserto previsível

1. **Fallback de modelo na queda** (`api/_ia/anthropic.mjs`): depois que as repetições do SDK acabam com 5xx/529 ou
   erro de rede (não em tempo esgotado: já se esperou demais; não em 4xx), tenta **uma** vez no modelo reserva:
   `claude-sonnet-5-5 → claude-sonnet-5` (mesmo preço), `claude-opus-5-5 → claude-opus-5`,
   `claude-haiku-5-5 → claude-sonnet-5-5` em esforço `low` (só durante a queda; os tetos continuam valendo pelo custo
   real do modelo que respondeu). Os preços dos modelos reserva entram em `PRECO_POR_MILHAO`. O registro
   (`app.ia_chamadas`) já mostra o modelo que respondeu. Com o disjuntor aberto nada disso roda (ele vem antes).
2. **Reconciliação**: conferida, cobre os casos (aberto, pago recente, desconhecido; parcial passa à frente). O que
   faltava era alguém saber quando ela para ou quando pede uma pessoa: resolvido pelos itens `pagamentos` e
   `alertas_urgentes` do vigia (a rotina diária já grava "pagamento pede uma pessoa" como alerta urgente). Sem mudança na lógica de dinheiro.
3. **Freios de custo**: conferidos, param sozinhos (reserva antes de cada chamada, teto por conversa/dia/IP/48,
   disjuntor). Achado para o dono, não mudado: o teto do dia é US$ 25, maior que o crédito da conta; quem para primeiro
   é a Anthropic (sem crédito). Agora o vigia avisa nesse caso (`ia_conta`). Baixar o teto do dia é decisão dele.

## Camada 3 — melhoria contínua semanal (desenho; depende do sim do dono)

Uma **rotina na nuvem do Claude Code** (skill `schedule`), toda segunda de manhã, que usa a assinatura do Claude Code,
não o crédito da API.

- **Entrada:** um resumo semanal **só de números**, servido pelo Worker em `GET /api/saude?acao=semana` com um token
  só de leitura (`RELATORIO_TOKEN`, segredo do Worker e da rotina, posto pelo dono): conversas iniciadas, em que etapa
  pararam, erros de IA por motivo, alertas do vigia da semana, tempo de resposta. Sem texto de conversa (o texto tem
  dado pessoal e a privacidade promete apagar). "Perguntas frequentes" vêm das categorias que o classificador já mede
  (modo sombra do JEV), não do texto.
- **Saída:** no máximo 2 PRs por semana, cada um pelo processo normal (`docs/PROCESSO.md`: teste visto vermelho,
  revisão por outro agente, CI verde) e um relatório curto no próprio PR.
- **Mescla sem o dono só se:** nível de risco ≤ 2 (`scripts/processo/nivel-de-risco.mjs`) **e** nenhum arquivo de
  dinheiro, Pix, preço, condições, privacidade ou regra de conselho/OAB (`api/_pagamentos/**`, `api/_vendas/precos*`,
  `js/orcamento*`, `condicoes.html`, `privacidade.html`, textos de nicho regulado) **e** tudo verde e revisado. O
  resto fica aberto esperando o dono. A promoção para produção continua da sessão principal.
- **Custo:** zero de API; uso da assinatura (~1 sessão por semana). **Alcance:** só o repositório do site.
- **Pedido ao dono (configuração persistente):** criar a rotina, criar o `RELATORIO_TOKEN` e aprovar a regra de mescla
  acima. Só depois disso o endpoint semanal é construído.

## Testes

- `decidir.mjs` (pura): estreia, falha nova, falha contínua < 24 h e > 24 h, volta ao normal, envio que falhou, prazos
  das rotinas a partir da estreia.
- `decidir.mjs`: banco fora sem memória (só nas horas fixas, nunca 2× em 24 h no mesmo isolado).
- Banco (PGlite, migrations reais): `rotinas_vigia_ler` conta certo (janelas de 1 h, 7 dias, 6 h 30, 26 h; só
  urgentes não resolvidos), `rotinas_vigia_gravar` grava e só aceita itens conhecidos; nenhum acesso para
  `anon`/`authenticated`.
- `conferir.mjs`: páginas/API/configuração com `ASSETS` e roteador falsos; 2ª tentativa.
- `rondar.mjs`: ponta a ponta com banco local e canal falso (estreia, falha nova, envio que falhou não marca avisado).
- `agenda.mjs`: o cron horário roda a reconciliação só nas horas múltiplas de 3 e o vigia só nas outras.
- `anthropic.mjs`: fallback só em 5xx/529/rede após as repetições, nunca em tempo/4xx; custo pelo modelo que
  respondeu.
- `wrangler.jsonc`: os crons nos dois ambientes == a AGENDA (testes que já existem, atualizados); `npm run cf:fumaca`.
- Cobertura de mutação (`npm run testar:mutacao`) nos arquivos novos.

## Fora desta entrega

- Vigia externo (se o Worker inteiro cair, o cron cai junto e ninguém avisa). Opção barata para depois: uma conferência
  de fora (GitHub Actions a cada 6 h, ~120 min/mês do plano grátis) — fica como proposta.
- Trocar o e-mail pelo push do app do dono (quando o app existir).
