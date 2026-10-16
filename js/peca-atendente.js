/* ==========================================================================
   O PLANTÃO (2026-10-14) — o comportamento da peça do cartão do Atendente (css/peca-atendente.css).
   1. A régua de 24 horas começa na hora de VERDADE de quem está vendo (o relógio do aparelho). Arrastar
      (dedo: só com intenção horizontal) ou as setas mudam a hora da conversa; fora do expediente de
      exemplo (8h às 18h) a equipe sai do ar e a tela escurece — e o atendente continua respondendo.
   2. As perguntas: as respostas rápidas do WhatsApp. A pergunta entra com a hora da régua, o atendente
      "digita" e responde no mesmo minuto. O dado do negócio vem como [espaço reservado], nunca inventado.
      "Quero falar com uma pessoa": no expediente, chama a pessoa certa; fora dele, deixa o resumo para a
      equipe — e a mensagem de sistema mostra o resumo (o assunto da última pergunta).
   3. O negócio: se a pessoa pôs o nome e o tipo na peça de Sites (evento "bz:negocio", js/peca-sites.js),
      o atendente aparece com esse nome e as perguntas são as do tipo dela.
   4. A entrada: com a peça bem visível e a rolagem parada, a primeira pergunta acontece uma vez.
   Texto trocado sempre pelo nó de texto (nodeValue); os balões já estão no HTML (nó novo aciona o
   MutationObserver da rede, js/rede.js, que remede a página inteira). Movimento reduzido: a resposta vem
   sem a espera do "digitando".
   ========================================================================== */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-plantao]');
  if (!raiz || !window.IntersectionObserver) return;
  var B = window.BEYON || {};
  var html = document.documentElement;
  var cartao = raiz.closest('article') || document;
  var $ = function (s) { return raiz.querySelector(s); };
  var slider = $('.plantao__slider'), cursor = $('.plantao__cursor'), horaRotulo = $('[data-plantao-hora]');
  var nomeEl = $('[data-plantao-nome]'), inicial = $('[data-plantao-inicial]'), equipe = $('[data-plantao-equipe]');
  var msgs = {};
  [].forEach.call(raiz.querySelectorAll('[data-msg]'), function (m) { msgs[m.getAttribute('data-msg')] = m; });
  var sugestoes = raiz.querySelectorAll('[data-pergunta]');
  var falado = $('.plantao__resposta-sr');
  var manchete = $('[data-plantao-manchete]'), madrugada = $('[data-plantao-madrugada]'), estado = $('[data-plantao-estado]');
  var quero = cartao.querySelector('[data-plantao-quero]');

  var EXPEDIENTE = [8 * 60, 18 * 60];   /* exemplo (a nota da peça diz isso) */
  /* as perguntas por tipo de negócio e as respostas: [antes, dado reservado, depois] */
  var PERGUNTAS = {
    /* universal primeiro (dono, 2026-10-15); os tipos amplos vêm da Planta (evento bz:negocio) */
    padrao: [['preco', 'Quanto custa?'], ['amanha', 'Tem horário amanhã?'], ['local', 'Onde fica?']],
    servicos: [['preco', 'Quanto custa?'], ['prazo', 'Qual é o prazo?'], ['regiao', 'Atendem a minha região?']],
    comercio: [['estoque', 'Tem em estoque?'], ['entrega', 'Entregam no meu bairro?'], ['aberto', 'Até que horas abrem?']],
    saude: [['consulta', 'Quanto custa a consulta?'], ['horario', 'Tem horário amanhã?'], ['convenio', 'Aceita meu convênio?']],
    organizacao: [['associar', 'Como me associo?'], ['mensalidade', 'Quanto é a mensalidade?'], ['boleto', 'Preciso da 2ª via do boleto']]
  };
  var RESPOSTAS = {
    preco: ['O valor é ', '[o da sua tabela]', '. Quer que eu já veja um horário para você?'],
    amanha: ['Amanhã temos ', '[os horários livres da sua agenda]', '. Qual fica melhor?'],
    prazo: ['O prazo é ', '[o seu prazo de entrega]', '. Quer que eu já faça um orçamento?'],
    regiao: ['Atendemos ', '[as regiões que você atende]', '. Qual é o seu bairro?'],
    local: ['Ficamos em ', '[seu endereço]', '. Te mando a localização aqui mesmo?'],
    consulta: ['A consulta sai por ', '[o valor da sua tabela]', '. Quer que eu reserve um horário?'],
    horario: ['Amanhã tenho ', '[os horários livres da sua agenda]', '. Qual fica melhor?'],
    convenio: ['Atendemos ', '[os convênios que você aceita]', '. Me diz o seu que eu confiro.'],
    estoque: ['Tenho, sim: ', '[o que está no seu estoque]', '. Quer que eu separe para você?'],
    entrega: ['Entregamos em ', '[os bairros que você atende]', '. Qual é o seu CEP?'],
    aberto: ['Abrimos ', '[no seu horário]', ', mas por aqui eu te ajudo agora mesmo.'],
    associar: ['É rapidinho: ', '[o seu processo de filiação]', '. Te mando o formulário?'],
    mensalidade: ['A mensalidade é ', '[o valor da sua tabela]', '. Quer saber dos benefícios?'],
    boleto: ['Claro! Me passa o seu CPF que eu ', '[gero a 2ª via no seu sistema]', '.']
  };
  var ASSUNTO = { preco: 'quer saber o preço', amanha: 'quer horário amanhã', prazo: 'quer saber o prazo', regiao: 'quer saber se vocês atendem a região dele', local: 'quer o endereço', consulta: 'quer saber o valor da consulta',
    horario: 'quer horário amanhã', convenio: 'quer saber do convênio', estoque: 'quer saber do estoque', entrega: 'quer saber da entrega', aberto: 'quer saber o horário',
    associar: 'quer se associar', mensalidade: 'quer saber da mensalidade', boleto: 'precisa da 2ª via do boleto' };
  var DIGITANDO_MS = 900;
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduzido() { return mq.matches || html.classList.contains('menos-movimento'); }
  function escrever(el, s) {
    var n = el.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== s) n.nodeValue = s; }
    else if (s) el.textContent = s;
  }
  function hhmm(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }

  var minuto = 600, nicho = 'padrao', nome = '', assunto = '', vez = 0;
  function noExpediente() { return minuto >= EXPEDIENTE[0] && minuto < EXPEDIENTE[1]; }

  /* ---------- 1. a hora ---------- */
  var largura = 0, horas = raiz.querySelectorAll('.pt-hora'), eraDentro = null, eraDentroAntes = null;
  function medir() { largura = slider.clientWidth; aplicar(minuto, true); }
  /* "1 hora e 17 minutos" (o leitor de tela lê "01:17" como número solto) */
  function falada(m) { var h = Math.floor(m / 60), mm = m % 60; return h + (h === 1 ? ' hora' : ' horas') + (mm ? ' e ' + mm + (mm === 1 ? ' minuto' : ' minutos') : ''); }
  /* anunciar: o texto falado do slider só muda quando a pessoa solta ou cruza o expediente (não a cada passo) */
  function aplicar(m, anunciar) {
    minuto = Math.max(0, Math.min(1439, Math.round(m)));
    cursor.style.transform = 'translateX(' + (minuto / 1439 * largura).toFixed(1) + 'px)';
    var h = hhmm(minuto), dentro = noExpediente(), cruzou = dentro !== eraDentro;
    eraDentro = dentro;
    escrever(horaRotulo, h);   /* (o rótulo do ponteiro é absoluto: trocar o texto dele não refaz o layout do cartão) */
    /* a manchete e as horas dos balões são texto corrido: refazer o layout delas a cada quadro do arraste pesava
       (medido com CPU 4×) — mudam ao soltar e ao cruzar o expediente */
    if (cruzou || anunciar) {
      for (var i = 0; i < horas.length; i++) escrever(horas[i], h);
      escrever(manchete, dentro ? h + ': a equipe está no horário.' : h + ': a equipe saiu. O atendente responde.');
    }
    slider.setAttribute('aria-valuenow', String(minuto));
    if (cruzou) {
      var primeira = eraDentroAntes === null;
      raiz.classList.toggle('is-noite', !dentro);
      escrever(equipe, dentro ? 'equipe no horário' : 'equipe fora do ar');
      /* ao virar a noite, a luz atravessa o topo da conversa (não na primeira pintura) */
      if (!dentro && !primeira && !reduzido()) { raiz.classList.remove('is-virou'); void raiz.offsetWidth; raiz.classList.add('is-virou'); }
      if (!msgs.resumo.hidden) pessoa(false);   /* a resposta de "falar com uma pessoa" depende da hora */
    }
    eraDentroAntes = dentro;
    if (cruzou || anunciar) slider.setAttribute('aria-valuetext', falada(minuto) + (dentro ? ', equipe no horário' : ', equipe fora do ar, o atendente responde'));
  }
  var pedido = 0, alvoMin = 0;
  function aplicarNoQuadro(m) { alvoMin = m; if (!pedido) pedido = requestAnimationFrame(function () { pedido = 0; aplicar(alvoMin); }); }
  var esquerda = 0, pendente = null, arrastando = false;
  function emMinuto(ev) { return (ev.clientX - esquerda) / (largura || 1) * 1439; }
  slider.addEventListener('pointerdown', function (ev) {
    cancelAnimationFrame(deslize);   /* a mão da pessoa vence o deslize da entrada */
    esquerda = slider.getBoundingClientRect().left;
    if (ev.pointerType === 'touch') { pendente = { x: ev.clientX, y: ev.clientY }; return; }
    arrastando = true; slider.setPointerCapture(ev.pointerId); aplicar(emMinuto(ev));
  });
  slider.addEventListener('pointermove', function (ev) {
    if (pendente) {
      var dx = Math.abs(ev.clientX - pendente.x), dy = Math.abs(ev.clientY - pendente.y);
      if (dx > 8 && dx > dy) { arrastando = true; pendente = null; slider.setPointerCapture(ev.pointerId); }
      else if (dy > 8) pendente = null;
      return;
    }
    if (arrastando) aplicarNoQuadro(emMinuto(ev));
  });
  function soltar(ev) {
    if (pendente && ev && ev.type === 'pointerup') aplicar(emMinuto(ev), true);
    else if (arrastando) { var m = pedido ? alvoMin : minuto; cancelAnimationFrame(pedido); pedido = 0; aplicar(m, true); }   /* o último passo na fila vale */
    pendente = null; arrastando = false;
  }
  slider.addEventListener('pointerup', soltar);
  slider.addEventListener('pointercancel', soltar);
  slider.addEventListener('keydown', function (ev) {
    var passo = { ArrowLeft: -15, ArrowDown: -15, ArrowRight: 15, ArrowUp: 15, PageDown: -60, PageUp: 60 };
    var alvo = null;
    if (ev.key in passo) alvo = minuto + passo[ev.key];
    else if (ev.key === 'Home') alvo = 0;
    else if (ev.key === 'End') alvo = 1439;
    if (alvo === null) return;
    ev.preventDefault(); cancelAnimationFrame(deslize); aplicar(alvo, true);
  });

  /* ---------- 2. as perguntas ---------- */
  function textoDe(li) { return li.querySelector('.pt-txt'); }
  function responder(partes) {
    var t = textoDe(msgs.resposta).children;
    escrever(t[0], partes[0]); escrever(t[1], partes[1] || ' '); escrever(t[2], partes[2] || ' ');
    t[1].classList.toggle('is-vazio', !partes[1]);
  }
  /* um balão entra: as classes saem de todos, UM reflow, entram (a varredura da aresta só na resposta) */
  function entrar(lista, resposta) {
    lista.forEach(function (li) { li.classList.remove('is-entrando', 'is-chegou'); });
    void raiz.offsetWidth;
    lista.forEach(function (li) { li.classList.add('is-entrando'); });
    if (resposta) resposta.classList.add('is-chegou');
  }
  /* o que o leitor de tela ouve: sem colchetes, dito como dado do negócio */
  function paraOuvir(partes) { return partes[0] + (partes[1] ? partes[1].replace(/[\[\]]/g, '') + ' (dado do seu negócio)' : '') + (partes[2] || ''); }
  function perguntar(rotulo, partes, depois) {
    var minha = ++vez;
    escrever(textoDe(msgs.pergunta), rotulo);
    msgs.pergunta.hidden = false;
    msgs.resumo.hidden = true;
    msgs.resposta.hidden = true;
    if (!reduzido()) entrar([msgs.pergunta]);
    var fim = function () {
      if (minha !== vez) return;
      responder(partes);
      raiz.classList.remove('is-digitando'); escrever(estado, 'atendente virtual');
      msgs.resposta.hidden = false;
      if (!reduzido()) entrar([msgs.resposta], msgs.resposta);
      escrever(falado, paraOuvir(partes));
      if (depois) depois();
    };
    if (reduzido()) { fim(); return; }
    /* "digitando…" embaixo do nome, como no WhatsApp (a resposta entra pronta, sem balão de três pontos) */
    raiz.classList.add('is-digitando'); escrever(estado, 'digitando…');
    setTimeout(fim, DIGITANDO_MS);
  }
  function pessoa(anunciar) {
    var dentro = noExpediente();
    var partes = dentro ? ['Claro! Já chamei ', '[a pessoa certa da equipe]', ', com o resumo da conversa. Ela entra aqui em instantes.']
                        : ['Claro! Deixei o resumo com a equipe. Alguém te responde ', '[no próximo horário de atendimento]', ', sem você repetir nada.'];
    /* o resumo cita a pergunta de antes, que já não está na tela, dizendo que foi antes */
    var resumo = 'resumo para a equipe: quer falar com uma pessoa' + (assunto ? ' (antes, ' + assunto + ')' : '') + (dentro ? '' : ' · enviado às ' + hhmm(minuto));
    if (anunciar === false) { responder(partes); escrever(textoDe(msgs.resumo), resumo); return; }
    perguntar('Quero falar com uma pessoa', partes, function () {
      escrever(textoDe(msgs.resumo), resumo);
      msgs.resumo.hidden = false;
      if (!reduzido()) entrar([msgs.resumo]);
    });
  }
  /* a pergunta k do tipo de negócio atual (a entrada usa esta, sem marcar botão nem falar) */
  function fazer(k) {
    if (k === 'pessoa') { pessoa(); return; }
    var p = PERGUNTAS[nicho][+k];
    perguntar(p[1], RESPOSTAS[p[0]]);
    assunto = ASSUNTO[p[0]];
  }
  [].forEach.call(sugestoes, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(sugestoes, function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      falado.setAttribute('aria-live', 'polite');   /* o leitor de tela só ouve o que a pessoa perguntou */
      fazer(b.getAttribute('data-pergunta'));
    });
  });
  /* a régua desliza até uma hora (a demonstração e "E às 3 da manhã?") */
  var deslize = 0;
  function irPara(alvo, ms, fim) {
    cancelAnimationFrame(deslize);
    if (reduzido()) { aplicar(alvo, true); if (fim) fim(); return; }
    var de = minuto, t0 = performance.now();
    (function passo(t) {
      var k = Math.min(1, (t - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      aplicar(de + (alvo - de) * e, k === 1);
      if (k < 1) deslize = requestAnimationFrame(passo); else if (fim) fim();
    })(t0);
  }
  madrugada.addEventListener('click', function () { irPara(180, 900); });

  /* ---------- 3. o negócio (da peça de Sites) ---------- */
  function negocio() {
    var n = nome || 'Seu negócio';
    escrever(nomeEl, n);
    escrever(inicial, n.charAt(0).toUpperCase());
    PERGUNTAS[nicho].forEach(function (p, i) { escrever(sugestoes[i], p[1]); });
  }
  document.addEventListener('bz:negocio', function (ev) {
    var d = ev.detail || {};
    var mudouTipo = PERGUNTAS[d.nicho] && d.nicho !== nicho;
    nome = typeof d.nome === 'string' ? d.nome.slice(0, 28) : nome;
    if (PERGUNTAS[d.nicho]) nicho = d.nicho;
    negocio();
    if (mudouTipo) { msgs.pergunta.hidden = true; msgs.resposta.hidden = true; msgs.resumo.hidden = true; [].forEach.call(sugestoes, function (o) { o.setAttribute('aria-pressed', 'false'); }); }
  });
  /* "Testar 10 dias grátis": a mensagem com o nome aparece pronta no WhatsApp e a pessoa decide se envia */
  if (quero) quero.addEventListener('click', function () {
    if (!B.linkWA) return;
    quero.href = B.linkWA('quero testar o atendente de IA no WhatsApp por 10 dias grátis' + (nome ? ' para ' + nome : ''));
  });

  /* ---------- liga ---------- */
  raiz.classList.add('is-viva');
  var agora = new Date();
  minuto = agora.getHours() * 60 + agora.getMinutes();   /* a hora de verdade de quem está vendo */
  negocio();
  medir();
  if (window.ResizeObserver) new ResizeObserver(medir).observe(slider);
  else window.addEventListener('resize', medir);
  var visivel = false, entrou = false, parada = 0;
  function talvezEntrar() {
    clearTimeout(parada);
    parada = setTimeout(function () {
      if (!visivel || entrou) return;
      entrou = true; window.removeEventListener('scroll', talvezEntrar);
      if (!msgs.pergunta.hidden) return;
      /* de noite, a pergunta chega na hora de verdade (o caso mais pessoal); de dia, a régua desliza uma vez
         até as 23h e a pergunta chega lá — a noite é o argumento, e a peça fica nela */
      if (!noExpediente()) { fazer('0'); return; }
      irPara(23 * 60, 900, function () { setTimeout(function () { if (msgs.pergunta.hidden) fazer('0'); }, 250); });   /* uma pergunta clicada nesse meio-tempo fica */
    }, 150);
  }
  new IntersectionObserver(function (es) {
    visivel = es[0].isIntersecting;
    if (visivel && !entrou) { window.addEventListener('scroll', talvezEntrar, { passive: true }); talvezEntrar(); }
    else if (!visivel) window.removeEventListener('scroll', talvezEntrar);   /* passou rápido: nada escuta a rolagem fora da tela */
  }, { threshold: 0.6 }).observe($('.plantao__tela'));
})();
