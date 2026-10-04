/* ==========================================================================
   O NÚCLEO dos AI Cores pequenos (o mini e as estações), em canvas 2D, na
   mesma linguagem da coroa do reator (js/nucleo/coroa.js). Refeito em
   2026-10-04 junto com ela (dono: "sem deformações, redondinha e certinha,
   sem os raios, mas que BRILHE"); a versão de plasma (fios, bordas que
   ferviam) está no commit 627242d. O nome do arquivo ficou.

   - o NÚCLEO em degraus exatos: aro ciano-claro, ciano forte, ciano claro e
     o miolo branco, que cresce com a PRESSÃO e no ESTOURO;
   - o REFLEXO: um arco branco que corre na borda (a luz numa esfera);
   - o HALO em curvas de luz (`ecos`): a 1ª inteira, as outras em arcos que
     giram em sentidos alternados;
   - a EMISSÃO: anéis de 1 px que saem do halo até o VIDRO (`vidro`);
   - no ESTOURO, um anel a mais que abre até `fora`.
   Modo `pontas` (o mini, pequeno demais para curvas finas: lia como alvo):
   o núcleo, o reflexo e três arcos grossos girando, sem curvas de 1 px.
   Só traço nítido (o dono proíbe desfoque). Sem alocar por quadro.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var TAU = Math.PI * 2;

  function rgba(c, a) { return 'rgba(' + c + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')'; }
  function circulo(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }

  /* o núcleo em degraus e o reflexo; devolve o ângulo do reflexo */
  function nucleo(ctx, x, y, op, pz, es, v) {
    var C = op.cores, r = op.r;
    ctx.fillStyle = rgba(C.AC2, 0.6 * v); circulo(ctx, x, y, r); ctx.fill();
    ctx.fillStyle = rgba(C.AC, 0.95 * v); circulo(ctx, x, y, r * 0.84); ctx.fill();
    ctx.fillStyle = rgba(C.AC2, v); circulo(ctx, x, y, r * (0.64 + 0.06 * pz + 0.2 * es)); ctx.fill();
    ctx.fillStyle = rgba(C.T1, v); circulo(ctx, x, y, r * (0.4 + 0.14 * pz + 0.3 * es)); ctx.fill();
    /* a borda branca e o reflexo (um arco grosso por dentro, um fino por fora) */
    var ar = op.t * 0.42 + (op.semente || 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.T1, 0.9 * v); circulo(ctx, x, y, r); ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.strokeStyle = rgba(C.T1, 0.85 * v);
    ctx.beginPath(); ctx.arc(x, y, r * 0.92, ar - 0.6, ar + 0.6); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.T1, 0.6 * v);
    ctx.beginPath(); ctx.arc(x, y, r * 1.12 + 0.5, ar - 0.5, ar + 0.5); ctx.stroke();
    return ar;
  }

  /* op: { r (núcleo), vidro (até onde a emissão vai), fora (o anel do
     estouro), pressao 0–1, estouro 0–1, t (s, uma fase que só cresce), alfa,
     ecos (curvas do halo), cores: { AC, AC2, T1 } ("r,g,b"), semente, pontas } */
  function desenhar(ctx, x, y, op) {
    var C = op.cores, t = op.t, v = op.alfa === undefined ? 1 : op.alfa, i, k;
    var pz = Math.min(1, op.pressao), es = Math.min(1, op.estouro || 0);
    if (op.pontas) { pontas(ctx, x, y, op, pz, es, v); return; }
    ctx.lineWidth = 1;
    /* a emissão: anéis que saem do halo até o vidro */
    var de = op.r * 1.9;
    for (i = 0; i < 2; i++) {
      var f = ((t * (0.3 + 0.25 * pz) + i / 2) % 1 + 1) % 1;
      ctx.strokeStyle = rgba(C.AC2, (1 - f) * (1 - f) * Math.min(1, f / 0.12) * (0.35 + 0.45 * pz) * v);
      circulo(ctx, x, y, de + (op.vidro - de) * f); ctx.stroke();
    }
    /* o halo: a 1ª curva inteira, as outras em arcos girando em sentidos alternados */
    var n = op.ecos || 2;
    for (i = 1; i <= n; i++) {
      var ri = op.r * (1 + 0.28 * i * (1 + 0.25 * pz) + 0.15 * i * es);
      ctx.strokeStyle = rgba(i === 1 ? C.AC2 : C.AC, 0.62 * Math.pow(0.7, i - 1) * (0.6 + 0.4 * pz) * v);
      if (i === 1) { circulo(ctx, x, y, ri); ctx.stroke(); continue; }
      var gira = (i % 2 ? -1 : 1) * t * 0.6 + i * 1.9, partes = i + 1;
      ctx.beginPath();
      for (k = 0; k < partes; k++) { var a0 = gira + k * TAU / partes; ctx.moveTo(x + Math.cos(a0) * ri, y + Math.sin(a0) * ri); ctx.arc(x, y, ri, a0, a0 + TAU / partes * 0.34); }
      ctx.stroke();
    }
    /* o estouro: um anel que abre até `fora` */
    if (es > 0.02) {
      ctx.strokeStyle = rgba(C.T1, 0.8 * es * v);
      circulo(ctx, x, y, op.vidro + (op.fora - op.vidro) * (1 - es)); ctx.stroke();
    }
    nucleo(ctx, x, y, op, pz, es, v);
    ctx.lineWidth = 1;
  }

  /* o mini: três arcos grossos girando em volta do núcleo (sem curvas de 1 px:
     no tamanho dele liam como alvo); abrem no estouro */
  function pontas(ctx, x, y, op, pz, es, v) {
    var C = op.cores, t = op.t, ra = op.vidro * (0.92 + 0.12 * pz + 0.3 * es);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(C.AC2, (0.55 + 0.4 * pz) * v);
    ctx.beginPath();
    for (var k = 0; k < 3; k++) { var a0 = t * 0.9 + k * TAU / 3; ctx.moveTo(x + Math.cos(a0) * ra, y + Math.sin(a0) * ra); ctx.arc(x, y, ra, a0, a0 + 0.95); }
    ctx.stroke();
    ctx.lineCap = 'butt';
    nucleo(ctx, x, y, op, pz, es, v);
    ctx.lineWidth = 1;
  }

  B.plasma = { desenhar: desenhar };
})();
