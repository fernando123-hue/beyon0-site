/* MEDE A CARGA DO /orcamento (o "orçamento leve", 2026-11-07): CLS da carga, DCL, FCP, "perguntas usáveis" e o JS baixado antes do 1º toque.
     node docs/servidor.mjs . 8951
     CHROMIUM=... node docs/medir-orcamento-leve.mjs [8951] [--larguras 390,1440] [--rodadas 3] [--cpu 4] [--salvo] [--fotos <rotulo>]
   Cada rodada abre um contexto novo (visita nova, sem nada salvo) no mesmo navegador; a 1ª carga da execução é de aquecimento e não entra
   (CLAUDE.md: o 1º carregamento do headless é lento). O CPU é estrangulado (--cpu, padrão 4) só abaixo de 500 px; o computador roda sem.
   "Perguntas usáveis" = o instante em que o js/orcamento.js abre as perguntas (BZPerguntas.iniciar), com os botões já ligados.
   O CLS é o da métrica (sem deslocamento logo depois de ação da pessoa), da navegação até 2,5 s depois do load.
   --salvo: a mesma medida com um pedido SALVO no aparelho (as perguntas respondidas até o preço, que cria a sessão): a retomada não pode
     mostrar as perguntas nem saltar. Imprime também se as perguntas apareceram em algum quadro.
   --fotos <rotulo>: em vez de medir, tira as capturas da 1ª tela (390 x 844, 320 x 640: a pergunta e quantas opções cabem sem rolar) e da
     mesa com o preço e a conversa fechada (1.280 x 800 e 1.440 x 900, com e sem "Quer ajustar?"), em docs/olhar-orcamento-leve/ (no .gitignore).
     ABRA e OLHE. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i < 0 ? padrao : (process.argv[i + 1] || ''); };
const porta = process.argv.slice(2).filter((a) => /^\d+$/.test(a))[0] || '8951';
const BASE = 'http://127.0.0.1:' + porta;
const LARGURAS = arg('larguras', '390,1440').split(',').map(Number);
const RODADAS = Number(arg('rodadas', '3'));
const CPU = Number(arg('cpu', '4'));
const SALVO = process.argv.includes('--salvo');
const FOTOS = arg('fotos', '');
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const ALTURAS = { 320: 640, 390: 844, 768: 1024, 1280: 800, 1440: 900 };
const PASTA = new URL('./olhar-orcamento-leve/', import.meta.url);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const mediana = (v) => { const o = v.filter((x) => x != null).sort((a, b) => a - b); return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null; };
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));

/* o espião: deslocamentos (com quem se moveu), o instante em que as perguntas ficam usáveis e se elas foram vistas em algum quadro */
const ESPIAO = () => {
  window.__ls = []; window.__usavel = null; window.__perguntasVistas = false;
  const desc = (n) => (n ? n.nodeName + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : '?');
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__ls.push({ v: e.value, t: Math.round(e.startTime), fontes: (e.sources || []).map((s) => desc(s.node)) }); })).observe({ type: 'layout-shift', buffered: true });
  let guardado;
  Object.defineProperty(window, 'BZPerguntas', { configurable: true, get: () => guardado, set: (v) => {
    const original = v && v.iniciar;
    guardado = original ? Object.assign({}, v, { iniciar: function () { const r = original.apply(this, arguments); if (window.__usavel == null) window.__usavel = performance.now(); return r; } }) : v;
  } });
  /* as perguntas em algum quadro da carga (a retomada com pedido salvo não pode mostrá-las) */
  const olhar = () => { const p = document.getElementById('o-perguntas'); if (p && p.getClientRects().length) window.__perguntasVistas = true; if (performance.now() < 8000) requestAnimationFrame(olhar); };
  requestAnimationFrame(olhar);
};

const nav = await chromium.launch({ executablePath: EXEC });

