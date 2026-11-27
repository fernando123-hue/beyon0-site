/* O DESENHO DA CENA NA TELA (Mapa vivo v2, Fase 2, PR 2): o que js/cena-tracos.js calculou vira um SVG em traço de 1px (css/orcamento-cena.css).
   Decorativo (aria-hidden): quem usa leitor de tela segue pela conversa. Uma sequência de entrada só: cada grupo entra na ORDEM da geometria
   (sala, móvel, pessoas uma a uma, canais, oferta, destaque), só opacity e transform, uma vez; com movimento reduzido, o quadro final.
   SEGURANÇA: nenhum texto entra no desenho; os caminhos vêm da geometria (só números e comandos), as classes de uma tabela fixa por papel, a
   posição e a escala são números conferidos. ES5: window.BZCenaDesenho; CommonJS no Node (para o teste com DOM de mentira). Nunca lança. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZCenaDesenho = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CLASSE = { piso: 'cena__piso', sala: 'cena__sala', movel: 'cena__movel', gente: 'cena__gente', canal: 'cena__canal', oferta: 'cena__oferta', destaque: 'cena__destaque' };
  var CAMINHO = /^[MLHVCSQTAZmlhvcsqtaz0-9 .,-]+$/;
  var numero = function (v, padrao) { return typeof v === 'number' && isFinite(v) ? v : padrao; };

  function limpar(alvo) { while (alvo.firstChild) alvo.removeChild(alvo.firstChild); }

  /* desenhar(doc, alvo, desenho) -> o <svg> posto dentro de alvo (o que havia sai), ou null. desenho = BZCenaTracos.tracosDaCena(cena) */
  function desenhar(doc, alvo, desenho) {
    try {
      if (!doc || !alvo || !desenho || !desenho.grupos || typeof desenho.grupos.length !== 'number') return null;
      limpar(alvo);
      var svg = doc.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'cena');
      svg.setAttribute('viewBox', '0 0 320 120');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      for (var i = 0; i < desenho.grupos.length; i++) {
        var g = desenho.grupos[i];
        if (!g || !Object.prototype.hasOwnProperty.call(CLASSE, g.papel)) continue;
        /* o de fora anima (a transformação do CSS substituiria a do SVG); o de dentro posiciona */
        var fora = doc.createElementNS(NS, 'g');
        fora.setAttribute('class', 'cena__g ' + CLASSE[g.papel]);
        fora.style.setProperty('--cena-ordem', String(numero(g.ordem, 0)));
        var dentro = doc.createElementNS(NS, 'g');
        var x = numero(g.x, 0), y = numero(g.y, 0), s = numero(g.escala, 1);
        if (x || y || s !== 1) dentro.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + s + ')');
        for (var j = 0; j < (g.tracos || []).length; j++) {
          var tr = g.tracos[j];
          if (!tr || typeof tr.d !== 'string' || !CAMINHO.test(tr.d)) continue;
          var p = doc.createElementNS(NS, 'path');
          p.setAttribute('d', tr.d);
          if (tr.ac === true) p.setAttribute('class', 'cena__ac');
          dentro.appendChild(p);
        }
        fora.appendChild(dentro);
        svg.appendChild(fora);
      }
      alvo.appendChild(svg);
      return svg;
    } catch (x) { return null; }
  }

  return Object.freeze({ desenhar: desenhar });
});
