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
import L from '../../js/planta-layout.js';
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

test('os números do voo: o grupo sai do ponto do esboço na tela (relativo ao quadro final) com a escala do chip, e o texto sai do canto do texto', () => {
  const { w, A, raiz } = ambiente();
  const plano = fx('clinica');
  A.montar(raiz, plano, V2({ esboco: () => ({ chegada: { x: 140, y: 260, s: 24, tx: 150, ty: 300 } }) }));
  quadroDe(raiz).getBoundingClientRect = () => ({ left: 100, top: 200, right: 490, bottom: 1136, width: 390, height: 936 });
  w.mostrar(1);
  const no = noDe(raiz, 'chegada');
  const n = { x: Number(/translate\(([-\d.]+)/.exec(no.attrs.transform)[1]), y: Number(/translate\([-\d.]+ ([-\d.]+)/.exec(no.attrs.transform)[1]) };
  const kf = movDe(raiz, 'chegada').animacoes.find((a) => /scale\(/.test(a.keyframes[0].transform || '')).keyframes[0].transform;
  const [, tx, ty, s] = /translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(kf).map(Number);
  /* o centro do ícone (pela geometria do layout: ic = [x, y, escala], 40 de lado na escala 1) cai no ponto do esboço relativo ao quadro (140 - 100, 260 - 200) */
  const ic = L.montarGeometria(plano, 390).nos.find((x) => x.id === 'chegada').ic || [11, 34, 1];
  const cx = ic[0] + 20 * ic[2], cy = ic[1] + 20 * ic[2];
  assert.ok(Math.abs(s - 24 / (40 * ic[2])) < 0.011, 'escala: a metade do chip (24) sobre a metade do ícone: ' + s + ' ic ' + ic);
  assert.ok(Math.abs(n.x + tx + s * cx - 40) < 0.5 && Math.abs(n.y + ty + s * cy - 60) < 0.5, 'o centro do ícone sai do ponto do esboço: ' + kf + ' ic ' + ic + ' n ' + JSON.stringify(n));
  const li = quadroDe(raiz).porTag('li').find((l) => l.dataset.id === 'chegada');
  const kli = li.animacoes.find((a) => /translate/.test(a.keyframes[0].transform || '')).keyframes[0].transform;
  const [, lx, ly] = /translate\(([-\d.]+)px,([-\d.]+)px\)/.exec(kli).map(Number);
  assert.ok(Math.abs(n.x + lx - 50) < 0.2 && Math.abs(n.y + ly - 100) < 0.2, 'o texto sai do canto do texto do esboço: ' + kli);
});

test('à espera da vista (antes de a entrada começar): nenhuma rota do desenho final aparece sem as estações; ao começar, a espera sai (achado do vídeo da página real, 13/11)', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('clinica'), V2({ esboco: () => null }));
  const q = quadroDe(raiz);
  assert.ok(q._classes.has('plv--pre'));
  assert.ok(q._classes.has('plv--espera'), 'esperando a vista: as rotas ficam escondidas');
  w.mostrar(1);
  assert.ok(!q._classes.has('plv--espera'), 'a entrada começou: as rotas passam a ser da animação');
  w.avancar(15000);
  assert.ok(!q._classes.has('plv--espera'));
  raiz.porClasse('plv-btn--txt')[0].disparar('click');   /* "Rever a montagem", com o quadro à vista: a entrada recomeça na hora */
  assert.ok(!quadroDe(raiz)._classes.has('plv--espera'));
});

test('movimento reduzido: o quadro final não fica na espera', () => {
  const { A, raiz } = ambiente({ reduzido: true });
  A.montar(raiz, fx('clinica'), V2());
  assert.ok(!quadroDe(raiz)._classes.has('plv--espera'));
});

test('a espera nunca fica presa: movimento reduzido ligado ou um ajuste chegando antes de a entrada começar levam ao desenho com as rotas (revisão técnica)', () => {
  {
    const { w, A, raiz } = ambiente();
    A.montar(raiz, fx('clinica'), V2({ esboco: () => null }));
    assert.ok(quadroDe(raiz)._classes.has('plv--espera'));
    w.BEYON.emit('reduzir', true);   /* o cartão ainda fora da vista: a pessoa liga o movimento reduzido */
    assert.ok(noDe(raiz, 'led')._classes.has('is-ouro'), 'o quadro final');
    assert.ok(!quadroDe(raiz)._classes.has('plv--espera'), 'reduzido no meio da espera: sem a espera');
  }
  {
    const { A, raiz } = ambiente();
    const plano = fx('clinica');
    A.montar(raiz, plano, V2({ esboco: () => null }));
    const novo = JSON.parse(JSON.stringify(plano)); novo.etapas[1].id = 'nova-etapa';
    assert.equal(A.atualizar(novo, {}).ok, true);
    assert.ok(!quadroDe(raiz)._classes.has('plv--espera'), 'ajuste no meio da espera: sem a espera');
  }
});

test('o CSS da espera esconde as rotas (a limpa e a fantasma) e os rótulos dos ramos (no computador a faixa entrava com "→ serviço simples" solto na grade)', () => {
  const css = fs.readFileSync(new URL('../../css/orcamento-planta.css', import.meta.url), 'utf8');
  assert.match(css, /\.plv--espera \.plv-limpa,\s*\.plv--espera \.plv-fantasma,\s*\.plv--espera \.plv-rots\s*\{\s*visibility:\s*hidden;?\s*\}/);
});

test('is-voo (o quadro sem recorte enquanto o voo dura) sai também quando a entrada é cancelada antes do fim do voo (ajuste, movimento reduzido)', () => {
  const { w, A, raiz } = ambiente();
  const plano = fx('clinica');
  A.montar(raiz, plano, V2({ esboco: () => ({ chegada: { x: 40, y: 60, s: 24, tx: 50, ty: 50 } }) }));
  w.mostrar(1);
  assert.ok(quadroDe(raiz)._classes.has('is-voo'));
  w.avancar(300);
  const novo = JSON.parse(JSON.stringify(plano)); novo.etapas[1].id = 'nova-etapa';   /* um id novo e os outros em comum: é um AJUSTE */
  assert.equal(A.atualizar(novo, {}).ok, true);
  assert.ok(!quadroDe(raiz)._classes.has('is-voo'), 'o ajuste cancelou a entrada: sem is-voo');
  A.montar(raiz, plano, V2({ esboco: () => ({ chegada: { x: 40, y: 60, s: 24, tx: 50, ty: 50 } }) }));
  w.mostrar(1); w.avancar(300);
  w.BEYON.emit('reduzir', true);
  assert.ok(!quadroDe(raiz)._classes.has('is-voo'), 'movimento reduzido no meio do voo: sem is-voo');
});
