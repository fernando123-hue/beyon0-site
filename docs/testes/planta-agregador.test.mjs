/* O AGREGADOR DOS TESTES DA PLANTA (Passo 1; plano, "Por que nível 3 e por que sem package.json"). O `testar` do package.json é uma lista
   explícita de arquivos e mexer nele pede o "sim" do dono; por isso zero.test.mjs (que já está na lista) importa planta-todos.test.mjs
   no fim, e este importa todo planta-*.test.mjs da pasta. Estes testes provam o agregador como CAIXA PRETA: copiam o arquivo para uma
   pasta de mentira, com testes de mentira, e rodam o `node --test` de verdade.  node --test docs/testes/planta-agregador.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PASTA = fileURLToPath(new URL('./', import.meta.url));
const AGREGADOR = path.join(PASTA, 'planta-todos.test.mjs');
const PASSA = "import { test } from 'node:test';\ntest('TESTE-DE-MENTIRA-QUE-PASSA', () => {});\n";
const FALHA = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('TESTE-DE-MENTIRA-QUE-FALHA', () => { assert.equal(1, 2); });\n";
const EXPLODE = "throw new Error('ARQUIVO-DE-CASOS-NAO-PODIA-SER-IMPORTADO');\n";

/* monta a pasta de mentira, roda o agregador dela e devolve { codigo, saida } */
function rodar(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planta-agregador-'));
  try {
    fs.copyFileSync(AGREGADOR, path.join(dir, 'planta-todos.test.mjs'));
    for (const [nome, conteudo] of Object.entries(arquivos)) fs.writeFileSync(path.join(dir, nome), conteudo);
    /* sem NODE_TEST_CONTEXT: dentro de um teste o Node o define, e o `--test` filho se recusaria a rodar ("called recursively") */
    const env = Object.assign({}, process.env);
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ['--test', path.join(dir, 'planta-todos.test.mjs')], { encoding: 'utf8', timeout: 60000, env });
    return { codigo: r.status, saida: (r.stdout || '') + (r.stderr || '') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('roda os testes planta-*.test.mjs da pasta (e só uma vez cada um, sem se importar de novo)', () => {
  const r = rodar({ 'planta-a.test.mjs': PASSA });
  assert.equal(r.codigo, 0, r.saida);
  assert.equal(r.saida.split('TESTE-DE-MENTIRA-QUE-PASSA').length - 1, 1, 'o teste de mentira aparece uma vez');
  assert.equal(r.saida.split('acha ao menos um teste da planta').length - 1, 1, 'o agregador não se importa: o teste dele roda uma vez');
});

test('VERMELHO: um planta-x.test.mjs que falha derruba o agregador', () => {
  const r = rodar({ 'planta-a.test.mjs': PASSA, 'planta-x.test.mjs': FALHA });
  assert.notEqual(r.codigo, 0, r.saida);
  assert.match(r.saida, /TESTE-DE-MENTIRA-QUE-FALHA/);
});

test('ignora o que não é teste da planta: *-casos.mjs, outros prefixos e planta-*.mjs sem ".test"', () => {
  const r = rodar({ 'planta-a.test.mjs': PASSA, 'planta-textos-casos.mjs': EXPLODE, 'planta-casos.mjs': EXPLODE, 'outro.test.mjs': EXPLODE, 'planta.test.mjs': EXPLODE, 'planta-leiame.md': 'x' });
  assert.equal(r.codigo, 0, r.saida);
  assert.ok(!/ARQUIVO-DE-CASOS-NAO-PODIA/.test(r.saida));
});

test('falha se não achar nenhum teste da planta (pasta vazia não pode passar em silêncio)', () => {
  const r = rodar({ 'outro.test.mjs': PASSA });
  assert.notEqual(r.codigo, 0, r.saida);
});

test('na pasta de verdade, o agregador enxerga os testes da planta que já existem', () => {
  const nomes = fs.readdirSync(PASTA).filter((n) => /^planta-.+\.test\.mjs$/.test(n) && n !== 'planta-todos.test.mjs');
  for (const esperado of ['planta-fixtures.test.mjs', 'planta-forma.test.mjs', 'planta-agregador.test.mjs']) assert.ok(nomes.includes(esperado), esperado);
});

test('zero.test.mjs (que está na lista do `testar`) importa o agregador; o package.json não é tocado', () => {
  const zero = fs.readFileSync(path.join(PASTA, 'zero.test.mjs'), 'utf8').trimEnd().split('\n');
  assert.equal(zero[zero.length - 1], "import './planta-todos.test.mjs';");
  const pkg = JSON.parse(fs.readFileSync(path.join(PASTA, '..', '..', 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.testar.includes('docs/testes/zero.test.mjs'));
  assert.ok(!/planta-/.test(pkg.scripts.testar), 'nenhum arquivo da planta na lista: entram pelo agregador');
});
