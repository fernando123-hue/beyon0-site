# Fase 2 — status ao fim da implementação (2026-10-07)

Branch `rebuild-v2`. Nada foi para produção: a `main` (o site no ar) segue `8103c99`. Nenhuma chamada real ao modelo foi feita (sem chave, e gasto precisa do aval do dono). Nenhum pagamento real foi feito. **Atualização (2026-10-07, mesma data):** o pagamento passou a ser Mercado Pago, Pix e cartão no próprio site, e o gateway simulado foi removido. Tudo do pagamento está em `docs/pagamentos/` (pesquisa, arquitetura, operação, checklist).

## IMPLEMENTADO

- **Modelo de dados** (6 migrations `20261007120000..120500`). O fluxo inteiro vive no banco, com funções transacionais:
  - conversa, mensagens, briefing com confiança;
  - estimativas que guardam a versão da tabela de preços;
  - as 3 direções como estrutura, a escolha, as alterações e o escopo (proposta);
  - pagamentos e avisos do gateway idempotentes;
  - o funil e a retenção (90 dias na época; 2 meses desde 2026-10-07, com o contato anonimizado).
  - O visitante é um usuário anônimo e só vê o que é dele (RLS). Só o servidor executa as funções.
- **Motor de preço** determinístico, com a tabela-rascunho com base no mercado (`regras-rascunho-v1.json`, a aprovar). Ele faz:
  - base, adicionais, multiplicadores, piso e arredondamento;
  - sinal de 50%;
  - teto de 10 dias, dividindo o excedente numa fase seguinte por prioridade;
  - o que não tem preço automático vai para diagnóstico.
- **Camada de IA** trocável (`api/_ia`):
  - Haiku 5.5 na conversa e na extração (modo econômico, 2026-10-08; antes Sonnet 5.5); Opus 5.5 com esforço alto na geração;
  - reserva automática do servidor;
  - cache do prompt de sistema;
  - saída em JSON Schema;
  - erros tipados, que viram a recuperação elegante;
  - provedor simulado para testes e uso local.
- **Agente de vendas** com ferramentas seguras: atualizar o briefing, estimar, pedir o contato, sugerir uma solução de IA e encaminhar para diagnóstico. Ele não tem ferramenta de preço, desconto, dado ou pagamento. O valor nunca chega ao modelo, e dinheiro escrito pelo modelo é removido do texto.
- **As 3 direções** (conversão, autoridade e experiência) a partir do mesmo briefing, uma chamada por direção. A saída é estruturada e higienizada pelo código:
  - listas fechadas;
  - contraste WCAG corrigido;
  - HTML removido;
  - "lorem ipsum" recusado;
  - prova social sem dado vira espaço reservado.
- **Alterações** em linguagem natural viram operações de uma lista fechada, e o código as aplica. Escopo novo passa pelo motor de preço.
- **Escopo final** montado pelo código, com confirmação explícita e a marcação de início dentro dos 7 dias do CDC.
- **Pagamento.** Cobrança do sinal com o valor tirado da proposta aceita. O webhook confere a assinatura, consulta o gateway e confirma no banco, de forma idempotente e com o valor conferido. O sinal pago cria o cliente e o projeto. **Substituído pelo módulo de pagamentos com Mercado Pago** (`docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md`).
- **API** (`/api/vendas`, `/api/pagamentos`): freio por IP, JSON obrigatório, corpo limitado, token do visitante, erros sem dado pessoal. Tetos de custo por conversa e por dia, e de turnos e de gerações.
- **Página `/orcamento`**, celular primeiro:
  - conversa e investimento lado a lado;
  - contato com aceite;
  - 3 direções com miniatura viva e visor para comparar em celular ou computador;
  - ajustes, escopo, confirmação e pagamento;
  - retomada depois de sair;
  - recuperação de falha;
  - aviso sem JS.
  - Menu "Orçamento com IA" nas outras páginas. Privacidade atualizada.
- **Pontos do "cérebro"** (interfaces só, `CEREBRO` em `api/_vendas/agente.mjs`): conhecimento, catálogo, regras de venda, objeções e histórico.

## TESTADO

| O quê | Resultado |
|---|---|
| `npm run testar`: banco real (PGlite, Postgres 18) com as migrations, preço, agente, geração, alterações e a API inteira | 84/84 |
| `npm run testar:mutacao`: sabotagens no banco que os testes têm de pegar | 6/6 (Fase 1) |
| `npm run e2e:orcamento`: a página no Chromium, do 1º texto ao projeto em produção | 31/31 |
| `npm run verificar`: as páginas existentes, depois do item novo no menu | 12/12 |
| `npm run acessibilidade` | sem falhas |
| Prévia na Vercel (`60d3a30`): funções `vendas` e `pagamentos` em `gru1` | publicada, pronta |

