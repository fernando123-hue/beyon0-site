/* ==========================================================================
   OS DETALHES DO ORÇAMENTO lado a lado (dono, 24/11: "Dê um pouco mais de detalhes em tudo, com ênfase no campo aonde o usuário
   escreve e no microfone e seu ícone. Tire os numeros ao lados das opções pré selecionadas").
   Monta, para 390 escuro e 390 claro, uma imagem com 4 colunas: "ATUAL (main)", "A", "B", "C", em três estados:
   parado (rolado até a conversa: opções + campo + Falar/Enviar), GRAVANDO (o microfone) e EM FOCO com texto digitado.
   As variações vêm do docs/design/orcamento-detalhes-2026-11-24.md: cada bloco ```css variacao-x é injetado por cima do código do
   ramo; o bloco marcado "no-codigo" é a variação que JÁ está no código (nada injetado).
   O microfone só aparece com o recurso ligado no servidor (api, sessao-config.voz): aqui ele é mostrado à mão, e o estado
   gravando é a classe is-gravando com o rótulo do relógio (o mesmo que js/orcamento-voz.js escreve). Não grava, não escreve
   na conversa, não cria sessão (o texto digitado nunca é enviado).
   Também confere, em 390/360/320/1440 e nos dois temas, que nenhuma opção pronta mostra número e que nada está cortado
   (docs/cortes.mjs) na variação do código.
   Uso: dois servidores (docs/servidor.mjs): a main numa porta e o ramo noutra, depois
     BASE=http://127.0.0.1:8897 BASE_MAIN=http://127.0.0.1:8896 CHROMIUM=... node docs/detalhes-orcamento.mjs <pasta de saída>
   ========================================================================== */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cortes } from './cortes.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const BASE_MAIN = process.env.BASE_MAIN || '';
const EXEC = process.env.CHROMIUM || undefined;
const SAIDA = process.argv[2];
if (!SAIDA) { console.error('uso: node docs/detalhes-orcamento.mjs <pasta de saída>'); process.exit(2); }
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MD = path.join(AQUI, 'design', 'orcamento-detalhes-2026-11-24.md');
const CHAVE = 'bz-orcamento-tema';
const TEXTO = 'Tenho uma clínica de fisioterapia em Niterói e quero mais agendamentos pelo site';

/* os blocos ```css variacao-a [no-codigo] do documento */
async function variacoes() {
  const md = await readFile(MD, 'utf8');
  const v = {};
  for (const m of md.matchAll(/```css variacao-([abc])( no-codigo)?\r?\n([\s\S]*?)```/g)) v[m[1].toUpperCase()] = m[2] ? '' : m[3];
  for (const k of ['A', 'B', 'C']) if (!(k in v)) throw new Error('falta o bloco ```css variacao-' + k.toLowerCase() + ' no ' + MD);
  return v;
}

let falhou = false;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };

async function abrir(nav, { base, largura, altura, tema, css }) {
  /* (bypassCSP: só para o <style> da variação injetada; a página continua com o CSP dela em produção) */
  const ctx = await nav.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 2, isMobile: largura < 900, hasTouch: largura < 900, reducedMotion: 'no-preference', bypassCSP: !!css });
  await ctx.addInitScript(([k, t]) => { try { localStorage.setItem(k, t); } catch { /* sem armazenamento */ } }, [CHAVE, tema]);
  const page = await ctx.newPage();
  for (let i = 0; i < 2; i++) {   /* (o 1º carregamento do headless pode falhar: tenta de novo) */
    try { await page.goto(base + '/orcamento', { waitUntil: 'load', timeout: 90000 }); break; } catch (e) { if (i) throw e; }
  }
  if (css) await page.addStyleTag({ content: css });
  await page.waitForSelector('.orc-op--toque', { timeout: 15000 });
  /* o microfone, como fica com o recurso ligado no servidor */
  await page.evaluate(() => { const b = document.getElementById('o-mic'); if (b) b.hidden = false; });
  await page.waitForTimeout(500);
  return { ctx, page };
}
/* rola até a conversa: o título dela logo abaixo do topo */
async function rolar(page) {
  await page.evaluate(() => {
    const t = document.getElementById('o-conversa-titulo'), nav = document.querySelector('.nav');
    scrollTo(0, scrollY + t.getBoundingClientRect().top - (nav ? nav.getBoundingClientRect().height : 64) - 16);
  });
  await page.waitForTimeout(250);
}
async function gravando(page) {
  await page.evaluate(() => {
    const b = document.getElementById('o-mic');
    b.classList.add('is-gravando'); b.setAttribute('aria-pressed', 'true');
    document.getElementById('o-mic-rotulo').textContent = 'Parar · 0:07 de 1:30';
    const c = document.getElementById('o-mic-cancelar'); if (c) c.hidden = false;
  });
  await page.waitForTimeout(450);
}
async function foco(page) {
  await page.locator('#o-texto').focus();
  await page.keyboard.type(TEXTO, { delay: 0 });
  await page.waitForTimeout(450);
}
/* congela o movimento num quadro fixo (o mesmo instante em todas as colunas) */
const congelar = (page, ms) => page.evaluate(t => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, ms);

