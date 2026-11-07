/* MEDE O /sites LEVE (2026-11-07): CLS com as fontes de cada deslocamento, LCP com o elemento e a CPU ocupada por
   janela de tempo (a planta do hero, js/peca-sites.js), em A/B na MESMA sessão: dois servidores locais, o código de antes
   e o de agora, alternados a cada rodada (a deriva da máquina não cai toda num lado). A 1ª carga de cada lado é
   aquecimento e não entra (o headless sobe o processo de GPU nela).
     node docs/servidor.mjs . 8941                      (agora)
     node docs/servidor.mjs <cópia de origin/main> 8942 (antes)
   Uso:  CHROMIUM=... node docs/medir-sites-leve.mjs <modo> [opções]
     modo cls      CLS (sem entrada recente), as fontes, o LCP e o elemento dele
     modo ocioso   1440x900: a CPU ocupada (TaskDuration do CDP) por segundo, do load a --ate ms; com --fora ms, rola a
                   página para a planta sair da tela nesse instante e (com --volta ms) voltar; registra a largura da
                   moldura no tempo (a demonstração parou e voltou de onde estava?)
     modo olhar    screenshots dos dois lados nas mesmas posições de rolagem (--larguras 390,320,1280,1440)
     modo comparar % de pixels diferentes entre <rótulo A>-*.png e <rótulo B>-*.png da --pasta
     --portas 8941,8942  --rotulos agora,antes  --rodadas 3  --tamanho 390x844|1440x900  --cpu 4  --rede 4g
     --espera 11000 (cls: quanto esperar depois do load)  --ate 15000  --fora 3200  --volta 9000  --json saida.json
   O headless desenha por software: serve para COMPARAR, não como número de aparelho. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i < 0 ? padrao : (process.argv[i + 1] || ''); };
const MODO = process.argv[2];
if (!['cls', 'ocioso', 'olhar', 'comparar'].includes(MODO)) { console.log('Uso: node docs/medir-sites-leve.mjs cls|ocioso|olhar|comparar [--larguras 390,320,1280,1440 --pasta docs/olhar-sites-leve --portas 8941,8942 --rotulos agora,antes --rodadas 3 --tamanho 390x844 --cpu 4 --rede 4g --espera 11000 --ate 15000 --fora 3200 --volta 9000 --json saida.json]'); process.exit(0); }
const PORTAS = arg('portas', '8941,8942').split(',');
const ROTULOS = arg('rotulos', 'agora,antes').split(',');
const RODADAS = Number(arg('rodadas', '3'));
const [LARG, ALT] = arg('tamanho', MODO === 'ocioso' ? '1440x900' : '390x844').split('x').map(Number);
const CPU = Number(arg('cpu', '1'));
const REDE = arg('rede', '');
const ESPERA = Number(arg('espera', '11000'));
const ATE = Number(arg('ate', '15000'));
const FORA = Number(arg('fora', '0'));
const VOLTA = Number(arg('volta', '0'));
const CELULAR = LARG < 768;
const OPCOES = CELULAR ? { viewport: { width: LARG, height: ALT }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: LARG, height: ALT } };
/* o "Slow 4G" do Lighthouse: 150 ms de ida e volta, 1,6 Mbit/s para baixo, 750 kbit/s para cima */
const REDE_4G = { offline: false, latency: 150, downloadThroughput: 1638.4 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };

