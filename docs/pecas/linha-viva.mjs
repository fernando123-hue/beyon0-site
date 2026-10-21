/* A LINHA VIVA dos cartões (direção C, dono, 2026-10-20: a opção 3 do número, "um pouquinho maior e que seus efeitos
   sejam mais perceptivos"). Confere, nas três páginas:
   - celular (390) e 320: o NÚMERO de cada cartão está NA LINHA de cima (centro a até 1,5 px do fio da borda, dentro
     da largura do cartão, 13 px); a LUZ POUSADA é um traço no fundo do cartão logo depois do número (--luz-x 60 px);
     sem os sinais antigos à mostra (marcas em L, traço do número, aresta de cima); sem rolagem lateral;
   - celular (390), rolando a página: no cartão aceso a luz DÁ A VOLTA (4 faixas rodando, a pousada sai) e nos outros
     nada roda; nunca mais de um cartão girando (com dois acesos na troca de grupo, gira o que acendeu por último);
   - movimento reduzido (390): nada montado, nada girando, a luz pousada fica;
   - desktop 1440 com mouse: a volta não é montada (quem dá a volta é a carga).
   Servidor: node docs/servidor.mjs . 8897. Uso: BASE=http://127.0.0.1:8897 node docs/pecas/linha-viva.mjs
   (no Windows sem o headless shell: node .superpowers/sh/com-chrome.mjs docs/pecas/linha-viva.mjs) */
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8897';
const b = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let problemas = 0;
const falha = (msg) => { problemas++; console.log('FALHA ' + msg); };
const ok = (msg) => console.log('OK    ' + msg);
const CARDS = '.painel:not(.console):not(.instrumento), .celula, .laudo__row, .spec__item, .cenario';
const NUM = '.servico__n, .celula__n, .laudo__n';

/* o estado parado de cada cartão com número: onde está o número, a luz pousada e o que sobrou do visual antigo */
const lerParado = (p, CARDS, NUM) => p.evaluate(({ CARDS, NUM }) => {
  const r = { cartoes: 0, foraDaLinha: [], luzErrada: [], antigos: [], tamanho: [] };
  for (const c of document.querySelectorAll(CARDS)) {
    const n = c.querySelector(':scope > ' + NUM.split(', ').join(', :scope > '));
    if (!n || !c.offsetWidth) continue;
    r.cartoes++;
    const q = c.getBoundingClientRect(), m = n.getBoundingClientRect(), s = getComputedStyle(c), sn = getComputedStyle(n);
    const fio = q.top + 0.5, centro = (m.top + m.bottom) / 2;
    if (Math.abs(centro - fio) > 1.5 || m.left < q.left || m.right > q.right) r.foraDaLinha.push(`${n.textContent.trim()} (centro ${centro.toFixed(1)}, fio ${fio.toFixed(1)})`);
    if (parseFloat(sn.fontSize) < 12.9) r.tamanho.push(`${n.textContent.trim()} ${sn.fontSize}`);
    if (!c.classList.contains('is-foco') && (!/linear-gradient/.test(s.backgroundImage) || !/^60px/.test(s.backgroundPosition))) r.luzErrada.push(`${n.textContent.trim()} (${s.backgroundPosition})`);
    const canto = c.querySelector('.painel__canto');
    if (canto && getComputedStyle(canto).display !== 'none') r.antigos.push('marca em L');
    if (n.matches('.servico__n') && getComputedStyle(n, '::after').content !== 'none') r.antigos.push('traço do número');
    if (getComputedStyle(c, '::before').display !== 'none' && getComputedStyle(c, '::before').content !== 'none') r.antigos.push('aresta de cima');
  }
  r.rolagemX = document.documentElement.scrollWidth - innerWidth;
  return r;
}, { CARDS, NUM });

/* quantas faixas da volta rodam agora, em quantos cartões, e se o aceso perdeu a luz pousada */
const lerVolta = (p) => p.evaluate(() => {
  const rodando = new Set(); let faixas = 0, pousadaNoAceso = 0, acesos = 0;
  for (const a of document.getAnimations()) {
    const el = a.effect && a.effect.target;
    if (!el || !el.closest || !el.closest('.linha-viva') || a.playState !== 'running') continue;
    faixas++; rodando.add(el.closest('.tem-linha'));
  }
  acesos = document.querySelectorAll('.tem-linha.is-foco').length;
  /* (dois acesos juntos na troca de grupo: só o que acendeu por último gira, .lv-ativa; nele a pousada sai) */
  for (const c of document.querySelectorAll('.tem-linha.lv-ativa')) if (getComputedStyle(c).backgroundImage !== 'none') pousadaNoAceso++;
  return { faixas, cartoes: rodando.size, acesos, pousadaNoAceso, montados: document.querySelectorAll('.tem-linha').length };
});

