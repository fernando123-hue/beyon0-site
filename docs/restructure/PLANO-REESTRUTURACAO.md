# Reestruturação Beyon Zero — Hub + páginas por serviço

**Aberto em:** 2026-09-22 · **Branch:** `claude/site-restructure-planning-1cd10h`
**Status:** **Hub e página de Sites CONSTRUÍDOS e verificados ao vivo no
navegador** (2026-09-22, segunda rodada). Ver a seção 9 — ela é a mais nova e
descreve o que existe no código agora. As seções 1 a 8 são o planejamento que
levou até aqui e continuam válidas no que a 9 não substituiu.

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


## 9. O QUE FOI CONSTRUÍDO (2026-09-22, segunda rodada)

O dono pediu para começar a construir, com **foco total na parte de Sites** e
um pedaço do Hub, e refinou a decisão de identidade: **manter a essência do AI
Core e dos Pulsos**, mudar e acrescentar todo o resto em busca de uma
experiência visual premium.

### 9.1 Arquivos: o que virou o quê

| Arquivo | Estado |
|---|---|
| `automacao.html` | **É o antigo `index.html`**, movido com `git mv` (histórico preservado). Conteúdo intacto; mudaram só o `canonical`/`og:url`, o logo e o rodapé (que agora apontam para o Hub) e a nav (ganhou link para Sites). |
| `index.html` | **Novo — o Hub.** Hero com o AI Core sozinho, índice dos 3 serviços, bloco de Experiências Digitais com o portal, 3 princípios, CTA. |
| `sites.html` | **Novo — a página de Sites, completa.** Hero com palco, 3 formatos, padrão de entrega, prova medida, método em 4 passos, FAQ, CTA. |
| `css/premium.css` | **Nova camada visual**, carregada depois de `styles.css` só nas páginas novas. |
| `js/pagina.js` | **Novo controlador** das páginas novas (substitui `js/dom.js` nelas). |
| `sitemap.xml` | Passou a listar as 4 páginas. |
| `resumo.html` | Só o "voltar pro site", que agora volta para `automacao.html` (de onde o leitor veio), não para o Hub. |

### 9.2 O que foi REAPROVEITADO sem tocar
`styles.css` (tokens, nav, botões, cartões, malha, linha do tempo, FAQ,
rodapé), `js/core.js` (estado + loop único + orçamento), `js/field.js` (o
canvas inteiro: campo de partículas, **AI Core**, coluna, mini AI Core dos
cartões, aurora e onda do Singular) e `js/entrada.js` (a LINHA de entrada).

Isso é o que cumpre a decisão do dono ao pé da letra: o AI Core das páginas
novas **é** o AI Core do site, o mesmo código, não uma reimplementação
parecida. `js/field.js` já degradava bem quando um elemento não existe, então
bastou as páginas novas oferecerem os mesmos ganchos (`.hero__reactor`,
`.card--service`, `.bus`, `.steps .step`).

O Pulso e o Estado Singular foram levados para `js/pagina.js` com as mesmas
constantes e as mesmas quatro fases — inclusive os dois ajustes que só uma
simulação numérica tinha pego. **Verificado ao vivo: o Pulso disparou aos 11s.**

### 9.3 A pele nova (`css/premium.css`)
Material de vidro em camadas, palco com pedestal, folhas flutuantes, janela de
navegador feita de HTML, índice do Hub, folha de specs, painel de prova e o
portal de pedra. Tudo escrito sobre os tokens existentes — por isso **o Singular
ainda vira tudo de ouro de graça**, sem uma linha de JS a mais.

**A janela do hero não é imagem.** Os mockups do moodboard têm texto ilegível,
marca errada e números inventados; construída em HTML/CSS ela sai nítida em
qualquer tela, pesa zero KB e, num site que vende sites, é a demonstração.

### 9.4 Zero invenção de dado — o que entrou no lugar das estatísticas
Os mockups de referência trazem "+300 projetos", "98% de satisfação", "127
clientes ativos", "+340% de tráfego". **Nada disso foi publicado** — o projeto
não tem como provar, e a regra de zero invenção proíbe. No lugar entrou a
seção **Prova**: tempo de carga, peso baixado e fps, medidos pelo navegador de
quem está lendo, agora. A nota da própria seção declara que o peso conta só o
que sai deste domínio, porque fontes externas não reportam tamanho.

### 9.5 Verificação ao vivo (primeira vez na história do projeto)
O ambiente desta sessão tem Chromium + Playwright, então **o agente viu as
páginas rodando** — o que nenhuma sessão anterior conseguiu (ver HANDOFF §7).
Resultado final, nas 5 combinações de página × viewport (1440×900 e 390×844):

- **60 fps** em todas, zero erro de console, zero rolagem horizontal;
- custo do canvas: **0,054 ms/frame** na página de Sites — 1/300 do orçamento;
- reveals 14/14 disparando, FAQ abrindo, menu do celular abrindo e fechando no
  Esc, navegação Hub → Sites → Automação → Hub inteira funcionando;
- links de WhatsApp qualificados por cartão.

**Seis bugs foram achados olhando o render e corrigidos** — todos invisíveis à
leitura do código: o pedestal atravessando a janela; a janela de vidro por cima
do texto no celular (dois `grid-row: 2` na mesma célula, porque `styles.css`
inverte a ordem do hero abaixo de 860px); 12px de rolagem horizontal em 390px;
a grade de specs desenhando um retângulo cinza na célula que sobrava; o painel
de prova amontoado em metade da largura; e o portal montado como três
retângulos soltos.

