/* O PULSO NO SITE INTEIRO (dono, 2026-11-10: "o pulso do AI Core principal, eu não sinto ele ocorrendo [...] deverá
   interagir com o site inteiro [...] frequente, mas não deverá ser chato ou enjoativo"; Decisões 2026-11-10).
   Roda o js/pulso.js DE VERDADE num navegador de mentira (DOM, barramento B e relógio na mão do teste) e confere:
   o compasso (um pulso por fôlego, na expiração), o forte (um a cada 4, o mesmo do reator), a página que acende de
   cima para baixo só no que está na tela, e o silêncio (aba escondida, movimento reduzido, travessia, card
   carregando). Roda por docs/testes/som.test.mjs (o testar do package.json é lista fechada).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const fonte = ler('js/pulso.js');

/* o B.pulso de verdade, tirado do js/core.js (a conta que a página, o som e o reator dividem) */
function pulsoDoCore() {
  const m = ler('js/core.js').match(/pulso: \{\s*numero: (function[^\n]*),\s*forte: (function[^\n]*)\s*\}/);
  assert.ok(m, 'B.pulso { numero, forte } não achado no core.js');
  const FOLEGO = { periodo: 7, inspira: 0.42 };
  return new Function('FOLEGO', 'return { numero: ' + m[1].replace(/,\s*$/, '') + ', forte: ' + m[2] + ' };')(FOLEGO);
}

function el(nome, top) {
  const classes = new Set([nome]);
  return { nome, top, classes, classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    getBoundingClientRect: () => ({ top, bottom: top + 20, height: 20 }) };
}
function navegador(op = {}) {
  const e = { t: 0, fila: [], seq: 0, emitidos: [], acesos: [], ouv: {}, classes: new Set(op.classes || []) };
  e.alvos = op.alvos || [el('kicker', 600), el('passo', 100), el('marca', 10), el('kicker', -400), el('passo', 1300)];
  e.B = {
    FOLEGO: { periodo: 7, inspira: 0.42 }, reduced: !!op.reduzido, relogio: () => e.t + (op.fase0 || 0),
    pulso: pulsoDoCore(),
    emit: (ev, d) => e.emitidos.push([ev, d])
  };
  e.document = {
    hidden: false,
    documentElement: { classList: { contains: c => e.classes.has(c) } },
    querySelector: sel => (op.ocupado && /is-carregando/.test(sel) ? {} : null),
    querySelectorAll: () => e.alvos,
    addEventListener: (t, f) => { (e.ouv[t] || (e.ouv[t] = [])).push(f); }
  };
  e.window = { BEYON: e.B, innerHeight: 900 };
  e.setTimeout = (fn, ms) => { const id = ++e.seq; e.fila.push({ id, fn, quando: e.t + (ms || 0) / 1000 }); return id; };
  e.clearTimeout = id => { e.fila = e.fila.filter(x => x.id !== id); };
  e.andar = ate => {
    while (e.t < ate - 1e-9) {
      e.t = Math.min(ate, e.t + 0.005);
      for (const x of e.fila.filter(x => x.quando <= e.t + 1e-9).sort((a, b) => a.quando - b.quando)) {
        e.fila = e.fila.filter(y => y !== x); x.fn();
        for (const a of e.alvos) for (const c of ['is-pulso', 'is-pulso-forte']) if (a.classes.has(c) && !a['_' + c]) { a['_' + c] = true; e.acesos.push({ nome: a.nome, top: a.top, t: e.t, c }); }
        for (const a of e.alvos) for (const c of ['is-pulso', 'is-pulso-forte']) if (!a.classes.has(c)) a['_' + c] = false;
      }
    }
  };
  new Function('window', 'document', 'setTimeout', 'clearTimeout', fonte)(e.window, e.document, e.setTimeout, e.clearTimeout);
  return e;
}
const pulsos = e => e.emitidos.filter(x => x[0] === 'pulso').map(x => x[1]);

