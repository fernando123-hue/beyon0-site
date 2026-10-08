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
   · boot do núcleo (window.BEYON) e barra do celular fixa;
   · nenhum conteúdo preso invisível pelo contrato html.js (opacity 0 ou
     visibility hidden depois de 3,5s — o GSAP tem que ter revelado);
   · rolagem lateral zero; caixas `.cena` fora do fluxo;
   · todos os links de WhatsApp montados; sem erro de console; fps > 45.
   E a PASSAGEM entre páginas (no fim): chega inteira e sem nada preso, volta
   pelo histórico inteira, desiste em 2 s, fecha o menu do celular na hora e
   chega a uma âncora só aparecendo.
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
  ['/resumo.html',    'resumo',    DESKTOP, { semNucleo: true }],
  ['/index.html',     'hub-cel',   CELULAR],
  ['/sites.html',     'sites-cel', CELULAR],
  ['/automacao.html', 'autom-cel', CELULAR],
  /* URLs limpas (cleanUrls na Vercel; o servidor local resolve .html) e 320px */
  ['/',               'hub-320',   ESTREITO],
  ['/sites',          'sites-320', ESTREITO],
  ['/automacao',      'autom-320', ESTREITO, { reduzirNoBoot: true }],
  /* O AI CORE (docs/restructure/PLANO-AI-CORE.md). Este verificador roda em
     SwiftShader, e WebGL desenhado pela CPU NÃO monta a esfera
     (failIfMajorPerformanceCaveat): nos alvos do Hub acima a exigência é
     ela NÃO montar (o desenho em CSS fica). Estes dois forçam
     (`?3d=forcar`) e exigem que ela monte, acenda e continue montada; o fps
     aqui é só informativo (WebGL por software não é o que um visitante com
     GPU vê). */
  ['/index.html?3d=forcar', 'hub-3d',     DESKTOP, { exige3d: true }],
  ['/index.html?3d=forcar', 'hub-3d-cel', CELULAR, { exige3d: true }]
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

