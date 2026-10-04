/* ==========================================================================
   A VIDA do mini AI Core: o repertório de comportamentos (dono, 2026-10-04:
   "quero que ele tenha várias formas diferentes de interagir, não apenas o
   espaço para se acoplar; deixe tudo bastante variado, como se desse vida a
   ele"). Quando o mini sai da doca para passear, js/mini.js pergunta aqui
   primeiro (`B.miniVida.escolher`); cada comportamento olha o que a pessoa
   está fazendo, tem a sua pausa mínima e devolve um DESTINO (xy() vivo,
   fica, aoChegar, aoSair, quieto). Sem nada que caiba, o passeio de sempre.

   - CONTORNAR (desktop): o cursor parado num card → ele dá a volta na borda
     do card, por fora, uma vez, como quem examina;
   - BRINCAR (desktop): o cursor parado perto dele → ele gira em volta do
     cursor e comemora;
   - SELEÇÃO: a pessoa selecionou um trecho → ele senta no fim da seleção;
   - GUIAR: a próxima seção chegando no pé da tela → ele vai na frente, ao
     lado do título dela, e chama;
   - LER JUNTO: rolagem parada com um título no alto → ele fica ao lado,
     olhando para ele, quieto;
   - ESPIAR: some meio escondido na borda da tela e volta com festa;
   - DORMIR: ninguém mexe em nada por SONO.dorme s → ele esmaece, quase para
     de girar e respira devagar (arcos subindo); qualquer gesto o acorda com
     festa.
   Posições: lidas só em evento (IntersectionObserver, seleção, rede); por
   quadro só a conta do caminho.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  var mini = B && B.rede && B.rede.extra;
  if (!mini || !mini.api) return;
  var A = mini.api, TAU = Math.PI * 2;
  var PAUSA = { contornar: 14, brincar: 12, selecao: 3, guiar: 16, lerJunto: 20, espiar: 26 };   /* s entre repetições */
  var SONO = { dorme: 22, acorda: 0.35 };
  var ultimo = {};
  var CARDS = '.painel, .celula, .laudo__row, .spec__item, .cenario, .qa';

  function pode(nome) { return A.relogio() - (ultimo[nome] === undefined ? -1e9 : ultimo[nome]) > PAUSA[nome]; }
  function marcar(nome) { ultimo[nome] = A.relogio(); }
  function limitar(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* no celular ele não cruza o texto: fica no trilho da margem (só desce ou sobe até a altura) */
  function xTrilho(x) { return A.celular ? A.tela.W - 10 : x; }
  function decorrido(dest) { return A.relogio() - (dest.t0 || 0); }

  /* ---------- CONTORNAR: a volta na borda de um card, por fora ---------- */
  function contornar() {
    var p = A.ponteiro;
    if (A.celular || !p.ativo || A.relogio() - (p.mexeu || -99) < 0.8) return null;
    var it = B.rede.elementoAoAcaso(p.x, p.y, 0, 2000, function (e) { return e.el.matches(CARDS) && p.x > e.x && p.x < e.x + e.w && p.y > e.y && p.y < e.y + e.h; });
    if (!it || it.w > A.tela.W * 0.9) return null;
    var M = 16, vel = 300;
    var dest = {
      xy: function () {
        /* o perímetro do retângulo (com folga M), percorrido no sentido horário a partir do canto de cima à esquerda */
        var w = it.w + 2 * M, h = it.h + 2 * M, per = 2 * (w + h), s = (decorrido(dest) * vel) % per;
        var x0 = it.x - M, y0 = it.y - M;
        if (s < w) return { x: x0 + s, y: y0 };
        if ((s -= w) < h) return { x: x0 + w, y: y0 + s };
        if ((s -= h) < w) return { x: x0 + w - s, y: y0 + h };
        return { x: x0, y: y0 + h - (s - w) };
      },
      fica: 2 * (it.w + it.h + 4 * M) / vel, quieto: true, exato: true, veloc: 1.6,
      aoChegar: function () { dest.t0 = A.relogio(); A.pulsar(0.6); }
    };
    marcar('contornar');
    return dest;
  }

  /* ---------- BRINCAR: gira em volta do cursor parado perto dele ---------- */
  function brincar() {
    var p = A.ponteiro;
    if (A.celular || !p.ativo || A.relogio() - (p.mexeu || -99) < 1 || Math.hypot(p.x - mini.x, p.y - mini.y) > 320) return null;
    var cx = p.x, cy = p.y, R = 40, voltas = 1.5, dur = 2.2;
    var dest = {
      xy: function () { var a = -Math.PI / 2 + (decorrido(dest) / dur) * voltas * TAU; return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }; },
      fica: dur, quieto: true, exato: true, veloc: 1.8,
      aoChegar: function () { dest.t0 = A.relogio(); },
      aoSair: function () { A.festejar(); }
    };
    marcar('brincar');
    return dest;
  }

  /* ---------- SELEÇÃO: senta no fim do trecho selecionado ---------- */
  var selecao = null, esperaSel = 0;
  document.addEventListener('selectionchange', function () {
    clearTimeout(esperaSel);
    esperaSel = setTimeout(function () {
      var sel = window.getSelection && window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { selecao = null; return; }
      /* (dentro de formulário, ou um trecho enorme como Ctrl+A: não) */
      var no = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (no && no.closest && no.closest('input, textarea, form, [contenteditable]')) { selecao = null; return; }
      var txt = sel.toString().trim();
      if (txt.length < 4 || txt.length > 400) { selecao = null; return; }
      var rs = sel.getRangeAt(0).getClientRects(), r = rs[rs.length - 1];
      if (!r) return;
      selecao = { x: r.right + 14, yd: r.top + r.height / 2 + A.rolagem(), t: A.relogio() };
      if (A.podeInterromper() && pode('selecao')) { var d = deSelecao(); if (d) { d.nome = 'selecao'; A.ir(d); } }
    }, 450);
  });
  function deSelecao() {
    if (!selecao || !selecao.t || A.relogio() - selecao.t > 6) return null;
    var s = selecao;
    selecao = null;
    marcar('selecao');
    return { xy: function () { return { x: xTrilho(limitar(s.x, 20, A.tela.W - 20)), y: s.yd - A.rolagem() }; }, fica: 2.6, quieto: true, vh: A.celular, veloc: 1.5, aoChegar: function () { A.pulsar(1); } };
  }

  /* ---------- GUIAR e LER JUNTO: os títulos, por IntersectionObserver ---------- */
  var proxima = null, lendo = null;
  if ('IntersectionObserver' in window) {
    /* o título de uma seção chegando no pé da tela: a próxima */
    var ioP = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { var r = es[i].boundingClientRect; proxima = { x: r.left, yd: r.top + A.rolagem(), t: A.relogio() }; }
    }, { rootMargin: '-78% 0px -4% 0px' });
    /* um título no alto da tela: o que a pessoa está lendo */
    var ioL = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        if (es[i].isIntersecting) { var r = es[i].boundingClientRect; lendo = { el: es[i].target, x: r.left, y2: r.right, yd: r.top + r.height / 2 + A.rolagem(), t: A.relogio() }; }
        else if (lendo && lendo.el === es[i].target) lendo = null;   /* saiu da faixa: não vai a um título que já foi */
      }
    }, { rootMargin: '-12% 0px -62% 0px' });
    [].forEach.call(document.querySelectorAll('main .kicker'), function (k) { ioP.observe(k); });
    [].forEach.call(document.querySelectorAll('main h2'), function (h) { ioL.observe(h); });
  }
  function guiar() {
    if (!proxima || A.relogio() - proxima.t > 3) return null;
    var g = proxima;
    proxima = null;
    marcar('guiar');
    return { xy: function () { return { x: xTrilho(limitar(g.x - 26, 18, A.tela.W - 20)), y: g.yd - A.rolagem() + 8 }; }, fica: 1.8, quieto: true, vh: A.celular, veloc: 2.2,
      aoChegar: function () { A.pulsar(1); A.festejar(); } };
  }
  function lerJunto() {
    if (!lendo || A.paradoHa() < 1.6 || A.relogio() - lendo.t > 30) return null;
    var l = lendo, ladoX = l.x > 60 ? l.x - 30 : Math.min(A.tela.W - 20, l.y2 + 24);
    marcar('lerJunto');
    return { xy: function () { return { x: xTrilho(ladoX), y: l.yd - A.rolagem() }; }, fica: 3.2, quieto: true, vh: A.celular,
      aoChegar: function () { A.olharPara((l.x + l.y2) / 2, l.yd - A.rolagem(), 3); A.acalmar(0.3); } };
  }

  /* ---------- ESPIAR: meio escondido na borda, volta com festa ---------- */
  function espiar() {
    if (Math.random() > 0.35) return null;
    var y = A.tela.H * (0.3 + Math.random() * 0.4), lado = A.celular || Math.random() < 0.6 ? 1 : -1;
    marcar('espiar');
    return { xy: function () { return { x: lado > 0 ? A.tela.W + 2 : -2, y: y }; }, fica: 1.6, quieto: true, veloc: 1.4,
      aoSair: function () { A.festejar(); } };
  }

  /* ---------- a escolha: o que a pessoa está fazendo decide a ordem ---------- */
  var ORDEM = [['selecao', deSelecao], ['guiar', guiar], ['contornar', contornar], ['brincar', brincar], ['lerJunto', lerJunto], ['espiar', espiar]];
  function escolher() {
    if (B.reduced || mini.dormindo) return null;
    for (var i = 0; i < ORDEM.length; i++) {
      if (!pode(ORDEM[i][0])) continue;
      var d = ORDEM[i][1]();
      if (d) { d.nome = ORDEM[i][0]; return d; }
    }
    return null;
  }

  /* ---------- DORMIR: ninguém mexe em nada por SONO.dorme s ---------- */
  var gesto = A.relogio();
  function acordar() {
    gesto = A.relogio();
    if (mini.dormindo > 0.5) { mini.dormindo = 0; A.festejar(); }
  }
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (ev) { window.addEventListener(ev, acordar, { passive: true }); });
  B.add('mini-vida', function (S) {
    if (B.reduced) { mini.dormindo = 0; return; }
    var dt = Math.min(0.05, S.dt / 1000), quer = A.relogio() - gesto > SONO.dorme && A.emDoca();
    /* adormece devagar (~3 s); acorda de uma vez (acordar) */
    mini.dormindo = quer ? Math.min(1, mini.dormindo + dt * SONO.acorda) : 0;
  });

  B.miniVida = { escolher: escolher, sonolento: function () { return !B.reduced && A.relogio() - gesto > SONO.dorme; } };
})();
