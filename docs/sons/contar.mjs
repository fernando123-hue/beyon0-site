/* CONTAR OS SONS NO NAVEGADOR (2026-11-07): numa página real do site, quantas vozes cada evento dispara (pelo gancho
   B.somTeste, ligado com ?som=teste e válido na aba até o fim), se o pulso cai no compasso do fôlego (e junto da onda
   do trilho no desktop), que nada toca antes do gesto nem com o interruptor desligado, e a travessia até a página
   seguinte. Uma página e uma largura por vez (rodadas curtas; o navegador fecha no fim).
   COMO RODAR (servidor local ligado; --autoplay-policy só aqui, nos testes):
     node docs/servidor.mjs . 8983
     BASE=http://127.0.0.1:8983 CHROMIUM=".../chrome-headless-shell.exe" node docs/sons/contar.mjs sites 390
     ... node docs/sons/contar.mjs inicio 1440 reduzido      (movimento reduzido)
     ... node docs/sons/contar.mjs inicio 1440 desligado     (bz-som = 0 gravado antes de abrir) */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8983';
/* a página pelo nome (inicio, sites, automacao, orcamento): no Git Bash um "/" solto vira caminho do Windows */
const [nome = 'inicio', largura = '1440', modo = ''] = process.argv.slice(2);
const rota = nome === 'inicio' || nome === '/' ? '/' : '/' + nome.replace(/^.*\//, '');
const CEL = +largura < 721;
const CARDS = '.painel:not(:where(.console, .instrumento)), .celula, .laudo__row, .spec__item, .cenario';
const DESTINO = { '/': '/sites', '/sites': '/automacao', '/automacao': '/' };
const espera = ms => new Promise(r => setTimeout(r, ms));
const erros = [];
const conferir = (ok, msg) => { console.log((ok ? '  ok  ' : '  ✗   ') + msg); if (!ok) erros.push(msg); };

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  const opcoes = CEL ? { viewport: { width: +largura, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: +largura, height: 900 } };
  if (modo === 'reduzido') opcoes.reducedMotion = 'reduce';
  const contexto = await navegador.newContext(opcoes);
  /* conta todo AudioContext que a página criar (antes do gesto tem de ser zero) e, com 'desligado', grava bz-som = 0 */
  await contexto.addInitScript(desligado => {
    if (desligado) localStorage.setItem('bz-som', '0');
    const C = window.AudioContext; window.__contextos = 0;
    if (C) window.AudioContext = function () { window.__contextos++; return new C(); };
  }, modo === 'desligado');
  const p = await contexto.newPage();
  await p.goto(BASE + rota + '?som=teste', { waitUntil: 'load', timeout: 90000 });
  await espera(1500);
  const estado = () => p.evaluate(() => {
    const T = window.BEYON && window.BEYON.somTeste;
    return { gancho: !!T, contextos: window.__contextos, vozes: T ? Object.assign({}, T.vozes) : {}, log: T ? T.log.slice() : [], ondas: window.__ondas || [] };
  });
  const s0 = await estado();
  console.log(rota, largura, modo || '', s0.gancho ? '' : '(página sem js/som.js)');
  if (!s0.gancho) {
    conferir(s0.contextos === 0, 'sem som.js: nenhum AudioContext (' + s0.contextos + ')');
  } else {
    /* a onda do trilho (desktop): para comparar com o pulso */
    await p.evaluate(() => { window.__ondas = []; window.BEYON.on('trilho:onda', () => window.__ondas.push(window.BEYON.relogio())); });
    /* ANTES DO GESTO: passar o mouse e rolar não acordam nada */
    /* (no desktop, um card que carrega: o da planta no hero de /sites não tem carga, nem a mostra) */
    const card = p.locator(CEL ? CARDS : '.tem-carga').filter({ visible: true }).first();
    if (await card.count()) { await card.scrollIntoViewIfNeeded(); if (!CEL) { const b = await card.boundingBox(); await p.mouse.move(b.x + 8, b.y + 8, { steps: 4 }); } }
    await p.mouse.wheel(0, 200); await espera(800);
    const s1 = await estado();
    conferir(s1.contextos === 0 && !Object.keys(s1.vozes).length, 'antes do gesto: ' + s1.contextos + ' AudioContext, vozes ' + JSON.stringify(s1.vozes));

    /* O GESTO: uma tecla (não toca nada sozinha) */
    await p.keyboard.press('x');
    const t0 = Date.now();
    /* o CLIQUE: um link da própria página */
    const ancora = p.locator('a[href^="#"]:not(.skip-link), summary').filter({ visible: true }).first();
    if (await ancora.count()) { await ancora.click(); await espera(600); }
    /* o CARD: no desktop, o cursor em cima até carregar; no celular, o toque */
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded(); const b = await card.boundingBox();
      if (CEL) await card.tap({ position: { x: 6, y: 6 } });
      else { await p.mouse.move(b.x - 40, b.y + b.height / 2); await p.mouse.move(b.x + 8, b.y + b.height / 2, { steps: 3 }); await espera(2600); await p.mouse.move(2, 2, { steps: 3 }); }
      await espera(400);
    }
    /* dez cards de passagem, rápido (o limite de vozes) */
    const cards = await p.locator(CARDS).filter({ visible: true }).all();
    let passou = 0;
    if (!CEL && cards.length > 1) {
      const antes = (await estado()).vozes.card || 0;
      for (const c of cards.slice(0, 10)) { const b = await c.boundingBox(); if (!b || b.y < 0 || b.y > 880) continue; await p.mouse.move(b.x + 6, b.y + 6); passou++; }
      await p.mouse.move(2, 2); await espera(300);
      const depois = (await estado()).vozes.card || 0;
      console.log('       cards em sequência: ' + passou + ' entradas -> ' + (depois - antes) + ' vozes');
    }
    const s2 = await estado();
    /* (desligado: os mesmos estímulos, e a conferência é uma só, no fim: nada nasceu) */
    const espera0 = modo === 'desligado';
    if (!espera0) conferir((s2.vozes.clique || 0) >= 1 || !(await ancora.count()), 'clique: ' + (s2.vozes.clique || 0));
    if (!espera0) conferir((s2.vozes.card || 0) >= 1, 'card: ' + (s2.vozes.card || 0));
    if (!CEL && modo === '') conferir((s2.vozes.carga || 0) >= 1 && (s2.vozes.trava || 0) >= 1, 'carga ' + (s2.vozes.carga || 0) + ', trava ' + (s2.vozes.trava || 0));

    /* O PULSO: depois da subida do fundo (8 s na 1ª página), 2–3 fôlegos */
    await espera(Math.max(0, 8000 - (Date.now() - t0)) + 15500);
    const s3 = await estado();
    const pulsos = s3.log.filter(x => x.tipo === 'pulso');
    const fases = pulsos.map(x => +(((x.relogio / 7) % 1 + 1) % 1).toFixed(3));
    const passos = pulsos.slice(1).map((x, i) => +(x.relogio - pulsos[i].relogio).toFixed(2));
    if (modo === 'reduzido') conferir(pulsos.length === 0, 'movimento reduzido: nenhum pulso (' + pulsos.length + ')');
    else if (!espera0) {
      conferir(pulsos.length >= 2 && passos.every(d => Math.abs(d - 7) < 0.1) && fases.every(f => Math.abs(f - 0.42) < 0.01), 'pulsos ' + pulsos.length + ', a cada ' + JSON.stringify(passos) + ' s, na fase ' + JSON.stringify(fases));
      if (s3.ondas.length) {
        const dif = pulsos.map(x => Math.min.apply(null, s3.ondas.map(o => Math.abs(o - x.relogio))));
        conferir(dif.every(d => d < 0.05), 'pulso junto da onda do trilho: diferenças ' + JSON.stringify(dif.map(d => Math.round(d * 1000))) + ' ms');
      }
    }

    /* O OURO (encurtado aqui: reinado de 3 s, o mesmo caminho do js/ouro.js) */
    if (modo !== 'reduzido') {
      const acendeu = await p.evaluate(() => { const o = window.BEYON.ouro; if (!o || !o.acender) return false; o.T.reinado = 3; return o.acender(); });
      await espera(10500);
      const v = (await estado()).vozes;
      if (!espera0) conferir(acendeu && v.ouroCarga === 1 && v.ouroIgnicao === 1 && v.ouroReinado === 1 && v.ouroEsfria === 1, 'ouro: carga ' + v.ouroCarga + ', ignição ' + v.ouroIgnicao + ', reinado ' + v.ouroReinado + ', esfria ' + v.ouroEsfria);
    }

    /* O INTERRUPTOR: desligado, nada toca (nem o pulso) */
    const interruptor = p.locator('[data-som]').filter({ visible: true }).first();
    if (await interruptor.count() && modo !== 'desligado') {
      await interruptor.click(); await espera(500);
      const a = await estado();
      if (await ancora.count()) await ancora.click();
      if (await card.count()) { if (CEL) await card.tap({ position: { x: 6, y: 6 } }); else { const b = await card.boundingBox(); if (b) await p.mouse.move(b.x + 8, b.y + 8, { steps: 3 }); } }
      await espera(8000);
      const d = await estado();
      const novas = d.log.length - a.log.length;
      conferir(novas === 0, 'interruptor desligado: ' + novas + ' vozes em 8 s');
      await interruptor.click(); await espera(300);
    }

    /* A TRAVESSIA: a saída aqui, o pouso na página que chega */
    const alvo = DESTINO[rota];
    if (alvo && modo === '') {
      const link = p.locator('a[href="' + alvo + '"]:not(.nav__logo)').filter({ visible: true }).first();
      if (await link.count()) {
        await link.scrollIntoViewIfNeeded(); await espera(300);
        await link.click({ noWaitAfter: true }); await espera(250);
        const saiu = await estado().catch(() => null);
        conferir(saiu && saiu.vozes.passagem === 1, 'travessia (saída): ' + (saiu ? saiu.vozes.passagem : '?'));
        await p.waitForURL(u => new URL(u).pathname === alvo, { timeout: 60000, waitUntil: 'domcontentloaded' });
        await espera(2500);
        const chegou = await estado();
        console.log('       chegou em ' + alvo + ': ' + chegou.contextos + ' AudioContext sem gesto novo (o clique de lá), vozes ' + JSON.stringify(chegou.vozes));
        conferir(chegou.vozes.pouso === 1, 'travessia (pouso): ' + chegou.vozes.pouso);
      }
    }
    const fim = await estado();
    if (espera0) conferir(fim.contextos === 0 && !fim.log.length, 'gravado desligado (gesto, clique, card, fôlegos e ouro): ' + fim.contextos + ' AudioContext, ' + fim.log.length + ' vozes');
    console.log('       vozes na página: ' + JSON.stringify(fim.vozes));
  }
} finally {
  await navegador.close();
}
console.log(erros.length ? 'FALHA (' + erros.length + ')' : 'OK');
process.exit(erros.length ? 1 : 0);
