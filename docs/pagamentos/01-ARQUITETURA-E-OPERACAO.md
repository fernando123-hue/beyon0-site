# Pagamentos — arquitetura, segurança e operação

A pesquisa e as decisões estão em `00-PESQUISA-E-PLANO.md`. Este documento diz como o sistema funciona e como operá-lo.

## 1. O caminho de um pagamento

```
NAVEGADOR (/orcamento)                       SERVIDOR (Vercel, gru1)                     MERCADO PAGO
escolhe Pix ou cartão ──POST /api/vendas?acao=pagar──▶ valida o pagador e o token
 (cartão: token gerado nos                     banco: pagamentos_iniciar_tentativa
  iframes do MP; o número                        • valor = sinal da proposta ACEITA
  nunca passa por aqui)                          • uma tentativa ativa por pagamento
                                               POST /v1/orders (X-Idempotency-Key) ─────────▶ cria a order
                                               banco: vincular + aplicar o retrato ◀─────────── 201 / 402
◀── estado (QR do Pix, recusa, 3DS) ───────────
                                                                                        processa (Pix pago,
                                                                                        análise, 3DS...)
                                               POST /api/pagamentos ◀── aviso assinado ──────────┘
                                                1. formato  2. corpo = query  3. x-signature
                                                4. GET /v1/orders/{id} (a VERDADE) ─────────────▶
                                                5. banco: pagamentos_aplicar (confere TUDO)
                                                   pago → projeto "pronto_para_producao"
espera (5 s) ──GET /api/vendas?acao=pagamento──▶ estado; se a última consulta tem 10 s ou mais,
                                                consulta o MP de novo (o aviso pode atrasar)
                                               Cron diário: /api/pagamentos?acao=reconciliar
```

**Autoridade de cada parte:**
| Parte | Papel |
|---|---|
| Navegador | Interface. Escolhe o meio e manda os dados de quem paga. Nunca define valor nem estado. |
| IA (agente) | Nenhum papel financeiro. Não tem ferramenta de pagamento (há teste para isso). |
| Aviso (webhook) | Um sinal para consultar. O corpo dele é ignorado. |
| Mercado Pago, consultado pelo servidor | O estado externo do pagamento. |
| Banco (`app.pagamentos_aplicar`) | A última conferência e o estado interno. A única porta para "pago". |
| Equipe | Passa o projeto de `pronto_para_producao` para `em_producao`. |

## 2. Credenciais

| Nome | Tipo | Onde pode existir | Para quê |
|---|---|---|---|
| `MP_PUBLIC_KEY` | **pública** | servidor e navegador (vai na página) | cifrar o cartão nos campos seguros e listar meios de pagamento |
| `MP_ACCESS_TOKEN` | **SECRETA** | só servidor (segredo do Worker na Cloudflare) | criar, consultar, cancelar e reembolsar orders |
| `MP_WEBHOOK_SEGREDO` | **SECRETA** | só servidor | conferir a assinatura dos avisos |
| `CRON_SECRET` | **SECRETA** | só servidor e as rotinas agendadas | autorizar a reconciliação |
| `MP_USER_ID` | identificador | só servidor | conferir que a order é da conta da Beyon Zero e que o token é dessa conta (obrigatório sempre) |
| `MP_AMBIENTE` | configuração | só servidor | `teste` ou `producao`, declarado (os tokens de teste e de produção têm o mesmo prefixo) |
| `MP_3DS` | configuração | só servidor | `desligado` (padrão) ou `on_fraud_risk` |

**Travas:**
- Produção (Worker `beyon-zero-site`) exige `MP_AMBIENTE=producao`. Prévia e desenvolvimento exigem `teste`.
- Credencial de produção fora do Worker de produção desliga o pagamento.
- Faltou qualquer item: pagamento **desligado** (o site oferece o WhatsApp), nunca meio-ligado.
- O Access Token só vai no cabeçalho `Authorization`. Nunca vai em URL, log, resposta, banco ou auditoria (há testes para isso).

