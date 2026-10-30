/* ==========================================================================
   O ENCAIXE do mini AI Core nos botões (js/mini.js chama `B.miniDocas(ctx)`).

   2026-10-06, dono: "não quero esses espaços à mostra (a tomada vazia, um
   anel solto no canto do botão), polui e o espaçamento não está bom; ache
   uma forma mais discreta e precisa" e "quando ele se acoplar, quero que algo
   impressionante aconteça".

   ONDE: nada fica à mostra esperando. O ponto de encaixe é a própria BORDA do
   botão, em cima, perto do canto direito: o mini pousa com o centro sobre a
   linha da borda, como um componente soldado no circuito. Só quando ele está
   vindo aparecem duas marcas de 1 px na borda, uma de cada lado do ponto
   exato (registro de precisão), e somem quando ele sai.

   A IGNIÇÃO (o encaixe, ~1,2 s, tudo em linha de 1 px, sem desfoque):
   1. TRAVA: as três travas fecham em volta dele; uma onda dupla sai do
      ponto de encaixe e faíscas curtas (os raios do reator) disparam.
   2. INJEÇÃO: duas frentes de energia saem do ponto e correm a borda do
      botão em sentidos opostos, até se encontrarem do outro lado.
   3. CARGA: no encontro, a borda inteira acende, uma linha de varredura
      atravessa o botão e o RÓTULO leva a descarga (js/energia-texto.js: a
      frente passa, as letras viram faísca e se reimprimem).
   4. CIRCULAÇÃO: enquanto ele está encaixado, uma luz só corre a borda
      (uma linha + luz circulando, a regra do dono para molduras) e a seta
      chama.
   Desenhado no palco do mini (acima das seções). Movimento reduzido: nada.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var SVG = 'http://www.w3.org/2000/svg';
  var TOMADAS = [
    { sel: 'main .btn--primary', tipo: 'cta' },
    { sel: 'main .btn--ghost', tipo: 'botao' }
  ];
  var MOLDURA = 14;          /* px de folga da caixa do efeito em volta do botão (as ondas e faíscas saem dela) */
  var RECUO = 30;            /* px do canto direito até o ponto de encaixe, na borda de cima */
  var FAISCAS = 10;
  var VAO = 5;               /* px entre a borda do botão e o circuito: por fora, a energia corre no fundo escuro (no botão ciano sumia) */
  var CARGA_MS = 560;        /* quando as frentes se encontram e o rótulo leva a descarga (= circ-ida no CSS) */
  function posDoc(el) { var x = 0, y = 0; for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x: x, y: y }; }

  /* o contorno do botão como caminho que COMEÇA no ponto de encaixe; sentido horário ou anti-horário */
  function contorno(w, h, r, x0, horario) {
    var o = MOLDURA, R = Math.min(r, h / 2, w / 2) + VAO;
    var esq = o - VAO, dir = o + w + VAO, cima = o - VAO, baixo = o + h + VAO;
    if (horario) {
      return 'M' + (o + x0) + ' ' + cima + ' H' + (dir - R) + ' A' + R + ' ' + R + ' 0 0 1 ' + dir + ' ' + (cima + R) +
        ' V' + (baixo - R) + ' A' + R + ' ' + R + ' 0 0 1 ' + (dir - R) + ' ' + baixo + ' H' + (esq + R) +
        ' A' + R + ' ' + R + ' 0 0 1 ' + esq + ' ' + (baixo - R) + ' V' + (cima + R) + ' A' + R + ' ' + R + ' 0 0 1 ' + (esq + R) + ' ' + cima + ' Z';
    }
    return 'M' + (o + x0) + ' ' + cima + ' H' + (esq + R) + ' A' + R + ' ' + R + ' 0 0 0 ' + esq + ' ' + (cima + R) +
      ' V' + (baixo - R) + ' A' + R + ' ' + R + ' 0 0 0 ' + (esq + R) + ' ' + baixo + ' H' + (dir - R) +
      ' A' + R + ' ' + R + ' 0 0 0 ' + dir + ' ' + (baixo - R) + ' V' + (cima + R) + ' A' + R + ' ' + R + ' 0 0 0 ' + (dir - R) + ' ' + cima + ' Z';
  }
  function caminho(svg, classe) {
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('class', classe); p.setAttribute('pathLength', '100');
    svg.appendChild(p);
    return p;
  }

  /* ctx: { mini, palco, celular, DOCA, TOPO, PE, ponteiro, rolagem(), paradoHa(), relogio(),
     emDoca(), ir(dest), pulsar(f), soltarSugestao() } */
  B.miniDocas = function (ctx) {
    var docas = [], ultimaDoca = -99, jaRolou = false, DOCA = ctx.DOCA;

    function montar() {
      for (var t = 0; t < TOMADAS.length; t++) {
        var T = TOMADAS[t], els = document.querySelectorAll(T.sel);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.closest('.barra, .nav, [aria-hidden="true"]')) continue;
          /* o ponto: duas marcas de registro e as três travas */
          var so = document.createElement('i'); so.className = 'doca' + (ctx.celular ? ' doca--cel' : '');
          for (var k = 0; k < 3; k++) so.appendChild(document.createElement('b'));
          /* a ignição: o circuito (borda, frentes, luz que circula), as ondas, as faíscas, a varredura */
          var fx = document.createElement('i'); fx.className = 'doca-mira';
          var svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('class', 'doca-circuito'); svg.setAttribute('aria-hidden', 'true');
          var borda = caminho(svg, 'circ-borda'), idaA = caminho(svg, 'circ-ida'), idaB = caminho(svg, 'circ-ida'), volta = caminho(svg, 'circ-volta');
          fx.appendChild(svg);
          var ponto = document.createElement('i'); ponto.className = 'doca-ponto';
          for (k = 0; k < 2; k++) ponto.appendChild(document.createElement('u'));   /* as ondas */
          for (k = 0; k < FAISCAS; k++) {
            var f = document.createElement('b');
            /* (ângulos espalhados para cima e para os lados: para baixo é o próprio botão) */
            f.style.setProperty('--a', (-170 + k * (160 / (FAISCAS - 1)) + (Math.random() * 10 - 5)).toFixed(1) + 'deg');
            f.style.setProperty('--d', (26 + Math.random() * 22).toFixed(0) + 'px');
            ponto.appendChild(f);
          }
          fx.appendChild(ponto);
          /* onde as duas frentes se encontram, do outro lado: o estouro da carga */
          var encontro = document.createElement('i'); encontro.className = 'doca-ponto doca-encontro';
          encontro.appendChild(document.createElement('u'));
          fx.appendChild(encontro);
          var varre = document.createElement('i'); varre.className = 'doca-varre'; fx.appendChild(varre);
          ctx.palco.appendChild(fx); ctx.palco.appendChild(so);
          var dc = { el: el, tipo: T.tipo, so: so, mira: fx, svg: svg, borda: borda, idaA: idaA, idaB: idaB, volta: volta, ponto: ponto, encontro: encontro, varre: varre,
            x: 0, y: 0, w: 0, h: 0, r: 0, ok: false, sx: -1e4, sy: -1e4, naTela: false, sob: false, hesita: 0, visto: 0, dist: 1e9, ultima: -99, acopladaHa: 0, pulsoHa: 0, tf: '', carga: 0 };
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
        dc.r = parseFloat(getComputedStyle(dc.el).borderTopRightRadius) || 0;
      }
      /* as escritas depois de todas as leituras (intercaladas, cada botão forçava um layout) */
      for (i = 0; i < docas.length; i++) {
        dc = docas[i];
        if (!dc.ok) continue;
        var W = dc.w + MOLDURA * 2, H = dc.h + MOLDURA * 2, x0 = Math.max(dc.r + 4, dc.w - RECUO);
        dc.mira.style.width = W + 'px'; dc.mira.style.height = H + 'px';
        dc.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); dc.svg.setAttribute('width', W); dc.svg.setAttribute('height', H);
        var hor = contorno(dc.w, dc.h, dc.r, x0, true);
        dc.borda.setAttribute('d', hor); dc.volta.setAttribute('d', hor); dc.idaA.setAttribute('d', hor);
        dc.idaB.setAttribute('d', contorno(dc.w, dc.h, dc.r, x0, false));
        dc.ponto.style.left = (MOLDURA + x0) + 'px'; dc.ponto.style.top = MOLDURA + 'px';
        var meio = dc.idaA.getPointAtLength(dc.idaA.getTotalLength() / 2);
        dc.encontro.style.left = meio.x.toFixed(1) + 'px'; dc.encontro.style.top = meio.y.toFixed(1) + 'px';
        dc.x0 = x0;
      }
    }
    function acoplar(dc) {
      dc.acopladaHa = 0; dc.pulsoHa = 0; dc.ultima = ctx.relogio(); ultimaDoca = ctx.relogio();
      dc.so.classList.add('is-acoplada');
      dc.mira.classList.remove('is-viva'); void dc.mira.offsetWidth;   /* (reinicia as animações num segundo encaixe) */
      dc.mira.classList.add('is-viva');
      dc.el.classList.add('is-turbinado');
      B.rede.acender(dc.el, true);
      /* o rótulo leva a descarga quando as duas frentes se encontram */
      clearTimeout(dc.carga);
      dc.carga = setTimeout(function () {
        if (!dc.el.classList.contains('is-turbinado') || !B.energizar) return;
        var no = [].filter.call(dc.el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); })[0];
        if (no) B.energizar(no, { ms: 520 });
        else { var rot = dc.el.querySelector(':scope > span:not([data-seta]):not(.e-no)'); if (rot) B.energizar(rot, { ms: 520 }); }
        ctx.pulsar(1);
      }, CARGA_MS);
    }
    function soltar(dc) {
      clearTimeout(dc.carga);
      dc.so.classList.remove('is-acoplada', 'is-chamando'); dc.mira.classList.remove('is-viva'); dc.el.classList.remove('is-turbinado');
    }
    /* por quadro: onde cada ponto de encaixe está, o que a pessoa está fazendo perto dele e, se for a hora, o encaixe */
    function passo(dt, W, H, livre) {
      var melhor = null, pt = ctx.ponteiro, rol = ctx.rolagem(), agora = ctx.relogio();
      if (rol > 160) jaRolou = true;
      for (var i = 0; i < docas.length; i++) {
        var dc = docas[i];
        if (!dc.ok) continue;
        var bx = dc.x - B.S.sx, by = dc.y - rol;
        /* NA BORDA de cima, perto do canto direito: o centro dele sobre a linha */
        dc.sx = Math.min(W - 14, bx + dc.x0); dc.sy = by;
        dc.naTela = by > ctx.TOPO && by + dc.h < H - ctx.PE && ctx.mini.vis > 0.05;
        if (!dc.naTela) { dc.hesita = 0; dc.visto = 0; continue; }
        var tf = 'translate3d(' + dc.sx.toFixed(1) + 'px,' + dc.sy.toFixed(1) + 'px,0)' + (ctx.celular ? ' scale(.72)' : '');
        if (tf !== dc.tf) { dc.so.style.transform = tf; dc.mira.style.transform = 'translate3d(' + (bx - MOLDURA).toFixed(1) + 'px,' + (by - MOLDURA).toFixed(1) + 'px,0)'; dc.tf = tf; }
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
