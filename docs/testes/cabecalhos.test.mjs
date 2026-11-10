/* OS CABEÇALHOS DAS PÁGINAS na Cloudflare: o _headers (fonte única) lido por cloudflare/cabecalhos.mjs.
   Paridade com o vercel.json enquanto ele existir, CSP de cada página, limites do formato. npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerHeaders, cabecalhosPara, ORDENS } from '../../cloudflare/cabecalhos.mjs';
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
test('leitor: ":nome" casa um trecho não vazio e sem "/" (como a Cloudflare); "*" casa até o vazio', () => {
  const regras = lerHeaders('/:p\n  A: 1\n\n/:p/*\n  B: 2\n');
  const f = c => Object.fromEntries(cabecalhosPara(regras, c));
  assert.deepEqual(f('/'), {});
  assert.deepEqual(f('/x'), { a: '1' });
  assert.deepEqual(f('/x.css'), { a: '1' });
  assert.deepEqual(f('/x/'), { b: '2' });
  assert.deepEqual(f('/x/y/z.js'), { b: '2' });
});
/* O defeito medido em produção (10/11): "/" com duas CSPs, a da regra "/" primeiro. A ordem alfabética o reproduz
   ("/" vem antes de "/*", então o "! Content-Security-Policy" de "/" roda antes de existir o que ele deveria tirar). */
test('leitor: na ordem alfabética o "!" da regra "/" roda antes de "/*" e a raiz soma as duas CSPs (o que a produção mostrou)', () => {
  const regras = lerHeaders('/*\n  CSP: geral\n\n/\n  ! CSP\n  CSP: raiz\n\n/sites\n  ! CSP\n  CSP: sites\n');
  assert.equal(cabecalhosPara(regras, '/').get('csp'), 'raiz');
  assert.equal(cabecalhosPara(regras, '/', { ordem: 'alfabetica' }).get('csp'), 'raiz, geral');
  assert.equal(cabecalhosPara(regras, '/sites', { ordem: 'alfabetica' }).get('csp'), 'sites');
  assert.throws(() => cabecalhosPara(regras, '/', { ordem: 'outra' }), /ordem desconhecida/);
});
const CAMINHOS = ['/', '/sites', '/automacao', '/orcamento', '/painel', '/condicoes', '/privacidade', '/resumo', '/404', '/qualquer-coisa',
  '/sites/', '/a/b/', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/painel.css', '/index.html', '/vendor/gsap/x.js', '/assets/fonts/x.woff2',
  '/assets/x.svg', '/js/pagina.js', '/js/nucleo/cena.js', '/js/atendente-balao.js', '/css/base.css', '/css/orcamento-planta.css',
  '//', '//x', '///a/b', '/x//y'];
test('a CSP geral é a MESMA nas regras que a repetem (/:trecho, /:trecho/*, //*) e nenhuma delas casa a raiz', () => {
  const gerais = ['/:trecho', '/:trecho/*', '//*'].map(c => {
    const r = REGRAS.find(x => x.caminho === c);
    assert.ok(r, 'falta a regra ' + c);
    return r.cabecalhos.find(([nome]) => nome === 'content-security-policy')[1];
  });
  assert.equal(new Set(gerais).size, 1, 'as cópias da CSP geral divergem');
  assert.ok(!gerais[0].includes('challenges.cloudflare.com'), 'a CSP geral não libera o Turnstile');
  for (const c of ['/qualquer-coisa', '/a/b/', '//x']) assert.equal(cabecalhosPara(REGRAS, c).get('content-security-policy'), gerais[0], c);
});
test('o _headers dá a cada caminho UMA CSP, e os mesmos cabeçalhos em qualquer ordem de aplicação (arquivo ou alfabética)', () => {
  for (const c of CAMINHOS) {
    const [base, ...outras] = ORDENS.map(ordem => Object.fromEntries(cabecalhosPara(REGRAS, c, { ordem })));
    for (const o of outras) assert.deepEqual(o, base, c + ': os cabeçalhos mudam com a ordem das regras');
    for (const ordem of ORDENS) {
      const csp = cabecalhosPara(REGRAS, c, { ordem }).get('content-security-policy');
      assert.ok(csp, c + ' sem CSP (' + ordem + ')');
      assert.equal((csp.match(/default-src/g) || []).length, 1, c + ': CSP duplicada (ordem ' + ordem + ')');
    }
  }
});
test('a raiz não depende do "!": só a regra "/" põe CSP em "/" (nenhuma regra geral casa a raiz com CSP)', () => {
  for (const r of REGRAS) {
    const temCsp = r.cabecalhos.some(([nome]) => nome === 'content-security-policy');
    if (r.caminho !== '/' && temCsp) assert.ok(!cabecalhosPara([r], '/').has('content-security-policy'), r.caminho + ' põe CSP também na raiz');
  }
  assert.ok(!REGRAS.find(r => r.caminho === '/').desanexar.includes('content-security-policy'), 'a regra "/" não precisa de "! Content-Security-Policy"');
});
test('nenhum valor de cabeçalho contém ":nome" de placeholder (a Cloudflare o trocaria pelo trecho do caminho)', () => {
  const nomes = REGRAS.flatMap(r => [...r.caminho.matchAll(/:([A-Za-z]\w*)/g)].map(m => m[1]));
  for (const r of REGRAS) for (const [nome, valor] of r.cabecalhos) for (const p of nomes) assert.ok(!valor.includes(':' + p), r.caminho + ' ' + nome + ' contém :' + p);
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

/* a trava da travessia: cache de /js e /css e o ?v=<hash> da montagem (fora da lista fechada do package.json) */
import './travessia-cache.test.mjs';