## 3. Webhook
- **URL** (painel do Mercado Pago, Suas integrações › Webhooks): `https://<domínio>/api/pagamentos`. O evento é "Order (Mercado Pago)".
- **Validação, em ordem:**
  1. freio por IP;
  2. corpo de até 64 KB;
  3. `type=order`;
  4. `data.id` no formato de order;
  5. JSON válido, com `data.id` do corpo igual ao da query;
  6. `x-signature`: HMAC-SHA256 com a assinatura secreta, comparação em tempo constante, janela de 72 h;
  7. só então a consulta ao MP.
- **Respostas:**
  - 200 quando entendido, inclusive ignorado (order de outra conta, repetição);
  - 401 para assinatura inválida;
  - 400 ou 413 para formato errado;
  - 500 quando o MP ou o banco falharam, para o MP reenviar. Nada fica aplicado pela metade, porque cada aplicação é uma transação.
- **Repetição e ordem dos avisos:** o aviso não carrega estado. Repetir o mesmo aviso dá "sem mudança". Um aviso velho depois de "aprovada" é ignorado como regressão.

## 4. Estados
**Tentativa** (o mapeamento fica em `api/_pagamentos/estados.mjs`):
| Mercado Pago (transação) | Interno |
|---|---|
| `processed` / `accredited` | `aprovada` |
| `processed` / `partially_refunded` | `estornada_parcial` |
| `created`, `processing`, `in_review` | `processando` |
| `action_required` / `waiting_transfer`, `waiting_payment` | `aguardando` (Pix) |
| `action_required` / `pending_challenge`, `waiting_capture`, `waiting_retry` | `requer_acao` (3DS) |
| `failed` | `recusada` |
| `canceled` | `cancelada` |
| `expired` | `expirada` |
| `refunded` | `estornada` |
| `charged_back` (qualquer) | `contestada` (as duas páginas oficiais se contradizem sobre `settled` e `reimbursed`; fail closed) |
| qualquer outro | `desconhecido`: nada muda, fica registrado |

O banco também tem `duplicada` (uma segunda aprovação para um pagamento já pago) e `contestada_revertida` (reservado, nunca produzido automaticamente).

**Pagamento:**
- `pendente → pago` (pela tentativa aprovada);
- `pago → estornado | contestado`;
- `contestado → pago | estornado`.
- Qualquer outra transição é recusada por trigger.

**Projeto:**
- Nasce `pronto_para_producao` quando o sinal é confirmado.
- Vai para `pausado` se o pagamento for estornado (inteiro ou em parte) ou contestado.
- A equipe dá a partida em `em_producao`.

## 5. Controles de segurança
- **Preço:** só a proposta aceita define o valor. O corpo da requisição é ignorado (há teste que manda `valor: 1`).
- **Conferência no banco:** referência externa (a tentativa), valor total, valor da transação e valor pago (≥ valor), país BRA, moeda BRL, conta do MP e meio (Pix × cartão) são conferidos. O "aprovada" só vale com `processed/accredited`.
- **Idempotência:**
  - chave de criação por tentativa, gerada pelo banco;
  - cancelamento `cx-<tentativa>`;
  - reembolso `rf-<order>`;
  - order única por tentativa (`unique`);
  - uma tentativa ativa por pagamento (índice parcial único);
  - transições com trigger.
- **Pagamento em dobro:**
  - trocar Pix por cartão cancela o Pix no MP antes;
  - se ele foi pago no meio, vale o Pix e nada mais é cobrado;
  - uma 2ª aprovação vira `duplicada` e gera um alerta de reembolso.
- **Isolamento:**
  - toda função confere o visitante dono da conversa;
  - "não é seu" e "não existe" dão o mesmo erro;
  - pela RLS, o visitante não lê tentativas nem auditoria, e outra organização não lê nada.
