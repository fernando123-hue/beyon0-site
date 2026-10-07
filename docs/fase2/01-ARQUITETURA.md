# Fase 2 — Arquitetura do Agente de Vendas

Decisões do dono e fatos pesquisados estão em `00-AUDITORIA-E-ANALISE.md`. Este documento cresce a cada incremento.

## Camadas

```
[Navegador /orcamento]  conversa, estimativa, 3 prévias, escolha, alterações, escopo, pagamento
      │  só o token do visitante (anônimo do Supabase); nenhuma chave
      ▼
[API /api/vendas/*]     confere o token, valida a entrada (lista fechada), aplica limites e custo
      ▼
[Lógica de negócio]     api/_vendas/: motor de preço (regras), aplicação de mudanças, montagem do escopo
      ▼
[Camada de IA]          api/_ia/: interface única (conversar, extrair, gerar); o provedor Anthropic fica atrás dela
      ▼
[Banco]                 funções app.vendas_* (uma transação por passo) + RLS (o visitante só lê o que é dele)
```

## Incremento 1: o modelo de dados

Migrations `20261007120000` a `…120200`.

**Tabelas novas no esquema `app`:**

- `regras_comerciais`: versionada; uma só **ativa** por organização; a aprovada não muda.
- `conversas`: o visitante, o briefing em JSON, a confiança, a origem, o custo de IA e a etapa.
- `mensagens`.
- `estimativas`: os fatores, o valor, o sinal, o prazo e a versão das regras usada.
- `direcoes`: as 3 por geração, guardadas como estrutura, nunca como HTML.
- `escolhas`.
- `alteracoes`: o pedido, as mudanças estruturadas e o resultado aplicado.
- `pagamentos`: só anda para a frente; uma cobrança viva por parcela.
- `eventos_pagamento`: idempotência por evento do gateway.
- `eventos_funil`: o funil, sem o conteúdo das conversas.

**O escopo final é a `app.propostas` da Fase 1.** Ela é versionada e imutável depois de enviada. Ganhou a conversa, a direção, o percentual do sinal, o prazo e a **concordância para início imediato**, por causa dos 7 dias do CDC.

**Funções `app.vendas_*`:** uma por passo, cada uma numa transação, executáveis **só pelo backend**.

- **Preço:** o escopo usa a **última estimativa**, e a cobrança usa o **sinal da proposta aceita**. Um valor enviado na chamada é ignorado.
- **Pagamento:** só vale pelo evento do gateway. Ele é idempotente, confere o valor e, quando é o sinal, cria o cliente, cria o projeto (em produção, com prazo) e liga a proposta, tudo junto.
- **Etapas:** cada passo exige a etapa certa. Há limite de 3 gerações de direções.
- **Isolamento:** a conversa de outro visitante dá o mesmo erro de "não existe", para não permitir enumeração.

**RLS:**

- o **visitante** lê só a própria conversa e o que pende dela, inclusive a proposta e o pagamento;
- não escreve em nada e não chama as funções do backend;
- não vê o funil nem as regras comerciais;
- a **equipe** vê tudo da organização;
- dono e admin mantêm as regras comerciais.

**Testes (`docs/testes/vendas-banco.test.mjs`):**

- o fluxo completo até o projeto em produção;
- o preço manipulado ignorado;
- o webhook repetido, o de valor divergente e o de cobrança desconhecida;
- a situação de pagamento que não volta;
- pedidos repetidos de geração e de cobrança;
- as etapas fora de ordem e o limite de gerações;
- a IA falhando sem inventar direção;
- um visitante tentando a conversa de outro, inclusive pelo ID exato do pagamento;
- o RLS completo;
- as regras comerciais.

**Limite conhecido do teste:** o PGlite tem uma conexão só e enfileira as transações. A corrida verdadeira é coberta, no Postgres real, pela trava `FOR UPDATE` e pelos índices únicos, não por este teste.

## Incremento 2: o motor de regras comerciais

`api/_vendas/precos.mjs` é a única fonte de preço.

