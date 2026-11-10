/* ==========================================================================
   O PULSO NO SITE INTEIRO (dono, 2026-11-10: "o pulso do AI Core principal,
   eu não sinto ele ocorrendo [...] deverá interagir com o site inteiro [...]
   frequente, mas não deverá ser chato ou enjoativo"; escolha "Núcleo bate +
   onda", Decisões 2026-11-10).

   A cada expiração do reator (B.FOLEGO: 7 s, fase inspira) o núcleo bate e
   a onda sai (js/nucleo/pecas.js, js/campo.js, js/rede.js, no mesmo relógio).
   Aqui, a PÁGINA responde onde quer que a pessoa esteja: os detalhes ciano
   que estão na tela (o número dos rótulos, os círculos dos passos, o núcleo
   da marca) acendem um instante, de cima para baixo (VARRE s da borda de
   cima à de baixo da tela), como se a onda passasse por eles. Um pulso a
   cada 4 é o FORTE (B.pulso.forte): a mesma resposta, mais longa.

   Para não cansar: só classe por evento (nada por quadro, nenhuma variável
   de CSS animada); só o que está na tela; nada com a aba escondida, na
   travessia entre páginas, com movimento reduzido ou enquanto a pessoa
   carrega um card (a vez é dela). B.emit('pulso', { n, forte }) avisa o
   resto (o mini dá um pulinho: js/mini.js). O som do pulso é do js/som.js,
   no mesmo relógio.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || !B.relogio || !B.FOLEGO || !B.pulso) return;

  var ALVOS = '.kicker, .passo, .marca--nav';
  var OCUPADO = '.is-carregando, .is-carregado';   /* js/carga.js: o cursor parado num card */
  var VARRE = 0.8;                                /* s da borda de cima à de baixo da tela */
  var DURA = { comum: 900, forte: 1400 };         /* ms: o mesmo das animações em css/motion.css */
  var html = document.documentElement;
  var timer = 0;

  function reduzido() { return B.reduced || html.classList.contains('menos-movimento'); }
  function ocupado() { return !!document.querySelector(OCUPADO); }
  function emTravessia() { return html.classList.contains('passagem-chega') || html.classList.contains('passagem-sai'); }

  /* o próximo pulso, recalculado a cada um (timers encadeados derivavam do relógio do reator) */
  function agendar() {
    clearTimeout(timer);
    var P = B.FOLEGO.periodo, falta = P * B.FOLEGO.inspira - (B.relogio() % P);
    if (falta < 0.02) falta += P;
    timer = setTimeout(bater, falta * 1000);
  }

  function acender(el, forte) {
    var classe = forte ? 'is-pulso-forte' : 'is-pulso';
    el.classList.add(classe);
    setTimeout(function () { el.classList.remove(classe); }, forte ? DURA.forte : DURA.comum);
  }

  function bater() {
    agendar();
    if (document.hidden || reduzido() || emTravessia()) return;
    var n = B.pulso.numero(B.relogio()), forte = B.pulso.forte(n);
    B.emit('pulso', { n: n, forte: forte });
    if (ocupado()) return;
    /* layout lido uma vez por pulso, só dos alvos (dezenas, não centenas) */
    var H = window.innerHeight || 1, els = document.querySelectorAll(ALVOS);
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || !r.height) continue;
      setTimeout(acender.bind(null, els[i], forte), Math.max(0, r.top) / H * VARRE * 1000);
    }
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) clearTimeout(timer); else agendar(); });
  agendar();
})();