Os cenários da especificação têm teste:

- **fluxo normal** até o projeto criado;
- **fluxo incompleto:** sair e voltar, com o funil mostrando onde parou;
- **falha da IA:** nada gravado, nada inventado, e a tentativa seguinte funciona;
- **acesso de outro usuário:** "não existe", igual a uma conversa inexistente;
- **injeção de prompt:** não revela as regras, não muda o preço, fica registrada;
- **manipulação de preço:** valor no corpo da requisição é ignorado;
- **webhook inválido, velho e repetido;**
- **concorrência:** dois cliques geram uma cobrança e uma direção é gerada uma vez só;
- **dados inconsistentes:** cada um recusado com motivo, sem erro 500.

**Não testado:** o modelo real (qualidade das respostas, dos fatores e das 3 direções), o Supabase real (login anônimo, PostgREST) e um gateway real.

## SEGURANÇA

O que protege hoje (não é "100% seguro"; é o que foi feito e testado):

- **O preço é do código, nunca do modelo nem do navegador.** O sinal sai da proposta no banco.
- **Isolamento por visitante** em cada função, com RLS, e mensagem igual para "não é seu" e "não existe".
- **Pagamento confirmado só pelo aviso assinado + consulta ao gateway**, de forma idempotente, com valor conferido. O simulado nunca liga em produção.
- **Prévias desenhadas só com `textContent`.** Cor só `#RRGGBB`, fontes de lista fechada, e a CSP segue sem inline.
- **Telefone, e-mail e documentos trocados por marcadores** antes do modelo. O prompt de sistema é tratado como público.
- **Custo com teto** antes de chamar o modelo.
- **Segredos só em variável de ambiente do servidor.** Nada no navegador nem no log.

A revisão por agentes (segurança e código) e as correções estão no fim deste documento.

## PONTOS FRÁGEIS

- **A qualidade do agente e das direções com o modelo real não foi medida.** Tudo foi exercitado com o provedor simulado. É o maior risco de produto.
- **O teto diário de custo é aproximado.** Ele soma o custo inteiro das conversas que tiveram atividade no dia. Isso conta a mais, nunca a menos. Uma chamada que falha no meio não registra o custo que gastou.
- **Esgotar o teto diário derruba o agente para todos.** Com US$ 25 por dia e US$ 1,50 por conversa, poucas dezenas de conversas abusivas bastam. O freio por IP vive na memória de cada instância da função. A defesa forte (Turnstile e freio na borda) vem com o Cloudflare.
- **O login anônimo sai dos IPs da Vercel.** Para o Supabase, todos os visitantes parecem poucos IPs. O limite de login anônimo por IP precisa ser aumentado no painel (`02-OPERACAO.md`). Criar a sessão direto do navegador é a alternativa, a decidir junto com o Turnstile.
- **O token do visitante fica no `localStorage`.** Um XSS o leria. A CSP sem inline reduz esse risco, e o token só abre a conversa daquele visitante.
- **O gateway simulado guarda cobranças na memória.** Ele não serve nem como teste em preview com várias instâncias.
- **Os tempos de geração com o Opus em esforço alto não foram medidos.** O limite é de 300 s por direção. O cronômetro do cartão recomeça do zero quando a página é recarregada.
- **Trocar de direção só vale até o primeiro ajuste.** É uma trava para o escopo nunca descrever outra direção. Se o dono quiser troca livre, os ajustes passam a ser guardados por direção.
- **Os direcionamentos gerados ficam no banco depois do prazo de retenção (2 meses desde 2026-10-07; a privacidade diz isso).** A retenção apaga as mensagens, os pedidos de ajuste e o briefing. O conteúdo das direções fica, e ele pode repetir a descrição do negócio que a pessoa deu.

## PENDÊNCIAS (do dono)

