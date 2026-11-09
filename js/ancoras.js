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

   3. Link do aviso do pedido (`/orcamento#retomar=<código>`) ou o link do pedido (`/orcamento#pedido=<código>`, PR 3b-2): a página de trás (etapas, preço vazio, conversa) já nasce
      escondida, no 1º quadro. Quem esconde é a classe `orc-retomando` (css/orcamento.css); o js/orcamento-retomada.js
      é um dos últimos scripts `defer` e, num celular lento, a 1ª pintura aparecia antes dele, com "01 Perguntas" e o
      cartão vazio, e depois tudo pulava. Só vale com esse hash: nas outras páginas e links nada muda.

   4. O ouro entre páginas: com o reinado em curso (bz-ouro-ate na sessão), a página nasce em `html.is-ouro`.

   5. O orçamento numa visita nova (`<script ... data-orcamento>`): as perguntas já na 1ª pintura (`html.orc-nova`).

   A CSP é `script-src 'self'`: por isso é um arquivo, não um script inline.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var eu = document.currentScript;   /* (lido já: só existe enquanto este script roda) */
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
  var retomando = /^#(retomar|pedido)=/.test(location.hash);
  if (retomando) {
    html.classList.add('orc-retomando');
    /* rede: se o js/orcamento-retomada.js nunca chegar (rede, bloqueio), a classe sai no load; sem isso a página
       ficaria só com o título, porque o bloco "Abrir o seu pedido" nasce hidden e só ele o script mostra */
    window.addEventListener('load', function () { if (!window.BZRetomada) html.classList.remove('orc-retomando'); });
  }
  /* (5) o orçamento numa visita NOVA: as perguntas já na 1ª pintura (html.orc-nova, css/orcamento.css). Elas nascem hidden e só o
     js/orcamento.js (o último dos scripts defer) as abria: num celular lento a 1ª pintura vinha antes e a mesa pulava para baixo (CLS 0,36
     medido em 390 px). Nova = sem o link da retomada e sem pedido salvo, lido como o js/orcamento-api.js lê (a mesma chave e a conversa
     esquecida: se mudar lá, mude aqui). Com pedido salvo nada muda: quem decide é o render. O js/orcamento.js tira a classe ao assumir;
     a rede: se ele não abriu as perguntas até o load (não carregou), ela sai e o hidden volta a valer. Sem JS, o HTML segue como é */
  if (eu && eu.hasAttribute('data-orcamento') && !retomando && !temPedidoSalvo()) {
    html.classList.add('orc-nova');
    window.addEventListener('load', function () {
      var p = document.getElementById('o-perguntas');
      if (!p || p.hidden) html.classList.remove('orc-nova');
    });
  }
  function temPedidoSalvo() {
    var s = null, esquecida = null;
    try { s = JSON.parse(localStorage.getItem('bz-orcamento') || 'null'); esquecida = localStorage.getItem('bz-orcamento-esquecida'); } catch (e) { return false; }
    return !!(s && s.conversa_id) && s.conversa_id !== esquecida;
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

  /* (4) O OURO ENTRE PÁGINAS (js/ouro.js; docs/restructure/OURO-2026-10-06.md, "Entre páginas"): o reinado guarda na
     sessão o instante em que acaba (bz-ouro-ate, Date.now()). Com prazo válido e movimento, a página já nasce em ouro,
     ANTES do 1º quadro: sem isso ela abria ciano e o ouro "sumia" na troca de página. O js/ouro.js retoma o reinado com
     o tempo que falta e resfria aqui se o prazo vencer aqui. Página sem o ouro.js (privacidade, condições, 404, que não
     têm movimento): o ouro sai em silêncio no prazo, pela transição da troca (is-ouro-fim), sem linhas.
     Vencido ou malformado: sai da sessão. O mesmo teto e a mesma leitura de js/ouro.js (TETO_MS, lerPrazo; o teste
     docs/testes/ouro-entre-paginas.test.mjs prende os dois juntos) */
  var OURO_TETO_MS = 35000, ouroFimTimer = 0;
  var ouroPode = !html.classList.contains('menos-movimento') && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function ouroResta() {
    try {
      var v = sessionStorage.getItem('bz-ouro-ate');
      if (v === null) return 0;
      var resta = +v - Date.now();
      if (resta > 0 && resta <= OURO_TETO_MS) return resta;
      sessionStorage.removeItem('bz-ouro-ate');
      /* VENCIDO (o reinado acabou com a aba oculta e o laço parado, ninguém anotou o fim): o fim é o próprio prazo,
         senão o intervalo mínimo se perdia. Malformado não vira fim */
      if (resta <= 0 && +v > 0 && !(+sessionStorage.getItem('bz-ouro-fim') >= +v)) sessionStorage.setItem('bz-ouro-fim', String(+v));
    } catch (e) { /* sem armazenamento: cada página começa ciano */ }
    return 0;
  }
  /* sai pela transição da troca; `noPrazo`: foi aqui que o reinado acabou, então o fim fica anotado (o intervalo
     mínimo vale entre páginas). Saindo porque acabou em outra página, o fim de lá é que vale */
  function ouroSai(noPrazo) {
    html.classList.add('is-ouro-fim');
    html.classList.remove('is-ouro');
    /* uma página com o core.js e sem o ouro.js nasceria com B.ouro.k = 1 e ficaria com os canvases dourados */
    var B = window.BEYON;
    if (B && B.ouro) { B.ouro.k = 0; B.ouro.h = 0; }
    setTimeout(function () { html.classList.remove('is-ouro-fim'); }, 900);
    if (noPrazo) try { sessionStorage.removeItem('bz-ouro-ate'); sessionStorage.setItem('bz-ouro-fim', String(Date.now())); } catch (e) { /* sem armazenamento */ }
  }
  /* página sem o ouro.js: o relógio dela é a sessão (no load e ao voltar pelo histórico, com o timer velho descartado) */
  function ouroSincroniza() {
    clearTimeout(ouroFimTimer);
    var resta = ouroResta();
    if (resta > 0) { html.classList.add('is-ouro'); ouroFimTimer = setTimeout(function () { ouroSai(true); }, resta); }
    else if (html.classList.contains('is-ouro')) ouroSai(false);
  }
  if (ouroResta() > 0 && ouroPode) html.classList.add('is-ouro');
  if (ouroPode) {
    window.addEventListener('load', function () {
      var B = window.BEYON;
      if (B && B.ouro && B.ouro.dono) return;   /* o js/ouro.js comanda esta página */
      ouroSincroniza();
      window.addEventListener('pageshow', function (e) { if (e.persisted) ouroSincroniza(); });
    });
  }

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

  if (!eu || !location.hash) return;
  var ids = (eu.getAttribute('data-ancoras') || '').split(/\s+/);
  var destino = eu.getAttribute('data-destino');
  if (destino && ids.indexOf(location.hash.slice(1)) >= 0) {
    location.replace(destino + location.search + location.hash);
  }
})();
