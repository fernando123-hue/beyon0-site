# Orçamento sem IA — desenho (2026-10-11)

Aprovado pelo dono, parte a parte, na conversa de 2026-10-11 ("Sim, está certo, pode seguir" em cada parte;
"Sim, está correto, pode escrever o documento" no fim). Decisões em `../../../../01 Empresa/Decisões.md`.

## Por quê

O dono não tem crédito na API da Anthropic agora e não vai gastar. Sem chave, o consultor de IA do `/orcamento`
responde 503 com o WhatsApp: o orçamento automático fica parado em produção. Decisão do dono: **o orçamento passa a
funcionar sem IA, como núcleo; a IA vira um complemento opcional** ("para futuramente a própria IA ser apenas um
complemento a mais, assim acabaremos economizando também, e o site gerará mais valor").

## Decisões do dono

| # | Pergunta | Resposta |
|---|---|---|
| 1 | O que a pessoa vê em "Monte seu orçamento" | Orçamento sem IA (não só o WhatsApp) |
| 2 | Depois do preço | Manter as **três direções**, feitas pelo dono no Claude Code pela fila manual (até 24 h úteis) |
| 3 | Ajustes | **Opções prontas** aplicadas na hora + **pedido livre** que entra na fila do dono |
| 4 | Como montar o orçamento | **Rápido, depois personalizar**: 3–4 perguntas → pacote recomendado com preço → "Quer ajustar?" |

## 1. O caminho

```
1. Perguntas rápidas (3–4)  ─┐
                              ├─► pacote recomendado + PREÇO (motor de preço, igual hoje)
2. "Quer ajustar?" (extras)  ─┘        │
                                       ▼
3. Detalhes + contato ─► fila de direções (o dono, no Claude Code, até 24 h úteis)
                                       ▼
4. Escolhe 1 das 3 direções ─► ajustes: opções prontas (na hora) ou pedido livre (fila)
                                       ▼
5. Escopo final ─► confirma ─► sinal (pagamento online quando ligado; até lá, pelo WhatsApp)
```

- **O formulário é o núcleo.** Produz o mesmo que a IA produz hoje: os FATORES do preço (formato, páginas,
  adicionais, urgência) e o BRIEFING. Do passo 3 em diante, o fluxo (fila, direções, escolha, escopo, confirmação,
  pagamento) já existe e não muda.
- **O preço nunca vem do navegador.** O navegador manda as escolhas; o servidor monta os fatores e calcula pela tabela
  ATIVA (`api/_vendas/precos.mjs`).
- **A IA depois:** um botão "Prefere conversar?" abre o consultor, que preenche o MESMO formulário conversando; com a
  IA ligada, ela também responde na hora os pedidos livres de ajuste. Sem chave da Anthropic, o botão não aparece.
- A conversa atual com o consultor sai da tela enquanto não houver crédito; o código dela fica, sem uso.

## 2. As perguntas e a recomendação

Uma pergunta por tela, botões grandes, sempre com "Não sei, me ajude":

1. **O que o seu negócio faz?** — saúde, beleza, alimentação, comércio, serviços, educação, associação… e "outro"
   (texto curto).
2. **O que o site precisa trazer para você?** (mais de uma) — clientes pedindo orçamento, agendamentos, vender
   online, apresentar a empresa, um lançamento.
3. **Você já tem site hoje?** — não; só Instagram; tenho, mas quero refazer.
4. **Você já tem logo e textos?** — tenho; tenho parte; não tenho.

Regras da recomendação (arquivo próprio, puro e testado; o mesmo que a IA vai usar):
- Formato: "lançamento" ou "um objetivo só" → Landing page; "vender online" → Loja (plataforma); o resto →
  Site institucional. "Não sei" em tudo → Site institucional.
- Adicionais puxados pelo objetivo: "agendamentos" → Agendamento online.
- "Não tenho textos" → "Textos escritos pela Beyon Zero" como SUGESTÃO (não incluída à força).
- Experiência digital e área restrita nunca são sugeridas sozinhas; ficam no "Quer ajustar?".
- Cada recomendação traz o motivo numa frase, com as palavras da pessoa.

Tela do preço: o cartão de hoje (valor, sinal, prazo, o que inclui) + o motivo + "Quero as três direções" e
"Quer ajustar?".

## 3. "Quer ajustar?" e os detalhes

**Quer ajustar?** — lista curta, só o que faz sentido para o negócio:
- sempre: páginas a mais, textos, curadoria de imagens, formulário avançado, idioma, urgência;
- conforme o caso: agendamento (saúde, beleza, serviços), blog, catálogo (comércio), integração, os da loja (só com
  Loja);
- "Ver mais opções": o resto, com área restrita e Experiência digital;
- cada extra: nome, uma frase, valor (do servidor, da tabela ativa); o total muda na hora;
- dependências da tabela (`requer`) respeitadas: o dependente só aparece com o item de que depende;
- fora do automático (loja do zero, sistema sob medida): "fale comigo" com o WhatsApp, sem preço.

**Quero as três direções** — uma tela:
- nome do negócio, cidade, para quem vende;
- principais serviços ou produtos;
- o que diferencia (opcional);
- cores e estilo: 4–5 estilos em botões ou "tenho logo e cores" (opcional);
- um site que admira (opcional);
- contato: nome, WhatsApp, aceite (como hoje).

Barrinha de "quanto mais, melhores as direções", sem obrigar. Depois de enviar: "prontas em até 24 horas úteis,
aviso pelo WhatsApp, o progresso fica salvo".

## 4. Ajustes e a fila do dono

**Opções prontas** (aplicadas na hora sobre a direção escolhida, a prévia muda na frente da pessoa), pelo aplicador
que já existe (`aplicar` em `api/_vendas/alteracoes.mjs`), sem a tradução por IA:
- cores: `usar_paleta_de` (direção 1, 2 ou 3);
- fonte: `usar_tipografia_de`;
- seções: `mover_antes_de` / `mover_depois_de`, `remover_secao`, `adicionar_secao` (das outras direções);
- desfazer: volta à versão anterior.

Mudança que mexe no preço (páginas, extra novo) volta para o "Quer ajustar?" e recalcula pelo motor.

**Pedido livre:** o que as opções não cobrem entra na mesma fila das direções ("a Beyon Zero aplica em até 24 horas
úteis e te avisa pelo WhatsApp"). A pessoa pode seguir com as opções prontas ou ir para o escopo sem ele.

**A fila** (`scripts/direcoes.mjs` + skill `produzir-direcoes`) passa a listar também os pedidos de ajuste: gerar,
aplicar, marcar pronto e preparar a mensagem de aviso para o dono mandar. Continua valendo: troca de direção só até o
primeiro ajuste.

## 5. Por dentro

**Servidor (`api/vendas.mjs` → `api/_vendas/fluxo.mjs`):**
- `catalogo` (GET): extras da tabela ativa — chave, nome, frase, valor, `requer`, fora do automático. Nada interno
  (descontos autorizados, limites).
- `estimar` (POST): recebe as respostas e os extras marcados; o servidor aplica a recomendação, valida e calcula pelo
  motor; grava a estimativa (`vendas_registrar_estimativa`, como hoje). Valor vindo do navegador é ignorado.
- `detalhes` (POST): grava o briefing do formulário (limpeza de dado pessoal e limites de tamanho de hoje) e o
  contato; depois o fluxo segue para a fila de direções que já existe.
- Ajustes: opção pronta → mudanças estruturadas → `aplicar`; pedido livre → gravado "na fila", sem IA.
- Igual: sessão anônima com anti-robô, travas de etapa no banco, escopo, confirmação, pagamento.

**Banco:** migration pequena — o briefing gravado sem turno de conversa e o estado "na fila" do ajuste. O dono
aplica no banco real antes de promover.

**IA ligada/desligada:** configuração do servidor (com chave da Anthropic ou não). Sem chave: sem "Prefere
conversar?", pedido livre nunca chama IA, e as direções saem sempre pela fila manual (`BZ_DIRECOES=manual`), mesmo
que a configuração diga outra coisa.

**Testes:**
- recomendação e motor: cada caminho de respostas → pacote e preço certos;
- API com banco real (PGlite): preço recalculado no servidor; dependente sem o item recusado; etapas respeitadas;
- E2E no celular: perguntas → preço → ajustar → detalhes → direções (fila simulada) → ajuste pronto e pedido livre →
  escopo → pagamento simulado;
- acessibilidade e `npm run verificar`.

**Entrega em 3 PRs** (cada um com revisão técnica e de segurança, `docs/PROCESSO.md`):
1. perguntas, recomendação, preço e "Quer ajustar?";
2. detalhes, contato e fila;
3. ajustes com opções prontas e pedido livre.

## Fora deste desenho

- A pesquisa sobre vícios de linguagem de IA em português ("sob medida" é o exemplo do dono) e a revisão de todo o
  texto do site: pedida pelo dono para quando tudo estiver estruturado.
- Pagamento online em produção, mudança para a Cloudflare e os dados do vendedor: seguem nas pendências do dono.
