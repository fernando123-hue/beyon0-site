/* O MICROFONE DO ZERO (api/_vendas/voz.mjs, ação transcrever): o áudio vira texto e nada fica guardado. Sem banco: o visitante e o
   transcritor são falsos. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { atender, freioVozVisitante } from '../../api/vendas.mjs';
import { criarTranscritor, transcrever, limparTexto, VOZ_MAX_BYTES, VOZ_MIN_BYTES, MODELO_VOZ, FRASE_SIMULADA } from '../../api/_vendas/voz.mjs';
import { lerHeaders, cabecalhosPara, ORDENS } from '../../cloudflare/cabecalhos.mjs';

const BASE = 'http://127.0.0.1';
const audio = (n = 20000) => new Uint8Array(n).fill(7);
const visitantes = { quem: async request => (request.headers.get('authorization') === 'Bearer bom' ? (request.headers.get('x-vid') || 'visitante-1') : null) };
const transcritorFixo = texto => ({ transcrever: async () => texto });
let ipSeq = 0, vidSeq = 0;

async function enviar({ corpo = audio(), tipo = 'audio/webm;codecs=opus', token = 'bom', transcritor = transcritorFixo('Quero um site para a minha loja.'), ip = '198.51.100.' + (++ipSeq), vid = 'v' + (++vidSeq), cabecalhos = {} } = {}) {
  const r = await atender(new Request(BASE + '/api/vendas?acao=transcrever', {
    method: 'POST', body: corpo, headers: { 'content-type': tipo, 'x-forwarded-for': ip, 'x-vid': vid, ...(token ? { authorization: 'Bearer ' + token } : {}), ...cabecalhos }
  }), {}, 'POST', { banco: {}, visitantes, transcritor });
  return { status: r.status, corpo: await r.json() };
}

test('o áudio vira texto: 200 { texto }, sem JSON e acima dos 16 KB do corpo comum', async () => {
  const r = await enviar({ corpo: audio(300000) });
  assert.deepEqual([r.status, r.corpo], [200, { texto: 'Quero um site para a minha loja.' }]);
});

test('sem sessão (sem token ou token ruim): 401, e o transcritor nem é chamado', async () => {
  let chamou = 0;
  const transcritor = { transcrever: async () => { chamou++; return 'x'; } };
  for (const token of [null, 'ruim']) assert.equal((await enviar({ token, transcritor })).status, 401);
  assert.equal(chamou, 0);
});

test('só áudio: JSON, texto e outros tipos levam 415', async () => {
  for (const tipo of ['application/json', 'text/plain', 'image/png', 'audio-x/outro']) assert.equal((await enviar({ tipo })).status, 415, tipo);
  for (const tipo of ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/mpeg', 'audio/wav', 'audio/aac']) assert.equal((await enviar({ tipo })).status, 200, tipo);
});

test('teto de tamanho: 413 pelo Content-Length e pelo tamanho real; pouco demais é 400 (nada para ouvir)', async () => {
  assert.equal((await enviar({ corpo: audio(VOZ_MAX_BYTES + 1) })).status, 413);
  assert.equal((await enviar({ corpo: audio(100), cabecalhos: { 'content-length': String(VOZ_MAX_BYTES + 5) } })).status, 413, 'declarou grande: recusa antes de ler');
  assert.equal((await enviar({ corpo: audio(VOZ_MAX_BYTES) })).status, 200, 'exatamente no teto passa');
  assert.equal((await enviar({ corpo: audio(VOZ_MIN_BYTES - 1) })).status, 400);
});

test('o texto que volta é limpo como o digitado: sem controles nem < >, espaços normalizados, no máximo 2000 caracteres', async () => {
  assert.equal(limparTexto('  Oi\u0000,   <b>tudo</b>\u0007 bem?\n\n'), 'Oi , b tudo /b bem?');
  assert.equal(limparTexto('a'.repeat(5000)).length, 2000);
  assert.equal(limparTexto(null), '');
  const r = await enviar({ transcritor: transcritorFixo('<script>alert(1)</script> quero um site') });
  assert.ok(!/[<>]/.test(r.corpo.texto), r.corpo.texto);
});

test('áudio sem fala: 200 com texto vazio e vazio: true (a tela diz "não entendi")', async () => {
  const r = await enviar({ transcritor: transcritorFixo('   ') });
  assert.deepEqual([r.status, r.corpo], [200, { texto: '', vazio: true }]);
});

test('o transcritor falhou: 503 com frase para o visitante, e o log traz só o motivo, nunca o áudio nem o texto', async () => {
  const linhas = [];
  const erroOriginal = console.error, logOriginal = console.log;
  console.error = (...a) => linhas.push(a.join(' ')); console.log = (...a) => linhas.push(a.join(' '));
  try {
    const r = await enviar({ transcritor: { transcrever: async () => { throw new Error('segredo do visitante: meu CPF 123'); } } });
    assert.equal(r.status, 503);
    assert.match(r.corpo.erro, /Escreva a sua mensagem/);
    const ok = await enviar({ transcritor: transcritorFixo('texto que o visitante falou: meu telefone 21 99999-0000') });
    assert.equal(ok.status, 200);
  } finally { console.error = erroOriginal; console.log = logOriginal; }
  const tudo = linhas.join('\n');
  assert.match(tudo, /voz falhou/);
  /* (19/11) o dado sensível inteiro, não um pedaço: o request_id é um UUID aleatório e saiu "…2899999965e9" numa rodada, casando "99999" à toa */
  assert.ok(!/CPF|segredo do visitante|telefone|99999-0000/.test(tudo), 'nenhum conteúdo no log: ' + tudo);
});

