/* A tela de recados do painel (js/painel-recados.js): lista, marca lido e trata o texto do visitante como dado
   (só textContent; nunca innerHTML). JS de navegador (IIFE) rodando com um DOM de mentira.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const FONTE = readFileSync(new URL('../../js/painel-recados.js', import.meta.url), 'utf8');
const ID = '11111111-1111-4111-8111-111111111111';

function no(tag, classe, texto) {
  const n = { tag, className: classe || '', textContent: texto === undefined || texto === null ? '' : String(texto), children: [], ouvintes: {}, hidden: false, disabled: false,
    appendChild(f) { n.children.push(f); return f; }, addEventListener(t, f) { (n.ouvintes[t] = n.ouvintes[t] || []).push(f); },
    focus() { n.focado = true; }, clicar() { (n.ouvintes.click || []).forEach(f => f()); } };
  let txt = n.textContent;
  Object.defineProperty(n, 'textContent', { get: () => txt, set(v) { txt = String(v); if (v === '') n.children.length = 0; } });
  Object.defineProperty(n, 'innerHTML', { set() { throw new Error('innerHTML proibido: texto de visitante é dado'); } });
  return n;
}
const todos = raiz => [raiz, ...raiz.children.flatMap(todos)];
const esperar = () => new Promise(r => setTimeout(r, 0));

function montar(respostas) {
  const ids = {}; for (const i of ['recados', 'recados-estado', 'bloco-recados', 't-recados', 'recados-atualizar']) ids[i] = no('div');
  ids['bloco-recados'].hidden = true;
  const chamadas = [], ouvintesDoc = {};
  const P = { el: no, data: x => 'em ' + x, recusada: () => false,
    pedir(caminho, opc) { chamadas.push({ caminho, metodo: opc && opc.method, corpo: opc && JSON.parse(opc.body) }); const r = respostas.shift(); return Promise.resolve({ json: () => Promise.resolve(r) }); } };
  const documento = { getElementById: i => ids[i], addEventListener: (t, f) => { ouvintesDoc[t] = f; } };
  vm.runInContext(FONTE, vm.createContext({ window: { BZPainel: P }, document: documento }));
  return { ids, chamadas, entrar: () => ouvintesDoc['bz-painel:entrou'](), sair: () => ouvintesDoc['bz-painel:saiu']() };
}
const recado = (extra = {}) => ({ id: ID, criado_em: '2026-10-30T12:00:00Z', texto: 'Quero saber do prazo <b>agora</b>', email: 'ana@exemplo.com', origem: 'orcamento', pedido_codigo: null, lido_em: null, suspeito: false, ...extra });

test('recados: lista origem, data, texto e e-mail como texto puro, e o bloco aparece', async () => {
  const m = montar([{ recados: [recado()], total: 1, nao_lidos: 1 }]);
  m.entrar(); await esperar();
  assert.equal(m.chamadas[0].caminho, '?fila=recados');
  assert.equal(m.ids['bloco-recados'].hidden, false);
  const textos = todos(m.ids.recados).map(n => n.textContent);
  assert.ok(textos.includes('Quero saber do prazo <b>agora</b>'), 'o HTML do visitante fica como texto');
  assert.ok(textos.some(t => t.includes('de: orcamento') && t.includes('em 2026-10-30')));
  assert.ok(textos.includes('Responder para: ana@exemplo.com'));
  assert.match(m.ids['recados-estado'].textContent, /1 recado novo \(de 1\)/);
});

test('recados: sem nenhum, frase curta', async () => {
  const m = montar([{ recados: [], total: 0, nao_lidos: 0 }]);
  m.entrar(); await esperar();
  assert.equal(m.ids['recados-estado'].textContent, 'Nenhum recado ainda.');
});

test('recados: sem e-mail avisa que não há como responder; suspeito ganha o aviso', async () => {
  const m = montar([{ recados: [recado({ email: null, suspeito: true })], total: 1, nao_lidos: 1 }]);
  m.entrar(); await esperar();
  const textos = todos(m.ids.recados).map(n => n.textContent);
  assert.ok(textos.some(t => t.startsWith('Sem e-mail')));
  assert.ok(textos.some(t => t.startsWith('Atenção: o texto parece dar ordens')));
});

test('recados: "Marcar como lido" manda recado_lido e recarrega; lido volta com lido:false', async () => {
  const m = montar([{ recados: [recado()], total: 1, nao_lidos: 1 }, { ok: true }, { recados: [recado({ lido_em: '2026-10-30T13:00:00Z' })], total: 1, nao_lidos: 0 }, { ok: true }, { recados: [], total: 0, nao_lidos: 0 }]);
  m.entrar(); await esperar();
  todos(m.ids.recados).find(n => n.tag === 'button').clicar(); for (let i = 0; i < 6; i++) await esperar();
  assert.deepEqual(m.chamadas[1], { caminho: '', metodo: 'POST', corpo: { recado_lido: ID, lido: true } });
  todos(m.ids.recados).find(n => n.tag === 'button').clicar(); await esperar();
  assert.deepEqual(m.chamadas[3].corpo, { recado_lido: ID, lido: false });
});

test('recados: ao sair do painel os recados somem da página', async () => {
  const m = montar([{ recados: [recado()], total: 1, nao_lidos: 1 }]);
  m.entrar(); await esperar(); m.sair();
  assert.equal(m.ids.recados.textContent, ''); assert.equal(m.ids['bloco-recados'].hidden, true);
});
