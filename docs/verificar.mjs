/* ==========================================================================
   VERIFICADOR — abre o site num navegador de verdade e confere.

   POR QUE EXISTE: até 2026-09-22 nenhuma sessão de agente tinha conseguido
   VER este site rodando. Num ambiente com Chromium + Playwright, nove bugs de
   render apareceram que a leitura do código não mostrava.

   Não é dependência do site: `docs/` está no .vercelignore. O Playwright é
   devDependency; o site publicado continua sem passo de instalação.

   COMO RODAR (Windows do dono: fora do sandbox do agente)
     node docs/servidor.mjs . 8899            # ou qualquer servidor estático
     BASE=http://127.0.0.1:8899 CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1228\chrome-headless-shell-win64\chrome-headless-shell.exe node docs/verificar.mjs

   O QUE CONFERE, por página (desktop e celular com toque):
   · boot do núcleo (window.BEYON) e barra do celular fixa;
   · nenhum conteúdo preso invisível pelo contrato html.js (opacity 0 ou
     visibility hidden depois de 3,5s — o GSAP tem que ter revelado);
   · rolagem lateral zero; caixas `.cena` fora do fluxo;
   · nenhum link de WhatsApp da Beyon (o site não tem: Decisões 28/10) e o local de recado montado; sem erro de console; fps > 45.
   E a PASSAGEM entre páginas (no fim): chega inteira e sem nada preso, volta
   pelo histórico inteira, desiste em 2 s, fecha o menu do celular na hora e
   chega a uma âncora só aparecendo.
   ========================================================================== */
import { chromium } from 'playwright';
import { autorizarContexto } from './acesso.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const EXEC = process.env.CHROMIUM || undefined;