async function contexto(larg, armazenamento) {
  const movel = larg < 500;
  return nav.newContext({ viewport: { width: larg, height: ALTURAS[larg] || 844 }, isMobile: movel, hasTouch: movel, extraHTTPHeaders: { 'x-forwarded-for': ip() }, storageState: armazenamento });
}
async function perguntas(page) {
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 30000 });
}
/* um pedido salvo neste aparelho: responde até o preço (a sessão nasce aí) e devolve o localStorage */
async function pedidoSalvo(larg) {
  const ctx = await contexto(larg);
  const page = await ctx.newPage();
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#o-perguntas:not([hidden])');
  await perguntas(page);
  await page.click('#o-quero-modelos');
  await page.waitForSelector('#o-contato:not([hidden])', { timeout: 30000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

async function medir(larg, armazenamento) {
  const ctx = await contexto(larg, armazenamento);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.addInitScript(ESPIAO);
  if (larg < 500 && CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await espera(2500);
  const m = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const scripts = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script' || /\.js(\?|$)/.test(r.name));
    const proprios = scripts.filter((r) => r.name.indexOf(location.origin) === 0);
    const ls = window.__ls;
    const maior = ls.slice().sort((a, b) => b.v - a.v)[0];
    return {
      cls: ls.reduce((s, x) => s + x.v, 0), maior: maior ? maior.v.toFixed(4) + ' @' + maior.t + 'ms ' + maior.fontes.join(',') : '',
      dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null,
      usavel: window.__usavel == null ? null : Math.round(window.__usavel), vistas: window.__perguntasVistas,
      scripts: proprios.length, kb: Math.round(proprios.reduce((s, r) => s + (r.decodedBodySize || 0), 0) / 1024)
    };
  });
  m.erros = erros;
  await ctx.close();
  return m;
}

async function fotos(rotulo) {
  await mkdir(PASTA, { recursive: true });
  const salvar = (page, nome) => page.screenshot({ path: fileURLToPath(new URL(rotulo + '-' + nome + '.png', PASTA)) });
  for (const larg of [390, 320]) {
    const ctx = await contexto(larg);
    const page = await ctx.newPage();
    await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('#o-perguntas:not([hidden])');
    await espera(800);
    const g = await page.evaluate(() => {
      const h = document.getElementById('o-p-titulo').getBoundingClientRect();
      const ops = [...document.querySelectorAll('.orc-p[data-p="1"] .orc-op')].map((b) => b.getBoundingClientRect());
      const etapas = document.getElementById('o-etapas').getBoundingClientRect();
      return { pergunta: Math.round(h.top), opcoesInteiras: ops.filter((r) => r.bottom <= innerHeight).length, etapasAltura: Math.round(etapas.height), largura: document.documentElement.scrollWidth <= innerWidth };
    });
    console.log('  ' + larg + ' x ' + ALTURAS[larg] + ': a pergunta em y=' + g.pergunta + ', opções inteiras à vista: ' + g.opcoesInteiras + ', etapas com ' + g.etapasAltura + ' px, sem rolagem lateral: ' + g.largura);
    await salvar(page, larg + '-primeira-tela');
    await ctx.close();
  }
  for (const larg of [1280, 1440]) {
    const ctx = await contexto(larg);
    const page = await ctx.newPage();
    await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('#o-perguntas:not([hidden])');
    await perguntas(page);
    await espera(1500);
    const mesa = () => page.evaluate(() => {
      const m = document.querySelector('.orc-mesa'), p = document.querySelector('.orc-painel').getBoundingClientRect(), q = document.querySelector('.orc-perguntas, .orc-topo').getBoundingClientRect();
      window.scrollTo(0, m.getBoundingClientRect().top + window.scrollY - 80);
      return { colunas: getComputedStyle(m).gridTemplateColumns, painel: Math.round(p.left) + '..' + Math.round(p.right), topo: Math.round(q.left) + '..' + Math.round(q.right) };
    });
    console.log('  ' + larg + ' sem "Quer ajustar?": ' + JSON.stringify(await mesa()));
    await espera(400);
    await salvar(page, larg + '-mesa');
    await page.click('#o-ajustar-abrir');
    await espera(800);
    console.log('  ' + larg + ' com "Quer ajustar?": ' + JSON.stringify(await mesa()));
    await espera(400);
    await salvar(page, larg + '-mesa-ajustar');
    await ctx.close();
  }
}

if (FOTOS) {
  await fotos(FOTOS);
} else {
  await medir(LARGURAS[0]);   /* (aquecimento: não entra) */
  for (const larg of LARGURAS) {
    const armazenamento = SALVO ? await pedidoSalvo(larg) : undefined;
    const r = [];
    for (let i = 0; i < RODADAS; i++) r.push(await medir(larg, armazenamento));
    console.log('\n== ' + larg + ' x ' + (ALTURAS[larg] || 844) + (larg < 500 && CPU > 1 ? ', CPU ' + CPU + 'x' : '') + (SALVO ? ', pedido salvo' : ', visita nova') + ' ==');
    r.forEach((x, i) => console.log('  rodada ' + (i + 1) + ': CLS ' + x.cls.toFixed(4) + ' | FCP ' + x.fcp + ' | DCL ' + x.dcl + ' | usáveis ' + x.usavel + ' | load ' + x.load + ' | JS ' + x.scripts + ' arquivos, ' + x.kb + ' KB | perguntas vistas: ' + x.vistas + (x.maior ? ' | maior: ' + x.maior : '') + (x.erros.length ? ' | ERROS: ' + x.erros.join(' / ') : '')));
    console.log('  MEDIANA: CLS ' + mediana(r.map((x) => x.cls)).toFixed(4) + ' | FCP ' + mediana(r.map((x) => x.fcp)) + ' | DCL ' + mediana(r.map((x) => x.dcl)) + ' | usáveis ' + mediana(r.map((x) => x.usavel)) + ' | JS ' + mediana(r.map((x) => x.kb)) + ' KB');
  }
}
await nav.close();
