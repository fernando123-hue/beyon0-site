/* O CSS DO RADAR e o laboratório (PR 2d-front). Regras que o dono e o CLAUDE.md fixam: sem blur/brilho/sombra, prefixo plr-, nenhuma variável
   mudando por quadro, nada de style="" nem <style> (CSP), altura reservada por CSS igual à de alturaRadar(largura), movimento reduzido,
   tudo visível sem JS.  node --test docs/testes/planta-radar-css.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import R from '../../js/planta-radar.js';

const lerRaiz = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const css = lerRaiz('css/orcamento-radar.css');
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const lab = lerRaiz('docs/lab-radar.html');
const labJs = lerRaiz('docs/testes/planta-radar-lab.js');
const labCss = lerRaiz('docs/testes/planta-radar-lab.css');

test('sem blur, sem brilho suave, sem sombra, sem filtro e sem gradiente em nada do radar (regra do dono)', () => {
  for (const [nome, texto] of [['css/orcamento-radar.css', semComentarios], ['lab css', labCss.replace(/\/\*[\s\S]*?\*\//g, '')]]) {
    for (const re of [/blur\(/, /\bfilter\s*:/, /backdrop-filter/, /box-shadow/, /text-shadow/, /drop-shadow/, /gradient\(/, /mix-blend/, /mask(-image)?\s*:/]) assert.doesNotMatch(texto, re, nome + ' tem ' + re);
  }
  const sem = (labJs + fs.readFileSync(new URL('../../js/planta-radar.js', import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(sem, /blur|feGaussian|shadowBlur|drop-shadow/);
});

test('toda classe do CSS do radar tem o prefixo plr-; sem id e sem !important', () => {
  const classes = [...semComentarios.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c));
  assert.ok(classes.length > 10);
  for (const c of new Set(classes)) assert.match(c, /^plr(-|$)/, '.' + c);
  assert.doesNotMatch(semComentarios, /#[A-Za-z_][\w-]*\s*[{,]/);
  assert.doesNotMatch(semComentarios, /!important/);
});

test('só tokens do site: cores por var(--…), nenhuma cor escrita à mão fora das que o CSS declara como token local', () => {
  assert.doesNotMatch(semComentarios, /#[0-9a-fA-F]{3,8}\b/, 'cor hexadecimal solta');
  assert.match(semComentarios, /var\(--ac\)/);
  assert.match(semComentarios, /var\(--stroke\)|var\(--line-2\)/);
});

test('nenhuma variável de CSS é movida por quadro: sem @keyframes com var() e sem transition em custom property', () => {
  for (const kf of semComentarios.matchAll(/@keyframes[^{]+\{([\s\S]*?\}\s*)\}/g)) assert.doesNotMatch(kf[1], /var\(/);
  assert.doesNotMatch(semComentarios, /transition[^;]*--/);
});

test('a altura é reservada por CSS e é a mesma de alturaRadar(largura): razão, mínimo e máximo', () => {
  const alt = { min: R.alturaRadar(1), max: R.alturaRadar(100000), razao: R.RAZAO_ALTURA };
  assert.equal(alt.min, 240); assert.equal(alt.max, 320); assert.equal(alt.razao, 0.77);
  assert.match(semComentarios, /aspect-ratio:\s*100\s*\/\s*77\b/);
  assert.match(semComentarios, /min-height:\s*240px/);
  assert.match(semComentarios, /max-height:\s*320px/);
  /* o que o CSS dá numa caixa de largura l (aspect-ratio com min/max) = alturaRadar(l), para qualquer largura */
  for (let l = 250; l <= 700; l += 9) assert.equal(Math.min(320, Math.max(240, Math.round(l * 77 / 100))), R.alturaRadar(l), String(l));
});

test('a lista e a legenda também têm altura reservada (nada nasce com altura 0 nem muda de altura quando a leitura chega)', () => {
  assert.match(semComentarios, /\.plr-linha\s*\{[^}]*min-height:/);
  assert.match(semComentarios, /\.plr-legenda\s*\{[^}]*min-height:/);
  assert.doesNotMatch(semComentarios, /height:\s*0\b/);
  assert.doesNotMatch(semComentarios, /display:\s*none/, 'o radar não esconde nada que o leitor de tela precise');
});

test('movimento reduzido: o CSS não tem animação nem transição (o único movimento é o do JS, que salta com BEYON.reduced); tudo aparece parado e inteiro', () => {
  assert.doesNotMatch(semComentarios, /animation|@keyframes|transition|will-change/);
});

test('o polígono é traço de 1,5 px com preenchimento chapado de 10% (cor lisa), e os rótulos têm ao menos 11 px', () => {
  assert.match(semComentarios, /\.plr-leitura\s*\{[^}]*stroke-width:\s*1\.5/);
  assert.match(semComentarios, /\.plr-leitura\s*\{[^}]*fill:\s*rgb\(var\(--ac-rgb\)\s*\/\s*\.1\)/);
  const rot = semComentarios.match(/\.plr-rot\s*\{[^}]*\}/)[0];
  assert.match(rot, /font(-size)?:[^;]*(var\(--fs-rotulo\)|\b1[1-9]px|0?\.6875rem|\.75rem)/);
});

test('o laboratório: sem style="" nem <style> (CSP), sem script embutido, a lista (dl) existe no HTML para quem não tem JS, mobile primeiro', () => {
  assert.doesNotMatch(lab, /\sstyle\s*=/i);
  assert.doesNotMatch(lab, /<style[\s>]/i);
  assert.doesNotMatch(lab, /<script(?![^>]*\ssrc=)[^>]*>/i, 'script sem src (inline)');
  assert.doesNotMatch(lab, /\son\w+\s*=/i, 'atributo de evento');
  assert.match(lab, /<meta name="viewport"/);
  assert.match(lab, /<noscript>[\s\S]*<dl[\s\S]*<\/dl>[\s\S]*<\/noscript>/, 'a lista aparece sem JS');
  assert.match(lab, /href="\/css\/orcamento-radar\.css"/);
  assert.match(lab, /src="\/js\/planta-radar\.js"/);
  assert.match(lab, /src="\/js\/orcamento-planta-forma\.js"/);
  assert.match(lab, /src="\/js\/core\.js"/);
  assert.match(lab, /<meta name="robots" content="noindex"/);
  assert.doesNotMatch(labJs, /innerHTML|insertAdjacentHTML|outerHTML|requestAnimationFrame/);
  assert.doesNotMatch(labCss, /!important/);
});
