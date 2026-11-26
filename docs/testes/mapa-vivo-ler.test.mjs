/* MAPA VIVO v2, fase 1a: a LEITURA do que a pessoa digita, só no aparelho (js/mapa-vivo-ler.js). Os aceites 1 a 3 da especificação
   (cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "Fase 1a"). node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Ler = require('../../js/mapa-vivo-ler.js');
const codigos = t => Ler.ler(t).pecas.map(p => p.codigo);

test('aceite 1: "pelo instagram e whatsapp" acende exatamente instagram e whatsapp, com a peça e o nome curto', () => {
  assert.deepEqual(codigos('pelo instagram e whatsapp'), ['instagram', 'whatsapp']);
  const [i, w] = Ler.ler('pelo instagram e whatsapp').pecas;
  assert.deepEqual(i, { codigo: 'instagram', peca: 'chegada', nome: 'Instagram' });
  assert.deepEqual(w, { codigo: 'whatsapp', peca: 'mensagem', nome: 'WhatsApp' });
});

test('aceite 2: negação na mesma oração não acende; a palavra em outra oração acende', () => {
  assert.deepEqual(codigos('não uso instagram'), []);
  assert.deepEqual(codigos('não agendo nada pela internet'), []);
  assert.deepEqual(codigos('não uso instagram, mas o whatsapp sim'), ['whatsapp']);
  assert.deepEqual(codigos('sem sinal antecipado. Quero agenda online'), ['agenda']);
});

test('os pedidos do texto livre: agenda, sinal, orçamento, venda online (com e sem acento)', () => {
  assert.deepEqual(codigos('quero que marquem horário sozinhos'), ['agenda']);
  assert.deepEqual(codigos('cobro um sinal adiantado'), ['sinal']);
  assert.deepEqual(codigos('mando orçamento na mão'), ['orcamento']);
  assert.deepEqual(codigos('quero uma loja virtual'), ['venda']);
  assert.deepEqual(codigos('Cotação por WhatsApp'), ['whatsapp', 'orcamento']);
});

test('palavra inteira: "insta" dentro de outra palavra e "marca" de roupa não viram peça errada', () => {
  assert.deepEqual(codigos('fazemos instalação elétrica'), []);
  assert.ok(!codigos('trabalho com uma marcenaria').includes('agenda'), 'marcenaria não é "marcar"');
  assert.ok(!codigos('tenho uma marca de roupas').includes('agenda'), 'marca de roupa não é agenda');
  assert.deepEqual(codigos('os clientes querem marcar sozinhos'), ['agenda']);
});

test('toda peça existe na biblioteca de peças da planta (js/planta-pecas.js)', () => {
  const Pecas = require('../../js/planta-pecas.js');
  /* (o leitor de canais devolve no máximo 3 por texto: js/mapa-saber.js ORIGENS_MAX) */
  const todas = ['pelo instagram, whatsapp e google', 'pelo mapa, por indicação e quem passa na frente', 'agenda, sinal, orçamento, loja virtual'].flatMap(t => Ler.ler(t).pecas);
  assert.ok(todas.length >= 8, 'o teste não passa no vazio: ' + todas.length);
  for (const p of todas) assert.ok(Pecas.TIPOS.includes(p.peca), 'peça ' + p.peca + ' existe');
});

test('aceite 3: texto de 2.000 caracteres colado lê em menos de 16 ms (só os primeiros 600 contam)', () => {
  const longo = ('não uso instagram, mas atendo pelo whatsapp e quero agenda online; ' + 'a'.repeat(40) + ' ').repeat(20).slice(0, 2000);
  Ler.ler(longo);   /* (aquece) */
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) Ler.ler(longo);
  const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 16, 'uma varredura levou ' + ms.toFixed(2) + ' ms');
  assert.equal(Ler.LER_MAX, 600);
  assert.deepEqual(codigos('x'.repeat(700) + ' pelo instagram'), [], 'depois dos 600 caracteres não lê');
});

test('nunca lança: vazio, espaço, número, objeto, nulo', () => {
  for (const v of ['', '   ', 3, {}, null, undefined]) assert.deepEqual(Ler.ler(v), { pecas: [] });
});
