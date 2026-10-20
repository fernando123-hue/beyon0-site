// custo em REPOUSO da árvore de camadas (GPU + CPU 4×, 390 px): a página parada nos serviços, depois de as peças
// entrarem. Variantes: tudo; sem cada peça; com as animações terminadas canceladas; sem will-change no palco.
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const VARIANTES = {
  base: null,
  'sem planta': () => document.querySelector('.planta').style.display = 'none',
  'sem despacho': () => document.querySelector('.despacho').style.display = 'none',
  'sem plantao': () => document.querySelector('.plantao').style.display = 'none',
  'sem as três': () => document.querySelectorAll('.planta, .despacho, .plantao').forEach((e) => e.style.display = 'none'),
  'animações terminadas canceladas': () => document.getAnimations().forEach((an) => { if (an.playState === 'finished') an.cancel(); }),
  'sem will-change no palco': () => { const p = document.querySelector('.planta__palco'); p.style.willChange = 'auto'; }
};
async function medir(nome, fn) {
  const a = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  await a.goto('http://127.0.0.1:8897/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await a.waitForTimeout(5000);
  // passa pelas três peças (entram, demonstram) e para na do meio
  for (const s of ['.planta__palco', '.despacho__placa', '.plantao__tela']) { await a.evaluate((s) => { const el = document.querySelector(s); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 160, behavior: 'instant' }); }, s); await a.waitForTimeout(6500); }
  await a.evaluate(() => { const el = document.querySelector('.despacho__placa'); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 160, behavior: 'instant' }); });
  if (fn) await a.evaluate(fn);
  await a.waitForTimeout(1500);
  const cdp = await a.context().newCDPSession(a);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const eventos = [];
  cdp.on('Tracing.dataCollected', (d) => eventos.push(...d.value));
  const fim = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await a.waitForTimeout(4000);
  await cdp.send('Tracing.end'); await fim;
  const soma = {}; let longas = 0;
  for (const e of eventos) {
    if (e.ph !== 'X' || !e.dur) continue;
    if (['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'Commit'].includes(e.name)) soma[e.name] = (soma[e.name] || 0) + e.dur / 1000;
    if (e.name === 'RunTask' && e.dur > 50000) longas++;
  }
  const anims = await a.evaluate(() => document.getAnimations().map((an) => (an.effect && an.effect.target ? (an.effect.target.className.baseVal ?? an.effect.target.className) : '?') + ':' + an.playState).slice(0, 12));
  console.log(nome.padEnd(32) + ' longas ' + longas + ' | ' + Object.entries(soma).map(([k, v]) => k + ' ' + v.toFixed(0)).join(' · ') + (nome === 'base' ? '\n   animações: ' + anims.join(', ') : ''));
  await a.close();
}
for (const [nome, fn] of Object.entries(VARIANTES)) await medir(nome, fn);
await b.close();
