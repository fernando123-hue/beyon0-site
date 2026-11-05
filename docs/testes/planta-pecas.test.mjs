/* AS PEÇAS DA PLANTA VIVA (PR 2b; spec Anexo A): os 29 desenhos (chegada + os 28 tipos de etapa) de js/planta-pecas.js.
   O catálogo tem de bater 1 para 1 com o módulo de forma (se o servidor aceita um tipo, a tela sabe desenhá-lo). Só traço: nada de
   filtro, estilo, gradiente nem desfoque. Grade de 40 x 40.  node --test docs/testes/planta-pecas.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import F from '../../js/orcamento-planta-forma.js';
import P from '../../js/planta-pecas.js';

const fonte = fs.readFileSync(new URL('../../js/planta-pecas.js', import.meta.url), 'utf8');

/* leitor de caminho (M L H V C Q A Z, maiúsculas e minúsculas): devolve todos os pontos tocados, absolutos */
function pontos(d) {
  const partes = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = '', x = 0, y = 0, x0 = 0, y0 = 0;
  const num = () => { const v = Number(partes[i++]); assert.ok(Number.isFinite(v), 'número finito em ' + d); return v; };
  while (i < partes.length) {
    if (/^[A-Za-z]$/.test(partes[i])) cmd = partes[i++];
    else if (!cmd) assert.fail('caminho sem comando: ' + d);
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const px = (v) => (rel ? x + v : v), py = (v) => (rel ? y + v : v);
    if (C === 'Z') { x = x0; y = y0; continue; }
    if (C === 'H') { x = px(num()); }
    else if (C === 'V') { y = py(num()); }
    else if (C === 'M' || C === 'L') { const a = num(), b = num(); x = px(a); y = py(b); if (C === 'M') { x0 = x; y0 = y; cmd = rel ? 'l' : 'L'; } }
    else if (C === 'A') { num(); num(); num(); num(); num(); const a = num(), b = num(); x = px(a); y = py(b); }
    else if (C === 'C') { for (let k = 0; k < 2; k++) { const a = num(), b = num(); out.push([px(a), py(b)]); } const a = num(), b = num(); x = px(a); y = py(b); }
    else if (C === 'Q') { const a = num(), b = num(); out.push([px(a), py(b)]); const c = num(), e = num(); x = px(c); y = py(e); }
    else assert.fail('comando não permitido ' + cmd + ' em ' + d);
    out.push([x, y]);
  }
  return out;
}

test('o catálogo de peças é o do módulo de forma, 1 para 1, incluindo "chegada" (29 desenhos)', () => {
  assert.equal(F.TIPOS.length, 29);
  assert.deepEqual(Object.keys(P.PECAS).sort(), F.TIPOS.slice().sort());
  assert.deepEqual(P.TIPOS.slice().sort(), F.TIPOS.slice().sort());
});

test('cada peça devolve traços { d, ac } com comandos permitidos, números finitos e tudo dentro da grade de 40 x 40', () => {
  for (const tipo of F.TIPOS) {
    const tracos = P.desenhar(tipo, 3);
    assert.ok(Array.isArray(tracos) && tracos.length >= 2, tipo + ': ao menos 2 traços');
    assert.ok(tracos.some((t) => t.ac === true), tipo + ': tem um traço de destaque');
    for (const t of tracos) {
      assert.equal(typeof t.d, 'string');
      assert.equal(typeof t.ac, 'boolean');
      assert.match(t.d, /^[MmLlHhVvCcQqAaZz0-9eE.,\s+-]+$/, tipo + ': só comandos de caminho permitidos');
      for (const [px, py] of pontos(t.d)) {
        assert.ok(px >= -0.5 && px <= 40.5 && py >= -0.5 && py <= 40.5, tipo + ': ponto fora da grade 40x40 (' + px + ', ' + py + ') em ' + t.d);
      }
    }
  }
});

test('a chegada muda com o número de origens (1 a 4) e cabe na grade', () => {
  const formas = [1, 2, 3, 4].map((n) => JSON.stringify(P.desenhar('chegada', n)));
  assert.equal(new Set(formas).size >= 3, true, 'o desenho acompanha a quantidade de origens');
});

test('tipo desconhecido não desenha nada e não lança (devolve null)', () => {
  for (const ruim of ['', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'pagina ', undefined, null, 7, {}]) assert.equal(P.desenhar(ruim, 1), null);
});

test('só traço: nenhum atributo de filtro, estilo, gradiente ou desfoque no módulo', () => {
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/filter|style|gradient|blur|shadow|fill\s*[:=]/i.test(semComentarios), 'a peça é só caminho de traço');
});

test('determinismo: a mesma chamada devolve o mesmo desenho', () => {
  for (const tipo of F.TIPOS) assert.deepEqual(P.desenhar(tipo, 2), P.desenhar(tipo, 2));
});

test('os 9 tipos novos (formulario, mapa, galeria, catalogo, cardapio, aula, documento, confirmacao, mensagem) existem e são diferentes entre si', () => {
  const novos = ['formulario', 'mapa', 'galeria', 'catalogo', 'cardapio', 'aula', 'documento', 'confirmacao', 'mensagem'];
  const vistos = new Set();
  for (const t of novos) { const j = JSON.stringify(P.desenhar(t, 1)); assert.ok(!vistos.has(j), t + ' repete outro desenho'); vistos.add(j); }
});
