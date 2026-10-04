/* ==========================================================================
   O PLASMA — o núcleo dos AI Cores pequenos (o mini e as estações), na mesma
   linguagem da coroa do reator (js/nucleo/coroa.js), em canvas 2D (pedido
   do dono, 2026-10-03: "os núcleos devem transmitir a sensação de que estão
   transbordando de energia; isso vale para todos").

   - o NÚCLEO: miolo branco e casca ciano-clara com a borda FERVENDO;
   - os FILAMENTOS (o globo de plasma): fios ondulados do núcleo até o VIDRO
     (um anel), vagando em volta do seu lugar, com um arco aceso onde batem;
     quantos acendem depende da PRESSÃO;
   - o ESTOURO: os fios ROMPEM o vidro e seguem quebrados (raio que treme
     12× por segundo) até `fora`;
   - os ECOS (`ecos`): curvas de nível que fervem em volta do núcleo;
   - as PONTAS (`pontas`, o mini): no tamanho dele fio fino some (crítica:
     lia como alvo), então são pontas GROSSAS (2 px) e CURTAS, parecidas,
     espalhadas pela volta, piscando alternadas e furando o anel um pouco
     (uma longa sozinha lia como ponteiro; girando juntas, como hélice).
   Só traço nítido (o dono proíbe desfoque). Sem alocar por quadro.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var TAU = Math.PI * 2, PASSOS = 7, PONTOS_BORDA = 72;   /* 72: com 36 a borda lia como polígono (crítica) */

  function hash(n) { var x = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); }
  /* as mesmas cinco frequências do shader do reator (com três a borda lia como polígono) */
  function ferve(a, t, s) { return 0.45 * Math.sin(5 * a + s * t * 1.1) + 0.28 * Math.sin(7 * a - s * t * 1.7 + 1.3) + 0.15 * Math.sin(11 * a + s * t * 2.6 + 2.1) + 0.08 * Math.sin(17 * a - s * t * 4 + 0.4) + 0.05 * Math.sin(23 * a + s * t * 5.1 + 2.9); }

  function borda(ctx, x, y, r, amp, t, s, fase) {
    ctx.beginPath();
    for (var i = 0; i <= PONTOS_BORDA; i++) {
      var a = (i / PONTOS_BORDA) * TAU, rr = r * (1 + amp * ferve(a + fase, t, s));
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  /* op: { r (núcleo), vidro (raio do anel onde os fios batem), fora (até onde
     rompem no estouro), n (fios), pressao 0–1, estouro 0–1, t (s), alfa,
     cores: { AC, AC2, T1 } (strings "r,g,b"), semente } */
  function desenhar(ctx, x, y, op) {
    var C = op.cores, t = op.t, a0, i, j, v = op.alfa === undefined ? 1 : op.alfa;
    var pz = Math.min(1, op.pressao), es = Math.min(1, op.estouro || 0), sm = op.semente || 0;
    if (op.pontas) { pontas(ctx, x, y, op, pz, es, v); return; }
    /* os ecos: curvas de nível que fervem fora do núcleo, cada vez mais fracas */
    for (i = 1; i <= (op.ecos || 0); i++) {
      ctx.strokeStyle = 'rgba(' + C.AC2 + ',' + (0.5 * Math.pow(0.58, i - 1) * (0.6 + 0.4 * pz) * v).toFixed(3) + ')';
      ctx.lineWidth = 1;
      borda(ctx, x, y, op.r * (1 + (0.32 + 0.12 * pz) * i), 0.06, t, i % 2 ? -1 : 1, i * 2.3); ctx.stroke();
    }
    /* os filamentos */
    var acesos = Math.min(op.n, (0.4 + 0.75 * pz + es) * op.n);
    var alcance = op.vidro + (op.fora - op.vidro) * es;
    var tremor = Math.floor(t * 12);
    for (i = 0; i < op.n; i++) {
      var liga = Math.max(0, Math.min(1, acesos - i));
      if (liga < 0.01) continue;
      var h = hash(i + 1 + sm), h2 = hash(i + 11 + sm), sentido = i % 2 ? -1 : 1;
      a0 = ((i + 0.5 * h) / op.n) * TAU + sentido * (0.55 * Math.sin(t * (0.5 + 0.8 * h2) + h * TAU) + 0.25 * Math.sin(t * (1.4 + h) + h2 * TAU));
      var tremula = 0.7 + 0.3 * Math.sin(t * (14 + 11 * h) + h2 * TAU);
      ctx.strokeStyle = 'rgba(' + C.AC2 + ',' + (0.9 * liga * tremula * v).toFixed(3) + ')';
      ctx.lineWidth = op.largura || 1.1;
      ctx.beginPath();
      var largo = op.vidro * 0.09;
      for (j = 0; j <= PASSOS; j++) {
        var k = j / PASSOS, rj = op.r + (alcance - op.r) * k;
        var lado = largo * Math.sin(rj * 9 / op.vidro + t * (4.7 + 3 * h) + h * 9) * k;
        if (rj > op.vidro) lado += op.vidro * 0.16 * (hash(Math.floor(rj / (op.vidro * 0.14)) + h * 50 + tremor) - 0.5) * 2;
        var aj = a0 + lado / rj, px = x + Math.cos(aj) * rj, py = y + Math.sin(aj) * rj;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      /* o arco aceso no vidro, onde o fio bate (não no estouro: ali ele rompe) */
      if (es < 0.5) {
        var ladoV = largo * Math.sin(9 + t * (4.7 + 3 * h) + h * 9), av = a0 + ladoV / op.vidro, meia = 2.6 / op.vidro;
        ctx.strokeStyle = 'rgba(' + C.T1 + ',' + (0.95 * liga * tremula * v).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, op.vidro, av - meia, av + meia); ctx.stroke();
      }
    }
    /* o núcleo: casca ciano-clara e miolo branco, as bordas fervendo */
    ctx.fillStyle = 'rgba(' + C.AC2 + ',' + (0.85 * v).toFixed(3) + ')';
    borda(ctx, x, y, op.r, 0.055, t, 1, 0); ctx.fill();
    ctx.fillStyle = 'rgba(' + C.T1 + ',' + v.toFixed(3) + ')';
    borda(ctx, x, y, op.r * 0.6, 0.06, t, -1, 1.7); ctx.fill();
    ctx.lineWidth = 1;
  }

  /* o mini: pontas CURTAS e parecidas, espalhadas pela volta, piscando alternadas
     (uma ponta longa sozinha lia como ponteiro; girando juntas, como hélice);
     todas furam o anel um pouco; o núcleo com a borda que ferve */
  function pontas(ctx, x, y, op, pz, es, v) {
    var C = op.cores, t = op.t, i;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (i = 0; i < op.n; i++) {
      var h = hash(i + 7 + (op.semente || 0));
      /* ângulos irregulares (iguais e em número par liam como mira) */
      var a = ((i + 0.45 * h) / op.n) * TAU + 0.35 * Math.sin(t * 0.7 + h * TAU) + t * 0.25;
      var pisca = 0.5 + 0.5 * Math.sin(t * 6 + i * Math.PI);   /* vizinhas em fases opostas */
      var ate = op.vidro * (1.08 + 0.14 * pisca * (0.5 + pz) + 0.3 * es);
      ctx.strokeStyle = 'rgba(' + C.T1 + ',' + ((0.4 + 0.6 * pisca) * v).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * op.vidro * 0.72, y + Math.sin(a) * op.vidro * 0.72); ctx.lineTo(x + Math.cos(a) * ate, y + Math.sin(a) * ate); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = 'rgba(' + C.AC2 + ',' + (0.85 * v).toFixed(3) + ')';
    borda(ctx, x, y, op.r, 0.08, t, 1, 0); ctx.fill();
    ctx.fillStyle = 'rgba(' + C.T1 + ',' + v.toFixed(3) + ')';
    borda(ctx, x, y, op.r * 0.6, 0.07, t, -1, 1.7); ctx.fill();
    ctx.lineWidth = 1;
  }

  B.plasma = { desenhar: desenhar };
})();
