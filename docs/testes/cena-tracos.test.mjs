/* Mapa vivo v2, Fase 2, PR 2: a geometria da cena (js/cena-tracos.js), o "corte arquitetônico" do lugar. Puro: cena -> grupos de traços.
   O que se prova: só cena válida desenha; nenhum texto, só caminhos com números e letras de comando; quantas pessoas = gente; quantos canais =
   canais; só a oferta leva o acento; cada lugar tem o seu móvel; determinismo e unicidade (os 18 casos do dicionário dão 18 desenhos); os ícones
   dos canais iguais aos do mapa do caso (js/mapa-desenho.js); a ordem de entrada (sala, gente, oferta) para a sequência de movimento. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../../js/cena-tracos.js');
const F = require('../../js/orcamento-cena-forma.js');
const D = require('../../js/cena-dicionario.js');

const BASE = { lugar: 'cozinha', gente: 3, canais: ['instagram', 'whatsapp'], oferta: 'cardapio', destaque: 'fotos' };
const grupos = (d, papel) => d.grupos.filter(g => g.papel === papel);
const SO_CAMINHO = /^[MLHVCSQTAZmlhvcsqtaz0-9 .,-]+$/;

test('cena inválida não desenha; a válida dá viewBox fixo e grupos congelados', () => {
  for (const c of [null, undefined, {}, { ...BASE, lugar: 'castelo' }, { ...BASE, gente: 9 }, 'cozinha']) assert.equal(T.tracosDaCena(c), null, JSON.stringify(c));
  const d = T.tracosDaCena(BASE);
  assert.equal(d.viewBox, '0 0 320 120');
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.grupos));
});

test('nenhum texto: cada traço é só caminho (números e comandos); posição e escala são números', () => {
  for (const lugar of F.LUGARES) for (const oferta of F.OFERTAS) {
    const d = T.tracosDaCena({ ...BASE, lugar, oferta });
    for (const g of d.grupos) {
      assert.ok(['piso', 'sala', 'movel', 'gente', 'canal', 'oferta', 'destaque'].includes(g.papel), g.papel);
      for (const k of ['x', 'y', 'escala', 'ordem']) assert.equal(typeof g[k], 'number', k);
      for (const tr of g.tracos) assert.match(tr.d, SO_CAMINHO, lugar + ' ' + oferta);
    }
  }
});

test('gente: uma figura por pessoa (0 a 6); canais: um ícone e uma linha até a porta por canal', () => {
  for (let gente = 0; gente <= 6; gente++) assert.equal(grupos(T.tracosDaCena({ ...BASE, gente }), 'gente').length, gente, String(gente));
  for (const canais of [[], ['instagram'], ['instagram', 'whatsapp', 'indicacao']]) {
    const d = T.tracosDaCena({ ...BASE, canais });
    assert.equal(grupos(d, 'canal').length, canais.length);
  }
});

test('só a oferta leva o acento; sem oferta, nenhum traço com acento; sem destaque, nenhum grupo de destaque', () => {
  const d = T.tracosDaCena(BASE);
  for (const g of d.grupos) for (const tr of g.tracos) assert.equal(tr.ac, g.papel === 'oferta', g.papel);
  const sem = T.tracosDaCena({ ...BASE, oferta: null, destaque: null });
  assert.equal(grupos(sem, 'oferta').length, 0);
  assert.equal(grupos(sem, 'destaque').length, 0);
  assert.ok(sem.grupos.every(g => g.tracos.every(tr => !tr.ac)));
  for (const destaque of F.DESTAQUES) assert.equal(grupos(T.tracosDaCena({ ...BASE, destaque }), 'destaque').length, 1, destaque);
});

test('cada lugar tem o seu móvel (10 desenhos diferentes); cada oferta tem o seu ícone (12 diferentes)', () => {
  const moveis = F.LUGARES.map(lugar => JSON.stringify(grupos(T.tracosDaCena({ ...BASE, lugar }), 'movel')));
  assert.equal(new Set(moveis).size, F.LUGARES.length);
  const ofertas = F.OFERTAS.map(oferta => JSON.stringify(grupos(T.tracosDaCena({ ...BASE, oferta }), 'oferta')));
  assert.equal(new Set(ofertas).size, F.OFERTAS.length);
});

test('a ordem de entrada: piso e sala primeiro, depois o móvel, as pessoas uma a uma, os canais, a oferta e o destaque por último', () => {
  const d = T.tracosDaCena({ ...BASE, gente: 4 });
  const ordem = papel => grupos(d, papel).map(g => g.ordem);
  assert.ok(Math.max(...ordem('piso'), ...ordem('sala')) < Math.min(...ordem('movel')));
  const gente = ordem('gente');
  assert.deepEqual(gente, [...gente].sort((a, b) => a - b));
  assert.equal(new Set(gente).size, gente.length, 'uma a uma');
  assert.ok(Math.max(...gente) < Math.min(...ordem('oferta')));
  assert.ok(Math.max(...ordem('oferta')) <= Math.min(...ordem('destaque')));
});

test('determinismo e unicidade: os mesmos casos do dicionário dão os mesmos desenhos, e casos diferentes dão desenhos diferentes', () => {
  const casos = [
    ['alimentacao', 'Somos 4, vendemos marmitas', ['instagram']], ['alimentacao', 'Só eu, faço bolos sob encomenda', ['whatsapp']],
    ['saude', 'Clínica odontológica, somos 3 dentistas', ['instagram']], ['saude', 'Estúdio de pilates, só eu', ['indicacao']],
    ['beleza', 'Barbearia, somos 2', ['instagram', 'passa_na_frente']], ['servicos', 'Oficina mecânica, 3 funcionários', ['google_mapa']],
    ['servicos', 'Faço reformas de casas, equipe de 5', ['indicacao']], ['comercio', 'Loja de roupas, vitrine no centro', ['instagram']],
    ['educacao', 'Curso de inglês, turmas pequenas', ['facebook']], ['associacao', 'Associação de moradores', ['whatsapp']]
  ].map(([ramo, texto, canais]) => D.cenaDoCaso({ ramo, texto, canais, objetivos: [], regulado: false }));
  const a = casos.map(c => JSON.stringify(T.tracosDaCena(c)));
  const b = casos.map(c => JSON.stringify(T.tracosDaCena(c)));
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, casos.length);
});

test('os ícones dos canais são os mesmos do mapa do caso (js/mapa-desenho.js): as duas tabelas não podem divergir', () => {
  const fonte = arq => fs.readFileSync(new URL('../../js/' + arq, import.meta.url), 'utf8');
  const tabela = (src, inicio) => {
    const i = src.indexOf(inicio);
    assert.ok(i >= 0, inicio);
    return src.slice(i, src.indexOf('};', i)).replace(/\s+/g, ' ').replace(/^[^{]*\{/, '');
  };
  assert.equal(tabela(fonte('cena-tracos.js'), 'var CANAIS = {'), tabela(fonte('mapa-desenho.js'), 'var ORIGENS = {'));
});

test('fonte com sintaxe ES5, sem DOM; nenhuma página carrega ainda', () => {
  const fonte = fs.readFileSync(new URL('../../js/cena-tracos.js', import.meta.url), 'utf8');
  assert.ok(!/\blet\b|\bconst\b|=>|`|innerHTML|document\./.test(fonte));
  for (const p of fs.readdirSync(new URL('../../', import.meta.url)).filter(n => n.endsWith('.html'))) {
    assert.ok(!/cena-tracos/.test(fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8')), p);
  }
});
