/* ==========================================================================
   A ESCRITA dos rótulos mono (2026-10-06; quadro de referências, ideia #1:
   Hyper Text da Magic UI, Text Scramble da Motion Primitives, Osmo). Quando
   a seção entra na tela, o nome do capítulo no kicker ("Garantias") ASSENTA
   caractere a caractere, passando por um alfabeto curto de instrumento
   (0–9, A–F, · /): 320 ms, uma vez por rótulo. Alfabeto restrito e curto de
   propósito: katakana/binário vira Matrix; isto é um painel acendendo. Só
   caracteres dentro do subset da JetBrains Mono (até U+00FF): │ e ─ caíam na
   fonte reserva e a largura tremia (revisão). Só o rótulo, em mono: a largura
   não muda e nada reflui. O número (<b>) não mexe. O texto final fica em
   data-nome (js/rede.js lê o nome da seção dali, não do texto embaralhado).
   Só escreve DEPOIS de o GSAP revelar o cabeçalho (.is-in): no carregamento
   com âncora o kicker já estava na tela com opacidade 0 e a escrita não era
   vista. Sem movimento reduzido não roda; ao pedir menos movimento no meio,
   assenta na hora. Fora do rAF da página: um setTimeout curto por rótulo.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || B.reduced || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var ALFABETO = '0123456789ABCDEF·/', DURA = 320, PASSO = 32, ESPERA_REVEAL = 2500;
  var html = document.documentElement, ativos = [];

  function sorteio() { return ALFABETO.charAt(Math.floor(Math.random() * ALFABETO.length)); }
  /* os nós de texto do rótulo fora do número; o texto final de cada um fica guardado */
  function nosDe(el) {
    var nos = [];
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) nos.push({ no: n, fim: n.nodeValue });
    return nos;
  }
  /* o cabeçalho já foi revelado (ou não há reveal pelo GSAP nesta página)? */
  function visivel(el) {
    var r = el.closest('.reveal');
    return !r || !html.classList.contains('has-gsap') || r.classList.contains('is-in');
  }
  function assentar(e) { for (var i = 0; i < e.nos.length; i++) e.nos[i].no.nodeValue = e.nos[i].fim; clearTimeout(e.timer); var k = ativos.indexOf(e); if (k >= 0) ativos.splice(k, 1); }
  function escrever(el) {
    var nos = nosDe(el);
    if (!nos.length) return;
    var e = { nos: nos, t0: performance.now(), timer: 0 };
    ativos.push(e);
    (function passo() {
      var k = Math.min(1, (performance.now() - e.t0) / DURA);
      if (k >= 1) { assentar(e); return; }
      for (var i = 0; i < nos.length; i++) {
        var fim = nos[i].fim, assentadas = Math.floor(k * fim.length), s = '';
        for (var j = 0; j < fim.length; j++) s += j < assentadas || fim.charAt(j) === ' ' ? fim.charAt(j) : sorteio();
        nos[i].no.nodeValue = s;
      }
      e.timer = setTimeout(passo, PASSO);
    })();
  }
  /* entrou na tela: escreve quando o cabeçalho estiver revelado (espera com teto; sem reveal, desiste) */
  function entrou(el) {
    var desde = performance.now();
    (function tenta() {
      if (visivel(el)) { escrever(el); return; }
      if (performance.now() - desde > ESPERA_REVEAL) return;
      setTimeout(tenta, 60);
    })();
  }
  var io = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { io.unobserve(es[i].target); entrou(es[i].target); }
  }, { rootMargin: '0px 0px -12% 0px' });
  var rotulos = document.querySelectorAll('.kicker');
  for (var i = 0; i < rotulos.length; i++) {
    var nos = nosDe(rotulos[i]);
    if (!nos.length) continue;
    rotulos[i].setAttribute('data-nome', nos.map(function (n) { return n.fim; }).join(' ').trim());
    io.observe(rotulos[i]);
  }
  B.on('reduzir', function (sim) { if (!sim) return; io.disconnect(); while (ativos.length) assentar(ativos[0]); });
})();