for (const pagina of ['/', '/sites', '/automacao']) {
  for (const largura of [390, 320]) {
    const ctx = await b.newContext({ viewport: { width: largura, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(BASE + pagina, { waitUntil: 'load', timeout: 240000 });
    await p.waitForTimeout(2500);
    const nome = `${pagina} ${largura}`;
    const r = await lerParado(p, CARDS, NUM);
    const antes = problemas;
    if (!r.cartoes) falha(`${nome}: nenhum cartão com número`);
    if (r.foraDaLinha.length) falha(`${nome}: número fora da linha em ${r.foraDaLinha.length}: ${r.foraDaLinha.slice(0, 3).join('; ')}`);
    if (r.tamanho.length) falha(`${nome}: número menor que 13 px: ${r.tamanho.slice(0, 3).join('; ')}`);
    if (r.luzErrada.length) falha(`${nome}: luz pousada fora do lugar em ${r.luzErrada.length}: ${r.luzErrada.slice(0, 3).join('; ')}`);
    if (r.antigos.length) falha(`${nome}: sinais antigos à mostra: ${[...new Set(r.antigos)].join(', ')}`);
    if (r.rolagemX > 0) falha(`${nome}: rolagem lateral de ${r.rolagemX} px`);
    if (largura === 390) {
      /* rolando a página inteira em passos: em cada parada, só o aceso gira, com as 4 faixas, sem a luz pousada */
      const amostras = await p.evaluate(() => Math.ceil(document.documentElement.scrollHeight / 300));
      let comVolta = 0, maisDeUm = 0, faixasErradas = 0, pousada = 0, giraSemAceso = 0, montados = 0;
      for (let k = 0; k < amostras; k++) {
        await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), k * 300);
        await p.waitForTimeout(350);
        const v = await lerVolta(p);
        montados = v.montados;
        if (v.cartoes > 1) maisDeUm++;
        if (v.cartoes === 1) { comVolta++; if (v.faixas !== 4) faixasErradas++; }
        if (v.cartoes > v.acesos) giraSemAceso++;
        pousada += v.pousadaNoAceso;
      }
      if (!montados) falha(`${nome}: a volta não foi montada`);
      if (!comVolta) falha(`${nome}: nenhum cartão aceso deu a volta em ${amostras} paradas`);
      if (maisDeUm) falha(`${nome}: ${maisDeUm} parada(s) com mais de um cartão girando`);
      if (faixasErradas) falha(`${nome}: ${faixasErradas} parada(s) com a volta sem as 4 faixas`);
      if (giraSemAceso) falha(`${nome}: ${giraSemAceso} parada(s) com volta em cartão que não está aceso`);
      if (pousada) falha(`${nome}: ${pousada} vez(es) a luz pousada continuou no cartão aceso`);
      if (problemas === antes) ok(`${nome}: ${r.cartoes} números na linha; a volta em ${comVolta} de ${amostras} paradas, sempre um cartão só`);
    } else if (problemas === antes) ok(`${nome}: ${r.cartoes} números na linha, sem rolagem lateral`);
    if (erros.length) falha(`${nome}: erros ${erros.join(' | ')}`);
    await ctx.close();
  }
}

/* movimento reduzido: nada montado nem girando; a luz pousada e o número na linha ficam */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(2000);
  const r = await lerParado(p, CARDS, NUM), v = await lerVolta(p);
  const antes = problemas;
  if (v.montados || v.faixas) falha(`/ 390 (reduzido): volta montada (${v.montados}) ou girando (${v.faixas})`);
  if (r.foraDaLinha.length || r.luzErrada.length) falha(`/ 390 (reduzido): número ou luz pousada fora do lugar`);
  if (problemas === antes) ok(`/ 390 (reduzido): nada girando, ${r.cartoes} números na linha com a luz pousada`);
  await ctx.close();
}

/* desktop com mouse: a volta não é montada (a carga é quem dá a volta) */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(2000);
  const r = await lerParado(p, CARDS, NUM), v = await lerVolta(p);
  const antes = problemas;
  if (v.montados) falha(`/ 1440: a volta foi montada no desktop com mouse (${v.montados})`);
  if (r.foraDaLinha.length) falha(`/ 1440: número fora da linha em ${r.foraDaLinha.length}: ${r.foraDaLinha.slice(0, 3).join('; ')}`);
  if (r.rolagemX > 0) falha(`/ 1440: rolagem lateral de ${r.rolagemX} px`);
  if (problemas === antes) ok(`/ 1440: sem volta montada, ${r.cartoes} números na linha`);
  await ctx.close();
}
await b.close();
console.log(problemas ? `\n${problemas} problema(s).` : '\nTudo certo.');
process.exit(problemas ? 1 : 0);
