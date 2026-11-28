/* Mapa vivo v2, Fase 2, PR 2 (a ligação na tela): js/orcamento-cena-tela.js num DOM de mentira, com os módulos REAIS da cena rodando no mesmo
   contexto quando a tela os "baixa". O que se prova: flag desligada (sem reacao: true) = o lugar some e NADA é baixado; ligada = o lugar é
   reservado na hora, os 7 módulos e o CSS vêm uma vez, em ordem, de URL constante; a cena sai do ramo tocado e das falas dela (nunca depoimento:
   a tela não sabe o nicho); o desenho só se refaz quando a cena muda; o toque novo (bz:respostas) redesenha; a página carrega o script antes do
   orcamento.js e o render chama o atualizar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { criarDoc } from './_dom-falso.mjs';

const ler = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const MODULOS = ['js/oracao.js', 'js/orcamento-cena-forma.js', 'js/cena-dicionario.js', 'js/planta-pecas.js', 'js/mapa-saber.js', 'js/cena-tracos.js', 'js/cena-desenho.js'];

function montar({ ramo = 'beleza', objetivos = [] } = {}) {
  const doc = criarDoc();
  const alvo = doc.createElement('div');
  alvo.id = 'o-nasce-cena';
  alvo.hidden = true;
  const toques = { ramo, objetivos };
  const win = { document: doc, BZToques: { respostas: () => JSON.parse(JSON.stringify(toques)) } };
  win.window = win;
  const ctx = vm.createContext({ window: win, document: doc, JSON, Object, String, Array, Math, Number, RegExp, isFinite, setTimeout });
  vm.runInContext(ler('js/orcamento-cena-tela.js'), ctx);
  const T = win.BZOrcCenaTela;
  const pedidos = () => doc.head.children.map(e => e.src || e.href);
  /* "baixa" o que a tela pediu: roda o arquivo real no mesmo contexto e dispara o load, um de cada vez (como async = false) */
  const baixarTudo = () => {
    for (let n = 0; n < 20; n++) {
      const pend = doc.head.children.find(e => !e._baixado);
      if (!pend) return;
      pend._baixado = true;
      if (pend.src) vm.runInContext(ler(pend.src), ctx);
      if (typeof pend.onload === 'function') pend.onload();
    }
  };
  return { doc, alvo, win, T, toques, pedidos, baixarTudo, ctx };
}
const ESTADO = (falas, extra = {}) => ({ reacao: true, conversa: { id: 'c1' }, mensagens: falas.map(c => ({ papel: 'visitante', conteudo: c })), ...extra });

test('flag desligada: o lugar some e nada é baixado', () => {
  const p = montar();
  p.alvo.hidden = false;
  assert.equal(p.T.atualizar({ conversa: { id: 'c1' }, mensagens: [] }), false);
  assert.equal(p.alvo.hidden, true);
  assert.deepEqual(p.pedidos(), []);
  assert.equal(p.T.atualizar(null), false);
  assert.deepEqual(p.pedidos(), []);
});

test('flag ligada: o lugar é reservado na hora; os módulos e o CSS vêm uma vez, em ordem, de URL constante; depois a cena aparece', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  assert.equal(p.alvo.hidden, false, 'reservado antes de baixar (sem empurrar a página depois)');
  assert.equal(p.alvo.children.length, 0);
  p.baixarTudo();
  assert.deepEqual(p.pedidos(), ['css/orcamento-cena.css', ...MODULOS]);
  const svg = p.alvo.children[0];
  assert.equal(svg && svg.tagName, 'svg');
  assert.equal(svg.querySelectorAll('.cena__gente').length, 2, 'as 2 pessoas que ela disse');
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  assert.equal(p.pedidos().length, 1 + MODULOS.length, 'não baixa de novo');
});

test('o desenho só se refaz quando a cena muda; o toque novo (bz:respostas) redesenha com o último estado', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  p.baixarTudo();
  const primeiro = p.alvo.children[0];
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  assert.equal(p.alvo.children[0], primeiro, 'mesma cena, mesmo desenho (não reanima)');
  p.T.atualizar(ESTADO(['Barbearia, somos 2', 'Na verdade somos 4']));
  assert.notEqual(p.alvo.children[0], primeiro);
  assert.equal(p.alvo.children[0].querySelectorAll('.cena__gente').length, 4);
  const antes = p.alvo.children[0];
  p.toques.ramo = 'alimentacao';
  p.doc.dispatchEvent({ type: 'bz:respostas', detail: { ramo: 'alimentacao' } });
  assert.notEqual(p.alvo.children[0], antes, 'o ramo novo redesenha sem esperar o servidor');
});

test('nunca depoimento na tela (ela não sabe o nicho); sem ramo, o lugar fica vazio; fala do Zero não conta', () => {
  const p = montar({ ramo: 'beleza' });
  p.T.atualizar(ESTADO(['Quero depoimentos dos clientes no site']));
  p.baixarTudo();
  assert.equal(p.alvo.children[0].querySelectorAll('.cena__destaque').length, 0);
  const q = montar({ ramo: null });
  q.T.atualizar(ESTADO(['somos 3']));
  q.baixarTudo();
  assert.equal(q.alvo.children.length, 0);
  const r = montar({ ramo: 'beleza' });
  r.T.atualizar({ reacao: true, conversa: { id: 'c1' }, mensagens: [{ papel: 'agente', conteudo: 'Vocês são em 5?' }, { papel: 'visitante', conteudo: 'Barbearia' }] });
  r.baixarTudo();
  assert.equal(r.alvo.children[0].querySelectorAll('.cena__gente').length, 0, 'o "5" foi o Zero quem disse');
});

