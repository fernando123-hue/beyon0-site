/* FOTOS DO ESBOÇO QUE CRESCE NA CONVERSA (PR 5: sem o fantasma tracejado; a chegada com as origens do módulo comum, js/mapa-saber.js).
     node docs/servidor.mjs . 8899          (flag ligada: padrão do servidor local; IA simulada)
     BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/fotos-esboco.mjs <pasta> [larguras, padrão 390,320]
   Para cada largura: os toques do começo, um 1º turno com uma origem negada e duas ditas ("Instagram não, vem tudo por indicação e pelo zap"), outro, e
   fotos do cartão do esboço no 1º e no 2º turno. Confere: sem rolagem lateral, nenhum "a entender" nem tracejado na tela, a chegada diz as origens
   certas (sem Instagram), nenhum erro no console. Sai com 1 se algo falhar. Cada rodada usa um IP novo (o freio local de sessões por IP). */
import { chromium } from 'playwright';
import { esperarToques, responderAteADor } from './e2e-toques.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PASTA = process.argv[2] || '.';
const LARGURAS = (process.argv[3] || '390,320').split(',').map(Number);
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
/* o cartão inteiro à vista na caixa da conversa, e a foto só dele */
async function fotoDoCartao(page, nome) {
  await page.evaluate(() => { const li = document.querySelector('#o-log .lv-item'); const c = document.getElementById('o-log-caixa'); c.scrollTop += li.getBoundingClientRect().top - c.getBoundingClientRect().top - 8; });
  await espera(6000);   /* as estações imprimem quando estão à vista: espera a fila andar */
  await page.locator('#o-log .lv-item').screenshot({ path: path.join(PASTA, nome + '.png') });
}

await mkdir(PASTA, { recursive: true });
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const larg of LARGURAS) {
  console.log('\n== ' + larg + ' px ==');
  const ctx = await nav.newContext({ viewport: { width: larg, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /planta|beyon/.test(m.text()))) erros.push(m.text()); });
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await esperarToques(page);
  await responderAteADor(page);
  /* a IA simulada grava o 1º texto livre como "como chegam" (api/_ia/simulado.mjs): é ele que diz as origens */
  await turno(page, 'Instagram não, vem tudo por indicação e pelo zap');
  await page.waitForSelector('#o-log .lv-item .lv', { timeout: 20000 });
  await fotoDoCartao(page, 'esboco-' + larg + '-turno1');
  await turno(page, 'Tenho uma clínica odontológica e quero mais agendamentos');
  await fotoDoCartao(page, 'esboco-' + larg + '-turno2');
  const tela = await page.evaluate(() => {
    const li = document.querySelector('#o-log .lv-item');
    const visiveis = [...li.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; });
    return {
      texto: li.innerText,
      tracejado: visiveis.filter((e) => e instanceof SVGElement && getComputedStyle(e).strokeDasharray !== 'none' && !/lv-(trilho|chip|aro|icone)/.test(e.getAttribute('class') || '') && !e.closest('.lv-icone')).map((e) => e.getAttribute('class')),
      chegada: (li.querySelector('.lv-txt.is-aceso .lv-tit') || {}).textContent || ''
    };
  });
  ok(!/a entender|de onde o seu cliente vem|o que trava hoje/i.test(tela.texto), 'nenhum texto de fantasma no cartão');
  ok(tela.tracejado.length === 0, 'nenhum traço tracejado à mostra fora do que se desenha (' + tela.tracejado.join(',') + ')');
  ok(!/instagram/i.test(tela.chegada) && /indica/i.test(tela.chegada), 'a chegada sem o Instagram negado e com a indicação: "' + tela.chegada + '"');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}
await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
