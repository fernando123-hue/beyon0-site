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

/* um DOM de mentira, o mínimo que pintar() usa */
function noh(tag) {
  const e = { tag, children: [], attrs: {}, hidden: false, className: '', classes: new Set(), animou: 0, _t: '',
    get textContent() { return this._t; }, set textContent(v) { this._t = String(v); },
    get offsetWidth() { return 0; },
    classList: { add: c => { e.classes.add(c); if (c === 'is-nova') e.animou++; }, remove: c => e.classes.delete(c) },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { this.insertBefore(c, null); return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); return c; },
    insertBefore(c, ref) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); const j = ref ? this.children.indexOf(ref) : -1; this.children.splice(j < 0 ? this.children.length : j, 0, c); return c; } };
  return e;
}
function paginaDeMentira() {
  const nos = { 'o-nasce': noh('div'), 'o-nasce-nome': noh('span'), 'o-nasce-titulo': noh('p'), 'o-nasce-pecas': noh('ul') };
  nos['o-nasce'].hidden = true;
  const ouvintes = {};
  return { nos, ouvintes, getElementById: id => nos[id] || null, createElement: noh, addEventListener: (n, f) => { ouvintes[n] = f; } };
}

test('pintar: o 1º ramo mostra a miniatura, cada peça nova entra (uma vez), a que saiu do plano sai e o título só anima quando muda', () => {
  const d = paginaDeMentira(), cx = d.nos['o-nasce'], lista = d.nos['o-nasce-pecas'], titulo = d.nos['o-nasce-titulo'];
  N.pintar(d, null);
  assert.equal(cx.hidden, true, 'sem plano, escondida');
  N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: ['agendamentos'] }, R));
  assert.equal(cx.hidden, false);
  assert.equal(d.nos['o-nasce-nome'].textContent, 'Seu site · Saúde');
  assert.deepEqual(lista.children.map(l => l.textContent), ['Agenda de horários']);
  assert.match(lista.children[0].className, /is-nova/);
  const primeira = lista.children[0], animou = titulo.animou;
  N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: ['agendamentos', 'pedidos_whatsapp'] }, R));
  assert.equal(lista.children.length, 2);
  assert.equal(lista.children[0], primeira, 'a peça que já estava não é refeita (não repete o pulo)');
  assert.equal(titulo.animou, animou, 'o título não mudou: não anima de novo');
  N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: ['pedidos_whatsapp'] }, R));
  assert.deepEqual(lista.children.map(l => l.getAttribute('data-peca')), ['pedidos_whatsapp'], 'o "Mudar" tirou uma: a peça sai');
  N.pintar(d, N.planoDoSite({ ramo: 'beleza', objetivos: [] }, R));
  assert.equal(titulo.textContent, 'Seu horário, sem espera'); assert.ok(titulo.animou > animou, 'o título mudou: anima');
  assert.equal(lista.children.length, 0);
  N.pintar(d, null);
  assert.equal(cx.hidden, true, 'sem ramo de novo, escondida');
});

test('pintar: a ordem das peças é a do plano, também depois do "Mudar", sem duplicar', () => {
  const d = paginaDeMentira(), lista = d.nos['o-nasce-pecas'];
  N.pintar(d, N.planoDoSite({ ramo: 'servicos', objetivos: ['pedidos_whatsapp'] }, R));
  N.pintar(d, N.planoDoSite({ ramo: 'servicos', objetivos: ['agendamentos', 'pedidos_whatsapp', 'campanha'] }, R));
  assert.deepEqual(lista.children.map(l => l.getAttribute('data-peca')), ['agendamentos', 'pedidos_whatsapp', 'campanha']);
});

test('pintar: página sem os nós da miniatura não lança (a conversa nunca cai por enfeite)', () => {
  const d = paginaDeMentira();
  delete d.nos['o-nasce-pecas'];
  assert.doesNotThrow(() => N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: [] }, R)));
  assert.doesNotThrow(() => N.pintar({ getElementById: () => null }, null));
});

test('ligar: escuta bz:respostas, lê os rótulos SÓ na hora do evento (eles carregam depois) e ignora lixo', () => {
  const d = paginaDeMentira();
  let leituras = 0;
  N.ligar(d, () => { leituras++; return R; });
  assert.equal(leituras, 0, 'nada lido ao ligar');
  d.ouvintes['bz:respostas']({ detail: { ramo: 'educacao', objetivos: ['apresentar'] } });
  assert.equal(leituras, 1);
  assert.equal(d.nos['o-nasce-nome'].textContent, 'Seu site · Educação');
  assert.deepEqual(d.nos['o-nasce-pecas'].children.map(l => l.textContent), ['Quem somos e o que fazemos']);
  assert.doesNotThrow(() => d.ouvintes['bz:respostas'](undefined));
  assert.doesNotThrow(() => d.ouvintes['bz:respostas']({ detail: 'lixo' }));
  assert.equal(d.nos['o-nasce'].hidden, true, 'detail inválido esconde a miniatura');
  N.ligar({ getElementById: () => null, addEventListener() { throw new Error('não era para ligar'); } });
});

test('o evento tem o mesmo nome nos dois lados, e o toques manda uma CÓPIA das respostas (quem escuta não recebe o estado vivo)', () => {
  const toques = fs.readFileSync(new URL('../../js/orcamento-toques.js', import.meta.url), 'utf8');
  const nasce = fs.readFileSync(new URL('../../js/orcamento-nasce.js', import.meta.url), 'utf8');
  assert.match(toques, /new CustomEvent\('bz:respostas', \{ detail: copiar\(s\.respostas\) \}\)/);
  assert.match(nasce, /addEventListener\('bz:respostas'/);
});

test('planoDoSite: entrada forjada enorme é cortada antes de custar CPU (texto de 90 MB, lista de 5 milhões)', () => {
  const t0 = Date.now();
  const p = N.planoDoSite({ ramo: 'outro', outro: ' a '.repeat(3e7), objetivos: new Array(5e6).fill('agendamentos') }, R);
  assert.equal(p.nome.length <= 40, true); assert.equal(p.pecas.length, 1);
  assert.ok(Date.now() - t0 < 1500, 'demorou ' + (Date.now() - t0) + ' ms');
  const esparso = []; esparso.length = 4294967295;
  assert.doesNotThrow(() => N.planoDoSite({ ramo: 'saude', objetivos: esparso }, R));
});

test('a miniatura é decorativa e escondida até o 1º toque: o HTML tem aria-hidden e hidden, e a conversa não depende dela', () => {
  const html = fs.readFileSync(new URL('../../orcamento.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="nasce" id="o-nasce" aria-hidden="true" hidden>/);
  assert.doesNotMatch(html, /id="o-nasce"[^>]*style=/);
  assert.match(html, /orcamento-nasce\.js" defer><\/script>\s*<script src="js\/orcamento-rotulos\.js" defer><\/script>\s*<script src="js\/orcamento-toques\.js"/, 'rótulos, toques e perguntas seguem colados (planta-orcamento-leve.test.mjs)');
  assert.ok(html.indexOf('<script src="js/orcamento-icones.js"') < html.indexOf('<script src="js/orcamento-toques.js"'), 'os ícones vêm antes dos toques que os usam');
});
