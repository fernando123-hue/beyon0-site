/* PLANTA VIVA v2 (laboratório): o ESBOÇO que cresce com a conversa. window.BZPlantaEsboco.criar(raiz, opcoes) -> { crescer(esboco), interno, parar }.
   O desenho não é um fluxograma de caixas: é um TRILHO de 1 px que desce do núcleo do Zero, com as estações como peças no trilho (o ícone num
   chip de canto cortado) e o texto ao lado. Cinco lugares e o objetivo, sempre os mesmos: a altura só depende da largura (nada desloca a
   página). O que o Zero ainda não entendeu fica FANTASMA (traço tracejado e "a entender"). A consagração (js/planta-consagra.js) parte
   daqui.
   MOVIMENTO (a assinatura do site, "a luz passa e imprime"): a SEMENTE acende o núcleo (aro desenhado, rumos girando, disco, duas ondas) e
   solta o primeiro traço; cada ESTAÇÃO nasce pela luz que desce do núcleo (350 ms), o chip e o ícone se desenham traço a traço (300 ms), o
   texto é impresso por uma varredura de 1 px (250 ms). Só Web Animations: stroke-dashoffset uma vez por traço; o repouso (um ponto que desce
   o trilho a cada 6 s e a onda do núcleo) é só transform e opacity. Nenhum requestAnimationFrame. Uma estação só toca quando o quadro está
   na tela (a planta espera a pessoa, nunca rola a página por ela) e pausa com a aba escondida. Movimento reduzido ou html.menos-movimento:
   cada estação aparece inteira, sem voo nem varredura.
   SEGURANÇA: texto só por textContent (aqui só há texto de listas fechadas, mas a regra é a do módulo real). ES5. */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = { para: fabrica };
  if (raiz) { var api = fabrica(raiz); if (api) raiz.BZPlantaEsboco = api; }
})(typeof window !== 'undefined' ? window : null, function (window) {
  'use strict';
  /* a janela vem de fora (no Node, a de mentira dos testes): o resto do módulo só fala com ela */
  var document = window.document;
  var NS = 'http://www.w3.org/2000/svg', Pecas = window.BZPlantaPecas, Cresce = window.BZPlantaCresce, Relogio = window.BZPlantaRelogio;
  if (!Pecas || !Cresce || !Relogio) return null;

  /* a geometria do esboço (px). RX = o trilho; P = o passo entre estações; C = o chip */
  var RX = 26, NY = 26, NR = 20, P = 58, C = 36, Y0 = 66, LR = 20, TX = RX + C / 2 + 14, CHAMFRO = 7;
  var T = { luz: 350, chip: 300, texto: 250, entre: 160, repouso: 6000 };

  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var dois = function (n) { return (n < 10 ? '0' : '') + n; };
  var cy = function (i) { return Y0 + i * P + C / 2; };
  var LEDY = cy(4) + P;
  var ALTURA = LEDY + LR + 14;
  var chipD = function (x, y, s) { return 'M' + (x + CHAMFRO) + ' ' + y + 'H' + (x + s) + 'V' + (y + s) + 'H' + x + 'V' + (y + CHAMFRO) + 'Z'; };

  function geometria(W) {
    var larg = Math.max(220, W), estacoes = [], i;
    for (i = 0; i < 5; i++) estacoes.push({ cx: RX, cy: cy(i), texto: { x: TX, y: cy(i) - 26, w: larg - TX - 8, h: 52 } });
    return { W: larg, H: ALTURA, nucleo: { cx: RX, cy: NY, r: NR }, estacoes: estacoes, led: { cx: RX, cy: LEDY, r: LR, texto: { x: TX, y: LEDY - 26, w: larg - TX - 8, h: 52 } } };
  }

  function reduzido() {
    var m = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    return !!((m && m.matches) || document.documentElement.classList.contains('menos-movimento'));
  }
  function S(tag, attrs, pai, cls) {
    var e = document.createElementNS(NS, tag), k;
    if (cls) e.setAttribute('class', cls);
    for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  function H(tag, cls, txt, pai) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (pai) pai.appendChild(e);
    return e;
  }
  /* nenhuma palavra sozinha na última linha: as duas últimas andam juntas (espaço sem quebra). Vale para todo texto da planta */
  /* (s\u00f3 com 3 palavras ou mais e um par curto: num r\u00f3tulo de 2 palavras numa coluna estreita, juntar obrigava o navegador a partir a palavra) */
  var semViuva = function (t) {
    var s = String(t || '').replace(/\s+$/, ''), m = s.match(/(\S+)\s+(\S+)$/);
    if (!m || s.split(/\s+/).length < 3 || m[1].length + m[2].length > 17) return s;
    return s.slice(0, s.length - m[0].length) + m[1] + '\u00a0' + m[2];
  };
  var aviso = function (e) { if (window.console) window.console.warn('[planta-v2] ' + (e && e.message ? e.message : e)); };

  function criar(raiz, opcoes) {
    var op = opcoes || {}, som = op.som || function () {}, inst;
    var W = Math.round(op.largura || raiz.clientWidth || 320), g = geometria(W);

    /* ---------- o cartão ---------- */
    var card = H('section', 'lv'), topo = H('p', 'lv-kicker', null, card);
    card.setAttribute('aria-label', 'A planta do seu site');
    H('span', '', 'Planta', topo); var estadoTopo = H('b', '', ' · nasce com a conversa', topo);
    var quadro = H('div', 'lv-quadro', null, card);
    quadro.style.height = g.H + 'px';
    var svg = S('svg', { viewBox: '0 0 ' + g.W + ' ' + g.H, width: g.W, height: g.H, 'aria-hidden': 'true', focusable: 'false' }, quadro, 'lv-svg');
    var lista = H('ol', 'lv-lista', null, quadro); lista.setAttribute('aria-label', 'A planta até aqui');
    var leitura = H('p', 'lv-leitura', null, card); leitura.setAttribute('aria-hidden', 'true');
    var leTag = H('b', 'lv-leitura__tag', 'Zero', leitura), leTxt = H('span', 'lv-leitura__txt', 'A planta começa quando você me contar do seu negócio.', leitura);
    var leVarre = H('span', 'lv-varre', null, leitura);
    var status = H('p', 'lv-sr', '', card); status.setAttribute('role', 'status');

    var grade = '', x, y;
    for (x = 24; x < g.W; x += 24) grade += 'M' + x + ' 0V' + g.H;
    for (y = 24; y < g.H; y += 24) grade += 'M0 ' + y + 'H' + g.W;
    S('path', { d: grade }, svg, 'lv-grade');
    var trilhoFan = S('path', { d: 'M' + RX + ' ' + (NY + NR * 0.76) + 'V' + (LEDY - LR * 0.63) }, svg, 'lv-trilho-fan');
    var gTrilho = S('g', {}, svg), gNos = S('g', {}, svg), gLuz = S('g', {}, svg);

    /* o trilho aceso, trecho a trecho: do núcleo (ou da estação de cima) até o topo do chip; o último trecho vai ao LED */
    var trechos = [], i;
    for (i = 0; i <= 5; i++) {
      var de = i === 0 ? NY + NR * 0.76 : cy(i - 1) + C / 2, ate = i < 5 ? cy(i) - C / 2 : LEDY - LR * 0.63;
      trechos.push(S('path', { d: 'M' + RX + ' ' + r1(de) + 'V' + r1(ate), pathLength: 1 }, gTrilho, 'lv-trilho'));
    }

    /* o núcleo: o mesmo vocabulário do reator (aro, aro interno tracejado, 12 rumos que giram, disco, ondas) */
    var gN = S('g', { transform: 'translate(' + RX + ' ' + NY + ')' }, gNos, 'lv-nucleo');
    var ondasN = [S('circle', { r: r1(NR * 0.76) }, gN, 'lv-onda'), S('circle', { r: r1(NR * 0.76) }, gN, 'lv-onda')];
    var aroN = S('circle', { r: r1(NR * 0.76), pathLength: 1 }, gN, 'lv-aro');
    var gira = S('g', {}, gN, 'lv-gira'), rumos = '';
    S('circle', { r: r1(NR * 0.5) }, gira, 'lv-aro lv-aro--int');
    for (i = 0; i < 12; i++) { var a = i * Math.PI / 6; rumos += 'M' + r1(Math.cos(a) * NR * 0.88) + ' ' + r1(Math.sin(a) * NR * 0.88) + 'L' + r1(Math.cos(a) * NR) + ' ' + r1(Math.sin(a) * NR); }
    S('path', { d: rumos }, gira, 'lv-rumos');
    var disco = S('circle', { r: r1(NR * 0.16) }, gN, 'lv-disco');
    var liN = H('li', 'lv-ponta', null, null);
    liN.style.left = TX + 'px'; liN.style.top = (NY - 10) + 'px'; liN.style.width = (g.W - TX - 8) + 'px';
    H('span', 'lv-verbo', 'Zero', liN); H('span', 'lv-ponta__txt', 'lendo o seu caso', liN);

    /* as estações: o fundo do chip (tapa o trilho), o chip fantasma, o chip aceso (desenhado), o ícone, o texto */
    function estacao(k) {
      var e = g.estacoes[k], gg = S('g', { transform: 'translate(' + (RX - C / 2) + ' ' + (e.cy - C / 2) + ')' }, gNos, 'lv-est');
      S('path', { d: chipD(0, 0, C) }, gg, 'lv-chip-fundo');
      var fan = S('path', { d: chipD(0, 0, C) }, gg, 'lv-chip-fan');
      var chip = S('path', { d: chipD(0, 0, C), pathLength: 1 }, gg, 'lv-chip');
      var ic = S('g', { transform: 'translate(6 6) scale(.6)' }, gg, 'lv-icone');
      var li = H('li', 'lv-txt is-fantasma', null, lista);
      li.style.left = e.texto.x + 'px'; li.style.top = e.texto.y + 'px'; li.style.width = e.texto.w + 'px'; li.style.height = e.texto.h + 'px';
      var fanT = H('span', 'lv-fan', null, li);
      fanT.setAttribute('aria-label', 'Ainda a entender'); H('span', 'lv-fan__tag', dois(k + 1), fanT); var fanTxt = H('span', 'lv-fan__txt', '', fanT);
      var real = H('span', 'lv-real', null, li), hd = H('span', 'lv-hd', null, real);
      H('span', 'lv-n', dois(k + 1), hd); var verbo = H('span', 'lv-verbo', '', hd); var tit = H('span', 'lv-tit', '', real);
      var varre = H('span', 'lv-varre', null, li);
      return { k: k, g: gg, fanT: fanT, fan: fan, chip: chip, ic: ic, li: li, fanTxt: fanTxt, verbo: verbo, tit: tit, varre: varre, est: null, cx: RX, cy: e.cy };
    }
    var est = [0, 1, 2, 3, 4].map(estacao);

    var gL = S('g', { transform: 'translate(' + RX + ' ' + LEDY + ')' }, gNos, 'lv-led');
    var ondasL = [S('circle', { r: r1(LR * 0.63) }, gL, 'lv-onda'), S('circle', { r: r1(LR * 0.63) }, gL, 'lv-onda')];
    S('circle', { r: r1(LR * 0.63) }, gL, 'lv-led-fundo');
    S('circle', { r: r1(LR * 0.63) }, gL, 'lv-led-fan');
    var aroL = S('circle', { r: r1(LR * 0.63), pathLength: 1 }, gL, 'lv-aro');
    var ticksL = '';
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function (v) { ticksL += 'M' + r1(v[0] * LR * 0.78) + ' ' + r1(v[1] * LR * 0.78) + 'L' + r1(v[0] * LR) + ' ' + r1(v[1] * LR); });
    var tL = S('path', { d: ticksL }, gL, 'lv-rumos lv-rumos--led');
    var discoL = S('circle', { r: r1(LR * 0.3) }, gL, 'lv-disco');
    var liL = H('li', 'lv-txt lv-txt--led is-fantasma', null, lista);
    liL.style.left = g.led.texto.x + 'px'; liL.style.top = g.led.texto.y + 'px'; liL.style.width = g.led.texto.w + 'px'; liL.style.height = g.led.texto.h + 'px';
    var fanL = H('span', 'lv-fan', null, liL); H('span', 'lv-fan__tag', 'Objetivo', fanL); H('span', 'lv-fan__txt', semViuva(Cresce.FALTA.objetivo), fanL);
    var realL = H('span', 'lv-real', null, liL), hdL = H('span', 'lv-hd', null, realL);
    H('span', 'lv-verbo', 'Objetivo', hdL); var titL = H('span', 'lv-tit', '', realL);
    var varreL = H('span', 'lv-varre', null, liL);
    var led = { g: gL, fanT: fanL, li: liL, tit: titL, varre: varreL, cy: LEDY, conhecido: false, objetivo: null };
    lista.insertBefore(liN, lista.firstChild);

    var cabeca = S('path', { d: 'M0 0', pathLength: 1 }, gLuz, 'lv-cab');
    var ponto = S('circle', { r: 2.4 }, gLuz, 'lv-ponto');
    raiz.appendChild(card);

    inst = {
      card: card, quadro: quadro, svg: svg, g: g, est: est, led: led, nucleo: { g: gN, li: liN, cx: RX, cy: NY }, estadoTopo: estadoTopo, topo: topo,
      leitura: leitura, leTag: leTag, leTxt: leTxt, status: status, trilhoFan: trilhoFan, trechos: trechos,
      semeado: false, esboco: null, fila: [], ocupado: false, repouso: [], visivel: !window.IntersectionObserver, parado: false, rel: Relogio.criar()
    };
    est.forEach(function (x, k) { x.fanTxt.textContent = semViuva(Cresce.FALTA[Cresce.LUGARES[k]]); });
    card.classList.add('is-dormente');

    /* ---------- o relógio: timers e animações andam juntos e PAUSAM juntos (aba escondida, planta fora da tela): js/planta-relogio.js ---------- */
    var depois = function (ms, fn) { inst.rel.depois(ms, fn); };
    var anim = function (el, kf, o) { return inst.rel.anim(el, kf, o); };
    function tracar(el, atraso, dura) { return anim(el, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: dura, delay: atraso, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'backwards' }); }
    function varrer(el, atraso) {
      return anim(el, [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(101%)', opacity: 1 }], { duration: T.texto, delay: atraso, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' });
    }
    function ondas(lista, atraso) {
      lista.forEach(function (o, k) { anim(o, [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.5)', opacity: 0 }], { duration: 1000, delay: atraso + k * 280, easing: 'ease-out', fill: 'none' }); });
    }
    /* a luz: um traço curto (2 px) que desce do núcleo até o chip, sobre o trilho */
    function luz(ateY, atraso) {
      var len = Math.max(1, ateY - NY), f = r1(Math.min(0.5, 18 / len) * 1000) / 1000;
      cabeca.setAttribute('d', 'M' + RX + ' ' + NY + 'V' + r1(ateY));
      cabeca.setAttribute('stroke-dasharray', f + ' 2');
      anim(cabeca, [{ strokeDashoffset: f, opacity: 0, offset: 0 }, { strokeDashoffset: f, opacity: 1, offset: 0.02 }, { strokeDashoffset: f - 1, opacity: 1, offset: 0.97 }, { strokeDashoffset: f - 1, opacity: 0, offset: 1 }],
        { duration: T.luz, delay: atraso, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
    }
    var trechoY = function (t) { return [t === 0 ? NY + NR * 0.76 : cy(t - 1) + C / 2, t < 5 ? cy(t) - C / 2 : LEDY - LR * 0.63]; };
    function acenderTrilhoAte(k, animarTrilho) {
      var animar = animarTrilho !== false && !reduzido(), ate = trechoY(Math.min(k, 5))[1], t;
      for (t = 0; t <= Math.min(k, 5); t++) {
        if (inst.trechos[t].classList.contains('is-aceso')) continue;
        inst.trechos[t].classList.add('is-aceso');
        if (!animar) continue;
        var y = trechoY(t), pa = (y[0] - NY) / Math.max(1, ate - NY), pb = (y[1] - NY) / Math.max(1, ate - NY);
        anim(inst.trechos[t], [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: Math.max(40, T.luz * (pb - pa)), delay: T.luz * pa, easing: 'linear', fill: 'backwards' });
      }
    }
    function ler(tag, txt, animar) {
      inst.leTag.textContent = tag; inst.leTxt.textContent = semViuva(txt);
      if (animar) varrer(leVarre, 0);
    }

    /* ---------- o repouso: a cada 6 s um ponto desce o trilho até a última estação acesa e o núcleo solta uma onda; 60 s, e volta com um toque ---------- */
    function repouso() {
      inst.repouso.forEach(function (a) { try { a.cancel(); } catch (e) { aviso(e); } });
      inst.repouso = [];
      if (reduzido() || !inst.semeado || inst.parado) return;
      var fundo = NY, k;
      for (k = 0; k < 5; k++) if (est[k].est) fundo = est[k].cy;
      if (led.conhecido) fundo = LEDY;
      var tr = function (yy) { return 'translate(' + RX + 'px,' + r1(yy) + 'px)'; }, fim = Math.min(0.32, 0.06 + (fundo - NY) / 1400);
      var a = anim(ponto, [{ offset: 0, opacity: 0, transform: tr(NY) }, { offset: 0.01, opacity: 1, transform: tr(NY) }, { offset: fim, opacity: 1, transform: tr(fundo) }, { offset: Math.min(1, fim + 0.02), opacity: 0, transform: tr(fundo) }, { offset: 1, opacity: 0, transform: tr(fundo) }],
        { duration: T.repouso, iterations: 10, easing: 'linear' });
      var b = anim(ondasN[0], [{ offset: 0, transform: 'scale(1)', opacity: 0.7 }, { offset: 0.16, transform: 'scale(1.9)', opacity: 0 }, { offset: 1, transform: 'scale(1.9)', opacity: 0 }], { duration: T.repouso, iterations: 10, easing: 'ease-out' });
      [a, b].forEach(function (x) { if (x) inst.repouso.push(x); });
    }

    /* ---------- a semente: o núcleo acende e o primeiro traço sai ---------- */
    function semear(animar) {
      inst.semeado = true;
      card.classList.remove('is-dormente'); card.classList.add('is-semeado');
      inst.estadoTopo.textContent = ' · em construção';
      if (!animar) return 0;
      tracar(aroN, 0, 600);
      anim(gira, [{ opacity: 0, transform: 'rotate(-30deg)' }, { opacity: 1, transform: 'rotate(0deg)' }], { duration: 700, delay: 150, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      anim(disco, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 420, delay: 380, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' });
      ondas(ondasN, 420);
      anim(liN, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300, delay: 300, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      anim(inst.trilhoFan, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 500, fill: 'backwards' });
      est.concat([led]).forEach(function (x, k) { anim(x.g, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 620 + k * 70, fill: 'backwards' }); anim(x.li, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 660 + k * 70, fill: 'backwards' }); });
      depois(420, function () { som('semente'); });
      return 950;
    }

    /* ---------- uma estação: a luz desce, o chip e o ícone se desenham, o texto é impresso ---------- */
    function acender(x) {
      x.g.classList.add('is-aceso'); x.li.classList.remove('is-fantasma'); x.li.classList.add('is-aceso');
      x.fanT.setAttribute('aria-hidden', 'true');   /* o leitor de tela não lê o fantasma de uma etapa já entendida */
    }
    function pintarEstacao(x, e) {
      x.est = e;
      while (x.ic.firstChild) x.ic.removeChild(x.ic.firstChild);
      (Pecas.desenhar(e.tipo, e.n) || []).forEach(function (t) { S('path', { d: t.d, pathLength: 1 }, x.ic, t.ac ? 'lv-ac' : ''); });
      x.verbo.textContent = e.verbo; x.tit.textContent = semViuva(e.titulo);
      x.li.classList.toggle('is-provisorio', !!e.provisorio);   /* a semente ainda é pergunta ("de onde o seu cliente vem"): o título fica apagado até a pessoa contar */
      acender(x);
    }
    function imprimir(item, animar) {
      var refeita = item.tipo === 'refeita', alvo, tag, frase;
      if (item.lugar === 'objetivo') {
        var o = inst.esboco.objetivo;
        led.conhecido = true; led.objetivo = o; led.tit.textContent = semViuva(o.titulo);
        acender(led);
        alvo = led; tag = 'Objetivo'; frase = o.frase;
        acenderTrilhoAte(5, animar);
      } else {
        var k = Cresce.LUGARES.indexOf(item.lugar), e = inst.esboco.estacoes[k];
        alvo = est[k]; pintarEstacao(alvo, e);
        tag = dois(k + 1) + ' · ' + e.verbo; frase = e.frase;
        acenderTrilhoAte(k, animar);
      }
      inst.status.textContent = (refeita ? 'A planta mudou: ' : 'Nova etapa na planta: ') + (alvo.est ? alvo.est.titulo : led.objetivo.titulo) + '.';
      if (!animar) { ler(tag, frase, false); return 0; }
      luz(alvo.cy - (alvo === led ? LR * 0.63 : C / 2), 0);
      var chega = T.luz;
      if (alvo === led) {
        tracar(aroL, chega - 40, T.chip);
        anim(tL, [{ opacity: 0 }, { opacity: 1 }], { duration: T.chip, delay: chega, fill: 'backwards' });
        anim(discoL, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 360, delay: chega + 80, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' });
        ondas([ondasL[0]], chega);
      } else {
        if (!refeita) tracar(alvo.chip, chega - 40, T.chip);
        Array.prototype.forEach.call(alvo.ic.childNodes, function (p, q) { tracar(p, chega + 40 + q * 45, T.chip); });
      }
      varrer(alvo.varre, chega + T.chip - 60);
      depois(chega, function () { som(refeita ? 'refaz' : 'estacao'); ler(tag, frase, true); });
      return chega + T.chip + T.texto;
    }

    /* a estação que vai nascer está à vista, acima da barra de entrada e, com opcoes.rolagem (a caixa da conversa no celular), dentro da caixa? */
    function alvoVisivel(item) {
      if (!item || item.lugar === '__semente') return true;
      var q = quadro.getBoundingClientRect(), k = Cresce.LUGARES.indexOf(item.lugar), y = q.top + (k >= 0 ? cy(k) : LEDY);
      var topo = 0, baixo = window.innerHeight - (typeof op.margemBaixo === 'function' ? op.margemBaixo() : 0);
      if (op.rolagem) { var c = op.rolagem.getBoundingClientRect(); topo = Math.max(topo, c.top); baixo = Math.min(baixo, c.bottom); }
      return y - C / 2 >= topo && y + C / 2 <= baixo;
    }

    /* ---------- a fila: as mudanças de um turno tocam uma depois da outra, só com a estação na tela (a planta nunca rola a página) ---------- */
    function andar() {
      if (inst.ocupado || inst.parado) return;
      var animar = !reduzido(), it, houve = '';
      while (!animar && inst.fila.length) {   /* sem movimento: tudo de uma vez, na mesma tarefa, com UM som só */
        it = inst.fila.shift();
        if (it.lugar === '__semente') semear(false); else { imprimir(it, false); houve = houve === 'estacao' || it.tipo === 'nova' ? 'estacao' : 'refaz'; }
      }
      if (houve) som(houve);
      if (!inst.fila.length) { repouso(); return; }
      if (!inst.visivel || document.hidden || !alvoVisivel(inst.fila[0])) return;
      var item = inst.fila.shift(), dura;
      inst.ocupado = true;
      /* uma estação que lance não pode travar a fila: segue para a próxima */
      try { dura = item.lugar === '__semente' ? semear(true) : imprimir(item, true); } catch (e) { aviso(e); dura = 0; }
      depois(dura + T.entre, function () { inst.ocupado = false; andar(); });
    }

    function crescer(esboco) {
      if (!esboco || !Array.isArray(esboco.estacoes)) return [];
      var dif = Cresce.diferenca(inst.esboco, esboco);
      inst.esboco = esboco;
      if (!inst.semeado && !inst.fila.some(function (f) { return f.lugar === '__semente'; })) inst.fila.push({ lugar: '__semente' });
      dif.forEach(function (d) { inst.fila.push(d); });
      andar();
      return dif;
    }

    /* ---------- a tela: fora da vista ou com a aba escondida, TUDO pausa (timers, traços, repouso, o giro do núcleo) e volta de onde estava ---------- */
    function aplicarVisibilidade() {
      var ver = inst.visivel && !document.hidden;
      card.classList.toggle('lv--fora', !ver);
      if (ver) { inst.rel.retomar(); andar(); } else inst.rel.pausar();
    }
    if (window.IntersectionObserver) {
      var margem = typeof op.margemBaixo === 'function' ? Math.round(op.margemBaixo()) : 0, limiares = [], q2;
      for (q2 = 0; q2 <= 20; q2++) limiares.push(q2 / 20);   /* de 5 em 5%: a fila confere a estação-alvo a cada passo da rolagem */
      inst.io = new window.IntersectionObserver(function (ents) {
        var e = ents[ents.length - 1];
        inst.visivel = !!e.isIntersecting && e.intersectionRatio > 0;
        aplicarVisibilidade();
      }, { threshold: limiares, rootMargin: '0px 0px -' + margem + 'px 0px' });
      inst.io.observe(quadro);
    }
    inst.aoVis = aplicarVisibilidade;
    document.addEventListener('visibilitychange', inst.aoVis);
    inst.aoToque = function () { if (inst.semeado && inst.ocupado === false && !inst.fila.length) repouso(); };
    card.addEventListener('pointerdown', inst.aoToque);

    function parar() {
      inst.parado = true;
      inst.rel.parar();
      inst.repouso = [];
      if (inst.io) inst.io.disconnect();
      document.removeEventListener('visibilitychange', inst.aoVis);
      card.removeEventListener('pointerdown', inst.aoToque);
      card.classList.remove('lv--fora');
    }

    /* refeito (o celular girou, a janela mudou de largura): o que já estava entendido aparece inteiro, de uma vez, sem som nem anúncio */
    if (op.inicial && Array.isArray(op.inicial.estacoes)) {
      inst.esboco = op.inicial;
      semear(false);
      Cresce.diferenca(null, op.inicial).forEach(function (d) { imprimir(d, false); });
      inst.status.textContent = '';
    }

    inst.parar = parar; inst.ocioso = function () { return !inst.ocupado && !inst.fila.length; };
    return { crescer: crescer, parar: parar, interno: inst, ocioso: inst.ocioso };
  }

  return { criar: criar, geometria: geometria, ALTURA: ALTURA, semViuva: semViuva };
});
