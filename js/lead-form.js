/* ==========================================================================
   LEAD-FORM — modal antes do WhatsApp nos 3 CTAs literalmente rotulados
   "Agendar diagnóstico" (nav, hero, CTA final — marcados com
   [data-lead-gate]). Só o TIPO de organização é obrigatório; nome e desafio
   são opcionais, e o modal tem saída direta para o WhatsApp. Os outros CTAs
   (cards, footer, medidor, bolha) continuam sem fricção.

   Regra: nunca trava o visitante. Se B.linkWA não existir (pagina.js falhou
   ou carregou fora de ordem), o script sai sem gatear nada — os links
   `[data-wa]` continuam funcionando normal, sem o modal.

   Evento-só, sem rAF em loop (um par só, pra deixar o hidden→visible
   pintar antes da transição de opacidade).
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
      if (campoTipo.value && erroTipo) { erroTipo.hidden = true; campoTipo.removeAttribute('aria-invalid'); campoTipo.removeAttribute('aria-describedby'); }
    });
  }
  /* trava o resto da página fora do modal (teclado E leitor de tela) —
     sem isto, Tab escapava do modal pro conteúdo atrás dele. */
  /* (consultado a cada vez: o aviso de cookies, js/medicao.js, nasce depois do load) */
  var RESTO_PAGINA = 'body > header, body > main, body > footer, .wa, .barra, .skip-link, .consentimento';

  function travarResto(travar) {
    var restoPagina = document.querySelectorAll(RESTO_PAGINA);
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
    if (B.emit) B.emit('formulario', { fase: 'abriu' });   /* (js/metricas.js: quem abre e onde desiste) */
  }

  function fechar() {
    if (B.emit && modal.classList.contains('is-open')) B.emit('formulario', { fase: 'fechou' });
    modal.classList.remove('is-open');
    document.body.classList.remove('is-lead-open');
    document.removeEventListener('keydown', aoEscapar);
    travarResto(false);
    fechando = setTimeout(function () {
      modal.hidden = true;
      form.reset();
      form.hidden = false;
      if (pronto) pronto.hidden = true;
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
    gated[i].setAttribute('aria-haspopup', 'dialog');
    gated[i].addEventListener('click', function (e) {
      e.preventDefault();
      abrir(this);
    });
  }

  var fechadores = modal.querySelectorAll('[data-lead-close]');
  for (var j = 0; j < fechadores.length; j++) {
    fechadores[j].addEventListener('click', fechar);
  }

  /* o último campo tocado antes de desistir (só o NOME do campo; o que a pessoa escreve não sai daqui) */
  form.addEventListener('focusin', function (e) {
    if (B.emit && e.target && e.target.name) B.emit('formulario', { fase: 'campo', campo: e.target.name });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    /* o único campo obrigatório é o tipo: validado aqui (o form tem novalidate) */
    if (campoTipo && !campoTipo.value) {
      if (erroTipo) erroTipo.hidden = false;
      campoTipo.setAttribute('aria-invalid', 'true');
      campoTipo.setAttribute('aria-describedby', 'leadTipoErro');   /* (só com o erro à mostra: fixo, o leitor de tela lia o erro escondido em todo foco) */
      campoTipo.focus();
      return;
    }
    /* "Outro" marcado e o campo vazio: o form tem novalidate, então o required do campo não valia nada (a
       mensagem saía sem o tipo) */
    var ehOutro = campoTipo && campoTipo.value === 'outro';
    if (ehOutro && campoTipoOutro && !campoTipoOutro.value.trim()) {
      campoTipoOutro.setAttribute('aria-invalid', 'true');
      campoTipoOutro.focus();
      return;
    }
    if (campoTipoOutro) campoTipoOutro.removeAttribute('aria-invalid');
    /* sem a pontuação do fim: o pagina.js fecha a frase com ponto (saía "..", "?.") */
    var semPonto = function (v) { return (v || '').trim().replace(/[\s.!?;:,]+$/, ''); };
    var nome = semPonto(campoNome && campoNome.value);
    var opcaoTipo = campoTipo && campoTipo.value ? campoTipo.selectedOptions[0] : null;
    var desafio = semPonto(campoDesafio && campoDesafio.value);

    /* js/pagina.js monta "Oi! Vim pelo site da Beyon Zero e " + assunto:
       o assunto SEMPRE começa com verbo. O tipo da lista vai com artigo ("para uma associação"); o digitado
       em "Outro" vai como a pessoa escreveu, sem artigo nem minúsculas (saía "um igreja", "oab") */
    var assunto = 'quero agendar um diagnóstico';
    if (ehOutro) assunto += '. Tipo de negócio: ' + semPonto(campoTipoOutro && campoTipoOutro.value);
    else if (opcaoTipo) assunto += ' para ' + (opcaoTipo.getAttribute('data-artigo') || 'um') + ' ' + opcaoTipo.textContent.toLowerCase();
    if (nome) assunto += '. Sou ' + nome;
    if (desafio) {
      assunto += '. O desafio que eu quero resolver: ' + desafio;
    }

    var link = B.linkWA(assunto);
    window.open(link, '_blank', 'noopener,noreferrer');
    if (B.emit) B.emit('contato', { origem: 'formulario' });   /* (js/medicao.js) */
    /* não fecha: com noopener não dá para saber se o WhatsApp abriu (navegador do Instagram/LinkedIn, computador
       sem WhatsApp Web). Fica a confirmação com o plano B */
    mostrarPronto(link, decodeURIComponent(link.split('text=')[1] || ''));
  });

  /* ---------- a confirmação, com o plano B ---------- */
  var pronto = null;
  function mostrarPronto(link, mensagem) {
    if (!pronto) {
      pronto = document.createElement('div');
      pronto.className = 'lead-modal__pronto';
      var ok = document.createElement('p'); ok.className = 'lead-modal__ok'; ok.setAttribute('role', 'status');
      ok.textContent = 'Abrimos o WhatsApp com a sua mensagem. É só enviar por lá.';
      var abrirDeNovo = document.createElement('a'); abrirDeNovo.className = 'btn btn--primary lead-modal__submit'; abrirDeNovo.target = '_blank'; abrirDeNovo.rel = 'noopener noreferrer';
      abrirDeNovo.textContent = 'Não abriu? Abrir de novo';
      var copiar = document.createElement('button'); copiar.type = 'button'; copiar.className = 'btn btn--ghost lead-modal__copiar';
      copiar.textContent = 'Copiar a mensagem';
      copiar.addEventListener('click', function () {
        var feito = function () { copiar.textContent = 'Mensagem copiada'; };
        var falhou = function () { copiar.textContent = 'Não deu para copiar: use o número abaixo'; };
        try { navigator.clipboard.writeText(pronto.mensagem).then(feito, falhou); } catch (e) { falhou(); }
      });
      var tel = document.createElement('p'); tel.className = 'fine lead-modal__fine';
      tel.textContent = 'Ou chame no WhatsApp (' + (window.BEYON_TEL || '').replace(/^55(\d{2})(\d{5})(\d{4})$/, '$1) $2-$3');
      pronto.appendChild(ok); pronto.appendChild(abrirDeNovo); pronto.appendChild(copiar); pronto.appendChild(tel);
      form.parentNode.insertBefore(pronto, form.nextSibling);
      pronto.abrir = abrirDeNovo; pronto.copiar = copiar;
    }
    pronto.mensagem = mensagem;
    pronto.abrir.href = link;
    pronto.copiar.textContent = 'Copiar a mensagem';
    form.hidden = true; pronto.hidden = false;
    pronto.abrir.focus();
  }
})();
