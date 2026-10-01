/* ==========================================================================
   PÁGINA — o controlador comum (V3): WhatsApp, nav, seção atual, barra do
   celular, prova medida, interruptor de movimento, redes de segurança.

   Lei: o CSS só é tocado em EVENTOS discretos (uma classe, um texto). Nada
   por frame além do medidor de fps, que escreve texto 2x por segundo.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;

  /* ---------- WhatsApp: ANTES de depender do núcleo ----------
     Se js/core.js falhar, os botões de contato continuam levando ao dono. O
     número de reserva é duplicata consciente de js/tel.js (grep 5521977167944). */
  var FONE = window.BEYON_TEL || '5521977167944';
  var PADRAO = document.body.getAttribute('data-wa-padrao') || 'quero entender como a Beyon Zero pode ajudar meu negócio';
  function linkWA(assunto) {
    var txt = 'Oi! Vim pelo site da Beyon Zero e ' + (assunto || PADRAO) + '.';
    return 'https://wa.me/' + FONE + '?text=' + encodeURIComponent(txt);
  }
  var links = document.querySelectorAll('[data-wa]');
  for (var i = 0; i < links.length; i++) {
    links[i].href = linkWA(links[i].getAttribute('data-wa'));
    links[i].rel = 'noopener noreferrer';
    links[i].target = '_blank';
  }

  var ano = document.getElementById('year');
  if (ano) ano.textContent = new Date().getFullYear();

  var aoEscapar = [];
  /* a barra do celular: some com o menu aberto ou com o fim da página na tela */
  var barra = document.getElementById('barra'), menuAberto = false, fimDaPagina = false;
  function mostrarBarra() { if (barra) barra.classList.toggle('is-oculta', menuAberto || fimDaPagina); }

  /* ---------- nav ---------- */
  var navEl = document.getElementById('nav');
  var preso = false;
  window.addEventListener('scroll', function () {
    if (!navEl) return;
    var y = window.scrollY;
    if (!preso && y > 24) { preso = true; navEl.classList.add('is-stuck'); }
    else if (preso && y < 8) { preso = false; navEl.classList.remove('is-stuck'); }
  }, { passive: true });

  if (navEl) {
    var toggle = navEl.querySelector('.nav__toggle');
    var painel = document.getElementById('nav-links');
    if (toggle && painel) {
      toggle.hidden = false;
      html.classList.add('tem-menu');   /* só com JS os links se recolhem (css/base.css) */
      var fechar = function (devolverFoco) {
        if (!navEl.classList.contains('is-open')) return;
        navEl.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        menuAberto = false; mostrarBarra();
        if (devolverFoco) toggle.focus();
      };
      toggle.addEventListener('click', function () {
        var abrindo = !navEl.classList.contains('is-open');
        navEl.classList.toggle('is-open', abrindo);
        toggle.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
        menuAberto = abrindo; mostrarBarra();
      });
      painel.addEventListener('click', function (e) { if (e.target.closest('a')) fechar(false); });
      aoEscapar.push(function () { fechar(true); });
    }
  }

  /* ---------- ESCAPE: um caminho só ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    for (var k = 0; k < aoEscapar.length; k++) aoEscapar[k]();
  });

  var B = window.BEYON;
  if (!B) {
    /* sem o núcleo não há revelação animada: mostra tudo */
    html.classList.remove('js');
    return;
  }
  B.linkWA = linkWA;
  html.classList.add('tem-medida');   /* com o núcleo há medida: os rótulos de fps/carga aparecem (css/motion.css) */

  /* ---------- REDE DE SEGURANÇA DA REVELAÇÃO ----------
     `html.js` esconde o conteúdo para o GSAP revelar. Se js/anima.js não
     marcar `has-gsap` até 2,5s depois do boot (arquivo faltando, erro,
     GSAP bloqueado), o contrato cai e tudo aparece. */
  function garantirConteudo() {
    setTimeout(function () {
      if (!html.classList.contains('has-gsap')) html.classList.remove('js');
    }, 2500);
  }
  if (document.body.classList.contains('booted')) garantirConteudo();
  else B.on('booted', garantirConteudo);

  /* ---------- a seção atual acende na nav (IntersectionObserver, nada por frame) ---------- */
  var secoes = [].slice.call(document.querySelectorAll('main section[id]'));
  var mapaNav = {};
  if (navEl) {
    var ancoras = navEl.querySelectorAll('.nav__links a[href^="#"]');
    for (var a = 0; a < ancoras.length; a++) mapaNav[ancoras[a].getAttribute('href').slice(1)] = ancoras[a];
  }
  if (secoes.length && 'IntersectionObserver' in window) {
    var naFaixa = [], atualNav = null;
    var marcar = function () {
      var sec = naFaixa.length ? naFaixa[naFaixa.length - 1] : null;
      var id = sec ? sec.id : null;
      if (id === atualNav) return;
      if (atualNav && mapaNav[atualNav]) { mapaNav[atualNav].classList.remove('is-current'); mapaNav[atualNav].removeAttribute('aria-current'); }
      atualNav = id;
      if (atualNav && mapaNav[atualNav]) { mapaNav[atualNav].classList.add('is-current'); mapaNav[atualNav].setAttribute('aria-current', 'location'); }
    };
    var ioSec = new IntersectionObserver(function (ents) {
      for (var n = 0; n < ents.length; n++) {
        var pos = naFaixa.indexOf(ents[n].target);
        if (ents[n].isIntersecting && pos < 0) naFaixa.push(ents[n].target);
        else if (!ents[n].isIntersecting && pos >= 0) naFaixa.splice(pos, 1);
      }
      naFaixa.sort(function (x, y) { return secoes.indexOf(x) - secoes.indexOf(y); });
      marcar();
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (var s2 = 0; s2 < secoes.length; s2++) ioSec.observe(secoes[s2]);
  }

  /* ---------- A BARRA DO CELULAR ----------
     O CTA fixo no pé da tela some quando a seção de conversa (que já tem o
     botão grande) ou o rodapé está na tela, e com o menu aberto: dois
     botões iguais na mesma tela confundem. */
  if (barra && 'IntersectionObserver' in window) {
    var fimVisivel = [];
    var ioBarra = new IntersectionObserver(function (ents) {
      for (var n = 0; n < ents.length; n++) {
        var pos = fimVisivel.indexOf(ents[n].target);
        if (ents[n].isIntersecting && pos < 0) fimVisivel.push(ents[n].target);
        else if (!ents[n].isIntersecting && pos >= 0) fimVisivel.splice(pos, 1);
      }
      fimDaPagina = fimVisivel.length > 0; mostrarBarra();
    }, { rootMargin: '0px 0px -40% 0px' });
    var fins = document.querySelectorAll('.conversa, body > footer');
    for (var f = 0; f < fins.length; f++) ioBarra.observe(fins[f]);
  }

  /* ---------- PROVA MEDIDA ([data-metrica]) ---------- */
  var elFps = document.querySelectorAll('[data-metrica="fps"]');
  var elCarga = document.querySelectorAll('[data-metrica="carga"]');
  var elPeso = document.querySelectorAll('[data-metrica="peso"]');
  function escrever(lista, txt) { for (var k = 0; k < lista.length; k++) if (lista[k].textContent !== txt) lista[k].textContent = txt; }
  /* bytes deste domínio nesta visita. `encodedBodySize` em vez de
     `transferSize`: o segundo zera em revisita (cache), e o número passaria a
     depender do cache em vez do site. */
  function bytesDaOrigem(nav) {
    var total = nav.encodedBodySize || nav.transferSize || 0;
    var recursos = performance.getEntriesByType('resource');
    for (var p = 0; p < recursos.length; p++) {
      var origem;
      try { origem = new URL(recursos[p].name, location.href).origin; } catch (e) { continue; }
      if (origem === location.origin) total += recursos[p].encodedBodySize || recursos[p].transferSize || 0;
    }
    return total;
  }
  function medidasDeCarga() {
    if (!window.performance || !performance.getEntriesByType) return;
    var nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return;
    if (elCarga.length && nav.domContentLoadedEventEnd > 0) escrever(elCarga, (nav.domContentLoadedEventEnd / 1000).toFixed(2) + ' s');
    var total = bytesDaOrigem(nav);
    if (total > 0 && elPeso.length) escrever(elPeso, Math.round(total / 1024) + ' KB');
  }
  if (elCarga.length || elPeso.length) {
    if (document.readyState === 'complete') medidasDeCarga();
    else window.addEventListener('load', function () { setTimeout(medidasDeCarga, 0); }, { once: true });
    if (window.PerformanceObserver) {
      try {
        var po = new PerformanceObserver(function () { medidasDeCarga(); });
        po.observe({ type: 'resource', buffered: false });
        /* nada carrega tarde neste site: depois de 6s do load, o observador sai */
        window.addEventListener('load', function () { setTimeout(function () { po.disconnect(); medidasDeCarga(); }, 6000); }, { once: true });
      } catch (e) { /* sem suporte */ }
    }
  }
  if (elFps.length && !B.reduced) {
    var ultFps = 0;
    B.add('medidor', function (s) {
      if (s.now - ultFps < 500) return;
      ultFps = s.now;
      escrever(elFps, Math.round(s.fps) + ' fps');
    });
    /* em movimento reduzido não há o que medir: o item de fps da prova some
       (css/motion.css) e a trilha diz o porquê em vez de um traço */
    B.on('reduzir', function (sim) { if (sim) { B.remove('medidor'); escrever(elFps, 'movimento reduzido'); } });
  } else if (elFps.length) {
    escrever(elFps, 'movimento reduzido');
  }

  /* ---------- interruptor "menos movimento" (rodapé) ---------- */
  var btnMov = document.querySelector('.footer__motion');
  /* com prefers-reduced-motion ligado no sistema, o interruptor não tem o que
     fazer: o sistema manda, e um botão que não ativa nada mentiria */
  if (btnMov && B.sistemaReduz) { btnMov.hidden = true; btnMov = null; }
  if (btnMov) {
    var rotular = function () {
      btnMov.setAttribute('aria-pressed', html.classList.contains('menos-movimento') ? 'true' : 'false');
    };
    rotular();
    btnMov.addEventListener('click', function () {
      B.reduzir(!html.classList.contains('menos-movimento'), true);
      rotular();
    });
  }

  B.iniciar();
})();
