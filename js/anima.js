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
   - pesado: linhas de h1/h2 sobem atrás da máscara (yPercent 135, .95s, stagger .09);
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
  var LIMPAR = '.reveal, .reveal > *, .section__head > *, .hero__rail > *, .hero__rail-aresta, .conversa__regua, .console__linha > *, .console__medida, .nav__links > *, .feixe__linha, .hero__title, .split-word, .instrumento__nivel, .instrumento__val, .hero__cota-linha, .hero__cota-tick, .hero__cota-rot, .btn__canto, .console__topo, .prova__item, .prova__mascara, .prova__tinta, .prova__rot, .prova__barra, .varredura, ' + HERO_PECAS;

  function acender(sel) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) els[i].classList.add('is-lit'); }

  /* ---------- tudo visível, agora (rede de segurança e reduced-motion) ---------- */
  function mostrarTudo() {
    for (var i = 0; i < splits.length; i++) { try { splits[i].revert(); } catch (e) { /* já revertido */ } }
    splits.length = 0;
    /* contagem interrompida (reduzir no meio): o valor medido volta, e escrever() volta a atualizar */
    var contando = document.querySelectorAll('[data-contando]');
    for (var c = 0; c < contando.length; c++) {
      if (contando[c]._final) { var fa = contando[c]._final.alvo; fa.textContent = contando[c]._final.txt; fa.style.minWidth = ''; fa.style.display = ''; }
      contando[c].removeAttribute('data-contando');
    }
    /* os filhos em cascata também: um reduzir() no meio da cascata deixava
       .qa/.celula com opacity parcial ou zero para sempre (achado da revisão) */
    gsap.set(LIMPAR, { clearProps: 'all' });
    html.classList.remove('js');
    acender('.hero__title, h2');
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
    /* (títulos que voltam ao DOM original: as margens das linhas somando certo, css/motion.css — a altura
       dividida = a normal. Antes o h2 dividido ficava 40–55 px mais alto e, ao reverter no meio da rolagem, a
       página pulava) */
    var volta = el.tagName !== 'H1', alturaAntes = volta ? el.offsetHeight : 0;
    if (volta) el.classList.add('partindo', tipo === 'words' ? 'partindo--palavras' : 'partindo--linhas');
    /* uma quebra só do desktop (<br class="br-l">, escondida no celular) o SplitText quebra mesmo escondida:
       no celular o título ganhava uma linha ("Três serviços, / um / padrão…"). Enquanto dividido ela vira um
       <span> vazio marcado (um <wbr> o SplitText também quebrava) e volta a ser <br> no fim */
    if (volta) [].forEach.call(el.querySelectorAll('br'), function (br) {
      if (getComputedStyle(br).display !== 'none') return;
      var w = document.createElement('span'); w.className = br.className; w.setAttribute('data-br', ''); br.parentNode.replaceChild(w, br);
    });
    var devolverBr = function () {
      [].forEach.call(el.querySelectorAll('span[data-br]'), function (w) { var br = document.createElement('br'); br.className = w.className; w.parentNode.replaceChild(br, w); });
    };
    try {
      var sp = tipo === 'words'
        ? new Split(el, { type: 'lines,words', mask: 'words', linesClass: 'split-line', wordsClass: 'split-word' })
        : new Split(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      if (volta) {
        var reverter = sp.revert.bind(sp);
        sp.revert = function () { reverter(); el.classList.remove('partindo', 'partindo--palavras', 'partindo--linhas'); devolverBr(); };
        /* trava: dividido ele não pode mudar de altura (ao voltar, a página pularia no meio da rolagem); se mudou,
           desfaz já e o título entra sem a animação das linhas */
        if (Math.abs(el.offsetHeight - alturaAntes) > 2) { sp.revert(); return null; }
      }
      splits.push(sp);
      return sp;
    } catch (e) { if (volta) el.classList.remove('partindo', 'partindo--palavras', 'partindo--linhas'); devolverBr(); return null; }
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
    /* a largura do número final fica reservada enquanto conta: de "0" a "712" ele crescia e, no celular, a legenda
       ao lado mudava de 3 para 2 linhas e de volta — a seção da prova pulava 11 px (no <b> da prova; o resto é bloco) */
    var reservar = alvo !== el;
    if (reservar) { alvo.style.minWidth = alvo.getBoundingClientRect().width + 'px'; alvo.style.display = 'inline-block'; }
    gsap.fromTo(obj, { v: 0 }, {
      v: fim, duration: duracao || 1.1, delay: atraso || 0, ease: 'power3.out',
      onUpdate: function () { alvo.textContent = B.num(obj.v, casas) + sufixo; },
      onComplete: function () { alvo.textContent = m[0]; el.removeAttribute('data-contando'); if (reservar) { alvo.style.minWidth = ''; alvo.style.display = ''; } }
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
    /* o AI Core (js/nucleo/boot.js) só começa a se montar quando a arte
       aparece: antes disso ela está invisível e a montagem passaria sem
       ninguém ver (visto quadro a quadro) */
    alvoTl.add(function () { B.emit('arte-impressa'); }, t0);
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

  /* a cota mede a linha mais LARGA do h1 (Range sobre o texto já dividido),
     uma vez no boot e de novo a cada refresh; el.style uma vez, nunca por quadro */
  function medirCota(cota, titulo) {
    try {
      /* pelas PALAVRAS: o Range sobre o h1 dividido trazia as caixas das linhas
         (100% da largura) e a cota sempre ocupava a coluna inteira (revisão V4.8) */
      var esq = cota.getBoundingClientRect().left, dir = esq;   /* origem na cota: o h1 tem margem óptica negativa */
      var palavras = titulo.querySelectorAll('.split-word');
      if (palavras.length) {
        for (var p = 0; p < palavras.length; p++) dir = Math.max(dir, palavras[p].getBoundingClientRect().right);
      } else {
        var rg = document.createRange(); rg.selectNodeContents(titulo);
        var rs = rg.getClientRects();
        for (var i = 0; i < rs.length; i++) dir = Math.max(dir, rs[i].right);
      }
      var max = cota.parentNode.getBoundingClientRect().width;
      cota.style.width = Math.min(max, Math.max(48, dir - esq)) + 'px';
    } catch (e) { /* sem Range: a cota fica na largura do bloco */ }
  }
  if (ST) ST.addEventListener('refreshInit', function () {
    var c = document.querySelector('.hero__cota'), t = document.querySelector('.hero__title');
    if (c && t) medirCota(c, t);
  });

  /* "tinta molhada": a palavra fica ciano no instante em que a luz passa por
     ela e seca para o branco; a ênfase (em) fica ciano. Classe por palavra,
     nada por quadro; o ciano em texto continua só no H1 e na Conversa. */
  function tinta(tl, palavra, t) {
    tl.add(function () { palavra.classList.add('is-tinta'); }, t);
    if (!palavra.closest('em')) tl.add(function () { palavra.classList.remove('is-tinta'); }, t + .32);
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
    /* a logo: quando o feixe chega a ela, a luz passa pela logo uma vez (.is-lit, css/motion.css) */
    var marca = document.querySelector('.nav__logo .marca');
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
      var vw = window.innerWidth, vh = window.innerHeight;
      var fx = feixe ? feixe.getBoundingClientRect().left : 0;
      var topo = hero ? hero.getBoundingClientRect().top : 0;
      /* celular: a luz LÊ o título. Desce rápido até o topo do H1 (.22s),
         atravessa o H1 devagar (.85s) e sai (.4s). Antes cruzava o título em
         ~0,2s e não se lia como causa (rodada 7). h0/h1 relativos ao hero. */
      var tr = titulo ? titulo.getBoundingClientRect() : null;
      var h0 = tr ? tr.top - topo - 24 : 0, h1 = tr ? tr.bottom - topo + 24 : vh * .5;
      var T = largo ? 1.8 : 1.47;
      /* desktop: o instante em que o centro da faixa cruza um x da tela */
      var tFeixe = function (px) { return Math.max(0, Math.min(T, T * ((px - fx) / vw + .20) / 1.30)); };
      /* o instante de uma peça: no desktop a luz corre da esquerda para a
         direita; no celular ela desce, então conta a altura (e um passo
         pela esquerda, para as palavras de uma linha não subirem juntas) */
      var tEm = function (el, frac) {
        var r = el.getBoundingClientRect();
        if (largo) return tFeixe(r.left + r.width * (frac || 0));
        var meio = r.top + r.height * .5 - topo;
        if (meio > h1) return Math.min(1.2, 1.07 + (meio - h1) / vh * .6);   /* abaixo do título: logo depois que a luz sai dele */
        return Math.max(0, Math.min(1.07, .22 + (meio - h0) / Math.max(1, h1 - h0) * .85 + (r.left / vw) * .12));
      };

      var tl = gsap.timeline({ defaults: { ease: EXPO } });
      var tag = linha && linha.querySelector('.feixe__tag');
      if (tag && largo) {
        tl.fromTo(tag, { opacity: 0 }, { opacity: 1, duration: .2, ease: 'none' }, tFeixe(220));
        tl.to(tag, { opacity: 0, duration: .3, ease: 'none' }, tFeixe(vw * .8));
      }
      if (linha && largo) tl.fromTo(linha, { x: '-20vw' }, { x: '110vw', duration: T, ease: 'none' }, 0);
      if (linha && !largo) {
        tl.fromTo(linha, { y: '-15vh' }, { y: h0, duration: .22, ease: 'power2.in' }, 0);
        tl.to(linha, { y: h1, duration: .85, ease: 'none' }, .22);
        tl.to(linha, { y: vh * 1.1, duration: .4, ease: 'power2.in' }, 1.07);
        tl.to(linha, { opacity: 0, duration: .15, ease: 'none' }, 1.32);
      }
      if (nav) {
        tl.to(nav, { opacity: 1, duration: .5 }, 0);
        tl.from(nav.querySelectorAll('.nav__links > *'), { y: -8, opacity: 0, duration: .8, stagger: .05, clearProps: 'all' }, .15);
      }
      if (status) tl.fromTo(status, { y: 10 }, { opacity: 1, y: 0, duration: .8 }, .05);
      if (dot) tl.from(dot, { scale: 0, duration: .4, ease: 'back.out(2)', clearProps: 'transform' }, tEm(dot));
      if (marca) tl.add(function () {
        /* a passada do boot é uma só: quando a luz de saída termina, o .is-lit sai e daí em diante só o
           cursor ou o foco a repetem (com ele preso, tirar o cursor fazia a luz passar de novo) */
        var saida = marca.querySelector('.marca__pulso-out');
        if (saida) saida.addEventListener('animationend', function () { marca.classList.remove('is-lit'); }, { once: true });
        marca.classList.add('is-lit');
      }, tEm(marca));

      if (titulo) {
        var sp = partir(titulo, 'words');
        if (sp && sp.words && sp.words.length) {
          /* O TÍTULO É O LCP: 78% já pintado no primeiro quadro. Cada palavra
             sobe quando a luz chega nela; palavras na mesma coluna sobem
             juntas, em qualquer largura: a luz imprime colunas. */
          gsap.set(sp.words, { yPercent: 22 });   /* 78% já pintado no 1º quadro: a palavra ASSENTA, não sobe de baixo */
          gsap.set(titulo, { visibility: 'visible' });
          var ultimo = 0;
          for (var w = 0; w < sp.words.length; w++) {
            var tw = tEm(sp.words[w], .25);
            if (tw > ultimo) ultimo = tw;
            tl.to(sp.words[w], { yPercent: 0, duration: .9, ease: EXPO }, Math.max(0, tw - .04));
            tinta(tl, sp.words[w], tw);
          }
          /* SEM revert aqui: devolver os nós de texto ao h1 faz o Chrome re-registrar
             o título inteiro como LCP no fim da animação (medido: 0,9s → 2,5s no
             celular). As palavras ficam divididas; mostrarTudo() reverte se preciso. */
          tl.add(function () { titulo.classList.add('is-lit'); }, ultimo + .35);
        } else {
          tl.fromTo(titulo, { visibility: 'visible', opacity: .35, y: 16 }, { opacity: 1, y: 0, duration: .8, onComplete: function () { titulo.classList.add('is-lit'); } }, .05);
        }
      }

      /* o parágrafo é o LCP: entra cedo (no máx. 0,3s); esperar a luz chegar até ele custava 0,3s de LCP (medido no celular na rodada 3 e no desktop na 5, com o hero em largura total) */
      var tCol = sub ? Math.min(tEm(sub), .3) : .5;
      if (sub) tl.fromTo(sub, { y: 18 }, { opacity: 1, y: 0, duration: .9 }, tCol + .05);
      if (acoes) tl.fromTo(acoes, { y: 14 }, { opacity: 1, y: 0, duration: .9 }, tCol + .15);
      if (fine) tl.to(fine, { opacity: 1, duration: .7 }, tCol + .25);

      /* a COTA do H1: a luz desenha a linha de cota sob o título, de ponta a
         ponta da linha mais larga, e o rótulo conta até a 1ª pintura medida */
      var cota = document.querySelector('.hero__cota');
      if (cota && titulo && !cota.hidden) {
        medirCota(cota, titulo);
        var ticks = cota.querySelectorAll('.hero__cota-tick'), traco = cota.querySelector('.hero__cota-linha'), rotulo = cota.querySelector('.hero__cota-rot');
        var cr = cota.getBoundingClientRect();
        var tA = largo ? tFeixe(cr.left) : tEm(cota), tB = largo ? Math.max(tA + .3, tFeixe(cr.right)) : tA + .55;
        if (ticks[0]) tl.fromTo(ticks[0], { scaleY: 0 }, { scaleY: 1, duration: .3, ease: EXPO }, tA);
        if (traco) tl.fromTo(traco, { scaleX: 0 }, { scaleX: 1, duration: tB - tA, ease: largo ? 'none' : 'power3.inOut' }, tA);
        if (ticks[1]) tl.fromTo(ticks[1], { scaleY: 0 }, { scaleY: 1, duration: .3, ease: EXPO }, tB);
        if (rotulo) {
          tl.fromTo(rotulo, { opacity: 0 }, { opacity: 1, duration: .4, ease: 'power2.out' }, tB + .05);
          tl.add(function () { var b = rotulo.querySelector('b'); if (b) contar(b, .6, 0); }, tB + .05);
        }
      }

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
        if (linha) gsap.set(linha, { clearProps: 'transform,opacity' });
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
  /* chegando pela passagem (js/passagem.js), o boot espera a página começar a
     assentar: o fio atravessando o hero não passa enquanto ela ainda está longe */
  /* (no Sites o site chega numa janela que cresce, css/passagem-destinos.css: o texto se imprime cedo, dentro dela) */
  var heroQuando = function () {
    if (!html.classList.contains('passagem-chega')) return heroEntra();
    setTimeout(heroEntra, html.classList.contains('chega-sites') ? 150 : 360);
  };
  if (document.body.classList.contains('booted')) heroQuando();
  else B.on('booted', heroQuando);

  /* ---------- ENTRADAS POR SEÇÃO ----------
     O contêiner só esmaece; quem se move é o conteúdo. Laudo, passos, prova
     e spec não recebem tween nos filhos: a classe `is-in` basta, o CSS
     desenha régua, trilho, barra e marca (css/motion.css). O cabeçalho entra
     em três tempos (kicker, linhas do h2, lead) e a ênfase do h2 acende. */
  var jaRevelou = false;
  var pousoAte = 0;   /* até quando o snap do palco espera (link direto com âncora) */

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
  /* pousar numa âncora depois que os gatilhos existem: o pin estica a página
     depois da rolagem nativa. Alvo dentro do palco pousa na 1ª leitura (não
     no palco vazio). As revelações de cima mexem na altura: confere de novo
     enquanto a página assenta, se a pessoa não tiver rolado (revisões V4.7 e V4.8). */
  function yDe(alvo) {
    var folga = parseFloat(getComputedStyle(html).scrollPaddingTop) || 0;
    var y = alvo.getBoundingClientRect().top + window.scrollY - folga;
    var pin = ST && ST.getAll().filter(function (t) { return t.pin && t.pin.contains(alvo); })[0];
    if (pin) {
      var an = pin.animation, n0 = an && an.labels && an.labels.n0;
      y = pin.start + (n0 && an.duration() ? (pin.end - pin.start) * n0 / an.duration() : 0);
    }
    return Math.max(0, Math.round(y));
  }
  function dentroDePin(alvo) { return !!(ST && ST.getAll().filter(function (t) { return t.pin && t.pin.contains(alvo); })[0]); }
  function pousar(alvo, conferir) {
    pousoAte = Date.now() + 2500;
    var y = yDe(alvo);
    window.scrollTo({ top: y, behavior: 'instant' });
    if (!conferir) return;
    [900, 1800].forEach(function (ms) {
      setTimeout(function () {
        if (Math.abs(window.scrollY - y) > 2) return;
        if (ST) ST.refresh();
        y = yDe(alvo);
        pousoAte = Date.now() + 1500;
        window.scrollTo({ top: y, behavior: 'instant' });
      }, ms);
    });
  }
  /* clique interno numa âncora que cai dentro do palco (ex.: "Ver a prova"):
     a rolagem nativa parava no início do pin, com o palco vazio */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var alvo = null;
    try { alvo = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); } catch (er) { return; }
    if (!alvo || !dentroDePin(alvo)) return;
    e.preventDefault();
    if (history.pushState) history.pushState(null, '', '#' + alvo.id);
    pousar(alvo, false);
    /* (o preventDefault cancela o ponto de partida do foco: o Tab seguinte voltava ao hero) */
    if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
    try { alvo.focus({ preventScroll: true }); } catch (er) { /* navegador antigo */ }
  });
  function restaurarRolagem() {
    var navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var tipo = navEntry ? navEntry.type : '';
    /* link direto com âncora (/#conversa): a rolagem nativa acontece antes de
       os gatilhos existirem e cai no lugar errado (o pin estica a página
       depois). Refeita aqui, depois do refresh. */
    if (tipo === 'navigate' && location.hash.length > 1) {
      var alvo = null;
      try { alvo = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* hash inválido */ }
      if (alvo) pousar(alvo, true);
      return;
    }
    if (!rolagemPropria) return;
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
    var v = item.querySelector('[data-metrica="carga"], [data-metrica="peso"]');   /* os dados de pesquisa (#prova) já nascem escritos: contar de 0 faria 75 virar 0 e voltar */
    if (v) contar(v, .9, atraso || 0);
  }
  function luzMede(prova) {
    var luz = prova.querySelector('.varredura');
    var itens = visiveis(prova.querySelectorAll('.prova__item'));
    if (!luz || !itens.length) { itens.forEach(function (it) { it.classList.add('is-lit'); contarItem(it); }); return; }
    /* empilhada (celular): cada medida acende e conta quando ELA aparece, com
       uma luz descendo por ela; antes o 2º e o 3º contavam abaixo da dobra */
    if (window.innerWidth < 821 && ST) {
      itens.forEach(function (it) {
        ST.create({ trigger: it, start: 'top 78%', once: true, onEnter: function () { it.classList.add('is-lit'); contarItem(it, .15); } });
      });
      return;
    }
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
      if (sp && sp.lines.length) gsap.from(sp.lines, { yPercent: 135, duration: .95, delay: .25, stagger: .09, ease: EXPO, onComplete: function () { sp.revert(); h.classList.add('is-lit'); } });
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
    var celular = window.matchMedia('(max-width: 620px)').matches;
    var quando = function (el) { return tPassagem(el.getBoundingClientRect().left - cx.left, cx.width, w, T); };
    var tl = gsap.timeline();
    tl.fromTo(luz, { x: -w, opacity: 1 }, { x: cx.width, duration: T, ease: 'none' }, 0).set(luz, { opacity: 0 });
    if (regua) tl.fromTo(regua, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: T, ease: 'none' }, 0);
    if (kick) tl.fromTo(kick, { opacity: 0 }, { opacity: 1, duration: .5, ease: 'power2.out', clearProps: 'all' }, 0);
    var sp = partir(h, 'words');
    if (sp && sp.words && sp.words.length) {
      gsap.set(sp.words, { yPercent: 130 });
      /* a tinta só na ênfase: palavras ciano soltas pareciam destaque errado (rodada 8);
         no celular a frase se escreve na ordem de leitura, não pelo x da luz */
      sp.words.forEach(function (wd, i) {
        var t = celular ? .1 + i * Math.min(.07, (T * .8) / sp.words.length) : quando(wd);
        tl.to(wd, { yPercent: 0, duration: .7, ease: EXPO }, t);
        if (wd.closest('em')) tinta(tl, wd, t);
      });
      var em = h.querySelector('em');
      tl.add(function () { h.classList.add('is-lit'); }, em ? quando(em) + .1 : T);
      /* não é o LCP: o h2 volta ao DOM original no fim */
      tl.add(function () { try { sp.revert(); } catch (e) { /* já revertido */ } }, T + .8);
    } else h.classList.add('is-lit');
    if (lead) tl.fromTo(lead, { opacity: 0 }, { opacity: 1, duration: .5, ease: 'power2.out', clearProps: 'all' }, .45);
    if (btn) {
      /* a luz pousa no botão como mira que TRAVA: quatro cantos se fecham em
         volta dele (a mesma língua dos cantos dos painéis) e o brilho passa.
         O fio âmbar da rodada 6 parecia borda quebrada. Cantos criados uma vez. */
      var alvo = btn.parentNode.classList.contains('cta__alvo') ? btn.parentNode : null;
      if (!alvo) {
        alvo = document.createElement('span'); alvo.className = 'cta__alvo';
        btn.parentNode.insertBefore(alvo, btn); alvo.appendChild(btn);
        for (var c = 0; c < 4; c++) { var i = document.createElement('i'); i.className = 'btn__canto'; i.setAttribute('aria-hidden', 'true'); alvo.appendChild(i); }
      }
      var cantos = alvo.querySelectorAll('.btn__canto'), tBtn = quando(btn);
      tl.fromTo(cantos, { opacity: 0, x: function (k) { return k % 2 ? 6 : -6; }, y: function (k) { return k < 2 ? -6 : 6; }, scale: .6 },
        { opacity: 1, x: 0, y: 0, scale: 1, duration: .38, ease: EXPO, stagger: .04, clearProps: 'transform,translate,rotate,scale' }, tBtn);
      tl.add(function () { btn.classList.add('is-passou'); }, tBtn + .18);
    }
  }
  function de(tabela, el, padrao) { for (var k in tabela) if (el.matches(k)) return tabela[k]; return padrao; }
  /* a CHEGADA da pilha do celular (dono, 2026-10-16): no fichário (css/cartoes.css), o card que chega ao degrau dele
     acende (.is-foco: borda, número e letras) e o de baixo, coberto, apaga (.is-coberto). Só classes, uma vez por passagem; os gatilhos medem
     a PILHA (o card segurado pelo sticky mediria errado): o card k chega quando o topo da pilha está no degrau dele
     menos a distância natural do card ao topo da pilha */
  function pilhaChegadas() {
    var gatilhos = [], medidores = [], pintores = [], marcados = [];
    [].forEach.call(document.querySelectorAll('.pilha'), function (pilha) {
      var cards = [].filter.call(pilha.children, function (c) { return !c.classList.contains('estacao-vao'); });
      var nat = [];
      var medir = function () {
        var vao = parseFloat(getComputedStyle(pilha).rowGap) || 0, soma = 0;
        for (var k = 0; k < cards.length; k++) { nat[k] = soma; soma += cards[k].offsetHeight + vao; }
      };
      medir();
      ST.addEventListener('refreshInit', medir);
      medidores.push(medir);
      var daPilha = [];
      /* aceso, só o de cima (o último que chegou): os de baixo ficam cobertos, texto e realce apagados. Recalculado
         inteiro a cada troca: num salto de rolagem a ordem dos gatilhos não importa */
      var pintar = function () {
        var topo = -1;
        for (var k = 0; k < cards.length; k++) if (daPilha[k] && daPilha[k].isActive) topo = k;
        for (var j = 0; j < cards.length; j++) {
          cards[j].classList.toggle('is-foco', j === topo);
          cards[j].classList.toggle('is-coberto', j < topo);
        }
      };
      cards.forEach(function (card, k) {
        marcados.push(card);
        /* (fora do sticky, no zoom de 400 %, não há degrau: o gatilho nunca dispara) */
        var chega = function () { var s = getComputedStyle(card); return s.position === 'sticky' ? 'top ' + Math.round((parseFloat(s.top) || 0) - nat[k]) + 'px' : 'top -999999px'; };
        daPilha[k] = ST.create({ trigger: pilha, start: chega, end: 'bottom top', invalidateOnRefresh: true, onToggle: pintar });
        gatilhos.push(daPilha[k]);
      });
      pintar();
      ST.addEventListener('refresh', pintar);
      pintores.push(pintar);
    });
    return function () {
      gatilhos.forEach(function (g) { g.kill(); });
      medidores.forEach(function (m) { ST.removeEventListener('refreshInit', m); });
      pintores.forEach(function (p) { ST.removeEventListener('refresh', p); });
      marcados.forEach(function (c) { c.classList.remove('is-foco', 'is-coberto'); });
    };
  }
  function revelar(el, imediato) {
    marcar(el);
    if (el.matches(SEM_TWEEN)) return;
    /* (o espaço da estação, js/estacao.js, não entra na cascata dos cards) */
    var kids = el.matches(COM_FILHOS) ? [].filter.call(el.children, function (c) { return !c.classList.contains('estacao-vao'); }) : null;
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
        /* a rota (o ponto que anda pela rolagem) fica no celular e na tela estreita, onde os passos empilham (até 820 px,
           o mesmo corte do CSS dos passos). No desktop (dono, 2026-10-23) a linha corre UMA vez, da esquerda para a
           direita, e acende os quatro círculos em sequência: é o trilho de CSS (motion.css, .passos.is-in), que não
           depende de rolar; depois fica tudo aceso e parado */
        mm.add('(max-width: 820px) and (prefers-reduced-motion: no-preference)', function () {
          var desfazer = [].map.call(document.querySelectorAll('.passos'), rota).filter(Boolean);
          return function () { desfazer.forEach(function (f) { f(); }); };
        });
        /* a pilha do celular (css/cartoes.css, o fichário com chegada; dono, 2026-10-16): o card que assenta no degrau
           acende e o coberto apaga. Sem carga nem deslize: o movimento é só o do dedo */
        mm.add('(max-width: 720px) and (prefers-reduced-motion: no-preference)', function () {
          if (!ST || html.classList.contains('menos-movimento')) return;
          return pilhaChegadas();
        });
        /* celular: sem hover, o item no meio da tela é o "em foco" (índice âmbar,
           régua acesa). Classe por evento de rolagem, nada por quadro. */
        mm.add('(max-width: 860px) and (prefers-reduced-motion: no-preference)', function () {
          if (!ST || html.classList.contains('menos-movimento')) return;
          /* (até 720 px o aceso dos cards da pilha é da chegada, pilhaChegadas: este bloco não roda de novo ao girar o
             celular de 844 para 390, então a largura é lida na hora de cada troca, e os dois não disputam o .is-foco) */
          var estreito = window.matchMedia('(max-width: 720px)');
          /* (girando de volta para 844 o refresh do ScrollTrigger reacende o card do meio: docs/pecas/pilha-celular.mjs) */
          var itens = gsap.utils.toArray('.servico, .laudo__row, .celula, .passo, .cenario');
          itens.forEach(function (el) {
            var ehPilha = !!(el.parentElement && el.parentElement.classList.contains('pilha'));
            ST.create({ trigger: el, start: 'top 62%', end: 'bottom 38%',
              onToggle: function (st) { if (!(ehPilha && estreito.matches)) el.classList.toggle('is-foco', st.isActive); } });
          });
          return function () { itens.forEach(function (el) { el.classList.remove('is-foco'); }); };
        });
        mm.add('(min-width: 861px) and (prefers-reduced-motion: no-preference)', function () {
          var hero = document.querySelector('.hero');
          if (!hero || !ST) return;
          var arte = hero.querySelector('.hero__arte'), feixe = hero.querySelector('.feixe');
          /* o AI Core não tem paralaxe: a rede (js/rede.js) prende a constelação
             ao portal dele por posição calculada, sem ler layout por quadro */
          /* nem a Planta (/sites): é um controle (régua, botões, campo), e um controle que escorrega sob o mouse
             durante a rolagem erra o alvo; ela também mede a própria posição para a cota cair em pixel inteiro */
          if (arte && !arte.matches('.hero__arte--nucleo, .hero__arte--planta')) gsap.to(arte, { yPercent: -12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .8 } });
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
          if (!hero || !consoleEl || !consoleEl.offsetParent) return;   /* (no Hub o console fica oculto: nada de inclinar o invisível) */
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
      /* a página cresce DEPOIS da medição: o AI Core acende e o console do hero ganha a linha "núcleo aceso" (+24 px
         no Hub, js/nucleo/boot.js), uma faixa assenta (+11 px). Os gatilhos ficavam adiantados — na pilha do celular o
         card acendia ~24 px antes de assentar (medido em 2026-10-20 no Chrome; pendência do PR #44). Mudou a altura do
         documento: mede de novo depois que ela para de mudar e fora da rolagem (no meio dela, o palco preso do desktop
         dava solavanco). Janela redimensionada não conta: o ScrollTrigger já mede sozinho (revisão) */
      if (ST && 'ResizeObserver' in window) {
        var alturaMedida = document.documentElement.scrollHeight, janela = window.innerWidth + 'x' + window.innerHeight, remedir = 0;
        var medirDeNovo = function () {
          if (ST.isScrolling && ST.isScrolling()) { remedir = setTimeout(medirDeNovo, 250); return; }
          try { ST.refresh(); } catch (e) { if (window.console && console.warn) console.warn('[beyon] remedir:', e); }
          alturaMedida = document.documentElement.scrollHeight;
        };
        new ResizeObserver(function () {
          var h = document.documentElement.scrollHeight, j = window.innerWidth + 'x' + window.innerHeight;
          if (Math.abs(h - alturaMedida) < 1) return;
          if (j !== janela) { janela = j; alturaMedida = h; return; }
          clearTimeout(remedir);
          remedir = setTimeout(medirDeNovo, 200);
        }).observe(document.body);
      }
      restaurarRolagem();
    }
  }

  /* ---------- A ROTA: do problema ao sistema no ar (os passos) ----------
     O H1 vira caminho. Um traço nasce embaraçado (o problema), se desenha
     pelos nós do método conforme a rolagem (scrub) e termina num LED com
     "no ar". Um cometa de 48px corre na ponta. Cada etapa acende quando o
     traço chega nela (classe por evento). O SVG é criado aqui e medido no
     refresh; sem GSAP, com movimento reduzido ou no interruptor, nada disso
     existe e fica o trilho de CSS de sempre. Repinta só a caixa do SVG e só
     enquanto se rola (medido em fps.mjs). */
  var SVG = 'http://www.w3.org/2000/svg';
  var ROTA_ANTES = /[?&]rota=antes\b/.test(location.search);   /* (o desktop como era, para comparar) */
  var deLado = function () { return window.innerWidth >= 821; };
  function rota(passos) {
    if (!ST || html.classList.contains('menos-movimento')) return null;
    var nos = [].slice.call(passos.querySelectorAll('.passo'));
    if (nos.length < 2) return null;
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'rota'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var base = document.createElementNS(SVG, 'path'); base.setAttribute('class', 'rota__base');
    var cometa = document.createElementNS(SVG, 'path'); cometa.setAttribute('class', 'rota__luz');
    svg.appendChild(base); svg.appendChild(cometa);
    var fim = document.createElement('span'); fim.className = 'rota__fim'; fim.setAttribute('aria-hidden', 'true'); fim.textContent = 'no ar';
    passos.appendChild(svg); passos.appendChild(fim);
    if (/no ar/i.test(nos[nos.length - 1].textContent)) fim.classList.add('rota__fim--mudo');
    passos.classList.add('passos--rota');
    var L = 1, fr = [], COMETA = 48;
    function medir() {
      var box = passos.getBoundingClientRect();
      var horizontal = deLado();
      var pts = nos.map(function (no) { var r = no.getBoundingClientRect(); return horizontal ? { x: r.left - box.left + 5.5, y: r.top - box.top + 5.5 } : { x: r.left - box.left + 5.5, y: r.top - box.top + 10.5 }; });
      /* o caminho é montado nó a nó; guardar o trecho que termina em cada nó dá
         a fração exata em que ele é alcançado com uma medida por nó (a
         amostragem com getPointAtLength custava ~400 ms de tarefa longa e
         atrasava o LCP — medido na rodada 5) */
      var p0 = pts[0], d, ate = [];
      if (horizontal) {
        /* o embaraço nasce NO 1º nó (antes saía da coluna, à esquerda dela) */
        ate.push('M' + p0.x + ' ' + p0.y);
        d = 'M' + p0.x + ' ' + p0.y + ' q8 -12 16 0 t16 0 t16 0';
        if (ROTA_ANTES) {
          for (var i = 1; i < pts.length; i++) { d += ' H' + (pts[i].x - 24) + ' l8 -8 h8 l8 8'; ate.push(d); }
        } else {
          /* reta até cada nó: numa linha longa, o degrau parecia defeito (no celular, curta, ele é um traço de circuito) */
          for (var k = 1; k < pts.length; k++) { d += ' H' + pts[k].x; ate.push(d); }
        }
        d += ' h40';
      } else {
        d = 'M' + p0.x + ' ' + (p0.y - 72) + ' q12 8 0 16 t0 16 t0 16 L' + p0.x + ' ' + p0.y;
        ate.push(d);
        for (var j = 1; j < pts.length; j++) { d += ' V' + (pts[j].y - 24) + ' l8 8 v8 l-8 8'; ate.push(d); }
        /* termina abaixo do ÚLTIMO PASSO, numa faixa reservada: o "no ar" não cai em cima do texto */
        var ultP = nos[nos.length - 1].getBoundingClientRect();
        d += ' V' + Math.round(ultP.bottom - box.top + 20);
      }
      var parciais = ate.map(function (trecho) { base.setAttribute('d', trecho); return base.getTotalLength(); });
      base.setAttribute('d', d); cometa.setAttribute('d', d);
      L = base.getTotalLength();
      /* o cometa na mesma proporção do celular (~5% do caminho): 48 px sumiam em 1100 px */
      COMETA = horizontal && !ROTA_ANTES ? Math.max(48, Math.round(L * 0.08)) : 48;
      base.style.strokeDasharray = L + ' ' + L;
      cometa.style.strokeDasharray = COMETA + ' ' + L;
      fr = parciais.map(function (l) { return l / L; });
      var ponta = base.getPointAtLength(L);
      fim.style.left = ponta.x + 'px'; fim.style.top = ponta.y + 'px';
    }
    medir();
    ST.addEventListener('refreshInit', medir);
    var marcar = function (p) {
      for (var i = 0; i < nos.length; i++) nos[i].classList.toggle('is-alcancado', p >= fr[i] - .005);
      fim.classList.toggle('is-no-ar', p >= .985);
    };
    var prog = { p: 0 };
    var tw = gsap.fromTo(prog, { p: 0 }, { p: 1, ease: 'none', immediateRender: true,
      onUpdate: function () {
        base.style.strokeDashoffset = L - prog.p * L;
        cometa.style.strokeDashoffset = COMETA - prog.p * L;
        marcar(prog.p);
      },
      /* (funções: o ScrollTrigger reavalia no refresh, então girar a tela troca a régua junto com a geometria) */
      scrollTrigger: { trigger: passos, scrub: .6,
        start: function () { return deLado() && !ROTA_ANTES ? 'top 88%' : 'top 82%'; },
        end: function () { return deLado() && !ROTA_ANTES ? 'top 30%' : 'bottom 62%'; } } });
    base.style.strokeDashoffset = L; cometa.style.strokeDashoffset = COMETA;
    return function () {
      ST.removeEventListener('refreshInit', medir);
      if (tw.scrollTrigger) tw.scrollTrigger.kill();
      tw.kill();
      passos.classList.remove('passos--rota');
      nos.forEach(function (no) { no.classList.remove('is-alcancado'); });
      if (svg.parentNode) svg.parentNode.removeChild(svg);
      if (fim.parentNode) fim.parentNode.removeChild(fim);
    };
  }

  /* ---------- O PALCO DA PROVA (desktop, com movimento) ----------
     O momento de assinatura: a prova fica fixa na tela e a luz atravessa
     três vezes. Em cada passagem UMA borda conduz tudo: o centro da luz.
     À esquerda dela a leitura nova já está impressa, à direita a anterior
     ainda está; as duas máscaras são sempre complementares, para frente e
     para trás (rodada 5: duas larguras e duas durações deixavam dois números
     sobrepostos quando a rolagem parava no meio). As três máscaras têm a
     mesma largura, medida no refresh (el.style uma vez, nunca por quadro).
     Só transform/opacity; quickSetter na borda. Nada conta aqui. */
  function palco() {
    var prova = document.querySelector('.prova');
    var luz = prova && prova.querySelector('.varredura');
    var sec = prova && prova.closest('section');
    if (!ST || !luz || !sec || html.classList.contains('menos-movimento') || prova.offsetParent === null) return;
    prova.classList.add('prova--palco');
    var itens = visiveis(prova.querySelectorAll('.prova__item'));
    if (!itens.length) { prova.classList.remove('prova--palco'); return; }
    itens.forEach(function (it) { it.classList.add('is-lit'); });
    var indice = [].slice.call(prova.querySelectorAll('.prova__indice li'));
    var barra = prova.querySelector('.prova__barra');
    var W = 0, w = 0;
    var partes = itens.map(function (it) {
      var m = it.querySelector('.prova__mascara'), t = it.querySelector('.prova__tinta');
      return { m: m, t: t, rot: it.querySelector('.prova__rot'), sm: gsap.quickSetter(m, 'x', 'px'), st: gsap.quickSetter(t, 'x', 'px'), left: 0, wm: 0 };
    });
    var setLuz = gsap.quickSetter(luz, 'x', 'px');
    var mostrar = function (p, k) { p.sm(k - p.wm); p.st(p.wm - k); };   /* k px impressos a partir da esquerda */
    var apagar = function (p, k) { p.sm(k); p.st(-k); };                 /* k px apagados a partir da esquerda */
    /* medir pela largura de LAYOUT do número (offsetWidth ignora transform).
       O scrollWidth da máscara somava o deslocamento da tinta e crescia a cada
       refresh: legenda espremida e dois números sobrepostos (rodada 6). */
    function medir() {
      partes.forEach(function (p) { p.m.style.width = ''; p.sm(0); p.st(0); });
      var L = Math.ceil(Math.max.apply(null, partes.map(function (p) { return p.t.querySelector('.prova__val').offsetWidth; }))) + 8;
      var base = prova.getBoundingClientRect().left;
      partes.forEach(function (p) { p.m.style.width = L + 'px'; p.wm = L; p.left = p.m.getBoundingClientRect().left - base - (gsap.getProperty(p.m, 'x') || 0); });
      W = prova.clientWidth; w = luz.offsetWidth;
    }
    medir();
    partes.forEach(function (p) { mostrar(p, 0); });
    setLuz(-w);
    ST.addEventListener('refreshInit', medir);
    /* o número real chega DEPOIS da medida (o peso desta visita, por exemplo):
       passando de 999 KB ele ganha um dígito, fica mais largo que a máscara e
       a sobra do número anterior aparecia ("2 KB" fantasma, crítica da rede,
       rodada 4). Mudou o texto, mede e repinta (um quadro, coalescido) */
    if ('MutationObserver' in window) {
      /* só quando um número fica MAIS LONGO do que a máscara já mediu: encolher não transborda, e o fps
         alternando entre 2 e 3 dígitos (99 ↔ 100 num monitor de 100 Hz) remedia o palco com layout forçado
         (8 ms + 4 raízes de layout) a cada mudança, no meio da sobrecarga (trace, 2026-10-06) */
      var remedirPalco = 0, maximos = [];
      var tamanhoAgora = function () { return partes.map(function (p) { var v = p.t.querySelector('.prova__val'); return v ? v.textContent.length : 0; }); };
      maximos = tamanhoAgora();
      var mo = new MutationObserver(function () {
        var novo = tamanhoAgora(), cresceu = false;
        for (var k = 0; k < novo.length; k++) if (novo[k] > (maximos[k] || 0)) { cresceu = true; maximos[k] = novo[k]; }   /* (gravado antes: com o rAF pendente, a próxima mutação não remede de novo) */
        if (remedirPalco || !cresceu) return;
        remedirPalco = requestAnimationFrame(function () { remedirPalco = 0; medir(); pintar(tl.time()); });
      });
      partes.forEach(function (p) { var v = p.t.querySelector('.prova__val'); if (v) mo.observe(v, { childList: true, subtree: true, characterData: true }); });
    }
    var total = partes.length, atual = 0;
    var tl = gsap.timeline({
      /* o índice segue a timeline (já com o atraso do scrub), não a rolagem */
      onUpdate: function () {
        pintar(tl.time());
        var n = 1;
        for (var k = 1; k < total; k++) if (tl.time() >= k * 1.4 + .5) n = k + 1;
        if (n === atual) return;
        atual = n;
        indice.forEach(function (li, j) { li.classList.toggle('is-atual', j === n - 1); });
      },
      scrollTrigger: {
        trigger: sec, start: 'center center', end: '+=150%', pin: true, scrub: .5, refreshPriority: 1,
        /* snap direcional pelos rótulos, exceto logo depois de um link direto
           (pousoAte): o refresh da reconferência disparava o snap e puxava a
           página de volta para o palco vazio */
        snap: { snapTo: function (v, self) {
          if (Date.now() < pousoAte || !tl.duration()) return v;
          var marcas = Object.keys(tl.labels).map(function (k) { return tl.labels[k] / tl.duration(); });
          return ST.snapDirectional(marcas)(v, self.direction);
        }, duration: { min: .2, max: .5 }, ease: 'power2.inOut', delay: .1, inertia: false }
      }
    });
    /* o intervalo do pin, para a rede (js/rede.js): enquanto o palco está
       preso, o texto dele fica parado na tela e a zona protegida também */
    var publicarPino = function () { var st = tl.scrollTrigger; if (st) B.pino = { el: sec, inicio: st.start, fim: st.end }; };
    publicarPino();
    ST.addEventListener('refresh', publicarPino);
    /* um rótulo no começo: rolar para cima a partir da 1ª leitura sai do palco, não volta a ela */
    tl.addLabel('inicio', 0);
    /* UMA função pinta as três máscaras e a luz a partir do tempo da timeline
       (revisão da V4.6: com um onUpdate por passagem, rebobinar deixava o
       número anterior inteiro e dois apareciam juntos na primeira chegada).
       Na passagem i a borda é o centro da luz: à esquerda o número i
       impresso, à direita o i-1 ainda inteiro; o resto escondido. */
    var FIM = (total - 1) * 1.4 + 1;
    function pintar(t) {
      var i = gsap.utils.clamp(0, total - 1, Math.floor(t / 1.4));
      var e = gsap.utils.clamp(0, 1, t - i * 1.4);
      var cx = e * (W + w) - w / 2;
      setLuz(cx - w / 2);
      partes.forEach(function (p, j) {
        if (j === i) mostrar(p, gsap.utils.clamp(0, p.wm, cx - p.left));
        else if (j === i - 1) apagar(p, gsap.utils.clamp(0, p.wm, cx - p.left));
        else mostrar(p, 0);
      });
    }
    tl.to({}, { duration: FIM, ease: 'none' }, 0);   /* dá à timeline a duração das três passagens */
    partes.forEach(function (p, i) {
      var s = i * 1.4, ant = partes[i - 1];
      var meio = s + (p.left + p.wm / 2 + w / 2) / (W + w);
      if (p.rot) tl.fromTo(p.rot, { opacity: 0 }, { opacity: 1, duration: .3, ease: 'power2.out', immediateRender: true }, meio);
      if (ant && ant.rot) tl.fromTo(ant.rot, { opacity: 1 }, { opacity: 0, duration: .2, ease: 'power2.in', immediateRender: false }, s + (ant.left + w / 2) / (W + w));
      tl.addLabel('n' + i, Math.min(s + 1.05, FIM));   /* o último rótulo dentro da timeline (antes o snap passava 18px do pin) */
    });
    if (barra) tl.fromTo(barra, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: tl.duration() }, 0);
    /* depois de cada refresh (larguras novas) a timeline é repintada do zero
       até onde estava: os x antigos nunca convivem com a largura nova */
    /* no refresh o pin já foi reaplicado: mede de novo (W velho deixava a luz
       parada no meio depois de redimensionar) e pinta o estado atual */
    function repintar() { medir(); pintar(tl.time()); }
    pintar(0);
    ST.addEventListener('refresh', repintar);
    return function () {
      ST.removeEventListener('refreshInit', medir);
      ST.removeEventListener('refresh', repintar);
      /* (saindo do desktop: nada do palco pode seguir medindo/pintando, nem a rede achar que #prova está presa) */
      ST.removeEventListener('refresh', publicarPino);
      if (mo) mo.disconnect();
      if (remedirPalco) cancelAnimationFrame(remedirPalco);
      if (B.pino && B.pino.el === sec) B.pino = null;
      prova.classList.remove('prova--palco');
      partes.forEach(function (p) { p.m.style.width = ''; });
      var limpar = [luz, barra].concat(partes.map(function (p) { return p.m; }), partes.map(function (p) { return p.t; }), partes.map(function (p) { return p.rot; })).filter(Boolean);
      gsap.set(limpar, { clearProps: 'opacity,transform' });
      indice.forEach(function (li) { li.classList.remove('is-atual'); });
    };
  }
  /* liga depois do boot: não revela cedo demais nem compete com o hero */
  var ligar = function () {
    /* chegando pela passagem, <main> ainda está em escala: mede só depois que ela assenta (js/passagem.js) */
    if (html.classList.contains('passagem-chega') && B.on) B.on('passagem:chegou', function () { setTimeout(scrollReveals, 120); });
    else setTimeout(scrollReveals, 120);
  };
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
