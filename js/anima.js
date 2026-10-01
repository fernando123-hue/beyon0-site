/* ==========================================================================
   ANIMA — a coreografia (GSAP + ScrollTrigger + SplitText), em todas as páginas.

   Vocabulário fechado (DIRECAO-V4 §1): expo.out nas entradas (0,9–1,1s), por
   linha mascarada; cascata curta nos filhos de lista/grade; a classe `is-in`
   aciona a régua do kicker e a varredura do painel (css/motion.css). Só
   transform/opacity/visibility no DOM. Sem scrub: no celular o percurso é
   curto e texto que se move enquanto é lido é hostil.

   É aditivo e opcional: sem GSAP, o arquivo sai, js/pagina.js retira
   `html.js` e o site aparece inteiro. Em movimento reduzido: tudo visível.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON, gsap = window.gsap, html = document.documentElement;
  if (!gsap || !B) { html.classList.remove('js'); return; }

  var ST = window.ScrollTrigger, Split = window.SplitText;
  if (ST) gsap.registerPlugin(ST);
  if (Split) gsap.registerPlugin(Split);
  gsap.ticker.lagSmoothing(0);
  html.classList.add('has-gsap');

  var EXPO = 'expo.out';
  var reduzido = B.reduced;
  var splits = [];   /* todo SplitText vivo, para reverter se o movimento for reduzido no meio */
  var HERO_PECAS = '.hero__status, .hero__sub, .hero__actions, .hero__fine, .hero__arte, .hero__rail, .nav';

  /* ---------- tudo visível, agora (rede de segurança e reduced-motion) ---------- */
  function mostrarTudo() {
    for (var i = 0; i < splits.length; i++) { try { splits[i].revert(); } catch (e) { /* já revertido */ } }
    splits.length = 0;
    /* os filhos em cascata também: um reduzir() no meio da cascata deixava
       .qa/.celula com opacity parcial ou zero para sempre (achado da revisão) */
    gsap.set('.reveal, .reveal > *, .hero__rail > *, .hero__title, ' + HERO_PECAS, { clearProps: 'all' });
    html.classList.remove('js');
    var todos = document.querySelectorAll('.reveal');
    for (var j = 0; j < todos.length; j++) todos[j].classList.add('is-in');
  }

  /* ---------- SPLIT por linhas com máscara ----------
     `revert` no fim devolve o DOM original (a divisão é um EVENTO, não um estado). */
  function partir(el) {
    if (!Split) return null;
    try {
      var sp = new Split(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      splits.push(sp);
      return sp;
    } catch (e) { return null; }
  }

  /* ---------- BOOT DO HERO: a primeira impressão ----------
     A nav desce; o eyebrow acende; o título sobe por LINHAS atrás da máscara;
     subtítulo, ações, prova e a arte em cascata, com sobreposição. */
  var feito = false;
  function heroEntra() {
    if (feito) return;
    feito = true;
    if (reduzido) { mostrarTudo(); return; }

    var titulo = document.querySelector('.hero__title');
    var eyebrow = document.querySelector('.hero__status');
    var sub = document.querySelector('.hero__sub');
    var acoes = document.querySelector('.hero__actions');
    var prova = document.querySelector('.hero__fine');
    var rail = document.querySelector('.hero__rail');
    var arte = document.querySelector('.hero__arte');
    var nav = document.querySelector('.nav');

    try {
      var tl = gsap.timeline({ defaults: { ease: EXPO } });
      if (nav) tl.to(nav, { opacity: 1, duration: .9 }, 0);
      if (eyebrow) tl.fromTo(eyebrow, { y: 10 }, { opacity: 1, y: 0, duration: .8 }, .1);

      if (titulo) {
        var sp = partir(titulo);
        if (sp && sp.lines.length) {
          /* O TÍTULO É O LCP. Começa a 60% (já pinta parte do texto no primeiro
             quadro) e sem atraso; a máscara faz o resto da subida. */
          gsap.set(sp.lines, { yPercent: 60 });
          gsap.set(titulo, { visibility: 'visible' });
          tl.to(sp.lines, { yPercent: 0, duration: .95, stagger: .09, onComplete: function () { sp.revert(); } }, .05);
        } else {
          tl.fromTo(titulo, { visibility: 'visible', opacity: .35, y: 16 }, { opacity: 1, y: 0, duration: .8 }, .05);
        }
      }

      if (sub) tl.fromTo(sub, { y: 18 }, { opacity: 1, y: 0, duration: .9 }, '-=.75');
      if (acoes) tl.fromTo(acoes, { y: 14 }, { opacity: 1, y: 0, duration: .9 }, '-=.7');
      if (prova) tl.to(prova, { opacity: 1, duration: .7 }, '-=.6');
      if (arte) tl.fromTo(arte, { y: 24, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: 1.1, clearProps: 'transform' }, .35);
      if (rail) {
        tl.to(rail, { opacity: 1, duration: .01 }, '-=.5');
        tl.from(rail.children, { opacity: 0, y: 10, duration: .8, stagger: .07, clearProps: 'opacity,transform' }, '<');
      }
    } catch (e) {
      mostrarTudo();
    }
  }
  if (document.body.classList.contains('booted')) heroEntra();
  else B.on('booted', heroEntra);

  /* ---------- ENTRADAS POR SEÇÃO ----------
     Cada `.reveal` sobe e aparece quando entra (uma vez). Dentro de cada um,
     os filhos de lista/grade entram em cascata curta. O título de seção sobe
     por linhas atrás de máscara. A classe `is-in` aciona a régua e a varredura. */
  var jaRevelou = false;
  var COM_FILHOS = '.servicos, .prova, .passos, .laudo, .malha, .cenarios, .faq-list, .spec';
  function marcar(el) {
    el.classList.add('is-in');
    if (el.classList.contains('section__head') || el.parentNode.classList.contains('conversa')) linhasDoTitulo(el);
  }
  function linhasDoTitulo(cabeca) {
    var h = cabeca.querySelector('h2');
    if (!h || h._partido) return;
    h._partido = true;
    var sp = partir(h);
    if (!sp || !sp.lines.length) return;
    gsap.from(sp.lines, { yPercent: 108, duration: .95, stagger: .09, ease: EXPO, onComplete: function () { sp.revert(); } });
  }
  function revelar(el, imediato) {
    marcar(el);
    var kids = el.matches(COM_FILHOS) ? el.children : null;
    gsap.to(el, { opacity: 1, y: 0, duration: imediato ? .6 : .9, ease: EXPO, overwrite: true });
    if (kids && kids.length) {
      gsap.fromTo(kids, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .9, ease: EXPO, stagger: { each: .07, grid: 'auto', from: 'start' }, clearProps: 'opacity,transform' });
    }
  }
  function scrollReveals() {
    if (jaRevelou) return;
    jaRevelou = true;
    if (reduzido) return;
    var alvos = [].slice.call(document.querySelectorAll('.reveal'));
    if (!alvos.length) return;
    try {
      gsap.set(alvos, { y: 24 });
      /* o cabeçalho de seção já entra pelas linhas do título: sem deslocamento duplo */
      gsap.set('.section__head.reveal', { y: 0 });
      if (ST && ST.batch) {
        ST.batch(alvos, {
          start: 'clamp(top 88%)', once: true,
          onEnter: function (els) { for (var i = 0; i < els.length; i++) revelar(els[i], false); }
        });
        ST.refresh();
        var vh = window.innerHeight;
        alvos.forEach(function (el) {
          if (el.getBoundingClientRect().top < vh * .88 && !el.classList.contains('is-in')) revelar(el, true);
        });
      } else {
        for (var i = 0; i < alvos.length; i++) revelar(alvos[i], true);
      }
    } catch (e) {
      for (var j = 0; j < alvos.length; j++) { marcar(alvos[j]); gsap.set(alvos[j], { opacity: 1, y: 0 }); }
    }
  }
  /* liga depois do boot: não revela cedo demais nem compete com o hero */
  var ligar = function () { setTimeout(scrollReveals, 120); };
  if (document.body.classList.contains('booted')) ligar();
  else B.on('booted', ligar);
  /* rede: nunca deixa conteúdo preso invisível */
  setTimeout(function () { if (!jaRevelou) scrollReveals(); }, 4000);

  /* ---------- "menos movimento" em tempo de execução ---------- */
  B.on('reduzir', function (sim) {
    if (!sim) return;
    reduzido = true;
    try { if (ST) ST.getAll().forEach(function (t) { t.kill(); }); gsap.globalTimeline.clear(); } catch (e) { /* já foi */ }
    mostrarTudo();
  });
})();
