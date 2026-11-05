/* "COMBINADO" SÓ QUANDO O ENVIO ENTROU (pendência do 2c aceita para a 2d). O botão "Está certo" chama aoCerto; se a conversa estava ocupada ou o envio falhou sem gravar, a
   faixa não pode dizer "Combinado" como se a mensagem tivesse ido. js/orcamento-planta.js (aoCerto) devolve false (não vai), uma promessa do que o envio decidiu, ou true;
   js/planta-desenho.js só deixa "Combinado" ficar quando não for false (desfaz o que mostrou se a promessa disser que não entrou).
   node --test docs/testes/planta-combinado.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import M from '../../js/planta-desenho.js';
import { criarJanela } from './planta-dom-falso.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const novo = (aoCerto) => {
  const w = criarJanela({ reduzido: true, largura: 390 });
  const A = M.criar(w), raiz = w.raiz(390);
  A.montar(raiz, fx('clinica'), { editavel: true, aoCerto });
  const certo = raiz.porClasse('plv-acoes')[0].porTag('button')[0];
  const tag = () => raiz.porClasse('plv-leitura__tag')[0].textContent, txt = () => raiz.porClasse('plv-leitura__txt')[0].textContent;
  return { w, raiz, certo, tag, txt };
};
const microtarefas = () => new Promise((r) => setImmediate(r));

test('aoCerto devolve false: "Combinado" não aparece (a leitura fica como estava)', () => {
  const a = novo(() => false);
  const antes = [a.tag(), a.txt()];
  a.certo.disparar('click');
  assert.deepEqual([a.tag(), a.txt()], antes);
  assert.notEqual(a.tag(), 'Combinado');
});

test('aoCerto devolve true ou nada (versão antiga da ligação): "Combinado" aparece na hora, como sempre', () => {
  for (const r of [true, undefined, 1]) {
    const a = novo(() => r);
    a.certo.disparar('click');
    assert.equal(a.tag(), 'Combinado');
  }
});

test('aoCerto devolve uma promessa: "Combinado" aparece na hora (a resposta do Zero leva segundos) e fica se o envio entrou', async () => {
  const a = novo(() => Promise.resolve(true));
  a.certo.disparar('click');
  assert.equal(a.tag(), 'Combinado');
  await microtarefas();
  assert.equal(a.tag(), 'Combinado');
});

test('a promessa diz que o envio NÃO entrou (false) ou rejeita: o texto de antes volta, e só o dele', async () => {
  for (const p of [() => Promise.resolve(false), () => Promise.reject(new Error('rede'))]) {
    const a = novo(p);
    const antes = [a.tag(), a.txt()];
    a.certo.disparar('click');
    assert.equal(a.tag(), 'Combinado');
    await microtarefas();
    assert.deepEqual([a.tag(), a.txt()], antes);
  }
});

test('depois que a pessoa já tocou em outra caixa, a promessa tardia não apaga o que ela está lendo', async () => {
  let resolver;
  const a = novo(() => new Promise((r) => { resolver = r; }));
  a.certo.disparar('click');
  const tag = a.raiz.porClasse('plv-leitura__tag')[0], txt = a.raiz.porClasse('plv-leitura__txt')[0];
  tag.textContent = '02 · Mostra'; txt.textContent = 'Outra caixa, lida depois do clique.';   /* a luz passou para outra caixa */
  resolver(false);
  await microtarefas();
  assert.deepEqual([a.tag(), a.txt()], ['02 · Mostra', 'Outra caixa, lida depois do clique.'], 'não sobrescreve outra leitura');
});

