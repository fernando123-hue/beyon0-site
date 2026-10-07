# Pagamentos com Mercado Pago — pesquisa e plano (2026-10-07)

Pedido do dono: pagamento **no próprio site**, com Mercado Pago, Pix e cartão, tratado como infraestrutura financeira crítica. Este documento registra o que foi pesquisado **antes** de escrever código, as decisões e o plano.

## 1. O que a documentação oficial diz (fontes no fim)

### API
- **Orders API.** É a API que o Mercado Pago indica para integrações novas de Checkout Transparente (pagamento dentro do site, sem redirecionar).
  - `POST https://api.mercadopago.com/v1/orders` cria a order. O cabeçalho `X-Idempotency-Key` é obrigatório (1 a 128 caracteres). A mesma chave repetida devolve o resultado original sem processar de novo.
  - `GET /v1/orders/{id}` consulta a order e as transações (orders de até 3 meses).
  - `POST /v1/orders/{id}/cancel` cancela; só vale com status `created` ou `action_required`.
  - `POST /v1/orders/{id}/refund` reembolsa: total com corpo vazio, parcial com transação e valor. Prazo de até 180 dias.
  - Na criação, `HTTP 402` = a order foi criada, mas a transação falhou (cartão recusado). `429` = limite de requisições; respeitar o `Retry-After`.
- **Corpo da criação:**
  - `type: "online"` e `processing_mode: "automatic"`;
  - `total_amount` em texto (ex.: `"1825.00"`), igual à soma dos pagamentos;
  - `external_reference` com até 64 caracteres;
  - `payer` com email, first_name, last_name e identification;
  - `transactions.payments[]` com `amount` e `payment_method`.
- **Pix:** `payment_method: { id: "pix", type: "bank_transfer" }` e `expiration_time` em ISO 8601 (mínimo 30 min, máximo 30 dias, padrão 24 h).
  - A resposta vem com `action_required` / `waiting_transfer`;
  - o código copia-e-cola vem em `qr_code`, a imagem em `qr_code_base64` e o link em `ticket_url`.
- **Cartão:**
  - `payment_method: { id: <bandeira>, type: "credit_card" | "debit_card", token, installments }`;
  - o `token` é gerado no navegador pelo MercadoPago.js v2 com a **Public Key**;
  - o token vale para um uso só e expira em 7 dias.
- **Campos seguros (Secure Fields):** os campos do cartão são iframes hospedados pelo Mercado Pago. O número do cartão nunca passa pelo nosso site nem pelo nosso servidor, o que facilita o PCI SAQ-A.
- **3DS 2.0:** é opcional (`config.online.transaction_security`).
  - Com desafio, vem `action_required` / `pending_challenge` e uma URL do banco.
  - O comprador tem 40 minutos.
  - O aviso do iframe não prova pagamento: o resultado é confirmado por consulta.

### Estados da transação
| Grupo | `status` / `status_detail` |
|---|---|
| Iniciais | `created`/`created` |
| Aprovado | `processed`/`accredited`, `processed`/`partially_refunded` |
| Em análise | `processing`/`in_process`, `pending_review_manual`, `in_review` |
| Esperando ação | `action_required`/`waiting_payment`, `waiting_capture`, `waiting_transfer`, `pending_challenge`, `waiting_retry` |
| Terminais | `failed`/(motivos), `canceled`, `expired`, `refunded`, `charged_back`/(`in_process`, `settled`, `reimbursed`) |

### Webhook (notificações de order)
- O webhook é configurado no painel, com o evento "Order (Mercado Pago)", e manda um `POST` com JSON. O `data.id` (o id da order, `ORD…`) vem também na query.
- A autenticidade é provada pelo cabeçalho `x-signature: ts=…,v1=…` mais o `x-request-id`.
  - O manifest é `id:[data.id];request-id:[x-request-id];ts:[ts];`, e cada par ausente é omitido.
  - O cálculo é HMAC-SHA256 em hexadecimal com a assinatura secreta da aplicação.
- A resposta esperada é 200/201 em até 22 s. Sem resposta, o Mercado Pago reenvia a cada 15 minutos.

### Credenciais e testes
- **Public Key:** pode ficar no navegador, porque serve para listar meios de pagamento e cifrar o cartão.
- **Access Token:** só no servidor, sempre em `Authorization: Bearer`, nunca em URL.
- **O token de teste e o de produção começam igual (`APP_USR`).** O ambiente não pode ser deduzido pelo formato.
- **Renovar credenciais invalida o par antigo na hora.**
- **Testes:**
  - o e-mail do comprador tem de ser `test@testuser.com`;
  - o nome do titular decide o resultado: `APRO` aprova, `OTHE` recusa, `CONT` fica pendente, `FUND` sem saldo etc.;
  - o QR do Pix **não pode ser pago** em teste, só a criação é verificável.
- **Produção exige** credenciais ativadas no painel e HTTPS.

