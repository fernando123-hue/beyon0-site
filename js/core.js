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
    budget: 1, fps: 60, ref: 60,
    wake: 1, focus: 0, focoAlvo: 0, sv: 0, sdy: 0,
    regime: 'active',
    /* ---- V2 ----
       boot: 0..1 — o instrumento acordando (o GSAP tweena este número no
       boot do hero; o canvas abre o diafragma e desenha o anel com ele).
       alvo: o retângulo do elemento interativo sob o cursor (viewport), ou
       null — o retículo do cursor o enquadra. Escrito por js/pagina.js em
       pointerover/out, nunca por frame. */
    boot: 0,
    alvo: null,
    /* yPercent que o scrub do GSAP aplica à caixa do reator (js/anima.js
       escreve; js/campo.js e js/profundidade.js convertem o cache de
       documento sem ler layout) */
    reatorYP: 0
  };

  /* ---- ORÇAMENTO: cai rápido ao estourar, sobe devagar ----
     Mede o CUSTO do nosso trabalho no frame (ms gastos nos subsistemas), não
     o intervalo entre frames. A versão anterior comparava o intervalo (16,7ms
     a 60Hz) com um alvo de 15ms e vivia no piso em qualquer tela de 60Hz —
     achado na revisão da V2. Um frame perdido de verdade (dt > 34ms) também
     derruba o orçamento. */
  var ALVO = 7;
  var fpsEMA = 60, custoEMA = 2;
  /* A RÉGUA DA TELA. O custo de JS não vê o custo de PINTURA (canvas grande
     numa GPU fraca ou por software): a página pode estar a 38fps com 0,6ms
     de script. Então a taxa real também manda — comparada ao TETO que esta
     tela entrega, medido nos primeiros quadros (quartil inferior dos
     intervalos), e não a um 60 presumido: uma tela de 30Hz não é lenta. */
  var REF = 60, amostras = [], reguaPronta = false;
  function regua(dt) {
    if (S.t < 4 || dt < 4) return;
    amostras.push(dt);
    if (amostras.length < 40) return;
    amostras.sort(function (a, b) { return a - b; });
    REF = Math.max(24, Math.min(120, 1000 / amostras[Math.floor(amostras.length / 4)]));
    S.ref = REF; reguaPronta = true; amostras = null;
  }
  function orcamento(dt, custo) {
    custoEMA += (custo - custoEMA) * 0.1;
    fpsEMA += (1000 / Math.max(1, dt) - fpsEMA) * 0.1;
    S.fps = fpsEMA;
    if (!reguaPronta) regua(dt);
    var lento = reguaPronta && fpsEMA < REF * 0.8;
    if (custoEMA > ALVO || dt > 34 || lento) S.budget = Math.max(0.25, S.budget - 0.02);
    else if (custoEMA < ALVO * 0.6 && (!reguaPronta || fpsEMA > REF * 0.9)) S.budget = Math.min(1, S.budget + 0.004);
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
  /* a altura do documento muda sem resize (FAQ abrindo, fonte chegando,
     palavra trocando): um observador só, e todo cache de retângulo remede.
     Coalescido num rAF: várias mutações no mesmo quadro viram um 'remedir'. */
  if ('ResizeObserver' in window) {
    var remedirPendente = false;
    try {
      new ResizeObserver(function () {
        if (remedirPendente) return;
        remedirPendente = true;
        requestAnimationFrame(function () { remedirPendente = false; medir(); emit('remedir'); });
      }).observe(document.body);
    } catch (e) { /* sem observador: os eventos de load/fonts continuam valendo */ }
  }
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
  var antes = 0, rodando = false, dtAcumulado = 0;
  function frame(now) {
    if (document.hidden) { rodando = false; return; }
    var dtBruto = antes ? Math.min(50, now - antes) : 16;
    antes = now;
    /* DORMENTE: ninguém interage há ~40s — o canvas desenha a 15fps. O dt
       acumulado mantém velocidades e ângulos certos (tudo escala por S.dt). */
    dtAcumulado += dtBruto;
    if (S.regime === 'dormant' && (S.t & 3) !== 0 && dtAcumulado < 60) { S.t++; requestAnimationFrame(frame); return; }
    S.dt = Math.min(80, dtAcumulado); dtAcumulado = 0;
    S.now = now; S.t++;
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
    /* dormente a 15fps: o dt longo é escolha, não lentidão — não derruba o orçamento */
    orcamento(S.regime === 'dormant' ? 16 : S.dt, performance.now() - inicio);
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
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduzir(sim) {
    /* o sistema manda: com prefers-reduced-motion ligado, "ativar" não ativa */
    reduced = window.BEYON.reduced = !!sim || mqReduce.matches;
    html.classList.toggle('menos-movimento', !!sim);
    try { localStorage.setItem('bz-menos-movimento', sim ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    emit('reduzir', reduced);
  }

  try {
    mqReduce.addEventListener('change', function (e) { if (e.matches) reduzir(true); });
  } catch (e) { /* navegador antigo */ }

  window.BEYON = {
    S: S, add: add, remove: remove, on: on, off: off, emit: emit, iniciar: iniciar, reduzir: reduzir,
    reduced: reduced, sistemaReduz: mqReduce.matches, fine: fine, saveData: saveData, weak: weak, PERF: PERF
  };

  /* BOOT: 'booted' só depois que TODO script `defer` rodou (DOMContentLoaded),
     porque emit não guarda histórico. */
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('booted');
    emit('booted');
  });
})();
