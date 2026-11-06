/* guardar-chave.mjs e com-chave.mjs: o segredo vai para fora do repositório, nada é impresso e o comando recebe o valor.
   Tudo roda com uma "pasta pessoal" temporária: nunca toca nos segredos reais. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COM_CHAVE = path.join(RAIZ, 'scripts', 'com-chave.mjs');
const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'beyon-casa-'));
const envFalso = (extra = {}) => {
  const e = { ...process.env, HOME: casa, USERPROFILE: casa, ...extra };
  delete e.TESTE_SEGREDO_X;
  return { ...e, ...extra };
};

/* importa o módulo com a pasta pessoal falsa, num processo à parte (os.homedir lê o ambiente na carga) */
function noProcesso(codigo) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { env: envFalso(), encoding: 'utf8', cwd: RAIZ });
  return { saida: r.stdout, erro: r.stderr, status: r.status };
}

test('gravarSegredo: grava em ~/.beyon-segredos/<NOME>, fora do repositório, e devolve só o caminho', () => {
  const r = noProcesso(`
    import { gravarSegredo, PASTA_SEGREDOS } from './scripts/guardar-chave.mjs';
    const alvo = gravarSegredo('TESTE_SEGREDO_X', '  valor-de-teste-123  ');
    console.log(JSON.stringify({ alvo, pasta: PASTA_SEGREDOS }));
  `);
  assert.equal(r.status, 0, r.erro);
  const { alvo, pasta } = JSON.parse(r.saida);
  assert.ok(alvo.startsWith(casa), 'tem de cair na pasta pessoal');
  assert.ok(!alvo.startsWith(RAIZ), 'nunca dentro do repositório');
  assert.equal(path.basename(pasta), '.beyon-segredos');
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'valor-de-teste-123', 'sem espaços nas pontas');
  assert.ok(!r.saida.includes('valor-de-teste-123'), 'o valor não é impresso');
});

test('gravarSegredo: recusa nome fora do padrão, valor curto e valor com espaço no meio', () => {
  const r = noProcesso(`
    import { gravarSegredo } from './scripts/guardar-chave.mjs';
    const tenta = (n, v) => { try { gravarSegredo(n, v); return 'gravou'; } catch (e) { return 'recusou'; } };
    console.log(JSON.stringify([tenta('../fora', 'valor-valido-123'), tenta('minusculo', 'valor-valido-123'), tenta('TESTE_SEGREDO_X', 'curto'), tenta('TESTE_SEGREDO_X', 'tem espaco no meio')]));
  `);
  assert.equal(r.status, 0, r.erro);
  assert.deepEqual(JSON.parse(r.saida), ['recusou', 'recusou', 'recusou', 'recusou']);
});

test('com-chave: o comando recebe o segredo no ambiente, e o programa em si não imprime o valor', () => {
  const g = noProcesso(`import { gravarSegredo } from './scripts/guardar-chave.mjs'; gravarSegredo('TESTE_SEGREDO_X', 'segredo-que-nao-pode-vazar-9');`);
  assert.equal(g.status, 0, g.erro);
  const r = spawnSync(process.execPath, [COM_CHAVE, process.execPath, '-e', 'process.stdout.write(String((process.env.TESTE_SEGREDO_X || "").length))'], { env: envFalso(), encoding: 'utf8', cwd: RAIZ });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, String('segredo-que-nao-pode-vazar-9'.length), 'o filho viu o valor (só o tamanho foi impresso por ele)');
  assert.ok(!r.stdout.includes('segredo-que-nao-pode-vazar-9') && !r.stderr.includes('segredo-que-nao-pode-vazar-9'));
});

test('com-chave: segredo já definido no ambiente vence o do arquivo, e --so limita o que entra', () => {
  const venceAmbiente = spawnSync(process.execPath, [COM_CHAVE, process.execPath, '-e', 'process.stdout.write(process.env.TESTE_SEGREDO_X || "")'], { env: envFalso({ TESTE_SEGREDO_X: 'do-ambiente' }), encoding: 'utf8', cwd: RAIZ });
  assert.equal(venceAmbiente.stdout, 'do-ambiente');
  const soOutro = spawnSync(process.execPath, [COM_CHAVE, '--so', 'OUTRO_SEGREDO', process.execPath, '-e', 'process.stdout.write(process.env.TESTE_SEGREDO_X || "vazio")'], { env: envFalso(), encoding: 'utf8', cwd: RAIZ });
  assert.equal(soOutro.stdout, 'vazio', '--so deixa de fora o que não foi pedido');
});

test('com-chave: sem comando, sai com erro de uso; a pasta de segredos não existe no repositório nem entra no git', () => {
  const r = spawnSync(process.execPath, [COM_CHAVE], { env: envFalso(), encoding: 'utf8', cwd: RAIZ });
  assert.equal(r.status, 2);
  assert.ok(!fs.existsSync(path.join(RAIZ, '.beyon-segredos')));
});

test.after(() => { fs.rmSync(casa, { recursive: true, force: true }); });
