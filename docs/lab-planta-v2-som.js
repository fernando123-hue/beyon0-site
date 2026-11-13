/* PLANTA VIVA v2 (laboratório): o que o som do LABORATÓRIO soma ao de produção (js/planta-som.js, que traz o motor e o interruptor).
   Cada som pedido entra no registro (window.BZPlantaSom.registro, com Date.now()) e renderizar() refaz o mesmo som num OfflineAudioContext,
   com o mesmo motor, para o vídeo (docs/lab-planta-v2-video.mjs). Os botões [data-som] do laboratório também dizem o estado por escrito. ES5. */
(function () {
  'use strict';
  var Som = window.BZPlantaSom;
  if (!Som) return;
  var registro = [];
  Som.aoPedir = function (nome, k) { registro.push({ nome: nome, k: k, em: Date.now() }); };

  /* o vídeo: o mesmo motor num contexto offline, cada som no seu instante (ms a partir de t0), devolvido como WAV em base64 */
  function renderizar(eventos, t0, duracaoS) {
    var taxa = 48000, c = new OfflineAudioContext(2, Math.ceil(taxa * duracaoS), taxa), m = window.BZPlantaSom.criarMotor(c, c.destination);
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


  function pintarBotoes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-som]'), function (b) { b.textContent = Som.ligado() ? 'Som ligado' : 'Som desligado'; });
  }
  document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('[data-som]')) pintarBotoes(); });
  document.addEventListener('DOMContentLoaded', function () { Som.mostrarBotoes(); pintarBotoes(); window.setTimeout(Som.preparar, 300); });
  Som.registro = registro;
  Som.renderizar = renderizar;
})();
