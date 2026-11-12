/* PLANTA VIVA v2 (laboratório): a CONSAGRAÇÃO. window.BZPlantaConsagra.consagrar(esboco, plano, opcoes). Quando o preço sai, o Zero chama
   desenhar_planta (já existe) e o esboço vira o desenho final DO MÓDULO REAL: o quadro é montado por BZPlanta.interno.construirQuadro com a
   geometria de BZPlantaLayout (retrato no celular, faixa larga no computador), e as classes e o CSS são os de css/orcamento-planta.css. O que
   muda é só o PROGRAMA da entrada (no lugar do emaranhado do 05/11, o esboço que a conversa construiu):
     1. reorganiza (0 a 1 s): cada estação que o esboço já tinha voa do chip para o lugar definitivo (transform: translate e scale), as que o
        Zero acrescentou surgem como esboço (34%), as rotas fantasma e a grade aparecem;
     2. a luz percorre o caminho inteiro (1 a 3,3 s): o mesmo traço de 2 px do módulo real, rota a rota na ordem do desenho, acendendo cada
        estação quando chega, com um tique de vidro por estação;
     3. o LED do objetivo vira OURO com as duas ondas (aprovado em 05/11), com o acorde dourado; depois o repouso, um pulso a cada 6 s.
   Como o módulo real: só começa com o quadro à vista (35% dele ou 40% da tela) e pausa tudo (timers e traços) fora da vista e com a aba
   escondida (lab-planta-v2-relogio.js). Movimento reduzido: o quadro final, aceso e dourado, parado.
   opcoes: som(nome), nome (o do negócio, na cota), preparar() (o computador abre a faixa larga ANTES da medida), margemBaixo() (a barra presa
   embaixo), aoAcender(caixaNaTela) (o laboratório usa para fazer o papel do dedo da pessoa no vídeo), aoFim(). ES5. */
