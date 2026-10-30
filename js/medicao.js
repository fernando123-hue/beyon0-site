/* ==========================================================================
   MEDIÇÃO — Google Analytics 4 e Google Ads (2026-10-06; docs/google-ads/).
   Pedido do dono: "a ideia é fazer com que as pessoas achem o site sozinhas;
   devo explorar o Google Ads; prepare o ambiente". Este arquivo é o ambiente.

   ENQUANTO OS IDS ABAIXO ESTIVEREM VAZIOS, NADA ACONTECE: nenhum script do
   Google carrega, nenhum aviso de cookies aparece. Para ligar, preencher em
   CONFIG (o passo a passo está em docs/google-ads/README.md):
     ga4      'G-XXXXXXXXXX'  (GA4 › Administrador › Fluxos de dados)
     ads      'AW-XXXXXXXXX'  (Google Ads › Metas › Conversões › tag)
     adsRotuloContato  o rótulo da conversão "Contato" (recado; a parte
                       depois da barra em 'AW-XXXXXXXXX/abcDEF123')
   A CSP (vercel.json e o <meta> de cada página) já libera os domínios do
   Google necessários.

   Consentimento (LGPD), modo BÁSICO: o Google só carrega depois de a pessoa
   aceitar; quem recusa navega sem nenhum script de terceiro. A escolha fica
   no aparelho (localStorage) e pode ser revista pelo link "Cookies" do rodapé.
   Aceitar e Recusar têm o mesmo peso visual (sem empurrar o "sim").

   O que é medido: a conversão de contato é o CLIQUE EM "DEIXAR UM RECADO" (todo
   [data-recado-abrir]; o site não tem WhatsApp da Beyon, Decisões 28/10). Cada clique leva de qual botão veio e se a visita veio de
   anúncio (js/ancoras.js marca html.via-anuncio a partir do gclid/utm). Os
   dados da conversa (o que a pessoa escreve) nunca passam por aqui.

   O caminho principal (2026-10-09): o clique em "Monte seu orçamento" (todo
   link para /orcamento) vira o evento 'orcamento_iniciar' no GA4, com o
   botão de origem. Não é conversão do Ads nem conta como contato: a pessoa
   ainda não falou com ninguém.

   Na página do orçamento o script entra com data-sem-google: ali há
   pagamento (Mercado Pago) e a CSP não libera o Google, de propósito. Ele só
   decide o que é contato e avisa as métricas próprias (js/metricas.js); o
   Google e o aviso de cookies não existem nessa página.
   ========================================================================== */
