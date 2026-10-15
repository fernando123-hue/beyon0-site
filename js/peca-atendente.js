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
  var quero = cartao.querySelector('[data-plantao-quero]');

  var EXPEDIENTE = [8 * 60, 18 * 60];   /* exemplo (a nota da peça diz isso) */
  /* as perguntas por tipo de negócio e as respostas: [antes, dado reservado, depois] */
  var PERGUNTAS = {
    padrao: [['preco', 'Quanto custa?'], ['amanha', 'Vocês abrem amanhã?'], ['local', 'Onde fica?']],
    clinica: [['consulta', 'Quanto custa a consulta?'], ['horario', 'Tem horário amanhã?'], ['convenio', 'Aceita meu convênio?']],
    escritorio: [['honorario', 'Quanto vocês cobram?'], ['caso', 'Atendem o meu caso?'], ['semana', 'Tem horário essa semana?']],
    loja: [['estoque', 'Tem esse em estoque?'], ['entrega', 'Entregam no meu bairro?'], ['aberto', 'Até que horas abrem?']],
    entidade: [['associar', 'Como me associo?'], ['mensalidade', 'Quanto é a mensalidade?'], ['boleto', 'Preciso da 2ª via do boleto']]
  };
  var RESPOSTAS = {
    preco: ['O valor é ', '[o da sua tabela]', '. Quer que eu já veja um horário para você?'],
    amanha: ['Abrimos amanhã ', '[no seu horário]', '. Posso deixar seu atendimento marcado?'],
    local: ['Ficamos em ', '[seu endereço]', '. Te mando a localização aqui mesmo?'],
    consulta: ['A consulta sai por ', '[o valor da sua tabela]', '. Quer que eu reserve um horário?'],
    horario: ['Amanhã tenho ', '[os horários livres da sua agenda]', '. Qual fica melhor?'],
    convenio: ['Atendemos ', '[os convênios que você aceita]', '. Me diz o seu que eu confiro.'],
    honorario: ['Depende do caso: ', '[como você cobra]', '. Me conta rapidinho o que aconteceu?'],
    caso: ['Atuamos com ', '[as suas áreas]', '. Posso já marcar uma conversa?'],
    semana: ['Esta semana temos ', '[os horários livres]', '. Algum serve?'],
    estoque: ['Tenho, sim: ', '[o que está no seu estoque]', '. Quer que eu separe para você?'],
    entrega: ['Entregamos em ', '[os bairros que você atende]', '. Qual é o seu CEP?'],
    aberto: ['Abrimos ', '[no seu horário]', ', mas por aqui eu te ajudo agora mesmo.'],
    associar: ['É rapidinho: ', '[o seu processo de filiação]', '. Te mando o formulário?'],
    mensalidade: ['A mensalidade é ', '[o valor da sua tabela]', '. Quer saber dos benefícios?'],
    boleto: ['Claro! Me passa o seu CPF que eu ', '[gero a 2ª via no seu sistema]', '.']
  };
  var ASSUNTO = { preco: 'quer saber o preço', amanha: 'quer atendimento amanhã', local: 'quer o endereço', consulta: 'quer saber o valor da consulta',
    horario: 'quer horário amanhã', convenio: 'quer saber do convênio', honorario: 'quer saber quanto custa', caso: 'quer saber se vocês atendem o caso',
    semana: 'quer horário esta semana', estoque: 'quer saber do estoque', entrega: 'quer saber da entrega', aberto: 'quer saber o horário',
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
  var largura = 0;
  function medir() { largura = slider.clientWidth; aplicar(minuto); }
  function aplicar(m) {
    minuto = Math.max(0, Math.min(1439, Math.round(m)));
    cursor.style.transform = 'translateX(' + (minuto / 1439 * largura).toFixed(1) + 'px)';
    var h = hhmm(minuto), dentro = noExpediente();
    escrever(horaRotulo, h);
    raiz.classList.toggle('is-noite', !dentro);
    escrever(equipe, dentro ? 'equipe no horário' : 'equipe fora do ar');
    slider.setAttribute('aria-valuenow', String(minuto));
    slider.setAttribute('aria-valuetext', h + (dentro ? ', equipe no horário' : ', equipe fora do ar, o atendente responde'));
    [].forEach.call(raiz.querySelectorAll('.pt-hora'), function (el) { escrever(el, h); });
    if (!msgs.resumo.hidden) pessoa(false);   /* a resposta de "falar com uma pessoa" depende da hora */
  }
  var esquerda = 0, pendente = null, arrastando = false;
  function emMinuto(ev) { return (ev.clientX - esquerda) / (largura || 1) * 1439; }
  slider.addEventListener('pointerdown', function (ev) {
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
    if (arrastando) aplicar(emMinuto(ev));
  });
  function soltar(ev) { if (pendente && ev && ev.type === 'pointerup') aplicar(emMinuto(ev)); pendente = null; arrastando = false; }
  slider.addEventListener('pointerup', soltar);
  slider.addEventListener('pointercancel', soltar);
  slider.addEventListener('keydown', function (ev) {
    var passo = { ArrowLeft: -15, ArrowDown: -15, ArrowRight: 15, ArrowUp: 15, PageDown: -60, PageUp: 60 };
    var alvo = null;
    if (ev.key in passo) alvo = minuto + passo[ev.key];
    else if (ev.key === 'Home') alvo = 0;
    else if (ev.key === 'End') alvo = 1439;
    if (alvo === null) return;
    ev.preventDefault(); aplicar(alvo);
  });

  /* ---------- 2. as perguntas ---------- */
  function textoDe(li) { return li.querySelector('.pt-txt'); }
  function responder(partes) {
    var t = textoDe(msgs.resposta).children;
    escrever(t[0], partes[0]); escrever(t[1], partes[1] || ' '); escrever(t[2], partes[2] || ' ');
    t[1].classList.toggle('is-vazio', !partes[1]);
  }
  function chegar(li) { li.classList.remove('is-chegou'); void li.offsetWidth; li.classList.add('is-chegou'); }
  function perguntar(rotulo, partes, depois) {
    var minha = ++vez;
    escrever(textoDe(msgs.pergunta), rotulo);
    msgs.pergunta.hidden = false;
    msgs.resumo.hidden = true;
    msgs.resposta.hidden = false;
    var fim = function () {
      if (minha !== vez) return;
      responder(partes);
      msgs.resposta.classList.remove('is-digitando');
      if (!reduzido()) chegar(msgs.resposta);
      escrever(falado, partes.join(''));
      if (depois) depois();
    };
    if (reduzido()) { fim(); return; }
    msgs.resposta.classList.add('is-digitando');
    setTimeout(fim, DIGITANDO_MS);
  }
  function pessoa(anunciar) {
    var dentro = noExpediente();
    var partes = dentro ? ['Claro! Já chamei ', '[a pessoa certa da equipe]', ', com o resumo da conversa. Ela entra aqui em instantes.']
                        : ['Claro! Deixei o resumo com a equipe. Alguém te responde ', '[no próximo horário de atendimento]', ', sem você repetir nada.'];
    var resumo = 'resumo para a equipe: ' + (assunto || 'quer falar com uma pessoa') + (dentro ? '' : ' · enviado às ' + hhmm(minuto));
    if (anunciar === false) { responder(partes); escrever(textoDe(msgs.resumo), resumo); return; }
    perguntar('Quero falar com uma pessoa', partes, function () {
      escrever(textoDe(msgs.resumo), resumo);
      msgs.resumo.hidden = false;
    });
  }
  [].forEach.call(sugestoes, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(sugestoes, function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      var k = b.getAttribute('data-pergunta');
      if (k === 'pessoa') { pessoa(); return; }
      var p = PERGUNTAS[nicho][+k];
      assunto = ASSUNTO[p[0]];
      perguntar(p[1], RESPOSTAS[p[0]]);
    });
  });

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
      if (msgs.pergunta.hidden) sugestoes[0].click();
    }, 150);
  }
  new IntersectionObserver(function (es) {
    visivel = es[0].isIntersecting;
    if (visivel && !entrou) { window.addEventListener('scroll', talvezEntrar, { passive: true }); talvezEntrar(); }
  }, { threshold: 0.6 }).observe($('.plantao__tela'));
})();
