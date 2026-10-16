/* ==========================================================================
   ABRIR O PEDIDO PELO LINK DO AVISO (PR 2b-2). O link é <origem>/orcamento#retomar=<código>. O código fica no
   FRAGMENTO, que não vai ao servidor no carregamento, e sai da barra de endereço logo aqui: não fica no histórico,
   num print nem num "copiar link". Só é usado depois de um toque da pessoa ("Abrir o meu pedido"), por dois motivos:
   a prévia do link no WhatsApp e os leitores de link não gastam o uso único, e quem abre entende que o pedido passa
   para este aparelho. Sem estado próprio: a página (js/orcamento.js) chama mostrar() e continua quando dá certo.
   ========================================================================== */
(function () {
  'use strict';
  var PREFIXO = '#retomar=';
  var CODIGO = /^[A-Za-z0-9_-]{32}$/;
  var TEL = window.BEYON_TEL || '5521977167944';   /* (reserva consciente, como em js/orcamento-detalhes.js: grep 5521977167944) */
  var $ = function (id) { return document.getElementById(id); };

  var chegou = (location.hash || '').indexOf(PREFIXO) === 0;
  var codigo = chegou ? location.hash.slice(PREFIXO.length) : null;
  if (chegou) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* navegador antigo: o código fica na barra até sair */ } }
  if (codigo && !CODIGO.test(codigo)) codigo = '';   /* (chegou pelo link, mas cortado ou alterado: avisa em vez de sumir) */

  function whatsapp(texto) { return 'https://wa.me/' + String(TEL).replace(/\D/g, '') + '?text=' + encodeURIComponent(texto); }
  function falhar(mensagem, comWhatsApp) {
    $('o-ret-estado').textContent = mensagem;
    $('o-ret-wa').hidden = !comWhatsApp;
  }

  function mostrar(continuar) {
    var bloco = $('o-retomada'), botao = $('o-ret-abrir');
    bloco.hidden = false;
    $('o-ret-wa').href = whatsapp('Oi! O link do meu pedido não abriu. Pode me mandar um novo?');
    if (!codigo) { botao.hidden = true; falhar('Este link chegou incompleto. Peça um novo à Beyon Zero pelo WhatsApp.', true); return; }
    botao.addEventListener('click', async function () {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      botao.setAttribute('aria-disabled', 'true');
      falhar('Abrindo o seu pedido…', false);
      try {
        await window.BZOrcamento.retomar(codigo);
        codigo = null;
        bloco.hidden = true;
        continuar();
      } catch (e) {
        botao.removeAttribute('aria-disabled');
        var d = (e && e.dados) || {};
        if (e && e.status === 410) { botao.hidden = true; falhar(e.message, true); return; }
        falhar(e && e.message ? e.message : 'Não deu para abrir agora. Tente de novo.', !!d.whatsapp);
      }
    });
    botao.focus({ preventScroll: true });
  }

  window.BZRetomada = { pendente: function () { return codigo !== null; }, mostrar: mostrar };
})();