- **Auditoria append-only** (`app.pagamentos_auditoria`): ninguém altera nem apaga, nem o service_role. Nada de segredo, token, CPF ou cartão (há testes).
- **Cartão:** os campos são iframes do Mercado Pago (PCI SAQ-A). O site recebe só um token de uso único.
- **CSP do /orcamento:** só os hosts medidos (`sdk`, `api` e `secure-fields` do mercadopago.com), sem `unsafe-inline`. As outras páginas não liberam o Mercado Pago.
- **Divergência real** (valor, conta, referência, país, moeda ou meio diferentes) não paga. A tentativa vira `divergente`: sai da fila e vai para uma pessoa, e nenhuma cobrança nova abre por cima.
- **Retrato incompleto** (campo nulo ou malformado) não decide nada, nem divergência. Nenhuma conferência depende de NULL.
- **O dinheiro primeiro:** gravar "pago" e criar cliente e projeto são passos separados (subtransação). Se o projeto falhar, o pagamento continua pago e fica um `project.error` para a equipe.
- **Fim sem dinheiro** (recusada, cancelada, expirada) não volta a ficar ativo; só anda para aprovada (pagou de verdade) ou estorno.
- **Contra teste de cartões:**
  - até 5 tentativas de cartão por pagamento;
  - 20 s de espera depois de uma recusa;
  - com 20 recusas de cartão na última hora na organização, o cartão pausa para todos e o Pix segue.
- **Escrita só pelas funções:** o service_role só LÊ as tabelas financeiras. A trilha tem trigger que bloqueia alterar, apagar e truncar, inclusive para o dono da tabela.
- **Travas sempre na mesma ordem** (conversa → pagamento → tentativa), contra deadlock.
- **Aviso sem assinatura válida não grava nada no banco**, só no log: quem não tem o segredo não enche a trilha.
- **Order ainda não legível:** um aviso assinado de uma order que o MP ainda não devolve recebe 503 por até 6 h, e o MP reenvia.
- **Erros:** tempo esgotado, rede, MP fora ou conflito de idempotência deixam a tentativa como está. Ela nunca vira recusada nem paga por palpite.
  - A consulta e a reconciliação resolvem.
  - Uma criação sem order no MP há mais de 5 min é cancelada e libera nova tentativa.
  - O que o MP recusou com certeza (dados inválidos, credencial, limite) libera na hora.

## 6. Testes (`npm run testar`, `npm run e2e:orcamento`)

### `docs/testes/pagamentos.test.mjs`
| Grupo | Casos |
|---|---|
| Assinatura | vetores do SDK oficial, 13 formas de assinatura ruim |
| Estados | mapeamento do MP para o interno |
| Credenciais por ambiente | teste e produção separados; faltou item, desligado |
| Provedor | idempotência, erros classificados, token fora das mensagens |
| Pix | gerar, repetir, pagar |
| Cartão | aprovado, recusado, 3DS, em análise |
| Troca Pix → cartão | inclusive com o Pix pago no meio |
| Falhas | tempo esgotado sem order, order criada com a resposta perdida, MP fora no aviso, banco fora, credencial recusada |
| Ataques ao webhook | 10 variantes, corpo mentiroso, order de outra conta |
| Ataques financeiros | valor, valor pago, conta, referência, país, moeda |
| Ataques de acesso | outro visitante, sem sessão, dados inválidos, IA sem ferramenta, cron sem chave |
| Concorrência e fechamento | concorrência, reconciliação, reembolso idempotente |

### `docs/testes/pagamentos-banco.test.mjs` (banco real, PGlite)
- **Conferências:** 11 divergências recusadas, valor da proposta, uma tentativa ativa.
- **Estados:** idempotência, regressão ignorada, transições proibidas.
- **Dinheiro devolvido ou repetido:** duplicidade; estorno e contestação pausando o projeto.
- **Recuperação:** order perdida achada pela referência.
- **Auditoria e acesso:** auditoria imutável, isolamento entre visitante e organização.

### E2E (Chromium)
- Pagador sem dados.
- Cartão recusado com motivo.
- Pix com QR.
- Recarregar não cria cobrança nem confirma.
- Confirmação só pelo aviso assinado.

