/* ==========================================================================
   ORGANISMO — Pulso, Estado Singular, status do hero e reconhecimento.
   UM lugar (antes vivia duplicado em pagina.js e dom.js).

   Publica NÚMEROS em B.S (pulse, pulseFront, singular, warmth, whiteHot,
   shock) e uma classe no <body> no começo e no fim de cada evento. Quem
   desenha é o canvas. Nenhuma variável de CSS muda por frame.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B) return;
  var S = B.S;

  /* ---------- o status do hero: só o texto VISÍVEL muda, por evento ---------- */
  var REPOUSO = document.body.getAttribute('data-status') || 'Sistema online · Beyon Zero';
  var stEl = document.querySelector('.hero__status-txt');
  /* a troca embaralha o texto em glifos de sinal por ~0,7s — um elemento só,
     custo de um textContent por frame enquanto dura */
  var GL = '01<>/\\[]{}=+*#%&ABCDEF';
  function morph(de, para, p) {
    var L = Math.max(de.length, para.length), out = '';
    for (var i = 0; i < L; i++) {
      var r = (p - (i / (L || 1)) * .5) / .4;
      if (r >= 1) out += para.charAt(i);
      else if (r <= -.35) out += de.charAt(i);
      else out += (para.charAt(i) === ' ' && de.charAt(i) === ' ') ? ' ' : GL.charAt((Math.random() * GL.length) | 0);
    }
    return out;
  }
  var stDe = REPOUSO, stPara = REPOUSO, stP = 1, stMostrado = REPOUSO;
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
  B.morph = morph;

  /* ---------- PULSO: uma onda que atravessa a cadeia ---------- */
  var pulsoAte = 0, proxPulso = 0, DUR = 2600;
  var pulsoAtivo = false, singAtivo = false;
  function agendarPulso(now) { proxPulso = now + 9000 + Math.random() * 11000; }
  function dispararPulso(now, anuncio) {
    if (pulsoAtivo || singAtivo) return false;
    pulsoAtivo = true;
    pulsoAte = now + DUR;
    document.body.classList.add('is-pulse');
    anunciar(anuncio || 'Ressonância em curso');
    B.emit('pulso', true);
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
      B.emit('pulso', false);
    }
    if (proxPulso && now > proxPulso && !singAtivo) dispararPulso(now);
  }

  /* ---------- ESTADO SINGULAR: quatro fases, 18s ----------
     CARGA (0–7%) · IGNIÇÃO (7–13%) · REINADO (13–76%) · RESFRIAMENTO. As
     constantes são as calibradas por simulação (degraus no branco já custaram
     uma sessão para achar). */
  var singAte = 0, proxSing = 0, SDUR = 18000;
  function driveSingular(now) {
    if (now < singAte) {
      var u = 1 - (singAte - now) / SDUR;
      if (u < .07) {
        var c = u / .07;
        S.singular = c * .55; S.whiteHot = c * c; S.warmth = 0; S.shock = -1;
      } else if (u < .13) {
        var g = (u - .07) / .06;
        S.singular = .55 + g * .45; S.whiteHot = 1; S.warmth = g * .35; S.shock = g;
      } else if (u < .76) {
        var r = (u - .13) / .63;
        S.singular = 1;
        S.warmth = Math.min(1, .35 + r * 1.6);
        var decai = Math.max(0, 1 - r / .18);
        S.whiteHot = .3 + .7 * decai + Math.sin(r * 9) * .1 * (1 - decai);
        S.shock = -1;
      } else {
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
      B.emit('singular', false);
    }
    if (proxSing && now > proxSing && !pulsoAtivo) {
      singAtivo = true;
      singAte = now + SDUR;
      document.body.classList.add('is-singular');
      anunciar('AI Core no comando');
      B.emit('singular', true);
    }
  }

  /* ---------- RECONHECIMENTO: quem percorre todos os cartões de uma seção
     `data-reconhecer` recebe uma resposta — uma vez por visita ---------- */
  var grupo = document.querySelector('[data-reconhecer]');
  var reconhecimento = 0;   /* 0 = ainda não · 1 = pendente · 2 = entregue */
  function entregarReconhecimento(now) {
    if (reconhecimento !== 1) return;
    if (!dispararPulso(now, grupo.getAttribute('data-reconhecer'))) return;
    reconhecimento = 2;
    var cedo = now + 12000;
    if (proxSing > cedo) proxSing = cedo;
  }
  if (B.fine && grupo) {
    var alvos = grupo.querySelectorAll('.card');
    var vistos = 0;
    var marcar = function () {
      if (reconhecimento !== 0) return;
      vistos++;
      if (vistos >= alvos.length) reconhecimento = 1;
    };
    for (var ca = 0; ca < alvos.length; ca++) {
      alvos[ca].addEventListener('pointerenter', marcar, { once: true, passive: true });
    }
  }

  var iniciouEm = 0;
  B.add('organismo', function (s) {
    if (B.reduced) return;                      /* movimento reduzido: nada acontece */
    if (!iniciouEm) {
      iniciouEm = s.now;
      agendarPulso(s.now);
      /* o primeiro Singular vem cedo: é o argumento mais forte da página */
      proxSing = s.now + 22000 + Math.random() * 8000;
    }
    entregarReconhecimento(s.now);
    drivePulso(s.now);
    driveSingular(s.now);
    driveStatus(s.dt);
  });

  /* "menos movimento" no meio de um evento: nada fica preso (texto
     embaralhado, classe colada, números do canvas) */
  B.on('reduzir', function (sim) {
    if (!sim) return;
    pulsoAtivo = singAtivo = false; pulsoAte = singAte = 0;
    S.pulse = S.pulseFront = S.singular = S.warmth = S.whiteHot = 0; S.shock = -1;
    document.body.classList.remove('is-pulse', 'is-singular');
    stP = 1; stMostrado = stPara = REPOUSO;
    if (stEl) stEl.textContent = REPOUSO;
  });

  /* regime → uma classe no <body>, só quando muda */
  var dormindo = false;
  B.on('regime', function (r) {
    var d = r === 'dormant';
    if (d === dormindo) return;
    dormindo = d;
    document.body.classList.toggle('is-dormant', d);
  });
})();
