import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../../js/orcamento-cena-forma.js');
const MapaForma = require('../../js/orcamento-mapa-forma.js');
const BOA = { lugar: 'cozinha', gente: 4, canais: ['instagram', 'whatsapp'], oferta: 'cardapio', destaque: 'fotos' };
const codigos = r => (r.erros || []).map(e => e.caminho + ':' + e.codigo);

test('listas fechadas do tamanho da spec; os canais são os mesmos códigos do mapa do caso', () => {
  assert.equal(F.LUGARES.length, 10);
  assert.equal(F.OFERTAS.length, 12);
  assert.ok(F.DESTAQUES.length <= 5);
  assert.deepEqual([...F.CANAIS], [...MapaForma.ORIGENS_MAPA]);
  for (const l of [F.LUGARES, F.OFERTAS, F.DESTAQUES, F.CANAIS]) assert.ok(Object.isFrozen(l));
});

test('cena boa: ok, cópia congelada, a entrada não muda', () => {
  const entrada = JSON.parse(JSON.stringify(BOA));
  const r = F.validar(entrada);
  assert.equal(r.ok, true);
  assert.deepEqual(r.cena, BOA);
  assert.ok(Object.isFrozen(r.cena) && Object.isFrozen(r.cena.canais));
  assert.notEqual(r.cena.canais, entrada.canais);
  assert.deepEqual(entrada, BOA);
  assert.equal(F.validar({ ...BOA, oferta: null, destaque: null, canais: [], gente: 0 }).ok, true);
});

test('aceite 1: recusa lugar, oferta, destaque ou canal fora da lista, gente fora de 0..6 e texto com < ou >', () => {
  assert.deepEqual(codigos(F.validar({ ...BOA, lugar: 'castelo' })), ['lugar:fora_da_lista']);
  assert.deepEqual(codigos(F.validar({ ...BOA, oferta: 'nave' })), ['oferta:fora_da_lista']);
  assert.deepEqual(codigos(F.validar({ ...BOA, destaque: 'premio' })), ['destaque:fora_da_lista']);
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: ['instagram', 'orkut'] })), ['canais.1:fora_da_lista']);
  for (const gente of [-1, 7, 2.5, '4', NaN]) assert.equal(F.validar({ ...BOA, gente }).ok, false, String(gente));
  assert.deepEqual(codigos(F.validar({ ...BOA, lugar: '<img src=x>' })), ['lugar:caractere_proibido']);
  assert.deepEqual(codigos(F.validar({ ...BOA, oferta: 'a>b' })), ['oferta:caractere_proibido']);
});

test('limites, repetidos, campo desconhecido, lugar obrigatório, herdados e não-objetos', () => {
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: ['instagram', 'whatsapp', 'indicacao', 'tiktok'] })), ['canais:fora_do_limite']);
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: ['instagram', 'instagram'] })), ['canais.1:repetido']);
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: 'instagram' })), ['canais:tipo']);
  assert.deepEqual(codigos(F.validar({ ...BOA, extra: 1 })), ['extra:campo_desconhecido']);
  assert.deepEqual(codigos(F.validar({ ...BOA, lugar: undefined })), ['lugar:obrigatorio']);
  for (const lugar of ['__proto__', 'constructor', 'toString']) assert.equal(F.validar({ ...BOA, lugar }).ok, false, lugar);
  for (const v of [null, undefined, 'cozinha', 42, [], () => 1]) assert.deepEqual(codigos(F.validar(v)), [':objeto']);
});

test('nunca lança, nem com getter que lança ou objeto sem protótipo', () => {
  const traicoeiro = { ...BOA };
  Object.defineProperty(traicoeiro, 'lugar', { get() { throw new Error('x'); }, enumerable: true });
  assert.equal(F.validar(traicoeiro).ok, false);
  const semProto = Object.assign(Object.create(null), BOA);
  assert.equal(F.validar(semProto).ok, true);
});

test('fonte ES5 (sem let, const, =>), sem DOM nem innerHTML', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-cena-forma.js', import.meta.url), 'utf8');
  assert.ok(!/\blet\b|\bconst\b|=>|`|innerHTML|document\./.test(fonte));
});
