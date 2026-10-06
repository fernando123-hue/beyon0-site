/* ==========================================================================
   AI CORE — o boot no site. Script clássico (o site não tem build): decide
   SE a esfera monta, carrega o three DEPOIS do LCP por import() dinâmico e
   dirige o estado da esfera pelo laço único do site (B.add).

   O que acontece em cada caso (o movimento é acréscimo, nunca substituição):
   - sem JS, sem WebGL, WebGL por CPU, economia de dados, pouca memória: fica
     o desenho estático em CSS (.nucleo__poster) no mesmo lugar e tamanho;
     nada no layout muda (sem CLS) e ninguém percebe falta;
   - movimento reduzido: a esfera monta e desenha UM quadro, parada, acesa;
   - o resto: nasce em pedaços, se monta, acende e respira sem parar; o
     núcleo olha para o cursor (o corpo não segue); o ponteiro ou o dedo vira
     um campo que afasta as lâminas, um toque solta uma onda, a rolagem empurra a roda
     (js/nucleo/gesto.js); e se abre quando sai pela borda de cima.

   Plano, medidas e orçamento: docs/restructure/PLANO-AI-CORE.md.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  var caixa = document.querySelector('[data-nucleo]');
  if (!B || !caixa) return;
  var canvas = caixa.querySelector('canvas');
  if (!canvas) return;
  var html = document.documentElement;

  /* ---------- o centro do reator na página (para a rede, B.nucleo) ----------
     Roda antes do porteiro. Mede por EVENTO (carga, mudança de tamanho do
     hero), nunca por quadro.
     Posição de LAYOUT (offset), não a da tela: a entrada do hero e o
     paralaxe da rolagem movem a arte por transform e não podem arrastar o
     centro; o translate fixo da caixa (desktop) entra à parte. */
  var centro = { x: 0, y: 0, w: 0 };   /* o centro do reator na página (medido por evento) */
  (function centrar() {
    var heroEl = caixa.closest('.hero');
    if (!heroEl) return;
    var pedido = 0;
    function medir() {
      pedido = 0;
      var x = caixa.offsetWidth / 2, y = caixa.offsetHeight / 2;
      if (!x) return;
      for (var el = caixa; el && el !== heroEl; el = el.offsetParent) { x += el.offsetLeft; y += el.offsetTop; }
      if (!el) return;                        /* o hero não é ancestral posicionado: sem centro (a rede usa a caixa) */
      var t = getComputedStyle(caixa).transform;
      if (t && t !== 'none' && window.DOMMatrixReadOnly) { var m = new DOMMatrixReadOnly(t); x += m.e; y += m.f; }
      var hx = 0, hy = 0;
      for (var h = heroEl; h; h = h.offsetParent) { hx += h.offsetLeft; hy += h.offsetTop; }
      centro.x = hx + x; centro.y = hy + y; centro.w = caixa.offsetWidth;
    }
    function pedir() { if (!pedido) pedido = requestAnimationFrame(medir); }
    if ('ResizeObserver' in window) new ResizeObserver(pedir).observe(heroEl);
    else window.addEventListener('resize', pedir, { passive: true });
    pedir();
  })();

  /* ---------- porteiro (o que dá para saber sem criar contexto) ----------
     `?3d=forcar` aceita WebGL desenhado pela CPU (o verificador roda em
     SwiftShader) e não degrada por fps; `?3d=nao` desliga a esfera para
     medir A/B. */
  var busca = location.search;
  var forcar = /[?&]3d=forcar\b/.test(busca);
  if (/[?&]3d=nao\b/.test(busca)) return;
  var conexao = navigator.connection;
  if (conexao && conexao.saveData) return;
  if ((navigator.deviceMemory || 8) < 4) return;
  /* daqui em diante o reator vai TENTAR montar: o mini espera por ele para
     nascer de dentro dele ('sem' se desistir) */
  B.nucleoEstado = 'esperando';

  var celular = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  var ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* os MESMOS atributos de ATRIBUTOS em cena.js: o contexto testado aqui é
     o que o renderer usa (um contexto só). Repetidos porque este teste roda
     antes de baixar o módulo — é ele que poupa os bytes de quem não tem GPU. */
  var ATRIBUTOS = { alpha: true, antialias: true, stencil: false, powerPreference: 'default', failIfMajorPerformanceCaveat: !forcar };

  /* ---------- tempos da coreografia (s) ----------
     Crítica de design, rodada 1: com 1,8 s de montagem e o acendimento
     depois de a gaiola travar, ficava um tempo morto (gaiola montada e
     apagada) que parecia carga falhando. Agora acende ANTES de travar. */
  var MONTA = 1.3;         /* os pedaços convergem, de fora para dentro */
  var ACENDE_EM = 0.85;    /* o núcleo acende enquanto a gaiola trava */
  var ACENDE_DUR = 0.35;
  var CLARAO = 0.08;       /* o pico passa 8% do repouso (o clarão de 12% passava do ponto) */
  var ASSENTA = 0.9;       /* ...e assenta neste tempo */
  var JANELA = 90;         /* quadros por medição de fps */

  var cena = null, gesto = null;
  var estado = { t: 0, montagem: 0, abertura: 0, ignicao: 0, desdeIgnicao: -1, atento: 0 };
  var opcaoSob = false, entregaCampo = 0;
  B.on('opcao', function (d) { opcaoSob = !!(d && d.entrou); });
  /* pacotes do campo chegando ao vão do reator (js/rede.js): os raios dele acendem um pouco */
  /* um inchaço só, que sobe com as chegadas e assenta em ~0,6 s (somar 0,35
     por pacote fazia o reator piscar inteiro 11 vezes, crítica rodada 2) */
  B.on('campo:chegou', function (n) { entregaCampo = Math.min(1, entregaCampo + 0.18 * (n || 1)); });
  var relogio = -1;        /* s desde que a esfera apareceu na tela; -1 = ainda não */
  var visivel = false, liberado = false, parado = false, sujo = true, remedir = true, aceso = false, registrado = false;
  var rolagem = window.scrollY, caixaTopo = 0, caixaAltura = 1;
  var hero = caixa.closest('.hero') || document.body;
  var desfazer = [];       /* tudo o que a desistência precisa desligar */

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function ouvir(alvoEv, ev, fn, op) {
    alvoEv.addEventListener(ev, fn, op);
    desfazer.push(function () { alvoEv.removeEventListener(ev, fn, op); });
  }

  /* ---------- montagem ---------- */
  function carregar() {
    /* WebGL de verdade (GPU)? Testado no próprio canvas ANTES de baixar o
       three: quem não tem não paga os bytes, e o three nunca tenta um
       contexto que o navegador recusaria (ele escreve erro no console). */
    var gl;
    try { gl = canvas.getContext('webgl2', ATRIBUTOS) || canvas.getContext('webgl', ATRIBUTOS); } catch (e) { gl = null; }
    if (!gl) { B.nucleoEstado = 'sem'; return; }   /* fica o desenho em CSS */
    Promise.all([import('/js/nucleo/cena.js'), import('/js/nucleo/gesto.js')]).then(function (mods) {
      cena = mods[0].criarCena(canvas, gl, { celular: celular });
      if (!cena) { B.nucleoEstado = 'sem'; return; }
      B.nucleoEstado = 'pronto';
      gesto = mods[1].criarGesto(cena, canvas, hero, { fino: ponteiroFino, ouvir: ouvir });
      /* o primeiro quadro desenha ANTES de o desenho em CSS sair: se algo
         falhar aqui, o CSS continua lá */
      if (B.reduced) pararMontado(); else cena.desenhar(estado);
      html.classList.add('tem-nucleo');
      esperarArte();
      medirCaixa();
      observar();
      ligarEventos();
      B.add('nucleo', quadro);
      B.iniciar();
    }).catch(function () { desistir(); });
  }

  /* no desktop a arte do hero nasce invisível e o boot (js/anima.js) a
     imprime quando a luz passa por ela: a montagem espera esse instante,
     senão aconteceria sem ninguém ver. O evento não tem histórico: se a
     arte já está visível, segue; se o anima não vier, a rede solta em 3 s. */
  function esperarArte() {
    var arte = caixa.closest('.hero__arte');
    liberado = !arte || getComputedStyle(arte).opacity !== '0';
    if (liberado) return;
    var soltar = function () { liberado = true; };
    B.on('arte-impressa', soltar);
    var rede = setTimeout(soltar, 3000);
    desfazer.push(function () { B.off('arte-impressa', soltar); clearTimeout(rede); });
  }

  /* a esfera inteira, acesa e parada (movimento reduzido). O desenho em si
     acontece no laço, uma vez (`sujo`), e de novo só se algo pedir. */
  function pararMontado() {
    parado = true;
    if (tinta && cena && cena.tingir) { tinta = 0; cena.tingir(0, 0); }   /* (menos movimento no meio do ouro: parado em ciano, não em dourado) */
    estado.montagem = 1; estado.ignicao = 1; estado.abertura = 0;
    estado.desdeIgnicao = 99; estado.t = 12;
    /* sem campo, onda nem olhar: o gesto para de rodar com a esfera fora da
       tela e o quadro parado congelaria lâminas acesas, uma onda pela metade
       ou o núcleo fora do centro */
    estado.campo = null; estado.toque = null; estado.olhar = null;
    relogio = MONTA + ASSENTA + 1;
    acender();
    if (cena) { cena.medir(); cena.desenhar(estado); }
    sujo = false;
  }

  /* `is-aceso` é o sinal que o verificador lê (docs/verificar.mjs) */
  function acender() {
    if (aceso) return;
    aceso = true;
    caixa.classList.add('is-aceso');
  }

  /* o console de boot ganha a linha do núcleo, com o instante REAL em que ele
     acendeu. Só depois que as linhas de cima foram carimbadas (pagina.js
     carimba em ordem; a rede de 3 s pode vir depois daqui) e nunca com hora
     menor que a da linha de cima: a coluna de horas não volta no tempo. */
  function tentarRegistrar() {
    var cx = document.querySelector('[data-console]');
    if (!cx) { registrado = true; return; }
    var ts = cx.querySelectorAll('.console__t'), ultimo = 0;
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].offsetParent === null) continue;              /* linha escondida (ex.: fps no modo reduzido) */
      var v = ts[i].textContent;
      if (v === '—') return;                                   /* ainda falta carimbar: tenta no próximo quadro */
      ultimo = Math.max(ultimo, parseFloat(v.replace(',', '.')) * 1000);
    }
    var s = B.num(Math.max(performance.now(), ultimo + 1) / 1000, 3);
    var linha = document.createElement('div');
    linha.className = 'console__linha console__linha--nucleo';
    var t = document.createElement('span');
    t.className = 'console__t';
    t.textContent = s.length < 6 ? '0' + s : s;
    var val = document.createElement('span');
    val.className = 'console__v';
    val.textContent = 'núcleo aceso';
    /* o peso do núcleo à parte (three + módulos, como chegaram pela rede):
       a linha "transferido" acima congelou no peso do site, e a Prova soma
       os dois */
    var kb = pesoDoNucleo();
    if (kb > 0) {
      var b = document.createElement('b');
      b.textContent = '+' + B.num(kb) + ' KB';
      val.appendChild(document.createTextNode(' · '));
      val.appendChild(b);
    }
    linha.appendChild(t);
    linha.appendChild(val);
    cx.appendChild(linha);
    desfazer.push(function () { linha.remove(); });   /* se a esfera sair, a linha não pode ficar mentindo */
    registrado = true;
  }

  function pesoDoNucleo() {
    if (!window.performance || !performance.getEntriesByType) return 0;
    var total = 0, rs = performance.getEntriesByType('resource');
    for (var i = 0; i < rs.length; i++) {
      if (/\/js\/nucleo\/|\/vendor\/three\//.test(rs[i].name)) total += rs[i].encodedBodySize || rs[i].transferSize || 0;
    }
    return Math.round(total / 1024);
  }

  /* ---------- por quadro (chamado pelo laço único do site) ---------- */
  var nQuadros = 0, somaDt = 0, degrau = 0, cadencia = 1000;
  function quadro(S) {
    if (!cena) return;
    if (aceso && !registrado) tentarRegistrar();
    if (remedir) {
      if (degrau === 0) cena.ajustarDpr();
      cena.medir();
      medirCaixa();
      gesto.medir();
      remedir = false;
      sujo = true;
    }
    if (parado) {
      if (sujo) { cena.desenhar(estado); sujo = false; }
      publicar();   /* a rede parada também prende a constelação ao portal */
      return;
    }
    if (!visivel || !liberado) {
      /* fora da tela: a rede e o mini precisam saber (sem isto a constelação
         ficava congelada no meio da página depois de um salto por âncora) */
      if (nucleo.visivel) nucleo.visivel = false;
      return;
    }
    var dt = S.dt / 1000;                     /* o core.js já limita a 50 ms */
    if (relogio < 0) relogio = 0;
    relogio += dt;
    /* o tempo do reator é o relógio da VISITA (core.js): ele, o mini AI Core
       e a rede respiram juntos, e o fôlego continua de uma página para outra */
    estado.t = B.relogio();

    /* puxados para dentro: rápido no começo, assentando no fim (com a
       curva em S o primeiro segundo parecia travado, visto quadro a quadro) */
    var x = limitar(relogio / MONTA);
    estado.montagem = 1 - (1 - x) * (1 - x) * (1 - x);
    var desde = relogio - ACENDE_EM;
    if (desde >= 0) {
      acender();
      estado.desdeIgnicao = desde;
      var sobe = limitar(desde / ACENDE_DUR);
      var desce = limitar((desde - ACENDE_DUR) / ASSENTA);
      estado.ignicao = sobe < 1 ? sobe * sobe * (1 + CLARAO) : 1 + CLARAO * (1 - desce * desce * (3 - 2 * desce));
    }

    /* a esfera se abre quando ELA sai pela borda de cima (não o hero): no
       celular o hero é longo, e abrir pelo hero fazia a esfera se desmontar
       justo quando estava no meio da tela, com os arcos sobre o texto */
    var alvoAbertura = limitar((rolagem - caixaTopo) / caixaAltura);
    estado.abertura += (alvoAbertura - estado.abertura) * Math.min(1, dt * 4);
    /* atento: o cursor está numa opção do site (js/rede.js avisa); o núcleo
       clareia de leve, sobe em ~0,25 s e solta em ~0,6 s */
    entregaCampo *= Math.exp(-dt / 0.6);
    estado.entrega = entregaCampo;
    estado.atento = (estado.atento || 0) + ((opcaoSob ? 1 : 0) - (estado.atento || 0)) * Math.min(1, dt * (opcaoSob ? 4 : 1.7));
    gesto.passo(dt, estado);
    /* O OURO (js/ouro.js): o reator tinge para o dourado, clareia e gira mais enquanto durar */
    var o = B.ouro || {}, k = o.k || 0, h = o.h || 0, ca = o.carga || 0;
    var chave = Math.round(k * 48) * 100 + Math.round(h * 48);
    if (chave !== tinta) { tinta = chave; if (cena.tingir) cena.tingir(k, h); }
    /* na carga o reator acelera e clareia; no ouro gira mais e fica aceso */
    if (k > 0 || ca > 0) { estado.atento = Math.max(estado.atento, k * 0.9, ca); estado.giroExtra = (estado.giroExtra || 0) + dt * (1.1 * k + 4 * ca * ca); }

    cena.desenhar(estado);
    publicar();
    if (!forcar) vigiar(S.dt);
  }

  /* o que a rede (js/rede.js) precisa saber do reator, em px da janela: o
     centro, o raio onde os raios começam (a entrada da energia), o giro da
     roda e o achatamento da inclinação. Sem leitura de layout: o centro foi
     medido por evento, a rolagem vem do evento de scroll */
  var nucleo = { cx: 0, cy: 0, r: 0, sx: 1, sy: 1, giro: 0, visivel: false }, tinta = 0;
  function publicar() {
    var p = cena.pose();
    var pxPorUnidade = (centro.w * 1.44) / p.altura;   /* o canvas tem 144% da caixa (css/componentes.css) */
    /* px/py: o centro na PÁGINA; a rede refaz cx/cy com a rolagem do quadro
       dela (o laço roda a rede antes do reator: com cy pronto ela andava um
       quadro atrás) */
    nucleo.px = centro.x; nucleo.py = centro.y;
    nucleo.cx = centro.x - B.S.sx;
    nucleo.cy = centro.y - rolagem;
    nucleo.r = p.entrada * pxPorUnidade;
    nucleo.sx = Math.cos(p.ry);
    nucleo.sy = Math.cos(p.rx);
    nucleo.giro = p.giro;
    nucleo.visivel = visivel && aceso && centro.w > 0;
    B.nucleo = nucleo;
  }

  /* degrada MEDINDO, depois de montada (a montagem é a parte mais cara;
     julgar por ela puniria quem só está carregando a página). A régua é a
     cadência do PRÓPRIO aparelho (o menor intervalo visto, teto de 60):
     celular em economia de bateria roda a 30 Hz limpos e não é lento. */
  function vigiar(dtMs) {
    cadencia = Math.min(cadencia, dtMs);
    if (relogio < MONTA + ASSENTA) return;
    nQuadros++; somaDt += dtMs;
    if (nQuadros < JANELA) return;
    var fps = 1000 / (somaDt / nQuadros);
    var teto = Math.min(60, 1000 / Math.max(1, cadencia));
    nQuadros = 0; somaDt = 0;
    if (degrau === 0 && fps < teto * 0.75) {
      degrau = 1;
      if (!cena.baixarResolucao()) desistir();   /* já era pixel ratio 1: não há degrau */
    } else if (degrau === 1 && fps < teto * 0.63) {
      desistir();
    }
  }

  /* a esfera sai e o desenho em CSS volta; nada fica ligado nem mentindo */
  function desistir() {
    B.remove('nucleo');
    B.nucleo = null;
    B.nucleoEstado = 'sem';
    for (var i = 0; i < desfazer.length; i++) desfazer[i]();
    desfazer = [];
    html.classList.remove('tem-nucleo');
    caixa.classList.remove('is-aceso');
    if (cena) cena.desmontar();
    cena = null;
    canvas.width = canvas.height = 1;         /* solta o buffer grande */
  }

  /* ---------- observadores ---------- */
  function medirCaixa() {
    var r = caixa.getBoundingClientRect();
    caixaTopo = r.top + window.scrollY;
    caixaAltura = Math.max(1, r.height);
  }

  function observar() {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { visivel = es[0].isIntersecting; }, { rootMargin: '80px' });
      io.observe(caixa);
      desfazer.push(function () { io.disconnect(); });
    } else {
      visivel = true;
    }
    /* fonte carregando, troca de layout sem evento de resize: o canvas muda
       de tamanho e o observador avisa. Só marca; quem mede é o quadro. */
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () { remedir = true; });
      ro.observe(canvas);
      desfazer.push(function () { ro.disconnect(); });
    }
  }

  function ligarEventos() {
    /* handlers só anotam; nenhuma leitura de layout fora do quadro */
    ouvir(window, 'resize', function () { remedir = true; }, { passive: true });
    ouvir(window, 'scroll', function () { rolagem = window.scrollY; }, { passive: true });
    /* o three reconstrói o contexto perdido (iPhone ao voltar de outro app);
       no modo parado ninguém redesenharia sem este aviso */
    ouvir(canvas, 'webglcontextrestored', function () { sujo = true; }, false);
    /* o interruptor de movimento do rodapé (ou o sistema) manda */
    var aoReduzir = function (sim) { if (sim) pararMontado(); else parado = false; };
    B.on('reduzir', aoReduzir);
    desfazer.push(function () { B.off('reduzir', aoReduzir); });
  }

  /* ---------- quando carregar ----------
     Depois do load (o LCP já passou) e só quando a esfera está perto da
     tela. No celular ela fica logo abaixo da primeira dobra, então carrega
     junto; o relógio da montagem só começa quando ela aparece de fato. */
  function quandoPerto(fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      fn();
    }, { rootMargin: '400px' });
    io.observe(caixa);
  }
  function depoisDoLoad(fn) {
    var ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 1); };
    var ir = function () { ocioso(fn, { timeout: 1200 }); };
    if (document.readyState === 'complete') ir();
    else window.addEventListener('load', ir, { once: true });
  }
  depoisDoLoad(function () { quandoPerto(carregar); });
})();
