/* O ARMAZÉM (PR 3b-2; spec §7, §8, §9): o contrato com o Supabase Storage por um fetch de mentira (sem rede), o armazém
   local que imita as regras do balde, e o arquivo do balde. O envio do arquivo NUNCA passa pelo Worker: aqui o Worker
   só pede o link, lê 16 bytes, pergunta o tamanho, remove e assina a leitura do painel.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarArmazem, ErroArmazem } from '../../api/_material/armazem.mjs';
import { criarArmazemLocal } from '../../api/_material/armazem-local.mjs';
import { rodarConferencias } from '../../scripts/conferir-armazem.mjs';

const CAM = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222';
const CAM2 = '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333';
const ENV = { SUPABASE_URL: 'https://projeto.supabase.co/', SUPABASE_CHAVE_SECRETA: 'sb_secret_SEGREDO_DE_TESTE_1234567890' };
const falso = rotas => {
  const chamadas = [];
  const f = async (url, o = {}) => {
    chamadas.push({ url: String(url), metodo: o.method || 'GET', cab: o.headers || {}, corpo: o.body });
    for (const [re, resp] of rotas) if (re.test((o.method || 'GET') + ' ' + url)) return typeof resp === 'function' ? resp(o) : resp.clone();
    return new Response('nada', { status: 404 });
  };
  f.chamadas = chamadas;
  return f;
};
const bytes = n => Uint8Array.from({ length: n }, (_, i) => i);

test('linkDeEnvio: pede o link ao Storage com a chave de serviço, e o endereço devolvido é do PROJETO (nunca o que a resposta disser)', async () => {
  const f = falso([[/^POST .*\/storage\/v1\/object\/upload\/sign\/material\//, () => Response.json({ url: '/object/upload/sign/material/' + CAM + '?token=TOKEN_ASSINADO_DE_TESTE_ABCDEFGHIJ' })]]);
  const a = criarArmazem(ENV, { fetch: f });
  const { url } = await a.linkDeEnvio(CAM);
  assert.equal(url, 'https://projeto.supabase.co/storage/v1/object/upload/sign/material/' + CAM + '?token=TOKEN_ASSINADO_DE_TESTE_ABCDEFGHIJ');
  assert.equal(f.chamadas[0].metodo, 'POST');
  assert.ok(f.chamadas[0].url.endsWith('/object/upload/sign/material/' + CAM));
  const malicioso = criarArmazem(ENV, { fetch: falso([[/^POST /, () => Response.json({ url: 'https://atacante.exemplo/x?token=TOKEN_ASSINADO_DE_TESTE_ABCDEFGHIJ' })]]) });
  assert.ok((await malicioso.linkDeEnvio(CAM)).url.startsWith('https://projeto.supabase.co/'), 'o host vem do ambiente');
});

test('linkDeEnvio: caminho que não é <uuid>/<uuid> não vai ao Storage; resposta sem token e erro de rede viram ErroArmazem sem segredo', async () => {
  const f = falso([[/^POST /, () => Response.json({})]]);
  const a = criarArmazem(ENV, { fetch: f });
  await assert.rejects(a.linkDeEnvio('../x'), ErroArmazem);
  await assert.rejects(a.linkDeEnvio(CAM + '/extra'), ErroArmazem);
  assert.equal(f.chamadas.length, 0);
  await assert.rejects(a.linkDeEnvio(CAM), e => e instanceof ErroArmazem && !e.message.includes('SEGREDO') && !e.message.includes(CAM));
  const queda = criarArmazem(ENV, { fetch: async () => { throw new Error('ECONNRESET ' + ENV.SUPABASE_CHAVE_SECRETA); } });
  await assert.rejects(queda.linkDeEnvio(CAM), e => e instanceof ErroArmazem && !e.message.includes('SEGREDO'));
});

test('inicioDoArquivo: pede só os 16 primeiros bytes (Range) e lê o tamanho de Content-Range', async () => {
  const f = falso([[/^GET .*\/object\/authenticated\/material\//, () => new Response(bytes(16), { status: 206, headers: { 'content-range': 'bytes 0-15/123456' } })]]);
  const a = criarArmazem(ENV, { fetch: f });
  const r = await a.inicioDoArquivo(CAM);
  assert.equal(r.bytes.length, 16); assert.equal(r.total, 123456);
  assert.equal(f.chamadas[0].cab.range, 'bytes=0-15');
});

test('inicioDoArquivo: se o Storage ignorar o Range (200), lê só o primeiro pedaço e CANCELA o resto: nunca puxa o arquivo inteiro', async () => {
  let cancelado = false, lidos = 0;
  const corpo = new ReadableStream({
    pull(c) { lidos++; c.enqueue(bytes(64)); },
    cancel() { cancelado = true; }
  });
  const f = falso([[/^GET /, () => new Response(corpo, { status: 200, headers: { 'content-length': '9000000' } })]]);
  const r = await criarArmazem(ENV, { fetch: f }).inicioDoArquivo(CAM);
  assert.equal(r.bytes.length, 16); assert.equal(r.total, 9000000);
  assert.equal(cancelado, true, 'o corpo foi cancelado');
  assert.ok(lidos < 5, 'leu poucos pedaços, não o arquivo: ' + lidos);
});

test('inicioDoArquivo e tamanhoDoObjeto: objeto que não existe dá null', async () => {
  const a = criarArmazem(ENV, { fetch: falso([]) });
  assert.equal(await a.inicioDoArquivo(CAM), null);
  assert.equal(await a.tamanhoDoObjeto(CAM), null);
  const b = criarArmazem(ENV, { fetch: falso([[/^GET .*\/object\/info\/authenticated\/material\//, () => Response.json({ size: 4321 })]]) });
  assert.equal(await b.tamanhoDoObjeto(CAM), 4321);
});

test('remover: UM pedido para vários caminhos, sem repetidos nem inválidos; lista vazia não chama o Storage', async () => {
  const f = falso([[/^DELETE /, () => Response.json([])]]);
  const a = criarArmazem(ENV, { fetch: f });
  await a.remover([CAM, CAM2, CAM, 'lixo']);
  assert.equal(f.chamadas.length, 1);
  assert.deepEqual(JSON.parse(f.chamadas[0].corpo).prefixes, [CAM, CAM2]);
  await a.remover([]); await a.remover(['lixo']);
  assert.equal(f.chamadas.length, 1);
  await assert.rejects(criarArmazem(ENV, { fetch: falso([[/^DELETE /, new Response('x', { status: 500 })]]) }).remover([CAM]), ErroArmazem);
});

test('linksDeLeitura: UM pedido assina vários (60 s); devolve caminho → endereço do projeto', async () => {
  const f = falso([[/^POST .*\/object\/sign\/material$/, () => Response.json([{ path: CAM, signedURL: '/object/sign/material/' + CAM + '?token=LEITURA_A_1234567890', error: null }, { path: CAM2, signedURL: null, error: 'Object not found' }])]]);
  const r = await criarArmazem(ENV, { fetch: f }).linksDeLeitura([CAM, CAM2], 60);
  assert.deepEqual(Object.keys(r), [CAM]);
  assert.equal(r[CAM], 'https://projeto.supabase.co/storage/v1/object/sign/material/' + CAM + '?token=LEITURA_A_1234567890');
  assert.deepEqual(JSON.parse(f.chamadas[0].corpo), { expiresIn: 60, paths: [CAM, CAM2] });
  assert.equal(f.chamadas.length, 1);
});

test('criarArmazem: sem configuração dá null; com __BZ_LOCAL usa o armazém local; o Supabase tem prioridade', () => {
  assert.equal(criarArmazem({}), null);
  const antes = globalThis.__BZ_LOCAL;
  try {
    globalThis.__BZ_LOCAL = { armazem: { nome: 'local' } };
    assert.equal(criarArmazem({}).nome, 'local');
    assert.notEqual(criarArmazem(ENV, { fetch: falso([]) }).nome, 'local');
  } finally { globalThis.__BZ_LOCAL = antes; }
});

test('armazém local: imita o balde (token do link, tipo declarado, 10 MB, sem sobrescrever) e o link é reutilizável como o real', async () => {
  const a = criarArmazemLocal({ base: 'http://127.0.0.1:8899' });
  const { url } = await a.linkDeEnvio(CAM);
  assert.match(url, /^http:\/\/127\.0\.0\.1:8899\/_armazem-local\/.+\?token=/);
  const rel = url.replace('http://127.0.0.1:8899', '');
  assert.equal(a.gravarPorUrl(rel.replace(/token=.*/, 'token=errado'), Buffer.from('x'), 'image/png').status, 403);
  assert.equal(a.gravarPorUrl(rel, Buffer.from('x'), 'image/svg+xml').status, 415);
  assert.equal(a.gravarPorUrl(rel, Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png').status, 413);
  assert.equal(a.gravarPorUrl(rel, Buffer.from(bytes(40)), 'image/png').status, 200);
  assert.equal(a.gravarPorUrl(rel, Buffer.from(bytes(40)), 'image/png').status, 409, 'sem sobrescrever');
  assert.deepEqual([(await a.inicioDoArquivo(CAM)).bytes.length, (await a.inicioDoArquivo(CAM)).total, await a.tamanhoDoObjeto(CAM)], [16, 40, 40]);
  await a.remover([CAM]);
  assert.equal(await a.inicioDoArquivo(CAM), null);
  assert.equal(a.gravarPorUrl(rel, Buffer.from(bytes(40)), 'image/png').status, 200, 'depois de removido, o MESMO link grava de novo (por isso a conferência, o teto e a reconciliação não confiam nele)');
});

