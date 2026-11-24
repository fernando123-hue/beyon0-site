/* ==========================================================================
   O TEMA DO ORÇAMENTO no navegador (dono, 23/11: "escuro ativado de início; caso o usuário deseje mudar, clicar em um botão e muda").
   Confere, num Chromium de verdade, em 390, 360 e 320:
   1. o padrão é o ESCURO; com "claro" guardado no aparelho, abre no claro (color-scheme: dark × only light);
   2. a logo e o nome com as cores certas nos dois, lidas no PIXEL do print (não no CSS);
   3. o botão: à vista no topo, alvo ≥ 44 px, sem cobrir a logo nem o menu, aria-pressed certo; troca, guarda e volta
      (com clique de verdade e recarregando a página);
   4. contraste AA do texto à vista (cor do texto × fundo opaco mais próximo), o aviso de IA à vista, nada cortado
      (docs/cortes.mjs), sem rolagem lateral;
   5. NÃO PISCA: com o "claro" guardado e o js/tema.js atrasado de propósito, o 1º quadro já é o claro
      (sonda de requestAnimationFrame + quadros da tela pelo CDP);
   6. o ESCURECIMENTO FORÇADO do Chrome (o ajuste do Android por baixo, forceDarkModeEnabled), com o sistema escuro e claro:
      um controle branco sem color-scheme escurece (prova que o ajuste está ligado) e nenhum dos dois temas muda de cor.
   Uso: servidor local (docs/servidor.mjs), depois BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/tema-orcamento.mjs [pasta dos prints]
   Só abre a página e toca no botão do tema: não escreve na conversa, não cria sessão.
   ========================================================================== */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cortes } from './cortes.mjs';
import { autorizarContexto } from './acesso.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const EXEC = process.env.CHROMIUM || undefined;
const PASTA = process.argv[2] || '';
const CHAVE = 'bz-orcamento-tema';
const LARGURAS = [[390, 844], [360, 780], [320, 640]];
/* as cores que a logo e a página TÊM de ter (css/tokens.css no escuro; css/orcamento-palco.css no claro) */
const ESPERADO = {
  escuro: { barra: '#131617', palco: '#000000', nome: '#FFFFFF', aro: '#1CB5B9', zero: '#49E5DD', nucleo: '#F2F4F4' },
  claro: { barra: '#FFFFFF', palco: '#000000', nome: '#0B0C0D', aro: '#0B0C0D', zero: '#0E8C90', nucleo: '#0E8C90' }
};
/* pontos da logo do topo no viewBox (944,7 × 170) de orcamento.html: o "B" (haste, metade de cima: a prata branca), o aro do
   símbolo (topo do anel), a barra de cima do "Z" e o núcleo */
const PONTOS = { nome: [241.7, 46], aro: [85, 17], zero: [681.7, 27], nucleo: [85, 85] };
const TOLERANCIA = 28;

let falhou = false;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };
const hex = rgb => '#' + rgb.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const perto = (rgb, alvo) => { const n = parseInt(alvo.slice(1), 16); return Math.max(Math.abs(rgb[0] - (n >> 16)), Math.abs(rgb[1] - ((n >> 8) & 255)), Math.abs(rgb[2] - (n & 255))) <= TOLERANCIA; };
const guardar = async (nome, buf) => { if (PASTA) await writeFile(path.join(PASTA, nome), buf); };
if (PASTA) await mkdir(PASTA, { recursive: true });

