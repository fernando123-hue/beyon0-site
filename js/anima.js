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

    /* mais lento e suave (pedido do dono): durações maiores, easing gentil */
    var tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    if (status) tl.from(status, { autoAlpha: 0, y: 14, duration: .9 });

    if (window.SplitText && titulo) {
      var split = new window.SplitText(titulo, { type: 'lines', mask: 'lines' });
      tl.from(split.lines, {
        yPercent: 115, duration: 1.5, stagger: .2, ease: 'power3.out',
        onComplete: function () { split.revert(); }   /* devolve o em/aurora intacto */
      }, '-=.35');
    } else if (titulo) {
      tl.from(titulo, { autoAlpha: 0, y: 26, duration: 1.3 }, '-=.35');
    }

    if (sub) tl.from(sub, { autoAlpha: 0, y: 18, duration: 1 }, '-=.8');
    if (acoes) tl.from(acoes.children, { autoAlpha: 0, y: 16, stagger: .14, duration: .9 }, '-=.6');
    if (hint) tl.from(hint, { autoAlpha: 0, duration: .9 }, '-=.3');
  }

  /* dispara quando o conteúdo entra — depois da intro em vídeo (evento 'booted').
     Se já bootou (sem intro), roda agora. immediateRender do gsap.from põe o
     estado inicial no mesmo tick, então não há flash de conteúdo visível. */
  if (document.body.classList.contains('booted')) heroEntra();
  else B.on('booted', heroEntra);

  /* ---------- REVEALS DE SCROLL (incremento 2) ----------
     O GSAP assume os reveals do site (js/dom.js cede quando o GSAP está
     presente — ver a checagem `gsapReveal` lá). Cada `.reveal` sobe e aparece,
     em cascata quando o grupo entra na viewport. Só transform/opacity.
     Segurança: se qualquer coisa falhar aqui, revela tudo na hora (nunca deixa
     conteúdo preso invisível). Pula o que a LINHA (`.revelando`) já cuida. */
  var jaRevelou = false;
  function scrollReveals() {
    if (jaRevelou) return;
    jaRevelou = true;
    var ST = window.ScrollTrigger;
    var alvos = [].slice.call(document.querySelectorAll('.reveal')).filter(function (el) {
      return !el.closest('.revelando');
    });
    if (!alvos.length) return;
    document.documentElement.classList.add('has-gsap');   /* desliga a transição CSS do reveal */
    try {
      gsap.set(alvos, { opacity: 0, y: 28 });
      if (ST && ST.batch) {
        ST.batch(alvos, {
          start: 'top 88%',
          once: true,
          onEnter: function (els) {
            gsap.to(els, { opacity: 1, y: 0, duration: 1.2, stagger: .14, ease: 'power2.out', overwrite: true });
          }
        });
        ST.refresh();
        /* elementos JÁ no/acima do viewport (ex.: F5 no meio da página): o
           onEnter só dispara ao entrar de baixo, então quem já ficou acima seria
           preso invisível ao rolar PARA CIMA. Revela esses na hora. */
        var vh = window.innerHeight;
        alvos.forEach(function (el) {
          if (el.getBoundingClientRect().top < vh * 0.9) {
            gsap.to(el, { opacity: 1, y: 0, duration: .8, ease: 'power2.out', overwrite: true });
          }
        });
      } else {
        gsap.to(alvos, { opacity: 1, y: 0, duration: 1 });   /* sem batch: revela suave */
      }
    } catch (e) {
      gsap.set(alvos, { opacity: 1, y: 0 });                  /* falhou: conteúdo NUNCA fica oculto */
    }

    /* PARALLAX DO REATOR: o núcleo do hero deriva devagar ao rolar (o canvas o
       segue, pois field.js remede o retângulo no scroll). Profundidade sutil. */
    var reator = document.querySelector('.hero__reactor'), hero = document.querySelector('.hero');
    if (ST && reator && hero) {
      try {
        gsap.to(reator, {
          yPercent: 22, ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
        });
      } catch (e) { /* parallax é enfeite: falhar aqui não quebra nada */ }
    }
  }

  /* só depois da entrada (a LINHA/overlay já resolveram): não revela nada cedo
     demais nem compete com a cascata do hero. */
  if (window.ScrollTrigger) {
    B.on('entrada-pronta', scrollReveals);
    /* REDE DE SEGURANÇA: dom.js cedeu os reveals ao GSAP, então se
       'entrada-pronta' nunca vier (entrada.js falhar/sumir), o conteúdo ficaria
       preso invisível. Preso ao 'booted' (+4,5s) — bem depois do caminho normal
       (entrada-pronta vem em booted+2rAF), o `jaRevelou` faz o perdedor virar
       no-op. Espelha a garantia que o dom.js tinha. */
    var guardaBoot = function () { setTimeout(scrollReveals, 4500); };
    if (document.body.classList.contains('booted')) guardaBoot();
    else B.on('booted', guardaBoot);
  }
})();
