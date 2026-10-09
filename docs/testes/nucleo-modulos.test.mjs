/* A esfera (js/nucleo/boot.js) pede seus módulos JUNTOS por modulepreload: sem isso eles chegam em 3 idas e voltas em
   série (-634 ms medidos, auditoria 2026-10-09, desempenho #3). A lista MODULOS é escrita à mão; este teste a prende ao
   grafo real dos import estáticos: um módulo novo que fique de fora voltaria a chegar em série sem ninguém ver, e um
   renomeado viraria 404 (revisão técnica do lote 5).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RAIZ = new URL('../../', import.meta.url);
const ler = caminho => readFileSync(new URL('.' + caminho, RAIZ), 'utf8');

/* os import estáticos de um módulo, resolvidos como o navegador resolve (relativos ao próprio arquivo) */
function importsDe(caminho) {
  const fonte = ler(caminho);
  const especificadores = [...fonte.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map(m => m[1]);
  return especificadores.map(e => new URL(e, 'https://x' + caminho).pathname);
}

function grafo(entradas) {
  const vistos = new Set();
  const fila = [...entradas];
  while (fila.length) {
    const atual = fila.shift();
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    fila.push(...importsDe(atual));
  }
  return vistos;
}

function listaDoBoot() {
  const bloco = ler('/js/nucleo/boot.js').match(/var MODULOS = \[([^\]]*)\]/);
  assert.ok(bloco, 'a lista MODULOS sumiu de js/nucleo/boot.js');
  return new Set([...bloco[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
}

function entradasDoBoot() {
  return [...ler('/js/nucleo/boot.js').matchAll(/import\('([^']+)'\)/g)].map(m => m[1]);
}

test('nucleo: o boot importa a cena e o gesto, e os dois estão na lista do preload', () => {
  const entradas = entradasDoBoot();
  assert.deepEqual([...entradas].sort(), ['/js/nucleo/cena.js', '/js/nucleo/gesto.js']);
  const lista = listaDoBoot();
  for (const e of entradas) assert.ok(lista.has(e), e + ' fora do preload');
});

test('nucleo: a lista do preload é exatamente o grafo de módulos da esfera', () => {
  const real = grafo(entradasDoBoot());
  const lista = listaDoBoot();
  const faltam = [...real].filter(m => !lista.has(m));
  const sobram = [...lista].filter(m => !real.has(m));
  assert.deepEqual(faltam, [], 'módulos que a esfera importa e o preload não pede (chegariam em série): ' + faltam.join(', '));
  assert.deepEqual(sobram, [], 'módulos no preload que ninguém importa (bytes à toa, ou 404): ' + sobram.join(', '));
});
