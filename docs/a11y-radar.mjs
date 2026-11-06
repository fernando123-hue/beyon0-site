/* ACESSIBILIDADE DO RADAR NO NAVEGADOR (PR 2d-ligação, rodada de correção A1 a A3 e A5). Servidor local com a flag ligada (node docs/servidor.mjs . 8931).
     CHROMIUM=... node docs/a11y-radar.mjs [8931]
   1.280 x 800 (A2): com o radar à vista o painel rola por dentro; o Tab alcança o <aside> (tabindex="0"), o foco aparece (contorno visível), as setas e PageDown rolam o painel e o radar
   chega à tela SÓ pelo teclado. 390 e 320 (A3): com a fonte do sistema a 200% (html { font-size: 200% }; os tamanhos do site são em rem) nada do radar passa da largura do cartão nem é cortado,
   e o nível desce para baixo do eixo no cartão estreito. A1/A5: o título é um <h3>, o grupo não tem role nem aria-labelledby, a legenda vem antes da lista.
   Capturas em docs/olhar-radar/ (a11y-*). */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ON = 'http://127.0.0.1:' + (process.argv[2] || '8931');
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const PASTA = new URL('./olhar-radar/', import.meta.url);
await mkdir(PASTA, { recursive: true });
let falhou = false;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FALHOU ') + m); if (!c) falhou = true; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
const T1 = 'Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional. Tem muita procura. leitura-sim';
const T2 = 'Toda hora perguntam o horário e só a recepcionista atende. Preciso disso antes da feira de abril. Hoje fica tudo na minha cabeça.';
const nav = await chromium.launch({ executablePath: EXEC });

async function abrir(larg, alt) {
  const movel = larg < 500;
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: movel, hasTouch: movel, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  await page.goto(ON + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#o-perguntas:not([hidden])');
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 });
  await page.click('#o-conversar');
  for (const t of [T1, T2]) {
    const n = await page.locator('#o-log .msg--agente').count();
    await page.fill('#o-texto', t); await page.press('#o-texto', 'Enter');
    await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
    await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
    await espera(500);
  }
  await page.waitForSelector('#o-radar:not([hidden]) .plr', { timeout: 15000 });
  return { ctx, page };
}

/* ---------- A1 e A5 (estrutura) + A2 (teclado) a 1.280 x 800 ---------- */
console.log('\n== 1.280 x 800: estrutura e teclado ==');
{
  const { ctx, page } = await abrir(1280, 800);
  const est = await page.evaluate(() => {
    const t = document.querySelector('#o-radar .plr-titulo'), g = document.querySelector('#o-radar .plr'), filhos = [...g.children].map((n) => n.className);
    return { tag: t.tagName, id: !!t.id, role: g.getAttribute('role'), rotulo: g.getAttribute('aria-labelledby'), filhos, titulos: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 30)).filter((x) => /investimento|Como lemos/i.test(x)) };
  });
  ok(est.tag === 'H3' && est.id && est.role === null && est.rotulo === null, 'A1: o título do radar é um <h3> com id, sem role="group" nem aria-labelledby (' + est.titulos.join(' | ') + ')');
  ok(est.filhos.indexOf('plr-legenda') > 0 && est.filhos.indexOf('plr-legenda') < est.filhos.indexOf('plr-lista'), 'A5: a legenda vem antes da lista (' + est.filhos.join(', ') + ')');
  const painel = await page.evaluate(() => { const a = document.querySelector('.orc-painel'); return { rola: a.scrollHeight > a.clientHeight + 1, tabindex: a.getAttribute('tabindex'), sh: a.scrollHeight, ch: a.clientHeight }; });
  ok(painel.rola && painel.tabindex === '0', 'A2: o painel rola por dentro (' + painel.sh + ' > ' + painel.ch + ') e o <aside> tem tabindex="0"');
  await page.evaluate(() => { document.getElementById('o-texto').focus(); window.scrollTo(0, document.querySelector('.orc-mesa').getBoundingClientRect().top + window.scrollY - 80); });
  let alcancou = false, passos = 0;
  for (; passos < 80 && !alcancou; passos++) { await page.keyboard.press('Tab'); alcancou = await page.evaluate(() => document.activeElement === document.querySelector('.orc-painel')); }
  ok(alcancou, 'A2: o Tab chega ao painel (em ' + passos + ' toques)');
  const foco = await page.evaluate(() => { const a = document.querySelector('.orc-painel'), c = getComputedStyle(a); return { contorno: c.outlineStyle, largura: parseFloat(c.outlineWidth), cor: c.outlineColor, fv: a.matches(':focus-visible') }; });
  ok(foco.fv && foco.contorno !== 'none' && foco.largura > 0, 'A2: o foco do painel é visível (contorno ' + foco.contorno + ' ' + foco.largura + 'px ' + foco.cor + ')');
  await page.screenshot({ path: fileURLToPath(new URL('a11y-1280-foco.png', PASTA)) });
  const antes = await page.evaluate(() => document.querySelector('.orc-painel').scrollTop);
  for (let i = 0; i < 8; i++) await page.keyboard.press('PageDown');
  await espera(400);
  const depois = await page.evaluate(() => document.querySelector('.orc-painel').scrollTop);
  ok(depois > antes + 200, 'A2: PageDown rola o painel pelo teclado (' + antes + ' -> ' + depois + ')');
  await page.keyboard.press('End'); await espera(300);
  const visivel = await page.evaluate(() => { const r = document.querySelector('#o-radar .plr-lista').getBoundingClientRect(), p = document.querySelector('.orc-painel').getBoundingClientRect(); return r.top < Math.min(p.bottom, innerHeight) && r.bottom > p.top; });
  ok(visivel, 'A2: com End o radar (a lista) fica à vista, só pelo teclado');
  await page.screenshot({ path: fileURLToPath(new URL('a11y-1280-radar-pelo-teclado.png', PASTA)) });
  await ctx.close();
}

