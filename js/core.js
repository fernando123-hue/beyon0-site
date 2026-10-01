/* ==========================================================================
   NÚCLEO — estado, loop único e orçamento de frame.

   Três leis, tiradas da medição (docs/auditoria-performance.md):
   1. Um rAF só. Todo subsistema se registra aqui e é chamado por frame.
   2. Nada visual contínuo toca o CSS. Quem desenha é o canvas.
   3. O orçamento é verificado ANTES de gastar.

   Exposto em window.BEYON porque os arquivos são scripts clássicos (o projeto
   não tem build). A superfície é pequena e explícita de propósito.
   ========================================================================== */
(function () {
  'use strict';

  var PERF = /[?&]perf\b/.test(location.search);
  var html = document.documentElement;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
                html.classList.contains('menos-movimento');
  var fine = window.matchMedia('(pointer: fine) and (hover: hover)').matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var weak = (navigator.deviceMemory || 8) < 4 || (navigator.hardwareConcurrency || 8) <= 4;

  /* ---- estado compartilhado: subsistemas LEEM, o núcleo escreve ---- */
  var S = {
    t: 0, dt: 16, now: 0,
    w: 0, h: 0, dpr: 1,
    scroll: 0, scrollY: 0,   /* 0..1 da jornada · px */
    px: 0, py: 0, pointerOn: false,
    energy: 0,
    pulse: 0, pulseFront: 0,
    singular: 0, warmth: 0, whiteHot: 0, shock: -1,
    budget: 1, fps: 60,
    wake: 1, focus: 0, focoAlvo: 0, sv: 0, sdy: 0,
    regime: 'active',
    /* ---- V2 ----
       boot: 0..1 — o instrumento acordando (o GSAP tweena este número no
       boot do hero; o canvas abre o diafragma e desenha o anel com ele).
       alvo: o retângulo do elemento interativo sob o cursor (viewport), ou
       null — o retículo do cursor o enquadra. Escrito por js/pagina.js em
       pointerover/out, nunca por frame. */
    boot: 0,
    alvo: null
  };

  /* ---- ORÇAMENTO: cai rápido ao estourar, sobe devagar ----
     Mede o CUSTO do nosso trabalho no frame (ms gastos nos subsistemas), não
     o intervalo entre frames. A versão anterior comparava o intervalo (16,7ms
     a 60Hz) com um alvo de 15ms e vivia no piso em qualquer tela de 60Hz —
     achado na revisão da V2. Um frame perdido de verdade (dt > 34ms) também
     derruba o orçamento. */
  var ALVO = 7;
  var fpsEMA = 60, custoEMA = 2;
  function orcamento(dt, custo) {
    custoEMA += (custo - custoEMA) * 0.1;
    fpsEMA += (1000 / Math.max(1, dt) - fpsEMA) * 0.1;
    S.fps = fpsEMA;
    if (custoEMA > ALVO || dt > 34) S.budget = Math.max(0.25, S.budget - 0.02);
    else if (custoEMA < ALVO * 0.6) S.budget = Math.min(1, S.budget + 0.004);
  }

  /* ---- subsistemas ---- */
  var subs = [];
  function add(name, fn) { subs.push({ n: name, f: fn, ms: 0, pior: 0, cnt: 0 }); }
  function remove(name) {
    for (var i = subs.length - 1; i >= 0; i--) if (subs[i].n === name) subs.splice(i, 1);
  }

  /* ---- ponteiro: guardado bruto, suavizado no loop ---- */
  var tx = 0, ty = 0;
  if (fine) {
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!S.pointerOn) { S.pointerOn = true; S.px = tx; S.py = ty; }
      tocou();
    }, { passive: true });
    document.addEventListener('pointerleave', function () { S.pointerOn = false; }, { passive: true });
  }

  /* ---- REGIME: dormant · active · focused · resonance · singularity ---- */
  var OCIO = 32000, ADORMECER = 9000;
  var ultimoToque = 0, houveToque = true;
  function tocou() { houveToque = true; }
  if (!fine) window.addEventListener('touchstart', tocou, { passive: true });
  window.addEventListener('keydown', tocou, { passive: true });
  window.addEventListener('pointerdown', tocou, { passive: true });

  var regimeAtual = 'active';
  function regime(now) {
    if (houveToque) { houveToque = false; ultimoToque = now; }
    var parado = now - ultimoToque;
    var alvoWake = parado < OCIO ? 1 : Math.max(0, 1 - (parado - OCIO) / ADORMECER);
    S.wake += (alvoWake - S.wake) * (alvoWake > S.wake ? .2 : .01);
    var r = S.singular > .04 ? 'singularity'
          : S.pulse > .04 ? 'resonance'
          : S.wake <= .5 ? 'dormant'
          : S.focus > .55 ? 'focused'
          : 'active';
    if (r !== regimeAtual) { regimeAtual = r; S.regime = r; emit('regime', r); }
  }

  /* ---- medidas: só em scroll/resize ---- */
  var alcance = 1;
  var TETO_DPR = weak ? 1.25 : (fine ? 2 : 1.5);
  function medir() {
    S.w = window.innerWidth; S.h = window.innerHeight;
    S.dpr = Math.min(window.devicePixelRatio || 1, TETO_DPR);
    alcance = Math.max(1, document.documentElement.scrollHeight - S.h);
    S.scrollY = window.scrollY;
    S.scroll = Math.min(1, S.scrollY / alcance);
  }
  medir();
  window.addEventListener('resize', function () { medir(); emit('resize'); }, { passive: true });
  var scrollAntes = 0, deltaScroll = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    S.scrollY = y;
    S.scroll = Math.min(1, y / alcance);
    deltaScroll += y - scrollAntes; scrollAntes = y;
    tocou();
  }, { passive: true });

  /* ---- eventos internos ---- */
  var ouvintes = {};
  function on(ev, fn) { (ouvintes[ev] || (ouvintes[ev] = [])).push(fn); }
  function off(ev, fn) {
    var l = ouvintes[ev]; if (!l) return;
    var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
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
    if (S.pointerOn) { S.px += (tx - S.px) * 0.16; S.py += (ty - S.py) * 0.16; }
    S.focus += (S.focoAlvo - S.focus) * 0.12;
    var alvo = S.scroll * 0.62 + (S.pointerOn ? 0.1 : 0) + 0.08;
    S.energy += (Math.min(1, alvo) - S.energy) * 0.03;
    S.sdy = deltaScroll;
    S.sv += (Math.min(1, Math.abs(deltaScroll) / 900) - S.sv) * .3;
    deltaScroll = 0;
    regime(S.now);

    /* um subsistema que lança não derruba os outros nem o laço */
    var inicio = performance.now();
    if (PERF) {
      for (var i = 0; i < subs.length; i++) {
        var s = subs[i], t0 = performance.now();
        try { s.f(S); } catch (e) { falhou(s, e); }
        var ms = performance.now() - t0;
        s.ms += ms; s.cnt++; if (ms > s.pior) s.pior = ms;
      }
      registrarFrame(S.dt);
    } else {
      for (var j = 0; j < subs.length; j++) {
        try { subs[j].f(S); } catch (e) { falhou(subs[j], e); }
      }
    }
    orcamento(S.dt, performance.now() - inicio);
    requestAnimationFrame(frame);
  }
  /* três falhas seguidas e o subsistema sai do laço — o resto do site segue */
  function falhou(sub, e) {
    sub.erros = (sub.erros || 0) + 1;
    if (sub.erros >= 3) remove(sub.n);
    if (PERF && window.console) console.warn('[core] ' + sub.n + ' falhou:', e && e.message);
  }
  function iniciar() {
    if (rodando) return;
    rodando = true; antes = 0;
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) iniciar(); });

  /* ---- profilador (só com ?perf) ---- */
  var frames = [], pior = null;
  function registrarFrame(dt) {
    frames.push(dt); if (frames.length > 3000) frames.shift();
    if (!pior || dt > pior.dt) pior = { dt: +dt.toFixed(1), pulse: +S.pulse.toFixed(2), singular: +S.singular.toFixed(2), budget: +S.budget.toFixed(2) };
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
        piorFrame: pior, budget: +S.budget.toFixed(2),
        porSubsistema: subs.map(function (s) {
          return { nome: s.n, mediaMs: +(s.ms / Math.max(1, s.cnt)).toFixed(3), piorMs: +s.pior.toFixed(2) };
        }).sort(function (a, b) { return b.piorMs - a.piorMs; })
      };
      if (zerar) { frames = []; pior = null; subs.forEach(function (s) { s.ms = 0; s.cnt = 0; s.pior = 0; }); }
      return out;
    };
    window.__frame = function (vezes) {
      var n = Math.min(2000, vezes || 1), t0 = performance.now();
      for (var v = 0; v < n; v++) for (var i = 0; i < subs.length; i++) subs[i].f(S);
      return { frames: n, msPorFrame: +((performance.now() - t0) / n).toFixed(3) };
    };
  }

  /* ---- "menos movimento" em tempo de execução (interruptor do rodapé) ----
     Vira `reduced` para os subsistemas e avisa quem precisa desmontar. */
  function reduzir(sim) {
    reduced = window.BEYON.reduced = sim || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    html.classList.toggle('menos-movimento', !!sim);
    try { localStorage.setItem('bz-menos-movimento', sim ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    emit('reduzir', reduced);
  }

  try {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
      if (e.matches) reduzir(true);
    });
  } catch (e) { /* navegador antigo */ }

  window.BEYON = {
    S: S, add: add, remove: remove, on: on, off: off, emit: emit, iniciar: iniciar, reduzir: reduzir,
    reduced: reduced, fine: fine, saveData: saveData, weak: weak, PERF: PERF
  };

  /* BOOT: 'booted' só depois que TODO script `defer` rodou (DOMContentLoaded),
     porque emit não guarda histórico. */
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('booted');
    emit('booted');
  });
})();
