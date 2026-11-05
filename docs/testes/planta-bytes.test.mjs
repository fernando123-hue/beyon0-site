/* O ORÇAMENTO DE BYTES DA PLANTA VIVA (spec §4.4): o JS do desenho (planta-pecas + planta-layout + planta-desenho) serve-se em 3 arquivos
   e tem de pesar no máximo 20 KB comprimido com gzip -9 (o mais conservador: a Cloudflare serve brotli, que dá menos). O CSS é só o da faixa.
   Mede por arquivo e soma (o que o navegador baixa de fato).  node --test docs/testes/planta-bytes.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';

const ler = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url));
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const MODULOS = ['js/planta-pecas.js', 'js/planta-layout.js', 'js/planta-desenho.js'];

test('JS do desenho: no máximo 20.000 bytes com gzip -9 (soma dos três arquivos)', () => {
  const por = MODULOS.map((m) => [m, gz(ler(m))]);
  const soma = por.reduce((s, [, n]) => s + n, 0);
  assert.ok(soma <= 20000, 'gzip -9 soma ' + soma + ' bytes (' + por.map(([m, n]) => m + ' ' + n).join(', ') + ')');
});

test('CSS da faixa: no máximo 6.000 bytes com gzip -9', () => {
  assert.ok(gz(ler('css/orcamento-planta.css')) <= 6000);
});

/* PR 2c: o orçamento de bytes por camada (decisão [A] registrada no plano, "Registro do PR 2c"). O teto de 20 KB da spec §4.4 vale para os 3 módulos do desenho (acima);
   a forma (compartilhada com o servidor) tem teto à parte; o que a pessoa baixa de JS da faixa (forma + 3) tem teto de 28 KB com gzip -9; a ligação, o único JS da
   planta que toda visita baixa (com a flag desligada também), é pequena. */
test('JS da faixa que a pessoa baixa quando a planta chega (forma + 3 módulos): no máximo 28.000 bytes com gzip -9', () => {
  const soma = ['js/orcamento-planta-forma.js'].concat(MODULOS).reduce((s, m) => s + gz(ler(m)), 0);
  assert.ok(soma <= 28000, 'gzip -9 soma ' + soma);
});

test('a ligação (js/orcamento-planta.js), baixada com a flag desligada também: no máximo 5.000 bytes com gzip -9', () => {
  const n = gz(ler('js/orcamento-planta.js'));
  assert.ok(n <= 5000, 'gzip -9 ' + n);
});
