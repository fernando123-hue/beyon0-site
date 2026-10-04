/* ==========================================================================
   AS ESTAÇÕES — um AI Core de tamanho médio ao lado de cada grupo de
   módulos (pedido do dono, 2026-10-03: "num local com muitos cards, um AI
   Core médio conectado a eles, transmitindo energia, e o mini podendo
   turbinar essa energia"). Só no DESKTOP: no celular os módulos ocupam a
   largura e não há margem livre sem cobrir texto (análise no PLANO §19).

   - ONDE: pousada na régua da esquerda do instrumento (js/trilho.js), na
     altura do meio de um grupo de 3+ módulos irmãos encostado na coluna da
     esquerda; só se couber na margem.
   - O CORPO (canvas próprio, acima das seções, como o do mini): miolo com
     anel e 12 filamentos, um aro de 3 partes e outro de 6 girando em
     sentidos opostos, a ÓRBITA tracejada achatada (a marca do núcleo do
     reator), o estator com 12 marcas (parado) e a CARGA em 12 segmentos.
   - A ENERGIA: no começo de cada inspiração (quando o pulso do instrumento
     não está correndo) ela manda um SURTO pela régua e pelo barramento de
     cada fileira; a aresta de cima de cada módulo acende quando a frente
     passa por ele (classe .is-onda). O pulso
     do instrumento que passa por ela a carrega um pouco.
   - O TURBO: carga cheia = surto rápido, duplo; os módulos acendem inteiros
     (.is-energia) e as cantoneiras da seção piscam. Quem enche: o MINI, que
     vem até ela, se acopla SOBRE a régua, acima dela, e transfere energia (sozinho de vez em
     quando, ou quando você clica na estação). Sob o cursor ela acelera e o
     núcleo olha para você.
   Só traço nítido de 1 px (o dono proíbe desfoque). Movimento reduzido: um
   quadro parado, sem surto. Leis do projeto: um rAF (B.add), layout só em
   evento (a geometria vem da rede, em posições de LAYOUT).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || !B.rede || !B.rede.trilho) return;

  var TAU = Math.PI * 2;
  var CORPO = 112, R = { nucleo: 3, anel: 5.5, fios: [7.5, 12], aroA: 16, aroB: 24, orbita: [27, 8], estator: 31, carga: 39 };
  var CABE = { margem: 44, coluna: 46 };                       /* px livres pedidos à esquerda e até a coluna */
  var SURTO = { v: 900, vTurbo: 1600, cabeca: 14, degraus: [[40, 0.5], [120, 0.2]], escalona: 0.12 };
  var CARGA = { base: 0.42, folego: 0.1, pulso: 0.12, cai: 0.09, enche: 2, teto: 3 };   /* /s; s para encher no acoplamento; s no máximo acoplada */
  var GIRO = { a: -0.9, b: 0.5, turbo: 4, sob: 1.8 };          /* rad/s */
  var MINI = { acima: 62 };                                     /* px: o mini acopla SOBRE a régua, acima da estação (cabe em qualquer margem) */
  var ORBITA = [3, 3], SEM_TRACO = [];                                          /* o tracejado da órbita (sem alocar por quadro) */
  var ONDA_MS = 600;                                            /* o surto comum: a aresta de cima do módulo acesa */

  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), T1 = '242,244,244';
  var palco = document.querySelector('.mini-palco');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var estacoes = [], rolagem = window.scrollY, altura = window.innerHeight, faseAntes = 0, ponteiro = { x: -1e4, y: -1e4 };

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }
  function cor(c, a) { return 'rgba(' + c + ',' + limitar(a).toFixed(3) + ')'; }

  /* ---------- montagem: uma estação por grupo que cabe ---------- */
  function criarCanvas() {
    var cv = document.createElement('canvas');
    cv.className = 'estacao';
    cv.width = cv.height = Math.round(CORPO * dpr);
    cv.setAttribute('aria-hidden', 'true');
    (palco || document.body).appendChild(cv);
    return cv;
  }
  function remontar() {
    var g = B.rede.trilho.geo(), grupos = B.rede.grupos(), i;
    var cabe = g.xE - CABE.margem >= 2 && g.colE - g.xE >= CABE.coluna;
    var antes = estacoes;
    estacoes = [];
    for (i = 0; cabe && i < grupos.length; i++) {
      var gr = grupos[i];
      /* só grupo encostado na coluna da esquerda: o surto sai da régua direto para o 1º módulo de cada fileira */
      var encosta = true;
      /* fileiras: os módulos na mesma altura (o barramento as liga da esquerda para a direita) */
      var filas = [];
      for (var k = 0; k < gr.itens.length; k++) {
        var it = gr.itens[k], f = null;
        for (var q = 0; q < filas.length && !f; q++) if (Math.abs(filas[q].y0 - it.dy) < 6) f = filas[q];
        if (!f) { f = { y0: it.dy, itens: [] }; filas.push(f); }
        f.itens.push(it);
      }
      for (var p = 0; p < filas.length; p++) {
        var fl = filas[p];
        fl.itens.sort(function (a, b) { return a.dx - b.dx; });
        fl.y = fl.y0 + Math.min(28, fl.itens[0].h / 2);
        if (fl.itens[0].dx - g.colE > 40) encosta = false;
      }
      if (!encosta) continue;
      var y0 = gr.itens[0].dy, y1 = 0;
      for (k = 0; k < gr.itens.length; k++) { y0 = Math.min(y0, gr.itens[k].dy); y1 = Math.max(y1, gr.itens[k].dy + gr.itens[k].h); }
      /* a altura: o CORREDOR entre fileiras mais perto do meio do grupo (por ele o
         mini atravessa a página sem passar por cima dos módulos); sem corredor, o meio */
      var meio = (y0 + y1) / 2, yd = meio, corredor = null;
      filas.sort(function (a, b) { return a.y0 - b.y0; });
      for (var c = 1; c < filas.length; c++) {
        var fimAntes = 0;
        for (var q2 = 0; q2 < filas[c - 1].itens.length; q2++) fimAntes = Math.max(fimAntes, filas[c - 1].itens[q2].dy + filas[c - 1].itens[q2].h);
        var cy = (fimAntes + filas[c].y0) / 2;
        if (filas[c].y0 - fimAntes > 12 && (corredor === null || Math.abs(cy - meio) < Math.abs(corredor - meio))) corredor = cy;
      }
      if (corredor !== null) yd = corredor;
      /* a mesma estação continua o MESMO objeto ao remedir (o mini guarda a referência
         dela no acoplamento: um objeto novo deixava o mini preso à cópia velha) */
      var velha = antes[estacoes.length];
      var st = velha || { cv: criarCanvas(), carga: CARGA.base, giroA: 0, giroB: 0, sob: 0, surtos: [], turboHa: 99, acopla: null, olhar: { x: 0, y: 0 } };
      st.n = estacoes.length + 1; st.yd = Math.round(yd); st.corredor = corredor !== null; st.filas = filas; st.surtos.length = 0;
      estacoes.push(st);
    }
    for (i = estacoes.length; i < antes.length; i++) antes[i].cv.remove();
    for (i = 0; i < estacoes.length; i++) ligarCanvas(estacoes[i]);
    B.rede.trilho.reservar(estacoes.map(function (s) { return [s.yd - R.carga - 12, s.yd + R.carga + 12]; }));
  }
  function ligarCanvas(st) {
    if (st.cv.dataset.ligado) return;
    st.cv.dataset.ligado = '1';
    st.cv.addEventListener('pointerenter', function () { st.sobAlvo = true; });
    st.cv.addEventListener('pointerleave', function () { st.sobAlvo = false; });
    st.cv.addEventListener('click', function () { if (!B.reduced) chamar(st); });
  }

  /* ---------- a energia ---------- */
  /* um surto a partir da estação: uma frente por fileira, escalonadas */
  function surto(st, turbo) {
    for (var i = 0; i < st.filas.length; i++) {
      st.surtos.push({ fila: st.filas[i], s: -i * SURTO.escalona * (turbo ? SURTO.vTurbo : SURTO.v), turbo: !!turbo, acesos: 0 });
      if (turbo) st.surtos.push({ fila: st.filas[i], s: -(i * SURTO.escalona + 0.18) * SURTO.vTurbo, turbo: true, acesos: 0 });
    }
  }
  /* o comprimento do caminho até cada módulo da fileira: pela régua até a altura dela, e pelo barramento */
  function caminhoAte(st, fila, g, alvoX) { return Math.abs(fila.y - st.yd) + Math.max(0, alvoX - g.xE); }
  /* o módulo responde (classe por evento; nada de CSS mudando por quadro): o canvas do
     fundo fica atrás do módulo opaco, então quem mostra a chegada é o próprio módulo */
  var ENERGIA_MS = { turbo: 1300 };
  function energizar(el, turbo) {
    var classe = turbo ? 'is-energia' : 'is-onda';
    el.classList.add(classe);
    clearTimeout(el['_' + classe]);
    el['_' + classe] = setTimeout(function () { el.classList.remove(classe); }, turbo ? ENERGIA_MS.turbo : ONDA_MS);
  }
  function turbinar(st) { st.carga = 1; st.turboHa = 0; surto(st, true); B.rede.trilho.piscar(); }
  /* o mini vem (se estiver ativo); sem ele, ela turbina sozinha */
  function chamar(st) {
    var mini = B.rede.extra;
    if (mini && mini.ativo && mini.irPara) mini.irPara(st);
    else turbinar(st);
  }

  /* ---------- por quadro ---------- */
  function tela(st) { var g = B.rede.trilho.geo(); return { x: g.xE, y: st.yd - rolagem }; }
  function passo(dt) {
    if (!estacoes.length) return;
    var g = B.rede.trilho.geo(), H = altura, t = B.relogio(), F = B.FOLEGO;
    var x = ((t / F.periodo) % 1 + 1) % 1, inspirou = faseAntes > 0.9 && x < 0.1, expirou = faseAntes < F.inspira && x >= F.inspira;
    var folego = x < F.inspira ? suave(x / F.inspira) : 1 - suave((x - F.inspira) / (1 - F.inspira));
    faseAntes = x;
    for (var i = 0; i < estacoes.length; i++) {
      var st = estacoes[i], y = st.yd - rolagem, naTela = y > g.topo - CORPO && y < H + CORPO;
      st.turboHa += dt;
      if (B.reduced) { st.surtos.length = 0; st.acopla = null; continue; }
      /* a carga: respira em volta da base; o pulso do instrumento a sobe; o turbo a enche e ela volta devagar */
      var base = CARGA.base + CARGA.folego * folego;
      if (expirou && naTela) st.carga = Math.min(0.97, st.carga + CARGA.pulso);
      st.carga += (base - st.carga) * Math.min(1, dt * CARGA.cai);
      if (st.acopla) {
        st.acopla.t += dt;
        if (st.acopla.t > CARGA.teto) st.carga = 1;   /* rede de segurança: o acoplamento nunca passa do teto */
        st.carga = Math.min(1, st.carga + dt / CARGA.enche);
        if (st.carga >= 1) { st.acopla = null; turbinar(st); }
      }
      if (inspirou && naTela) surto(st, false);
      st.sob += ((st.sobAlvo ? 1 : 0) - st.sob) * Math.min(1, dt * 6);
      var turbo = Math.max(0, 1 - st.turboHa / 2.5);
      st.giroA += dt * GIRO.a * (1 + GIRO.turbo * turbo + GIRO.sob * st.sob);
      st.giroB += dt * GIRO.b * (1 + GIRO.turbo * turbo + GIRO.sob * st.sob);
      /* o núcleo olha para o cursor quando ele está perto */
      var dx = ponteiro.x - g.xE, dy = ponteiro.y - y, d = Math.hypot(dx, dy) || 1, perto = d < 260 ? 1 : 0;
      st.olhar.x += ((perto ? dx / d : 0) - st.olhar.x) * Math.min(1, dt * 5);
      st.olhar.y += ((perto ? dy / d : 0) - st.olhar.y) * Math.min(1, dt * 5);
      for (var k = st.surtos.length - 1; k >= 0; k--) {
        var su = st.surtos[k], fl = su.fila, fim = caminhoAte(st, fl, g, fl.itens[fl.itens.length - 1].dx + 4);
        su.s += dt * (su.turbo ? SURTO.vTurbo : SURTO.v);
        /* a frente passou pela borda esquerda de um módulo: ele acende */
        while (su.acesos < fl.itens.length && su.s >= caminhoAte(st, fl, g, fl.itens[su.acesos].dx)) { B.rede.acender(fl.itens[su.acesos].el, su.turbo); energizar(fl.itens[su.acesos].el, su.turbo); su.acesos++; }   /* o surto comum acende a aresta de cima; o turbo, o módulo inteiro */
        if (su.s - SURTO.degraus[1][0] > fim) st.surtos.splice(k, 1);
      }
    }
  }

  /* o surto e o acoplamento, no canvas do fundo (atrás do texto) */
  function desenharFundo(ctx) {
    if (!estacoes.length || B.reduced) return;
    var g = B.rede.trilho.geo();
    for (var i = 0; i < estacoes.length; i++) {
      var st = estacoes[i], sy = st.yd - rolagem;
      for (var k = 0; k < st.surtos.length; k++) desenharSurto(ctx, st, st.surtos[k], g, sy);
      var mini = B.rede.extra;
      if (st.acopla && mini) {
        /* a transferência: o fio do mini até a estação e pacotes correndo para ela */
        ctx.lineWidth = 1;
        ctx.strokeStyle = cor(AC2, 0.55);
        ctx.beginPath(); ctx.moveTo(mini.x, mini.y); ctx.lineTo(g.xE, sy); ctx.stroke();
        var L = Math.hypot(g.xE - mini.x, sy - mini.y) || 1, ux = (g.xE - mini.x) / L, uy = (sy - mini.y) / L;
        ctx.strokeStyle = cor(T1, 0.95); ctx.lineWidth = 1.6;
        for (var p = 0; p < 3; p++) {
          var at = ((st.acopla.t * 2.2 + p / 3) % 1) * L;
          ctx.beginPath(); ctx.moveTo(mini.x + ux * at, mini.y + uy * at); ctx.lineTo(mini.x + ux * Math.min(L, at + 7), mini.y + uy * Math.min(L, at + 7)); ctx.stroke();
        }
        ctx.lineWidth = 1;
      }
    }
  }
  /* o caminho da frente: da estação pela régua até a fileira e dali pelo barramento */
  function pontoNoCaminho(st, fila, g, sy, s) {
    var vy = fila.y - rolagem, h = Math.abs(vy - sy);
    if (s <= h) return { x: g.xE, y: sy + Math.sign(vy - sy) * s };
    return { x: g.xE + (s - h), y: vy };
  }
  function desenharSurto(ctx, st, su, g, sy) {
    if (su.s <= 0) return;
    var fl = su.fila, fim = caminhoAte(st, fl, g, fl.itens[fl.itens.length - 1].dx + 4), forca = su.turbo ? 1 : 0.7;
    var de = Math.min(su.s, fim);
    for (var d = -1; d < SURTO.degraus.length; d++) {
      var ate = d < 0 ? SURTO.cabeca : SURTO.degraus[d][0], a = (d < 0 ? 0.95 : SURTO.degraus[d][1]) * forca;
      var s0 = Math.max(0, su.s - ate), s1 = de;
      de = Math.min(de, s0);
      if (s1 <= s0) continue;
      ctx.lineWidth = d < 0 ? (su.turbo ? 1.8 : 1.4) : 1;
      ctx.strokeStyle = cor(d < 0 ? (su.turbo ? T1 : AC2) : AC, a);
      ctx.beginPath();
      /* em até 3 pontos (pode virar a esquina da régua para o barramento) */
      var p0 = pontoNoCaminho(st, fl, g, sy, s0), p1 = pontoNoCaminho(st, fl, g, sy, s1), h = Math.abs(fl.y - rolagem - sy);
      ctx.moveTo(p0.x, p0.y);
      if (s0 < h && s1 > h) ctx.lineTo(g.xE, fl.y - rolagem);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  /* o corpo, no canvas dele */
  function pintar() {
    if (!estacoes.length) return;
    var g = B.rede.trilho.geo(), H = altura, t = B.relogio(), F = B.FOLEGO;
    var x = ((t / F.periodo) % 1 + 1) % 1, folego = B.reduced ? 1 : x < F.inspira ? suave(x / F.inspira) : 1 - suave((x - F.inspira) / (1 - F.inspira));
    for (var i = 0; i < estacoes.length; i++) {
      var st = estacoes[i], sy = st.yd - rolagem, cv = st.cv;
      var naTela = sy > g.topo + R.carga && sy < H - 40 && document.body.classList.contains('is-menu') === false;
      if (naTela !== st.visivel) { cv.style.opacity = naTela ? '1' : '0'; cv.style.pointerEvents = naTela ? 'auto' : 'none'; st.visivel = naTela; }
      if (!naTela) continue;
      cv.style.transform = 'translate3d(' + (g.xE - CORPO / 2).toFixed(1) + 'px,' + (sy - CORPO / 2).toFixed(1) + 'px,0)';
      desenharCorpo(cv.getContext('2d'), st, folego);
    }
  }
  function desenharCorpo(c, st, folego) {
    var m = CORPO / 2, turbo = B.reduced ? 0 : Math.max(0, 1 - st.turboHa / 2.5), j;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, CORPO, CORPO);
    c.lineWidth = 1;
    /* o estator: anel e 12 marcas, parado */
    c.strokeStyle = cor(AC, 0.32 + 0.2 * st.sob);
    c.beginPath(); c.arc(m, m, R.estator, 0, TAU);
    for (j = 0; j < 12; j++) {
      var a = j * TAU / 12 - Math.PI / 2, l = j % 3 ? 3 : 5;
      c.moveTo(m + Math.cos(a) * R.estator, m + Math.sin(a) * R.estator); c.lineTo(m + Math.cos(a) * (R.estator + l), m + Math.sin(a) * (R.estator + l));
    }
    c.stroke();
    /* a carga em 12 segmentos de 2 px (casam com as marcas do estator), do topo no sentido horário */
    var cheios = Math.floor(limitar(st.carga) * 12 + 0.001), cheia = st.carga > 0.97;
    c.lineWidth = 2;
    for (var pas = 0; pas < 2; pas++) {
      c.strokeStyle = pas ? cor(cheia ? T1 : AC2, 0.85) : cor(AC, 0.13);
      c.beginPath();
      for (j = 0; j < 12; j++) {
        if ((j < cheios) !== !!pas) continue;
        var s0 = -Math.PI / 2 + j * TAU / 12 + 0.06, s1 = s0 + TAU / 12 - 0.12;
        c.moveTo(m + Math.cos(s0) * R.carga, m + Math.sin(s0) * R.carga); c.arc(m, m, R.carga, s0, s1);
      }
      c.stroke();
    }
    c.lineWidth = 1;
    /* a órbita tracejada, achatada como a do núcleo do reator (a marca da família); a metade de cima, a de trás, mais fraca */
    c.setLineDash(ORBITA);
    c.lineDashOffset = -st.giroA * 6;
    c.strokeStyle = cor(AC2, 0.3);
    c.beginPath(); c.ellipse(m, m, R.orbita[0], R.orbita[1], 0, Math.PI, TAU); c.stroke();
    c.strokeStyle = cor(AC2, 0.7);
    c.beginPath(); c.ellipse(m, m, R.orbita[0], R.orbita[1], 0, 0, Math.PI); c.stroke();
    c.setLineDash(SEM_TRACO);
    c.lineDashOffset = 0;
    /* os dois aros em sentidos opostos */
    c.strokeStyle = cor(AC2, 0.7);
    c.beginPath();
    for (j = 0; j < 3; j++) { var a0 = st.giroA + j * TAU / 3; c.moveTo(m + Math.cos(a0) * R.aroA, m + Math.sin(a0) * R.aroA); c.arc(m, m, R.aroA, a0, a0 + 1.1); }
    c.stroke();
    c.strokeStyle = cor(AC, 0.55);
    c.beginPath();
    for (j = 0; j < 6; j++) { var b0 = st.giroB + j * TAU / 6; c.moveTo(m + Math.cos(b0) * R.aroB, m + Math.sin(b0) * R.aroB); c.arc(m, m, R.aroB, b0, b0 + 0.5); }
    c.stroke();
    /* o núcleo e os filamentos (esticam no turbo e ao inspirar), olhando para o cursor */
    var ox = st.olhar.x * 2, oy = st.olhar.y * 2, cx = m + ox, cy = m + oy;
    var fim = R.fios[1] + 3 * folego + 7 * turbo;
    c.strokeStyle = cor(AC2, 0.8);
    c.beginPath();
    for (j = 0; j < 12; j++) {
      var af = j * TAU / 12 + st.giroB * 0.3, lf = j % 3 ? fim - 2 : fim;
      c.moveTo(cx + Math.cos(af) * R.fios[0], cy + Math.sin(af) * R.fios[0]); c.lineTo(cx + Math.cos(af) * lf, cy + Math.sin(af) * lf);
    }
    c.stroke();
    c.fillStyle = cor(T1, 1);
    c.beginPath(); c.arc(cx, cy, R.nucleo * (1 + 0.15 * folego + 0.3 * turbo), 0, TAU); c.fill();
    c.strokeStyle = cor(AC2, 0.85);
    c.beginPath(); c.arc(cx, cy, R.anel, 0, TAU); c.stroke();
    /* o turbo: um anel que abre para fora do estator e some */
    if (turbo > 0.01) {
      var k = 1 - turbo;
      c.strokeStyle = cor(T1, 0.8 * turbo);
      c.beginPath(); c.arc(m, m, R.estator + 4 + 14 * (1 - (1 - k) * (1 - k)), 0, TAU); c.stroke();
    }
  }

  /* ---------- de fora ---------- */
  B.estacoes = {
    /* a estação na tela mais perto de (x, y), ou null */
    naTela: function (x, y) {
      var g = B.rede.trilho.geo(), H = altura, melhor = null, dm = 1e9;
      for (var i = 0; i < estacoes.length; i++) {
        var sy = estacoes[i].yd - rolagem;
        if (sy < g.topo + 80 || sy > H - 120) continue;
        var d = Math.abs(sy - y);
        if (d < dm) { dm = d; melhor = estacoes[i]; }
      }
      return melhor;
    },
    /* o caminho do mini até ela (documento): pela régua da direita até o corredor,
       pelo corredor até perto dela; [] sem corredor (vai direto) */
    via: function (st, xDe) {
      if (!st.corredor) return [];
      var g = B.rede.trilho.geo();
      return [{ x: xDe, py: st.yd }, { x: g.colE - 12, py: st.yd }];
    },
    /* onde o mini fica acoplado (tela) */
    doca: function (st) { var p = tela(st); return { x: p.x, y: p.y - MINI.acima }; },
    /* o mini chegou: começa a transferência */
    acoplar: function (st) { if (!B.reduced && !st.acopla) st.acopla = { t: 0 }; },
    soltar: function (st) { st.acopla = null; },
    podeTurbinar: function (st) { return st.turboHa > 20 && !st.acopla; },
    turbinando: function (st) { return !!st.acopla; },
    /* só leitura, para os testes: o que cada estação está fazendo */
    estado: function () { return estacoes.map(function (st) { return { carga: +st.carga.toFixed(2), acoplada: !!st.acopla, turboHa: +st.turboHa.toFixed(1), surtos: st.surtos.length, visivel: !!st.visivel }; }); }
  };

  B.rede.fundos.push({ desenharFundo: desenharFundo });
  B.on('rede:medida', remontar);
  window.addEventListener('scroll', function () { rolagem = window.scrollY; }, { passive: true });
  window.addEventListener('resize', function () { altura = window.innerHeight; }, { passive: true });
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('pointermove', function (e) { ponteiro.x = e.clientX; ponteiro.y = e.clientY; }, { passive: true });
  }
  remontar();
  B.add('estacao', function (S) { passo(Math.min(0.05, S.dt / 1000)); pintar(); });
})();
