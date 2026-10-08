/* Quadros da PASSAGEM (js/passagem.js, css/passagem.css): congela as animações e fotografa a saída e a chegada
   em instantes fixos, no celular e no desktop, para VER o gesto quadro a quadro.
   Uso: BASE=http://127.0.0.1:8899 CHROMIUM=... [DESTINO=/orcamento] [ORIGEM=/sites] node docs/passagem-quadros.mjs <pasta>
   (no Git Bash, MSYS_NO_PATHCONV=1 antes, senão o DESTINO vira caminho do Windows)
   A saída é um clique de verdade no primeiro link visível para o DESTINO, com a navegação segurada (o
   setTimeout de SAI_MS é engolido); a chegada é a página aberta como se viesse de outra (o mesmo
   sessionStorage que o js/passagem.js grava). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PASTA = process.argv[2] || 'docs/quadros-passagem';
const DESTINO = process.env.DESTINO || '/sites';
const ORIGEM = process.env.ORIGEM || (DESTINO === '/' ? '/sites' : '/');   /* (para o Início, sai de Sites) */
const SAIDA_MS = [0, 150, 300, 450, 580];
const CHEGADA_MS = [0, 150, 300, 500, 700, 1000];
const TELAS = { cel: { width: 390, height: 844 }, desk: { width: 1440, height: 900 } };

mkdirSync(PASTA, { recursive: true });
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

/* congela as animações da passagem no instante t (ms desde o início delas). Na chegada, repõe a classe
   que o js/passagem.js tira depois de CHEGADA_MS (os quadros demoram mais que isso para sair). */
const congelar = (pagina, t, chegada = false) => pagina.evaluate(([ms, ch]) => {
  if (ch) document.documentElement.classList.add('passagem-chega');
  document.getAnimations().forEach((a) => {
    if (/^pass-/.test(a.animationName || '')) { a.pause(); a.currentTime = ms; }
  });
}, [t, chegada]);

for (const [nome, tela] of Object.entries(TELAS)) {
  const ctx = await nav.newContext({ viewport: tela, deviceScaleFactor: 1 });
  const pagina = await ctx.newPage();

  await pagina.goto(BASE + ORIGEM, { waitUntil: 'load' });
  await pagina.waitForTimeout(1500);
  await pagina.evaluate(() => {
    const st = window.setTimeout;
    window.setTimeout = (f, ms, ...r) => (ms >= 500 ? 0 : st(f, ms, ...r));   /* segura a navegação e o desfazer */
  });
  const link = pagina.locator(`a[href="${DESTINO}"]:visible`).first();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  for (const t of SAIDA_MS) {
    await congelar(pagina, t);
    await pagina.screenshot({ path: `${PASTA}/saida-${nome}-${String(t).padStart(4, '0')}.png` });
  }

  await pagina.evaluate(() => sessionStorage.setItem('bz-passagem', String(Date.now())));
  await pagina.goto(BASE + DESTINO, { waitUntil: 'domcontentloaded' });
  await congelar(pagina, 0, true);
  await pagina.waitForLoadState('load');
  for (const t of CHEGADA_MS) {
    await congelar(pagina, t, true);
    await pagina.screenshot({ path: `${PASTA}/chegada-${nome}-${String(t).padStart(4, '0')}.png` });
  }
  await ctx.close();
}
await nav.close();
console.log('quadros em', PASTA);
