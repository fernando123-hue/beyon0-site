/* E2E E MEDIDA DO RADAR NA PÁGINA DE ORÇAMENTO (PR 2d-ligação) num Chromium de verdade, contra o servidor local com a IA simulada (gatilho "leitura-sim": o dublê lê as palavras da própria pessoa).
     node docs/servidor.mjs . 8931                           (flag ligada: padrão do servidor local)
     BZ_PLANTA_LOCAL=desligada node docs/servidor.mjs . 8932 (flag desligada: a página de hoje)
     CHROMIUM=... node docs/e2e-radar.mjs [8931] [8932] [--rodadas N] [--so-medir | --so-olhar]
   OLHAR (capturas em docs/olhar-radar/, no .gitignore): a conversa de 3 turnos em 390, 320 e 1.280 px; depois de cada turno o radar (elemento) e a janela; o radar muda do 1º ao 3º.
   VERIFICAR: ligada, o radar entra no 1º turno, muda nos seguintes, tem 5 linhas por extenso, nenhum erro no console, sem rolagem lateral, nada de aria-live no radar; no 1.280 x 800 o cartão de
   investimento (#o-est) não sai da área visível do painel nem se mexe quando o radar entra. Desligada: o contêiner fica escondido, nenhum arquivo do radar é baixado, a conversa é a de sempre.
   MEDIR (CLS): o mesmo roteiro, ligada, com e sem o radar (a variante "sem" aborta o pedido de js/planta-radar.js: tudo o mais igual, inclusive a planta), e a desligada; o último turno leva 2,5 s
   de atraso na resposta (como a IA de verdade: sem isso a resposta cai nos 500 ms que o navegador perdoa depois de uma tecla). Janela de cada turno: do envio a +6 s. O delta de CLS do radar é
   (com - sem), em mediana das rodadas, e tem de ficar <= 0,01. Cada rodada manda um IP novo (o freio local conta sessões por IP). */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i < 0 ? padrao : (process.argv[i + 1] || ''); };
const tem = (nome) => process.argv.includes('--' + nome);
const portas = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const ON = 'http://127.0.0.1:' + (portas[0] || '8931'), OFF = 'http://127.0.0.1:' + (portas[1] || '8932');
const RODADAS = Number(arg('rodadas', '3'));
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const PASTA = new URL('./olhar-radar/', import.meta.url);
await mkdir(PASTA, { recursive: true });
const foto = (alvo, nome) => alvo.screenshot({ path: fileURLToPath(new URL(nome + '.png', PASTA)) });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
const mediana = (v) => { const o = v.slice().sort((a, b) => a - b); return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null; };
const RADAR_URL = /\/(planta-radar\.js|orcamento-radar\.css)/;
const TURNOS = [
  'Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional. Tem muita procura. leitura-sim',
  'Toda hora perguntam o horário e só a recepcionista atende.',
  'Preciso disso antes da feira de abril. Hoje fica tudo na minha cabeça.'
];
const nav = await chromium.launch({ executablePath: EXEC });

const ESPIAO = () => {
  window.__ls = [];
  const desc = (n) => (n ? n.nodeName + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : '?');
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ls.push({ v: e.value, t: Math.round(e.startTime), recente: e.hadRecentInput, fontes: (e.sources || []).map((s) => desc(s.node)) }))).observe({ type: 'layout-shift', buffered: true });
};

