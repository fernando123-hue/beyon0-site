/* O MODELO RESERVA NA QUEDA (spec docs/superpowers/specs/2026-11-15-auto-reparo-design.md, camada 2).
   O fallback do servidor da Anthropic (fallbacks: 'default') só cobre RECUSA por política; a queda ou a sobrecarga de um modelo
   (5xx/529, rede) derrubava o Zero mesmo com outro modelo de pé. Agora, depois que as repetições do SDK acabam, a conversa do Zero
   (Sonnet 5.5) tenta UMA vez no Sonnet 5 (mesmo preço por token). Fora, de propósito: Haiku (o reserva custaria 10× a 20×: decisão
   de dinheiro do dono), Opus (geração em modo manual), tempo esgotado (já se esperou demais) e qualquer 4xx.
   node --test docs/testes/ia-reserva.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { criarAnthropic } from '../../api/_ia/anthropic.mjs';
import { custoUsd, MODELO_RESERVA, PRECO_POR_MILHAO } from '../../api/_ia/config.mjs';

const USO = { input_tokens: 3000, output_tokens: 400, cache_read_input_tokens: 5000 };
const boa = model => ({ model, stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'oi' }], usage: USO });
const queda = {
  '529 sobrecarga': () => new Anthropic.InternalServerError(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded', new Headers()),
  '500': () => new Anthropic.InternalServerError(500, {}, 'x', new Headers()),
  'rede': () => new Anthropic.APIConnectionError({ message: 'Connection error.' })
};
const naoQueda = {
  'tempo esgotado': () => new Anthropic.APIConnectionTimeoutError({ message: 'Request timed out.' }),
  '429': () => new Anthropic.RateLimitError(429, {}, 'x', new Headers()),
  '400': () => new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'messages: x' } }, 'x', new Headers()),
  '401': () => new Anthropic.AuthenticationError(401, {}, 'x', new Headers())
};

/* cliente falso: responde a fila de comportamentos, um por chamada (erro = função que cria o erro) */
function cliente(...fila) {
  const pedidos = [];
  const proximo = async (p, o) => { pedidos.push({ p, o }); const f = fila.shift(); if (typeof f === 'function') throw f(); return f; };
  return { pedidos, beta: { messages: { create: proximo, stream: (p, o) => ({ finalMessage: () => proximo(p, o) }) } } };
}
/* (revisões do PR #170) o histórico do turno leva um bloco de pensamento assinado de uma rodada anterior: vai igual ao reserva */
const HISTORICO = [{ role: 'user', content: 'oi' }, { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'assinado' }, { type: 'tool_use', id: 't1', name: 'x', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] }];
const conversa = ia => ia.mensagem({ papel: 'conversa', sistema: 'S', mensagens: HISTORICO });

test('reserva: só o Sonnet 5.5 tem reserva, e é o Sonnet 5, com preço na tabela igual ao dele por token', () => {
  assert.deepEqual(MODELO_RESERVA, { 'claude-sonnet-5-5': 'claude-sonnet-5' });
  assert.equal(PRECO_POR_MILHAO['claude-sonnet-5'].entrada, PRECO_POR_MILHAO['claude-sonnet-5-5'].entrada);
  assert.equal(PRECO_POR_MILHAO['claude-sonnet-5'].saida, PRECO_POR_MILHAO['claude-sonnet-5-5'].saida);
});

