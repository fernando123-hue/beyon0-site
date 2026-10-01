/* ==========================================================================
   VERIFICADOR — abre o site num navegador de verdade e confere.

   POR QUE EXISTE: até 2026-09-22 nenhuma sessão de agente tinha conseguido
   VER este site rodando. Num ambiente com Chromium + Playwright, nove bugs de
   render apareceram que a leitura do código não mostrava.

   Não é dependência do site: `docs/` está no .vercelignore. O Playwright é
   devDependency; o site publicado continua sem passo de instalação.

   COMO RODAR (Windows do dono: fora do sandbox do agente)
     node docs/servidor.mjs . 8899            # ou qualquer servidor estático
     BASE=http://127.0.0.1:8899 CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1228\chrome-headless-shell-win64\chrome-headless-shell.exe node docs/verificar.mjs

   O QUE CONFERE, por página (desktop e celular com toque):
   · boot do organismo e caixa do AI Core (sem ela o canvas não desenha);
   · nenhum conteúdo preso invisível pelo contrato html.js (opacity 0 ou
     visibility hidden depois de 3,5s — o GSAP tem que ter revelado);
   · rolagem lateral zero; caixas `.cena` fora do fluxo;
   · todos os links de WhatsApp montados; sem erro de console; fps > 45.
   ========================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const EXEC = process.env.CHROMIUM || undefined;

const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const ESTREITO = { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const ALVOS = [
  ['/index.html',     'hub',       DESKTOP],
  ['/sites.html',     'sites',     DESKTOP],
  ['/automacao.html', 'automacao', DESKTOP],
  ['/resumo.html',    'resumo',    DESKTOP, { semCanvas: true }],
  ['/index.html',     'hub-cel',   CELULAR],
  ['/sites.html',     'sites-cel', CELULAR],
  ['/automacao.html', 'autom-cel', CELULAR],
  /* URLs limpas (cleanUrls na Vercel; o servidor local resolve .html) e 320px */
  ['/',               'hub-320',   ESTREITO],
  ['/sites',          'sites-320', ESTREITO],
  ['/automacao',      'autom-320', ESTREITO, { reduzirNoBoot: true }]
];

const medirFps = (page, seg = 3) => page.evaluate(s => new Promise(ok => {
  let n = 0; const t0 = performance.now();
  (function volta() {
    n++;
    performance.now() - t0 < s * 1000 ? requestAnimationFrame(volta) : ok(+(n / ((performance.now() - t0) / 1000)).toFixed(1));
  })();
}), seg);

const navegador = await chromium.launch({ executablePath: EXEC, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let falhou = false, primeiro = true;

for (const [rota, nome, opcoes, { semCanvas = false, reduzirNoBoot = false } = {}] of ALVOS) {
  const ctx = await navegador.newContext(opcoes);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await page.addInitScript(() => { window.__lcp = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {} });
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  /* o interruptor "Reduzir movimento" acionado no MEIO do boot: nada pode
     ficar preso (SplitText no meio do caminho, opacidade zerada) */
  if (reduzirNoBoot) { await page.waitForTimeout(500); await page.evaluate(() => window.BEYON && window.BEYON.reduzir(true)); }
  await page.waitForTimeout(3500);

  const d = await page.evaluate(() => {
    const B = window.BEYON;
    const wa = [...document.querySelectorAll('[data-wa]')];
    const escondido = e => { const cs = getComputedStyle(e); return cs.opacity === '0' || cs.visibility === 'hidden'; };
    return {
      boot: !!B,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      waProntos: wa.filter(a => (a.getAttribute('href') || '').startsWith('https://wa.me/')).length,
      waTotal: wa.length,
      reator: !!document.querySelector('.hero__reactor'),
      presos: [...document.querySelectorAll('.hero__title, .display, .hero__sub, .hero__actions')].filter(escondido).length,
      cenaForaDoFluxo: [...document.querySelectorAll('.cena')].every(e => getComputedStyle(e).position === 'absolute')
    };
  });
  /* rola até o fim e volta: nada pode ficar preso invisível no caminho */
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  d.presosNoFim = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity === '0').length);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  const fps = await medirFps(page);
  const lcp = Math.round(await page.evaluate(() => window.__lcp));

  const reais = erros.filter(e => !/ERR_CERT|GPU stall|swiftshader/i.test(e));
  const ok = (semCanvas || (d.boot && d.reator)) && d.cenaForaDoFluxo && d.overflowX === 0 &&
    d.waProntos === d.waTotal && reais.length === 0 && d.presos === 0 && d.presosNoFim === 0 && fps > 45 &&
    /* LCP com orçamento (2,5s é o "bom" do Core Web Vitals); o primeiro alvo da rodada é artefato do headless */
    (primeiro || lcp < 2500);
  primeiro = false;
  if (!ok) falhou = true;

  console.log(
    (ok ? 'OK  ' : 'FALHA ') + nome.padEnd(10),
    'fps=' + String(fps).padStart(5),
    'lcp=' + String(lcp).padStart(5) + 'ms',
    'rolagemX=' + d.overflowX,
    'wa=' + d.waProntos + '/' + d.waTotal,
    'nucleo=' + d.reator,
    'presos=' + d.presos + '/' + d.presosNoFim,
    reais.length ? '\n     erros: ' + reais.join('\n     ') : ''
  );
  await ctx.close();
}

await navegador.close();
console.log(falhou ? '\nAlguma coisa falhou — leia acima.' : '\nTudo certo.');
process.exit(falhou ? 1 : 0);
