/* ==========================================================================
   O OURO — o estado dourado, reformulado (2026-10-06; docs/restructure/OURO-2026-10-06.md).
   Na V1 era o "Estado Singular": a cada 70–130 s a página inteira virava
   branco+ouro em quatro fases. Aqui ele volta como o que a V4 já conta: a
   luz passa e imprime. O OURO É CONQUISTADO — a energia que o reator deu
   volta a ele cheia — e, uma vez por visita, chega sozinho para quem fica.

   2ª versão (dono: "transforme a cor em um dourado incandescente; quero que o
   site demonstre essa transformação; não quero que só mude de cor do nada,
   deve ser um evento"). Cinco atos, com uma leitura mono presa à linha:
   1. CARGA (1,8 s): duas linhas vêm das bordas da tela até a origem,
      acelerando; o ciano do site esquenta até quase branco (tokens quentes,
      transição longa); o reator acelera; "CARGA 0–100%".
   2. CLARÃO: as linhas se encontram — um risco branco de três fios abre na
      horizontal a partir do reator e o núcleo estoura.
   3. IGNIÇÃO (1,6 s): as linhas saem da origem com a frente branco-
      incandescente; cada peça que ela cruza fica branca e esfria até o ouro
      (.is-brasa: os tokens dourados na própria peça + a animação do branco);
      os canvases misturam ciano→ouro→branco (B.tom, k e h); "IGNIÇÃO".
   4. REINADO (30 s): ouro incandescente — a prata e o metal ficam frios
      (estrutura fria, energia quente); nos canvases e no reator o ouro
      tremula entre o ouro e o branco, como metal em brasa; "NÚCLEO EM OURO".
   5. RESFRIAMENTO (2,2 s): as linhas voltam das bordas recolhendo o ouro
      (.is-frio na vez de cada peça); "RESFRIANDO".
   Traço nítido, nenhum desfoque. Por quadro: dois transform, três números
   (B.ouro.k ouro, .h branco, .carga) e o texto da leitura quando muda.

   Gatilhos: estação em sobrecarga por uma volta da onda (desktop); todos os
   cards de um grupo de estação cheios na pilha (celular); segurar o núcleo
   1,3 s ou o cursor parado no miolo 2,5 s (ouvido no hero: .nucleo não recebe
   eventos); sozinho, uma vez por visita, aos 42 s de atenção somados entre
   as páginas. Intervalo mínimo de 30 s entre o fim de um e o próximo. Movimento reduzido: não existe;
   ligado no meio, apaga na hora. API: B.ouro.acender(y?) / .k / .h / .carga /
   .estado; evento 'ouro' { fase, y }.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var html = document.documentElement, reduz = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (B.reduced || reduz.matches || !document.body) return;
  /* s por ato; intervalo mínimo; o sozinho (s de atenção) e o que conta como atenção; segurar; mira; a volta da
     onda numa estação em sobrecarga; quanto a leitura fica no reinado */
  var T = { carga: 1.8, ignicao: 1.6, reinado: 30, esfria: 2.2, minimo: 30, auto: 42, atencao: 15, segura: 1.3, mira: 2.5, volta: 10, leitura: 3.2 };
  var ALCANCE = 1.15;   /* telas que a linha percorre da origem (a vez de cada peça usa a mesma conta) */
  /* a vez de cada peça corre no MESMO relógio das linhas (t, no laço): por timers de parede, num aparelho lento ou
     com a aba oculta as peças acendiam antes de a linha chegar */
  var PORTADORES = '.hero__title em, .kicker b, .nav__brand b, .hero__status .dot, .btn, .servico__link, .celula__link, .servico__n, .celula__n, .laudo__n, .carga__pct, .tem-carga, .footer__motion, .prova__val, .console__v, .instrumento__val, .hero__cota-rot, .rumo-leitura, .nav__links a, .console__led, .instrumento__led';
  var FASES = ['is-ouro-carga', 'is-ouro-ignicao', 'is-ouro-esfria', 'is-ouro-linha'];
  var estado = 'frio', t = 0, origemY = 0, ultimoFim = -1e9, vezes = 0, fila = [], filaI = 0, filaFn = null, marcados = [], fimTroca = 0;
  /* (estende o B.ouro do core.js — B.tom lê k e h DESSE objeto) */
  var ouro = B.ouro || (B.ouro = { k: 0, h: 0, carga: 0, estado: 'frio' });
  ouro.acender = acender; ouro.T = T;

  function suave(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function naTela(y) { return Math.max(0, Math.min(window.innerHeight, y)); }
  /* o inverso da suave (0–1), para saber quando a linha do resfriamento chega a uma fração */
  function invSuave(v) { var lo = 0, hi = 1; for (var i = 0; i < 18; i++) { var m = (lo + hi) / 2; if (suave(m) < v) lo = m; else hi = m; } return (lo + hi) / 2; }

  /* ---------- as peças do evento ---------- */
  var linha = document.createElement('i');
  linha.className = 'ouro-linha'; linha.setAttribute('aria-hidden', 'true');
  var cima = document.createElement('b'), baixo = document.createElement('b'), clarao = document.createElement('i');
  linha.appendChild(cima); linha.appendChild(baixo); linha.appendChild(clarao);
  var leitura = document.createElement('span');
  leitura.className = 'ouro-leitura'; leitura.setAttribute('aria-hidden', 'true');
  var leituraTxt = document.createTextNode(''); leitura.appendChild(leituraTxt);
  document.body.appendChild(linha); document.body.appendChild(leitura);
  function linhas(yCima, yBaixo) {
    cima.style.transform = 'translate3d(0,' + yCima.toFixed(1) + 'px,0)';
    baixo.style.transform = 'translate3d(0,' + yBaixo.toFixed(1) + 'px,0)';
  }
  var ultimoTexto = '';
  function ler(txt) {
    if (txt === ultimoTexto) return;
    ultimoTexto = txt; leituraTxt.nodeValue = txt;
    leitura.classList.toggle('is-viva', !!txt);
  }
  /* a leitura fica abaixo do menu e acima da barra do celular, mesmo com a origem na borda da tela */
  function porLeitura(y) { leitura.style.transform = 'translate3d(0,' + Math.max(76, Math.min(window.innerHeight - 110, y - 22)).toFixed(0) + 'px,0)'; }
  function claraoEm(y) {
    var n = B.nucleo, x = n && n.visivel ? n.cx : window.innerWidth / 2;
    clarao.style.setProperty('--y', (y - 1).toFixed(0) + 'px');
    clarao.style.transformOrigin = x.toFixed(0) + 'px 50%';
    var a = clarao.classList.contains('is-a');
    clarao.classList.remove(a ? 'is-a' : 'is-b');
    clarao.classList.add(a ? 'is-b' : 'is-a');
  }

  /* ---------- a vez de cada peça ---------- */
  /* lê todos os retângulos de uma vez e monta a fila por instante; `vez(f)` dá o instante (s, no relógio do
     evento) para a fração f do alcance; o laço aplica `aplicar` a quem já chegou a vez (avancar) */
  function porVez(vez, aplicar) {
    var els = document.querySelectorAll(PORTADORES), R = (window.innerHeight || 1) * ALCANCE, i;
    fila = [];
    for (i = 0; i < els.length; i++) { var r = els[i].getBoundingClientRect(); fila.push({ t: vez(Math.abs(r.top + r.height / 2 - origemY) / R), el: els[i] }); }
    fila.sort(function (a, b) { return a.t - b.t; });
    filaI = 0; filaFn = aplicar;
  }
  function avancar(ate) { while (filaI < fila.length && fila[filaI].t <= ate) filaFn(fila[filaI++].el); }
  function cancelar() { fila = []; filaI = 0; filaFn = null; }
  function brasa(el) { el.classList.remove('is-frio'); el.classList.add('is-brasa'); marcados.push(el); }
  function frio(el) { if (el.classList.contains('is-brasa')) { el.classList.remove('is-brasa'); el.classList.add('is-frio'); } }
  function limparPecas() { for (var i = 0; i < marcados.length; i++) marcados[i].classList.remove('is-brasa', 'is-frio'); marcados = []; }
  /* a troca na raiz: os que não são portadores transitam numa janela de especificidade zero (css/tokens.css) */
  function troca() { clearTimeout(fimTroca); html.classList.add('is-ouro-fim'); fimTroca = setTimeout(function () { html.classList.remove('is-ouro-fim'); }, 900); }

  /* ---------- os atos ---------- */
  function origemPadrao() {
    var n = B.nucleo;
    if (n && n.visivel && n.cy > 0 && n.cy < window.innerHeight) return n.cy;
    return window.innerHeight / 2;
  }
  function acender(origem) {
    if (estado !== 'frio' || B.reduced || document.hidden) return false;
    if (vezes > 0 && performance.now() - ultimoFim < T.minimo * 1000) return false;
    origemY = naTela(typeof origem === 'number' ? origem : origemPadrao());
    estado = ouro.estado = 'carga'; t = 0; vezes++;
    html.classList.add('is-ouro-carga', 'is-ouro-linha');
    linhas(0, window.innerHeight);
    porLeitura(origemY);
    B.emit('ouro', { fase: 'carga', y: origemY });
    return true;
  }
  function ignicao() {
    estado = ouro.estado = 'ignicao'; t = 0;
    html.classList.add('is-ouro-ignicao', 'is-ouro-varre');
    claraoEm(origemY);
    B.emit('campo:chegou', 5);   /* (o núcleo do reator estoura: o mesmo estouro da energia que chega a ele) */
    /* a linha anda e = 1 − (1 − q)³ (sai rápida da origem): a peça a f do alcance é cruzada em q = 1 − (1 − f)^⅓ */
    porVez(function (f) { return f >= 1 ? T.ignicao : T.ignicao * (1 - Math.pow(1 - f, 1 / 3)); }, brasa);
    ler('IGNIÇÃO');
    B.emit('ouro', { fase: 'ignicao', y: origemY });
  }
  function reinado() {
    avancar(Infinity);   /* (quem ficou para trás na fila da ignição) */
    estado = ouro.estado = 'reinado'; t = 0;
    html.classList.add('is-ouro');
    troca();
    html.classList.remove('is-ouro-carga', 'is-ouro-ignicao', 'is-ouro-linha', 'is-ouro-varre');
    linhas(-9999, -9999);
    ler('NÚCLEO EM OURO');
    B.emit('ouro', { fase: 'reinado', y: origemY });
  }
  function esfriar() {
    estado = ouro.estado = 'esfria'; t = 0;
    html.classList.add('is-ouro-esfria', 'is-ouro-linha', 'is-ouro-varre');
    /* as linhas voltam das bordas: a peça a f do alcance é recolhida quando 1 − suave(r) = f */
    porVez(function (f) { return f >= 1 ? 0 : T.esfria * invSuave(1 - f); }, frio);
    porLeitura(origemY);
    ler('RESFRIANDO');
    B.emit('ouro', { fase: 'esfria', y: origemY });
  }
  function apagar() {
    if (filaFn) avancar(Infinity);
    cancelar();
    html.classList.remove('is-ouro', 'is-ouro-varre');
    for (var i = 0; i < FASES.length; i++) html.classList.remove(FASES[i]);
    troca();
    limparPecas();
    estado = ouro.estado = 'frio'; ouro.k = 0; ouro.h = 0; ouro.carga = 0; ultimoFim = performance.now();
    linhas(-9999, -9999);
    ler('');
    B.emit('ouro', { fase: 'fim', y: origemY });
  }
  B.add('ouro', function (S) {
    if (estado === 'frio') return;
    var dt = Math.min(0.05, S.dt / 1000), H = window.innerHeight, R = H * ALCANCE, e;
    t += dt;
    if (estado === 'carga') {
      var p = limitar(t / T.carga);
      e = p * p * p;   /* (acelera até se encontrarem) */
      linhas(origemY * e, H - (H - origemY) * e);
      ouro.carga = p; ouro.h = 0.55 * p * p; ouro.k = 0;
      var pct = Math.round(p * 100);
      ler('CARGA ' + (pct < 10 ? '0' + pct : pct) + '%');
      if (p >= 1) ignicao();
    } else if (estado === 'ignicao') {
      var q = limitar(t / T.ignicao);
      e = 1 - Math.pow(1 - q, 3);
      linhas(origemY - e * R, origemY + e * R);
      ouro.k = suave(q); ouro.h = 1 - 0.88 * suave(q); ouro.carga = 1 - q;
      avancar(t);
      if (q >= 1) reinado();
    } else if (estado === 'reinado') {
      /* o ouro tremula como metal em brasa: entre o ouro e um pouco de branco, em duas ondas desencontradas */
      ouro.k = 1; ouro.carga = 0;
      ouro.h = 0.1 + 0.06 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 5.1 + 1.3);
      if (t >= T.leitura && ultimoTexto) ler('');
      if (t >= T.reinado) esfriar();
    } else if (estado === 'esfria') {
      var r = limitar(t / T.esfria), s = suave(r), dist = (1 - s) * R;
      linhas(origemY - dist, origemY + dist);
      ouro.k = 1 - s; ouro.h = 0; ouro.carga = 0;
      avancar(t);
      if (r >= 1) apagar();
    }
  });
  /* menos movimento no meio: o ouro termina na hora */
  B.on('reduzir', function (sim) { if (sim && estado !== 'frio') apagar(); });

  /* ---------- gatilhos ---------- */
  /* 1. a estação em sobrecarga por uma volta inteira da onda: o ouro nasce nela (se ela estiver na tela) */
  var voltas = [];
  var deAnuncio = function () { return html.classList.contains('via-anuncio'); };
  B.on('estacao:sobrecarga', function (st) {
    var tm = setTimeout(function () {
      var sy = st.yd - window.scrollY;
      if (document.hidden || B.reduced || sy < -40 || sy > window.innerHeight + 40) return;
      acender(sy);
    }, T.volta * 1000);
    voltas.push({ st: st, tm: tm });
  });
  B.on('estacao:solta', function (st) {
    for (var i = voltas.length - 1; i >= 0; i--) if (voltas[i].st === st) { clearTimeout(voltas[i].tm); voltas.splice(i, 1); }
  });
  /* 2. celular: todos os cards de um grupo de estação cheios na pilha */
  var estreito = window.matchMedia('(max-width: 720px)');
  B.on('carga:cheio', function (card) {
    if (!estreito.matches || deAnuncio()) return;
    var g = card.closest('.tem-estacao');
    if (!g) return;
    var cards = g.querySelectorAll('.tem-carga');
    if (!cards.length) return;
    for (var i = 0; i < cards.length; i++) if (!cards[i].classList.contains('is-carregado')) return;
    var r = g.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;   /* (rolou direto para longe: o grupo encheu fora da vista, não houve conquista) */
    acender(r.top + r.height / 2);
  });
  /* 3. o reator: segurar o núcleo, ou o cursor parado no miolo. Ouvido no HERO: .nucleo não recebe eventos */
  var caixaNucleo = document.querySelector('.nucleo'), hero = caixaNucleo && caixaNucleo.closest('.hero');
  if (caixaNucleo && hero) {
    var segurando = 0, x0 = 0, y0 = 0, mira = 0;
    var noMiolo = function (x, y, folga) { var n = B.nucleo; return !!(n && n.visivel && Math.hypot(x - n.cx, y - n.cy) <= n.r * folga); };
    var soltar = function () { clearTimeout(segurando); segurando = 0; };
    hero.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || !noMiolo(e.clientX, e.clientY, 0.9)) return;
      x0 = e.clientX; y0 = e.clientY; soltar();
      segurando = setTimeout(function () { segurando = 0; var n = B.nucleo; acender(n ? n.cy : undefined); }, T.segura * 1000);
    }, { passive: true });
    hero.addEventListener('pointermove', function (e) {
      if (segurando && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) soltar();   /* (arrastou: era rolagem, não um segurar) */
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function (ev) { hero.addEventListener(ev, soltar, { passive: true }); });
    window.addEventListener('scroll', soltar, { passive: true });
    /* o cursor PARADO no miolo: só com mouse; mexer (> 6 px) ou rolar zera a conta */
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      var pm = { x: -1e4, y: -1e4 }, rolou = window.scrollY;
      document.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        if (Math.hypot(e.clientX - pm.x, e.clientY - pm.y) > 6) mira = 0;
        pm.x = e.clientX; pm.y = e.clientY;
      }, { passive: true });
      B.add('ouro-mira', function (S) {
        if (estado !== 'frio') { mira = 0; return; }
        if (window.scrollY !== rolou) { rolou = window.scrollY; mira = 0; return; }
        if (noMiolo(pm.x, pm.y, 0.45)) { mira += S.dt / 1000; if (mira >= T.mira) { mira = 0; acender(B.nucleo.cy); } }
        else mira = 0;
      });
    }
  }
  /* 4. sozinho, uma vez por visita: aos T.auto s de atenção (página visível e alguém mexendo), somados entre as
     páginas da visita */
  var jaVeio = false, atencao = 0;
  try { jaVeio = sessionStorage.getItem('bz-ouro') === '1'; atencao = +sessionStorage.getItem('bz-atencao') || 0; } catch (e) { /* sem armazenamento */ }
  if (!jaVeio && !deAnuncio()) {
    var ultimoGesto = performance.now();
    var gesto = function () { ultimoGesto = performance.now(); };
    var GESTOS = ['pointermove', 'scroll', 'touchstart', 'keydown', 'wheel'];
    GESTOS.forEach(function (ev) { window.addEventListener(ev, gesto, { passive: true }); });
    var relogioAuto = setInterval(function () {
      if (document.hidden || performance.now() - ultimoGesto > T.atencao * 1000) return;
      atencao += 1;
      try { sessionStorage.setItem('bz-atencao', String(atencao)); } catch (e) { /* sem armazenamento */ }
      if (atencao < T.auto || estado !== 'frio') return;
      if (!acender(origemPadrao())) return;
      clearInterval(relogioAuto);
      GESTOS.forEach(function (ev) { window.removeEventListener(ev, gesto); });
      try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) { /* sem armazenamento */ }
    }, 1000);
  }
})();
