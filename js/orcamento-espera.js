/* ==========================================================================
   A ESPERA DO ORÇAMENTO (saiu de js/orcamento.js no PR 2a, para o arquivo ficar abaixo de 800 linhas).
   Acompanha o que acontece fora desta aba: a direção feita por outro pedido, o aviso do pagamento ou o dono
   entregando as direções. Aos 15 min ela desiste (F12): para o relógio dos cartões e AVISA, com
   "Conferir agora" e o recado; volta a esperar quando a pessoa confere ou volta para a aba. Sem estado da
   conversa próprio: recebe da página como ler e redesenhar.
   ========================================================================== */
(function () {
  'use strict';
  var ESPERA_MS = 5000, ESPERA_MAX_MS = 15 * 60e3;

  /* p = { recarregar, estado, emVoo, temSessao, relogioDosCartoes, avisar, falhou, sessaoTerminou, avisarSessao } */
  function criar(p) {
    var relogio = null, desistiu = false;
    function esperar() {
      if (relogio || desistiu) return;
      var inicio = Date.now();
      relogio = setInterval(async function () {
        if (document.hidden || p.emVoo()) return;
        if (Date.now() - inicio > ESPERA_MAX_MS) { desistir(); return; }
        try {
          await p.recarregar();
          var E = p.estado();
          if (E.conversa.etapa !== 'gerando' && E.conversa.etapa !== 'aguardando_pagamento') parar();
        } catch (e) { if (p.sessaoTerminou(e)) p.avisarSessao(); /* senão, tenta na próxima */ }
      }, ESPERA_MS);
    }
    function parar() { clearInterval(relogio); relogio = null; }
    async function desistir() {
      parar();
      desistiu = true;
      p.relogioDosCartoes(false);
      try { await p.recarregar(); } catch (e) { /* o aviso abaixo oferece conferir de novo */ }   /* (uma última olhada) */
      var E = p.estado();
      if (E && E.conversa.etapa === 'gerando') p.avisar('Está demorando mais que o normal. Confira de novo daqui a pouco ou deixe um recado para a equipe.', conferir, 'Conferir agora');
    }
    function conferir() { desistiu = false; p.recarregar().catch(function (e) { p.falhou(e, conferir); }); }
    /* voltou para a aba (do WhatsApp, do pagamento): olha de novo e retoma a espera se ainda for o caso. (PR 2a) Com o
       pedido esperando a confirmação, o dono pode ter confirmado enquanto a pessoa estava no WhatsApp */
    document.addEventListener('visibilitychange', function () {
      var E = p.estado();
      if (document.hidden || !E || !p.temSessao()) return;
      desistiu = false;
      /* (3b-3c) em produção, quem volta com o aviso vê a prévia nova sem recarregar: uma leitura ao voltar, sem relógio */
      if (E.conversa.etapa === 'gerando' || E.conversa.etapa === 'aguardando_pagamento' || E.conversa.etapa === 'em_producao') p.recarregar().catch(function () {});
    });
    return { esperar: esperar, parar: parar, desistiu: function () { return desistiu; } };
  }

  window.BZEspera = { criar: criar };
})();
