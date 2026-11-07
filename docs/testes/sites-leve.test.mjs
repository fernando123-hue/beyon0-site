/* O /sites LEVE (2026-11-07): a planta do hero (css/peca-sites.css, js/peca-sites.js) não empurra a página quando acorda e a
   demonstração de larguras pausa fora de vista e com a aba escondida, e segue de onde estava. Medido em docs/medir-sites-leve.mjs. Roda por docs/testes/heroes.test.mjs
   (o testar do package.json é lista fechada).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = semComentarios(ler('css/peca-sites.css'));
const CONTROLES = ['.planta__formatos', '.planta__frase', '.planta__regua', '.planta__controles'];
/* as regras (seletor → corpo) que valem antes de a peça acordar */
const regrasDormindo = [...css.matchAll(/([^{}]*\.planta:not\(\.is-viva\)[^{}]*)\{([^}]*)\}/g)].map(m => ({ sel: m[1].trim(), corpo: m[2] }));

test('com JS, os controles da planta guardam o lugar invisíveis até a peça acordar (display:none → bloco empurrava o palco: CLS 0,06 no celular)', () => {
  const comJs = regrasDormindo.filter(r => /html\.js\b/.test(r.sel) && /visibility:\s*hidden/.test(r.corpo));
  for (const c of CONTROLES) assert.ok(comJs.some(r => r.sel.includes(c)), c + ' sem visibility:hidden em html.js antes do is-viva');
});

/* ---------- a demonstração pausável (js/peca-sites.js, relogioDaDemo) ---------- */
const js = ler('js/peca-sites.js');
const fonteRelogio = (js.match(/function relogioDaDemo\(env\) \{[\s\S]*?\/\* fim do relógio da demo \*\//) || [''])[0];
/* um tempo de mentira: o relógio de parede, os setTimeout e os quadros andam só quando o teste manda */
function ambiente() {
  const e = { t: 0, fila: [], quadros: [], seq: 0 };
  e.env = {
    agora: () => e.t,
    setTimeout: (fn, ms) => { const id = ++e.seq; e.fila.push({ id, fn, quando: e.t + ms }); return id; },
    clearTimeout: id => { e.fila = e.fila.filter(x => x.id !== id); },
    raf: fn => { const id = ++e.seq; e.quadros.push({ id, fn }); return id; },
    caf: id => { e.quadros = e.quadros.filter(x => x.id !== id); }
  };
  /* anda até `ate`, rodando timers vencidos e um quadro a cada 16 ms */
  e.andar = ate => {
    while (e.t < ate) {
      e.t = Math.min(ate, e.t + 16);
      for (const x of e.fila.filter(x => x.quando <= e.t).sort((a, b) => a.quando - b.quando)) { e.fila = e.fila.filter(y => y !== x); x.fn(); }
      const q = e.quadros; e.quadros = [];
      for (const x of q) x.fn(e.t);
    }
  };
  return e;
}
const relogio = env => new Function(fonteRelogio + '\nreturn relogioDaDemo;')()(env);

test('o relógio da demo existe em js/peca-sites.js (ES5, sem dependência)', () => {
  assert.ok(fonteRelogio, 'function relogioDaDemo(env) { … /* fim do relógio da demo */ não achada');
  assert.doesNotMatch(fonteRelogio, /=>|\blet\b|\bconst\b|`/, 'js/ é ES5');
});

test('sem pausa, um passo agendado roda no tempo dele', () => {
  const e = ambiente(), r = relogio(e.env); let rodou = -1;
  r.depois(1000, () => { rodou = e.t; });
  e.andar(990); assert.equal(rodou, -1);
  e.andar(1100); assert.ok(rodou >= 1000 && rodou < 1020, String(rodou));
});

test('pausado, nenhum passo roda; ao seguir, roda depois do que FALTAVA (não reinicia, não pula)', () => {
  const e = ambiente(), r = relogio(e.env); let rodou = -1;
  r.depois(1000, () => { rodou = e.t; });
  e.andar(300); r.pausar(); assert.ok(r.pausado());
  e.andar(5300); assert.equal(rodou, -1, 'rodou com a demo pausada');
  r.seguir(); assert.ok(!r.pausado());
  e.andar(5300 + 690); assert.equal(rodou, -1, 'rodou antes do que faltava (700 ms)');
  e.andar(6100); assert.ok(rodou >= 6000 && rodou < 6020, String(rodou));
});

test('o deslize pausado não anda e volta exatamente de onde estava (o tempo da demo não conta a pausa)', () => {
  const e = ambiente(), r = relogio(e.env), t0 = r.agora(), progresso = [];
  (function passo(t) { const k = Math.min(1, (r.agora(t) - t0) / 600); progresso.push([e.t, k]); if (k < 1) r.quadro(passo); })();
  e.andar(304); const kPausa = progresso[progresso.length - 1][1];
  r.pausar(); const n = progresso.length;
  e.andar(3304); assert.equal(progresso.length, n, 'quadro rodou com a demo pausada');
  r.seguir(); e.andar(3304 + 16);
  const kVolta = progresso[progresso.length - 1][1];
  assert.ok(kVolta > kPausa && kVolta - kPausa < 0.06, 'pulou de ' + kPausa + ' para ' + kVolta);
  e.andar(10000); assert.equal(progresso[progresso.length - 1][1], 1);
  assert.equal(progresso.filter(p => p[1] === 1).length, 1, 'o fim do deslize rodou uma vez só');
});

test('limpar cancela passos e quadros, pausado ou não; pausar e seguir repetidos não somam', () => {
  const e = ambiente(), r = relogio(e.env); let n = 0;
  r.depois(100, () => n++); r.quadro(() => n++);
  r.pausar(); r.pausar(); r.limpar(); r.seguir(); r.seguir();
  e.andar(1000); assert.equal(n, 0);
  const t = r.agora(); e.andar(1500); assert.equal(r.agora() - t, 500, 'seguir duas vezes descontou a pausa duas vezes');
});

test('a peça usa o relógio: o deslize e os passos da demo pausam fora da tela e com a aba escondida', () => {
  const codigo = semComentarios(js);
  assert.match(codigo, /relogio\.quadro\(passo\)/, 'o deslize anda pelo relógio');
  assert.match(codigo, /relogio\.agora\(t\)/, 'o progresso do deslize vem do tempo da demo');
  assert.match(codigo, /function depois\(ms, fn\) \{ relogio\.depois\(ms, fn\); \}/);
  assert.match(codigo, /addEventListener\('visibilitychange'/);
  /* sair da tela pausa (antes, cortava a demo e pousava no fim) */
  const io = (codigo.match(/new IntersectionObserver\(function \(es\) \{[\s\S]*?\}, \{ threshold: 0\.6 \}\)/) || [''])[0];
  assert.ok(io, 'o observador do palco');
  assert.doesNotMatch(io, /cortarDemo\(\)/, 'sair da tela não corta mais a demo');
  assert.match(io, /pausaDaDemo\(\)/);
});

test('display:none antes do is-viva só sem JS (html:not(.js)): com JS nada some do fluxo e volta', () => {
  for (const r of regrasDormindo.filter(x => /display:\s*none/.test(x.corpo))) assert.match(r.sel, /html:not\(\.js\)/, r.sel);
  const semJs = regrasDormindo.filter(r => /html:not\(\.js\)/.test(r.sel) && /display:\s*none/.test(r.corpo));
  for (const c of CONTROLES) assert.ok(semJs.some(r => r.sel.includes(c)), c + ': sem JS os controles continuam fora (não fariam nada)');
});
