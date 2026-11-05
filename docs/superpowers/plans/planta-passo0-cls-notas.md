# Planta viva, Passo 0: o que mede o CLS do protótipo (notas)

> Data: 2026-11-05. Plano: `docs/superpowers/plans/2026-11-05-planta-viva.md`, "Passo 0". Spec: §4.4 (hipóteses a confirmar).
> Sem PR próprio: este resultado vai para o corpo do PR 2b, que **não começa o desenho sem ele** ("medir antes de afirmar").
> Só documentação. Nada do site mudou; o protótipo (worktree `site-planta`, commit `148deab`) foi apenas servido e medido.

## 1. Como foi medido (para repetir)

- Protótipo servido de fora, sem editá-lo: `node docs/servidor.mjs . 8911` dentro do worktree `site-planta`; página `docs/lab-planta.html?nicho=clinica|embalagens|loja`.
- Ferramenta: `docs/lab-planta-medir.mjs`, **commitada junto destas notas** (o protótipo tem uma de mesmo nome que só soma `value`; esta registra cada deslocamento). Uso: `node docs/lab-planta-medir.mjs <prefixo> <tamanhos> <variantes> [esperaMs]`, ou `--help`. **A página padrão (`PAGINA=/docs/lab-planta.html`) não existe nesta branch:** o laboratório é do protótipo, então a ferramenta precisa de um servidor que sirva o worktree `site-planta` (`node docs/servidor.mjs . 8911` lá, e `BASE=http://127.0.0.1:8911` aqui); o PR 2b aponta `PAGINA` e `SEL` para o laboratório novo. Playwright + Chromium headless shell 1228 (Windows, desenho por software; serve para COMPARAR). Em cada carregamento registra:
  - cada `layout-shift` com `value`, `hadRecentInput` e `sources[]` (nó, retângulo anterior e atual);
  - uma linha do tempo por quadro (`requestAnimationFrame`) do 1º ao 1,5º segundo: painel oculto?, altura do quadro, largura e altura da nota, altura da lista "anotado" e da legenda, fonte Sora pronta?;
  - marcas do JS (`DOMContentLoaded`, `load`, fonte carregada, `fonts.ready`, o instante em que o JS grava a altura do quadro).
- Contexto de cada medida: janela nova, aquecimento antes (o 1º carregamento do headless é lento: sem ele apareceram cargas de 10 a 20 s que distorcem a corrida entre fonte e JS), `bypassCSP` só nas variantes que injetam CSS pela rota (a CSP do servidor local bloqueia `<style>` inline; descobri isso porque a 1ª tentativa de A/B não mudou nada e a medida da altura mostrou o quadro ainda com 2 px).
- Tamanhos: **390x844**, **320x640**, **320x844**, **1280x800** (320 nos dois porque a altura da janela muda o número: o que sai da janela deixa de contar). 3 nichos em cada. Espera de 10,5 s na medida base (a sequência da luz tem 7,6 s e a legenda ainda muda perto de 9 s) e de 4,5 s nas variantes (o que interessa acontece em 0,4 s).
- CLS = soma dos `layout-shift` sem entrada da pessoa (os que acontecem juntos numa só janela de 5 s; aqui todos).
- A/B por **injeção de CSS/HTML na rota** (o arquivo do protótipo não é tocado): `altura` (o quadro nasce com a altura que o JS vai dar), `preload` (as duas fontes pré-carregadas, como `index.html` e `orcamento.html` já fazem), `leitura` (legenda com `min-height: 9em`), `anotado` (a lista "O que a conversa já anotou" nasce com a altura final), `painel` (o painel nunca sai de `hidden`: ocupa o lugar com `visibility: hidden`), `semjs` (a lista sem-JS escondida desde o início).

## 2. Resultado: CLS por viewport e nicho (medida base)

Faixa pedida no plano: 0,17 a 0,36. Reproduzida: **0,07 a 0,33** conforme a janela (a janela de 640 px de altura "esconde" parte do salto), com **picos de 0,619** em cargas isoladas de 390x844 (embalagens e loja) em que a troca de fonte e a altura do quadro caem no mesmo quadro, em vez de em dois.

