/* ==========================================================================
   A PASSAGEM — a transição entre as páginas do site (css/motion.css).

   A View Transition entre documentos do navegador falhava quase sempre aqui
   (Chrome real, 2026-10-04: 0 de 14 trocas), então a transição é do site:
   no clique num link para outra página do site, O MERGULHO (2026-10-06,
   css/motion.css): o centro da tela abre e engole a página, os anéis passam
   como um túnel, o nome do destino se escreve, e só então navega; a página
   nova nasce dentro do túnel (js/ancoras.js põe `passagem-chega` no <head>)
   e é revelada com ele se fechando no centro. Enquanto ele fecha, o destino já
   foi pedido ao servidor: a intenção (cursor em cima, dedo encostado, foco)
   pré-carrega a página.

   Fica de fora: link com modificador (nova aba), outra origem, âncora na
   mesma página, movimento reduzido. Voltar pelo histórico com a página
   guardada (bfcache) tira o painel.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var B = window.BEYON || {};
  var el = document.querySelector('.passagem');
  if (!el) return;
  var rotulo = el.querySelector('.passagem__rotulo');
  var leitura = el.querySelector('.passagem__leitura');
  var COBRE_MS = 560;          /* = o escuro fechando (pass-abre, .54s) */
  var DESISTE_MS = 4000;       /* a navegação não aconteceu (Parar, Esc, o navegador cancelou): o painel sai */
  var CHEGADA_MS = 1250;       /* o último anel da chegada (.37s + .78s), com folga */
  var NOMES = { '/': 'Beyon Zero', '/sites': 'Sites', '/automacao': 'Automação & IA' };
  var INDICE = { '/': '01', '/sites': '02', '/automacao': '03' };
  var SINAIS = '01/\\<>[]=+*#';
  var saindo = false;

  function caminho(u) {
    var p = u.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1');
    return p || '/';
  }
  function reduzido() { return !!B.reduced || html.classList.contains('menos-movimento'); }

  /* a chegada: tira a classe quando o painel terminou de abrir */
  if (html.classList.contains('passagem-chega')) {
    setTimeout(function () { html.classList.remove('passagem-chega'); }, CHEGADA_MS);
  }

  /* o link que vira passagem: mesma origem, página do site, outra página */
  function destinoDe(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return null; }
    if (u.origin !== location.origin) return null;
    var p = caminho(u);
    if (!Object.prototype.hasOwnProperty.call(NOMES, p) || p === caminho(location)) return null;
    return { href: u.href, nome: NOMES[p], indice: INDICE[p] };
  }

  /* o nome do destino se ESCREVE: cada letra assenta da esquerda para a direita, depois de sinais (a mesma
     escrita dos rótulos mono do site, js/escrita.js) */
  function escrever(alvo, texto, ms) {
    if (!alvo) return;
    var t0 = performance.now();
    (function passo() {
      var k = Math.min(1, (performance.now() - t0) / ms), fixas = Math.floor(texto.length * k), s = '';
      for (var i = 0; i < texto.length; i++) s += i < fixas || texto[i] === ' ' ? texto[i] : SINAIS[(Math.random() * SINAIS.length) | 0];
      alvo.textContent = s;
      if (k < 1) requestAnimationFrame(passo);
    })();
  }

  function sair(d) {
    saindo = true;
    escrever(rotulo, d.nome, 380);
    if (leitura) leitura.textContent = d.indice + ' / 03';
    try { sessionStorage.setItem('bz-passagem', String(Date.now())); } catch (err) { /* sem armazenamento: chega sem cobertura */ }
    html.classList.remove('passagem-chega');
    el.classList.remove('is-cobre');
    void el.offsetWidth;   /* reinicia a animação se a classe acabou de sair */
    el.classList.add('is-cobre');
    if (B.emit) B.emit('passagem', d);   /* o mini mergulha junto (js/mini.js) */
    setTimeout(function () { location.href = d.href; }, COBRE_MS);
    setTimeout(function () { saindo = false; el.classList.remove('is-cobre'); }, COBRE_MS + DESISTE_MS);
  }

  document.addEventListener('click', function (e) {
    var d = destinoDe(e);
    if (!d || reduzido()) return;
    e.preventDefault();
    if (!saindo) sair(d);
  });

  /* voltou pelo histórico com a página guardada: sem painel */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    saindo = false;
    el.classList.remove('is-cobre');
    html.classList.remove('passagem-chega');
  });

  /* pré-carga na intenção: o HTML do destino chega enquanto o painel fecha */
  var pedidos = {};
  var economia = !!(navigator.connection && navigator.connection.saveData);
  function precarregar(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || economia) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    var p = caminho(u);
    if (u.origin !== location.origin || !Object.prototype.hasOwnProperty.call(NOMES, p) || p === caminho(location) || pedidos[p]) return;
    pedidos[p] = true;
    var l = document.createElement('link');
    l.rel = 'prefetch'; l.href = u.pathname;
    document.head.appendChild(l);
  }
  document.addEventListener('pointerover', precarregar, { passive: true });
  document.addEventListener('touchstart', precarregar, { passive: true });
  document.addEventListener('focusin', precarregar);
})();
