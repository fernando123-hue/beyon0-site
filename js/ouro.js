/* ==========================================================================
   O OURO — o estado dourado, reformulado (2026-10-06; docs/restructure/OURO-2026-10-06.md).
   Na V1 era o "Estado Singular": a cada 70–130 s a página inteira virava
   branco+ouro em quatro fases (carga, ignição, reinado, resfriamento). Aqui
   ele volta como o que a V4 já conta: a luz passa e imprime. O OURO É
   CONQUISTADO — a energia que o reator deu volta a ele cheia — e, uma vez
   por visita, chega sozinho para quem fica.

   Como acontece. IGNIÇÃO: uma linha de 1 px nasce onde o ouro foi conquistado
   e corre para cima e para baixo; cada coisa que ela cruza assenta em
   dourado (os tokens trocam de uma vez e cada portador transita na sua vez,
   pelo atraso que a linha leva até ele; os canvases misturam ciano→ouro por
   B.tom). REINADO (12 s): o site inteiro em dourado tecnológico — a prata e o
   metal ficam frios (estrutura fria, energia quente); o reator gira mais e
   clareia; as estações turbinam. RESFRIAMENTO: a linha volta ao ponto de
   origem recolhendo o ouro. Traço nítido, sem desfoque, nada por quadro além
   de transform/opacity e um número (B.ouro.k).

   Gatilhos (o que conquista):
   - desktop: uma estação em sobrecarga por uma volta inteira da onda (o
     mini encaixado ~10 s) transborda — o ouro nasce nela;
   - celular: todos os cards de um grupo de estação cheios na pilha;
   - o reator: segurar o núcleo (1,3 s, dedo ou mouse) ou deixar o cursor
     parado no miolo (2,5 s) — ouvido no hero, porque .nucleo não recebe
     eventos (pointer-events: none);
   - sozinho: uma vez por visita, aos ~42 s de atenção (página visível e
     alguém mexendo, somados entre as páginas), para quem nunca encontraria.
   Depois, só conquistado de novo, com 60 s de intervalo. Movimento reduzido
   no carregamento: o módulo não existe (decisão: o ouro é movimento); ligado
   no meio, apaga na hora. API: B.ouro.acender(y?) / B.ouro.k / B.ouro.estado;
   evento 'ouro' { fase: 'ignicao' | 'reinado' | 'esfria' | 'fim', y }.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var html = document.documentElement, reduz = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (B.reduced || reduz.matches || !document.body) return;
  /* s: ignição (a linha cruza ALCANCE telas), reinado, resfriamento; intervalo mínimo entre dois; o sozinho (s de
     atenção) e o que conta como atenção (s desde o último gesto); segurar o núcleo; cursor parado no miolo;
     a volta da onda numa estação em sobrecarga */
  var T = { ignicao: 1.4, reinado: 12, esfria: 1.6, minimo: 60, auto: 42, atencao: 15, segura: 1.3, mira: 2.5, volta: 10 };
  var ALCANCE = 1.15;   /* telas que a linha percorre em T.ignicao (os atrasos dos portadores usam a mesma conta) */
  /* quem transita na vez da linha (texto e bordas que carregam o ciano; o resto troca com os tokens e os
     canvases misturam por quadro) */
  var PORTADORES = '.hero__title em, .kicker b, .nav__brand b, .hero__status .dot, .btn, .servico__link, .celula__link, .servico__n, .celula__n, .laudo__n, .carga__pct, .tem-carga, .footer__motion, .prova__val, .console__v, .instrumento__val, .hero__cota-rot, .rumo-leitura, .nav__links a';
  var estado = 'frio', t = 0, origemY = 0, ultimoFim = -1e9, vezes = 0, limpar = 0, atrasados = null;
  /* (estende o B.ouro do core.js — B.tom lê o k DESSE objeto; trocá-lo por outro deixava os canvases ciano) */
  var ouro = B.ouro || (B.ouro = { k: 0, estado: 'frio' });
  ouro.acender = acender; ouro.T = T;

  function suave(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function naTela(y) { return Math.max(0, Math.min(window.innerHeight, y)); }

  /* a linha: duas (uma sobe, outra desce), 1 px, com um eco a 7 px (css/tokens.css) */
  var linha = document.createElement('i');
  linha.className = 'ouro-linha'; linha.setAttribute('aria-hidden', 'true');
  var cima = document.createElement('b'), baixo = document.createElement('b');
  linha.appendChild(cima); linha.appendChild(baixo);
  document.body.appendChild(linha);
  function porLinha(y) { cima.style.transform = 'translate3d(0,' + (origemY - y).toFixed(1) + 'px,0)'; baixo.style.transform = 'translate3d(0,' + (origemY + y).toFixed(1) + 'px,0)'; }

  /* a vez de cada portador: quanto a linha leva da origem até ele (ALCANCE telas em `dura` s); invertida ao
     esfriar. Lê todos os retângulos primeiro e só então escreve (ler e escrever intercalado força estilo) */
  function limparAtrasos() {
    clearTimeout(limpar); limpar = 0;
    if (atrasados) for (var j = 0; j < atrasados.length; j++) atrasados[j].style.transitionDelay = '';
    atrasados = null;
    html.classList.remove('is-ouro-varre');
  }
  function atrasos(dura, inverter) {
    limparAtrasos();
    var els = document.querySelectorAll(PORTADORES), H = window.innerHeight || 1, ds = [], i;
    for (i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      ds.push(r.bottom < -H || r.top > 2 * H ? -1 : limitar(Math.abs(r.top + r.height / 2 - origemY) / (H * ALCANCE)) * dura);
    }
    for (i = 0; i < els.length; i++) els[i].style.transitionDelay = ds[i] < 0 ? '' : (inverter ? dura - ds[i] : ds[i]).toFixed(2) + 's';
    atrasados = els;
    html.classList.add('is-ouro-varre');
    limpar = setTimeout(limparAtrasos, (dura + 0.7) * 1000);
  }
  function origemPadrao() {
    var n = B.nucleo;
    if (n && n.visivel && n.cy > 0 && n.cy < window.innerHeight) return n.cy;
    return 0;
  }
  function acender(origem) {
    if (estado !== 'frio' || B.reduced || document.hidden) return false;
    var agora = performance.now();
    if (vezes > 0 && agora - ultimoFim < T.minimo * 1000) return false;
    origemY = naTela(typeof origem === 'number' ? origem : origemPadrao());
    estado = ouro.estado = 'ignicao'; t = 0; vezes++;
    atrasos(T.ignicao, false);
    html.classList.add('is-ouro');
    porLinha(0);
    B.emit('ouro', { fase: 'ignicao', y: origemY });
    return true;
  }
  function esfriar() {
    estado = ouro.estado = 'esfria'; t = 0;
    atrasos(T.esfria, true);
    html.classList.remove('is-ouro');
    B.emit('ouro', { fase: 'esfria', y: origemY });
  }
  function apagar() {
    estado = ouro.estado = 'frio'; ouro.k = 0; ultimoFim = performance.now();
    porLinha(-9999);
    B.emit('ouro', { fase: 'fim', y: origemY });
  }
  B.add('ouro', function (S) {
    if (estado === 'frio') return;
    var dt = Math.min(0.05, S.dt / 1000), H = window.innerHeight;
    t += dt;
    if (estado === 'ignicao') {
      var p = t / T.ignicao;
      ouro.k = suave(p);
      porLinha(Math.min(1, p) * H * ALCANCE);
      if (p >= 1) { estado = ouro.estado = 'reinado'; t = 0; porLinha(-9999); B.emit('ouro', { fase: 'reinado', y: origemY }); }
    } else if (estado === 'reinado') {
      ouro.k = 1;
      if (t >= T.reinado) esfriar();
    } else if (estado === 'esfria') {
      var q = t / T.esfria;
      ouro.k = 1 - suave(q);
      porLinha((1 - Math.min(1, q)) * H * ALCANCE);
      if (q >= 1) apagar();
    }
  });
  /* menos movimento no meio: o ouro termina na hora (sem a linha, sem atraso preso em ninguém) */
  B.on('reduzir', function (sim) {
    if (!sim || estado === 'frio') return;
    limparAtrasos(); html.classList.remove('is-ouro'); apagar();
  });

  /* ---------- gatilhos ---------- */
  /* 1. a estação em sobrecarga por uma volta inteira da onda: o ouro nasce nela (se ela estiver na tela) */
  var voltas = [];
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
    if (!estreito.matches) return;
    var g = card.closest('.tem-estacao');
    if (!g) return;
    var cards = g.querySelectorAll('.tem-carga');
    if (!cards.length) return;
    for (var i = 0; i < cards.length; i++) if (!cards[i].classList.contains('is-carregado')) return;
    var r = g.getBoundingClientRect();
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
  /* 4. sozinho, uma vez por visita: aos T.auto s de atenção (página visível e alguém mexendo), somados
     entre as páginas da visita */
  var jaVeio = false, atencao = 0;
  try { jaVeio = sessionStorage.getItem('bz-ouro') === '1'; atencao = +sessionStorage.getItem('bz-atencao') || 0; } catch (e) { /* sem armazenamento */ }
  if (!jaVeio) {
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
