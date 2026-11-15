/* O MAPA DO CASO: a GEOMETRIA (PR 5b, tarefa 2; plano docs/superpowers/plans/2026-11-14-pr5b-mapa-desenho.md). Plano v3 já validado + as medidas do
   texto -> caixas, setas, rótulos e cabeçalhos em px. PURO (sem DOM nem relógio), ES5: window.BZMapaLayout na tela, CommonJS no Node.
   É o "compor" do laboratório (docs/lab-estruturas.js, conferido em 4 casos x 320/390/768/1280), sem medir nada:
     1. pedidos(plano, larg): o que o desenho tem de medir, com a largura que cada coisa vai ter (nós: a largura da caixa; rótulos: a largura
        máxima). As larguras só dependem do plano e da largura do quadro, nunca da altura do texto;
     2. o desenho mede tudo em lote, fora da página, depois das fontes (uma leitura só);
     3. compor(plano, larg, medidas): as alturas viram a geometria final.
   Cada nó cai numa CAMADA (o passo da história, pelo caminho mais longo) e numa FAIXA (a pista lateral): BZMapaForma.camadas/faixas, as mesmas do
   validador. No celular as camadas são linhas e as faixas colunas; no computador, o contrário. A volta do ciclo corre por fora.
   A pele é o TRILHO (escolha do dono, 14/11): o chip com o texto ao lado e a linha que passa pelos chips.
   Ids do plano só viram chave de objeto sem protótipo. */
