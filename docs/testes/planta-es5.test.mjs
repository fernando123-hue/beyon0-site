/* ES5 SINTÁTICO nos módulos da planta (decisão desta frente, spec §0): os js/planta-*.js carregam em qualquer navegador, sem passo de build,
   iguais ao vizinho js/orcamento-painel.js. O teste tira comentários e textos e recusa a sintaxe e as APIs novas. Visto vermelho contra o
   protótipo (docs/lab-planta*.js do worktree site-planta, que usa const, =>, spread...): o último teste prova que a varredura o reprova
   e que ela enxerga cada construção.  node --test docs/testes/planta-es5.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = fileURLToPath(new URL('../../js/', import.meta.url));
/* os planta-*.js e a ligação com a página (orcamento-planta.js, PR 2c, e orcamento-radar.js, PR 2d: roda em toda visita ao orçamento, antes de a planta existir) */
const arquivos = fs.readdirSync(JS).filter((n) => /^planta-.+\.js$/.test(n) || n === 'orcamento-planta.js' || n === 'orcamento-radar.js').sort();

/* tira comentários e o conteúdo de strings e de expressões regulares (um passe só, sem regex gigante) */
export function limpar(src) {
  let out = '', i = 0, anterior = '';
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? n : f + 2; out += ' '; continue; }
    if (c === '/' && d === '/') { const f = src.indexOf('\n', i); i = f < 0 ? n : f; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { j += src[j] === '\\' ? 2 : 1; }
      out += c + c; i = j + 1; anterior = c; continue;
    }
    if (c === '`') { out += '`'; i++; continue; }   /* a crase em si é o defeito: fica para a varredura pegar */
    if (c === '/' && /[=(,:;!&|?{}[\n]/.test(anterior || '(')) {
      let j = i + 1, classe = false;
      while (j < n && (src[j] !== '/' || classe) && src[j] !== '\n') { if (src[j] === '\\') j++; else if (src[j] === '[') classe = true; else if (src[j] === ']') classe = false; j++; }
      if (src[j] === '/') { j++; while (/[a-z]/.test(src[j] || '')) j++; out += '/r/'; i = j; anterior = '/'; continue; }
    }
    out += c; if (!/\s/.test(c)) anterior = c; i++;
  }
  return out;
}

const PROIBIDOS = [
  ['seta (=>)', /=>/], ['const', /\bconst\b/], ['let', /\blet\b/], ['crase (template string)', /`/], ['class', /\bclass\b/], ['spread/rest (...)', /\.\.\./],
  ['Object.values', /Object\.values/], ['Object.entries', /Object\.entries/], ['Object.assign', /Object\.assign/], ['padStart/padEnd', /\bpad(Start|End)\b/],
  ['Array.from', /Array\.from/], ['.includes(', /\.includes\s*\(/], ['.find(', /\.find\s*\(/], ['.findIndex(', /\.findIndex\s*\(/], ['async', /\basync\b/], ['await', /\bawait\b/],
  ['Math.hypot', /Math\.hypot/], ['Math.sign', /Math\.sign\b/], ['Math.trunc', /Math\.trunc/], ['startsWith/endsWith', /\.(startsWith|endsWith)\s*\(/], ['Number.isFinite', /Number\.isFinite/],
  ['new Map/Set', /new\s+(Map|Set|WeakMap|Symbol)\b/], ['Promise', /\bPromise\b/], ['??', /\?\?/], ['?.', /\?\./], ['**', /\*\*/], ['import/export', /^\s*(import|export)\b/m]
];

export function violacoes(src) {
  const limpo = limpar(src);
  return PROIBIDOS.filter(([, re]) => re.test(limpo)).map(([nome]) => nome);
}

test('há módulos js/planta-*.js para varrer (pecas, layout, desenho)', () => {
  assert.equal(arquivos.filter((n) => ['planta-pecas.js', 'planta-layout.js', 'planta-desenho.js'].includes(n)).length, 3);
});

for (const nome of arquivos) {
  test(nome + ' é ES5 sintático (sem =>, const, let, crase, class, spread, Object.values/entries/assign, padStart, Array.from, includes, find, async)', () => {
    const v = violacoes(fs.readFileSync(path.join(JS, nome), 'utf8'));
    assert.deepEqual(v, [], nome + ' usa: ' + v.join(', '));
  });
}

test('sanidade da varredura: ela enxerga cada construção proibida (e ignora comentário, texto e expressão regular)', () => {
  const casos = {
    'seta (=>)': 'var f = (a) => a;', const: 'const a = 1;', let: 'let a = 1;', 'crase (template string)': 'var a = `x`;', class: 'class A {}', 'spread/rest (...)': 'f(...a);',
    'Object.values': 'Object.values(o);', 'Object.entries': 'Object.entries(o);', 'Object.assign': 'Object.assign({}, o);', 'padStart/padEnd': 'x.padStart(2);', 'Array.from': 'Array.from(a);',
    '.includes(': 'a.includes(1);', '.find(': 'a.find(f);', '.findIndex(': 'a.findIndex(f);', async: 'async function f() {}', await: 'await x;', 'Math.hypot': 'Math.hypot(1, 2);'
  };
  for (const [nome, codigo] of Object.entries(casos)) assert.ok(violacoes(codigo).includes(nome), 'não viu: ' + nome);
  assert.deepEqual(violacoes('/* const a = () => 1; */ // let b\nvar t = "const x => y ...";\nvar r = /[x]=>/;'), []);
});

const PROTO = path.join(JS, '..', '..', 'site-planta', 'docs');
test('visto vermelho: o protótipo (docs/lab-planta*.js, worktree site-planta) NÃO passaria nesta varredura', { skip: !fs.existsSync(path.join(PROTO, 'lab-planta.js')) }, () => {
  for (const nome of ['lab-planta.js', 'lab-planta-layout.js']) assert.ok(violacoes(fs.readFileSync(path.join(PROTO, nome), 'utf8')).length > 0, nome);
});
