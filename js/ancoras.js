/* ==========================================================================
   CABEÇA — roda no <head>, antes de qualquer coisa ser pintada. Duas tarefas:

   1. `html.js`: o contrato de revelação (css/motion.css). Só com esta classe
      o conteúdo nasce escondido para o GSAP revelar. Sem JS, tudo é visível
      desde o HTML — e js/pagina.js retira a classe se o GSAP não vier.
      Também restaura o interruptor "menos movimento" do rodapé antes do
      primeiro quadro, para não piscar.

   2. Âncoras antigas: a landing de IA morava em `/`. Links já distribuídos
      (`/#faq`, `/#servicos`…) seguem para a página de automação, com a query
      de campanha preservada e `replace` (sem sujar o histórico). A lista de
      âncoras vem de `data-ancoras` no próprio <script>; o destino, de
      `data-destino` — nunca da URL (sem open redirect).

   A CSP é `script-src 'self'`: por isso é um arquivo, não um script inline.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  html.classList.add('js');
  /* `tem-menu` também ANTES de pintar: sem ela o menu do celular nasce no
     fluxo (links em linha, ~213 px) e, quando o js/pagina.js (defer) a
     ligava, o hero subia — salto de layout de 0,253 em toda carga no
     celular (medido; já existia na V4.9). Rede: se o pagina.js não montar o
     menu até o load, a classe sai e os links voltam a aparecer em linha. */
  html.classList.add('tem-menu');
  window.addEventListener('load', function () {
    var botao = document.querySelector('.nav__toggle');
    if (!botao || botao.hidden) html.classList.remove('tem-menu');
  });
  try {
    if (localStorage.getItem('bz-menos-movimento') === '1') html.classList.add('menos-movimento');
  } catch (e) { /* armazenamento bloqueado: segue o padrão do sistema */ }

  var eu = document.currentScript;
  if (!eu || !location.hash) return;
  var ids = (eu.getAttribute('data-ancoras') || '').split(/\s+/);
  var destino = eu.getAttribute('data-destino');
  if (destino && ids.indexOf(location.hash.slice(1)) >= 0) {
    location.replace(destino + location.search + location.hash);
  }
})();
