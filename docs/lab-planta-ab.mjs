/* A/B das TAREFAS LONGAS da planta viva na MESMA sessão do navegador: rodadas alternadas "animado" e "estático" (?estatico=1: a planta montada sem nenhuma
   animação, nem o pulso de repouso; ver opcoes.animar no módulo), com a CPU 4x (Emulation.setCPUThrottlingRate). Em cada carga conta as tarefas longas
   (> 50 ms) depois do carregamento (a 4x, depois de ~700 ms) e a soma delas. Repete N rodadas de cada e mostra a MEDIANA, o mínimo e o máximo: numa
   máquina ocupada uma carga só não diz nada.
   Uso: BASE=http://127.0.0.1:8917 CHROMIUM=... node docs/lab-planta-ab.mjs [rodadas por variante, padrão 8] [nicho, padrão clinica] [largura, padrão 390] */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8917';
const N = Number(process.argv[2] || 8), NICHO = process.argv[3] || 'clinica', LARG = Number(process.argv[4] || 390);
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const VARIANTES = { animado: '', estatico: '&estatico=1' };
const dados = { animado: [], estatico: [] };

async function carga(extra) {
  const ctx = await nav.newContext({ viewport: { width: LARG, height: 844 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__l = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__l.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(`${BASE}/docs/lab-planta.html?nicho=${NICHO}${extra}`, { waitUntil: 'load', timeout: 120000 });
  await espera(5000);
  const r = await p.evaluate(() => ({ longas: window.__l, anims: document.getAnimations().length }));
  await ctx.close();
  return r;
}
await carga('');   /* aquecimento (não conta) */
for (let i = 0; i < N; i++) {
  for (const [nome, extra] of Object.entries(VARIANTES)) {
    const r = await carga(extra);
    const depois = r.longas.filter(([t]) => t > 700);
    const antes = r.longas.filter(([t]) => t <= 700);
    dados[nome].push({ n: depois.length, ms: depois.reduce((s, [, d]) => s + d, 0), nAntes: antes.length, msAntes: antes.reduce((s, [, d]) => s + d, 0), anims: r.anims, todas: r.longas });
  }
}
await nav.close();
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
console.log(`${NICHO} ${LARG}px, CPU 4x, ${N} rodadas alternadas por variante (tarefas longas depois de 700 ms)`);
for (const [nome, lista] of Object.entries(dados)) {
  const ns = lista.map((x) => x.n), ms = lista.map((x) => x.ms);
  console.log(`${nome.padEnd(8)} animações vivas no fim: ${lista[0].anims}   nº de tarefas longas: mediana ${med(ns)} (min ${Math.min(...ns)}, máx ${Math.max(...ns)})   soma em ms: mediana ${med(ms)} (min ${Math.min(...ms)}, máx ${Math.max(...ms)})`);
  console.log(`         no carregamento (até 700 ms, onde fica o 1º layout da página): tarefas longas mediana ${med(lista.map((x) => x.nAntes))}, soma em ms mediana ${med(lista.map((x) => x.msAntes))}`);
}
