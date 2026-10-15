/* ==========================================================================
   O DESPACHO (2026-10-14) — o comportamento da peça do cartão de Automação (css/peca-automacao.css).
   1. As trilhas: do pé de cada canal a um pino do AGENTE (e uma paralela, 3 px ao lado, para a volta),
      e de outro pino dele a cada saída; retas com chanfro de 45° (o barramento do site), coordenadas no
      meio do pixel (1 px nítido). Desenhadas de novo só quando o tamanho ou a fonte mudam; os <path>
      estão no HTML (nó novo aciona o MutationObserver da rede, js/rede.js, que remede a página inteira).
   2. A rota de um pedido:
      - o canal acende e o PACOTE (1 × 10 px) corre pela trilha a velocidade constante (0,4 px/ms, linear:
        sinal não acelera nem freia), só por transform; a trilha acende por classe quando ele chega;
      - o agente diz o que está fazendo e "pensa" 360 ms;
      - O LEQUE: todas as saídas do pedido partem ao mesmo tempo; chegam na ordem do comprimento;
      - O RETORNO: a resposta sobe pela trilha paralela até o canal, que recebe o "✓".
      O registro imprime na ordem real de chegada, e o número do passo aparece no nó.
   3. A entrada: com a peça bem visível e a rolagem parada, roda uma vez o boleto (a rota em que a equipe
      fica livre). Depois, só pela mão de quem vê.
   Movimento reduzido: a rota aparece acesa de uma vez, com o registro inteiro.
   ========================================================================== */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-despacho]');
  if (!raiz || !window.IntersectionObserver) return;
  var B = window.BEYON || {};
  var html = document.documentElement;
  var cartao = raiz.closest('article') || document;
  var placa = raiz.querySelector('.despacho__placa');
  var linhas = [].slice.call(raiz.querySelectorAll('.despacho__registro li'));
  var fim = raiz.querySelector('.despacho__fim'), fimTexto = raiz.querySelector('[data-despacho-fim]');
  var verbo = raiz.querySelector('[data-verbo]');
  var pacotes = [].slice.call(raiz.querySelectorAll('.dp-pacote'));
  var botoes = raiz.querySelectorAll('[data-pedido]');
  var quero = cartao.querySelector('[data-despacho-quero]'), wa = cartao.querySelector('[data-despacho-wa]');
  var nos = {}, trilhas = {}, voltas = {};
  [].forEach.call(raiz.querySelectorAll('[data-no]'), function (n) { nos[n.getAttribute('data-no')] = n; });
  [].forEach.call(raiz.querySelectorAll('[data-trilha]'), function (p) { trilhas[p.getAttribute('data-trilha')] = { el: p, pts: [] }; });
  [].forEach.call(raiz.querySelectorAll('[data-volta]'), function (p) { voltas[p.getAttribute('data-volta')] = { el: p, pts: [] }; });
  var ENTRADAS = ['whatsapp', 'email', 'site'], SAIDAS = ['sistema', 'financeiro', 'planilha', 'equipe'];
  var VELOCIDADE = 0.4, PENSA_MS = 360, ARRANQUE_MS = 120, RESPIRO_MS = 200;
  /* rotinas de EXEMPLO de uma entidade (a nota da peça diz isso). Cada pedido: o canal, o que o agente faz,
     duas saídas em leque, quem fica livre e o resultado */
  var ROTAS = {
    boleto: { rotulo: '2ª via do boleto', canal: ['whatsapp', 'Pedido chegou pelo WhatsApp'], agente: ['conferindo CPF…', 'Associado identificado pelo CPF'],
      saidas: [['financeiro', 'Boleto do mês gerado nas finanças'], ['planilha', 'Envio registrado na planilha']], livre: ['equipe'], fim: 'Respondido na conversa, sem ninguém da equipe parar.' },
    filiacao: { rotulo: 'nova filiação', canal: ['site', 'Ficha de filiação enviada pelo site'], agente: ['conferindo documentos…', 'Documentos conferidos'],
      saidas: [['sistema', 'Cadastro criado no sistema'], ['equipe', 'Diretoria avisada para aprovar']], livre: [], fim: 'Pronto para aprovar, com tudo conferido.' },
    cadastro: { rotulo: 'atualização de cadastro', canal: ['email', 'Pedido de atualização por e-mail'], agente: ['lendo a mensagem…', 'Dados novos lidos da mensagem'],
      saidas: [['sistema', 'Cadastro atualizado no sistema'], ['planilha', 'Alteração registrada na planilha']], livre: ['equipe'], fim: 'Confirmação respondida por e-mail.' },
    /* (era "falar com uma pessoa", que é o que o cartão do Atendente vende: cada cartão vende uma coisa) */
    relatorio: { rotulo: 'o relatório do mês', canal: ['email', 'Diretoria pediu o relatório do mês'], agente: ['juntando os números…', 'Números do mês conferidos'],
      saidas: [['planilha', 'Planilha do mês fechada'], ['equipe', 'Relatório entregue à diretoria']], livre: [], fim: 'Relatório pronto sem ninguém montar planilha.' }
  };
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduzido() { return mq.matches || html.classList.contains('menos-movimento'); }
  function escrever(el, s) {
    var n = el.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== s) n.nodeValue = s; }
    else if (s) el.textContent = s;
  }
  /* o número do passo no nó (o <b> já traz um nó de texto no HTML: só o nodeValue muda) */
  function numerar(no, s) { escrever(no.querySelector('.dp-n'), s || ' '); no.classList.toggle('tem-n', !!s); }

  /* ---------- 1. as trilhas ---------- */
  var px = function (v) { return Math.round(v) + 0.5; };   /* o meio do pixel: a linha de 1 px não se divide em duas */
  /* de (x1, y1) a (x2, y2), descendo: vertical, chanfro de 45°, horizontal, chanfro, vertical */
  function pontos(x1, y1, x2, y2) {
    x1 = px(x1); x2 = px(x2); y1 = Math.round(y1); y2 = Math.round(y2);
    var dx = x2 - x1, s = dx < 0 ? -1 : 1, meio = Math.round((y1 + y2) / 2);
    var d = Math.floor(Math.min(Math.abs(dx) / 2, 9, (y2 - y1) / 2 - 2));
    if (Math.abs(dx) < 1 || d < 1) return [[x1, y1], [x1, meio], [x2, meio], [x2, y2]].filter(function (p, i, a) { return !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]; });
    return [[x1, y1], [x1, meio - d], [x1 + s * d, meio], [x2 - s * d, meio], [x2, meio + d], [x2, y2]];
  }
  function d(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(''); }
  function desenhar() {
    var p = placa.getBoundingClientRect();
    if (!p.width) return;
    function r(el) { var b = el.getBoundingClientRect(); return { cx: b.left + b.width / 2 - p.left, top: b.top - p.top, bottom: b.bottom - p.top }; }
    var a = nos.agente.getBoundingClientRect();
    var ag = { left: a.left - p.left, w: a.width, top: a.top - p.top - 6, bottom: a.bottom - p.top + 6 };
    ENTRADAS.forEach(function (k, i) {
      var n = r(nos[k]), pino = ag.left + ag.w * (i + 1) / (ENTRADAS.length + 1);
      trilhas[k].pts = pontos(n.cx, n.bottom, pino, ag.top);
      voltas[k].pts = pontos(n.cx + 3, n.bottom, pino + 3, ag.top).reverse();   /* a volta sobe, 3 px ao lado */
    });
    SAIDAS.forEach(function (k, i) {
      var n = r(nos[k]);
      trilhas[k].pts = pontos(ag.left + ag.w * (i + 1) / (SAIDAS.length + 1), ag.bottom, n.cx, n.top);
    });
    [trilhas, voltas].forEach(function (grupo) { Object.keys(grupo).forEach(function (k) { grupo[k].el.setAttribute('d', d(grupo[k].pts)); }); });
  }

  /* ---------- 2. o pacote ---------- */
  /* quadros-chave pelos cantos da trilha, com o tempo proporcional à distância: velocidade constante; nos
     cantos o segmento gira junto (vertical, 45° ou horizontal) */
  function comprimento(pts) { var l = 0; for (var i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }
  function correr(pacote, pts, aoChegar, msFixo) {
    var segs = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dy);
      segs.push({ l: l, giro: Math.atan2(dy, dx) * 180 / Math.PI - 90 }); total += l;
    }
    if (!total) { aoChegar(); return; }
    var quadros = [], feito = 0;
    segs.forEach(function (s, i) {
      quadros.push({ transform: 'translate(' + pts[i][0] + 'px,' + pts[i][1] + 'px) rotate(' + s.giro + 'deg)', offset: feito / total, opacity: 1 });
      feito += s.l;
      quadros.push({ transform: 'translate(' + pts[i + 1][0] + 'px,' + pts[i + 1][1] + 'px) rotate(' + s.giro + 'deg)', offset: feito / total, opacity: 1 });
    });
    var an = pacote.animate(quadros, { duration: msFixo || Math.max(160, total / VELOCIDADE), easing: 'linear' });
    an.onfinish = aoChegar;
    emVoo.push(an);
  }

  /* ---------- 3. a rota ---------- */
  var vez = 0, emVoo = [], passo = 0;
  function limpar() {
    emVoo.forEach(function (an) { an.onfinish = null; an.cancel(); }); emVoo = [];
    [trilhas, voltas].forEach(function (g) { Object.keys(g).forEach(function (k) { g[k].el.classList.remove('is-acesa'); }); });
    Object.keys(nos).forEach(function (k) { nos[k].classList.remove('is-aceso', 'is-feito', 'is-livre', 'is-respondido'); numerar(nos[k], ''); });
    linhas.forEach(function (li) { li.classList.remove('is-feito', 'is-novo'); });
    fim.classList.remove('is-pronto'); escrever(fimTexto, ' ');
    escrever(verbo, 'pronto');
    passo = 0;
  }
  /* imprime a próxima linha do registro e põe o mesmo número no nó */
  function registrar(no, texto) {
    var li = linhas[passo]; passo++;
    escrever(li, texto);
    linhas.forEach(function (o) { o.classList.remove('is-novo'); });
    li.classList.add('is-feito', 'is-novo');
    numerar(nos[no], (passo < 10 ? '0' : '') + passo);
  }
  function rodar(nome) {
    var rota = ROTAS[nome], minha = ++vez;
    var vale = function (fn) { return function () { if (minha === vez) fn(); }; };
    [].forEach.call(botoes, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pedido') === nome)); });
    limpar();
    var canal = rota.canal[0];
    if (reduzido()) {
      trilhas[canal].el.classList.add('is-acesa'); voltas[canal].el.classList.add('is-acesa');
      registrar(canal, rota.canal[1]); registrar('agente', rota.agente[1]);
      rota.saidas.forEach(function (s) { trilhas[s[0]].el.classList.add('is-acesa'); nos[s[0]].classList.add('is-feito'); registrar(s[0], s[1]); });
      rota.livre.forEach(function (k) { nos[k].classList.add('is-livre'); });
      nos[canal].classList.add('is-feito'); nos.agente.classList.add('is-feito');
      numerar(nos[canal], '✓'); nos[canal].classList.add('is-respondido');
      escrever(verbo, 'feito'); escrever(fimTexto, rota.fim); fim.classList.add('is-pronto');
      return;
    }
    nos[canal].classList.add('is-aceso');
    registrar(canal, rota.canal[1]);
    setTimeout(vale(function () {
      correr(pacotes[0], trilhas[canal].pts, vale(function () {
        trilhas[canal].el.classList.add('is-acesa');
        nos[canal].classList.replace('is-aceso', 'is-feito');
        nos.agente.classList.add('is-aceso');
        escrever(verbo, rota.agente[0]);
        setTimeout(vale(function () {
          registrar('agente', rota.agente[1]);
          leque(rota, vale);
        }), PENSA_MS);
      }));
    }), ARRANQUE_MS);
  }
  /* O LEQUE: todas as saídas partem JUNTAS (os pinos de baixo estalam); as durações saem do comprimento, mas a
     chegada segue a ordem da rota, 60 ms uma da outra — a ordem do registro não depende da largura da tela */
  function leque(rota, vale) {
    var faltam = rota.saidas.length, anterior = 0;
    nos.agente.classList.add('is-despacha');
    setTimeout(function () { nos.agente.classList.remove('is-despacha'); }, 160);
    rota.saidas.forEach(function (s, i) {
      var t = trilhas[s[0]];
      var ms = Math.max(160, comprimento(t.pts) / VELOCIDADE, anterior + 60); anterior = ms;
      correr(pacotes[1 + i], t.pts, vale(function () {
        t.el.classList.add('is-acesa');
        nos[s[0]].classList.add('is-feito');
        registrar(s[0], s[1]);
        if (--faltam === 0) setTimeout(vale(function () { retorno(rota, vale); }), RESPIRO_MS);
      }), ms);
    });
  }
  /* O RETORNO: a resposta sobe pela trilha paralela até o canal, que recebe o "✓" */
  function retorno(rota, vale) {
    var canal = rota.canal[0];
    escrever(verbo, 'respondendo…');
    correr(pacotes[3], voltas[canal].pts, vale(function () {
      voltas[canal].el.classList.add('is-acesa');
      nos.agente.classList.replace('is-aceso', 'is-feito');
      numerar(nos[canal], '✓'); nos[canal].classList.add('is-respondido');
      /* a equipe que não precisou parar fica tracejada só agora, no fim (antes, entregava o final) */
      rota.livre.forEach(function (k) { nos[k].classList.add('is-livre'); });
      escrever(verbo, 'feito');
      escrever(fimTexto, rota.fim);
      fim.classList.add('is-pronto');
    }));
  }
  var escolhido = null;
  [].forEach.call(botoes, function (b) {
    b.addEventListener('click', function () {
      escolhido = b.getAttribute('data-pedido');
      fim.setAttribute('aria-live', 'polite');   /* o leitor de tela só anuncia o que a pessoa pediu (a rota da entrada roda sozinha) */
      rodar(escolhido);
    });
  });
  /* o pedido escolhido vai junto só se a pessoa pedir o diagnóstico (nesta aba, nunca pela URL) */
  if (quero) quero.addEventListener('click', function () {
    try { if (escolhido) sessionStorage.setItem('bz-despacho-pedido', ROTAS[escolhido].rotulo); else sessionStorage.removeItem('bz-despacho-pedido'); }
    catch (e) { /* sem armazenamento: o formulário abre vazio */ }
  });
  if (wa) wa.addEventListener('click', function () {
    if (!B.linkWA) return;
    wa.href = B.linkWA(escolhido ? 'quero automatizar a ' + ROTAS[escolhido].rotulo + ' na minha entidade' : 'quero entender o que dá para automatizar na minha entidade');
  });

  /* ---------- liga ---------- */
  raiz.classList.add('is-viva');
  desenhar();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(desenhar);   /* (a largura do chip depende da fonte) */
  if (window.ResizeObserver) new ResizeObserver(desenhar).observe(placa);
  else window.addEventListener('resize', desenhar);
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
