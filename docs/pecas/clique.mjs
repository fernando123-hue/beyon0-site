/* Clique curto longe do cursor da régua da Planta: a régua tem de parar no ponto clicado, não no meio do deslize
   do clique (revisão do PR #44: com 80 ms de clique ela ficava ~90 px de largura antes).
   Servidor: node docs/servidor.mjs . 8897. Uso: BASE=http://127.0.0.1:8897 node docs/pecas/clique.mjs */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8897';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
for (const ms of [50, 80, 120]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 240000 });
  const s = p.locator('.planta__slider');
  await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
  await p.evaluate(() => { document.querySelector('.planta__slider').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); });
  await p.waitForTimeout(800);
  const box = await s.boundingBox();
  /* 25% da régua: 360 + .25 × 1080 = 630, longe das paradas 390/768 (sem ímã) */
  const x = box.x + box.width * 0.25, esperado = 360 + 0.25 * 1080;
  await p.mouse.move(x, box.y + box.height / 2);
  await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up();
  await p.waitForTimeout(700);
  const v = +(await s.getAttribute('aria-valuenow'));
  const ok = Math.abs(v - esperado) <= 12;
  if (!ok) problemas++;
  console.log(`${ok ? 'OK   ' : 'FALHA'} clique de ${ms} ms: parou em ${v} (clicado ≈ ${esperado})`);
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
