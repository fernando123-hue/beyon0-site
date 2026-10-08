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
  var DESISTE_MS = 2000;       /* a navegação não aconteceu (Parar, Esc, o navegador cancelou): a página volta.
                                  Curto: sem painel, a página sumida por muito tempo parece travada (revisão do PR #23) */
  var CHEGADA_MS = 900;        /* a página assentada (pass-assenta, .76s), com folga */
  var PAGINAS = ['/', '/sites', '/automacao', '/orcamento'];
  var saindo = false;
  var mexidos = [];            /* quem recebeu origem e classe na saída: tudo volta como estava se desistir */
  var chegada = 0;             /* o timer do fim da chegada */
  var desiste = 0;             /* o timer do desfazer: cancelado ao desfazer (um timer velho, congelado no bfcache,
                                  não pode desfazer o voo seguinte) */

  function caminho(u) {
    var p = u.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1');
    return p || '/';
  }
  function reduzido() { return !!B.reduced || html.classList.contains('menos-movimento'); }
  function ehPagina(u) { return u.origin === location.origin && PAGINAS.indexOf(caminho(u)) >= 0 && caminho(u) !== caminho(location); }

  /* o fim da chegada. Enquanto <main> está em escala, quem mede pelo getBoundingClientRect (o ScrollTrigger, as
     entradas por seção) mediria errado: o js/anima.js espera 'passagem:chegou' para ligar, e aqui o ScrollTrigger
     mede de novo. (Âncora: js/ancoras.js põe passagem-ancora e a página só aparece, sem escala.) */
  function fimDaChegada() {
    clearTimeout(chegada);
    if (!html.classList.contains('passagem-chega')) return;
    html.classList.remove('passagem-chega', 'passagem-ancora');
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    if (B.emit) B.emit('passagem:chegou');
  }
  if (html.classList.contains('passagem-chega')) chegada = setTimeout(fimDaChegada, CHEGADA_MS);

  /* o link que vira passagem: mesma origem, página do site, outra página */
  function destinoDe(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return null; }
    return ehPagina(u) ? { href: u.href, link: a } : null;
  }

  /* o menu é o do celular quando o botão dele está à mostra (html.tem-menu vale no desktop também; o .is-open já
     saiu quando este clique chega, porque o js/pagina.js fecha o menu antes) */
  function menuDoCelular() {
    var t = document.querySelector('.nav__toggle');
    return !!t && t.getClientRects().length > 0;
  }

  /* o ponto tocado; pelo teclado (Enter) o clique vem sem coordenada: o centro do link. Link do menu do celular:
     o centro da tela (o menu fecha na hora e o ponto tocado ficaria em cima de nada) */
  function pontoDe(e, a) {
    if (menuDoCelular() && a.closest('.nav__links')) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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
    var lista = fixo ? [{ n: fixo, c: 'passagem-voa' }, { n: main, c: 'passagem-esmaece' }] : [{ n: main, c: 'passagem-mergulha' }];
    var rodape = document.querySelector('.footer');
    if (rodape) lista.push({ n: rodape, c: 'passagem-mergulha' });
    return lista.filter(function (a) { return a.n; });
  }

  function desfazer() {
    clearTimeout(desiste);
    saindo = false;
    html.classList.remove('passagem-sai');
    mexidos.forEach(function (a) { a.n.classList.remove(a.c); a.n.style.transformOrigin = ''; });
    mexidos = [];
    try { sessionStorage.removeItem('bz-passagem'); } catch (err) { /* sem armazenamento: nada a apagar */ }
  }

  function sair(d, p) {
    saindo = true;
    fimDaChegada();   /* clicou com a página ainda chegando: ela assenta antes de medir */
    riscos.style.left = p.x + 'px';
    riscos.style.top = p.y + 'px';
    mexidos = alvos();
    mexidos.forEach(function (a) {
      var r = a.n.getBoundingClientRect();
      a.n.style.transformOrigin = (p.x - r.left) + 'px ' + (p.y - r.top) + 'px';
      a.n.classList.add(a.c);
    });
    try { sessionStorage.setItem('bz-passagem', String(Date.now())); } catch (err) { /* sem armazenamento: chega sem a travessia */ }
    html.classList.add('passagem-sai');
    if (B.emit) B.emit('passagem', d);   /* o mini mergulha junto (js/mini.js) */
    setTimeout(function () { location.href = d.href; }, SAI_MS);
    desiste = setTimeout(desfazer, SAI_MS + DESISTE_MS);
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
    fimDaChegada();
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
