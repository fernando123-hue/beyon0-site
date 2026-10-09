/* A POLÍTICA DE SEGURANÇA (CSP) de cada página existe em DOIS lugares: o header do vercel.json e o <meta> do próprio
   HTML (o navegador aplica os dois). Em 2026-10-07 o widget do Turnstile foi bloqueado porque só o vercel.json tinha
   sido atualizado (PR #8). Este teste prende os dois juntos e garante que o /orcamento não libera origem que a página
   não usa (revisão de segurança do PR #1, B4: domínios do Google sem uso).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = new URL('../../', import.meta.url);
const HEADERS = JSON.parse(readFileSync(new URL('vercel.json', RAIZ), 'utf8')).headers || [];
/* diretivas que o <meta> não aceita (só valem no header) */
const SO_NO_HEADER = new Set(['frame-ancestors', 'upgrade-insecure-requests', 'report-uri', 'report-to', 'sandbox']);

const diretivas = csp => Object.fromEntries(csp.split(';').map(x => x.trim()).filter(Boolean)
  .map(x => { const [k, ...v] = x.split(/\s+/); return [k, v.sort().join(' ')]; }));
/* o header que a Vercel aplica a um caminho (mesma conversão do docs/servidor.mjs: a última regra que casa vence) */
function cspDoHeader(caminho) {
  let valor = null;
  for (const regra of HEADERS) {
    const re = new RegExp('^' + regra.source.replace(/\(\.\*\)/g, '(.*)') + '$');
    if (!re.test(caminho)) continue;
    const h = regra.headers.find(x => x.key.toLowerCase() === 'content-security-policy');
    if (h) valor = h.value;
  }
  return valor;
}
const paginas = readdirSync(RAIZ).filter(f => f.endsWith('.html'));

test('CSP: o <meta> de cada página é igual ao header do vercel.json (fora as diretivas só de header)', () => {
  assert.ok(paginas.includes('orcamento.html'));
  for (const arquivo of paginas) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8');
    const meta = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/) || [])[1];
    if (!meta) continue;
    const caminho = '/' + arquivo.replace(/\.html$/, '').replace(/^index$/, '');
    const header = cspDoHeader(caminho);
    assert.ok(header, arquivo + ': tem <meta> de CSP mas nenhum header no vercel.json para ' + caminho);
    const h = diretivas(header), m = diretivas(meta);
    for (const k of SO_NO_HEADER) delete h[k];
    assert.deepEqual(m, h, arquivo + ' (' + caminho + '): <meta> e header divergem');
  }
});

test('CSP do /orcamento: sem origem que a página não usa (Google), com Mercado Pago e Cloudflare', () => {
  const csp = cspDoHeader('/orcamento');
  assert.ok(!/google|doubleclick|googlesyndication|googleadservices|googletagmanager/i.test(csp), 'sem Google: ' + csp);
  const html = readFileSync(new URL('orcamento.html', RAIZ), 'utf8');
  assert.ok(!/googletagmanager/.test(html), 'a página não carrega o Google');
  /* a medição entra só para decidir o que é contato (métricas próprias), sem o Google: data-sem-google */
  const scripts = html.match(/<script[^>]*medicao\.js[^>]*>/g) || [];
  assert.equal(scripts.length, 1, 'o orçamento carrega a medição uma vez (sem ela, o WhatsApp de lá deixa de contar)');
  assert.ok(scripts.every(s => /\sdata-sem-google[\s>]/.test(s)), 'medicao.js no orçamento só com data-sem-google: ' + scripts.join(' '));
  const d = diretivas(csp);
  for (const origem of ['https://sdk.mercadopago.com', 'https://challenges.cloudflare.com']) assert.ok(d['script-src'].includes(origem), origem);
  for (const origem of ['https://secure-fields.mercadopago.com', 'https://challenges.cloudflare.com']) assert.ok(d['frame-src'].includes(origem), origem);
});

/* (auditoria 2026-10-09, segurança 1) o .vercelignore pode não valer num deploy feito pelo Git: o que é do repositório
   e não é página nem asset tem de ter uma regra no vercel.json que o tire do ar (o mesmo padrão de /docs e /supabase:
   redirect para a página inicial). A lista vem do próprio git: um arquivo ou pasta novo na raiz sem regra falha aqui. */
