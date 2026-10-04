/* ==========================================================================
   A CARGA dos cards (2026-10-04). Uma peça só, usada de dois jeitos:
   - CELULAR (a pilha, js/anima.js): a rolagem comanda — cada card carrega
     enquanto é revelado no monte que se abre;
   - DESKTOP com mouse (este arquivo): o CURSOR comanda — de volta, a pedido
     do dono, a função da V1 (js/field.js, 81a787a): o card acende conforme o
     cursor se aproxima. Aqui: dentro de PERTO px a barra começa a encher
     (mais perto, mais carga) e um ARO nítido aparece em volta; com o cursor
     em cima ele carrega até 100% e fica CARREGADO; afastando, descarrega.
   A barra é um TUBO NEON em traço nítido (o dono proíbe desfoque): núcleo
   branco com bordas ciano, a PONTA acesa na frente, um reflexo que corre por
   dentro enquanto carrega, a porcentagem ao lado; cheia, um clarão e uma
   linha de luz atravessa o card (css/cartoes.css, "A CARGA").
   VARIAÇÕES em teste (o dono escolhe; ?carga=a|b|c|d no endereço, guardado
   na sessão; sem escolha vale a A). A: o CONTORNO do card é a barra (uma linha
   percorre a borda no sentido horário; cheio, pontos de energia correm nos
   quatro lados). B: quatro CANTOS de mira crescem pelas bordas e fecham em
   100%. C: o fundo do card ENCHE de baixo para cima com linhas finas. D: a
   imagem de referência do dono (borda e barra neon com brilho difuso — o
   único lugar do site com desfoque, por pedido explícito dele). Todas usam a
   mesma carga; css/cartoes.css desenha cada uma.
   Leis do projeto: posições lidas só em evento (rede:medida); por quadro só
   transform/opacity e o texto da porcentagem quando o número muda.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;

  var PERTO = 300;                       /* px do cursor à borda do card em que ele começa a carregar */
  var ENCHE = 3.2, ESVAZIA = 1.6;        /* /s: a carga segue o alvo (enche mais rápido do que esvazia) */
  var CARDS = '.painel:not(:where(.console, .instrumento)), .celula, .laudo__row, .spec__item, .cenario';
  /* a variação em teste */
  var VARIANTES = { a: 1, b: 1, c: 1, d: 1 }, variante = 'a';
  try {
    var pedida = (new URLSearchParams(location.search).get('carga') || '').toLowerCase();
    if (VARIANTES[pedida]) sessionStorage.setItem('bz-carga', pedida);
    var guardada = sessionStorage.getItem('bz-carga');
    if (VARIANTES[guardada]) variante = guardada;
  } catch (e) { /* sem armazenamento: a padrão */ }
  document.documentElement.setAttribute('data-carga', variante);

  /* ---------- a peça ---------- */
  function montar(card, op) {
    var c = card._carga;
    if (c) return c;
    var raiz = document.createElement('i'); raiz.className = 'carga'; raiz.setAttribute('aria-hidden', 'true');
    var trilho = document.createElement('i'); trilho.className = 'carga__trilho';
    var tubo = document.createElement('i'); tubo.className = 'carga__tubo';
    var brilho = document.createElement('i'); brilho.className = 'carga__brilho';
    var ponta = document.createElement('i'); ponta.className = 'carga__ponta';
    var pct = document.createElement('span'); pct.className = 'carga__pct'; pct.textContent = '0%';
    tubo.appendChild(brilho); tubo.appendChild(ponta); trilho.appendChild(tubo);
    raiz.appendChild(trilho); raiz.appendChild(pct);
    card.appendChild(raiz);
    if (op && op.fio) { var fio = document.createElement('i'); fio.className = 'carga-fio'; fio.setAttribute('aria-hidden', 'true'); card.appendChild(fio); }
    var varre = document.createElement('i'); varre.className = 'carga-varre'; varre.setAttribute('aria-hidden', 'true'); card.appendChild(varre);
    var aro = null;
    if (op && op.aro) { aro = document.createElement('i'); aro.className = 'carga-aro'; aro.setAttribute('aria-hidden', 'true'); card.appendChild(aro); }
    var camada = function (classe, n, tag) {
      var el = document.createElement('i'); el.className = classe; el.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < n; k++) el.appendChild(document.createElement(tag || 'b'));
      card.appendChild(el); return el;
    };
    /* A: os quatro lados do contorno e os pontos que correm; B: os oito braços dos cantos; C: as linhas; D: o brilho */
    var lados = variante === 'a' ? camada('carga-contorno', 4) : null;
    var nos = variante === 'a' || variante === 'd' ? camada('carga-nos', 4) : null;
    var bracos = variante === 'b' ? camada('carga-cantos', 8) : null;
    var linhas = variante === 'c' ? camada('carga-linhas', 1) : null;
    var halo = variante === 'd' ? camada('carga-halo', 0) : null;
    c = card._carga = { card: card, tubo: tubo, pct: pct, aro: aro, p: -1, num: 0, cheio: false, aroA: -1,
      lados: lados && lados.children, bracos: bracos && bracos.children, linhas: linhas && linhas.firstChild, halo: halo };
    card.classList.add('tem-carga');
    return c;
  }
  /* a carga (0–1): o tubo, a porcentagem e as classes, só quando mudam */
  function definir(card, p) {
    var c = card._carga || montar(card);
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    if (Math.abs(p - c.p) > 0.002) { c.tubo.style.transform = 'translate3d(' + ((p - 1) * 100).toFixed(2) + '%,0,0)'; c.p = p; variar(c, p); }
    var n = Math.round(p * 100);
    if (n !== c.num) { c.pct.textContent = n + '%'; c.num = n; }
    var carregando = p > 0.004 && p < 0.995;
    if (carregando !== card.classList.contains('is-carregando')) card.classList.toggle('is-carregando', carregando);
    var cheio = p >= 0.995;
    if (cheio !== c.cheio) {
      c.cheio = cheio;
      card.classList.toggle('is-carregado', cheio);
      if (cheio) varrer(card);
    }
  }
  /* as camadas da variação em teste (só transform/opacity) */
  function variar(c, p) {
    var k;
    if (c.lados) for (k = 0; k < 4; k++) { var s = Math.max(0, Math.min(1, p * 4 - k)); c.lados[k].style.transform = (k % 2 ? 'scaleY(' : 'scaleX(') + s.toFixed(3) + ')'; }
    if (c.bracos) for (k = 0; k < 8; k++) c.bracos[k].style.transform = (k % 2 ? 'scaleY(' : 'scaleX(') + p.toFixed(3) + ')';
    if (c.linhas) c.linhas.style.transform = 'translate3d(0,' + ((1 - p) * 100).toFixed(2) + '%,0)';
    if (c.halo) c.halo.style.opacity = p.toFixed(3);
  }
  /* cheio: a linha de luz atravessa o card uma vez (alterna -a/-b: reinicia sem ler layout) */
  function varrer(card) {
    var a = card.classList.contains('is-varre-a');
    card.classList.remove(a ? 'is-varre-a' : 'is-varre-b');
    card.classList.add(a ? 'is-varre-b' : 'is-varre-a');
  }
  function aro(card, a) {
    var c = card._carga;
    if (!c || !c.aro || Math.abs(a - c.aroA) < 0.01) return;
    c.aro.style.opacity = a.toFixed(2); c.aroA = a;
  }
  B.carga = { montar: montar, definir: definir };

  /* ---------- desktop: o cursor ---------- */
  var desktop = window.matchMedia('(min-width: 721px) and (hover: hover) and (pointer: fine)');
  if (!desktop.matches || B.reduced) return;
  var lista = [], ponteiro = { x: -1e4, y: -1e4, ativo: false };
  function posDoc(el) { var x = 0, y = 0; for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x: x, y: y }; }
  function medir() {
    var els = document.querySelectorAll(CARDS), novos = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.offsetWidth || el.closest('[aria-hidden="true"], .hero__arte')) continue;
      var it = null;
      for (var k = 0; k < lista.length && !it; k++) if (lista[k].el === el) it = lista[k];
      if (!it) { montar(el, { aro: true }); it = { el: el, carga: 0 }; }
      var p = posDoc(el);
      it.x = p.x; it.y = p.y; it.w = el.offsetWidth; it.h = el.offsetHeight;
      novos.push(it);
    }
    lista = novos;
  }
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { ponteiro.x = e.clientX; ponteiro.y = e.clientY; ponteiro.ativo = true; } }, { passive: true });
  document.documentElement.addEventListener('pointerleave', function () { ponteiro.ativo = false; }, { passive: true });
  B.on('rede:medida', medir);
  B.on('reduzir', function (sim) { if (!sim) return; B.remove('carga'); for (var i = 0; i < lista.length; i++) { definir(lista[i].el, 0); aro(lista[i].el, 0); } });

  B.add('carga', function (S) {
    if (!lista.length) return;
    var dt = Math.min(0.05, S.dt / 1000), sx = B.S.sx, sy = B.S.sy, H = window.innerHeight;
    for (var i = 0; i < lista.length; i++) {
      var it = lista[i], x0 = it.x - sx, y0 = it.y - sy;
      if (y0 > H + PERTO || y0 + it.h < -PERTO) { if (it.carga > 0) { it.carga = 0; definir(it.el, 0); aro(it.el, 0); } continue; }
      var prox = 0;
      if (ponteiro.ativo) {
        var dx = Math.max(x0 - ponteiro.x, 0, ponteiro.x - (x0 + it.w)), dy = Math.max(y0 - ponteiro.y, 0, ponteiro.y - (y0 + it.h));
        var d = Math.sqrt(dx * dx + dy * dy);
        prox = d <= 0 ? 1 : Math.max(0, 1 - d / PERTO);
      }
      /* em cima: 100%; perto: até 85%, quadrático (suave longe, forte perto, como na V1) */
      var alvo = prox >= 1 ? 1 : prox * prox * 0.85;
      var k = alvo > it.carga ? ENCHE : ESVAZIA;
      it.carga += (alvo - it.carga) * Math.min(1, dt * k);
      if (alvo === 1 && it.carga > 0.985) it.carga = 1;
      if (alvo === 0 && it.carga < 0.004) it.carga = 0;
      definir(it.el, it.carga);
      aro(it.el, prox >= 1 ? 1 : prox * prox * 0.8);
    }
  });
})();
