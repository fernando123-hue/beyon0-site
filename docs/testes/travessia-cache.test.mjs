/* A TRAVA DA TRAVESSIA (docs/passagem-trava.mjs, commit 910b009): o vão sem quadros entre as páginas era a revalidação
   de ~37 JS/CSS com o servidor a cada troca (max-age=0, must-revalidate). O conserto: /js/* e /css/* com max-age curto
   no _headers, e o HTML montado (cloudflare/montar-publico.mjs) pede cada JS/CSS com ?v=<hash do conteúdo>: depois de
   uma publicação o HTML novo nunca usa JS/CSS velho. Entra no npm run testar por docs/testes/cabecalhos.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerHeaders, cabecalhosPara } from '../../cloudflare/cabecalhos.mjs';
import { montarPublico, compactar } from '../../cloudflare/montar-publico.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const REGRAS = lerHeaders(fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8'));
const cc = caminho => cabecalhosPara(REGRAS, caminho).get('cache-control');
const versionados = () => execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 10);

const CACHE_CURTO = 'public, max-age=300';
const REVALIDA = 'public, max-age=0, must-revalidate';
const PAGINAS = ['/', '/sites', '/automacao', '/orcamento', '/condicoes', '/privacidade', '/resumo', '/qualquer-coisa'];

/* ---------- (a) o _headers ---------- */
test('cache: /js/* e /css/* com max-age curto, um valor só', () => {
  for (const c of ['/js/core.js', '/js/passagem.js', '/js/nucleo/boot.js', '/js/recado.js', '/js/orcamento-planta.js', '/css/base.css', '/css/passagem.css', '/css/recado.css'])
    assert.equal(cc(c), CACHE_CURTO, c);
});
/* os módulos que outro JS pede sem ?v e que quebram a página se vierem de outra versão (2ª revisão: boot novo com cena
   velha, planta nova com peça velha): revalidam sempre, como antes da mudança */
const SO_COM_O_PAI = ['/js/nucleo/cena.js', '/js/nucleo/gesto.js', '/js/nucleo/spec.js', '/js/nucleo/pecas.js', '/js/nucleo/coroa.js',
  '/js/nucleo/shaders.js', '/js/orcamento-planta-forma.js', '/js/planta-pecas.js', '/js/planta-layout.js', '/js/planta-desenho.js', '/css/orcamento-planta.css',
  '/js/planta-cresce.js', '/js/planta-relogio.js', '/js/planta-som.js', '/js/planta-esboco.js', '/css/planta-esboco.css'];
test('cache: os módulos do reator 3D e da planta (pedidos por JS sem ?v) revalidam sempre: nunca peça velha com página nova', () => {
  for (const c of SO_COM_O_PAI) assert.equal(cc(c), REVALIDA, c);
  for (const a of versionados().filter(a => /^js\/nucleo\/.+\.js$/.test(a) && !/\/(boot|lab)\.js$/.test(a)))
    assert.ok(SO_COM_O_PAI.includes('/' + a), 'módulo novo do núcleo sem regra de revalidar: /' + a);
});
test('cache: nada em /js ou /css fica preso por muito tempo (sem immutable, max-age ≤ 300): há módulos pedidos sem ?v', () => {
  for (const c of ['/js/core.js', '/js/nucleo/cena.js', '/css/tokens.css', '/js/atendente-balao.js']) {
    const v = cc(c);
    assert.ok(!/immutable/.test(v), c);
    assert.ok(Number((v.match(/max-age=(\d+)/) || [])[1]) <= 300, c + ': ' + v);
  }
});
test('cache: as páginas (HTML) continuam revalidando (o padrão da Cloudflare); o /painel continua no-store', () => {
  for (const c of PAGINAS) assert.equal(cc(c), undefined, c);
  assert.equal(cc('/painel'), 'no-store');
});
test('cache: o balão do atendente (URL fixa em site de cliente, sem ?v) revalida sempre e segue com CORP cross-origin', () => {
  assert.equal(cc('/js/atendente-balao.js'), REVALIDA);
  assert.equal(cabecalhosPara(REGRAS, '/js/atendente-balao.js').get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(cc('/js/atendente-balao-x.js'), CACHE_CURTO, 'só o arquivo do balão');
});
test('cache: vendor e fontes não mudam', () => {
  assert.equal(cc('/vendor/gsap/gsap.min.js'), 'public, max-age=604800');
  assert.equal(cc('/assets/fonts/sora-latin.woff2'), 'public, max-age=31536000, immutable');
});

/* ---------- (b) a montagem põe ?v=<hash> nas referências do HTML ---------- */
const REF = /\b(src|href)="([^"]*)"/g;
const ehLocalJsCss = u => !/^[a-z]+:|^\/\//i.test(u) && /\.(js|css)(\?|$)/.test(u);
const semVendor = u => !/^\/?vendor\//.test(u);

