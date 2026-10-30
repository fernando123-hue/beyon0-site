/* OS CABEÇALHOS DAS PÁGINAS na Cloudflare: o _headers (fonte única) lido por cloudflare/cabecalhos.mjs.
   Paridade com o vercel.json enquanto ele existir, CSP de cada página, limites do formato. npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerHeaders, cabecalhosPara } from '../../cloudflare/cabecalhos.mjs';
import { montarPublico } from '../../cloudflare/montar-publico.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const TEXTO = fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8');
const REGRAS = lerHeaders(TEXTO);
const VERCEL = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8')).headers;
/* diretivas que o <meta> não aceita (só valem no header) */
const SO_NO_HEADER = new Set(['frame-ancestors', 'upgrade-insecure-requests', 'report-uri', 'report-to', 'sandbox']);
const diretivas = csp => Object.fromEntries(csp.split(';').map(x => x.trim()).filter(Boolean).map(x => { const [k, ...v] = x.split(/\s+/); return [k, v.sort().join(' ')]; }));

test('leitor: blocos "caminho + linhas indentadas", comentário, * e "! Nome" que desanexa', () => {
  const regras = lerHeaders('# comentário\n/*\n  A: 1\n  B: 2\n\n/x\n  ! A\n  A: 3\n  C: 4\n\n/y/*\n  C: 5\n');
  assert.deepEqual(regras.map(r => r.caminho), ['/*', '/x', '/y/*']);
  assert.deepEqual(regras[1].desanexar, ['a']);
  const f = c => Object.fromEntries(cabecalhosPara(regras, c));
  assert.deepEqual(f('/x'), { a: '3', b: '2', c: '4' });
  assert.deepEqual(f('/y/z/w'), { a: '1', b: '2', c: '5' });
  assert.deepEqual(f('/outro'), { a: '1', b: '2' });
});
test('leitor: o mesmo cabeçalho em regras que casam SOMA os valores (como a Cloudflare), sem desanexar', () => {
  const regras = lerHeaders('/*\n  A: 1\n\n/x\n  A: 2\n');
  assert.equal(cabecalhosPara(regras, '/x').get('a'), '1, 2');
});
test('o _headers repete a CSP no /orcamento e no /painel só depois de desanexar: nenhum caminho com duas CSPs', () => {
  for (const c of ['/', '/sites', '/automacao', '/orcamento', '/painel', '/condicoes', '/privacidade', '/resumo', '/qualquer-coisa', '/vendor/gsap/x.js', '/assets/fonts/x.woff2']) {
    const csp = cabecalhosPara(REGRAS, c).get('content-security-policy');
    assert.ok(csp, c + ' sem CSP');
    assert.equal((csp.match(/default-src/g) || []).length, 1, c + ': CSP duplicada');
  }
});
test('CSP: o <meta> de cada página == a CSP que o _headers dá ao caminho dela (fora as diretivas só de header)', () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'publico-'));
  const versionados = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
  const saida = montarPublico({ raiz: RAIZ, destino, arquivos: versionados });
  const paginas = saida.filter(a => /^[a-z0-9-]+\.html$/.test(a));
  assert.ok(paginas.includes('orcamento.html') && paginas.includes('404.html'));
  for (const arquivo of paginas) {
    const caminho = '/' + arquivo.replace(/\.html$/, '').replace(/^index$/, '');
    const header = cabecalhosPara(REGRAS, caminho).get('content-security-policy');
    assert.ok(header, arquivo + ': toda página sai com CSP');
    const html = fs.readFileSync(path.join(destino, arquivo), 'utf8');
    const meta = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/) || [])[1];
    if (!meta) continue;
    const h = diretivas(header), m = diretivas(meta);
    for (const k of SO_NO_HEADER) delete h[k];
    assert.deepEqual(m, h, arquivo + ' (' + caminho + '): <meta> e header divergem');
  }
});
test('/orcamento sem Google; /painel noindex e no-store; o 404 (qualquer caminho) tem a CSP geral', () => {
  const orc = cabecalhosPara(REGRAS, '/orcamento').get('content-security-policy');
  assert.ok(!/google|doubleclick|googlesyndication|googleadservices|googletagmanager/i.test(orc));
  assert.ok(orc.includes('https://sdk.mercadopago.com') && orc.includes('https://challenges.cloudflare.com'));
  const p = cabecalhosPara(REGRAS, '/painel');
  assert.match(p.get('x-robots-tag'), /noindex/); assert.equal(p.get('cache-control'), 'no-store');
  /* (a geral: sem o Turnstile, que só as páginas com recado liberam; /privacidade é uma delas só na regra geral) */
  assert.equal(cabecalhosPara(REGRAS, '/qualquer-coisa').get('content-security-policy'), cabecalhosPara(REGRAS, '/privacidade').get('content-security-policy'));
});
test('formato: ≤ 100 regras e nenhuma linha acima de 2.000 caracteres', () => {
  assert.ok(REGRAS.length <= 100);
  for (const l of TEXTO.split('\n')) assert.ok(l.length <= 2000, l.slice(0, 40));
});
/* paridade com o vercel.json enquanto ele existir: os mesmos cabeçalhos por caminho (a regra "/api/*" fica no rotear) */
function doVercel(caminho) {
  const h = {};
  for (const regra of VERCEL) {
    if (regra.source.startsWith('/api/')) continue;
    if (!new RegExp('^' + regra.source + '$').test(caminho)) continue;
    for (const { key, value } of regra.headers) h[key.toLowerCase()] = value;
  }
  return h;
}
test('paridade com o vercel.json: mesmos cabeçalhos em /, /sites, /orcamento, /painel, /condicoes, /vendor, fontes', () => {
  for (const c of ['/', '/sites', '/automacao', '/orcamento', '/painel', '/condicoes', '/privacidade', '/resumo', '/vendor/x.js', '/assets/fonts/x.woff2'])
    assert.deepEqual(Object.fromEntries(cabecalhosPara(REGRAS, c)), doVercel(c), c);
});
/* O balão do atendente é um <script> em site de OUTRA origem: com CORP same-origin o navegador o bloqueia (revisão técnica C1).
   Só esse arquivo é liberado, nunca /js/* nem os outros scripts. */
test('CORP cross-origin SÓ no arquivo do balão (Worker/_headers e vercel.json), todo o resto continua same-origin', () => {
  assert.equal(cabecalhosPara(REGRAS, '/js/atendente-balao.js').get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(doVercel('/js/atendente-balao.js')['cross-origin-resource-policy'], 'cross-origin');
  for (const c of ['/js/pagina.js', '/js/atendente-balao.js.map', '/js/atendente-balao-x.js', '/js/nucleo/boot.js', '/', '/orcamento', '/vendor/x.js']) {
    assert.equal(cabecalhosPara(REGRAS, c).get('cross-origin-resource-policy'), 'same-origin', c);
    assert.equal(doVercel(c)['cross-origin-resource-policy'], 'same-origin', c);
  }
  assert.equal(cabecalhosPara(REGRAS, '/js/atendente-balao.js').get('x-content-type-options'), 'nosniff');
});