const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const ESTREITO = { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const ALVOS = [
  ['/index.html',     'hub',       DESKTOP],
  ['/sites.html',     'sites',     DESKTOP],
  ['/automacao.html', 'automacao', DESKTOP],
  ['/resumo.html',    'resumo',    DESKTOP, { semNucleo: true }],
  ['/index.html',     'hub-cel',   CELULAR],
  ['/sites.html',     'sites-cel', CELULAR],
  ['/automacao.html', 'autom-cel', CELULAR],
  /* URLs limpas (cleanUrls na Vercel; o servidor local resolve .html) e 320px */
  ['/',               'hub-320',   ESTREITO],
  ['/sites',          'sites-320', ESTREITO],
  ['/automacao',      'autom-320', ESTREITO, { reduzirNoBoot: true }],
  /* O AI CORE (docs/restructure/PLANO-AI-CORE.md). Este verificador roda em
     SwiftShader, e WebGL desenhado pela CPU NÃO monta a esfera
     (failIfMajorPerformanceCaveat): nos alvos do Hub acima a exigência é
     ela NÃO montar (o desenho em CSS fica). Estes dois forçam
     (`?3d=forcar`) e exigem que ela monte, acenda e continue montada; o fps
     aqui é só informativo (WebGL por software não é o que um visitante com
     GPU vê). */
  ['/index.html?3d=forcar', 'hub-3d',     DESKTOP, { exige3d: true }],
  ['/index.html?3d=forcar', 'hub-3d-cel', CELULAR, { exige3d: true }]
];

const medirFps = (page, seg = 3) => page.evaluate(s => new Promise(ok => {
  let n = 0; const t0 = performance.now();
  (function volta() {
    n++;
    performance.now() - t0 < s * 1000 ? requestAnimationFrame(volta) : ok(+(n / ((performance.now() - t0) / 1000)).toFixed(1));
  })();
}), seg);

const navegador = await chromium.launch({ executablePath: EXEC, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let falhou = false, primeiro = true;

for (const [rota, nome, opcoes, { semNucleo = false, reduzirNoBoot = false, exige3d = false } = {}] of ALVOS) {
  const ctx = await navegador.newContext(opcoes);
  await autorizarContexto(ctx, BASE);   /* staging atras do Access: o token so vai nos pedidos do proprio staging (docs/acesso.mjs) */
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  /* um subsistema que caiu do laço (core.js avisa com "[beyon]") é falha:
     em 2026-10-03 a rede inteira caiu no celular sem nenhum erro visível */
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().indexOf('[beyon]') >= 0)) erros.push('console: ' + m.text()); });

  await page.addInitScript(() => { window.__lcp = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {} });
  await page.goto(BASE + rota, { waitUntil: 'load', timeout: 90000 });
  /* o interruptor "Reduzir movimento" acionado no MEIO do boot: nada pode
     ficar preso (SplitText no meio do caminho, opacidade zerada) */
  if (reduzirNoBoot) { await page.waitForTimeout(500); await page.evaluate(() => window.BEYON && window.BEYON.reduzir(true)); }
  await page.waitForTimeout(exige3d ? 9000 : 3500);

  const d = await page.evaluate(() => {
    const B = window.BEYON;
    const wa = [...document.querySelectorAll('[data-wa], a[href*="wa.me/55"]')];
    const escondido = e => { const cs = getComputedStyle(e); return cs.opacity === '0' || cs.visibility === 'hidden'; };
    return {
      boot: !!B,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      waBeyon: wa.length,
      recado: document.querySelectorAll('[data-recado-abrir], [data-recado]').length,
      /* o resumo é uma página isolada, só com o link para o orçamento: não tem recado */
      isolada: /^\/resumo/.test(location.pathname),
      presos: [...document.querySelectorAll('.hero__title, .display, .hero__sub, .hero__actions')].filter(escondido).length,
      barraOk: !document.getElementById('barra') || innerWidth > 820 || getComputedStyle(document.getElementById('barra')).position === 'fixed'
    };
  });
  /* o LCP é lido ANTES da rolagem: no navegador de verdade ele para no primeiro toque ou rolagem do visitante, mas a
     rolagem por script daqui não conta como interação, e um parágrafo do fim da página (pintado só ao rolar) virava o
     "maior" aos 4-5 s (2026-10-28: Conversa da automação e h2 de Sites, enquanto o LCP real era 0,9 s) */
  const lcp = Math.round(await page.evaluate(() => window.__lcp));
  /* rola até o fim e volta: nada pode ficar preso invisível no caminho */
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  d.presosNoFim = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity === '0').length);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  const fps = await medirFps(page);
  /* o CAMPO desenha (o fundo nunca pode virar tela preta em silêncio) */
  const campo = await page.evaluate(() => {
    const B = window.BEYON;
    if (!document.querySelector('[data-rede]') || !document.documentElement.classList.contains('js')) return -1;
    return B && B.rede && B.rede.desenhados ? B.rede.desenhados() : 0;
  });
  /* lido DEPOIS da medição: se a esfera desistir sozinha no meio, aparece */
  const nucleo = await page.evaluate(() => document.documentElement.classList.contains('tem-nucleo') && !!document.querySelector('.nucleo.is-aceso'));

  const reais = erros.filter(e => !/ERR_CERT|GPU stall|swiftshader/i.test(e));
  const ok = (semNucleo || d.boot) && d.barraOk && d.overflowX === 0 &&
    d.waBeyon === 0 && (d.recado > 0 || d.isolada) && reais.length === 0 && d.presos === 0 && d.presosNoFim === 0 && campo !== 0 &&
    (exige3d ? nucleo : (!nucleo && fps > 45)) &&
    /* LCP com orçamento (2,5s é o "bom" do Core Web Vitals); o primeiro alvo da rodada é artefato do headless */
    (primeiro || lcp < 2500);
  primeiro = false;
  if (!ok) falhou = true;

  console.log(
    (ok ? 'OK  ' : 'FALHA ') + nome.padEnd(11),
    'fps=' + String(fps).padStart(5) + (exige3d ? '(info)' : ''),
    'núcleo=' + (nucleo ? 'sim' : 'não'),
    'lcp=' + String(lcp).padStart(5) + 'ms',
    'rolagemX=' + d.overflowX,
    'wa=' + d.waBeyon + ' recado=' + d.recado,
    'presos=' + d.presos + '/' + d.presosNoFim,
    'campo=' + (campo < 0 ? '—' : campo > 0 ? 'ok' : 'VAZIO'),
    reais.length ? '\n     erros: ' + reais.join('\n     ') : ''
  );
  await ctx.close();
}

/* ==========================================================================
   A PASSAGEM entre páginas (js/passagem.js, css/passagem.css): a página voa
   e volta. O risco é ela ficar presa sumida, em escala ou medida errada.
   ========================================================================== */
