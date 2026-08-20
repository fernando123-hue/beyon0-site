/* ==========================================================================
   CAMPO DE ENERGIA — o único canvas do site.

   Desenha, em ordem: campo de partículas, brumas, espetáculo do Singular
   (aurora, onda de choque), reator do hero, mini AI Core e barramento. Tudo que
   se move continuamente vive aqui, porque desenhar a cena inteira custa ~1ms
   enquanto fazer o mesmo com elementos DOM reagindo por frame custava 76ms de
   recálculo de estilo.

   NÃO há brilho atrás do texto nem dos cards: o dono removeu essas luzes
   redondas (liam como amador). O que dá vida ao texto é a borda de energia
   (CSS) e o Singular, não manchas de luz atrás das letras.

   Nada aqui lê o DOM por frame: os retângulos do reator, do barramento e dos
   cards de serviço são medidos em scroll/resize e ficam em cache.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B || B.reduced) return;

  var cv = document.getElementById('fx');
  if (!cv) return;
  var ctx = cv.getContext('2d', { alpha: true });
  if (!ctx) return;

  var TAU = Math.PI * 2;
  var CIANO = '0,245,255', ALTA = '159,248,255', NUCLEO = '242,254,255', OURO = '255,201,107';
  /* O CONTRAPONTO da rampa, em dois estados. O ciano é a âncora e não muda; o
     violeta é a segunda cor, e é ele que tira a cena do monocromático.

     Por que ele precisa de um alvo quente PRÓPRIO: se misturasse para OURO como
     todo o resto, em warmth=1 (o reinado do Singular) ele viraria exatamente
     255,201,107 — o MESMO ouro de todas as outras cores. O contraponto
     desapareceria justo no auge do evento, e o estado quente voltaria a ser
     mono-ouro, que é o problema que esta paleta existe para resolver. Com BRASA
     ele fecha em 255,107,44 e continua sendo uma segunda cor.
     (No meio da transição, w=.6, a diferença é de saturação: 203,157,166 malva
     empoeirado pelo caminho do ouro contra 203,101,128 coral pelo da brasa.)

     Estes valores NÃO existem como token de CSS — a cor do canvas nunca passa
     pela folha de estilo. Este é o único lugar onde eles vivem. */
  var VIOLETA = '124,92,255', BRASA = '255,107,44';

  /* geometria estática do reator, IZADA para fora do loop: recriar estes arrays
     a cada frame era lixo para o GC à toa. spMul multiplica `giro` no frame. */
  var GRADE = [.30, .50, .68];
  var ANEIS = [
    { rx: .82, ry: .30, incl:  .35, spMul:  1.0, nn: 12 },
    { rx: .70, ry: .52, incl: 1.15, spMul: -1.3, nn: 10 },
    { rx: .56, ry: .56, incl:  .00, spMul:  0.8, nn:  8 }
  ];

  /* mistura ciano→dourado→BRANCO conforme o Estado Singular. Uma função só, sem
     token de CSS envolvido: a cor do canvas nunca passa pela folha de estilo.
     Dois estágios, nesta ordem: primeiro o dourado toma o ciano (warmth),
     depois o branco incandescente toma o resultado (whiteHot). É o que dá a
     assinatura BRANCO+DOURADO: na ignição tudo satura ao branco, no reinado o
     dourado reina com núcleos brancos. */
  var BRANCO = '255,255,255';
  function mistura(base, alvo, w) {
    if (w < 0.01) return base;
    if (w > 0.99) return alvo;
    var a = base.split(','), b = alvo.split(',');
    return Math.round(+a[0] + (+b[0] - +a[0]) * w) + ',' +
           Math.round(+a[1] + (+b[1] - +a[1]) * w) + ',' +
           Math.round(+a[2] + (+b[2] - +a[2]) * w);
  }
  /* `alvo` é o destino QUENTE da mistura, e é opcional: sem ele cai em OURO,
     então todas as chamadas de três argumentos que já existiam seguem idênticas.
     Só o violeta passa um alvo próprio (BRASA) — ver §2/§3 do tick. */
  function cor(base, w, hot, alvo) {
    var c = mistura(base, alvo || OURO, w || 0);
    return hot ? mistura(c, BRANCO, hot) : c;
  }

  var W = 0, H = 0, dpr = 1;
  var ps = [], nAlvo = 0;
  var reator = null, barramento = null;
  var servNos = [], nucleo = null, nucAlpha = 0;
  var sujo = true;

  /* o DOM é estático: buscar os mesmos elementos a cada scroll é trabalho
     jogado fora. medir() só relê os retângulos. */
  var elReator = document.querySelector('.hero__reactor');
  var elBus = document.querySelector('.bus');
  var elServ = document.querySelectorAll('.card--service');  /* elos do mini AI Core */

  function dimensionar() {
    var S = B.S;
    dpr = S.dpr;
    W = S.w; H = S.h;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* densidade por área, com teto: num monitor grande a conta não explode */
    nAlvo = B.weak || B.saveData ? 34 : Math.min(110, Math.round(W * H / 19000));
    semear();
    sujo = true;
  }

  function semear() {
    ps.length = 0;
    for (var i = 0; i < nAlvo; i++) {
      ps.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22,
        r: .7 + Math.random() * 1.5,
        f: .3 + Math.random() * .7          /* fase própria: nada pisca junto */
      });
    }
  }

  /* medir DOM: só em scroll/resize. Nunca por frame. */
  function medir() {
    if (elReator) {
      var b = elReator.getBoundingClientRect();
      reator = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.min(b.width, b.height) / 2 };
    }
    /* barramento: a linha por onde a luz do Pulso viaja até os serviços */
    barramento = null;
    if (elBus) {
      var rb = elBus.getBoundingClientRect();
      if (rb.bottom > 0 && rb.top < H && rb.width) {
        barramento = { x: rb.left, y: rb.top + rb.height / 2, w: rb.width };
      }
    }

    /* BORDA DE BAIXO de cada card de serviço: é onde o elo se conecta. Ligar no
       CENTRO fazia o elo mergulhar por dentro do card (parecia bug); na borda,
       ele encaixa como um cabo. */
    servNos.length = 0;
    for (var sv = 0; sv < elServ.length; sv++) {
      var rv = elServ[sv].getBoundingClientRect();
      if (rv.bottom < -80 || rv.top > H + 80 || !rv.width) continue;
      servNos.push({ cx: rv.left + rv.width / 2, cy: rv.bottom });
    }

    /* o núcleo flutua na folga entre o grid e o rótulo (o .bus ganhou um
       margin-top grande no CSS pra isto). Fica logo acima do rótulo — bem
       ABAIXO da base dos cards, então não cola mais neles. */
    nucleo = barramento ? { x: barramento.x + barramento.w / 2, y: barramento.y - 24, r: 22 } : null;

    sujo = false;
  }
  window.addEventListener('scroll', function () { sujo = true; }, { passive: true });
  B.on('resize', function () { dimensionar(); });
  /* .reveal nasce com translateY(18px), e getBoundingClientRect devolve a caixa
     JÁ transformada — os retângulos medidos antes da revelação ficam fora do
     lugar. Ao fim da entrada, remede uma vez. */
  B.on('entrada-pronta', function () { sujo = true; });

  /* halo: um gradiente por chamada é barato (~1ms para 64 halos, medido) e é
     mais rápido que um sprite escalado — a tentativa com sprite foi 1,4x pior
     e está registrada na auditoria para não ser repetida. */
  /* alfa acima de 1 não é um exagero inofensivo: `rgba(...,3.38)` pode ser
     recusado inteiro pelo parser, e uma atribuição recusada em fillStyle é
     SILENCIOSA — o desenho sai com a cor anterior. Com o Singular somando
     luminância (lum chega a ~2,6), vários pontos passavam de 1. Trava aqui. */
  function a1(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function halo(x, y, r, rgb, a) {
    a = a1(a);
    if (a < .004 || r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  /* polígono regular fechado no ctx (sem alocar array por frame): serve o
     núcleo do reator, onde hexágonos e triângulos contra-rotativos dão a cara
     de mecanismo. Só monta o path; quem chama decide stroke/fill. */
  function poligono(cx, cy, rad, rot, lados) {
    ctx.beginPath();
    for (var i = 0; i <= lados; i++) {
      var a = rot + i / lados * TAU;
      var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  /* proximidade do cursor a um ponto: 1 encostado, 0 além do raio. Usada pelos
     elos do AI Core (o do card sob o cursor acende). Sem ponteiro, é sempre 0. */
  function prox(S, x, y, R) {
    if (!S.pointerOn) return 0;
    var dx = S.px - x, dy = S.py - y, d = Math.sqrt(dx * dx + dy * dy);
    return d >= R ? 0 : 1 - d / R;
  }

  function tick(S) {
    if (sujo) medir();

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    var w = S.warmth, hot = S.whiteHot || 0;
    /* o núcleo satura ao branco ANTES do resto (é a fonte da luz), então recebe
       um ganho de branco maior — é isso que faz a ignição parecer um estouro e
       não uma troca de paleta. */
    var cy = cor(CIANO, w, hot * .55), alta = cor(ALTA, w, hot * .8), nuc = cor(NUCLEO, w, hot);
    /* o contraponto, resolvido UMA vez por frame como os outros. Alvo quente
       próprio: no Singular ele vira brasa, não ouro. Ganho de branco igual ao
       do ciano (.55) — ele é uma cor de base, não a fonte de luz. */
    var vio = cor(VIOLETA, w, hot * .55, BRASA);
    var e = S.energy, pulso = S.pulse, orc = S.budget;
    var sing = S.singular;
    var lum = .55 + e * .45 + pulso * .5 + sing * .6 + hot * .5;

    /* ---- 1. campo de partículas ---- */
    var quantas = Math.round(ps.length * orc);
    var atrai = S.pointerOn ? 1 : 0;
    for (var i = 0; i < quantas; i++) {
      var p = ps[i];
      p.x += p.vx * (1 + pulso * 2); p.y += p.vy * (1 + pulso * 2);
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;

      /* o cursor atrai de leve — sem holofote, sem bola de luz */
      if (atrai) {
        var dx = S.px - p.x, dy = S.py - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 52900) { var k = .00018 * (1 - d2 / 52900); p.vx += dx * k; p.vy += dy * k; }
      }
      /* no Singular o campo inteiro é puxado para o reator: a poeira vira
         corrente, e dá para VER de onde a energia está vindo. */
      if (sing > .05 && reator) {
        var rx = reator.x - p.x, ry = reator.y - p.y;
        var kr = .00004 * sing;
        p.vx += rx * kr; p.vy += ry * kr;
      }
      p.vx *= .995; p.vy *= .995;

      var br = (.18 + p.f * .3) * lum;
      /* DUAS FAIXAS. `p.f` é a fase própria da partícula (.3 a 1.0) e já decide
         o brilho; agora decide também a cor. As fracas são violeta, as fortes
         ciano — então o campo tem profundidade cromática em vez de ser uma só
         cor em brilhos diferentes. O corte é o MESMO .55 que o núcleo branco do
         Singular já usava logo abaixo: nenhum dado novo por partícula. */
      ctx.fillStyle = 'rgba(' + (p.f > .55 ? cy : vio) + ',' + a1(br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + sing * .5), 0, TAU); ctx.fill();
      /* núcleo branco nas maiores durante o Singular: a poeira vira brasa */
      if (sing > .3 && p.f > .55) {
        ctx.fillStyle = 'rgba(' + nuc + ',' + (.5 * sing).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .45, 0, TAU); ctx.fill();
      }
    }

    /* ---- 2. brumas: só quando há folga de orçamento ---- */
    if (orc > .8) {
      var t = S.t * .001;
      /* a bruma é a camada mais profunda e difusa da cena — é o lugar natural do
         contraponto: tinge o fundo sem competir com nada que precise ser lido. */
      halo(W * .5 + Math.cos(t * .21) * W * .2, H * .38 + Math.sin(t * .17) * H * .15,
           Math.min(W, H) * .5, vio, .022 * lum);
    }

    /* ---- 2b. AURORA DO SINGULAR ----
       Duas cortinas de luz atravessando a tela inteira, uma de cada borda. Só
       existem durante o Singular: são o "não é mais o mesmo site" que faz quem
       assiste querer uma página assim. Dois gradientes lineares, custo fixo. */
    if (sing > .04 && orc > .7) {
      var au = sing * (.5 + Math.sin(S.t * .014) * .12);
      var ga = ctx.createLinearGradient(0, 0, 0, H * .55);
      ga.addColorStop(0, 'rgba(' + alta + ',' + (.14 * au).toFixed(3) + ')');
      ga.addColorStop(1, 'rgba(' + alta + ',0)');
      ctx.fillStyle = ga; ctx.fillRect(0, 0, W, H * .55);
      var gBaixo = ctx.createLinearGradient(0, H, 0, H * .45);
      gBaixo.addColorStop(0, 'rgba(' + vio + ',' + (.12 * au).toFixed(3) + ')');
      gBaixo.addColorStop(1, 'rgba(' + vio + ',0)');
      ctx.fillStyle = gBaixo; ctx.fillRect(0, H * .45, W, H * .55);
    }

    /* ---- 2c. ONDA DE CHOQUE ----
       A ignição do Singular manda um anel de luz do reator para fora, que
       atravessa a tela toda. É o momento de maior impacto do site — e dura
       menos de um segundo, por isso não cansa. Um anel + um rastro. */
    if (S.shock >= 0) {
      var sk = S.shock;
      var ox = reator ? reator.x : W * .5;
      var oy = reator ? reator.y : H * .35;
      var alcanceS = Math.sqrt(W * W + H * H) * .78;
      var raioS = sk * alcanceS;
      var forca = (1 - sk) * (1 - sk);                 /* some ao chegar na borda */
      ctx.lineWidth = 2 + forca * 5;
      ctx.strokeStyle = 'rgba(' + nuc + ',' + (.55 * forca).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox, oy, raioS, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + alta + ',' + (.3 * forca).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox, oy, raioS * .86, 0, TAU); ctx.stroke();
      halo(ox, oy, raioS * .5, nuc, .22 * forca);
    }

    /* ---- 3. AI CORE — o reator do hero ----
       Reconstruído para parecer ENGENHARIA DE PRECISÃO: um bezel graduado, uma
       grade concêntrica de blueprint, raios estruturais, um giroscópio de três
       anéis inclinados girando em ritmos diferentes com nós em divisões
       regulares, e um núcleo poligonal (hexágonos contra-rotativos). A sensação
       de "complexo e bem estruturado" vem da ORDEM — tudo em divisões exatas —
       não do acúmulo. Desenhado de fora para dentro. */
    if (reator && reator.y > -reator.r && reator.y < H + reator.r) {
      var R = reator.r, cx = reator.x, cyy = reator.y;
      var resp = 1 + Math.sin(S.t * .022) * .015 + pulso * .04;   /* respiro sutil */
      var giro = S.t * .0045 * (1 + e * .6);
      var det = .5 + orc * .5;                                     /* detalhe cede sob carga */

      halo(cx, cyy, R * .9, cy, (.05 + e * .05 + pulso * .12) * lum);

      /* --- BEZEL GRADUADO: dois trilhos e 60 marcas (longas a cada 5), como o
         anel de um instrumento. É a assinatura do "bem estruturado". --- */
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.30 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * .90, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.18 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * .82, 0, TAU); ctx.stroke();
      var NT = Math.round(60 * det), gBez = S.t * .0011;
      for (var it = 0; it < NT; it++) {
        var at = gBez + it / NT * TAU, ca = Math.cos(at), sa = Math.sin(at);
        var longo = (it % 5) === 0;
        var r0 = R * .82, r1 = R * (longo ? .90 : .865);
        ctx.strokeStyle = 'rgba(' + (longo ? alta : cy) + ',' + a1((longo ? .5 : .2) * lum).toFixed(3) + ')';
        ctx.lineWidth = longo ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + ca * r0, cyy + sa * r0);
        ctx.lineTo(cx + ca * r1, cyy + sa * r1);
        ctx.stroke();
      }

      /* --- GRADE CONCÊNTRICA: profundidade de blueprint --- */
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.08 * lum).toFixed(3) + ')';
      for (var ig = 0; ig < GRADE.length; ig++) {
        ctx.beginPath(); ctx.arc(cx, cyy, R * GRADE[ig] * resp, 0, TAU); ctx.stroke();
      }

      /* --- RAIOS ESTRUTURAIS: uma roda de 12 raios girando devagar --- */
      var NS = Math.max(6, Math.round(12 * det)), gSp = giro * .5;
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.10 * lum).toFixed(3) + ')';
      for (var is = 0; is < NS; is++) {
        var asp = gSp + is / NS * TAU, cas = Math.cos(asp), sas = Math.sin(asp);
        ctx.beginPath();
        ctx.moveTo(cx + cas * R * .30 * resp, cyy + sas * R * .30 * resp);
        ctx.lineTo(cx + cas * R * .68 * resp, cyy + sas * R * .68 * resp);
        ctx.stroke();
      }

      /* --- GIROSCÓPIO: três anéis inclinados, ritmos e sentidos diferentes,
         nós em divisões regulares. A oclusão (frente/trás) vem do alfa. --- */
      for (var o = 0; o < ANEIS.length; o++) {
        var A = ANEIS[o], erx = R * A.rx * resp, ery = R * A.ry * resp;
        var Asp = giro * A.spMul;
        var ci = Math.cos(A.incl), si = Math.sin(A.incl);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.16 * lum).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(cx, cyy, erx, ery, A.incl, 0, TAU); ctx.stroke();
        var nn = Math.max(4, Math.round(A.nn * det));
        for (var n = 0; n < nn; n++) {
          var ang = Asp + n / nn * TAU;
          var ex = Math.cos(ang) * erx, ey = Math.sin(ang) * ery;
          var nx = cx + ex * ci - ey * si;
          var ny = cyy + ex * si + ey * ci;
          var frente = Math.sin(ang) > 0 ? 1 : .32;      /* nó atrás mais fraco */
          ctx.fillStyle = 'rgba(' + alta + ',' + a1(.85 * frente * lum).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(nx, ny, 1.3 * frente + .9, 0, TAU); ctx.fill();
        }
      }

      /* --- OVERDRIVE (só no Singular): descarga radial ESTRUTURADA ---
         12 feixes em ângulos regulares pulsando para fora + a casca de
         contenção. Ordenado, não caótico — combina com a nova arquitetura. */
      if (sing > .05) {
        var NB = 12, gb = S.t * .008;
        ctx.lineWidth = 1.4;
        for (var ib = 0; ib < NB; ib++) {
          var ab = gb + ib / NB * TAU, cab = Math.cos(ab), sab = Math.sin(ab);
          var beam = Math.sin(S.t * .05 + ib * .9) * .5 + .5;
          var r1b = R * (.9 + beam * .55) * sing;
          ctx.strokeStyle = 'rgba(' + nuc + ',' + a1(.32 * sing * beam * lum).toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(cx + cab * R * .68, cyy + sab * R * .68);
          ctx.lineTo(cx + cab * r1b, cyy + sab * r1b);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.4 * sing * lum).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cyy, R * (.98 + Math.sin(S.t * .05) * .02), 0, TAU); ctx.stroke();
      }

      /* --- NÚCLEO POLIGONAL: hexágono + triângulo contra-rotativos + plasma ---
         AQUI mora a leitura semântica da paleta: o núcleo queima VIOLETA e a
         estrutura em volta (bezel, grade, raios, giroscópio) fica CIANO. A
         inteligência é a segunda cor; a interface é a âncora. O ponto central
         segue BRANCO — é a fonte de luz, e fonte de luz satura ao branco. Por
         isso o hero continua lendo ciano de longe: só o miolo é violeta. */
      poligono(cx, cyy, R * .20 * resp, S.t * .006, 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.55 * lum).toFixed(3) + ')';
      ctx.stroke();
      poligono(cx, cyy, R * .13 * resp, -S.t * .009, 3);
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.42 * lum).toFixed(3) + ')';
      ctx.stroke();
      halo(cx, cyy, R * .18 * (1 + pulso + sing), vio, (.34 + pulso * .4 + sing * .6) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.9 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * (.045 + sing * .03) * resp, 0, TAU); ctx.fill();
    }

    /* ---- 3c. mini AI Core: o nó dos serviços, ligado a cada card ----
       O barramento já dizia "Conectado ao AI Core" em texto; agora o núcleo
       existe e os elos vão até os cards. Interativo: o elo do card sob o cursor
       acende. Durante o Pulso, a frente sobe pelos elos até os cards. */
    /* alvo por orçamento, mas a transição é LERP (nunca um corte seco): perto
       do limiar o orçamento oscila frame a frame, e um `if (orc > .55)` puro
       fazia o núcleo aparecer/sumir a cada oscilação — lia como bug. Suavizado,
       a variação de orçamento vira uma respiração, não um pisca-pisca. */
    nucAlpha += ((orc > .5 ? 1 : 0) - nucAlpha) * .05;
    if (nucleo && nucAlpha > .01 && nucleo.y > -80 && nucleo.y < H + 80) {
      ctx.save();
      ctx.globalAlpha = nucAlpha;
      var hx = nucleo.x, hy = nucleo.y, hr = nucleo.r;
      for (var L = 0; L < servNos.length; L++) {          /* elos primeiro, atrás do núcleo */
        var sn = servNos[L];
        var pl = prox(S, sn.cx, sn.cy, 300);
        var aL = .06 + e * .05 + pl * .55 + pulso * .3;
        var aLim = a1(Math.min(.6, aL));
        /* O ELO CONTA A HISTÓRIA DA PALETA: sai do card em CIANO (é interface) e
           acende para VIOLETA ao chegar no nó (é AI Core). Um gradiente linear
           do card até o nó — não é um traço de cor única, é a transição entre as
           duas cores da rampa acontecendo no lugar onde ela significa algo. */
        var gElo = ctx.createLinearGradient(sn.cx, sn.cy, hx, hy);
        gElo.addColorStop(0, 'rgba(' + cy + ',' + aLim.toFixed(3) + ')');
        gElo.addColorStop(1, 'rgba(' + vio + ',' + aLim.toFixed(3) + ')');
        ctx.strokeStyle = gElo;
        ctx.lineWidth = 1;
        /* curva com controle em (sn.cx, hy): sai do núcleo na horizontal e
           ENCAIXA vertical na base do card — cabo plugado, não linha cruzando. */
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(sn.cx, hy, sn.cx, sn.cy);
        ctx.stroke();
        /* a porta: onde o cabo encaixa no card. Acende com a proximidade. */
        ctx.fillStyle = 'rgba(' + alta + ',' + a1(.3 + pl * .5).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sn.cx, sn.cy, 1.6 + pl * 1.4, 0, TAU); ctx.fill();
        if (pulso > .02) {
          var f = Math.max(0, Math.min(1, S.pulseFront)), mt = 1 - f;
          /* posição na PRÓPRIA curva (Bézier quadrática), não na reta */
          var bx = mt * mt * hx + (2 * mt * f + f * f) * sn.cx;
          var by = (mt * mt + 2 * mt * f) * hy + f * f * sn.cy;
          halo(bx, by, 10, nuc, .5 * pulso);
        }
      }
      var resp2 = 1 + Math.sin(S.t * .03) * .05 + pulso * .12;
      /* o mini AI Core repete a lógica do reator: o NÓ é violeta (é AI Core),
         o ponto central é branco (é luz). Os elos chegando são ciano — a
         transição acontece no Step 3. */
      halo(hx, hy, hr * 1.5, vio, (.10 + e * .06 + pulso * .16) * lum);
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.5 * lum).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, hr * .6 * resp2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.34 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(hx, hy, hr * .9, hr * .26, S.t * .01, 0, TAU); ctx.stroke();
      halo(hx, hy, hr * .3 * (1 + pulso), nuc, (.4 + pulso * .4 + S.singular * .4) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.8 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, hr * .09 * resp2, 0, TAU); ctx.fill();
      ctx.restore();
    }

    /* NOTA: aqui viviam a "tipografia viva" (halos por glifo) e a "aura nas
       palavras-chave" (halos atrás das palavras). O dono removeu os dois: a luz
       redonda difusa atrás do texto lê como amador. O texto agora não tem
       nenhum brilho de canvas — a vida vem do reator, das partículas, da borda
       de energia e do espetáculo do Singular, não de manchas atrás das letras. */

    /* ---- barramento: a luz do Pulso atravessando até os serviços ----
       Não é um loop eterno: existe só enquanto o Pulso passa, e é ELE que a
       frente (S.pulseFront) posiciona. Serve para tornar o Pulso legível. */
    if (barramento && pulso > .02) {
      var bx = barramento.x + barramento.w * S.pulseFront;
      var bg = ctx.createLinearGradient(barramento.x, 0, barramento.x + barramento.w, 0);
      var bp = Math.max(0, Math.min(1, S.pulseFront));
      bg.addColorStop(Math.max(0, bp - .16), 'rgba(' + cy + ',0)');
      bg.addColorStop(bp, 'rgba(' + nuc + ',' + (.5 * pulso).toFixed(3) + ')');
      bg.addColorStop(Math.min(1, bp + .16), 'rgba(' + cy + ',0)');
      ctx.fillStyle = bg;
      ctx.fillRect(barramento.x, barramento.y - 1, barramento.w, 2);
      halo(bx, barramento.y, 26, alta, .3 * pulso);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  dimensionar();
  B.add('campo', tick);
})();
