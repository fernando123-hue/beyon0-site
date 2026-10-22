/* O LINK DO PEDIDO pela API (PR 3b-2): o código sai UMA vez, o link é fixo, abrir cria a sessão do aparelho novo (como a
   retomada: anti-robô e o freio de criação de sessão por IP), "gerar novo" e "sair" revogam, "outro aparelho" dá a
   retomada de 7 dias, e o código nunca vai para log nem para resposta além da criação.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { criarCenario, BASE } from './_ajustes.mjs';
import { ateEntregaCriada } from './_entrega.mjs';
import { ACOES } from '../../api/vendas.mjs';
import { CODIGO_LINK, hashDoLink, novoCodigoLink } from '../../api/_vendas/link-pedido.mjs';
import { hashDaRetomada } from '../../api/_vendas/retomada.mjs';
import { criarVisitantes } from '../../api/_vendas/visitante.mjs';
import { AuthIndisponivel } from '../../api/_supabase.mjs';

let local, cen;
before(async () => { local = await montarLocal({ base: BASE }); cen = criarCenario(local); });
/* (um navegador com o interruptor da entrega ligado e o armazém local) */
const novoNav = () => cen.navegador({ env: { BZ_ENTREGA: 'ligada' }, armazem: local.armazem });

test('o código: 32 caracteres sorteados (192 bits), hash com prefixo próprio (não vale como o hash da retomada)', () => {
  const a = novoCodigoLink(), b = novoCodigoLink();
  assert.match(a, CODIGO_LINK); assert.notEqual(a, b);
  assert.match(hashDoLink(a), /^[0-9a-f]{64}$/);
  assert.notEqual(hashDoLink('x'.repeat(32)), hashDaRetomada('x'.repeat(32)), 'o prefixo próprio: o mesmo texto não vale como hash de outra coisa');
});

test('as quatro ações existem, são POST, e abrir-pedido cria sessão (como retomar)', () => {
  for (const a of ['link-pedido', 'sair-do-aparelho', 'outro-aparelho', 'abrir-pedido']) assert.ok(Object.hasOwn(ACOES.POST, a), a);
});

test('link-pedido: o código volta UMA vez; pedir de novo não troca; novo=true troca e o anterior morre', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const um = await n.chamar('POST', 'link-pedido', { conversa_id: c });
  assert.equal(um.status, 200); assert.equal(um.corpo.criado, true); assert.match(um.corpo.codigo, CODIGO_LINK);
  const dois = await n.chamar('POST', 'link-pedido', { conversa_id: c });
  assert.deepEqual(dois.corpo, { criado: false }, 'o código em claro nunca volta');
  assert.equal((await cen.estado(n, c)).entrega.link_pedido, true);
  const novo = await n.chamar('POST', 'link-pedido', { conversa_id: c, novo: true });
  assert.equal(novo.corpo.criado, true); assert.notEqual(novo.corpo.codigo, um.corpo.codigo);
  const m2 = novoNav();
  assert.equal((await m2.chamar('POST', 'abrir-pedido', { codigo: um.corpo.codigo })).status, 410, 'o link antigo parou');
});

test('abrir-pedido: cria a sessão do aparelho novo, devolve a conversa, e abre de novo e de novo (fixo)', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const { codigo } = (await n.chamar('POST', 'link-pedido', { conversa_id: c })).corpo;
  for (let i = 0; i < 3; i++) {
    const m = novoNav();
    const r = await m.chamar('POST', 'abrir-pedido', { codigo });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.deepEqual(Object.keys(r.corpo).sort(), ['conversa_id', 'expira_em', 'refresh', 'token']);
    assert.equal(r.corpo.conversa_id, c);
    assert.ok(!JSON.stringify(r.corpo).includes(codigo), 'a resposta não repete o código');
  }
  assert.equal((await novoNav().chamar('POST', 'abrir-pedido', { codigo: 'curto' })).status, 400);
  assert.equal((await novoNav().chamar('POST', 'abrir-pedido', { codigo: novoCodigoLink() })).status, 410);
  assert.equal((await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).status, 404, 'o aparelho antigo perdeu o acesso');
});

test('abrir-pedido pelo mesmo IP: depois de 8 criações de sessão em 10 minutos, 429 (o freio da criação de sessão)', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const { codigo } = (await n.chamar('POST', 'link-pedido', { conversa_id: c })).corpo;
  const m = novoNav();
  const resultados = [];
  for (let i = 0; i < 10; i++) resultados.push((await m.chamar('POST', 'abrir-pedido', { codigo: novoCodigoLink() })).status);
  assert.ok(resultados.includes(429), resultados.join(','));
  assert.ok(codigo);
});

