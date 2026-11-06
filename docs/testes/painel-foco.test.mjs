/* O PAINEL QUE ROLA POR DENTRO É ALCANÇÁVEL PELO TECLADO E PELA LUPA (pendência B6 do 2d; WCAG 2.1.1). Em >= 900 px a coluna do painel (.orc-painel) rola por dentro quando tem
   peças ou o radar (css/orcamento-painel.css); sem filho focável o Tab não chega no que está abaixo da dobra dela. A lógica mora num lugar só, em js/orcamento-painel.js
   (BZPainel.focavel): o <aside> ganha tabindex="0" quando de fato rola (scrollHeight > clientHeight), a cada render e no resize, e nunca quando não rola. O radar só avisa
   o painel quando monta ou some (js/orcamento-radar.js).  node --test docs/testes/painel-foco.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lerFonte = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FONTE = lerFonte('js/orcamento-painel.js');

/* um <aside> de mentira com o ponto de montagem #o-peca dentro, e uma janela com ouvintes */
function ambiente({ rola = true } = {}) {
  const attrs = {};
  const aside = { scrollHeight: rola ? 2000 : 600, clientHeight: 700, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); }, removeAttribute: (k) => { delete attrs[k]; } };
  const no = () => ({ className: '', textContent: '', children: [], hidden: true, parentNode: aside, appendChild(c) { this.children.push(c); return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); }, get firstChild() { return this.children[0] || null; } });
  const raiz = no();
  const ouvintes = {};
  const janela = { addEventListener: (t, f) => { (ouvintes[t] = ouvintes[t] || []).push(f); } };
  new Function('window', FONTE)(janela);
  const doc = { getElementById: (id) => (id === 'o-peca' ? raiz : null), createElement: () => no() };
  return { aside, raiz, janela, ouvintes, doc };
}
function comDocumento(amb, fn) {
  const anterior = globalThis.document;
  globalThis.document = amb.doc;
  try { return fn(); } finally { globalThis.document = anterior; }
}

test('B6: o painel rola por dentro (peças, sem o radar): o <aside> ganha tabindex="0" a cada render', () => {
  const amb = ambiente();
  comDocumento(amb, () => amb.janela.BZPainel.atualizar({ anotamos: ['Vende bolos'] }));
  assert.equal(amb.aside.getAttribute('tabindex'), '0');
});

test('B6: o painel NÃO rola (celular, ou coluna curta): sem tabindex, o Tab não para num bloco que não precisa', () => {
  const amb = ambiente({ rola: false });
  comDocumento(amb, () => amb.janela.BZPainel.atualizar({ anotamos: ['Vende bolos'] }));
  assert.equal(amb.aside.getAttribute('tabindex'), null);
  amb.aside.scrollHeight = amb.aside.clientHeight + 1;   /* meio pixel de arredondamento não conta */
  comDocumento(amb, () => amb.janela.BZPainel.focavel());
  assert.equal(amb.aside.getAttribute('tabindex'), null);
});

test('B6: reavalia a cada render e no resize (a janela cresce, o painel deixa de rolar; encolhe, volta a rolar)', () => {
  const amb = ambiente();
  comDocumento(amb, () => amb.janela.BZPainel.atualizar({ anotamos: ['a'] }));
  assert.equal(amb.aside.getAttribute('tabindex'), '0');
  assert.equal((amb.ouvintes.resize || []).length, 1, 'um ouvinte de resize só');
  amb.aside.scrollHeight = 600;
  comDocumento(amb, () => amb.ouvintes.resize[0]());
  assert.equal(amb.aside.getAttribute('tabindex'), null);
  amb.aside.scrollHeight = 2500;
  comDocumento(amb, () => amb.janela.BZPainel.atualizar({ anotamos: ['a'] }));
  assert.equal(amb.aside.getAttribute('tabindex'), '0', 'o render também reavalia');
  assert.equal(amb.ouvintes.resize.length, 1, 'e não empilha ouvintes a cada render');
});

test('B6: painel sem peças (sem painel no estado) mas que rola por dentro por outro motivo (o radar): quem decide é a altura, não a peça', () => {
  const amb = ambiente();
  comDocumento(amb, () => amb.janela.BZPainel.atualizar(undefined));
  assert.equal(amb.aside.getAttribute('tabindex'), '0');
});

