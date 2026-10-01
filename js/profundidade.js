/* ==========================================================================
   PROFUNDIDADE — planos de vidro projetados no canvas 2D.

   Substitui a camada three.js (670 KB vendorados, 163 KB gz por visita em
   desktop, quatro revisões de bugs de contexto WebGL). As cenas eram planos
   texturizados SEM luz, sombra ou refração: um quadrilátero projetado com
   mistura aditiva produz a mesma imagem. Custo: ~12 quadriláteros por frame,
   dentro do canvas que já existe. Roda também no toque, de leve.

   Cada `[data-cena]` é um retângulo de MEDIDA (nunca ocupa espaço). O spec
   descreve peças em dados; a projeção é perspectiva simples. O grupo gira
   devagar, inclina em direção ao ponteiro (só com ponteiro fino) e entra
   junto com o `.reveal` que o contém.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || !B.camada) return;
  var alvos = document.querySelectorAll('[data-cena]');
  if (!alvos.length) return;

  function face(pos, rot, tam, alfa, deriva, fase, tipo) {
    return { pos: pos, rot: rot, tam: tam, alfa: alfa, deriva: deriva || 0, fase: fase || 0, tipo: tipo || 'vidro' };
  }
  var SPECS = {
    /* o CUBO — painéis convergindo para um volume, com satélites à deriva */
    cubo: { camZ: 7.4, fov: 42, giro: .055, pecas: (function () {
      var p = [], L = 1.9, PI = Math.PI;
      var faces = [[0, 0, L, 0, 0, 0], [0, 0, -L, 0, PI, 0], [L, 0, 0, 0, PI / 2, 0], [-L, 0, 0, 0, -PI / 2, 0], [0, L, 0, -PI / 2, 0, 0], [0, -L, 0, PI / 2, 0, 0]];
      for (var i = 0; i < faces.length; i++) { var f = faces[i]; p.push(face([f[0], f[1], f[2]], [f[3], f[4], f[5]], [L * 2, L * 2], .62, .16, i * 1.1)); }
      var sat = [[-3.0, 1.3, 1.2, 1.1, .75], [2.9, -1.1, .6, 1.25, .85], [-2.3, -2.0, -1.5, .9, .62]];
      for (var s = 0; s < sat.length; s++) { var q = sat[s]; p.push(face([q[0], q[1], q[2]], [0, q[0] * .09, q[1] * .05], [q[3], q[4]], .48, .5, s * .9)); }
      return p;
    })() },
    /* os PAINÉIS — na periferia, onde aparecem pelas bordas da janela */
    paineis: { camZ: 8, fov: 46, giro: .014, pecas: (function () {
      var p = [], n = 4;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + .6;
        p.push(face([Math.cos(a) * 4.2, Math.sin(a) * 2.9, -1.2 - i * .9], [0, -Math.cos(a) * .3, Math.sin(a) * .12], [1.3 + (i % 2) * .5, .9 + (i % 3) * .3], .5 - i * .05, .5 + (i % 3) * .16, i * 1.1));
      }
      return p;
    })() },
    /* o PORTAL — pilares e verga de pedra, o vão aceso, lascas à deriva */
    portal: { camZ: 6.2, fov: 40, giro: 0, pecas: [
      face([-1.55, -.2, 0], [0, .16, 0], [.78, 3.5], 1, 0, 0, 'pedra'),
      face([1.55, -.2, 0], [0, -.16, 0], [.78, 3.5], 1, 0, 0, 'pedra'),
      face([0, 1.95, 0], [0, 0, 0], [3.9, .72], 1, 0, 0, 'pedra'),
      face([0, -.28, -.35], [0, 0, 0], [2.3, 3.32], .7, .1, 0, 'vao'),
      face([-2.9, 1.4, -1.6], [0, .4, .1], [.9, .6], .34, .7, 1.3),
      face([2.8, -1.1, -1.9], [0, -.4, -.1], [1.1, .7], .3, .6, 2.1)
    ] }
  };

  var cenas = [];
  for (var i = 0; i < alvos.length; i++) {
    var spec = SPECS[alvos[i].getAttribute('data-cena')];
    if (!spec) continue;
    cenas.push({ el: alvos[i], spec: spec, r: null, visivel: false, reveal: alvos[i].closest('.reveal'), entrada: 0, rotX: 0, posX: 0 });
  }
  if (!cenas.length) return;
  /* o CSS cede ao canvas só quando ele de fato desenha (css/componentes.css) */
  function ligarClasse() { document.body.classList.toggle('tem-profundidade', !B.reduced && !cedeu && !B.saveData); }
  ligarClasse();
  B.on('reduzir', ligarClasse);

  /* visível só quando perto da viewport; medido só em scroll/resize */
  var sujo = true;
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      for (var k = 0; k < ents.length; k++) for (var c = 0; c < cenas.length; c++) {
        if (cenas[c].el === ents[k].target) cenas[c].visivel = ents[k].isIntersecting;
      }
    }, { rootMargin: '120px' });
    for (var v = 0; v < cenas.length; v++) io.observe(cenas[v].el);
  } else for (var w = 0; w < cenas.length; w++) cenas[w].visivel = true;
  function marcar() { sujo = true; }
  window.addEventListener('scroll', marcar, { passive: true });
  document.addEventListener('transitionend', marcar, { passive: true });
  B.on('resize', marcar); B.on('remedir', marcar); B.on('entrada-pronta', marcar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(marcar);
  function medir() { for (var i = 0; i < cenas.length; i++) cenas[i].r = cenas[i].el.getBoundingClientRect(); sujo = false; }

  function revelado(c) {
    if (c.jaRevelado || !c.reveal) return true;
    if (c.reveal.classList.contains('is-in')) { c.jaRevelado = true; return true; }
    return false;
  }

  /* ---- a projeção ----
     Rotação do grupo (Y pelo tempo, X pelo ponteiro), depois de cada peça;
     perspectiva: x' = cx + x·f/(camZ − z). */
  var corner = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
  function projetar(c, pc, t, out) {
    var r = c.r, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var f = (r.height / 2) / Math.tan(c.spec.fov * Math.PI / 360);
    var gy = t * c.spec.giro, gx = c.rotX;
    var cgy = Math.cos(gy), sgy = Math.sin(gy), cgx = Math.cos(gx), sgx = Math.sin(gx);
    var rx = pc.rot[0], ry = pc.rot[1], rz = pc.rot[2];
    var cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
    var dy = pc.deriva ? Math.sin(t * .5 + pc.fase) * pc.deriva * .32 : 0;
    var zSum = 0;
    for (var k = 0; k < 4; k++) {
      var x = corner[k][0] * pc.tam[0], y = corner[k][1] * pc.tam[1], z = 0;
      /* rotação da peça: Z, X, Y */
      var x1 = x * czr - y * szr, y1 = x * szr + y * czr;
      var y2 = y1 * cxr - z * sxr, z2 = y1 * sxr + z * cxr;
      var x3 = x1 * cyr + z2 * syr, z3 = -x1 * syr + z2 * cyr;
      x3 += pc.pos[0] + c.posX; var y3 = y2 + pc.pos[1] + dy; z3 += pc.pos[2];
      /* rotação do grupo: Y depois X */
      var x4 = x3 * cgy + z3 * sgy, z4 = -x3 * sgy + z3 * cgy;
      var y5 = y3 * cgx - z4 * sgx, z5 = y3 * sgx + z4 * cgx;
      var d = c.spec.camZ - z5;
      if (d < .3) d = .3;
      var s = f / d;
      out[k * 2] = cx + x4 * s; out[k * 2 + 1] = cy - y5 * s;
      zSum += z5;
    }
    return zSum / 4;
  }

  var pts = new Float64Array(8);
  var ordem = [];
  var cedeu = false;
  B.camada('profundidade', function (ctx, S, paleta) {
    /* aparelho fraco ou orçamento no chão: o canvas cede e o CSS volta a ser
       o portal (regra 4 do CLAUDE.md). Só desce, nunca volta — alternar
       chamaria mais atenção que qualquer das duas pontas. */
    if (cedeu) return;
    /* sem B.weak aqui: 4 núcleos é metade dos celulares e qualquer notebook de
       entrada (inclusive a máquina do dono) — barrar por ficha técnica é
       palpite; o orçamento MEDIDO é quem decide (regra 5) */
    if (B.saveData || (S.t > 300 && S.budget < .35)) {
      cedeu = true;
      document.body.classList.remove('tem-profundidade');
      return;
    }
    var t = S.now * .001;
    var abre = 1 + S.pulse * .06 + S.singular * .12;
    var brilho = (1 + S.pulse * .5 + S.singular * .9) * paleta.boot;
    var anyEntrando = false;
    for (var e = 0; e < cenas.length; e++) if (cenas[e].visivel && cenas[e].entrada < .999 && revelado(cenas[e])) { anyEntrando = true; break; }
    if (sujo || anyEntrando) medir();

    for (var i = 0; i < cenas.length; i++) {
      var c = cenas[i];
      if (!c.visivel || !c.r) continue;
      c.entrada += ((revelado(c) ? 1 : 0) - c.entrada) * .07;
      if (c.entrada < .01) continue;
      if (c.r.bottom < 0 || c.r.top > S.h) continue;
      /* paralaxe de ponteiro: a cena inclina em direção ao cursor */
      if (B.fine && S.pointerOn) {
        var nx = S.px / S.w - .5, ny = S.py / S.h - .5;
        c.rotX += ((-ny * .16) - c.rotX) * .05;
        c.posX += ((nx * .5) - c.posX) * .05;
      }
      /* ordena as peças por profundidade (pedra oclui; vidro é aditivo) */
      ordem.length = 0;
      for (var j = 0; j < c.spec.pecas.length; j++) ordem.push(j);
      var profs = [];
      for (var q = 0; q < c.spec.pecas.length; q++) profs.push(projetar(c, c.spec.pecas[q], t, pts));
      ordem.sort(function (a, b) { return profs[a] - profs[b]; });

      for (var o = 0; o < ordem.length; o++) {
        var pc = c.spec.pecas[ordem[o]];
        projetar(c, pc, t, pts);
        /* escala do grupo (Pulso/Singular abrem a cena) em torno do centro */
        if (abre !== 1) {
          var ccx = c.r.left + c.r.width / 2, ccy = c.r.top + c.r.height / 2;
          for (var k = 0; k < 4; k++) { pts[k * 2] = ccx + (pts[k * 2] - ccx) * abre; pts[k * 2 + 1] = ccy + (pts[k * 2 + 1] - ccy) * abre; }
        }
        var al = pc.alfa * c.entrada;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.lineTo(pts[4], pts[5]); ctx.lineTo(pts[6], pts[7]); ctx.closePath();
        if (pc.tipo === 'pedra') {
          ctx.globalCompositeOperation = 'source-over';
          /* pedra como o resto do sistema: traço + preenchimento leve, não bloco opaco */
          ctx.fillStyle = 'rgba(24,24,32,' + (.5 * al).toFixed(3) + ')'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,' + (.16 * al).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
        } else if (pc.tipo === 'vao') {
          /* a soleira: a luz do vão assenta no chão como uma linha acesa */
          var sx0 = pts[6], sy0 = pts[7], sx1 = pts[4], sy1 = pts[5];
          var ext = (sx1 - sx0) * .45;
          var gc = ctx.createLinearGradient(sx0 - ext, sy0, sx1 + ext, sy1);
          gc.addColorStop(0, 'rgba(' + paleta.cy + ',0)');
          gc.addColorStop(.5, 'rgba(' + paleta.cy + ',' + (.55 * al * brilho).toFixed(3) + ')');
          gc.addColorStop(1, 'rgba(' + paleta.cy + ',0)');
          ctx.strokeStyle = gc; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(sx0 - ext, sy0 + 6); ctx.lineTo(sx1 + ext, sy1 + 6); ctx.stroke();
          var gh = ctx.createRadialGradient((sx0 + sx1) / 2, (sy0 + sy1) / 2 + 6, 0, (sx0 + sx1) / 2, (sy0 + sy1) / 2 + 6, (sx1 - sx0) * .9);
          gh.addColorStop(0, 'rgba(' + paleta.cy + ',' + (.16 * al * brilho).toFixed(3) + ')');
          gh.addColorStop(1, 'rgba(' + paleta.cy + ',0)');
          ctx.fillStyle = gh; ctx.fillRect(sx0 - ext, sy0 - 10, (sx1 - sx0) + ext * 2, 40);
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.lineTo(pts[4], pts[5]); ctx.lineTo(pts[6], pts[7]); ctx.closePath();
          var gv = ctx.createLinearGradient(pts[0], pts[1], pts[6], pts[7]);
          gv.addColorStop(0, 'rgba(' + paleta.cy + ',' + (.5 * al * brilho).toFixed(3) + ')');
          gv.addColorStop(.55, 'rgba(' + paleta.cy + ',' + (.06 * al * brilho).toFixed(3) + ')');
          gv.addColorStop(1, 'rgba(' + paleta.cy + ',' + (.4 * al * brilho).toFixed(3) + ')');
          ctx.fillStyle = gv; ctx.fill();
          ctx.strokeStyle = 'rgba(' + paleta.alta + ',' + (.5 * al * brilho).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke();
        } else {
          /* vidro aditivo: miolo quase escuro, moldura acesa, aresta de baixo mais forte */
          /* preenchimento sólido: gradiente por face custava ~14fps em
             rasterização por software e não se via (alfas de 1–6%) */
          ctx.fillStyle = 'rgba(' + paleta.alta + ',' + (.03 * al * brilho).toFixed(3) + ')';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(' + paleta.alta + ',' + (.2 * al * brilho).toFixed(3) + ')'; ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(' + paleta.cy + ',' + (.42 * al * brilho).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(pts[6], pts[7]); ctx.lineTo(pts[4], pts[5]); ctx.stroke();
        }
      }
    }
  });
})();