test('sair-do-aparelho revoga o link; outro-aparelho dá a retomada de 7 dias (uso único) e o código volta uma vez', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const { codigo } = (await n.chamar('POST', 'link-pedido', { conversa_id: c })).corpo;
  const outro = await n.chamar('POST', 'outro-aparelho', { conversa_id: c });
  assert.equal(outro.status, 200); assert.match(outro.corpo.codigo, /^[A-Za-z0-9_-]{32}$/); assert.ok(outro.corpo.expira_em);
  const m = novoNav();
  assert.equal((await m.chamar('POST', 'retomar', { codigo: outro.corpo.codigo })).status, 200, 'a retomada do PR 2b-2 abre a entrega');
  const n2 = novoNav();
  const aberto = await n2.chamar('POST', 'abrir-pedido', { codigo });
  assert.equal(aberto.status, 200); n2.adotar(aberto.corpo);   /* (o aparelho novo passa a usar a sessão que o link deu) */
  const sair = await n2.chamar('POST', 'sair-do-aparelho', { conversa_id: c });
  assert.equal(sair.status, 200);
  assert.equal((await n2.chamar('GET', 'estado', undefined, '&conversa=' + c)).status, 401, 'a sessão deste aparelho também terminou');
  assert.equal((await novoNav().chamar('POST', 'abrir-pedido', { codigo })).status, 410, 'depois de sair, o link não abre');
});

test('outro visitante não cria, não sai e não pede outro aparelho (404); sem entrada paga, 409', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const outro = novoNav(); await outro.iniciar();
  for (const acao of ['link-pedido', 'sair-do-aparelho', 'outro-aparelho']) assert.equal((await outro.chamar('POST', acao, { conversa_id: c })).status, 404, acao);
  const antes = novoNav(); const cc = await antes.iniciar();
  assert.equal((await antes.chamar('POST', 'link-pedido', { conversa_id: cc })).status, 409);
  assert.ok(n);
});

test('o código do link nunca aparece em log', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const logs = []; const orig = { e: console.error, l: console.log };
  console.error = (...a) => logs.push(a.join(' ')); console.log = (...a) => logs.push(a.join(' '));
  let codigo;
  try { codigo = (await n.chamar('POST', 'link-pedido', { conversa_id: c })).corpo.codigo; await novoNav().chamar('POST', 'abrir-pedido', { codigo }); await novoNav().chamar('POST', 'abrir-pedido', { codigo: novoCodigoLink() }); }
  finally { console.error = orig.e; console.log = orig.l; }
  assert.ok(!logs.join('\n').includes(codigo), logs.join(' | '));
});

test('M1: depois de "Sair deste aparelho" o MESMO navegador perde a sessão (401), não só o link', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const { codigo } = (await n.chamar('POST', 'link-pedido', { conversa_id: c })).corpo;
  assert.equal((await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).status, 200);
  assert.equal((await n.chamar('POST', 'sair-do-aparelho', { conversa_id: c })).status, 200);
  assert.equal((await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).status, 401, 'o token antigo deixou de valer na hora');
  assert.equal((await novoNav().chamar('POST', 'abrir-pedido', { codigo })).status, 410, 'e o link guardado também');
});

test('M1: visitantes.sair chama POST /auth/v1/logout?scope=global com o token do próprio visitante e a chave PÚBLICA; 401/403 = já estava; 5xx sobe', async () => {
  const UUID = '11111111-1111-4111-8111-111111111111';
  const token = ['e30', Buffer.from(JSON.stringify({ sub: UUID, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'assinatura'].join('.');
  const pedido = new Request('http://x/api/vendas', { method: 'POST', headers: { authorization: 'Bearer ' + token } });
  const visitantes = criarVisitantes({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_CHAVE_PUBLICA: 'chave-publica-de-teste' });
  const original = globalThis.fetch; const vistos = [];
  try {
    for (const [status, esperado] of [[204, true], [403, true], [401, true]]) {
      globalThis.fetch = async (url, o) => { vistos.push({ url: String(url), metodo: o.method, cab: o.headers }); return new Response(null, { status }); };
      assert.equal(await visitantes.sair(pedido), esperado, String(status));
    }
    assert.equal(vistos[0].url, 'https://p.supabase.co/auth/v1/logout?scope=global');
    assert.equal(vistos[0].metodo, 'POST');
    assert.equal(vistos[0].cab.authorization, 'Bearer ' + token); assert.equal(vistos[0].cab.apikey, 'chave-publica-de-teste');
    globalThis.fetch = async () => new Response(null, { status: 500 });
    await assert.rejects(visitantes.sair(pedido), AuthIndisponivel);
    globalThis.fetch = async () => { throw new Error('não podia chamar'); };
    assert.equal(await visitantes.sair(new Request('http://x/api/vendas', { method: 'POST' })), false, 'sem token, nada a encerrar');
  } finally { globalThis.fetch = original; }
});
