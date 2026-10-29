/* A fronteira do backend: /api/leads (autenticação, validação, autorização, erros) e o acesso às métricas
   (esquema metricas, chave secreta só ali). O Supabase é simulado no fetch; o que ele faria com o RLS está
   provado em banco.test.mjs. Aqui se prova o que a API faz ANTES e EM VOLTA do banco.  npm run testar */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { listar, criar } from '../../api/leads.mjs';
import { validarNovoLead, normalizarTelefone } from '../../api/_valida-app.mjs';
import { banco } from '../../api/_banco.mjs';
import { criarFreio, ipDe } from '../../api/_freio.mjs';
import { chaveDoIp } from '../../api/_vendas/ip.mjs';
import { isIP } from 'node:net';
import { atender } from '../../api/vendas.mjs';
import { criarVisitantes } from '../../api/_vendas/visitante.mjs';
import { executar as rotinas } from '../../api/rotinas.mjs';

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
      if (simulacao.user) return simulacao.user();
      return h.authorization === 'Bearer ' + TOKEN_A ? Response.json({ id: A }) : new Response('{"msg":"bad jwt"}', { status: 401 });
    }
    /* o login anônimo e a renovação do visitante (api/_vendas/visitante.mjs) */
    const sessaoA = () => Response.json({ access_token: TOKEN_A, refresh_token: 'refresh-A', expires_at: AGORA_S + 3600, user: { id: A } });
    if (u.pathname === '/auth/v1/signup') return simulacao.signup ? simulacao.signup() : sessaoA();
    if (u.pathname === '/auth/v1/token') return simulacao.token ? simulacao.token() : sessaoA();
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

/* (auditoria 2026-10-09, segurança 4) quem tem IPv6 tem um /64 inteiro e troca os 64 bits finais à vontade: o freio
   conta pelo prefixo /64, como o freio diário do banco (api/_vendas/ip.mjs). IPv4 fica igual. */
test('freio: IPv6 conta pelo prefixo /64; IPv4 e IPv4 mapeado contam pelo endereço', async () => {
  const de = xff => ipDe(new Request('https://site.test/', { headers: xff ? { 'x-forwarded-for': xff } : {} }));
  assert.equal(de('203.0.113.9'), '203.0.113.9');
  assert.equal(de('203.0.113.9, 10.0.0.1'), '203.0.113.9', 'o primeiro da lista (o da Vercel)');
  assert.equal(de(null), 'local');
  assert.equal(de('::ffff:203.0.113.9'), '203.0.113.9', 'IPv4 mapeado é o próprio IPv4 (senão todos caíam no mesmo /64 ::ffff)');
  const mesmaCasa = ['2001:db8:a:b:c:d:e:f', '2001:DB8:A:B::1', '2001:0db8:000a:000b:ffff::2'].map(de);
  assert.equal(new Set(mesmaCasa).size, 1, 'o mesmo /64 é uma chave só: ' + mesmaCasa.join(' | '));
  assert.notEqual(de('2001:db8:a:c::1'), mesmaCasa[0], 'outro /64, outra chave');
  assert.equal(isIP(mesmaCasa[0]), 6, 'a chave continua um IPv6 válido (o freio diário do banco a usa)');
  const dia = new Date('2026-10-09T12:00:00Z');
  assert.equal(chaveDoIp(de('2001:db8:a:b::99'), 'segredo', dia), chaveDoIp('2001:db8:a:b:1:2:3:4', 'segredo', dia), 'o freio diário dá a mesma chave');
  const freado = criarFreio({ max: 3, janelaMs: 60e3 });
  const resultados = [1, 2, 3, 4].map(n => freado(de('2001:db8:a:b::' + n.toString(16)), 0));
  assert.deepEqual(resultados, [false, false, false, true], 'trocar o fim do IPv6 não escapa do freio');
});

