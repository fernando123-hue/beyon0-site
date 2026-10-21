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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configTurnstile } from '../../api/_vendas/turnstile.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { criarIA } from '../../api/_ia/provedor.mjs';
import { modoDirecoes } from '../../api/_ia/config.mjs';
import { banco } from '../../api/_banco.mjs';
import { chaveDoTelefone } from '../../api/_vendas/pedido.mjs';

const CF = { BZ_PLATAFORMA: 'cloudflare' };
const MP = { MP_ACCESS_TOKEN: 'APP_USR-1234567890123456-abc-123456', MP_PUBLIC_KEY: 'APP_USR-pub-1234567890123456', MP_WEBHOOK_SEGREDO: 'segredo-muito-longo-123', MP_USER_ID: '123456' };

test('Cloudflare produção: Turnstile obrigatório e sem chave de teste', () => {
  assert.equal(configTurnstile({ ...CF }).exigido, true, 'sem chaves: fecha');
  assert.equal(configTurnstile({ ...CF, TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET: '1x0000000000000000000000000000000AA' }).siteKey, null, 'chave de teste na produção: fecha');
  assert.equal(configTurnstile({ ...CF, BZ_AMBIENTE: 'previa' }).exigido, false, 'prévia sem chaves: como a prévia da Vercel');
});
test('Cloudflare: pagamento produção só com MP_AMBIENTE=producao; prévia só teste; simulador nunca', () => {
  const salvo = globalThis.__BZ_LOCAL; globalThis.__BZ_LOCAL = { mp: { token: 't', segredo: 's', userId: '1', fetch: null, cronSecret: null } };
  try {
    assert.equal(configPagamentos({ ...CF, ...MP }).ambiente === 'simulado', false, 'simulador fora do local: nunca');
    assert.equal(configPagamentos({ ...CF, ...MP, MP_AMBIENTE: 'producao' }).ativo, true);
    assert.equal(configPagamentos({ ...CF, ...MP, MP_AMBIENTE: 'teste' }).ativo, false);
    assert.equal(configPagamentos({ ...CF, ...MP, BZ_AMBIENTE: 'previa', MP_AMBIENTE: 'producao' }).ativo, false);
    assert.equal(configPagamentos({ ...CF, ...MP, BZ_AMBIENTE: 'previa', MP_AMBIENTE: 'teste' }).ativo, true);
  } finally { globalThis.__BZ_LOCAL = salvo; }
});
test('Cloudflare: IA simulada nunca em produção; direções sem chave = manual; banco em memória nunca', async () => {
  assert.equal(await criarIA({ ...CF, BZ_IA: 'simulada', BZ_LOCAL: '1' }), null);
  assert.equal(modoDirecoes({ ...CF, BZ_LOCAL: '1' }), 'manual');
  assert.equal(banco({ ...CF, BZ_LOCAL: '1' }).ligado, false);
  assert.equal(chaveDoTelefone('+5521999990000', undefined, { ...CF, BZ_LOCAL: '1' }), null);
});
test('o runtime da Cloudflare vale até para quem lê process.env (o objeto vazio)', () => {
  comoCloudflare(() => {
    assert.equal(modoDirecoes({ BZ_LOCAL: '1' }), 'manual');
    assert.equal(banco({ BZ_LOCAL: '1' }).ligado, false);
  });
});

/* nenhuma função de ambiente é chamada SEM o ambiente em api/ (a chamada sem argumento cairia em process.env) */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DE_AMBIENTE = ['ambienteDe', 'foraDoLocal', 'naCloudflare', 'modoDirecoes', 'banco', 'criarIA', 'configPagamentos', 'criarVisitantes',
  'criarTransporte', 'configUsuario', 'configTurnstile', 'criarAnthropic', 'origemPermitida'];
const arquivosDe = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? arquivosDe(path.join(dir, d.name)) : d.name.endsWith('.mjs') ? [path.join(dir, d.name)] : []);
test('nenhuma chamada sem ambiente em api/ (revisão do plano, A2)', () => {
  const achados = [];
  for (const arq of arquivosDe(path.join(RAIZ, 'api'))) {
    const texto = fs.readFileSync(arq, 'utf8');
    for (const nome of DE_AMBIENTE) if (new RegExp('(?<![\\w.])' + nome + '\\(\\s*\\)').test(texto)) achados.push(path.relative(RAIZ, arq) + ': ' + nome + '()');
    if (/chaveDoTelefone\([^(),]+,[^(),]+\)/.test(texto)) achados.push(path.relative(RAIZ, arq) + ': chaveDoTelefone com 2 argumentos');
    if (/\bnaVercel\(\s*\)/.test(texto)) achados.push(path.relative(RAIZ, arq) + ': naVercel()');
  }
  assert.deepEqual(achados, []);
});
