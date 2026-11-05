/* Quadros da PLANTA VIVA (docs/lab-planta.html, módulos reais): fotografa a faixa em três momentos por nicho e largura.
     final   movimento reduzido: o quadro único e completo (é o que o visitante com "menos movimento" e o que fica ao fim da entrada)
     entrada a animação de verdade, em instantes de relógio (a luz percorrendo; o headless desenha por software, serve para OLHAR)
     ajuste  "Quero ajustar algo": o plano novo, só o id novo marcado, no quadro final
   Uso: BASE=http://127.0.0.1:8917 CHROMIUM="%LOCALAPPDATA%/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe" \
        node docs/lab-planta-quadros.mjs <pasta> [larguras, ex. 390,320,768,1280] [instantes em s, ex. 1.2,3,5,7]
   Saída: <pasta>/<tipo>-<nicho>-<largura>[-t<s>].png e um resumo por caso (erros de console, rolagem lateral, nós do quadro). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8917';
const PASTA = process.argv[2] || 'quadros-planta';
const LARGS = (process.argv[3] || '390,320,768,1280').split(',').map(Number);
const INSTANTES = (process.argv[4] || '1.2,3,5,7.5').split(',').map(Number);
const NICHOS = ['clinica', 'embalagens', 'loja'];
const PAGINA = process.env.PAGINA || '/docs/lab-planta.html';
mkdirSync(PASTA, { recursive: true });
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

for (const larg of LARGS) {
  const alt = larg < 700 ? 900 : 900;
  for (const nicho of NICHOS) {
    const erros = [];
    const tela = (p) => { p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || /\[planta\]|\[beyon\]/.test(m.text())) erros.push(m.text()); }); };

    /* final e ajuste: movimento reduzido */
    const c1 = await nav.newContext({ viewport: { width: larg, height: alt }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const p1 = await c1.newPage(); tela(p1);
    await p1.goto(`${BASE}${PAGINA}?captura=1&nicho=${nicho}`, { waitUntil: 'load' });
    await p1.evaluate(() => document.fonts.ready);
    await espera(400);
    await p1.locator('.plv').screenshot({ path: `${PASTA}/final-${nicho}-${larg}.png` });
    const info = await p1.evaluate(() => ({ nos: document.querySelectorAll('.plv-quadro *').length, rolagem: document.documentElement.scrollWidth, larg: innerWidth, altQuadro: document.querySelector('.plv-quadro').getBoundingClientRect().height, montagemMs: window.PLANTA_LAB.ultima.ms }));
    await p1.click('.plv-acoes .plv-btn:nth-child(2)');
    await espera(500);
    await p1.locator('.plv').screenshot({ path: `${PASTA}/ajuste-${nicho}-${larg}.png` });
    await c1.close();

    /* a entrada de verdade, em instantes de relógio */
    const c2 = await nav.newContext({ viewport: { width: larg, height: alt }, deviceScaleFactor: 1 });
    const p2 = await c2.newPage(); tela(p2);
    await p2.goto(`${BASE}${PAGINA}?captura=1&nicho=${nicho}`, { waitUntil: 'load' });
    const t0 = Date.now();
    for (const t of INSTANTES) {
      const falta = t * 1000 - (Date.now() - t0);
      if (falta > 0) await espera(falta);
      await p2.locator('.plv-quadro').screenshot({ path: `${PASTA}/entrada-${nicho}-${larg}-t${String(t).replace('.', '_')}.png` });
    }
    await c2.close();
    console.log(`${nicho} ${larg}: quadro ${info.altQuadro}px, nós ${info.nos}, montagem ${info.montagemMs.toFixed(1)} ms, rolagem lateral ${info.rolagem > info.larg ? 'SIM (' + info.rolagem + ')' : 'não'}`, erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
  }
}
await nav.close();
