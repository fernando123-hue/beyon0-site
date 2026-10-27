// sequências de quadros dos momentos principais das peças (para os críticos e para o dono)
// uso: node quadros.mjs <largura>   → q-<largura>-<cena>-<n>.png
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const OUT = process.env.OUT || 'C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/64db34b9-531c-4aa9-b52a-864d8fa9471a/scratchpad/';
const W = +(process.argv[2] || 390);
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const a = await b.newPage({ viewport: { width: W, height: W < 600 ? 844 : 900 }, deviceScaleFactor: W < 600 ? 2 : 1 });
await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
const erros = []; a.on('pageerror', (e) => erros.push(e.message)); a.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
await a.goto('http://127.0.0.1:8897/sites', { waitUntil: 'domcontentloaded', timeout: 90000 });
await a.waitForTimeout(3000);
const recorte = async (sel, pad = 24) => a.evaluate(([s, p]) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.left - p), y: Math.max(0, r.top - p), width: Math.min(innerWidth, r.width + 2 * p), height: Math.min(innerHeight, r.height + 2 * p) }; }, [sel, pad]);
async function serie(cena, sel, tempos, acao) {
  if (acao) await acao();
  let t0 = 0;
  for (let i = 0; i < tempos.length; i++) {
    await a.waitForTimeout(tempos[i] - t0); t0 = tempos[i];
    await a.screenshot({ path: `${OUT}q-${W}-${cena}-${i}.png`, clip: await recorte(sel) });
  }
}
// 1. a entrada da Planta: a luz imprime, o tempo desce pendurado
await a.evaluate(() => { const p = document.querySelector('.planta__palco'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - (innerWidth < 600 ? 120 : 200), behavior: 'instant' }); });
await serie('impressao', '.planta__palco', [180, 420, 700, 1000, 1400]);
await a.waitForTimeout(5500);   // a demonstração termina
// 2. o arraste: desmonta, colunas, texto cinza; solta e imprime de novo
const r = await a.evaluate(() => { const q = document.querySelector('.planta__slider').getBoundingClientRect(); return { l: q.left, r: q.right, y: q.top + q.height / 2 }; });
await a.mouse.move(r.r - 12, r.y); await a.mouse.down();
for (let i = 1; i <= 20; i++) { await a.mouse.move(r.r - 12 - (r.r - r.l) * 0.5 * i / 20, r.y); await a.waitForTimeout(16); }
await a.screenshot({ path: `${OUT}q-${W}-arraste-0.png`, clip: await recorte('.planta__palco') });
for (let i = 1; i <= 20; i++) { await a.mouse.move(r.r - 12 - (r.r - r.l) * (0.5 + 0.4 * i / 20), r.y); await a.waitForTimeout(16); }
await a.screenshot({ path: `${OUT}q-${W}-arraste-1.png`, clip: await recorte('.planta__palco') });
await a.mouse.up();
await serie('reimprime', '.planta__palco', [250, 500, 800]);
// 3. o nome: escolhe clínica, digita, para; a luz atravessa e o nome seca
await a.evaluate(() => { document.querySelector('[data-nicho=saude]').click(); const c = document.querySelector('[data-planta-campo]'); c.value = 'Clínica Sorriso'; c.dispatchEvent(new Event('input')); });
await a.evaluate(() => { const p = document.querySelector('.planta__palco'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - (innerWidth < 600 ? 120 : 200), behavior: 'instant' }); });
await serie('nome', '.planta__palco', [520, 650, 800, 1100]);
const planta = await a.evaluate(() => ({ cls: document.querySelector('[data-planta]').className, prova: document.querySelector('[data-planta-prova]').textContent }));
await a.goto('http://127.0.0.1:8897/automacao', { waitUntil: 'domcontentloaded', timeout: 90000 });
await a.waitForTimeout(3000);
// 4. o Despacho: o boleto da entrada (leque e retorno) e depois "falar com uma pessoa"
await a.evaluate(() => { const p = document.querySelector('.despacho__placa'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - (innerWidth < 600 ? 160 : 240), behavior: 'instant' }); });
await serie('despacho', '.despacho', [250, 600, 1000, 1350, 1700, 2100, 2700]);
await serie('pessoa', '.despacho', [300, 900, 1500, 2700], () => a.evaluate(() => document.querySelector('[data-pedido=relatorio]').click()));
const m = await a.evaluate(() => ({ scroll: document.documentElement.scrollWidth, planta: planta.cls, prova: planta.prova, fim: document.querySelector('[data-despacho-fim]').textContent }));
console.log(W, JSON.stringify(m), erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await b.close();
