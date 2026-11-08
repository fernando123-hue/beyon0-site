/* Mede a TRAVA da travessia (js/passagem.js) em cada viagem origem -> destino, A/B na mesma sessão.
   Uso: BASES="A=http://127.0.0.1:8971,B=http://127.0.0.1:8972" CHROMIUM=... LARGURAS=390,1440 RODADAS=5 \n        ROTAS="/>/sites,/sites>/" SAIDA=arquivo.json node docs/passagem-trava.mjs     (no Git Bash: MSYS_NO_PATHCONV=1)
   Cada rodada abre um contexto novo e faz um toque/clique de verdade no menu. O rastreio do Chrome (PipelineReporter)
   diz o que o compositor apresentou: quadros que mexem, perdidos, o pior intervalo entre dois quadros apresentados (e
   quantos passam de 25 ms) e o VÃO (a tela sem movimento entre o último quadro da página velha e o 1º da nova). Dentro da
   página nova, long-animation-frame/longtask dizem o que ocupou o fio principal. Marcas (performance.mark) postas por
   um observador de classe da <html>: bz:clique, bz:solta, bz:chegou. Rodadas alternam a ordem das variantes.
   Variáveis:
     WARM=1       visita destino e origem duas vezes antes (cache HTTP e cache de código do V8 quentes: quem já conhece o site)
     ESPERA=<ms>  quanto a pessoa fica na origem antes do toque (padrão 4000; > max-age do JS/CSS = quem leu a página)
     NET=<ms>     rede de celular simulada (latência de ida e volta, 1,6 Mb/s) do clique em diante
     GPU=0        sem a GPU da máquina (SwiftShader); o padrão usa a GPU de verdade (ANGLE/D3D11)
     TAREFAS=1    + tarefas longas do fio principal com o tempo próprio por tipo de evento (rastreio pesado: só diagnóstico)
     TRACE=arq    guarda o rastreio da última rodada
     BUSY=<ms>    trava o fio principal por esse tempo 300 ms depois de a chegada soltar (prova que o voo não depende dele)
     EXTRACSS=... CSS extra por folha construída (A/B de uma regra sem editar o arquivo; a CSP não bloqueia)
   Servidor: docs/servidor.mjs com CACHE=1 serve como o Worker da Cloudflare (ETag + o Cache-Control do _headers ou max-age=0,
   must-revalidate; sirva a pasta montada, com o ?v);
   CACHE_CC e CACHE_HTML_CC trocam o Cache-Control; TLS_CERT/TLS_CHAVE dão HTTP/2.
   Fidelidade: GPU de verdade, CPU 4x só no celular (afeta o fio principal do renderizador, não a GPU nem o raster). Não é
   um celular de verdade: vale para comparar antes/depois, não pelo valor absoluto. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASES = Object.fromEntries((process.env.BASES || 'A=http://127.0.0.1:8971').split(',').map(s => s.split(/=(.*)/s).slice(0, 2)));
const RODADAS = Number(process.env.RODADAS) || 3;
const LARGURAS = (process.env.LARGURAS || '390,1440').split(',').map(Number);
const TODAS = ['/>/sites', '/>/automacao', '/>/orcamento', '/sites>/', '/sites>/automacao', '/sites>/orcamento',
  '/automacao>/', '/automacao>/sites', '/automacao>/orcamento', '/orcamento>/', '/orcamento>/sites', '/orcamento>/automacao'];
const ROTAS = (process.env.ROTAS || TODAS.join(',')).split(',').map(r => r.split('>'));
const GPU = process.env.GPU !== '0';
const PERDIDO_MS = 25;

const SONDA = `(() => {
  const BUSY = ${Number(process.env.BUSY) || 0};
  const marcas = {};
  const marcar = (n) => { if (!marcas[n]) { marcas[n] = 1; performance.mark(n); } };
  const olhar = (h) => {
    const ver = () => {
      const c = h.classList;
      if (c.contains('passagem-sai')) marcar('bz:clique');
      if (c.contains('passagem-chega')) { marcas.chega = 1; if (!c.contains('passagem-espera')) { if (!marcas['bz:solta'] && BUSY) setTimeout(() => { const t = performance.now(); while (performance.now() - t < BUSY); }, 300); marcar('bz:solta'); } }
      else if (marcas.chega) marcar('bz:chegou');
    };
    new MutationObserver(ver).observe(h, { attributes: true, attributeFilter: ['class'] });
    ver();
  };
  const w = window.__bz = { loaf: [], lt: [] };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => w.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(e.blockingDuration || 0), rs: Math.round(e.renderStart - e.startTime), sl: e.styleAndLayoutStart ? Math.round(e.startTime + e.duration - e.styleAndLayoutStart) : 0, s: (e.scripts || []).map(x => ({ u: (x.sourceURL || x.invoker || '').split('/').slice(-2).join('/'), i: x.invokerType, d: Math.round(x.duration), f: Math.round(x.forcedStyleAndLayoutDuration || 0) })) }))).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => l.getEntries().forEach(e => w.lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  const EXTRA = ${JSON.stringify(process.env.EXTRACSS || '')};
  if (EXTRA) { const ss = new CSSStyleSheet(); ss.replaceSync(EXTRA); document.adoptedStyleSheets = [ss]; }
  if (document.documentElement) olhar(document.documentElement);
  else { const m = new MutationObserver(() => { if (document.documentElement) { m.disconnect(); olhar(document.documentElement); } }); m.observe(document, { childList: true }); }
})();`;

const mediana = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

/* TAREFAS=1: as tarefas do fio principal da página nova com >= 40 ms e o que gastou o tempo (tempo próprio por tipo de evento) */
function tarefasLongas(ev, ini, fim) {
  if (ini == null) return [];
  const nomes = new Map();
  ev.filter(e => e.ph === 'M' && e.name === 'thread_name').forEach(e => nomes.set(e.pid + ':' + e.tid, e.args.name));
  const dePrincipal = (e) => nomes.get(e.pid + ':' + e.tid) === 'CrRendererMain';
  const xs = ev.filter(e => e.ph === 'X' && dePrincipal(e) && e.ts / 1000 >= ini && e.ts / 1000 <= (fim || ini + 4000)).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const tarefas = xs.filter(e => e.name === 'RunTask' && e.dur >= 40000);
  return tarefas.map(t => {
    const dentro = xs.filter(e => e !== t && e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur);
    const proprio = new Map();
    const pilha = [];
    for (const e of dentro) {
      while (pilha.length && pilha[pilha.length - 1].fim <= e.ts) pilha.pop();
      const pai = pilha[pilha.length - 1];
      const rot = e.name + (e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'v8.compile' || e.name === 'v8.compileModule' ? ':' + String((e.args && e.args.data && (e.args.data.url || e.args.data.functionName)) || (e.args && e.args.fileName) || '').split('/').slice(-2).join('/') : '');
      proprio.set(rot, (proprio.get(rot) || 0) + e.dur);
      if (pai) proprio.set(pai.rot, (proprio.get(pai.rot) || 0) - e.dur);
      pilha.push({ fim: e.ts + e.dur, rot });
    }
    const top = [...proprio.entries()].filter(([, v]) => v > 3000).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + Math.round(v / 1000));
    return { t: Math.round(t.ts / 1000 - ini), ms: Math.round(t.dur / 1000), top };
  });
}

