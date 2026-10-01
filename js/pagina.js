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

  /* ---------- WhatsApp: o número vive num lugar só (js/tel.js) ----------
     ANTES da checagem do BEYON, de propósito. Montar os links não depende do
     organismo — e se js/core.js falhasse, todos os botões de contato da página
     ficavam em `href="#"`: a página inteira sem caminho para o dono. Achado na
     quarta revisão.
     `data-wa` vira o assunto, então a conversa chega qualificada. A mensagem
     padrão muda por página: quem chega pela página de Sites não está pedindo
     diagnóstico de IA. `data-wa-padrao` no <body> define esse texto. */
  /* O número de reserva abaixo é uma DUPLICATA consciente de js/tel.js (a
     revisão apontou, e com razão, que isso fere "o número vive num lugar
     só"). Ficou porque a alternativa é pior: se tel.js falhar, sem reserva
     todos os botões de contato da página viram links mortos. Um número que
     talvez esteja velho ainda leva a conversa ao dono; um link morto perde o
     lead calado. Se o número mudar: `grep -rn 5521977167944` acha as três
     cópias (tel.js, dom.js e esta). */
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

  var B = window.BEYON;
  if (!B) {
    /* sem o núcleo não há reveal animado — então revela tudo de uma vez.
       Sem isto, uma falha de js/core.js deixava todo `.reveal` em opacidade 0:
       os links de WhatsApp funcionavam (acima), mas ninguém os via. Achado na
       sexta revisão. */
    var todos = document.querySelectorAll('.reveal');
    for (var rv = 0; rv < todos.length; rv++) todos[rv].classList.add('is-in');
    return;
  }
  var S = B.S;
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
        toggle.setAttribute('aria-label', 'Abrir menu');
        if (devolverFoco) toggle.focus();
      };
      toggle.addEventListener('click', function () {
        var abrindo = !navEl.classList.contains('is-open');
        navEl.classList.toggle('is-open', abrindo);
        toggle.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
        /* o leitor de tela anuncia o que o botão FAZ agora — com o menu aberto
           ele fecha. O rótulo ficava "Abrir menu" o tempo todo; js/dom.js
           sempre trocou. Achado na terceira revisão. */
        toggle.setAttribute('aria-label', abrindo ? 'Fechar menu' : 'Abrir menu');
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
      /* O DESTAQUE TAMBÉM APAGA.
         A versão anterior só acendia: ao voltar ao hero, ou ao passar por uma
         seção que não está na nav (Prova, Contato, Experiências), o último
         item continuava aceso com `aria-current` — e o leitor de tela
         anunciava um lugar onde a pessoa não estava. Achado na terceira
         revisão. Agora o conjunto das seções que estão na faixa é mantido, e
         quando ele fica vazio, nada fica aceso. */
      var atual = -1, naFaixa = [];
      var marcarAtual = function (idx) {
        if (idx === atual) return;
        if (atual >= 0) {
          mapa[atual].classList.remove('is-current');
          mapa[atual].removeAttribute('aria-current');
        }
        atual = idx;
        if (atual >= 0) {
          mapa[atual].classList.add('is-current');
          mapa[atual].setAttribute('aria-current', 'true');
        }
      };
      var ioNav = new IntersectionObserver(function (ents) {
        for (var n = 0; n < ents.length; n++) {
          var idx = secoes.indexOf(ents[n].target);
          if (idx < 0) continue;
          var pos = naFaixa.indexOf(idx);
          if (ents[n].isIntersecting && pos < 0) naFaixa.push(idx);
          else if (!ents[n].isIntersecting && pos >= 0) naFaixa.splice(pos, 1);
        }
        marcarAtual(naFaixa.length ? naFaixa[naFaixa.length - 1] : -1);
      }, { rootMargin: '-45% 0px -50% 0px' });
      for (var s2 = 0; s2 < secoes.length; s2++) ioNav.observe(secoes[s2]);
    }
  }

  /* ---------- o status do hero ----------
     Uma linha que anuncia o estado do organismo. Escrita por EVENTO (começo e
     fim de Pulso/Singular), nunca por frame. */
  /* Só o texto VISÍVEL muda. A cópia para leitor de tela (`.sr-only`) era
     reescrita a cada evento, mas não é região `aria-live` — ninguém ouvia a
     mudança, era escrita para o vazio. E torná-la `aria-live` seria pior:
     anunciar "Ressonância em curso" a cada 9–20 segundos a quem navega por
     voz é ruído, não informação. O leitor lê o estado de repouso, que é o
     único que diz algo sobre a empresa. Achado na quarta revisão. */
  var statusTxt = document.querySelector('.hero__status-txt');
  function anunciar(txt) {
    if (statusTxt) statusTxt.textContent = txt;
  }

  /* ---------- PULSO ----------
     Uma onda que atravessa a cadeia. O canvas lê S.pulse e S.pulseFront; o DOM
     recebe UMA classe no começo e perde no fim. Mesmos tempos da página de
     automação — é o mesmo organismo, não uma imitação. */
  var REPOUSO = document.body.getAttribute('data-status') || 'Sistema online · Beyon Zero';
  var pulsoAte = 0, proxPulso = 0, DUR = 2600;
  /* BANDEIRA EXPLÍCITA, não inferência por `S.pulse !== 0`.
     O fim do Pulso era detectado olhando se `S.pulse` tinha valor. Mas quem
     dá valor a ele é o frame SEGUINTE ao disparo — e se a pessoa troca de aba
     nesse intervalo, o loop para (document.hidden) e só volta depois do fim
     do Pulso. Aí `S.pulse` nunca saiu do zero, a limpeza nunca rodava, e a
     página ficava presa em `is-pulse` com o status dizendo "Ressonância em
     curso" até um Pulso futuro que também nunca era agendado. Achado na
     segunda revisão. js/dom.js recebeu a mesma correção; o que segue aberto é
     só juntar as duas cópias num módulo (ver a tarefa de extração). */
  var pulsoAtivo = false;
  function agendarPulso(now) { proxPulso = now + 9000 + Math.random() * 11000; }
  function dispararPulso(now, anuncio) {
    if (pulsoAtivo || singAtivo) return false;
    pulsoAte = now + DUR;
    pulsoAtivo = true;
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
    if (pulsoAtivo) {
      pulsoAtivo = false;
      S.pulse = 0; S.pulseFront = 0;
      document.body.classList.remove('is-pulse');
      anunciar(REPOUSO);
      agendarPulso(now);
    }
    if (proxPulso && now > proxPulso && !singAtivo) dispararPulso(now);
  }

  /* ---------- ESTADO SINGULAR — o espetáculo ----------
     Quatro fases, 18s. Publica números em S (`singular`, `warmth`,
     `whiteHot`, `shock`) e uma classe no <body>; quem desenha é o canvas.
     As constantes vêm calibradas da página de automação, inclusive os dois
     ajustes que só uma simulação numérica pegou (o decaimento do branco no
     reinado e o .34 na virada do resfriamento). Mexer aqui reabre degraus
     que já custaram uma sessão para achar. */
  var singAte = 0, proxSing = 0, SDUR = 18000;
  /* mesma bandeira, mesmo motivo do Pulso — e aqui a janela é maior: no
     primeiro frame da CARGA `S.singular` vale ~0, então bastava o loop parar
     uma vez no começo do evento para a classe ficar presa. */
  var singAtivo = false;
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
    if (singAtivo) {
      singAtivo = false;
      S.singular = 0; S.warmth = 0; S.whiteHot = 0; S.shock = -1;
      document.body.classList.remove('is-singular');
      anunciar(REPOUSO);
      proxSing = now + 70000 + Math.random() * 60000;
    }
    if (proxSing && now > proxSing && !pulsoAtivo) {
      singAte = now + SDUR;
      singAtivo = true;
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
  var reconhecimento = 0;       /* 0 = ainda não · 1 = pendente · 2 = entregue */
  function entregarReconhecimento(now) {
    if (reconhecimento !== 1) return;
    if (!dispararPulso(now, grupo.getAttribute('data-reconhecer'))) return;
    reconhecimento = 2;
    /* e o sistema se abre para quem demonstrou interesse: antecipa o
       próximo Singular. Nunca ADIA — se já ia disparar antes, fica. */
    var cedo = now + 12000;
    if (proxSing > cedo) proxSing = cedo;
  }
  if (B.fine && grupo) {
    var alvos = grupo.querySelectorAll('.card');
    var vistos = 0;
    /* A recompensa fica PENDENTE até conseguir disparar. Antes ela era dada
       como entregue antes de saber se o Pulso tinha saído: se a pessoa
       completava os três cartões durante um Pulso ou um Singular, o disparo
       recusava, os listeners `once` já tinham sido removidos, e a descoberta
       sumia em silêncio para aquela visita. Agora o laço de eventos tenta de
       novo assim que o organismo fica livre. Achado na segunda revisão. */
    var marcar = function () {
      if (reconhecimento !== 0) return;
      vistos++;
      if (vistos < alvos.length) return;
      reconhecimento = 1;                      /* pendente */
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
    entregarReconhecimento(s.now);
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
      /* SÓ O QUE SAI DESTE DOMÍNIO — filtrado de verdade, pela origem.
         A versão anterior somava todo recurso e CONFIAVA que os de terceiros
         viriam com tamanho zero. Não vêm: o Google Fonts manda
         `Timing-Allow-Origin: *`, então o tamanho das fontes entrava na soma
         enquanto o texto da página dizia "só o que sai deste domínio". Uma
         afirmação falsa justamente no painel que existe para ser o número
         honesto — contra a regra 2 do CLAUDE.md. Achado na segunda revisão. */
      var total = nav.transferSize || 0;
      var recursos = performance.getEntriesByType('resource');
      for (var p = 0; p < recursos.length; p++) {
        var origem;
        try { origem = new URL(recursos[p].name, location.href).origin; } catch (e) { continue; }
        if (origem !== location.origin) continue;
        total += recursos[p].transferSize || 0;
      }
      if (total > 0) elPeso.textContent = Math.round(total / 1024) + ' KB';
    }
  }
  if (elCarga || elPeso) {
    if (document.readyState === 'complete') medidasDeCarga();
    else window.addEventListener('load', function () { setTimeout(medidasDeCarga, 0); }, { once: true });

    /* O PESO TEM QUE CONTINUAR VERDADEIRO DEPOIS DO LOAD.
       A camada 3D (js/cena.js) baixa o three.js só quando uma cena se aproxima
       da viewport — ou seja, DEPOIS desta medição. Um número medido no load e
       nunca mais tocado viraria mentira no instante em que o 3D descesse, e
       este painel existe justamente para ser o número honesto da página.
       O observador reconta a cada recurso novo; a contagem é barata e acontece
       algumas vezes por visita, nunca por frame. */
    if (window.PerformanceObserver) {
      try {
        new PerformanceObserver(function () { medidasDeCarga(); })
          .observe({ type: 'resource', buffered: false });
      } catch (e) { /* navegador sem suporte: fica a medição do load */ }
    }
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
