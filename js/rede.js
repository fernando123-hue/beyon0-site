/* ==========================================================================
   A REDE — a ponte entre o CAMPO DO REATOR (js/campo.js) e a página.
   Terceira forma (pedido do dono, 2026-10-03: o fundo de feixes soltos lia
   como desordem; "quero algo grandioso, que ressoe com o AI Core e interaja
   com o usuário e com todos os elementos que existem e que irão existir").

   Um canvas 2D fixo atrás do conteúdo (o AI Core continua sendo o único
   WebGL). Aqui fica o que é da página:
   - a ORIGEM do campo: no Hub, o centro do reator (medido na caixa dele, por
     evento); nas outras páginas, um reator "acima" da página, no centro;
   - o FÔLEGO (B.relogio/B.FOLEGO, o mesmo do reator): ao expirar, a onda;
     ao inspirar, pacotes saem dos elementos na tela e correm para o núcleo;
   - os ELEMENTOS: qualquer opção ou cartão (inclusive os que vierem: links,
     botões, [data-campo]) é acendido quando a onda o cruza; sob o cursor
     (ou no centro da tela, no celular), a ROTA dele até o núcleo acende e
     pacotes descem por ela. Avisa B.emit('opcao', …) para o reator e o mini;
   - o CLIQUE (ou toque) manda um sinal pelo campo até o núcleo; quando ele
     chega, B.emit('campo:chegou');
   - a LEITURA manda: todo texto é apagado do campo (js/rede-texto.js).
   - no DESKTOP (2026-10-03, pedido do dono: o campo polar "não cai bem pro
     site todo"; o celular fica como está) o campo vale só no hero do Hub,
     com a varredura; o resto da página é o
     INSTRUMENTO DESENROLADO (js/trilho.js). Nas outras páginas também: o
     campo (com a origem acima da página) no hero, o trilho dali para baixo. fundoEm(x, y) escolhe quem
     responde por cada ponto da tela.

   Leis (docs/HANDOFF.md §4): nada contínuo passa pelo CSS; layout lido só
   em evento, em posições de LAYOUT; um rAF só (B.add). Nada de desfoque.
   ========================================================================== */
