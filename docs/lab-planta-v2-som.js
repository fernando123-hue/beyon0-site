/* PLANTA VIVA v2 (laboratório): o SOM, da família de js/som.js (o mesmo motor em miniatura: vozes de seno com envelope exponencial e um
   espaço curto e escuro). Vozes: "semente" (o acorde que abre, o estacaoConecta), "estacao" (o sino curto), "refaz" (o sino, mais baixo),
   "passa" (o tique de vidro da escala G6..E7, quando a luz da consagração passa por uma estação) e "ouro" (o impacto e o acorde dourado,
   o ouroIgnicao). Respeita o interruptor do site: a mesma chave 'bz-som' ('0' = desligado) e botões [data-som] com aria-pressed.
   O navegador só toca depois de um gesto; até lá nada soa, mas cada som PEDIDO fica no registro (window.BZPlantaSom.registro, com Date.now()),
   e renderizar() refaz o mesmo som num OfflineAudioContext para o vídeo do laboratório (docs/lab-planta-v2-video.mjs). ES5. */
(function () {
  'use strict';
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var CHAVE = 'bz-som', PISO = 0.0001, ADIANTE = 0.01, VOL = 0.34;
  var NOTAS = [1568, 1760, 2093, 2349, 2637];
  var ligado = ler(), ctx = null, motor = null, registro = [], nPassa = 0;

  function ler() { try { return localStorage.getItem(CHAVE) !== '0'; } catch (e) { return true; } }
  function gravar(sim) { try { localStorage.setItem(CHAVE, sim ? '1' : '0'); } catch (e) { /* sem armazenamento: só nesta página */ } }

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
    if (!Ctx || !ligado) return;
    try {
      if (!ctx) { ctx = new Ctx(); motor = criarMotor(ctx, ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { if (window.console) window.console.warn('[planta-som] ' + e.message); }
  }

  /* pede um som: registra sempre que o som está ligado; toca se o contexto já acordou */
  function tocar(nome) {
    if (!ligado) return;
    var k = nome === 'passa' ? nPassa++ : 0;
    if (nome === 'semente') nPassa = 0;
    registro.push({ nome: nome, k: k, em: Date.now() });
    if (!motor || !ctx || ctx.state !== 'running' || !motor[nome]) return;
    try { motor[nome](ctx.currentTime + ADIANTE, k); } catch (e) { if (window.console) window.console.warn('[planta-som] ' + e.message); }
  }

  function pintarBotoes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-som]'), function (b) {
      b.setAttribute('aria-pressed', ligado ? 'true' : 'false');
      b.textContent = ligado ? 'Som ligado' : 'Som desligado';
    });
  }
  function alternar() { ligado = !ligado; gravar(ligado); if (ligado) acordar(); else if (ctx && ctx.state === 'running') ctx.suspend(); pintarBotoes(); }

  /* o vídeo: o mesmo motor num contexto offline, cada som no seu instante (ms a partir de t0), devolvido como WAV em base64 */
  function renderizar(eventos, t0, duracaoS) {
    var taxa = 48000, c = new OfflineAudioContext(2, Math.ceil(taxa * duracaoS), taxa), m = criarMotor(c, c.destination);
    eventos.forEach(function (e) { var t = (e.em - t0) / 1000; if (t >= 0 && t < duracaoS && m[e.nome]) m[e.nome](t, e.k); });
    return c.startRendering().then(function (b) { return wav(b); });
  }
  function wav(b) {
    var n = b.length, canais = b.numberOfChannels, bytes = 44 + n * canais * 2, v = new DataView(new ArrayBuffer(bytes)), p = 0, i, ch;
    var s = function (t) { for (var k = 0; k < t.length; k++) v.setUint8(p++, t.charCodeAt(k)); };
    var u32 = function (x) { v.setUint32(p, x, true); p += 4; }, u16 = function (x) { v.setUint16(p, x, true); p += 2; };
    s('RIFF'); u32(bytes - 8); s('WAVE'); s('fmt '); u32(16); u16(1); u16(canais); u32(b.sampleRate); u32(b.sampleRate * canais * 2); u16(canais * 2); u16(16); s('data'); u32(n * canais * 2);
    var dados = []; for (ch = 0; ch < canais; ch++) dados.push(b.getChannelData(ch));
    for (i = 0; i < n; i++) for (ch = 0; ch < canais; ch++) { var x = Math.max(-1, Math.min(1, dados[ch][i])); v.setInt16(p, x < 0 ? x * 0x8000 : x * 0x7fff, true); p += 2; }
    var bin = '', u8 = new Uint8Array(v.buffer), passo = 0x8000;
    for (i = 0; i < u8.length; i += passo) bin += String.fromCharCode.apply(null, u8.subarray(i, i + passo));
    return btoa(bin);
  }

  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, acordar, { capture: true }); });
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('[data-som]') : null; if (b) alternar(); });
  document.addEventListener('DOMContentLoaded', pintarBotoes);
  window.BZPlantaSom = { tocar: tocar, registro: registro, renderizar: renderizar, ligado: function () { return ligado; } };
})();
