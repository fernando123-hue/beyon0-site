/* ==========================================================================
   O INSTRUMENTO DESENROLADO — o fundo do DESKTOP fora do hero do Hub (e nas
   páginas sem reator). Pedido do dono, 2026-10-03: "o fundo [o Campo do
   Reator] ficou bacana, funcionaria pro hero com algo a mais; mas pro site
   todo não cai muito bem" e "no celular ficou muito bom: remodele só no
   desktop". Longe do reator a geometria polar virava diagonais soltas
   cruzando a leitura.

   A régua do reator, desenrolada ao longo da página:
   - duas RÉGUAS verticais nas margens, presas ao DOCUMENTO (marcas a cada
     24 px, fortes a cada 96): a página é medida enquanto rola. (As cotas em
     px saíram na crítica de arte: liam como número de enfeite);
   - um HORIZONTE em cada começo de seção: cruz de registro na régua (acende
     quando o mini passa por ela), o índice da seção e um tracejado fraco
     atravessando a coluna;
   - LIGAÇÕES: da régua até a borda de cada módulo encostado na coluna;
   - a ENERGIA segue o fôlego do reator (o mesmo relógio): ao expirar, um
     PULSO desce pelas réguas, atravessa cada horizonte das bordas para o
     meio e corre pelas ligações até os módulos (que acendem: js/rede.js);
     ao inspirar, PACOTES sobem pelas réguas até o topo, para o reator;
   - a SEÇÃO ATUAL: a régua acende do começo dela até onde você leu (uma
     barra de progresso, com um traço na leitura), cantoneiras de 12 px nos
     cantos dela e o nome ao longo da régua da direita ("03/05 · MÉTODO");
   - um FLUXO de traços nas réguas, descendo na esquerda e subindo na
     direita (o reator gira as camadas em sentidos alternados; o fundo
     também);
   - o CURSOR acende a altura dele nas duas réguas; uma opção sob o cursor
     liga-se à régua mais perto (a ROTA) e ganha a marca de rumo.

   Mesma interface do campo (js/campo.js) para a ponte (js/rede.js): a
   "distância" das ondas é a altura abaixo do topo da zona. Só traço nítido
   de 1 px, nada de desfoque ou degradê (o dono proíbe): rastros em degraus.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;

  var MARCA = { menor: 24, maior: 96 };                          /* px do documento */
  /* o pulso é o mais visível do fundo (crítica de arte): cabeça longa e degraus fortes */
  var PULSO = { v: 1100, cabeca: 22, degraus: [[50, 0.45], [110, 0.24], [180, 0.1]] };   /* px/s; [até px atrás, alfa] */
  var TRAVESSIA = { dura: 0.5, segmento: 26 };                  /* s até o meio; px da frente */
  var LIGA = { dura: 0.22, cabeca: 28 };                        /* s até o módulo; px abaixo do topo dele */
  var PACOTE = { v0: 180, acel: 900, cabeca: 14, cauda: 46 };   /* px/s, px/s², px, px */
  var ROTA = { anda: 0.28 };
  var FLUXO = { traco: 6, vao: 42, vel: 28, alfa: 0.32 };       /* px, px, px/s */
  FLUXO.padrao = [FLUXO.traco, FLUXO.vao];
  var ATUAL = { alfa: 0.42, rotulo: 0.5, canto: 12, recuo: 20 };   /* px da cantoneira e do recuo dela */
  var TRACEJADO = [2, 6], SEM_TRACO = [];   /* (sem alocar por quadro) */
  var FONTE = '400 10px "JetBrains Mono", ui-monospace, monospace';
  var FONTE_RUMO = '500 10px "JetBrains Mono", ui-monospace, monospace';

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function saida(k) { k = limitar(k); return 1 - (1 - k) * (1 - k) * (1 - k); }

  /* op: { ctx, cores: { AC, AC2, T1, PRATA }, livre(x, y) } */
  B.trilho = function (op) {
    var ctx = op.ctx, C = op.cores;
    /* a geometria (documento) e o quadro (tela) */
    var G = { xE: 0, xD: 0, colE: 0, colD: 0, fim: 1e9, rolagem: 0, topo: 0, W: 0, H: 0, rotulos: false };
    var tempo = 0, pisca = 0;   /* pisca: as cantoneiras da seção, no turbo de uma estação (1 → 0) */
    var secoes = [], ligacoes = [];
    var ondas = [], travessias = [], faiscas = [], pacotes = [], rotas = [], marcas = [];
    var mira = { y: 0, f: 0 }, rumo = { y: 0, lado: -1, f: 0, ligado: false, rotulo: '', alvo: 0 };
    var desenhados = 0;

    function cor(c, a) { return 'rgba(' + c + ',' + limitar(a).toFixed(3) + ')'; }
    function telaY(yd) { return yd - G.rolagem; }
    function trilhoX(lado) { return lado < 0 ? G.xE : G.xD; }
    function ladoDe(x) { return x < (G.colE + G.colD) / 2 ? -1 : 1; }
    function losango(x, y, s) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }

    /* ---------- de fora: a geometria medida pela ponte (posições de LAYOUT) ---------- */
    /* g: { colE, colD (a coluna de conteúdo, px), fim (o rodapé), secoes: [{ y, rot, nome }], modulos: [{ x, y, w, h }] } */
    function configurar(g, W) {
      G.colE = g.colE; G.colD = g.colD; G.fim = g.fim;
      var margem = Math.min(g.colE, W - g.colD);
      /* a régua fica no meio da margem, no máximo a 56 px da coluna */
      G.xE = Math.round(Math.max(margem / 2, g.colE - 56)) + 0.5;
      G.xD = Math.round(Math.min(W - margem / 2, g.colD + 56)) - 0.5;
      G.rotulos = G.xE >= 96;   /* o nome da seção e a leitura do rumo só com margem para eles */
      secoes = g.secoes.slice();
      ligacoes.length = 0;
      for (var i = 0; i < g.modulos.length; i++) {
        var m = g.modulos[i], y = m.y + Math.min(LIGA.cabeca, m.h / 2);
        if (m.x - G.colE < 40) ligacoes.push({ y: y, lado: -1, x: m.x });
        if (G.colD - (m.x + m.w) < 40) ligacoes.push({ y: y, lado: 1, x: m.x + m.w });
      }
    }
    /* por quadro: a rolagem e o topo da zona (tela) */
    function origem(rolagem, topo, W, H) { G.rolagem = rolagem; G.topo = topo; G.W = W; G.H = H; }

    /* ---------- energia ---------- */
    function soltarOnda() { ondas.push({ r: 0, rAntes: 0 }); B.emit('trilho:onda'); }
    /* um pacote que sobe pela régua `lado` a partir da altura y (tela) */
    function pacote(y, lado) {
      if (pacotes.length > 30 || y <= G.topo) return null;
      var p = { d: y - G.topo, v: PACOTE.v0, lado: lado };
      pacotes.push(p);
      return p;
    }
    /* a ROTA de um ponto (tela) até a régua mais perto, e o pacote sobe por ela */
    function rota(x, y, o) {
      o = o || {};
      if (y <= G.topo + 4) return null;
      var lado = ladoDe(x);
      var ro = { x: x, yd: y + G.rolagem, lado: lado, t: 0, fica: !!o.fica, vida: o.vida || 1.6, prox: 0, cada: o.cada || 0.75 };
      rotas.push(ro);
      marcas.push({ x: x, yd: ro.yd, t: 0, dura: 0.7 });
      return ro;
    }
    function soltarRota(ro) { var i = rotas.indexOf(ro); if (i >= 0) rotas[i].fica = false; }
    function apontar(x, y, rotulo) {
      if (x === null) { rumo.ligado = false; return; }
      var yd = y + G.rolagem;
      if (!rumo.ligado && rumo.f < 0.05) { rumo.y = yd; rumo.lado = ladoDe(x); }
      rumo.alvo = yd; rumo.lado = ladoDe(x); rumo.rotulo = rotulo || ''; rumo.ligado = true;
    }

    /* ---------- por quadro ---------- */
    var saidaQuadro = { chegadas: 0 };
    function passo(dt, e) {
      saidaQuadro.chegadas = 0;
      tempo = (tempo + dt) % 3600;
      if (pisca > 0) pisca = Math.max(0, pisca - dt * 1.4);
      var i, fim = e.H - G.topo + PULSO.degraus[2][0];
      for (i = ondas.length - 1; i >= 0; i--) {
        var o = ondas[i];
        o.rAntes = o.r; o.r += PULSO.v * dt;
        /* o pulso cruzou um horizonte: a luz atravessa das réguas para o meio */
        for (var s = 0; s < secoes.length; s++) {
          var hs = telaY(secoes[s].y) - G.topo;
          if (o.rAntes < hs && o.r >= hs) travessias.push({ yd: secoes[s].y, t: 0 });
        }
        for (var l = 0; l < ligacoes.length; l++) {
          var hl = telaY(ligacoes[l].y) - G.topo;
          if (o.rAntes < hl && o.r >= hl) faiscas.push({ lg: ligacoes[l], t: 0 });
        }
        if (o.r > fim) ondas.splice(i, 1);
      }
      for (i = travessias.length - 1; i >= 0; i--) {
        var tv = travessias[i], antes = tv.t;
        tv.t += dt;
        /* a luz chegou ao meio do horizonte: a estação da seção (js/estacao.js) recebe pelo alimentador */
        if (antes < TRAVESSIA.dura && tv.t >= TRAVESSIA.dura) B.emit('trilho:meio', tv.yd);
        if (tv.t > TRAVESSIA.dura + 0.7) travessias.splice(i, 1);
      }
      for (i = faiscas.length - 1; i >= 0; i--) { faiscas[i].t += dt; if (faiscas[i].t > LIGA.dura + 0.5) faiscas.splice(i, 1); }
      for (i = pacotes.length - 1; i >= 0; i--) {
        var p = pacotes[i];
        p.v += PACOTE.acel * dt; p.d -= p.v * dt;
        if (p.d <= 0) { pacotes.splice(i, 1); saidaQuadro.chegadas++; }
      }
      for (i = rotas.length - 1; i >= 0; i--) {
        var ro = rotas[i];
        ro.t += dt;
        if (ro.t >= ROTA.anda) {
          ro.prox -= dt;
          if (ro.prox <= 0 && (ro.fica || ro.t < ROTA.anda + 0.05)) { pacote(telaY(ro.yd), ro.lado); ro.prox = ro.cada; }
        }
        if (!ro.fica && ro.t > ro.vida) rotas.splice(i, 1);
      }
      for (i = marcas.length - 1; i >= 0; i--) { marcas[i].t += dt; if (marcas[i].t >= marcas[i].dura) marcas.splice(i, 1); }
      var c = e.cursor;
      var temCursor = c && c.ativo && !e.reduzido && c.y > G.topo;
      if (temCursor) { if (mira.f < 0.05) mira.y = c.y + G.rolagem; mira.y += (c.y + G.rolagem - mira.y) * Math.min(1, dt * 12); }
      mira.f += ((temCursor ? 1 : 0) - mira.f) * Math.min(1, dt * (temCursor ? 6 : 4));
      rumo.f += ((rumo.ligado ? 1 : 0) - rumo.f) * Math.min(1, dt * (rumo.ligado ? 10 : 5));
      rumo.y += (rumo.alvo - rumo.y) * Math.min(1, dt * 9);
      return saidaQuadro;
    }

    /* ---------- desenho ---------- */
    function desenharReguas(resp) {
      var y0 = G.topo, y1 = G.H, livre = op.livre;
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor(C.AC, 0.16 * resp);
      ctx.beginPath();
      ctx.moveTo(G.xE, y0); ctx.lineTo(G.xE, y1);
      ctx.moveTo(G.xD, y0); ctx.lineTo(G.xD, y1);
      ctx.stroke();
      desenhados += 2;
      /* as marcas, para FORA da coluna, presas ao documento */
      var ini = Math.ceil((y0 + G.rolagem) / MARCA.menor) * MARCA.menor;
      for (var pas = 0; pas < 2; pas++) {
        ctx.strokeStyle = pas ? cor(C.PRATA, 0.3 * resp) : cor(C.AC, 0.13 * resp);
        ctx.beginPath();
        for (var yd = ini; yd - G.rolagem < y1; yd += MARCA.menor) {
          var maior = yd % MARCA.maior === 0;
          if (maior !== !!pas) continue;
          var y = Math.round(yd - G.rolagem) + 0.5, l = maior ? 7 : 3;
          ctx.moveTo(G.xE - l, y); ctx.lineTo(G.xE, y);
          ctx.moveTo(G.xD, y); ctx.lineTo(G.xD + l, y);
        }
        ctx.stroke();
      }
    }
    function desenharHorizontes(resp) {
      var livre = op.livre;
      ctx.lineWidth = 1;
      for (var i = 0; i < secoes.length; i++) {
        var y = Math.round(telaY(secoes[i].y)) + 0.5;
        if (y < G.topo - 10 || y > G.H + 10) continue;
        /* nas margens, das réguas até perto da coluna */
        ctx.strokeStyle = cor(C.AC, 0.22 * resp);
        ctx.beginPath();
        ctx.moveTo(G.xE - 12, y); ctx.lineTo(G.colE - 10, y);
        ctx.moveTo(G.colD + 10, y); ctx.lineTo(G.xD + 12, y);
        ctx.stroke();
        /* o tracejado fraco atravessando a coluna (atrás do texto ele some) */
        ctx.strokeStyle = cor(C.AC, 0.06 * resp);
        ctx.setLineDash(TRACEJADO);
        ctx.beginPath(); ctx.moveTo(G.colE - 10, y); ctx.lineTo(G.colD + 10, y); ctx.stroke();
        ctx.setLineDash(SEM_TRACO);
        /* a cruz de registro nas duas réguas (pequena demais para roseta: a
           coroa de tracinhos virava chuvisco, crítica de arte); acende
           quando o mini passa por ela */
        for (var lado = -1; lado <= 1; lado += 2) {
          var x = trilhoX(lado), mi = B.rede && B.rede.extra, perto = mi && mi.ativo && Math.abs(mi.x - x) < 18 && Math.abs(mi.y - y) < 18 ? 1 : 0;
          ctx.strokeStyle = cor(perto ? C.T1 : C.AC2, (0.5 + 0.45 * perto) * resp);
          ctx.beginPath();
          ctx.moveTo(x + 4.5, y); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
          ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
          ctx.stroke();
        }
        desenhados++;
        if (G.rotulos && secoes[i].rot && (!livre || livre(G.xE - 30, y - 12))) {
          B.fonte(ctx, FONTE); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'right';
          ctx.fillStyle = cor(C.AC2, 0.6 * resp);
          ctx.fillText(secoes[i].rot, G.xE - 12, y - 7);
        }
      }
    }
    /* a seção onde está o meio da tela: o trecho dela aceso nas duas réguas e
       o nome ao longo da régua da DIREITA, por fora (a da esquerda tem as cotas) */
    function desenharAtual(resp) {
      var meio = G.rolagem + (G.topo + G.H) / 2, i = -1;
      for (var k = 0; k < secoes.length; k++) if (secoes[k].y <= meio) i = k;
      if (i < 0) return;
      var ini = secoes[i].y, fim = i + 1 < secoes.length ? secoes[i + 1].y : G.fim;
      var prog = limitar((meio - ini) / Math.max(1, fim - ini));
      var y0 = Math.max(G.topo, telaY(ini)), yp = Math.min(G.H, telaY(ini + prog * (fim - ini)));
      ctx.lineWidth = 1;
      /* a régua acende do começo da seção até a leitura, com um traço nela */
      if (yp - y0 > 2) {
        ctx.strokeStyle = cor(C.AC, ATUAL.alfa * resp);
        ctx.beginPath();
        ctx.moveTo(G.xE, y0); ctx.lineTo(G.xE, yp);
        ctx.moveTo(G.xD, y0); ctx.lineTo(G.xD, yp);
        ctx.stroke();
      }
      var ym = Math.round(yp) + 0.5;
      ctx.strokeStyle = cor(C.AC2, 0.8 * resp);
      ctx.beginPath();
      ctx.moveTo(G.xE - 5, ym); ctx.lineTo(G.xE + 5, ym);
      ctx.moveTo(G.xD - 5, ym); ctx.lineTo(G.xD + 5, ym);
      ctx.stroke();
      /* as cantoneiras nos cantos da seção, no vão entre a régua e a coluna */
      var cx0 = G.colE - ATUAL.recuo, cx1 = G.colD + ATUAL.recuo, cyT = telaY(ini) + ATUAL.recuo, cyB = telaY(fim) - ATUAL.recuo, L = ATUAL.canto;
      ctx.strokeStyle = cor(pisca > 0.5 ? C.T1 : C.AC2, Math.min(1, (0.45 + 0.55 * pisca) * resp));
      ctx.beginPath();
      if (cyT > G.topo && cyT < G.H) { ctx.moveTo(cx0, cyT + L); ctx.lineTo(cx0, cyT); ctx.lineTo(cx0 + L, cyT); ctx.moveTo(cx1 - L, cyT); ctx.lineTo(cx1, cyT); ctx.lineTo(cx1, cyT + L); }
      if (cyB > G.topo && cyB < G.H) { ctx.moveTo(cx0, cyB - L); ctx.lineTo(cx0, cyB); ctx.lineTo(cx0 + L, cyB); ctx.moveTo(cx1 - L, cyB); ctx.lineTo(cx1, cyB); ctx.lineTo(cx1, cyB - L); }
      ctx.stroke();
      var sc = secoes[i];
      if (!G.rotulos || !sc.nome || (rumo.lado > 0 && rumo.f > 0.3)) return;   /* a leitura do rumo na direita manda */
      /* o nome: perto do começo da seção, mas sempre dentro da tela e do trecho */
      var y1 = Math.min(G.H, telaY(fim));
      var txt = (sc.rot ? sc.rot + '/' + ('0' + secoes.length).slice(-2) + ' · ' : '') + sc.nome;
      B.fonte(ctx, FONTE);
      var lw = B.largura(ctx, txt), yc = Math.min(y1 - 16 - lw / 2, Math.max(y0 + 40 + lw / 2, G.topo + 24 + lw / 2));
      if (yc - lw / 2 < y0 + 20 || (op.livre && !op.livre(G.xD + 24, yc))) return;
      ctx.save();
      ctx.translate(G.xD + 24, yc); ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = cor(C.AC2, ATUAL.rotulo * resp);
      ctx.fillText(txt, 0, 0);
      ctx.restore(); ctx.__fonte = null;
    }
    /* o fluxo: traços curtos correndo nas réguas, para baixo na esquerda e para cima na direita */
    function desenharFluxo() {
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor(C.AC2, FLUXO.alfa);
      ctx.setLineDash(FLUXO.padrao);
      var passoF = FLUXO.traco + FLUXO.vao, des = (tempo * FLUXO.vel) % passoF;
      /* o tracejado preso ao documento (rolar não o arrasta) e correndo com o tempo */
      var doc = (G.rolagem + G.topo) % passoF;   /* o caminho começa no topo da zona */
      ctx.lineDashOffset = -des + doc;
      ctx.beginPath(); ctx.moveTo(G.xE, G.topo); ctx.lineTo(G.xE, G.H); ctx.stroke();
      ctx.lineDashOffset = des + doc;
      ctx.beginPath(); ctx.moveTo(G.xD, G.topo); ctx.lineTo(G.xD, G.H); ctx.stroke();
      ctx.setLineDash(SEM_TRACO);
      ctx.lineDashOffset = 0;
    }
    function desenharLigacoes(resp) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor(C.AC, 0.11 * resp);
      ctx.beginPath();
      for (var i = 0; i < ligacoes.length; i++) {
        var lg = ligacoes[i], y = Math.round(telaY(lg.y)) + 0.5;
        if (y < G.topo || y > G.H) continue;
        ctx.moveTo(trilhoX(lg.lado), y); ctx.lineTo(lg.x, y);
      }
      ctx.stroke();
      ctx.fillStyle = cor(C.AC2, 0.45 * resp);
      for (var j = 0; j < ligacoes.length; j++) {
        var yj = Math.round(telaY(ligacoes[j].y));
        if (yj < G.topo || yj > G.H) continue;
        ctx.fillRect(trilhoX(ligacoes[j].lado) - 1.5, yj - 1, 3, 3);
      }
    }
    /* o pulso nas duas réguas: a cabeça e o rastro em degraus; as marcas por
       onde ele passou acendem nos mesmos degraus */
    function desenharPulsos() {
      for (var i = 0; i < ondas.length; i++) {
        var yh = G.topo + ondas[i].r, de = yh;
        for (var k = -1; k < PULSO.degraus.length; k++) {
          var ate = k < 0 ? PULSO.cabeca : PULSO.degraus[k][0], a = k < 0 ? 0.9 : PULSO.degraus[k][1];
          var y0 = Math.max(G.topo, yh - ate), y1 = Math.min(G.H, de);
          de = yh - ate;
          if (y1 <= y0) continue;
          ctx.lineWidth = k < 0 ? 1.6 : 1;
          ctx.strokeStyle = cor(k < 0 ? C.AC2 : C.AC, a);
          ctx.beginPath();
          ctx.moveTo(G.xE, y0); ctx.lineTo(G.xE, y1);
          ctx.moveTo(G.xD, y0); ctx.lineTo(G.xD, y1);
          if (k >= 0) {
            var m0 = Math.ceil((y0 + G.rolagem) / MARCA.menor) * MARCA.menor;
            for (var yd = m0; yd - G.rolagem < y1; yd += MARCA.menor) {
              var ym = Math.round(yd - G.rolagem) + 0.5, l = yd % MARCA.maior === 0 ? 7 : 3;
              ctx.moveTo(G.xE - l, ym); ctx.lineTo(G.xE, ym);
              ctx.moveTo(G.xD, ym); ctx.lineTo(G.xD + l, ym);
            }
          }
          ctx.stroke();
        }
      }
      ctx.lineWidth = 1;
    }
    /* o horizonte cruzado: duas frentes das réguas até o meio; no encontro, um losango */
    function desenharTravessias() {
      var meio = (G.xE + G.xD) / 2;
      ctx.lineWidth = 1;
      for (var i = 0; i < travessias.length; i++) {
        var tv = travessias[i], y = Math.round(telaY(tv.yd)) + 0.5;
        if (y < G.topo - 10 || y > G.H + 10) continue;
        var k = saida(tv.t / TRAVESSIA.dura), apaga = 1 - limitar((tv.t - TRAVESSIA.dura) / 0.7);
        for (var lado = -1; lado <= 1; lado += 2) {
          var x0 = trilhoX(lado), xf = x0 + (meio - x0) * k, s = lado < 0 ? 1 : -1;
          ctx.strokeStyle = cor(C.AC, 0.16 * apaga);
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xf, y); ctx.stroke();
          if (k < 1) {
            ctx.strokeStyle = cor(C.AC2, 0.85);
            var xh = s > 0 ? Math.max(x0, xf - TRAVESSIA.segmento) : Math.min(x0, xf + TRAVESSIA.segmento);
            ctx.beginPath(); ctx.moveTo(xh, y); ctx.lineTo(xf, y); ctx.stroke();
          }
        }
        if (k >= 1 && apaga > 0.02) {
          ctx.strokeStyle = cor(C.AC2, 0.85 * apaga);
          var sz = 3 + 4 * saida((tv.t - TRAVESSIA.dura) / 0.7);
          ctx.beginPath(); losango(meio, y, sz); ctx.stroke();
        }
      }
    }
    function desenharFaiscas() {
      ctx.lineWidth = 1;
      for (var i = 0; i < faiscas.length; i++) {
        var fz = faiscas[i], lg = fz.lg, y = Math.round(telaY(lg.y)) + 0.5;
        if (y < G.topo || y > G.H) continue;
        var x0 = trilhoX(lg.lado), k = saida(fz.t / LIGA.dura), xf = x0 + (lg.x - x0) * k;
        var apaga = 1 - limitar((fz.t - LIGA.dura) / 0.5);
        ctx.strokeStyle = cor(C.AC2, 0.55 * apaga);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xf, y); ctx.stroke();
      }
    }
    function desenharRotas() {
      ctx.lineWidth = 1;
      for (var i = 0; i < rotas.length; i++) {
        var ro = rotas[i], y = Math.round(telaY(ro.yd)) + 0.5, k = saida(ro.t / ROTA.anda);
        if (y < G.topo) continue;   /* rolou para dentro do hero (rota segurada) */
        var apaga = ro.fica ? 1 : limitar((ro.vida - ro.t) / 0.5), x0 = trilhoX(ro.lado);
        /* do ponto até a régua, e a régua acesa de leve até o topo */
        ctx.strokeStyle = cor(C.AC2, 0.5 * apaga);
        ctx.beginPath(); ctx.moveTo(ro.x, y); ctx.lineTo(ro.x + (x0 - ro.x) * k, y); ctx.stroke();
        if (k >= 1) {
          ctx.strokeStyle = cor(C.AC, 0.22 * apaga);
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0, G.topo); ctx.stroke();
        }
      }
    }
    function desenharPacotes() {
      for (var i = 0; i < pacotes.length; i++) {
        var p = pacotes[i], x = trilhoX(p.lado), y = G.topo + p.d;
        if (y > G.H + 60) continue;
        ctx.lineWidth = 1;
        ctx.strokeStyle = cor(C.AC, 0.3);
        ctx.beginPath(); ctx.moveTo(x, Math.max(G.topo, y + PACOTE.cabeca)); ctx.lineTo(x, Math.max(G.topo, y + PACOTE.cauda)); ctx.stroke();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = cor(C.AC2, 0.9);
        ctx.beginPath(); ctx.moveTo(x, Math.max(G.topo, y)); ctx.lineTo(x, Math.max(G.topo, y + PACOTE.cabeca)); ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    function desenharMarcas() {
      ctx.lineWidth = 1;
      for (var i = 0; i < marcas.length; i++) {
        var m = marcas[i], k = m.t / m.dura, s = 3 + 5 * saida(k);
        if (telaY(m.yd) < G.topo) continue;
        ctx.strokeStyle = cor(C.AC2, 0.85 * (1 - k));
        ctx.beginPath(); losango(m.x, telaY(m.yd), s); ctx.stroke();
      }
    }
    /* a altura do cursor: o traço aceso nas duas réguas */
    function desenharMira() {
      if (mira.f < 0.02) return;
      var y = Math.round(telaY(mira.y)) + 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor(C.AC2, 0.75 * mira.f);
      ctx.beginPath();
      ctx.moveTo(G.xE - 11, y); ctx.lineTo(G.xE + 4, y);
      ctx.moveTo(G.xD - 4, y); ctx.lineTo(G.xD + 11, y);
      ctx.stroke();
    }
    /* a marca de rumo na régua: a seta para a opção e o nome dela na margem */
    function desenharRumo() {
      if (rumo.f < 0.02) return;
      var x = trilhoX(rumo.lado), y = Math.round(telaY(rumo.y)) + 0.5, s = 6, dir = -rumo.lado, f = rumo.f;
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor(C.AC2, 0.85 * f);
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14); ctx.stroke();
      ctx.fillStyle = cor(C.AC2, 0.95 * f);
      ctx.beginPath();
      ctx.moveTo(x + dir * (s * 1.6 + 3), y); ctx.lineTo(x + dir * 3, y - s * 0.7); ctx.lineTo(x + dir * 3, y + s * 0.7);
      ctx.closePath(); ctx.fill();
      if (!G.rotulos || !rumo.rotulo) return;
      var txt = rumo.lado < 0 ? rumo.rotulo + ' →' : '← ' + rumo.rotulo;
      B.fonte(ctx, FONTE_RUMO); ctx.textBaseline = 'middle';
      ctx.textAlign = rumo.lado < 0 ? 'right' : 'left';
      var tx = x - dir * 12, lw = B.largura(ctx, txt);
      if ((rumo.lado < 0 ? tx - lw : G.W - tx - lw) < 8) return;   /* não cabe na margem */
      ctx.fillStyle = cor(C.AC2, 0.9 * f);
      ctx.fillText(txt, tx, y);
    }

    function desenhar(resp, vivo) {
      desenhados = 0;
      if (G.xD - G.xE < 200) return;
      desenharReguas(resp);
      desenharHorizontes(resp);
      desenharLigacoes(resp);
      desenharAtual(resp);
      if (!vivo) return;
      desenharFluxo();
      desenharPulsos();
      desenharTravessias();
      desenharFaiscas();
      desenharRotas();
      desenharPacotes();
      desenharMarcas();
      desenharMira();
      desenharRumo();
    }

    function limparEnergia() { ondas.length = travessias.length = faiscas.length = pacotes.length = rotas.length = marcas.length = 0; }
    return {
      configurar: configurar, origem: origem,
      /* a geometria em tela (as estações pousam na régua da esquerda) */
      geo: function () { return G; },
      piscar: function () { pisca = 1; }, passo: passo, desenhar: desenhar,
      soltarOnda: soltarOnda, pacote: pacote, rota: rota, soltarRota: soltarRota, apontar: apontar,
      /* a "distância" de um ponto para as ondas: a altura abaixo do topo da zona */
      raio: function (x, y) { return y - G.topo; },
      ladoDe: ladoDe,
      dentroDoVao: function () { return false; },
      nOndas: function () { return ondas.length; },
      desenhados: function () { return desenhados; },
      ondas: ondas, limparEnergia: limparEnergia
    };
  };
})();
