/* ==========================================================================
   CAMPO DE ENERGIA — o único canvas do site.

   Desenha, em ordem: campo de partículas, brumas, espetáculo do Singular
   (aurora, onda de choque), reator do hero, mini AI Core e barramento. Tudo que
   se move continuamente vive aqui, porque desenhar a cena inteira custa ~1ms
   enquanto fazer o mesmo com elementos DOM reagindo por frame custava 76ms de
   recálculo de estilo.

   NÃO há brilho atrás do texto nem dos cards: o dono removeu essas luzes
   redondas (liam como amador). O que dá vida ao texto é a borda de energia
   (CSS) e o Singular, não manchas de luz atrás das letras.

   Nada aqui lê o DOM por frame: os retângulos do reator, do barramento e dos
   cards de serviço são medidos em scroll/resize e ficam em cache.
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

  /* mistura ciano→dourado→BRANCO conforme o Estado Singular. Uma função só, sem
     token de CSS envolvido: a cor do canvas nunca passa pela folha de estilo.
     Dois estágios, nesta ordem: primeiro o dourado toma o ciano (warmth),
     depois o branco incandescente toma o resultado (whiteHot). É o que dá a
     assinatura BRANCO+DOURADO: na ignição tudo satura ao branco, no reinado o
     dourado reina com núcleos brancos. */
  var BRANCO = '255,255,255';
  function mistura(base, alvo, w) {
    if (w < 0.01) return base;
    if (w > 0.99) return alvo;
    var a = base.split(','), b = alvo.split(',');
    return Math.round(+a[0] + (+b[0] - +a[0]) * w) + ',' +
           Math.round(+a[1] + (+b[1] - +a[1]) * w) + ',' +
           Math.round(+a[2] + (+b[2] - +a[2]) * w);
  }
  function cor(base, w, hot) {
    var c = mistura(base, OURO, w || 0);
    return hot ? mistura(c, BRANCO, hot) : c;
  }

  var W = 0, H = 0, dpr = 1;
  var ps = [], nAlvo = 0;
  var reator = null, barramento = null;
  var servNos = [], nucleo = null;
  var sujo = true;

  /* o DOM é estático: buscar os mesmos elementos a cada scroll é trabalho
     jogado fora. medir() só relê os retângulos. */
  var elReator = document.querySelector('.hero__reactor');
  var elBus = document.querySelector('.bus');
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
    /* barramento: a linha por onde a luz do Pulso viaja até os serviços */
    barramento = null;
    if (elBus) {
      var rb = elBus.getBoundingClientRect();
      if (rb.bottom > 0 && rb.top < H && rb.width) {
        barramento = { x: rb.left, y: rb.top + rb.height / 2, w: rb.width };
      }
    }

    /* BORDA DE BAIXO de cada card de serviço: é onde o elo se conecta. Ligar no
       CENTRO fazia o elo mergulhar por dentro do card (parecia bug); na borda,
       ele encaixa como um cabo. */
    servNos.length = 0;
    for (var sv = 0; sv < elServ.length; sv++) {
      var rv = elServ[sv].getBoundingClientRect();
      if (rv.bottom < -80 || rv.top > H + 80 || !rv.width) continue;
      servNos.push({ cx: rv.left + rv.width / 2, cy: rv.bottom });
    }

    /* o núcleo flutua na folga entre o grid e o rótulo (o .bus ganhou um
       margin-top grande no CSS pra isto). Fica logo acima do rótulo — bem
       ABAIXO da base dos cards, então não cola mais neles. */
    nucleo = barramento ? { x: barramento.x + barramento.w / 2, y: barramento.y - 24, r: 22 } : null;

    sujo = false;
  }
  window.addEventListener('scroll', function () { sujo = true; }, { passive: true });
  B.on('resize', function () { dimensionar(); });
  /* .reveal nasce com translateY(18px), e getBoundingClientRect devolve a caixa
     JÁ transformada — os retângulos medidos antes da revelação ficam fora do
     lugar. Ao fim da entrada, remede uma vez. */
  B.on('entrada-pronta', function () { sujo = true; });

  /* halo: um gradiente por chamada é barato (~1ms para 64 halos, medido) e é
     mais rápido que um sprite escalado — a tentativa com sprite foi 1,4x pior
     e está registrada na auditoria para não ser repetida. */
  /* alfa acima de 1 não é um exagero inofensivo: `rgba(...,3.38)` pode ser
     recusado inteiro pelo parser, e uma atribuição recusada em fillStyle é
     SILENCIOSA — o desenho sai com a cor anterior. Com o Singular somando
     luminância (lum chega a ~2,6), vários pontos passavam de 1. Trava aqui. */
  function a1(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function halo(x, y, r, rgb, a) {
    a = a1(a);
    if (a < .004 || r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  /* proximidade do cursor a um ponto: 1 encostado, 0 além do raio. Usada pelos
     elos do AI Core (o do card sob o cursor acende). Sem ponteiro, é sempre 0. */
  function prox(S, x, y, R) {
    if (!S.pointerOn) return 0;
    var dx = S.px - x, dy = S.py - y, d = Math.sqrt(dx * dx + dy * dy);
    return d >= R ? 0 : 1 - d / R;
  }

  function tick(S) {
    if (sujo) medir();

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    var w = S.warmth, hot = S.whiteHot || 0;
    /* o núcleo satura ao branco ANTES do resto (é a fonte da luz), então recebe
       um ganho de branco maior — é isso que faz a ignição parecer um estouro e
       não uma troca de paleta. */
    var cy = cor(CIANO, w, hot * .55), alta = cor(ALTA, w, hot * .8), nuc = cor(NUCLEO, w, hot);
    var e = S.energy, pulso = S.pulse, orc = S.budget;
    var sing = S.singular;
    var lum = .55 + e * .45 + pulso * .5 + sing * .6 + hot * .5;

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
      /* no Singular o campo inteiro é puxado para o reator: a poeira vira
         corrente, e dá para VER de onde a energia está vindo. */
      if (sing > .05 && reator) {
        var rx = reator.x - p.x, ry = reator.y - p.y;
        var kr = .00004 * sing;
        p.vx += rx * kr; p.vy += ry * kr;
      }
      p.vx *= .995; p.vy *= .995;

      var br = (.18 + p.f * .3) * lum;
      ctx.fillStyle = 'rgba(' + cy + ',' + a1(br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + sing * .5), 0, TAU); ctx.fill();
      /* núcleo branco nas maiores durante o Singular: a poeira vira brasa */
      if (sing > .3 && p.f > .55) {
        ctx.fillStyle = 'rgba(' + nuc + ',' + (.5 * sing).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .45, 0, TAU); ctx.fill();
      }
    }

    /* ---- 2. brumas: só quando há folga de orçamento ---- */
    if (orc > .8) {
      var t = S.t * .001;
      halo(W * .5 + Math.cos(t * .21) * W * .2, H * .38 + Math.sin(t * .17) * H * .15,
           Math.min(W, H) * .5, cy, .022 * lum);
    }

    /* ---- 2b. AURORA DO SINGULAR ----
       Duas cortinas de luz atravessando a tela inteira, uma de cada borda. Só
       existem durante o Singular: são o "não é mais o mesmo site" que faz quem
       assiste querer uma página assim. Dois gradientes lineares, custo fixo. */
    if (sing > .04 && orc > .7) {
      var au = sing * (.5 + Math.sin(S.t * .014) * .12);
      var ga = ctx.createLinearGradient(0, 0, 0, H * .55);
      ga.addColorStop(0, 'rgba(' + alta + ',' + (.14 * au).toFixed(3) + ')');
      ga.addColorStop(1, 'rgba(' + alta + ',0)');
      ctx.fillStyle = ga; ctx.fillRect(0, 0, W, H * .55);
      var gb = ctx.createLinearGradient(0, H, 0, H * .45);
      gb.addColorStop(0, 'rgba(' + cy + ',' + (.12 * au).toFixed(3) + ')');
      gb.addColorStop(1, 'rgba(' + cy + ',0)');
      ctx.fillStyle = gb; ctx.fillRect(0, H * .45, W, H * .55);
    }

    /* ---- 2c. ONDA DE CHOQUE ----
       A ignição do Singular manda um anel de luz do reator para fora, que
       atravessa a tela toda. É o momento de maior impacto do site — e dura
       menos de um segundo, por isso não cansa. Um anel + um rastro. */
    if (S.shock >= 0) {
      var sk = S.shock;
      var ox = reator ? reator.x : W * .5;
      var oy = reator ? reator.y : H * .35;
      var alcanceS = Math.sqrt(W * W + H * H) * .78;
      var raioS = sk * alcanceS;
      var forca = (1 - sk) * (1 - sk);                 /* some ao chegar na borda */
      ctx.lineWidth = 2 + forca * 5;
      ctx.strokeStyle = 'rgba(' + nuc + ',' + (.55 * forca).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox, oy, raioS, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + alta + ',' + (.3 * forca).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox, oy, raioS * .86, 0, TAU); ctx.stroke();
      halo(ox, oy, raioS * .5, nuc, .22 * forca);
    }

    /* ---- 3. reator do hero ---- */
    if (reator && reator.y > -reator.r && reator.y < H + reator.r) {
      var R = reator.r, cx = reator.x, cyy = reator.y;
      var resp = 1 + Math.sin(S.t * .022) * .02 + pulso * .05;
      var giro = S.t * .0045 * (1 + e);

      halo(cx, cyy, R * .95, cy, (.05 + e * .05 + pulso * .12) * lum);

      /* esfera: aro de luz e globo em arame — sem corpo opaco */
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.34 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * .46 * resp, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.1 * lum).toFixed(3) + ')';
      for (var m = 1; m <= 3; m++) {
        var rr = R * .46 * resp * (m / 4);
        ctx.beginPath(); ctx.ellipse(cx, cyy, R * .46 * resp, rr, 0, 0, TAU); ctx.stroke();
      }

      /* anel equatorial */
      ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.3 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(cx, cyy, R * .74, R * .2, Math.sin(giro * .3) * .12, 0, TAU); ctx.stroke();

      /* órbitas com nós — a oclusão vem do alfa: nó atrás fica mais fraco */
      var nNos = Math.max(4, Math.round(9 * orc));
      for (var o = 0; o < 3; o++) {
        var incl = .4 + o * .55, rx = R * (.62 + o * .13), ry = rx * (.3 + o * .12);
        ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.09 * lum).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(cx, cyy, rx, ry, incl, 0, TAU); ctx.stroke();
        for (var n = 0; n < nNos; n++) {
          var ang = (n / nNos) * TAU + giro * (o % 2 ? -1 : 1) * (1 + o * .2);
          var ex = Math.cos(ang) * rx, ey = Math.sin(ang) * ry;
          var nx = cx + ex * Math.cos(incl) - ey * Math.sin(incl);
          var ny = cyy + ex * Math.sin(incl) + ey * Math.cos(incl);
          var frente = Math.sin(ang) > 0 ? 1 : .3;
          ctx.fillStyle = 'rgba(' + alta + ',' + a1(.8 * frente * lum).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(nx, ny, 1.5 * frente + 1, 0, TAU); ctx.fill();
        }
      }

      /* ---- OVERDRIVE: só no Singular ----
         Serpentinas de plasma saltam do núcleo e voltam. É o reator "abrindo" —
         a diferença entre um estado de cor e um evento que se assiste. */
      if (sing > .05) {
        var nSerp = Math.max(3, Math.round(7 * orc));
        for (var sp = 0; sp < nSerp; sp++) {
          var fase = S.t * .02 + sp * (TAU / nSerp);
          var alcS = R * (.5 + (Math.sin(fase * .7) * .5 + .5) * 1.1) * sing;
          var ang2 = fase * .35 + sp * (TAU / nSerp);
          var ex2 = cx + Math.cos(ang2) * alcS, ey2 = cyy + Math.sin(ang2) * alcS * .55;
          ctx.strokeStyle = 'rgba(' + nuc + ',' + a1(.3 * sing * lum).toFixed(3) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(cx, cyy);
          ctx.quadraticCurveTo(cx + Math.cos(ang2 + .5) * alcS * .6,
                               cyy + Math.sin(ang2 + .5) * alcS * .3, ex2, ey2);
          ctx.stroke();
          halo(ex2, ey2, 12 + sing * 10, nuc, .35 * sing);
        }
        /* aro de contenção: o reator ganha uma casca visível no auge */
        ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.35 * sing * lum).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cyy, R * (.95 + Math.sin(S.t * .04) * .03), 0, TAU); ctx.stroke();
      }

      /* núcleo de plasma */
      halo(cx, cyy, R * .2 * (1 + pulso + sing), nuc, (.3 + pulso * .4 + sing * .6) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.85 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * (.05 + sing * .03) * resp, 0, TAU); ctx.fill();
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
        var aL = .06 + e * .05 + pl * .55 + pulso * .3;
        ctx.strokeStyle = 'rgba(' + cy + ',' + a1(Math.min(.6, aL)).toFixed(3) + ')';
        ctx.lineWidth = 1;
        /* curva com controle em (sn.cx, hy): sai do núcleo na horizontal e
           ENCAIXA vertical na base do card — cabo plugado, não linha cruzando. */
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(sn.cx, hy, sn.cx, sn.cy);
        ctx.stroke();
        /* a porta: onde o cabo encaixa no card. Acende com a proximidade. */
        ctx.fillStyle = 'rgba(' + alta + ',' + a1(.3 + pl * .5).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sn.cx, sn.cy, 1.6 + pl * 1.4, 0, TAU); ctx.fill();
        if (pulso > .02) {
          var f = Math.max(0, Math.min(1, S.pulseFront)), mt = 1 - f;
          /* posição na PRÓPRIA curva (Bézier quadrática), não na reta */
          var bx = mt * mt * hx + (2 * mt * f + f * f) * sn.cx;
          var by = (mt * mt + 2 * mt * f) * hy + f * f * sn.cy;
          halo(bx, by, 10, nuc, .5 * pulso);
        }
      }
      var resp2 = 1 + Math.sin(S.t * .03) * .05 + pulso * .12;
      halo(hx, hy, hr * 1.5, cy, (.08 + e * .06 + pulso * .16) * lum);
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.4 * lum).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, hr * .6 * resp2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.28 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(hx, hy, hr * .9, hr * .26, S.t * .01, 0, TAU); ctx.stroke();
      halo(hx, hy, hr * .3 * (1 + pulso), nuc, (.4 + pulso * .4 + S.singular * .4) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.8 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, hr * .09 * resp2, 0, TAU); ctx.fill();
    }

    /* NOTA: aqui viviam a "tipografia viva" (halos por glifo) e a "aura nas
       palavras-chave" (halos atrás das palavras). O dono removeu os dois: a luz
       redonda difusa atrás do texto lê como amador. O texto agora não tem
       nenhum brilho de canvas — a vida vem do reator, das partículas, da borda
       de energia e do espetáculo do Singular, não de manchas atrás das letras. */

    /* ---- barramento: a luz do Pulso atravessando até os serviços ----
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
