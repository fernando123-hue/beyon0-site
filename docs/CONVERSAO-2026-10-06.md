# Conversão: do visitante ao cliente real (análise de 2026-10-06)

Pedido do dono: "veja métricas do mercado que façam sentido com a gente e veja se cada pequeno detalhe do site
pode nos gerar mais conversão de leads em clientes reais". Feita por quatro agentes em paralelo (contexto do
negócio em `01 Empresa` e `02 Serviços`; pesquisa de métricas com fontes; auditoria do Hub e de Sites;
auditoria de Automação, do formulário, do resumo e do pós-clique), sintetizada aqui e **contestada por um
crítico independente, cujas objeções mudaram a ordem do plano** (seção 9). Dado de mercado traz a fonte
(`docs/conversao/metricas.md`); estimativa diz que é estimativa; o que depende do dono aparece como
**[decisão do dono]**.

---

## 1. A conclusão que muda tudo: o gargalo hoje não é o site

- **O tráfego planejado é prospecção ativa**: 10 a 20 contatos por semana por rede, LinkedIn e indicação
  (`briefing-estrategico-validado.md` §10.3, confiança baixa). Pelos documentos, **nenhum contato foi feito
  ainda**: `Próximo passo.md` ainda manda "listar 10 a 15 organizações" e "marcar 5 a 8 conversas".
- Com prospecção, quem visita o site **já recebeu o link do dono**. O site não capta: ele **confirma** (quem é,
  dá para confiar, serve para a minha entidade) e **facilita o "sim" de quem decide em grupo** (o resumo para a
  diretoria).
- **Há prazo correndo.** A janela de venda para entidades vai de maio a dezembro e a assembleia de orçamento é
  até abril (`Cliente-alvo.md`). Hoje é 6 de outubro: sobram umas 10 semanas, com fim de ano no meio, para
  entrar no orçamento de 2027.
- **Mais conversão pode piorar o negócio** se a oferta não tiver limite: cada diagnóstico grátis leva de 20 a
  60 h (`Oferta — Diagnóstico.md`), e o tempo é o recurso mais escasso (`Finanças e tempo.md`). A pergunta do
  experimento não é "quantas conversas", é "quantos diagnósticos viram construção paga".

Por isso a ordem do plano é: **prospecção e oferta primeiro, depois o que remove veto e dá confiança, por último
o polimento do site.**

## 2. Métricas de mercado: o que serve e o que não serve aqui

| O quê | Número | Fonte | Serve? |
|---|---|---|---|
| Responder rápido: até 1 h vs. depois | ~7× mais conversas com quem decide | HBR, Oldroyd et al. 2011 (2.241 empresas, EUA) | **Em parte.** É sobre lead que chega pelo site; na prospecção é o dono quem inicia. Vale para quem chama pelo site. |
| Conversam com empresas pelo WhatsApp | 80% | Panorama Mobile Time/Opinion Box 2023 (Brasil) | **Sim.** O canal está certo. |
| Nota do atendimento por robô | 3,2 de 5 | mesmo Panorama | **Sim.** Nada de robô fingindo ser gente. |
| Negociação → venda, consultoria / agência no Brasil | 6,8% / 6,9% (média) | RD Station CRM 2025 | **Referência, não piso.** Uma pessoa sem caso publicado, prospectando, pode ficar abaixo. |
| Acessam a internet só pelo celular | 65% | Cetic.br TIC Domicílios 2025 | **Sim.** Celular primeiro, confirmado. |
| Texto mais simples converte mais | 12,9% vs. 6,6% (nível de leitura 5º–7º ano vs. 8º–9º, em inglês) | Unbounce 2024 (correlação) | **Direção, não número.** Jargão no topo custa leitura. |
| Atenção na 1ª tela | 57% do tempo | NN/g 2018 | **Sim.** |
| Reação negativa a excesso visual cresce mais rápido que a conversão | ponto ótimo por site | Jankowski et al. 2019 | **Sim**, para o ouro. |
| Visita → contato em landing pages | 6% a 10% | Unbounce 2024; RD Station 2025 | **Não serve de meta.** São páginas de anúncio frio ou de troca de material; aqui a conversão real é "respondeu / aceitou reunião". |

**Números para nunca usar** (fontes fracas): "98% de abertura no WhatsApp", "CTA único converte 266% mais",
"formulário em etapas +300%", "WhatsApp 17% vs. formulário 8%".

**Quanto vale um contato** (cálculo com os cenários do próprio negócio, `Finanças e tempo.md`, confiança baixa):
receita do ano ÷ contatos do ano dá algo entre **R$ 50 e R$ 500 por contato prospectado**, antes de descontar as
20–60 h de cada diagnóstico grátis. Ou seja: o dinheiro está em **escolher bem quem recebe o diagnóstico**, não
em multiplicar conversas.

**Com o volume de visitas esperado (dezenas por mês), nenhum teste A/B chega a resultado.** A medição que vale é
a **planilha do funil**: contatos → respostas → reuniões → diagnósticos → construções pagas.

## 3. Onde o funil vaza hoje (achados dos auditores)

