// A/B da entrada da peça (impressão + demonstração): sem a peça × com a peça, alternado, N rodadas.
// uso: [GPU=1] node entrada.mjs [rodadas] [largura]
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const GPU = process.env.GPU === '1';
const N = +(process.argv[2] || 2), W = +(process.argv[3] || 1440);
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`, args: GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
async function rodada(semPeca) {
  const a = await b.newPage({ viewport: { width: W, height: W < 600 ? 844 : 900 }, deviceScaleFactor: W < 600 ? 2 : 1 });
  await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  if (semPeca) await a.route('**/js/peca-sites.js', (r) => r.abort());
  await a.goto('http://127.0.0.1:8897/sites', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await a.waitForTimeout(4000);
  await a.evaluate(() => {
    window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => __lt.push(Math.round(e.duration)))).observe({ type: 'longtask' });
    window.__fr = []; let u = performance.now(); (function f(t) { __fr.push(t - u); u = t; if (__fr.length < 2000) requestAnimationFrame(f); })(u);
    const p = document.querySelector('.planta__palco'); scrollTo(0, p.getBoundingClientRect().top + scrollY - (innerWidth < 600 ? 160 : 260));
  });
  await a.waitForTimeout(7500);
  const m = await a.evaluate(() => { const f = __fr.slice(3).sort((x, y) => y - x); return { longas: __lt.length, somaLongas: __lt.reduce((s, x) => s + x, 0), maior: Math.max(0, ...__lt), quadrosAcima33: f.filter((x) => x > 33).length, quadros: f.length }; });
  await a.close();
  return m;
}
for (let i = 0; i < N; i++) {
  for (const sem of [true, false]) console.log((GPU ? 'GPU ' : 'SW  ') + W + (sem ? ' sem peça ' : ' com peça ') + JSON.stringify(await rodada(sem)));
}
await b.close();
