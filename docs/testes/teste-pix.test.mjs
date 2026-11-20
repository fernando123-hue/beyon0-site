/* O TESTE DO PIX DE R$ 0,01 (api/_pagamentos/teste-pix.mjs, rotas do dono em api/painel.mjs) contra o Mercado Pago SIMULADO
   (docs/mp-simulado.mjs; nenhuma chamada real). Prova: fechado sem a chave do painel e sem BZ_TESTE_PIX=1; valor FIXO de R$ 0,01
   mesmo que o pedido mande outro; só order TESTE- de R$ 0,01 da nossa conta é lida ou reembolsada (order real é recusada mesmo
   com id válido); no máximo 5 por hora; dado de quem paga não vai a log nem a erro; o módulo de teste não é importado por nada
   do caminho do cliente; a variável vem vazia em produção.  npm run testar */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarMpSimulado } from '../mp-simulado.mjs';
import { criarMercadoPago } from '../../api/_pagamentos/mercadopago.mjs';
import { criarTestePix, VALOR_CENTAVO, MAX_POR_HORA } from '../../api/_pagamentos/teste-pix.mjs';
import { ler, mudar, ACOES_PAINEL } from '../../api/painel.mjs';
import { parse } from '../../cloudflare/jsonc.mjs';

const BASE = 'http://127.0.0.1:8899';
const CHAVE = 'k'.repeat(40);
const CONTA = '1234567890';
const ENV = { PAINEL_CHAVE: CHAVE, BZ_TESTE_PIX: '1' };
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana.souza@exemplo.com', documento_tipo: 'CPF', documento: '529.982.247-25' };
const RAIZ = new URL('../../', import.meta.url);
const pasta = rel => fileURLToPath(new URL(rel, RAIZ));

let sim, corpos, teste, ipSeq = 0;
function montar({ ambiente = 'simulado', sandbox = true } = {}) {
  sim = criarMpSimulado({ token: 'tok-' + 'a'.repeat(30), userId: CONTA, segredo: 's'.repeat(32), sandbox });
  corpos = [];
  const buscar = async (url, init = {}) => { corpos.push({ url: String(url), metodo: (init.method || 'GET').toUpperCase(), corpo: init.body ? JSON.parse(init.body) : null }); return sim.fetch(url, init); };
  const cfg = { ativo: true, ambiente, provedor: 'mercadopago', token: 'tok-' + 'a'.repeat(30), base: 'https://api.mercadopago.com', fetch: buscar, contaEsperada: CONTA };
  teste = criarTestePix({ config: () => cfg });
}
beforeEach(() => montar());

let console_;
beforeEach(() => { console_ = { error: console.error, log: console.log, warn: console.warn, info: console.info }; });
afterEach(() => Object.assign(console, console_));

const comChave = (extra = {}) => ({ headers: { authorization: 'Bearer ' + CHAVE, 'x-forwarded-for': '192.0.2.' + (++ipSeq % 250), ...(extra.headers || {}) }, ...(extra.method ? { method: extra.method, body: extra.body } : {}) });
const post = async (corpo, { env = ENV, deps = { testePix: teste }, semChave = false } = {}) => {
  const r = await mudar(new Request(BASE + '/api/painel', semChave ? { method: 'POST', body: JSON.stringify(corpo), headers: { 'x-forwarded-for': '198.51.100.' + (++ipSeq % 250) } } : comChave({ method: 'POST', body: JSON.stringify(corpo) })), env, deps);
  return { status: r.status, corpo: await r.json() };
};
const get = async (orderId, { env = ENV, deps = { testePix: teste }, semChave = false } = {}) => {
  const r = await ler(new Request(BASE + '/api/painel?teste_pix=' + orderId, semChave ? { headers: { 'x-forwarded-for': '198.51.100.' + (++ipSeq % 250) } } : comChave()), env, deps);
  return { status: r.status, corpo: await r.json() };
};
const criar = (extra = {}) => post({ teste_pix: { ...PAGADOR, ...extra } });
const chamadasAoMp = () => sim.chamadas.length;
const pedidoReal = async (valor = 50, ref = 'a1b2c3d4-0000-4000-8000-000000000001') => {
  const mp = criarMercadoPago({ token: 'tok-' + 'a'.repeat(30), fetch: sim.fetch });
  const { order } = await mp.criarOrdem({ chave: 'real-' + ref, referencia: ref, valor, pagador: { email: 'test@testuser.com', nome: 'APRO', sobrenome: 'X', documentoTipo: 'CPF', documento: '52998224725' }, metodo: 'pix' });
  return order;
};

