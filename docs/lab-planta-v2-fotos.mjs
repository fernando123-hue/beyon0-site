// Fotos do laboratório da planta v2 em estados fixos (?passo=N) e larguras: node docs/lab-planta-v2-fotos.mjs <pasta> [nicho]
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8917', pasta = process.argv[2] || '.', nicho = process.argv[3] || 'clinica';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const larguras = (process.env.LARGURAS || '390,320,1280').split(',').map(Number), passos = (process.env.PASSOS || '1,4,6,7').split(',').map(Number);
for (const w of larguras) {
  const ctx = await b.newContext({ viewport: { width: w, height: w >= 960 ? 800 : 844 }, deviceScaleFactor: 2 });
  for (const p of passos) {
    const pg = await ctx.newPage(), erros = [];
    pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
    pg.on('pageerror', e => erros.push(String(e)));
    await pg.goto(`${BASE}/docs/lab-planta-v2.html?nicho=${nicho}&captura=1&passo=${p}`, { timeout: 90000 });
    await pg.waitForTimeout(500);
    const info = await pg.evaluate(() => {
      const lateral = document.documentElement.scrollWidth - innerWidth;
      /* texto cortado: o retângulo de cada texto tem de caber no do contêiner que corta (overflow hidden); e nada de palavra sozinha na última linha */
      const cortes = [], viuvas = [];
      document.querySelectorAll('.lv-tit, .lv-fan__txt, .lv-verbo, .lv-leitura__txt, .lv-ponta__txt, .plv-tit, .plv-verbo, .plv-rot, .plv-leitura__txt, .plv-nota, .msg p').forEach(e => {
        if (!e.offsetParent || !e.textContent.trim()) return;
        let c = e.parentElement; while (c && getComputedStyle(c).overflow === 'visible') c = c.parentElement;
        if (c && /auto|scroll/.test(getComputedStyle(c).overflowY)) return;   /* a caixa que rola (a conversa) não corta: rola */
        const r = e.getBoundingClientRect(), k = c ? c.getBoundingClientRect() : null;
        if ((k && (r.bottom > k.bottom + 1 || r.right > k.right + 1)) || e.scrollHeight > e.clientHeight + 1) cortes.push(e.className + ': ' + e.textContent.slice(0, 50));
        const rg = document.createRange(); rg.selectNodeContents(e); const linhas = [...rg.getClientRects()]; 
        if (linhas.length > 1) { const ult = linhas[linhas.length - 1], tops = new Set(linhas.map(l => Math.round(l.top))); if (tops.size > 1) { const palavras = e.textContent.trim().split(/s+/); const ultTop = Math.round(ult.top); const naUlt = linhas.filter(l => Math.round(l.top) === ultTop).reduce((a, l) => a + l.width, 0); if (naUlt < 0.2 * e.getBoundingClientRect().width && palavras[palavras.length - 1].length * 7 > naUlt - 2) viuvas.push(e.className + ': ' + e.textContent.slice(-30)); } }
      });
      return { lateral, cortes, viuvas };
    });
    const alvo = document => null;
    await pg.screenshot({ path: `${pasta}/${nicho}-${w}-p${p}.png`, fullPage: w < 960 });
    console.log(w, 'passo', p, JSON.stringify(info), erros.length ? 'ERROS ' + erros.join(' | ') : '');
    await pg.close();
  }
  await ctx.close();
}
await b.close();
