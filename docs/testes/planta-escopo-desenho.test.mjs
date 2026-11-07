/* O RADAR DO ESCOPO: O DESENHO (js/orcamento-escopo-desenho.js) num DOM de mentira (docs/testes/planta-dom-falso.mjs, que lança em innerHTML).
   O SVG é decorativo (aria-hidden, sem texto); o estado vira classes e atributos, idempotente; o aro anda até o marco atual e só fecha no ouro;
   o ouro (classe e fecho) só com st.ouro.  node --test docs/testes/planta-escopo-desenho.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import D from '../../js/orcamento-escopo-desenho.js';
import M from '../../js/orcamento-escopo-estado.js';
import { criarJanela } from './planta-dom-falso.mjs';

const classe = (no) => no.getAttribute('class') || '';
const st = (extra) => Object.assign({ marco: 0, ouro: false, ativo: false, dims: { entrega: { nivel: 0 }, escopo: { nivel: 0 }, integracoes: { nivel: 0 }, prazo: { nivel: 0 } } }, extra || {});

test('montar: um SVG decorativo (aria-hidden, sem foco, sem texto), com o aro, 5 marcos, 4 dimensões e o ponteiro', () => {
  const w = criarJanela();
  const inst = D.montar(w.document);
  assert.equal(inst.svg.getAttribute('aria-hidden'), 'true');
  assert.equal(inst.svg.getAttribute('focusable'), 'false');
  assert.equal(inst.svg.getAttribute('viewBox'), '0 0 320 320');
  assert.equal(inst.svg.porTag('text').length, 0, 'o texto do radar é HTML, não SVG');
  assert.equal(inst.svg.textContent, '');
  assert.equal(inst.marcos.length, 5);
  assert.deepEqual(Object.keys(inst.dims), ['entrega', 'escopo', 'integracoes', 'prazo']);
  assert.equal(inst.svg.achar((n) => classe(n) === 'rde-varre').length, 1);
  assert.equal(inst.progresso.getAttribute('pathLength'), '1');
});

test('fração do aro: até o nó do marco atual (0, 72°, 144°, 216°, 288°); o anel fecha só na proposta confirmada', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((m) => D.fracao(m, false)), [0, 0.2, 0.4, 0.6, 0.8]);
  assert.equal(D.fracao(4, true), 1);
  assert.equal(D.fracao(9, false), 0.8);
  assert.equal(D.fracao(-1, false), 0);
});

test('aplicar: cada nível vira a sua classe (pendente, identificada, confirmada) no arco, no nó e na guia; o aro do nó só no confirmado', () => {
  const w = criarJanela();
  const inst = D.montar(w.document);
  D.aplicar(inst, st({ marco: 2, dims: { entrega: { nivel: 0 }, escopo: { nivel: 1 }, integracoes: { nivel: 2 }, prazo: { nivel: 1 } } }));
  assert.equal(classe(inst.dims.entrega.arco), 'rde-dim');
  assert.equal(classe(inst.dims.escopo.arco), 'rde-dim is-identificada');
  assert.equal(classe(inst.dims.integracoes.no), 'rde-no is-confirmada');
  assert.equal(classe(inst.dims.prazo.guia), 'rde-guia is-identificada');
  assert.equal(classe(inst.dims.integracoes.aro), 'rde-no-aro is-confirmada');
  assert.equal(classe(inst.dims.escopo.aro), 'rde-no-aro');
  assert.deepEqual(inst.marcos.map(classe), ['rde-marco is-feito', 'rde-marco is-feito', 'rde-marco is-agora', 'rde-marco', 'rde-marco']);
  assert.equal(inst.progresso.getAttribute('stroke-dashoffset'), '0.6');
});

test('aplicar: o ouro e o fecho só com st.ouro; a atividade só marca a classe (o ponteiro é do CSS); idempotente', () => {
  const w = criarJanela();
  const inst = D.montar(w.document);
  D.aplicar(inst, st({ marco: 4 }));
  assert.equal(classe(inst.g), 'rde-g');
  assert.equal(inst.fecho.getAttribute('stroke-dashoffset'), '1');
  assert.equal(inst.progresso.getAttribute('stroke-dashoffset'), '0.2', 'aguardando confirmação: o aro vai até o 5º nó, sem fechar');
  D.aplicar(inst, st({ marco: 4, ouro: true, ativo: true }));
  assert.equal(classe(inst.g), 'rde-g is-ouro is-ativo');
  assert.equal(inst.fecho.getAttribute('stroke-dashoffset'), '0');
  assert.equal(inst.progresso.getAttribute('stroke-dashoffset'), '0');
  assert.ok(inst.marcos.every((m) => classe(m) === 'rde-marco is-feito'));
  const antes = JSON.stringify(inst.svg.achar(() => true).map((n) => n.attrs));
  D.aplicar(inst, st({ marco: 4, ouro: true, ativo: true }));
  assert.equal(JSON.stringify(inst.svg.achar(() => true).map((n) => n.attrs)), antes, 'o mesmo estado não muda nada');
  D.aplicar(inst, st());
  assert.equal(classe(inst.progresso), 'rde-progresso is-vazio', 'sem progresso, o traço some (nada de ponto solto)');
});

test('com a derivação de verdade: da página nova ao pedido salvo, o desenho acompanha', () => {
  const w = criarJanela();
  const inst = D.montar(w.document);
  D.aplicar(inst, M.estadoDoEscopo(null, null, {}));
  assert.ok(Object.values(inst.dims).every((d) => classe(d.arco) === 'rde-dim'));
  D.aplicar(inst, M.estadoDoEscopo({ conversa: { etapa: 'contato', tem_contato: true }, estimativa: { valor_total: 8350, prazo_dias: 9, detalhes: { formato: { chave: 'institucional', paginas_incluidas: 5 }, itens: [] } } }, null, {}));
  assert.ok(Object.values(inst.dims).every((d) => classe(d.arco) === 'rde-dim is-confirmada'));
  assert.equal(inst.progresso.getAttribute('stroke-dashoffset'), '0.4');
});

test('o anel da barra do celular: o mesmo progresso, o ouro só no confirmado', () => {
  const w = criarJanela();
  const a = D.montarAnel(w.document);
  assert.equal(a.svg.getAttribute('aria-hidden'), 'true');
  D.aplicarAnel(a, st({ marco: 2 }));
  assert.equal(a.progresso.getAttribute('stroke-dashoffset'), '0.6');
  assert.equal(classe(a.svg), 'rde-anel');
  D.aplicarAnel(a, st({ marco: 4, ouro: true }));
  assert.equal(classe(a.svg), 'rde-anel is-ouro');
  D.aplicarAnel(a, st());
  assert.equal(classe(a.svg), 'rde-anel is-vazio');
});
