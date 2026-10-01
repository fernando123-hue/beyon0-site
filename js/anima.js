/* ==========================================================================
   ANIMA — a coreografia (GSAP + ScrollTrigger + SplitText), em todas as páginas.

   Vocabulário fechado (DIRECAO-V4 §1): o boot do hero é a assinatura — o
   feixe atravessa a tela enquanto o título é impresso atrás da máscara, a
   marca e a ênfase acendem quando a luz passa, o console/instrumento pousa
   linha a linha e a trilha se desenha. Depois, cada bloco entra uma vez ao
   rolar (classe `is-in`, css/motion.css decide a forma de cada componente)
   com cascata curta nos filhos. Só transform/opacity/visibility no DOM.

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
  var LIT = '.hero__title em, .wordmark b, .hero__rail';

  function acender(sel) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) els[i].classList.add('is-lit'); }

  /* ---------- tudo visível, agora (rede de segurança e reduced-motion) ---------- */
  function mostrarTudo() {
    for (var i = 0; i < splits.length; i++) { try { splits[i].revert(); } catch (e) { /* já revertido */ } }
    splits.length = 0;
    /* os filhos em cascata também: um reduzir() no meio da cascata deixava
       .qa/.celula com opacity parcial ou zero para sempre (achado da revisão) */
    gsap.set('.reveal, .reveal > *, .hero__rail > *, .console__linha > *, .nav__links > *, .feixe__linha, .hero__title, ' + HERO_PECAS, { clearProps: 'all' });
    html.classList.remove('js');
    acender(LIT);
    var todos = document.querySelectorAll('.reveal, .console');
    for (var j = 0; j < todos.length; j++) todos[j].classList.add('is-in');
    var feixe = document.querySelector('.feixe');
    if (feixe) feixe.classList.add('is-loop');
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

  /* ---------- CONTAGEM até o valor medido (nunca além dele) ----------
     Lê o texto final já escrito por js/pagina.js ("0.52 s", "282 KB") e sobe
     de zero até ele. `data-contando` avisa o medidor para não sobrescrever. */
  function contar(el, duracao, atraso) {
    var m = /^([\d.,]+)(.*)$/.exec(el.textContent.trim());
    if (!m || el.hasAttribute('data-contando')) return;
    var fim = parseFloat(m[1].replace(',', '.')), sufixo = m[2];
    if (!isFinite(fim) || fim <= 0) return;
    var casas = (m[1].split(/[.,]/)[1] || '').length;
    var obj = { v: 0 };
    el.setAttribute('data-contando', '');
    gsap.fromTo(obj, { v: 0 }, {
      v: fim, duration: duracao || 1.1, delay: atraso || 0, ease: 'power3.out',
      onUpdate: function () { el.textContent = obj.v.toFixed(casas) + sufixo; },
      onComplete: function () { el.textContent = m[0]; el.removeAttribute('data-contando'); }
    });
  }

  /* ---------- BOOT DO HERO: a assinatura ----------
     0,00 o feixe parte da esquerda; a nav desce; 0,05 o título sobe por linhas
     atrás da máscara; 0,35 o LED pousa; 0,6 a marca acende; 1,0 a ênfase
     acende (a luz passou por ela); 1,05 a arte pousa linha a linha; 1,5 a
     trilha se desenha; 1,7 o feixe entra em loop. */
  var feito = false;
  function heroEntra() {
    if (feito) return;
    feito = true;
    if (reduzido) { mostrarTudo(); return; }

    var titulo = document.querySelector('.hero__title');
    var status = document.querySelector('.hero__status');
    var dot = status && status.querySelector('.dot');
    var sub = document.querySelector('.hero__sub');
    var acoes = document.querySelector('.hero__actions');
    var fine = document.querySelector('.hero__fine');
    var arte = document.querySelector('.hero__arte');
    var rail = document.querySelector('.hero__rail');
    var nav = document.querySelector('.nav');
    var feixe = document.querySelector('.feixe');
    var linha = feixe && feixe.querySelector('.feixe__linha');
    var consoleEl = arte && arte.querySelector('.console');

    try {
      var tl = gsap.timeline({ defaults: { ease: EXPO } });
      if (linha) tl.fromTo(linha, { x: '-6vw' }, { x: '106vw', duration: 1.6, ease: 'power2.inOut' }, 0);
      if (nav) {
        tl.to(nav, { opacity: 1, duration: .5 }, 0);
        tl.from(nav.querySelectorAll('.nav__links > *'), { y: -8, opacity: 0, duration: .8, stagger: .05, clearProps: 'all' }, .15);
      }
      if (status) tl.fromTo(status, { y: 10 }, { opacity: 1, y: 0, duration: .8 }, .1);
      if (dot) tl.from(dot, { scale: 0, duration: .4, ease: 'back.out(2)', clearProps: 'transform' }, .35);

      if (titulo) {
        var sp = partir(titulo);
        if (sp && sp.lines.length) {
          /* O TÍTULO É O LCP. Já pinta parte do texto no primeiro quadro; a
             máscara faz o resto da subida enquanto a luz passa. */
          gsap.set(sp.lines, { yPercent: 60 });
          gsap.set(titulo, { visibility: 'visible' });
          /* a ênfase acende DEPOIS do revert: o SplitText devolve o <em> original */
          tl.to(sp.lines, { yPercent: 0, duration: 1.05, stagger: .09, onComplete: function () { sp.revert(); acender('.hero__title em'); } }, .05);
        } else {
          tl.fromTo(titulo, { visibility: 'visible', opacity: .35, y: 16 }, { opacity: 1, y: 0, duration: .8 }, .05);
        }
      }
      tl.add(function () { acender('.wordmark b'); }, .6);
      tl.add(function () { if (!sp || !sp.lines.length) acender('.hero__title em'); }, 1.0);

      if (sub) tl.fromTo(sub, { y: 18 }, { opacity: 1, y: 0, duration: .9 }, .55);
      if (acoes) tl.fromTo(acoes, { y: 14 }, { opacity: 1, y: 0, duration: .9 }, .7);
      if (fine) tl.to(fine, { opacity: 1, duration: .7 }, .85);

      if (arte) {
        if (consoleEl) {
          /* o console pousa linha a linha (clip pelo overflow hidden da linha) */
          tl.to(arte, { opacity: 1, duration: .01 }, 1.05);
          tl.from(consoleEl.querySelectorAll('.console__linha > *'), { yPercent: 100, duration: .6, stagger: .09, clearProps: 'transform' }, 1.05);
          tl.add(function () { consoleEl.classList.add('is-in'); }, 1.1);
        } else {
          tl.fromTo(arte, { y: 24, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: 1.1, clearProps: 'transform' }, 1.05);
        }
      }
      /* as medidas do hero contam até o valor medido */
      tl.add(function () {
        var els = document.querySelectorAll('.hero [data-metrica="carga"], .hero [data-metrica="peso"]');
        for (var i = 0; i < els.length; i++) contar(els[i], 1.1, 0);
      }, 1.4);
      if (rail) {
        tl.to(rail, { opacity: 1, duration: .01 }, 1.5);
        tl.from(rail.children, { opacity: 0, y: 10, duration: .8, stagger: .07, clearProps: 'opacity,transform' }, '<');
        tl.add(function () { rail.classList.add('is-lit'); }, 1.5);
      }
      tl.add(function () {
        if (linha) gsap.set(linha, { clearProps: 'transform' });
        if (feixe) feixe.classList.add('is-loop');
      }, 1.7);
    } catch (e) {
      mostrarTudo();
    }
  }
  if (document.body.classList.contains('booted')) heroEntra();
  else B.on('booted', heroEntra);

  /* ---------- ENTRADAS POR SEÇÃO ----------
     Cada `.reveal` sobe e aparece quando entra (uma vez). Dentro de cada um,
     os filhos entram em cascata; a cascata é mais lenta onde o CSS desenha
     algo antes do texto (trilho dos passos, régua do laudo). O título de
     seção sobe por linhas atrás de máscara. A classe `is-in` aciona a
     régua, a varredura e as entradas por componente (css/motion.css). */
  var jaRevelou = false;
  var COM_FILHOS = '.servicos, .prova, .passos, .laudo, .malha, .cenarios, .faq-list, .spec';
  var CASCATA = { '.passos': .3, '.laudo': .1 };
  function marcar(el) {
    el.classList.add('is-in');
    if (el.classList.contains('section__head') || el.parentNode.classList.contains('conversa')) linhasDoTitulo(el);
    if (el.classList.contains('prova')) {
      var vals = el.querySelectorAll('[data-metrica="carga"], [data-metrica="peso"]');
      for (var i = 0; i < vals.length; i++) contar(vals[i], 1.1, .15 * i);
    }
  }
  function linhasDoTitulo(cabeca) {
    var h = cabeca.querySelector('h2');
    if (!h || h._partido) return;
    h._partido = true;
    var sp = partir(h);
    if (!sp || !sp.lines.length) return;
    gsap.from(sp.lines, { yPercent: 108, duration: .95, stagger: .09, ease: EXPO, onComplete: function () { sp.revert(); } });
  }
  function cadaDe(el) {
    for (var k in CASCATA) if (el.matches(k)) return CASCATA[k];
    return .07;
  }
  function revelar(el, imediato) {
    marcar(el);
    var kids = el.matches(COM_FILHOS) ? el.children : null;
    gsap.to(el, { opacity: 1, y: 0, duration: imediato ? .6 : .9, ease: EXPO, overwrite: true });
    if (kids && kids.length) {
      gsap.fromTo(kids, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .9, ease: EXPO, stagger: { each: cadaDe(el), grid: 'auto', from: 'start' }, clearProps: 'opacity,transform' });
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

    /* ---- desktop: a arte e a luz respondem à rolagem (o texto, nunca) e o
       console inclina ao ponteiro. Só transform/opacity no compositor. ---- */
    if (gsap.matchMedia) {
      try {
        var mm = gsap.matchMedia();
        mm.add('(min-width: 861px) and (prefers-reduced-motion: no-preference)', function () {
          var hero = document.querySelector('.hero');
          if (!hero || !ST) return;
          var arte = hero.querySelector('.hero__arte'), feixe = hero.querySelector('.feixe');
          if (arte) gsap.to(arte, { yPercent: -12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .8 } });
          if (feixe) gsap.to(feixe, { opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: '40% top', end: 'bottom top', scrub: true } });
        });
        mm.add('(min-width: 861px) and (hover: hover) and (prefers-reduced-motion: no-preference)', function () {
          var hero = document.querySelector('.hero'), consoleEl = document.querySelector('.console');
          if (!hero || !consoleEl) return;
          var rx = gsap.quickTo(consoleEl, 'rotationX', { duration: .9, ease: 'power3' });
          var ry = gsap.quickTo(consoleEl, 'rotationY', { duration: .9, ease: 'power3' });
          var mover = function (e) { ry((e.clientX / window.innerWidth - .5) * 10); rx(-(e.clientY / window.innerHeight - .5) * 6); };
          var sair = function () { ry(0); rx(0); };
          hero.addEventListener('pointermove', mover, { passive: true });
          hero.addEventListener('pointerleave', sair, { passive: true });
          return function () { hero.removeEventListener('pointermove', mover); hero.removeEventListener('pointerleave', sair); sair(); };
        });
      } catch (e) { /* profundidade é acréscimo, não conteúdo */ }
    }
  }
  /* liga depois do boot: não revela cedo demais nem compete com o hero */
  var ligar = function () { setTimeout(scrollReveals, 120); };
  if (document.body.classList.contains('booted')) ligar();
  else B.on('booted', ligar);
  /* rede: nunca deixa conteúdo preso invisível */
  setTimeout(function () { if (!jaRevelou) scrollReveals(); }, 4000);

  /* ---------- FAQ: a resposta entra, em vez de saltar ---------- */
  var qas = document.querySelectorAll('.qa');
  for (var q = 0; q < qas.length; q++) {
    (function (qa) {
      qa.addEventListener('toggle', function () {
        if (!qa.open || reduzido) return;
        var a = qa.querySelector('.qa__a');
        if (a) gsap.fromTo(a, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: .45, ease: EXPO, clearProps: 'all' });
      });
    })(qas[q]);
  }

  /* ---------- "menos movimento" em tempo de execução ---------- */
  B.on('reduzir', function (sim) {
    if (!sim) return;
    reduzido = true;
    try { if (ST) ST.getAll().forEach(function (t) { t.kill(); }); gsap.globalTimeline.clear(); } catch (e) { /* já foi */ }
    mostrarTudo();
  });
})();
