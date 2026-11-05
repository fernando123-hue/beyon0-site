/* O DESENHO DA PLANTA VIVA (PR 2b; spec §1.3, §4.2, §4.3, §4.4): js/planta-desenho.js montando o quadro num DOM de mentira
   (docs/testes/planta-dom-falso.mjs). O que se prova: a altura reservada é gravada na MESMA chamada em que a faixa é montada (nada nasce com
   altura 0 nem espera fonte ou IntersectionObserver), a lista <ol> está na ordem da luz, todo texto entra por textContent, movimento
   reduzido (ou sem a API de animação) mostra o quadro final sem animação nenhuma, a animação só começa com 35% da faixa na tela e pausa
   fora dela, o pulso de repouso só usa transform e opacity, parar() desfaz tudo, e o ajuste marca só o id novo.
   node --test docs/testes/planta-desenho.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import M from '../../js/planta-desenho.js';
import L from '../../js/planta-layout.js';
import { criarJanela } from './planta-dom-falso.mjs';
import { laco, bifurca, espinha } from './planta-formas.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const NICHOS = ['clinica', 'embalagens', 'loja'];
const NOTA_MODELO = 'É o desenho do que o seu site pode fazer, a partir do que você contou. O que entra de fato é combinado no orçamento.';
const NOTA_PADRAO = 'Um desenho de exemplo para o seu tipo de negócio. Conforme você contar mais, o Zero refaz.';

function ambiente(opcoes) {
  const w = criarJanela(opcoes);
  const A = M.criar(w);
  const raiz = w.raiz(w.opcoes.largura);
  return { w, A, raiz };
}
const quadroDe = (raiz) => raiz.porClasse('plv-quadro')[0];
const lis = (raiz) => quadroDe(raiz).porTag('li');
const aceso = (n) => n._classes.has('is-aceso');
const noDe = (raiz, id) => quadroDe(raiz).achar((n) => n.attrs['data-id'] === id && n.namespaceURI)[0];
const liDe = (raiz, id) => lis(raiz).find((l) => l.dataset.id === id);

test('montar rejeita plano inválido sem desenhar nada, sem lançar e sem criar elemento (título com <img onerror>, undefined, chave de protótipo)', () => {
  const sujo = fx('clinica');
  sujo.etapas[0].titulo = '<img src=x onerror=alert(1)>';
  for (const ruim of [sujo, undefined, null, 7, [], 'x', { topologia: 'laco' }, JSON.parse('{"__proto__": {"x": 1}}')]) {
    const { w, A, raiz } = ambiente();
    const antes = w.document.todos.length;
    const r = A.montar(raiz, ruim, {});
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.motivos) && r.motivos.length > 0, 'diz o motivo');
    assert.equal(raiz.filhos.length, 0, 'nada na tela');
    assert.equal(w.document.todos.length, antes, 'nenhum elemento criado');
    assert.equal(w.document.animacoes.length, 0);
    assert.equal(w.pendentes(), 0);
  }
});

test('montar sem largura (faixa ainda escondida) não desenha e diz o motivo, sem lançar', () => {
  const { w, A } = ambiente();
  const raiz = w.raiz(0);
  const r = A.montar(raiz, fx('clinica'), {});
  assert.equal(r.ok, false);
  assert.deepEqual(r.motivos, ['sem_largura']);
});

for (const nicho of NICHOS) {
  for (const W of [390, 320, 1280]) {
    test('estrutura de ' + nicho + ' em ' + W + ': altura reservada gravada na mesma chamada, <ol> na ordem da luz, status, botões, tudo já existe', () => {
      const { w, A, raiz } = ambiente({ largura: W });
      const plano = fx(nicho);
      const r = A.montar(raiz, plano, {});
      assert.equal(r.ok, true);
      /* NADA assíncrono foi preciso: nenhum avancar, nenhum mostrar */
      const q = quadroDe(raiz);
      assert.equal(q.estilo.height, L.alturaReservada(W) + 'px', 'a altura final já está no quadro');
      assert.equal(r.altura, L.alturaReservada(W));
      const svg = q.porTag('svg')[0];
      assert.equal(svg.attrs.viewBox, '0 0 ' + W + ' ' + L.alturaReservada(W));
      assert.equal(svg.attrs['aria-hidden'], 'true');
      assert.equal(svg.attrs.focusable, 'false');
      /* uma <li> por caixa + núcleo + LED, na ordem da luz */
      const itens = lis(raiz);
      assert.equal(itens.length, plano.etapas.length + 1 + 2);
      const ords = itens.map((l) => Number(l.dataset.ord));
      assert.deepEqual(ords, itens.map((_, i) => i), 'a ordem do DOM é a ordem da luz');
      assert.equal(itens[0].dataset.id, 'nucleo');
      assert.equal(itens[1].dataset.id, 'chegada');
      /* o texto de cada etapa está na lista (por textContent) */
      for (const e of plano.etapas) assert.ok(liDe(raiz, e.id).textContent.includes(e.titulo), e.id);
      assert.ok(liDe(raiz, 'chegada').textContent.includes(plano.chegada.titulo));
      assert.ok(liDe(raiz, 'led').textContent.includes(plano.fim.titulo));
      /* a lista tem rótulo; o status tem papel */
      assert.equal(q.porTag('ol')[0].attrs['aria-label'], 'Etapas da planta');
      const status = raiz.porClasse('plv-status')[0];
      assert.equal(status.attrs.role, 'status');
      /* a legenda, a cota, os botões e a nota existem desde o 1º instante, com conteúdo (não nascem vazios para encher depois) */
      assert.equal(raiz.porClasse('plv-leitura')[0].attrs['aria-hidden'], 'true');
      assert.ok(raiz.porClasse('plv-leitura__tag')[0].textContent.length > 0);
      assert.equal(raiz.porClasse('plv-acoes')[0].porTag('button').length, 3);
      assert.ok(raiz.porClasse('plv-nota')[0].textContent.length > 20);
      assert.ok(raiz.porClasse('plv-titulo')[0].textContent === 'A planta do seu site');
    });
  }
}

