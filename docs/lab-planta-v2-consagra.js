/* PLANTA VIVA v2 (LABORATÓRIO, fora do deploy; a de produção é a entrada de js/planta-desenho.js): a CONSAGRAÇÃO. window.BZPlantaConsagra.consagrar(esboco, plano, opcoes). Quando o preço sai, o Zero chama
   desenhar_planta (já existe) e o esboço vira o desenho final DO MÓDULO REAL: o quadro é montado por BZPlanta.interno.construirQuadro com a
   geometria de BZPlantaLayout (retrato no celular, faixa larga no computador), e as classes e o CSS são os de css/orcamento-planta.css. O que
   muda é só o PROGRAMA da entrada (no lugar do emaranhado do 05/11, o esboço que a conversa construiu):
     1. reorganiza (0 a 1 s): cada estação que o esboço já tinha voa do chip para o lugar definitivo (transform: translate e scale), as que o
        Zero acrescentou surgem como esboço (34%), as rotas fantasma e a grade aparecem;
     2. a luz percorre o caminho inteiro (1 a 3,3 s): o mesmo traço de 2 px do módulo real, rota a rota na ordem do desenho, acendendo cada
        estação quando chega, com um tique de vidro por estação;
     3. o LED do objetivo vira OURO com as duas ondas (aprovado em 05/11), com o acorde dourado; depois o repouso, um pulso a cada 6 s.
   Como o módulo real: só começa com o quadro à vista (35% dele ou 40% da tela) e pausa tudo (timers e traços) fora da vista e com a aba
   escondida (js/planta-relogio.js). Movimento reduzido: o quadro final, aceso e dourado, parado.
   opcoes: som(nome), nome (o do negócio, na cota), preparar() (o computador abre a faixa larga ANTES da medida), margemBaixo() (a barra presa
   embaixo), aoAcender(caixaNaTela) (o laboratório usa para fazer o papel do dedo da pessoa no vídeo), aoFim(). ES5. */
