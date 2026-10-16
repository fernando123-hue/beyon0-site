/* O Plantão: a pessoa mexe na régua NO MEIO do deslize da entrada (de dia ele desliza até 23h e a 1ª pergunta
   chega lá). A mão vence o deslize (rolar a página com o dedo por cima não conta), mas a 1ª pergunta tem de chegar
   mesmo assim (revisão do 2a34d4d: o cancelAnimationFrame matava o fim do deslize). O gesto sai de dentro da página,
   no quadro em que a régua passa de 700: pelo Playwright ele chegava depois do deslize acabar com a máquina ocupada.
   Servidor: node docs/servidor.mjs . 8897. Uso: BASE=http://127.0.0.1:8897 node docs/pecas/interromper.mjs */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8897';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
for (const gesto of ['mouse', 'teclado', 'toque', 'rolar']) {
  const celular = gesto === 'toque' || gesto === 'rolar';
  const ctx = await b.newContext({ viewport: celular ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  /* a régua nasce na hora real de quem vê: o relógio da página fica em 10:00 (dia), para sempre haver o deslize */
  await ctx.addInitScript(() => {
    const D = Date, desvio = new D(2026, 9, 16, 10, 0).getTime() - D.now();
    window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + desvio])); } static now() { return D.now() + desvio; } };
  });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForTimeout(2500);
  await p.evaluate((gesto) => {
    const s = document.querySelector('.plantao__slider');
    window.__gesto = null;
    (function vigiar() {
      const v = +s.getAttribute('aria-valuenow');
      if (v <= 700) { requestAnimationFrame(vigiar); return; }
      window.__gesto = v;
      const r = s.getBoundingClientRect(), x = r.left + r.width * 0.4, y = r.top + r.height / 2;
      const ponteiro = (tipo, pointerType) => s.dispatchEvent(new PointerEvent(tipo, { bubbles: true, clientX: x, clientY: y, pointerId: pointerType === 'mouse' ? 1 : 7, pointerType, isPrimary: true }));
      if (gesto === 'teclado') s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      else if (gesto === 'rolar') { ponteiro('pointerdown', 'touch'); s.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y + 30, pointerId: 7, pointerType: 'touch' })); ponteiro('pointercancel', 'touch'); }
      else { ponteiro('pointerdown', gesto === 'toque' ? 'touch' : 'mouse'); ponteiro('pointerup', gesto === 'toque' ? 'touch' : 'mouse'); }
    })();
  }, gesto);
  await p.locator('[data-plantao] .plantao__tela').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({ v: window.__gesto, pergunta: !document.querySelector('[data-plantao] [data-msg="pergunta"]').hidden,
    agora: +document.querySelector('.plantao__slider').getAttribute('aria-valuenow') }));
  /* rolar por cima não é mexer na régua: o deslize segue até 23h (1380) */
  const ok = r.v !== null && r.v < 1340 && r.pergunta && (gesto === 'rolar' ? r.agora === 1380 : r.agora < 1370) && !erros.length;
  if (!ok) problemas++;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${gesto} em ${r.v}: parou em ${r.agora}, pergunta ${r.pergunta ? 'chegou' : 'NÃO chegou'}${erros.length ? ', erros: ' + erros.join(' | ') : ''}`);
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
