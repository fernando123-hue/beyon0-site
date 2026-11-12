/* Aquecer o banco quando o recado (ou o orçamento) abre: o GET sessao-config deixa em segundo plano uma leitura leve
   (a tabela de preços ativa), para a gravação do recado não pegar a conexão fria (medido 12/11 no recado do dono: a
   chamada ao Supabase levou 1.010 ms de um total de 1.023 ms). No máximo um aquecimento a cada 30 s por instância
   (revisões do PR: rajada, banco fora e GET público em massa não multiplicam leituras).  npm run testar */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { aquecerBanco, esquecerAquecimento } from '../../api/_vendas/aquecer-banco.mjs';
import { esquecerRegras } from '../../api/_vendas/regras-ativas.mjs';
import { atender } from '../../api/vendas.mjs';

const REGRAS_OK = { id: 'r1', regras: null };
const URL_CONFIG = 'https://beyonzero.com.br/api/vendas?acao=sessao-config';

beforeEach(() => { esquecerRegras(); esquecerAquecimento(); });

/* troca o fetch global durante fn; devolve as URLs pedidas */
async function comFetch(falso, fn) {
  const urls = [];
  const antes = globalThis.fetch;
  globalThis.fetch = async (url, ...resto) => { urls.push(String(url)); return falso(url, ...resto); };
  try { await fn(urls); } finally { globalThis.fetch = antes; }
  return urls;
}

/* troca console.warn durante fn; devolve as linhas avisadas */
async function comAvisos(fn) {
  const linhas = [];
  const antes = console.warn;
  console.warn = (...a) => linhas.push(a.join(' '));
  try { await fn(); } finally { console.warn = antes; }
  return linhas;
}

test('aquecerBanco entrega a leitura das regras ao segundo plano e não espera por ela', () => {
  const chamadas = [], adiadas = [];
  const banco = (fn, p) => { chamadas.push([fn, p]); return new Promise(() => {}); };   /* (nunca responde: quem chama não pode esperar) */
  const foi = aquecerBanco(banco, p => adiadas.push(p));
  assert.equal(foi, true);
  assert.equal(adiadas.length, 1, 'uma promessa entregue ao waitUntil');
  assert.deepEqual(chamadas.map(c => c[0]), ['vendas_regras_ativas']);
});

test('aquecerBanco não derruba nada quando o banco falha, e avisa no log só com o código do erro', async () => {
  const adiadas = [];
  const erro = Object.assign(new Error('detalhe que não vai ao log'), { codigo: 'banco_503' });
  const avisos = await comAvisos(async () => {
    aquecerBanco(() => Promise.reject(erro), p => adiadas.push(p));
    await assert.doesNotReject(adiadas[0]);
  });
  assert.equal(avisos.length, 1, 'um aviso por falha');
  const linha = JSON.parse(avisos[0]);
  assert.equal(linha.origem, 'vendas');
  assert.equal(linha.codigo, 'banco_503');
  assert.ok(!avisos[0].includes('detalhe que não vai ao log'), 'a mensagem do erro não vai ao log');
});

test('aquecerBanco sem banco ou sem segundo plano não faz nada', () => {
  assert.equal(aquecerBanco(null, () => {}), false);
  assert.equal(aquecerBanco(() => Promise.resolve(REGRAS_OK), null), false);
});

test('no máximo um aquecimento a cada 30 s por instância, dê certo ou não (banco fora não vira uma leitura por GET)', async () => {
  let n = 0;
  const banco = async () => { n++; throw new Error('banco fora'); };
  const adiadas = [];
  await comAvisos(async () => {
    assert.equal(aquecerBanco(banco, p => adiadas.push(p), { agora: 1_000_000 }), true);
    assert.equal(aquecerBanco(banco, p => adiadas.push(p), { agora: 1_000_000 + 29_999 }), false, 'dentro dos 30 s');
    await Promise.all(adiadas);
    assert.equal(n, 1, 'uma leitura só');
    assert.equal(aquecerBanco(banco, p => adiadas.push(p), { agora: 1_000_000 + 30_000 }), true, 'passados 30 s');
    await Promise.all(adiadas);
  });
  assert.equal(n, 2);
});

test('rajada de aberturas ao mesmo tempo dispara uma leitura só', () => {
  let n = 0;
  const banco = () => { n++; return new Promise(() => {}); };
  for (let i = 0; i < 20; i++) aquecerBanco(banco, () => {});
  assert.equal(n, 1);
});

test('GET sessao-config responde sem esperar o aquecimento, mesmo com o banco pendurado', async () => {
  const adiadas = [];
  await comFetch(() => new Promise(() => {}), async () => {
    const env = { BZ_AMBIENTE: 'local', SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_CHAVE_SECRETA: 'sb_secret_y' };
    const r = await atender(new Request(URL_CONFIG), env, 'GET', undefined, { waitUntil: p => adiadas.push(p) });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(await r.json()).sort(), ['consultor', 'turnstile']);
  });
  assert.equal(adiadas.length, 1, 'o aquecimento ficou no waitUntil, pendurado, e a resposta saiu');
});

test('GET sessao-config de verdade (sem dublês): com o Supabase configurado, deixa UMA leitura das regras no waitUntil', async () => {
  const adiadas = [];
  const urls = await comFetch(() => new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } }), async () => {
    const env = { BZ_AMBIENTE: 'local', SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_CHAVE_SECRETA: 'sb_secret_y' };
    const r = await atender(new Request(URL_CONFIG), env, 'GET', undefined, { waitUntil: p => adiadas.push(p) });
    assert.equal(r.status, 200);
    assert.equal(adiadas.length, 1, 'uma leitura entregue ao waitUntil');
    await adiadas[0];
  });
  assert.equal(urls.filter(u => u.includes('/rest/v1/rpc/vendas_regras_ativas')).length, 1, 'foi às regras ativas: ' + urls.join(' '));
});

test('GET sessao-config sem Supabase configurado não agenda nada', async () => {
  const adiadas = [];
  const r = await atender(new Request(URL_CONFIG), { BZ_AMBIENTE: 'local' }, 'GET', undefined, { waitUntil: p => adiadas.push(p) });
  assert.equal(r.status, 200);
  assert.equal(adiadas.length, 0);
});

test('GET sessao-config com configuração do Supabase quebrada ainda responde 200 (aquecer nunca derruba a configuração)', async () => {
  const env = { BZ_AMBIENTE: 'local', SUPABASE_URL: 12345, SUPABASE_CHAVE_SECRETA: 'sb_secret_y' };   /* (não é texto: criarTransporte lança) */
  const avisos = await comAvisos(async () => {
    const r = await atender(new Request(URL_CONFIG), env, 'GET', undefined, { waitUntil() {} });
    assert.equal(r.status, 200);
  });
  assert.equal(avisos.length, 1, 'a falha aparece no log');
});
