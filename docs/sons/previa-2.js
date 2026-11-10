/* Prévia 2 dos sons (2026-11-10, dono: o fundo "pesado" deve virar "Sci-Fi confortador"; sons para o AI Core médio
   e as interações especiais; o pulso do AI Core principal com som próprio, frequente sem cansar).
   Tudo gerado (Web Audio). As vozes escolhidas aqui vão para js/som.js com os mesmos números. */
(function () {
  'use strict';
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var c = null, mestre = null, eco = null;
  var PISO = 0.0001, PERIODO = 7, INSPIRA = 0.42;

  function abrir() {
    if (c) { if (c.state !== 'running') c.resume(); return; }
    c = new Ctx();
    mestre = c.createGain(); mestre.gain.value = 1; mestre.connect(c.destination);
    /* o eco gerado (como em js/som.js): 1,6 s, escuro */
    var n = Math.round(c.sampleRate * 1.6), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    var conv = c.createConvolver(), escuro = c.createBiquadFilter();
    conv.buffer = b; escuro.type = 'lowpass'; escuro.frequency.value = 4200;
    eco = c.createGain(); eco.gain.value = 0.5; eco.connect(conv); conv.connect(escuro); escuro.connect(mestre);
  }
  function saida(molhado, pan, vol) {
    var g = c.createGain(), no = g; g.gain.value = vol;
    if (pan && c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); no = p; }
    no.connect(mestre);
    if (molhado) { var s = c.createGain(); s.gain.value = molhado; no.connect(s); s.connect(eco); }
    return g;
  }
  function env(g, t, ataque, pico, queda) {
    g.gain.setValueAtTime(PISO, t);
    g.gain.exponentialRampToValueAtTime(Math.max(pico, PISO * 2), t + ataque);
    g.gain.exponentialRampToValueAtTime(PISO, t + ataque + queda);
  }
  function osc(tipo, f, t, ataque, pico, queda, para, fFim) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t);
    if (fFim) o.frequency.exponentialRampToValueAtTime(fFim, t + ataque + queda);
    env(g, t, ataque, pico, queda); o.connect(g); g.connect(para);
    o.start(t); o.stop(t + ataque + queda + 0.05);
  }
  var ruidoBuf = null;
  function ruido(t, ataque, pico, queda, para, f) {
    if (!ruidoBuf) { ruidoBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); var d = ruidoBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = ruidoBuf; fl.type = f.tipo || 'bandpass'; fl.frequency.setValueAtTime(f.f, t); fl.Q.value = f.q || 1;
    if (f.fFim) fl.frequency.exponentialRampToValueAtTime(f.fFim, t + ataque + queda);
    env(g, t, ataque, pico, queda); s.connect(fl); fl.connect(g); g.connect(para);
    s.start(t, Math.random()); s.stop(t + ataque + queda + 0.05);
  }

  /* ---------- O FUNDO ---------- */
  /* cada nota: [Hz, forma, peso, desafinação em cents, s do balanço (0 = parado)]. A cabine e a orbital trocam o
     grave de 110 Hz (o "pesado") por um acorde aberto no meio, com duas vozes por nota levemente desafinadas
     (o batimento lento é o que dá o "vivo") e um ar de ruído filtrado bem baixo */
  var FUNDOS = {
    hoje:    { vol: 0.05, notas: [[110, 'triangle', 1, 0, 0], [165, 'sine', 0.5, 3, 0], [220, 'sine', 0.35, -4, 0]], filtro: [600, 900], ar: 0 },
    cabine:  { vol: 0.034, notas: [[220, 'sine', 1, 0, 0], [329.63, 'sine', 0.7, 0, 11], [493.88, 'sine', 0.32, 0, 13], [554.37, 'sine', 0.22, 0, 17]], filtro: [1500, 2400], ar: 0.006, coro: 5 },
    orbital: { vol: 0.03, notas: [[293.66, 'sine', 1, 0, 0], [440, 'sine', 0.6, 0, 9], [659.25, 'sine', 0.3, 0, 12], [830.61, 'sine', 0.16, 0, 15]], filtro: [1800, 3000], ar: 0.008, coro: 7 }
  };
  var fundoVivo = null, fundoNome = 'cabine', timerFolego = 0;
  function montarFundo(nome) {
    var F = FUNDOS[nome], t = c.currentTime;
    var out = c.createGain(), fl = c.createBiquadFilter(), fontes = [];
    out.gain.setValueAtTime(PISO, t); out.gain.exponentialRampToValueAtTime(F.vol, t + 2);
    fl.type = 'lowpass'; fl.frequency.value = F.filtro[0]; fl.Q.value = 0.5; fl.connect(out); out.connect(mestre);
    F.notas.forEach(function (n) {
      var vozes = F.coro ? [-F.coro, F.coro] : [n[3]];
      var g = c.createGain(); g.gain.value = n[2] / vozes.length; g.connect(fl);
      if (n[4]) {   /* o balanço: a nota sobe e desce devagar (LFO no ganho), cada uma no seu tempo */
        var lfo = c.createOscillator(), prof = c.createGain();
        lfo.frequency.value = 1 / n[4]; prof.gain.value = n[2] / vozes.length * 0.45; lfo.connect(prof); prof.connect(g.gain); lfo.start(); fontes.push(lfo);
      }
      vozes.forEach(function (cents) { var o = c.createOscillator(); o.type = n[1]; o.frequency.value = n[0]; o.detune.value = cents; o.connect(g); o.start(); fontes.push(o); });
    });
    if (F.ar) {
      var s = c.createBufferSource(), bp = c.createBiquadFilter(), ga = c.createGain();
      ruido(t, 0.01, PISO * 3, 0.01, out, { f: 1000 });   /* (cria o buffer) */
      s.buffer = ruidoBuf; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.6; ga.gain.value = F.ar / F.vol;
      s.connect(bp); bp.connect(ga); ga.connect(out); s.start(); fontes.push(s);
    }
    return { out: out, fl: fl, fontes: fontes, F: F };
  }
  function respirar() {
    if (!fundoVivo) return;
    var F = fundoVivo.F, t = c.currentTime, tIn = PERIODO * INSPIRA, tEx = PERIODO - tIn;
    fundoVivo.fl.frequency.setTargetAtTime(F.filtro[1], t, tIn / 3);
    fundoVivo.out.gain.setTargetAtTime(F.vol * 1.15, t, tIn / 3);
    fundoVivo.fl.frequency.setTargetAtTime(F.filtro[0], t + tIn, tEx / 3);
    fundoVivo.out.gain.setTargetAtTime(F.vol * 0.85, t + tIn, tEx / 3);
    timerFolego = setTimeout(respirar, PERIODO * 1000);
  }
  function pararFundo() {
    clearTimeout(timerFolego);
    if (!fundoVivo) return;
    var v = fundoVivo, t = c.currentTime; fundoVivo = null;
    v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(PISO, t, 0.2);
    v.fontes.forEach(function (f) { f.stop(t + 1.2); });
  }
  function tocarFundo(nome) { pararFundo(); fundoNome = nome; fundoVivo = montarFundo(nome); respirar(); }

  /* ---------- O PULSO ---------- */
  /* a frase de 4: a nota do pulso anda por um acorde (não repete igual) e o 4º acentua */
  var FRASE = [1, 1.122, 0.891, 1.335];   /* raiz, 2ª maior, 6ª abaixo, 4ª: A, B, F#, D (sem tensão) */
  var ACENTO = 1.35;
  var PULSOS = {
    hoje: function (t) {
      var out = saida(0.22, 0, 0.22);
      osc('sine', 120, t, 0.006, 0.55, 0.5, out, 55);
      osc('triangle', 240, t, 0.004, 0.10, 0.22, out, 120);
      ruido(t, 0.002, 0.10, 0.045, out, { f: 1400, q: 0.8 });
    },
    /* A, batimento de luz: duas batidas macias (lub-dub), corpo médio que cai pouco e um brilho de vidro em cima */
    luz: function (t, k, forte) {
      var v = forte ? ACENTO : 1, out = saida(0.4, 0, 0.5 * v);
      [0, 0.17].forEach(function (d, i) {
        var a = i ? 0.7 : 1;
        osc('sine', 196 * k, t + d, 0.012, 0.32 * a, 0.42, out, 174.6 * k);
        osc('sine', 784 * k, t + d, 0.006, 0.05 * a, 0.5, out);
      });
    },
    /* B, sonar: um "ping" de vidro com eco longo */
    sonar: function (t, k, forte) {
      var v = forte ? ACENTO : 1, out = saida(0.7, 0, 0.4 * v);
      osc('sine', 880 * k, t, 0.004, 0.18, 1.3, out);
      osc('sine', 1320 * k, t, 0.004, 0.035, 0.7, out);
      osc('sine', 440 * k, t, 0.02, 0.08, 0.9, out);
    },
    /* C, onda: um sopro que abre e fecha com uma nota que floresce por baixo */
    onda: function (t, k, forte) {
      var v = forte ? ACENTO : 1, out = saida(0.45, 0, 0.55 * v);
      ruido(t, 0.35, 0.05, 0.9, out, { tipo: 'lowpass', f: 300, q: 0.7, fFim: 1800 });
      osc('sine', 220 * k, t, 0.25, 0.16, 1.1, out);
      osc('sine', 330 * k, t + 0.05, 0.25, 0.05, 0.9, out);
    }
  };
  var vis = document.querySelector('#pulso-vis i');
  function piscar(at) { setTimeout(function () { vis.classList.add('on'); requestAnimationFrame(function () { requestAnimationFrame(function () { vis.classList.remove('on'); }); }); }, Math.max(0, at * 1000)); }
  var nPulso = 0;
  function pulso(nome) { var t = c.currentTime + 0.02, i = nPulso++ % 4; PULSOS[nome](t, FRASE[i], i === 3); piscar(0.02); }

  var minuto = null;
  function pararMinuto() { if (!minuto) return; clearInterval(minuto.timer); clearTimeout(minuto.fim); minuto.btn.classList.remove('tocando'); minuto = null; pararFundo(); marcarFundo(); }
  function tocarMinuto(nome, btn) {
    var era = minuto && minuto.btn === btn; pararMinuto(); if (era) return;
    tocarFundo(fundoNome); nPulso = 0; btn.classList.add('tocando');
    minuto = { btn: btn, timer: setInterval(function () { pulso(nome); }, PERIODO * 1000), fim: setTimeout(pararMinuto, 61000) };
    setTimeout(function () { if (minuto && minuto.btn === btn) pulso(nome); }, PERIODO * INSPIRA * 1000);
  }

  /* ---------- O AI CORE MÉDIO (js/estacao.js) ---------- */
  var M = {
    /* acopla e enche: um tom que sobe com a carga, com um brilho por cima (a duração é a do encher, 2 s) */
    enche: function (t, dura) {
      dura = dura || 2;
      var out = saida(0.35, 0, 0.32), fl = c.createBiquadFilter(), g = c.createGain();
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(500, t); fl.frequency.exponentialRampToValueAtTime(2600, t + dura); fl.connect(g); g.connect(out);
      g.gain.setValueAtTime(PISO, t); g.gain.exponentialRampToValueAtTime(0.12, t + dura * 0.8); g.gain.exponentialRampToValueAtTime(PISO, t + dura + 0.15);
      [[220, 'triangle', 0], [221.2, 'sine', 0]].forEach(function (n) { var o = c.createOscillator(); o.type = n[1]; o.frequency.setValueAtTime(n[0], t); o.frequency.exponentialRampToValueAtTime(n[0] * 2, t + dura); o.connect(fl); o.start(t); o.stop(t + dura + 0.2); });
    },
    /* conectada: o acorde que abre (A maior com 9ª), sem pressa */
    conecta: function (t) {
      var out = saida(0.55, 0, 0.42);
      [[440, 0], [554.37, 0.05], [659.25, 0.1], [987.77, 0.16]].forEach(function (n, i) { osc('sine', n[0], t + n[1], 0.01, 0.09 - i * 0.015, 1.4, out); });
      osc('sine', 220, t, 0.02, 0.07, 1.2, out);
    },
    /* o pulso chega aos cards: um tique de vidro por card, do mais perto ao mais longe, cada um no seu lado */
    surto: function (t, n) {
      n = n || 4; var notas = [1568, 1760, 2093, 2349, 2637];
      for (var i = 0; i < n; i++) { var out = saida(0.4, (i % 2 ? 1 : -1) * 0.5, 0.25); osc('sine', notas[i % 5], t + i * 0.07, 0.003, 0.05, 0.22, out); }
    },
    /* solta: a carga desce e apaga */
    solta: function (t) {
      var out = saida(0.3, 0, 0.3);
      osc('sine', 659.25, t, 0.01, 0.07, 0.5, out, 329.63);
      osc('triangle', 329.63, t, 0.01, 0.04, 0.45, out, 164.81);
    },
    estacao: function (t) { M.enche(t, 2); M.conecta(t + 2); M.surto(t + 4.2, 4); M.solta(t + 6.2); },
    /* o mini encaixa na borda do botão (mini-docas.js): o zip curto e o ping da ignição */
    ignicao: function (t) {
      var out = saida(0.3, 0, 0.32);
      ruido(t, 0.005, 0.06, 0.12, out, { f: 1800, q: 2, fFim: 6000 });
      osc('sine', 1318.5, t + 0.1, 0.004, 0.07, 0.35, out);
      osc('sine', 1975.5, t + 0.13, 0.004, 0.03, 0.3, out);
    },
    /* a descarga da palavra (energia-texto.js): faíscas curtas, altas e baixinhas */
    descarga: function (t) {
      var out = saida(0.25, 0, 0.22);
      for (var i = 0; i < 7; i++) ruido(t + i * 0.045 + Math.random() * 0.02, 0.001, 0.035 + Math.random() * 0.02, 0.03, out, { f: 4000 + Math.random() * 3000, q: 6 });
      osc('sine', 2637, t + 0.34, 0.004, 0.03, 0.25, out);
    }
  };

  /* ---------- os botões ---------- */
  function marcarFundo() { [].forEach.call(document.querySelectorAll('[data-fundo]'), function (b) { b.classList.toggle('tocando', !!fundoVivo && b.dataset.fundo === fundoNome && !minuto); }); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    abrir();
    if (b.dataset.fundo) { pararMinuto(); if (fundoVivo && fundoNome === b.dataset.fundo) pararFundo(); else tocarFundo(b.dataset.fundo); fundoNome = b.dataset.fundo; marcarFundo(); return; }
    if (b.dataset.pulso) { pulso(b.dataset.pulso); return; }
    if (b.dataset.minuto) { tocarMinuto(b.dataset.minuto, b); return; }
    if (b.dataset.som) M[b.dataset.som](c.currentTime + 0.02);
  });
})();
