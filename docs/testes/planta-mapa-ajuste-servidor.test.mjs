/* MAPA VIVO v2, Fase 3, PR 3a: o ajuste do mapa que vem da REAÇÃO (plano docs/superpowers/plans/2026-11-28-mapa-vivo-fase3-pr3-servidor.md).
   Quando o aparelho não sabe rotear, a mesma chamada da Fase 1b (api/_vendas/fluxo-reacao.mjs) pede ao Haiku que ESCOLHA uma peça do conjunto
   fechado (js/mapa-ajuste.js, PECAS); o código confere e só devolve { acao, peca } dele. O texto do nó continua o da tabela (opção A).
   Sem `mapa: true` no corpo, o pedido é o de hoje, byte a byte (o que foi medido com o Haiku real em 26/11).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AJ from '../../js/mapa-ajuste.js';
import { montarPedidoReacao, conferirAjuste, PECAS_DO_AJUSTE, SISTEMA_REACAO, ESQUEMA_REACAO } from '../../api/_vendas/reacao.mjs';
import { criarAcoesDaReacao, criarFreiosDaReacao } from '../../api/_vendas/fluxo-reacao.mjs';
import { criarGastoLocal } from '../../api/_classificador/sombra.mjs';

const TEXTO = 'tenho uma marcenaria em Campo Grande e queria um lugar para mostrar as fotos dos móveis que já fiz';

test('as peças que o modelo pode escolher são exatamente as da tabela do aparelho', () => {
  assert.deepEqual([...PECAS_DO_AJUSTE].sort(), Object.keys(AJ.PECAS).sort());
  assert.ok(Object.isFrozen(PECAS_DO_AJUSTE));
});

test('sem mapa na tela, o pedido é o de hoje; com mapa, o sistema e o esquema ganham o ajuste fechado', () => {
  const hoje = montarPedidoReacao(TEXTO);
  assert.equal(hoje.sistema, SISTEMA_REACAO);
  assert.equal(hoje.esquema, ESQUEMA_REACAO);
  assert.deepEqual(montarPedidoReacao(TEXTO, { mapa: false }), hoje);
  const com = montarPedidoReacao(TEXTO, { mapa: true });
  assert.equal(com.papel, 'reacao');
  assert.deepEqual(com.mensagens, hoje.mensagens, 'o texto vai igual');
  assert.ok(com.sistema.startsWith(SISTEMA_REACAO), 'as regras da anotação seguem as mesmas');
  for (const k of PECAS_DO_AJUSTE) assert.ok(com.sistema.includes(k), k);
  const aj = com.esquema.properties.ajuste;
  assert.deepEqual(com.esquema.required, ['anotacao', 'entendeu', 'ajuste']);
  assert.equal(aj.additionalProperties, false);
  assert.deepEqual(aj.properties.acao.enum, ['entra', 'sai', 'nada']);
  assert.deepEqual(aj.properties.peca.enum, [...PECAS_DO_AJUSTE, '']);
});

test('conferência do ajuste: só entra/sai com peça da tabela; o resto é null', () => {
  assert.deepEqual(conferirAjuste({ ajuste: { acao: 'entra', peca: 'galeria' } }), { acao: 'entra', peca: 'galeria' });
  assert.deepEqual(conferirAjuste({ ajuste: { acao: 'sai', peca: 'agendamento', extra: 'x' } }), { acao: 'sai', peca: 'agendamento' }, 'só as duas chaves voltam');
  for (const ruim of [null, {}, { ajuste: null }, { ajuste: 'entra galeria' }, { ajuste: { acao: 'nada', peca: '' } }, { ajuste: { acao: 'entra', peca: '' } },
    { ajuste: { acao: 'entra', peca: 'area_restrita' } }, { ajuste: { acao: 'entra', peca: 'loja' } }, { ajuste: { acao: 'troca', peca: 'galeria' } },
    { ajuste: { acao: 'entra', peca: 'toString' } }, { ajuste: { acao: 'entra', peca: '__proto__' } }, { ajuste: { acao: ['entra'], peca: 'galeria' } }]) {
    assert.equal(conferirAjuste(ruim), null, JSON.stringify(ruim));
  }
});

/* ---------- a ação, com dublês ---------- */
function montar(resposta) {
  const chamadas = [];
  const acoes = criarAcoesDaReacao({
    ia: { async mensagem(p) { chamadas.push(p); return { json: resposta, custo_usd: 0.0002 }; } },
    env: { BZ_REACAO: 'ligada' }, custoDoDia: async () => 0, etapas: ['descoberta'], freios: criarFreiosDaReacao(), gasto: criarGastoLocal(),
    hoje: () => '2026-11-28', log: () => {}, visitante: async () => 'v1', donoDaConversa: async () => ({ ok: true }),
    gravarChamadas: async () => true, somarCusto: async () => {}, segundoPlano: p => p
  });
  const reagir = corpo => acoes.reagir({ request: { ok: true, headers: new Headers() }, corpo: { conversa_id: '11111111-2222-4333-8444-555555555555', texto: TEXTO, seq: 2, ...corpo } });
  return { reagir, chamadas, acoes };
}
const ANOTA = 'marcenaria em Campo Grande, quer mostrar fotos dos móveis';

