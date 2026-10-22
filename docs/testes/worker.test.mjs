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

/* ---- B5: o servidor local passa pela mesma porta (rotear) e usa o _headers ---- */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { lerHeaders, cabecalhosPara } from '../../cloudflare/cabecalhos.mjs';

const RAIZ_REPO = fileURLToPath(new URL('../..', import.meta.url));
const portaLivre = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});
async function comServidorLocal(fn) {
  const porta = await portaLivre();
  let saida = '';
  const filho = spawn(process.execPath, ['docs/servidor.mjs', '.', String(porta)], { cwd: RAIZ_REPO, env: { ...process.env, BZ_LOCAL: '1', PAINEL_CHAVE: 'p'.repeat(40) } });
  filho.stdout.on('data', d => { saida += d; });
  filho.stderr.on('data', d => { saida += d; });
  const base = 'http://127.0.0.1:' + porta;
  try {
    const fim = Date.now() + 60000;
    for (;;) {
      if (filho.exitCode !== null) throw new Error('servidor local saiu cedo: ' + saida.slice(-500));
      if (Date.now() > fim) throw new Error('servidor local não subiu em 60 s: ' + saida.slice(-500));
      try { await fetch(base + '/robots.txt', { signal: AbortSignal.timeout(2000) }); break; } catch { await new Promise(r => setTimeout(r, 300)); }
    }
    await fn(base);
  } finally { filho.kill(); }
}

test('servidor local: /api passa pelo roteador (404, 405, 413 por rota) e as páginas levam os cabeçalhos do _headers', async () => {
  await comServidorLocal(async base => {
    const r404 = await fetch(base + '/api/_freio');
    assert.equal(r404.status, 404); assert.match(r404.headers.get('content-type'), /json/);
    assert.equal((await fetch(base + '/api/vendas', { method: 'PUT', body: 'x' })).status, 405);
    const grande = await fetch(base + '/api/vendas', { method: 'POST', body: 'x'.repeat(70 * 1024) });
    assert.equal(grande.status, 413); assert.deepEqual(await grande.json(), { erro: 'Corpo grande demais.' });
    const painelGrande = await fetch(base + '/api/painel', { method: 'POST', body: 'x'.repeat(150 * 1024) });
    assert.equal(painelGrande.status, 401, 'o limite do painel é maior: chega ao handler, que pede a chave');
    const regras = lerHeaders(fs.readFileSync(new URL('../../_headers', import.meta.url), 'utf8'));
    for (const [rota, arquivo] of [['/', '/'], ['/orcamento', '/orcamento'], ['/painel', '/painel']]) {
      const r = await fetch(base + arquivo);
      assert.equal(r.status, 200, rota);
      for (const [nome, valor] of cabecalhosPara(regras, rota)) assert.equal(r.headers.get(nome), valor, rota + ' ' + nome);
    }
  });
});

/* ---- B6: wrangler.jsonc e package.json ---- */
const SEGREDOS = ['SUPABASE_URL', 'SUPABASE_CHAVE_PUBLICA', 'SUPABASE_CHAVE_SECRETA', 'PAINEL_CHAVE', 'ANTHROPIC_API_KEY', 'MP_ACCESS_TOKEN', 'MP_PUBLIC_KEY',
  'MP_WEBHOOK_SEGREDO', 'MP_USER_ID', 'CRON_SECRET', 'FREIO_SEGREDO', 'ALERTA_NTFY_TOPICO', 'ALERTA_NTFY_TOKEN', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET'];
const lerWrangler = () => lerJsonc(fs.readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
test('os crons do wrangler.jsonc (produção e prévia) == as chaves da AGENDA', () => {
  const cfg = lerWrangler();
  assert.deepEqual([...cfg.triggers.crons].sort(), Object.keys(AGENDA).sort());
  assert.deepEqual([...cfg.env.previa.triggers.crons].sort(), Object.keys(AGENDA).sort());
});
test('wrangler.jsonc: produção fechada, prévia declarada, nada de segredo, nada que rode código no build', () => {
  const c = lerWrangler();
  assert.ok(c.compatibility_flags.includes('nodejs_compat')); assert.equal(c.compatibility_date, '2026-10-21');
  assert.equal(c.assets.directory, 'publico'); assert.deepEqual(c.assets.run_worker_first, ['/api/*']); assert.equal(c.assets.not_found_handling, '404-page');
  assert.equal(c.assets.html_handling, 'auto-trailing-slash');
  assert.equal(c.vars.BZ_AMBIENTE, 'producao'); assert.equal(c.vars.MP_AMBIENTE, 'producao'); assert.equal(c.vars.MP_METODOS, 'pix');
  assert.equal(c.env.previa.vars.BZ_AMBIENTE, 'previa'); assert.equal(c.env.previa.vars.MP_AMBIENTE, 'teste'); assert.equal(c.env.previa.vars.MP_METODOS, 'pix');
  assert.deepEqual(c.env.previa.previews.vars, c.env.previa.vars, 'as prévias de branch não herdam vars: os mesmos do staging (ALTO-2)');
  for (const vars of [c.vars, c.env.previa.vars, c.previews?.vars || {}, c.env.previa.previews.vars]) for (const s of SEGREDOS) assert.ok(!(s in vars), s + ' em vars');
  assert.equal(c.workers_dev, false, 'produção sem workers.dev (revisão M3)');
  assert.equal(c.build, undefined, 'sem build: o Builds não honra e ele rodaria código no deploy');
  assert.equal(c.account_id, undefined, 'a conta vem do token do Builds de cada conta');
  assert.equal(c.name, 'beyon-zero-site');
  assert.equal(c.env.previa.name, undefined, 'uma conta só: um name no env.previa apontaria o deploy da main para a produção (§ 5.3, trava 2)');
  assert.equal(c.routes, undefined, 'o domínio é do PR C'); assert.equal(c.env.previa.route, undefined);
  assert.deepEqual(c.env.previa.routes, [], 'routes é herdável: o staging nunca pega o domínio de produção (ALTO-1)');
  assert.equal(c.observability.enabled, true); assert.equal(c.observability.traces.enabled, true);
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const s of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepack']) assert.equal(pkg.scripts[s], undefined, s);
  assert.equal(pkg.devDependencies.wrangler, '4.136.3', 'versão exata');
});
test('package.json: scripts da Cloudflare e descrição sem Vercel; o lock fixa o wrangler', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['cf:montar'], 'node cloudflare/montar-publico.mjs');
  assert.equal(pkg.scripts['cf:fumaca'], 'node docs/worker-fumaca.mjs');
  assert.equal(pkg.scripts['cpu:rotas'], 'node docs/cpu-rotas.mjs');
  assert.doesNotMatch(pkg.description, /vercel/i);
  const lock = JSON.parse(fs.readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.packages['node_modules/wrangler'].version, '4.136.3');
});
