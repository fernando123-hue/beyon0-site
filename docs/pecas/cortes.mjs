/* Arrasta a régua da Planta de 1 em 1 px (DPR 1 e 2) e confere, a cada passo, se a classe is-celular e o aria
   batem com o layout do CSS (miolo da moldura: 600/760/900) e se o deslize dispara onde o layout muda.
   Servidor: node docs/servidor.mjs . 8897. Uso: node docs/pecas/cortes.mjs */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
for (const dpr of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8897/', { waitUntil: 'domcontentloaded', timeout: 240000 });
  const s = p.locator('.planta__slider');
  await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
  await p.evaluate(() => { const sl = document.querySelector('.planta__slider'); sl.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); });
  await p.waitForTimeout(800);
  const box = await s.boundingBox();
  const y = box.y + box.height / 2;
  await p.mouse.move(box.x + box.width - 2, y); await p.mouse.down();
  const linhas = [];
  let ultimoCorte = null, flips = 0, saltos = 0;
  for (let x = box.x + box.width - 2; x > box.x + box.width * 0.15; x -= 1) {
    await p.mouse.move(x, y);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const e = await p.evaluate(() => {
      const sl = document.querySelector('.planta__slider'), m = document.querySelector('.planta__moldura');
      const n = document.getAnimations().filter(a => a.effect && a.effect.getTiming().duration === 400 && a.currentTime !== null && a.playState === "running" && String((a.effect.getKeyframes()[0] || {}).transform || '').startsWith('translate(')).length;
      return { v: +sl.getAttribute('aria-valuenow'), cw: m.clientWidth, cwf: m.getBoundingClientRect().width, cel: m.classList.contains('is-celular'), txt: sl.getAttribute('aria-valuetext') || '', n, borda: getComputedStyle(m).borderLeftWidth, pedida: m.style.borderWidth };
    });
    const corte = e.cw < 600 ? 0 : e.cw < 760 ? 1 : e.cw < 900 ? 2 : 3;
    const nomeCss = ['Celular', 'Tablet', 'Tablet', 'Computador'][corte];
    const ok = e.cel === (corte === 0) && e.txt.startsWith(nomeCss);
    if (ultimoCorte !== null && corte !== ultimoCorte) { saltos++; if (e.n > 0) flips++; linhas.push(`dpr${dpr} corte ${ultimoCorte}->${corte} em v=${e.v} cw=${e.cw} borda=${e.borda} pedida=${e.pedida} deslize=${e.n}`); }
    if (!ok) { problemas++; linhas.push(`dpr${dpr} DISCORDA v=${e.v} cw=${e.cw} cel=${e.cel} aria="${e.txt}" borda=${e.borda}`); }
    ultimoCorte = corte;
  }
  await p.mouse.up();
  console.log(linhas.join('\n'));
  console.log(`dpr${dpr}: saltos=${saltos} com_deslize=${flips}`);
  await ctx.close();
}
console.log('discordancias=' + problemas);
await b.close();
