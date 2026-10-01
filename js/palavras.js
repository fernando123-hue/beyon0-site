/* ==========================================================================
   PALAVRA VIVA — a palavra que carrega a frase do hero muda de leitura
   (automação). Cicla por um vocabulário do MESMO campo semântico; no Singular
   troca para um vocabulário mais assertivo. SÓ o hero: no CTA (título
   centralizado) a reserva de largura abriria um vão visível no meio da linha,
   e texto que se mexe enquanto é lido no fim da página não vende nada. A transição reaproveita
   o `morph()` do organismo. Ordem aleatória sem repetição (saco embaralhado).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || !B.morph) return;

  var PALAVRAS_HERO      = ['auditando', 'monitorando', 'fiscalizando', 'acompanhando'];
  var PALAVRAS_HERO_SING = ['sangrando', 'vazando', 'evaporando'];

  var cicladores = [];
  /* A PALAVRA NÃO DESLOCA O LAYOUT. Trocar "auditando" por "acompanhando"
     reflui a linha e conta como layout shift (medido: CLS 0,18 no celular).
     O <em> vira inline-block com a largura da palavra mais larga da lista —
     reservada uma vez, remedida no resize — e a pontuação final viaja dentro
     dele, para a folga ficar no fim da linha, onde não existe. */
  function reservarLargura(el, listas, sufixo) {
    var cs = getComputedStyle(el);
    var prova = document.createElement('span');
    prova.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0';
    prova.style.font = cs.font; prova.style.letterSpacing = cs.letterSpacing;
    document.body.appendChild(prova);
    var max = 0;
    for (var l = 0; l < listas.length; l++) for (var i = 0; i < listas[l].length; i++) {
      prova.textContent = listas[l][i] + sufixo;
      max = Math.max(max, prova.getBoundingClientRect().width);
    }
    document.body.removeChild(prova);
    el.style.display = 'inline-block';
    el.style.minWidth = Math.ceil(max) + 'px';
    el.style.maxWidth = '100%';   /* a 320px a palavra mais larga estourava a coluna em 1px */
  }

  function criarCiclador(el, listaNormal, listaSing) {
    var de = el.textContent, para = de, p = 1, mostrado = de, ciclo = null;
    var sufixo = /[.!?]$/.test(de) ? de.slice(-1) : '';
    reservarLargura(el, [listaNormal, listaSing], sufixo);
    var remedida = 0;
    B.on('resize', function () { clearTimeout(remedida); remedida = setTimeout(function () { reservarLargura(el, [listaNormal, listaSing], sufixo); }, 180); });
    /* leitor de tela recebe a frase fixa (o morph escreve glifos de sinal no
       meio da troca); e a auto-atualização é FINITA: depois de alguns ciclos
       a palavra para na original — WCAG 2.2.2 sem depender do interruptor
       do rodapé */
    var original = de, trocas = 0, MAX_TROCAS = 6;
    var h = el.closest('h1, h2');
    if (h && !h.getAttribute('aria-label')) h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    el.setAttribute('aria-hidden', 'true');
    var saco = [], sacoLista = null;
    function embaralhar(lista) {
      saco = lista.slice();
      for (var i = saco.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = saco[i]; saco[i] = saco[j]; saco[j] = t; }
      if (saco.length > 1 && saco[saco.length - 1] + sufixo === mostrado) { var f = saco[saco.length - 1]; saco[saco.length - 1] = saco[0]; saco[0] = f; }
      sacoLista = lista;
    }
    function trocar() {
      if (trocas >= MAX_TROCAS) {
        if (mostrado !== original) { de = mostrado; para = original; p = 0; }
        if (ciclo) { clearInterval(ciclo); ciclo = 0; }
        return;
      }
      trocas++;
      var lista = document.body.classList.contains('is-singular') ? listaSing : listaNormal;
      if (!saco.length || sacoLista !== lista) embaralhar(lista);
      var alvo = saco.pop() + sufixo;
      if (alvo === mostrado) { if (!saco.length) embaralhar(lista); var prox = saco.pop(); if (prox) alvo = prox + sufixo; }
      de = mostrado; para = alvo; p = 0;
    }
    function drive(dt) {
      if (p >= 1) return;
      p = Math.min(1, p + dt / 620);
      var s = p >= 1 ? para : B.morph(de, para, p);
      if (s !== mostrado) { mostrado = s; el.textContent = s; }
    }
    function reiniciar() {
      if (trocas >= MAX_TROCAS) return;
      if (ciclo) clearInterval(ciclo);
      var primeiro = ciclo === null;
      /* cadência lenta: a frase é lida antes de mudar (pedido anterior do
         dono era mais frequência; a direção V2 pede texto parado enquanto
         se lê — 6–8s é o meio-termo que mantém a assinatura) */
      ciclo = setInterval(trocar, 6000 + Math.random() * 2000);
      if (primeiro) setTimeout(trocar, 4200);
    }
    reiniciar();
    return { drive: drive, trocar: trocar, reiniciar: reiniciar };
  }

  function iniciar() {
    if (cicladores.length || B.reduced) return;
    var emHero = [].slice.call(document.querySelectorAll('.hero__title em')).filter(function (e) { return e.textContent.trim(); })[0];
    if (emHero) cicladores.push(criarCiclador(emHero, PALAVRAS_HERO, PALAVRAS_HERO_SING));
  }
  B.on('hero-pronto', iniciar);
  var armar = function () { setTimeout(iniciar, 3500); };
  if (document.body.classList.contains('booted')) armar(); else B.on('booted', armar);

  B.on('singular', function () { for (var i = 0; i < cicladores.length; i++) { cicladores[i].trocar(); cicladores[i].reiniciar(); } });
  B.add('palavras', function (s) { if (B.reduced) return; for (var i = 0; i < cicladores.length; i++) cicladores[i].drive(s.dt); });
})();
