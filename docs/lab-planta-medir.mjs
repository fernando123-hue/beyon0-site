/* Mede a PLANTA VIVA no laboratório (docs/lab-planta.html, módulos REAIS): CLS (meta do passo 0: <= 0,01 em 390x844, 320x640, 320x844 e
   1280x800, nos 3 nichos, 3 repetições com aquecimento), fps na entrada e no repouso, quadros > 50 ms, nós do DOM e, com a CPU 4x
   (Emulation.setCPUThrottlingRate), o tempo de montagem e as tarefas longas na entrada. Recriada para o laboratório novo a partir da
   ferramenta do passo 0 (que registrava layout-shift com sources no protótipo; o histórico dela está no git, commit 148deab e
   docs/superpowers/plans/planta-passo0-cls-notas.md).
   O headless desenha por software: serve para COMPARAR, não como fps de aparelho real. O 1º carregamento de cada execução é lento
   (processo de GPU subindo): há um aquecimento que não entra nas medidas.

   Uso:  BASE=http://127.0.0.1:8917 CHROMIUM="%LOCALAPPDATA%/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe" \
         node docs/lab-planta-medir.mjs <saida.json> [tamanhos] [repeticoes] [esperaMs] [modos]
   tamanhos   largura[xaltura], vírgula (padrão 390x844,320x640,320x844,1280x800)
   repeticoes por caso, depois do aquecimento (padrão 3)
   esperaMs   quanto esperar depois do load, para pegar a sequência inteira (7,6 s) e o pulso (padrão 10500)
   modos      cls (padrão), cpu (montagem com CPU 4x e tarefas longas) e fps (fps na entrada e no repouso); vírgula
   Saída: tabela no console e o JSON completo (com as sources de cada layout-shift) em <saida.json>. */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

if (process.argv.includes('--help') || process.argv.length < 3) {
  console.log('Uso: node docs/lab-planta-medir.mjs <saida.json> [tamanhos] [repeticoes] [esperaMs] [modos cls,cpu,fps]  (BASE, CHROMIUM, PAGINA, NICHOS no ambiente)');
  process.exit(0);
}
const BASE = process.env.BASE || 'http://127.0.0.1:8917';
const PAGINA = process.env.PAGINA || '/docs/lab-planta.html';
const NICHOS = (process.env.NICHOS || 'clinica,embalagens,loja').split(',');
const SAIDA = process.argv[2];
const TAMANHOS = (process.argv[3] || '390x844,320x640,320x844,1280x800').split(',').map((t) => { const [l, a] = t.split('x').map(Number); return { larg: l, alt: a || (l >= 1000 ? 800 : l >= 380 ? 844 : 640) }; });
const REP = Number(process.argv[4] || 3);
const ESPERA = Number(process.argv[5] || 10500);
const MODOS = (process.argv[6] || 'cls').split(',');
mkdirSync(dirname(SAIDA) === '.' ? '.' : dirname(SAIDA), { recursive: true });
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* registra cada layout-shift com value, quando e as fontes (nó, retângulo anterior e atual) */
const ESPIAO = () => {
  window.__ls = [];
  window.__longas = [];
  const desc = (n) => (n ? (n.nodeName + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '') + (n.dataset && n.dataset.id ? '[' + n.dataset.id + ']' : '')) : '?');
  new PerformanceObserver((l) => l.getEntries().forEach((e) => {
    window.__ls.push({ value: e.value, t: Math.round(e.startTime), recente: e.hadRecentInput, fontes: (e.sources || []).map((s) => ({ no: desc(s.node), de: s.previousRect && [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), para: s.currentRect && [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })) });
  })).observe({ type: 'layout-shift', buffered: true });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longas.push({ ms: Math.round(e.duration), t: Math.round(e.startTime) }))).observe({ type: 'longtask', buffered: true }); } catch { /* sem longtask */ }
};

const url = (nicho) => `${BASE}${PAGINA}?nicho=${nicho}`;
async function carregar(larg, alt, nicho, { cpu } = {}) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.addInitScript(ESPIAO);
  let cdp = null;
  if (cpu) { cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  await p.goto(url(nicho), { waitUntil: 'load' });
  return { ctx, p, cdp };
}

const amostrar = (ms) => new Promise((res) => {
  const t = []; let ult = performance.now(); const ini = ult;
  const f = (n) => { t.push(n - ult); ult = n; if (n - ini < ms) requestAnimationFrame(f); else { const longos = t.filter((x) => x > 50).length; t.sort((a, b) => a - b); const med = t.reduce((s, x) => s + x, 0) / t.length; res({ fps: +(1000 / med).toFixed(1), p95ms: +t[Math.floor(t.length * 0.95)].toFixed(1), quadros: t.length, longos }); } };
  requestAnimationFrame(f);
});

const resultado = { quando: new Date().toISOString(), base: BASE, pagina: PAGINA, repeticoes: REP, espera: ESPERA, cls: [], cpu: [], fps: [] };
const linhas = [];

