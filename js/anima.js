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

  /* ASSUMIR O CONTROLE, AGORA — antes de qualquer tween.
     Esta classe é o contrato com a folha de estilo: "o GSAP está dirigindo,
     desliga as animações CSS equivalentes". Ela precisa entrar AQUI e não mais
     tarde, porque a cascata de entrada do hero (.booted .hero__*) é uma
     @keyframes com fill:both — e animação vence estilo inline no cascade, de
     forma permanente. Enquanto ela valia, a entrada do hero escrita abaixo
     tweenava para um elemento cujo opacity/transform o CSS mantinha pinado:
     status, subtítulo, ações e dica de scroll simplesmente não animavam.
     Só chega nesta linha quem passou pelas guardas acima (GSAP presente e sem
     reduced-motion), então o fallback CSS continua intacto para todo o resto. */
  document.documentElement.classList.add('has-gsap');

  var feito = false;

  /* ---------- CARACTERE VIVO ----------
     Quebra um título em .char (com índice --i) e liga a ressonância do CSS.
     Split por words,chars: 'words' impede a letra de quebrar no meio da palavra
     ao mudar de linha. Não reverte — a vida é permanente. Falhar aqui não
     quebra nada: o título fica normal. */
  function vivaChars(el) {
    if (!el || el._viva || !window.SplitText) return;
    el._viva = true;
    try {
      /* o texto de cada em é guardado ANTES do split: depois o restauramos como
         texto plano, para a AURORA voltar contínua na palavra-chave (char-split
         quebraria o gradiente). Os chars ao redor ressoam; o em flui. */
      var emsOrig = [], emsAntes = el.querySelectorAll('em');
      for (var e = 0; e < emsAntes.length; e++) emsOrig.push(emsAntes[e].textContent);

      var sp = new window.SplitText(el, { type: 'words,chars', charsClass: 'char', wordsClass: 'palavra-viva' });
      for (var i = 0; i < sp.chars.length; i++) sp.chars[i].style.setProperty('--i', i);
      el.classList.add('split');                 /* permanente: estrutura + cor */

      var emsDepois = el.querySelectorAll('em');  /* desfaz o split DENTRO do em */
      for (var d = 0; d < emsDepois.length && d < emsOrig.length; d++) {
        emsDepois[d].textContent = emsOrig[d];
        /* o SplitText deixa inline-block no em (pra conter as words); se ficar,
           o em não quebra de linha e "interfaces de elite" estoura no celular.
           Volta ao inline padrão — o em é só texto aurora agora. */
        emsDepois[d].style.cssText = '';
      }

      /* a onda (`.viva`) só liga quando o título está na viewport — fora dela,
         nem animação nem camada de composição. É o que segura o custo no mobile. */
      if (window.ScrollTrigger) {
        window.ScrollTrigger.create({
          trigger: el, start: 'top bottom', end: 'bottom top',
          onToggle: function (self) { el.classList.toggle('viva', self.isActive); }
        });
        /* estado inicial: onToggle só dispara na MUDANÇA, então se já está na
           tela (o hero), liga agora. */
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('viva');
      } else {
        el.classList.add('viva');                /* sem ScrollTrigger: sempre viva */
      }
    } catch (e) { el._viva = false; }
  }

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
    var pecas = [status, titulo, sub, acoes, hint];

    /* REDE DE SEGURANÇA (a mesma que scrollReveals já tinha, e que aqui
       faltava). Agora que `has-gsap` desliga a cascata CSS do hero, o GSAP é o
       ÚNICO caminho de entrada — e um `from` com autoAlpha põe o elemento em
       opacity 0 no mesmo tick. Se qualquer linha daqui lançar no meio, a peça
       já zerada ficaria invisível para sempre, na primeira tela do site. No
       catch tudo volta a aparecer: o site perde a entrada, nunca o conteúdo. */
    try {
      /* mais lento e suave (pedido do dono): durações maiores, easing gentil */
      var tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

      if (status) tl.from(status, { autoAlpha: 0, y: 14, duration: .9 });

      if (window.SplitText && titulo) {
        var split = new window.SplitText(titulo, { type: 'lines', mask: 'lines' });
        tl.from(split.lines, {
          yPercent: 115, duration: 1.5, stagger: .2, ease: 'power3.out',
          onComplete: function () {
            split.revert();       /* devolve o DOM original */
            vivaChars(titulo);    /* e já liga a ressonância — logo após a entrada */
          }
        }, '-=.35');
      } else if (titulo) {
        tl.from(titulo, { autoAlpha: 0, y: 26, duration: 1.3 }, '-=.35');
      }

      if (sub) tl.from(sub, { autoAlpha: 0, y: 18, duration: 1 }, '-=.8');
      if (acoes) tl.from(acoes.children, { autoAlpha: 0, y: 16, stagger: .14, duration: .9 }, '-=.6');
      if (hint) tl.from(hint, { autoAlpha: 0, duration: .9 }, '-=.3');
    } catch (e) {
      for (var p = 0; p < pecas.length; p++) {
        if (!pecas[p]) continue;
        gsap.set(pecas[p], { clearProps: 'all' });
        if (pecas[p].children.length) gsap.set(pecas[p].children, { clearProps: 'all' });
      }
      document.documentElement.classList.remove('has-gsap');   /* devolve a cascata ao CSS */
    }
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

    /* CARACTERE VIVO nos títulos das seções e do CTA (o do hero é ligado na
       entrada). Split é permanente; o custo só existe com o título visível. */
    var titulos = document.querySelectorAll('.section h2, .cta h2');
    for (var t = 0; t < titulos.length; t++) vivaChars(titulos[t]);

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
