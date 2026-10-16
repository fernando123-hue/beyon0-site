/* As opções da pilha do celular em teste (?pilha=a|b|c; dono, 2026-10-16: a atual é "um amontoado de efeitos", a
   publicada "é bem mais confortável"). Rola a pilha inteira de cada página e confere:
   - todas (390): sem carga (barra, porcentagem, fio) e sem o deslize ligado à rolagem;
   - A e B (390): cada card preso pelo TOPO, em degraus de 14 px abaixo do menu, e algum quadro com ele no degrau;
   - B (390): o card no degrau acende (.is-foco) e o de baixo fica coberto (.is-coberto); subindo, apaga de novo;
   - C (390): nada sticky; o card no meio da tela acende (.is-foco);
   - desktop (1440, com a opção na URL): nada sticky, nenhuma classe das opções nos cards.
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
for (const opcao of ['a', 'b', 'c']) for (const pagina of ['/', '/sites', '/automacao']) casos.push({ opcao, pagina, largura: 390 });
casos.push({ opcao: 'b', pagina: '/', largura: 1440 }, { opcao: 'c', pagina: '/sites', largura: 1440 });
for (const { opcao, pagina, largura } of casos) {
  const celular = largura < 721;
  const ctx = await b.newContext({ viewport: { width: largura, height: celular ? 844 : 900 }, isMobile: celular, hasTouch: celular });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${BASE}${pagina}?pilha=${opcao}`, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(2000);
  const grupos = await p.evaluate(() => document.querySelectorAll('.pilha').length);
  for (let g = 0; g < grupos; g++) {
    const r = await p.evaluate(async ({ g, DEGRAU, FOLGA }) => {
      const quadro = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const pilha = document.querySelectorAll('.pilha')[g];
      const cards = [].filter.call(pilha.children, (c) => !c.classList.contains('estacao-vao'));
      const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
      const estilo = cards.map((c, k) => { const s = getComputedStyle(c); return { k, pos: s.position, top: s.top, esperado: nav + FOLGA + k * DEGRAU }; });
      const topo = pilha.getBoundingClientRect().top + scrollY, fim = topo + pilha.offsetHeight;
      const anim = [];
      let noDegrau = 0, focoNoDegrau = 0, cobertos = 0, focos = 0, doisAcesos = 0;
      for (let y = topo - innerHeight; y <= fim; y += 120) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await quadro(); await new Promise((ok) => setTimeout(ok, 60));
        if (cards.filter((c) => c.classList.contains('is-foco')).length > 1) doisAcesos++;
        cards.forEach((c, k) => {
          const t = c.getBoundingClientRect().top;
          if (Math.abs(t - (nav + FOLGA + k * DEGRAU)) < 1.5) { noDegrau++; if (c.classList.contains('is-foco')) focoNoDegrau++; }
          if (c.classList.contains('is-coberto')) cobertos++;
          if (c.classList.contains('is-foco')) focos++;
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
      return { estilo, noDegrau, focoNoDegrau, cobertos, focos, doisAcesos, anim, sobra,
        carga: pilha.querySelectorAll('.carga, .carga-fio, .carga__pct, .tem-carga').length, sai: pilha.querySelectorAll('.pilha-sai').length };
    }, { g, DEGRAU, FOLGA });
    const nome = `?pilha=${opcao} ${pagina} ${largura} pilha ${g + 1}`;
    const antes = problemas;
    if (!celular) {
      r.estilo.forEach((e) => { if (e.pos === 'sticky') falha(`${nome}: card ${e.k + 1} sticky no desktop`); });
      if (r.cobertos) falha(`${nome}: is-coberto no desktop`);
    } else {
      if (r.carga) falha(`${nome}: carga no celular (${r.carga} peças)`);
      if (r.sai || r.anim.length) falha(`${nome}: deslize ligado à rolagem (${r.anim.slice(0, 2).join(', ') || r.sai + ' cards'})`);
      if (opcao === 'c') {
        r.estilo.forEach((e) => { if (e.pos === 'sticky') falha(`${nome}: card ${e.k + 1} sticky na lista`); });
        if (!r.focos) falha(`${nome}: nenhum card acendeu no meio da tela`);
      } else {
        r.estilo.forEach((e) => {
          if (e.pos !== 'sticky') falha(`${nome}: card ${e.k + 1} não é sticky (${e.pos})`);
          else if (Math.abs(parseFloat(e.top) - e.esperado) > 0.5) falha(`${nome}: card ${e.k + 1} preso em top=${e.top}, esperado ${e.esperado}px`);
        });
        if (!r.noDegrau) falha(`${nome}: nenhum card ficou no degrau durante a rolagem`);
        if (opcao === 'b') {
          if (!r.focoNoDegrau) falha(`${nome}: card no degrau não acendeu`);
          if (!r.cobertos) falha(`${nome}: nenhum card coberto apagou`);
          if (r.doisAcesos) falha(`${nome}: ${r.doisAcesos} quadro(s) com mais de um card aceso`);
          if (r.sobra) falha(`${nome}: ${r.sobra} card(s) ainda aceso(s)/coberto(s) depois de subir`);
        } else if (r.cobertos) falha(`${nome}: is-coberto fora da B`);
      }
    }
    if (problemas === antes) console.log(`OK    ${nome}: ${r.estilo.length} cards` + (celular ? `, degrau ${r.noDegrau}, aceso no degrau ${r.focoNoDegrau}, coberto ${r.cobertos}, foco ${r.focos}` : ''));
  }
  if (erros.length) falha(`?pilha=${opcao} ${pagina} ${largura}: erros ${erros.join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