test('ação: com mapa, a anotação e o ajuste conferidos voltam juntos; sem mapa, nem se pede ajuste', async () => {
  const d = montar({ anotacao: ANOTA, entendeu: true, ajuste: { acao: 'entra', peca: 'galeria' } });
  assert.deepEqual(await d.reagir({ mapa: true }), { reacao: { anotacao: ANOTA, ajuste: { acao: 'entra', peca: 'galeria' } }, seq: 2, motivo: 'ok' });
  assert.ok(d.chamadas[0].esquema.properties.ajuste);
  const s = montar({ anotacao: ANOTA, entendeu: true, ajuste: { acao: 'entra', peca: 'galeria' } });
  assert.deepEqual(await s.reagir({}), { reacao: { anotacao: ANOTA }, seq: 2, motivo: 'ok' }, 'ajuste que o modelo mandou sem ser pedido é ignorado');
  assert.equal(s.chamadas[0].esquema, ESQUEMA_REACAO);
});

test('ação: mapa só vale como booleano verdadeiro; "true" em texto é o pedido de hoje', async () => {
  const d = montar({ anotacao: ANOTA, entendeu: true });
  await d.reagir({ mapa: 'true' });
  assert.equal(d.chamadas[0].esquema, ESQUEMA_REACAO);
});

test('ação: anotação que cai na conferência não leva o ajuste junto; ajuste ruim não leva a anotação', async () => {
  const soAjuste = await montar({ anotacao: 'marcenaria com site por R$ 900', entendeu: true, ajuste: { acao: 'entra', peca: 'galeria' } }).reagir({ mapa: true });
  assert.deepEqual(soAjuste, { reacao: { ajuste: { acao: 'entra', peca: 'galeria' } }, seq: 2, motivo: 'ajuste' });
  const soAnota = await montar({ anotacao: ANOTA, entendeu: true, ajuste: { acao: 'entra', peca: 'loja' } }).reagir({ mapa: true });
  assert.deepEqual(soAnota, { reacao: { anotacao: ANOTA }, seq: 2, motivo: 'ok' });
  const nada = await montar({ anotacao: '', entendeu: false, ajuste: { acao: 'nada', peca: '' } }).reagir({ mapa: true });
  assert.deepEqual(nada, { reacao: null, seq: 2, motivo: 'vazio' });
});

test('a reação simulada da prévia também escolhe a peça quando o pedido traz o mapa (fotos -> galeria), e nada sem ele', async () => {
  const { reacaoSimulada } = await import('../../api/_ia/simulado.mjs');
  assert.deepEqual(conferirAjuste(reacaoSimulada(montarPedidoReacao(TEXTO, { mapa: true })).json), { acao: 'entra', peca: 'galeria' });
  assert.equal(conferirAjuste(reacaoSimulada(montarPedidoReacao('tenho uma padaria em Campinas e vendo bolo por encomenda', { mapa: true })).json), null);
  assert.equal('ajuste' in reacaoSimulada(montarPedidoReacao(TEXTO)).json, false, 'sem mapa, o json de hoje');
});

test('revisão técnica 2: o sistema com mapa manda "nada" para negação, condição e desistência; pergunta no texto não vira ajuste', async () => {
  const com = montarPedidoReacao(TEXTO, { mapa: true });
  assert.match(com.sistema, /nega[cç][aã]o/i);
  assert.match(com.sistema, /talvez/);
  const FIEL = 'marcenaria que quer galeria de fotos dos trabalhos';
  const d = montar({ anotacao: FIEL, entendeu: true, ajuste: { acao: 'entra', peca: 'galeria' } });
  const r = await d.acoes.reagir({ request: { ok: true, headers: new Headers() }, corpo: { conversa_id: '11111111-2222-4333-8444-555555555555', texto: 'vocês fazem galeria de fotos dos trabalhos da marcenaria? quanto fica', seq: 3, mapa: true } });
  assert.deepEqual(r.reacao, { anotacao: FIEL }, 'pergunta: o Zero decide no turno');
});

test('revisão técnica 4: só o ajuste passou: o motivo é "ajuste" (a medição separa os dois casos)', async () => {
  const r = await montar({ anotacao: 'marcenaria com site por R$ 900', entendeu: true, ajuste: { acao: 'entra', peca: 'galeria' } }).reagir({ mapa: true });
  assert.equal(r.motivo, 'ajuste');
});
