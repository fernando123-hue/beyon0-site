/* O ORÇAMENTO DE BYTES DA PLANTA VIVA (spec §4.4): o JS do desenho (planta-pecas + planta-layout + planta-desenho) serve-se em 3 arquivos
   e tem de pesar no máximo 20 KB comprimido com gzip -9 (o mais conservador: a Cloudflare serve brotli, que dá menos). O CSS é só o da faixa.
   Mede por arquivo e soma (o que o navegador baixa de fato).  node --test docs/testes/planta-bytes.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { compactar } from '../../cloudflare/montar-publico.mjs';

const ler = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url));
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const MODULOS = ['js/planta-pecas.js', 'js/planta-layout.js', 'js/planta-desenho.js'];

test('JS do desenho: no máximo 21.200 bytes com gzip -9 (soma dos três arquivos; 20.000 na spec, +500 na rodada de correção do 2d: avisos de falha do Está certo; +700 na planta viva v2: a entrada que parte do esboço (voo, luz e ouro) no lugar do emaranhado, que saiu, medido em 12/11: 20.324 -> 21.080)', () => {
  const por = MODULOS.map((m) => [m, gz(ler(m))]);
  const soma = por.reduce((s, [, n]) => s + n, 0);
  assert.ok(soma <= 21200, 'gzip -9 soma ' + soma + ' bytes (' + por.map(([m, n]) => m + ' ' + n).join(', ') + ')');
});

test('CSS da faixa: no máximo 6.000 bytes com gzip -9', () => {
  assert.ok(gz(ler('css/orcamento-planta.css')) <= 6000);
});

/* PR 2c: o orçamento de bytes por camada (decisão [A] registrada no plano, "Registro do PR 2c"). O teto de 20 KB da spec §4.4 vale para os 3 módulos do desenho (acima);
   a forma (compartilhada com o servidor) tem teto à parte; o que a pessoa baixa de JS da faixa (forma + 3) tem teto de 28 KB com gzip -9; a ligação, o único JS da
   planta que toda visita baixa (com a flag desligada também), é pequena. */
test('JS da faixa que a pessoa baixa quando a planta chega (forma + 3 módulos): no máximo 29.300 bytes com gzip -9 (+700 da planta viva v2, a mesma conta do teto do desenho)', () => {
  const soma = ['js/orcamento-planta-forma.js'].concat(MODULOS).reduce((s, m) => s + gz(ler(m)), 0);
  assert.ok(soma <= 29300, 'gzip -9 soma ' + soma);
});

/* As duas ligações (a da faixa e a do esboço da planta viva v2) são o único JS da planta que TODA visita ao orçamento baixa, com a flag desligada
   também. O teto mede o que vai ao ar: o arquivo COMPACTADO pelo deploy (cloudflare/montar-publico.mjs, sem comentários; 10/11), porque os comentários
   do repositório são a memória do projeto e não chegam à pessoa. Medido em 12/11: a da faixa 4.265 bytes (era 3.589 antes da v2), a do esboço 2.551. */
const publicado = (rel) => zlib.gzipSync(Buffer.from(compactar(rel, ler(rel).toString('utf8'))), { level: 9 }).length;
test('a ligação da faixa (js/orcamento-planta.js), publicada: no máximo 4.600 bytes com gzip -9', () => {
  const n = publicado('js/orcamento-planta.js');
  assert.ok(n <= 4600, 'gzip -9 ' + n);
});
test('a ligação do esboço (js/orcamento-planta-esboco.js), publicada: no máximo 3.000 bytes com gzip -9', () => {
  const n = publicado('js/orcamento-planta-esboco.js');
  assert.ok(n <= 3000, 'gzip -9 ' + n);
});