async function print(nav, { base, tema, css, estado }) {
  const { ctx, page } = await abrir(nav, { base, largura: 390, altura: 844, tema, css });
  try {
    await rolar(page);
    if (estado === 'gravando') await gravando(page);
    if (estado === 'foco') await foco(page);
    await rolar(page);
    await congelar(page, estado === 'foco' ? 420 : 300);
    return await page.screenshot();
  } finally { await ctx.close(); }
}

async function montar(nav, colunas, saida) {
  const html = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#d9dcdc;font:600 15px system-ui"><div style="display:flex;gap:24px;padding:16px;align-items:flex-start">' +
    colunas.map(c => '<figure style="margin:0;width:390px"><figcaption style="padding:0 0 8px">' + c.rotulo + '</figcaption><img style="width:100%;display:block;outline:1px solid #888" src="data:image/png;base64,' + c.png.toString('base64') + '"></figure>').join('') + '</div></body>';
  const page = await nav.newPage({ viewport: { width: colunas.length * 414 + 16, height: 800 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: saida, fullPage: true });
  await page.close();
  console.log('     ' + saida);
}

/* a variação do código: nenhuma opção com número, nada cortado, nos dois temas e nas 4 larguras */
async function conferir(nav) {
  for (const [largura, altura] of [[390, 844], [360, 780], [320, 640], [1440, 900]]) {
    for (const tema of ['escuro', 'claro']) {
      const { ctx, page } = await abrir(nav, { base: BASE, largura, altura, tema, css: '' });
      try {
        await rolar(page);
        const r = await page.evaluate(() => {
          const ops = [...document.querySelectorAll('.orc-op--toque')];
          const conteudo = ops.map(b => [getComputedStyle(b, '::after').content, getComputedStyle(b, '::before').content]);
          const comNumero = ops.filter(b => /\d/.test(b.innerText)).map(b => b.innerText);
          const posTexto = ops.map(b => { const t = b.querySelector('.orc-op__t') || b; const rr = document.createRange(); rr.selectNodeContents(t); return Math.round(rr.getBoundingClientRect().left - b.getBoundingClientRect().left); });
          const lateral = document.documentElement.scrollWidth > innerWidth;
          return { n: ops.length, conteudo, comNumero, posTexto, lateral };
        });
        const rot = tema + ' ' + largura;
        ok(r.n > 0, rot + ': ' + r.n + ' opções prontas à vista');
        ok(r.conteudo.every(([d, a]) => (d === 'none' || d === 'normal') && (a === 'none' || a === 'normal')), rot + ': nenhum ::after/::before nas opções (o número saiu)');
        ok(!r.comNumero.length, rot + ': nenhum dígito no texto das opções ' + (r.comNumero.join(', ') || ''));
        ok(new Set(r.posTexto).size === 1, rot + ': o texto de todas as opções começa no mesmo recuo (' + [...new Set(r.posTexto)].join(', ') + ' px)');
        ok(!r.lateral, rot + ': sem rolagem lateral');
        const c = await cortes(page);
        ok(!c.length, rot + ': nada cortado ' + (c.join(' | ') || ''));
        await foco(page);
        const c2 = await cortes(page);
        ok(!c2.length, rot + ', em foco com texto: nada cortado ' + (c2.join(' | ') || ''));
      } finally { await ctx.close(); }
    }
  }
}

await mkdir(SAIDA, { recursive: true });
const V = await variacoes();
const nav = await chromium.launch({ executablePath: EXEC });
try {
  { const { ctx } = await abrir(nav, { base: BASE, largura: 390, altura: 844, tema: 'escuro', css: '' }); await ctx.close(); }   /* aquece */
  if (BASE_MAIN) { const { ctx } = await abrir(nav, { base: BASE_MAIN, largura: 390, altura: 844, tema: 'escuro', css: '' }); await ctx.close(); }
  /* (para iterar no desenho: SO_PRINTS=1 pula a conferência; ESTADOS=parado,foco e TEMAS=escuro filtram os prints) */
  if (!process.env.SO_PRINTS) await conferir(nav);
  const filtro = (env, todos) => (process.env[env] ? process.env[env].split(',') : todos);
  for (const estado of filtro('ESTADOS', ['parado', 'gravando', 'foco'])) {
    for (const tema of filtro('TEMAS', ['escuro', 'claro'])) {
      const colunas = [];
      if (BASE_MAIN) colunas.push({ rotulo: 'ATUAL (main)', png: await print(nav, { base: BASE_MAIN, tema, css: '', estado }) });
      for (const k of ['A', 'B', 'C']) colunas.push({ rotulo: k + (V[k] === '' ? ' (no código, recomendada)' : ''), png: await print(nav, { base: BASE, tema, css: V[k], estado }) });
      await montar(nav, colunas, path.join(SAIDA, `lado-a-lado-390-${tema}-${estado}.png`));
    }
  }
} finally { await nav.close(); }
if (falhou) { console.log('\nFALHOU'); process.exit(1); }
console.log('\nTudo certo.');
