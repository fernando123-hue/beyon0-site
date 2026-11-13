/* O CSS DA PLANTA VIVA (css/orcamento-planta.css; spec §1.3, §4.4, regras do CLAUDE.md): sem desfoque NUNCA (nem sombra com desfoque, filtro,
   gradiente radial ou backdrop-filter), todas as classes com o prefixo plv- (pv- é das miniaturas, pl- e .planta* são da vitrine de Sites),
   nenhum @keyframes mexe em outra coisa que não transform e opacity (movimento contínuo no compositor), nenhuma variável de CSS muda por quadro,
   a geometria do desenho não usa ch nem em, e a legenda tem altura fixa (nada cresce depois que a faixa aparece).
   node --test docs/testes/planta-css.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../css/orcamento-planta.css', import.meta.url), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

export const PROIBIDOS = [
  ['blur', /blur\s*\(/i], ['drop-shadow', /drop-shadow/i], ['filter', /(^|[^-\w])filter\s*:/i], ['backdrop-filter', /backdrop-filter/i], ['box-shadow', /box-shadow/i],
  ['text-shadow', /text-shadow/i], ['radial-gradient', /radial-gradient/i], ['linear-gradient', /linear-gradient|conic-gradient|repeating-/i], ['mask', /(^|[^-\w])(-webkit-)?mask(-image)?\s*:/i],
  ['mix-blend-mode', /mix-blend-mode/i], ['will-change', /will-change/i]
];
export const achados = (src) => PROIBIDOS.filter(([, re]) => re.test(semComentarios(src))).map(([n]) => n);

test('sem desfoque nem brilho: nenhum blur, drop-shadow, filter, backdrop-filter, box-shadow, text-shadow, gradiente, máscara nem blend', () => {
  assert.deepEqual(achados(css), []);
});

test('sanidade da varredura: ela enxerga cada um dos defeitos (e ignora comentário)', () => {
  const casos = { blur: '.a{filter:blur(4px)}', 'drop-shadow': '.a{filter:drop-shadow(0 0 4px red)}', 'backdrop-filter': '.a{backdrop-filter:blur(2px)}', 'box-shadow': '.a{box-shadow:0 0 8px #000}',
    'radial-gradient': '.a{background:radial-gradient(#000,#fff)}', 'text-shadow': '.a{text-shadow:0 0 4px red}', filter: '.a{filter:brightness(2)}' };
  for (const [nome, c] of Object.entries(casos)) assert.ok(achados(c).includes(nome), 'não viu ' + nome);
  assert.deepEqual(achados('/* blur(4px) box-shadow radial-gradient */ .a{color:red}'), []);
});

test('toda classe do arquivo tem o prefixo plv- (ou é um estado is-*, plv-- ou html.menos-movimento)', () => {
  const limpo = semComentarios(css).replace(/"[^"]*"/g, '""');
  const classes = new Set((limpo.match(/\.[A-Za-z_][\w-]*/g) || []).map((c) => c.slice(1)).filter((c) => !/^\d/.test(c)));
  const fora = [...classes].filter((c) => !/^plv-/.test(c) && !/^is-/.test(c) && c !== 'menos-movimento' && c !== 'plv');
  assert.deepEqual(fora, [], 'classes sem prefixo: ' + fora.join(', '));
});

test('@keyframes só mexem em transform e opacity (movimento contínuo no compositor, regra 1)', () => {
  const blocos = semComentarios(css).match(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})+[^{}]*\}/g) || [];
  assert.ok(blocos.length >= 2, 'há keyframes (gira e pulso)');
  for (const b of blocos) {
    const props = [...b.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const p of props) assert.ok(['transform', 'opacity'].includes(p), '@keyframes com ' + p + ' em ' + b.slice(0, 40));
  }
});

