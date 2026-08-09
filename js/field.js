/* ==========================================================================
   CAMPO DE ENERGIA — o único canvas do site.

   Desenha, em ordem: campo de partículas, reator do hero e o brilho da
   tipografia. Tudo que se move continuamente vive aqui, porque desenhar a cena
   inteira custa ~1ms enquanto fazer o mesmo com elementos DOM reagindo por
   frame custava 76ms de recálculo de estilo.

   Nada aqui lê o DOM por frame: os retângulos dos títulos e do reator são
   medidos em scroll/resize e ficam em cache.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B || B.reduced) return;

  var cv = document.getElementById('fx');
  if (!cv) return;
  var ctx = cv.getContext('2d', { alpha: true });
  if (!ctx) return;

  var TAU = Math.PI * 2;
  var CIANO = '0,245,255', ALTA = '159,248,255', NUCLEO = '242,254,255', OURO = '255,201,107';

  /* mistura ciano→dourado conforme o Estado Singular. Uma função só, sem token
     de CSS envolvido: a cor do canvas nunca passa pela folha de estilo. */
  function cor(base, w) {
    if (w < 0.01) return base;
    var a = base.split(','), b = OURO.split(',');
    return Math.round(+a[0] + (+b[0] - +a[0]) * w) + ',' +
           Math.round(+a[1] + (+b[1] - +a[1]) * w) + ',' +
           Math.round(+a[2] + (+b[2] - +a[2]) * w);
  }

  var W = 0, H = 0, dpr = 1;
  var ps = [], nAlvo = 0;
  var reator = null, titulos = [];
  var sujo = true;

  function dimensionar() {
    var S = B.S;
    dpr = S.dpr;
    W = S.w; H = S.h;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* densidade por área, com teto: num monitor grande a conta não explode */
    nAlvo = B.weak || B.saveData ? 34 : Math.min(110, Math.round(W * H / 19000));
    semear();
    sujo = true;
  }

  function semear() {
    ps.length = 0;
    for (var i = 0; i < nAlvo; i++) {
      ps.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22,
        r: .7 + Math.random() * 1.5,
        f: .3 + Math.random() * .7          /* fase própria: nada pisca junto */
      });
    }
  }

  /* medir DOM: só em scroll/resize. Nunca por frame. */
  function medir() {
    var el = document.querySelector('.hero__reactor');
    if (el) {
      var b = el.getBoundingClientRect();
      reator = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.min(b.width, b.height) / 2 };
    }
    titulos.length = 0;
    var alvos = document.querySelectorAll('.glow');
    for (var i = 0; i < alvos.length; i++) {
      var r = alvos[i].getBoundingClientRect();
      if (r.bottom < -120 || r.top > H + 120) continue;   /* fora de cena: nem entra na lista */
      titulos.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    sujo = false;
  }
  window.addEventListener('scroll', function () { sujo = true; }, { passive: true });
  B.on('resize', function () { dimensionar(); sujo = true; });

  /* halo: um gradiente por chamada é barato (~1ms para 64 halos, medido) e é
     mais rápido que um sprite escalado — a tentativa com sprite foi 1,4x pior
     e está registrada na auditoria para não ser repetida. */
  function halo(x, y, r, rgb, a) {
    if (a < .004 || r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  function tick(S) {
    if (sujo) medir();

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    var w = S.warmth;
    var cy = cor(CIANO, w), alta = cor(ALTA, w), nuc = cor(NUCLEO, w);
    var e = S.energy, pulso = S.pulse, orc = S.budget;
    var lum = .55 + e * .45 + pulso * .5 + S.singular * .6;

    /* ---- 1. campo de partículas ---- */
    var quantas = Math.round(ps.length * orc);
    var atrai = S.pointerOn ? 1 : 0;
    for (var i = 0; i < quantas; i++) {
      var p = ps[i];
      p.x += p.vx * (1 + pulso * 2); p.y += p.vy * (1 + pulso * 2);
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;

      /* o cursor atrai de leve — sem holofote, sem bola de luz */
      if (atrai) {
        var dx = S.px - p.x, dy = S.py - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 52900) { var k = .00018 * (1 - d2 / 52900); p.vx += dx * k; p.vy += dy * k; }
      }
      p.vx *= .995; p.vy *= .995;

      var br = (.18 + p.f * .3) * lum;
      ctx.fillStyle = 'rgba(' + cy + ',' + br.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }

    /* ---- 2. brumas: só quando há folga de orçamento ---- */
    if (orc > .8) {
      var t = S.t * .001;
      halo(W * .5 + Math.cos(t * .21) * W * .2, H * .38 + Math.sin(t * .17) * H * .15,
           Math.min(W, H) * .5, cy, .022 * lum);
    }

    /* ---- 3. reator do hero ---- */
    if (reator && reator.y > -reator.r && reator.y < H + reator.r) {
      var R = reator.r, cx = reator.x, cyy = reator.y;
      var resp = 1 + Math.sin(S.t * .022) * .02 + pulso * .05;
      var giro = S.t * .0045 * (1 + e);

      halo(cx, cyy, R * .95, cy, (.05 + e * .05 + pulso * .12) * lum);

      /* esfera: aro de luz e globo em arame — sem corpo opaco */
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + cy + ',' + (.34 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * .46 * resp, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + cy + ',' + (.1 * lum).toFixed(3) + ')';
      for (var m = 1; m <= 3; m++) {
        var rr = R * .46 * resp * (m / 4);
        ctx.beginPath(); ctx.ellipse(cx, cyy, R * .46 * resp, rr, 0, 0, TAU); ctx.stroke();
      }

      /* anel equatorial */
      ctx.strokeStyle = 'rgba(' + alta + ',' + (.3 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(cx, cyy, R * .74, R * .2, Math.sin(giro * .3) * .12, 0, TAU); ctx.stroke();

      /* órbitas com nós — a oclusão vem do alfa: nó atrás fica mais fraco */
      var nNos = Math.max(4, Math.round(9 * orc));
      for (var o = 0; o < 3; o++) {
        var incl = .4 + o * .55, rx = R * (.62 + o * .13), ry = rx * (.3 + o * .12);
        ctx.strokeStyle = 'rgba(' + cy + ',' + (.09 * lum).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(cx, cyy, rx, ry, incl, 0, TAU); ctx.stroke();
        for (var n = 0; n < nNos; n++) {
          var ang = (n / nNos) * TAU + giro * (o % 2 ? -1 : 1) * (1 + o * .2);
          var ex = Math.cos(ang) * rx, ey = Math.sin(ang) * ry;
          var nx = cx + ex * Math.cos(incl) - ey * Math.sin(incl);
          var ny = cyy + ex * Math.sin(incl) + ey * Math.cos(incl);
          var frente = Math.sin(ang) > 0 ? 1 : .3;
          ctx.fillStyle = 'rgba(' + alta + ',' + (.8 * frente * lum).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(nx, ny, 1.5 * frente + 1, 0, TAU); ctx.fill();
        }
      }

      /* núcleo de plasma */
      halo(cx, cyy, R * .2 * (1 + pulso), nuc, (.3 + pulso * .4 + S.singular * .4) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + Math.min(1, .85 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * .05 * resp, 0, TAU); ctx.fill();
    }

    /* ---- 4. brilho da tipografia ----
       O efeito que antes custava 76ms com 205 spans: uma frente de luz que
       percorre o título. Aqui é um gradiente por título visível — e só quando
       há energia de fato para mostrar. */
    var acende = pulso * .9 + S.singular * .5 + (e - .3) * .2;
    if (acende > .02 && orc > .5) {
      for (var k = 0; k < titulos.length; k++) {
        var tt = titulos[k];
        /* a frente atravessa a largura do título conforme o Pulso avança */
        var fx = tt.x + tt.w * S.pulseFront;
        var g2 = ctx.createLinearGradient(tt.x, 0, tt.x + tt.w, 0);
        var pos = Math.max(0, Math.min(1, S.pulseFront));
        g2.addColorStop(Math.max(0, pos - .22), 'rgba(' + cy + ',0)');
        g2.addColorStop(pos, 'rgba(' + alta + ',' + (.2 * acende).toFixed(3) + ')');
        g2.addColorStop(Math.min(1, pos + .22), 'rgba(' + cy + ',0)');
        ctx.fillStyle = g2;
        ctx.fillRect(tt.x, tt.y, tt.w, tt.h);
        halo(fx, tt.y + tt.h / 2, tt.h * .9, alta, .12 * acende);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  dimensionar();
  B.add('campo', tick);
})();