**Limite dos testes:** tudo roda contra o **simulador** fiel da Orders API (`docs/mp-simulado.mjs`). O comportamento real do MP precisa ser conferido no ambiente de TESTE (seção 9).

## 7. Investigar um pagamento
Comece pela conversa, pela tentativa ou pela order (`ORD…`):
```sql
-- a trilha completa de um pagamento
select a.created_at, a.evento, a.origem, a.status_antes, a.status_depois, a.provedor_ref, a.detalhe, a.request_id
from app.pagamentos_auditoria a where a.pagamento_id = '<pagamento>' order by a.id;

-- as tentativas e o estado bruto do MP
select id, metodo, status, status_provedor, detalhe_provedor, provedor_order_id, valor, valor_pago, created_at, consultada_em
from app.tentativas_pagamento where pagamento_id = '<pagamento>' order by created_at;

-- o que pede atenção humana
select * from app.pagamentos_auditoria
where evento in ('payment.mismatch','payment.divergence','payment.duplicate','payment.unknown_status','payment.chargeback','project.paused')
order by id desc limit 50;
```
- **Logs do Worker (Workers Logs):** `[pagamentos] aviso recusado: <motivo>`, `[pagamentos] falha ao processar aviso: provedor <tipo>|banco <código>`, `[pagamentos] desligado: <motivo>`. Sem token, CPF ou cartão.
- **No painel do Mercado Pago:** a order aparece com a `external_reference` igual ao id da tentativa.

## 8. Incidentes
| Situação | O que fazer |
|---|---|
| **O webhook parou** (nada de `payment.webhook.received`) | A página continua consultando o MP a cada 10 s e o cron reconcilia uma vez por dia. Confira a URL e o evento no painel do MP e o segredo do webhook no Worker. Para reconciliar na hora: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domínio>/api/pagamentos?acao=reconciliar`. |
| **API do MP fora** | Nenhum estado muda (fail closed). Os avisos voltam 500 e o MP reenvia. As tentativas ficam abertas, e a reconciliação resolve quando o MP voltar. Status: status.mercadopago.com. |
| **Pagamento inconsistente** (`payment.mismatch` ou `divergence`) | Nada foi liberado. Compare a order no painel do MP com a tentativa (valor, conta, referência). Se o dinheiro entrou certo e a regra errou, corrija a regra e reconcilie. Nunca marque "pago" à mão. |
| **Credencial comprometida** | Renove no painel do MP (Suas integrações › Credenciais › Renovar): o par antigo morre na hora. Atualize o segredo no Worker e publique. Renove também o segredo do webhook ("Reset") e o `CRON_SECRET`. Revise a auditoria do período. |
| **Pagamento em dobro** (`payment.duplicate`) | O projeto não foi liberado duas vezes. Reembolse a order **duplicada** pelo painel do MP (ou pelo serviço, `servico.reembolsar`). A reconciliação registra o estorno. |
| **Estorno ou contestação** | O projeto foi pausado sozinho. Fale com o cliente e decida no painel. Contestação revertida a favor da Beyon Zero não volta sozinha (as fontes oficiais se contradizem): a equipe confere no painel e reativa o projeto. |
| **Tentativa `divergente`** | Nada foi liberado, e o visitante vê "em verificação". Compare no painel do MP. Se o dinheiro entrou certo, reembolse e combine com o cliente; nunca marque "pago" à mão. |
| **"Cartão pausado"** (muitas recusas em 1 hora) | Provável teste de cartões. Veja na trilha as recusas da hora. A pausa sai sozinha quando a janela de 1 hora passa. Se continuar, troque a Public Key e avalie o Cloudflare (Turnstile). |
| **`project.error`** | O pagamento está pago, mas o projeto não foi criado. Crie o projeto à mão a partir da proposta e veja o motivo no detalhe do evento. |
| **Alerta** | A reconciliação diária escreve `[pagamentos] ATENÇÃO: N ocorrência(s)…` no Workers Logs quando há divergência, duplicidade, estorno, contestação ou erro de projeto nas últimas 25 h. Configure um alerta de log (Cloudflare › Workers › Observability) para essa frase. Ainda não há e-mail ou WhatsApp automático (pendência). |
| **"Pago" no MP para uma tentativa cancelada aqui** | Vira `aprovada`: o dinheiro é real. Se o pagamento já estava pago, vira `duplicada`. |

## 9. Configurar o TESTE (antes de qualquer pagamento real)
1. **Painel do Mercado Pago** (conta da Beyon Zero): Suas integrações › Criar aplicação, com Checkout Transparente / Orders. As credenciais de TESTE vêm prontas.
2. **Worker de prévias (`beyon-zero-site-previa`; segredos do Worker e segredos-base das Previews):**
   - `MP_AMBIENTE=teste`;
   - `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY` de teste;
   - `MP_USER_ID`, a conta de teste;
   - `CRON_SECRET` com 32 ou mais caracteres aleatórios.
3. **Webhook, modo teste:** `https://beyon-zero-site-previa.<subdomínio workers.dev da conta>.workers.dev/api/pagamentos`, evento "Order" (o Access do staging precisa de Bypass só neste caminho; se o ensaio não der, a reconciliação cobre: plano da migração, § 5.4). Copie a assinatura secreta para `MP_WEBHOOK_SEGREDO` (prévias).
4. **Supabase de teste**, com as migrations aplicadas (`supabase db push`).
5. **Rodar e conferir:**
   - **cartão:** cartões de teste, com os titulares `APRO`, `OTHE`, `CONT` e `FUND`;
   - **Pix:** criação e QR (o QR de teste não pode ser pago);
   - **outros caminhos:** reembolso pelo painel, o aviso chegando (auditoria) e a reconciliação.
