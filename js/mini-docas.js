/* ==========================================================================
   AS TOMADAS do mini AI Core nos botões (js/mini.js chama `B.miniDocas(ctx)`
   na montagem; separado de lá em 2026-10-04 para o mini.js caber no limite).

   Cada botão principal (cta) e secundário (botao) tem uma TOMADA discreta
   (dono: "mais minimalista e discreto, e não em cards"): um anel fino e
   apagado com um ponto no centro; as 3 travas só aparecem quando ele encaixa
   (nas posições das 3 que ele fecha: −90°, 30°, 150°). Só aparece com o
   cursor ou o mini por perto (a do botão principal, com o mini na tela).
   Ele vem quando o cursor HESITA perto do botão (~0,45 s; entre dois, o mais
   perto) ou, só no principal, quando o botão fica no meio da tela com a
   leitura parada (depois de a pessoa rolar). Encaixado: mira de quatro
   cantos, traço na borda, luz que atravessa o botão, seta que chama.
   A animação do encaixe e a imobilidade dele encaixado ficam em js/mini.js.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var TOMADAS = [
    { sel: 'main .btn--primary', tipo: 'cta' },
    { sel: 'main .btn--ghost', tipo: 'botao' }
  ];
  function posDoc(el) { var x = 0, y = 0; for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x: x, y: y }; }

  /* ctx: { mini, palco, celular, DOCA, TOPO, PE, ponteiro, rolagem(), paradoHa(), relogio(),
     emDoca(), ir(dest), pulsar(f), soltarSugestao() } */
  B.miniDocas = function (ctx) {
    var docas = [], ultimaDoca = -99, jaRolou = false, DOCA = ctx.DOCA;

    function montar() {
      for (var t = 0; t < TOMADAS.length; t++) {
        var T = TOMADAS[t], els = document.querySelectorAll(T.sel);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.closest('.barra, .nav, .lead-modal, [aria-hidden="true"]')) continue;
          var so = document.createElement('i'); so.className = 'doca' + (ctx.celular ? ' doca--cel' : '');
          for (var k = 0; k < 3; k++) so.appendChild(document.createElement('b'));
          var mira = document.createElement('i'); mira.className = 'doca-mira';
          for (k = 0; k < 4; k++) mira.appendChild(document.createElement('b'));
          ctx.palco.appendChild(mira); ctx.palco.appendChild(so);
          var dc = { el: el, tipo: T.tipo, so: so, mira: mira, x: 0, y: 0, w: 0, h: 0, ok: false, sx: -1e4, sy: -1e4, naTela: false, sob: false, hesita: 0, visto: 0, dist: 1e9, ultima: -99, acopladaHa: 0, pulsoHa: 0, tf: '' };
          ligar(dc);
          docas.push(dc);
        }
      }
      /* a medida vem com a da rede (rede:medida), depois do load: medir aqui forçava layout antes da 1ª pintura */
    }
    function ligar(dc) {
      dc.el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') dc.sob = true; });
      dc.el.addEventListener('pointerleave', function () { dc.sob = false; });
    }
    function medir() {
      var i, dc;
      for (i = 0; i < docas.length; i++) {
        dc = docas[i];
        dc.ok = !!dc.el.offsetWidth;
        if (!dc.ok) continue;
        var p = posDoc(dc.el);
        dc.x = p.x; dc.y = p.y; dc.w = dc.el.offsetWidth; dc.h = dc.el.offsetHeight;
      }
      /* as escritas depois de todas as leituras (intercaladas, cada botão forçava um layout) */
      for (i = 0; i < docas.length; i++) if (docas[i].ok) { docas[i].mira.style.width = (docas[i].w + 28) + 'px'; docas[i].mira.style.height = (docas[i].h + 28) + 'px'; }
    }
    function acoplar(dc) {
      dc.acopladaHa = 0; dc.pulsoHa = 0; dc.ultima = ctx.relogio(); ultimaDoca = ctx.relogio();
      dc.so.classList.add('is-acoplada'); dc.mira.classList.add('is-viva'); dc.el.classList.add('is-turbinado');
      B.rede.acender(dc.el, true);
    }
    function soltar(dc) {
      dc.so.classList.remove('is-acoplada', 'is-chamando'); dc.mira.classList.remove('is-viva'); dc.el.classList.remove('is-turbinado');
    }
    /* por quadro: onde cada tomada está, o que a pessoa está fazendo perto dele e, se for a hora, o encaixe */
    function passo(dt, W, H, livre) {
      var melhor = null, mini = ctx.mini, pt = ctx.ponteiro, rol = ctx.rolagem(), agora = ctx.relogio();
      if (rol > 160) jaRolou = true;
      for (var i = 0; i < docas.length; i++) {
        var dc = docas[i];
        if (!dc.ok) continue;
        var bx = dc.x - B.S.sx, by = dc.y - rol;
        /* no canto de cima à direita, por fora do botão */
        dc.sx = Math.min(W - 14, bx + dc.w + 10); dc.sy = by - 10;
        dc.naTela = by > ctx.TOPO && by + dc.h < H - ctx.PE && mini.vis > 0.05;
        /* só aparece quando faz sentido: a do principal com o mini na tela; a do secundário com o cursor ou o mini perto */
        var cx0 = bx + dc.w / 2, cy0 = by + dc.h / 2;
        var vizinha = dc.tipo === 'cta' || (pt.ativo && Math.abs(pt.x - cx0) < dc.w / 2 + DOCA.vizinha && Math.abs(pt.y - cy0) < dc.h / 2 + DOCA.vizinha) ||
          Math.hypot(mini.x - dc.sx, mini.y - dc.sy) < DOCA.vizinha * 1.4 || dc.so.classList.contains('is-acoplada') || dc.so.classList.contains('is-chamando');
        dc.so.classList.toggle('is-visivel', dc.naTela && vizinha && !B.reduced);
        if (!dc.naTela) { dc.hesita = 0; dc.visto = 0; continue; }
        var tf = 'translate3d(' + dc.sx.toFixed(1) + 'px,' + dc.sy.toFixed(1) + 'px,0)' + (ctx.celular ? ' scale(.72)' : '');
        if (tf !== dc.tf) { dc.so.style.transform = tf; dc.mira.style.transform = 'translate3d(' + (bx - 14).toFixed(1) + 'px,' + (by - 14).toFixed(1) + 'px,0)'; dc.tf = tf; }
        /* a hesitação: o cursor em cima ou perto do botão, sem clicar */
        var px = pt.x, py = pt.y;
        var pertoDele = pt.ativo && px > bx - DOCA.perto && px < bx + dc.w + DOCA.perto && py > by - DOCA.perto && py < by + dc.h + DOCA.perto;
        dc.hesita = pertoDele || dc.sob ? dc.hesita + dt : 0;
        /* entre dois botões rondados, vence o mais perto do cursor */
        dc.dist = pertoDele || dc.sob ? Math.hypot(Math.max(bx - px, 0, px - (bx + dc.w)), Math.max(by - py, 0, py - (by + dc.h))) : 1e9;
        /* a leitura: o principal no meio da tela, com a rolagem parada (só depois de a pessoa rolar) */
        var meio = by > H * 0.22 && by + dc.h < H * 0.8;
        dc.visto = dc.tipo === 'cta' && meio && jaRolou && ctx.paradoHa() > 0.4 ? dc.visto + dt : 0;
        if (agora - dc.ultima < DOCA.porCta) continue;
        if ((dc.hesita > DOCA.hesita || dc.visto > DOCA.parado) && (!melhor || dc.dist < melhor.dist)) melhor = dc;
      }
      if (!melhor || !livre || B.reduced || !ctx.emDoca() || agora - ultimaDoca < DOCA.cada) return;
      ctx.soltarSugestao();
      melhor.so.classList.add('is-chamando');
      ctx.ir({ cta: melhor, encaixa: true });
      ultimaDoca = agora; melhor.ultima = agora;
      ctx.pulsar(0.8);
    }

    montar();
    B.on('rede:medida', medir);
    return { passo: passo, acoplar: acoplar, soltar: soltar };
  };
})();