function analisar(buf) {
  const ev = JSON.parse(buf.toString()).traceEvents;
  const marca = (n) => { const e = ev.find(x => x.name === n && x.ph !== 'e'); return e ? e.ts / 1000 : null; };
  /* os ids se repetem: fecha cada par b/e na ordem do tempo, senão um quadro apaga o anterior */
  const abertos = new Map(), prontos = [];
  for (const e of ev.filter(x => x.name === 'PipelineReporter').sort((x, y) => x.ts - y.ts)) {
    const k = e.pid + ':' + JSON.stringify(e.id2 || e.id);
    if (e.ph === 'b') abertos.set(k, { ini: e.ts / 1000, fr: e.args && e.args.frame_reporter });
    else if (e.ph === 'e' && abertos.has(k)) { const q = abertos.get(k); q.fim = e.ts / 1000; prontos.push(q); abertos.delete(k); }
  }
  const quadros = prontos.filter(q => q.fr).map(q => ({
    ini: q.ini, fim: q.fim, host: q.fr.layer_tree_host_id, estado: q.fr.state,
    mexe: !!(q.fr.has_compositor_animation || q.fr.has_main_animation)
  })).sort((x, y) => x.fim - y.fim);
  const clique = marca('bz:clique'), solta = marca('bz:solta'), chegou = marca('bz:chegou');
  const nav = marca('navigationStart') ;
  const navs = ev.filter(x => x.name === 'navigationStart').map(x => x.ts / 1000).sort((a, b) => a - b);
  const navNova = navs.find(t => clique != null && t > clique) ?? null;
  const fcpEv = ev.filter(x => x.name === 'firstContentfulPaint').map(x => x.ts / 1000).sort((a, b) => a - b);
  const fcp = fcpEv.find(t => navNova != null && t > navNova) ?? null;

  const apresentado = (q) => q.estado === 'STATE_PRESENTED_ALL' || q.estado === 'STATE_PRESENTED_PARTIAL';
  const janela = (ini, fim) => {
    const qs = quadros.filter(q => q.fim >= ini && q.fim <= fim);
    const pres = qs.filter(apresentado);
    const gaps = [], longos = [];
    for (let i = 1; i < pres.length; i++) { const g = pres[i].fim - pres[i - 1].fim; gaps.push(g); if (g > PERDIDO_MS) longos.push([Math.round(pres[i - 1].fim - ini), Math.round(g)]); }
    return {
      n: qs.length, mexe: qs.filter(q => q.mexe).length, perdidos: qs.filter(q => q.estado === 'STATE_DROPPED').length,
      lentos: gaps.filter(g => g > PERDIDO_MS).length, pior: gaps.length ? Math.round(Math.max(...gaps)) : null,
      longos, primeiro: pres.length ? pres[0].fim : null, ultimo: pres.length ? pres[pres.length - 1].fim : null
    };
  };
  const saida = clique != null ? janela(clique, clique + 640) : null;
  const chegada = solta != null && chegou != null ? janela(solta - 30, chegou) : null;
  /* o vão: do último quadro apresentado que mexia na página velha ao primeiro da nova */
  const hostVelho = (() => { const q = quadros.find(x => clique != null && x.fim >= clique && x.mexe); return q ? q.host : null; })();
  const velhos = quadros.filter(q => q.host === hostVelho && q.mexe && apresentado(q));
  const ultimoVelho = velhos.length ? velhos[velhos.length - 1].fim : null;
  const novo = navNova != null ? quadros.find(q => q.host !== hostVelho && q.fim > navNova && apresentado(q) && q.mexe) : null;
  return {
    tarefas: process.env.TAREFAS ? tarefasLongas(ev, navNova, chegou) : undefined,
    saida, chegada,
    href_nav: clique != null && navNova != null ? Math.round(navNova - clique) : null,                 /* clique -> início da navegação nova */
    nav_fcp: navNova != null && fcp != null ? Math.round(fcp - navNova) : null,                         /* navegação -> 1ª pintura com conteúdo */
    nav_solta: navNova != null && solta != null ? Math.round(solta - navNova) : null,                   /* navegação -> a chegada solta */
    vao: ultimoVelho != null && novo ? Math.round(novo.fim - ultimoVelho) : null, fim_velho: ultimoVelho != null && clique != null ? Math.round(ultimoVelho - clique) : null, nav_novo: navNova != null && novo ? Math.round(novo.fim - navNova) : null,                       /* tela sem movimento entre as páginas */
    chegada_ms: solta != null && chegou != null ? Math.round(chegou - solta) : null
  };
}

