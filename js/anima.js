/* ==========================================================================
   ANIMA — a coreografia (GSAP + ScrollTrigger + SplitText), em todas as páginas.

   Vocabulário fechado (DIRECAO-V2 §3): expo.out nas entradas (0,9–1,1s),
   expo.inOut nas coberturas, scrub 0.6 no scroll. Só transform/opacity/
   visibility no DOM. Quando o canvas precisa acompanhar, o GSAP tweena um
   NÚMERO em B.S (`boot`) — nunca uma variável de CSS.

   É aditivo e opcional: sem GSAP, o arquivo sai, js/pagina.js retira
   `html.js` e o site aparece inteiro. Em movimento reduzido: só opacidade,
   curta.
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

  /* ---------- tudo visível, agora (rede de segurança e reduced-motion) ---------- */
  function mostrarTudo() {
    for (var i = 0; i < splits.length; i++) { try { splits[i].revert(); } catch (e) { /* já revertido */ } }
    splits.length = 0;
    gsap.set('.reveal, .hero__status, .hero__eyebrow, .hero__sub, .hero__actions, .hero__rail, .hero__main .fine, .linhas, .nav', { clearProps: 'all' });
    gsap.set('.hero__title, .display', { clearProps: 'all' });
    html.classList.remove('js');
    var todos = document.querySelectorAll('.reveal');
    for (var i = 0; i < todos.length; i++) todos[i].classList.add('is-in');
    B.S.boot = 1;
    B.emit('hero-pronto'); B.emit('entrada-pronta');
  }

  /* ---------- SPLIT com máscara (linhas ou palavras) ----------
     Devolve as peças a animar; `revert` no fim devolve o DOM original (é o
     que mantém a divisão um EVENTO, não um estado). */
  function partir(el, tipo) {
    if (!Split) return null;
    try {
      var sp = new Split(el, { type: tipo, mask: tipo, linesClass: 'split-line', wordsClass: 'split-word' });
      splits.push(sp);
      return sp;
    } catch (e) { return null; }
  }

  /* ---------- BOOT DO HERO: a primeira impressão ----------
     Ordem: a nav desce; o status acende; o display sobe por PALAVRAS atrás da
     máscara enquanto o núcleo (canvas) se traça e abre; subtítulo, ações e
     trilha em cascata, com sobreposição — o olho nunca pega um quadro morto. */
  var feito = false;
  function heroEntra() {
    if (feito) return;
    feito = true;
    if (reduzido) { mostrarTudo(); return; }

    var titulo = document.querySelector('.hero__title, .display');
    var status = document.querySelector('.hero__status');
    var eyebrow = document.querySelector('.hero__eyebrow');
    var sub = document.querySelector('.hero__sub');
    var linhas = document.querySelector('.linhas');
    var acoes = document.querySelector('.hero__actions');
    var fine = document.querySelector('.hero__main .fine');
    var rail = document.querySelector('.hero__rail');
    var nav = document.querySelector('.nav');
    var heroPronto = false;
    var pronto = function () { if (heroPronto) return; heroPronto = true; B.emit('hero-pronto'); };

    try {
      var tl = gsap.timeline({ defaults: { ease: EXPO } });
      /* o instrumento acorda: o canvas lê S.boot */
      tl.to(B.S, { boot: 1, duration: 1.6, ease: 'expo.inOut' }, 0);
      if (nav) tl.to(nav, { opacity: 1, duration: .9 }, 0);
      if (status) tl.fromTo(status, { y: 10 }, { opacity: 1, y: 0, duration: .8 }, .15);
      if (eyebrow) tl.fromTo(eyebrow, { y: 10 }, { opacity: 1, y: 0, duration: .8 }, .15);

      if (titulo) {
        var tipo = titulo.classList.contains('display') ? 'words' : 'lines';
        var sp = partir(titulo, tipo);
        if (sp) {
          var pecas = tipo === 'words' ? sp.words : sp.lines;
          gsap.set(pecas, { yPercent: 112 });
          gsap.set(titulo, { visibility: 'visible' });
          tl.to(pecas, {
            yPercent: 0, duration: tipo === 'words' ? 1.1 : .95,
            stagger: tipo === 'words' ? .07 : .09,
            onComplete: function () { sp.revert(); pronto(); B.emit('remedir'); }
          }, .25);
        } else {
          tl.fromTo(titulo, { visibility: 'visible', opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1, onComplete: pronto }, .25);
        }
      } else pronto();

      if (sub) tl.fromTo(sub, { y: 18 }, { opacity: 1, y: 0, duration: .9 }, '-=.75');
      if (linhas) tl.fromTo(linhas, { y: 14 }, { opacity: 1, y: 0, duration: .9 }, '-=.7');
      if (acoes) tl.fromTo(acoes, { y: 14 }, { opacity: 1, y: 0, duration: .9 }, '-=.7');
      if (fine) tl.to(fine, { opacity: 1, duration: .7 }, '-=.6');
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
     os filhos de malha/índice/lista entram em cascata. O título de seção sobe
     por linhas atrás de máscara: a seção COMEÇA em vez de só estar ali. */
  var jaRevelou = false;
  function marcar(el) {
    el.classList.add('is-in');
    if (el.classList.contains('section__head')) linhasDoTitulo(el);
  }
  function linhasDoTitulo(cabeca) {
    var h = cabeca.querySelector('h2');
    if (!h || h._partido) return;
    h._partido = true;
    var sp = partir(h, 'lines');
    if (!sp) return;
    gsap.from(sp.lines, { yPercent: 108, duration: .95, stagger: .09, ease: EXPO, onComplete: function () { sp.revert(); } });
  }
  function filhos(el) {
    var sel = el.matches('.mesh, .spec, .apps, .indice, .faq-list, .steps, .diag') ? ':scope > *' : null;
    return sel ? el.querySelectorAll(sel) : null;
  }
  function revelar(el, imediato) {
    marcar(el);
    var kids = filhos(el);
    /* ao assentar, quem mede caixas remede: o .reveal nasceu 28px abaixo e
       o cache do kicker (elo da coluna) ficaria deslocado — por evento, uma
       vez por seção */
    gsap.to(el, { opacity: 1, y: 0, duration: imediato ? .6 : .9, ease: EXPO, overwrite: true, onComplete: function () { B.emit('remedir'); } });
    if (kids && kids.length) {
      gsap.fromTo(kids, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .9, ease: EXPO, stagger: { each: .08, grid: 'auto', from: 'start' }, clearProps: 'opacity,transform' });
    }
  }
  function scrollReveals() {
    if (jaRevelou) return;
    jaRevelou = true;
    if (reduzido) return;
    var alvos = [].slice.call(document.querySelectorAll('.reveal'));
    if (!alvos.length) return;
    try {
      gsap.set(alvos, { y: 28 });
      /* o cabeçalho de seção já entra pelas linhas do título: sem deslocamento duplo */
      gsap.set('.section__head.reveal', { y: 0 });
      if (ST && ST.batch) {
        ST.batch(alvos, {
          start: 'clamp(top 86%)', once: true,
          onEnter: function (els) { for (var i = 0; i < els.length; i++) revelar(els[i], false); }
        });
        ST.refresh();
        var vh = window.innerHeight;
        alvos.forEach(function (el) {
          if (el.getBoundingClientRect().top < vh * .86 && !el.classList.contains('is-in')) revelar(el, true);
        });
      } else {
        for (var i = 0; i < alvos.length; i++) revelar(alvos[i], true);
      }
    } catch (e) {
      for (var j = 0; j < alvos.length; j++) { marcar(alvos[j]); gsap.set(alvos[j], { opacity: 1, y: 0 }); }
    }

    /* ---- SCROLL-DRIVEN: o hero cede, as peças estruturais derivam ----
       Só peças que NÃO são texto corrido: o reator (o canvas acompanha a
       caixa), a trilha, o rótulo do barramento. Texto que se move enquanto é
       lido é hostil. Desligado abaixo de 821px (percurso curto demais). */
    if (ST && gsap.matchMedia) {
      try {
        var mm = gsap.matchMedia();
        mm.add('(min-width: 821px)', function () {
          var hero = document.querySelector('.hero');
          if (hero) {
            var main = hero.querySelector('.hero__main');
            /* só deslocamento: texto que ainda está na tela não some enquanto é lido */
            if (main) gsap.to(main, { y: -40, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom 30%', scrub: .6 } });
            var reator = hero.querySelector('.hero__reactor, .palco');
            if (reator) gsap.to(reator, { yPercent: 14, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .6 } });
            var rail = hero.querySelector('.hero__rail');
            if (rail) gsap.to(rail, { yPercent: 10, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .6 } });
          }
        });
      } catch (e) { /* paralaxe é profundidade, não conteúdo */ }
    }
  }
  /* liga depois do boot: não revela cedo demais nem compete com o hero */
  var ligar = function () { setTimeout(scrollReveals, 120); };
  if (document.body.classList.contains('booted')) ligar();
  else B.on('booted', ligar);
  /* rede: nunca deixa conteúdo preso invisível */
  setTimeout(function () { if (!jaRevelou) scrollReveals(); }, 4000);

  /* a entrada terminou de ser armada: quem mede caixas remede (o `.reveal`
     nasceu deslocado 28px) */
  B.on('hero-pronto', function () { setTimeout(function () { B.emit('entrada-pronta'); }, 50); });

  /* ---------- "menos movimento" em tempo de execução ---------- */
  B.on('reduzir', function (sim) {
    if (!sim) return;
    reduzido = true;
    try { if (ST) ST.getAll().forEach(function (t) { t.kill(); }); gsap.globalTimeline.clear(); } catch (e) { /* já foi */ }
    mostrarTudo();
  });
})();
