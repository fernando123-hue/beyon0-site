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
   frase inteira). Dois efeitos (dono, 2026-10-05: "esse efeito das letras
   fique somente nos cards que possuem o AI Core médio; os que não tiverem
   conectados a ele, outro efeito, com uma transição suave que permita que as
   letras fiquem acesas"):
   - nos cards de uma ESTAÇÃO viva (desktop): a ONDA de luz, letra por letra —
     cada uma acende e dá um pulinho (no máximo uma a cada LETRAS.cada s);
   - nos demais (e em todos no celular, onde não há estação): ACENDER — a
     linha de luz que atravessa o card no 100% acende as letras POR ONDE PASSA
     (um pico de luz e a letra assenta acesa), todas as linhas juntas, como
     uma frente; elas ficam ACESAS (.is-acesas) — também depois de o card
     descarregar (dono, 2026-10-05: "eu quero que as letras fiquem acesas"). A vez de cada letra (--dx) vem da posição
     dela no card e da curva da linha (crítica: em ordem de leitura, a metade
     acesa durava ~2,6 s, descasada da linha, e parecia texto em negrito).
   CELULAR (dono, 2026-10-05: "transição mais suave, um pouco mais lenta, mais
   perceptível"): a carga da pilha CORRE ATRÁS da rolagem (seguir) em vez de
   saltar com ela — até um deslizar rápido mostra a barra enchendo.
   SOBRECARGA (js/estacao.js, com o mini conectado ao AI Core médio): o card
   fica preso em 100% com a moldura neon acesa (parada), uma luz circulando
   pela borda, a barra em "MAX" e a onda de letras percorrendo o GRUPO card a
   card, sem parar (uma FILA por estação: a onda do seguinte só começa quando a
   do anterior acabou, com LETRAS.folga s entre elas). Medido em 2026-10-06 no
   Chrome real: as quatro ondas juntas (553 letras, quatro relógios de 2,4 s em
   fase) derrubavam a sobrecarga de 99 para 40 fps (mínimo 6; 42 quadros acima
   de 33 ms em 6 s) e sem as letras ela ficava em 99 fps. Cada letra animando
   (cor ou transform, tanto faz) custa estilo e pintura por quadro: o que pesa
   é quantas animam AO MESMO TEMPO, então uma de cada vez.
   A TRANSIÇÃO até ela (dono, 2026-10-04: "crie um estado de transição nesse
   espaço de tempo, para não ser algo que acontece do nada"), em três atos:
   1) PRESSÃO (pressao): enquanto o mini enche a estação, ela empurra a carga
      do card por baixo — um piso que sobe até PRESSAO.teto — e na reta final
      a porcentagem acende (.is-pressao);
   2) IGNIÇÃO (sobrecarga sim): quando o surto da conexão chega à porta do
      card, a carga vai de onde está a 100% em IGNICAO s, a porcentagem conta,
      a borda acende junto e uma LUZ começa a CIRCULAR pela borda (.is-ignicao);
   3) a SOBRECARGA entra com a linha de luz e a onda de letras; a luz segue
      circulando, devagar (dono, 2026-10-05: "tire o piscar por energia
      transitando pelas bordas de forma bem suave e discreta/minimalista").
   Na volta (sobrecarga não) ela ESFRIA: a carga desce de 100% até onde o
   cursor a deixaria em ESFRIA s, sem salto (.is-esfria).
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
  /* o texto que vira letras; LETRAS: ver abaixo */
  var TEXTOS = 'h3, p, .servico__link, .celula__link, .laudo__n, .servico__n, .celula__n';
  /* passo: ms entre uma letra e a seguinte (com teto para o card inteiro); dura: a duração da animação de cada
     letra (letra-luz em css/cartoes.css); folga: s entre a onda de um card e a do próximo na fila da sobrecarga;
     lote: ms de janela em que as palavras arrancam juntas. A onda ARRANCA POR PALAVRA (timers curtos), não
     pelo card: ligar 139 animações num quadro só custava 13 ms de estilo + 10 de pintura (trace, 2026-10-06);
     por palavra são ~6 de cada vez. O passo de 15 ms (antes caía a 10,8 nos cards de 139 letras) deixa ~25
     letras animando ao mesmo tempo em vez de 35: o custo por quadro é proporcional a esse número */
  var LETRAS = { cada: 3.5, passo: 15, teto: 2600, dura: 0.38, folga: 0.45, lote: 80, primeira: 0.7 };   /* primeira: s até a 1ª onda da fila (a ignição dos 4 cards assenta antes) */
  /* seguir a rolagem (celular): /s proporcional à distância, com piso e teto (enche inteiro em ~0,9 s, sem a cauda
     longa de uma exponencial pura) */
  var SEGUE = { k: 4, min: 0.35, max: 2.2 };
  /* cheio entra em 99,5% e só sai abaixo de 90%: um recuo mínimo do dedo não apaga e reacende tudo */
  var CHEIO = { entra: 0.995, sai: 0.9 };
  /* a linha que atravessa o card no 100% (css/cartoes.css, carga-varre): s no desktop e no celular; a curva dela;
     quanto antes da passagem a animação da letra começa (o pico, 6% de 1,2 s, cai em cima da linha) */
  var VARRE = { desktop: 0.7, celular: 1.15, curva: [0.3, 0, 0.2, 1], pico: 0.072 };
  var estreito = window.matchMedia('(max-width: 720px)');
  /* a transição até a sobrecarga: s de ignição e de esfriar; teto do piso da pressão e de onde os cantos tremem */
  var IGNICAO = 0.9, ESFRIA = 0.6, PRESSAO = { teto: 0.82, acende: 0.6 };
  var CIRCULA = { vel: 170 };   /* px/s da luz que percorre a borda (um traço só, dando a volta) */
  var reduz = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- a peça ---------- */
  function montar(card, op) {
    var c = card._carga;
    if (c && op && op.doador) c.doador = op.doador;
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
    var camada = function (classe, n, tag) {
      var el = document.createElement('i'); el.className = classe; el.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < n; k++) el.appendChild(document.createElement(tag || 'b'));
      card.appendChild(el); return el;
    };
    /* os oito braços dos cantos, a borda neon e os pontos que correm */
    var bracos = camada('carga-cantos', 8), halo = camada('carga-halo', 0);
    camada('carga-nos', 4);
    /* base: a carga pedida (cursor ou pilha); piso: o mínimo imposto pela estação (pressão, ignição, esfriar) */
    c = card._carga = { doador: op && op.doador, card: card, tubo: tubo, pct: pct, txt: pct.firstChild, fio: fio, p: -1, num: 0, cheio: false, bracos: bracos.children, halo: halo, base: 0, piso: 0, rampa: null, pediu: false };
    card.classList.add('tem-carga');
    return c;
  }
  /* a carga (0–1): o tubo, a porcentagem e as classes, só quando mudam */
  function definir(card, p) {
    var c = card._carga || montar(card);
    c.base = p;
    if (c.sobre) p = 1;   /* em sobrecarga fica em 100%, quem comanda é a estação */
    else if (c.piso > p) p = c.piso;
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    /* só redesenha quando a carga muda ao menos 1% (a 0,2%, cada pixel de rolagem reescrevia o tubo e os 8 cantos) */
    if (Math.abs(p - c.p) >= 0.01 || (p >= 0.995) !== (c.p >= 0.995) || (p <= 0 && c.p > 0)) { c.tubo.style.transform = 'translate3d(' + ((p - 1) * 100).toFixed(2) + '%,0,0)'; c.p = p; variar(c, p); }
    /* cheio (a histerese o mantém até 90%): o número fica em 100%, sem contradizer o card aceso */
    var n = c.cheio && p >= CHEIO.sai ? 100 : Math.round(p * 100);
    /* nodeValue, não textContent: trocar o nó acionava o MutationObserver da rede (js/rede.js), que remedia a página inteira a cada número (revisão) */
    if (n !== c.num && !c.sobre) { c.txt.nodeValue = n + '%'; c.num = n; }
    var cheio = c.cheio ? p >= CHEIO.sai : p >= CHEIO.entra;
    var carregando = p > 0.004 && !cheio;
    if (carregando !== card.classList.contains('is-carregando')) card.classList.toggle('is-carregando', carregando);
    /* (pilha) a energia desce do card da frente enquanto ESTE carrega — a carga mostrada, não a rolagem crua:
       num deslizar rápido o fio parava antes de a barra chegar (crítica) */
    if (c.doador && carregando !== c.doador.classList.contains('is-doando')) c.doador.classList.toggle('is-doando', carregando);
    if (cheio !== c.cheio) {
      c.cheio = cheio;
      card.classList.toggle('is-carregado', cheio);
      /* cheio, a luz circula pela borda (dono, 2026-10-06: "uma coisa só, com energia circulando") */
      if (cheio && !B.reduced && !reduz.matches) circular(c);
      /* (na ignição, a linha e as letras ficam para a entrada da sobrecarga, logo em seguida) */
      if (cheio && !(c.rampa && c.pediu)) { varrer(card); if (daEstacao(card)) letras(card); else acender(card, true); }
      /* (acesas ficam: o card que já acendeu não apaga ao descarregar — dono, 2026-10-05: "eu quero que as letras fiquem acesas") */
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
  /* parte o texto do card em letras, uma vez (o leitor de tela lê a cópia, ver partir); a seta (aria-hidden) fica
     de fora; o atraso de cada letra é distribuído pelo card inteiro (com teto, as últimas piscavam juntas) */
  /* o texto vai sempre para um span só, e é ELE que se parte: num alvo em flex ou grid (o h3 dos itens do padrão,
     com o losango ao lado) cada palavra partida virava um item separado, espremido até quebrar no meio
     ("Fe/ito prim/eiro"); e o span é o que se esconde do leitor de tela, com a cópia legível ao lado dele, no pai */
  /* o texto como o leitor de tela o lê: sem o que é aria-hidden (a seta "→", o número decorativo); vazio se o
     próprio elemento já está fora da árvore. Lido ANTES de partir (o span partido vira aria-hidden) */
  function textoLido(el) {
    if (el.closest('[aria-hidden="true"]')) return '';
    var t = '';
    (function andar(no) {
      for (var f = no.firstChild; f; f = f.nextSibling) {
        if (f.nodeType === 3) t += f.nodeValue;
        else if (f.nodeType === 1 && f.getAttribute('aria-hidden') !== 'true') andar(f);
      }
    })(el);
    return t.replace(/\s+/g, ' ').trim();
  }
  function embrulhar(el) {
    var span = document.createElement('span');
    span.className = 'carga-embrulho';
    while (el.firstChild) span.appendChild(el.firstChild);
    el.appendChild(span);
    return span;
  }
  function partir(card) {
    var c = card._carga;
    if (!c || !window.SplitText) return false;
    if (c.split) return true;
    var pais = [].filter.call(card.querySelectorAll(TEXTOS), function (el) { return !el.closest('.carga') && el.textContent.trim(); });
    var textos = pais.map(textoLido), alvos = pais.map(embrulhar);
    if (!alvos.length) return false;
    try {
      c.split = new window.SplitText(alvos, { type: 'words,chars', tag: 'span', aria: 'none', ignore: '[aria-hidden="true"]', charsClass: 'carga-letra', wordsClass: 'carga-palavra' });
    } catch (e) { c.split = { chars: [], words: [] }; c.ondas = []; return false; }
    for (var k = 0; k < alvos.length; k++) {
      alvos[k].setAttribute('data-carga-split', '');
      /* letras em caixas separadas são lidas "S i t e s" (árvore de acessibilidade do Chrome, 2026-10-06): um padrão
         só para título, link, parágrafo e número (auditoria 2026-10-09): o span partido sai da árvore e o pai ganha
         uma cópia inteira só para o leitor de tela. Antes o título e o link levavam aria-label (proibido em span
         genérico) e o parágrafo se escondia junto com a própria cópia. Quem já era aria-hidden não ganha cópia */
      alvos[k].setAttribute('aria-hidden', 'true');
      if (!textos[k]) continue;
      var copia = document.createElement('span'); copia.className = 'sr-only'; copia.textContent = textos[k]; pais[k].appendChild(copia);
    }
    var n = c.split.chars.length, passo = n ? Math.min(LETRAS.passo, LETRAS.teto / n) : 0, palavras = c.split.words, g = 0;
    /* a vez de cada palavra (ms desde o arranque da onda) e, dentro dela, a de cada letra (--d, relativo à palavra) */
    c.ondas = [];
    for (var p = 0; p < palavras.length; p++) {
      var ls = palavras[p].getElementsByClassName('carga-letra');
      c.ondas.push({ el: palavras[p], t: Math.round(g * passo) });
      for (var i = 0; i < ls.length; i++) ls[i].style.setProperty('--d', Math.round(i * passo) + 'ms');
      g += ls.length;
    }
    c.onda = n * passo / 1000 + LETRAS.dura;   /* s que a onda inteira leva (a fila da sobrecarga espera por ela) */
    return true;
  }
  /* partir ANTES, com o navegador ocioso: os cards fora da tela (o pulo de layout, kerning entre caixas, não é
     visto) e TODOS os cards de uma estação, estejam onde estiverem — UM por folga do navegador. Antes, quem
     descia até Garantias logo depois de carregar chegava com os cards inteiros e o corte dos quatro caía no
     instante do encaixe do mini (4 tarefas de 19–22 ms em 230 ms com a CPU 4× mais lenta: a "trava" que o
     dono viu, 2026-10-06). Num card na tela o pulo é de ~1 px, uma vez; a trava na coreografia era pior. */
  var adiantou = false, ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 200); };
  function adiantar() {
    if (adiantou || B.reduced || reduz.matches || !window.SplitText) return;
    adiantou = true;
    var fila = [].filter.call(document.querySelectorAll('.tem-carga'), function (card) {
      var r = card.getBoundingClientRect();
      return card.closest('.tem-estacao') || r.bottom < -40 || r.top > window.innerHeight + 40;
    });
    (function proximo() {
      if (!fila.length) return;
      var card = fila.shift(), c = card._carga;
      partir(card);
      /* (a luz que circula dos cards de estação nasce aqui também: antes era criada, para os quatro, no quadro do encaixe) */
      if (c && !c.circula && card.closest('.tem-estacao') && !B.reduced && !reduz.matches) circular(c);
      ocioso(proximo, { timeout: 1500 });
    })();
  }
  B.on('rede:medida', function () { setTimeout(adiantar, 600); });
  /* o card é de uma estação viva (o grupo .tem-estacao.is-ligada, js/estacao.js: só desktop com mouse)? */
  function daEstacao(card) { return !!card.closest('.tem-estacao.is-ligada'); }
  /* ACENDER: as letras clareiam cada uma na sua vez e ficam acesas (css/cartoes.css, .is-acesas) */
  function acender(card, sim) {
    if (sim === card.classList.contains('is-acesas')) return;
    if (sim && (B.reduced || reduz.matches || !partir(card))) return;
    if (sim) passagem(card._carga);
    card.classList.toggle('is-acesas', sim);
  }
  /* o tempo (fração da duração) em que a linha chega à fração f da largura: a curva cubic-bezier dela invertida */
  function quandoChega(f) {
    var k = VARRE.curva, lo = 0, hi = 1, s = 0.5;
    var bez = function (a, b, t) { var m = 1 - t; return 3 * m * m * t * a + 3 * m * t * t * b + t * t * t; };
    for (var i = 0; i < 22; i++) { s = (lo + hi) / 2; if (bez(k[1], k[3], s) < f) lo = s; else hi = s; }
    return bez(k[0], k[2], s);
  }
  /* --dx de cada letra: quando a linha passa por ela (lido uma vez por largura do card; a medida da página invalida) */
  function passagem(c) {
    var card = c.card, W = card.offsetWidth, T = estreito.matches ? VARRE.celular : VARRE.desktop;
    if (!W || (c.dxW === W && c.dxT === T) || !c.split || !c.split.chars.length) return;
    c.dxW = W; c.dxT = T;
    var x0 = card.getBoundingClientRect().left, letras = c.split.chars, xs = [], i;
    for (i = 0; i < letras.length; i++) { var r = letras[i].getBoundingClientRect(); xs.push((r.left + r.width / 2 - x0) / W); }
    for (i = 0; i < letras.length; i++) {
      var fx = xs[i] < 0 ? 0 : xs[i] > 1 ? 1 : xs[i];
      /* (nunca negativo: a letra da borda começaria no meio da subida, num salto) */
      letras[i].style.setProperty('--dx', Math.max(0, T * quandoChega(fx) - VARRE.pico).toFixed(3) + 's');
    }
  }
  B.on('rede:medida', function () { var cs = document.querySelectorAll('.tem-carga'); for (var i = 0; i < cs.length; i++) if (cs[i]._carga) cs[i]._carga.dxW = 0; });
  /* a onda de luz pelas letras do card (reinicia alternando -a/-b, sem ler layout); devolve quanto ela dura (s) */
  function letras(card, forcar) {
    if (B.reduced || reduz.matches || !window.SplitText) return 0;
    var c = card._carga, agora = performance.now();
    if (!c || (!forcar && agora - (c.letrasEm || -1e9) < LETRAS.cada * 1000)) return 0;
    c.letrasEm = agora;
    if (!partir(card) || !c.ondas || !c.ondas.length) return 0;
    card.classList.remove('is-acesas');   /* (um card aceso antes de a estação ligar: agora é dela, a onda) */
    pararOnda(c);
    /* cada palavra arranca na sua vez (alternando -a/-b: a animação reinicia sem ler layout), em lotes de LETRAS.lote ms */
    c.ondaLado = !c.ondaLado;
    var liga = c.ondaLado ? 'is-luz-a' : 'is-luz-b', desliga = c.ondaLado ? 'is-luz-b' : 'is-luz-a', lotes = {}, k;
    for (var i = 0; i < c.ondas.length; i++) { k = Math.floor(c.ondas[i].t / LETRAS.lote) * LETRAS.lote; (lotes[k] || (lotes[k] = [])).push(c.ondas[i].el); }
    c.ondaTimers = [];
    for (k in lotes) c.ondaTimers.push(setTimeout(arrancar, +k, lotes[k], liga, desliga));
    return c.onda || LETRAS.dura;
  }
  function arrancar(els, liga, desliga) { for (var i = 0; i < els.length; i++) { els[i].classList.remove(desliga); els[i].classList.add(liga); } }
  function pararOnda(c) {
    if (!c.ondaTimers) return;
    for (var i = 0; i < c.ondaTimers.length; i++) clearTimeout(c.ondaTimers[i]);
    c.ondaTimers = null;
  }
  /* A FILA da sobrecarga: por grupo (.tem-estacao), uma onda de cada vez, na ordem do HTML, dando voltas;
     um card que sai (esfria) sai da fila sem parar a dos outros; a fila some com o último */
  var filas = [];
  function filaDe(card) {
    var g = card.closest('.tem-estacao') || card;
    for (var k = 0; k < filas.length; k++) if (filas[k].g === g) return filas[k];
    var f = { g: g, cards: [], ultimo: null, timer: 0 };
    filas.push(f);
    return f;
  }
  function enfileirar(card) {
    var f = filaDe(card);
    if (f.cards.indexOf(card) >= 0) return;
    f.cards.push(card);
    f.cards.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });   /* (na ordem da página) */
    if (!f.timer) f.timer = setTimeout(function () { proximaOnda(f); }, LETRAS.primeira * 1000);   /* (a 1ª onda espera a ignição assentar) */
  }
  function desenfileirar(card) {
    if (card._carga) pararOnda(card._carga);
    var f = filaDe(card), i = f.cards.indexOf(card);
    if (i >= 0) f.cards.splice(i, 1);
    if (!f.cards.length) { clearTimeout(f.timer); f.timer = 0; filas.splice(filas.indexOf(f), 1); return; }
    /* saiu o card cuja onda estava tocando: a vez passa já para o seguinte (sem esperar a onda dele acabar) */
    if (f.ultimo === card) { clearTimeout(f.timer); f.ultimo = f.cards[i > 0 ? i - 1 : f.cards.length - 1]; proximaOnda(f); }
  }
  /* o seguinte ao último que tocou, na ordem da página (por referência, não por índice: a ordem de entrada é a
     da ignição, por distância, e o sort ao enfileirar embaralharia um índice) */
  function proximaOnda(f) {
    f.timer = 0;
    if (!f.cards.length) return;
    var card = f.cards[(f.cards.indexOf(f.ultimo) + 1) % f.cards.length];
    f.ultimo = card;
    var dura = letras(card, true);
    if (!dura) return;   /* (movimento reduzido ou sem SplitText: nada a repetir; a estação solta os cards nesse caso) */
    f.timer = setTimeout(function () { proximaOnda(f); }, (dura + LETRAS.folga) * 1000);
  }
  /* parte em letras antes da hora, com o navegador ocioso (a estação acoplou: a ignição vem em ~3 s e não
     deve pagar o SplitText de quatro cards no mesmo quadro) */
  function preparar(card) {
    if (B.reduced || reduz.matches || !window.SplitText || !card._carga || card._carga.split) return;
    ocioso(function () { partir(card); }, { timeout: 800 });
  }
  /* ---------- a transição até a sobrecarga (js/estacao.js) ---------- */
  /* PRESSÃO: a estação enchendo (v de 0 a 1) empurra a carga por baixo */
  function pressao(card, v) {
    var c = card._carga || montar(card);
    if (c.pediu || c.rampa) return;   /* em ignição, sobrecarga ou esfriando, quem manda é a rampa */
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    c.piso = v * PRESSAO.teto;
    var acende = v >= PRESSAO.acende;
    if (acende !== card.classList.contains('is-pressao')) card.classList.toggle('is-pressao', acende);
    /* a luz que circula nasce já aqui, apagada: na ignição ela entra com fade (criada no mesmo quadro, não tinha) */
    if (v > 0 && !c.circula && !B.reduced && !reduz.matches) circular(c);
    definir(card, c.base);
  }
  /* uma rampa do piso: de onde a carga está até `para` em `dura` s (senoide), e depois `fim` */
  var rampas = [];
  function rampa(c, para, dura, fim) {
    c.rampa = { de: c.p < 0 ? 0 : c.p, para: para, t: 0, dura: dura, fim: fim };
    if (rampas.indexOf(c) < 0) rampas.push(c);
  }
  /* SEGUIR (a pilha do celular, js/anima.js): o alvo vem da rolagem; a carga mostrada corre atrás dele */
  var seguindo = [];
  function seguir(card, alvo, ja) {
    var c = card._carga || montar(card);
    alvo = alvo < 0 ? 0 : alvo > 1 ? 1 : alvo;
    c.alvo = alvo;
    if (c.mostra === undefined) c.mostra = c.p < 0 ? 0 : c.p;
    if (ja || B.reduced || reduz.matches) {
      c.mostra = alvo;
      var i = seguindo.indexOf(c); if (i >= 0) seguindo.splice(i, 1);
      definir(card, alvo);
      return;
    }
    if (seguindo.indexOf(c) < 0) seguindo.push(c);
  }
  function correr(dt) {
    for (var i = seguindo.length - 1; i >= 0; i--) {
      var c = seguindo[i], d = c.alvo - c.mostra, passo = Math.min(SEGUE.max, Math.max(SEGUE.min, Math.abs(d) * SEGUE.k)) * dt;
      if (Math.abs(d) <= passo) { c.mostra = c.alvo; seguindo.splice(i, 1); }
      else c.mostra += d > 0 ? passo : -passo;
      try { definir(c.card, c.mostra); }
      catch (e) { if (window.console && console.warn) console.warn('[beyon] carga-seguir:', e); }
    }
  }
  /* (sempre no laço; sem rampa, sai na primeira linha: tirar do laço no meio do quadro pularia o vizinho) */
  B.add('carga-rampa', function (S) {
    if (seguindo.length) correr(Math.min(0.05, S.dt / 1000));
    if (!rampas.length) return;
    var dt = Math.min(0.05, S.dt / 1000);
    for (var i = rampas.length - 1; i >= 0; i--) {
      var c = rampas[i], r = c.rampa;
      if (!r) { rampas.splice(i, 1); continue; }
      r.t += dt;
      var k = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, r.t / r.dura));
      c.piso = r.de + (r.para - r.de) * k;
      var acabou = r.t >= r.dura;
      if (acabou) { c.rampa = null; rampas.splice(i, 1); }
      /* (um card que falha não para os outros nem fica com a rampa presa: o laço sairia em 3 quadros) */
      try { definir(c.card, c.base); if (acabou && r.fim) r.fim(c); }
      catch (e) { if (window.console && console.warn) console.warn('[beyon] carga-rampa:', e); }
    }
  });
  /* a LUZ QUE CIRCULA pela borda: quatro lados recortados, cada um com uma faixa do tamanho do PERÍMETRO e o
     traço na ponta dela; as quatro andam juntas (transform em % da própria faixa: compositor) e cada lado
     começa defasado pelo trecho do perímetro que vem antes dele — o traço passa de um lado ao outro pelos
     cantos como se fosse um só. Montada na 1ª ignição do card (enfeite: a rede ignora, js/rede.js) */
  /* fora da tela a luz para (o card cheio segue cheio depois de passar; no Hub do celular eram 16 traços
     girando fora da vista e os quadros lentos rolando subiram de 11 para 16, medido) */
  var fora = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) es[i].target.classList.toggle('is-fora', !es[i].isIntersecting);
  }) : null;
  function circular(c) {
    var card = c.card, W = c.w || card.offsetWidth, H = c.h || card.offsetHeight, P = 2 * (W + H);   /* (inset −1 px a partir da caixa interna = o tamanho do card) */
    if (!c.circula) {
      c.circula = document.createElement('i'); c.circula.className = 'carga-circula'; c.circula.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < 4; k++) { var lado = document.createElement('b'); lado.appendChild(document.createElement('i')); c.circula.appendChild(lado); }
      card.appendChild(c.circula);
      if (fora) fora.observe(card);
    }
    if (c.circulaTam === W + 'x' + H) return;
    c.circulaTam = W + 'x' + H;
    var T = P / CIRCULA.vel, antes = [0, W, W + H, 2 * W + H];
    for (var i = 0; i < 4; i++) {
      var faixa = c.circula.children[i].firstChild;
      faixa.style[i % 2 ? 'height' : 'width'] = P + 'px';
      faixa.style.animationDuration = T.toFixed(2) + 's';
      faixa.style.animationDelay = (-(P - antes[i]) / P * T).toFixed(2) + 's';
    }
  }
  /* sim: IGNIÇÃO e então a SOBRECARGA (presa em 100%, a barra em MAX, ondas de letras seguidas); não: ESFRIA */
  function sobrecarga(card, sim) {
    var c = card._carga || montar(card);
    sim = !!sim;
    /* (já pedida; ou já solta e sem nada a esfriar) */
    if (sim ? c.pediu : !c.pediu && (c.rampa || !c.piso)) return;
    c.pediu = sim;
    desenfileirar(card);
    card.classList.remove('is-pressao');
    if (sim) {
      card.classList.remove('is-esfria');
      if (!B.reduced && !reduz.matches) circular(c);
      card.classList.add('is-ignicao');
      rampa(c, 1, IGNICAO, entrar);
      return;
    }
    c.sobre = false;
    card.classList.remove('is-sobrecarga', 'is-ignicao');
    c.num = -1;            /* a porcentagem volta no próximo definir */
    card.classList.add('is-esfria');
    rampa(c, 0, ESFRIA, function () { c.piso = 0; card.classList.remove('is-esfria'); definir(card, c.base); });
  }
  function entrar(c) {
    var card = c.card;
    card.classList.remove('is-ignicao');
    card.classList.add('is-sobrecarga');
    c.sobre = true;
    definir(card, c.base);
    c.txt.nodeValue = 'MAX';
    varrer(card);
    enfileirar(card);   /* (a onda de letras: na vez dele, na fila do grupo) */
  }
  B.carga = { montar: montar, definir: definir, seguir: seguir, sobrecarga: sobrecarga, pressao: pressao, preparar: preparar };

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
      if (!it) { montar(el); it = { el: el, carga: 0 }; }
      var p = posDoc(el);
      it.x = p.x; it.y = p.y; it.w = el.offsetWidth; it.h = el.offsetHeight;
      el._carga.w = it.w; el._carga.h = it.h;   /* (para a luz que circula: sem ler layout na hora) */
      novos.push(it);
    }
    lista = novos;
  }
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { ponteiro.x = e.clientX; ponteiro.y = e.clientY; ponteiro.ativo = true; } }, { passive: true });
  document.documentElement.addEventListener('pointerleave', function () { ponteiro.ativo = false; }, { passive: true });
  B.on('rede:medida', medir);
  /* a página mudou de largura com a luz circulando: as faixas e os atrasos vão para o tamanho novo (fora de fase,
     ela não passaria mais de um lado ao outro nos cantos) */
  B.on('rede:medida', function () { for (var i = 0; i < lista.length; i++) { var c = lista[i].el._carga; if (c && c.circula) circular(c); } });
  B.on('reduzir', function (sim) { if (!sim) return; B.remove('carga'); B.off('rede:medida', medir); for (var i = 0; i < lista.length; i++) { definir(lista[i].el, 0); } lista = []; });

  B.add('carga', function (S) {
    /* a janela ficou estreita: devolve os cards (descarregados) para a pilha */
    if (largo !== desktop.matches) { largo = desktop.matches; if (!largo) { for (var j = 0; j < lista.length; j++) { definir(lista[j].el, 0); } lista = []; } }
    if (!largo || !lista.length) return;
    var dt = Math.min(0.05, S.dt / 1000), sx = B.S.sx, sy = B.S.sy;
    for (var i = 0; i < lista.length; i++) {
      var it = lista[i], x0 = it.x - sx, y0 = it.y - sy;
      if (y0 > H + PERTO || y0 + it.h < -PERTO) { if (it.carga > 0) { it.carga = 0; definir(it.el, 0); } continue; }
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
    }
  });
})();
