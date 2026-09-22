/* ==========================================================================
   CENA — a camada 3D, e as regras que a mantêm fluida.

   POR QUE ELA EXISTE
   As imagens 01–04 e 07 do moodboard (ver docs/restructure/) mostram painéis
   de vidro flutuando em profundidade e um portal de pedra com luz atravessando.
   Isso é profundidade de verdade: paralaxe por camada, oclusão, perspectiva.
   Canvas 2D finge; WebGL faz. É a única coisa nesta reestruturação que
   justifica uma dependência nova.

   O QUE ESTA CAMADA NUNCA FAZ
   O 3D é ACRÉSCIMO, nunca substituição. Toda peça que ele enfeita existe e
   funciona sem ele — o palco, o portal e o AI Core continuam lá em CSS e em
   canvas 2D. Se o aparelho for fraco, se a pessoa pedir menos movimento, se a
   conexão estiver econômica ou se o WebGL falhar, esta camada simplesmente não
   carrega e ninguém percebe falta. É por isso que ela pode existir sem
   quebrar a promessa de fluidez.

   AS SEIS REGRAS DE FLUIDEZ (a razão de cada decisão abaixo)
   1. UM CONTEXTO SÓ. Um renderer WebGL em tela cheia desenha TODAS as cenas,
      cada uma no retângulo do seu elemento (scissor + viewport). N contextos
      seriam N vezes o custo fixo e o navegador corta em ~16.
   2. UM rAF SÓ. Registra em B.add e é chamado pelo loop do organismo, como
      todo o resto. O three nunca ganha laço próprio.
   3. NADA FORA DA TELA CUSTA. Cena fora da viewport não é desenhada, e quando
      nenhuma está visível o renderer não é tocado.
   4. SEM LUZ, SEM SOMBRA, SEM PÓS-PROCESSAMENTO. Tudo é plano texturizado com
      material básico. O dossiê do img2threejs registrou que composer (bloom +
      DOF) é o caminho caro; aqui ele não existe. O "vidro" vem de textura
      gerada uma vez, não de refração calculada por frame.
   5. O ORÇAMENTO MANDA. Se S.budget cair, a cena passa a desenhar em frames
      alternados antes de qualquer outra coisa degradar.
   6. CARREGA DEPOIS, E SÓ SE FOR USAR. O three (163 KB comprimido) só é
      baixado quando uma cena está perto da viewport — via import() dinâmico.
      Nada disso entra no caminho da primeira pintura.

   A FORMA DAS CENAS — spec declarativo
   Cada cena é um OBJETO que descreve peças, não código que as constrói. É a
   ideia que sobrou do estudo do img2threejs (o spec é a verdade, o código é
   derivado): trocar uma cena é editar dados, e o mesmo spec poderia emitir
   para outro alvo um dia. As cores saem dos tokens do CSS, então o Estado
   Singular leva o 3D junto para o ouro — de graça.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B) return;

  var alvos = document.querySelectorAll('[data-cena]');
  if (!alvos.length) return;

  /* ---------- PORTEIRO ----------
     Motivos para esta camada simplesmente não existir nesta visita. Nenhum
     deles é erro: são aparelhos e preferências em que o site já está bom sem
     ela.

     ATENÇÃO AO QUE **NÃO** ESTÁ AQUI: `B.weak`. Ele é verdadeiro com 4 núcleos
     ou menos, e 4 núcleos é a configuração de metade dos celulares e de
     qualquer notebook de entrada — barrar por ali desligaria o 3D para muita
     gente que o rodaria liso. Pior: é um PALPITE sobre desempenho, e este
     projeto tem uma lei contra isso (medir, não deduzir — a sessão que tentou
     otimizar por dedução piorou o site três vezes seguidas).

     Em vez do palpite, o desligamento é MEDIDO: a cena entra, e se o orçamento
     de frame não sustentar, ela sai sozinha e não volta (ver `desligar()` lá
     embaixo). Pouca memória continua sendo bloqueio duro porque aí o problema
     não é velocidade, é o navegador matar a aba. */
  if (B.reduced || B.saveData) return;
  if ((navigator.deviceMemory || 8) < 4) return;

  /* SÓ ONDE EXISTE CURSOR — e isto é decisão de produto, não palpite de
     desempenho. O que a cena entrega além do que o CSS já entrega é a
     PARALAXE: a profundidade inclina em direção ao ponteiro, e é esse gesto
     que faz o espaço ler como espaço. No toque esse gesto não existe, e o que
     sobra é um fundo que deriva devagar — exatamente o que as folhas de vidro
     em CSS já fazem, de graça.

     Então no celular a conta é simples: 163 KB comprimidos e uma carga de GPU
     constante, na conexão mais provável de ser medida e na bateria mais
     provável de acabar, em troca de nada que já não esteja lá. Fica de fora. */
  if (!B.fine) return;
  try {
    var teste = document.createElement('canvas');
    if (!(teste.getContext('webgl2') || teste.getContext('webgl'))) return;
  } catch (e) { return; }

  /* ---------- as cores vêm do CSS, uma vez por evento ----------
     Ler getComputedStyle por frame seria exatamente o pecado que custou 76ms
     a este projeto. Lê no boot e relê quando o organismo troca de regime. */
  function lerCor(nome, padrao) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return v || padrao;
  }
  var COR = { ac: '#4FD8F0', t1: '#EDEDF1' };
  function relerCores() {
    COR.ac = lerCor('--ac', '#4FD8F0');
    COR.t1 = lerCor('--t1', '#EDEDF1');
  }
  relerCores();

  /* ==========================================================================
     OS SPECS — o que cada cena é, em dados.
     `pecas` é uma lista de painéis. Cada um declara onde está, o tamanho, a
     opacidade e como responde ao tempo. Nada aqui sabe o que é three.js.
     ========================================================================== */
  var SPECS = {
    /* CUBO — da imagem 03 do moodboard: painéis convergindo para formar um
       volume, com outros à deriva em volta. Vai no hero do Hub, que é a porta
       de entrada: é a imagem com mais presença do conjunto. */
    cubo: {
      camera: { z: 7.4, fov: 42 },
      giro: 0.055,                    /* rotação do conjunto, rad/s */
      pecas: (function () {
        var p = [], L = 1.9;
        /* as seis faces — o volume */
        var faces = [
          [0, 0, L, 0, 0, 0], [0, 0, -L, 0, Math.PI, 0],
          [L, 0, 0, 0, Math.PI / 2, 0], [-L, 0, 0, 0, -Math.PI / 2, 0],
          [0, L, 0, -Math.PI / 2, 0, 0], [0, -L, 0, Math.PI / 2, 0, 0]
        ];
        for (var i = 0; i < faces.length; i++) {
          var f = faces[i];
          p.push({ pos: [f[0], f[1], f[2]], rot: [f[3], f[4], f[5]],
                   tam: [L * 2, L * 2], alfa: 0.62, deriva: 0.16, fase: i * 1.1 });
        }
        /* os satélites — profundidade em volta do volume */
        /* três satélites, não seis: cada um é área pintada, e o volume já
           carrega a composição sozinho. Cortar aqui foi o que devolveu quadros
           sem tirar nada que o olho sentisse falta. */
        var sat = [
          [-3.4, 1.8, 1.2, 1.1, 0.75], [3.3, -1.4, 0.6, 1.25, 0.85],
          [-2.5, -2.3, -1.5, 0.9, 0.62]
        ];
        for (var s = 0; s < sat.length; s++) {
          var q = sat[s];
          p.push({ pos: [q[0], q[1], q[2]], rot: [0, q[0] * 0.09, q[1] * 0.05],
                   tam: [q[3], q[4]], alfa: 0.48, deriva: 0.5, fase: s * 0.9 });
        }
        return p;
      })()
    },

    /* PAINÉIS — das imagens 01/02/04: camadas de vidro à deriva. Vai atrás do
       palco da página de Sites, onde a janela em CSS fica na frente e nítida.
       Mais calmo que o cubo de propósito: ali ele é fundo, não assunto. */
    paineis: {
      camera: { z: 8, fov: 46 },
      giro: 0.014,
      pecas: (function () {
        /* seis painéis. A primeira versão tinha onze, e onze quadriláteros
           translúcidos sobrepostos atrás de uma janela que já é opaca é
           trabalho que ninguém vê: o custo aparecia inteiro na taxa de
           quadros, a profundidade não aumentava. Seis, mais espalhados em z,
           leem como mais. */
        /* QUATRO painéis, e todos na PERIFERIA.
           Duas correções sobre a primeira versão, ambas pela mesma razão. A
           janela do palco tem fundo opaco: tudo que fosse desenhado atrás do
           centro dela era pintado e imediatamente coberto — custo integral,
           zero imagem. Então os painéis saem do miolo e passam a orbitar a
           uma distância em que aparecem pelas BORDAS da janela, que é onde a
           profundidade se lê. Menos pixels escritos e mais efeito visível: as
           duas coisas na mesma mudança. */
        var p = [], n = 4;
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2 + 0.6;
          p.push({
            pos: [Math.cos(a) * 4.2, Math.sin(a) * 2.9, -1.2 - i * 0.9],
            rot: [0, -Math.cos(a) * 0.3, Math.sin(a) * 0.12],
            tam: [1.3 + (i % 2) * 0.5, 0.9 + (i % 3) * 0.3],
            alfa: 0.5 - i * 0.05,
            deriva: 0.5 + (i % 3) * 0.16,
            fase: i * 1.1
          });
        }
        return p;
      })()
    },

    /* PORTAL — da imagem 07: dois pilares, a verga e a luz no vão. É a
       assinatura de Experiências Digitais. As pedras são painéis escuros sem
       brilho; quem acende é o vão. */
    portal: {
      camera: { z: 6.2, fov: 40 },
      giro: 0,
      pedra: true,
      pecas: [
        { pos: [-1.55, -0.2, 0], rot: [0, 0.16, 0], tam: [0.78, 3.5], alfa: 1, pedra: 1, deriva: 0 },
        { pos: [1.55, -0.2, 0], rot: [0, -0.16, 0], tam: [0.78, 3.5], alfa: 1, pedra: 1, deriva: 0 },
        { pos: [0, 1.95, 0], rot: [0, 0, 0], tam: [3.9, 0.72], alfa: 1, pedra: 1, deriva: 0 },
        { pos: [0, -0.28, -0.35], rot: [0, 0, 0], tam: [2.3, 3.32], alfa: 0.7, vao: 1, deriva: 0.1, fase: 0 },
        /* lascas à deriva: dão escala e movimento sem competir com o vão */
        { pos: [-2.9, 1.4, -1.6], rot: [0, 0.4, 0.1], tam: [0.9, 0.6], alfa: 0.34, deriva: 0.7, fase: 1.3 },
        { pos: [2.8, -1.1, -1.9], rot: [0, -0.4, -0.1], tam: [1.1, 0.7], alfa: 0.3, deriva: 0.6, fase: 2.1 }
      ]
    }
  };

  /* ==========================================================================
     TEXTURAS — o "vidro", desenhado UMA vez em canvas 2D.
     Um painel de vidro é: superfície quase transparente, aresta iluminada e um
     leve gradiente. Tudo isso é uma imagem estática — não precisa de shader de
     refração nem de luz na cena, e é por isso que esta camada custa quase nada.
     ========================================================================== */
  function fazerTextura(THREE, tipo) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');

    if (tipo === 'pedra') {
      var g = x.createLinearGradient(0, 0, 128, 128);
      g.addColorStop(0, '#22222A'); g.addColorStop(0.55, '#101016'); g.addColorStop(1, '#17171E');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 2;
      x.strokeRect(1, 1, 126, 126);
    } else if (tipo === 'vao') {
      var v = x.createLinearGradient(0, 0, 0, 128);
      v.addColorStop(0, COR.ac); v.addColorStop(0.55, 'rgba(0,0,0,0)'); v.addColorStop(1, COR.ac);
      x.fillStyle = v; x.fillRect(0, 0, 128, 128);
      x.globalAlpha = 0.5; x.fillStyle = COR.ac;
      x.fillRect(0, 0, 3, 128); x.fillRect(125, 0, 3, 128);
    } else {
      /* VIDRO, PARA MISTURA ADITIVA.
         A primeira versão desenhava o vidro como o CSS desenha — branco a 3%
         de alfa — e usava mistura normal. No render ficou literalmente
         invisível: alfa de textura vezes alfa de material dá quase zero, e o
         painel sumia no preto.

         Aditivo resolve os dois problemas de uma vez. Primeiro o visual: sobre
         preto, somar luz é exatamente o que vidro iluminado faz, e é a leitura
         das imagens de referência (painel escuro, aresta acesa). Segundo, o
         técnico: em mistura aditiva a ORDEM não importa, então dezenas de
         painéis transparentes se cruzando não produzem artefato de ordenação —
         o problema clássico de transparência em 3D desaparece de graça.

         Aqui o preto É o transparente: o miolo fica escuro e quem acende é a
         moldura e a aresta de baixo. */
      x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
      var d = x.createLinearGradient(0, 0, 128, 128);
      d.addColorStop(0, 'rgba(255,255,255,.13)');
      d.addColorStop(0.5, 'rgba(255,255,255,.02)');
      d.addColorStop(1, 'rgba(255,255,255,.09)');
      x.fillStyle = d; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(255,255,255,.62)'; x.lineWidth = 2.5;
      x.strokeRect(1.25, 1.25, 125.5, 125.5);
      var b = x.createLinearGradient(0, 108, 0, 128);
      b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(1, COR.ac);
      x.fillStyle = b; x.fillRect(0, 108, 128, 20);
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ========================================================================== */
  var THREE = null, renderer = null, cenas = [], pronto = false;
  var visiveis = 0;

  function montar(lib) {
    THREE = lib;

    var cv = document.createElement('canvas');
    cv.id = 'fx3';
    cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.body.firstChild);

    /* SEM ANTIALIAS, POR MEDIÇÃO.
       MSAA multiplica o trabalho de preenchimento, e preenchimento é
       exatamente o gargalo desta cena. Na medição ele custou os ~15 quadros
       que faltavam no celular — para suavizar arestas que aqui quase não
       existem: o material é luz difusa e moldura macia, não geometria dura com
       serrilhado visível. Trocar nitidez que ninguém vê por fluidez que todo
       mundo sente é a troca certa. */
    renderer = new THREE.WebGLRenderer({
      canvas: cv, alpha: true, antialias: false,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setScissorTest(true);

    var texturas = {
      vidro: fazerTextura(THREE, 'vidro'),
      pedra: fazerTextura(THREE, 'pedra'),
      vao:   fazerTextura(THREE, 'vao')
    };
    /* uma geometria para todos: o tamanho vem da escala de cada peça. Um
       PlaneGeometry compartilhado em vez de N geometrias é o tipo de economia
       que não aparece no olho e aparece na memória. */
    var plano = new THREE.PlaneGeometry(1, 1);

    for (var i = 0; i < alvos.length; i++) {
      var el = alvos[i];
      var spec = SPECS[el.getAttribute('data-cena')];
      if (!spec) continue;

      var cena = new THREE.Scene();
      var cam = new THREE.PerspectiveCamera(spec.camera.fov, 1, 0.1, 100);
      cam.position.z = spec.camera.z;

      var grupo = new THREE.Group();
      cena.add(grupo);

      var malhas = [];
      for (var j = 0; j < spec.pecas.length; j++) {
        var pc = spec.pecas[j];
        var tex = pc.pedra ? texturas.pedra : (pc.vao ? texturas.vao : texturas.vidro);
        var ehPedra = !!pc.pedra;
        var mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: !ehPedra,
          opacity: pc.alfa,
          /* a pedra escreve profundidade e OCLUI — é ela que dá volume ao
             portal. O vidro nunca escreve: some na ordenação e é aditivo. */
          depthWrite: ehPedra,
          side: THREE.DoubleSide,
          blending: ehPedra ? THREE.NormalBlending : THREE.AdditiveBlending
        });
        if (!ehPedra) {
          mat.color = pc.vao
            ? new THREE.Color(COR.ac)
            : new THREE.Color(COR.ac).lerp(new THREE.Color('#ffffff'), 0.62);
        }

        var m = new THREE.Mesh(plano, mat);
        m.position.set(pc.pos[0], pc.pos[1], pc.pos[2]);
        m.rotation.set(pc.rot[0], pc.rot[1], pc.rot[2]);
        m.scale.set(pc.tam[0], pc.tam[1], 1);
        m.renderOrder = -Math.round(pc.pos[2] * 10);
        m.userData = { base: pc.pos[1], deriva: pc.deriva || 0, fase: pc.fase || 0, alfa: pc.alfa };
        grupo.add(m);
        malhas.push(m);
      }

      cenas.push({ el: el, cena: cena, cam: cam, grupo: grupo, malhas: malhas,
                   spec: spec, visivel: false, r: null });
    }

    /* SÓ O QUE ESTÁ NA TELA CUSTA. Sem isto o site pagaria pelas três cenas o
       tempo todo, inclusive com o leitor a duas telas de distância. */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        for (var k = 0; k < ents.length; k++) {
          for (var c = 0; c < cenas.length; c++) {
            if (cenas[c].el !== ents[k].target) continue;
            if (cenas[c].visivel === ents[k].isIntersecting) continue;
            cenas[c].visivel = ents[k].isIntersecting;
            visiveis += ents[k].isIntersecting ? 1 : -1;
          }
        }
      }, { rootMargin: '120px' });
      for (var v = 0; v < cenas.length; v++) io.observe(cenas[v].el);
    } else {
      for (var w = 0; w < cenas.length; w++) { cenas[w].visivel = true; visiveis++; }
    }

    medirCaixas();
    window.addEventListener('scroll', function () { sujo = true; }, { passive: true });
    B.on('resize', function () { sujo = true; });
    B.on('regime', function () { relerCores(); });

    pronto = true;
    document.body.classList.add('tem-3d');
  }

  /* retângulos lidos só em scroll/resize — nunca por frame. Mesma disciplina
     de js/field.js, pelo mesmo motivo. */
  var sujo = true;
  function medirCaixas() {
    for (var i = 0; i < cenas.length; i++) {
      cenas[i].r = cenas[i].el.getBoundingClientRect();
    }
    sujo = false;
  }

  /* ---------- FLUIDEZ MEDIDA, EM DOIS ESTÁGIOS ----------
     A promessa desta reestruturação é que o site é suave. Então quem decide se
     o 3D fica não é a ficha técnica do aparelho — é o próprio site, medindo o
     que está acontecendo na tela.

     O critério é `S.fps` (js/core.js), a média móvel da taxa real de quadros,
     e não `S.budget`. O orçamento cai a cada engasgo momentâneo e tem piso de
     0,25; usá-lo como gatilho desligava a cena em situações em que a página
     estava a 60fps. fps é a pergunta certa porque é literalmente a pergunta
     que o dono faz: está suave?

     Dois estágios, porque desistir de cara é tão ruim quanto insistir:
       CHEIO   desenha todo frame
       METADE  desenha em frames alternados — corta ~metade do custo de
               preenchimento e quase não se percebe numa cena que gira devagar
       FORA    some, devolve a memória de GPU e não volta nesta visita

     Só desce de estágio, nunca sobe: ficar alternando entre ligado e desligado
     chamaria mais atenção que qualquer das duas pontas. E há uma janela de
     aquecimento antes de julgar — os primeiros quadros incluem compilação de
     shader e envio de textura, que ninguém deveria pagar duas vezes. */
  var AQUECE = 150;       /* quadros ignorados antes de qualquer julgamento */
  var LENTO = 46, BOM = 52;
  var estagio = 0, lentos = 0, aquecendo = AQUECE, desligado = false;

  function desligar() {
    if (desligado) return;
    desligado = true; pronto = false; estagio = 2;
    document.body.classList.remove('tem-3d');
    try {
      for (var i = 0; i < cenas.length; i++) {
        for (var j = 0; j < cenas[i].malhas.length; j++) cenas[i].malhas[j].material.dispose();
      }
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      if (B.PERF && window.console) console.info('[cena] 3D desligado por fps baixo');
    } catch (e) { /* já foi */ }
  }

  function julgar(S) {
    if (aquecendo > 0) { aquecendo--; return; }
    if (S.fps < LENTO) lentos++;
    else if (S.fps > BOM && lentos) lentos -= 2;
    if (lentos < 200) return;              /* ~3,5s de lentidão sustentada */
    lentos = 0;
    if (estagio === 0) { estagio = 1; aquecendo = AQUECE; }   /* tenta meio passo */
    else desligar();
  }

  /* ---------- o frame ---------- */
  var alt = 0;
  B.add('cena3d', function (S) {
    if (!pronto || !visiveis) return;
    julgar(S);
    if (desligado) return;

    /* esta camada é a PRIMEIRA a ceder, sempre: em estágio METADE, ou quando o
       orçamento do frame já está apertado, ela desenha em quadros alternados
       antes de qualquer coisa do site piscar. */
    if ((estagio === 1 || S.budget < 0.7) && (alt = 1 - alt)) return;
    if (sujo) medirCaixas();

    var h = S.h, w = S.w;
    /* RESOLUÇÃO INTERNA MENOR QUE A TELA — a alavanca que mais rende aqui.
       Esta cena é limitada por PREENCHIMENTO: uma dúzia de quadriláteros
       grandes, translúcidos e sobrepostos, e cada pixel é escrito várias
       vezes. O custo é proporcional à área em pixels, então desenhar a 62% da
       resolução e deixar o CSS esticar corta ~48% do trabalho.

       Isso seria inaceitável em texto ou interface, onde a nitidez é o
       produto. Aqui o conteúdo é luz difusa e aresta suave: o reescalonamento
       some no material. É a mesma lógica do teto de DPR que js/core.js já
       aplica ao canvas 2D, com a régua mais apertada porque 3D custa mais. */
    var dprCena = Math.min(S.dpr, B.fine ? 1.5 : 1.25) * 0.62;
    if (renderer.domElement.width !== Math.round(w * dprCena) ||
        renderer.domElement.height !== Math.round(h * dprCena)) {
      renderer.setPixelRatio(dprCena);
      renderer.setSize(w, h, false);
    }

    var t = S.now * 0.001;
    /* o organismo atravessa o 3D: o Pulso abre as peças, o Singular abre mais
       e aquece a cor junto com o resto do site. */
    var abre = 1 + S.pulse * 0.06 + S.singular * 0.12;
    var brilho = 1 + S.pulse * 0.5 + S.singular * 0.9;

    for (var i = 0; i < cenas.length; i++) {
      var c = cenas[i];
      if (!c.visivel || !c.r) continue;
      var r = c.r;
      if (r.bottom < 0 || r.top > h) continue;

      var x = Math.round(r.left), y = Math.round(h - r.bottom);
      var lw = Math.round(r.width), lh = Math.round(r.height);
      if (lw < 2 || lh < 2) continue;

      renderer.setViewport(x, y, lw, lh);
      renderer.setScissor(x, y, lw, lh);
      c.cam.aspect = lw / lh;
      c.cam.updateProjectionMatrix();

      if (c.spec.giro) c.grupo.rotation.y = t * c.spec.giro;
      /* paralaxe de ponteiro: a cena inteira inclina de leve em direção ao
         cursor. É o gesto que faz a profundidade ler como profundidade. */
      if (S.pointerOn) {
        var nx = (S.px / w - 0.5), ny = (S.py / h - 0.5);
        c.grupo.rotation.x += ((-ny * 0.16) - c.grupo.rotation.x) * 0.05;
        c.grupo.position.x += ((nx * 0.5) - c.grupo.position.x) * 0.05;
      }

      for (var j = 0; j < c.malhas.length; j++) {
        var m = c.malhas[j], u = m.userData;
        if (u.deriva) m.position.y = u.base + Math.sin(t * 0.5 + u.fase) * u.deriva * 0.32;
        m.material.opacity = Math.min(1, u.alfa * brilho);
      }
      c.grupo.scale.setScalar(abre);

      renderer.render(c.cena, c.cam);
    }
  });

  /* ---------- CARREGAMENTO TARDIO ----------
     O three só desce quando uma cena chega perto da viewport. Numa visita que
     nunca rola até lá, o custo desta camada é zero byte. */
  var pedido = false;
  function pedirLib() {
    if (pedido) return;
    pedido = true;
    /* CAMINHO RESOLVIDO CONTRA O DOCUMENTO, DE PROPÓSITO.
       Num script CLÁSSICO, `import()` resolve o caminho relativo contra a URL
       DO SCRIPT, não contra a página — então './vendor/…' daqui apontava para
       /js/vendor/… e o módulo dava 404 em silêncio, porque a falha cai no
       catch junto com todas as outras. Custou um ciclo inteiro de verificação
       para aparecer. Montar a URL a partir de `document.baseURI` tira a
       ambiguidade: é sempre relativo à página, como o resto dos caminhos do
       site. */
    var url = new URL('vendor/three/three.module.min.js', document.baseURI).href;
    import(url)
      .then(function (lib) {
        try { montar(lib); }
        catch (e) { if (B.PERF && window.console) console.warn('[cena] montagem falhou:', e && e.message); }
      })
      .catch(function (e) {
        /* sem 3D; o site continua inteiro. Com ?perf a falha aparece, senão
           uma próxima sessão perde tempo procurando um canvas que nunca subiu. */
        if (B.PERF && window.console) console.warn('[cena] 3D fora:', e && e.message);
      });
  }

  if ('IntersectionObserver' in window) {
    var gatilho = new IntersectionObserver(function (ents) {
      for (var i = 0; i < ents.length; i++) {
        if (ents[i].isIntersecting) { gatilho.disconnect(); pedirLib(); return; }
      }
    }, { rootMargin: '600px' });
    for (var g = 0; g < alvos.length; g++) gatilho.observe(alvos[g]);
  } else {
    pedirLib();
  }
})();
