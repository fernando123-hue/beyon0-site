/* Mapa vivo v2, FASE 4, parte 2 (tela): js/orcamento-coerencia-tela.js com um kit de conversa de mentira (o BZToques.kit real é testado nos
   testes dos toques). O que se prova: sem reacao: true ou sem coerencia, nada; palpite fora da tabela, nada; uma pergunta por conversa (também
   numa página nova, pelo sessionStorage); "Sim" troca só o ramo (BZToques.trocarRamo) e, se não der, diz como ajustar; "Não" fecha; o nome que
   aparece é o da tabela, nunca o que veio do servidor; e a página carrega os dois scripts antes do orcamento.js e chama o atualizar.
   npm run testar */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lerFonte = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const guardado = new Map();
/* o window de mentira existe só enquanto o módulo carrega (ele guarda a referência): os outros testes do mesmo processo seguem com o deles */
const window = {
  sessionStorage: { getItem: k => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => guardado.set(k, String(v)) }
};
window.BZOrcCoerencia = require('../../js/orcamento-coerencia.js');
const antes = Object.getOwnPropertyDescriptor(globalThis, 'window');
globalThis.window = window;
const Tela = require('../../js/orcamento-coerencia-tela.js');
if (antes) Object.defineProperty(globalThis, 'window', antes); else delete globalThis.window;

let falas, grupos, trocas, consultor, trocaDa;
beforeEach(() => {
  guardado.clear();
  falas = []; grupos = []; trocas = []; consultor = true; trocaDa = true;
  window.BZToques = {
    comConsultor: () => consultor,
    trocarRamo: r => { trocas.push(r); return trocaDa; },
    kit: {
      fala: t => { falas.push(t); return { firstChild: { id: 'f' + falas.length } }; },
      opcoes: (rotulo, itens, aoEscolher, o) => { grupos.push({ rotulo, itens, aoEscolher, o }); },
      focarSaida: () => {}
    }
  };
});
let n = 0;
const estado = (coerencia, extra = {}) => ({ reacao: true, coerencia, conversa: { id: 'conversa-' + (++n) }, ...extra });
const PADARIA = { palpite: 'alimentacao', nome: 'Alimentação', tocado: 'Saúde' };

test('com reacao: true e coerencia: uma fala com o palpite da tabela e dois botões', () => {
  assert.equal(Tela.atualizar(estado(PADARIA)), true);
  assert.deepEqual(falas, ['Pelo que você contou, o seu negócio parece ser de Alimentação, e não de Saúde. Quer que eu ajuste?']);
  assert.deepEqual(grupos[0].itens.map(i => i.rotulo), ['Sim, ajuste', 'Não, está certo']);
  assert.deepEqual(grupos[0].o, { falaId: 'f1' });
});

test('sem reacao: true, sem coerencia, sem conversa, sem consultor ou sem os toques: nada', () => {
  assert.equal(Tela.atualizar({ coerencia: PADARIA, conversa: { id: 'x1' } }), false);
  assert.equal(Tela.atualizar(estado(undefined)), false);
  assert.equal(Tela.atualizar({ reacao: true, coerencia: PADARIA }), false);
  consultor = false;
  assert.equal(Tela.atualizar(estado(PADARIA)), false);
  consultor = true;
  const t = window.BZToques; window.BZToques = undefined;
  assert.equal(Tela.atualizar(estado(PADARIA)), false);
  window.BZToques = t;
  assert.equal(falas.length, 0);
});

test('palpite fora da tabela (ou "outro", ou herdado) não vira pergunta; nome do servidor que não é da tabela não aparece', () => {
  for (const palpite of ['outro', 'banco', '__proto__', 'constructor', 42, null]) assert.equal(Tela.atualizar(estado({ palpite, nome: 'x' })), false, String(palpite));
  Tela.atualizar(estado({ palpite: 'beleza', nome: '<b>Beleza</b>', tocado: '<img src=x>' }));
  assert.deepEqual(falas, ['Pelo que você contou, o seu negócio parece ser de Beleza. Quer que eu ajuste?']);
});

test('uma vez por conversa, também numa página nova (sessionStorage); outra conversa pergunta de novo', () => {
  const e = estado(PADARIA);
  assert.equal(Tela.atualizar(e), true);
  assert.equal(Tela.atualizar(e), false);
  assert.ok(guardado.has('bz-coerencia-' + e.conversa.id));
  assert.equal(Tela.atualizar(estado(PADARIA)), true);
  assert.equal(falas.length, 2);
});

test('"Sim, ajuste" troca só o ramo pelo caminho dos toques; se não der, diz como ajustar; "Não" não troca nada', () => {
  Tela.atualizar(estado(PADARIA));
  grupos[0].aoEscolher('sim');
  assert.deepEqual(trocas, ['alimentacao']);
  trocaDa = false;
  Tela.atualizar(estado(PADARIA));
  grupos[1].aoEscolher('sim');
  assert.match(falas.at(-1), /Mudar as respostas/);
  Tela.atualizar(estado(PADARIA));
  grupos[2].aoEscolher('nao');
  assert.deepEqual(trocas, ['alimentacao', 'alimentacao']);
});

test('fonte e página: ES5 sem innerHTML; os scripts depois dos toques e antes do orcamento.js; o render chama o atualizar; trocarRamo existe', () => {
  const fonte = lerFonte('js/orcamento-coerencia-tela.js');
  assert.ok(!/innerHTML|=>|\blet\b|\bconst\b/.test(fonte));
  const html = lerFonte('orcamento.html');
  const pos = s => html.indexOf('<script src="js/' + s + '" defer></script>');
  for (const s of ['orcamento-toques.js', 'orcamento-coerencia.js', 'orcamento-coerencia-tela.js', 'orcamento.js']) assert.ok(pos(s) > 0, s);
  assert.ok(pos('orcamento-toques.js') < pos('orcamento-coerencia.js') && pos('orcamento-coerencia.js') < pos('orcamento-coerencia-tela.js') && pos('orcamento-coerencia-tela.js') < pos('orcamento.js'));
  assert.match(lerFonte('js/orcamento.js'), /window\.BZOrcCoerenciaTela\.atualizar\(E\)/);
  assert.match(lerFonte('js/orcamento-toques.js'), /trocarRamo: function \(ramo\)/);
});
