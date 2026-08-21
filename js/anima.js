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

  /* NOTA: aqui vivia `vivaChars()`, o "caractere vivo" — cada título era
     quebrado em `.char` por SplitText e cada letra oscilava para sempre
     (`@keyframes ressoar`, 3s, infinite).

     Ele saiu com a reformulação visual, e por duas razões independentes:

     1. DIREÇÃO. A regra da camada de instrumentação é que nada anima sozinho em
        repouso — todo movimento é RESPOSTA a uma ação. Letra que oscila sem
        ninguém pedir é o oposto disso, e era o tipo de movimento constante que
        a nova direção recusa por escrito.
     2. DESPERDÍCIO MEDIDO. A folha de estilo perdeu as regras `.char`/`.viva`
        na reescrita, mas esta função continuou rodando: media 220 `.char` mais
        40 `.palavra-viva` — 260 nós, quase METADE dos 542 elementos da página —
        e ~6 ScrollTriggers, tudo para efeito visual NENHUM. Trabalho puro.

     O SplitText continua carregado e usado logo abaixo, na entrada do hero
     (`type: 'lines', mask: 'lines'`), que é um evento de ENTRADA e não
     movimento perpétuo — esse fica. */

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
          /* `revert()` devolve o DOM original assim que a entrada termina, e é
             ele que faz a divisão em linhas ser um EVENTO em vez de um estado.
             Enquanto o tween roda, o invólucro de máscara mantém um `<em>`
             duplicado e vazio no título — daí o `:not(:empty)` nas regras dos
             paquímetros, que existem justamente nessa janela. */
          onComplete: function () { split.revert(); }
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
    /* `is-in` é o CONTRATO DE REVELAÇÃO do site, e vale nos dois caminhos.
       dom.js já o escreve quando ele é o dono dos reveals (sem GSAP ou em
       reduced-motion); aqui o GSAP dirige opacity/transform por conta própria,
       mas a classe precisa entrar do mesmo jeito porque o CSS pendura nela os
       efeitos de ENTRADA que não são opacity/transform — a régua do kicker que
       se desenha, o sublinhado de medição da palavra em destaque. Sem isto
       esses efeitos só apareceriam no caminho de fallback, que é justamente o
       que quase ninguém vê. Marcar é idempotente e não compete com o tween. */
    var marcar = function (els) {
      var lista = els.length !== undefined ? els : [els];
      for (var m = 0; m < lista.length; m++) lista[m].classList.add('is-in');
    };
    try {
      gsap.set(alvos, { opacity: 0, y: 28 });
      if (ST && ST.batch) {
        ST.batch(alvos, {
          start: 'top 88%',
          once: true,
          onEnter: function (els) {
            marcar(els);
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
            marcar(el);
            gsap.to(el, { opacity: 1, y: 0, duration: .8, ease: 'power2.out', overwrite: true });
          }
        });
      } else {
        marcar(alvos);
        gsap.to(alvos, { opacity: 1, y: 0, duration: 1 });   /* sem batch: revela suave */
      }
    } catch (e) {
      /* falhou: conteúdo NUNCA fica oculto — e `is-in` entra junto, senão os
         efeitos de entrada ficariam presos no estado inicial (régua de largura
         zero, sublinhado recortado) num caminho que já é o de emergência. */
      marcar(alvos);
      gsap.set(alvos, { opacity: 1, y: 0 });
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
