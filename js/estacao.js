/* ==========================================================================
   AS ESTAÇÕES — um AI Core de tamanho médio NO CENTRO de um grupo de
   módulos, ligado a todos eles e ao reator principal (pedidos do dono,
   2026-10-03: "num local com muitos cards, um AI Core médio conectado a
   eles, transmitindo energia, que o mini possa turbinar" e "eles devem
   estar no centro dos cards, conectados a todos, com alguma menção de que
   estão conectados ao principal também"). Só no DESKTOP: no celular o
   grupo segue empilhado (o celular já está aprovado; análise no PLANO §20).

   - ONDE: no espaço do meio do grupo (.estacao-vao, css/cartoes.css: o
     grupo vira duas colunas com um corredor; o espaço é do HTML/CSS, então
     nada salta quando o JS chega).
   - A REDE DELA: uma espinha no corredor e um ramo até a borda de cada
     módulo, com nó; e o ALIMENTADOR, que sobe do topo dela até o horizonte
     da seção, com o rótulo "↑ AI CORE".
   - A CADEIA DA ENERGIA: a cada expiração do reator o pulso desce pelas
     réguas do instrumento (js/trilho.js), atravessa o horizonte da seção até
     o meio e DESCE PELO ALIMENTADOR até a estação; ela carrega e distribui um
     SURTO pelos ramos: a aresta de cima de cada módulo acende quando ele
     chega (.is-onda). Se o horizonte já passou do topo da tela, o pulso
     entra pelo alimentador do alto da tela.
   - O FLUXO (2026-10-04, dono: "quero que ele tenha conexão com os cards e
     mostre a energia fluindo dele para os cards, fazendo os cards terem
     efeitos a mais"): pacotes correm SEM PARAR pelos ramos até a PORTA de
     cada card (um conector na borda que dá para ela, .estacao-porta);
     cada chegada pisca a porta; a velocidade sobe com a carga, no turbo e
     no card sob o cursor, que vira o FOCO: o ramo dele fica branco, os
     pacotes dobram e a energia ATRAVESSA o card (.estacao-cruza, uma linha
     de luz da porta até a borda oposta). No surto da expiração todos os
     cards são atravessados.
   - CONECTADA (dono, 2026-10-04): quando o mini acopla e enche a carga, ele
     FICA conectado — só solta se a pessoa clicar de novo no núcleo da
     estação ou rolar a página — e os cards dela entram em SOBRECARGA
     (B.carga.sobrecarga, js/carga.js) com a estação em turbo contínuo.
   - O TURBO: carga cheia = surto rápido e duplo; os módulos acendem
     inteiros (.is-energia) e as cantoneiras da seção piscam. Quem enche: o
     MINI, que vem pelo corredor entre as fileiras, acopla acima dela e
     transfere energia (sozinho de vez em quando, ou quando você clica nela).
   - O CORPO (canvas próprio, acima das seções, como o do mini): o núcleo em
     PLASMA (js/plasma.js, a linguagem do reator), o aro de 6 partes, a
     ÓRBITA tracejada, o estator parado e a CARGA em 12 segmentos. Sob o
     cursor ela acelera e o núcleo olha para você.
   Só traço nítido de 1 px (o dono proíbe desfoque). Movimento reduzido: um
   quadro parado, sem surto. Leis do projeto: um rAF (B.add), layout lido só
   em evento, em posições de LAYOUT (offsetTop, que ignora transform).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  if (!B || !B.rede || !B.rede.trilho) return;

  var TAU = Math.PI * 2;
  var CORPO = 152, R = { nucleo: 9, vidro: 24, fora: 44, aroB: 34, orbita: [39, 11], estator: 45, carga: 55 };
  var SURTO = { v: 800, vTurbo: 1500, cabeca: 14, degraus: [[40, 0.5], [110, 0.2]], escalona: 0.07 };
  var ALIMENTA = { v: 900, carga: 0.22, cabeca: 24, rastro: 80 };   /* px/s; quanto carrega; px */
  var CARGA = { base: 0.35, folego: 0.1, cai: 0.09, enche: 2, teto: 3 };   /* /s; s para encher acoplada; s no máximo acoplada */
  var GIRO = { a: -0.9, b: 0.5, turbo: 4, sob: 1.8 };          /* rad/s */
  var MINI = { acima: 86 };                                     /* px: o mini acopla no corredor, acima dela */
  var ORBITA = [3, 3], SEM_TRACO = [];                          /* (sem alocar por quadro) */
  /* o fluxo: px/s base, + por carga, + no foco, + no turbo; distância entre pacotes; comprimento do pacote;
     intervalo mínimo entre piscadas da porta e entre travessias (s) */
  var FLUXO = { v: 70, carga: 90, foco: 260, turbo: 420, espaco: 64, rastro: 16, cabeca: 4, porta: 0.5, cruza: 1.1 };
  var ONDA_MS = 600, TURBO_MS = 1300;                           /* quanto o módulo fica aceso */
  /* a menção ao principal: legível parada (crítica: com 9 px cinza quase não se lia) */
  var ROTULO = { texto: '↑ AI CORE', fonte: '500 11px "JetBrains Mono", ui-monospace, monospace', alfa: 0.92 };

  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), T1 = '242,244,244';
  /* o núcleo em plasma, reaproveitado por quadro: DEPOIS das cores (antes delas saíam vazias e o núcleo, preto) */
  var PLASMA = { r: 0, vidro: 0, fora: 0, n: 7, ecos: 2, largura: 1.5, pressao: 0, estouro: 0, t: 0, alfa: 1, cores: { AC: AC, AC2: AC2, T1: T1 }, semente: 0 };
  var palco = document.querySelector('.mini-palco');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var estacoes = [], rolagem = window.scrollY, altura = window.innerHeight, ponteiro = { x: -1e4, y: -1e4 };
  var ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches, focado = null;

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }
  function cor(c, a) { return 'rgba(' + c + ',' + limitar(a).toFixed(3) + ')'; }
  /* entre o ciano e o branco (a rede acendendo no turbo) */
  var CA = AC.split(',').map(Number), CB = T1.split(',').map(Number);
  function misturaCor(k) { return Math.round(CA[0] + (CB[0] - CA[0]) * k) + ',' + Math.round(CA[1] + (CB[1] - CA[1]) * k) + ',' + Math.round(CA[2] + (CB[2] - CA[2]) * k); }
  /* posição de LAYOUT no documento (ignora o transform das entradas) */
  function posDoc(el) { var x = 0, y = 0; for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x: x, y: y }; }

  /* ---------- montagem: uma estação por grupo com o espaço do meio ---------- */
  function criarCanvas() {
    var cv = document.createElement('canvas');
    cv.className = 'estacao';
    cv.width = cv.height = Math.round(CORPO * dpr);
    cv.setAttribute('aria-hidden', 'true');
    (palco || document.body).appendChild(cv);
    return cv;
  }
  function remontar() {
    var grupos = B.rede.grupos(), antes = estacoes, i, k;
    estacoes = [];
    for (i = 0; i < grupos.length; i++) {
      var vao = grupos[i].pai.querySelector(':scope > .estacao-vao');
      if (!vao || !vao.offsetWidth) continue;
      var pv = posDoc(vao), cx = pv.x + vao.offsetWidth / 2, cy = pv.y + vao.offsetHeight / 2;
      var secao = grupos[i].pai.closest('section');
      /* os ramos: um por módulo, do corredor até a borda que dá para ele, na altura do meio dele */
      var raios = [], linhas = [];
      for (k = 0; k < grupos[i].itens.length; k++) {
        var it = grupos[i].itens[k], esq = it.dx + it.w / 2 < cx;
        var yb = it.dy + it.h / 2;
        raios.push({ el: it.el, xb: esq ? it.dx + it.w : it.dx, yb: yb, comp: Math.abs(yb - cy) + Math.abs((esq ? it.dx + it.w : it.dx) - cx), fase: 0, foco: 0, chegadas: 0, portaHa: 9, cruzaHa: 9 });
        prepararCard(it.el, esq ? 'd' : 'e');
        if (linhas.indexOf(it.dy) < 0) linhas.push(it.dy);
      }
      raios.sort(function (a, b) { return a.comp - b.comp; });
      /* os corredores entre fileiras (o caminho do mini até ela) */
      linhas.sort(function (a, b) { return a - b; });
      var corredores = [];
      for (k = 1; k < linhas.length; k++) {
        var fim = 0;
        for (var q = 0; q < grupos[i].itens.length; q++) { var iq = grupos[i].itens[q]; if (iq.dy === linhas[k - 1]) fim = Math.max(fim, iq.dy + iq.h); }
        if (linhas[k] - fim > 12) corredores.push((fim + linhas[k]) / 2);
      }
      /* a mesma estação continua o MESMO objeto ao remedir (o mini guarda a referência dela) */
      var st = antes[estacoes.length] || { cv: criarCanvas(), carga: CARGA.base, giroA: 0, giroB: 0, sob: 0, surtos: [], turboHa: 99, acopla: null, alim: null, pulso: 0, olhar: { x: 0, y: 0 } };
      /* a altura: com as linhas na altura natural, o meio do corredor não cai num ramo;
         ela vai para o ramo da linha do meio (número ímpar de linhas) ou para o vão
         entre as duas do meio (par) — onde os ramos ficam simétricos */
      var faixas = [];
      for (k = 0; k < linhas.length; k++) {
        var topo = linhas[k], base = 0;
        for (var q3 = 0; q3 < grupos[i].itens.length; q3++) { var i3 = grupos[i].itens[q3]; if (i3.dy === topo) base = Math.max(base, i3.dy + i3.h); }
        faixas.push([topo, base]);
      }
      var nl = faixas.length;
      if (nl % 2) cy = (faixas[(nl - 1) / 2][0] + faixas[(nl - 1) / 2][1]) / 2;
      else if (nl) cy = (faixas[nl / 2 - 1][1] + faixas[nl / 2][0]) / 2;
      for (k = 0; k < raios.length; k++) raios[k].comp = Math.abs(raios[k].yb - cy) + Math.abs(raios[k].xb - cx);
      raios.sort(function (a, b) { return a.comp - b.comp; });
      st.n = estacoes.length + 1; st.x = cx; st.yd = cy; st.vao = vao; st.raios = raios; st.corredores = corredores;
      st.secaoY = secao ? posDoc(secao).y : cy - 400; st.surtos.length = 0;
      vao.classList.add('is-viva');
      grupos[i].pai.classList.add('is-ligada');
      estacoes.push(st);
    }
    for (i = estacoes.length; i < antes.length; i++) {
      if (antes[i].acopla || antes[i].conectada) soltarEstacao(antes[i]);   /* (janela estreitou com ela conectada) */
      antes[i].cv.remove();
      if (antes[i].vao) { antes[i].vao.classList.remove('is-viva'); antes[i].vao.parentNode.classList.remove('is-ligada'); }
    }
    for (i = 0; i < estacoes.length; i++) ligarCanvas(estacoes[i]);
  }
  /* o card ganha a PORTA (o conector na borda que dá para a estação: d = direita)
     e a TRAVESSIA (a linha de luz que cruza o card); uma vez só; o cursor nele
     vira o foco da estação */
  function prepararCard(el, lado) {
    el.setAttribute('data-porta', lado);
    if (el.querySelector(':scope > .estacao-porta')) return;
    var porta = document.createElement('i');
    porta.className = 'estacao-porta';
    porta.setAttribute('aria-hidden', 'true');
    porta.appendChild(document.createElement('b'));
    var cruza = document.createElement('i');
    cruza.className = 'estacao-cruza';
    cruza.setAttribute('aria-hidden', 'true');
    el.appendChild(porta); el.appendChild(cruza);
    if (ponteiroFino) {
      el.addEventListener('pointerenter', function () { focado = el; el.classList.add('is-alimentado'); });
      el.addEventListener('pointerleave', function () { if (focado === el) focado = null; el.classList.remove('is-alimentado'); });
    }
  }
  /* reinicia uma animação de CSS sem ler layout: alterna entre duas classes iguais */
  function bater(el, base) {
    var a = el.classList.contains('is-' + base + '-a');
    el.classList.remove('is-' + base + (a ? '-a' : '-b'));
    el.classList.add('is-' + base + (a ? '-b' : '-a'));
  }
  function ligarCanvas(st) {
    if (st.cv.dataset.ligado) return;
    st.cv.dataset.ligado = '1';
    st.cv.addEventListener('pointerenter', function () { st.sobAlvo = true; });
    st.cv.addEventListener('pointerleave', function () { st.sobAlvo = false; });
    st.cv.addEventListener('click', function () { if (!B.reduced) chamar(st); });
  }

  /* ---------- a energia ---------- */
  /* um surto pelos ramos: uma frente por módulo, dos mais perto aos mais longe */
  function surto(st, turbo) {
    var v = turbo ? SURTO.vTurbo : SURTO.v;
    for (var i = 0; i < st.raios.length; i++) {
      st.surtos.push({ raio: st.raios[i], s: -i * SURTO.escalona * v, turbo: !!turbo, aceso: false });
      if (turbo) st.surtos.push({ raio: st.raios[i], s: -(i * SURTO.escalona + 0.18) * v, turbo: true, aceso: true });
    }
  }
  /* o módulo responde (classe por evento; nada de CSS mudando por quadro): o canvas do
     fundo fica atrás do módulo opaco, então quem mostra a chegada é o próprio módulo */
  function energizar(el, turbo) {
    var classe = turbo ? 'is-energia' : 'is-onda';
    bater(el, 'cruza');
    el.classList.add(classe);
    clearTimeout(el['_' + classe]);
    el['_' + classe] = setTimeout(function () { el.classList.remove(classe); }, turbo ? TURBO_MS : ONDA_MS);
    /* no turbo, o traço que percorre a borda uma vez (css/cartoes.css: quatro lados) */
    if (turbo && !el.querySelector(':scope > .energia-volta')) {
      var volta = document.createElement('i');
      volta.className = 'energia-volta';
      volta.setAttribute('aria-hidden', 'true');
      for (var lado = 0; lado < 4; lado++) volta.appendChild(document.createElement('b'));
      el.appendChild(volta);
      setTimeout(function () { volta.remove(); }, TURBO_MS);
    }
  }
  function sobrecarregar(st, sim) {
    if (!B.carga) return;
    for (var i = 0; i < st.raios.length; i++) B.carga.sobrecarga(st.raios[i].el, sim);
  }
  function turbinar(st) { st.carga = 1; st.turboHa = 0; st.pulso = 1; surto(st, true); B.rede.trilho.piscar(); }
  /* o pulso do reator entra pelo alimentador (de `de`, y do documento, até a estação) */
  function alimentar(st, de) { if (!B.reduced && !st.alim) st.alim = { s: 0, de: Math.max(st.secaoY, de || st.secaoY) }; }
  function soltarEstacao(st) {
    st.acopla = null;
    if (st.conectada) { st.conectada = false; sobrecarregar(st, false); }
  }
  /* o mini vem (se estiver ativo); sem ele, ela turbina sozinha */
  function chamar(st) {
    var mini = B.rede.extra;
    /* conectada (ou carregando): o clique no núcleo desconecta o mini */
    if (st.acopla) { if (mini && mini.liberar) mini.liberar(st); else soltarEstacao(st); return; }
    if (mini && mini.ativo && mini.irPara) mini.irPara(st);
    else turbinar(st);
  }

  /* ---------- por quadro ---------- */
  function passo(dt) {
    if (!estacoes.length) return;
    var t = B.relogio(), F = B.FOLEGO;
    var x = ((t / F.periodo) % 1 + 1) % 1;
    var folego = x < F.inspira ? suave(x / F.inspira) : 1 - suave((x - F.inspira) / (1 - F.inspira));
    for (var i = 0; i < estacoes.length; i++) {
      var st = estacoes[i], sy = st.yd - rolagem;
      st.turboHa += dt;
      if (B.reduced) { st.surtos.length = 0; st.acopla = null; st.alim = null; continue; }
      /* a carga respira em volta da base; o alimentador e o mini a sobem */
      st.carga += (CARGA.base + CARGA.folego * folego - st.carga) * Math.min(1, dt * CARGA.cai);
      if (st.acopla) {
        st.acopla.t += dt;
        if (!st.conectada) {
          st.carga = Math.min(1, st.carga + dt / CARGA.enche);
          if (st.acopla.t > CARGA.teto) st.carga = 1;   /* rede de segurança: nunca passa do teto */
          if (st.carga >= 1) { st.conectada = true; turbinar(st); sobrecarregar(st, true); }
        } else {
          /* conectada: carga cheia e turbo contínuo (a rede branca, os pacotes rápidos) */
          st.carga = 1; st.turboHa = Math.min(st.turboHa, 0.4);
        }
      }
      if (st.alim) {
        st.alim.s += dt * ALIMENTA.v;
        if (st.alim.de + st.alim.s >= st.yd - R.carga) {
          st.alim = null; st.carga = Math.min(0.97, st.carga + ALIMENTA.carga); st.pulso = Math.max(st.pulso, 0.6); surto(st, false);
        }
      }
      st.pulso = Math.max(0, st.pulso - dt * 1.6);
      st.sob += ((st.sobAlvo ? 1 : 0) - st.sob) * Math.min(1, dt * 6);
      var turbo = Math.max(0, 1 - st.turboHa / 2.5);
      st.giroA += dt * GIRO.a * (1 + GIRO.turbo * turbo + GIRO.sob * st.sob);
      st.giroB += dt * GIRO.b * (1 + GIRO.turbo * turbo + GIRO.sob * st.sob);
      /* o núcleo olha para o cursor quando ele está perto */
      var dx = ponteiro.x - st.x, dy = ponteiro.y - sy, d = Math.hypot(dx, dy) || 1, perto = d < 260 ? 1 : 0;
      st.olhar.x += ((perto ? dx / d : 0) - st.olhar.x) * Math.min(1, dt * 5);
      st.olhar.y += ((perto ? dy / d : 0) - st.olhar.y) * Math.min(1, dt * 5);
      /* o fluxo: cada ramo anda na sua velocidade; um pacote chega à porta a cada `espaco` px */
      for (var r = 0; r < st.raios.length; r++) {
        var ra = st.raios[r];
        ra.foco += ((ra.el === focado ? 1 : 0) - ra.foco) * Math.min(1, dt * 5);
        ra.fase += dt * (FLUXO.v + FLUXO.carga * st.carga + FLUXO.foco * ra.foco + FLUXO.turbo * turbo);
        ra.portaHa += dt; ra.cruzaHa += dt;
        var chegadas = Math.floor(ra.fase / (ra.foco > 0.5 ? FLUXO.espaco / 2 : FLUXO.espaco));
        if (chegadas !== ra.chegadas) {
          ra.chegadas = chegadas;
          if (sy > -200 && sy < altura + 200) {
            if (ra.portaHa > FLUXO.porta * (1 - 0.6 * ra.foco)) { ra.portaHa = 0; bater(ra.el, 'porta'); }
            if (ra.foco > 0.5 && ra.cruzaHa > FLUXO.cruza) { ra.cruzaHa = 0; bater(ra.el, 'cruza'); }
          }
        }
      }
      for (var k = st.surtos.length - 1; k >= 0; k--) {
        var su = st.surtos[k];
        su.s += dt * (su.turbo ? SURTO.vTurbo : SURTO.v);
        if (!su.aceso && su.s >= su.raio.comp) { su.aceso = true; B.rede.acender(su.raio.el, su.turbo); energizar(su.raio.el, su.turbo); }
        if (su.s - SURTO.degraus[1][0] > su.raio.comp) st.surtos.splice(k, 1);
      }
    }
  }

  /* ---------- desenho no canvas do fundo (atrás do texto) ---------- */
  function caminho(ctx, st, ra, sy, s0, s1) {
    /* o caminho do ramo: do centro pela espinha até a altura do módulo, e pela horizontal até a borda (sem alocar) */
    var yb = ra.yb - rolagem, h = Math.abs(yb - sy), sg = yb > sy ? 1 : -1, sx = ra.xb > st.x ? 1 : -1;
    if (s0 <= h) ctx.moveTo(st.x, sy + sg * s0); else ctx.moveTo(st.x + sx * (s0 - h), yb);
    if (s0 < h && s1 > h) ctx.lineTo(st.x, yb);
    if (s1 <= h) ctx.lineTo(st.x, sy + sg * s1); else ctx.lineTo(st.x + sx * (s1 - h), yb);
  }
  function desenharFundo(ctx) {
    if (!estacoes.length) return;
    var g = B.rede.trilho.geo(), livre = B.rede.naZona ? function (x, y) { return !B.rede.naZona(x, y); } : null;
    for (var i = 0; i < estacoes.length; i++) {
      var st = estacoes[i], sy = st.yd - rolagem, j, ra;
      var topoS = st.secaoY - rolagem;
      if (sy < -400 || sy > altura + 400) continue;
      /* a rede dela: a espinha, os ramos e o nó na borda de cada módulo (acende inteira no turbo) */
      var tb = B.reduced ? 0 : Math.max(0, 1 - st.turboHa / 2.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = tb > 0.01 ? 'rgba(' + misturaCor(suave((tb - 0.3) / 0.4)) + ',' + limitar(0.45 + 0.45 * tb).toFixed(3) + ')' : cor(AC, 0.45);
      ctx.beginPath();
      for (j = 0; j < st.raios.length; j++) { ra = st.raios[j]; caminho(ctx, st, ra, sy, R.carga + 2, ra.comp); }
      ctx.stroke();
      /* o ramo do card sob o cursor: branco por cima */
      for (j = 0; j < st.raios.length; j++) {
        ra = st.raios[j];
        if (ra.foco < 0.02) continue;
        ctx.strokeStyle = cor(T1, 0.7 * ra.foco);
        ctx.beginPath(); caminho(ctx, st, ra, sy, R.carga + 2, ra.comp); ctx.stroke();
      }
      /* o encaixe na borda do card: um colchete aberto para o ramo */
      ctx.strokeStyle = cor(AC2, 0.8);
      ctx.beginPath();
      for (j = 0; j < st.raios.length; j++) {
        ra = st.raios[j];
        var yb = ra.yb - rolagem, sx = ra.xb > st.x ? 1 : -1;
        ctx.moveTo(ra.xb - sx * 7, yb - 6); ctx.lineTo(ra.xb - sx * 3, yb - 6); ctx.lineTo(ra.xb - sx * 3, yb + 6); ctx.lineTo(ra.xb - sx * 7, yb + 6);
      }
      ctx.stroke();
      /* os pacotes: correm da estação até a porta, sem parar; cada um é um rastro
         ciano com a cabeça branca (no foco o fluxo dobra: um a cada meio espaço) */
      if (!B.reduced) {
        for (var pas = 0; pas < 2; pas++) {
          ctx.lineWidth = pas ? 2 : 1.5;
          for (j = 0; j < st.raios.length; j++) {
            ra = st.raios[j];
            var fim = ra.comp - 4, ini = R.carga + 2, entre = ra.foco > 0.5 ? FLUXO.espaco / 2 : FLUXO.espaco, off = ra.fase % entre;
            var tam = pas ? FLUXO.cabeca : FLUXO.rastro;
            ctx.strokeStyle = pas ? cor(T1, 0.95) : cor(AC2, 0.5 + 0.3 * ra.foco);
            ctx.beginPath();
            for (var sp = ini + off; sp < fim; sp += entre) caminho(ctx, st, ra, sy, Math.max(ini, sp - tam), sp);
            ctx.stroke();
          }
        }
        ctx.lineWidth = 1;
      }
      /* o alimentador: do horizonte da seção até ela, CONTÍNUO, com o rótulo e um
         mini-símbolo do reator (anel, 12 marcas, núcleo): a ligação ao principal parada */
      var a0 = Math.max(topoS, g.topo), a1 = sy - R.carga - 4;
      if (a1 > a0) {
        ctx.strokeStyle = cor(AC2, 0.42);
        ctx.beginPath(); ctx.moveTo(st.x, a0); ctx.lineTo(st.x, a1); ctx.stroke();
        var ry = topoS + 24;
        if (ry > g.topo + 10 && ry < a1 - 10 && (!livre || livre(st.x + 60, ry))) {
          simbolo(ctx, st.x + 16, ry);
          ctx.font = ROTULO.fonte; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          ctx.fillStyle = cor(AC2, ROTULO.alfa);
          ctx.fillText(ROTULO.texto, st.x + 28, ry);
        }
      }
      /* o SOQUETE do mini, no alimentador acima dela (onde ele encaixa para
         turbinar): tracejado vazio; cheio e branco com ele acoplado */
      var ys = sy - MINI.acima, acop = !!st.acopla && !B.reduced;
      if (ys > g.topo + 18) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = cor(acop ? T1 : AC, acop ? 0.9 : 0.55);
        if (!acop) ctx.setLineDash(ORBITA);
        ctx.beginPath(); ctx.arc(st.x, ys, 15, 0, TAU); ctx.stroke();
        ctx.setLineDash(SEM_TRACO);
        ctx.strokeStyle = cor(AC, acop ? 0.8 : 0.4);
        ctx.beginPath(); ctx.arc(st.x, ys, 7, 0, TAU); ctx.stroke();
      }
      if (B.reduced) continue;
      /* o pulso descendo pelo alimentador */
      if (st.alim) {
        var yh = st.alim.de + st.alim.s - rolagem;
        ctx.strokeStyle = cor(T1, 0.95); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(st.x, Math.max(g.topo, yh - ALIMENTA.cabeca)); ctx.lineTo(st.x, yh); ctx.stroke();
        ctx.strokeStyle = cor(AC2, 0.4); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(st.x, Math.max(g.topo, yh - ALIMENTA.rastro)); ctx.lineTo(st.x, Math.max(g.topo, yh - ALIMENTA.cabeca)); ctx.stroke();
      }
      /* os surtos pelos ramos */
      for (j = 0; j < st.surtos.length; j++) desenharSurto(ctx, st, st.surtos[j], sy);
      /* a transferência do mini acoplado: o trecho até ela aceso e pacotes descendo */
      var mini = B.rede.extra;
      if (st.acopla && mini) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = cor(AC2, 0.6);
        ctx.beginPath(); ctx.moveTo(mini.x, mini.y); ctx.lineTo(st.x, sy - R.carga); ctx.stroke();
        var L = Math.hypot(st.x - mini.x, sy - R.carga - mini.y) || 1, ux = (st.x - mini.x) / L, uy = (sy - R.carga - mini.y) / L;
        ctx.strokeStyle = cor(T1, 0.95); ctx.lineWidth = 1.6;
        for (var p = 0; p < 3; p++) {
          var at = ((st.acopla.t * 2.2 + p / 3) % 1) * L;
          ctx.beginPath(); ctx.moveTo(mini.x + ux * at, mini.y + uy * at); ctx.lineTo(mini.x + ux * Math.min(L, at + 7), mini.y + uy * Math.min(L, at + 7)); ctx.stroke();
        }
        ctx.lineWidth = 1;
      }
    }
  }
  /* o mini-símbolo do reator ao lado do rótulo: anel de 5 px, 12 marcas e o núcleo */
  function simbolo(ctx, x, y) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = cor(AC2, 0.75);
    ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU);
    for (var k = 0; k < 12; k++) { var a = k * TAU / 12; ctx.moveTo(x + Math.cos(a) * 6.5, y + Math.sin(a) * 6.5); ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); }
    ctx.stroke();
    ctx.fillStyle = cor(T1, 0.95);
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
  }
  function desenharSurto(ctx, st, su, sy) {
    if (su.s <= 0) return;
    var fim = su.raio.comp, forca = su.turbo ? 1 : 0.75, de = Math.min(su.s, fim);
    for (var d = -1; d < SURTO.degraus.length; d++) {
      var ate = d < 0 ? SURTO.cabeca : SURTO.degraus[d][0], a = (d < 0 ? 0.95 : SURTO.degraus[d][1]) * forca;
      var s0 = Math.max(R.carga + 2, su.s - ate), s1 = de;
      de = Math.min(de, s0);
      if (s1 <= s0) continue;
      ctx.lineWidth = d < 0 ? (su.turbo ? 1.8 : 1.4) : 1;
      ctx.strokeStyle = cor(d < 0 ? (su.turbo ? T1 : AC2) : AC, a);
      ctx.beginPath(); caminho(ctx, st, su.raio, sy, s0, s1); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  /* ---------- o corpo, no canvas dele ---------- */
  function pintar() {
    if (!estacoes.length) return;
    var g = B.rede.trilho.geo(), t = B.relogio(), F = B.FOLEGO;
    var x = ((t / F.periodo) % 1 + 1) % 1, folego = B.reduced ? 1 : x < F.inspira ? suave(x / F.inspira) : 1 - suave((x - F.inspira) / (1 - F.inspira));
    var menu = document.body.classList.contains('is-menu');
    for (var i = 0; i < estacoes.length; i++) {
      var st = estacoes[i], sy = st.yd - rolagem, cv = st.cv;
      var naTela = !menu && sy > g.topo + R.carga && sy < altura - R.carga;
      if (naTela !== st.visivel) { cv.style.opacity = naTela ? '1' : '0'; cv.style.pointerEvents = naTela ? 'auto' : 'none'; st.visivel = naTela; }
      if (!naTela) continue;
      cv.style.transform = 'translate3d(' + (st.x - B.S.sx - CORPO / 2).toFixed(1) + 'px,' + (sy - CORPO / 2).toFixed(1) + 'px,0)';
      desenharCorpo(cv.getContext('2d'), st, folego);
    }
  }
  function desenharCorpo(c, st, folego) {
    var m = CORPO / 2, turbo = B.reduced ? 0 : Math.max(0, 1 - st.turboHa / 2.5), j;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, CORPO, CORPO);
    c.lineWidth = 1;
    /* o estator: anel e 12 marcas, parado */
    c.strokeStyle = cor(AC, 0.32 + 0.2 * st.sob);
    c.beginPath(); c.arc(m, m, R.estator, 0, TAU);
    for (j = 0; j < 12; j++) {
      var a = j * TAU / 12 - Math.PI / 2, l = j % 3 ? 3 : 5;
      c.moveTo(m + Math.cos(a) * R.estator, m + Math.sin(a) * R.estator); c.lineTo(m + Math.cos(a) * (R.estator + l), m + Math.sin(a) * (R.estator + l));
    }
    c.stroke();
    /* a carga em 12 segmentos de 2 px (casam com as marcas do estator), do topo no sentido horário */
    var cheios = Math.floor(limitar(st.carga) * 12 + 0.001), cheia = st.carga > 0.97;
    c.lineWidth = 2;
    for (var pas = 0; pas < 2; pas++) {
      c.strokeStyle = pas ? cor(cheia ? T1 : AC2, 0.85) : cor(AC, 0.13);
      c.beginPath();
      for (j = 0; j < 12; j++) {
        if ((j < cheios) !== !!pas) continue;
        var s0 = -Math.PI / 2 + j * TAU / 12 + 0.06, s1 = s0 + TAU / 12 - 0.12;
        c.moveTo(m + Math.cos(s0) * R.carga, m + Math.sin(s0) * R.carga); c.arc(m, m, R.carga, s0, s1);
      }
      c.stroke();
    }
    c.lineWidth = 1;
    /* a órbita tracejada, achatada (a marca da família); a metade de cima, a de trás, mais fraca */
    c.setLineDash(ORBITA);
    c.lineDashOffset = -st.giroA * 6;
    c.strokeStyle = cor(AC2, 0.3);
    var inclina = -0.45 + 0.12 * Math.sin(st.giroB * 0.4);   /* ~25° e balançando: deitada lia como olho */
    c.beginPath(); c.ellipse(m, m, R.orbita[0], R.orbita[1], inclina, Math.PI, TAU); c.stroke();
    c.strokeStyle = cor(AC2, 0.7);
    c.beginPath(); c.ellipse(m, m, R.orbita[0], R.orbita[1], inclina, 0, Math.PI); c.stroke();
    c.setLineDash(SEM_TRACO);
    c.lineDashOffset = 0;
    /* o vidro: o anel onde os fios do plasma batem */
    c.strokeStyle = cor(AC2, 0.45);
    c.beginPath(); c.arc(m, m, R.vidro, 0, TAU); c.stroke();
    /* o aro de 6 partes, girando */
    c.strokeStyle = cor(AC, 0.55);
    c.beginPath();
    for (j = 0; j < 6; j++) { var b0 = st.giroB + j * TAU / 6; c.moveTo(m + Math.cos(b0) * R.aroB, m + Math.sin(b0) * R.aroB); c.arc(m, m, R.aroB, b0, b0 + 0.5); }
    c.stroke();
    /* o núcleo em plasma, olhando para o cursor; rompe o vidro no turbo, quando o alimentador chega e acoplada */
    if (B.plasma) {
      PLASMA.r = R.nucleo * (1 + 0.12 * folego + 0.25 * turbo); PLASMA.vidro = R.vidro; PLASMA.fora = R.fora;
      PLASMA.pressao = 0.3 + 0.4 * folego + 0.7 * st.sob + 0.4 * st.carga;
      PLASMA.estouro = B.reduced ? 0 : Math.max(turbo, st.pulso, st.acopla ? 0.4 : 0);
      PLASMA.t = B.reduced ? 0 : st.giroA * -1.1; PLASMA.alfa = 1; PLASMA.semente = st.n * 5;
      B.plasma.desenhar(c, m + st.olhar.x * 2, m + st.olhar.y * 2, PLASMA);
    }
    /* o turbo: um anel que abre para fora do estator e some */
    if (turbo > 0.01) {
      var k = 1 - turbo;
      c.strokeStyle = cor(T1, 0.8 * turbo);
      c.beginPath(); c.arc(m, m, R.estator + 4 + 14 * (1 - (1 - k) * (1 - k)), 0, TAU); c.stroke();
    }
  }

  /* ---------- de fora ---------- */
  B.estacoes = {
    /* a estação na tela mais perto de (x, y), ou null */
    naTela: function (x, y) {
      var g = B.rede.trilho.geo(), melhor = null, dm = 1e9;
      for (var i = 0; i < estacoes.length; i++) {
        var sy = estacoes[i].yd - rolagem;
        if (sy < g.topo + 80 || sy > altura - 120) continue;
        var d = Math.abs(sy - y);
        if (d < dm) { dm = d; melhor = estacoes[i]; }
      }
      return melhor;
    },
    /* o caminho do mini até ela (documento): pela régua até o corredor mais perto, pelo
       corredor até o eixo dela; [] sem corredor */
    via: function (st, xDe) {
      if (!st.corredores.length) return [];
      var c = st.corredores[0];
      for (var i = 1; i < st.corredores.length; i++) if (Math.abs(st.corredores[i] - st.yd) < Math.abs(c - st.yd)) c = st.corredores[i];
      return [{ x: xDe, py: c }, { x: st.x - B.S.sx, py: c }];
    },
    /* onde o mini fica acoplado (tela): no corredor, acima dela */
    doca: function (st) { return { x: st.x - B.S.sx, y: st.yd - rolagem - MINI.acima }; },
    acoplar: function (st) { if (!B.reduced && !st.acopla) st.acopla = { t: 0 }; },
    soltar: function (st) { soltarEstacao(st); },
    podeTurbinar: function (st) { return st.turboHa > 20 && !st.acopla; },
    turbinando: function (st) { return !!st.acopla; },
    /* só leitura, para os testes: o que cada estação está fazendo */
    estado: function () { return estacoes.map(function (st) { return { carga: +st.carga.toFixed(2), acoplada: !!st.acopla, conectada: !!st.conectada, alimentando: !!st.alim, turboHa: +st.turboHa.toFixed(1), surtos: st.surtos.length, visivel: !!st.visivel }; }); }
  };

  B.rede.fundos.push({ desenharFundo: desenharFundo });
  B.on('rede:medida', remontar);
  /* a cadeia: o pulso do reator atravessou o horizonte desta seção até o meio */
  B.on('trilho:meio', function (yd) { for (var i = 0; i < estacoes.length; i++) if (Math.abs(estacoes[i].secaoY - yd) < 4) alimentar(estacoes[i]); });
  /* ...ou o horizonte já passou do topo da tela: o pulso entra pelo alimentador do alto */
  B.on('trilho:onda', function () {
    var g = B.rede.trilho.geo();
    for (var i = 0; i < estacoes.length; i++) {
      var st = estacoes[i], sy = st.yd - rolagem;
      if (st.secaoY - rolagem < g.topo && sy > g.topo && sy < altura) alimentar(st, g.topo + rolagem);
    }
  });
  window.addEventListener('scroll', function () { rolagem = window.scrollY; }, { passive: true });
  window.addEventListener('resize', function () { altura = window.innerHeight; }, { passive: true });
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('pointermove', function (e) { ponteiro.x = e.clientX; ponteiro.y = e.clientY; }, { passive: true });
  }
  remontar();
  B.add('estacao', function (S) { passo(Math.min(0.05, S.dt / 1000)); pintar(); });
})();