function observar() {
  window.__m = { cls: 0, clsBruto: 0, desloc: [], lcp: 0, lcpEl: '' };
  const nome = n => !n ? '?' : n.nodeType !== 1 ? '#' + n.nodeName : n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = nome(e.element); } }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) {
        window.__m.clsBruto += e.value;
        if (!e.hadRecentInput) window.__m.cls += e.value;
        window.__m.desloc.push({ t: Math.round(e.startTime), v: +e.value.toFixed(5), entrada: e.hadRecentInput, fontes: (e.sources || []).map(s => ({ no: nome(s.node), de: [Math.round(s.previousRect.y), Math.round(s.previousRect.height)], para: [Math.round(s.currentRect.y), Math.round(s.currentRect.height)] })) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
}

async function abrir(nav, porta) {
  const ctx = await nav.newContext(OPCOES);
  const page = await ctx.newPage();
  await page.addInitScript(observar);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (REDE === '4g') { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', REDE_4G); }
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto('http://127.0.0.1:' + porta + '/sites.html', { waitUntil: 'load', timeout: 120000 });
  return { ctx, page, cdp, erros, t0: Date.now() };
}
const metricas = async cdp => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const esperarAte = async (aberto, ms) => { const falta = ms - (Date.now() - aberto.t0); if (falta > 0) await aberto.page.waitForTimeout(falta); };

async function rodadaCls(nav, porta) {
  const a = await abrir(nav, porta);
  await a.page.waitForTimeout(ESPERA);
  const m = await a.page.evaluate(() => {
    const nv = performance.getEntriesByType('navigation')[0], fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return Object.assign({}, window.__m, { load: Math.round(nv.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : 0 });
  });
  await a.ctx.close();
  return { cls: +m.cls.toFixed(4), clsBruto: +m.clsBruto.toFixed(4), lcp: Math.round(m.lcp), lcpEl: m.lcpEl, fcp: m.fcp, load: m.load, n: m.desloc.length, desloc: m.desloc, erros: a.erros };
}

async function rodadaOcioso(nav, porta) {
  const a = await abrir(nav, porta);
  const serie = [], larguras = [];
  let antes = await metricas(a.cdp), rolou = false, voltou = false;
  for (let t = 1000; t <= ATE; t += 1000) {
    if (FORA && !rolou && t > FORA) { await esperarAte(a, FORA); await a.page.evaluate(() => window.scrollTo(0, document.querySelector('.planta__palco').getBoundingClientRect().bottom + window.scrollY + 200)); rolou = true; }
    if (VOLTA && !voltou && t > VOLTA) { await esperarAte(a, VOLTA); await a.page.evaluate(() => window.scrollTo(0, 0)); voltou = true; }
    await esperarAte(a, t);
    const agora = await metricas(a.cdp);
    larguras.push(await a.page.evaluate(() => { const m = document.querySelector('.planta__moldura'); return m ? m.style.width : ''; }));
    serie.push({ t, task: Math.round((agora.TaskDuration - antes.TaskDuration) * 1000), layout: Math.round((agora.LayoutDuration - antes.LayoutDuration) * 1000), estilo: Math.round((agora.RecalcStyleDuration - antes.RecalcStyleDuration) * 1000), layouts: agora.LayoutCount - antes.LayoutCount });
    antes = agora;
  }
  const m = await a.page.evaluate(() => ({ cls: window.__m.cls, n: window.__m.desloc.length }));
  await a.ctx.close();
  /* a janela do baseline: de 2,5 s a 5,5 s depois do load (como docs/medir.mjs), aqui em segundos inteiros 3..5 + metade de 2 e de 6 */
  const janela = (de, ate) => serie.filter(s => s.t > de && s.t <= ate).reduce((n, s) => n + s.task, 0);
  return { serie, larguras, cls: +m.cls.toFixed(4), n: m.n, j3a6: janela(3000, 6000), j6a9: janela(6000, 9000), j12a15: janela(12000, 15000), erros: a.erros };
}

/* modo olhar: os dois lados nas MESMAS posições de rolagem (o topo e a planta no alto da tela), depois de tudo assentar
   (--espera no topo, --depois na planta), em docs/olhar-sites-leve/<rótulo>-<largura>-<posição>.png */
async function olhar(nav) {
  const pasta = arg('pasta', 'docs/olhar-sites-leve');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(pasta, { recursive: true });
  for (const w of arg('larguras', '390,320,1280,1440').split(',').map(Number)) {
    const h = w < 768 ? (w < 360 ? 640 : 844) : 900;
    const opc = w < 768 ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: w, height: h } };
    for (let k = 0; k < PORTAS.length; k++) {
      const ctx = await nav.newContext(opc), page = await ctx.newPage();
      await page.goto('http://127.0.0.1:' + PORTAS[k] + '/sites.html', { waitUntil: 'load', timeout: 120000 });
      await page.mouse.move(5, 5);
      await page.waitForTimeout(ESPERA);
      await page.screenshot({ path: `${pasta}/${ROTULOS[k]}-${w}-topo.png` });
      const y = await page.evaluate(() => Math.round(document.querySelector('.planta').getBoundingClientRect().top + scrollY - 80));
      await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y);
      await page.waitForTimeout(Number(arg('depois', '9000')));   /* (no celular a demo começa ao rolar até a planta: ~6 s e a reimpressão) */
      await page.screenshot({ path: `${pasta}/${ROTULOS[k]}-${w}-planta.png` });
      console.log(ROTULOS[k], w, 'planta em y =', y);
      await ctx.close();
    }
  }
}

/* modo comparar: cada <rótulo A>-*.png da --pasta contra o <rótulo B>-*.png do mesmo nome — % de pixels diferentes
   (mais de 24 em algum canal) e a caixa onde estão. Olhar os PNG continua obrigatório: isto só aponta onde olhar */
async function comparar(nav) {
  const { readdirSync, readFileSync } = await import('node:fs');
  const pasta = arg('pasta', 'docs/olhar-sites-leve'), [A, B] = ROTULOS;
  const page = await nav.newPage();
  for (const f of readdirSync(pasta).filter(f => f.startsWith(A + '-') && f.endsWith('.png')).sort()) {
    const g = f.replace(A + '-', B + '-');
    const par = [readFileSync(pasta + '/' + f).toString('base64'), readFileSync(pasta + '/' + g).toString('base64')];
    const r = await page.evaluate(async ([a, b]) => {
      const img = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
      const [ia, ib] = await Promise.all([img(a), img(b)]);
      const w = ia.width, h = ia.height;
      const px = i => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, w, h).data; };
      const da = px(ia), db = px(ib);
      let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        if (Math.abs(da[k] - db[k]) > 24 || Math.abs(da[k + 1] - db[k + 1]) > 24 || Math.abs(da[k + 2] - db[k + 2]) > 24) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      return { tam: w + 'x' + h, mesmoTam: w === ib.width && h === ib.height, pct: +(100 * n / (w * h)).toFixed(3), caixa: n ? [x0, y0, x1, y1] : null };
    }, par);
    console.log(f, 'vs', g, JSON.stringify(r));
  }
}

