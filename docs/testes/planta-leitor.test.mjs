/* O LEITOR DE TELA NA PLANTA (pendência obrigatória do 2b para o 2c; spec §4.3: "a lista na ordem da luz é o conteúdo"). A legenda animada é aria-hidden,
   então a `frase` de cada etapa e o `fecho` só chegavam ao leitor de tela se estivessem na lista <ol> e no status final. Cada <li> leva a frase num
   <span class="plv-sr"> (fora da tela, escrito por textContent) e o status do fim diz "Planta pronta, com N etapas." seguido do fecho.
   node --test docs/testes/planta-leitor.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import M from '../../js/planta-desenho.js';
import { criarJanela } from './planta-dom-falso.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));
const NICHOS = ['clinica', 'embalagens', 'loja'];

function montar(plano, opcoes, janela) {
  const w = criarJanela(janela || { reduzido: true });
  const A = M.criar(w);
  const raiz = w.raiz(w.opcoes.largura);
  const r = A.montar(raiz, plano, opcoes || {});
  assert.equal(r.ok, true, JSON.stringify(r));
  return { w, A, raiz };
}
const lis = (raiz) => raiz.porClasse('plv-quadro')[0].porTag('li');
const srDe = (li) => li.porClasse('plv-sr');

for (const nicho of NICHOS) {
  test('cada etapa da lista (' + nicho + ') leva a frase dela num span plv-sr, por textContent, na ordem da luz', () => {
    const plano = fx(nicho);
    const { raiz } = montar(plano);
    const frases = {};
    frases.chegada = plano.chegada.frase;
    plano.etapas.forEach((e) => { frases[e.id] = e.frase; });
    frases.led = plano.fim.frase;
    const itens = lis(raiz).filter((li) => li.dataset.id !== 'nucleo');
    assert.equal(itens.length, plano.etapas.length + 2, 'chegada + etapas + objetivo');
    for (const li of itens) {
      const sr = srDe(li);
      assert.equal(sr.length, 1, 'um span plv-sr em ' + li.dataset.id);
      assert.equal(sr[0].textContent, frases[li.dataset.id], 'a frase de ' + li.dataset.id);
      assert.equal(sr[0].tagName.toLowerCase(), 'span');
      assert.ok(li.filhos.includes(sr[0]), 'o span é filho direto do <li>: o leitor lê junto com o verbo e o título');
      assert.equal(sr[0].attrs['aria-hidden'], undefined, 'o span NÃO é aria-hidden');
    }
    const ord = lis(raiz).map((li) => Number(li.dataset.ord));
    assert.deepEqual(ord, ord.slice().sort((a, b) => a - b), 'a lista segue a ordem da luz');
  });

  test('o status final (' + nicho + ') diz o número de etapas e leva o fecho do plano', () => {
    const plano = fx(nicho);
    const { raiz } = montar(plano);
    const txt = raiz.porClasse('plv-status')[0].textContent;
    assert.match(txt, /^Planta pronta, com \d+ etapas\. /);
    assert.ok(txt.endsWith(plano.fecho), 'termina com o fecho: ' + txt);
  });
}

test('o span plv-sr leva a frase, mas o texto do modelo nunca vira elemento: frase com sinais fica como texto do nó', () => {
  const plano = fx('clinica');
  /* a forma recusa < e >; o que o teste prova é o caminho: o textContent do span é exatamente a string do plano */
  const { raiz } = montar(plano);
  const sr = lis(raiz)[1].porClasse('plv-sr')[0];
  assert.equal(sr.filhos.length, 1);
  assert.equal(sr.filhos[0].nodeType, 3, 'um nó de texto, nenhum elemento filho');
});

test('ajuste: o status do fim diz "Planta ajustada" e leva o fecho da planta nova; o span da frase acompanha a etapa nova', () => {
  const antes = fx('clinica');
  const depois = JSON.parse(JSON.stringify(antes));
  depois.fecho = 'O fecho da versão ajustada vem no fim, junto do status.';
  depois.etapas.splice(2, 0, Object.assign({}, antes.etapas[0], { id: 'novo1', titulo: 'Sinal para segurar o horário', frase: 'A frase da etapa nova também chega ao leitor de tela.' }));
  depois.etapas = depois.etapas.slice(0, 8);
  const { w, A, raiz } = montar(antes, {}, { reduzido: true });
  const r = A.atualizar(depois, {});
  assert.equal(r.ok, true, JSON.stringify(r));
  const txt = raiz.porClasse('plv-status')[0].textContent;
  assert.match(txt, /^Planta ajustada, com \d+ etapas\. /);
  assert.ok(txt.endsWith(depois.fecho));
  const novo = lis(raiz).find((li) => li.dataset.id === 'novo1');
  assert.ok(novo, 'a etapa nova existe');
  assert.equal(srDe(novo)[0].textContent, 'A frase da etapa nova também chega ao leitor de tela.');
  void w;
});

test('animado: o status continua vazio até o fim (anuncia uma vez), e o fim traz o fecho', () => {
  const plano = fx('clinica');
  const { w, raiz } = montar(plano, {}, { reduzido: false });
  const status = raiz.porClasse('plv-status')[0];
  assert.equal(status.textContent, '', 'não anuncia no meio');
  w.mostrar(1, 900);
  w.avancar(12000);
  assert.ok(status.textContent.endsWith(plano.fecho), status.textContent);
});

test('o CSS tem a regra plv-sr com o mesmo recorte do plv-status (fora da tela, lido pelo leitor)', () => {
  const css = fs.readFileSync(new URL('../../css/orcamento-planta.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const m = css.match(/\.plv-sr\s*\{([^}]*)\}/);
  assert.ok(m, 'falta a regra .plv-sr');
  const corpo = m[1];
  for (const parte of [/position:\s*absolute/, /width:\s*1px/, /height:\s*1px/, /overflow:\s*hidden/, /clip:\s*rect\(0 0 0 0\)/, /white-space:\s*nowrap/]) assert.match(corpo, parte, String(parte));
  assert.doesNotMatch(corpo, /display:\s*none|visibility:\s*hidden/, 'display:none e visibility:hidden escondem do leitor de tela');
});