test('toda geometria em px e nunca em ch/em: nenhum valor de posição ou tamanho do desenho usa essas unidades', () => {
  const { A, raiz } = ambiente();
  A.montar(raiz, fx('embalagens'), {});
  const todos = quadroDe(raiz).achar(() => true);
  for (const n of todos) for (const v of Object.values(n.estilo)) assert.ok(!/(\d)(ch|em|rem)\b/.test(String(v)), 'unidade relativa em ' + JSON.stringify(n.estilo));
  const li = lis(raiz)[3];
  for (const k of ['left', 'top', 'width']) assert.match(li.estilo[k], /^-?[\d.]+px$/, k);
});

test('status final com o número de etapas (chegada incluída) e o fecho do plano na legenda', () => {
  const { A, raiz } = ambiente({ reduzido: true });
  A.montar(raiz, fx('clinica'), {});
  assert.equal(raiz.porClasse('plv-status')[0].textContent, 'Planta pronta, com 8 etapas.');
  assert.equal(raiz.porClasse('plv-leitura__txt')[0].textContent, fx('clinica').fecho);
  const { A: A2, raiz: r2 } = ambiente({ reduzido: true });
  A2.montar(r2, fx('embalagens'), {});
  assert.equal(r2.porClasse('plv-status')[0].textContent, 'Planta pronta, com 9 etapas.');
});

test('as duas notas de honestidade (spec §1.5): a do plano do modelo e a do plano padrão', () => {
  const a = ambiente(), b = ambiente();
  a.A.montar(a.raiz, fx('loja'), { origem: 'modelo' });
  b.A.montar(b.raiz, fx('loja'), { origem: 'padrao' });
  assert.equal(a.raiz.porClasse('plv-nota')[0].textContent, NOTA_MODELO);
  assert.equal(b.raiz.porClasse('plv-nota')[0].textContent, NOTA_PADRAO);
});