(function () {
  'use strict';
  var B = window.BEYON;
  var cv = document.querySelector('[data-rede]');
  if (!B || !B.campo || !cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  if (window.navigator.connection && navigator.connection.saveData) return;

  var celular = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  var ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- a paleta (os tokens, lidos uma vez) ---------- */
  var est = getComputedStyle(document.documentElement);
  var rgb = function (nome, padrao) { return (est.getPropertyValue(nome).trim() || padrao).replace(/\s+/g, ','); };
  var AC = rgb('--ac-rgb', '73 229 221'), AC2 = rgb('--ac-2-rgb', '166 244 239'), AC3 = rgb('--ac-3-rgb', '28 181 185'), PRATA = rgb('--prata-rgb', '183 191 192'), T1 = '242,244,244';

  /* ---------- números ---------- */
  /* o que conta como elemento do site: as opções e os cartões de hoje e os
     que vierem (qualquer link, botão ou [data-campo]) */
  var OPCOES = 'a[href], button, [role="button"], .painel, .celula, .cenario, .qa, .spec__item, .prova__item, .passo, .laudo__row, [data-campo]';
  /* os MÓDULOS que se ligam aos irmãos pelo barramento (css/cartoes.css):
     cada grupo é o conjunto de módulos com o mesmo pai, na ordem do documento */
  var LIGAVEIS = '.hero__rail > a, .hero__rail > div:not(.hero__rail-aresta), .servico, .laudo__row, .celula, .cenario, .qa, .spec__item, [data-campo]';
  var CARTOES = '.painel, .btn, .console, .janela, .instrumento, .passo, .prova__item, .qa, .spec__item, .cenario, .celula, ' + LIGAVEIS;
  var BUS = { recuo: 24, cabeca: 28, chanfro: 6, no: 3.5, alfa: 0.4, aceso: 0.45 };   /* px: x do barramento vertical, y do horizontal, chanfro, meio lado do nó */
  var R0_SEM_REATOR = celular ? 150 : 230;   /* px: a escala do campo nas páginas sem o reator */
  var ACIMA = 0.5;                           /* nas páginas sem o reator, a origem fica esta fração da tela acima do topo */
  var COLETA = { elementos: 5, soltos: 6, fase: 0.86, passo: 0.12 };   /* pacotes por fôlego, a fase em que partem, s entre um e outro */
  var filaColeta = [];                             /* a coleta escalonada */
  var PULSO_CLIQUE = 350;                    /* ms entre sinais de clique */

  var dpr = 1, W = 0, H = 0, docH = 1, navH = 0, rodapeY = 1e9;
  var elementos = [], textos = [], naTela = [], caixaNucleo = null, caixaArte = null, ligacoes = [];
  var ponteiro = { x: -1e4, y: -1e4, ativo: false };
  var rolagem = window.scrollY;
  var sujo = true, parado = !!B.reduced, desenhouParado = false, assinatura = -1, iniciada = false;
  var faseAntes = 0, folego = 0, rotorAng = 0, giroAntes = null, dtQuadro = 0.016;

  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function suave(x) { x = limitar(x); return x * x * (3 - 2 * x); }
  function faseDoFolego(t) { var F = B.FOLEGO; return ((t / F.periodo) % 1 + 1) % 1; }

  var cores = { AC: AC, AC2: AC2, T1: T1, PRATA: PRATA };
  var livre = function (x, y) { return y > navH + 8 && x > 8 && x < W - 8 && !naZona(x, y); };
  var trilho = !celular && B.trilho ? B.trilho({ ctx: ctx, cores: cores, livre: livre }) : null;
  var campo = B.campo({ ctx: ctx, cores: cores, celular: celular, livre: livre, varre: !!trilho });
  var heroFim = 0;   /* (desktop) o fim do hero no documento: ali o campo dá lugar ao trilho */
  var heroBase = 0, expirouQuadro = false;   /* o fim do hero (desktop e celular), para o fundo próprio de Sites/Automação (js/hero-fundo.js) */
  var GEO_HF = { W: 0, H: 0, topo: 0, fim: 0, rolagem: 0, sx: 0, cursor: null, t: 0, dt: 0, folego: 0, expirou: false, parado: false, livre: null, cel: false, cursorNovo: false };
  /* o campo anda? No celular na página toda; no desktop nas páginas com hero (e só desenha enquanto ele está na tela) */
  function usaCampo() { return !trilho || heroFim > 0; }
  function heroFimTela() { return heroFim - rolagem; }
  function fundoEm(x, y) { return !trilho || y < heroFimTela() ? campo : trilho; }
  function topoTrilho() { return Math.max(navH, heroFimTela()); }

  /* ---------- o documento: elementos e textos em posições de LAYOUT ---------- */
  function posicaoDoc(el) {
    var x = 0, y = 0, ultimo = el;
    for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; ultimo = e; }
    /* a cadeia terminou num elemento FIXO (o palco pinado pelo GSAP): a conta
       deu posição na tela; a natural na página é a da tela mais o começo do pin */
    if (ultimo !== document.body && getComputedStyle(ultimo).position === 'fixed') y += B.pino && B.pino.el.contains(ultimo) ? B.pino.inicio : window.scrollY;
    return { x: x, y: y };
  }
  var grudes = [];   /* títulos fixos e palco pinado (js/rede-texto.js) */
  function refDe(el) { for (var i = 0; i < grudes.length; i++) if (grudes[i].el.contains(el)) return grudes[i]; return null; }
  function telaY(r) { return r.y - rolagem + (r.ref ? r.ref.d : 0); }
  function medirDocumento() {
    var prender = B.redeTexto ? B.redeTexto.soltar() : function () {};
    grudes = B.redeTexto ? B.redeTexto.grudes(posicaoDoc) : [];
    var lista = document.querySelectorAll(CARTOES), i, antes = elementos.slice();
    elementos.length = 0;
    for (i = 0; i < lista.length; i++) {
      var el = lista[i];
      if (!el.offsetWidth || el.closest('[aria-hidden="true"]:not(.hero__arte)') || el.closest('.nav, .barra')) continue;
      var p = posicaoDoc(el), it = null;
      for (var k = 0; k < antes.length && !it; k++) if (antes[k].el === el) it = antes[k];
      if (!it) it = { el: el, ativo: 0, onda: 0, secao: el.closest('section'), liga: el.matches(LIGAVEIS) };
      it.dx = p.x; it.dy = p.y; it.w = el.offsetWidth; it.h = el.offsetHeight; it.ref = refDe(el);
      elementos.push(it);
    }
    /* o barramento: cada módulo com o próximo irmão módulo */
    ligacoes.length = 0;
    for (i = 0; i < elementos.length; i++) {
      var a = elementos[i];
      if (!a.liga) continue;
      /* (desktop) num grupo com estação no centro, quem liga os módulos é ela (js/estacao.js): o barramento entre irmãos atravessaria o corredor */
      var vaoPai = a.el.parentNode.querySelector && a.el.parentNode.querySelector(':scope > .estacao-vao');
      if (!celular && vaoPai && vaoPai.offsetWidth) continue;   /* (o espaço some em janela estreita: lá o barramento volta) */
      /* (celular) na pilha os cards se escondem uns atrás dos outros: sem barramento entre eles */
      if (celular && a.el.parentNode.classList && a.el.parentNode.classList.contains('pilha')) continue;
      for (var j = i + 1; j < elementos.length; j++) {
        var b = elementos[j];
        if (b.liga && b.el.parentNode === a.el.parentNode) { ligacoes.push([a, b]); break; }
      }
    }
    var nav = document.querySelector('.nav');
    navH = nav ? nav.offsetHeight : 0;
    var rod = document.querySelector('.footer');
    rodapeY = rod ? posicaoDoc(rod).y : 1e9;
    textos = B.redeTexto ? B.redeTexto(posicaoDoc, celular, refDe) : [];
    prender();
    if (rodapeY > 1e8) rodapeY = document.documentElement.scrollHeight;
    docH = document.documentElement.scrollHeight;
    if (trilho) medirTrilho();
    var heroEl = document.querySelector('.hero');
    heroBase = heroEl ? posicaoDoc(heroEl).y + heroEl.offsetHeight : 0;
    if (B.heroFundo) {
      var tit = document.querySelector('.hero__title');
      B.heroFundo.medir(posicaoDoc, { topoDoc: navH, W: W, colE: tit ? posicaoDoc(tit).x : 24 });
    }
    /* a caixa do reator (Hub): a origem do campo, medida aqui e não por
       quadro; inclui o translate fixo dela no desktop */
    var cn = document.querySelector('[data-nucleo]');
    caixaNucleo = null; caixaArte = null;
    /* (desktop, sem reator) o campo do hero nasce atrás da arte dele (o
       mockup, o console): ela vira o objeto medido, e as linhas saem dela em
       vez de descer do alto sobre o título (crítica de arte) */
    var arte = trilho && !cn ? document.querySelector('.hero__arte') : null;
    if (arte && arte.offsetWidth) {
      /* o vão do campo (1,45 × R0) passa da borda mais longe da arte com folga: os rumos não ficam atrás dela */
      var pa = posicaoDoc(arte), maior = Math.max(arte.offsetWidth, arte.offsetHeight);
      caixaArte = { x: pa.x + arte.offsetWidth / 2, y: pa.y + arte.offsetHeight / 2, R0: (maior / 2 + 30) / 1.45 };
    }
    if (cn && cn.offsetWidth) {
      var pn = posicaoDoc(cn), tf = getComputedStyle(cn).transform, mx = 0, my = 0;
      if (tf && tf !== 'none' && window.DOMMatrixReadOnly) { var mt = new DOMMatrixReadOnly(tf); mx = mt.e; my = mt.f; }
      caixaNucleo = { x: pn.x + mx + cn.offsetWidth / 2, y: pn.y + my + cn.offsetHeight / 2, R0: cn.offsetWidth * 0.5 };
    }
  }
  /* o trilho: a coluna de conteúdo, os começos de seção (com o índice do
     kicker) e os módulos que encostam na coluna */
  function medirTrilho() {
    var sec = document.querySelector('main .section'), hero = document.querySelector('.hero');
    heroFim = hero ? posicaoDoc(hero).y + hero.offsetHeight : 0;
    if (!sec) return;
    var cs = getComputedStyle(sec), x0 = posicaoDoc(sec).x + parseFloat(cs.paddingLeft);
    var g = { fim: rodapeY, colE: x0, colD: x0 + sec.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), secoes: [], modulos: [] };
    var ss = document.querySelectorAll('main section[id]:not(.hero)');
    for (var i = 0; i < ss.length; i++) {
      if (!ss[i].offsetHeight) continue;
      var k = ss[i].querySelector('.kicker'), kb = k && k.querySelector('b');
      /* (data-nome: o texto final guardado por js/escrita.js, que embaralha o rótulo por 320 ms ao entrar) */
      var nome = k ? (k.getAttribute('data-nome') || k.textContent.replace(kb ? kb.textContent : '', '')).trim().toUpperCase() : '';
      g.secoes.push({ y: posicaoDoc(ss[i]).y, rot: kb ? kb.textContent.trim() : '', nome: nome });
    }
    for (var j = 0; j < elementos.length; j++) {
      var it = elementos[j];
      if (it.ref || !(it.liga || it.el.matches('.painel'))) continue;
      g.modulos.push({ x: it.dx, y: it.dy, w: it.w, h: it.h });
    }
    trilho.configurar(g, W || window.innerWidth);
  }
  /* os GRUPOS de módulos (3+ irmãos com o mesmo pai, fora do hero e de
     palco pinado): onde as estações (js/estacao.js) se ligam */
  function gruposDeModulos() {
    var porPai = [], i, j;
    for (i = 0; i < elementos.length; i++) {
      var it = elementos[i];
      if (!it.liga || it.ref || it.dy < heroFim) continue;
      var g = null;
      for (j = 0; j < porPai.length && !g; j++) if (porPai[j].pai === it.el.parentNode) g = porPai[j];
      if (!g) { g = { pai: it.el.parentNode, itens: [] }; porPai.push(g); }
      g.itens.push(it);
    }
    return porPai.filter(function (g) { return g.itens.length >= 3; });
  }
  function itemDe(el) { for (var i = 0; i < elementos.length; i++) if (elementos[i].el === el) return elementos[i]; return null; }

  /* ---------- medida ---------- */
  /* o teto do dpr do canvas do fundo: 1,5; numa página que anda devagar (B 'lento': 3 s abaixo de 42 fps) cai a 1
     — o custo de pintar o fundo é por pixel (degrada medindo, como o reator) */
  var tetoDpr = 1.5;
  B.on('lento', function () { if (tetoDpr > 1) { tetoDpr = 1; pedirMedida(); } });
  function medir() {
    /* a largura do canvas é a da página SEM a barra de rolagem (inset: 0): com
       innerWidth o desenho saía ~1% comprimido (o ramo errava o card em 8 px) */
    var w = document.documentElement.clientWidth || window.innerWidth, h = window.innerHeight, d = Math.min(window.devicePixelRatio || 1, tetoDpr);
    if (w !== W || h !== H || d !== dpr) {
      W = w; H = h; dpr = d;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.__dpr = dpr;   /* (B.texto desenha os sprites nos pixels deste canvas) */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    medirDocumento();
    sujo = false;
    B.emit('rede:medida');
    desenhouParado = false;   /* mudar cv.width limpa o canvas: o quadro parado precisa ser refeito */
  }
  var pedidoEm = 0, primeiroPedido = 0;
  function pedirMedida() { pedidoEm = performance.now(); if (!primeiroPedido) primeiroPedido = pedidoEm; desenhouParado = false; }

  /* ---------- por quadro ---------- */
  function posicionar() {
    var nu = B.nucleo;
    if (nu && nu.py !== undefined) { nu.cx = nu.px - B.S.sx; nu.cy = nu.py - rolagem; }   /* o mini lê o reator daqui */
    for (var g = 0; g < grudes.length; g++) { var g0 = grudes[g]; g0.d = Math.max(0, Math.min(g0.fim - g0.inicio, rolagem - g0.inicio)); }
    for (var e = 0; e < elementos.length; e++) { var it = elementos[e]; it.x = it.dx; it.y = it.dy - rolagem + (it.ref ? it.ref.d : 0); }
    textosNaTela();
    /* a origem do campo, em coordenadas da tela */
    /* o rotor do campo acompanha a roda do reator (no plano da tela o ângulo cresce no sentido horário) */
    /* o rotor segue a roda, mas com teto de 0,15 rad/s: o impulso da rolagem
       e da agitação no raio de 700 px virava hélice (crítica rodada 2) */
    if (nu && nu.giro !== undefined) {
      if (giroAntes !== null) { var dg = nu.giro - giroAntes, teto = 0.15 * Math.max(dtQuadro, 0.001); rotorAng -= Math.max(-teto, Math.min(teto, dg)); }
      giroAntes = nu.giro;
    }
    var rotor = rotorAng;
    if (caixaNucleo) campo.origem(caixaNucleo.x - B.S.sx, caixaNucleo.y - rolagem, caixaNucleo.R0, 0, rotor);
    else if (caixaArte) campo.origem(caixaArte.x - B.S.sx, caixaArte.y - rolagem, caixaArte.R0, 0, 0);
    else campo.origem(W / 2, -H * ACIMA - rolagem, R0_SEM_REATOR, 0, 0);
    if (trilho) trilho.origem(rolagem, topoTrilho(), W, H);
  }
  function quadro(S) {
    /* remedir percorre a página inteira (layout forçado): espera a rolagem
       parar, com teto de 1,2 s para não ficar velho numa rolagem longa */
    if (pedidoEm && S.now - pedidoEm > 120 && (S.now - B.S.rolouEm > 180 || S.now - primeiroPedido > 1200)) { pedidoEm = 0; primeiroPedido = 0; sujo = true; }
    if (sujo) medir();
    if (parado) {
      var m0 = B.rede.extra, ass = Math.round(rolagem) * 7 + (m0 ? Math.round(m0.x) * 13 + Math.round(m0.y) * 17 + Math.round(m0.vis * 20) : 0);
      if (ass !== assinatura) { assinatura = ass; desenhouParado = false; }
      if (!desenhouParado) { posicionar(); campo.enquadrar(W, H, navH); desenhar(); desenhouParado = true; }
      return;
    }
    passo(Math.min(0.05, S.dt / 1000), B.relogio());
    desenhar();
  }

  var estado = { W: 0, H: 0, topo: 0, cursor: ponteiro, reduzido: false, rLimite: 24000 };
  function passo(dt, t) {
    var F = B.FOLEGO, x = faseDoFolego(t);
    folego = x < F.inspira ? suave(x / F.inspira) : 1 - suave((x - F.inspira) / (1 - F.inspira));
    dtQuadro = dt;
    if ((B.agitacao || 0) < 0.2) degrauAgitado = 0;
    posicionar();
    /* o fôlego do reator move o campo: expirar solta a onda; inspirar recolhe */
    if (faseAntes < F.inspira && x >= F.inspira) { if (usaCampo()) campo.soltarOnda(); if (trilho) trilho.soltarOnda(); expirouQuadro = true; }
    /* a coleta parte ANTES do lampejo do reator (x = 0), escalonada: a
       mediana dos pacotes chega junto com ele (causa antes do efeito) */
    if (faseAntes < COLETA.fase && x >= COLETA.fase) coletar();
    faseAntes = x;
    for (var q = filaColeta.length - 1; q >= 0; q--) { filaColeta[q].t -= dt; if (filaColeta[q].t <= 0) { filaColeta[q].f(); filaColeta.splice(q, 1); } }
    estado.W = W; estado.H = H; estado.topo = navH;
    /* com o trilho, a onda do campo morre no fim do hero */
    var yFim = trilho ? heroFimTela() : docH - rolagem;
    estado.rLimite = Math.max(campo.polar(0, yFim).r, campo.polar(W, yFim).r);
    var chegadas = 0;
    if (usaCampo()) chegadas += campo.passo(dt, estado).chegadas;
    if (trilho) chegadas += trilho.passo(dt, estado).chegadas;
    if (chegadas) B.emit('campo:chegou', chegadas);
    /* a onda cruza os elementos: eles acendem (a onda de quem responde por eles) */
    for (var e = 0; e < elementos.length; e++) {
      var it = elementos[e];
      if (it.onda > 0) it.onda = Math.max(0, it.onda - dt * 0.9);
      if (it.ativo > 0 && it.el !== sobAntes && it.el !== centroAgora) it.ativo = Math.max(0, it.ativo - dt * 2.5);
      if (it.y + it.h < navH || it.y > H) continue;
      var cx = it.x + it.w / 2, cy = it.y + it.h / 2, fu = fundoEm(cx, cy), ondas = fu.ondas;
      var r = fu.raio(cx, cy);
      for (var o = 0; o < ondas.length; o++) if (ondas[o].rAntes < r && ondas[o].r >= r) it.onda = 1;
    }
  }
  /* inspirar: alguns elementos na tela e alguns pontos soltos mandam energia ao núcleo */
  function coletar() {
    var vistos = [], i;
    for (i = 0; i < elementos.length; i++) { var it = elementos[i]; if (it.y > navH && it.y + it.h < H) vistos.push(it); }
    var n = 0;
    for (i = 0; i < COLETA.elementos && vistos.length; i++) {
      var k = (Math.random() * vistos.length) | 0, v = vistos.splice(k, 1)[0];
      filaColeta.push({ t: COLETA.passo * n++, f: rotaDoElemento(v) });
    }
    for (i = 0; i < COLETA.soltos; i++) filaColeta.push({ t: COLETA.passo * n++, f: pacoteSolto });
  }
  function rotaDoElemento(v) {
    return function () { var cx = v.x + v.w / 2, cy = v.y + v.h / 2; if (cy > navH && cy < H) rotaDe(cx, cy, { vida: 1.1 }); };
  }
  function pacoteSolto() {
    var px = Math.random() * W, py = navH + Math.random() * (H - navH);
    if (fundoEm(px, py) === trilho) { trilho.pacote(py, trilho.ladoDe(px)); return; }
    var p = campo.polar(px, py);
    campo.pacote(p.r, campo.raioPerto(p.r, p.a));
  }
  /* a rota de um ponto da tela até o núcleo, por quem responde por ele */
  function rotaDe(x, y, o) { var fu = fundoEm(x, y); return fu.dentroDoVao(x, y) ? null : fu.rota(x, y, o); }

  /* ---------- desenho ---------- */
  function textosNaTela() {
    naTela.length = 0;
    for (var i = 0; i < textos.length; i++) {
      var r = textos[i], y = telaY(r);
      if (y - 30 > H || y + r.h + 30 < 0) continue;
      naTela.push(r);
    }
  }
  function naZona(x, y) {
    for (var i = 0; i < naTela.length; i++) {
      var r = naTela[i];
      if (r.halo || r.folga < 0) continue;
      var ry = telaY(r), f = r.folga;
      if (x > r.x - f && x < r.x + r.w + f && y > ry - f && y < ry + r.h + f) return true;
    }
    return false;
  }
  function desenhar() {
    ctx.clearRect(0, 0, W, H);
    var resp = parado ? 1 : 0.8 + 0.2 * folego;
    /* (desktop) com o hero fora da tela o campo não desenha (o passo continua: as ondas não congelam) */
    var hf = B.heroFundo, hfTela = heroBase - rolagem;
    /* (celular, Sites e Automação) o hero é do fundo próprio: o campo só é
       desenhado do fim do hero para baixo, começando em degraus nítidos */
    var heroProprioCel = hf && !trilho && hfTela > navH;
    if (usaCampo() && (!trilho || heroFimTela() > navH)) {
      /* (Sites e Automação) no desktop o hero tem o fundo próprio no lugar do campo */
      if (hf && trilho) desenharHeroFundo(hf, hfTela);
      else if (heroProprioCel) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, hfTela - 60, W, H); ctx.clip();
        campo.desenhar(resp, !parado);
        ctx.restore();
        ctx.globalCompositeOperation = 'destination-out';
        for (var dc = 0; dc < 3; dc++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.75 - 0.25 * dc).toFixed(2) + ')'; ctx.fillRect(0, hfTela - 60 + dc * 20, W, 20); }
        ctx.globalCompositeOperation = 'source-over';
      } else campo.desenhar(resp, !parado);
      /* (desktop) o campo termina no fim do hero, em degraus nítidos como no rodapé */
      if (trilho) {
        var heroFimY = heroFimTela();
        ctx.globalCompositeOperation = 'destination-out';
        for (var d = 0; d < 4; d++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.25 * (d + 1)).toFixed(2) + ')'; ctx.fillRect(0, heroFimY - 80 + d * 20, W, 20); }
        ctx.fillStyle = '#000'; ctx.fillRect(0, heroFimY, W, Math.max(0, H - heroFimY));
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (heroProprioCel) desenharHeroFundo(hf, hfTela);
    expirouQuadro = false;
    if (trilho) trilho.desenhar(resp, !parado);
    var extra = B.rede.extra;
    if (extra && extra.desenharFundo) extra.desenharFundo(ctx);   /* o que o mini traça: também some atrás do texto */
    for (var fz = 0; fz < B.rede.fundos.length; fz++) B.rede.fundos[fz].desenharFundo(ctx);   /* as estações */
    apagarTextos();
    desenharBarramento();
    desenharElementos();
  }
  /* o fundo próprio do hero (js/hero-fundo.js), recortado ao hero */
  function livreDoTexto(x, y) { return !naZona(x, y); }
  function desenharHeroFundo(hf, fim) {
    var g = GEO_HF;
    g.W = W; g.H = H; g.topo = navH; g.fim = Math.min(H, fim); g.rolagem = rolagem; g.sx = B.S.sx; g.cursor = ponteiro;
    g.t = B.relogio(); g.dt = dtQuadro; g.folego = parado ? 1 : folego; g.expirou = expirouQuadro; g.parado = parado; g.livre = livreDoTexto; g.cel = celular;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, navH, W, Math.max(0, g.fim - navH)); ctx.clip();
    hf.desenhar(ctx, g);
    ctx.restore();
  }
  /* o caminho de A até B pelo vão (coordenadas da tela): lado a lado, um
     abaixo do outro, ou a fileira que quebra (chanfro de 45°, como trilha de
     placa). Devolve [x0, y0, x1, y1, ...] num vetor reaproveitado */
  var cam = [];
  function caminho(A, B) {
    cam.length = 0;
    var ax1 = A.x + A.w, ay1 = A.y + A.h, bx1 = B.x + B.w;
    if (B.x >= ax1 - 1) {
      /* à direita: na altura da "cabeça" do mais baixo dos dois, dentro dos dois */
      var y = Math.max(A.y, B.y) + Math.min(BUS.cabeca, B.h / 2);
      if (y > ay1 - 8) y = A.y + Math.min(BUS.cabeca, A.h / 2);
      cam.push(ax1 - 1, y, B.x + 1, y);
    } else if (B.y >= ay1 - 1) {
      var ox = Math.max(A.x, B.x) + BUS.recuo;
      if (ox < Math.min(ax1, bx1) - 4) cam.push(ox, ay1 - 1, ox, B.y + 1);
      else {
        var xa = A.x + BUS.recuo, xb = B.x + BUS.recuo, ym = (ay1 + B.y) / 2, s = xb > xa ? 1 : -1;
        var c = Math.min(BUS.chanfro, (B.y - ay1) / 2, Math.abs(xb - xa) / 2);
        cam.push(xa, ay1, xa, ym - c, xa + s * c, ym, xb - s * c, ym, xb, ym + c, xb, B.y);
      }
    }
    return cam;
  }
  function desenharBarramento() {
    ctx.lineWidth = 1;
    for (var i = 0; i < ligacoes.length; i++) {
      var A = ligacoes[i][0], B = ligacoes[i][1];
      if (Math.max(A.y + A.h, B.y + B.h) < navH || Math.min(A.y, B.y) > H) continue;
      var c = caminho(A, B);
      if (c.length < 4) continue;
      var k = Math.max(A.onda, B.onda, A.ativo, B.ativo);
      /* o VÃO entre os dois fica limpo do campo: um raio atravessando o mesmo
         vão lia como uma segunda ligação, sem nó (crítica rodada 3) */
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      if (B.x >= A.x + A.w - 1) ctx.fillRect(A.x + A.w, Math.max(A.y, B.y), B.x - A.x - A.w, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y));
      else { var gx0 = Math.min(A.x, B.x), gx1 = Math.max(A.x + A.w, B.x + B.w); ctx.fillRect(gx0, A.y + A.h, gx1 - gx0, B.y - A.y - A.h); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(' + window.BEYON.tom(AC3) + ',' + (BUS.alfa + BUS.aceso * k).toFixed(3) + ')';   /* (aqui B é o ponto do barramento, não o BEYON) */
      ctx.beginPath(); ctx.moveTo(c[0], c[1]);
      for (var p = 2; p < c.length; p += 2) ctx.lineTo(c[p], c[p + 1]);
      ctx.stroke();
      /* o nó: no meio do trecho do meio (no caminho com chanfro, o horizontal) */
      var m = c.length > 4 ? 4 : 0, nx = (c[m] + c[m + 2]) / 2, ny = (c[m + 1] + c[m + 3]) / 2, s = BUS.no;
      ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(nx - s, ny - s, 2 * s, 2 * s);
      ctx.strokeStyle = 'rgba(' + window.BEYON.tom(AC2) + ',' + (0.5 + 0.45 * k).toFixed(3) + ')';
      ctx.strokeRect(nx - s + 0.5, ny - s + 0.5, 2 * s - 1, 2 * s - 1);
    }
  }
  /* a leitura manda: atrás de texto o campo some */
  function apagarTextos() {
    ctx.globalCompositeOperation = 'destination-out';
    if (navH) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, navH + 4); }
    /* o rodapé: o campo termina nele (degraus nítidos, sem degradê) */
    var ry = rodapeY - rolagem;
    if (ry < H + 80 && ry > -400) {
      for (var d = 0; d < 4; d++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.25 * (d + 1)).toFixed(2) + ')'; ctx.fillRect(0, ry - 80 + d * 20, W, 20); }
      ctx.fillStyle = '#000'; ctx.fillRect(0, ry, W, H);
    }
    for (var i = 0; i < naTela.length; i++) {
      var r = naTela[i], y = telaY(r);
      if (r.halo) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(r.x - r.folga, y - r.folga, r.w + 2 * r.folga, r.h + 2 * r.folga); continue; }
      if (r.inteiro) { ctx.fillStyle = '#000'; ctx.fillRect(r.x - r.folga, y - r.folga, r.w + 2 * r.folga, r.h + 2 * r.folga); continue; }
      /* a linha do campo passa FRACA atrás do texto em vez de cortada (crítica,
         rodada 1: cortada a seco, longe do reator, o campo lia picotado); nós
         e rótulos nunca entram ali (js/campo.js consulta `livre`) */
      if (r.folga > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(r.x - r.folga, y - r.folga, r.w + 2 * r.folga, r.h + 2 * r.folga); }
      var m = r.folga > 0 ? 4 : r.folga;
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(r.x - m, y - m, r.w + 2 * m, r.h + 2 * m);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  /* a onda passando pelo elemento: a aresta de cima acende da esquerda para
     a direita e apaga (um sinal só; os cantos em L ficaram com o CSS, no
     foco: três sinais de canto liam como seleção deslocada, rodada 1) */
  function desenharElementos() {
    ctx.lineWidth = 1;
    for (var e = 0; e < elementos.length; e++) {
      var it = elementos[e];
      /* só módulos com borda: nos passos e no texto solto a aresta virava um traço flutuando sobre o rótulo */
      if (!it.liga || it.onda < 0.02 || it.y > H + 20 || it.y + it.h < -20) continue;
      /* dentro do canto arredondado (o traço reto escapava dele, crítica rodada 2) */
      var x0 = it.x + 6, y0 = it.y + 0.5, x1 = it.x + it.w - 6;
      var andou = 1 - it.onda, xa = x0 + (x1 - x0) * Math.min(1, andou * 2.2);
      ctx.strokeStyle = 'rgba(' + B.tom(AC) + ',' + (0.55 * it.onda).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(xa, y0); ctx.stroke();
    }
  }

  /* ---------- as opções: sob o cursor (ou no centro da tela, no celular) ---------- */
  var sobAntes = null, rotaSob = null, centroAgora = null, rotaDona = null;
  function apontarNada() { campo.apontar(null); if (trilho) trilho.apontar(null); }
  function opcaoDe(alvo) {
    var el = alvo && alvo.closest ? alvo.closest(OPCOES) : null;
    if (!el || el.closest('[aria-hidden="true"]:not(.hero__arte)')) return null;
    return el;
  }
  function entrar(el, fica) {
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var it = itemDe(el);
    if (it && !parado) it.ativo = 1;   /* reduzido: nada aceso que não apagaria */
    var fu = fundoEm(cx, cy);
    var ro = parado || fu.dentroDoVao(cx, cy) ? null : fu.rota(cx, cy, { fica: fica, vida: 1.4, cada: 0.875 });
    if (!parado) {
      apontarNada();
      /* no hero quem marca é o campo, mas a frase vai para a margem pela régua, como no resto da página (o campo a
         escondia sempre que havia texto por perto: os cards da faixa do hero ficavam sem frase) */
      var noHero = fu === campo && trilho;
      fu.apontar(cx, cy, noHero ? '' : rotuloDe(el));
      if (noHero) trilho.apontar(cx, cy, rotuloDe(el));
    }
    rotaDona = fu;
    B.emit('opcao', { el: el, x: cx, y: cy, w: r.width, h: r.height, entrou: true });
    return ro;
  }
  /* a frase da leitura do rumo (js/trilho.js): o resumo escrito para a opção (data-rotulo) ou, sem ele, o título;
     o trilho a quebra em linhas (aqui só um teto, para nada atravessar a margem inteira) */
  function rotuloDe(el) {
    var t = (el.getAttribute('data-rotulo') || el.getAttribute('aria-label') || '').trim();
    if (!t) { var h = el.querySelector('h3, .hero__rail-k, summary'); t = (h ? h.textContent : el.textContent) || ''; }
    t = t.replace(/[→↓↗\s]+/g, ' ').replace(/^\s*\d+\s+/, '').trim().toUpperCase();
    return t.length > 40 ? t.slice(0, 39).trim() + '…' : t;
  }
  function aoEntrar(e) {
    var el = opcaoDe(e.target);
    if (el === sobAntes) return;
    if (sobAntes) { if (rotaSob && rotaDona) rotaDona.soltarRota(rotaSob); apontarNada(); B.emit('opcao', { el: sobAntes, entrou: false }); }
    sobAntes = el; rotaSob = null;
    if (el) rotaSob = entrar(el, true);
  }

  /* ---------- API para os vizinhos (o mini AI Core, o reator) ---------- */
  B.rede = {
    extra: null,
    /* um sinal do ponto p até o núcleo (o mini usa) */
    dispararDe: function (p) { if (!parado) rotaDe(p.x, p.y, { vida: 1 }); },
    /* uma rota até o núcleo a partir de (x, y) da tela (o mini, na sugestão) */
    rota: function (x, y, o) { return parado ? null : rotaDe(x, y, o); },
    /* quanto o fundo desenhou no último quadro (o verificador: nunca pode sumir em silêncio) */
    desenhados: function () { return (usaCampo() ? campo.desenhados() : 0) + (trilho ? trilho.desenhados() : 0); },
    /* `forte`: fica aceso como sob o cursor por um instante (o turbo das estações) */
    acender: function (el, forte) { var it = itemDe(el); if (it && !parado) { it.onda = 1; if (forte) it.ativo = 1; } },
    /* quem mais desenha no canvas do fundo (as estações): { desenharFundo(ctx) } */
    fundos: [],
    /* (desktop) o instrumento e os grupos de módulos, para as estações */
    trilho: trilho,
    grupos: function () { return trilho ? gruposDeModulos() : []; },
    alturaDoc: function () { return docH; },
    naZona: function (x, y) { return naZona(x, y); },
    /* um elemento na tela, sorteado entre os que estão de `min` a `max` px de (x, y) e passam no `filtro` */
    elementoAoAcaso: function (x, y, min, max, filtro) {
      var escolhido = null, n = 0;
      for (var i = 0; i < elementos.length; i++) {
        var it = elementos[i];
        /* o centro dele na tela, longe das bordas (cartões altos raramente cabem inteiros) */
        var cy = it.y + Math.min(it.h / 2, 60);
        if (cy < navH + 60 || cy > H - 120 || (filtro && !filtro(it))) continue;
        var d = Math.hypot(it.x + it.w / 2 - x, cy - y);
        if (d < min || d > max) continue;
        n++;
        if (Math.random() * n < 1) escolhido = it;
      }
      return escolhido;
    },
    /* o canto, dentre os elementos da seção, mais perto de (x, y) e na tela; null se passar de `max` px */
    cantoPerto: function (secao, x, y, max) {
      var melhor = null, dm = max * max;
      for (var i = 0; i < elementos.length; i++) {
        var it = elementos[i];
        if (secao && it.secao !== secao) continue;
        for (var c = 0; c < 4; c++) {
          var ax = it.x + (c & 1) * it.w, ay = it.y + (c >> 1) * it.h;
          if (ay < navH || ay > H) continue;
          var d = (ax - x) * (ax - x) + (ay - y) * (ay - y);
          if (d < dm) { dm = d; melhor = { x: ax, y: ay, item: it, cx: c & 1, cy: c >> 1 }; }
        }
      }
      return melhor;
    },
    sobreTexto: function (x, y, rx, ry) {
      if (ry === undefined) ry = rx;
      for (var i = 0; i < naTela.length; i++) {
        var q = naTela[i], ty = telaY(q);
        if (q.halo || q.folga < 0) continue;   /* as zonas inteiras (passos, cota) contam: o mini encostava nos passos */
        if (x + rx > q.x && x - rx < q.x + q.w && y + ry > ty && y - ry < ty + q.h) return true;
      }
      return false;
    },
    rodapeNaTela: function () { return rodapeY - rolagem; },
    topo: function () { return navH; },
    /* (x, y) a menos de `r` px da borda de um módulo, na altura dele? */
    sobreModulo: function (x, y, r) {
      for (var i = 0; i < elementos.length; i++) {
        var it = elementos[i];
        var btn = !it.liga && it.el.classList.contains('btn'), m = btn ? 24 : 0;
        if ((!it.liga && !btn) || y < it.y - m || y > it.y + it.h + m) continue;
        if (x > it.x - r - m && x < it.x + it.w + r + m) return true;
      }
      return false;
    }
  };

  /* ---------- eventos (só anotam) ---------- */
  window.addEventListener('resize', pedirMedida, { passive: true });
  window.addEventListener('scroll', function () { rolagem = window.scrollY; }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(pedirMedida).observe(document.body);
  /* um cartão ou uma opção que entre na página depois (conteúdo novo, script)
     é medido na próxima parada: entra no campo, no barramento e na onda */
  var ioCentro = null;   /* (celular) o observador do centro da tela; os cartões novos entram nele também */
  /* só o traço do turbo (js/estacao.js) ou a luz que circula na borda (js/carga.js) entrou ou saiu: não é conteúdo novo */
  function soEnfeite(m) {
    var nos = [].concat([].slice.call(m.addedNodes), [].slice.call(m.removedNodes));
    for (var k = 0; k < nos.length; k++) if (!(nos[k].nodeType === 1 && (nos[k].classList.contains('energia-volta') || nos[k].classList.contains('carga-circula')))) return false;
    return true;
  }
  if ('MutationObserver' in window) new MutationObserver(function (ms) {
    var mudou = false;
    for (var i = 0; i < ms.length; i++) {
      if (!ms[i].addedNodes.length && !ms[i].removedNodes.length) continue;
      if (soEnfeite(ms[i])) continue;   /* o traço do turbo (js/estacao.js) entra e sai: não é conteúdo novo */
      mudou = true;
      if (!ioCentro) continue;
      for (var k = 0; k < ms[i].addedNodes.length; k++) {
        var no = ms[i].addedNodes[k];
        if (no.nodeType !== 1) continue;
        if (no.matches(CARTOES)) ioCentro.observe(no);
        no.querySelectorAll(CARTOES).forEach(function (el) { ioCentro.observe(el); });
      }
    }
    if (mudou) pedirMedida();
  }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pedirMedida);
  /* o clique (ou o toque: o click só vem de toque, nunca de rolagem) manda um sinal ao núcleo */
  var ultimoSinal = 0;
  document.addEventListener('click', function (e) {
    if (parado || !iniciada || !e.isTrusted || e.clientY < navH || e.timeStamp - ultimoSinal < PULSO_CLIQUE) return;
    if (fundoEm(e.clientX, e.clientY).dentroDoVao(e.clientX, e.clientY)) return;   /* no reator, quem responde é ele */
    ultimoSinal = e.timeStamp;
    rotaDe(e.clientX, e.clientY, { vida: 1, forte: true });
  }, { passive: true });
  if (ponteiroFino) {
    document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { ponteiro.x = e.clientX; ponteiro.y = e.clientY; ponteiro.ativo = true; } }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { ponteiro.ativo = false; aoEntrar({ target: null }); }, { passive: true });
    document.addEventListener('pointerover', aoEntrar, { passive: true });
  } else if ('IntersectionObserver' in window) {
    /* celular, sem cursor: a opção acende quando chega ao centro da tela (no máximo uma a cada 600 ms) */
    var ultimo = 0, fila = null;
    var vez = function () {
      if (!fila) return;
      var agora = performance.now();
      if (agora - ultimo < 600) { setTimeout(vez, 600 - (agora - ultimo)); return; }
      ultimo = agora;
      var el = fila; fila = null;
      if (!parado && iniciada) {
        centroAgora = el; entrar(el, false);
        clearTimeout(vez.solta); vez.solta = setTimeout(function () { if (centroAgora === el) centroAgora = null; apontarNada(); B.emit('opcao', { el: el, entrou: false }); }, 2200);
      }
    };
    ioCentro = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        if (!es[i].isIntersecting || parado) continue;
        fila = es[i].target;
        vez();
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll(CARTOES).forEach(function (el) { if (!el.closest('.nav, .barra')) ioCentro.observe(el); });
  }
  /* o núcleo agitado (cliques seguidos nele): o campo responde com ondas */
  /* uma onda só quando a agitação cruza um degrau (0,25 / 0,5 / 0,75 / 1) e
     nunca mais de 3 vivas: clicar sem parar não enche a página de ondas */
  var degrauAgitado = 0;
  B.on('nucleo:agitado', function (ag) {
    var d = Math.floor((ag || 0) * 4 + 1e-6);
    if (d <= degrauAgitado) return;
    degrauAgitado = d;
    if (!parado && iniciada && usaCampo() && campo.nOndas() < 3) campo.soltarOnda();
    if (!parado && iniciada && trilho && trilho.nOndas() < 3) trilho.soltarOnda();
  });

  B.on('reduzir', function (sim) {
    parado = !!sim; desenhouParado = false;
    if (!parado || !iniciada) return;
    for (var e = 0; e < elementos.length; e++) { elementos[e].ativo = 0; elementos[e].onda = 0; }
    campo.limparEnergia();
    if (trilho) trilho.limparEnergia();
  });

  function comecar() {
    faseAntes = faseDoFolego(B.relogio());
    rolagem = window.scrollY;
    iniciada = true;
    medir();
    cv.classList.add('is-viva');
    B.add('rede', quadro);
    B.iniciar();
  }
  /* vindo de outra página do site, JÁ (o campo é o mesmo: sem vão na troca);
     na primeira visita, depois do load */
  var veioDoSite = false;
  try { veioDoSite = Date.now() - (+sessionStorage.getItem('bz-campo') || 0) < 4000; } catch (e) { /* sem armazenamento */ }
  window.addEventListener('pagehide', function () { try { sessionStorage.setItem('bz-campo', String(Date.now())); } catch (e) { /* idem */ } });
  var Bc = window.BEYON;
  if (veioDoSite && document.documentElement.classList.contains('passagem-chega') && Bc && Bc.on) {
    /* chegando pela PASSAGEM (js/passagem.js): a página nova está voando, sem nada por cima. Medir a página inteira
       é uma tarefa longa (310 ms no celular simulado, docs/passagem-medir.mjs) e derrubava os quadros da chegada:
       espera ela assentar ('passagem:chegou') e o navegador folgar, e acende devagar (sem is-herdada) */
    var comecou = false;
    var umaVez = function () { if (comecou) return; comecou = true; comecar(); };
    Bc.on('passagem:chegou', function () {
      var ocioso2 = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1); };
      ocioso2(umaVez, { timeout: 600 });
    });
    setTimeout(umaVez, 3000);   /* a rede: o js/passagem.js não carregou ou a aba ficou oculta na chegada */
  } else if (veioDoSite) {
    /* logo depois do 1º quadro (não antes dele): medir a página inteira é
       uma tarefa longa (~70 ms) */
    cv.classList.add('is-herdada');
    requestAnimationFrame(function () { setTimeout(function () { comecar(); quadro({ dt: 16, now: performance.now() }); }, 0); });
  } else {
    var ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 1); };
    if (document.readyState === 'complete') ocioso(comecar, { timeout: 900 });
    else window.addEventListener('load', function () { ocioso(comecar, { timeout: 900 }); }, { once: true });
  }
})();
