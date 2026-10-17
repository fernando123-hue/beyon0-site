/* ==========================================================================
   ABRIR O PEDIDO PELO LINK DO AVISO (PR 2b-2). O link é <origem>/orcamento#retomar=<código>. O código fica no
   FRAGMENTO, que não vai ao servidor no carregamento, e sai da barra de endereço e da entrada atual do histórico logo
   aqui (replaceState): não aparece num print da tela nem num "copiar link". O histórico global do navegador pode ter
   guardado o endereço inteiro antes disso; o risco é baixo, porque o link vale uma vez e se gasta no toque. Só é usado
   depois de um toque da pessoa ("Abrir o meu pedido"), por dois motivos: a prévia do link no WhatsApp e os leitores
   de link não gastam o uso único, e quem abre entende que o pedido passa para este aparelho.
   Enquanto o link espera, a página de trás (etapas, preço vazio, conversa) fica escondida pela classe orc-retomando
   no <html> (css/orcamento.css): ela diria à pessoa que está no começo, e o pedido dela já existe. Quem põe a classe
   no 1º quadro é o js/ancoras.js (head, mesmo prefixo '#retomar=', e é ele que a tira no load se este script não vier);
   aqui ela é posta de novo (sem efeito, é idempotente) e tirada quando o pedido abre.
   Estado próprio, só três coisas: o código (some no primeiro uso), `abriu` e `focado` (o foco vai ao título uma vez).
   A página (js/orcamento.js) chama mostrar() e continua quando dá certo.
   ========================================================================== */
(function () {
  'use strict';
  var PREFIXO = '#retomar=';   /* o mesmo de js/ancoras.js (o 1º quadro): se mudar aqui, mude lá */
  var CODIGO = /^[A-Za-z0-9_-]{32}$/;
  var ESCONDE = 'orc-retomando';
  var TEL = window.BEYON_TEL || '5521977167944';   /* (reserva consciente, como em js/orcamento-detalhes.js: grep 5521977167944) */
  var $ = function (id) { return document.getElementById(id); };

  var chegou = (location.hash || '').indexOf(PREFIXO) === 0;
  var codigo = chegou ? location.hash.slice(PREFIXO.length) : null;
  if (chegou) {
    document.documentElement.classList.add(ESCONDE);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* navegador antigo: o código fica na barra até sair */ }
  }
  if (codigo && !CODIGO.test(codigo)) codigo = '';   /* (chegou pelo link, mas cortado ou alterado: avisa em vez de sumir) */

  var abriu = false, focado = false;   /* (o foco só é levado ao título depois de abrir o pedido por aqui, uma vez) */

  function whatsapp(texto) { return 'https://wa.me/' + String(TEL).replace(/\D/g, '') + '?text=' + encodeURIComponent(texto); }
  function falhar(mensagem, comWhatsApp) {
    $('o-ret-estado').textContent = mensagem;
    $('o-ret-wa').hidden = !comWhatsApp;
  }
  /* a frase da página (mensagemDe, de js/orcamento.js): nunca "Erro interno." cru. Só o anti-robô muda: a frase do
     servidor manda recarregar, e recarregar perderia o link, que já saiu da barra */
  function frase(e, mensagemDe) {
    if (e && e.status === 403) return 'Não foi possível confirmar que você não é um robô. Toque de novo em "Abrir o meu pedido".';
    return mensagemDe(e);
  }
  function focarTitulo(h) {
    if (!h || focado) return;
    focado = true;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  /* o pedido está neste aparelho (acabou de abrir, ou já estava salvo): a página de trás volta e a página segue.
     O foco vai para o título da etapa em que o pedido parou (focar(), chamado por retomar()) ou, se a página não
     chegou a uma etapa, para o título do topo */
  async function seguir(continuar) {
    codigo = null;
    abriu = true;
    $('o-retomada').hidden = true;
    document.documentElement.classList.remove(ESCONDE);
    await continuar();
    var ativo = document.activeElement;
    if (!focado && (!ativo || ativo === document.body)) focarTitulo($('orc-titulo'));
  }

  /* chamada por retomar() quando a página rola até a etapa em que o pedido parou */
  function focar(bloco) { if (abriu && bloco) focarTitulo(bloco.querySelector('h2')); }

  /* ajuda = { mensagemDe, rolarAte } de js/orcamento.js: a frase de erro da página e a rolagem que espera a passagem */
  function mostrar(continuar, ajuda) {
    var bloco = $('o-retomada'), botao = $('o-ret-abrir'), salvo = $('o-ret-salvo');
    var mensagemDe = ajuda.mensagemDe;
    bloco.hidden = false;
    $('o-ret-wa').href = whatsapp('Oi! O link do meu pedido não abriu. Pode me mandar um novo?');
    salvo.addEventListener('click', function () { seguir(continuar); });

    /* sem como abrir por este link (cortado, usado, vencido): o pedido salvo neste aparelho, se houver, e o WhatsApp */
    function semSaida(mensagem) {
      botao.hidden = true;
      falhar(mensagem, true);
      var temPedido = !!(window.BZOrcamento && window.BZOrcamento.temSessao());
      salvo.hidden = !temPedido;
      (temPedido ? salvo : $('o-ret-wa')).focus({ preventScroll: true });
      aVista(temPedido ? salvo : $('o-ret-wa'));
    }
    /* celular baixo: o botão (ou o último da fila) fica abaixo da dobra? rola até a seção, esperando a passagem como as outras etapas */
    function aVista(botaoDeBaixo) { if (botaoDeBaixo.getBoundingClientRect().bottom > window.innerHeight) ajuda.rolarAte(bloco); }

    if (!codigo) { semSaida('Este link chegou incompleto. Peça um novo à Beyon Zero pelo WhatsApp.'); return; }
    botao.addEventListener('click', async function () {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      botao.setAttribute('aria-disabled', 'true');
      falhar('Abrindo o seu pedido…', false);
      try {
        await window.BZOrcamento.retomar(codigo);
      } catch (e) {
        botao.removeAttribute('aria-disabled');
        if (e && e.status === 410) { semSaida(e.message); return; }
        /* o WhatsApp acompanha o erro do servidor e o que a própria resposta pede (como no resto da página) */
        falhar(frase(e, mensagemDe), !!(e && (e.status >= 500 || (e.dados && e.dados.whatsapp))));
        return;
      }
      seguir(continuar);
    });
    botao.focus({ preventScroll: true });
    aVista(botao);
  }

  window.BZRetomada = { pendente: function () { return codigo !== null; }, mostrar: mostrar, focar: focar };
})();
