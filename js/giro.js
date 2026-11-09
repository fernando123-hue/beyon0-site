/* O GIRO do h1 da home (dono 09/11: "vamos ser ousados [...] usaremos as 3 opções").
   As três frases já estão no HTML, empilhadas na mesma célula (css/base.css): a 1ª é a do leitor de tela e a de quem
   está sem JS ou com menos movimento. Aqui só se troca qual aparece, com um GLITCH de cortes secos: a frase que sai
   treme em três fatias e some; a que entra chega em fatias desalinhadas com um eco ciano e assenta.
   Só transform e opacity (WAAPI, no compositor), passos secos (steps), nenhum desfoque. Para quando o hero sai da
   tela, a aba fica oculta ou o movimento é reduzido (aí volta à 1ª frase, sem efeito). */
(function () {
  'use strict';
  var B = window.BEYON;
  var titulo = document.querySelector('.hero__title--giro');
  if (!B || !titulo || !titulo.animate) return;
  var frases = titulo.querySelectorAll('.giro__frase');
  if (frases.length < 2) return;
  var html = document.documentElement;

  var TEMPO = { primeira: 4200, espera: 5200, folga: 1000, sai: 200, entra: 380 };
  var SECO = 'steps(1, end)';
  /* deslocamento de cada fatia por quadro (em em: acompanha o tamanho do título em qualquer largura) */
  var ENTRADA = [[-.3, .18, -.08, .03, 0], [.24, -.14, .09, -.02, 0], [-.16, .26, -.1, .04, 0]];
  var SAIDA = [[0, .1, -.16, .24], [0, -.14, .1, -.2], [0, .06, -.2, .12]];

  var atual = 0, visivel = true, timer = 0, trocando = false;

  function parado() { return !!B.reduced || html.classList.contains('menos-movimento') || document.hidden || !visivel; }

  function camada(frase, classe) {
    var c = frase.cloneNode(true);
    c.className = 'giro__camada ' + classe;
    c.setAttribute('aria-hidden', 'true');
    titulo.appendChild(c);
    return c;
  }

  function quadros(passos, opacidades) {
    return passos.map(function (x, i) {
      return { transform: 'translateX(' + x + 'em)', opacity: opacidades[i], offset: i / (passos.length - 1), easing: SECO };
    });
  }

  /* as três fatias tremem juntas mas fora de fase; devolve quando a última termina */
  function fatias(frase, passos, opacidades, ms) {
    var fim = [];
    for (var i = 0; i < passos.length; i++) {
      var c = camada(frase, 'giro__fatia--' + (i + 1));
      fim.push(c.animate(quadros(passos[i], opacidades), { duration: ms, fill: 'both' }));
    }
    return fim;
  }

  function limpar() {
    var restos = titulo.querySelectorAll('.giro__camada');
    for (var i = 0; i < restos.length; i++) restos[i].remove();
  }

  function mostrar(i) {
    for (var k = 0; k < frases.length; k++) frases[k].classList.toggle('is-ativa', k === i);
    atual = i;
  }

  function trocar() {
    var sai = frases[atual], proxima = (atual + 1) % frases.length, entra = frases[proxima];
    trocando = true;
    sai.classList.remove('is-ativa');
    var saida = fatias(sai, SAIDA, [1, 1, .7, 0], TEMPO.sai);
    saida[0].finished.then(function () {
      limpar();
      if (parado()) { voltar(); return; }
      var eco = camada(entra, 'giro__camada--eco');
      eco.animate(quadros([-.12, .07, -.04, 0], [.9, .9, .5, 0]), { duration: TEMPO.entra, fill: 'both' });
      var entrada = fatias(entra, ENTRADA, [.6, 1, .5, 1, 1], TEMPO.entra);
      return entrada[0].finished.then(function () {
        limpar();
        mostrar(proxima);
        trocando = false;
        agendar(TEMPO.espera);
      });
    }).catch(function () { voltar(); });
  }

  /* menos movimento no meio do caminho: a 1ª frase volta, inteira e sem efeito */
  function voltar() {
    clearTimeout(timer);
    limpar();
    mostrar(0);
    trocando = false;
  }

  function passo() {
    if (trocando) return;
    if (parado()) { agendar(TEMPO.folga); return; }
    /* não disputa com o surto da palavra em destaque (js/energia-texto.js) */
    if (titulo.querySelector('.energizando')) { agendar(TEMPO.folga); return; }
    trocar();
  }

  function agendar(ms) { clearTimeout(timer); timer = setTimeout(passo, ms); }

  new IntersectionObserver(function (es) { visivel = es[0].isIntersecting; }).observe(titulo);
  B.on('reduzir', function (sim) { if (sim) voltar(); else agendar(TEMPO.espera); });

  /* começa depois que o boot do hero imprimiu o título (.is-lit, js/anima.js); sem GSAP, depois do load */
  function comecar() { agendar(TEMPO.primeira); }
  if (titulo.classList.contains('is-lit')) comecar();
  else {
    var vigia = new MutationObserver(function () {
      if (!titulo.classList.contains('is-lit')) return;
      vigia.disconnect();
      comecar();
    });
    vigia.observe(titulo, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('load', function () { setTimeout(function () { vigia.disconnect(); if (!timer) comecar(); }, 3000); }, { once: true });
  }
})();
