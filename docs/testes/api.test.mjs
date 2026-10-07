/* A fronteira do backend: /api/leads (autenticação, validação, autorização, erros) e o acesso às métricas
   (esquema metricas, chave secreta só ali). O Supabase é simulado no fetch; o que ele faria com o RLS está
   provado em banco.test.mjs. Aqui se prova o que a API faz ANTES e EM VOLTA do banco.  npm run testar */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { listar, criar } from '../../api/leads.mjs';
import { validarNovoLead, normalizarTelefone } from '../../api/_valida-app.mjs';
import { banco } from '../../api/_banco.mjs';

const ENV = { SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_CHAVE_PUBLICA: 'sb_publishable_teste', SUPABASE_CHAVE_SECRETA: 'sb_secret_NUNCA_NO_USUARIO' };
const O1 = '11111111-0000-4000-8000-000000000001', O2 = '22222222-0000-4000-8000-000000000002';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
/* JWTs com a forma real (sub = uuid, exp): a assinatura é do Supabase Auth, que aqui só conhece a do TOKEN_A */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (carga, assinatura) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(carga) + '.' + assinatura;
const AGORA_S = Math.floor(Date.now() / 1000);
const TOKEN_A = jwt({ sub: A, exp: AGORA_S + 3600, role: 'authenticated' }, 'assinatura-valida-A');
const TOKEN_FALSO = jwt({ sub: A, exp: AGORA_S + 3600, role: 'authenticated' }, 'assinatura-forjada');
const TOKEN_EXPIRADO = jwt({ sub: A, exp: AGORA_S - 60, role: 'authenticated' }, 'assinatura-valida-A');

let chamadas, logs, fetchOriginal, erroOriginal, simulacao;
beforeEach(() => {
  chamadas = []; logs = []; simulacao = {};
  fetchOriginal = globalThis.fetch; erroOriginal = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  /* o Supabase falso: Auth conhece o TOKEN_A (usuário A, membro só da O1); o PostgREST responde como o RLS responderia */
  globalThis.fetch = async (url, op = {}) => {
    const h = op.headers || {};
    chamadas.push({ url: String(url), metodo: op.method || 'GET', h, corpo: op.body });
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') {
      if (simulacao.authFora) return new Response('x', { status: 500 });
      return h.authorization === 'Bearer ' + TOKEN_A ? Response.json({ id: A }) : new Response('{"msg":"bad jwt"}', { status: 401 });
    }
    if (u.pathname === '/rest/v1/membros') return Response.json(u.search.includes('org_id=eq.' + O1) ? [{ papel: 'dono' }] : []);
    if (u.pathname === '/rest/v1/leads' && op.method === 'POST') {
      const corpo = JSON.parse(op.body);
      if (corpo.codigo_visita === 'XXXXX') return Response.json({ code: '23505', message: 'duplicate key value violates unique constraint "leads_codigo_visita" Key (org_id, codigo_visita)' }, { status: 409 });
      if (simulacao.bancoQuebrado) return Response.json({ code: 'XX000', message: 'detalhe interno do banco com maria@x.com' }, { status: 500 });
      return Response.json([{ id: 'novo-id', ...corpo, status: 'novo' }], { status: 201 });
    }
    if (u.pathname === '/rest/v1/leads') return Response.json([{ id: 'l1', nome: 'Lead 1' }]);
    if (u.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 201 });
    return new Response('?', { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; console.error = erroOriginal; });

const pedido = (metodo, caminho, { token = TOKEN_A, corpo, tipo = 'application/json' } = {}) => new Request('https://site.test/api/leads' + caminho, {
  method: metodo, headers: Object.assign({}, token ? { authorization: 'Bearer ' + token } : {}, corpo !== undefined ? { 'content-type': tipo } : {}),
  body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
});
const usouSecreta = () => chamadas.some(c => JSON.stringify(c.h).includes(ENV.SUPABASE_CHAVE_SECRETA));

/* ======================= autenticação ======================= */
test('autenticação: sem token, token malformado ou expirado = 401; nada chega ao banco', async () => {
  assert.equal((await listar(pedido('GET', '?org=' + O1, { token: null }), ENV)).status, 401);
  assert.equal((await listar(pedido('GET', '?org=' + O1, { token: 'nao-e-jwt' }), ENV)).status, 401);
  assert.equal((await listar(pedido('GET', '?org=' + O1, { token: TOKEN_EXPIRADO }), ENV)).status, 401);
  assert.ok(!chamadas.some(c => c.url.includes('/auth/v1/')), 'vencido e malformado nem gastam o Auth');
  assert.equal((await listar(pedido('GET', '?org=' + O1, { token: TOKEN_FALSO }), ENV)).status, 401, 'assinatura forjada: o Auth recusa');
  assert.ok(!chamadas.some(c => c.url.includes('/rest/v1/')), 'o PostgREST nem foi chamado');
});

test('configuração ausente ou Auth fora do ar = 503 genérico, com o motivo só no log', async () => {
  const r = await listar(pedido('GET', '?org=' + O1), { SUPABASE_URL: 'https://falso.supabase.co' });
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes('SUPABASE'), 'a resposta não revela a configuração');
  assert.ok(logs.some(l => l.includes('SUPABASE_CHAVE_PUBLICA')));
  simulacao.authFora = true;
  assert.equal((await listar(pedido('GET', '?org=' + O1), ENV)).status, 503);
});