test('texto do modelo entra por textContent: um título com <img onerror> vira texto, não vira elemento (construção direta, sem a forma)', () => {
  const { w, A } = ambiente();
  const plano = fx('clinica');
  plano.etapas[0].titulo = '<img src=x onerror=alert(1)>';
  plano.fim.titulo = '"><script>alert(1)</script>';
  const g = L.montarGeometria(plano, 390);
  const quadro = w.document.createElement('div');
  A.interno.construirQuadro(quadro, g, plano);
  assert.equal(quadro.porTag('img').length, 0);
  assert.equal(quadro.porTag('script').length, 0);
  assert.ok(quadro.achar((n) => n.nodeType === 1 && Object.keys(n.attrs).some((k) => /^on/.test(k))).length === 0, 'nenhum atributo on*');
  const li = quadro.porTag('li').find((l) => l.dataset.id === plano.etapas[0].id);
  assert.ok(li.textContent.includes('<img src=x onerror=alert(1)>'), 'o texto aparece literal');
  assert.ok(quadro.porTag('li').find((l) => l.dataset.id === 'led').textContent.includes('<script>'));
  /* o id só vai para data-id */
  assert.ok(quadro.achar((n) => n.attrs && 'id' in n.attrs).length === 0, 'nenhum atributo id (o id do plano só vai em data-id)');
});

test('nenhum nó recebe o atributo style (CSP: style-src self); posições vão por el.style.x', () => {
  const { A, raiz } = ambiente();
  A.montar(raiz, fx('loja'), {});
  const todos = raiz.achar(() => true);
  assert.equal(todos.filter((n) => 'style' in n.attrs).length, 0);
});

test('o DOM do quadro tem no máximo 450 nós (9 caixas)', () => {
  for (const nicho of NICHOS) for (const W of [390, 1280]) {
    const { A, raiz } = ambiente({ largura: W });
    A.montar(raiz, fx(nicho), {});
    assert.ok(quadroDe(raiz).achar(() => true).length <= 450, nicho + ' ' + W + ': ' + quadroDe(raiz).achar(() => true).length);
  }
});

test('movimento reduzido: quadro final completo, nenhuma animação, nenhum temporizador, nenhum observador', () => {
  for (const reduzido of [true]) {
    const { w, A, raiz } = ambiente({ reduzido });
    const r = A.montar(raiz, fx('embalagens'), {});
    assert.equal(r.animada, false);
    assert.equal(w.document.animacoes.length, 0);
    assert.equal(w.pendentes(), 0);
    assert.equal(w.observadores.length, 0);
    assert.ok(!quadroDe(raiz)._classes.has('plv--pre'));
    const nos = quadroDe(raiz).achar((n) => n._classes.has('plv-no'));
    assert.ok(nos.length >= 11);
    assert.ok(nos.every(aceso), 'todos acesos');
    assert.ok(noDe(raiz, 'led')._classes.has('is-ouro'), 'ouro só no LED, estático');
    assert.equal(quadroDe(raiz).achar((n) => n._classes.has('is-ouro')).length, 2, 'ouro no LED e na chamada do LED, e em mais nada');
    assert.ok(quadroDe(raiz).achar((n) => n._classes.has('plv-seta')).every((n) => n._classes.has('is-ligada')));
    assert.equal(quadroDe(raiz).achar((n) => n._classes.has('plv-tang')).length, 0, 'sem o emaranhado');
  }
});

test('o interruptor "menos movimento" do site (html.menos-movimento) também mostra só o quadro final', () => {
  const { w, A, raiz } = ambiente();
  w.document.documentElement.classList.add('menos-movimento');
  const r = A.montar(raiz, fx('loja'), {});
  assert.equal(r.animada, false);
  assert.equal(w.document.animacoes.length, 0);
  assert.equal(w.pendentes(), 0);
});

test('sem a API de animação (Element.animate) o quadro final aparece, sem erro', () => {
  const { w, A, raiz } = ambiente({ semAnimate: true });
  const r = A.montar(raiz, fx('loja'), {});
  assert.equal(r.ok, true);
  assert.equal(r.animada, false);
  assert.equal(w.pendentes(), 0);
  assert.ok(quadroDe(raiz).achar((n) => n._classes.has('plv-no')).every(aceso));
});