(function () {
  'use strict';
  var Planta = window.BZPlanta, Layout = window.BZPlantaLayout, Forma = window.BZPlantaForma, Cresce = window.BZPlantaCresce, Relogio = window.BZPlantaRelogio;
  var NOTA = 'É o desenho do que o seu site pode fazer, a partir do que você contou. O que entra de fato é combinado no orçamento.';
  var T_REORG = 950, T_LUZ = 2300, FRACAO_VISIVEL = 0.35;

  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var semViuva = function (t) { return window.BZPlantaEsboco ? window.BZPlantaEsboco.semViuva(t) : t; };
  /* marcas de desempenho (Performance API): cada etapa da montagem vira uma medida 'planta:...' no perfil do DevTools e no medidor do laboratório */
  var marcar = function (nome, desde) { try { window.performance.measure('planta:' + nome, desde); } catch (e) { /* sem a API */ } return 'planta:' + nome + ':fim'; };
  var agoraMarca = function (nome) { try { window.performance.mark(nome); } catch (e) { /* sem a API */ } return nome; };
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
    /* o quadro final é montado ANTES da consagração e FORA da tarefa dela (no celular, medido com CPU 4x: geometria ~7 ms, ~200 nós de SVG ~15 ms,
       estilo e layout desses nós ~30 ms; tudo junto passava de 50 ms). Em três passos, cada um no seu quadro de tela: (1) a geometria, aqui, com a
       largura do esboço (o quadro final ocupa exatamente o lugar dele); (2) os nós, fora da página; (3) a entrada na página ESCONDIDO (absoluto, sem
       ocupar lugar, visibility hidden), logo depois do esboço, onde o navegador calcula estilo e layout. A tarefa da consagração só tira o esboço,
       mostra o quadro e anima. No computador a faixa larga muda o layout antes (preparar): a largura só se sabe lá e tudo é montado nela (1x de CPU) */
    function construir(W, gPronta) {
      var q = H('div', 'plv-quadro lv-final' + (animar ? ' plv--pre is-voo' : '')), g = gPronta || Layout.montarGeometria(plano, W);
      if (!g) return null;
      q.style.height = g.H + 'px';
      var R = Planta.interno.construirQuadro(q, g, plano, { pre: animar });
      if (R.tang && R.tang.parentNode) R.tang.parentNode.removeChild(R.tang);
      return { q: q, g: g, R: R };
    }
    var pronto = null, escondido = false;
    if (!animar) { montar(); return { ok: true, animada: false, controle: controle }; }
    if (op.preparar) { quandoVisivel(I.quadro, margem, montar); return { ok: true, animada: true, controle: controle }; }
    var Wp = I.quadro.clientWidth, m00 = agoraMarca('planta:pre:inicio'), gp = Layout.montarGeometria(plano, Wp);
    marcar('pre-geometria', m00);
    window.setTimeout(function () {
      var m01 = agoraMarca('planta:pre:nos');
      pronto = gp ? construir(Wp, gp) : null;
      marcar('pre-nos', m01);
      window.setTimeout(function () {
        if (pronto && I.quadro.parentNode && !pronto.q.parentNode) {
          pronto.q.classList.add('lv-escondido');
          I.quadro.parentNode.insertBefore(pronto.q, I.quadro.nextSibling);
          escondido = true;
        }
        /* a espera da vista só começa depois que o navegador pintou com o quadro escondido (o estilo e o layout dele ficam nessa pintura) */
        window.setTimeout(function () { quandoVisivel(I.quadro, margem, montar); }, 120);
      }, 60);
    }, 60);
    return { ok: true, animada: true, controle: controle };

    function montar() {
      var m0 = agoraMarca('planta:montar:inicio');
      /* 1. onde cada peça do esboço está NA TELA, antes de qualquer mudança de layout */
      /* em coordenadas da PÁGINA (com a rolagem de agora): trocar o esboço pelo quadro final muda a altura do cartão, e uma rolagem que o navegador
         ajuste no meio (âncora de rolagem) não pode deslocar o ponto de partida do voo */
      var qr = I.quadro.getBoundingClientRect(), qa = { left: qr.left + window.scrollX, top: qr.top + window.scrollY }, antes = Object.create(null), mapa = casar(I.esboco, plano);
      var ponto = function (cx, cy, s, li) { return { x: qa.left + cx, y: qa.top + cy, s: s, tx: qa.left + li.offsetLeft, ty: qa.top + li.offsetTop }; };
      antes.nucleo = ponto(I.nucleo.cx, I.nucleo.cy, 20, I.nucleo.li);
      I.est.forEach(function (x, k) { var id = mapa[Cresce.LUGARES[k]]; if (id && x.est) antes[id] = ponto(x.cx, x.cy, 24, x.li); });
      if (I.led.conhecido) antes.led = ponto(I.nucleo.cx, I.led.cy, 20, I.led.li);
      I.parar();
      /* sem preparar (celular), o quadro final ocupa EXATAMENTE o lugar e a largura do esboço: nada precisa ser medido de novo (cada medida depois
         de trocar o quadro forçava o layout da página inteira dentro da tarefa: medido 38 ms no celular com CPU 4x) */
      var mesmoLugar = !op.preparar;
      if (op.preparar) op.preparar();
      marcar('medir', m0); var m1 = agoraMarca('planta:m1');

      /* 2. o quadro final (montado antes, no celular) entra no lugar do esboço. Ele nasce já com a altura final, maior que a do esboço: a página só
         cresce e o navegador não puxa a rolagem (com altura 0 por um instante ela puxava: medido no vídeo de 12/11) */
      var card = I.card, P = pronto || construir(card.clientWidth - 2);
      if (!P) { if (window.console) window.console.warn('[planta-v2] sem geometria'); return; }
      var q = P.q, g = P.g, R = P.R;
      card.classList.add('is-consagrada');
      if (escondido && q.parentNode === card) { card.removeChild(I.quadro); q.classList.remove('lv-escondido'); } else card.replaceChild(q, I.quadro);
      marcar('trocar', m1); var m3 = agoraMarca('planta:m3');
      var cota = H('p', 'plv-cota', null); cota.setAttribute('aria-hidden', 'true');
      H('i', '', null, cota); var cs = H('span', '', 'Planta · ', cota); H('b', '', op.nome || 'do seu site', cs); H('i', '', null, cota);
      card.insertBefore(cota, I.leitura);
      /* a nota fica embaixo, junto dos botões (no 05/11 ela vinha antes do quadro): assim o quadro final nasce EXATAMENTE onde o esboço estava e o voo não passa por cima de texto */
      H('p', 'plv-nota lv-nota', semViuva(NOTA), card);
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
        if (animar) Planta.interno.repouso(R, anim);   /* o repouso do módulo real: o mesmo pulso da faixa aprovada */
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
      var qdr = mesmoLugar ? null : q.getBoundingClientRect(), qd = mesmoLugar ? qa : { left: qdr.left + window.scrollX, top: qdr.top + window.scrollY }, voaram = Object.create(null);
      /* a origem do scale é o canto da caixa do grupo (fill-box): (0, 0) para as estações; nas pontas com rótulo no topo (faixa larga) a guia sobe até
         -guia. Calculado pela geometria, sem getBBox (que forçaria o layout) */
      var origem = function (n) { return [0, n.ponta && n.rot && n.rot.topo ? Math.min(0, -(n.guia || 0)) : 0]; };
      g.nos.forEach(function (n) {
        var x = R.nos[n.id], a = antes[n.id];
        if (!a) return;
        voaram[n.id] = true;
        var ic = n.ponta ? null : (n.ic || [11, 34, 1]);
        var lc = ic ? [ic[0] + 20 * ic[2], ic[1] + 20 * ic[2]] : [n.w / 2, n.h / 2];
        var s = ic ? (a.s / (40 * ic[2])) : (a.s / (n.w / 2)), f = [a.x - qd.left - n.x, a.y - qd.top - n.y];
        var o = origem(n);
        var tx = f[0] - o[0] - s * (lc[0] - o[0]), ty = f[1] - o[1] - s * (lc[1] - o[1]);
        x.mov.style.transformBox = 'fill-box'; x.mov.style.transformOrigin = '0 0';
        if (n.ponta === 'led') { x.g.classList.add('lv-voa'); x.li.classList.add('lv-voa'); } else acender(x);
        anim(x.mov, [{ transform: 'translate(' + r1(tx) + 'px,' + r1(ty) + 'px) scale(' + r1(s * 100) / 100 + ')' }, { transform: 'translate(0px,0px) scale(1)' }], { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
        var caixa = x.mov.querySelector('.plv-caixa');
        if (caixa) anim(caixa, [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 900, fill: 'backwards' });
        /* o texto das estações voa junto; o das pontas (núcleo e objetivo) é uma chamada alinhada de outro jeito no desenho final, e voando ela
           saía da tela no celular: fica no lugar final (o do objetivo já à vista, o do núcleo aparece) */
        if (n.ponta === 'led') return;
        if (n.ponta) { anim(x.li, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: 900, fill: 'backwards' }); return; }
        var dx = a.tx - qd.left - n.x, dy = a.ty - qd.top - n.y;
        anim(x.li, [{ transform: 'translate(' + r1(dx) + 'px,' + r1(dy) + 'px)', opacity: 0 }, { opacity: 0, offset: 0.35 }, { transform: 'translate(0px,0px)', opacity: 1 }], { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
      });
      marcar('voo', m3); var m4 = agoraMarca('planta:m4');
      var ord = g.nos.slice().sort(function (a, b) { return a.ord - b.ord; }), q0 = 0;
      ord.forEach(function (n) {
        if (voaram[n.id]) return;
        var x = R.nos[n.id], k = q0++;
        depois(380 + k * 70, function () { x.g.classList.add('is-esboco'); x.li.classList.add('is-esboco'); });
      });
      anim(q.querySelector('.plv-grade'), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'backwards' });
      R.rotas.forEach(function (x, k) { anim(x.fan, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300 + k * 30, fill: 'backwards' }); });
      ler('Zero', 'Juntando o que você contou no desenho do seu site.');

      /* 4. a luz percorre o caminho inteiro, na ordem do desenho (a legenda não troca a cada estação: com uma a cada ~250 ms ela piscaria).
         As ~50 animações da luz são criadas numa tarefa à parte, ADIA ms depois (a luz só começa em T_REORG): na tarefa da troca elas somavam ~10 ms
         a um quadro que já tem o desenho do quadro novo (medido no celular com CPU 4x). Até lá o CSS do laboratório deixa as rotas apagadas */
      var ADIA = 300;
      depois(ADIA, function () {
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
          anim(x.limpa, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: dg * 1000, delay: t0 * 1000 - ADIA, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          anim(x.cab, [{ strokeDashoffset: fr, opacity: 0, offset: 0 }, { strokeDashoffset: fr, opacity: 1, offset: 0.01 }, { strokeDashoffset: fr - 1, opacity: 1, offset: 0.99 }, { strokeDashoffset: fr - 1, opacity: 0, offset: 1 }],
            { duration: dg * 1000, delay: t0 * 1000 - ADIA, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
          depois((t0 + dg) * 1000 - ADIA, function () {
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
      depois((t + 1.2) * 1000 - ADIA, fim);
      });
      marcar('luz', m4);
    }
  }

  /* a altura reservada do retrato (BZPlantaLayout.alturaReservada) é calculada uma vez por largura, comparando todas as formas possíveis: ~19 ms no
     celular com CPU 4x. aquecer(largura) faz essa conta num momento ocioso da conversa, para ela não cair na tarefa da consagração */
  function aquecer(largura) {
    var fazer = function () { try { Layout.alturaReservada(largura); } catch (e) { if (window.console) window.console.warn('[planta-v2] ' + e.message); } };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fazer, { timeout: 4000 }); else window.setTimeout(fazer, 600);
  }

  window.BZPlantaConsagra = { consagrar: consagrar, casar: casar, aquecer: aquecer };
})();