for (const [rota, nome, opcoes, { semNucleo = false, reduzirNoBoot = false, exige3d = false } = {}] of ALVOS) {
  const ctx = await navegador.newContext(opcoes);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  /* um subsistema que caiu do laço (core.js avisa com "[beyon]") é falha:
     em 2026-10-03 a rede inteira caiu no celular sem nenhum erro visível */
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().indexOf('[beyon]') >= 0)) erros.push('console: ' + m.text()); });

  await page.addInitScript(() => { window.__lcp = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {} });
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  /* o interruptor "Reduzir movimento" acionado no MEIO do boot: nada pode
     ficar preso (SplitText no meio do caminho, opacidade zerada) */
  if (reduzirNoBoot) { await page.waitForTimeout(500); await page.evaluate(() => window.BEYON && window.BEYON.reduzir(true)); }
  await page.waitForTimeout(exige3d ? 9000 : 3500);

  const d = await page.evaluate(() => {
    const B = window.BEYON;
    const wa = [...document.querySelectorAll('[data-wa]')];
    const escondido = e => { const cs = getComputedStyle(e); return cs.opacity === '0' || cs.visibility === 'hidden'; };
    return {
      boot: !!B,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      waProntos: wa.filter(a => (a.getAttribute('href') || '').startsWith('https://wa.me/')).length,
      waTotal: wa.length,
      presos: [...document.querySelectorAll('.hero__title, .display, .hero__sub, .hero__actions')].filter(escondido).length,
      barraOk: !document.getElementById('barra') || innerWidth > 820 || getComputedStyle(document.getElementById('barra')).position === 'fixed'
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
  /* o CAMPO desenha (o fundo nunca pode virar tela preta em silêncio) */
  const campo = await page.evaluate(() => {
    const B = window.BEYON;
    if (!document.querySelector('[data-rede]') || !document.documentElement.classList.contains('js')) return -1;
    return B && B.rede && B.rede.desenhados ? B.rede.desenhados() : 0;
  });
  /* lido DEPOIS da medição: se a esfera desistir sozinha no meio, aparece */
  const nucleo = await page.evaluate(() => document.documentElement.classList.contains('tem-nucleo') && !!document.querySelector('.nucleo.is-aceso'));

  const reais = erros.filter(e => !/ERR_CERT|GPU stall|swiftshader/i.test(e));
  const ok = (semNucleo || d.boot) && d.barraOk && d.overflowX === 0 &&
    d.waProntos === d.waTotal && reais.length === 0 && d.presos === 0 && d.presosNoFim === 0 && campo !== 0 &&
    (exige3d ? nucleo : (!nucleo && fps > 45)) &&
    /* LCP com orçamento (2,5s é o "bom" do Core Web Vitals); o primeiro alvo da rodada é artefato do headless */
    (primeiro || lcp < 2500);
  primeiro = false;
  if (!ok) falhou = true;

  console.log(
    (ok ? 'OK  ' : 'FALHA ') + nome.padEnd(11),
    'fps=' + String(fps).padStart(5) + (exige3d ? '(info)' : ''),
    'núcleo=' + (nucleo ? 'sim' : 'não'),
    'lcp=' + String(lcp).padStart(5) + 'ms',
    'rolagemX=' + d.overflowX,
    'wa=' + d.waProntos + '/' + d.waTotal,
    'presos=' + d.presos + '/' + d.presosNoFim,
    'campo=' + (campo < 0 ? '—' : campo > 0 ? 'ok' : 'VAZIO'),
    reais.length ? '\n     erros: ' + reais.join('\n     ') : ''
  );
  await ctx.close();
}

/* ==========================================================================
   A PASSAGEM entre páginas (js/passagem.js, css/passagem.css): a página voa
   e volta. O risco é ela ficar presa sumida, em escala ou medida errada.
   ========================================================================== */
const estadoPassagem = page => page.evaluate(() => {
  const main = getComputedStyle(document.querySelector('main'));
  const c = document.documentElement.classList;
  let chave = null;
  try { chave = sessionStorage.getItem('bz-passagem'); } catch {}
  return {
    url: location.pathname, opacidade: main.opacity, escala: main.transform,
    classes: ['passagem-sai', 'passagem-chega', 'passagem-ancora'].filter(k => c.contains(k)).join(',') || '—', chave
  };
});
const inteira = s => s.opacidade === '1' && s.escala === 'none' && s.classes === '—';
async function cenario(nome, opcoes, roteiro) {
  const ctx = await navegador.newContext(opcoes);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|wa\.me/.test(m.text())) erros.push('console: ' + m.text()); });
  let r;
  try { r = await roteiro(page); } catch (e) { r = { ok: false, info: 'quebrou: ' + e.message }; }
  const ok = r.ok && erros.length === 0;
  if (!ok) falhou = true;
  console.log((ok ? 'OK  ' : 'FALHA ') + nome.padEnd(18), r.info, erros.length ? '\n     erros: ' + erros.join('\n     ') : '');
  await ctx.close();
}
/* segura a navegação da saída (o setTimeout de SAI_MS, 600 ms): a página fica como se o navegador tivesse desistido */
const segurarNavegacao = page => page.evaluate(() => {
  const st = window.setTimeout;
  window.setTimeout = (f, ms, ...r) => (ms === 600 ? 0 : st(f, ms, ...r));
});

