/* NENHUM TESTE FORA DA SUÍTE (26/11). O `testar` do package.json é uma lista fechada de arquivos: um teste novo que ninguém liga não roda
   na CI, e ninguém percebe. Medido em 26/11: modelos-trilho e direcao-icones-ritmo (código já em produção), modelos-molde e mapa-vivo-*
   passavam à mão e nunca tinham rodado na CI. Um arquivo está NA SUÍTE quando está na lista, quando um arquivo da suíte o importa
   (`import './x.test.mjs'`, como heroes.test.mjs faz) ou quando é planta-* e o agregador (planta-todos.test.mjs) está na suíte.
   Fora disso, só com o motivo escrito em FORA_DE_PROPOSITO.  node --test docs/testes/suite-completa.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = fileURLToPath(new URL('./', import.meta.url));
const PACOTE = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/* o que fica fora de propósito, e por quê */
export const FORA_DE_PROPOSITO = {
  'lab-planta-v2.test.mjs': 'laboratório da planta viva v2 (docs/lab-planta-v2-*); vira teste do PR do crescimento'
};

const IMPORTA = /import\s*(?:[^'"]*?from\s*)?['"]\.\/([\w.-]+\.test\.mjs)['"]/g;
/* tira comentários de bloco e de linha inteira antes de procurar imports: um import comentado não liga nada (revisão do PR) */
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const AGREGADOR_PLANTA = 'planta-todos.test.mjs';

/* os arquivos que a suíte roda, a partir da lista do `testar`, seguindo os imports e o agregador da planta */
export function alcancados(pasta, testar) {
  const todos = fs.readdirSync(pasta).filter((n) => n.endsWith('.test.mjs'));
  const fila = (testar.match(/docs\/testes\/[\w.-]+\.test\.mjs/g) || []).map((c) => c.replace('docs/testes/', ''));
  const vistos = new Set();
  while (fila.length) {
    const nome = fila.shift();
    if (vistos.has(nome) || !todos.includes(nome)) continue;
    vistos.add(nome);
    const texto = fs.readFileSync(pasta + nome, 'utf8');
    for (const m of semComentarios(texto).matchAll(IMPORTA)) fila.push(m[1]);
    if (nome === AGREGADOR_PLANTA) fila.push(...todos.filter((n) => /^planta-.+\.test\.mjs$/.test(n)));
  }
  return { todos, vistos };
}

test('todo arquivo de teste roda na suíte (ou está fora de propósito, com o motivo escrito)', () => {
  const { todos, vistos } = alcancados(PASTA, PACOTE.scripts.testar);
  const orfaos = todos.filter((n) => !vistos.has(n) && !Object.hasOwn(FORA_DE_PROPOSITO, n));
  assert.deepEqual(orfaos, [], 'fora da suíte (importe num arquivo da lista ou escreva o motivo em FORA_DE_PROPOSITO): ' + orfaos.join(', '));
});

test('a lista de exceções não guarda nome velho, nem arquivo que já roda', () => {
  const { todos, vistos } = alcancados(PASTA, PACOTE.scripts.testar);
  for (const n of Object.keys(FORA_DE_PROPOSITO)) {
    assert.ok(todos.includes(n), n + ' não existe mais: tire da lista');
    assert.ok(!vistos.has(n), n + ' já roda na suíte: tire da lista');
  }
});

test('o próprio guarda está na suíte, e o caminhador segue import, from e o agregador, e ignora import comentado', () => {
  assert.ok(alcancados(PASTA, PACOTE.scripts.testar).vistos.has('suite-completa.test.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-completa-'));
  try {
    const p = dir + path.sep;
    fs.writeFileSync(p + 'a.test.mjs', "import './b.test.mjs';\nimport { x } from './c.test.mjs';\n");
    fs.writeFileSync(p + 'b.test.mjs', '');
    fs.writeFileSync(p + 'c.test.mjs', "import './planta-todos.test.mjs';\n");
    fs.writeFileSync(p + 'planta-todos.test.mjs', '');
    fs.writeFileSync(p + 'planta-um.test.mjs', '');
    fs.writeFileSync(p + 'solto.test.mjs', '');
    fs.writeFileSync(p + 'comentado.test.mjs', '');
    fs.appendFileSync(p + 'b.test.mjs', "// import './comentado.test.mjs';\n/* import './comentado.test.mjs'; */\n");
    const { vistos } = alcancados(p, 'node --test docs/testes/a.test.mjs');
    assert.deepEqual([...vistos].sort(), ['a.test.mjs', 'b.test.mjs', 'c.test.mjs', 'planta-todos.test.mjs', 'planta-um.test.mjs']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
