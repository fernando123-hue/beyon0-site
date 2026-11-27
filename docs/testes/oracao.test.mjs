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

/* (revisão técnica 7) a mesma regra em três lugares: até a migração dos dois antigos para js/oracao.js, as três definições não podem divergir */
test('a regra de oração e negação é idêntica em js/oracao.js, js/mapa-saber.js e js/orcamento-coerencia.js', async () => {
  const fs = await import('node:fs');
  const linha = (arq, nome) => {
    const m = fs.readFileSync(new URL('../../js/' + arq, import.meta.url), 'utf8').match(new RegExp('var ' + nome + ' = (/.+/);'));
    assert.ok(m, arq + ' ' + nome);
    return m[1];
  };
  for (const nome of ['NEGACAO', 'NEGACAO_DEPOIS', 'FIM_DA_ORACAO']) {
    const ref = linha('oracao.js', nome);
    assert.equal(linha('mapa-saber.js', nome), ref, 'mapa-saber ' + nome);
    assert.equal(linha('orcamento-coerencia.js', nome), ref, 'coerencia ' + nome);
  }
});

test('segurança: o corte de 2000 vale DEPOIS de normalizar; texto enorme com ocorrências negadas custa pouco (janela fixa)', () => {
  assert.ok(O.semAcento('Å'.repeat(5000)).length <= 2000);
  const negadas = 'nao somos 4 '.repeat(160);   /* 1920 caracteres: cabe o ", somos 9" no fim */
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) O.achaSemNegar(O.semAcento(negadas), /\bsomos (\d+)\b/g);
  assert.ok((performance.now() - t0) / 20 < 1.5, 'menos de 1,5 ms por chamada');
  assert.equal(O.achaSemNegar(O.semAcento(negadas + ', somos 9'), /\bsomos (\d+)\b/g)[1], '9');
});

test('achaSemNegar com recusa: pula a ocorrência cuja oração (antes dela) casa a recusa, e acha a seguinte', () => {
  const re = /\b(\d+) funcionarios\b/g, recusa = /\b(?:tive|quero)\b/;
  assert.equal(O.achaSemNegar('ja tive 10 funcionarios', re, recusa), null);
  assert.equal(O.achaSemNegar('ja tive 10 funcionarios, hoje 2 funcionarios', re, recusa)[1], '2');
  assert.equal(O.achaSemNegar('tenho 3 funcionarios', re, recusa)[1], '3');
  assert.equal(O.achaSemNegar('tenho 3 funcionarios', re, 'nao é regex')[1], '3', 'recusa inválida é ignorada');
});
