/* OS HEROS ENXUTOS (PR #65, dono 28-29/10): título sem número de prazo ("Seu site no ar com prazo fechado."), a Planta
   no hero de /sites no lugar da seção de formatos.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const semComentarios = html => html.replace(/<!--[\s\S]*?-->/g, '');
const PAGINAS = ['index.html', 'sites.html', 'automacao.html'];

test('nenhuma página de venda promete "até 10 dias úteis" (o prazo vem da estimativa do pedido)', () => {
  for (const p of PAGINAS) assert.doesNotMatch(semComentarios(ler(p)), /10 dias úteis/, p);
});

test('toda âncora interna das páginas de venda aponta para um id que existe (a seção de formatos virou a Planta)', () => {
  for (const p of PAGINAS) {
    const html = semComentarios(ler(p));
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    for (const [, alvo] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(alvo), p + ': #' + alvo + ' sem destino');
  }
});

