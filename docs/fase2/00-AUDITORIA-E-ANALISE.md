# Fase 2 — Etapa 0: auditoria e análise da especificação (2026-10-06)

Pedido do dono: não copiar a especificação, analisá-la contra o que existe, pesquisar fontes reais e tirar as dúvidas antes de implementar.

## 1. O que a especificação pressupõe e não é verdade hoje

| A especificação diz | A realidade (branch `rebuild-v2`, `f859495`) |
|---|---|
| "A fundação, a segurança, a autenticação, os segredos e a infraestrutura da Fase 1 já foram preparados" | **Em parte.** O banco, o RLS, as migrations e os testes estão prontos **em código**. **Não existe** projeto no Supabase, o Infisical não foi feito (aguarda autorização), e não há chave de IA nem conta de pagamento. O site ainda roda no plano Hobby da Vercel, que proíbe uso comercial, e vender pelo site é uso comercial. |
| Autenticação existe | Existe o modelo (Supabase Auth com membros e papéis), feito para **a equipe**. Não há nada para o **visitante**: ele é anônimo, e a especificação exige isolar a conversa e o projeto dele dos de outros. |
| Preço por regras configuráveis | A tabela de preços está **em branco** (`docs/estrutura/TABELA-DE-PRECOS.md`). Sem ela, nenhum preço pode aparecer: pela regra do projeto, nenhum valor é inventado. |
| Entrega em até 10 dias | Hoje o site diz "Prazo combinado na conversa", e o formato "sob medida" acabou de absorver projetos complexos. Os 10 dias não cabem em todos os formatos sem regra. |
| Pagamento online | O plano de negócio ainda não decidiu entre CPF e CNPJ (pendente desde o guia do Google Ads). A venda online exige identificação do vendedor no site (seção 4). |

## 2. O que já existe e será reaproveitado

A especificação pede para não duplicar sistemas:

- **Banco:** um só, o Supabase, com o esquema `app`. Ele já tem `leads` (origem, campanha e código da visita), `briefings` (JSON com versão do formulário), `propostas` (versionadas e imutáveis depois de enviadas: é exatamente o "escopo final" que o cliente confirma), `projetos` (com situação), `revisoes` e `auditoria`.
- **Autenticação:** um só, o Supabase Auth. Para o visitante, a recomendação é o **login anônimo do próprio Supabase**, depois convertido em usuário com e-mail na hora de pagar. Não cria uma segunda autenticação.
- **API:** o padrão do `/api/leads`, com freio por IP, validação em lista fechada, autorização e a operação feita como o usuário. As novas rotas seguem o mesmo molde.
- **Métricas:** o código da visita, a origem e a campanha já ligam o clique ao lead. O funil do agente (início, briefing, propostas, escolha, pagamento) entra no mesmo painel.
- **Interface:** a identidade da V4 (escuro, ciano, Sora e Mono, linhas de 1 px, sem desfoque), o mini AI Core e a descarga de texto, que pode dar vida ao agente.

## 3. O que precisa ser criado (modelo de dados, por migrations, com RLS e testes)

- `conversas` e `mensagens`: agora justificadas, porque o agente atende no site. Retenção curta.
- `regras_comerciais`: catálogo, preço base, adicionais, multiplicadores, prazos, limites e descontos autorizados, **versionadas**. Cada estimativa guarda a versão usada.
- `estimativas`: os fatores, o valor calculado, a versão das regras e a confiança.
- `direcoes`: as 3 propostas de design, guardadas como **estrutura** (seções, textos, paleta, tipografia), não como HTML.
- `escolhas` e `alteracoes`: a direção escolhida e os pedidos convertidos em mudanças estruturadas.
- `pagamentos` e `eventos_pagamento`: os eventos do gateway, idempotentes (o mesmo evento duas vezes não paga duas vezes).
- `eventos_funil`: as métricas do agente, sem o conteúdo das mensagens.
- **Acesso do visitante:** um vínculo entre o usuário anônimo e o lead dele, com RLS em que o visitante só vê o que é seu.
- **Interfaces do "cérebro" futuro:** pontos de integração no código (conhecimento, catálogo, regras de venda, objeções e histórico), sem sistema de conhecimento agora.

## 4. Fatos pesquisados que mudam decisões

### Vercel (documentação oficial)

- Uma função roda **no máximo 300 s no Hobby** e até 800 s no Pro.
- O tempo esperando a IA responder não conta como uso de CPU.
- Há streaming.
- A geração das 3 direções cabe num limite assim, mas pede processamento em etapas e acompanhamento pela tela, não uma chamada única.

Fonte: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations).

