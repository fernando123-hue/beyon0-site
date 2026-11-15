/* FOTOS DO MAPA DO CASO NA PÁGINA REAL (PR 5b): a conversa com a IA simulada até o mapa v3 (o gatilho "planta-boa" do dublê), no celular (o cartão
   da conversa) e no computador (a faixa).
     node docs/servidor.mjs . 8899          (flag ligada: padrão do servidor local)
     BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/fotos-mapa.mjs <pasta> [larguras, padrão 390,320,1280]
   Confere: o mapa monta (.mpc-quadro), no celular o quadro tem no máximo 440 px, sem rolagem lateral, o valor sai (bz:planta-pronta), nenhum erro
   nem aviso [beyon]/[planta] no console. Fotos do lugar do mapa no fim da entrada. Sai com 1 se algo falhar. Um IP novo por largura. */
import { chromium } from 'playwright';
import { esperarToques, responderAteADor } from './e2e-toques.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PASTA = process.argv[2] || '.';
const LARGURAS = (process.argv[3] || '390,320,1280').split(',').map(Number);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };

async function turno(page, texto) {
  const n = await page.locator('#o-log .msg--agente').count();
  await page.fill('#o-texto', texto);
  await page.press('#o-texto', 'Enter');
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
}

await mkdir(PASTA, { recursive: true });
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const larg of LARGURAS) {
  console.log('\n== ' + larg + ' px ==');
  const cel = larg < 960;
  const ctx = await nav.newContext({ viewport: { width: larg, height: cel ? 844 : 900 }, isMobile: larg < 500, hasTouch: larg < 500, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /planta|beyon/.test(m.text()))) erros.push(m.text()); });
  await page.addInitScript(() => { window.__prontas = 0; document.addEventListener('bz:planta-pronta', () => { window.__prontas++; }); });
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await esperarToques(page);
  await responderAteADor(page);
  await turno(page, 'Pelo Instagram e por indicação, e muita gente pergunta e some');
  await turno(page, 'planta-boa pode desenhar');
  const sel = cel ? '#o-log .lv-item .mpc-quadro' : '#o-planta .mpc-quadro';
  if (!cel) {
    /* no computador a faixa à vista espera um gesto da pessoa (spec §4.4: clique ou tecla); um clique na margem, fora de qualquer controle */
    await page.waitForFunction(() => !!window.BZMapa, null, { timeout: 20000 });   /* os módulos do v3 chegaram: o clique conta */
    await espera(500);
    await page.mouse.click(4, 450);
    await espera(600);
    await page.evaluate(() => { const f = document.getElementById('o-planta'); if (f && !f.hidden) f.scrollIntoView({ block: 'start' }); });
  } else {
    await page.evaluate(() => { const li = document.querySelector('#o-log .lv-item'); const c = document.getElementById('o-log-caixa'); if (li && c) c.scrollTop += li.getBoundingClientRect().top - c.getBoundingClientRect().top - 8; });
  }
  try { await page.waitForSelector(sel, { timeout: 20000 }); } catch (e) { console.log('  FALHOU o mapa não apareceu em ' + larg + ' px; console: ' + (erros.join(' | ') || '(nada)')); falhou = true; await ctx.close(); continue; }
  await espera(9000);
  const info = await page.evaluate((s) => {
    const q = document.querySelector(s);
    const r = q.getBoundingClientRect();
    return { altura: Math.round(r.height), ouro: q.classList.contains('is-ouro'), lateral: document.documentElement.scrollWidth - innerWidth, prontas: window.__prontas, estrutura: document.querySelectorAll(s + ' .mpc-no').length };
  }, sel);
  ok(info.estrutura > 0, 'o mapa montou (' + info.estrutura + ' nós)');
  if (cel) ok(info.altura <= 440, 'celular: o quadro em ' + info.altura + ' px (máximo 440)');
  ok(info.ouro, 'o objetivo terminou em ouro');
  ok(info.prontas >= 1, 'o valor foi liberado (bz:planta-pronta)');
  ok(info.lateral <= 1, 'sem rolagem lateral');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  const alvo = cel ? page.locator('#o-log .lv-item') : page.locator('#o-planta');
  await alvo.screenshot({ path: path.join(PASTA, 'mapa-' + larg + '.png') });
  await ctx.close();
}
await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