| viewport | nicho | CLS base | deslocamentos (instante: valor) |
|---|---|---|---|
| 390x844 | clínica | 0,287 | 342 ms: 0,0126 · 367 ms: **0,2743** |
| 390x844 | embalagens | 0,287 (0,619 em algumas cargas) | 0,0126 · **0,2743** |
| 390x844 | loja | 0,327 | 0,0126 · **0,3147** |
| 320x640 | clínica | 0,072 | 0,0001 · **0,0684** · 8,7 s: 0,0031 |
| 320x640 | embalagens | 0,082 | **0,0820** |
| 320x640 | loja | 0,084 | 0,0001 · **0,0820** · 8,1 s: 0,0014 |
| 320x844 | clínica | 0,265 | **0,2633** · 8,6 s: 0,0018 |
| 320x844 | embalagens | 0,274 | 0,0001 · **0,2737** |
| 320x844 | loja | 0,275 | 0,0001 · **0,2737** · 8,1 s: 0,0008 |
| 1280x800 | clínica | 0,169 | 0,0237 · **0,1457** |
| 1280x800 | embalagens | 0,184 | 0,0237 · **0,1607** |
| 1280x800 | loja | 0,214 | 0,0237 · **0,1907** |

O valor em negrito é um deslocamento só, logo depois da 1ª pintura (270 a 380 ms). Os nichos diferem porque o quadro tem alturas diferentes (390 px: 804, 1.134 e 1.028; 320 px: 912, 1.224 e 1.172; 1.280 px: 388, 420 e 504); quanto mais alto o quadro, maior o salto.

### Tabela pedida pelo plano: elemento, CLS e causa

Valores da medida base. Os saltos de C1 e C3 acontecem no MESMO quadro (os números das duas linhas se sobrepõem; não se somam).

| elemento (fonte do `layout-shift`) | CLS | causa |
|---|---|---|
| `div.pl-quadro` (de 2 px para a altura final), mais `svg.pl-svg`, `p.pl-cota`, `div.pl-acoes` e `p.pl-leitura` descendo junto | 0,2743 (390 clínica) · 0,3147 (390 loja) · 0,2633 a 0,2737 (320x844) · 0,0684 a 0,0820 (320x640) · 0,1457 a 0,1907 (1280) | C1: o JS dá a altura ao quadro só no `fonts.ready`, depois da 1ª pintura. Com a altura reservada por CSS o total cai para 0,035 a 0,065 |
| `ul.pl-anotado` preenchida (empurra o quadro 109 a 132 px no celular e 32 px no computador) | parte do salto acima; pela diferença do A/B (base menos "só lista reservada"): cerca de 0,16 em 390 clínica, 0,14 em 320x844, 0,02 em 1280 | C3: a lista nasce vazia e o JS a enche no mesmo quadro de C1 |
| `section.pl-painel`, `div.pl-nichos`, `p.pl-nota` (cabeçalho refluindo) | 0,0126 (390) · 0,0237 (1280) · ~0 (320) | C2: a fonte Sora chega depois da 1ª pintura; a nota refaz as linhas (e, em 1.280, a largura de `58ch`) |
| `p.pl-acoes` (desce 21 px perto de 8 a 9 s) | 0,0008 a 0,0031 (só em 320) | C4: a frase da luz precisa de uma linha a mais que o `min-height: 5.6em` da legenda |
| `button.pl-btn--primario` | 0,0001 a 0,0003 | troca de fonte no texto do botão |

## 3. As causas, com `layout-shift` e `sources`

### C1. O quadro nasce com 2 px e ganha a altura (CONFIRMADA; é o salto grande)

Linha do tempo medida (390x844, embalagens, carga em que a fonte e a altura caíram no mesmo quadro):

```
276 ms   1ª pintura: painel já fora de "hidden", quadro com 2 px, lista "anotado" vazia, nota 350x67, fonte Sora ainda não pronta
340 ms   fonts.ready: o JS grava quadro.style.height = 1134px e enche a lista "anotado"; a nota passa a 350x90
342 ms   layout-shift 0,6189   section.pl-painel [20,432,350,255] -> [20,454,350,390] · div.pl-nichos [20,262,...] -> [20,284,...]
                               div.pl-acoes [20,589,...] -> fora da janela · p.pl-cota [20,482,...] -> fora da janela
```

