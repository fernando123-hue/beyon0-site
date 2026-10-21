/* AMBIENTE — em que ambiente o código roda (api/_ambiente.mjs). Fechado por padrão: na Cloudflare, o que não for
   "previa" declarado é produção. A Cloudflare é reconhecida pelo RUNTIME (navigator.userAgent), então até quem lê
   process.env vê "Cloudflare" (revisão do plano, A2). npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambienteDe, naCloudflare, foraDoLocal } from '../../api/_ambiente.mjs';

/* simula o workerd: navigator.userAgent === 'Cloudflare-Workers' (doc Web standards, flag global_navigator) */
export function comoCloudflare(fn) {
  const antes = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true, writable: true });
  try { return fn(); } finally { if (antes) Object.defineProperty(globalThis, 'navigator', antes); else delete globalThis.navigator; }
}

test('Cloudflare pelo runtime: sem nada declarado é produção', () => {
  comoCloudflare(() => {
    assert.equal(naCloudflare({}), true);
    assert.equal(ambienteDe({}), 'producao');
    assert.equal(ambienteDe(undefined), 'producao', 'sem env nenhum: produção');
    assert.equal(ambienteDe({ BZ_AMBIENTE: 'previa' }), 'previa');
    assert.equal(ambienteDe({ BZ_AMBIENTE: ' previa ' }), 'previa', 'espaço colado no painel');
  });
});
test('Cloudflare: erro de digitação, "local" e BZ_LOCAL nunca abrem', () => {
  comoCloudflare(() => {
    for (const env of [{ BZ_AMBIENTE: 'prod' }, { BZ_AMBIENTE: 'local' }, { BZ_AMBIENTE: 'Previa' }, { BZ_LOCAL: '1' }, { BZ_LOCAL: '1', BZ_AMBIENTE: 'Previa' }]) {
      assert.equal(ambienteDe(env), 'producao', JSON.stringify(env));
    }
    assert.equal(foraDoLocal({ BZ_LOCAL: '1' }), true);
  });
});
test('simulação nos testes em Node: BZ_PLATAFORMA=cloudflare vale como o runtime', () => {
  assert.equal(ambienteDe({ BZ_PLATAFORMA: 'cloudflare' }), 'producao');
  assert.equal(ambienteDe({ BZ_PLATAFORMA: 'cloudflare', BZ_AMBIENTE: 'previa' }), 'previa');
  assert.equal(ambienteDe({ BZ_PLATAFORMA: 'cloudflare', BZ_LOCAL: '1' }), 'producao');
  assert.equal(ambienteDe({ VERCEL: '1', BZ_PLATAFORMA: 'cloudflare', BZ_AMBIENTE: 'previa' }), 'producao', 'na Vercel a simulação não vale');
});
test('Vercel até o PR D: production (ou sem VERCEL_ENV) é produção; preview/development é prévia', () => {
  assert.equal(ambienteDe({ VERCEL: '1' }), 'producao');
  assert.equal(ambienteDe({ VERCEL: '1', VERCEL_ENV: 'production' }), 'producao');
  assert.equal(ambienteDe({ VERCEL_ENV: 'preview' }), 'previa');
  assert.equal(ambienteDe({ VERCEL: '1', VERCEL_ENV: 'development' }), 'previa');
});
test('nada disso: local (servidor local e testes)', () => {
  assert.equal(ambienteDe({}), 'local');
  assert.equal(ambienteDe({ BZ_LOCAL: '1' }), 'local');
  assert.equal(ambienteDe(undefined), 'local');
  assert.equal(foraDoLocal({}), false);
});