const estadoPassagem = page => page.evaluate(() => {
  const main = getComputedStyle(document.querySelector('main'));
  const c = document.documentElement.classList;
  let chave = null;
  try { chave = sessionStorage.getItem('bz-passagem'); } catch {}
  return {
    url: location.pathname, opacidade: main.opacity, escala: main.transform,
    classes: [...c].filter(k => /^(passagem-|sai-|chega-)/.test(k) && k !== 'passagem-espera').join(',') || '—', chave
  };
});
const inteira = s => s.opacidade === '1' && s.escala === 'none' && s.classes === '—';
async function cenario(nome, opcoes, roteiro) {
  const ctx = await navegador.newContext(opcoes);
  await autorizarContexto(ctx, BASE);   /* staging atras do Access: o token so vai nos pedidos do proprio staging (docs/acesso.mjs) */
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|wa\.me/.test(m.text())) erros.push('console: ' + m.text()); });
  let r;
  try { r = await roteiro(page); } catch (e) { r = { ok: false, info: 'quebrou: ' + e.message }; }
  const ok = r.ok && erros.length === 0;
  if (!ok) falhou = true;
  console.log((ok ? 'OK  ' : 'FALHA ') + nome.padEnd(18), r.info, erros.length ? '\n     erros: ' + erros.join('\n     ') : '');
  await ctx.close();
}
/* segura a navegação da saída (o setTimeout de SAI_MS, 600 ms): a página fica como se o navegador tivesse desistido */
const segurarNavegacao = page => page.evaluate(() => {
  const st = window.setTimeout;
  window.setTimeout = (f, ms, ...r) => (ms === 600 ? 0 : st(f, ms, ...r));
});

await cenario('passagem-vai', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.locator('a[href="/sites"]:visible').first().click();
  await page.waitForURL('**/sites', { timeout: 8000 });
  const chegando = await estadoPassagem(page);
  await page.waitForTimeout(2500);
  const s = await estadoPassagem(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  const presos = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity === '0').length);
  return { ok: chegando.classes.includes('passagem-chega') && inteira(s) && presos === 0,
    info: `chegou=${chegando.classes} depois: opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes} presos=${presos}` };
});
await cenario('passagem-volta', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.locator('a[href="/sites"]:visible').first().click();
  await page.waitForURL('**/sites', { timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.goBack();
  await page.waitForTimeout(800);
  const s = await estadoPassagem(page);
  return { ok: s.url === '/' && inteira(s), info: `url=${s.url} opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes}` };
});
await cenario('passagem-desiste', DESKTOP, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await segurarNavegacao(page);
  const link = page.locator('.nav a[href="/sites"]').first();
  const caixa = await link.boundingBox();
  await link.click();
  await page.waitForTimeout(150);
  const saindo = await estadoPassagem(page);
  /* a janela do Sites parte do centro da tela, onde quer que o link esteja (o menu do topo, no canto) */
  const origem = await page.evaluate(() => { const r = document.querySelector('.passagem__riscos'); return { x: parseFloat(r.style.left), y: parseFloat(r.style.top) }; });
  const tela = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  const noCentro = Math.abs(origem.x - tela.x) < 2 && Math.abs(origem.y - tela.y) < 2 && !(origem.x >= caixa.x && origem.x <= caixa.x + caixa.width && origem.y >= caixa.y && origem.y <= caixa.y + caixa.height);
  await page.waitForTimeout(2800);   /* SAI_MS (0,6 s) + DESISTE_MS (2 s) e folga */
  const s = await estadoPassagem(page);
  return { ok: saindo.classes === 'passagem-sai,sai-sites' && noCentro && inteira(s) && s.chave === null,
    info: `saindo=${saindo.classes} origem no centro=${noCentro} 2,95 s depois: opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes} chave=${s.chave}` };
});
await cenario('passagem-menu', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await segurarNavegacao(page);
  await page.locator('.nav__toggle').click();
  await page.waitForTimeout(500);
  await page.locator('.nav__links a[href="/sites"]').click();
  await page.waitForTimeout(60);
  const altura = await page.evaluate(() => Math.round(document.querySelector('.nav__links').getBoundingClientRect().height));
  const s = await estadoPassagem(page);
  /* o menu fecha na hora: a transição de 320 ms cobriria o voo */
  return { ok: s.classes === 'passagem-sai,sai-sites' && altura === 0, info: `menu 60 ms depois: altura=${altura}px classes=${s.classes}` };
});
await cenario('passagem-ancora', DESKTOP, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => sessionStorage.setItem('bz-passagem', String(Date.now())));
  await page.goto(BASE + '/automacao#faq', { waitUntil: 'domcontentloaded' });
  const chegando = await estadoPassagem(page);
  await page.waitForTimeout(2500);
  const s = await estadoPassagem(page);
  const rolou = await page.evaluate(() => Math.round(scrollY));
  return { ok: chegando.classes === 'passagem-chega,chega-automacao,passagem-ancora' && inteira(s) && rolou > 0,
    info: `chegou=${chegando.classes} depois: opacidade=${s.opacidade} escala=${s.escala} classes=${s.classes} rolagem=${rolou}` };
});

