/* ==========================================================================
   O DESPACHO (2026-10-14) — o comportamento da peça do cartão de Automação (css/peca-automacao.css).
   1. As trilhas: do pé de cada canal de entrada até um pino do AGENTE, e de outro pino dele até cada
      saída; reto, com chanfro de 45° (o barramento do site). Desenhadas a partir da posição dos nós,
      de novo só quando o tamanho muda. Os <path> são criados UMA vez: depois só muda o atributo "d"
      (nó novo aciona o MutationObserver da rede, js/rede.js, que remede a página inteira).
   2. A rota: escolher um pedido acende o canal por onde ele chega, a luz corre até o agente (os LEDs
      dele correm enquanto trabalha) e dali para cada saída, em ordem; a cada chegada o registro imprime
      o passo. Termina com o resultado. A luz é stroke-dashoffset de um traço por vez.
   3. A entrada: com a peça bem visível e a rolagem parada, roda uma vez o primeiro pedido. Depois, só
      pela mão de quem vê.
   Movimento reduzido: a rota aparece acesa de uma vez, com o registro inteiro.
   ========================================================================== */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-despacho]');
  if (!raiz || !window.IntersectionObserver) return;
  var html = document.documentElement;
  var placa = raiz.querySelector('.despacho__placa');
  var svg = raiz.querySelector('.despacho__trilhas');
  var registro = raiz.querySelector('.despacho__registro');
  var fim = raiz.querySelector('.despacho__fim');
  var botoes = raiz.querySelectorAll('[data-pedido]');
  var nos = {};
  [].forEach.call(raiz.querySelectorAll('[data-no]'), function (n) { nos[n.getAttribute('data-no')] = n; });
  var ENTRADAS = ['whatsapp', 'email', 'site'], SAIDAS = ['sistema', 'financeiro', 'planilha', 'equipe'];
  var NS = 'http://www.w3.org/2000/svg';
  var TRILHA_MS = 420, PAUSA_MS = 260;
  /* rotinas de EXEMPLO de uma entidade (o texto da peça diz isso): cada passo acende um nó */
  var ROTAS = {
    boleto: { passos: [['whatsapp', 'Pedido chegou pelo WhatsApp'], ['agente', 'Associado identificado pelo CPF'], ['financeiro', 'Boleto do mês gerado nas finanças'], ['planilha', 'Envio registrado na planilha']], fim: 'Respondido na conversa, sem ninguém da equipe parar.' },
    filiacao: { passos: [['site', 'Ficha de filiação enviada pelo site'], ['agente', 'Documentos conferidos'], ['sistema', 'Cadastro criado no sistema'], ['equipe', 'Diretoria avisada para aprovar']], fim: 'Pronto para aprovar, com tudo conferido.' },
    cadastro: { passos: [['email', 'Pedido de atualização por e-mail'], ['agente', 'Dados novos lidos da mensagem'], ['sistema', 'Cadastro atualizado'], ['planilha', 'Alteração registrada']], fim: 'Confirmação respondida por e-mail.' },
    pessoa: { passos: [['whatsapp', 'Mensagem pedindo uma pessoa'], ['agente', 'Assunto resumido em três linhas'], ['equipe', 'Pessoa certa avisada, com o resumo'], ['planilha', 'Atendimento registrado']], fim: 'Ninguém precisa repetir a história.' }
  };
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduzido() { return mq.matches || html.classList.contains('menos-movimento'); }
  function escrever(el, s) {
    var n = el.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== s) n.nodeValue = s; }
    else if (s) el.textContent = s;
  }

  /* ---------- 1. as trilhas ---------- */
  var trilhas = {};   /* "whatsapp" → {base, luz, comprimento}; a de saída tem a chave da saída */
  var linhas = [];
  function criar() {
    ENTRADAS.concat(SAIDAS).forEach(function (k) {
      var base = document.createElementNS(NS, 'path'), luz = document.createElementNS(NS, 'path');
      base.setAttribute('class', 'dp-trilha'); luz.setAttribute('class', 'dp-luz');
      svg.appendChild(base); svg.appendChild(luz);
      trilhas[k] = { base: base, luz: luz, comprimento: 0 };
    });
    for (var i = 0; i < 4; i++) { var li = document.createElement('li'); li.appendChild(document.createTextNode('')); registro.appendChild(li); linhas.push(li); }
    fim.appendChild(document.createTextNode(''));
  }
  /* de (x1, y1) a (x2, y2), descendo: vertical, chanfro de 45°, horizontal, chanfro, vertical */
  function caminho(x1, y1, x2, y2) {
    var dx = x2 - x1, s = dx < 0 ? -1 : 1, meio = (y1 + y2) / 2;
    var d = Math.min(Math.abs(dx) / 2, 9, (y2 - y1) / 2 - 2);
    if (Math.abs(dx) < 1) return 'M' + x1 + ' ' + y1 + 'V' + y2;
    return 'M' + x1 + ' ' + y1 + 'V' + (meio - d) + 'L' + (x1 + s * d) + ' ' + meio + 'H' + (x2 - s * d) + 'L' + x2 + ' ' + (meio + d) + 'V' + y2;
  }
  function desenhar() {
    var p = placa.getBoundingClientRect();
    if (!p.width) return;
    var a = nos.agente.getBoundingClientRect();
    function r(el) { var b = el.getBoundingClientRect(); return { cx: b.left + b.width / 2 - p.left, top: b.top - p.top, bottom: b.bottom - p.top }; }
    var ag = { left: a.left - p.left, w: a.width, top: a.top - p.top - 6, bottom: a.bottom - p.top + 6 };
    ENTRADAS.forEach(function (k, i) {
      var n = r(nos[k]);
      trilhas[k].d = caminho(n.cx, n.bottom, ag.left + ag.w * (i + 1) / (ENTRADAS.length + 1), ag.top);
    });
    SAIDAS.forEach(function (k, i) {
      var n = r(nos[k]);
      trilhas[k].d = caminho(ag.left + ag.w * (i + 1) / (SAIDAS.length + 1), ag.bottom, n.cx, n.top);
    });
    Object.keys(trilhas).forEach(function (k) {
      var t = trilhas[k];
      t.base.setAttribute('d', t.d); t.luz.setAttribute('d', t.d);
      t.comprimento = t.luz.getTotalLength();
      t.luz.style.strokeDasharray = t.comprimento + ' ' + t.comprimento;
      if (!t.acesa) t.luz.style.strokeDashoffset = String(t.comprimento);
    });
  }

  /* ---------- 2. a rota ---------- */
  var vez = 0;   /* cada pedido novo invalida os tempos do anterior */
  function limpar() {
    Object.keys(trilhas).forEach(function (k) {
      var t = trilhas[k]; t.acesa = false;
      t.luz.getAnimations().forEach(function (an) { an.cancel(); });
      t.luz.style.strokeDashoffset = String(t.comprimento);
      t.base.classList.remove('is-feita');
    });
    Object.keys(nos).forEach(function (k) { nos[k].classList.remove('is-aceso', 'is-feito'); });
    linhas.forEach(function (li) { li.classList.remove('is-feito'); });
    escrever(fim, '');
  }
  function acender(trilha, ms) {
    var t = trilhas[trilha]; t.acesa = true;
    t.base.classList.add('is-feita');
    if (!ms) { t.luz.style.strokeDashoffset = '0'; return; }
    t.luz.animate([{ strokeDashoffset: t.comprimento }, { strokeDashoffset: 0 }], { duration: ms, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' });
  }
  function marcarNo(k) {
    Object.keys(nos).forEach(function (o) { if (nos[o].classList.contains('is-aceso')) { nos[o].classList.remove('is-aceso'); nos[o].classList.add('is-feito'); } });
    nos[k].classList.add('is-aceso');
  }
  function rodar(nome) {
    var rota = ROTAS[nome], minha = ++vez;
    [].forEach.call(botoes, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pedido') === nome)); });
    limpar();
    rota.passos.forEach(function (p, i) { escrever(linhas[i], p[1]); });
    var entrada = rota.passos[0][0];
    if (reduzido()) {
      acender(entrada, 0);
      rota.passos.slice(2).forEach(function (p) { acender(p[0], 0); });
      rota.passos.forEach(function (p) { nos[p[0]].classList.add('is-feito'); });
      linhas.forEach(function (li) { li.classList.add('is-feito'); });
      escrever(fim, rota.fim);
      return;
    }
    var agenda = [], t = 0;
    function depois(ms, fn) { t += ms; agenda.push([t, fn]); }
    depois(0, function () { marcarNo(entrada); linhas[0].classList.add('is-feito'); });
    depois(PAUSA_MS, function () { acender(entrada, TRILHA_MS); });
    depois(TRILHA_MS, function () { marcarNo('agente'); linhas[1].classList.add('is-feito'); });
    rota.passos.slice(2).forEach(function (p, i) {
      depois(PAUSA_MS + (i ? 0 : 300), function () { acender(p[0], TRILHA_MS); });   /* (o agente "pensa" um pouco antes da 1ª saída) */
      depois(TRILHA_MS, function () { marcarNo(p[0]); linhas[i + 2].classList.add('is-feito'); });
    });
    depois(PAUSA_MS, function () { marcarNo(entrada); nos[entrada].classList.remove('is-aceso'); escrever(fim, rota.fim); });
    agenda.forEach(function (a) { setTimeout(function () { if (minha === vez) a[1](); }, a[0]); });
  }
  [].forEach.call(botoes, function (b) { b.addEventListener('click', function () { rodar(b.getAttribute('data-pedido')); }); });

  /* ---------- liga ---------- */
  raiz.classList.add('is-viva');
  criar();
  desenhar();
  if (window.ResizeObserver) new ResizeObserver(desenhar).observe(placa);
  else window.addEventListener('resize', desenhar);
  /* entra uma vez, com a peça bem visível e a rolagem parada */
  var visivel = false, entrou = false, parada = 0;
  function talvezEntrar() {
    clearTimeout(parada);
    parada = setTimeout(function () { if (visivel && !entrou) { entrou = true; window.removeEventListener('scroll', talvezEntrar); rodar('boleto'); } }, 150);
  }
  new IntersectionObserver(function (es) {
    visivel = es[0].isIntersecting;
    if (visivel && !entrou) { window.addEventListener('scroll', talvezEntrar, { passive: true }); talvezEntrar(); }
  }, { threshold: 0.6 }).observe(placa);
})();
