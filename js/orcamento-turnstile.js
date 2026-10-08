/* ==========================================================================
   ANTI-ROBÔ do /orcamento (Cloudflare Turnstile), só na hora de criar a
   sessão (a primeira mensagem). A chave pública vem do servidor
   (GET /api/vendas?acao=sessao-config): sem chave, não carrega nada e a
   página segue como antes (servidor local, prévia sem chaves). Com chave, o
   script da Cloudflare entra só nesse momento, o widget roda invisível e só
   aparece se a Cloudflare pedir uma interação — aí a página rola até ele.
   Cada token vale uma vez e por 5 minutos: um novo a cada sessão criada, e o
   widget sai da página depois do sucesso. O servidor confere
   (api/_vendas/turnstile.mjs).
   Erros: { tipo: 'carga' } (chave, script ou rede: o serviço está fora; a
   página oferece o WhatsApp) ou { tipo: 'desafio' } (a Cloudflare não
   confirmou; recarregar resolve).
   ========================================================================== */
(function () {
  'use strict';
  var SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var CONFIG_MS = 8000;      /* a chave pública */
  var SCRIPT_MS = 15000;     /* o script da Cloudflare */
  var DESAFIO_MS = 120000;   /* desafio que a pessoa não resolve em 2 min: desiste e mostra o erro */
  /* códigos de erro da Cloudflare que são CONFIGURAÇÃO ou bloqueio do quadro (doc oficial "Client-side errors"):
     recarregar não resolve, a página oferece o WhatsApp. 110100/400020 chave inválida, 110110 não encontrada, 110200
     domínio não autorizado, 400021 região, 400070 desativada, 200500 o quadro da Cloudflare não carregou */
  var ERRO_DE_CARGA = /^(1101|1102|4000|200500)/;
  var chavePedida = null, carregando = null, widget = null, tagScript = null;

  function erro(tipo) { var e = new Error('turnstile: ' + tipo); e.tipo = tipo; return e; }

  function chave() {
    if (!chavePedida) {
      var ctrl = new AbortController();
      var relogio = setTimeout(function () { ctrl.abort(); }, CONFIG_MS);
      chavePedida = fetch('/api/vendas?acao=sessao-config', { headers: { accept: 'application/json' }, signal: ctrl.signal })
        .then(function (r) { if (!r.ok) throw erro('carga'); return r.json(); })
        .then(function (j) { return (j && typeof j.turnstile === 'string' && j.turnstile) || null; })
        .catch(function () { chavePedida = null; throw erro('carga'); })   /* falhou: tenta de novo na próxima */
        .finally(function () { clearTimeout(relogio); });
    }
    return chavePedida;
  }

  function carregar() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!carregando) {
      carregando = new Promise(function (ok, falha) {
        if (tagScript) tagScript.remove();   /* a tentativa anterior estourou o tempo: não acumula <script> */
        var s = tagScript = document.createElement('script');
        var relogio = setTimeout(function () { carregando = null; falha(erro('carga')); }, SCRIPT_MS);
        s.src = SCRIPT;
        s.async = true;
        s.onload = function () { clearTimeout(relogio); if (window.turnstile) ok(window.turnstile); else { carregando = null; falha(erro('carga')); } };
        s.onerror = function () { clearTimeout(relogio); carregando = null; falha(erro('carga')); };
        document.head.appendChild(s);
      });
    }
    return carregando;
  }

  function tirar(ts) {
    if (widget === null) return;
    try { ts.remove(widget); } catch (e) { /* já removido */ }
    widget = null;
  }

  async function token() {
    var k = await chave();
    if (!k) return null;
    var ts = await carregar();
    var caixa = document.getElementById('o-turnstile');
    if (!caixa) throw erro('carga');
    tirar(ts);
    return new Promise(function (ok, falha) {
      var relogio = setTimeout(function () { tirar(ts); falha(erro('desafio')); }, DESAFIO_MS);
      widget = ts.render(caixa, {
        sitekey: k, execution: 'execute', appearance: 'interaction-only', theme: 'dark', size: 'flexible', retry: 'never',
        language: 'pt-br',   /* o site é em português, qualquer que seja o idioma do navegador */
        callback: function (t) { clearTimeout(relogio); ok(t); setTimeout(function () { tirar(ts); }, 0); },
        'error-callback': function (codigo) {
          clearTimeout(relogio); tirar(ts);
          falha(erro(ERRO_DE_CARGA.test(String(codigo || '')) ? 'carga' : 'desafio'));
          return true;
        },
        /* a Cloudflare vai pedir um clique: no celular, com o teclado aberto, o widget podia ficar fora da tela */
        'before-interactive-callback': function () {
          var reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
          caixa.scrollIntoView({ block: 'center', behavior: reduzir ? 'auto' : 'smooth' });
        }
      });
      ts.execute(caixa);
    });
  }

  window.BZTurnstile = { token: token };
})();
