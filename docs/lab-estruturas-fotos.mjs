// Fotos e conferência do laboratório das estruturas (docs/lab-estruturas.html): node docs/lab-estruturas-fotos.mjs <pasta>
// Para cada caso e largura: valida os planos (o validador do laboratório), confere a geometria de cada quadro e tira a foto da página inteira.
// Falha (código 1) quando: o plano não passa no validador; no celular (≤ 430) um quadro passa de 440 px de altura (spec §7.5) ou o objetivo
// fica fora dele; uma caixa invade outra; um rótulo cobre uma caixa ou outro rótulo; algo sai do quadro; a página rola de lado; erro no console.
import { chromium } from 'playwright';
import fs from 'node:fs';
import vm from 'node:vm';
import { textoDoPlanoPermitido } from '../api/_vendas/planta-textos.mjs';

/* 1º: todo texto dos casos passa no validador de texto REAL do servidor (o que recusaria o plano em produção). Em `hoje.texto` e
   `hoje.trava` a spec (§7.3) afrouxa só prazo (palavras de tempo do cotidiano) e marca; preço, promessa e número continuam valendo. */
const janela = {};
vm.runInNewContext(fs.readFileSync(new URL('./lab-estruturas-casos.js', import.meta.url), 'utf8'), { window: janela });
const recusados = [];
for (const [id, caso] of Object.entries(janela.LAB_ESTRUTURAS_CASOS)) {
  const conferir = (texto, onde, afrouxa = []) => {
    const r = textoDoPlanoPermitido(texto);
    if (!r.ok && !afrouxa.includes(r.motivo)) recusados.push(`${id} ${onde}: "${texto}" (${r.motivo})`);
  };
  conferir(caso.hoje.texto, 'hoje.texto', ['prazo', 'marca']); conferir(caso.hoje.trava, 'hoje.trava', ['prazo', 'marca']);
  conferir(caso.objetivo.titulo, 'objetivo.titulo'); conferir(caso.objetivo.frase, 'objetivo.frase'); conferir(caso.fecho, 'fecho');
  for (const [est, p] of Object.entries(caso.estruturas)) {
    p.nos.forEach(n => { conferir(n.titulo, `${est}.${n.id}.titulo`); conferir(n.frase, `${est}.${n.id}.frase`); });
    p.setas.forEach(x => conferir(x.rotulo, `${est}.${x.de}→${x.para}`));
  }
}
console.log(recusados.length ? 'textos recusados pelo validador do servidor:\n  ✗ ' + recusados.join('\n  ✗ ') : 'textos dos casos: todos passam no validador do servidor ✓');
const PELE = process.env.PELE === 'trilho' ? 'trilho' : 'caixa';
const BASE = process.env.BASE || 'http://127.0.0.1:8899', pasta = process.argv[2] || '.';
const larguras = (process.env.LARGURAS || '390,320,768,1280').split(',').map(Number), casos = (process.env.CASOS || 'clinica,embalagens,loja,limites').split(',');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let falhas = recusados.length;
for (const w of larguras) {
  const ctx = await b.newContext({ viewport: { width: w, height: w >= 960 ? 900 : 844 }, deviceScaleFactor: w >= 960 ? 1 : 2 });
  for (const caso of casos) {
    const pg = await ctx.newPage(), erros = [];
    pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
    pg.on('pageerror', e => erros.push(String(e)));
    await pg.goto(`${BASE}/docs/lab-estruturas.html?caso=${caso}&captura=1&estatico=1&pele=${PELE}`, { timeout: 90000 });
    await pg.waitForFunction(() => window.LAB_ESTRUTURAS && window.LAB_ESTRUTURAS.pronto, null, { timeout: 30000 });
    const info = await pg.evaluate(celular => {
      const sob = (a, b2) => a.left < b2.right - 0.5 && b2.left < a.right - 0.5 && a.top < b2.bottom - 0.5 && b2.top < a.bottom - 0.5;
      const problemas = [...window.LAB_ESTRUTURAS.erros];
      document.querySelectorAll('.le-estrutura').forEach(sec => {
        const nome = sec.getAttribute('data-estrutura'), q = sec.querySelector('.le-quadro');
        if (!q) { problemas.push(nome + ': sem quadro'); return; }
        const k = q.getBoundingClientRect(), nos = [...q.querySelectorAll('.le-no')].map(e => [e, e.getBoundingClientRect()]);
        const rots = [...q.querySelectorAll('.le-rot, .le-cab')].map(e => [e, e.getBoundingClientRect()]);
        if (celular && k.height > 440) problemas.push(`${nome}: quadro com ${Math.round(k.height)} px (máximo 440)`);
        const obj = q.querySelector('.le-no--objetivo').getBoundingClientRect();
        if (obj.bottom > k.bottom + 1 || obj.top < k.top - 1) problemas.push(nome + ': objetivo fora do quadro');
        [...nos, ...rots].forEach(([e, r]) => { if (r.left < k.left - 1 || r.right > k.right + 1 || r.top < k.top - 1 || r.bottom > k.bottom + 1) problemas.push(`${nome}: "${e.textContent.slice(0, 24)}" sai do quadro`); });
        nos.forEach(([e, r], i) => nos.slice(i + 1).forEach(([e2, r2]) => { if (sob(r, r2)) problemas.push(`${nome}: caixas sobrepostas (${e.textContent.slice(0, 16)} × ${e2.textContent.slice(0, 16)})`); }));
        rots.forEach(([e, r], i) => {
          nos.forEach(([e2, r2]) => { if (sob(r, r2)) problemas.push(`${nome}: rótulo "${e.textContent}" cobre "${e2.querySelector('.le-no__titulo').textContent}"`); });
          rots.slice(i + 1).forEach(([e2, r2]) => { if (sob(r, r2)) problemas.push(`${nome}: rótulos "${e.textContent}" e "${e2.textContent}" sobrepostos`); });
        });
        /* texto cortado dentro da caixa */
        nos.forEach(([e, r]) => { if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) problemas.push(`${nome}: texto cortado em "${e.textContent.slice(0, 20)}"`); });
      });
      const alturas = [...document.querySelectorAll('.le-quadro')].map(q => Math.round(q.getBoundingClientRect().height));
      return { lateral: document.documentElement.scrollWidth - innerWidth, problemas, alturas };
    }, w <= 430);
    if (info.lateral > 0) info.problemas.push(`rola de lado ${info.lateral} px`);
    info.problemas.push(...erros.map(e => 'console: ' + e));
    await pg.screenshot({ path: `${pasta}/${PELE}-${caso}-${w}.png`, fullPage: true });
    console.log(`${caso} ${w}: alturas ${info.alturas.join('/')}` + (info.problemas.length ? '\n  ✗ ' + info.problemas.join('\n  ✗ ') : ' ✓'));
    falhas += info.problemas.length;
    await pg.close();
  }
  await ctx.close();
}
await b.close();
if (falhas) { console.log(`\n${falhas} problema(s)`); process.exit(1); }
console.log('\ntudo certo');
