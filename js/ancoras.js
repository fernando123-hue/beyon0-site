/* ==========================================================================
   ÂNCORAS ANTIGAS — roda no <head>, antes de qualquer coisa ser pintada.

   Até a reestruturação, a landing de IA morava em `/`. Links que já estão por
   aí — no WhatsApp, numa proposta, num QR code — apontam para `/#faq`,
   `/#servicos`, `/#contato`… Agora `/` é o Hub. Sem isto, o link abriria o Hub
   sem a seção que a pessoa foi buscar (ou, pior, com OUTRA seção de mesmo
   nome).

   Por que um arquivo só para isto, e no <head>:
   · a primeira versão vivia em js/pagina.js — um script `defer` no fim do
     body. O Hub era baixado, montado e às vezes pintado antes do salto: um
     clarão da página errada. Aqui ele roda antes do corpo existir;
   · a CSP é `script-src 'self'`, então não pode ser script inline;
   · a lista de âncoras vem do próprio <script>, em `data-ancoras`, porque o
     <body> ainda não existe neste ponto.

   `location.search` vai junto: um link de campanha (`?utm_source=…#faq`)
   perdia a atribuição no salto. `replace`, não `assign`: o endereço velho não
   fica no histórico para o botão de voltar cair nele de novo.
   Achados na terceira e na quinta revisão.
   ========================================================================== */
(function () {
  'use strict';
  var eu = document.currentScript;
  if (!eu || !location.hash) return;
  var ids = (eu.getAttribute('data-ancoras') || '').split(/\s+/);
  var destino = eu.getAttribute('data-destino');
  if (destino && ids.indexOf(location.hash.slice(1)) >= 0) {
    location.replace(destino + location.search + location.hash);
  }
})();