test('animado: o quadro nasce no estado de esboço, e só começa quando 35% da faixa estão na tela (nada de animação antes)', () => {
  const { w, A, raiz } = ambiente();
  const r = A.montar(raiz, fx('clinica'), {});
  assert.equal(r.animada, true);
  assert.ok(quadroDe(raiz)._classes.has('plv--pre'));
  assert.equal(w.observadores.length, 1);
  assert.deepEqual([].concat(w.observadores[0].opcoes.threshold), [0, 0.35]);
  assert.equal(w.rodando().length, 0, 'nada rodando antes de aparecer');
  assert.equal(w.pendentes(), 0, 'nenhum temporizador antes de aparecer');
  w.mostrar(0.2);
  assert.equal(w.rodando().length, 0, '20% não basta');
  w.mostrar(0.4);
  assert.ok(w.rodando().length > 10, 'começou: ' + w.rodando().length);
  assert.ok(w.pendentes() > 0);
});

test('animado de ponta a ponta: a luz acende as caixas na ordem, o ouro vem só no LED, termina com status e legenda finais', () => {
  const { w, A, raiz } = ambiente();
  const plano = fx('clinica');
  A.montar(raiz, plano, {});
  w.mostrar(1);
  /* no meio do caminho: algumas acesas, o LED ainda não */
  w.avancar(3500);
  const acesas = quadroDe(raiz).achar((n) => n._classes.has('plv-no') && aceso(n)).length;
  assert.ok(acesas >= 2 && acesas < 10, 'acendendo aos poucos: ' + acesas);
  assert.ok(!noDe(raiz, 'led')._classes.has('is-ouro'), 'o ouro ainda não');
  assert.equal(raiz.porClasse('plv-status')[0].textContent, '', 'o status só anuncia no fim');
  /* a ordem: o núcleo acende primeiro, a chegada antes da etapa 2 */
  const ordemDeAcender = [];
  w.avancar(10000);
  assert.ok(!quadroDe(raiz)._classes.has('plv--pre'), 'terminou: sem o estado de esboço');
  assert.ok(quadroDe(raiz).achar((n) => n._classes.has('plv-no')).every(aceso));
  assert.ok(noDe(raiz, 'led')._classes.has('is-ouro'));
  assert.equal(raiz.porClasse('plv-status')[0].textContent, 'Planta pronta, com 8 etapas.');
  assert.equal(raiz.porClasse('plv-leitura__tag')[0].textContent, 'Planta pronta');
  assert.equal(raiz.porClasse('plv-leitura__txt')[0].textContent, plano.fecho);
  void ordemDeAcender;
});

test('a luz acende uma caixa de cada vez, na ordem do <ol> (registro das ligações)', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('embalagens'), {});
  w.mostrar(1);
  const vistos = [];
  const marca = () => lis(raiz).forEach((l) => { if (aceso(l) && !vistos.includes(l.dataset.id)) vistos.push(l.dataset.id); });
  for (let t = 0; t < 12000; t += 50) { w.avancar(50); marca(); }
  const ordemDom = lis(raiz).map((l) => l.dataset.id);
  assert.deepEqual(vistos, ordemDom, 'acende na ordem em que o <ol> lista');
});

