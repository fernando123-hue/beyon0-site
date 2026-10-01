/* Script mínimo do resumo.html: só monta o link de WhatsApp. Não puxa o
   núcleo nem o GSAP (a página não tem movimento). O número vem de js/tel.js. */
(function () {
  'use strict';
  var tel = window.BEYON_TEL;
  if (!tel) return;
  var btn = document.getElementById('resumoWa');
  if (!btn) return;
  var txt = 'Oi! Vim pelo resumo da Beyon Zero e quero agendar um diagnóstico.';
  btn.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(txt);
  btn.rel = 'noopener noreferrer';
})();
