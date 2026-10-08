/* ==========================================================================
   A PASSAGEM — a transição entre as páginas do site (css/passagem.css).

   A View Transition entre documentos do navegador falhava quase sempre aqui
   (Chrome real, 2026-10-04: 0 de 14 trocas), então a transição é do site.
   A TRAVESSIA (2026-10-09): sem painel e sem rótulo, a própria página se
   move. No clique num link para outra página do site, o conteúdo voa na
   direção de quem olha a partir do ponto tocado, a rede do fundo vem junto
   mais devagar, riscos de luz saem desse ponto, e só então navega. A página
   nova (js/ancoras.js põe `passagem-chega` no <head>) vem de longe e assenta.
   Enquanto isso o destino já foi pedido ao servidor: a intenção (cursor em
   cima, dedo encostado, foco) pré-carrega a página.

   Fica de fora: link com modificador (nova aba), outra origem, âncora na
   mesma página, movimento reduzido. Voltar pelo histórico com a página
   guardada (bfcache) devolve a página no lugar.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var B = window.BEYON || {};
  var el = document.querySelector('.passagem');
  if (!el) return;
  var riscos = el.querySelector('.passagem__riscos');
  var SAI_MS = 500;            /* = o conteúdo sumindo no ponto tocado (pass-mergulha, .48s) */
  var DESISTE_MS = 4000;       /* a navegação não aconteceu (Parar, Esc, o navegador cancelou): a página volta */
  var CHEGADA_MS = 900;        /* a página assentada (pass-assenta, .76s), com folga */
  var PAGINAS = ['/', '/sites', '/automacao', '/orcamento'];
  var saindo = false;
  var mexidos = [];            /* quem recebeu origem e classe na saída: tudo volta como estava se desistir */

  function caminho(u) {
    var p = u.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1');
    return p || '/';
  }
  function reduzido() { return !!B.reduced || html.classList.contains('menos-movimento'); }
  function ehPagina(u) { return u.origin === location.origin && PAGINAS.indexOf(caminho(u)) >= 0 && caminho(u) !== caminho(location); }

  /* a chegada: chegou a uma âncora (página rolada)? a página vem do centro da TELA, não do topo dela */
  if (html.classList.contains('passagem-chega')) {
    var chegou = function () {
      if (window.scrollY > 0) {
        var meio = window.scrollY + window.innerHeight / 2;
        document.querySelectorAll('main, .footer').forEach(function (n) { n.style.transformOrigin = '50% ' + (meio - n.offsetTop) + 'px'; });
      }
    };
    chegou();
    setTimeout(function () {
      html.classList.remove('passagem-chega');
      document.querySelectorAll('main, .footer').forEach(function (n) { n.style.transformOrigin = ''; });
    }, CHEGADA_MS);
  }

  /* o link que vira passagem: mesma origem, página do site, outra página */
  function destinoDe(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return null; }
    return ehPagina(u) ? { href: u.href, link: a } : null;
  }

  /* o ponto tocado; pelo teclado (Enter) o clique vem sem coordenada: o centro do link */
  function pontoDe(e, a) {
    if (e.detail > 0 && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
    var r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* quem mergulha: <main> e o rodapé. Se o palco do desktop estiver FIXADO (pin do GSAP, position: fixed dentro
     de <main>), um transform em <main> o tiraria do lugar; aí só ele mergulha e o resto de <main> esmaece. */
  function alvos() {
    var main = document.querySelector('main');
    var fixo = null;
    document.querySelectorAll('.pin-spacer > *').forEach(function (n) { if (getComputedStyle(n).position === 'fixed') fixo = n; });
    var lista = fixo ? [{ n: fixo, c: 'passagem-mergulha' }, { n: main, c: 'passagem-esmaece' }] : [{ n: main, c: 'passagem-mergulha' }];
    var rodape = document.querySelector('.footer');
    if (rodape) lista.push({ n: rodape, c: 'passagem-mergulha' });
    return lista.filter(function (a) { return a.n; });
  }

  function desfazer() {
    saindo = false;
    html.classList.remove('passagem-sai');
    mexidos.forEach(function (a) { a.n.classList.remove(a.c); a.n.style.transformOrigin = ''; });
    mexidos = [];
  }

  function sair(d, p) {
    saindo = true;
    riscos.style.left = p.x + 'px';
    riscos.style.top = p.y + 'px';
    mexidos = alvos();
    mexidos.forEach(function (a) {
      var r = a.n.getBoundingClientRect();
      a.n.style.transformOrigin = (p.x - r.left) + 'px ' + (p.y - r.top) + 'px';
      a.n.classList.add(a.c);
    });
    try { sessionStorage.setItem('bz-passagem', String(Date.now())); } catch (err) { /* sem armazenamento: chega sem a travessia */ }
    html.classList.remove('passagem-chega');
    html.classList.add('passagem-sai');
    if (B.emit) B.emit('passagem', d);   /* o mini mergulha junto (js/mini.js) */
    setTimeout(function () { location.href = d.href; }, SAI_MS);
    setTimeout(desfazer, SAI_MS + DESISTE_MS);
  }

  document.addEventListener('click', function (e) {
    var d = destinoDe(e);
    if (!d || reduzido()) return;
    e.preventDefault();
    if (!saindo) sair(d, pontoDe(e, d.link));
  });

  /* voltou pelo histórico com a página guardada: ela estava no meio do voo; volta inteira */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    desfazer();
    html.classList.remove('passagem-chega');
  });

  /* pré-carga na intenção: o HTML do destino chega enquanto a página voa */
  var pedidos = {};
  var economia = !!(navigator.connection && navigator.connection.saveData);
  function precarregar(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || economia) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    var p = caminho(u);
    if (!ehPagina(u) || pedidos[p]) return;
    pedidos[p] = true;
    var l = document.createElement('link');
    l.rel = 'prefetch'; l.href = u.pathname;
    document.head.appendChild(l);
  }
  document.addEventListener('pointerover', precarregar, { passive: true });
  document.addEventListener('touchstart', precarregar, { passive: true });
  document.addEventListener('focusin', precarregar);
})();