test('regra 1 do CLAUDE.md: o módulo não tem requestAnimationFrame; e o pulso de repouso só anima transform e opacity (e em nenhum caso stroke-dashoffset ou offset-distance)', () => {
  const fonte = fs.readFileSync(new URL('../../js/planta-desenho.js', import.meta.url), 'utf8');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/requestAnimationFrame|cancelAnimationFrame|BEYON/.test(semComentarios), 'nenhum rAF próprio nem laço do site');
  assert.ok(!/offsetDistance|offset-distance|offsetPath|offset-path/.test(semComentarios));
  /* o código do pulso, lido pelo nome da função */
  const ini = semComentarios.indexOf('function pulsoDeRepouso');
  assert.ok(ini > 0, 'a função pulsoDeRepouso existe');
  let prof = 0, i = semComentarios.indexOf('{', ini), fim = i;
  for (; i < semComentarios.length; i++) { if (semComentarios[i] === '{') prof++; else if (semComentarios[i] === '}') { prof--; if (prof === 0) { fim = i; break; } } }
  const corpo = semComentarios.slice(ini, fim + 1);
  assert.ok(!/strokeDashoffset|stroke-dashoffset|strokeDasharray/.test(corpo), 'o pulso não anima o traço');
  assert.ok(/transform/.test(corpo) && /opacity/.test(corpo));
  /* e em tempo de execução: toda animação infinita só tem chaves de transform, opacity, offset e easing */
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('loja'), {});
  w.mostrar(1);
  w.avancar(12000);
  const vida = w.ativas().filter((a) => a.opcoes.iterations > 1);
  assert.ok(vida.length >= 5, 'há pulsos de repouso: ' + vida.length);
  for (const a of vida) for (const kf of a.keyframes) for (const k of Object.keys(kf)) assert.ok(['transform', 'opacity', 'offset', 'easing'].includes(k), 'chave ' + k + ' no pulso');
});

test('o pulso de repouso dura no máximo 60 s (iterações finitas) e volta com toque ou foco', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('clinica'), {});
  w.mostrar(1);
  w.avancar(12000);
  const vida = w.ativas().filter((a) => a.opcoes.iterations > 1);
  assert.ok(vida.length > 0);
  for (const a of vida) { assert.ok(Number.isFinite(a.opcoes.iterations)); assert.ok(a.opcoes.iterations * a.opcoes.duration <= 60000 + a.opcoes.duration); }
  vida.forEach((a) => a.finish());
  const plays = vida.map((a) => a.plays);
  quadroDe(raiz).disparar('pointerdown');
  assert.ok(vida.some((a, i) => a.plays > plays[i]), 'o toque reativa o pulso');
});

test('fora da tela tudo pausa (animações e temporizadores) e volta ao reaparecer; aba escondida também pausa', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('embalagens'), {});
  w.mostrar(1);
  w.avancar(2000);
  assert.ok(w.rodando().length > 0 && w.pendentes() > 0);
  w.mostrar(0);
  assert.equal(w.rodando().length, 0, 'tudo pausado');
  assert.equal(w.pendentes(), 0, 'sem temporizador rodando fora da tela');
  w.mostrar(0.8);
  assert.ok(w.rodando().length > 0 && w.pendentes() > 0, 'voltou');
  w.document.hidden = true; w.document.disparar('visibilitychange');
  assert.equal(w.rodando().length, 0, 'aba escondida: pausa');
  assert.equal(w.pendentes(), 0);
  w.document.hidden = false; w.document.disparar('visibilitychange');
  assert.ok(w.rodando().length > 0);
  /* a pausa não perde o fim: depois de tudo, termina */
  w.avancar(15000);
  assert.ok(!quadroDe(raiz)._classes.has('plv--pre'));
});

test('parar() desfaz tudo: cancela animações, zera temporizadores, solta observador e ouvintes, esvazia a faixa', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('loja'), {});
  w.mostrar(1);
  w.avancar(3000);
  A.parar();
  assert.equal(w.ativas().length, 0, 'nenhuma animação viva');
  assert.equal(w.pendentes(), 0);
  assert.ok(w.observadores.every((o) => !o.ativo));
  assert.equal((w.ouvintes.resize || []).length, 0);
  assert.equal((w.document.ouvintes.visibilitychange || []).length, 0);
  assert.equal(raiz.filhos.length, 0, 'a faixa foi esvaziada');
  /* idempotente e sem instância */
  A.parar(); A.parar();
  assert.equal(A.atualizar(fx('loja'), {}).ok, false);
});

test('montar de novo na mesma página limpa o anterior (uma instância só)', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('loja'), {});
  w.mostrar(1);
  A.montar(raiz, fx('clinica'), {});
  assert.equal(raiz.porClasse('plv-quadro').length, 1);
  assert.equal(w.observadores.filter((o) => o.ativo).length, 1);
  assert.equal((w.ouvintes.resize || []).length, 1);
});