const nav = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : []
});

async function uma(base, de, alvo, largura) {
  const cel = largura < 600;
  const ctx = await nav.newContext({ ignoreHTTPSErrors: true, viewport: { width: largura, height: cel ? 844 : 900 }, deviceScaleFactor: cel ? 3 : 1, isMobile: cel, hasTouch: cel });
  await ctx.addInitScript(SONDA);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  /* WARM=1: quem já visitou o site (cache HTTP e cache de código do V8 quentes): abre destino e origem duas vezes antes */
  if (process.env.WARM === '1') for (let k = 0; k < 2; k++) for (const rota of [alvo, de]) { await p.goto(base + rota, { waitUntil: 'load', timeout: 90000 }); await p.waitForTimeout(700); }
  if (cel) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  /* NET=<ms>: rede de celular simulada (latência de ida e volta em ms, 1,6 Mb/s); vale do clique em diante */
  if (process.env.NET) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: Number(process.env.NET), downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 });
  await p.goto(base + de, { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout((process.env.ESPERA ? Number(process.env.ESPERA) : 4000));
  if (cel) { const t = p.locator('.nav__toggle'); if (await t.isVisible()) { await t.tap(); await p.waitForTimeout(600); } }
  const seletor = alvo === '/' ? '.nav__logo' : `.nav a[href="${alvo}"]`;
  const caixa = await p.locator(seletor).first().boundingBox();
  const ponto = { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
  await nav.startTracing(p, { categories: ['benchmark', 'cc', 'viz', 'blink.user_timing', 'loading', 'navigation'].concat(process.env.TAREFAS ? (process.env.TAREFAS === '2' ? ['devtools.timeline', 'gpu', 'disabled-by-default-cc.debug.display_trace'] : ['devtools.timeline', 'disabled-by-default-devtools.timeline']) : []) });
  if (cel) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ponto] });
    await p.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await p.mouse.move(ponto.x, ponto.y);
    await p.waitForTimeout(100);
    await p.mouse.down(); await p.mouse.up();
  }
  /* espera a página nova chegar (a classe passagem-chega entra e sai) */
  await p.waitForTimeout(900);
  await p.waitForFunction(() => !document.documentElement.classList.contains('passagem-chega') && /^\/(sites|automacao|orcamento)?$/.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(700);
  const buf = await nav.stopTracing();
  if (process.env.TRACE) writeFileSync(process.env.TRACE, buf);
  const r = analisar(buf);
  const sonda = await p.evaluate(() => window.__bz).catch(() => null);
  if (sonda) {
    sonda.tempo = await p.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] || {};
      const r = performance.getEntriesByType('resource');
      const css = r.filter(x => /.css/.test(x.name)), js = r.filter(x => /.js/.test(x.name));
      const ult = (a) => a.length ? Math.round(Math.max(...a.map(x => x.responseEnd))) : null;
      const marcas = {}; performance.getEntriesByType('mark').forEach(m => { marcas[m.name] = Math.round(m.startTime); });
      const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
      return { resp: Math.round(n.responseStart), dom: Math.round(n.domInteractive), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), cssFim: ult(css), jsFim: ult(js), nCss: css.length, nJs: js.length, bytesJs: Math.round(js.reduce((a, x) => a + (x.transferSize || 0), 0) / 1024), fcp: fcp ? Math.round(fcp) : null, marcas };
    }).catch(() => null);
    r.tempo = sonda.tempo;
    const lt = sonda.loaf.filter(x => x.d >= 50);
    r.loaf = { n: lt.length, bloqueio: lt.reduce((s, x) => s + x.b, 0), pior: lt.length ? Math.max(...lt.map(x => x.d)) : 0, lista: lt.slice(0, 14), tarefas: sonda.lt.length, piorTarefa: sonda.lt.length ? Math.max(...sonda.lt.map(x => x.d)) : 0 };
  }
  await ctx.close();
  return r;
}