for (const [nome, erro] of Object.entries(queda)) {
  test('reserva: ' + nome + ' depois das repetições → uma chamada no Sonnet 5, sem o parâmetro de fallback do servidor, e o custo pelo modelo que respondeu', async () => {
    const c = cliente(erro, boa('claude-sonnet-5'));
    const r = await conversa(criarAnthropic({}, c));
    assert.equal(c.pedidos.length, 2);
    const [p1, p2] = c.pedidos;
    assert.equal(p1.p.model, 'claude-sonnet-5-5'); assert.equal(p1.p.fallbacks, 'default');
    assert.equal(p2.p.model, 'claude-sonnet-5');
    assert.equal(p2.p.fallbacks, undefined, 'o Sonnet 5 não está em COM_FALLBACK');
    assert.equal(p2.p.betas, undefined);
    assert.deepEqual({ ...p2.p, model: 'x' }, (({ fallbacks, betas, ...resto }) => ({ ...resto, model: 'x' }))(p1.p), 'o resto do pedido é o mesmo (sistema, mensagens, esforço)');
    assert.equal(p2.o.maxRetries, 0, 'a reserva tenta uma vez só');
    assert.equal(p2.o.timeout, 25000, 'com no máximo 25 s');
    assert.deepEqual(p2.p.messages, HISTORICO, 'o pensamento assinado da rodada anterior vai igual');
    assert.equal(r.modelo, 'claude-sonnet-5');
    assert.equal(r.custo_usd, custoUsd('claude-sonnet-5', { entrada: 3000, saida: 400, cache_leitura: 5000, cache_escrita: 0 }));
    assert.equal(r.texto, 'oi');
  });
}

for (const [nome, erro] of Object.entries(naoQueda)) {
  test('reserva: ' + nome + ' não chama a reserva (o erro é o de sempre)', async () => {
    const c = cliente(erro, boa('claude-sonnet-5'));
    await assert.rejects(conversa(criarAnthropic({}, c)));
    assert.equal(c.pedidos.length, 1);
  });
}

test('reserva: a reserva também falhou → o erro é o da queda original (conta no disjuntor como falha do provedor)', async () => {
  for (const segundo of [queda['500'], naoQueda['400']]) {
    const c = cliente(queda['529 sobrecarga'], segundo);
    await assert.rejects(conversa(criarAnthropic({}, c)), e => e.motivo === 'falha');
    assert.equal(c.pedidos.length, 2);
  }
});

test('reserva: Haiku (extração, atendente) e Opus (geração) não têm reserva', async () => {
  for (const papel of ['extracao', 'atendente', 'geracao']) {
    const c = cliente(queda['529 sobrecarga'], boa('claude-sonnet-5'));
    await assert.rejects(criarAnthropic({}, c).mensagem({ papel, sistema: 'S', mensagens: [{ role: 'user', content: 'oi' }] }), e => e.motivo === 'falha');
    assert.equal(c.pedidos.length, 1, papel);
  }
});

/* ---- revisões do PR #170 ---- */
const relogio = (...marcas) => () => marcas.length > 1 ? marcas.shift() : marcas[0];

test('reserva: a queda que chega depois de 30 s não chama o reserva (as tentativas do principal já gastaram o tempo)', async () => {
  const tarde = cliente(queda['529 sobrecarga'], boa('claude-sonnet-5'));
  await assert.rejects(conversa(criarAnthropic({}, tarde, {}, { agora: relogio(0, 31000) })), e => e.motivo === 'falha');
  assert.equal(tarde.pedidos.length, 1);
  const cedo = cliente(queda['529 sobrecarga'], boa('claude-sonnet-5'));
  assert.equal((await conversa(criarAnthropic({}, cedo, {}, { agora: relogio(0, 29000) }))).modelo, 'claude-sonnet-5');
});

test('reserva: o custo é pelo modelo que respondeu, mesmo com sufixo de data (nunca pela tabela do principal nem como o mais caro)', async () => {
  const c = cliente(queda['500'], boa('claude-sonnet-5-20260701'));
  const r = await conversa(criarAnthropic({}, c));
  assert.equal(r.custo_usd, custoUsd('claude-sonnet-5', { entrada: 3000, saida: 400, cache_leitura: 5000, cache_escrita: 0 }));
});

test('reserva: o reserva esgotou o tempo → o erro da queda original, com o pior caso do reserva somado ao custo (o teto não fica cego)', async () => {
  const c = cliente(queda['529 sobrecarga'], naoQueda['tempo esgotado']);
  await assert.rejects(conversa(criarAnthropic({}, c)), e => e.motivo === 'falha' && e.custo_usd === custoUsd('claude-sonnet-5', { saida: 4000 }));
});
