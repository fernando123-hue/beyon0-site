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
  /* ângulos ACUMULADOS — nunca derivados de S.t multiplicado por uma velocidade
     variável (ver a nota da VARREDURA). Acumular é o que permite mudar a
     velocidade sem teleportar a posição. */
  var varr = 0, aber = 0;
  /* presença do cursor: sobe rápido ao mover, cai devagar ao parar. Vive aqui
     porque é estado de DESENHO (quanto mostrar), não estado do organismo. */
  var pxAnt = 0, pyAnt = 0, presenca = 0, temAnt = false;
  var ps = [], nAlvo = 0;
  var reator = null, barramento = null;
  var servNos = [], nucleo = null, nucAlpha = 0;
  var stepNos = [];                    /* nós da linha do tempo — a aura de energia */
  var sujo = true;

  /* o DOM é estático: buscar os mesmos elementos a cada scroll é trabalho
     jogado fora. medir() só relê os retângulos. */
  var elReator = document.querySelector('.hero__reactor');
  var elBus = document.querySelector('.bus');
  var elServ = document.querySelectorAll('.card--service');  /* elos do mini AI Core */
  var elSecoes = document.querySelectorAll('main > section[id]');
  var elSteps = document.querySelectorAll('.steps .step');    /* nós do método */

  /* A COLUNA — as fronteiras de seção, como fração da jornada de rolagem.
     Medidas em coordenadas de DOCUMENTO (offsetTop), então não mudam com o
     scroll: calculadas em resize/entrada e nunca por frame. A mesma fração que
     `S.scroll` usa, de propósito — é isso que faz o marcador da coluna encostar
     na marca exata no instante em que a seção começa. */
  var marcasSec = [];
  function medirSecoes() {
    marcasSec.length = 0;
    var alc = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    for (var i = 0; i < elSecoes.length; i++) {
      var topo = elSecoes[i].offsetTop - 72;              /* menos a nav fixa */
      marcasSec.push(Math.max(0, Math.min(1, topo / alc)));
    }
  }

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

  /* PROFUNDIDADE — o campo deixou de ser um plano.
     Cada partícula ganha um `z` (0 = fundo, 1 = frente) e ele decide QUATRO
     coisas de uma vez: tamanho, brilho, velocidade própria e — a que importa —
     o quanto ela responde à rolagem da página. Um plano só, por mais bem feito,
     lê como papel de parede; três medidas de resposta ao MESMO movimento leem
     como espaço. É a paralaxe custando um multiplicador por partícula, em vez
     de camadas de DOM.

     `z` também assumiu a divisão de cor que era do `f`: perto é ciano (a
     interface, viva) e fundo é prata (a estrutura fria). Antes a divisão era
     por brilho aleatório, o que não significava nada. `f` continua existindo,
     mas só como FASE — é o que garante que nada respire em sincronia. */
  function semear() {
    ps.length = 0;
    for (var i = 0; i < nAlvo; i++) {
      var z = Math.random();
      ps.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .22 * (.4 + z), vy: (Math.random() - .5) * .22 * (.4 + z),
        r: .5 + z * 1.6,
        z: z,
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

    /* NÓS DA LINHA DO TEMPO — a aura de energia é desenhada em volta deles.
       O nó (`.step::after`) mora no canto superior-esquerdo do `.step`: ~4px
       para dentro nos dois eixos, tanto no desktop quanto no mobile (a única
       diferença é o `left` de 3px do trilho vertical, absorvido nos 4px). Medir
       o `.step` e deslocar é mais barato e estável do que tentar ler o pseudo,
       que `getBoundingClientRect` nem enxerga. */
    stepNos.length = 0;
    for (var sp = 0; sp < elSteps.length; sp++) {
      var rs = elSteps[sp].getBoundingClientRect();
      if (rs.bottom < -60 || rs.top > H + 60 || !rs.width) continue;
      stepNos.push({ x: rs.left + 4, y: rs.top + 4 });
    }

    sujo = false;
  }
  window.addEventListener('scroll', function () { sujo = true; }, { passive: true });
  B.on('resize', function () { dimensionar(); medirSecoes(); });
  /* .reveal nasce com translateY(18px), e getBoundingClientRect devolve a caixa
     JÁ transformada — os retângulos medidos antes da revelação ficam fora do
     lugar. Ao fim da entrada, remede uma vez. */
  B.on('entrada-pronta', function () { sujo = true; medirSecoes(); });
  /* a palavra viva do hero (js/dom.js) pode mudar o comprimento do título e
     empurrar tudo abaixo — o mesmo remédio do resize, sem resemear o campo:
     `dimensionar()` reseeda as partículas, e reseedar a cada troca de palavra
     trocaria a poeira de lugar a cada 5-7s à toa. */
  B.on('remedir', function () { sujo = true; medirSecoes(); });
  window.addEventListener('load', medirSecoes, { passive: true });

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
    /* O REGIME ENTRA AQUI, e num lugar só. `wake` multiplica a luminância da
       cena inteira, então DORMANT não é um efeito à parte: é o mesmo sistema
       operando mais baixo. Recolhe para 62% e volta — a pessoa que estava lendo
       parada percebe o ambiente respondendo quando ela volta a se mexer, sem
       nunca ter visto nada "desligar". Um número, o site inteiro obedece. */
    var lum = (.55 + e * .45 + pulso * .5 + sing * .6 + hot * .5) * (.62 + S.wake * .38);

    /* ---- 1. campo de partículas ---- */
    var quantas = Math.round(ps.length * orc);
    var atrai = S.pointerOn ? 1 : 0;
    /* deslocamento de rolagem deste frame, limitado. O limite existe porque um
       salto de âncora (`scroll-behavior: smooth` chega a centenas de px por
       frame) arremessaria o campo inteiro para fora da tela de uma vez — o
       wrap devolveria as partículas em posições novas e a cena "trocaria de
       poeira" a cada clique de navegação. Com o teto, um salto grande lê como
       um empurrão forte, que é o que ele é. */
    var sdy = Math.max(-26, Math.min(26, S.sdy || 0));
    /* GRAVIDADE DO NÚCLEO — permanente, não só no Singular.
       O pedido é que o sistema pareça responder à existência de um centro. Uma
       atração radial pura só sugaria a poeira para dentro e esvaziaria a tela em
       um minuto; o que faz ler como CAMPO é a componente TANGENCIAL — a
       partícula não cai no núcleo, ela curva ao redor dele. Radial fraca +
       tangencial dominante = deriva orbital que nunca colapsa e nunca escapa.
       Só existe onde o núcleo existe, e o alcance é o dobro do raio dele. */
    var temG = !!reator && reator.y > -reator.r * 3 && reator.y < H + reator.r * 3;
    var gx = temG ? reator.x : 0, gy = temG ? reator.y : 0;
    var gR = temG ? reator.r * 2.6 : 0, gR2 = gR * gR;
    var gK = .00055 * (.35 + S.wake * .65);
    for (var i = 0; i < quantas; i++) {
      var p = ps[i];
      p.x += p.vx * (1 + pulso * 2); p.y += p.vy * (1 + pulso * 2);
      /* PARALAXE: o mesmo movimento de página, três medidas de resposta. O
         plano de trás quase não anda (.02), o da frente acompanha (.16). */
      p.y -= sdy * (.02 + p.z * .14);
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;

      /* o cursor atrai de leve — sem holofote, sem bola de luz. A frente
         responde mais que o fundo: é a mesma leitura de profundidade. */
      var luzCursor = 0;
      if (atrai) {
        var dx = S.px - p.x, dy = S.py - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 52900) {
          var caiu = 1 - d2 / 52900;
          var k = .00018 * caiu * (.4 + p.z);
          p.vx += dx * k; p.vy += dy * k;
          /* A LUZ AMBIENTE QUE SEGUE O CURSOR — e ela é a poeira, não um foco.
             Um holofote redondo atrás do conteúdo já foi tentado neste site e
             REJEITADO pelo dono (lia como amador), e a direção atual proíbe
             mancha de luz. A resposta certa é a mesma do resto do campo: quem
             acende é a matéria que está lá. A pessoa vê o espaço em volta do
             cursor ganhar densidade sem conseguir apontar uma fonte — que é
             exatamente o pedido. Custo zero: `caiu` já estava calculado para a
             atração, e o quadrado concentra o efeito no miolo do raio em vez de
             espalhá-lo num círculo óbvio de 230px. */
          luzCursor = caiu * caiu * .5;
        }
      }
      if (temG) {
        var ox = gx - p.x, oy = gy - p.y, o2 = ox * ox + oy * oy;
        if (o2 < gR2 && o2 > 400) {
          var od = Math.sqrt(o2), qd = (1 - od / gR) * gK / od;
          /* radial fraca, tangencial três vezes maior: órbita, não queda */
          p.vx += ox * qd + -oy * qd * 3;
          p.vy += oy * qd + ox * qd * 3;
        }
      }
      /* no Singular o campo inteiro é puxado para o reator: a poeira vira
         corrente, e dá para VER de onde a energia está vindo. */
      if (sing > .05 && reator) {
        var rx = reator.x - p.x, ry = reator.y - p.y;
        var kr = .00004 * sing;
        p.vx += rx * kr; p.vy += ry * kr;
      }
      p.vx *= .995; p.vy *= .995;

      /* o brilho é da PROFUNDIDADE (o fundo é mais fraco), a oscilação é da
         fase — as duas coisas separadas, uma decisão cada. */
      var br = (.10 + p.z * .34 + luzCursor) * lum;
      /* DUAS FAIXAS, por profundidade: a frente é ciano (a interface viva), o
         fundo é prata (a estrutura fria). O corte é o MESMO .55 que o núcleo
         branco do Singular usa logo abaixo — nenhum dado novo por partícula. */
      ctx.fillStyle = 'rgba(' + (p.z > .55 ? cy : pr) + ',' + a1(br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + sing * .5), 0, TAU); ctx.fill();
      /* núcleo branco nas maiores durante o Singular: a poeira vira ouro */
      if (sing > .3 && p.z > .55) {
        ctx.fillStyle = 'rgba(' + nuc + ',' + (.5 * sing).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .45, 0, TAU); ctx.fill();
      }
    }

    /* ---- 2. brumas: só quando há folga de orçamento ----
       DUAS derivas agora, com períodos incomensuráveis (.21 e .13 contra .17 e
       .09): o padrão nunca se repete de forma reconhecível, então o fundo tem
       movimento sem ter ritmo — que é a diferença entre atmosfera e animação.
       A segunda é ciano, menor e mais baixa na tela, dando uma direção de luz.

       O REGIME FOCUSED age aqui: quando o cursor pousa sobre algo que responde,
       o ambiente RECUA (até -40%) para que o elemento apontado fique com a
       atenção. É a leitura correta de "um elemento ganha destaque" — o resto
       cede espaço, em vez de o destaque gritar mais alto. */
    if (orc > .8) {
      var t = S.t * .001, ceder = 1 - S.focus * .4;
      /* a bruma é a camada mais profunda e difusa da cena — é o lugar natural do
         contraponto: tinge o fundo sem competir com nada que precise ser lido. */
      halo(W * .5 + Math.cos(t * .21) * W * .2, H * .38 + Math.sin(t * .17) * H * .15,
           Math.min(W, H) * .5, pr, .016 * lum * ceder);
      halo(W * .34 + Math.sin(t * .13) * W * .17, H * .72 + Math.cos(t * .09) * H * .12,
           Math.min(W, H) * .36, cy, .010 * lum * ceder);
    }

    /* ---- 2a. A COLUNA — a continuidade entre as seções ----
       O pedido era que as seções não parecessem páginas empilhadas. Elas não
       são: são trechos de UM percurso, e a coluna é esse percurso desenhado
       por inteiro na lateral — a escala completa do documento, sempre visível,
       com uma marca por seção e o cursor de posição correndo por ela.

       É a leitura de INSTRUMENTO da continuidade, não uma barra de rolagem
       enfeitada: fica na margem esquerda (onde vive a espinha de um desenho
       técnico), não na direita (onde uma barra de rolagem seria a cópia da do
       navegador). E as marcas usam a MESMA fração que `S.scroll`, então o
       marcador encosta na marca no instante exato em que a seção começa — quem
       percebe isso ganha um mapa do site que sempre esteve ali.

       Custo: duas paths e um retângulo.

       O CORTE EM 1000px é geometria, não gosto. A coluna ocupa de x=19 a x=27
       (o traço em 22 mais as marcas). O texto começa em `--pad`, que é
       `clamp(20px, 5vw, 56px)` a partir da borda da seção — e enquanto a
       viewport for menor que os 1200px de `--maxw`, a seção encosta nas bordas
       e essa distância É o padding. Aos 1000px isso dá 50px, e sobram 23px de
       respiro entre a coluna e a primeira letra; aos 760px sobrariam 11px e a
       coluna leria como um traço colado no texto. Abaixo do corte não existe
       margem para uma marca de margem ocupar. */
    if (W > 1000 && marcasSec.length) {
      var colX = 22, colTopo = 90, colBase = H - 104;
      var colH = colBase - colTopo;
      if (colH > 120) {
        var vivo = .5 + S.wake * .5;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.13 * vivo).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(colX + .5, colTopo); ctx.lineTo(colX + .5, colBase);
        ctx.stroke();

        /* as marcas de seção: traço curto atravessando, como escala graduada */
        ctx.strokeStyle = 'rgba(' + pr + ',' + a1(.3 * vivo).toFixed(3) + ')';
        ctx.beginPath();
        for (var ims = 0; ims < marcasSec.length; ims++) {
          var ym = Math.round(colTopo + marcasSec[ims] * colH) + .5;
          ctx.moveTo(colX - 3, ym); ctx.lineTo(colX + 5, ym);
        }
        ctx.stroke();

        /* o cursor de posição: um trecho curto e CHEIO na cor de ação. É o
           único ponto da coluna que recebe cor — o resto é escala. */
        var yPos = colTopo + Math.max(0, Math.min(1, S.scroll)) * colH;
        ctx.fillStyle = 'rgba(' + cy + ',' + a1((.45 + S.sv * .4) * lum).toFixed(3) + ')';
        ctx.fillRect(colX, yPos - 11, 1.6, 22);
      }
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
         como precisão. Acelera com a energia da jornada, com o Pulso e com a
         presença (dormente ele quase para).

         BUG CORRIGIDO AQUI: o ângulo era `S.t * .006 * (1 + e*.5 + pulso)` —
         a VELOCIDADE multiplicando o tempo ACUMULADO. Derivando, a taxa real
         era `k·(1+p) + t·k·dp/dt`: o segundo termo cresce com o tempo de
         página, então quando o Pulso subia aos cinco minutos de visita o arco
         saltava dezenas de radianos entre dois frames e girava descontrolado.
         Acumular o ângulo resolve na origem: a velocidade passa a ser a
         velocidade, e mudá-la nunca teleporta a posição. */
      varr += .006 * (1 + e * .5 + pulso * 1.6) * (.25 + S.wake * .75) * (S.dt / 16.7);
      var av = varr;
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
      /* A ABERTURA RESPONDE À PESSOA. O cursor chegando perto do núcleo abre o
         diafragma um pouco — o mesmo gesto mecânico do Singular, numa fração da
         amplitude. É a resposta mais importante do site inteiro: quem se
         aproxima descobre que o núcleo estava prestando atenção. Amplitude
         deliberadamente pequena (+.05 contra os +.10 do Singular): tem que ser
         percebido como resposta, nunca como o mecanismo abrindo por conta. */
      var perto = prox(S, cx, cyy, R * 3.4);
      var abre = .34 + sing * .10 + pulso * .04 + perto * .05;
      var rIn = R * abre * resp;
      var rOut = rIn * K_HEX * 1.10;
      var meiaCorda = Math.sqrt(Math.max(0, rOut * rOut - rIn * rIn));
      aber += .0016 * (.3 + S.wake * .7) * (S.dt / 16.7);
      var rotA = aber;
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

    /* ---- AURA DOS NÓS DA LINHA DO TEMPO ----
       Pedido do dono: os nós do método com "uma espécie de aura, não uma luz
       genérica redonda em volta". Um `box-shadow` borrado seria exatamente essa
       luz redonda vetada — então a aura é FEITA DE ESTRUTURA, no vocabulário do
       site (o mesmo do AI Core: anel de registro + marcas radiais), e o que a
       faz ler como AURA em vez de enfeite é o MOVIMENTO: os raios respiram para
       fora em fase própria e o anel pulsa, como um campo de energia emanando do
       ponto. Nada de disco de blur.

       Intensidade: uma base viva discreta (a linha está sempre "energizada",
       casando com o fluxo que corre o trilho) mais um ganho forte de
       proximidade do cursor — aproximar acende a aura do nó, como tudo mais no
       site responde à presença. O nó sob o cursor (o `:hover` do CSS) já fica
       preenchido; a aura é a camada de energia por trás disso. */
    if (stepNos.length) {
      for (var sa = 0; sa < stepNos.length; sa++) {
        var nd = stepNos[sa];
        if (nd.y < -40 || nd.y > H + 40) continue;
        var pn = prox(S, nd.x, nd.y, 200);
        /* base VIVA já em repouso (o dono quer que os nós TENHAM aura, não só no
           hover) + ganho de proximidade + Pulso. Sem o `e` sumindo a base. */
        var intens = (.34 + pulso * .3 + pn * .6) * Math.min(lum, 1.35);
        if (intens < .03) continue;
        /* respiro próprio por nó (fase = índice): os três nunca pulsam juntos —
           campo vivo, não piscar sincronizado. */
        var faseN = S.t * .05 + sa * 2.1;
        var resN = .7 + (Math.sin(faseN) * .5 + .5) * .8;   /* 0.7 .. 1.5 */

        /* OS RAIOS — a aura é ENERGIA DIRECIONADA, não um disco de blur (o que o
           dono vetou). Oito traços emanando, cada um com o PRÓPRIO comprimento
           oscilando fora de fase, então as pontas nunca formam um círculo — leem
           como faíscas de um campo, não como um anel. Giram devagar. */
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = 'rgba(' + cy + ',' + a1(intens * .85).toFixed(3) + ')';
        ctx.beginPath();
        for (var ra = 0; ra < 8; ra++) {
          var ang = ra / 8 * TAU + faseN * .12;
          /* comprimento por raio: cada um respira na sua fase (o `ra*.9`) — é o
             que quebra o círculo e faz ler como aura irregular. */
          var comp = (7 + pn * 10) * (.55 + (Math.sin(faseN * 1.3 + ra * .9) * .5 + .5) * .9);
          var r0 = 5.5;
          ctx.moveTo(nd.x + Math.cos(ang) * r0, nd.y + Math.sin(ang) * r0);
          ctx.lineTo(nd.x + Math.cos(ang) * (r0 + comp), nd.y + Math.sin(ang) * (r0 + comp));
        }
        ctx.stroke();

        /* A VARREDURA — um arco curto girando, o mesmo sinal de "operando" do AI
           Core. É o que amarra a aura ao vocabulário do site (o núcleo tem a
           mesma varredura) em vez de virar um efeito à parte. */
        var av = faseN * .6;
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(' + alta + ',' + a1(intens * .7).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 6.5 + pn * 2.5, av, av + .9);
        ctx.stroke();
      }
    }

    /* ---- 5. A LEITURA DO CURSOR ----
       O cursor não ganha um enfeite preso a ele — isso seria o rastro genérico
       que a direção recusa. Ele ganha uma CONSEQUÊNCIA: nas bordas da tela, dois
       traços marcam a coordenada onde ele está, como as guias de um paquímetro
       digital lendo a peça. O objeto apontado é a página; quem lê é o
       instrumento; o cursor é só onde a leitura está sendo tomada.

       Aparece ao MOVER e some parado (em ~1s): a leitura existe enquanto se
       está medindo. Fora isso não há nada a mostrar, e uma marca permanente
       viraria decoração. */
    if (S.pointerOn) {
      var vpx = S.px - pxAnt, vpy = S.py - pyAnt;
      /* NOTA: o desenho fica FORA deste bloco de propósito — ver abaixo. */
      /* PRIMEIRO FRAME COM PONTEIRO: `S.px` nasce em 0 e persegue o cursor por
         interpolação, então a "velocidade" do primeiro quadro é a tela inteira.
         Sem esta guarda, a leitura acendia no máximo e as duas marcas
         atravessavam a borda vindas do canto até alcançarem o cursor — um
         risco deslizando na tela a cada vez que o mouse entra na página.
         Adotar a posição sem medir nada resolve na origem. */
      if (!temAnt) { temAnt = true; vpx = 0; vpy = 0; }
      pxAnt = S.px; pyAnt = S.py;
      var vel = Math.min(1, Math.sqrt(vpx * vpx + vpy * vpy) / 9);
      presenca += (vel - presenca) * (vel > presenca ? .35 : .045);
    } else if (presenca > .002) {
      presenca *= .9;
    } else {
      presenca = 0;
    }
    /* o DESENHO vive fora do `if (pointerOn)`: quando o cursor sai da janela, a
       leitura tem que APAGAR no lugar onde parou, não sumir num corte. `S.px`
       fica congelado na última posição, que é exatamente o que uma última
       leitura deve mostrar. */
    if (presenca > .02) {
      var ap = a1(presenca * .5 * Math.min(lum, 1.3));
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + cy + ',' + ap.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(S.px, 0); ctx.lineTo(S.px, 11);          /* coordenada X, no topo */
      ctx.moveTo(W - 11, S.py); ctx.lineTo(W, S.py);      /* coordenada Y, à direita */
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  dimensionar();
  B.add('campo', tick);
})();