**Antes do clique (site)**
1. Automação **ameaça o próprio público**: "trabalho que não exige gente… vira folha de pagamento", "mais
   funcionário do que chatbot" e o H1 "perde dinheiro num ponto que ninguém está **auditando**". Para um
   sindicato (que existe para defender emprego) e para a secretária que recebe o link, é veto silencioso. Não
   há resposta para "a IA vai substituir funcionários?".
2. Endereço `beyon0-site.vercel.app`: "beyon0" contra a regra da marca, num subdomínio grátis, e sai impresso no
   resumo da diretoria.
3. Duas respostas da FAQ de Sites podem virar reclamação: "consigo mudar um texto sozinho? Sim, de forma
   intuitiva" (sem painel de edição não é verdade) e "existem opções gratuitas, como a Vercel" (o plano grátis da
   Vercel é para uso pessoal; conferir os termos).
4. O resumo para a diretoria não tem o que a diretoria precisa: o que o diagnóstico entrega, como se contrata,
   custos recorrentes por tipo, LGPD, pós-entrega.
5. Objeções de entidade sem resposta: aprovação em diretoria, LGPD dos associados, custo recorrente de IA,
   "e depois da entrega?" (a resposta atual, "manutenção contínua não faz parte", perde venda em entidade sem TI).
6. Jargão no topo: "Sistema online", "1ª pintura em X s", "100 fps".
7. Rodapé sem contato (nem número visível, nem e-mail).
8. Oferta grátis com três nomes ("diagnóstico grátis", "primeira conversa grátis") e nenhum escopo.

**O clique**
9. O botão não diz que abre o WhatsApp.
10. O modal fecha sem saber se o WhatsApp abriu: em navegador de Instagram/LinkedIn ou no computador sem
    WhatsApp Web, o lead some sem plano B.
11. Bugs da mensagem do formulário — **corrigidos nesta sessão** (seção 8).

**Depois do clique**
12. Nenhum prazo de resposta declarado, nenhum roteiro, nenhum registro do funil.

## 4. Plano, na ordem certa

### Etapa 0 — o que gera cliente (fora do site, decisão e ação suas)
| # | Ação | Por quê |
|---|---|---|
| 0.1 | **Lista de 15 entidades + 5 a 8 conversas marcadas até o início de dezembro**, mirando o orçamento de 2027; planilha do funil desde a 1ª | Sem conversas, nenhuma melhoria do site muda o resultado. |
| 0.2 | **O que o emprego atual permite**: conferir o contrato de trabalho (exclusividade, conflito de interesse) e o que do SBP pode ser mostrado | Destrava o case (a maior prova disponível) e decide nome e rosto. O alvo nº 1 é o mesmo nicho do empregador. |
| 0.3 | **Limite do grátis**: o que é grátis (a conversa?), o que tem escopo fechado, e um filtro mínimo antes de abrir um diagnóstico (porte, quem decide, se há orçamento no ciclo) | Cada diagnóstico custa 20–60 h. Mais conversão sem filtro consome o tempo que falta. |
| 0.4 | **Um prazo de resposta que você cumpre 100% das vezes** (compatível com o emprego), WhatsApp Business configurado e o roteiro de `docs/conversao/roteiro-whatsapp.md` | Prometer e não cumprir quebra a confiança na 1ª interação. |

### Etapa 1 — remover veto e dar confiança (posso fazer já; texto e código)
| # | Mudança | Esforço |
|---|---|---|
| 1.1 | **Automação sem "substituir gente"**: dor 01 e cartão 1 reescritos ("a equipe presa no repetitivo, enquanto o associado espera"), nova pergunta na FAQ "A IA vai substituir funcionários?", espelhada no JSON-LD e no resumo | baixo |
| 1.2 | **Corrigir as respostas de edição e hospedagem** na FAQ de Sites para o que é verdade | baixo |
| 1.3 | **Botão que diz o canal**: "Diagnóstico grátis no WhatsApp" / "Conversar no WhatsApp", com o ícone | baixo |
| 1.4 | **Plano B no modal**: "Abrimos o WhatsApp. Não abriu? [abrir de novo] · [copiar mensagem] · número", sem fechar sozinho | médio |
| 1.5 | **Rodapé com contato**: "(21) 97716-7944 · WhatsApp" (já público no JSON-LD), "Rio de Janeiro · atendo todo o Brasil" | baixo |
| 1.6 | **Etiqueta de Automação** "Para associações, sindicatos, federações e cooperativas"; rótulo da cota do hero que o leigo entenda (mantendo o traço) | baixo |
| 1.7 | **Mensagem pronta neutra com lacuna** ("Minha entidade: ___" / "Meu negócio: ___") e a do formulário em linhas (Organização / Quem sou / Desafio) | baixo |
| 1.8 | **Botão "Encaminhar o resumo para a diretoria"** (WhatsApp sem número, com o link do resumo) | baixo |

