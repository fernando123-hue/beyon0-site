/* Piloto do laboratório do radar (docs/lab-radar.html). Lê as leituras de TESTE de docs/testes/fixtures/radar, monta o radar na vaga e
   troca de leitura pelos botões ou pelos parâmetros da URL (ver o comentário da página). Expõe window.__radarLab para as medições.
   Texto só por textContent. */
(function () {
  'use strict';
  var NOMES = ['clinica', 'embalagens', 'loja'];
  var params = new URLSearchParams(window.location.search);
  var vaga = document.querySelector('[data-radar]');
  var botoes = document.querySelector('[data-botoes]');
  var estado = { pronto: false, trocou: false, leitura: null, montouEm: 0 };   /* montouEm: performance.now() do 1º desenho, para separar o CLS da página do CLS do radar */
  window.__radarLab = estado;
  var radar = null, leituras = {};

  function vazio() {
    var eixos = [], i;
    for (i = 0; i < window.BZPlantaForma.EIXOS.length; i++) eixos.push({ eixo: window.BZPlantaForma.EIXOS[i], nivel: 'nao_falou' });
    return { eixos: eixos };
  }
  /* o pior caso de texto: evidência de 60 letras em todos os eixos (a lista tem que caber na altura reservada) */
  function pior() {
    var frase = 'nossa agenda lota e o telefone toca o dia inteiro aqui sim', eixos = [], i;
    for (i = 0; i < window.BZPlantaForma.EIXOS.length; i++) eixos.push({ eixo: window.BZPlantaForma.EIXOS[i], nivel: 'deixou_claro', evidencia: frase.slice(0, 60) });
    return { eixos: eixos };
  }
  function achar(nome) { return nome === 'vazio' ? vazio() : nome === 'pior' ? pior() : leituras[nome]; }

  function mostrar(nome) {
    var l = achar(nome), bs, i;
    if (!l) return;
    estado.leitura = nome;
    if (!radar) { estado.montouEm = performance.now(); radar = window.BZRadar.montar(vaga, l); } else radar.atualizar(l);
    bs = botoes ? botoes.querySelectorAll('[data-leitura]') : [];
    for (i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-leitura') === nome ? 'true' : 'false');
  }

  function carregar(nome) {
    return fetch('/docs/testes/fixtures/radar/' + nome + '.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { leituras[nome] = j; });
  }

  function iniciar() {
    var final = params.get('leitura') || 'clinica', inicial = params.get('de') || final;
    var atraso = +params.get('atraso') || 0, troca = +params.get('troca') || 1200;
    Promise.all(NOMES.map(carregar)).then(function () {
      if (botoes) {
        var bs = botoes.querySelectorAll('[data-leitura]'), k;
        for (k = 0; k < bs.length; k++) bs[k].disabled = false;   /* os botões já ocupam o lugar no HTML: ligar não mexe no layout */
        botoes.addEventListener('click', function (e) {
          var alvo = e.target && e.target.closest ? e.target.closest('[data-leitura]') : null;
          if (alvo) mostrar(alvo.getAttribute('data-leitura'));
        });
      }
      window.setTimeout(function () {
        mostrar(inicial);
        estado.pronto = true;
        if (inicial !== final) window.setTimeout(function () { mostrar(final); estado.trocou = true; }, troca);
      }, atraso);
    });
  }
  iniciar();
})();