Quando a fonte chega um quadro antes da altura (clínica, 390x844) são dois deslocamentos: 0,0126 (a nota refluindo; C2) e 0,2743 (`div.pl-quadro [20,493,350,2] -> [20,602,350,242]`, com `p.pl-cota`, `div.pl-acoes` e `svg.pl-svg` como fontes). A soma dos dois (0,287) é menor que o deslocamento único (0,619); **hipótese não testada:** no quadro único as fontes partem de mais perto do topo e o impacto e a distância são medidos de uma vez.

- **Mecanismo:** `docs/lab-planta.js` tira o painel de `hidden` na hora em que o script roda (`painel.hidden = false`, antes da 1ª pintura), mas só desenha, mede e dá altura ao quadro dentro de `document.fonts.ready.then(...)` (uma tarefa depois). O Chrome pinta no meio. Tudo o que vem depois do quadro (cota, legenda, botões) desce a altura inteira do quadro (804 a 1.224 px no celular, 388 a 504 px no computador) e sai da janela: impacto alto e distância alta.
- **A hipótese da spec ("altura da área definida por JS depois de medir") está certa, com um refinamento:** não é a medida em si, é a **corrida** entre a 1ª pintura e o `fonts.ready`. Prova: só com `preload` das fontes (a fonte chega antes da 1ª pintura e o JS dimensiona no mesmo quadro) o CLS cai a 0 em 9 de 12 casos, e nos 3 em que a fonte perde a corrida o salto grande volta (390 clínica 0,274; 320x640 embalagens 0,082; 1280 embalagens 0,163). Quem depende de ordem de chegada não é solução.
- **Prova por A/B (altura reservada por CSS desde o 1º quadro, nada mais mudou):** 0,287 -> 0,065 (390 clínica), 0,327 -> 0,048 (390 loja), 0,274 -> 0,048 (320x844 embalagens), 0,214 -> 0,036 (1280 loja). O salto grande some em todos os 12 casos; o que sobra é C2 e C3.

### C2. Troca de fonte reflui o cabeçalho (CONFIRMADA; é o salto pequeno em 390 e 1280)

```
390x844   nota 350x67 -> 350x90 (3 para 4 linhas)   layout-shift 0,0126   section.pl-painel [20,432,...] -> [20,454,...] · div.pl-nichos [20,262,...] -> [20,284,...]
1280x800  nota 464x67 -> 603x45 (largura e altura)   layout-shift 0,0237   section.pl-painel · div.pl-nichos · p.pl-nota [82,244,464,67] -> [82,190,603,45]
```

- **Mecanismo:** a fonte Sora chega depois da 1ª pintura (a página de laboratório não tem o `preload` que `index.html` e `orcamento.html` têm nas linhas 70-71 e 33-34). Em 1.280 o `.pl-nota` usa `max-width: 58ch`, e `ch` é a largura do "0" da fonte: com a troca a caixa muda de largura (464 -> 603 px) e o texto refaz as linhas. Em 390 a largura é a da tela e o que muda é a quebra de linha (3 para 4 linhas). **Hipótese não testada:** a reserva de métrica `Sora Reserva` (tokens.css, `size-adjust: 106%`) não iguala a Sora neste teste (a nota refluiu mesmo com ela), mas não medi a reserva isolada.
- **Prova por A/B:** com `altura` + `preload` o salto some em 10 de 12 casos (os 2 restantes, 0,031 em 390 loja e 0,035 em 320x640 embalagens, são do tamanho de C3). Em 390 e 1280 a diferença `altura` (0,036 a 0,065) -> `altura+preload` (0 em 5 de 6 casos; 390 loja ficou em 0,031) é este salto. Sem o `preload`, o pacote completo deixa só este resíduo: 0,016 (390) e 0,036 (1280).
- **Alcance real:** **não medido na página real.** `orcamento.html` já carrega as duas fontes por `preload` e a faixa da planta entra **abaixo** da conversa, então é esperado que o salto do cabeçalho seja menor ou nulo lá; a confirmar no PR 2c. Em qualquer caso o desenho não deve depender da fonte: caixas e rótulos em posição absoluta dentro de área de tamanho fixo (spec §4.4 (2)), sem `ch` na geometria.

