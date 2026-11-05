/* Procura texto CORTADO ou rótulo invadindo caixa na PLANTA VIVA do laboratório (docs/lab-planta.html), com a fonte de verdade (Sora) e a quebra de
   linha de verdade. Para cada nicho, largura de janela e texto (normal e ?longo=1: título de 40 caracteres, rótulos de 28):
     - títulos limitados a 2 ou 3 linhas (line-clamp) que perderam linha (reticências), verbos cortados, rótulos de ramo e de retorno cortados;
     - texto de caixa ou de ponta mais alto que a caixa (overflow);
     - o retângulo do rótulo de uma ponta (núcleo, LED) cobrindo uma caixa.
   Uso: BASE=http://127.0.0.1:8917 CHROMIUM=... node docs/lab-planta-cortes.mjs [larguras da janela, ex. 320,390,768,1280]   (sai com 1 se achar corte) */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8917';
const LARGS = (process.argv[2] || '320,340,360,390,768,1280').split(',').map(Number);
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let achou = 0;
for (const larg of LARGS) for (const nicho of ['clinica', 'embalagens', 'loja']) for (const longo of [0, 1, 2]) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/docs/lab-planta.html?nicho=${nicho}&longo=${longo}`, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 300));
  const r = await p.evaluate(() => {
    const cortes = [];
    const rot = (el) => (el.dataset && el.dataset.id) || el.className;
    document.querySelectorAll('.plv-tit').forEach((t) => { if (t.scrollHeight > t.clientHeight + 1) cortes.push('título cortado em ' + rot(t.closest('li')) + ': "' + t.textContent + '"'); });
    document.querySelectorAll('.plv-verbo').forEach((t) => { if (t.scrollWidth > t.clientWidth + 1) cortes.push('verbo cortado em ' + rot(t.closest('li')) + ': "' + t.textContent + '"'); });
    document.querySelectorAll('.plv-rot').forEach((t) => { if (t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1) cortes.push('rótulo cortado: "' + t.textContent + '"'); });
    document.querySelectorAll('.plv-quadro li').forEach((li) => { if (li.scrollHeight > li.clientHeight + 1) cortes.push('texto mais alto que a caixa em ' + rot(li) + ' (' + li.scrollHeight + ' > ' + li.clientHeight + ')'); });
    document.querySelectorAll('.plv-est, .plv-ponta').forEach((a) => { if (a.scrollWidth > a.clientWidth + 1) cortes.push('texto mais largo que a caixa em ' + rot(a)); });
    /* o texto de verdade de uma ponta ao lado (a altura que as linhas ocupam) contra as caixas */
    const caixas = [...document.querySelectorAll('.plv-est')].map((e) => ({ id: e.dataset.id, r: e.getBoundingClientRect() }));
    document.querySelectorAll('.plv-ponta').forEach((pt) => {
      const filhos = [...pt.children], alto = filhos.reduce((s, c) => s + c.getBoundingClientRect().height, 0) + 3 * (filhos.length - 1), r0 = pt.getBoundingClientRect();
      const topo = r0.top + (r0.height - alto) / 2, fim = topo + alto;
      caixas.forEach((c) => { if (r0.left < c.r.right - 1 && c.r.left < r0.right - 1 && topo < c.r.bottom - 1 && c.r.top < fim - 1) cortes.push('rótulo da ponta ' + rot(pt) + ' cobre a caixa ' + c.id); });
    });
    /* o texto de verdade dos rótulos de ramo e de retorno (as linhas que ocupam) contra as caixas */
    document.querySelectorAll('.plv-rot').forEach((rt) => {
      const rg = document.createRange(); rg.selectNodeContents(rt);
      const tr = rg.getBoundingClientRect(), r0 = rt.getBoundingClientRect(), ini = Math.max(tr.top, r0.top), fim = Math.min(tr.bottom, r0.bottom), esq = Math.max(tr.left, r0.left), dir = Math.min(tr.right, r0.right);
      caixas.forEach((c) => { if (esq < c.r.right - 1 && c.r.left < dir - 1 && ini < c.r.bottom - 1 && c.r.top < fim - 1) cortes.push('rótulo "' + rt.textContent + '" cobre a caixa ' + c.id + ' (' + Math.round(Math.min(fim, c.r.bottom) - Math.max(ini, c.r.top)) + ' px)'); });
    });
    return { cortes, W: document.querySelector('.plv-quadro').clientWidth };
  });
  if (r.cortes.length) { achou += r.cortes.length; console.log(`${nicho} janela ${larg} (faixa ${r.W}) ${['textos do plano', 'textos longos (título de 40, rótulos de 28)', 'títulos médios de 39 caracteres com palavras compridas'][longo]}:\n  ` + r.cortes.join('\n  ')); }
  await ctx.close();
}
console.log(achou ? `\n${achou} corte(s) ou invasão(ões).` : '\nNenhum texto cortado e nenhum rótulo invadindo caixa (3 nichos, textos normais, longos e médios).');
await nav.close();
process.exit(achou ? 1 : 0);
