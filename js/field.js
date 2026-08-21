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
  /* A PALETA DO CANVAS — realinhada à reformulação de 2026-08-20.
     O canvas nunca lê a folha de estilo (ver comentário de `mistura`), então
     estes números são a única cópia da paleta deste lado. Eles espelham os
     tokens do CSS: CIANO = --ac (#4FD8F0), OURO = --warm (#F0B44F),
     NUCLEO = --t1 (#EDEDF1).

     O ciano saiu de 0,245,255 (saturação máxima) para 79,216,240. O anterior
     era neon puro: sobre preto ele vibrava, sujava a borda dos brilhos e
     empurrava a cena inteira para o clichê "AI startup". A LUMINÂNCIA foi
     preservada de propósito (BT.709: 194 → 189), porque todos os alfas deste
     arquivo — bruma, halo, elo, núcleo — foram calibrados para aquele peso
     visual. Trocar o matiz mantendo o peso evita recalibrar dezenas de números
     às cegas neste ambiente (a aba não compõe frames — HANDOFF §12.5).
     Mesma regra nos outros três: NUCLEO perdeu o tint ciano e virou o branco
     neutro do texto; OURO acompanhou o --warm novo. */
  var CIANO = '79,216,240', ALTA = '165,235,246', NUCLEO = '240,242,246', OURO = '240,180,79';
  /* O CONTRAPONTO da rampa. O ciano é a âncora e não muda; a prata é a segunda
     cor, e é ela que tira a cena do monocromático — mas por DESSATURAÇÃO, não
     por um segundo matiz saturado. Ciano é o néon vivo (a interface); prata é
     o metal frio ao redor dele (a inteligência). É a leitura oposta do violeta
     que ela substitui: aquele era uma segunda cor SATURADA competindo com o
     ciano — a combinação neon-duplo é o clichê visual de praticamente todo
     produto de IA de 2024-2026, e era esse par competindo que lia como
     enjoativo, não a saturação em si.

     SEM alvo quente próprio, de propósito (o violeta tinha um — BRASA — só
     para não convergir para o MESMO ouro de todo o resto em warmth=1). Aqui o
     oposto é o efeito desejado: a prata fria devia se render ao ouro no
     Reinado, porque o ouro já É a assinatura do Singular que o dono quer
     reforçar, não dividir com uma segunda cor concorrente naquele momento.
     Estrutura fria virando luz quente — não duas cores frias virando dois
     tons quentes em paralelo.

     Luminância (perceptual, BT.709) mantida próxima do violeta que ela
     substitui — 120 contra 111 — de propósito: todo alfa do arquivo abaixo
     (bruma, halo, elo, núcleo) foi calibrado para aquele peso visual,
     incluindo a auditoria de contraste da revisão anterior. Trocar só o
     matiz, preservando o peso, evita ter que recalibrar dezenas de números
     às cegas neste ambiente (a aba não compõe frames — ver HANDOFF §12.5).

     Este valor NÃO existe como token de CSS — a cor do canvas nunca passa
     pela folha de estilo. Este é o único lugar onde ele vive. */
  /* dessaturada mais um passo na reformulação (era 108,122,142): com o ciano
     novo já menos neon, a prata precisava recuar junto para continuar lendo
     como METAL FRIO e não como uma segunda cor. Luminância praticamente
     intacta (121 → 110), pelo mesmo motivo de calibragem acima. */
  var PRATA = '104,110,124';

  /* geometria estática do núcleo, IZADA para fora do loop: recriar estes
     valores a cada frame era lixo para o GC à toa.

     LAMINAS não cede sob orçamento de propósito: são seis segmentos de reta, o
     custo é irrisório, e mudar a contagem mudaria a FORMA do mecanismo a cada
     oscilação de carga — o núcleo pareceria trocar de peça sozinho. O que cede
     é a densidade da malha (GRADE_PASSOS), que é textura e não estrutura. */
  var LAMINAS = 6;                 /* lâminas da abertura — hexagonal, mecânica */
  /* inradio → circunradio do polígono de LAMINAS lados. É o que mantém a sobra
     da lâmina proporcional em qualquer abertura (ver o bloco da ABERTURA). */
  var K_HEX = 1 / Math.cos(Math.PI / LAMINAS);
  var GRADE_PASSOS = 5;            /* linhas da malha por quadrante */
  var MARCAS = [0, .25, .5, .75];  /* marcas de registro, em voltas */

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
  /* toda cor do arquivo funde para o MESMO alvo quente (OURO): é isso que faz
     o Reinado do Singular ler como um evento único e não uma disputa de tons. */
  function cor(base, w, hot) {
    var c = mistura(base, OURO, w || 0);
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

  /* NOTA: aqui vivia `poligono()`, que desenhava o hexágono e o triângulo
     contra-rotativos do miolo do reator antigo. A abertura de lâminas retas que
     os substituiu monta o próprio path com duas chamadas de moveTo/lineTo por
     lâmina, então a função ficou sem nenhum chamador e saiu na varredura de
     código morto da reformulação do núcleo. */

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
    /* o contraponto, resolvido UMA vez por frame como os outros. Sem alvo
       próprio: no Singular funde para ouro igual a tudo mais — a prata é
       estrutura fria, e estrutura fria vira luz quente no Reinado. Ganho de
       branco igual ao do ciano (.55) — ele é uma cor de base, não a fonte
       de luz. */
    var pr = cor(PRATA, w, hot * .55);
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
         o brilho; agora decide também a cor. As fracas são prata, as fortes
         ciano — então o campo tem profundidade cromática em vez de ser uma só
         cor em brilhos diferentes. O corte é o MESMO .55 que o núcleo branco do
         Singular já usava logo abaixo: nenhum dado novo por partícula. */
      ctx.fillStyle = 'rgba(' + (p.f > .55 ? cy : pr) + ',' + a1(br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + sing * .5), 0, TAU); ctx.fill();
      /* núcleo branco nas maiores durante o Singular: a poeira vira ouro */
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
           Math.min(W, H) * .5, pr, .016 * lum);
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
      gBaixo.addColorStop(0, 'rgba(' + pr + ',' + (.12 * au).toFixed(3) + ')');
      gBaixo.addColorStop(1, 'rgba(' + pr + ',0)');
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

    /* ---- 3. AI CORE — a ABERTURA ----
       RECONSTRUÍDO na reformulação de 2026-08-21 para falar a MESMA língua do
       site. A versão anterior era um orbe: bezel de 60 marcas, grade
       concêntrica, doze raios, giroscópio de três elipses inclinadas e núcleo
       poligonal — NOVE elementos redondos, SETE rotações simultâneas e DOIS
       halos, um deles do tamanho do núcleo inteiro. Lia como "esfera neon de
       produto de IA", o clichê que a direção recusa explicitamente, e falava um
       dialeto que não existe em nenhum outro lugar da página: o site é
       ortogonal (malha, régua, alinhamento, ângulo reto) e o núcleo era todo
       curvo. Objeto colado por cima, não peça integrada à arquitetura.

       Agora é uma ABERTURA — um diafragma de precisão, construído com o
       vocabulário do próprio site: malha, linha reta, marca de registro,
       ponto. UMA rotação (a abertura) e UMA luz (o centro). A leitura passa a
       ser "inteligência centralizada dentro de um instrumento" em vez de "bola
       de energia". Desenhado de fora para dentro.

       Custo: ~8 chamadas de desenho contra ~90 da versão anterior, onde só o
       bezel fazia 60 ctx.stroke() individuais com troca de strokeStyle a cada
       marca. */
    if (reator && reator.y > -reator.r && reator.y < H + reator.r) {
      var R = reator.r, cx = reator.x, cyy = reator.y;
      var resp = 1 + Math.sin(S.t * .018) * .012 + pulso * .03;   /* respiro sutil */
      var det = .5 + orc * .5;                                     /* detalhe cede sob carga */

      /* --- 1. A MALHA ---
         A mesma grade da seção de capacidades, em forma de campo: linhas
         ortogonais dentro do círculo do núcleo. É ISTO que integra o AI Core à
         arquitetura da página em vez de deixá-lo como um objeto por cima.
         Estática de propósito — malha que gira deixa de ser referência e vira
         decoração. O comprimento de cada linha é a CORDA do círculo naquele
         deslocamento (2·√(R²−d²)), calculada direto: sai exata e evita um
         ctx.clip por frame. Uma única path para as ~20 linhas. */
      var passos = Math.max(2, Math.round(GRADE_PASSOS * det));
      var passo = R / (passos + 1);
      ctx.lineWidth = 1;
      /* .12, não .07: no primeiro corte a malha era invisível na prática — e ela
         é justamente o elemento que amarra o núcleo à arquitetura da página.
         Verificado no rasterizador, comparando as duas lado a lado. */
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.12 * lum).toFixed(3) + ')';
      ctx.beginPath();
      for (var ig = -passos; ig <= passos; ig++) {
        if (!ig) continue;              /* o eixo central vem depois, mais forte */
        var dg = ig * passo, meia = Math.sqrt(Math.max(0, R * R - dg * dg));
        ctx.moveTo(cx + dg, cyy - meia); ctx.lineTo(cx + dg, cyy + meia);
        ctx.moveTo(cx - meia, cyy + dg); ctx.lineTo(cx + meia, cyy + dg);
      }
      ctx.stroke();

      /* --- 2. ANEL DE REGISTRO ---
         Um círculo fino e quatro marcas cardeais. As marcas NÃO giram: marca de
         registro que gira não referencia mais nada. Mesma lógica do índice mono
         nos cards — instrumento se lê parado. */
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.22 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * .88, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.5 * lum).toFixed(3) + ')';
      ctx.beginPath();
      for (var im = 0; im < MARCAS.length; im++) {
        var am = MARCAS[im] * TAU, cam = Math.cos(am), sam = Math.sin(am);
        ctx.moveTo(cx + cam * R * .82, cyy + sam * R * .82);
        ctx.lineTo(cx + cam * R * .96, cyy + sam * R * .96);
      }
      ctx.stroke();

      /* --- 3. VARREDURA ---
         O único movimento CONTÍNUO do núcleo: um arco curto percorrendo o anel.
         É o sinal de "está operando", e um sinal basta — a versão anterior
         tinha sete rotações competindo entre si, o que lia como agitação, não
         como precisão. Acelera com a energia da jornada e com o Pulso. */
      var av = S.t * .006 * (1 + e * .5 + pulso);
      ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.55 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * .88, av, av + .38); ctx.stroke();

      /* --- 4. A ABERTURA ---
         Um diafragma de LÂMINAS RETAS: cada lâmina é a corda tangente ao
         círculo interno, com as pontas na borda externa (meia-corda =
         √(rOut²−rIn²)). Seis cordas tangentes a um mesmo círculo formam um
         hexágono cujo incírculo é rIn — a geometria de um diafragma real, e
         nenhuma curva envolvida: é a língua ortogonal do resto do site.

         No Singular ela ABRE (o raio interno cresce): uma resposta MECÂNICA e
         legível — o sistema se escancara. Antes o Singular disparava doze
         feixes radiais para fora, bonito na primeira vez e ruído nas outras,
         sem significar coisa nenhuma. */
      /* rOut é DERIVADO de rIn, nunca fixo. Com um rOut fixo (a primeira versão
         usava R*.74) a lâmina ultrapassava o canto do hexágono em 80px contra
         uma aresta de 55 — sobra maior que o trecho útil, o que desenha uma
         roseta de retas cruzadas em vez de um diafragma. Derivando rOut do
         raio interno pelo circunraio do hexágono (K = 1/cos(π/n)) mais uma
         folga pequena, a sobra fica proporcional em QUALQUER abertura: o
         mecanismo escala sem mudar de caráter ao abrir.

         Os três números abaixo foram escolhidos OLHANDO o desenho, não no
         escuro: o núcleo foi rasterizado fora do navegador (mesma geometria,
         mesmos alfas, blending aditivo) e as variantes comparadas lado a lado.
         · folga 1.10 — em 1.22 a lâmina passava 80px do canto contra 55px de
           aresta e o conjunto lia como gravetos cruzados; em 1.04 fechava num
           hexágono liso e perdia o caráter de lâmina. 1.10 dá a sobreposição
           de diafragma de verdade.
         · abertura +.10 no Singular — em +.20 o mecanismo se desmontava no ar.
         · teto em `lum` — sem ele o Singular levava o alfa a 1 e a sobra das
           lâminas, que é discreta em repouso, virava a coisa mais gritante da
           tela justamente no momento de maior brilho. */
      var abre = .34 + sing * .10 + pulso * .04;
      var rIn = R * abre * resp;
      var rOut = rIn * K_HEX * 1.10;
      var meiaCorda = Math.sqrt(Math.max(0, rOut * rOut - rIn * rIn));
      var rotA = S.t * .0016;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.36 * Math.min(lum, 1.15)).toFixed(3) + ')';
      ctx.beginPath();
      for (var il = 0; il < LAMINAS; il++) {
        var al = rotA + il / LAMINAS * TAU;
        var lx = cx + Math.cos(al) * rIn, ly = cyy + Math.sin(al) * rIn;
        var ldx = -Math.sin(al) * meiaCorda, ldy = Math.cos(al) * meiaCorda;
        ctx.moveTo(lx - ldx, ly - ldy); ctx.lineTo(lx + ldx, ly + ldy);
      }
      ctx.stroke();

      /* --- 5. EIXOS ---
         A cruz de referência: completa a malha (que pula o centro) e atravessa
         um pouco além do anel, como marca de registro de desenho técnico. É a
         régua do site aplicada ao núcleo. */
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.20 * lum).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(cx - R * .96, cyy); ctx.lineTo(cx + R * .96, cyy);
      ctx.moveTo(cx, cyy - R * .96); ctx.lineTo(cx, cyy + R * .96);
      ctx.stroke();

      /* --- 6. O PONTO ---
         Inteligencia centralizada: um ponto pequeno e exato, com o minimo de
         luz em volta para ler como FONTE e nao como furo. E a unica mancha de
         luz que sobrou no nucleo — a versao anterior tinha duas, e a de fora
         cobria o nucleo inteiro (R*.9), que e justamente o "glow porque fica
         bonito" que a direcao nova veta. Aqui o relevo vem do peso das linhas
         e do contraste, nao da mancha. */
      halo(cx, cyy, R * (.10 + pulso * .06 + sing * .10), nuc, (.22 + pulso * .3 + sing * .35) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.95 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * (.028 + sing * .016) * resp, 0, TAU); ctx.fill();
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
           esfria para PRATA ao chegar no nó (é AI Core). Um gradiente linear
           do card até o nó — não é um traço de cor única, é a transição entre as
           duas cores da rampa acontecendo no lugar onde ela significa algo. */
        var gElo = ctx.createLinearGradient(sn.cx, sn.cy, hx, hy);
        gElo.addColorStop(0, 'rgba(' + cy + ',' + aLim.toFixed(3) + ')');
        gElo.addColorStop(1, 'rgba(' + pr + ',' + aLim.toFixed(3) + ')');
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
      var resp2 = 1 + Math.sin(S.t * .03) * .04 + pulso * .1;
      /* O NÓ é a ABERTURA em miniatura — mesma gramática do núcleo do hero, em
         escala menor: anel de registro, quatro marcas cardeais paradas, e o
         ponto de luz no centro. Aqui existia uma elipse girando (`ctx.ellipse`
         com rotação por frame), que era o resto da linguagem de ORBE da versão
         antiga: um anel inclinado girando lê como planeta, não como
         instrumento. Sem lâminas nesta escala — a hr é ~22px e seis cordas
         viram um borrão; o que sobrevive ao tamanho é o anel com as marcas. */
      halo(hx, hy, hr * 1.2, pr, (.07 + e * .04 + pulso * .09) * Math.min(lum, 1.2));
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.5 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, hr * .6 * resp2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.34 * lum).toFixed(3) + ')';
      ctx.beginPath();
      for (var imn = 0; imn < MARCAS.length; imn++) {
        var amn = MARCAS[imn] * TAU, camn = Math.cos(amn), samn = Math.sin(amn);
        ctx.moveTo(hx + camn * hr * .5, hy + samn * hr * .5);
        ctx.lineTo(hx + camn * hr * .82, hy + samn * hr * .82);
      }
      ctx.stroke();
      /* o halo do nó tinha raio hr*.3*(1+pulso) e alfa até 1: no Pulso ele
         crescia EXATAMENTE até o anel (hr*.6) e o engolia — o nó virava uma
         bola branca, a mancha de luz redonda que esta direção veta. Visto no
         rasterizador. Agora o raio cresce pouco e o alfa tem teto: o que
         acende no Pulso é o ponto, não uma bolha por cima da estrutura. */
      halo(hx, hy, hr * .3 * (1 + pulso * .35), nuc, (.24 + pulso * .2 + S.singular * .22) * Math.min(lum, 1.2));
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
