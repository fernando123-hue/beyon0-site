/* Olha o toque da equipe (dono 27/11; docs/superpowers/plans/2026-11-28-toque-equipe.md) na página real, servidor local com a IA simulada e
   a reação ligada: responde até o material, fotografa a pergunta "quantas pessoas trabalham aí" com as 4 faixas e o "Prefiro não dizer",
   toca "2 a 5", escreve sobre uma barbearia SEM dizer o número e espera a cena: 3 pessoas (a faixa vira o desenho quando o texto não diz).
   Em 390 e 320: sem rolagem lateral, nenhum erro. Salva os PNG em docs/olhar-equipe/.
     BZ_REACAO=ligada node docs/servidor.mjs . 8941
     BASE=http://127.0.0.1:8941 CHROMIUM=... node docs/olhar-equipe.mjs */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { esperarToques, tocar } from './e2e-toques.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8941';
const PASTA = 'docs/olhar-equipe';
const TEXTO = 'Tenho uma barbearia, o pessoal chega pelo Instagram';
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
mkdirSync(PASTA, { recursive: true });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const largura of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: largura === 390 ? 844 : 640 }, reducedMotion: 'reduce', extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
  await esperarToques(page);
  for (const t of ['Beleza', 'Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho']) await tocar(page, t);
  const grupo = page.locator('#o-log .orc-toque:not([data-feito])').last();
  await grupo.waitFor({ timeout: 8000 });
  const rotulos = await grupo.locator('button').allTextContents();
  ok(['Só eu', '2 a 5', '6 a 15', '16 ou mais', 'Prefiro não dizer'].every(r => rotulos.some(x => x.trim() === r)), `${largura}: as 4 faixas e o "Prefiro não dizer" (${rotulos.map(s => s.trim()).join(' | ')})`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `${largura}: na pergunta da equipe, sem rolagem lateral`);
  await grupo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${PASTA}/${largura}-pergunta.png` });
  await tocar(page, '2 a 5');
  await page.fill('#o-texto', TEXTO);
  await page.press('#o-texto', 'Enter');
  const svg = page.locator('#o-nasce-cena svg.cena');
  await svg.waitFor({ timeout: 30000 }).catch(() => {});
  const gente = await page.evaluate(() => document.querySelectorAll('#o-nasce-cena .cena__gente').length);
  ok(gente === 3, `${largura}: "2 a 5" sem número no texto = 3 pessoas na cena (${gente})`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `${largura}: depois do envio, sem rolagem lateral`);
  await page.locator('.orc-vitrine').first().scrollIntoViewIfNeeded();
  await page.locator('.orc-vitrine').first().screenshot({ path: `${PASTA}/${largura}-vitrine.png` });
  ok(erros.length === 0, `${largura}: sem erro na página ${erros.join(' | ')}`);
  await ctx.close();
}
await browser.close();
process.exit(falhou ? 1 : 0);
