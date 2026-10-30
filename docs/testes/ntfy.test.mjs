/* O aviso no celular do dono (api/_ntfy.mjs): texto fixo sem dado pessoal, sem tópico não chama, falha ou demora do ntfy
   nunca derruba nem atrasa o pedido ou o recado.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisarDono, AVISOS, topicoDe } from '../../api/_ntfy.mjs';
import { criarAcoesDoRecado } from '../../api/_vendas/fluxo-recado.mjs';

const TOPICO = 'abcdefghijklmnopqrstuvwxyz012345';
const ENV = { ALERTA_NTFY_TOPICO: TOPICO };
const silencio = fn => { const e = console.error; console.error = () => {}; return fn().finally(() => { console.error = e; }); };

test('ntfy: os textos são fixos e não carregam dado de ninguém', () => {
  for (const t of Object.values(AVISOS)) assert.ok(!/[@\d]|BZ-|\+55/.test(t.replace(/\./g, '')), t);
  assert.deepEqual(Object.keys(AVISOS).sort(), ['atendente_cliente', 'atendente_global', 'fila_cheia', 'pedido', 'recado']);
});

test('ntfy: sem tópico (ou tópico curto) não chama ninguém', async () => {
  let chamadas = 0;
  const enviar = () => { chamadas++; };
  assert.equal(await avisarDono({}, 'pedido', { enviar }), false);
  assert.equal(await avisarDono({ ALERTA_NTFY_TOPICO: 'curto' }, 'pedido', { enviar }), false);
  assert.equal(topicoDe({ ALERTA_NTFY_TOPICO: 'curto' }), null);
  assert.equal(chamadas, 0);
});

test('ntfy: com tópico manda só o texto fixo; tipo desconhecido não manda', async () => {
  const vistos = [];
  assert.equal(await avisarDono(ENV, 'pedido', { enviar: (t, x) => vistos.push([t, x]) }), true);
  assert.deepEqual(vistos, [[TOPICO, 'Pedido novo na fila. Detalhes no painel.']]);
  assert.equal(await avisarDono(ENV, 'qualquer', { enviar: () => vistos.push('x') }), false);
  assert.equal(vistos.length, 1);
});

test('ntfy: erro do envio vira false e log, nunca exceção; demora é cortada', async () => {
  await silencio(async () => {
    assert.equal(await avisarDono(ENV, 'pedido', { enviar: async () => { throw new Error('ntfy HTTP 500'); } }), false);
    const t0 = Date.now();
    assert.equal(await avisarDono(ENV, 'recado', { enviar: () => new Promise(() => {}), esperaMs: 50 }), false);
    assert.ok(Date.now() - t0 < 1000, 'cortou a espera');
  });
});

test('recado: grava, avisa com texto fixo (sem o conteúdo) e a falha do aviso não derruba o recado', async () => {
  const vistos = [];
  const mk = avisar => criarAcoesDoRecado({ banco: async () => ({ ok: true }), visitantes: () => null, segredoFreio: 'x'.repeat(32), env: { BZ_LOCAL: '1', VERCEL: '' }, avisar });
  const corpo = { texto: 'Meu telefone é 21 99999-0000, ana@exemplo.com', email: 'ana@exemplo.com', origem: 'orcamento' };
  const req = { headers: new Headers({ 'x-forwarded-for': '203.0.113.9' }) };
  const r = await mk((env, tipo) => vistos.push(tipo)).recado({ request: req, corpo });
  assert.deepEqual(r, { ok: true }); assert.deepEqual(vistos, ['recado']);
  const r2 = await silencio(() => mk(env => avisarDono(ENV, 'recado', { enviar: async () => { throw new Error('caiu'); } })).recado({ request: req, corpo: { ...corpo, texto: 'Outro recado' } }));
  assert.deepEqual(r2, { ok: true });
});

test('ntfy: o aviso de fila cheia é urgente, fixo e sai no máximo uma vez a cada 10 minutos', async () => {
  const vistos = [];
  const enviar = (t, x, urgente) => vistos.push([x, urgente]);
  assert.equal(await avisarDono(ENV, 'fila_cheia', { enviar, agora: () => 1_000_000 }), true);
  assert.equal(await avisarDono(ENV, 'fila_cheia', { enviar, agora: () => 1_000_000 + 60e3 }), false, 'dentro da janela: calado');
  assert.equal(await avisarDono(ENV, 'fila_cheia', { enviar, agora: () => 1_000_000 + 11 * 60e3 }), true);
  assert.deepEqual(vistos.map(v => v[1]), [true, true]);
  assert.match(vistos[0][0], /^URGENTE: a fila de pedidos encheu/);
});

/* o pedido: o aviso sai depois de gravar; a recusa por fila cheia/limite avisa com o texto urgente; recusa comum não avisa; falha do aviso não muda a resposta */
import { criarAcoesDoPedido } from '../../api/_vendas/fluxo-pedido.mjs';
const UUID = '11111111-1111-4111-8111-111111111111';
const corpoPedido = () => ({ conversa_id: UUID, negocio: 'Clínica Sol', vende: 'Consultas e exames', telefone: '(21) 98765-4321', nome: 'Rita', aceite: true });
function pedidoCom(resposta, avisar) {
  return criarAcoesDoPedido({ banco: async () => resposta, visitante: async () => UUID, segredoFreio: 'x'.repeat(40), env: { BZ_LOCAL: '1' }, avisar });
}
const req = { headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }) };

