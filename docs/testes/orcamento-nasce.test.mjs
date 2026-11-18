/* A miniatura "o site nasce" (js/orcamento-nasce.js, remodelação 18/11): o desenho vem só do que a pessoa escolheu, nada de
   dado inventado, texto dela só entra por textContent. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../js/orcamento-rotulos.js');
const N = require('../../js/orcamento-nasce.js');

test('sem ramo não há miniatura; com ramo, o nome do ramo e a chamada do tipo de negócio', () => {
  for (const r of [null, undefined, {}, { objetivos: ['agendamentos'] }, { ramo: 'inexistente' }, { ramo: '__proto__' }, 'saude', 7]) assert.equal(N.planoDoSite(r, R), null, JSON.stringify(r));
  const p = N.planoDoSite({ ramo: 'saude', objetivos: [] }, R);
  assert.deepEqual([p.ramo, p.nome, p.titulo, p.pecas], ['saude', 'Saúde', 'Agende em 1 toque', []]);
});

test('todo ramo da lista fechada tem uma chamada, e todo objetivo tem a sua peça (nenhuma opção fica sem desenho)', () => {
  for (const ramo of Object.keys(R.RAMOS)) assert.ok(N.TITULOS[ramo], 'ramo sem chamada: ' + ramo);
  for (const obj of Object.keys(R.OBJETIVOS)) assert.ok(N.PECAS[obj], 'objetivo sem peça: ' + obj);
});

test('cada objetivo tocado vira uma peça (na ordem, sem repetir, ignorando o que não existe); o logo e os textos entram se ela tem (tenho ou parte)', () => {
  const p = N.planoDoSite({ ramo: 'beleza', objetivos: ['agendamentos', 'agendamentos', 'pedidos_whatsapp', 'inventado', 7, null], material: 'tenho' }, R);
  assert.deepEqual(p.pecas.map(x => x.chave), ['agendamentos', 'pedidos_whatsapp', 'material']);
  assert.equal(N.planoDoSite({ ramo: 'beleza', objetivos: [], material: 'parte' }, R).pecas.length, 1);
  assert.equal(N.planoDoSite({ ramo: 'beleza', objetivos: [], material: 'nao' }, R).pecas.length, 0, 'sem logo e textos não aparece peça (nada é prometido)');
  assert.equal(N.planoDoSite({ ramo: 'beleza', objetivos: 'agendamentos' }, R).pecas.length, 0, 'objetivos que não é lista é ignorado');
});

test('"outro" mostra o que a pessoa escreveu, limpo e no máximo 40 caracteres; os outros ramos mostram o nome da lista, nunca texto livre', () => {
  assert.equal(N.planoDoSite({ ramo: 'outro', outro: '  Loja   de  plantas  ' }, R).nome, 'Loja de plantas');
  assert.equal(N.planoDoSite({ ramo: 'outro', outro: 'x'.repeat(200) }, R).nome.length, 40);
  assert.equal(N.planoDoSite({ ramo: 'outro', outro: 5 }, R).nome, 'Outro', 'sem texto válido, cai no nome da lista');
  assert.equal(N.planoDoSite({ ramo: 'saude', outro: 'texto livre' }, R).nome, 'Saúde');
  assert.equal(N.planoDoSite({ ramo: 'saude' }).nome, '', 'sem os rótulos o nome fica vazio, não quebra');
});

test('o módulo pinta só por textContent e classe: sem innerHTML, sem style inline, sem número nem nome de empresa inventado', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-nasce.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(fonte, /innerHTML|insertAdjacentHTML|\.style\b|setAttribute\(\s*['"]style/);
  const textos = [...Object.values(N.TITULOS), ...Object.values(N.PECAS)].join(' ');
  assert.doesNotMatch(textos, /\d{2,}|%|R\$|\bLtda\b|\bCl[ií]nica [A-Z]/, 'texto de modelo sem número, preço nem nome de empresa');
});

test('a miniatura é decorativa e escondida até o 1º toque: o HTML tem aria-hidden e hidden, e a conversa não depende dela', () => {
  const html = fs.readFileSync(new URL('../../orcamento.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="nasce" id="o-nasce" aria-hidden="true" hidden>/);
  assert.doesNotMatch(html, /id="o-nasce"[^>]*style=/);
  assert.match(N.ligar.toString(), /typeof rotulos === 'function'/, 'os rótulos carregam depois do nasce: a leitura é na hora do evento');
  assert.match(html, /orcamento-nasce\.js" defer><\/script>\s*<script src="js\/orcamento-rotulos\.js" defer><\/script>\s*<script src="js\/orcamento-toques\.js"/, 'rótulos, toques e perguntas seguem colados (planta-orcamento-leve.test.mjs)');
  assert.ok(html.indexOf('<script src="js/orcamento-icones.js"') < html.indexOf('<script src="js/orcamento-toques.js"'), 'os ícones vêm antes dos toques que os usam');
});
