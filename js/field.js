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
  var reator = null, titulos = [], palavras = [], barramento = null;
  var cards = [], servNos = [], nucleo = null;
  var glifos = [];            /* caixas dos caracteres, relativas ao título */
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

  /* ---- TIPOGRAFIA VIVA: a caixa de cada caractere, medida SEM tocar o DOM ----
     A versão antiga quebrava cada título em <span> por letra — 205 deles, 68%
     dos 76ms de recálculo de estilo. A alma do efeito (energia POR GLIFO:
     campo ao redor do cursor, frente varrendo letra a letra) não precisava dos
     spans: um Range sobre o nó de texto devolve a caixa de qualquer caractere.
     Sem elemento novo, sem estilo para recalcular.

     Roda só quando o LAYOUT muda (boot, fontes prontas, resize, fim da
     entrada) — nunca em scroll. As caixas ficam relativas ao título, então
     rolar não invalida nada: basta somar a posição atual do título. */
  function medirGlifos() {
    glifos.length = 0;
    for (var i = 0; i < elGlow.length; i++) {
      var el = elGlow[i], base = el.getBoundingClientRect(), lista = [];
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var no, rng = document.createRange();
      while ((no = walker.nextNode())) {
        var txt = no.nodeValue;
        for (var c = 0; c < txt.length; c++) {
          var ch = txt.charAt(c);
          if (ch === ' ' || ch === '\n' || ch === '\t') continue;   /* espaço não acende */
          rng.setStart(no, c); rng.setEnd(no, c + 1);
          var rc = rng.getBoundingClientRect();
          if (!rc.width || !rc.height) continue;
          lista.push({
            dx: rc.left - base.left, dy: rc.top - base.top,
            w: rc.width, h: rc.height,
            cx: rc.left - base.left + rc.width / 2,
            cy: rc.top - base.top + rc.height / 2
          });
        }
      }
      /* posição de cada glifo na frase (0..1): a base de toda a física por
         caractere — a frente varre por ESTA ordem, não pela geometria. */
      for (var k = 0; k < lista.length; k++) {
        lista[k].cp = lista.length > 1 ? k / (lista.length - 1) : 0;
        lista[k].j = (k * 2654435761 % 1000) / 1000;   /* fase própria, determinística */
      }
      glifos.push(lista);
    }
    sujo = true;
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
      /* os caracteres vêm do cache e são RELATIVOS ao título: aqui só se soma a
         posição atual. Assim rolar a página custa 1 retângulo por título, não um
         por glifo. */
      titulos.push({ x: r.left, y: r.top, w: r.width, h: r.height, cs: glifos[i] || null });
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
  /* medirGlifos custa ~300 leituras de Range — barato uma vez, caro em rajada.
     O resize dispara dezenas de vezes ao arrastar a janela, então ele espera a
     mão parar. Enquanto isso as caixas antigas seguem em uso: ficam um pouco
     fora do lugar por um instante, o que é invisível perto de travar o arrasto. */
  var tGlifos = 0;
  B.on('resize', function () {
    dimensionar();
    clearTimeout(tGlifos);
    tGlifos = setTimeout(medirGlifos, 180);
  });
  /* as caixas dos glifos dependem da fonte REAL: medidas antes de a Sora chegar,
     ficam todas no lugar errado (a fallback tem outra métrica). */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(medirGlifos).catch(function () {});
  }
  /* .reveal nasce com translateY(18px), e getBoundingClientRect devolve a caixa
     JÁ transformada — os retângulos medidos antes da revelação ficam 18px fora
     do lugar. Ao fim da entrada, remede uma vez (medirGlifos também marca sujo,
     então os títulos e os glifos voltam juntos ao lugar certo). */
  B.on('entrada-pronta', medirGlifos);

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

  /* proximidade do cursor a um ponto: 1 encostado, 0 além do raio. Sem ponteiro
     (toque), é sempre 0 — os cards mantêm só a aura ambiente. */
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

    /* ---- 3b. cards: aura ambiente + brilho por proximidade ----
       Contínuo, logo vive no canvas — foi um efeito assim, feito com var CSS
       por frame, que custou 76ms de recálculo antes. A borda nítida do clique
       fica no :hover (CSS, evento). Aqui é o halo que ACENDE conforme o cursor
       chega: cada card responde por conta, sem holofote global perseguindo. */
    if (orc > .5 && cards.length) {
      for (var c = 0; c < cards.length; c++) {
        var cc = cards[c];
        var pr = prox(S, cc.cx, cc.cy, 300);
        var inten = .03 + e * .04 + pr * pr * .9;         /* quase apagado em repouso; acende na aproximação */
        if (inten < .02) continue;
        ctx.save();
        ctx.translate(cc.cx, cc.cy);
        ctx.scale(1, Math.max(.4, cc.h / cc.w));          /* achata ao formato do card */
        halo(0, 0, cc.w * .78, cy, .09 * inten);           /* sob o vidro vira brilho fosco */
        ctx.restore();
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
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.4 * lum).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, hr * .6 * resp2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.28 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(hx, hy, hr * .9, hr * .26, S.t * .01, 0, TAU); ctx.stroke();
      halo(hx, hy, hr * .3 * (1 + pulso), nuc, (.4 + pulso * .4 + S.singular * .4) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.8 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, hr * .09 * resp2, 0, TAU); ctx.fill();
    }

    /* ---- 4. TIPOGRAFIA VIVA — energia por CARACTERE ----
       A alma do efeito antigo, sem o custo dele. Cada glifo tem energia própria,
       vinda de três fontes que se somam:
         · RESPIRO   — onda lenta com fase própria; a frase nunca parece morta
         · PERCEPÇÃO — campo ao redor do cursor: a luz nasce no glifo mais
                       próximo e decai para os vizinhos (sem hover, sem holofote)
         · FRENTE    — o Pulso varre letra a letra, na ORDEM DA FRASE (cp), não
                       na horizontal: em título de duas linhas a luz desce certo
       Só glifo ACESO custa alguma coisa: o laço testa e pula. Em repouso, com o
       cursor longe, são zero halos — o mesmo custo de antes de existir. */
    if (orc > .55 && titulos.length) {
      var frente = Math.max(0, Math.min(1, S.pulseFront));
      var temFrente = pulso > .02;
      var ganho = .55 + e * .45 + sing * .5;
      /* a onda de choque ACENDE AS LETRAS que atravessa: a ignição não é um
         efeito de fundo, ela passa POR DENTRO do texto. É a costura entre o
         Singular e a tipografia viva — e o momento que faz o site parecer vivo
         de verdade. */
      var temOnda = S.shock >= 0;
      var ondaR = 0, ondaX = 0, ondaY = 0;
      if (temOnda) {
        ondaX = reator ? reator.x : W * .5;
        ondaY = reator ? reator.y : H * .35;
        ondaR = S.shock * Math.sqrt(W * W + H * H) * .78;
      }
      for (var k = 0; k < titulos.length; k++) {
        var tt = titulos[k];
        if (!tt.cs || !tt.cs.length) continue;
        /* culling: título fora da tela não acende glifo nenhum */
        if (tt.y > H + 40 || tt.y + tt.h < -40) continue;
        /* VIDA AMBIENTE: um realce lento atravessando o título — UM gradiente,
           não um halo por letra. Antes isto era energia somada por glifo, e o
           resultado era ~40 halos por frame só de respiro (≈0,6ms constantes,
           6× o custo total do site em repouso). Como onda por título, custa
           uma fração disso e a frase continua viva. */
        var viva = .06 + e * .1;
        var vp = Math.sin(S.t * .012 + tt.x * .004) * .5 + .5;
        var gv = ctx.createLinearGradient(tt.x, 0, tt.x + tt.w, 0);
        gv.addColorStop(Math.max(0, vp - .3), 'rgba(' + cy + ',0)');
        gv.addColorStop(vp, 'rgba(' + alta + ',' + a1(.17 * viva).toFixed(3) + ')');
        gv.addColorStop(Math.min(1, vp + .3), 'rgba(' + cy + ',0)');
        ctx.fillStyle = gv;
        ctx.fillRect(tt.x, tt.y, tt.w, tt.h);

        var cs = tt.cs;
        for (var g = 0; g < cs.length; g++) {
          var ch = cs[g];
          var gx = tt.x + ch.cx, gy = tt.y + ch.cy;

          /* energia POR GLIFO: começa em ZERO. Em repouso, com o cursor longe
             e sem evento, nenhum glifo passa do limiar e o laço não desenha
             nada — o custo é o de antes de o efeito existir. */
          var en = 0;

          /* percepção: o campo do cursor decai com a distância ao glifo */
          if (S.pointerOn) {
            var ddx = S.px - gx, ddy = S.py - gy;
            var d2g = ddx * ddx + ddy * ddy;
            if (d2g < 28900) {                          /* raio 170px */
              var nd = 1 - Math.sqrt(d2g) / 170;
              en += nd * nd * .95;
            }
          }

          /* frente: distância na ORDEM DA FRASE até a onda do Pulso */
          if (temFrente) {
            var fd = Math.abs(ch.cp - frente);
            if (fd < .17) { var fh = 1 - fd / .17; en += fh * fh * pulso * 1.15; }
          }

          /* onda de choque: acende o glifo quando o anel passa por ele */
          if (temOnda) {
            var odx = gx - ondaX, ody = gy - ondaY;
            var dOnda = Math.abs(Math.sqrt(odx * odx + ody * ody) - ondaR);
            if (dOnda < 170) { var oh = 1 - dOnda / 170; en += oh * oh * 2.6; }
          }

          if (en < .04) continue;                        /* apagado: não custa nada */
          /* o respiro MODULA a luz que já existe (não a cria): cada glifo pulsa
             na sua própria fase, então a linha nunca lê como um bloco só. */
          en *= ganho * (.85 + (Math.sin(S.t * .019 + ch.j * 6.28) * .5 + .5) * .3);
          /* TETO: sem ele a ignição levava en a ~4 e o raio do halo a 2,6× a
             altura da letra — dezenas de halos gigantes ao mesmo tempo,
             estourando o visual e o orçamento. Limitado, o pico continua
             dramático e o custo continua previsível. */
          if (en > 1.5) en = 1.5;
          var raio = ch.h * (.62 + en * .5);
          halo(gx, gy, raio, en > .55 ? nuc : alta, Math.min(.5, en * .42));
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
  medirGlifos();                 /* com a fonte de fallback; refaz-se em fonts.ready */
  B.add('campo', tick);
})();