test('o tempo esgotado da transcrição vira 503 (o botão não fica preso)', async () => {
  const lento = { transcrever: () => new Promise(() => {}) };
  const request = new Request(BASE + '/x', { method: 'POST', body: audio(), headers: { 'content-type': 'audio/webm', authorization: 'Bearer bom' } });
  const r = await transcrever({ request, transcritor: lento, visitantes, freios: { visitante: () => false }, log: () => {}, requestId: 'r', tempoMs: 30 });
  assert.equal(r.status, 503);
});

test('sem o recurso ligado (sem transcritor): 503 com a saída "escreva a mensagem"', async () => {
  const r = await enviar({ transcritor: null });
  assert.equal(r.status, 503);
  assert.match(r.corpo.erro, /Escreva a sua mensagem/);
});

test('freio por visitante: a 13ª gravação em 10 minutos leva 429; outro visitante não é afetado', async () => {
  const seguidas = [];
  for (let i = 0; i < 13; i++) seguidas.push((await enviar({ ip: '198.51.100.250', vid: 'sempre-o-mesmo' })).status);
  assert.deepEqual(seguidas.slice(0, 12).every(s => s === 200) && seguidas[12], 429, seguidas.join(','));
  assert.equal(typeof freioVozVisitante, 'function');
});

test('o freio por IP vale antes de qualquer leitura do áudio (20 por 10 minutos)', async () => {
  const ip = '198.51.100.251';
  const visitantesVarios = { quem: async request => request.headers.get('x-visitante') };
  const chamar = n => atender(new Request(BASE + '/api/vendas?acao=transcrever', { method: 'POST', body: audio(), headers: { 'content-type': 'audio/webm', 'x-forwarded-for': ip, 'x-visitante': 'v' + n, authorization: 'Bearer q' } }), {}, 'POST', { banco: {}, visitantes: visitantesVarios, transcritor: transcritorFixo('ok') }).then(r => r.status);
  const status = [];
  for (let i = 0; i < 21; i++) status.push(await chamar(i));
  assert.equal(status.slice(0, 20).every(s => s === 200), true, status.join(','));
  assert.equal(status[20], 429);
});

test('criarTranscritor: simulado no servidor local; real só com BZ_VOZ=1 e o binding AI; senão nulo (a tela esconde o botão)', async () => {
  assert.equal((await criarTranscritor({ BZ_LOCAL: '1', BZ_AMBIENTE: 'local' }).transcrever()), FRASE_SIMULADA);
  assert.equal(criarTranscritor({ BZ_LOCAL: '1', BZ_AMBIENTE: 'local', BZ_SEM_VOZ: '1' }), null);
  assert.equal(criarTranscritor({ BZ_AMBIENTE: 'producao' }), null);
  assert.equal(criarTranscritor({ BZ_AMBIENTE: 'producao', AI: { run: async () => ({ text: 'x' }) } }), null, 'sem BZ_VOZ=1 fica desligado');
  assert.equal(criarTranscritor({ BZ_AMBIENTE: 'producao', BZ_VOZ: '1' }), null, 'sem o binding AI fica desligado');
  const chamadas = [];
  const t = criarTranscritor({ BZ_AMBIENTE: 'producao', BZ_VOZ: '1', AI: { run: async (modelo, entrada) => { chamadas.push([modelo, entrada]); return { text: ' Olá, mundo ' }; } } });
  assert.equal(await t.transcrever(audio(10).buffer), ' Olá, mundo ');
  assert.equal(chamadas[0][0], MODELO_VOZ);
  assert.equal(chamadas[0][1].language, 'pt');
  assert.equal(typeof chamadas[0][1].audio, 'string', 'o Whisper recebe o áudio em base64');
});

test('sessao-config diz se há voz (a tela só mostra o botão se sim)', async () => {
  const pedir = deps => atender(new Request(BASE + '/api/vendas?acao=sessao-config', { headers: { 'x-forwarded-for': '198.51.100.' + (++ipSeq) } }), {}, 'GET', deps).then(r => r.json());
  assert.equal((await pedir({ banco: {}, visitantes, ia: {}, transcritor: transcritorFixo('x') })).voz, true);
  assert.equal((await pedir({ banco: {}, visitantes, ia: {}, transcritor: null })).voz, false);
});

test('a ação transcrever só existe em POST', async () => {
  const r = await atender(new Request(BASE + '/api/vendas?acao=transcrever', { headers: { 'x-forwarded-for': '198.51.100.99' } }), {}, 'GET', { banco: {}, visitantes });
  assert.equal(r.status, 404);
});

test('o _headers libera o microfone SÓ no /orcamento (nas duas ordens de aplicação); o resto do site segue com microphone=()', () => {
  const regras = lerHeaders(fs.readFileSync(new URL('../../_headers', import.meta.url), 'utf8'));
  for (const ordem of ORDENS) {
    const pp = c => cabecalhosPara(regras, c, { ordem }).get('permissions-policy');
    assert.match(pp('/orcamento'), /microphone=\(self\)/, ordem);
    assert.doesNotMatch(pp('/orcamento'), /microphone=\(\)/, ordem);
    assert.match(pp('/orcamento'), /camera=\(\)/, 'a câmera continua fechada');
    for (const c of ['/', '/sites', '/automacao', '/privacidade', '/painel']) assert.match(pp(c), /microphone=\(\)/, c + ' ' + ordem);
  }
});
