import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const O = createRequire(import.meta.url)('../../js/oracao.js');

test('semAcento: minúsculas, sem acento, cortado em 2000; não-texto vira vazio', () => {
  assert.equal(O.semAcento('Clínica ÓTIMA'), 'clinica otima');
  assert.equal(O.semAcento('a'.repeat(2500)).length, 2000);
  for (const v of [null, undefined, 42, {}]) assert.equal(O.semAcento(v), '');
});

test('achaSemNegar: a ocorrência não negada na mesma oração; negação antes (até 3 palavras) ou logo depois apaga', () => {
  const re = /\bsomos (\d+)\b/g;
  assert.equal(O.achaSemNegar('somos 4 aqui', re)[1], '4');
  assert.equal(O.achaSemNegar('nao somos 4', re), null);
  assert.equal(O.achaSemNegar('nunca fomos e nem somos 4', re), null);
  assert.equal(O.achaSemNegar('nao sei, mas somos 4', re)[1], '4', 'a vírgula fecha a oração da negação');
  assert.equal(O.achaSemNegar('somos 4 nao', re), null, 'negação logo depois');
  assert.equal(O.achaSemNegar('nao somos 3, somos 4', re)[1], '4', 'a 2ª ocorrência vale');
});

test('achaSemNegar nunca lança e deixa a regex pronta para a próxima chamada', () => {
  const re = /\bx\b/g;
  assert.equal(O.achaSemNegar(null, re), null);
  assert.equal(O.achaSemNegar('x', null), null);
  O.achaSemNegar('x x', re);
  assert.equal(re.lastIndex, 0);
});