/* ---------- a ligação ---------- */
import Ligacao from '../../js/orcamento-planta.js';
test('ligação: aoCerto devolve false quando não vai (não editável, sem envio, mesma versão de novo, envio que devolve false) e a promessa do envio quando ele é assíncrono', async () => {
  const capturas = [];
  const montar = (enviar, editavel = true) => {
    const w = criarJanela({ reduzido: true, largura: 390 });
    const doc = w.document, ids = {};
    const n = (tag, id) => { const e = doc.createElement(tag); if (id) { e.attrs.id = id; ids[id] = e; } return e; };
    doc.getElementById = (id) => ids[id] || null;
    doc.head = n('head');
    const main = n('main'), faixa = n('section', 'o-planta'); faixa.hidden = true; faixa.clientWidth = 390; main.appendChild(faixa);
    const mesa = n('div'); main.appendChild(mesa); main.filhos.reverse(); mesa.pai = main;   /* a mesa vem antes da faixa */
    mesa.getBoundingClientRect = () => ({ top: 0, bottom: 5000, height: 5000 });
    const log = n('ol', 'o-log'); log.appendChild(n('li'));
    n('div', 'o-log-caixa'); n('textarea', 'o-texto'); n('form', 'o-form');
    w.console = { warn() {}, log() {}, error() {} };
    const cap = { op: null };
    const bloco = (src) => ({ BZPlantaForma: { validarFormaPlano: () => ({ ok: true }) } });
    doc.head.appendChild = (s) => { w.setTimeout(() => { if (String(s.tagName).toLowerCase() === 'script') { w.BZPlantaForma = { validarFormaPlano: () => ({ ok: true }) }; w.BZPlantaPecas = {}; w.BZPlantaLayout = {}; w.BZPlanta = { montar: (r, p, op) => { cap.op = op; return { ok: true }; }, atualizar: () => ({ ok: true }), parar() {} }; } s.disparar('load'); }, 0); return s; };
    const L = Ligacao.criar(w);
    const E = { conversa: { etapa: 'estimativa', briefing: {} }, mensagens: [{ papel: 'visitante', conteudo: 'a' }, { papel: 'agente', conteudo: 'b' }], planta: { versao: 1, origem: 'modelo', n_mensagens: 1, plano: fx('clinica') }, planta_editavel: editavel };
    const enviados = [];
    L.atualizar(E, { rolarAte() {}, enviar: enviar ? (t) => { enviados.push(t); return enviar(t); } : undefined });
    w.avancar(50);
    capturas.push(cap);
    return { cap, enviados };
  };
  const a = montar((t) => Promise.resolve(true));
  const r1 = a.cap.op.aoCerto();
  assert.ok(r1 && typeof r1.then === 'function', 'envio assíncrono: devolve a promessa');
  assert.equal(await r1, true);
  assert.equal(a.cap.op.aoCerto(), 'duplicada', 'a mesma versão de novo: já foi (o desenho avisa "Já enviei esta planta.")');
  assert.equal(a.enviados.length, 1);
  const b = montar((t) => Promise.resolve(false));
  assert.equal(await b.cap.op.aoCerto(), false, 'o envio disse que não entrou');
  const c = montar((t) => false);
  assert.equal(c.cap.op.aoCerto(), false, 'o envio recusou na hora');
  const d = montar((t) => true);
  assert.equal(d.cap.op.aoCerto(), true);
  const e = montar(undefined);
  assert.equal(e.cap.op.aoCerto(), false, 'sem função de envio');
  const f = montar((t) => Promise.reject(new Error('x')));
  assert.equal(await f.cap.op.aoCerto(), false, 'rejeitou');
  const g = montar((t) => { throw new Error('x'); });
  assert.equal(g.cap.op.aoCerto(), false, 'lançou');
  void clone;
});

/* ---------- A4: o sucesso não é anunciado (o "Analisando…" do #o-voz cobre); só a falha e o duplicado, pelo plv-status do desenho ---------- */
const FALHA = 'Não consegui enviar agora. Tente de novo.', JA = 'Já enviei esta planta.';
const status = (a) => a.raiz.porClasse('plv-status')[0];
test('A4: envio aceito não escreve nada no plv-status; "duplicada" diz "Já enviei esta planta."; false, promessa que diz não ou rejeição dizem "Não consegui enviar agora. Tente de novo."', async () => {
  const ok = novo(() => Promise.resolve(true));
  const antes = status(ok).textContent;
  ok.certo.disparar('click'); ok.w.avancar(200); await microtarefas(); ok.w.avancar(200);
  assert.equal(status(ok).textContent, antes, 'sucesso não é anunciado');
  const dup = novo(() => 'duplicada');
  dup.certo.disparar('click'); dup.w.avancar(200);
  assert.equal(status(dup).textContent, JA);
  assert.notEqual(dup.tag(), 'Combinado');
  for (const fn of [() => false, () => Promise.resolve(false), () => Promise.reject(new Error('rede'))]) {
    const a = novo(fn);
    a.certo.disparar('click'); a.w.avancar(200); await microtarefas(); a.w.avancar(200);
    assert.equal(status(a).textContent, FALHA);
    assert.notEqual(a.tag(), 'Combinado');
  }
});

test('A4: a mesma frase de falha é anunciada de novo na 2ª vez (o texto é limpo antes de escrever)', () => {
  const a = novo(() => false);
  a.certo.disparar('click');
  assert.equal(status(a).textContent, '', 'limpo na hora');
  a.w.avancar(200);
  assert.equal(status(a).textContent, FALHA);
  a.certo.disparar('click');
  assert.equal(status(a).textContent, '');
  a.w.avancar(200);
  assert.equal(status(a).textContent, FALHA);
});
