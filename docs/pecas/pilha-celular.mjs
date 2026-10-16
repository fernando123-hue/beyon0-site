/* A pilha do celular: o FICHÁRIO COM CHEGADA (dono, 2026-10-16, escolheu a B entre três opções: "vamos com a B, só
   quero que as letras acendam também"). Rola a pilha inteira de cada página e confere:
   - celular (390): cada card preso pelo TOPO, em degraus de 14 px abaixo do menu; sem carga (barra, porcentagem, fio) e
     sem deslize ligado à rolagem; com algum card no degrau, aceso é o de cima (o último que assentou) — borda ciano e
     letras acesas —, só um, e os de baixo cobertos; subindo de volta (num salto), nada aceso nem coberto;
   - celular girado (844 → 390): o mesmo, sem disputa de aceso com o "em foco" do meio da tela;
   - movimento reduzido (390): o fichário parado, sem classes;
   - tablet em pé (768): sem sticky, o card no meio da tela acende como antes;
   - desktop (1440): nada sticky, nada coberto.
   Servidor: node docs/servidor.mjs . 8897. Uso: BASE=http://127.0.0.1:8897 node docs/pecas/pilha-celular.mjs */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8897';
const DEGRAU = 14, FOLGA = 12;
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
const falha = (msg) => { problemas++; console.log('FALHA ' + msg); };
const casos = [];
for (const pagina of ['/', '/sites', '/automacao']) casos.push({ pagina, largura: 390 });
casos.push({ pagina: '/', largura: 390, girar: true }, { pagina: '/', largura: 390, reduzido: true }, { pagina: '/', largura: 768 }, { pagina: '/', largura: 1440 }, { pagina: '/sites', largura: 1440 });
for (const { pagina, largura, girar, reduzido } of casos) {
  const celular = largura <= 720, alto = largura < 900 ? (largura < 721 ? 844 : 1024) : 900;
  const ctx = await b.newContext({ viewport: girar ? { width: 844, height: 390 } : { width: largura, height: alto }, isMobile: largura < 900, hasTouch: largura < 900, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + pagina, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(2000);
  if (girar) { await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1500); }
  const grupos = await p.evaluate(() => document.querySelectorAll('.pilha').length);
  for (let g = 0; g < grupos; g++) {
    const r = await p.evaluate(async ({ g, DEGRAU, FOLGA }) => {
      const quadro = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const pilha = document.querySelectorAll('.pilha')[g];
      const cards = [].filter.call(pilha.children, (c) => !c.classList.contains('estacao-vao'));
      const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
      /* a cor de referência da letra acesa, resolvida pelo navegador */
      const prova = document.createElement('i'); prova.style.color = 'var(--letra-acesa-t)'; document.body.appendChild(prova);
      const corAcesa = getComputedStyle(prova).color; prova.remove();
      const estilo = cards.map((c, k) => { const s = getComputedStyle(c); return { k, pos: s.position, top: s.top, esperado: nav + FOLGA + k * DEGRAU }; });
      const topo = pilha.getBoundingClientRect().top + scrollY, fim = topo + pilha.offsetHeight;
      const anim = [], acesoErrado = [];
      let noDegrau = 0, cobertos = 0, focos = 0, doisAcesos = 0, letrasApagadas = 0, bordaApagada = 0;
      for (let y = topo - innerHeight; y <= fim; y += 120) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await quadro(); await new Promise((ok) => setTimeout(ok, 380));   /* (a borda e as letras mudam em .3 s) */
        const acesos = cards.filter((c) => c.classList.contains('is-foco'));
        if (acesos.length > 1) doisAcesos++;
        let cima = -1;
        cards.forEach((c, k) => { if (Math.abs(c.getBoundingClientRect().top - (nav + FOLGA + k * DEGRAU)) < 1.5) cima = k; });
        /* (o grupo indo embora: os de cima sobem antes do 1º sair do degrau; aí o aceso segue o último que assentou) */
        const saindo = cards.some((c, k) => c.getBoundingClientRect().top < nav + FOLGA + k * DEGRAU - 1.5);
        const aceso = cards.findIndex((c) => c.classList.contains('is-foco'));
        if (cima >= 0) noDegrau++;
        if (!saindo && cima >= 0 && aceso !== cima) acesoErrado.push(`y=${Math.round(y)}: no degrau o ${cima + 1}, aceso ${aceso + 1}`);
        acesos.forEach((c) => {
          focos++;
          if (getComputedStyle(c.querySelector('h3')).color !== corAcesa) letrasApagadas++;
          if (getComputedStyle(c).borderTopColor !== 'rgba(73, 229, 221, 0.6)') bordaApagada++;
        });
        cards.forEach((c, k) => {
          if (c.classList.contains('is-coberto')) cobertos++;
          const n = getComputedStyle(c).animationName;
          if (n && /pilha/.test(n)) anim.push(`card ${k + 1}: ${n}`);
        });
      }
      /* um salto de baixo da pilha para antes dela (os gatilhos trocam todos no mesmo quadro): nada aceso nem coberto */
      window.scrollTo({ top: fim + innerHeight, behavior: 'instant' });
      await quadro();
      window.scrollTo({ top: topo - innerHeight - 200, behavior: 'instant' });
      await quadro(); await new Promise((ok) => setTimeout(ok, 120));
      const sobra = cards.filter((c) => c.classList.contains('is-coberto') || c.classList.contains('is-foco')).length;
      return { estilo, noDegrau, cobertos, focos, doisAcesos, acesoErrado, letrasApagadas, bordaApagada, anim, sobra,
        carga: pilha.querySelectorAll('.carga, .carga-fio, .carga__pct, .tem-carga').length, sai: pilha.querySelectorAll('.pilha-sai').length };
    }, { g, DEGRAU, FOLGA });
    const nome = `${pagina} ${largura}${girar ? ' (girado)' : ''}${reduzido ? ' (reduzido)' : ''} pilha ${g + 1}`;
    const antes = problemas;
    if (!celular) {
      r.estilo.forEach((e) => { if (e.pos === 'sticky') falha(`${nome}: card ${e.k + 1} sticky`); });
      if (r.cobertos) falha(`${nome}: is-coberto fora do celular`);
      if (largura === 768 && !r.focos) falha(`${nome}: no tablet o card do meio da tela não acendeu`);
    } else {
      r.estilo.forEach((e) => {
        if (e.pos !== 'sticky') falha(`${nome}: card ${e.k + 1} não é sticky (${e.pos})`);
        else if (Math.abs(parseFloat(e.top) - e.esperado) > 0.5) falha(`${nome}: card ${e.k + 1} preso em top=${e.top}, esperado ${e.esperado}px`);
      });
      if (!r.noDegrau) falha(`${nome}: nenhum card ficou no degrau durante a rolagem`);
      if (r.carga) falha(`${nome}: carga no celular (${r.carga} peças)`);
      if (r.sai || r.anim.length) falha(`${nome}: deslize ligado à rolagem (${r.anim.slice(0, 2).join(', ') || r.sai + ' cards'})`);
      if (reduzido) {
        if (r.focos || r.cobertos) falha(`${nome}: classes com movimento reduzido`);
      } else {
        if (!r.focos) falha(`${nome}: nenhum card acendeu`);
        if (!r.cobertos) falha(`${nome}: nenhum card coberto apagou`);
        if (r.doisAcesos) falha(`${nome}: ${r.doisAcesos} quadro(s) com mais de um card aceso`);
        if (r.letrasApagadas) falha(`${nome}: ${r.letrasApagadas} quadro(s) com o card aceso de letras apagadas`);
        if (r.bordaApagada) falha(`${nome}: ${r.bordaApagada} quadro(s) com o card aceso sem a borda ciano`);
        r.acesoErrado.slice(0, 2).forEach((a) => falha(`${nome}: aceso errado, ${a}`));
        if (r.sobra) falha(`${nome}: ${r.sobra} card(s) ainda aceso(s)/coberto(s) depois de subir`);
      }
    }
    if (problemas === antes) console.log(`OK    ${nome}: ${r.estilo.length} cards, quadros com card no degrau ${r.noDegrau}, aceso ${r.focos}, coberto ${r.cobertos}`);
  }
  if (erros.length) falha(`${pagina} ${largura}: erros ${erros.join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