function comEtapaNova() {
  const p = fx('clinica');
  p.etapas.splice(4, 0, { id: 'sinal', tipo: 'sinal', verbo: 'Cobra', titulo: 'Cobra um sinal para segurar o horário', frase: 'Para segurar o horário, o site pede um sinal antes de confirmar a avaliação.' });
  p.etapas.splice(6, 1);   /* tira "pos" e mantém 7 etapas, com o retorno na última */
  return p;
}

test('ajuste: só o id novo ganha is-ajustado e a etiqueta "Ajustado"; os outros não; a altura do quadro não muda (CLS)', () => {
  const { w, A, raiz } = ambiente({ reduzido: true });
  const antigo = fx('clinica');
  A.montar(raiz, antigo, {});
  const altura = quadroDe(raiz).estilo.height;
  const r = A.atualizar(comEtapaNova(), { fala: 'quero cobrar um sinal' });
  assert.equal(r.ok, true);
  assert.equal(r.refeita, false);
  assert.deepEqual(r.novos, ['sinal']);
  assert.equal(quadroDe(raiz).estilo.height, altura, 'a altura reservada é a mesma');
  const marcados = quadroDe(raiz).achar((n) => n._classes.has('is-ajustado'));
  assert.ok(marcados.length >= 1);
  assert.ok(marcados.every((n) => n.attrs['data-id'] === 'sinal' || n.dataset.id === 'sinal'), 'só o id novo');
  assert.ok(liDe(raiz, 'sinal').textContent.includes('Ajustado'));
  assert.ok(!liDe(raiz, 'pagina').textContent.includes('Ajustado'));
  assert.equal(raiz.porClasse('plv-leitura__tag')[0].textContent, 'Ajustado');
  void w;
});

test('ajuste animado: as caixas que mudam de lugar deslizam (translate), as rotas que tocam a nova se desenham, termina com status e legenda', () => {
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('clinica'), {});
  w.mostrar(1); w.avancar(15000);
  const antes = w.document.animacoes.length;
  A.atualizar(comEtapaNova(), { fala: 'quero cobrar um sinal' });
  const novas = w.document.animacoes.slice(antes).filter((a) => !a.cancelado);
  assert.ok(novas.length > 3, 'animações do ajuste: ' + novas.length);
  assert.ok(novas.some((a) => a.keyframes.some((k) => /translate/.test(k.transform || ''))), 'as caixas deslizam por transform');
  assert.equal(raiz.porClasse('plv-leitura__tag')[0].textContent, 'Você pediu');
  assert.ok(raiz.porClasse('plv-leitura__txt')[0].textContent.includes('quero cobrar um sinal'));
  w.avancar(8000);
  assert.equal(raiz.porClasse('plv-leitura__tag')[0].textContent, 'Ajustado');
  assert.equal(raiz.porClasse('plv-status')[0].textContent, 'Planta ajustada, com 8 etapas.');
  assert.ok(quadroDe(raiz).achar((n) => n._classes.has('plv-no')).every(aceso));
});

test('sem ids em comum o desenho é refeito inteiro (sem is-ajustado em lugar nenhum)', () => {
  const { A, raiz } = ambiente({ reduzido: true });
  A.montar(raiz, fx('clinica'), {});
  const r = A.atualizar(fx('loja'), {});
  assert.equal(r.ok, true);
  assert.equal(r.refeita, true);
  assert.deepEqual(r.novos, []);
  assert.equal(quadroDe(raiz).achar((n) => n._classes.has('is-ajustado')).length, 0);
  assert.ok(liDe(raiz, 'vitrine'));
});

test('atualizar com plano inválido não muda nada na tela e diz o motivo', () => {
  const { A, raiz } = ambiente({ reduzido: true });
  A.montar(raiz, fx('clinica'), {});
  const antes = quadroDe(raiz).achar(() => true).length;
  const ruim = fx('clinica'); ruim.etapas[0].titulo = 'x';
  const r = A.atualizar(ruim, {});
  assert.equal(r.ok, false);
  assert.equal(quadroDe(raiz).achar(() => true).length, antes);
  assert.ok(liDe(raiz, 'pagina').textContent.includes('Uma página para cada tratamento'));
});

