/* ==========================================================================
   A PLANTA (2026-10-14) — o comportamento da peça do cartão de Sites (css/peca-sites.css).
   1. Encaixe: a moldura tem a largura de uma tela de verdade (360 a 1440 px) e é encolhida por
      transform até caber no palco; mudar a largura reorganiza o site dentro (container queries).
   2. A régua: arrastar muda a largura. Com intenção de arraste (8 px), o site DESMONTA em planta (o texto
      fica cinza e legível, a grade de 12 colunas aparece) e, ao soltar, a luz desce e IMPRIME de novo (mais
      curta que a da entrada). Um clique longe do cursor desliza até o ponto; no dedo, só vira arraste com
      intenção horizontal (senão é rolagem). As paradas também são botões. Ao cruzar uma faixa do layout,
      os blocos deslizam para o lugar novo (FLIP, só transform).
   3. A entrada: com a peça bem visível e a rolagem parada, a luz imprime. Cada bloco CARIMBA quando a
      luz passa pela borda de baixo dele; as palavras carimbam em ciano e secam (a tinta molhada do H1).
      Pendurado na luz desce o tempo que ESTA página levou para abrir (LCP, medido no aparelho) e pousa no
      pé da moldura. Depois, uma vez, a moldura passa por tablet e celular e pousa na tela de quem vê.
   4. Nome e tipo de negócio viram marca, título, botões, recursos e endereço do site de exemplo; ao parar
      de digitar, a luz atravessa e a tinta do nome seca. Nada sai da página: o nome só vai ao orçamento
      (sessionStorage) se a pessoa clicar em "Quero este site", e ao WhatsApp numa mensagem que ela vê e
      decide enviar.
   Texto trocado sempre pelo nó de texto (nodeValue): um nó novo acionaria o MutationObserver da rede
   (js/rede.js), que remede a página inteira. Movimento reduzido: tudo pronto e parado, e funcionando.
   ========================================================================== */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-planta]');
  if (!raiz || !window.IntersectionObserver) return;
  var B = window.BEYON || {};
  var html = document.documentElement;
  var cartao = raiz.closest('article') || document;
  var $ = function (s) { return raiz.querySelector(s); };
  var palco = $('.planta__palco'), moldura = $('.planta__moldura'), pl = $('.pl');
  var luz = $('.planta__luz'), luzV = $('.planta__luz-v');
  var tempo = $('.planta__tempo'), tempoTexto = $('[data-planta-tempo]');
  var cotaMoldura = $('.planta__medida'), cotaLinhas = raiz.querySelectorAll('.planta__medida-linha'), cotaPontas = raiz.querySelectorAll('.planta__medida-ponta'), cotaNum = $('[data-planta-medida]');
  var regua = $('.planta__regua'), slider = $('.planta__slider'), cursor = $('.planta__cursor'), cota = $('.planta__cota'), voce = $('.planta__voce');
  var campo = $('[data-planta-campo]'), url = $('[data-planta-url]'), titulo = $('[data-planta-titulo]');
  var cta = $('[data-planta-cta]'), botao = $('[data-planta-btn]');
  var quero = cartao.querySelector('[data-planta-quero]'), queroTexto = quero && quero.querySelector('.peca-quero__texto');
  var wa = cartao.querySelector('[data-planta-wa]');
  var prova = $('.planta__prova'), provaTexto = $('[data-planta-prova]');
  var nomes = raiz.querySelectorAll('[data-planta-nome]');
  var recursos = raiz.querySelectorAll('[data-planta-recurso]');
  var paradas = raiz.querySelectorAll('[data-parada]');
  var nichoBotoes = raiz.querySelectorAll('[data-nicho]');
  var flips = moldura.querySelectorAll('[data-flip]');
  var blocos = moldura.querySelectorAll('.pl-b');
  var palavras = [].slice.call(nomes).concat([cta, botao, titulo.children[0], titulo.children[1], titulo.children[2]].concat([].slice.call(recursos)));

  var MIN = 360, MAX = 1440;
  var PARADA_DA_FAIXA = [390, 768, 1280];
  var ENTRADA_MS = 1000, REIMPRIME_MS = 600;   /* a luz desce em linha reta; o bloco carimba quando ela passa pela borda de baixo dele */
  var COTA_RESERVA = 28, COTA_VAO = 8;   /* px de tela embaixo da moldura para a linha de cota; folga em volta da medida */
  var NOME_PADRAO = 'Seu negócio', URL_PADRAO = 'seunegocio.com.br', NOME_LONGO = 14;
  /* o site de exemplo por tipo de negócio. {n} = o nome digitado (ou "Seu negócio"). É texto de um site de
     EXEMPLO do cliente: nada de promessa da Beyon Zero aqui dentro (crítica, rodada 2) */
  /* "universal primeiro" (dono, 2026-10-15: "menos especifica porém precisa, pra quem quer que seja"): abre
     falando com qualquer negócio; os tipos são opcionais e amplos. O nome vem no começo (sem "da"/"do", que
     erraria o gênero de muitos nomes) */
  var NICHOS = {
    padrao: { t: ['Seu cliente te encontra, entende e ', 'chama em 1 minuto', '.'], comNome: ['', '{n}', ': o cliente encontra, entende e chama em 1 minuto.'], cta: 'Fale com a gente', btn: 'Chamar no WhatsApp', rec: ['Serviços', 'Depoimentos', 'Como chegar', 'WhatsApp'] },
    servicos: { t: ['', '{n}', ': o serviço certo, com orçamento na hora.'], cta: 'Pedir orçamento', btn: 'Pedir orçamento', rec: ['Serviços', 'Como funciona', 'Depoimentos', 'WhatsApp'] },
    comercio: { t: ['', '{n}', ': o que você procura, a um clique.'], cta: 'Ver produtos', btn: 'Ver catálogo', rec: ['Catálogo', 'Entrega', 'Trocas', 'WhatsApp'] },
    saude: { t: ['', '{n}', ': sua consulta marcada sem esperar.'], cta: 'Agendar', btn: 'Agendar no WhatsApp', rec: ['Convênios', 'Agenda online', 'Como chegar', 'WhatsApp'] },
    organizacao: { t: ['', '{n}', ': associe-se sem sair de casa.'], cta: 'Associe-se', btn: 'Quero me associar', rec: ['Benefícios', 'Convênios', 'Notícias', 'Associe-se'] }
  };
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var grosso = window.matchMedia('(pointer: coarse)');
  function reduzido() { return mq.matches || html.classList.contains('menos-movimento'); }

  var largura = 1280, escala = 1, tween = 0, passos = [], mexeu = false, impressa = false, visivel = false;
  var nicho = 'padrao', nome = '';
  /* medidas do palco e da régua, lidas só quando o tamanho muda (ler a cada passo, logo depois de escrever a
     largura da moldura, forçava layout no meio do quadro) */
  var medida = { pw: 0, ph: 0, rw: 0, letra: 0 };

  function escrever(el, s) {
    if (!el) return;
    var n = el.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== s) n.nodeValue = s; }
    else if (s) el.textContent = s;
  }
  function num(v, casas) { return B.num ? B.num(v, casas) : v.toFixed(casas).replace('.', ','); }
  function faixa(w) { return w < 600 ? 0 : w < 900 ? 1 : 2; }
  function nomeDaFaixa(w) { return ['Celular', 'Tablet', 'Computador'][faixa(w)]; }
  function altura(w) { return w < 600 ? 820 : 800; }
  /* a tela de verdade, sem limite (para dizer a verdade) e a mesma dentro da régua (para a moldura) */
  /* (lida só em marcar(), quando o tamanho muda: no celular, ler window.innerWidth força layout — medido: 145 ms
     na demo com CPU 4× quando era lida a cada quadro) */
  var larguraDaTela = Math.round(window.innerWidth);
  function tela() { return larguraDaTela; }
  function telaNaRegua() { return Math.max(MIN, Math.min(MAX, tela())); }
  function telaCabe() { var t = tela(); return t >= MIN && t <= MAX; }

  /* ---------- 1. encaixe ---------- */
  /* fio de 1 px em meio pixel vira duas fileiras apagadas: a cota anda em pixel físico inteiro, contado do
     canto da página (ela nasce em left: 50% do palco, cuja largura e topo caem em fração de pixel; revisão, rodada 5) */
  function px(v, base) { base = base || 0; return (Math.round((base + v) * medida.dpr) / medida.dpr - base).toFixed(3) + 'px'; }
  function encaixar() {
    if (!medida.pw || !medida.ph) return;
    escala = Math.min(medida.pw / largura, (medida.ph - COTA_RESERVA) / altura(largura)) * 0.94;
    moldura.style.transform = 'translate(-50%, calc(-50% - ' + COTA_RESERVA / 2 + 'px)) scale(' + escala.toFixed(4) + ')';
    /* a cota acompanha a moldura: 12 px abaixo do pé dela, da largura dela */
    var sw = largura * escala, pe = (medida.ph - COTA_RESERVA + altura(largura) * escala) / 2;
    cotaMoldura.style.transform = 'translateY(' + px(pe + 10, medida.topo) + ')';
    /* o vão da medida: a fonte é mono, então a largura sai da contagem de letras ("390 px", "1280 px") */
    var vao = medida.letra * (String(largura).length + 3) / 2 + COTA_VAO, trecho = (Math.max(0, sw / 2 - vao) / 100).toFixed(4);
    cotaLinhas[0].style.transform = 'translateX(' + px(-sw / 2, medida.centro) + ') scaleX(' + trecho + ')';
    cotaLinhas[1].style.transform = 'translateX(' + px(vao, medida.centro) + ') scaleX(' + trecho + ')';
    cotaPontas[0].style.transform = 'translateX(' + px(-sw / 2, medida.centro) + ')';
    cotaPontas[1].style.transform = 'translateX(' + px(sw / 2 - 1, medida.centro) + ')';
  }
  /* espessuras que dependem da escala: 1 px de tela exato (mais que isso suaviza a linha em duas fileiras de
     pixel); só quando a faixa ou a tela muda, nunca a cada passo */
  function espessuras() {
    var fio = (1 / escala).toFixed(2) + 'px';
    moldura.style.borderWidth = fio;
    moldura.style.setProperty('--fio', fio);
    luz.style.height = fio; luzV.style.width = fio;
  }
  function medir() { return [].map.call(flips, function (el) { return el.getBoundingClientRect(); }); }
  function deslizar(antes) {
    var depois = medir();
    [].forEach.call(flips, function (el, i) {
      var a = antes[i], d = depois[i];
      if (!a.width || !d.width) return;
      var dx = (a.left - d.left) / escala, dy = (a.top - d.top) / escala;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.getAnimations().forEach(function (an) { an.cancel(); });
      /* em ordem de leitura, 20 ms entre um bloco e o seguinte: reorganiza, não pula */
      el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 400, delay: i * 20, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' });
    });
  }

  function aplicar(w, animar, anunciar) {
    w = Math.round(Math.max(MIN, Math.min(MAX, w)));
    if (w === largura && !anunciar) return;
    var cruzou = faixa(w) !== faixa(largura);
    var antes = cruzou && animar && !reduzido() ? medir() : null;
    largura = w;
    moldura.style.width = w + 'px';
    moldura.style.height = altura(w) + 'px';
    if (cruzou || anunciar) moldura.classList.toggle('is-celular', faixa(w) === 0);
    encaixar();
    if (cruzou || anunciar) espessuras();
    if (antes) deslizar(antes);
    var x = posicao(w);
    cursor.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    var sua = telaCabe() && Math.abs(w - tela()) <= 4;   /* "sua tela" só quando é verdade */
    regua.classList.toggle('is-sua', sua);
    regua.classList.toggle('is-cota-esquerda', x > medida.rw - 110);
    /* a medida fica na cota do desenho (o número duas vezes, a 40 px, era ruído); o cursor só diz "sua tela" */
    escrever(cotaNum, w + ' px');
    escrever(cota, sua ? 'sua tela' : '');
    slider.setAttribute('aria-valuenow', String(w));
    if (cruzou || anunciar) {
      slider.setAttribute('aria-valuetext', nomeDaFaixa(w) + ', ' + w + ' pixels' + (sua ? ', a largura da sua tela' : ''));
      [].forEach.call(paradas, function (p) { p.setAttribute('aria-pressed', String(+p.getAttribute('data-parada') === PARADA_DA_FAIXA[faixa(w)])); });
    }
  }

  /* ---------- 2. a régua ---------- */
  function posicao(w) { return (w - MIN) / (MAX - MIN) * medida.rw; }
  function valorEm(x) { return MIN + x / (medida.rw || 1) * (MAX - MIN); }
  function marcar() {
    var caixa = palco.getBoundingClientRect();
    medida = { pw: palco.clientWidth, centro: caixa.left + window.scrollX + caixa.width / 2, topo: caixa.top + window.scrollY, ph: palco.clientHeight, rw: slider.clientWidth, letra: cotaNum.offsetWidth / (cotaNum.textContent.length || 1), dpr: window.devicePixelRatio || 1 };
    larguraDaTela = Math.round(window.innerWidth);
    if (window.getComputedStyle(regua).display !== 'grid') {
      [].forEach.call(paradas, function (p) { p.style.left = posicao(+p.getAttribute('data-parada')).toFixed(1) + 'px'; });
    }
    [].forEach.call(raiz.querySelectorAll('[data-marca]'), function (m) { m.style.left = posicao(+m.getAttribute('data-marca')).toFixed(1) + 'px'; });
    var t = tela();
    voce.hidden = false;
    voce.classList.toggle('is-acima', t > MAX);
    voce.classList.toggle('is-abaixo', t < MIN);
    voce.style.left = posicao(telaNaRegua()).toFixed(1) + 'px';
    if (!telaCabe()) {
      if (!voce.firstChild) voce.appendChild(document.createElement('span'));
      escrever(voce.firstChild, t > MAX ? 'sua tela: ' + t + ' px →' : '← sua tela: ' + t + ' px');
    }
    aplicar(largura, false, true);
  }
  /* o ímã em pixels de TELA (16 no mouse, 24 no dedo), convertido para a largura da moldura */
  function ima(w) {
    var raio = (grosso.matches ? 24 : 16) * (MAX - MIN) / (medida.rw || 1);
    var melhor = w, dist = raio + 1;
    PARADA_DA_FAIXA.concat(telaCabe() ? [tela()] : []).forEach(function (p) { var d = Math.abs(w - p); if (d <= raio && d < dist) { melhor = p; dist = d; } });
    return melhor;
  }
  var CURVAS = {
    io: function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },
    saida: function (k) { return 1 - Math.pow(1 - k, 4); }
  };
  function parar() { cancelAnimationFrame(tween); tween = 0; passos.forEach(clearTimeout); passos = []; }
  function irPara(alvo, ms, curva, fim) {
    cancelAnimationFrame(tween); tween = 0;
    if (reduzido() || !ms) { aplicar(alvo, false, true); if (fim) fim(); return; }
    var de = largura, t0 = performance.now(), f = CURVAS[curva] || CURVAS.io;
    (function passo(t) {
      var k = Math.min(1, (t - t0) / ms);
      aplicar(de + (alvo - de) * f(k), true, k === 1);
      if (k < 1) tween = requestAnimationFrame(passo);
      else { tween = 0; if (fim) fim(); }
    })(t0);
  }
  function depois(ms, fn) { passos.push(setTimeout(fn, ms)); }

  var arrastando = false, desmontada = false, pendente = null, pedido = 0, ultimoX = 0, esquerda = 0, x0 = 0;
  function xNa(ev) { return ev.clientX - esquerda; }
  function tocou() { if (!mexeu) { mexeu = true; parar(); emDemo = false; raiz.classList.add('is-mexida'); } }
  function desmontar() {
    if (reduzido() || desmontada) return;
    desmontada = true;
    limparAtrasos();
    raiz.classList.remove('is-montando', 'is-impressa');
    raiz.classList.add('is-tracando');
  }
  function iniciarArraste(ev, jaComIntencao) {
    tocou(); parar();
    arrastando = true; pendente = null; desmontada = false;
    slider.setPointerCapture(ev.pointerId);
    ultimoX = xNa(ev); x0 = ev.clientX;
    if (jaComIntencao) { desmontar(); aplicar(valorEm(ultimoX), true); return; }
    /* um clique longe do cursor desliza até o ponto (o salto de 1280 para 400 num quadro lia como defeito) */
    if (Math.abs(ultimoX - posicao(largura)) > 24) irPara(valorEm(ultimoX), 180, 'saida');
  }
  slider.addEventListener('pointerdown', function (ev) {
    esquerda = slider.getBoundingClientRect().left;   /* uma vez por toque: no arraste a régua não sai do lugar */
    if (ev.pointerType === 'touch') { pendente = { x: ev.clientX, y: ev.clientY }; return; }
    iniciarArraste(ev, false);
  });
  slider.addEventListener('pointermove', function (ev) {
    if (pendente) {
      var dx = Math.abs(ev.clientX - pendente.x), dy = Math.abs(ev.clientY - pendente.y);
      if (dx > 8 && dx > dy) iniciarArraste(ev, true);
      else if (dy > 8) pendente = null;   /* é rolagem da página: a régua fica quieta */
      return;
    }
    if (!arrastando) return;
    ultimoX = xNa(ev);
    if (!desmontada && Math.abs(ev.clientX - x0) > 8) { cancelAnimationFrame(tween); tween = 0; desmontar(); }
    if (!desmontada) return;
    if (!pedido) pedido = requestAnimationFrame(function () { pedido = 0; aplicar(valorEm(ultimoX), true); });
  });
  function soltar() {
    if (!arrastando) return;
    arrastando = false;
    var alvo = ima(largura);
    var ms = Math.min(280, 140 + 3 * Math.abs(posicao(alvo) - posicao(largura)));
    var reimprimir = desmontada;
    irPara(alvo, alvo === largura ? 0 : ms, 'saida', function () {
      if (!reimprimir) return;
      raiz.classList.remove('is-tracando'); desmontada = false;
      imprimir(REIMPRIME_MS);
    });
  }
  slider.addEventListener('pointerup', function (ev) {
    if (pendente) { pendente = null; tocou(); irPara(ima(valorEm(xNa(ev))), 360, 'saida'); return; }   /* um toque: vai à parada mais perto */
    soltar();
  });
  slider.addEventListener('pointercancel', function () { pendente = null; soltar(); });
  slider.addEventListener('keydown', function (ev) {
    var passo = { ArrowLeft: -10, ArrowDown: -10, ArrowRight: 10, ArrowUp: 10, PageDown: -100, PageUp: 100 };
    var alvo = null;
    if (ev.key in passo) alvo = largura + passo[ev.key];
    else if (ev.key === 'Home') alvo = MIN;
    else if (ev.key === 'End') alvo = MAX;
    if (alvo === null) return;
    ev.preventDefault(); tocou();
    aplicar(alvo, true, true);
  });
  [].forEach.call(paradas, function (p) {
    p.addEventListener('click', function () { tocou(); irPara(+p.getAttribute('data-parada'), 520, 'io'); });
  });
  raiz.addEventListener('focusin', function (ev) { if (ev.target === campo) tocou(); });
  /* no celular, quando o teclado termina de abrir, o campo sobe para o topo e o site de exemplo (logo acima
     dele) fica à vista; só rola se o palco estiver fora da área visível */
  /* o palco gruda no topo (css: .is-digitando) e a página rola só o necessário para o campo ficar logo acima do
     teclado — o exemplo e o campo cabem juntos; a régua e os tipos passam por baixo do palco */
  campo.addEventListener('focus', function () {
    if (!grosso.matches) return;
    raiz.classList.add('is-digitando');
    var vv = window.visualViewport, feito = false;
    function ajustar() {
      if (feito) return; feito = true;
      if (vv) vv.removeEventListener('resize', ajustar);
      var alto = vv ? vv.height : window.innerHeight, baixo = campo.getBoundingClientRect().bottom;
      if (baixo > alto - 8) window.scrollBy({ top: baixo - (alto - 8), behavior: 'auto' });
    }
    if (vv) vv.addEventListener('resize', ajustar);
    setTimeout(ajustar, 600);   /* (sem teclado virtual, ou se o resize não vier) */
  });
  campo.addEventListener('blur', function () { raiz.classList.remove('is-digitando'); });

  /* ---------- 3. a impressão e a entrada ---------- */
  function limparAtrasos() { [].forEach.call(blocos, function (el) { el.style.transitionDelay = ''; }); }
  /* a borda de BAIXO de cada bloco, pelo layout (offsetTop), não pela tela: getBoundingClientRect pegaria a
     posição no meio de um deslize (FLIP) e o carimbo sairia fora de sincronia com a luz */
  function baseDe(el) {
    var alvo = el instanceof SVGElement ? el.parentNode : el, y = alvo.offsetHeight;
    while (alvo && alvo !== moldura) { y += alvo.offsetTop; alvo = alvo.offsetParent; }
    return y;
  }
  /* a tinta molhada em lote: tira de todas, UM reflow, põe em todas (um reflow por palavra, logo depois de
     trocar a classe, forçava ~12 recálculos de estilo seguidos) */
  function secar(lista) {
    lista.forEach(function (p) { p[0].classList.remove('pl-seca'); p[0].style.animationDelay = p[1] + 'ms'; });
    void moldura.offsetWidth;
    lista.forEach(function (p) { p[0].classList.add('pl-seca'); });
  }
  function imprimir(ms) {
    if (reduzido()) { raiz.classList.add('is-impressa'); impressa = true; return; }
    var alto = altura(largura), atraso = new Map();
    [].forEach.call(blocos, function (el) {
      var d = Math.round(Math.max(0, Math.min(1, baseDe(el) / alto)) * ms);
      atraso.set(el, d);
      el.style.transitionDelay = d + 'ms';
    });
    luz.style.setProperty('--luz-fim', alto + 'px');
    luz.style.setProperty('--luz-ms', ms + 'ms');
    raiz.classList.remove('is-montando', 'is-impressa');
    void luz.offsetWidth;   /* (o reflow fixa o estado de planta: reinicia a luz e as transições partem dele) */
    raiz.classList.add('is-montando', 'is-impressa');
    /* as palavras carimbam em ciano e secam, no atraso do bloco delas */
    secar(palavras.map(function (el) { var b = el.closest('.pl-b'); return [el, atraso.get(b) || atraso.get(el) || 0]; }));
    impressa = true;
    setTimeout(limparAtrasos, ms + 500);
  }
  /* a demonstração: tablet, celular e pousa na tela de quem vê (no celular, para no celular) */
  var emDemo = false;
  /* aparelho lento (o laço do site, js/core.js: 'lento' ou a média de quadros abaixo de 45): a demonstração
     de larguras — que refaz o layout do site de exemplo a cada quadro — vira um pouso direto na tela de quem vê
     (medido com CPU 4×: era o único custo real das três peças, +3 tarefas longas na mediana) */
  var aparelhoLento = false;
  if (B.on) B.on('lento', function () { aparelhoLento = true; });
  function lento() { return aparelhoLento || (B.S && B.S.t > 60 && B.S.fps < 45); }
  function demonstrar() {
    if (reduzido() || lento()) { aplicar(telaNaRegua(), false, true); return; }
    var fim = telaNaRegua();
    function pousar() { emDemo = false; aplicar(fim, false, true); }
    emDemo = true;
    depois(ENTRADA_MS + 400, function () {
      if (mexeu) { emDemo = false; return; }
      irPara(768, 600, 'io', function () {
        depois(450, function () {
          irPara(390, 600, 'io', function () {
            if (Math.abs(fim - 390) <= 4) { pousar(); return; }
            depois(900, function () { irPara(fim, 900, 'saida', pousar); });
          });
        });
      });
    });
  }

  /* ---------- a prova: quanto ESTA página levou para abrir, neste aparelho ---------- */
  /* LCP (o maior bloco da primeira tela), o mesmo número que o Google usa; o "bom" dele vai até 2,5 s. Acima
     disso a prova não aparece (nunca um número inventado nem arredondado a favor) */
  var PROVA_BOA_MS = 2500, lcp = 0;
  try {
    new PerformanceObserver(function (l) { var es = l.getEntries(); if (es.length) lcp = es[es.length - 1].startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) { /* navegador sem LCP: sem prova */ }
  function provar(ms) {
    if (!lcp || lcp > PROVA_BOA_MS) return;
    var s = num(lcp / 1000, 1);
    escrever(provaTexto, 'Esta página abriu em ' + s + ' s no seu aparelho. O Google considera bom até 2,5 s.');
    escrever(tempoTexto, s + ' s');
    var r = moldura.getBoundingClientRect(), p = palco.getBoundingClientRect();
    var x = Math.min(r.right - p.left + 8, p.width - 56), y0 = r.top - p.top, y1 = r.bottom - p.top - 22;
    tempo.style.left = Math.max(0, x).toFixed(0) + 'px';
    tempo.hidden = false;
    if (!reduzido()) tempo.animate([{ transform: 'translateY(' + y0 + 'px)' }, { transform: 'translateY(' + y1 + 'px)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
    else tempo.style.transform = 'translateY(' + y1 + 'px)';
    setTimeout(function () { prova.hidden = false; }, reduzido() ? 0 : ms);
    /* a cota pousada sai junto com a primeira mudança de tamanho (ela mediria a moldura de antes) */
    setTimeout(function () { tempo.hidden = true; }, ms + 1200);
  }
  function entrar() {
    if (lento() && !reduzido()) { aplicar(telaNaRegua(), false, true); imprimir(ENTRADA_MS); provar(ENTRADA_MS); return; }   /* (a largura antes da luz) */
    imprimir(ENTRADA_MS); provar(ENTRADA_MS); demonstrar();
  }

  /* ---------- 4. nome e tipo de negócio ---------- */
  function endereco(s) {
    var slug = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 22);
    return slug ? slug + '.com.br' : URL_PADRAO;
  }
  function textos() {
    var n = nome || NOME_PADRAO, cfg = NICHOS[nicho];
    var t = (nicho === 'padrao' && nome ? cfg.comNome : cfg.t).map(function (s) { return s.replace('{n}', n); });
    [].forEach.call(titulo.children, function (el, i) { escrever(el, t[i]); });
    titulo.classList.toggle('is-longo', n.length > NOME_LONGO);
    [].forEach.call(nomes, function (el) { escrever(el, n); });
    [].forEach.call(recursos, function (el, i) { escrever(el, cfg.rec[i]); });
    escrever(url, endereco(nome));
    escrever(cta, cfg.cta);
    escrever(botao, cfg.btn);
    if (queroTexto) escrever(queroTexto, nome ? 'Quero este site para ' + nome : 'Quero um site assim');
    /* o atendente de IA (js/peca-atendente.js) passa a falar com este nome e este tipo de negócio */
    document.dispatchEvent(new CustomEvent('bz:negocio', { detail: { nome: nome, nicho: nicho } }));
  }
  var esperaNome = 0;
  /* a luz atravessa e a tinta do nome seca, cada palavra quando a luz passa por ela (x / largura) */
  function assinar() {
    if (reduzido() || !impressa) return;
    luzV.style.setProperty('--luz-fim-x', largura + 'px');
    raiz.classList.remove('is-assinando'); void luzV.offsetWidth; raiz.classList.add('is-assinando');
    secar([].slice.call(nomes).concat([titulo.children[1], url]).map(function (el) {
      var x = 0, a = el;
      while (a && a !== moldura) { x += a.offsetLeft || 0; a = a.offsetParent; }
      return [el, Math.round(Math.max(0, Math.min(1, x / largura)) * 450)];
    }));
  }
  campo.addEventListener('input', function () {
    nome = campo.value.replace(/\s+/g, ' ').trim().slice(0, 28);
    textos();
    clearTimeout(esperaNome);
    esperaNome = setTimeout(assinar, 500);
  });
  campo.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); campo.blur(); } });
  [].forEach.call(nichoBotoes, function (b) {
    b.addEventListener('click', function () {
      tocou();
      var novo = b.getAttribute('data-nicho');
      nicho = nicho === novo ? 'padrao' : novo;
      [].forEach.call(nichoBotoes, function (o) { o.setAttribute('aria-pressed', String(o.getAttribute('data-nicho') === nicho)); });
      textos();
      assinar();
    });
  });
  /* o nome só sai desta página se a pessoa pedir: ao orçamento nesta aba (nunca pela URL), e apagado de lá
     quando ela apagou aqui */
  if (quero) quero.addEventListener('click', function () {
    try {
      if (nome) sessionStorage.setItem('bz-planta-nome', nome); else sessionStorage.removeItem('bz-planta-nome');
      if (nicho !== 'padrao') sessionStorage.setItem('bz-planta-nicho', nicho); else sessionStorage.removeItem('bz-planta-nicho');
    } catch (e) { /* sem armazenamento: o orçamento abre vazio */ }
  });
  /* no WhatsApp, a mensagem com o nome aparece pronta e a pessoa decide se envia */
  if (wa) wa.addEventListener('click', function () {
    if (!B.linkWA) return;
    var tipo = { servicos: 'serviços', comercio: 'comércio', saude: 'saúde', organizacao: 'uma organização' }[nicho];
    wa.href = B.linkWA('quero um site para ' + (nome || 'o meu negócio') + (tipo ? ' (' + tipo + ')' : ''));
  });

  /* ---------- liga ---------- */
  raiz.classList.add('is-viva');
  marcar();
  textos();
  /* (a largura da letra da cota depende da fonte mono, que chega depois com font-display: swap) */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(marcar);
  if (window.ResizeObserver) new ResizeObserver(function () { marcar(); }).observe(palco);
  else window.addEventListener('resize', marcar);
  /* entra com a peça bem visível e a rolagem parada (a 40% e no meio da rolagem, o gesto da marca acontecia
     fora de vista); se sair da tela no meio da demonstração, ela pousa no fim e para */
  var parada = 0, entrou = false;
  function talvezEntrar() {
    clearTimeout(parada);
    parada = setTimeout(function () { if (visivel && !entrou) { entrou = true; window.removeEventListener('scroll', talvezEntrar); entrar(); } }, 150);
  }
  new IntersectionObserver(function (es) {
    visivel = es[0].isIntersecting;
    if (visivel && !entrou) { window.addEventListener('scroll', talvezEntrar, { passive: true }); talvezEntrar(); }
    if (!visivel && emDemo) { parar(); emDemo = false; aplicar(telaNaRegua(), false, true); }
  }, { threshold: 0.6 }).observe(palco);
})();
