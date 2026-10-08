# Google Ads e busca orgânica — o ambiente preparado (2026-10-06)

Pedido do dono: "a ideia é tentar fazer com que as pessoas achem o site sozinhas; devo explorar o Google Ads
novamente; prepare o ambiente para isso". Pesquisa feita por dois agentes (plano de campanha com fontes; auditoria
de SEO). O que já está pronto no código, o que só você decide e a campanha inteira, pronta para colar.

---

## 0. Antes de gastar R$ 1 — três bloqueios (decisões suas)

| # | Bloqueio | Por quê | Saída |
|---|---|---|---|
| 1 | **O plano grátis da Vercel (Hobby) proíbe uso comercial.** "Hobby teams are restricted to non-commercial personal use only" — e a lista de exemplos inclui anunciar serviço e receber para criar ou hospedar site ([Vercel, Fair Use > Commercial usage](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage), atualizada em 14/09/2026). | O site da Beyon Zero vende serviço; com anúncio, mais ainda. Se a Vercel pausar o site no meio da campanha, o Google reprova os anúncios ("destino não funciona"). Vale também para sites de clientes. | **Vercel Pro** (US$ 20/mês por desenvolvedor; dá domínio grátis no 1º ano) ou outra hospedagem com uso comercial (conferir os termos). |
| 2 | **Domínio próprio** (.com.br) | O endereço aparece no anúncio; "beyon0-site.vercel.app" passa pouca confiança; trocar depois obriga a mudar todos os links e reenviar os anúncios para revisão. | Registrar antes de lançar. O redirecionamento do vercel.app está pronto para colar (seção 4). |
| 3 | **Perfil de pagamento: Pessoa Física (CPF) ou Organização (CNPJ)** | **Não muda depois de criado** ([Google Payments 9001878](https://support.google.com/paymentscenter/answer/9001878)). Como Pessoa Física, **o seu nome pessoal aparece publicamente** na divulgação do anúncio e na Central de Transparência ([9703665](https://support.google.com/adspolicy/answer/9703665)). | Se o CNPJ sai em poucas semanas, esperar. Ver também o ponto do emprego atual em `docs/CONVERSAO-2026-10-06.md` (seção 4, Etapa 0.2). |

E uma checagem honesta: o Google exige que o anunciante **não esconda quem é** (política de declarações falsas,
[6020955](https://support.google.com/adspolicy/answer/6020955)). Hoje o site não tem nome de pessoa nem CNPJ.
Com a verificação de anunciante, o Google mostra o nome verificado de qualquer forma.

## 1. O que já está pronto no site (nesta sessão)

- **Medição pronta para ligar** (`js/medicao.js`): Google Analytics 4 e Google Ads. **Enquanto os IDs estiverem
  vazios, nada carrega.** A conversão é o **clique que abre o WhatsApp** (qualquer botão) e o envio do formulário de
  Automação; cada uma leva de qual botão veio (`origem_botao`: barra, hero, conversa, menu, ícone, rodapé…) e se a
  visita veio de anúncio.
- **Aviso de cookies (LGPD), modo básico**: o Google só carrega depois do "Aceitar"; Aceitar e Recusar com o mesmo
  peso; o link "Cookies" no rodapé reabre a escolha. Por que básico e não "avançado": o avançado manda sinais sem
  cookie para o Google estimar conversões, mas isso só funciona a partir de ~700 cliques em anúncio em 7 dias
  ([10548233](https://support.google.com/google-ads/answer/10548233)). Numa conta pequena não ajuda, e o básico é o
  mais limpo para a LGPD. Quem recusar não aparece no relatório: conte com isso.
- **Política de privacidade** (`/privacidade`): cita GA4 e Google Ads, WhatsApp/Meta, retenção, direitos (art. 18 da
  LGPD), contato. **Revise com o advogado antes de publicar** (é a recomendação do `Jurídico, dados e propriedade.md`).
- **Política de segurança (CSP)** já libera só os domínios do Google necessários (`vercel.json` e o `<meta>` de cada
  página); continua sem script inline.
- **Visita de anúncio** (`?gclid=` ou `utm_medium=cpc`): o site marca a visita inteira como "de anúncio" e a mensagem
  pronta do WhatsApp começa com **"Oi! Vi o anúncio da Beyon Zero e…"** — a origem aparece na própria conversa, sem
  planilha complicada. Para quem veio de anúncio: o menu não mostra a saída para Automação, e o ouro não começa
  sozinho (clique pago: nada disputando a decisão).
- **Página de destino /sites mais pronta para anúncio**: botões "Pedir orçamento no WhatsApp", mensagem com a lacuna
  "Meu negócio: ", contato visível no rodapé, FAQ honesta sobre edição e hospedagem, "criação de sites" no título,
  na descrição, no subtítulo e no H2.
- **SEO**: títulos e descrições com o que as pessoas digitam; dados estruturados com a entidade única (`@id`) e
  `WebSite`; `/resumo` fora da busca (noindex); `sitemap.xml` com data real e a página de privacidade.

## 2. Para ligar a medição (10 minutos, depois dos bloqueios)

1. Crie a propriedade no **Google Analytics 4** e copie o ID da métrica (`G-XXXXXXXXXX`).
2. No **Google Ads** (modo especialista; BRL; fuso de Brasília — moeda e fuso não mudam depois): Metas › Conversões ›
   Nova › Site › configurar manualmente › **clique**. Nome: "Contato WhatsApp". Categoria: Contato. **Contagem: Uma.**
   Janela: 30 dias. Ação **principal**. Copie o ID (`AW-XXXXXXXXX`) e o **rótulo** (o texto depois da barra em
   `AW-XXXXXXXXX/abcDEF123`).
3. Em `js/medicao.js`, preencha `ga4`, `ads` e `adsRotuloContato`. Publique.
4. Teste com o **Tag Assistant** (tagassistant.google.com): abrir a página, aceitar os cookies, clicar num botão de
   WhatsApp — a conversão "Contato WhatsApp" tem de aparecer.
5. No GA4, em Administrador › Definições personalizadas, crie três dimensões de evento: `origem_botao`, `pagina` e
   `via` (sem isso os relatórios não mostram de qual botão veio o clique). Marque o evento `contato_whatsapp` como evento-chave. Se importar para o Google Ads, deixe como
   **secundária** (a principal é a tag do Ads; senão conta duas vezes).
   O caminho principal do site é o orçamento: o clique em "Monte seu orçamento" chega como o evento
   `orcamento_iniciar` (com `origem_botao`). Marque-o também como evento-chave no GA4, mas **não** como conversão do
   Ads: começar o orçamento ainda não é contato. Dentro de `/orcamento` o Google não carrega (há pagamento na página);
   os cliques no WhatsApp de lá contam só nas métricas próprias (`js/metricas.js`).
6. Lembre: **clique no WhatsApp não é conversa**. Parte das pessoas abre e não envia. Conte as conversas reais na
   planilha (mensagens que começam com "Vi o anúncio").
7. **Mais preciso que a planilha:** as métricas próprias do site (docs/metricas/README.md) ligam cada conversa ao
   anúncio pelo código na mensagem e devolvem os clientes fechados ao Google Ads como conversão off-line.

## 3. A campanha, pronta para montar

**Uma campanha só**: "BZ | Pesquisa | Sites | BR".

| Configuração | Valor |
|---|---|
| Tipo | Rede de Pesquisa. **Desmarcar** Parceiros de pesquisa e Rede de Display. |
| AI Max / correspondência ampla automática / expansão de URL / recomendações automáticas | **Desligados** na largada. |
| Local | **Brasil, opção "Presença"** (não "presença ou interesse"). Com menos de R$ 20/dia, só RJ. Depois de 14 dias, corte estados que não convertem. |
| Horário | Só quando você responde rápido. Sugestão: seg–sex 8h–20h, sáb 9h–13h — ajuste à sua rotina real. |
| Lance, fase 1 (≈30 dias) | **Maximizar cliques com CPC máximo** = faixa alta do "lance para topo da página" do Planejador de palavras-chave (rode as palavras abaixo nele antes). |
| Lance, fase 2 | **Maximizar conversões** quando tiver ≥ 15 conversões em 30 dias com o rastreamento confiável. |
| Lance, fase 3 | **CPA desejado** com ~30 conversões em 30 dias e custo estável; comece 10–20% acima do CPA real; não troque de estratégia mais de uma vez a cada 2 semanas. |
| Correspondência | **Frase e exata.** Nada de ampla na largada. |
| URL final | `https://SEUDOMINIO.com.br/sites` · auto-tagging ligado · sufixo opcional `utm_source=google&utm_medium=cpc&utm_campaign=sites` · caminhos exibidos: A `criacao-de-site`, B `landing-page`, C `orcamento`. |

**Orçamento** (cenários, não previsão — não há CPC público confiável para "criação de site" no Brasil; o número
real está no Planejador dentro da sua conta):

| Meta/mês | Cliques (conversão 10%–5%) | CPC R$ 3 | CPC R$ 5 | CPC R$ 8 |
|---|---|---|---|---|
| 15 cliques no WhatsApp | 150–300 | R$ 450–900 | R$ 750–1.500 | R$ 1.200–2.400 |
| 30 cliques no WhatsApp | 300–600 | R$ 900–1.800 | R$ 1.500–3.000 | R$ 2.400–4.800 |

Recomendação: **R$ 30 a R$ 50 por dia por pelo menos 30 dias**. Com R$ 20/dia dá para testar, mas o lance automático
demora a aprender. Teto saudável por conversa: (ticket × taxa de fechamento) × a fatia que você aceita gastar em
anúncio. Exemplo hipotético: ticket R$ 2.000, fecha 1 em 10 → cada conversa vale R$ 200 → com 30%, teto de R$ 60 por
conversa.

### Grupos e palavras-chave (frase; * também exata)
- **A. Criação de site**: criação de site* · criação de sites* · criação de site profissional* · criação de site para
  empresa* · site para empresa · site profissional para empresa · site institucional · criação de site institucional*
  · fazer site para empresa · empresa de criação de sites* · agência de criação de sites · desenvolvimento de sites ·
  site para pequena empresa · site sob medida · criação de site rio de janeiro
- **B. Landing page**: criação de landing page* · landing page profissional* · contratar landing page · fazer landing
  page · landing page para anúncios · landing page para google ads · criação de página de vendas · página de vendas
  profissional · criação de página de captura
- **C. Preço/orçamento**: quanto custa um site* · quanto custa fazer um site · quanto custa site para empresa · preço
  de site · valor de um site · orçamento de site* · orçamento criação de site · quanto custa uma landing page · preço de
  landing page
- **Fase 2 (testar depois)**: "site profissional", "criar site para empresa", "fazer site" — ambíguas, muita gente
  querendo fazer sozinha.
- **Negativas entre grupos**: no A, "landing page", "página de vendas", "quanto custa", "preço", "valor",
  "orçamento"; no B, "quanto custa", "preço", "valor", "orçamento".

### Negativas da campanha (cadastre singular e plural: negativa não pega variação)
grátis · gratis · gratuito · gratuita · free · de graça · curso · cursos · aula · aulas · tutorial · como fazer ·
como criar · passo a passo · aprender · sozinho · apostila · pdf · youtube · faculdade · certificado · ead · wix ·
hostinger · godaddy · canva · google sites · blogger · webnode · site123 · gerador de site · criador de site ·
construtor de site · plataforma para criar · app para criar · pelo celular · chatgpt · inteligência artificial ·
emprego · empregos · vaga · vagas · salário · salario · estágio · estagio · trabalhar como · como ser · currículo ·
fiverr · workana · 99freelas · olx · mercado livre · freelancer · template · templates · modelo · modelos · tema ·
temas · exemplo · exemplos · html · css · javascript · php · código · codigo · programação · login · entrar · meu site
· site oficial · baixar · download · apostas. **Só se você não oferecer**: hospedagem · registro de domínio · loja
virtual · e-commerce · ecommerce · aplicativo · logotipo · logo. ("WordPress" sozinho não entra: cliente pode querer.)

### Anúncios responsivos (títulos ≤ 30, descrições ≤ 90 — contados)
**Grupo A** — títulos: Criação de Site Profissional (28) · Site Para a Sua Empresa (23) · Preço Fechado Antes de
Começar (30) · Fale Direto Com Quem Constrói (29) · Site Rápido no Celular (22) · Domínio e Site no Seu Nome (26) ·
Primeira Conversa Grátis (24) · Orçamento Pelo WhatsApp (23) · Site Institucional Sob Medida (29) · Projeto Feito
Para Seu Negócio (30) · Do Rio Para Todo o Brasil (25) · Sem Intermediário no Projeto (28) · Criação de Sites Para
Empresas (30) · Converse Comigo no WhatsApp (27) · Site Que Abre Rápido (20).
Descrições: "Você fala direto com quem constrói o seu site. Preço fechado antes de começar o projeto." (88) · "Site
rápido no celular, com domínio e acessos no seu nome. Nada fica preso comigo." (82) · "Primeira conversa grátis pelo
WhatsApp: conte sua ideia e receba um orçamento fechado." (86) · "Site institucional, landing page ou sob medida.
Atendimento online para todo o Brasil." (86)

**Grupo B** — títulos: Criação de Landing Page (23) · Landing Page Profissional (25) · Landing Page Para Anúncios
(26) · Página de Vendas Sob Medida (27) · Preço Fechado Antes de Começar (30) · Fale Direto Com Quem Constrói (29) ·
Página Rápida no Celular (24) · Domínio e Acessos no Seu Nome (29) · Primeira Conversa Grátis (24) · Orçamento Pelo
WhatsApp (23) · Do Rio Para Todo o Brasil (25) · Botão Direto Para o WhatsApp (28) · Landing Page Sob Medida (23) ·
Uma Página, Um Objetivo (23) · Pronta Para Receber Anúncios (28).
Descrições: "Landing page rápida no celular, pensada para receber o tráfego dos seus anúncios." (81) · "Você fala
direto com quem constrói. Preço fechado antes de começar, sem surpresa depois." (88) · "Domínio e acessos ficam no
seu nome. Primeira conversa grátis pelo WhatsApp." (76) · "Página de vendas ou de captura sob medida, com botão para
o WhatsApp. Atendo todo o país." (89)

**Grupo C** — títulos: Quanto Custa um Site? (21) · Orçamento de Site no WhatsApp (29) · Preço Fechado Antes de
Começar (30) · Você Sabe o Preço Antes (23) · Peça Seu Orçamento (18) · Sem Surpresa no Preço Final (27) · Primeira
Conversa Grátis (24) · Fale Direto Com Quem Constrói (29) · Site Rápido no Celular (22) · Domínio e Site no Seu Nome
(26) · Preço de Site Para Empresa (26) · Orçamento de Landing Page (25) · Do Rio Para Todo o Brasil (25) · Site Com
Preço Fechado (22) · Orçamento Sem Compromisso (25).
Descrições: "Conte o que precisa e receba um preço fechado antes de começar. Sem cobrança surpresa." (86) · "O valor
depende do tamanho do site. Na primeira conversa, grátis, explico o que entra." (86) · "Você fala direto com quem
constrói, sem intermediário. Site rápido no celular." (78) · "Domínio e acessos ficam no seu nome. Peça seu
orçamento pelo WhatsApp, sem compromisso." (87)

Cuidados: "Do Rio Para Todo o Brasil" só com segmentação Brasil; "Sem Surpresa no Preço Final" e "Sem cobrança
surpresa" só se o contrato garantir. Não fixe títulos na largada.

**Recursos**: sitelinks (texto ≤ 25, descrições ≤ 35) — Como Funciona: "Da conversa ao site no ar" / "Etapas explicadas
sem enrolação" · Landing Page: "Uma página, um objetivo" / "Feita para receber anúncios" · Site Institucional: "Sua
empresa bem apresentada" / "Rápido e leve no celular" · Peça um Orçamento: "Primeira conversa grátis" / "Preço fechado
antes de começar" (sitelink tem de ir para o **mesmo domínio**, não para wa.me). Frases de destaque: Preço Fechado
Antes · Fale Com Quem Constrói · Site Rápido no Celular · Tudo no Seu Nome · Primeira Conversa Grátis · Atendimento
Online. Snippet "Serviços": Site Institucional · Landing Page · Site Sob Medida · Página de Vendas · Página de Captura.
**Fase 2**: recurso de mensagem (botão de WhatsApp no próprio anúncio), quando a conta estiver verificada.

## 4. Quando houver domínio próprio
1. Trocar `https://beyon0-site.vercel.app` em: `index.html`, `sites.html`, `automacao.html`, `resumo.html`,
   `privacidade.html` (canonical, og, JSON-LD com `@id`), `robots.txt`, `sitemap.xml`.
2. Redirecionar o endereço antigo, em `vercel.json` (a Vercel responde 308, tratado como permanente pelo Google):
   ```json
   "redirects": [
     { "source": "/(.*)", "has": [{ "type": "host", "value": "beyon0-site.vercel.app" }], "destination": "https://SEUDOMINIO.com.br/$1", "permanent": true }
   ]
   ```
3. **Search Console**: propriedade de **domínio**, verificada por TXT no DNS; enviar `/sitemap.xml`; inspecionar as 3
   páginas e "Solicitar indexação"; conferir que `/resumo` aparece como "Excluída pela tag noindex". Bing Webmaster
   Tools importando do Search Console.
4. E-mail no domínio (contato@…): no rodapé, na privacidade e no JSON-LD (`email`).

## 5. Checklist de lançamento, em ordem
1. Domínio + hospedagem com uso comercial (bloqueios 1 e 2). Revisar `/privacidade` com o advogado.
2. Conta Google Ads (especialista, BRL, Brasília); pular a "campanha inteligente".
3. Faturamento CPF ou CNPJ (bloqueio 3). Pré-pago (Pix/boleto) ajuda a controlar.
4. Verificação do anunciante já no início (até 5 dias úteis).
5. Conversão "Contato WhatsApp" + GA4 (seção 2), testadas com o Tag Assistant e um clique real.
6. Planejador de palavras-chave: anotar o lance de topo de página de cada grupo.
7. Campanha, grupos, negativas, anúncios e recursos (seção 3). Esperar aprovação.
8. **Dias 1–3**: anúncios aprovados? conversão registrando? termos de pesquisa todo dia.
9. **Dia 7**: negativar termos ruins; CTR por grupo (referência de serviços nos EUA ≈ 6%); CPC real × teto; parcela
   de impressões perdida por orçamento e por classificação.
10. **Dia 14**: dispositivo, horário, estado; desempenho de cada título; pausar palavras que gastaram 2–3× o teto por
    conversa sem converter.
11. **Dia 30**: custo por clique no WhatsApp, por conversa real, por orçamento e por cliente (planilha). ≥ 15
    conversões: Maximizar conversões.

## 6. Busca orgânica (sem pagar) — o que falta
- **Expectativa honesta**: "criação de site rio de janeiro" é disputadíssimo (agências, Wix, Hostinger). Domínio novo
  não chega ao topo rápido. Mais realista: termos específicos ("landing page para…", "site para…") e a busca pelo nome.
- **Páginas por formato** (`/sites/landing-page`, `/sites/institucional`): servem à busca orgânica e como destino de
  anúncio com a mesma mensagem (grupos A e B). A de landing page rende mais. Médio prazo.
- **FAQ de Sites**: preço (ao menos "o que muda o preço"), prazo típico, o que está incluso, "e depois que o site está
  no ar?" — só com as suas respostas reais.
- **Perfil da Empresa no Google**: exige **atendimento presencial** (visitar ou receber clientes). Negócio 100% remoto
  não se qualifica, e o site diz que tudo é online. Se você atende alguém pessoalmente no Rio, cadastre como "área de
  atendimento" (endereço oculto), nome exatamente "Beyon Zero", categoria "Web designer". Se não, LinkedIn, Instagram
  e GitHub com nome, cidade e telefone iguais ao site.
- **Página 404** própria com links para `/` e `/sites` (baixa prioridade).

Fontes: relatório do agente de Ads (LocaliQ/WordStream 2026; Google Ads Help 2375423, 3123169, 3438531, 6268632,
6331304, 10000067, 10548233, 14886971, 15713840; Google Ads Policy 6020955, 6368661, 16427718, 143465, 9703665,
9872280; Vercel Fair Use Guidelines; ANPD, guia de cookies 2022) e da auditoria de SEO.