(function (raiz, fabrica) {
  'use strict';
  var node = typeof module === 'object' && module && module.exports;
  var api = fabrica(node ? require('./orcamento-mapa-forma.js') : raiz && raiz.BZMapaForma);
  if (node) module.exports = api;
  if (raiz) raiz.BZMapaLayout = api;
})(typeof window !== 'undefined' ? window : null, function (Forma) {
  'use strict';

  var M = Object.freeze({ gapX: 104, gapXJusto: 80, gapY: 36, celGapX: 14, celGapY: 30, celCab: 22, margemVolta: 104, noMax: 224, rotMax: 96, chip: 36, margemDesk: 40, colMin: 120, larguraCel: 640, folgaRot: 15 });
  var vaoDe = function (nCam) { return nCam >= 5 ? M.gapXJusto : M.gapX; };
  var mapa = function () { return Object.create(null); };

  function ponto(c, t) {
    var u = 1 - t;
    return [u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0],
      u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1]];
  }
  /* n+1 pontos ao longo da seta (curva ou polilinha), para a luz: o compositor anima transform, sem getPointAtLength */
  function amostrar(seta, n) {
    var out = [], i;
    if (seta.curva) { for (i = 0; i <= n; i++) out.push(ponto(seta.curva, i / n)); return out; }
    var pts = seta.linha, tam = [0], tot = 0;
    for (i = 1; i < pts.length; i++) { tot += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]); tam.push(tot); }
    for (i = 0; i <= n; i++) {
      var alvo = tot * i / n, j = 1;
      while (j < pts.length - 1 && tam[j] < alvo) j++;
      var seg = tam[j] - tam[j - 1] || 1, f = (alvo - tam[j - 1]) / seg;
      out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
    }
    return out;
  }

  /* ---------- 1. o que só depende da largura: camadas, faixas, celular ou não, x e largura de cada caixa ---------- */
  function base(plano, larg) {
    var lay = Forma.camadas(plano), est = plano.estrutura, fx = Forma.faixas(est, plano, lay), nCam = lay.porCamada.length;
    var volta = est === 'ciclo', cab = est === 'antes_depois' ? M.celCab : 0, xs = mapa(), ws = mapa(), ids = Object.keys(lay.camada);
    var celular = larg < M.larguraCel || (larg - M.margemDesk - (nCam - 1) * vaoDe(nCam)) / nCam < M.colMin;
    var b = { lay: lay, fx: fx, est: est, nCam: nCam, volta: volta, cab: cab, celular: celular, larg: larg, xs: xs, ws: ws };
    if (celular) {
      b.util = Math.max(M.colMin, larg - (volta ? M.margemVolta : 0));   /* (revisão do 5b) quadro estreitíssimo: nunca largura negativa */
      b.col = fx.n > 1 ? (b.util - M.celGapX) / 2 : b.util;
      ids.forEach(function (id) { var f = fx.f[id]; ws[id] = f < 0 ? b.util : b.col; xs[id] = f < 0 ? 0 : f * (b.col + M.celGapX); });
    } else {
      b.gap = vaoDe(nCam);
      b.colW = Math.min(M.noMax, (larg - M.margemDesk - (nCam - 1) * b.gap) / nCam);
      b.x0 = (larg - (nCam * b.colW + (nCam - 1) * b.gap)) / 2;
      ids.forEach(function (id) { ws[id] = b.colW; xs[id] = b.x0 + lay.camada[id] * (b.colW + b.gap); });
    }
    return b;
  }
  var ehVolta = function (b, s) { return b.lay.volta.indexOf(s) >= 0; };
  /* a largura máxima do rótulo de cada seta (só depende de x): o vão do celular é dos rótulos, até o trilho da coluna da direita ou a borda */
  function rotMax(b, s) {
    var a = { x: b.xs[s.de], w: b.ws[s.de] }, d = { x: b.xs[s.para], w: b.ws[s.para] };
    if (ehVolta(b, s)) return b.celular ? b.larg - (b.larg - M.margemVolta + 26) - 8 : Math.abs((a.x + a.w / 2) - (d.x + d.w / 2)) - 40;
    if (b.celular) {
      var mc = M.chip / 2, x = Math.max(a.x, d.x) + mc + 8, trilhoDir = b.fx.n > 1 ? (b.util - M.celGapX) / 2 + M.celGapX + mc : Infinity;
      return (x < trilhoDir ? Math.min(trilhoDir, b.larg) : b.larg) - x - 8;
    }
    return Math.min(M.rotMax, d.x - (a.x + a.w) - 16);
  }

  /* ---------- pedidos: o que o desenho mede (as chaves: "no:<id>", "rot:<índice da seta>", "cab:<0|1>") ---------- */
  function pedidos(plano, larg) {
    var b = base(plano, larg), out = [];
    /* na ordem da história (camada a camada): o DOM segue a ordem, e um id só de dígitos não passa na frente (revisão do 5b) */
    b.lay.porCamada.forEach(function (lista) { lista.forEach(function (id) { out.push({ chave: 'no:' + id, id: id, largura: b.ws[id], celular: b.celular }); }); });
    plano.setas.forEach(function (s, i) { out.push({ chave: 'rot:' + i, texto: s.rotulo, larguraMax: Math.max(48, rotMax(b, s)) }); });
    return out;
  }

  /* ---------- 3. a geometria final ---------- */
  function compor(plano, larg, medidas) {
    var b = base(plano, larg), lay = b.lay, fx = b.fx, cx = mapa(), ids = Object.keys(lay.camada), altura;
    var alt = function (id) { var h = medidas['no:' + id]; return typeof h === 'number' && h > 0 ? h : M.chip; };
    if (b.celular) {
      /* o vão abaixo de cada linha é dos rótulos que saem dela, e cresce com o mais alto */
      var vao = [], y = b.cab;
      plano.setas.forEach(function (s, i) {
        if (ehVolta(b, s)) return;
        var r = medidas['rot:' + i], c = lay.camada[s.de];
        vao[c] = Math.max(vao[c] || M.celGapY, (r && r.h ? r.h : 0) + M.folgaRot);
      });
      lay.porCamada.forEach(function (lista, i) {
        var h = 0;
        lista.forEach(function (id) { h = Math.max(h, alt(id)); });
        lista.forEach(function (id) { cx[id] = { x: b.xs[id], y: y, w: b.ws[id], h: h }; });
        y += h + (i < b.nCam - 1 ? (vao[i] || M.celGapY) : 0);
      });
      altura = y;
    } else {
      var hF = [0, 0], hInteiro = 0;
      ids.forEach(function (id) { var h = alt(id), f = fx.f[id]; if (f < 0) hInteiro = Math.max(hInteiro, h); else hF[f] = Math.max(hF[f], h); });
      var topo = [b.cab, b.cab + hF[0] + M.gapY + b.cab], altFaixas = fx.n > 1 ? topo[1] + hF[1] : b.cab + Math.max(hF[0], hInteiro);
      if (fx.n > 1 && hInteiro > altFaixas - b.cab) { var d = (hInteiro + b.cab - altFaixas) / 2; topo = [topo[0] + d, topo[1] + d]; altFaixas = hInteiro + b.cab; }
      ids.forEach(function (id) {
        var f = fx.f[id], h = f < 0 ? alt(id) : hF[f];
        cx[id] = { x: b.xs[id], w: b.ws[id], h: h, y: f < 0 ? (fx.n > 1 ? (b.cab + altFaixas - h) / 2 : b.cab) : topo[f] };
      });
      altura = altFaixas + (b.volta ? 64 : 0);
    }

    var setas = plano.setas.map(function (s, i) {
      var a = cx[s.de], d = cx[s.para], volta = ehVolta(b, s), r = { de: s.de, para: s.para, i: i, volta: volta };
      if (volta && b.celular) {
        var xm = b.larg - M.margemVolta + 26, ya = a.y + a.h / 2, yb = d.y + d.h / 2;
        r.linha = [[a.x + a.w, ya], [xm, ya], [xm, yb], [d.x + d.w, yb]];
        r.ponta = 'esq'; r.rot = { x: xm + 8, y: (ya + yb) / 2, lado: 'dir' };
      } else if (volta) {
        var yv = altura - 24, xa = a.x + a.w / 2, xb = d.x + d.w / 2;
        r.linha = [[xa, a.y + a.h], [xa, yv], [xb, yv], [xb, d.y + d.h]];
        r.ponta = 'cima'; r.rot = { x: (xa + xb) / 2, y: yv, lado: 'meio' };
      } else if (b.celular) {
        var mc = M.chip / 2, ta = a.x + mc, tb = d.x + mc, yCruza = d.y - 6;
        r.linha = ta === tb ? [[ta, a.y + M.chip], [tb, d.y]] : [[ta, a.y + M.chip], [ta, yCruza], [tb, yCruza], [tb, d.y]];
        r.ponta = 'baixo'; r.rot = { x: Math.max(a.x, d.x) + mc + 8, y: a.y + a.h + 4, lado: 'dir', topo: true };
      } else {
        var ya3 = a.y + M.chip / 2, yb3 = d.y + M.chip / 2, xa3 = a.x + M.chip, xb3 = d.x, xm3 = (a.x + a.w + xb3) / 2;
        r.curva = ya3 === yb3 ? [[xa3, ya3], [xa3, ya3], [xb3, yb3], [xb3, yb3]] : [[xa3, ya3], [xm3, ya3], [xm3, yb3], [xb3, yb3]];
        var meio3 = ya3 === yb3 ? [xm3, ya3 + 5] : ponto(r.curva, 0.5);
        r.ponta = 'dir'; r.rot = { x: xm3, y: meio3[1], lado: 'meio', topo: ya3 === yb3 };
      }
      /* o retângulo do rótulo, com a medida dele: o desenho o põe por transform exatamente aqui */
      var m = medidas['rot:' + i] || { w: 0, h: 0 };
      r.rot.w = m.w; r.rot.h = m.h;
      r.rot.left = Math.round(r.rot.lado === 'meio' ? r.rot.x - m.w / 2 : r.rot.x);
      r.rot.top = Math.round(r.rot.topo ? r.rot.y : r.rot.y - m.h / 2);
      return r;
    });

    /* os títulos das faixas do antes/depois: no celular no topo do quadro, em cima de cada coluna; no computador em cima da 1ª caixa de cada faixa */
    var cabecalhos = [];
    if (b.est === 'antes_depois') {
      var prim = [];
      ids.forEach(function (id) { var f = fx.f[id], c = cx[id]; if (f >= 0 && (!prim[f] || c.x < prim[f].x)) prim[f] = c; });
      [0, 1].forEach(function (f) { var c = prim[f] || { x: 0, y: M.celCab }; cabecalhos.push({ faixa: f, x: c.x, y: b.celular ? 0 : c.y - M.celCab }); });
    }
    /* a ordem da história: camada, depois faixa */
    var ordem = [];
    lay.porCamada.forEach(function (lista) { lista.slice().sort(function (p, q) { return fx.f[p] - fx.f[q]; }).forEach(function (id) { ordem.push(id); }); });
    return { W: larg, H: Math.ceil(altura), celular: b.celular, caixas: cx, setas: setas, cabecalhos: cabecalhos, ordem: ordem, faixas: fx, camadas: lay };
  }

  return Object.freeze({ M: M, pedidos: pedidos, compor: compor, amostrar: amostrar, ponto: ponto });
});
