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
  var PREFIXOS = { '#retomar=': 'retomar', '#pedido=': 'abrir-pedido' };   /* os mesmos de js/ancoras.js (o 1º quadro): se mudar aqui, mude lá */
  var CODIGO = /^[A-Za-z0-9_-]{32}$/;
  var ESCONDE = 'orc-retomando';
  var $ = function (id) { return document.getElementById(id); };

  var prefixo = Object.keys(PREFIXOS).filter(function (p) { return (location.hash || '').indexOf(p) === 0; })[0] || null;
  var acao = prefixo ? PREFIXOS[prefixo] : null;
  var chegou = !!prefixo;
  var codigo = chegou ? location.hash.slice(prefixo.length) : null;
  if (chegou) {
    document.documentElement.classList.add(ESCONDE);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* navegador antigo: o código fica na barra até sair */ }
  }
  if (codigo && !CODIGO.test(codigo)) codigo = '';   /* (chegou pelo link, mas cortado ou alterado: avisa em vez de sumir) */

  var abriu = false, focado = false;   /* (o foco só é levado ao título depois de abrir o pedido por aqui, uma vez) */

  function falhar(mensagem, comRecado) {
    $('o-ret-estado').textContent = mensagem;
    $('o-ret-wa').hidden = !comRecado;
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
    /* a saída é o recado (o único lugar de feedback do site); o link vira o botão dele */
    var recado = $('o-ret-wa');
    recado.href = '#recado'; recado.removeAttribute('target'); recado.removeAttribute('data-wa'); recado.textContent = 'Deixar um recado';
    recado.addEventListener('click', function (ev) { ev.preventDefault(); if (window.BZOrcamento) window.BZOrcamento.abrirRecado({ quem: recado }).catch(function () {}); });
    salvo.addEventListener('click', function () { seguir(continuar); });

    /* sem como abrir por este link (cortado, usado, vencido): o pedido salvo neste aparelho, se houver, e o recado */
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

    if (!codigo) { semSaida('Este link chegou incompleto. Peça um novo deixando um recado para a equipe.'); return; }
    botao.addEventListener('click', async function () {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      botao.setAttribute('aria-disabled', 'true');
      falhar('Abrindo o seu pedido…', false);
      try {
        await window.BZOrcamento.retomar(codigo, acao);
      } catch (e) {
        botao.removeAttribute('aria-disabled');
        if (e && e.status === 410) { semSaida(e.message); return; }
        /* o recado acompanha o erro do servidor e o que a própria resposta pede (como no resto da página) */
        falhar(frase(e, mensagemDe), !!(e && (e.status >= 500 || (e.dados && e.dados.recado))));
        return;
      }
      seguir(continuar);
    });
    botao.focus({ preventScroll: true });
    aVista(botao);
  }

  window.BZRetomada = { pendente: function () { return codigo !== null; }, mostrar: mostrar, focar: focar };
})();
