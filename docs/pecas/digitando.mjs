/* O campo do nome no celular: com o foco, o palco gruda no topo (e volta à altura quadrada: fora da digitação ele é mais
   alto, J5) e o campo tem de ficar à vista logo abaixo dele, nunca por baixo do palco grudado.
   Servidor: node docs/servidor.mjs . 8897. Uso: BASE=http://127.0.0.1:8897 node docs/pecas/digitando.mjs */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8897';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 240000 });
  await p.locator('.planta__palco').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.waitForTimeout(7000);
  await p.locator('.planta__nome input').focus();
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const pa = document.querySelector('.planta__palco').getBoundingClientRect(), c = document.querySelector('.planta__nome input').getBoundingClientRect();
    return { palcoFim: Math.round(pa.bottom), campoTopo: Math.round(c.top), campoFim: Math.round(c.bottom), alto: innerHeight, digitando: document.querySelector('.planta').classList.contains('is-digitando') };
  });
  const ok = r.digitando && r.campoTopo >= r.palcoFim && r.campoFim <= r.alto;
  if (!ok) problemas++;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${w}×${h}: palco até ${r.palcoFim}, campo de ${r.campoTopo} a ${r.campoFim} (tela ${r.alto})${r.digitando ? '' : ', sem is-digitando'}`);
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
