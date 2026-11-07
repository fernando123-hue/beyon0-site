/* A BARRA DO ESCOPO NO CELULAR (js/orcamento-escopo-barra.js): a barra presa sob o menu não pode esconder o foco do teclado (WCAG 2.4.11).
   Com o foco num campo de escrever (qualquer um da página do orçamento, não só a caixa da conversa) ela sai; com o foco em outro controle
   que ficaria embaixo dela, o controle desce para a vista (scrollIntoView "nearest", que respeita o scroll-padding da barra).
   node --test docs/testes/planta-escopo-barra.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const FONTE = fs.readFileSync(new URL('../../js/orcamento-escopo-barra.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const janela = {};
vm.runInNewContext(FONTE, { window: janela, document: {} });
const B = janela.BZEscopoBarra;

test('campo de escrever: caixa de texto, campo de texto, lista e conteúdo editável; caixa de marcar, botão e link não', () => {
  for (const el of [{ tagName: 'TEXTAREA' }, { tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT', type: 'tel' }, { tagName: 'INPUT' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) assert.equal(B.campoDeEscrita(el), true, JSON.stringify(el));
  for (const el of [{ tagName: 'INPUT', type: 'checkbox' }, { tagName: 'INPUT', type: 'radio' }, { tagName: 'INPUT', type: 'submit' }, { tagName: 'BUTTON' }, { tagName: 'A' }, null, undefined]) assert.equal(B.campoDeEscrita(el), false, JSON.stringify(el));
});

test('encobre: o elemento focado fica (mesmo em parte) atrás da barra', () => {
  const barra = { top: 64, bottom: 120 };
  assert.equal(B.encobre({ top: 70, bottom: 110 }, barra), true);
  assert.equal(B.encobre({ top: 100, bottom: 150 }, barra), true, 'em parte');
  assert.equal(B.encobre({ top: 120, bottom: 160 }, barra), false, 'logo abaixo');
  assert.equal(B.encobre({ top: 0, bottom: 40 }, barra), false, 'acima (o menu já cobre: não é da barra)');
});

test('a fonte: o foco é ouvido na página inteira (não só no formulário da conversa) e o controle encoberto desce para a vista', () => {
  const src = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(src, /doc\.addEventListener\('focusin',/);
  assert.match(src, /doc\.addEventListener\('focusout',/);
  assert.doesNotMatch(src, /form\.addEventListener\('focus/);
  assert.match(src, /scrollIntoView\(\{ block: 'nearest' \}\)/);
});
