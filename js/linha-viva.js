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
   com mouse quem dá a volta é a carga (o CSS esconde esta). Sem JS, sem
   ResizeObserver ou com movimento reduzido: a luz fica pousada.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || B.reduced) return;
  if (!('ResizeObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /* (desktop com mouse: a volta é da carga; o CSS também esconde esta lá, se a janela estreitar depois) */
  if (window.matchMedia('(min-width: 721px) and (hover: hover) and (pointer: fine)').matches) return;

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
  var montados = [], ativa = null;
  function escolher(novo) {
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
      if (aceso !== !!c._lvAceso) { c._lvAceso = aceso; escolher(aceso ? c : null); }
    }
  });

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
    classes.observe(card, { attributes: true, attributeFilter: ['class'] });
  }

  try {
    var cards = document.querySelectorAll(CARDS);
    for (var i = 0; i < cards.length; i++) montar(cards[i]);
    escolher(null);
  } catch (err) { if (window.console && console.warn) console.warn('[beyon] linha-viva:', err); }
})();
