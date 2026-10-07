/* A página de privacidade: só monta o link de WhatsApp (o número vem de js/tel.js). Sem movimento. */
(function () {
  'use strict';
  var tel = window.BEYON_TEL;
  if (!tel) return;
  var links = document.querySelectorAll('[data-wa]');
  for (var i = 0; i < links.length; i++) {
    var assunto = links[i].getAttribute('data-wa') || 'tenho uma dúvida';
    links[i].href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent('Oi! Vim pelo site da Beyon Zero e ' + assunto + '.');
    links[i].rel = 'noopener noreferrer';
    links[i].target = '_blank';
  }
})();
