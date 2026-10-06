/* ==========================================================================
   MEDIÇÃO — Google Analytics 4 e Google Ads (2026-10-06; docs/google-ads/).
   Pedido do dono: "a ideia é fazer com que as pessoas achem o site sozinhas;
   devo explorar o Google Ads; prepare o ambiente". Este arquivo é o ambiente.

   ENQUANTO OS IDS ABAIXO ESTIVEREM VAZIOS, NADA ACONTECE: nenhum script do
   Google carrega, nenhum aviso de cookies aparece. Para ligar, preencher em
   CONFIG (o passo a passo está em docs/google-ads/README.md):
     ga4      'G-XXXXXXXXXX'  (GA4 › Administrador › Fluxos de dados)
     ads      'AW-XXXXXXXXX'  (Google Ads › Metas › Conversões › tag)
     adsRotuloContato  o rótulo da conversão "Contato WhatsApp" (a parte
                       depois da barra em 'AW-XXXXXXXXX/abcDEF123')
   A CSP (vercel.json e o <meta> de cada página) já libera os domínios do
   Google necessários.

   Consentimento (LGPD), modo BÁSICO: o Google só carrega depois de a pessoa
   aceitar; quem recusa navega sem nenhum script de terceiro. A escolha fica
   no aparelho (localStorage) e pode ser revista pelo link "Cookies" do rodapé.
   Aceitar e Recusar têm o mesmo peso visual (sem empurrar o "sim").

   O que é medido: a conversão é o CLIQUE QUE ABRE O WHATSAPP (todo link
   wa.me) e o envio do formulário de Automação (evento 'contato' do
   js/lead-form.js). Cada clique leva de qual botão veio e se a visita veio de
   anúncio (js/ancoras.js marca html.via-anuncio a partir do gclid/utm). Os
   dados da conversa (o que a pessoa escreve) nunca passam por aqui.
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
  var ATIVO = !!(CONFIG.ga4 || CONFIG.ads), CHAVE = 'bz-consentimento';
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
  /* de onde veio o clique: a seção, a barra do celular, o ícone, o menu */
  function botao(a) {
    if (a.classList.contains('wa')) return 'icone';
    if (a.closest('.barra')) return 'barra';
    if (a.closest('.nav')) return 'menu';
    if (a.closest('.footer')) return 'rodape';
    if (a.closest('.lead-modal')) return 'formulario-direto';
    var sec = a.closest('section[id], header[id]');
    return sec ? sec.id : 'pagina';
  }
  function registrar(origem) {
    var dados = { origem_botao: origem, pagina: location.pathname || '/', via: viaAnuncio() ? 'anuncio' : 'site' };
    if (B.emit) B.emit('medicao:contato', dados);   /* (para os testes; nada sai do aparelho sem o sim) */
    if (!ATIVO || escolha() !== 'sim') return;
    carregar();   /* (clique antes do ocioso: carrega agora; o gtag.js processa a fila na ordem: js, config, evento) */
    /* beacon: no celular a página vai para segundo plano quando o app do WhatsApp abre */
    if (CONFIG.ga4) gtag('event', 'contato_whatsapp', Object.assign({ transport_type: 'beacon' }, dados));
    if (CONFIG.ads && CONFIG.adsRotuloContato) gtag('event', 'conversion', { send_to: CONFIG.ads + '/' + CONFIG.adsRotuloContato, transport_type: 'beacon' });
  }
  /* só o link que ABRE UMA CONVERSA conta (wa.me com número): não o botão que abre o formulário (data-lead-gate: a
     conversão dele é o envio, evento 'contato'), não o "encaminhar o resumo" (wa.me sem número), não o "abrir de
     novo" da confirmação (a conversa já foi contada) */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="https://wa.me/"]') : null;
    if (!a || !/^https:\/\/wa\.me\/\d/.test(a.href) || a.hasAttribute('data-lead-gate') || a.hasAttribute('data-encaminhar') || a.closest('.lead-modal__pronto, [data-sem-medicao]')) return;
    registrar(botao(a));
  }, true);
  if (B.on) B.on('contato', function (d) { registrar((d && d.origem) || 'formulario'); });

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
  function fecharAviso() { if (aviso) { aviso.remove(); aviso = null; } }
  function mostrarAviso() {
    if (aviso) return;
    aviso = document.createElement('div');
    aviso.className = 'consentimento';
    aviso.setAttribute('role', 'region');
    aviso.setAttribute('aria-label', 'Cookies');
    var p = document.createElement('p');
    p.appendChild(document.createTextNode('Usamos cookies do Google só para medir as visitas e os anúncios. O que você escreve no WhatsApp não passa por aqui. '));
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
    document.body.insertBefore(aviso, document.body.firstChild);   /* (1º no DOM: quem navega por teclado chega nele antes do resto) */
  }
  /* o link "Cookies" do rodapé reabre a escolha */
  var reabrir = document.querySelectorAll('[data-consentimento-abrir]');
  for (var i = 0; i < reabrir.length; i++) {
    reabrir[i].hidden = false;
    reabrir[i].addEventListener('click', mostrarAviso);
  }
  var atual = escolha();
  if (atual === 'sim') quandoOcioso(carregar);
  else if (atual !== 'nao') quandoOcioso(mostrarAviso);
})();
