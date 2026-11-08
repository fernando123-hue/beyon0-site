/* Mede os ENGASGOS da Início (/) com a GPU de verdade: fps, quadros longos (> 100 ms), pior quadro e quanto do
   tempo o fio principal ficou ocupado (tarefas longas). A/B na mesma sessão, rodadas alternadas.
   Uso: BASE=http://127.0.0.1:9041 CHROMIUM=... node docs/hub-fps.mjs <cel|desk> [rodadas] [variantes]
   variantes: lista separada por vírgula; cada uma é "nome" ou "nome=pasta": com pasta, todo /js/<arquivo> que
   existir nela é servido dali (ex.: A=<pasta com o campo.js antigo>), sem pasta é a árvore de trabalho.
   Cada rodada lê o rastreio do Chrome: main (fio principal da página), gpu (fio principal do processo da GPU), raster
   (quanto disso é rasterizar o que a página manda) e pico (o pior meio segundo do processo da GPU), em ms por segundo.
   TRACE=<pasta>: grava o rastreio de cada rodada para abrir no DevTools. ESPERA, JANELA (ms), ROLAR (px), ROTA.
   cel = 390×844, densidade 3, toque, processador 4x mais lento; desk = 1440×900, densidade 1, mouse.
   FREIO_GPU=<0..1>: o processo da GPU fica preso a um núcleo só, com prioridade abaixo do normal, e um processo
   que ocupa essa fração do mesmo núcleo disputa com ele: o processo da GPU de um celular, que o "processador 4x mais
   lento" do Chrome não alcança (só freia o renderizador). Sem ele, esta máquina (GTX 1050 Ti, CPU de mesa) engole o
   que um celular não engole; com ele, o que pesa no processo da GPU aparece como quadro longo. */
import { chromium } from 'playwright';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:9041';
const PERFIL = process.argv[2] || 'cel';
const RODADAS = Number(process.argv[3]) || 3;
const VARIANTES = (process.argv[4] || 'atual').split(',').map(v => { const [nome, pasta] = v.split('='); return { nome, pasta }; });
const ROTA = process.env.ROTA || '/';
const ESPERA_MS = Number(process.env.ESPERA) || 5000, JANELA_MS = Number(process.env.JANELA) || 12000, LONGO_MS = 100;
const CEL = PERFIL === 'cel';

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const FREIO = Number(process.env.FREIO_GPU) || 0;
let disputa = null;
const prender = (pid, prioridade) => execFileSync('powershell', ['-NoProfile', '-Command', `$p = Get-Process -Id ${pid}; $p.ProcessorAffinity = 1; $p.PriorityClass = '${prioridade}'`]);
if (FREIO > 0) {
  const sessao = await nav.newBrowserCDPSession();
  let gpu = null;
  for (let k = 0; k < 50 && !gpu; k++) {   /* (o processo da GPU sobe um pouco depois do navegador) */
    gpu = (await sessao.send('SystemInfo.getProcessInfo')).processInfo.find(p => p.type === 'GPU');
    if (!gpu) await new Promise(ok => setTimeout(ok, 100));
  }
  if (!gpu) throw new Error('sem processo da GPU');
  prender(gpu.id, 'BelowNormal');
  const ocupa = Math.round(20 * FREIO), dorme = 20 - ocupa;
  disputa = spawn(process.execPath, ['-e', `const s = new Int32Array(new SharedArrayBuffer(4)); for (;;) { try { process.kill(${process.pid}, 0); } catch (e) { process.exit(); } const t = Date.now(); while (Date.now() - t < ${ocupa}); if (${dorme}) Atomics.wait(s, 0, 0, ${dorme}); }`], { stdio: 'ignore' });
  process.on('exit', () => disputa.kill());   /* (e a disputa sai sozinha se este processo morrer) */
  prender(disputa.pid, 'Normal');
  console.log('freio da GPU: processo', gpu.id, 'num núcleo só, disputando', ocupa + '/20 ms');
}

/* o processo da GPU: quanto tempo por segundo o fio principal dele (CrGpuMain) trabalhou, e quanto disso foi
   rasterizar as listas de desenho que o renderizador manda (DoRasterCHROMIUM: o canvas 2D e os ladrilhos).
   O processador 4x mais lento NÃO vale para este processo: num celular de verdade ele é tão lento quanto o resto;
   quando ele passa do quadro, a página espera a GPU com o fio principal livre (o engasgo). pico: o pior meio segundo
   (a onda do fôlego passa pela tela ~1 s a cada 7 s; a média esconde o surto) */
