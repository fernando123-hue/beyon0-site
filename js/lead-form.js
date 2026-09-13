/* ==========================================================================
   LEAD-FORM — modal curto antes do WhatsApp nos 2 CTAs de maior intenção
   (hero + CTA final, marcados com [data-lead-gate]).

   Regra: nunca trava o visitante. Se B.linkWA não existir (dom.js falhou
   ou carregou fora de ordem), o script sai sem gatear nada — os links
   `[data-wa]` continuam funcionando normal, sem o modal.

   Evento-só, sem rAF em loop (um par só, pra deixar o hidden→visible
   pintar antes da transição de opacidade — mesmo truque de entrada.js).
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B || typeof B.linkWA !== 'function') return;

  var modal = document.getElementById('leadModal');
  var form = document.getElementById('leadForm');
  if (!modal || !form) return;

  var gated = document.querySelectorAll('[data-lead-gate]');
  if (!gated.length) return;

  var campoNome = form.querySelector('input[name="nome"]');
  var campoTipo = form.querySelector('select[name="tipo"]');
  var lastFocus = null;
  /* trava o resto da página fora do modal (teclado E leitor de tela) —
     sem isto, Tab escapava do modal pro conteúdo atrás dele. */
  var restoPagina = document.querySelectorAll('body > header, body > main, body > footer, .wa, .medidor');

  function travarResto(travar) {
    for (var k = 0; k < restoPagina.length; k++) {
      restoPagina[k].inert = travar;
    }
  }

  function abrir(gatilho) {
    lastFocus = gatilho;
    modal.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('is-open');
      });
    });
    document.body.classList.add('is-lead-open');
    travarResto(true);
    if (campoNome) campoNome.focus();
    document.addEventListener('keydown', aoEscapar);
  }

  function fechar() {
    modal.classList.remove('is-open');
    document.body.classList.remove('is-lead-open');
    document.removeEventListener('keydown', aoEscapar);
    travarResto(false);
    setTimeout(function () {
      modal.hidden = true;
      if (lastFocus) lastFocus.focus();
    }, 220); // var(--t)
  }

  function aoEscapar(e) {
    if (e.key === 'Escape') fechar();
  }

  for (var i = 0; i < gated.length; i++) {
    gated[i].addEventListener('click', function (e) {
      e.preventDefault();
      abrir(this);
    });
  }

  var fechadores = modal.querySelectorAll('[data-lead-close]');
  for (var j = 0; j < fechadores.length; j++) {
    fechadores[j].addEventListener('click', fechar);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var nome = (campoNome && campoNome.value || '').trim();
    var opcaoTipo = campoTipo && campoTipo.value ? campoTipo.selectedOptions[0] : null;
    var tipoTxt = opcaoTipo ? opcaoTipo.textContent.toLowerCase() : '';
    var artigo = opcaoTipo ? (opcaoTipo.getAttribute('data-artigo') || 'um') : '';

    var assunto = 'agendar um diagnóstico';
    if (nome && tipoTxt) {
      assunto = 'agendar um diagnóstico — sou ' + nome + ', de ' + artigo + ' ' + tipoTxt;
    } else if (nome) {
      assunto = 'agendar um diagnóstico — sou ' + nome;
    }

    window.open(B.linkWA(assunto), '_blank', 'noopener,noreferrer');
    form.reset();
    fechar();
  });
})();
