/* ==========================================================================
   A REDE — o fundo vivo do site inteiro (pedido do dono, 2026-10-02: "um
   fundo animado, com feixes que se conectam, interagem entre si e com
   todos os elementos do site, parecido com o antigo porém melhor").

   Um canvas 2D fixo atrás do conteúdo (o reator do hero continua sendo o
   único WebGL). Quem é nó:
   - os NÓS livres, em três profundidades (paralaxe na rolagem), derivando
     devagar num campo de fluxo;
   - os CANTOS dos elementos do site (cartões, botões, títulos): os feixes
     se prendem a eles como circuito (um quadradinho marca o encaixe); o
     ponteiro sobre um elemento, ou o elemento chegando ao centro da tela no
     celular, acende os cantos e dispara sinais pela rede;
   - o PONTEIRO (desktop);
   - no Hub, a CONSTELAÇÃO do reator (módulo js/rede-reator.js, só no Hub):
     duas órbitas de 12 nós alinhadas aos raios, presas aos 12 pontos de
     entrada do portal; a cada fôlego a onda corre até o portal;
   - o MINI AI CORE (js/mini.js), por B.rede.extra.

   A LEITURA manda: a rede é apagada atrás de todo bloco de texto (caixa +
   10 px) e nunca cruza a face do reator (crítica, rodada 1: pontos dentro
   das letras liam como acentos).

   Leis (docs/HANDOFF.md §4): nada contínuo passa pelo CSS; layout lido só
   em evento (carga, resize, mudança de tamanho do documento), em posições
   de LAYOUT (offset, imunes às entradas por transform); um rAF só (B.add).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  var cv = document.querySelector('[data-rede]');
  if (!B || !cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  if (window.navigator.connection && navigator.connection.saveData) return;

  var TAU = Math.PI * 2;
  var celular = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  var ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- a paleta (os tokens, lidos uma vez) ---------- */
  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), AC3 = rgb('--ac-3-rgb', '28 181 185'), PRATA = rgb('--prata-rgb', '183 191 192');

  /* ---------- números ---------- */
  var DENSIDADE = celular ? (window.innerWidth < 360 ? 16000 : 12000) : 10500;   /* px² por nó livre (abaixo de 360 px, menos: a tela é estreita) */
  var ALCANCE = celular ? 120 : 165;          /* px: até onde dois nós se ligam */
  var FAIXAS = 8, ALFA_MIN = 0.045, ALFA_MAX = 0.36;   /* a força do feixe em 8 faixas (um traço por faixa) */
  var PARALAXE = [0.12, 0.3, 0.5];            /* o quanto cada profundidade anda com a rolagem */
  var MAX_SINAIS = celular ? 10 : 18;         /* os sinais soltos; as ondas do reator não contam */
  var SALTO = 0.62;                           /* chance de um sinal seguir para o próximo feixe */
  var VEL = 260;                              /* px/s de um sinal */
  /* as conversas (crítica, rodada 3: fora do hero a rede não conversava):
     uma no começo do expirar e outra, metade das vezes, no meio dele */
  var RASTRO = 0.45;                          /* s que um trecho da conversa fica aceso depois que o sinal passa */
  var SELETOR = '.painel, .btn, .console, .janela, .instrumento, .passo, .prova__item, .qa, .spec__item, .cenario, .celula, .hero__rail, .footer';
  var ATIVOS = '.painel, .btn, .passo, .prova__item, .qa, .spec__item, .cenario, .celula';
  /* as zonas sem rede (texto, miolo de cartões, dados, halos): js/rede-texto.js */
  var BORDA = 12;                            /* px: a rede some nas bordas da tela (não vira poeira) */
  /* ligações por nó livre: as MAX_GRAU mais próximas (a escolha pela ordem da
     grade trocava ligações de uma vez; a última entra suave pela folga até a
     seguinte). Mais que isso a rede fecha em teia nos cantos vazios */
  var MAX_GRAU = 4, FOLGA_GRAU = 24;
  var MAX_MINI = celular ? 1 : 2;             /* ligações no mini: mais que isso ele parecia "plugado" */
  /* o TRILHO (celular): uma linha tracejada de nós na margem direita, em
     coordenadas da página, por onde as conversas também correm. Em telas de
     texto denso a proteção do texto ocupava a margem inteira e a rede morria
     (crítica, rodada 7); o trilho mora fora da coluna. Só à direita: à
     esquerda os pontos leriam como marcadores de lista */
  var TRILHO = celular, trilho = [];
  /* o eixo do trilho é o do mini (ele é a conta que corre no fio, crítica
     rodada 8); cada nó desvia ±3 px (fixo por semente) para não ler como a
     barra de rolagem do celular */
  var TRILHO_BORDA = window.innerWidth < 360 ? 12 : 14, TRILHO_ZIGUE = 3, TRILHO_VAO = 24;
  var ligT = [];   /* 1: ligação do trilho (desenhada depois da borracha, porque mora na margem) */

  var dpr = 1, W = 0, H = 0, docH = 1, navH = 0, rodapeY = 1e9;
  var nos = [], ancoras = [], elementos = [], textos = [];
  var sinais = [], rastros = [];
  var ponteiro = { x: -1e4, y: -1e4, ativo: false, a: 0, tipo: 4, k: 1 };
  var rolagem = window.scrollY, rolagemAntes = rolagem;
  var sujo = true, parado = !!B.reduced, desenhouParado = false;
  var pontos = [], ligA = [], ligB = [], ligF = [], nLig = 0, assinatura = '';
  var proxSinal = 0, faseAntes = 0, folego = 0, faseConversa = 0;

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }
  function acaso(a, b) { return a + Math.random() * (b - a); }
  function faseDoFolego(t) { var F = B.FOLEGO; return ((t / F.periodo) % 1 + 1) % 1; }

  /* ---------- os nós livres (e a constelação herdada da página anterior) ---------- */
  var herdada = null;
  try {
    var guardada = JSON.parse(sessionStorage.getItem('bz-rede') || 'null');
    if (guardada && Date.now() - guardada.quando < 4000 && guardada.nos && guardada.nos.length) herdada = guardada.nos;
  } catch (e) { /* sem armazenamento: semeia do zero */ }
  window.addEventListener('pagehide', function () {
    try {
      var lista = [];
      for (var i = 0; i < nos.length; i++) lista.push([+(nos[i].x / W).toFixed(4), +(nos[i].y / H).toFixed(4), nos[i].z, +nos[i].fase.toFixed(3)]);
      sessionStorage.setItem('bz-rede', JSON.stringify({ quando: Date.now(), nos: lista }));
    } catch (e) { /* idem */ }
  });
  function quantosNos() { return Math.max(18, Math.min(96, Math.round((W * H) / DENSIDADE))); }
  function semear() {
    var n = quantosNos();
    nos.length = 0;
    if (herdada) {
      for (var h = 0; h < herdada.length && h < n; h++) {
        var v = herdada[h];
        nos.push({ x: v[0] * W, y: v[1] * H, z: v[2], k: 0.55 + v[2] * 0.22, fase: v[3], tipo: 0, apaga: 1 });
      }
      herdada = null;
    }
    for (var i = nos.length; i < n; i++) {
      var z = i % 3;
      nos.push({ x: acaso(0, W), y: acaso(0, H), z: z, k: 0.55 + z * 0.22, fase: acaso(0, TAU), tipo: 0, apaga: 1 });
    }
  }

  /* ---------- o documento: elementos e textos em posições de LAYOUT ---------- */
  function posicaoDoc(el) {
    var x = 0, y = 0, ultimo = el;
    for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; ultimo = e; }
    /* a cadeia terminou num elemento FIXO (o palco pinado pelo GSAP): a conta
       deu posição na tela; a natural na página é a da tela mais o começo do pin */
    if (ultimo !== document.body && getComputedStyle(ultimo).position === 'fixed') y += B.pino && B.pino.el.contains(ultimo) ? B.pino.inicio : window.scrollY;
    return { x: x, y: y };
  }
  /* quem fica parado na tela enquanto a página rola: os títulos fixos
     (sticky) e o palco pinado. d = o deslocamento deste quadro */
  var grudes = [];   /* medidos por js/rede-texto.js (B.redeTexto.grudes) */
  function refDe(el) { for (var i = 0; i < grudes.length; i++) if (grudes[i].el.contains(el)) return grudes[i]; return null; }
  function telaY(r) { return r.y - rolagem + (r.ref ? r.ref.d : 0); }
  function medirDocumento() {
    var prender = B.redeTexto ? B.redeTexto.soltar() : function () {};
    grudes = B.redeTexto ? B.redeTexto.grudes(posicaoDoc) : [];
    var lista = document.querySelectorAll(SELETOR), i;
    elementos.length = 0; ancoras.length = 0; textos.length = 0;
    for (i = 0; i < lista.length; i++) {
      var el = lista[i];
      if (!el.offsetWidth || el.closest('[aria-hidden="true"]:not(.hero__arte)') || el.closest('.nav, .barra')) continue;
      var p = posicaoDoc(el), w = el.offsetWidth, h = el.offsetHeight;
      var item = { el: el, ativo: 0, ancoras: [], secao: el.closest('section'), ref: refDe(el) };
      var cantos = [[0, 0], [1, 0], [0, 1], [1, 1]];
      for (var c = 0; c < cantos.length; c++) {
        var a = { dx: p.x + w * cantos[c][0], dy: p.y + h * cantos[c][1], x: 0, y: 0, tipo: 1, k: 1, item: item, cx: cantos[c][0], cy: cantos[c][1], ligado: 0 };
        item.ancoras.push(a);
        ancoras.push(a);
      }
      elementos.push(item);
    }
    var nav = document.querySelector('.nav');
    navH = nav ? nav.offsetHeight : 0;
    var rod = document.querySelector('.footer');
    rodapeY = rod ? posicaoDoc(rod).y : 1e9;
    textos = B.redeTexto ? B.redeTexto(posicaoDoc, celular, refDe) : [];
    prender();
    /* sem rodapé (página futura), o fim da página faz o papel dele */
    if (rodapeY > 1e8) rodapeY = document.documentElement.scrollHeight;
    docH = document.documentElement.scrollHeight;
    var bf = document.querySelector('.conversa .btn--primary');
    fecho = bf ? itemDe(bf) : null;
    trilho.length = 0;
    if (TRILHO) {
      var semente = 7, prox = function () { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
      for (var ty = navH + 90; ty < rodapeY - 70; ty += 70 + prox() * 90) trilho.push({ dy: ty, dx: (prox() * 2 - 1) * TRILHO_ZIGUE, x: 0, y: 0, tipo: 6, k: 1 });
    }
  }
  var fecho = null;   /* o botão da Conversa (o convite final), achado na medida */
  function itemDe(el) { for (var i = 0; i < elementos.length; i++) if (elementos[i].el === el) return elementos[i]; return null; }

  /* um elemento acende: os cantos brilham e soltam sinais pela rede */
  function acender(el, sinaisPorCanto, semMini) {
    if (parado) return;   /* reduzido: o desenho parado não apagaria os cantos nem andaria os sinais */
    var it = itemDe(el);
    if (!it || it.ativo > 0.5) return;   /* já aceso: não dispara de novo */
    if (celular) for (var o = 0; o < elementos.length; o++) if (elementos[o] !== it && elementos[o].ativo > 0) elementos[o].rapido = true;
    it.ativo = 1; it.rapido = false;
    for (var k = 0; k < it.ancoras.length; k++) dispararDe(it.ancoras[k], sinaisPorCanto);
    var extra = B.rede.extra;
    if (!semMini && extra && extra.aoAcender) extra.aoAcender(it);
  }
  /* o ponteiro: só quando ENTRA num elemento novo (pointerover dispara a cada
     filho; a trava por tempo deixava 8 sinais a cada 0,6 s dentro do cartão) */
  var sobAntes = null;
  function aoEntrar(e) {
    var alvo = e.target.closest ? e.target.closest(ATIVOS) : null;
    if (alvo === sobAntes) return;
    sobAntes = alvo;
    if (alvo) acender(alvo, 2);
  }

  /* ---------- a constelação do reator (Hub): o módulo js/rede-reator.js ---------- */
  var reator = B.redeReator ? B.redeReator({ ctx: ctx, cores: { AC: AC, AC2: AC2, AC3: AC3 }, lancar: lancar }) : null;

  /* ---------- sinais ---------- */
  /* `forcado`: as ondas do reator passam do limite (a batida não pode se perder) */
  /* `luz`/`idx`: o trecho da treliça que fica aceso 0,3 s depois que o sinal chega */
  /* `x0`: as ondas do reator andam pela FASE do fôlego, não pela soma de dt
     (um engasgo atrasava a onda e ela chegava depois do lampejo) */
  function lancar(de, para, dura, forcado, luz, idx, x0) {
    if (!forcado && sinais.length >= MAX_SINAIS) return;
    var d = Math.hypot(para.x - de.x, para.y - de.y) || 1;
    sinais.push({ de: de, para: para, t: 0, dura: dura || Math.max(0.25, d / VEL), saltos: forcado ? 9 : 0, forte: !!forcado,
      luz: luz || null, idx: idx || 0, x0: x0 === undefined ? -1 : x0 });
  }
  /* uma conversa: de um nó livre na tela, uma cadeia de 3 a 5 feixes acende
     salto a salto; cabeça ciano clara (o branco é só da onda do reator) */
  function conversar() {
    for (var tenta = 0; tenta < 24; tenta++) {
      var l = (Math.random() * nLig) | 0;
      var a = ligA[l], b = ligB[l];
      if (!a || a.tipo !== 0 || (b.tipo > 1 && b.tipo !== 6) || a.apaga < 0.6) continue;
      if (a.y < navH + 20 || a.y > H - 20 || a.x < BORDA || a.x > W - BORDA) continue;
      if (naZona((a.x + b.x) / 2, (a.y + b.y) / 2)) continue;   /* uma conversa que cruza texto aparece pela metade */
      var d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      sinais.push({ de: a, para: b, t: 0, dura: Math.max(0.3, d / 200), saltos: 0, forte: true, conversa: 3 + ((Math.random() * 3) | 0) });
      return;
    }
  }
  function dispararDe(p, max) {
    var n = 0;
    for (var i = 0; i < nLig && n < max; i++) {
      if (ligA[i] === p) { lancar(p, ligB[i]); n++; } else if (ligB[i] === p) { lancar(p, ligA[i]); n++; }
    }
  }
  function vizinhoDe(p, exceto, limpo) {
    var opcoes = 0, escolhido = null;
    for (var i = 0; i < nLig; i++) {
      var o = ligA[i] === p ? ligB[i] : ligB[i] === p ? ligA[i] : null;
      if (!o || o === exceto || (o.tipo >= 2 && o.tipo !== 6) || (o.tipo === 1 && naZona(o.x, o.y))) continue;
      if (limpo && ligT[i] !== 1 && naZona((p.x + o.x) / 2, (p.y + o.y) / 2)) continue;
      opcoes++;
      if (Math.random() * opcoes < 1) escolhido = o;   /* amostragem uniforme sem lista */
    }
    return escolhido;
  }

  /* ---------- medida ---------- */
  function medir() {
    var w = window.innerWidth, h = window.innerHeight, d = Math.min(window.devicePixelRatio || 1, celular ? 1.25 : 1.5);
    if (w !== W || h !== H || d !== dpr) {
      W = w; H = h; dpr = d;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (!nos.length || Math.abs(nos.length - quantosNos()) > 8) semear();
    medirDocumento();
    sujo = false;
  }
  /* o FAQ abrindo muda a altura a cada quadro por 0,4 s, e a barra do
     celular dispara resize na rolagem: mede quando PARAR (120 ms) */
  var pedidoEm = 0;
  function pedirMedida() { pedidoEm = performance.now(); desenhouParado = false; }

  /* ---------- por quadro ---------- */
  function quadro(S) {
    if (pedidoEm && S.now - pedidoEm > 120) { pedidoEm = 0; sujo = true; }
    if (sujo) medir();
    if (parado) {
      /* reduzido: redesenha quando o reator ou o mini mudam (salto por âncora, menu) */
      var nu0 = B.nucleo, m0 = B.rede.extra;
      var ass = (nu0 && nu0.visivel ? Math.round(nu0.py) : -1) + ':' + (m0 ? Math.round(m0.x) + ',' + Math.round(m0.y) + ',' + m0.vis.toFixed(2) : '');
      if (ass !== assinatura) { assinatura = ass; desenhouParado = false; }
    }
    if (parado) { if (!desenhouParado) { passo(0, B.relogio()); desenhar(B.relogio()); desenhouParado = true; } return; }
    var dt = Math.min(0.05, S.dt / 1000), t = B.relogio();
    passo(dt, t);
    desenhar(t);
  }

  function passo(dt, t) {
    var F = B.FOLEGO, x = faseDoFolego(t);
    folego = parado ? 1 : x < F.inspira ? suave(x / F.inspira) : 1 - suave((x - F.inspira) / (1 - F.inspira));
    /* parado (movimento reduzido): sem paralaxe, que é justamente o gatilho vestibular */
    var dy = parado ? 0 : rolagem - rolagemAntes;
    rolagemAntes = rolagem;
    var nu = B.nucleo, comReator = !!(nu && nu.visivel && reator);
    if (nu && nu.py !== undefined) { nu.cx = nu.px - window.scrollX; nu.cy = nu.py - rolagem; }   /* sem um quadro de atraso */
    if (comReator) reator.posicionar(nu, t, folego);
    var mx = B.rede.extra, estreita = W < 360, miniAtivo = !!(mx && mx.ativo), miniX = mx ? mx.x : 0, miniY = mx ? mx.y : 0;
    for (var i = 0; i < nos.length; i++) {
      var n = nos[i];
      var ang = Math.sin(n.x * 0.0042 + t * 0.07 + n.fase) + Math.cos(n.y * 0.0051 - t * 0.05);
      var v = (5 + n.z * 4) * dt;
      n.x += Math.cos(ang * 1.7) * v;
      n.y += Math.sin(ang * 1.7) * v - dy * PARALAXE[n.z];
      if (n.x < -30) n.x += W + 60; else if (n.x > W + 30) n.x -= W + 60;
      if (n.y < -30) n.y += H + 60; else if (n.y > H + 30) n.y -= H + 60;
      /* perto do reator a rede comum se apaga: ali só a constelação fala */
      n.apaga = comReator ? suave((Math.hypot((n.x - nu.cx) / nu.sx, (n.y - nu.cy) / nu.sy) / nu.r - 2.3) / 1.2) : 1;
      if (estreita && miniAtivo) n.apaga *= suave((Math.hypot(n.x - miniX, n.y - miniY) - 28) / 12);   /* 320 px: a rede não se amontoa no mini */
    }
    for (var gd = 0; gd < grudes.length; gd++) { var g0 = grudes[gd]; g0.d = Math.max(0, Math.min(g0.fim - g0.inicio, rolagem - g0.inicio)); }
    for (var a = 0; a < ancoras.length; a++) { var an0 = ancoras[a]; an0.x = an0.dx; an0.y = an0.dy - rolagem + (an0.item.ref ? an0.item.ref.d : 0); an0.ligado = 0; }
    for (var tr = 0; tr < trilho.length; tr++) { trilho[tr].x = W - TRILHO_BORDA + trilho[tr].dx; trilho[tr].y = trilho[tr].dy - rolagem; }
    for (var e = 0; e < elementos.length; e++) if (elementos[e].ativo > 0) elementos[e].ativo = Math.max(0, elementos[e].ativo - dt * (elementos[e].rapido ? 5 : 0.9));
    ponteiro.a += ((ponteiro.ativo ? 1 : 0) - ponteiro.a) * Math.min(1, dt * 4);

    if (reator) reator.passo(dt);
    faseAgora = x;
    /* sem o reator na tela, os sinais dele saem (ficavam congelados no lugar) */
    if (!comReator) for (var sr = sinais.length - 1; sr >= 0; sr--) if (sinais[sr].de.tipo >= 2 && sinais[sr].de.tipo <= 3 || sinais[sr].para.tipo === 3) sinais.splice(sr, 1);
    textosNaTela();
    ligar(comReator);
    resolverCandidatos();
    ondas(x, comReator);
    soltos(dt, x);
    andarSinais(dt);
  }

  /* quem se liga com quem, numa grade (cada ponto só olha as células
     vizinhas). Chave numérica e listas reaproveitadas: nada alocado por quadro */
  var grade = new Map();
  var candA = [], candB = [], candF = [], candD = [], nCand = 0;
  var porDistancia = function (i, j) { return candD[i] - candD[j]; };
  /* o fator de um candidato para um nó: 1 entre as MAX_GRAU mais próximas,
     suave na última (pela folga até a seguinte), 0 depois */
  function fatorGrau(p, ci, max) {
    max = max || MAX_GRAU;
    var l = p.cands, k = l.indexOf(ci);
    if (k < max - 1) return 1;
    if (k > max - 1) return 0;
    return l.length > max ? suave((candD[l[max]] - candD[ci]) / FOLGA_GRAU) : 1;
  }
  var chaveDe = function (gx, gy) { return (gx + 512) * 4096 + (gy + 512); };
  function ligar(comReator) {
    pontos.length = 0;
    var i;
    for (i = 0; i < nos.length; i++) pontos.push(nos[i]);
    for (i = 0; i < ancoras.length; i++) { var an = ancoras[i]; if (an.y > -ALCANCE && an.y < H + ALCANCE) pontos.push(an); }
    if (comReator) for (i = 0; i < 12; i++) pontos.push(reator.pontosDaRede[i]);   /* a órbita de fora conversa com a rede */
    if (ponteiro.a > 0.02) pontos.push(ponteiro);
    var extra = B.rede.extra;
    if (extra && extra.ativo) pontos.push(extra);
    var t0 = -1;
    for (i = 0; i < trilho.length; i++) { var tn = trilho[i]; if (tn.y > -ALCANCE && tn.y < H + ALCANCE) { pontos.push(tn); if (t0 < 0) t0 = i; } }

    grade.forEach(function (l) { l.length = 0; });
    for (i = 0; i < pontos.length; i++) {
      var pt = pontos[i], chave = chaveDe(Math.floor(pt.x / ALCANCE), Math.floor(pt.y / ALCANCE));
      pt.ix = i;
      var cel0 = grade.get(chave);
      if (!cel0) grade.set(chave, cel0 = []);
      cel0.push(pt);
    }
    nLig = 0; nCand = 0;
    /* o trilho: cada nó com o seguinte, se o vão for de até 170 px */
    for (i = Math.max(0, t0 - 1); t0 >= 0 && i < trilho.length - 1; i++) {
      var ta = trilho[i], tb = trilho[i + 1];
      if (ta.y > H + ALCANCE) break;
      if (tb.y - ta.y > 170) continue;
      ligA[nLig] = ta; ligB[nLig] = tb; ligF[nLig] = 0.5; ligT[nLig] = 1; nLig++;
    }
    /* o fecho: os dois cantos direitos do botão final ligados ao nó do
       trilho mais perto de cada um (a rede termina no convite) */
    if (TRILHO && fecho) for (i = 0; i < fecho.ancoras.length; i++) {
      var ca = fecho.ancoras[i];
      if (!ca.cx || ca.y < 0 || ca.y > H) continue;
      var melhor = null, dmin = 9e9;
      for (var tk = 0; tk < trilho.length; tk++) {
        var tn2 = trilho[tk];
        if (tn2.y < navH || tn2.y > Math.min(H, rodapeY - rolagem - 60)) continue;   /* só nós desenhados */
        var dk = Math.abs(tn2.y - ca.y); if (dk < dmin) { dmin = dk; melhor = tn2; }
      }
      if (melhor && dmin < 120) { ligA[nLig] = melhor; ligB[nLig] = ca; ligF[nLig] = 0.6; ligT[nLig] = 1; nLig++; }
    }
    for (i = 0; i < pontos.length; i++) { pontos[i].grau = 0; pontos[i].cands = pontos[i].cands || []; pontos[i].cands.length = 0; }
    var L2 = ALCANCE * ALCANCE;
    for (i = 0; i < pontos.length; i++) {
      var a = pontos[i], cx = Math.floor(a.x / ALCANCE), cy = Math.floor(a.y / ALCANCE);
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
        var cel = grade.get(chaveDe(cx + ox, cy + oy));
        if (!cel || !cel.length) continue;
        for (var j = 0; j < cel.length; j++) {
          var b = cel[j];
          /* cada par uma vez só: o de tipo menor (ou, no empate, o de índice menor) liga */
          if (b === a || !(a.tipo < b.tipo || (a.tipo === b.tipo && b.ix > i))) continue;
          var f = forca(a, b, L2);
          if (f <= 0.01) continue;
          if (a.tipo === 0 && b.tipo === 0) {
            /* nó com nó: vira candidato; quem fica é decidido depois, pela distância */
            var dd = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
            var ci = nCand++;
            candA[ci] = a; candB[ci] = b; candF[ci] = f; candD[ci] = Math.sqrt(dd);
            a.cands.push(ci); b.cands.push(ci);
            continue;
          }
          if (a.tipo === 5 || b.tipo === 5) {
            /* o mini: candidato também (ficam as MAX_MINI mais próximas) */
            var dm = Math.hypot(a.x - b.x, a.y - b.y), cm = nCand++;
            candA[cm] = a; candB[cm] = b; candF[cm] = f; candD[cm] = dm;
            (a.tipo === 5 ? a : b).cands.push(cm);
            continue;
          }
          if (a.tipo === 1 && f > a.ligado) a.ligado = f;   /* a força do feixe mais forte que chega no canto */
          if (b.tipo === 1 && f > b.ligado) b.ligado = f;
          ligA[nLig] = a; ligB[nLig] = b; ligF[nLig] = f; ligT[nLig] = 0; nLig++;
        }
      }
    }
  }

  function resolverCandidatos() {
    var i;
    for (i = 0; i < pontos.length; i++) if (pontos[i].cands.length > 1) pontos[i].cands.sort(porDistancia);
    for (i = 0; i < nCand; i++) {
      var a = candA[i], b = candB[i];
      var k = a.tipo === 5 || b.tipo === 5 ? fatorGrau(a.tipo === 5 ? a : b, i, MAX_MINI) : Math.min(fatorGrau(a, i), fatorGrau(b, i));
      if (k <= 0.01) continue;
      var f = candF[i] * k;
      if (a.tipo === 5 || b.tipo === 5) f = Math.max(f, 0.75 * k);   /* o mini sempre segura um feixe visível (0,35 caía numa faixa de ~0,13 de alfa) */
      else f *= 1.12;   /* a rede comum um pouco mais presente (o texto já é protegido pela borracha) */
      ligA[nLig] = a; ligB[nLig] = b; ligF[nLig] = f; ligT[nLig] = 0; nLig++;
    }
  }

  /* a regra de cada par (tipo: 0 nó, 1 canto, 2 órbita, 4 ponteiro, 5 mini, 6 trilho) */
  function forca(a, b, L2) {
    var dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
    var ta = a.tipo, tb = b.tipo;
    if (ta === 1 && tb === 1) {
      /* cantos não se ligam entre si (desenhariam caixas), a não ser na PILHA:
         o canto de baixo de um cartão com o de cima do cartão logo abaixo, no
         mesmo prumo (a pilha do celular vira corrente) */
      if (a.item === b.item || Math.abs(dx) > 4 || Math.abs(dy) > 70 || Math.abs(dy) < 32 || !a.cx || !b.cx) return 0;
      return 0.6 + 0.4 * Math.max(a.item.ativo, b.item.ativo);
    }
    if (ta === 2 && tb === 2) return 0;   /* a órbita tem as ligações dela (desenhar) */
    if (tb === 6 && (ta === 6 || ta === 2 || ta === 4)) return 0;   /* o trilho: entre si já ligado; não com órbita nem cursor */
    var alcance = L2;
    if (ta === 4 || tb === 4) alcance = L2 * 1.3;
    if (ta === 5 || tb === 5) alcance = L2 * 2.2;   /* o mini procura mais longe: sempre acha um nó */
    if (d2 > alcance) return 0;
    var f = 1 - Math.sqrt(d2 / alcance);
    f *= f;
    if (ta === 0) f *= a.k * a.apaga;
    if (tb === 0) f *= b.k * b.apaga;
    if (ta === 1 || tb === 1) f *= 0.75 + (ta === 1 ? a : b).item.ativo * 2.2;
    if (ta === 4 || tb === 4) f *= ponteiro.a * 0.9;
    if (ta === 5 || tb === 5) f *= 1.3 * (B.rede.extra ? B.rede.extra.forca : 1);
    if (tb === 6 && ta === 1) f *= 1.3;   /* as pontas das réguas se prendem ao trilho */
    return f;
  }

  /* a onda do fôlego na constelação: da órbita de fora para a de dentro e
     dela para o portal, chegando com o lampejo (começo do fôlego) */
  function ondas(x, comReator) {
    if (comReator && !parado) reator.ondas(x, faseAntes);
    faseAntes = x;
  }
  /* sinais soltos pela rede: mais no expirar (a rede solta o que o núcleo soltou) */
  function soltos(dt, x) {
    var F = B.FOLEGO;
    if (!parado && nLig) {
      if (faseConversa < F.inspira + 0.02 && x >= F.inspira + 0.02) conversar();
      if (faseConversa < 0.72 && x >= 0.72 && Math.random() < 0.5) conversar();
    }
    faseConversa = x;
    proxSinal -= dt;
    if (proxSinal > 0 || !nLig || parado) return;
    var l = (Math.random() * nLig) | 0;
    if (ligA[l].tipo <= 1) lancar(ligA[l], ligB[l]);
    proxSinal = x > B.FOLEGO.inspira ? acaso(0.27, 0.57) : acaso(0.5, 1);
  }

  var faseAgora = 0;
  function andarSinais(dt) {
    for (var r = rastros.length - 1; r >= 0; r--) { rastros[r].t -= dt; if (rastros[r].t <= 0) rastros.splice(r, 1); }
    for (var i = sinais.length - 1; i >= 0; i--) {
      var s = sinais[i];
      if (s.x0 >= 0) s.t = ((faseAgora - s.x0 + 1) % 1) * B.FOLEGO.periodo / s.dura;
      else s.t += dt / s.dura;
      if (s.t < 1) continue;
      if (s.luz) s.luz[s.idx] = 0.3;
      if (reator && s.x0 >= 0) reator.chegou(s);   /* a passagem do bastão no portal */
      if (s.conversa) {
        rastros.push({ de: s.de, para: s.para, t: RASTRO });
        var seguinte = s.saltos < s.conversa ? vizinhoDe(s.para, s.de, true) : null;
        if (seguinte) { s.de = s.para; s.para = seguinte; s.t = 0; s.saltos++; s.dura = Math.max(0.3, Math.hypot(seguinte.x - s.de.x, seguinte.y - s.de.y) / 200); }
        else sinais.splice(i, 1);
        continue;
      }
      var prox = s.saltos < 4 && Math.random() < SALTO ? vizinhoDe(s.para, s.de) : null;
      if (prox) { s.de = s.para; s.para = prox; s.t = 0; s.saltos++; s.dura = Math.max(0.25, Math.hypot(prox.x - s.de.x, prox.y - s.de.y) / VEL); }
      else sinais.splice(i, 1);
    }
  }

  /* ---------- desenho ---------- */
  var faixas = [];
  for (var fx = 0; fx < FAIXAS; fx++) faixas.push([]);
  /* os textos deste quadro (a borracha, os nós e o mini consultam esta lista) */
  function textosNaTela() {
    naTela.length = 0;
    for (var i = 0; i < textos.length; i++) {
      var r = textos[i], y = telaY(r);
      if (y - 30 > H || y + r.h + 30 < 0) continue;
      naTela.push(r);
    }
  }
  /* (x, y) cai dentro da zona protegida de algum texto (com a folga)? */
  function naZona(x, y, comHalo) {
    for (var i = 0; i < naTela.length; i++) {
      var r = naTela[i];
      if ((r.halo && !comHalo) || r.folga < 0) continue;
      var ry = telaY(r), f = r.folga;
      if (x > r.x - f && x < r.x + r.w + f && y > ry - f && y < ry + r.h + f) return true;
    }
    return false;
  }
  function desenhar(t) {
    ctx.clearRect(0, 0, W, H);
    var nu = B.nucleo, comReator = !!(nu && nu.visivel && reator);
    var i, k;
    /* os feixes por faixa de força (a força não oscila: a respiração entra
       por globalAlpha e as linhas não trocam de faixa a cada fôlego) */
    for (k = 0; k < FAIXAS; k++) faixas[k].length = 0;
    for (i = 0; i < nLig; i++) if (ligT[i] !== 1) faixas[Math.min(FAIXAS - 1, (ligF[i] * FAIXAS) | 0)].push(i);
    ctx.globalAlpha = 0.74 + 0.26 * folego;   /* nunca acima de 1: o canvas ignoraria e a respiração achataria */
    ctx.lineWidth = 0.75;
    for (k = 0; k < FAIXAS; k++) {
      var lista = faixas[k];
      if (!lista.length) continue;
      ctx.beginPath();
      for (var j = 0; j < lista.length; j++) { var l = lista[j]; ctx.moveTo(ligA[l].x, ligA[l].y); ctx.lineTo(ligB[l].x, ligB[l].y); }
      ctx.strokeStyle = 'rgba(' + AC + ',' + (ALFA_MIN + (ALFA_MAX - ALFA_MIN) * k / (FAIXAS - 1)).toFixed(3) + ')';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    /* os nós: pontos de 0,8–1,8 px */
    ctx.fillStyle = 'rgba(' + AC2 + ',0.62)';
    ctx.beginPath();
    for (i = 0; i < nos.length; i++) {
      var n = nos[i];
      if (n.apaga < 0.05 || naZona(n.x, n.y)) continue;
      var r = (0.8 + n.z * 0.5) * n.apaga;
      ctx.moveTo(n.x + r, n.y); ctx.arc(n.x, n.y, r, 0, TAU);
    }
    ctx.fill();
    var extra = B.rede.extra;
    if (comReator) reator.desenhar(folego);
    desenharSinais(false);
    if (extra && extra.desenharFundo) extra.desenharFundo(ctx, t, folego);   /* o feixe do mini: também some atrás do texto */
    apagarTextos();
    if (comReator) reator.depoisDaBorracha(nu);
    if (TRILHO) desenharTrilho();
    for (i = 0; i < ancoras.length; i++) {
      var an = ancoras[i];
      if (an.ligado < 0.08 || an.y < navH || an.y > rodapeY - rolagem - 40 || naZona(an.x, an.y, true)) continue;
      ctx.fillStyle = 'rgba(' + AC + ',' + (0.6 * Math.min(1, an.ligado * 3)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(an.x, an.y, 1.6, 0, TAU); ctx.fill();
    }
    desenharCantos();
    if (extra && extra.desenhar) extra.desenhar(ctx, t, folego);
  }

  /* o trilho: tracejado de nós na margem direita (só celular), por cima da
     borracha das bordas; os pontos somem dentro do halo dos botões */
  function naHalo(x, y) {
    for (var i = 0; i < naTela.length; i++) {
      var r = naTela[i];
      if (!r.halo) continue;
      var ry = telaY(r), f = r.folga;
      if (x > r.x - f && x < r.x + r.w + f && y > ry - f && y < ry + r.h + f) return true;
    }
    return false;
  }
  /* a luz do trilho pela distância ao mini: 0,20 junto dele, 0,07 a 300 px
     (a parte acesa anda com ele; o resto é sugestão) */
  function luzTrilho(y) {
    var m = B.rede.extra, v = m ? m.vis : 0, luz = 0.07 + 0.13 * v * (1 - suave(Math.abs(y - (m ? m.y : 0)) / 300));
    /* o fecho: com o mini já despedido, a luz se centra no botão final (a
       energia termina no convite, crítica rodada 9) */
    var yf = yFecho();
    if (yf !== null) luz = Math.max(luz, 0.07 + 0.13 * (1 - v) * (1 - suave(Math.abs(y - yf) / 300)));
    return luz;
  }
  function yFecho() {
    if (!fecho || !fecho.ancoras.length) return null;
    var y = (fecho.ancoras[0].y + fecho.ancoras[fecho.ancoras.length - 1].y) / 2;
    return y > 0 && y < H ? y : null;
  }
  function desenharTrilho() {
    var fimY = rodapeY - rolagem - 60, i, m = B.rede.extra, my = m && m.ativo ? m.y : -1e4;
    var resp = 0.85 + 0.3 * folego;
    ctx.lineWidth = 0.75;
    for (i = 0; i < nLig; i++) {
      if (ligT[i] !== 1) continue;
      var a = ligA[i], b = ligB[i];
      /* a ligação ao botão final atravessa o halo dele de propósito: é o fecho */
      if (a.y > fimY || (b.tipo !== 1 && naHalo(a.x, (a.y + b.y) / 2))) continue;
      var y0 = a.y, y1 = Math.min(b.y, fimY);
      /* a ligação ao botão final: no mínimo 0,25, e acende com a mira */
      var luzLig = b.tipo === 1 ? Math.max(0.25, 0.25 + 0.3 * b.item.ativo) : luzTrilho((y0 + y1) / 2) * resp;
      ctx.strokeStyle = 'rgba(' + AC + ',' + luzLig.toFixed(3) + ')';
      ctx.beginPath();
      /* o vão em volta do mini: o fio se abre e ele corre por ele */
      if (b.tipo === 6 && my > y0 - TRILHO_VAO && my < y1 + TRILHO_VAO) {
        var cima = my - TRILHO_VAO, baixo = my + TRILHO_VAO, k0 = (cima - y0) / (y1 - y0 || 1), k1 = (baixo - y0) / (y1 - y0 || 1);
        if (k0 > 0) { ctx.moveTo(a.x, y0); ctx.lineTo(a.x + (b.x - a.x) * k0, cima); }
        if (k1 < 1) { ctx.moveTo(a.x + (b.x - a.x) * k1, baixo); ctx.lineTo(b.x, y1); }
      } else { ctx.moveTo(a.x, y0); ctx.lineTo(b.x, y1); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(' + AC2 + ',0.45)';
    ctx.beginPath();
    for (i = 0; i < trilho.length; i++) {
      var p = trilho[i];
      if (p.y < navH || p.y > Math.min(H, fimY) || naHalo(p.x, p.y) || Math.abs(p.y - my) < TRILHO_VAO) continue;
      ctx.moveTo(p.x + 0.9, p.y); ctx.arc(p.x, p.y, 0.9, 0, TAU);
    }
    ctx.fill();
    desenharSinais(true);
  }

  /* `noTrilho`: só os sinais entre nós do trilho (desenhados depois da
     borracha); sem ele, todos os outros */
  function desenharSinais(noTrilho) {
    /* o caminho da conversa: cada trecho fica aceso e apaga depois que o sinal passa */
    ctx.lineWidth = 0.9;
    for (var r = 0; r < rastros.length; r++) {
      var ra = rastros[r];
      if ((ra.de.tipo === 6 && ra.para.tipo === 6) !== !!noTrilho) continue;
      ctx.strokeStyle = 'rgba(' + AC + ',' + (0.34 * ra.t / RASTRO).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(ra.de.x, ra.de.y); ctx.lineTo(ra.para.x, ra.para.y); ctx.stroke();
    }
    for (var i = 0; i < sinais.length; i++) {
      if ((sinais[i].de.tipo === 6 && sinais[i].para.tipo === 6) !== !!noTrilho) continue;
      var s = sinais[i], u = s.t, hx = s.de.x + (s.para.x - s.de.x) * u, hy = s.de.y + (s.para.y - s.de.y) * u;
      /* o da onda: o caminho percorrido fica aceso atrás dele (a energia corre) */
      if (s.luz || s.conversa) { ctx.strokeStyle = 'rgba(' + AC + ',0.32)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(s.de.x, s.de.y); ctx.lineTo(hx, hy); ctx.stroke(); }
      var v = Math.max(0, u - (s.forte ? 0.55 : 0.35)), tx = s.de.x + (s.para.x - s.de.x) * v, ty = s.de.y + (s.para.y - s.de.y) * v;
      var g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, 'rgba(' + AC + ',0)');
      /* branco só nas ondas do reator; a conversa tem cabeça ciano clara */
      var branca = s.forte && !s.conversa;
      ctx.globalAlpha = naZona(hx, hy) ? 0.7 : 1;
      g.addColorStop(1, branca ? 'rgba(242,244,244,0.95)' : 'rgba(' + AC2 + ',0.9)');
      ctx.strokeStyle = g; ctx.lineWidth = s.forte ? 1.4 : 1.2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = branca ? 'rgba(242,244,244,0.95)' : 'rgba(' + AC2 + ',0.9)';
      ctx.beginPath(); ctx.arc(hx, hy, branca ? 2 : s.forte ? 1.6 : 1.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* a leitura manda: atrás de texto a rede some (borda macia de 10 px) */
  var naTela = [];   /* os textos deste quadro (o mini consulta sem varrer a página) */
  var bordaE = null, bordaD = null, bordaW = 0;
  function apagarTextos() {
    ctx.globalCompositeOperation = 'destination-out';
    if (navH) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, navH + 4); }
    /* as bordas da tela: a rede some nos últimos px (ponto na borda parece poeira) */
    if (bordaW !== W) {
      bordaW = W;
      bordaE = ctx.createLinearGradient(0, 0, BORDA + 6, 0); bordaE.addColorStop(0, '#000'); bordaE.addColorStop(1, 'rgba(0,0,0,0)');
      bordaD = ctx.createLinearGradient(W, 0, W - BORDA - 6, 0); bordaD.addColorStop(0, '#000'); bordaD.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = bordaE; ctx.fillRect(0, 0, BORDA + 6, H);
    ctx.fillStyle = bordaD; ctx.fillRect(W - BORDA - 6, 0, BORDA + 6, H);
    /* o rodapé: a rede se desfaz nos 80 px antes dele (era cortada seco) */
    var ry = rodapeY - rolagem;
    if (ry < H + 80 && ry > -400) {
      var gr = ctx.createLinearGradient(0, ry - 80, 0, ry);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000');
      ctx.fillStyle = gr; ctx.fillRect(0, ry - 80, W, 80);
      ctx.fillStyle = '#000'; ctx.fillRect(0, ry, W, H);
    }
    for (var i = 0; i < naTela.length; i++) {
      var r = naTela[i], y = telaY(r);
      if (r.halo) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(r.x - r.folga, y - r.folga, r.w + 2 * r.folga, r.h + 2 * r.folga); continue; }
      if (r.inteiro) { ctx.fillStyle = '#000'; ctx.fillRect(r.x - r.folga, y - r.folga, r.w + 2 * r.folga, r.h + 2 * r.folga); continue; }
      if (r.folga > 0) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(r.x - r.folga, y - r.folga, r.w + 2 * r.folga, r.h + 2 * r.folga); }
      var m = r.folga > 0 ? 4 : r.folga;
      ctx.fillStyle = 'rgba(0,0,0,0.94)'; ctx.fillRect(r.x - m, y - m, r.w + 2 * m, r.h + 2 * m);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function desenharCantos() {
    ctx.lineWidth = 1;
    for (var e = 0; e < elementos.length; e++) {
      var it = elementos[e];
      if (it.ativo < 0.02 || it.ancoras.length < 4) continue;
      ctx.strokeStyle = 'rgba(' + PRATA + ',' + (0.55 * it.ativo).toFixed(3) + ')';
      ctx.beginPath();
      for (var c = 0; c < it.ancoras.length; c++) {
        var a = it.ancoras[c];
        if (a.y < -20 || a.y > H + 20) continue;
        var sx = a.cx ? -1 : 1, sy = a.cy ? -1 : 1, m = 9;
        ctx.moveTo(a.x + sx * m, a.y); ctx.lineTo(a.x, a.y); ctx.lineTo(a.x, a.y + sy * m);
      }
      ctx.stroke();
    }
  }

  /* ---------- API para os vizinhos (o mini AI Core) ---------- */
  B.rede = {
    extra: null,
    lancar: lancar,
    dispararDe: dispararDe,
    alturaDoc: function () { return docH; },
    /* o canto, dentre os da seção, mais perto de (x, y) e na tela; null se passar de `max` px */
    cantoPerto: function (secao, x, y, max) {
      var melhor = null, dm = max * max;
      for (var i = 0; i < ancoras.length; i++) {
        var a = ancoras[i];
        if (secao && a.item.secao !== secao) continue;
        if (a.y < navH || a.y > H) continue;
        var d = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
        if (d < dm) { dm = d; melhor = a; }
      }
      return melhor;
    },
    /* (x, y) cai sobre um bloco de texto (com a folga)? */
    /* um texto chega a menos de `rx` px na horizontal e `ry` px na vertical? */
    sobreTexto: function (x, y, rx, ry) {
      if (ry === undefined) ry = rx;
      for (var i = 0; i < naTela.length; i++) {
        var q = naTela[i], ty = telaY(q);
        if (q.halo || q.folga < 0 || q.inteiro) continue;
        if (x + rx > q.x && x - rx < q.x + q.w && y + ry > ty && y - ry < ty + q.h) return true;
      }
      return false;
    },
    rodapeNaTela: function () { return rodapeY - rolagem; }
  };

  /* ---------- eventos (só anotam) ---------- */
  window.addEventListener('resize', pedirMedida, { passive: true });
  window.addEventListener('scroll', function () { rolagem = window.scrollY; if (parado) desenhouParado = false; }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(pedirMedida).observe(document.body);
  /* as fontes mudam a largura das linhas: mede de novo quando chegam */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pedirMedida);
  if (ponteiroFino) {
    document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { ponteiro.x = e.clientX; ponteiro.y = e.clientY; ponteiro.ativo = true; } }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { ponteiro.ativo = false; }, { passive: true });
    document.addEventListener('pointerover', aoEntrar, { passive: true });
  } else if ('IntersectionObserver' in window) {
    /* celular, sem cursor: o cartão acende quando chega ao centro da tela
       (no máximo um a cada 600 ms) */
    var ultimo = 0, fila = null;
    var vez = function () {
      if (!fila) return;
      var agora = performance.now();
      if (agora - ultimo < 600) { setTimeout(vez, 600 - (agora - ultimo)); return; }
      ultimo = agora;
      var el = fila; fila = null;
      acender(el, 1);
    };
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        if (!es[i].isIntersecting || parado) continue;
        fila = es[i].target;   /* fila de um: o mais recente vence */
        vez();
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll(ATIVOS).forEach(function (el) { io.observe(el); });
  }
  B.on('reduzir', function (sim) { parado = !!sim; desenhouParado = false; sinais.length = 0; rastros.length = 0; });

  /* quando começa. Vindo de outra página do site, JÁ: a constelação herdada
     aparece acesa no primeiro quadro, sem o vão de fundo vazio na troca. Na
     primeira visita, depois do load (nada no caminho da 1ª pintura) e
     acendendo devagar */
  function comecar() {
    medir();
    cv.classList.add('is-viva');
    B.add('rede', quadro);
    B.iniciar();
  }
  if (herdada) {
    cv.classList.add('is-herdada');
    comecar();
    quadro({ dt: 16 });   /* já desenhada quando a View Transition capturar a página nova */
  } else {
    var ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 1); };
    if (document.readyState === 'complete') ocioso(comecar, { timeout: 900 });
    else window.addEventListener('load', function () { ocioso(comecar, { timeout: 900 }); }, { once: true });
  }
})();