const PUBLICO = new Set(['api/', 'assets/', 'css/', 'js/', 'vendor/', 'robots.txt', 'sitemap.xml']);
const ehPublico = nome => PUBLICO.has(nome) || /^[a-z0-9-]+\.(html|css)$/.test(nome);
const REDIRECTS = JSON.parse(readFileSync(new URL('vercel.json', RAIZ), 'utf8')).redirects || [];
/* a forma de caminho da Vercel (path-to-regexp): ":nome*" casa zero ou mais segmentos, ":nome" casa um trecho */
const casaRedirect = caminho => REDIRECTS.some(r => new RegExp('^' + r.source
  .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  .replace(/\/:[a-z]+\*/gi, '(?:/.*)?')
  .replace(/:[a-z]+\*/gi, '.*')
  .replace(/:[a-z]+/gi, '[^/]+') + '$').test(caminho));

const VERSIONADOS = execFileSync('git', ['ls-files'], { cwd: fileURLToPath(RAIZ), encoding: 'utf8' }).split('\n').filter(Boolean);
const LINHAS_IGNORE = readFileSync(new URL('.vercelignore', RAIZ), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
/* o que o .vercelignore tira do deploy, em caminho fixo ("/docs", "/js/nucleo/lab.js") */
const IGNORADOS = LINHAS_IGNORE.filter(l => !l.includes('*')).map(l => '/' + l.replace(/\/$/, ''));
const ignorado = arquivo => IGNORADOS.some(p => ('/' + arquivo).startsWith(p) && ['', '/'].includes(('/' + arquivo).slice(p.length, p.length + 1)))
  || (/\.log$/.test(arquivo) && LINHAS_IGNORE.includes('*.log'));

test('deploy: nada do repositório que não é página nem asset fica no ar (regra no vercel.json para cada um)', () => {
  const raiz = [...new Set(VERSIONADOS.map(f => (f.includes('/') ? f.split('/')[0] + '/' : f)))];
  assert.ok(raiz.includes('index.html') && raiz.includes('docs/'), 'leu a raiz do repositório: ' + raiz.join(' '));
  const internos = raiz.filter(n => !ehPublico(n));
  const sem = internos.filter(n => (n.endsWith('/') ? !(casaRedirect('/' + n.slice(0, -1)) && casaRedirect('/' + n + 'qualquer/coisa.md')) : !casaRedirect('/' + n)));
  assert.deepEqual(sem, [], 'sem regra no vercel.json (redirects): ' + sem.join(', '));
  /* o que o .vercelignore tira do deploy (caminho fixo, sem curinga) também tem a regra, para o caso de ele não valer */
  const semRegra = IGNORADOS.filter(p => !casaRedirect(p));
  assert.deepEqual(semRegra, [], 'no .vercelignore e sem regra no vercel.json: ' + semRegra.join(', '));
});

/* (revisão técnica do lote 1) o outro lado: nenhum redirect tira do ar um arquivo público versionado, e nenhuma regra fixa
   aponta para um arquivo que não existe (regra morta esconde erro de digitação na regra que importa) */
test('deploy: todo arquivo público versionado continua no ar; regra fixa só para arquivo que existe', () => {
  const publicos = VERSIONADOS.filter(f => ehPublico(f.includes('/') ? f.split('/')[0] + '/' : f) && !ignorado(f));
  assert.ok(publicos.includes('index.html') && publicos.some(f => f.startsWith('js/')) && publicos.some(f => f.startsWith('api/')), 'leu os públicos');
  const caminhos = publicos.flatMap(f => (/\.html$/.test(f) ? ['/' + f, '/' + f.replace(/\.html$/, '').replace(/^index$/, '')] : ['/' + f]));
  const pegos = caminhos.filter(p => casaRedirect(p) && !p.startsWith('/api/_'));   /* (/api/_* são módulos internos: a regra existe para eles) */
  assert.deepEqual(pegos, [], 'a regra tirou do ar um arquivo público: ' + pegos.join(', '));
  const fixas = REDIRECTS.map(r => r.source).filter(s => !s.includes(':'));
  const mortas = fixas.filter(s => !VERSIONADOS.includes(s.slice(1)) && !IGNORADOS.includes(s));
  assert.deepEqual(mortas, [], 'regra para arquivo que não existe no repositório: ' + mortas.join(', '));
});