/* ======================= fechado ======================= */
test('sem a chave do painel nada funciona (401), e nenhuma chamada sai para o Mercado Pago', async () => {
  assert.equal((await post({ teste_pix: PAGADOR }, { semChave: true })).status, 401);
  assert.equal((await get('ORD0123456789ABCDEF', { semChave: true })).status, 401);
  assert.equal((await post({ teste_pix_reembolsar: 'ORD0123456789ABCDEF' }, { semChave: true })).status, 401);
  assert.equal(chamadasAoMp(), 0);
});

test('com a chave mas sem BZ_TESTE_PIX=1 (ausente, vazio, 0, true, 1 com espaço) as três rotas respondem fechado, sem chamar o Mercado Pago', async () => {
  for (const valor of [undefined, '', '0', 'true', 'sim', ' 1']) {
    const env = { PAINEL_CHAVE: CHAVE, ...(valor === undefined ? {} : { BZ_TESTE_PIX: valor }) };
    for (const r of [await post({ teste_pix: PAGADOR }, { env }), await get('ORD0123456789ABCDEF', { env }), await post({ teste_pix_reembolsar: 'ORD0123456789ABCDEF' }, { env })]) {
      assert.equal(r.status, 403, JSON.stringify(valor));
      assert.equal(r.corpo.desligado, true);
    }
  }
  assert.equal(chamadasAoMp(), 0);
});

test('o painel conhece as ações novas (a lista que o ensaio de CPU confere contra o código)', () => {
  assert.ok(ACOES_PAINEL.GET.includes('teste_pix'));
  assert.ok(ACOES_PAINEL.POST.includes('teste_pix') && ACOES_PAINEL.POST.includes('teste_pix_reembolsar'));
});

/* ======================= o valor é fixo ======================= */
test('cria o Pix de R$ 0,01: order TESTE-, valor 0.01, expira em 10 minutos, devolve QR e copia-e-cola', async () => {
  const r = await criar();
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.match(r.corpo.order_id, /^ORD/);
  assert.equal(r.corpo.valor, '0.01');
  assert.ok(r.corpo.qr.startsWith('0002'), 'o copia-e-cola');
  assert.ok(r.corpo.qr_base64.length > 20);
  const pedidos = corpos.filter(c => c.metodo === 'POST' && c.url.endsWith('/v1/orders'));
  assert.equal(pedidos.length, 1);
  const c = pedidos[0].corpo;
  assert.equal(c.total_amount, '0.01');
  assert.equal(c.transactions.payments[0].amount, '0.01');
  assert.equal(c.transactions.payments[0].expiration_time, 'PT10M');
  assert.match(c.external_reference, /^TESTE-[0-9a-f]{24}$/);
  assert.equal(c.transactions.payments[0].payment_method.id, 'pix');
});

test('o valor é FIXO: nada que a requisição mande (valor, amount, total_amount, centavos, dentro ou fora do teste_pix) muda os R$ 0,01', async () => {
  const lixo = { valor: 5000, amount: '5000.00', total_amount: '5000.00', valor_centavos: 500000, total: 1, preco: 99 };
  const r = await post({ ...lixo, teste_pix: { ...PAGADOR, ...lixo } });
  assert.equal(r.status, 200);
  const c = corpos.find(x => x.metodo === 'POST' && x.url.endsWith('/v1/orders')).corpo;
  assert.equal(c.total_amount, '0.01');
  assert.equal(c.transactions.payments[0].amount, '0.01');
  assert.equal(sim.orders.get(r.corpo.order_id).total_amount, '0.01');
  assert.equal(VALOR_CENTAVO, '0.01');
});

test('fora da produção usa o pagador de teste do Mercado Pago; em produção manda o que o dono digitou (o banco mostra o nome dele)', async () => {
  await criar();
  const sandbox = corpos.find(x => x.metodo === 'POST' && x.url.endsWith('/v1/orders')).corpo.payer;
  assert.equal(sandbox.email, 'test@testuser.com');
  assert.equal(sandbox.first_name, 'APRO');
  montar({ ambiente: 'producao', sandbox: false });
  const r = await criar();
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const prod = corpos.find(x => x.metodo === 'POST' && x.url.endsWith('/v1/orders')).corpo.payer;
  assert.deepEqual([prod.email, prod.first_name, prod.last_name, prod.identification], ['ana.souza@exemplo.com', 'Ana', 'Souza', { type: 'CPF', number: '52998224725' }]);
});

