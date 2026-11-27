/* Fotografa o laboratório da cena (docs/lab-cena.html) em 390 e 320, com movimento reduzido (o quadro final), uma foto por caso e a página
   inteira; mede rolagem lateral e erros. Salva em docs/lab-cena-fotos/ (fora do git).
     node docs/servidor.mjs . 8941
     BASE=http://127.0.0.1:8941 CHROMIUM=... node docs/lab-cena-fotos.mjs */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8941';
const PASTA = 'docs/lab-cena-fotos';
mkdirSync(PASTA, { recursive: true });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const largura of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(BASE + '/docs/lab-cena.html', { waitUntil: 'load' });
  const n = await page.locator('.caso svg.cena').count();
  ok(n === 12, largura + ': 12 cenas desenhadas (' + n + ')');
  const lateral = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(lateral <= 0, largura + ': sem rolagem lateral (' + lateral + ')');
  const alturas = await page.locator('.caso svg.cena').evaluateAll(l => l.map(s => Math.round(s.getBoundingClientRect().height)));
  ok(alturas.every(h => h > 60 && h <= 130), largura + ': altura da cena ' + alturas.join(','));
  const casos = page.locator('.caso__vitrine');
  for (let i = 0; i < await casos.count(); i++) await casos.nth(i).screenshot({ path: `${PASTA}/${largura}-${String(i + 1).padStart(2, '0')}.png` });
  ok(erros.length === 0, largura + ': sem erro na página ' + erros.join(' | '));
  await ctx.close();
}
await browser.close();
process.exit(falhou ? 1 : 0);
