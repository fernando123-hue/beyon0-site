/* ==========================================================================
   O MICROFONE DO ZERO (18/11, dono: "na conversa com o Zero era para ter a possibilidade de mandar áudio").
   A pessoa toca em "Falar", fala (até 90 s), toca em "Parar"; o áudio vai ao servidor, vira TEXTO e cai na caixa da
   conversa: ela confere, corrige e envia como qualquer mensagem. O Zero só recebe texto. Nada do áudio fica guardado
   (api/_vendas/voz.mjs). O botão só aparece se o aparelho grava (MediaRecorder) e o servidor tem o recurso ligado.
   Sem blur, sem brilho: um ponto cheio e o tempo. Sem animação, então movimento reduzido já está respeitado.
   ========================================================================== */
(function () {
  'use strict';
  var MAX_S = 90;               /* o mesmo teto do servidor (2 MB de áudio comprimido) */
  var MIN_MS = 800;             /* menos que isso é só o toque: não há o que ouvir */
  var MAX_TEXTO = 2000;         /* o maxlength da caixa */
  var TIPOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

  function $(id) { return document.getElementById(id); }
  var botao = $('o-mic'), rotulo = $('o-mic-rotulo'), cancelar = $('o-mic-cancelar'), aviso = $('o-mic-aviso'), area = $('o-texto');
  var API = window.BZOrcamento;
  var gravavel = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof window.MediaRecorder === 'function');
  if (!botao || !area || !API || !gravavel) return;

  var estado = 'parado';        /* parado | pedindo | gravando | enviando */
  var gravador = null, fluxo = null, pedacos = [], inicio = 0, relogio = null, descartar = false;

  function dizer(texto) {
    aviso.textContent = texto || ''; aviso.hidden = !texto;
    var c = window.BZOrcConversa;   /* (a única região viva da página é a do chat: o leitor de tela ouve por ela) */
    if (texto && c && typeof c.anunciar === 'function') c.anunciar(texto);
  }
  function tempo(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function mostrar() {
    botao.setAttribute('aria-pressed', String(estado === 'gravando'));
    botao.classList.toggle('is-gravando', estado === 'gravando');
    if (estado === 'enviando' || estado === 'pedindo') botao.setAttribute('aria-disabled', 'true'); else botao.removeAttribute('aria-disabled');
    cancelar.hidden = estado !== 'gravando';
    if (estado === 'gravando') rotulo.textContent = 'Parar · ' + tempo(Math.floor((Date.now() - inicio) / 1000)) + ' de ' + tempo(MAX_S);
    else if (estado === 'enviando') rotulo.textContent = 'Transcrevendo…';
    else if (estado === 'pedindo') rotulo.textContent = 'Abrindo o microfone…';
    else rotulo.textContent = 'Falar';
  }
  function tipoSuportado() {
    for (var i = 0; i < TIPOS.length; i++) { if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(TIPOS[i])) return TIPOS[i]; }
    return '';
  }
  function soltarMicrofone() {
    if (fluxo) { fluxo.getTracks().forEach(function (t) { t.stop(); }); fluxo = null; }
    clearInterval(relogio); relogio = null;
  }
  function falhaDoMicrofone(e) {
    var nome = e && e.name;
    if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'O microfone está bloqueado neste aparelho. Libere nas configurações do navegador ou escreva a mensagem.';
    if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Não achei um microfone neste aparelho. Escreva a mensagem.';
    return 'Não consegui abrir o microfone. Escreva a mensagem.';
  }

  function parar(descarte) {
    if (estado !== 'gravando' || !gravador) return;
    descartar = !!descarte;
    try { gravador.stop(); } catch (e) { terminar(); }
  }
  function terminar() {
    soltarMicrofone();
    estado = 'parado'; gravador = null; mostrar();
  }
  function aoParar() {
    var duracao = Date.now() - inicio;
    var tipo = (gravador && gravador.mimeType) || tipoSuportado() || 'audio/webm';
    var audio = new Blob(pedacos, { type: tipo });
    pedacos = [];
    soltarMicrofone();
    gravador = null;
    if (descartar) { estado = 'parado'; mostrar(); dizer('Gravação descartada.'); return; }
    if (duracao < MIN_MS || audio.size < 1500) { estado = 'parado'; mostrar(); dizer('Não ouvi nada. Toque em Falar e fale um pouco mais perto.'); return; }
    estado = 'enviando'; mostrar(); dizer('');
    API.transcrever(audio).then(function (r) {
      var texto = r && r.texto ? String(r.texto) : '';
      estado = 'parado'; mostrar();
      if (!texto) { dizer('Não consegui entender o áudio. Tente de novo ou escreva a mensagem.'); return; }
      var atual = area.value.trim();
      area.value = (atual ? atual + ' ' : '') + texto;
      if (area.value.length > MAX_TEXTO) area.value = area.value.slice(0, MAX_TEXTO);
      area.dispatchEvent(new Event('input', { bubbles: true }));
      dizer('Pronto. Confira o texto, corrija se precisar e envie.');
      try { area.focus({ preventScroll: true }); area.setSelectionRange(area.value.length, area.value.length); } catch (e) { /* o foco é só conforto */ }
    }, function (e) {
      estado = 'parado'; mostrar();
      dizer((e && e.message) || 'Não consegui transcrever agora. Escreva a sua mensagem.');
    });
  }

  function comecar() {
    estado = 'pedindo'; mostrar(); dizer('');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (f) {
      fluxo = f; pedacos = []; descartar = false;
      var tipo = tipoSuportado();
      try { gravador = tipo ? new MediaRecorder(f, { mimeType: tipo }) : new MediaRecorder(f); }
      catch (e) { soltarMicrofone(); estado = 'parado'; mostrar(); dizer('Este aparelho não consegue gravar aqui. Escreva a mensagem.'); return; }
      gravador.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
      gravador.onstop = aoParar;
      gravador.onerror = function () { terminar(); dizer('A gravação falhou. Escreva a mensagem.'); };
      inicio = Date.now(); estado = 'gravando'; gravador.start(); mostrar();
      dizer('Gravando. Toque em Parar quando terminar (até ' + tempo(MAX_S) + ').');
      relogio = setInterval(function () {
        if (Math.floor((Date.now() - inicio) / 1000) >= MAX_S) parar(false); else mostrar();
      }, 500);
    }, function (e) { estado = 'parado'; mostrar(); dizer(falhaDoMicrofone(e)); });
  }

  botao.addEventListener('click', function () {
    if (estado === 'parado') comecar();
    else if (estado === 'gravando') parar(false);
  });
  cancelar.addEventListener('click', function () { parar(true); });
  /* a aba foi para o fundo (outro app, tela apagada): grava nada escondido; descarta */
  document.addEventListener('visibilitychange', function () { if (document.hidden && estado === 'gravando') parar(true); });
  window.addEventListener('pagehide', function () { if (estado === 'gravando') parar(true); });

  /* só mostra o botão se o servidor tem o recurso ligado (sessao-config.voz) */
  API.sessaoConfig().then(function (cfg) { if (cfg && cfg.voz) { botao.hidden = false; var nota = $('o-voz-nota'); if (nota) nota.hidden = false; mostrar(); } }, function () { /* sem configuração, sem botão */ });
}());