/* ======================= validação ======================= */
test('validação: parâmetros e corpo fora da lista fechada = 400 com o campo', async () => {
  assert.equal((await listar(pedido('GET', '?org=nao-uuid'), ENV)).status, 400);
  assert.equal((await listar(pedido('GET', '?org=' + O1 + '&status=ganho%27--'), ENV)).status, 400, 'injeção no filtro');
  assert.equal((await listar(pedido('GET', '?org=' + O1 + '&limite=5000'), ENV)).status, 400);
  const r = await criar(pedido('POST', '', { corpo: { org_id: O1, nome: 'X', status: 'ganho', created_by: A, cliente_id: 'x' } }), ENV);
  assert.equal(r.status, 400);
  const campos = (await r.json()).campos;
  assert.deepEqual(Object.keys(campos).sort(), ['cliente_id', 'created_by', 'status'], 'situação, autoria e cliente não entram pela API');
  assert.equal((await criar(pedido('POST', '', { corpo: '{quebrado' }), ENV)).status, 400);
  assert.equal((await criar(pedido('POST', '', { corpo: 'x'.repeat(9000) }), ENV)).status, 413);
  assert.equal((await criar(pedido('POST', '', { corpo: 'nome=x', tipo: 'application/x-www-form-urlencoded' }), ENV)).status, 415, 'formulário de outro site não passa');
});

test('validação: normaliza e confere contato', () => {
  assert.equal(normalizarTelefone('(21) 97716-7944'), '+5521977167944');
  assert.equal(normalizarTelefone('+55 21 97716-7944'), '+5521977167944');
  assert.equal(normalizarTelefone('123'), null);
  const v = validarNovoLead({ org_id: O1.toUpperCase(), email: ' Maria@X.COM ', codigo_visita: 'k7q4m', nome: '  Maria  ' });
  assert.deepEqual(v.dados, { org_id: O1, nome: 'Maria', email: 'maria@x.com', codigo_visita: 'K7Q4M' });
  assert.ok(validarNovoLead({ org_id: O1 }).erros.contato, 'sem nenhum contato');
  assert.ok(validarNovoLead({ org_id: O1, email: 'sem-arroba' }).erros.email);
  assert.ok(validarNovoLead([]).erros);
});

/* ======================= autorização ======================= */
test('autorização: membro da O1 lista e cria na O1; a O2 (de outro) dá 403 sem tocar nos leads', async () => {
  const ok = await listar(pedido('GET', '?org=' + O1 + '&status=novo'), ENV);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).leads.length, 1);
  const criado = await criar(pedido('POST', '', { corpo: { org_id: O1, nome: 'Maria', telefone: '21 97716-7944' } }), ENV);
  assert.equal(criado.status, 201);
  assert.equal((await criado.json()).lead.telefone, '+5521977167944');
  chamadas = [];
  assert.equal((await listar(pedido('GET', '?org=' + O2), ENV)).status, 403);
  assert.equal((await criar(pedido('POST', '', { corpo: { org_id: O2, nome: 'Intruso' } }), ENV)).status, 403);
  assert.ok(!chamadas.some(c => c.url.includes('/rest/v1/leads')), 'nenhuma chamada aos leads da O2');
});

