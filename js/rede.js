/* ==========================================================================
   A REDE — o fundo vivo do site inteiro. Segunda forma (pedido do dono,
   2026-10-02): "ao invés de formas paradas que se conectam de vez em quando,
   feixes de energia andando frequentemente e gerando interação quando se
   esbarram, e claro eles vão interagir com o usuário também".

   Um canvas 2D fixo atrás do conteúdo (o AI Core continua sendo o único
   WebGL). O motor dos feixes mora em js/feixes.js; aqui fica a página:
   - a LEITURA manda: todo texto é apagado da rede (js/rede-texto.js mede as
     zonas) e os feixes contornam os blocos em vez de atravessá-los;
   - os CARTÕES e botões: o cursor sobre um deles (ou ele chegando ao centro
     da tela, no celular) acende os cantos e solta dois feixes que percorrem
     as bordas dele;
   - o CURSOR atrai os feixes que passam perto e os carrega ao tocá-los; o
     CLIQUE (ou o toque, no celular) solta um pulso com quatro feixes;
   - a ROLAGEM: os feixes andam com a página devagar (paralaxe) e aceleram
     enquanto ela rola;
   - no celular, o TRILHO: a margem direita (fora da coluna de texto) é uma
     faixa onde feixes sobem e descem, desenhados por cima da borracha;
   - o MINI AI CORE (js/mini.js), por B.rede.extra;
   - a malha antiga (nós parados e ligações) e a constelação presa ao reator
     estão no histórico (commit ec08dac).

   Leis (docs/HANDOFF.md §4): nada contínuo passa pelo CSS; layout lido só
   em evento (carga, resize, mudança de tamanho do documento), em posições
   de LAYOUT (offset, imunes às entradas por transform); um rAF só (B.add).
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  var cv = document.querySelector('[data-rede]');
  if (!B || !B.feixes || !cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  if (window.navigator.connection && navigator.connection.saveData) return;

  var TAU = Math.PI * 2;
  var celular = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  var ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- a paleta (os tokens, lidos uma vez) ---------- */
  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), PRATA = rgb('--prata-rgb', '183 191 192'), T1 = '242,244,244';

  /* ---------- números ---------- */
  var PARALAXE = 0.35;                        /* o quanto os feixes andam com a rolagem */
  var VENTO_MAX = 1.2, VENTO_VEL = 1400;      /* rolando a VENTO_VEL px/s os feixes andam (1 + VENTO_MAX)× */
  var CURSOR = { r: 240, s: 4 };              /* o cursor puxa a direção dos feixes até r px */
  var TOQUE = 14;                             /* px: o feixe que passa tão perto do cursor se carrega */
  var SELETOR = '.painel, .btn, .console, .janela, .instrumento, .passo, .prova__item, .qa, .spec__item, .cenario, .celula, .hero__rail, .footer';
  var ATIVOS = '.painel, .btn, .passo, .prova__item, .qa, .spec__item, .cenario, .celula';
  var TRILHO_BORDA = window.innerWidth < 360 ? 12 : 14;   /* celular: o eixo do trilho (o mesmo do mini) */

  var dpr = 1, W = 0, H = 0, docH = 1, navH = 0, rodapeY = 1e9;
  var ancoras = [], elementos = [], textos = [], naTela = [];
  var ponteiro = { x: -1e4, y: -1e4, ativo: false, a: 0 };
  var rolagem = window.scrollY, rolagemAntes = rolagem, velRol = 0;
  var sujo = true, parado = !!B.reduced, desenhouParado = false, assinatura = '';

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }
  function faseDoFolego(t) { var F = B.FOLEGO; return ((t / F.periodo) % 1 + 1) % 1; }

  /* ---------- os feixes ---------- */
  var feixes = B.feixes({
    ctx: ctx, cores: { AC: AC, AC2: AC2, T1: T1 }, celular: celular,
    naZona: function (x, y) { return naZona(x, y); },
    tela: function () { return { W: W, H: H, topo: navH }; },
    trilhoX: function () { return celular ? W - TRILHO_BORDA : null; },
    aoEvento: function (tipo, x, y) { var m = B.rede.extra; if (m && m.aoEsbarrao) m.aoEsbarrao(tipo, x, y); }
  });

  /* a página anterior deixou os feixes dela: continuam daqui */
  var herdada = null;
  try {
    var guardada = JSON.parse(sessionStorage.getItem('bz-feixes') || 'null');
    if (guardada && Date.now() - guardada.quando < 4000 && guardada.feixes && guardada.feixes.length) herdada = guardada.feixes;
  } catch (e) { /* sem armazenamento: semeia do zero */ }
  window.addEventListener('pagehide', function () {
    try { sessionStorage.setItem('bz-feixes', JSON.stringify({ quando: Date.now(), feixes: feixes.guardar(W, H) })); } catch (e) { /* idem */ }
  });

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
        var a = { dx: p.x + w * cantos[c][0], dy: p.y + h * cantos[c][1], x: 0, y: 0, item: item, cx: cantos[c][0], cy: cantos[c][1] };
        item.ancoras.push(a);
        ancoras.push(a);
      }
      item.w = w; item.h = h;
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
  }
  function itemDe(el) { for (var i = 0; i < elementos.length; i++) if (elementos[i].el === el) return elementos[i]; return null; }

  /* um elemento acende: os cantos travam e dois feixes percorrem as bordas
     dele (desktop: a de cima e a de baixo; celular: as laterais) e seguem */
  function acender(el, semMini) {
    if (parado) return;   /* reduzido: o desenho parado não apagaria os cantos */
    var it = itemDe(el);
    if (!it || it.ativo > 0.5) return;   /* já aceso: não dispara de novo */
    if (celular) for (var o = 0; o < elementos.length; o++) if (elementos[o] !== it && elementos[o].ativo > 0) elementos[o].rapido = true;
    it.ativo = 1; it.rapido = false;
    var a0 = it.ancoras[0], a3 = it.ancoras[3];
    if (a0.y > navH && a0.y < H) {
      if (celular) feixes.criar(a0.x, a0.y, 2, { carga: 0.6, reto: it.h, forcar: true });
      else feixes.criar(a0.x, a0.y, 0, { carga: 0.6, reto: it.w, forcar: true });
    }
    if (a3.y > navH && a3.y < H) {
      if (celular) feixes.criar(a3.x, a3.y, 6, { carga: 0.6, reto: it.h, forcar: true });
      else feixes.criar(a3.x, a3.y, 4, { carga: 0.6, reto: it.w, forcar: true });
    }
    var extra = B.rede.extra;
    if (!semMini && extra && extra.aoAcender) extra.aoAcender(it);
  }
  /* o ponteiro: só quando ENTRA num elemento novo (pointerover dispara a cada filho) */
  var sobAntes = null;
  function aoEntrar(e) {
    var alvo = e.target.closest ? e.target.closest(ATIVOS) : null;
    if (alvo === sobAntes) return;
    sobAntes = alvo;
    if (alvo) acender(alvo);
  }

  /* ---------- medida ---------- */
  function medir() {
    var w = window.innerWidth, h = window.innerHeight, d = Math.min(window.devicePixelRatio || 1, celular ? 1.25 : 1.5);
    if (w !== W || h !== H || d !== dpr) {
      W = w; H = h; dpr = d;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    medirDocumento();
    sujo = false;
  }
  /* o FAQ abrindo muda a altura a cada quadro por 0,4 s, e a barra do
     celular dispara resize na rolagem: mede quando PARAR (120 ms) */
  var pedidoEm = 0;
  function pedirMedida() { pedidoEm = performance.now(); desenhouParado = false; }

  /* ---------- por quadro ---------- */
  var folego = 0;
  function quadro(S) {
    if (pedidoEm && S.now - pedidoEm > 120) { pedidoEm = 0; sujo = true; }
    if (sujo) medir();
    if (parado) {
      /* reduzido: redesenha quando a página rola ou o mini muda (salto por âncora, menu) */
      var m0 = B.rede.extra;
      var ass = Math.round(rolagem) + ':' + (m0 ? Math.round(m0.x) + ',' + Math.round(m0.y) + ',' + m0.vis.toFixed(2) : '');
      if (ass !== assinatura) { assinatura = ass; desenhouParado = false; }
      if (!desenhouParado) { posicionar(); desenhar(); desenhouParado = true; }
      return;
    }
    passo(Math.min(0.05, S.dt / 1000), B.relogio());
    desenhar();
  }

  /* as âncoras e os textos na tela, neste quadro */
  function posicionar() {
    var nu = B.nucleo;
    if (nu && nu.py !== undefined) { nu.cx = nu.px - window.scrollX; nu.cy = nu.py - rolagem; }   /* o mini lê o reator daqui, sem um quadro de atraso */
    for (var g = 0; g < grudes.length; g++) { var g0 = grudes[g]; g0.d = Math.max(0, Math.min(g0.fim - g0.inicio, rolagem - g0.inicio)); }
    for (var a = 0; a < ancoras.length; a++) { var an = ancoras[a]; an.x = an.dx; an.y = an.dy - rolagem + (an.item.ref ? an.item.ref.d : 0); }
    textosNaTela();
  }

  var atratores = [], ultimoToque = {};
  function passo(dt, t) {
    var F = B.FOLEGO, x = faseDoFolego(t);
    folego = x < F.inspira ? suave(x / F.inspira) : 1 - suave((x - F.inspira) / (1 - F.inspira));
    var dy = rolagem - rolagemAntes;
    rolagemAntes = rolagem;
    velRol += (dy / Math.max(dt, 0.001) - velRol) * Math.min(1, dt * 6);
    posicionar();
    feixes.deslocar(dy * PARALAXE);
    for (var e = 0; e < elementos.length; e++) if (elementos[e].ativo > 0) elementos[e].ativo = Math.max(0, elementos[e].ativo - dt * (elementos[e].rapido ? 5 : 0.9));
    ponteiro.a += ((ponteiro.ativo ? 1 : 0) - ponteiro.a) * Math.min(1, dt * 4);

    atratores.length = 0;
    if (ponteiro.a > 0.5) atratores.push({ x: ponteiro.x, y: ponteiro.y, r: CURSOR.r, s: CURSOR.s });
    var m = B.rede.extra;
    if (m && m.atrator && m.ativo) atratores.push(m.atrator());
    /* no expirar a rede solta mais energia (respira com o reator) */
    var expira = x > F.inspira;
    feixes.passo(dt, { atratores: atratores, vento: 1 + VENTO_MAX * limitar(Math.abs(velRol) / VENTO_VEL), semear: true, intervalo: expira ? 0.22 + Math.random() * 0.25 : 0.45 + Math.random() * 0.4 });
    tocar(t);
  }
  /* o feixe que passa no cursor se carrega (um anel marca o toque) */
  function tocar(t) {
    if (ponteiro.a < 0.5) return;
    var f = feixes.perto(ponteiro.x, ponteiro.y, TOQUE);
    if (!f || t - (ultimoToque[f.id] || -9) < 1.5) return;
    ultimoToque[f.id] = t;
    f.carga = 1;
    feixes.evento('toque', f.x, f.y);
  }

  /* ---------- desenho ---------- */
  /* os textos deste quadro (a borracha, os feixes e o mini consultam esta lista) */
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
  function desenhar() {
    ctx.clearRect(0, 0, W, H);
    var resp = parado ? 1 : 0.8 + 0.2 * folego;   /* nunca acima de 1 */
    feixes.desenhar(false, resp);
    feixes.desenharEventos();
    var extra = B.rede.extra;
    if (extra && extra.desenharFundo) extra.desenharFundo(ctx);   /* o que o mini traça: também some atrás do texto */
    apagarTextos();
    if (celular) desenharTrilho(resp);
    desenharCantos();
  }
  /* o trilho do celular: os feixes da margem direita, por cima da borracha
     (moram fora da coluna de texto), entre a nav e o começo do rodapé */
  function desenharTrilho(resp) {
    var fim = Math.min(H, rodapeY - rolagem - 60);
    if (fim <= navH) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(W - 2 * TRILHO_BORDA, navH, 2 * TRILHO_BORDA, fim - navH); ctx.clip();
    feixes.desenhar(true, resp);
    ctx.restore();
  }

  /* a leitura manda: atrás de texto a rede some */
  function apagarTextos() {
    ctx.globalCompositeOperation = 'destination-out';
    if (navH) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, navH + 4); }
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
  /* os cantos em L do elemento aceso (visor, não borda) */
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
    feixes: feixes,
    /* um feixe de `de` na direção de `para` (forte: passa do limite) */
    lancar: function (de, para, opcoes) {
      if (parado) return null;
      var o = opcoes || {};
      return feixes.criar(de.x, de.y, feixes.dirDe(para.x - de.x, para.y - de.y), { forcar: true, carga: o.carga || 0.8, cauda: o.cauda, vida: o.vida, reto: o.reto });
    },
    /* `n` feixes saindo de p em direções espalhadas */
    dispararDe: function (p, n) {
      if (parado) return;
      var gira = (Math.random() * 8) | 0;
      for (var i = 0; i < n; i++) feixes.criar(p.x, p.y, (gira + Math.round(i * 8 / n)) % 8, { forcar: true, carga: 0.6, vida: 3 + Math.random() * 3 });
    },
    alturaDoc: function () { return docH; },
    naZona: function (x, y) { return naZona(x, y); },
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
    rodapeNaTela: function () { return rodapeY - rolagem; },
    tela: function () { return { W: W, H: H, topo: navH }; }
  };

  /* ---------- eventos (só anotam) ---------- */
  window.addEventListener('resize', pedirMedida, { passive: true });
  window.addEventListener('scroll', function () { rolagem = window.scrollY; }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(pedirMedida).observe(document.body);
  /* as fontes mudam a largura das linhas: mede de novo quando chegam */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pedirMedida);
  /* o clique (ou o toque, no celular: o click só vem de toque, nunca de
     rolagem) solta um pulso de energia no ponto */
  document.addEventListener('click', function (e) {
    if (parado || !e.isTrusted || e.clientY < navH) return;
    feixes.pulso(e.clientX, e.clientY, 4);
  }, { passive: true });
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
      acender(el);
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
  B.on('reduzir', function (sim) {
    parado = !!sim; desenhouParado = false;
    if (parado) congelar();
  });

  /* movimento reduzido: um quadro só, com os feixes já andados (nada se move depois) */
  function congelar() {
    if (!feixes.lista.length) for (var i = 0; i < feixes.alvo(); i++) feixes.semear();
    for (var k = 0; k < 45; k++) feixes.passo(1 / 30, { atratores: [], semear: false });
    feixes.limparEventos();
  }

  /* quando começa. Vindo de outra página do site, JÁ: os feixes herdados
     aparecem no primeiro quadro, sem o vão de fundo vazio na troca. Na
     primeira visita, depois do load (nada no caminho da 1ª pintura) e
     acendendo devagar */
  function comecar() {
    medir();
    if (herdada) { feixes.herdar(herdada, W, H); herdada = null; }
    if (parado) congelar();
    cv.classList.add('is-viva');
    B.add('rede', quadro);
    B.iniciar();
  }
  if (herdada) {
    cv.classList.add('is-herdada');
    comecar();
    quadro({ dt: 16, now: performance.now() });   /* já desenhada quando a View Transition capturar a página nova */
  } else {
    var ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 1); };
    if (document.readyState === 'complete') ocioso(comecar, { timeout: 900 });
    else window.addEventListener('load', function () { ocioso(comecar, { timeout: 900 }); }, { once: true });
  }
})();
