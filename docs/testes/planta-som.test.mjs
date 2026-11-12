/* O SOM DA PLANTA (js/planta-som.js) numa janela de mentira com um AudioContext de espia. O que se prova: nada pesado num gesto (criar o
   contexto custou 678 ms no celular com CPU 4x: o toque e a tecla só RETOMAM um contexto que já existe); preparar() cria o contexto e o motor
   uma vez, fora do gesto; com o interruptor do site desligado ('bz-som' = '0') nada é criado nem tocado; o botão [data-som] alterna a chave.
   node --test docs/testes/planta-som.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const FONTE = fs.readFileSync(new URL('../../js/planta-som.js', import.meta.url), 'utf8');

function janela({ desligado = false } = {}) {
  const criados = [], tocados = [];
  const no = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : k === 'value' ? 0 : no()), set: () => true, apply: () => no() });
  class Contexto {
    constructor() { this.state = 'suspended'; this.sampleRate = 48000; this.currentTime = 0; this.destination = no(); this.retomou = 0; criados.push(this); }
    resume() { this.retomou++; this.state = 'running'; }
    suspend() { this.state = 'suspended'; }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createGain() { return no(); } createConvolver() { return no(); } createBiquadFilter() { return no(); } createStereoPanner() { return no(); }
    createOscillator() { const o = no(); tocados.push('osc'); return o; } createBufferSource() { return no(); }
  }
  const ouvintes = {}, armazem = { 'bz-som': desligado ? '0' : null };
  const botao = { hidden: true, attrs: {}, ouv: [], setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.ouv.push(f); } };
  const document = {
    addEventListener: (t, f) => { (ouvintes[t] = ouvintes[t] || []).push(f); },
    querySelectorAll: (s) => (s === '[data-som]' ? [botao] : [])
  };
  const w = { document, AudioContext: Contexto, console: { warn() {} }, localStorage: { getItem: (k) => armazem[k], setItem: (k, v) => { armazem[k] = String(v); } } };
  vm.runInNewContext(FONTE, { window: w });
  const gesto = (t) => (ouvintes[t] || []).forEach((f) => f({ type: t }));
  return { w, S: w.BZPlantaSom, criados, tocados, gesto, botao, armazem };
}

test('nenhum gesto cria o contexto de áudio (o trabalho pesado nunca cai num toque nem numa tecla)', () => {
  const j = janela();
  for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) j.gesto(t);
  assert.equal(j.criados.length, 0);
  j.S.tocar('semente');
  assert.equal(j.tocados.length, 0, 'sem contexto, nada toca');
});

test('preparar() cria o contexto e o motor UMA vez; o gesto seguinte só retoma o contexto suspenso, e aí o som toca', () => {
  const j = janela();
  j.S.preparar(); j.S.preparar();
  assert.equal(j.criados.length, 1);
  j.S.tocar('estacao');
  assert.equal(j.tocados.length, 0, 'suspenso (sem gesto ainda): não toca');
  j.gesto('pointerdown');
  assert.equal(j.criados[0].retomou, 1);
  j.S.tocar('estacao');
  assert.ok(j.tocados.length > 0);
});

test("com o interruptor do site desligado ('bz-som' = '0'), preparar não cria nada e tocar não toca", () => {
  const j = janela({ desligado: true });
  j.S.preparar();
  j.gesto('pointerdown');
  j.S.tocar('ouro');
  assert.equal(j.criados.length, 0);
  assert.equal(j.tocados.length, 0);
});

test('o botão [data-som] aparece com mostrarBotoes, diz o estado em aria-pressed e alterna a chave do site', () => {
  const j = janela();
  j.S.mostrarBotoes(); j.S.mostrarBotoes();
  assert.equal(j.botao.hidden, false);
  assert.equal(j.botao.ouv.length, 1, 'um ouvinte só');
  assert.equal(j.botao.attrs['aria-pressed'], 'true');
  j.botao.ouv[0]();
  assert.equal(j.armazem['bz-som'], '0');
  assert.equal(j.botao.attrs['aria-pressed'], 'false');
  j.botao.ouv[0]();
  assert.equal(j.armazem['bz-som'], '1');
  assert.equal(j.criados.length, 1, 'religar prepara o áudio (o clique já é o gesto)');
});
