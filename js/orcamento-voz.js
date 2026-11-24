/* ==========================================================================
   O MICROFONE DO ZERO (18/11, dono: "na conversa com o Zero era para ter a possibilidade de mandar áudio").
   A pessoa toca em "Falar", fala (até 90 s), toca em "Parar"; o áudio vai ao servidor, vira TEXTO e cai na caixa da
   conversa: ela confere, corrige e envia como qualquer mensagem. O Zero só recebe texto. Nada do áudio fica guardado
   (api/_vendas/voz.mjs). O botão só aparece se o aparelho grava (MediaRecorder) e o servidor tem o recurso ligado.
   Sem blur, sem brilho: o microfone desenhado e o tempo; gravando, um traço fino gira em volta do ícone (só CSS, pela classe
   is-gravando; com movimento reduzido ele para e fecha o anel: css/orcamento-voz.css).
   Cada gravação tem o seu próprio objeto (rec): um evento atrasado de uma gravação antiga nunca mexe na nova.
   ========================================================================== */
(function () {
  'use strict';
  var MAX_S = 90;               /* o mesmo teto do servidor (2 MB de áudio comprimido) */
  var MAX_BYTES = 2 * 1024 * 1024;
  var BITS = 32000;             /* voz em Opus/AAC a 32 kbps: 90 s ficam em ~0,4 MB (sem isso o iOS pode passar de 2 MB) */
  var MIN_MS = 800;             /* menos que isso é só o toque: não há o que ouvir */
  var MAX_TEXTO = 2000;         /* o maxlength da caixa */
  var TIPOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

  function $(id) { return document.getElementById(id); }
  var botao = $('o-mic'), rotulo = $('o-mic-rotulo'), cancelar = $('o-mic-cancelar'), aviso = $('o-mic-aviso'), area = $('o-texto'), form = $('o-form');
  var API = window.BZOrcamento;
  var gravavel = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof window.MediaRecorder === 'function');
  if (!botao || !area || !API || !gravavel) return;

  var estado = 'parado';        /* parado | pedindo | gravando | parando | enviando */
  var rec = null;               /* a gravação de agora: { gravador, fluxo, pedacos, inicio, relogio, descartar } */
  var geracao = 0;              /* sobe a cada pedido novo e a cada "esquece o que estava em andamento" */

  function dizer(texto) {
    aviso.textContent = texto || ''; aviso.hidden = !texto;
    var c = window.BZOrcConversa;   /* (a única região viva da página é a do chat: o leitor de tela ouve por ela) */
    if (texto && c && typeof c.anunciar === 'function') c.anunciar(texto);
  }
  function tempo(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function mostrar() {
    botao.setAttribute('aria-pressed', String(estado === 'gravando'));
    botao.classList.toggle('is-gravando', estado === 'gravando');
    if (estado !== 'parado' && estado !== 'gravando') botao.setAttribute('aria-disabled', 'true'); else botao.removeAttribute('aria-disabled');
    cancelar.hidden = estado !== 'gravando';
    if (estado === 'gravando' && rec) rotulo.textContent = 'Parar · ' + tempo(Math.floor((Date.now() - rec.inicio) / 1000)) + ' de ' + tempo(MAX_S);
    else if (estado === 'enviando' || estado === 'parando') rotulo.textContent = 'Transcrevendo…';
    else if (estado === 'pedindo') rotulo.textContent = 'Abrindo o microfone…';
    else rotulo.textContent = 'Falar';
  }
  function tipoSuportado() {
    for (var i = 0; i < TIPOS.length; i++) { if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(TIPOS[i])) return TIPOS[i]; }
    return '';
  }
  function soltar(r) {   /* devolve o microfone (a luz do aparelho apaga) e para o relógio daquela gravação */
    if (!r) return;
    if (r.fluxo) { r.fluxo.getTracks().forEach(function (t) { t.stop(); }); r.fluxo = null; }
    clearInterval(r.relogio); r.relogio = null;
  }
  function falhaDoMicrofone(e) {
    var nome = e && e.name;
    if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'O microfone está bloqueado neste aparelho. Libere nas configurações do navegador ou escreva a mensagem.';
    if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Não achei um microfone neste aparelho. Escreva a mensagem.';
    return 'Não consegui abrir o microfone. Escreva a mensagem.';
  }
  function ficarParado() { rec = null; estado = 'parado'; mostrar(); }

  /* manda parar: o estado vira "parando" NA HORA (um segundo toque não faz nada) e o resto acontece no onstop */
  function parar(descarte) {
    if (estado !== 'gravando' || !rec) return;
    var r = rec;
    r.descartar = !!descarte;
    estado = 'parando'; mostrar();
    try { r.gravador.stop(); } catch (e) { soltar(r); ficarParado(); dizer('A gravação falhou. Escreva a mensagem.'); }
  }
  /* esquece tudo o que estava em andamento (envio da mensagem, página escondida): grava nada e ignora resposta atrasada */
  function abandonar(descarte) {
    geracao++;
    if (estado === 'gravando') parar(descarte);
    else if (estado === 'enviando') ficarParado();
  }

  function aoParar(r) {
    var duracao = Date.now() - r.inicio;
    var tipo = r.gravador.mimeType || tipoSuportado() || 'audio/webm';
    var audio = new Blob(r.pedacos, { type: tipo });
    r.pedacos = [];
    soltar(r);
    var minha = r.geracao;   /* (a de quando a gravação nasceu: se a pessoa enviou a mensagem no meio, ela já ficou velha) */
    if (r.descartar || minha !== geracao) { ficarParado(); dizer(r.falhou ? 'A gravação falhou. Escreva a mensagem.' : 'Gravação descartada.'); return; }
    if (duracao < MIN_MS || audio.size < 1500) { ficarParado(); dizer('Não ouvi nada. Toque em Falar e fale um pouco mais perto.'); return; }
    if (audio.size > MAX_BYTES) { ficarParado(); dizer('A gravação ficou longa demais. Grave um trecho menor.'); return; }
    rec = null; estado = 'enviando'; mostrar(); dizer('');
    API.transcrever(audio).then(function (resp) {
      if (minha !== geracao) return;   /* a pessoa já enviou a mensagem (ou saiu da tela): o texto atrasado não volta para a caixa */
      var texto = resp && resp.texto ? String(resp.texto) : '';
      ficarParado();
      if (!texto) { dizer('Não consegui entender o áudio. Tente de novo ou escreva a mensagem.'); return; }
      var atual = area.value.trim();
      area.value = (atual ? atual + ' ' : '') + texto;
      if (area.value.length > MAX_TEXTO) area.value = area.value.slice(0, MAX_TEXTO);
      area.dispatchEvent(new Event('input', { bubbles: true }));
      dizer('Pronto. Confira o texto, corrija se precisar e envie.');
      try { area.focus({ preventScroll: true }); area.setSelectionRange(area.value.length, area.value.length); } catch (e) { /* o foco é só conforto */ }
    }, function (e) {
      if (minha !== geracao) return;
      ficarParado();
      dizer((e && e.message) || 'Não consegui transcrever agora. Escreva a sua mensagem.');
    });
  }

  function comecar() {
    var minha = ++geracao;
    estado = 'pedindo'; mostrar(); dizer('');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (f) {
      var r = { gravador: null, fluxo: f, pedacos: [], inicio: 0, relogio: null, descartar: false, falhou: false, geracao: minha };
      /* a página foi para o fundo (ou a pessoa já enviou) enquanto o aviso de permissão estava aberto: não grava, devolve o microfone */
      if (minha !== geracao || document.hidden) { soltar(r); ficarParado(); return; }
      try {
        var tipo = tipoSuportado();
        var opcoes = { audioBitsPerSecond: BITS };
        if (tipo) opcoes.mimeType = tipo;
        r.gravador = new MediaRecorder(f, opcoes);
        r.gravador.ondataavailable = function (ev) { if (ev.data && ev.data.size) r.pedacos.push(ev.data); };
        r.gravador.onstop = function () { aoParar(r); };
        /* o navegador dispara "stop" depois de um erro: marca como descartada para o áudio parcial não ser transcrito */
        r.gravador.onerror = function () {
          r.descartar = true; r.falhou = true;
          if (estado === 'gravando') { estado = 'parando'; mostrar(); }
          try { if (r.gravador.state !== 'inactive') r.gravador.stop(); } catch (e) { /* o stop já vem a caminho */ }
        };
        r.inicio = Date.now(); rec = r;
        r.gravador.start();
      } catch (e) { soltar(r); ficarParado(); dizer('Este aparelho não consegue gravar aqui. Escreva a mensagem.'); return; }
      estado = 'gravando'; mostrar();
      dizer('Gravando. Toque em Parar quando terminar (até ' + tempo(MAX_S) + ').');
      r.relogio = setInterval(function () {
        if (area.offsetParent === null) { parar(true); return; }   /* a conversa fechou com o microfone aberto: solta tudo */
        if (Math.floor((Date.now() - r.inicio) / 1000) >= MAX_S) parar(false); else mostrar();
      }, 500);
    }, function (e) { ficarParado(); if (minha === geracao) dizer(falhaDoMicrofone(e)); });   /* (abandonado no meio do pedido: volta a parado em silêncio) */
  }

  botao.addEventListener('click', function () {
    if (estado === 'parado') comecar();
    else if (estado === 'gravando') parar(false);
  });
  cancelar.addEventListener('click', function () { parar(true); });
  /* a aba foi para o fundo (outro app, tela apagada): grava nada escondido; descarta (e cancela o pedido de permissão em aberto) */
  document.addEventListener('visibilitychange', function () { if (document.hidden && (estado === 'gravando' || estado === 'pedindo')) abandonar(true); });
  window.addEventListener('pagehide', function () { if (estado === 'gravando' || estado === 'pedindo') abandonar(true); });
  /* enviar a mensagem com o microfone aberto, ou antes de a transcrição voltar: nada do que estava em andamento entra depois */
  if (form) form.addEventListener('submit', function () { if (estado !== 'parado') abandonar(true); });

  /* só mostra o botão se o servidor tem o recurso ligado (sessao-config.voz) */
  API.sessaoConfig().then(function (cfg) { if (cfg && cfg.voz) { botao.hidden = false; var nota = $('o-voz-nota'); if (nota) nota.hidden = false; mostrar(); } }, function () { /* sem configuração, sem botão */ });
}());