/* ---------- A3: fonte do sistema a 200% ---------- */
for (const [larg, alt] of [[390, 844], [320, 640]]) {
  console.log('\n== ' + larg + ' x ' + alt + ', fonte a 200% ==');
  const { ctx, page } = await abrir(larg, alt);
  const base320 = larg === 320 && (await page.evaluate(() => [...document.querySelectorAll('#o-radar .plr-linha')].filter((l) => l.querySelector('.plr-nivel').getBoundingClientRect().top >= l.querySelector('.plr-eixo').getBoundingClientRect().bottom - 1).length));
  if (larg === 320) ok(base320 === 5, 'a 320 px e 100% o cartão é estreito (< 300 px de conteúdo): o nível já desce para baixo do eixo nas 5 linhas (' + base320 + ')');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await espera(600);
  await page.evaluate(() => document.getElementById('o-radar').scrollIntoView({ block: 'start' }));
  await espera(400);
  const r = await page.evaluate(() => {
    const cartao = document.querySelector('#o-radar .plr').getBoundingClientRect();
    const fora = [];
    for (const n of document.querySelectorAll('#o-radar .plr *')) { if (n.closest('svg')) continue; const b = n.getBoundingClientRect(); if (b.width && (b.right > cartao.right + 0.5 || b.left < cartao.left - 0.5)) fora.push(n.className || n.tagName); }
    const cortadas = [...document.querySelectorAll('#o-radar .plr-linha, #o-radar .plr-legenda')].filter((l) => l.scrollHeight > l.clientHeight + 1).length;
    const empilhadas = [...document.querySelectorAll('#o-radar .plr-linha')].filter((l) => l.querySelector('.plr-nivel').getBoundingClientRect().top >= l.querySelector('.plr-eixo').getBoundingClientRect().bottom - 1).length;
    const rot = [...document.querySelectorAll('#o-radar .plr-rot')].map((n) => n.getBoundingClientRect());
    let colide = 0; for (let i = 0; i < rot.length; i++) for (let j = i + 1; j < rot.length; j++) { const a = rot[i], b = rot[j]; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) colide++; }
    const q = document.querySelector('#o-radar .plr-quadro').getBoundingClientRect();
    const rotTransborda = [...document.querySelectorAll('#o-radar .plr-rot')].filter((n) => { const t = document.createRange(); t.selectNodeContents(n); const b = t.getBoundingClientRect(), c = document.querySelector('#o-radar .plr').getBoundingClientRect(); return b.right > c.right + 0.5 || b.left < c.left - 0.5; }).length;
    const rotFora = rotTransborda + rot.filter((b) => b.left < q.left - 1 || b.right > q.right + 1 || b.top < q.top - 1 || b.bottom > q.bottom + 1).length;
    return { vw: innerWidth, sw: document.documentElement.scrollWidth, cartao: [Math.round(cartao.left), Math.round(cartao.right)], fora, cortadas, empilhadas, colide, rotFora };
  });
  ok(r.sw <= r.vw + 1, 'sem rolagem lateral (scrollWidth ' + r.sw + ' contra innerWidth ' + r.vw + '; a 200% o Chrome alarga a viewport da página sozinho, com ou sem o radar: medido com a flag desligada, igual)');
  ok(r.fora.length === 0, 'nada do cartão passa da borda dele (' + (r.fora.join(',') || 'nada') + ')');
  ok(r.cortadas === 0, 'nenhuma linha nem a legenda é cortada (altura reservada dá conta de 200%)');
  console.log('  (a 200% a página alarga a viewport e o cartão fica largo: linhas empilhadas = ' + r.empilhadas + ' de 5; o empilhamento do cartão estreito foi medido acima, a 320 px e 100%)');
  ok(r.colide === 0 && r.rotFora === 0, 'os rótulos do desenho não colidem entre si (' + r.colide + ') nem saem do quadro (' + r.rotFora + ')');
  await page.locator('#o-radar').screenshot({ path: fileURLToPath(new URL('a11y-' + larg + '-zoom200.png', PASTA)) });
  await ctx.close();
}
await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
