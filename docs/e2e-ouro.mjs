/* O OURO ENTRE PÁGINAS num Chromium de verdade (2026-11-07; docs/restructure/OURO-2026-10-06.md, "Entre páginas").
     node docs/servidor.mjs . 8899
     CHROMIUM=... node docs/e2e-ouro.mjs [8899] [--larguras 390,1280]
   Acende o ouro no Início (BEYON.ouro.acender()), atravessa para /sites, /automacao e /orcamento pelos links do site (a
   travessia de js/passagem.js) e volta pelo histórico. Em cada chegada: html.is-ouro já no 1º quadro (o 1º rAF, antes
   da 1ª pintura) e no DOMContentLoaded, o reinado retomado (não a carga), o tempo que falta diminuindo; o resfriamento
   na página onde o prazo vence; privacidade (sem o ouro.js) sai em silêncio no prazo; movimento reduzido: nada de ouro.
   Capturas em docs/olhar-ouro/ (no .gitignore pelo padrão das pastas docs/olhar-*): ABRA E OLHE. Nenhum erro de console. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i < 0 ? padrao : (process.argv[i + 1] || ''); };
const porta = process.argv.slice(2).find((a) => /^\d+$/.test(a)) || '8899';
const BASE = 'http://127.0.0.1:' + porta;
const LARGURAS = arg('larguras', '390,1280').split(',').map(Number);
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const PASTA = new URL('./olhar-ouro/', import.meta.url);
await mkdir(PASTA, { recursive: true });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* o que a página tinha no <html> no 1º quadro (o 1º rAF roda antes da 1ª pintura) e no DOMContentLoaded */
const ESPIAO = () => {
  window.__cl = {};
  requestAnimationFrame(() => { window.__cl.q1 = document.documentElement.className; });
  document.addEventListener('DOMContentLoaded', () => { window.__cl.dcl = document.documentElement.className; });
};
const nav = await chromium.launch({ executablePath: EXEC });

async function contexto(larg, extra = {}) {
  const movel = larg < 500;
  const ctx = await nav.newContext({ viewport: { width: larg, height: movel ? 844 : 800 }, isMobile: movel, hasTouch: movel, ...extra });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /beyon/.test(m.text()))) erros.push(m.text()); });
  await page.addInitScript(ESPIAO);
  return { ctx, page, erros };
}
const estado = (page) => page.evaluate(() => ({
  estado: window.BEYON && BEYON.ouro && BEYON.ouro.estado, k: window.BEYON && BEYON.ouro && BEYON.ouro.k,
  resta: window.BEYON && BEYON.ouro && BEYON.ouro.resta ? BEYON.ouro.resta() : null,
  ouro: document.documentElement.classList.contains('is-ouro'), cl: window.__cl, prazo: sessionStorage.getItem('bz-ouro-ate')
}));
const foto = (page, nome) => page.screenshot({ path: fileURLToPath(new URL(nome + '.png', PASTA)) });
/* clica no link do site como a pessoa (o menu do celular fica fechado: o clique vai pelo DOM) e fotografa a travessia */
async function atravessar(page, href, nome) {
  await page.evaluate((h) => document.querySelector('a[href="' + h + '"]').click(), href);
  await espera(280);
  await foto(page, nome + '-travessia');
  await page.waitForURL((u) => u.pathname === href, { timeout: 15000 });
  await page.waitForLoadState('load');
}

