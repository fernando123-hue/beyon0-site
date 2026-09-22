# Reestruturação Beyon Zero — Hub + páginas por serviço

**Aberto em:** 2026-09-22 · **Branch:** `claude/site-restructure-planning-1cd10h`
**Status:** planejamento em andamento — nenhuma página nova construída ainda.

Este documento é a fonte de verdade desta fase, no mesmo espírito do
`docs/HANDOFF.md` (que segue sendo a fonte de verdade do site publicado como
ele é hoje). Existe para nenhuma decisão, imagem ou combinado com o dono se
perder entre sessões.

---

## 1. Por que isto existe

O site publicado hoje (`index.html`) é uma landing page única, inteira
dedicada a **um** serviço: IA/automação aplicada a associações, sindicatos,
federações e cooperativas (diagnóstico pago, modelo fee-only — ver HANDOFF
seções 1, 12 em diante). A Beyon Zero expandiu os serviços que oferece. O
dono não quer:

- prender o site inteiro a um só serviço;
- fazer uma landing page gigante que tenta caber tudo;
- descrever os serviços de forma genérica dentro dela.

Ele mandou 15 imagens de exploração visual (moodboard/mockups, salvas em
`docs/restructure/moodboard/`) pensando numa página nova de "Sites" e pediu
para planejarmos juntos a estrutura antes de construir qualquer coisa.

---

## 2. Decisões já confirmadas pelo dono

### 2.1 Arquitetura: Hub + páginas independentes por serviço

Não é uma one-page com âncoras. É um **Hub central** que interliga tudo, e
cada serviço vira uma **página própria, completa e independente** (seu
próprio hero, CTA, FAQ se fizer sentido, etc.), como se cada uma pudesse
viver sozinha se alguém chegasse direto nela por um anúncio ou busca.

Mapa de arquivos proposto (a decidir a URL exata na hora da migração —
pode ser pasta com `index.html` ou `.html` direto na raiz, o stack não tem
build/roteador):

| Página | Papel | Origem do conteúdo |
|---|---|---|
| `index.html` (Hub) | Headline institucional curta da Beyon Zero + 3 blocos que levam a cada serviço + rodapé/contato compartilhado | **Novo**, ainda não escrito |
| `automacao-ia/` (ou `automacao.html`) | Serviço de IA/automação para negócios | **Já existe** — é o `index.html` atual quase integralmente (hero, dores, capacidades, processo, FAQ, JSON-LD). Só ajusta nav/rodapé para apontar de volta ao Hub e às outras páginas |
| `sites/` | Serviço de sites institucionais / landing pages | **Novo** — depende da triagem de imagens (seção 4) e de copy real |
| `experiencias-digitais/` | Serviço de experiências digitais/interativas | **Novo** — depende de escopo do serviço (seção 3) e copy real |

Nav e rodapé compartilhados entre as 4 páginas, com link de volta ao Hub em
todas. Nenhum arquivo de produto foi movido ainda nesta rodada — ver seção 6.

### 2.2 Serviços

Confirmados pelo dono:

1. **Sites institucionais / landing pages** — o que o `index.html` original
   do projeto (histórico, `docs/design-direction.md`) e o moodboard endereçam.
2. **Automação / IA para negócios** — já construído, é o conteúdo atual do
   site (nicho de entidades de classe).
