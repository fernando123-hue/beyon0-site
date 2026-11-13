/* PLANTA VIVA: o DESENHO e a ENTRADA. window.BZPlanta = { montar(raiz, plano, opcoes), atualizar(plano, opcoes), parar() }.
   montar valida a forma (BZPlantaForma), mede a largura, grava a altura reservada e constrói tudo NA MESMA CHAMADA (nada nasce com altura 0
   nem espera fonte ou observador); { ok:false, motivos } se o plano for inválido ou a faixa estiver sem largura. atualizar compara por id: só o
   id novo ganha "Ajustado" e as caixas deslizam; sem id em comum, refaz tudo. opcoes: origem ('modelo'|'padrao'), editavel, nome, aoCerto,
   aoAjustar, animar, largura, fala, e da planta viva v2: esboco() (os pontos do esboço na tela para o voo, lidos uma vez quando a entrada
   começa), som(nome) ("passa" e "ouro") e notaEmbaixo (a nota junto dos botões, decisão de 12/11).
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
  var CHAMFRO = 7, VIDA_PERIODO_MIN = 6000, VIDA_MAXIMO = 60000, FRACAO_VISIVEL = 0.35, ESPERA_RESIZE = 160, TOLERANCIA_LARGURA = 6;
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
      var R = { nos: criarMapa(), rotas: [], lista: lista, svg: svg, gCab: gCab, g: g, tempo: opc.pre };

      g.rotas.forEach(function (r) {
        var d = rotaD(r.pts, 9), cls = r.tipo === 'retorno' ? ' plv-limpa--ret' : r.tipo === 'sat' ? ' plv-limpa--sat' : '';
        var Lp = comprimento(r.pts), f = r1(Math.min(0.5, 16 / Math.max(Lp, 1)) * 1000) / 1000;
        var x = { r: r, Lp: Lp, f: f, fan: S('path', { d: d }, gFan, 'plv-fantasma'), limpa: S('path', { d: d, pathLength: 1 }, gLim, 'plv-limpa' + cls), seta: S('path', { d: setaD(r.pts) }, gLim, 'plv-seta' + cls) };
        x.cab = S('path', { d: d, pathLength: 1, 'stroke-dasharray': f + ' 2', 'stroke-dashoffset': f }, gCab, 'plv-cab');
        R.rotas.push(x);
      });

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
      inst.quadro.classList.remove('is-voo');   /* a entrada cancelada no meio do voo (ajuste, movimento reduzido, "Rever") não deixa o quadro sem recorte */
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
        programaEsboco();
        inst.anims.forEach(function (a) { try { a.pause(); } catch (e) { aviso(e); } });
      }
      inst.iniciada = true; inst.aguardando = false;
      inst.quadro.classList.remove('plv--espera');
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
      inst.quadro.classList.remove('plv--pre'); inst.quadro.classList.remove('plv--espera'); inst.quadro.classList.remove('plv--aj');
      Object.keys(R.nos).forEach(function (id) { var x = R.nos[id]; x.lit = true; acender(x); x.li.classList.remove('is-novo'); x.g.classList.remove('is-novo'); });
      R.rotas.forEach(function (x) { classe(x.seta, 'is-ligada'); });
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
      pulsosDeRepouso(inst.R, anim).forEach(function (a) { inst.vida.push(a); if (!inst.visivel && inst.io) { try { a.pause(); } catch (x) { aviso(x); } } });
    }
    /* o pulso de repouso de um quadro já construído: um ponto por rota, na ordem da luz, período de 6 s no mínimo, por até 60 s. animar(el, kf, op)
       cria a animação (a da faixa guarda em inst.anims; a planta v2 passa o relógio dela). Devolve as animações criadas */
    function pulsosDeRepouso(R, animar) {
      var grupos = agrupar(R), t = 0, total = 0, criadas = [];
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
        var a = animar(el, kf, { duration: P, iterations: iter, easing: 'linear' });
        if (a) criadas.push(a);
      });
      return criadas;
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

    /* A ENTRADA (planta viva v2; decisão do dono de 12/11: o esboço que a conversa construiu SUBSTITUI o emaranhado do 05/11, que saiu daqui; a luz
       que percorre tudo e o ouro no fim continuam iguais):
       1. reorganiza (0 a ~1 s): cada estação que o esboço tinha voa do lugar dela na TELA até o lugar final (opcoes.esboco(), lido UMA vez, aqui,
          quando a entrada começa: { id: { x, y (o centro do chip), s (a metade dele), tx, ty (o canto do texto) } }, ou null com o esboço fora da
          tela); as outras surgem como esboço, e as rotas fantasma aparecem;
       2. a luz percorre o caminho inteiro, rota a rota na ordem do desenho, acendendo cada estação com um tique (opcoes.som('passa'));
       3. o objetivo vira ouro com as duas ondas (ligar) e o acorde (opcoes.som('ouro')); o fim é o de sempre (finalizar: "Planta pronta" + o fecho). */
    var T_REORG = 0.95, T_LUZ = 2.3;
    function programaEsboco() {
      var R = inst.R, rel = inst.relogio, g = R.g, op = inst.opcoes, voaram = criarMapa(), pontos = null, q0 = 0;
      var som = function (nome) { if (typeof op.som === 'function') { try { op.som(nome); } catch (e) { aviso(e); } } };
      try { pontos = typeof op.esboco === 'function' ? op.esboco() : null; } catch (e) { aviso(e); }
      leitura('Zero', 'Juntando o que você contou no desenho do seu site.');
      rel.em(0.05, function () { ligar('nucleo'); });   /* o núcleo é a fonte da luz: acende logo (como na entrada de 05/11) */
      if (pontos && typeof pontos === 'object') voar(R, g, pontos, voaram);
      g.nos.slice().sort(function (a, b) { return a.ord - b.ord; }).forEach(function (n) {
        if (voaram[n.id]) return;
        var x = R.nos[n.id], k = q0++;
        rel.em(0.38 + k * 0.07, function () { classe(x.g, 'is-esboco'); classe(x.li, 'is-esboco'); });
      });
      R.rotas.forEach(function (x, k) { anim(x.fan, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300 + k * 30, fill: 'both' }); });
      var grupos = agrupar(R), total = 0;
      grupos.forEach(function (gr) { var d = 0, am = 0; gr.forEach(function (x) { d = Math.max(d, duracaoBase(x)); am = Math.max(am, x.r.atraso); }); total += am + d + 0.06; });
      var k = Math.min(1, T_LUZ / Math.max(total, 0.01)), t = T_REORG;
      grupos.forEach(function (gr) {
        var dg = 0, am = 0;
        gr.forEach(function (x) { dg = Math.max(dg, duracaoBase(x) * k); });
        gr.forEach(function (x) {
          var t0 = t + x.r.atraso * k, f = x.f;
          anim(x.limpa, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: dg * 1000, delay: t0 * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          anim(x.cab, [{ strokeDashoffset: f, opacity: 0, offset: 0 }, { strokeDashoffset: f, opacity: 1, offset: 0.01 }, { strokeDashoffset: f - 1, opacity: 1, offset: 0.99 }, { strokeDashoffset: f - 1, opacity: 0, offset: 1 }],
            { duration: dg * 1000, delay: t0 * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          rel.em(t0 + dg, function () {
            classe(x.seta, 'is-ligada');
            var alvo = x.r.alvo ? R.nos[x.r.alvo] : null;
            if (!alvo || alvo.lit) return;
            ligar(x.r.alvo);
            if (alvo.n.ponta === 'led') { som('ouro'); leituraDe('led'); } else if (!alvo.n.ponta) som('passa');
          });
          am = Math.max(am, x.r.atraso * k);
        });
        t += am + dg + 0.06 * k;
      });
      rel.em(T_REORG, function () { inst.quadro.classList.remove('is-voo'); });
      rel.em(t + 1.2, function () { finalizar(false); });
    }
    /* o voo (fase 1): translate + scale com a origem no canto da caixa do grupo (fill-box), calculada pela geometria (sem getBBox, que forçaria o
       layout). O LED não acende no voo (o ouro é da luz): voa como esboço. O texto das estações voa junto; o das pontas fica no lugar final */
    function voar(R, g, pontos, voaram) {
      var q = inst.quadro.getBoundingClientRect(), ok = function (v) { return typeof v === 'number' && isFinite(v); };
      g.nos.forEach(function (n) {
        var a = tem(pontos, n.id) ? pontos[n.id] : null, x = R.nos[n.id];
        if (!a || !x || !ok(a.x) || !ok(a.y) || !ok(a.s) || a.s <= 0) return;
        voaram[n.id] = true;
        var ic = n.ponta ? null : (n.ic || [11, 34, 1]);
        var lc = ic ? [ic[0] + 20 * ic[2], ic[1] + 20 * ic[2]] : [n.w / 2, n.h / 2];
        var s = ic ? a.s / (40 * ic[2]) : a.s / (n.w / 2);
        var o = [0, n.ponta && n.rot && n.rot.topo ? Math.min(0, -(n.guia || 0)) : 0];
        var tx = a.x - q.left - n.x - o[0] - s * (lc[0] - o[0]), ty = a.y - q.top - n.y - o[1] - s * (lc[1] - o[1]);
        x.mov.style.transformBox = 'fill-box'; x.mov.style.transformOrigin = '0 0';
        if (n.ponta === 'led') { classe(x.g, 'is-esboco'); classe(x.li, 'is-esboco'); } else acender(x);
        anim(x.mov, [{ transform: 'translate(' + r1(tx) + 'px,' + r1(ty) + 'px) scale(' + r1(s * 100) / 100 + ')' }, { transform: 'translate(0px,0px) scale(1)' }], { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
        var caixa = x.mov.querySelector('.plv-caixa');
        if (caixa) anim(caixa, [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 900, fill: 'backwards' });
        if (n.ponta || !ok(a.tx) || !ok(a.ty)) return;
        anim(x.li, [{ transform: 'translate(' + r1(a.tx - q.left - n.x) + 'px,' + r1(a.ty - q.top - n.y) + 'px)', opacity: 0 }, { opacity: 0, offset: 0.35 }, { transform: 'translate(0px,0px)', opacity: 1 }], { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
      });
      inst.quadro.classList.add('is-voo');   /* o voo sai de fora do quadro: nada o corta enquanto dura (css/orcamento-planta.css) */
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
      inst.quadro.classList[pre ? 'add' : 'remove']('plv--espera');   /* até a entrada começar, nenhuma rota sem as estações */
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
      /* a nota: em cima do desenho (05/11) ou embaixo, junto dos botões (opcoes.notaEmbaixo; decisão do dono de 12/11, planta viva v2) */
      var nota = H('p', 'plv-nota', '', op.notaEmbaixo ? null : wrap);
      var quadro = H('div', 'plv-quadro', null, wrap);
      var cota = H('p', 'plv-cota', null, wrap); cota.setAttribute('aria-hidden', 'true');
      H('i', '', null, cota); var cs = H('span', '', 'Planta · ', cota), cotaNome = H('b', '', '', cs); H('i', '', null, cota);
      var le = H('p', 'plv-leitura', null, wrap); le.setAttribute('aria-hidden', 'true');
      var leTag = H('b', 'plv-leitura__tag', 'Zero', le), leTxt = H('span', 'plv-leitura__txt', 'Lendo o caso.', le);
      var status = H('p', 'plv-status', '', wrap); status.setAttribute('role', 'status');
      if (op.notaEmbaixo) wrap.appendChild(nota);
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

    return { montar: montar, atualizar: atualizar, parar: parar, interno: { construirQuadro: function (quadro, g, plano, opc) { return construirQuadro(quadro, g, plano, opc || {}); }, repouso: pulsosDeRepouso } };
  }

  return { criar: criar };
});
