/* MAPA VIVO v2, fase 1a NA PÁGINA: js/orcamento-reacao.js (BZOrcReacao) num DOM de mentira, com o leitor REAL (js/mapa-vivo-ler.js) e as
   peças REAIS (js/planta-pecas.js). O que se prova:
   - flag desligada (sem planta_editavel) ou sem as peças/canais na página: nada é baixado, nada é criado, nenhum ouvinte (a tela é a de hoje);
   - flag ligada: a fileira nasce antes da caixa, escondida do leitor de tela; o leitor é baixado UMA vez, de URL constante;
   - digitar acende as peças depois da pausa de 250 ms; negação não acende; o que deixou de valer sai; caixa vazia apaga;
   - a flag que some tira a fileira e o ouvinte; falha de download não quebra nem repete;
   - fonte e página: ES5, sem innerHTML, o script antes do orcamento.js, a chamada no render, movimento reduzido no CSS.
   node --test docs/testes/mapa-vivo-reacao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { criarJanela } from './planta-dom-falso.mjs';

const require = createRequire(import.meta.url);
const Pecas = require('../../js/planta-pecas.js');
const Saber = require('../../js/mapa-saber.js');
const Ler = require('../../js/mapa-vivo-ler.js');
const Reacao = require('../../js/orcamento-reacao.js');
const lerFonte = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function ambiente({ comPecas = true, falharDownload = false } = {}) {
  const w = criarJanela({ largura: 390 });
  const doc = w.document;
  const ids = {};
  const novo = (tag, id) => { const n = doc.createElement(tag); if (id) ids[id] = n; return n; };
  doc.getElementById = (id) => ids[id] || null;
  doc.head = novo('head');
  const coluna = novo('div');
  const atalhos = novo('div', 'o-atalhos'); coluna.appendChild(atalhos);
  const form = novo('form', 'o-form'); coluna.appendChild(form);
  const campo = novo('textarea', 'o-texto'); form.appendChild(campo);
  campo.value = '';
  const baixados = [], avisos = [];
  w.console = { warn: (...a) => avisos.push(a.join(' ')) };
  if (comPecas) { w.BZPlantaPecas = Pecas; w.BZMapaSaber = Saber; }
  const anexar = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (s) => {
    anexar(s);
    baixados.push(s.src);
    if (falharDownload) s.onerror && s.onerror();
    else { w.BZMapaVivoLer = Ler; s.onload && s.onload(); }
    return s;
  };
  const api = Reacao.criar(w);
  const digitar = (t) => { campo.value = t; campo.disparar('input'); };
  const achar = () => coluna.children.find((n) => n.classList.contains('orc-reacao')) || null;
  const pecas = () => (achar() || doc.createElement('ul')).children.map((li) => li.getAttribute('data-codigo'));
  return { w, doc, ids, coluna, form, campo, api, baixados, avisos, digitar, pecas, fila: achar };
}
const LIGADA = { planta_editavel: true, mensagens: [] };

test('flag desligada ou sem as peças na página: nada baixado, nada criado, nenhum ouvinte', () => {
  const a = ambiente();
  a.api.atualizar({ mensagens: [] });
  a.api.atualizar(null);
  assert.equal(a.fila(), null);
  assert.equal(a.baixados.length, 0);
  assert.equal((a.campo.ouvintes.input || []).length, 0);
  const b = ambiente({ comPecas: false });
  b.api.atualizar(LIGADA);
  assert.equal(b.fila(), null, 'sem as peças do esboço, a tela é a de hoje');
  assert.equal(b.baixados.length, 0);
});

test('flag ligada: a fileira nasce antes da caixa, escondida do leitor de tela, e o leitor é baixado uma vez', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.api.atualizar(LIGADA);
  const fila = a.fila();
  assert.ok(fila, 'a fileira existe');
  assert.ok(fila.nextSibling === a.form, 'logo antes da caixa');
  assert.equal(fila.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(a.baixados, ['js/mapa-vivo-ler.js'], 'uma vez, de URL constante');
  assert.equal((a.campo.ouvintes.input || []).length, 1, 'um ouvinte só');
});

test('digitar acende as peças depois de 250 ms; negação não acende; o que deixou de valer sai; caixa vazia apaga', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.digitar('pelo instagram e whatsapp');
  a.w.avancar(200);
  assert.deepEqual(a.pecas(), [], 'ainda digitando');
  a.w.avancar(60);
  assert.deepEqual(a.pecas(), ['instagram', 'whatsapp']);
  const insta = a.fila().children[0];
  assert.ok(insta.classList.contains('is-nova'), 'a nova chega marcada');
  assert.ok(insta.porTag('path').length >= 2, 'com o desenho da peça');
  assert.equal(insta.textContent, 'Instagram');
  a.w.avancar(1300);
  assert.ok(!insta.classList.contains('is-nova'), 'e a marca sai depois');
  a.digitar('não uso instagram, mas o whatsapp sim; quero agenda');
  a.w.avancar(300);
  assert.deepEqual(a.pecas(), ['whatsapp', 'agenda'], 'instagram negado saiu, agenda entrou');
  a.campo.value = '';
  a.api.atualizar(LIGADA);
  assert.deepEqual(a.pecas(), [], 'enviou: a caixa vazia apaga a fileira');
});

test('a flag que some tira a fileira e o ouvinte; falha de download não quebra nem repete', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.api.atualizar({ mensagens: [] });
  assert.equal(a.fila(), null);
  assert.equal((a.campo.ouvintes.input || []).length, 0);
  const b = ambiente({ falharDownload: true });
  b.api.atualizar(LIGADA);
  b.api.atualizar(LIGADA);
  assert.equal(b.baixados.length, 1, 'não tenta de novo a cada render');
  b.digitar('pelo instagram');
  b.w.avancar(300);
  assert.deepEqual(b.pecas(), [], 'sem o leitor, nada acende (e nada quebra)');
});

test('fonte e página: ES5, sem innerHTML, script antes do orcamento.js, chamada no render, movimento reduzido no CSS', () => {
  for (const arq of ['js/orcamento-reacao.js', 'js/mapa-vivo-ler.js']) {
    const fonte = lerFonte(arq).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/=>|\blet\b|\bconst\b|`|\bclass\s+[A-Za-z]/.test(fonte), arq + ' é ES5');
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(fonte), arq + ' sem HTML em texto');
  }
  const html = lerFonte('orcamento.html');
  const i = html.indexOf('<script src="js/orcamento-reacao.js" defer></script>');
  assert.ok(i > 0 && i < html.indexOf('<script src="js/orcamento.js" defer></script>'), 'o módulo vem antes do orcamento.js');
  assert.ok(!html.includes('js/mapa-vivo-ler.js'), 'o leitor vem sob demanda, não na página');
  assert.match(lerFonte('js/orcamento.js'), /if \(window\.BZOrcReacao\) window\.BZOrcReacao\.atualizar\(E\);/);
  const css = lerFonte('css/orcamento.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.orc-reacao\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.orc-reacao__peca\.is-nova[^}]*animation:\s*none/);
  assert.ok(!/\.orc-reacao[^{]*\{[^}]*(blur|shadow|filter)/.test(css), 'sem blur nem sombra');
});
