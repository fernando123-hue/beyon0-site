/* Mede o CLS da PLANTA VIVA (laboratório) deslocamento por deslocamento, com as fontes de cada um (Passo 0 do plano da planta viva;
   resultado em docs/superpowers/plans/planta-passo0-cls-notas.md). Diferente de uma soma de "value": para cada carregamento registra
     - cada layout-shift com value, hadRecentInput e sources (nó, retângulo anterior e atual);
     - uma linha do tempo por quadro (requestAnimationFrame) no 1,5 s depois do DOMContentLoaded: painel oculto?, altura do quadro,
       largura e altura da nota, altura da lista "anotado" e da legenda, posição do quadro, fonte pronta?;
     - marcas do JS (DOMContentLoaded, load, fonte carregada, fonts.ready, mudança do style do quadro).
   O headless desenha por software: serve para COMPARAR variantes, não como número de aparelho real. O 1º carregamento de cada execução é
   lento (processo de GPU subindo); por isso há um aquecimento que não entra nas medidas.

   Uso:  node docs/lab-planta-medir.mjs <prefixo-da-saida> [tamanhos] [variantes] [esperaMs]
         node docs/lab-planta-medir.mjs --help
   Ex.:  BASE=http://127.0.0.1:8899 CHROMIUM="$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe" \
         node docs/lab-planta-medir.mjs medidas/cls 390x844,320x640,320x844,1280x800 base,altura+preload 4500
   Servidor: node docs/servidor.mjs . 8899 (a pasta que tem o laboratório). */

const AJUDA = `Mede o CLS da planta viva (laboratório), deslocamento por deslocamento.

Uso: node docs/lab-planta-medir.mjs <prefixo-da-saida> [tamanhos] [variantes] [esperaMs]

  prefixo-da-saida  pasta e começo do nome dos arquivos (um JSON por variante: <prefixo>-<variante>.json)
  tamanhos          largura[xaltura], separados por vírgula (padrão 390,320,1280; altura padrão 844 no celular, 640 abaixo de 380 px, 800 no computador)
  variantes         separadas por vírgula; combináveis com "+" (padrão base):
                      base      a página como está
                      altura    reserva por CSS a altura que o JS vai dar ao quadro (lida do alturas.json que a variante base grava)
                      preload   pré-carrega as duas fontes
                      leitura   legenda com min-height de 9em
                      anotado   a lista "anotado" nasce com a altura final (do alturas.json)
                      painel    o painel nunca sai de hidden (ocupa o lugar com visibility hidden)
                      semjs     esconde por CSS a lista que só aparece sem JS
  esperaMs          quanto esperar depois do load (padrão 4500; use 10500 na variante base para pegar o deslocamento tardio da legenda)

Ambiente: BASE (padrão http://127.0.0.1:8899), CHROMIUM (caminho do executável), PAGINA (padrão /docs/lab-planta.html), NICHOS (padrão clinica,embalagens,loja).
Os seletores da página medida ficam em SEL, no começo do arquivo: ajuste-os se o laboratório mudar de classes.`;

if (process.argv.includes('--help') || process.argv.includes('-h') || process.argv.length < 3) {
  console.log(AJUDA);
  process.exit(0);
}

const { chromium } = await import('playwright');
const { writeFileSync, readFileSync, mkdirSync } = await import('node:fs');
const { dirname } = await import('node:path');

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PAGINA = process.env.PAGINA || '/docs/lab-planta.html';
const NICHOS = (process.env.NICHOS || 'clinica,embalagens,loja').split(',');
const PREFIXO = process.argv[2];
const TAMANHOS = (process.argv[3] || '390,320,1280').split(',').map((t) => {
  const [l, a] = t.split('x').map(Number);
  return { larg: l, alt: a || (l >= 1000 ? 800 : l >= 380 ? 844 : 640) };
});
const VARIANTES = (process.argv[4] || 'base').split(',');
const ESPERA = Number(process.argv[5] || 4500);
const DIR = dirname(PREFIXO);
const ARQ_ALTURAS = DIR + '/alturas.json';

/* os elementos do laboratório que a medida olha */
const SEL = { quadro: '[data-quadro]', painel: '[data-painel]', nota: '.pl-nota', h1: '.pl-h1', leitura: '.pl-leitura', anotado: '[data-anotado]' };

mkdirSync(DIR, { recursive: true });
/* alturas que o JS do laboratório dá ao quadro e à lista "anotado" (medidas na variante base, para as variantes de reserva) */
const ALTURAS = {}, ANOTADO = {};
try {
  for (const r of JSON.parse(readFileSync(ARQ_ALTURAS, 'utf8'))) { ALTURAS[r.larg + r.nicho] = r.h; ANOTADO[r.larg + r.nicho] = r.anotado; }
} catch (e) { /* a variante base cria o arquivo */ }

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

