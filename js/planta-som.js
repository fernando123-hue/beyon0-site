/* PLANTA VIVA v2: o SOM da planta no orçamento, da família de js/som.js (o mesmo motor em miniatura: vozes de seno com envelope
   exponencial e um espaço curto e escuro). js/som.js não roda no orçamento (o desenho dos sons deixou o orçamento de fora); a planta
   traz só as vozes dela. Vozes: "semente" (o acorde que abre, o estacaoConecta), "estacao" (o sino curto), "refaz" (o sino, mais
   baixo), "passa" (o tique de vidro da escala G6..E7, quando a luz da consagração passa por uma estação) e "ouro" (o impacto e o acorde
   dourado, o ouroIgnicao).
   O INTERRUPTOR é o do site: a mesma chave 'bz-som' ('0' = desligado), lida a cada som (desligado em outra página vale aqui), e os botões
   [data-som] da página, que só aparecem quando a planta existe (mostrarBotoes, chamado por js/orcamento-planta.js).
   O navegador só toca depois de um gesto; até lá nada soa. Nada por frame: cada som é agendado no relógio do áudio.
   window.BZPlantaSom = { tocar(nome), ligado(), mostrarBotoes(), criarMotor(contexto, destino), aoPedir }. aoPedir (opcional) é avisado de
   cada som pedido com o som ligado: o laboratório grava o registro para refazer o som do vídeo. ES5. */
(function (win) {
  'use strict';
  if (!win || !win.document) return;
  var doc = win.document, Ctx = win.AudioContext || win.webkitAudioContext;
  var CHAVE = 'bz-som', PISO = 0.0001, ADIANTE = 0.01, VOL = 0.34;
  var NOTAS = [1568, 1760, 2093, 2349, 2637];
  var ctx = null, motor = null, nPassa = 0, botoes = [];
  var aviso = function (e) { if (win.console && win.console.warn) win.console.warn('[beyon] planta som: ' + (e && e.message ? e.message : e)); };

  function ligado() { try { return win.localStorage.getItem(CHAVE) !== '0'; } catch (e) { return true; } }
  function gravar(sim) { try { win.localStorage.setItem(CHAVE, sim ? '1' : '0'); } catch (e) { /* sem armazenamento: vale só nesta página */ } }

  function criarMotor(c, destino) {
    var n = Math.round(c.sampleRate * 1.6), buf = c.createBuffer(2, n, c.sampleRate), ch, i;
    for (ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch); for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    var ruidoBuf = c.createBuffer(1, c.sampleRate, c.sampleRate), r = ruidoBuf.getChannelData(0);
    for (i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
    var vozes = c.createGain(), espaco = c.createConvolver(), escuro = c.createBiquadFilter(), envio = c.createGain();
    vozes.connect(destino); espaco.buffer = buf; escuro.type = 'lowpass'; escuro.frequency.value = 4200; envio.gain.value = 0.5;
    envio.connect(espaco); espaco.connect(escuro); escuro.connect(vozes);
    function saida(molhado, pan, vol) {
      var g = c.createGain(), no = g;
      g.gain.value = vol;
      if (c.createStereoPanner && pan) { var p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); no = p; }
      no.connect(vozes);
      if (molhado) { var s = c.createGain(); s.gain.value = molhado; no.connect(s); s.connect(envio); }
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
    function ruido(t, ataque, pico, queda, para, f) {
      var s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = ruidoBuf; fl.type = 'lowpass'; fl.frequency.value = f; fl.Q.value = 0.5;
      env(g, t, ataque, pico, queda); s.connect(fl); fl.connect(g); g.connect(para);
      s.start(t); s.stop(t + ataque + queda + 0.05);
    }
    return {
      semente: function (t) {
        var out = saida(0.55, 0, VOL * 1.3);
        [[440, 0], [554.37, 0.05], [659.25, 0.1], [987.77, 0.16]].forEach(function (x, k) { osc('sine', x[0], t + x[1], 0.01, 0.09 - k * 0.015, 1.4, out); });
        osc('sine', 220, t, 0.02, 0.07, 1.2, out);
      },
      estacao: function (t) { var out = saida(0.35, 0, VOL * 1.6); osc('sine', 880, t, 0.005, 0.07, 0.445, out); osc('sine', 1320, t + 0.06, 0.005, 0.056, 0.395, out); },
      refaz: function (t) { var out = saida(0.35, 0, VOL * 1.1); osc('sine', 659.25, t, 0.005, 0.06, 0.4, out); osc('sine', 987.77, t + 0.05, 0.005, 0.045, 0.35, out); },
      passa: function (t, k) { osc('sine', NOTAS[k % NOTAS.length], t, 0.003, 0.05, 0.22, saida(0.4, (k % 2 ? 1 : -1) * 0.5, VOL * 0.8)); },
      ouro: function (t) {
        var imp = saida(0.5, 0, VOL), acorde = saida(0.6, 0, VOL);
        osc('sine', 90, t, 0.004, 0.45, 0.9, imp, 40);
        ruido(t, 0.002, 0.12, 0.28, imp, 3000);
        [[523.25, 0.09], [783.99, 0.07], [1046.5, 0.06], [1318.5, 0.04], [1444.2, 0.018]].forEach(function (x, k) { osc('sine', x[0], t + k * 0.012, 0.004, x[1], 2.8, acorde); });
      }
    };
  }

  function acordar() {
    if (!Ctx || !ligado()) return;
    try {
      if (!ctx) { ctx = new Ctx(); motor = criarMotor(ctx, ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { aviso(e); }
  }

  /* pede um som: com o som desligado, nada; toca se o contexto já acordou (um gesto da pessoa) */
  function tocar(nome) {
    if (!ligado()) return;
    var k = nome === 'passa' ? nPassa++ : 0;
    if (nome === 'semente') nPassa = 0;
    if (typeof api.aoPedir === 'function') { try { api.aoPedir(nome, k); } catch (e) { aviso(e); } }
    if (!motor || !ctx || ctx.state !== 'running' || !motor[nome]) return;
    try { motor[nome](ctx.currentTime + ADIANTE, k); } catch (e) { aviso(e); }
  }

  function rotular() { var sim = ligado(); botoes.forEach(function (b) { b.setAttribute('aria-pressed', sim ? 'true' : 'false'); }); }
  function alternar() {
    var sim = !ligado();
    gravar(sim);
    if (sim) acordar(); else if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) { aviso(e); } }
    rotular();
  }
  /* os botões [data-som] da página aparecem e passam a valer (uma vez cada) */
  function mostrarBotoes() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-som]'), function (b) {
      if (botoes.indexOf(b) >= 0) return;
      botoes.push(b);
      b.hidden = false;
      b.addEventListener('click', alternar);
    });
    rotular();
  }

  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (ev) { doc.addEventListener(ev, acordar, { capture: true, passive: true }); });

  var api = { tocar: tocar, ligado: ligado, mostrarBotoes: mostrarBotoes, criarMotor: criarMotor, aoPedir: null };
  win.BZPlantaSom = api;
})(typeof window !== 'undefined' ? window : null);