test('um pulso por fôlego, no instante da expiração (fase FOLEGO.inspira), com o número do relógio', () => {
  const e = navegador({ fase0: 1.3 });
  e.andar(7 * 6);
  const ps = pulsos(e);
  assert.equal(ps.length, 6, JSON.stringify(ps));
  for (let i = 1; i < ps.length; i++) assert.equal(ps[i].n, ps[i - 1].n + 1, 'números seguidos');
});

test('o forte é um a cada 4, e é o mesmo fôlego que o reator acentua (js/nucleo/pecas.js: floor(t / 7) % 4 === 3)', () => {
  const e = navegador();
  e.andar(7 * 12);
  const ps = pulsos(e);
  assert.equal(ps.filter(p => p.forte).length, 3, JSON.stringify(ps));
  const P = pulsoDoCore();
  for (let c = -6; c < 30; c++) {
    const t = 7 * c + 7 * 0.42 + 0.01;   /* logo depois da expiração do ciclo c */
    assert.equal(P.forte(P.numero(t)), ((Math.floor(t / 7) % 4) + 4) % 4 === 3, 'ciclo ' + c);
  }
  assert.match(ler('js/nucleo/pecas.js'), /Math\.floor\(\(t - RS\.nucleo\[0\]\) \/ RS\.periodo\), forte = \(\(ciclo % 4\) \+ 4\) % 4 === 3/, 'o reator mudou a conta do forte');
});

test('a página acende só o que está na tela, de cima para baixo, e apaga sozinha', () => {
  const e = navegador();
  e.andar(7 * 0.42 + 0.9);
  const nomes = e.acesos.map(a => a.nome + '@' + a.top);
  assert.deepEqual(nomes, ['marca@10', 'passo@100', 'kicker@600'], 'fora da tela (-400 e 1300) não acende; ordem pela altura');
  for (let i = 1; i < e.acesos.length; i++) assert.ok(e.acesos[i].t >= e.acesos[i - 1].t);
  assert.ok(e.acesos[2].t - e.acesos[0].t <= 0.8 + 0.01, 'a varredura passa de 0,8 s');
  e.andar(7 * 0.42 + 3);
  assert.ok(e.alvos.every(a => !a.classes.has('is-pulso')), 'a classe ficou');
});

test('silêncio: aba escondida, movimento reduzido, "menos movimento" e travessia não pulsam; card carregando: avisa, não acende', () => {
  const esc = navegador();
  esc.document.hidden = true; (esc.ouv.visibilitychange || []).forEach(f => f());
  esc.andar(20);
  assert.equal(pulsos(esc).length, 0, 'pulsou escondida');
  for (const op of [{ reduzido: true }, { classes: ['menos-movimento'] }, { classes: ['passagem-chega'] }]) {
    const e = navegador(op); e.andar(20);
    assert.equal(pulsos(e).length + e.acesos.length, 0, JSON.stringify(op));
  }
  const oc = navegador({ ocupado: true }); oc.andar(5);
  assert.equal(pulsos(oc).length, 1, 'o pulso segue (o reator e o mini)');
  assert.equal(oc.acesos.length, 0, 'acendeu a página com o card carregando');
});

test('as páginas que têm o core.js carregam o pulso.js depois dele; o CSS responde às classes', () => {
  for (const p of ['index.html', 'sites.html', 'automacao.html', 'orcamento.html']) {
    const html = ler(p), core = html.indexOf('src="js/core.js"'), pulso = html.indexOf('<script src="js/pulso.js" defer></script>');
    assert.ok(pulso > core && core > 0, p);
  }
  const css = ler('css/motion.css');
  for (const sel of ['.kicker.is-pulso b', '.passo.is-pulso::after', '.marca--nav.is-pulso .marca__nucleo', '.kicker.is-pulso-forte b']) assert.ok(css.includes(sel), sel);
  assert.doesNotMatch(fonte, /=>|\blet\b|\bconst\b|`/, 'js/ é ES5');
});