/* o palco fixado do desktop (pin do GSAP, position: fixed dentro de <main>) não sai do lugar quando a página se prepara
   para voar no começo do clique (will-change em <main> faria dele o bloco de contenção do fixed) */
await cenario('passagem-palco', DESKTOP, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const achou = await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 200) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80));
      if ([...document.querySelectorAll('.pin-spacer > *')].some(n => getComputedStyle(n).position === 'fixed')) return y;
    }
    return -1;
  });
  await page.waitForTimeout(400);
  const caixa = () => page.evaluate(() => { const n = [...document.querySelectorAll('.pin-spacer > *')].find(e => getComputedStyle(e).position === 'fixed'); return n ? Math.round(n.getBoundingClientRect().top) : null; });
  const antes = await caixa();
  const link = await page.locator('.nav a[href="/sites"]').first().boundingBox();
  await page.mouse.move(link.x + 5, link.y + 5);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const depois = await caixa();
  await page.mouse.up({ button: 'left' }).catch(() => {});
  return { ok: achou >= 0 && antes !== null && antes === depois, info: `palco fixado em y=${achou}: topo antes=${antes} depois do toque=${depois}` };
});

/* saindo do orçamento (que não tem a rede do fundo) para o Início: a rede só se mede com a página assentada. Medida
   no meio da chegada, ela gravaria zonas e cartões em escala (revisão final do PR #23) */
await cenario('passagem-orc-inicio', DESKTOP, async page => {
  await page.addInitScript(() => {
    window.__t = {};
    const marcar = () => {
      const h = document.documentElement;
      if (h.classList.contains('passagem-chega')) window.__t.chegando = true;
      else if (window.__t.chegando && !window.__t.chegou) window.__t.chegou = performance.now();
      const r = document.querySelector('.rede');
      if (r && r.classList.contains('is-viva') && !window.__t.viva) window.__t.viva = performance.now();
    };
    new MutationObserver(marcar).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.locator('.nav a[href="/"]').first().click();
  await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 8000 });
  await page.waitForTimeout(4500);
  const t = await page.evaluate(() => window.__t);
  const ok = !!t.chegando && !!t.chegou && !!t.viva && t.viva >= t.chegou;
  return { ok, info: `chegou aos ${Math.round(t.chegou || 0)} ms, rede acesa aos ${Math.round(t.viva || 0)} ms` };
});

