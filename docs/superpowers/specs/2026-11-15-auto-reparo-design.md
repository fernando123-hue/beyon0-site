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

**D2. Memória do vigia: um Durable Object (`Vigia`), não o banco.** O vigia precisa lembrar o que já avisou (para não
repetir toda hora) e quando cada rotina rodou bem. Se essa memória ficasse no Supabase, o caso mais importante (banco
fora ou pausado por inatividade) deixaria o vigia sem memória e mandaria e-mail de hora em hora. O Durable Object com
SQLite é grátis no plano Free, nasce sozinho no deploy (migration no `wrangler.jsonc`, sem o dono criar nada no
painel) e não depende do Supabase. Uma instância só (`idFromName('vigia')`). Uso estimado: ~50 pedidos por dia
(limite grátis: 100 mil).

**D3. Sem migration de banco.** Nada desta entrega exige o dono rodar SQL em produção.

**D4. Cron: o de 3 em 3 horas vira de hora em hora.** O plano Free tem 5 crons por conta; hoje são 4 (2 por Worker).
Um cron novo por Worker passaria do limite. Então `23 */3 * * *` vira `23 * * * *`: toda hora roda o vigia; nas horas
múltiplas de 3 (UTC, as mesmas de hoje) roda antes a reconciliação, como sempre. A rotina diária não muda.

**D5. Custo de IA do vigia: zero.** O vigia nunca chama modelo. A saúde da IA vem das conversas reais: cada falha do
provedor que o código já classifica (`ErroIA`) é anotada no `Vigia` (motivo e hora, nada mais).

## Camada 1 — o vigia

Arquivos novos: `api/_vigia/conferir.mjs` (as conferências), `api/_vigia/decidir.mjs` (função pura: estado + resultado
→ novo estado + avisos), `cloudflare/vigia-do.mjs` (o Durable Object, fino: guarda o JSON e chama `decidir`).

### O que confere, toda hora

| Item | Como | Falha quando |
|---|---|---|
| `paginas` | `env.ASSETS.fetch` de `/`, `/sites`, `/automacao`, `/orcamento` (sem rede externa) | status ≠ 200 ou o corpo não tem `<html` (uma 2ª tentativa depois de 2 s antes de falhar) |
| `api` | `GET /api/vendas?acao=sessao-config` pelo roteador, em processo (não toca o banco nem a IA) | status ≠ 200 ou `consultor: false` (o Zero está desligado) (2ª tentativa) |
| `banco` | leitura de `vendas_ia_disponivel` (só leitura, 1 subpedido) | o banco não responde (2ª tentativa) |
| `ia_falhando` (também) | a mesma leitura diz se o disjuntor está aberto agora | disjuntor aberto |
| `configuracao` | presença (sem ler valor) de Supabase, chave da Anthropic, `CRON_SECRET` com 32+, pagamentos ativos (`configPagamentos(env).ativo`), canal de aviso | falta algum; o e-mail diz qual, pelo nome |
| `pagamentos` | o `Vigia` guarda a hora da última reconciliação que respondeu 200 | nenhuma em 6 h 30 (duas seguidas perdidas) |
| `pagamento_atencao` | o resumo da reconciliação traz `atencao` (eventos que pedem uma pessoa) | `atencao > 0` |
| `rotina_diaria` | o `Vigia` guarda a última rotina diária que respondeu 200 e quantos alertas **urgentes** ela deixou | nenhuma em 26 h, ou urgentes > 0 |
| `ia_falhando` | falhas do provedor anotadas (tempo, limite, falha) | 3 ou mais na última hora |
| `ia_conta` | falha "indisponivel" anotada (crédito acabou, chave recusada, modelo não existe, cobrança) | qualquer uma na última hora |

Antes da primeira execução de cada rotina, o prazo conta a partir da estreia do vigia (sem alarme falso no 1º dia).

Orçamento de subpedidos (50 por execução): o vigia gasta no máximo 3 fora da Cloudflare (o `banco` com a 2ª
tentativa e, se o binding falhar, o Resend). Nas horas de reconciliação ele roda depois dela e **não** lê o `banco`
(a reconciliação já é a prova do banco naquela hora), então a soma fica ≤ 46.