test('nenhuma variável de CSS é escrita por script no desenho (regra 1): o CSS só LÊ variáveis; o JS não usa setProperty', () => {
  const js = fs.readFileSync(new URL('../../js/planta-desenho.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/setProperty|style\.cssText|style\[\s*['"]--/.test(js), 'o desenho não grava variável de CSS');
});

test('M18: nenhuma unidade ch em lugar nenhum do CSS (a troca de fonte mudava 58ch; em geometria só px)', () => {
  assert.ok(!/\d\s*ch\b/.test(semComentarios(css)), 'ch no CSS');
  for (const b of ['.a{max-width:58ch}', '.a{min-width: 10ch}', '.a{width:2ch}']) assert.ok(/\d\s*ch\b/.test(b));
});

test('M17: o ouro (--ouro-rgb) só aparece em regras do LED (plv-led, plv-ponta--led); o resto da planta é ciano', () => {
  const regras = semComentarios(css).split('}').filter((r) => r.includes('--ouro-rgb'));
  assert.ok(regras.length >= 4, 'há regras de ouro');
  for (const r of regras) assert.ok(/plv-led|plv-ponta--led/.test(r.split('{')[0]), 'ouro fora do LED: ' + r.split('{')[0].trim());
});

test('I2/I3: a nota e a cota têm altura fixa (a nota do modelo e a do plano padrão têm tamanhos diferentes; trocar uma pela outra não pode mover o quadro). A nota em linhas de texto (em), a cota em px', () => {
  const limpo = semComentarios(css);
  assert.match(limpo, /\.plv-nota\s*\{[^}]*\bmin-height:\s*[\d.]+em/, 'nota com altura mínima em linhas de texto (cresce com o zoom de texto, em vez de cortar)');
  assert.doesNotMatch(limpo.match(/\.plv-nota\s*\{[^}]*\}/)[0], /overflow:\s*hidden|[^-]height:/, 'a nota não corta nem tem altura fixa');
  const medias = limpo.match(/@media[^{]+\{[^@]*?\.plv-nota\s*\{[^}]*\bmin-height:\s*[\d.]+em/g) || [];
  assert.ok(medias.length >= 2, 'a altura da nota muda só por largura de janela (media queries), nunca pelo texto: ' + medias.length);
  assert.match(limpo, /\.plv-cota\s*\{[^}]*\bheight:\s*\d+px[^}]*overflow:\s*hidden/, 'cota com height fixo (o nome do negócio muda)');
  assert.match(limpo, /\.plv-cota span\s*\{[^}]*white-space:\s*nowrap/, 'o nome na cota não quebra linha');
});

test('I1: o título do rótulo de uma ponta (núcleo, LED), quando ao lado, é limitado a 3 linhas e a caixa do rótulo tem altura própria', () => {
  const limpo = semComentarios(css);
  assert.match(limpo, /\.plv-ponta:not\(\.plv-ponta--topo\) \.plv-tit\s*\{[^}]*line-clamp:\s*3/);
  assert.match(limpo, /\.plv-rot\s*\{[^}]*overflow-wrap:\s*anywhere/, 'um rótulo com palavra comprida quebra em vez de ser cortado');
  assert.match(limpo, /\.plv-ponta\s*\{[^}]*overflow:\s*hidden/);
});

test('geometria em px: o CSS não define left, top, width, height, inset nem min-height do quadro em ch, em ou rem (só as caixas de TEXTO corrido, que medem linhas)', () => {
  const TEXTO_EM_LINHAS = /^\s*\.plv-(nota|leitura|leitura__txt)\s*$/;   /* a altura delas é um número de linhas de texto: em do próprio corpo, que cresce com o zoom de texto sem depender da largura do glifo (o que o ch fazia) */
  const regras = semComentarios(css).split('}');
  for (const r of regras) for (const m of r.matchAll(/(^|[{;\s])(left|top|right|bottom|(?:max-|min-)?width|(?:max-|min-)?height|inset)\s*:\s*([^;]+)/g)) {
    const partes = r.split('{'), seletor = partes[partes.length - 2] || '';   /* o seletor da própria regra (dentro de @media, o que vem depois do último { de fora) */
    if (TEXTO_EM_LINHAS.test(seletor) && /height/.test(m[2]) && /^\s*[\d.]+em\s*$/.test(m[3])) continue;
    assert.ok(!/\d(ch|em|rem|vw|vh)\b/.test(m[3]), 'unidade relativa em geometria: ' + m[2] + ': ' + m[3] + ' em ' + seletor);
  }
});

test('texto grande (zoom de 200%): a altura da nota e da legenda é em linhas (em) e equivale aos px de antes com corpo de 14 px e 16 px: nada muda a 100% e nada corta a 200%', () => {
  const limpo = semComentarios(css);
  const h = (re) => { const m = limpo.match(re); assert.ok(m, String(re)); return m[1]; };
  assert.equal(h(/\.plv-nota\s*\{[^}]*\bheight:\s*([\d.]+em)/), '6em');
  assert.equal(h(/@media \(min-width: 480px\)\s*\{\s*\.plv-nota\s*\{[^}]*min-height:\s*([\d.]+em)/), '4.5em');
  assert.equal(h(/@media \(min-width: 760px\)\s*\{[^@]*?\.plv-nota\s*\{[^}]*height:\s*([\d.]+em)/), '3em');
  assert.equal(h(/\.plv-leitura\s*\{[^}]*\bheight:\s*([\d.]+em)/), '9em');
  assert.equal(h(/\.plv-leitura__txt\s*\{[^}]*max-height:\s*([\d.]+em)/), '6em');
  assert.equal(h(/@media \(min-width: 760px\)\s*\{[^@]*?\.plv-leitura\s*\{[^}]*height:\s*([\d.]+em)/), '5.75em');
  assert.equal(h(/@media \(min-width: 760px\)\s*\{[^@]*?\.plv-leitura__txt\s*\{[^}]*max-height:\s*([\d.]+em)/), '3em');
});

test('o quadro e a legenda têm altura que não cresce: a legenda tem height fixo (em linhas, celular e computador) e overflow escondido', () => {
  const limpo = semComentarios(css);
  assert.match(limpo, /\.plv-leitura\s*\{[^}]*\bheight:\s*[\d.]+em[^}]*overflow:\s*hidden/);
  assert.match(limpo, /@media \(min-width: 760px\)\s*\{[^@]*\.plv-leitura\s*\{[^}]*height:\s*[\d.]+em/);
  assert.match(limpo, /\.plv-quadro\s*\{[^}]*overflow:\s*hidden/);
});

test('sem JS e com movimento reduzido: as regras de entrada (plv--pre) só existem sob a classe que o JS põe; o quadro padrão é o final', () => {
  const limpo = semComentarios(css);
  /* todo seletor que esconde (opacity 0) um nó fica atrás de .plv--pre, .plv--aj ou é um elemento que o JS cria já com opacity 0 (onda, cab, pulso, seta) */
  const regras = limpo.split('}').map((r) => r.trim()).filter((r) => /opacity:\s*0\b/.test(r) && r.includes('{'));
  for (const r of regras) {
    const sel = r.split('{')[0];
    assert.ok(/plv--pre|plv--aj|plv-onda|plv-cab|plv-pulso|plv-seta|plv-gira|@keyframes|^\s*\d|^from|^to/.test(sel + r) || /keyframes/.test(r), 'esconde sem a classe de entrada: ' + sel.trim());
  }
  assert.match(limpo, /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*animation:\s*none\s*!important/);
  assert.match(limpo, /html\.menos-movimento/);
});

test('(b) abaixo de 360 px o título das caixas é de 12 px (13 px quebra em 3 linhas e corta); o satélite do retrato pode ter 3 linhas', () => {
  const limpo = semComentarios(css);
  assert.match(limpo, /@media \(max-width: 359px\)\s*\{\s*\.plv-tit\s*\{\s*font-size:\s*12px/);
  assert.match(limpo, /\.plv-est\.plv-lin3 \.plv-tit\s*\{[^}]*line-clamp:\s*3/);
});

test('o CSS do esboço da planta v2 (css/planta-esboco.css) segue as mesmas regras: sem desfoque nem brilho, e os @keyframes só mexem em transform e opacity', () => {
  const esboco = fs.readFileSync(new URL('../../css/planta-esboco.css', import.meta.url), 'utf8');
  assert.deepEqual(achados(esboco), []);
  const quadros = [...semComentarios(esboco).matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map((m) => m[1]);
  assert.ok(quadros.length > 0, 'achou os @keyframes');
  for (const q of quadros) for (const [, prop] of q.matchAll(/([a-z-]+)\s*:/g)) assert.ok(['transform', 'opacity'].includes(prop), 'propriedade animada: ' + prop);
});
