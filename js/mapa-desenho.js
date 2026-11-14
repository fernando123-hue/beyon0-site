/* O MAPA DO CASO NA TELA (PR 5b, tarefas 3 e 4; plano docs/superpowers/plans/2026-11-14-pr5b-mapa-desenho.md). window.BZMapa = { montar(raiz, plano,
   opcoes), atualizar(plano, opcoes), parar() }: o MESMO contrato do BZPlanta (js/planta-desenho.js), para a cola (js/orcamento-planta.js) trocar de
   desenho pela versão do plano. Opções lidas: animar, esboco() (os pontos do esboço para o voo, lidos uma vez), som(nome), pele (só o laboratório).
   COMO MONTA (sem CLS, uma leitura só): valida a forma (BZMapaForma); escreve os nós e os rótulos no quadro ESCONDIDO, com a largura que cada um vai
   ter (BZMapaLayout.pedidos); lê as alturas uma vez; BZMapaLayout.compor dá a geometria; grava a altura do quadro e só então o mostra.
   MOVIMENTO: Web Animations pelo relógio que pausa (BZPlantaRelogio: aba escondida e quadro fora da tela); só transform e opacity, e o traço da
   seta uma vez por stroke-dashoffset. Movimento reduzido, html.menos-movimento ou sem a API: o quadro final, parado e aceso. No fim da entrada o
   objetivo vira ouro e sai "bz:planta-pronta" (o valor espera por ele: js/orcamento.js).
   SEGURANÇA: texto do plano só por textContent; papel, ícone, origem e estrutura passam por tabela com chave própria; o id do plano nunca vira
   classe, id, seletor nem atributo; a leitura para o leitor de tela é uma lista oculta de texto (nunca aria-label com texto da pessoa). ES5. */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = { para: fabrica };
  if (raiz) raiz.BZMapa = fabrica(raiz);
})(typeof window !== 'undefined' ? window : null, function (win) {
  'use strict';
  var doc = win.document, NS = 'http://www.w3.org/2000/svg';
  var Forma = win.BZMapaForma, Layout = win.BZMapaLayout, Pecas = win.BZPlantaPecas, Relogio = win.BZPlantaRelogio, Saber = win.BZMapaSaber;
  if (!Forma || !Layout || !Pecas || !Relogio || !Saber) return null;

  /* a pele escolhida pelo dono (A caixa / B trilho); opcoes.pele só serve ao laboratório */
  var PELE = 'trilho', CHANFRO = 8;
  var TITULO = 'O mapa do seu caso';
  var T = { no: 320, passo: 240, seta: 480, volta: 900, chega: 520, ouro: 420, depoisSeta: 160 };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  /* papel -> classe (lista fechada; nada do plano vira classe) */
  var PAPEL = { hoje: 'mpc-no--hoje', trava: 'mpc-no--trava', origem: 'mpc-no--origem', site: 'mpc-no--site', conversa: 'mpc-no--conversa', acao: 'mpc-no--acao', volta: 'mpc-no--volta', ajustado: 'mpc-no--ajustado', objetivo: 'mpc-no--objetivo' };
  var CINZA = { hoje: 1, trava: 1 };
  var CABECALHOS = ['Hoje', 'Com o site'];
  /* os desenhos das origens (grade de 40, só traço), por código; o desconhecido vira "outro" */
  var R = function (x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) + 'V' + (y + h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' +
      (x + w - r) + ' ' + (y + h) + 'H' + (x + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) + 'V' + (y + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z';
  };
  var C = function (cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0Z'; };
  var t = function (d, ac) { return { d: d, ac: !!ac }; };
  var ORIGENS = {
    instagram: [t(R(9, 9, 22, 22, 6)), t(C(20, 20, 5), 1), t(C(26, 14, 1))],
    whatsapp: [t('M12.5 27.5A11 11 0 1 1 16 30L9 32Z'), t('M16 17c0 4 3 7 7 7', 1)],
    google_busca: [t(C(17, 17, 8)), t('M23 23L31 31', 1)],
    google_mapa: [t('M20 32C14 25 11 21 11 17a9 9 0 0 1 18 0c0 4-3 8-9 15Z'), t(C(20, 17, 3), 1)],
    indicacao: [t(C(14, 14, 4)), t('M7 29c0-6 3-8 7-8s7 2 7 8'), t(C(27, 16, 3.5), 1), t('M23 23c1-1 2-2 4-2 4 0 6 2 6 8', 1)],
    passa_na_frente: [t('M8 16H32L30 10H10Z'), t('M10 16V31H30V16'), t(R(17, 22, 6, 9, 0), 1)],
    facebook: [t(C(12, 20, 3)), t(C(28, 12, 3)), t(C(28, 28, 3)), t('M15 19L25 13M15 21L25 27', 1)],
    tiktok: [t(R(9, 10, 22, 20, 4)), t('M18 15L25 20L18 25Z', 1)],
    site_atual: [t(R(7, 9, 26, 22, 2)), t('M7 15H33'), t('M11 21H25M11 25H21', 1)],
    outro: [t(C(20, 20, 9)), t('M16 20H24M21 17L24 20L21 23', 1)]
  };
  var codigoDaOrigem = function (c) { return tem(ORIGENS, c) ? c : 'outro'; };
  var aviso = function (e) { if (win.console && win.console.warn) win.console.warn('[planta] ' + (e && e.message ? e.message : e)); };

  function el(tag, cls, texto, pai) { var x = doc.createElement(tag); if (cls) x.className = cls; if (texto != null) x.textContent = texto; if (pai) pai.appendChild(x); return x; }
  function sv(tag, cls, pai) { var x = doc.createElementNS(NS, tag); if (cls) x.setAttribute('class', cls); if (pai) pai.appendChild(x); return x; }
  function tracos(lista, pai) { lista.forEach(function (tr) { var p = sv('path', tr.ac ? 'mpc-ac' : '', pai); p.setAttribute('d', tr.d); }); }
  function reduzido() {
    var m = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
    return !!((m && m.matches) || (doc.documentElement && doc.documentElement.classList.contains('menos-movimento')));
  }

  /* ---------- o nó: o chip (trilho) ou o ícone com a moldura de canto cortado (caixa), e o texto ---------- */
  function desenhoDoNo(n) {
    if (n.papel === 'origem') return ORIGENS[codigoDaOrigem(n.origem)];
    return Pecas.desenhar(n.papel === 'objetivo' ? 'confirmacao' : n.icone) || Pecas.desenhar('pagina') || [];
  }
  function chip(n, pai) {
    var s = sv('svg', 'mpc-chip', pai);
    s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (n.papel === 'objetivo') {
      var a = sv('circle', 'mpc-chip__aro', s), d = sv('circle', 'mpc-chip__disco', s), r = sv('path', 'mpc-chip__rumos', s);
      a.setAttribute('cx', 20); a.setAttribute('cy', 20); a.setAttribute('r', 13);
      d.setAttribute('cx', 20); d.setAttribute('cy', 20); d.setAttribute('r', 5);
      r.setAttribute('d', 'M20 1V5M39 20H35M20 39V35M1 20H5');
      return s;
    }
    sv('path', 'mpc-chip__borda', s).setAttribute('d', 'M' + CHANFRO + ' .5H39.5V39.5H.5V' + CHANFRO + 'Z');
    var g = sv('g', 'mpc-ico', s);
    g.setAttribute('transform', 'translate(9 9) scale(.55)');
    tracos(desenhoDoNo(n), g);
    return s;
  }
  function icone(n, pai) {
    var s = sv('svg', 'mpc-ico mpc-ico--solto', pai);
    s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    tracos(desenhoDoNo(n), s);
    return s;
  }
  function noEl(n, pele) {
    var caixa = el('div', 'mpc-no ' + PAPEL[tem(PAPEL, n.papel) ? n.papel : 'site']);
    caixa.setAttribute('aria-hidden', 'true');
    if (pele === 'trilho') chip(n, caixa); else icone(n, caixa);
    var txt = el('div', 'mpc-no__txt', null, caixa);
    if (n.papel === 'origem') el('span', 'mpc-no__origem', Saber.NOMES[codigoDaOrigem(n.origem)], txt);
    if (n.papel === 'ajustado') el('span', 'mpc-no__marca', 'Ajustado', txt);
    el('span', 'mpc-no__titulo', n.titulo, txt);
    el('span', 'mpc-no__frase', n.frase, txt);
    return caixa;
  }
  function moldura(caixa, w, h) {
    var m = sv('svg', 'mpc-moldura');
    m.setAttribute('width', w); m.setAttribute('height', h); m.setAttribute('aria-hidden', 'true');
    sv('path', '', m).setAttribute('d', 'M' + CHANFRO + ' .5H' + (w - 0.5) + 'V' + (h - 0.5) + 'H.5V' + CHANFRO + 'Z');
    caixa.insertBefore(m, caixa.firstChild);
  }
  /* polilinha com cantos arredondados (o raio encolhe no trecho curto) */
  function cantos(pts, raio) {
    var d = 'M' + pts[0][0] + ' ' + pts[0][1], i;
    for (i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var la = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), lc = Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1]), rr = Math.min(raio, la / 2, lc / 2);
      var ua = [(b[0] - a[0]) / (la || 1), (b[1] - a[1]) / (la || 1)], uc = [(c[0] - b[0]) / (lc || 1), (c[1] - b[1]) / (lc || 1)];
      d += 'L' + (b[0] - ua[0] * rr) + ' ' + (b[1] - ua[1] * rr) + 'Q' + b[0] + ' ' + b[1] + ' ' + (b[0] + uc[0] * rr) + ' ' + (b[1] + uc[1] * rr);
    }
    return d + 'L' + pts[pts.length - 1][0] + ' ' + pts[pts.length - 1][1];
  }
  var PONTAS = { dir: [[-5, -5], [-5, 5]], baixo: [[-5, -5], [5, -5]], cima: [[-5, 5], [5, 5]], esq: [[5, -5], [5, 5]] };

  /* a leitura para o leitor de tela: uma lista de texto, oculta na tela */
  function leitura(plano, pai) {
    var ol = el('ol', 'mpc-sr', null, pai), nomes = Object.create(null);
    plano.nos.forEach(function (n) { nomes[n.id] = n.titulo; });
    nomes.objetivo = plano.objetivo.titulo;
    plano.nos.forEach(function (n) {
      var org = n.papel === 'origem' ? Saber.NOMES[codigoDaOrigem(n.origem)] + ': ' : '';
      el('li', null, org + n.titulo + '. ' + n.frase + '.', ol);
    });
    el('li', null, 'Objetivo: ' + plano.objetivo.titulo + '. ' + plano.objetivo.frase + '.', ol);
    plano.setas.forEach(function (s) { el('li', null, nomes[s.de] + ', ' + s.rotulo + ', ' + nomes[s.para] + '.', ol); });
    return ol;
  }
  /* a linha "Hoje:" (a palavra é posta pela tela) e as origens pelo nome da tabela */
  function linhaDeHoje(plano, pai) {
    var h = plano.hoje;
    if (!h) return null;
    var p = el('p', 'mpc-hoje', null, pai);
    el('b', 'mpc-hoje__rot', 'Hoje:', p);
    var partes = [];
    if (h.texto) partes.push(h.texto);
    if (h.trava) partes.push(h.trava);
    if (partes.length) p.appendChild(doc.createTextNode(' ' + partes.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join('. ') + '.'));
    if (Array.isArray(h.origens) && h.origens.length) el('span', 'mpc-hoje__origens', ' Chegam por: ' + h.origens.map(function (o) { return Saber.NOMES[codigoDaOrigem(o)]; }).join(', ') + '.', p);
    return p;
  }

  var inst = null;

  /* ---------- montar: tudo numa chamada; o quadro só aparece com a geometria final ---------- */
  function compor(i) {
    var plano = i.plano, pele = i.pele, quadro = i.quadro, larg = quadro.clientWidth || i.raiz.clientWidth || 0;
    if (!(larg > 0)) return false;
    var pedidos = Layout.pedidos(plano, larg, pele), nos = Object.create(null), rots = [], medidas = {};
    var dados = Object.create(null);
    plano.nos.forEach(function (n) { dados[n.id] = n; });
    dados.objetivo = { id: 'objetivo', papel: 'objetivo', titulo: plano.objetivo.titulo, frase: plano.objetivo.frase };
    while (quadro.firstChild) quadro.removeChild(quadro.firstChild);
    quadro.classList.add('is-medindo');
    quadro.classList.toggle('mpc-quadro--cel', !!(pedidos[0] && pedidos[0].celular));
    quadro.classList.toggle('mpc-quadro--desk', !(pedidos[0] && pedidos[0].celular));
    /* 1. escreve tudo */
    pedidos.forEach(function (p) {
      if (p.chave.indexOf('no:') === 0) { var e = noEl(dados[p.id], pele); e.style.width = p.largura + 'px'; quadro.appendChild(e); nos[p.id] = e; }
      else { var r = el('span', 'mpc-rot', plano.setas[+p.chave.slice(4)].rotulo, quadro); r.setAttribute('aria-hidden', 'true'); r.style.maxWidth = p.larguraMax + 'px'; rots[+p.chave.slice(4)] = r; }
    });
    /* 2. lê tudo, uma vez */
    pedidos.forEach(function (p) {
      if (p.chave.indexOf('no:') === 0) medidas[p.chave] = nos[p.id].offsetHeight || 0;
      else { var r = rots[+p.chave.slice(4)]; medidas[p.chave] = { w: r.offsetWidth || 0, h: r.offsetHeight || 0 }; }
    });
    /* 3. a geometria, e só escrita daqui em diante */
    var g = Layout.compor(plano, larg, medidas, pele);
    var svg = sv('svg', 'mpc-svg');
    svg.setAttribute('width', larg); svg.setAttribute('height', g.H); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    quadro.insertBefore(svg, quadro.firstChild);
    Object.keys(nos).forEach(function (id) {
      var b = g.caixas[id], e = nos[id];
      e.style.height = b.h + 'px';
      e.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
      if (pele !== 'trilho') moldura(e, b.w, b.h);
    });
    var setas = g.setas.map(function (r) {
      var fim = r.curva ? r.curva[3] : r.linha[r.linha.length - 1], ini = r.curva ? r.curva[0] : r.linha[0];
      var cinza = tem(CINZA, dados[r.de].papel) || tem(CINZA, dados[r.para].papel);
      var gg = sv('g', 'mpc-seta' + (cinza ? ' mpc-seta--cinza' : '') + (r.volta ? ' mpc-seta--volta' : ''), svg);
      var linha = sv('path', 'mpc-seta__linha', gg);
      linha.setAttribute('d', r.curva ? 'M' + r.curva[0] + 'C' + r.curva[1] + ' ' + r.curva[2] + ' ' + r.curva[3] : cantos(r.linha, 6));
      linha.setAttribute('pathLength', '1');
      var k = PONTAS[r.ponta], ponta = sv('path', 'mpc-seta__ponta', gg);
      ponta.setAttribute('d', 'M' + (fim[0] + k[0][0]) + ' ' + (fim[1] + k[0][1]) + 'L' + fim[0] + ' ' + fim[1] + 'L' + (fim[0] + k[1][0]) + ' ' + (fim[1] + k[1][1]));
      var o = sv('circle', 'mpc-seta__origem', gg);
      o.setAttribute('cx', ini[0]); o.setAttribute('cy', ini[1]); o.setAttribute('r', 2);
      var rot = rots[r.i];
      if (cinza) rot.classList.add('mpc-rot--cinza');
      rot.style.transform = 'translate(' + r.rot.left + 'px,' + r.rot.top + 'px)';
      return { r: r, g: gg, linha: linha, rot: rot };
    });
    g.cabecalhos.forEach(function (c) {
      var h = el('span', 'mpc-cab', CABECALHOS[c.faixa], quadro);
      h.setAttribute('aria-hidden', 'true');
      h.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px)';
    });
    quadro.style.height = g.H + 'px';
    quadro.classList.remove('is-medindo');
    i.g = g; i.nos = nos; i.setas = setas; i.larg = larg;
    return true;
  }

  function pronta() { if (win.CustomEvent && doc.dispatchEvent) doc.dispatchEvent(new win.CustomEvent('bz:planta-pronta')); }
  function final(i) {
    i.quadro.classList.add('is-aceso', 'is-ouro');
    i.status.textContent = 'O mapa do seu caso está pronto.';
    pronta();
  }
  /* a entrada genérica do laboratório: os nós acendem na ordem da história, a luz corre cada seta, o objetivo vira ouro (o jeito de cada estrutura:
     tarefa 4) */
  function entrada(i) {
    var rel = i.rel, quando = Object.create(null), tAt = 0, som = typeof i.opcoes.som === 'function' ? i.opcoes.som : function () {};
    i.g.ordem.forEach(function (id) {
      var chegam = i.setas.filter(function (s) { return s.r.para === id && !s.r.volta && quando[s.r.de] != null; });
      var em = chegam.length ? Math.max.apply(null, chegam.map(function (s) { return quando[s.r.de]; })) + T.chega : tAt;
      quando[id] = em; tAt = Math.max(tAt, em + T.passo);
    });
    i.quadro.classList.add('is-aceso');
    Object.keys(i.nos).forEach(function (id) {
      rel.anim(i.nos[id], [{ opacity: 0, transform: i.nos[id].style.transform + ' translateY(5px)' }, { opacity: 1, transform: i.nos[id].style.transform }], { duration: T.no, delay: quando[id], easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      rel.depois(quando[id], function () { som('passa'); });
    });
    i.setas.forEach(function (s) {
      var em = quando[s.r.de] + (s.r.volta ? T.ouro + 360 : T.depoisSeta), dura = s.r.volta ? T.volta : T.seta;
      rel.anim(s.linha, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: dura, delay: em, easing: 'ease-in-out', fill: 'backwards' });
      rel.anim(s.rot, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: em + dura * 0.5, fill: 'backwards' });
      var luz = el('span', 'mpc-luz', null, i.quadro);
      luz.setAttribute('aria-hidden', 'true');
      var pts = Layout.amostrar(s.r, 16);
      rel.anim(luz, pts.map(function (pt, k) { return { transform: 'translate(' + (pt[0] - 3) + 'px,' + (pt[1] - 3) + 'px)', opacity: k === 0 || k === pts.length - 1 ? 0 : 1 }; }), { duration: dura, delay: em, easing: 'ease-in-out', fill: 'both' });
    });
    rel.depois(quando.objetivo + T.ouro, function () { i.quadro.classList.add('is-ouro'); som('ouro'); });
    var fim = Math.max(quando.objetivo + T.ouro, i.setas.reduce(function (m, s) { return Math.max(m, quando[s.r.de] + (s.r.volta ? T.ouro + 360 + T.volta : T.depoisSeta + T.seta)); }, 0));
    rel.depois(fim + 200, function () { i.status.textContent = 'O mapa do seu caso está pronto.'; pronta(); });
  }

  function ligarPausa(i) {
    i.aoVisivel = function () { if (doc.hidden) i.rel.pausar(); else if (i.naTela !== false) i.rel.retomar(); };
    doc.addEventListener('visibilitychange', i.aoVisivel);
    if (win.IntersectionObserver) {
      i.io = new win.IntersectionObserver(function (ents) {
        ents.forEach(function (e) { i.naTela = e.isIntersecting; if (e.isIntersecting && !doc.hidden) i.rel.retomar(); else i.rel.pausar(); });
      }, { threshold: 0.35 });
      i.io.observe(i.quadro);
    }
  }

  function montar(raizEl, plano, opcoes) {
    var v = Forma.validarFormaMapa(plano);
    if (!v || !v.ok) return { ok: false, motivos: (v && v.motivos) || ['forma'] };
    if (!raizEl) return { ok: false, motivos: ['sem_raiz'] };
    parar();
    var op = opcoes || {}, wrap = el('div', 'mpc');
    while (raizEl.firstChild) raizEl.removeChild(raizEl.firstChild);
    el('h2', 'mpc-titulo', TITULO, wrap);
    linhaDeHoje(v.plano, wrap);
    var pele = op.pele === 'caixa' || op.pele === 'trilho' ? op.pele : PELE;
    var quadro = el('div', 'mpc-quadro mpc-pele-' + pele, null, wrap);
    if (v.plano.fecho) el('p', 'mpc-fecho', v.plano.fecho, wrap);
    leitura(v.plano, wrap);
    var status = el('p', 'mpc-status', '', wrap);
    status.setAttribute('role', 'status');
    raizEl.appendChild(wrap);
    var i = { raiz: raizEl, wrap: wrap, quadro: quadro, status: status, plano: v.plano, json: JSON.stringify(v.plano), opcoes: op,
      pele: pele, rel: Relogio.criar(), io: null, aoVisivel: null, naTela: true };
    inst = i;
    if (!compor(i)) { parar(); return { ok: false, motivos: ['sem_largura'] }; }
    var anima = op.animar !== false && !reduzido() && typeof quadro.animate === 'function';
    if (anima) { ligarPausa(i); entrada(i); } else final(i);
    return { ok: true, largura: i.larg, altura: i.g.H, animada: anima, etapas: i.g.ordem.length };
  }

  /* atualizar: o mesmo plano não refaz nada; outro plano v3 refaz com a entrada (o nó novo que cresce e o deslize vêm no PR 5c) */
  function atualizar(plano, opcoes) {
    if (!inst) return { ok: false, motivos: ['sem_faixa'] };
    var v = Forma.validarFormaMapa(plano);
    if (!v || !v.ok) return { ok: false, motivos: (v && v.motivos) || ['forma'] };
    var op = inst.opcoes, k;
    if (opcoes) for (k in opcoes) if (Object.prototype.hasOwnProperty.call(opcoes, k)) op[k] = opcoes[k];
    if (JSON.stringify(v.plano) === inst.json) return { ok: true, refeita: false };
    var r = montar(inst.raiz, v.plano, op);
    return r.ok ? { ok: true, refeita: true } : r;
  }

  function parar() {
    if (!inst) return;
    var i = inst;
    inst = null;
    try { i.rel.parar(); } catch (e) { aviso(e); }
    if (i.io) i.io.disconnect();
    if (i.aoVisivel) doc.removeEventListener('visibilitychange', i.aoVisivel);
    while (i.raiz.firstChild) i.raiz.removeChild(i.raiz.firstChild);
  }

  return { montar: montar, atualizar: atualizar, parar: parar };
});
