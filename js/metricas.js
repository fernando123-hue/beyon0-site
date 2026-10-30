/* ==========================================================================
   MÉTRICAS PRÓPRIAS — a coleta no navegador (2026-10-06; docs/metricas/).
   Pedido do dono: "uma forma mais específica de termos nossas próprias
   métricas, para resultados ainda mais precisos".

   O que muda em relação ao Google (js/medicao.js):
   - conta TODA visita, não só quem aceita cookies: não usa cookie, não guarda
     IP, não cria identificador que dure além da aba (sessionStorage);
   - guarda um código curto por visita ("K7Q4M") junto do contato (o clique em "Deixar um
     recado" ou em "Monte seu orçamento"); no painel (painel.html) o dono marca
     aquele código como conversa e como cliente, com o valor fechado. O site não tem
     mais WhatsApp da Beyon (Decisões 28/10): o código não vai mais numa mensagem pronta;
   - mede o caminho: seções vistas, até onde rolou, tempo com a aba à mostra,
     qual botão, o formulário (onde quem desiste parou) e se o Ouro aconteceu.

   ENQUANTO CONFIG.ativo FOR false, NADA ACONTECE.
   Ligar só depois do banco pronto (docs/metricas/README.md).
   O aparelho do dono não conta: o painel grava bz-nao-contar no navegador dele.
   ========================================================================== */
