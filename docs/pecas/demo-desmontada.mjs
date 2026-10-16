/* J2 da crítica da Planta (aprovado pelo dono, 2026-10-16): a demonstração de larguras anda DESMONTADA (texto cinza e a
   grade, o mesmo estado do arraste) e reimprime ao pousar; impressa, no meio de um deslize a foto passava por cima do
   título. Amostra a cada quadro: com a moldura mudando de largura, o site tem de estar desmontado; pousada, impresso.
   Cortada no meio (tecla na régua, ou o cartão saindo da tela), volta impressa na hora.
   Servidor: node docs/servidor.mjs . 8897. Uso: BASE=http://127.0.0.1:8897 node docs/pecas/demo-desmontada.mjs */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8897';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
const falha = (m) => { problemas++; console.log('FALHA ' + m); };
for (const caso of ['inteira-390', 'inteira-1440', 'tecla', 'saiu']) {
  const w = caso === 'inteira-1440' ? 1440 : 390;
  const ctx = await b.newContext({ viewport: { width: w, height: w < 721 ? 844 : 900 }, isMobile: w < 721, hasTouch: w < 721 });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async (caso) => {
    const raiz = document.querySelector('.planta'), m = raiz.querySelector('.planta__moldura'), palco = raiz.querySelector('.planta__palco');
    palco.scrollIntoView({ block: 'center', behavior: 'instant' });
    const amostras = [];
    const t0 = performance.now();
    let cortou = false, depoisDoCorte = null;
    await new Promise((fim) => {
      (function olhar() {
        const t = performance.now() - t0;
        amostras.push({ t: Math.round(t), w: m.offsetWidth, tracando: raiz.classList.contains('is-tracando'), impressa: raiz.classList.contains('is-impressa') });
        /* o corte: no meio do 1º deslize (a moldura entre 1280 e 768) */
        if (!cortou && caso !== 'inteira-390' && caso !== 'inteira-1440' && m.offsetWidth < 1200 && m.offsetWidth > 800) {
          cortou = true;
          if (caso === 'tecla') raiz.querySelector('.planta__slider').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          else window.scrollTo({ top: 0, behavior: 'instant' });
          setTimeout(() => { depoisDoCorte = { tracando: raiz.classList.contains('is-tracando'), impressa: raiz.classList.contains('is-impressa'), w: m.offsetWidth }; fim(); }, 700);
          return;
        }
        if (t > 9000) return fim();
        requestAnimationFrame(olhar);
      })();
    });
    return { amostras, cortou, depoisDoCorte };
  }, caso);
  const nome = `${caso}`;
  const antes = problemas;
  if (caso.startsWith('inteira')) {
    const larguras = r.amostras.map((a) => a.w), inicial = larguras[0], final = larguras[larguras.length - 1];
    const mudando = r.amostras.filter((a, i) => i > 0 && a.w !== r.amostras[i - 1].w);
    const impressasMudando = mudando.filter((a) => !a.tracando);
    if (mudando.length < 5) falha(`${nome}: a demonstração não andou (${mudando.length} quadros mudando de largura)`);
    if (impressasMudando.length) falha(`${nome}: ${impressasMudando.length} de ${mudando.length} quadros mudando de largura com o site impresso (ex.: t=${impressasMudando[0].t} ms, w=${impressasMudando[0].w})`);
    const ult = r.amostras[r.amostras.length - 1];
    if (ult.tracando || !ult.impressa) falha(`${nome}: pousou ${ult.tracando ? 'desmontado' : 'sem imprimir'} (w=${ult.w})`);
    if (problemas === antes) console.log(`OK    ${nome}: ${inicial} → ${final}, ${mudando.length} quadros mudando, todos desmontados; pousou impresso`);
  } else {
    if (!r.cortou) falha(`${nome}: não chegou a cortar a demonstração`);
    else if (r.depoisDoCorte.tracando || !r.depoisDoCorte.impressa) falha(`${nome}: depois do corte ficou ${r.depoisDoCorte.tracando ? 'desmontado' : 'sem imprimir'}`);
    if (problemas === antes) console.log(`OK    ${nome}: cortada em w≈1000, voltou impressa (w=${r.depoisDoCorte.w})`);
  }
  if (erros.length) falha(`${nome}: erros ${erros.join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