1. ~~Aprovar a tabela de preços e definir dias corridos ou úteis~~: **tabela v2 aprovada pelo dono em 2026-10-09** (valores em `REGRAS-RASCUNHO.md`) e **prazo em dias corridos** (escopo, consultor, cartão, recibo e site dizem o mesmo).
2. **Chave da Anthropic** e o aval para rodar uma avaliação com o modelo real, que custa crédito.
3. ~~Escolher o gateway~~: **Mercado Pago, decidido e implementado**. Faltam as credenciais de TESTE e o checklist de `docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md` §9 a §11.
4. **Nome completo, CPF e endereço** para o rodapé do `/orcamento` (Decreto 7.962/2013). Hoje há marcadores entre colchetes.
5. **Advogado:** o texto do consentimento de início dentro dos 7 dias (CDC art. 49) e a política de privacidade.
6. **Contas e planos:** Vercel Pro (o Hobby proíbe uso comercial) e o Supabase do projeto, com login anônimo ligado e o esquema `app` exposto (`02-OPERACAO.md`).
7. **Apagar a pasta vazia `C:\Vault%20-%20Fernando`**, criada por engano por um script de teste (as fotos já foram movidas). A remoção automática foi barrada pela proteção do ambiente.

## PRÓXIMA FASE (na ordem, cada uma com o aval do dono)

1. **Infisical:** os segredos saem da Vercel e passam a ser geridos num cofre (plano em `docs/fundacao/02-OPERACAO.md` §6).
2. **Staging:** um Supabase de teste e a prévia com a IA real, rodando a avaliação de conversas e direções e medindo custo e tempo.
3. **Cloudflare**, quando o site estiver pronto: freio na borda, Turnstile no login anônimo, regras contra robôs.
4. **Produção:** aplicar as migrations no Supabase de produção, ativar a tabela aprovada, ligar a chave e o gateway, e publicar (`main`) só com o pedido do dono.

## Revisão por agentes (2026-10-07) e o que foi corrigido

Dois revisores leram o código: um de segurança e um de código. Nenhum achado crítico. O que entrou:

**Segurança**
- **Gateway simulado:** agora só liga em local, preview ou development (antes, bastava não ser produção).
- **Teto de custo furado por pedidos em paralelo:** agora há uma resposta de IA por vez por conversa (trava no banco com prazo). A etapa e os tetos são conferidos antes de chamar o modelo, e a geração de direções também confere o custo.
- **Texto livre do modelo no contrato:** as linhas de alteração do escopo agora saem só de campos de lista fechada.
- **Dado pessoal guardado e reenviado:** a mensagem e o pedido de ajuste são gravados já redigidos, e o histórico enviado ao modelo também é redigido.
- **Estado como mensagem "system":** a API não aceita esse papel em messages. O estado foi para um 2º bloco do prompt de sistema, fora do cache.
- **Escopo × preço:** o escopo agora é amarrado à estimativa com que foi montado. Se outra entrou no meio, o banco recusa.
- **Webhook:**
  - aviso de cobrança ainda não vinculada não fica gravado, então o reenvio vale;
  - "pago" depois de cancelado responde ok e fica marcado para conciliar à mão, em vez de erro em laço.
- **Cobrança presa:** se o gateway falha, o visitante recebe a explicação, e depois de 1 minuto o mesmo pagamento tenta de novo.
- **Outros:** chave de adicional com nome de propriedade do JavaScript (`constructor`) recusada; aceite do contato gravado com data; retenção cobre os pedidos de ajuste; `/docs` bloqueado no deploy.

**Código e tela**
- **Laço de pedidos ao recarregar durante a geração:** a página não insiste numa direção que outro pedido está gerando.
- **Visor:**
  - não é mais redesenhado a cada 5 s, então a rolagem e o foco ficam;
  - as direções viraram botões com estado (`aria-pressed`);
  - o foco volta ao lugar certo ao fechar.
- **Cartões e lista de ajustes:** só são refeitos quando mudam.
- **Sessão:**
  - uma renovação por vez;
  - outra aba que renovou antes é respeitada;
  - falha de rede não apaga a conversa.
- **Envio:**
  - Enter repetido não manda dois turnos;
  - a conversa some da tela nas etapas em que o agente não responde mais.
- **Espera:** não morre em silêncio, olha de novo ao voltar para a aba e descarta respostas velhas.
- **Aviso de erro:** vai para a vista e recebe o foco.
- **Pagamento:** a tela mostra o escopo confirmado e o estado da cobrança (inclusive cancelada ou expirada).

**Testes novos:**
- duas mensagens ao mesmo tempo;
- texto gravado redigido;
- conversa fechada sem custo;
- troca de direção travada;
- escopo com estimativa trocada;
- gateway por ambiente;
- cobrança que falha e se refaz;
- pagamento tardio;
- papel das mensagens enviadas ao modelo;
- escopo sem texto livre;
- E2E com Enter repetido e troca travada.
