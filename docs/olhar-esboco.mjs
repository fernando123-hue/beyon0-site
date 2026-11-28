/* O NÓ EM ESBOÇO NA PÁGINA REAL (Mapa vivo v2, Fase 3, PR 2): a conversa com a IA simulada até o mapa v3 (o gatilho "planta-boa" do dublê,
   como docs/fotos-mapa.mjs); com o mapa pronto ela ESCREVE "quero também um formulário" (sem Enter), apaga, escreve de novo e manda.
     node docs/servidor.mjs . 8899          (flag ligada: padrão do servidor local)
     BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/olhar-esboco.mjs <pasta> [larguras, padrão 390,320,1280]
   Confere: o esboço aparece (1 nó .is-rascunho a ~34%) sem rolagem lateral; apagar a caixa tira o esboço; o Enter firma (nenhum .is-rascunho,
   a marca "Ajustado" à vista); a resposta do dublê não traz plano novo, então o oficial volta (sem o nó do formulário); nenhuma requisição
   nova enquanto ela digita (o esboço é do aparelho); deslocamento de layout (CLS) somado nesse trecho; nenhum erro nem aviso [beyon] no
   console. Fotos: esboço, firme e de volta. Sai com 1 se algo falhar. Um IP novo por largura. */
import { chromium } from 'playwright';
import { esperarToques, responderAteADor } from './e2e-toques.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PASTA = process.argv[2] || '.';
const LARGURAS = (process.argv[3] || '390,320,1280').split(',').map(Number);
const PEDIDO = process.env.PEDIDO || 'quero também um formulário no site';   /* (PEDIDO=outra frase: a mesma conversa sem esboço, para comparar o CLS) */
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
/* o estado do mapa: quantos nós em esboço (e a opacidade calculada do 1º), se há o nó do formulário e a marca "Ajustado" */
const estado = (page, sel) => page.evaluate((s) => {
  const q = document.querySelector(s);
  const esb = q ? [...q.querySelectorAll('.mpc-no.is-rascunho')] : [];
  const nos = q ? [...q.querySelectorAll('.mpc-no')] : [];
  return {
    esboco: esb.length,
    opacidade: esb[0] ? Number(getComputedStyle(esb[0]).opacity) : null,
    formulario: nos.some((n) => n.textContent.includes('Formulário de pedido')),
    ajustado: nos.some((n) => n.textContent.includes('Ajustado') && n.textContent.includes('Formulário de pedido')),
    lateral: document.documentElement.scrollWidth - innerWidth,
    cls: window.__cls
  };
}, sel);

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
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__fontes = [];
    new PerformanceObserver((l) => { l.getEntries().forEach((e) => { if (!e.hadRecentInput && window.__medirCls) { window.__cls += e.value; window.__fontes.push(e.value.toFixed(4) + ' ' + (e.sources || []).map((x) => x.node ? (x.node.id || x.node.className || x.node.nodeName) : '?').join(',')); } }); }).observe({ type: 'layout-shift', buffered: false });
  });
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await esperarToques(page);
  await responderAteADor(page);
  await turno(page, 'Pelo Instagram e por indicação, e muita gente pergunta e some');
  await turno(page, 'planta-boa pode desenhar');
  const sel = cel ? '#o-log .lv-item .mpc-quadro' : '#o-planta .mpc-quadro';
  if (!cel) {
    await page.waitForFunction(() => !!window.BZMapa, null, { timeout: 20000 });
    await espera(500);
    await page.mouse.click(4, 450);
    await espera(600);
    await page.evaluate(() => { const f = document.getElementById('o-planta'); if (f && !f.hidden) f.scrollIntoView({ block: 'start' }); });
  } else {
    /* no celular o mapa mora no cartão da conversa e só monta à vista */
    await page.evaluate(() => { const li = document.querySelector('#o-log .lv-item'); const c = document.getElementById('o-log-caixa'); if (li && c) c.scrollTop += li.getBoundingClientRect().top - c.getBoundingClientRect().top - 8; });
  }
  try { await page.waitForSelector(sel, { timeout: 20000 }); } catch (e) { console.log('  FALHOU o mapa não apareceu em ' + larg + ' px; console: ' + (erros.join(' | ') || '(nada)')); falhou = true; await ctx.close(); continue; }
  await espera(9000);   /* a entrada do mapa termina */
  const alvo = cel ? page.locator('#o-log .lv-item') : page.locator('#o-planta');
  const pedidos = [];
  page.on('request', (r) => { if (!/\.(js|css|woff2?|png|svg|ico)(\?|$)/.test(r.url())) pedidos.push(r.url()); });
  await page.evaluate(() => { window.__cls = 0; window.__medirCls = true; });

  await page.fill('#o-texto', PEDIDO);
  await espera(2500);   /* a pausa de 250 ms, a 1ª carga do ajuste e o deslize (700 ms) com a entrada do esboço */
  let s = await estado(page, sel);
  ok(s.esboco === 1, 'o esboço aparece (' + s.esboco + ' nó em esboço)');
  ok(s.opacidade !== null && Math.abs(s.opacidade - 0.34) < 0.02, 'o esboço a 34% (' + s.opacidade + ')');
  ok(s.lateral <= 1, 'sem rolagem lateral');
  const cls = { esboco: s.cls };
  await alvo.screenshot({ path: path.join(PASTA, 'esboco-' + larg + '.png') });

  await page.fill('#o-texto', '');
  await espera(1200);
  s = await estado(page, sel);
  ok(s.esboco === 0 && !s.formulario, 'apagar a caixa tira o esboço');
  cls.apagar = s.cls - cls.esboco;
  ok(pedidos.length === 0, 'nenhuma requisição enquanto ela digita' + (pedidos.length ? ': ' + pedidos.join(' ') : ''));

  await page.fill('#o-texto', PEDIDO);
  await espera(2500);
  const n = await page.locator('#o-log .msg--agente').count();
  /* o dublê responde em menos de 1 s (o Zero real leva ~20 s): a resposta atrasa 3 s para o esboço firme ficar à vista */
  await page.route('**/api/vendas**', async (r) => { if (r.request().method() === 'POST') await espera(3000); await r.continue(); });
  await page.press('#o-texto', 'Enter');
  await espera(1200);
  s = await estado(page, sel);
  ok(s.esboco === 0 && s.ajustado, 'o Enter firma: sem esboço, com "Ajustado"');
  cls.enter = s.cls - cls.esboco - cls.apagar;
  if (process.env.FONTES) console.log('  deslocamentos até o Enter: ' + (await page.evaluate(() => window.__fontes.join(' | '))));
  await alvo.screenshot({ path: path.join(PASTA, 'firme-' + larg + '.png') });
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  await espera(1500);
  s = await estado(page, sel);
  ok(!s.formulario, 'o dublê não mandou plano novo: o oficial volta');
  cls.resposta = s.cls - cls.esboco - cls.apagar - cls.enter;
  console.log('  CLS por etapa: ' + Object.entries(cls).map(([k, v]) => k + ' ' + v.toFixed(4)).join(', '));
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await alvo.screenshot({ path: path.join(PASTA, 'volta-' + larg + '.png') });
  await ctx.close();
}
await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