3. **Experiências digitais** — mencionado pelo dono e pelas imagens ("BEYOND
   / EXPERIÊNCIAS DIGITAIS" na imagem 07), mas **escopo ainda não definido**.

**Em aberto, perguntar antes de criar mais páginas de serviço:** o dono disse
"acho que faz sentido adicionar [experiências digitais] com serviços que
façam sentido" — ele deixou espaço para um 4º/5º serviço alinhado ao objetivo
da empresa. Este documento **não inventa** um serviço novo além dos 3 acima.
Se o dono quiser mais um, ele entra aqui como uma linha nova antes de eu
escrever qualquer copy para ele.

### 2.3 Identidade visual

Decisão em duas camadas, na ordem em que o dono foi refinando:

- **Fica:** a essência comportamental do **AI Core e dos Pulsos** — o
  "organismo" documentado no HANDOFF §6/§11.3 (eventos raros que varrem o
  site: Pulso a cada 9–20s, Estado Singular como o "espetáculo" em 4 fases).
  Isso não é reescrito do zero.
- **Abre:** tudo o mais que hoje compõe a "identidade sagrada" do HANDOFF §5
  (rampa ciano fixa como único matiz, ausência de vidro/pedestal/portal como
  motivo, etc.) fica liberado para uma **pele visual nova e premium**,
  inspirada nas imagens do moodboard:
  - vidro escuro/teal translúcido, em camadas, com profundidade real;
  - painéis/telas flutuantes compondo a atmosfera (não só um canvas de
    partículas);
  - portal/arco de pedra como motivo de transição entre seções ou páginas;
  - pedestal de pedra como dispositivo de apresentação de hero.

Isso **reverte parcialmente** a seção 5 do `docs/HANDOFF.md` — não é
regressão a corrigir, é decisão explícita do dono, documentada como tal (nota
adicionada ao HANDOFF, seção 8 deste documento).

**Cuidado de marca:** as imagens do moodboard usam nomes inconsistentes —
`Beyond`, `beyon.0`, `MYKER SITES`. Nenhum desses é o nome oficial. **O nome
da empresa é Beyon Zero** (HANDOFF §12.10, já corrigido uma vez no código
depois de o time errar isso). Qualquer imagem que virar asset final do site
precisa ter a marca corrigida para Beyon Zero antes de publicar.

---

## 3. O que este documento NÃO decide ainda

- Copy final de qualquer página nova (Sites, Experiências Digitais, Hub) —
  regra do projeto continua valendo: **zero número inventado** (a própria
  auditoria do HANDOFF já pegou isso uma vez — "48h pro primeiro layout" foi
  removido por falta de confirmação, e várias imagens do moodboard trazem
  estatísticas fabricadas, ver seção 4).
- Escopo exato de "Experiências digitais" e se existe um 4º serviço.
- Qual das imagens 10–15 (variantes de headline/composição da página Sites)
  vira a versão final — a tabela da seção 4 é uma proposta, não uma escolha.
- Migração física dos arquivos do site (mover `index.html` atual para
  `automacao-ia/`, escrever o Hub novo) — ver seção 6.

---

## 4. Catálogo das 15 imagens e triagem proposta

Todas salvas em `docs/restructure/moodboard/`. Numeração = ordem em que o
dono mandou.

| # | Arquivo | O que mostra | Triagem proposta |
|---|---|---|---|
| 01 | `01-atmosfera-paineis-flutuantes-a.jpg` | Colagem abstrata de painéis/janelas de vidro flutuando no escuro, feixes de luz teal, sem texto real | **Atmosfera / candidata a vídeo de transição** — fundo em loop para o Hub ou transição de entrada |
| 02 | `02-atmosfera-paineis-flutuantes-b.jpg` | Variante da 01, mais profundidade de campo, mais partículas | **Atmosfera / candidata a vídeo de transição** |
| 03 | `03-atmosfera-cubo-montagem.jpg` | Estrutura tipo cubo sendo montada por painéis de vidro, núcleo de luz branco no centro | **Forte candidata a vídeo de transição** (ex: abertura do site, ou transição Hub→página de serviço — o "cubo se montando" tem início/meio/fim natural para virar clipe curto) |
| 04 | `04-atmosfera-camadas-planos.jpg` | Planos/losangos translúcidos empilhados em profundidade, feixes teal cruzando | **Atmosfera / candidata a vídeo de transição** |
| 05 | `05-sites-mockup-vidro-corredor-a.jpg` | Painel de vidro com nav "Beyond", título "SITES", tagline, corredor de concreto ao fundo, paginação "01/04" | **Referência solta** — layout cru, primeira iteração |
| 06 | `06-sites-mockup-vidro-corredor-b.jpg` | Mesma composição da 05, ângulo diferente, com toggles/controles de UI e miniaturas embaixo | **Referência solta** — mesma ressalva |
| 07 | `07-portal-experiencias-digitais.jpg` | Portal de pedra com espelho de vidro mostrando prédio ao fundo na neblina, texto "IDEIAS GANHAM FORMA." / "BEYOND / EXPERIÊNCIAS DIGITAIS" | **Forte candidata a assinatura visual da página Experiências Digitais** — como hero estático e/ou base de vídeo de transição específico dessa página |
| 08 | `08-sites-mockup-beyond-casa.jpg` | Painel de vidro com nav completa ("Beyond" + Portfólio/Serviços/Agência/Contato), foto de casa moderna, CTA "INICIAR PROJETO", linha de logos de clientes (ilegível/placeholder) | **Referência solta** — bom para estrutura de nav, mas logos e texto secundário são ilegíveis/artefato de IA |
| 09 | `09-sites-mockup-myker-stats.jpg` | Painel com marca "MYKER SITES" (não é a marca real), casa moderna, botões "Explorar projetos"/"Conhecer o serviço", estatísticas "127 clientes ativos · +340% tráfego orgânico · 98% satisfação" | **Referência solta apenas** — números fabricados (violam a regra "zero invenção de dado") e marca errada |
| 10 | `10-board-sites-variantes-a.png` | Board 3×2: 6 variantes de um bloco "SITES_" (headline + ícones de sub-serviço + fundo: caverna submersa, montanha nevada, ambiente escuro, servidores, skyline noturno, dunas) | **Referência para escolher UMA direção de headline/fundo** — descartar as outras 5 depois da escolha |
| 11 | `11-board-sites-variantes-b.png` | Mesmo formato da 10, copy mais limpa, fundos: caverna, arco+montanha, floresta+cidade à noite, textura de seda, cidade com neblina, cordilheira | **Referência para escolher UMA direção** — evolução da 10, mesma lógica |
| 12 | `12-board-sites-hero-variantes.png` | Board 3×2, variantes de hero completo "SITES_" com estatísticas "+300 projetos / 98% satisfação / 24/7 suporte" e 6 headlines diferentes | **Referência de composição/copy** — mesma ressalva de números fabricados (teriam que virar números reais da Beyon Zero antes de publicar) |
| 13 | `13-hero-sites-vidro-nav-completa.png` | Hero "vidro tipo monitor" grande, nav real (Início/Serviços/Sobre/Contato) + CTA "Solicitar orçamento", painéis laterais (lista de serviços, gráfico de resultado) | **Melhor candidata a BASE do hero real da página Sites** — mais perto de virar layout final entre as 15 |
| 14 | `14-hero-sites-pedestal-montanha.png` | Evolução da 13: tagline "Ideias que ganham forma" + headline, montanha com cachoeira, CTA "Quero um site", dica de scroll, toda a composição sobre um pedestal de pedra | **Melhor candidata a BASE do hero real da página Sites** (par com a 13) — o pedestal vira um bom motivo de apresentação reutilizável |
| 15 | `15-hero-sites-pedestal-beyon0.png` | Variante final com marca "beyon.0" (errada), tagline "Ideias que ganham forma digital.", CTA "Começar", lista de 3 features com ícone+descrição, mesmo pedestal, paginação em pontos | **Base de composição** (pedestal + lista de features) — corrigir marca para "Beyon Zero" se for adiante |

**Resumo da proposta:** 01–04 e 03 em especial → vídeo de transição/atmosfera;
07 → assinatura visual de Experiências Digitais; 13/14/15 → base de
composição do hero de Sites (pedestal + vidro tipo monitor + nav real);
05/06/08/09/10/11/12 → referência solta para copy e layout, nenhuma vira
asset final como está (texto ilegível, marca errada ou números fabricados).

**Isto é uma proposta para o dono aprovar/corrigir — nenhuma imagem virou
asset definitivo do site ainda.**

---

## 5. Nota sobre o AI Core / Pulso na nova pele visual

Ao desenhar a pele nova (vidro, painéis flutuantes, pedestal, portal), manter
em mente que o AI Core e o Pulso continuam sendo o "coração" do site — o
canvas único (`js/field.js`), o loop único (`js/core.js`), e as leis de
performance do HANDOFF §4 (nada contínuo passa por CSS, variável CSS só muda
em evento discreto, etc.) **não mudam**. A pele nova pode trazer vidro
(`backdrop-filter`), profundidade em camadas e novos motivos, mas isso entra
como estilo estático + efeitos gateados por orçamento, do mesmo jeito que o
vidro dos cards já entra hoje (HANDOFF §5, exceção de 2026-08-18) — não como
nova var-CSS-por-frame, que foi a causa raiz dos 76ms documentados no §3.

---

## 6. O que fica para a próxima fase (não incluído nesta rodada)

- Migração física de arquivos: mover o conteúdo atual de `index.html` para
  `automacao-ia/`, escrever o Hub novo em `index.html`, criar as pastas
  `sites/` e `experiencias-digitais/` com placeholder ou conteúdo completo.
- Escrever copy real (sem números inventados) para Sites, Experiências
  Digitais e o Hub.
- Produzir/editar os vídeos de transição a partir das imagens 01–04 e 07
  (ferramenta e formato ainda não escolhidos).
- Implementar a pele visual nova (vidro, painéis, pedestal, portal) em
  `styles.css`/`js/field.js`, preservando AI Core e Pulso como está descrito
  na seção 5.
- Confirmar com o dono se há um 4º serviço antes de criar mais páginas.

---

## 7. Perguntas em aberto para o dono

1. Confirma a triagem da seção 4, ou quer trocar o destino de alguma imagem?
2. Há um 4º/5º serviço além de Sites, Automação/IA e Experiências Digitais?
3. Qual das 6 headlines dos boards 10/11/12 mais se aproxima do tom que você
   quer para a página Sites (ou nenhuma, e escrevemos do zero)?
4. Quer que eu já comece a migração de arquivos da seção 6, ou prefere
   revisar este documento primeiro?

---

## 8. Nota cruzada com o HANDOFF

Ver nota adicionada ao topo de `docs/HANDOFF.md` apontando para este
documento — a seção 5 do HANDOFF ("identidade SAGRADA") segue registrada
como histórico de como a identidade evoluiu, mas deixa de ser a última
palavra: este documento é a camada mais nova sobre paleta/composição, sem
substituir as leis de performance (§3–4) nem o comportamento do AI
Core/Pulso (§6/§11.3), que continuam valendo.
