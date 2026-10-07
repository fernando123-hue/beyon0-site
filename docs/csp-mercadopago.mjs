/* ==========================================================================
   Mede o que o MercadoPago.js (campos seguros) pede da CSP do /orcamento:
   abre a página com a política REAL, carrega o SDK, monta os 3 campos do
   cartão e lista violações e hosts. Use com a Public Key de TESTE real
   antes de ir a produção (docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md §9).
   Esperado: só "style-src-attr ← inline" nos iframes (o CSS do site os
   dimensiona); qualquer outra violação = rever a CSP.
   Uso: BASE=https://<prévia> PUBLIC_KEY=<chave de teste> CHROMIUM=... node docs/csp-mercadopago.mjs
   ========================================================================== */
import { chromium } from 'playwright';

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await (await nav.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const violacoes = {}, hosts = new Set();
await page.exposeFunction('reportar', v => { violacoes[v] = (violacoes[v] || 0) + 1; });
await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.reportar(e.violatedDirective + ' ← ' + e.blockedURI)));
page.on('request', r => { const u = new URL(r.url()); if (u.origin !== new URL(process.env.BASE).origin) hosts.add(r.resourceType() + ' ' + u.host + u.pathname); });
await page.goto(process.env.BASE + '/orcamento', { waitUntil: 'load' });
const r = await page.evaluate(async pk => {
  await new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://sdk.mercadopago.com/js/v2'; s.onload = ok; s.onerror = () => falha(new Error('o SDK não carregou (CSP?)')); document.head.appendChild(s); });
  for (const id of ['n', 'v', 'c']) { const d = document.createElement('div'); d.id = 'medir-' + id; document.body.appendChild(d); }
  const mp = new window.MercadoPago(pk, { locale: 'pt-BR', advancedFraudPrevention: false, trackingDisabled: true });
  mp.fields.create('cardNumber', {}).mount('medir-n');
  mp.fields.create('expirationDate', {}).mount('medir-v');
  mp.fields.create('securityCode', {}).mount('medir-c');
  let tipos = null;
  try { tipos = (await mp.getIdentificationTypes()).map(t => t.id).join(','); } catch (e) { tipos = 'erro: ' + e.message.slice(0, 80); }
  await new Promise(ok => setTimeout(ok, 8000));
  return { iframes: document.querySelectorAll('iframe').length, documentos: tipos };
}, process.env.PUBLIC_KEY || 'TEST-00000000-0000-0000-0000-000000000000').catch(e => ({ erro: e.message }));
console.log(JSON.stringify({ resultado: r, violacoes, hosts: [...hosts] }, null, 1));
await nav.close();