await cenario('passagem-vai', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.locator('a[href="/sites"]:visible').first().click();
  await page.waitForURL('**/sites', { timeout: 8000 });
  const chegando = await estadoPassagem(page);
  await page.waitForTimeout(2500);
  const s = await estadoPassagem(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  const presos = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity === '0').length);
  return { ok: chegando.classes.includes('passagem-chega') && inteira(s) && presos === 0,
    info: `chegou=${chegando.classes} depois: opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes} presos=${presos}` };
});
await cenario('passagem-volta', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.locator('a[href="/sites"]:visible').first().click();
  await page.waitForURL('**/sites', { timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.goBack();
  await page.waitForTimeout(800);
  const s = await estadoPassagem(page);
  return { ok: s.url === '/' && inteira(s), info: `url=${s.url} opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes}` };
});
await cenario('passagem-desiste', DESKTOP, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await segurarNavegacao(page);
  const link = page.locator('.nav a[href="/sites"]').first();
  const caixa = await link.boundingBox();
  await link.click();
  await page.waitForTimeout(150);
  const saindo = await estadoPassagem(page);
  /* no desktop os riscos saem do ponto clicado (o menu do topo não é o do celular) */
  const origem = await page.evaluate(() => { const r = document.querySelector('.passagem__riscos'); return { x: parseFloat(r.style.left), y: parseFloat(r.style.top) }; });
  const noLink = origem.x >= caixa.x && origem.x <= caixa.x + caixa.width && origem.y >= caixa.y && origem.y <= caixa.y + caixa.height;
  await page.waitForTimeout(2800);   /* SAI_MS (0,6 s) + DESISTE_MS (2 s) e folga */
  const s = await estadoPassagem(page);
  return { ok: saindo.classes === 'passagem-sai' && noLink && inteira(s) && s.chave === null,
    info: `saindo=${saindo.classes} origem no link=${noLink} 2,95 s depois: opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes} chave=${s.chave}` };
});
await cenario('passagem-menu', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await segurarNavegacao(page);
  await page.locator('.nav__toggle').click();
  await page.waitForTimeout(500);
  await page.locator('.nav__links a[href="/sites"]').click();
  await page.waitForTimeout(60);
  const altura = await page.evaluate(() => Math.round(document.querySelector('.nav__links').getBoundingClientRect().height));
  const s = await estadoPassagem(page);
  /* o menu fecha na hora: a transição de 320 ms cobriria o voo */
  return { ok: s.classes === 'passagem-sai' && altura === 0, info: `menu 60 ms depois: altura=${altura}px classes=${s.classes}` };
});
await cenario('passagem-ancora', DESKTOP, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => sessionStorage.setItem('bz-passagem', String(Date.now())));
  await page.goto(BASE + '/automacao#faq', { waitUntil: 'domcontentloaded' });
  const chegando = await estadoPassagem(page);
  await page.waitForTimeout(2500);
  const s = await estadoPassagem(page);
  const rolou = await page.evaluate(() => Math.round(scrollY));
  return { ok: chegando.classes === 'passagem-chega,passagem-ancora' && inteira(s) && rolou > 0,
    info: `chegou=${chegando.classes} depois: opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes} rolagem=${rolou}` };
});

/* ==========================================================================
   A MEDIÇÃO do caminho principal (js/medicao.js): o clique em "Monte seu
   orçamento" vira 'orcamento_iniciar' (não contato), e o WhatsApp de dentro
   do orçamento conta como contato nas métricas próprias, sem Google.
   ========================================================================== */
await cenario('medicao-orcamento', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__orc = []; window.__contato = [];
    window.BEYON.on('medicao:orcamento', d => window.__orc.push(d));
    window.BEYON.on('medicao:contato', d => window.__contato.push(d));
    /* segura a navegação: cancela o clique antes de todos (a medição ouve mesmo assim; a passagem respeita o cancelado) */
    window.addEventListener('click', e => e.preventDefault(), true);
  });
  await page.locator('.hero a[href="/orcamento"]:visible').first().click();
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => ({ orc: window.__orc, contato: window.__contato.length }));
  const d = r.orc[0] || {};
  return { ok: r.orc.length === 1 && d.origem_botao && d.origem_botao !== 'pagina' && d.pagina === '/' && r.contato === 0,
    info: `eventos=${r.orc.length} origem=${d.origem_botao} pagina=${d.pagina} contatos=${r.contato}` };
});
await cenario('medicao-wa-orc', DESKTOP, async page => {
  await page.route('https://wa.me/**', rota => rota.abort());
  await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__contato = []; document.addEventListener('bz:contato', e => window.__contato.push(e.detail)); });
  await page.locator('.orc-conversa a[href^="https://wa.me/"]').first().click();
  await page.waitForTimeout(300);
  /* o link do menu para o próprio orçamento não é "começar o orçamento" */
  await page.evaluate(() => { window.__orc = 0; window.BEYON.on('medicao:orcamento', () => window.__orc++); window.addEventListener('click', e => e.preventDefault(), true); });
  await page.locator('.nav a[href="/orcamento"]').first().click({ force: true });
  const r = await page.evaluate(() => ({
    contato: window.__contato, orc: window.__orc, google: !!document.querySelector('script[src*="googletagmanager"]'), aviso: !!document.querySelector('.consentimento')
  }));
  const d = r.contato[0] || {};
  return { ok: r.contato.length === 1 && d.origem_botao === 'orcamento-conversa' && d.pagina === '/orcamento' && r.orc === 0 && !r.google && !r.aviso,
    info: `contatos=${r.contato.length} origem=${d.origem_botao} pagina=${d.pagina} inicios=${r.orc} google=${r.google} aviso=${r.aviso}` };
});

await navegador.close();
console.log(falhou ? '\nAlguma coisa falhou — leia acima.' : '\nTudo certo.');
process.exit(falhou ? 1 : 0);
