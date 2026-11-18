/* ==========================================================================
   OS PONTOS DO CARROSSEL DOS MODELOS (remodelação do orçamento, parte 2, 18/11; dono: "as pessoas não gostam de ler").
   No celular os três modelos são cartões grandes que deslizam de lado (CSS: rolagem com encaixe, css/orcamento-modelos.css);
   aqui só moram os pontinhos que dizem em qual dos três a pessoa está. Decorativo (aria-hidden): os modelos são uma lista
   comum para quem usa leitor de tela, e o desktop continua com as três colunas (os pontos somem acima de 900 px).
   Sem JS, a rolagem lateral e o encaixe seguem funcionando; só faltam os pontos. Nenhum texto: só classes.
   Um módulo só, para a tela e para o teste (docs/testes/orcamento-modelos-casca.test.mjs). ES5 sintático.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) { raiz.BZOrcCarrossel = api; if (raiz.document) api.ligar(raiz.document); }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* qual cartão está à vista: a rolagem dividida pelo passo de um cartão ao outro, arredondada e presa ao que existe */
  function indiceAtual(rolagem, passo, total) {
    if (!(total > 0)) return 0;
    if (!(passo > 0) || !isFinite(rolagem)) return 0;
    var i = Math.round(rolagem / passo);
    return Math.max(0, Math.min(total - 1, i));
  }

  function ligar(doc) {
    var lista = doc.getElementById('o-dirs'), pontos = doc.getElementById('o-dirs-pontos');
    if (!lista || !pontos || pontos.getAttribute('data-ligado')) return;   /* (uma vez só: chamar de novo não duplica ouvinte nem observador) */
    pontos.setAttribute('data-ligado', '1');
    var quadro = 0;

    function cartoes() { return [].filter.call(lista.children, function (li) { return li.classList && li.classList.contains('dir'); }); }
    function atualizar() {
      quadro = 0;
      var cs = cartoes();
      /* os pontos só fazem sentido com mais de um cartão e a lista rolando de lado (celular) */
      pontos.hidden = !(cs.length > 1 && lista.scrollWidth > lista.clientWidth + 4);
      if (pontos.hidden) return;
      var passo = cs[1].offsetLeft - cs[0].offsetLeft;
      var atual = indiceAtual(lista.scrollLeft, passo, cs.length);
      while (pontos.children.length < cs.length) { var p = doc.createElement('span'); p.className = 'orc-pontos__p'; pontos.appendChild(p); }
      while (pontos.children.length > cs.length) pontos.removeChild(pontos.lastChild);
      [].forEach.call(pontos.children, function (p, i) { p.classList.toggle('is-atual', i === atual); });
    }
    function agendar() { if (!quadro) quadro = (doc.defaultView || window).requestAnimationFrame(atualizar); }

    lista.addEventListener('scroll', agendar, { passive: true });
    (doc.defaultView || window).addEventListener('resize', agendar);
    if (typeof MutationObserver === 'function') new MutationObserver(agendar).observe(lista, { childList: true });
    agendar();
  }

  return Object.freeze({ indiceAtual: indiceAtual, ligar: ligar });
});