### Conflitos entre fontes, e a decisão tomada
| Ponto | Fontes | Decisão (a mais segura) |
|---|---|---|
| `data.id` em minúsculas no manifest | A página de orders diz minúsculas. O validador oficial (sdk-nodejs 3.6.1) usa o id como recebido, e os testes dele aceitam as duas formas. | Aceitar o HMAC se ele bater com o id em minúsculas **ou** como recebido. As duas exigem o segredo, então não enfraquece nada. |
| Unidade do `ts` | O exemplo da documentação tem 13 dígitos (ms). O SDK trata como segundos. | Detectar pelo tamanho: mais de 12 dígitos = ms. |
| Janela contra repetição | O SDK deixa a janela opcional. O Mercado Pago reenvia por horas. | Recusar `ts` com mais de 72 h. A defesa real contra repetição é outra: o aviso nunca carrega estado (só dispara uma consulta), e cada transição é idempotente no banco. |
| Domínios para a CSP | Nenhuma página oficial lista. | Medir no navegador com a política real e liberar só os domínios exatos. |
| `currency` na order | A resposta documentada não mostra moeda; mostra `country_code: "BRA"`. | Exigir `country_code = BRA`. Se vier `currency`, exigir `BRL`. Qualquer outra coisa recusa. |

## 2. O que será usado
- **Servidor:** Orders API por HTTPS direto (`fetch`), com os endpoints e campos acima, sem o SDK de servidor. Assim o código é pequeno, auditável e sem dependência nova (cadeia de suprimentos). O validador do webhook replica o algoritmo do SDK oficial, com os testes dele.
- **Navegador:** MercadoPago.js v2 (`https://sdk.mercadopago.com/js/v2`) com os **campos seguros (Core Methods)** e o nosso próprio layout. O script só é carregado na etapa de pagamento.

### Por que campos seguros + layout próprio, e não o Payment Brick
| | Payment Brick | Campos seguros + layout próprio | Checkout Pro |
|---|---|---|---|
| Pagamento no site | sim | sim | não (redireciona; o dono pediu no site) |
| Cartão fora do nosso alcance (PCI SAQ-A) | sim | sim (iframes do MP) | sim |
| Pix | sim | sim (o QR vem da nossa order) | sim |
| Aparência do site, sem estilo inline (CSP `style-src 'self'`) | o Brick desenha a interface dele; risco de exigir estilo inline | total, e os iframes recebem estilo por configuração | n/a |
| A tela de "transação concluída" que o dono vai mandar | limitada | livre | n/a |
| Código nosso a manter | menos | mais (parcelas, bandeira) | mínimo |

A escolha é campos seguros + layout próprio. A segurança do cartão é a mesma do Brick, e a interface e a CSP ficam sob o nosso controle. O custo é mais código de tela, coberto por testes.

## 3. Decisões de arquitetura
1. **Domínio sem detalhe do provedor.**
   - `api/_pagamentos/servico.mjs` é o serviço de pagamentos: iniciar pagamento, consultar estado, tratar o webhook, reconciliar e reembolsar.
   - `api/_pagamentos/mercadopago.mjs` é o provedor e `api/_pagamentos/estados.mjs` mapeia os estados.
   - O restante do sistema vê só `pago`, `pendente`, `estornado` etc.
2. **O pagamento (a intenção) e as tentativas.**
   - `app.pagamentos` é o que deve ser pago, com valor tirado da proposta aceita e nunca do navegador.
   - `app.tentativas_pagamento` guarda cada tentativa (Pix ou cartão), com a chave de idempotência, o id da order, o estado bruto e o mapeado.
   - Uma tentativa ativa por vez. Antes de uma nova, a order anterior é cancelada; se o cancelamento falhar porque ela foi paga, ela é aplicada.
3. **O banco é a última trava.** `app.pagamentos_aplicar` aplica o retrato da order numa transação com `FOR UPDATE` e confere de novo:
   - a tentativa;
   - a referência externa;
   - o valor da order, da transação e o pago;
   - o país e a moeda;
   - a conta do Mercado Pago.
4. **Estados separados:**
   - pagamento: `pendente → pago → estornado | contestado`, ou `cancelado`/`expirado`;
   - tentativa: os estados do MP mapeados;
   - projeto: entra como `pronto_para_producao` (novo) e só a equipe o passa para `em_producao`.
5. **Fail closed.** Qualquer dúvida (erro de API, valor diferente, estado desconhecido, banco fora) deixa o pagamento como está. Desconhecido nunca vira pago.
6. **Auditoria append-only** (`app.pagamentos_auditoria`): eventos `payment.*` e `payment.webhook.*`. Ninguém altera nem apaga, nem o service_role. Nada de segredo, token ou cartão.
7. **Reconciliação.** `/api/pagamentos?acao=reconciliar`, protegido por `CRON_SECRET` e chamado pelo Cron da Vercel, consulta no MP toda tentativa não terminal e todo pagamento pago, e aplica pelo mesmo caminho do webhook. Ele detecta:
   - pago lá e pendente aqui (aplica);
   - estornado ou contestado lá (marca e alerta);
   - pagamento em dobro (alerta para reembolso).
   - A página do cliente também consulta o MP quando o aviso demora.