### Etapa 2 — depende de decisão sua
| # | Decisão | Observação |
|---|---|---|
| 2.1 | **Domínio próprio** e e-mail no domínio | Barato; o endereço sai no resumo impresso. |
| 2.2 | **Resumo da diretoria completo**: o que o diagnóstico entrega (depois de 0.3), como se contrata, custos recorrentes por tipo, LGPD, pós-entrega (garantia de correção por __ dias, treinamento, suporte opcional), nota fiscal/CNPJ | A peça que destrava decisão colegiada; dá para mandar como PDF. |
| 2.3 | **"Quem faz"** — só depois de 0.2. Se o emprego permitir, primeiro no resumo (vai em mãos) e só depois no site público | Na prospecção, quem visita já sabe quem mandou o link. |
| 2.4 | **Preço** — depois das 2 ou 3 primeiras propostas reais, como **faixa por formato** ("projetos típicos entre X e Y"), no resumo e na conversa; não "a partir de" | Em entidade que decide por assembleia, um "a partir de" baixo vira o valor da pauta. |
| 2.5 | **Serviços antes do reator no celular (Hub)** | Mexe num layout que você aprovou; mostro opções lado a lado. |
| 2.6 | **Um projeto-piloto em troca de depoimento verificável** | A prova social que falta, sem inventar. |

### Depois de ~20 conversas registradas
Rever com a planilha: o que as pessoas perguntaram, onde pararam. Só então: analytics (Vercel, sem cookie),
mensagens por botão, barra fixa, formulário com botões de toque, título alternativo.

## 5. Fora do site: o roteiro do WhatsApp
Resumo (completo em `docs/conversao/roteiro-whatsapp.md`): WhatsApp Business com foto e horário; mensagem de
ausência honesta nos horários em que você não pode responder; 1ª resposta citando o que a pessoa escreveu, com
3 perguntas curtas e **dois horários fechados**; follow-up D+1 / D+3 (com o resumo da diretoria) / D+7; na
reunião, perguntar quando a diretoria se reúne, quem mais aprova e até que valor o presidente aprova sozinho;
se travar por orçamento, uma primeira etapa menor em vez de desconto.

## 6. Metas
As que importam, medidas na planilha: **contatos → respostas → reuniões → diagnósticos → construções pagas**, e
o motivo de cada perda. A taxa visita → contato do site não é meta neste momento (seção 2).

## 7. O ouro: quanto tempo e quando
Você pediu essa análise junto. O que dá para afirmar com honestidade:
- **Não há nenhuma evidência** de que uma recompensa visual aumente conversão em site de serviço (a pesquisa não
  achou estudo a favor nem contra). A evidência que existe é de **risco**: excesso de intensidade visual gera
  reação negativa mais rápido do que ganho (Jankowski et al. 2019), e o evento muda a cor do botão de ação.
- Os dados de tempo na página (NN/g, Microsoft) dizem quando as pessoas **saem**, não quando recompensar. Eles
  só mostram que não há motivo para esperar 60 s: a curva de saída achata por volta de 30 s, e no celular a
  sessão é bem mais curta.

**Recomendação:** se o automático continuar, **30 s** (alcança mais gente, a surpresa é a mesma), com três guardas:
1. não começa com o formulário aberto, com a FAQ aberta, com a seção de conversa na tela ou com o foco num botão;
2. **não muda a cor nem o estado dos botões de ação** (o ouro fica na estrutura, no reator, nos textos e nas bordas);
3. em **Automação**, só por gesto (segurar o núcleo): o público é diretoria de entidade e o evento pode parecer defeito.

O crítico foi além: ouro **só por gesto** em todas as páginas. É a opção mais segura para conversão; a atual é a
mais marcante. **[decisão do dono]**

## 8. Já corrigido nesta análise (bugs, sem decisão)
- `js/lead-form.js`: a mensagem não sai mais com ponto duplo ("..", "?."); o tipo "Outro" vai como a pessoa
  escreveu ("Tipo de organização: OAB", não "um oab"); "Outro" vazio não passa mais. Testado com 4 casos.
- `resumo.html`: ganhou prévia de link (og/twitter), para chegar com cartão quando encaminhado à diretoria.

## 9. O que o crítico mudou nesta versão
- Criou a **Etapa 0** (prospecção, emprego, limite do grátis, prazo de resposta cumprível) antes de qualquer
  mudança no site.
- **Rosto e nome** passaram a depender do contrato de trabalho (o empregador é do mesmo nicho do alvo).
- **Prazo de resposta**: de "< 1 h" para "um prazo que você cumpre sempre".
- **"Diagnóstico seu mesmo sem contratar"** saiu: entregaria o mapa da solução a quem não compra.
- **Preço** foi para depois das primeiras propostas, como faixa, não "a partir de".
- **Metas de visita → contato** e o **cálculo de valor do lead** com números de fora saíram; ficou a conta com os
  cenários do próprio negócio.
- **Testes A/B** saíram: com dezenas de visitas por mês, não chegam a resultado.
- **Google Meu Negócio** saiu: diretoria de entidade não escolhe fornecedor por avaliação no Maps.
- **Serviços antes do reator no celular** virou decisão sua (o layout do celular foi aprovado).

Fontes completas: `docs/conversao/metricas.md`.
