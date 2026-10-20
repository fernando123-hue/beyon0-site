// varre a régua de 360 a 1440 (teclado: Home + PageUp/setas) e acusa onde o site de exemplo passa do pé da moldura
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const a = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
await a.goto('http://127.0.0.1:8897/', { waitUntil: 'domcontentloaded', timeout: 240000 });
await a.waitForTimeout(2500);
await a.evaluate(() => { const p = document.querySelector('.planta__palco'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - 140, behavior: 'instant' }); });
await a.waitForTimeout(7000);
const medir = () => a.evaluate(() => {
  const m = document.querySelector('.planta__moldura'), mb = m.getBoundingClientRect(), esc = mb.height / m.offsetHeight;
  let pe = 0;
  for (const s of ['.pl-foto', '.pl-recursos', '.pl-acoes', '.pl-titulo']) { const e = document.querySelector(s); if (e && e.offsetParent) pe = Math.max(pe, (e.getBoundingClientRect().bottom - mb.top) / esc); }
  return { w: m.offsetWidth, h: m.offsetHeight, pe: Math.round(pe), larg: document.querySelector('.pl').scrollWidth };
});
for (const nome of ['', 'Associação dos Moradores Vi']) {
  await a.evaluate((n) => { const c = document.querySelector('[data-planta-campo]'); c.value = n; c.dispatchEvent(new Event('input')); }, nome);
  for (const nicho of ['servicos', 'comercio', 'saude', 'organizacao']) {
    await a.evaluate((n) => document.querySelector(`[data-nicho=${n}]`).click(), nicho);
    await a.waitForTimeout(1500);
    await a.focus('.planta__slider');
    await a.keyboard.press('Home');
    const ruins = [];
    for (let i = 0; i < 55; i++) {
      await a.waitForTimeout(450);
      const r = await medir();
      if (r.pe > r.h - 8 || r.larg > r.w) ruins.push(`${r.w}:${r.pe}/${r.h}${r.larg > r.w ? ' larg' + r.larg : ''}`);
      if (r.w >= 1440) break;
      await a.keyboard.press('ArrowRight'); await a.keyboard.press('ArrowRight');
    }
    console.log(nome ? 'longo' : 'curto', nicho, ruins.length ? ruins.join(' ') : 'ok');
  }
}
await b.close();
