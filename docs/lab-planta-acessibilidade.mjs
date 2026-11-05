/* Acessibilidade da PLANTA VIVA no laboratório (docs/lab-planta.html). O `npm run acessibilidade` (docs/acessibilidade.mjs) olha uma lista fixa
   de páginas do site; esta ferramenta aplica os mesmos três contratos à faixa da planta, nos 3 nichos:
     1. MOVIMENTO REDUZIDO (prefers-reduced-motion) e o interruptor do site (html.menos-movimento): o quadro final aparece de uma vez, sem
        nenhuma animação (document.getAnimations() vazio), nada escondido, tudo aceso, ouro só no LED, status com o número de etapas.
     2. TECLADO: Tab percorre só os botões (nichos, "Está certo", "Quero ajustar algo", "Rever a montagem"), na ordem, com o foco visível (outline)
        e alvo de toque de pelo menos 44 px; nada dentro do quadro recebe foco; Enter no botão de nicho refaz a faixa.
     3. ÁRVORE DE ACESSIBILIDADE: a lista "Etapas da planta" tem uma etapa por caixa, NA ORDEM DA LUZ (núcleo, chegada, 01...), o SVG e a legenda
        animada ficam de fora (aria-hidden), e há um role=status com "Planta pronta, com N etapas.".
   Uso: BASE=http://127.0.0.1:8917 CHROMIUM=... node docs/lab-planta-acessibilidade.mjs   (sai com 1 se algo falhar) */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8917';