6. **CSP com a chave real:** `BASE=<prévia> PUBLIC_KEY=<chave de teste> node docs/csp-mercadopago.mjs` deve mostrar zero violação além da do estilo dos iframes.
7. **3DS:** ligar `MP_3DS=on_fraud_risk` só depois de testar um desafio e ver o host da URL do banco.

## 10. Configurar a PRODUÇÃO
1. Painel do MP: ativar as credenciais de produção (ramo de atividade, URL do site, termos).
2. Worker de produção `beyon-zero-site`: as mesmas variáveis, como segredos, com os valores de **produção**; `MP_AMBIENTE=producao` já vem do `wrangler.jsonc`. `MP_USER_ID` é obrigatório. **No lançamento só Pix** (`MP_METODOS=pix` no `wrangler.jsonc`: o cartão some da tela e a API recusa).
3. Webhook, modo produção: `https://beyonzero.com.br/api/pagamentos` (sem `www`, que só redireciona), evento "Order", e o segredo de produção.
4. HTTPS no domínio (exigência do MP).
5. Plano: o grátis da Cloudflare (decisão do dono, 2026-10-21). As rotinas agendadas estão em `triggers.crons` do `wrangler.jsonc`; o que elas fazem está em `cloudflare/agenda.mjs`.

## 11. Checklist antes de aceitar o primeiro pagamento real
- [ ] Todos os passos de TESTE da seção 9 feitos, com evidência (prints ou auditoria).
- [ ] O aviso real do MP chegou e foi **aceito** (`payment.webhook.received`), validando o formato real da assinatura: ms × s e minúsculas, conferidos no ambiente real.
- [ ] O retrato real de uma order aprovada passou pela conferência: `paid_amount` presente, `country_code=BRA`, `user_id` = `MP_USER_ID`.
- [ ] Cartão com parcelas: o valor pago com juros (≥ valor) foi aceito.
- [ ] CSP medida com a Public Key real, sem violação nova.
- [ ] Credenciais de produção só no Worker de produção (conferir que o de prévias tem as de teste).
- [ ] `MP_USER_ID` de produção conferido no painel.
- [ ] Segredos fora do Git (`git log -p | grep APP_USR` vazio) e, quando autorizado, no Infisical.
- [ ] Reconciliação rodando (log do cron) e reconciliação manual testada.
- [ ] Rodapé do /orcamento com nome, CPF e endereço do vendedor (Decreto 7.962/2013).
- [ ] Termos (CDC art. 49) e política de privacidade revisados por advogado.
- [ ] Um pagamento real pequeno (ex.: R$ 1 numa proposta de teste) feito, conferido e reembolsado, com a trilha de auditoria completa.
- [ ] O dono pediu a publicação (`main`).

