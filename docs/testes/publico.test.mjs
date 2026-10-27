/* O QUE SOBE COMO ASSET (cloudflare/montar-publico.mjs): lista de permissão, com paridade com o que a Vercel serve hoje.
   npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { montarPublico, ehPublico } from '../../cloudflare/montar-publico.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const versionados = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
/* o oráculo enquanto a Vercel existir (revisão M2): o que a Vercel serve hoje = versionado − .vercelignore − o que não é página */
const IGNORE = fs.readFileSync(path.join(RAIZ, '.vercelignore'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
/* o que a Vercel esconde por redirect (vercel.json → redirects, ex.: /.gitleaksignore, /.gitignore) também não é página */
const ESCONDIDOS = (JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8')).redirects || []).map(r => {
  const s = r.source.replace(/^\//, '');
  return s.includes(':') ? { prefixo: s.slice(0, s.indexOf(':')) } : { exato: s };   /* "/.github/:caminho*" → prefixo ".github/" */
});
const escondido = a => ESCONDIDOS.some(e => (e.exato !== undefined ? a === e.exato : e.prefixo && a.startsWith(e.prefixo)));
const NAO_PAGINA = [/^api\//, /^cloudflare\//, /^package(-lock)?\.json$/, /^vercel\.json$/, /^wrangler\.jsonc$/, /^\.env\.example$/, { test: escondido }];
const casa = (arq, p) => {
  const base = arq.split('/').pop();
  if (p.endsWith('/')) return arq.startsWith(p) || arq.includes('/' + p);
  if (p.includes('/')) return arq === p;
  if (p.includes('*')) return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(base);
  return base === p;
};
const esperado = versionados.filter(a => !IGNORE.some(p => casa(a, p)) && !NAO_PAGINA.some(r => r.test(a))).sort();

test('paridade com a Vercel: a saída == o que a Vercel serve hoje, nos dois sentidos', () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'publico-'));
  const saida = montarPublico({ raiz: RAIZ, destino, arquivos: versionados }).sort();
  assert.deepEqual(saida.filter(a => a !== '_headers'), esperado.filter(a => a !== '_headers'));
  assert.ok(saida.includes('_headers'), '_headers sobe com os assets');
  for (const a of ['painel.css', 'privacidade.css', 'resumo.css', '404.html', 'favicon.ico']) assert.ok(saida.includes(a), a);
});
test('nunca sobe: código, docs, banco, segredo, configuração', () => {
  for (const a of ['api/vendas.mjs', 'api/_freio.mjs', 'docs/PROCESSO.md', 'supabase/migrations/x.sql', 'scripts/direcoes.mjs', 'cloudflare/rotas.mjs',
    '.github/workflows/ci.yml', '.claude/x', '.superpowers/x', 'CLAUDE.md', 'package.json', 'vercel.json', 'wrangler.jsonc', '.env', '.env.local', '.dev.vars',
    'backup.sql', 'x.dump', 'x.7z', 'js/nucleo/lab.js', 'vendor/three/entrada.js', 'vendor/three/README.md', 'assets/README.txt', 'publico/x.html', 'node_modules/x.js'])
    assert.equal(ehPublico(a), false, a);
});

/* ---- PR C, C1: domínio único. O endereço antigo (Vercel) não pode sobrar em nada que sobe como asset; canonical, og,
   dados estruturados, sitemap e robots usam o DOMINIO de docs/testes/dominio.mjs ---- */
import { DOMINIO, HOST_DO_DOMINIO } from './dominio.mjs';
const saidaTexto = () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'publico-dom-'));
  const arquivos = montarPublico({ raiz: RAIZ, destino, arquivos: versionados }).filter(a => /\.(html|xml|txt|css|js|mjs|json)$|^_headers$/.test(a));
  const lidos = arquivos.map(a => ({ a, t: fs.readFileSync(path.join(destino, a), 'utf8') }));
  fs.rmSync(destino, { recursive: true, force: true });
  return lidos;
};
const PAGINAS = { 'index.html': '/', 'sites.html': '/sites', 'automacao.html': '/automacao', 'resumo.html': '/resumo', 'orcamento.html': '/orcamento', 'condicoes.html': '/condicoes', 'privacidade.html': '/privacidade' };
const lerRaiz = a => fs.readFileSync(path.join(RAIZ, a), 'utf8');
const urlsDe = t => t.match(/https?:\/\/[^\s"'<>)]+/g) || [];

test('domínio único (C1): nenhum vercel.app em nenhum arquivo que sobe como asset', () => {
  const com = saidaTexto().filter(({ t }) => /vercel\.app|beyon0-site/i.test(t)).map(({ a }) => a);
  assert.deepEqual(com, [], 'ainda com o endereço antigo');
});
test('domínio único (C1): canonical, og:url, og:image e twitter:image de cada página são do DOMINIO e batem com o caminho da página', () => {
  for (const [arq, caminho] of Object.entries(PAGINAS)) {
    const h = lerRaiz(arq);
    assert.ok(h.includes(`<link rel="canonical" href="${DOMINIO}${caminho}" />`), arq + ': canonical');
    const ogUrl = h.match(/property="og:url" content="([^"]+)"/);
    if (ogUrl) assert.equal(ogUrl[1], DOMINIO + caminho, arq + ': og:url');
    for (const m of h.matchAll(/(?:property="og:image"|name="twitter:image") content="([^"]+)"/g)) assert.equal(m[1], DOMINIO + '/assets/og-cover.jpg', arq + ': imagem social');
    for (const u of h.match(/<(?:link rel="canonical"|meta property="og:[a-z:]+"|meta name="twitter:[a-z:]+")[^>]*>/g) || [])
      for (const e of urlsDe(u)) assert.ok(e.startsWith(DOMINIO + '/'), arq + ': ' + e);
  }
});
test('domínio único (C1): os dados estruturados (JSON-LD) só apontam para o DOMINIO', () => {
  let blocos = 0; let total = 0;
  for (const arq of Object.keys(PAGINAS)) {
    for (const m of lerRaiz(arq).matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)) {
      blocos += 1;
      const dados = JSON.parse(m[1]);
      const urls = []; const anda = (v, chave) => { if (chave === '@context') return; if (typeof v === 'string') { if (/^https?:\/\//.test(v)) urls.push(v); } else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => anda(x, k)); };
      anda(dados);
      total += urls.length;
      for (const u of urls) assert.ok(u === DOMINIO + '/' || u.startsWith(DOMINIO + '/'), arq + ': ' + u);
    }
  }
  assert.ok(total >= 15, 'endereços conferidos: ' + total);
  assert.ok(blocos >= 6, 'index (2), sites (2) e automacao (2): ' + blocos);
});
test('domínio único (C1): sitemap.xml e robots.txt', () => {
  const locs = [...lerRaiz('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locs, [DOMINIO + '/', DOMINIO + '/sites', DOMINIO + '/automacao', DOMINIO + '/orcamento', DOMINIO + '/privacidade']);
  assert.match(lerRaiz('robots.txt'), new RegExp('^Sitemap: ' + DOMINIO.replace(/[.]/g, '[.]') + '/sitemap[.]xml$', 'm'));
});
test('domínio único (C1): o endereço que a página de resumo imprime é o do DOMINIO', () => {
  const impresso = lerRaiz('resumo.html').match(/<p class="r-impresso">([^<]*)<\/p>/);
  assert.ok(impresso && impresso[1].includes(HOST_DO_DOMINIO), 'resumo impresso: ' + (impresso && impresso[1]));
});
