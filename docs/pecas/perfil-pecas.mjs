// perfil de CPU (GPU + CPU 4×, 390 px) da entrada e de uma interação de cada peça: onde vai o tempo
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const a = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
await a.goto('http://127.0.0.1:8897/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await a.waitForTimeout(5000);
const cdp = await a.context().newCDPSession(a);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
for (const [nome, sel, acao] of [
  ['planta', '.planta__palco', () => a.evaluate(() => { document.querySelector('[data-nicho=clinica]').click(); const c = document.querySelector('[data-planta-campo]'); c.value = 'Clínica Sorriso'; c.dispatchEvent(new Event('input')); })],
  ['despacho', '.despacho__placa', () => a.evaluate(() => document.querySelector('[data-pedido=relatorio]').click())],
  ['plantao', '.plantao__tela', () => a.evaluate(() => document.querySelector('[data-pergunta=pessoa]').click())]
]) {
  await cdp.send('Profiler.start');
  await a.evaluate((s) => { const el = document.querySelector(s); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 160, behavior: 'instant' }); }, sel);
  await a.waitForTimeout(6500); await acao(); await a.waitForTimeout(3500);
  const { profile } = await cdp.send('Profiler.stop');
  const dt = {}; const porId = new Map(profile.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < profile.samples.length; i++) {
    const f = porId.get(profile.samples[i]).callFrame;
    if (f.functionName === '(idle)') continue;
    const k = (f.functionName || '(anônima)') + ' ' + (f.url.split('/').pop() || '') + ':' + f.lineNumber;
    dt[k] = (dt[k] || 0) + (profile.timeDeltas[i] || 0) / 1000;
  }
  console.log('== ' + nome + '\n' + Object.entries(dt).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => v.toFixed(0) + ' ms  ' + k).join('\n'));
}
await b.close();
