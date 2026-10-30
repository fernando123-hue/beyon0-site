// custo das três peças no "celular médio": GPU + CPU 4× mais lenta, 390 px. A/B com e sem os JS das peças.
// Passa por cada peça (entrada e demonstração) e por uma interação, contando tarefas longas e quadros > 33 ms.
import { createRequire } from 'node:module';
const require = createRequire('C:/Vault - Fernando/Beyon Zero/03 Projetos/site/package.json');
const { chromium } = require('playwright');
const N = +(process.argv[2] || 2), CPU = +(process.argv[3] || 4);
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe`, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
async function rodada(semPecas) {
  const a = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await a.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  if (semPecas) await a.route('**/js/peca-*.js', (r) => r.abort());
  await a.goto('http://127.0.0.1:8897/sites', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await a.waitForTimeout(5000);
  let atual = '/sites';
  const IR = async (pag) => { if (pag === atual) return; atual = pag; await a.goto('http://127.0.0.1:8897' + pag, { waitUntil: 'domcontentloaded', timeout: 120000 }); await a.waitForTimeout(5000); };
  const cdp = await a.context().newCDPSession(a);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const res = {};
  for (const [nome, sel, acao, pag] of [
    ['planta', '.planta__palco', () => a.evaluate(() => { const b = document.querySelector('[data-nicho=saude]'); if (b) b.click(); const c = document.querySelector('[data-planta-campo]'); if (c) { c.value = 'Clínica Sorriso'; c.dispatchEvent(new Event('input')); } }), '/sites'],
    ['despacho', '.despacho__placa', () => a.evaluate(() => { const b = document.querySelector('[data-pedido=relatorio]'); if (b) b.click(); }), '/automacao'],
    ['plantao', '.plantao__tela', () => a.evaluate(() => { const b = document.querySelector('[data-pergunta=pessoa]'); if (b) b.click(); }), '/automacao']
  ]) {
    await IR(pag);
    await a.evaluate((s) => {
      window.__lt = []; window.__po && __po.disconnect();
      window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => __lt.push(Math.round(e.duration)))); __po.observe({ type: 'longtask' });
      window.__fr = []; window.__vivo = true; let u = performance.now(); (function f(t) { __fr.push(t - u); u = t; if (__vivo) requestAnimationFrame(f); })(u);
      const i = { '.planta__palco': 0, '.despacho__placa': 0, '.plantao__tela': 1 }[s]; const el = document.querySelectorAll('.planta-cartao, article.servico--peca')[i]; scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
    }, sel);
    await a.waitForTimeout(6500);
    await acao();
    await a.waitForTimeout(3500);
    res[nome] = await a.evaluate(() => { __vivo = false; const f = __fr.slice(3); return { longas: __lt.length, maior: Math.max(0, ...__lt), acima33: f.filter((x) => x > 33).length, quadros: f.length }; });
  }
  await a.close();
  return res;
}
for (let i = 0; i < N; i++) for (const sem of [true, false]) console.log('CPU ' + CPU + 'x 390 ' + (sem ? 'sem peças ' : 'com peças ') + JSON.stringify(await rodada(sem)));
await b.close();
