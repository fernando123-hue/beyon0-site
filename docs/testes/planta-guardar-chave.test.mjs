/* guardar-chave.mjs e com-chave.mjs: o segredo vai para fora do repositório, nada é impresso e o comando recebe o valor.
   Cada teste usa a SUA "pasta pessoal" temporária (nunca toca nos segredos reais, e nenhum teste depende do que outro gravou). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COM_CHAVE = path.join(RAIZ, 'scripts', 'com-chave.mjs');
const GUARDAR = path.join(RAIZ, 'scripts', 'guardar-chave.mjs');
const casas = [];
const novaCasa = () => { const c = fs.mkdtempSync(path.join(os.tmpdir(), 'beyon-casa-')); casas.push(c); return c; };
const envDe = (casa, extra = {}) => {
  const e = { ...process.env, HOME: casa, USERPROFILE: casa };
  for (const k of Object.keys(e)) if (/^TESTE_SEGREDO_/.test(k) || k === 'OUTRO_SEGREDO') delete e[k];
  return { ...e, ...extra };
};
const lerStr = (b) => String(b == null ? '' : b);

/* importa o módulo com a pasta pessoal falsa, num processo à parte (os.homedir lê o ambiente na carga) */
function noProcesso(casa, codigo) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { env: envDe(casa), encoding: 'utf8', cwd: RAIZ });
  return { saida: r.stdout, erro: r.stderr, status: r.status };
}
/* guarda um segredo na casa falsa */
function guardar(casa, nome, valor) {
  const r = noProcesso(casa, `import { gravarSegredo } from './scripts/guardar-chave.mjs'; gravarSegredo(${JSON.stringify(nome)}, ${JSON.stringify(valor)});`);
  assert.equal(r.status, 0, r.erro);
}
const comChave = (casa, args, extraEnv = {}) => spawnSync(process.execPath, [COM_CHAVE, ...args], { env: envDe(casa, extraEnv), encoding: 'utf8', cwd: RAIZ });
const eco = (nome) => ['-e', `process.stdout.write(process.env.${nome} ? 'viu' : 'vazio')`];
const SEGREDO = 'segredo-que-nao-pode-vazar-9';