test('falha ao baixar um script: não lança, não tenta de novo em laço, o lugar some', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia']));
  const js = p.doc.head.children.find(e => e.src);
  js.onerror();
  assert.doesNotThrow(() => p.T.atualizar(ESTADO(['Barbearia'])));
  assert.equal(p.alvo.hidden, true);
  assert.deepEqual(p.pedidos(), ['css/orcamento-cena.css', MODULOS[0]], 'sem laço de novas tentativas');
});

test('falha no meio da sequência (o 6º script) também some o lugar, sem novas tentativas', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia']));
  for (let n = 0; n < 10; n++) {
    const pend = p.doc.head.children.find(e => !e._baixado);
    pend._baixado = true;
    if (pend.src === 'js/cena-tracos.js') { pend.onerror(); break; }
    if (pend.src) vm.runInContext(ler(pend.src), p.ctx);
    if (typeof pend.onload === 'function') pend.onload();
  }
  assert.equal(p.alvo.hidden, true);
  const antes = p.pedidos().length;
  p.T.atualizar(ESTADO(['Barbearia']));
  assert.equal(p.pedidos().length, antes, 'não pede de novo');
});

test('o CSS da cena falhou: o lugar some (sem CSS a cena seria traço sem tinta num vão)', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  const css = p.doc.head.children[0];
  assert.equal(typeof css.onerror, 'function', 'o CSS tem tratamento de falha');
  css.onerror();
  assert.equal(p.alvo.hidden, true);
  p.baixarTudo();
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  assert.equal(p.alvo.hidden, true, 'continua escondido nos renders seguintes');
});

test('sem cena (sem ramo), o lugar reservado se esconde; com o ramo tocado, volta', () => {
  const p = montar({ ramo: null });
  p.T.atualizar(ESTADO(['somos 3']));
  p.baixarTudo();
  assert.equal(p.alvo.hidden, true, 'sem vão em branco');
  p.toques.ramo = 'beleza';
  p.doc.dispatchEvent({ type: 'bz:respostas', detail: { ramo: 'beleza' } });
  assert.equal(p.alvo.hidden, false);
  assert.equal(p.alvo.children[0].tagName, 'svg');
  p.T.atualizar(ESTADO(['somos 3']));
  assert.equal(p.alvo.hidden, false, 'o render seguinte não esconde a cena que existe');
});

test('o toque antes do 1º render não desenha nem lança', () => {
  const p = montar();
  assert.doesNotThrow(() => p.doc.dispatchEvent({ type: 'bz:respostas', detail: { ramo: 'beleza' } }));
  assert.equal(p.alvo.children.length, 0);
});

test('sem o CSS (ainda não chegou), o SVG não vira mancha preta: sem preenchimento e com largura no próprio desenho', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  p.baixarTudo();
  const svg = p.alvo.children[0];
  assert.equal(svg.getAttribute('width'), '100%');
  const caminhos = svg.querySelectorAll('path');
  assert.ok(caminhos.length > 0);
  for (const c of caminhos) assert.equal(c.getAttribute('fill'), 'none');
});

test('o mapa vivo desligado no meio da sessão: o toque seguinte não traz a cena de volta', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  p.baixarTudo();
  assert.equal(p.alvo.hidden, false);
  p.T.atualizar({ reacao: false, conversa: { id: 'c1' }, mensagens: [] });
  assert.equal(p.alvo.hidden, true);
  p.toques.ramo = 'alimentacao';
  p.doc.dispatchEvent({ type: 'bz:respostas', detail: { ramo: 'alimentacao' } });
  assert.equal(p.alvo.hidden, true);
});

test('o CSS falha depois de a cena já estar desenhada: o lugar some e o toque não a traz de volta', () => {
  const p = montar();
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  p.baixarTudo();
  assert.equal(p.alvo.hidden, false);
  p.doc.head.children[0].onerror();
  assert.equal(p.alvo.hidden, true);
  p.doc.dispatchEvent({ type: 'bz:respostas', detail: { ramo: 'beleza' } });
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  assert.equal(p.alvo.hidden, true);
});

test('os módulos já na página antes do 1º render: o CSS da cena é pedido mesmo assim (uma vez)', () => {
  const p = montar();
  for (const m of MODULOS) vm.runInContext(ler(m), p.ctx);
  p.T.atualizar(ESTADO(['Barbearia, somos 2']));
  p.T.atualizar(ESTADO(['Barbearia, somos 3']));
  assert.deepEqual(p.pedidos(), ['css/orcamento-cena.css']);
  assert.equal(p.alvo.children[0].tagName, 'svg');
});

test('página: o lugar da cena dentro da miniatura, o script antes do orcamento.js, o render e o lugar reservado no CSS estático', () => {
  const html = ler('orcamento.html');
  assert.match(html, /<div class="nasce__cena" id="o-nasce-cena" hidden><\/div>/);
  const pos = s => html.indexOf('<script src="js/' + s + '" defer></script>');
  assert.ok(pos('orcamento-cena-tela.js') > 0 && pos('orcamento-cena-tela.js') < pos('orcamento.js'));
  for (const m of MODULOS.filter(m => !/planta-pecas|mapa-saber/.test(m))) assert.ok(!html.includes('src="' + m), m + ' vem só sob demanda');
  assert.match(ler('js/orcamento.js'), /window\.BZOrcCenaTela\.atualizar\(E\)/);
  assert.match(ler('css/orcamento-palco.css'), /\.nasce__cena \{[^}]*aspect-ratio: 320 \/ 120/);
  const fonte = ler('js/orcamento-cena-tela.js');
  assert.ok(!/innerHTML|=>|\blet\b|\bconst\b|`/.test(fonte));
});
