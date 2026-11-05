/* O AGREGADOR DOS TESTES DA PLANTA VIVA. O `testar` do package.json é uma lista explícita de arquivos: um teste fora dela nunca roda no CI,
   e mexer no package.json pede o "sim" do dono no push (docs/PROCESSO.md, "Como se publica", item 1). Por isso docs/testes/zero.test.mjs, que
   já está na lista, termina com `import './planta-todos.test.mjs';` (o mesmo caminho de travas-identidade.test.mjs). Este arquivo importa
   todo `planta-*.test.mjs` desta pasta, menos ele mesmo; os `*-casos.mjs` (listas de frases) não terminam em ".test.mjs" e ficam de fora.
   Quem prova o agregador é planta-agregador.test.mjs. Teste novo da planta? É só criar docs/testes/planta-<assunto>.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PASTA = new URL('./', import.meta.url);
const EU = 'planta-todos.test.mjs';
const nomes = fs.readdirSync(PASTA).filter((n) => /^planta-.+\.test\.mjs$/.test(n) && n !== EU).sort();

test('o agregador acha ao menos um teste da planta', () => {
  assert.ok(nomes.length > 0, 'nenhum planta-*.test.mjs na pasta: o agregador não está rodando nada');
});

for (const nome of nomes) await import(new URL(nome, PASTA).href);