### C3. A lista "O que a conversa já anotou" nasce vazia e é preenchida pelo JS (CONFIRMADA; **causa nova**, a spec não tinha)

```
390x844 clínica   a lista passa de 0 para 109 px (3 pílulas em 3 linhas), quadro [20,493,...] -> [20,602,...]
320x844           0 para 132 px (clínica) e 109 px (embalagens, loja)
1280x800          0 para 32 px
```

- **Mecanismo:** `escolher()` faz `anotado.textContent = ''` e acrescenta os `<li>` depois da 1ª pintura. A altura final depende da largura (as pílulas quebram em até 3 linhas no celular).
- **Prova por A/B:** com a lista reservada (`anotado`) o pacote completo (`altura + preload + leitura + anotado`) ficou em **0 em 35 de 36 cargas** (3 repetições x 12 casos; 1 carga com 0,016, **provavelmente** C2 (a fonte pré-carregada ainda não estava pronta no 1º quadro e a nota refluiu); não confirmado, não isolei a causa). Sem ela, o pacote `altura + preload + leitura` (1 carga por caso) ainda deixou 0,043 (320x640 clínica) e 0,067 (1280 clínica); as fontes do `layout-shift` dessas duas cargas são o quadro descendo 132 px e 32 px, isto é, a lista sendo preenchida (1280 clínica também teve a nota refluindo). **Não dá para somar** as parcelas por aritmética: o mesmo caso 1280 clínica deu 0,000 na coluna `altura+preload`, e cada célula é uma carga só, sujeita à corrida com a fonte; só a coluna do pacote tem 3 repetições. Reservar só a lista (sem a altura do quadro) reduz mas não resolve (0,011 a 0,201, ver a tabela 2 da seção 4): o salto grande (C1) continua.
- **No produto:** essa lista é do painel da fatia 1, não da planta. A lição vale para tudo o que a faixa tiver: nada de bloco que nasça com altura zero e seja preenchido depois.

### C4. Legenda de altura variável (CONFIRMADA; **desprezível**)

`p.pl-acoes` desce 21 px em 320 px, perto de 8 a 9 s, quando uma frase da luz precisa de uma linha a mais que o `min-height: 5.6em` da legenda: 0,0031 (320x640 clínica), 0,0018, 0,0014, 0,0008. Com `min-height: 9em` (`leitura`) esses deslocamentos somem em todas as cargas do pacote (sozinha, a legenda de 9em não muda o total, dominado por C1: tabela 2). Reservar 4 linhas (spec §4.4 (3)) resolve; o número é pequeno porque os botões estão no fim da janela.

### H2 da spec, "bloco que sai de `hidden`" (DERRUBADA como causa própria)

A variante `painel` (o painel nunca sai de `hidden`: ocupa o lugar desde o início com `visibility: hidden`) **não mudou o CLS** (tabela 2 da seção 4): 0,275 / 0,275 / 0,619 (390; o 0,619 é o quadro único de uma carga isolada), 0,150 / 0,165 / 0,195 (1.280), contra 0,287 / 0,287 / 0,327 e 0,169 / 0,184 / 0,214 da base. O bloco em si não é o problema; o problema é o que tem **dentro** dele crescer depois (C1, C3). A regra de inserção da spec (§4.4 (4)) continua valendo para o cenário real, mas por motivo diferente: tirar de `hidden` só é inofensivo se o conteúdo já nascer com tamanho.

### Também descartado

- `semjs` (esconder a lista sem-JS desde o início): sem efeito (tabela 2: 0,287 / 0,287 / 0,327 em 390 e os mesmos valores da base nos outros tamanhos). Ela está abaixo da faixa.
- Pequenos 0,0001 em 320 (`button.pl-btn--primario` 1 px): é o texto do botão trocando de fonte; irrelevante.
- Rolagem automática do protótipo (`window.scrollBy`): não é deslocamento de layout e não entra no CLS (a spec já a remove).

## 4. A/B completo (CLS)

