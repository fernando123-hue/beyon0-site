/* ==========================================================================
   ENERGIA NO TEXTO (2026-10-06). Pedido do dono: "o efeito de bug no texto
   que tinha antes e o de fazer certas palavras mudarem: recrie com a
   identidade do site, sempre remetendo a energia".

   O que havia: um embaralhamento por sinais aleatórios (js/dom.js da V1,
   `morph`) e um pisco branco de ruído, tirado porque "lia como bug". O que
   ficou: A DESCARGA. Uma frente de energia atravessa a palavra da esquerda
   para a direita (a assinatura do site: a luz passa e imprime). À frente
   dela, as letras ficam CARREGADAS (faíscas: / \ | + * : ·, em ciano); na
   frente, a letra ACESA (branca); atrás, o texto novo já impresso.

   Três usos:
   1. A PALAVRA VIVA: <em data-palavras="como|quanto|quando"> troca de
      palavra a cada ~4 s enquanto está na tela, pela descarga. As listas
      estão no HTML (o dono edita lá). Uma alternativa que mudaria a altura
      do título nesta largura de tela fica de fora (nada pula na página).
   2. O SURTO: a palavra de destaque do título do hero leva uma descarga
      rápida de vez em quando (12 a 20 s), sem trocar. (O "Zero" da marca
      escrita também levava; desde 2026-10-12 a marca é a logo, um desenho.)
   3. B.energizar(el|textNode, {para, ms}): a ignição do botão quando o mini
      AI Core encaixa (js/mini-docas.js).
   Movimento reduzido: nada disso; o texto fica o original.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var html = document.documentElement;
  var FAISCAS = '/\\|+*:·=';
  var VIVA = { troca: 4000, descarga: 720, primeira: 2200 };
  var SURTO = { min: 12000, max: 20000, descarga: 460 };
  function reduzido() { return !!B.reduced || html.classList.contains('menos-movimento'); }
  function faisca() { return FAISCAS.charAt((Math.random() * FAISCAS.length) | 0); }

  /* a folha de texto: o elemento mais fundo que tem o texto inteiro (o SplitText do hero embrulha as palavras) */
  function folha(el) {
    var alvo = el;
    while (alvo.children.length === 1 && alvo.firstElementChild.textContent === alvo.textContent) alvo = alvo.firstElementChild;
    return alvo.children.length ? null : alvo;
  }

  /* ---------- A DESCARGA ---------- */
  function descarga(el, para, ms, fim) {
    var de = el.textContent;
    if (para === undefined || para === null) para = de;
    var L = Math.max(de.length, para.length);
    var largura = el.getBoundingClientRect().width;
    var travar = para === de;   /* o surto não muda a largura: as faíscas têm larguras diferentes das letras */
    /* (o estilo que já estava no elemento volta igual: o SplitText grava display inline-block nas palavras do título) */
    var antes = { display: el.style.display, width: el.style.width, whiteSpace: el.style.whiteSpace };
    if (travar) { el.style.display = 'inline-block'; el.style.width = largura + 'px'; el.style.whiteSpace = 'nowrap'; }
    el.textContent = '';
    var letras = [];
    for (var i = 0; i < L; i++) { var s = document.createElement('span'); letras.push(s); el.appendChild(s); }
    el.classList.add('energizando');
    var t0 = performance.now(), quadros = 0;
    (function quadro() {
      var k = Math.min(1, (performance.now() - t0) / ms);
      var frente = k * (L + 4) - 2;
      quadros++;
      for (var j = 0; j < L; j++) {
        var d = j - frente, ch, cls = '';
        if (d < -1) ch = para.charAt(j);
        else if (d < 0) { ch = para.charAt(j) || ''; cls = 'e-acesa'; }
        else if (d < 3) { var orig = de.charAt(j) || para.charAt(j); ch = orig === ' ' || orig === '' ? orig : (quadros % 2 ? faisca() : letras[j].textContent || faisca()); cls = 'e-carga'; }
        else ch = de.charAt(j);
        if (letras[j].textContent !== ch) letras[j].textContent = ch;
        if (letras[j].className !== cls) letras[j].className = cls;
      }
      if (k < 1) { requestAnimationFrame(quadro); return; }
      el.textContent = para;
      el.classList.remove('energizando');
      if (travar) { el.style.display = antes.display; el.style.width = antes.width; el.style.whiteSpace = antes.whiteSpace; }
      if (fim) fim();
    })();
  }

  /* um nó de texto solto (o rótulo de um botão) vira um span só durante a descarga */
  B.energizar = function (alvo, op) {
    op = op || {};
    if (!alvo || reduzido()) return;
    if (alvo.nodeType === 1 && (alvo.classList.contains('e-no') || alvo.querySelector('.energizando'))) return;   /* (já em descarga) */
    if (alvo.nodeType === 3) {
      if (!alvo.textContent.trim()) return;
      var s = document.createElement('span');
      s.className = 'e-no';
      alvo.parentNode.replaceChild(s, alvo);
      s.textContent = alvo.textContent.trim();
      var antes = alvo.textContent.match(/^\s*/)[0], depois = alvo.textContent.match(/\s*$/)[0];
      descarga(s, op.para, op.ms || 600, function () { if (s.parentNode) s.parentNode.replaceChild(document.createTextNode(antes + s.textContent + depois), s); });
      return;
    }
    var f = folha(alvo);
    if (f) { descarga(f, op.para, op.ms || 600, op.fim); return; }
    /* mais de uma palavra embrulhada ("no ar" no título partido): a frente passa por uma de cada vez */
    var folhas = [].filter.call(alvo.querySelectorAll('*'), function (e) { return !e.children.length && e.textContent.trim(); });
    folhas.forEach(function (e, i) { setTimeout(function () { descarga(e, null, op.ms || 600); }, i * (op.ms || 600) * 0.45); });
  };

  /* ---------- 1. A PALAVRA VIVA ---------- */
  function palavraViva(titulo) {
    /* de novo a cada vez, e sempre o que tem texto: o SplitText recria o título e deixa um <em> VAZIO numa das linhas
       (foi o bug da V1: a troca escrevia no vazio e a palavra visível nunca mudava) */
    var em = function () { return [].filter.call(titulo.querySelectorAll('em[data-palavras]'), function (e) { return e.textContent.trim(); })[0] || null; };
    var lista = null, cabem = null, indice = 0, visivel = false, relogio = 0, primeira = 0, ocupado = false;
    /* a lista e o rótulo para o leitor de tela só com o título inteiro (sem a divisão da entrada) */
    function preparar(e) {
      var original = e.textContent;
      lista = e.getAttribute('data-palavras').split('|').map(function (p) { return p.trim(); }).filter(Boolean);
      if (lista.indexOf(original) < 0) lista.unshift(original);
      titulo.setAttribute('aria-label', titulo.textContent.replace(/\s+/g, ' ').trim());   /* o leitor de tela lê a frase original */
    }

    /* quais palavras cabem sem mudar a altura do título nesta largura (lido uma vez, e de novo ao girar a tela) */
    function medir(e) {
      var atual = e.textContent, alto = titulo.offsetHeight;
      cabem = lista.filter(function (p) { e.textContent = p; return titulo.offsetHeight === alto; });
      e.textContent = atual;
      if (cabem.indexOf(atual) < 0) cabem.unshift(atual);
    }
    function trocar() {
      var e = em();
      if (!visivel || ocupado || reduzido() || !e || e.children.length || document.hidden) return;   /* (filhos: ainda partido pela entrada) */
      if (!lista) preparar(e);
      if (!cabem) medir(e);
      if (!cabem || cabem.length < 2) return;
      indice = (cabem.indexOf(e.textContent) + 1) % cabem.length;
      ocupado = true;
      descarga(e, cabem[indice], VIVA.descarga, function () { ocupado = false; });
    }
    var io = new IntersectionObserver(function (es) {
      visivel = es[0].isIntersecting;
      clearInterval(relogio); clearTimeout(primeira);
      if (visivel) { primeira = setTimeout(trocar, VIVA.primeira); relogio = setInterval(trocar, VIVA.troca); }
    }, { threshold: 0.6 });
    io.observe(titulo);
    window.addEventListener('resize', function () { cabem = null; });
  }

  /* ---------- 2. O SURTO ---------- */
  function surto(el) {
    var visivel = false;
    new IntersectionObserver(function (es) { visivel = es[0].isIntersecting; }).observe(el);
    (function agendar() {
      setTimeout(function () {
        if (visivel && !reduzido() && !document.hidden && !el.querySelector('.energizando')) B.energizar(el, { ms: SURTO.descarga });
        agendar();
      }, SURTO.min + Math.random() * (SURTO.max - SURTO.min));
    })();
  }

  /* começa depois do load e com o navegador folgado: nada disso disputa o boot do hero */
  function iniciar() {
    if (reduzido()) return;
    var titulos = document.querySelectorAll('h2, h3');
    for (var i = 0; i < titulos.length; i++) if (titulos[i].querySelector('em[data-palavras]')) palavraViva(titulos[i]);
    var destaque = document.querySelector('.hero__title em');
    if (destaque) surto(destaque);
    /* (a marca escrita tinha um surto no "Zero"; a logo é desenho: a luz dela passa por css/motion.css) */
  }
  var ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 600); };
  var ir = function () { setTimeout(function () { ocioso(iniciar, { timeout: 2000 }); }, 2500); };
  if (document.readyState === 'complete') ir(); else window.addEventListener('load', ir, { once: true });
})();
