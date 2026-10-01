/* ==========================================================================
   LEAD-FORM — modal antes do WhatsApp nos 3 CTAs literalmente rotulados
   "Agendar diagnóstico" (nav, hero, CTA final — marcados com
   [data-lead-gate]). Só o TIPO de organização é obrigatório; nome e desafio
   são opcionais, e o modal tem saída direta para o WhatsApp. Os outros CTAs
   (cards, footer, medidor, bolha) continuam sem fricção.

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
  var erroTipo = document.getElementById('leadTipoErro');
  var avisoTipo = document.getElementById('leadTipoAviso');
  var campoTipo = form.querySelector('select[name="tipo"]');
  var campoTipoOutroWrap = document.getElementById('leadTipoOutroWrap');
  var campoTipoOutro = form.querySelector('input[name="tipoOutro"]');
  var campoDesafio = form.querySelector('textarea[name="desafio"]');
  var lastFocus = null, fechando = 0;

  /* "Outro" no tipo revela um campo de texto pra especificar — só fica
     obrigatório quando essa opção está selecionada, senão o formulário
     recusaria envio por um campo escondido que ninguém vê. */
  if (campoTipo && campoTipoOutroWrap && campoTipoOutro) {
    campoTipo.addEventListener('change', function () {
      var ehOutro = campoTipo.value === 'outro';
      campoTipoOutroWrap.hidden = !ehOutro;
      campoTipoOutro.required = ehOutro;
      /* sem .focus(): quem navega o select com as setas seria arrancado dele.
         O campo novo é o próximo no Tab; o leitor de tela é avisado. */
      if (avisoTipo) avisoTipo.textContent = ehOutro ? 'Campo adicional: qual o tipo?' : '';
      if (campoTipo.value && erroTipo) { erroTipo.hidden = true; campoTipo.removeAttribute('aria-invalid'); }
    });
  }
  /* trava o resto da página fora do modal (teclado E leitor de tela) —
     sem isto, Tab escapava do modal pro conteúdo atrás dele. */
  var restoPagina = document.querySelectorAll('body > header, body > main, body > footer, .wa, .medidor, .skip-link, .regua');

  function travarResto(travar) {
    for (var k = 0; k < restoPagina.length; k++) {
      restoPagina[k].inert = travar;
    }
  }

  function abrir(gatilho) {
    clearTimeout(fechando);   /* reabrir durante o fade de saída não pode esconder o modal aberto */
    lastFocus = gatilho;
    modal.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('is-open');
      });
    });
    document.body.classList.add('is-lead-open');
    travarResto(true);
    if (campoTipo) campoTipo.focus();
    document.addEventListener('keydown', aoEscapar);
  }

  function fechar() {
    modal.classList.remove('is-open');
    document.body.classList.remove('is-lead-open');
    document.removeEventListener('keydown', aoEscapar);
    travarResto(false);
    fechando = setTimeout(function () {
      modal.hidden = true;
      form.reset();
      if (campoTipoOutroWrap) campoTipoOutroWrap.hidden = true;
      if (campoTipoOutro) campoTipoOutro.required = false;
      /* o gatilho pode ter sido o link do menu do celular, que já fechou
         (visibility: hidden): o foco volta ao botão do menu */
      if (lastFocus) {
        var visivel = lastFocus.offsetParent !== null && getComputedStyle(lastFocus).visibility !== 'hidden';
        if (visivel) lastFocus.focus();
        else { var tg = document.querySelector('.nav__toggle'); if (tg) tg.focus(); }
      }
    }, 360); // var(--t) = 340ms: o painel some depois de a transição terminar
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
    /* o único campo obrigatório é o tipo: validado aqui (o form tem novalidate) */
    if (campoTipo && !campoTipo.value) {
      if (erroTipo) erroTipo.hidden = false;
      campoTipo.setAttribute('aria-invalid', 'true');
      campoTipo.focus();
      return;
    }
    var nome = (campoNome && campoNome.value || '').trim();
    var opcaoTipo = campoTipo && campoTipo.value ? campoTipo.selectedOptions[0] : null;
    var artigo = opcaoTipo ? (opcaoTipo.getAttribute('data-artigo') || 'um') : '';
    var tipoTxt = opcaoTipo && opcaoTipo.value === 'outro'
      ? (campoTipoOutro && campoTipoOutro.value || '').trim().toLowerCase()
      : (opcaoTipo ? opcaoTipo.textContent.toLowerCase() : '');
    var desafio = (campoDesafio && campoDesafio.value || '').trim();

    /* js/pagina.js monta "Oi! Vim pelo site da Beyon Zero e " + assunto:
       o assunto SEMPRE começa com verbo. */
    var assunto = 'quero agendar um diagnóstico';
    if (tipoTxt) assunto += ' para ' + artigo + ' ' + tipoTxt;
    if (nome) assunto += '. Sou ' + nome;
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