### 9.6 A decisão medida: `backdrop-filter`
A primeira versão punha desfoque em todo `.vidro` e a página de Sites caiu para
**45 fps** contra 60 das outras. O A/B na mesma sessão mostrou que a culpa era
inteira da janela — que **não ganhava nada** com o desfoque, porque o conteúdo
dela tem fundo próprio opaco:

| configuração | fps |
|---|---|
| janela + satélite com desfoque | 45,4 |
| só o satélite com desfoque | 60,5 |
| nenhum desfoque | 60,4 |

O desfoque ficou só no satélite (pequeno, translúcido de verdade, custo zero na
medição). É a regra do projeto aplicada: **medir, não deduzir**.

### 9.7 O que continua em aberto
1. A triagem de imagens da seção 4 segue esperando revisão do dono. **Nenhuma
   imagem do moodboard virou asset do site** — a pele nova foi construída a
   partir da LINGUAGEM delas (vidro, pedestal, portal, painéis em
   profundidade), não dos arquivos.
2. Os vídeos de transição (imagens 01–04 e 07) não foram produzidos.
3. A página de **Experiências Digitais** não existe: no Hub ela é um bloco com
   o portal e um link para a conversa, e o rótulo "sob demanda" diz isso. Não
   há link quebrado prometendo uma página que não existe.
4. Confirmar se há um 4º serviço.
5. A nav de `automacao.html` ainda tem a cara antiga (é `styles.css` puro). Não
   é erro — é a página que já estava aprovada e publicada. Unificar a nav das
   três é trabalho de uma próxima rodada.
6. URLs terminam em `.html`. Dá para virar `/sites` e `/automacao` com
   `cleanUrls` num `vercel.json`, mas isso mexe na configuração de deploy e não
   foi feito sem o dono pedir.

---

---

## 10. CAMADA 3D E SUGESTÕES DE IMAGEM (2026-09-22, terceira rodada)

Triagem da seção 4 **aprovada pelo dono sem alterações**. Nav das três páginas
unificada. E o 3D entrou, com a condição que ele deu: pontos estratégicos,
sempre suave.

### 10.1 Onde o 3D entrou, e por quê ali

| Ponto | Cena | De onde veio |
|---|---|---|
| Hero do Hub | Cubo de vidro envolvendo o AI Core | imagem 03 |
| Hero de Sites | Painéis orbitando a janela | imagens 01/02/04 |
| Experiências Digitais (Hub) | Portal de pedra com o vão aceso | imagem 07 |

O 3D é **acréscimo, nunca substituição**: o palco, o portal e o AI Core
continuam existindo em CSS e em canvas 2D. Se a camada não carregar, ninguém
percebe falta.

### 10.2 As regras que garantem a fluidez
Um contexto WebGL só (scissor por cena) dentro do rAF único; cena fora da tela
não custa nada; o three só baixa quando uma cena se aproxima; sem luz, sombra,
pós-processamento ou MSAA; buffer a 62% da tela; degradação em dois estágios
medida em fps real; e **fora do toque por inteiro** — a paralaxe de cursor é o
que o 3D acrescenta, e sem cursor ela não existe, então o celular não baixa um
byte a mais.

**A/B na mesma sessão: 59,7 fps com a camada contra 60,4 sem ela.**

### 10.3 Sugestões de imagens para gerar

O dono perguntou o que gerar caso as 15 não bastem. As que existem cobrem bem
o serviço de **Sites** e a atmosfera. O que falta:

**Prioridade alta — o que hoje não tem imagem nenhuma**
1. **Automação & IA, cena-assinatura.** É a única frente sem imagem própria: o
   Hub a apresenta só com texto. Pedir algo na mesma língua das outras — vidro
   escuro, teal, profundidade — mostrando *fluxo* em vez de tela: nós ligados,
   uma linha de decisão, um caminho que se resolve sozinho. Nunca um robô, nunca
   um cérebro brilhando: os dois clichês que a direção do projeto já recusou.
2. **Experiências digitais, além do portal.** A 07 é excelente mas é uma só. Duas
   ou três variações do mesmo arco (ângulos diferentes, o vão com conteúdo
   diferente) dariam material para a página própria quando ela existir.
3. **Capa OG por página.** Hoje as três dividem a mesma `assets/og-cover.jpg`.
   Uma por página melhora o link compartilhado no WhatsApp, que é o canal de
   venda do negócio.

**Prioridade média**
4. **O cubo se montando, em sequência.** A 03 é o melhor quadro do conjunto. Uma
   sequência de 5 a 8 quadros da mesma montagem viraria o vídeo de transição sem
   precisar animar nada à mão.
5. **Textura de pedra em teal escuro**, para o portal em 3D trocar o gradiente
   por material de verdade. Um arquivo pequeno, 512px, sem costura.

**O que NÃO vale gerar mais**
Mockups de site com texto dentro. As imagens 05, 06, 08, 09 e os boards 10-12
provaram o limite: o texto sai ilegível e os números saem inventados. A janela
do hero é construída em HTML justamente por isso — e fica nítida em qualquer
tela, de graça.

**Regra para qualquer imagem nova:** a marca é **Beyon Zero**. Nada de
`Beyond`, `beyon.0` ou `MYKER`. E nenhum número dentro da imagem, porque
número em imagem não passa pela regra de zero invenção.
