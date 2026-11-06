/* PLANTA VIVA: o DESENHO e a ENTRADA. window.BZPlanta = { montar(raiz, plano, opcoes), atualizar(plano, opcoes), parar() }.
   montar valida a forma (BZPlantaForma), mede a largura, grava a altura reservada e constrói tudo NA MESMA CHAMADA (nada nasce com altura 0
   nem espera fonte ou observador); { ok:false, motivos } se o plano for inválido ou a faixa estiver sem largura. atualizar compara por id: só o
   id novo ganha "Ajustado" e as caixas deslizam; sem id em comum, refaz tudo. opcoes: origem ('modelo'|'padrao'), editavel, nome, aoCerto,
   aoAjustar, animar, largura, fala.
   MOVIMENTO: Web Animations API; nenhum requestAnimationFrame. stroke-dashoffset só uma vez (rotas e cabeça de luz); pulso de repouso e ondas
   só transform/opacity. Estados são classes. Sem a API, com prefers-reduced-motion ou html.menos-movimento: quadro final, parado. A animação
   começa com 35% do quadro na tela e pausa fora dela e com a aba escondida.
   SEGURANÇA: todo texto do modelo entra por textContent; id só em data-id e em chaves de objeto sem protótipo; nada de innerHTML. ES5. */
(function (raiz, fabrica) {
  'use strict';
  var dep = function (nome, arquivo) { return typeof require === 'function' ? require(arquivo) : (raiz ? raiz[nome] : undefined); };
  var api = fabrica(dep('BZPlantaForma', './orcamento-planta-forma.js'), dep('BZPlantaLayout', './planta-layout.js'), dep('BZPlantaPecas', './planta-pecas.js'));
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZPlanta = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function (Forma, Layout, Pecas) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CHAMFRO = 7, T_INTRO = 1.9, T_ALVO = 7.6, VIDA_PERIODO_MIN = 6000, VIDA_MAXIMO = 60000, FRACAO_VISIVEL = 0.35, ESPERA_RESIZE = 160, TOLERANCIA_LARGURA = 6;
  var NOTA_MODELO = 'É o desenho do que o seu site pode fazer, a partir do que você contou. O que entra de fato é combinado no orçamento.';
  var NOTA_PADRAO = 'Um desenho de exemplo para o seu tipo de negócio. Conforme você contar mais, o Zero refaz.';

  var criarMapa = function () { return Object.create(null); };
  var tem = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var dois = function (n) { return (n < 10 ? '0' : '') + n; };
  var dist = function (a, b) { var x = b[0] - a[0], y = b[1] - a[1]; return Math.sqrt(x * x + y * y); };
  var mesclar = function (a, b) { var o = {}, k; for (k in a) if (tem(a, k)) o[k] = a[k]; for (k in b) if (tem(b, k)) o[k] = b[k]; return o; };

  var caixaD = function (w, h, dupla) { return 'M' + CHAMFRO + ' 0H' + w + 'V' + (dupla ? h - CHAMFRO : h) + (dupla ? 'L' + (w - CHAMFRO) + ' ' + h : '') + 'H0V' + CHAMFRO + 'Z'; };
  var cantosD = function (w, h) {
    var c = 9, o = 5;
    return 'M' + (-o) + ' ' + (c - o) + 'V' + (-o) + 'H' + (c - o) + 'M' + (w + o - c) + ' ' + (-o) + 'H' + (w + o) + 'V' + (c - o) + 'M' + (w + o) + ' ' + (h + o - c) + 'V' + (h + o) + 'H' + (w + o - c) + 'M' + (c - o) + ' ' + (h + o) + 'H' + (-o) + 'V' + (h + o - c);
  };
  function rotaD(pts, raio) {
    var d = 'M' + r1(pts[0][0]) + ' ' + r1(pts[0][1]), i;
    for (i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      if (!c) { d += 'L' + r1(b[0]) + ' ' + r1(b[1]); break; }
      var l1 = dist(a, b), l2 = dist(b, c), r = Math.min(raio, l1 / 2, l2 / 2);
      var p1 = [b[0] - (b[0] - a[0]) / l1 * r, b[1] - (b[1] - a[1]) / l1 * r], p2 = [b[0] + (c[0] - b[0]) / l2 * r, b[1] + (c[1] - b[1]) / l2 * r];
      d += 'L' + r1(p1[0]) + ' ' + r1(p1[1]) + 'Q' + r1(b[0]) + ' ' + r1(b[1]) + ' ' + r1(p2[0]) + ' ' + r1(p2[1]);
    }
    return d;
  }
  function setaD(pts) {
    var a = pts[pts.length - 2], b = pts[pts.length - 1], l = dist(a, b), ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
    var p = function (k, s) { return [b[0] - ux * k - uy * s, b[1] - uy * k + ux * s]; };
    var p1 = p(7, 4), p2 = p(7, -4);
    return 'M' + r1(p1[0]) + ' ' + r1(p1[1]) + 'L' + r1(b[0]) + ' ' + r1(b[1]) + 'L' + r1(p2[0]) + ' ' + r1(p2[1]);
  }
  var comprimento = function (pts) { var s = 0, i; for (i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; };
  function gradeD(W, H) {
    var d = '', x, y;
    for (x = 24; x < W; x += 24) d += 'M' + x + ' 0V' + H;
    for (y = 24; y < H; y += 24) d += 'M0 ' + y + 'H' + W;
    return d;
  }
  var semente = function (seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; };
  function hashDeIds(g) {
    var h = 2166136261, i, j, id;
    for (i = 0; i < g.nos.length; i++) { id = g.nos[i].id; for (j = 0; j < id.length; j++) { h ^= id.charCodeAt(j); h = (h * 16777619) % 4294967296; } }
    return h;
  }
  function emaranhado(g, seed) {
    var r = semente(seed), a = g.mapa.nucleo, b = g.mapa.led, N = 46, i;
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    var alvo = Math.atan2(by - ay, bx - ax), len = dist([ax, ay], [bx, by]), passo = Math.min(len / N * 2.6, 70);
    var pts = [[ax, ay]], x = ax, y = ay, ang = alvo;
    for (i = 1; i < N - 1; i++) {
      var fe = i / N;
      ang = alvo + (ang - alvo) * 0.35 + (r() - 0.5) * Math.PI * 2.6;
      x = Math.min(g.W - 8, Math.max(8, x + Math.cos(ang) * passo * (0.6 + r()) + (bx - x) / (N - i) * fe));
      y = Math.min(g.H - 8, Math.max(8, y + Math.sin(ang) * passo * (0.6 + r()) + (by - y) / (N - i) * fe));
      pts.push([x, y]);
    }
    pts.push([bx, by]);
    var d = 'M' + r1(pts[0][0]) + ' ' + r1(pts[0][1]);
    for (i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + r1(p1[0] + (p2[0] - p0[0]) / 5) + ' ' + r1(p1[1] + (p2[1] - p0[1]) / 5) + ' ' + r1(p2[0] - (p3[0] - p1[0]) / 5) + ' ' + r1(p2[1] - (p3[1] - p1[1]) / 5) + ' ' + r1(p2[0]) + ' ' + r1(p2[1]);
    }
    return d;
  }

  function criarRelogio(win, aoErro) {
    var ev = [], prox = 0, inicio = 0, decorrido = 0, timer = 0, rodando = false, seq = 0;
    var agora = function () { return win.performance && win.performance.now ? win.performance.now() : 0; };
    function parar() { if (timer) { win.clearTimeout(timer); timer = 0; } }
    function agendar() {
      parar();
      if (!rodando || prox >= ev.length) return;
      timer = win.setTimeout(disparar, Math.max(0, ev[prox].t * 1000 - (agora() - inicio)));
    }
    function disparar() {
      timer = 0;
      var dec = agora() - inicio;
      while (prox < ev.length && ev[prox].t * 1000 <= dec + 2) {
        var e = ev[prox++];
        try { e.fn(); } catch (x) { aoErro(x); }
      }
      agendar();
    }
    return {
      em: function (t, fn) { ev.push({ t: t, fn: fn, s: seq++ }); },
      iniciar: function () { ev.sort(function (a, b) { return a.t - b.t || a.s - b.s; }); prox = 0; decorrido = 0; inicio = agora(); rodando = true; agendar(); },
      pausar: function () { if (!rodando) return; decorrido = agora() - inicio; rodando = false; parar(); },
      retomar: function () { if (rodando || !ev.length) return; inicio = agora() - decorrido; rodando = true; agendar(); },
      encerrar: function () { parar(); rodando = false; ev = []; prox = 0; }
    };
  }

  function criar(win) {
    var doc = win.document;
    var inst = null;

    var classe = function (el, cls) { var p = String(cls).split(' '), i; for (i = 0; i < p.length; i++) if (p[i]) el.classList.add(p[i]); };
    function S(tag, attrs, pai, cls) {
      var e = doc.createElementNS(NS, tag), k;
      if (cls) classe(e, cls);
      for (k in attrs) if (tem(attrs, k)) e.setAttribute(k, attrs[k]);
      if (pai) pai.appendChild(e);
      return e;
    }
    function H(tag, cls, txt, pai) {
      var e = doc.createElement(tag);
      if (cls) classe(e, cls);
      if (txt != null) e.textContent = txt;
      if (pai) pai.appendChild(e);
      return e;
    }
    var limparFilhos = function (el) { el.textContent = ''; };
    var px = function (n) { return r1(n) + 'px'; };

    function reduzido() {
      var m = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
      return !!((m && m.matches) || (doc.documentElement && doc.documentElement.classList.contains('menos-movimento')));
    }
    var aviso = function (e) { if (win.console && win.console.warn) win.console.warn('[planta] ' + (e && e.message ? e.message : e)); };

    function estacao(gg, n, li, ref) {
      var mov = ref.mov;
      S('path', { d: caixaD(n.w, n.h, n.decisao) }, mov, 'plv-caixa');
      if (ref.ajustado) S('path', { d: cantosD(n.w, n.h) }, mov, 'plv-cantos');
      var ic = n.ic || [11, 34, 1];
      var ig = S('g', { transform: 'translate(' + r1(ic[0]) + ' ' + r1(ic[1]) + ')' + (ic[2] !== 1 ? ' scale(' + ic[2] + ')' : '') }, mov, 'plv-icone');
      var tracos = Pecas.desenhar(n.est.tipo, n.est.n) || [];
      tracos.forEach(function (t) {
        var p = S('path', { d: t.d, pathLength: 1 }, ig, t.ac ? 'plv-ac' : '');
        if (ic[2] !== 1) p.style.strokeWidth = String(r1(1.25 / ic[2]));
      });
      classe(li, 'plv-est plv-est--' + n.modo + (n.modo === 'topo' && n.w < 150 ? ' plv-est--c' : '') + (n.compacto ? ' plv-est--sat' : '') + (n.lin ? ' plv-lin' + n.lin : ''));
      var hd = H('span', 'plv-hd', null, li);
      H('span', 'plv-n', dois(n.num), hd); H('span', 'plv-verbo', n.est.verbo, hd);
      H('span', 'plv-tit', n.est.titulo, li);
      H('span', 'plv-sr', n.est.frase, li);
      if (ref.ajustado) H('span', 'plv-etq', 'Ajustado', li);
    }
    function chamada(li, n, mov, r) {
      var rot = n.rot;
      li.style.left = px(rot.x); li.style.top = px(rot.y); li.style.width = px(rot.w); li.style.textAlign = rot.al === 'r' ? 'right' : 'left';
      if (rot.topo) { li.style.height = px(rot.h); classe(li, 'plv-ponta--topo'); S('path', { d: 'M' + r1(r) + ' -3V' + r1(-n.guia) }, mov, 'plv-guia'); } else li.style.height = px(rot.h);
    }
    function nucleo(gg, n, li, ref) {
      var r = n.w / 2, cg = S('g', { transform: 'translate(' + r1(r) + ' ' + r1(r) + ')' }, ref.mov), i, d = '';
      classe(gg, 'plv-nucleo');
      S('circle', { r: r1(r * 0.76) }, cg, 'plv-aro');
      S('circle', { r: r1(r * 0.16) }, cg, 'plv-disco');
      var gira = S('g', {}, cg, 'plv-gira');
      S('circle', { r: r1(r * 0.5) }, gira, 'plv-aro plv-aro--int');
      for (i = 0; i < 12; i++) { var a = i * Math.PI / 6, c0 = Math.cos(a), s0 = Math.sin(a); d += 'M' + (c0 * r * 0.88).toFixed(2) + ' ' + (s0 * r * 0.88).toFixed(2) + 'L' + (c0 * r).toFixed(2) + ' ' + (s0 * r).toFixed(2); }
      S('path', { d: d }, gira, 'plv-ticks');
      ref.aneis = [S('circle', { r: r1(r * 0.76) }, cg, 'plv-onda')];
      classe(li, 'plv-ponta plv-ponta--nucleo');
      chamada(li, n, ref.mov, r);
      H('span', 'plv-verbo', 'Zero', li); H('span', 'plv-tit', 'lê o seu caso', li);
    }
    function led(gg, n, li, ref) {
      var r = n.w / 2, cg = S('g', { transform: 'translate(' + r1(r) + ' ' + r1(r) + ')' }, ref.mov), d = '';
      classe(gg, 'plv-led');
      ref.aneis = [S('circle', { r: r1(r * 0.63) }, cg, 'plv-onda'), S('circle', { r: r1(r * 0.63) }, cg, 'plv-onda')];
      S('circle', { r: r1(r * 0.63) }, cg, 'plv-aro');
      S('circle', { r: r1(r * 0.3) }, cg, 'plv-disco');
      [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function (v) { d += 'M' + r1(v[0] * r * 0.78) + ' ' + r1(v[1] * r * 0.78) + 'L' + r1(v[0] * r) + ' ' + r1(v[1] * r); });
      S('path', { d: d }, cg, 'plv-ticks');
      classe(li, 'plv-ponta plv-ponta--led');
      chamada(li, n, ref.mov, r);
      H('span', 'plv-verbo', 'Objetivo', li); H('span', 'plv-tit', n.est.titulo, li); H('span', 'plv-sr', n.est.frase, li);
    }

    function construirQuadro(quadro, g, plano, opc) {
      opc = opc || {};
      limparFilhos(quadro);
      var ajust = opc.ajustados || criarMapa();
      var svg = S('svg', { viewBox: '0 0 ' + g.W + ' ' + g.H, width: g.W, height: g.H, 'aria-hidden': 'true', focusable: 'false' }, quadro, 'plv-svg');
      var lista = H('ol', 'plv-lista', null, quadro); lista.setAttribute('aria-label', 'Etapas da planta');
      var rotsEl = H('div', 'plv-rots', null, quadro); rotsEl.setAttribute('aria-hidden', 'true');
      classe(quadro, g.paisagem ? 'is-paisagem' : 'is-retrato');
      quadro.classList.remove(g.paisagem ? 'is-retrato' : 'is-paisagem');
      S('path', { d: gradeD(g.W, g.H) }, svg, 'plv-grade');
      var gFan = S('g', {}, svg), gLim = S('g', {}, svg), gCab = S('g', {}, svg), gNos = S('g', {}, svg);
      var R = { nos: criarMapa(), rotas: [], tang: null, lista: lista, svg: svg, gCab: gCab, g: g, tempo: opc.pre };

      g.rotas.forEach(function (r) {
        var d = rotaD(r.pts, 9), cls = r.tipo === 'retorno' ? ' plv-limpa--ret' : r.tipo === 'sat' ? ' plv-limpa--sat' : '';
        var Lp = comprimento(r.pts), f = r1(Math.min(0.5, 16 / Math.max(Lp, 1)) * 1000) / 1000;
        var x = { r: r, Lp: Lp, f: f, fan: S('path', { d: d }, gFan, 'plv-fantasma'), limpa: S('path', { d: d, pathLength: 1 }, gLim, 'plv-limpa' + cls), seta: S('path', { d: setaD(r.pts) }, gLim, 'plv-seta' + cls) };
        x.cab = S('path', { d: d, pathLength: 1, 'stroke-dasharray': f + ' 2', 'stroke-dashoffset': f }, gCab, 'plv-cab');
        R.rotas.push(x);
      });
      if (opc.pre) R.tang = S('path', { d: emaranhado(g, hashDeIds(g)), pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, gFan, 'plv-tang');

      g.nos.forEach(function (n) {
        var gg = S('g', { transform: 'translate(' + r1(n.x) + ' ' + r1(n.y) + ')', 'data-id': n.id }, gNos, 'plv-no' + (n.decisao ? ' plv-no--dec' : ''));
        var mov = S('g', {}, gg, 'plv-mov');
        var li = H('li', '', null);
        li.dataset.id = n.id; li.dataset.ord = String(n.ord);
        li.style.left = px(n.x); li.style.top = px(n.y); li.style.width = px(n.w); li.style.height = px(n.h);
        var ref = { g: gg, mov: mov, li: li, n: n, aneis: [], ajustado: !!ajust[n.id] };
        if (ref.ajustado) { classe(gg, 'is-ajustado'); classe(li, 'is-ajustado'); }
        if (n.ponta === 'nucleo') nucleo(gg, n, li, ref);
        else if (n.ponta === 'led') led(gg, n, li, ref);
        else estacao(gg, n, li, ref);
        R.nos[n.id] = ref;
      });
      var porOrd = g.nos.slice().sort(function (a, b) { return a.ord - b.ord; });
      porOrd.forEach(function (n) { lista.appendChild(R.nos[n.id].li); });
      g.rots.forEach(function (t) {
        var s = H('span', 'plv-rot' + (t.ramo ? ' plv-rot--ramo' : ''), t.txt, rotsEl);
        s.style.left = px(t.x); s.style.top = px(t.y); s.style.width = px(t.w); s.style.textAlign = t.al === 'r' ? 'right' : 'left';
      });
      if (!opc.pre) {
        g.nos.forEach(function (n) { acender(R.nos[n.id]); });
        R.rotas.forEach(function (x) { classe(x.seta, 'is-ligada'); });
      }
      return R;
    }

    function acender(x) {
      classe(x.g, 'is-aceso'); classe(x.li, 'is-aceso');
      if (x.n.ponta === 'led') { classe(x.g, 'is-ouro'); classe(x.li, 'is-ouro'); }
    }

    var anim = function (el, kf, op) {
      if (!el || typeof el.animate !== 'function') return null;
      try {
        var a = el.animate(kf, op);
        inst.anims.push(a);
        return a;
      } catch (e) { aviso(e); return null; }
    };
    function cancelarMovimento() {
      if (!inst) return;
      inst.relogio.encerrar();
      inst.anims.forEach(function (a) { try { a.cancel(); } catch (e) { aviso(e); } });
      inst.anims = []; inst.pausadas = []; inst.vida = []; inst.iniciada = false; inst.adiado = false;
      if (inst.R && inst.R.tang && inst.R.tang.remove) inst.R.tang.remove();
    }
    function pausarTudo() {
      if (!inst) return;
      inst.quadro.classList.add('plv--fora');   /* o CSS pausa o giro do núcleo e o pulso do LED */
      inst.relogio.pausar();
      inst.anims.forEach(function (a) { if (a.playState === 'running') { try { a.pause(); inst.pausadas.push(a); } catch (e) { aviso(e); } } });
    }
    function retomarTudo() {
      if (!inst || !inst.iniciada) return;
      inst.quadro.classList.remove('plv--fora');
      var lista = inst.pausadas; inst.pausadas = [];
      lista.forEach(function (a) { try { a.play(); } catch (e) { aviso(e); } });
      inst.relogio.retomar();
    }
    function iniciar() {
      if (!inst || inst.iniciada) return;
      if (inst.adiado) {   /* o programa da entrada (~45 animações) só nasce agora, quando vai rodar: com a faixa fora da tela ele não custa nada na tarefa que monta o quadro */
        inst.adiado = false;
        programaEntrada();
        inst.anims.forEach(function (a) { try { a.pause(); } catch (e) { aviso(e); } });
      }
      inst.iniciada = true; inst.aguardando = false;
      inst.anims.forEach(function (a) { try { a.play(); } catch (e) { aviso(e); } });
      inst.relogio.iniciar();
    }

    function leitura(tag, txt) { inst.leTag.textContent = tag; inst.leTxt.textContent = txt; }
    function leituraDe(id) {
      var n = inst.R.nos[id].n, plano = inst.plano;
      if (n.ponta === 'led') return leitura('Objetivo', plano.fim.frase);
      if (n.ponta === 'nucleo') return leitura('Zero', 'A energia volta ao núcleo: o sistema segue de pé depois da venda.');
      leitura(dois(n.num) + ' · ' + n.est.verbo, n.est.frase);
    }
    function ondas(lista, atraso) {
      lista.forEach(function (o, i) { anim(o, [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.5)', opacity: 0 }], { duration: 1000, delay: atraso + i * 280, easing: 'ease-out', fill: 'none' }); });
    }
    function ligar(id) {
      var x = inst.R.nos[id];
      if (!x || x.lit) return;
      x.lit = true; acender(x);
      if (x.n.ponta === 'led') ondas(x.aneis, 0);
      if (x.n.ponta === 'nucleo' && inst.R.volta) ondas(x.aneis, 0);
    }

    function etapasDe(g) { return g.nos.filter(function (n) { return !n.ponta; }).length; }
    function fixarStatus(txt) { inst.status.textContent = txt; }
    /* o sucesso do "Está certo" não é anunciado (o "Analisando…" do chat cobre); só a falha e o duplicado, no status da faixa: limpa antes e escreve no tique seguinte, para a mesma frase ser lida de novo */
    var FALHA_ENVIO = 'Não consegui enviar agora. Tente de novo.';
    function avisar(txt) { var i = inst; if (!i) return; i.status.textContent = ''; win.setTimeout(function () { if (inst === i) i.status.textContent = txt; }, 60); }

    function aplicarFinal() {
      var R = inst.R;
      inst.quadro.classList.remove('plv--pre'); inst.quadro.classList.remove('plv--aj');
      Object.keys(R.nos).forEach(function (id) { var x = R.nos[id]; x.lit = true; acender(x); x.li.classList.remove('is-novo'); x.g.classList.remove('is-novo'); });
      R.rotas.forEach(function (x) { classe(x.seta, 'is-ligada'); });
      if (R.tang) { R.tang.remove(); R.tang = null; }
    }
    function finalizar(ajuste) {
      cancelarMovimento();
      inst.iniciada = true;
      aplicarFinal();
      fixarStatus((ajuste ? 'Planta ajustada, com ' : 'Planta pronta, com ') + etapasDe(inst.R.g) + ' etapas. ' + inst.plano.fecho);
      if (!ajuste) leitura('Planta pronta', inst.plano.fecho);
      pulsoDeRepouso();
    }

    function pulsoDeRepouso() {
      if (!inst || !inst.animada) return;
      var R = inst.R, grupos = agrupar(R), t = 0, total = 0;
      var plano = [];
      grupos.forEach(function (gr) {
        var dmax = 0;
        gr.forEach(function (x) { var d = x.Lp > 420 ? 0.8 : 0.4; plano.push({ x: x, t0: t + x.r.atraso, d: d }); dmax = Math.max(dmax, x.r.atraso + d); });
        t += dmax;
      });
      total = t;
      var P = Math.max(VIDA_PERIODO_MIN, Math.round(total * 1000 + 2200)), iter = Math.max(2, Math.ceil(VIDA_MAXIMO / P)), eps = 0.002;
      plano.forEach(function (p) {
        var pts = p.x.r.pts, el = S('circle', { r: 2.6 }, R.gCab, 'plv-pulso'), L = comprimento(pts), s = (p.t0 * 1000) / P, e = Math.min(0.99, ((p.t0 + p.d) * 1000) / P);
        var tr = function (q) { return 'translate(' + r1(q[0]) + 'px,' + r1(q[1]) + 'px)'; };
        var kf = [{ offset: 0, opacity: 0, transform: tr(pts[0]), easing: 'linear' }];
        if (s > 0) kf.push({ offset: s, opacity: 0, transform: tr(pts[0]), easing: 'linear' });
        kf.push({ offset: Math.min(s + eps, e), opacity: 1, transform: tr(pts[0]), easing: 'linear' });
        var acum = 0, i;
        for (i = 1; i < pts.length; i++) { acum += dist(pts[i - 1], pts[i]); kf.push({ offset: Math.min(1, s + (e - s) * (acum / L)), opacity: 1, transform: tr(pts[i]), easing: 'linear' }); }
        kf.push({ offset: Math.min(1, e + eps), opacity: 0, transform: tr(pts[pts.length - 1]), easing: 'linear' });
        kf.push({ offset: 1, opacity: 0, transform: tr(pts[pts.length - 1]), easing: 'linear' });
        for (i = 1; i < kf.length; i++) if (kf[i].offset < kf[i - 1].offset) kf[i].offset = kf[i - 1].offset;   /* a API recusa offset decrescente: rota longa e curta no tempo gerava o 2º ponto antes do 1º */
        var a = anim(el, kf, { duration: P, iterations: iter, easing: 'linear' });
        if (a) { inst.vida.push(a); if (!inst.visivel && inst.io) { try { a.pause(); } catch (x) { aviso(x); } } }
      });
    }
    function reativarVida() {
      if (!inst || !inst.visivel && inst.io) return;
      inst.vida.forEach(function (a) { try { a.play(); } catch (e) { aviso(e); } });
    }

    function agrupar(R) {
      var por = criarMapa();
      R.rotas.forEach(function (x) { (por[x.r.passo] = por[x.r.passo] || []).push(x); });
      return Object.keys(por).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return por[k]; });
    }
    var duracaoBase = function (x) { return x.Lp > 420 ? 0.85 : 0.5; };

    function programaEntrada() {
      var R = inst.R, rel = inst.relogio, g = R.g, ord = g.nos.slice().sort(function (a, b) { return a.ord - b.ord; });
      var grupos = agrupar(R), total1 = 0, i;
      leitura('Zero', 'Lendo o caso. Sem estrutura, o caminho de quem chega é um emaranhado.');
      grupos.forEach(function (gr) {
        var dg = 0, am = 0; gr.forEach(function (x) { dg = Math.max(dg, duracaoBase(x)); am = Math.max(am, x.r.atraso); });
        total1 += am + dg + 0.12;
      });
      var k = Math.min(1.3, Math.max(0.7, (T_ALVO - T_INTRO) / total1));
      rel.em(0, function () { classe(R.nos.nucleo.g, 'is-esboco'); classe(R.nos.nucleo.li, 'is-esboco'); });
      rel.em(0.05, function () { ligar('nucleo'); });
      ord.forEach(function (n, q) {
        if (n.ponta === 'nucleo') return;
        rel.em(0.35 + (q - 1) * 0.07, function () { classe(R.nos[n.id].g, 'is-esboco'); classe(R.nos[n.id].li, 'is-esboco'); });
      });
      R.rotas.forEach(function (x, q) { anim(x.fan, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 600 + q * 40, fill: 'both' }); });
      var t = T_INTRO;
      grupos.forEach(function (gr) {
        var dg = 0, am = 0, i2;
        for (i2 = 0; i2 < gr.length; i2++) dg = Math.max(dg, duracaoBase(gr[i2]) * k);
        gr.forEach(function (x) {
          var t0 = t + x.r.atraso, tf = t0 + dg, f = x.f;
          anim(x.limpa, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: dg * 1000, delay: t0 * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          anim(x.cab, [{ strokeDashoffset: f, opacity: 0, offset: 0 }, { strokeDashoffset: f, opacity: 1, offset: 0.01 }, { strokeDashoffset: f - 1, opacity: 1, offset: 0.99 }, { strokeDashoffset: f - 1, opacity: 0, offset: 1 }],
            { duration: dg * 1000, delay: t0 * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          rel.em(tf, function () {
            classe(x.seta, 'is-ligada');
            if (x.r.alvo) {
              if (x.r.alvo === 'nucleo') R.volta = true;
              ligar(x.r.alvo); leituraDe(x.r.alvo);
            }
          });
          am = Math.max(am, x.r.atraso);
        });
        t += am + dg + 0.12 * k;
      });
      anim(R.tang, [{ strokeDashoffset: 1, opacity: 0.85 }, { strokeDashoffset: 0, opacity: 0.85 }], { duration: 1500, delay: 150, easing: 'ease-in-out', fill: 'both' });
      anim(R.tang, [{ opacity: 0.85 }, { opacity: 0 }], { duration: Math.max(1, (t - T_INTRO) * 1000), delay: T_INTRO * 1000, easing: 'linear', fill: 'both' });
      rel.em(t + 0.7, function () { finalizar(false); });
      void i;
    }

    function programaAjuste(antigos, novos, fala) {
      var R = inst.R, rel = inst.relogio, plano = inst.plano, i;
      inst.quadro.classList.add('plv--aj');
      novos.forEach(function (id) { var x = R.nos[id]; x.lit = false; x.g.classList.remove('is-aceso'); x.li.classList.remove('is-aceso'); classe(x.g, 'is-novo'); classe(x.li, 'is-novo'); });
      var eNovo = criarMapa(); novos.forEach(function (id) { eNovo[id] = true; });
      var tocam = R.rotas.filter(function (x) { return eNovo[x.r.a] || eNovo[x.r.de]; }).sort(function (a, b) { return (eNovo[a.r.a] ? 0 : 1) - (eNovo[b.r.a] ? 0 : 1); });
      var outras = R.rotas.filter(function (x) { return tocam.indexOf(x) < 0; });
      tocam.forEach(function (x) { x.seta.classList.remove('is-ligada'); });
      outras.forEach(function (x) { [x.limpa, x.seta].forEach(function (el) { anim(el, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.6875 }, { opacity: 1, offset: 1 }], { duration: 1600, fill: 'both' }); }); });
      Object.keys(R.nos).forEach(function (id) {
        var x = R.nos[id], o = antigos[id];
        if (!o || eNovo[id]) return;
        var dx = o.x - x.n.x, dy = o.y - x.n.y;
        if (!dx && !dy) return;
        var kf = [{ transform: 'translate(' + r1(dx) + 'px,' + r1(dy) + 'px)' }, { transform: 'translate(0px,0px)' }], op = { duration: 800, delay: 500, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' };
        anim(x.mov, kf, op); anim(x.li, kf, op);
      });
      var t = 1.6, d = 0.55;
      tocam.forEach(function (x) {
        var f = x.f;
        anim(x.limpa, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: d * 1000, delay: t * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
        anim(x.cab, [{ strokeDashoffset: f, opacity: 0, offset: 0 }, { strokeDashoffset: f, opacity: 1, offset: 0.01 }, { strokeDashoffset: f - 1, opacity: 1, offset: 0.99 }, { strokeDashoffset: f - 1, opacity: 0, offset: 1 }],
          { duration: d * 1000, delay: t * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
        (function (xx, tf) {
          rel.em(tf, function () {
            classe(xx.seta, 'is-ligada');
            if (eNovo[xx.r.a]) { ligar(xx.r.a); leituraDe(xx.r.a); }
          });
        })(x, t + d);
        t += d + 0.1;
      });
      var primeiro = novos[0];
      rel.em(t + 0.8, function () {
        finalizar(true);
        if (primeiro && R.nos[primeiro]) leitura('Ajustado', R.nos[primeiro].n.est.frase);
      });
      leitura('Você pediu', fala ? '“' + fala + '”' : 'Um ajuste na planta.');
      void i; void plano;
    }

    function ligarOuvintes(animavel) {
      inst.aoResize = function () {
        if (inst.timerResize) win.clearTimeout(inst.timerResize);
        inst.timerResize = win.setTimeout(function () {
          inst.timerResize = 0;
          var larg = medirLargura();
          if (Math.abs(larg - inst.larg) > TOLERANCIA_LARGURA && larg > 0) refazer('final', null, null, '');
        }, ESPERA_RESIZE);
      };
      win.addEventListener('resize', inst.aoResize);
      inst.aoVisibilidade = function () {
        if (doc.hidden) pausarTudo(); else if (inst.visivel || !inst.io) retomarTudo();
      };
      doc.addEventListener('visibilitychange', inst.aoVisibilidade);
      inst.aoReduzir = function (sim) { if (sim && inst && inst.animada) { inst.opcoes.animar = false; inst.animada = false; finalizar(false); } };
      if (win.BEYON && typeof win.BEYON.on === 'function') win.BEYON.on('reduzir', inst.aoReduzir);
      inst.aoToque = function () { reativarVida(); };
      inst.quadro.addEventListener('pointerdown', inst.aoToque);
      inst.quadro.addEventListener('focusin', inst.aoToque);
      if (animavel && typeof win.IntersectionObserver === 'function') {
        inst.io = new win.IntersectionObserver(function (entradas) {
          if (!inst || !entradas || !entradas.length) return;
          var e = entradas[entradas.length - 1], vis = !!e.isIntersecting && e.intersectionRatio > 0;
          inst.visivel = vis;
          var enche = e.intersectionRect && win.innerHeight && e.intersectionRect.height >= win.innerHeight * 0.4;
          if (!inst.iniciada) { if (vis && (e.intersectionRatio >= FRACAO_VISIVEL || enche) && inst.aguardando) iniciar(); return; }
          if (vis && !doc.hidden) retomarTudo(); else pausarTudo();
        }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, FRACAO_VISIVEL, 0.4, 0.45, 0.5, 0.75, 1] });
        inst.io.observe(inst.quadro);
      }
    }
    function medirLargura() { return inst.opcoes.largura || inst.quadro.clientWidth || inst.raiz.clientWidth || 0; }

    function aplicarOpcoes() {
      var op = inst.opcoes, editavel = op.editavel !== false;
      inst.nota.textContent = op.origem === 'padrao' ? NOTA_PADRAO : NOTA_MODELO;
      inst.cotaNome.textContent = op.nome ? String(op.nome) : 'do seu site';
      [inst.btnCerto, inst.btnAjuste].forEach(function (b) { if (editavel) b.removeAttribute('disabled'); else b.setAttribute('disabled', ''); });
    }

    function refazer(modo, antigos, novos, fala) {
      cancelarMovimento();
      var larg = medirLargura();
      var g = Layout.montarGeometria(inst.plano, larg);
      if (!g) return false;
      var ajust = criarMapa(); (novos || []).forEach(function (id) { ajust[id] = true; });
      var animavel = !reduzido() && typeof inst.quadro.animate === 'function' && inst.opcoes.animar !== false;
      inst.larg = larg; inst.g = g;
      inst.quadro.style.height = px(g.H);
      var pre = modo === 'entrada' && animavel;
      inst.R = construirQuadro(inst.quadro, g, inst.plano, { pre: pre, ajustados: ajust });
      if (pre) inst.quadro.classList.add('plv--pre'); else inst.quadro.classList.remove('plv--pre');
      inst.animada = animavel;
      inst.aguardando = false;
      if (pre) {
        inst.aguardando = true; inst.adiado = true;
        if (!inst.io || inst.visivel) iniciar();
      } else if (modo === 'ajuste' && animavel && (!inst.io || inst.visivel)) {
        programaAjuste(antigos, novos, fala);
        inst.iniciada = true; inst.relogio.iniciar();
      } else {
        finalizar(modo === 'ajuste');
        if (modo === 'ajuste' && novos && novos.length && inst.R.nos[novos[0]]) leitura('Ajustado', inst.R.nos[novos[0]].n.est.frase);
      }
      return true;
    }

    function validar(plano) {
      if (!Forma || !Layout || !Pecas) return { ok: false, motivos: ['modulos'] };
      var v = Forma.validarFormaPlano(plano);
      return v.ok ? { ok: true, plano: v.plano } : { ok: false, motivos: v.motivos };
    }

    function montar(raizEl, plano, opcoes) {
      var v = validar(plano);
      if (!v.ok) return { ok: false, motivos: v.motivos };
      if (!raizEl) return { ok: false, motivos: ['sem_raiz'] };
      parar();
      var wrap = H('div', 'plv'), op = mesclar({}, opcoes || {});
      limparFilhos(raizEl);
      H('h2', 'plv-titulo', 'A planta do seu site', wrap);
      var nota = H('p', 'plv-nota', '', wrap);
      var quadro = H('div', 'plv-quadro', null, wrap);
      var cota = H('p', 'plv-cota', null, wrap); cota.setAttribute('aria-hidden', 'true');
      H('i', '', null, cota); var cs = H('span', '', 'Planta · ', cota), cotaNome = H('b', '', '', cs); H('i', '', null, cota);
      var le = H('p', 'plv-leitura', null, wrap); le.setAttribute('aria-hidden', 'true');
      var leTag = H('b', 'plv-leitura__tag', 'Zero', le), leTxt = H('span', 'plv-leitura__txt', 'Lendo o caso.', le);
      var status = H('p', 'plv-status', '', wrap); status.setAttribute('role', 'status');
      var acoes = H('div', 'plv-acoes', null, wrap);
      var btnCerto = H('button', 'plv-btn plv-btn--primario', 'Está certo', acoes), btnAjuste = H('button', 'plv-btn', 'Quero ajustar algo', acoes), btnRever = H('button', 'plv-btn plv-btn--txt', 'Rever a montagem', acoes);
      [btnCerto, btnAjuste, btnRever].forEach(function (b) { b.setAttribute('type', 'button'); });
      raizEl.appendChild(wrap);
      inst = {
        raiz: raizEl, wrap: wrap, quadro: quadro, nota: nota, cotaNome: cotaNome, leTag: leTag, leTxt: leTxt, status: status, btnCerto: btnCerto, btnAjuste: btnAjuste, btnRever: btnRever,
        plano: v.plano, json: JSON.stringify(v.plano), opcoes: op, anims: [], pausadas: [], vida: [], R: null, g: null, larg: 0, visivel: false, iniciada: false, aguardando: false, animada: false,
        io: null, relogio: criarRelogio(win, aviso), timerResize: 0
      };
      if (medirLargura() <= 0) { var vazio = inst; inst = null; limparFilhos(vazio.raiz); return { ok: false, motivos: ['sem_largura'] }; }
      aplicarOpcoes();
      ligarOuvintes(!reduzido() && typeof quadro.animate === 'function' && op.animar !== false);
      btnCerto.addEventListener('click', function () {
        if (!inst || btnCerto.hasAttribute('disabled')) return;
        /* "Combinado" só fica se o envio entrou: aoCerto devolve false (não vai), uma promessa do que o envio decidiu, ou outra coisa (vai). Com a promessa o texto aparece na hora (a
           resposta do Zero leva segundos) e volta ao de antes se ela disser que não entrou, a menos que a luz já tenha passado para outra caixa */
        var antesTag = inst.leTag.textContent, antesTxt = inst.leTxt.textContent, r;
        try { r = typeof inst.opcoes.aoCerto === 'function' ? inst.opcoes.aoCerto() : undefined; } catch (e) { aviso(e); r = false; }
        if (r === 'duplicada') return avisar('Já enviei esta planta.');
        if (r === false) return avisar(FALHA_ENVIO);
        leitura('Combinado', 'É esta a planta que o site vai seguir. Se mudar algo, a planta se refaz.');
        if (inst.animada && inst.R.nos.led) ondas(inst.R.nos.led.aneis, 0);
        function desfazer() { if (!inst) return; if (inst.leTag.textContent === 'Combinado') leitura(antesTag, antesTxt); avisar(FALHA_ENVIO); }
        if (r && typeof r.then === 'function') r.then(function (entrou) { if (entrou === false) desfazer(); }, desfazer);
      });
      btnAjuste.addEventListener('click', function () {
        if (!inst || btnAjuste.hasAttribute('disabled')) return;
        if (typeof inst.opcoes.aoAjustar === 'function') inst.opcoes.aoAjustar();
      });
      btnRever.addEventListener('click', function () { if (inst) { inst.visivel = inst.visivel || !inst.io; refazer('entrada', null, null, ''); } });
      if (!refazer('entrada', null, null, '')) { parar(); return { ok: false, motivos: ['geometria'] }; }
      return { ok: true, largura: inst.larg, altura: inst.g.H, animada: inst.animada, etapas: etapasDe(inst.g) };
    }

    function atualizar(plano, opcoes) {
      if (!inst) return { ok: false, motivos: ['sem_faixa'] };
      var v = validar(plano);
      if (!v.ok) return { ok: false, motivos: v.motivos };
      if (opcoes) inst.opcoes = mesclar(inst.opcoes, opcoes);
      aplicarOpcoes();
      var json = JSON.stringify(v.plano);
      if (json === inst.json) return { ok: true, refeita: false, novos: [] };
      var antigos = criarMapa(), antigosNos = criarMapa(), idsAntigos = criarMapa(), novos = [], comuns = 0;
      inst.g.nos.forEach(function (n) { antigos[n.id] = { x: n.x, y: n.y }; });
      inst.plano.etapas.forEach(function (e) { idsAntigos[e.id] = true; });
      void antigosNos;
      v.plano.etapas.forEach(function (e) { if (idsAntigos[e.id]) comuns++; else novos.push(e.id); });
      inst.plano = v.plano; inst.json = json;
      var refeita = comuns === 0;
      if (!refazer(refeita ? 'entrada' : 'ajuste', antigos, refeita ? [] : novos, (opcoes && opcoes.fala) || '')) return { ok: false, motivos: ['geometria'] };
      return { ok: true, refeita: refeita, novos: refeita ? [] : novos };
    }

    function parar() {
      if (!inst) return;
      var i = inst;
      cancelarMovimento();
      win.removeEventListener('resize', i.aoResize);
      doc.removeEventListener('visibilitychange', i.aoVisibilidade);
      if (win.BEYON && typeof win.BEYON.off === 'function') win.BEYON.off('reduzir', i.aoReduzir);
      if (i.timerResize) win.clearTimeout(i.timerResize);
      if (i.io) i.io.disconnect();
      limparFilhos(i.raiz);
      inst = null;
    }

    return { montar: montar, atualizar: atualizar, parar: parar, interno: { construirQuadro: function (quadro, g, plano, opc) { return construirQuadro(quadro, g, plano, opc || {}); } } };
  }

  return { criar: criar };
});
