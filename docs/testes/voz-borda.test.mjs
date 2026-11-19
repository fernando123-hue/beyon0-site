/* O MICROFONE DO ZERO — as bordas que a primeira revisão achou (18/11): o áudio passa pelo ROTEADOR do Worker (que tem o teto
   de corpo da rota, não só o do handler), a leitura é cortada em streaming, erros de rede viram resposta, o base64 funciona sem
   Buffer, o transcritor simulado nunca roda em produção. Sem banco, sem rede. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRoteador, ROTAS } from '../../cloudflare/rotas.mjs';
import { criarTranscritor, transcrever, lerAudio, paraBase64, VOZ_MAX_BYTES, VOZ_MIN_BYTES, FRASE_SIMULADA, TIPO_AUDIO } from '../../api/_vendas/voz.mjs';

const CF = { BZ_PLATAFORMA: 'cloudflare' };
const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64url');
/* um token com a FORMA de um JWT de visitante (sub = uuid, exp no futuro): quem confere a assinatura é o Supabase, não o roteador */
const TOKEN = 'cabecalho.' + b64url({ sub: '123e4567-e89b-42d3-a456-426614174000', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.assinatura';
const TOKEN_VENCIDO = 'cabecalho.' + b64url({ sub: '123e4567-e89b-42d3-a456-426614174000', exp: Math.floor(Date.now() / 1000) - 60 }) + '.assinatura';

/* a rota REAL de vendas (com o teto de corpo e a triagem de token), mas o handler só conta os bytes que chegaram */
let chegou = 0;
const rotear = criarRoteador({
  vendas: { ...ROTAS.vendas, POST: async r => { const b = await r.arrayBuffer(); chegou = b.byteLength; return Response.json({ tamanho: b.byteLength }); } }
});
const enviar = (corpo, { acao = 'transcrever', token = TOKEN, tipo = 'audio/webm' } = {}) => rotear(new Request('https://beyonzero.com.br/api/vendas?acao=' + acao, {
  method: 'POST', body: corpo, headers: { 'cf-connecting-ip': '203.0.113.9', 'content-type': tipo, ...(token ? { authorization: 'Bearer ' + token } : {}) }
}), CF);
const audio = n => new Uint8Array(n).fill(7);

test('roteador: o áudio de verdade (100 KB, 1 MB, o teto de 2 MB) chega ao handler; antes da correção o Worker dava 413 acima de 48 KB', async () => {
  for (const n of [100 * 1024, 1024 * 1024, VOZ_MAX_BYTES]) {
    chegou = 0;
    const r = await enviar(audio(n));
    assert.equal(r.status, 200, 'tamanho ' + n); assert.equal(chegou, n);
  }
});

test('roteador: acima do teto da voz, 413 (pelo tamanho real e pelo Content-Length)', async () => {
  chegou = 0;
  assert.equal((await enviar(audio(VOZ_MAX_BYTES + 1))).status, 413);
  assert.equal(chegou, 0, 'o handler nem foi chamado');
});

test('roteador: sem token de forma válida, 401 ANTES de ler o corpo (um anônimo não faz o Worker guardar 2 MB)', async () => {
  for (const token of [null, 'lixo', TOKEN_VENCIDO]) {
    chegou = 0;
    const r = await enviar(audio(500 * 1024), { token });
    assert.equal(r.status, 401, String(token)); assert.equal(chegou, 0);
  }
});

test('roteador: o teto grande é SÓ da ação transcrever; as outras ações de vendas seguem com os 48 KB de sempre', async () => {
  for (const acao of ['mensagem', 'sessao', 'pagar']) assert.equal((await enviar(audio(100 * 1024), { acao })).status, 413, acao);
  assert.equal((await enviar(audio(1000), { acao: 'mensagem', token: null })).status, 200, 'pequeno e sem token passa como sempre (o handler decide)');
});

test('lerAudio: corpo "chunked" (sem Content-Length) é cortado em streaming no teto, sem ler o resto', async () => {
  let enviados = 0;
  const fluxo = new ReadableStream({ pull(c) { enviados += 262144; c.enqueue(audio(262144)); if (enviados > 40 * 1024 * 1024) c.close(); } });
  const r = await lerAudio(new Request('https://x.test/', { method: 'POST', body: fluxo, duplex: 'half', headers: { 'content-type': 'audio/webm' } }));
  assert.deepEqual(r, { erro: 413 });
  assert.ok(enviados < 6 * 1024 * 1024, 'parou de puxar perto do teto, enviados=' + enviados);
});

test('lerAudio: o mínimo exato passa (só abaixo dele é "nada para ouvir") e o teto exato passa', async () => {
  const pedido = n => new Request('https://x.test/', { method: 'POST', body: audio(n), headers: { 'content-type': 'audio/webm' } });
  assert.deepEqual(await lerAudio(pedido(VOZ_MIN_BYTES - 1)), { erro: 400 });
  assert.equal((await lerAudio(pedido(VOZ_MIN_BYTES))).buffer.byteLength, VOZ_MIN_BYTES);
  assert.equal((await lerAudio(pedido(VOZ_MAX_BYTES))).buffer.byteLength, VOZ_MAX_BYTES);
  assert.deepEqual(await lerAudio(new Request('https://x.test/', { method: 'POST' })), { erro: 400 }, 'sem corpo');
});

test('transcrever: o Auth fora do ar é 503 recuperável (não 401 "sessão expirada") e o envio cortado no meio é 400; nada vaza', async () => {
  const logs = [];
  const log = (n, d) => logs.push(d);
  const comum = { transcritor: { transcrever: async () => 'x' }, freios: { visitante: () => false }, log, requestId: 'r1' };
  const reqOk = () => new Request('https://x.test/', { method: 'POST', body: audio(5000), headers: { 'content-type': 'audio/webm' } });
  const caiu = await transcrever({ ...comum, request: reqOk(), visitantes: { quem: async () => { throw Object.assign(new Error('segredo-do-auth'), { name: 'AuthIndisponivel' }); } } });
  assert.equal(caiu.status, 503); assert.ok(!JSON.stringify([caiu, logs]).includes('segredo-do-auth'));
  const cortado = new Request('https://x.test/', { method: 'POST', duplex: 'half', headers: { 'content-type': 'audio/webm' }, body: new ReadableStream({ pull() { throw new TypeError('rede-cortou'); } }) });
  const r = await transcrever({ ...comum, request: cortado, visitantes: { quem: async () => 'v1' } });
  assert.equal(r.status, 400); assert.ok(!JSON.stringify([r, logs]).includes('rede-cortou'));
});

test('paraBase64: sem Buffer (o Worker sem nodejs_compat) converte 2 MB em blocos, sem estourar a pilha, e o resultado decodifica igual', () => {
  const original = audio(VOZ_MAX_BYTES).map((_, i) => i % 251);
  const esperado = Buffer.from(original).toString('base64');
  const guardado = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined;
    assert.equal(paraBase64(original.buffer), esperado);
  } finally { globalThis.Buffer = guardado; }
  assert.equal(paraBase64(original.buffer), esperado);
});

test('o transcritor real manda ao modelo o áudio em base64 (decodifica para os mesmos bytes), em português, e texto ausente vira vazio', async () => {
  const chamadas = [];
  const env = { BZ_AMBIENTE: 'producao', BZ_VOZ: '1', AI: { run: async (m, e) => { chamadas.push(e); return chamadas.length === 1 ? { text: 'oi' } : {}; } } };
  const t = criarTranscritor(env);
  const bytes = Uint8Array.from([1, 2, 3, 250, 251, 252]);
  assert.equal(await t.transcrever(bytes.buffer), 'oi');
  assert.deepEqual([...Buffer.from(chamadas[0].audio, 'base64')], [...bytes]);
  assert.deepEqual([chamadas[0].language, chamadas[0].task, chamadas[0].vad_filter], ['pt', 'transcribe', true]);
  assert.equal(await t.transcrever(bytes.buffer), '', 'resposta sem text');
});

test('o transcritor SIMULADO nunca roda fora do ambiente local, nem com BZ_LOCAL=1 (a frase fixa jamais substitui a voz de um cliente)', () => {
  assert.equal(criarTranscritor({ BZ_PLATAFORMA: 'cloudflare', BZ_AMBIENTE: 'producao', BZ_LOCAL: '1' }), null);
  assert.equal(criarTranscritor({ BZ_PLATAFORMA: 'cloudflare', BZ_AMBIENTE: 'previa', BZ_LOCAL: '1' }), null);
  assert.equal(criarTranscritor({ BZ_LOCAL: '1' }).simulado, true);
  assert.equal(criarTranscritor({ BZ_LOCAL: '1', BZ_SEM_VOZ: '1' }), null);
  assert.ok(FRASE_SIMULADA.length > 10);
});

test('TIPO_AUDIO: os tipos que o app grava (Chrome/Android e Safari/iOS) passam; variações com o mesmo prefixo ou outra caixa, não passam por engano', () => {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'AUDIO/WEBM', 'audio/ogg;codecs=opus', 'audio/x-m4a']) assert.ok(TIPO_AUDIO.test(t), t);
  for (const t of ['audio/webmfoo', 'xaudio/webm', 'audio/webm foo', 'video/webm', 'audio/']) assert.ok(!TIPO_AUDIO.test(t), t);
});