test('dados inválidos: 400 claro, nada vai ao Mercado Pago, o erro não repete o que foi digitado', async () => {
  const casos = [{ email: 'sem-arroba' }, { documento: '111.111.111-11' }, { nome: '' }, { documento_tipo: 'RG' }, { documento_tipo: 'CNPJ' }];
  for (const extra of casos) {
    const r = await criar(extra);
    assert.equal(r.status, 400, JSON.stringify(extra));
    for (const v of Object.values(extra)) if (v) assert.ok(!JSON.stringify(r.corpo).includes(v), 'o erro não devolve o dado digitado');
  }
  assert.equal((await post({ teste_pix: 'texto' })).status, 400);
  assert.equal((await post({ teste_pix: null })).status, 400);
  assert.equal(chamadasAoMp(), 0);
});

test('a cobrança devolvida tem de ser a pedida: valor, referência ou conta diferentes = nenhum QR entregue e a order é cancelada', async () => {
  const original = sim.fetch;
  for (const adulterar of [o => { o.total_amount = '5.00'; }, o => { o.user_id = '999999'; }, o => { o.external_reference = 'OUTRA-COISA'; }]) {
    const cfg = { ativo: true, ambiente: 'simulado', token: 'tok-' + 'a'.repeat(30), base: 'https://api.mercadopago.com', contaEsperada: CONTA,
      fetch: async (url, init) => { const r = await original(url, init); if ((init.method || 'GET') !== 'POST' || !String(url).endsWith('/v1/orders')) return r; const d = await r.json(); adulterar(d); return new Response(JSON.stringify(d), { status: r.status, headers: { 'content-type': 'application/json' } }); } };
    const t = criarTestePix({ config: () => cfg });
    const cancelesAntes = sim.chamadas.filter(c => c.caminho.endsWith('/cancel')).length;
    const r = await post({ teste_pix: PAGADOR }, { deps: { testePix: t } });
    assert.equal(r.status, 502);
    assert.equal(r.corpo.qr, undefined);
    assert.equal(sim.chamadas.filter(c => c.caminho.endsWith('/cancel')).length, cancelesAntes + 1, 'a order criada sem conferir é cancelada (uma vez, em cada caso)');
  }
});

test('reembolso em conflito (o MP já tem devolução em curso) não mostra o texto de "pago": diz que a devolução está em andamento', async () => {
  const { corpo: c } = await criar();
  sim.pagarPix(c.order_id);
  sim.editar(c.order_id, o => { o.status = 'processed'; });
  const original = sim.fetch;
  const cfg = { ativo: true, ambiente: 'simulado', token: 'tok-' + 'a'.repeat(30), base: 'https://api.mercadopago.com', contaEsperada: CONTA,
    fetch: async (url, init) => ((init.method || 'GET') === 'POST' && String(url).endsWith('/refund') ? new Response(JSON.stringify({ errors: [{ code: 'refund_in_progress' }] }), { status: 409 }) : original(url, init)) };
  const r = await post({ teste_pix_reembolsar: c.order_id }, { deps: { testePix: criarTestePix({ config: () => cfg }) } });
  assert.equal(r.corpo.estado, 'pago');
  assert.match(r.corpo.texto, /em andamento/);
  assert.ok(!/cadeia funciona/.test(r.corpo.texto));
});

/* ======================= consultar ======================= */
test('consultar: aguardando → pago (texto da cadeia funcionando) e só a order do teste', async () => {
  const { corpo: c } = await criar();
  let r = await get(c.order_id);
  assert.equal(r.status, 200);
  assert.deepEqual([r.corpo.estado, r.corpo.pago], ['aguardando', false]);
  sim.pagarPix(c.order_id);
  r = await get(c.order_id);
  assert.deepEqual([r.corpo.estado, r.corpo.pago], ['pago', true]);
  assert.equal(r.corpo.texto, 'Pagamento recebido pelo Mercado Pago: a cadeia funciona.');
  sim.expirar(c.order_id);
  assert.equal((await get(c.order_id)).corpo.estado, 'expirou');
});

