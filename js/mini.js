/* ==========================================================================
   O MINI AI CORE — o reator que segue você (pedido do dono, 2026-10-02:
   "conforme vamos passando e mudando de páginas, o AI Core vá seguindo a
   gente e interagindo também; não ele todo, algo pequeno e minimalista").

   O CORPO (ponto, anel, dois arcos) num canvas pequeno só dele, acima das
   seções e abaixo do menu, que anda por transform: no canvas da rede, atrás
   do conteúdo, as seções de fundo grafite o apagavam (crítica, rodada 5). O
   rastro e a ligação ao canto ficam no canvas da rede (js/rede.js, por
   B.rede.extra), atrás do conteúdo. Só traço nítido, sem brilho desfocado.

   - No Hub ele NASCE do reator grande e se solta quando o reator sai da tela.
   - A DOCA: junto da coluna de conteúdo (desktop) ou no trilho da margem
     (celular), na altura do quanto da página já foi lida, com atraso de mola.
   - O PASSEIO (pedido do dono, 2026-10-02: "se movimentar de vez em quando
     para outros lados em vez de ficar apenas descendo em linha reta"): parado
     um tempo, ele sai da doca para a margem do outro lado, um vão livre da
     tela ou o canto de um cartão (que acende quando ele chega), andando em
     trechos de 45° como os feixes; fica um pouco, solta energia e volta.
     Rolar rápido o chama de volta: seguir você vem primeiro.
   - COM O FUNDO ("ele deverá interagir junto com o fundo do site"): atrai os
     feixes; o feixe que passa por ele é ABSORVIDO (a cauda se recolhe nele),
     ele acende e o REEMITE carregado do outro lado; às vezes dá um BOTE curto
     num feixe que passa perto; olha para os choques que acontecem perto.
   - Respira junto com o reator (B.relogio): no começo do expirar solta
     feixes. Seção chegando ou cartão aceso: liga-se ao canto mais perto.
   - Ao trocar de página continua de onde estava (sessionStorage).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || !B.rede) return;

  var TAU = Math.PI * 2, R2 = Math.SQRT1_2;
  var celular = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), T1 = '242,244,244';

  /* a mola da posição: criticamente amortecida, assenta em ~0,65 s */
  var MOLA = 40, AMORTECE = 2 * Math.sqrt(MOLA);
  var ESCALA = celular ? 0.8 : 1;
  var PULSO = celular ? 7 : 10;              /* px que o anel do pulso abre */
  var HOVER_FEIXE = 2;                       /* s: no máximo uma ligação por cartão sob o cursor neste intervalo */
  var BORDA_CEL = window.innerWidth < 360 ? 12 : 14;   /* celular: no eixo do trilho (js/rede.js), fora da coluna de texto */
  var ALCANCE_FEIXE = 320;                   /* px: mais longe que isso a ligação atravessaria a tela */
  var TOPO = celular ? 92 : 112, PE = 112;   /* PE: acima da barra fixa do celular */
  var FEIXE = { desenha: 0.35, segura: 1.05, apaga: 0.6 };   /* s */
  var VEIO_MS = 4000;                        /* a herança da página anterior vale por este tempo */
  /* o passeio: de quanto em quanto tempo parado (s), quanto fica lá (s), velocidade (px/s) */
  var PASSEIO = { cada: [8, 14], fica: [2.5, 4], vel: celular ? 170 : 240, rolagemVolta: 700 };
  var ABSORVE = { raio: 13, pausa: 1.6, reemite: 0.45 };   /* px; s entre absorções; s até reemitir */
  var BOTE = { raio: 120, max: 70, dura: 0.6, pausa: 3, chance: 0.4 };   /* o bote num feixe que passa perto */
  var ATRAI = { r: 200, s: 1.6 };            /* o mini puxa a direção dos feixes até r px */

  var tela = { W: window.innerWidth, H: window.innerHeight };
  /* o canvas do corpo: 96 px, centrado no mini */
  var CORPO = 96, corpo = document.createElement('canvas'), cctx = corpo.getContext('2d');
  var cdpr = Math.min(window.devicePixelRatio || 1, 2);
  corpo.className = 'mini';
  corpo.width = corpo.height = Math.round(CORPO * cdpr);
  /* dentro de um contêiner fixo do tamanho da tela, com overflow escondido:
     o canvas de 96 px passa da borda direita no celular (regra 10) */
  var palcoMini = document.createElement('div');
  palcoMini.className = 'mini-palco';
  palcoMini.setAttribute('aria-hidden', 'true');
  palcoMini.appendChild(corpo);
  document.body.appendChild(palcoMini);
  var corpoVisivel = null;
  var mini = { x: 0, y: 0, vx: 0, vy: 0, ativo: false, forca: 1, vis: 0, carga: 0 };
  var olhar = { x: 0, y: 0 }, ponteiro = { x: 0, y: 0, ativo: false }, foco = null;
  var atencao = 0, pulso = 0, faseAntes = 0, rolagem = window.scrollY, rolagemAntes = rolagem, velRol = 0;
  var despedido = false, perto = 0, esperou = 0, reatorVisto = false;   /* perto: o texto encostando, suavizado em ~0,4 s */
  var feixe = null, primeiro = true, ativoAntes = false, chegando = false, desdeChegada = 0, ultimoHover = -9;
  var passeio = { estado: 'doca', espera: acaso(5, 9), pos: null, dest: null, fica: 0 };
  var bote = null, proxBote = 0, ultimaAbsorcao = -9, reemitir = null;

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }
  function acaso(a, b) { return a + Math.random() * (b - a); }

  /* de onde ele vem: a página anterior deixou onde ele estava (fração da tela) */
  try {
    var veio = JSON.parse(sessionStorage.getItem('bz-mini') || 'null');
    if (veio && Date.now() - veio.quando < VEIO_MS && isFinite(veio.x) && isFinite(veio.y)) {
      mini.x = veio.x * tela.W; mini.y = veio.y * tela.H; mini.vis = isFinite(veio.vis) ? veio.vis : 1; primeiro = false; chegando = true;
    }
  } catch (e) { /* sem armazenamento: começa na lateral */ }
  window.addEventListener('pagehide', function () {
    try { sessionStorage.setItem('bz-mini', JSON.stringify({ x: mini.x / tela.W, y: mini.y / tela.H, vis: +mini.vis.toFixed(2), quando: Date.now() })); } catch (e) { /* idem */ }
  });

  /* as bordas da coluna de conteúdo (o --pad e a largura máxima do CSS) */
  function coluna(W) {
    var pad = Math.min(64, Math.max(20, W * 0.05));
    return W > 1200 + 2 * pad ? { esq: (W - 1200) / 2 + pad, dir: (W + 1200) / 2 - pad } : { esq: pad, dir: W - pad };
  }
  /* o lugar dele: junto da coluna (desktop) ou na margem (celular), na altura
     do quanto da página já foi lida */
  function doca(W, H) {
    var x = celular ? W - BORDA_CEL : Math.min(W - 26, coluna(W).dir + 40);
    var prog = limitar(rolagem / Math.max(1, B.rede.alturaDoc() - H));
    var y = TOPO + prog * (H - TOPO - PE);
    /* o trilho termina no começo do rodapé: ele não desce sobre os links */
    var rod = B.rede.rodapeNaTela();
    if (rod < H) y = Math.min(y, rod - 36);
    /* a despedida com histerese: some abaixo de 62% e só volta acima de 70% */
    if (rod < H * 0.62) despedido = true; else if (rod > H * 0.7) despedido = false;
    return { x: x, y: y, fim: despedido };
  }

  /* ---------- o passeio ---------- */
  /* para onde ir: o canto de um cartão, a margem do outro lado ou um vão livre.
     O vão é guardado em coordenada da PÁGINA (py): ele anda com a rolagem */
  function escolherDestino(W, H, d) {
    if (celular) return destinoCelular(W, H);
    var sorte = Math.random();
    if (sorte < 0.35) {
      /* um canto sorteado longe o bastante para ser um passeio (o mais perto era o cartão ao lado da doca) */
      var a = B.rede.cantoAoAcaso(mini.x, mini.y, 150, 600, function (c) { return c.item.el.matches('.painel, .cenario, .celula, .qa, .spec__item, .prova__item'); });
      if (a) {
        /* pousa logo fora do canto, na diagonal */
        return { ancora: a, ox: (a.cx ? 1 : -1) * 14, oy: (a.cy ? 1 : -1) * 14, item: a.item };
      }
    }
    if (sorte < 0.7) return { x: Math.max(26, coluna(W).esq - 40), py: rolagem + Math.min(H - PE, Math.max(TOPO, d.y + acaso(-120, 120))) };
    for (var k = 0; k < 12; k++) {
      var px = acaso(60, W - 60), py = acaso(TOPO, H - PE);
      if (!B.rede.sobreTexto(px, py, 30, 30)) return { x: px, py: rolagem + py };
    }
    return null;
  }
  /* no celular a coluna de texto ocupa quase a tela: ele só sai do trilho por
     um VÃO (uma faixa sem texto de ponta a ponta: desce pelo trilho até ela e
     atravessa na horizontal), ou corre pelo trilho até o canto de um cartão */
  function destinoCelular(W, H) {
    var trilho = W - BORDA_CEL;
    for (var k = 0; k < 16; k++) {
      var y = acaso(TOPO + 20, H - PE - 20), x = acaso(40, W - 60), livre = true;
      for (var sx = x; sx < trilho && livre; sx += 18) if (B.rede.sobreTexto(sx, y, 14, 18)) livre = false;
      if (livre) return { x: x, py: rolagem + y, vh: true };
    }
    var a = B.rede.cantoPerto(null, trilho, mini.y, 420);
    if (a && a.cx === 1) return { ancora: a, fixX: trilho, oy: (a.cy ? 1 : -1) * 10, vh: true, item: a.item };
    return null;
  }
  function destinoXY(dest) {
    if (dest.ancora) return { x: dest.fixX || dest.ancora.x + dest.ox, y: dest.ancora.y + dest.oy };
    return { x: dest.x, y: dest.py - rolagem };
  }
  /* anda até o alvo e devolve true ao chegar. Padrão: trechos de 45°
     (primeiro na diagonal, depois reto). `ordem` 'vh': primeiro na vertical,
     depois na horizontal; 'hv': o contrário (o celular, pelo trilho e pelo vão) */
  function andarPara(pos, alvo, dt, ordem) {
    var passo = PASSEIO.vel * dt, dx = alvo.x - pos.x, dy = alvo.y - pos.y;
    if (ordem === 'vh' && Math.abs(dy) > 0.5) pos.y += Math.sign(dy) * Math.min(passo, Math.abs(dy));
    else if (ordem === 'hv' && Math.abs(dx) > 0.5) pos.x += Math.sign(dx) * Math.min(passo, Math.abs(dx));
    else if (Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) {
      var p = Math.min(passo * R2, Math.abs(dx), Math.abs(dy));
      pos.x += Math.sign(dx) * p; pos.y += Math.sign(dy) * p;
    } else if (Math.abs(dx) > 0.5) pos.x += Math.sign(dx) * Math.min(passo, Math.abs(dx));
    else if (Math.abs(dy) > 0.5) pos.y += Math.sign(dy) * Math.min(passo, Math.abs(dy));
    return Math.abs(alvo.x - pos.x) < 1 && Math.abs(alvo.y - pos.y) < 1;
  }
  /* devolve o ponto para onde ele vai, ou null quando está na doca */
  function passear(dt, W, H, d, livre) {
    var ps = passeio;
    var chamado = Math.abs(velRol) > PASSEIO.rolagemVolta || !livre;
    if (ps.estado === 'doca') {
      if (!livre || Math.abs(velRol) > 200) return null;
      ps.espera -= dt;
      if (ps.espera > 0) return null;
      ps.espera = acaso(PASSEIO.cada[0], PASSEIO.cada[1]);
      ps.dest = escolherDestino(W, H, d);
      if (!ps.dest) return null;
      ps.estado = 'indo'; ps.pos = { x: mini.x, y: mini.y };
    }
    if (ps.estado !== 'voltando' && chamado) ps.estado = 'voltando';
    if (ps.estado === 'indo') {
      var alvo = destinoXY(ps.dest);
      if (alvo.y < TOPO - 20 || alvo.y > H - 40) { ps.estado = 'voltando'; return ps.pos; }   /* o cartão saiu da tela */
      if (andarPara(ps.pos, alvo, dt, ps.dest.vh ? 'vh' : null)) {
        ps.estado = 'parado'; ps.fica = acaso(PASSEIO.fica[0], PASSEIO.fica[1]);
        momento(0.8, 2);
        if (ps.dest.item) B.rede.acender(ps.dest.item.el);
      }
      return ps.pos;
    }
    if (ps.estado === 'parado') {
      var aqui = destinoXY(ps.dest);
      ps.pos.x = aqui.x; ps.pos.y = aqui.y;
      ps.fica -= dt;
      if (ps.fica <= 0 || aqui.y < TOPO - 20 || aqui.y > H - 40) ps.estado = 'voltando';
      return ps.pos;
    }
    /* voltando: anda até a doca (que se mexe com a rolagem); chamado, volta no dobro */
    if (andarPara(ps.pos, d, dt * (chamado ? 2 : 1), ps.dest && ps.dest.vh ? 'hv' : null)) { ps.estado = 'doca'; ps.dest = null; return null; }
    return ps.pos;
  }

  /* ---------- com o fundo: absorver, reemitir e dar o bote ---------- */
  function interagir(dt, t) {
    var F = B.rede.feixes;
    if (!F || !mini.ativo) return;
    if (reemitir) {
      reemitir.t -= dt;
      if (reemitir.t <= 0) {
        F.criar(mini.x, mini.y, reemitir.d, { forcar: true, carga: 1, vel: reemitir.vel * 1.15, cauda: reemitir.cauda, trilho: reemitir.trilho });
        pulso = Math.max(pulso, 0.5);
        reemitir = null;
      }
    }
    /* a cabeça de um feixe chega nele: a energia entra */
    if (!reemitir && t - ultimaAbsorcao > ABSORVE.pausa) {
      var f = F.perto(mini.x, mini.y, ABSORVE.raio * ESCALA);
      if (f && f.idade > 0.4) {
        f.morre = true;
        ultimaAbsorcao = t;
        mini.carga = 1; pulso = Math.max(pulso, 0.7);
        reemitir = { t: ABSORVE.reemite, d: f.d, vel: f.vel, cauda: f.caudaCheia, trilho: f.trilho };
        return;
      }
    }
    /* o bote: um feixe passa perto, ele avança um pouco na direção dele e volta */
    if (bote) { bote.t += dt; if (bote.t > BOTE.dura) bote = null; return; }
    if (t < proxBote || passeio.estado === 'indo' || passeio.estado === 'voltando') return;
    var g = F.perto(mini.x, mini.y, BOTE.raio);
    if (!g || g.trilho) return;
    proxBote = t + BOTE.pausa;
    if (Math.random() > BOTE.chance) return;
    var dx = g.x + g.vx * 30 - mini.x, dy = g.y + g.vy * 30 - mini.y, dd = Math.hypot(dx, dy) || 1, k = Math.min(BOTE.max, dd) / dd;
    bote = { x: dx * k, y: dy * k, t: 0 };
    foco = { x: g.x, y: g.y, t: 0.8 };
  }
  /* um choque ou uma junção na rede: ele olha; se foi um choque, pulsa */
  mini.aoEsbarrao = function (tipo, x, y) {
    if (!mini.ativo || B.reduced) return;
    var d = Math.hypot(x - mini.x, y - mini.y);
    if (d > (tipo === 'choque' ? 360 : 200)) return;
    foco = { x: x, y: y, t: 1 };
    if (tipo === 'choque') pulso = Math.max(pulso, 0.4);
  };
  mini.atrator = function () { return { x: mini.x, y: mini.y, r: ATRAI.r, s: ATRAI.s }; };

  function passo(dt, W, H) {
    var d = doca(W, H), alvoX = d.x, alvoY = d.y, solto = 1, t = B.relogio();
    /* no Hub: dentro do reator enquanto ele está na tela */
    var nu = B.nucleo;
    if (nu && nu.visivel) {
      solto = suave(1 - (nu.cy + nu.r) / (H * 0.7));
      alvoX = nu.cx + (d.x - nu.cx) * solto;
      alvoY = nu.cy + (d.y - nu.cy) * solto;
    }
    var menu = document.body.classList.contains('is-menu');
    /* com o menu do celular aberto ele sai de cena */
    var alvoVis = menu || d.fim ? 0 : suave(solto * 1.4);
    /* ainda sem medida da página, ou no Hub esperando o reator montar: não
       aparece na lateral para depois sumir e nascer dele (rede de 6 s) */
    if (nu && nu.visivel) reatorVisto = true;
    var aguardaReator = (B.nucleoEstado === 'esperando' || B.nucleoEstado === 'pronto') && !reatorVisto && esperou < 6;
    if (B.rede.alturaDoc() <= 1 || aguardaReator) alvoVis = 0;
    esperou += dt;
    /* uma LINHA de texto a menos de 12 px do anel (e na mesma altura, ±10 px): esmaece */
    perto += ((B.rede.sobreTexto(mini.x, mini.y, 9 * ESCALA + 12, 9 * ESCALA + 10) ? 1 : 0) - perto) * Math.min(1, dt / 0.4);
    alvoVis *= 1 - 0.5 * perto;
    if (primeiro || B.reduced) {
      if (B.reduced) { feixe = null; pulso = 0; mini.carga = 0; bote = null; foco = null; reemitir = null; passeio.estado = 'doca'; }
      mini.x = alvoX; mini.y = alvoY; mini.vx = mini.vy = 0; primeiro = false;
      mini.vis = alvoVis; mini.ativo = mini.vis > 0.05; ativoAntes = mini.ativo;
      return;
    }
    velRol += ((rolagem - rolagemAntes) / Math.max(dt, 0.001) - velRol) * Math.min(1, dt * 6);
    rolagemAntes = rolagem;

    /* o passeio só quando ele já está solto do reator, visível e sem menu */
    var fora = passear(dt, W, H, d, mini.ativo && solto > 0.98 && !menu && !d.fim && !chegando);
    if (fora) { alvoX = fora.x; alvoY = fora.y; }
    if (bote) { var e = Math.sin(Math.PI * Math.min(1, bote.t / BOTE.dura)); alvoX += bote.x * e; alvoY += bote.y * e; }

    mini.vx += (MOLA * (alvoX - mini.x) - AMORTECE * mini.vx) * dt;
    mini.vy += (MOLA * (alvoY - mini.y) - AMORTECE * mini.vy) * dt;
    mini.x += mini.vx * dt;
    mini.y += mini.vy * dt;
    mini.vis += (alvoVis - mini.vis) * Math.min(1, dt * (alvoVis < mini.vis ? 6 : 3));   /* some em ~300 ms */
    mini.ativo = mini.vis > 0.05;
    /* o nascimento de verdade: sair do reator do Hub (fechar o menu não é nascer) */
    if (mini.ativo && !ativoAntes && !chegando && nu && nu.visivel) momento(1, 3);
    ativoAntes = mini.ativo;

    /* o olhar: um esbarrão perto, o cursor, para onde anda, ou a rolagem */
    var ox = 0, oy = Math.max(-1, Math.min(1, velRol / 900)), vel = Math.hypot(mini.vx, mini.vy);
    if (foco) {
      foco.t -= dt;
      var fx = foco.x - mini.x, fy = foco.y - mini.y, fr = Math.hypot(fx, fy) || 1;
      ox = fx / fr; oy = fy / fr;
      if (foco.t <= 0) foco = null;
    } else if (ponteiro.ativo) {
      var dx = ponteiro.x - mini.x, dy = ponteiro.y - mini.y, r = Math.hypot(dx, dy) || 1;
      ox = dx / r; oy = dy / r;
      atencao += ((r < 60 ? 1 : 0) - atencao) * Math.min(1, dt * 5);
    } else if (vel > 60) { ox = mini.vx / vel; oy = mini.vy / vel; }
    if (!ponteiro.ativo) atencao += (0 - atencao) * Math.min(1, dt * 5);
    olhar.x += (ox - olhar.x) * Math.min(1, dt * 5);
    olhar.y += (oy - olhar.y) * Math.min(1, dt * 5);
    mini.forca = 1 + atencao;
    mini.carga = Math.max(0, mini.carga - dt * 1.2);
    /* a chegada de outra página: quando assenta, um pulso curto ("cheguei") */
    if (chegando) {
      desdeChegada += dt;
      if (desdeChegada > 0.3 && Math.hypot(mini.vx, mini.vy) < 20) { chegando = false; pulso = 0.5; }
    }

    /* o fôlego: no começo do expirar ele solta feixes na rede */
    var F = B.FOLEGO, x = ((t / F.periodo) % 1 + 1) % 1;
    if (mini.ativo && faseAntes < F.inspira && x >= F.inspira) momento(1, 2);
    faseAntes = x;
    interagir(dt, t);
    pulso = Math.max(0, pulso - dt * 0.9);
    if (feixe) { feixe.t += dt; if (feixe.t > FEIXE.desenha + FEIXE.segura + FEIXE.apaga) feixe = null; }
  }

  /* um momento: pulso e feixes saindo dele */
  function momento(forca, n) {
    pulso = Math.max(pulso, forca);
    B.rede.dispararDe(mini, n);
  }
  /* a ligação até o canto mais perto de uma seção ou de um cartão */
  function feixePara(secao, item) {
    if (!mini.ativo || B.reduced || passeio.estado !== 'doca') return;
    /* nunca corta uma ligação no meio: só troca quando a anterior já está apagando */
    if (feixe && feixe.t < FEIXE.desenha + FEIXE.segura) return;
    if (item) {
      var agora = B.relogio();
      if (agora - ultimoHover < HOVER_FEIXE) return;
      ultimoHover = agora;
    }
    var alvo = null;
    if (item) {
      var dm = ALCANCE_FEIXE * ALCANCE_FEIXE;
      for (var i = 0; i < item.ancoras.length; i++) {
        var a = item.ancoras[i], d = (a.x - mini.x) * (a.x - mini.x) + (a.y - mini.y) * (a.y - mini.y);
        if (d < dm) { dm = d; alvo = a; }
      }
    } else alvo = B.rede.cantoPerto(secao, mini.x, mini.y, ALCANCE_FEIXE);
    if (!alvo) { momento(0.6, 2); return; }
    feixe = { alvo: alvo, t: 0, marcou: false };
  }
  mini.aoAcender = function (item) { feixePara(null, item); };

  /* o que fica ATRÁS do texto (a rede apaga por cima): o rastro e a ligação */
  function desenharFundo(ctx) {
    if (!mini.ativo) return;
    var v = mini.vis, x = mini.x, y = mini.y;
    /* o rastro: só quando anda (de onde ele vem, apagando) */
    var vel = Math.hypot(mini.vx, mini.vy);
    if (vel > 30) {
      var k = Math.min(1, vel / 400), cx = x - (mini.vx / vel) * 46 * k, cy = y - (mini.vy / vel) * 46 * k;
      var gr = ctx.createLinearGradient(cx, cy, x, y);
      gr.addColorStop(0, 'rgba(' + AC + ',0)');
      gr.addColorStop(1, 'rgba(' + AC + ',' + (0.45 * k * v).toFixed(3) + ')');
      ctx.strokeStyle = gr; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    }
    /* a ligação ao canto da seção ou do cartão: desenha, segura, apaga; um losango no encaixe */
    if (feixe && feixe.alvo) {
      var ft = feixe.t, cresce = suave(ft / FEIXE.desenha), some = 1 - suave((ft - FEIXE.desenha - FEIXE.segura) / FEIXE.apaga);
      var ax = feixe.alvo.x, ay = feixe.alvo.y, hx = x + (ax - x) * cresce, hy = y + (ay - y) * cresce;
      ctx.strokeStyle = 'rgba(' + AC + ',' + (0.42 * some * v).toFixed(3) + ')'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
      if (cresce > 0.98 && !feixe.marcou && B.rede.feixes) { feixe.marcou = true; B.rede.feixes.evento('juncao', ax, ay); }
    }
  }

  /* o corpo, no canvas dele (acima das seções) */
  var pintadoParado = -1;
  function pintarCorpo() {
    var ativo = mini.ativo;
    if (ativo !== corpoVisivel) { corpo.style.opacity = ativo ? '1' : '0'; corpoVisivel = ativo; }
    if (!ativo) return;
    /* reduzido: um quadro parado; só repinta quando ele muda de lugar ou de visibilidade */
    if (B.reduced) {
      var sinal = Math.round(mini.x) * 13 + Math.round(mini.y) * 17 + Math.round(mini.vis * 20);
      if (sinal === pintadoParado) return;
      pintadoParado = sinal;
    } else pintadoParado = -1;
    corpo.style.transform = 'translate3d(' + (mini.x - CORPO / 2).toFixed(1) + 'px,' + (mini.y - CORPO / 2).toFixed(1) + 'px,0)';
    var t = B.relogio(), F = B.FOLEGO, fx = ((t / F.periodo) % 1 + 1) % 1;
    var folego = B.reduced ? 1 : fx < F.inspira ? suave(fx / F.inspira) : 1 - suave((fx - F.inspira) / (1 - F.inspira));
    var ctx = cctx, c = mini.carga;
    ctx.setTransform(cdpr, 0, 0, cdpr, 0, 0);
    ctx.clearRect(0, 0, CORPO, CORPO);
    var v = mini.vis, s = ESCALA * (1 + 0.14 * folego) * (1 + atencao * 0.35);
    var x = CORPO / 2, y = CORPO / 2;
    /* o anel e os dois arcos que giram (a roda do reator, em miniatura); a
       carga acende o anel; passeando, os arcos giram mais rápido */
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(' + (c > 0.3 ? T1 : AC2) + ',' + Math.min(1, (0.7 + 0.3 * c) * v).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, 7.5 * s, 0, TAU); ctx.stroke();
    var rot = B.reduced ? 0 : t * (passeio.estado === 'doca' ? 0.35 : 0.85);   /* reduzido: os arcos param (regra 4) */
    ctx.strokeStyle = 'rgba(' + AC + ',' + Math.min(1, (0.5 + 0.4 * c) * v).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, 11.5 * s, rot, rot + 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 11.5 * s, rot + Math.PI, rot + Math.PI + 0.7); ctx.stroke();
    /* o pulso: um anel que sai e some */
    if (pulso > 0.01) {
      ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.5 * pulso * v).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, (7.5 + PULSO * (1 - pulso)) * s, 0, TAU); ctx.stroke();
    }
    /* o núcleo, olhando (cresce com a carga) */
    ctx.fillStyle = 'rgba(' + T1 + ',' + v.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x + olhar.x * 2.6 * s, y + olhar.y * 2.6 * s, (2.6 + 0.9 * c) * s, 0, TAU); ctx.fill();
  }

  /* uma seção chega (o título a 40% da tela): ligação ao canto mais perto dela */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        if (!es[i].isIntersecting || !mini.ativo || B.reduced) continue;
        feixePara(es[i].target.closest('section'), null);
      }
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('main .kicker').forEach(function (k) { io.observe(k); });
  }

  window.addEventListener('scroll', function () { rolagem = window.scrollY; }, { passive: true });
  window.addEventListener('resize', function () { tela.W = window.innerWidth; tela.H = window.innerHeight; }, { passive: true });
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { ponteiro.x = e.clientX; ponteiro.y = e.clientY; ponteiro.ativo = true; } }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { ponteiro.ativo = false; }, { passive: true });
  }

  mini.desenharFundo = desenharFundo;
  B.rede.extra = mini;
  B.add('mini', function (S) { passo(Math.min(0.05, S.dt / 1000), tela.W, tela.H); pintarCorpo(); });
})();
