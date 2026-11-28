/* Olha a cena do mapa vivo (fase 2, js/orcamento-cena-tela.js) na página real, servidor local com a IA simulada e a reação ligada: toca Saúde
   (como os E2E), escreve sobre uma clínica de 3 pessoas que recebe pelo Instagram e pelo WhatsApp, espera a cena na miniatura e fotografa a
   vitrine. Em 390 e 320: a cena aparece com 3 pessoas e 2 canais, sem rolagem lateral, o lugar da cena não muda de altura quando o desenho chega
   (reservado), nenhum erro. Com movimento reduzido, o quadro final. Salva os PNG em docs/olhar-cena/.
     BZ_REACAO=ligada node docs/servidor.mjs . 8941
     BASE=http://127.0.0.1:8941 CHROMIUM=... node docs/olhar-cena.mjs */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { esperarToques, responderAteADor } from './e2e-toques.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8941';
const PASTA = 'docs/olhar-cena';
const TEXTO = 'Somos 3 na clínica, o pessoal chega pelo Instagram e pelo WhatsApp';
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
mkdirSync(PASTA, { recursive: true });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const largura of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: largura === 390 ? 844 : 640 }, reducedMotion: 'reduce', extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
  await esperarToques(page);
  await responderAteADor(page);
  const alturaAntes = await page.evaluate(() => { const a = document.getElementById('o-nasce-cena'); return a && !a.hidden ? Math.round(a.getBoundingClientRect().height) : null; });
  await page.fill('#o-texto', TEXTO);
  await page.press('#o-texto', 'Enter');
  const svg = page.locator('#o-nasce-cena svg.cena');
  await svg.waitFor({ timeout: 30000 }).catch(() => {});
  const apareceu = await svg.count() > 0;
  ok(apareceu, `${largura}: a cena aparece na miniatura`);
  if (apareceu) {
    const m = await page.evaluate(() => {
      const a = document.getElementById('o-nasce-cena');
      return {
        gente: a.querySelectorAll('.cena__gente').length, canais: a.querySelectorAll('.cena__canal').length, oferta: a.querySelectorAll('.cena__oferta').length,
        altura: Math.round(a.getBoundingClientRect().height), lateral: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    ok(m.gente === 3, `${largura}: 3 pessoas (${m.gente})`);
    ok(m.canais === 2, `${largura}: 2 canais, Instagram e WhatsApp (${m.canais})`);
    ok(m.lateral <= 0, `${largura}: sem rolagem lateral (${m.lateral})`);
    const cls = await page.evaluate(() => Math.round(window.__cls * 1000) / 1000);
    ok(cls < 0.1, `${largura}: CLS da página inteira ${cls} (meta < 0,1; lugar antes do envio: ${alturaAntes}, depois: ${m.altura})`);
    await page.locator('.orc-vitrine').first().scrollIntoViewIfNeeded();
    await page.locator('.orc-vitrine').first().screenshot({ path: `${PASTA}/${largura}-vitrine.png` });
  }
  ok(erros.length === 0, `${largura}: sem erro na página ${erros.join(' | ')}`);
  await ctx.close();
}
await browser.close();
process.exit(falhou ? 1 : 0);
