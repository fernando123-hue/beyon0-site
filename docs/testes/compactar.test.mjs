/* COMPACTAR na montagem (cloudflare/montar-publico.mjs, 10/11): o JS/CSS próprio sobe sem comentários e espaços,
   sem renomear nada; o repositório guarda os comentários; vendor/ fica intacto; erro de sintaxe para a montagem. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { montarPublico, compactar } from '../../cloudflare/montar-publico.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const versionados = () => execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);

function montarReal(fn) {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'publico-compacto-'));
  try { return fn(destino, montarPublico({ raiz: RAIZ, destino, arquivos: versionados() })); }
  finally { fs.rmSync(destino, { recursive: true, force: true }); }
}

test('compactar: JS/CSS próprios sobem sem comentários e menores; o repositório segue com os comentários', () => {
  montarReal((destino, copiados) => {
    const proprios = copiados.filter(a => /^(js\/.+\.js|css\/.+\.css|[a-z0-9-]+\.css)$/.test(a));
    assert.ok(proprios.length > 30, 'esperava os JS/CSS do site');
    let fonte = 0, montado = 0;
    for (const a of proprios) {
      const f = fs.readFileSync(path.join(RAIZ, a), 'utf8'), m = fs.readFileSync(path.join(destino, a), 'utf8');
      fonte += f.length; montado += m.length;
      assert.ok(m.length <= f.length, a + ': o montado não pode crescer');
      /* ponto fixo: compactar de novo não muda nada (comentário dentro de texto, como o GLSL dos shaders, é conteúdo e fica) */
      assert.equal(compactar(a, m), m, a + ': o publicado ainda tinha o que compactar');
    }
    assert.ok(montado < fonte * 0.75, 'a compactação deveria tirar pelo menos 25% (fonte ' + fonte + ', montado ' + montado + ')');
    assert.match(fs.readFileSync(path.join(RAIZ, 'js/giro.js'), 'utf8'), /O GIRO do h1 da home/, 'o comentário do repositório não pode sumir');
  });
});

test('compactar: vendor/, imagens e fontes sobem byte a byte', () => {
  montarReal((destino, copiados) => {
    const intactos = copiados.filter(a => /^vendor\/|^assets\//.test(a));
    assert.ok(intactos.length > 3);
    for (const a of intactos) assert.ok(fs.readFileSync(path.join(RAIZ, a)).equals(fs.readFileSync(path.join(destino, a))), a);
  });
});

test('compactar: não renomeia nada (os scripts clássicos dividem globais) e não baixa sintaxe', () => {
  const js = 'var BEYON_GLOBAL = 1;\nfunction compartilhada(longoNome) { /* explica */ return longoNome + BEYON_GLOBAL; }\nconst x = a?.b ?? c;';
  const saida = compactar('js/x.js', js);
  for (const nome of ['BEYON_GLOBAL', 'compartilhada', 'longoNome', '?.', '??']) assert.ok(saida.includes(nome), nome + ' sumiu: ' + saida);
  assert.ok(!saida.includes('explica'));
  const css = '.a { color: red; } /* nota */ @media (min-width: 981px) { .b:has(.c) { transform: translateX(1px); } }';
  const c = compactar('css/x.css', css);
  assert.ok(c.includes(':has(') && c.includes('981px') && !c.includes('nota'), c);
});

test('compactar: todo JS montado ainda é código válido (clássico ou módulo)', () => {
  montarReal((destino, copiados) => {
    for (const a of copiados.filter(a => /^js\/.+\.js$/.test(a))) {
      const codigo = fs.readFileSync(path.join(destino, a), 'utf8');
      const modulo = /^\s*(import|export)\b|\bimport\s*\(|^export |;export /m.test(codigo) && /\b(import|export)\b/.test(codigo);
      /* módulo: o V8 só o compila com --experimental-vm-modules; o esbuild (parser completo) relê o publicado */
      if (modulo) assert.doesNotThrow(() => compactar(a, codigo), a);
      else assert.doesNotThrow(() => new vm.Script(codigo, { filename: a }), a);
    }
  });
});

test('compactar: JS com erro de sintaxe para a montagem (nunca sobe quebrado nem cru calado)', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-quebrado-'));
  try {
    fs.mkdirSync(path.join(raiz, 'js'));
    fs.writeFileSync(path.join(raiz, 'js', 'a.js'), 'um(');
    fs.writeFileSync(path.join(raiz, 'index.html'), '<script src="js/a.js"></script>');
    assert.throws(() => montarPublico({ raiz, destino: path.join(raiz, 'publico'), arquivos: ['index.html', 'js/a.js'] }));
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});
