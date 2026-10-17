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

   3. Link do aviso do pedido (`/orcamento#retomar=<código>`): a página de trás (etapas, preço vazio, conversa) já nasce
      escondida, no 1º quadro. Quem esconde é a classe `orc-retomando` (css/orcamento.css); o js/orcamento-retomada.js
      é um dos últimos scripts `defer` e, num celular lento, a 1ª pintura aparecia antes dele, com "01 Perguntas" e o
      cartão vazio, e depois tudo pulava. Só vale com esse hash: nas outras páginas e links nada muda.

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
  /* (3) o mesmo prefixo de js/orcamento-retomada.js (PREFIXO): se mudar lá, mude aqui */
  var retomando = location.hash.indexOf('#retomar=') === 0;
  if (retomando) {
    html.classList.add('orc-retomando');
    /* rede: se o js/orcamento-retomada.js nunca chegar (rede, bloqueio), a classe sai no load; sem isso a página
       ficaria só com o título, porque o bloco "Abrir o seu pedido" nasce hidden e só ele o script mostra */
    window.addEventListener('load', function () { if (!window.BZRetomada) html.classList.remove('orc-retomando'); });
  }
  try {
    if (localStorage.getItem('bz-menos-movimento') === '1') html.classList.add('menos-movimento');
  } catch (e) { /* armazenamento bloqueado: segue o padrão do sistema */ }
  /* a passagem (js/passagem.js): chegou por um link do site há pouco? a
     página nasce coberta pelo painel, que abre já no primeiro quadro (CSS) */
  try {
    var saiu = +sessionStorage.getItem('bz-passagem');
    sessionStorage.removeItem('bz-passagem');
    if (saiu && Date.now() - saiu < 5000 && !html.classList.contains('menos-movimento') &&
        !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      /* passagem-espera: a chegada fica parada no 1º quadro até a página conseguir desenhar (js/passagem.js solta);
         sem isso, os primeiros quadros caíam enquanto a página carregava e o voo começava aos pulos. A rede: se o
         passagem.js não soltar, solta sozinha */
      html.classList.add('passagem-chega', 'passagem-espera');
      setTimeout(function () { html.classList.remove('passagem-espera'); }, 1500);
      /* a cara da chegada é a desta página (css/passagem-destinos.css; o mesmo mapa do js/passagem.js) */
      var aqui = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1') || '/';
      var chegadas = { '/': 'inicio', '/sites': 'sites', '/automacao': 'automacao', '/orcamento': 'orcamento' };
      if (Object.prototype.hasOwnProperty.call(chegadas, aqui)) html.classList.add('chega-' + chegadas[aqui]);
      if (location.hash && !retomando) html.classList.add('passagem-ancora');   /* nasce rolada até a âncora: só aparece, sem escala */
    }
  } catch (e) { /* sem armazenamento: chega sem painel */ }

  /* veio de ANÚNCIO? (gclid/gbraid/wbraid do Google Ads, ou utm_medium pago). Vale para a visita inteira
     (sessionStorage): html.via-anuncio tira as distrações (js/ouro.js, css) e a mensagem do WhatsApp diz
     "Vi o anúncio" (js/pagina.js), o que mostra a origem na própria conversa; o js/medicao.js manda junto */
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('gclid') || q.get('gbraid') || q.get('wbraid') || /^(cpc|ppc|paid|pago|anuncio)$/i.test(q.get('utm_medium') || '')) {
      sessionStorage.setItem('bz-origem', JSON.stringify({ via: 'anuncio' }));   /* (só o fato; campanha e termo o Google Ads já sabe) */
    }
    var origem = JSON.parse(sessionStorage.getItem('bz-origem') || 'null');
    if (origem && origem.via === 'anuncio') html.classList.add('via-anuncio');
  } catch (e) { /* sem armazenamento ou URL estranha: segue como visita comum */ }

  var eu = document.currentScript;
  if (!eu || !location.hash) return;
  var ids = (eu.getAttribute('data-ancoras') || '').split(/\s+/);
  var destino = eu.getAttribute('data-destino');
  if (destino && ids.indexOf(location.hash.slice(1)) >= 0) {
    location.replace(destino + location.search + location.hash);
  }
})();
