/* O WORKER — a tabela de rotas (cloudflare/rotas.mjs), em Node puro. npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarRoteador, ROTAS } from '../../cloudflare/rotas.mjs';
import * as vendas from '../../api/vendas.mjs';
import * as pagamentos from '../../api/pagamentos.mjs';
import * as leads from '../../api/leads.mjs';
import * as painel from '../../api/painel.mjs';
import { LIMITE_BYTES as LIMITE_EVENTO } from '../../api/_valida.mjs';

const CF = { BZ_PLATAFORMA: 'cloudflare' };
const eco = { limite: 1024, GET: async (r, e) => Response.json({ ok: true, xff: r.headers.get('x-forwarded-for'), vercel: r.headers.get('x-vercel-forwarded-for'), env: e.MARCA || null }),
  POST: async r => Response.json({ tamanho: (await r.text()).length }) };
const rotear = criarRoteador({ eco, quebra: { limite: 10, GET: async () => { throw new Error('segredo-no-erro'); } } });
const pedido = (caminho, op = {}) => new Request('https://beyonzero.com.br' + caminho, op);

test('rota e método certos chamam a função com o env recebido', async () => {
  const r = await rotear(pedido('/api/eco'), { MARCA: 'x' });
  assert.equal(r.status, 200); assert.equal((await r.json()).env, 'x');
});
test('nome fora da tabela, com _, maiúscula ou subcaminho: 404 JSON no-store', async () => {
  for (const c of ['/api/_freio', '/api/Eco', '/api/eco/x', '/api/nada', '/api/constructor', '/api/__proto__']) {
    const r = await rotear(pedido(c), {});
    assert.equal(r.status, 404, c); assert.match(r.headers.get('content-type'), /json/); assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});
test('método fora da tabela: 405', async () => { assert.equal((await rotear(pedido('/api/eco', { method: 'PUT', body: 'x' }), {})).status, 405); });
test('Cloudflare sem cf-connecting-ip válido: 403 e o handler não roda', async () => {
  let rodou = false;
  const r2 = criarRoteador({ eco: { limite: 10, GET: async () => { rodou = true; return new Response('x'); } } });
  for (const ip of [null, '', 'lixo', '999.1.1.1']) {
    const h = ip == null ? {} : { 'cf-connecting-ip': ip };
    assert.equal((await r2(pedido('/api/eco', { headers: h }), CF)).status, 403, String(ip));
  }
  assert.equal(rodou, false);
});
test('Cloudflare: o x-forwarded-for forjado some; vale o cf-connecting-ip', async () => {
  const r = await rotear(pedido('/api/eco', { headers: { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '5.6.7.8' } }), CF);
  const j = await r.json();
  assert.equal(j.xff, '203.0.113.7'); assert.equal(j.vercel, null);
});
test('corpo acima do limite da rota: 413 (Content-Length e leitura limitada); abaixo chega inteiro ao handler', async () => {
  assert.equal((await rotear(pedido('/api/eco', { method: 'POST', body: 'x'.repeat(1025) }), {})).status, 413);
  const sem = new Request('https://x/api/eco', { method: 'POST', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2000)); c.close(); } }), duplex: 'half' });
  assert.equal((await rotear(sem, {})).status, 413, 'sem Content-Length');
  const ok = await rotear(pedido('/api/eco', { method: 'POST', body: 'y'.repeat(1000) }), {});
  assert.equal((await ok.json()).tamanho, 1000);
});
test('handler que lança: 500 genérico com x-request-id, sem a mensagem', async () => {
  const r = await rotear(pedido('/api/quebra'), {});
  assert.equal(r.status, 500); assert.ok(r.headers.get('x-request-id'));
  assert.doesNotMatch(await r.text(), /segredo-no-erro/);
});
test('toda resposta da API: noindex, nosniff, no-store se faltar', async () => {
  const r = await rotear(pedido('/api/eco'), {});
  assert.equal(r.headers.get('x-robots-tag'), 'noindex'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('limite do Worker ≥ 3 × o do handler, em toda rota (revisão M1)', () => {
  const minimo = { vendas: vendas.LIMITE_BYTES, pagamentos: pagamentos.LIMITE_BYTES, evento: LIMITE_EVENTO, leads: leads.LIMITE_BYTES, painel: painel.CORPO_MAX, rotinas: 0 };
  for (const [nome, rota] of Object.entries(ROTAS)) assert.ok(rota.limite >= 3 * minimo[nome], nome);
});
test('todo api/<nome>.mjs sem _ tem rota (endpoint novo esquecido falha)', () => {
  const nomes = fs.readdirSync(new URL('../../api/', import.meta.url)).filter(n => /^[a-z]+\.mjs$/.test(n)).map(n => n.slice(0, -4)).sort();
  assert.deepEqual(Object.keys(ROTAS).sort(), nomes);
});

/* ---- B2: a agenda (crons) ---- */
import { agendar, AGENDA } from '../../cloudflare/agenda.mjs';
import { parse as lerJsonc } from '../../cloudflare/jsonc.mjs';
test('crons: reconciliar de 3 em 3 h e a diária, com o CRON_SECRET, pelas MESMAS funções', async () => {
  const vistos = [];
  const falsa = nome => async (req, env) => { vistos.push({ nome, url: req.url, auth: req.headers.get('authorization'), env }); return new Response('{}'); };
  const env = { CRON_SECRET: 'c'.repeat(40) };
  await agendar('23 */3 * * *', env, { pagamentos: falsa('pagamentos'), rotinas: falsa('rotinas') });
  await agendar('41 6 * * *', env, { pagamentos: falsa('pagamentos'), rotinas: falsa('rotinas') });
  assert.deepEqual(vistos.map(v => [v.nome, new URL(v.url).search, v.auth]), [
    ['pagamentos', '?acao=reconciliar', 'Bearer ' + 'c'.repeat(40)], ['rotinas', '?acao=diaria', 'Bearer ' + 'c'.repeat(40)]]);
});
test('cron desconhecido ou segredo curto: não chama nada e loga erro', async () => {
  let chamou = false;
  const f = async () => { chamou = true; return new Response('{}'); };
  await agendar('0 0 * * *', { CRON_SECRET: 'c'.repeat(40) }, { pagamentos: f, rotinas: f });
  await agendar('41 6 * * *', { CRON_SECRET: 'curto' }, { pagamentos: f, rotinas: f });
  assert.equal(chamou, false);
});
test('a AGENDA tem só as duas rotinas (o wrangler.jsonc é conferido no teste do B6)', () => {
  assert.deepEqual(Object.keys(AGENDA).sort(), ['23 */3 * * *', '41 6 * * *']);
});
test('jsonc: tira comentários e vírgulas finais, mas não mexe em texto de string', () => {
  const c = lerJsonc('{\n // linha\n "a": "http://x.com/*nao*/ // fica", /* bloco */ "b": [1, 2,],\n "c": {"d": 1,},\n}\n');
  assert.deepEqual(c, { a: 'http://x.com/*nao*/ // fica', b: [1, 2], c: { d: 1 } });
  assert.deepEqual(lerJsonc('{"s": "aspas \\" // dentro"}'), { s: 'aspas " // dentro' });
});
