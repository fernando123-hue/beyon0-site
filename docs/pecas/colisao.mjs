// Mede se o tempo da Planta (.planta__tempo) encosta na cota (.planta__medida) ou sai da moldura certa,
// da entrada até o fim da demonstração. Uso: node colisao.mjs [reduzido]
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');

const REDUZIDO = process.argv[2] === 'reduzido';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });

for (const w of [320, 360, 390, 414, 768, 1024, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1, reducedMotion: REDUZIDO ? 'reduce' : 'no-preference' });
  const a = await ctx.newPage();
  await a.goto('http://127.0.0.1:8897/', { waitUntil: 'load', timeout: 90000 });   /* 1ª carga: a GPU sobe (ignorar) */
  await a.goto('http://127.0.0.1:8897/', { waitUntil: 'load', timeout: 90000 });
  await a.waitForTimeout(1500);
  const r = await a.evaluate(async () => {
    const t = document.querySelector('.planta__tempo'), m = document.querySelector('.planta__medida'), mol = document.querySelector('.planta__moldura');
    const p = document.querySelector('.planta__palco');
    scrollTo({ top: p.getBoundingClientRect().top + scrollY - 140, behavior: 'instant' });
    const amostras = [], t0 = performance.now();
    await new Promise((res) => { const id = setInterval(() => {
      const ms = Math.round(performance.now() - t0);
      if (!t.hidden && +getComputedStyle(t).opacity > 0.05) {
        const c = t.getBoundingClientRect(), k = m.getBoundingClientRect(), f = mol.getBoundingClientRect();
        const sob = (x, y) => { const ox = Math.min(x.right, y.right) - Math.max(x.left, y.left), oy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top); return ox > 0 && oy > 0 ? [Math.round(ox), Math.round(oy)] : 0; };
        const cotaVisivel = +getComputedStyle(m).opacity > 0.05 && !m.hidden;
        amostras.push({ ms, cota: cotaVisivel ? sob(c, k) : 0, moldura: sob(c, f) });
      }
      if (ms > 5000) { clearInterval(id); res(); }
    }, 25); });
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
    return { lcp: lcp ? Math.round(lcp.startTime) : null, visivel: amostras.length, cota: amostras.filter((x) => x.cota).map((x) => [x.ms, ...x.cota]), moldura: amostras.filter((x) => x.moldura).map((x) => [x.ms, ...x.moldura]) };
  });
  const resumo = (l) => (l.length ? `${l.length} quadros, ${l[0][0]}–${l.at(-1)[0]} ms, até ${Math.max(...l.map((x) => x[1]))}×${Math.max(...l.map((x) => x[2]))} px` : 'nenhuma');
  console.log(`${w}px  lcp ${r.lcp} ms  chip visível ${r.visivel} amostras  | sobre a cota: ${resumo(r.cota)} | sobre a moldura: ${resumo(r.moldura)}`);
  await ctx.close();
}
await b.close();