async function abrir(base, { larg = 390, alt = 844, semRadar = false, atrasoNoUltimo = false } = {}) {
  const movel = larg < 500;
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: movel, hasTouch: movel, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  const baixados = [], erros = [];
  page.on('request', (r) => { if (RADAR_URL.test(r.url()) || /orcamento-planta-forma\.js/.test(r.url())) baixados.push(r.url().split('/').pop()); });
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /radar|beyon/.test(m.text()))) erros.push(m.text()); });
  page.on('dialog', (d) => { erros.push('diálogo: ' + d.message()); d.dismiss(); });
  await page.addInitScript(ESPIAO);
  if (semRadar) await page.route('**/js/planta-radar.js', (r) => r.abort());
  const ctl = { atraso: false };
  await page.route('**/api/vendas?acao=mensagem*', async (r) => { if (ctl.atraso) await espera(2500); r.continue(); });
  await page.goto(base + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#o-perguntas:not([hidden])');
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 });
  await page.click('#o-conversar');
  return { ctx, page, baixados, erros, ctl };
}
async function turno(page, texto) {
  const n = await page.locator('#o-log .msg--agente').count();
  await page.fill('#o-texto', texto);
  await page.press('#o-texto', 'Enter');
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  await espera(500);
}
/* o cartão de investimento no painel (com a rolagem do painel no topo, como a pessoa o vê ao chegar): onde está e que fração dele a área visível do painel mostra */
const geometriaDoCartao = async (page) => { await page.evaluate(() => { window.scrollTo(0, document.querySelector('.orc-mesa').getBoundingClientRect().top + window.scrollY - 80); document.querySelector('.orc-painel').scrollTop = 0; }); await espera(400);   /* a mesa no alto da tela, como quem conversa */ return page.evaluate(() => {
  const p = document.querySelector('.orc-painel');
  const e = document.getElementById('o-est').getBoundingClientRect(), r = p.getBoundingClientRect();
  const topo = Math.max(e.top, r.top, 0), base = Math.min(e.bottom, r.bottom, innerHeight);
  return { estTop: Math.round(e.top), estBottom: Math.round(e.bottom), painelTop: Math.round(r.top), painelBottom: Math.round(r.bottom), janela: innerHeight, rola: p.scrollHeight > p.clientHeight, visivel: +(Math.max(0, base - topo) / e.height).toFixed(2) };
}); };
const lateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const niveis = (page) => page.evaluate(() => [...document.querySelectorAll('#o-radar .plr-linha')].map((l) => l.querySelector('.plr-eixo').textContent + ': ' + l.querySelector('.plr-nivel').textContent));
const poligono = (page) => page.evaluate(() => (document.querySelector('#o-radar .plr-leitura') || { getAttribute: () => '' }).getAttribute('points'));
/* leva o radar à tela (rolagem da página; no 1.280 também a do painel) para a captura */
async function aoRadar(page) {
  await page.evaluate(() => { const r = document.getElementById('o-radar'); const p = r.closest('.orc-painel'); if (p && p.scrollHeight > p.clientHeight) p.scrollTop = p.scrollHeight; r.scrollIntoView({ block: 'center' }); });
  await espera(500);
}

