/* ==========================================================================
   O MINI AI CORE — o reator que segue você (pedido do dono, 2026-10-02:
   "conforme vamos passando e mudando de páginas, o AI Core vá seguindo a
   gente e interagindo também; não ele todo, algo pequeno e minimalista").

   O CORPO (ponto, anel, dois arcos, a marca de rumo) num canvas pequeno só
   dele, acima das seções e abaixo do menu, que anda por transform. O rastro,
   a ligação ao canto e a mira da sugestão ficam no canvas do campo
   (js/rede.js, por B.rede.extra), atrás do conteúdo. Só traço nítido.

   - No Hub ele NASCE do reator grande e se solta quando o reator sai da tela.
   - A DOCA: junto da coluna (desktop) ou no trilho da margem (celular), na
     altura do quanto da página já foi lida, com atraso de mola.
   - O PASSEIO: parado um tempo, ele vai para a margem do outro lado, um vão
     livre ou o canto de um cartão, em trechos de 45°, e volta. Rolar rápido o
     chama de volta: seguir você vem primeiro.
   - A OPÇÃO SOB O CURSOR (pedido do dono, 2026-10-03: "uma reação pouco
     aparente mas que dê pra sentir, como se quisesse que o usuário clique
     lá"): a marca de rumo no aro dele aponta para ela, ele se inclina uns
     px na direção dela, olha para ela, e o pulso fica mais frequente, como
     quem espera. O clique numa opção: um pulso de satisfação.
   - A SUGESTÃO ("durante a movimentação, sugerir que o usuário clique nas
     opções, ir em direção e acontecer alguma coisa"): às vezes o passeio é
     até uma opção. Ele para ao lado, trava a mira nos quatro cantos dela,
     solta UM anel e liga a opção ao núcleo pelo campo. No máximo uma a cada
     SUGESTAO.cada s, só com a rolagem parada (referência: os guias que
     sugerem sem virar pop-up).
   - A AGITAÇÃO (cliques seguidos no núcleo grande, B.agitacao): ele brilha
     mais, os arcos giram mais rápido e ele treme numa órbita curta.
   - Respira junto com o reator (B.relogio): no começo do expirar manda um
     sinal pelo campo até o núcleo. Seção chegando: liga-se ao canto mais
     perto. Ao trocar de página continua de onde estava.
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
  var BORDA_CEL = 11;                        /* celular: no eixo do trilho, entre a borda dos módulos e a da tela */
  /* abaixo de 360 px a margem não comporta o anel: ele não aparece (crítica, rodada 1) */
  var ESTREITO = window.innerWidth < 360;
  var ALCANCE_FEIXE = 320;                   /* px: mais longe que isso a ligação atravessaria a tela */
  var TOPO = celular ? 92 : 112, PE = 112;   /* PE: acima da barra fixa do celular */
  var FEIXE = { desenha: 0.35, segura: 1.05, apaga: 0.6 };   /* s */
  var VEIO_MS = 4000;                        /* a herança da página anterior vale por este tempo */
  var PASSEIO = { cada: [8, 14], fica: [2.5, 4], vel: celular ? 170 : 240, rolagemVolta: 700 };
  /* a opção sob o cursor: inclinação (px), pulsos de espera (s entre eles), quanto a marca demora a travar */
  var QUER = { inclina: 6, cada: 0.875, primeiro: 0.25, max: 3, forca: 0.32, segue: 8 };
  /* a sugestão: no máximo uma a cada `cada` s, com a rolagem parada há `parado` s;
     a mira trava em `trava` s; o anel abre de 0 a `anel` px em `abre` s */
  var SUGESTAO = { cada: 12, parado: 1.5, chance: 0.6, fica: 2.8, trava: 0.4, anel: 24, abre: 0.6, longe: [120, 900] };
  var SUGERIVEIS = 'a[href].btn, .servico, .celula, .cenario, .hero__rail > a, .servico__link, .celula__link, [data-campo]';
  var AGITA = { orbita: 10, giro: 1.6 };     /* px e rad/s a mais no máximo da agitação */

  var tela = { W: window.innerWidth, H: window.innerHeight };
  var CORPO = 96, corpo = document.createElement('canvas'), cctx = corpo.getContext('2d');
  var cdpr = Math.min(window.devicePixelRatio || 1, 2);
  corpo.className = 'mini';
  corpo.width = corpo.height = Math.round(CORPO * cdpr);
  /* dentro de um contêiner fixo do tamanho da tela, com overflow escondido (regra 10) */
  var palcoMini = document.createElement('div');
  palcoMini.className = 'mini-palco';
  palcoMini.setAttribute('aria-hidden', 'true');
  palcoMini.appendChild(corpo);
  document.body.appendChild(palcoMini);
  var corpoVisivel = null;
  var mini = { x: 0, y: 0, vx: 0, vy: 0, ativo: false, forca: 1, vis: 0, carga: 0 };
  var olhar = { x: 0, y: 0 }, ponteiro = { x: 0, y: 0, ativo: false }, foco = null;
  var atencao = 0, pulso = 0, faseAntes = 0, rolagem = window.scrollY, rolagemAntes = rolagem, velRol = 0, paradoHa = 0;
  var despedido = false, perto = 0, esperou = 0, reatorVisto = false;
  var feixe = null, primeiro = true, ativoAntes = false, chegando = false, desdeChegada = 0;
  var passeio = { estado: 'doca', espera: acaso(5, 9), pos: null, dest: null, fica: 0 };
  var quer = { alvo: null, f: 0, a: 0, prox: 0, n: 0 };   /* a opção sob o cursor */
  var sugestao = { ultima: -99, alvo: null, t: -1 };
  var relogioMini = 0;

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }
  function acaso(a, b) { return a + Math.random() * (b - a); }
  function saida(k) { k = limitar(k); return 1 - (1 - k) * (1 - k) * (1 - k); }
  /* a cor do anel entre o ciano claro e o branco, pela carga (sem troca seca) */
  var C0 = AC2.split(',').map(Number), C1 = T1.split(',').map(Number);
  function mistura(c) { c = limitar(c); return Math.round(C0[0] + (C1[0] - C0[0]) * c) + ',' + Math.round(C0[1] + (C1[1] - C0[1]) * c) + ',' + Math.round(C0[2] + (C1[2] - C0[2]) * c); }
  function difAng(a, b) { var d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }

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

  function coluna(W) {
    var pad = Math.min(64, Math.max(20, W * 0.05));
    return W > 1200 + 2 * pad ? { esq: (W - 1200) / 2 + pad, dir: (W + 1200) / 2 - pad } : { esq: pad, dir: W - pad };
  }
  function doca(W, H) {
    var x = celular ? W - BORDA_CEL : Math.min(W - 26, coluna(W).dir + 40);
    var prog = limitar(rolagem / Math.max(1, B.rede.alturaDoc() - H));
    var y = TOPO + prog * (H - TOPO - PE);
    var rod = B.rede.rodapeNaTela();
    if (rod < H) y = Math.min(y, rod - 36);
    if (rod < H * 0.62) despedido = true; else if (rod > H * 0.7) despedido = false;
    return { x: x, y: y, fim: despedido };
  }

  /* ---------- o passeio e a sugestão ---------- */
  function escolherDestino(W, H, d) {
    /* a sugestão: uma opção, com a rolagem parada e longe da última */
    if (relogioMini - sugestao.ultima > SUGESTAO.cada && paradoHa > SUGESTAO.parado && Math.random() < SUGESTAO.chance) {
      var op = B.rede.elementoAoAcaso(mini.x, mini.y, SUGESTAO.longe[0], SUGESTAO.longe[1], function (it) { return it.el.matches(SUGERIVEIS) && (celular || it.w < W * 0.8); });
      if (op) {
        sugestao.ultima = relogioMini;
        /* ao lado dela, fora do texto: à direita se couber, senão à esquerda; no celular, no trilho */
        var lado = op.x + op.w + 26 < W - 20 ? 1 : -1;
        return { item: op, sugere: true, vh: celular, ox: celular ? null : lado, fixX: celular ? W - BORDA_CEL : null };
      }
    }
    if (celular) return destinoCelular(W, H);
    var sorte = Math.random();
    if (sorte < 0.35) {
      var a = B.rede.elementoAoAcaso(mini.x, mini.y, 150, 600, function (it) { return it.el.matches('.painel, .cenario, .celula, .qa, .spec__item, .prova__item'); });
      if (a) return { item: a, canto: true, ox: a.x + a.w / 2 > mini.x ? -1 : 1 };
    }
    if (sorte < 0.7) return { x: Math.max(26, coluna(W).esq - 40), py: rolagem + Math.min(H - PE, Math.max(TOPO, d.y + acaso(-120, 120))) };
    for (var k = 0; k < 12; k++) {
      var px = acaso(60, W - 60), py = acaso(TOPO, H - PE);
      if (!B.rede.sobreTexto(px, py, 30, 30)) return { x: px, py: rolagem + py };
    }
    return null;
  }
  /* no celular a coluna de texto ocupa quase a tela: ele só sai do trilho por
     um VÃO (uma faixa sem texto de ponta a ponta) */
  function destinoCelular(W, H) {
    var trilho = W - BORDA_CEL;
    for (var k = 0; k < 16; k++) {
      var y = acaso(TOPO + 20, H - PE - 20), x = acaso(40, W - 60), livre = true;
      for (var sx = x; sx < trilho && livre; sx += 18) if (B.rede.sobreTexto(sx, y, 14, 18)) livre = false;
      if (livre) return { x: x, py: rolagem + y, vh: true };
    }
    return null;
  }
  /* onde fica o destino agora (os elementos andam com a página) */
  function destinoXY(dest) {
    if (dest.item) {
      var it = dest.item;
      if (dest.fixX !== null && dest.fixX !== undefined) return { x: dest.fixX, y: it.y + it.h / 2 };
      if (dest.canto) return { x: dest.ox < 0 ? it.x - 14 : it.x + it.w + 14, y: it.y - 14 };
      return { x: dest.ox > 0 ? it.x + it.w + 24 : it.x - 24, y: it.y + Math.min(it.h / 2, 36) };
    }
    return { x: dest.x, y: dest.py - rolagem };
  }
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
  function chegou(dest) {
    if (dest.sugere) {
      /* a sugestão: UM anel, a mira trava, um fio até a opção, o link dela
         acende (classe) e ela se liga ao núcleo. Nada mais (crítica, rodada 1:
         pulso + anel + cantos duplos liam como ruído) */
      sugestao.alvo = dest.item; sugestao.t = 0;
      dest.item.el.classList.add('is-sugerido');
      if (B.rede.campo) B.rede.campo.rota(dest.item.x + dest.item.w / 2, dest.item.y + dest.item.h / 2, { vida: 1.6 });
      return;
    }
    momento(0.8);
    if (dest.item) B.rede.acender(dest.item.el);
  }
  function soltarSugestao() {
    if (sugestao.alvo) sugestao.alvo.el.classList.remove('is-sugerido');
    sugestao.alvo = null;
  }
  function passear(dt, W, H, d, livre) {
    var ps = passeio;
    var chamado = Math.abs(velRol) > PASSEIO.rolagemVolta || !livre;
    if (ps.estado === 'doca') {
      if (!livre || Math.abs(velRol) > 200) return null;
      ps.espera -= dt * (1 + 2 * (B.agitacao || 0));   /* agitado, ele sai mais cedo */
      if (ps.espera > 0) return null;
      ps.espera = acaso(PASSEIO.cada[0], PASSEIO.cada[1]);
      ps.dest = escolherDestino(W, H, d);
      if (!ps.dest) return null;
      ps.estado = 'indo'; ps.pos = { x: mini.x, y: mini.y };
    }
    if (ps.estado !== 'voltando' && chamado) ps.estado = 'voltando';
    if (ps.estado === 'indo') {
      var alvo = destinoXY(ps.dest);
      if (alvo.y < TOPO - 20 || alvo.y > H - 40) { ps.estado = 'voltando'; return ps.pos; }
      if (andarPara(ps.pos, alvo, dt, ps.dest.vh ? 'vh' : null)) {
        ps.estado = 'parado'; ps.fica = ps.dest.sugere ? SUGESTAO.fica : acaso(PASSEIO.fica[0], PASSEIO.fica[1]);
        chegou(ps.dest);
      }
      return ps.pos;
    }
    if (ps.estado === 'parado') {
      var aqui = destinoXY(ps.dest);
      ps.pos.x = aqui.x; ps.pos.y = aqui.y;
      ps.fica -= dt;
      if (ps.fica <= 0 || aqui.y < TOPO - 20 || aqui.y > H - 40) { ps.estado = 'voltando'; soltarSugestao(); }
      return ps.pos;
    }
    if (andarPara(ps.pos, d, dt * (chamado ? 2 : 1), ps.dest && ps.dest.vh ? 'hv' : null)) { ps.estado = 'doca'; ps.dest = null; return null; }
    return ps.pos;
  }

  /* ---------- a opção sob o cursor e o clique ---------- */
  B.on('opcao', function (o) {
    if (!o) return;
    if (o.entrou) { quer.alvo = { x: o.x, y: o.y }; quer.prox = QUER.primeiro; quer.n = 0; }
    else quer.alvo = null;
  });
  document.addEventListener('click', function (e) {
    if (!mini.ativo || B.reduced || !e.isTrusted) return;
    var el = e.target && e.target.closest ? e.target.closest('a[href], button, [role="button"], summary') : null;
    if (!el) return;
    /* clicou: satisfação (e, se era a opção que ele sugeria, mais ainda) */
    var sugerida = sugestao.alvo && sugestao.alvo.el.contains(el);
    pulso = 1; mini.carga = Math.max(mini.carga, sugerida ? 1 : 0.6);
    if (sugerida) { soltarSugestao(); if (passeio.estado === 'parado') passeio.fica = Math.min(passeio.fica, 0.6); }
  }, { passive: true, capture: true });

  function passo(dt, W, H) {
    relogioMini += dt;
    var d = doca(W, H), alvoX = d.x, alvoY = d.y, solto = 1, t = B.relogio();
    var nu = B.nucleo;
    if (nu && nu.visivel) {
      solto = suave(1 - (nu.cy + nu.r) / (H * 0.7));
      alvoX = nu.cx + (d.x - nu.cx) * solto;
      alvoY = nu.cy + (d.y - nu.cy) * solto;
    }
    var menu = document.body.classList.contains('is-menu');
    var alvoVis = menu || d.fim ? 0 : suave(solto * 1.4);
    if (nu && nu.visivel) reatorVisto = true;
    var aguardaReator = (B.nucleoEstado === 'esperando' || B.nucleoEstado === 'pronto') && !reatorVisto && esperou < 6;
    if (B.rede.alturaDoc() <= 1 || aguardaReator) alvoVis = 0;
    esperou += dt;
    /* texto ou a borda de um módulo encostando no anel: esmaece (no celular
       o trilho fica a 9 px da borda dos módulos; parado ao lado deles, recua) */
    var encosta = B.rede.sobreTexto(mini.x, mini.y, 9 * ESCALA + 12, 9 * ESCALA + 10) || (celular && B.rede.sobreModulo && B.rede.sobreModulo(mini.x, mini.y, 12 * ESCALA));
    perto += ((encosta ? 1 : 0) - perto) * Math.min(1, dt / 0.4);
    alvoVis *= 1 - (celular ? 0.65 : 0.5) * perto;
    if (ESTREITO) alvoVis = 0;
    if (primeiro || B.reduced) {
      if (B.reduced) { feixe = null; pulso = 0; mini.carga = 0; foco = null; soltarSugestao(); quer.f = 0; passeio.estado = 'doca'; }
      mini.x = alvoX; mini.y = alvoY; mini.vx = mini.vy = 0; primeiro = false;
      mini.vis = alvoVis; mini.ativo = mini.vis > 0.05; ativoAntes = mini.ativo;
      return;
    }
    var dy = rolagem - rolagemAntes;
    velRol += (dy / Math.max(dt, 0.001) - velRol) * Math.min(1, dt * 6);
    rolagemAntes = rolagem;
    paradoHa = Math.abs(velRol) < 30 ? paradoHa + dt : 0;

    var fora = passear(dt, W, H, d, mini.ativo && solto > 0.98 && !menu && !d.fim && !chegando);
    if (fora) { alvoX = fora.x; alvoY = fora.y; }
    /* a opção sob o cursor: ele se inclina para ela (pouco, mas se sente) */
    quer.f += ((quer.alvo ? 1 : 0) - quer.f) * Math.min(1, dt * (quer.alvo ? 5 : 3));
    if (quer.alvo) {
      var qx = quer.alvo.x - mini.x, qy = quer.alvo.y - mini.y, qa = Math.atan2(qy, qx);
      quer.a += difAng(qa, quer.a) * Math.min(1, dt * QUER.segue);
      quer.prox -= dt;
      if (quer.prox <= 0 && quer.n < QUER.max) { pulsar(QUER.forca); quer.prox = QUER.cada; quer.n++; }
    }
    alvoX += Math.cos(quer.a) * QUER.inclina * quer.f;
    alvoY += Math.sin(quer.a) * QUER.inclina * quer.f;
    /* a agitação: uma órbita curta e rápida */
    var ag = B.agitacao || 0;
    if (ag > 0.01) { alvoX += Math.cos(t * 9.3) * AGITA.orbita * ag; alvoY += Math.sin(t * 7.1) * AGITA.orbita * ag; }

    mini.vx += (MOLA * (alvoX - mini.x) - AMORTECE * mini.vx) * dt;
    mini.vy += (MOLA * (alvoY - mini.y) - AMORTECE * mini.vy) * dt;
    mini.x += mini.vx * dt;
    mini.y += mini.vy * dt;
    mini.vis += (alvoVis - mini.vis) * Math.min(1, dt * (alvoVis < mini.vis ? 6 : 3));
    mini.ativo = mini.vis > 0.05;
    if (mini.ativo && !ativoAntes && !chegando && nu && nu.visivel) momento(1);
    ativoAntes = mini.ativo;

    /* o olhar: a sugestão, a opção sob o cursor, um esbarrão, o cursor, para onde anda, a rolagem */
    var ox = 0, oy = Math.max(-1, Math.min(1, velRol / 900)), vel = Math.hypot(mini.vx, mini.vy);
    var alvoOlhar = sugestao.alvo ? { x: sugestao.alvo.x + sugestao.alvo.w / 2, y: sugestao.alvo.y + sugestao.alvo.h / 2 } : quer.alvo || (foco && foco.t > 0 ? foco : null);
    if (foco) { foco.t -= dt; if (foco.t <= 0) foco = null; }
    if (alvoOlhar) {
      var fx = alvoOlhar.x - mini.x, fy = alvoOlhar.y - mini.y, fr = Math.hypot(fx, fy) || 1;
      ox = fx / fr; oy = fy / fr;
    } else if (ponteiro.ativo) {
      var dx = ponteiro.x - mini.x, dyp = ponteiro.y - mini.y, r = Math.hypot(dx, dyp) || 1;
      ox = dx / r; oy = dyp / r;
      atencao += ((r < 60 ? 1 : 0) - atencao) * Math.min(1, dt * 5);
    } else if (vel > 60) { ox = mini.vx / vel; oy = mini.vy / vel; }
    if (!ponteiro.ativo) atencao += (0 - atencao) * Math.min(1, dt * 5);
    olhar.x += (ox - olhar.x) * Math.min(1, dt * 5);
    olhar.y += (oy - olhar.y) * Math.min(1, dt * 5);
    mini.forca = 1 + atencao;
    mini.carga = Math.max(ag * 0.8, mini.carga - dt * 1.2);
    if (chegando) {
      desdeChegada += dt;
      if (desdeChegada > 0.3 && Math.hypot(mini.vx, mini.vy) < 20) { chegando = false; pulso = 0.5; }
    }
    /* o fôlego: no começo do expirar ele manda um sinal ao núcleo */
    var F = B.FOLEGO, x = ((t / F.periodo) % 1 + 1) % 1;
    if (mini.ativo && faseAntes < F.inspira && x >= F.inspira) momento(0.8);
    faseAntes = x;
    if (sugestao.alvo) sugestao.t += dt;
    pulso = Math.max(0, pulso - dt * 0.9);
    if (feixe) { feixe.t += dt; if (feixe.t > FEIXE.desenha + FEIXE.segura + FEIXE.apaga) feixe = null; }
  }

  function momento(forca) {
    pulsar(forca);
    B.rede.dispararDe(mini);
  }
  /* um pulso: `pulso` é a força que resta; `pulsoIni` a de partida (o raio anda pela fase) */
  var pulsoIni = 1;
  function pulsar(forca) { if (forca >= pulso) { pulso = forca; pulsoIni = forca; } }
  /* a ligação até o canto mais perto de uma seção */
  function feixePara(secao) {
    if (!mini.ativo || B.reduced || passeio.estado !== 'doca') return;
    if (feixe && feixe.t < FEIXE.desenha + FEIXE.segura) return;
    var alvo = B.rede.cantoPerto(secao, mini.x, mini.y, ALCANCE_FEIXE);
    if (!alvo) { momento(0.6); return; }
    feixe = { alvo: alvo, t: 0 };
  }

  /* o que fica ATRÁS do texto: o rastro, a ligação e a mira da sugestão */
  function desenharFundo(ctx) {
    if (!mini.ativo) return;
    var v = mini.vis, x = mini.x, y = mini.y;
    var vel = Math.hypot(mini.vx, mini.vy);
    if (vel > 30) {
      var k = Math.min(1, vel / 400), ux = mini.vx / vel, uy = mini.vy / vel, L = 46 * k;
      ctx.lineWidth = 1.2;
      for (var dgr = 0; dgr < 3; dgr++) {
        ctx.strokeStyle = 'rgba(' + AC + ',' + ([0.15, 0.3, 0.45][dgr] * k * v).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(x - ux * L * (3 - dgr) / 3, y - uy * L * (3 - dgr) / 3); ctx.lineTo(x - ux * L * (2 - dgr) / 3, y - uy * L * (2 - dgr) / 3); ctx.stroke();
      }
    }
    if (feixe && feixe.alvo) {
      var ft = feixe.t, cresce = suave(ft / FEIXE.desenha), some = 1 - suave((ft - FEIXE.desenha - FEIXE.segura) / FEIXE.apaga);
      var ax = feixe.alvo.x, ay = feixe.alvo.y, hx = x + (ax - x) * cresce, hy = y + (ay - y) * cresce;
      ctx.strokeStyle = 'rgba(' + AC + ',' + (0.42 * some * v).toFixed(3) + ')'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
    }
    /* a mira da sugestão: os quatro cantos da opção chegam de fora e travam */
    if (sugestao.alvo) {
      var it = sugestao.alvo, kk = saida(sugestao.t / SUGESTAO.trava), afasta = (1 - kk) * 14, m = 10;
      var apaga = passeio.estado === 'parado' ? 1 : 0;
      /* o fio do mini até a opção, nos primeiros 1,2 s: dá para ler QUAL ele indica */
      if (apaga && sugestao.t < 1.2) {
        var fk = 1 - limitar((sugestao.t - 0.8) / 0.4), tx = it.x + it.w / 2 > x ? it.x - 6 : it.x + it.w + 6, ty = Math.max(it.y, Math.min(it.y + it.h, y));
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.6 * fk * v).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (tx - x) * saida(sugestao.t / 0.35), y + (ty - y) * saida(sugestao.t / 0.35)); ctx.stroke();
      }
      if (apaga) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.9 * kk * v).toFixed(3) + ')';
        var x0 = it.x - 6 - afasta, y0 = it.y - 6 - afasta, x1 = it.x + it.w + 6 + afasta, y1 = it.y + it.h + 6 + afasta;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + m); ctx.lineTo(x0, y0); ctx.lineTo(x0 + m, y0);
        ctx.moveTo(x1 - m, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + m);
        ctx.moveTo(x0, y1 - m); ctx.lineTo(x0, y1); ctx.lineTo(x0 + m, y1);
        ctx.moveTo(x1 - m, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - m);
        ctx.stroke();
      }
    }
  }

  /* o corpo, no canvas dele (acima das seções) */
  var pintadoParado = -1;
  function pintarCorpo() {
    var ativo = mini.ativo;
    if (ativo !== corpoVisivel) { corpo.style.opacity = ativo ? '1' : '0'; corpoVisivel = ativo; }
    if (!ativo) return;
    if (B.reduced) {
      var sinal = Math.round(mini.x) * 13 + Math.round(mini.y) * 17 + Math.round(mini.vis * 20);
      if (sinal === pintadoParado) return;
      pintadoParado = sinal;
    } else pintadoParado = -1;
    corpo.style.transform = 'translate3d(' + (mini.x - CORPO / 2).toFixed(1) + 'px,' + (mini.y - CORPO / 2).toFixed(1) + 'px,0)';
    var t = B.relogio(), F = B.FOLEGO, fx = ((t / F.periodo) % 1 + 1) % 1;
    var folego = B.reduced ? 1 : fx < F.inspira ? suave(fx / F.inspira) : 1 - suave((fx - F.inspira) / (1 - F.inspira));
    var ctx = cctx, c = mini.carga, ag = B.reduced ? 0 : (B.agitacao || 0);
    ctx.setTransform(cdpr, 0, 0, cdpr, 0, 0);
    ctx.clearRect(0, 0, CORPO, CORPO);
    var v = mini.vis, s = ESCALA * (1 + 0.14 * folego) * (1 + atencao * 0.35);
    var x = CORPO / 2, y = CORPO / 2;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(' + mistura(c) + ',' + Math.min(1, (0.7 + 0.3 * c) * v).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, 7.5 * s, 0, TAU); ctx.stroke();
    var vrot = (passeio.estado === 'doca' ? 0.35 : 0.85) + AGITA.giro * ag + 0.4 * quer.f;
    var rot = B.reduced ? 0 : (relogioMini * vrot) % TAU;
    ctx.strokeStyle = 'rgba(' + AC + ',' + Math.min(1, (0.5 + 0.4 * c) * v).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, 11.5 * s, rot, rot + 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 11.5 * s, rot + Math.PI, rot + Math.PI + 0.7); ctx.stroke();
    /* agitado: um terceiro arco, mais fora e ao contrário */
    if (ag > 0.05) {
      ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.6 * ag * v).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, 15 * s, -rot * 1.6, -rot * 1.6 + 1.1); ctx.stroke();
    }
    /* a marca de rumo: um pequeno triângulo no aro, apontando para a opção */
    if (quer.f > 0.02 || sugestao.alvo) {
      var alvoA = sugestao.alvo ? Math.atan2(sugestao.alvo.y + sugestao.alvo.h / 2 - mini.y, sugestao.alvo.x + sugestao.alvo.w / 2 - mini.x) : quer.a;
      var fm = sugestao.alvo ? 1 : quer.f, rr = 11.5 * s + 3, ux = Math.cos(alvoA), uy = Math.sin(alvoA);
      ctx.fillStyle = 'rgba(' + AC2 + ',' + (0.95 * fm * v).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(x + ux * (rr + 6), y + uy * (rr + 6));
      ctx.lineTo(x + ux * rr - uy * 3, y + uy * rr + ux * 3);
      ctx.lineTo(x + ux * rr + uy * 3, y + uy * rr - ux * 3);
      ctx.closePath(); ctx.fill();
    }
    if (pulso > 0.01) {
      var fase = 1 - pulso / Math.max(pulsoIni, 0.01);
      ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.5 * pulso * v).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, (7.5 + PULSO * pulsoIni * fase) * s, 0, TAU); ctx.stroke();
    }
    /* a sugestão: UM anel que abre de 0 a 24 px e some (só uma vez) */
    if (sugestao.alvo && sugestao.t < SUGESTAO.abre) {
      var ka = saida(sugestao.t / SUGESTAO.abre);
      ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.8 * (1 - ka) * v).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, SUGESTAO.anel * ka), 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(' + T1 + ',' + v.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x + olhar.x * 2.6 * s, y + olhar.y * 2.6 * s, (2.6 + 0.9 * c) * s, 0, TAU); ctx.fill();
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        if (!es[i].isIntersecting || !mini.ativo || B.reduced) continue;
        feixePara(es[i].target.closest('section'));
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
  /* só leitura, para os testes (docs/verificar e afins): o que ele está fazendo */
  mini.estado = function () { return { passeio: passeio.estado, sugerindo: !!sugestao.alvo, querendo: quer.f > 0.5, agitacao: B.agitacao || 0 }; };
  B.rede.extra = mini;
  B.add('mini', function (S) { passo(Math.min(0.05, S.dt / 1000), tela.W, tela.H); pintarCorpo(); });
})();
