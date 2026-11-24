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

/* um DOM de mentira para os pontos */
function paginaDosModelos({ cartoes = 3, rolagem = 0, largura = 900, visivel = 300 } = {}) {
  const pontos = { hidden: false, children: [], attrs: {}, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(p) { this.children.push(p); return p; }, removeChild(p) { this.children.splice(this.children.indexOf(p), 1); return p; }, get lastChild() { return this.children[this.children.length - 1]; } };
  const lista = { scrollLeft: rolagem, scrollWidth: largura, clientWidth: visivel, ouvintes: {},
    children: Array.from({ length: cartoes }, (_, i) => ({ offsetLeft: i * 300, classList: { contains: c => c === 'dir' } })),
    addEventListener(n, f) { this.ouvintes[n] = f; } };
  const doc = { getElementById: id => (id === 'o-dirs' ? lista : id === 'o-dirs-pontos' ? pontos : null), createElement: () => ({ className: '', is: false, classList: { toggle(c, on) { this.dono.is = on; } } }),
    defaultView: { requestAnimationFrame: f => { fila.push(f); return fila.length; }, addEventListener() {} } };
  const fila = [];
  doc.createElement = () => { const p = { className: '', is: false }; p.classList = { toggle: (c, on) => { p.is = !!on; } }; return p; };
  /* o quadro do navegador: o que foi agendado só roda quando alguém o libera */
  const quadro = () => { while (fila.length) fila.shift()(); };
  return { doc, lista, pontos, quadro };
}

test('ligar: com 3 cartões e rolagem de lado nascem 3 pontos, o do cartão à vista aceso; com 1 cartão ou sem rolagem ficam escondidos', () => {
  const a = paginaDosModelos({ rolagem: 310 });
  C.ligar(a.doc); a.quadro();
  assert.equal(a.pontos.hidden, false); assert.equal(a.pontos.children.length, 3);
  assert.deepEqual(a.pontos.children.map(p => p.is), [false, true, false]);
  a.lista.scrollLeft = 620; a.lista.ouvintes.scroll(); a.quadro();
  assert.deepEqual(a.pontos.children.map(p => p.is), [false, false, true], 'a rolagem acende o ponto do cartão à vista');
  assert.equal(paginaDosModelos({ cartoes: 1 }).pontos.hidden, false, 'ainda não ligado: o valor inicial não conta');
  const um = paginaDosModelos({ cartoes: 1 }); C.ligar(um.doc); um.quadro(); assert.equal(um.pontos.hidden, true, '1 cartão: sem pontos');
  const parado = paginaDosModelos({ largura: 300, visivel: 300 }); C.ligar(parado.doc); parado.quadro(); assert.equal(parado.pontos.hidden, true, 'sem rolagem de lado (desktop): sem pontos');
  const quase = paginaDosModelos({ largura: 303, visivel: 300 }); C.ligar(quase.doc); quase.quadro(); assert.equal(quase.pontos.hidden, true, 'folga de 3 px não é rolagem');
});

test('ligar: ligar duas vezes não duplica ouvinte nem ponto; menos cartões tiram pontos', () => {
  const a = paginaDosModelos(); let escutas = 0;
  const original = a.lista.addEventListener.bind(a.lista);
  a.lista.addEventListener = (n, f) => { escutas++; original(n, f); };
  C.ligar(a.doc); C.ligar(a.doc); a.quadro();
  assert.equal(escutas, 1);
  assert.equal(a.pontos.children.length, 3);
  a.lista.children.pop(); a.lista.ouvintes.scroll(); a.quadro();
  assert.equal(a.pontos.children.length, 2, 'o cartão que saiu leva o ponto');
});

test('o CSS do carrossel existe de verdade: lista rolando de lado com encaixe e cartão de 84%, só abaixo de 900 px', () => {
  const css = ler('css/orcamento-modelos.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const bloco = css.match(/@media \(max-width: 899px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(bloco, /\.orc-dirs \{[^}]*overflow-x: auto[^}]*scroll-snap-type: x mandatory/);
  assert.match(bloco, /\.orc-dirs > \.dir \{[^}]*flex: 0 0 84%[^}]*scroll-snap-align: start/);
  assert.match(css, /@media \(max-width: 899px\) and \(hover: hover\) and \(pointer: fine\)[\s\S]*scrollbar-width: thin/, 'quem usa mouse vê a barra de rolagem');
  assert.doesNotMatch(css, /\border:\s*-1/, 'a ordem visual não difere da do DOM');
});

test('a ordem do DOM é a que se vê: "Escolher este" (ou o selo) vem antes de "Abrir prévia" no cartão', () => {
  const js = ler('js/orcamento.js');
  const i = js.indexOf("el('span', 'dir__selo', 'Escolhida')"), j = js.indexOf("'Escolher este'"), k = js.indexOf('acoes.appendChild(abrir)');
  assert.ok(i > 0 && j > 0 && k > i && k > j, 'a ação principal entra antes de "Abrir prévia"');
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
  assert.match(html, /Escolha um e ajuste dentro dele\.\s+Trazer cores ou uma seção de outro modelo conta como um ajuste/);
  assert.match(html, /<ol class="orc-dirs" id="o-dirs" role="list">/);
  assert.match(ler('js/orcamento.js'), /Trazer cores ou uma seção de outro modelo conta como um ajuste/);
});
