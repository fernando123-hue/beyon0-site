// O Plantão: entrada, madrugada (arrasta até 3h), "falar com uma pessoa", e o nome que vem da Planta
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const OUT = process.env.OUT || 'C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/64db34b9-531c-4aa9-b52a-864d8fa9471a/scratchpad/';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const W of (process.argv[2] || '390,1440').split(',').map(Number)) {
  const a = await b.newPage({ viewport: { width: W, height: W < 600 ? 844 : 900 }, deviceScaleFactor: W < 600 ? 2 : 1 });
  await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  const erros = []; a.on('pageerror', (e) => erros.push(e.message)); a.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  await a.goto('http://127.0.0.1:8897/automacao', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await a.waitForTimeout(3000);
  const recorte = async () => a.evaluate(() => { const r = document.querySelector('.plantao').getBoundingClientRect(); return { x: Math.max(0, r.left - 16), y: Math.max(0, r.top - 16), width: Math.min(innerWidth - Math.max(0, r.left - 16), r.width + 32), height: Math.min(innerHeight, r.height + 32) }; });
  const foco = () => a.evaluate(() => { const t = document.querySelector('.plantao'); scrollTo({ top: t.getBoundingClientRect().top + scrollY - (innerWidth < 600 ? 80 : 100), behavior: 'instant' }); });
  await foco();
  await a.waitForTimeout(2200);
  await a.screenshot({ path: `${OUT}p-${W}-entrada.png`, clip: await recorte() });
  // arrasta até 3h
  const s = await a.evaluate(() => { const q = document.querySelector('.plantao__slider').getBoundingClientRect(); return { l: q.left, w: q.width, y: q.top + q.height / 2 }; });
  const xAtual = await a.evaluate(() => { const q = document.querySelector('.plantao__slider'); return q.getBoundingClientRect().left + (+q.getAttribute('aria-valuenow')) / 1439 * q.clientWidth; });
  await a.mouse.move(xAtual, s.y); await a.mouse.down();
  for (let i = 1; i <= 15; i++) { await a.mouse.move(xAtual + (s.l + s.w * 180 / 1439 - xAtual) * i / 15, s.y); await a.waitForTimeout(16); }
  await a.mouse.up();
  await a.evaluate(() => document.querySelector('[data-pergunta=pessoa]').click());
  await a.waitForTimeout(1400);
  await a.screenshot({ path: `${OUT}p-${W}-madrugada.png`, clip: await recorte() });
  // o nome vem da Planta
  await a.evaluate(() => document.dispatchEvent(new CustomEvent('bz:negocio', { detail: { nome: 'Clínica Sorriso', nicho: 'saude' } })));
  await foco();
  await a.waitForTimeout(300);
  await a.evaluate(() => document.querySelector('[data-pergunta="2"]').click());
  await a.waitForTimeout(1400);
  await a.screenshot({ path: `${OUT}p-${W}-clinica.png`, clip: await recorte() });
  const m = await a.evaluate(() => ({ scroll: document.documentElement.scrollWidth, nome: document.querySelector('[data-plantao-nome]').textContent, hora: document.querySelector('[data-plantao-hora]').textContent, sug: [...document.querySelectorAll('[data-pergunta]')].map((x) => x.textContent) }));
  console.log(W, JSON.stringify(m), erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
  await a.close();
}
await b.close();
