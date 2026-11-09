/* O GERADOR DAS DIREÇÕES NÃO LÊ A PLANTA (PR 2a; spec §2.6). O briefing que vai ao modelo de geração (automático, api/_vendas/gerador.mjs) e à sessão
   da fila manual (scripts/direcoes.mjs) sai SEM planta, leitura e planta_pedidos: são derivados de um modelo, nunca insumo de outro. briefingDelimitado
   é genérico (também embrulha a lista de ajustes) e NÃO muda.  node --test docs/testes/planta-geracao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefingParaGeracao, briefingDelimitado, gerarDirecao } from '../../api/_vendas/gerador.mjs';
import { pedidoParaModelo, montarArquivoPedido } from '../../scripts/direcoes.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';

const MARCA = 'MARCADOR-DA-FRASE-DA-PLANTA';
const PLANTA = { v: 1, versao: 2, origem: 'modelo', motivos: ['digito'], tentativas: 2, n_mensagens: 6, plano: { ...planoPadrao('generico'), fecho: MARCA } };
const LEITURA = { eixos: [{ eixo: 'volume', nivel: 'comentou', evidencia: 'MARCADOR-DA-LEITURA' }] };
const BRIEFING = { negocio: { nome: 'Clínica Aurora', segmento: 'odontologia' }, objetivos: ['agendamentos'], projeto: { formato: 'institucional' }, planta: PLANTA, leitura: LEITURA, planta_pedidos: 2 };

test('briefingParaGeracao tira planta, leitura e planta_pedidos e devolve uma cópia; o resto fica igual', () => {
  const r = briefingParaGeracao(BRIEFING);
  assert.deepEqual(Object.keys(r).sort(), ['negocio', 'objetivos', 'projeto']);
  assert.deepEqual(r.negocio, BRIEFING.negocio);
  assert.ok(BRIEFING.planta && BRIEFING.leitura && BRIEFING.planta_pedidos, 'o original não é tocado');
  assert.deepEqual(briefingParaGeracao({ negocio: { nome: 'x' } }), { negocio: { nome: 'x' } });
  assert.deepEqual(briefingParaGeracao(undefined), {});
  assert.deepEqual(briefingParaGeracao(null), {});
  assert.deepEqual(briefingParaGeracao('texto'), {});
  assert.deepEqual(briefingParaGeracao([1, 2]), {});
});

test('briefingDelimitado fica como era (genérico: embrulha outros objetos, inclusive com chave "planta" se alguém a mandar)', () => {
  assert.equal(briefingDelimitado({ lista_de_ajustes_do_cliente: [{ rodada: 1, texto: 'a < b' }] }),
    '<briefing>\n{"lista_de_ajustes_do_cliente":[{"rodada":1,"texto":"a \\u003c b"}]}\n</briefing>');
  assert.ok(briefingDelimitado({ planta: 1 }).includes('"planta":1'), 'a função genérica não filtra: o filtro é do briefingParaGeracao');
});

test('gerarDirecao: o pedido ao modelo não leva a planta, a leitura nem os contadores', async () => {
  let enviado = null;
  const ia = { mensagem: async p => { enviado = p; return { parada: 'fim', json: null, texto: '', custo_usd: 0 }; } };
  await gerarDirecao({ ia, briefing: BRIEFING, estrategia: 'conversao', numero: 1, fatores: { formato: 'institucional' } }).catch(() => {});
  assert.ok(enviado, 'a IA foi chamada');
  const pedido = enviado.mensagens[0].content;
  assert.ok(pedido.includes('Clínica Aurora'), 'o briefing de verdade vai');
  for (const x of [MARCA, 'MARCADOR-DA-LEITURA', 'planta_pedidos', '"planta"', '"leitura"', 'n_mensagens', 'tentativas']) assert.ok(!pedido.includes(x), 'vazou: ' + x);
});

test('a fila manual (scripts/direcoes.mjs): o pedido para o modelo também sai sem as chaves da planta', () => {
  const p = { conversa_id: '123e4567-e89b-12d3-a456-426614174000', pedido_em: '2026-11-05T12:00:00Z', briefing: BRIEFING, contato: { nome: 'Ana', telefone: '21999990000', email: 'ana@exemplo.com' }, fatores: { formato: 'institucional' }, direcoes: [] };
  const m = pedidoParaModelo(p);
  assert.ok(m.briefing.includes('Clínica Aurora'));
  for (const x of [MARCA, 'MARCADOR-DA-LEITURA', 'planta_pedidos', 'n_mensagens']) assert.ok(!m.briefing.includes(x), 'vazou: ' + x);
  assert.ok(!JSON.stringify(montarArquivoPedido(p)).includes(MARCA));
});
