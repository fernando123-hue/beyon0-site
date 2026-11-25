/* ==========================================================================
   A ENERGIA DO CAMPO DE ESCREVER (/orcamento). Dono, 24/11: "quero que tenha uma energia seguindo um fluxo constante minimalista,
   que fica mais forte conforme a pessoa escreve, e quando ela para, a energia vai diminuindo".
   • Uma linha de 1 px (a borda do campo) e, por cima dela, UM traço curto que percorre a borda em velocidade constante, sem parar.
     O traço é feito de quatro trilhos (um por lado reto; nos cantos ele some por um instante e volta no lado seguinte). Cada trilho
     anda só por transform num @keyframes (css/orcamento-palco.css); daqui saem só os números da volta (onde cada lado começa e
     quanto dura a volta), e só quando o campo muda de tamanho, nunca por quadro. A mesma velocidade em px/s em qualquer tamanho.
   • A força em 4 degraus (data-energia 0 a 3 na caixa .orc-campo): 0 é o fluxo de base; cada letra escrita soma e o degrau sobe;
     quando a pessoa para, ele desce um degrau por vez até o 0 (temporizador, sem rAF). O CSS troca o comprimento e a opacidade
     do traço por degrau (transform/opacity com transição).
   • Fora da tela o fluxo pausa (IntersectionObserver). Movimento reduzido: o CSS não mostra o traço; o degrau só clareia a linha.
   ES5, como os vizinhos; as contas são puras e testadas (docs/testes/orcamento-nasce.test.mjs).
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz && raiz.document) { raiz.BZOrcCampo = api; api.ligar(raiz.document, raiz); }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var LIMIARES = [0, 1, 8, 20];   /* (letras seguidas para chegar a cada degrau: a 1ª já acorda, ~1,5 s e ~4 s de escrita para os outros) */
  var PAUSA_MS = 800;              /* (parou de escrever: espera isso antes de começar a descer) */
  var PASSO_MS = 800;              /* (cada degrau a menos: do 3 ao 0 em 2,4 s) */
  var TRACO_PX = 72;               /* (o comprimento do traço no degrau 3; os outros são uma fração dele, por escala no CSS) */
  var VELOCIDADE = 140;            /* (px por segundo ao longo da borda: calmo, constante) */
  var LADOS = 4;

  function nivel(pulsos) {
    var n = 0;
    for (var i = 1; i < LIMIARES.length; i++) if (pulsos >= LIMIARES[i]) n = i;
    return n;
  }

  /* a volta: os 4 lados retos (cima →, direita ↓, baixo ←, esquerda ↑) e os cantos de raio r como trechos sem traço.
     Para cada lado, o trilho anda de "de" a "ate" (px, o translate do traço de comprimento L) numa volta de "volta" segundos,
     começando em "atraso" segundos (negativo): assim a cabeça do traço entra em cada lado no instante em que sai do anterior */
  function geometria(w, h, r, L, v) {
    if (!(w > 0 && h > 0)) return null;
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    L = L || TRACO_PX;
    v = v || VELOCIDADE;
    var a = w - 2 * r, b = h - 2 * r, c = Math.PI * r / 2;
    var p = 2 * a + 2 * b + 4 * c;
    if (p <= a + L || p <= b + L) return null;
    var comp = [a, b, a, b], ini = [0, a + c, a + b + 2 * c, 2 * a + b + 3 * c];
    var volta = p / v;
    var lados = [];
    for (var k = 0; k < LADOS; k++) {
      var s = comp[k], lo = s + L - p;
      var fase = (((-ini[k] - lo) % p) + p) % p / p;
      lados.push({ comprimento: s, inicio: ini[k], de: s - p, ate: s, atraso: -fase * volta });
    }
    return { perimetro: p, volta: volta, traco: L, lados: lados };
  }

  /* a força: escreveu() sobe; parado, desce um degrau por vez. aplicar(n) só é chamado quando o degrau muda */
  function energia(aplicar, relogio) {
    var pulsos = 0, atual = 0, timer = null;
    var st = (relogio && relogio.setTimeout) || setTimeout, ct = (relogio && relogio.clearTimeout) || clearTimeout;
    function por(n) { if (n !== atual) { atual = n; aplicar(n); } }
    function descer() {
      timer = null;
      if (atual <= 0) return;
      var n = atual - 1;
      pulsos = LIMIARES[n];
      por(n);
      if (n > 0) timer = st(descer, PASSO_MS);
    }
    return {
      escreveu: function () {
        pulsos++;
        por(nivel(pulsos));
        if (timer) ct(timer);
        timer = st(descer, PAUSA_MS);
      },
      atual: function () { return atual; }
    };
  }

  /* o campo mudou de tamanho no meio da volta (cada linha nova, com field-sizing): a cabeça continua na MESMA fração do caminho,
     em vez de pular. t = o tempo da animação agora (s); antes = a geometria e o deslocamento de antes; devolve o deslocamento novo
     (s, entre 0 e a volta nova), que entra subtraído do atraso de cada trilho */
  function continuar(t, antes, deslocAntes, g) {
    if (!antes || !(t >= 0)) return 0;
    var p0 = antes.perimetro, s0 = ((VELOCIDADE * (t + deslocAntes)) % p0 + p0) % p0;
    var d = (s0 / p0) * g.perimetro / VELOCIDADE - t;
    return ((d % g.volta) + g.volta) % g.volta;
  }
  function tempoDaVolta(trilho) {
    var a = typeof trilho.getAnimations === 'function' ? trilho.getAnimations()[0] : null;
    return a && typeof a.currentTime === 'number' ? a.currentTime / 1000 : -1;
  }
  function medir(caixa, campo, trilhos, win, estado) {
    var cs = win.getComputedStyle ? win.getComputedStyle(campo) : null;
    var r = cs ? parseFloat(cs.borderTopLeftRadius) || 0 : 0;
    var g = geometria(campo.offsetWidth, campo.offsetHeight, r);
    if (!g) { caixa.classList.remove('is-medido'); estado.g = null; estado.desloc = 0; return; }
    estado.desloc = continuar(tempoDaVolta(trilhos[0]), estado.g, estado.desloc, g);
    estado.g = g;
    for (var k = 0; k < trilhos.length && k < LADOS; k++) {
      var t = trilhos[k].style, l = g.lados[k];
      t.setProperty('--de', l.de.toFixed(1) + 'px');
      t.setProperty('--ate', l.ate.toFixed(1) + 'px');
      t.animationDuration = g.volta.toFixed(3) + 's';
      t.animationDelay = (l.atraso - estado.desloc).toFixed(3) + 's';
    }
    caixa.classList.add('is-medido');
  }

  function ligar(doc, win) {
    var caixa = doc.querySelector ? doc.querySelector('.orc-campo') : null;
    var campo = doc.getElementById('o-texto');
    if (!caixa || !campo) return;
    var trilhos = caixa.querySelectorAll('.orc-campo__traco');
    var forca = energia(function (n) { caixa.setAttribute('data-energia', String(n)); });
    caixa.setAttribute('data-energia', '0');
    campo.addEventListener('input', forca.escreveu);
    if (!trilhos.length) return;
    var estado = { g: null, desloc: 0 };
    var refazer = function () { medir(caixa, campo, trilhos, win, estado); };
    if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(refazer).observe(campo);
    else { refazer(); win.addEventListener('resize', refazer); }
    if (typeof win.IntersectionObserver === 'function') {
      new win.IntersectionObserver(function (itens) {
        caixa.classList.toggle('is-fora', !itens[itens.length - 1].isIntersecting);
      }).observe(caixa);
    }
  }

  return { nivel: nivel, geometria: geometria, continuar: continuar, energia: energia, ligar: ligar, LIMIARES: LIMIARES, PAUSA_MS: PAUSA_MS, PASSO_MS: PASSO_MS, TRACO_PX: TRACO_PX, VELOCIDADE: VELOCIDADE };
});
