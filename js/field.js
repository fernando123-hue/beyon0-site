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
  var reator = null, titulos = [], palavras = [], barramento = null;
  var cards = [], servNos = [], nucleo = null;
  var sujo = true;

  /* o DOM é estático: buscar os mesmos elementos a cada scroll é trabalho
     jogado fora. medir() só relê os retângulos. */
  var elReator = document.querySelector('.hero__reactor');
  var elGlow = document.querySelectorAll('.glow');
  var elChaves = document.querySelectorAll('.card--service em');
  var elBus = document.querySelector('.bus');
  var elCards = document.querySelectorAll('.card');          /* brilho de proximidade */
  var elServ = document.querySelectorAll('.card--service');  /* elos do mini AI Core */

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
    if (elReator) {
      var b = elReator.getBoundingClientRect();
      reator = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.min(b.width, b.height) / 2 };
    }
    titulos.length = 0;
    for (var i = 0; i < elGlow.length; i++) {
      var r = elGlow[i].getBoundingClientRect();
      if (r.bottom < -120 || r.top > H + 120) continue;   /* fora de cena: nem entra na lista */
      titulos.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }

    /* palavras-chave dos serviços: a aura por trás delas é desenhada aqui, não
       estilizada. A versão antiga quebrava cada palavra em spans — 205 deles,
       68% dos 76ms de recálculo. Aqui são 6 retângulos em cache. */
    palavras.length = 0;
    for (var j = 0; j < elChaves.length; j++) {
      var rp = elChaves[j].getBoundingClientRect();
      if (rp.bottom < 0 || rp.top > H || !rp.width) continue;
      palavras.push({ x: rp.left + rp.width / 2, y: rp.top + rp.height / 2, w: rp.width, h: rp.height });
    }

    /* barramento: a linha por onde a luz do Pulso viaja até os serviços */
    barramento = null;
    if (elBus) {
      var rb = elBus.getBoundingClientRect();
      if (rb.bottom > 0 && rb.top < H && rb.width) {
        barramento = { x: rb.left, y: rb.top + rb.height / 2, w: rb.width };
      }
    }

    /* cards visíveis: centro em cache para o brilho de proximidade. Medir 16
       retângulos em scroll/resize é ruído perto do orçamento (a auditoria mediu
       574 getBoundingClientRect em 1,06ms). Culling: fora de cena nem entra. */
    cards.length = 0;
    for (var c = 0; c < elCards.length; c++) {
      var rc = elCards[c].getBoundingClientRect();
      if (rc.bottom < -80 || rc.top > H + 80 || !rc.width) continue;
      cards.push({ x: rc.left, y: rc.top, w: rc.width, h: rc.height,
                   cx: rc.left + rc.width / 2, cy: rc.top + rc.height / 2 });
    }

    /* centros dos cards de serviço: destino dos elos do mini AI Core */
    servNos.length = 0;
    for (var sv = 0; sv < elServ.length; sv++) {
      var rv = elServ[sv].getBoundingClientRect();
      if (rv.bottom < -80 || rv.top > H + 80 || !rv.width) continue;
      servNos.push({ cx: rv.left + rv.width / 2, cy: rv.top + rv.height / 2 });
    }

    /* o núcleo flutua logo acima do rótulo "Conectado ao AI Core": o texto
       aponta para ele, os elos sobem dele até os cards. */
    nucleo = barramento ? { x: barramento.x + barramento.w / 2, y: barramento.y - 42, r: 30 } : null;

    sujo = false;
  }
  window.addEventListener('scroll', function () { sujo = true; }, { passive: true });
  B.on('resize', function () { dimensionar(); sujo = true; });
  /* .reveal nasce com translateY(18px), e getBoundingClientRect devolve a caixa
     JÁ transformada — os retângulos medidos antes da revelação ficam 18px fora
     do lugar. Ao fim da entrada, remede uma vez. */
  B.on('entrada-pronta', function () { sujo = true; });

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

  /* proximidade do cursor a um ponto: 1 encostado, 0 além do raio. Sem ponteiro
     (toque), é sempre 0 — os cards mantêm só a aura ambiente. */
  function prox(S, x, y, R) {
    if (!S.pointerOn) return 0;
    var dx = S.px - x, dy = S.py - y, d = Math.sqrt(dx * dx + dy * dy);
    return d >= R ? 0 : 1 - d / R;
  }

  /* retângulo arredondado: o aro de luz que acende atrás do card ao chegar
     perto. Fica ATRÁS do conteúdo, então só a borda que vaza do card aparece. */
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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

    /* ---- 3b. cards: aura ambiente + brilho por proximidade ----
       Contínuo, logo vive no canvas — foi um efeito assim, feito com var CSS
       por frame, que custou 76ms de recálculo antes. A borda nítida do clique
       fica no :hover (CSS, evento). Aqui é o halo que ACENDE conforme o cursor
       chega: cada card responde por conta, sem holofote global perseguindo. */
    if (orc > .5 && cards.length) {
      for (var c = 0; c < cards.length; c++) {
        var cc = cards[c];
        var pr = prox(S, cc.cx, cc.cy, 300);
        var inten = .05 + e * .05 + pr * pr * .9;         /* quadrática: suave longe, forte perto */
        if (inten < .02) continue;
        ctx.save();
        ctx.translate(cc.cx, cc.cy);
        ctx.scale(1, Math.max(.4, cc.h / cc.w));          /* achata ao formato do card */
        halo(0, 0, cc.w * .78, cy, .09 * inten);
        ctx.restore();
        if (pr > .04) {                                    /* aro só quando o cursor está perto */
          rrect(cc.x - 2, cc.y - 2, cc.w + 4, cc.h + 4, 5);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = 'rgba(' + alta + ',' + (.5 * pr).toFixed(3) + ')';
          ctx.stroke();
        }
      }
    }

    /* ---- 3c. mini AI Core: o nó dos serviços, ligado a cada card ----
       O barramento já dizia "Conectado ao AI Core" em texto; agora o núcleo
       existe e os elos vão até os cards. Interativo: o elo do card sob o cursor
       acende. Durante o Pulso, a frente sobe pelos elos até os cards. */
    if (nucleo && orc > .55 && nucleo.y > -80 && nucleo.y < H + 80) {
      var hx = nucleo.x, hy = nucleo.y, hr = nucleo.r;
      for (var L = 0; L < servNos.length; L++) {          /* elos primeiro, atrás do núcleo */
        var sn = servNos[L];
        var pl = prox(S, sn.cx, sn.cy, 300);
        var aL = .05 + e * .05 + pl * .5 + pulso * .3;
        ctx.strokeStyle = 'rgba(' + cy + ',' + Math.min(.6, aL).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(sn.cx, sn.cy); ctx.stroke();
        if (pulso > .02) {
          var f = Math.max(0, Math.min(1, S.pulseFront));
          halo(hx + (sn.cx - hx) * f, hy + (sn.cy - hy) * f, 10, nuc, .5 * pulso);
        }
      }
      var resp2 = 1 + Math.sin(S.t * .03) * .05 + pulso * .12;
      halo(hx, hy, hr * 1.5, cy, (.08 + e * .06 + pulso * .16) * lum);
      ctx.strokeStyle = 'rgba(' + cy + ',' + (.4 * lum).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, hr * .6 * resp2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + alta + ',' + (.28 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(hx, hy, hr * .9, hr * .26, S.t * .01, 0, TAU); ctx.stroke();
      halo(hx, hy, hr * .3 * (1 + pulso), nuc, (.4 + pulso * .4 + S.singular * .4) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + Math.min(1, .8 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, hr * .09 * resp2, 0, TAU); ctx.fill();
    }

    /* ---- 4. tipografia viva ----
       O efeito que antes custava 76ms com 205 spans, agora desenhado: um realce
       que percorre o título. Duas camadas — VIDA contínua (baixa, sempre, para a
       tipografia nunca parecer morta) e a FRENTE do Pulso por cima quando há
       evento. Um gradiente por título visível; sob orçamento apertado, some. */
    var acende = pulso * .9 + S.singular * .5 + (e - .3) * .2;
    var viva = .05 + e * .08;
    if (orc > .5 && titulos.length) {
      for (var k = 0; k < titulos.length; k++) {
        var tt = titulos[k];
        /* vida: um realce suave desliza devagar, com fase própria por título */
        var vp = Math.sin(S.t * .012 + tt.x * .004) * .5 + .5;
        var gv = ctx.createLinearGradient(tt.x, 0, tt.x + tt.w, 0);
        gv.addColorStop(Math.max(0, vp - .3), 'rgba(' + cy + ',0)');
        gv.addColorStop(vp, 'rgba(' + alta + ',' + (.16 * viva).toFixed(3) + ')');
        gv.addColorStop(Math.min(1, vp + .3), 'rgba(' + cy + ',0)');
        ctx.fillStyle = gv;
        ctx.fillRect(tt.x, tt.y, tt.w, tt.h);
        /* frente do Pulso: mais forte, atravessa conforme S.pulseFront avança */
        if (acende > .02) {
          var fx = tt.x + tt.w * S.pulseFront;
          var pos = Math.max(0, Math.min(1, S.pulseFront));
          var g2 = ctx.createLinearGradient(tt.x, 0, tt.x + tt.w, 0);
          g2.addColorStop(Math.max(0, pos - .22), 'rgba(' + cy + ',0)');
          g2.addColorStop(pos, 'rgba(' + alta + ',' + (.2 * acende).toFixed(3) + ')');
          g2.addColorStop(Math.min(1, pos + .22), 'rgba(' + cy + ',0)');
          ctx.fillStyle = g2;
          ctx.fillRect(tt.x, tt.y, tt.w, tt.h);
          halo(fx, tt.y + tt.h / 2, tt.h * .9, alta, .12 * acende);
        }
      }
    }

    /* ---- 5. aura nas palavras-chave ----
       Só existe quando o organismo está em evento: em repouso o laço nem roda,
       então o custo é literalmente zero na maior parte do tempo. */
    var aura = pulso * .85 + S.singular * .7;
    if (aura > .02 && orc > .6) {
      for (var q = 0; q < palavras.length; q++) {
        var pw = palavras[q];
        ctx.save();
        ctx.translate(pw.x, pw.y);
        /* achata o halo: a palavra é larga e baixa, um círculo vazaria demais */
        ctx.scale(1, Math.max(.3, pw.h / pw.w));
        halo(0, 0, pw.w * .8, alta, .17 * aura);
        ctx.restore();
      }
    }

    /* ---- 6. barramento: a luz do Pulso atravessando até os serviços ----
       Não é um loop eterno: existe só enquanto o Pulso passa, e é ELE que a
       frente (S.pulseFront) posiciona. Serve para tornar o Pulso legível. */
    if (barramento && pulso > .02) {
      var bx = barramento.x + barramento.w * S.pulseFront;
      var bg = ctx.createLinearGradient(barramento.x, 0, barramento.x + barramento.w, 0);
      var bp = Math.max(0, Math.min(1, S.pulseFront));
      bg.addColorStop(Math.max(0, bp - .16), 'rgba(' + cy + ',0)');
      bg.addColorStop(bp, 'rgba(' + nuc + ',' + (.5 * pulso).toFixed(3) + ')');
      bg.addColorStop(Math.min(1, bp + .16), 'rgba(' + cy + ',0)');
      ctx.fillStyle = bg;
      ctx.fillRect(barramento.x, barramento.y - 1, barramento.w, 2);
      halo(bx, barramento.y, 26, alta, .3 * pulso);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  dimensionar();
  B.add('campo', tick);
})();