- **Entrada:** o agente escolhe fatores (formato, páginas, adicionais, urgência, complexidade), validados em lista fechada.
- **Cálculo:** base mais adicionais, vezes os multiplicadores, com piso, arredondamento e sinal pela regra.
- **Teto de 10 dias:** o que não cabe vira fase 1 mais fase seguinte, por prioridade.
- **Diagnóstico:** o que está fora do automático e os valores acima do limite vão para o diagnóstico, sem preço.
- **Valores:** a tabela-rascunho com fontes está em `docs/fase2/REGRAS-RASCUNHO.md`. Só a versão ativa, aprovada pelo dono, gera preço.

## Incremento 3: a camada de IA e o agente

`api/_ia/` é a interface única: `mensagem({ papel, sistema, mensagens, ferramentas, esquema })`.

- **Provedor real:** Anthropic, pelo SDK oficial com versão fixa. Sonnet 5.5 com esforço médio na conversa e Opus 5.5 com esforço alto na geração. Fallback do servidor, cache do prompt e erros tipados.
- **Provedor simulado:** só para testes e o servidor local.
- **O turno do agente:** `api/_vendas/agente.mjs`, com 5 ferramentas e sem nenhuma que mexa em preço, desconto, dados de terceiros ou pagamento.
- **O valor fora do modelo:** o modelo não recebe o valor da estimativa, e um valor em dinheiro no texto é removido.
- **Briefing:** lista fechada, com a confiança calculada pela cobertura dos campos.
- **Privacidade:** dado pessoal é redigido antes de ir ao modelo.

## Incremento 4: a geração das 3 direções

- **Uma direção por pedido.** As 3 rodam em paralelo pelo navegador, cada uma dentro do limite de 300 s da Vercel Hobby.
- **Posse no banco** (`app.vendas_reivindicar_direcao`). Outra aba não gera a mesma direção, e uma posse abandonada vence em 6 minutos.
- **O modelo devolve estrutura,** no JSON Schema `ESQUEMA_DIRECAO`. Ela é higienizada por `api/_vendas/direcao.mjs`:
  - lista fechada de seções e fontes;
  - tamanhos;
  - cores em hexadecimal;
  - contraste de leitura corrigido;
  - HTML removido;
  - lorem ipsum recusado.
- **Prova social:** sem dado no briefing, ela vira espaço reservado entre colchetes.
- **Mesmo briefing, estratégias diferentes.** As 3 direções partem do mesmo briefing e do mesmo prompt de sistema, que fica em cache. Só a estratégia muda: conversão, autoridade ou experiência.

## Incremento 5: alterações e escopo final

- **Interpretação** (`api/_vendas/alteracoes.mjs`). O Sonnet 5.5, com esforço baixo e saída em JSON Schema, só traduz o pedido em operações de uma lista fechada:
  - paleta ou tipografia de outra direção;
  - cor;
  - tema;
  - mover, remover ou adicionar seção;
  - trocar texto;
  - escopo (adicional ou páginas);
  - não suportado, sempre com o motivo.
- **Quem aplica é o código.** Depois, a direção passa de novo pela higienização (o contraste é corrigido).
- **Mudança de escopo volta ao motor de preço.** Nenhum preço muda por pedido escrito.
- **Escopo final** (`api/_vendas/escopo.mjs`). É montado pelo código, sem IA, a partir da estimativa gravada e da direção final. Traz a direção escolhida, as alterações, o escopo, a fase seguinte, o investimento com o sinal e o prazo.

## Incremento 6: a API e o pagamento

- **Uma função para o fluxo** (`api/vendas.mjs`, ações em `api/_vendas/fluxo.mjs`). A borda:
  - freio por IP (90 por minuto; criar sessão: 8 a cada 10 minutos);
  - JSON obrigatório (415): um formulário de outro site não chega aqui;
  - corpo até 16 KB (413);
  - token do visitante em toda ação, exceto criar a sessão;
  - erro interno genérico; o detalhe vai só para o log, sem dado pessoal.
- **Visitante** (`api/_vendas/visitante.mjs`). Em produção é o login anônimo do Supabase, com token renovável. Conversa de outro visitante responde "não existe" (404), igual a conversa inexistente.
- **Banco** (`api/_vendas/transporte.mjs`). Chama as funções `app.vendas_*` pelo PostgREST com a chave secreta, que só existe no servidor.
- **Tetos de custo** (migration `…120400_vendas_api.sql`). O custo de cada chamada à IA é somado na conversa e no dia (horário de Brasília). Passou do teto: 429 com a oferta do WhatsApp, sem chamar o modelo.
- **Webhook** (`api/pagamentos.mjs`), em 3 passos:
  1. confere a assinatura (sem ela: 401, nada muda);
  2. consulta o gateway: status e valor vêm da fonte, não do aviso;
  3. aplica no banco numa transação, idempotente por evento; o sinal pago cria cliente e projeto.
