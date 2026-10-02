/* ==========================================================================
   OLHAR — screenshots das páginas em pontos de rolagem, desktop e celular,
   mais erros de console. Para o agente VER o que construiu.
   Uso: BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/olhar.mjs <pasta>
   ========================================================================== */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const EXEC = process.env.CHROMIUM || undefined;
const OUT = process.argv[2] || 'docs/olhar';
const SO = (process.argv[3] || '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const ALVOS = [
  ['/index.html', 'hub', DESKTOP], ['/sites.html', 'sites', DESKTOP], ['/automacao.html', 'automacao', DESKTOP],
  ['/index.html', 'hub-cel', CELULAR], ['/sites.html', 'sites-cel', CELULAR], ['/automacao.html', 'autom-cel', CELULAR],
  ['/index.html', 'hub-320', { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true }], ['/sites.html', 'sites-320', { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true }]
];
/* GPU=1: usa a placa de vídeo de verdade (D3D11 no Windows do dono). Sem
   isso o WebGL é SwiftShader e o AI Core não monta (o porteiro barra WebGL
   por CPU): para VER a esfera nos screenshots, rode com GPU=1. */
const GPU = !!process.env.GPU;
const nav = await chromium.launch({ executablePath: EXEC, args: GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [rota, nome, opts] of ALVOS) {
  if (SO.length && !SO.includes(nome)) continue;
  const ctx = await nav.newContext(opts);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.type() + ': ' + m.text()); });
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  await page.mouse.move(700, 400);
  await page.waitForTimeout(GPU ? 4200 : 2600);   /* com GPU, espera a esfera montar e acender */
  await page.screenshot({ path: `${OUT}/${nome}-0.png` });
  const alt = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const passos = [0.22, 0.45, 0.68, 0.9];
  for (let i = 0; i < passos.length; i++) {
    await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), Math.round(alt * passos[i]));
    await page.waitForTimeout(1400);
    if (opts === DESKTOP) await page.mouse.move(600 + i * 90, 420);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${nome}-${i + 1}.png` });
  }
  const reais = erros.filter(e => !/ERR_CERT|fonts\.googleapis|GPU stall|swiftshader/i.test(e));
  console.log(nome, reais.length ? '\n  ' + reais.join('\n  ') : 'sem erros');
  await ctx.close();
}
await nav.close();
