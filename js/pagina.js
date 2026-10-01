/* ==========================================================================
   PÁGINA — o controlador comum: WhatsApp, nav, régua de seção, retículo,
   prova medida, medidor, interruptor de movimento, redes de segurança.

   Lei: o CSS só é tocado em EVENTOS discretos (uma classe, um texto). O que
   muda por frame são números em B.S, e quem desenha é o canvas.
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

  var B = window.BEYON;
  if (!B) {
    /* sem o núcleo não há revelação animada: mostra tudo */
    html.classList.remove('js');
    return;
  }
  var S = B.S;
  B.linkWA = linkWA;

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

  var aoEscapar = [];

  /* ---------- nav ---------- */
  var navEl = document.getElementById('nav');
  var preso = false;
  function aoRolar() {
    if (navEl) {
      var y = window.scrollY;
      if (!preso && y > 24) { preso = true; navEl.classList.add('is-stuck'); }
      else if (preso && y < 8) { preso = false; navEl.classList.remove('is-stuck'); }
    }
    if (alvoEl) medirAlvo();     /* o elemento apontado se moveu com a página */
  }
  window.addEventListener('scroll', aoRolar, { passive: true });

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
        if (devolverFoco) toggle.focus();
      };
      toggle.addEventListener('click', function () {
        var abrindo = !navEl.classList.contains('is-open');
        navEl.classList.toggle('is-open', abrindo);
        toggle.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
      });
      painel.addEventListener('click', function (e) { if (e.target.closest('a')) fechar(false); });
      aoEscapar.push(function () { fechar(true); });
    }
  }

  /* ---------- a seção atual: acende na nav e conta na régua ----------
     IntersectionObserver, nada por frame. A régua lista TODAS as seções com
     kicker (`data-regua`), a nav só as que têm âncora. */
  var regN = document.querySelector('.regua__n'), regNome = document.querySelector('.regua__nome');
  var secoes = [].slice.call(document.querySelectorAll('main > section[id]'));
  var mapaNav = {};
  if (navEl) {
    var ancoras = navEl.querySelectorAll('.nav__links a[href^="#"]');
    for (var a = 0; a < ancoras.length; a++) mapaNav[ancoras[a].getAttribute('href').slice(1)] = ancoras[a];
  }
  var comRegua = secoes.filter(function (s) { return s.hasAttribute('data-regua'); });
  if (secoes.length && 'IntersectionObserver' in window) {
    var naFaixa = [], atualNav = null, ultimaSec = null;
    var marcar = function () {
      var sec = naFaixa.length ? naFaixa[naFaixa.length - 1] : (window.scrollY > 200 ? ultimaSec : null);
      if (sec) ultimaSec = sec;
      var id = sec ? sec.id : null;
      if (id !== atualNav) {
        if (atualNav && mapaNav[atualNav]) { mapaNav[atualNav].classList.remove('is-current'); mapaNav[atualNav].removeAttribute('aria-current'); }
        atualNav = id;
        if (atualNav && mapaNav[atualNav]) { mapaNav[atualNav].classList.add('is-current'); mapaNav[atualNav].setAttribute('aria-current', 'location'); }
      }
      if (regN) {
        var idx = sec ? comRegua.indexOf(sec) : -1;
        var total = String(comRegua.length).padStart(2, '0');
        regN.innerHTML = '';
        var b = document.createElement('b');
        b.textContent = idx >= 0 ? String(idx + 1).padStart(2, '0') : '00';
        regN.appendChild(b);
        regN.appendChild(document.createTextNode(' / ' + total));
        if (regNome) regNome.textContent = sec ? (sec.getAttribute('data-regua') || '') : 'início';
      }
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
    marcar();
  }

  /* ---------- o RETÍCULO: o elemento interativo apontado ----------
     Delegação em pointerover/out: uma medida por troca de alvo, nunca por
     frame. O canvas (js/campo.js) lerpa até a caixa. Só com ponteiro fino. */
  var alvoEl = null;
  var SEL = 'a, button, summary, [data-wa], input, select, textarea';
  function medirAlvo() {
    if (!alvoEl) { S.alvo = null; return; }
    var r = alvoEl.getBoundingClientRect();
    if (!r.width) { S.alvo = null; return; }
    S.alvo = { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  if (B.fine) {
    B.on('remedir', medirAlvo);
    document.addEventListener('transitionend', function (e) { if (alvoEl && alvoEl.contains(e.target)) medirAlvo(); }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      var el = e.target.closest(SEL);
      if (!el || el === alvoEl) return;
      alvoEl = el; medirAlvo();
      S.focoAlvo = .7;
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      var el = e.target.closest(SEL);
      if (!el || el !== alvoEl) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      alvoEl = null; S.alvo = null; S.focoAlvo = 0;
    }, { passive: true });
  }

  /* ---------- PROVA MEDIDA (trilha do hero, painel de Sites, leitura do núcleo) ---------- */
  S.leitura = { fps: '', carga: '', peso: '' };
  var elFps = document.querySelectorAll('[data-metrica="fps"]');
  var elCarga = document.querySelectorAll('[data-metrica="carga"]');
  var elPeso = document.querySelectorAll('[data-metrica="peso"]');
  function escrever(lista, txt) { for (var i = 0; i < lista.length; i++) if (lista[i].textContent !== txt) lista[i].textContent = txt; }
  /* bytes deste domínio nesta visita. `encodedBodySize` em vez de
     `transferSize`: o segundo zera em revisita (cache), e o número que o
     núcleo mostra passaria a depender do cache em vez do site. */
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
    if (elCarga.length && nav.domContentLoadedEventEnd > 0) escrever(elCarga, (nav.domContentLoadedEventEnd / 1000).toFixed(2) + 's');
    var total = bytesDaOrigem(nav);
    if (total > 0) {
      if (elPeso.length) escrever(elPeso, Math.round(total / 1024) + ' KB');
      S.leitura.peso = Math.round(total / 1024) + ' KB';
    }
  }
  {
    if (document.readyState === 'complete') medidasDeCarga();
    else window.addEventListener('load', function () { setTimeout(medidasDeCarga, 0); }, { once: true });
    if (window.PerformanceObserver) {
      try { new PerformanceObserver(function () { medidasDeCarga(); }).observe({ type: 'resource', buffered: false }); } catch (e) { /* sem suporte */ }
    }
  }
  var med = document.querySelector('.medidor__txt'), led = document.querySelector('.medidor__led');
  /* a LEITURA do instrumento: o canvas (js/campo.js) escreve estes três
     valores em volta do núcleo do hero. Strings prontas, trocadas 2x por
     segundo — o canvas só desenha. */
  var navEntrada = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  {
    var ultFps = 0, ultTxt = '', ultCor = '';
    B.add('medidor', function (s) {
      if (s.now - ultFps < 500) return;
      ultFps = s.now;
      var fps = Math.round(s.fps);
      S.leitura.fps = fps + ' fps';
      if (navEntrada && navEntrada.domContentLoadedEventEnd > 0) S.leitura.carga = (navEntrada.domContentLoadedEventEnd / 1000).toFixed(2) + ' s';
      if (elFps.length) escrever(elFps, fps + ' fps');
      if (med) {
        var txt = fps + ' fps · ' + (1000 / Math.max(1, s.fps)).toFixed(1) + ' ms';
        if (txt !== ultTxt) { ultTxt = txt; med.textContent = txt; }
        var corLed = fps > 50 ? 'var(--ac)' : (fps > 35 ? 'var(--warm)' : 'var(--led)');
        if (led && corLed !== ultCor) { ultCor = corLed; led.style.background = corLed; }
      }
    });
  }
  var medBtn = document.querySelector('.medidor__btn'), medNota = document.getElementById('medidor-nota'), medCaixa = document.querySelector('.medidor');
  if (medBtn && medNota) {
    if (medCaixa) medCaixa.hidden = false;
    medBtn.addEventListener('click', function () {
      var abrindo = medNota.hidden;
      medNota.hidden = !abrindo;
      medBtn.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
    });
    aoEscapar.push(function () {
      if (medNota.hidden) return;
      medNota.hidden = true; medBtn.setAttribute('aria-expanded', 'false'); medBtn.focus();
    });
  }

  /* ---------- interruptor "menos movimento" (rodapé) ---------- */
  var btnMov = document.querySelector('.footer__motion');
  if (btnMov) {
    /* rótulo FIXO; só o estado muda (botão alternável) */
    var rotular = function () {
      btnMov.setAttribute('aria-pressed', html.classList.contains('menos-movimento') ? 'true' : 'false');
    };
    rotular();
    btnMov.addEventListener('click', function () {
      B.reduzir(!html.classList.contains('menos-movimento'));
      rotular();
    });
  }

  /* ---------- ESCAPE: um caminho só ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    for (var k = 0; k < aoEscapar.length; k++) aoEscapar[k]();
  });

  B.iniciar();
})();