Colunas: `base`; só altura reservada; só fontes por `preload`; altura + preload; + legenda de 9em; + lista reservada (o pacote: **3 repetições** por caso, separadas por barra); e o pacote sem o `preload`.

| viewport | nicho | base | altura | preload | altura+preload | +leitura | +anotado (pacote) | pacote sem preload |
|---|---|---|---|---|---|---|---|---|
| 390x844 | clínica | 0,287 | 0,065 | 0,274 | 0,000 | 0,000 | 0,000 / 0,000 / 0,000 | 0,016 |
| 390x844 | embalagens | 0,287 | 0,065 | 0,000 | 0,000 | 0,000 | 0,000 / 0,000 / 0,016 | 0,016 |
| 390x844 | loja | 0,327 | 0,048 | 0,000 | 0,031 | 0,000 | 0,000 / 0,000 / 0,000 | 0,016 |
| 320x640 | clínica | 0,072 | 0,043 | 0,000 | 0,000 | 0,043 | 0,000 / 0,000 / 0,000 | 0,000 |
| 320x640 | embalagens | 0,082 | 0,035 | 0,082 | 0,035 | 0,000 | 0,000 / 0,000 / 0,000 | 0,000 |
| 320x640 | loja | 0,084 | 0,035 | 0,000 | 0,000 | 0,000 | 0,000 / 0,000 / 0,000 | 0,000 |
| 320x844 | clínica | 0,265 | 0,058 | 0,000 | 0,000 | 0,000 | 0,000 / 0,000 / 0,000 | 0,000 |
| 320x844 | embalagens | 0,274 | 0,048 | 0,000 | 0,000 | 0,000 | 0,000 / 0,000 / 0,000 | 0,000 |
| 320x844 | loja | 0,275 | 0,048 | 0,000 | 0,000 | 0,000 | 0,000 / 0,000 / 0,000 | 0,000 |
| 1280x800 | clínica | 0,169 | 0,040 | 0,000 | 0,000 | 0,067 | 0,000 / 0,000 / 0,000 | 0,036 |
| 1280x800 | embalagens | 0,184 | 0,036 | 0,163 | 0,000 | 0,000 | 0,000 / 0,000 / 0,000 | 0,036 |
| 1280x800 | loja | 0,214 | 0,036 | 0,000 | 0,000 | 0,000 | 0,000 / 0,000 / 0,000 | 0,036 |

Leitura da tabela: (1) altura reservada sozinha tira o salto grande (C1); (2) fontes sozinhas dependem de quem chega primeiro, e perdem em 3 de 12 (a corrida de C1); (3) os resíduos de `altura+preload` e `+leitura` (0,031 a 0,067) coincidem com a lista preenchida depois (C3) e, em 1.280, com a troca de fonte; como cada célula é uma carga só, **não se atribui número a cada parcela** além do que as `sources` mostram; (4) o pacote completo zera 35 de 36 cargas, e sem o `preload` sobram só 0,016 (390) e 0,036 (1.280), a troca de fonte (C2).

### Tabela 2: as variantes isoladas (uma carga por célula)

`só legenda 9em` e `só lista reservada` mostram o que cada reserva faz sozinha; `painel sempre no layout` e `lista sem-JS escondida` são as hipóteses descartadas (seção 3).

| viewport | nicho | base | só legenda 9em | só lista reservada | painel sempre no layout | lista sem-JS escondida |
|---|---|---|---|---|---|---|
| 390x844 | clínica | 0,287 | 0,288 | 0,129 | 0,275 | 0,287 |
| 390x844 | embalagens | 0,287 | 0,619 | 0,135 | 0,275 | 0,287 |
| 390x844 | loja | 0,327 | 0,329 | 0,134 | 0,619 | 0,327 |
| 320x640 | clínica | 0,072 | 0,051 | 0,011 | 0,068 | 0,069 |
| 320x640 | embalagens | 0,082 | 0,082 | 0,021 | 0,082 | 0,082 |
| 320x640 | loja | 0,084 | 0,082 | 0,021 | 0,082 | 0,082 |
| 320x844 | clínica | 0,265 | 0,250 | 0,124 | 0,263 | 0,263 |
| 320x844 | embalagens | 0,274 | 0,274 | 0,148 | 0,265 | 0,274 |
| 320x844 | loja | 0,275 | 0,274 | 0,148 | 0,274 | 0,274 |
| 1280x800 | clínica | 0,169 | 0,174 | 0,146 | 0,150 | 0,169 |
| 1280x800 | embalagens | 0,184 | 0,189 | 0,161 | 0,165 | 0,184 |
| 1280x800 | loja | 0,214 | 0,219 | 0,201 | 0,195 | 0,214 |

