/* ==========================================================================
   NÚCLEO (V3) — um rAF só, estado mínimo, eventos internos e o interruptor
   de movimento.

   Na V3 não há canvas: o laço existe para o medidor de fps da prova (a
   única coisa que roda por frame) e para a fase seguinte (AI Core em fundo
   claro), que vai se registrar aqui com `B.add`. O que a V2 tinha de
   orçamento, regimes, ponteiro e perfil está no histórico (commit 051b2a8).

   Exposto em window.BEYON porque os arquivos são scripts clássicos (o
   projeto não tem build). A superfície é pequena de propósito.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mqReduce.matches || html.classList.contains('menos-movimento');

  /* ---- estado compartilhado: subsistemas LEEM, o núcleo escreve ---- */
  var S = { t: 0, dt: 16, now: 0, fps: 60 };

  /* ---- subsistemas ---- */
  var subs = [];
  function add(name, fn) { subs.push({ n: name, f: fn, erros: 0 }); }
  function remove(name) {
    for (var i = subs.length - 1; i >= 0; i--) if (subs[i].n === name) subs.splice(i, 1);
  }

  /* ---- eventos internos ---- */
  var ouvintes = {};
  function on(ev, fn) { (ouvintes[ev] || (ouvintes[ev] = [])).push(fn); }
  function off(ev, fn) {
    var l = ouvintes[ev]; if (!l) return;
    var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
  function emit(ev, dados) {
    var l = ouvintes[ev]; if (!l) return;
    for (var i = 0; i < l.length; i++) l[i](dados);
  }

  /* ---- o laço ----
     S.fps é uma média móvel do intervalo real entre quadros: é o número que
     a prova mostra, então não pode mentir nem ser suavizado além da conta. */
  var antes = 0, rodando = false;
  function frame(now) {
    if (document.hidden) { rodando = false; return; }
    var dt = antes ? Math.min(50, now - antes) : 16;
    antes = now;
    S.dt = dt; S.now = now; S.t++;
    S.fps += (1000 / Math.max(1, dt) - S.fps) * 0.1;
    /* um subsistema que lança não derruba os outros nem o laço */
    for (var i = 0; i < subs.length; i++) {
      try { subs[i].f(S); } catch (e) { falhou(subs[i]); }
    }
    requestAnimationFrame(frame);
  }
  /* três falhas seguidas e o subsistema sai do laço — o resto do site segue */
  function falhou(sub) {
    sub.erros++;
    if (sub.erros >= 3) remove(sub.n);
  }
  function iniciar() {
    if (rodando) return;
    rodando = true; antes = 0;
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) iniciar(); });

  /* ---- "menos movimento" em tempo de execução ----
     `persistir` só quando foi a pessoa, no interruptor do rodapé: se foi o
     sistema que ligou a preferência, a escolha é dele e não fica gravada. */
  function reduzir(sim, persistir) {
    /* o sistema manda: com prefers-reduced-motion ligado, "ativar" não ativa */
    reduced = window.BEYON.reduced = !!sim || mqReduce.matches;
    html.classList.toggle('menos-movimento', !!sim);
    if (persistir) {
      try { localStorage.setItem('bz-menos-movimento', sim ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    }
    emit('reduzir', reduced);
  }
  try {
    mqReduce.addEventListener('change', function (e) { if (e.matches) reduzir(true, false); });
  } catch (e) { /* navegador antigo */ }

  /* todo número que o site mostra sai daqui: pt-BR ("0,56"), sem separador
     de milhar (a contagem relê o texto e um "1.024" viraria 1,024) */
  function num(v, casas) {
    casas = casas || 0;
    try { return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false }); }
    catch (e) { return v.toFixed(casas).replace('.', ','); }
  }

  window.BEYON = {
    S: S, add: add, remove: remove, on: on, off: off, emit: emit, iniciar: iniciar, reduzir: reduzir,
    reduced: reduced, sistemaReduz: mqReduce.matches, num: num
  };

  /* BOOT: 'booted' só depois que TODO script `defer` rodou (DOMContentLoaded),
     porque emit não guarda histórico. */
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('booted');
    emit('booted');
  });
})();
