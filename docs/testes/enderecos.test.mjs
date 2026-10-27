/* OS ENDEREÇOS QUE O PAINEL GRAVA (PR 3b-3; spec §8): a prévia tem de ser a da captação (URL_PREVIA) E do projeto desta entrega
   (qualquer pessoa pode criar um *.pages.dev); o site no ar é só o endereço (https, domínio público, sem caminho).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { URL_PREVIA, problemaDaPrevia, problemaDoSite, origemDoSite } from '../../api/_entrega/enderecos.mjs';

const CLIENTE = 'c-k7m3qa';

test('a prévia do projeto certo passa; o resto é recusado com o motivo', () => {
  for (const ok of ['https://v1.bz-c-k7m3qa.pages.dev', 'https://v12.bz-c-k7m3qa.pages.dev/']) assert.equal(problemaDaPrevia(ok, CLIENTE), null, ok);
  const ruins = ['http://v1.bz-c-k7m3qa.pages.dev', 'https://v1.bz-c-k7m3qa.pages.dev/x', 'https://v123.bz-c-k7m3qa.pages.dev', 'https://bz-c-k7m3qa.pages.dev',
    'https://v1.bz-c-k7m3qa.pages.dev@evil.com', 'https://user:pw@v1.bz-c-k7m3qa.pages.dev', 'https://v1.bz-c-k7m3qa.pages.dev:8080', 'https://evil.pages.dev', 'javascript:alert(1)', '', null, 42];
  for (const ruim of ruins) assert.notEqual(problemaDaPrevia(ruim, CLIENTE), null, String(ruim));
});

test('a prévia de OUTRO projeto é recusada, e sem o id do cliente (não importado) também', () => {
  assert.match(problemaDaPrevia('https://v1.bz-c-zzzzz2.pages.dev', CLIENTE), /outro projeto/);
  assert.match(problemaDaPrevia('https://v1.bz-c-k7m3qa.pages.dev', null), /importado/);
});

test('o alfabeto do id: sem i, l, o, 0, 1 (o mesmo da captação)', () => {
  assert.equal(URL_PREVIA.test('https://v1.bz-c-k7m3qi.pages.dev'), false);
  assert.equal(URL_PREVIA.test('https://v1.bz-c-k7m3q1.pages.dev'), false);
});

test('o site no ar: só o endereço, https, domínio público', () => {
  for (const ok of ['https://clinicasol.com.br', 'https://clinicasol.com.br/', 'https://www.clinicasol.com.br']) assert.equal(problemaDoSite(ok), null, ok);
  for (const ruim of ['http://clinicasol.com.br', 'https://clinicasol.com.br/agenda', 'https://clinicasol.com.br/?a=1', 'https://clinicasol.com.br/#x', 'https://localhost', 'https://127.0.0.1', 'https://user@clinicasol.com.br', 'clinicasol.com.br', '', null]) {
    assert.notEqual(problemaDoSite(ruim), null, String(ruim));
  }
  assert.equal(origemDoSite('https://clinicasol.com.br/'), 'https://clinicasol.com.br');
});