Os 0,619 desta tabela (390 embalagens em `só legenda 9em`, 390 loja em `painel sempre no layout`) são o mesmo fenômeno de C1 (quadro único), não efeito da variante.

## 5. A proposta mensurável para o PR 2b

O que o desenho da planta tem de garantir (cada item é testável e vem com o número que o confirma):

1. **A faixa nunca é pintada com altura menor que a final.** `alturaReservada(largura)` (plano, PR 2b) é aplicada **na mesma tarefa síncrona** em que a faixa sai de `hidden` (ou o contêiner já nasce com a altura por classe CSS), sem esperar `document.fonts.ready` nem `IntersectionObserver`. Evidência: A/B `altura`, 0,287 -> 0,065 (390 clínica) e 0,327 -> 0,048 (390 loja); a corrida com a fonte (C1) não pode ser a garantia.
2. **Nada nasce com altura zero e é preenchido depois.** Lista de etapas (`<ol>`), legenda (altura de 4 linhas reservada; o `min-height: 9em` do teste mediu 126 px em 390 e 144 px em 1.280), botões e o status já existem com tamanho quando a faixa aparece; o texto entra por `textContent`, a altura não muda.
3. **A geometria não depende da fonte.** Caixas e rótulos em posição absoluta dentro de área fixa, larguras em px (nunca `ch`/`em` na geometria), título limitado a 2 linhas (spec §1.4). Evidência: C2 (0,0126 e 0,0237 só por `ch`).
4. **Fonte com `preload`** no laboratório (a página real já tem), para que a medida do laboratório represente a página.
5. **Meta e método:** CLS **absoluto ≤ 0,01** da faixa no laboratório, em 390x844, 320x640, 320x844 e 1280x800, para os 3 nichos, **3 repetições por caso**, depois de um aquecimento, com `sources` registradas (a ferramenta é `docs/lab-planta-medir.mjs`, já no repositório; o PR 2b ajusta os seletores `SEL` ao laboratório novo e usa a espera de 10 s para pegar o deslocamento tardio da legenda). Resultado de referência do pacote sobre o protótipo: 0 em 35 de 36 cargas, máximo 0,016.
6. **No PR 2c (página real):** o delta de CLS (com planta menos sem planta) ≤ 0,01 com a faixa **dentro e fora** da área visível. **Hipótese a confirmar no 2c:** o salto grande só existe aqui porque o painel do laboratório fica no topo da janela; abaixo da conversa o mesmo salto não deveria contar no CLS, mas só se a faixa for inserida fora da área visível (regra de inserção da spec §4.4 (4)).

## 6. Limites desta medida (ditos como são)

- Chromium headless por software, em Windows, com a máquina em uso; o valor absoluto muda de uma carga para outra (390 embalagens deu 0,287 e 0,619, conforme a fonte e a altura chegassem em quadros separados ou no mesmo). Por isso os números acima são de comparação, e o critério do PR 2b usa 3 repetições.
- A medida é do **laboratório**, não da página de orçamento. Lá a faixa vem abaixo da mesa e as fontes têm `preload`; **hipótese, não medida:** o laboratório superestima C1 e C2 em relação à página real. O PR 2c mede a página real (`docs/medir-planta.mjs`).
- A corrida entre fonte e JS é sensível à carga da máquina: cargas de 10 a 20 s (o 1º carregamento do headless) mudam quem chega primeiro e foram descartadas pelo aquecimento. Uma das 36 cargas do pacote ainda sofreu algo parecido (a de 0,016, 390x844 embalagens): provavelmente C2, não confirmado.
- Não medi CPU, fps nem nós do DOM (isso é da verificação do PR 2b).