test('gravarSegredo: grava em ~/.beyon-segredos/<NOME>, fora do repositório, e devolve só o caminho', () => {
  const casa = novaCasa();
  const r = noProcesso(casa, `
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
  assert.deepEqual(fs.readdirSync(pasta), ['TESTE_SEGREDO_X'], 'nenhum temporário fica para trás');
});

test('gravarSegredo: recusa nome fora do padrão, valor curto, com espaço no meio ou com byte de controle', () => {
  const casa = novaCasa();
  const r = noProcesso(casa, `
    import { gravarSegredo } from './scripts/guardar-chave.mjs';
    const tenta = (n, v) => { try { gravarSegredo(n, v); return 'gravou'; } catch (e) { return 'recusou'; } };
    console.log(JSON.stringify([tenta('../fora', 'valor-valido-123'), tenta('minusculo', 'valor-valido-123'), tenta('TESTE_SEGREDO_X', 'curto'), tenta('TESTE_SEGREDO_X', 'tem espaco no meio'),
      tenta('TESTE_SEGREDO_X', 'valor-com-\\u001b[A-seta'), tenta('TESTE_SEGREDO_X', 'valor-com-\\u0000-nulo-123'), tenta('TESTE_SEGREDO_X', 'valor-com-\\u007f-del-123')]));
  `);
  assert.equal(r.status, 0, r.erro);
  assert.deepEqual(JSON.parse(r.saida), Array(7).fill('recusou'));
});

test('valor recusado não grava nada, e não apaga o que já estava guardado', () => {
  const casa = novaCasa();
  guardar(casa, 'TESTE_SEGREDO_X', 'valor-antigo-bom-123');
  const alvo = path.join(casa, '.beyon-segredos', 'TESTE_SEGREDO_X');
  const r = noProcesso(casa, `import { gravarSegredo } from './scripts/guardar-chave.mjs'; try { gravarSegredo('TESTE_SEGREDO_X', 'curto'); } catch (e) { console.log('recusou'); }
    try { gravarSegredo('TESTE_SEGREDO_Y', 'valor com espaço no meio'); } catch (e) { console.log('recusou'); }`);
  assert.equal(r.status, 0, r.erro);
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'valor-antigo-bom-123', 'o valor antigo segue lá');
  assert.deepEqual(fs.readdirSync(path.join(casa, '.beyon-segredos')), ['TESTE_SEGREDO_X'], 'nem arquivo novo, nem temporário');
});

test('gravarSegredo troca o arquivo por inteiro (escreve num temporário e renomeia) e corrige o modo de um arquivo que já existia aberto', { skip: process.platform === 'win32' ? 'modo POSIX não existe no Windows' : false }, () => {
  const casa = novaCasa();
  const pasta = path.join(casa, '.beyon-segredos');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'TESTE_SEGREDO_X'), 'velho-valor-123', { mode: 0o666 });
  fs.chmodSync(path.join(pasta, 'TESTE_SEGREDO_X'), 0o666);
  guardar(casa, 'TESTE_SEGREDO_X', 'novo-valor-12345');
  assert.equal(fs.statSync(path.join(pasta, 'TESTE_SEGREDO_X')).mode & 0o777, 0o600);
});

test('restringirPasta (Windows): dois icacls em ARRAY, sem shell (primeiro o dono ganha acesso, depois sai a herança); falha de qualquer um é silenciosa; em outro sistema nem tenta', async () => {
  const { restringirPasta } = await import('../../scripts/guardar-chave.mjs');
  const chamadas = [];
  const ok = restringirPasta('C:\\pasta\\x', { plataforma: 'win32', usuario: 'Ana', executar: (cmd, args, op) => { chamadas.push([cmd, args, op]); } });
  assert.equal(ok, true);
  assert.deepEqual(chamadas.map((c) => c[0]), ['icacls', 'icacls']);
  assert.ok(chamadas.every((c) => Array.isArray(c[1]) && !c[2].shell), 'argumentos em array, nunca por shell');
  assert.deepEqual(chamadas[0][1], ['C:\\pasta\\x', '/grant:r', 'Ana:(OI)(CI)F']);
  assert.deepEqual(chamadas[1][1], ['C:\\pasta\\x', '/inheritance:r']);
  /* o 1º falha: o 2º (que tira a herança) NÃO roda, para ninguém ficar sem acesso à própria pasta */
  const so1 = [];
  assert.equal(restringirPasta('p', { plataforma: 'win32', usuario: 'Ana', executar: (c, a) => { so1.push(a); throw new Error('negado'); } }), false);
  assert.equal(so1.length, 1);
  const outro = [];
  assert.equal(restringirPasta('p', { plataforma: 'linux', usuario: 'Ana', executar: (c, a) => { outro.push(a); } }), false);
  assert.equal(outro.length, 0);
});

test('guardar-chave na linha de comando: o NOME é validado antes de qualquer pergunta e o argumento recusado nunca aparece (se a chave foi colada no lugar do nome)', () => {
  const casa = novaCasa();
  const colada = 'sk-ant-api03-ESTAChaveFoiColadaNoLugarDoNome';
  const r = spawnSync(process.execPath, [GUARDAR, colada], { env: envDe(casa), encoding: 'utf8', cwd: RAIZ });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nome inválido/);
  assert.ok(!r.stdout.includes('ESTAChave') && !r.stderr.includes('ESTAChave') && !r.stderr.includes('sk-ant'), 'o argumento não é ecoado');
  assert.ok(!r.stdout.includes('Cole o valor'), 'não chegou a pedir o valor');
  assert.ok(!fs.existsSync(path.join(casa, '.beyon-segredos')), 'nada foi criado');
  const sem = spawnSync(process.execPath, [GUARDAR], { env: envDe(casa), encoding: 'utf8', cwd: RAIZ });
  assert.equal(sem.status, 2);
});

test('com-chave: o comando recebe o segredo pedido no ambiente, e o programa em si não imprime o valor', () => {
  const casa = novaCasa();
  guardar(casa, 'TESTE_SEGREDO_X', SEGREDO);
  const r = comChave(casa, ['--so', 'TESTE_SEGREDO_X', process.execPath, '-e', 'process.stdout.write(String((process.env.TESTE_SEGREDO_X || "").length))']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, String(SEGREDO.length), 'o filho viu o valor (só o tamanho foi impresso por ele)');
  assert.ok(!r.stdout.includes(SEGREDO) && !r.stderr.includes(SEGREDO));
});

test('com-chave: sem --so (nem --todos) sai com código 2 e o comando NÃO roda; --so vazio, nome inválido e nome inexistente também', () => {
  const casa = novaCasa();
  guardar(casa, 'TESTE_SEGREDO_X', SEGREDO);
  const marca = path.join(casa, 'rodou.txt');
  const roda = ['-e', `require('fs').writeFileSync(${JSON.stringify(marca)}, 'rodou')`];
  const colada = 'sk-ant-api03-ValorColadoNoLugarDoNome';
  const casos = [['sem --so', [process.execPath, ...roda]], ['--so vazio', ['--so', '', process.execPath, ...roda]], ['--so só vírgula', ['--so', ',', process.execPath, ...roda]],
    ['nome inválido', ['--so', colada, process.execPath, ...roda]], ['nome inexistente', ['--so', 'TESTE_SEGREDO_NAO_EXISTE', process.execPath, ...roda]],
    ['um bom e um inexistente', ['--so', 'TESTE_SEGREDO_X,TESTE_SEGREDO_NAO_EXISTE', process.execPath, ...roda]], ['--so e --todos juntos', ['--so', 'TESTE_SEGREDO_X', '--todos', process.execPath, ...roda]]];
  for (const [rotulo, args] of casos) {
    const r = comChave(casa, args);
    assert.equal(r.status, 2, rotulo + ': ' + r.stderr);
    assert.ok(!fs.existsSync(marca), rotulo + ': o comando rodou');
    assert.ok(!r.stdout.includes(SEGREDO) && !r.stderr.includes(SEGREDO), rotulo + ': o valor apareceu');
    assert.ok(!/\bat .*\(.*:\d+:\d+\)/.test(r.stderr), rotulo + ': saiu com stack trace');
    assert.ok(!r.stderr.includes('ValorColadoNoLugar') && !r.stderr.includes('sk-ant'), rotulo + ': ecoou o argumento que parece uma chave');
  }
  assert.match(comChave(casa, ['--so', 'TESTE_SEGREDO_NAO_EXISTE', process.execPath, ...roda]).stderr, /TESTE_SEGREDO_NAO_EXISTE/, 'diz QUAL nome não existe');
  assert.match(comChave(casa, [process.execPath, ...roda]).stderr, /uso:.*--so.*--todos/s);
});

test('com-chave: um nome que existe como PASTA (não arquivo) sai com código 2, sem stack trace e sem rodar', () => {
  const casa = novaCasa();
  fs.mkdirSync(path.join(casa, '.beyon-segredos', 'TESTE_SEGREDO_X'), { recursive: true });
  const r = comChave(casa, ['--so', 'TESTE_SEGREDO_X', process.execPath, ...eco('TESTE_SEGREDO_X')]);
  assert.equal(r.status, 2);
  assert.ok(!/\bat .*\(.*:\d+:\d+\)/.test(r.stderr) && !r.stdout);
  assert.match(r.stderr, /TESTE_SEGREDO_X/);
});

test('com-chave --todos: injeta todos os segredos da pasta (só arquivos de nome válido); --so limita ao pedido', () => {
  const casa = novaCasa();
  guardar(casa, 'TESTE_SEGREDO_X', SEGREDO);
  guardar(casa, 'TESTE_SEGREDO_Y', SEGREDO + '-2');
  fs.writeFileSync(path.join(casa, '.beyon-segredos', 'lixo.tmp'), 'nao-e-segredo');
  const dois = comChave(casa, ['--todos', process.execPath, '-e', 'process.stdout.write([process.env.TESTE_SEGREDO_X ? "x" : "-", process.env.TESTE_SEGREDO_Y ? "y" : "-", process.env["lixo.tmp"] ? "l" : "-"].join(""))']);
  assert.equal(dois.status, 0, dois.stderr);
  assert.equal(dois.stdout, 'xy-');
  const so = comChave(casa, ['--so', 'TESTE_SEGREDO_Y', process.execPath, '-e', 'process.stdout.write([process.env.TESTE_SEGREDO_X ? "x" : "-", process.env.TESTE_SEGREDO_Y ? "y" : "-"].join(""))']);
  assert.equal(so.stdout, '-y', '--so deixa de fora o que não foi pedido');
});

test('com-chave: segredo já definido no ambiente vence o do arquivo (e então nem precisa existir arquivo)', () => {
  const casa = novaCasa();
  const r = comChave(casa, ['--so', 'TESTE_SEGREDO_X', process.execPath, '-e', 'process.stdout.write(String((process.env.TESTE_SEGREDO_X || "").length))'], { TESTE_SEGREDO_X: 'do-ambiente' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, String('do-ambiente'.length), 'o filho viu o valor do ambiente (só o tamanho foi impresso)');
});

test('redação best-effort: o valor que o comando imprimir vira *** (inclusive cortado entre dois pedaços de saída), no stdout e no stderr', () => {
  const casa = novaCasa();
  guardar(casa, 'TESTE_SEGREDO_X', SEGREDO);
  const filho = `
    const s = process.env.TESTE_SEGREDO_X;
    process.stdout.write('antes ' + s + ' depois\\n');
    process.stdout.write(s.slice(0, 10));
    setTimeout(() => { process.stdout.write(s.slice(10) + ' fim\\n'); process.stderr.write('erro com ' + s + '\\n'); }, 60);
  `;
  const r = comChave(casa, ['--so', 'TESTE_SEGREDO_X', process.execPath, '-e', filho]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes(SEGREDO) && !r.stderr.includes(SEGREDO), 'o valor vazou');
  assert.ok(!r.stdout.includes(SEGREDO.slice(0, 10) + SEGREDO.slice(10)));
  assert.match(r.stdout, /antes \*\*\* depois\n\*\*\* fim\n/);
  assert.match(r.stderr, /erro com \*\*\*/);
});

test('redação: criarRedator troca o valor mesmo cortado em qualquer ponto e solta o resto no fim', async () => {
  const { criarRedator } = await import('../../scripts/com-chave.mjs');
  const texto = 'a ' + SEGREDO + ' b ' + SEGREDO + ' c';
  for (let corte = 1; corte < texto.length; corte++) {
    const r = criarRedator([SEGREDO]);
    const saida = r.empurrar(texto.slice(0, corte)) + r.empurrar(texto.slice(corte)) + r.fim();
    assert.equal(saida, 'a *** b *** c', 'corte em ' + corte);
  }
  assert.equal(criarRedator([]).empurrar('nada a trocar'), 'nada a trocar');
});

test('com-chave: o exit code do comando passa adiante', () => {
  const casa = novaCasa();
  guardar(casa, 'TESTE_SEGREDO_X', SEGREDO);
  assert.equal(comChave(casa, ['--so', 'TESTE_SEGREDO_X', process.execPath, '-e', 'process.exit(7)']).status, 7);
});

test('a pasta .beyon-segredos não existe no repositório e está no .gitignore (cinto e suspensório); com-chave documenta o limite de ameaça e que npm/npx não rodam', () => {
  assert.ok(!fs.existsSync(path.join(RAIZ, '.beyon-segredos')));
  assert.match(lerStr(fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8')), /^\.beyon-segredos\/\s*$/m);
  const cab = lerStr(fs.readFileSync(COM_CHAVE, 'utf8')).replace(/\r\n/g, '\n').split('*/')[0];
  assert.match(cab, /esconde o valor da conversa, não do comando/);
  assert.match(cab, /nunca npm install/);
  assert.match(cab, /npm.*npx.*\.cmd.*node arquivo\.mjs/s);
});

test('N4: o segredo que JÁ estava no ambiente (e por isso não é lido do arquivo) também é escondido da saída do comando', () => {
  const casa = novaCasa();
  const noAmbiente = 'valor-ja-no-ambiente-7788';
  const r = comChave(casa, ['--so', 'TESTE_SEGREDO_X', process.execPath, '-e', 'process.stdout.write("v=" + process.env.TESTE_SEGREDO_X + " fim")'], { TESTE_SEGREDO_X: noAmbiente });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'v=*** fim');
  assert.ok(!r.stdout.includes(noAmbiente));
});

test('comando que não existe: a mensagem de erro não repete o argumento (que pode ser a chave colada no lugar do comando) e sai com código 1', () => {
  const casa = novaCasa();
  const colada = 'sk-ant-api03-ChaveColadaNoLugarDoComando';
  const r = comChave(casa, ['--so', 'TESTE_SEGREDO_X', colada], { TESTE_SEGREDO_X: 'valor-no-ambiente-1234' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /não consegui rodar o comando/);
  assert.ok(!r.stderr.includes('ChaveColada') && !r.stderr.includes('sk-ant') && !r.stdout.includes('sk-ant'), 'ecoou o argumento: ' + r.stderr);
  assert.ok(!/ENOENT|spawn /.test(r.stderr) || !r.stderr.includes(colada));
});

test.after(() => { for (const c of casas) fs.rmSync(c, { recursive: true, force: true }); });
