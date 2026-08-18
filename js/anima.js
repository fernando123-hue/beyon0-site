/* ==========================================================================
   ANIMA — camada GSAP (entrada cinematográfica + gatilhos de scroll).

   Regras que este arquivo respeita, para NÃO repetir o gargalo que motivou a
   reconstrução (docs/auditoria-performance.md §3):
   1. Só anima transform/opacity — nunca propriedades de layout, nunca variável
      de CSS lida por muitas regras. É compositor, não recálculo de estilo.
   2. É ADITIVO e OPCIONAL: se o GSAP não carregar (CSP, rede), este arquivo sai
      sem tocar em nada — o site já funciona sem ele (o hero nasce visível, os
      reveals têm IntersectionObserver próprio em js/dom.js).
   3. reduced-motion: não anima. O conteúdo aparece direto.

   GSAP é hospedado local (vendor/gsap) porque a CSP é `script-src 'self'`.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  var gsap = window.gsap;
  /* degradação limpa: sem GSAP, sem núcleo, ou movimento reduzido → não faz
     nada. O site inteiro continua de pé; só não ganha o brilho extra. */
  if (!gsap || !B || B.reduced) return;

  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
  if (window.SplitText) gsap.registerPlugin(window.SplitText);
  /* o GSAP tem o próprio ticker (rAF). Ele só trabalha quando há tween ativo —
     as entradas são curtas e o ScrollTrigger é dirigido pelo scroll — então não
     é um "2º loop" gastando por frame em repouso. lagSmoothing(0): sem catch-up
     que atropela quadros depois de uma aba em segundo plano. */
  gsap.ticker.lagSmoothing(0);

  var feito = false;

  /* ---------- ENTRADA DO HERO: a primeira impressão ----------
     O título sobe por LINHAS atrás de uma máscara (SplitText mask), depois vêm
     status, subtítulo, botões e a dica de scroll, em cascata. Split por linha
     (não por caractere) preserva a palavra-aurora; e revert() no fim devolve o
     DOM original, então o gradiente da aurora volta perfeito. */
  function heroEntra() {
    if (feito) return;
    feito = true;

    var titulo = document.querySelector('.hero__title');
    var status = document.querySelector('.hero__status');
    var sub = document.querySelector('.hero__sub');
    var acoes = document.querySelector('.hero__actions');
    var hint = document.querySelector('.scroll-hint');

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    if (status) tl.from(status, { autoAlpha: 0, y: 12, duration: .6 });

    if (window.SplitText && titulo) {
      var split = new window.SplitText(titulo, { type: 'lines', mask: 'lines' });
      tl.from(split.lines, {
        yPercent: 115, duration: 1, stagger: .14, ease: 'power4.out',
        onComplete: function () { split.revert(); }   /* devolve o em/aurora intacto */
      }, '-=.25');
    } else if (titulo) {
      tl.from(titulo, { autoAlpha: 0, y: 24, duration: .9 }, '-=.25');
    }

    if (sub) tl.from(sub, { autoAlpha: 0, y: 16, duration: .7 }, '-=.55');
    if (acoes) tl.from(acoes.children, { autoAlpha: 0, y: 14, stagger: .1, duration: .6 }, '-=.4');
    if (hint) tl.from(hint, { autoAlpha: 0, duration: .6 }, '-=.15');
  }

  /* dispara quando o conteúdo entra — depois da intro em vídeo (evento 'booted').
     Se já bootou (sem intro), roda agora. immediateRender do gsap.from põe o
     estado inicial no mesmo tick, então não há flash de conteúdo visível. */
  if (document.body.classList.contains('booted')) heroEntra();
  else B.on('booted', heroEntra);
})();
