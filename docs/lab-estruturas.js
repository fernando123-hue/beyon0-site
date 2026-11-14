/* Laboratório das 5 estruturas do mapa do caso (spec 2026-11-13, §7). Desde o PR 5b ele desenha com os MÓDULOS REAIS da página (js/mapa-layout.js,
   js/mapa-desenho.js, css/orcamento-mapa.css): o que se aprova aqui é o que vai para a conversa. Cada caso de docs/lab-estruturas-casos.js nas 5
   estruturas, uma instância do desenho por estrutura (BZMapa.criar()). Fora do deploy. ES5.
   Parâmetros: ?caso=clinica|embalagens|loja|limites  &estatico=1 (quadro final, sem animação)  &captura=1 (sem os botões)  &pele=caixa|trilho
   (a pele do dono; sem o parâmetro, a da página). Fotos e conferência: node docs/lab-estruturas-fotos.mjs <pasta> */
(function () {
  'use strict';
  var CASOS = window.LAB_ESTRUTURAS_CASOS, Mapa = window.BZMapa, Forma = window.BZMapaForma, Saber = window.BZMapaSaber;
  var raiz = document.getElementById('estruturas');
  if (!CASOS || !Mapa || !Forma || !Saber || !raiz) return;
  var q = new URLSearchParams(location.search);
  var parado = q.get('estatico') === '1';
  var pele = q.get('pele') === 'caixa' || q.get('pele') === 'trilho' ? q.get('pele') : undefined;
  if (pele) document.documentElement.classList.add('pele-' + pele);
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  var ESTRUTURAS = [
    { id: 'caminho', nome: 'Caminho', quando: 'Um fluxo direto: alguém procura, encontra e chama.' },
    { id: 'antes_depois', nome: 'Antes e depois', quando: 'A dor é o trabalho repetido ou a perda fora de hora.' },
    { id: 'ramos', nome: 'Ramos', quando: 'Dois públicos ou dois serviços que pedem caminhos diferentes.' },
    { id: 'ciclo', nome: 'Ciclo', quando: 'O ganho está na volta: recompra, retorno, revisão.' },
    { id: 'mapa', nome: 'Mapa', quando: 'Várias forças ao mesmo tempo: de onde chegam, o que trava, o que resolve.' }
  ];
  function el(tag, cls, texto, pai) { var x = document.createElement(tag); if (cls) x.className = cls; if (texto != null) x.textContent = texto; if (pai) pai.appendChild(x); return x; }
  var instancias = [], atual = null, larguraFeita = 0;

  function montar(casoId) {
    var caso = CASOS[casoId], erros = [];
    instancias.forEach(function (m) { m.parar(); });
    instancias = [];
    raiz.textContent = '';
    atual = casoId; larguraFeita = raiz.clientWidth;
    var hoje = document.getElementById('hoje');
    hoje.textContent = 'Caso de exemplo do laboratório. Chegam por: ' + caso.hoje.origens.map(function (o) { return Saber.NOMES[o] || Saber.NOMES.outro; }).join(' · ') + '.';
    ESTRUTURAS.forEach(function (E) {
      var p = caso.estruturas[E.id], sec = el('section', 'le-estrutura', null, raiz);
      sec.setAttribute('data-estrutura', E.id);
      el('h2', 'le-h2', E.nome, sec);
      el('p', 'le-quando', E.quando, sec);
      var plano = { estrutura: E.id, hoje: caso.hoje, nos: p.nos, setas: p.setas, objetivo: caso.objetivo, fecho: caso.fecho };
      var v = Forma.validarFormaMapa(plano);
      if (!v.ok) { erros.push(E.nome + ': ' + v.motivos.join(', ')); return; }
      var lugar = el('div', 'le-lugar', null, sec), m = Mapa.criar();
      var r = m.montar(lugar, plano, { pele: pele, animar: !parado });
      if (!r.ok) erros.push(E.nome + ': ' + (r.motivos || []).join(', '));
      instancias.push(m);
    });
    var caixaErros = document.getElementById('erros');
    caixaErros.hidden = !erros.length;
    caixaErros.textContent = erros.join(' · ');
    window.LAB_ESTRUTURAS.erros = erros;
  }
  function escolher(id) {
    if (!tem(CASOS, id)) id = 'clinica';
    Array.prototype.forEach.call(document.querySelectorAll('[data-caso]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-caso') === id ? 'true' : 'false'); });
    montar(id);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-caso]'), function (b) { b.addEventListener('click', function () { escolher(b.getAttribute('data-caso')); }); });
  if (q.get('captura') === '1') document.documentElement.classList.add('lab-captura');
  window.LAB_ESTRUTURAS = { escolher: escolher, erros: [] };
  var adiado = 0;
  addEventListener('resize', function () {
    clearTimeout(adiado);
    adiado = setTimeout(function () { if (atual && raiz.clientWidth !== larguraFeita) montar(atual); }, 200);
  });
  /* a fonte muda a altura das caixas: o desenho mede depois da Sora */
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { escolher(q.get('caso')); window.LAB_ESTRUTURAS.pronto = true; });
})();
