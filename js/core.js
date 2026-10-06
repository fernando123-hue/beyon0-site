/* ==========================================================================
   NÚCLEO (V3) — um rAF só, estado mínimo, eventos internos e o interruptor
   de movimento.

   Na V3 não há canvas: o laço existe para o medidor de fps da prova (a
   única coisa que roda por frame) e para a fase seguinte (AI Core em fundo
   claro), que vai se registrar aqui com `B.add`. O que a V2 tinha de
   orçamento, regimes, ponteiro e perfil está no histórico (commit 051b2a8).

   Exposto em window.BEYON porque os arquivos são scripts clássicos (o
   projeto não tem build). A superfície é pequena de propósito.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mqReduce.matches || html.classList.contains('menos-movimento');

  /* ---- estado compartilhado: subsistemas LEEM, o núcleo escreve ---- */
  var S = { t: 0, dt: 16, now: 0, fps: 60, sx: window.scrollX, sy: window.scrollY, rolouEm: 0 };
  /* a rolagem em cache: ler window.scrollX/scrollY dentro do quadro, depois
     que o GSAP escreveu estilo, obriga o navegador a refazer o layout no
     meio do quadro (medido: ~40% do quadro rolando). Quem roda no laço lê
     daqui; o evento só anota. */
  function anotarRolagem() { S.sx = window.scrollX; S.sy = window.scrollY; S.rolouEm = performance.now(); }
  window.addEventListener('scroll', anotarRolagem, { passive: true });
  window.addEventListener('resize', anotarRolagem, { passive: true });

  /* ---- subsistemas ---- */
  var subs = [];
  function add(name, fn) { subs.push({ n: name, f: fn, erros: 0 }); }
  /* sair do laço de dentro dele (um subsistema que desiste, falhou()) tirava o vizinho de um quadro: no meio do
     quadro só marca, e a lista é compactada no fim dele */
  var noQuadro = false, sujos = false;
  function remove(name) {
    for (var i = subs.length - 1; i >= 0; i--) {
      if (subs[i].n !== name) continue;
      if (noQuadro) { subs[i].fora = true; sujos = true; } else subs.splice(i, 1);
    }
  }

  /* ---- eventos internos ---- */
  var ouvintes = {};
  function on(ev, fn) { (ouvintes[ev] || (ouvintes[ev] = [])).push(fn); }
  function off(ev, fn) {
    var l = ouvintes[ev]; if (!l) return;
    var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
  function emit(ev, dados) {
    var l = ouvintes[ev]; if (!l) return;
    for (var i = 0; i < l.length; i++) l[i](dados);
  }

  /* ---- o laço ----
     S.fps é uma média móvel do intervalo real entre quadros: é o número que
     a prova mostra, então não pode mentir nem ser suavizado além da conta. */
  var antes = 0, rodando = false, lentos = 0, avisouLento = false;
  function frame(now) {
    if (document.hidden) { rodando = false; return; }
    var dt = antes ? Math.min(50, now - antes) : 16;
    antes = now;
    S.dt = dt; S.now = now; S.t++;
    S.fps += (1000 / Math.max(1, dt) - S.fps) * 0.1;
    /* a página anda devagar há 3 s (depois dos 10 s iniciais, com o reator subindo): quem puder, degrada — uma vez */
    if (!avisouLento && S.t > 600) { lentos = S.fps < 42 ? lentos + 1 : 0; if (lentos > 180) { avisouLento = true; emit('lento'); } }
    /* um subsistema que lança não derruba os outros nem o laço */
    noQuadro = true;
    for (var i = 0; i < subs.length; i++) {
      if (subs[i].fora) continue;
      try { subs[i].f(S); subs[i].erros = 0; } catch (e) { falhou(subs[i], e); }
    }
    noQuadro = false;
    if (sujos) { sujos = false; for (var j = subs.length - 1; j >= 0; j--) if (subs[j].fora) subs.splice(j, 1); }
    requestAnimationFrame(frame);
  }
  /* três falhas seguidas e o subsistema sai do laço — o resto do site segue.
     Nunca em silêncio: o console diz quem caiu e por quê */
  function falhou(sub, e) {
    sub.erros++;
    if (sub.erros >= 3) {
      remove(sub.n);
      if (window.console && console.warn) console.warn('[beyon] "' + sub.n + '" saiu do laço:', e);
    }
  }
  function iniciar() {
    if (rodando) return;
    rodando = true; antes = 0;
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) iniciar(); });

  /* ---- "menos movimento" em tempo de execução ----
     `persistir` só quando foi a pessoa, no interruptor do rodapé: se foi o
     sistema que ligou a preferência, a escolha é dele e não fica gravada. */
  function reduzir(sim, persistir) {
    /* o sistema manda: com prefers-reduced-motion ligado, "ativar" não ativa */
    reduced = window.BEYON.reduced = !!sim || mqReduce.matches;
    html.classList.toggle('menos-movimento', !!sim);
    if (persistir) {
      try { localStorage.setItem('bz-menos-movimento', sim ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    }
    emit('reduzir', reduced);
  }
  try {
    mqReduce.addEventListener('change', function (e) { if (e.matches) reduzir(true, false); });
  } catch (e) { /* navegador antigo */ }

  /* todo número que o site mostra sai daqui: pt-BR ("0,56"), sem separador
     de milhar (a contagem relê o texto e um "1.024" viraria 1,024) */
  function num(v, casas) {
    casas = casas || 0;
    try { return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false }); }
    catch (e) { return v.toFixed(casas).replace('.', ','); }
  }

  /* o RELÓGIO da respiração: segundos desde o começo da VISITA (guardado na
     sessão), igual em todas as páginas. O reator do hero, o mini AI Core e a
     rede leem daqui: respiram juntos e, ao trocar de página, continuam no
     mesmo ponto do fôlego. timeOrigin + now é monotônico dentro da página e
     comparável entre páginas */
  var agora = function () { return (performance.timeOrigin || Date.now() - performance.now()) + performance.now(); };
  var EPOCA = agora();
  try {
    var guardada = +sessionStorage.getItem('bz-epoca');
    if (guardada > 0 && guardada <= EPOCA) EPOCA = guardada; else sessionStorage.setItem('bz-epoca', String(EPOCA));
  } catch (e) { /* sem armazenamento: o relógio começa nesta página */ }
  function relogio() { return (agora() - EPOCA) / 1000; }

  /* TEXTO NO CANVAS SEM TOCAR NO ESTILO DA PÁGINA (2026-10-06). No Chrome, ctx.font =, measureText e fillText
     num canvas que está na página chamam UpdateStyleAndLayoutTree ANTES de qualquer coisa (até repetir a mesma
     fonte): se algo mudou no quadro, o estilo da página inteira é resolvido ali, no meio do laço. Medido na
     sobrecarga das estações (as letras sujam o estilo a cada quadro): 1,5 s de "fonte" + 1,3 s de "fillText" em
     13 s de perfil; rolando, o mesmo imposto cai sobre o que o GSAP escreve. Agora o texto é pintado UMA vez por
     (texto, fonte, cor, dpr) numa OFICINA fora da página (OffscreenCanvas; sem ela, um canvas solto) e, por
     quadro, só drawImage — que não resolve estilo. A opacidade vai por globalAlpha, para a cor com alfa variável
     (resp, fade) não virar um sprite por quadro. Posição arredondada ao pixel do aparelho: nítido, sem reamostrar. */
  var oficina = null, sprites = new Map(), larguras = new Map(), SPRITES_MAX = 400;
  function oficinaCtx() {
    if (!oficina) oficina = (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
    return oficina;
  }
  /* o dpr do canvas de destino (quem desenha publica ctx.__dpr ao dimensionar; sem isso, o da tela até 2):
     o sprite nasce nos pixels do aparelho desse canvas, 1:1, sem reamostrar */
  function dprDe(ctx) { return ctx.__dpr || Math.min(window.devicePixelRatio || 1, 2); }
  /* (sprites e medidas feitos com a fonte reserva, antes da JetBrains Mono chegar, não ficam guardados) */
  function limparTexto() { sprites.clear(); larguras.clear(); }
  if (document.fonts) { document.fonts.ready.then(limparTexto); document.fonts.addEventListener('loadingdone', limparTexto); }
  /* a largura de um texto na fonte f, medida uma vez por fonte e texto, na oficina */
  function largura(ctx, txt, f) {
    var k = f + '|' + txt, w = larguras.get(k);
    if (w === undefined) {
      if (larguras.size > 600) larguras.clear();
      var o = oficinaCtx(); o.font = f;
      w = o.measureText(txt).width; larguras.set(k, w);
    }
    return w;
  }
  var PX = /(\d+(?:\.\d+)?)px/, RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/;
  function sprite(txt, f, tinta, dpr) {
    var k = f + '|' + tinta + '|' + dpr + '|' + txt, s = sprites.get(k);
    if (s) return s;
    if (sprites.size >= SPRITES_MAX) sprites.delete(sprites.keys().next().value);   /* (sai o mais antigo, nunca todos de uma vez) */
    var o = oficinaCtx(); o.font = f;
    var m = o.measureText(txt), px = +(PX.exec(f) || [0, 10])[1];
    /* a caixa real do texto (com 1 px de folga) e as métricas da fonte (para as linhas de base top/middle/bottom
       baterem com as do fillText: top = y + ascent, middle = y + (ascent − descent)/2, bottom = y − descent) */
    var asc = Math.ceil(m.actualBoundingBoxAscent || px * 0.8) + 1, desc = Math.ceil(m.actualBoundingBoxDescent || px * 0.25) + 1;
    var fa = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : px * 0.95, fd = m.fontBoundingBoxDescent !== undefined ? m.fontBoundingBoxDescent : px * 0.25;
    var w = Math.ceil(m.width) + 2, h = asc + desc, W = Math.ceil(w * dpr), H = Math.ceil(h * dpr), cv;
    if (typeof OffscreenCanvas === 'function') cv = new OffscreenCanvas(W, H);
    else { cv = document.createElement('canvas'); cv.width = W; cv.height = H; }
    var c = cv.getContext('2d');
    c.scale(dpr, dpr); c.font = f; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillStyle = tinta;
    c.fillText(txt, 1, asc);
    s = { cv: cv, w: W / dpr, h: H / dpr, asc: asc, fa: fa, fd: fd, lw: m.width };   /* (w, h: o bitmap inteiro em px CSS: 1:1 no destino) */
    sprites.set(k, s);
    return s;
  }
  /* pinta txt com a fonte f e a cor ("rgba(r,g,b,a)", "rgb(...)" ou "#…") em (x, y), com o alinhamento
     ('left'|'center'|'right') e a linha de base ('alphabetic'|'top'|'middle'|'bottom') do fillText.
     Num contexto girado (translate + rotate de ±90°), arredonde o translate ao pixel do aparelho (B.pixel) */
  function texto(ctx, txt, f, cor, x, y, alinha, base) {
    if (!txt) return;
    var m = RGBA.exec(cor), tinta = m ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : cor, a = m && m[4] !== undefined ? +m[4] : 1;
    if (a <= 0.003) return;
    var dpr = dprDe(ctx), s = sprite(txt, f, tinta, dpr);
    var dx = alinha === 'center' ? -s.lw / 2 : alinha === 'right' ? -s.lw : 0;
    var linha = base === 'top' ? y + s.fa : base === 'bottom' ? y - s.fd : base === 'middle' ? y + (s.fa - s.fd) / 2 : y;
    var X = Math.round((x + dx - 1) * dpr) / dpr, Y = Math.round((linha - s.asc) * dpr) / dpr;
    var ga = ctx.globalAlpha;
    if (a < 1) ctx.globalAlpha = ga * a;
    ctx.drawImage(s.cv, X, Y, s.w, s.h);
    if (a < 1) ctx.globalAlpha = ga;
  }
  /* um texto MONO que muda a cada quadro (a coordenada do cursor): um sprite por caractere, não por texto */
  function textoMono(ctx, txt, f, cor, x, y, base) {
    var adv = largura(ctx, '0', f);
    for (var i = 0; i < txt.length; i++) if (txt[i] !== ' ') texto(ctx, txt[i], f, cor, x + i * adv, y, 'left', base);
  }
  /* uma coordenada em px CSS arredondada ao pixel do aparelho desse canvas */
  function pixel(ctx, v) { var d = dprDe(ctx); return Math.round(v * d) / d; }

  /* O OURO (js/ouro.js): B.ouro.k vai de 0 (ciano) a 1 (dourado). B.tom(c) devolve a cor "r,g,b" de um canvas
     misturada para o ouro conforme k — só para as três cores de energia (ac, ac-2, ac-3); prata, metal e
     branco voltam iguais (estrutura fria, energia quente). Uma string por cor por valor de k: nada aloca por
     chamada no mesmo quadro */
  var ouro = { k: 0, estado: 'frio' };
  /* os pares ciano→ouro vêm dos tokens (css/tokens.css): se a paleta mudar, a mistura acompanha */
  var ALVO_OURO = {}, DEGRAUS = 24;   /* (k em 24 degraus: os sprites de texto dos canvases são por cor; um por quadro era um por k) */
  (function () {
    var est = getComputedStyle(html), ler = function (n, p) { return (est.getPropertyValue(n).trim() || p).split(/\s+/).map(Number); };
    var pares = [['--ac-rgb', '73 229 221', '--ouro-rgb', '255 201 107'], ['--ac-2-rgb', '166 244 239', '--ouro-2-rgb', '255 230 179'], ['--ac-3-rgb', '28 181 185', '--ouro-3-rgb', '210 154 58']];
    for (var i = 0; i < pares.length; i++) ALVO_OURO[ler(pares[i][0], pares[i][1]).join(',')] = ler(pares[i][2], pares[i][3]);
  })();
  var tons = {}, tomK = -1;
  function tom(c) {
    var k = ouro.k;
    if (!(k > 0)) return c;
    var alvo = ALVO_OURO[c];
    if (!alvo) return c;
    k = Math.round(k * DEGRAUS) / DEGRAUS;
    if (k !== tomK) { tons = {}; tomK = k; }
    var t = tons[c];
    if (!t) {
      var de = c.split(',');
      t = tons[c] = Math.round(+de[0] + (alvo[0] - de[0]) * k) + ',' + Math.round(+de[1] + (alvo[1] - de[1]) * k) + ',' + Math.round(+de[2] + (alvo[2] - de[2]) * k);
    }
    return t;
  }

  window.BEYON = {
    S: S, largura: largura, texto: texto, textoMono: textoMono, pixel: pixel, ouro: ouro, tom: tom, add: add, remove: remove, on: on, off: off, emit: emit, iniciar: iniciar, reduzir: reduzir,
    reduced: reduced, sistemaReduz: mqReduce.matches, num: num, relogio: relogio,
    /* o fôlego: os mesmos números de SPEC.respira do reator (7 s, inspira em 42%) */
    FOLEGO: { periodo: 7, inspira: 0.42 }
  };

  /* BOOT: 'booted' só depois que TODO script `defer` rodou (DOMContentLoaded),
     porque emit não guarda histórico. */
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('booted');
    emit('booted');
  });
})();
