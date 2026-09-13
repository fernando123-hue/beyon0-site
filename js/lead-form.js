/* ==========================================================================
   LEAD-FORM — modal antes do WhatsApp nos 3 CTAs literalmente rotulados
   "Agendar diagnóstico" (nav, hero, CTA final — marcados com
   [data-lead-gate]). Os outros CTAs com rótulo diferente (cards de
   serviço, footer, medidor, bolha do WhatsApp) continuam sem fricção.

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
  var campoOrganizacao = form.querySelector('input[name="organizacao"]');
  var campoTipo = form.querySelector('select[name="tipo"]');
  var campoTipoOutroWrap = document.getElementById('leadTipoOutroWrap');
  var campoTipoOutro = form.querySelector('input[name="tipoOutro"]');
  var campoDesafio = form.querySelector('textarea[name="desafio"]');
  var lastFocus = null;

  /* "Outro" no tipo revela um campo de texto pra especificar — só fica
     obrigatório quando essa opção está selecionada, senão o formulário
     recusaria envio por um campo escondido que ninguém vê. */
  if (campoTipo && campoTipoOutroWrap && campoTipoOutro) {
    campoTipo.addEventListener('change', function () {
      var ehOutro = campoTipo.value === 'outro';
      campoTipoOutroWrap.hidden = !ehOutro;
      campoTipoOutro.required = ehOutro;
      if (ehOutro) campoTipoOutro.focus();
    });
  }
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
      form.reset();
      if (campoTipoOutroWrap) campoTipoOutroWrap.hidden = true;
      if (campoTipoOutro) campoTipoOutro.required = false;
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
    var organizacao = (campoOrganizacao && campoOrganizacao.value || '').trim();
    var opcaoTipo = campoTipo && campoTipo.value ? campoTipo.selectedOptions[0] : null;
    var artigo = opcaoTipo ? (opcaoTipo.getAttribute('data-artigo') || 'um') : '';
    var tipoTxt = opcaoTipo && opcaoTipo.value === 'outro'
      ? (campoTipoOutro && campoTipoOutro.value || '').trim().toLowerCase()
      : (opcaoTipo ? opcaoTipo.textContent.toLowerCase() : '');
    var desafio = (campoDesafio && campoDesafio.value || '').trim();

    var assunto = 'agendar um diagnóstico';
    if (nome && organizacao && tipoTxt) {
      assunto = 'agendar um diagnóstico — sou ' + nome + ', de ' + artigo + ' ' + tipoTxt + ' (' + organizacao + ')';
    } else if (nome && tipoTxt) {
      assunto = 'agendar um diagnóstico — sou ' + nome + ', de ' + artigo + ' ' + tipoTxt;
    } else if (nome) {
      assunto = 'agendar um diagnóstico — sou ' + nome;
    }
    if (desafio) {
      assunto += '. O desafio que eu quero resolver: ' + desafio;
    }

    window.open(B.linkWA(assunto), '_blank', 'noopener,noreferrer');
    form.reset();
    if (campoTipoOutroWrap) campoTipoOutroWrap.hidden = true;
    if (campoTipoOutro) campoTipoOutro.required = false;
    fechar();
  });
})();
