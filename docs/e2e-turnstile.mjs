/* ==========================================================================
   E2E do ANTI-ROBÔ do /orcamento (js/orcamento-turnstile.js) num Chromium de
   verdade, com o script da Cloudflare TROCADO por um falso controlado (o
   real não deixa provocar cada erro). Precisa do servidor local COM as
   chaves de teste oficiais da Cloudflare (a página só carrega o widget
   quando há chave):
     TURNSTILE_SITE_KEY=1x00000000000000000000AA TURNSTILE_SECRET=1x0000000000000000000000000000000AA node docs/servidor.mjs . 8899
     BASE=http://127.0.0.1:8899 CHROMIUM=... npm run e2e:turnstile
   Cobre (doc oficial "Client-side errors"): erro de CONFIGURAÇÃO (110200
   domínio não autorizado, 110100 chave inválida, 200500 quadro bloqueado)
   → mensagem com WhatsApp; desafio recusado (600010) → "recarregue";
   desafio interativo → a página rola até o widget; o texto volta à caixa.
   ========================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const hostDe = url => { try { return new URL(url).hostname; } catch { return null; } };
if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostDe(BASE))) { console.error('Recusado: BASE precisa ser o servidor local.'); process.exit(2); }
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };

/* o "api.js" falso: render guarda as opções; execute chama o callback pedido pelo cenário */
const falso = cenario => `window.turnstile = {
  render: function (el, o) { window.__ts = o; var d = document.createElement('div'); d.className = 'ts-falso'; d.textContent = 'desafio'; el.appendChild(d); return 'w1'; },
  execute: function () { var o = window.__ts; setTimeout(function () { ${cenario} }, 50); },
  remove: function () { var d = document.querySelector('.ts-falso'); if (d) d.remove(); window.__removido = true; }
};`;

async function cenario(nome, codigoJs, verificar) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.route('https://challenges.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: falso(codigoJs) }));
  await p.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  ok((await (await p.request.get(BASE + '/api/vendas?acao=sessao-config')).json()).turnstile, nome + ': o servidor tem chave (senão o widget nem carrega)');
  await p.fill('#o-texto', 'Tenho uma clínica e quero um site');
  await p.press('#o-texto', 'Enter');
  await verificar(p);
  await ctx.close();
}
const aviso = p => p.waitForSelector('#o-aviso:not([hidden])', { timeout: 20000 }).then(() => p.textContent('#o-aviso-texto'));

try {
  for (const codigo of ['110200', '110100', '200500']) {
    await cenario('erro de configuração ' + codigo, `o['error-callback']('${codigo}')`, async p => {
      ok(/WhatsApp/.test(await aviso(p)), codigo + ': mensagem com WhatsApp (recarregar não resolveria)');
      ok((await p.inputValue('#o-texto')).includes('clínica'), codigo + ': o texto volta para a caixa');
    });
  }
  await cenario('desafio recusado', `o['error-callback']('600010')`, async p => {
    ok(/robô/.test(await aviso(p)), '600010: "não foi possível confirmar que você não é um robô"');
  });
  await cenario('desafio interativo', `window.scrollTo(0, 0); o['before-interactive-callback'](); setTimeout(function () { window.__visivel = (function (r) { return r.top >= 0 && r.bottom <= innerHeight; })(document.getElementById('o-turnstile').getBoundingClientRect()); o.callback('XXXX.DUMMY.TOKEN.XXXX'); }, 900);`, async p => {
    await p.waitForFunction(() => { try { return !!JSON.parse(localStorage.getItem('bz-orcamento') || 'null'); } catch (e) { return false; } }, null, { timeout: 30000 });
    ok(true, 'interativo: a sessão nasceu com o token (o servidor conferiu na Cloudflare)');
    ok(await p.evaluate(() => window.__visivel === true), 'interativo: o widget estava na tela quando pediu a interação');
    ok(await p.evaluate(() => window.__removido === true), 'sucesso: o widget sai da página');
  });
} catch (e) {
  ok(false, 'exceção: ' + (e && e.message ? e.message.split('\n')[0] : e));
} finally {
  await nav.close();
}
process.exit(falhou ? 1 : 0);
