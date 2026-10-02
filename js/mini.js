/* ==========================================================================
   O MINI AI CORE — o reator que segue você (pedido do dono, 2026-10-02:
   "conforme vamos passando e mudando de páginas, o AI Core vá seguindo a
   gente e interagindo também; não ele todo, algo pequeno e minimalista").

   O CORPO (ponto, anel, dois arcos) num canvas pequeno só dele, acima
   das seções e abaixo do menu, que anda por transform: no canvas da rede,
   atrás do conteúdo, as seções de fundo grafite o apagavam (crítica, rodada
   5). O rastro e o feixe ficam no canvas da rede (js/rede.js, por
   B.rede.extra), atrás do conteúdo. Sem brilho nem luz desfocada em volta
   (o dono tirou todo desfoque do site, 2026-10-02): ele é só traço nítido.
   - No Hub ele NASCE do reator grande: enquanto o reator está na tela ele
     está dentro dele; quando o reator sai, ele se solta e vai para a
     lateral. Nas outras páginas já começa na lateral.
   - Na lateral (junto da coluna de conteúdo) ele desce com a rolagem, com
     atraso de mola e um rastro curto quando anda: lê como alguém seguindo,
     não como barra de rolagem (crítica, rodada 1). Olha para o cursor (ou,
     no celular, para onde você rola).
   - Respira junto com o reator (B.relogio): no começo do expirar solta
     sinais na rede. Quando uma seção chega (o título a 40% da tela) ou um
     cartão acende (cursor, ou o centro da tela no celular), ele lança um
     feixe até o canto mais perto dela, se estiver a até 320 px; se não, só
     pulsa e solta sinais. Pulsa ao nascer do reator e ao chegar de outra
     página: os momentos que dizem "ele está seguindo".
   - Ao trocar de página continua de onde estava (x e y, sessionStorage) e
     desliza até o lugar novo; a fase do fôlego é a mesma.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || !B.rede) return;

  var TAU = Math.PI * 2;
  var celular = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), T1 = '242,244,244';

  /* a mola da posição: criticamente amortecida, assenta em ~0,65 s (com 70
     grudava na rolagem e o "seguir" não se sentia) */
  var MOLA = 40, AMORTECE = 2 * Math.sqrt(MOLA);
  var ESCALA = celular ? 0.8 : 1;
  var PULSO = celular ? 7 : 10;              /* px que o anel do pulso abre (no celular não é cortado na borda) */
  var HOVER_FEIXE = 2;                       /* s: no máximo um feixe por cartão sob o cursor neste intervalo */
  var BORDA_CEL = window.innerWidth < 360 ? 12 : 14;   /* celular: no eixo do trilho (js/rede.js), fora da coluna de texto */
  var ALCANCE_FEIXE = 320;                   /* px: mais longe que isso o feixe atravessaria a tela */
  var TOPO = celular ? 92 : 112, PE = 112;   /* PE: acima da barra fixa do celular */
  var FEIXE = { desenha: 0.35, segura: 1.05, apaga: 0.6 };   /* s */
  var VEIO_MS = 4000;                        /* a herança da página anterior vale por este tempo */

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
  var mini = { x: 0, y: 0, vx: 0, vy: 0, tipo: 5, k: 1, ativo: false, forca: 1, vis: 0, ix: 0 };
  var olhar = { x: 0, y: 0 }, ponteiro = { x: 0, y: 0, ativo: false };
  var atencao = 0, pulso = 0, faseAntes = 0, rolagem = window.scrollY, rolagemAntes = rolagem, velRol = 0;
  var despedido = false, perto = 0, esperou = 0, reatorVisto = false;   /* perto: o texto encostando, suavizado em ~0,4 s */
  var feixe = null, primeiro = true, ativoAntes = false, chegando = false, desdeChegada = 0, ultimoHover = -9;

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }

  /* de onde ele vem: a página anterior deixou onde ele estava (fração da tela) */
  try {
    var veio = JSON.parse(sessionStorage.getItem('bz-mini') || 'null');
    if (veio && Date.now() - veio.quando < VEIO_MS) { mini.x = veio.x * tela.W; mini.y = veio.y * tela.H; mini.vis = 1; primeiro = false; chegando = true; }
  } catch (e) { /* sem armazenamento: começa na lateral */ }
  window.addEventListener('pagehide', function () {
    try { sessionStorage.setItem('bz-mini', JSON.stringify({ x: mini.x / tela.W, y: mini.y / tela.H, quando: Date.now() })); } catch (e) { /* idem */ }
  });

  /* o lugar dele: junto da coluna de conteúdo (desktop) ou na margem (celular),
     na altura do quanto da página já foi lida */
  function doca(W, H) {
    var x;
    if (celular) x = W - BORDA_CEL;
    else {
      var pad = Math.min(64, Math.max(20, W * 0.05));   /* o --pad do CSS */
      var colDir = W > 1200 + 2 * pad ? (W + 1200) / 2 - pad : W - pad;
      x = Math.min(W - 26, colDir + 40);
    }
    var prog = limitar(rolagem / Math.max(1, B.rede.alturaDoc() - H));
    var y = TOPO + prog * (H - TOPO - PE);
    /* o trilho termina no começo do rodapé: ele não desce sobre os links */
    var rod = B.rede.rodapeNaTela();
    if (rod < H) y = Math.min(y, rod - 36);
    /* a despedida com histerese: some abaixo de 62% e só volta acima de 70%
       (parar a rolagem perto do limiar fazia ele piscar) */
    if (rod < H * 0.62) despedido = true; else if (rod > H * 0.7) despedido = false;
    return { x: x, y: y, fim: despedido };
  }

  function passo(dt, W, H) {
    var d = doca(W, H), alvoX = d.x, alvoY = d.y, solto = 1;
    /* no Hub: dentro do reator enquanto ele está na tela */
    var nu = B.nucleo;
    if (nu && nu.visivel) {
      solto = suave(1 - (nu.cy + nu.r) / (H * 0.7));
      alvoX = nu.cx + (d.x - nu.cx) * solto;
      alvoY = nu.cy + (d.y - nu.cy) * solto;
    }
    /* com o menu do celular aberto ele sai de cena; sobre texto, esmaece */
    var alvoVis = document.body.classList.contains('is-menu') || d.fim ? 0 : suave(solto * 1.4);
    /* ainda sem medida da página, ou no Hub esperando o reator montar: não
       aparece na lateral para depois sumir e nascer dele (rede de 6 s) */
    if (nu && nu.visivel) reatorVisto = true;
    var aguardaReator = (B.nucleoEstado === 'esperando' || B.nucleoEstado === 'pronto') && !reatorVisto && esperou < 6;
    if (B.rede.alturaDoc() <= 1 || aguardaReator) alvoVis = 0;
    esperou += dt;   /* com o rodapé dominando a tela, ele se despede */
    /* uma LINHA de texto a menos de 12 px do anel (e na mesma altura, ±10 px): esmaece */
    /* suavizado: linhas longas e curtas se alternam ao rolar e ele piscava linha a linha */
    perto += ((B.rede.sobreTexto(mini.x, mini.y, 9 * ESCALA + 12, 9 * ESCALA + 10) ? 1 : 0) - perto) * Math.min(1, dt / 0.4);
    alvoVis *= 1 - 0.5 * perto;   /* só quando uma LINHA de texto chega nele */
    if (primeiro || B.reduced) {
      mini.x = alvoX; mini.y = alvoY; mini.vx = mini.vy = 0; primeiro = false;
      mini.vis = alvoVis; mini.ativo = mini.vis > 0.05; ativoAntes = mini.ativo;
      return;
    }
    mini.vx += (MOLA * (alvoX - mini.x) - AMORTECE * mini.vx) * dt;
    mini.vy += (MOLA * (alvoY - mini.y) - AMORTECE * mini.vy) * dt;
    mini.x += mini.vx * dt;
    mini.y += mini.vy * dt;
    mini.vis += (alvoVis - mini.vis) * Math.min(1, dt * (alvoVis < mini.vis ? 6 : 3));   /* some em ~300 ms */
    mini.ativo = mini.vis > 0.05;
    /* o nascimento: no instante em que aparece (antes disso não estava na rede e o pulso não se via) */
    /* só o nascimento de verdade: sair do reator do Hub (fechar o menu não é nascer) */
    if (mini.ativo && !ativoAntes && !chegando && nu && nu.visivel) momento(1);
    ativoAntes = mini.ativo;

    /* o olhar: o cursor (desktop) ou a direção da rolagem (celular) */
    velRol += ((rolagem - rolagemAntes) / Math.max(dt, 0.001) - velRol) * Math.min(1, dt * 6);
    rolagemAntes = rolagem;
    var ox = 0, oy = Math.max(-1, Math.min(1, velRol / 900));
    if (ponteiro.ativo) {
      var dx = ponteiro.x - mini.x, dy = ponteiro.y - mini.y, r = Math.hypot(dx, dy) || 1;
      ox = dx / r; oy = dy / r;
      atencao += ((r < 60 ? 1 : 0) - atencao) * Math.min(1, dt * 5);
    } else atencao += (0 - atencao) * Math.min(1, dt * 5);
    olhar.x += (ox - olhar.x) * Math.min(1, dt * 5);
    olhar.y += (oy - olhar.y) * Math.min(1, dt * 5);
    mini.forca = 1 + atencao;
    /* a chegada de outra página: quando assenta, um pulso curto ("cheguei") */
    if (chegando) {
      desdeChegada += dt;
      if (desdeChegada > 0.3 && Math.hypot(mini.vx, mini.vy) < 20) { chegando = false; pulso = 0.5; }
    }

    /* o fôlego: no começo do expirar ele solta sinais na rede */
    var F = B.FOLEGO, x = ((B.relogio() / F.periodo) % 1 + 1) % 1;
    if (mini.ativo && faseAntes < F.inspira && x >= F.inspira) { pulso = 1; B.rede.dispararDe(mini, 3); }
    faseAntes = x;
    pulso = Math.max(0, pulso - dt * 0.9);
    if (feixe) { feixe.t += dt; if (feixe.t > FEIXE.desenha + FEIXE.segura + FEIXE.apaga) feixe = null; }
  }

  /* um momento: pulso e sinais na rede */
  function momento(forca) {
    pulso = forca;
    B.rede.dispararDe(mini, 3);
  }
  /* um feixe até o canto mais perto de uma seção ou de um cartão */
  function feixePara(secao, item) {
    if (!mini.ativo || B.reduced) return;
    /* nunca corta um feixe no meio: só troca quando o anterior já está apagando */
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
    if (!alvo) { momento(0.6); return; }
    feixe = { alvo: alvo, t: 0 };
    B.rede.lancar(mini, alvo, FEIXE.desenha, true);
  }
  mini.aoAcender = function (item) { feixePara(null, item); };

  /* o que fica ATRÁS do texto (a rede apaga por cima): o rastro e o feixe */
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
    /* o feixe até o canto da seção ou do cartão: desenha, segura, apaga; um tique no fim */
    if (feixe && feixe.alvo) {
      var ft = feixe.t, cresce = suave(ft / FEIXE.desenha), some = 1 - suave((ft - FEIXE.desenha - FEIXE.segura) / FEIXE.apaga);
      var ax = feixe.alvo.x, ay = feixe.alvo.y, hx = x + (ax - x) * cresce, hy = y + (ay - y) * cresce;
      ctx.strokeStyle = 'rgba(' + AC + ',' + (0.42 * some * v).toFixed(3) + ')'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
      if (cresce > 0.98) {
        ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.8 * some * v).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(ax, ay - 3); ctx.lineTo(ax, ay + 3); ctx.stroke();
      }
    }
  }

  /* o corpo, no canvas dele (acima das seções) */
  function pintarCorpo() {
    var ativo = mini.ativo;
    if (ativo !== corpoVisivel) { corpo.style.opacity = ativo ? '1' : '0'; corpoVisivel = ativo; }
    if (!ativo) return;
    corpo.style.transform = 'translate3d(' + (mini.x - CORPO / 2).toFixed(1) + 'px,' + (mini.y - CORPO / 2).toFixed(1) + 'px,0)';
    var t = B.relogio(), F = B.FOLEGO, fx = ((t / F.periodo) % 1 + 1) % 1;
    var folego = B.reduced ? 1 : fx < F.inspira ? suave(fx / F.inspira) : 1 - suave((fx - F.inspira) / (1 - F.inspira));
    var ctx = cctx;
    ctx.setTransform(cdpr, 0, 0, cdpr, 0, 0);
    ctx.clearRect(0, 0, CORPO, CORPO);
    var v = mini.vis, s = ESCALA * (1 + 0.14 * folego) * (1 + atencao * 0.35);
    var x = CORPO / 2, y = CORPO / 2;
    /* o anel e os dois arcos que giram (a roda do reator, em miniatura) */
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.7 * v).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, 7.5 * s, 0, TAU); ctx.stroke();
    var rot = B.reduced ? 0 : t * 0.35;   /* reduzido: os arcos param (regra 4) */
    ctx.strokeStyle = 'rgba(' + AC + ',' + (0.5 * v).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, 11.5 * s, rot, rot + 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 11.5 * s, rot + Math.PI, rot + Math.PI + 0.7); ctx.stroke();
    /* o pulso do expirar: um anel que sai e some */
    if (pulso > 0.01) {
      ctx.strokeStyle = 'rgba(' + AC2 + ',' + (0.5 * pulso * v).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, (7.5 + PULSO * (1 - pulso)) * s, 0, TAU); ctx.stroke();
    }
    /* o núcleo, olhando */
    ctx.fillStyle = 'rgba(' + T1 + ',' + v.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x + olhar.x * 2.6 * s, y + olhar.y * 2.6 * s, 2.6 * s, 0, TAU); ctx.fill();
  }

  /* uma seção chega (o título a 40% da tela): feixe até o canto mais perto dela */
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
