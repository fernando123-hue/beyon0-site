/* Lapidação do Zero consultor (25/11). Na auditoria com o modelo real, quase toda 1ª fala abria com "Legal," ou "Que bom,", tique de
   robô (skill voz-humana), mesmo com o prompt pedindo para começar pelo conteúdo. A trava tira só a palavra de molde do começo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semAberturaDeMolde } from '../../api/_vendas/zero.mjs';

test('abertura de molde: "Legal," e "Que bom," saem do começo e a frase segue com maiúscula', () => {
  assert.deepEqual(semAberturaDeMolde('Legal, uma clínica de fisioterapia em Niterói. Hoje, como um paciente novo chega até você?'),
    { texto: 'Uma clínica de fisioterapia em Niterói. Hoje, como um paciente novo chega até você?', trocou: true });
  assert.equal(semAberturaDeMolde('Que bom, vamos achar o formato certo pra sua loja.').texto, 'Vamos achar o formato certo pra sua loja.');
  assert.equal(semAberturaDeMolde('Perfeito. O site de uma página dá conta disso.').texto, 'O site de uma página dá conta disso.');
});

test('abertura de molde: o que não é molde fica igual', () => {
  for (const t of ['Legal ter você aqui, conta o que você faz?', 'Uma barbearia em Santos pede agendamento à vista.', 'O legal do site de uma página é que ele é rápido.', '']) {
    assert.deepEqual(semAberturaDeMolde(t), { texto: t, trocou: false }, t);
  }
  assert.equal(semAberturaDeMolde('Legal, sim.').texto, 'Legal, sim.', 'fala curta demais: não sobra frase, fica como está');
});
