/* ==========================================================================
   DESISTIR DA COMPRA (20/11, dono): até 7 dias depois de aceitar as condições a entrada volta, pelo mesmo Pix (CDC art. 49; /condicoes).
   Regra de design do dono: "o reembolso não é algo que deva ser facilitado, meio que mostrado assim. Não queremos induzir o cliente a pedir reembolso". Por isso:
   • na tela do pedido existe SÓ um link de texto pequeno, "Preciso desistir da compra", embaixo de tudo, sem destaque; as palavras reembolso e devolução não
     aparecem fora do painel aberto, e o botão que devolve a entrada NEM EXISTE na página até a pessoa tocar no link (o painel é criado ao abrir);
   • o link só existe quando o SERVIDOR diz (entrega.pode_desistir === true: dentro dos 7 dias, restante em aberto, site fora do ar); a tela nunca calcula prazo;
   • o painel é calmo e honesto: o que acontece, "Confirmar desistência e devolver a entrada" e "Voltar". Sem culpa, sem insistência, sem oferta para ficar;
   • só o clique no segundo botão chama o servidor (uma vez, mesmo com toques repetidos); o valor, a order e o prazo nunca saem daqui.
   • o pedido desistido mostra "Pedido cancelado" no lugar do "encerrado" de sempre.
   Tudo por textContent. Global: BZDesistencia.
   ========================================================================== */