8. **Credenciais por ambiente.** `MP_AMBIENTE` (`teste` | `producao`) é declarado, não deduzido.
   - Produção na Vercel exige `producao`; o resto exige `teste`.
   - Em teste, o comprador vira `test@testuser.com`.
   - `MP_USER_ID` confere que a order é da conta da Beyon Zero.
9. **CSP.** Uma regra só para `/orcamento` libera os domínios exatos do Mercado Pago. As outras páginas seguem sem nenhum.
10. **IA sem autoridade financeira.** Nenhuma ferramenta do agente toca em pagamento. Só o serviço de pagamentos, com dados do MP e do banco, decide `pago`.

## 4. Riscos identificados
- **Pagamento em dobro:** Pix pago depois de um cartão aprovado. Mitigação: cancelar a order anterior, detectar a duplicidade e alertar para reembolso.
- **Aviso perdido** (queda, prazo de 22 s): reenvio do MP, consulta pela página e reconciliação diária.
- **Credencial trocada entre ambientes:** ambiente declarado, conferência de conta e e-mail de teste forçado.
- **Resposta perdida na criação (timeout):** a mesma chave de idempotência na nova tentativa devolve a mesma order.
- **3DS com URL de banco desconhecida** (a CSP não permite iframe de qualquer lugar): abrir o desafio numa aba nova e confirmar por consulta.
- **Script de terceiro na página de pagamento** (MercadoPago.js): carregado só na etapa de pagamento, de um host exato. Não há SRI possível, porque a URL não tem versão.
- **Não testável sem o dono:** credenciais de teste reais, o webhook do painel e o Pix (o QR de teste não pode ser pago).

## 5. Como será testado
- **Unidade:** assinatura com os vetores do SDK oficial, mapa de estados, conferência financeira.
- **Banco real (PGlite com as migrations):** aplicar o retrato da order, idempotência, transições proibidas, auditoria imutável, isolamento entre visitantes e organizações.
- **Fluxo inteiro** contra um **simulador fiel da Orders API** (mesmos endpoints, campos, códigos 201/402/409/429): Pix, cartão aprovado, recusado e pendente, 3DS, webhook, reconciliação.
- **Ataques:** assinatura forjada, ausente ou velha, aviso repetido e fora de ordem, corpo adulterado, valor, moeda, conta e referência trocados, id de outra order, outro visitante, chamada direta, concorrência, timeout, MP fora, banco fora.
- **E2E no Chromium** com o simulador.
- **CSP medida** no navegador com o script real do Mercado Pago.

## 6. O que muda no projeto
- **Migration nova** `20261007130000_pagamentos_mp.sql`: tentativas, auditoria, estados novos, funções.
- **`api/_pagamentos/`:** serviço, provedor do Mercado Pago, estados, simulador.
- **`api/pagamentos.mjs`:** webhook e reconciliação.
- **`api/vendas.mjs` e `api/_vendas/fluxo.mjs`:** as ações de pagar passam pelo serviço.
- **Tela:** `js/orcamento-pagamento.js`, `orcamento.html`, `css/orcamento.css`.
- **Configuração:** `vercel.json` (CSP do /orcamento e cron) e `.env.example`.
- **Testes:** `docs/testes/pagamentos*.test.mjs` e o E2E.
- **Documentação:** `docs/pagamentos/01-…`.

## Fontes oficiais consultadas
- Orders, visão geral: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview
- Pix: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix
- Cartões: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards
- Notificações de orders: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
- Estados da order: https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/payment-management/status/order-status
- Estados da transação: https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/payment-management/status/transaction-status
- Reembolso: https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/refund-order/post
- Cancelamento: https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/cancel-order/post
- Reembolsos e cancelamentos: https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/payment-management/refunds-cancellations
- Criar order (códigos e erros): https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/create-order/post
- 3DS: https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/payment-management/integrate-3ds
- Testes com cartão: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/cards
- Teste de Pix: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix
- Produção: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/go-to-production
- Credenciais: https://www.mercadopago.com.br/developers/pt/docs/credentials
- Inicialização do SDK JS: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/common-initialization
- Campos seguros: https://www.mercadopago.com.br/developers/en/news/2022/09/30/Secure-Fields-protects-card-details-at-checkout
- Idempotência obrigatória: https://www.mercadopago.com.br/developers/pt/news/2023/01/04/Idempotency-key-usage-will-be-mandatory
- Validador oficial do webhook: https://github.com/mercadopago/sdk-nodejs/blob/main/src/utils/webhook/index.ts (v3.6.1)