/* lê pixels de um PNG numa página em branco (sem CSP): devolve [r,g,b,a] de cada ponto, em px do PNG */
async function lerPixels(leitor, png, pontos) {
  return leitor.evaluate(async ({ b64, pontos }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return pontos.map(([x, y]) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data]);
  }, { b64: png.toString('base64'), pontos });
}
/* as cores no print: a barra do topo, o palco e os quatro pontos da logo */
async function coresNaTela(page, leitor, escala) {
  const geo = await page.evaluate(({ PONTOS }) => {
    const svg = document.querySelector('.marca--nav'); const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal; const p = document.querySelector('.orc-palco'), palco = p ? p.getBoundingClientRect() : { top: 0 };
    const logo = {}; for (const [k, [x, y]] of Object.entries(PONTOS)) logo[k] = [r.left + x / vb.width * r.width, r.top + y / vb.height * r.height];
    return { logo, barra: [4, 4], palco: [4, Math.max(palco.top, 0) + 6] };
  }, { PONTOS });
  const png = await page.screenshot();
  const nomes = ['barra', 'palco', ...Object.keys(geo.logo)];
  const pts = [geo.barra, geo.palco, ...Object.values(geo.logo)].map(([x, y]) => [x * escala, y * escala]);
  const px = await lerPixels(leitor, png, pts);
  return Object.fromEntries(nomes.map((n, i) => [n, px[i]]));
}
function conferirCores(cores, tema, rotulo) {
  for (const [parte, alvo] of Object.entries(ESPERADO[tema])) ok(perto(cores[parte], alvo), rotulo + ': ' + parte + ' ' + hex(cores[parte]) + ' (esperado ' + alvo + ')');
}
/* contraste do texto à vista: cor do texto × o 1º fundo opaco de baixo para cima (a pintura de ponta a ponta usa a mesma cor do fundo) */
const contrasteDaTela = page => page.evaluate(() => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const fundoDe = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] >= .99)) return c; } return [0, 0, 0]; };
  const ruins = [], vistos = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const el = tw.currentNode.parentElement;
    if (!tw.currentNode.textContent.trim() || !el || vistos.has(el) || el.closest('.sr-only, [hidden], .passagem, .skip-link, .visor, .orc-vitrine, svg')) continue;
    vistos.add(el);
    const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const c = getComputedStyle(el); const cor = rgb(c.color); if (cor[3] !== undefined && cor[3] < .99) continue;
    const tam = parseFloat(c.fontSize), grande = tam >= 24 || (tam >= 18.66 && Number(c.fontWeight) >= 700);
    const k = razao(cor, fundoDe(el));
    if (k < (grande ? 3 : 4.5)) ruins.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ' "' + el.textContent.trim().slice(0, 24) + '" ' + k.toFixed(2));
  }
  return ruins;
});
const sobrepoe = (a, b) => a && b && a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;

