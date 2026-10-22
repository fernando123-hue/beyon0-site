/* O PRAZO EM DIAS ÚTEIS (PR 3b-2; spec §2.1 + decisão do dono de 21/10): uma conta só, no fuso America/Campo_Grande; o prazo da
   proposta; sábado, domingo e feriado não contam; a espera pela lista de ajustes soma dias úteis. Os casos estão em
   docs/testes/fixtures/captacao/prazo-casos.json (os da captação (para-o-site.md §6) e os do site).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FUSO, FERIADOS, diaNoFuso, isoNoFuso, ehUtil, somarDiasUteis, diasUteisEntre, iniciarPrazo, calcularEntregarAte, prazoVencido, dataPorExtenso } from '../../api/_material/prazo.mjs';

const C = JSON.parse(fs.readFileSync(new URL('./fixtures/captacao/prazo-casos.json', import.meta.url), 'utf8'));
const em = iso => new Date(iso);
const NACIONAIS = new Set(C.feriados_nacionais);   /* só os nacionais: valem com qualquer resposta do dono sobre os outros feriados */
const opcoes = c => ({ prazoDias: c.prazo_dias, feriados: NACIONAIS });

test('o fuso é o da captação e a lista de feriados nasce vazia (quais feriados contam é do dono)', () => {
  assert.equal(FUSO, 'America/Campo_Grande');
  assert.equal(FERIADOS.size, 0);
});
test('calcular: os casos (domingo, feriado, UTC × Campo Grande, esperas, nova data)', () => {
  for (const c of C.calcular) assert.equal(calcularEntregarAte(c.prazo, opcoes(c), em(c.agora)), c.esperado, c.nome);
});
test('vencido: no último dia ainda não, no dia seguinte sim, parado nunca; prazo ausente não quebra', () => {
  for (const c of C.vencido) assert.equal(prazoVencido(c.prazo, opcoes(c), em(c.agora)), c.esperado, c.nome);
  assert.equal(prazoVencido(undefined, { prazoDias: 5 }, new Date()), false);
});
test('iniciar: o mais tarde entre a entrada e o material; sem um dos dois, não começa', () => {
  for (const c of C.iniciar) {
    const r = iniciarPrazo({ entrada_em: c.entrada_em, numero_em: c.numero_em });
    assert.equal(r ? r.conta_desde : null, c.conta_desde, c.nome);
    assert.equal(r ? calcularEntregarAte({ conta_desde: r.conta_desde }, opcoes(c), em('2026-10-25T10:00:00-04:00')) : null, c.entregar_ate, c.nome + ' (data)');
  }
});
test('os dias úteis: sábado, domingo e feriado não contam; o dia de partida também não', () => {
  assert.equal(ehUtil('2026-10-23'), true); assert.equal(ehUtil('2026-10-24'), false); assert.equal(ehUtil('2026-10-25'), false);
  assert.equal(ehUtil('2026-11-02'), true); assert.equal(ehUtil('2026-11-02', new Set(['2026-11-02'])), false);
  assert.equal(somarDiasUteis('2026-10-23', 1), '2026-10-26', 'de sexta, 1 dia útil é segunda');
  assert.equal(somarDiasUteis('2026-10-24', 1), '2026-10-26', 'de sábado também');
  assert.equal(somarDiasUteis('2026-10-23', 0), '2026-10-23');
  assert.equal(somarDiasUteis('2026-10-30', 1, new Set(['2026-11-02'])), '2026-11-03');
  assert.equal(diasUteisEntre('2026-10-26', '2026-10-28'), 2, 'depois do dia em que começa, até o dia em que acaba (inclusive)');
  assert.equal(diasUteisEntre('2026-10-24', '2026-10-26'), 1, 'sábado a segunda: a segunda conta');
  assert.equal(diasUteisEntre('2026-10-24', '2026-10-25'), 0);
  assert.equal(diasUteisEntre('2026-10-30', '2026-11-02', NACIONAIS), 0, 'sexta a segunda de Finados');
  assert.equal(diasUteisEntre('2026-10-28', '2026-10-26'), 0);
});
test('o prazo da proposta manda: 5 e 8 dias úteis dão datas diferentes', () => {
  const p = { conta_desde: '2026-10-22T10:00:00-04:00' }, quando = em('2026-10-22T10:00:00-04:00');
  assert.equal(calcularEntregarAte(p, { prazoDias: 5 }, quando), '2026-10-29');
  assert.equal(calcularEntregarAte(p, { prazoDias: 8 }, quando), '2026-11-03');
});
test('isoNoFuso e diaNoFuso: -04:00, sempre, e o dia do fuso', () => {
  assert.equal(isoNoFuso(new Date('2026-10-26T01:00:00Z')), '2026-10-25T21:00:00-04:00');
  assert.equal(isoNoFuso(new Date('2026-10-22T13:00:00.000Z')), '2026-10-22T09:00:00-04:00');
  assert.equal(diaNoFuso('2026-10-26T01:00:00Z'), '2026-10-25');
  assert.equal(diaNoFuso(new Date('2026-10-26T04:00:00Z')), '2026-10-26');
});
test('dataPorExtenso: "5 de novembro", sem depender do fuso do aparelho', () => {
  assert.equal(dataPorExtenso('2026-11-05'), '5 de novembro');
  assert.equal(dataPorExtenso('2026-01-01'), '1 de janeiro');
  assert.equal(dataPorExtenso('lixo'), '');
});
