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

/* ---- a VAGA (.plr-vaga::before): a fórmula da altura reservada tem que casar com o que o radar montado ocupa (revisão independente, M-teste) ---- */
const tokens = lerRaiz('css/tokens.css');
const rem = (nome) => { const m = tokens.match(new RegExp('--' + nome + ':\\s*([\\d.]+)rem')); assert.ok(m, nome); return parseFloat(m[1]) * 16; };
const regra = (seletor) => {
  const m = semComentarios.match(new RegExp(seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  assert.ok(m, 'regra ' + seletor);
  return m[1];
};

test('a vaga: o ::before reserva EXATAMENTE a fórmula (largura da vaga -> altura do radar montado), peça por peça', () => {
  const fx = regra('.plr-vaga:not(:has(.plr))::before');
  const h = fx.match(/height:\s*calc\(([^;]*)\);/);
  assert.ok(h, 'height: calc(...)');
  assert.equal(h[1].replace(/\s+/g, ' ').trim(),
    '34px + 1.3 * var(--fs-rotulo) + 12px + 15px + 5 * var(--plr-linha) + 12px + 2 * 1.4 * var(--fs-ctrl) + clamp(240px, 77cqw - 26.18px, 320px)');
  /* cada número da fórmula vem de uma regra do .plr montado */
  const plr = regra('.plr');
  assert.match(plr, /padding:\s*16px/);
  assert.match(plr, /border:\s*1px solid/);                                         /* 34 = 2 x 16 + 2 x 1 */
  assert.match(regra('.plr-titulo'), /font:[^;]*\/1\.3\s/);                         /* 1,3 x 11 px */
  assert.match(regra('.plr-quadro'), /margin-top:\s*12px/);                         /* 12 */
  assert.match(regra('.plr-lista'), /margin:\s*14px 0 0/);
  assert.match(regra('.plr-lista'), /border-top:\s*1px/);                           /* 14 + 1 = 15 */
  assert.match(regra('.plr-legenda'), /margin:\s*12px 0 0/);
  assert.match(regra('.plr-legenda'), /min-height:\s*calc\(2 \* 1\.4em\)/);         /* 12 + 2 linhas */
  assert.match(regra('.plr, .plr-vaga'), /--plr-linha:\s*calc\(3 \* 1\.35 \* var\(--fs-ctrl\) \+ 15px\)/);
  assert.match(regra('.plr-linha'), /min-height:\s*var\(--plr-linha\)/);
  /* 77cqw - 26,18 px é 0,77 x (largura da vaga - 34): a largura que o JS mede no quadro */
  assert.equal(+(34 * 0.77).toFixed(2), 26.18);
});

test('a vaga: o que o CSS reserva (lido do próprio CSS) = o que o radar montado ocupa, de 250 a 420 px de largura, com folga de 0,5 px', () => {
  const fsRotulo = rem('fs-rotulo'), fsCtrl = rem('fs-ctrl');
  const linha = 3 * 1.35 * fsCtrl + 15;
  const formula = regra('.plr-vaga:not(:has(.plr))::before').match(/height:\s*calc\(([^;]*)\);/)[1].replace(/\s+/g, ' ').trim();
  const [fixo, grampo] = formula.split(' + clamp(');
  /* a parte fixa, avaliada com os tokens reais (rem = 16 px) */
  const resto = Function('return (' + fixo.replace(/var\(--fs-rotulo\)/g, String(fsRotulo)).replace(/var\(--fs-ctrl\)/g, String(fsCtrl)).replace(/var\(--plr-linha\)/g, String(linha)).replace(/px/g, '') + ')')();
  assert.ok(Math.abs(resto - 438.9) < 0.01, 'resto fixo ' + resto);
  const g = grampo.match(/^([\d.]+)px, ([\d.]+)cqw - ([\d.]+)px, ([\d.]+)px\)$/);
  assert.ok(g, 'clamp(min, N cqw - K px, max): ' + grampo);
  const [min, porCem, desconto, max] = [+g[1], +g[2], +g[3], +g[4]];
  for (let w = 250; w <= 420; w += 5) {
    const reservado = resto + Math.min(max, Math.max(min, porCem * w / 100 - desconto));   /* 1 cqw = 1% da largura w da vaga */
    const montado = resto + R.alturaRadar(w - 34);                                          /* o radar montado: o quadro tem w - 34 */
    assert.ok(Math.abs(reservado - montado) <= 0.5, w + ': reserva ' + reservado.toFixed(2) + ' x montado ' + montado.toFixed(2));
  }
});
