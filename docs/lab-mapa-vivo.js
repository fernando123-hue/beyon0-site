/* Laboratório do Mapa vivo v2, fase 0: o roteiro que digita, a reação no aparelho (peças, ~0,3 s) e a anotação GRAVADA que chega com o atraso
   de ?latencia=ms (padrão LATENCIA_PADRAO: a estimativa da especificação, ainda a medir; o relógio na tela não esconde nada). Nenhuma chamada
   de IA, nenhuma rede. Movimento: transform, opacity e o traço desenhado uma vez (stroke-dashoffset); sem blur. window.LAB.estado para os scripts. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search), Ler = window.BZMapaVivoLer, Pecas = window.BZPlantaPecas;
  var LENTO = Math.max(1, Number(Q.get('lento')) || 1), LATENCIA_PADRAO = 1300;   /* (medido 26/11: mediana 1,3 s, p90 1,5 s, 30 chamadas do Haiku, docs/lab-mapa-vivo-latencia.mjs) */
  var LATENCIA = Number(Q.get('latencia')) >= 0 && Q.get('latencia') !== null ? Number(Q.get('latencia')) : LATENCIA_PADRAO;
  var PAUSA_PARA_ANOTAR = 700, ESPERA_LEITURA = 250, POR_LETRA = 55, POR_LETRA_ANOTA = 18, SEM_REACAO = Q.get('semreacao') === '1';
  var estatico = Q.get('estatico') === '1';
  if (estatico) document.documentElement.classList.add('menos-movimento');
  if (Q.get('captura') === '1') document.documentElement.classList.add('captura');
  if (Q.get('teclado') === '1') { document.documentElement.classList.add('tem-teclado'); document.getElementById('mv-teclado').hidden = false; }

  /* os casos: o texto em trechos (a pessoa para um pouco entre eles) e a anotação gravada de cada pausa. Negócios inventados; a anotação só
     repete número e nome que a pessoa escreveu (a regra de fidelidade da fase 1b) */
  var CASOS = {
    clinica: {
      trechos: [['tenho uma clínica de odontologia em Niterói, somos 4,', 1400], [' o pessoal chega pelo Instagram e eu respondo horário na mão', 2600]],
      anotacoes: ['clínica de odontologia em Niterói, equipe de 4', 'clínica de odontologia em Niterói, equipe de 4, clientes chegam pelo Instagram'],
      acende: 'Instagram'
    },
    loja: {
      trechos: [['vendo roupas femininas em Curitiba,', 1300], [' quase todo mundo me chama no WhatsApp perguntando o tamanho e eu queria cobrar um sinal', 2600]],
      anotacoes: ['loja de roupas femininas em Curitiba', 'loja de roupas femininas em Curitiba, pedidos pelo WhatsApp, quer cobrar sinal'],
      acende: 'WhatsApp'
    }
  };
  var caso = CASOS[Q.get('caso')] ? Q.get('caso') : 'clinica';
  var $ = function (id) { return document.getElementById(id); };
  var campo = $('o-texto'), fila = $('mv-pecas'), anota = $('mv-anota'), anotaTxt = $('mv-anota-texto'), log = $('o-log'), relogio = $('mv-relogio');
  var estado = { t0: 0, fim: false, parado: '', pecas: [], seq: 0 };
  window.LAB = { estado: estado };
  var tempo = function (ms) { return ms * LENTO; };
  var esperar = function (ms) { return new Promise(function (ok) { setTimeout(ok, tempo(ms)); }); };
  var anima = function (el, quadros, ms) { if (!estatico && el.animate) el.animate(quadros, { duration: ms, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }); };

  /* ---- uma peça: o ícone de js/planta-pecas.js, desenhado traço a traço uma vez, e o nome curto ---- */
  function pecaEl(p) {
    var li = document.createElement('li'), NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    li.className = 'mv-peca';
    li.setAttribute('data-codigo', p.codigo);
    svg.setAttribute('viewBox', '0 0 40 40');
    (Pecas.desenhar(p.peca) || []).forEach(function (tr) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', tr.d);
      path.setAttribute('pathLength', '1');
      if (tr.ac) path.setAttribute('class', 'ac');
      svg.appendChild(path);
      if (!estatico && path.animate) path.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 320, easing: 'ease-out' });
    });
    li.appendChild(svg);
    li.appendChild(document.createTextNode(p.nome));
    return li;
  }
  /* a reação no aparelho: lê o texto e acende o que é novo; o que deixou de valer sai */
  function reagir() {
    if (SEM_REACAO) return;
    var agora = Ler.ler(campo.value).pecas, cods = agora.map(function (p) { return p.codigo; });
    [].slice.call(fila.children).forEach(function (li) { if (cods.indexOf(li.getAttribute('data-codigo')) < 0) li.remove(); });
    agora.forEach(function (p) {
      if (fila.querySelector('[data-codigo="' + p.codigo + '"]')) return;
      var li = pecaEl(p);
      li.classList.add('is-nova');
      fila.appendChild(li);
      anima(li, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], 220);
      setTimeout(function () { li.classList.remove('is-nova'); }, tempo(1200));
    });
    estado.pecas = cods;
  }
  var timerLer = 0;
  campo.addEventListener('input', function () { clearTimeout(timerLer); timerLer = setTimeout(reagir, tempo(ESPERA_LEITURA)); });

  /* a anotação: chega LATENCIA ms depois da pausa; a de um pedido mais velho nunca passa por cima da mais nova (número de sequência) */
  function anotar(texto) {
    var meu = ++estado.seq;
    return esperar(LATENCIA).then(function () {
      if (meu !== estado.seq || SEM_REACAO) return;
      anota.hidden = false;
      if (estatico) { anotaTxt.textContent = texto; return; }
      anotaTxt.textContent = '';
      var i = 0;
      return new Promise(function (ok) {
        (function passo() {
          if (meu !== estado.seq) return ok();
          anotaTxt.textContent = texto.slice(0, ++i);
          if (i < texto.length) setTimeout(passo, tempo(POR_LETRA_ANOTA)); else ok();
        })();
      });
    });
  }

  /* digita o trecho; com parar=digitando, para logo depois da palavra que acende a 1ª peça (o quadro do "enquanto digita") */
  function digitar(txt, acende) {
    var i = 0;
    return new Promise(function (ok) {
      (function passo() {
        campo.value += txt.charAt(i++);
        campo.dispatchEvent(new Event('input'));
        if (acende && Q.get('parar') === 'digitando' && campo.value.slice(-acende.length) === acende) return setTimeout(function () { ok('parou'); }, tempo(ESPERA_LEITURA + 450));
        if (i >= txt.length) return ok();
        var c = txt.charAt(i - 1);
        setTimeout(passo, tempo(POR_LETRA + (c === ',' ? 220 : c === ' ' ? 30 : 0)));
      })();
    });
  }
  function parar(ponto) { if (Q.get('parar') === ponto) { estado.parado = ponto; estado.fim = true; return true; } return false; }

  function enviar() {
    var texto = campo.value, bolha = document.createElement('li');
    bolha.className = 'msg msg--visitante';
    bolha.appendChild(document.createElement('p')).textContent = texto;
    log.appendChild(bolha);
    var espera = document.createElement('li');
    espera.className = 'mv-espera';
    if (!SEM_REACAO && anotaTxt.textContent) {
      espera.appendChild(document.createElement('p')).className = 'mv-espera__rot';
      espera.lastChild.textContent = 'O Zero (IA) já anotou';
      espera.appendChild(document.createElement('p')).className = 'mv-espera__txt';
      espera.lastChild.textContent = anotaTxt.textContent;
      var copia = fila.cloneNode(true);
      copia.removeAttribute('id');
      espera.appendChild(copia);
    }
    var pensa = document.createElement('p');
    pensa.className = 'orc-pensando';
    pensa.textContent = 'Analisando o seu caso…';
    espera.appendChild(pensa);
    log.appendChild(espera);
    anima(espera, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 360);
    campo.value = ''; fila.textContent = ''; anota.hidden = true; anotaTxt.textContent = ''; estado.seq++;
  }

  async function roteiro() {
    estado.t0 = performance.now();
    var c = CASOS[caso];
    for (var k = 0; k < c.trechos.length; k++) {
      if (await digitar(c.trechos[k][0], c.acende) === 'parou' && parar('digitando')) return;
      await esperar(PAUSA_PARA_ANOTAR);
      var chegou = anotar(c.anotacoes[k]);
      if (k === c.trechos.length - 1) { await chegou; await esperar(500); if (parar('anotou')) return; await esperar(c.trechos[k][1] - 500); }
      else await esperar(c.trechos[k][1] - PAUSA_PARA_ANOTAR);
    }
    enviar();
    await esperar(2200);
    parar('enviou');
    estado.fim = true;
  }

  /* o relógio, no tempo da página (dividido pelo LENTO) */
  if (Q.get('captura') === '1') (function tique() {
    if (estado.t0) relogio.textContent = ((performance.now() - estado.t0) / LENTO / 1000).toFixed(1).replace('.', ',') + ' s';
    if (!estado.fim) requestAnimationFrame(tique);
  })();

  document.querySelectorAll('[data-caso]').forEach(function (b) { b.addEventListener('click', function () { location.search = '?caso=' + b.getAttribute('data-caso'); }); });
  var auto = document.querySelector('[data-acao="auto"]');
  if (auto) auto.addEventListener('click', function () { auto.disabled = true; roteiro(); });
  if (Q.get('auto') === '1') document.fonts.ready.then(function () { setTimeout(roteiro, tempo(600)); });
})();
