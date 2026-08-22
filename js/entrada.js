/* ==========================================================================
   ENTRADA — nível 1: dispara a LINHA uma única vez por carregamento.

   NÃO é reveal por scroll. NÃO usa IntersectionObserver. É uma checagem
   ÚNICA, no boot, da seção que está na viewport AGORA — e aplica nela a
   mesma linha + cascata do hero. Depois disso, nunca mais.

   O hero é tratado pelo CSS via `.booted` (quando se carrega no topo). Aqui
   só as OUTRAS `.section`: se o usuário deu F5 no meio/fim, a seção visível
   recebe `.revelando` (a linha) e um stagger `--rd` nos filhos `.reveal`.

   TIMING CRÍTICO: a checagem espera dois sinais — (1) `.booted` (js/core.js
   sinaliza o documento pronto) e (2) o scroll já restaurado pelo navegador.
   No F5 no meio da página o navegador
   restaura a posição DEPOIS do parse; ler `getBoundingClientRect` cedo
   demais veria tudo no topo e concluiria "estou no hero" por engano. Por
   isso espera `load` + dois requestAnimationFrame, quando a restauração
   já foi aplicada e pintada.

   Ao terminar a checagem, emite 'entrada-pronta' — js/dom.js só liga o
   IntersectionObserver do reveal sutil (nível 2) depois disso, pra não
   revelar por baixo do overlay nem competir com a linha.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B) return;

  /* reduced-motion: sem linha. O nível 2 (dom.js) destrava sozinho porque
     não espera 'entrada-pronta' quando B.reduced. Nada a fazer aqui. */
  if (B.reduced) return;

  var booted = false, feito = false;

  function checar() {
    if (feito) return;
    feito = true;

    /* emite 'entrada-pronta' SEMPRE, mesmo se a medição lançar — senão o IO
       de nível 2 (dom.js) ficaria preso esperando um sinal que não vem.
       (dom.js ainda tem um fallback próprio, mas a garantia começa aqui.) */
    try {
      var h = window.innerHeight;
      var secoes = document.querySelectorAll('main > .section');
      for (var i = 0; i < secoes.length; i++) {
        var sec = secoes[i];
        var r = sec.getBoundingClientRect();
        if (r.top < h && r.bottom > 0) revelar(sec);   /* intersecta a viewport */
      }
    } finally {
      B.emit('entrada-pronta');
    }
  }

  function revelar(sec) {
    var els = sec.querySelectorAll('.reveal');
    for (var i = 0; i < els.length; i++) {
      els[i].style.setProperty('--rd', (i * 90) + 'ms');   /* cascata, escrita UMA vez */
    }
    sec.classList.add('revelando');
  }

  /* espera load + 2 rAF: garante que a restauração de scroll do F5 já foi
     aplicada antes de medir os retângulos das seções */
  function aposScrollRestaurado(fn) {
    function doisFrames() { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }
    if (document.readyState === 'complete') doisFrames();
    else window.addEventListener('load', doisFrames, { once: true });
  }

  function quandoBooted() {
    if (booted) return;
    booted = true;
    aposScrollRestaurado(checar);
  }

  if (document.body.classList.contains('booted')) quandoBooted();
  else B.on('booted', quandoBooted);
})();