test('montagem: toda referência local de JS/CSS dos .html sai com ?v=<hash do arquivo montado>; vendor/ e externas intactas', () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'publico-v-'));
  try {
    const saida = montarPublico({ raiz: RAIZ, destino, arquivos: versionados() });
    let n = 0;
    for (const pagina of saida.filter(a => a.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(destino, pagina), 'utf8');
      for (const [, , u] of html.matchAll(REF)) {
        if (!ehLocalJsCss(u)) continue;
        if (!semVendor(u)) { assert.doesNotMatch(u, /\?/, pagina + ': vendor sem ?v (' + u + ')'); continue; }
        const m = u.match(/^(\/?)([^?#]+)\?v=([0-9a-f]{10})$/);
        assert.ok(m, pagina + ': sem ?v=<hash>: ' + u);
        const arquivo = m[1] ? m[2] : path.posix.join(path.posix.dirname(pagina), m[2]);
        assert.equal(m[3], hash(fs.readFileSync(path.join(destino, arquivo))), pagina + ': hash certo de ' + arquivo);
        n++;
      }
    }
    assert.ok(n > 100, 'as páginas têm as referências (' + n + ')');
    const index = fs.readFileSync(path.join(destino, 'index.html'), 'utf8');
    assert.match(index, /src="js\/core\.js\?v=[0-9a-f]{10}"/);
    assert.match(index, /src="vendor\/gsap\/gsap\.min\.js"/);
    assert.match(fs.readFileSync(path.join(destino, '404.html'), 'utf8'), /href="\/css\/tokens\.css\?v=[0-9a-f]{10}"/);
  } finally { fs.rmSync(destino, { recursive: true, force: true }); }
});
test('montagem: o HTML do repositório nunca leva ?v (o hash só existe na pasta montada, nunca fica velho)', () => {
  for (const a of versionados().filter(a => /^[a-z0-9-]+\.html$/.test(a)))
    assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, a), 'utf8'), /\.(js|css)\?v=/, a);
});

