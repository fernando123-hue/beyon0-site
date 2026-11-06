/* ACESSIBILIDADE DO PAINEL QUE ROLA POR DENTRO, COM E SEM O RADAR (pendência B6 do 2d). Dois servidores locais:
     node docs/servidor.mjs . 8931                           (flag ligada: com o radar)
     BZ_PLANTA_LOCAL=desligada node docs/servidor.mjs . 8932 (flag desligada: só as peças da conversa, sem radar)
     CHROMIUM=... node docs/a11y-painel.mjs [8931] [8932]
   1.280 x 800: o painel rola por dentro; o <aside> tem tabindex="0", o Tab chega nele, o foco é visível, PageDown e End rolam (sem o radar e com ele). Janela alta (1.280 x 2.400): o painel
   não rola, então não tem tabindex. Celular (390 x 844): o painel é um bloco da página, sem tabindex. Capturas em docs/olhar-radar/ (a11y-painel-*). */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ON = 'http://127.0.0.1:' + (process.argv[2] || '8931'), OFF = 'http://127.0.0.1:' + (process.argv[3] || '8932');
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const PASTA = new URL('./olhar-radar/', import.meta.url);
await mkdir(PASTA, { recursive: true });
let falhou = false;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FALHOU ') + m); if (!c) falhou = true; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
const T1 = 'Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional. Tem muita procura. leitura-sim';
const T2 = 'Toda hora perguntam o horário e só a recepcionista atende. Preciso disso antes da feira de abril. Hoje fica tudo na minha cabeça.';
const nav = await chromium.launch({ executablePath: EXEC });

async function abrir(base, larg, alt, comRadar) {
  const movel = larg < 500;
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: movel, hasTouch: movel, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  await page.goto(base + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#o-perguntas:not([hidden])');
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 });
  await page.click('#o-conversar');
  for (const t of [T1, T2]) {
    const n = await page.locator('#o-log .msg--agente').count();
    await page.fill('#o-texto', t); await page.press('#o-texto', 'Enter');
    await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
    await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
    await espera(500);
  }
  if (comRadar) await page.waitForSelector('#o-radar:not([hidden]) .plr', { timeout: 15000 });
  await espera(500);
  return { ctx, page };
}
const medir = (page) => page.evaluate(() => {
  const a = document.querySelector('.orc-painel'), pecas = document.getElementById('o-peca'), radar = document.getElementById('o-radar');
  return { rola: a.scrollHeight > a.clientHeight + 1, tabindex: a.getAttribute('tabindex'), sh: a.scrollHeight, ch: a.clientHeight, pecas: !!pecas && !pecas.hidden, radar: !!radar && !radar.hidden, nome: a.getAttribute('aria-labelledby') };
});

for (const [rotulo, base, comRadar] of [['SEM o radar (flag desligada)', OFF, false], ['COM o radar (flag ligada)', ON, true]]) {
  console.log('\n== 1.280 x 800, ' + rotulo + ' ==');
  const { ctx, page } = await abrir(base, 1280, 800, comRadar);
  const m = await medir(page);
  ok(m.pecas && m.radar === comRadar, 'as peças da conversa estão à vista e o radar ' + (comRadar ? 'também' : 'não'));
  ok(m.rola && m.tabindex === '0', 'o painel rola por dentro (' + m.sh + ' > ' + m.ch + ') e o <aside> tem tabindex="0"');
  await page.evaluate(() => { document.getElementById('o-texto').focus(); window.scrollTo(0, document.querySelector('.orc-mesa').getBoundingClientRect().top + window.scrollY - 80); });
  let alcancou = false, passos = 0;
  for (; passos < 80 && !alcancou; passos++) { await page.keyboard.press('Tab'); alcancou = await page.evaluate(() => document.activeElement === document.querySelector('.orc-painel')); }
  ok(alcancou, 'o Tab chega ao painel (em ' + passos + ' toques)');
  const foco = await page.evaluate(() => { const a = document.querySelector('.orc-painel'), c = getComputedStyle(a); return { contorno: c.outlineStyle, largura: parseFloat(c.outlineWidth), cor: c.outlineColor, fv: a.matches(':focus-visible') }; });
  ok(foco.fv && foco.contorno !== 'none' && foco.largura > 0, 'o foco do painel é visível (contorno ' + foco.contorno + ' ' + foco.largura + 'px ' + foco.cor + ')');
  await page.screenshot({ path: fileURLToPath(new URL('a11y-painel-1280-foco-' + (comRadar ? 'com' : 'sem') + '-radar.png', PASTA)) });
  const antes = await page.evaluate(() => document.querySelector('.orc-painel').scrollTop);
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageDown');
  await espera(400);
  const depois = await page.evaluate(() => document.querySelector('.orc-painel').scrollTop);
  ok(depois > antes + 100, 'PageDown rola o painel pelo teclado (' + antes + ' -> ' + depois + ')');
  await page.keyboard.press('End'); await espera(300);
  const fim = await page.evaluate(() => { const a = document.querySelector('.orc-painel'); return a.scrollTop + a.clientHeight >= a.scrollHeight - 2; });
  ok(fim, 'End leva ao fim do painel');
  await page.screenshot({ path: fileURLToPath(new URL('a11y-painel-1280-fim-' + (comRadar ? 'com' : 'sem') + '-radar.png', PASTA)) });
  /* a janela cresce: o painel deixa de rolar e perde o tabindex (o resize reavalia) */
  await page.setViewportSize({ width: 1280, height: 2600 });
  await espera(500);
  const alto = await medir(page);
  ok(!alto.rola && alto.tabindex === null, 'janela alta (1.280 x 2.600): o painel não rola (' + alto.sh + ' <= ' + alto.ch + ') e não tem tabindex');
  await page.setViewportSize({ width: 1280, height: 800 });
  await espera(500);
  const volta = await medir(page);
  ok(volta.rola && volta.tabindex === '0', 'e ao voltar para 1.280 x 800 o tabindex volta');
  await ctx.close();
}

console.log('\n== 390 x 844, SEM o radar ==');
{
  const { ctx, page } = await abrir(OFF, 390, 844, false);
  const m = await medir(page);
  ok(m.pecas && !m.rola && m.tabindex === null, 'no celular o painel é um bloco da página: não rola e não tem tabindex (' + m.sh + ' / ' + m.ch + ')');
  await ctx.close();
}
await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
