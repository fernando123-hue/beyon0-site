/* A PAUSA DO PRAZO e os dias CORRIDOS (PR 3b-3; spec §2.1, D4): a pausa abre quando a prévia sai e fecha quando o cliente responde;
   enquanto aberta, o prazo não vence; os 30 dias sem material e os 3 dias do restante (do aviso "no ar", 22/10) são corridos no fuso de Campo Grande.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirPausa, fecharPausa, diasCorridosDesde, calcularEntregarAte, prazoVencido } from '../../api/_material/prazo.mjs';

/* o caso da captação (para-o-site.md §6): 7 úteis a partir de domingo 25/10/2026 → 04/11 (02/11, Finados, não conta);
   espera de 27/10 10h a 29/10 15h → 06/11 (2 úteis parados: 28 e 29) */
const BASE = { conta_desde: '2026-10-25T12:00:00-04:00', pausas: [] };

test('abrir e fechar a pausa não mexem no objeto recebido e são idempotentes', () => {
  const p0 = Object.freeze({ ...BASE, pausas: Object.freeze([]) });
  const aberta = abrirPausa(p0, '2026-10-27T10:00:00-04:00');
  assert.deepEqual(aberta.pausas, [{ desde: '2026-10-27T10:00:00-04:00', ate: null }]);
  assert.deepEqual(p0.pausas, [], 'o original não mudou');
  assert.deepEqual(abrirPausa(aberta, '2026-10-28T10:00:00-04:00').pausas, aberta.pausas, 'já aberta: não abre outra');
  const fechada = fecharPausa(aberta, '2026-10-29T15:00:00-04:00');
  assert.deepEqual(fechada.pausas, [{ desde: '2026-10-27T10:00:00-04:00', ate: '2026-10-29T15:00:00-04:00' }]);
  assert.deepEqual(fecharPausa(fechada, '2026-11-01T00:00:00-04:00').pausas, fechada.pausas, 'sem pausa aberta: nada a fechar');
  assert.deepEqual(abrirPausa(null, '2026-10-27T10:00:00-04:00').pausas.length, 1, 'sem prazo ainda, não quebra');
});

test('a pausa fechada soma os dias úteis parados (o caso da captação: 04/11 → 06/11)', () => {
  const fechada = fecharPausa(abrirPausa(BASE, '2026-10-27T10:00:00-04:00'), '2026-10-29T15:00:00-04:00');
  const agora = new Date('2026-11-02T12:00:00-04:00');
  assert.equal(calcularEntregarAte(BASE, { prazoDias: 7 }, agora), '2026-11-04');
  assert.equal(calcularEntregarAte(fechada, { prazoDias: 7 }, agora), '2026-11-06');
});

test('enquanto a pausa está aberta o prazo NÃO vence, por mais dias que passem; fechada, a conta volta a valer', () => {
  const aberta = abrirPausa(BASE, '2026-10-27T10:00:00-04:00');
  assert.equal(prazoVencido(aberta, { prazoDias: 7 }, new Date('2027-10-27T12:00:00-04:00')), false);
  const fechada = fecharPausa(aberta, '2026-10-29T15:00:00-04:00');
  assert.equal(prazoVencido(fechada, { prazoDias: 7 }, new Date('2026-11-06T12:00:00-04:00')), false, 'no dia combinado ainda não');
  assert.equal(prazoVencido(fechada, { prazoDias: 7 }, new Date('2026-11-07T12:00:00-04:00')), true, 'no dia seguinte, sim');
});

test('dias corridos no fuso de Campo Grande (30 sem material, 3 do restante a partir do aviso): 02h UTC ainda é o dia anterior', () => {
  assert.equal(diasCorridosDesde('2026-09-22T12:00:00-04:00', new Date('2026-10-22T10:00:00-04:00')), 30);
  assert.equal(diasCorridosDesde('2026-09-22T12:00:00-04:00', new Date('2026-10-21T23:00:00-04:00')), 29);
  assert.equal(diasCorridosDesde('2026-10-10T03:00:00Z', new Date('2026-10-19T12:00:00-04:00')), 10, '03:00 UTC do dia 10 é 23:00 do dia 9 em Campo Grande: 9 → 19 são 10 dias');
  assert.equal(diasCorridosDesde('2026-10-22T12:00:00-04:00', new Date('2026-10-22T20:00:00-04:00')), 0);
});