async function abrir(nav, { largura, altura, tema, escala = 2, colorScheme = 'dark' }) {
  const ctx = await nav.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: escala, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme });
  await autorizarContexto(ctx, BASE);
  if (tema === 'claro') await ctx.addInitScript(([k]) => { try { localStorage.setItem(k, 'claro'); } catch { /* sem armazenamento */ } }, [CHAVE]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

const nav = await chromium.launch({ executablePath: EXEC });
const ctxLeitor = await nav.newContext(); const leitor = await ctxLeitor.newPage();
try {
  /* aquece o servidor (o 1º carregamento é lento e não conta) */
  { const { ctx } = await abrir(nav, { largura: 390, altura: 844, tema: 'escuro', escala: 1 }); await ctx.close(); }

  /* ---------- 1 a 4: os dois temas em cada largura ---------- */
  for (const [largura, altura] of LARGURAS) {
    for (const tema of ['escuro', 'claro']) {
      const rot = tema + ' ' + largura;
      const { ctx, page } = await abrir(nav, { largura, altura, tema });
      const info = await page.evaluate(() => {
        const b = document.querySelector('.nav__tema'), r = e => (e ? e.getBoundingClientRect().toJSON() : null);
        const ia = document.getElementById('o-conversa-titulo');
        return {
          tema: document.documentElement.getAttribute('data-tema'),
          meta: document.querySelector('meta[name="color-scheme"]').content,
          esquema: getComputedStyle(document.documentElement).colorScheme,
          botao: b && { caixa: r(b), visivel: b.checkVisibility(), pressionado: b.getAttribute('aria-pressed'), rotulo: b.getAttribute('aria-label') },
          logo: r(document.querySelector('.nav__logo .marca')), menu: r(document.querySelector('.nav__toggle:not([hidden])')),
          ia: ia && ia.checkVisibility() && ia.textContent, lateral: document.documentElement.scrollWidth > innerWidth
        };
      });
      ok(info.tema === tema, rot + ': data-tema = ' + info.tema);
      const mesmo = (a, b) => String(a).split(' ').sort().join(' ') === String(b).split(' ').sort().join(' ');   /* (o navegador escreve "light only") */
      ok(info.meta === (tema === 'claro' ? 'only light' : 'dark') && mesmo(info.esquema, info.meta), rot + ': color-scheme ' + info.meta + ' / ' + info.esquema);
      const bx = info.botao && info.botao.caixa;
      ok(info.botao && info.botao.visivel && bx.width >= 44 && bx.height >= 44 && bx.top >= 0 && bx.right <= largura, rot + ': botão à vista no topo, ' + (bx ? Math.round(bx.width) + '×' + Math.round(bx.height) : 'ausente'));
      ok(info.botao && info.botao.pressionado === (tema === 'claro' ? 'true' : 'false') && info.botao.rotulo === 'Tema claro', rot + ': aria-pressed ' + (info.botao && info.botao.pressionado));
      ok(!sobrepoe(bx, info.logo) && !sobrepoe(bx, info.menu), rot + ': o botão não cobre a logo nem o menu');
      ok(/assistente virtual \(IA\)/.test(info.ia || ''), rot + ': aviso de IA à vista');
      ok(!info.lateral, rot + ': sem rolagem lateral');
      conferirCores(await coresNaTela(page, leitor, 2), tema, rot);
      const ruins = await contrasteDaTela(page);
      ok(ruins.length === 0, rot + ': contraste AA do texto à vista' + (ruins.length ? ': ' + ruins.join(' · ') : ''));
      const ach = await cortes(page);
      ok(ach.length === 0, rot + ': nada cortado' + (ach.length ? ': ' + ach.join(' · ') : ''));
      await guardar('tema-' + tema + '-' + largura + '.png', await page.screenshot());
      if (largura === 390) {
        const b = await page.locator('.nav__tema').boundingBox({ timeout: 2000 }).catch(() => null);
        if (b) await guardar('botao-' + tema + '.png', await page.screenshot({ clip: { x: 0, y: 0, width: largura, height: Math.ceil(b.y + b.height + 12) } }));
        /* a conversa: rola até ela, para ver a 1ª fala e as opções */
        await page.locator('#o-conversa-titulo').scrollIntoViewIfNeeded();
        await page.evaluate(() => scrollBy(0, -80));
        await page.waitForTimeout(300);
        ok((await contrasteDaTela(page)).length === 0, rot + ': contraste AA na conversa');
        await guardar('conversa-' + tema + '-' + largura + '.png', await page.screenshot());
      }
      await ctx.close();
    }
  }

  /* ---------- 3: o botão troca, guarda e volta (clique de verdade, recarregando) ---------- */
  try {
    const { ctx, page } = await abrir(nav, { largura: 390, altura: 844, tema: 'escuro' });
    const estado = () => page.evaluate(k => [document.documentElement.getAttribute('data-tema'), localStorage.getItem(k), document.querySelector('.nav__tema').getAttribute('aria-pressed'), document.querySelector('meta[name="theme-color"]').content], CHAVE);
    ok(JSON.stringify(await estado()) === JSON.stringify(['escuro', null, 'false', '#131617']), 'troca: abre no escuro sem nada guardado');
    await page.locator('.nav__tema').click();
    await page.waitForTimeout(1200);   /* (a logo e a barra trocam de cor numa transição de até 0,8 s) */
    ok(JSON.stringify(await estado()) === JSON.stringify(['claro', 'claro', 'true', '#FFFFFF']), 'troca: um toque vai ao claro e guarda');
    conferirCores(await coresNaTela(page, leitor, 2), 'claro', 'troca → claro');
    await page.reload({ waitUntil: 'load' });
    ok((await estado())[0] === 'claro', 'troca: recarregando, continua no claro');
    await page.locator('.nav__tema').focus(); await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    ok(JSON.stringify(await estado()) === JSON.stringify(['escuro', 'escuro', 'false', '#131617']), 'troca: pelo teclado (Enter) volta ao escuro e guarda');
    await page.reload({ waitUntil: 'load' });
    ok((await estado())[0] === 'escuro', 'troca: recarregando, continua no escuro');
    conferirCores(await coresNaTela(page, leitor, 2), 'escuro', 'troca → escuro');
    await ctx.close();
  } catch (e) { ok(false, 'troca: ' + e.message.split('\n')[0]); }

  /* ---------- 5: não pisca (o claro guardado, o js/tema.js atrasado 800 ms de propósito) ---------- */
  {
    /* (sistema claro: o about:blank antes da navegação é branco; um quadro escuro só pode ser o tema errado) */
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: 'light' });
    await autorizarContexto(ctx, BASE);
    await ctx.addInitScript(([k]) => {
      try { localStorage.setItem(k, 'claro'); } catch { /* sem armazenamento */ }
      /* o 1º quadro: o rAF roda antes da 1ª pintura */
      requestAnimationFrame(() => { window.__temaNo1oQuadro = document.documentElement.getAttribute('data-tema'); window.__corpoNo1oQuadro = !!document.body; });
    }, [CHAVE]);
    await ctx.route('**/js/tema.js*', async r => { await new Promise(f => setTimeout(f, 800)); await r.continue(); });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const quadros = [];
    cdp.on('Page.screencastFrame', f => { quadros.push(f.data); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(600);
    await cdp.send('Page.stopScreencast');
    const sonda = await page.evaluate(() => [window.__temaNo1oQuadro, window.__corpoNo1oQuadro]);
    ok(sonda[0] === 'claro', 'não pisca: no 1º quadro o tema já é o claro (' + sonda[0] + ', corpo ' + (sonda[1] ? 'existe' : 'ainda não') + ')');
    /* nenhum quadro com a barra do topo escura (o tema errado) */
    let escuros = 0;
    for (const [i, q] of quadros.entries()) { const [px] = await lerPixels(leitor, Buffer.from(q, 'base64'), [[4, 4]]); if (px[0] < 128) { escuros++; await guardar('pisca-quadro-' + i + '.png', Buffer.from(q, 'base64')); } }
    ok(quadros.length > 0 && escuros === 0, 'não pisca: ' + quadros.length + ' quadros da tela, ' + escuros + ' com a barra escura');
    await ctx.close();
  }
} finally {
  await nav.close();
}

/* ---------- 6: o escurecimento forçado do Chrome (o do Android), sistema escuro e claro ---------- */
const navEscuro = await chromium.launch({ executablePath: EXEC, args: ['--blink-settings=forceDarkModeEnabled=true'] });
const ctxLeitor2 = await navEscuro.newContext(); const leitor2 = await ctxLeitor2.newPage();
try {
  for (const sistema of ['dark', 'light']) {
    /* o controle: uma página branca sem color-scheme TEM de escurecer, senão o ajuste não está ligado e a prova não vale */
    const c = await navEscuro.newContext({ viewport: { width: 390, height: 300 }, colorScheme: sistema });
    const p = await c.newPage(); await p.setContent('<html><body style="margin:0;background:#fff"><p>controle</p></body></html>');
    const [px] = await lerPixels(leitor2, await p.screenshot(), [[4, 4]]);
    ok(px[0] < 128, 'escurecimento forçado (sistema ' + sistema + '): o controle branco escurece, ' + hex(px) + ' (o ajuste está ligado)');
    await c.close();
    for (const tema of ['escuro', 'claro']) {
      const { ctx, page } = await abrir(navEscuro, { largura: 390, altura: 844, tema, colorScheme: sistema });
      const rot = 'forçado, sistema ' + sistema + ', ' + tema;
      const cores = await coresNaTela(page, leitor2, 2);
      if (sistema === 'dark') conferirCores(cores, tema, rot);
      else {
        /* sistema CLARO com o escurecimento ligado à força (a flag do Chrome, não o "escurecer sites" do tema escuro do Android):
           o Chrome escurece qualquer página, e nenhuma declaração impede (nem o "only light", medido no PR #227). Fica registrado,
           sem reprovar; a comparação com /sites (escura desde sempre) mostra que é o mesmo no site inteiro */
        console.log('INFO  ' + rot + ': ' + Object.entries(cores).map(([k, v]) => k + ' ' + hex(v)).join(', '));
      }
      await guardar('forcado-' + sistema + '-' + tema + '.png', await page.screenshot());
      await ctx.close();
    }
    if (sistema === 'light') {
      const ctx = await navEscuro.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: sistema });
      await autorizarContexto(ctx, BASE);
      const page = await ctx.newPage(); await page.goto(BASE + '/sites', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(400);
      const cores = await coresNaTela(page, leitor2, 2);
      console.log('INFO  forçado, sistema light, /sites (referência): ' + ['barra', 'nome', 'aro', 'zero', 'nucleo'].map(k => k + ' ' + hex(cores[k])).join(', '));
      await ctx.close();
    }
  }
} finally {
  await navEscuro.close();
}
console.log(falhou ? '\nHÁ FALHAS' : '\nTUDO OK');
process.exit(falhou ? 1 : 0);