test('consultar: order de pedido real (referência de tentativa) é recusada mesmo com id válido, sem vazar nada dela', async () => {
  const real = await pedidoReal();
  const r = await get(real.id);
  assert.equal(r.status, 404);
  assert.equal(JSON.stringify(r.corpo).includes(real.external_reference), false);
  assert.equal((await get('naoeumid')).status, 400);
  assert.equal((await get('ORDnaoexiste0000000000')).status, 404);
});

/* ======================= reembolsar ======================= */
test('reembolsar: devolve o centavo UMA vez, só depois de pago; de novo não devolve outra vez', async () => {
  const { corpo: c } = await criar();
  const naoPago = await post({ teste_pix_reembolsar: c.order_id });
  assert.equal(naoPago.status, 409);
  assert.equal(sim.chamadas.filter(x => x.caminho.endsWith('/refund')).length, 0, 'não pago: nem chega ao reembolso');
  sim.pagarPix(c.order_id);
  const r = await post({ teste_pix_reembolsar: c.order_id });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.estado, 'devolvido');
  const r2 = await post({ teste_pix_reembolsar: c.order_id });
  assert.equal(r2.corpo.estado, 'devolvido');
  const reembolsos = sim.chamadas.filter(x => x.caminho.endsWith('/refund'));
  assert.equal(reembolsos.length, 1);
  assert.equal(reembolsos[0].chave, 'rf-teste-' + c.order_id);
  assert.equal(sim.orders.get(c.order_id).transactions.refunds.length, 1);
});

test('reembolsar NUNCA toca order real: pedido pago com referência de tentativa, id válido, é recusado sem chamar o reembolso', async () => {
  const real = await pedidoReal(3340);
  sim.pagarPix(real.id);
  const r = await post({ teste_pix_reembolsar: real.id });
  assert.equal(r.status, 404);
  assert.equal(sim.chamadas.filter(x => x.caminho.endsWith('/refund')).length, 0);
  assert.equal(sim.orders.get(real.id).status, 'processed', 'continua paga');
});

test('reembolsar recusa order com TESTE- mas valor diferente de R$ 0,01, order com TESTE- de outra conta e referência que só CONTÉM TESTE-', async () => {
  const mp = criarMercadoPago({ token: 'tok-' + 'a'.repeat(30), fetch: sim.fetch });
  const pagador = { email: 'test@testuser.com', nome: 'APRO', sobrenome: 'X', documentoTipo: 'CPF', documento: '52998224725' };
  const caro = (await mp.criarOrdem({ chave: 'k-caro-0001', referencia: 'TESTE-' + 'c'.repeat(24), valor: 5, pagador, metodo: 'pix' })).order;
  const dono = (await mp.criarOrdem({ chave: 'k-dono-0001', referencia: 'TESTE-' + 'd'.repeat(24), valor: 0.01, pagador, metodo: 'pix' })).order;
  const meio = (await mp.criarOrdem({ chave: 'k-meio-0001', referencia: 'x-TESTE-' + 'e'.repeat(24), valor: 0.01, pagador, metodo: 'pix' })).order;
  sim.pagarPix(caro.id); sim.pagarPix(dono.id); sim.pagarPix(meio.id);
  sim.editar(dono.id, o => { o.user_id = '777'; });
  for (const o of [caro, dono, meio]) {
    assert.equal((await post({ teste_pix_reembolsar: o.id })).status, 404, o.external_reference);
    assert.equal((await get(o.id)).status, 404, o.external_reference);
  }
  assert.equal(sim.chamadas.filter(x => x.caminho.endsWith('/refund')).length, 0);
});

test('reembolsar: id fora do formato é recusado antes de qualquer chamada', async () => {
  for (const id of [null, 5, '', '../orders', 'ORD1', { $ne: 1 }]) assert.equal((await post({ teste_pix_reembolsar: id })).status, 400, JSON.stringify(id));
  assert.equal(chamadasAoMp(), 0);
});

/* ======================= freio ======================= */
test('no máximo 5 testes por hora: o 6º é recusado e não chega ao Mercado Pago', async () => {
  for (let i = 0; i < MAX_POR_HORA; i++) assert.equal((await criar()).status, 200);
  const antes = chamadasAoMp();
  const r = await criar();
  assert.equal(r.status, 429);
  assert.equal(chamadasAoMp(), antes);
  assert.equal((await criar({ email: 'sem-arroba' })).status, 400, 'dado inválido não gasta o limite nem se confunde com ele');
});

