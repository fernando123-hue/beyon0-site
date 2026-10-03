/* ==========================================================================
   OS FEIXES — o motor do fundo vivo (pedido do dono, 2026-10-02: "ao invés
   de formas paradas que se conectam de vez em quando, feixes de energia
   andando frequentemente e gerando interação quando se esbarram, e
   interagindo com o usuário").

   Um feixe é uma cabeça de luz com cauda nítida (1 px, sem desfoque). Anda
   em 8 direções (passos de 45°, como trilha de circuito) e decide a cada
   `passo` px: segue reto quase sempre, às vezes vira 45° ou 90°. A decisão
   pesa:
   - a LEITURA: o passo que entraria num bloco de texto ou cartão quase
     nunca é escolhido; o feixe contorna o bloco (traça o contorno dele);
   - os ATRATORES do quadro (o cursor, o mini, outros feixes por perto):
     quem está perto puxa a direção;
   - as BORDAS da tela: perto delas ele tende a virar para dentro.

   Quando se esbarram:
   - JUNÇÃO: a cabeça cruza a cauda de outro. Um losango nítido marca o
     ponto, os dois ganham carga (mais claros e rápidos por um tempo) e, às
     vezes, nasce um ramo perpendicular;
   - CHOQUE: cabeça com cabeça. Anel e faíscas; os dois param e se recolhem
     no ponto, e dele sai UM feixe novo na direção da soma dos dois (a
     energia se funde).

   Este arquivo só sabe de feixes: posição em coordenadas de TELA, sem ler o
   documento. Quem integra com a página (texto, cursor, cartões, rolagem) é
   js/rede.js, pelas funções de `op`.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;

  var R2 = Math.SQRT1_2, TAU = Math.PI * 2;
  /* as 8 direções, de 45 em 45°, a partir da direita, no sentido da tela (y para baixo) */
  var DIRS = [[1, 0], [R2, R2], [0, 1], [-R2, R2], [-1, 0], [-R2, -R2], [0, -1], [R2, -R2]];
  /* virar: [desvio em oitavos, peso base] — reto quase sempre */
  var VIRADAS = [[0, 6], [1, 1.2], [-1, 1.2], [2, 0.45], [-2, 0.45]];
  var COOLDOWN_PAR = 1.2;          /* s: o mesmo par não se esbarra de novo neste tempo */
  var CHOQUE_DIST = 9;             /* px entre cabeças para um choque */
  var CHOQUE_NA_CAUDA = 14;        /* px: cruzar a cauda tão perto da cabeça também é choque */
  var IMUNE = 0.3;                 /* s: quem acabou de nascer não esbarra (os irmãos de um pulso saem do mesmo ponto) */
  var EVENTO_DURA = { juncao: 0.8, choque: 0.7, toque: 0.45, pulso: 0.9 };

  function dirDe(dx, dy) { return ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8; }
  function acaso(a, b) { return a + Math.random() * (b - a); }
  function saida(k) { return 1 - (1 - k) * (1 - k) * (1 - k); }
  /* interseção de dois segmentos: o ponto, ou null */
  function cruza(ax, ay, bx, by, cx, cy, dx, dy) {
    var rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-6) return null;
    var qx = cx - ax, qy = cy - ay, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: ax + rx * t, y: ay + ry * t };
  }

  /* op: { ctx, cores: { AC, AC2, T1 }, celular, naZona(x, y), tela() → { W, H, topo },
           trilhoX() → x do trilho do celular ou null, aoEvento(tipo, x, y, feixe),
           campos() → [{ x, y, rx, ry }]: elipses onde feixe não entra (o AI Core) } */
  B.feixes = function (op) {
    var ctx = op.ctx, C = op.cores, cel = op.celular;
    var PASSO = cel ? 22 : 28;
    var VEL = cel ? [110, 190] : [140, 250];        /* px/s */
    var CAUDA = cel ? [70, 150] : [90, 220];        /* px */
    var VIDA = [7, 13];                             /* s até se recolher sozinho */
    var EXTRA = cel ? 5 : 10;                       /* feixes acima do alvo (ramos, pulsos, fusões) */
    var lista = [], eventos = [], pares = {}, proxId = 1, relogio = 0;

    function alvo() {
      var T = op.tela();
      return Math.max(cel ? 7 : 8, Math.min(cel ? 11 : 16, Math.round((T.W * T.H) / (cel ? 38000 : 85000))));
    }
    /* (x, y) dentro de algum campo? */
    function noCampo(x, y) {
      var cs = op.campos ? op.campos() : null;
      if (!cs) return false;
      for (var i = 0; i < cs.length; i++) { var c = cs[i], u = (x - c.x) / c.rx, v = (y - c.y) / c.ry; if (u * u + v * v < 1) return true; }
      return false;
    }
    function vivos() { var n = 0; for (var i = 0; i < lista.length; i++) if (!lista[i].morre) n++; return n; }

    /* ---------- nascer ---------- */
    function criar(x, y, d, o) {
      o = o || {};
      if (!o.forcar && vivos() >= alvo() + EXTRA) return null;
      var f = {
        id: proxId++, x: x, y: y, d: d, vx: DIRS[d][0], vy: DIRS[d][1],
        vel: o.vel || acaso(VEL[0], VEL[1]), cauda: o.cauda || acaso(CAUDA[0], CAUDA[1]),
        pts: [{ x: x, y: y }], anda: 0, idade: 0, vida: o.vida || acaso(VIDA[0], VIDA[1]),
        carga: o.carga || 0, morre: false, trilho: !!o.trilho, base: acaso(0.5, 0.7), px: x, py: y, ini: null,
        reto: o.reto || 0   /* px que ele anda reto antes de decidir (o feixe que percorre a borda de um cartão) */
      };
      f.caudaCheia = f.cauda;
      lista.push(f);
      return f;
    }
    /* um feixe novo: da borda para dentro, ou acendendo num ponto livre da tela */
    function semear() {
      var T = op.tela(), tx = op.trilhoX ? op.trilhoX() : null;
      var sorte = Math.random();
      if (tx !== null && sorte < 0.25) {
        var desce = Math.random() < 0.5;
        return criar(tx, desce ? T.topo - 20 : T.H + 20, desce ? 2 : 6, { trilho: true, cauda: acaso(60, 120) });
      }
      if (sorte < (cel ? 0.4 : 0.5)) {
        var lado = (Math.random() * 4) | 0, x, y, d;
        if (lado === 0) { x = -20; y = acaso(T.topo, T.H); d = [0, 1, 7][(Math.random() * 3) | 0]; }
        else if (lado === 1) { x = T.W + 20; y = acaso(T.topo, T.H); d = [4, 3, 5][(Math.random() * 3) | 0]; }
        else if (lado === 2) { x = acaso(0, T.W); y = T.topo - 20; d = [2, 1, 3][(Math.random() * 3) | 0]; }
        else { x = acaso(0, T.W); y = T.H + 20; d = [6, 5, 7][(Math.random() * 3) | 0]; }
        return criar(x, y, d);
      }
      for (var k = 0; k < 8; k++) {
        var px = acaso(40, T.W - 40), py = acaso(T.topo + 30, T.H - 40);
        if (!op.naZona(px, py) && !noCampo(px, py)) return criar(px, py, (Math.random() * 8) | 0);
      }
      return null;
    }

    /* ---------- decidir a direção (a cada passo) ---------- */
    var pesos = [0, 0, 0, 0, 0];
    function decidir(f, atratores, T) {
      if (f.reto > 0) { f.reto -= PASSO; return; }
      var dentro = op.naZona(f.x, f.y), noC = noCampo(f.x, f.y), soma = 0, i;
      for (i = 0; i < VIRADAS.length; i++) {
        var nd = (f.d + VIRADAS[i][0] + 8) % 8, v = DIRS[nd], w = f.trilho ? (i === 0 ? 1 : 0) : VIRADAS[i][1];
        if (w === 0) { pesos[i] = 0; continue; }
        var nx = f.x + v[0] * PASSO, ny = f.y + v[1] * PASSO;
        if (!dentro && op.naZona(nx, ny)) w *= 0.06;   /* a leitura manda: contorna o bloco */
        if (!noC && noCampo(nx, ny)) w *= 0.02;        /* o AI Core: o feixe contorna, nunca cruza a face dele */
        if (f.idade < f.vida * 0.8 && (nx < 30 || nx > T.W - 30 || ny < T.topo + 10 || ny > T.H - 20)) w *= 0.3;
        for (var a = 0; a < atratores.length; a++) {
          var at = atratores[a], dx = at.x - f.x, dy = at.y - f.y, dd = Math.hypot(dx, dy);
          if (dd > at.r || dd < 1) continue;
          var k = (v[0] * dx + v[1] * dy) / dd;
          if (k > 0) w *= Math.max(0.05, 1 + at.s * k * (1 - dd / at.r));
        }
        pesos[i] = w; soma += w;
      }
      var r = Math.random() * soma;
      for (i = 0; i < VIRADAS.length; i++) { r -= pesos[i]; if (r <= 0) break; }
      var escolhida = (f.d + VIRADAS[Math.min(i, VIRADAS.length - 1)][0] + 8) % 8;
      if (escolhida !== f.d) { f.pts.push({ x: f.x, y: f.y }); f.d = escolhida; f.vx = DIRS[escolhida][0]; f.vy = DIRS[escolhida][1]; }
    }

    /* a cauda visível: corta os pontos antigos e acha onde ela começa */
    function aparar(f) {
      var resta = f.cauda, ax = f.x, ay = f.y;
      for (var i = f.pts.length - 1; i >= 0; i--) {
        var p = f.pts[i], seg = Math.hypot(ax - p.x, ay - p.y);
        if (seg >= resta) {
          var k = seg ? resta / seg : 0;
          f.ini = { i: i, x: ax + (p.x - ax) * k, y: ay + (p.y - ay) * k };
          if (i > 0) f.pts.splice(0, i);
          f.ini.i = 0;
          return;
        }
        resta -= seg; ax = p.x; ay = p.y;
      }
      f.ini = { i: 0, x: f.pts[0].x, y: f.pts[0].y };
    }

    /* ---------- esbarrões ---------- */
    function evento(tipo, x, y, extra) {
      eventos.push({ tipo: tipo, x: x, y: y, t: 0, dura: EVENTO_DURA[tipo], d: extra || 0 });
    }
    function parLivre(a, b) {
      var k = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
      if (pares[k] && relogio - pares[k] < COOLDOWN_PAR) return false;
      pares[k] = relogio;
      return true;
    }
    function choque(a, b, x, y) {
      evento('choque', x, y);
      a.morre = b.morre = true;
      var sx = a.vx + b.vx, sy = a.vy + b.vy;
      var d = Math.hypot(sx, sy) > 0.3 ? dirDe(sx, sy) : (a.d + 2) % 8;   /* de frente: sai de lado */
      criar(x, y, d, { forcar: true, carga: 1, vel: Math.min(VEL[1] * 1.3, Math.max(a.vel, b.vel) * 1.15), cauda: Math.min(280, a.cauda * 0.6 + b.cauda * 0.6), trilho: a.trilho && b.trilho });
      if (op.aoEvento) op.aoEvento('choque', x, y);
    }
    function juncao(a, o, x, y) {
      evento('juncao', x, y);
      a.carga = Math.max(a.carga, 0.5);
      o.carga = Math.max(o.carga, 0.75);   /* a energia passa para quem foi cruzado */
      if (!a.trilho && Math.random() < 0.3) criar(x, y, (a.d + (Math.random() < 0.5 ? 2 : 6)) % 8, { carga: 0.4, cauda: acaso(50, 100), vida: acaso(2, 4) });
      if (op.aoEvento) op.aoEvento('juncao', x, y);
    }
    function esbarroes() {
      for (var i = 0; i < lista.length; i++) {
        var a = lista[i];
        if (a.morre || a.idade < IMUNE || (a.px === a.x && a.py === a.y)) continue;
        for (var j = 0; j < lista.length; j++) {
          var o = lista[j];
          if (o === a || !o.ini || o.idade < IMUNE) continue;
          if (!o.morre && j > i && Math.hypot(a.x - o.x, a.y - o.y) < CHOQUE_DIST) {
            if (parLivre(a, o)) choque(a, o, (a.x + o.x) / 2, (a.y + o.y) / 2);
            break;
          }
          /* a cabeça de a, neste quadro, cruzou a cauda visível de o? */
          var p = null, qx = o.ini.x, qy = o.ini.y;
          for (var s = 1; s <= o.pts.length && !p; s++) {
            var rx = s < o.pts.length ? o.pts[s].x : o.x, ry = s < o.pts.length ? o.pts[s].y : o.y;
            p = cruza(a.px, a.py, a.x, a.y, qx, qy, rx, ry);
            qx = rx; qy = ry;
          }
          if (!p || !parLivre(a, o)) continue;
          if (!o.morre && Math.hypot(o.x - p.x, o.y - p.y) < CHOQUE_NA_CAUDA) choque(a, o, p.x, p.y);
          else juncao(a, o, p.x, p.y);
          if (a.morre) break;
        }
      }
    }

    /* ---------- por quadro ---------- */
    /* amb: { atratores: [{ x, y, r, s }], vento (multiplicador da velocidade), semear (bool) } */
    var proxSemente = 0;
    function passo(dt, amb) {
      relogio += dt;
      var T = op.tela(), i, f;
      /* os vizinhos se procuram: cada cabeça viva puxa as outras de leve */
      var atr = amb.atratores.slice();
      for (i = 0; i < lista.length; i++) if (!lista[i].morre && !lista[i].trilho) atr.push({ x: lista[i].x, y: lista[i].y, r: 280, s: 1.2, dono: lista[i] });
      for (i = lista.length - 1; i >= 0; i--) {
        f = lista[i];
        f.px = f.x; f.py = f.y;
        f.idade += dt;
        f.carga = Math.max(0, f.carga - dt * 0.5);
        if (f.morre) {
          f.cauda -= f.vel * 1.6 * dt;   /* a cabeça para e a cauda se recolhe nela */
          if (f.cauda <= 2) { lista.splice(i, 1); continue; }
          aparar(f);
          continue;
        }
        var resta = f.vel * (1 + f.carga * 0.6) * (amb.vento || 1) * dt;
        while (resta > 0) {
          var anda = Math.min(resta, PASSO - f.anda);
          f.x += f.vx * anda; f.y += f.vy * anda; f.anda += anda; resta -= anda;
          if (f.anda >= PASSO - 1e-6) { f.anda = 0; decidir(f, atr, T); }
        }
        aparar(f);
        /* entrou no campo (puxado pelo fôlego do reator): a energia é entregue na borda */
        if (!noCampo(f.px, f.py) && noCampo(f.x, f.y)) {
          f.morre = true;
          evento('juncao', f.x, f.y);
          if (op.aoEvento) op.aoEvento('entrega', f.x, f.y);
          continue;
        }
        if (f.idade > f.vida) f.morre = true;
        if (f.x < -80 || f.x > T.W + 80 || f.y < T.topo - 120 || f.y > T.H + 80) f.morre = true;
      }
      esbarroes();
      for (i = eventos.length - 1; i >= 0; i--) { eventos[i].t += dt; if (eventos[i].t >= eventos[i].dura) eventos.splice(i, 1); }
      if (relogio % 5 < dt) for (var k in pares) if (relogio - pares[k] > COOLDOWN_PAR) delete pares[k];
      if (amb.semear) {
        proxSemente -= dt;
        if (proxSemente <= 0 && vivos() < alvo()) { semear(); proxSemente = amb.intervalo || acaso(0.25, 0.6); }
      }
    }

    /* ---------- desenho (nítido: traços de 1 px, sem sombra nem desfoque) ---------- */
    function desenhar(trilho, respira) {
      for (var i = 0; i < lista.length; i++) {
        var f = lista[i];
        if (f.trilho !== trilho || !f.ini) continue;
        /* ao se recolher, o feixe inteiro apaga junto com a cauda */
        var vida = f.morre ? Math.max(0, f.cauda / f.caudaCheia) : 1;
        var nasce = Math.min(1, f.idade / 0.3), A = f.base * (1 + f.carga * 0.8) * nasce * respira * (0.35 + 0.65 * vida);
        /* a cauda: da ponta (apagada) à cabeça (acesa), trecho a trecho */
        var ax = f.ini.x, ay = f.ini.y, s0 = 0, total = 0, j;
        var pts = f.pts, n = pts.length;
        for (j = 1; j <= n; j++) { var bx0 = j < n ? pts[j].x : f.x, by0 = j < n ? pts[j].y : f.y; total += Math.hypot(bx0 - ax, by0 - ay); ax = bx0; ay = by0; }
        if (total < 0.5) continue;
        ax = f.ini.x; ay = f.ini.y;
        ctx.lineWidth = f.carga > 0.5 ? 1.3 : 1;
        var cor = f.carga > 0.5 ? C.AC2 : C.AC;
        for (j = 1; j <= n; j++) {
          var bx = j < n ? pts[j].x : f.x, by = j < n ? pts[j].y : f.y, seg = Math.hypot(bx - ax, by - ay);
          if (seg < 0.5) { ax = bx; ay = by; continue; }
          var a0 = A * Math.pow(s0 / total, 1.1), a1 = A * Math.pow((s0 + seg) / total, 1.1);
          var g = ctx.createLinearGradient(ax, ay, bx, by);
          g.addColorStop(0, 'rgba(' + cor + ',' + Math.min(1, a0).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(' + cor + ',' + Math.min(1, a1).toFixed(3) + ')');
          ctx.strokeStyle = g;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          s0 += seg; ax = bx; ay = by;
        }
        /* a cabeça: branca quando carregada */
        ctx.fillStyle = 'rgba(' + (f.carga > 0.6 ? C.T1 : C.AC2) + ',' + (0.9 * nasce * vida * respira).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(f.x, f.y, 1.3 + f.carga * 0.7, 0, TAU); ctx.fill();
      }
    }
    function desenharEventos() {
      ctx.lineWidth = 1;
      for (var i = 0; i < eventos.length; i++) {
        var e = eventos[i], k = e.t / e.dura, s = saida(k), a = 1 - k, r;
        if (e.tipo === 'juncao') {
          r = 3 + 4 * s;
          ctx.strokeStyle = 'rgba(' + C.AC2 + ',' + (0.9 * a).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(e.x, e.y - r); ctx.lineTo(e.x + r, e.y); ctx.lineTo(e.x, e.y + r); ctx.lineTo(e.x - r, e.y); ctx.closePath(); ctx.stroke();
        } else if (e.tipo === 'choque') {
          ctx.strokeStyle = 'rgba(' + C.AC2 + ',' + (0.8 * a).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(e.x, e.y, 3 + 26 * s, 0, TAU); ctx.stroke();
          ctx.strokeStyle = 'rgba(' + C.T1 + ',' + (0.9 * a * a).toFixed(3) + ')';
          ctx.beginPath();
          for (var d = 0; d < 8; d++) {
            var r0 = 4 + 18 * s, r1 = r0 + 6 * a;
            ctx.moveTo(e.x + DIRS[d][0] * r0, e.y + DIRS[d][1] * r0); ctx.lineTo(e.x + DIRS[d][0] * r1, e.y + DIRS[d][1] * r1);
          }
          ctx.stroke();
        } else if (e.tipo === 'toque') {
          ctx.strokeStyle = 'rgba(' + C.AC2 + ',' + (0.7 * a).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(e.x, e.y, 2 + 12 * s, 0, TAU); ctx.stroke();
        } else if (e.tipo === 'pulso') {
          ctx.strokeStyle = 'rgba(' + C.AC + ',' + (0.7 * a).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(e.x, e.y, 4 + 46 * s, 0, TAU); ctx.stroke();
          if (k > 0.15) { var k2 = (k - 0.15) / 0.85; ctx.strokeStyle = 'rgba(' + C.AC2 + ',' + (0.5 * (1 - k2)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(e.x, e.y, 3 + 26 * saida(k2), 0, TAU); ctx.stroke(); }
        }
      }
    }

    /* ---------- de fora ---------- */
    /* a página rolou: os feixes andam com ela, devagar (paralaxe) */
    function deslocar(dy) {
      if (!dy) return;
      for (var i = 0; i < lista.length; i++) {
        var f = lista[i];
        f.y -= dy; f.py -= dy;
        for (var j = 0; j < f.pts.length; j++) f.pts[j].y -= dy;
        if (f.ini) f.ini.y -= dy;
      }
      for (var e = 0; e < eventos.length; e++) eventos[e].y -= dy;
    }
    /* um pulso num ponto: anel e `n` feixes saindo em cruz (ou em X) */
    function pulso(x, y, n, o) {
      evento('pulso', x, y);
      var gira = Math.random() < 0.5 ? 0 : 1;
      for (var i = 0; i < n; i++) criar(x, y, (gira + i * (8 / n)) % 8 | 0, { forcar: true, carga: (o && o.carga) || 0.9, cauda: acaso(70, 140), vida: acaso(2.5, 5) });
    }
    /* quem está perto de (x, y): o mais perto, ou null */
    function perto(x, y, r) {
      var melhor = null, dm = r * r;
      for (var i = 0; i < lista.length; i++) {
        var f = lista[i]; if (f.morre) continue;
        var d = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y);
        if (d < dm) { dm = d; melhor = f; }
      }
      return melhor;
    }
    /* para levar à próxima página: a cabeça e a direção de cada feixe */
    function guardar(W, H) {
      var out = [];
      for (var i = 0; i < lista.length; i++) { var f = lista[i]; if (!f.morre && !f.trilho) out.push([+(f.x / W).toFixed(4), +(f.y / H).toFixed(4), f.d, Math.round(f.cauda)]); }
      return out;
    }
    function herdar(dados, W, H) {
      for (var i = 0; i < dados.length; i++) {
        var v = dados[i], d = v[2] | 0, x = v[0] * W, y = v[1] * H, atras = Math.min(v[3], 60);
        var f = criar(x, y, d, { forcar: true, cauda: v[3] });
        if (f) { f.pts[0] = { x: x - DIRS[d][0] * atras, y: y - DIRS[d][1] * atras }; f.idade = 1; aparar(f); }
      }
    }

    return {
      lista: lista, criar: criar, semear: semear, passo: passo, desenhar: desenhar, desenharEventos: desenharEventos,
      deslocar: deslocar, pulso: pulso, noCampo: noCampo, perto: perto, evento: evento, guardar: guardar, herdar: herdar,
      dirDe: dirDe, alvo: alvo, limparEventos: function () { eventos.length = 0; }
    };
  };
})();