/* ---------- VERIFICAR + OLHAR ---------- */
if (!tem('so-medir')) for (const [larg, alt] of [[390, 844], [320, 640], [1280, 800]]) {
  console.log('\n== flag ligada, ' + larg + ' x ' + alt + ' (' + ON + ') ==');
  const { ctx, page, baixados, erros } = await abrir(ON, { larg, alt });
  const desk = larg >= 900;
  ok(await page.locator('#o-radar').isHidden() && baixados.length === 0, 'antes da conversa: o contêiner está escondido e nada do radar foi baixado');
  let estAntes = null;
  const geo = () => geometriaDoCartao(page);
  if (desk) {
    /* a referência: a MESMA página, no mesmo turno, sem o radar (o pedido de js/planta-radar.js é abortado). O cartão não pode mudar de lugar nem de tamanho por causa dele */
    const base = await abrir(ON, { larg, alt, semRadar: true });
    estAntes = [];
    for (const t of TURNOS) { await turno(base.page, t); estAntes.push(await geometriaDoCartao(base.page)); }
    await base.ctx.close();
    console.log('  sem o radar, turnos 1 a 3: ' + JSON.stringify(estAntes.map((g) => [g.estTop, g.estBottom, g.visivel])));
  }
  const lidos = [], pol = [];
  for (let i = 0; i < TURNOS.length; i++) {
    await turno(page, TURNOS[i]);
    if (i === 0) await page.waitForSelector('#o-radar:not([hidden]) .plr', { timeout: 15000 });
    await espera(700);
    lidos.push((await niveis(page)).join(' | ')); pol.push(await poligono(page));
    console.log('  turno ' + (i + 1) + ': ' + lidos[i]);
    if (i === 0) {
      ok(baixados.filter((b) => /planta-radar/.test(b)).length === 1 && baixados.filter((b) => /orcamento-radar\.css/.test(b)).length === 1, 'o radar e o CSS foram baixados uma vez cada: ' + baixados.join(','));
      ok(await page.locator('#o-radar .plr-linha').count() === 5, 'o radar tem 5 linhas na lista (a lista <dl> sempre visível)');
      ok(await page.evaluate(() => !document.querySelector('#o-radar [aria-live], #o-radar [role=status], #o-radar [role=alert]')), 'o radar não tem região viva (a única é a do chat)');
      ok(await page.evaluate(() => document.querySelector('#o-radar').parentElement.classList.contains('orc-painel') && document.querySelector('#o-radar').previousElementSibling !== null), 'o radar está na coluna do painel');
      ok(await page.evaluate(() => { const r = document.getElementById('o-radar'); return r.compareDocumentPosition(document.getElementById('o-est')) & Node.DOCUMENT_POSITION_PRECEDING; }) > 0, 'o radar fica DEPOIS do cartão de investimento no documento');
      if (desk) {
        const g = await geo();
        console.log('  com o radar, turno 1:  ' + JSON.stringify(g));
        ok(Math.abs(g.estTop - estAntes[0].estTop) <= 1 && Math.abs(g.estBottom - estAntes[0].estBottom) <= 1, 'o cartão não saiu do lugar nem mudou de tamanho por causa do radar (topo ' + estAntes[0].estTop + ' -> ' + g.estTop + ', base ' + estAntes[0].estBottom + ' -> ' + g.estBottom + ')');
      }
    }
    if (desk) { const g = await geo(); ok(Math.abs(g.estTop - estAntes[i].estTop) <= 1 && g.visivel >= estAntes[i].visivel - 0.01, 'turno ' + (i + 1) + ': o cartão está onde estaria sem o radar (topo ' + g.estTop + ' contra ' + estAntes[i].estTop + '; o painel mostra ' + Math.round(g.visivel * 100) + '% dele, sem o radar ' + Math.round(estAntes[i].visivel * 100) + '%)'); }
    await aoRadar(page);
    await foto(page, 'ligada-' + larg + '-turno' + (i + 1) + '-janela');
    await foto(page.locator('#o-radar'), 'ligada-' + larg + '-turno' + (i + 1) + '-radar');
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  ok(lidos[0] !== lidos[1] && lidos[1] !== lidos[2], 'o radar MUDA do 1º ao 3º turno (texto das linhas)');
  ok(pol[0] !== pol[1] && pol[1] !== pol[2], 'e o polígono também (pontos do SVG)');
  ok(/Volume: deixou claro/.test(lidos[0]) && /Urgência: deixou claro/.test(lidos[2]) && /Informação espalhada: deixou claro/.test(lidos[2]), 'os níveis acompanham o que a pessoa disse');
  ok(await page.evaluate(() => /muita procura/.test(document.getElementById('o-radar').textContent) && /na minha cabeça/.test(document.getElementById('o-radar').textContent)), 'as evidências são as palavras da pessoa');
  ok(await lateral(page), 'sem rolagem lateral');
  ok(await page.evaluate((l) => innerWidth === l && !!document.querySelector('#o-radar .plr') && document.querySelector('.orc-painel').getBoundingClientRect().right <= innerWidth + 0.5, larg), 'a viewport não foi alargada (innerWidth = ' + larg + ') e o painel com o radar cabe nela');
  ok(erros.length === 0, 'nenhum erro nem aviso no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

/* ---------- flag DESLIGADA ---------- */
if (!tem('so-medir')) {
  console.log('\n== flag desligada (' + OFF + ') ==');
  const { ctx, page, baixados, erros } = await abrir(OFF);
  for (const t of TURNOS) await turno(page, t);
  ok(await page.locator('#o-radar').isHidden(), 'o contêiner do radar segue escondido');
  ok(baixados.length === 0, 'nenhum arquivo do radar nem da forma foi baixado (' + baixados.join(',') + ')');
  ok(await page.locator('#o-radar .plr').count() === 0, 'nada foi montado');
  ok(erros.length === 0, 'nenhum erro no console');
  await ctx.close();
}

/* ---------- MEDIR o CLS ---------- */
if (!tem('so-olhar')) {
  async function rodada(base, larg, alt, semRadar) {
    const { ctx, page, ctl, erros } = await abrir(base, { larg, alt, semRadar });
    const out = [];
    for (let i = 0; i < TURNOS.length; i++) {
      ctl.atraso = true;
      const marca = await page.evaluate(() => ({ n: window.__ls.length, t: Math.round(performance.now()) }));
      await turno(page, TURNOS[i]);
      await espera(6000);
      const ls = await page.evaluate((m) => window.__ls.slice(m.n), marca);
      out.push({ cls: +ls.filter((x) => !x.recente).reduce((s, x) => s + x.v, 0).toFixed(5), bruto: +ls.reduce((s, x) => s + x.v, 0).toFixed(5), do_radar: +ls.filter((x) => !x.recente && x.fontes.some((n) => /o-radar|plr/.test(n))).reduce((s, x) => s + x.v, 0).toFixed(5), fontes: [...new Set(ls.filter((x) => !x.recente).flatMap((x) => x.fontes))].slice(0, 6) });
    }
    await ctx.close();
    return { turnos: out, erros };
  }
  console.log('\n== CLS (mediana de ' + RODADAS + ' rodadas; com radar - sem radar; desligada de referência) ==');
  await rodada(ON, 390, 844, false).catch(() => {});   /* aquecimento */
  const resumo = [];
  for (const [larg, alt] of [[390, 844], [320, 640], [1280, 800]]) {
    const por = { com: [], sem: [], desligada: [] };
    for (let i = 0; i < RODADAS; i++) for (const k of (i % 2 ? ['sem', 'com', 'desligada'] : ['com', 'sem', 'desligada'])) {
      try { por[k].push(await rodada(k === 'desligada' ? OFF : ON, larg, alt, k === 'sem')); } catch (e) { console.log('  rodada falhou (' + [larg, k].join(' ') + '): ' + e.message.split('\n')[0]); }
    }
    for (let t = 0; t < TURNOS.length; t++) {
      const m = (k, campo) => mediana(por[k].map((r) => r.turnos[t][campo]));
      const delta = +(m('com', 'cls') - m('sem', 'cls')).toFixed(5), vsOff = +(m('com', 'cls') - m('desligada', 'cls')).toFixed(5);
      resumo.push({ larg, turno: t + 1, com: m('com', 'cls'), sem: m('sem', 'cls'), desligada: m('desligada', 'cls'), delta, vsDesligada: vsOff, doRadar: m('com', 'do_radar') });
      console.log('  ' + larg + ' px, turno ' + (t + 1) + ': com ' + m('com', 'cls') + ' | sem ' + m('sem', 'cls') + ' | desligada ' + m('desligada', 'cls') + ' | delta do radar ' + delta + ' | CLS cujo nó é do radar ' + m('com', 'do_radar'));
      ok(delta <= 0.01, 'delta de CLS do radar <= 0,01 (' + larg + ' px, turno ' + (t + 1) + ')');
    }
    const erros = [].concat(...por.com.map((r) => r.erros));
    ok(erros.length === 0, 'sem erro no console nas rodadas com radar (' + larg + ' px)');
  }
  console.log('\n' + JSON.stringify(resumo));
}
await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
