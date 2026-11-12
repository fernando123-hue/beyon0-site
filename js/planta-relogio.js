/* PLANTA VIVA v2 (laboratório): o RELÓGIO que pausa. window.BZPlantaRelogio.criar() -> { depois(ms, fn), anim(el, kf, op), pausar(), retomar(), parar() }.
   Os timers e as animações de um programa andam JUNTOS: com a aba escondida ou a planta fora da tela os dois param, e voltam de onde estavam
   (o módulo real faz o mesmo com criarRelogio + pausarTudo em js/planta-desenho.js; aqui é o mesmo contrato, pequeno, para o esboço e a
   consagração). window.BZ_LENTO (só o vídeo do laboratório) estica os timers na proporção da câmera lenta. Sem requestAnimationFrame. ES5. */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = { para: fabrica };
  if (raiz) raiz.BZPlantaRelogio = fabrica(raiz);
})(typeof window !== 'undefined' ? window : null, function (window) {
  'use strict';
  var aviso = function (e) { if (window.console) window.console.warn('[planta-v2] ' + (e && e.message ? e.message : e)); };

  function criar() {
    var timers = [], anims = [], pausado = false, parado = false;
    var agora = function () { return window.performance.now(); };
    function armar(t) {
      t.inicio = agora();
      t.id = window.setTimeout(function () {
        timers = timers.filter(function (x) { return x !== t; });
        if (!parado) { try { t.fn(); } catch (e) { aviso(e); } }
      }, t.resta);
    }
    function depois(ms, fn) {
      var t = { fn: fn, resta: Math.max(0, ms * (window.BZ_LENTO || 1)), id: 0, inicio: 0 };
      timers.push(t);
      if (!pausado) armar(t);
    }
    function anim(el, kf, op) {
      if (!el || typeof el.animate !== 'function' || parado) return null;
      try {
        var a = el.animate(kf, op);
        anims.push(a);
        /* a animação que acabou sai da lista (por ouvinte: a varredura de segurança recusa on* por propriedade) */
        if (typeof a.addEventListener === 'function') a.addEventListener('finish', function () { anims = anims.filter(function (b) { return b !== a; }); });
        if (pausado) a.pause();
        return a;
      } catch (e) { aviso(e); return null; }
    }
    function pausar() {
      if (pausado || parado) return;
      pausado = true;
      timers.forEach(function (t) { window.clearTimeout(t.id); t.resta = Math.max(0, t.resta - (agora() - t.inicio)); });
      anims.forEach(function (a) { try { if (a.playState === 'running') a.pause(); } catch (e) { aviso(e); } });
    }
    function retomar() {
      if (!pausado || parado) return;
      pausado = false;
      anims.forEach(function (a) { try { if (a.playState === 'paused') a.play(); } catch (e) { aviso(e); } });
      timers.forEach(armar);
    }
    function parar() {
      parado = true;
      timers.forEach(function (t) { window.clearTimeout(t.id); });
      anims.forEach(function (a) { try { a.cancel(); } catch (e) { aviso(e); } });
      timers = []; anims = [];
    }
    return { depois: depois, anim: anim, pausar: pausar, retomar: retomar, parar: parar, ocupado: function () { return timers.length > 0; }, pausado: function () { return pausado; } };
  }

  return { criar: criar };
});