## 12. Auditoria adversarial (2026-10-07) e o que foi corrigido

Dois agentes revisores tentaram quebrar o módulo. Um pensou como atacante, o outro olhou consistência financeira e corridas.

**O que não conseguiram:** liberar produção sem pagamento, forjar ou reaproveitar aviso, alterar valor, cruzar visitantes ou organizações, e cobrar duas vezes pela mesma tentativa.

**Corrigido (com teste):**
- **Bloqueio de release:** o transporte de produção (PostgREST) só aceitava funções `vendas_*`, e todo pagamento falharia. Agora aceita `pagamentos_*`, com tempo limite de 10 s. Ganhou teste do transporte real.
- **Conferências que falhavam abertas com NULL:** toda comparação é feita só com valor conferido. Retrato incompleto não decide nada.
- **Dinheiro que podia não ser gravado:** a criação de cliente e projeto falhando desfazia o "pago". Agora o dinheiro é gravado primeiro, e o projeto é um passo separado.
- **Tentativas presas, que travavam o visitante:** estorno sem aprovação vista, divergência e criação sem order quando a busca falha.
- **Fim sem dinheiro que "ressuscitava"**, e o risco de deadlock (ordem de travas única).
- **Teste de cartões sem limite:** agora há os freios de cartão.
- **Trilha inundável sem assinatura:** a recusa pré-assinatura não grava mais. A trilha ficou imutável por trigger e com eventos repetidos deduplicados.
- **Escrita direta do service_role:** revogada nas tabelas financeiras.
- **Credencial:** `MP_USER_ID` é obrigatório em teste também, e o token de outra conta desliga o pagamento.
- **Aviso de order ainda não legível:** antes era ignorado; agora o MP reenvia.
- **Reconciliação:**
  - item com erro não derruba os outros;
  - paralelo limitado;
  - a varredura consulta cada order inteira;
  - aprovadas conferidas até 85 dias;
  - `maxDuration` 120 s.
- **Reembolso:** só de order nossa e com dinheiro; o segundo pedido é recusado antes do MP.
- **Detalhes:** HTTP 408 tratado como tempo esgotado; comparação do cabeçalho do cron por bytes; vinculação da order só depois da conferência.

**Riscos que continuam (conhecidos):**
- **Freios em memória:** o freio por IP vive em cada instância. Com o Cloudflare, o IP passa a vir da borda, e é preciso usar `cf-connecting-ip` de forma confiável.
- **Script do Mercado Pago sem SRI:** `sdk.mercadopago.com` não tem versão fixa, então não aceita SRI. O script vê o que se digita na página (nome, e-mail e CPF; o cartão fica nos iframes). É risco de terceiro, aceito.
- **CSP herdada do Google Ads:** `www.google.com` em `script-src` aceita JSONP, o que enfraquece a CSP contra XSS. Vale reavaliar quando a medição do Google for ligada.
- **Prevenção de fraude do SDK desligada:** ela exige script inline. A alternativa documentada (identificação do aparelho por script externo, `X-meli-session-id`) precisa de pesquisa e teste no ambiente de TESTE.
- **Reembolso só total:** reembolso parcial fica para uma versão futura.
- **Alerta só no log:** não há e-mail nem WhatsApp automático.
- **Simulador fiel, mas simulador:** os pontos do checklist (§11) só se provam no ambiente de TESTE com credenciais reais.