### Quando avisa (sem repetir)

Para cada item o `Vigia` guarda `{ ativo, desde, avisado_em }`:

- passou a falhar → entra no e-mail desta hora;
- continua falhando → entra de novo só se o último aviso tem mais de 24 h;
- voltou ao normal depois de ter sido avisado → uma linha "voltou ao normal";
- uma rodada junta tudo num e-mail só; sem novidade, nenhum e-mail.

Se o envio falhar, os itens voltam a "não avisado" e saem na hora seguinte. Os textos são fixos por item (nada do
cliente, nada de valor de configuração). Exemplo do corpo:

```
URGENTE: a IA recusou a conta (crédito, chave ou modelo). O Zero está oferecendo o contato no lugar da conversa.
Voltou ao normal: páginas do site.
Abra o painel: https://beyonzero.com.br/painel
```

**Teste de ponta a ponta:** na primeira rodada depois do deploy o vigia manda um e-mail único de estreia ("O vigia do
site está ligado. Ele confere o site de hora em hora e só escreve quando algo quebra ou volta.") — é o alerta de teste
que prova o caminho inteiro em produção (cron → conferências → Durable Object → e-mail). Nos testes locais o mesmo
caminho roda com o canal e o Durable Object falsos.

No staging (`env.previa`) o vigia roda igual, mas sem o binding de e-mail: só registra no log.

## Camada 2 — conserto previsível

1. **Fallback de modelo na queda** (`api/_ia/anthropic.mjs`): depois que as repetições do SDK acabam com 5xx/529 ou
   erro de rede (não em tempo esgotado: já se esperou demais; não em 4xx), tenta **uma** vez no modelo reserva:
   `claude-sonnet-5-5 → claude-sonnet-5` (mesmo preço), `claude-opus-5-5 → claude-opus-5`,
   `claude-haiku-5-5 → claude-sonnet-5-5` em esforço `low` (só durante a queda; os tetos continuam valendo pelo custo
   real do modelo que respondeu). Os preços dos modelos reserva entram em `PRECO_POR_MILHAO`. O registro
   (`app.ia_chamadas`) já mostra o modelo que respondeu. Com o disjuntor aberto nada disso roda (ele vem antes).
2. **Anotar a falha para o vigia**: no mesmo `catch`, as falhas do provedor (`tempo`, `limite`, `falha`,
   `indisponivel`) são anotadas no `Vigia` (motivo + hora). Sem binding (Node, testes) não faz nada; erro ao anotar
   nunca troca o erro original.
3. **Reconciliação**: conferida, cobre os casos (aberto, pago recente, desconhecido; parcial passa à frente). O que
   faltava era alguém saber quando ela para ou quando pede uma pessoa: resolvido pelos itens `pagamentos` e
   `pagamento_atencao` do vigia. Sem mudança na lógica de dinheiro.
4. **Freios de custo**: conferidos, param sozinhos (reserva antes de cada chamada, teto por conversa/dia/IP/48,
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
- `conferir.mjs`: páginas/API/banco/configuração com `ASSETS` e roteador falsos; 2ª tentativa; orçamento ≤ 3.
- `agenda.mjs`: cron horário roda a reconciliação só nas horas múltiplas de 3 e o vigia sempre; registra resultados.
- `anthropic.mjs`: fallback só em 5xx/529/rede após as repetições, nunca em tempo/4xx; custo pelo modelo que
  respondeu; anotação no vigia sem trocar o erro.
- `wrangler.jsonc`: crons, binding e migration do Durable Object nos dois ambientes (o teste do `wrangler.jsonc` que já
  existe ganha esses casos); `npm run cf:fumaca`.
- Cobertura de mutação (`npm run testar:mutacao`) nos arquivos novos.

## Fora desta entrega

- Vigia externo (se o Worker inteiro cair, o cron cai junto e ninguém avisa). Opção barata para depois: uma conferência
  de fora (GitHub Actions a cada 6 h, ~120 min/mês do plano grátis) — fica como proposta.
- Trocar o e-mail pelo push do app do dono (quando o app existir).
