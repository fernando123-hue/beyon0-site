// Quadros do laboratório do Mapa vivo v2 (fase 0): node docs/lab-mapa-vivo-fotos.mjs <pasta>
// Servidor local na BASE (padrão http://127.0.0.1:8899). Cada quadro roda o roteiro até o ponto (?parar=) e tira a foto da tela inteira visível.
// Precisa de CHROMIUM (o chrome-headless-shell do Playwright).
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const pasta = process.argv[2] || 'lab-mapa-vivo-quadros';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const QUADROS = [
  ['01-digitando-teclado-390', 390, 844, 'caso=clinica&teclado=1&parar=digitando'],
  ['02-anotou-teclado-390', 390, 844, 'caso=clinica&teclado=1&parar=anotou'],
  ['02b-anotou-320', 320, 640, 'caso=clinica&parar=anotou'],
  ['02c-loja-anotou-teclado-390', 390, 844, 'caso=loja&teclado=1&parar=anotou'],
  ['03-enviou-390', 390, 844, 'caso=clinica&parar=enviou'],
  ['10-hoje-sem-reacao-390', 390, 844, 'caso=clinica&teclado=1&parar=anotou&semreacao=1'],
  ['11-menos-movimento-390', 390, 844, 'caso=clinica&teclado=1&parar=anotou&estatico=1'],
  ['12-anotou-1280', 1280, 800, 'caso=clinica&parar=anotou']
];
await mkdir(pasta, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const erros = [];
for (const [nome, w, h, q] of QUADROS) {
  const cel = w < 900;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: cel, hasTouch: cel });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => erros.push(nome + ': ' + e));
  pg.on('console', m => { if (m.type() === 'error') erros.push(nome + ': ' + m.text()); });
  await pg.goto(`${BASE}/docs/lab-mapa-vivo.html?${q}&captura=1&auto=1`, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.LAB && window.LAB.estado.fim, null, { timeout: 60000 });
  await pg.waitForTimeout(400);
  /* a última coisa que mudou fica à vista (com o teclado aberto, a caixa precisa estar acima dele) */
  await pg.evaluate(() => { const f = document.getElementById('o-form'); const alvo = document.querySelector('.mv-espera') || f; alvo.scrollIntoView({ block: 'end' }); window.scrollBy(0, document.documentElement.classList.contains('tem-teclado') ? 300 : 40); });
  await pg.waitForTimeout(200);
  const lateral = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (lateral) erros.push(nome + ': rolagem lateral');
  await pg.screenshot({ path: join(pasta, nome + '.png') });
  await ctx.close();
}
await b.close();
console.log(JSON.stringify({ pasta, quadros: QUADROS.length, erros }));