test('fronteira: em nome do usuário, só a chave PÚBLICA + o JWT dele, no esquema app; nunca a secreta', async () => {
  await criar(pedido('POST', '', { corpo: { org_id: O1, nome: 'Maria' } }), ENV);
  await listar(pedido('GET', '?org=' + O1), ENV);
  assert.ok(!usouSecreta(), 'a chave secreta não saiu em nenhuma chamada');
  for (const c of chamadas.filter(c => c.url.includes('/rest/v1/'))) {
    assert.equal(c.h.apikey, ENV.SUPABASE_CHAVE_PUBLICA);
    assert.equal(c.h.authorization, 'Bearer ' + TOKEN_A);
    assert.equal(c.h['accept-profile'], 'app');
  }
  const post = chamadas.find(c => c.metodo === 'POST');
  assert.equal(JSON.parse(post.corpo).org_id, O1);
  assert.ok(!('created_by' in JSON.parse(post.corpo)), 'a autoria fica para o banco');
});

/* ======================= erros ======================= */
test('erros: conflito vira 409; falha interna vira 500 genérico, e o log não leva token nem dado pessoal', async () => {
  assert.equal((await criar(pedido('POST', '', { corpo: { org_id: O1, codigo_visita: 'XXXXX' } }), ENV)).status, 409);
  simulacao.bancoQuebrado = true;
  const r = await criar(pedido('POST', '', { corpo: { org_id: O1, nome: 'Maria', email: 'maria@x.com' } }), ENV);
  assert.equal(r.status, 500);
  const corpo = await r.text();
  assert.ok(!corpo.includes('maria') && !corpo.includes('banco'), 'a resposta não expõe o erro interno');
  const tudo = logs.join('\n');
  assert.ok(tudo.includes('XX000'), 'o log tem o código para investigar');
  assert.ok(!tudo.includes(TOKEN_A) && !tudo.includes('maria@x.com') && !tudo.includes('sb_'), 'sem token, chave ou dado pessoal no log');
});

/* ======================= métricas: o único uso da chave secreta ======================= */
test('métricas: a chave secreta vai só para o esquema metricas', async () => {
  const db = banco({ SUPABASE_URL: ENV.SUPABASE_URL, SUPABASE_CHAVE_SECRETA: ENV.SUPABASE_CHAVE_SECRETA });
  assert.ok(db.ligado);
  await db.gravarPagina({ id: 'pv-12345678' });
  const c = chamadas.at(-1);
  assert.match(c.url, /\/rest\/v1\/paginas\?on_conflict=id$/);
  assert.equal(c.h.apikey, ENV.SUPABASE_CHAVE_SECRETA);
  assert.equal(c.h['content-profile'], 'metricas');
  assert.equal(c.h.authorization, undefined, 'chave nova não vai no Authorization');
  assert.equal(banco({ SUPABASE_URL: ENV.SUPABASE_URL, SUPABASE_CHAVE: 'nome-antigo' }).ligado, false, 'o nome antigo da variável não liga nada');
});

test('freio: rajada do mesmo IP vira 429 antes de gastar o Auth', async () => {
  const deIp = () => new Request('https://site.test/api/leads?org=' + O1, { headers: { authorization: 'Bearer ' + TOKEN_A, 'x-forwarded-for': '203.0.113.9' } });
  let ultimo;
  for (let i = 0; i < 121; i++) ultimo = await listar(deIp(), ENV);
  assert.equal(ultimo.status, 429);
  const authAntes = chamadas.filter(c => c.url.includes('/auth/v1/')).length;
  await listar(deIp(), ENV);
  assert.equal(chamadas.filter(c => c.url.includes('/auth/v1/')).length, authAntes, 'freado não chama o Auth');
});
