/* ==========================================================================
   ACESSIBILIDADE — três contratos que a reconstrução promete:
   1. SEM JS: todo conteúdo visível (html.js nunca entra), links do WhatsApp
      ausentes mas o conteúdo inteiro legível.
   2. MOVIMENTO REDUZIDO: nada escondido, canvas desligado, zero tweens.
   3. TECLADO: Tab percorre nav, índice/cartões e CTA; o foco é visível
      (outline) e o menu do celular abre/fecha por teclado e Escape.
   Uso: BASE=... CHROMIUM=... node docs/acessibilidade.mjs
   ========================================================================== */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const EXEC = process.env.CHROMIUM || undefined;
const nav = await chromium.launch({ executablePath: EXEC, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };
const escondidos = page => page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, p, .reveal, .btn')].filter(e => { const cs = getComputedStyle(e); return cs.opacity === '0' || cs.visibility === 'hidden'; }).length);

for (const rota of ['/index.html', '/sites.html', '/automacao.html']) {
  /* 1. sem JS */
  let ctx = await nav.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage();
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  ok((await escondidos(page)) === 0, rota + ' sem JS: nenhum conteúdo escondido');
  ok(await page.evaluate(() => !document.documentElement.classList.contains('js')), rota + ' sem JS: html.js ausente');
  await ctx.close();

  /* 2. movimento reduzido */
  ctx = await nav.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(800);
  ok((await escondidos(page)) === 0, rota + ' reduzido: nenhum conteúdo escondido');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('fx')).display === 'none'), rota + ' reduzido: canvas desligado');
  ok(await page.evaluate(() => window.BEYON && window.BEYON.reduced === true), rota + ' reduzido: organismo em modo reduzido');
  await ctx.close();

  /* 3. teclado */
  ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2500);
  const vistos = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    vistos.push(await page.evaluate(() => {
      const a = document.activeElement; if (!a || a === document.body) return null;
      const cs = getComputedStyle(a); const r = a.getBoundingClientRect();
      return { tag: a.tagName, txt: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 24), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, naTela: r.top >= 0 && r.bottom <= innerHeight };
    }));
  }
  const focaveis = vistos.filter(Boolean);
  ok(focaveis.length >= 10, rota + ' teclado: ' + focaveis.length + ' alvos em 14 Tabs');
  ok(focaveis.every(v => v.outline), rota + ' teclado: foco visível em todos (' + focaveis.filter(v => !v.outline).map(v => v.txt).join(', ') + ')');
  await ctx.close();
}

/* 3b. menu do celular por teclado */
const ctxCel = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const cel = await ctxCel.newPage();
await cel.goto(BASE + '/index.html', { waitUntil: 'load' });
await cel.waitForTimeout(2000);
await cel.focus('.nav__toggle');
await cel.keyboard.press('Enter');
await cel.waitForTimeout(400);
ok(await cel.evaluate(() => document.getElementById('nav').classList.contains('is-open') && document.querySelector('.nav__toggle').getAttribute('aria-expanded') === 'true'), 'celular: menu abre por teclado');
await cel.keyboard.press('Escape');
await cel.waitForTimeout(400);
ok(await cel.evaluate(() => !document.getElementById('nav').classList.contains('is-open') && document.activeElement === document.querySelector('.nav__toggle')), 'celular: Escape fecha e devolve o foco');
await ctxCel.close();

await nav.close();
console.log(falhou ? '\nAlguma coisa falhou.' : '\nTudo certo.');
process.exit(falhou ? 1 : 0);
