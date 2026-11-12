// Tarefas longas do laboratório da planta viva v2, com e sem a planta (A/B na mesma sessão): node docs/lab-planta-v2-medir.mjs [nicho] [rodadas]
// Celular: 390 x 844, CPU 4x mais lenta (CDP Emulation.setCPUThrottlingRate); computador: 1280 x 800, sem freio. O roteiro roda sozinho
// (?auto=1&ritmo=2) do primeiro turno à consagração. Coleta cada long-animation-frame (LoAF) acima de 50 ms com os scripts que o causaram
// (sourceURL): o que vem de lab-planta-v2-esboco/consagra, planta-desenho/layout/pecas conta como DA PLANTA. Também rolagem lateral no fim.
// Antes de medir, confira a carga da máquina (Get-CimInstance Win32_Processor LoadPercentage): com a CPU cheia, o número não vale.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8917';
const nicho = process.argv[2] || 'clinica', rodadas = Number(process.argv[3] || 1);
const DA_PLANTA = /lab-planta-v2-(esboco|consagra|cresce)|planta-(desenho|layout|pecas)|orcamento-planta-forma/;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

async function rodada(formato, semPlanta) {
  const cel = formato === 'cel';
  const ctx = await b.newContext({ viewport: cel ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: cel ? 2 : 1, isMobile: cel, hasTouch: cel });
  await ctx.addInitScript(() => {
    window.__loaf = [];
    try {
      new PerformanceObserver(l => l.getEntries().forEach(e => window.__loaf.push({
        t: Math.round(e.startTime), d: Math.round(e.duration), bloqueio: Math.round(e.blockingDuration || 0),
        scripts: (e.scripts || []).map(s => ({ url: (s.sourceURL || '').split('/').pop(), fn: s.sourceFunctionName || '', d: Math.round(s.duration), inv: s.invoker || '' }))
      }))).observe({ type: 'long-animation-frame', buffered: true });
    } catch (x) { window.__loaf = null; }
  });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  if (cel) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await pg.goto(`${BASE}/docs/lab-planta-v2.html?nicho=${nicho}&captura=1&auto=1&ritmo=2${semPlanta ? '&semplanta=1' : ''}`, { timeout: 180000 });
  await pg.waitForFunction(() => window.LAB && window.LAB.estado.fim, null, { timeout: 400000, polling: 500 });
  await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => ({ loaf: window.__loaf, lateral: document.documentElement.scrollWidth - innerWidth, carga: performance.getEntriesByType('navigation')[0].loadEventEnd }));
  await ctx.close();
  const longas = (r.loaf || []).filter(e => e.d > 50);
  const daPlanta = longas.filter(e => e.scripts.some(s => DA_PLANTA.test(s.url)));
  return { formato, semPlanta, lateral: r.lateral, loaf_suportado: r.loaf !== null, longas: longas.length, maior: Math.max(0, ...longas.map(e => e.d)),
    da_planta: daPlanta.map(e => ({ t: e.t, d: e.d, scripts: e.scripts.filter(s => s.d > 4).map(s => s.url + ':' + s.fn + ' ' + s.d + 'ms') })),
    outras: longas.filter(e => daPlanta.indexOf(e) < 0).map(e => ({ t: e.t, d: e.d, scripts: e.scripts.filter(s => s.d > 4).map(s => s.url + ':' + s.fn + ' ' + s.d + 'ms') })) };
}

for (let i = 0; i < rodadas; i++) {
  for (const formato of (process.env.FORMATOS || 'cel,pc').split(',')) {
    for (const sem of [true, false]) console.log(JSON.stringify(await rodada(formato, sem)));
  }
}
await b.close();
