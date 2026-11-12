/* OS SONS COM IMERSÃO (dono, 2026-11-07: "Os sons do site estão muito simples, quase imperceptíveis [...] cada pulso, a
   transformação pro estado dourado, manter o cursor em cima de um card ou clicar nele [...] minimalista porém aparente").
   Desenho e calibração: docs/sons/previa.html. Roda o js/som.js DE VERDADE num navegador de mentira (DOM, barramento
   B e Web Audio falsos, relógio na mão do teste) e confere o que cada evento do site toca, com o gancho de teste
   B.somTeste (só com ?som=teste). Roda por docs/testes/som.test.mjs (o testar do package.json é lista fechada).
   node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonte = fs.readFileSync(new URL('../../js/som.js', import.meta.url), 'utf8');

/* ---------- o navegador de mentira ---------- */
function param(v) {
  const p = { value: v };
  for (const m of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) p[m] = () => p;
  return p;
}
function criarCtx(e) {
  const ctx = {
    state: e.nasceSuspenso ? 'suspended' : 'running', sampleRate: 24000, inicios: 0, suspensoes: 0, paradas: [],
    get currentTime() { return e.t; },
    resume() { if (!e.nasceSuspenso) ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; ctx.suspensoes++; return Promise.resolve(); },
    close() { ctx.state = 'closed'; return Promise.resolve(); },
    addEventListener() {},
    createBuffer: (ch, n) => { const d = Array.from({ length: ch }, () => new Float32Array(n)); return { numberOfChannels: ch, length: n, getChannelData: i => d[i] }; }
  };
  const no = () => ({
    connect: d => d, disconnect() {}, start() { ctx.inicios++; }, stop(t) { ctx.paradas.push(t); }, addEventListener() {},
    gain: param(1), frequency: param(440), detune: param(0), Q: param(1), pan: param(0), type: '', buffer: null, curve: null, oversample: 'none'
  });
  for (const m of ['createGain', 'createOscillator', 'createBiquadFilter', 'createBufferSource', 'createConvolver', 'createStereoPanner', 'createWaveShaper']) ctx[m] = no;
  ctx.destination = no();
  e.contextos.push(ctx);
  return ctx;
}
function elemento(o) {
  const el = Object.assign({ card: false, btn: false, link: false, som: false, _carga: null }, o);
  el.matches = sel => (el.card && /\.painel/.test(sel)) || (el.btn && /\.btn/.test(sel)) || (el.link && /\ba\b/.test(sel)) || (el.som && /data-som/.test(sel));
  el.closest = sel => (el.matches(sel) ? el : null);
  el.getBoundingClientRect = () => ({ left: 100, top: 100, width: 200, height: 120 });
  el.setAttribute = () => {}; el.getAttribute = () => null; el.addEventListener = (t, f) => { (el.ouv[t] || (el.ouv[t] = [])).push(f); };
  el.ouv = {}; el.hidden = true;
  return el;
}
function navegador(op) {
  op = op || {};
  const e = { nasceSuspenso: !!op.nasceSuspenso, t: 0, fila: [], seq: 0, contextos: [], ouv: {}, classes: new Set(op.classes || []), grava: Object.assign({}, op.grava) };
  const pai = { children: [] };
  e.card = elemento({ card: true, parentElement: pai }); pai.children.push(e.card);
  e.link = elemento({ link: true });
  e.botaoSom = elemento({ som: true, link: true });
  const ouvintesB = {};
  e.B = {
    FOLEGO: { periodo: 7, inspira: 0.42 }, reduced: !!op.reduzido, relogio: () => e.t + (op.fase0 || 0),
    on: (ev, f) => { (ouvintesB[ev] || (ouvintesB[ev] = [])).push(f); },
    emit: (ev, d) => { (ouvintesB[ev] || []).forEach(f => f(d)); }
  };
  const armazem = obj => ({ getItem: k => (k in obj ? obj[k] : null), setItem: (k, v) => { obj[k] = String(v); }, removeItem: k => { delete obj[k]; } });
  e.document = {
    hidden: false,
    documentElement: { classList: { contains: c => e.classes.has(c), add: c => e.classes.add(c), remove: c => e.classes.delete(c), toggle() {} } },
    querySelectorAll: sel => (/data-som/.test(sel) ? [e.botaoSom] : []),
    querySelector: () => null,
    addEventListener: (t, f) => { (e.ouv[t] || (e.ouv[t] = [])).push(f); }
  };
  /* (op.ativado: a ativação que o Chrome passa adiante na mesma origem, chegando pela travessia) */
  e.navigator = { userActivation: { isActive: false, hasBeenActive: !!op.ativado } };
  e.window = {
    AudioContext: function () { return criarCtx(e); },
    BEYON: e.B, innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ matches: !!op.desktop, addEventListener() {} }),
    addEventListener: () => {}
  };
  e.setTimeout = (fn, ms) => { const id = ++e.seq; e.fila.push({ id, fn, quando: e.t + (ms || 0) / 1000 }); return id; };
  e.clearTimeout = id => { e.fila = e.fila.filter(x => x.id !== id); };
  e.andar = ate => {
    while (e.t < ate - 1e-9) {
      e.t = Math.min(ate, e.t + 0.005);
      for (const x of e.fila.filter(x => x.quando <= e.t + 1e-9).sort((a, b) => a.quando - b.quando)) { e.fila = e.fila.filter(y => y !== x); x.fn(); }
    }
  };
  e.disparar = (tipo, ev) => { (e.ouv[tipo] || []).forEach(f => f(Object.assign({ type: tipo }, ev))); };
  e.gesto = alvo => {
    e.navigator.userActivation.isActive = e.navigator.userActivation.hasBeenActive = true;
    e.disparar('pointerdown', { target: alvo || e.link, pointerType: 'mouse' });
    e.navigator.userActivation.isActive = false;
  };
  e.clicar = alvo => { e.navigator.userActivation.isActive = true; e.disparar('click', { target: alvo }); e.navigator.userActivation.isActive = false; };
  /* o botão de som: o ouvinte dele, com gesto */
  e.alternar = () => { e.navigator.userActivation.isActive = true; (e.botaoSom.ouv.click || []).forEach(f => f({ target: e.botaoSom })); e.navigator.userActivation.isActive = false; };
  e.passar = alvo => e.disparar('pointerenter', { target: alvo, pointerType: 'mouse' });
  e.vozes = () => (e.B.somTeste ? e.B.somTeste.vozes : {});
  new Function('window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'setTimeout', 'clearTimeout', 'Date', fonte)(
    e.window, e.document, e.navigator, armazem(e.grava), armazem(Object.assign({}, op.sessao)), { search: op.semGancho ? '' : '?som=teste' }, e.setTimeout, e.clearTimeout, { now: () => 1.7e12 + e.t * 1000 });
  return e;
}

