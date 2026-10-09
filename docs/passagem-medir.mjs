/* Mede a SUAVIDADE da passagem (js/passagem.js): quadros perdidos na saída e na chegada, num celular simulado
   (390 px, densidade 3, processador 4x mais lento) com a GPU de verdade da máquina.
   Uso: BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/passagem-medir.mjs [rodadas]
   Lê o rastreio do Chrome (PipelineReporter: cada quadro e o seu estado). Perdido = STATE_DROPPED.
   O documento antigo e o novo têm árvores de camadas diferentes (layer_tree_host_id): a saída é a do antigo, a
   chegada é a do novo, e o vão entre o último quadro do antigo e o primeiro do novo é a tela parada no meio.
   O toque é como o de um dedo: encosta, ~100 ms, solta.
   Só os quadros que mexem (has_compositor_animation ou has_main_animation) entram na conta. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const RODADAS = Number(process.argv[2]) || 3;
const VIAGENS = [
  { de: '/', alvo: '/sites' },
  { de: '/', alvo: '/automacao' },
  { de: '/', alvo: '/orcamento' },
  { de: '/sites', alvo: '/' }
];
const JANELA_MS = 2600;

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

function analisar(buf) {
  const ev = JSON.parse(buf.toString()).traceEvents;
  const quadros = ev.filter(e => e.name === 'PipelineReporter' && e.ph === 'b' && e.args && e.args.frame_reporter)
    .map(e => ({ ts: e.ts / 1000, host: e.args.frame_reporter.layer_tree_host_id, estado: e.args.frame_reporter.state, mexe: e.args.frame_reporter.has_compositor_animation || e.args.frame_reporter.has_main_animation }))
    .sort((a, b) => a.ts - b.ts);
  const hosts = [...new Set(quadros.map(q => q.host))];
  const resumo = hosts.map(h => {
    const qs = quadros.filter(q => q.host === h && q.mexe);
    return { host: h, total: qs.length, perdidos: qs.filter(q => q.estado === 'STATE_DROPPED').length, ini: qs.length ? qs[0].ts : 0, fim: qs.length ? qs[qs.length - 1].ts : 0 };
  }).filter(r => r.total > 0);
  const [saida, chegada] = resumo;
  return { saida, chegada, vao: saida && chegada ? Math.round(chegada.ini - saida.fim) : null };
}

const pct = (r) => (r && r.total ? Math.round(100 * r.perdidos / r.total) + '% (' + r.perdidos + '/' + r.total + ')' : '—');
for (const v of VIAGENS) {
  const linhas = [];
  for (let i = 0; i < RODADAS; i++) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.goto(BASE + v.de, { waitUntil: 'load', timeout: 90000 });
    await p.waitForTimeout(4000);
    await p.locator('.nav__toggle').tap();
    await p.waitForTimeout(600);
    await nav.startTracing(p, { categories: ['benchmark', 'cc', 'viz'] });
    const link = v.alvo === '/' ? '.nav__logo' : `.nav a[href="${v.alvo}"]`;
    /* um dedo de verdade: encosta, fica ~100 ms e solta (o clique sai no soltar) */
    const caixa = await p.locator(link).first().boundingBox();
    const ponto = [{ x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto });
    await p.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(JANELA_MS);
    const r = analisar(await nav.stopTracing());
    linhas.push(r);
    await ctx.close();
  }
  const soma = (k, c) => linhas.reduce((s, r) => s + (r[k] ? r[k][c] : 0), 0);
  const tot = k => ({ total: soma(k, 'total'), perdidos: soma(k, 'perdidos') });
  const vaos = linhas.map(r => r.vao).filter(x => x !== null);
  console.log((v.de + ' → ' + v.alvo).padEnd(18), 'saída perdidos', pct(tot('saida')).padEnd(14), 'chegada perdidos', pct(tot('chegada')).padEnd(14),
    'vão', vaos.length ? Math.round(vaos.reduce((a, b) => a + b, 0) / vaos.length) + ' ms' : '—');
}
await nav.close();