/* ======================= falhas e privacidade ======================= */
test('erro do Mercado Pago e erro de rede: mensagem simples, e o que o dono digitou não aparece na resposta nem em nenhum log', async () => {
  const logs = [];
  for (const m of ['error', 'log', 'warn', 'info']) console[m] = (...a) => logs.push(a.map(x => (x && x.stack) || (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
  const segredos = ['Ana', 'Souza', 'ana.souza@exemplo.com', '52998224725', '529.982.247-25'];
  for (const falha of [400, 401, 429, 500, 'rede', 'tempo']) {
    sim.falhar(falha);
    const r = await criar();
    assert.ok(r.status >= 400, String(falha));
    const texto = JSON.stringify(r.corpo);
    for (const s of segredos) assert.ok(!texto.includes(s), 'resposta de erro com dado do pagador: ' + falha);
  }
  const { corpo: c } = await criar();
  sim.falhar(500);
  await get(c.order_id);
  sim.falhar('rede');
  await post({ teste_pix_reembolsar: c.order_id });
  const tudo = logs.join('\n');
  assert.ok(logs.length > 0, 'os erros são logados (só o tipo)');
  for (const s of segredos) assert.ok(!tudo.includes(s), 'log com dado do pagador: ' + s);
  assert.ok(!tudo.includes('tok-'), 'o token nunca vai ao log');
});

test('pagamentos desligados neste ambiente: 503 sem detalhe, sem chamar nada', async () => {
  const t = criarTestePix({ config: () => ({ ativo: false, motivo: 'MP_AMBIENTE não definido' }) });
  const r = await post({ teste_pix: PAGADOR }, { deps: { testePix: t } });
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.corpo).includes('MP_AMBIENTE'));
});

/* ======================= isolamento ======================= */
function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, acc); else if (/\.(mjs|js)$/.test(nome)) acc.push(p);
  }
  return acc;
}
test('isolamento: só api/painel.mjs importa o módulo de teste; nada do caminho do cliente o toca nem fala do valor de teste', () => {
  const api = pasta('api/');
  const quem = arquivos(api).filter(f => /teste-pix/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')) && !f.endsWith('teste-pix.mjs'));
  assert.deepEqual(quem.map(f => relative(api, f).replaceAll('\\', '/')), ['painel.mjs']);
  const worker = readFileSync(new URL('cloudflare/rotas.mjs', RAIZ), 'utf8');
  assert.ok(!/teste-pix/.test(worker), 'a rota do cliente do Worker não conhece o módulo');
  for (const f of ['api/vendas.mjs', 'api/pagamentos.mjs', 'api/_pagamentos/servico.mjs', 'api/_pagamentos/mercadopago.mjs', 'api/_pagamentos/config.mjs']) {
    const s = readFileSync(new URL(f, RAIZ), 'utf8');
    assert.ok(!/teste-pix|VALOR_CENTAVO|BZ_TESTE_PIX/.test(s), f + ' não pode conhecer o teste');
  }
  const vendas = arquivos(pasta('api/_vendas/'));
  for (const f of vendas) assert.ok(!/teste-pix|BZ_TESTE_PIX/.test(readFileSync(f, 'utf8')), f);
});

test('isolamento: o código do servidor só conhece o prefixo TESTE- em servico.mjs (ignorar) e no módulo de teste', () => {
  const quem = arquivos(pasta('api/')).filter(f => /['"`]TESTE-/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(quem.map(f => f.replaceAll('\\', '/').split('/api/')[1]).sort(), ['_pagamentos/servico.mjs', '_pagamentos/teste-pix.mjs']);
});

test('trava de ligar: BZ_TESTE_PIX vem VAZIA na produção e não é "1" em nenhum outro bloco do wrangler.jsonc', () => {
  const cfg = parse(readFileSync(new URL('wrangler.jsonc', RAIZ), 'utf8'));
  assert.equal(cfg.vars.BZ_TESTE_PIX, '', 'produção: vazia (desligada) por padrão');
  for (const vars of [cfg.env.previa.vars, cfg.env.previa.previews.vars]) assert.notEqual(vars.BZ_TESTE_PIX, '1');
});
