/* ==========================================================================
   ANIMA — a coreografia (GSAP + ScrollTrigger + SplitText), em todas as páginas.

   A assinatura (DIRECAO-V4 §1): "a luz passa e imprime". No boot, uma faixa
   de luz atravessa o hero da esquerda para a direita em tempo LINEAR, e cada
   peça acende no instante em que a faixa cruza a posição dela na tela
   (tFeixe): as palavras do título sobem atrás da máscara coluna a coluna, o
   LED pousa, a marca acende, o console imprime, a aresta da trilha se
   desenha debaixo da luz. Depois a faixa segue em loop, em fase com a
   aresta. Ao rolar, cada bloco entra uma vez (classe `is-in`;
   css/motion.css desenha a entrada própria de cada componente) e só o
   conteúdo se move, nunca o contêiner. Só transform/opacity/visibility.

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
  var LIMPAR = '.reveal, .reveal > *, .section__head > *, .hero__rail > *, .hero__rail-aresta, .conversa__regua, .console__linha > *, .console__medida, .nav__links > *, .feixe__linha, .hero__title, .split-word, ' + HERO_PECAS;

  function acender(sel) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) els[i].classList.add('is-lit'); }

  /* ---------- tudo visível, agora (rede de segurança e reduced-motion) ---------- */
  function mostrarTudo() {
    for (var i = 0; i < splits.length; i++) { try { splits[i].revert(); } catch (e) { /* já revertido */ } }
    splits.length = 0;
    /* os filhos em cascata também: um reduzir() no meio da cascata deixava
       .qa/.celula com opacity parcial ou zero para sempre (achado da revisão) */
    gsap.set(LIMPAR, { clearProps: 'all' });
    html.classList.remove('js');
    acender('.hero__title, h2, .wordmark b');
    var todos = document.querySelectorAll('.reveal, .console');
    for (var j = 0; j < todos.length; j++) todos[j].classList.add('is-in');
    var feixe = document.querySelector('.feixe');
    if (feixe) feixe.classList.add('is-loop');
  }

  /* ---------- SPLIT com máscara ----------
     `revert` no fim devolve o DOM original (a divisão é um EVENTO, não um estado). */
  function partir(el, tipo) {
    if (!Split) return null;
    try {
      var sp = tipo === 'words'
        ? new Split(el, { type: 'lines,words', mask: 'words', linesClass: 'split-line', wordsClass: 'split-word' })
        : new Split(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      splits.push(sp);
      return sp;
    } catch (e) { return null; }
  }

  /* ---------- CONTAGEM até o valor medido (nunca além dele) ----------
     Lê o texto final já escrito por js/pagina.js ("0.52 s", "282 KB") e sobe
     de zero até ele. Na prova o número vive num <b> e a unidade num <small>:
     a contagem escreve só no <b>. `data-contando` avisa o medidor. */
  function contar(el, duracao, atraso) {
    var alvo = el.querySelector('b') || el;
    var m = /^([\d.,]+)(.*)$/.exec(alvo.textContent.trim());
    if (!m || el.hasAttribute('data-contando')) return;
    var fim = parseFloat(m[1].replace(',', '.')), sufixo = m[2];
    if (!isFinite(fim) || fim <= 0) return;
    var casas = (m[1].split(/[.,]/)[1] || '').length;
    var obj = { v: 0 };
    el.setAttribute('data-contando', '');
    gsap.fromTo(obj, { v: 0 }, {
      v: fim, duration: duracao || 1.1, delay: atraso || 0, ease: 'power3.out',
      onUpdate: function () { alvo.textContent = obj.v.toFixed(casas) + sufixo; },
      onComplete: function () { alvo.textContent = m[0]; el.removeAttribute('data-contando'); }
    });
  }

  /* ---------- A ARTE (console / janela / instrumento) imprime ----------
     No desktop faz parte do boot (no instante do feixe); no celular entra
     quando aparece na tela, com gatilho próprio. */
  function imprimirArte(arte, tl, t0) {
    var consoleEl = arte.querySelector('.console');
    var alvoTl = tl || gsap.timeline();
    if (consoleEl) {
      var pecas = consoleEl.querySelectorAll('.console__medida, .console__topo, .console__linha > *');
      alvoTl.to(arte, { opacity: 1, duration: .01 }, t0);
      alvoTl.fromTo(pecas, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .5, ease: EXPO, stagger: .07, clearProps: 'transform,opacity' }, t0);
      alvoTl.add(function () { consoleEl.classList.add('is-in'); }, t0 + .05);
    } else {
      alvoTl.fromTo(arte, { y: 24 }, { opacity: 1, y: 0, duration: 1, ease: EXPO, clearProps: 'transform' }, t0);
    }
    alvoTl.add(function () {
      var els = arte.querySelectorAll('[data-metrica="carga"], [data-metrica="peso"]');
      for (var i = 0; i < els.length; i++) contar(els[i], 1.1, 0);
    }, t0 + .3);
  }

  /* ---------- BOOT DO HERO: a luz passa e imprime ---------- */
  var feito = false;
  function heroEntra() {
    if (feito) return;
    feito = true;
    if (reduzido) { mostrarTudo(); return; }

    var hero = document.querySelector('.hero');
    var titulo = document.querySelector('.hero__title');
    var status = document.querySelector('.hero__status');
    var dot = status && status.querySelector('.dot');
    var marca = document.querySelector('.wordmark b');
    var sub = document.querySelector('.hero__sub');
    var acoes = document.querySelector('.hero__actions');
    var fine = document.querySelector('.hero__fine');
    var arte = document.querySelector('.hero__arte');
    var rail = document.querySelector('.hero__rail');
    var aresta = rail && rail.querySelector('.hero__rail-aresta');
    var nav = document.querySelector('.nav');
    var feixe = document.querySelector('.feixe');
    var linha = feixe && feixe.querySelector('.feixe__linha');
    var largo = window.innerWidth >= 861;

    try {
      var T = 1.8;
      var vw = window.innerWidth;
      var fx = feixe ? feixe.getBoundingClientRect().left : 0;
      /* o instante em que o centro da faixa cruza um x da tela */
      var tFeixe = function (px) { return Math.max(0, Math.min(T, T * ((px - fx) / vw + .20) / 1.30)); };
      var esq = function (el) { return el.getBoundingClientRect().left; };

      var tl = gsap.timeline({ defaults: { ease: EXPO } });
      if (linha) tl.fromTo(linha, { x: '-20vw' }, { x: '110vw', duration: T, ease: 'none' }, 0);
      if (nav) {
        tl.to(nav, { opacity: 1, duration: .5 }, 0);
        tl.from(nav.querySelectorAll('.nav__links > *'), { y: -8, opacity: 0, duration: .8, stagger: .05, clearProps: 'all' }, .15);
      }
      if (status) tl.fromTo(status, { y: 10 }, { opacity: 1, y: 0, duration: .8 }, .05);
      if (dot) tl.from(dot, { scale: 0, duration: .4, ease: 'back.out(2)', clearProps: 'transform' }, tFeixe(esq(dot)));
      if (marca) tl.add(function () { marca.classList.add('is-lit'); }, tFeixe(esq(marca)));

      if (titulo) {
        var sp = partir(titulo, 'words');
        if (sp && sp.words && sp.words.length) {
          /* O TÍTULO É O LCP: 45% já pintado no primeiro quadro. Cada palavra
             sobe quando a luz chega nela; palavras na mesma coluna sobem
             juntas, em qualquer largura: a luz imprime colunas. */
          gsap.set(sp.words, { yPercent: 55 });
          gsap.set(titulo, { visibility: 'visible' });
          var ultimo = 0;
          for (var w = 0; w < sp.words.length; w++) {
            var r = sp.words[w].getBoundingClientRect();
            var tw = tFeixe(r.left + r.width * .25);
            if (tw > ultimo) ultimo = tw;
            tl.to(sp.words[w], { yPercent: 0, duration: .7 }, tw);
          }
          /* SEM revert aqui: devolver os nós de texto ao h1 faz o Chrome re-registrar
             o título inteiro como LCP no fim da animação (medido: 0,9s → 2,5s no
             celular). As palavras ficam divididas; mostrarTudo() reverte se preciso. */
          tl.add(function () { titulo.classList.add('is-lit'); }, ultimo + .35);
        } else {
          tl.fromTo(titulo, { visibility: 'visible', opacity: .35, y: 16 }, { opacity: 1, y: 0, duration: .8, onComplete: function () { titulo.classList.add('is-lit'); } }, .05);
        }
      }

      var tCol = sub ? tFeixe(esq(sub)) : .5;
      if (sub) tl.fromTo(sub, { y: 18 }, { opacity: 1, y: 0, duration: .9 }, tCol + .05);
      if (acoes) tl.fromTo(acoes, { y: 14 }, { opacity: 1, y: 0, duration: .9 }, tCol + .15);
      if (fine) tl.to(fine, { opacity: 1, duration: .7 }, tCol + .25);

      if (arte && largo) imprimirArte(arte, tl, tFeixe(esq(arte)));
      if (rail) {
        var rr = rail.getBoundingClientRect();
        var tR0 = tFeixe(rr.left), tR1 = tFeixe(rr.right);
        if (largo) tl.to(rail, { opacity: 1, duration: .01 }, Math.max(0, tR0 - .05));
        if (aresta) tl.to(aresta, { scaleX: 1, duration: Math.max(.3, tR1 - tR0), ease: 'none' }, tR0);
        var filhos = rail.querySelectorAll(':scope > :not(.hero__rail-aresta)');
        for (var f = 0; f < filhos.length; f++) {
          tl.fromTo(filhos[f], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .6, clearProps: 'opacity,transform' }, tFeixe(esq(filhos[f])));
        }
        /* a medida da trilha conta até o valor medido */
        tl.add(function () {
          var els = rail.querySelectorAll('[data-metrica="carga"], [data-metrica="peso"]');
          for (var i = 0; i < els.length; i++) contar(els[i], 1.1, 0);
        }, tR0 + .3);
      }
      tl.add(function () {
        if (linha) gsap.set(linha, { clearProps: 'transform' });
        if (feixe) feixe.classList.add('is-loop');
      }, T + .1);

      /* celular: a arte imprime quando aparece, não antes */
      if (arte && !largo) {
        if (ST) ST.create({ trigger: arte, start: 'top 82%', once: true, onEnter: function () { imprimirArte(arte, null, 0); } });
        else imprimirArte(arte, null, 0);
      }
    } catch (e) {
      mostrarTudo();
    }
  }
  if (document.body.classList.contains('booted')) heroEntra();
  else B.on('booted', heroEntra);

  /* ---------- ENTRADAS POR SEÇÃO ----------
     O contêiner só esmaece; quem se move é o conteúdo. Laudo, passos, prova
     e spec não recebem tween nos filhos: a classe `is-in` basta, o CSS
     desenha régua, trilho, barra e marca (css/motion.css). O cabeçalho entra
     em três tempos (kicker, linhas do h2, lead) e a ênfase do h2 acende. */
  var jaRevelou = false;
  var COM_FILHOS = '.servicos, .malha, .cenarios, .faq-list';
  var SEM_TWEEN = '.laudo, .passos, .prova, .spec';
  var CASCATA = { '.passos': .55 };
  var ATRASO = { '.passos': .15 };
  function marcar(el) {
    el.classList.add('is-in');
    if (el.classList.contains('section__head') || el.parentNode.classList.contains('conversa')) cabecalho(el);
    if (el.classList.contains('prova')) {
      var vals = el.querySelectorAll('[data-metrica="carga"], [data-metrica="peso"]');
      for (var i = 0; i < vals.length; i++) contar(vals[i], 1.1, .15 * i);
    }
  }
  function cabecalho(cabeca) {
    var kick = cabeca.querySelector('.kicker'), lead = cabeca.querySelector('.lead'), h = cabeca.querySelector('h2');
    if (kick) gsap.fromTo(kick, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: .6, ease: EXPO, clearProps: 'all' });
    if (lead) gsap.fromTo(lead, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .8, delay: .35, ease: EXPO, clearProps: 'all' });
    if (h && !h._partido) {
      h._partido = true;
      var sp = partir(h, 'lines');
      if (sp && sp.lines.length) gsap.from(sp.lines, { yPercent: 108, duration: .95, delay: .1, stagger: .09, ease: EXPO, onComplete: function () { sp.revert(); h.classList.add('is-lit'); } });
      else h.classList.add('is-lit');
    }
    var regua = cabeca.parentNode.querySelector('.conversa__regua');
    if (regua) gsap.fromTo(regua, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power4.inOut' });
  }
  function de(tabela, el, padrao) { for (var k in tabela) if (el.matches(k)) return tabela[k]; return padrao; }
  function revelar(el, imediato) {
    marcar(el);
    if (el.matches(SEM_TWEEN)) return;
    var kids = el.matches(COM_FILHOS) ? el.children : null;
    gsap.to(el, { opacity: 1, y: 0, duration: imediato ? .35 : .45, ease: EXPO, overwrite: true });
    if (kids && kids.length) {
      gsap.fromTo(kids, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1, delay: de(ATRASO, el, 0), ease: EXPO, stagger: { each: de(CASCATA, el, .07) }, clearProps: 'opacity,transform' });
    }
  }
  function scrollReveals() {
    if (jaRevelou) return;
    jaRevelou = true;
    if (reduzido) return;
    var alvos = [].slice.call(document.querySelectorAll('.reveal'));
    if (!alvos.length) return;
    try {
      /* só o que não tem entrada própria desloca (ex.: o bloco da conversa) */
      var soltos = alvos.filter(function (el) { return !el.matches(COM_FILHOS + ', ' + SEM_TWEEN + ', .section__head'); });
      if (soltos.length) gsap.set(soltos, { y: 24 });
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