test('o arquivo do balde: privado, só os três tipos, 10 MB, nenhuma política, reaplicável', () => {
  const sql = fs.readFileSync(new URL('../../supabase/storage/material.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  assert.match(sql, /'material', 'material', false, 10485760/);
  assert.match(sql, /array\['image\/png', 'image\/jpeg', 'image\/webp'\]/);
  assert.ok(!/svg/i.test(sql), 'SVG nunca');
  assert.ok(!/create policy|alter policy/i.test(sql), 'nenhuma política em storage.objects');
  assert.match(sql, /on conflict \(id\) do update/);
  assert.match(sql, /public = false/);
});

test('conferir-armazem: roda contra o armazém local sem vazar segredo e termina com a limpeza', async () => {
  const local = criarArmazemLocal({ base: '' });
  const buscar = async (url, o) => ({ status: o.method === 'PUT' ? local.gravarPorUrl(url, Buffer.from(o.body), o.headers['content-type']).status : 404 });
  const linhas = await rodarConferencias({ armazem: local, buscar, urlBase: '' });
  assert.ok(linhas.some(l => /^OK +1\./.test(l)) && linhas.some(l => /^OK +2\./.test(l)), linhas.join('\n'));
  assert.ok(!linhas.some(l => /token=|sb_secret|_armazem-local/.test(l)), 'nenhuma linha leva link nem segredo');
  assert.equal(local.objetos.size, 0, 'apagou o que criou');
});
