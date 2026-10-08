/* A POLÍTICA DE SEGURANÇA (CSP) de cada página existe em DOIS lugares: o header do vercel.json e o <meta> do próprio
   HTML (o navegador aplica os dois). Em 2026-10-07 o widget do Turnstile foi bloqueado porque só o vercel.json tinha
   sido atualizado (PR #8). Este teste prende os dois juntos e garante que o /orcamento não libera origem que a página
   não usa (revisão de segurança do PR #1, B4: domínios do Google sem uso).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('../../', import.meta.url);
const HEADERS = JSON.parse(readFileSync(new URL('vercel.json', RAIZ), 'utf8')).headers || [];
/* diretivas que o <meta> não aceita (só valem no header) */
const SO_NO_HEADER = new Set(['frame-ancestors', 'upgrade-insecure-requests', 'report-uri', 'report-to', 'sandbox']);

const diretivas = csp => Object.fromEntries(csp.split(';').map(x => x.trim()).filter(Boolean)
  .map(x => { const [k, ...v] = x.split(/\s+/); return [k, v.sort().join(' ')]; }));
/* o header que a Vercel aplica a um caminho (mesma conversão do docs/servidor.mjs: a última regra que casa vence) */
function cspDoHeader(caminho) {
  let valor = null;
  for (const regra of HEADERS) {
    const re = new RegExp('^' + regra.source.replace(/\(\.\*\)/g, '(.*)') + '$');
    if (!re.test(caminho)) continue;
    const h = regra.headers.find(x => x.key.toLowerCase() === 'content-security-policy');
    if (h) valor = h.value;
  }
  return valor;
}
const paginas = readdirSync(RAIZ).filter(f => f.endsWith('.html'));

test('CSP: o <meta> de cada página é igual ao header do vercel.json (fora as diretivas só de header)', () => {
  assert.ok(paginas.includes('orcamento.html'));
  for (const arquivo of paginas) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8');
    const meta = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/) || [])[1];
    if (!meta) continue;
    const caminho = '/' + arquivo.replace(/\.html$/, '').replace(/^index$/, '');
    const header = cspDoHeader(caminho);
    assert.ok(header, arquivo + ': tem <meta> de CSP mas nenhum header no vercel.json para ' + caminho);
    const h = diretivas(header), m = diretivas(meta);
    for (const k of SO_NO_HEADER) delete h[k];
    assert.deepEqual(m, h, arquivo + ' (' + caminho + '): <meta> e header divergem');
  }
});

test('CSP do /orcamento: sem origem que a página não usa (Google), com Mercado Pago e Cloudflare', () => {
  const csp = cspDoHeader('/orcamento');
  assert.ok(!/google|doubleclick|googlesyndication|googleadservices|googletagmanager/i.test(csp), 'sem Google: ' + csp);
  const html = readFileSync(new URL('orcamento.html', RAIZ), 'utf8');
  assert.ok(!/googletagmanager/.test(html), 'a página não carrega o Google');
  /* a medição entra só para decidir o que é contato (métricas próprias), sem o Google: data-sem-google */
  const scripts = html.match(/<script[^>]*medicao\.js[^>]*>/g) || [];
  assert.ok(scripts.every(s => /data-sem-google/.test(s)), 'medicao.js no orçamento só com data-sem-google: ' + scripts.join(' '));
  const d = diretivas(csp);
  for (const origem of ['https://sdk.mercadopago.com', 'https://challenges.cloudflare.com']) assert.ok(d['script-src'].includes(origem), origem);
  for (const origem of ['https://secure-fields.mercadopago.com', 'https://challenges.cloudflare.com']) assert.ok(d['frame-src'].includes(origem), origem);
});