{ /* aquecimento: o 1º carregamento do headless é lento e não entra nas medidas */
  const w = await (await nav.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await w.goto(BASE + PAGINA, { waitUntil: 'load', timeout: 90000 });
  await w.waitForTimeout(1500);
  await w.close();
}

for (const variante of VARIANTES) {
  const partes = variante.split('+');
  const tem = (x) => partes.includes(x);
  const saida = [];
  for (const { larg, alt } of TAMANHOS) {
    for (const nicho of NICHOS) {
      /* bypassCSP: a CSP do servidor local barra <style> inline, e as variantes injetam CSS pela rota */
      const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, deviceScaleFactor: 1, bypassCSP: true });
      const p = await ctx.newPage();
      await p.route('**' + PAGINA + '*', async (rota) => {
        const r = await rota.fetch();
        let h = await r.text(), extra = '';
        if (tem('preload')) extra += '<link rel="preload" href="/assets/fonts/sora-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>';
        if (tem('altura') && ALTURAS[larg + nicho]) extra += '<style>' + SEL.quadro + '{height:' + ALTURAS[larg + nicho] + 'px}</style>';
        if (tem('anotado') && ANOTADO[larg + nicho]) extra += '<style>' + SEL.anotado + '{min-height:' + ANOTADO[larg + nicho] + 'px}</style>';
        if (tem('leitura')) extra += '<style>' + SEL.leitura + '{min-height:9em}</style>';
        if (tem('painel')) extra += '<style>' + SEL.painel + '[hidden]{display:block !important;visibility:hidden}</style>';
        if (tem('semjs')) extra += '<style>.pl-semjs{display:none}</style>';
        h = h.replace('</head>', extra + '</head>');
        await rota.fulfill({ response: r, body: h });
      });
      await p.addInitScript((sel) => {
        const desc = (n) => {
          if (!n) return '(removido)';
          if (n.nodeType === 3) n = n.parentElement;
          if (!n || !n.tagName) return '(?)';
          const c = (typeof n.className === 'string' ? n.className : (n.className && n.className.baseVal) || '').trim().replace(/\s+/g, '.');
          return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (c ? '.' + c : '');
        };
        const r = (x) => x ? [Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)] : null;
        const h = (el) => el ? Math.round(el.getBoundingClientRect().height) : null;
        window.__ls = []; window.__marks = []; window.__frames = [];
        new PerformanceObserver((l) => l.getEntries().forEach((e) => {
          window.__ls.push({ t: Math.round(e.startTime), value: +e.value.toFixed(5), recent: e.hadRecentInput, sources: (e.sources || []).map((s) => ({ node: desc(s.node), prev: r(s.previousRect), cur: r(s.currentRect) })) });
        })).observe({ type: 'layout-shift', buffered: true });
        const marca = (n) => window.__marks.push({ t: Math.round(performance.now()), n });
        document.addEventListener('DOMContentLoaded', () => {
          marca('DOMContentLoaded');
          if (document.fonts) {
            document.fonts.ready.then(() => marca('fonts.ready'));
            document.fonts.addEventListener('loadingdone', (e) => marca('fonte carregada: ' + e.fontfaces.map((f) => f.family).join(',')));
          }
          const quadro = document.querySelector(sel.quadro), painel = document.querySelector(sel.painel);
          if (quadro) new MutationObserver(() => marca('quadro.style.height=' + quadro.style.height)).observe(quadro, { attributes: true, attributeFilter: ['style'] });
          const t0 = performance.now();
          const amostra = () => {
            const nota = document.querySelector(sel.nota), leit = document.querySelector(sel.leitura), anot = document.querySelector(sel.anotado);
            window.__frames.push({
              t: Math.round(performance.now()),
              painelOculto: painel ? painel.hidden : null,
              quadroH: h(quadro), quadroY: quadro ? Math.round(quadro.getBoundingClientRect().y) : null,
              notaW: nota ? Math.round(nota.getBoundingClientRect().width) : null, notaH: h(nota), h1H: h(document.querySelector(sel.h1)),
              leituraH: painel && !painel.hidden ? h(leit) : null, anotadoH: h(anot),
              fonteSora: document.fonts ? document.fonts.check('300 16px Sora') : null
            });
            if (performance.now() - t0 < 1500) requestAnimationFrame(amostra);
          };
          requestAnimationFrame(amostra);
        });
        window.addEventListener('load', () => marca('load'));
      }, SEL);
      await p.goto(BASE + PAGINA + '?nicho=' + encodeURIComponent(nicho), { waitUntil: 'load', timeout: 90000 });
      await p.waitForTimeout(ESPERA);
      const dados = await p.evaluate((sel) => {
        const h = (s) => { const el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().height) : null; };
        return { ls: window.__ls, marks: window.__marks, frames: window.__frames, quadroH: h(sel.quadro), anotadoH: h(sel.anotado) };
      }, SEL);
      const total = +dados.ls.filter((e) => !e.recent).reduce((s, e) => s + e.value, 0).toFixed(4);
      saida.push({ variante, larg, alt, nicho, total, ...dados });
      console.log(`${variante} ${larg}x${alt} ${nicho}: CLS ${total} (${dados.ls.length} deslocamentos) quadro ${dados.quadroH}`);
      await ctx.close();
    }
  }
  writeFileSync(`${PREFIXO}-${variante.replace(/\+/g, '_')}.json`, JSON.stringify(saida, null, 1));
  if (variante === 'base') {
    writeFileSync(ARQ_ALTURAS, JSON.stringify(saida.map((r) => ({ larg: r.larg, nicho: r.nicho, h: r.quadroH, anotado: r.anotadoH }))));
    for (const r of saida) { ALTURAS[r.larg + r.nicho] = r.quadroH; ANOTADO[r.larg + r.nicho] = r.anotadoH; }   /* as variantes seguintes da mesma execução já usam */
  }
}
await nav.close();
