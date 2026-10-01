// Servidor estático mínimo (node puro) para o verificador e as medições.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, relative, isAbsolute } from 'node:path';

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

http.createServer(async (req, res) => {
  try {
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
