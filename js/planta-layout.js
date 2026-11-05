/* PLANTA VIVA: o LAYOUT. Plano já validado -> geometria em px (caixas, pontas, rotas, rótulos). PURO (sem DOM nem relógio), ES5:
   window.BZPlantaLayout na tela, CommonJS no Node. H === alturaReservada(largura), SEMPRE: a altura só depende da largura (nunca do plano nem
   da fonte), o quadro nasce com ela e o desenho se acomoda (passo 0: o CLS vinha de o JS dar a altura depois). Paisagem (>= LARGURA_PAISAGEM):
   456 px; retrato: a maior altura entre todas as formas válidas, e os vãos esticam para o plano menor. Tudo em px (nunca ch nem em).
   laco = pista de duas fileiras na paisagem; bifurca = ramos em duas alturas; espinha = tronco com satélites em cima e embaixo.
   Ids só viram chave de objeto sem protótipo. A ordem da luz (ord) e a numeração (num) saem daqui. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZPlantaLayout = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var LARGURA_PAISAGEM = 1040;
  var ALTURA_PAISAGEM = 456;
  var LARGURA_RETRATO_MAX = 480;
  var LARGURA_MIN = 280;
  var PAD = 6;
  var CR = 24, LR = 20;
  var VG_MIN = 18, VG_MAX = 40;

  var criar = function () { return Object.create(null); };
  var mesclar = function (a, b) { var o = {}, k; for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k]; return o; };

  var topo = function (n, dx) { return [n.x + (dx == null ? n.w / 2 : dx), n.y]; };
  var base = function (n, dx) { return [n.x + (dx == null ? n.w / 2 : dx), n.y + n.h]; };
  var esq = function (n) { return [n.x, n.y + n.h / 2]; };
  var dir = function (n) { return [n.x + n.w, n.y + n.h / 2]; };
  var igual = function (a, b) { return Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5; };

  function limpar(pts) {
    var o = [];
    pts.forEach(function (p) { if (!o.length || !igual(o[o.length - 1], p)) o.push(p); });
    return o.filter(function (p, i) {
      if (i === 0 || i === o.length - 1) return true;
      var a = o[i - 1], c = o[i + 1];
      return !((Math.abs(a[0] - p[0]) < 0.5 && Math.abs(p[0] - c[0]) < 0.5) || (Math.abs(a[1] - p[1]) < 0.5 && Math.abs(p[1] - c[1]) < 0.5));
    });
  }
  var zV = function (a, b) { return Math.abs(a[0] - b[0]) < 0.5 ? [a, b] : [a, [a[0], (a[1] + b[1]) / 2], [b[0], (a[1] + b[1]) / 2], b]; };

  function nova(W) { return { W: W, H: 0, nos: [], rotas: [], rots: [], mapa: criar() }; }
  function no(g, est, x, y, w, h, modo, extra) {
    var n = { id: est.id, est: est, x: x, y: y, w: w, h: h, modo: modo, decisao: !!est.decisao, ponta: null };
    n.ic = modo === 'lado' ? [11, (h - 40) / 2, 1] : [11, 34, 1];
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) n[k] = extra[k];
    g.nos.push(n); g.mapa[n.id] = n; return n;
  }
  function ponta(g, id, x, y, d) {
    var n = { id: id, est: null, x: x, y: y, w: d, h: d, modo: 'ponta', ponta: id, decisao: false };
    g.nos.push(n); g.mapa[id] = n; return n;
  }
  function rota(g, de, a, pts, passo, o) {
    var r = mesclar({ id: de + '>' + a, de: de, a: a, pts: limpar(pts), passo: passo, atraso: 0, alvo: a, tipo: 'tronco' }, o || {});
    g.rotas.push(r); return r;
  }
  function chamadas(core, led, trunkTop, W) {
    var h = trunkTop - 12;
    core.rot = { x: core.x, y: 4, w: 130, h: h, al: 'l', topo: true }; core.guia = core.y - (trunkTop - 6);
    led.rot = { x: Math.max(0, led.x + led.w - 150), y: 4, w: Math.min(150, W), h: h, al: 'r', topo: true }; led.guia = led.y - (trunkTop - 6);
  }
  var icTopo = function (w) { return w < 150 ? { ic: [10, 28, 0.75] } : null; };
  var alturaLado = function (W) { return W < 340 ? 80 : 68; };

  function copia(e) { var o = {}, k; for (k in e) if (Object.prototype.hasOwnProperty.call(e, k)) o[k] = e[k]; return o; }
  function chegadaDe(plano) {
    return { id: 'chegada', tipo: 'chegada', verbo: 'Chega', titulo: plano.chegada.titulo, frase: plano.chegada.frase, n: plano.chegada.origens.length };
  }
  function estruturar(plano) {
    if (!plano || typeof plano !== 'object' || !Array.isArray(plano.etapas) || !plano.chegada || !plano.fim || !Array.isArray(plano.chegada.origens)) return null;
    var cheg = chegadaDe(plano), et = plano.etapas.map(copia), E = { topologia: plano.topologia, fim: plano.fim }, i;
    if (et.length < 2) return null;
    if (plano.topologia === 'laco') {
      E.ret = et[et.length - 1]; E.st = [cheg].concat(et.slice(0, et.length - 1)); E.rotulo = typeof plano.rotulo_retorno === 'string' ? plano.rotulo_retorno : '';
      return E;
    }
    if (plano.topologia === 'bifurca') {
      var ent = [], r0 = [], r1 = [], sai = [], viuRamo = false;
      for (i = 0; i < et.length; i++) {
        if (et[i].ramo === 0) { r0.push(et[i]); viuRamo = true; } else if (et[i].ramo === 1) { r1.push(et[i]); viuRamo = true; } else if (viuRamo) sai.push(et[i]); else ent.push(et[i]);
      }
      if (!ent.length || !r0.length || !r1.length || !sai.length) return null;
      E.ent = [cheg].concat(ent); E.r0 = r0; E.r1 = r1; E.sai = sai;
      E.rotulos = Array.isArray(plano.rotulos_ramos) ? [String(plano.rotulos_ramos[0] || ''), String(plano.rotulos_ramos[1] || '')] : ['', ''];
      return E;
    }
    if (plano.topologia === 'espinha') {
      var tronco = [], porId = criar(), sats = [];
      for (i = 0; i < et.length; i++) { if (typeof et[i].satelite_de === 'string') sats.push(et[i]); else { et[i].sat = []; tronco.push(et[i]); porId[et[i].id] = et[i]; } }
      for (i = 0; i < sats.length; i++) { var h = porId[sats[i].satelite_de]; if (h && h.sat.length === 0) h.sat.push(sats[i]); else return null; }
      if (!tronco.length) return null;
      E.st = [cheg].concat(tronco);
      return E;
    }
    return null;
  }

  function lacoRetrato(E, W, VG) {
    var S = E.st, n = S.length, bw = Math.min(250, W - 70), xL = 4, xR = W - 24 - bw, rail = W - 10, BH = alturaLado(W), CRr = 24, LRr = 22;
    var g = nova(W), cx = xL + bw / 2, i, y;
    var core = ponta(g, 'nucleo', cx - CRr, 4, 2 * CRr); core.rot = { x: 4, y: 4 + CRr - 14, w: cx - CRr - 14, al: 'r' };
    y = core.y + 2 * CRr + VG;
    var st = S.map(function (est, k) { var b = no(g, est, k % 2 ? xR : xL, y, bw, BH, 'lado'); y += BH + VG; return b; });
    var led = ponta(g, 'led', xR + bw / 2 - LRr, y, 2 * LRr); led.est = E.fim;
    led.rot = { x: 4, y: led.y + LRr - 14, w: led.x - 18, al: 'r' };
    var ret = no(g, E.ret, xR, led.y + 2 * LRr + VG, bw, BH, 'lado');
    rota(g, 'nucleo', st[0].id, zV(base(core), topo(st[0])), 0);
    for (i = 1; i < n; i++) rota(g, st[i - 1].id, st[i].id, zV(base(st[i - 1]), topo(st[i])), i);
    rota(g, st[n - 1].id, 'led', zV(base(st[n - 1]), topo(led)), n);
    rota(g, 'led', ret.id, zV(base(led), topo(ret)), n + 1, { tipo: 'retorno' });
    rota(g, ret.id, 'nucleo', [dir(ret), [rail, dir(ret)[1]], [rail, core.y + CRr], [core.x + 2 * CRr, core.y + CRr]], n + 2, { tipo: 'retorno', alvo: 'nucleo' });
    if (E.rotulo) g.rots.push({ x: led.x + 2 * LRr + 12, y: led.y + LRr - 8, w: rail - 12 - (led.x + 2 * LRr + 12), h: 16, txt: E.rotulo, al: 'l' });
    g.H = ret.y + ret.h + 14;
    return g;
  }

  function bifurcaRetrato(E, W, VG) {
    var ent = E.ent, r0 = E.r0, r1 = E.r1, sai = E.sai, nR = Math.max(r0.length, r1.length), i, j;
    var cw = Math.min(300, W - 24), xC = (W - cw) / 2, BH = alturaLado(W), BT = 96, CRr = 24, LRr = 22, cx = W / 2;
    var colW = Math.floor((W - 8 - 12) / 2), xl = 4, xr = W - 4 - colW, OFF = 20, g = nova(W), y;
    var core = ponta(g, 'nucleo', cx - CRr, 4, 2 * CRr); core.rot = { x: cx + CRr + 12, y: 4 + CRr - 14, w: W - (cx + CRr + 12) - 4, al: 'l' };
    y = core.y + 2 * CRr + VG;
    var Ec = ent.map(function (est) { var b = no(g, est, xC, y, cw, BH, 'lado'); y += BH + VG; return b; });
    var conv = Ec[Ec.length - 1], y0 = conv.y + conv.h + 52;
    var ramo = function (lista, x) { return lista.map(function (est, k) { return no(g, est, x, y0 + k * (BT + VG), colW, BT, 'topo', { compacto: true, ic: [colW - 28, 8, 0.5] }); }); };
    var A = ramo(r0, xl), B = ramo(r1, xr);
    var fundo = y0 + nR * BT + (nR - 1) * VG, yPm = fundo + 22;
    y = fundo + 44;
    var M = sai.map(function (est) { var b = no(g, est, xC, y, cw, BH, 'lado'); y += BH + VG; return b; });
    var led = ponta(g, 'led', xC + 8, y, 2 * LRr); led.est = E.fim; led.rot = { x: led.x + 2 * LRr + 12, y: led.y + LRr - 14, w: W - (led.x + 2 * LRr + 12) - 4, al: 'l' };
    var p = 0;
    rota(g, 'nucleo', Ec[0].id, [base(core), topo(Ec[0])], p++);
    for (i = 1; i < Ec.length; i++) rota(g, Ec[i - 1].id, Ec[i].id, [base(Ec[i - 1]), topo(Ec[i])], p++);
    var pF = p, myF = conv.y + conv.h + 14;
    [A, B].forEach(function (lista, b) {
      var x = lista[0].x + OFF;
      rota(g, conv.id, lista[0].id, [base(conv), [cx, myF], [x, myF], [x, lista[0].y]], pF, { tipo: 'ramo', atraso: b * 0.1 });
      for (j = 1; j < lista.length; j++) rota(g, lista[j - 1].id, lista[j].id, [base(lista[j - 1], OFF), topo(lista[j], OFF)], pF + j, { tipo: 'ramo' });
    });
    var pM = pF + nR, prop = M[0];
    [A, B].forEach(function (lista, b) {
      var u = lista[lista.length - 1], x = u.x + OFF;
      rota(g, u.id, prop.id, [base(u, OFF), [x, yPm], [cx, yPm], topo(prop)], pM, { tipo: 'ramo', atraso: b * 0.08 });
    });
    for (i = 1; i < M.length; i++) rota(g, M[i - 1].id, M[i].id, [base(M[i - 1]), topo(M[i])], pM + i);
    rota(g, M[M.length - 1].id, 'led', zV(base(M[M.length - 1]), topo(led)), pM + M.length);
    [[xl, 0], [xr, 1]].forEach(function (c) {
      if (E.rotulos[c[1]]) g.rots.push({ x: c[0] + OFF + 8, y: y0 - 36, w: colW - OFF - 12, h: 32, txt: E.rotulos[c[1]], al: 'l', ramo: true });
    });
    g.H = led.y + 2 * LRr + 20;
    return g;
  }

  function espinhaRetrato(E, W, VG) {
    var S = E.st, n = S.length, RX = 24, CRr = 22, LRr = 22, bx = 54, bw = W - bx - 4, BH = alturaLado(W), SH = BH - 4, SG = 12, g = nova(W), y;
    var core = ponta(g, 'nucleo', RX - CRr, 4, 2 * CRr); core.rot = { x: RX + CRr + 12, y: 4 + CRr - 14, w: W - RX - CRr - 16, al: 'l' };
    y = core.y + 2 * CRr + VG;
    var prev = [RX, core.y + 2 * CRr], ant = null;
    S.forEach(function (est, i) {
      var b = no(g, est, bx, y, bw, BH, 'lado'), my = b.y + BH / 2;
      rota(g, i ? S[i - 1].id : 'nucleo', est.id, (ant ? [esq(ant), [RX, esq(ant)[1]]] : [prev]).concat([[RX, my], [bx, my]]), i);
      prev = [RX, my]; ant = b;
      y += BH;
      (est.sat || []).forEach(function (s) {
        var sx = bx + 30, sy = y + SG, sn = no(g, s, sx, sy, W - sx - 4, SH, 'lado');
        if (s.laco) {
          rota(g, est.id, s.id, [[bx + 26, b.y + BH], [bx + 26, sy + 22], [sx, sy + 22]], i + 1, { tipo: 'sat', atraso: 0.1 });
          rota(g, s.id, est.id, [[sx, sy + SH - 22], [bx + 12, sy + SH - 22], [bx + 12, b.y + BH]], i + 2, { tipo: 'sat', alvo: null, atraso: 0.05 });
        } else {
          rota(g, est.id, s.id, [[bx + 16, b.y + BH], [bx + 16, sy + SH / 2], [sx, sy + SH / 2]], i + 1, { tipo: 'sat', atraso: 0.1 });
        }
        void sn;
        y += SG + SH;
      });
      y += VG;
    });
    var led = ponta(g, 'led', RX - LRr, y, 2 * LRr); led.est = E.fim; led.rot = { x: RX + LRr + 12, y: led.y + LRr - 14, w: W - RX - LRr - 16, al: 'l' };
    rota(g, S[n - 1].id, 'led', [esq(ant), [RX, esq(ant)[1]], [RX, led.y]], n);
    g.H = led.y + 2 * LRr + 20;
    return g;
  }

  var RETRATOS = { laco: lacoRetrato, bifurca: bifurcaRetrato, espinha: espinhaRetrato };

  function colunas(W, fixo, cols, wMax, gMin, gMax) {
    var avail = W - 2 * PAD, w = Math.min(wMax, Math.floor((avail - fixo - (cols + 1) * gMin) / cols));
    var G = Math.min(gMax, Math.floor((avail - fixo - cols * w) / (cols + 1)));
    var total = fixo + cols * w + (cols + 1) * G;
    return { w: w, G: G, x0: PAD + Math.floor((avail - total) / 2) };
  }

  function lacoPaisagem(E, W) {
    var S = E.st, total = S.length + 1, k = Math.ceil(total / 2), BH = 144, y1 = 56, y2 = y1 + BH + 92, g = nova(W), i;
    var c = colunas(W, 2 * CR + 2 * LR, k, 176, 26, 40), w = c.w, G = c.G, x0 = c.x0;
    var colX = function (q) { return x0 + 2 * CR + G + q * (w + G); };
    var core = ponta(g, 'nucleo', x0, y1 + BH / 2 - CR, 2 * CR);
    var cima = S.slice(0, k).map(function (est, q) { return no(g, est, colX(q), y1, w, BH, 'topo', icTopo(w)); });
    var abaixo = S.slice(k).concat([E.ret]).map(function (est, q) { return no(g, est, colX(k - 1 - q), y2, w, BH, 'topo', icTopo(w)); });
    var ledcy = (y1 + y2 + BH) / 2, led = ponta(g, 'led', colX(k - 1) + w + G, ledcy - LR, 2 * LR); led.est = E.fim;
    core.rot = { x: core.x, y: 4, w: 130, h: y1 - 12, al: 'l', topo: true }; core.guia = core.y - (y1 - 6);
    led.rot = { x: led.x - 12 - 170, y: ledcy - 16, w: 170, al: 'r' };
    var ledcx = led.x + LR, ret = abaixo[abaixo.length - 1], railX = core.x + CR;
    rota(g, 'nucleo', cima[0].id, [dir(core), esq(cima[0])], 0);
    for (i = 1; i < cima.length; i++) rota(g, cima[i - 1].id, cima[i].id, [dir(cima[i - 1]), esq(cima[i])], i);
    var ult = cima[cima.length - 1], p = cima.length;
    rota(g, ult.id, 'led', [dir(ult), [ledcx, dir(ult)[1]], topo(led)], p++);
    rota(g, 'led', abaixo[0].id, [base(led), [ledcx, abaixo[0].y + BH / 2], dir(abaixo[0])], p++, { tipo: 'retorno' });
    for (i = 1; i < abaixo.length; i++) rota(g, abaixo[i - 1].id, abaixo[i].id, [esq(abaixo[i - 1]), dir(abaixo[i])], p++, { tipo: 'retorno' });
    rota(g, ret.id, 'nucleo', [esq(ret), [railX, esq(ret)[1]], [railX, core.y + 2 * CR]], p, { tipo: 'retorno', alvo: 'nucleo' });
    if (E.rotulo) g.rots.push({ x: railX + 14, y: ledcy - 8, w: 170, h: 16, txt: E.rotulo, al: 'l' });
    g.H = ALTURA_PAISAGEM;
    return g;
  }

  function bifurcaPaisagem(E, W) {
    var ent = E.ent, r0 = E.r0, r1 = E.r1, sai = E.sai, nR = Math.max(r0.length, r1.length), nC = ent.length + nR + sai.length, BH = 140, g = nova(W), i, j;
    var c = colunas(W, 2 * CR + 2 * LR, nC, 164, 12, 30), w = c.w, G = c.G, x0 = c.x0;
    var colX = function (q) { return x0 + 2 * CR + G + q * (w + G); };
    var yT = 62, yB = yT + BH + 46, yM = (yT + yB + BH) / 2, trunkTop = yM - BH / 2;
    var core = ponta(g, 'nucleo', x0, yM - CR, 2 * CR);
    var Ec = ent.map(function (est, q) { return no(g, est, colX(q), trunkTop, w, BH, 'topo', icTopo(w)); });
    var ramo = function (lista, yTop) { return lista.map(function (est, q) { return no(g, est, colX(ent.length + q), yTop, w, BH, 'topo', icTopo(w)); }); };
    var A = ramo(r0, yT), B = ramo(r1, yB), mCol = ent.length + nR;
    var M = sai.map(function (est, q) { return no(g, est, colX(mCol + q), trunkTop, w, BH, 'topo', icTopo(w)); });
    var led = ponta(g, 'led', M[M.length - 1].x + w + G, yM - LR, 2 * LR); led.est = E.fim;
    chamadas(core, led, trunkTop, W);
    var p = 0;
    rota(g, 'nucleo', Ec[0].id, [dir(core), esq(Ec[0])], p++);
    for (i = 1; i < Ec.length; i++) rota(g, Ec[i - 1].id, Ec[i].id, [dir(Ec[i - 1]), esq(Ec[i])], p++);
    var conv = Ec[Ec.length - 1], pF = p, ex0 = dir(conv)[0] + G / 2;
    [[A, yT], [B, yB]].forEach(function (par, b) {
      var lista = par[0], yc = par[1] + BH / 2, a = dir(conv);
      rota(g, conv.id, lista[0].id, [a, [ex0, a[1]], [ex0, yc], esq(lista[0])], pF, { tipo: 'ramo', atraso: b * 0.1 });
      for (j = 1; j < lista.length; j++) rota(g, lista[j - 1].id, lista[j].id, [dir(lista[j - 1]), esq(lista[j])], pF + j, { tipo: 'ramo' });
    });
    var prop = M[0], pM = pF + nR;
    [[A, yT], [B, yB]].forEach(function (par, b) {
      var u = par[0][par[0].length - 1], yc = par[1] + BH / 2, ex = esq(prop)[0] - G / 2;
      rota(g, u.id, prop.id, [dir(u), [ex, yc], [ex, yM], esq(prop)], pM, { tipo: 'ramo', atraso: b * 0.08 });
    });
    for (i = 1; i < M.length; i++) rota(g, M[i - 1].id, M[i].id, [dir(M[i - 1]), esq(M[i])], pM + i);
    rota(g, M[M.length - 1].id, 'led', [dir(M[M.length - 1]), esq(led)], pM + M.length);
    var wr = Math.min(w * 2 + G, W - colX(ent.length) - PAD);
    if (E.rotulos[0]) g.rots.push({ x: colX(ent.length), y: yT - 22, w: wr, h: 16, txt: E.rotulos[0], al: 'l', ramo: true });
    if (E.rotulos[1]) g.rots.push({ x: colX(ent.length), y: yB + BH + 8, w: wr, h: 16, txt: E.rotulos[1], al: 'l', ramo: true });
    g.H = ALTURA_PAISAGEM;
    return g;
  }

  function espinhaPaisagem(E, W) {
    var S = E.st, n = S.length, BH = 140, SH = 100, GV = 22, g = nova(W), i;
    var c = colunas(W, 2 * CR + 2 * LR, n, 176, 14, 34), w = c.w, G = c.G, x0 = c.x0;
    var y0 = Math.floor((ALTURA_PAISAGEM - BH) / 2), cy = y0 + BH / 2;
    var core = ponta(g, 'nucleo', x0, cy - CR, 2 * CR);
    var st = S.map(function (est, q) { return no(g, est, x0 + 2 * CR + G + q * (w + G), y0, w, BH, 'topo', icTopo(w)); });
    var led = ponta(g, 'led', st[n - 1].x + w + G, cy - LR, 2 * LR); led.est = E.fim;
    chamadas(core, led, y0, W);
    rota(g, 'nucleo', st[0].id, [dir(core), esq(st[0])], 0);
    for (i = 1; i < n; i++) rota(g, st[i - 1].id, st[i].id, [dir(st[i - 1]), esq(st[i])], i);
    rota(g, st[n - 1].id, 'led', [dir(st[n - 1]), esq(led)], n);
    st.forEach(function (h, q) {
      (h.est.sat || []).forEach(function (s) {
        var cima = s.lado === 'cima' && q !== n - 1, sy = cima ? y0 - GV - SH : y0 + BH + GV;
        var sn = no(g, s, h.x, sy, w, SH, 'lado', { compacto: true, ic: [9, (SH - 28) / 2, 0.7] });
        var hx = h.x + w / 2, yh = cima ? y0 : y0 + BH, ys = cima ? sy + SH : sy;
        if (s.laco) {
          rota(g, h.id, sn.id, [[hx - 18, yh], [hx - 18, ys]], q + 1, { tipo: 'sat', atraso: 0.1 });
          rota(g, sn.id, h.id, [[hx + 18, ys], [hx + 18, yh]], q + 2, { tipo: 'sat', alvo: null, atraso: 0.05 });
        } else {
          rota(g, h.id, sn.id, [[hx, yh], [hx, ys]], q + 1, { tipo: 'sat', atraso: 0.1 });
        }
      });
    });
    g.H = ALTURA_PAISAGEM;
    return g;
  }

  var PAISAGENS = { laco: lacoPaisagem, bifurca: bifurcaPaisagem, espinha: espinhaPaisagem };

  function numerar(g) {
    var ord = 0, num = 0;
    g.nos.forEach(function (n) { n.ord = -1; n.num = 0; });
    g.mapa.nucleo.ord = ord++;
    g.rotas.slice().sort(function (a, b) { return (a.passo + a.atraso) - (b.passo + b.atraso); }).forEach(function (r) {
      var n = r.alvo ? g.mapa[r.alvo] : null;
      if (n && n.ord < 0) { n.ord = ord++; if (!n.ponta) n.num = ++num; }
    });
    return g;
  }

  function etapasFalsas(prefixo, q) { var l = [], i; for (i = 0; i < q; i++) l.push({ id: prefixo + i }); return l; }
  function formasPossiveis() {
    var out = [], n, e, a, b, s, q, t, i, hosts;
    var cheg = { id: 'chegada' }, fim = { titulo: 'x' };
    for (n = 7; n <= 8; n++) out.push({ topologia: 'laco', fim: fim, st: [cheg].concat(etapasFalsas('t', n - 1)), ret: { id: 'r' }, rotulo: '' });
    for (e = 1; e <= 6; e++) for (a = 1; a <= 2; a++) for (b = 1; b <= 2; b++) for (s = 1; s <= 2; s++) {
      if (e + a + b + s < 7 || e + a + b + s > 8) continue;
      out.push({ topologia: 'bifurca', fim: fim, ent: [cheg].concat(etapasFalsas('e', e)), r0: etapasFalsas('a', a), r1: etapasFalsas('b', b), sai: etapasFalsas('s', s), rotulos: ['', ''] });
    }
    [[4, 3], [4, 4], [5, 2], [5, 3]].forEach(function (c) {
      t = c[0]; q = c[1]; hosts = etapasFalsas('h', t);
      for (i = 0; i < q; i++) hosts[i].sat = [{ id: 'sat' + i, lado: 'baixo' }];
      for (i = q; i < t; i++) hosts[i].sat = [];
      out.push({ topologia: 'espinha', fim: fim, st: [cheg].concat(hosts) });
    });
    return out;
  }
  var FORMAS = null, MEMO = criar();
  function alturaRetrato(Wc) {
    var chave = String(Wc);
    if (MEMO[chave] !== undefined) return MEMO[chave];
    if (!FORMAS) FORMAS = formasPossiveis();
    var maior = 0;
    FORMAS.forEach(function (E) { var h = Math.ceil(RETRATOS[E.topologia](E, Wc, VG_MIN).H); if (h > maior) maior = h; });
    MEMO[chave] = maior;
    return maior;
  }
  function larguraSegura(W) {
    var n = typeof W === 'number' && isFinite(W) ? Math.round(W) : 390;
    return Math.max(LARGURA_MIN, n);
  }
  function alturaReservada(largura) {
    var W = larguraSegura(largura);
    return W >= LARGURA_PAISAGEM ? ALTURA_PAISAGEM : alturaRetrato(Math.min(W, LARGURA_RETRATO_MAX));
  }

  function deslocar(g, dx) {
    if (!dx) return g;
    g.nos.forEach(function (n) { n.x += dx; if (n.rot) n.rot = mesclar(n.rot, { x: n.rot.x + dx }); });
    g.rotas.forEach(function (r) { r.pts = r.pts.map(function (p) { return [p[0] + dx, p[1]]; }); });
    g.rots.forEach(function (t, i) { g.rots[i] = mesclar(t, { x: t.x + dx }); });
    return g;
  }

  function retrato(E, W) {
    var Wc = Math.min(W, LARGURA_RETRATO_MAX), alvo = alturaRetrato(Wc), fazer = RETRATOS[E.topologia];
    var g = fazer(E, Wc, VG_MIN), vg = VG_MIN, k;
    if (g.H < alvo) {
      k = fazer(E, Wc, VG_MIN + 1).H - g.H;
      if (k > 0) vg = Math.min(VG_MAX, VG_MIN + Math.floor((alvo - g.H) / k));
      if (vg !== VG_MIN) g = fazer(E, Wc, vg);
    }
    g.H = alvo;
    g.W = W;
    return deslocar(g, Math.floor((W - Wc) / 2));
  }

  function montarGeometria(plano, largura) {
    var W = larguraSegura(largura), E = estruturar(plano);
    if (!E) return null;
    var paisagem = W >= LARGURA_PAISAGEM, g = paisagem ? PAISAGENS[E.topologia](E, W) : retrato(E, W);
    g.paisagem = paisagem;
    g.W = W;
    return numerar(g);
  }

  return Object.freeze({
    LARGURA_PAISAGEM: LARGURA_PAISAGEM, ALTURA_PAISAGEM: ALTURA_PAISAGEM, LARGURA_RETRATO_MAX: LARGURA_RETRATO_MAX,
    alturaReservada: alturaReservada, montarGeometria: montarGeometria
  });
});
