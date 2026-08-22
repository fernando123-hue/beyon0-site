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
    whiteHot: 0,     /* 0..1 — branco incandescente (auge na ignição do Singular) */
    shock: -1,       /* 0..1 — a onda de choque atravessando a tela; -1 = desligada */
    budget: 1,       /* 0..1 — quanto trabalho cabe neste frame */
    fps: 60,

    /* ---- REGIME: o sistema de estados (ver bloco REGIME abaixo) ---- */
    wake: 1,         /* 0..1 — presença: cai sozinho no ócio, volta na interação */
    focus: 0,        /* 0..1 — o cursor está sobre algo interativo (js/dom.js escreve) */
    sv: 0,           /* 0..1 — velocidade de scroll, suavizada */
    sdy: 0,          /* px rolados neste frame, COM SINAL — a paralaxe do campo */
    regime: 'active' /* dormant · active · focused · resonance · singularity */
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
      tocou();
    }, { passive: true });
    window.addEventListener('pointerleave', function () { S.pointerOn = false; }, { passive: true });
  }

  /* ==========================================================================
     REGIME — a arquitetura de estados

     O site não tem "efeitos ligados"; ele tem ESTADOS, e cada efeito lê o
     estado. Isso é o que impede a camada de atmosfera de virar uma coleção de
     animações independentes: quando o regime muda, tudo muda junto, porque
     todos leem o mesmo número.

       DORMANT      ninguém interage há um tempo — o sistema recolhe
       ACTIVE       há presença: cursor, scroll, teclado
       FOCUSED      o cursor está sobre algo que responde
       RESONANCE    o Pulso está atravessando
       SINGULARITY  o Estado Singular

     Ele é DERIVADO, não uma máquina paralela: `wake` vem do tempo desde a
     última interação, `focus` vem da proximidade que js/dom.js já calcula,
     e resonance/singularity são o Pulso e o Singular que já existiam. Nenhum
     temporizador novo, nenhum listener por frame — só um `Date`-livre
     `S.now` que o loop já tem.

     A ordem de prevalência é a de INTENSIDADE: o espetáculo ganha do foco,
     o foco ganha da presença. É o mesmo princípio da hierarquia visual do
     site aplicado ao tempo. */
  var OCIO = 32000;        /* ms de silêncio até começar a recolher */
  var ADORMECER = 9000;    /* ms de descida — lenta, para não ler como corte */
  var ultimoToque = 0, houveToque = true;
  function tocou() { houveToque = true; }
  if (!fine) window.addEventListener('touchstart', tocou, { passive: true });
  window.addEventListener('keydown', tocou, { passive: true });
  window.addEventListener('pointerdown', tocou, { passive: true });

  var regimeAtual = 'active';
  function regime(now) {
    if (houveToque) { houveToque = false; ultimoToque = now; }
    var parado = now - ultimoToque;
    /* alvo binário, chegada suave: o despertar é quase imediato (o site tem que
       responder à pessoa), o recolhimento é lento. Assimetria de propósito. */
    var alvoWake = parado < OCIO ? 1 : Math.max(0, 1 - (parado - OCIO) / ADORMECER);
    S.wake += (alvoWake - S.wake) * (alvoWake > S.wake ? .2 : .01);

    /* DORMANT é o CHÃO, não um degrau ao lado de `focused`. A primeira versão
       testava foco antes de presença, e um cursor esquecido em cima de um card
       mantinha o regime em `focused` para sempre: o canvas escurecia (porque
       `wake` cai de qualquer forma) enquanto o estado dizia "atenção". Sem
       presença não há atenção — testar `wake` primeiro é o que mantém os dois
       lados da arquitetura contando a mesma história. */
    var r = S.singular > .04 ? 'singularity'
          : S.pulse > .04 ? 'resonance'
          : S.wake <= .5 ? 'dormant'
          : S.focus > .55 ? 'focused'
          : 'active';
    if (r !== regimeAtual) { regimeAtual = r; S.regime = r; emit('regime', r); }
  }

  /* ---- medidas: só em scroll/resize, nunca por frame ---- */
  var alcance = 1;
  /* teto de DPR por aparelho: o canvas é tela cheia e o custo de fill-rate cresce
     com DPR². Num celular DPR 2.5-3.5 dobra o trabalho de pintura à toa — a cena
     é feita de brilhos suaves, não de texto fino, então 1,5 é indistinguível e
     corta ~40% do fill. Desktop (ponteiro fino) fica em 2; aparelho fraco, 1,25. */
  var TETO_DPR = weak ? 1.25 : (fine ? 2 : 1.5);
  function medir() {
    S.w = window.innerWidth; S.h = window.innerHeight;
    S.dpr = Math.min(window.devicePixelRatio || 1, TETO_DPR);
    alcance = Math.max(1, document.documentElement.scrollHeight - S.h);
    S.scroll = Math.min(1, window.scrollY / alcance);
  }
  medir();
  window.addEventListener('resize', function () { medir(); emit('resize'); }, { passive: true });
  /* velocidade de scroll: o delta bruto é guardado no evento e CONSUMIDO no
     frame. Guardar aqui e normalizar lá evita depender da taxa de disparo do
     scroll (que varia muito entre aparelhos) e mantém o listener em duas
     atribuições. Serve à profundidade: o campo distante reage ao movimento da
     página, e é isso que dá a leitura de paralaxe sem mover nenhum elemento. */
  var scrollAntes = 0, deltaScroll = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    S.scroll = Math.min(1, y / alcance);
    deltaScroll += y - scrollAntes; scrollAntes = y;
    tocou();
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

    /* scroll consumido uma vez por frame (ver o listener). `sdy` é o
       deslocamento COM SINAL do frame — é ele que dá paralaxe de verdade ao
       campo, porque a profundidade só lê como profundidade se cada plano
       responder ao mesmo movimento em medidas diferentes. `sv` é o módulo
       normalizado: 900px de percurso satura em 1, e o decaimento devolve o
       campo ao repouso em ~0,5s. */
    S.sdy = deltaScroll;
    S.sv += (Math.min(1, Math.abs(deltaScroll) / 900) - S.sv) * .3;
    deltaScroll = 0;

    regime(S.now);

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
  /* só com ?perf: roda um frame na mão, fora do rAF. Serve para medir o custo
     de um estado específico (Pulso, Singular, orçamento baixo) sem esperar ele
     acontecer — e para verificar o desenho em ambiente que não compõe frames.
     Lei 4: a instrumentação fica no código, não em edição temporária. */
  if (PERF) {
    window.__frame = function (vezes) {
      var n = Math.min(2000, vezes || 1), t0 = performance.now();   /* teto: não congela a aba */
      for (var v = 0; v < n; v++) for (var i = 0; i < subs.length; i++) subs[i].f(S);
      return { frames: n, msPorFrame: +((performance.now() - t0) / n).toFixed(3),
               subsistemas: subs.map(function (s) { return s.n; }) };
    };
  }
})();
