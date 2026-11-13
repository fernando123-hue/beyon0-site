/* A CONSAGRAÇÃO DA PLANTA VIVA v2 no módulo real (js/planta-desenho.js, a única entrada agora; decisões do dono de 12/11: o esboço construído na
   conversa SUBSTITUI o emaranhado do 05/11; a luz que percorre tudo e o ouro no fim continuam; a nota fica embaixo do desenho, junto dos botões).
   Num DOM de mentira (docs/testes/planta-dom-falso.mjs). O que se prova:
   - sem emaranhado; a luz acende tudo, o ouro só no LED, e o fim é o do módulo aprovado ("Planta pronta" + o fecho, o status, o repouso);
   - o voo: as estações que o esboço tinha (opcoes.esboco(), lido UMA vez, quando a entrada começa) saem do lugar delas na tela por transform; sem
     pontos (esboço fora da tela, conversa retomada) não há voo e elas surgem como esboço;
   - o som (opcoes.som): um tique por estação que a luz acende e o ouro uma vez;
   - a nota embaixo (opcoes.notaEmbaixo): logo antes dos botões;
   - movimento reduzido: o quadro final na hora, sem pedir os pontos do esboço nem tocar som; "Rever a montagem" refaz sem voo.
   node --test docs/testes/planta-consagracao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import M from '../../js/planta-desenho.js';
import { criarJanela } from './planta-dom-falso.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));
function ambiente(opcoes) {
  const w = criarJanela(opcoes);
  const A = M.criar(w);
  return { w, A, raiz: w.raiz(w.opcoes.largura) };
}
const quadroDe = (raiz) => raiz.porClasse('plv-quadro')[0];
const aceso = (n) => n._classes.has('is-aceso');
const noDe = (raiz, id) => quadroDe(raiz).achar((n) => n.attrs['data-id'] === id && n.namespaceURI)[0];
const movDe = (raiz, id) => noDe(raiz, id).filhos.find((f) => f._classes.has('plv-mov'));
const V2 = (extra) => Object.assign({ notaEmbaixo: true }, extra || {});

test('entrada v2: sem emaranhado; a luz acende tudo, o ouro só no LED, e termina com "Planta pronta" + o fecho', () => {
  const { w, A, raiz } = ambiente();
  const plano = fx('clinica');
  A.montar(raiz, plano, V2());
  assert.equal(quadroDe(raiz).achar((n) => n._classes.has('plv-tang')).length, 0, 'nada de emaranhado');
  w.mostrar(1);
  w.avancar(15000);
  assert.ok(quadroDe(raiz).achar((n) => n._classes.has('plv-no')).every(aceso), 'tudo aceso');
  assert.ok(noDe(raiz, 'led')._classes.has('is-ouro'));
  assert.ok(!quadroDe(raiz)._classes.has('plv--pre'));
  assert.ok(raiz.porClasse('plv-status')[0].textContent.startsWith('Planta pronta, com 8 etapas. '));
  assert.equal(raiz.porClasse('plv-leitura__tag')[0].textContent, 'Planta pronta');
  assert.equal(raiz.porClasse('plv-leitura__txt')[0].textContent, plano.fecho);
});

test('o voo: os pontos do esboço são lidos UMA vez, quando a entrada começa; quem tinha ponto sai do lugar dele por transform; os outros surgem como esboço', () => {
  const { w, A, raiz } = ambiente();
  const plano = fx('clinica');
  let lidos = 0;
  const id = plano.etapas[0].id;
  const pontos = () => { lidos++; return { chegada: { x: 40, y: 900, s: 24, tx: 70, ty: 880 }, [id]: { x: 40, y: 960, s: 24, tx: 70, ty: 940 } }; };
  A.montar(raiz, plano, V2({ esboco: pontos }));
  assert.equal(lidos, 0, 'ainda não: a entrada espera a vista');
  w.mostrar(1);
  assert.equal(lidos, 1, 'lidos quando a entrada começou');
  for (const voa of ['chegada', id]) {
    const a = movDe(raiz, voa).animacoes.find((x) => /translate\(.*\) scale\(/.test(x.keyframes[0].transform || ''));
    assert.ok(a, voa + ' voa (translate + scale)');
    assert.equal(a.opcoes.fill, 'backwards');
  }
  const outro = plano.etapas[1].id;
  assert.ok(!movDe(raiz, outro).animacoes.some((x) => /scale\(/.test(x.keyframes[0].transform || '')), 'sem ponto, sem voo');
  w.avancar(1500);
  assert.ok(noDe(raiz, outro)._classes.has('is-esboco') || aceso(noDe(raiz, outro)), 'o que não voou surgiu como esboço');
  w.avancar(15000);
  assert.equal(lidos, 1);
});

test('sem pontos (esboço fora da tela, conversa retomada): não há voo; luz e ouro como sempre', () => {
  const { w, A, raiz } = ambiente();
  const plano = fx('loja');
  A.montar(raiz, plano, V2({ esboco: () => null }));
  w.mostrar(1);
  assert.ok(!quadroDe(raiz).achar((n) => n._classes.has('plv-mov')).some((m) => m.animacoes.some((x) => /scale\(/.test(x.keyframes[0].transform || ''))));
  w.avancar(15000);
  assert.ok(noDe(raiz, 'led')._classes.has('is-ouro'));
});

test('o som: um tique ("passa") por estação que a luz acende e o ouro UMA vez', () => {
  const { w, A, raiz } = ambiente();
  const sons = [];
  A.montar(raiz, fx('clinica'), V2({ som: (n) => sons.push(n) }));
  w.mostrar(1);
  w.avancar(15000);
  assert.equal(sons.filter((s) => s === 'ouro').length, 1);
  assert.ok(sons.filter((s) => s === 'passa').length >= 5);
  assert.deepEqual([...new Set(sons)].sort(), ['ouro', 'passa']);
  void raiz;
});

test('a nota embaixo (decisão de 12/11): logo antes dos botões, depois do desenho e da legenda', () => {
  const { A, raiz } = ambiente({ reduzido: true });
  A.montar(raiz, fx('clinica'), V2());
  const filhos = raiz.porClasse('plv')[0].children.map((c) => [...c._classes][0]);
  const i = (c) => filhos.indexOf(c);
  assert.ok(i('plv-quadro') < i('plv-nota') && i('plv-leitura') < i('plv-nota'), 'a nota vem depois do desenho e da legenda: ' + filhos.join(','));
  assert.equal(i('plv-nota') + 1, i('plv-acoes'), 'logo antes dos botões');
});

test('movimento reduzido: o quadro final na hora, sem ler os pontos do esboço e sem som', () => {
  const { A, raiz } = ambiente({ reduzido: true });
  let lidos = 0;
  const sons = [];
  A.montar(raiz, fx('clinica'), V2({ esboco: () => { lidos++; return {}; }, som: (n) => sons.push(n) }));
  assert.ok(quadroDe(raiz).achar((n) => n._classes.has('plv-no')).every(aceso));
  assert.ok(noDe(raiz, 'led')._classes.has('is-ouro'));
  assert.equal(lidos, 0);
  assert.deepEqual(sons, []);
});

test('"Rever a montagem" refaz a entrada v2 sem emaranhado', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('clinica'), V2({ esboco: () => null }));
  w.mostrar(1);
  w.avancar(15000);
  raiz.porClasse('plv-btn--txt')[0].disparar('click');
  assert.equal(quadroDe(raiz).achar((n) => n._classes.has('plv-tang')).length, 0);
  w.mostrar(1);
  w.avancar(15000);
  assert.ok(noDe(raiz, 'led')._classes.has('is-ouro'));
});
