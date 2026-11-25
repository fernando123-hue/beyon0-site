/* ==========================================================================
   A ROLAGEM DA CONVERSA NO CELULAR (dono, 25/11: "quando vamos rolar a tela na página do consultor, existe uma dificuldade na hora de
   rolar a tela porque conflita com a do site ... é necessário uma separação"; escolheu a opção A: "a conversa cresce junto com a página").
   Até 899 px a conversa deixa de ser uma caixa com rolagem própria (css/orcamento.css): o dedo só rola UMA coisa, a página. No computador
   (>= 900 px) a caixa continua como era, ao lado do painel do preço.
   Quem decide é o CSS (o overflow-y calculado da caixa); este módulo só LÊ isso, e cada lugar que rolava a caixa pergunta aqui antes.
   Sem a caixa rolando (celular), "levar a fala ao topo" passa a mover a PÁGINA, com três cuidados contra o susto de a tela fugir:
     1. só acompanha quem estava acompanhando a conversa (o item anterior a este está à vista); quem foi ver o preço, ou subiu para reler,
        não é puxado: aparece um botão pequeno "Zero respondeu" que leva até a fala quando a pessoa quiser;
     2. a fala que já está numa posição boa de leitura (na parte de cima da tela) não se mexe;
     3. ao abrir uma conversa salva a página não se mexe (quem cuida da chegada é js/orcamento.js retomar).
   Fica de fora da conta o que cobre o alto da tela: a barra de navegação e a barra do escopo. ES5, como os vizinhos; sem dependências.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz && raiz.document) { raiz.BZOrcRolagem = api; api.ligar(raiz.document, raiz); }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var FOLGA = 8;               /* (a mesma folga de js/orcamento.js: a fala fica a 8 px abaixo do que cobre o alto) */
  var BEM_POSICIONADA = 0.4, COLADA = 12;   /* (uma fala cujo topo já está nos 40% de cima da área útil não é puxada; COLADA: a folga a mais que ainda conta como "no alto") */
  var MARGEM = 24;             /* (o item anterior a 24 px da borda ainda conta como "à vista") */
  var NAV_PADRAO = 64, BARRA_ESCOPO = 56;
  var MESMO_ALVO_PX = 2, MESMA_ROLAGEM_MS = 900;

  var doc = null, win = null, botao = null, fala = null, ultimo = { alvo: -1, quando: 0 }, agendado = false, tocou = false;

  /* ---------- as contas, puras (testadas sem tela) ---------- */
  /* para onde a página vai: onde o item está no documento (rolagem + topo na tela) menos o que cobre o alto e a folga; nunca fora do fim */
  function alvoDaPagina(d) {
    if (!d || typeof d !== 'object') return null;
    var num = function (v) { return typeof v === 'number' ? v : NaN; };   /* (null e texto não viram 0) */
    var t = num(d.rolagem) + num(d.topo) - num(d.topoUtil) - num(d.folga);
    var max = num(d.maximo);
    if (!isFinite(t)) return null;
    if (!isFinite(max) || max < 0) max = t;
    return Math.max(0, Math.min(max, Math.round(t)));
  }
  /* A fala já está bem? Sim se está na parte de cima da área útil E o que entrou com ela (a fala e as opções logo abaixo) cabe na tela; ou se
     não cabe mas ela já está colada no alto (não há mais o que ganhar). Nesses casos a página fica quieta (nada de pulinho). `fim` é opcional. */
  function jaBemPosicionada(topo, fim, topoUtil, altura) {
    var t = Number(topo), u = Number(topoUtil), h = Number(altura), f = fim == null ? NaN : Number(fim);
    if (!isFinite(t) || !isFinite(u) || !isFinite(h) || h <= u || t < u) return false;
    if (t <= u + FOLGA + COLADA) return true;   /* (já no alto: subir mais não revela nada) */
    return t <= u + (h - u) * BEM_POSICIONADA && (!isFinite(f) || f <= h - FOLGA);
  }
  /* A pessoa está na conversa? A conversa vai do item anterior ao novo até o fim do campo de escrever (o campo mora ABAIXO da lista: quem
     acabou de digitar está nele, e a lista toda ficou acima da tela). Sem item anterior (a 1ª fala), acompanha. Está FORA quando subiu para
     reler (o anterior começa abaixo da tela) ou desceu para outra parte da página (o fim da conversa ficou acima da tela). `fim` é opcional. */
  function acompanhando(anterior, fim, topoUtil, altura) {
    if (!anterior) return true;
    var t = Number(anterior.top), b = Number(anterior.bottom), u = Number(topoUtil), h = Number(altura);
    if (!isFinite(t) || !isFinite(b) || !isFinite(u) || !isFinite(h)) return true;   /* (sem medida: o comportamento de antes, acompanhar) */
    if (t >= h + MARGEM) return false;
    var f = fim ? Number(fim.bottom) : NaN;
    return (isFinite(f) ? f : b) > u - MARGEM;
  }

  /* ---------- a leitura da tela ---------- */
  function ligado() { return !!(win && doc); }
  function caixa() { return doc.getElementById('o-log-caixa'); }
  /* a caixa rola por dentro? Quem responde é o CSS: sem a janela, sem a função ou sem a caixa, vale o jeito de antes (por dentro) */
  function porDentro() {
    if (!ligado() || typeof win.getComputedStyle !== 'function') return true;
    var c = caixa();
    if (!c) return true;
    var ov = win.getComputedStyle(c).overflowY;
    return ov === 'auto' || ov === 'scroll';
  }
  function altura() { var v = win.visualViewport; return v && v.height > 0 ? v.height : win.innerHeight; }   /* (com o teclado aberto, a parte que a pessoa vê) */
  /* o que cobre o alto da tela: o menu e, logo abaixo dele, a barra do escopo (css/orcamento-escopo.css .rde-barra, 56 px). A barra entra e sai
     sozinha (aparece quando o radar sai da tela), então a conta SEMPRE a reserva: sem isso a fala levada ao topo ficava por baixo dela */
  function topoUtil() {
    var nav = parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--nav-h')) || NAV_PADRAO;
    return nav + BARRA_ESCOPO;
  }
  function movimentoReduzido() {
    var raizDoc = doc.documentElement;
    return !!((win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) || (raizDoc.classList && raizDoc.classList.contains('menos-movimento')));
  }
  function visivel(el) { return !!el && typeof el.getClientRects === 'function' && el.getClientRects().length > 0; }
  function anteriorVisivel(li) { var p = li && li.previousElementSibling; while (p && !visivel(p)) p = p.previousElementSibling; return p; }

  function rolarPara(y) {
    var agora = Date.now();
    if (Math.abs(y - ultimo.alvo) <= MESMO_ALVO_PX && agora - ultimo.quando < MESMA_ROLAGEM_MS) return;   /* (a 2ª chamada do mesmo lugar não reinicia a rolagem suave) */
    ultimo = { alvo: y, quando: agora };
    if (typeof win.scrollTo !== 'function') return;
    win.scrollTo({ top: y, left: 0, behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  }
  function alvoDe(el, u) {
    var raizDoc = doc.documentElement;
    return alvoDaPagina({ rolagem: win.pageYOffset || raizDoc.scrollTop || 0, topo: el.getBoundingClientRect().top, topoUtil: u, folga: FOLGA, maximo: raizDoc.scrollHeight - altura() });
  }

  /* ---------- o que os outros módulos chamam ---------- */
  /* Leva o alvo (uma fala, uma pergunta) ao topo da área útil da PÁGINA. `inserido` é o item que acabou de entrar na lista (para saber se a pessoa
     acompanhava). Devolve true se tratou (a caixa não rola: o chamador não faz mais nada), false se a caixa rola por dentro (o chamador rola a caixa).
     `quieto`: não mexer (chegada de uma conversa salva). */
  function levar(alvo, inserido, quieto) {
    if (porDentro()) return false;
    if (quieto || !tocou || !alvo || typeof alvo.getBoundingClientRect !== 'function') return true;   /* (sem toque da pessoa a página não se move: abrir a página, ou voltar a ela, é só ver) */
    var u = topoUtil(), h = altura(), ant = anteriorVisivel(inserido || alvo);
    var campo = doc.getElementById('o-form');
    if (!acompanhando(ant ? ant.getBoundingClientRect() : null, visivel(campo) ? campo.getBoundingClientRect() : null, u, h)) { avisar(inserido); return true; }
    var fimDoNovo = (inserido || alvo).getBoundingClientRect().bottom;
    if (jaBemPosicionada(alvo.getBoundingClientRect().top, fimDoNovo, u, h)) return true;
    var y = alvoDe(alvo, u);
    if (y != null) rolarPara(y);
    esconder();
    return true;
  }
  /* Desce a página só o que falta para o FIM do alvo aparecer (nunca sobe, nunca passa do que ainda deixa o começo dele à vista): a pergunta
     "Ficou certo?" embaixo de um mapa alto. Mesma regra de calma: sem toque da pessoa, ou se ela foi ver outra coisa, não mexe. */
  function descerAte(alvo) {
    if (porDentro()) return false;
    if (!tocou || !alvo || typeof alvo.getBoundingClientRect !== 'function') return true;
    var u = topoUtil(), h = altura(), r = alvo.getBoundingClientRect();
    if (r.bottom <= h - FOLGA || r.top >= h || r.bottom < u) return true;   /* (já à vista, ou a pessoa está longe dele) */
    var y = Math.min((win.pageYOffset || 0) + r.bottom - (h - FOLGA), (win.pageYOffset || 0) + r.top - u - FOLGA);   /* (o começo dele não passa do alto da área útil) */
    rolarPara(Math.max(0, Math.round(y)));
    return true;
  }

  /* ---------- o botão "Zero respondeu" ---------- */
  function avisar(inserido) {
    if (!botao || !inserido || !inserido.classList || !inserido.classList.contains('msg--agente')) return;   /* (só uma fala nova do Zero merece o aviso) */
    fala = inserido;
    atualizarBotao();
  }
  function esconder() { fala = null; if (botao) botao.hidden = true; }
  function atualizarBotao() {
    if (!botao) return;
    if (!fala || !fala.isConnected || porDentro()) { esconder(); return; }
    var u = topoUtil(), h = altura(), r = fala.getBoundingClientRect();
    if (r.top >= u && r.top <= h - 48) { esconder(); return; }   /* (a fala entrou na tela: o aviso cumpriu o papel) */
    var seta = doc.getElementById('o-voltar-seta');
    if (seta) seta.textContent = r.top > h ? '↓' : '↑';
    botao.hidden = false;
  }
  function irAFala() {
    var alvo = fala && fala.isConnected ? fala : null;
    if (!alvo) { var f = doc.querySelectorAll('#o-log .msg--agente'), i; for (i = f.length - 1; i >= 0 && !alvo; i--) if (visivel(f[i])) alvo = f[i]; }
    esconder();
    if (!alvo || porDentro()) return;
    var y = alvoDe(alvo, topoUtil());
    if (y != null) { ultimo = { alvo: -1, quando: 0 }; rolarPara(y); }
  }
  function aoRolar() {
    if (agendado || !botao || botao.hidden) return;
    agendado = true;
    var f = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : function (fn) { return win.setTimeout(fn, 16); };
    f(function () { agendado = false; atualizarBotao(); });
  }
  /* a caixa da conversa deixa de ser focável por Tab quando não rola (nada a rolar com o teclado); por programa o foco ainda chega (js/orcamento.js) */
  function ajustarFoco() {
    var c = caixa();
    if (c && typeof c.setAttribute === 'function') c.setAttribute('tabindex', porDentro() ? '0' : '-1');
  }

  function ligar(documento, janela) {
    if (!documento || !janela || typeof documento.getElementById !== 'function') return;
    doc = documento; win = janela;
    botao = doc.getElementById('o-voltar');
    if (botao) botao.addEventListener('click', irAFala);
    /* o 1º toque ou tecla da pessoa libera a rolagem automática (antes, a página só foi aberta e ninguém pediu para ela andar) */
    var liberar = function () { tocou = true; doc.removeEventListener('pointerdown', liberar, true); doc.removeEventListener('keydown', liberar, true); };
    doc.addEventListener('pointerdown', liberar, true);
    doc.addEventListener('keydown', liberar, true);
    win.addEventListener('scroll', aoRolar, { passive: true });
    win.addEventListener('resize', function () { ajustarFoco(); atualizarBotao(); });
    ajustarFoco();
  }

  return Object.freeze({ FOLGA: FOLGA, alvoDaPagina: alvoDaPagina, jaBemPosicionada: jaBemPosicionada, acompanhando: acompanhando, porDentro: porDentro, levar: levar, descerAte: descerAte, ligar: ligar });
});
