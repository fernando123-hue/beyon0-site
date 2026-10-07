/* ==========================================================================
   ANTI-ROBÔ do /orcamento (Cloudflare Turnstile), só na hora de criar a
   sessão (a primeira mensagem). A chave pública vem do servidor
   (GET /api/vendas?acao=sessao-config): sem chave, não carrega nada e a
   página segue como antes (servidor local, prévia sem chaves). Com chave, o
   script da Cloudflare entra só nesse momento, o widget roda invisível e só
   aparece se a Cloudflare pedir uma interação. Cada token vale uma vez e por
   5 minutos: um novo a cada sessão criada. O servidor confere
   (api/_vendas/turnstile.mjs).
   ========================================================================== */
(function () {
  'use strict';
  var SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var ESPERA_MS = 120000;   /* desafio que a pessoa não resolve em 2 min: desiste e mostra o erro */
  var chavePedida = null, carregando = null, widget = null;

  function chave() {
    if (!chavePedida) {
      chavePedida = fetch('/api/vendas?acao=sessao-config', { headers: { accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('config ' + r.status); return r.json(); })
        .then(function (j) { return (j && typeof j.turnstile === 'string' && j.turnstile) || null; })
        .catch(function (e) { chavePedida = null; throw e; });   /* falhou: tenta de novo na próxima */
    }
    return chavePedida;
  }

  function carregar() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!carregando) {
      carregando = new Promise(function (ok, falha) {
        var s = document.createElement('script');
        s.src = SCRIPT;
        s.async = true;
        s.onload = function () { if (window.turnstile) ok(window.turnstile); else { carregando = null; falha(new Error('turnstile')); } };
        s.onerror = function () { carregando = null; falha(new Error('turnstile')); };
        document.head.appendChild(s);
      });
    }
    return carregando;
  }

  async function token() {
    var k = await chave();
    if (!k) return null;
    var ts = await carregar();
    var caixa = document.getElementById('o-turnstile');
    if (!caixa) throw new Error('turnstile: sem lugar na página');
    if (widget !== null) { try { ts.remove(widget); } catch (e) { /* já removido */ } widget = null; }
    return new Promise(function (ok, falha) {
      var relogio = setTimeout(function () { falha(new Error('turnstile: tempo')); }, ESPERA_MS);
      widget = ts.render(caixa, {
        sitekey: k, execution: 'execute', appearance: 'interaction-only', theme: 'dark', size: 'flexible',
        callback: function (t) { clearTimeout(relogio); ok(t); },
        'error-callback': function () { clearTimeout(relogio); falha(new Error('turnstile')); return true; }
      });
      ts.execute(caixa);
    });
  }

  window.BZTurnstile = { token: token };
})();
