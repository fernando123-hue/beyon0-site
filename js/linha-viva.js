/* ==========================================================================
   A LINHA VIVA dos cartões (direção C, escolha do dono em 2026-10-20). Em
   repouso a luz pousa na linha de cima, logo depois do número (só CSS, no
   fundo do cartão: css/cartoes.css). No cartão ACESO (.is-foco: o da frente
   na pilha do celular, o do meio da tela no tablet — js/anima.js) ela decola
   dali e dá a volta na borda, sem parar enquanto ele estiver aceso (dono:
   "que seus efeitos sejam mais perceptivos").
   A construção é a da luz que circula da carga (js/carga.js, circular): quatro
   lados recortados, cada um com uma faixa do tamanho do PERÍMETRO e o traço na
   ponta dela; as quatro andam juntas (transform em % da própria faixa: o
   compositor resolve) e cada lado começa defasado pelo trecho do perímetro que
   vem antes dele, para o traço passar de um lado ao outro como se fosse um só.
   Aqui o JS só monta as peças e mede o cartão quando o tamanho muda
   (ResizeObserver); acender e apagar é classe do anima.js e CSS. No desktop
   com mouse (dono, 2026-10-23: igual ao celular) o cartão aceso é o do meio da
   tela, escolhido aqui por IntersectionObserver (sem .is-foco: o anima.js só
   acende até 860 px); quando o mouse enche um cartão a carga dá a volta e esta
   cede (uma luz só por vez). Sem JS, sem ResizeObserver ou com movimento
   reduzido: a luz fica pousada.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || B.reduced) return;
  if (!('ResizeObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var desk = window.matchMedia('(min-width: 721px) and (hover: hover) and (pointer: fine)');
  /* (só a carga cheia dá a volta; no meio da carga o cartão mostra a barra, e qualquer cartão perto do cursor carrega um pouco: cedendo aí a luz quase nunca giraria) */
  var CARGA = '.is-carregado, .is-ignicao, .is-sobrecarga, .is-esfria';

  /* (os que o anima.js acende: .servico é .painel; o .spec__item nunca acende, então não monta — revisão) */
  var CARDS = '.painel:not(:where(.console, .instrumento)), .celula, .laudo__row, .cenario';
  var VEL = 260;   /* px/s da luz na borda (a da carga anda a 170: esta é o efeito principal no celular) */

  /* onde a volta começa: na ponta da luz pousada (--luz-x + --luz-w do CSS), para ela decolar de onde estava */
  function partida(card) {
    var s = getComputedStyle(card);
    return (parseFloat(s.getPropertyValue('--luz-x')) || 0) + (parseFloat(s.getPropertyValue('--luz-w')) || 0);
  }

  function dimensionar(card, W, H) {
    var lv = card._linhaViva;
    if (!lv || !W || !H) return;
    var tam = Math.round(W) + 'x' + Math.round(H);
    if (lv.tam === tam) return;
    lv.tam = tam;
    var P = 2 * (W + H), T = P / VEL, x0 = partida(card) % P;
    var antes = [0, W, W + H, 2 * W + H];
    for (var i = 0; i < 4; i++) {
      var faixa = lv.el.children[i].firstChild;
      faixa.style[i % 2 ? 'height' : 'width'] = P.toFixed(1) + 'px';
      faixa.style.animationDuration = T.toFixed(2) + 's';
      /* (a fase de cada lado, adiantada de x0: no instante zero a cabeça do traço está na ponta da luz pousada) */
      faixa.style.animationDelay = (-(((P - antes[i] + x0) % P) / P) * T).toFixed(2) + 's';
    }
  }

  var obs = new ResizeObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], caixa = e.borderBoxSize && e.borderBoxSize[0];
      /* (a caixa da borda: a volta corre por fora do conteúdo, inset −1 px) */
      var W = caixa ? caixa.inlineSize : e.target.offsetWidth, H = caixa ? caixa.blockSize : e.target.offsetHeight;
      try { dimensionar(e.target, W, H); }
      catch (err) { if (window.console && console.warn) console.warn('[beyon] linha-viva:', err); }
    }
  });

  /* UMA VOLTA POR VEZ: dois cartões podem estar acesos juntos na troca de grupo (a pilha segura o último dela aceso
     enquanto o grupo seguinte acende o do meio da tela). Gira só o que acendeu por último (.lv-ativa); o outro fica
     aceso com a luz pousada. Quem acende é o anima.js (.is-foco); aqui só se observa a classe */
  var montados = [], ativa = null, noMeio = [];
  /* desktop com mouse: gira o cartão do meio da tela, a não ser que o mouse esteja carregando algum */
  function escolherMeio() {
    var alvo = null, melhor = Infinity;
    if (!montados.some(function (c) { return c.matches(CARGA); })) {
      var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      noMeio.forEach(function (c) {
        var r = c.getBoundingClientRect(), dx = (r.left + r.right) / 2 - cx, dy = (r.top + r.bottom) / 2 - cy, d = dx * dx + dy * dy;
        if (d < melhor) { melhor = d; alvo = c; }
      });
    }
    if (alvo === ativa) return;
    if (ativa) ativa.classList.remove('lv-ativa');
    ativa = alvo;
    if (ativa) ativa.classList.add('lv-ativa');
  }
  function escolher(novo) {
    if (desk.matches) { escolherMeio(); return; }
    var alvo = novo && novo.classList.contains('is-foco') ? novo : null;
    if (!alvo && ativa && ativa.classList.contains('is-foco')) return;
    for (var i = montados.length - 1; !alvo && i >= 0; i--) if (montados[i].classList.contains('is-foco')) alvo = montados[i];
    if (alvo === ativa) return;
    if (ativa) ativa.classList.remove('lv-ativa');
    ativa = alvo;
    if (ativa) ativa.classList.add('lv-ativa');
  }
  var classes = new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) {
      var c = ms[i].target, aceso = c.classList.contains('is-foco');
      if (desk.matches) { escolherMeio(); return; }
      if (aceso !== !!c._lvAceso) { c._lvAceso = aceso; escolher(aceso ? c : null); }
    }
  });

  /* quem está na faixa do meio da tela (mesma faixa 38 %–62 % do anima.js); o escolhido é o mais perto do centro */
  var meio = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var k = noMeio.indexOf(es[i].target);
      if (es[i].isIntersecting && k < 0) noMeio.push(es[i].target);
      else if (!es[i].isIntersecting && k >= 0) noMeio.splice(k, 1);
    }
    if (desk.matches) escolherMeio();
  }, { rootMargin: '-38% 0px -38% 0px' }) : null;
  var espera = 0;
  window.addEventListener('scroll', function () {
    if (!desk.matches || espera) return;
    espera = setTimeout(function () { espera = 0; escolherMeio(); }, 140);
  }, { passive: true });
  if (desk.addEventListener) desk.addEventListener('change', function () { escolher(null); });

  function montar(card) {
    if (card._linhaViva || card.closest('[aria-hidden="true"], .hero__arte')) return;
    var el = document.createElement('i');
    el.className = 'linha-viva';
    el.setAttribute('aria-hidden', 'true');
    for (var k = 0; k < 4; k++) { var lado = document.createElement('b'); lado.appendChild(document.createElement('i')); el.appendChild(lado); }
    card.appendChild(el);
    card._linhaViva = { el: el, tam: '' };
    card._lvAceso = card.classList.contains('is-foco');
    card.classList.add('tem-linha');
    montados.push(card);
    obs.observe(card);
    if (meio) meio.observe(card);
    classes.observe(card, { attributes: true, attributeFilter: ['class'] });
  }

  try {
    var cards = document.querySelectorAll(CARDS);
    for (var i = 0; i < cards.length; i++) montar(cards[i]);
    escolher(null);
  } catch (err) { if (window.console && console.warn) console.warn('[beyon] linha-viva:', err); }
})();