(function () {
  'use strict';
  var Planta = window.BZPlanta, Layout = window.BZPlantaLayout, Forma = window.BZPlantaForma, Cresce = window.BZPlantaCresce, Relogio = window.BZPlantaRelogio;
  var NOTA = 'É o desenho do que o seu site pode fazer, a partir do que você contou. O que entra de fato é combinado no orçamento.';
  var T_REORG = 950, T_LUZ = 2300, VIDA_MIN = 6000, VIDA_MAX = 60000, FRACAO_VISIVEL = 0.35;

  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var dist = function (a, b) { var x = b[0] - a[0], y = b[1] - a[1]; return Math.sqrt(x * x + y * y); };
  var comprimento = function (pts) { var s = 0, i; for (i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; };
  var semViuva = function (t) { return window.BZPlantaEsboco ? window.BZPlantaEsboco.semViuva(t) : t; };
  function H(tag, cls, txt, pai) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (pai) pai.appendChild(e); return e; }
  function reduzido() {
    var m = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    return !!((m && m.matches) || document.documentElement.classList.contains('menos-movimento'));
  }

  /* o lugar do esboço -> o id da etapa final: a chegada é a chegada; as outras, a 1ª etapa do mesmo tipo ainda livre; quem não achar par
     (o plano vem do modelo e pode não ter o mesmo tipo) voa para a 1ª etapa livre na ordem do desenho: nenhuma estação que a pessoa viu nascer some */
  function casar(esbocoDados, plano) {
    var usados = Object.create(null), mapa = Object.create(null), sobra = [];
    esbocoDados.estacoes.forEach(function (e) {
      if (!e.conhecido) return;
      if (e.lugar === 'chegada') { mapa.chegada = 'chegada'; return; }
      for (var i = 0; i < plano.etapas.length; i++) {
        var et = plano.etapas[i];
        if (et.tipo === e.tipo && !usados[et.id]) { usados[et.id] = true; mapa[e.lugar] = et.id; return; }
      }
      sobra.push(e.lugar);
    });
    sobra.forEach(function (lugar) {
      for (var i = 0; i < plano.etapas.length; i++) if (!usados[plano.etapas[i].id]) { usados[plano.etapas[i].id] = true; mapa[lugar] = plano.etapas[i].id; return; }
    });
    return mapa;
  }

  /* o plano com as duas últimas palavras de cada texto juntas (a forma já validou; isto só muda espaços) */
  function semViuvas(p) {
    var c = JSON.parse(JSON.stringify(p));
    c.chegada.titulo = semViuva(c.chegada.titulo); c.chegada.frase = semViuva(c.chegada.frase);
    c.etapas.forEach(function (e) { e.titulo = semViuva(e.titulo); e.frase = semViuva(e.frase); });
    c.fim.titulo = semViuva(c.fim.titulo); c.fim.frase = semViuva(c.fim.frase); c.fecho = semViuva(c.fecho);
    return c;
  }

  /* espera o elemento estar à vista como o módulo real (FRACAO_VISIVEL do quadro ou 40% da tela), descontada a barra presa embaixo */
  function quandoVisivel(el, margemBaixo, fn) {
    if (!window.IntersectionObserver) { fn(); return null; }
    var feito = false, io = new window.IntersectionObserver(function (ents) {
      var e = ents[ents.length - 1];
      if (feito || !e.isIntersecting) return;
      if (e.intersectionRatio >= FRACAO_VISIVEL || (e.intersectionRect && e.intersectionRect.height >= window.innerHeight * 0.4)) { feito = true; io.disconnect(); fn(); }
    }, { threshold: [0, 0.1, 0.2, 0.3, FRACAO_VISIVEL, 0.5, 0.75, 1], rootMargin: '0px 0px -' + Math.round(margemBaixo) + 'px 0px' });
    io.observe(el);
    return io;
  }

  function consagrar(esb, planoBruto, opcoes) {
    var op = opcoes || {}, I = esb.interno, som = op.som || function () {};
    var v = Forma.validarFormaPlano(planoBruto);
    if (!v.ok) return { ok: false, motivos: v.motivos };
    var plano = semViuvas(v.plano), animar = !reduzido() && typeof I.card.animate === 'function';
    var margem = typeof op.margemBaixo === 'function' ? op.margemBaixo() : 0, rel = Relogio.criar(), controle = { parar: function () { rel.parar(); } };
    if (!animar) { montar(); return { ok: true, animada: false, controle: controle }; }
    quandoVisivel(I.quadro, margem, montar);
    return { ok: true, animada: true, controle: controle };

    function montar() {
      /* 1. onde cada peça do esboço está NA TELA, antes de qualquer mudança de layout */
      var qa = I.quadro.getBoundingClientRect(), antes = Object.create(null), mapa = casar(I.esboco, plano);
      var ponto = function (cx, cy, s, li) { return { x: qa.left + cx, y: qa.top + cy, s: s, tx: qa.left + li.offsetLeft, ty: qa.top + li.offsetTop }; };
      antes.nucleo = ponto(I.nucleo.cx, I.nucleo.cy, 20, I.nucleo.li);
      I.est.forEach(function (x, k) { var id = mapa[Cresce.LUGARES[k]]; if (id && x.est) antes[id] = ponto(x.cx, x.cy, 24, x.li); });
      if (I.led.conhecido) antes.led = ponto(I.nucleo.cx, I.led.cy, 20, I.led.li);
      I.parar();
      if (op.preparar) op.preparar();

      /* 2. o quadro final, montado pelo módulo real no lugar do esboço */
      var card = I.card, q = H('div', 'plv-quadro lv-final' + (animar ? ' plv--pre is-voo' : ''));
      card.classList.add('is-consagrada');
      card.insertBefore(H('p', 'plv-nota lv-nota', semViuva(NOTA)), I.quadro);
      card.replaceChild(q, I.quadro);
      var W = q.clientWidth, g = Layout.montarGeometria(plano, W);
      if (!g) { if (window.console) window.console.warn('[planta-v2] sem geometria para ' + W + ' px'); return; }
      q.style.height = g.H + 'px';
      var R = Planta.interno.construirQuadro(q, g, plano, { pre: animar });
      if (R.tang && R.tang.parentNode) R.tang.parentNode.removeChild(R.tang);
      var cota = H('p', 'plv-cota', null); cota.setAttribute('aria-hidden', 'true');
      H('i', '', null, cota); var cs = H('span', '', 'Planta · ', cota); H('b', '', op.nome || 'do seu site', cs); H('i', '', null, cota);
      card.insertBefore(cota, I.leitura);
      var acoes = H('div', 'plv-acoes', null, card);
      [['Está certo', 'plv-btn plv-btn--primario'], ['Quero ajustar algo', 'plv-btn'], ['Rever a montagem', 'plv-btn plv-btn--txt']].forEach(function (b) { var e = H('button', b[1], b[0], acoes); e.type = 'button'; });
      I.estadoTopo.textContent = ' · do seu site';
      I.status.textContent = 'Planta pronta, com ' + g.nos.filter(function (n) { return !n.ponta; }).length + ' etapas. ' + plano.fecho;

      var depois = rel.depois, anim = rel.anim;
      var acender = function (x) {
        x.g.classList.add('is-aceso'); x.li.classList.add('is-aceso');
        if (x.n.ponta === 'led') { x.g.classList.add('is-ouro'); x.li.classList.add('is-ouro'); }
      };
      var ler = function (tag, txt) { I.leTag.textContent = tag; I.leTxt.textContent = semViuva(txt); };
      var fim = function () {
        q.classList.remove('plv--pre'); q.classList.remove('is-voo');
        Object.keys(R.nos).forEach(function (id) { acender(R.nos[id]); R.nos[id].g.classList.remove('lv-voa'); R.nos[id].li.classList.remove('lv-voa'); });
        R.rotas.forEach(function (x) { x.seta.classList.add('is-ligada'); });
        ler('Pronto', plano.fecho);
        if (animar) repouso(R, anim);
        if (op.aoFim) op.aoFim();
      };
      if (!animar) { fim(); return; }

      /* fora da vista ou com a aba escondida, pausa tudo (o giro do núcleo e o pulso do LED pelo .plv--fora do CSS real) */
      var ver = true, io = null;
      var aplicar = function () { var sim = ver && !document.hidden; q.classList.toggle('plv--fora', !sim); if (sim) rel.retomar(); else rel.pausar(); };
      if (window.IntersectionObserver) {
        io = new window.IntersectionObserver(function (ents) { var e = ents[ents.length - 1]; ver = !!e.isIntersecting; aplicar(); }, { threshold: [0, 0.01] });
        io.observe(q);
      }
      document.addEventListener('visibilitychange', aplicar);
      controle.parar = function () { rel.parar(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', aplicar); };

      /* 3. reorganiza: o que já existia voa do esboço; o resto surge como esboço */
      var qd = q.getBoundingClientRect(), voaram = Object.create(null);
      g.nos.forEach(function (n) {
        var x = R.nos[n.id], a = antes[n.id];
        if (!a) return;
        voaram[n.id] = true;
        var ic = n.ponta ? null : (n.ic || [11, 34, 1]);
        var lc = ic ? [ic[0] + 20 * ic[2], ic[1] + 20 * ic[2]] : [n.w / 2, n.h / 2];
        var s = ic ? (a.s / (40 * ic[2])) : (a.s / (n.w / 2)), f = [a.x - qd.left - n.x, a.y - qd.top - n.y];
        /* a origem do scale é o canto da caixa do grupo (fill-box); no layout em faixa a guia do rótulo sobe acima de y=0, então a origem vem do getBBox */
        var bb = x.mov.getBBox(), o = [bb.x, bb.y];
        var tx = f[0] - o[0] - s * (lc[0] - o[0]), ty = f[1] - o[1] - s * (lc[1] - o[1]);
        x.mov.style.transformBox = 'fill-box'; x.mov.style.transformOrigin = '0 0';
        if (n.ponta === 'led') { x.g.classList.add('lv-voa'); x.li.classList.add('lv-voa'); } else acender(x);
        anim(x.mov, [{ transform: 'translate(' + r1(tx) + 'px,' + r1(ty) + 'px) scale(' + r1(s * 100) / 100 + ')' }, { transform: 'translate(0px,0px) scale(1)' }], { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
        var caixa = x.mov.querySelector('.plv-caixa');
        if (caixa) anim(caixa, [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 900, fill: 'backwards' });
        var dx = a.tx - qd.left - n.x, dy = a.ty - qd.top - n.y;
        anim(x.li, [{ transform: 'translate(' + r1(dx) + 'px,' + r1(dy) + 'px)', opacity: n.ponta === 'led' ? 1 : 0 }, { opacity: n.ponta === 'led' ? 1 : 0, offset: 0.35 }, { transform: 'translate(0px,0px)', opacity: 1 }], { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
      });
      var ord = g.nos.slice().sort(function (a, b) { return a.ord - b.ord; }), q0 = 0;
      ord.forEach(function (n) {
        if (voaram[n.id]) return;
        var x = R.nos[n.id], k = q0++;
        depois(380 + k * 70, function () { x.g.classList.add('is-esboco'); x.li.classList.add('is-esboco'); });
      });
      anim(q.querySelector('.plv-grade'), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'backwards' });
      R.rotas.forEach(function (x, k) { anim(x.fan, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300 + k * 30, fill: 'backwards' }); });
      ler('Zero', 'Juntando o que você contou no desenho do seu site.');

      /* 4. a luz percorre o caminho inteiro, na ordem do desenho (a legenda não troca a cada estação: com uma a cada ~250 ms ela piscaria) */
      var por = Object.create(null);
      R.rotas.forEach(function (x) { (por[x.r.passo] = por[x.r.passo] || []).push(x); });
      var grupos = Object.keys(por).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return por[k]; });
      var base = function (x) { return x.Lp > 420 ? 0.85 : 0.5; }, total = 0;
      grupos.forEach(function (gr) { var d = 0, am = 0; gr.forEach(function (x) { d = Math.max(d, base(x)); am = Math.max(am, x.r.atraso); }); total += am + d + 0.06; });
      var k = Math.min(1, (T_LUZ / 1000) / total), t = T_REORG / 1000;
      grupos.forEach(function (gr) {
        var dg = 0, am = 0;
        gr.forEach(function (x) { dg = Math.max(dg, base(x) * k); });
        gr.forEach(function (x) {
          var t0 = t + x.r.atraso * k, fr = x.f;
          anim(x.limpa, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: dg * 1000, delay: t0 * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          anim(x.cab, [{ strokeDashoffset: fr, opacity: 0, offset: 0 }, { strokeDashoffset: fr, opacity: 1, offset: 0.01 }, { strokeDashoffset: fr - 1, opacity: 1, offset: 0.99 }, { strokeDashoffset: fr - 1, opacity: 0, offset: 1 }],
            { duration: dg * 1000, delay: t0 * 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          depois((t0 + dg) * 1000, function () {
            x.seta.classList.add('is-ligada');
            var alvo = x.r.alvo ? R.nos[x.r.alvo] : null;
            if (!alvo || alvo.lit) return;
            alvo.lit = true; acender(alvo);
            if (alvo.n.ponta === 'led') {
              alvo.g.classList.remove('lv-voa'); alvo.li.classList.remove('lv-voa');
              alvo.aneis.forEach(function (o, i) { anim(o, [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.5)', opacity: 0 }], { duration: 1000, delay: i * 280, easing: 'ease-out', fill: 'none' }); });
              som('ouro'); ler('Objetivo', plano.fim.frase);
            } else if (alvo.n.ponta === 'nucleo') {
              alvo.aneis.forEach(function (o) { anim(o, [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.5)', opacity: 0 }], { duration: 1000, easing: 'ease-out', fill: 'none' }); });
            } else som('passa');
            if (op.aoAcender) { var b = q.getBoundingClientRect(); op.aoAcender({ top: b.top + alvo.n.y, bottom: b.top + alvo.n.y + alvo.n.h }); }
          });
          am = Math.max(am, x.r.atraso * k);
        });
        t += am + dg + 0.06 * k;
      });
      depois((t + 1.2) * 1000, fim);
    }
  }

  /* o repouso do módulo real (pulsoDeRepouso, que mora fechado lá dentro): um pulso que percorre as rotas na ordem, a cada 6 s no mínimo, por até 60 s.
     Para o PR: expor o do módulo real (interno.repouso) em vez de manter esta cópia. */
  function repouso(R, anim) {
    var por = Object.create(null), t = 0, plano = [];
    R.rotas.forEach(function (x) { (por[x.r.passo] = por[x.r.passo] || []).push(x); });
    Object.keys(por).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var dmax = 0;
      por[k].forEach(function (x) { var d = x.Lp > 420 ? 0.8 : 0.4; plano.push({ x: x, t0: t + x.r.atraso, d: d }); dmax = Math.max(dmax, x.r.atraso + d); });
      t += dmax;
    });
    var P = Math.max(VIDA_MIN, Math.round(t * 1000 + 2200)), iter = Math.max(2, Math.ceil(VIDA_MAX / P)), eps = 0.002;
    plano.forEach(function (p) {
      var pts = p.x.r.pts, el = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), L = comprimento(pts), s = (p.t0 * 1000) / P, e = Math.min(0.99, ((p.t0 + p.d) * 1000) / P), acum = 0, i;
      el.setAttribute('r', '2.6'); el.setAttribute('class', 'plv-pulso'); R.gCab.appendChild(el);
      var tr = function (q) { return 'translate(' + r1(q[0]) + 'px,' + r1(q[1]) + 'px)'; };
      var kf = [{ offset: 0, opacity: 0, transform: tr(pts[0]) }];
      if (s > 0) kf.push({ offset: s, opacity: 0, transform: tr(pts[0]) });
      kf.push({ offset: Math.min(s + eps, e), opacity: 1, transform: tr(pts[0]) });
      for (i = 1; i < pts.length; i++) { acum += dist(pts[i - 1], pts[i]); kf.push({ offset: Math.min(1, s + (e - s) * (acum / L)), opacity: 1, transform: tr(pts[i]) }); }
      kf.push({ offset: Math.min(1, e + eps), opacity: 0, transform: tr(pts[pts.length - 1]) });
      kf.push({ offset: 1, opacity: 0, transform: tr(pts[pts.length - 1]) });
      for (i = 1; i < kf.length; i++) if (kf[i].offset < kf[i - 1].offset) kf[i].offset = kf[i - 1].offset;
      anim(el, kf, { duration: P, iterations: iter, easing: 'linear' });
    });
  }

  window.BZPlantaConsagra = { consagrar: consagrar, casar: casar };
})();
