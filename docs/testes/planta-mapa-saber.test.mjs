/* O QUE SE SABE DAS ORIGENS (js/mapa-saber.js; desenho do PR 5 §3 e §6): um módulo só para o servidor (o mapa padrão, api/_vendas/mapa-padrao.mjs)
   e para a tela (o esboço que cresce, js/planta-cresce.js). Os dois leem o mesmo "como chegam" e têm de dar as mesmas origens: o esboço não pode
   mostrar "Instagram" para quem disse "não uso Instagram", nem o mapa padrão discordar do esboço que a pessoa viu crescer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { oQueSeSabe } from '../../api/_vendas/mapa-padrao.mjs';

const require = createRequire(import.meta.url);
const S = require('../../js/mapa-saber.js');
const F = require('../../js/orcamento-mapa-forma.js');
const R = require('../../js/orcamento-rotulos.js');

const origens = (texto) => S.origensDoCaso(texto, R.SUGESTOES);

test('as tabelas batem com a forma do mapa: os mesmos códigos, o mesmo teto, nenhuma chave herdada', () => {
  assert.deepEqual(Object.keys(S.NOMES).sort(), F.ORIGENS_MAPA.slice().sort());
  assert.deepEqual(Object.keys(S.PELO).sort(), F.ORIGENS_MAPA.slice().sort());
  assert.equal(S.ORIGENS_MAX, F.LIMITES_MAPA.hoje_origens_max);
  for (const v of Object.values(S.ORIGEM_DA_SUGESTAO)) assert.ok(F.ORIGENS_MAPA.includes(v), v);
  for (const [cod, sug] of Object.entries(R.SUGESTOES)) if (sug.campo === 'como_chegam') assert.ok(Object.prototype.hasOwnProperty.call(S.ORIGEM_DA_SUGESTAO, cod), 'rótulo sem origem: ' + cod);
  assert.equal(S.ORIGEM_DA_SUGESTAO.google, 'google_busca', '"Me acham no Google" é a busca');
  for (const t of [S.NOMES, S.PELO, S.ORIGEM_DA_SUGESTAO]) assert.equal(Object.prototype.hasOwnProperty.call(t, 'constructor'), false);
});

test('origensDoCaso: rótulos tocados, texto livre com a negação da oração, google como busca e mapa só quando dito', () => {
  assert.deepEqual(origens('Pelo Instagram; Me acham no Google'), ['instagram', 'google_busca']);
  assert.deepEqual(origens('me acham pelo google maps e por indicação'), ['google_mapa', 'indicacao']);
  assert.deepEqual(origens('não uso instagram, vem tudo do boca a boca'), ['indicacao']);
  assert.deepEqual(origens('chamam no zap e passam na frente'), ['whatsapp', 'passa_na_frente']);
  assert.deepEqual(origens('Não tenho site, só WhatsApp e Instagram'), ['instagram', 'whatsapp']);
  assert.deepEqual(origens('não uso instagram só whatsapp'), ['whatsapp']);
  assert.deepEqual(origens('Não uso Instagram, nem WhatsApp'), []);
  assert.deepEqual(origens('Sem Instagram, só WhatsApp'), ['whatsapp']);
  assert.deepEqual(origens('Nada de Google, é tudo indicação'), ['indicacao']);
  assert.deepEqual(origens('Instagram, WhatsApp, Google e indicação'), ['instagram', 'whatsapp', 'google_busca'], 'teto de 3');
  for (const ruim of [undefined, null, 42, {}, []]) assert.deepEqual(S.origensDoCaso(ruim, R.SUGESTOES), []);
  assert.deepEqual(S.origensDoCaso('Pelo Instagram', null), ['instagram'], 'sem a tabela de rótulos, o texto livre ainda vale');
});

test('o servidor e a tela dão as mesmas origens para o mesmo "como chegam"', () => {
  const frases = [
    'Pelo Instagram; Me acham no Google', 'Indicação; Passam na frente', 'me acham no google maps', 'pelo zap e pelo insta',
    'não uso instagram, vem tudo do boca a boca', 'Sem Instagram nem WhatsApp', 'site antigo e indicação', 'pelo Instagram não',
    'Pelo WhatsApp', 'vem gente do tiktok', '', 'Instagram, WhatsApp, Google e indicação'
  ];
  for (const f of frases) assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: f } }).origens, origens(f), f);
});

test('a frase da chegada sai das tabelas: nome e "pelo" por código, nunca o código cru', () => {
  for (const cod of F.ORIGENS_MAPA) {
    assert.ok(S.NOMES[cod] && !/_/.test(S.NOMES[cod]), cod);
    assert.match(S.PELO[cod], /^(pel[oa]s?|por|passando) /, cod);
  }
});
