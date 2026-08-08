/* ============================================================
   beyon.0 — main.js
   1. Config (WhatsApp, ambiente)
   2. Reveals + nav
   3. Sistema global de ponteiro (luz única, magnetismo, tilt)
   4. O Medidor (assinatura — só números reais)
   Fonte da verdade visual: docs/design-tokens.md
   ============================================================ */

(function () {
  'use strict';

  /* ========== 1. CONFIG ========== */
  var WHATSAPP_NUMBER = '5521977167944';
  var WHATSAPP_MSG = 'Oi! Vim pelo site da beyon.0 e quero um orçamento pro meu site.';
  var WA_LINK = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(WHATSAPP_MSG);


  /* ---- PROFILADOR: desligado por padrão, zero custo sem ?perf ---- */
  var PERF = /[?&]perf\b/.test(location.search);
  var perfSubs = Object.create(null), perfFrames = [], perfLast = 0, perfWorst = null;
  function perfFrame(now) {
    if (perfLast) {
      var dt = now - perfLast;
      perfFrames.push(dt);
      if (perfFrames.length > 2000) perfFrames.shift();
      /* guarda o retrato do organismo no pior frame visto até agora */
      if (!perfWorst || dt > perfWorst.dt) {
        var R = EnergyField.res, S = EnergyField.sing;
        perfWorst = {
          dt: dt,
          res: R.active ? R.phase : 'idle',
          sing: S.active ? S.phase : 'idle',
          warmth: +(S.warmth || 0).toFixed(2),
          quality: EnergyField.quality
        };
      }
    }
    perfLast = now;
  }
  function perfSub(name, ms) {
    var e = perfSubs[name] || (perfSubs[name] = { n: 0, soma: 0, pior: 0 });
    e.n++; e.soma += ms; if (ms > e.pior) e.pior = ms;
  }
  if (PERF) {
    window.__perf = function (reset) {
      var f = perfFrames.slice().sort(function (a, b) { return a - b; });
      var p = function (q) { return f.length ? +f[Math.min(f.length - 1, Math.floor(f.length * q))].toFixed(1) : 0; };
      var linhas = Object.keys(perfSubs).map(function (k) {
        var e = perfSubs[k];
        return { subsistema: k, mediaMs: +(e.soma / e.n).toFixed(2), piorMs: +e.pior.toFixed(2) };
      }).sort(function (a, b) { return b.piorMs - a.piorMs; });
      var out = {
        frames: f.length,
        fpsMediano: f.length ? +(1000 / f[Math.floor(f.length / 2)]).toFixed(1) : 0,
        frameMs: { p50: p(0.5), p95: p(0.95), p99: p(0.99), pior: p(0.999) },
        travas_acima_de_33ms: f.filter(function (d) { return d > 33; }).length,
        piorFrame: perfWorst,
        porSubsistema: linhas
      };
      if (reset) { perfSubs = Object.create(null); perfFrames = []; perfWorst = null; }
      return out;
    };
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pointerFine = window.matchMedia('(pointer: fine)').matches;

  /* PALETA — fonte única de verdade: os tokens do :root (docs/design-tokens.md).
     Lida UMA vez no boot, antes de a metamorfose do Singular sobrescrever o
     :root, para que canvas e CSS nunca divirjam. Os literais são só rede de
     segurança caso a folha de estilo não carregue. */
  var PALETTE = (function () {
    var cs = getComputedStyle(document.documentElement);
    function rgb(name, fallback) {
      var v = (cs.getPropertyValue(name) || '').trim();
      return v ? v.split(/[\s,]+/).slice(0, 3).join(',') : fallback;
    }
    return {
      glow: rgb('--glow-rgb', '0,245,255'),
      hi: rgb('--hi-rgb', '159,248,255'),
      core: rgb('--core-rgb', '242,254,255'),
      gold: rgb('--gold-rgb', '255,201,107')
    };
  })();
  function rgbTriple(s) { var p = s.split(','); return [+p[0], +p[1], +p[2]]; }

  /* ===== HALO EM SPRITE — a otimização mais importante do desenho =====
     Praticamente todo brilho do site é o mesmo desenho: um degradê radial que
     vai da cor até transparente. Criar esse degradê a cada chamada obriga a CPU
     a rasterizar o círculo inteiro toda vez, e o site fazia isso dezenas de
     vezes por frame — as duas brumas do campo, os até 22 halos de memória, e um
     bloom por NÓ DE ÓRBITA do reator (laço aninhado). Era o custo contínuo que
     segurava tudo na casa dos 20-30fps.

     Aqui o degradê é desenhado UMA vez por cor num sprite pequeno; depois cada
     halo é só um drawImage escalado — cópia acelerada em vez de rasterização.
     O sprite pode ser pequeno porque é um degradê liso: não há detalhe algum
     para preservar ao ampliar.

     A cor muda durante o Singular, então o cache é limitado por um teto. */
  var HALO_PX = 192, haloCache = Object.create(null), haloKeys = [];
  function haloSprite(rgb) {
    var s = haloCache[rgb];
    if (s) return s;
    var c = document.createElement('canvas');
    c.width = c.height = HALO_PX;
    var g = c.getContext('2d'), h = HALO_PX / 2;
    var gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, HALO_PX, HALO_PX);
    haloCache[rgb] = c;
    haloKeys.push(rgb);
    if (haloKeys.length > 48) delete haloCache[haloKeys.shift()];
    return c;
  }
  /* desenha um halo de raio r centrado em (x,y) com opacidade a */
  function drawHalo(ctx, x, y, r, rgb, a) {
    if (!(a > 0.002) || !(r > 0)) return;
    var prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * (a > 1 ? 1 : a);
    ctx.drawImage(haloSprite(rgb), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = prev;
  }

  /* ========== GSAP — motor de animação (window.gsap, UMD vendorado) ==========
     Plugins registrados no boot: ScrollTrigger, SplitText, TextPlugin,
     ScrambleTextPlugin. Config padrão de importação p/ projeto SEM build:
     a lib e os plugins chegam como globais via <script defer> no index.html;
     aqui só detectamos e registramos.

     REGRA SAGRADA (1 rAF único): as timelines mestre devem rodar `paused:true` +
     seek() pelo loop único do organismo — o gsap é motor de interpolação/
     keyframes, NUNCA um segundo loop. `lagSmoothing(0)` desliga o ajuste de
     tempo do ticker interno (quem controla o relógio é o nosso loop). */
  var GSAP = window.gsap || null;
  var hasGsap = !!GSAP && typeof GSAP.timeline === 'function';
  if (hasGsap) {
    var gsapPlugins = ['ScrollTrigger', 'SplitText', 'TextPlugin', 'ScrambleTextPlugin']
      .map(function (n) { return window[n]; })
      .filter(Boolean);
    if (gsapPlugins.length) GSAP.registerPlugin.apply(GSAP, gsapPlugins);
    GSAP.ticker.lagSmoothing(0);
  }

  document.querySelectorAll('[data-wa]').forEach(function (el) {
    el.setAttribute('href', WA_LINK);
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');   /* nunca depender do markup p/ isolar a aba */
  });

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* LOGO — a marca é o wordmark em texto. O logo em vídeo foi removido a pedido
     do dono; com ele saiu todo este subsistema (detecção de codec, fallback e
     o IntersectionObserver que pausava o vídeo do rodapé fora de tela). */

  /* ---------- INTRO (vídeo de abertura) ---------- */
  (function introSequence() {
    var intro = document.getElementById('intro');
    var vid = document.getElementById('introVid');
    var skip = document.getElementById('introSkip');
    if (!intro || !vid) return;

    /* reduced-motion: sem intro. E um vídeo de dezenas de MB não pode sequestrar
       quem está no plano de dados ou em rede fraca — mesma política de guarda que
       o campo neural já aplica. Nesses casos o site abre direto. */
    var conn = navigator.connection;
    var thinPipe = !!conn && (conn.saveData === true ||
      conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g');
    if (reduced || thinPipe) { finish(true); return; }

    var done = false;
    function finish(instant) {
      if (done) return;
      done = true;
      document.body.classList.remove('intro-active');
      /* boot começa junto com a fade da intro: o hero "acorda"
         enquanto o vídeo se dissolve, sem piscar */
      document.body.classList.add('booted');
      intro.classList.add('intro--done');
      try { vid.pause(); } catch (e) {}
      setTimeout(function () {
        if (intro.parentNode) intro.parentNode.removeChild(intro);
      }, instant ? 0 : 900);
    }

    document.body.classList.add('intro-active');

    vid.addEventListener('ended', function () { finish(false); });
    vid.addEventListener('error', function () { finish(true); });
    if (skip) skip.addEventListener('click', function () { finish(false); });
    /* trava de segurança: se o vídeo travar, entra após duração + folga */
    vid.addEventListener('loadedmetadata', function () {
      var cap = Math.min(30000, (vid.duration || 12) * 1000 + 2000);
      setTimeout(function () { finish(false); }, cap);
    });

    /* o download começa AQUI, depois dos guardas acima — nunca no parser.
       Ver o comentário do <video> no index.html. */
    var src = vid.getAttribute('data-src');
    if (!src) { finish(true); return; }
    vid.src = src;

    /* tenta tocar; se o autoplay for bloqueado, pula */
    var p = vid.play();
    if (p && p.catch) p.catch(function () { finish(true); });

    /* botão de pular aparece após 1.2s */
    if (skip) setTimeout(function () { skip.classList.add('show'); }, 1200);
    /* fallback se metadata nunca carregar */
    setTimeout(function () { if (!done && (!vid.duration || isNaN(vid.duration))) finish(true); }, 8000);
  })();

  /* ========== 2. REVEALS + NAV ========== */
  document.querySelectorAll('[data-stagger]').forEach(function (group) {
    var kids = group.querySelectorAll('.reveal');
    kids.forEach(function (el, i) { el.style.setProperty('--rd', (i * 60) + 'ms'); });
  });

  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  var nav = document.getElementById('nav');
  var navScrolled = false;

  /* roda a cada frame no loop único: só toca no DOM quando o estado realmente vira */
  function updateNav() {
    var on = window.scrollY > 40;
    if (!nav || on === navScrolled) return;
    navScrolled = on;
    nav.classList.toggle('scrolled', on);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  /* ========== 3. SISTEMA GLOBAL DE PONTEIRO ========== */
  var px = innerWidth / 2, py = innerHeight / 2;
  var tx = px, ty = py;
  var pointerActive = false;

  /* ---- núcleo compartilhado: 1 estado, 1 rAF, subsistemas plugam aqui ----
     Fonte da verdade do organismo. Cada subsistema registra um tick(now)
     via EnergyField.add(); o loop único chama todos por frame. Ver
     docs/specs/energy-system.md. */
  var EnergyField = {
    subs: [],
    E: 0,        /* energia global acumulada — cresce com navegação (Fase 1) */
    t: 0,        /* tempo do organismo, em frames */
    quality: 1,  /* rede de fps: 1 → 0.62 → 0.38. Subsistemas cortam trabalho conforme cai */
    /* RESSONÂNCIA — estado compartilhado de um "acontecimento" do organismo.
       Substitui o antigo pulse/beat. UM orquestrador (updateEnergy) escreve a
       máquina de estados; TODOS os subsistemas leem e reagem no próprio tick,
       sem animações competindo. Ver docs/specs/energy-system.md. */
    res: {
      active: false, phase: 'idle', gen: 0,
      amp: 0,      /* envelope global 0..1 (sobe no release, decai no eco) */
      charge: 0,   /* tensão do silêncio/compressão 0..1 (o "prender a respiração") */
      front: 0,    /* posição da frente da onda percorrendo a cadeia 0..1 */
      reveal: 0,   /* envelope da revelação temporária 0..1 */
      space: 0,    /* compressão espacial 0..1 (o vazio entre os elos participa) */
      power: 0, seed: 0,
      arch: '',    /* arquétipo do evento atual (core/web/swarm/deep) */
      w: null,     /* pesos dos elos do arquétipo (o sistema "decide" a ênfase) */
      _c: 0, _r: 0, _e: 0   /* offsets de fase p/ derivar o rótulo (overlap) */
    },
    /* humor persistente: muda de leve a cada ressonância → o organismo nunca
       volta idêntico. Limites travados p/ não ferir a identidade visual. */
    mood: { glow: 1, flow: 0, rate: 1, cursor: 1 },
    /* ESTADO SINGULAR — o evento raro em que a IA assume o controle absoluto.
       Leis novas enquanto active: cursor perde autoridade (1-grip), partículas
       orbitam o núcleo, energia ESQUENTA (warmth: ciano→branco→dourado estelar).
       Timeline mestre própria; subsistemas SÓ observam. */
    sing: {
      active: false, phase: 'idle',
      amp: 0,       /* envelope global 0..1 */
      grip: 0,      /* domínio da IA 0..1 → autoridade do cursor = 1-grip */
      warmth: 0,    /* temperatura 0..1: 0=ciano, .5=branco incandescente, 1=dourado estelar */
      depth: 0,     /* expansão de profundidade 0..1 (o espaço muda) */
      front: 0,     /* reorganização propagando a partir do núcleo 0..1 */
      reveal: 0,    /* circuitos/bordas revelados — sustentado no ápice 0..1 */
      breath: 0,    /* respiração lenta do núcleo no ápice (derivada, não anima nada) */
      strain: 0,    /* COMPRESSÃO dentro do núcleo — antes da interface mudar 0..1 */
      hush: 0,      /* instante de silêncio visual absoluto antes da transcendência */
      power: 1, _s: 0, _t: 0, _a: 0   /* fim da compressão / transcendência / ápice */
    },
    add: function (tick, name) { tick._n = name || ('sub' + this.subs.length); this.subs.push(tick); return tick; },
    /* ---- PROFILADOR (só com ?perf) ----
       Mede o custo de cada subsistema por frame e guarda o pior frame de cada
       um, junto do estado do organismo no instante do pico. Serve para achar
       QUEM causa a queda repentina no Pulso e no Singular, em vez de deduzir.
       Uso: abrir o site com ?perf e chamar __perf() no console. */
    /* PRIMITIVA 1: excitação de um elo da cadeia na posição pos∈[0..1]
       (núcleo=0, campo=0.12, conexões=0.25, partículas=0.40, tipografia=0.55,
       cards=0.70, botões=0.85, fundo=1.0). Uma corcova gaussiana viaja com a
       frente da ressonância: antes de chegar ≈0; ao passar, acende; depois
       relaxa junto com amp. É o que faz a energia PROPAGAR em ordem. */
    stageExc: function (pos) {
      var r = this.res;
      if (!r.active) return 0;
      var d = r.front - pos;
      return Math.exp(-(d * d) / 0.05) * r.amp;
    }
  };

  if (pointerFine) {
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      pointerActive = true;
    }, { passive: true });
  }

  /* cards acendem por toque no mobile (.is-lit persiste e informa;
     no desktop o :hover do CSS resolve sozinho) */
  if (window.matchMedia('(hover: none)').matches) {
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.lit');
      if (!card) return;
      var wasLit = card.classList.contains('is-lit');
      document.querySelectorAll('.lit.is-lit').forEach(function (c) {
        c.classList.remove('is-lit');
      });
      if (!wasLit) card.classList.add('is-lit');
    });
  }

  var magnets = [];
  if (pointerFine && !reduced) {
    document.querySelectorAll('.magnetic').forEach(function (el) {
      magnets.push({ el: el, x: 0, y: 0, vx: 0, vy: 0 });
    });
  }

  var tilts = [];
  if (pointerFine && !reduced) {
    document.querySelectorAll('.tilt').forEach(function (el) {
      var st = { el: el, rx: 0, ry: 0, vrx: 0, vry: 0, over: false };
      el.addEventListener('pointerenter', function () { st.over = true; });
      el.addEventListener('pointerleave', function () { st.over = false; });
      tilts.push(st);
    });
  }

  function spring(state, kx, ky, stiff, damp) {
    state.vx += (kx - state.x) * stiff; state.vx *= damp; state.x += state.vx;
    state.vy += (ky - state.y) * stiff; state.vy *= damp; state.y += state.vy;
  }

  var fpsEMA = 60, lastFrame = 0;

  /* ---- ENERGIA ACUMULADA + RESSONÂNCIA (substitui o antigo batimento) ----
     E (0..1) cresce com a navegação: profundidade de scroll com ratchet
     (efReach) que guarda quão fundo o usuário já foi. A RESSONÂNCIA é um
     acontecimento, não um timer: um só orquestrador roda a máquina de estados
     (silêncio → compressão → release → eco) e escreve em EnergyField.res; os
     subsistemas leem esse estado e reagem cada um no seu tick. */
  var efReach = 0, efScrollMax = 1, efLastCssE = -1, efLastPar = -999;
  var efDt = 16, efPrevNow = 0;      /* dt real do frame — o acúmulo não pode depender do refresh */

  /* REDE DE PROTEÇÃO DE FPS (substitui o watchPerf do vórtice, que morreu com a
     seção 5). Uma só, cobrindo o canvas neural + AI Core. Só desce (nunca sobe):
     evita oscilação. Os subsistemas leem EnergyField.quality e cortam trabalho. */
  var qLowMs = 0, qHighMs = 0, shineOn = false, shineBurned = false;
  /* REFRAÇÃO CARA (backdrop-filter nas placas) — política INVERTIDA.
     Antes ela nascia ligada e só era desligada no PISO da escada, o que exigia
     dois degraus (≥4,4s de FPS ruim) e, num aparelho oscilando por volta dos
     46fps, nunca acontecia: o site travava para sempre no custo máximo.
     Agora ela nasce DESLIGADA e só entra se o aparelho provar folga sustentada.
     Uma vez perdida, não volta — a escada de qualidade é de via única, e
     religar a refração seria justamente o que derrubaria o FPS de novo. */
  var SHINE_FPS = 57, SHINE_MS = 2500;
  function setShine(on) {
    if (on === shineOn) return;
    shineOn = on;
    document.body.classList.toggle('shine-ok', on);
  }
  function watchQuality() {
    if (EnergyField.t < 150) return;                 /* aquecimento ~2.5s */
    if (fpsEMA < 46) {
      qLowMs += efDt;
      qHighMs = 0;
      if (qLowMs > 2200) {                           /* 2.2s abaixo do alvo → desce um degrau */
        qLowMs = 0;
        EnergyField.quality = EnergyField.quality > 0.62 ? 0.62 : 0.38;   /* piso 0.38 */
        /* no primeiro degrau mantém a borda viva; só o piso real a congela.
           Assim qualidade moderada não mata justamente o movimento que dá vida aos cards. */
        document.body.classList.toggle('no-shine', EnergyField.quality <= 0.38);
        setShine(false);
        shineBurned = true;                          /* queimou: não tenta de novo */
      }
    } else {
      qLowMs = Math.max(0, qLowMs - efDt);
      if (!shineBurned && !shineOn && EnergyField.quality >= 0.999 && fpsEMA >= SHINE_FPS) {
        qHighMs += efDt;
        if (qHighMs > SHINE_MS) setShine(true);      /* folga provada → liga a refração */
      } else if (fpsEMA < SHINE_FPS) {
        qHighMs = 0;
      }
    }
  }
  function measureScroll() {
    efScrollMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  }
  measureScroll();
  window.addEventListener('load', measureScroll);
  window.addEventListener('resize', debounce(measureScroll, 200));

  function updateEnergy(now) {
    efDt = efPrevNow ? Math.min(50, now - efPrevNow) : 16;
    efPrevNow = now;
    var depth = Math.min(1, Math.max(0, window.scrollY / efScrollMax));
    efReach = Math.max(efReach, depth);                    /* acúmulo: não volta */
    var base = depth * 0.7 + efReach * 0.3;                /* baseline sobe c/ jornada */
    if (pointerActive && pointerFine) base += 0.04;        /* interação viva soma */
    EnergyField.E += (Math.min(1, base) - EnergyField.E) * 0.04;   /* respiração lenta */

    var moved = Math.hypot(px - resPX, py - resPY);
    resPX = px; resPY = py;
    resMoveEMA += (moved - resMoveEMA) * 0.1;              /* ritmo do usuário → escolha do arquétipo */
    scheduleResonance(now, moved);
    driveResonance(now);
    driveSingularity(now);
  }

  /* --- GATILHOS: a ressonância NÃO é um timer. Uma "carga" enche com o tempo,
     mas acelera com contexto (interação viva, permanência perto do núcleo,
     exploração de novas seções, energia acumulada) → parece consciente do
     usuário. Cooldown mínimo entre eventos evita spam. --- */
  var resCharge = 0, resPX = px, resPY = py, resLastReach = 0, resCdUntil = 0, resMoveEMA = 0;
  var RES_CD = 4500;

  function scheduleResonance(now, moved) {
    if (reduced) return;
    var r = EnergyField.res;
    /* consome o avanço de exploração SEMPRE — se ficar represado enquanto o
       gate está fechado, ele despeja de uma vez e dispara no frame exato em
       que o cooldown vence */
    var reachGain = Math.max(0, efReach - resLastReach);
    resLastReach = efReach;
    if (r.active || EnergyField.sing.active || now < resCdUntil) return;
    /* carga por TEMPO real (efDt), não por frame: em 120Hz carregaria 2x mais rápido */
    var fill = (efDt / 34000) * (0.55 + EnergyField.E * 1.1);  /* base: ~1 evento/34s parado */
    if (pointerActive && pointerFine) {
      if (moved > 2) fill += efDt / 60000;                     /* interação viva */
      var heroP = Math.max(0, 1 - window.scrollY / (innerHeight * 0.85));
      var cprox = Math.max(0, 1 - Math.hypot(px - innerWidth * 0.5, py - innerHeight * 0.42) / 300);
      fill += (efDt / 9000) * cprox * heroP;                   /* perto do núcleo carrega rápido */
    }
    fill += reachGain * 1.6;                                   /* explorar novas seções acelera */
    resCharge += fill;
    if (resCharge >= 1) {
      resCharge = 0;
      if (singPending) { singPending = false; igniteSingularity(now); }   /* o Singular pré-empta */
      else igniteResonance(now);
    }
  }

  /* ---- ARQUÉTIPOS: cada ressonância é um COMPORTAMENTO, não um sorteio de
     parâmetros. O sistema escolhe um por CONTEXTO e nunca repete o anterior.
     Cada um redistribui a ênfase entre os elos (pesos w*) e as durações das
     fases → o evento "decide" quem protagoniza (núcleo, conexões, partículas,
     ou um eco demorado). --- */
  var ARCH = [
    { id: 'core',  durS: 1150, durC: 700, durR: 1300, durE: 2600, power: 1.10, wCore: 1.45, wConn: 0.90, wPart: 0.85, wType: 0.95 },
    { id: 'web',   durS: 820,  durC: 560, durR: 1560, durE: 2500, power: 0.95, wCore: 0.90, wConn: 1.60, wPart: 0.90, wType: 1.05 },
    { id: 'swarm', durS: 720,  durC: 500, durR: 1240, durE: 2300, power: 1.00, wCore: 0.95, wConn: 0.85, wPart: 1.60, wType: 0.90 },
    { id: 'deep',  durS: 980,  durC: 650, durR: 1300, durE: 3700, power: 0.98, wCore: 1.05, wConn: 1.05, wPart: 1.00, wType: 1.00 }
  ];
  var resLastArch = -1, resTL = null, resElapsed = 0, resDur = 0, resNowLast = 0;

  function pickArchetype() {
    var w = [1, 1.1, 1, 1];   /* web com leve base → protagonismo das conexões aparece às vezes */
    if (pointerFine && pointerActive) {
      var heroP = Math.max(0, 1 - window.scrollY / (innerHeight * 0.85));
      var cprox = Math.max(0, 1 - Math.hypot(px - innerWidth * 0.5, py - innerHeight * 0.42) / 320);
      w[0] += cprox * heroP * 2.6;                 /* perto do núcleo → core domina */
      w[2] += Math.min(1.6, resMoveEMA * 0.06);    /* muito movimento → swarm */
    }
    if (efReach > 0.55) w[3] += (efReach - 0.55) * 3.2;   /* jornada funda → eco longo (deep) */
    if (resLastArch >= 0) w[resLastArch] *= 0.12;         /* nunca repetir o anterior */
    var sum = w[0] + w[1] + w[2] + w[3], pick = Math.random() * sum, acc = 0, idx = 0;
    for (var k = 0; k < 4; k++) { acc += w[k]; if (pick <= acc) { idx = k; break; } }
    resLastArch = idx;
    return ARCH[idx];
  }

  function igniteResonance(now) {
    var a = pickArchetype(), r = EnergyField.res;
    r.active = true; r.phase = 'silence'; r.seed = Math.random();
    r.power = a.power; r.arch = a.id; r.w = a;
    r.amp = 0; r.charge = 0; r.front = 0; r.reveal = 0; r.space = 0;
    /* offsets de fase COM OVERLAP: compressão entra dentro do silêncio, release
       dentro da compressão, eco dentro do release → fronteira imperceptível */
    r._c = a.durS * 0.55;
    r._r = r._c + a.durC * 0.6;
    r._e = r._r + a.durR * 0.62;
    resElapsed = 0; resNowLast = now;
    if (hasGsap) { resTL = buildResonanceTL(a, r); resDur = resTL.duration() * 1000; }
    else { resTL = null; resDur = r._r + a.durR + a.durE; }
  }

  /* TIMELINE MESTRE (GSAP): tweena os números do estado com keyframes que se
     sobrepõem. paused:true → o loop único do organismo faz seek() a cada frame
     (1 rAF só; o gsap é motor de interpolação/keyframes, não um segundo loop).
     Durações em SEGUNDOS (ms * 0.001). Easing anime→gsap: pow(n) → power(n-1)
     (anime power=expoente; gsap power1=quad/exp2). Cada keyframe leva ease
     explícito — keyframes do gsap ignoram o `defaults.ease` da timeline.
     Validado prop-a-prop contra a timeline anime original (diff < 1e-6). */
  function buildResonanceTL(a, r) {
    var ms = 0.001;
    var tl = GSAP.timeline({ paused: true });
    /* charge: sobe no silêncio → segura na compressão → cai no release */
    tl.to(r, { keyframes: [
      { charge: 1, duration: a.durS * ms, ease: 'power1.inOut' },
      { charge: 1, duration: (r._r - a.durS + a.durR * 0.18) * ms, ease: 'power1.out' },
      { charge: 0, duration: a.durR * 0.82 * ms, ease: 'power1.out' }
    ] }, 0);
    /* space: o vazio comprime junto da carga e relaxa ao começar a percorrer */
    tl.to(r, { keyframes: [
      { space: 1, duration: (a.durS + a.durC * 0.5) * ms, ease: 'power1.inOut' },
      { space: 0, duration: a.durR * 0.7 * ms, ease: 'power2.out' }
    ] }, 0);
    /* amp: mínimo no acúmulo → dispara no release → decai devagar no eco.
       (o segmento do acúmulo vai direto até r._r — expressá-lo como
       "durS + (r._r - durS)" dava duração NEGATIVA nos 4 arquétipos) */
    tl.to(r, { keyframes: [
      { amp: 0.12, duration: r._r * ms, ease: 'power1.in' },
      { amp: a.power, duration: a.durR * ms, ease: 'power2.out' },
      { amp: 0, duration: a.durE * ms, ease: 'power1.out' }
    ] }, 0);
    /* front: só percorre a cadeia no release (posicionado em r._r) */
    tl.fromTo(r, { front: 0 }, { front: 1, duration: a.durR * ms, ease: 'power2.out' }, r._r * ms);
    /* reveal: nasce na compressão, pico no release, some no eco */
    tl.to(r, { keyframes: [
      { reveal: 0.28, duration: a.durC * ms, ease: 'power1.in' },
      { reveal: 1, duration: a.durR * ms, ease: 'power1.out' },
      { reveal: 0, duration: a.durE * 1.1 * ms, ease: 'power1.out' }
    ] }, r._c * ms);
    return tl;
  }

  /* driver: chamado todo frame pelo loop único. Seek na timeline (ou stepper
     numérico no fallback), deriva o rótulo da fase e finaliza o evento. */
  function driveResonance(now) {
    var r = EnergyField.res;
    if (!r.active) return;
    var dt = Math.min(50, now - resNowLast); resNowLast = now;
    resElapsed += dt;
    if (hasGsap && resTL) { resTL.seek(Math.min(resElapsed, resDur) * 0.001); }
    else { stepResonanceFallback(r); }
    r.phase = resElapsed < r._c ? 'silence' : resElapsed < r._r ? 'compression'
      : resElapsed < r._e ? 'release' : 'echo';
    if (resElapsed >= resDur) {
      evolveBehavior();
      r.active = false; r.phase = 'idle';
      r.amp = 0; r.charge = 0; r.front = 0; r.reveal = 0; r.space = 0;
      r.gen++;                                             /* subsistemas percebem e reorganizam */
      resCdUntil = now + RES_CD;
      /* cada ressonância carrega o ESTADO SINGULAR: probabilidade progressiva
         (15% na entrada → 30 → 55 → 100% após a 3ª). Ganhou → o PRÓXIMO evento é o
         Singular (timing imprevisível, nunca timer). Reset ao acontecer. */
      resDoneCount++;
      rollSingular();
    }
  }

  /* fallback sem GSAP: mesmas envelopes, aproximação eased manual */
  function stepResonanceFallback(r) {
    var a = r.w, te = resElapsed, relEnd = r._r + a.durR;
    var sil = Math.min(1, te / a.durS);
    r.charge = te < r._r ? (sil < 1 ? sil * sil : 1) : Math.max(0, 1 - (te - r._r) / (a.durR * 0.82));
    r.space = te < r._r ? Math.min(1, te / (a.durS + a.durC * 0.5)) : Math.max(0, 1 - (te - r._r) / (a.durR * 0.7));
    r.front = te < r._r ? 0 : (1 - Math.pow(1 - Math.min(1, (te - r._r) / a.durR), 3));
    r.amp = te < r._r ? 0.05 + 0.07 * Math.min(1, te / r._r)
      : te < relEnd ? 0.12 + (a.power - 0.12) * Math.min(1, (te - r._r) / a.durR)
        : Math.max(0, a.power * (1 - (te - relEnd) / a.durE));
    r.reveal = te < r._c ? 0 : te < relEnd ? Math.min(1, 0.28 + 0.72 * (te - r._c) / (relEnd - r._c))
      : Math.max(0, 1 - (te - relEnd) / (a.durE * 1.1));
  }

  /* o organismo EVOLUI (não randomiza): a cada evento o humor persistente deriva
     na direção do arquétipo que acabou de acontecer — comportamento com memória
     e consequência, dentro dos limites travados (identidade visual é sagrada). */
  function evolveBehavior() {
    var m = EnergyField.mood, a = EnergyField.res.w, rnd = Math.random;
    if (!a) return;
    m.glow = clampf(m.glow + (a.wCore - 1) * 0.05 + (rnd() - 0.5) * 0.03, 0.86, 1.14);
    m.flow += (a.wConn - 1) * 0.35 + (rnd() - 0.5) * 0.15;
    m.rate = clampf(m.rate + (a.wPart - 1) * 0.12 + (rnd() - 0.5) * 0.05, 0.70, 1.30);
    m.cursor = clampf(m.cursor + (rnd() - 0.5) * 0.08, 0.82, 1.20);
  }
  function clampf(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ================== ESTADO SINGULAR ==================
     O evento raro em que a IA assume o controle. Timeline mestre própria; leis
     novas que os subsistemas obedecem. Gatilho: probabilidade progressiva por
     ressonância (nunca timer). */
  var resDoneCount = 0, singPending = false;
  /* Escada de probabilidade indexada por ressonâncias JÁ concluídas. Índice 0 =
     ENTRADA no site: o Singular pode ser o primeiro acontecimento, antes de
     qualquer ressonância. Após a 3ª ressonância é garantido (1.00). */
  var SING_P = [0.15, 0.30, 0.55, 1.00];
  var SING_CD = 30000;                   /* cooldown longo — evento de 20s, raríssimo */

  function rollSingular() {
    if (reduced || singPending) return;
    if (Math.random() < SING_P[Math.min(resDoneCount, SING_P.length - 1)]) singPending = true;
  }
  rollSingular();                        /* rola já na entrada do site */
  var singTL = null, singElapsed = 0, singDur = 0, singNowLast = 0;

  /* TEMPERATURA da energia (não paleta): ciano → branco incandescente → dourado
     PLASMA (estrela/fusão, nunca metal). pale=true tende ao branco-quente central
     (#ffea9f); senão à corona (#ffd000). Retorna 'r,g,b' (vírgula, p/ o canvas). */
  /* role: 0=glow · 1=hi · 2=core. O ponto de partida de CADA papel é o valor
     EXATO do token em repouso — em warmth=0 a cor é idêntica à da rampa ciano,
     então a metamorfose entra e sai sem degrau. */
  var PLASMA_REST = [rgbTriple(PALETTE.glow), rgbTriple(PALETTE.hi), rgbTriple(PALETTE.core)];
  var PLASMA_GOLD = [[255, 208, 0], [255, 234, 159], [255, 244, 214]];
  var PLASMA_WHITE = [255, 251, 240];
  function plasmaColor(w, role) {
    var i = role | 0, c1, c2, f;
    if (w < 0.5) { f = w / 0.5; c1 = PLASMA_REST[i]; c2 = PLASMA_WHITE; }
    else { f = (w - 0.5) / 0.5; c1 = PLASMA_WHITE; c2 = PLASMA_GOLD[i]; }
    return Math.round(c1[0] + (c2[0] - c1[0]) * f) + ',' +
      Math.round(c1[1] + (c2[1] - c1[1]) * f) + ',' +
      Math.round(c1[2] + (c2[2] - c1[2]) * f);
  }

  function igniteSingularity(now) {
    var s = EnergyField.sing;
    s.active = true; s.phase = 'transcend';
    s.amp = 0; s.grip = 0; s.warmth = 0; s.depth = 0; s.front = 0; s.reveal = 0; s.power = 1;
    s.breath = 0; s.strain = 0; s.hush = 0;
    s._s = 2600;                         /* fim da COMPRESSÃO (dentro do núcleo) */
    s._t = 4200;                         /* fim da transcendência */
    s._a = 17000;                        /* fim do ápice → resfriamento (total 20000) */
    singElapsed = 0; singNowLast = now;
    if (hasGsap) { singTL = buildSingularityTL(s); singDur = singTL.duration() * 1000; }
    else { singTL = null; singDur = 20000; }
  }

  /* TIMELINE MESTRE (GSAP) — 20s: compressão 2.6s / transcendência 1.6s /
     ápice 12.8s / resfriamento 3s. O evento NÃO começa na interface: começa DENTRO
     do núcleo (strain), que comprime a própria energia até o limite físico, passa
     por um instante de silêncio absoluto (hush) e só então transcende.
     paused:true → seek pelo loop único (1 rAF). Durações em SEGUNDOS (ms*0.001);
     ease anime→gsap pow(n)→power(n-1), explícito por keyframe.
     Validado prop-a-prop contra a timeline anime original (diff < 1e-6). */
  function buildSingularityTL(s) {
    var ms = 0.001;
    var tl = GSAP.timeline({ paused: true });
    var S = 2600, T = 1600, A = 12800, C = 3000;
    /* strain: o núcleo comprime a própria energia; solta ao transcender */
    tl.to(s, { keyframes: [
      { strain: 1, duration: S * ms, ease: 'power1.in' },
      { strain: 0, duration: T * 0.75 * ms, ease: 'power1.out' },
      { strain: 0, duration: (A + C + T * 0.25) * ms, ease: 'power1.out' }
    ] }, 0);
    /* hush: instante de silêncio visual absoluto, imediatamente antes do release */
    tl.to(s, { keyframes: [
      { hush: 0, duration: (S - 300) * ms, ease: 'power1.out' },
      { hush: 1, duration: 150 * ms, ease: 'power1.in' },
      { hush: 0, duration: 380 * ms, ease: 'power1.out' },
      { hush: 0, duration: (20000 - S - 230) * ms, ease: 'power1.out' }
    ] }, 0);
    /* warmth: ciano→BRANCO acontece dentro da compressão (aquecimento);
       branco→dourado só na transcendência; esfria devagar no fim */
    tl.to(s, { keyframes: [
      { warmth: 0, duration: S * 0.45 * ms, ease: 'power1.out' },
      { warmth: 0.5, duration: S * 0.55 * ms, ease: 'power1.in' },
      { warmth: 1, duration: T * ms, ease: 'power1.out' },
      { warmth: 1, duration: A * ms, ease: 'power1.out' },
      { warmth: 0, duration: C * ms, ease: 'power1.inOut' }
    ] }, 0);
    /* grip: o campo gravitacional já se intensifica na compressão */
    tl.to(s, { keyframes: [
      { grip: 0.55, duration: S * ms, ease: 'power1.in' },
      { grip: 1, duration: T * ms, ease: 'power2.out' },
      { grip: 1, duration: A * ms, ease: 'power1.out' },
      { grip: 0, duration: C * ms, ease: 'power1.in' }
    ] }, 0);
    /* amp: a interface fica QUIETA na compressão; só explode na transcendência */
    tl.to(s, { keyframes: [
      { amp: 0.12, duration: S * ms, ease: 'power1.in' },
      { amp: 1, duration: T * ms, ease: 'power2.out' },
      { amp: 1, duration: A * ms, ease: 'power1.out' },
      { amp: 0, duration: C * ms, ease: 'power1.out' }
    ] }, 0);
    /* depth: expansão espacial (só a partir da transcendência) */
    tl.to(s, { keyframes: [
      { depth: 0.1, duration: S * ms, ease: 'power1.out' },
      { depth: 1, duration: T * ms, ease: 'power2.out' },
      { depth: 1, duration: A * ms, ease: 'power1.out' },
      { depth: 0, duration: C * ms, ease: 'power1.inOut' }
    ] }, 0);
    /* front: a reorganização propaga do núcleo pra fora, após o release */
    tl.fromTo(s, { front: 0 }, { front: 1, duration: (T + A * 0.3) * ms, ease: 'power2.out' }, S * ms);
    /* reveal: circuitos/bordas SUSTENTADOS o ápice inteiro (não spike) */
    tl.to(s, { keyframes: [
      { reveal: 1, duration: T * ms, ease: 'power1.out' },
      { reveal: 1, duration: A * ms, ease: 'power1.out' },
      { reveal: 0, duration: C * ms, ease: 'power1.in' }
    ] }, S * ms);
    return tl;
  }

  function driveSingularity(now) {
    var s = EnergyField.sing;
    if (!s.active) return;
    var dt = Math.min(50, now - singNowLast); singNowLast = now;
    singElapsed += dt;
    if (hasGsap && singTL) { singTL.seek(Math.min(singElapsed, singDur) * 0.001); }
    else { stepSingularityFallback(s); }
    s.phase = singElapsed < s._s ? 'strain' : singElapsed < s._t ? 'transcend'
      : singElapsed < s._a ? 'apex' : 'cooling';
    /* RESPIRAÇÃO: 14s de ápice não podem ficar estáticos — o núcleo irradia um
       pulso lento e constante. Ponderada por amp → entra e sai sem emenda. */
    s.breath = (0.5 + 0.5 * Math.sin(singElapsed / 3600 * 6.28318)) * s.amp;
    if (singElapsed >= singDur) {
      s.active = false; s.phase = 'idle';
      s.amp = 0; s.grip = 0; s.warmth = 0; s.depth = 0; s.front = 0; s.reveal = 0;
      s.breath = 0; s.strain = 0; s.hush = 0;
      AICore.exhaust();                  /* o núcleo não desliga: fica exausto e se recupera */
      resDoneCount = 0;                  /* energia acumulada volta ao início */
      rollSingular();                    /* novo ciclo já nasce com a chance de base */
      resCdUntil = now + SING_CD;
    }
  }

  function stepSingularityFallback(s) {
    var te = singElapsed, S = 2600, T = 1600, A = 12800, total = 20000;
    if (te < S) {                                   /* compressão dentro do núcleo */
      var u = te / S;
      s.strain = u * u; s.grip = u * 0.55; s.amp = u * 0.12; s.depth = u * 0.1;
      s.warmth = u < 0.45 ? 0 : (u - 0.45) / 0.55 * 0.5;
      s.hush = te > S - 300 ? Math.min(1, (te - S + 300) / 150) : 0;
      s.front = 0; s.reveal = 0;
    } else if (te < S + T) {                        /* transcendência */
      var v = (te - S) / T;
      s.strain = Math.max(0, 1 - v / 0.75); s.hush = Math.max(0, 1 - v * 4);
      s.warmth = 0.5 + v * 0.5; s.grip = 0.55 + v * 0.45;
      s.amp = 0.12 + v * 0.88; s.depth = 0.1 + v * 0.9; s.reveal = v;
      s.front = Math.min(1, (te - S) / (T + A * 0.3));
    } else if (te < S + T + A) {                    /* ápice */
      s.strain = 0; s.hush = 0;
      s.warmth = 1; s.grip = 1; s.amp = 1; s.depth = 1; s.reveal = 1;
      s.front = Math.min(1, (te - S) / (T + A * 0.3));
    } else {                                        /* resfriamento */
      var d = Math.max(0, 1 - (te - S - T - A) / (total - S - T - A));
      s.warmth = d; s.grip = d; s.amp = d; s.depth = d; s.reveal = d;
      s.strain = 0; s.hush = 0; s.front = 1;
    }
  }

  /* PERF: epsilon subiu de 0.006 para 0.018. Estas variáveis controlam a
     opacidade e a escala de #singfx — uma camada de viewport inteira. Cada
     escrita recompõe a tela; 55 degraus já são imperceptíveis num banho de luz
     que leva segundos para subir. */
  var singCss = { amp: -1, depth: -1, rev: -1 }, singLastRgb = '';
  function setSingCss(prop, val, key) {
    if (Math.abs(val - singCss[key]) > 0.018 || (val === 0 && singCss[key] !== 0)) {
      singCss[key] = val;
      document.documentElement.style.setProperty(prop, val.toFixed(3));
    }
  }
  /* METAMORFOSE: sobrescreve os TOKENS VIVOS do :root a partir de warmth. Como o
     site inteiro já usa esses tokens, todo glow/borda/texto vira plasma sem
     refatorar CSS. Gated por string. Limpo ao fim → snap de volta ao ciano. */
  var singTok = {}, singTokOn = false, singBodyOn = false;
  /* lista COMPLETA do que metamorph() escreve — é a única fonte de verdade da
     limpeza. Antes '--sing-rgb' estava fora e era removido numa linha à parte:
     bastava alguém acrescentar um token à metamorfose sem lembrar da segunda
     linha para ele ficar preso no :root depois do evento. */
  var SING_TOKENS = ['--glow', '--glow-rgb', '--hi', '--hi-rgb', '--core-rgb', '--sing-rgb'];
  function setTok(prop, val) {
    if (singTok[prop] !== val) { singTok[prop] = val; document.documentElement.style.setProperty(prop, val); }
  }
  /* PERF — DEGRAUS DE TEMPERATURA. --glow-rgb é lido por 126 regras de CSS e
     --hi-rgb por 41. Reescrever esses tokens é, na prática, mandar o browser
     re-avaliar e repintar a página inteira. Antes isso acontecia a cada frame
     da rampa (~96 vezes), e era isso que derrubava o FPS ao virar dourado.
     Quantizando warmth em degraus, a página é recalculada ~24 vezes em vez de
     ~96 — e como a temperatura já varia devagar (1,6s de subida), o degrau não
     aparece a olho nu. No ápice warmth fica em 1: zero escrita. */
  var WARMTH_STEPS = 24;
  function metamorph(s) {
    var w = Math.round(s.warmth * WARMTH_STEPS) / WARMTH_STEPS;
    var g = plasmaColor(w, 0), gsp = g.replace(/,/g, ' ');
    var hi = plasmaColor(w, 1), hisp = hi.replace(/,/g, ' ');
    var co = plasmaColor(w, 2);
    setTok('--glow', 'rgb(' + g + ')');
    setTok('--glow-rgb', gsp);
    setTok('--hi', 'rgb(' + hi + ')');
    setTok('--hi-rgb', hisp);
    setTok('--core-rgb', co.replace(/,/g, ' '));   /* papel próprio: parte do branco-texto */
    setTok('--sing-rgb', gsp);
    singTokOn = true;
    if (!singBodyOn) { document.body.classList.add('singularity-active'); singBodyOn = true; }
  }
  function metamorphClear() {
    var r = document.documentElement.style;
    SING_TOKENS.forEach(function (p) { r.removeProperty(p); });
    singTok = {}; singTokOn = false;
    if (singBodyOn) { document.body.classList.remove('singularity-active'); singBodyOn = false; }
  }

  /* ressonância → CSS (cards/botões/fundo/revelação). Gated por epsilon:
     0 escritas em repouso. */
  /* PERF: idem — #resfx também é viewport inteira e sua opacidade sai daqui. */
  var efResCss = { amp: -1, rev: -1, cards: -1, btns: -1, bg: -1, space: -1 };
  function setResCss(prop, val, key) {
    if (Math.abs(val - efResCss[key]) > 0.018 || (val === 0 && efResCss[key] !== 0)) {
      efResCss[key] = val;
      document.documentElement.style.setProperty(prop, val.toFixed(3));
    }
  }

  /* leitura ao vivo de E/pulso/reach via ?debug */
  var efDebug = null;
  if (/[?&]debug/.test(location.search)) {
    efDebug = document.createElement('div');
    efDebug.id = 'efDebug';
    efDebug.style.cssText = 'position:fixed;right:10px;top:10px;z-index:200;' +
      'font:11px/1.5 monospace;color:#00F5FF;background:rgba(0,0,0,.62);' +
      'padding:6px 9px;border:1px solid rgba(0,245,255,.3);border-radius:6px;' +
      'pointer-events:none;white-space:pre;letter-spacing:.03em';
    document.body.appendChild(efDebug);
  }

  /* camada de REVELAÇÃO da ressonância: grade geométrica + estrutura de bordas
     que só aparece durante o evento (opacidade = --res-reveal, escrita pelo JS).
     Fica atrás do conteúdo; estilo em styles.css (#resfx). */
  var resfx = document.createElement('div');
  resfx.id = 'resfx';
  resfx.setAttribute('aria-hidden', 'true');
  document.body.appendChild(resfx);

  /* camada do ESTADO SINGULAR: banho de TEMPERATURA a partir do núcleo (cor =
     --sing-rgb, opacidade = --sing) + EXPANSÃO de profundidade (--sing-depth).
     Fundo escuro, sensação de universo além da interface. Estilo em styles.css. */
  var singfx = document.createElement('div');
  singfx.id = 'singfx';
  singfx.setAttribute('aria-hidden', 'true');
  document.body.appendChild(singfx);

  /* ---- LOOP ÚNICO do organismo ----
     Pointer reactors (magnetismo/tilt/nav) inline + todos os subsistemas
     registrados. Roda sempre (nav/fps), mesmo sem pointer/reduced. */
  function loop(now) {
    if (lastFrame) {
      var dt = now - lastFrame;
      if (dt > 0 && dt < 250) fpsEMA += ((1000 / dt) - fpsEMA) * 0.06;
    }
    lastFrame = now;
    EnergyField.t++;
    updateEnergy(now);
    watchQuality();

    /* fundo ambiente acende com a energia acumulada (só grava se mudou —
       E é suave, então em repouso não repinta) */
    /* a iluminação do DOM respira junto com o núcleo — quando o Core muda, o
       universo responde (mesmo que discretamente). Reusa a var e o gate. */
    var _cb = EnergyField.core;
    var eAmb = EnergyField.E * (1 + (_cb.breath - 0.5) * 0.07 * _cb.pres);
    if (Math.abs(eAmb - efLastCssE) > 0.003) {
      efLastCssE = eAmb;
      document.documentElement.style.setProperty('--ef-e', eAmb.toFixed(3));
    }

    /* parallax sutil do fundo ambiente → profundidade entre camadas (Fase 5) */
    var par = Math.max(-220, Math.min(220, window.scrollY * 0.04));
    if (Math.abs(par - efLastPar) > 0.5) {
      efLastPar = par;
      document.documentElement.style.setProperty('--par-amb', par.toFixed(1) + 'px');
    }

    /* ressonância → CSS: os elos DOM recebem a onda em ordem (cards 0.70,
       botões 0.85, fundo 1.0) + revelação global. Só escreve durante o evento. */
    var _R = EnergyField.res;
    setResCss('--res', _R.active ? _R.amp : 0, 'amp');
    setResCss('--res-reveal', _R.active ? _R.reveal : 0, 'rev');
    setResCss('--res-space', _R.active ? _R.space : 0, 'space');
    setResCss('--res-cards', _R.active ? EnergyField.stageExc(0.70) : 0, 'cards');
    setResCss('--res-btns', _R.active ? EnergyField.stageExc(0.85) : 0, 'btns');
    setResCss('--res-bg', _R.active ? EnergyField.stageExc(1.00) : 0, 'bg');

    /* Estado Singular → CSS: banho de temperatura + profundidade. --sing-rgb só
       muda de fato quando a cor de temperatura muda (gated por string). */
    var _S = EnergyField.sing;
    setSingCss('--sing', _S.active ? _S.amp * (0.88 + _S.breath * 0.14) : 0, 'amp');   /* banho pulsante do núcleo */
    setSingCss('--sing-depth', _S.active ? _S.depth : 0, 'depth');
    setSingCss('--sing-reveal', _S.active ? _S.reveal : 0, 'rev');
    if (_S.active) metamorph(_S);              /* reescreve tokens vivos → metamorfose global */
    else if (singTokOn) metamorphClear();      /* fim → snap de volta ao ciano */

    updateNav();

    if (pointerFine && !reduced && pointerActive) {
      /* ponteiro suavizado: consumido pelo canvas e pelos reatores DOM em JS.
         (--px/--py saíram: eram escritos todo frame e nenhum CSS os lia) */
      px += (tx - px) * 0.18;
      py += (ty - py) * 0.18;

      var magRects = magnets.map(function (m) { return m.el.getBoundingClientRect(); });
      var tiltRects = tilts.map(function (t) { return t.over ? t.el.getBoundingClientRect() : null; });

      magnets.forEach(function (m, i) {
        var r = magRects[i];
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var d = Math.hypot(px - cx, py - cy);
        var pull = Math.max(0, 1 - d / 130);
        var gx = Math.max(-6, Math.min(6, (px - cx) * pull * 0.12));
        var gy = Math.max(-6, Math.min(6, (py - cy) * pull * 0.12));
        spring(m, gx, gy, 0.16, 0.72);
        if (Math.abs(m.x) > 0.05 || Math.abs(m.y) > 0.05) {
          m.el.style.transform = 'translate(' + m.x.toFixed(2) + 'px,' + m.y.toFixed(2) + 'px)';
        } else if (m.el.style.transform) {
          m.el.style.transform = '';
        }
      });

      tilts.forEach(function (t, i) {
        var r = tiltRects[i];
        var grx = 0, gry = 0;
        if (r) {
          gry = ((px - (r.left + r.width / 2)) / r.width) * 12;
          grx = -((py - (r.top + r.height / 2)) / r.height) * 12;
          gry = Math.max(-6, Math.min(6, gry));
          grx = Math.max(-6, Math.min(6, grx));
        }
        t.vrx += (grx - t.rx) * 0.14; t.vrx *= 0.74; t.rx += t.vrx;
        t.vry += (gry - t.ry) * 0.14; t.vry *= 0.74; t.ry += t.vry;
        if (Math.abs(t.rx) > 0.03 || Math.abs(t.ry) > 0.03) {
          t.el.style.transform =
            'perspective(800px) rotateX(' + t.rx.toFixed(2) + 'deg) rotateY(' + t.ry.toFixed(2) + 'deg)';
        } else if (t.el.style.transform) {
          t.el.style.transform = '';
        }
      });
    }

    /* subsistemas do organismo (ParticleLayer, e mais nas próximas fases) */
    if (PERF) {
      perfFrame(now);
      for (var s = 0; s < EnergyField.subs.length; s++) {
        var _p0 = performance.now();
        EnergyField.subs[s](now);
        perfSub(EnergyField.subs[s]._n, performance.now() - _p0);
      }
    } else {
      for (var s = 0; s < EnergyField.subs.length; s++) EnergyField.subs[s](now);
    }

    if (efDebug && EnergyField.t % 6 === 0) {
      var _dr = EnergyField.res, _ds = EnergyField.sing;
      efDebug.textContent =
        'E      ' + EnergyField.E.toFixed(3) +
        '\nres    ' + (_dr.active ? _dr.phase + ' [' + _dr.arch + ']' : 'idle') +
        '\nfront  ' + _dr.front.toFixed(2) + '  amp ' + _dr.amp.toFixed(2) +
        '\ncharge ' + _dr.charge.toFixed(2) + ' space ' + _dr.space.toFixed(2) +
        '\nSING   ' + (_ds.active ? _ds.phase + ' g' + _ds.grip.toFixed(2) + ' w' + _ds.warmth.toFixed(2) : (singPending ? 'PENDING' : 'idle')) +
        '\nstrain ' + _ds.strain.toFixed(2) + ' hush ' + _ds.hush.toFixed(2) +
        '\nCORE   pow ' + _cb.pow.toFixed(2) + ' br ' + _cb.breath.toFixed(2) +
        '\n       R ' + _cb.R.toFixed(0) + ' fat ' + _cb.fatigue.toFixed(2) + ' g ' + _cb.grav.toFixed(2) +
        '\ncnt ' + resDoneCount + '  eng ' + (hasGsap ? 'gsap' : 'fallbk') +
        '\nreach  ' + efReach.toFixed(2) + '  fps ' + Math.round(fpsEMA) + ' q' + EnergyField.quality.toFixed(2);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ========== 3a-bis. AI CORE — A ENTIDADE ==========
     Não é um componente: é o coração do universo. Toda energia nasce nele e
     retorna a ele. Cinco camadas independentes:
       1 NÚCLEO      energia comprimida e CONTIDA — o centro nunca se revela
       2 CAMPO       gravidade real (fieldAt): captura, escape, retorno
       3 ESTRUTURA   arquitetura que sustenta o núcleo; só fragmentos visíveis
       4 CONSCIÊNCIA intenções próprias, sem interação do usuário
       5 RESPIRAÇÃO  envelope assimétrico (inspira lento, contém, expira)
     Nenhuma frequência é múltipla de outra (razões por φ) → o padrão nunca se
     refecha: não existe loop perceptível. Estado público em EnergyField.core. */
  /* ÂNCORA DO NÚCLEO: onde o núcleo (e, portanto, o campo gravitacional que rege
     as partículas) mora na viewport. O reator do hero escreve aqui a cada frame o
     seu próprio centro na tela → o campo passa a ORBITAR o reator, unificando o
     visual e a física num só AI Core. Fora do hero (on=false) volta ao centro. */
  var coreAnchor = { x: innerWidth * 0.5, y: innerHeight * 0.42, on: false };

  var AICore = (function () {
    var TAU = 6.28318530718, PHI = 1.6180339887;

    var st = {
      x: innerWidth * 0.5, y: innerHeight * 0.42, R: 94,   /* já nasce no centro: o lerp parte daqui, não do canto */
      pres: 0,      /* presença (cai ao rolar; imposta no Singular) */
      pow: 0,       /* energia visível */
      breath: 0.5,  /* respiração 0..1 */
      strain: 0,    /* compressão pré-singular */
      fatigue: 0,   /* exaustão após o evento */
      star: 0,      /* ignição estelar (só no Singular) */
      attX: 1, attY: 0,          /* atenção: pra onde o núcleo "olha" */
      grav: 1, swirl: 1, gN: 1, sN: 1, reach: 300
    };
    var F = { x: 0, y: 0 };       /* saída de fieldAt (sem alocar por partícula) */
    var EM = { x: 0, y: 0 };      /* saída de emitPoint (idem) */

    var T = 0, lastNow = 0, bph = 0;
    var arms = [];                 /* braços: base geométrica de emitPoint (absorção→reemissão) */
    var attTX = 1, attTY = 0, gravT = 1, swirlT = 1, nextIntent = 3200;

    function wob(seed, f) {
      return Math.sin(T * f + seed) * 0.62 + Math.sin(T * f * PHI + seed * PHI) * 0.38;
    }
    function smooth(a) { return a * a * (3 - 2 * a); }

    function build() {
      arms = [];
      for (var a = 0; a < 4; a++) {
        arms.push({ ph: a * (TAU / 4) + Math.random() * 0.6,
          k: 0.26 + Math.random() * 0.14,
          sp: (0.000030 + Math.random() * 0.000026) * (a % 2 ? -1 : 1),
          seed: Math.random() * 9 });
      }
    }
    build();

    /* CAMADA 4 — CONSCIÊNCIA. O núcleo decide sozinho, sem interação. Intenções
       raras, com destino e transição longa: parece deliberação, não ruído. */
    function decide() {
      var r = Math.random();
      if (r < 0.5) { var a = Math.random() * TAU; attTX = Math.cos(a); attTY = Math.sin(a); }  /* muda o foco */
      else if (r < 0.75) { gravT = 1.30; swirlT = 0.80; }       /* condensa */
      else { gravT = 0.76; swirlT = 1.32; }                     /* difunde */
      nextIntent = 3800 + Math.random() * 5400;
    }

    function update(now, heroPres, E, sing, curOn, curX, curY) {
      var dt = lastNow ? Math.min(50, now - lastNow) : 16;
      lastNow = now; T += dt;
      var singOn = sing.active;

      st.strain = singOn ? sing.strain : 0;
      st.pres = Math.max(heroPres, singOn ? Math.min(1, 0.35 + sing.grip) : 0);

      /* CAMADA 5 — RESPIRAÇÃO. Não pulsa: respira. Inspira lento, contém, expira.
         O período deriva sozinho → nunca metronômico. */
      var per = 5200 + Math.sin(T * 0.000041) * 850 + Math.sin(T * 0.0000673) * 480;
      per *= 1 + st.fatigue * 0.55;              /* exausto: mais lento e fundo */
      per *= 1 - st.strain * 0.5;                /* comprimido: curto e tenso */
      bph += dt / per; if (bph >= 1) bph -= 1;
      st.breath = bph < 0.44 ? smooth(bph / 0.44)
        : bph < 0.58 ? 1 : 1 - smooth((bph - 0.58) / 0.42);

      /* consciência: decide, e relaxa de volta ao repouso entre decisões */
      if (!singOn) { nextIntent -= dt; if (nextIntent <= 0) decide(); }
      gravT += (1 - gravT) * 0.0009;
      swirlT += (1 - swirlT) * 0.0009;
      st.attX += (attTX - st.attX) * 0.011;
      st.attY += (attTY - st.attY) * 0.011;
      st.grav += (gravT - st.grav) * 0.014;
      st.swirl += (swirlT - st.swirl) * 0.014;

      if (st.fatigue > 0) { st.fatigue -= dt / 13000; if (st.fatigue < 0) st.fatigue = 0; }

      /* posição = âncora do reator (ou centro, fora do hero) + microderiva de duas
         frequências incomensuráveis (nunca repete). LERP em vez de snap: o núcleo
         DESLIZA até o alvo, então a troca âncora↔centro ao rolar e o próprio scroll
         viram um movimento contínuo, não um pulo. */
      var ax = coreAnchor.on ? coreAnchor.x : innerWidth * 0.5;
      var ay = coreAnchor.on ? coreAnchor.y : innerHeight * 0.42;
      var tx = ax + wob(0.4, 0.00021) * 7 + wob(2.6, 0.000131) * 4;
      var ty = ay + wob(1.7, 0.000173) * 6 + wob(3.9, 0.000109) * 3;
      st.x += (tx - st.x) * 0.09;
      st.y += (ty - st.y) * 0.09;

      st.R = (94 - st.strain * 36) * (1 + (st.breath - 0.5) * 0.055)
        * (1 - st.fatigue * 0.1) * (1 + (singOn ? sing.depth * 0.42 : 0));

      /* percebe a aproximação do usuário (mas não obedece a ele) */
      var excite = 0;
      if (curOn && st.pres > 0.02) {
        excite = Math.max(0, 1 - Math.hypot(curX - st.x, curY - st.y) / 340);
      }
      st.pow = st.pres * (0.52 + E * 0.42 + st.breath * 0.14 + excite * 0.5) * (1 - st.fatigue * 0.42);
      if (singOn) st.pow += sing.grip * 1.1 + sing.amp * 0.45 + st.strain * 0.65;
      if (singOn) st.pow *= 1 - sing.hush * 0.8;      /* silêncio absoluto */

      /* campo: alcance e força (a compressão e o Singular intensificam) */
      st.reach = 300 + st.strain * 240 + (singOn ? sing.grip * 460 : 0);
      st.gN = st.grav * (1 + st.strain * 3.2 + excite * 0.5) * (singOn ? 1 + sing.grip * 3.4 : 1);
      st.sN = st.swirl * (1 + st.strain * 0.6) * (singOn ? 1 + sing.grip * 2.2 : 1);
      st.star = singOn ? Math.min(1, sing.warmth * sing.grip + sing.amp * 0.25) : 0;
    }

    /* CAMADA 2 — CAMPO GRAVITACIONAL. Gravidade de verdade: 1/r² com softening,
       componente tangencial e canalização em LINHAS DE CAMPO (harmônico angular +
       viés da atenção). Sem raio de órbita alvo → trajetórias elípticas e
       hiperbólicas: umas são capturadas, outras escapam, outras voltam.
       0 = fora de alcance · 1 = dentro do campo (força em F) · 2 = absorvida. */
    function fieldAt(x, y) {
      if (st.pres < 0.03) return 0;      /* núcleo recolhido → não há campo fantasma */
      var dx = st.x - x, dy = st.y - y, d2 = dx * dx + dy * dy;
      if (d2 > st.reach * st.reach) return 0;
      var d = Math.sqrt(d2) + 0.001;
      if (d < st.R * 0.34) return 2;
      var inv = 1 / (d2 + 5200);
      var ang = Math.atan2(-dy, -dx);
      var chan = 1 + 0.5 * Math.sin(ang * 3 + T * 0.00013)
        + 0.32 * (st.attX * Math.cos(ang) + st.attY * Math.sin(ang));
      /* atração 1/r² MENOS pressão de radiação 1/r³: o núcleo não só engole, ele
         devolve. Perto demais, a resultante inverte e a partícula é arremessada
         de volta — é daí que nascem os escapes e os retornos. No Singular a
         atração (gN) supera a própria pressão: aí sim o colapso é inevitável. */
      /* a força inteira escala com a PRESENÇA: ao rolar, o núcleo recua e afrouxa
         o domínio sobre o espaço (nunca some de um frame pro outro) */
      var g = (900 * inv * st.gN * chan - 8500 / (d2 * d + 1000)) * st.pres;
      var s = 520 * inv * st.sN * st.pres;
      var ux = dx / d, uy = dy / d;
      F.x = ux * g - uy * s;
      F.y = uy * g + ux * s;
      return 1;
    }

    /* a energia absorvida não some: volta a ser emitida por um dos braços.
       Escreve em EM (reaproveitado) em vez de devolver um array novo: no
       Singular o núcleo absorve dezenas de partículas por frame e cada array
       descartado ali é lixo pro GC no meio da animação. */
    function emitPoint() {
      var arm = arms[(Math.random() * arms.length) | 0];
      var th = 4.4 + Math.random() * 2.2;
      var rr = st.R * 0.5 * Math.exp(arm.k * th);
      var aa = arm.ph + T * arm.sp + th;
      EM.x = st.x + Math.cos(aa) * rr;
      EM.y = st.y + Math.sin(aa) * rr;
      return EM;
    }

    /* O desenho do núcleo foi REMOVIDO daqui: o visual agora é o reator do hero
       (heroReactor, §3f). Este módulo virou só o CÉREBRO + a FÍSICA do AI Core —
       estado, respiração, consciência (decide/atenção), campo gravitacional
       (fieldAt), emissão (emitPoint) e exaustão. O reator lê tudo isso por
       EnergyField.core e se ancora via coreAnchor. */

    return {
      st: st, F: F, update: update, fieldAt: fieldAt, emitPoint: emitPoint,
      rebuild: build,
      exhaust: function () { st.fatigue = 1; }
    };
  })();
  EnergyField.core = AICore.st;        /* o resto do ecossistema lê o núcleo aqui */

  /* ========== 3b. NEURAL ENERGY FIELD ==========
     Uma camada de inteligência rodando atrás da interface.
     Núcleos neurais (hubs) em órbita → partículas em clusters
     gaussianos → sinapses → pulsos de energia (ciano; dourado
     raro). Cursor = perturbação no campo: atrai, deforma, gera
     ondas e memória energética; parado, organiza ao redor dele.
     AI Core ancorado no hero rege as partículas próximas.
     Canvas 2D + blend aditivo (luz soma como luz). dpr 1.
     Desligado em reduced-motion / saveData / deviceMemory < 4. */
  (function neuralEnergyField() {
    if (reduced) return;
    if (navigator.connection && navigator.connection.saveData) return;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return;
    var cv = document.getElementById('atmos');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var coarse = window.matchMedia('(pointer: coarse)').matches;

    /* energia primária (ciano elétrico) / secundária (dourado, raro) */
    var CY = PALETTE.glow;
    var HI = PALETTE.hi;
    var GO = PALETTE.gold;
    var CO = PALETTE.core;    /* núcleo — branco-ciano (AI Core) */
    var TAU = 6.28318;

    var W = 0, H = 0, t = 0;
    var hubs = [], ps = [], pulses = [], memory = [];
    var buckets = [];   /* partículas por hub — reaproveitado todo frame, nunca realocado */
    var idleMs = 0, lastPX = -1, lastPY = -1, memDrop = 0, lastGen = 0;
    var beamCenters = [], beamTick = 0;   /* feixes núcleo→cards no ápice do Singular */

    function gauss(spread) {
      return (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    }

    function build() {
      hubs = []; ps = []; pulses = []; memory = []; buckets = [];
      var N = coarse ? 46 : Math.min(140, Math.max(70, Math.round(W * H / 14000)));
      var M = Math.max(4, Math.round(N / 14));
      for (var b = 0; b < M; b++) buckets.push([]);
      for (var h = 0; h < M; h++) {
        hubs.push({
          bx: (0.12 + 0.76 * Math.random()) * W,
          by: (0.1 + 0.8 * Math.random()) * H,
          x: 0, y: 0,
          sp: 0.002 + Math.random() * 0.003,
          ph: Math.random() * TAU,
          orb: 30 + Math.random() * 50
        });
      }
      for (var i = 0; i < N; i++) {
        var hub = (Math.random() * M) | 0;
        ps.push({
          hub: hub,
          x: hubs[hub].bx + gauss(90),
          y: hubs[hub].by + gauss(90),
          vx: 0, vy: 0,
          z: 0.5 + Math.random() * 0.9,          /* profundidade */
          r: 0.7 + Math.random() * 1.2,
          tw: Math.random() * TAU,
          ts: 0.008 + Math.random() * 0.014
        });
      }
    }
    /* rebuild só quando a dimensão muda de fato: barra de endereço aparecendo no
       mobile e jitter de scrollbar disparavam resize e reconstruíam o campo
       inteiro à toa. O ouvinte de 'load' passa a ser de graça e cobre o boot com
       viewport 0×0 (janela ainda não composta), onde o canvas ficava morto. */
    function resize() {
      if (innerWidth === W && innerHeight === H) return;
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      build();
    }
    window.addEventListener('resize', debounce(resize, 200));
    window.addEventListener('load', resize);
    resize();

    /* VARIAÇÃO pós-ressonância (disparada quando res.gen muda): reatribui parte
       das partículas a outros núcleos e reposiciona alguns hubs → conexões
       surgem em lugares diferentes e o movimento adota novos padrões. É o
       "estado alterado" que o dono pediu — o organismo nunca volta igual. */
    function remutate() {
      if (!ps.length || !hubs.length) return;
      var n = Math.max(1, Math.round(ps.length * 0.15));
      for (var k = 0; k < n; k++) {
        ps[(Math.random() * ps.length) | 0].hub = (Math.random() * hubs.length) | 0;
      }
      for (var hh = 0; hh < hubs.length; hh++) {
        if (Math.random() < 0.4) {
          hubs[hh].bx = (0.12 + 0.76 * Math.random()) * W;
          hubs[hh].by = (0.1 + 0.8 * Math.random()) * H;
        }
      }
    }

    /* BRUMA — sprite em cache, não gradiente por chamada.
       Antes, cada bruma criava um createRadialGradient novo e mandava a CPU
       rasterizar um quadrado de r*2 lado. Somando as duas brumas grandes com os
       até 22 halos dos nós de memória, dava ~2,6 megapixels rasterizados e 24
       objetos de gradiente alocados TODO FRAME — o custo contínuo que segurava
       o site na casa dos 20-30fps.

       Agora o degradê é desenhado UMA vez por cor num sprite pequeno, e cada
       bruma é só um drawImage escalado: cópia acelerada em vez de rasterização.
       O sprite é pequeno de propósito — é um degradê suave, sem detalhe algum
       para preservar, então ampliar não aparece. */
    function mist(x, y, r, rgb, a) { drawHalo(ctx, x, y, r, rgb, a); }

    function frame(now) {
      if (document.hidden) return;
      t++;

      /* estado do organismo: energia acumulada + ressonância + humor persistente */
      var E = EnergyField.E;
      var res = EnergyField.res, mood = EnergyField.mood;

      /* O AI CORE é atualizado ANTES de tudo — o ecossistema segue o núcleo,
         nunca o contrário. Todo o resto abaixo lê o estado dele. */
      var heroPres = Math.max(0, 1 - window.scrollY / (innerHeight * 0.85));
      AICore.update(now, heroPres, E, EnergyField.sing, pointerActive && !coarse, px, py);
      var core = AICore.st;
      var coreX = core.x, coreY = core.y;

      /* pesos do arquétipo (o evento "decide" quem protagoniza) + sinal de
         COMPRESSÃO (carga presente antes da frente começar a percorrer) */
      var rw = res.w || { wCore: 1, wConn: 1, wPart: 1, wType: 1 };
      var cCharge = (res.active && res.front < 0.2) ? res.charge : 0;

      /* ESTADO SINGULAR: a IA assume. grip = domínio (cursor perde autoridade),
         a energia ESQUENTA (pCol/hiCol = temperatura do momento). */
      var sing = EnergyField.sing;
      var singOn = sing.active, grip = singOn ? sing.grip : 0;
      var pCol = singOn ? plasmaColor(sing.warmth, 0) : CY;
      var hiCol = singOn ? plasmaColor(sing.warmth, 1) : HI;

      /* humor muda a cada ressonância → reorganiza partículas/hubs uma vez */
      if (res.gen !== lastGen) { lastGen = res.gen; remutate(); }

      /* brilho: base × humor. No silêncio/compressão o ambiente "prende a
         respiração" (escurece um pouco); a frente propaga um lampejo pelo campo
         (elo 0.12) — nunca um flash global. */
      var glow = (1 + E * 0.95) * mood.glow;
      glow *= 1 - res.charge * 0.30;
      glow += EnergyField.stageExc(0.12) * (0.7 + E * 0.75);
      if (singOn) glow *= 1 + sing.amp * 0.28;                  /* Singular: temperatura sobe */
      if (singOn) glow *= 1 - sing.hush * 0.7;                  /* silêncio absoluto antes do release */
      glow *= 1 + (core.breath - 0.5) * 0.05 * core.pres;       /* o campo respira COM o núcleo */

      /* COMPRESSÃO — a energia CONVERGE pro núcleo (gravitação) antes de percorrer.
         É o que dá ORIGEM FÍSICA ao release: primeiro suga pra dentro, depois solta.
         Mais forte no arquétipo 'core'. Só quando o núcleo está em cena. */
      if (cCharge > 0.02 && window.scrollY < innerHeight * 0.85) {
        var conv = cCharge * 0.02 * rw.wCore;
        for (var ci = 0; ci < ps.length; ci++) {
          var cp = ps[ci];
          var cdx = coreX - cp.x, cdy = coreY - cp.y;
          var cd = Math.sqrt(cdx * cdx + cdy * cdy) + 0.01;
          cp.vx += cdx / cd * conv;
          cp.vy += cdy / cd * conv;
        }
      }

      /* RELEASE — quando a frente alcança o elo das PARTÍCULAS (0.40), a energia
         acumulada no núcleo se solta pra fora. Swell espalhado por vários frames
         enquanto a frente passa: propagação, nunca explosão. Sem onda circular
         (clichê banido) — só o empurrão radial suave, ponderado por wPart. */
      var pExc = EnergyField.stageExc(0.40);
      if (pExc > 0.015) {
        var imp = pExc * 0.36 * rw.wPart;
        for (var bi = 0; bi < ps.length; bi++) {
          var bp = ps[bi];
          var bdx = bp.x - coreX, bdy = bp.y - coreY;
          var bd = Math.sqrt(bdx * bdx + bdy * bdy) + 0.01;
          bp.vx += bdx / bd * imp;
          bp.vy += bdy / bd * imp;
        }
      }

      /* percepção do cursor: parado organiza, rápido perturba */
      var moved = 0;
      if (pointerActive && !coarse) {
        if (lastPX >= 0) moved = Math.hypot(px - lastPX, py - lastPY);
        lastPX = px; lastPY = py;
        /* dt real (efDt), não 16 fixo: em 120Hz o limiar de "parado" era
           alcançado na metade do tempo e o campo se ligava ao cursor cedo demais */
        idleMs = moved < 1.2 ? idleMs + efDt : 0;
        /* memória energética: deposita onde o cursor DEMORA (devagar), não onde
           varre → não é rastro. Mais parado = depósito mais forte. */
        if (moved < 7 && ++memDrop >= 9) {
          memDrop = 0;
          var far = true;
          for (var mi = 0; mi < memory.length; mi++) {
            if (Math.hypot(memory[mi].x - px, memory[mi].y - py) < 28) { far = false; break; }
          }
          if (far) {
            memory.push({ x: px, y: py, a: 0.55 + 0.4 * (1 - moved / 7) });
            if (memory.length > 22) memory.shift();
          }
        }
        if (moved >= 7) memDrop = 0;
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';   /* luz soma como luz */

      /* volumetria: brumas em órbita lenta (2 gradientes grandes/frame — os
         primeiros a cair quando a rede de fps aperta) */
      var qual = EnergyField.quality;
      if (qual > 0.7) {
        mist(W * .5 + Math.cos(t * .0011) * W * .24, H * .35 + Math.sin(t * .0009) * H * .18, 430, pCol, .028 * glow);
        mist(W * .56 + Math.cos(t * .0008 + 2.5) * W * .3, H * .72 + Math.sin(t * .0012 + 1.2) * H * .2, 390, hiCol, .02 * glow);
      }

      /* núcleos orbitam */
      for (var h = 0; h < hubs.length; h++) {
        var hb = hubs[h];
        hb.x = hb.bx + Math.cos(t * hb.sp + hb.ph) * hb.orb;
        hb.y = hb.by + Math.sin(t * hb.sp * .8 + hb.ph) * hb.orb * .7;
      }

      /* a Ressonância também NASCE no núcleo: ele é o primeiro elo da cadeia.
         (o resto da energia do core já foi calculado em AICore.update) */
      core.pow += core.pres * (res.charge * 0.4 * rw.wCore
        + EnergyField.stageExc(0.0) * 0.9 * rw.wCore);
      core.pow = Math.min(singOn ? 3.4 : 2.6, core.pow);

      /* física das partículas */
      var i, p;
      for (i = 0; i < ps.length; i++) {
        p = ps[i];
        p.tw += p.ts;
        var hubP = hubs[p.hub];

        /* campo de fluxo orgânico (fase herda mood.flow → padrão muda a cada evento) */
        var fa = Math.sin(p.x * .0016 + t * .004 + mood.flow) + Math.cos(p.y * .0014 - t * .0032 + mood.flow * .6);
        p.vx += Math.cos(fa * 2.4) * .012 * p.z;
        p.vy += Math.sin(fa * 2.4) * .012 * p.z;

        /* pertencimento ao núcleo */
        p.vx += (hubP.x - p.x) * .0011 * p.z;
        p.vy += (hubP.y - p.y) * .0011 * p.z;

        /* memória energética atrai/energiza partículas próximas */
        for (var mm = 0; mm < memory.length; mm++) {
          var mn2 = memory[mm];
          var mmx = mn2.x - p.x, mmy = mn2.y - p.y;
          var md2 = mmx * mmx + mmy * mmy;
          if (md2 < 13000) {
            var mdd = Math.sqrt(md2) + 0.01;
            var mf = mn2.a * (1 - mdd / 114) * 0.07;
            p.vx += mmx / mdd * mf;
            p.vy += mmy / mdd * mf;
          }
        }

        /* CAMPO DO AI CORE (Camada 2): gravidade real, sem raio de órbita alvo.
           Umas partículas são capturadas, outras escapam, outras voltam — tudo
           consequência da física daquele universo, não animação programada. */
        var inField = false;
        var fm = AICore.fieldAt(p.x, p.y);
        if (fm === 2) {
          /* absorvida: a energia não some — o núcleo a reemite por um dos braços */
          var em = AICore.emitPoint();
          p.x = em.x; p.y = em.y; p.vx = 0; p.vy = 0;
        } else if (fm === 1) {
          p.vx += AICore.F.x; p.vy += AICore.F.y;
          inField = true;
        }

        /* perturbação do cursor: atração magnética + deflexão */
        if (pointerActive && !coarse) {
          var dx = px - p.x, dy = py - p.y;
          var d = Math.sqrt(dx * dx + dy * dy) + .01;
          if (d < 190) {
            var pull = (1 - d / 190) * (1 - grip);   /* SINGULAR: cursor perde autoridade */
            p.vx += dx / d * pull * .5 * mood.cursor;
            p.vy += dy / d * pull * .5 * mood.cursor;
            p.vx += -dy / d * pull * .14;   /* o campo se curva */
            p.vy += dx / d * pull * .14;
          }
        }

        /* atrito baixo DENTRO do campo do núcleo → as órbitas sobrevivem e as
           trajetórias se fecham sozinhas; fora dele o meio continua viscoso */
        var dmp = inField ? .972 : .9;
        p.vx *= dmp; p.vy *= dmp;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
      }

      /* sinapses: só dentro do mesmo núcleo (rede, não teia aleatória). É o custo
         O(n²) por hub — a rede de fps corta a partir do degrau médio. */
      ctx.lineWidth = .7;
      /* agrupa por hub UMA vez por frame. Antes: uma varredura completa de ps
         por hub + um array novo por hub a cada frame (M×N passos e lixo pro GC
         a 60fps). Agora: N passos e zero alocação. */
      if (qual >= 0.5) {
        for (h = 0; h < buckets.length; h++) buckets[h].length = 0;
        for (i = 0; i < ps.length; i++) {
          var bk = buckets[ps[i].hub];
          if (bk) bk.push(ps[i]);
        }
        for (h = 0; h < hubs.length; h++) {
          var members = buckets[h] || [];
          for (i = 0; i < members.length; i++) {
            for (var j = i + 1; j < members.length; j++) {
              var a2 = members[i], b2 = members[j];
              var dd = Math.hypot(a2.x - b2.x, a2.y - b2.y);
              if (dd < 72) {
                var la = (1 - dd / 72) * .07 * a2.z * (1 + E * 1.0);  /* afinado (Fase 5) */
                la *= 1 - res.charge * 0.5;                    /* tensão: conexões somem no silêncio */
                la *= 1 + EnergyField.stageExc(0.25) * 1.7 * rw.wConn;   /* frente passa pelas conexões (elo 0.25) */
                if (pointerActive && !coarse) {
                  var mx = (a2.x + b2.x) / 2, my = (a2.y + b2.y) / 2;
                  var dc = Math.hypot(mx - px, my - py);
                  if (dc < 210) la *= 1 + (1 - dc / 210) * 2.6;   /* acorda perto do cursor */
                }
                ctx.strokeStyle = 'rgba(' + pCol + ',' + la.toFixed(3) + ')';
                ctx.beginPath();
                ctx.moveTo(a2.x, a2.y);
                ctx.lineTo(b2.x, b2.y);
                ctx.stroke();

                /* pulso de energia ocasional pela sinapse (mais frequente c/ E) */
                if (pulses.length < 20 && Math.random() < .004 * (1 + E * 2.5) * mood.rate) {  /* freq. varia c/ humor */
                  pulses.push({
                    fx: a2.x, fy: a2.y, tx: b2.x, ty: b2.y, t: 0,
                    gold: Math.random() < .12
                  });
                }
              }
            }
          }
        }
      }

      /* cursor parado: sinapses ligam até ele + fluxo de energia */
      if (pointerActive && !coarse && idleMs > 600) {
        var linked = 0;
        for (i = 0; i < ps.length && linked < 5; i++) {
          p = ps[i];
          var dc2 = Math.hypot(p.x - px, p.y - py);
          if (dc2 < 170) {
            ctx.strokeStyle = 'rgba(' + HI + ',' + ((1 - dc2 / 170) * .14).toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(px, py);
            ctx.stroke();
            linked++;
            if (pulses.length < 12 && Math.random() < .01 * (1 + E)) {
              pulses.push({ fx: p.x, fy: p.y, tx: px, ty: py, t: 0, gold: Math.random() < .2 });
            }
          }
        }
      }

      /* partículas: núcleo + halo (volume) */
      for (i = 0; i < ps.length; i++) {
        p = ps[i];
        var pa = (.16 + .3 * (0.5 + 0.5 * Math.sin(p.tw))) * p.z * glow;
        var rgb = p.z > 1.15 ? hiCol : pCol;
        ctx.fillStyle = 'rgba(' + rgb + ',' + (pa * .16).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(' + rgb + ',' + pa.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.z, 0, TAU);
        ctx.fill();
      }

      /* pulsos viajando */
      for (i = pulses.length - 1; i >= 0; i--) {
        var pu = pulses[i];
        pu.t += .035;
        if (pu.t >= 1) { pulses.splice(i, 1); continue; }
        var pxp = pu.fx + (pu.tx - pu.fx) * pu.t;
        var pyp = pu.fy + (pu.ty - pu.fy) * pu.t;
        var rgb2 = pu.gold ? GO : HI;
        var fade = Math.sin(pu.t * Math.PI);
        ctx.fillStyle = 'rgba(' + rgb2 + ',' + (fade * .16).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(pxp, pyp, 4.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(' + rgb2 + ',' + (fade * .85).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(pxp, pyp, 1.4, 0, TAU);
        ctx.fill();
      }

      /* memória energética: pontos onde o cursor demorou permanecem e desvanecem
         lentamente (~4-5s). Não é rastro — é o lugar que o campo lembra. */
      for (i = memory.length - 1; i >= 0; i--) {
        var mn = memory[i];
        mn.a *= 0.986;
        if (mn.a < 0.02) { memory.splice(i, 1); continue; }
        if (qual > 0.6) mist(mn.x, mn.y, 54 + mn.a * 66, HI, mn.a * 0.05);   /* halo do nó: cortado antes do dot */
        ctx.fillStyle = 'rgba(' + HI + ',' + (mn.a * 0.5).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(mn.x, mn.y, 1.4 + mn.a * 1.8, 0, TAU);
        ctx.fill();
      }

      /* AI CORE — o núcleo NÃO se desenha mais aqui. O visual do núcleo agora é o
         reator do hero (heroReactor, §3f); este campo só fornece a FÍSICA (o
         atrator gravitacional em AICore.st, ancorado ao reator). O antigo desenho
         oco foi removido por completo. */

      /* REVELAÇÃO TEMPORÁRIA: durante a ressonância, filamentos normalmente
         invisíveis escapam do núcleo acompanhando a frente — "linhas de energia
         escondidas". Só desenha enquanto reveal>0; some sozinho no eco. Barato
         (~10 traços). A distribuição gira com res.seed → nunca igual. */
      if (res.reveal > 0.02 && heroPres > 0.04) {
        var rv = res.reveal;
        var spokes = Math.round(10 * rw.wCore);   /* arquétipo 'core' revela mais circuitos */
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + hiCol + ',' + (rv * 0.07 * rw.wCore).toFixed(3) + ')';
        for (var sp = 0; sp < spokes; sp++) {
          var sa = sp / spokes * TAU + t * 0.002 + res.seed * TAU;
          var r2 = 70 + 300 * res.front;
          ctx.beginPath();
          ctx.moveTo(coreX + Math.cos(sa) * 70, coreY + Math.sin(sa) * 70);
          ctx.lineTo(coreX + Math.cos(sa) * r2, coreY + Math.sin(sa) * r2);
          ctx.stroke();
        }
      }
      /* SINGULAR — FEIXES do núcleo até cada card visível: toda a interface ligada
         a uma só consciência. Rects amostrados a cada 15 frames (sem thrash). O
         feixe nasce branco-quente no núcleo e desvanece no card. */
      if (singOn && grip > 0.35 && qual > 0.5) {
        if (beamTick % 15 === 0) {
          beamCenters.length = 0;
          var lits = document.querySelectorAll('.lit, .cta-panel');
          for (var li = 0; li < lits.length; li++) {
            var lb = lits[li].getBoundingClientRect();
            if (lb.bottom > 0 && lb.top < H && lb.width) beamCenters.push([lb.left + lb.width / 2, lb.top + lb.height / 2]);
          }
        }
        beamTick++;
        var ba = grip * sing.reveal * 0.16;
        if (ba > 0.004) {
          ctx.lineWidth = 1;
          for (var bc = 0; bc < beamCenters.length; bc++) {
            var bx = beamCenters[bc][0], by = beamCenters[bc][1];
            var grd = ctx.createLinearGradient(coreX, coreY, bx, by);
            grd.addColorStop(0, 'rgba(' + hiCol + ',' + ba.toFixed(3) + ')');
            grd.addColorStop(1, 'rgba(' + pCol + ',0)');
            ctx.strokeStyle = grd;
            ctx.beginPath(); ctx.moveTo(coreX, coreY); ctx.lineTo(bx, by); ctx.stroke();
          }
        }
      } else if (beamTick) { beamTick = 0; beamCenters.length = 0; }
    }
    EnergyField.add(frame, 'neuralEnergyField');   /* plugado no loop único do organismo */
  })();

  /* ========== 3c. REATORES DOM (Fase 2) ==========
     Cada superfície reativa (cards, botões, mocks, painel) amostra o campo
     na sua posição e escreve --energy (0..1); o CSS responde. Desperta ANTES
     do hover e, por acoplamento, um reator forte "vaza" energia pros vizinhos
     próximos → reação em cadeia. Rects cacheados (recalc só em scroll/resize),
     IntersectionObserver pula off-screen, escrita gated por epsilon. Só
     desktop de ponteiro fino; no touch o .is-lit por toque continua valendo. */
  (function domReactors() {
    if (reduced || !pointerFine) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    /* .btn/.nav__cta ficaram de fora: têm overflow:hidden e nenhuma regra que
       leia o --energy deles, então o halo injetado ali nunca pintava nada —
       era só nó extra no DOM e matemática por frame. */
    var nodes = document.querySelectorAll('.lit, .mock, .cta-panel');
    if (!nodes.length) return;

    var R = [];
    nodes.forEach(function (el) {
      // Injeta a camada de energia (aceleração por hardware)
      var glow = document.createElement('div');
      glow.className = 'energy-glow';
      glow.setAttribute('aria-hidden', 'true');
      el.insertBefore(glow, el.firstChild);

      R.push({ el: el, cx: 0, cy: 0, rad: 160, pt: 0, e: 0, ve: 0, w: -1, vis: true,
        /* geometria da placa + últimos valores escritos de foco/inclinação/recuo */
        bl: 0, bt: 0, bw: 1, bh: 1,
        tx: 0, ty: 0, wtx: -9, wty: -9,
        dim: 0, wdim: -9 });
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          for (var k = 0; k < R.length; k++) {
            if (R[k].el === en.target) { R[k].vis = en.isIntersecting; break; }
          }
        });
      }, { rootMargin: '90px' });
      R.forEach(function (r) { io.observe(r.el); });
    }

    var dirty = true;
    function remeasure() {
      for (var k = 0; k < R.length; k++) {
        var b = R[k].el.getBoundingClientRect();
        R[k].cx = b.left + b.width / 2;
        R[k].cy = b.top + b.height / 2;
        R[k].rad = Math.max(b.width, b.height) * 0.5 + 70;   /* alcance curto: foca no card sob o cursor */
        R[k].bl = b.left; R[k].bt = b.top;
        R[k].bw = b.width || 1; R[k].bh = b.height || 1;
      }
      dirty = false;
    }
    window.addEventListener('scroll', function () { dirty = true; }, { passive: true });
    window.addEventListener('resize', debounce(function () { dirty = true; }, 150));

    var NEIGH = 380;    /* alcance do acoplamento — curto: só o vizinho imediato reage */

    function write(r, target) {
      var k = target < r.e ? 0.06 : 0.18;   /* acende rápido, apaga devagar */
      r.ve += (target - r.e) * k; r.ve *= 0.72; r.e += r.ve;
      if (r.e < 0.0015 && target === 0) { r.e = 0; r.ve = 0; }
      if (Math.abs(r.e - r.w) > 0.008 || (r.e === 0 && r.w !== 0)) {
        r.w = r.e;
        r.el.style.setProperty('--energy', r.e.toFixed(3));
      }
    }

    /* INCLINAÇÃO E RECUO — nascem aqui porque os rects já estão medidos e o laço
       já roda: nenhum layout novo, nenhum listener novo.
       · --tilt-x/-y: a placa cede ao campo — só o bastante pra dar imersão.
         Composto no CSS junto com o translateY do hover (o .tilt dos mocks
         escreve style.transform direto e atropelaria essa composição).
       · --dim: quando OUTRA placa domina, esta recua. É o acoplamento existente
         lido ao contrário — o sistema já sabia quem estava sendo observado. */
    var TILT = 3.4;                      /* graus: o suficiente pra sentir, não pra notar */
    function writeFocus(r, dominance) {
      var ease = 0.14;
      if (r.pt > 0.002) {
        var lx = (px - r.bl) / r.bw, ly = (py - r.bt) / r.bh;
        lx = lx < -0.35 ? -0.35 : (lx > 1.35 ? 1.35 : lx);
        ly = ly < -0.35 ? -0.35 : (ly > 1.35 ? 1.35 : ly);
        r.tx += ((0.5 - ly) * 2 * TILT * r.pt - r.tx) * ease;
        r.ty += ((lx - 0.5) * 2 * TILT * r.pt - r.ty) * ease;
      } else {
        r.tx += (0 - r.tx) * 0.08;       /* sem presença a placa volta ao plano */
        r.ty += (0 - r.ty) * 0.08;
      }
      r.dim += (dominance - r.dim) * 0.09;

      if (Math.abs(r.tx - r.wtx) > 0.02) { r.wtx = r.tx; r.el.style.setProperty('--tilt-x', r.tx.toFixed(2) + 'deg'); }
      if (Math.abs(r.ty - r.wty) > 0.02) { r.wty = r.ty; r.el.style.setProperty('--tilt-y', r.ty.toFixed(2) + 'deg'); }
      if (Math.abs(r.dim - r.wdim) > 0.01) {
        r.wdim = r.dim;
        r.el.style.setProperty('--dim', r.dim.toFixed(3));
        /* PERF: a classe é o gatilho do filtro no CSS. Sem ela, a placa em
           repouso carregaria uma camada de composição para computar
           saturate(1) — custo permanente por efeito nenhum. */
        var querDim = r.dim > 0.01;
        if (querDim !== r.dimOn) { r.dimOn = querDim; r.el.classList.toggle('is-dim', querDim); }
      }
    }

    function tick() {
      if (document.hidden) return;
      var S = EnergyField.sing;
      if (S.active) {
        /* SINGULAR: os cards deixam de responder individualmente — sincronizam
           como UMA estrutura, comandados pelo estado global (ignoram o cursor). */
        var sv = 0.12 + S.amp * 0.8 * S.grip;
        for (var q = 0; q < R.length; q++) {
          /* o cursor perde autoridade: foco, inclinação e recuo relaxam a zero
             e a estrutura responde como um corpo só */
          R[q].pt = 0; writeFocus(R[q], 0);
          write(R[q], R[q].vis ? sv : 0);
        }
        return;
      }
      if (!pointerActive) {
        /* sem ponteiro (ex.: logo após o Singular, se o usuário nunca moveu o
           mouse) os reatores ainda precisam DESCER — senão --energy fica preso
           no valor que o Singular escreveu e os cards ficam acesos pra sempre */
        for (var z = 0; z < R.length; z++) {
          R[z].pt = 0; writeFocus(R[z], 0);
          if (R[z].e !== 0 || R[z].w > 0) write(R[z], 0);
        }
        return;
      }
      if (dirty) remeasure();

      var i, j, r;
      /* pass 1: alvo por proximidade do cursor */
      for (i = 0; i < R.length; i++) {
        r = R[i];
        if (!r.vis) { r.pt = 0; continue; }
        var dx = px - r.cx, dy = py - r.cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        r.pt = d < r.rad ? (1 - d / r.rad) : 0;
      }
      /* pass 2: acoplamento — vizinho mais forte vaza energia (reação em cadeia).
         O mesmo varrimento entrega, de graça, quem está sendo observado: o maior
         pt alheio vira `spill` (energia que vaza) E `dominance` (o recuo). */
      for (i = 0; i < R.length; i++) {
        r = R[i];
        if (!r.vis) { r.pt = 0; writeFocus(r, 0); write(r, 0); continue; }
        var spill = 0, strongest = 0;
        for (j = 0; j < R.length; j++) {
          if (j === i || !R[j].vis || R[j].pt <= r.pt) continue;
          if (R[j].pt > strongest) strongest = R[j].pt;
          var ndx = R[j].cx - r.cx, ndy = R[j].cy - r.cy;
          var nd = Math.sqrt(ndx * ndx + ndy * ndy);
          if (nd < NEIGH) spill = Math.max(spill, R[j].pt * (1 - nd / NEIGH) * 0.4);  /* vizinho sutil, não acende junto */
        }
        var target = Math.min(1, r.pt + spill);
        if (r.pt > 0) target = Math.min(1, target + EnergyField.E * 0.06);  /* mais vivo fundo */
        writeFocus(r, Math.max(0, Math.min(1, strongest - r.pt)));
        write(r, target);
      }
    }

    EnergyField.add(tick, 'domReactors');
  })();

  /* ========== 3c-ter. BARRAMENTO DA SEÇÃO (filamentos card ↔ núcleo) ==========
     Os módulos de serviço não estão soltos numa grade: estão PLUGADOS. Um núcleo
     local ocupa o vazio entre as fileiras e cada card sustenta um filamento até
     ele. O núcleo NÃO é um segundo AI Core — é a mesma entidade se manifestando
     na seção: respiração, potência e ignição estelar vêm de EnergyField.core.

     Sentido do fluxo conta a história certa:
       repouso  → card ALIMENTA o núcleo (pacotes correm para dentro)
       ressonância → o núcleo DEVOLVE (a frente da onda sai dele para os cards)
     A intensidade dos filamentos usa a primitiva stageExc(0.25) — o elo
     "conexões" da cadeia — então a onda chega aqui na ordem certa, antes dos
     cards (0.70). Nada é temporizado à mão.

     Canvas próprio, dpr 1, blend aditivo, sem rAF próprio (registra em
     EnergyField.add). Some fora da viewport e abaixo de 700px de largura, onde
     a grade colapsa e um núcleo central não descreveria mais nada. */
  (function serviceBus() {
    if (reduced) return;
    var wrap = document.querySelector('.bus');
    var cv = wrap && wrap.querySelector('.bus__cv');
    if (!cv) return;
    var cards = [].slice.call(wrap.querySelectorAll('.service'));
    if (!cards.length) return;
    var ctx = cv.getContext('2d');

    var W = 0, H = 0, on = false, vis = true, dirty = true, T = 0, last = 0;
    /* o raio da placa só muda quando o layout muda. `dirty` é ligado a cada
       frame de scroll; ler getComputedStyle dos 6 cards ali era um estilo
       recalculado por frame para buscar um número que nunca mudava. */
    var radiiDirty = true;
    var coreX = 0, coreY = 0;      /* o núcleo mora no corredor, não no centro do retângulo */
    /* Régua do tracejado: CONSTANTE de propósito — ver o bloco FLUXO no tick.
       Duty de 32%: traço curto o bastante para ser carga em movimento, longo o
       bastante para não ser um ponto piscando. */
    var DASH = [6, 13], DASHP = 19;
    /* um estado por card: âncora na borda, curvatura própria e pacotes em rota */
    var L = cards.map(function (el, i) {
      return {
        el: el, ax: 0, ay: 0, cx: 0, cy: 0, ctlx: 0, ctly: 0,
        /* footprint da placa — preenchido em measure(); declarado aqui para o
           objeto nascer com a forma final (sem transição de hidden class) */
        bx: 0, by: 0, bw: 1, bh: 1, br: 0,
        seed: i * 1.7 + 0.4,
        bow: (i % 2 ? 1 : -1) * (0.16 + (i % 3) * 0.05),   /* lado da curva */
        /* 4 fases: em repouso só 2 correm; sob carga o trem enche o conduíte */
        pk: [Math.random(), Math.random() * 0.5 + 0.4, Math.random(), Math.random(),
             Math.random(), Math.random()],
        dash: Math.random() * 60,                           /* fase do fluxo interno */
        e: 0
      };
    });

    function measure() {
      var wr = wrap.getBoundingClientRect();
      W = Math.round(wr.width); H = Math.round(wr.height);
      on = W >= 700;
      cv.style.display = on ? '' : 'none';
      if (!on) return;
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;

      /* Centro do CORREDOR entre as fileiras. As fileiras raramente têm a mesma
         altura (um título que quebra em duas linhas já desalinha), então o centro
         geométrico do canvas deixa o núcleo visivelmente mais perto de uma delas.
         Duas passadas: primeiro acha o corredor, depois ancora os filamentos. */
      var mid = H / 2, hiBottom = -1, loTop = H + 1, i, b;
      for (i = 0; i < L.length; i++) {
        b = L[i].el.getBoundingClientRect();
        var top = b.top - wr.top, bot = top + b.height;
        if (top + b.height / 2 < mid) { if (bot > hiBottom) hiBottom = bot; }
        else if (top < loTop) loTop = top;
      }
      coreX = W / 2;
      coreY = (hiBottom > 0 && loTop <= H && loTop > hiBottom) ? (hiBottom + loTop) / 2 : mid;

      var nx = coreX, ny = coreY;
      for (i = 0; i < L.length; i++) {
        b = L[i].el.getBoundingClientRect();
        var cx = b.left - wr.left + b.width / 2;
        var cy = b.top - wr.top + b.height / 2;
        /* âncora = onde a reta centro-do-card → núcleo fura a borda do card.
           Sai sozinho na lateral certa (e no meio dela quando estão alinhados). */
        var dx = nx - cx, dy = ny - cy;
        var t = Math.min(
          Math.abs(dx) > 0.001 ? (b.width / 2) / Math.abs(dx) : 9,
          Math.abs(dy) > 0.001 ? (b.height / 2) / Math.abs(dy) : 9
        );
        L[i].cx = cx; L[i].cy = cy;
        L[i].ax = cx + dx * t; L[i].ay = cy + dy * t;
        /* footprint da placa: o barramento é recortado para FORA dela */
        L[i].bx = b.left - wr.left; L[i].by = b.top - wr.top;
        L[i].bw = b.width; L[i].bh = b.height;
        if (radiiDirty) L[i].br = parseFloat(getComputedStyle(L[i].el).borderTopLeftRadius) || 0;
      }
      radiiDirty = false;
      dirty = false;
    }

    /* A energia só existe no VAZIO entre os módulos. Com o corpo do card
       translúcido, qualquer traço pintado sob a placa vazava e lia como
       arranhão dentro do conteúdo. Recorta o canvas em (área − placas): o
       filamento morre exatamente onde encosta, como se entrasse na matéria. */
    var hasRound = typeof ctx.roundRect === 'function';
    function clipToVoid() {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      for (var i = 0; i < L.length; i++) {
        var l = L[i];
        if (hasRound) ctx.roundRect(l.bx, l.by, l.bw, l.bh, l.br);
        else ctx.rect(l.bx, l.by, l.bw, l.bh);
      }
      ctx.clip('evenodd');
    }
    window.addEventListener('resize', debounce(function () { dirty = radiiDirty = true; }, 180));
    window.addEventListener('scroll', function () { dirty = true; }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) {
        vis = ents[0].isIntersecting;
      }, { rootMargin: '120px' }).observe(wrap);
    }

    function tick(now) {
      if (document.hidden) return;
      if (dirty) measure();
      if (!on) return;
      if (!vis) return;

      var dt = last ? Math.min(50, now - last) : 16;
      last = now; T += dt;

      var qual = EnergyField.quality;
      var E = EnergyField.E;
      var R = EnergyField.res, S = EnergyField.sing, C = EnergyField.core;
      var singOn = S.active;
      var link = EnergyField.stageExc(0.25);      /* elo "conexões" da cadeia */
      /* stageExc() só existe DURANTE a ressonância. No Singular a cadeia não está
         propagando — quem manda é o evento — então o barramento ficava no piso,
         parado e apagado justo quando deveria estar carregando a estrutura.
         `surge` é a carga do Singular; `flow` é a intensidade real do conduíte. */
      var surge = singOn ? Math.min(1, S.amp * 0.5 + S.grip * 0.6) : 0;
      var flow = Math.min(1.5, link + surge * 1.3);
      /* NO DOURADO A CORRENTE DESACELERA. `surge` empurrava só para cima — carga
         e velocidade juntas — e no ápice do Singular o conduíte virava borrão.
         O plasma é mais DENSO que o ciano: a intensidade sobe, a pressa cai.
         No pico (surge 1) a corrente corre a ~24% da velocidade que teria, o que
         a devolve à cadência de repouso enquanto tudo em volta queima. */
      var slow = 1 - surge * 0.76;

      var CY = singOn ? plasmaColor(S.warmth, 0) : PALETTE.glow;
      var HI = singOn ? plasmaColor(S.warmth, 1) : PALETTE.hi;
      var CO = singOn ? plasmaColor(S.warmth, 2) : PALETTE.core;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      clipToVoid();
      ctx.globalCompositeOperation = 'lighter';

      var nx = coreX, ny = coreY;
      /* SELEÇÃO — a maior energia entre as placas (valor do frame anterior, a
         diferença é imperceptível). O núcleo não é decorativo: quando uma placa
         é escolhida ele CARREGA, e isso se vê no tamanho e no brilho dele. */
      var maxE = 0;
      for (var mi = 0; mi < L.length; mi++) if (L[mi].e > maxE) maxE = L[mi].e;

      /* o núcleo local respira com a entidade e incha na compressão/ignição */
      var pow = Math.min(1.6, (C ? C.pow : 0.5) * 0.5 + 0.3 + E * 0.3 + flow * 0.7 + maxE * 0.55);
      var breath = C ? C.breath : 0.5;
      var star = C ? C.star : 0;
      var Rn = 13 + breath * 3 + flow * 7 + maxE * 5 + (C ? C.strain * 9 : 0) + star * 12;

      /* --- linha de barramento: atravessa a seção e some nas pontas --- */
      var lg = ctx.createLinearGradient(0, ny, W, ny);
      var la = 0.06 + E * 0.05 + flow * 0.24 + maxE * 0.14 + star * 0.2;
      lg.addColorStop(0, 'rgba(' + CY + ',0)');
      lg.addColorStop(0.5, 'rgba(' + CY + ',' + la.toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(' + CY + ',0)');
      ctx.strokeStyle = lg; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, ny); ctx.lineTo(W, ny); ctx.stroke();

      /* --- filamentos + nós --- */
      for (var i = 0; i < L.length; i++) {
        var l = L[i];
        var raw = parseFloat(l.el.style.getPropertyValue('--energy')) || 0;
        l.e += (raw - l.e) * 0.12;      /* o filamento tem inércia própria */
        var drive = Math.min(1, l.e + link * 0.85 + surge * 0.95);

        /* FLUXO LOCAL. `flow` sozinho só existe na Ressonância e no Singular —
           era por isso que, com o cursor sobre um card, o conduíte dele ficava
           parado: a bainha não abria, o tracejado nem ligava e os pacotes
           andavam no mínimo. A energia da placa agora alimenta o próprio feixe. */
        var lf = Math.min(1.5, flow + l.e * 1.15);

        /* O sentido é UM SÓ: a energia transborda do núcleo para as placas. Antes
           ele se invertia conforme a energia da placa, o que dava um instante
           bonito de "virada" mas contava a história errada — o núcleo é a fonte,
           não um coletor. A seleção muda a INTENSIDADE do fluxo, não o rumo. */
        var dir = -1;

        /* a curva oscila devagar: o filamento é sustentado, não desenhado */
        var mx = (l.ax + nx) / 2, my = (l.ay + ny) / 2;
        var vx = nx - l.ax, vy = ny - l.ay;
        var wob = Math.sin(T * 0.00042 + l.seed) * 0.55 + Math.sin(T * 0.00027 * 1.618 + l.seed * 1.4) * 0.45;
        var k = l.bow * (0.72 + wob * 0.42) * (1 - lf * 0.3);
        l.ctlx = mx - vy * k; l.ctly = my + vx * k;

        var a = 0.15 + drive * 0.34 + E * 0.055;

        /* 1) TRANSBORDO — não é uma bainha grossa em volta do fio (isso lia como
           tubo de interface). É só o núcleo vazando: um alargamento levíssimo,
           forte na saída e extinto antes do meio do caminho. */
        if (lf > 0.25) {
          var og = ctx.createLinearGradient(nx, ny, l.ax, l.ay);
          og.addColorStop(0, 'rgba(' + CY + ',' + (0.019 + lf * 0.078).toFixed(3) + ')');
          og.addColorStop(0.42, 'rgba(' + CY + ',0)');
          og.addColorStop(1, 'rgba(' + CY + ',0)');
          ctx.strokeStyle = og;
          ctx.lineWidth = 1.6 + lf * 2.4;
          ctx.beginPath();
          ctx.moveTo(l.ax, l.ay);
          ctx.quadraticCurveTo(l.ctlx, l.ctly, nx, ny);
          ctx.stroke();
        }

        /* 2) FIO — sub-pixel de propósito. A energia é lida pelo que CORRE dentro
           dele, não pela espessura do traço. Nasce claro no núcleo e se dilui em
           direção à placa: a direção da transferência está na própria cor. */
        var g = ctx.createLinearGradient(nx, ny, l.ax, l.ay);
        g.addColorStop(0, 'rgba(' + HI + ',' + (a * 1.12).toFixed(3) + ')');
        g.addColorStop(0.5, 'rgba(' + CY + ',' + (a * 0.66).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + CY + ',' + (a * 0.8).toFixed(3) + ')');
        ctx.strokeStyle = g;
        /* ~1px em vez de sub-pixel: um traço de 0.6px espalha o alfa por dois
           pixels no antialiasing e perde metade do brilho. Em 1px a linha fica
           NÍTIDA e mais presente sem ficar mais grossa aos olhos. */
        ctx.lineWidth = 0.95 + lf * 0.5;
        ctx.beginPath();
        ctx.moveTo(l.ax, l.ay);
        ctx.quadraticCurveTo(l.ctlx, l.ctly, nx, ny);
        ctx.stroke();

        /* 3) FLUXO — traço tracejado deslizando DENTRO do conduíte. É o que faz
           a energia parecer correr de ponta a ponta em vez de piscar no lugar:
           corrente contínua, não pacotes soltos. Fase própria por filamento. */
        if (lf > 0.03 && qual > 0.38) {   /* só o piso real desliga a corrente */
          /* A CINTILAÇÃO ERA JITTER, NÃO VELOCIDADE. O padrão era
             `[3+lf*5, 20+lf*12]`, ou seja um PERÍODO que crescia com a energia.
             `lineDashOffset` conta em pixels, então o traço nº n mora em
             n*período: bastava o `lf` respirar para cada traço saltar um
             múltiplo da variação, tudo de uma vez. Régua fixa agora. Só a
             velocidade, o alfa e a densidade do trem de pacotes respondem à
             energia; a geometria do tracejado não se move mais.
             ~26px/s em repouso a ~120px/s no ápice ciano (1,4 a 6,3 ciclos/s
             sobre 19px) e ~29px/s no ápice dourado, por conta de `slow`. */
          l.dash += (0.026 + lf * 0.062) * dt * dir * slow;
          l.dash %= DASHP;               /* a fase não precisa crescer para sempre */
          ctx.save();
          ctx.setLineDash(DASH);
          ctx.lineDashOffset = -l.dash;
          /* Intensidade vem do ALFA, não da espessura. O tracejado antigo chegava
             a 2,08px contra um fio de 1,7px — era ELE que engrossava a linha aos
             olhos. Agora fica sempre mais fino que o fio que o contém. */
          ctx.strokeStyle = 'rgba(' + CO + ',' + Math.min(0.92, 0.17 + lf * 0.56).toFixed(3) + ')';
          ctx.lineWidth = 0.68 + lf * 0.34;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(l.ax, l.ay);
          ctx.quadraticCurveTo(l.ctlx, l.ctly, nx, ny);
          ctx.stroke();
          ctx.restore();
        }

        /* nó de contato: onde o feixe encosta na placa, a energia acumula.
           Discreto — quem tem que brilhar é o núcleo, não o ponto de solda.
           Dois arcos em vez de createRadialGradient: um gradiente novo por
           filamento por frame era custo puro para um blob de 8px. */
        var na = 0.14 + drive * 0.36 + lf * 0.22;
        var nr = 1.3 + drive * 1.5 + lf * 1.2;
        ctx.fillStyle = 'rgba(' + HI + ',' + (na * 0.3).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(l.ax, l.ay, nr * 2.6, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(' + CO + ',' + Math.min(0.95, na).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(l.ax, l.ay, nr, 0, 6.2832); ctx.fill();

        /* PACOTES EM TRÂNSITO — a assinatura visível do sistema.
           Antes viviam atrás de `qual >= 0.5`. Como a rede de FPS só DESCE
           (piso .38, nunca volta a subir), o primeiro pulso — o frame mais caro
           da página — derrubava dois degraus e as bolinhas sumiam PARA SEMPRE.
           Agora a qualidade reduz a QUANTIDADE, nunca a presença: no piso ainda
           corre um pacote por feixe. E o desenho ficou barato o bastante para
           não ser ele a derrubar o frame. */
        /* Velocidade AMARRADA à do tracejado. Antes o termo de `lf` era 0.00115:
           no ápice os pacotes cruzavam o fio a ~505px/s enquanto o tracejado
           arrastava a ~119px/s. Duas correntes a 4x de diferença no MESMO fio não
           somam — brigam, e o conjunto lê como ruído. Agora ficam em ~1,8x: os
           grãos vão na frente da corrente, no mesmo rumo e na mesma ordem. */
        var spd = (0.00022 + drive * 0.00042 + lf * 0.00045) * dt * slow;
        /* A quantidade cresce por FADE, não por contador. `np = 2+round(lf*2.4)`
           era um degrau: ao subir, o pacote novo APARECIA no meio do fio com a
           fase que estava guardada; ao descer, um pacote em voo evaporava. Pop
           seco nos dois sentidos — a segunda fonte da cintilação. Agora todos
           avançam sempre (a fase nunca pula) e entram por rampa de opacidade. */
        var pcap = qual < 0.5 ? 3 : l.pk.length;
        for (var p = 0; p < l.pk.length; p++) {
          l.pk[p] += spd;
          if (l.pk[p] > 1) l.pk[p] -= 1;
          if (p >= pcap) continue;
          var gain = p < 2 ? 1 : Math.min(1, Math.max(0, (lf - (p - 2) * 0.34) / 0.3));
          if (gain < 0.01) continue;
          var u = dir >= 0 ? l.pk[p] : 1 - l.pk[p];
          var iu = 1 - u;
          var px2 = iu * iu * l.ax + 2 * iu * u * l.ctlx + u * u * nx;
          var py2 = iu * iu * l.ay + 2 * iu * u * l.ctly + u * u * ny;
          /* nasce e morre nas pontas: nada aparece do nada no meio do fio */
          var fade = Math.sin(u * 3.14159);
          var pa = (0.12 + drive * 0.46 + lf * 0.38) * fade * gain;
          if (pa < 0.012) continue;
          /* MENORES. Era `0.9 + drive + lf*0.85` — miolo de até 2,75px e halo de
             6,9px, esferas que dominavam um fio de 1,7px. O protagonista é o
             fluxo; o pacote é só o grão que ele carrega. Agora 1,5px de miolo. */
          var pr = 0.58 + drive * 0.42 + lf * 0.34;
          /* halo + miolo: dois arcos sólidos, sem gradiente por frame */
          ctx.fillStyle = 'rgba(' + CY + ',' + (pa * 0.34).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(px2, py2, pr * 2.1, 0, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(' + CO + ',' + Math.min(0.95, pa).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(px2, py2, pr, 0, 6.2832); ctx.fill();
        }
      }

      /* --- núcleo local: anéis concêntricos e o ponto ---
         O halo radial de ~4x o raio saiu: lia como uma "bola de luz" colada no
         núcleo, competia com os feixes e era o maior gradiente por frame do
         módulo. O núcleo agora se define por estrutura (anéis + miolo), como o
         resto do sistema — a luz difusa quem faz é o campo, não uma esfera. */
      var rings = qual > 0.6 ? 3 : 2;
      for (var r2 = 0; r2 < rings; r2++) {
        var rr = Rn * (0.52 + r2 * 0.46);
        var ra = (0.34 - r2 * 0.08) * (0.5 + pow * 0.5) + link * 0.2 + star * 0.25;
        ctx.strokeStyle = 'rgba(' + (r2 === 0 ? HI : CY) + ',' + Math.min(0.9, ra).toFixed(3) + ')';
        ctx.lineWidth = r2 === 0 ? 1.2 : 0.8;
        ctx.beginPath(); ctx.arc(nx, ny, rr, 0, 6.2832); ctx.stroke();
      }

      var cr = 2.4 + breath * 1.1 + link * 2.2 + star * 3;
      var cg = ctx.createRadialGradient(nx, ny, 0, nx, ny, cr * 3.6);
      cg.addColorStop(0, 'rgba(' + CO + ',' + Math.min(1, 0.62 + pow * 0.3 + star * 0.3).toFixed(3) + ')');
      cg.addColorStop(0.3, 'rgba(' + HI + ',' + (0.3 + pow * 0.25).toFixed(3) + ')');
      cg.addColorStop(1, 'rgba(' + CY + ',0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(nx, ny, cr * 3.6, 0, 6.2832); ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    EnergyField.add(tick, 'serviceBus');
  })();

  /* ========== 3c-bis. ECONOMIA DE REPINTURA ==========
     A borda condutiva é um conjunto de conic-gradients animados: cada frame
     repinta o card inteiro. Fora da viewport isso é trabalho jogado fora.
     animation-play-state (não animation:none) → a fase retoma de onde parou e
     nada "pipoca" ao reaparecer. Vale em todo aparelho, inclusive touch. */
  (function idleModules() {
    if (!('IntersectionObserver' in window)) return;
    var mods = document.querySelectorAll('.lit, .cta-panel, .mock__frame');
    if (!mods.length) return;
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        en.target.classList.toggle('is-idle', !en.isIntersecting);
      });
    }, { rootMargin: '140px' });
    mods.forEach(function (el) { io.observe(el); });
  })();

  /* ========== 3d. TIPOGRAFIA VIVA (Fase 4) ==========
     [PARKED — voltar depois: dono achou a v2 (letras de energia) ilegível.
      Revertido pra v1 (pontos sutis sobre os glifos, só perto do cursor).]
     Overlay de canvas por título; pontos amostrados sobre a letra. Perto do
     cursor: onda L→R + brilho conforme o cursor + faíscas que escapam e voltam.
     Em repouso não desenha nada (título limpo). Só desktop ponteiro fino. */
  /* ===== MOTOR DE REESCRITA (compartilhado) =====
     Alfabeto do ruído + morph caractere-a-caractere. UM só motor: a reescrita do
     Singular (§3e) e os STATUS DINÂMICOS (§3g) passam por aqui, então nenhum
     texto do site "troca" — ele sempre se REESCREVE. Cada caractere desestabiliza
     antes de assentar (a janela abre em r=-0.35, antes do reveal). */
  var TXT_GL = '01<>/\\[]{}=+*#%&ABCDEF';
  function txtGlyph() { return TXT_GL.charAt((Math.random() * TXT_GL.length) | 0); }
  function txtMorph(calm, sing, p) {
    var L = Math.max(calm.length, sing.length), out = '', i, r, from, to;
    for (i = 0; i < L; i++) {
      from = calm.charAt(i); to = sing.charAt(i);
      r = (p - (i / (L || 1)) * 0.5) / 0.4;
      if (r >= 1) out += to;
      else if (r <= -0.35) out += from;
      else out += (to === ' ' && from === ' ') ? ' ' : txtGlyph();
    }
    return out;
  }

  /* ========== 3g. TIPOGRAFIA VIVA — a informação também é energia ==========
     A tipografia NÃO é um sistema paralelo: é a extensão do AI Core no texto.
     Nada aqui tem rAF, timeline mestre ou estado próprio — tudo é DERIVADO de
     EnergyField (res/sing/E/core/quality) e publicado como CSS Variables que a
     folha de estilo consome. Três primitivas:

       1. HIERARQUIA — 6 grupos, cada um um elo PRÓPRIO dentro da banda
          tipográfica da cadeia (partículas .40 → [.50 … .68] → cards .70).
          Autoridade visual = autoridade energética: o hero é o maior condutor,
          o corpo de texto quase não conduz, e os indicadores técnicos falam
          como o sistema operacional do núcleo. Como cada grupo tem posição
          diferente na cadeia, o Pulso os atravessa em momentos diferentes —
          nunca sincronizados.
       2. CARACTERE — os títulos são decompostos em glifos (--ci/--cn/--cj). A
          palavra continua UM organismo: a divisão só existe para permitir
          física por caractere (propagação, materialização, respiração).
       3. ESTADO — máquina explícita e nomeada:
          idle → perceiving → charging → active → resonating → overload →
          singularity → cooling → idle. Publicada em body[data-type-state] e em
          EnergyField.type. Os STATUS DINÂMICOS a NARRAM, reescrevendo-se pelo
          mesmo glitch do Singular (txtMorph) — jamais uma troca seca.

     GSAP entra só como maestro do envelope de materialização: UMA timeline
     paused, seek()ada pelo loop único — motor de interpolação, nunca 2º loop.
     Zero reflow por frame: os retângulos são cacheados e só remedidos em
     scroll/resize (mesmo idioma do livingType). */
  (function livingTypography() {
    var root = document.documentElement;

    var TIERS = [
      /* pos = elo na cadeia · gain = autoridade · split = vira caractere       */
      { k: 'hero',  pos: 0.500, gain: 1.00, split: true,  range: 300, fall: 0.030,
        sel: '.hero__title' },
      { k: 'title', pos: 0.545, gain: 0.84, split: true,  range: 250, fall: 0.034,
        sel: '.section h2, .cta-panel h2' },
      { k: 'lead',  pos: 0.578, gain: 0.58, split: false, range: 210, fall: 0.042,
        sel: '.hero__sub, .section__lead' },
      { k: 'body',  pos: 0.612, gain: 0.34, split: false, range: 165, fall: 0.052,
        sel: '.pain p, .service p, .step p, .qa p' },
      { k: 'label', pos: 0.645, gain: 0.52, split: false, range: 175, fall: 0.046,
        sel: '.kicker, .scroll-hint__label, .mock__label' },
      { k: 'sys',   pos: 0.680, gain: 0.74, split: false, range: 185, fall: 0.028,
        sel: '.hero__status, .bus__label, .medidor__line, .medidor__note' }
    ];

    /* o que NUNCA é decomposto: as palavras aurora (.grad têm gradiente e ecos
       de glitch próprios, e background-clip morre se picotado), os textos que se
       reescrevem (§3e sobrescreve textContent — apagaria os glifos), o texto
       só-leitor-de-tela e as camadas de canvas/svg do livingType. */
    var NOSPLIT = '.grad, [data-sing-text], .sr-only, canvas, svg';

    /* ---- decomposição: palavra = organismo (inline-block, nunca quebra no
       meio), caractere = unidade física. --ci/--cn dão a POSIÇÃO do glifo na
       frase (propagação) e --cj um jitter estável por caractere (a velocidade
       varia de leve — nunca vira loop mecânico). */
    function splitChars(el) {
      var label = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      var chars = [];
      (function walk(node) {
        var next;
        for (var c = node.firstChild; c; c = next) {
          next = c.nextSibling;
          if (c.nodeType === 3) {
            if (!/\S/.test(c.nodeValue)) continue;
            var frag = document.createDocumentFragment();
            var parts = c.nodeValue.split(/(\s+)/);
            for (var i = 0; i < parts.length; i++) {
              var s = parts[i];
              if (!s) continue;
              if (!/\S/.test(s)) { frag.appendChild(document.createTextNode(s)); continue; }
              var w = document.createElement('span');
              w.className = 'ty-w';
              w.setAttribute('aria-hidden', 'true');
              for (var j = 0; j < s.length; j++) {
                var ch = document.createElement('span');
                ch.className = 'ty-c';
                ch.textContent = s.charAt(j);
                w.appendChild(ch);
                chars.push(ch);
              }
              frag.appendChild(w);
            }
            node.replaceChild(frag, c);
          } else if (c.nodeType === 1 && !c.matches(NOSPLIT)) {
            walk(c);
          }
        }
      })(el);
      if (!chars.length) return 0;
      /* o leitor de tela recebe a frase inteira e estável; os glifos somem da
         árvore de acessibilidade (senão seriam soletrados). */
      if (label) el.setAttribute('aria-label', label);
      for (var n = 0; n < chars.length; n++) {
        var jit = (Math.sin((n + 1) * 12.9898) * 43758.5453);
        jit = jit - Math.floor(jit);
        chars[n].style.setProperty('--ci', n);
        chars[n].style.setProperty('--cj', jit.toFixed(3));
      }
      el.style.setProperty('--cn', chars.length);
      /* parte do nada: o título se MATERIALIZA ao entrar em cena. Se o JS não
         chegar a escrever (reduced-motion, falha), o padrão do CSS é 1 — o
         texto nasce visível e legível. */
      el.style.setProperty('--tmat', '0');
      el.classList.add('ty-split');
      return chars.length;
    }

    /* ---- coleta */
    var items = [], anySplit = false;
    TIERS.forEach(function (t) {
      t.els = [];
      [].forEach.call(document.querySelectorAll(t.sel), function (el) {
        /* vis nasce TRUE de propósito: se o IntersectionObserver atrasar ou não
           existir, o campo de percepção continua vivo — o observador só REFINA
           o que já funciona, nunca é pré-requisito. */
        var it = { el: el, t: t, prox: 0, mat: t.split ? 0 : 1, matOn: !t.split,
          vis: true, x: 0, y: 0, w: 1, h: 1, v: {} };
        if (t.split && !reduced && splitChars(el)) { anySplit = true; it.mat = 0; }
        else { it.mat = 1; it.matOn = true; }
        t.els.push(it); items.push(it);
      });
    });
    if (!items.length) return;

    /* ---- MATERIALIZAÇÃO (maestro GSAP): UMA timeline normalizada 0..1,
       reaproveitada por todos os elementos via seek(). Três curvas distintas —
       o glifo EMERGE (rise), RECEBE ENERGIA (chg) e ESTABILIZA (set). O
       escalonamento entre caracteres vizinhos é feito no CSS por --ci, então a
       palavra se materializa como um corpo só, não como letras em fila. */
    var MAT = { rise: 0, chg: 0, set: 0 }, matTL = null, matDur = 1;
    if (hasGsap) {
      matTL = GSAP.timeline({ paused: true });
      matTL.to(MAT, { keyframes: [
        { rise: 1, duration: 0.60, ease: 'power3.out' }
      ] }, 0);
      matTL.to(MAT, { keyframes: [
        { chg: 1, duration: 0.30, ease: 'power2.out' },
        { chg: 0.16, duration: 0.62, ease: 'power2.inOut' }
      ] }, 0.12);
      matTL.to(MAT, { keyframes: [
        { set: 1, duration: 0.46, ease: 'power2.inOut' }
      ] }, 0.54);
      matDur = matTL.duration();
    }
    var MAT_MS = 980;

    /* ---- medição sem reflow por frame */
    var dirty = true;
    function remeasure() {
      for (var i = 0; i < items.length; i++) {
        var b = items[i].el.getBoundingClientRect();
        items[i].x = b.left; items[i].y = b.top;
        items[i].w = b.width || 1; items[i].h = b.height || 1;
        /* o que já está em cena materializa sem esperar o observador */
        if (!items[i].matOn && b.top < innerHeight + 10 && b.bottom > -10) items[i].matOn = true;
      }
      dirty = false;
    }
    window.addEventListener('scroll', function () { dirty = true; }, { passive: true });
    window.addEventListener('resize', debounce(function () { dirty = true; }, 180));

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].el !== en.target) continue;
            items[i].vis = en.isIntersecting;
            if (en.isIntersecting) items[i].matOn = true;   /* materializa ao entrar */
          }
        });
      }, { rootMargin: '10px' });
      items.forEach(function (it) { io.observe(it.el); });
    } else {
      items.forEach(function (it) { it.vis = true; it.matOn = true; });
    }

    /* ---- publicação de variáveis (gated: só escreve o que mudou) */
    var rootV = {};
    /* PERF — DEGRAUS. Estas variáveis vivem no :root e alimentam a cadeia de
       calc() dos 205 glifos: cada escrita recalcula o estilo de todos eles.
       Com toFixed(3) praticamente todo frame escrevia, e era isso que fazia o
       FPS cair durante o Pulso. Quantizando em 1/50, a energia continua fluida
       a olho nu e o recálculo acontece uma fração das vezes. */
    var TY_STEP = 50;
    function setRoot(n, val) {
      var s = (Math.round(val * TY_STEP) / TY_STEP).toFixed(2);
      if (rootV[n] === s) return;
      rootV[n] = s; root.style.setProperty(n, s);
    }
    /* por elemento o custo é local (um elemento, não 205), mas --tcx e --tprox
       também entram na conta de cada glifo do título — mesmo tratamento */
    function setEl(it, n, val) {
      var s = (Math.round(val * TY_STEP) / TY_STEP).toFixed(2);
      if (it.v[n] === s) return;
      it.v[n] = s; it.el.style.setProperty(n, s);
    }
    function cl01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    /* ---- MÁQUINA DE ESTADOS (explícita e nomeada) */
    var state = 'idle', stateSince = 0, coolUntil = 0, wasSing = false, wasRes = false;
    EnergyField.type = { state: 'idle', load: 0, prox: 0, since: 0 };

    /* ---- STATUS DINÂMICOS: o texto técnico NARRA a máquina de estados e se
       reescreve pelo glitch (nunca troca seca). É a voz do sistema operacional
       do AI Core. */
    var LABELS = {
      idle:        'Sistema online · beyon.0',
      perceiving:  'Presença detectada',
      charging:    'Acumulando energia',
      active:      'Canal aberto',
      resonating:  'Ressonância em curso',
      overload:    'Sobrecarga controlada',
      singularity: 'AI Core no comando',
      cooling:     'Estabilizando sistema'
    };
    var stEl = document.querySelector('.hero__status-txt');
    var stFrom = LABELS.idle, stTo = LABELS.idle, stP = 1, stShown = null;
    var ST_MS = 780;
    function stApply(str) {
      if (!stEl || str === stShown) return;
      stShown = str; stEl.textContent = str;
    }
    function stDrive(dt) {
      if (!stEl) return;
      if (stP >= 1) {
        if (stShown !== stTo) stApply(stTo);
        if (stEl.classList.contains('sys-rewriting')) stEl.classList.remove('sys-rewriting');
        return;
      }
      stP = Math.min(1, stP + dt / ST_MS);
      if (reduced) { stP = 1; stApply(stTo); return; }
      stEl.classList.add('sys-rewriting');
      stApply(stP >= 1 ? stTo : txtMorph(stFrom, stTo, stP));
    }

    var last = 0, ticked = false, t0 = 0, bootGate = false;
    function tick(now) {
      if (document.hidden) return;
      ticked = true;
      if (!t0) t0 = now;
      /* a materialização espera a intro sair: senão o título se materializaria
         ATRÁS do vídeo e o usuário só veria o resultado. O prazo é a rede de
         segurança — se `booted` nunca chegar, o texto materializa mesmo assim. */
      if (!bootGate) bootGate = document.body.classList.contains('booted') || (now - t0) > 9000;
      var dt = last ? Math.min(60, now - last) : 16; last = now;
      if (dirty) remeasure();

      var R = EnergyField.res, S = EnergyField.sing, C = EnergyField.core;
      var qual = EnergyField.quality;
      /* OVERLOAD: ressonâncias sucessivas acumulam atividade (o mesmo contador
         que rege a escada do Singular) — cresce gradual, nunca estoura. */
      var load = Math.min(1, resDoneCount / 3);

      /* --- percepção por elemento: campo de influência (não espera o hover),
         com MEMÓRIA ENERGÉTICA — acende rápido, esfria devagar, como material
         que acabou de conduzir. Gated pela rede de FPS: em qualidade baixa
         reduzo a QUANTIDADE de elementos observados, nunca a presença. */
      var maxProx = 0, probe = (qual >= 0.5) ? items.length : (qual >= 0.4 ? 12 : 4);
      for (var i = 0; i < items.length; i++) {
        var it = items[i], t = it.t, target = 0;
        if (it.vis && pointerActive && pointerFine && i < probe && fpsEMA > 32) {
          var nx = Math.max(it.x, Math.min(px, it.x + it.w));
          var ny = Math.max(it.y, Math.min(py, it.y + it.h));
          var d = Math.hypot(px - nx, py - ny);
          target = d < t.range ? 1 - d / t.range : 0;
        }
        it.prox += (target - it.prox) * (target > it.prox ? 0.16 : t.fall);
        if (it.prox < 0.002) it.prox = 0;
        if (it.prox > maxProx) maxProx = it.prox;

        /* materialização: só os títulos decompostos; anda no loop único */
        if (it.mat < 1 && it.matOn && bootGate) {
          it.mat = Math.min(1, it.mat + dt / MAT_MS);
          if (matTL) {
            matTL.seek(cl01(it.mat) * matDur);
            setEl(it, '--tmat', MAT.rise);
            setEl(it, '--tchg', MAT.chg);
            setEl(it, '--tset', MAT.set);
          } else {
            setEl(it, '--tmat', it.mat); setEl(it, '--tchg', 0); setEl(it, '--tset', it.mat);
          }
        }
        if (!it.vis) continue;
        /* compara com o formato que setEl grava (quantizado, 2 casas) — com a
           string errada aqui a condição seria sempre verdadeira e o gate
           deixaria de existir */
        if (it.prox > 0 || (it.v['--tprox'] !== undefined && it.v['--tprox'] !== '0.00')) {
          setEl(it, '--tprox', it.prox);
          /* posição do cursor DENTRO do elemento: é o que faz a energia nascer
             onde o cursor está e propagar aos vizinhos (o CSS mede a distância
             de cada glifo até aqui). */
          if (it.prox > 0) setEl(it, '--tcx', cl01((px - it.x) / it.w));
        }
      }

      /* --- estado (prioridade: o mais raro vence) */
      if (wasSing && !S.active) coolUntil = now + 2600;
      if (wasRes && !R.active && !S.active) coolUntil = Math.max(coolUntil, now + 900);
      wasSing = S.active; wasRes = R.active;
      var next;
      if (S.active) next = 'singularity';
      else if (now < coolUntil) next = 'cooling';
      else if (R.active) next = (load >= 0.66 ? 'overload' : 'resonating');
      else if (maxProx > 0.42) next = 'active';
      else if (resCharge > 0.58 || EnergyField.E > 0.62) next = 'charging';
      else if (maxProx > 0.05) next = 'perceiving';
      else next = 'idle';
      if (next !== state) {
        state = next; stateSince = now;
        document.body.setAttribute('data-type-state', state);
        EnergyField.type.state = state; EnergyField.type.since = now;
        if (LABELS[state] && stEl) {          /* o sistema anuncia o próprio estado */
          stFrom = stShown || stFrom; stTo = LABELS[state]; stP = 0;
        }
      }
      EnergyField.type.load = load; EnergyField.type.prox = maxProx;
      stDrive(dt);

      /* --- energia por GRUPO: a onda chega em cada elo no seu tempo, ponderada
         pelo arquétipo (wType) e pela autoridade do grupo. Em repouso nada fica
         morto: uma base mínima respira com o núcleo. */
      var wType = R.w ? R.w.wType : 1;
      var sgE = S.active ? S.amp * (0.55 + S.grip * 0.45) : 0;
      var breath = (C.breath - 0.5) * 0.06 * (C.pres || 0);
      for (var k = 0; k < TIERS.length; k++) {
        var tr = TIERS[k];
        var wave = EnergyField.stageExc(tr.pos) * wType;
        var base = 0.06 + EnergyField.E * 0.15 + breath;
        var e = (base + wave * 1.10 + sgE) * tr.gain * (1 + load * 0.30);
        setRoot('--ty-' + tr.k, cl01(e));
      }
      /* frente LOCAL dos títulos: quando a frente da cadeia atravessa a banda
         tipográfica, um front varre os caracteres 0→1 — a energia PERCORRE a
         palavra em vez de acendê-la inteira. */
      var fr = R.active ? R.front : (S.active ? S.front : -1);
      setRoot('--ty-front', fr < 0 ? -1 : cl01((fr - 0.42) / 0.20));
      setRoot('--ty-fw', R.active ? R.amp : (S.active ? S.amp * 0.7 : 0));
      setRoot('--ty-load', load);
      setRoot('--ty-sing', S.active ? S.amp : 0);
      setRoot('--ty-q', qual);
    }

    if (anySplit) document.documentElement.classList.add('ty-on');
    document.body.setAttribute('data-type-state', 'idle');
    EnergyField.add(tick, 'livingTypography');

    /* REDE DE SEGURANÇA: a materialização parte de --tmat 0 (opacidade ~0). Se o
       loop não chegar a rodar — aba aberta em segundo plano, rAF congelado, ou
       qualquer falha a montante — o título ficaria ilegível. Este timer roda
       mesmo com a aba oculta: passou o prazo sem um único tick, o texto assume o
       estado final e a legibilidade nunca depende da animação. */
    setTimeout(function () {
      if (ticked) return;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.mat >= 1) continue;
        it.mat = 1;
        setEl(it, '--tmat', 1); setEl(it, '--tchg', 0); setEl(it, '--tset', 1);
      }
    }, 2600);
  })();

  (function livingType() {
    /* Antes era DESKTOP-ONLY (saía em `!pointerFine` / `pointer: coarse`) — por
       isso "os efeitos atrás das palavras" não apareciam no celular. Agora roda em
       touch também: sem cursor, a parte de proximidade fica em 0, mas a onda de
       RESSONÂNCIA/SINGULAR acende os glifos igual (é dirigida por energia, não por
       ponteiro). Só reduced-motion ainda desliga. */
    if (reduced) return;

    var TARGETS = document.querySelectorAll('.hero__title, .section h2, .cta-panel h2');
    if (!TARGETS.length) return;

    var dpr = Math.min(devicePixelRatio || 1, 1.5);
    var CO = PALETTE.core;    /* corrente — branco-ciano */
    var HIc = PALETTE.hi;     /* faíscas */
    var MAXPART = 46;

    var items = [];
    TARGETS.forEach(function (el) {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      var cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:2;mix-blend-mode:screen';
      el.appendChild(cv);
      items.push({ el: el, cv: cv, ctx: cv.getContext('2d'),
        pts: [], parts: [], act: 0, vis: true, cx: 0, cy: 0, vw: 0, vh: 0, w: 0, h: 0 });
    });

    function sample(it) {
      var el = it.el, w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) { it.pts = []; return; }
      it.w = w; it.h = h;
      it.cv.width = Math.round(w * dpr); it.cv.height = Math.round(h * dpr);
      var o = document.createElement('canvas');
      o.width = it.cv.width; o.height = it.cv.height;
      var oc = o.getContext('2d');
      oc.scale(dpr, dpr);
      var cs = getComputedStyle(el);
      oc.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      try { oc.letterSpacing = cs.letterSpacing; } catch (e) {}
      oc.fillStyle = '#fff';
      oc.textBaseline = 'middle';
      oc.textAlign = 'left';   /* renderizo palavra a palavra na posição REAL */
      var lh = parseFloat(cs.lineHeight); if (!lh || isNaN(lh)) lh = parseFloat(cs.fontSize) * 1.15;
      /* POSIÇÕES REAIS, não reconstrução de layout. Toda tentativa de reproduzir
         a quebra do browser (split por \n, ou reembrulho guloso por measureText)
         diverge do que a tela faz — e `text-wrap: balance` nos títulos rebalanceia
         as linhas de um jeito que nenhum wrapper guloso acerta. Então em vez de
         adivinhar, LEIO: um Range por palavra dá o retângulo exato de cada uma
         (já com balance, centralização, letter-spacing e wrap reais), e desenho
         a palavra ali. O mapa de pontos passa a bater com o glifo em qualquer
         largura e qualquer regra de quebra. */
      var rootRect = el.getBoundingClientRect();
      (function walk(node) {
        for (var c = node.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) {
            var txt = c.nodeValue, re = /\S+/g, m;
            while ((m = re.exec(txt))) {
              var rng = document.createRange();
              rng.setStart(c, m.index); rng.setEnd(c, m.index + m[0].length);
              var rs = rng.getClientRects();
              for (var ri = 0; ri < rs.length; ri++) {
                var b = rs[ri];
                if (b.width < 0.5) continue;
                oc.fillText(m[0], b.left - rootRect.left, (b.top - rootRect.top) + b.height / 2);
              }
            }
          } else if (c.nodeType === 1 && c.nodeName !== 'CANVAS') {
            walk(c);
          }
        }
      })(el);
      if (!o.width || !o.height) { it.pts = []; return; }
      var img = oc.getImageData(0, 0, o.width, o.height).data;
      var pts = [], step = Math.max(3, Math.round(3 * dpr));
      for (var yy = 0; yy < o.height; yy += step) {
        for (var xx = 0; xx < o.width; xx += step) {
          if (img[(yy * o.width + xx) * 4 + 3] > 130) {
            pts.push({ x: xx / dpr, y: yy / dpr, ph: xx / o.width });
          }
        }
      }
      var MAXP = 460;
      if (pts.length > MAXP) {
        var out = [], stepP = pts.length / MAXP;
        for (var k = 0; k < MAXP; k++) out.push(pts[Math.floor(k * stepP)]);
        pts = out;
      }
      it.pts = pts;
    }
    function sampleAll() { for (var i = 0; i < items.length; i++) sample(items[i]); }

    var dirty = true;
    function remeasure() {
      for (var i = 0; i < items.length; i++) {
        var b = items[i].el.getBoundingClientRect();
        items[i].cx = b.left; items[i].cy = b.top; items[i].vw = b.width; items[i].vh = b.height;
      }
      dirty = false;
    }
    window.addEventListener('scroll', function () { dirty = true; }, { passive: true });
    window.addEventListener('resize', debounce(function () { sampleAll(); dirty = true; }, 200));

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          for (var i = 0; i < items.length; i++) if (items[i].el === en.target) items[i].vis = en.isIntersecting;
        });
      }, { rootMargin: '40px' });
      items.forEach(function (it) { io.observe(it.el); });
    }

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sampleAll);
    else sampleAll();
    window.addEventListener('load', sampleAll);

    function reset(it) { it.ctx.setTransform(1, 0, 0, 1, 0, 0); it.ctx.clearRect(0, 0, it.cv.width, it.cv.height); }

    function render(it) {
      var ctx = it.ctx, a = it.act;
      reset(it);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      var lx = px - it.cx, ly = py - it.cy;
      var prog = (EnergyField.t % 150) / 150;
      var pts = it.pts, k, p;
      for (k = 0; k < pts.length; k++) {
        p = pts[k];
        var dw = Math.abs(p.ph - prog); if (dw > 0.5) dw = 1 - dw;
        var wave = dw < 0.14 ? (1 - dw / 0.14) : 0;
        var pd = Math.hypot(p.x - lx, p.y - ly);
        var prox = pd < 120 ? (1 - pd / 120) : 0;
        var b = a * (0.09 + wave * 0.7 + prox * 0.5);
        if (b < 0.02) continue;
        ctx.fillStyle = 'rgba(' + CO + ',' + Math.min(1, b).toFixed(3) + ')';
        ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.7, 1.7);
      }
      /* faíscas escapam dos glifos perto do cursor e retornam à origem */
      if (it.parts.length < MAXPART && a > 0.3 && fpsEMA > 48) {
        for (var s = 0; s < 2; s++) {
          p = pts[(Math.random() * pts.length) | 0];
          if (p && Math.hypot(p.x - lx, p.y - ly) < 100 && Math.random() < 0.5) {
            var ang = Math.random() * 6.283;
            it.parts.push({ ox: p.x, oy: p.y, x: p.x, y: p.y,
              vx: Math.cos(ang) * (0.4 + Math.random() * 0.9),
              vy: Math.sin(ang) * (0.4 + Math.random() * 0.9) - 0.3, life: 1 });
          }
        }
      }
      for (var j = it.parts.length - 1; j >= 0; j--) {
        var q = it.parts[j];
        q.life -= 0.02;
        if (q.life <= 0) { it.parts.splice(j, 1); continue; }
        q.vx += (q.ox - q.x) * 0.02 * (1 - q.life);   /* retorno cresce ao fim da vida */
        q.vy += (q.oy - q.y) * 0.02 * (1 - q.life);
        q.vx *= 0.94; q.vy *= 0.94;
        q.x += q.vx; q.y += q.vy;
        var pb = a * q.life;
        ctx.fillStyle = 'rgba(' + HIc + ',' + (pb * 0.9).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(q.x, q.y, 0.8 + q.life * 0.8, 0, 6.283); ctx.fill();
      }
    }

    function tick() {
      if (document.hidden) return;
      if (dirty) remeasure();
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.pts.length) continue;
        var target = 0;
        if (it.vis && pointerActive && fpsEMA > 34) {
          var nx = Math.max(it.cx, Math.min(px, it.cx + it.vw));
          var ny = Math.max(it.cy, Math.min(py, it.cy + it.vh));
          var d = Math.hypot(px - nx, py - ny), RANGE = 240;
          target = d < RANGE ? (1 - d / RANGE) : 0;
        }
        /* ressonância passa pela TIPOGRAFIA (elo 0.55): títulos visíveis acendem
           no ritmo da onda mesmo sem cursor */
        if (it.vis && fpsEMA > 34) {
          var _tw = EnergyField.res.w;
          var wv = EnergyField.stageExc(0.55) * (_tw ? _tw.wType : 1);
          if (wv > 0.02) target = Math.max(target, Math.min(1, wv * 1.15));
        }
        /* SINGULAR: a energia passa pelo INTERIOR das letras, sem cursor */
        var _sg = EnergyField.sing;
        if (it.vis && _sg.active) target = Math.max(target, Math.min(1, _sg.amp * (0.5 + _sg.grip * 0.5)));
        it.act += (target - it.act) * (target > it.act ? 0.12 : 0.05);   /* acende rápido, apaga devagar */
        if (it.act < 0.003 && target === 0) {
          if (it.act !== 0 || it.parts.length) { it.act = 0; it.parts.length = 0; reset(it); }
          continue;
        }
        render(it);
      }
    }

    EnergyField.add(tick, 'livingType');
  })();

  /* ========== 3e. REESCRITA DO SISTEMA — texto que muda no Singular ==========
     Certos textos trocam de conteúdo quando o universo vira dourado. A troca NÃO
     é instantânea: o texto perde estabilidade e se REESCREVE caractere a
     caractere pelo próprio glitch — "reescrita do sistema", não falha visual.
     Rápido e ancorado no onset do Singular; reversível ao voltar ao ciano.
     Genérico: qualquer [data-sing-text] entra (e os futuros). Nas palavras .grad
     o data-text é reescrito junto, então os ecos RGB acompanham a reescrita.
     Sem rAF próprio — anda no loop único, como todo o resto. */
  (function singText() {
    var els = [].slice.call(document.querySelectorAll('[data-sing-text]'));
    if (!els.length) return;
    var ZW = /​/g;                          /* o ZWSP dos vãos vazios conta como "" */
    var items = els.map(function (el) {
      var calm = (el.textContent || '').replace(ZW, '');
      return {
        el: el, calm: calm, sing: el.getAttribute('data-sing-text') || calm,
        isGrad: el.classList.contains('grad'), prog: 0, shown: null
      };
    });
    var DUR = 1300, last = 0;   /* mais lento e dramático — a reescrita tem que ser sentida */

    /* calm em prog=0, sing em prog=1; no meio, glifos — via txtMorph(), o motor
       de reescrita compartilhado com os STATUS DINÂMICOS (§3g). */
    function apply(it, str) {
      if (str === it.shown) return;
      it.shown = str;
      it.el.textContent = str;
      it.el.setAttribute('data-text', str);   /* ecos RGB (grad) e glitch da reescrita (.sys-rewriting) acompanham */
    }

    function tick(now) {
      if (document.hidden) return;
      var dt = last ? Math.min(60, now - last) : 16; last = now;
      var S = EnergyField.sing;
      var want = (S && S.active) ? 1 : 0;
      if (reduced) {                               /* sem animação: troca seca */
        for (var j = 0; j < items.length; j++) {
          var itr = items[j], tgt = want ? itr.sing : itr.calm;
          if (itr.shown !== tgt) apply(itr, tgt);
        }
        return;
      }
      var stepP = dt / DUR;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var np = it.prog + (want ? stepP : -stepP);
        if (np < 0) np = 0; else if (np > 1) np = 1;
        /* enquanto reescreve, o trecho ganha o RGB-split temporário (só quem não
           é .grad — as palavras aurora já glitcham por conta própria). Vale nas
           duas direções, ciano↔dourado. */
        if (!it.isGrad) it.el.classList.toggle('sys-rewriting', np > 0.002 && np < 0.998);
        if (np === it.prog && (np === 0 || np === 1)) {   /* assentado */
          var s = np === 1 ? it.sing : it.calm;
          if (it.shown !== s) apply(it, s);
          continue;
        }
        it.prog = np;
        if (np === 0) apply(it, it.calm);
        else if (np === 1) apply(it, it.sing);
        else apply(it, txtMorph(it.calm, it.sing, np));
      }
    }
    EnergyField.add(tick, 'singText');
  })();

  /* ========== 3f. AI CORE — o reator do hero ==========
     Reconstrução do reator de referência (esfera de vidro, anel equatorial,
     brackets, base/emissor, órbitas com nós, plasma-átomo, partículas). NÃO é um
     estado paralelo: lê EnergyField.core (o mesmo cérebro — breath/pow/star/
     strain/pres) + E + sing + quality + cursor. Um canvas próprio no lugar do
     emblema; sem rAF próprio (anda no loop único); degrada com a rede de FPS. */
  (function heroReactor() {
    var cv = document.querySelector('.hero__reactor');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(devicePixelRatio || 1, 1.75);
    var TAU = 6.28318530718;
    /* PALETTE só expõe glow/hi/core/gold; o teal do campo e o preto dos brackets
       vêm direto dos tokens (estáticos — no Singular o MID é trocado por plasma). */
    var _cs = getComputedStyle(document.documentElement);
    function _trip(name, fb) { var v = (_cs.getPropertyValue(name) || '').trim(); return v ? v.split(/[\s,]+/).slice(0, 3).join(',') : fb; }
    var MIDBASE = _trip('--mid-rgb', '15,106,115');
    var S = 0, CX = 0, CY = 0, Rs = 0, vis = true, T = 0, last = 0, dirty = true;
    var docCX = 0, docCY = 0;                 /* centro em coords de documento (sem reflow/frame) */

    var orbits = [], parts = [], brackets = [];
    function build() {
      orbits = [
        { rx: 1.62, ry: 0.40, rot: -0.30, sp: 0.00019, nodes: [Math.random(), Math.random()], seed: 0.7 },
        { rx: 1.44, ry: 0.96, rot: 1.15, sp: -0.00013, nodes: [Math.random()], seed: 2.3 },
        { rx: 1.50, ry: 0.62, rot: 0.52, sp: 0.00010, nodes: [Math.random(), Math.random()], seed: 4.1 }
      ];
      parts = [];
      for (var p = 0; p < 24; p++) {
        parts.push({ a: Math.random() * TAU, r: 0.34 + Math.random() * 1.12,
          sp: (0.00015 + Math.random() * 0.0003) * (p % 2 ? 1 : -1),
          tilt: Math.random() * 0.6 - 0.3, sz: 0.6 + Math.random() * 1.0, seed: Math.random() * 9 });
      }
      /* housing: 4 segmentos de arco (dark glossy + fio ciano interno) */
      brackets = [{ a0: -2.62, a1: -1.96 }, { a0: -1.18, a1: -0.52 },
                  { a0: 0.40, a1: 1.06 }, { a0: 1.98, a1: 2.66 }];
    }
    build();

    function measure() {
      var w = cv.clientWidth || 220;
      S = Math.round(w);
      var px2 = Math.round(S * dpr);
      if (cv.width !== px2) { cv.width = px2; cv.height = px2; }
      CX = S * 0.5; CY = S * 0.5; Rs = S * 0.278;
      var r = cv.getBoundingClientRect();
      docCX = r.left + r.width / 2 + (window.pageXOffset || 0);
      docCY = r.top + r.height / 2 + (window.pageYOffset || 0);
      dirty = false;
    }
    window.addEventListener('resize', debounce(function () { dirty = true; }, 180));
    window.addEventListener('scroll', function () { dirty = true; }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        vis = e[0].isIntersecting;
        coreAnchor.on = vis;   /* fora do hero, o campo volta ao centro da viewport */
      }, { rootMargin: '80px' }).observe(cv);
    }

    function bloom(x, y, r, rgb, a) {
      if (a < 0.004 || r <= 0) return;
      /* A MOLDURA QUADRADA que aparecia no dourado era isto: o halo (item 1) e o
         bloom da estrela (item 9) tinham raio MAIOR que a metade do canvas (até
         ~0.73S contra 0.5S de meia-caixa). ctx.arc desenha um círculo; quando o
         raio passa da borda do canvas, o corte acontece com o alfa do gradiente
         AINDA MAIOR QUE ZERO ali — e como o canvas é quadrado, esse corte lê como
         uma moldura reta. Grampo único aqui resolve pra TODAS as camadas de uma
         vez: nenhum bloom passa de 47% do lado do canvas, deixando ~3% de folga
         onde o gradiente já chegou a alfa 0 — o brilho sempre se apaga ANTES da
         borda, então ele se dissolve no fundo do hero como o resto do site, sem
         nunca "bater na caixa". */
      r = Math.min(r, S * 0.47);
      /* PERF: sprite em cache no lugar de um gradiente por chamada. Isto aqui
         roda dentro de laço aninhado (um bloom por nó de cada órbita), então
         era dezenas de rasterizações por frame só no reator. O grampo de raio
         acima continua valendo — é ele que impede a moldura quadrada. */
      drawHalo(ctx, x, y, r, rgb, a);
    }

    function tick(now) {
      if (document.hidden) return;
      if (dirty) measure();
      if (!vis || !S) return;
      var dt = last ? Math.min(50, now - last) : 16; last = now;
      var mdt = reduced ? 0 : dt;
      T += mdt;

      var C = EnergyField.core, Sg = EnergyField.sing, E = EnergyField.E, qual = EnergyField.quality;
      var singOn = Sg.active, lite = qual < 0.6;
      var breath = C ? C.breath : 0.5, pow = C ? Math.min(1.5, C.pow) : 0.4,
          star = C ? C.star : 0, strain = C ? C.strain : 0,
          pres = C ? Math.max(0.5, C.pres) : 0.7;
      /* ORIGEM DO PULSO: o estágio-núcleo da cadeia de ressonância (0.0) é o mais
         cedo de todos → o reator ACENDE primeiro e a onda parte dele, depois campo
         (.12), conexões (.25), partículas (.40)… É isto que faz do AI Core a fonte
         visível da propagação, não só um enfeite que reage. */
      var pulse = EnergyField.stageExc ? EnergyField.stageExc(0.0) : 0;

      /* ÂNCORA: entrega ao campo gravitacional (AICore) o centro do reator na
         viewport → as partículas do site inteiro passam a orbitar ESTE reator. */
      var ex = docCX - (window.pageXOffset || 0), ey = docCY - (window.pageYOffset || 0);
      coreAnchor.x = ex; coreAnchor.y = ey; coreAnchor.on = vis;

      /* percebe o cursor (não obedece): excita órbitas/partículas por proximidade */
      var excite = 0;
      if (typeof pointerActive !== 'undefined' && pointerActive) {
        excite = Math.max(0, 1 - Math.hypot((px || 0) - ex, (py || 0) - ey) / (S * 1.4));
      }

      /* ATENÇÃO (herdada do núcleo antigo): o plasma pende de leve pra onde o
         núcleo "olha" (st.attX/attY) — a entidade tem foco, não é simétrica. */
      var attX = C ? (C.attX || 0) : 0, attY = C ? (C.attY || 0) : 0;
      var leanX = attX * Rs * 0.05 * (0.6 + excite), leanY = attY * Rs * 0.05 * (0.6 + excite);

      var GLOW = singOn ? plasmaColor(Sg.warmth, 0) : PALETTE.glow;
      var HI = singOn ? plasmaColor(Sg.warmth, 1) : PALETTE.hi;
      var CORE = singOn ? plasmaColor(Sg.warmth, 2) : PALETTE.core;
      var MID = singOn ? plasmaColor(Sg.warmth, 0) : MIDBASE;

      var lum = (0.6 + pow * 0.5 + excite * 0.4 + pulse * 0.6) * (0.72 + pres * 0.42);
      /* o raio pulsa pra fora no disparo (a onda nascendo) e comprime no strain */
      var Rc = Rs * (1 + (breath - 0.5) * 0.05 + pulse * 0.06 - strain * 0.16);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'lighter';

      /* 1) HALO / campo gravitacional */
      bloom(CX, CY, Rs * 2.0 * (1 + breath * 0.08), MID, 0.05 * lum + star * 0.14);
      bloom(CX, CY, Rs * 1.35, GLOW, 0.05 * lum);

      /* 2) ÓRBITAS pontilhadas + nós (com oclusão frente/trás) */
      for (var o = 0; o < orbits.length; o++) {
        var ob = orbits[o], rx = Rs * ob.rx, ry = Rs * ob.ry, cr = Math.cos(ob.rot), sr = Math.sin(ob.rot);
        ctx.save();
        ctx.setLineDash([1.5, 6]); ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + GLOW + ',' + (0.10 * lum).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(CX, CY, rx, ry, ob.rot, 0, TAU); ctx.stroke();
        ctx.restore();
        for (var n = 0; n < ob.nodes.length; n++) {
          ob.nodes[n] += ob.sp * mdt * (1 + excite * 1.2 + pow * 0.5);
          if (ob.nodes[n] > 1) ob.nodes[n] -= 1; else if (ob.nodes[n] < 0) ob.nodes[n] += 1;
          var th = ob.nodes[n] * TAU, exx = Math.cos(th) * rx, eyy = Math.sin(th) * ry;
          var nx = CX + exx * cr - eyy * sr, ny = CY + exx * sr + eyy * cr;
          var da = Math.sin(th) > 0 ? 1 : 0.34, nr = (1.5 + pow * 1.3) * da;
          bloom(nx, ny, nr * 4, GLOW, 0.18 * lum * da);
          ctx.fillStyle = 'rgba(' + CORE + ',' + (0.9 * da).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fill();
        }
      }

      /* 3) BASE (pedestal) + feixe vertical ascendente */
      var baseY = CY + Rc * 1.04;
      for (var b = 0; b < 3; b++) {
        ctx.strokeStyle = 'rgba(' + GLOW + ',' + ((0.16 - b * 0.04) * lum).toFixed(3) + ')';
        ctx.lineWidth = 1.4 - b * 0.3;
        ctx.beginPath(); ctx.ellipse(CX, baseY + b * 3, Rc * (0.5 + b * 0.32), Rc * (0.5 + b * 0.32) * 0.22, 0, 0, TAU); ctx.stroke();
      }
      var bg = ctx.createLinearGradient(CX, baseY, CX, CY);
      bg.addColorStop(0, 'rgba(' + CORE + ',' + (0.22 * lum).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(' + GLOW + ',0)');
      ctx.strokeStyle = bg; ctx.lineWidth = 2 + pow * 1.6 + star * 3;
      ctx.beginPath(); ctx.moveTo(CX, baseY); ctx.lineTo(CX, CY - Rc * 0.2); ctx.stroke();

      /* 4) EMISSOR (topo) + feixe */
      var topY = CY - Rc * 1.04;
      for (var t2 = 0; t2 < 2; t2++) {
        ctx.strokeStyle = 'rgba(' + HI + ',' + ((0.11 - t2 * 0.03) * lum).toFixed(3) + ')';
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.ellipse(CX, topY - t2 * 3, Rc * (0.42 + t2 * 0.3), Rc * (0.42 + t2 * 0.3) * 0.2, 0, 0, TAU); ctx.stroke();
      }
      var tg = ctx.createLinearGradient(CX, topY - S * 0.14, CX, CY - Rc * 0.8);
      tg.addColorStop(0, 'rgba(' + CORE + ',0)');
      tg.addColorStop(1, 'rgba(' + HI + ',' + (0.14 * lum).toFixed(3) + ')');
      ctx.strokeStyle = tg; ctx.lineWidth = 1.6 + star * 2;
      ctx.beginPath(); ctx.moveTo(CX, topY - S * 0.14); ctx.lineTo(CX, CY - Rc * 0.4); ctx.stroke();

      /* 5) ESFERA de vidro: fresnel na borda + wireframe do globo + rim light */
      var sph = ctx.createRadialGradient(CX - Rc * 0.3, CY - Rc * 0.35, Rc * 0.1, CX, CY, Rc);
      sph.addColorStop(0, 'rgba(' + MID + ',' + (0.05 * lum).toFixed(3) + ')');
      sph.addColorStop(0.7, 'rgba(' + MID + ',0)');
      sph.addColorStop(0.93, 'rgba(' + GLOW + ',' + (0.16 * lum).toFixed(3) + ')');
      sph.addColorStop(1, 'rgba(' + GLOW + ',0)');
      ctx.fillStyle = sph; ctx.beginPath(); ctx.arc(CX, CY, Rc, 0, TAU); ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.arc(CX, CY, Rc * 0.98, 0, TAU); ctx.clip();
      ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(' + GLOW + ',' + (0.07 * lum).toFixed(3) + ')';
      for (var la = -2; la <= 2; la++) {
        var yy = la * Rc * 0.34, latr = Math.sqrt(Math.max(0, Rc * Rc - yy * yy));
        ctx.beginPath(); ctx.ellipse(CX, CY + yy, latr, latr * 0.26, 0, 0, TAU); ctx.stroke();
      }
      if (!lite) {
        var spin = T * 0.00012;
        for (var lo = 0; lo < 3; lo++) {
          ctx.beginPath(); ctx.ellipse(CX, CY, Rc * Math.abs(Math.cos(spin + lo * 1.047)), Rc, 0, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();

      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + CORE + ',' + (0.14 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(CX, CY, Rc * 0.99, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();

      /* 6) BRACKETS — housing luminoso (segmentos de arco). Antes tinham CORPO
         PRETO (source-over rgba(0,0,0,.55)) que, no dourado, ocluía o brilho atrás
         e virava "bordas pretas em volta do núcleo". Agora são só arestas de luz
         (aditivo, no mesmo 'lighter' de tudo) + tampas radiais nas pontas pra dar o
         aspecto de peça montada — leem como estrutura sem escurecer nada. */
      for (var k = 0; k < brackets.length; k++) {
        var bk = brackets[k];
        ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(' + GLOW + ',' + (0.42 * lum).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(CX, CY, Rc * 1.07, bk.a0, bk.a1); ctx.stroke();
        ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(' + CORE + ',' + (0.34 * lum).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(CX, CY, Rc * 1.0, bk.a0, bk.a1); ctx.stroke();
        for (var ecap = 0; ecap < 2; ecap++) {
          var ea = ecap ? bk.a1 : bk.a0;
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + HI + ',' + (0.3 * lum).toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(CX + Math.cos(ea) * Rc * 0.99, CY + Math.sin(ea) * Rc * 0.99);
          ctx.lineTo(CX + Math.cos(ea) * Rc * 1.14, CY + Math.sin(ea) * Rc * 1.14);
          ctx.stroke();
        }
      }

      /* 7) ANEL EQUATORIAL principal + anéis internos */
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(' + GLOW + ',' + (0.5 * lum + strain * 0.2 + star * 0.3).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(CX, CY, Rc * 1.14, Rc * 0.30, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + CORE + ',' + (0.30 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(CX, CY, Rc * 1.14, Rc * 0.30, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + HI + ',' + (0.18 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(CX, CY, Rc * 0.70, Rc * 0.19, 0, 0, TAU); ctx.stroke();

      /* 7b) LINHAS VETORIAIS — feixes radiais que partem do núcleo. Só aparecem
         quando há energia fluindo (pulso/estrela): é a onda saindo, não uma teia
         permanente. Poucas, alfa baixo, gradiente que some na ponta. */
      if (!lite && (pulse > 0.02 || star > 0.02)) {
        var vA = (pulse * 0.24 + star * 0.16) * lum;
        ctx.lineWidth = 1;
        for (var v = 0; v < 8; v++) {
          var vang = v / 8 * TAU + T * 0.00006;
          var c1 = Math.cos(vang), s1 = Math.sin(vang), r0 = Rc * 0.5, r1 = Rc * (1.05 + pulse * 0.6);
          var vgr = ctx.createLinearGradient(CX + c1 * r0, CY + s1 * r0, CX + c1 * r1, CY + s1 * r1);
          vgr.addColorStop(0, 'rgba(' + HI + ',' + vA.toFixed(3) + ')');
          vgr.addColorStop(1, 'rgba(' + GLOW + ',0)');
          ctx.strokeStyle = vgr;
          ctx.beginPath(); ctx.moveTo(CX + c1 * r0, CY + s1 * r0); ctx.lineTo(CX + c1 * r1, CY + s1 * r1); ctx.stroke();
        }
      }

      /* 8) PARTÍCULAS internas (poeira de energia) */
      var pStep = lite ? 2 : 1;
      for (var pi = 0; pi < parts.length; pi += pStep) {
        var pt = parts[pi];
        pt.a += pt.sp * mdt * (1 + excite * 1.5 + pow * 0.6);
        var pr2 = pt.r * (1 - strain * 0.4), prx = Rc * pr2, pry = Rc * pr2 * (0.4 + pt.tilt);
        var pa = (0.12 + pow * 0.4) * (Math.sin(pt.a + pt.seed) > 0 ? 1 : 0.4) * (0.6 + breath * 0.5);
        if (pa < 0.02) continue;
        ctx.fillStyle = 'rgba(' + HI + ',' + pa.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(CX + Math.cos(pt.a) * prx, CY + Math.sin(pt.a) * pry, pt.sz * (0.8 + pow * 0.5), 0, TAU); ctx.fill();
      }

      /* 9) NÚCLEO DE PLASMA — átomo (elétrons) + bloom + centro quente.
         Pende com a ATENÇÃO (leanX/leanY): o miolo tem foco, não é simétrico. */
      var pcx = CX + leanX, pcy = CY + leanY, atomR = Rc * 0.5; ctx.lineWidth = 1.3;
      for (var el = 0; el < 3; el++) {
        ctx.strokeStyle = 'rgba(' + HI + ',' + ((0.3 + pow * 0.3) * lum).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(pcx, pcy, atomR, atomR * 0.34, T * 0.00035 * (el % 2 ? -1 : 1) + el * 1.047, 0, TAU); ctx.stroke();
      }
      bloom(pcx, pcy, Rc * (0.7 + star * 1.6), GLOW, 0.14 * lum + star * 0.3);
      bloom(pcx, pcy, Rc * 0.34, CORE, 0.3 + pow * 0.3 + star * 0.4);
      /* SINGULARITY: no pico da estrela o núcleo satura em branco antes de virar
         plasma — o instante em que a energia converge e estoura. Só no evento. */
      if (star > 0.01) bloom(pcx, pcy, Rc * (1 + star * 1.8), CORE, star * 0.28);
      ctx.fillStyle = 'rgba(' + CORE + ',' + Math.min(1, 0.5 + pow * 0.4 + star * 0.4).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(pcx, pcy, 2 + pow * 2 + star * 6 * (0.9 + breath * 0.2), 0, TAU); ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
    }
    EnergyField.add(tick, 'heroReactor');
  })();

  /* ========== 4. O MEDIDOR ========== */
  (function medidor() {
  var mMain = document.getElementById('mMain');
  var mLed = document.getElementById('mLed');
  var mBtn = document.getElementById('medidor');
  var mPanel = document.getElementById('medidorPanel');
  var mRows = document.getElementById('mRows');
  /* a assinatura é opcional: sem o markup dela o resto do organismo segue vivo */
  if (!mMain || !mLed || !mBtn || !mPanel || !mRows) return;

  var metrics = { lcp: null, cls: null, kb: null };

  /* LCP só é confiável se a página nunca esteve em background antes dele
     (web-vitals descarta nesses casos — número falso é pior que ausente) */
  var loadWasHidden = document.hidden;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && performance.now() < 10000) loadWasHidden = true;
  });

  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        var last = entries[entries.length - 1];
        if (last) metrics.lcp = (last.renderTime || last.loadTime) / 1000;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) { /* campo some */ }

    try {
      metrics.cls = 0;
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (!entry.hadRecentInput) metrics.cls += entry.value;
        });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { metrics.cls = null; }
  }

  function measureWeight() {
    try {
      var total = 0;
      var nav0 = performance.getEntriesByType('navigation')[0];
      if (nav0) total += nav0.transferSize || 0;
      performance.getEntriesByType('resource').forEach(function (r) {
        total += r.transferSize || 0;
      });
      if (total > 0) metrics.kb = Math.round(total / 1024);
    } catch (e) { /* campo some */ }
  }

  var lastMain = '';
  function renderMedidor() {
    var lcpOk = metrics.lcp && !loadWasHidden && metrics.lcp < 30;
    var parts = [];
    if (lcpOk) parts.push('LCP ' + metrics.lcp.toFixed(2) + 's');
    if (metrics.kb) parts.push(metrics.kb + 'kB');
    parts.push(Math.round(fpsEMA) + 'fps');
    /* gated: com fps estável o rótulo não muda, e escrever o mesmo texto a cada
       500 ms invalidava o layout da barra à toa */
    var main = parts.join(' · ');
    if (main !== lastMain) { lastMain = main; mMain.textContent = main; }

    if (!mPanel.hidden) {
      var rows = [];
      if (lcpOk) rows.push(['LCP', metrics.lcp.toFixed(2) + ' s']);
      if (metrics.cls !== null) rows.push(['CLS', metrics.cls.toFixed(3)]);
      if (metrics.kb !== null) rows.push(['transferido', metrics.kb + ' kB']);
      rows.push(['quadros', Math.round(fpsEMA) + ' fps']);
      /* montado por nó, não por innerHTML: o painel deixa de ser um ponto de
         injeção de markup, hoje e depois de qualquer refatoração */
      var frag = document.createDocumentFragment();
      rows.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'row';
        var label = document.createElement('span');
        label.textContent = r[0];
        var value = document.createElement('b');
        value.textContent = r[1];
        row.appendChild(label);
        row.appendChild(value);
        frag.appendChild(row);
      });
      mRows.textContent = '';
      mRows.appendChild(frag);
    }
  }

  mLed.classList.add('measuring');
  window.addEventListener('load', function () {
    measureWeight();
    setTimeout(function () {
      measureWeight();
      mLed.classList.remove('measuring');
    }, 2600);
  });
  setInterval(function () { if (!document.hidden) renderMedidor(); }, 500);

  function setPanel(open) {
    if (mPanel.hidden !== open) return;      /* já está no estado pedido */
    mPanel.hidden = !open;
    mBtn.setAttribute('aria-expanded', String(open));
    renderMedidor();
  }
  mBtn.addEventListener('click', function () { setPanel(mPanel.hidden); });
  /* um painel que abre sobre o conteúdo tem de fechar no Escape — e o foco
     volta pro botão que o abriu */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || mPanel.hidden) return;
    setPanel(false);
    mBtn.focus();
  });
  })();
})();