for (const larg of LARGURAS) {
  console.log('\n== ' + larg + ' px');
  const { ctx, page, erros } = await contexto(larg);
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await espera(1500);
  ok(await page.evaluate(() => BEYON.ouro.acender()), 'o ouro acende no Início');
  await espera(3800);
  let e = await estado(page);
  ok(e.estado === 'reinado' && e.ouro, 'Início: reinado (' + e.estado + ')');
  await foto(page, larg + '-1-inicio-reinado');
  let antes = e.resta;
  for (const [href, nome] of [['/sites', 'sites'], ['/automacao', 'automacao'], ['/orcamento', 'orcamento']]) {
    await atravessar(page, href, larg + '-' + nome);
    e = await estado(page);
    ok(/\bis-ouro\b/.test(e.cl.q1 || '') && /\bis-ouro\b/.test(e.cl.dcl || ''), nome + ': html.is-ouro no 1º quadro e no DOMContentLoaded (' + (e.cl.q1 || '?') + ')');
    ok(e.estado === 'reinado' && e.k === 1, nome + ': reinado retomado, k = 1 (' + e.estado + ', k ' + e.k + ')');
    ok(e.resta > 0 && e.resta < antes, nome + ': o tempo que falta diminui (' + antes + ' → ' + e.resta + ' ms)');
    antes = e.resta;
    await espera(1200);
    await foto(page, larg + '-' + nome + '-chegou');
  }
  await page.goBack({ waitUntil: 'load' });
  e = await estado(page);
  ok(e.estado === 'reinado' && e.ouro, 'voltar pelo histórico (/automacao): segue no reinado (' + e.estado + ', resta ' + e.resta + ')');
  ok(e.resta < antes, 'e com o relógio da sessão (' + antes + ' → ' + e.resta + ' ms)');
  /* o prazo vence nesta página: o resfriamento acontece aqui */
  await page.waitForFunction(() => BEYON.ouro.estado === 'esfria', null, { timeout: 40000, polling: 50 });
  await espera(700);
  await foto(page, larg + '-5-automacao-resfriando');
  e = await estado(page);
  ok(e.prazo === null, 'resfriando: o prazo saiu da sessão');
  await page.waitForFunction(() => BEYON.ouro.estado === 'frio', null, { timeout: 8000 });
  e = await estado(page);
  ok(!e.ouro && e.k === 0, 'depois do resfriamento: ciano, k = 0');
  await foto(page, larg + '-6-automacao-frio');
  /* a página seguinte abre ciano */
  await atravessar(page, '/sites', larg + '-7-sites-depois');
  e = await estado(page);
  ok(!/\bis-ouro\b/.test(e.cl.q1 || '') && e.estado === 'frio', 'a página seguinte ao fim abre em ciano');
  /* privacidade (sem o ouro.js): nasce em ouro e sai em silêncio no prazo */
  await page.evaluate(() => sessionStorage.setItem('bz-ouro-ate', String(Date.now() + 5000)));
  await page.goto(BASE + '/privacidade', { waitUntil: 'load' });
  e = await estado(page);
  ok(/\bis-ouro\b/.test(e.cl.q1 || '') && e.ouro, 'privacidade: nasce em ouro');
  await foto(page, larg + '-8-privacidade-ouro');
  await espera(5600);
  e = await estado(page);
  ok(!e.ouro && e.prazo === null, 'privacidade: o ouro sai no prazo, sozinho');
  ok(erros.length === 0, 'nenhum erro de console' + (erros.length ? ': ' + erros.slice(0, 4).join(' | ') : ''));
  await ctx.close();
}

/* movimento reduzido: um prazo na sessão não pinta nada */
{
  console.log('\n== movimento reduzido');
  const { ctx, page, erros } = await contexto(390, { reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  ok(!(await page.evaluate(() => !!(window.BEYON.ouro && BEYON.ouro.acender))), 'o ouro não existe (sem acender)');
  await page.evaluate(() => sessionStorage.setItem('bz-ouro-ate', String(Date.now() + 20000)));
  for (const p of ['/sites', '/orcamento', '/privacidade']) {
    await page.goto(BASE + p, { waitUntil: 'load' });
    const e = await estado(page);
    ok(!/\bis-ouro\b/.test(e.cl.q1 || '') && !e.ouro, p + ': sem ouro com movimento reduzido');
  }
  await foto(page, 'reduzido-privacidade');
  ok(erros.length === 0, 'nenhum erro de console' + (erros.length ? ': ' + erros.slice(0, 4).join(' | ') : ''));
  await ctx.close();
}
await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