test('pedido: grava e depois avisa "pedido" uma vez; o corpo do aviso não leva dado (só o tipo)', async () => {
  const tipos = [];
  const r = await pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado' }, (env, tipo) => { tipos.push(tipo); }).detalhes({ request: req, corpo: corpoPedido() });
  assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' });
  assert.deepEqual(tipos, ['pedido']);
});

test('pedido: fila cheia e limite por hora avisam "fila_cheia" e dão a saída do recado; recusa comum não avisa', async () => {
  for (const motivo of ['fila_cheia', 'limite_hora']) {
    const tipos = [];
    await assert.rejects(pedidoCom({ ok: false, motivo }, (e, t) => { tipos.push(t); }).detalhes({ request: req, corpo: corpoPedido() }), e => e.status === 503 && e.extra.recado === true && e.extra.fila_cheia === true);
    assert.deepEqual(tipos, ['fila_cheia'], motivo);
  }
  const tipos = [];
  await assert.rejects(pedidoCom({ ok: false, motivo: 'telefone_dia' }, (e, t) => { tipos.push(t); }).detalhes({ request: req, corpo: corpoPedido() }), e => e.status === 409);
  assert.deepEqual(tipos, []);
});

test('pedido: o aviso que falha (ntfy fora do ar) não muda a resposta nem derruba o pedido', async () => {
  const avisar = (env, tipo) => avisarDono(ENV, tipo, { enviar: async () => { throw new Error('ntfy HTTP 500'); } });
  const r = await silencio(() => pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado' }, avisar).detalhes({ request: req, corpo: corpoPedido() }));
  assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' });
});

test('pedido: o que ENCHE a fila avisa "fila_cheia" (com a fila no teto a página esconde o formulário, então quase ninguém chega a ser recusado)', async () => {
  const tipos = [];
  const r = await pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado', fila_cheia: true }, (e, t) => { tipos.push(t); }).detalhes({ request: req, corpo: corpoPedido() });
  assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' }, 'a resposta ao cliente não muda nem vaza o estado da fila');
  assert.deepEqual(tipos, ['fila_cheia']);
});

test('fila cheia: aviso que falhou não gasta a janela de 10 minutos', async () => {
  const INICIO = 9_000_000_000;
  await silencio(() => avisarDono(ENV, 'fila_cheia', { enviar: async () => { throw new Error('ntfy HTTP 500'); }, agora: () => INICIO }));
  const vistos = [];
  assert.equal(await avisarDono(ENV, 'fila_cheia', { enviar: () => vistos.push(1), agora: () => INICIO + 1000 }), true, 'tenta de novo em seguida');
  assert.equal(vistos.length, 1);
});