/* um repositório de mentira: externas, protocolo relativo, vendor, absoluta, raiz, subpasta */
function miniRepo(js) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-repo-'));
  const arquivos = {
    'index.html': '<link rel="stylesheet" href="css/a.css" /><link href="/css/a.css" rel="stylesheet">' +
      '<link rel="stylesheet" href="privacidade.css" /><script src="js/a.js" defer></script><script src="/js/a.js"></script>' +
      '<script src="vendor/gsap/g.js"></script><script src="https://www.googletagmanager.com/gtag/js?id=1"></script>' +
      '<script src="//cdn.exemplo.invalid/x.js"></script><a href="https://exemplo.invalid/y.css">x</a>' +
      '<!-- comentario (js/a.js, css/a.css) --><img src="assets/x.png" />',
    'js/a.js': js, 'css/a.css': 'a{}', 'privacidade.css': 'b{}', 'vendor/gsap/g.js': 'g', 'assets/x.png': 'p'
  };
  for (const [a, t] of Object.entries(arquivos)) { fs.mkdirSync(path.dirname(path.join(raiz, a)), { recursive: true }); fs.writeFileSync(path.join(raiz, a), t); }
  return { raiz, arquivos: Object.keys(arquivos) };
}
function montarMini(js) {
  const { raiz, arquivos } = miniRepo(js);
  const destino = path.join(raiz, 'publico');
  try {
    montarPublico({ raiz, destino, arquivos });
    return { saida: fs.readFileSync(path.join(destino, 'index.html'), 'utf8'), fonte: fs.readFileSync(path.join(raiz, 'index.html'), 'utf8') };
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
}
test('montagem: reescreve só as locais (relativa, absoluta, CSS da raiz); externas, //, vendor/, comentários e imagens intactos', () => {
  const { saida, fonte } = montarMini('um()');
  /* o hash é do arquivo MONTADO (já compactado), nunca da fonte */
  const hJs = hash(Buffer.from(compactar('js/a.js', 'um()'))), hCss = hash(Buffer.from(compactar('css/a.css', 'a{}'))), hRaiz = hash(Buffer.from(compactar('privacidade.css', 'b{}')));
  assert.ok(saida.includes(`href="css/a.css?v=${hCss}"`) && saida.includes(`href="/css/a.css?v=${hCss}"`));
  assert.ok(saida.includes(`src="js/a.js?v=${hJs}"`) && saida.includes(`src="/js/a.js?v=${hJs}"`));
  assert.ok(saida.includes(`href="privacidade.css?v=${hRaiz}"`));
  for (const intacto of ['src="vendor/gsap/g.js"', 'src="https://www.googletagmanager.com/gtag/js?id=1"', 'src="//cdn.exemplo.invalid/x.js"',
    'href="https://exemplo.invalid/y.css"', '(js/a.js, css/a.css)', 'src="assets/x.png"'])
    assert.ok(saida.includes(intacto), intacto);
  assert.ok(!fonte.includes('?v='), 'o HTML da raiz não muda');
});
test('montagem: o hash muda quando o conteúdo do JS muda (e só o dele)', () => {
  const a = montarMini('um()').saida, b = montarMini('dois()').saida;
  const v = (s, arq) => (s.match(new RegExp('"' + arq.replace(/[./]/g, '\\$&') + '\\?v=([0-9a-f]+)"')) || [])[1];
  assert.notEqual(v(a, 'js/a.js'), v(b, 'js/a.js'));
  assert.equal(v(a, 'css/a.css'), v(b, 'css/a.css'));
});
test('montagem: aspas simples e "./" também levam ?v; data-src/data-href (não são endereço) ficam intactos', () => {
  const { raiz, arquivos } = miniRepo('um()');
  fs.writeFileSync(path.join(raiz, 'index.html'), "<script src='js/a.js'></script><script src=\"./js/a.js\"></script><div data-src=\"js/a.js\" data-href=\"css/a.css\"></div>");
  try {
    montarPublico({ raiz, destino: path.join(raiz, 'publico'), arquivos });
    const s = fs.readFileSync(path.join(raiz, 'publico', 'index.html'), 'utf8'), h = hash(Buffer.from(compactar('js/a.js', 'um()')));
    assert.ok(s.includes(`src='js/a.js?v=${h}'`) && s.includes(`src="./js/a.js?v=${h}"`), s);
    assert.ok(s.includes('data-src="js/a.js"') && s.includes('data-href="css/a.css"'), s);
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});
test('montagem: JS/CSS local que a montagem não sabe versionar é erro (nunca sobe sem ?v calado)', () => {
  for (const ref of ['<script src="js/a.js?x=1"></script>', '<script src="JS/A.js"></script>', '<link href=css/a.css rel="stylesheet">']) {
    const { raiz, arquivos } = miniRepo('x');
    fs.writeFileSync(path.join(raiz, 'index.html'), ref);
    try { assert.throws(() => montarPublico({ raiz, destino: path.join(raiz, 'publico'), arquivos }), /sem \?v/, ref); }
    finally { fs.rmSync(raiz, { recursive: true, force: true }); }
  }
});
test('montagem: referência a JS/CSS local que não sobe é erro de montagem (seria 404 no ar)', () => {
  const { raiz, arquivos } = miniRepo('x');
  fs.writeFileSync(path.join(raiz, 'index.html'), '<script src="js/falta.js"></script>');
  try { assert.throws(() => montarPublico({ raiz, destino: path.join(raiz, 'publico'), arquivos }), /js\/falta\.js/); }
  finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});

/* ---------- os caminhos pedidos SEM ?v (por JS, não pelo HTML): lista fechada ----------
   Os do reator 3D e da planta revalidam sempre (SO_COM_O_PAI, acima). Os outros vivem com o max-age curto: por até 300 s
   depois de uma publicação, quem já tinha o arquivo pode juntar o módulo velho com a página nova (recado, turnstile: o
   servidor valida o que importa). Um carregamento novo por JS entra aqui de propósito, pensando nesse risco. */
const SEM_V = [
  'js/nucleo/boot.js → /js/nucleo/{cena,gesto,spec,pecas,coroa,shaders}.js (import() e modulepreload) e /vendor/three/three-nucleo.min.js',
  'js/nucleo/{cena,gesto,pecas}.js → ./spec.js ./pecas.js ./coroa.js ./shaders.js ../../vendor/three/three-nucleo.min.js (import estático)',
  'js/orcamento-api.js → /js/recado.js',
  'js/orcamento-planta.js → js/orcamento-planta-forma.js js/planta-pecas.js js/planta-layout.js js/planta-desenho.js css/orcamento-planta.css',
  'js/recado.js → /js/orcamento-turnstile.js /css/recado.css',
  'js/painel-atendente.js → /js/atendente-balao.js (só o texto que o dono cola no site do cliente)',
  'js/planta-desenho.js → ./orcamento-planta-forma.js ./planta-layout.js ./planta-pecas.js (só o require do Node nos testes)',
  'js/planta-cresce.js → ./mapa-saber.js ./orcamento-rotulos.js (só o require do Node nos testes)',
  'js/orcamento-planta-esboco.js → js/planta-pecas.js js/mapa-saber.js js/planta-cresce.js js/planta-relogio.js js/planta-som.js js/planta-esboco.js css/planta-esboco.css (revalidam sempre)'
];
test('os JS/CSS pedidos por JS sem ?v são exatamente os conhecidos (SEM_V)', () => {
  const achados = [];
  const LITERAL = /['"`(]([a-z0-9_./-]*[a-z0-9_-]\.(?:js|css|mjs))(?:[?#][^'"`)]*)?['"`)]/g;
  for (const a of versionados().filter(a => /^(js|css)\/.+\.(js|css)$/.test(a) && a !== 'js/nucleo/lab.js')) {
    const codigo = fs.readFileSync(path.join(RAIZ, a), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const [, u] of codigo.matchAll(LITERAL)) achados.push(a + ' ' + u);
  }
  const conhecidos = new Set(['js/nucleo/boot.js /js/nucleo/cena.js', 'js/nucleo/boot.js /js/nucleo/gesto.js', 'js/nucleo/boot.js /js/nucleo/spec.js',
    'js/nucleo/boot.js /js/nucleo/pecas.js', 'js/nucleo/boot.js /js/nucleo/coroa.js', 'js/nucleo/boot.js /js/nucleo/shaders.js',
    'js/nucleo/boot.js /vendor/three/three-nucleo.min.js', 'js/nucleo/cena.js ../../vendor/three/three-nucleo.min.js', 'js/nucleo/cena.js ./spec.js',
    'js/nucleo/cena.js ./pecas.js', 'js/nucleo/gesto.js ./spec.js', 'js/nucleo/pecas.js ./coroa.js', 'js/nucleo/pecas.js ./shaders.js',
    'js/orcamento-api.js /js/recado.js', 'js/orcamento-planta.js js/orcamento-planta-forma.js', 'js/orcamento-planta.js js/planta-pecas.js',
    'js/orcamento-planta.js js/planta-layout.js', 'js/orcamento-planta.js js/planta-desenho.js', 'js/orcamento-planta.js css/orcamento-planta.css',
    'js/painel-atendente.js /js/atendente-balao.js', 'js/planta-desenho.js ./orcamento-planta-forma.js', 'js/planta-desenho.js ./planta-layout.js',
    'js/planta-desenho.js ./planta-pecas.js', 'js/recado.js /js/orcamento-turnstile.js', 'js/recado.js css/recado.css','js/recado.js /css/recado.css',
    'js/orcamento-planta-esboco.js js/planta-pecas.js', 'js/orcamento-planta-esboco.js js/planta-cresce.js', 'js/orcamento-planta-esboco.js js/planta-relogio.js',
    'js/orcamento-planta-esboco.js js/planta-som.js', 'js/orcamento-planta-esboco.js js/planta-esboco.js', 'js/orcamento-planta-esboco.js css/planta-esboco.css',
    'js/orcamento-planta-esboco.js js/mapa-saber.js', 'js/planta-cresce.js ./mapa-saber.js', 'js/planta-cresce.js ./orcamento-rotulos.js']);
  assert.deepEqual([...new Set(achados)].filter(x => !conhecidos.has(x)), [], 'carregamento novo sem ?v: avalie o risco e some em SEM_V:\n' + SEM_V.join('\n'));
});
test('nenhum JS procura <link>/<script> pelo FIM do endereço ([href$=] / [src$=]): com ?v o fim é o hash', () => {
  for (const a of versionados().filter(a => /^js\/.+\.js$/.test(a)))
    assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, a), 'utf8'), /\[(href|src)\$=/, a);
});
