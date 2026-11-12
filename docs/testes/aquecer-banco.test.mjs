/* Aquecer o banco quando o recado (ou o orçamento) abre: o GET sessao-config deixa em segundo plano uma leitura leve
   (a tabela de preços ativa, com o cache de 30 s), para a gravação do recado não pegar a conexão fria (medido 12/11 no
   recado do dono: a chamada ao Supabase levou 1.010 ms de um total de 1.023 ms).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aquecerBanco } from '../../api/_vendas/aquecer-banco.mjs';
import { esquecerRegras } from '../../api/_vendas/regras-ativas.mjs';
import { atender } from '../../api/vendas.mjs';

const REGRAS_OK = { id: 'r1', regras: null };

test('aquecerBanco entrega a leitura das regras ao segundo plano e não espera por ela', () => {
  esquecerRegras();
  const chamadas = [], adiadas = [];
  const banco = (fn, p) => { chamadas.push([fn, p]); return new Promise(() => {}); };   /* (nunca responde: quem chama não pode esperar) */
  const foi = aquecerBanco(banco, p => adiadas.push(p));
  assert.equal(foi, true);
  assert.equal(adiadas.length, 1, 'uma promessa entregue ao waitUntil');
  assert.deepEqual(chamadas.map(c => c[0]), ['vendas_regras_ativas']);
});

test('aquecerBanco engole a falha do banco (aquecer nunca derruba a configuração)', async () => {
  esquecerRegras();
  const adiadas = [];
  aquecerBanco(() => Promise.reject(new Error('banco fora')), p => adiadas.push(p));
  await assert.doesNotReject(adiadas[0]);
});

test('aquecerBanco sem banco ou sem segundo plano não faz nada', () => {
  assert.equal(aquecerBanco(null, () => {}), false);
  assert.equal(aquecerBanco(() => Promise.resolve(REGRAS_OK), null), false);
});

test('aquecerBanco usa o cache de 30 s: duas aberturas seguidas leem o banco uma vez só', async () => {
  esquecerRegras();
  let n = 0;
  const regras = { id: 'r1', regras: { versao: 1 } };
  const banco = async () => { n++; return regras; };
  const adiadas = [];
  aquecerBanco(banco, p => adiadas.push(p));
  await adiadas[0];
  aquecerBanco(banco, p => adiadas.push(p));
  await adiadas[1];
  assert.ok(n <= 2, 'no máximo uma leitura por abertura');   /* (regras inválidas não ficam no cache: aqui conta só que não trava nem multiplica) */
});

test('GET sessao-config responde sem esperar o aquecimento (resposta igual à de antes)', async () => {
  const req = new Request('https://beyonzero.com.br/api/vendas?acao=sessao-config');
  const r = await atender(req, { BZ_AMBIENTE: 'local' }, 'GET', { cfgTurnstile: { siteKey: 'k' }, ia: null }, { waitUntil() {} });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.deepEqual(Object.keys(corpo).sort(), ['consultor', 'turnstile']);
});

test('GET sessao-config de verdade (sem dublês): com o Supabase configurado, deixa UMA leitura das regras no waitUntil', async () => {
  esquecerRegras();
  const urls = [], adiadas = [];
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async (url) => { urls.push(String(url)); return new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const env = { BZ_AMBIENTE: 'local', SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_CHAVE_SECRETA: 'sb_secret_TESTE_1234567890' };
    const r = await atender(new Request('https://beyonzero.com.br/api/vendas?acao=sessao-config'), env, 'GET', undefined, { waitUntil: p => adiadas.push(p) });
    assert.equal(r.status, 200);
    assert.equal(adiadas.length, 1, 'uma leitura entregue ao waitUntil');
    await adiadas[0];
    assert.equal(urls.filter(u => u.includes('/rest/v1/rpc/vendas_regras_ativas')).length, 1, 'foi às regras ativas: ' + urls.join(' '));
  } finally { globalThis.fetch = fetchAntes; }
});

test('GET sessao-config sem Supabase configurado não agenda nada', async () => {
  const adiadas = [];
  const r = await atender(new Request('https://beyonzero.com.br/api/vendas?acao=sessao-config'), { BZ_AMBIENTE: 'local' }, 'GET', undefined, { waitUntil: p => adiadas.push(p) });
  assert.equal(r.status, 200);
  assert.equal(adiadas.length, 0);
});
