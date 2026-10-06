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
    if (!links[i].hasAttribute('aria-label') && !links[i].querySelector('.sr-only')) {
      var aviso = document.createElement('span'); aviso.className = 'sr-only'; aviso.textContent = ' (abre em nova aba)'; links[i].appendChild(aviso);
    }
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

  /* com o menu em tela cheia aberto, o resto da página fica inerte: o Tab
     não sai do menu para links invisíveis por trás (revisão da V4.6) */
  function fundoInerte(sim) {
    /* "Agendar diagnóstico" dentro do menu abre o modal e o menu fecha em seguida: o fundo continua do modal */
    if (!sim && document.body.classList.contains('is-lead-open')) return;
    var fundo = document.querySelectorAll('main, footer, .barra, .wa, .skip-link');
    for (var f = 0; f < fundo.length; f++) { if (sim) fundo[f].setAttribute('inert', ''); else fundo[f].removeAttribute('inert'); }
  }
  if (navEl) {
    var toggle = navEl.querySelector('.nav__toggle');
    var painel = document.getElementById('nav-links');
    if (toggle && painel) {
      toggle.hidden = false;
      html.classList.add('tem-menu');   /* só com JS os links se recolhem (css/base.css) */
      var fechar = function (devolverFoco) {
        if (!navEl.classList.contains('is-open')) return;
        navEl.classList.remove('is-open');
        document.body.classList.remove('is-menu');
        fundoInerte(false);
        toggle.setAttribute('aria-expanded', 'false');
        menuAberto = false; mostrarBarra();
        if (devolverFoco) toggle.focus();
      };
      toggle.addEventListener('click', function () {
        var abrindo = !navEl.classList.contains('is-open');
        navEl.classList.toggle('is-open', abrindo);
        document.body.classList.toggle('is-menu', abrindo);   /* menu em tela cheia: a página por trás não rola */
        fundoInerte(abrindo);
        toggle.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
        menuAberto = abrindo; mostrarBarra();
      });
      painel.addEventListener('click', function (e) { if (e.target.closest('a')) fechar(false); });
      aoEscapar.push(function () { fechar(true); });
      /* a janela cresceu para o desktop com o menu aberto: fecha (senão a barra
         seguia oculta e o menu reaparecia aberto ao voltar ao celular) */
      var mqLarga = window.matchMedia('(min-width: 981px)');
      var aoAlargar = function (e) { if (e.matches) fechar(false); };
      if (mqLarga.addEventListener) mqLarga.addEventListener('change', aoAlargar); else if (mqLarga.addListener) mqLarga.addListener(aoAlargar);
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
  /* a cota do H1: a 1ª pintura desta visita (FCP), medida pelo navegador.
     O Element Timing não serve: depois do SplitText o texto do h1 vive em
     filhos e a entrada não vem. Sem FCP, a cota some (data-metrica-caixa). */
  var elFcp = document.querySelectorAll('[data-metrica="fcp"]');
  function escreverFcp(ms) {
    for (var q = 0; q < elFcp.length; q++) if (elFcp[q].textContent === '—') elFcp[q].textContent = B.num(ms / 1000, 2);
  }
  if (elFcp.length && window.performance && performance.getEntriesByName) {
    var fcp = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcp) escreverFcp(fcp.startTime);
    else if (window.PerformanceObserver) {
      try { new PerformanceObserver(function (l, obs) { var e = l.getEntriesByName('first-contentful-paint')[0]; if (e) { escreverFcp(e.startTime); obs.disconnect(); } }).observe({ type: 'paint', buffered: true }); } catch (e) { /* sem suporte */ }
    }
    window.addEventListener('load', function () { setTimeout(function () {
      for (var q = 0; q < elFcp.length; q++) if (elFcp[q].textContent === '—') { var cx = elFcp[q].closest('.hero__cota'); if (cx) cx.style.visibility = 'hidden';   /* some sem tirar do layout: nada pula sob o CTA */ }
    }, 3000); }, { once: true });
  }
  /* troca o texto sem trocar o nó quando dá: recriar nós a cada número (o fps, 2×/s) acionava o MutationObserver
     da rede (js/rede.js), que remedia a página inteira a cada 0,5 s e apagava o surto das estações em voo */
  function trocarTexto(el, txt) {
    if (el.childNodes.length === 1 && el.firstChild.nodeType === 3) el.firstChild.nodeValue = txt;
    else el.textContent = txt;
  }
  /* valor e unidade separados: na prova a unidade fica subordinada (<small>);
     nos demais alvos vira texto. Dois createElement: nada de innerHTML. */
  /* `data-so-numero`: a unidade é um nó fixo no HTML ao lado (console) */
  function escrever(lista, valor, unidade) {
    var txt = unidade ? valor + ' ' + unidade : String(valor);
    for (var k = 0; k < lista.length; k++) {
      var el = lista[k];
      if (el.hasAttribute('data-contando') || el.getAttribute('data-txt') === txt) continue;
      el.setAttribute('data-txt', txt);
      if (el.hasAttribute('data-so-numero')) {
        trocarTexto(el, String(valor));
      } else if (el.classList.contains('prova__val') && unidade) {
        var b = el.querySelector(':scope > b'), sm = el.querySelector(':scope > small');
        if (b && sm) { trocarTexto(b, String(valor)); trocarTexto(sm, unidade); }   /* já montado: só o texto */
        else {
          el.textContent = '';
          b = document.createElement('b'); b.textContent = String(valor);
          sm = document.createElement('small'); sm.textContent = unidade;
          el.appendChild(b); el.appendChild(sm);
        }
      } else {
        trocarTexto(el, txt);
      }
      carimbar(el);
    }
  }
  /* o console do hero é um log: cada linha recebe a hora (s desde o início,
     formato 00.442) em que foi IMPRESSA, e imprime em ordem. Um valor que
     chega antes do da linha de cima espera por ela; "sistema online" (sem
     valor próprio) fecha o log. Assim a coluna nunca volta no tempo, em
     qualquer rede (achado da revisão da rodada 3). */
  function fmt(ms) { var s = B.num(ms / 1000, 3); return s.length < 6 ? '0' + s : s; }
  function carimbar(el) {
    var linha = el.closest && el.closest('.console__linha');
    if (!linha || linha.hasAttribute('data-pronta')) return;
    linha.setAttribute('data-pronta', '');
    imprimirLog(linha.parentNode, false);
  }
  /* percorre as linhas em ordem e carimba enquanto houver linha pronta; a
     linha de fps some em movimento reduzido (offsetParent nulo) e não conta.
     `mesmoAssim`: a rede de 3s depois do load, para uma medida que não veio. */
  function imprimirLog(cx, mesmoAssim) {
    var ts = cx ? cx.querySelectorAll('[data-console-t]') : [];
    var ultimo = 0;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], linha = t.closest('.console__linha');
      if (t.textContent !== '—') { ultimo = parseFloat(t.textContent.replace(',', '.')) * 1000; continue; }
      if (t.offsetParent === null) continue;
      var pronta = linha.hasAttribute('data-pronta') || linha.classList.contains('console__linha--on') || mesmoAssim;
      if (!pronta) return;
      ultimo = Math.max(performance.now(), ultimo + 1);
      t.textContent = fmt(ultimo);
    }
  }
  /* rede: se alguma medida não vier, o console fecha mesmo assim, 3s depois do load */
  var consoleEl = document.querySelector('[data-console]');
  if (consoleEl) window.addEventListener('load', function () { setTimeout(function () { imprimirLog(consoleEl, true); }, 3000); }, { once: true });
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
  function papelDe(caminho) {
    if (/\.css$/.test(caminho)) return 'aparência';
    if (/\.woff2$/.test(caminho)) return 'tipografia';
    if (/(gsap|SplitText|ScrollTrigger|anima)[^/]*\.js$/.test(caminho)) return 'movimento';
    if (/\.js$/.test(caminho)) return 'interação';
    return null;
  }
  function montarCascata() {
    if (!cascata || cascata.childNodes.length) return;
    /* por PAPEL, não por arquivo: o cliente lê "aparência terminou em 412 ms".
       Cada grupo mostra o instante em que terminou (maior responseEnd). Não
       soma durações: as requisições correm em paralelo e a soma seria falsa. */
    var grupos = {}, recursos = performance.getEntriesByType('resource'), total = 0;
    for (var i = 0; i < recursos.length; i++) {
      var r = recursos[i], u;
      try { u = new URL(r.name, location.href); } catch (e) { continue; }
      if (u.origin !== location.origin || !(r.responseEnd > 0)) continue;
      var papel = papelDe(u.pathname);
      if (!papel) continue;
      var g = grupos[papel] || (grupos[papel] = { nome: papel, ini: r.startTime, fim: r.responseEnd });
      g.ini = Math.min(g.ini, r.startTime); g.fim = Math.max(g.fim, r.responseEnd);
      total = Math.max(total, r.responseEnd);
    }
    var lista = Object.keys(grupos).map(function (k) { return grupos[k]; });
    if (!lista.length || !(total > 0)) { cascata.hidden = true; return; }
    lista.sort(function (a, b) { return a.ini - b.ini; });
    var ultimo = lista.reduce(function (m, x) { return x.fim > m.fim ? x : m; }, lista[0]);
    for (var k = 0; k < lista.length; k++) {
      var e = lista[k];
      var linha = document.createElement('div'); linha.className = 'cascata__linha' + (e === ultimo ? ' cascata__linha--ultimo' : '');
      var nome = document.createElement('span'); nome.className = 'cascata__nome'; nome.textContent = e.nome;
      var trilho = document.createElement('span'); trilho.className = 'cascata__trilho';
      var barra = document.createElement('i'); barra.className = 'cascata__barra';
      barra.style.left = (e.ini / total * 100).toFixed(2) + '%';
      barra.style.width = Math.max(2, (e.fim - e.ini) / total * 100).toFixed(2) + '%';
      var ms = document.createElement('span'); ms.className = 'cascata__ms'; /* o tempo só na linha do grupo que terminou por último: grupos paralelos empatam e o número repetido parecia cópia */
      ms.textContent = e === ultimo ? B.num(Math.round(e.fim)) + ' ms' : '';
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
    if (elCarga.length && nav.domContentLoadedEventEnd > 0) escrever(elCarga, B.num(nav.domContentLoadedEventEnd / 1000, 2), 's');
    /* a etiqueta do feixe: o tempo real deste boot, escrito uma vez */
    var tag = document.querySelector('[data-feixe-tag]');
    if (tag && !tag.textContent && nav.domContentLoadedEventEnd > 0) tag.textContent = 'pronta em ' + B.num(nav.domContentLoadedEventEnd / 1000, 2) + ' s';
    var total = bytesDaOrigem(nav);
    /* a linha "transferido" do console é um REGISTRO: depois de carimbada,
       congela no valor daquele instante (o peso do site). O que chega depois
       (o AI Core) entra na linha dele, com o próprio peso (js/nucleo/boot.js);
       a Prova ("até agora") continua somando tudo. Antes o console mudava de
       410 para 918 KB conforme o instante da leitura (crítica, rodada 2). */
    var pesoVivo = [].filter.call(elPeso, function (el) {
      var linha = el.closest('.console__linha'), t = linha && linha.querySelector('[data-console-t]');
      return !t || t.textContent === '—';
    });
    if (total > 0 && pesoVivo.length) escrever(pesoVivo, B.num(Math.round(total / 1024)), 'KB');
  }
  if (elCarga.length || elPeso.length) {
    if (document.readyState === 'complete') medidasDeCarga();
    else window.addEventListener('load', function () { setTimeout(medidasDeCarga, 0); }, { once: true });
    if (window.PerformanceObserver) {
      try {
        var po = new PerformanceObserver(function () { medidasDeCarga(); });
        po.observe({ type: 'resource', buffered: false });
        /* o que carrega tarde é o AI Core (three, logo depois do load) e o
           número o inclui: é o que a visita transferiu de fato. Depois de 6s
           do load, o observador sai */
        window.addEventListener('load', function () { setTimeout(function () { po.disconnect(); medidasDeCarga(); }, 6000); }, { once: true });
      } catch (e) { /* sem suporte */ }
    }
  }
  if (elFps.length && !B.reduced) {
    var ultFps = 0;
    B.add('medidor', function (s) {
      if (s.now - ultFps < 500) return;
      ultFps = s.now;
      escrever(elFps, B.num(Math.round(s.fps)), 'fps');
    });
    /* em movimento reduzido não há o que medir: o item de fps da prova some
       (css/motion.css) e a trilha diz o porquê em vez de um traço */
    B.on('reduzir', function (sim) { if (sim) { B.remove('medidor'); escrever(elFps, 'movimento reduzido'); } });
  } else if (elFps.length) {
    escrever(elFps, 'movimento reduzido');
  }


  /* ---------- interruptores "menos movimento" (no topo, como skip-link, e no rodapé) ---------- */
  var btnsMov = [].slice.call(document.querySelectorAll('[data-movimento], .footer__motion'));
  /* com prefers-reduced-motion ligado no sistema, o interruptor não tem o que
     fazer: o sistema manda, e um botão que não ativa nada mentiria */
  if (B.sistemaReduz) { btnsMov.forEach(function (b) { b.hidden = true; }); btnsMov = []; }
  if (btnsMov.length) {
    var rotular = function () {
      var ligado = html.classList.contains('menos-movimento') ? 'true' : 'false';
      btnsMov.forEach(function (b) { b.setAttribute('aria-pressed', ligado); });
    };
    rotular();
    btnsMov.forEach(function (b, i) {
      b.addEventListener('click', function () {
        var ligar = !html.classList.contains('menos-movimento');
        B.reduzir(ligar, true);
        /* reduzir desmonta a coreografia (splits, gatilhos, medidor) de vez;
           religar o movimento é recarregar, com a preferência já gravada — guardando a rolagem e o foco
           (a recarga devolvia a pessoa ao topo, sem foco: auditoria 2026-10-06) */
        if (!ligar) { try { sessionStorage.setItem('bz-volta', window.scrollY + '|' + i); } catch (e) { /* sem armazenamento */ } location.reload(); return; }
        rotular();
      });
    });
    /* a volta da recarga: mesma rolagem, foco no interruptor que foi usado */
    try {
      var volta = sessionStorage.getItem('bz-volta');
      if (volta) {
        sessionStorage.removeItem('bz-volta');
        var partes = volta.split('|'), alvoMov = btnsMov[+partes[1]] || btnsMov[0];
        window.addEventListener('load', function () { window.scrollTo({ top: +partes[0] || 0, behavior: 'instant' }); if (alvoMov) alvoMov.focus({ preventScroll: true }); }, { once: true });
      }
    } catch (e) { /* sem armazenamento */ }
  }

  B.iniciar();
})();
