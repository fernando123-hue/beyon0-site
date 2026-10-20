// rastro da linha do tempo (GPU + CPU 4×, 390 px) de cada peça: quanto tempo vai em estilo, layout, pintura,
// e quais tarefas longas aparecem com o quê dentro. uso: node rastro.mjs [com|sem]
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const SEM = process.argv[2] === 'sem';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const a = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
if (SEM) await a.route('**/js/peca-*.js', (r) => r.abort());
await a.goto('http://127.0.0.1:8897/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await a.waitForTimeout(6000);
const cdp = await a.context().newCDPSession(a);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
for (const [nome, sel] of [['planta', '.planta__palco'], ['despacho', '.despacho__placa'], ['plantao', '.plantao__tela']]) {
  const eventos = [];
  cdp.on('Tracing.dataCollected', (d) => eventos.push(...d.value));
  const fim = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await a.evaluate((s) => { const el = document.querySelector(s) || document.querySelector('#frentes'); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 160, behavior: 'instant' }); }, sel);
  await a.waitForTimeout(7000);
  await cdp.send('Tracing.end'); await fim;
  cdp.removeAllListeners('Tracing.dataCollected');
  const soma = {}, longas = [];
  for (const e of eventos) {
    if (e.ph !== 'X' || !e.dur) continue;
    const ms = e.dur / 1000;
    if (['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame', 'HitTest', 'ParseHTML', 'IntersectionObserverController::computeIntersections', 'UpdateLayer', 'Commit', 'ScrollLayer'].includes(e.name)) soma[e.name] = (soma[e.name] || 0) + ms;
    if (e.name === 'RunTask' && ms > 50) longas.push(Math.round(ms));
  }
  /* dentro de cada tarefa longa: os filhos diretos mais pesados */
  const tarefas = eventos.filter((e) => e.ph === 'X' && e.name === 'RunTask' && e.dur > 50000);
  const detalhe = tarefas.slice(0, 6).map((t) => {
    const dentro = {};
    for (const e of eventos) if (e.ph === 'X' && e.tid === t.tid && e.ts >= t.ts && e.ts + (e.dur || 0) <= t.ts + t.dur && e !== t && ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'FunctionCall', 'TimerFire', 'FireAnimationFrame', 'Layerize', 'IntersectionObserverController::computeIntersections'].includes(e.name)) {
      const k = e.name + (e.args && e.args.data && e.args.data.url ? '@' + e.args.data.url.split('/').pop() + ':' + e.args.data.lineNumber : '');
      dentro[k] = (dentro[k] || 0) + e.dur / 1000;
    }
    return Math.round(t.dur / 1000) + 'ms: ' + Object.entries(dentro).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', ');
  });
  console.log('== ' + (SEM ? 'SEM ' : 'COM ') + nome + ' longas ' + JSON.stringify(longas) + '\n  soma: ' + Object.entries(soma).sort((x, y) => y[1] - x[1]).map(([k, v]) => k + ' ' + v.toFixed(0)).join(' · ') + '\n  ' + detalhe.join('\n  '));
}
await b.close();
