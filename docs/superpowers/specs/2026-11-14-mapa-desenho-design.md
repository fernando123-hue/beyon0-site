# PR 5 — o mapa do caso na tela (desenho, movimento, "Ficou certo?")

Data: 2026-11-14. Base: spec `2026-11-13-orcamento-conversa-design.md` §7.4 e §7.5 (aprovada pelo dono via sessão principal), Anexo C (o que o PR 4 fechou), a planta viva v2 aprovada em 12/11 (movimento que fica) e o laboratório `docs/lab-estruturas*` (#149).
Ordem do dono (14/11): "o mais completo e polido"; PR 5 "com calma e com qualidade de obra-prima".

## 1. O que fica de pé (não se discute aqui)

- O código desenha; o modelo só escolhe a estrutura e escreve dentro do esquema v3 (PR 4). Só `textContent`; papel, ícone, origem e estrutura passam por tabela; nada do plano vira classe, id, seletor ou atributo.
- Movimento aprovado (12/11) continua, adaptado: semente no núcleo, estação que nasce pela luz, voo do esboço para o desenho final, a luz que percorre na ordem, o objetivo que vira ouro, os sons `passa` e `ouro`. Nada de blur; só transform e opacity (e `stroke-dashoffset` uma vez por traço); nenhum `requestAnimationFrame` contínuo; pausa fora da tela e com a aba escondida; movimento reduzido = o quadro final parado e aceso.
- Celular primeiro: o mapa inteiro cabe em 440 px de altura a 390 e a 320, objetivo sempre à vista; no computador (≥ 960) a faixa larga.
- Mono só no rótulo da seta; o resto em Sora; sem número de etapa; sem grade no celular.
- O v2 continua desenhando como hoje (módulos atuais, intocados); o cliente ignora versão desconhecida.
- BZ_PLANTA segue desligada em produção.

## 2. A decisão visual que é do dono (antes de codar o desenho)

As fotos do laboratório (#149, refeitas hoje em `00 Entrada/orcamento-conversa/lab-estruturas-1411/`) resolvem a geometria, mas o visual é um fluxograma de caixas com borda inteira: fica longe da linguagem da planta viva v2 que ele aprovou (o núcleo do Zero de onde a luz sai, o trilho de 1 px, o chip de canto cortado com o ícone, o texto ao lado, o LED que vira ouro). Ele mesmo disse em 13/11: "não vamos nos prender nesse padrão de cards".

Duas direções, lado a lado em fotos de celular (390) e computador (1280), mesmo caso, as 5 estruturas:

- **A. Caixas (o laboratório como está, polido):** cada nó é uma caixa com borda; setas com rótulo mono entre elas.
- **B. Trilho e estações (a linguagem da planta viva v2), recomendada:** o núcleo do Zero no começo; as setas viram trilho de 1 px que sai dele; cada nó é uma estação (chip de canto cortado com o ícone, sem caixa inteira) com o título e a frase ao lado; o papel aparece na cor do chip e do trecho do trilho; o objetivo é o LED que vira ouro. As estruturas mudam a forma do trilho (reto, duas faixas, que se divide, que fecha em laço, rede).

O laboratório desenha as duas (`?pele=caixa|trilho`; `PELE=trilho node docs/lab-estruturas-fotos.mjs <pasta>`), e a conferência de geometria passa nas duas (4 casos × 320, 390, 768 e 1280). Na pele trilho, o vão entre as linhas do celular cresce com o rótulo mais alto que sai dela, e a linha que troca de coluna cruza abaixo do rótulo. As fotos e o LEIA.md para o dono estão em `00 Entrada/orcamento-conversa/lab-estruturas-1411/`. A geometria (camadas e faixas, validação, limites) é a mesma nas duas: só muda a pele. Por isso o trabalho que não depende da pele (seções 3, 4, 6 e 7) segue enquanto o dono decide. As fotos e a pergunta vão à sessão principal; uma correção dele entra antes do merge.

## 3. Arquitetura (módulos novos ao lado dos da v2)

| Módulo | Papel | Depende de |
|---|---|---|
| `js/mapa-saber.js` (ES5 UMD, puro) | `oQueSeSabe(briefing)`: origens por código (negação por oração, regra do Google, teto 3) e trava. Sai de `api/_vendas/mapa-padrao.mjs`, que passa a importar daqui. O esboço e o plano padrão leem o mesmo. | nada |
| `js/mapa-layout.js` (ES5 UMD, puro) | plano v3 + `medir(id, largura)` → geometria: `{ W, H, celular, caixas{id:{x,y,w,h}}, setas[{de,para,volta,curva|linha,ponta,rot}], ordem[], cabecalhos[] }`. Camadas e faixas vêm de `BZMapaForma` (já no PR 4); o resto vem de `compor` do laboratório. Sem DOM: no Node os testes medem com um estimador; na tela, `medir` lê a altura real do texto fora da página, antes de inserir. | `BZMapaForma` |
| `js/mapa-desenho.js` (ES5, DOM) | `window.BZMapa = { montar(raiz, plano, opcoes), atualizar(plano, opcoes), parar() }`, **o mesmo contrato do `BZPlanta`** (origem, editavel, aoCerto, aoAjustar, esboco(), som(), notaEmbaixo), para `js/orcamento-planta.js` trocar de módulo sem mudar a cola. Desenha (SVG para traço, HTML para texto), anima por estrutura (seção 5), faz o ajuste (seção 4) e a leitura oculta para o leitor de tela. Os desenhos de origem (10 códigos) moram aqui. | `BZMapaLayout`, `BZPlantaPecas`, `BZPlantaRelogio` |
| `css/orcamento-mapa.css` | pele do mapa; cores por papel por classe de tabela. | tokens |

Na cola (`js/orcamento-planta.js`): a lista de módulos e o CSS passam a ser escolhidos pela versão do plano (`estrutura` = v3, `topologia` = v2), de URLs constantes; a versão desconhecida continua sumindo calada. O v2 baixa o que baixa hoje; o v3 baixa forma do mapa + peças + `mapa-layout` + `mapa-desenho`.

Altura: o v2 tinha "a altura só depende da largura". No v3 a altura depende do plano (de 230 a 428 px a 320 no laboratório). Sem CLS mesmo assim: o quadro é composto e medido fora da página e entra com a altura final, no fim da conversa (nada acima dele se move); no computador a faixa reserva o teto da largura.

## 4. "Ficou certo?" e o ajuste (§7.4)

- Depois do ouro: "Montei o mapa do seu caso. Ficou certo?" e dois toques, **"Está certo"** e **"Quero ajustar algo"**.
- "Está certo" vira uma fala dela na tela, só local: não chama `enviar`, não gasta IA, nada é gravado (ao recarregar, some; o plano continua igual). Hoje ele chama `enviar(TEXTO_CERTO)`; isso muda.
- "Quero ajustar algo" põe o foco na caixa de texto com a dica "Diga o que mudar no mapa." e a mensagem segue como qualquer outra (com as guardas de hoje). Só existe enquanto `planta_editavel`; com o pedido confirmado, some (o servidor já recusa).
- O plano que volta com nó `ajustado`: `atualizar` compara por id. O nó novo cresce pela luz a partir da seta que o liga, com a marca "Ajustado"; os que ficaram deslizam para o lugar novo (FLIP, só transform); nada se refaz. Sem id em comum (v2 → v3), refaz tudo com a entrada.

## 5. O movimento por estrutura (a "obra-prima")

A entrada sempre parte do esboço (voo, como hoje): as estações do esboço voam para os nós que casam com elas (`casar` passa a entender v3: chegada → nós de origem; página → site; conversa → conversa; ação → acao; volta → volta). O resto nasce pela luz.

| Estrutura | A luz conta a história assim |
|---|---|
| `caminho` | uma luz só, do núcleo ao objetivo, nó por nó, com o tique de vidro em cada um. |
| `antes_depois` | primeiro a faixa "Hoje" se desenha em cinza e a luz para na trava (um pulso só, branco); depois a faixa "Com o site" nasce do núcleo e a luz corre por ela, sem parar, até o objetivo. |
| `ramos` | a luz chega no nó que se divide e se parte em duas que correm juntas, uma por ramo; elas se encontram no objetivo. |
| `ciclo` | a luz chega ao objetivo, ele vira ouro, e a luz segue pela seta de volta até fechar o laço; no repouso, um ponto percorre o laço a cada 6 s. |
| `mapa` | as origens acendem juntas e as luzes convergem; cada seta acende quando a luz passa pelo rótulo. |

Ritmo e duração: os do laboratório (240 ms por nó, 480 ms por seta, 900 ms na volta, ouro 420 ms depois) como ponto de partida, afinados com vídeo em câmera lenta. O som: `passa` a cada nó, `ouro` no fim, como hoje.

## 6. O esboço sem tracejado (§7.5)

- O esboço mostra só o que já se sabe: o lugar que ainda não foi entendido não aparece (sai o fantasma tracejado e o "a entender"). Cada estação nova nasce embaixo da última; o cartão cresce para baixo, no fim da conversa.
- A chegada usa `oQueSeSabe` (`js/mapa-saber.js`): Instagram, WhatsApp, indicação, Google (busca e mapa), passa na frente…, com o nome e o desenho da tabela, nunca o código cru. Uma origem negada ("pelo Instagram não") não aparece.
- Ao girar a tela ou mudar a largura, refaz sem animação nem som, como hoje.

## 7. Testes e evidência (nível 3 onde toca `js/orcamento*`; nível 2 nos módulos do desenho)

- `mapa-saber`: os testes de `oQueSeSabe` do PR 4 passam a rodar contra o módulo comum; o esboço e o plano padrão dão as mesmas origens para o mesmo briefing (teste de paridade).
- `mapa-layout`: para os 8 planos padrão, os 3 exemplos do prompt e o caso de limites, em 320, 390, 768 e 1280: nenhuma caixa invade outra, rótulo não cobre caixa nem rótulo, nada sai do quadro, ≤ 440 px no celular com o objetivo dentro. Teste visto vermelho com o vão sabotado.
- `mapa-desenho`: no navegador (Playwright): monta cada estrutura, CLS 0, sem rolagem lateral, leitura oculta completa, movimento reduzido = quadro final, `atualizar` com nó ajustado mexe só no nó novo, pausa com a aba escondida.
- ES5 nos módulos novos; teto de bytes próprio do v3 medido e escrito no teste (o do v2 não muda).
- `docs/e2e-planta.mjs` refeito para o v3, nos dois modos (sem consultor e com IA simulada), incluindo "Está certo" sem turno de IA e "Quero ajustar algo".
- O laboratório passa a usar os módulos reais (o que se aprova é o que vai para a página) e `docs/lab-estruturas-fotos.mjs` vira a conferência visual do PR.
- Revisão de código e de segurança por agentes diferentes; suíte inteira; checks lidos um a um.

## 8. Fatias (um PR por vez, todos atrás da flag)

1. **5a — saber e esboço:** `js/mapa-saber.js` (o servidor passa a importar), o esboço sem fantasma e com as origens novas, `casar` entendendo v3. Não depende da pele.
2. **5b — o desenho:** `mapa-layout`, `mapa-desenho`, CSS, a cola escolhendo módulos pela versão, o movimento por estrutura, o laboratório nos módulos reais, bytes. Depende da direção visual (seção 2).
3. **5c — "Ficou certo?" e o ajuste:** "Está certo" local, "Quero ajustar algo", `atualizar` com nó ajustado, E2E refeito.

Depois: o interruptor local da IA real (PR próprio), o teste com a IA real (5 conversas + o teste C do mapa, ≤ US$ 3, com vídeos) e só então a promoção, com a migração `aceite_versao` aplicada em produção antes.
