/* A ESPERA ÚTIL (PR 2b-2; spec §3): "24 horas úteis" contam só de segunda a sexta; a data aparece arredondada para a
   hora seguinte; o bloco só aparece com o pedido confirmado, na fila manual e com modelo ainda na fila. O módulo é JS
   de navegador (IIFE): roda aqui com um window de mentira e sem document (ele não toca no DOM ao carregar). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonte = fs.readFileSync(new URL('../../js/orcamento-preparo.js', import.meta.url), 'utf8');
const janela = { BEYON_TEL: '5521977167944' };
new Function('window', fonte)(janela);
const P = janela.BZPreparo;
const em = (a, m, d, h, min = 0) => new Date(a, m - 1, d, h, min);

test('prazo: 24 horas úteis pulam o fim de semana', () => {
  assert.deepEqual(P.prazoUtil(em(2026, 10, 15, 14, 20), 24), em(2026, 10, 16, 14, 20), 'quinta 14h20 → sexta 14h20');
  assert.deepEqual(P.prazoUtil(em(2026, 10, 16, 15), 24), em(2026, 10, 19, 15), 'sexta 15h → segunda 15h');
  assert.deepEqual(P.prazoUtil(em(2026, 10, 17, 10), 24), em(2026, 10, 20, 0), 'sábado conta a partir de segunda 0h → terça 0h');
  assert.deepEqual(P.prazoUtil(em(2026, 10, 18, 23, 59), 24), em(2026, 10, 20, 0), 'domingo idem');
});

test('data do prazo: dia da semana, dia/mês e a hora arredondada para cima', () => {
  assert.equal(P.dataDoPrazo(em(2026, 10, 16, 14, 20)), 'sexta, 16/10, às 15h');
  assert.equal(P.dataDoPrazo(em(2026, 10, 19, 15)), 'segunda, 19/10, às 15h');
  assert.equal(P.dataDoPrazo(em(2026, 10, 20, 0)), 'o fim de segunda, 19/10', 'meia-noite lê-se como o fim do dia anterior, sem "às 0h"');
  assert.equal(P.dataDoPrazo(em(2026, 10, 16, 23, 30)), 'o fim de sexta, 16/10', 'arredondar pode virar o dia: nunca sai "sábado" nem "às 0h"');
  assert.equal(P.dataDoPrazo(em(2026, 10, 17, 0)), 'o fim de sexta, 16/10');
  /* viradas de mês e de ano pelo caminho real (prazoUtil + dataDoPrazo), só com dias úteis */
  const ate = (inicio) => P.dataDoPrazo(P.prazoUtil(inicio, 24));
  assert.equal(ate(em(2026, 10, 30, 18)), 'segunda, 02/11, às 18h', 'sexta 30/10 vira o mês: segunda 02/11');
  assert.equal(ate(em(2026, 12, 31, 10)), 'sexta, 01/01, às 10h', 'quinta 31/12 vira o ano: sexta 01/01');
  assert.equal(P.dataDoPrazo(em(2027, 1, 1, 0)), 'o fim de quinta, 31/12', 'meia-noite de 1/1 lê-se como o fim de 31/12');
});

test('mostrar: só confirmado, fila manual e com modelo na fila', () => {
  const base = { modo_direcoes: 'manual', pedido: { status: 'confirmado', confirmado_em: '2026-10-15T17:20:00Z', codigo: 'BZ-K7M3Q' }, direcoes: [{ status: 'gerando' }, { status: 'pronta' }] };
  assert.equal(P.deveMostrar(base), true);
  assert.equal(P.deveMostrar({ ...base, modo_direcoes: 'api' }), false);
  assert.equal(P.deveMostrar({ ...base, pedido: { ...base.pedido, status: 'aguardando' } }), false);
  assert.equal(P.deveMostrar({ ...base, pedido: { ...base.pedido, confirmado_em: null } }), false);
  assert.equal(P.deveMostrar({ ...base, direcoes: [{ status: 'pronta' }] }), false);
  assert.equal(P.deveMostrar({ ...base, pedido: null }), false);
  assert.equal(P.deveMostrar(null), false);
  assert.equal(P.deveMostrar({ ...base, pedido: { ...base.pedido, confirmado_em: 'lixo' } }), false, 'data inválida não vira "undefined, NaN/NaN"');
});

test('prazo vencido: a data some da promessa e entra o aviso honesto (I1)', () => {
  const confirmado = em(2026, 10, 15, 14, 20);   /* quinta 14h20: prazo sexta 16/10 às 15h */
  const E = { modo_direcoes: 'manual', pedido: { status: 'confirmado', confirmado_em: confirmado.toISOString(), codigo: 'BZ-K7M3Q' }, direcoes: [{ status: 'gerando' }] };
  const dentro = P.partesDoPrazo(E.pedido.confirmado_em, em(2026, 10, 16, 9));
  assert.equal(dentro.join(''), 'Seus três modelos ficam prontos até sexta, 16/10, às 15h.');
  assert.equal(P.partesDoPrazo(E.pedido.confirmado_em, em(2026, 10, 16, 15)).join(''), dentro.join(''), 'no instante exato do prazo ainda vale');
  const vencido = P.partesDoPrazo(E.pedido.confirmado_em, em(2026, 10, 19, 10));   /* segunda: depois de um fim de semana */
  assert.equal(vencido.join(''), 'O prazo era sexta, 16/10, às 15h. Os seus modelos ainda estão em produção; você pode voltar a esta página quando quiser: o pedido fica salvo.');
  assert.equal(vencido[1], 'sexta, 16/10, às 15h', 'a data fica no meio (vai em negrito na tela)');
  assert.equal(P.deveMostrar(E), true, 'a lista "já separe" e o WhatsApp continuam: o bloco segue visível');
});
