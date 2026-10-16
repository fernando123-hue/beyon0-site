// rolagem lateral e erros com as peças no pior caso (nome de 28 caracteres, todos os nichos e pedidos) + fotos
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const OUT = process.env.OUT || 'C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/64db34b9-531c-4aa9-b52a-864d8fa9471a/scratchpad/';
const ROT = process.argv[2] || 'c';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
for (const w of [320, 360, 390, 768, 1440]) {
  const a = await b.newPage({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1 });
  await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  const erros = []; a.on('pageerror', (e) => erros.push(e.message)); a.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  await a.goto('http://127.0.0.1:8897/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await a.waitForTimeout(2500);
  const larguras = [];
  const medir = async (rot) => larguras.push(rot + ':' + await a.evaluate(() => document.documentElement.scrollWidth));
  // a Planta: entra, espera a demo, nicho + nome longo
  await a.evaluate(() => { const p = document.querySelector('.planta__palco'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - 140, behavior: 'instant' }); });
  await a.waitForTimeout(6500);
  await medir('planta');
  if (w === 390 || w === 1440) await a.screenshot({ path: `${OUT}${ROT}-${w}-planta.png` });
  for (const ni of ['servicos', 'comercio', 'saude', 'organizacao']) {
    await a.evaluate((ni) => { document.querySelector(`[data-nicho=${ni}]`).click(); const c = document.querySelector('[data-planta-campo]'); c.value = 'Associação dos Moradores Vila'; c.dispatchEvent(new Event('input')); }, ni);
    await a.waitForTimeout(200);
    await medir(ni);
  }
  await a.evaluate(() => { document.querySelector('[data-nicho=saude]').click(); const c = document.querySelector('[data-planta-campo]'); c.value = 'Clínica Sorriso'; c.dispatchEvent(new Event('input')); });
  await a.waitForTimeout(1400);
  if (w === 390 || w === 1440) {
    await a.evaluate(() => { const p = document.querySelector('.planta__palco'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - 140, behavior: 'instant' }); });
    await a.waitForTimeout(300);
    await a.screenshot({ path: `${OUT}${ROT}-${w}-planta-nome.png` });
  }
  // o Despacho: entra (roda o boleto), depois cada pedido
  await a.evaluate(() => { const p = document.querySelector('.despacho__placa'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - 200, behavior: 'instant' }); });
  await a.waitForTimeout(4500);
  await medir('despacho');
  if (w === 390 || w === 1440) await a.screenshot({ path: `${OUT}${ROT}-${w}-despacho.png` });
  for (const pe of ['orcamento', 'cadastro', 'relatorio']) {
    await a.evaluate((pe) => document.querySelector(`[data-pedido=${pe}]`).click(), pe);
    await a.waitForTimeout(3600);
    await medir(pe);
  }
  if (w === 390 || w === 1440) await a.screenshot({ path: `${OUT}${ROT}-${w}-despacho-pessoa.png` });
  const ruim = larguras.filter((x) => +x.split(':')[1] > w);
  console.log(w, ruim.length ? 'ROLAGEM LATERAL ' + ruim.join(' ') : 'sem rolagem lateral', erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
  await a.close();
}
await b.close();
