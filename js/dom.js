/* ==========================================================================
   DOM E EVENTOS

   Regra que este arquivo respeita à risca: o CSS só é tocado em EVENTOS
   discretos — uma classe que entra ou sai, poucas vezes por minuto. O Pulso e o
   Estado Singular escrevem NÚMEROS no estado compartilhado, e quem os desenha
   é o canvas. Nenhuma variável de CSS muda por frame.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B) return;
  var S = B.S;

  /* ---------- WhatsApp: o número vive num lugar só ----------
     O valor de data-wa vira o assunto da mensagem, então a conversa já chega
     qualificada ("quero um site para meu restaurante" em vez de "quero um
     site"). Sem valor, cai na mensagem genérica. */
  var FONE = '5521977167944';
  function linkWA(assunto) {
    var txt = assunto
      ? 'Oi! Vim pelo site da beyon.0 e quero um orçamento para ' + assunto + '.'
      : 'Oi! Vim pelo site da beyon.0 e quero um orçamento pro meu site.';
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

  /* ---------- reveals — nível 2: o fade sutil da navegação ----------
     Uma transição, disparada uma vez ao entrar na viewport. Só LIGA depois
     de 'entrada-pronta' (js/entrada.js): assim não revela nada por baixo do
     overlay de vídeo, e a seção que a LINHA (nível 1) já revelou é pulada
     aqui — os dois níveis não competem pelo mesmo conteúdo. */
  var reveals = document.querySelectorAll('.reveal');
  function ligarReveals() {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        for (var k = 0; k < ents.length; k++) {
          if (!ents[k].isIntersecting) continue;
          var alvo = ents[k].target;
          io.unobserve(alvo);                        /* cumpriu o papel, sai da lista */
          if (alvo.closest('.revelando')) continue;  /* a linha cuida desses */
          alvo.classList.add('is-in');
        }
      }, { rootMargin: '0px 0px -8% 0px' });
      for (var r = 0; r < reveals.length; r++) io.observe(reveals[r]);
    } else {
      for (var r2 = 0; r2 < reveals.length; r2++) reveals[r2].classList.add('is-in');
    }
  }

  var reveladoLigado = false;
  function ligarUmaVez() { if (reveladoLigado) return; reveladoLigado = true; ligarReveals(); }

  if (B.reduced) {
    ligarUmaVez();                       /* sem linha, sem espera: revela tudo */
  } else {
    B.on('entrada-pronta', ligarUmaVez);
    /* rede de segurança: se js/entrada.js sumir/falhar e nunca emitir
       'entrada-pronta', não deixa os reveals presos escondidos. Presa ao
       'booted' (não ao 'load'): 'booted' só dispara DEPOIS da intro, então
       o fallback nunca ganha a corrida do caminho normal — entrada.js emite
       'entrada-pronta' em booted+2rAF, bem antes destes 4s. Assim o IO nunca
       arma antes de `.revelando`, e a garantia de não-flicker não depende do
       overlay opaco. `reveladoLigado` faz o perdedor virar no-op. */
    var comBooted = function () { setTimeout(ligarUmaVez, 4000); };
    if (document.body.classList.contains('booted')) comBooted();
    else B.on('booted', comBooted);
  }

  /* ---------- borda de energia: pausa fora da viewport ----------
     A borda de luz dos cards anima um @property em CSS. Fora da tela ela não
     precisa pintar: o IO marca .is-idle e o CSS pausa (animation-play-state).
     Discreto — dispara no cruzamento do limiar, nada por frame. Ao voltar,
     retoma de onde parou, sem pipocar. */
  if ('IntersectionObserver' in window) {
    var ioBorda = new IntersectionObserver(function (ents) {
      for (var b = 0; b < ents.length; b++) {
        ents[b].target.classList.toggle('is-idle', !ents[b].isIntersecting);
      }
    }, { rootMargin: '140px 0px 140px 0px' });
    var cardsBorda = document.querySelectorAll('.card');
    for (var cb = 0; cb < cardsBorda.length; cb++) ioBorda.observe(cardsBorda[cb]);
  }

  /* ---------- menu do celular: uma classe, por clique ----------
     O botão nasce [hidden] e só é revelado aqui: se este script falhar, ninguém
     vê um controle inerte (o CSS sozinho deixaria os links fechados e sem saída). */
  var navEl = document.getElementById('nav');
  var navBtn = document.querySelector('.nav__toggle');
  var navLista = document.getElementById('nav-links');
  if (navEl && navBtn && navLista) {
    navBtn.hidden = false;
    var fecharMenu = function (devolverFoco) {
      if (!navEl.classList.contains('is-open')) return;
      navEl.classList.remove('is-open');
      navBtn.setAttribute('aria-expanded', 'false');
      navBtn.setAttribute('aria-label', 'Abrir menu');
      if (devolverFoco) navBtn.focus();
    };
    navBtn.addEventListener('click', function () {
      var abrindo = !navEl.classList.contains('is-open');
      navEl.classList.toggle('is-open', abrindo);
      navBtn.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
      navBtn.setAttribute('aria-label', abrindo ? 'Fechar menu' : 'Abrir menu');
    });
    /* escolher um destino fecha o menu — senão ele tampa a seção recém-aberta */
    navLista.addEventListener('click', function (e) {
      if (e.target.closest('a')) fecharMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fecharMenu(true);
    });
  }

  /* ---------- nav: uma classe, no cruzamento do limiar ---------- */
  var nav = document.getElementById('nav');
  var presa = false;
  window.addEventListener('scroll', function () {
    var quer = window.scrollY > 40;
    if (quer !== presa) { presa = quer; nav.classList.toggle('is-stuck', quer); }
  }, { passive: true });

  /* ---------- onde estou: a seção atual acende na nav ----------
     Num site de página única a pessoa perde a referência de lugar. O
     IntersectionObserver só dispara ao cruzar o limiar — nada por frame. A
     faixa de leitura é o terço superior da tela, logo abaixo da nav. */
  if ('IntersectionObserver' in window) {
    var doNav = {};
    var ancoras = nav.querySelectorAll('.nav__links a[href^="#"]');
    for (var a = 0; a < ancoras.length; a++) {
      var alvo = ancoras[a].getAttribute('href').slice(1);
      if (alvo) doNav[alvo] = ancoras[a];
    }
    var visiveis = {};
    var atual = null;
    var ioSecao = new IntersectionObserver(function (ents) {
      for (var i = 0; i < ents.length; i++) visiveis[ents[i].target.id] = ents[i].isIntersecting;
      /* a primeira seção visível na ordem do documento manda */
      var novo = null;
      for (var id in doNav) if (visiveis[id]) { novo = id; break; }
      if (novo === atual) return;
      if (atual && doNav[atual]) {
        doNav[atual].classList.remove('is-current');
        doNav[atual].removeAttribute('aria-current');
      }
      atual = novo;
      if (atual) {
        doNav[atual].classList.add('is-current');
        doNav[atual].setAttribute('aria-current', 'true');
      }
    }, { rootMargin: '-80px 0px -66% 0px' });   /* -80px = altura da nav fixa */
    for (var idSec in doNav) {
      var sec = document.getElementById(idSec);
      if (sec) ioSecao.observe(sec);
    }
  }

  /* ---------- reescrita de texto pelo glitch ----------
     Um elemento só. O efeito custa o que custa mexer em um textContent. */
  var GL = '01<>/\\[]{}=+*#%&ABCDEF';
  function morph(de, para, p) {
    var L = Math.max(de.length, para.length), out = '';
    for (var i = 0; i < L; i++) {
      var r = (p - (i / (L || 1)) * .5) / .4;
      if (r >= 1) out += para.charAt(i);
      else if (r <= -.35) out += de.charAt(i);
      else out += (para.charAt(i) === ' ' && de.charAt(i) === ' ')
        ? ' ' : GL.charAt((Math.random() * GL.length) | 0);
    }
    return out;
  }

  var stEl = document.querySelector('.hero__status-txt');
  var stDe = 'Sistema online · beyon.0', stPara = stDe, stP = 1, stMostrado = stDe;
  function anunciar(txt) {
    if (txt === stPara) return;
    stDe = stMostrado; stPara = txt; stP = 0;
  }
  function driveStatus(dt) {
    if (!stEl || stP >= 1) return;
    stP = Math.min(1, stP + dt / 700);
    var s = stP >= 1 ? stPara : morph(stDe, stPara, stP);
    if (s !== stMostrado) { stMostrado = s; stEl.textContent = s; }
  }

  /* ---------- PULSO ----------
     Uma onda que atravessa a cadeia. O canvas lê S.pulse e S.pulseFront; o DOM
     recebe UMA classe no começo e perde no fim. */
  var pulsoAte = 0, proxPulso = 0, DUR = 2600;
  function agendarPulso(now) {
    proxPulso = now + 9000 + Math.random() * 11000;
  }

  function drivePulso(now, dt) {
    if (now < pulsoAte) {
      var u = 1 - (pulsoAte - now) / DUR;                 /* 0..1 */
      S.pulseFront = u;
      S.pulse = Math.sin(u * Math.PI) * .9;              /* sobe e volta */
      return;
    }
    if (S.pulse !== 0) {
      S.pulse = 0; S.pulseFront = 0;
      document.body.classList.remove('is-pulse');
      anunciar('Sistema online · beyon.0');
      agendarPulso(now);
    }
    if (proxPulso && now > proxPulso && !S.singular) {
      pulsoAte = now + DUR;
      document.body.classList.add('is-pulse');
      anunciar('Ressonância em curso');
    }
  }

  /* ---------- ESTADO SINGULAR ----------
     Raro. Aquece de ciano a dourado, sustenta e volta. A cor do canvas sai de
     S.warmth; o DOM só ganha a classe .is-singular, e o CSS resolve a transição
     de cor sozinho nos poucos pontos onde ela é assinatura. */
  var singAte = 0, proxSing = 0, SDUR = 14000;
  function driveSingular(now) {
    if (now < singAte) {
      var u = 1 - (singAte - now) / SDUR;
      /* sobe em 1,5s, sustenta, esfria nos 3s finais */
      var w = u < .11 ? u / .11 : (u > .78 ? Math.max(0, (1 - u) / .22) : 1);
      S.singular = w; S.warmth = w;
      return;
    }
    if (S.singular !== 0) {
      S.singular = 0; S.warmth = 0;
      document.body.classList.remove('is-singular');
      anunciar('Sistema online · beyon.0');
      proxSing = now + 70000 + Math.random() * 60000;
    }
    if (proxSing && now > proxSing && !S.pulse) {
      singAte = now + SDUR;
      document.body.classList.add('is-singular');
      anunciar('AI Core no comando');
    }
  }

  var iniciou = 0;
  B.add('eventos', function (s) {
    if (!iniciou) {
      iniciou = s.now;
      agendarPulso(s.now);
      proxSing = s.now + 45000 + Math.random() * 40000;
    }
    drivePulso(s.now, s.dt);
    driveSingular(s.now);
    driveStatus(s.dt);
  });

  /* ---------- medidor: números reais, atualizado 2x por segundo ---------- */
  var med = document.querySelector('.medidor__txt');
  var led = document.querySelector('.medidor__led');
  var ultMed = 0, ultTxt = '', ultCor = '';
  if (med) {
    B.add('medidor', function (s) {
      if (s.now - ultMed < 500) return;
      ultMed = s.now;
      /* só escreve quando o valor MUDA: escrever a mesma string 2x por segundo
         sujava o elemento à toa. */
      var txt = Math.round(s.fps) + ' fps · ' + Math.round(s.budget * 100) + '%';
      if (txt !== ultTxt) { ultTxt = txt; med.textContent = txt; }
      var cor = s.fps > 50 ? 'var(--glow)' : (s.fps > 35 ? 'var(--gold)' : 'var(--led)');
      if (cor !== ultCor) { ultCor = cor; led.style.background = cor; }
    });
  }

  /* a nota do medidor: o número sozinho não diz nada a quem não é técnico.
     Uma classe, por clique — nada por frame. */
  var medBtn = document.querySelector('.medidor__btn');
  var medNota = document.getElementById('medidor-nota');
  var medCaixa = document.querySelector('.medidor');
  if (medBtn && medNota) {
    if (medCaixa) medCaixa.hidden = false;   /* só aparece depois de ligado */
    medBtn.addEventListener('click', function () {
      var abrindo = medNota.hidden;
      medNota.hidden = !abrindo;
      medBtn.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
    });
    /* Esc fecha, como qualquer painel sobreposto */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || medNota.hidden) return;
      medNota.hidden = true;
      medBtn.setAttribute('aria-expanded', 'false');
      medBtn.focus();
    });
  }

  B.iniciar();
})();
