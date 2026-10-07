// Servidor estático mínimo (node puro) para o verificador e as medições.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(process.argv[2] || process.cwd());
const PORTA = +(process.argv[3] || 8899);
/* paridade com o deploy: os headers do vercel.json (CSP como header, nosniff,
   frame-ancestors…) valem também aqui, para o verificador medir o mesmo site */
let HEADERS = [];
try { HEADERS = JSON.parse(await readFile(join(RAIZ, 'vercel.json'), 'utf8')).headers || []; } catch { /* sem vercel.json */ }
const cabecalhos = caminho => {
  const h = {};
  for (const regra of HEADERS) {
    const re = new RegExp('^' + regra.source.replace(/\(\.\*\)/g, '(.*)') + '$');
    if (re.test(caminho)) for (const { key, value } of regra.headers) h[key.toLowerCase()] = value;
  }
  return h;
};
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.mp4': 'video/mp4'
};

/* /api/* como na Vercel: o arquivo api/<nome>.mjs exporta GET/POST(Request) e devolve um Response.
   Aqui o banco é o de memória (BZ_LOCAL=1, api/_banco.mjs); a chave do painel vem de PAINEL_CHAVE. */
process.env.BZ_LOCAL = '1';
delete process.env.SUPABASE_URL;    /* (teste local nunca grava no banco de produção) */
delete process.env.SUPABASE_CHAVE_SECRETA;
delete process.env.SUPABASE_CHAVE_PUBLICA;
/* agente de vendas local: banco PGlite com as migrations, visitantes de desenvolvimento, gateway simulado.
   IA simulada por padrão (de graça); BZ_IA_REAL=1 + ANTHROPIC_API_KEY usa a de verdade (custa). */
if (process.env.BZ_IA_REAL !== '1') delete process.env.ANTHROPIC_API_KEY;
delete process.env.PAGAMENTO_SIMULADO_SEGREDO;
delete process.env.SITE_URL;
try {
  const { montarLocal } = await import('./banco-local.mjs');
  await montarLocal({ base: 'http://127.0.0.1:' + PORTA });
} catch (e) { console.warn('[servidor] agente de vendas local indisponível (rode npm install):', e.message); }
const HOSTS = new Set(['127.0.0.1:' + PORTA, 'localhost:' + PORTA]);
async function api(req, res, caminho) {
  const nome = caminho.slice(5).replace(/\/$/, '');
  if (!/^[a-z]+$/.test(nome)) { res.writeHead(404); return res.end(); }
  const mod = await import(pathToFileURL(join(RAIZ, 'api', nome + '.mjs')).href);
  const fn = mod[req.method];
  if (!fn) { res.writeHead(405); return res.end(); }
  const partes = [];
  for await (const p of req) partes.push(p);
  const corpo = Buffer.concat(partes);
  const pedido = new Request('http://' + req.headers.host + req.url, { method: req.method, headers: req.headers, body: corpo.length ? corpo : undefined });
  const resposta = await fn(pedido);
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    if (!HOSTS.has(req.headers.host)) { res.writeHead(421); return res.end(); }
    if (req.url.startsWith('/api/')) return await api(req, res, new URL(req.url, 'http://x').pathname);
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arquivo = resolve(join(RAIZ, caminho));
    const rel = relative(RAIZ, arquivo);
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403); return res.end(); }
    let alvo = arquivo;
    try { await stat(alvo); } catch { alvo = arquivo + '.html'; }
    const dados = await readFile(alvo);
    res.writeHead(200, Object.assign(cabecalhos(caminho), { 'content-type': TIPOS[extname(alvo)] || 'application/octet-stream', 'cache-control': 'no-store' }));
    res.end(dados);
  } catch (e) {
    res.writeHead(404); res.end('404');
  }
}).listen(PORTA, '127.0.0.1', () => console.log('servindo', RAIZ, 'em http://127.0.0.1:' + PORTA));
