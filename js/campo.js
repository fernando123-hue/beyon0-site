/* ==========================================================================
   CAMPO — o único canvas do site. Tudo que se move continuamente vive aqui
   (desenhar a cena inteira custa ~1ms; o mesmo em DOM custava 76ms de
   recálculo de estilo).

   V2 — O INSTRUMENTO ACORDA. Em ordem de desenho:
     1. partículas com profundidade (paralaxe de rolagem, gravidade do núcleo)
     2. brumas
     3. camadas de fundo registradas por outros módulos (js/profundidade.js)
     4. a COLUNA (régua lateral) + o NÚCLEO VIAJANTE: a abertura nasce no hero
        e, ao rolar, desce pela coluna e se liga ao conteúdo de cada seção
     5. o AI Core (a abertura hexagonal), no hero ou já viajando
     6. o nó do barramento + elos até os cartões + fluxo
     7. a energia orbital dos nós do método
     8. aurora e onda de choque do Singular
     9. o retículo do cursor: enquadra o elemento interativo apontado

   Nada aqui lê o DOM por frame: retângulos são medidos em scroll/resize e
   ficam em cache (coordenadas de DOCUMENTO onde o scroll não as muda).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var cv = document.getElementById('fx');
  if (!cv) return;
  var ctx = cv.getContext('2d', { alpha: true });
  if (!ctx) return;

  var TAU = Math.PI * 2;
  /* A PALETA DO CANVAS espelha os tokens: CIANO = --ac, OURO = --warm,
     NUCLEO = --t1, PRATA = o contraponto frio (só existe aqui). */
  var CIANO = '79,216,240', ALTA = '165,235,246', NUCLEO = '240,242,246', OURO = '240,180,79';
  var PRATA = '104,110,124', BRANCO = '255,255,255';
  var LAMINAS = 6, K_HEX = 1 / Math.cos(Math.PI / LAMINAS), GRADE_PASSOS = 5, MARCAS = [0, .25, .5, .75];

  function mistura(base, alvo, w) {
    if (w < 0.01) return base;
    if (w > 0.99) return alvo;
    var a = base.split(','), b = alvo.split(',');
    return Math.round(+a[0] + (+b[0] - +a[0]) * w) + ',' + Math.round(+a[1] + (+b[1] - +a[1]) * w) + ',' + Math.round(+a[2] + (+b[2] - +a[2]) * w);
  }
  function cor(base, w, hot) { var c = mistura(base, OURO, w || 0); return hot ? mistura(c, BRANCO, hot) : c; }
  function a1(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function suave(t) { t = a1(t); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  var W = 0, H = 0, dpr = 1;
  var varr = 0, aber = 0;
  var pxAnt = 0, pyAnt = 0, presenca = 0, temAnt = false;
  var ps = [], nAlvo = 0;

  /* ---- camadas de fundo de outros módulos (profundidade) ---- */
  var camadas = [];
  B.camada = function (nome, fn) { camadas.push({ n: nome, f: fn }); };

  /* ---- o DOM é estático: elementos buscados uma vez, retângulos remedidos ---- */
  var elReator = document.querySelector('.hero__reactor');
  /* a leitura em volta do núcleo só no hero aberto: no palco de Sites o
     núcleo fica ATRÁS da janela e os números caíam sobre os botões */
  var temLeitura = !!(elReator && !elReator.closest('.palco'));
  var elBus = document.querySelector('.bus');
  var elServ = document.querySelectorAll('.card--service');
  var elSecoes = document.querySelectorAll('main > section[id]');
  var elKickers = document.querySelectorAll('main > section[id] .kicker');
  var elSteps = document.querySelectorAll('.steps .step');

  var reator = null, barramento = null, nucleo = null, nucAlpha = 0;
  var servNos = [], stepNos = [];
  var secTops = [], marcasSec = [], kickers = [];

  /* caches em coordenadas de DOCUMENTO (barramento, cartões, passos): medidos
     só em resize/remedir, nunca por frame de rolagem. O `.reveal` nasce 28px
     abaixo e o fim de cada entrada emite 'remedir' (js/anima.js), então o
     cache acompanha. Só o reator continua medido por frame de rolagem: o
     scrub do GSAP o transforma durante o scroll do hero. */
  var busDoc = null, servDoc = [], stepDoc = [], reatorDoc = null, sujoDoc = true;
  function medirDocumento() {
    /* coordenadas de documento: só mudam em resize/reflow */
    var sy = window.pageYOffset, sx = window.pageXOffset;
    if (elReator) {
      var rr = elReator.getBoundingClientRect();
      /* descontando o transform do scrub (S.reatorYP): a base é yPercent = 0 */
      reatorDoc = rr.width ? { x: rr.left + sx + rr.width / 2, y: rr.top + sy + rr.height / 2 - (B.S.reatorYP / 100) * rr.height, r: Math.min(rr.width, rr.height) / 2, h: rr.height } : null;
    }
    var alc = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    secTops.length = 0; marcasSec.length = 0; kickers.length = 0;
    busDoc = null;
    if (elBus) {
      var rb = elBus.getBoundingClientRect();
      if (rb.width) busDoc = { x: rb.left + sx, y: rb.top + sy + rb.height / 2, w: rb.width };
    }
    servDoc.length = 0;
    for (var sv = 0; sv < elServ.length; sv++) {
      var rv = elServ[sv].getBoundingClientRect();
      if (rv.width) servDoc.push({ cx: rv.left + sx + rv.width / 2, cy: rv.bottom + sy });
    }
    stepDoc.length = 0;
    for (var sp = 0; sp < elSteps.length; sp++) {
      var rs = elSteps[sp].getBoundingClientRect();
      if (rs.width) stepDoc.push({ x: rs.left + sx + 4, y: rs.top + sy + 4 });
    }
    for (var i = 0; i < elSecoes.length; i++) {
      var r = elSecoes[i].getBoundingClientRect();
      secTops.push(r.top + sy);
      marcasSec.push(Math.max(0, Math.min(1, (r.top + sy - 72) / alc)));
    }
    for (var k = 0; k < elKickers.length; k++) {
      var rk = elKickers[k].getBoundingClientRect();
      var sec = elKickers[k].closest('section[id]');
      kickers.push({ sec: sec, x: rk.left + sx, x2: rk.right + sx, y: rk.top + sy + rk.height / 2 });
    }
  }

  function medir() {
    /* tudo vem do cache de documento, convertido pela rolagem e pelo scrub:
       ZERO leitura de layout por frame */
    var sy = B.S.scrollY;
    reator = reatorDoc ? { x: reatorDoc.x, y: reatorDoc.y + (B.S.reatorYP / 100) * reatorDoc.h - sy, r: reatorDoc.r } : null;
    barramento = null;
    if (busDoc) {
      var by = busDoc.y - sy;
      if (by > -40 && by < H + 40) barramento = { x: busDoc.x, y: by, w: busDoc.w };
    }
    servNos.length = 0;
    for (var sv = 0; sv < servDoc.length; sv++) {
      var cy2 = servDoc[sv].cy - sy;
      if (cy2 < -80 || cy2 > H + 380) continue;
      servNos.push({ cx: servDoc[sv].cx, cy: cy2 });
    }
    nucleo = barramento ? { x: barramento.x + barramento.w / 2, y: barramento.y - 24, r: 22 } : null;
    stepNos.length = 0;
    for (var sp = 0; sp < stepDoc.length; sp++) {
      var yy = stepDoc[sp].y - sy;
      if (yy < -60 || yy > H + 60) continue;
      stepNos.push({ x: stepDoc[sp].x, y: yy });
    }
  }

  function dimensionar() {
    var S = B.S;
    /* no celular a barra de endereço recolhendo dispara resize a cada
       rolagem: só reinicia o bitmap se a largura mudou ou a altura mudou
       de verdade, e só resemeia as partículas aí — senão a poeira "pulava" */
    var mudouW = S.w !== W || S.dpr !== dpr, mudouH = Math.abs(S.h - H) > 120;
    dpr = S.dpr; W = S.w; H = S.h;
    if (mudouW || mudouH || !cv.width) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nAlvo = B.weak || B.saveData ? 34 : (B.fine ? Math.min(110, Math.round(W * H / 19000)) : 48);
      semear();
    }
    sujoDoc = true;
  }
  function semear() {
    ps.length = 0;
    for (var i = 0; i < nAlvo; i++) {
      var z = Math.random();
      ps.push({ x: Math.random() * W, y: Math.random() * H,
                vx: (Math.random() - .5) * .22 * (.4 + z), vy: (Math.random() - .5) * .22 * (.4 + z),
                r: .5 + z * 1.6, z: z, f: .3 + Math.random() * .7 });
    }
  }

  /* todo pedido de remedição só marca; o tick mede UMA vez por quadro */
  function marcar() { sujoDoc = true; }
  B.on('resize', dimensionar);
  B.on('remedir', marcar);
  B.on('entrada-pronta', marcar);
  window.addEventListener('load', marcar, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(marcar);

  function halo(x, y, r, rgb, a) {
    a = a1(a);
    if (a < .004 || r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function prox(S, x, y, R) {
    if (!S.pointerOn) return 0;
    var dx = S.px - x, dy = S.py - y, d = Math.sqrt(dx * dx + dy * dy);
    return d >= R ? 0 : 1 - d / R;
  }

  /* ---- A ABERTURA — o AI Core, em qualquer escala ----
     Malha ortogonal, anel de registro com quatro marcas paradas, uma
     varredura (o único movimento contínuo), seis lâminas retas, eixos e o
     ponto. `boot` desenha o instrumento acordando: o anel se traça, as
     lâminas abrem do fechado até o repouso. `det` cede sob orçamento e em
     escala pequena (a versão em miniatura perde malha e lâminas). */
  function abertura(S, cx, cy, R, det, boot, lumBase) {
    var w = S.warmth, hot = S.whiteHot || 0, pulso = S.pulse, sing = S.singular;
    var cy_ = cor(CIANO, w, hot * .55), alta = cor(ALTA, w, hot * .8), nuc = cor(NUCLEO, w, hot), pr = cor(PRATA, w, hot * .55);
    var lum = lumBase * (.25 + .75 * boot);
    var resp = 1 + Math.sin(S.t * .018) * .012 + pulso * .03;
    var grande = R > 40;
    ctx.lineWidth = 1;

    if (grande) {
      /* 1. malha: linhas ortogonais dentro do círculo, comprimento = corda */
      var passos = Math.max(2, Math.round(GRADE_PASSOS * det));
      var passo = R / (passos + 1);
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.12 * lum).toFixed(3) + ')';
      ctx.beginPath();
      for (var ig = -passos; ig <= passos; ig++) {
        if (!ig) continue;
        var dg = ig * passo, meia = Math.sqrt(Math.max(0, R * R - dg * dg)) * boot;
        ctx.moveTo(cx + dg, cy - meia); ctx.lineTo(cx + dg, cy + meia);
        ctx.moveTo(cx - meia, cy + dg); ctx.lineTo(cx + meia, cy + dg);
      }
      ctx.stroke();
    }
    /* 2. anel de registro (se traça no boot) + marcas cardeais */
    var a0 = -Math.PI / 2;
    ctx.strokeStyle = 'rgba(' + cy_ + ',' + a1(.22 * lum).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, R * .88, a0, a0 + TAU * boot); ctx.stroke();
    if (boot > .6) {
      ctx.lineWidth = grande ? 1.5 : 1;
      ctx.strokeStyle = 'rgba(' + cy_ + ',' + a1(.5 * lum * (boot - .6) / .4).toFixed(3) + ')';
      ctx.beginPath();
      for (var im = 0; im < MARCAS.length; im++) {
        var am = MARCAS[im] * TAU, cam = Math.cos(am), sam = Math.sin(am);
        ctx.moveTo(cx + cam * R * .82, cy + sam * R * .82);
        ctx.lineTo(cx + cam * R * .96, cy + sam * R * .96);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    /* 3. varredura — acelera com energia, Pulso e presença */
    varr += .006 * (1 + S.energy * .5 + pulso * 1.6) * (.25 + S.wake * .75) * (S.dt / 16.7);
    ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.55 * lum).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, R * .88, varr, varr + .38); ctx.stroke();

    if (grande) {
      /* 4. lâminas: cordas tangentes a um círculo interno. Abrem no boot, no
         Singular e um pouco quando o cursor chega perto. */
      var perto = prox(S, cx, cy, R * 3.4);
      var abre = .06 + suave(boot) * .28 + sing * .10 + pulso * .04 + perto * .05;
      var rIn = R * abre * resp;
      var rOut = rIn * K_HEX * 1.10;
      var meiaCorda = Math.sqrt(Math.max(0, rOut * rOut - rIn * rIn));
      aber += .0016 * (.3 + S.wake * .7) * (S.dt / 16.7);
      ctx.strokeStyle = 'rgba(' + cy_ + ',' + a1(.36 * Math.min(lum, 1.15)).toFixed(3) + ')';
      ctx.beginPath();
      for (var il = 0; il < LAMINAS; il++) {
        var al = aber + il / LAMINAS * TAU;
        var lx = cx + Math.cos(al) * rIn, ly = cy + Math.sin(al) * rIn;
        var ldx = -Math.sin(al) * meiaCorda, ldy = Math.cos(al) * meiaCorda;
        ctx.moveTo(lx - ldx, ly - ldy); ctx.lineTo(lx + ldx, ly + ldy);
      }
      ctx.stroke();
      /* 5. eixos */
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.20 * lum).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(cx - R * .96 * boot, cy); ctx.lineTo(cx + R * .96 * boot, cy);
      ctx.moveTo(cx, cy - R * .96 * boot); ctx.lineTo(cx, cy + R * .96 * boot);
      ctx.stroke();
    }
    /* 7. A LEITURA — o instrumento mostra o que mede. Três valores em mono
       nas marcas cardeais: quadros por segundo, tempo até pronta, bytes deste
       domínio. É a prova prometida pelo título, no objeto que a produz. */
    if (grande && temLeitura && R > 90 && boot > .85 && S.leitura) {   /* no celular o núcleo é pequeno demais para texto ao redor */
      var aT = a1((boot - .85) / .15 * .75 * Math.min(lum, 1.2));
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(' + alta + ',' + aT.toFixed(3) + ')';
      if (S.leitura.fps) { ctx.textAlign = 'center'; ctx.fillText(S.leitura.fps, cx, cy - R * 1.06); }
      if (S.leitura.carga) { ctx.textAlign = 'left'; ctx.fillText(S.leitura.carga, cx + R * 1.02, cy); }
      if (S.leitura.peso) { ctx.textAlign = 'center'; ctx.fillText(S.leitura.peso, cx, cy + R * 1.06); }
    }
    /* 6. o ponto: inteligência centralizada */
    halo(cx, cy, R * (.10 + pulso * .06 + sing * .10), nuc, (.22 + pulso * .3 + sing * .35) * lum);
    ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.95 * lum).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.2, R * (.028 + sing * .016)) * resp, 0, TAU); ctx.fill();
  }

  /* ---- o retículo do cursor: estado suavizado ---- */
  var ret = { x: 0, y: 0, w: 0, h: 0, a: 0, on: false };

  /* ---- BRUMAS no compositor ----
     Dois halos do tamanho da tela compostos por frame eram o maior custo de
     PINTURA (medido: ~11fps em rasterização por software). Viram duas camadas
     CSS (css/motion.css) animadas só por transform — o compositor resolve
     sem repintar. Criadas aqui porque são decoração do canvas, não conteúdo. */
  (function brumas() {
    if (document.querySelector('.bruma')) return;
    var frag = document.createDocumentFragment();
    for (var i = 1; i <= 2; i++) {
      var d = document.createElement('div');
      d.className = 'bruma bruma--' + i; d.setAttribute('aria-hidden', 'true');
      frag.appendChild(d);
    }
    cv.parentNode.insertBefore(frag, cv.nextSibling);
  })();

  function tick(S) {
    if (B.reduced) return;
    if (sujoDoc) { medirDocumento(); sujoDoc = false; }
    medir();

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    var w = S.warmth, hot = S.whiteHot || 0;
    var cy = cor(CIANO, w, hot * .55), alta = cor(ALTA, w, hot * .8), nuc = cor(NUCLEO, w, hot), pr = cor(PRATA, w, hot * .55);
    var e = S.energy, pulso = S.pulse, orc = S.budget, sing = S.singular;
    var boot = S.boot;
    var lum = (.55 + e * .45 + pulso * .5 + sing * .6 + hot * .5) * (.62 + S.wake * .38) * (.3 + .7 * boot);
    var largo = W > 1000;

    /* ---- o NÚCLEO VIAJANTE: onde o AI Core está neste frame ----
       No hero ele mora na caixa do reator. Quando a caixa sobe acima de 55%
       da tela, ele começa a viajar e, em 38% de tela, ancora na coluna, do
       tamanho de um marcador: a partir daí ele É o cursor da régua, e cada
       seção recebe o elo dele. Rolagem dirige tudo: sem tempo, sem tween. */
    var temReator = !!reator;
    var viaja = 0, nx = 0, ny = 0, nr = 0;
    var colX = 22, colTopo = 90, colBase = H - 104, colH = colBase - colTopo;
    var yPos = colTopo + a1(S.scroll) * colH;
    /* no celular não há coluna: o núcleo ancora no canto superior direito,
       abaixo da nav, e os elos saem dele pela DIREITA do kicker */
    var dockX = largo ? colX + .5 : W - 24.5, dockY = largo ? yPos : (W > 820 ? 72 : 66) + 24;
    var dockR = largo ? 11 : 9;
    if (temReator) {
      /* desktop: começa a viajar quando o centro passa de 55% da tela, ancora
         em 38% de tela. Celular: o núcleo mora no topo do hero, então a régua
         é a borda de cima — viaja quando a caixa encosta na nav, ancora quando
         ela sai da tela. */
      var navH = W > 820 ? 72 : 66;
      /* ancorado à ROLAGEM, não à posição absoluta da caixa: em repouso o
         núcleo é concêntrico ao cubo em qualquer tela (a versão anterior já
         nascia 14% viajado em 1440×900 — achado na revisão) */
      viaja = largo
        ? suave((S.scrollY - H * .08) / (H * .45))
        : suave(((navH + 24) - (reator.y - reator.r)) / (reator.r * 1.4 + navH));
      nx = lerp(reator.x, dockX, viaja);
      ny = lerp(reator.y, dockY, viaja);
      nr = lerp(reator.r, dockR, viaja);
    } else {
      viaja = 1; nx = dockX; ny = dockY; nr = dockR;
    }
    var temNucleo = true;

    /* ---- 1. partículas ---- */
    var quantas = Math.round(ps.length * orc);
    var atrai = S.pointerOn ? 1 : 0;
    var sdy = Math.max(-26, Math.min(26, S.sdy || 0));
    var temG = temNucleo && viaja < .9 && ny > -nr * 3 && ny < H + nr * 3;
    var gR = temG ? nr * 2.6 : 0, gR2 = gR * gR, gK = .00055 * (.35 + S.wake * .65);
    var kdt = S.dt / 16.7;   /* tudo escala por S.dt (dormente anda a 15fps com dt acumulado) */
    for (var i = 0; i < quantas; i++) {
      var p = ps[i];
      p.x += p.vx * (1 + pulso * 2) * kdt; p.y += p.vy * (1 + pulso * 2) * kdt;
      p.y -= sdy * (.02 + p.z * .14);
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
      var luzCursor = 0;
      if (atrai) {
        var dx = S.px - p.x, dy = S.py - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 52900) {
          var caiu = 1 - d2 / 52900, k = .00018 * caiu * (.4 + p.z);
          p.vx += dx * k; p.vy += dy * k;
          luzCursor = caiu * caiu * .5;
        }
      }
      if (temG) {
        var ox = nx - p.x, oy = ny - p.y, o2 = ox * ox + oy * oy;
        if (o2 < gR2 && o2 > 400) {
          var od = Math.sqrt(o2), qd = (1 - od / gR) * gK / od;
          p.vx += ox * qd + -oy * qd * 3; p.vy += oy * qd + ox * qd * 3;
        }
      }
      if (sing > .05 && temReator) {
        var kr = .00004 * sing;
        p.vx += (reator.x - p.x) * kr; p.vy += (reator.y - p.y) * kr;
      }
      p.vx *= .995; p.vy *= .995;
      var br = (.10 + p.z * .34 + luzCursor) * lum;
      ctx.fillStyle = 'rgba(' + (p.z > .55 ? cy : pr) + ',' + a1(br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + sing * .5), 0, TAU); ctx.fill();
      if (sing > .3 && p.z > .55) {
        ctx.fillStyle = 'rgba(' + nuc + ',' + (.5 * sing).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .45, 0, TAU); ctx.fill();
      }
    }


    /* ---- 3. camadas de fundo (profundidade) ---- */
    for (var ic = 0; ic < camadas.length; ic++) camadas[ic].f(ctx, S, { lum: lum, cy: cy, alta: alta, nuc: nuc, pr: pr, boot: boot });

    /* ---- 4. a COLUNA e os ELOS de seção ----
       A escala inteira do documento, sempre visível, com uma marca por seção.
       O núcleo viajante é o cursor dela. Quando ele chega numa seção, um elo
       sai da coluna até o kicker daquela seção: é a fonte alimentando o
       conteúdo — a causalidade que faz as seções parecerem UM percurso. */
    if (largo && colH > 120 && marcasSec.length) {
      var vivo = (.5 + S.wake * .5) * boot;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.13 * vivo).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(colX + .5, colTopo); ctx.lineTo(colX + .5, colBase); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.3 * vivo).toFixed(3) + ')';
      ctx.beginPath();
      for (var ims = 0; ims < marcasSec.length; ims++) {
        var ym = Math.round(colTopo + marcasSec[ims] * colH) + .5;
        ctx.moveTo(colX - 3, ym); ctx.lineTo(colX + 5, ym);
      }
      ctx.stroke();
      /* o trecho percorrido acende: do topo até o núcleo */
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.28 * vivo * viaja).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(colX + .5, colTopo); ctx.lineTo(colX + .5, ny); ctx.stroke();

      /* o elo até a seção ativa */
      if (viaja > .95 && largo) {
        var sy = S.scrollY, foco = sy + H * .5, ativa = -1;
        for (var sa = 0; sa < secTops.length; sa++) if (secTops[sa] <= foco) ativa = sa;
        for (var ik = 0; ik < kickers.length; ik++) {
          var kk = kickers[ik];
          if (ativa < 0 || kk.sec !== elSecoes[ativa]) continue;
          var ky = kk.y - sy, kx = kk.x - 12;
          if (ky < 0 || ky > H || kx <= colX + 8) continue;
          var vert = Math.abs(ky - ny);
          var aElo = a1((.22 + pulso * .4) * vivo * (1 - vert / (H * .9)));
          /* caminho: pela coluna até a altura do kicker, depois horizontal */
          var gElo = ctx.createLinearGradient(colX, 0, kx, 0);
          gElo.addColorStop(0, 'rgba(' + cy + ',' + aElo.toFixed(3) + ')');
          gElo.addColorStop(1, 'rgba(' + alta + ',' + (aElo * .8).toFixed(3) + ')');
          ctx.strokeStyle = 'rgba(' + cy + ',' + (aElo * .7).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(colX + .5, ny); ctx.lineTo(colX + .5, ky); ctx.stroke();
          ctx.strokeStyle = gElo;
          ctx.beginPath(); ctx.moveTo(colX + .5, ky + .5); ctx.lineTo(kx, ky + .5); ctx.stroke();
          /* a porta no kicker + um grão de energia correndo pelo elo */
          ctx.fillStyle = 'rgba(' + alta + ',' + a1(aElo * 1.6).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(kx, ky + .5, 1.8, 0, TAU); ctx.fill();
          var tf = (S.t * .012) % 1;
          var fx = lerp(colX, kx, tf);
          ctx.fillStyle = 'rgba(' + nuc + ',' + a1(Math.sin(tf * Math.PI) * aElo * 1.4).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(fx, ky + .5, 1.4, 0, TAU); ctx.fill();
        }
      }
    }

    if (!largo && viaja > .95 && kickers.length) {
      var syM = S.scrollY, focoM = syM + H * .5, ativaM = -1;
      for (var sm = 0; sm < secTops.length; sm++) if (secTops[sm] <= focoM) ativaM = sm;
      for (var km = 0; km < kickers.length; km++) {
        var kk2 = kickers[km];
        if (ativaM < 0 || kk2.sec !== elSecoes[ativaM]) continue;
        var ky2 = kk2.y - syM, kx2 = kk2.x2 + 10;
        if (ky2 < dockY + 10 || ky2 > H) continue;
        var aM = a1((.22 + pulso * .4) * boot * (1 - Math.abs(ky2 - ny) / (H * .95)));
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + cy + ',' + (aM * .7).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(nx, ny + nr + 2); ctx.lineTo(nx, ky2 + .5); ctx.lineTo(kx2, ky2 + .5); ctx.stroke();
        ctx.fillStyle = 'rgba(' + alta + ',' + a1(aM * 1.6).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(kx2, ky2 + .5, 1.8, 0, TAU); ctx.fill();
      }
    }

    /* ---- 5. o AI Core (no hero, viajando, ou ancorado) ---- */
    if (temNucleo && ny > -nr * 1.2 && ny < H + nr * 1.2) {
      var det = .5 + orc * .5;
      abertura(S, nx, ny, nr, det, boot, lum / (.3 + .7 * boot));
    }

    /* ---- 6. o nó do barramento: elos até os cartões + fluxo ---- */
    nucAlpha += ((orc > .5 ? 1 : 0) - nucAlpha) * .05;
    if (nucleo && nucAlpha > .01 && nucleo.y > -80 && nucleo.y < H + 80) {
      ctx.save();
      ctx.globalAlpha = nucAlpha * boot;
      var hx = nucleo.x, hy = nucleo.y, hr = nucleo.r;
      /* o barramento recebe do núcleo da coluna: um elo horizontal */
      if (largo && viaja > .95) {
        var gB = ctx.createLinearGradient(colX, 0, hx, 0);
        gB.addColorStop(0, 'rgba(' + cy + ',' + a1(.18 + pulso * .3).toFixed(3) + ')');
        gB.addColorStop(1, 'rgba(' + pr + ',' + a1(.14 + pulso * .3).toFixed(3) + ')');
        ctx.strokeStyle = gB; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(colX + .5, hy + .5); ctx.lineTo(hx - hr * .9, hy + .5); ctx.stroke();
      }
      /* elos até os cartões só com os cartões lado a lado: numa coluna só
         (celular) a curva degenera numa reta que atravessa o texto */
      for (var L = 0; L < (largo ? servNos.length : 0); L++) {
        var sn = servNos[L];
        var pl = prox(S, sn.cx, sn.cy, 300);
        var aL = a1(Math.min(.72, .12 + e * .06 + pl * .6 + pulso * .3));
        var gElo2 = ctx.createLinearGradient(sn.cx, sn.cy, hx, hy);
        gElo2.addColorStop(0, 'rgba(' + cy + ',' + aL.toFixed(3) + ')');
        gElo2.addColorStop(1, 'rgba(' + pr + ',' + aL.toFixed(3) + ')');
        ctx.strokeStyle = gElo2; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(sn.cx, hy, sn.cx, sn.cy); ctx.stroke();
        ctx.fillStyle = 'rgba(' + alta + ',' + a1(.3 + pl * .5).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sn.cx, sn.cy, 1.6 + pl * 1.4, 0, TAU); ctx.fill();
        var nPart = 3 + Math.round(e * .8 + pl * 4 + pulso * 2);
        var fvel = .0065 * (1 + pl * 1.8 + pulso);
        for (var fp = 0; fp < nPart; fp++) {
          var tq = (S.t * fvel + fp / nPart + L * .13) % 1, mt2 = 1 - tq;
          var fx2 = mt2 * mt2 * hx + (2 * mt2 * tq + tq * tq) * sn.cx;
          var fy2 = mt2 * mt2 * hy + 2 * mt2 * tq * hy + tq * tq * sn.cy;
          var brF = Math.sin(tq * Math.PI) * (.42 + pl * .58 + pulso * .35);
          if (brF < .02) continue;
          ctx.fillStyle = 'rgba(' + alta + ',' + a1(brF).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(fx2, fy2, 1 + pl * 1.4 + pulso * .6, 0, TAU); ctx.fill();
        }
        if (pulso > .02) {
          var f = a1(S.pulseFront), mt = 1 - f;
          halo(mt * mt * hx + (2 * mt * f + f * f) * sn.cx, (mt * mt + 2 * mt * f) * hy + f * f * sn.cy, 10, nuc, .5 * pulso);
        }
      }
      abertura(S, hx, hy, hr, 1, 1, lum / (.3 + .7 * boot) * .9);
      ctx.restore();
    }

    /* ---- 7. energia orbital dos nós do método ---- */
    for (var so = 0; so < stepNos.length; so++) {
      var nd = stepNos[so];
      if (nd.y < -40 || nd.y > H + 40) continue;
      var pn = prox(S, nd.x, nd.y, 220);
      var intens = (.16 + pulso * .3 + pn * .6) * Math.min(lum, 1.35);   /* repouso quieto; acende ao apontar */
      if (intens < .04) continue;
      var faseN = S.t * .04 + so * 2.1;
      for (var o = 0; o < 5; o++) {
        var raio = 6 + o * 2.4 + pn * 5, vel = 1.15 - o * .13, ang = faseN * vel + o * 1.7, incl = o * .8 + faseN * .04;
        var ex = Math.cos(ang) * raio, ey = Math.sin(ang) * raio * .42, ci = Math.cos(incl), si = Math.sin(incl);
        var rx = ex * ci - ey * si, ry = ex * si + ey * ci;
        var frente = .45 + .55 * (Math.sin(ang) * .5 + .5);
        ctx.fillStyle = 'rgba(' + (o % 2 ? cy : alta) + ',' + a1(frente * intens).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(nd.x + rx, nd.y + ry, .9 + frente * 1.1, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(intens * .55).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(nd.x, nd.y, 1.3 + (Math.sin(faseN * 2) * .5 + .5) * .8, 0, TAU); ctx.fill();
    }

    /* ---- 8. Singular: aurora + onda de choque ---- */
    if (sing > .04 && orc > .7) {
      var au = sing * (.5 + Math.sin(S.t * .014) * .12);
      var ga = ctx.createLinearGradient(0, 0, 0, H * .55);
      ga.addColorStop(0, 'rgba(' + alta + ',' + (.14 * au).toFixed(3) + ')'); ga.addColorStop(1, 'rgba(' + alta + ',0)');
      ctx.fillStyle = ga; ctx.fillRect(0, 0, W, H * .55);
      var gb = ctx.createLinearGradient(0, H, 0, H * .45);
      gb.addColorStop(0, 'rgba(' + pr + ',' + (.12 * au).toFixed(3) + ')'); gb.addColorStop(1, 'rgba(' + pr + ',0)');
      ctx.fillStyle = gb; ctx.fillRect(0, H * .45, W, H * .55);
    }
    if (S.shock >= 0) {
      var sk = S.shock, ox2 = temNucleo ? nx : W * .5, oy2 = temNucleo ? ny : H * .35;
      var raioS = sk * Math.sqrt(W * W + H * H) * .78, forca = (1 - sk) * (1 - sk);
      ctx.lineWidth = 2 + forca * 5;
      ctx.strokeStyle = 'rgba(' + nuc + ',' + (.55 * forca).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox2, oy2, raioS, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + alta + ',' + (.3 * forca).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox2, oy2, raioS * .86, 0, TAU); ctx.stroke();
      halo(ox2, oy2, raioS * .5, nuc, .22 * forca);
    }

    /* ---- 9. o RETÍCULO do cursor ----
       O cursor do sistema fica (é recurso de acessibilidade). O instrumento
       responde EM VOLTA dele: em repouso, uma mira de 1px; sobre um elemento
       interativo, quatro marcas de canto se fecham sobre a caixa dele — o
       visor enquadrou o alvo. Suavizado por lerp (o alvo é escrito por
       evento em js/pagina.js). Nas bordas, duas leituras de coordenada. */
    if (B.fine) {
      if (S.pointerOn) {
        var vpx = S.px - pxAnt, vpy = S.py - pyAnt;
        if (!temAnt) { temAnt = true; vpx = 0; vpy = 0; }
        pxAnt = S.px; pyAnt = S.py;
        var vel = Math.min(1, Math.sqrt(vpx * vpx + vpy * vpy) / 9);
        presenca += (vel - presenca) * (vel > presenca ? .35 : .045);
      } else if (presenca > .002) presenca *= .9; else presenca = 0;

      var alvo = S.alvo;
      var tx = alvo ? alvo.x - 6 : S.px - 9, ty = alvo ? alvo.y - 6 : S.py - 9;
      var tw = alvo ? alvo.w + 12 : 18, th = alvo ? alvo.h + 12 : 18;
      var k = alvo ? .22 : .35;
      if (!ret.on) { ret.x = tx; ret.y = ty; ret.w = tw; ret.h = th; ret.on = true; }
      ret.x += (tx - ret.x) * k; ret.y += (ty - ret.y) * k;
      ret.w += (tw - ret.w) * k; ret.h += (th - ret.h) * k;
      var alvoA = alvo ? 1 : presenca;   /* a mira só existe em movimento ou sobre um alvo */
      ret.a += ((S.pointerOn ? alvoA : 0) - ret.a) * .12;
      if (ret.a > .02) {
        var m = Math.min(10, ret.w * .3, ret.h * .3);
        var ca = a1(ret.a * .9 * Math.min(lum, 1.3));
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + (alvo ? cy : alta) + ',' + ca.toFixed(3) + ')';
        var x0 = ret.x + .5, y0 = ret.y + .5, x1 = ret.x + ret.w - .5, y1 = ret.y + ret.h - .5;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + m); ctx.lineTo(x0, y0); ctx.lineTo(x0 + m, y0);
        ctx.moveTo(x1 - m, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + m);
        ctx.moveTo(x0, y1 - m); ctx.lineTo(x0, y1); ctx.lineTo(x0 + m, y1);
        ctx.moveTo(x1 - m, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - m);
        ctx.stroke();
      }
      if (presenca > .02) {
        var ap = a1(presenca * .5 * Math.min(lum, 1.3));
        ctx.strokeStyle = 'rgba(' + cy + ',' + ap.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(S.px, 0); ctx.lineTo(S.px, 11);
        ctx.moveTo(W - 11, S.py); ctx.lineTo(W, S.py);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  dimensionar();
  B.add('campo', tick);
})();
