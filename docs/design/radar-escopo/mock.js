/* PRÉVIA v2 do radar do escopo (07/11), só para aprovação da direção. Não é o módulo final.
   Quatro dimensões do projeto, cada uma com o seu quarto de anel: pendente (grafite), identificada (ciano), confirmada (branco);
   conclusão em ouro. O aro externo é o progresso real do pedido (5 marcos). O ponteiro só varre enquanto algo acontece de verdade
   (o Zero pensando, o preço sendo recalculado). Traço de 1 px, cor chapada, sem desfoque. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = 160, R_EXT = 148, R_DIM = 118, R_MIOLO = 84;
  var DIMS = [
    { id: 'entrega', nome: 'Entrega', ang: 315 },
    { id: 'escopo', nome: 'Escopo', ang: 45 },
    { id: 'integracoes', nome: 'Integrações', ang: 135 },
    { id: 'prazo', nome: 'Prazo', ang: 225 }
  ];
  var MARCOS = ['Briefing', 'Análise', 'Estimativa', 'Proposta', 'Confirmada'];
  function el(nome, at, pai) {
    var e = document.createElementNS(NS, nome);
    for (var k in at) if (Object.prototype.hasOwnProperty.call(at, k)) e.setAttribute(k, at[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  function p(ang, r) { var a = (ang - 90) * Math.PI / 180; return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }; }
  function f(n) { return Math.round(n * 10) / 10; }
  function arco(a0, a1, r) {
    var i = p(a0, r), o = p(a1, r);
    return 'M' + f(i.x) + ' ' + f(i.y) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + f(o.x) + ' ' + f(o.y);
  }

  /* st: { marco: 0..4, rotulo, valor, dims: { entrega: [nivel, texto], ... }, ativo: bool, giro, ouro } */
  function radar(st) {
    var svg = el('svg', { viewBox: '0 0 320 320', 'class': 'rde-svg', 'aria-hidden': 'true' });
    var g = el('g', { 'class': 'rde' + (st.ouro ? ' is-ouro' : '') }, svg);
    /* régua do aro: 120 marcas, longas a cada 30° */
    var d = '';
    for (var i = 0; i < 120; i++) {
      var a = i * 3, longa = a % 30 === 0, m0 = p(a, R_EXT + 6), m1 = p(a, R_EXT + 6 - (longa ? 8 : 3));
      d += 'M' + f(m0.x) + ' ' + f(m0.y) + 'L' + f(m1.x) + ' ' + f(m1.y);
    }
    el('path', { d: d, 'class': 'rde-marcas' }, g);
    el('circle', { cx: C, cy: C, r: R_EXT, 'class': 'rde-aro' }, g);
    /* progresso do pedido: 5 marcos no aro (de 72 em 72 graus a partir do topo) */
    var fr = st.marco / 4;
    if (fr > 0) el('path', { d: fr >= 1 ? 'M' + C + ' ' + (C - R_EXT) + 'A' + R_EXT + ' ' + R_EXT + ' 0 1 1 ' + (C - .01) + ' ' + (C - R_EXT) : arco(0, fr * 288, R_EXT), 'class': 'rde-progresso' }, g);
    for (var k = 0; k < 5; k++) {
      var mp = p(k * 72, R_EXT);
      el('circle', { cx: f(mp.x), cy: f(mp.y), r: 3.2, 'class': 'rde-marco' + (k < st.marco ? ' is-feito' : k === st.marco ? ' is-agora' : '') }, g);
    }
    /* as 4 dimensões: um quarto de anel cada (com vão), e o nó no meio do quarto */
    DIMS.forEach(function (dm) {
      var nv = (st.dims[dm.id] || [0])[0];
      var cls = nv === 2 ? ' is-confirmada' : nv === 1 ? ' is-identificada' : '';
      el('path', { d: arco(dm.ang - 40, dm.ang + 40, R_DIM), 'class': 'rde-dim' + cls }, g);
      var n = p(dm.ang, R_DIM);
      if (nv === 2) el('circle', { cx: f(n.x), cy: f(n.y), r: 8, 'class': 'rde-no-aro' }, g);
      el('circle', { cx: f(n.x), cy: f(n.y), r: nv ? 3.6 : 2.6, 'class': 'rde-no' + cls }, g);
      /* a linha que liga o nó ao rótulo do canto */
      var r0 = p(dm.ang, R_DIM + 10), r1 = p(dm.ang, R_EXT + 18);
      el('line', { x1: f(r0.x), y1: f(r0.y), x2: f(r1.x), y2: f(r1.y), 'class': 'rde-guia' + cls }, g);
    });
    /* o ponteiro: só existe quando algo está acontecendo de verdade */
    if (st.ativo) {
      var vr = el('g', { 'class': 'rde-varre' }, g);
      vr.style.setProperty('--giro', (st.giro || 0) + 'deg');
      var c0 = p(0, R_MIOLO + 2), t0 = p(0, R_EXT - 4);
      el('line', { x1: f(c0.x), y1: f(c0.y), x2: f(t0.x), y2: f(t0.y), 'class': 'rde-ponteiro' }, vr);
      [-5, -10, -15].forEach(function (dd, n) {
        var a1 = p(dd, R_MIOLO + 2), b1 = p(dd, R_EXT - 4);
        el('line', { x1: f(a1.x), y1: f(a1.y), x2: f(b1.x), y2: f(b1.y), 'class': 'rde-eco rde-eco--' + (n + 1) }, vr);
      });
    }
    /* o núcleo */
    el('circle', { cx: C, cy: C, r: R_MIOLO, 'class': 'rde-miolo' }, g);
    el('circle', { cx: C, cy: C, r: R_MIOLO - 7, 'class': 'rde-miolo-anel' }, g);
    var t1 = el('text', { x: C, y: 136, 'class': 'rde-rot' }, g); t1.textContent = 'INVESTIMENTO ESTIMADO';
    var t2 = el('text', { x: C, y: 170, 'class': 'rde-valor' + (st.valor ? '' : ' is-vazio') }, g); t2.textContent = st.valor || '—';
    var t3 = el('text', { x: C, y: 194, 'class': 'rde-estado' }, g); t3.textContent = st.rotulo.toUpperCase();
    return svg;
  }

  function cantos(st) {
    var frag = document.createDocumentFragment();
    DIMS.forEach(function (dm) {
      var v = st.dims[dm.id] || [0, 'A definir'];
      var div = document.createElement('div');
      div.className = 'rde-canto rde-canto--' + dm.id + (v[0] === 2 ? ' is-confirmada' : v[0] === 1 ? ' is-identificada' : '');
      div.innerHTML = '<span class="rde-canto__nome">' + dm.nome + '</span><span class="rde-canto__valor">' + v[1] + '</span>';
      frag.appendChild(div);
    });
    return frag;
  }
  function trilha(marco, ouro) {
    var ol = document.createElement('ol');
    ol.className = 'rde-trilha';
    MARCOS.forEach(function (nome, i) {
      var li = document.createElement('li');
      li.className = i < marco ? 'is-feito' : i === marco ? 'is-agora' + (ouro ? ' is-ouro' : '') : '';
      li.innerHTML = '<span class="rde-trilha__marca" aria-hidden="true"></span>' + nome;
      ol.appendChild(li);
    });
    return ol;
  }
  function montar(alvo, st, compacto) {
    var caixa = document.createElement('div'); caixa.className = 'rde-caixa';
    caixa.appendChild(radar(st));
    if (!compacto) caixa.appendChild(cantos(st));
    alvo.appendChild(caixa);
    if (!compacto) alvo.appendChild(trilha(st.marco, st.ouro));
  }

  var EST = {
    aguardando: { marco: 0, rotulo: 'Aguardando briefing', valor: null, dims: {} },
    identificando: { marco: 0, rotulo: 'Identificando', valor: null, ativo: true, giro: 70, dims: { entrega: [1, 'Site com várias páginas'] } },
    analise: { marco: 1, rotulo: 'Escopo em análise', valor: null, ativo: true, giro: 200, dims: { entrega: [1, 'Site institucional'], integracoes: [1, 'Agendamento online'], prazo: [1, 'Antes de abril'] } },
    estimativa: { marco: 2, rotulo: 'Estimativa preliminar', valor: 'R$ 8.350', dims: { entrega: [1, 'Site institucional'], escopo: [1, 'Até 5 páginas · 1 extra'], integracoes: [1, 'Agendamento online'], prazo: [1, '9 dias úteis'] } },
    proposta: { marco: 3, rotulo: 'Proposta configurada', valor: 'R$ 8.350', dims: { entrega: [2, 'Site institucional'], escopo: [2, 'Até 5 páginas · 1 extra'], integracoes: [2, 'Agendamento online'], prazo: [2, '9 dias úteis'] } },
    confirmada: { marco: 4, ouro: true, rotulo: 'Proposta confirmada', valor: 'R$ 8.350', dims: { entrega: [2, 'Site institucional'], escopo: [2, 'Até 5 páginas · 1 extra'], integracoes: [2, 'Agendamento online'], prazo: [2, '9 dias úteis'] } }
  };
  document.querySelectorAll('[data-estado]').forEach(function (alvo) {
    montar(alvo, EST[alvo.getAttribute('data-estado')], alvo.hasAttribute('data-compacto'));
  });
})();
