/* A trilha do pedido depois do pagamento (css/orcamento-casca.css, remodelação 18/11, parte 4): bolinhas que enchem, o endereço do site
   em destaque, tudo só em transform/opacidade e parado com movimento reduzido. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../css/orcamento-casca.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bloco = css.slice(css.indexOf('parte 4: a trilha do pedido'));

test('a trilha existe: bolinha por passo, cheia no feito, com anel no agora', () => {
  assert.ok(bloco.length > 0 && css.includes('parte 4: a trilha do pedido'));
  assert.match(bloco, /\.orc-pedido \.orc-passo__n[^{]*\{[^}]*border-radius:\s*50%/);
  assert.match(bloco, /\.orc-passo\.is-feito \.orc-passo__n\s*\{[^}]*background:\s*var\(--ac\)/);
  assert.match(bloco, /\.orc-passo\.is-agora \.orc-passo__n\s*\{[^}]*border-color:\s*var\(--ac\)/);
});

test('o seletor vence o da tela de entrega (que carrega depois): começa por .orc-pedido ou .orc-antes-passos', () => {
  for (const linha of bloco.split('\n').filter(l => /\.orc-passo__n/.test(l) && /\{/.test(l) && !/@keyframes/.test(l))) {
    assert.match(linha.trim(), /^(\.orc-pedido|\.orc-antes-passos|html:not\(\.menos-movimento\) \.orc-pedido)/, linha.trim().slice(0, 80));
  }
});

test('sem blur nem brilho: nenhum filter, blur, drop-shadow ou box-shadow no bloco', () => {
  assert.doesNotMatch(bloco, /blur\(|drop-shadow|filter:|box-shadow:/);
});

test('o movimento é acréscimo: o pulso só com movimento liberado e só em transform e opacidade', () => {
  const pulso = bloco.slice(bloco.indexOf('@keyframes trilha-pulsa'));
  assert.match(pulso, /opacity/);
  assert.match(pulso, /transform/);
  assert.doesNotMatch(pulso, /width|height|top|left|margin/);
  const idx = bloco.indexOf('trilha-pulsa 2.4s');
  assert.ok(idx > bloco.indexOf('prefers-reduced-motion: no-preference'), 'a animação mora dentro do no-preference');
});

test('o endereço do site fica em destaque sem estourar a coluna', () => {
  assert.match(bloco, /\.orc-noar__endereco[^{]*\{[^}]*font-size:\s*clamp\(/);
  const previa = fs.readFileSync(new URL('../../css/orcamento-previa.css', import.meta.url), 'utf8');
  assert.match(previa, /\.orc-noar__endereco\s*\{[^}]*overflow-wrap:\s*anywhere/, 'a quebra de linha segue na regra original');
});
