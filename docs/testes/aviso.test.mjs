/* O aviso ao dono (api/_aviso.mjs): hoje NÃO existe canal de aviso no celular (o app próprio com push ainda vai ser feito).
   avisarDono é um no-op que devolve false; os textos fixos continuam sem dado de cliente; nada tenta rede.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisarDono, AVISOS } from '../../api/_aviso.mjs';
import { criarAcoesDoRecado } from '../../api/_vendas/fluxo-recado.mjs';

test('aviso: os textos são fixos e não carregam dado de ninguém', () => {
  for (const t of Object.values(AVISOS)) assert.ok(!/[@\d]|BZ-|\+55/.test(t.replace(/\./g, '')), t);
  assert.deepEqual(Object.keys(AVISOS).sort(), ['atendente_cliente', 'atendente_contatos', 'atendente_global', 'fila_cheia', 'pedido', 'recado']);
});

test('aviso: é no-op (devolve false, não chama envio nenhum, não faz fetch), com ou sem variáveis antigas e para qualquer tipo', async () => {
  const salvo = globalThis.fetch;
  let rede = 0, enviou = 0;
  globalThis.fetch = async () => { rede++; return new Response('x'); };
  try {
    const enviar = () => { enviou++; };
    for (const env of [undefined, {}, { ALERTA_NTFY_TOPICO: 'abcdefghijklmnopqrstuvwxyz012345' }]) {
      for (const tipo of [...Object.keys(AVISOS), 'qualquer']) assert.equal(await avisarDono(env, tipo, { enviar }), false, tipo);
    }
    assert.equal(rede, 0, 'nenhum fetch');
    assert.equal(enviou, 0, 'nenhum envio');
  } finally { globalThis.fetch = salvo; }
});

test('aviso: o código da API não fala mais com ntfy.sh nem lê as variáveis antigas', () => {
  for (const arq of ['../../api/_aviso.mjs', '../../api/rotinas.mjs', '../../api/atendente.mjs', '../../api/_vendas/fluxo-pedido.mjs', '../../api/_vendas/fluxo-recado.mjs']) {
    const codigo = readFileSync(new URL(arq, import.meta.url), 'utf8');
    assert.doesNotMatch(codigo, /ntfy\.sh|process\.env\.ALERTA|env\.ALERTA_/i, arq);
  }
});

test('recado: grava, chama o aviso com o tipo fixo (sem o conteúdo) e o aviso no-op não muda a resposta', async () => {
  const vistos = [];
  const mk = avisar => criarAcoesDoRecado({ banco: async () => ({ ok: true }), visitantes: () => null, segredoFreio: 'x'.repeat(32), env: { BZ_LOCAL: '1', VERCEL: '' }, avisar });
  const corpo = { texto: 'Meu telefone é 21 99999-0000, ana@exemplo.com', email: 'ana@exemplo.com', origem: 'orcamento' };
  const req = { headers: new Headers({ 'x-forwarded-for': '203.0.113.9' }) };
  const r = await mk((env, tipo) => vistos.push(tipo)).recado({ request: req, corpo });
  assert.deepEqual(r, { ok: true }); assert.deepEqual(vistos, ['recado']);
  const r2 = await mk(avisarDono).recado({ request: req, corpo: { ...corpo, texto: 'Outro recado' } });
  assert.deepEqual(r2, { ok: true });
});

/* o pedido: o aviso sai depois de gravar; a recusa por fila cheia/limite avisa com o texto urgente; recusa comum não avisa; o aviso (no-op) não muda a resposta */
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

test('pedido: com o aviso real (no-op, sem canal) o pedido grava e a resposta não muda, sem nenhum fetch', async () => {
  const salvo = globalThis.fetch;
  let rede = 0;
  globalThis.fetch = async () => { rede++; return new Response('x'); };
  try {
    const r = await pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado' }, avisarDono).detalhes({ request: req, corpo: corpoPedido() });
    assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' });
    assert.equal(rede, 0);
  } finally { globalThis.fetch = salvo; }
});

test('pedido: o que ENCHE a fila avisa "fila_cheia" (com a fila no teto a página esconde o formulário, então quase ninguém chega a ser recusado)', async () => {
  const tipos = [];
  const r = await pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado', fila_cheia: true }, (e, t) => { tipos.push(t); }).detalhes({ request: req, corpo: corpoPedido() });
  assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' }, 'a resposta ao cliente não muda nem vaza o estado da fila');
  assert.deepEqual(tipos, ['fila_cheia']);
});
