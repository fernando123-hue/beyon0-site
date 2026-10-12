# Orçamento sem IA — desenho (2026-10-11, revisão 2)

Aprovado pelo dono, parte a parte, na conversa de 2026-10-11 ("Sim, está certo, pode seguir" em cada parte;
"Sim, está correto, pode escrever o documento" no fim). **Revisão 2** (mesmo dia): o dono pediu uma análise "como
alguém malicioso, um usuário comum, um usuário que entrou apenas para criticar e um usuário interessado" e
autorizou: "Realize as modificações necessárias e prossiga com o plano". Os quatro relatórios (agentes separados,
só leitura) estão resumidos em §9; o que mudou por causa deles está marcado com **(R2)**. Decisões em
`../../../../01 Empresa/Decisões.md`.

## Por quê

O dono não tem crédito na API da Anthropic agora e não vai gastar. Sem chave, o consultor de IA do `/orcamento`
responde 503 com o WhatsApp: o orçamento automático fica parado em produção. Decisão do dono: **o orçamento passa a
funcionar sem IA, como núcleo; a IA vira um complemento opcional** ("para futuramente a própria IA ser apenas um
complemento a mais, assim acabaremos economizando também, e o site gerará mais valor").

## Decisões do dono

| # | Pergunta | Resposta |
|---|---|---|
| 1 | O que a pessoa vê em "Monte seu orçamento" | Orçamento sem IA (não só o WhatsApp) |
| 2 | Depois do preço | Manter as **três direções** (na tela: "modelos"), feitas pelo dono no Claude Code pela fila manual |
| 3 | Ajustes | **Opções prontas** aplicadas na hora + **pedido livre** que entra na fila do dono |
| 4 | Como montar o orçamento | **Rápido, depois personalizar**: perguntas curtas → pacote recomendado com preço → "Quer ajustar?" |

## 0. O que substitui o custo da IA como freio (R2)

Hoje o abuso é contido pelo custo da IA (teto por conversa, teto do dia, freio por IP dentro de
`vendas_reservar_ia`). Sem IA esses freios somem, e o recurso escasso passa a ser **o tempo do dono**. Por isso:

| Freio | Onde | Regra |
|---|---|---|
| **Confirmação pelo WhatsApp** (o principal) | tela + painel/fila | O pedido só entra na fila de trabalho depois que a PESSOA escreve primeiro para o WhatsApp da Beyon Zero com o código do pedido (§3). Prova que o número é dela, evita o dono escrever para desconhecido (banimento, LGPD) e o aviso chega numa conversa que ela abriu |
| Não confirmados | banco | lista separada, nunca disputa espaço com os confirmados; expira em 72 h |
| Por IP | banco (`privado.contar_ip`, que já existe) | também em `detalhes`: 3 pedidos de modelos por IP/dia (/64 no IPv6); é só um dos freios (CGNAT) |
| Por telefone | banco (hash do número normalizado) | 1 pedido aberto e 2 por dia por número |
| Fila global | banco | teto de pedidos confirmados abertos; acima dele a tela oferece o WhatsApp ("muita procura agora") |
| Gerações | banco | no modo manual, 1 geração por conversa; a 2ª só por pedido explícito, confirmado |
| Fila do dono | `scripts/direcoes.mjs` + painel | ordena por prioridade (confirmados, ajustes de quem já escolheu); ações "descartar" e "arquivar"; o corte de 50 nunca esconde confirmados; alarme acima de N itens |
| Funil | banco | eventos `confirmacao_whatsapp`, `pedido_expirado`, `pedido_descartado`, `freio_ip`; conversão do Ads só com pedido confirmado |

Antes de ligar em produção (bloqueios, já em `docs/revisoes/pr1-pendencias.md`): regra de limite por IP no firewall
(S4, hoje na Vercel; na Cloudflare depois), retenção de usuários anônimos sem conversa, e `modoDirecoes` = `manual`
sempre que não houver `ANTHROPIC_API_KEY` (com teste).

## 1. O caminho

```
1. Perguntas rápidas  ─┐
                        ├─► pacote recomendado + PREÇO (motor de preço; formatos vizinhos ao lado)
2. "Quer ajustar?"    ─┘        │
                                 ▼
3. Detalhes + contato ─► "Confirmar pelo WhatsApp" (código do pedido) ─► fila do dono (data concreta)
                                 ▼
4. Escolhe 1 dos 3 modelos ─► ajustes: opções prontas (na hora) ou pedido livre (fila)
                                 ▼
5. Resumo do que será feito (escopo) ─► confirma ─► entrada (online quando ligado; até lá, pelo WhatsApp)
```

- **O formulário é o núcleo.** Produz o mesmo que a IA produz hoje: os FATORES do preço e o BRIEFING. Do passo 4 em
  diante o fluxo (escolha, escopo, confirmação, pagamento) já existe e não muda de regra.
- **O preço nunca vem do navegador.** O navegador manda as escolhas; o servidor monta os fatores (inclusive
  urgência, só se marcada, e nunca `complexidade` vinda do corpo) e calcula pela tabela ATIVA.
- **A IA depois:** "Prefere conversar?" abre o consultor, que preenche o MESMO formulário; com a IA ligada, ela
  responde na hora os pedidos livres. Sem chave da Anthropic, o botão não aparece.
- **(R2) Nenhum texto do site promete o consultor de IA enquanto ele não funcionar.** No PR 1, todas as menções
  ("consultor de IA" no hub, em Sites e no FAQ/JSON-LD, no orçamento, na privacidade) passam a descrever o formulário.
- **(R2) Classificador com dois motores (encaixe do JEV, §8).** A recomendação e a triagem da fila são feitas por um
  contrato interno de "classificador" com o adaptador "regras" (hoje, grátis) e o lugar do adaptador "jev"
  (desligado, sem chamada externa).

## 2. As perguntas, a recomendação e a tela do preço

Uma pergunta por tela, botões grandes, com exemplos curtos dentro dos botões e "Não sei, escolha por mim":

1. **O que o seu negócio faz e onde?** — ramos com exemplos (Serviços: "oficina, assistência técnica, advocacia…";
   Saúde; Beleza; Alimentação; Comércio; Educação; "outro" em texto curto), mais a **cidade** (R2: cedo, porque muda o
   conteúdo e o "achado no Google"). Associação vai para o fim.
2. **O que o site precisa trazer para você?** (mais de uma) — receber pedidos e orçamentos pelo WhatsApp; ser achado
   no Google e no mapa; agendamentos; vender online; apresentar a empresa; uma campanha ou lançamento.
3. **Já tem site ou endereço próprio?** (R2) — não; só Instagram; tenho site; tenho só o endereço (.com.br).
4. **Já tem logo e textos?** — tenho; tenho parte; não tenho.

**Recomendação por TABELA EXPLÍCITA (R2)** — combinação de respostas → formato e extras, cada caso escrito e testado
(nada de regra "um objetivo só"):
- "vender online" → Loja (plataforma);
- só "campanha ou lançamento" → Landing page;
- todo o resto (inclusive um objetivo só como "agendamentos" ou "pedidos pelo WhatsApp") → Site institucional, com
  Landing page ao lado como alternativa mais barata quando couber;
- "agendamentos" → + Agendamento online; "ser achado no Google" não muda o preço (já vem em todo site);
- "não tenho textos" → SUGESTÃO de textos, mostrando o total ("Textos das 5 páginas: +R$ 1.250") e a consequência de
  recusar ("sem isso, o prazo conta a partir dos seus textos");
- Experiência digital e área restrita nunca sugeridas sozinhas.

**Tela do preço:**
- o recomendado no meio, com o motivo nas palavras da pessoa, e os formatos vizinhos ao lado com uma frase de
  diferença (âncora honesta; nada de "mais escolhido" sem dado);
- "Já vem no pacote:" (a lista `inclui` da tabela + domínio do 1º ano) e "Depois de pronto você paga:" (hospedagem
  por mês — DADO DO DONO, §10);
- "Não sei" assumido aparece escrito: "Considerei: site com várias páginas. Trocar";
- "**Você não paga nada até escolher um modelo e confirmar o resumo.**";
- prazo dos modelos já com data concreta ("prontos até terça, 18h", calculada pelo servidor);
- "Ver um exemplo de modelo" (o visor atual com um modelo feito para um negócio fictício, com a etiqueta "Exemplo
  para um negócio fictício. O seu é feito para o seu caso.");
- botões "Quero os três modelos" e "Quer ajustar?".

## 3. "Quer ajustar?", os detalhes e a confirmação

**Quer ajustar?** — como na versão 1 (extras que fazem sentido para o ramo, "ver mais opções", nome + frase + valor,
`requer` respeitado, desmarcar o pai desmarca os dependentes, fora do automático = "fale comigo"), mais (R2):
- urgência com números claros ("No ar em 5 dias em vez de 8: +R$ X");
- o preço ao vivo vem de `simular` (calcula, NÃO grava); só o pacote final é gravado (`confirmar-pacote`, uma vez);
- a versão da tabela vai e volta: se mudou no meio, 409 com o preço novo e confirmação;
- Landing com páginas extras: regra do dono (§10).

**Detalhes (uma tela, celular primeiro):**
- obrigatórios: nome do negócio, o que vende (sugestões prontas por ramo + texto curto) e WhatsApp, logo no começo
  ("para te avisar quando os modelos ficarem prontos");
- opcionais, visivelmente: para quem vende, o que diferencia, @ do Instagram, estilo escolhido por IMAGEM, um site
  que admira (só nome/domínio, sem link clicável; ninguém busca nada nele automaticamente);
- campos curtos (60 a 200 caracteres), `redigir` em todo texto antes de gravar, aviso "não escreva CPF, telefone ou
  dados de outras pessoas";
- "leva 2 minutos"; o que foi digitado fica guardado a cada campo.

**Confirmação pelo WhatsApp (R2):** ao enviar, a tela mostra o CÓDIGO do pedido em letra grande ("tire um print") e o
botão "**Confirmar pelo WhatsApp**", que abre a conversa com a Beyon Zero com o texto pronto "Meu pedido é BZ-K7M3Q".
O dono marca o pedido como confirmado no painel quando a mensagem chega (sem API paga). Sem confirmação em 72 h, o
pedido expira.

**Espera útil:** a data concreta, quem está desenhando (nome e foto — DADO DO DONO), e "Enquanto isso, já separe":
fotos, logo, lista de serviços e preços, horário, endereço, com "Mandar pelo WhatsApp". O aviso de "prontos" leva um
**link de retomada** (código de uso único, guardado no servidor, com validade; revisão de segurança própria) que
reabre o pedido em qualquer aparelho. A fila prepara também um lembrete para 2 dias depois do "pronto" (envio manual).

## 4. Ajustes e a fila do dono

**Opções prontas** — o servidor monta as mudanças a partir de uma LISTA FECHADA de chaves (modelo 1–3, tipo de seção)
e nunca aceita `valor`/`campo` livres (sem `trocar_texto`, `cor` hex, `adicional`, `paginas`):
- cores: `usar_paleta_de`; fonte: `usar_tipografia_de`;
- seções: `mover_antes_de` / `mover_depois_de`, `remover_secao`, `adicionar_secao` (dos outros modelos);
- desfazer (versões guardadas, até 30 ajustes por conversa).
Mudança de preço volta para o "Quer ajustar?" e recalcula pelo motor. No primeiro ajuste, aviso explícito: "Depois
disso, não dá para trocar de modelo. Continuar?".

**Pedido livre** — até 3 por conversa, curto, com a mesma moldura de DADO do briefing na fila. Se pede item da tabela,
a tela devolve ao "Quer ajustar?". O botão diz "Seu pedido entra junto; não atrasa o início". Ao ir para o resumo, os
pedidos pendentes aparecem como "não incluído / aguardando" e o comando do dono recusa entregar ajuste de conversa que
já passou da etapa de ajustes (conferido no servidor).

**A fila** (`scripts/direcoes.mjs` + skill `produzir-direcoes`):
- lista modelos a gerar e ajustes a aplicar, só de pedidos confirmados, por prioridade;
- a skill roda numa sessão ISOLADA (pasta do pedido, sem Bash de rede, sem WebFetch/WebSearch, sem leitura fora da
  pasta);
- `entregar-pedido` mostra ao dono tudo o que vai sair e recusa se achar URL, caminho de arquivo, chave (`sk-`,
  `eyJ`, base64/hex longos), e-mail ou telefone;
- texto suspeito (`pareceInjecao`) vira selo no cartão do painel; no painel e nas mensagens, tudo que vem do
  visitante é texto puro e link só é gerado pelo código a partir de dígitos validados.

## 5. Pagar sem medo (R2)

- **"Perguntas antes de pagar"** fixas e abertas no resumo e na entrada (sem IA): quando pago o restante; posso
  desistir (7 dias, CDC art. 49, em frase normal); o que recebo e como; quantos ajustes; hospedagem; nota fiscal —
  respostas a partir dos DADOS DO DONO (§10). "Outra dúvida? WhatsApp". O "Pergunte ao consultor" sai.
- **WhatsApp sempre à mão**: botão pequeno fixo em todas as etapas, com o código do pedido, a etapa e o valor na
  mensagem.
- Antes do Pix: "No seu banco vai aparecer: [nome exato]"; junto do CPF: "o Mercado Pago pede para emitir o Pix";
  "Copiar código Pix" primeiro e grande, com 3 passos; o QR recolhido em "pagar por outro aparelho".
- Depois da entrada: 3–4 passos com prazo (material, início do prazo, prévia, no ar e o restante) — DADO DO DONO.
- "Fica para uma fase seguinte" vira "Isto fica para depois; você não paga agora".

## 6. Linguagem e leitura (R2)

- Na tela, palavras de gente: modelo (não "direção"), resumo do que será feito (não "escopo"), site de uma página /
  site com várias páginas, entrada, "feito para trazer pedidos / passa confiança / moderno e chamativo". "Briefing"
  nunca aparece.
- Texto que importa com no mínimo 16 px e cinza claro; botões em frase normal (não caixa alta); etapas como "Passo 2
  de 5 · Preço"; o cinza mais apagado só para o que pode ser ignorado.
- A prévia abre na vista celular, abas com nome curto ("1 · Traz pedidos"), e nunca mostra o texto bruto digitado.
- A pesquisa de vícios de linguagem de IA em português e a revisão de todo o site (lista do crítico em §9) são o
  PR 4. Nenhum texto novo usa "sob medida".

## 7. Por dentro

**Servidor (`api/vendas.mjs` → `api/_vendas/fluxo.mjs`):**
- `catalogo` (GET, com sessão): chave, nome, frase, valor, `requer`, fora do automático. Nada interno (prioridade,
  prazo por item, piso, limites, descontos).
- `simular` (POST): respostas + extras → fatores → motor; não grava; limite por sessão (ex.: 60/h).
- `confirmar-pacote` (POST): grava a estimativa uma vez (`vendas_registrar_estimativa`), com a versão da tabela.
- `detalhes` (POST): só nas etapas iniciais e uma vez (sem regravar depois que existem modelos), mínimos
  obrigatórios conferidos no banco antes de `vendas_iniciar_geracao`; `redigir` e esquema fechado (reaproveitar
  `limparAtualizacao`).
- `confirmar-whatsapp` (painel do dono): marca o pedido como confirmado.
- Ajustes: opção pronta → mudanças da lista fechada → `aplicar`; pedido livre → "na fila", sem IA.
- Funções novas usam `privado.conversa_do` e `exigir_etapa` explícito, com teste de cada etapa recusada.

**Banco:** migration com o briefing sem turno de conversa, o estado "na fila" do ajuste, confirmação e expiração do
pedido, limites por telefone e fila, e os eventos novos. O dono aplica no banco real antes de promover.

**IA ligada/desligada:** sem chave → sem "Prefere conversar?", pedido livre nunca chama IA e os modelos saem sempre
pela fila manual.

**Testes:** classificador por tabela (cada combinação de respostas → pacote; todas as combinações do catálogo ativo →
preço ou "fale comigo", nunca 500); API com banco real (PGlite): preço recalculado no servidor, versão da tabela,
dependente sem o pai recusado, etapas recusadas uma a uma, limites por IP/telefone/fila, não confirmado nunca entra na
fila, pedido livre fora do contrato; E2E no celular do começo ao pagamento simulado, com a confirmação pelo WhatsApp
simulada; acessibilidade e `npm run verificar`.

## 8. O JEV (R2)

Pedido do dono (2026-10-11, "MISSÃO: preparação estratégica… da versão gratuita do JEV"). O que se sabe, sem
inventar: o JEV é um classificador externo (typesafe.ai) estudado no Sistema SBP; lá a API não respondeu (403), não
há chave nem documentação pública acessível, e nenhum número de preço, latência ou acerto foi medido. Na Beyon Zero
ele não existe; a auditoria de 2026-10-07 (`06 Operação/Auditoria do Harness`, §5) reservou o lugar: abaixo da
coordenação, como classificador/roteador, nunca decidindo dinheiro, permissão, identidade ou publicação, sempre com
recuo para as regras.

- **Etapa A (neste trabalho):** contrato `classificador` (entrada e saída versionadas), adaptador `regras` e
  adaptador `jev` DESLIGADO (sem endereço, sem chamada; responde "indisponível" e o sistema usa as regras),
  chave liga/desliga por ambiente, tempo-limite com recuo, testes com dublê.
- **Etapa B, a versão gratuita (neste trabalho):** o adaptador `regras` faz duas coisas úteis já: a recomendação do
  pacote (§2) e a triagem da fila do dono (confirmado/não confirmado, selo de texto suspeito, prioridade).
- **Etapas C e D:** só com documentação oficial, chave, condições de uso e uma medição do JEV contra as regras;
  decisão do dono.

## 9. Resumo das quatro análises (R2)

- **Malicioso:** contato forjado (o dono escreveria para quem não pediu), fila inundada sem custo, injeção no texto
  que o dono cola no Claude Code, estimativa regravada depois dos modelos, `estimar` a cada clique, preço mostrado ≠
  gravado, pedido livre fora do contrato, dado pessoal no briefing, raspagem da tabela. Coberto em §0, §3, §4 e §7.
- **Usuário comum:** pedido preso ao navegador, número desconhecido e número errado, "24 h úteis" vago, ninguém
  identificável, nome no Pix, dúvidas sem resposta, hospedagem sem número, preço que pula, palavras técnicas, letra
  pequena, QR inútil no próprio celular. Coberto em §2, §3, §5 e §6.
- **Crítico:** cara de golpe (sem nome, CNPJ, domínio; comentários de bastidor e modo de teste no HTML publicado),
  "consultor de IA" prometido e fora do ar, nenhum trabalho real, site pesado para quem vende site rápido, cara de
  template, contradições entre páginas (formatos, prazos, "teste grátis", dado de saúde, "eu" × "nós"), preço "a
  partir de" com cara de isca, ~40 frases com cara de IA listadas por arquivo e linha. O que é do orçamento está aqui;
  o resto vai para o PR 4 e para as decisões do dono.
- **Interessado:** data concreta e retomada, o que está incluído e o que se paga depois, respostas fixas antes de
  pagar, WhatsApp com código, exemplo de modelo antes do contato, "sem risco até o resumo", tabela explícita, âncora
  honesta, incoerência Landing + páginas extras × Institucional. Coberto em §2, §3 e §5; dados em §10.

## 10. Dados e decisões do dono (bloqueiam partes do texto, não o código)

1. Vendedor: nome completo, CPF ou CNPJ, endereço (pode ser comercial), e-mail; nome e foto para "quem faz o seu
   site"; o nome exato que aparece no Pix.
2. Hospedagem por mês que o cliente paga depois (por formato).
3. O que conta como "entrega", quantas rodadas de ajuste vêm incluídas, quanto tempo de suporte, e o que acontece com
   a entrada se o cliente desistir no meio.
4. Parcelas no cartão: até quantas, e quem paga os juros.
5. Landing page com páginas extras (hoje 1.500 + 4 × 350 = 2.900 por 5 páginas, contra 3.500 do Institucional):
   limitar as extras na Landing ou trocar sozinho para Institucional a partir de N páginas.
6. Nota fiscal: emite ou não (hoje opera no CPF).
7. Loja: a faixa ou o link oficial de preços da Nuvemshop/Shopify, e que a plataforma fica no nome do cliente.
8. Os passos depois da entrada (material, prazo, prévia, no ar e o restante).

Enquanto um dado faltar, o texto correspondente não é publicado (nada de valor inventado).

## Entrega

1. **PR 1 — núcleo:** classificador (contrato + regras + JEV desligado), perguntas, recomendação por tabela, tela do
   preço, "Quer ajustar?" com `simular`/`confirmar-pacote`, e todos os textos que prometem o consultor de IA.
2. **PR 2 — detalhes, confirmação e fila:** detalhes, confirmação pelo WhatsApp, freios no banco, fila por
   prioridade com descartar/expirar, espera útil, link de retomada, sessão isolada e varredura na entrega.
3. **PR 3 — ajustes e pagar sem medo:** opções prontas, pedido livre, perguntas antes de pagar, WhatsApp fixo, Pix
   copia e cola primeiro, passos depois da entrada.
4. **PR 4 — linguagem e verdade do site:** a pesquisa de vícios de IA em português, as ~40 frases do crítico, as
   contradições entre páginas, os comentários de bastidor e o HTML do modo de teste fora do que é publicado.

Cada PR com revisão técnica e de segurança (`docs/PROCESSO.md`). Fora deste desenho, para o dono decidir: o peso e os
efeitos do site no celular (reator, ouro, mini) e a cara de template (numeração das seções, bolinha de status, foto
real) — o dono aprovou a identidade e não se redesenha sem ele.
