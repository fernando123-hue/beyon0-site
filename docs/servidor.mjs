// Servidor estático mínimo (node puro) para o verificador e as medições.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const RAIZ = process.argv[2] || process.cwd();
const PORTA = +(process.argv[3] || 8899);
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
    const arquivo = normalize(join(RAIZ, caminho));
    if (!arquivo.startsWith(normalize(RAIZ))) { res.writeHead(403); return res.end(); }
    let alvo = arquivo;
    try { await stat(alvo); } catch { alvo = arquivo + '.html'; }
    const dados = await readFile(alvo);
    res.writeHead(200, { 'content-type': TIPOS[extname(alvo)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(dados);
  } catch (e) {
    res.writeHead(404); res.end('404');
  }
}).listen(PORTA, '127.0.0.1', () => console.log('servindo', RAIZ, 'em http://127.0.0.1:' + PORTA));
