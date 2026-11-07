/* ==========================================================================
   O RADAR DO ESCOPO: O DESENHO (SVG; a geometria e a paleta da prévia docs/design/radar-escopo/). Monta UMA vez o desenho decorativo
   (aria-hidden: o texto de verdade são os cantos, o selo e o valor em HTML, js/orcamento-escopo.js) e, a cada estado, só troca classes e
   atributos. Nada de texto de fora aqui: o SVG não tem texto. Script clássico (window.BZEscopoDesenho) e CommonJS (os testes), ES5.

   Camadas, de fora para dentro: a régua (120 marcas), o aro com o progresso REAL do pedido em 5 marcos, o anel das 4 dimensões (um quarto
   cada, com o nó no meio e a guia tracejada até o rótulo do canto), o ponteiro (só existe na tela com atividade real, css/orcamento-escopo.css),
   o núcleo. Traço de 1 px e cor chapada: sem desfoque, sem brilho, sem gradiente, sem filtro (regra do dono).
   O progresso e os arcos usam pathLength=1: o quanto está desenhado é o stroke-dashoffset (1 = nada, 0 = tudo), o que a tela anima.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZEscopoDesenho = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var C = 160, R_EXT = 148, R_DIM = 118, R_MIOLO = 90, PASSO_MARCO = 72;
  var DIMS = [{ id: 'entrega', ang: 315 }, { id: 'escopo', ang: 45 }, { id: 'integracoes', ang: 135 }, { id: 'prazo', ang: 225 }];
  var NIVEL_CLASSE = ['', ' is-identificada', ' is-confirmada'];

  function ponto(ang, r) { var a = (ang - 90) * Math.PI / 180; return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }; }
  function f(n) { return Math.round(n * 10) / 10; }
  /* arco no sentido horário de a0 a a1 (graus, 0 = topo) */
  function arco(a0, a1, r) {
    var i = ponto(a0, r), o = ponto(a1, r);
    return 'M' + f(i.x) + ' ' + f(i.y) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + f(o.x) + ' ' + f(o.y);
  }
  /* o círculo inteiro a partir do topo, no sentido horário (o progresso) */
  function volta(r) { return 'M' + C + ' ' + (C - r) + 'A' + r + ' ' + r + ' 0 1 1 ' + (C - 0.01) + ' ' + (C - r) + 'Z'; }
  /* quanto do aro o marco desenha: até o nó do marco atual; o anel fecha só na proposta confirmada */
  function fracao(marco, ouro) { return ouro ? 1 : Math.max(0, Math.min(4, marco)) * PASSO_MARCO / 360; }

  function el(doc, nome, at, pai) {
    var e = doc.createElementNS(NS, nome);
    for (var k in at) if (Object.prototype.hasOwnProperty.call(at, k)) e.setAttribute(k, at[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  function regua() {
    var d = '', i, a, longa, m0, m1;
    for (i = 0; i < 120; i++) {
      a = i * 3; longa = a % 30 === 0; m0 = ponto(a, R_EXT + 6); m1 = ponto(a, R_EXT + 6 - (longa ? 8 : 3));
      d += 'M' + f(m0.x) + ' ' + f(m0.y) + 'L' + f(m1.x) + ' ' + f(m1.y);
    }
    return d;
  }

  function montar(doc) {
    var svg = el(doc, 'svg', { viewBox: '0 0 320 320', 'class': 'rde-svg', 'aria-hidden': 'true', focusable: 'false' });
    var g = el(doc, 'g', { 'class': 'rde-g' }, svg), inst = { svg: svg, g: g, marcos: [], dims: {} }, k, mp;
    el(doc, 'path', { d: regua(), 'class': 'rde-marcas' }, g);
    el(doc, 'circle', { cx: C, cy: C, r: R_EXT, 'class': 'rde-aro' }, g);
    inst.progresso = el(doc, 'path', { d: volta(R_EXT), 'class': 'rde-progresso', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, g);
    for (k = 0; k < 5; k++) { mp = ponto(k * PASSO_MARCO, R_EXT); inst.marcos.push(el(doc, 'circle', { cx: f(mp.x), cy: f(mp.y), r: 3.2, 'class': 'rde-marco' }, g)); }
    DIMS.forEach(function (dm) {
      var n = ponto(dm.ang, R_DIM), r0 = ponto(dm.ang, R_DIM + 10), r1 = ponto(dm.ang, R_EXT + 18);
      inst.dims[dm.id] = {
        arco: el(doc, 'path', { d: arco(dm.ang - 40, dm.ang + 40, R_DIM), 'class': 'rde-dim', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 0 }, g),
        guia: el(doc, 'line', { x1: f(r0.x), y1: f(r0.y), x2: f(r1.x), y2: f(r1.y), 'class': 'rde-guia' }, g),
        aro: el(doc, 'circle', { cx: f(n.x), cy: f(n.y), r: 8, 'class': 'rde-no-aro' }, g),
        no: el(doc, 'circle', { cx: f(n.x), cy: f(n.y), r: 3.6, 'class': 'rde-no' }, g)
      };
    });
    /* o ponteiro com o rastro: sempre no DOM, mas só aparece (e gira, por CSS) com .is-ativo e movimento ligado */
    var vr = el(doc, 'g', { 'class': 'rde-varre' }, g), c0 = ponto(0, R_MIOLO + 2), t0 = ponto(0, R_EXT - 4);
    [-15, -10, -5].forEach(function (dd, n) {
      var a1 = ponto(dd, R_MIOLO + 2), b1 = ponto(dd, R_EXT - 4);
      el(doc, 'line', { x1: f(a1.x), y1: f(a1.y), x2: f(b1.x), y2: f(b1.y), 'class': 'rde-eco rde-eco--' + (3 - n) }, vr);
    });
    el(doc, 'line', { x1: f(c0.x), y1: f(c0.y), x2: f(t0.x), y2: f(t0.y), 'class': 'rde-ponteiro' }, vr);
    el(doc, 'circle', { cx: C, cy: C, r: R_MIOLO, 'class': 'rde-nucleo' }, g);
    el(doc, 'circle', { cx: C, cy: C, r: R_MIOLO - 7, 'class': 'rde-nucleo-anel' }, g);
    /* o fecho em ouro: um anel por fora do núcleo, que a tela desenha uma vez quando a proposta é confirmada */
    inst.fecho = el(doc, 'path', { d: volta(R_MIOLO + 6), 'class': 'rde-fecho', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, g);
    return inst;
  }

  /* o estado (de js/orcamento-escopo-estado.js) vira classes e atributos; idempotente e instantâneo (a animação é da tela) */
  function aplicar(inst, st) {
    var fr = fracao(st.marco, st.ouro), k, nv, cls, d;
    inst.g.setAttribute('class', 'rde-g' + (st.ouro ? ' is-ouro' : '') + (st.ativo ? ' is-ativo' : ''));
    inst.progresso.setAttribute('stroke-dashoffset', f((1 - fr) * 1000) / 1000);
    inst.progresso.setAttribute('class', 'rde-progresso' + (fr > 0 ? '' : ' is-vazio'));
    for (k = 0; k < 5; k++) inst.marcos[k].setAttribute('class', 'rde-marco' + (k < st.marco || st.ouro ? ' is-feito' : k === st.marco ? ' is-agora' : ''));
    for (k = 0; k < DIMS.length; k++) {
      d = inst.dims[DIMS[k].id]; nv = st.dims && st.dims[DIMS[k].id] ? st.dims[DIMS[k].id].nivel : 0;
      cls = NIVEL_CLASSE[nv] || '';
      d.arco.setAttribute('class', 'rde-dim' + cls);
      d.guia.setAttribute('class', 'rde-guia' + cls);
      d.no.setAttribute('class', 'rde-no' + cls);
      d.aro.setAttribute('class', 'rde-no-aro' + (nv === 2 ? ' is-confirmada' : ''));
    }
    inst.fecho.setAttribute('stroke-dashoffset', st.ouro ? 0 : 1);
  }

  /* o anel pequeno da barra do celular: o mesmo progresso, em 40 px */
  function montarAnel(doc) {
    var svg = el(doc, 'svg', { viewBox: '0 0 40 40', 'class': 'rde-anel', 'aria-hidden': 'true', focusable: 'false' });
    el(doc, 'circle', { cx: 20, cy: 20, r: 17, 'class': 'rde-anel__trilho' }, svg);
    /* (círculo girado -90°: começa no topo e anda no sentido horário, como o aro do radar) */
    var p = el(doc, 'circle', { cx: 20, cy: 20, r: 17, transform: 'rotate(-90 20 20)', 'class': 'rde-anel__progresso', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, svg);
    return { svg: svg, progresso: p };
  }
  function aplicarAnel(anel, st) {
    var fr = fracao(st.marco, st.ouro);
    anel.progresso.setAttribute('stroke-dashoffset', f((1 - fr) * 1000) / 1000);
    anel.svg.setAttribute('class', 'rde-anel' + (st.ouro ? ' is-ouro' : '') + (fr > 0 ? '' : ' is-vazio'));
  }

  return { montar: montar, aplicar: aplicar, montarAnel: montarAnel, aplicarAnel: aplicarAnel, fracao: fracao, ponto: ponto, arco: arco, DIMS: DIMS, R: { C: C, EXT: R_EXT, DIM: R_DIM, MIOLO: R_MIOLO } };
});