const mediana = v => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
if (MODO === 'olhar' || MODO === 'comparar') { await (MODO === 'olhar' ? olhar : comparar)(nav); await nav.close(); process.exit(0); }
const rodar = MODO === 'cls' ? rodadaCls : rodadaOcioso;
for (const p of PORTAS) await rodar(nav, p);   /* aquecimento de cada lado (não entra) */
const res = Object.fromEntries(ROTULOS.map(r => [r, []]));
for (let i = 0; i < RODADAS; i++) for (let k = 0; k < PORTAS.length; k++) {
  const j = i % 2 ? PORTAS.length - 1 - k : k;   /* alterna quem vai primeiro */
  res[ROTULOS[j]].push(await rodar(nav, PORTAS[j]));
}
await nav.close();
console.log(MODO, LARG + 'x' + ALT, 'cpu ' + CPU + 'x', REDE || 'sem rede limitada', RODADAS + ' rodadas');
for (const r of ROTULOS) {
  const v = res[r];
  if (MODO === 'cls') {
    console.log(r.padEnd(6), 'CLS', v.map(x => x.cls).join(' / '), '→ mediana', mediana(v.map(x => x.cls)), '| LCP', v.map(x => x.lcp).join(' / '), '→', mediana(v.map(x => x.lcp)), 'ms |', [...new Set(v.map(x => x.lcpEl))].join(','), '| deslocamentos', v.map(x => x.n).join('/'));
    console.log('        FCP', v.map(x => x.fcp).join(' / '), '| load', v.map(x => x.load).join(' / '));
    const maiores = v.flatMap(x => x.desloc).filter(d => !d.entrada).sort((a, b) => b.v - a.v).slice(0, 4);
    for (const d of maiores) console.log('        ', d.t + ' ms', d.v, d.fontes.map(f => f.no + ' ' + f.de.join(',') + '→' + f.para.join(',')).join(' ; '));
  } else {
    console.log(r.padEnd(6), 'CPU 3–6 s', v.map(x => x.j3a6).join(' / '), '→', mediana(v.map(x => x.j3a6)), 'ms | 6–9 s', mediana(v.map(x => x.j6a9)), '| 12–15 s', mediana(v.map(x => x.j12a15)), '| CLS', mediana(v.map(x => x.cls)), '| deslocamentos', v.map(x => x.n).join('/'));
    console.log('        por segundo (1ª rodada):', v[0].serie.map(s => s.task).join(' '), '| layouts:', v[0].serie.map(s => s.layouts).join(' '));
    console.log('        moldura (1ª rodada):', v[0].larguras.join(' '));
  }
  const erros = v.flatMap(x => x.erros);
  if (erros.length) console.log('        ERROS:', erros.slice(0, 3).join(' | '));
}
if (arg('json', '')) writeFileSync(arg('json', ''), JSON.stringify(res, null, 1));
