/* Os ícones das opções da conversa (js/orcamento-icones.js, remodelação 18/11): toda opção que a pessoa toca tem o seu desenho,
   o desenho é só traço de uma lista fixa, e nenhum texto vira SVG. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../js/orcamento-rotulos.js');
const I = require('../../js/orcamento-icones.js');

test('toda opção das listas fechadas tem um ícone (ramo, objetivos, site, material, dores)', () => {
  const faltam = [];
  for (const [grupo, lista] of [['ramo', R.RAMOS], ['objetivos', R.OBJETIVOS], ['site', R.SITE_ATUAL], ['material', R.MATERIAL]]) {
    for (const valor of Object.keys(lista)) if (!I.nomeDe(valor, grupo)) faltam.push(grupo + ':' + valor);
  }
  for (const valor of Object.keys(R.SUGESTOES)) if (!I.nomeDe(valor, 'dor')) faltam.push('dor:' + valor);
  assert.deepEqual(faltam, [], 'opções sem ícone: ' + faltam.join(', '));
});

test('todo ícone apontado existe na lista de traços, e todo traço é só comando de caminho (sem texto solto)', () => {
  for (const [chave, nome] of Object.entries(I.DE)) assert.ok(Object.prototype.hasOwnProperty.call(I.TRACOS, nome), chave + ' aponta para "' + nome + '", que não existe');
  for (const [nome, caminhos] of Object.entries(I.TRACOS)) {
    assert.ok(caminhos.length > 0, nome);
    for (const d of caminhos) assert.match(d, /^[MmLlHhVvAaCcSsZz0-9 .,\-]+$/, nome + ': só comandos de caminho');
  }
});

test('o mesmo valor em grupos diferentes pode ter ícones diferentes ("nao": sem site x sem logo); valor desconhecido não tem ícone', () => {
  assert.notEqual(I.nomeDe('nao', 'site'), I.nomeDe('nao', 'material'));
  assert.equal(I.nomeDe('qualquer_coisa', 'ramo'), '');
  assert.equal(I.nomeDe('__proto__', 'ramo'), '');
  assert.equal(I.nomeDe('constructor'), '');
});

test('desenhar monta um <svg> decorativo só com <path> (aria-hidden, sem foco), e devolve null sem desenho', () => {
  const criados = [];
  const doc = { createElementNS: (ns, tag) => { const e = { ns, tag, attrs: {}, filhos: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(f) { this.filhos.push(f); } }; criados.push(e); return e; } };
  const svg = I.desenhar('saude', 'ramo', doc);
  assert.equal(svg.tag, 'svg'); assert.equal(svg.ns, 'http://www.w3.org/2000/svg');
  assert.equal(svg.attrs['aria-hidden'], 'true'); assert.equal(svg.attrs.focusable, 'false'); assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.ok(svg.filhos.length > 0 && svg.filhos.every(f => f.tag === 'path' && typeof f.attrs.d === 'string'));
  assert.equal(I.desenhar('nao_existe', 'ramo', doc), null);
});

test('os nomes de grupo que js/orcamento-toques.js passa (conversa e "Mudar") são os que a lista de ícones conhece: um erro de digitação não some em silêncio', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-toques.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const grupos = [...new Set(Object.keys(I.DE).map(k => k.split(':')[0]))].sort();
  assert.deepEqual(grupos, ['dor', 'material', 'objetivos', 'ramo', 'site']);
  for (const g of grupos) assert.ok(fonte.includes("grupo: '" + g + "'"), 'a conversa não passa grupo: ' + g);
  for (const g of ['ramo', 'objetivos', 'site', 'material']) assert.ok(fonte.includes(", '" + g + "'));"), 'o "Mudar" não passa o grupo ' + g);
});

test('o módulo não escreve HTML: sem innerHTML, sem style inline (CSP style-src self)', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-icones.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(fonte, /innerHTML|insertAdjacentHTML|\.style\b|setAttribute\(\s*['"]style/);
});
