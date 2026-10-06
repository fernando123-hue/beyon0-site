/* ==========================================================================
   O FUNDO PRÓPRIO DO HERO de Sites e de Automação (pedido do dono,
   2026-10-04: "o hero das outras páginas, como Sites e Automação e IA, deve
   ser diferente e único, dedicado àquela página"). No Hub o fundo do hero
   é o campo polar do reator (js/campo.js); aqui cada página desenha o seu,
   no mesmo canvas, só dentro do hero (js/rede.js chama `desenhar`; abaixo
   do hero segue o que já existia: o trilho no desktop, o campo no celular).
   A página escolhe pelo `data-fundo` do <section class="hero">.

   SITES — "a GRADE de construção" (o site sendo desenhado e medido):
   - as 12 colunas da página e as linhas de base, como numa ferramenta de
     layout; RÉGUAS em px no alto e na margem, presas à página;
   - a MIRA do cursor: as duas guias, a marca nas réguas e a coordenada;
   - as COTAS da janela do mockup, com a medida real dela em px;
   - a CASCATA da carga: os arquivos que ESTA página baixou, com os tempos
     reais que o navegador mediu (Resource Timing), e o fim da carga. A cada
     expiração do reator a cascata é refeita. Nada inventado: sem medida do
     navegador, ela não aparece.

   AUTOMAÇÃO — "o CIRCUITO" (dados entrando no diagnóstico):
   - o painel do diagnóstico vira o CHIP: pinos nas bordas e trilhas de
     placa (retas e chanfros de 45°) até as margens, com vias nas pontas;
   - PACOTES correm pelas trilhas até o chip; o pino acende na chegada; a
     cada expiração todos entram juntos;
   - o CURSOR: a via mais perto acende e manda um pacote rápido pela trilha.

   Só traço nítido (o dono proíbe desfoque). Coordenadas guardadas na
   PÁGINA (medidas em evento, js/rede.js → `medir`); por quadro só soma a
   rolagem. Movimento reduzido: um quadro parado.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  var hero = document.querySelector('.hero[data-fundo]');
  if (!B || !hero) return;
  var tipo = hero.getAttribute('data-fundo');
  var TAU = Math.PI * 2;
  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), T1 = '242,244,244';
  var FONTE = '400 10px "JetBrains Mono", ui-monospace, monospace', FONTE_P = '400 9px "JetBrains Mono", ui-monospace, monospace';
  function cor(c, a) { return 'rgba(' + c + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')'; }
  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function saida(k) { k = limitar(k); return 1 - (1 - k) * (1 - k) * (1 - k); }
  function num(v, c) { return B.num ? B.num(v, c) : v.toFixed(c); }

  /* ======================= SITES: a grade ======================= */
  var GRADE = { colunas: 12, calha: 24, linha: 120, regua: 10, cascata: { linhas: 7, passo: 9, cresce: 0.9 } };
  function criarGrade() {
    var m = { colE: 0, colD: 0, arte: null, heroY: 0, rotW: '', rotH: '' }, cascata = null, tCascata = -99, tentouCarga = false;
    /* os arquivos reais desta carga: os primeiros a começar, com início e fim */
    function lerCarga() {
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        var fim = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : 0;
        if (!fim) return null;
        var rs = performance.getEntriesByType('resource').filter(function (r) { return r.responseEnd > 0 && r.responseEnd <= fim + 1 && /\.(css|js|woff2|svg)(\?|$)/.test(r.name); });
        rs.sort(function (a, b) { return a.startTime - b.startTime; });
        var linhas = [{ ini: nav.startTime || 0, fim: nav.responseEnd }].concat(rs.slice(0, GRADE.cascata.linhas - 1).map(function (r) { return { ini: r.startTime, fim: r.responseEnd }; }));
        return { linhas: linhas, total: fim };
      } catch (e) { return null; }
    }
    function medir(px) {
      var t = hero.querySelector('.hero__title'), a = hero.querySelector('.hero__arte > *') || hero.querySelector('.hero__arte');
      var pt = t ? px(t) : { x: 0, y: 0 };
      m.colE = pt.x;
      if (a && a.offsetWidth) { var pa = px(a); m.arte = { x: pa.x, y: pa.y, w: a.offsetWidth, h: a.offsetHeight }; m.colD = pa.x + a.offsetWidth; m.rotW = Math.round(a.offsetWidth) + ' px'; m.rotH = Math.round(a.offsetHeight) + ' px'; }
      else { m.arte = null; m.colD = pt.x + (t ? t.offsetWidth : 0); }
      /* a carga só existe depois do load: lida aqui (evento), e de novo uma vez quando o load chegar */
      if (!cascata) cascata = lerCarga();
      if (!cascata && !tentouCarga) { tentouCarga = true; if (document.readyState !== 'complete') window.addEventListener('load', function () { setTimeout(function () { cascata = lerCarga(); }, 0); }, { once: true }); }
    }
    function desenhar(ctx, g) {
      var rol = g.rolagem, topo = g.topo, fim = g.fim, W = g.W, k, x, y, a;
      var resp = 0.85 + 0.15 * g.folego;
      ctx.lineWidth = 1;
      /* as colunas (pares de calha) e as linhas de base */
      if (m.colD > m.colE + 200) {
        var cw = (m.colD - m.colE - (GRADE.colunas - 1) * GRADE.calha) / GRADE.colunas;
        ctx.strokeStyle = cor(AC, 0.07 * resp);
        ctx.beginPath();
        for (k = 0; k < GRADE.colunas; k++) {
          var x0 = Math.round(m.colE + k * (cw + GRADE.calha)) + 0.5, x1 = Math.round(x0 + cw) - 0.5;
          ctx.moveTo(x0, topo + 22); ctx.lineTo(x0, fim); ctx.moveTo(x1, topo + 22); ctx.lineTo(x1, fim);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = cor(AC, 0.045 * resp);
      ctx.beginPath();
      for (y = Math.ceil((topo + rol) / GRADE.linha) * GRADE.linha - rol; y < fim; y += GRADE.linha) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
      ctx.stroke();
      /* as réguas: no alto (logo abaixo do menu) e na margem esquerda, presas à página */
      var ry = topo + 0.5, rx = 14.5;
      ctx.strokeStyle = cor(AC2, 0.28);
      ctx.beginPath();
      ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.moveTo(rx, topo); ctx.lineTo(rx, fim);
      for (x = 0; x < W; x += GRADE.regua) { var lx = x % 100 === 0 ? 9 : x % 50 === 0 ? 6 : 3; ctx.moveTo(x + 0.5, ry); ctx.lineTo(x + 0.5, ry + lx); }
      var y0 = Math.ceil((topo + rol) / GRADE.regua) * GRADE.regua;
      for (y = y0; y - rol < fim; y += GRADE.regua) { var ly = y % 100 === 0 ? 9 : y % 50 === 0 ? 6 : 3; ctx.moveTo(rx, y - rol + 0.5); ctx.lineTo(rx + ly, y - rol + 0.5); }
      ctx.stroke();
      var corRegua = cor(AC2, 0.42);
      /* (o rótulo da cascata, à direita acima da janela, tem prioridade: a régua some sob ele) */
      var rot = rotuloCascata(g), rx0 = rot ? rot.x0 : 1e9, rx1 = rot ? rot.x1 : -1e9, rotY = rot ? rot.y : -1e9;
      /* (o rótulo ocupa [rotY − 10, rotY]; os números, [ry + 4, ry + 13]) */
      for (x = 100; x < W - 30; x += 100) if (!(rotY > ry + 4 && rotY - 10 < ry + 13 && x + 3 + 30 > rx0 && x + 3 < rx1)) B.texto(ctx, String(x), FONTE_P, corRegua, x + 3, ry + 4, 'left', 'top');
      /* (a coluna do texto encostada na régua, como a 768 px: os números da esquerda saem, senão ficam sob o texto) */
      if (m.colE > rx + 44) for (y = Math.ceil((topo + rol + 20) / 100) * 100; y - rol < fim - 8; y += 100) B.texto(ctx, String(y), FONTE_P, corRegua, rx + 12, y - rol, 'left', 'middle');
      /* as cotas da janela: largura e altura reais, em px */
      if (m.arte) {
        a = { x: m.arte.x - g.sx, y: m.arte.y - rol, w: m.arte.w, h: m.arte.h };
        var cy = a.y - 16, cx = a.x + a.w + 16;
        ctx.strokeStyle = cor(AC2, 0.5);
        ctx.beginPath();
        ctx.moveTo(a.x, cy); ctx.lineTo(a.x + a.w, cy); ctx.moveTo(a.x + 0.5, cy - 4); ctx.lineTo(a.x + 0.5, cy + 4); ctx.moveTo(a.x + a.w - 0.5, cy - 4); ctx.lineTo(a.x + a.w - 0.5, cy + 4);
        if (cx < W - 40) { ctx.moveTo(cx, a.y); ctx.lineTo(cx, a.y + a.h); ctx.moveTo(cx - 4, a.y + 0.5); ctx.lineTo(cx + 4, a.y + 0.5); ctx.moveTo(cx - 4, a.y + a.h - 0.5); ctx.lineTo(cx + 4, a.y + a.h - 0.5); }
        ctx.stroke();
        var rotW = m.rotW, tw = rotW.length * 6 + 12;   /* mono de 10 px: ~6 px por caractere */
        ctx.fillStyle = '#000';
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillRect(a.x + a.w / 2 - tw / 2, cy - 6, tw, 12); ctx.globalCompositeOperation = 'source-over';
        B.texto(ctx, rotW, FONTE, cor(AC2, 0.8), a.x + a.w / 2, cy, 'center', 'middle');
        if (cx < W - 40) {
          ctx.save(); ctx.translate(B.pixel(ctx, cx), B.pixel(ctx, a.y + a.h / 2)); ctx.rotate(-Math.PI / 2);   /* (no pixel do aparelho: girado de 90°, o sprite cai inteiro) */
          var rotH = m.rotH, th = rotH.length * 6 + 12;
          ctx.fillStyle = '#000';
          ctx.globalCompositeOperation = 'destination-out'; ctx.fillRect(-th / 2, -6, th, 12); ctx.globalCompositeOperation = 'source-over';
          B.texto(ctx, rotH, FONTE, cor(AC2, 0.8), 0, 0, 'center', 'middle'); ctx.restore();
        }
        desenharCascata(ctx, g, a);
      }
      /* a mira do cursor: as duas guias tracejadas, as marcas nas réguas e a coordenada */
      var c = g.cursor;
      if (c.ativo && c.y > topo && c.y < fim && !g.parado) {
        ctx.strokeStyle = cor(AC2, 0.2);
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(Math.round(c.x) + 0.5, topo); ctx.lineTo(Math.round(c.x) + 0.5, fim); ctx.moveTo(0, Math.round(c.y) + 0.5); ctx.lineTo(W, Math.round(c.y) + 0.5); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = cor(T1, 0.9); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(c.x, ry); ctx.lineTo(c.x, ry + 12); ctx.moveTo(rx, c.y); ctx.lineTo(rx + 12, c.y); ctx.stroke();
        ctx.lineWidth = 1;
        if (g.livre(c.x + 70, c.y + 18)) {
          B.textoMono(ctx, 'x ' + ('000' + Math.round(c.x)).slice(-4) + '  y ' + ('000' + Math.round(c.y + rol)).slice(-4), FONTE, cor(AC2, 0.75), c.x + 12, c.y + 18, 'middle');   /* (muda a cada quadro: um sprite por caractere) */
        }
      }
    }
    /* a cascata da carga, acima da janela: cada arquivo, do início ao fim reais */
    function desenharCascata(ctx, g, a) {
      if (g.cel || !cascata) return;   /* no celular a cascata ficava espremida contra o texto */
      var C = GRADE.cascata, n = cascata.linhas.length, base = a.y - 34, alto = base - n * C.passo;
      if (alto < g.topo + 16) return;
      if (g.expirou) tCascata = g.t;
      var p = g.parado ? 1 : limitar((g.t - tCascata) / C.cresce);
      var esc = a.w / cascata.total;
      ctx.lineWidth = 3;
      for (var i = 0; i < n; i++) {
        var l = cascata.linhas[i], y = alto + i * C.passo + 0.5;
        var x0 = a.x + l.ini * esc, x1 = a.x + Math.min(l.fim, cascata.total * p) * esc;
        if (x1 <= x0) continue;
        ctx.strokeStyle = cor(i ? AC2 : T1, i ? 0.6 : 0.85);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(Math.max(x0 + 2, x1), y); ctx.stroke();
      }
      ctx.lineWidth = 1;
      /* o fim da carga: um marco vertical com a leitura */
      var xm = a.x + cascata.total * p * esc;
      ctx.strokeStyle = cor(AC, 0.7);
      ctx.beginPath(); ctx.moveTo(Math.round(xm) - 0.5, alto - 4); ctx.lineTo(Math.round(xm) - 0.5, base + 4); ctx.stroke();
      if (p >= 1) {
        var rc = rotuloCascata(g);
        if (rc) B.texto(ctx, rc.txt, FONTE, cor(AC2, 0.8), rc.x1, rc.y, 'right', 'bottom');
      }
    }
    /* o rótulo da cascata (só quando ela está inteira, p ≥ 1: antes disso a régua segue com os números): texto e
       caixa (x0–x1, linha de base y), ou null. O texto e a largura são medidos uma vez por carga lida */
    var rotulo = { total: -1, txt: '', w: 0 };
    function rotuloCascata(g) {
      var a = m.arte;
      if (g.cel || !cascata || !a) return null;
      if (!g.parado && limitar((g.t - tCascata) / GRADE.cascata.cresce) < 1) return null;
      var n = cascata.linhas.length, base = a.y - g.rolagem - 34, alto = base - n * GRADE.cascata.passo;
      if (alto < g.topo + 16) return null;
      if (rotulo.total !== cascata.total) { rotulo.total = cascata.total; rotulo.txt = 'esta página · carga ' + num(cascata.total / 1000, 2) + ' s'; rotulo.w = B.largura(null, rotulo.txt, FONTE); }
      var x1 = a.x - g.sx + a.w;
      return { txt: rotulo.txt, x0: x1 - rotulo.w, x1: x1, y: alto - 6 };
    }
    return { medir: medir, desenhar: desenhar };
  }

  /* ======================= AUTOMAÇÃO: o circuito ======================= */
  var CIRC = { pinos: { topo: 6, dir: 4, base: 5, esq: 4 }, sai: 16, chanfro: 12, vel: 150, rapido: 520, pacote: 12, cada: [2.4, 5.5], perto: 120 };
  function criarCircuito() {
    var trilhas = [], chip = null, semente = 7, cursorTrilha = -1;
    function acaso() { semente = (semente * 16807) % 2147483647; return (semente - 1) / 2147483646; }
    /* uma trilha: lista de pontos (página) do fim até o pino, com o comprimento acumulado */
    function trilha(pts) {
      var L = [0];
      for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { p: pts, L: L, total: L[L.length - 1], pacotes: [], prox: acaso() * CIRC.cada[1], pino: 0 };
    }
    function medir(px, geo) {
      var a = hero.querySelector('.hero__arte > *') || hero.querySelector('.hero__arte');
      if (!a || !a.offsetWidth) { trilhas = []; chip = null; return; }
      var pa = px(a), hp = px(hero);
      if (chip && chip.x === pa.x && chip.y === pa.y && chip.w === a.offsetWidth && chip.h === a.offsetHeight && trilhas.length) return;
      chip = { x: pa.x, y: pa.y, w: a.offsetWidth, h: a.offsetHeight };
      trilhas = []; semente = 7;
      var topo = Math.max(hp.y + 12, geo.topoDoc), fimY = hp.y + hero.offsetHeight - 12, W = geo.W;
      var cx0 = chip.x, cx1 = chip.x + chip.w, cy0 = chip.y, cy1 = chip.y + chip.h, S = CIRC.sai, C = CIRC.chanfro, i, n, pts, x, y, d;
      /* topo: sobe, chanfra para o lado, sobe até a sua faixa e corre até a margem */
      n = CIRC.pinos.topo;
      for (i = 0; i < n; i++) {
        x = cx0 + chip.w * (i + 0.5) / n; d = x < cx0 + chip.w / 2 ? -1 : 1;
        var faixa = Math.max(topo + 6, cy0 - S - C - 22 - (d < 0 ? i : n - 1 - i) * 9);
        if (faixa > cy0 - S - C - 4) continue;
        var xf = d < 0 ? Math.max(geo.colE - 30, x - 260 - acaso() * 220) : Math.min(W - 24, x + 120 + acaso() * 200);
        pts = [[xf, faixa], [x + d * C, faixa], [x + d * C, cy0 - S - C], [x, cy0 - S], [x, cy0]];
        trilhas.push(trilha(pts));
      }
      /* direita: sai, chanfra, corre até a sua coluna e sobe ou desce */
      n = CIRC.pinos.dir;
      for (i = 0; i < n; i++) {
        y = cy0 + chip.h * (i + 0.5) / n; d = i < n / 2 ? -1 : 1;
        var col = cx1 + S + C + 18 + (d < 0 ? i : n - 1 - i) * 10;
        if (col > W - 20) continue;
        var yf = d < 0 ? Math.max(topo + 10, y - 90 - acaso() * 160) : Math.min(fimY, y + 90 + acaso() * 160);
        pts = [[col, yf], [col, y + d * C], [col - C, y], [cx1 + S, y], [cx1, y]];
        trilhas.push(trilha(pts));
      }
      /* base: desce, chanfra, desce até a sua faixa e corre para o lado */
      n = CIRC.pinos.base;
      for (i = 0; i < n; i++) {
        x = cx0 + chip.w * (i + 0.5) / n; d = i < n / 2 ? -1 : 1;
        var fx = cy1 + S + C + 16 + (d < 0 ? i : n - 1 - i) * 9;
        if (fx > fimY) continue;
        var xb = d < 0 ? Math.max(geo.colE, x - 140 - acaso() * 200) : Math.min(W - 24, x + 100 + acaso() * 160);
        pts = [[xb, fx], [x + d * C, fx], [x, fx - C], [x, cy1 + S], [x, cy1]];
        trilhas.push(trilha(pts));
      }
      /* esquerda: tocos curtos (do lado do texto o circuito não avança) */
      n = CIRC.pinos.esq;
      for (i = 0; i < n; i++) {
        y = cy0 + chip.h * (i + 0.5) / n; d = i % 2 ? 1 : -1;
        var xe = cx0 - S - C - 30 - acaso() * 50;
        pts = [[xe, y + d * C], [cx0 - S - C, y + d * C], [cx0 - S, y], [cx0, y]];
        trilhas.push(trilha(pts));
      }
    }
    /* o ponto a uma distância s do começo da trilha (página) */
    function ponto(tr, s, out) {
      var L = tr.L, i = 1;
      while (i < L.length - 1 && L[i] < s) i++;
      var k = (s - L[i - 1]) / Math.max(1e-3, L[i] - L[i - 1]);
      out[0] = tr.p[i - 1][0] + (tr.p[i][0] - tr.p[i - 1][0]) * k; out[1] = tr.p[i - 1][1] + (tr.p[i][1] - tr.p[i - 1][1]) * k;
      return out;
    }
    var P0 = [0, 0], P1 = [0, 0];
    function passo(dt, g) {
      for (var i = 0; i < trilhas.length; i++) {
        var tr = trilhas[i];
        tr.pino = Math.max(0, tr.pino - dt * 4);
        tr.prox -= dt;
        if (tr.prox <= 0 || g.expirou) { tr.pacotes.push({ s: 0, v: CIRC.vel * (0.85 + 0.3 * acaso()) }); tr.prox = CIRC.cada[0] + acaso() * (CIRC.cada[1] - CIRC.cada[0]); }
        if (i === cursorTrilha && g.cursorNovo) tr.pacotes.push({ s: 0, v: CIRC.rapido, rapido: true });
        for (var k = tr.pacotes.length - 1; k >= 0; k--) {
          var pk = tr.pacotes[k];
          pk.s += dt * pk.v;
          if (pk.s >= tr.total) { tr.pacotes.splice(k, 1); tr.pino = 1; }
        }
      }
    }
    function desenhar(ctx, g) {
      if (!chip) return;
      var sx = g.sx, sy = g.rolagem, i, k, tr;
      /* a trilha sob o cursor: a de via mais perto (ao mudar, ela manda um pacote rápido) */
      var c = g.cursor, melhor = -1, dm = CIRC.perto;
      if (c.ativo && !g.parado) for (i = 0; i < trilhas.length; i++) { var v = trilhas[i].p[0], dv = Math.hypot(v[0] - sx - c.x, v[1] - sy - c.y); if (dv < dm) { dm = dv; melhor = i; } }
      g.cursorNovo = melhor >= 0 && melhor !== cursorTrilha;
      cursorTrilha = melhor;
      if (!g.parado) passo(g.dt, g);
      /* as trilhas */
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor(AC, 0.2 * (0.85 + 0.15 * g.folego));
      ctx.beginPath();
      for (i = 0; i < trilhas.length; i++) {
        tr = trilhas[i];
        ctx.moveTo(tr.p[0][0] - sx, tr.p[0][1] - sy);
        for (k = 1; k < tr.p.length; k++) ctx.lineTo(tr.p[k][0] - sx, tr.p[k][1] - sy);
      }
      ctx.stroke();
      if (melhor >= 0) {
        tr = trilhas[melhor];
        ctx.strokeStyle = cor(AC2, 0.6);
        ctx.beginPath(); ctx.moveTo(tr.p[0][0] - sx, tr.p[0][1] - sy);
        for (k = 1; k < tr.p.length; k++) ctx.lineTo(tr.p[k][0] - sx, tr.p[k][1] - sy);
        ctx.stroke();
      }
      /* as vias (o fim de cada trilha) e os pinos no chip */
      for (i = 0; i < trilhas.length; i++) {
        tr = trilhas[i];
        var v0 = tr.p[0], pn = tr.p[tr.p.length - 1], pa = tr.p[tr.p.length - 2];
        ctx.strokeStyle = cor(i === melhor ? T1 : AC2, i === melhor ? 0.95 : 0.45);
        ctx.beginPath(); ctx.arc(v0[0] - sx, v0[1] - sy, i === melhor ? 4 : 2.5, 0, TAU); ctx.stroke();
        var hor = Math.abs(pn[1] - pa[1]) < 0.5;
        ctx.fillStyle = cor(tr.pino > 0.05 ? T1 : AC, 0.35 + 0.6 * tr.pino);
        if (hor) ctx.fillRect(pn[0] - sx - (pn[0] > pa[0] ? 6 : 0), pn[1] - sy - 2, 6, 4);
        else ctx.fillRect(pn[0] - sx - 2, pn[1] - sy - (pn[1] > pa[1] ? 6 : 0), 4, 6);
      }
      /* os pacotes: rastro ciano e cabeça branca */
      if (!g.parado) {
        for (i = 0; i < trilhas.length; i++) {
          tr = trilhas[i];
          for (k = 0; k < tr.pacotes.length; k++) {
            var pk = tr.pacotes[k], ini = Math.max(0, pk.s - (pk.rapido ? 22 : CIRC.pacote));
            ctx.strokeStyle = cor(pk.rapido ? T1 : AC2, pk.rapido ? 0.95 : 0.7);
            ctx.lineWidth = pk.rapido ? 2 : 1.5;
            ctx.beginPath();
            /* o rastro segue a trilha (passa pelo canto, se houver) */
            ponto(tr, ini, P0); ctx.moveTo(P0[0] - sx, P0[1] - sy);
            for (var q = 1; q < tr.L.length; q++) if (tr.L[q] > ini && tr.L[q] < pk.s) ctx.lineTo(tr.p[q][0] - sx, tr.p[q][1] - sy);
            ponto(tr, pk.s, P1); ctx.lineTo(P1[0] - sx, P1[1] - sy);
            ctx.stroke();
          }
        }
        ctx.lineWidth = 1;
      }
    }
    return { medir: medir, desenhar: desenhar };
  }

  var desenho = tipo === 'grade' ? criarGrade() : tipo === 'circuito' ? criarCircuito() : null;
  if (!desenho) return;
  /* a ponte com js/rede.js: ela mede (em evento) e chama o desenho por quadro */
  B.heroFundo = { tipo: tipo, hero: hero, medir: desenho.medir, desenhar: desenho.desenhar };
})();