/* ---------- as escolhas ---------- */
test('as escolhas do dono ficam numa constante só, no topo do som.js, com os padrões combinados', () => {
  const m = fonte.match(/var ESCOLHA = \{([^}]*)\}/);
  assert.ok(m, 'var ESCOLHA = { … } não achada');
  const esc = m[1];
  for (const [k, v] of [['pulso', "'luzSonar'"], ['fundo', "'cabine'"], ['card', "'A'"], ['carga', "'proposta'"], ['clique', "'proposta'"], ['ouro', "'A'"], ['travessia', 'true'], ['intensidade', '1']]) {
    assert.match(esc, new RegExp('\\b' + k + ':\\s*' + v + '(?=[,\\s])'), k + ' = ' + v);
  }
  assert.ok(fonte.indexOf('var ESCOLHA') < fonte.search(/\bfunction [a-zA-Z]/), 'no topo, antes das funções');
  assert.doesNotMatch(fonte, /createDynamicsCompressor/, 'sem compressor: o do Chrome soma ganho sozinho e desfaz a calibração');
  assert.doesNotMatch(fonte, /=>|\blet\b|\bconst\b|`/, 'js/ é ES5');
});

test('o gancho de teste só existe com ?som=teste', () => {
  assert.equal(navegador({ semGancho: true }).B.somTeste, undefined);
  assert.ok(navegador().B.somTeste);
});

/* ---------- antes do gesto, desligado ---------- */
test('antes do gesto: nenhum contexto de áudio e nenhuma voz, aconteça o que acontecer na página', () => {
  const e = navegador({ desktop: true });
  e.passar(e.card);
  e.B.emit('carga:cheio', e.card); e.B.emit('ouro', { fase: 'carga' }); e.B.emit('passagem', {}); e.B.emit('trilho:onda');
  e.andar(15);
  assert.equal(e.contextos.length, 0, 'criou AudioContext sem gesto');
  assert.deepEqual(e.vozes(), {});
});

test('com o interruptor desligado (bz-som = 0) nada toca, nem depois do gesto', () => {
  const e = navegador({ grava: { 'bz-som': '0' }, desktop: true });
  e.gesto(); e.clicar(e.link); e.passar(e.card); e.B.emit('ouro', { fase: 'carga' }); e.andar(15);
  const vozes = e.vozes();
  assert.equal(Object.keys(vozes).length, 0, JSON.stringify(vozes));
});

/* ---------- cada evento, a sua voz ---------- */
test('depois do gesto: clique, card, trava, ouro e travessia tocam cada um a sua voz', () => {
  const e = navegador({ desktop: true });
  e.gesto(); e.andar(0.2);
  e.clicar(e.link); e.andar(0.4);
  e.passar(e.card); e.andar(0.6);
  e.B.emit('carga:cheio', e.card); e.andar(0.8);
  e.B.emit('ouro', { fase: 'carga' }); e.andar(2.6);
  e.B.emit('ouro', { fase: 'ignicao' }); e.andar(4.2);
  e.B.emit('ouro', { fase: 'reinado' }); e.andar(6);
  e.B.emit('ouro', { fase: 'esfria' }); e.andar(8.5);
  e.B.emit('passagem', {}); e.andar(9);
  const v = e.vozes();
  for (const k of ['clique', 'card', 'trava', 'ouroCarga', 'ouroIgnicao', 'ouroReinado', 'ouroEsfria', 'passagem']) assert.ok(v[k] >= 1, k + ' não tocou: ' + JSON.stringify(v));
  assert.ok(e.contextos[0].inicios > 20, 'as vozes não ligaram osciladores');
});

test('o toque num card (celular) toca o card; o toque num link toca o clique', () => {
  const e = navegador();
  e.gesto(e.card); e.andar(0.2);
  e.clicar(e.card); e.andar(0.5);
  e.clicar(e.link); e.andar(0.8);
  assert.equal(e.vozes().card, 1);
  assert.equal(e.vozes().clique, 1);
});

test('nenhuma voz empilha: 10 cards em 100 ms, 4 cards cheios juntos, 6 cliques seguidos', () => {
  const e = navegador({ desktop: true });
  e.gesto(); e.andar(0.2);
  for (let i = 0; i < 10; i++) { e.passar(e.card); e.andar(0.2 + (i + 1) * 0.01); }
  for (let i = 0; i < 4; i++) e.B.emit('carga:cheio', e.card);
  e.andar(0.5);
  for (let i = 0; i < 6; i++) { e.clicar(e.link); e.andar(0.5 + (i + 1) * 0.015); }
  const v = e.vozes();
  assert.ok(v.card <= 3, 'cards: ' + v.card);
  assert.equal(v.trava, 1, 'travas: ' + v.trava);
  assert.ok(v.clique <= 3, 'cliques: ' + v.clique);
});

/* ---------- o pulso no compasso do fôlego ---------- */
test('o pulso toca uma vez por fôlego, na expiração (a onda que sai do núcleo: rede.js, fase B.FOLEGO.inspira)', () => {
  const e = navegador({ fase0: 1.3 });
  e.gesto(); e.andar(28.3);
  const pulsos = e.B.somTeste.log.filter(x => x.tipo === 'pulso');
  /* (o 1º fôlego cai na subida do fundo, 8 s na 1ª página: o pulso espera o ambiente chegar, não aparece do nada) */
  assert.equal(pulsos.length, 3, JSON.stringify(pulsos));
  assert.ok(pulsos[0].t >= 8, 'pulsou antes de o fundo subir: ' + pulsos[0].t);
  for (const p of pulsos) {
    const fase = ((p.relogio / 7) % 1 + 1) % 1;
    assert.ok(Math.abs(fase - 0.42) < 0.01, 'fase ' + fase);
  }
});

test('sem pulso com a aba escondida (e o contexto suspenso), nem durante a travessia', () => {
  const e = navegador();
  e.gesto(); e.andar(1);
  e.document.hidden = true; e.disparar('visibilitychange', {});
  assert.ok(e.contextos[0].suspensoes >= 1, 'não suspendeu');
  e.andar(15);
  assert.equal(e.vozes().pulso || 0, 0, 'pulsou escondida');
  e.document.hidden = false; e.disparar('visibilitychange', {});
  e.B.emit('passagem', {});
  e.andar(30);
  assert.equal(e.vozes().pulso || 0, 0, 'pulsou com a página saindo');
});

/* ---------- movimento reduzido ---------- */
test('movimento reduzido: o pulso (automático, sem onda para ver) sai; o clique e o card (resposta à pessoa) ficam', () => {
  const e = navegador({ reduzido: true });
  e.gesto(); e.andar(0.3);
  e.clicar(e.link); e.andar(0.6);
  e.clicar(e.card); e.andar(21);
  const v = e.vozes();
  assert.equal(v.pulso || 0, 0);
  assert.equal(v.clique, 1);
  assert.equal(v.card, 1);
});

/* ---------- achados da revisão ---------- */
test('o contexto que nasce suspenso no gesto (Safari, celular) não perde o 1º toque: o que vem logo em seguida toca', () => {
  const e = navegador({ nasceSuspenso: true });
  e.gesto(e.card); e.andar(0.05);
  e.clicar(e.card);
  assert.equal(e.vozes().card, 1, 'o 1º toque no card se perdeu');
  e.andar(2);
  e.B.emit('carga:cheio', e.card);   /* (um evento sem gesto, longe do gesto: o contexto não acordou) */
  assert.equal(e.vozes().trava || 0, 0, 'um contexto que nunca acordou acumulou vozes para tocar depois');
});

test('desligar no meio do reinado para o acorde do ouro; religar com o ouro ainda reinando o traz de volta', () => {
  const e = navegador();
  e.B.ouro = { estado: 'frio', T: { carga: 1.8, ignicao: 1.6, reinado: 30, esfria: 2.2 } };
  e.gesto(); e.andar(0.5);
  e.B.ouro.estado = 'reinado'; e.B.emit('ouro', { fase: 'reinado' }); e.andar(2);
  assert.equal(e.vozes().ouroReinado, 1);
  e.alternar(); e.andar(4);
  e.alternar(); e.andar(6);
  assert.equal(e.vozes().ouroReinado, 2, 'religado no reinado, o acorde não voltou');
});

test('o ouro esfria com a aba escondida: o acorde fecha curto, não faz a queda longa quando a pessoa voltar', () => {
  /* (escondida, o relógio do áudio para e o js/ouro.js segue no relógio real: a queda de 2,2 s agendada ali tocaria
     inteira na volta, com o ouro já apagado) */
  const e = navegador();
  e.B.ouro = { estado: 'frio', T: { carga: 1.8, ignicao: 1.6, reinado: 12, esfria: 2.2 } };
  e.gesto(); e.andar(0.5);
  e.B.ouro.estado = 'reinado'; e.B.emit('ouro', { fase: 'reinado' }); e.andar(2);
  e.document.hidden = true; e.disparar('visibilitychange', {});
  const ctx = e.contextos[0], antes = ctx.paradas.length;
  e.B.ouro.estado = 'esfria'; e.B.emit('ouro', { fase: 'esfria' });
  const novas = ctx.paradas.slice(antes);
  assert.ok(novas.length > 0, 'o acorde não foi fechado');
  assert.ok(Math.max(...novas) < e.t + 1, 'o acorde ficou com a queda longa agendada: ' + Math.max(...novas).toFixed(2) + ' s');
});

/* ---------- 2026-11-10: o fundo confortável, o pulso que se sente e o AI Core médio com som ----------
   Dono: o fundo "passa uma sensação pesada" (era um zumbido de 110 Hz) e deve ser "Sci-Fi confortador"; o pulso do AI
   Core "deve ocorrer e deverá ter um som próprio", "frequente, mas não [...] chato ou enjoativo"; sons para o AI Core
   médio e as interações especiais. Escolhas na docs/sons/previa-2.html (Decisões, 2026-11-10). */
test('o fundo é a Cabine calma: sem o grave pesado de 110 Hz, um acorde aberto no meio', () => {
  const m = fonte.match(/var FUNDOS = \{[\s\S]*?\n  \};/);
  assert.ok(m, 'var FUNDOS = { … } não achada');
  const cab = m[0].match(/cabine:\s*\{[^\n]*notas:\s*\[([^\n]*?)\]\s*,\s*filtro/);
  assert.ok(cab, 'a cabine não está em FUNDOS');
  const hz = [...cab[1].matchAll(/\[(\d+(?:\.\d+)?),/g)].map(x => +x[1]);
  assert.ok(hz.length >= 3, 'acorde com 3+ notas: ' + hz);
  assert.ok(Math.min(...hz) >= 200, 'grave abaixo de 200 Hz volta o "pesado": ' + Math.min(...hz));
  const e = navegador();
  e.gesto(); e.andar(1);
  const osc = e.contextos[0];
  assert.ok(osc.inicios >= hz.length * 2, 'cada nota com duas vozes (o batimento lento): ' + osc.inicios);
});

test('o pulso tem voz própria, uma batida só (sem tum-tum), e uma frase de 4 em que só o 4º acentua', () => {
  const e = navegador({ fase0: 1.3 });
  e.gesto(); e.andar(8 + 7 * 8 + 0.5);
  const pulsos = e.B.somTeste.log.filter(x => x.tipo === 'pulso');
  assert.ok(pulsos.length >= 8, 'pulsos: ' + pulsos.length);
  for (const p of pulsos) {
    const n = Math.floor((p.relogio - 7 * 0.42) / 7 + 1e-6);
    assert.equal(p.forte, ((n % 4) + 4) % 4 === 3, 'o pulso ' + n + ' acentua errado');
  }
  assert.ok(pulsos.some(p => p.forte) && pulsos.some(p => !p.forte));
  assert.equal(new Set(pulsos.slice(0, 4).map(p => p.nota)).size, 4, 'a nota muda dentro da frase: ' + pulsos.slice(0, 4).map(p => p.nota));
});

test('o pulso cala enquanto a pessoa carrega um card (a interação dela tem a vez)', () => {
  const e = navegador({ desktop: true, fase0: 1.3 });
  e.gesto(); e.andar(9);
  const antes = e.vozes().pulso || 0;
  e.card._carga = { p: 0 }; e.passar(e.card);   /* o cursor para no card: a carga começa */
  e.andar(9 + 7 * 2);
  assert.equal(e.vozes().pulso || 0, antes, 'pulsou com o card carregando');
});

test('o AI Core médio e as interações especiais tocam cada um a sua voz (com o som ligado)', () => {
  const e = navegador({ desktop: true });
  e.gesto(); e.andar(0.5);
  e.B.emit('estacao:acopla', { dura: 2 }); e.andar(1);
  e.B.emit('estacao:conecta', {}); e.andar(1.5);
  e.B.emit('estacao:surto', { n: 4 }); e.andar(2);
  e.B.emit('estacao:solta', {}); e.andar(2.5);
  e.B.emit('mini:ignicao', {}); e.andar(3.5);
  e.B.emit('energia:descarga', {}); e.andar(4);
  const v = e.vozes();
  for (const k of ['estacaoEnche', 'estacaoConecta', 'estacaoSurto', 'estacaoSolta', 'ignicao', 'descarga']) assert.equal(v[k], 1, k + ': ' + JSON.stringify(v));
});

test('as vozes novas não empilham: 5 descargas e 5 surtos seguidos soam no máximo uma vez cada por instante', () => {
  const e = navegador({ desktop: true });
  e.gesto(); e.andar(0.5);
  for (let i = 0; i < 5; i++) { e.B.emit('energia:descarga', {}); e.B.emit('estacao:surto', { n: 6 }); e.andar(0.5 + (i + 1) * 0.05); }
  const v = e.vozes();
  assert.equal(v.descarga, 1, 'descargas: ' + v.descarga);
  assert.equal(v.estacaoSurto, 1, 'surtos: ' + v.estacaoSurto);
});

/* ---------- a chegada pela travessia (2ª rodada das transições, 12/11) ---------- */
/* criar o AudioContext trava a página: 75 a 103 ms medidos no Chrome do dono (desktop, sem CPU lenta). Chegando pela
   travessia com o som vivo, ele nascia na carga do script, no meio do voo de chegada. Agora nasce no pouso. */
const chegandoComSom = () => navegador({ desktop: true, ativado: true, classes: ['passagem-chega'], sessao: { 'bz-som-vivo': String(1.7e12 - 2000) } });

test('chegando pela travessia com o som vivo: nenhum AudioContext durante o voo; ele nasce no pouso e o pouso toca', () => {
  const e = chegandoComSom();
  e.andar(0.9);
  assert.equal(e.contextos.length, 0, 'o áudio nasceu no meio da chegada');
  e.classes.delete('passagem-chega');
  e.B.emit('passagem:chegou');
  assert.equal(e.contextos.length, 1, 'o áudio não nasceu no pouso');
  e.andar(1.2);
  assert.equal(e.vozes().pouso, 1, 'o pouso não tocou: ' + JSON.stringify(e.vozes()));
});

test('chegando com o som vivo e a passagem nunca avisando o pouso: o áudio nasce mesmo assim (rede de segurança)', () => {
  const e = chegandoComSom();
  e.andar(2.5);
  assert.equal(e.contextos.length, 0, 'nasceu antes da rede de segurança');
  e.andar(3.5);
  assert.equal(e.contextos.length, 1, 'o som ficou mudo para sempre');
});
