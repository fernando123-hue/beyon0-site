/* O /sites LEVE (2026-11-07): a planta do hero (css/peca-sites.css, js/peca-sites.js) não empurra a página quando acorda e a
   demonstração de larguras não roda fora de vista. Medido em docs/medir-sites-leve.mjs. Roda por docs/testes/heroes.test.mjs
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

test('display:none antes do is-viva só sem JS (html:not(.js)): com JS nada some do fluxo e volta', () => {
  for (const r of regrasDormindo.filter(x => /display:\s*none/.test(x.corpo))) assert.match(r.sel, /html:not\(\.js\)/, r.sel);
  const semJs = regrasDormindo.filter(r => /html:not\(\.js\)/.test(r.sel) && /display:\s*none/.test(r.corpo));
  for (const c of CONTROLES) assert.ok(semJs.some(r => r.sel.includes(c)), c + ': sem JS os controles continuam fora (não fariam nada)');
});