function gpuDoRastreio(buf) {
  const ev = JSON.parse(buf.toString()).traceEvents, nomes = new Map();
  ev.forEach(e => { if (e.ph === 'M' && e.name === 'thread_name') nomes.set(e.pid + ':' + e.tid, e.args.name); });
  let t0 = Infinity, t1 = 0, ocupado = 0, raster = 0, nRaster = 0, piorRaster = 0, principal = 0;
  const tarefas = [];
  for (const e of ev) {
    if (e.ph !== 'X' || !e.dur) continue;
    const fio = nomes.get(e.pid + ':' + e.tid);
    if (fio === 'CrRendererMain' && e.name === 'RunTask') principal += e.dur;   /* (o fio principal da página, para ver o custo dela) */
    if (fio !== 'CrGpuMain') continue;
    if (e.ts < t0) t0 = e.ts; if (e.ts + e.dur > t1) t1 = e.ts + e.dur;
    if (e.name === 'RunTask') { ocupado += e.dur; tarefas.push(e); }
    else if (e.name === 'RasterDecoderImpl::DoRasterCHROMIUM') { raster += e.dur; nRaster++; piorRaster = Math.max(piorRaster, e.dur); }
  }
  const s = Math.max(0.001, (t1 - t0) / 1e6), MEIO = 5e5, baldes = new Map();
  for (const e of tarefas) { const b = Math.floor((e.ts - t0) / MEIO); baldes.set(b, (baldes.get(b) || 0) + e.dur); }
  const pico = Math.round(Math.max(0, ...baldes.values()) / 1000 * 2);
  return { mainMs: Math.round(principal / 1000 / s), gpuMs: Math.round(ocupado / 1000 / s), rasterMs: Math.round(raster / 1000 / s), rasterPor: nRaster ? +(raster / 1000 / nRaster).toFixed(1) : 0, piorRaster: Math.round(piorRaster / 1000), pico };
}

async function rodada(v, i) {
  const ctx = await nav.newContext(CEL
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (v.pasta) await ctx.route(/\/js\/[^/?]+\.js(\?.*)?$/, async (r) => {
    const nome = new URL(r.request().url()).pathname.split('/').pop(), arq = join(v.pasta, nome);
    if (!existsSync(arq)) return r.continue();
    return r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: readFileSync(arq) });
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  if (CEL) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(BASE + ROTA, { waitUntil: 'load', timeout: 90000 });
  if (process.env.ROLAR) await p.evaluate(y => window.scrollTo(0, y), Number(process.env.ROLAR));
  await p.waitForTimeout(ESPERA_MS);
  await nav.startTracing(p, { categories: ['disabled-by-default-devtools.timeline', 'gpu'] });
  const r = await p.evaluate(({ janela, longo }) => new Promise(ok => {
    const qs = [], tarefas = [];
    let po = null;
    try { po = new PerformanceObserver(l => l.getEntries().forEach(e => tarefas.push([e.startTime, e.duration]))); po.observe({ type: 'longtask' }); } catch (e) { /* sem longtask */ }
    const t0 = performance.now(); let antes = t0;
    function q(t) {
      qs.push([antes, t - antes]); antes = t;
      if (performance.now() - t0 < janela) requestAnimationFrame(q);
      else {
        if (po) po.disconnect();
        const longos = qs.filter(x => x[1] > longo).map(x => {
          const ocup = tarefas.reduce((s, tk) => s + Math.max(0, Math.min(x[0] + x[1], tk[0] + tk[1]) - Math.max(x[0], tk[0])), 0);
          return { em: Math.round(x[0] - t0), ms: Math.round(x[1]), ocupado: Math.round(ocup) };
        });
        ok({ fps: +(qs.length / ((antes - t0) / 1000)).toFixed(1), longos, pior: Math.round(Math.max.apply(null, qs.map(x => x[1]))) });
      }
    }
    requestAnimationFrame(function (t) { antes = t; requestAnimationFrame(q); });
  }), { janela: JANELA_MS, longo: LONGO_MS });
  const buf = await nav.stopTracing();
  if (process.env.TRACE) writeFileSync(join(process.env.TRACE, `${PERFIL}-${v.nome}-${i}.json`), buf);
  Object.assign(r, gpuDoRastreio(buf));
  await ctx.close();
  return r;
}

const tot = Object.fromEntries(VARIANTES.map(v => [v.nome, []]));
for (let i = 0; i < RODADAS; i++) for (const v of (i % 2 ? [...VARIANTES].reverse() : VARIANTES)) {
  const r = await rodada(v, i);
  tot[v.nome].push(r);
  console.log(PERFIL, v.nome.padEnd(8), 'rodada', i + 1, 'fps=' + r.fps, 'longos=' + r.longos.length, 'pior=' + r.pior + 'ms', 'main=' + r.mainMs + 'ms/s', 'gpu=' + r.gpuMs + 'ms/s', 'raster=' + r.rasterMs + 'ms/s (' + r.rasterPor + 'ms/vez, pior ' + r.piorRaster + ')', 'pico=' + r.pico + 'ms/s',
    r.longos.map(l => `${l.em}:${l.ms}ms(ocup ${l.ocupado})`).join(' '));
}
for (const v of VARIANTES) {
  const rs = tot[v.nome], med = k => +(rs.reduce((s, r) => s + r[k], 0) / rs.length).toFixed(1);
  console.log('==', PERFIL, v.nome.padEnd(8), 'rodadas', rs.length, 'fps médio', med('fps'), 'longos total', rs.reduce((s, r) => s + r.longos.length, 0), 'pior', Math.max(...rs.map(r => r.pior)) + 'ms', 'main', med('mainMs') + 'ms/s', 'gpu', med('gpuMs') + 'ms/s', 'raster', med('rasterMs') + 'ms/s', med('rasterPor') + 'ms/vez', 'pico', Math.max(...rs.map(r => r.pico)) + 'ms/s');
}
if (disputa) disputa.kill();
await nav.close();
