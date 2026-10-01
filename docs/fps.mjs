/* FPS rápido por página/largura (3s de rAF), com rolagem lateral e nós.
   Uso: BASE=... CHROMIUM=... node docs/fps.mjs [largura,...] */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const larguras = (process.argv[2] || '1440').split(',').map(Number);
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const medir = page => page.evaluate(() => new Promise(ok => { let n = 0; const t0 = performance.now(); (function v() { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(v) : ok(+(n / 3).toFixed(1)); })(); }));
for (const w of larguras) for (const rota of ['/sites.html', '/index.html', '/automacao.html']) {
  const ctx = await nav.newContext({ viewport: { width: w, height: Math.round(w * .625) } }); const page = await ctx.newPage();
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(3500);
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(String(w).padStart(5), rota.padEnd(16), 'fps=' + await medir(page), 'overflowX=' + ox);
  await ctx.close();
}
await nav.close();