- **Gateway** (`api/_vendas/pagamento.mjs`). Hoje só o simulado, que nunca liga em produção. Os adaptadores do Asaas ou do Mercado Pago entram quando o dono escolher.
- **Ambiente local** (`docs/banco-local.mjs`, ligado por `docs/servidor.mjs`). PGlite com as mesmas migrations, IA simulada por padrão (de graça) e a página `docs/pagamento-simulado.html`, que faz o papel do gateway.
- **Testes** (`docs/testes/fluxo-api.test.mjs`, 9 casos pela API): fluxo normal até o projeto criado, abandono e retomada, falha da IA, acesso de outro visitante, injeção de prompt, webhook forjado, velho e repetido, concorrência, dados inválidos, tetos.

## Incremento 7: a página /orcamento

- **A IA é parte da mesa, não a página inteira.** No celular, a conversa vem primeiro e o investimento logo abaixo. No desktop ficam lado a lado, com o investimento fixo na lateral. As etapas seguintes (contato, direções, ajustes, escopo, pagamento) entram como blocos próprios, conforme a etapa que o servidor devolve.
- **O estado do servidor manda na tela** (`js/orcamento.js`). Recarregar, sair e voltar ou abrir em outra aba dá no mesmo lugar, e a página rola até a etapa em que a pessoa parou.
- **Sessão** (`js/orcamento-api.js`). Nasce na primeira mensagem, não a cada visita, e fica no `localStorage` com renovação automática do token. Token vencido ou de outro banco: a página esquece e recomeça limpa.
- **As prévias** (`js/previa.js`, `css/previa.css`):
  - o JSON da direção vira página só com `textContent`;
  - cor só `#RRGGBB`, fonte só de uma lista fechada de pilhas locais;
  - a paleta entra por `el.style.setProperty`, permitido pela CSP;
  - a disposição responde ao container, então a mesma prévia cabe no cartão e no visor (celular 390 ou computador 1280, escalado);
  - texto entre colchetes aparece marcado como espaço reservado.
- **O visor**: tela cheia opaca (sem desfoque), abas 1, 2, 3 e "Sua versão", troca de aparelho, Escape fecha e devolve o foco, foco preso dentro, "Escolher esta direção" embaixo no celular.
- **Falha**: a mensagem volta para a caixa, nada inventado aparece, e o aviso traz o texto de recuperação da especificação, "Tentar de novo" e o WhatsApp.
- **Sem JS**: some a conversa e fica o aviso com o WhatsApp (`css/orcamento-semjs.css` por `<noscript>`).
- **Rodapé**: a identificação do vendedor exigida pelo Decreto 7.962/2013 está com marcadores entre colchetes até o dono mandar nome, CPF e endereço.
- **Menu**: "Orçamento com IA" entrou no menu do Início, de Sites e de Automação.
- **Privacidade**: nova seção `#orcamento`. As frases que diziam que o site não guarda nada do que se escreve foram corrigidas. A Anthropic entrou entre os operadores, com retenção de 90 dias (migration `…120500_vendas_retencao.sql`, função `app.vendas_reter`).

## Incremento 8: testes de ponta a ponta

- `npm run e2e:orcamento` (`docs/e2e-orcamento.mjs`, Chromium de verdade contra o servidor local), 29 conferências:
  - texto com HTML vira texto;
  - nenhuma sessão criada só por abrir a página;
  - contato sem aceite é recusado;
  - 3 direções e miniaturas;
  - visor: abrir, trocar, aparelho, Escape e foco;
  - escolha e ajuste;
  - retomada depois de recarregar;
  - escopo sem nome técnico e sem confirmação recusado;
  - pagamento simulado até "projeto em produção";
  - sem erro de console;
  - 320px e 1440px sem rolagem lateral;
  - sem JS.
  - Fotos em `docs/olhar-orcamento/`.
- As páginas existentes seguem verdes no `npm run verificar` (12 alvos) e no `npm run acessibilidade`, depois do item novo no menu.
