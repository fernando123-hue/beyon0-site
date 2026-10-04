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
   O VISUAL (escolha do dono entre quatro opções, 2026-10-04: "uma junção
   da B e da D"): quatro CANTOS de mira em neon crescem pelas bordas com a
   carga e fecham a moldura em 100%; conforme ela fecha, a BORDA inteira
   acende em neon; carregando e cheio, PONTOS de luz correm nos quatro lados;
   a barra de baixo é neon. O brilho difuso aqui é exceção pedida pelo dono
   (a referência que ele mandou); no resto do site segue proibido.
   LETRAS (dono, 2026-10-04: "cada caractere com efeito quando os cards
   chegarem em 100%"): no 1º cheio o texto do card é partido em letras
   (SplitText, só então: nada pesa na carga da página; o leitor de tela lê a
   frase inteira) e uma ONDA de luz o atravessa, letra por letra — cada uma
   acende e dá um pulinho (no máximo uma onda a cada LETRAS.cada s).
   SOBRECARGA (js/estacao.js, com o mini conectado ao AI Core médio): o card
   fica preso em 100% com a moldura neon cheia e piscando, os pontos mais
   rápidos, a barra em "MAX" e uma onda de letras a cada LETRAS.sobre s.
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
  /* o texto que vira letras; s entre ondas (normal e em sobrecarga); ms de atraso por letra e teto */
  var TEXTOS = 'h3, p, .servico__link, .celula__link, .laudo__n, .servico__n, .celula__n';
  var LETRAS = { cada: 3.5, sobre: 2.4, passo: 15, teto: 1500 };
  var reduz = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- a peça ---------- */
  function montar(card, op) {
    var c = card._carga;
    if (c) {
      /* já montada (pelo desktop, numa janela que encolheu): o fio da pilha, se pedido agora */
      if (op && op.fio && !c.fio) { c.fio = document.createElement('i'); c.fio.className = 'carga-fio'; c.fio.setAttribute('aria-hidden', 'true'); card.appendChild(c.fio); }
      return c;
    }
    var raiz = document.createElement('i'); raiz.className = 'carga'; raiz.setAttribute('aria-hidden', 'true');
    var trilho = document.createElement('i'); trilho.className = 'carga__trilho';
    var tubo = document.createElement('i'); tubo.className = 'carga__tubo';
    var brilho = document.createElement('i'); brilho.className = 'carga__brilho';
    var ponta = document.createElement('i'); ponta.className = 'carga__ponta';
    var pct = document.createElement('span'); pct.className = 'carga__pct'; pct.textContent = '0%';
    tubo.appendChild(brilho); tubo.appendChild(ponta); trilho.appendChild(tubo);
    raiz.appendChild(trilho); raiz.appendChild(pct);
    card.appendChild(raiz);
    var fio = null;
    if (op && op.fio) { fio = document.createElement('i'); fio.className = 'carga-fio'; fio.setAttribute('aria-hidden', 'true'); card.appendChild(fio); }
    var varre = document.createElement('i'); varre.className = 'carga-varre'; varre.setAttribute('aria-hidden', 'true'); card.appendChild(varre);
    var aro = null;
    if (op && op.aro) { aro = document.createElement('i'); aro.className = 'carga-aro'; aro.setAttribute('aria-hidden', 'true'); card.appendChild(aro); }
    var camada = function (classe, n, tag) {
      var el = document.createElement('i'); el.className = classe; el.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < n; k++) el.appendChild(document.createElement(tag || 'b'));
      card.appendChild(el); return el;
    };
    /* os oito braços dos cantos, a borda neon e os pontos que correm */
    var bracos = camada('carga-cantos', 8), halo = camada('carga-halo', 0);
    camada('carga-nos', 4);
    c = card._carga = { card: card, tubo: tubo, pct: pct, txt: pct.firstChild, fio: fio, aro: aro, p: -1, num: 0, cheio: false, aroA: -1, bracos: bracos.children, halo: halo };
    card.classList.add('tem-carga');
    return c;
  }
  /* a carga (0–1): o tubo, a porcentagem e as classes, só quando mudam */
  function definir(card, p) {
    var c = card._carga || montar(card);
    if (c.sobre) p = 1;   /* em sobrecarga fica em 100%, quem comanda é a estação */
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    if (Math.abs(p - c.p) > 0.002) { c.tubo.style.transform = 'translate3d(' + ((p - 1) * 100).toFixed(2) + '%,0,0)'; c.p = p; variar(c, p); }
    var n = Math.round(p * 100);
    /* nodeValue, não textContent: trocar o nó acionava o MutationObserver da rede (js/rede.js), que remedia a página inteira a cada número (revisão) */
    if (n !== c.num && !c.sobre) { c.txt.nodeValue = n + '%'; c.num = n; }
    var carregando = p > 0.004 && p < 0.995;
    if (carregando !== card.classList.contains('is-carregando')) card.classList.toggle('is-carregando', carregando);
    var cheio = p >= 0.995;
    if (cheio !== c.cheio) {
      c.cheio = cheio;
      card.classList.toggle('is-carregado', cheio);
      if (cheio) { varrer(card); letras(card); }
    }
  }
  /* os cantos crescem com a carga; a borda neon acende no último terço (quando a moldura fecha) */
  function variar(c, p) {
    for (var k = 0; k < 8; k++) c.bracos[k].style.transform = (k % 2 ? 'scaleY(' : 'scaleX(') + p.toFixed(3) + ')';
    var b = Math.max(0, (p - 0.62) / 0.38);
    c.halo.style.opacity = (b * b).toFixed(3);
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
  /* a onda de luz pelas letras do card (partido na 1ª vez; reinicia alternando -a/-b, sem ler layout) */
  function letras(card, forcar) {
    if (B.reduced || reduz.matches || !window.SplitText) return;
    var c = card._carga, agora = performance.now();
    if (!c || (!forcar && agora - (c.letrasEm || -1e9) < LETRAS.cada * 1000)) return;
    c.letrasEm = agora;
    if (!c.split) {
      var alvos = [].filter.call(card.querySelectorAll(TEXTOS), function (el) { return !el.closest('.carga') && el.textContent.trim(); });
      if (!alvos.length) return;
      try { c.split = new window.SplitText(alvos, { type: 'words,chars', charsClass: 'carga-letra', wordsClass: 'carga-palavra' }); } catch (e) { c.split = { chars: [] }; }
      for (var i = 0; i < c.split.chars.length; i++) c.split.chars[i].style.animationDelay = Math.min(LETRAS.teto, i * LETRAS.passo) + 'ms';
    }
    var a = card.classList.contains('is-letras-a');
    card.classList.remove(a ? 'is-letras-a' : 'is-letras-b');
    card.classList.add(a ? 'is-letras-b' : 'is-letras-a');
  }
  /* a SOBRECARGA (js/estacao.js): presa em 100%, a barra em MAX, ondas de letras seguidas */
  function sobrecarga(card, sim) {
    var c = card._carga || montar(card);
    if (!!c.sobre === !!sim) return;
    c.sobre = !!sim;
    card.classList.toggle('is-sobrecarga', c.sobre);
    clearInterval(c.relogio);
    if (c.sobre) {
      definir(card, 1);
      c.txt.nodeValue = 'MAX';
      letras(card, true);
      c.relogio = setInterval(function () { letras(card, true); }, LETRAS.sobre * 1000);
    } else {
      c.num = -1;   /* a porcentagem volta no próximo definir */
      definir(card, c.p);
    }
  }
  /* o mini encaixado no link do card: o desktop carrega o card até 100% enquanto ele está lá */
  function impulso(card, sim) { var c = card._carga || montar(card); c.impulso = !!sim; }
  B.carga = { montar: montar, definir: definir, sobrecarga: sobrecarga, impulso: impulso };

  /* ---------- desktop: o cursor ---------- */
  var desktop = window.matchMedia('(min-width: 721px) and (hover: hover) and (pointer: fine)');
  /* aparelho sem mouse nunca usa o cursor; com mouse, a LARGURA decide a cada quadro (até 720 px quem
     comanda é a rolagem da pilha, js/anima.js: os dois nunca disputam o mesmo card) */
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || B.reduced) return;
  var lista = [], ponteiro = { x: -1e4, y: -1e4, ativo: false }, H = window.innerHeight, largo = desktop.matches;
  window.addEventListener('resize', function () { H = window.innerHeight; }, { passive: true });
  function posDoc(el) { var x = 0, y = 0; for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x: x, y: y }; }
  function medir() {
    if (!desktop.matches) { lista = []; return; }
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
  B.on('reduzir', function (sim) { if (!sim) return; B.remove('carga'); B.off('rede:medida', medir); for (var i = 0; i < lista.length; i++) { definir(lista[i].el, 0); aro(lista[i].el, 0); } lista = []; });

  B.add('carga', function (S) {
    /* a janela ficou estreita: devolve os cards (descarregados) para a pilha */
    if (largo !== desktop.matches) { largo = desktop.matches; if (!largo) { for (var j = 0; j < lista.length; j++) { definir(lista[j].el, 0); aro(lista[j].el, 0); } lista = []; } }
    if (!largo || !lista.length) return;
    var dt = Math.min(0.05, S.dt / 1000), sx = B.S.sx, sy = B.S.sy;
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
      var alvo = prox >= 1 || (it.el._carga && it.el._carga.impulso) ? 1 : prox * prox * 0.85;
      var k = alvo > it.carga ? ENCHE : ESVAZIA;
      it.carga += (alvo - it.carga) * Math.min(1, dt * k);
      if (alvo === 1 && it.carga > 0.985) it.carga = 1;
      if (alvo === 0 && it.carga < 0.004) it.carga = 0;
      definir(it.el, it.carga);
      aro(it.el, prox >= 1 ? 1 : prox * prox * 0.8);
    }
  });
})();
