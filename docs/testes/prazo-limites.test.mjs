/* OS LIMITES DO PRAZO (revisão de segurança, B1; fix wave 2): um prazo_dias torto (1e12) ou dias parados absurdos não podem prender a rotina diária num laço de bilhões de voltas
   (o Worker tem poucos milissegundos). prazo_dias inteiro de 1 a 60 (o mesmo check do banco); o total de dias úteis parados somados tem teto; um item torto não derruba os alarmes do dia.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEntregarAte, prazoVencido, PRAZO_DIAS_MAX, PARADOS_DIAS_UTEIS_MAX } from '../../api/_material/prazo.mjs';
import { contarAlarmes } from '../../api/_entrega/alarmes.mjs';

const AGORA = new Date('2026-10-22T10:00:00-04:00');
const BASE = { conta_desde: '2026-10-01T12:00:00-04:00', pausas: [] };
const rapido = (f, ms = 50) => { const t = performance.now(); try { return f(); } finally { assert.ok(performance.now() - t < ms, 'respondeu em menos de ' + ms + ' ms'); } };

test('prazo_dias fora de um inteiro de 1 a 60 é erro claro e imediato (1e12 não vira um laço de bilhões)', () => {
  assert.equal(PRAZO_DIAS_MAX, 60);
  for (const dias of [1e12, 61, 0, -1, 5.5, NaN, Infinity, '5', null, undefined]) {
    assert.throws(() => rapido(() => calcularEntregarAte(BASE, { prazoDias: dias }, AGORA)), { name: 'RangeError', message: /prazo_dias/ }, 'calcular: ' + String(dias));
    assert.throws(() => rapido(() => prazoVencido(BASE, { prazoDias: dias }, AGORA)), { name: 'RangeError', message: /prazo_dias/ }, 'vencido: ' + String(dias));
  }
  assert.equal(calcularEntregarAte(BASE, { prazoDias: 1 }, AGORA), '2026-10-02');
  assert.ok(calcularEntregarAte(BASE, { prazoDias: 60 }, AGORA));
  assert.equal(calcularEntregarAte(null, { prazoDias: 1e12 }, AGORA), null, 'sem prazo iniciado ainda: nada a calcular (como antes)');
});

test('o total de dias úteis parados tem teto: pausas de séculos respondem em milissegundos e o teto é uma constante nomeada', () => {
  assert.ok(Number.isInteger(PARADOS_DIAS_UTEIS_MAX) && PARADOS_DIAS_UTEIS_MAX >= 60 && PARADOS_DIAS_UTEIS_MAX <= 1000);
  const aberta = { ...BASE, pausas: [{ desde: '2026-10-02T12:00:00-04:00', ate: null }] };
  const longa = { ...BASE, pausas: [{ desde: '2026-10-02T12:00:00-04:00', ate: '9999-12-31T12:00:00-04:00' }] };
  const muitas = { ...BASE, pausas: Array.from({ length: 5000 }, (_, i) => ({ desde: '2026-10-02T12:00:00-04:00', ate: '2026-12-02T12:00:00-04:00' })) };
  const longeNoPassado = { ...BASE, conta_desde: '1000-01-01T12:00:00-04:00', pausas: [{ desde: '1000-01-02T12:00:00-04:00', ate: null }] };
  const teto = rapido(() => calcularEntregarAte(longa, { prazoDias: 5 }, AGORA));
  assert.ok(teto && /^\d{4}-\d{2}-\d{2}$/.test(teto));
  const comMuitas = rapido(() => calcularEntregarAte(muitas, { prazoDias: 5 }, AGORA));
  assert.equal(comMuitas, teto, 'somar muitas pausas também para no teto (o mesmo resultado do teto)');
  rapido(() => calcularEntregarAte(aberta, { prazoDias: 5 }, new Date('9999-01-01T00:00:00Z')));
  rapido(() => calcularEntregarAte(longeNoPassado, { prazoDias: 5 }, AGORA));
  /* abaixo do teto a conta continua exata (o caso da captação em prazo-pausa.test.mjs segue verde) */
  const duas = { conta_desde: '2026-10-25T12:00:00-04:00', pausas: [{ desde: '2026-10-27T10:00:00-04:00', ate: '2026-10-29T15:00:00-04:00' }] };
  assert.equal(calcularEntregarAte(duas, { prazoDias: 7 }, new Date('2026-11-02T12:00:00-04:00')), '2026-11-06');
});

test('data ilegível no prazo é erro claro (RangeError, o que os chamadores já tratam), não laço nem NaN', () => {
  for (const torto of [{ conta_desde: 'ontem' }, { conta_desde: BASE.conta_desde, pausas: [{ desde: BASE.conta_desde, ate: 'depois' }] }, { conta_desde: BASE.conta_desde, novas_datas: [{ data: 'amanhã', combinada_em: BASE.conta_desde }] }]) {
    assert.throws(() => rapido(() => calcularEntregarAte(torto, { prazoDias: 5 }, AGORA)), RangeError);
  }
  assert.equal(prazoVencido({ conta_desde: BASE.conta_desde, pausas: 'x' }, { prazoDias: 5 }, AGORA), true, 'pausas que não é lista: vale como sem pausas (o prazo de outubro venceu)');
});

test('contarAlarmes: um item torto vira "ilegiveis" e NÃO derruba os alarmes do dia; prazo_dias 1e12 responde em milissegundos', () => {
  const itens = [
    { passo: 'producao', prazo_dias: 1e12, prazo: BASE },                                          // torto
    { passo: 'producao', prazo_dias: 5, prazo: { conta_desde: 'ontem' } },                          // torto
    { passo: 'producao', prazo_dias: 5, prazo: BASE },                                              // vencido
    { passo: 'material', entrada_em: '2026-09-01T12:00:00-04:00' },                                 // 30 dias sem material
    { passo: 'no_ar', aviso_no_ar_feito_em: 'lixo' },                                               // torto
    null                                                                                            // lixo no meio da lista
  ];
  const r = rapido(() => contarAlarmes(itens, AGORA));
  assert.deepEqual(r, { prazo_vencido: 1, material_30: 1, restante_vencido: 0, material_apagar: 0, ilegiveis: 4 });
  assert.deepEqual(contarAlarmes([], AGORA), { prazo_vencido: 0, material_30: 0, restante_vencido: 0, material_apagar: 0, ilegiveis: 0 });
});