(function () {
  'use strict';
  var CONFIG = {
    ativo: false,
    endpoint: '/api/evento',
  };
  if (!CONFIG.ativo || !navigator.sendBeacon || !window.crypto || !crypto.getRandomValues) return;
  try { if (localStorage.getItem('bz-nao-contar') === '1') return; } catch (e) { /* sem armazenamento: conta */ }

  var B = window.BEYON || {};
  var CHAVE = 'bz-visita';
  var ALFABETO = 'ACDEFGHJKMNPQRTUVWXY34679';   /* sem 0/O, 1/I/L, 2/Z, 5/S, 8/B: ninguém erra ao ler em voz alta */

  function aleatorios(n) { var a = new Uint32Array(n); crypto.getRandomValues(a); return a; }
  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.prototype.map.call(aleatorios(4), function (x) { return ('0000000' + x.toString(16)).slice(-8); }).join('-');
  }
  function novoCodigo() { return Array.prototype.map.call(aleatorios(5), function (x) { return ALFABETO[x % ALFABETO.length]; }).join(''); }

  /* ---------- de onde a visita veio (só na 1ª página da aba) ---------- */
  var BUSCA = /^(www\.|search\.)?(google|bing|duckduckgo|yahoo|ecosia|yandex|brave)\./;
  var SOCIAL = /(^|\.)(instagram|facebook|fb|linkedin|lnkd|twitter|x|t|youtube|youtu|tiktok|threads|pinterest)\.(com|co|be|me|net|in)$/;
  var MENSAGEM = /(^|\.)(whatsapp|wa|telegram|t)\.(com|me|org)$/;
  function origem() {
    var q = new URLSearchParams(location.search);
    var meio = (q.get('utm_medium') || '').toLowerCase();
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { ref = ''; }
    if (ref && ref === location.hostname.replace(/^www\./, '')) ref = '';
    var corta = function (v, n) { return (v || '').slice(0, n); };
    var o = { fonte: 'direto', meio: 'direto', campanha: corta(q.get('utm_campaign'), 80), termo: corta(q.get('utm_term'), 80), gclid: corta(q.get('gclid'), 200) };
    if (o.gclid || q.get('gbraid') || q.get('wbraid') || /^(cpc|ppc|paid|pago|anuncio)$/.test(meio)) { o.meio = 'anuncio'; o.fonte = corta(q.get('utm_source'), 40) || 'google'; }
    else if (meio) { o.meio = /social/.test(meio) ? 'social' : /e-?mail/.test(meio) ? 'email' : 'referencia'; o.fonte = corta(q.get('utm_source') || meio, 40); }
    else if (ref) {
      /* a fonte é o nome do serviço (google, instagram), não o domínio inteiro (google.com.br) */
      var m;
      if ((m = ref.match(MENSAGEM))) o.meio = 'mensagem';
      else if ((m = ref.match(SOCIAL))) o.meio = 'social';
      else if ((m = ref.match(BUSCA))) o.meio = 'busca';
      else o.meio = 'referencia';
      o.fonte = m ? m[2] : ref;
    }
    return o;
  }

  var visita = null, entrada = false;
  try { visita = JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); } catch (e) { visita = null; }
  if (!visita || !visita.id || !visita.codigo) {
    visita = Object.assign({ id: uid(), codigo: novoCodigo() }, origem());
    entrada = true;
    try { sessionStorage.setItem(CHAVE, JSON.stringify(visita)); } catch (e) { /* sem armazenamento: cada página vira uma visita */ }
  }

  /* ---------- o retrato desta página ---------- */
  var largura = window.innerWidth;
  var toque = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var pv = {
    id: uid(), visita: visita.id, codigo: visita.codigo, pagina: location.pathname, inicio: Date.now(), entrada: entrada,
    fonte: visita.fonte, meio: visita.meio, campanha: visita.campanha, termo: visita.termo,
    dispositivo: largura < 768 ? 'celular' : toque && largura < 1200 ? 'tablet' : 'computador', largura: largura,
    carga_ms: null, secoes: [], rolagem: 0, ativo_s: 0, contato: null, contato_s: null, form: null, form_campo: null, ouro: false
  };

  /* tempo com a aba à mostra (aba no fundo não é leitura) */
  var visivelDesde = document.visibilityState === 'visible' ? performance.now() : null, acumulado = 0;
  function tempoAtivo() { return Math.round((acumulado + (visivelDesde !== null ? performance.now() - visivelDesde : 0)) / 1000); }

  /* a maior parte do conteúdo que apareceu: o scrollY é guardado na rolagem; a altura só é lida no envio */
  var maiorY = window.scrollY;
  var lerY = B.S ? function () { return B.S.sy; } : function () { return window.scrollY; };
  window.addEventListener('scroll', function () { var y = lerY(); if (y > maiorY) maiorY = y; }, { passive: true });
  function rolagem() {
    var alto = document.documentElement.scrollHeight;
    return alto ? Math.min(100, Math.round(((maiorY + window.innerHeight) / alto) * 100)) : 0;
  }

  /* a maior pintura (LCP) como "quanto a página demorou para aparecer" neste aparelho */
  try {
    new PerformanceObserver(function (lista) {
      var es = lista.getEntries();
      if (es.length) pv.carga_ms = Math.round(es[es.length - 1].startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) { /* navegador sem LCP (Safari antigo): fica sem */ }

  /* seção vista = passou pela faixa do meio da tela (funciona com seção mais alta que a tela, no celular) */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = (e.target.id || e.target.tagName).toLowerCase();
        if (pv.secoes.indexOf(id) < 0) pv.secoes.push(id);
        io.unobserve(e.target);
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    var secoes = document.querySelectorAll('main section[id], main > header[id], body > header[id], footer');
    for (var s = 0; s < secoes.length; s++) io.observe(secoes[s]);
  }

  /* ---------- os eventos que importam ---------- */
  function consentiuGoogle() { try { return localStorage.getItem('bz-consentimento') === 'sim'; } catch (e) { return false; } }
  /* o js/medicao.js decide o que é um contato (wa.me com número, envio do formulário) e avisa aqui: uma regra só */
  document.addEventListener('bz:contato', function (ev) {
    var d = ev.detail;
    if (pv.contato) return;
    pv.contato = d && d.origem_botao ? String(d.origem_botao).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'pagina' : 'pagina';
    pv.contato_s = Math.round((Date.now() - pv.inicio) / 1000);
    if (pv.contato === 'formulario') pv.form = 'enviou';
    enviar(true);
  });
  if (B.on) {
    B.on('formulario', function (d) {
      if (!d) return;
      if (d.fase === 'abriu' && !pv.form) pv.form = 'abriu';
      if (d.fase === 'campo' && d.campo) pv.form_campo = String(d.campo).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
      if (d.fase === 'fechou' && pv.form === 'abriu') enviar();
    });
    B.on('ouro', function (d) { if (d && d.fase === 'reinado') pv.ouro = true; });
  }

  /* ---------- o envio: beacon (sai mesmo com a aba fechando ou o WhatsApp abrindo) ---------- */
  var ultimo = '';
  function enviar(comContato) {
    pv.ativo_s = tempoAtivo();
    pv.rolagem = Math.max(pv.rolagem, rolagem());
    if (pv.rolagem >= 98 && pv.secoes.indexOf('footer') < 0) pv.secoes.push('footer');
    var pacote = Object.assign({}, pv);
    /* o identificador do clique no anúncio só vai com o aceite de cookies: ele liga a visita a uma conta do Google */
    if (comContato && visita.gclid && consentiuGoogle()) pacote.gclid = visita.gclid;
    var corpo = JSON.stringify(pacote);
    if (corpo === ultimo) return;
    ultimo = corpo;
    try { navigator.sendBeacon(CONFIG.endpoint, new Blob([corpo], { type: 'text/plain' })); } catch (e) { /* fila cheia: o próximo retrato leva tudo */ }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (visivelDesde !== null) { acumulado += performance.now() - visivelDesde; visivelDesde = null; }
      enviar();
    } else visivelDesde = performance.now();
  });
  window.addEventListener('pagehide', function () { enviar(); });
  /* o 1º retrato sai cedo: quem sai em segundos também é uma visita */
  var ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 0); };
  var ir = function () { setTimeout(function () { ocioso(function () { enviar(); }, { timeout: 2000 }); }, 3000); };
  if (document.readyState === 'complete') ir(); else window.addEventListener('load', ir, { once: true });
})();
