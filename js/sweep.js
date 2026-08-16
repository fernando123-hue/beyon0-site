/* ==========================================================================
   VARREDURA — a linha viva que reveste o boot e persegue o scroll.

   Entra no loop único (B.add) porque precisa mover algo a cada frame — mas
   o único DOM que toca por frame é o transform de UM elemento (compositor
   puro, não recalcula estilo de nada). Três estados por frame, sem nenhuma
   lógica de alvo: ATRÁS da viewport → corre rápido (te alcança); DENTRO →
   ritmo devagar (o da scanline pré-reconstrução, 1287px/1,3s); ADIANTE →
   espera parada. Nunca foge de quem não rolou — só persegue quem rolou.

   Ao cruzar cada .reveal, adiciona .is-in — a MESMA classe que o
   IntersectionObserver de dom.js já usa. Os dois convivem sem colisão:
   quem chegar primeiro revela, o outro vira no-op (dom.js intocado).

   Medidas de DOM (getBoundingClientRect, scrollHeight) só em medir(),
   chamada uma vez ao iniciar e de novo em resize — nunca por frame.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B || B.reduced) return;

  var DENTRO = 990;   /* px/s — ritmo da scanline pré-reconstrução (1287px / 1,3s) */
  var FORA = 4950;    /* px/s — 5x: o "engano", só quando está atrás do usuário */

  var linha = document.createElement('div');
  linha.className = 'sweep';
  linha.style.willChange = 'transform';
  linha.setAttribute('aria-hidden', 'true');
  document.body.appendChild(linha);

  var y = 0, scrollY = 0, alturaDoc = 0;
  var ativo = false, pronto = false;
  var alvos = [], cursor = 0;

  function medir() {
    alturaDoc = document.documentElement.scrollHeight;
    var els = document.querySelectorAll('.reveal');
    var novos = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList.contains('is-in')) continue; /* já revelado, não reprocessa */
      novos.push({ el: el, topo: el.getBoundingClientRect().top + window.scrollY });
    }
    novos.sort(function (a, b) { return a.topo - b.topo; });
    alvos = novos;
    cursor = 0;
  }

  window.addEventListener('scroll', function () { scrollY = window.scrollY; }, { passive: true });
  B.on('resize', medir);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);

  function iniciar() {
    if (ativo) return;
    ativo = true;
    scrollY = window.scrollY;
    medir();
  }
  /* emit() não guarda memória: quem se inscreve depois de emitido nunca recebe.
     js/intro.js pode chamar B.emit('booted') na própria execução síncrona do
     script dele — antes deste arquivo sequer rodar, se a ordem no <body>
     mudar. Por isso checa o estado já ocorrido antes de só esperar o evento. */
  if (document.body.classList.contains('booted')) iniciar();
  else B.on('booted', iniciar);

  function tick(S) {
    if (!ativo || pronto) return;
    if (y > scrollY + S.h + 24) return;         /* adiante do usuário: espera parada
                                                    (24px de folga — o brilho tem 12px
                                                    de blur, não pode vazar na viewport) */

    var atras = y < scrollY;
    y += (atras ? FORA : DENTRO) * (S.dt / 1000);

    if (y >= alturaDoc) {
      y = alturaDoc;
      pronto = true;
      linha.style.display = 'none';
    }

    linha.style.transform = 'translateY(' + y + 'px)';

    while (cursor < alvos.length && alvos[cursor].topo <= y) {
      alvos[cursor].el.classList.add('is-in');
      cursor++;
    }
  }

  B.add('varredura', tick);
})();