const PAGINA = process.env.PAGINA || '/docs/lab-planta.html';
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function quadroFinal(ctx, nicho, larg) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${PAGINA}?nicho=${nicho}`, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await espera(400);
  return p;
}

for (const nicho of ['clinica', 'embalagens', 'loja']) {
  for (const [rotulo, opcoes, antes] of [
    ['movimento reduzido', { reducedMotion: 'reduce' }, null],
    ['interruptor "menos movimento"', {}, () => { const poe = () => document.documentElement && document.documentElement.classList.add('menos-movimento'); if (!poe()) new MutationObserver((m, o) => { if (poe()) o.disconnect(); }).observe(document, { childList: true }); }]
  ]) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, ...opcoes });
    if (antes) await ctx.addInitScript(antes);
    const p = await quadroFinal(ctx, nicho, 390);
    const r = await p.evaluate(() => {
      const nos = [...document.querySelectorAll('.plv-no')];
      return {
        animacoes: document.getAnimations().length, pre: !!document.querySelector('.plv--pre'), nos: nos.length, acesos: nos.filter((n) => n.classList.contains('is-aceso')).length,
        ouro: [...document.querySelectorAll('.is-ouro')].map((n) => n.getAttribute('data-id') || n.dataset.id), opacidades: [...document.querySelectorAll('.plv-quadro li, .plv-no')].filter((n) => getComputedStyle(n).opacity !== '1').length,
        status: document.querySelector('.plv-status').textContent, legenda: document.querySelector('.plv-leitura__tag').textContent, setasApagadas: [...document.querySelectorAll('.plv-seta')].filter((n) => getComputedStyle(n).opacity !== '1').length,
        pulsos: [...document.querySelectorAll('.plv-pulso')].length
      };
    });
    ok(r.animacoes === 0, `${nicho} ${rotulo}: nenhuma animação rodando (getAnimations: ${r.animacoes})`);
    ok(!r.pre && r.nos > 0 && r.acesos === r.nos, `${nicho} ${rotulo}: quadro final, ${r.acesos} de ${r.nos} caixas acesas, sem a camada de entrada`);
    ok(r.opacidades === 0 && r.setasApagadas === 0, `${nicho} ${rotulo}: nada escondido (opacidade 1 em todas as caixas, textos e setas)`);
    ok(r.ouro.length === 2 && r.ouro.every((i) => i === 'led'), `${nicho} ${rotulo}: ouro só no LED (${r.ouro.join(',')})`);
    ok(/^Planta pronta, com \d+ etapas\.$/.test(r.status) && r.legenda === 'Planta pronta', `${nicho} ${rotulo}: status "${r.status}" e legenda final`);
    await ctx.close();
  }

  /* teclado e árvore de acessibilidade (movimento normal, celular) */
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const p = await quadroFinal(ctx, nicho, 390);
  await espera(9000);   /* a entrada inteira, para o foco e a árvore serem os do repouso */
  const ordem = [];
  await p.evaluate(() => document.body.focus());
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('Tab');
    ordem.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); const r = a.getBoundingClientRect(); return { texto: (a.textContent || '').trim().slice(0, 30), dentro: !!a.closest('.plv-quadro'), outline: cs.outlineStyle + ' ' + cs.outlineWidth, h: Math.round(r.height) }; }));
  }
  const textos = ordem.map((o) => o.texto);
  ok(JSON.stringify(textos) === JSON.stringify(['Clínica', 'Embalagens', 'Loja', 'Está certo', 'Quero ajustar algo', 'Rever a montagem']), `${nicho} teclado: Tab percorre os botões na ordem (${textos.join(' > ')})`);
  ok(ordem.every((o) => !o.dentro), `${nicho} teclado: nada dentro do quadro recebe foco`);
  ok(ordem.every((o) => o.outline !== 'none 0px' && !/^none/.test(o.outline)), `${nicho} teclado: o foco aparece (outline ${ordem.map((o) => o.outline).join(' | ')})`);
  ok(ordem.every((o) => o.h >= 44), `${nicho} teclado: alvo de toque >= 44 px (${ordem.map((o) => o.h).join(', ')})`);

  const arvore = await p.evaluate(() => ({
    itens: [...document.querySelectorAll('.plv-lista > li')].map((li) => ({ id: li.dataset.id, ord: Number(li.dataset.ord), texto: li.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) })),
    nome: document.querySelector('.plv-lista').getAttribute('aria-label'), svgOculto: document.querySelector('.plv-svg').getAttribute('aria-hidden'), legendaOculta: document.querySelector('.plv-leitura').getAttribute('aria-hidden'),
    papel: document.querySelector('.plv-status').getAttribute('role'), caixas: document.querySelectorAll('.plv-no').length
  }));
  ok(arvore.itens.length === arvore.caixas && arvore.itens.every((it, i) => it.ord === i), `${nicho} árvore: ${arvore.itens.length} itens na ordem da luz (${arvore.itens.slice(0, 4).map((i) => i.id).join(', ')}...)`);
  ok(arvore.nome === 'Etapas da planta' && arvore.svgOculto === 'true' && arvore.legendaOculta === 'true' && arvore.papel === 'status', `${nicho} árvore: lista com nome, SVG e legenda animada fora da árvore, status com role`);
  /* a árvore de acessibilidade de verdade (Chromium): a lista aparece com os itens */
  const snap = await p.locator('.plv-lista').ariaSnapshot().catch(() => '');
  ok(snap.includes('list') && (snap.match(/listitem/g) || []).length === arvore.itens.length, `${nicho} árvore (ariaSnapshot): lista com ${(snap.match(/listitem/g) || []).length} itens`);

  /* Enter no botão de nicho refaz a faixa (teclado, não só mouse) */
  await p.focus('[data-nicho="loja"]');
  await p.keyboard.press('Enter');
  await espera(300);
  ok(await p.evaluate(() => !!document.querySelector('.plv-lista > li[data-id="vitrine"]')), `${nicho} teclado: Enter no botão de nicho refaz a faixa`);
  await ctx.close();
}
await nav.close();
console.log(falhou ? '\nAcessibilidade da planta: FALHOU' : '\nAcessibilidade da planta: tudo certo');
process.exit(falhou ? 1 : 0);
