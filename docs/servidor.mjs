// Servidor estático mínimo (node puro) para o verificador e as medições.
import http from 'node:http';
import http2 from 'node:http2';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, relative, isAbsolute } from 'node:path';
import { gzipSync } from 'node:zlib';
import { lerHeaders, cabecalhosPara } from '../cloudflare/cabecalhos.mjs';

const RAIZ = resolve(process.argv[2] || process.cwd());
const PORTA = +(process.argv[3] || 8899);
const COMPRIMIR = process.env.COMPRIMIR === '1';
const COMPRIMIVEL = /^(text\/|application\/(json|xml)|image\/svg)/;
/* paridade com o deploy: os cabeçalhos das páginas vêm do _headers (a fonte única, a mesma que a Cloudflare aplica),
   lido pelo mesmo leitor dos testes (cloudflare/cabecalhos.mjs): CSP como header, nosniff, frame-ancestors… */
let REGRAS_HEADERS = [];
try { REGRAS_HEADERS = lerHeaders(await readFile(join(RAIZ, '_headers'), 'utf8')); } catch { /* sem _headers */ }
/* o caminho que o _headers conhece: /orcamento.html e /index.html valem como /orcamento e / (html_handling da Cloudflare) */
const cabecalhos = caminho => Object.fromEntries(cabecalhosPara(REGRAS_HEADERS, caminho.replace(/\/index\.html$/, '/').replace(/(.)\.html$/, '$1')));
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
/* BZ_SEM_CONSULTOR=1: a tela se comporta como sem consultor (sessao-config diz consultor: false; api/vendas.mjs só
   aceita isso com BZ_LOCAL); a IA simulada continua gerando os modelos. É o modo do E2E do orçamento sem IA */
if (process.env.BZ_SEM_CONSULTOR === '1') console.log('[servidor] BZ_SEM_CONSULTOR=1: a página do orçamento abre sem o consultor');
for (const k of ['MP_AMBIENTE', 'MP_ACCESS_TOKEN', 'MP_PUBLIC_KEY', 'MP_WEBHOOK_SEGREDO', 'MP_USER_ID', 'CRON_SECRET']) delete process.env[k];   /* (local: o Mercado Pago SIMULADO; credencial real nunca roda aqui) */
delete process.env.SITE_URL;
try {
  const { montarLocal } = await import('./banco-local.mjs');
  await montarLocal({ base: 'http://127.0.0.1:' + PORTA });
} catch (e) { console.warn('[servidor] agente de vendas local indisponível (rode npm install):', e.message); }
const HOSTS = new Set(['127.0.0.1:' + PORTA, 'localhost:' + PORTA]);
/* (B5) /api/* passa pela MESMA porta do Worker, cloudflare/rotas.mjs → rotear: nome só da tabela, método da tabela,
   corpo limitado por rota, erro genérico e cabeçalhos da API. O ambiente aqui é o local (BZ_LOCAL=1, sem Cloudflare):
   o IP é o do cabeçalho que o cliente mandar, como antes. O módulo entra por import() DEPOIS de o ambiente local
   acima estar pronto (os handlers leem process.env na hora de atender). */
async function api(req, res) {
  const { rotear } = await import('../cloudflare/rotas.mjs');
  const partes = [];
  for await (const p of req) partes.push(p);
  const corpo = Buffer.concat(partes);
  const cabecas = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith(':')));   /* (HTTP/2: sem os pseudo-cabeçalhos) */
  const pedido = new Request('http://' + hostDe(req) + req.url, { method: req.method, headers: cabecas, body: corpo.length ? corpo : undefined });
  const resposta = await rotear(pedido, process.env);
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

const hostDe = req => req.headers.host || req.headers[':authority'];
async function atender(req, res) {
  try {
    if (!HOSTS.has(hostDe(req))) { res.writeHead(421); return res.end(); }
    if (req.url.startsWith('/api/')) return await api(req, res);
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arquivo = resolve(join(RAIZ, caminho));
    const rel = relative(RAIZ, arquivo);
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403); return res.end(); }
    let alvo = arquivo;
    try { await stat(alvo); } catch { alvo = arquivo + '.html'; }
    const dados = await readFile(alvo);
    const tipo = TIPOS[extname(alvo)] || 'application/octet-stream';
    const extra = { 'content-type': tipo, 'cache-control': 'no-store' };
    /* COMPRIMIR=1: gzip como a Vercel (que serve brotli/gzip). Sem isso, rede lenta simulada pesa os bytes crus
       (o JS comentado ~3x maior) e a medição de carga sai pior que a real (docs/medir-carga.mjs) */
    if (COMPRIMIR && COMPRIMIVEL.test(tipo) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      const corpo = gzipSync(dados);
      res.writeHead(200, Object.assign(cabecalhos(caminho), extra, { 'content-encoding': 'gzip', 'content-length': corpo.length, vary: 'accept-encoding' }));
      return res.end(corpo);
    }
    res.writeHead(200, Object.assign(cabecalhos(caminho), extra));
    res.end(dados);
  } catch (e) {
    res.writeHead(404); res.end('404');
  }
}

/* TLS_CERT + TLS_CHAVE (arquivos PEM): HTTP/2 com TLS, como a Vercel. A prioridade de download (fetchpriority,
   preload) se comporta diferente em HTTP/1.1, com 6 conexões; docs/medir-carga.mjs com H2=1 gera o certificado */
if (!process.env.TLS_CERT !== !process.env.TLS_CHAVE) throw new Error('TLS_CERT e TLS_CHAVE vão juntos (só uma das duas está definida)');
const TLS = process.env.TLS_CERT && process.env.TLS_CHAVE;
const servidor = TLS
  ? http2.createSecureServer({ cert: await readFile(process.env.TLS_CERT), key: await readFile(process.env.TLS_CHAVE), allowHTTP1: true }, atender)
  : http.createServer(atender);
servidor.listen(PORTA, '127.0.0.1', () => console.log('servindo', RAIZ, 'em ' + (TLS ? 'https' : 'http') + '://127.0.0.1:' + PORTA));