const resultados = [];
for (const largura of LARGURAS) {
  for (const [de, alvo] of ROTAS) {
    for (let i = 0; i < RODADAS; i++) {
      const nomes = Object.keys(BASES);
      if (i % 2) nomes.reverse();   /* rodadas alternadas */
      for (const nome of nomes) {
        try {
          const r = await uma(BASES[nome], de, alvo, largura);
          resultados.push({ variante: nome, largura, de, alvo, rodada: i, ...r });
        } catch (e) { console.error('falhou', nome, largura, de, alvo, i, String(e).slice(0, 200)); }
      }
    }
    const grupo = (nome) => resultados.filter(x => x.variante === nome && x.largura === largura && x.de === de && x.alvo === alvo);
    for (const nome of Object.keys(BASES)) {
      const g = grupo(nome);
      const m = (f) => mediana(g.map(f));
      console.log(`${largura} ${de}>${alvo} ${nome}`.padEnd(30),
        `saída lentos ${m(x => x.saida?.lentos)} pior ${m(x => x.saida?.pior)}ms perd ${m(x => x.saida?.perdidos)}/${m(x => x.saida?.mexe)} |`,
        `vão ${m(x => x.vao)} nav->fcp ${m(x => x.nav_fcp)} nav->solta ${m(x => x.nav_solta)} |`,
        `chegada lentos ${m(x => x.chegada?.lentos)} pior ${m(x => x.chegada?.pior)}ms perd ${m(x => x.chegada?.perdidos)}/${m(x => x.chegada?.mexe)} dur ${m(x => x.chegada_ms)} |`,
        `LoAF ${m(x => x.loaf?.n)} pior ${m(x => x.loaf?.pior)}ms bloq ${m(x => x.loaf?.bloqueio)}`);
    }
    if (process.env.SAIDA) writeFileSync(process.env.SAIDA, JSON.stringify(resultados));
  }
}
await nav.close();