### Venda online no Brasil (Decreto 7.962/2013 e CDC, art. 49)

- O site que vende precisa mostrar, **em destaque**, o nome e o **CPF ou CNPJ** do fornecedor, o **endereço físico e eletrônico**, as características do serviço e o preço discriminado.
- Na venda pela internet, o consumidor tem **7 dias para desistir**.
- Começar o serviço dentro desses 7 dias aumenta o risco de disputa. O recomendado é pedir uma **concordância expressa e destacada** do cliente para começar antes.
- Isso conversa diretamente com a promessa de "entrega em até 10 dias". **Precisa de advogado** antes de vender.

Fontes: [Decreto 7.962/2013](https://okai.com.br/documento/2013-03-15/decreto-nº-7-962-de-15-de-marco-de-2013), [Idec](https://idec.org.br/consultas/dicas-e-direitos/idec-destaca-direitos-do-consumidor-no-comercio-eletronico), [Jus.com.br](https://jus.com.br/artigos/55950/o-direito-de-arrependimento-a-luz-do-codigo-de-defesa-do-consumidor).

### Pagamento

- **Mercado Pago** assina os webhooks com HMAC-SHA256 no cabeçalho `x-signature` ([documentação](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/notifications)).
- **Asaas** manda um token próprio no cabeçalho `asaas-access-token`, de 32 a 255 caracteres e obrigatório ([documentação](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)).
- Nos dois, **nunca** se confia no "o navegador disse que pagou". O pagamento só vale depois do webhook validado **e** de uma consulta ao gateway para confirmar a situação.
- Taxas de 2026 encontradas:
  - Asaas: Pix R$ 0,99 (promocional); cartão à vista R$ 0,49 + 1,99% a 2,99% ([Asaas](https://www.asaas.com/precos-e-taxas)).
  - Mercado Pago: Pix a 0% no QR Code; as taxas do checkout online variam ([calculadora](https://www.calculadoradetaxas.com.br/public/mercado-pago)).

### Segurança de agentes de IA (OWASP Top 10 para LLM, 2025)

Os riscos da especificação estão nomeados lá: injeção de prompt (LLM01), vazamento de dado sensível (LLM02), saída mal tratada (LLM05), agência excessiva (LLM06), vazamento do prompt de sistema (LLM07) e consumo sem limite (LLM10). Fonte: [resumo do OWASP 2025](https://invicti.com/blog/web-security/owasp-top-10-risks-llm-security-2025).

A defesa principal é de arquitetura, não de prompt:

- o modelo **não tem** ferramenta que mude preço, conceda desconto ou leia dados de outro cliente;
- o prompt de sistema é tratado como **público**: nada secreto vai nele;
- toda saída do modelo é validada por esquema antes de virar tela ou banco.

### Preço de mercado de sites no Brasil, 2026

Referências para a tabela de preços, não para colar direto:

- landing page de freelancer bom: R$ 500 a R$ 2.500 ([InfinitePay](https://www.infinitepay.io/blog/quanto-custa-criar-um-site), [Wix](https://pt.wix.com/blog/quanto-custa-uma-landing-page));
- site institucional: R$ 800 a R$ 8.000, conforme o porte ([Locaweb](https://www.locaweb.com.br/blog/temas/primeiros-passos/quanto-custa-um-site/));
- sob medida com funcionalidades: R$ 2.000 a R$ 50.000;
- manutenção: R$ 50 a R$ 500 por mês.

### Custo da IA (preços oficiais da Anthropic, por milhão de tokens)

| Modelo | Entrada | Saída |
|---|---|---|
| Claude Opus 5.5 | US$ 4 | US$ 20 |
| Claude Sonnet 5.5 | US$ 2 | US$ 10 |
| Claude Haiku 4.5 | US$ 1 | US$ 5 |

A leitura de cache sai por cerca de 10% da entrada. As contas abaixo são **estimativas** a medir: uma conversa de descoberta tem uns 10 turnos, com o contexto principal em cache, e gerar as 3 direções produz uns 12 mil tokens de saída.

| Etapa | Opus 5.5 | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|---|
| Conversa de descoberta | ~US$ 0,10 a 0,25 | ~US$ 0,05 a 0,12 | ~US$ 0,03 a 0,06 |
| 3 direções | ~US$ 0,40 a 0,70 | ~US$ 0,20 a 0,35 | ~US$ 0,08 a 0,15 |

Com o dólar perto de R$ 5,50, um lead completo sai por uns **R$ 3 a 5 no Opus**, R$ 1,50 a 2,50 no Sonnet e menos de R$ 1 no Haiku. O número real sai da medição, com conversas de teste antes de abrir ao público.

## 5. Decisões técnicas que tomo sem precisar do dono (justificadas)

1. **As direções viram estrutura, não HTML gerado.** O modelo gera um JSON validado com as seções, os textos, a paleta, a tipografia e a ordem, e **o nosso código** monta a prévia com três famílias de layout (Conversão, Autoridade, Experiência). Motivos:
   - **Segurança:** HTML do modelo seria XSS em potencial e quebraria a CSP sem inline.
   - **Qualidade:** fica consistente com o acabamento da Beyon Zero.
   - **Custo:** sai menos tokens.
   - **Alterações estruturadas:** "a cor da 1 na 2" e "depoimentos antes de serviços" viram operações sobre o JSON, como a especificação pede.
2. **O modelo conversa; o código calcula.** O preço sai da função `estimar(fatores)` sobre `regras_comerciais`. O modelo só escolhe os fatores, que são validados, e nunca escreve um número de preço que vá para a tela.
3. **A camada de IA fica abstraída.** Uma interface `provedorIA` com as operações conversar, extrair e gerar; a implementação Anthropic fica por trás dela. Um provedor local ou um substituto entra sem mexer no resto.
4. **Uma dependência de execução, o SDK oficial da Anthropic** (`@anthropic-ai/sdk`, versão fixa). Até hoje o projeto não tinha nenhuma. A orientação oficial é usar o SDK (erros tipados, streaming, tentativas automáticas). Para isso, o `package.json` passa a ir no deploy, e a Vercel deixa de baixar o navegador do Playwright.
5. **O visitante entra pelo login anônimo do Supabase,** criado pelo nosso backend, sem chave nova no navegador. Ele vira usuário com e-mail na hora de pagar. Há freio por IP e limite diário de custo de IA.
6. **Os desenhos das prévias** usam composições gráficas e tipográficas da marca do cliente, com espaços marcados para as fotos dele. Não uso banco de imagens, por causa da licença e para não ter cara genérica.

## 6. Decisões do dono (2026-10-06)

| Tema | Decisão | Consequência no sistema |
|---|---|---|
| Prazo | **Até 10 dias para todos os formatos** | As regras têm um teto de capacidade em 10 dias. Um escopo que não cabe vira **fase 1**, que cabe nos 10 dias, mais o resto como fase seguinte e orçamento à parte. O agente nunca promete mais de 10 dias nem menos que o prazo da regra. O prazo conta a partir do sinal pago e do material recebido. |
| Pagamento | **50% para começar, 50% na entrega** | Dois pagamentos por proposta (sinal e saldo). O projeto entra em produção só com o sinal confirmado pelo webhook. |
| Gateway | **Decidido depois** | Camada de pagamento abstraída, testada com um gateway simulado (webhook assinado e idempotente). Asaas e Mercado Pago entram como adaptadores quando houver conta. |
| Vendedor | **Pelo CPF do dono** | O rodapé e a tela de confirmação mostram o nome completo, o CPF e o endereço, como pede o Decreto 7.962. Esses dados ficam em configuração e o dono os informa. Em pessoa física, o comprovante é recibo; a nota fiscal de serviço depende do município. |
| Contato | **Antes de gerar as 3 direções** | A conversa e a estimativa são livres. As direções exigem nome e WhatsApp ou e-mail, e nesse momento o lead é criado. |
| Modelos | **Claude Sonnet 5.5, esforço médio, na conversa; Claude Opus 5.5, esforço alto, nas 3 direções.** "As opções devem ser tão boas que se vendam sozinhas." | A geração recebe o briefing completo e a pesquisa do segmento feita pela conversa. A qualidade das direções é a prioridade do orçamento de tokens. |
| Escopo do agente | **Foco em sites**, podendo sugerir e explicar soluções com IA para cada cliente, sem preço automático (estruturar melhor depois) | O agente tem uma ferramenta de sugestão de IA que registra o interesse no briefing e encaminha para o diagnóstico. |
| Preços | **Rascunho com base no mercado, com fontes**, aprovado pelo dono | A tabela entra como versão `rascunho`. Só a versão `ativa`, aprovada pelo dono, gera preço para visitante. |

**Pendência legal, que exige advogado antes de vender:** o direito de arrependimento de 7 dias (CDC, art. 49).

- Pela lei, quem desiste nesse prazo recebe de volta o que pagou, com correção monetária.
- Como o prazo de produção é de 10 dias, a tela de confirmação pede uma **concordância expressa e destacada** para começar já, e informa os 7 dias.
- O reembolso, nesse caso, é tratado à mão pelo dono.
- O texto final dessa concordância precisa de revisão jurídica.
