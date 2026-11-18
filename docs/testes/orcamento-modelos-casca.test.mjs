/* Parte 2 da casca do orçamento (modelos e ajustes, remodelação 18/11): os pontos do carrossel, os ícones das opções de ajuste
   e as regras de CSP/movimento dos arquivos novos. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../../js/orcamento-carrossel.js');
const I = require('../../js/orcamento-icones.js');
const ler = a => fs.readFileSync(new URL('../../' + a, import.meta.url), 'utf8');

const janela = {};
new Function('window', ler('js/orcamento-ajustes.js'))(janela);
const A = janela.BZAjustes;

test('indiceAtual: o cartão à vista é a rolagem dividida pelo passo, arredondada e presa ao que existe', () => {
  assert.equal(C.indiceAtual(0, 300, 3), 0);
  assert.equal(C.indiceAtual(140, 300, 3), 0);
  assert.equal(C.indiceAtual(160, 300, 3), 1);
  assert.equal(C.indiceAtual(600, 300, 3), 2);
  assert.equal(C.indiceAtual(9999, 300, 3), 2, 'nunca passa do último');
  assert.equal(C.indiceAtual(-50, 300, 3), 0, 'rolagem elástica do iOS');
  for (const [r, p, t] of [[10, 0, 3], [10, -5, 3], [NaN, 300, 3], [Infinity, 300, 3], [10, 300, 0], [10, 300, -1], [10, NaN, 3]]) assert.equal(C.indiceAtual(r, p, t), 0, [r, p, t].join());
});

test('ligar: página sem a lista dos modelos ou sem os pontos não lança', () => {
  assert.doesNotThrow(() => C.ligar({ getElementById: () => null }));
  assert.doesNotThrow(() => C.ligar({ getElementById: id => (id === 'o-dirs' ? {} : null) }));
});

test('toda opção de ajuste que a tela oferece tem ícone: cores, fontes e cada seção que se acrescenta', () => {
  assert.equal(A.iconeDe({ operacao: 'usar_paleta_de', direcao: 2 }), 'paleta');
  assert.equal(A.iconeDe({ operacao: 'usar_tipografia_de', direcao: 2 }), 'fonte');
  for (const tipo of Object.keys(A.NOMES)) {
    const chave = A.iconeDe({ operacao: 'adicionar_secao', secao: tipo });
    assert.equal(chave, 'sec_' + tipo);
    assert.ok(I.nomeDe(chave, 'ajuste'), 'a seção "' + tipo + '" não tem ícone');
  }
  assert.ok(I.nomeDe('paleta', 'ajuste') && I.nomeDe('fonte', 'ajuste'));
  for (const ruim of [null, undefined, {}, { operacao: 'adicionar_secao', secao: 'inventada' }, { operacao: 'adicionar_secao', secao: '__proto__' }, { operacao: 'remover_secao', secao: 'faq' }]) assert.equal(A.iconeDe(ruim), '', JSON.stringify(ruim));
});

test('os desenhos novos (cores, fontes, pergunta) são só caminhos de traço', () => {
  for (const nome of ['paleta', 'fonte', 'pergunta']) for (const d of I.TRACOS[nome]) assert.match(d, /^[MmLlHhVvAaCcSsZz0-9 .,\-]+$/, nome);
});

test('o CSS da parte 2 só se move em transform/opacidade/cor, só com movimento liberado, e não tem blur nem style inline', () => {
  const css = ler('css/orcamento-modelos.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /blur\(|backdrop-filter|box-shadow|text-shadow/);
  const bloco = css.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/)[1];
  for (const m of bloco.matchAll(/transition:\s*([^;]+);/g)) assert.doesNotMatch(m[1], /\b(width|height|margin|padding|top|left)\b/, 'transição de layout: ' + m[1]);
  const js = ler('js/orcamento-carrossel.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|\.style\b|setAttribute\(\s*['"]style/);
});

test('o HTML liga os arquivos novos, os pontos são decorativos e a regra dos modelos segue dita (um modelo só; trazer de outro conta como ajuste)', () => {
  const html = ler('orcamento.html');
  assert.match(html, /<link rel="stylesheet" href="css\/orcamento-modelos\.css" \/>/);
  assert.match(html, /<script src="js\/orcamento-carrossel\.js" defer><\/script>/);
  assert.match(html, /<div class="orc-pontos" id="o-dirs-pontos" aria-hidden="true"><\/div>/);
  assert.match(html, /escolha um\. Trazer cores ou uma seção de outro modelo conta como um ajuste/);
  assert.match(ler('js/orcamento.js'), /Trazer cores ou uma seção de outro modelo conta como um ajuste/);
});
