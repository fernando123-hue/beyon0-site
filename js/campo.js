/* ==========================================================================
   O CAMPO DO REATOR — o fundo do site inteiro (pedido do dono, 2026-10-03:
   "não quero apenas uma tela preta e alguns efeitos correndo; quero algo
   grandioso, que combine com o tema, ressoe com o AI Core e interaja com o
   usuário e com todos os elementos do site". A versão de feixes soltos lia
   como desordem; está no commit 48d7c0b).

   O fundo é a geometria do próprio AI Core estendida pela página, como um
   instrumento de medida polar:
   - RAIOS: os 12 do reator, e a cada vez que a distância dobra cada um se
     ramifica em dois (24, 48, 96…), com um nó na ramificação. A densidade
     fica constante na página inteira;
   - ANÉIS concêntricos, inclinados como o reator, com a hierarquia da régua
     dele (um forte com marcas a cada quatro; os de ramificação mais fortes);
   - um VÃO em volta do reator: nada encosta nele (ele é soberano);
   - a ENERGIA segue o fôlego dele: ao expirar uma ONDA nítida sai e varre a
     página, acendendo cada elemento que cruza; ao inspirar, PACOTES correm
     pelos raios de volta para o núcleo;
   - a MIRA: o cursor encaixa no anel e no raio mais próximos;
   - a ROTA: de um ponto (uma opção sob o cursor, um clique, o mini) até o
     núcleo, pelo anel e depois pelo raio;
   - a MARCA DE RUMO (o "bug" dos instrumentos de aviação; o mostrador
     Waypoint do relógio): com o cursor numa opção, uma seta trava na borda
     do campo do reator apontando para ela, com a leitura "→ NOME · 340°".
   - a VARREDURA (só no desktop, onde o campo fica só no hero do Hub; pedido
     do dono, 2026-10-03: "funcionaria pro hero, com algo a mais"): um raio
     de 1 px dá a volta em 14 s, no sentido oposto ao do rotor, e o que ele
     acabou de cruzar (trechos dos anéis fortes, nós, rumos) fica aceso em
     três degraus que apagam. Nada de leque preenchido: só o traço.

   Só traço nítido de 1 px: nada de desfoque, brilho ou degradê radial (o
   dono proíbe). Este arquivo só sabe de geometria e desenho, em
   coordenadas de TELA; a página (texto, elementos, cursor) é js/rede.js.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;

  var TAU = Math.PI * 2;
  var SY = 0.92;                 /* o achatamento dos anéis: a inclinação do reator */
  /* a ramificação para aqui (crítica, rodada 1: longe do reator as bandas
     de 96+ raios quase paralelos liam como grade torta). Depois do teto os
     raios se espaçam com a distância e os anéis viram a estrutura */
  var BANDA_MAX = { desk: 2, cel: 1 };
  var ONDA = { borda: [8, 20], alfa: [0.5, 0.22, 0.1], rastro: 170 };   /* px atrás da frente; alfas da frente e dos ecos */
  var PACOTE = { cabeca: 14, cauda: 46, acel: 900 };   /* px, px, px/s² */
  var MIRA = { arco: 90, raio: 80, segue: 12 };        /* px de cada lado; 1/s */
  var ROTA = { anda: 0.28 };                           /* s para o traço da rota chegar ao raio */
  var RUMO = { arco: 0.12, seta: 7, segue: 9, fonte: '500 10px "JetBrains Mono", ui-monospace, monospace' };
  /* a régua escrita (referência: a rosa dos instrumentos de aviação): o rumo
     de cada raio fundamental nos anéis de ramificação ("030"…"360") e a cota
     do anel na margem ("R·0480"). Só no desktop e só onde não há texto */
  var ESCRITA = { fonte: '400 10px "JetBrains Mono", ui-monospace, monospace', alfa: 0.55 };
  /* s por volta; degraus de [até quantos rad atrás, alfa] (nítidos, sem degradê) */
  var VARRE = { volta: 14, degraus: [[0.1, 0.32], [0.26, 0.16], [0.5, 0.07]] };

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function saida(k) { k = limitar(k); return 1 - (1 - k) * (1 - k) * (1 - k); }
  /* livre num raio de 14 px (crítica de arte: um nó colado no fim de uma palavra lia como pontuação) */
  /* (só no desktop: no celular o texto cobre quase tudo e o campo ficaria sem nós; lá ele já está aprovado) */
  function livreLargo(livre, x, y, cel) { return livre(x, y) && (cel || (livre(x - 14, y) && livre(x + 14, y) && livre(x, y - 14) && livre(x, y + 14))); }
  function difAng(a, b) { var d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }

  /* op: { ctx, cores: { AC, AC2, T1, PRATA }, celular } */
  B.campo = function (op) {
    var ctx = op.ctx, C = op.cores, cel = op.celular, BMAX = cel ? BANDA_MAX.cel : BANDA_MAX.desk;
    var MAIS = cel ? 1.5 : 1;   /* no celular os módulos cobrem quase a tela: o campo mais presente onde aparece */
    /* a origem (o centro do reator) em coordenadas da TELA neste quadro,
       R0: o raio visível do reator; Q: onde o campo começa (o vão) */
    var G = { ox: 0, oy: 0, R0: 200, Q: 290, giro: 0, rotor: 0 };
    /* o ROTOR: o trecho dos 12 raios entre o vão e a 1ª ramificação gira com a
       roda do reator (crítica, rodada 1: o campo ficava parado com o reator
       girando); da 1ª ramificação para fora é o ESTATOR, fixo */
    var classes = [[], [], []], faixa = [0, TAU];
    var RUMOS = [];
    for (var ri = 0; ri < 12; ri++) RUMOS.push(('00' + (((ri * 30 + 90) % 360) || 360)).slice(-3));
    var aneis = [], vis = { rMin: 0, rMax: 0, a0: 0, a1: TAU, cheio: true };
    var ondas = [], pacotes = [], marcas = [], rotas = [];
    var mira = { ativa: false, a: 0, r: 0, f: 0, alvoA: 0, alvoR: 0 };
    var rumo = { a: 0, alvo: 0, f: 0, ligado: false, rotulo: '' };
    var varA = -Math.PI / 2;   /* o ângulo da varredura (op.varre) */
    /* quanto atrás da varredura está o ângulo a (0 = sob ela; 99 = fora do rastro) */
    function atras(a) { var d = difAng(varA, a); return d >= 0 && d <= VARRE.degraus[2][0] ? d : 99; }
    function degrau(d) { for (var j = 0; j < 3; j++) if (d <= VARRE.degraus[j][0]) return VARRE.degraus[j][1]; return 0; }

    /* ---------- geometria ---------- */
    /* os anéis: o espaçamento cresce devagar com a distância (na raiz) */
    function gerarAneis() {
      aneis.length = 0;
      var U = G.R0, r = G.Q, k = 0, b = 0;
      while (r < 24000) {
        var proxRamo = G.Q * Math.pow(2, b + 1);
        aneis.push({ r: r, maior: k % 4 === 0, ramo: k === 0 || Math.abs(r - G.Q * Math.pow(2, b)) < 0.5 });
        var s = Math.max(U * 0.24, Math.min(U * 0.9, U * 0.24 * Math.sqrt(r / G.Q)));
        var prox = r + s;
        /* o anel de ramificação cai exatamente na dobra */
        if (prox > proxRamo - s * 0.35) { prox = proxRamo; b++; k = -1; }
        r = prox; k++;
      }
    }
    function banda(r) { return Math.max(0, Math.min(BMAX, Math.floor(Math.log(r / G.Q) / Math.LN2))); }
    function nRaios(r) { return 12 * Math.pow(2, banda(r)); }

    /* tela → campo: { r, a } (a: o ângulo paramétrico da elipse) */
    function polar(x, y) {
      var dx = x - G.ox, dy = (y - G.oy) / SY;
      return { r: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
    }
    function px(r, a) { return G.ox + Math.cos(a) * r; }
    function py(r, a) { return G.oy + Math.sin(a) * r * SY; }

    /* o que da página está na tela: faixa de raios e de ângulos */
    function visivel(W, H, topo) {
      var cs = [[0, topo], [W, topo], [0, H], [W, H]], rMax = 0, i;
      var dentro = G.ox >= 0 && G.ox <= W && G.oy >= topo && G.oy <= H;
      for (i = 0; i < 4; i++) rMax = Math.max(rMax, polar(cs[i][0], cs[i][1]).r);
      var cx = Math.max(0, Math.min(W, G.ox)), cy = Math.max(topo, Math.min(H, G.oy));
      vis.rMin = dentro ? 0 : polar(cx, cy).r;
      vis.rMax = rMax;
      vis.cheio = dentro;
      if (!dentro) {
        var am = polar(W / 2, (topo + H) / 2).a, lo = 0, hi = 0;
        for (i = 0; i < 4; i++) { var d = difAng(polar(cs[i][0], cs[i][1]).a, am); lo = Math.min(lo, d); hi = Math.max(hi, d); }
        /* as bordas laterais também (a origem pode estar ao lado) */
        vis.a0 = am + lo - 0.02; vis.a1 = am + hi + 0.02;
      } else { vis.a0 = 0; vis.a1 = TAU; }
    }
    function angVisivel(a) {
      if (vis.cheio) return true;
      var m = (vis.a0 + vis.a1) / 2;
      return Math.abs(difAng(a, m)) <= (vis.a1 - vis.a0) / 2;
    }
    /* a força do campo perto do vão: nasce suave na borda dele */
    function nasce(r) { return limitar((r - G.Q) / (G.Q * 0.45)) * 0.7 + 0.3; }

    /* ---------- energia ---------- */
    function soltarOnda() { ondas.push({ r: G.Q, rAntes: G.Q, v: cel ? 900 : 1150 }); }
    /* um pacote no raio de ângulo `a`, a partir do raio `r`, correndo para o núcleo */
    function pacote(r, a, forte) {
      if (pacotes.length > 40 || r <= G.Q) return null;
      var p = { r: r, a: a, v: cel ? 160 : 220, forte: !!forte, rotor: r < G.Q * 2 };
      pacotes.push(p);
      return p;
    }
    /* o raio mais perto de (r, a): o ângulo dele (no rotor, do vão à 1ª
       ramificação, os raios giram com o reator) */
    function raioPerto(r, a) {
      var n = nRaios(r), passo = TAU / n, base = r < G.Q * 2 ? G.rotor : G.giro;
      return base + Math.round((a - base) / passo) * passo;
    }
    /* a ROTA de um ponto da tela até o núcleo: pelo anel até o raio mais
       perto, e o pacote desce por ele. `fica`: segura acesa (hover) */
    function rota(x, y, o) {
      o = o || {};
      var p = polar(x, y);
      if (p.r <= G.Q * 1.05) return null;
      var ar = raioPerto(p.r, p.a);
      var ro = { r: p.r, a: p.a, ar: ar, t: 0, fica: !!o.fica, vida: o.vida || 1.6, prox: 0, cada: o.cada || 0.75, forte: !!o.forte };
      rotas.push(ro);
      marcas.push({ r: p.r, a: p.a, t: 0, dura: 0.7 });
      return ro;
    }
    function soltarRota(ro) { var i = rotas.indexOf(ro); if (i >= 0) rotas[i].fica = false; }

    /* ---------- por quadro ---------- */
    /* e: { W, H, topo, cursor: { x, y, ativo }, reduzido, rLimite (o raio
       do fim da página) } — devolve quantos pacotes chegaram ao núcleo */
    var saidaQuadro = { chegadas: 0 };
    function passo(dt, e) {
      visivel(e.W, e.H, e.topo);
      saidaQuadro.chegadas = 0;
      var i;
      if (op.varre && !e.reduzido) varA = (varA + dt * TAU / VARRE.volta) % TAU;
      for (i = ondas.length - 1; i >= 0; i--) {
        ondas[i].rAntes = ondas[i].r;
        ondas[i].r += ondas[i].v * dt;
        if (ondas[i].r - ONDA.rastro > Math.min(24000, e.rLimite || 24000)) ondas.splice(i, 1);
      }
      for (i = pacotes.length - 1; i >= 0; i--) {
        var p = pacotes[i];
        if (p.engate) {
          p.engate.t += dt;
          var ke = Math.min(1, p.engate.t / p.engate.dura), ks = ke * ke * (3 - 2 * ke);
          p.a = p.engate.de + difAng(p.engate.para, p.engate.de) * ks;
          if (ke >= 1) p.engate = null;
          continue;
        }
        p.v += PACOTE.acel * dt;
        var antes = p.r;
        p.r -= p.v * dt;
        if (antes >= G.Q * 2 && p.r < G.Q * 2 && !p.rotor) {
          var para = raioPerto(G.Q * 2 - 1, p.a), arcoPx = Math.abs(difAng(para, p.a)) * G.Q * 2;
          p.r = G.Q * 2; p.rotor = true;
          p.engate = { de: p.a, para: para, t: 0, dura: Math.max(0.08, Math.min(0.22, arcoPx / 700)) };
          continue;
        }
        if (p.rotor) p.a = raioPerto(Math.min(p.r, G.Q * 2 - 1), p.a);
        if (p.r <= G.Q) { marcas.push({ r: G.Q, a: p.a, t: 0, dura: 0.6 }); pacotes.splice(i, 1); saidaQuadro.chegadas++; }
      }
      for (i = rotas.length - 1; i >= 0; i--) {
        var ro = rotas[i];
        ro.t += dt;
        if (ro.r < G.Q * 2) ro.ar = raioPerto(ro.r, ro.a);
        if (ro.t >= ROTA.anda) {
          ro.prox -= dt;
          if (ro.prox <= 0 && (ro.fica || ro.t < ROTA.anda + 0.05)) { pacote(ro.r, ro.ar, ro.forte); ro.prox = ro.cada; }
        }
        if (!ro.fica && ro.t > ro.vida) rotas.splice(i, 1);
      }
      for (i = marcas.length - 1; i >= 0; i--) { marcas[i].t += dt; if (marcas[i].t >= marcas[i].dura) marcas.splice(i, 1); }
      /* a mira: desliza até o anel e o raio mais perto do cursor */
      var c = e.cursor;
      if (c && c.ativo && !e.reduzido) {
        var pc = polar(c.x, c.y);
        if (pc.r > G.Q) {
          var an = anelPerto(pc.r);
          mira.alvoR = an ? an.r : pc.r; mira.alvoA = pc.a;
          if (!mira.ativa) { mira.r = mira.alvoR; mira.a = mira.alvoA; mira.ativa = true; }
        }
        mira.f += ((pc.r > G.Q ? 1 : 0) - mira.f) * Math.min(1, dt * 6);
      } else mira.f += (0 - mira.f) * Math.min(1, dt * 4);
      var k = Math.min(1, dt * MIRA.segue);
      mira.r += (mira.alvoR - mira.r) * k;
      mira.a += difAng(mira.alvoA, mira.a) * k;
      rumo.f += ((rumo.ligado ? 1 : 0) - rumo.f) * Math.min(1, dt * (rumo.ligado ? 10 : 5));
      rumo.a += difAng(rumo.alvo, rumo.a) * Math.min(1, dt * RUMO.segue);
      return saidaQuadro;
    }
    function anelPerto(r) {
      var melhor = null, dm = 1e9;
      for (var i = 0; i < aneis.length; i++) { var d = Math.abs(aneis[i].r - r); if (d < dm) { dm = d; melhor = aneis[i]; } if (aneis[i].r > r + 400) break; }
      return melhor;
    }

    /* ---------- desenho ---------- */
    function arco(r, a0, a1) {
      ctx.moveTo(px(r, a0), py(r, a0));
      ctx.ellipse(G.ox, G.oy, r, r * SY, 0, a0, a1);
    }
    function faixaAng() { faixa[0] = vis.cheio ? 0 : vis.a0; faixa[1] = vis.cheio ? TAU : vis.a1; return faixa; }
    function cor(c, a) { return 'rgba(' + B.tom(c) + ',' + limitar(a).toFixed(3) + ')'; }   /* (B.tom: no ouro, ciano vira dourado) */

    function desenharAneis(resp) {
      var f = faixaAng(), i, an;
      classes[0].length = classes[1].length = classes[2].length = 0;
      for (i = 0; i < aneis.length; i++) {
        an = aneis[i];
        if (an.r < vis.rMin - 2) continue;
        if (an.r > vis.rMax + 2) break;
        classes[an.ramo ? 2 : an.maior ? 1 : 0].push(an.r);
      }
      var alfas = [0.075, 0.13, 0.2];
      ctx.lineWidth = 1;
      for (var cl = 0; cl < 3; cl++) {
        var lista = classes[cl];
        if (!lista.length) continue;
        /* nasce suave na borda do vão: os 2 primeiros anéis em degraus */
        for (var j = 0; j < lista.length; j++) {
          var r = lista[j];
          desenhados++;
          ctx.strokeStyle = cor(C.AC, alfas[cl] * nasce(r) * resp * MAIS);
          ctx.beginPath(); arco(r, f[0], f[1]); ctx.stroke();
        }
      }
    }
    function desenharRaios(resp) {
      ctx.lineWidth = 1;
      /* cada banda desenha todos os seus raios do anel dela até o seguinte (a
         última, até o fim da tela); os fundamentais seguem em toda banda com o
         alfa deles, os novos com o da banda */
      for (var b = 0; b <= BMAX && G.Q * Math.pow(2, b) < vis.rMax; b++) {
        var ini = G.Q * Math.pow(2, b), N = 12 * Math.pow(2, b);
        var r0 = Math.max(ini, vis.rMin), r1 = b === BMAX ? vis.rMax : Math.min(vis.rMax, ini * 2);
        if (r0 >= r1) continue;
        for (var pas = 0; pas < 2; pas++) {
        var alfa = (pas === 0 ? 0.2 : b === 1 ? 0.13 : 0.09) * MAIS;
        if (pas === 1 && b === 0) continue;
        ctx.strokeStyle = cor(C.AC, alfa * resp);
        ctx.beginPath();
        for (var i = 0; i < N; i++) {
          var fund = i % Math.pow(2, b) === 0;
          if (fund !== (pas === 0)) continue;
          var a = (b === 0 ? G.rotor : G.giro) + i * TAU / N;
          if (!angVisivel(a)) continue;
          ctx.moveTo(px(r0, a), py(r0, a)); ctx.lineTo(px(r1, a), py(r1, a));
        }
        ctx.stroke();
        }
      }
    }
    /* os nós das ramificações (losangos) e as marcas nos anéis fortes */
    function desenharNos(resp) {
      ctx.lineWidth = 1;
      var b, i, a, x, y, livre = op.livre;
      ctx.strokeStyle = cor(C.AC2, 0.6 * resp);
      ctx.beginPath();
      for (b = 0; b <= BMAX && G.Q * Math.pow(2, b) < vis.rMax; b++) {
        var r = G.Q * Math.pow(2, b), N = 12 * Math.pow(2, b), s = b === 0 ? 3 : 2.5;
        if (r < vis.rMin - 4) continue;
        for (i = 0; i < N; i++) {
          a = (b === 0 ? G.rotor : G.giro) + i * TAU / N;
          if (!angVisivel(a)) continue;
          x = px(r, a); y = py(r, a);
          if (livre && !livreLargo(livre, x, y, cel)) continue;   /* nó nenhum dentro nem colado no texto (lia como acento) */
          ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
        }
      }
      ctx.stroke();
      /* as marcas: um traço curto no sentido do raio, onde cada raio cruza um anel forte */
      ctx.strokeStyle = cor(C.PRATA, 0.34 * resp);
      ctx.beginPath();
      for (var k = 0; k < aneis.length; k++) {
        var an = aneis[k];
        if (an.r < vis.rMin - 6) continue;
        if (an.r > vis.rMax + 6) break;
        if (!an.maior || an.ramo) continue;
        var n = nRaios(an.r) * 2;   /* marcas no meio dos raios também */
        for (i = 0; i < n; i++) {
          a = G.giro + i * TAU / n;
          if (!angVisivel(a)) continue;
          var l = i % 2 ? 3 : 5;
          if (livre && !livreLargo(livre, px(an.r, a), py(an.r, a), cel)) continue;
          ctx.moveTo(px(an.r - l, a), py(an.r - l, a)); ctx.lineTo(px(an.r + l, a), py(an.r + l, a));
        }
      }
      ctx.stroke();
    }
    function desenharEscrita(resp, livre) {
      if (cel) return;
      var corEscrita = cor(C.PRATA, ESCRITA.alfa * resp);
      ctx.fillStyle = corEscrita;
      for (var b = 0; b <= BMAX && G.Q * Math.pow(2, b) < vis.rMax; b++) {
        var r = G.Q * Math.pow(2, b);
        if (r < vis.rMin - 10) continue;
        /* o rumo de cada um dos 12 raios fundamentais, logo fora do anel, FIXO
           (o aro de um instrumento: o rotor gira por baixo e a leitura do
           rumo bate com ele, crítica rodada 2). Onde há texto, um tique no
           lugar do número: o aro fica inteiro */
        if (b > 0) continue;   /* um aro só, o do vão */
        for (var i = 0; i < 12; i++) {
          var a = G.giro + i * TAU / 12;
          if (!angVisivel(a)) continue;
          var x = px(r + 15, a), y = py(r + 15, a);
          if (livre && !livreLargo(livre, x, y, cel)) {
            if (livre(px(r + 6, a), py(r + 6, a))) { ctx.fillRect(px(r + 6, a) - 0.5, py(r + 6, a) - 0.5, 1, 1); }
            continue;
          }
          /* perto da leitura do rumo (25°), o rótulo do aro sai enquanto ela entra */
          var perto = Math.abs(difAng(a, rumo.a)) < 0.436 ? 1 - rumo.f : 1;
          if (perto < 0.02) continue;
          /* o rumo que a varredura acabou de cruzar acende (ciano) */
          var dv = op.varre ? atras(a) : 99;
          ctx.globalAlpha = perto;
          B.texto(ctx, RUMOS[i], ESCRITA.fonte, dv < 50 ? cor(C.AC2, Math.min(1, ESCRITA.alfa + degrau(dv) * 1.6) * resp) : corEscrita, x, y, 'center', 'middle');
          ctx.globalAlpha = 1;
        }
      }
    }
    /* a varredura: o raio, os trechos de anel atrás dele em degraus, e os nós
       e marcas que ele acabou de cruzar */
    function desenharVarredura(resp) {
      if (!angVisivel(varA)) return;
      var i, j, a0 = Math.max(G.Q, vis.rMin), livre = op.livre;
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor(C.AC2, 0.42 * resp);
      ctx.beginPath(); ctx.moveTo(px(a0, varA), py(a0, varA)); ctx.lineTo(px(vis.rMax, varA), py(vis.rMax, varA)); ctx.stroke();
      var de = 0;
      for (j = 0; j < 3; j++) {
        var ate = VARRE.degraus[j][0];
        ctx.strokeStyle = cor(C.AC, VARRE.degraus[j][1] * resp);
        ctx.beginPath();
        for (i = 0; i < aneis.length; i++) {
          var an = aneis[i];
          if (an.r < vis.rMin - 2) continue;
          if (an.r > vis.rMax + 2) break;
          if (an.ramo || an.maior) arco(an.r, varA - ate, varA - de);
        }
        ctx.stroke();
        de = ate;
      }
      /* os nós das ramificações cruzados: o losango aceso */
      for (var b = 0; b <= BMAX && G.Q * Math.pow(2, b) < vis.rMax; b++) {
        var r = G.Q * Math.pow(2, b), N = 12 * Math.pow(2, b), s = b === 0 ? 3 : 2.5;
        for (i = 0; i < N; i++) {
          var a = (b === 0 ? G.rotor : G.giro) + i * TAU / N, d = atras(a);
          if (d > 50) continue;
          var x = px(r, a), y = py(r, a);
          if (livre && !livreLargo(livre, x, y, cel)) continue;
          ctx.strokeStyle = cor(C.AC2, degrau(d) * 2.6 * resp);
          ctx.beginPath(); ctx.moveTo(x, y - s - 1); ctx.lineTo(x + s + 1, y); ctx.lineTo(x, y + s + 1); ctx.lineTo(x - s - 1, y); ctx.closePath(); ctx.stroke();
        }
      }
    }
    function desenharOndas() {
      var f = faixaAng();
      ctx.lineWidth = 1;
      for (var i = 0; i < ondas.length; i++) {
        var rf = ondas[i].r;
        if (rf < vis.rMin - ONDA.rastro || rf > vis.rMax + 30) continue;
        /* os anéis que a frente acabou de passar acendem e apagam */
        for (var k = 0; k < aneis.length; k++) {
          var an = aneis[k], atras = rf - an.r;
          if (atras < 0) break;
          if (atras > ONDA.rastro || an.r < vis.rMin) continue;
          ctx.strokeStyle = cor(C.AC, 0.2 * (1 - atras / ONDA.rastro));
          ctx.beginPath(); arco(an.r, f[0], f[1]); ctx.stroke();
        }
        ctx.strokeStyle = cor(C.AC2, cel ? 0.7 : ONDA.alfa[0]);
        ctx.beginPath(); arco(rf, f[0], f[1]); ctx.stroke();
        ctx.strokeStyle = cor(C.AC, ONDA.alfa[1]);
        ctx.beginPath(); arco(rf - ONDA.borda[0], f[0], f[1]); ctx.stroke();
        ctx.strokeStyle = cor(C.AC, ONDA.alfa[2]);
        ctx.beginPath(); arco(rf - ONDA.borda[1], f[0], f[1]); ctx.stroke();
      }
    }
    function desenharRotas() {
      ctx.lineWidth = 1;
      for (var i = 0; i < rotas.length; i++) {
        var ro = rotas[i], k = saida(ro.t / ROTA.anda), apaga = ro.fica ? 1 : limitar((ro.vida - ro.t) / 0.5);
        /* o trecho no anel, do ponto até o raio */
        var aFim = ro.a + difAng(ro.ar, ro.a) * k;
        ctx.strokeStyle = cor(C.AC2, 0.5 * apaga);
        ctx.beginPath();
        var a0 = Math.min(ro.a, aFim), a1 = Math.max(ro.a, aFim);
        if (a1 - a0 > 0.0005) arco(ro.r, a0, a1);
        ctx.stroke();
        /* o raio, do anel até o vão, aceso de leve enquanto a rota vive */
        if (k >= 1) {
          /* pelo estator até a 1ª ramificação, um trecho no anel dela e pelo raio do rotor até o vão */
          var r2 = G.Q * 2, ar2 = raioPerto(r2 - 1, ro.ar);
          ctx.strokeStyle = cor(C.AC, 0.26 * apaga);
          ctx.beginPath();
          if (ro.r > r2) {
            ctx.moveTo(px(ro.r, ro.ar), py(ro.r, ro.ar)); ctx.lineTo(px(r2, ro.ar), py(r2, ro.ar));
            var b0 = Math.min(ro.ar, ar2), b1 = Math.max(ro.ar, ar2);
            if (b1 - b0 > 0.0005) arco(r2, b0, b1);
            ctx.moveTo(px(r2, ar2), py(r2, ar2)); ctx.lineTo(px(G.Q, ar2), py(G.Q, ar2));
          } else { ctx.moveTo(px(ro.r, ro.ar), py(ro.r, ro.ar)); ctx.lineTo(px(G.Q, ro.ar), py(G.Q, ro.ar)); }
          ctx.stroke();
        }
      }
    }
    function desenharPacotes() {
      for (var i = 0; i < pacotes.length; i++) {
        var p = pacotes[i], r0 = p.r, r1 = Math.min(p.r + PACOTE.cabeca, p.r + 400), r2 = p.r + PACOTE.cauda;
        if (r0 > vis.rMax + 60 || r2 < vis.rMin - 60) continue;
        ctx.lineWidth = 1;
        ctx.strokeStyle = cor(C.AC, 0.3);
        ctx.beginPath(); ctx.moveTo(px(r1, p.a), py(r1, p.a)); ctx.lineTo(px(r2, p.a), py(r2, p.a)); ctx.stroke();
        ctx.lineWidth = p.forte ? 1.6 : 1.3;
        ctx.strokeStyle = cor(p.forte ? C.T1 : C.AC2, 0.9);
        ctx.beginPath(); ctx.moveTo(px(r0, p.a), py(r0, p.a)); ctx.lineTo(px(r1, p.a), py(r1, p.a)); ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    function desenharMarcas() {
      ctx.lineWidth = 1;
      for (var i = 0; i < marcas.length; i++) {
        var m = marcas[i], k = m.t / m.dura, s = 3 + 5 * saida(k), x = px(m.r, m.a), y = py(m.r, m.a);
        ctx.strokeStyle = cor(C.AC2, 0.85 * (1 - k));
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
      }
    }
    /* a mira: o trecho do anel e do raio sob o cursor, em degraus de luz */
    function desenharMira() {
      if (mira.f < 0.02) return;
      var r = mira.r, a = mira.a, da = MIRA.arco / Math.max(r, 1), passos = [0.12, 0.3, 0.12], j;
      ctx.lineWidth = 1;
      for (j = 0; j < 3; j++) {
        var b0 = a - da + (2 * da) * j / 3, b1 = a - da + (2 * da) * (j + 1) / 3;
        ctx.strokeStyle = cor(C.AC2, passos[j] * 1.6 * mira.f);
        ctx.beginPath(); arco(r, b0, b1); ctx.stroke();
      }
      var ar = raioPerto(r, a), ri = Math.max(G.Q, r - MIRA.raio), rf = r + MIRA.raio;
      for (j = 0; j < 3; j++) {
        var q0 = ri + (rf - ri) * j / 3, q1 = ri + (rf - ri) * (j + 1) / 3;
        ctx.strokeStyle = cor(C.AC2, passos[j] * 1.4 * mira.f);
        ctx.beginPath(); ctx.moveTo(px(q0, ar), py(q0, ar)); ctx.lineTo(px(q1, ar), py(q1, ar)); ctx.stroke();
      }
      var x = px(r, ar), y = py(r, ar), s = 3.5;
      ctx.strokeStyle = cor(C.AC2, 0.75 * mira.f);
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
    }
    /* a marca de rumo na borda do campo: o trecho do anel aceso, a seta para
       fora e a leitura (só onde não há texto: `livre`) */
    function desenharRumo(livre) {
      if (rumo.f < 0.02) return;
      var r = G.Q, a = rumo.a, f = rumo.f, j, d = RUMO.arco;
      ctx.lineWidth = 1;
      for (j = 0; j < 3; j++) {
        ctx.strokeStyle = cor(C.AC2, [0.3, 0.85, 0.3][j] * f);
        ctx.beginPath(); arco(r, a - d + 2 * d * j / 3, a - d + 2 * d * (j + 1) / 3); ctx.stroke();
      }
      var x = px(r, a), y = py(r, a), ux = Math.cos(a), uy = Math.sin(a) * SY, s = RUMO.seta;
      ctx.fillStyle = cor(C.AC2, 0.95 * f);
      ctx.beginPath();
      ctx.moveTo(x + ux * s * 1.6, y + uy * s * 1.6);
      ctx.lineTo(x - uy * s * 0.7, y + ux * s * 0.7);
      ctx.lineTo(x + uy * s * 0.7, y - ux * s * 0.7);
      ctx.closePath(); ctx.fill();
      if (!rumo.rotulo) return;
      var tx = x + ux * 22, ty = y + uy * 22;
      var graus = Math.round(((a * 180 / Math.PI + 90) % 360 + 360) % 360);
      var txt = '→ ' + rumo.rotulo + ' · ' + ('00' + graus).slice(-3) + '°';
      var alinha = ux < -0.2 ? 'right' : ux > 0.2 ? 'left' : 'center';
      if (livre) {
        var lw = B.largura(ctx, txt, RUMO.fonte), x0 = alinha === 'right' ? tx - lw : alinha === 'center' ? tx - lw / 2 : tx, f2 = 48;
        if (!livre(x0 - f2, ty) || !livre(x0 + lw + f2, ty) || !livre(x0 + lw / 2, ty - f2 / 2) || !livre(x0 + lw / 2, ty + f2 / 2)) return;
      }
      B.texto(ctx, txt, RUMO.fonte, cor(C.AC2, 0.9 * f), tx, ty, alinha, 'middle');
    }
    /* `resp`: a respiração (0,8–1). `vivo`: falso no movimento reduzido (só a estrutura) */
    var desenhados = 0;
    function desenhar(resp, vivo) {
      desenhados = 0;
      desenharAneis(resp);
      desenharRaios(resp);
      desenharNos(resp);
      desenharEscrita(resp, op.livre);
      if (!vivo) return;
      if (op.varre) desenharVarredura(resp);
      desenharOndas();
      desenharRotas();
      desenharPacotes();
      desenharMarcas();
      desenharMira();
      desenharRumo(op.livre);
    }
    /* a marca de rumo aponta para (x, y) da tela; null desliga */
    function apontar(x, y, rotulo) {
      if (x === null) { rumo.ligado = false; return; }
      var p = polar(x, y);
      rumo.alvo = p.a; rumo.rotulo = rotulo || '';
      if (!rumo.ligado && rumo.f < 0.05) rumo.a = p.a;
      rumo.ligado = true;
    }

    /* ---------- de fora ---------- */
    function limparEnergia() { ondas.length = 0; pacotes.length = 0; marcas.length = 0; rotas.length = 0; }
    /* a origem: centro (tela), raio visível do reator R0 (px), giro (rad) */
    function origem(ox, oy, R0, giro, rotor) {
      var mudouEscala = Math.abs(R0 - G.R0) > 0.5;
      G.ox = ox; G.oy = oy; G.giro = giro || 0; G.rotor = rotor === undefined ? G.giro : rotor;
      if (mudouEscala || !aneis.length) { G.R0 = R0; G.Q = R0 * 1.45; gerarAneis(); limparEnergia(); }
    }
    return {
      origem: origem, passo: passo, desenhar: desenhar, soltarOnda: soltarOnda, pacote: pacote,
      rota: rota, soltarRota: soltarRota, apontar: apontar, polar: polar, raioPerto: raioPerto,
      ponto: function (r, a) { return { x: px(r, a), y: py(r, a) }; },
      dentroDoVao: function (x, y) { return polar(x, y).r < G.Q; },
      raio: function (x, y) { var dx = x - G.ox, dy = (y - G.oy) / SY; return Math.sqrt(dx * dx + dy * dy); },
      nOndas: function () { return ondas.length; },
      /* o enquadramento sem passo (movimento reduzido: o quadro parado precisa saber o que está na tela) */
      enquadrar: function (W, H, topo) { visivel(W, H, topo); },
      /* quantos anéis o último desenho traçou (o verificador: o campo nunca pode sumir em silêncio) */
      desenhados: function () { return desenhados; },
      geo: G, ondas: ondas, limparEnergia: limparEnergia
    };
  };
})();
