# CRO + SEO do nicho + resumo pra diretoria — design doc

Data: 2026-09-13
Status: aprovado

## Contexto

Usuário pediu transformar a landing page numa "máquina de conversão"
usando melhores práticas de mercado, sem quebrar o que funciona. Antes de
mexer, respondi uma pergunta dele: o público-alvo (diretores de
associação/sindicato/federação/cooperativa) não encontra esse site
organicamente — confirmado no código (sem `robots.txt`, sem
`sitemap.xml`, título/descrição genéricos, domínio `vercel.app` sem
autoridade). Os canais reais são outbound, indicação e LinkedIn (já
documentado no Canvas do app). SEO puro tem teto baixo aqui (TAM de
~5.800-17.300 organizações, nicho de baixo volume de busca).

Da conversa saíram 3 pilares aprovados, nessa ordem de prioridade:

**A. CRO na página atual** (ajuste, não reconstrução)
**B. SEO técnico pro nicho** (não substitui outbound, ajuda quem já ouviu
falar a confirmar/achar de novo — inclui busca de marca)
**C. Peça de convencimento interno** — achado direto do Canvas do app: a
decisão não é de uma pessoa só, é de diretoria eleita (mandato 2-3 anos).
Quem conversa no WhatsApp precisa "vender" internamente. Hoje o site não
ajuda nisso.

**Correção feita durante a pesquisa**: o plano original citava "reforçar
prova do case SBP" — checado o código-fonte do site e **não existe
nenhum número de prova (SBP) publicado no site hoje**. Os %/R$ que
apareceram numa conversa anterior são do planejamento interno do Canvas
(app), dado ainda não validado publicamente. Removido do escopo — nenhum
número novo entra no site ou no resumo sem já estar publicado.

Fora de escopo (usuário confirmou, fica pra depois): página dedicada
pra apresentar a proposta pra SBP especificamente.

## Pilar A — CRO

Aditivo, não estrutural — zero seção removida ou reordenada.

1. **Reassurance no envio do formulário de qualificação**: uma linha sob
   o botão "Continuar no WhatsApp", mesmo tom já usado no CTA final
   ("Quem responde é humano. Sem compromisso."). Reduz o atrito do
   último passo antes de enviar.
2. **Escassez honesta, sem número inventado**: o negócio é
   deliberadamente solo, sem equipe fixa (fato já público — "estúdio
   anônimo", ver seção 8 do HANDOFF). Uma frase qualitativa perto do CTA
   principal do hero reforça isso sem inventar "só N vagas": algo como
   "Atendo poucos diagnósticos por vez — sem equipe atravessando o meio
   do caminho." Texto final fechado na implementação, mesma voz do site.
3. **Nada mais muda** — FAQ, os 3 CTAs "Agendar diagnóstico", os 6 cards
   de serviço, o footer, o medidor: já cobrem os fundamentos de CRO
   (prova social honesta, objeção, urgência de conversa, múltiplos
   pontos de conversão). Retrabalhar isso sem motivo novo é risco sem
   ganho.

## Pilar B — SEO técnico pro nicho

1. **`<title>`**: de "inteligência artificial aplicada ao seu negócio"
   pra algo que nomeia o nicho real (associações, sindicatos,
   federações) mantendo "Beyon Zero" primeiro (protege busca de marca).
2. **`meta description`**: reescrita incluindo o nicho.
3. **`og:title`/`og:description`/`twitter:*`**: alinhados ao novo
   título/descrição, mesmo tom.
4. **JSON-LD `ProfessionalService`**: `description` atualizada,
   `knowsAbout` novo (array com os termos do nicho — propriedade válida
   de schema.org, ajuda o Google a associar a página a essas buscas).
   `areaServed` continua Brasil (já correto, sem mudança).
5. **`robots.txt`** (não existe hoje): permite tudo, aponta pro sitemap.
6. **`sitemap.xml`** (não existe hoje): lista `/` e `/resumo.html`.
7. **Domínio-pronto**: as URLs absolutas (`canonical`, `og:url`,
   `og:image`, `twitter:image`, JSON-LD `url`/`image`, sitemap) já
   ficam todas dentro do `<head>` ou em `sitemap.xml`/`robots.txt` — só
   documentar num lugar só (README de assets já tem parte disso) a
   lista completa de onde o domínio aparece, pra troca ser um
   find-and-replace de poucos minutos quando o domínio for registrado.
   Sem templating (projeto não tem build) — documentação é o que dá pra
   fazer aqui.

## Pilar C — `resumo.html` (novo arquivo, isolado)

Página nova, estática, **sem** o sistema de canvas/animação do site
principal (não precisa: é pra ser lida rápido e/ou impressa, não pra
demonstrar o produto). Carrega só HTML + um CSS próprio pequeno
(`resumo.css`) — não adiciona peso a quem visita a página principal.

Estrutura (reaproveita conteúdo já publicado no `index.html`, zero
invenção):
1. Cabeçalho: wordmark + "Resumo pra levar pra diretoria"
2. O problema — os 3 itens de `#dores`, condensados
3. O que a Beyon Zero faz — as 6 capacidades de `#servicos`, condensadas
   em lista (sem o link individual pro WhatsApp por item — aqui o
   objetivo é ler, não converter item a item)
4. Como funciona — os 3 passos de `#processo`, verbatim
5. Perguntas frequentes — as 5 do FAQ, condensadas
6. CTA final — mesmo número de WhatsApp, mesma mensagem genérica
   qualificada (reaproveita a lógica de `js/dom.js`, sem duplicar o
   telefone: import mínimo de `js/core.js` + `js/dom.js` só pra ganhar
   `B.linkWA`, sem carregar `field.js`/`entrada.js`/GSAP)
7. `@media print`: esconde nav/CTA, ajusta cor pra impressão legível
   (fundo claro, texto escuro — o tema escuro do site não imprime bem)

**Link de acesso**: uma linha discreta na seção CTA final do
`index.html` ("Prefere levar pra sua diretoria antes de decidir? Veja o
resumo.") apontando pra `/resumo.html`. Não é um CTA novo disputando
atenção com "Agendar diagnóstico" — é uma saída de baixo compromisso
pra quem não decide sozinho.

## Arquivos

- `index.html` — meta tags (B), reassurance + escassez (A), link pro
  resumo (C)
- `styles.css` — só os 2 trechos pequenos de A (reassurance,
  escassez), nada estrutural
- `robots.txt`, `sitemap.xml` — novos
- `resumo.html`, `resumo.css` — novos
- `docs/HANDOFF.md` — registra a rodada, lista os 7 lugares onde o
  domínio aparece hoje (domínio-pronto)

## Fora de escopo

- Comprar/registrar domínio — ação do usuário, fora do que o agente faz
- Página dedicada pra proposta da SBP — confirmado pra depois
- Qualquer número de prova/case não publicado hoje no site
- Analytics/tracking de conversão — gap já registrado no HANDOFF,
  não pedido nesta rodada
