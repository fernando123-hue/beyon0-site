/* ==========================================================================
   NÚCLEO — estado, loop único e orçamento de frame.

   Três leis, tiradas da medição (docs/auditoria-performance.md):

   1. Um rAF só. Todo subsistema se registra aqui e é chamado por frame.
   2. Nada visual contínuo toca o CSS. Quem desenha é o canvas.
   3. O orçamento é verificado ANTES de gastar. A versão anterior do site só
      cortava trabalho depois de 2,2s travando, e num aparelho oscilando perto
      do limite isso nunca chegava a acontecer.

   Exposto em window.BEYON porque os arquivos são scripts clássicos (o projeto
   não tem build). A superfície é pequena e explícita de propósito.
   ========================================================================== */
(function () {
  'use strict';

  var PERF = /[?&]perf\b/.test(location.search);

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var weak = (navigator.deviceMemory || 8) < 4 || (navigator.hardwareConcurrency || 8) <= 4;

  /* ---- estado compartilhado: subsistemas LEEM, o núcleo escreve ---- */
  var S = {
    t: 0,            /* frames desde o boot */
    dt: 16,          /* ms do último frame, limitado */
    now: 0,
    w: 0, h: 0, dpr: 1,
    scroll: 0,       /* 0..1 da jornada */
    px: 0, py: 0,    /* ponteiro suavizado, em px */
    pointerOn: false,
    energy: 0,       /* 0..1 — sobe com a jornada e a interação */
    pulse: 0,        /* 0..1 — o Pulso em curso */
    pulseFront: 0,   /* 0..1 — a frente percorrendo a cadeia */
    singular: 0,     /* 0..1 — o Estado Singular */
    warmth: 0,       /* 0..1 — ciano → dourado */
    budget: 1,       /* 0..1 — quanto trabalho cabe neste frame */
    fps: 60
  };

  /* ---- ORÇAMENTO ----
     `budget` cai quando o frame passa do alvo e volta a subir quando sobra
     folga. Diferente da versão anterior, ele SOBE de novo: cortar para sempre
     punia o aparelho por um engasgo momentâneo. A subida é lenta e a descida
     rápida, então ele nunca fica oscilando de forma visível. */
  var ALVO = 15;              /* ms — folga sobre os 16,7 de 60fps */
  var fpsEMA = 60, frameEMA = 16;

  function orcamento(dt) {
    frameEMA += (dt - frameEMA) * 0.1;
    fpsEMA += (1000 / Math.max(1, dt) - fpsEMA) * 0.1;
    S.fps = fpsEMA;
    if (frameEMA > ALVO) S.budget = Math.max(0.25, S.budget - 0.02);
    else if (frameEMA < ALVO * 0.72) S.budget = Math.min(1, S.budget + 0.004);
  }

  /* ---- subsistemas ---- */
  var subs = [];
  function add(name, fn) { subs.push({ n: name, f: fn, ms: 0, pior: 0, cnt: 0 }); }

  /* ---- ponteiro: guardado bruto, suavizado no loop (nunca por evento) ---- */
  var tx = 0, ty = 0;
  if (fine) {
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY; S.pointerOn = true;
    }, { passive: true });
    window.addEventListener('pointerleave', function () { S.pointerOn = false; }, { passive: true });
  }

  /* ---- medidas: só em scroll/resize, nunca por frame ---- */
  var alcance = 1;
  function medir() {
    S.w = window.innerWidth; S.h = window.innerHeight;
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    alcance = Math.max(1, document.documentElement.scrollHeight - S.h);
    S.scroll = Math.min(1, window.scrollY / alcance);
  }
  medir();
  window.addEventListener('resize', function () { medir(); emit('resize'); }, { passive: true });
  window.addEventListener('scroll', function () {
    S.scroll = Math.min(1, window.scrollY / alcance);
  }, { passive: true });

  /* ---- eventos internos: o organismo avisa, ninguém consulta ---- */
  var ouvintes = {};
  function on(ev, fn) { (ouvintes[ev] || (ouvintes[ev] = [])).push(fn); }
  function emit(ev, dados) {
    var l = ouvintes[ev]; if (!l) return;
    for (var i = 0; i < l.length; i++) l[i](dados);
  }

  /* ---- o loop ---- */
  var antes = 0, rodando = false;
  function frame(now) {
    if (document.hidden) { rodando = false; return; }
    S.dt = antes ? Math.min(50, now - antes) : 16;
    antes = now; S.now = now; S.t++;

    orcamento(S.dt);

    /* ponteiro suavizado uma vez por frame */
    if (S.pointerOn) { S.px += (tx - S.px) * 0.14; S.py += (ty - S.py) * 0.14; }

    /* energia: sobe com a jornada e com a presença, respira devagar */
    var alvo = S.scroll * 0.62 + (S.pointerOn ? 0.1 : 0) + 0.08;
    S.energy += (Math.min(1, alvo) - S.energy) * 0.03;

    if (PERF) {
      for (var i = 0; i < subs.length; i++) {
        var s = subs[i], t0 = performance.now();
        s.f(S);
        var ms = performance.now() - t0;
        s.ms += ms; s.cnt++; if (ms > s.pior) s.pior = ms;
      }
      registrarFrame(S.dt);
    } else {
      for (var j = 0; j < subs.length; j++) subs[j].f(S);
    }

    requestAnimationFrame(frame);
  }

  function iniciar() {
    if (rodando) return;
    rodando = true; antes = 0;
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) iniciar();
  });

  /* ---- profilador (só com ?perf) ---- */
  var frames = [], pior = null;
  function registrarFrame(dt) {
    frames.push(dt); if (frames.length > 3000) frames.shift();
    if (!pior || dt > pior.dt) {
      pior = { dt: +dt.toFixed(1), pulse: +S.pulse.toFixed(2), singular: +S.singular.toFixed(2), budget: +S.budget.toFixed(2) };
    }
  }
  if (PERF) {
    window.__perf = function (zerar) {
      var f = frames.slice().sort(function (a, b) { return a - b; });
      var q = function (p) { return f.length ? +f[Math.min(f.length - 1, Math.floor(f.length * p))].toFixed(1) : 0; };
      var out = {
        frames: f.length,
        fpsMediano: f.length ? +(1000 / f[Math.floor(f.length / 2)]).toFixed(1) : 0,
        frameMs: { p50: q(.5), p95: q(.95), p99: q(.99) },
        travasAcimaDe33ms: f.filter(function (d) { return d > 33; }).length,
        piorFrame: pior,
        budget: +S.budget.toFixed(2),
        porSubsistema: subs.map(function (s) {
          return { nome: s.n, mediaMs: +(s.ms / Math.max(1, s.cnt)).toFixed(3), piorMs: +s.pior.toFixed(2) };
        }).sort(function (a, b) { return b.piorMs - a.piorMs; })
      };
      if (zerar) { frames = []; pior = null; subs.forEach(function (s) { s.ms = 0; s.cnt = 0; s.pior = 0; }); }
      return out;
    };
  }

  window.BEYON = {
    S: S, add: add, on: on, emit: emit, iniciar: iniciar,
    reduced: reduced, fine: fine, saveData: saveData, weak: weak, PERF: PERF
  };
})();