test('botões: "Está certo" e "Quero ajustar" chamam o que o 2c passar e ficam desligados sem editável; "Rever a montagem" refaz a entrada', () => {
  const chamadas = [];
  const { w, A, raiz } = ambiente();
  A.montar(raiz, fx('clinica'), { aoCerto: () => chamadas.push('certo'), aoAjustar: () => chamadas.push('ajustar') });
  const [certo, ajustar, rever] = raiz.porClasse('plv-acoes')[0].porTag('button');
  assert.equal(certo.textContent, 'Está certo');
  assert.equal(ajustar.textContent, 'Quero ajustar algo');
  assert.equal(rever.textContent, 'Rever a montagem');
  assert.ok(!certo.hasAttribute('disabled') && !ajustar.hasAttribute('disabled'));
  certo.disparar('click'); ajustar.disparar('click');
  assert.deepEqual(chamadas, ['certo', 'ajustar']);
  w.mostrar(1); w.avancar(15000);
  const antes = w.document.animacoes.length;
  rever.disparar('click');
  assert.ok(w.document.animacoes.length > antes, 'rever refaz a entrada');
  /* preço fechado: planta visível, botões de decisão desligados */
  const b = ambiente();
  b.A.montar(b.raiz, fx('clinica'), { editavel: false, aoCerto: () => chamadas.push('x'), aoAjustar: () => chamadas.push('y') });
  const [c2, a2] = b.raiz.porClasse('plv-acoes')[0].porTag('button');
  assert.ok(c2.hasAttribute('disabled') && a2.hasAttribute('disabled'));
  c2.disparar('click'); a2.disparar('click');
  assert.deepEqual(chamadas, ['certo', 'ajustar'], 'desligados não chamam');
  /* e a tela muda de editável sem refazer: atualizar com editavel */
  b.A.atualizar(fx('clinica'), { editavel: true });
  assert.ok(!c2.hasAttribute('disabled'));
});

test('a largura muda (girar o celular): a planta se recompõe, no quadro final, com a nova altura reservada', () => {
  const { w, A, raiz } = ambiente({ largura: 390 });
  A.montar(raiz, fx('embalagens'), {});
  w.mostrar(1); w.avancar(15000);
  raiz.clientWidth = 1280;
  w.disparar('resize');
  w.avancar(400);
  assert.equal(quadroDe(raiz).estilo.height, L.alturaReservada(1280) + 'px');
  assert.equal(quadroDe(raiz).porTag('svg')[0].attrs.viewBox, '0 0 1280 456');
  /* variação pequena (barra de rolagem) não refaz */
  const n = w.document.todos.length;
  raiz.clientWidth = 1276; w.disparar('resize'); w.avancar(400);
  assert.equal(w.document.todos.length, n);
});

test('o laboratório e o 2c usam o mesmo contrato: window.BZPlanta = { montar, atualizar, parar } no navegador', () => {
  const w = criarJanela();
  const A = M.criar(w);
  assert.deepEqual(['atualizar', 'montar', 'parar'].filter((k) => typeof A[k] === 'function'), ['atualizar', 'montar', 'parar']);
  assert.equal(typeof M.criar, 'function');
});

test('as três topologias e ids "difíceis" (00, a-, --) montam sem erro e nunca usam o id num seletor', () => {
  for (const plano of [laco(8), bifurca(2, 2, 2, 2), espinha(5, [{ host: 1, lado: 'cima' }, { host: 4, lado: 'baixo', laco: true }])]) {
    plano.etapas[0].id = '00'; plano.etapas[2].id = 'a-';
    for (const W of [390, 1280]) {
      const { A, raiz } = ambiente({ largura: W, reduzido: true });
      const r = A.montar(raiz, plano, {});
      assert.equal(r.ok, true, plano.topologia + ' ' + W);
      assert.ok(liDe(raiz, '00') && liDe(raiz, 'a-'));
    }
  }
});
