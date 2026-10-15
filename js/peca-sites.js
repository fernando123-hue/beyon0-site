/* ==========================================================================
   A PLANTA (2026-10-14) — o comportamento da peça do cartão de Sites (css/peca-sites.css).
   1. Encaixe: a moldura tem a largura de uma tela de verdade (360 a 1440 px) e é encolhida por
      transform até caber no palco; mudar a largura reorganiza o site dentro (container queries).
   2. A régua: arrastar muda a largura. Tocar a régua DESMONTA o site em planta (a grade de colunas
      aparece) e soltar faz a luz descer e IMPRIMIR de novo: a assinatura do site na mão de quem vê.
      No dedo, só vira arraste com intenção horizontal (senão é rolagem da página); um toque leva à
      parada mais perto. As paradas também são botões (leitor de tela, alvo de 44 px). Ao cruzar uma
      faixa do layout, os blocos deslizam para o lugar novo (FLIP, só transform).
   3. A entrada: com a peça bem visível e a rolagem parada, a luz imprime; depois, uma vez, a moldura
      passa por tablet e celular e pousa na largura da tela de quem está vendo ("sua tela").
   4. O nome e o tipo de negócio: viram a marca, o título, os botões e o endereço do site de exemplo;
      quando a pessoa para de digitar, a luz atravessa e imprime o nome. Nada sai da página; o nome
      só vai para o orçamento (sessionStorage) se a pessoa clicar em "Quero este site".
   5. A prova: peso e primeira tela DESTA página, medidos no aparelho (sem medida, a linha não aparece).
   Texto trocado sempre pelo nó de texto (nodeValue): um nó novo acionaria o MutationObserver da rede
   (js/rede.js), que remede a página inteira. Movimento reduzido: tudo pronto e parado, sem luz e sem
   demonstração, e tudo continua funcionando.
   ========================================================================== */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-planta]');
  if (!raiz || !window.IntersectionObserver) return;
  var B = window.BEYON || {};
  var html = document.documentElement;
  var $ = function (s) { return raiz.querySelector(s); };
  var palco = $('.planta__palco'), moldura = $('.planta__moldura');
  var luz = $('.planta__luz'), luzV = $('.planta__luz-v');
  var regua = $('.planta__regua'), slider = $('.planta__slider'), cursor = $('.planta__cursor'), cota = $('.planta__cota'), voce = $('.planta__voce');
  var campo = $('[data-planta-campo]'), url = $('[data-planta-url]'), titulo = $('[data-planta-titulo]');
  var cta = $('[data-planta-cta]'), botao = $('[data-planta-btn]'), quero = $('[data-planta-quero]');
  var prova = $('.planta__prova'), provaTexto = $('[data-planta-prova]');
  var nomes = raiz.querySelectorAll('[data-planta-nome]');
  var paradas = raiz.querySelectorAll('[data-parada]');
  var nichoBotoes = raiz.querySelectorAll('[data-nicho]');
  var flips = moldura.querySelectorAll('[data-flip]');

  var MIN = 360, MAX = 1440;
  var PARADA_DA_FAIXA = [390, 768, 1280];
  var IMPRIME_MS = 1000;   /* a luz desce em linha reta; cada bloco acende quando ela passa (atraso = y × tempo) */
  var NOME_PADRAO = 'Seu negócio', URL_PADRAO = 'seunegocio.com.br';
  /* o site de exemplo por tipo de negócio: título [antes, destaque, depois], botão do topo, botão do hero.
     {n} = o nome digitado (ou "Seu negócio"). Texto de um site de exemplo, não promessa da Beyon Zero. */
  var NICHOS = {
    padrao: { t: ['Atendimento que começa no ', 'primeiro clique', '.'], comNome: ['', '{n}', ': atendimento que começa no primeiro clique.'], cta: 'Agendar', btn: 'Começar' },
    clinica: { t: ['Sua consulta na ', '{n}', ', marcada sem esperar.'], cta: 'Agendar consulta', btn: 'Agendar no WhatsApp' },
    escritorio: { t: ['', '{n}', ': a resposta certa para o seu caso.'], cta: 'Falar com especialista', btn: 'Falar agora' },
    loja: { t: ['O melhor da ', '{n}', ', a um clique.'], cta: 'Ver produtos', btn: 'Ver catálogo' },
    entidade: { t: ['Associe-se à ', '{n}', ' sem sair de casa.'], cta: 'Associe-se', btn: 'Quero me associar' }
  };
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var grosso = window.matchMedia('(pointer: coarse)');
  function reduzido() { return mq.matches || html.classList.contains('menos-movimento'); }

  var largura = 1280, escala = 1, tween = 0, passos = [], mexeu = false, impressa = false, visivel = false;
  var nicho = 'padrao', nome = '';
  /* medidas do palco e da régua, lidas só quando o tamanho muda (ler a cada passo, logo depois de
     escrever a largura da moldura, forçava layout no meio do quadro) */
  var medida = { pw: 0, ph: 0, rw: 0 };

  function escrever(el, s) {
    if (!el) return;
    var n = el.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== s) n.nodeValue = s; }
    else if (s) el.textContent = s;
  }
  function faixa(w) { return w < 600 ? 0 : w < 900 ? 1 : 2; }
  function nomeDaFaixa(w) { return ['Celular', 'Tablet', 'Computador'][faixa(w)]; }
  function altura(w) { return w < 600 ? 820 : 800; }
  function telaReal() { return Math.round(Math.max(MIN, Math.min(MAX, window.innerWidth))); }

  /* ---------- 1. encaixe ---------- */
  function encaixar() {
    if (!medida.pw || !medida.ph) return;
    escala = Math.min(medida.pw / largura, medida.ph / altura(largura)) * 0.94;
    moldura.style.transform = 'translate(-50%, -50%) scale(' + escala.toFixed(4) + ')';
  }
  /* espessuras que dependem da escala: só quando a faixa muda ou a tela muda (não a cada passo) */
  function espessuras() {
    moldura.style.borderWidth = Math.max(2, 1.2 / escala).toFixed(1) + 'px';
    var fio = Math.max(3, 1.5 / escala).toFixed(1) + 'px';
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
    var sua = Math.abs(w - telaReal()) <= 4;
    regua.classList.toggle('is-sua', sua);
    regua.classList.toggle('is-cota-esquerda', x > medida.rw - 110);
    escrever(cota, w + ' px' + (sua ? ' · sua tela' : ''));
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
    medida = { pw: palco.clientWidth, ph: palco.clientHeight, rw: slider.clientWidth };
    [].forEach.call(paradas, function (p) { p.style.left = posicao(+p.getAttribute('data-parada')).toFixed(1) + 'px'; });
    voce.hidden = false;
    voce.style.left = posicao(telaReal()).toFixed(1) + 'px';
    aplicar(largura, false, true);
  }
  /* o ímã em pixels de TELA (16 no mouse, 24 no dedo), convertido para a largura da moldura */
  function ima(w) {
    var raio = (grosso.matches ? 24 : 16) * (MAX - MIN) / (medida.rw || 1);
    var melhor = w, dist = raio + 1;
    PARADA_DA_FAIXA.concat([telaReal()]).forEach(function (p) { var d = Math.abs(w - p); if (d <= raio && d < dist) { melhor = p; dist = d; } });
    return melhor;
  }
  var CURVAS = {
    io: function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },
    saida: function (k) { return 1 - Math.pow(1 - k, 4); }
  };
  function parar() { cancelAnimationFrame(tween); tween = 0; passos.forEach(clearTimeout); passos = []; }
  function irPara(alvo, ms, curva, depois) {
    cancelAnimationFrame(tween); tween = 0;
    if (reduzido() || !ms) { aplicar(alvo, false, true); if (depois) depois(); return; }
    var de = largura, t0 = performance.now(), f = CURVAS[curva] || CURVAS.io;
    (function passo(t) {
      var k = Math.min(1, (t - t0) / ms);
      aplicar(de + (alvo - de) * f(k), true, k === 1);
      if (k < 1) tween = requestAnimationFrame(passo);
      else { tween = 0; if (depois) depois(); }
    })(t0);
  }
  function depois(ms, fn) { passos.push(setTimeout(fn, ms)); }

  var arrastando = false, pendente = null, pedido = 0, ultimoX = 0, esquerda = 0;
  function xNa(ev) { return ev.clientX - esquerda; }
  function tocou() { if (!mexeu) { mexeu = true; parar(); emDemo = false; raiz.classList.add('is-mexida'); } }
  function desmontar() {
    if (reduzido()) return;
    limparAtrasos();
    raiz.classList.remove('is-montando', 'is-impressa');
    raiz.classList.add('is-tracando');
  }
  function iniciarArraste(ev) {
    tocou(); parar();
    arrastando = true; pendente = null;
    slider.setPointerCapture(ev.pointerId);
    desmontar();
    ultimoX = xNa(ev);
    aplicar(valorEm(ultimoX), true);
  }
  slider.addEventListener('pointerdown', function (ev) {
    esquerda = slider.getBoundingClientRect().left;   /* uma vez por toque: no arraste a régua não sai do lugar */
    if (ev.pointerType === 'touch') { pendente = { x: ev.clientX, y: ev.clientY }; return; }
    iniciarArraste(ev);
  });
  slider.addEventListener('pointermove', function (ev) {
    if (pendente) {
      var dx = Math.abs(ev.clientX - pendente.x), dy = Math.abs(ev.clientY - pendente.y);
      if (dx > 8 && dx > dy) iniciarArraste(ev);
      else if (dy > 8) pendente = null;   /* é rolagem da página: a régua fica quieta */
      return;
    }
    if (!arrastando) return;
    ultimoX = xNa(ev);
    if (!pedido) pedido = requestAnimationFrame(function () { pedido = 0; aplicar(valorEm(ultimoX), true); });
  });
  function soltar() {
    if (!arrastando) return;
    arrastando = false;
    var alvo = ima(largura);
    var ms = Math.min(280, 140 + 3 * Math.abs(posicao(alvo) - posicao(largura)));
    irPara(alvo, alvo === largura ? 0 : ms, 'saida', function () { raiz.classList.remove('is-tracando'); imprimir(); });
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
    p.addEventListener('click', function () { tocou(); irPara(+p.getAttribute('data-parada'), 520, 'io', function () { aplicar(largura, false, true); }); });
  });
  raiz.addEventListener('focusin', function (ev) { if (ev.target === campo) tocou(); });
  /* no celular, o teclado cobre a metade de baixo: o campo sobe para o topo e o site de exemplo
     (logo abaixo dele) fica à vista enquanto a pessoa digita */
  campo.addEventListener('focus', function () {
    if (!grosso.matches) return;
    setTimeout(function () {
      var nav = document.querySelector('.nav');
      var topo = campo.getBoundingClientRect().top + window.scrollY - (nav ? nav.offsetHeight : 64) - 12;
      window.scrollTo({ top: topo, behavior: reduzido() ? 'auto' : 'smooth' });
    }, 320);
  });

  /* ---------- 3. a impressão e a entrada ---------- */
  function limparAtrasos() { [].forEach.call(moldura.querySelectorAll('.pl-b'), function (el) { el.style.transitionDelay = ''; }); }
  function imprimir() {
    if (reduzido()) { raiz.classList.add('is-impressa'); impressa = true; return; }
    var r = moldura.getBoundingClientRect(), alto = r.height || 1;
    [].forEach.call(moldura.querySelectorAll('.pl-b'), function (el) {
      var y = Math.max(0, Math.min(1, (el.getBoundingClientRect().top - r.top) / alto));
      el.style.transitionDelay = Math.round(y * IMPRIME_MS) + 'ms';
    });
    luz.style.setProperty('--luz-fim', altura(largura) + 'px');
    luz.style.setProperty('--luz-ms', IMPRIME_MS + 'ms');
    raiz.classList.remove('is-montando', 'is-impressa');
    void luz.offsetWidth;   /* (o reflow fixa o estado de planta: reinicia a luz e as transições partem dele) */
    raiz.classList.add('is-montando', 'is-impressa');
    impressa = true;
    setTimeout(limparAtrasos, IMPRIME_MS + 500);
  }
  /* a demonstração: tablet, celular e pousa na tela de quem vê (no celular, para no celular) */
  var emDemo = false;
  function demonstrar() {
    if (reduzido()) { aplicar(telaReal(), false, true); return; }
    var fim = telaReal();
    function pousar() { emDemo = false; aplicar(fim, false, true); }
    emDemo = true;
    depois(IMPRIME_MS + 400, function () {
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
  function entrar() {
    imprimir(); medirProva(); demonstrar();
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
    [].forEach.call(nomes, function (el) { escrever(el, n); });
    escrever(url, endereco(nome));
    escrever(cta, cfg.cta);
    escrever(botao, cfg.btn);
    escrever(quero, nome ? 'Quero este site para ' + nome + ' ' : 'Quero um site assim ');
  }
  var esperaNome = 0;
  /* a luz atravessa e imprime o nome (a "tinta molhada" do H1: passa por ciano e seca) */
  function assinar() {
    if (reduzido() || !impressa) return;
    luzV.style.setProperty('--luz-fim-x', largura + 'px');
    raiz.classList.remove('is-assinando'); void luzV.offsetWidth; raiz.classList.add('is-assinando');
    var tinta = [].slice.call(nomes).concat([titulo.children[1]]);
    tinta.forEach(function (el) { el.classList.add('pl-tinta'); });
    setTimeout(function () { tinta.forEach(function (el) { el.classList.remove('pl-tinta'); }); }, 260);
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
  /* o nome só sai desta página se a pessoa pedir o site: vai para o orçamento nesta aba, sem passar pela URL */
  quero.addEventListener('click', function () {
    try {
      if (nome) sessionStorage.setItem('bz-planta-nome', nome);
      if (nicho !== 'padrao') sessionStorage.setItem('bz-planta-nicho', nicho);
    } catch (e) { /* sem armazenamento: o orçamento abre vazio */ }
  });

  /* ---------- 5. a prova: esta página, neste aparelho ---------- */
  function num(v, casas) { return B.num ? B.num(v, casas) : v.toFixed(casas).replace('.', ','); }
  /* a primeira pintura com conteúdo (FCP) desta visita. Só aparece dentro do "bom" do Google (até 2,5 s):
     fora disso a linha não aparece (nunca um número inventado nem arredondado a favor) */
  var PROVA_BOA_MS = 2500;
  function medirProva() {
    if (!window.performance || !performance.getEntriesByName) return;
    var fcp = performance.getEntriesByName('first-contentful-paint')[0];
    if (!fcp || fcp.startTime > PROVA_BOA_MS) return;
    escrever(provaTexto, 'Esta página abriu a primeira tela em ' + num(fcp.startTime / 1000, 1) + ' s neste aparelho.');
    prova.hidden = false;
  }

  /* ---------- liga ---------- */
  raiz.classList.add('is-viva');
  marcar();
  textos();
  if (window.ResizeObserver) new ResizeObserver(function () { marcar(); }).observe(palco);
  else window.addEventListener('resize', marcar);
  /* entra com a peça bem visível e a rolagem parada (a 40% e no meio da rolagem, o gesto da marca
     acontecia fora de vista); se sair da tela no meio da demonstração, ela pousa no fim e para */
  var parada = 0, entrou = false;
  function talvezEntrar() {
    clearTimeout(parada);
    parada = setTimeout(function () { if (visivel && !entrou) { entrou = true; window.removeEventListener('scroll', talvezEntrar); entrar(); } }, 150);
  }
  new IntersectionObserver(function (es) {
    visivel = es[0].isIntersecting;
    if (visivel && !entrou) { window.addEventListener('scroll', talvezEntrar, { passive: true }); talvezEntrar(); }
    if (!visivel && emDemo) { parar(); emDemo = false; aplicar(telaReal(), false, true); }
  }, { threshold: 0.6 }).observe(palco);
})();