/* cada destino com a sua viagem (css/passagem-destinos.css): a saída certa para cada link e a chegada certa em cada página */
const VIAGENS = [
  { de: '/sites', link: '.nav__logo', nome: 'inicio', sai: 'pass-inicio-sai', chega: 'pass-assenta' },
  { de: '/', link: '.nav a[href="/sites"]', nome: 'sites', sai: 'pass-sites-sai', chega: 'pass-sites-chega' },
  { de: '/', link: '.nav a[href="/automacao"]', nome: 'automacao', sai: 'pass-auto-sai', chega: 'pass-auto-chega' },
  { de: '/', link: '.nav a[href="/orcamento"]', nome: 'orcamento', sai: 'pass-orc-sai', chega: 'pass-orc-chega' }
];
await cenario('passagem-destinos', DESKTOP, async page => {
  const linhas = [];
  let ok = true;
  for (const v of VIAGENS) {
    await page.goto(BASE + v.de, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await segurarNavegacao(page);
    await page.locator(v.link).first().click();
    await page.waitForTimeout(100);
    const saida = await page.evaluate(() => ({ classes: document.documentElement.className, anim: getComputedStyle(document.querySelector('main')).animationName }));
    /* no fim da saída, <main> anda no máximo 30% da TELA (um % do próprio elemento, numa página longa, vira milhares de px) */
    const desloc = await page.evaluate(() => {
      document.getAnimations().forEach(a => { if (/^pass-/.test(a.animationName || '')) { a.pause(); a.currentTime = 580; } });
      const m = new DOMMatrix(getComputedStyle(document.querySelector('main')).transform);
      return Math.round(Math.max(Math.abs(m.e) / innerWidth, Math.abs(m.f) / innerHeight) * 100);
    });
    await page.evaluate(() => sessionStorage.setItem('bz-passagem', String(Date.now())));
    await page.goto(BASE + (v.nome === 'inicio' ? '/' : '/' + v.nome), { waitUntil: 'domcontentloaded' });
    const chegada = await page.evaluate(() => ({ classes: document.documentElement.className, anim: getComputedStyle(document.querySelector('main')).animationName }));
    const certo = saida.classes.includes('sai-' + v.nome) && saida.anim === v.sai && desloc <= 30 && chegada.classes.includes('chega-' + v.nome) && chegada.anim === v.chega;
    if (!certo) ok = false;
    linhas.push(`${v.nome}: sai=${saida.anim} desloc=${desloc}% chega=${chegada.anim}${certo ? '' : ' (ERRADO)'}`);
  }
  return { ok, info: linhas.join(' · ') };
});

/* ==========================================================================
   A MEDIÇÃO do caminho principal (js/medicao.js): o clique em "Monte seu
   orçamento" vira 'orcamento_iniciar' (não contato), e o recado de dentro
   do orçamento conta como contato nas métricas próprias, sem Google.
   ========================================================================== */
await cenario('medicao-orcamento', CELULAR, async page => {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__orc = []; window.__contato = [];
    window.BEYON.on('medicao:orcamento', d => window.__orc.push(d));
    window.BEYON.on('medicao:contato', d => window.__contato.push(d));
    /* segura a navegação: cancela o clique antes de todos (a medição ouve mesmo assim; a passagem respeita o cancelado) */
    window.addEventListener('click', e => e.preventDefault(), true);
  });
  await page.locator('.hero a[href="/orcamento"]:visible').first().click();
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => ({ orc: window.__orc, contato: window.__contato.length }));
  const d = r.orc[0] || {};
  return { ok: r.orc.length === 1 && d.origem_botao && d.origem_botao !== 'pagina' && d.pagina === '/' && r.contato === 0,
    info: `eventos=${r.orc.length} origem=${d.origem_botao} pagina=${d.pagina} contatos=${r.contato}` };
});
await cenario('medicao-recado-orc', DESKTOP, async page => {
  await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__contato = []; document.addEventListener('bz:contato', e => window.__contato.push(e.detail)); });
  /* (orçamento sem IA: a conversa só aparece com consultor; o recado de dentro do orçamento à vista é o das perguntas) */
  await page.locator('#o-perguntas a[data-recado-abrir]').first().click();
  await page.waitForTimeout(300);
  /* o link do menu para o próprio orçamento não é "começar o orçamento" */
  await page.evaluate(() => { window.__orc = 0; window.BEYON.on('medicao:orcamento', () => window.__orc++); window.addEventListener('click', e => e.preventDefault(), true); });
  await page.locator('.nav a[href="/orcamento"]').first().click({ force: true });
  const r = await page.evaluate(() => ({
    contato: window.__contato, orc: window.__orc, google: !!document.querySelector('script[src*="googletagmanager"]'), aviso: !!document.querySelector('.consentimento')
  }));
  const d = r.contato[0] || {};
  return { ok: r.contato.length === 1 && d.origem_botao === 'orcamento-perguntas' && d.pagina === '/orcamento' && r.orc === 0 && !r.google && !r.aviso,
    info: `contatos=${r.contato.length} origem=${d.origem_botao} pagina=${d.pagina} inicios=${r.orc} google=${r.google} aviso=${r.aviso}` };
});

await navegador.close();
console.log(falhou ? '\nAlguma coisa falhou — leia acima.' : '\nTudo certo.');
process.exit(falhou ? 1 : 0);
