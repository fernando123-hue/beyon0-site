/* ==========================================================================
   A CONSTELAÇÃO DO REATOR — o fundo do hero do Hub (pedido do dono,
   2026-10-02: "tire os anéis, modifique o fundo do hero completamente para
   agregar ainda mais valor no AI Core").

   Um módulo da rede (js/rede.js), só no Hub: duas órbitas de 12 nós
   ALINHADAS aos 12 raios do reator (a geometria dele continuando para fora),
   presas aos 12 pontos de entrada dos raios. A cada fôlego uma onda de
   sinais vai da órbita de fora à de dentro e dela ao portal, guiada pela
   FASE (sincronia em qualquer fps), e chega no começo do fôlego, quando a
   energia entra nos raios: a rede é a fonte da energia que o reator puxa.
   Na chegada, a passagem do bastão (faíscas radiais nos pontos de entrada).

   Registra-se em B.redeReator; a rede chama quando o reator está na tela
   (B.nucleo, publicado por js/nucleo/boot.js). Tipos de nó: 2 órbita, 3
   portal (as regras de ligação deles estão em rede.js).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;

  var TAU = Math.PI * 2;
  var ORBITA = [1.4, 1.82];   /* raios das duas órbitas, em raios de entrada do reator */
  var FAISCA = 0.32;          /* s: a passagem do bastão no portal */

  /* `api` (de rede.js): ctx, cores, lancar(de, para, dura, forcado, luz, idx, x0) */
  B.redeReator = function (api) {
    var ctx = api.ctx, AC = api.cores.AC, AC2 = api.cores.AC2, AC3 = api.cores.AC3;
    var orb1 = [], orb2 = [], portal = [];
    var luzRaio = [], luzTrelica = [], faiscas = [];   /* s de luz restantes em cada trecho / faísca */
    for (var o = 0; o < 12; o++) {
      luzRaio.push(0); luzTrelica.push(0); faiscas.push(0);
      orb1.push({ i: o, x: 0, y: 0, tipo: 2, k: 1 });
      orb2.push({ i: o, x: 0, y: 0, tipo: 2, k: 1 });
      portal.push({ i: o, x: 0, y: 0, tipo: 3, k: 1 });
    }

    function posicionar(nu, t, folego) {
      var encolhe = 1 - 0.06 * folego;   /* na inspiração a constelação é puxada para dentro */
      for (var i = 0; i < 12; i++) {
        var a = nu.giro + i * (TAU / 12), b = a + TAU / 24, onda = Math.sin(t * 0.5 + i * 1.7) * 0.03;
        portal[i].x = nu.cx + Math.cos(a) * nu.r * nu.sx;
        portal[i].y = nu.cy - Math.sin(a) * nu.r * nu.sy;
        var r1 = ORBITA[0] * nu.r * encolhe * (1 + onda), r2 = ORBITA[1] * nu.r * encolhe * (1 - onda);
        orb1[i].x = nu.cx + Math.cos(a) * r1 * nu.sx;
        orb1[i].y = nu.cy - Math.sin(a) * r1 * nu.sy;
        orb2[i].x = nu.cx + Math.cos(b) * r2 * nu.sx;
        orb2[i].y = nu.cy - Math.sin(b) * r2 * nu.sy;
      }
    }

    function passo(dt) {
      for (var w = 0; w < 12; w++) {
        luzRaio[w] = Math.max(0, luzRaio[w] - dt);
        luzTrelica[w] = Math.max(0, luzTrelica[w] - dt);
        faiscas[w] = Math.max(0, faiscas[w] - dt);
      }
    }

    /* a onda do fôlego: da órbita de fora para a de dentro e dela para o
       portal, chegando com o lampejo (começo do fôlego). `antes`: a fase do
       quadro anterior (quem guarda é a rede) */
    function ondas(x, antes) {
      if (antes < 0.78 && x >= 0.78) for (var i = 0; i < 12; i++) api.lancar(orb2[i], orb1[i], 0.75, true, luzTrelica, i, 0.78);
      if (antes < 0.9 && x >= 0.9) for (var j = 0; j < 12; j++) api.lancar(orb1[j], portal[j], 0.7, true, luzRaio, j, 0.9);
    }

    /* um sinal da onda chegou: no portal, a faísca */
    function chegou(s) { if (s.para.tipo === 3) faiscas[s.para.i] = FAISCA; }

    /* os raios do reator continuando para fora (portal → órbita de dentro) e
       a treliça entre as órbitas, em ciano profundo; parada, calma (abaixo do
       teto da rede); a luz ANDA nela: cada trecho acende quando a onda passa
       e apaga em 0,3 s */
    function desenhar(folego) {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(' + AC3 + ',' + (0.18 * (1 + 0.3 * folego)).toFixed(3) + ')';
      ctx.beginPath();
      for (var i = 0; i < 12; i++) {
        var p = portal[i], a = orb1[i], b = orb2[i], c = orb2[(i + 11) % 12];
        ctx.moveTo(p.x, p.y); ctx.lineTo(a.x, a.y);
        ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
      for (var w = 0; w < 12; w++) {
        var lr = luzRaio[w] / 0.3, lt = luzTrelica[w] / 0.3;
        if (lr > 0.01) { ctx.strokeStyle = 'rgba(' + AC + ',' + (0.4 * lr).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(portal[w].x, portal[w].y); ctx.lineTo(orb1[w].x, orb1[w].y); ctx.stroke(); }
        if (lt > 0.01) { ctx.strokeStyle = 'rgba(' + AC + ',' + (0.4 * lt).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(orb2[w].x, orb2[w].y); ctx.lineTo(orb1[w].x, orb1[w].y); ctx.stroke(); }
      }
      ctx.fillStyle = 'rgba(' + AC2 + ',0.75)';
      ctx.beginPath();
      for (var j = 0; j < 12; j++) {
        ctx.moveTo(orb1[j].x + 1.5, orb1[j].y); ctx.arc(orb1[j].x, orb1[j].y, 1.5, 0, TAU);
        ctx.moveTo(orb2[j].x + 1.2, orb2[j].y); ctx.arc(orb2[j].x, orb2[j].y, 1.2, 0, TAU);
      }
      ctx.fill();
    }

    /* depois da borracha do texto: nada cruza a face do reator (a energia só
       entra pelos 12 pontos) e as faíscas por cima */
    function depoisDaBorracha(nu) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(nu.cx, nu.cy, nu.r * 0.97 * nu.sx, nu.r * 0.97 * nu.sy, 0, 0, TAU);
      ctx.fillStyle = '#000'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      /* a faísca: um traço alinhado ao raio, nascendo no ponto de entrada e
         crescendo para fora; forte nos primeiros 100 ms (AC), depois AC2
         apagando; e um ponto branco mais breve (150 ms) */
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (var i = 0; i < 12; i++) {
        if (faiscas[i] <= 0) continue;
        var k = 1 - faiscas[i] / FAISCA, e = 1 - (1 - k) * (1 - k), p = portal[i];
        var dx = p.x - nu.cx, dy = p.y - nu.cy, d = Math.hypot(dx, dy) || 1, l = 3 + 9 * e;
        ctx.strokeStyle = faiscas[i] > FAISCA - 0.1 ? 'rgba(' + AC + ',0.9)' : 'rgba(' + AC2 + ',' + (0.75 * (1 - k)).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (dx / d) * l, p.y + (dy / d) * l); ctx.stroke();
        if (k < 0.6) { ctx.fillStyle = 'rgba(242,244,244,' + (0.9 * (1 - k / 0.6)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 1, 0, TAU); ctx.fill(); }
      }
      ctx.lineCap = 'butt';
    }

    /* a órbita de fora conversa com a rede; a de dentro só com o reator */
    return { posicionar: posicionar, passo: passo, ondas: ondas, chegou: chegou, desenhar: desenhar, depoisDaBorracha: depoisDaBorracha, pontosDaRede: orb2 };
  };
})();