for (const { larg, alt } of TAMANHOS) {
  for (const nicho of NICHOS) {
    /* aquecimento: não entra na conta (o 1º carregamento do headless é lento e muda quem chega primeiro, fonte ou JS) */
    const aq = await carregar(larg, alt, nicho); await espera(1500); await aq.ctx.close();

    if (MODOS.includes('cls')) {
      const reps = [];
      for (let i = 0; i < REP; i++) {
        const { ctx, p } = await carregar(larg, alt, nicho);
        await p.evaluate(() => document.fonts.ready);
        await espera(ESPERA);
        const r = await p.evaluate(() => ({ ls: window.__ls, alturaQuadro: document.querySelector('.plv-quadro').getBoundingClientRect().height, ok: !!(window.PLANTA_LAB.ultima && window.PLANTA_LAB.ultima.resultado.ok) }));
        /* CLS total da página e CLS DA FAIXA: o deslocamento conta como da faixa se algum dos nós que se moveu é da planta (classe plv-) ou está dentro dela; o resto é a moldura do laboratório (título, botões de nicho) */
        const daFaixa = (s) => s.fontes.some((f) => /.plv-|.plv|[/.test(f.no));
        const soma = (lista) => +lista.filter((s) => !s.recente).reduce((a, x) => a + x.value, 0).toFixed(4);
        const cls = soma(r.ls.filter(daFaixa)), clsTotal = soma(r.ls);
        reps.push({ cls, clsTotal, deslocamentos: r.ls, alturaQuadro: r.alturaQuadro, ok: r.ok });
        await ctx.close();
      }
      const max = Math.max.apply(null, reps.map((r) => r.cls)), maxTotal = Math.max.apply(null, reps.map((r) => r.clsTotal));
      resultado.cls.push({ larg, alt, nicho, repeticoes: reps, max, maxTotal });
      linhas.push(`CLS  ${String(larg).padStart(4)}x${String(alt).padEnd(4)} ${nicho.padEnd(11)} faixa ${reps.map((r) => r.cls.toFixed(4)).join('  ')} (máx ${max.toFixed(4)}, ${max <= 0.01 ? 'ok' : 'ACIMA DA META'})   página inteira ${reps.map((r) => r.clsTotal.toFixed(4)).join('  ')}   quadro ${reps[0].alturaQuadro}px`);
      for (const r of reps) for (const s of r.deslocamentos) if (s.value > 0) linhas.push('       deslocamento ' + s.value.toFixed(4) + ' em ' + s.t + ' ms: ' + s.fontes.map((f) => f.no + ' ' + JSON.stringify(f.de) + '->' + JSON.stringify(f.para)).join(' | '));
    }

    if (MODOS.includes('cpu')) {
      /* CPU 4x: tempo de montagem (a faixa nasce na tarefa do script) e tarefas longas durante a entrada */
      const { ctx, p } = await carregar(larg, alt, nicho, { cpu: 4 });
      await espera(9000);
      const r = await p.evaluate(() => ({ montagemMs: +window.PLANTA_LAB.ultima.ms.toFixed(1), longas: window.__longas, nos: document.querySelectorAll('.plv-quadro *').length }));
      const naEntrada = r.longas.filter((x) => x.t > 0);
      resultado.cpu.push({ larg, alt, nicho, montagemMs: r.montagemMs, tarefasLongas: naEntrada, nos: r.nos });
      linhas.push(`CPU4 ${String(larg).padStart(4)}x${String(alt).padEnd(4)} ${nicho.padEnd(11)} montagem ${r.montagemMs} ms   tarefas longas (>50 ms): ${naEntrada.length ? naEntrada.map((x) => x.ms + ' ms em ' + x.t).join(', ') : 'nenhuma'}   nós do quadro ${r.nos}`);
      await ctx.close();
    }

    if (MODOS.includes('fps')) {
      const { ctx, p } = await carregar(larg, alt, nicho);
      await espera(200);
      const entrada = await p.evaluate(`(${amostrar.toString()})(8300)`);
      await espera(1200);
      const repouso = await p.evaluate(`(${amostrar.toString()})(6000)`);
      resultado.fps.push({ larg, alt, nicho, entrada, repouso });
      linhas.push(`FPS  ${String(larg).padStart(4)}x${String(alt).padEnd(4)} ${nicho.padEnd(11)} entrada ${entrada.fps} fps (p95 ${entrada.p95ms} ms, >50 ms: ${entrada.longos})   repouso ${repouso.fps} fps (p95 ${repouso.p95ms} ms, >50 ms: ${repouso.longos})`);
      await ctx.close();
    }
    console.log(linhas.splice(0).join('\n'));
  }
}
await nav.close();
writeFileSync(SAIDA, JSON.stringify(resultado, null, 2));
if (resultado.cls.length) {
  const piores = resultado.cls.filter((c) => c.max > 0.01);
  console.log(piores.length ? `\n${piores.length} caso(s) acima de 0,01.` : '\nTodos os casos dentro da meta (CLS <= 0,01).');
}
