/* ==========================================================================
   ANIMA — a coreografia (GSAP + ScrollTrigger + SplitText), em todas as páginas.

   A assinatura (DIRECAO-V4 §1): "a luz passa e imprime". No boot, uma faixa
   de luz atravessa o hero da esquerda para a direita em tempo LINEAR, e cada
   peça acende no instante em que a faixa cruza a posição dela na tela
   (tFeixe): as palavras do título sobem atrás da máscara coluna a coluna, o
   LED pousa, a marca acende, o console imprime, a aresta da trilha se
   desenha debaixo da luz. Depois a faixa segue em loop, em fase com a
   aresta. Ao rolar, cada bloco entra uma vez (classe `is-in`;
   css/motion.css desenha a entrada própria de cada componente) e só o
   conteúdo se move, nunca o contêiner. Só transform/opacity/visibility.

   Três pesos de entrada (rodada 4), e só estes:
   - pesado: linhas de h1/h2 sobem atrás da máscara (yPercent 108, .95s, stagger .09);
   - médio: cartões e linhas (y 14, .8s, stagger .12; na malha, onda diagonal);
   - leve: kicker, lead e nota, só opacidade (.5s, power2.out).

   É aditivo e opcional: sem GSAP, o arquivo sai, js/pagina.js retira
   `html.js` e o site aparece inteiro. Em movimento reduzido: tudo visível.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON, gsap = window.gsap, html = document.documentElement;
  if (!gsap || !B) { html.classList.remove('js'); return; }

  var ST = window.ScrollTrigger, Split = window.SplitText;
  if (ST) gsap.registerPlugin(ST);
  if (Split) gsap.registerPlugin(Split);
  gsap.ticker.lagSmoothing(0);
  html.classList.add('has-gsap');

  var EXPO = 'expo.out';
  var reduzido = B.reduced;
  var splits = [];   /* todo SplitText vivo, para reverter se o movimento for reduzido no meio */
  var HERO_PECAS = '.hero__status, .hero__sub, .hero__actions, .hero__fine, .hero__arte, .hero__rail, .nav';
  var LIMPAR = '.reveal, .reveal > *, .section__head > *, .hero__rail > *, .hero__rail-aresta, .conversa__regua, .console__linha > *, .console__medida, .nav__links > *, .feixe__linha, .hero__title, .split-word, .instrumento__nivel, .instrumento__val, .prova__item, .prova__mascara, .prova__tinta, .prova__rot, .prova__barra, .varredura, ' + HERO_PECAS;

  function acender(sel) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) els[i].classList.add('is-lit'); }

  /* ---------- tudo visível, agora (rede de segurança e reduced-motion) ---------- */
  function mostrarTudo() {
    for (var i = 0; i < splits.length; i++) { try { splits[i].revert(); } catch (e) { /* já revertido */ } }
    splits.length = 0;
    /* contagem interrompida (reduzir no meio): o valor medido volta, e escrever() volta a atualizar */
    var contando = document.querySelectorAll('[data-contando]');
    for (var c = 0; c < contando.length; c++) {
      if (contando[c]._final) contando[c]._final.alvo.textContent = contando[c]._final.txt;
      contando[c].removeAttribute('data-contando');
    }
    /* os filhos em cascata também: um reduzir() no meio da cascata deixava
       .qa/.celula com opacity parcial ou zero para sempre (achado da revisão) */
    gsap.set(LIMPAR, { clearProps: 'all' });
    html.classList.remove('js');
    acender('.hero__title, h2, .wordmark b');
    var todos = document.querySelectorAll('.reveal, .console');
    var instrs = document.querySelectorAll('.instrumento');
    for (var n = 0; n < instrs.length; n++) instrs[n].classList.add('is-lido');
    acender('.prova__item');
    var palcos = document.querySelectorAll('.prova--palco');
    for (var p = 0; p < palcos.length; p++) palcos[p].classList.remove('prova--palco');
    for (var j = 0; j < todos.length; j++) todos[j].classList.add('is-in');
    var feixe = document.querySelector('.feixe');
    if (feixe) feixe.classList.add('is-loop');
  }

  /* ---------- SPLIT com máscara ----------
     `revert` no fim devolve o DOM original (a divisão é um EVENTO, não um estado). */
  function partir(el, tipo) {
    if (!Split) return null;
    try {
      var sp = tipo === 'words'
        ? new Split(el, { type: 'lines,words', mask: 'words', linesClass: 'split-line', wordsClass: 'split-word' })
        : new Split(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      splits.push(sp);
      return sp;
    } catch (e) { return null; }
  }

  /* ---------- CONTAGEM até o valor medido (nunca além dele) ----------
     Lê o texto final já escrito por js/pagina.js ("0.52 s", "282 KB") e sobe
     de zero até ele. Na prova o número vive num <b> e a unidade num <small>:
     a contagem escreve só no <b>. `data-contando` avisa o medidor. */
  function contar(el, duracao, atraso) {
    var alvo = el.querySelector('b') || el;
    var m = /^([\d.,]+)(.*)$/.exec(alvo.textContent.trim());
    if (!m || el.hasAttribute('data-contando')) return;
    var fim = parseFloat(m[1].replace(',', '.')), sufixo = m[2];
    if (!isFinite(fim) || fim <= 0) return;
    var casas = (m[1].split(/[.,]/)[1] || '').length;
    var obj = { v: 0 };
    el.setAttribute('data-contando', '');
    el._final = { alvo: alvo, txt: m[0] };   /* mostrarTudo devolve se a contagem morrer no meio */
    gsap.fromTo(obj, { v: 0 }, {
      v: fim, duration: duracao || 1.1, delay: atraso || 0, ease: 'power3.out',
      onUpdate: function () { alvo.textContent = B.num(obj.v, casas) + sufixo; },
      onComplete: function () { alvo.textContent = m[0]; el.removeAttribute('data-contando'); }
    });
  }

  /* ---------- A ARTE (console / janela / instrumento) imprime ----------
     No desktop faz parte do boot (no instante do feixe); no celular entra
     quando aparece na tela, com gatilho próprio. */
  function imprimirArte(arte, tl, t0) {
    var consoleEl = arte.querySelector('.console');
    var alvoTl = tl || gsap.timeline();
    if (consoleEl) {
      var pecas = consoleEl.querySelectorAll('.console__medida, .console__topo, .console__linha > *');
      alvoTl.to(arte, { opacity: 1, duration: .01 }, t0);
      alvoTl.fromTo(pecas, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .5, ease: EXPO, stagger: .07, clearProps: 'transform,opacity' }, t0);
      alvoTl.add(function () { consoleEl.classList.add('is-in'); }, t0 + .05);
    } else {
      alvoTl.fromTo(arte, { y: 24 }, { opacity: 1, y: 0, duration: 1, ease: EXPO, clearProps: 'transform' }, t0);
      var instr = arte.querySelector('.instrumento');
      if (instr) lerInstrumento(instr, alvoTl, t0);
    }
    alvoTl.add(function () {
      var els = arte.querySelectorAll('[data-metrica="carga"], [data-metrica="peso"]');
      for (var i = 0; i < els.length; i++) contar(els[i], 1.1, 0);
    }, t0 + .3);
  }

  /* o instrumento (Automação) lê em ordem: cada barra enche e só então o
     "lido" cai, no relógio do boot, não num atraso fixo do CSS */
  function lerInstrumento(instr, tl, t0) {
    var linhas = instr.querySelectorAll('.instrumento__linha'), fim = t0;
    for (var i = 0; i < linhas.length; i++) {
      var nivel = linhas[i].querySelector('.instrumento__nivel'), val = linhas[i].querySelector('.instrumento__val');
      var t = t0 + .15 + i * .22;
      if (nivel) tl.fromTo(nivel, { scaleX: 0 }, { scaleX: 1, duration: .9, ease: 'power3.inOut' }, t);
      if (val) tl.fromTo(val, { opacity: 0, x: -4 }, { opacity: 1, x: 0, duration: .3, ease: 'power2.out' }, t + .8);
      fim = t + 1.1;
    }
    tl.add(function () {
      instr.classList.add('is-lido');
      gsap.set(instr.querySelectorAll('.instrumento__nivel, .instrumento__val'), { clearProps: 'transform,opacity' });
    }, fim);
  }

  /* ---------- BOOT DO HERO: a luz passa e imprime ---------- */
  var feito = false;
  function heroEntra() {
    if (feito) return;
    feito = true;
    if (reduzido) { mostrarTudo(); return; }

    var hero = document.querySelector('.hero');
    var titulo = document.querySelector('.hero__title');
    var status = document.querySelector('.hero__status');
    var dot = status && status.querySelector('.dot');
    var marca = document.querySelector('.wordmark b');
    var sub = document.querySelector('.hero__sub');
    var acoes = document.querySelector('.hero__actions');
    var fine = document.querySelector('.hero__fine');
    var arte = document.querySelector('.hero__arte');
    var rail = document.querySelector('.hero__rail');
    var aresta = rail && rail.querySelector('.hero__rail-aresta');
    var nav = document.querySelector('.nav');
    var feixe = document.querySelector('.feixe');
    var linha = feixe && feixe.querySelector('.feixe__linha');
    var largo = window.innerWidth >= 861;

    try {
      var T = largo ? 1.8 : 1.2;
      var vw = window.innerWidth, vh = window.innerHeight;
      var fx = feixe ? feixe.getBoundingClientRect().left : 0;
      var topo = hero ? hero.getBoundingClientRect().top : 0;
      /* desktop: o instante em que o centro da faixa cruza um x da tela */
      var tFeixe = function (px) { return Math.max(0, Math.min(T, T * ((px - fx) / vw + .20) / 1.30)); };
      /* o instante de uma peça: no desktop a luz corre da esquerda para a
         direita; no celular ela desce, então conta a altura (e um passo
         pela esquerda, para as palavras de uma linha não subirem juntas) */
      var tEm = function (el, frac) {
        var r = el.getBoundingClientRect();
        if (largo) return tFeixe(r.left + r.width * (frac || 0));
        return Math.max(0, .1 + Math.min(1.1, (r.top - topo) / vh * 1.4) + (r.left / vw) * .2);
      };

      var tl = gsap.timeline({ defaults: { ease: EXPO } });
      if (linha) tl.fromTo(linha, largo ? { x: '-20vw' } : { y: '-15vh' }, largo ? { x: '110vw', duration: T, ease: 'none' } : { y: '110vh', duration: T, ease: 'none' }, 0);
      if (nav) {
        tl.to(nav, { opacity: 1, duration: .5 }, 0);
        tl.from(nav.querySelectorAll('.nav__links > *'), { y: -8, opacity: 0, duration: .8, stagger: .05, clearProps: 'all' }, .15);
      }
      if (status) tl.fromTo(status, { y: 10 }, { opacity: 1, y: 0, duration: .8 }, .05);
      if (dot) tl.from(dot, { scale: 0, duration: .4, ease: 'back.out(2)', clearProps: 'transform' }, tEm(dot));
      if (marca) tl.add(function () { marca.classList.add('is-lit'); }, tEm(marca));

      if (titulo) {
        var sp = partir(titulo, 'words');
        if (sp && sp.words && sp.words.length) {
          /* O TÍTULO É O LCP: 45% já pintado no primeiro quadro. Cada palavra
             sobe quando a luz chega nela; palavras na mesma coluna sobem
             juntas, em qualquer largura: a luz imprime colunas. */
          gsap.set(sp.words, { yPercent: 55 });
          gsap.set(titulo, { visibility: 'visible' });
          var ultimo = 0;
          for (var w = 0; w < sp.words.length; w++) {
            var tw = tEm(sp.words[w], .25);
            if (tw > ultimo) ultimo = tw;
            tl.to(sp.words[w], { yPercent: 0, duration: .7 }, tw);
          }
          /* SEM revert aqui: devolver os nós de texto ao h1 faz o Chrome re-registrar
             o título inteiro como LCP no fim da animação (medido: 0,9s → 2,5s no
             celular). As palavras ficam divididas; mostrarTudo() reverte se preciso. */
          tl.add(function () { titulo.classList.add('is-lit'); }, ultimo + .35);
        } else {
          tl.fromTo(titulo, { visibility: 'visible', opacity: .35, y: 16 }, { opacity: 1, y: 0, duration: .8, onComplete: function () { titulo.classList.add('is-lit'); } }, .05);
        }
      }

      /* o parágrafo é o LCP no celular: entra cedo (no máx. 0,3s), junto da última linha do título; esperar a luz descer até ele custava 0,3s de LCP (medido) */
      var tCol = sub ? (largo ? tEm(sub) : Math.min(tEm(sub), .3)) : .5;
      if (sub) tl.fromTo(sub, { y: 18 }, { opacity: 1, y: 0, duration: .9 }, tCol + .05);
      if (acoes) tl.fromTo(acoes, { y: 14 }, { opacity: 1, y: 0, duration: .9 }, tCol + .15);
      if (fine) tl.to(fine, { opacity: 1, duration: .7 }, tCol + .25);

      if (arte && largo) imprimirArte(arte, tl, tEm(arte));
      if (rail) {
        var rr = rail.getBoundingClientRect();
        var tR0 = largo ? tFeixe(rr.left) : tEm(rail), tR1 = largo ? tFeixe(rr.right) : tR0 + .6;
        if (largo) tl.to(rail, { opacity: 1, duration: .01 }, Math.max(0, tR0 - .05));
        if (aresta) tl.to(aresta, { scaleX: 1, duration: Math.max(.3, tR1 - tR0), ease: 'none' }, tR0);
        var filhos = rail.querySelectorAll(':scope > :not(.hero__rail-aresta)');
        for (var f = 0; f < filhos.length; f++) {
          tl.fromTo(filhos[f], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .6, clearProps: 'opacity,transform' }, tEm(filhos[f]));
        }
        /* a medida da trilha conta até o valor medido */
        tl.add(function () {
          var els = rail.querySelectorAll('[data-metrica="carga"], [data-metrica="peso"]');
          for (var i = 0; i < els.length; i++) contar(els[i], 1.1, 0);
        }, tR0 + .3);
      }
      tl.add(function () {
        if (linha) gsap.set(linha, { clearProps: 'transform' });
        if (feixe) feixe.classList.add('is-loop');
      }, T + .1);

      /* celular: a arte imprime quando aparece, não antes */
      if (arte && !largo) {
        if (ST) ST.create({ trigger: arte, start: 'top 82%', once: true, onEnter: function () { imprimirArte(arte, null, 0); } });
        else imprimirArte(arte, null, 0);
      }
    } catch (e) {
      mostrarTudo();
    }
  }
  if (document.body.classList.contains('booted')) heroEntra();
  else B.on('booted', heroEntra);

  /* ---------- ENTRADAS POR SEÇÃO ----------
     O contêiner só esmaece; quem se move é o conteúdo. Laudo, passos, prova
     e spec não recebem tween nos filhos: a classe `is-in` basta, o CSS
     desenha régua, trilho, barra e marca (css/motion.css). O cabeçalho entra
     em três tempos (kicker, linhas do h2, lead) e a ênfase do h2 acende. */
  var jaRevelou = false;

  /* ---------- POSIÇÃO DE ROLAGEM ----------
     O palco da prova estica a página (pin) só depois do boot: a restauração
     nativa do navegador (recarregar, voltar) acontece antes e cai no lugar
     errado. Com movimento, a página guarda o scrollY ao sair e o devolve
     depois do refresh dos gatilhos. Em movimento reduzido nada disso liga. */
  var CHAVE_ROLAGEM = 'beyon:rolagem:' + location.pathname;
  var rolagemPropria = false;
  if (!reduzido && ST && 'scrollRestoration' in history) {
    try {
      /* pelo próprio ScrollTrigger: ele mexe em scrollRestoration no refresh */
      ST.clearScrollMemory('manual');
      window.addEventListener('pagehide', function () { try { sessionStorage.setItem(CHAVE_ROLAGEM, String(Math.round(window.scrollY))); } catch (e) { /* sem armazenamento */ } });
      rolagemPropria = true;
    } catch (e) { /* navegador sem suporte: fica a restauração nativa */ }
  }
  function restaurarRolagem() {
    if (!rolagemPropria) return;
    var navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var tipo = navEntry ? navEntry.type : '';
    if (tipo !== 'reload' && tipo !== 'back_forward') return;
    var y = null;
    try { y = sessionStorage.getItem(CHAVE_ROLAGEM); } catch (e) { return; }
    if (y !== null && +y > 0) window.scrollTo({ top: +y, behavior: 'instant' });
  }
  var mm = null;   /* o gsap.matchMedia: reverter tudo (pin incluído) ao reduzir o movimento */
  var COM_FILHOS = '.servicos, .malha, .cenarios, .faq-list';
  var SEM_TWEEN = '.laudo, .passos, .prova, .spec';
  var CASCATA = { '.passos': .55 };
  var ATRASO = { '.passos': .15 };
  function marcar(el) {
    el.classList.add('is-in');
    if (el.parentNode.classList.contains('conversa')) fechamento(el);
    else if (el.classList.contains('section__head')) cabecalho(el);
    if (el.classList.contains('prova') && !el.classList.contains('prova--palco')) luzMede(el);
  }

  /* ---------- A LUZ QUE MEDE (a prova) ----------
     O mesmo gesto do boot: uma faixa de luz atravessa e cada número acende
     (barra lateral) e conta até o valor medido no instante em que ela passa
     por ele. Celular e tablet: uma passagem, ao entrar. Desktop: o palco. */
  function tPassagem(px, largura, w, T) { return Math.max(0, Math.min(T, T * (px + w * .5) / (largura + w))); }
  function visiveis(lista) { return [].filter.call(lista, function (el) { return el.offsetParent !== null; }); }
  function contarItem(item, atraso) {
    var v = item.querySelector('[data-metrica="carga"], [data-metrica="peso"]');
    if (v) contar(v, .9, atraso || 0);
  }
  function luzMede(prova) {
    var luz = prova.querySelector('.varredura');
    var itens = visiveis(prova.querySelectorAll('.prova__item'));
    if (!luz || !itens.length) { itens.forEach(function (it) { it.classList.add('is-lit'); contarItem(it); }); return; }
    var T = 1.2, cx = prova.getBoundingClientRect(), w = luz.offsetWidth;
    var tl = gsap.timeline();
    tl.fromTo(luz, { x: -w, opacity: 1 }, { x: cx.width, duration: T, ease: 'none' }, 0).set(luz, { opacity: 0 });
    itens.forEach(function (it, i) {
      var r = it.querySelector('.prova__val').getBoundingClientRect();
      /* empilhados (celular) a luz chega junto: um passo de .12s dá a ordem */
      tl.add(function () { it.classList.add('is-lit'); contarItem(it); }, tPassagem(r.left - cx.left + r.width * .25, cx.width, w, T) + i * .12);
    });
  }
  function cabecalho(cabeca) {
    var kick = cabeca.querySelector('.kicker'), lead = cabeca.querySelector('.lead'), h = cabeca.querySelector('h2');
    if (kick) gsap.fromTo(kick, { opacity: 0 }, { opacity: 1, duration: .5, ease: 'power2.out', clearProps: 'all' });
    if (lead) gsap.fromTo(lead, { opacity: 0 }, { opacity: 1, duration: .5, delay: .45, ease: 'power2.out', clearProps: 'all' });
    if (h && !h._partido) {
      h._partido = true;
      var sp = partir(h, 'lines');
      if (sp && sp.lines.length) gsap.from(sp.lines, { yPercent: 108, duration: .95, delay: .25, stagger: .09, ease: EXPO, onComplete: function () { sp.revert(); h.classList.add('is-lit'); } });
      else h.classList.add('is-lit');
    }
    var regua = cabeca.parentNode.querySelector('.conversa__regua');
    if (regua) gsap.fromTo(regua, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power4.inOut' });
  }
  /* ---------- A LUZ FECHA A PÁGINA (a conversa) ----------
     O terceiro ato do mesmo gesto: a faixa atravessa a última seção, a régua
     se desenha debaixo dela, cada palavra do h2 sobe quando a luz chega na
     coluna dela, a ênfase acende e o botão recebe o brilho da passagem. */
  function fechamento(bloco) {
    var sec = bloco.parentNode, luz = sec.querySelector('.varredura'), h = bloco.querySelector('h2');
    if (!luz || !h || h._partido) { cabecalho(bloco); return; }
    h._partido = true;
    var regua = sec.querySelector('.conversa__regua'), btn = bloco.querySelector('.btn--primary');
    var kick = bloco.querySelector('.kicker'), lead = bloco.querySelector('.lead');
    var T = 1.4, cx = sec.getBoundingClientRect(), w = luz.offsetWidth;
    var quando = function (el) { return tPassagem(el.getBoundingClientRect().left - cx.left, cx.width, w, T); };
    var tl = gsap.timeline();
    tl.fromTo(luz, { x: -w, opacity: 1 }, { x: cx.width, duration: T, ease: 'none' }, 0).set(luz, { opacity: 0 });
    if (regua) tl.fromTo(regua, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: T, ease: 'none' }, 0);
    if (kick) tl.fromTo(kick, { opacity: 0 }, { opacity: 1, duration: .5, ease: 'power2.out', clearProps: 'all' }, 0);
    var sp = partir(h, 'words');
    if (sp && sp.words && sp.words.length) {
      gsap.set(sp.words, { yPercent: 100 });
      sp.words.forEach(function (wd) { tl.to(wd, { yPercent: 0, duration: .7, ease: EXPO }, quando(wd)); });
      var em = h.querySelector('em');
      tl.add(function () { h.classList.add('is-lit'); }, em ? quando(em) + .1 : T);
      /* não é o LCP: o h2 volta ao DOM original no fim */
      tl.add(function () { try { sp.revert(); } catch (e) { /* já revertido */ } }, T + .8);
    } else h.classList.add('is-lit');
    if (lead) tl.fromTo(lead, { opacity: 0 }, { opacity: 1, duration: .5, ease: 'power2.out', clearProps: 'all' }, .45);
    if (btn) tl.add(function () { btn.classList.add('is-passou'); }, quando(btn));
  }
  function de(tabela, el, padrao) { for (var k in tabela) if (el.matches(k)) return tabela[k]; return padrao; }
  function revelar(el, imediato) {
    marcar(el);
    if (el.matches(SEM_TWEEN)) return;
    var kids = el.matches(COM_FILHOS) ? el.children : null;
    gsap.to(el, { opacity: 1, y: 0, duration: imediato ? .35 : .45, ease: EXPO, overwrite: true });
    if (kids && kids.length) {
      gsap.fromTo(kids, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .8, delay: de(ATRASO, el, 0), ease: EXPO, stagger: { each: de(CASCATA, el, .12), grid: 'auto', from: 'start' }, clearProps: 'opacity,transform' });
    }
  }
  function scrollReveals() {
    if (jaRevelou) return;
    jaRevelou = true;
    if (reduzido) return;
    var alvos = [].slice.call(document.querySelectorAll('.reveal'));
    if (!alvos.length) return;
    try {
      /* só o que não tem entrada própria desloca (ex.: o bloco da conversa) */
      var soltos = alvos.filter(function (el) { return !el.matches(COM_FILHOS + ', ' + SEM_TWEEN + ', .section__head'); });
      if (soltos.length) gsap.set(soltos, { y: 24 });
      if (ST && ST.batch) {
        ST.batch(alvos, {
          start: 'clamp(top 88%)', once: true,
          onEnter: function (els) { for (var i = 0; i < els.length; i++) revelar(els[i], false); }
        });
        ST.refresh();
        var vh = window.innerHeight;
        alvos.forEach(function (el) {
          if (el.getBoundingClientRect().top < vh * .88 && !el.classList.contains('is-in')) revelar(el, true);
        });
      } else {
        for (var i = 0; i < alvos.length; i++) revelar(alvos[i], true);
      }
    } catch (e) {
      for (var j = 0; j < alvos.length; j++) { marcar(alvos[j]); gsap.set(alvos[j], { opacity: 1, y: 0 }); }
    }

    /* ---- desktop: a arte e a luz respondem à rolagem (o texto, nunca) e o
       console inclina ao ponteiro. Só transform/opacity no compositor. ---- */
    if (gsap.matchMedia) {
      try {
        mm = gsap.matchMedia();
        mm.add('(min-width: 981px) and (prefers-reduced-motion: no-preference)', function () { return palco(); });
        /* celular: sem hover, o item no meio da tela é o "em foco" (índice âmbar,
           régua acesa). Classe por evento de rolagem, nada por quadro. */
        mm.add('(max-width: 860px) and (prefers-reduced-motion: no-preference)', function () {
          if (!ST || html.classList.contains('menos-movimento')) return;
          gsap.utils.toArray('.servico, .laudo__row, .celula, .passo').forEach(function (el) {
            ST.create({ trigger: el, start: 'top 62%', end: 'bottom 38%', toggleClass: { targets: el, className: 'is-foco' } });
          });
        });
        mm.add('(min-width: 861px) and (prefers-reduced-motion: no-preference)', function () {
          var hero = document.querySelector('.hero');
          if (!hero || !ST) return;
          var arte = hero.querySelector('.hero__arte'), feixe = hero.querySelector('.feixe');
          if (arte) gsap.to(arte, { yPercent: -12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .8 } });
          if (feixe) gsap.to(feixe, { opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: '40% top', end: 'bottom top', scrub: true } });
          /* o CTA da nav é discreto enquanto o do hero está na tela; preenche quando ele sai */
          var acoes = hero.querySelector('.hero__actions'), navEl = document.querySelector('.nav');
          if (acoes && navEl) {
            navEl.classList.add('nav--espera');
            ST.create({ trigger: acoes, start: 'bottom top', end: 'max', toggleClass: { targets: navEl, className: 'is-cta' } });
          }
          /* ao sair do contexto (reduzir, janela estreita) o CTA volta a ser sólido */
          return function () { if (navEl) navEl.classList.remove('nav--espera', 'is-cta'); };
        });
        mm.add('(min-width: 861px) and (hover: hover) and (prefers-reduced-motion: no-preference)', function () {
          var hero = document.querySelector('.hero'), consoleEl = document.querySelector('.console');
          if (!hero || !consoleEl) return;
          var rx = gsap.quickTo(consoleEl, 'rotationX', { duration: 1.2, ease: 'power3' });
          var ry = gsap.quickTo(consoleEl, 'rotationY', { duration: 1.2, ease: 'power3' });
          /* inclinação de instrumento, não de cartão de brinde: ±2° e ±1,2° */
          var mover = function (e) { ry((e.clientX / window.innerWidth - .5) * 4); rx(-(e.clientY / window.innerHeight - .5) * 2.4); };
          var sair = function () { ry(0); rx(0); };
          hero.addEventListener('pointermove', mover, { passive: true });
          hero.addEventListener('pointerleave', sair, { passive: true });
          return function () { hero.removeEventListener('pointermove', mover); hero.removeEventListener('pointerleave', sair); sair(); };
        });
      } catch (e) { /* profundidade é acréscimo, não conteúdo */ }
      if (ST) ST.refresh();
      restaurarRolagem();
    }
  }

  /* ---------- O PALCO DA PROVA (desktop, com movimento) ----------
     O momento de assinatura: a prova fica fixa na tela e a luz atravessa
     três vezes. Em cada passagem ela IMPRIME um número: uma máscara cuja
     borda anda no centro da luz revela a leitura nova à esquerda e apaga a
     anterior à direita. A rolagem conduz (scrub) e assenta em cada leitura
     (snap). O passo "01 / 03" e a barra dizem onde se está. Só transform e
     opacity; larguras como função (invalidateOnRefresh): redimensionar
     recalcula. Os números já estão escritos: nada conta aqui. */
  function palco() {
    var prova = document.querySelector('.prova');
    var luz = prova && prova.querySelector('.varredura');
    var sec = prova && prova.closest('section');
    if (!ST || !luz || !sec || html.classList.contains('menos-movimento') || prova.offsetParent === null) return;
    prova.classList.add('prova--palco');
    var itens = visiveis(prova.querySelectorAll('.prova__item'));
    if (!itens.length) { prova.classList.remove('prova--palco'); return; }
    itens.forEach(function (it) { it.classList.add('is-lit'); });
    var idx = prova.querySelector('.prova__idx'), barra = prova.querySelector('.prova__barra');
    var W = function () { return prova.clientWidth; }, w = function () { return luz.offsetWidth; };
    var partes = itens.map(function (it) {
      var m = it.querySelector('.prova__mascara');
      return { m: m, t: it.querySelector('.prova__tinta'), rot: it.querySelector('.prova__rot'),
        px: function () { return m.getBoundingClientRect().left - prova.getBoundingClientRect().left; },
        wm: function () { return m.offsetWidth; } };
    });
    var total = itens.length, atual = 0;
    var tl = gsap.timeline({ scrollTrigger: {
      trigger: sec, start: 'center center', end: '+=150%', pin: true, scrub: .5, refreshPriority: 1, invalidateOnRefresh: true,
      snap: { snapTo: 'labelsDirectional', duration: { min: .2, max: .5 }, ease: 'power2.inOut', delay: .1 },
      onUpdate: function () {
        /* o número atual muda quando a impressão do seguinte passa da metade */
        var n = 1;
        for (var k = 1; k < total; k++) if (tl.time() >= k * 1.4 + .5) n = k + 1;
        if (n !== atual && idx) { atual = n; idx.textContent = (n < 10 ? '0' : '') + n + ' / ' + (total < 10 ? '0' : '') + total; }
      }
    } });
    /* tudo em fromTo com partida explícita: um `to` relia a partida depois do
       refresh (invalidateOnRefresh) e a máscara e a tinta se desencontravam.
       As revelações nascem aplicadas (immediateRender): os três números
       começam escondidos e o primeiro é impresso na 1ª passagem. */
    var esc = function (p) { return function () { return -p.wm(); }; };
    var dir = function (p) { return function () { return p.wm(); }; };
    partes.forEach(function (p, i) {
      var s = i * 1.4;
      /* a borda da máscara segue o centro da luz: começa quando o centro chega à
         borda esquerda do número e dura o tempo de atravessá-lo */
      var px = p.m.getBoundingClientRect().left - prova.getBoundingClientRect().left;
      var ini = s + (px + w() / 2) / (W() + w()), dur = p.wm() / (W() + w());
      tl.fromTo(luz, { x: function () { return -w(); }, opacity: 1 }, { x: W, duration: 1, ease: 'none', immediateRender: false }, s);
      tl.fromTo(p.m, { x: esc(p) }, { x: 0, duration: dur, ease: 'none', immediateRender: true }, ini);
      tl.fromTo(p.t, { x: dir(p) }, { x: 0, duration: dur, ease: 'none', immediateRender: true }, ini);
      if (p.rot) tl.fromTo(p.rot, { opacity: 0 }, { opacity: 1, duration: .3, ease: 'power2.out', immediateRender: true }, ini + dur * .5);
      var ant = partes[i - 1];
      if (ant) {
        tl.fromTo(ant.m, { x: 0 }, { x: dir(ant), duration: dur, ease: 'none', immediateRender: false }, ini);
        tl.fromTo(ant.t, { x: 0 }, { x: esc(ant), duration: dur, ease: 'none', immediateRender: false }, ini);
        if (ant.rot) tl.fromTo(ant.rot, { opacity: 1 }, { opacity: 0, duration: .2, ease: 'power2.in', immediateRender: false }, ini);
      }
      tl.addLabel('n' + i, s + 1.05);
    });
    tl.set(luz, { opacity: 0 }, (total - 1) * 1.4 + 1.05);
    if (barra) tl.fromTo(barra, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: tl.duration() }, 0);
    return function () {
      prova.classList.remove('prova--palco');
      var limpar = [luz, barra].concat(partes.map(function (p) { return p.m; }), partes.map(function (p) { return p.t; }), partes.map(function (p) { return p.rot; })).filter(Boolean);
      gsap.set(limpar, { clearProps: 'opacity,transform' });
      if (idx) idx.textContent = '01 / ' + (total < 10 ? '0' : '') + total;
    };
  }
  /* liga depois do boot: não revela cedo demais nem compete com o hero */
  var ligar = function () { setTimeout(scrollReveals, 120); };
  if (document.body.classList.contains('booted')) ligar();
  else B.on('booted', ligar);
  /* rede: nunca deixa conteúdo preso invisível */
  setTimeout(function () { if (!jaRevelou) scrollReveals(); }, 4000);

  /* ---------- FAQ: a resposta entra, em vez de saltar ---------- */
  var qas = document.querySelectorAll('.qa');
  for (var q = 0; q < qas.length; q++) {
    (function (qa) {
      qa.addEventListener('toggle', function () {
        if (!qa.open || reduzido) return;
        var a = qa.querySelector('.qa__a');
        if (a) gsap.fromTo(a, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: .45, ease: EXPO, clearProps: 'all' });
      });
    })(qas[q]);
  }

  /* ---------- "menos movimento" em tempo de execução ---------- */
  B.on('reduzir', function (sim) {
    if (!sim) return;
    reduzido = true;
    try { if (mm) mm.revert(); } catch (e) { /* já revertido */ }
    try { if (ST) ST.getAll().forEach(function (t) { t.kill(); }); gsap.globalTimeline.clear(); } catch (e) { /* já foi */ }
    mostrarTudo();
  });
})();
