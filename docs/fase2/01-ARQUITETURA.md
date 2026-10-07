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