(function (window) {
  'use strict';
  var TEXTO_LINK = 'Preciso desistir da compra';
  var TITULO = 'Desistir da compra';
  var EXPLICA = 'Se você desistir agora, a sua entrada volta pelo mesmo Pix e o pedido é cancelado. O material que você enviou é apagado em até um dia e o site não vai ao ar.';
  var NOTA = 'O prazo para o dinheiro chegar depende do seu banco. Isto não pode ser desfeito.';
  var CONFIRMAR = 'Confirmar desistência e devolver a entrada';
  var VOLTAR = 'Voltar';
  var CANCELADO = 'Pedido cancelado. A entrada volta pelo Pix; o prazo depende do seu banco.';
  var CANCELADO_FIM = 'A entrada volta pelo Pix; o prazo depende do seu banco. O material que você enviou é apagado em até um dia.';
  var TITULO_ENCERRADO = 'Este pedido foi encerrado';
  var RESERVA = 'Não foi possível agora. Nada foi alterado no seu pedido. Tente de novo em alguns minutos ou deixe um recado para a equipe.';
  var $ = function (id) { return document.getElementById(id); };

  /* o servidor manda; a tela só obedece (e só com o booleano verdadeiro, nunca "truthy") */
  function visivel(E) {
    var e = E && E.entrega;
    return !!e && !!E.conversa && E.conversa.etapa === 'em_producao' && E.entrega_ligada !== false && e.pode_desistir === true && !e.bloqueada;
  }

  function no(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto != null) el.textContent = texto;
    return el;
  }

  function criar(o) {
    var API = o.API, aoCancelar = o.aoCancelar || function () { return Promise.resolve(); };
    var link = null, painel = null, ocupado = false, titulo = null, erro = null, confirmar = null, voltar = null, recebido = false;   /* recebido: o servidor já tem o pedido ("estamos confirmando"); a frase fica na tela */

    function fechar(devolverFoco) {
      if (painel) { painel.remove(); painel = null; titulo = erro = confirmar = voltar = null; }
      if (link) { link.setAttribute('aria-expanded', 'false'); link.removeAttribute('aria-controls'); }
      if (devolverFoco && link) link.focus();
    }
    function limpar() {
      fechar(false);
      if (link) { link.remove(); link = null; }
      var raiz = $('o-desiste');
      if (raiz) raiz.hidden = true;
    }
    function dizerErro(e) {
      erro.textContent = '';
      var frase = e && typeof e.message === 'string' && e.message.length > 10 && !/^(Failed|TypeError|NetworkError|Load failed)/.test(e.message) ? e.message : RESERVA;
      erro.appendChild(no('span', '', frase));
      if (e && e.dados && e.dados.recado === true) {
        erro.appendChild(no('span', '', ' '));
        var a = no('a', '', 'Deixar um recado');
        a.setAttribute('href', '#recado'); a.setAttribute('data-recado-abrir', ''); a.setAttribute('data-recado-origem', 'orcamento');
        erro.appendChild(a);
      }
    }
    async function confirmarDesistencia() {
      if (ocupado) return;
      ocupado = true;
      confirmar.disabled = true; voltar.disabled = true; painel.setAttribute('aria-busy', 'true'); erro.textContent = '';
      var r = null, falhou = null;
      try { r = await API.desistir(); } catch (e) { falhou = e; }
      ocupado = false;
      if (!painel) return;
      painel.removeAttribute('aria-busy');
      if (falhou) { confirmar.disabled = false; voltar.disabled = false; dizerErro(falhou); confirmar.focus(); return; }
      var frase = r && r.aguardando && typeof r.mensagem === 'string' ? r.mensagem : CANCELADO;
      painel.textContent = '';
      painel.appendChild(no('p', 'orc-desiste__texto', frase));
      if (r && r.aguardando) { recebido = true; return; }   /* (o pedido ainda não fechou: a frase fica; a próxima abertura da página mostra o fim) */
      try { await aoCancelar(); } catch (e) { /* a próxima leitura do pedido mostra o fim */ }
    }
    function abrir() {
      if (painel) return;
      painel = no('section', 'orc-desiste__painel');
      painel.setAttribute('role', 'group'); painel.setAttribute('aria-labelledby', 'o-desiste-titulo');
      titulo = no('h3', 'orc-desiste__titulo', TITULO); titulo.id = 'o-desiste-titulo'; titulo.setAttribute('tabindex', '-1');
      confirmar = no('button', 'btn btn--primary', CONFIRMAR); confirmar.setAttribute('type', 'button'); confirmar.id = 'o-desiste-confirmar';
      voltar = no('button', 'btn btn--ghost', VOLTAR); voltar.setAttribute('type', 'button'); voltar.id = 'o-desiste-voltar';
      erro = no('p', 'orc-erro', ''); erro.id = 'o-desiste-erro'; erro.setAttribute('role', 'alert');
      var acoes = no('div', 'orc-desiste__acoes');
      acoes.appendChild(confirmar); acoes.appendChild(voltar);
      [titulo, no('p', 'orc-desiste__texto', EXPLICA), no('p', 'orc-desiste__nota', NOTA), acoes, erro].forEach(function (x) { painel.appendChild(x); });
      confirmar.addEventListener('click', confirmarDesistencia);
      voltar.addEventListener('click', function () { if (!ocupado) fechar(true); });
      $('o-desiste').appendChild(painel);
      link.setAttribute('aria-expanded', 'true'); link.setAttribute('aria-controls', 'o-desiste-titulo');
      titulo.focus();
    }
    function mostrarLink() {
      var raiz = $('o-desiste');
      if (!raiz) return;
      if (!link) {
        link = no('button', 'orc-desiste__abrir', TEXTO_LINK);
        link.setAttribute('type', 'button'); link.setAttribute('aria-expanded', 'false');
        link.addEventListener('click', function () { if (ocupado) return; if (painel) fechar(true); else abrir(); });
        raiz.insertBefore(link, raiz.children[0] || null);
      }
      raiz.hidden = false;
    }
    /* o pedido encerrado por desistência: "Pedido cancelado" no lugar do "encerrado" de sempre */
    function fimDoPedido(E) {
      var t = $('o-fim-encerrado-titulo'), lead = $('o-fim-desistiu');
      var desistiu = !!(E && E.entrega && E.entrega.desistiu === true && E.conversa && E.conversa.etapa === 'encerrada');
      if (t) t.textContent = desistiu ? 'Pedido cancelado' : TITULO_ENCERRADO;
      if (lead) { lead.textContent = desistiu ? CANCELADO_FIM : ''; lead.hidden = !desistiu; }
    }
    function atualizar(E) {
      fimDoPedido(E);
      if (ocupado || (recebido && !(E && E.conversa && E.conversa.etapa === 'encerrada'))) return;   /* (o servidor está trabalhando, ou já recebeu o pedido: a leitura não mexe no painel; só o pedido encerrado o tira) */
      if (visivel(E)) { mostrarLink(); return; }
      limpar();
    }
    return { atualizar: atualizar };
  }

  window.BZDesistencia = { criar: criar, visivel: visivel, TEXTO_LINK: TEXTO_LINK };
})(window);
