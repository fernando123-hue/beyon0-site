/* Medição de baseline/final: bytes, requisições, nós DOM, fps, tempo de
   script/estilo/layout (CDP Performance.getMetrics), LCP, CLS, long tasks.
   Uso: node medir.mjs <rotulo>   (BASE e CHROMIUM por env) */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const EXEC = process.env.CHROMIUM;
const ROTULO = process.argv[2] || 'medida';
const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const ALVOS = [
  ['/index.html', 'hub', DESKTOP], ['/sites.html', 'sites', DESKTOP], ['/automacao.html', 'automacao', DESKTOP],
  ['/index.html', 'hub-cel', CELULAR], ['/sites.html', 'sites-cel', CELULAR], ['/automacao.html', 'autom-cel', CELULAR]
];

const nav = await chromium.launch({ executablePath: EXEC, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const saida = [];
for (const [rota, nome, opts] of ALVOS) {
  const ctx = await nav.newContext(opts);
  const page = await ctx.newPage();
  const reqs = []; const erros = [];
  page.on('response', async r => { try { const h = r.headers(); reqs.push({ url: r.url(), status: r.status(), len: +(h['content-length'] || 0) }); } catch {} });
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0; window.__long = 0;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2500);
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  // fps parado por 3s, depois rolando por 3s
  const fpsParado = await page.evaluate(() => new Promise(ok => { let n = 0; const t0 = performance.now(); (function v() { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(v) : ok(+(n / 3).toFixed(1)); })(); }));
  const fpsRolando = await page.evaluate(() => new Promise(ok => {
    let n = 0; const t0 = performance.now(); const alc = document.documentElement.scrollHeight - innerHeight;
    (function v() { n++; const t = performance.now() - t0; scrollTo(0, alc * Math.min(1, t / 3000)); t < 3000 ? requestAnimationFrame(v) : ok(+(n / 3).toFixed(1)); })();
  }));
  await page.waitForTimeout(300);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const dom = await page.evaluate(() => ({
    nos: document.getElementsByTagName('*').length,
    lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(4), long: Math.round(window.__long),
    dcl: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd),
    load: Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bytesOrigem: performance.getEntriesByType('resource').filter(r => new URL(r.name).origin === location.origin).reduce((s, r) => s + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0].transferSize || 0),
    reqOrigem: performance.getEntriesByType('resource').filter(r => new URL(r.name).origin === location.origin).length + 1,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null
  }));
  const r = {
    nome, ...dom, fpsParado, fpsRolando,
    scriptMs6s: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
    estiloMs6s: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
    layoutMs6s: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
    recalcs6s: Math.round(m1.RecalcStyleCount - m0.RecalcStyleCount),
    layouts6s: Math.round(m1.LayoutCount - m0.LayoutCount),
    erros: erros.filter(e => !/ERR_CERT|fonts\.googleapis|GPU stall|swiftshader/i.test(e))
  };
  saida.push(r);
  console.log(JSON.stringify(r));
  await ctx.close();
}
await nav.close();
writeFileSync(new URL('./medida-' + ROTULO + '.json', import.meta.url), JSON.stringify(saida, null, 2));
