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
  var barra = document.getElementById('barra'), wa = document.querySelector('.wa'), menuAberto = false, fimDaPagina = false, heroCtaVisivel = true;
  function mostrarBarra() {
    if (barra) barra.classList.toggle('is-oculta', menuAberto || fimDaPagina || heroCtaVisivel);
    /* na Conversa o CTA grande já está na tela: o flutuante sai, como a barra */
    if (wa) wa.classList.toggle('is-oculta', heroCtaVisivel || fimDaPagina);
  }

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
  var hud = document.querySelector('.hud'), hudK = hud && hud.querySelector('[data-hud-k]');
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
      if (hud) {
        hud.className = 'hud';
        var kick = sec && sec.querySelector('.kicker');
        if (kick && hudK) {
          var idx = kick.querySelector('b');
          hud.classList.add('hud--' + (idx ? idx.textContent.trim() : '01'));
          hudK.textContent = kick.textContent.replace(/\s+/g, ' ').trim().replace(/^(\d+)\s*/, '$1 — ');
        }
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
  /* enquanto o CTA do hero está na tela, a barra e o WhatsApp flutuante esperam */
  var heroCta = document.querySelector('.hero__actions');
  if (heroCta && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (ents) { heroCtaVisivel = ents[0].isIntersecting; mostrarBarra(); }, { rootMargin: '-64px 0px 0px 0px', threshold: 0 }).observe(heroCta);
  } else { heroCtaVisivel = false; mostrarBarra(); }
  /* o feixe em loop pausa quando o hero sai da tela (bateria) */
  var heroEl = document.querySelector('.hero');
  if (heroEl && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (ents) { heroEl.classList.toggle('is-fora', !ents[0].isIntersecting); }).observe(heroEl);
  }

  /* ---------- PROVA MEDIDA ([data-metrica]) ---------- */
  var elFps = document.querySelectorAll('[data-metrica="fps"]');
  var elCarga = document.querySelectorAll('[data-metrica="carga"]');
  var elPeso = document.querySelectorAll('[data-metrica="peso"]');
  /* valor e unidade separados: na prova a unidade fica subordinada (<small>);
     nos demais alvos vira texto. Dois createElement: nada de innerHTML. */
  function escrever(lista, valor, unidade) {
    var txt = unidade ? valor + ' ' + unidade : String(valor);
    for (var k = 0; k < lista.length; k++) {
      var el = lista[k];
      if (el.hasAttribute('data-contando') || el.getAttribute('data-txt') === txt) continue;
      el.setAttribute('data-txt', txt);
      if (el.classList.contains('prova__val') && unidade) {
        el.textContent = '';
        var b = document.createElement('b'); b.textContent = String(valor);
        var sm = document.createElement('small'); sm.textContent = unidade;
        el.appendChild(b); el.appendChild(sm);
      } else {
        el.textContent = txt;
      }
      carimbar(el);
    }
  }
  /* o console do hero: cada linha recebe o instante (s desde o início) em que
     o valor chegou, sempre no mesmo formato (00.442). "sistema online" é
     carimbada por último, quando todas as outras visíveis já têm hora: o log
     nunca volta no tempo (achado da rodada 3). */
  function fmt(ms) { var s = (ms / 1000).toFixed(3); return s.length < 6 ? '0' + s : s; }
  function carimbar(el) {
    var linha = el.closest && el.closest('.console__linha');
    var t = linha && linha.querySelector('[data-console-t]');
    if (!t || t.textContent !== '—') return;
    var agora = performance.now();
    t.textContent = fmt(agora);
    /* chegou depois de o log fechar (a rede de 3s): "online" segue sendo a última */
    var on = linha.parentNode.querySelector('.console__linha--on [data-console-t]');
    if (on && on.textContent !== '—' && parseFloat(on.textContent) * 1000 < agora) on.textContent = fmt(agora + 1);
    fecharLog(linha.parentNode);
  }
  function fecharLog(cx, mesmoAssim) {
    var on = cx && cx.querySelector('.console__linha--on [data-console-t]');
    if (!on || on.textContent !== '—') return;
    var ts = cx.querySelectorAll('.console__linha:not(.console__linha--on) [data-console-t]'), maior = 0;
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].offsetParent === null || ts[i].textContent === '—') {
        if (ts[i].offsetParent === null || mesmoAssim) continue;   /* a linha de fps some em movimento reduzido */
        return;
      }
      maior = Math.max(maior, parseFloat(ts[i].textContent) * 1000);
    }
    on.textContent = fmt(Math.max(performance.now(), maior + 1));
  }
  var consoleVp = document.querySelectorAll('[data-console-vp]');
  function viewport() { for (var v = 0; v < consoleVp.length; v++) { consoleVp[v].textContent = window.innerWidth + '×' + window.innerHeight; carimbar(consoleVp[v]); } }
  if (consoleVp.length) {
    viewport();
    var vpTimer = 0;
    window.addEventListener('resize', function () { clearTimeout(vpTimer); vpTimer = setTimeout(viewport, 150); }, { passive: true });
    /* rede: se alguma medida não vier, o console fecha mesmo assim, 3s depois do load */
    window.addEventListener('load', function () { setTimeout(function () { var cx = document.querySelector('[data-console]'); fecharLog(cx, true); }, 3000); }, { once: true });
  }
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
  /* a cascata do console: os arquivos mais demorados deste domínio nesta
     visita, com início e duração reais. Montada uma vez, com createElement.
     Sem entradas, a caixa fica escondida: nenhum número inventado. */
  var cascata = document.querySelector('[data-cascata]');
  function montarCascata() {
    if (!cascata || cascata.childNodes.length) return;
    var lista = [], recursos = performance.getEntriesByType('resource'), total = 0;
    for (var i = 0; i < recursos.length; i++) {
      var r = recursos[i], u;
      try { u = new URL(r.name, location.href); } catch (e) { continue; }
      if (u.origin !== location.origin || !(r.duration > 0)) continue;
      lista.push(r);
      total = Math.max(total, r.responseEnd);
    }
    if (!lista.length || !(total > 0)) { cascata.hidden = true; return; }
    lista.sort(function (a, b) { return b.duration - a.duration; });
    lista = lista.slice(0, window.innerWidth >= 861 ? 6 : 4).sort(function (a, b) { return a.startTime - b.startTime; });
    var maior = lista.reduce(function (m, r) { return r.duration > m.duration ? r : m; }, lista[0]);
    for (var k = 0; k < lista.length; k++) {
      var e = lista[k];
      var linha = document.createElement('div'); linha.className = 'cascata__linha' + (e === maior ? ' cascata__linha--maior' : '');
      var nome = document.createElement('span'); nome.className = 'cascata__nome'; nome.textContent = new URL(e.name, location.href).pathname.split('/').pop() || '/';
      var trilho = document.createElement('span'); trilho.className = 'cascata__trilho';
      var barra = document.createElement('i'); barra.className = 'cascata__barra';
      barra.style.left = (e.startTime / total * 100).toFixed(2) + '%';
      barra.style.width = Math.max(2, e.duration / total * 100).toFixed(2) + '%';
      var ms = document.createElement('span'); ms.className = 'cascata__ms'; ms.textContent = Math.round(e.duration) + ' ms';
      trilho.appendChild(barra); linha.appendChild(nome); linha.appendChild(trilho); linha.appendChild(ms);
      cascata.appendChild(linha);
    }
    /* um quadro depois de existir: a entrada é transição, não salto */
    requestAnimationFrame(function () { requestAnimationFrame(function () { cascata.classList.add('is-pronta'); }); });
  }
  function medidasDeCarga() {
    if (!window.performance || !performance.getEntriesByType) return;
    montarCascata();
    var nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return;
    if (elCarga.length && nav.domContentLoadedEventEnd > 0) escrever(elCarga, (nav.domContentLoadedEventEnd / 1000).toFixed(2), 's');
    var total = bytesDaOrigem(nav);
    if (total > 0 && elPeso.length) escrever(elPeso, Math.round(total / 1024), 'KB');
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
      escrever(elFps, Math.round(s.fps), 'fps');
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
