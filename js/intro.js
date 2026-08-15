/* ==========================================================================
   INTRO — overlay de vídeo no boot.

   Evento-só: sem tick de rAF, não se registra em B.add(). Só alterna classes
   do <body> em resposta a eventos do <video> (ended/error/loadedmetadata) e
   do botão de pular. Quem desenha a scanline de boot é puro CSS (styles.css),
   disparado pela classe .booted que este arquivo adiciona ao terminar.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B) return;

  var intro = document.getElementById('intro');
  var vid = document.getElementById('introVid');
  var skip = document.getElementById('introSkip');

  /* markup ausente: não trava o boot esperando um evento que nunca vem */
  if (!intro || !vid) {
    document.body.classList.add('booted');
    return;
  }

  var done = false;
  function finish(instant) {
    if (done) return;
    done = true;
    document.body.classList.remove('intro-active');
    document.body.classList.add('booted');
    intro.classList.add('intro--done');
    try { vid.pause(); } catch (e) {}
    if (instant) {
      if (intro.parentNode) intro.parentNode.removeChild(intro);
    } else {
      setTimeout(function () {
        if (intro.parentNode) intro.parentNode.removeChild(intro);
      }, 900);
    }
  }

  /* rede fraca: mesma política de guarda que o campo neural já aplica
     (core.js expõe B.saveData; effectiveType não é exposto lá, checa aqui) */
  var conn = navigator.connection;
  var redeFraca = !!conn && (conn.saveData === true ||
    conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g');

  if (B.reduced || B.saveData || redeFraca) {
    finish(true);
    return;
  }

  document.body.classList.add('intro-active');

  vid.addEventListener('ended', function () { finish(false); });
  vid.addEventListener('error', function () { finish(true); });
  if (skip) skip.addEventListener('click', function () { finish(false); });

  /* trava de segurança: se o vídeo travar, entra após duração + folga */
  vid.addEventListener('loadedmetadata', function () {
    var cap = Math.min(30000, (vid.duration || 12) * 1000 + 2000);
    setTimeout(function () { finish(false); }, cap);
  });

  /* o download começa AQUI, depois das guardas acima — nunca no parser */
  var src = vid.getAttribute('data-src');
  if (!src) { finish(true); return; }
  vid.src = src;

  var p = vid.play();
  if (p && p.catch) p.catch(function () { finish(true); });

  if (skip) setTimeout(function () { skip.classList.add('show'); }, 1200);

  /* fallback se metadata nunca carregar */
  setTimeout(function () {
    if (!done && (!vid.duration || isNaN(vid.duration))) finish(true);
  }, 8000);
})();
