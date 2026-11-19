/* O cartão do número no resumo do escopo (js/orcamento-resumo.js, remodelação 18/11, parte 3): um número grande, a entrada e o prazo,
   tirados só da proposta; nada inventado; tudo por textContent. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../js/orcamento-resumo.js');
const Pix = (() => {   /* o BZPix é script de janela: o mesmo código, avaliado com um window de mentira */
  const w = {}; new Function('window', fs.readFileSync(new URL('../../js/orcamento-pix.js', import.meta.url), 'utf8'))(w); return w.BZPix;
})();
const dinheiro = n => 'R$ ' + String(n);
const PROPOSTA = { valor_total: 3000, sinal_percentual: 40, prazo_dias: 8 };

function elemento() { return { textContent: '', hidden: true }; }
function docDeMentira() {
  const por = { 'o-esc-numero': elemento(), 'o-esc-total': elemento(), 'o-esc-entrada': elemento(), 'o-esc-entrada-caixa': elemento(), 'o-esc-prazo': elemento(), 'o-esc-prazo-caixa': elemento() };
  return { por, getElementById: id => por[id] || null };
}

test('fatos: o total, a entrada (conta do banco) e o prazo saem da proposta', () => {
  const f = R.fatos(PROPOSTA, Pix, dinheiro);
  assert.deepEqual(f, { total: 'R$ 3000', entrada: 'R$ 1200', pct: 40, prazo: '8 dias úteis' });
});

test('fatos: um dia útil no singular; prazo ausente ou inválido não inventa número', () => {
  assert.equal(R.fatos({ ...PROPOSTA, prazo_dias: 1 }, Pix, dinheiro).prazo, '1 dia útil');
  for (const ruim of [0, -3, NaN, null, undefined, '8', Infinity]) assert.equal(R.fatos({ ...PROPOSTA, prazo_dias: ruim }, Pix, dinheiro).prazo, '', 'prazo ' + String(ruim));
});

test('fatos: sem percentual na proposta não há entrada (a tela não chuta número); sem total não há cartão', () => {
  const f = R.fatos({ valor_total: 3000, prazo_dias: 8 }, Pix, dinheiro);
  assert.equal(f.entrada, '');
  assert.equal(f.pct, null);
  assert.equal(R.fatos({ prazo_dias: 8, sinal_percentual: 40 }, Pix, dinheiro), null);
  assert.equal(R.fatos({ valor_total: 0 }, Pix, dinheiro), null);
  assert.equal(R.fatos({ valor_total: -5 }, Pix, dinheiro), null);
  assert.equal(R.fatos({ valor_total: '3000' }, Pix, dinheiro), null, 'só número de verdade');
  assert.equal(R.fatos(null, Pix, dinheiro), null);
  assert.equal(R.fatos(undefined, Pix, dinheiro), null);
});

test('fatos: sem o módulo do Pix a entrada some, o resto segue', () => {
  const f = R.fatos(PROPOSTA, null, dinheiro);
  assert.equal(f.total, 'R$ 3000');
  assert.equal(f.entrada, '');
});

test('pintar: mostra o cartão com os três fatos por textContent e esconde o que não tem', () => {
  const d = docDeMentira();
  R.pintar(d, R.fatos(PROPOSTA, Pix, dinheiro));
  assert.equal(d.por['o-esc-numero'].hidden, false);
  assert.equal(d.por['o-esc-total'].textContent, 'R$ 3000');
  assert.equal(d.por['o-esc-entrada'].textContent, 'R$ 1200');
  assert.equal(d.por['o-esc-prazo'].textContent, '8 dias úteis');
  assert.equal(d.por['o-esc-entrada-caixa'].hidden, false);
  assert.equal(d.por['o-esc-prazo-caixa'].hidden, false);
  R.pintar(d, R.fatos({ valor_total: 3000, prazo_dias: 0 }, Pix, dinheiro));
  assert.equal(d.por['o-esc-entrada-caixa'].hidden, true, 'sem entrada, a caixa some');
  assert.equal(d.por['o-esc-prazo-caixa'].hidden, true, 'sem prazo, a caixa some');
  R.pintar(d, null);
  assert.equal(d.por['o-esc-numero'].hidden, true, 'sem fatos, o cartão esconde e zera');
  assert.equal(d.por['o-esc-total'].textContent, '');
});

test('pintar: página sem os elementos (ou sem documento) não quebra', () => {
  assert.doesNotThrow(() => R.pintar({ getElementById: () => null }, R.fatos(PROPOSTA, Pix, dinheiro)));
  assert.doesNotThrow(() => R.pintar(null, null));
});

test('o módulo só escreve por textContent (sem innerHTML nem estilo inline) e não traz número nem nome de empresa', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-resumo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /innerHTML|outerHTML|insertAdjacentHTML|\.style\.|setAttribute\('style'/);
  assert.doesNotMatch(fonte, /R\$\s?\d/);
});

test('a página: o cartão do número fica no resumo, antes do texto do escopo; o pagamento passa a se chamar "Destravar o seu site"', () => {
  const html = fs.readFileSync(new URL('../../orcamento.html', import.meta.url), 'utf8');
  const esc = html.slice(html.indexOf('id="o-escopo"'), html.indexOf('id="o-pagamento"'));
  for (const id of ['o-esc-numero', 'o-esc-total', 'o-esc-entrada', 'o-esc-prazo']) assert.ok(esc.includes('id="' + id + '"'), id + ' no resumo');
  assert.ok(esc.indexOf('id="o-esc-numero"') < esc.indexOf('id="o-esc-texto"'), 'o número vem antes do texto');
  assert.ok(esc.includes('id="o-esc-texto"') && /<div class="orc-escopo" id="o-esc-texto" tabindex="0" role="region"/.test(esc), 'o texto do escopo segue inteiro e à vista (é ele que a pessoa confirma)');
  assert.ok(html.includes('>Destravar o seu site<'), 'o título do pagamento');
  assert.ok(!html.includes('>Para começar<'), 'o nome antigo saiu da tela');
  assert.ok(html.indexOf('js/orcamento-resumo.js') > 0 && html.indexOf('js/orcamento-resumo.js') < html.indexOf('js/orcamento.js'), 'o módulo carrega antes do orcamento.js');
  const orc = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8');
  assert.match(orc, /BZOrcResumo/);
  assert.match(orc, /\$\('o-pag-titulo'\)\.textContent = 'Destravar o seu site'/);
});

test('o cartão do número: só transform/opacidade, sem blur nem brilho; o número cabe a 320 px', () => {
  const css = fs.readFileSync(new URL('../../css/orcamento-casca.css', import.meta.url), 'utf8');
  const bloco = css.slice(css.indexOf('.esc-numero'));
  assert.ok(bloco.length > 0, 'a regra existe');
  assert.doesNotMatch(bloco, /blur\(|drop-shadow|box-shadow:[^;]*[1-9]\d*px [1-9]\d*px [1-9]\d*px/, 'sem blur nem brilho');
  assert.match(bloco, /overflow-wrap:\s*anywhere|word-break/, 'o número não estoura a coluna');
});
