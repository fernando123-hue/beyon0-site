/* ==========================================================================
   A LEITURA MANDA — as zonas onde a rede (js/rede.js) não entra. Uma função
   pura: lê o documento (só em evento: carga, mudança de tamanho) e devolve
   os retângulos em coordenadas da PÁGINA.

   - O TEXTO: todo nó de texto visível, linha a linha (a caixa do bloco
     ocupa a coluna inteira e apagava rede onde não havia letra; uma lista de
     seletores deixava rótulos em span/div de fora). aria-hidden NÃO tira da
     lista: as palavras do H1 (SplitText) e a seta dos links são texto na
     tela. Cada linha é guardada relativa ao bloco e somada à posição de
     LAYOUT dele: a entrada por transform não desloca a medida. Folga: 32 px
     no título principal, 8 no celular, 10 no desktop (16 no celular era para
     os pontos da malha antiga, que liam como acentos; os feixes são traço, e
     com 16 a margem inteira sumia).
   - O MIOLO de botões e cartões (3 px para dentro): a borda continua viva,
     é onde a rede se encaixa; cartões translúcidos também bloqueiam.
   - Zona INTEIRA: a cota e os números da prova (assinatura e dado medido),
     a rota dos passos, os LEDs, o rótulo de seção com a régua dele.
   - HALO de 16 px sem rede em volta do botão principal e dos botões do hero.

   Cada item: { x, y, w, h, folga, inteiro?, halo?, ref? } — `ref`: o
   título fixo (sticky) ou o palco pinado em que ele mora; a rede desloca a
   zona junto (ele fica parado na tela enquanto a página rola). Histórico: as rodadas
   1 a 8 da crítica (docs/restructure/PLANO-AI-CORE.md, seção 16).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;

  var MIOLO = '.btn, .hero__rail, .painel, .cenario, .celula, .qa, .spec__item, .janela, .instrumento';
  var DADO = '.hero__cota, .prova__val, .passos, .console__led, .instrumento__led';
  var FORA = '.nav, .barra';   /* o menu e a barra fixa: a rede já é apagada inteira debaixo deles */

  /* `posicaoDoc(el)`: a posição de layout do elemento na página (de rede.js);
     `refDe(el)`: o título fixo ou palco pinado em que ele mora, ou null */
  B.redeTexto = function (posicaoDoc, celular, refDe) {
    var FOLGA = celular ? 8 : 10, FOLGA_TITULO = 32;
    var zonas = [], i;
    var faixa = document.createRange(), andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var no, pai = null, q = null, caixa = null, folga = FOLGA, ref = null;
    while ((no = andar.nextNode())) {
      if (!no.nodeValue.trim()) continue;
      var el = no.parentElement;
      if (!el) continue;
      if (el !== pai) {
        pai = el;
        q = null;
        if (!el.offsetParent || el.closest(FORA + ', .hero__arte, script, style, noscript')) continue;
        /* o 1º fragmento (num inline que quebra de linha, o offsetLeft é dele;
           a caixa inteira começaria mais à esquerda) */
        q = posicaoDoc(el); caixa = el.getClientRects()[0] || el.getBoundingClientRect(); ref = refDe(el);
        folga = el.closest('h1') ? FOLGA_TITULO : FOLGA;
      }
      if (!q) continue;
      faixa.selectNodeContents(no);
      var linhas = faixa.getClientRects();
      for (var l = 0; l < linhas.length; l++) {
        var r = linhas[l];
        if (r.width < 2 || r.height < 2) continue;
        zonas.push({ x: q.x + r.left - caixa.left, y: q.y + r.top - caixa.top, w: r.width, h: r.height, folga: folga, ref: ref });
      }
    }
    var grupos = [[MIOLO, -3, false], [DADO, 16, true], ['.kicker', 8, true]];
    for (var g = 0; g < grupos.length; g++) {
      var bl = document.querySelectorAll(grupos[g][0]);
      for (i = 0; i < bl.length; i++) {
        var b = bl[i];
        if (!b.offsetWidth || b.closest(FORA)) continue;
        var pb = posicaoDoc(b);
        var largura = b.offsetWidth;
        /* (desktop) o kicker ocupa a linha inteira, mas o texto e a régua dele só o começo: a zona
           inteira cortava o alimentador da estação no meio (js/estacao.js). No celular fica como está */
        if (!celular && g === 2) { var rg = document.createRange(); rg.selectNodeContents(b); largura = Math.min(largura, rg.getBoundingClientRect().width + 80); }
        zonas.push({ x: pb.x, y: pb.y, w: largura, h: b.offsetHeight, folga: grupos[g][1], inteiro: grupos[g][2], ref: refDe(b) });
      }
    }
    var prim = document.querySelectorAll('.btn--primary, .hero .btn');
    for (i = 0; i < prim.length; i++) {
      if (!prim[i].offsetWidth || prim[i].closest(FORA)) continue;
      var pp = posicaoDoc(prim[i]);
      zonas.push({ x: pp.x, y: pp.y, w: prim[i].offsetWidth, h: prim[i].offsetHeight, folga: 16, halo: true, ref: refDe(prim[i]) });
    }
    return zonas;
  };

  /* quem fica parado na tela enquanto a página rola: os títulos fixos
     (sticky) e o palco pinado (B.pino, de js/anima.js). A rede desloca as
     zonas e os cantos deles por `d` a cada quadro */
  B.redeTexto.grudes = function (posicaoDoc) {
    var lista = [], cand = document.querySelectorAll('.section__head');
    for (var i = 0; i < cand.length; i++) {
      var el = cand[i], cs = getComputedStyle(el);
      if (cs.position !== 'sticky' || !el.offsetWidth) continue;
      var topo = parseFloat(cs.top) || 0, pai = el.parentElement;
      var nat = posicaoDoc(el).y, fimPai = posicaoDoc(pai).y + pai.offsetHeight - el.offsetHeight;
      lista.push({ el: el, inicio: nat - topo, fim: fimPai - topo, d: 0 });
    }
    if (B.pino) lista.push({ el: B.pino.el, inicio: B.pino.inicio, fim: B.pino.fim, d: 0, pino: true });
    return lista;
  };
  /* a medida vê a posição NATURAL dos títulos fixos: soltos (static) só
     durante a leitura, na mesma tarefa, sem pintura no meio; devolve quem
     os prende de novo */
  B.redeTexto.soltar = function () {
    var soltos = [], cand = document.querySelectorAll('.section__head');
    for (var i = 0; i < cand.length; i++) if (getComputedStyle(cand[i]).position === 'sticky') { cand[i].style.position = 'static'; soltos.push(cand[i]); }
    return function () { for (var j = 0; j < soltos.length; j++) soltos[j].style.position = ''; };
  };
})();
