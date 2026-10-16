/* J5 da crítica da Planta (aprovado pelo dono, 2026-10-16): no celular de exemplo, as letras ficavam com 6–8 px na tela
   e o aparelho ocupava 33–41 % do cartão. Mede, depois da demonstração pousar no celular, o tamanho na tela de verdade
   (font-size × escala da moldura) e a fração do cartão, a 360/390/430 px, contra um piso.
   Servidor: node docs/servidor.mjs . 8897. Uso: BASE=http://127.0.0.1:8897 node docs/pecas/legivel.mjs */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8897';
/* antes (palco quadrado, 360/390/430): 33/37/41 %, botão 5,9/6,6/7,4 px, marca 8,8/9,8/11,1 px, título 13,5/15,1/17,1 px,
   foto 51/57/65 px. O piso: tudo maior, a foto nunca menor que antes, e o texto do botão sem encostar na borda */
const PISO = { fracao: 37, botao: 7.5, marca: 10, titulo: 15, foto: 50, folgaBotao: 8 };
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
for (const w of [360, 390, 430]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { sessionStorage.setItem('bz-ouro', '1'); } catch (e) {} });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 240000 });
  await p.locator('.planta__palco').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  /* pousada: a régua na largura da tela de quem vê (não um tempo fixo: em máquina lenta mediria no meio do deslize) */
  await p.waitForFunction(() => +document.querySelector('.planta__slider').getAttribute('aria-valuenow') === Math.max(360, Math.min(1440, innerWidth)) && document.querySelector('.planta__moldura').classList.contains('is-celular'), null, { timeout: 60000 });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const m = document.querySelector('.planta__moldura'), card = m.closest('.servico');
    const rm = m.getBoundingClientRect(), esc = rm.width / m.offsetWidth;
    const tam = (s) => +(parseFloat(getComputedStyle(m.querySelector(s)).fontSize) * esc).toFixed(1);
    /* a foto na tela (px) e a folga do texto do botão até a borda dele, em px do exemplo (o texto não pode encostar) */
    const btn = m.querySelector('.pl-btn'), faixa = document.createRange(); faixa.selectNodeContents(btn);
    const rb = btn.getBoundingClientRect(), rt = faixa.getBoundingClientRect();
    return { fracao: +(rm.width / card.getBoundingClientRect().width * 100).toFixed(1), titulo: tam('.pl-titulo'), marca: tam('.pl-marca'), botao: tam('.pl-btn'),
      foto: Math.round(m.querySelector('.pl-foto').getBoundingClientRect().height), folgaBotao: Math.round(Math.min(rt.left - rb.left, rb.right - rt.right) / esc) };
  });
  const baixos = Object.keys(PISO).filter((k) => r[k] < PISO[k]);
  if (baixos.length) problemas++;
  console.log(`${baixos.length ? 'FALHA' : 'OK   '} ${w}: celular ${r.fracao}% do cartão, título ${r.titulo} px, marca ${r.marca} px, botão ${r.botao} px, foto ${r.foto} px de altura, folga do botão ${r.folgaBotao} px` + (baixos.length ? ` — abaixo do piso: ${baixos.join(', ')}` : ''));
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
