/* TEXTO GRANDE NA FAIXA DA PLANTA (pendência do 2b, item BAIXO): a nota (.plv-nota) e a legenda (.plv-leitura) têm altura fixa em px para a troca de texto não mexer no
   quadro (CLS). Com zoom de texto de 200% ou fonte grande do sistema o texto pode passar da altura e ser cortado (overflow: hidden). Este script abre a página REAL com a planta
   (servidor local com a flag ligada; IA simulada), simula o zoom de texto com font-size: 200% no <html> (os tamanhos do site são em rem) e lista o que corta:
   scrollHeight > clientHeight em .plv-nota, .plv-leitura, .plv-leitura__txt e nas caixas de texto das etapas (.plv-est), em 390, 320 e 1.280 px, com a nota do modelo
   e a do plano padrão. Também mede a legenda grudada (sticky) com a janela encolhida pelo teclado virtual (390x508 e 320x400) e confere que o aviso de cookies nunca
   aparece em /orcamento (js/medicao.js com data-sem-google).
   Uso: CHROMIUM=... node docs/zoom-planta.mjs [porta da flag ligada, padrão 8931] [zoom em %, padrão 200] */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:' + (process.argv[2] || '8931');
const ZOOM = Number(process.argv[3] || 200);
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const PASTA = new URL('./olhar-planta/', import.meta.url);
await mkdir(PASTA, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const nav = await chromium.launch({ executablePath: EXEC });
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));

async function abrir(larg, alt, nicho) {
  const movel = larg < 500;
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: movel, hasTouch: movel, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#o-perguntas:not([hidden])');
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])');
  await page.click('#o-conversar');
  const textos = nicho === 'padrao'
    ? ['Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional', 'Pode seguir', 'Combinado, pode seguir']
    : ['Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional', 'planta-boa pode desenhar'];
  for (const t of textos) {
    const n = await page.locator('#o-log .msg--agente').count();
    await page.fill('#o-texto', t); await page.press('#o-texto', 'Enter');
    await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
    await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  }
  await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro', { timeout: 15000 }).catch(async () => { await page.click('.plv-ver'); await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro'); });
  return { ctx, page };
}

const cortes = (zoom) => `(() => {
  document.documentElement.style.fontSize = '${zoom}%';
  const sel = ['.plv-nota', '.plv-leitura', '.plv-leitura__txt', '.plv-est', '.plv-ponta', '.plv-tit'];
  const lista = [];
  for (const s of sel) for (const el of document.querySelectorAll('#o-planta ' + s)) {
    const corta = el.scrollHeight > el.clientHeight + 1;
    if (corta) lista.push({ s, id: el.closest('[data-id]') ? el.closest('[data-id]').dataset.id : '', visivel: el.clientHeight, conteudo: el.scrollHeight, texto: (el.textContent || '').slice(0, 50) });
  }
  return lista;
})()`;

let total = 0;
for (const [nicho, rotulo] of [['boa', 'nota do plano do modelo'], ['padrao', 'nota do plano padrão']]) {
  for (const [larg, alt] of [[390, 844], [320, 640], [1280, 800]]) {
    const { ctx, page } = await abrir(larg, alt, nicho);
    await espera(1500);
    const base = await page.evaluate(cortes(100));
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.waitForFunction(() => document.querySelector('.plv-leitura'));
    const zoom = await page.evaluate(cortes(ZOOM));
    await page.locator('#o-planta').scrollIntoViewIfNeeded();
    await page.locator('.plv-quadro').screenshot({ path: fileURLToPath(new URL('zoom' + ZOOM + '-' + larg + '-' + nicho + '.png', PASTA)) }).catch(() => {});
    const agrupado = {};
    for (const c of zoom) agrupado[c.s] = (agrupado[c.s] || 0) + 1;
    total += zoom.length;
    console.log(`${String(larg).padStart(4)} px, ${rotulo}: a 100% corta ${base.length}; a ${ZOOM}% corta ${zoom.length} ${JSON.stringify(agrupado)}${zoom.some((c) => c.s === '.plv-nota' || c.s === '.plv-leitura' || c.s === '.plv-leitura__txt') ? '  <- nota ou legenda cortada: ' + JSON.stringify(zoom.filter((c) => /nota|leitura/.test(c.s)).map((c) => [c.s, c.visivel, c.conteudo])) : ''}`);
    await ctx.close();
  }
}

/* a legenda grudada com o teclado virtual: a janela encolhe (o teclado come a metade de baixo) e o aviso de cookies não existe na página */
for (const [larg, alt, teclado] of [[390, 844, 508], [320, 640, 400]]) {
  const { ctx, page } = await abrir(larg, alt, 'boa');
  await page.setViewportSize({ width: larg, height: teclado });
  await page.locator('.plv-quadro').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200)); await espera(300);
  const r = await page.evaluate(() => {
    const le = document.querySelector('.plv-leitura').getBoundingClientRect();
    return { fundoLegenda: Math.round(le.bottom), janela: window.innerHeight, posicao: getComputedStyle(document.querySelector('.plv-leitura')).position, cookies: document.querySelectorAll('.consentimento').length, barra: document.querySelectorAll('.barra').length };
  });
  console.log(`${larg} px com a janela encolhida pelo teclado (${teclado} px): legenda ${r.posicao}, base da legenda em ${r.fundoLegenda} de ${r.janela} px (${r.fundoLegenda <= r.janela ? 'dentro da janela' : 'FORA'}); avisos de cookies na página: ${r.cookies}; barra fixa do celular: ${r.barra}`);
  await page.screenshot({ path: fileURLToPath(new URL('teclado-' + larg + '.png', PASTA)) });
  await ctx.close();
}
await nav.close();
console.log(total ? '\n' + total + ' corte(s) com zoom de ' + ZOOM + '%.' : '\nNada corta com zoom de ' + ZOOM + '%.');