/* (revisão final do PR 2a, M3b) na Vercel, o x-vercel-forwarded-for é o valor que a plataforma garante; o x-forwarded-for
   fica só como reserva. O cf-connecting-ip NÃO é lido aqui: é a pendência PR2a-cloudflare (só com a origem restrita) */
test('freio: ipDe prefere o x-vercel-forwarded-for; sem ele, o x-forwarded-for; o cf-connecting-ip ainda não vale', () => {
  const de = h => ipDe(new Request('https://site.test/', { headers: h }));
  assert.equal(de({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' }), '203.0.113.7');
  assert.equal(de({ 'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1' }), '203.0.113.7', 'o primeiro da lista');
  assert.equal(de({ 'x-forwarded-for': '198.51.100.9' }), '198.51.100.9', 'sem o da Vercel, o x-forwarded-for');
  assert.equal(de({ 'x-vercel-forwarded-for': '2001:db8:a:b::1', 'x-forwarded-for': '198.51.100.9' }), '2001:db8:a:b::', 'com as mesmas regras (/64)');
  assert.equal(de({ 'cf-connecting-ip': '192.0.2.5', 'x-forwarded-for': '198.51.100.9' }), '198.51.100.9', 'cf-connecting-ip não é lido (PR2a-cloudflare)');
  assert.equal(de({}), 'local');
});

/* (revisão de segurança do lote 1) as outras formas de escrever IPv4 dentro do IPv6, e os endereços com os 64 bits
   iniciais zerados, não podem cair todos na mesma chave "0:0:0:0::" (um visitante frearia todos os outros) */
test('freio: IPv4 mapeado em qualquer forma é o IPv4; endereço com prefixo zerado não vira /64', () => {
  const de = xff => ipDe(new Request('https://site.test/', { headers: { 'x-forwarded-for': xff } }));
  for (const forma of ['::ffff:c000:201', '0:0:0:0:0:ffff:192.0.2.1', '::FFFF:192.0.2.1', '::ffff:192.0.2.1%eth0', '64:ff9b::c000:201', '64:ff9b::192.0.2.1']) {
    assert.equal(de(forma), '192.0.2.1', forma);
  }
  assert.notEqual(de('::ffff:c000:201'), de('::ffff:c000:202'), 'IPv4 diferentes, chaves diferentes');
  const zerados = ['::1', '::2', '::192.0.2.1', '::192.0.2.2', '::ffff:0:c000:201', '::ffff:0:c000:202'].map(de);
  assert.equal(new Set(zerados).size, zerados.length, 'prefixo zerado: cada endereço é uma chave: ' + zerados.join(' | '));
  assert.ok(zerados.every(z => isIP(z) === 6), 'e continua um IPv6 válido');
  assert.equal(de('fe80::1%eth0'), de('fe80::2'), 'a zona sai; o /64 vale como para qualquer IPv6');
  const dia = new Date('2026-10-09T12:00:00Z');
  assert.equal(chaveDoIp('::ffff:c000:201', 'k', dia), chaveDoIp('192.0.2.1', 'k', dia), 'o freio diário também lê o IPv4 mapeado');
  assert.notEqual(chaveDoIp(de('::1'), 'k', dia), chaveDoIp(de('::2'), 'k', dia), 'e não junta os de prefixo zerado');
});

/* ======================= o visitante do orçamento: Auth instável não é "sessão expirada" ======================= */
/* (auditoria 2026-10-09, funcionalidades 5 e 7) 429 e 5xx do Supabase viravam 401 "sessão expirada" (o navegador
   jogava a conversa fora) e a falha do login anônimo virava 500 "Erro interno.". */
let ipVisitante = 0;
async function vendas(metodo, acao, { corpo, token, query = '' } = {}) {
  const deps = { banco: async () => ({ conversa_id: O1 }), visitantes: criarVisitantes(ENV), ia: null };
  const r = await atender(new Request('https://site.test/api/vendas?acao=' + acao + query, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { 'x-forwarded-for': '192.0.2.' + (++ipVisitante), ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
  }), {}, metodo, deps);
  return { status: r.status, corpo: await r.json() };
}
const falha = status => () => new Response('{"msg":"x"}', { status });

test('visitante: o login anônimo falhando (429, 5xx, rede) é 503 com mensagem humana, nunca 500', async () => {
  assert.equal((await vendas('POST', 'sessao', { corpo: {} })).status, 200, 'o caminho normal');
  for (const [nome, simular] of [['429', falha(429)], ['500', falha(500)], ['503', falha(503)], ['rede', () => { throw new TypeError('fetch failed'); }]]) {
    simulacao.signup = simular;
    const r = await vendas('POST', 'sessao', { corpo: {} });
    assert.equal(r.status, 503, nome + ': ' + JSON.stringify(r.corpo));
    assert.equal(r.corpo.recuperavel, true, nome + ': dá para tentar de novo');
    assert.match(r.corpo.erro, /tente de novo/i, nome + ': mensagem humana');
    assert.ok(!/interno|HTTP|supabase/i.test(r.corpo.erro), nome + ': sem detalhe interno: ' + r.corpo.erro);
  }
  assert.ok(logs.some(l => l.includes('login anônimo recusado: HTTP 503')), 'o motivo técnico fica no log para a equipe');
});

test('visitante: só a recusa do token (400/401) é "sessão expirada"; 429 e 5xx são 503 recuperável', async () => {
  assert.equal((await vendas('POST', 'renovar', { corpo: { refresh: 'refresh-A' } })).status, 200, 'o caminho normal');
  for (const s of [400, 401]) {
    simulacao.token = falha(s);
    const r = await vendas('POST', 'renovar', { corpo: { refresh: 'refresh-A' } });
    assert.equal(r.status, 401, s + ': o Supabase recusou o refresh, a sessão acabou');
  }
  for (const s of [429, 500, 502, 503]) {
    simulacao.token = falha(s);
    const r = await vendas('POST', 'renovar', { corpo: { refresh: 'refresh-A' } });
    assert.equal(r.status, 503, s + ': Auth instável não é sessão expirada: ' + JSON.stringify(r.corpo));
    assert.equal(r.corpo.recuperavel, true);
  }
  /* a conferência do token em cada ação: Auth fora do ar também é 503, não 500 */
  simulacao.authFora = true;
  const e = await vendas('GET', 'estado', { token: TOKEN_A, query: '&conversa=' + O1 });
  assert.equal(e.status, 503, 'Auth fora do ar na conferência do token: ' + JSON.stringify(e.corpo));
  assert.equal(e.corpo.recuperavel, true);
  simulacao.authFora = false;
  assert.equal((await vendas('GET', 'estado', { token: TOKEN_FALSO, query: '&conversa=' + O1 })).status, 401, 'token recusado continua 401');
});

/* (revisão técnica do lote 1) o Supabase também recusa refresh com 403 e 422; e o login anônimo DESLIGADO no painel
   (422 anonymous_provider_disabled) não se resolve tentando de novo: a pessoa vai para o WhatsApp e o log diz o porquê */
test('visitante: refresh recusado com 403/422 encerra a sessão; login anônimo desligado não manda "tentar de novo"', async () => {
  for (const s of [403, 422]) {
    simulacao.token = falha(s);
    assert.equal((await vendas('POST', 'renovar', { corpo: { refresh: 'refresh-A' } })).status, 401, s + ': recusa do refresh');
  }
  for (const s of [400, 403, 404, 422]) {
    simulacao.signup = falha(s);
    const r = await vendas('POST', 'sessao', { corpo: {} });
    assert.equal(r.status, 503, s + ': ' + JSON.stringify(r.corpo));
    assert.equal(r.corpo.recuperavel, undefined, s + ': tentar de novo não resolve configuração');
    assert.equal(r.corpo.recado, true, s + ': a saída é o WhatsApp');
    assert.ok(!/HTTP|supabase|anonymous/i.test(r.corpo.erro), s + ': sem detalhe interno: ' + r.corpo.erro);
  }
  assert.ok(logs.some(l => /login anônimo desligado ou mal configurado.*HTTP 422/.test(l)), 'o log diz o que conferir no Supabase: ' + logs.join('\n'));
});

/* (revisão de segurança do lote 1) só falha de REDE do fetch vira "Auth instável"; erro de programação continua erro
   interno (500 com log), para não ficar escondido atrás de um 503 "tente de novo" */
test('visitante: na conferência do token, só a falha de rede é 503; erro de código é 500 com log', async () => {
  simulacao.user = () => { throw new TypeError('fetch failed'); };
  const rede = await vendas('GET', 'estado', { token: TOKEN_A, query: '&conversa=' + O1 });
  assert.equal(rede.status, 503, 'rede: ' + JSON.stringify(rede.corpo));
  assert.equal(rede.corpo.recuperavel, true);
  simulacao.user = () => { throw new RangeError('bug no código'); };
  const bug = await vendas('GET', 'estado', { token: TOKEN_A, query: '&conversa=' + O1 });
  assert.equal(bug.status, 500, 'erro de código: ' + JSON.stringify(bug.corpo));
  assert.ok(logs.some(l => l.includes('bug no código')), 'o erro de código fica no log');
  simulacao.signup = () => { throw new RangeError('bug no login'); };
  assert.equal((await vendas('POST', 'sessao', { corpo: {} })).status, 500, 'o mesmo no login anônimo');
});

/* A8, passo 4 (migração para a Cloudflare, plano grátis: 50 subpedidos por invocação): a rotina diária conta cada chamada ao
   banco, às métricas e ao ntfy e PARA no orçamento; a etapa que ficou sem orçamento vira alerta (a falha que o
   rotinas_conferir recebe), nunca silêncio. O orçamento aqui é pequeno de propósito (5, com 3 guardados para o fim): são
   mais etapas do que cabem. Com o orçamento de verdade (45) a rotina de hoje cabe inteira (testes em auditoria-p0/p1) */
test('rotina diária: nunca passa do orçamento de subpedidos; a etapa sem orçamento vira alerta e o resumo diz parcial', async () => {
  let chamadas = 0;
  const conta = fn => async (...a) => { chamadas++; return fn(...a); };
  const vistos = [], falhasVistas = [];
  const banco = conta(async (nome, args) => {
    vistos.push(nome);
    if (nome === 'rotinas_conferir') { falhasVistas.push(args.falha); return { alertas: [{ nivel: 'aviso', tipo: 'rotina', mensagem: 'a rotina falhou' }], avisar: true }; }
    return {};
  });
  const metricas = { ligado: true, apagarAntigos: conta(async () => {}) };
  const enviarAlerta = conta(async () => {});
  const env = { CRON_SECRET: 'c'.repeat(40), ALERTA_NTFY_TOPICO: 'a'.repeat(24) };
  const r = await rotinas(new Request('http://x/api/rotinas?acao=diaria', { headers: { authorization: 'Bearer ' + env.CRON_SECRET } }), env, { banco, metricas, enviarAlerta, orcamento: 5 });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.ok(chamadas <= 5, 'subpedidos: ' + chamadas);
  assert.equal(corpo.parcial, true);
  assert.equal(corpo.ok, false, 'uma etapa ficou sem orçamento: não é "ok"');
  assert.ok(vistos.includes('rotinas_conferir'), 'a conferência da saúde roda sempre (usa a reserva)');
  assert.match(falhasVistas[0] || '', /sem orçamento/, 'a etapa que não coube chega ao rotinas_conferir como falha (alerta)');
});

/* A10 (migração para a Cloudflare): sem isto o Supabase Auth vê o IP da Cloudflare em todo login anônimo e o limite por IP
   dele (30 por hora por IP) viraria um balde compartilhado por todos os visitantes */
test('Auth: criar e renovar levam o IP do visitante (Sb-Forwarded-For) com a chave secreta', async () => {
  const vistos = [];
  const salvo = globalThis.fetch;
  globalThis.fetch = async (url, op) => { vistos.push({ url: String(url), h: op.headers }); return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u' } }), { status: 200 }); };
  try {
    /* (fora do local: o servidor local confia no x-forwarded-for do cliente e nunca manda a chave secreta nem o IP ao Auth) */
    const env = { VERCEL: '1', VERCEL_ENV: 'production', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_CHAVE_PUBLICA: 'sb_publishable_x', SUPABASE_CHAVE_SECRETA: 'sb_secret_y' };
    const v = criarVisitantes(env, { ip: '203.0.113.7' });
    await v.criar(); await v.renovar('abc');
    assert.equal(vistos.length, 2);
    for (const c of vistos) { assert.equal(c.h['sb-forwarded-for'], '203.0.113.7'); assert.equal(c.h.apikey, 'sb_secret_y'); }
    vistos.length = 0;
    await criarVisitantes(env, {}).criar();
    assert.equal(vistos[0].h['sb-forwarded-for'], undefined, 'sem IP: sem o cabeçalho, chave publicável');
    assert.equal(vistos[0].h.apikey, 'sb_publishable_x');
    vistos.length = 0;
    await criarVisitantes(env, { ip: '2001:db8:a:b::1' }).criar();
    assert.equal(vistos[0].h['sb-forwarded-for'], '2001:db8:a:b::', 'IPv6 pelo /64, como nos freios do site');
    vistos.length = 0;
    await criarVisitantes(env, { ip: 'lixo' }).criar();
    assert.equal(vistos[0].h['sb-forwarded-for'], undefined, 'IP que não é IP: sem o cabeçalho');
    assert.equal(vistos[0].h.apikey, 'sb_publishable_x', 'e sem a chave secreta');
    vistos.length = 0;
    const { VERCEL, VERCEL_ENV, ...local } = env;
    await criarVisitantes(local, { ip: '203.0.113.7' }).criar();
    assert.equal(vistos[0].h['sb-forwarded-for'], undefined, 'servidor local: nunca o IP do cliente (confia no x-forwarded-for) nem a chave secreta');
    assert.equal(vistos[0].h.apikey, 'sb_publishable_x');
    vistos.length = 0;
    await criarVisitantes({ ...env, SUPABASE_CHAVE_SECRETA: undefined }, { ip: '203.0.113.7' }).criar();
    assert.equal(vistos[0].h['sb-forwarded-for'], undefined, 'sem a chave secreta nunca há o cabeçalho (a doc só o aceita com ela)');
    assert.equal(vistos[0].h.apikey, 'sb_publishable_x');
  } finally { globalThis.fetch = salvo; }
});

/* BAIXO-3 da revisão do PR A: o IP chega ao Auth pelo caminho de verdade (atender sem deps), não só por criarVisitantes direto */
test('atender sem deps: o IP do pedido (x-vercel-forwarded-for) vai ao login anônimo do Auth como Sb-Forwarded-For', async () => {
  const vistos = [];
  const salvo = globalThis.fetch;
  globalThis.fetch = async (url, op) => { vistos.push({ url: String(url), h: op.headers }); return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u' } }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const env = { VERCEL: '1', VERCEL_ENV: 'preview', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_CHAVE_PUBLICA: 'sb_publishable_x', SUPABASE_CHAVE_SECRETA: 'sb_secret_y' };
    await atender(new Request('http://x/api/vendas?acao=sessao', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.9' } }), env, 'POST').catch(() => {});
    const signup = vistos.find(c => c.url.endsWith('/auth/v1/signup'));
    assert.ok(signup, 'o login anônimo foi chamado');
    assert.equal(signup.h['sb-forwarded-for'], '203.0.113.9');
    assert.equal(signup.h.apikey, 'sb_secret_y');
  } finally { globalThis.fetch = salvo; }
});
