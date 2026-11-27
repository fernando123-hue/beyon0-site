/* Olha a pergunta de coerência (mapa vivo, fase 4, js/orcamento-coerencia-tela.js) no navegador de verdade, servidor local com a IA simulada e
   a reação ligada: toca Saúde (como os E2E), escreve sobre uma padaria, espera a pergunta, fotografa, toca "Sim, ajuste" e confere que a mudança
   foi como "Mudei minhas respostas" com Alimentação; numa 2ª rodada toca "Não, está certo" e confere que nada mudou. Em 390 e 320 de largura,
   mede rolagem lateral e o tamanho dos botões. Salva os PNG em docs/olhar-coerencia/.
     BZ_REACAO=ligada node docs/servidor.mjs . 8941
     BASE=http://127.0.0.1:8941 CHROMIUM=... node docs/olhar-coerencia.mjs */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { esperarToques, responderAteADor, tocar } from './e2e-toques.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8941';
const PASTA = 'docs/olhar-coerencia';
const TEXTO = 'Tenho uma padaria no centro, fazemos pão e bolo todo dia e o pessoal chega pelo Instagram';
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
mkdirSync(PASTA, { recursive: true });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const largura of [390, 320]) {
  for (const resposta of ['Sim, ajuste', 'Não, está certo']) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: largura === 390 ? 844 : 640 }, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));
    await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
    await esperarToques(page);
    await responderAteADor(page);
    await page.fill('#o-texto', TEXTO);
    await page.press('#o-texto', 'Enter');
    const pergunta = page.locator('#o-log .msg--agente', { hasText: 'parece ser de Alimentação' });
    await pergunta.waitFor({ timeout: 30000 }).catch(() => {});
    const apareceu = await pergunta.count() > 0;
    ok(apareceu, `${largura}: a pergunta aparece ("parece ser de Alimentação, e não de Saúde")`);
    if (apareceu) {
      await pergunta.last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      const nome = `${PASTA}/${largura}-${resposta.startsWith('Sim') ? 'sim' : 'nao'}`;
      await page.screenshot({ path: nome + '-pergunta.png' });
      const medidas = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('#o-log .orc-op--toque')].filter(b => /ajuste|está certo/.test(b.textContent));
        return { lateral: document.documentElement.scrollWidth - window.innerWidth, botoes: bs.map(b => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), d: r.right <= window.innerWidth }; }) };
      });
      ok(medidas.lateral <= 0, `${largura}: sem rolagem lateral (${medidas.lateral})`);
      ok(medidas.botoes.length === 2 && medidas.botoes.every(b => b.h >= 40 && b.d), `${largura}: os 2 botões com 40 px ou mais e dentro da tela ${JSON.stringify(medidas.botoes)}`);
      await tocar(page, resposta);
      await page.waitForTimeout(2500);
      const mudou = await page.locator('#o-log .msg--visitante', { hasText: 'Mudei minhas respostas' }).count();
      if (resposta.startsWith('Sim')) ok(mudou > 0 && await page.locator('#o-log .msg--visitante', { hasText: 'Alimentação' }).count() > 0, `${largura}: "Sim" mandou a mudança com Alimentação`);
      else ok(mudou === 0, `${largura}: "Não" não mudou nada`);
      await page.screenshot({ path: nome + '-depois.png' });
    }
    ok(erros.length === 0, `${largura}: sem erro na página ${erros.join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
process.exit(falhou ? 1 : 0);