test('B6: o radar avisa o painel (focavel) quando monta e quando some; é a mesma lógica, não uma cópia', () => {
  const amb = ambiente();
  comDocumento(amb, () => { amb.aside.scrollHeight = 600; amb.janela.BZPainel.focavel(); });
  assert.equal(amb.aside.getAttribute('tabindex'), null);
  amb.aside.scrollHeight = 2000;   /* o radar acabou de montar */
  comDocumento(amb, () => amb.janela.BZPainel.focavel());
  assert.equal(amb.aside.getAttribute('tabindex'), '0');
});

test('B6: robusto sem a página (sem #o-peca, sem pai, sem addEventListener): nada lança', () => {
  const amb = ambiente();
  const anterior = globalThis.document;
  try {
    globalThis.document = { getElementById: () => null, createElement: () => ({}) };
    assert.doesNotThrow(() => amb.janela.BZPainel.atualizar({ anotamos: ['x'] }));
    assert.doesNotThrow(() => amb.janela.BZPainel.focavel());
    const solto = { addEventListener: undefined };
    new Function('window', FONTE)(solto);
    globalThis.document = { getElementById: () => ({ hidden: true, appendChild() {}, removeChild() {}, firstChild: null, children: [] }), createElement: () => ({ children: [], appendChild() {} }) };
    assert.doesNotThrow(() => solto.BZPainel.atualizar(undefined), 'raiz sem pai e janela sem addEventListener');
  } finally { globalThis.document = anterior; }
});

test('B6 (fonte): o radar não tem mais tabindex nem resize próprios; delega ao painel', () => {
  const radar = lerFonte('js/orcamento-radar.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/tabindex/.test(radar), 'a regra do tabindex é do painel');
  assert.ok(!/['"]resize['"]/.test(radar), 'o resize é do painel');
  assert.match(radar, /BZPainel/, 'avisa o painel');
  const painel = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(painel, /scrollHeight > \w+\.clientHeight \+ 1/);
  assert.match(painel, /setAttribute\('tabindex', '0'\)/);
  assert.match(painel, /removeAttribute\('tabindex'\)/);
});

test('B3: só conta a rolagem de um painel que de fato rola por dentro (overflow-y computado auto ou scroll); conteúdo que vaza de um painel com overflow visible não ganha tabindex', () => {
  for (const [overflowY, esperado] of [['auto', '0'], ['scroll', '0'], ['visible', null], ['hidden', null], ['clip', null]]) {
    const amb = ambiente();
    amb.janela.getComputedStyle = () => ({ overflowY });
    comDocumento(amb, () => amb.janela.BZPainel.atualizar({ anotamos: ['a'] }));
    assert.equal(amb.aside.getAttribute('tabindex'), esperado, 'overflow-y ' + overflowY);
  }
  /* o estilo muda (a janela estreita: a regra de >= 900 px deixa de valer) e a mesma altura deixa de contar */
  const amb = ambiente();
  let ov = 'auto';
  amb.janela.getComputedStyle = () => ({ overflowY: ov });
  comDocumento(amb, () => amb.janela.BZPainel.atualizar({ anotamos: ['a'] }));
  assert.equal(amb.aside.getAttribute('tabindex'), '0');
  ov = 'visible';
  comDocumento(amb, () => amb.janela.BZPainel.focavel());
  assert.equal(amb.aside.getAttribute('tabindex'), null);
  /* sem getComputedStyle (navegador antigo): vale a altura */
  const antigo = ambiente();
  comDocumento(antigo, () => antigo.janela.BZPainel.atualizar({ anotamos: ['a'] }));
  assert.equal(antigo.aside.getAttribute('tabindex'), '0');
});

test('B4: o orcamento.html carrega o painel ANTES do radar (o radar depende do BZPainel.focavel) e o radar registra a dependência', () => {
  const html = lerFonte('orcamento.html');
  assert.ok(html.indexOf('src="js/orcamento-painel.js"') > 0 && html.indexOf('src="js/orcamento-painel.js"') < html.indexOf('src="js/orcamento-radar.js"'));
  assert.match(lerFonte('js/orcamento-radar.js'), /DEPENDÊNCIA: o BZPainel/);
});