(function () {
  'use strict';
  var CONFIG = {
    ga4: '',
    ads: '',
    adsRotuloContato: ''
  };
  var B = window.BEYON || {};
  var html = document.documentElement;
  var eu = document.currentScript;
  /* fechado por padrão: sem o próprio <script> (módulo, injetado, empacotado) ou na página do orçamento, sem Google */
  var SEM_GOOGLE = !eu || eu.hasAttribute('data-sem-google') || /^\/orcamento/.test(location.pathname);
  var ATIVO = !SEM_GOOGLE && !!(CONFIG.ga4 || CONFIG.ads), CHAVE = 'bz-consentimento';
  var carregado = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  function escolha() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(CHAVE, v); } catch (e) { /* sem armazenamento: vale só nesta página */ } }
  function viaAnuncio() { return html.classList.contains('via-anuncio'); }

  /* ---------- o Google, só depois do sim ---------- */
  function carregar() {
    if (carregado || !ATIVO || escolha() !== 'sim') return;   /* (recusou na janela antes do ocioso: não carrega) */
    carregado = true;
    gtag('js', new Date());
    if (CONFIG.ga4) gtag('config', CONFIG.ga4);
    if (CONFIG.ads) gtag('config', CONFIG.ads);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CONFIG.ga4 || CONFIG.ads);
    document.head.appendChild(s);
  }
  /* depois do load e com o navegador ocioso: o Google nunca disputa a 1ª pintura nem o boot do hero */
  function quandoOcioso(fn) {
    var ir = function () { (window.requestIdleCallback || function (f) { return setTimeout(f, 1200); })(fn, { timeout: 3000 }); };
    if (document.readyState === 'complete') ir(); else window.addEventListener('load', ir, { once: true });
  }

  /* ---------- a conversão ---------- */
  /* de onde veio o clique: a seção, a barra do celular, o ícone, o menu (ou o data-origem de quem não tem id) */
  function botao(a) { return limpo(origemDe(a)); }
  /* o mesmo filtro do js/metricas.js: só [a-z0-9-], até 30 caracteres (o valor vai para o Google como veio) */
  function limpo(v) { return String(v || 'pagina').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'pagina'; }
  function origemDe(a) {
    var marcado = a.closest('[data-origem]');
    if (marcado) return marcado.getAttribute('data-origem');
    if (a.closest('.barra')) return 'barra';
    if (a.closest('.nav')) return 'menu';
    if (a.closest('.footer')) return 'rodape';
    var sec = a.closest('section[id], header[id]');
    return sec ? sec.id : 'pagina';
  }
  function registrar(origem) {
    var dados = { origem_botao: origem, pagina: location.pathname || '/', via: viaAnuncio() ? 'anuncio' : 'site' };
    if (B.emit) B.emit('medicao:contato', dados);   /* (para os testes; nada sai do aparelho sem o sim) */
    /* (js/metricas.js ouve este: funciona até na página Resumo, que não tem o BEYON) */
    try { document.dispatchEvent(new CustomEvent('bz:contato', { detail: dados })); } catch (e) { /* navegador muito antigo */ }
    if (!ATIVO || escolha() !== 'sim') return;
    carregar();   /* (clique antes do ocioso: carrega agora; o gtag.js processa a fila na ordem: js, config, evento) */
    /* beacon: a janela do recado abre na própria página, mas quem sai logo depois não pode perder o evento */
    if (CONFIG.ga4) gtag('event', 'contato_recado', Object.assign({ transport_type: 'beacon' }, dados));
    if (CONFIG.ads && CONFIG.adsRotuloContato) gtag('event', 'conversion', { send_to: CONFIG.ads + '/' + CONFIG.adsRotuloContato, transport_type: 'beacon' });
  }
  /* só o botão que ABRE O RECADO conta como contato (o único canal do site). O link para /orcamento tem o seu próprio evento, abaixo */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('[data-recado-abrir]') : null;
    if (a) registrar(botao(a));
  }, true);
  if (B.on) B.on('contato', function (d) { registrar((d && d.origem) || 'formulario'); });

  /* ---------- o caminho principal: começar o orçamento ---------- */
  function iniciarOrcamento(origem) {
    var dados = { origem_botao: origem, pagina: location.pathname || '/', via: viaAnuncio() ? 'anuncio' : 'site' };
    if (B.emit) B.emit('medicao:orcamento', dados);   /* (para os testes; nada sai do aparelho sem o sim) */
    if (!ATIVO || escolha() !== 'sim' || !CONFIG.ga4) return;
    carregar();
    /* beacon: a página vai embora logo depois (a passagem navega em meio segundo) */
    gtag('event', 'orcamento_iniciar', Object.assign({ transport_type: 'beacon' }, dados));
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || e.button !== 0) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin || !/^\/orcamento(\.html)?\/?$/.test(u.pathname) || /^\/orcamento/.test(location.pathname)) return;
    iniciarOrcamento(botao(a));
  }, true);

  if (!ATIVO) return;

  /* ---------- o aviso de cookies ---------- */
  var aviso = null;
  /* recusou depois de ter aceitado: os cookies do Google (_ga*, _gcl_*) saem do aparelho antes de recarregar */
  function apagarCookiesGoogle() {
    var nomes = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); }).filter(function (n) { return /^(_ga|_gid|_gcl_)/.test(n); });
    /* o GA grava no domínio mais alto aceito (ex.: .dominio.com.br): tenta cada sufixo; os que o navegador recusa não fazem nada */
    var partes = location.hostname.split('.'), dominios = [''];
    for (var k = 0; k < partes.length - 1; k++) dominios.push('.' + partes.slice(k).join('.'));
    nomes.forEach(function (n) { dominios.forEach(function (d) { document.cookie = n + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : ''); }); });
  }
  /* o foco (auditoria 2026-10-09): reaberto pelo rodapé, ele vai ao 1º botão; ao fechar com o foco dentro, volta a
     quem abriu (ou ao main), senão caía no body e o Tab recomeçava do topo */
  var quemAbriu = null;
  function devolverFoco() {
    var alvo = quemAbriu && quemAbriu.isConnected ? quemAbriu : document.querySelector('main');
    quemAbriu = null;
    if (!alvo) return;
    if (alvo.tagName === 'MAIN' && !alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
  }
  function fecharAviso() {
    if (!aviso) return;
    var tinhaFoco = aviso.contains(document.activeElement);
    aviso.remove(); aviso = null;
    if (tinhaFoco) devolverFoco(); else quemAbriu = null;
  }
  function mostrarAviso(abridor) {
    if (abridor && abridor.nodeType === 1) quemAbriu = abridor;
    if (aviso) { if (quemAbriu) aviso.querySelector('button').focus(); return; }
    aviso = document.createElement('div');
    aviso.className = 'consentimento';
    aviso.setAttribute('role', 'region');
    aviso.setAttribute('aria-label', 'Cookies');
    var p = document.createElement('p');
    p.appendChild(document.createTextNode('Usamos cookies do Google só para medir as visitas e os anúncios. O que você escreve no recado não passa por aqui. '));
    var link = document.createElement('a'); link.href = '/privacidade'; link.textContent = 'Política de privacidade';
    p.appendChild(link);
    var acoes = document.createElement('div'); acoes.className = 'consentimento__acoes';
    [['nao', 'Recusar'], ['sim', 'Aceitar']].forEach(function (b) {
      var bt = document.createElement('button');
      bt.type = 'button'; bt.className = 'btn consentimento__btn'; bt.textContent = b[1];
      bt.addEventListener('click', function () {
        guardar(b[0]); fecharAviso();
        if (b[0] === 'sim') carregar();
        else { apagarCookiesGoogle(); if (carregado) location.reload(); }   /* (revogou depois de aceitar: limpa e recarrega sem o Google) */
      });
      acoes.appendChild(bt);
    });
    aviso.appendChild(p); aviso.appendChild(acoes);
    /* nasceu com o menu ou o formulário aberto: fica inerte como o resto; js/pagina.js o solta ao fechar */
    if (document.body.classList.contains('is-menu')) aviso.inert = true;
    document.body.insertBefore(aviso, document.body.firstChild);   /* (1º no DOM: quem navega por teclado chega nele antes do resto) */
    if (quemAbriu) aviso.querySelector('button').focus();
  }
  /* o link "Cookies" do rodapé reabre a escolha */
  var reabrir = document.querySelectorAll('[data-consentimento-abrir]');
  for (var i = 0; i < reabrir.length; i++) {
    reabrir[i].hidden = false;
    reabrir[i].addEventListener('click', function (e) { mostrarAviso(e.currentTarget); });
  }
  var atual = escolha();
  /* quem já aceitou: o Google sobe no load, sem esperar o ocioso. O clique mais provável (o CTA do hero, logo no
     começo) sai da página em meio segundo pela passagem; com o gtag.js ainda baixando, o evento morria na fila */
  if (atual === 'sim') { if (document.readyState === 'complete') carregar(); else window.addEventListener('load', carregar, { once: true }); }
  else if (atual !== 'nao') quandoOcioso(mostrarAviso);
})();
