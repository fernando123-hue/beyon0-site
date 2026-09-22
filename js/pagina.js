/* ==========================================================================
   PÁGINA — o controlador das páginas novas (Hub e Sites).

   Existe em vez de js/dom.js porque aquele arquivo carrega muita coisa que só
   a página de automação tem (ciclador de palavras do hero, gate de lead,
   reconhecimento das seis capacidades, medidor flutuante). Aqui fica só o que
   TODA página nova precisa — e, integral, a máquina do organismo: Pulso e
   Estado Singular. Eles são a assinatura do site e continuam valendo depois da
   troca de pele visual.

   As leis herdadas da medição (docs/auditoria-performance.md) valem sem
   exceção neste arquivo:
   · nenhuma variável de CSS muda por frame;
   · o que muda por frame são NÚMEROS no estado compartilhado (B.S), e quem
     desenha é o canvas (js/field.js);
   · o DOM recebe CLASSES, poucas vezes por minuto.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B) return;
  var S = B.S;

  /* ---------- WhatsApp: o número vive num lugar só (js/tel.js) ----------
     `data-wa` vira o assunto, então a conversa chega qualificada. A mensagem
     padrão muda por página: quem chega pela página de Sites não está pedindo
     diagnóstico de IA. `data-wa-padrao` no <body> define esse texto. */
  var FONE = window.BEYON_TEL || '5521977167944';
  var PADRAO = document.body.getAttribute('data-wa-padrao') ||
               'quero entender como a Beyon Zero pode ajudar meu negócio';
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
  B.linkWA = linkWA;

  var ano = document.getElementById('year');
  if (ano) ano.textContent = new Date().getFullYear();

  /* painéis que fecham com Escape — um listener só, no fim do arquivo */
  var aoEscapar = [];

  /* ---------- reveals (nível 2) ----------
     O fade sutil da navegação. Só liga depois de 'entrada-pronta'
     (js/entrada.js) e pula o que a LINHA (nível 1) já revelou: os dois níveis
     nunca tocam o mesmo conteúdo. */
  var reveals = document.querySelectorAll('.reveal');
  var reveladoLigado = false;
  function ligarReveals() {
    if (reveladoLigado) return;
    reveladoLigado = true;
    if (!('IntersectionObserver' in window)) {
      for (var r2 = 0; r2 < reveals.length; r2++) reveals[r2].classList.add('is-in');
      return;
    }
    var io = new IntersectionObserver(function (ents) {
      for (var k = 0; k < ents.length; k++) {
        if (!ents[k].isIntersecting) continue;
        var alvo = ents[k].target;
        io.unobserve(alvo);
        if (alvo.closest('.revelando')) continue;
        alvo.classList.add('is-in');
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    for (var r = 0; r < reveals.length; r++) io.observe(reveals[r]);
  }

  if (B.reduced) {
    ligarReveals();                       /* sem linha, sem espera: revela tudo */
  } else {
    B.on('entrada-pronta', ligarReveals);
    /* rede de segurança: se entrada.js falhar e nunca emitir o sinal, o
       conteúdo não pode ficar preso invisível. Presa ao 'booted', que sempre
       acontece; `reveladoLigado` faz o perdedor da corrida virar no-op. */
    var comBooted = function () { setTimeout(ligarReveals, 4000); };
    if (document.body.classList.contains('booted')) comBooted();
    else B.on('booted', comBooted);
  }

  /* ---------- nav ---------- */
  var navEl = document.getElementById('nav');
  if (navEl) {
    /* `is-stuck` por evento, com histerese: trocar a classe exatamente no
       mesmo Y faria a nav piscar quando o scroll oscila 1px. */
    var preso = false;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (!preso && y > 24) { preso = true; navEl.classList.add('is-stuck'); }
      else if (preso && y < 8) { preso = false; navEl.classList.remove('is-stuck'); }
    }, { passive: true });

    /* menu do celular: uma classe, evento discreto */
    var toggle = navEl.querySelector('.nav__toggle');
    var painel = document.getElementById('nav-links');
    if (toggle && painel) {
      toggle.hidden = false;              /* só existe quando o JS pode operá-lo */
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
      /* escolher um destino fecha o menu — senão o painel cobre a seção
         para onde a pessoa acabou de pedir para ir. */
      painel.addEventListener('click', function (e) {
        if (e.target.closest('a')) fechar(false);
      });
      aoEscapar.push(function () { fechar(true); });
    }

    /* seção atual acende na nav. IntersectionObserver, nada por frame.
       Só âncoras internas entram: links para outras páginas não têm seção
       correspondente nesta. */
    var ancoras = navEl.querySelectorAll('.nav__links a[href^="#"]');
    var mapa = [], secoes = [];
    for (var a = 0; a < ancoras.length; a++) {
      var alvo = ancoras[a].getAttribute('href').slice(1);
      var sec = alvo && document.getElementById(alvo);
      if (!sec) continue;
      mapa.push(ancoras[a]); secoes.push(sec);
    }
    if (secoes.length && 'IntersectionObserver' in window) {
      var atual = -1;
      var ioNav = new IntersectionObserver(function (ents) {
        for (var n = 0; n < ents.length; n++) {
          if (!ents[n].isIntersecting) continue;
          var idx = secoes.indexOf(ents[n].target);
          if (idx < 0 || idx === atual) continue;
          if (atual >= 0) {
            mapa[atual].classList.remove('is-current');
            mapa[atual].removeAttribute('aria-current');
          }
          atual = idx;
          mapa[atual].classList.add('is-current');
          mapa[atual].setAttribute('aria-current', 'true');
        }
      }, { rootMargin: '-45% 0px -50% 0px' });
      for (var s2 = 0; s2 < secoes.length; s2++) ioNav.observe(secoes[s2]);
    }
  }

  /* ---------- o status do hero ----------
     Uma linha que anuncia o estado do organismo. Escrita por EVENTO (começo e
     fim de Pulso/Singular), nunca por frame. */
  var statusTxt = document.querySelector('.hero__status-txt');
  var statusSr = document.querySelector('.hero__status .sr-only');
  function anunciar(txt) {
    if (statusTxt) statusTxt.textContent = txt;
    if (statusSr) statusSr.textContent = txt;
  }

  /* ---------- PULSO ----------
     Uma onda que atravessa a cadeia. O canvas lê S.pulse e S.pulseFront; o DOM
     recebe UMA classe no começo e perde no fim. Mesmos tempos da página de
     automação — é o mesmo organismo, não uma imitação. */
  var REPOUSO = document.body.getAttribute('data-status') || 'Sistema online · Beyon Zero';
  var pulsoAte = 0, proxPulso = 0, DUR = 2600;
  function agendarPulso(now) { proxPulso = now + 9000 + Math.random() * 11000; }
  function dispararPulso(now, anuncio) {
    if (pulsoAte > now || S.singular) return false;
    pulsoAte = now + DUR;
    document.body.classList.add('is-pulse');
    anunciar(anuncio || 'Ressonância em curso');
    return true;
  }
  function drivePulso(now) {
    if (now < pulsoAte) {
      var u = 1 - (pulsoAte - now) / DUR;
      S.pulseFront = u;
      S.pulse = Math.sin(u * Math.PI) * .9;
      return;
    }
    if (S.pulse !== 0) {
      S.pulse = 0; S.pulseFront = 0;
      document.body.classList.remove('is-pulse');
      anunciar(REPOUSO);
      agendarPulso(now);
    }
    if (proxPulso && now > proxPulso && !S.singular) dispararPulso(now);
  }

  /* ---------- ESTADO SINGULAR — o espetáculo ----------
     Quatro fases, 18s. Publica números em S (`singular`, `warmth`,
     `whiteHot`, `shock`) e uma classe no <body>; quem desenha é o canvas.
     As constantes vêm calibradas da página de automação, inclusive os dois
     ajustes que só uma simulação numérica pegou (o decaimento do branco no
     reinado e o .34 na virada do resfriamento). Mexer aqui reabre degraus
     que já custaram uma sessão para achar. */
  var singAte = 0, proxSing = 0, SDUR = 18000;
  function driveSingular(now) {
    if (now < singAte) {
      var u = 1 - (singAte - now) / SDUR;
      if (u < .07) {                                  /* CARGA */
        var c = u / .07;
        S.singular = c * .55; S.whiteHot = c * c; S.warmth = 0; S.shock = -1;
      } else if (u < .13) {                           /* IGNIÇÃO */
        var g = (u - .07) / .06;
        S.singular = .55 + g * .45;
        S.whiteHot = 1;
        S.warmth = g * .35;
        S.shock = g;
      } else if (u < .76) {                           /* REINADO */
        var r = (u - .13) / .63;
        S.singular = 1;
        S.warmth = Math.min(1, .35 + r * 1.6);
        var decai = Math.max(0, 1 - r / .18);
        S.whiteHot = .3 + .7 * decai + Math.sin(r * 9) * .1 * (1 - decai);
        S.shock = -1;
      } else {                                        /* RESFRIAMENTO */
        var f = Math.max(0, (1 - u) / .24);
        S.singular = f; S.warmth = f; S.whiteHot = f * .34; S.shock = -1;
      }
      return;
    }
    if (S.singular !== 0) {
      S.singular = 0; S.warmth = 0; S.whiteHot = 0; S.shock = -1;
      document.body.classList.remove('is-singular');
      anunciar(REPOUSO);
      proxSing = now + 70000 + Math.random() * 60000;
    }
    if (proxSing && now > proxSing && !S.pulse) {
      singAte = now + SDUR;
      document.body.classList.add('is-singular');
      anunciar('AI Core no comando');
    }
  }

  /* ---------- RECONHECIMENTO ----------
     Quem passa o cursor por todos os cartões de uma seção marcada com
     `data-reconhecer` recebe uma resposta do organismo: a ressonância
     atravessa a página. Uma vez por visita — repetir viraria um Pulso barato
     a cada passada de mouse. Custo: um listener `once` por cartão. */
  var grupo = document.querySelector('[data-reconhecer]');
  if (B.fine && grupo) {
    var alvos = grupo.querySelectorAll('.card');
    var vistos = 0, jaReconheceu = false;
    var marcar = function () {
      if (jaReconheceu) return;
      vistos++;
      if (vistos < alvos.length) return;
      jaReconheceu = true;
      dispararPulso(S.now, grupo.getAttribute('data-reconhecer'));
      /* e o sistema se abre para quem demonstrou interesse: antecipa o
         próximo Singular. Nunca ADIA — se já ia disparar antes, fica. */
      var cedo = S.now + 12000;
      if (proxSing > cedo) proxSing = cedo;
    };
    for (var ca = 0; ca < alvos.length; ca++) {
      alvos[ca].addEventListener('pointerenter', marcar, { once: true, passive: true });
    }
  }

  var iniciouEm = 0;
  B.add('eventos', function (s) {
    if (!iniciouEm) {
      iniciouEm = s.now;
      agendarPulso(s.now);
      /* o primeiro Singular vem cedo de propósito: é o argumento de venda mais
         forte da página, e a sessão típica é curta demais para o intervalo
         normal. Os seguintes voltam a ser raros. */
      proxSing = s.now + 22000 + Math.random() * 8000;
    }
    drivePulso(s.now);
    driveSingular(s.now);
  });

  /* ---------- PROVA MEDIDA ----------
     O painel de prova da página de Sites não afirma nada que não tenha sido
     medido no aparelho de quem visita: quanto a página levou para ficar
     pronta, quantos KB desceram e quantos quadros por segundo ela sustenta
     AGORA. É o oposto de "+300 projetos, 98% de satisfação" — números que o
     projeto não tem como provar e que a regra de zero invenção proíbe.

     O fps é o único que muda com o tempo, e mesmo ele escreve no máximo 2x por
     segundo, só quando o valor muda de verdade. */
  var elFps = document.querySelector('[data-metrica="fps"]');
  var elCarga = document.querySelector('[data-metrica="carga"]');
  var elPeso = document.querySelector('[data-metrica="peso"]');

  function medidasDeCarga() {
    if (!window.performance || !performance.getEntriesByType) return;
    var nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return;
    if (elCarga) {
      var ms = nav.domContentLoadedEventEnd || nav.responseEnd;
      if (ms > 0) elCarga.textContent = (ms / 1000).toFixed(2) + 's';
    }
    if (elPeso) {
      /* soma o documento e todos os recursos que o navegador reporta. Origem
         cruzada (as fontes do Google) devolve 0 sem Timing-Allow-Origin, então
         o número é declarado como "deste domínio" na própria página — dizer
         "peso total" com um número que exclui terceiros seria mentir. */
      var total = nav.transferSize || 0;
      var recursos = performance.getEntriesByType('resource');
      for (var p = 0; p < recursos.length; p++) total += recursos[p].transferSize || 0;
      if (total > 0) elPeso.textContent = Math.round(total / 1024) + ' KB';
    }
  }
  if (elCarga || elPeso) {
    if (document.readyState === 'complete') medidasDeCarga();
    else window.addEventListener('load', function () { setTimeout(medidasDeCarga, 0); }, { once: true });
  }

  if (elFps) {
    var ultFps = 0, ultTxt = '';
    B.add('medidor', function (s) {
      if (s.now - ultFps < 500) return;
      ultFps = s.now;
      var txt = Math.round(s.fps) + ' fps';
      if (txt !== ultTxt) { ultTxt = txt; elFps.textContent = txt; }
    });
  }

  /* ---------- ESCAPE: um caminho só ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    for (var k = 0; k < aoEscapar.length; k++) aoEscapar[k]();
  });

  /* ---------- REGIME → uma classe no <body> ----------
     O núcleo decide qual é o estado; aqui ele vira classe, e só quando muda. */
  var dormindo = false;
  B.on('regime', function (r) {
    var d = r === 'dormant';
    if (d === dormindo) return;
    dormindo = d;
    document.body.classList.toggle('is-dormant', d);
  });

  B.iniciar();
})();
