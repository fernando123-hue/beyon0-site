/* E2E DO RADAR DO ESCOPO (js/orcamento-escopo*.js; docs/design/radar-escopo-2026-11-07.md) num Chromium de verdade, contra o servidor local com a IA simulada.
     node docs/servidor.mjs . 8941
     CHROMIUM=... node docs/e2e-escopo.mjs [8941] [--larguras 390,320,768,1280,1440] [--rodadas 3]
   O ROTEIRO (390 x 844, o celular primeiro): página nova (aguardando) -> perguntas -> o preço em voo (o ponteiro varre) -> estimativa preliminar -> "Ver como o valor é
   formado" -> um extra em "Quer ajustar?" (o valor conta até o novo, "Proposta atualizada") -> a urgência (o prazo diz) -> "Mudar as respostas" (tudo volta a pendente)
   -> o preço de novo -> a conversa (o ponteiro varre com o Zero pensando; "o que você nos contou" com as palavras da pessoa) -> a barra do celular (aparece com o radar
   fora da tela, some ao escrever, "Ver radar" volta ao cartão) -> "Quero os três modelos" (proposta configurada, tudo branco) -> o ouro (estado sintético, só para olhar).
   Em cada passo: o estado, as dimensões, o valor e o selo no DOM; nenhum erro no console; sem rolagem lateral.
   ACEITE (1.280 x 800 e 1.440 x 900, conversa aberta): o valor do radar e "Quero os três modelos" à vista no painel SEM rolar o painel; o <aside> que rola por dentro tem
   tabindex (e a janela alta, não). 768 (tablet), 320 e a fonte a 200% em 390: nada passa da largura. MOVIMENTO REDUZIDO: sem ponteiro, nenhuma animação, o valor final na hora.
   CLS: o mesmo roteiro com e sem o módulo do radar (a variante "sem" aborta js/orcamento-escopo.js; o cartão fica com a altura reservada pelo CSS), mediana das rodadas;
   o delta tem de ficar <= 0,01. Capturas em docs/olhar-escopo/ (no .gitignore): ABRA e OLHE. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PASSO, fazerPedido, telefoneNovo } from './e2e-pedido.mjs';

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i < 0 ? padrao : (process.argv[i + 1] || ''); };
const porta = process.argv.slice(2).filter((a) => /^\d+$/.test(a))[0] || '8941';
const BASE = 'http://127.0.0.1:' + porta;
const LARGURAS = arg('larguras', '390,320,768,1280,1440').split(',').map(Number);
const RODADAS = Number(arg('rodadas', '3'));
const SO_CLS = process.argv.includes('--so-cls');
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const PASTA = new URL('./olhar-escopo/', import.meta.url);
await mkdir(PASTA, { recursive: true });
const foto = (alvo, nome) => alvo.screenshot({ path: fileURLToPath(new URL(nome + '.png', PASTA)) });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
const mediana = (v) => { const o = v.slice().sort((a, b) => a - b); return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2; };
const ALTURAS = { 390: 844, 320: 640, 768: 1024, 1280: 800, 1440: 900 };
const T1 = 'Tenho uma clínica odontológica e quero mais agendamentos. Tem muita procura. leitura-sim';
const T2 = 'Toda hora perguntam o horário e só a recepcionista atende.';
const nav = await chromium.launch({ executablePath: EXEC });

/* cada deslocamento sem toque recente, e se alguma fonte dele está no radar (o cartão ou algo dentro dele) */
const ESPIAO = () => {
  window.__ls = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => {
    if (e.hadRecentInput) return;
    const noRadar = (e.sources || []).some((s) => s.node && s.node.closest && s.node.closest('#o-rde, .rde-barra'));
    window.__ls.push({ v: e.value, noRadar, t: e.startTime });
  })).observe({ type: 'layout-shift', buffered: true });
};
async function abrir({ larg = 390, alt = ALTURAS[larg] || 844, reduzido = false, semEscopo = false } = {}) {
  const movel = larg < 500;
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: movel, hasTouch: movel, reducedMotion: reduzido ? 'reduce' : 'no-preference', extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  const erros = [], ctl = { atrasoSimular: 0, atrasoZero: 0 };
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /beyon|escopo/.test(m.text()))) erros.push(m.text()); });
  await page.addInitScript(ESPIAO);
  if (semEscopo) await page.route('**/js/orcamento-escopo.js', (r) => r.abort());
  await page.route('**/api/vendas?acao=simular*', async (r) => { if (ctl.atrasoSimular) await espera(ctl.atrasoSimular); r.continue(); });
  await page.route('**/api/vendas?acao=mensagem*', async (r) => { if (ctl.atrasoZero) await espera(ctl.atrasoZero); r.continue(); });
  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#o-perguntas:not([hidden])');
  return { ctx, page, erros, ctl };
}
async function perguntas(page) {
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
}
/* o que o radar mostra, lido do DOM */
const radar = (page) => page.evaluate(() => {
  const t = (id) => document.getElementById(id).textContent.replace(/ /g, ' ');   /* (o toLocaleString põe espaço sem quebra depois do R$) */
  const r = document.getElementById('o-rde'), g = r.querySelector('.rde-g'), v = r.querySelector('.rde-varre');
  const cantos = {};
  for (const q of ['entrega', 'escopo', 'integracoes', 'prazo']) {
    const c = document.getElementById('o-rde-' + q);
    cantos[q] = { texto: c.querySelector('.rde-canto__valor').textContent, nivel: c.classList.contains('is-confirmada') ? 2 : c.classList.contains('is-identificada') ? 1 : 0 };
  }
  const agora = r.querySelector('.rde-trilha li.is-agora');
  return { estado: r.getAttribute('data-estado'), selo: t('o-rde-selo'), valor: t('o-rde-valor'), sr: t('o-rde-valor-sr'), cantos, agora: agora ? agora.querySelector('.rde-trilha__nome').textContent : '', ativo: !!(g && g.classList.contains('is-ativo')),
    varre: !!v && getComputedStyle(v).display !== 'none', ouro: r.classList.contains('is-ouro'), abrir: getComputedStyle(document.getElementById('o-rde-abrir')).visibility === 'visible' };
});
const niveis = (r) => Object.values(r.cantos).map((c) => c.nivel).join('');
const lateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.documentElement.clientWidth === window.innerWidth);
/* total: a sessão inteira; uso: do 1º toque nas perguntas em diante (a carga tem um deslocamento da .orc-mesa que já existe na main e aparece ou não
   conforme o tempo, nas duas variantes: medido 0 ou 0,36 sem nada a ver com o radar); radar: o que tem fonte no cartão ou na barra, na sessão inteira */
const cls = (page) => page.evaluate(() => ({ total: window.__ls.reduce((s, x) => s + x.v, 0), uso: window.__ls.filter((x) => x.t >= window.__t0).reduce((s, x) => s + x.v, 0), radar: window.__ls.filter((x) => x.noRadar).reduce((s, x) => s + x.v, 0) }));
/* enquanto a conta (ou o Zero) está em voo: o radar marca atividade e o ponteiro existe */
async function emVoo(page, disparar, ctl, chave) {
  ctl[chave] = 1500;
  const p = disparar();
  await page.waitForFunction(() => document.querySelector('#o-rde .rde-g').classList.contains('is-ativo'), null, { timeout: 15000 }).catch(() => {});
  const visto = await radar(page);
  await p; ctl[chave] = 0;
  return [visto];
}
async function semConsole(erros, onde) { ok(erros.length === 0, onde + ': nenhum erro no console' + (erros.length ? ' (' + erros.join(' | ') + ')' : '')); }

/* ---------- 1. O ROTEIRO NO CELULAR (390) ---------- */
if (!SO_CLS) {
  console.log('\n== roteiro, 390 x 844 ==');
  const { ctx, page, erros, ctl } = await abrir({ larg: 390 });
  let r = await radar(page);
  ok(r.estado === 'aguardando' && r.selo === 'Aguardando briefing' && r.valor === '—' && /ainda sem valor/.test(r.sr) && niveis(r) === '0000' && Object.values(r.cantos).every((c) => c.texto === 'A definir'), 'página nova: aguardando briefing, tudo "A definir", sem valor');
  ok(!r.ativo && !r.varre && !r.abrir, 'parado: sem ponteiro e sem "Ver como o valor é formado"');
  ok(await page.evaluate(() => document.querySelector('.orc-painel').firstElementChild.id === 'o-rde' && !document.querySelector('#o-rde [aria-live], #o-rde [role=status], #o-rde [role=alert]') && document.querySelector('#o-rde svg').getAttribute('aria-hidden') === 'true'), 'o radar é o 1º do painel, sem região viva, desenho aria-hidden');
  await foto(page.locator('#o-rde'), '390-1-aguardando');
  const voo = await emVoo(page, () => perguntas(page).then(() => page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 })), ctl, 'atrasoSimular');
  ok(voo.some((v) => v.estado === 'identificando' && v.ativo && v.varre), 'com a conta em voo: "Identificando" e o ponteiro varrendo');
  await espera(1300);
  r = await radar(page);
  ok(r.estado === 'estimativa' && r.selo === 'Estimativa preliminar' && r.agora === 'Estimativa', 'o preço: estimativa preliminar, marco "Estimativa"');
  ok(r.valor === 'R$ 8.350' && r.sr === 'Investimento estimado: R$ 8.350.' && (await page.textContent('#o-est-valor')).replace(/ /g, ' ').trim() === r.valor, 'o valor do núcleo é o da tabela, o mesmo do cartão (' + r.valor + ')');
  ok(niveis(r) === '1111' && r.cantos.entrega.texto === 'Site com várias páginas' && r.cantos.escopo.texto === 'Até 5 páginas' && r.cantos.integracoes.texto === 'Agendamento online' && r.cantos.prazo.texto === '9 dias úteis', 'as 4 dimensões identificadas (ciano), com os textos da tabela: ' + JSON.stringify(r.cantos));
  ok(!r.ativo && !r.varre && r.abrir, 'a conta acabou: o ponteiro sumiu; "Ver como o valor é formado" à vista');
  await page.click('#o-rde-abrir');
  ok(await page.getAttribute('#o-rde-abrir', 'aria-expanded') === 'true' && await page.locator('#o-est-mais').isVisible(), '"Ver como o valor é formado" abre os detalhes (aria-expanded)');
  const muda = await page.textContent('#o-est-muda');
  ok(/Precisar antes do prazo: \+\d+% no valor/.test(muda) && /extras que você escolher abaixo do preço/.test(muda), 'o que pode mudar o valor: a urgência com o percentual da tabela e os extras');
  ok(/Até 5 páginas/.test(await page.textContent('#o-est-inclui')), 'já vem no pacote (do catálogo)');
  await foto(page.locator('#o-rde'), '390-2-estimativa');
  ok(await lateral(page), 'sem rolagem lateral');
  /* um extra: o valor conta até o novo e o selo diz "Proposta atualizada" */
  await page.click('#o-ajustar-abrir');
  /* cada texto que o núcleo mostra até assentar: com a contagem de verdade, há números entre 8.350 e 8.600 (antes da revisão, a conta que
     terminava no mesmo tique cancelava a contagem e o número saltava) */
  await page.evaluate(() => { window.__valores = []; new MutationObserver(() => window.__valores.push(document.getElementById('o-rde-valor').textContent.replace(/\D/g, ''))).observe(document.getElementById('o-rde-valor'), { childList: true, characterData: true, subtree: true }); });
  await page.check('#o-x-imagens');
  await page.waitForFunction(() => document.getElementById('o-rde-selo').textContent === 'Proposta atualizada', null, { timeout: 15000 });
  await page.waitForFunction(() => /8\.600$/.test(document.getElementById('o-rde-valor').textContent), null, { timeout: 4000 });
  const valores = await page.evaluate(() => window.__valores.map(Number));
  const meio = valores.filter((v) => v > 8350 && v < 8600);
  ok(meio.length >= 3 && (await radar(page)).selo === 'Proposta atualizada', 'extra: o número CONTA de 8.350 a 8.600 (' + meio.length + ' valores no meio) e o selo segue "Proposta atualizada" depois que a conta terminou');
  r = await radar(page);
  ok(r.sr === 'Investimento estimado: R$ 8.600.', 'extra: o leitor de tela ouve o valor final (' + r.sr + ')');
  r = await radar(page);
  ok(r.cantos.escopo.texto === 'Até 5 páginas · 1 extra', 'extra: o escopo diz "1 extra" (' + r.cantos.escopo.texto + ')');
  await espera(2800);
  ok((await radar(page)).selo === 'Estimativa preliminar', '"Proposta atualizada" some depois de uns 2,5 s');
  await page.check('#o-x-urgencia');
  await page.waitForFunction(() => /com urgência/.test(document.getElementById('o-rde-prazo').textContent), null, { timeout: 15000 });
  ok(true, 'urgência: o prazo diz "com urgência" (' + (await radar(page)).cantos.prazo.texto + ')');
  await page.uncheck('#o-x-urgencia'); await page.uncheck('#o-x-imagens');
  await page.waitForFunction(() => /8\.350$/.test(document.getElementById('o-rde-valor').textContent) &&!/urgência/.test(document.getElementById('o-rde-prazo').textContent), null, { timeout: 15000 });
  /* "Mudar as respostas": as dimensões voltam a pendente */
  await page.click('#o-p-refazer');
  await espera(300);
  r = await radar(page);
  ok(r.estado === 'aguardando' && niveis(r) === '0000' && r.valor === '—' && !r.abrir && await page.locator('#o-est-mais').isHidden(), '"Mudar as respostas": tudo volta a pendente, sem valor, detalhes fechados');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir'); await page.click('.orc-p:not([hidden]) .orc-p__seguir'); await page.click('#o-p-ver-preco');   /* (as respostas ficam: só seguir) */
  await page.waitForFunction(() => document.getElementById('o-rde').getAttribute('data-estado') === 'estimativa', null, { timeout: 20000 });
  ok((await radar(page)).selo === 'Estimativa preliminar', 'o preço de novo, sem "Proposta atualizada" (antes não havia valor)');
  /* a conversa */
  await page.click('#o-conversar');
  ctl.atrasoZero = 1500;
  const n = await page.locator('#o-log .msg--agente').count();
  await page.fill('#o-texto', T1);
  await page.press('#o-texto', 'Enter');
  const vistos = [];
  for (let i = 0; i < 10; i++) { await espera(100); vistos.push(await radar(page)); }
  ok(vistos.some((v) => v.ativo && v.varre), 'com o Zero pensando: o ponteiro varre');
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  ctl.atrasoZero = 0;
  await espera(1500);
  r = await radar(page);
  ok(!r.ativo && !r.varre, 'o Zero respondeu: o ponteiro parou (estado: ' + r.estado + ', ' + r.selo + ', ' + r.valor + ')');
  const contou = await page.textContent('#o-est-contou');
  ok(/muita procura/.test(contou), '"o que você nos contou": as palavras da pessoa, literais (' + contou.replace(/\s+/g, ' ').slice(0, 90) + ')');
  /* a barra do celular */
  /* a caixa de texto no pé da tela, como quem acabou de ler a resposta: o cartão do radar (logo depois da conversa) fica fora da tela */
  await page.evaluate(() => { document.activeElement.blur(); document.getElementById('o-form').scrollIntoView({ block: 'end' }); });
  await espera(700);
  const barra = () => page.evaluate(() => { const b = document.querySelector('.rde-barra'); if (!b) return null; const r = b.getBoundingClientRect(), f = document.getElementById('o-texto').getBoundingClientRect(); return { visivel: b.classList.contains('is-visivel') && getComputedStyle(b).visibility === 'visible', top: Math.round(r.top), bottom: Math.round(r.bottom), largura: Math.round(r.width), cobreTexto: b.classList.contains('is-visivel') && f.top < r.bottom && f.bottom > r.top, texto: b.textContent }; });
  let b = await barra();
  ok(!!b && b.visivel && b.top === 64 && b.largura === 390, 'barra do celular: aparece sob o menu com o radar fora da tela (' + JSON.stringify(b) + ')');
  await foto(page, '390-3-barra');
  await foto(page.locator('.rde-barra'), '390-3-barra-faixa');
  await page.focus('#o-texto');
  await espera(700);
  b = await barra();
  ok(b && !b.visivel, 'escrevendo na conversa: a barra sai (não cobre a caixa de texto nem rouba tela do teclado)');
  await page.evaluate(() => document.activeElement.blur());
  await espera(700);
  b = await barra();
  ok(b && b.visivel && !b.cobreTexto, 'de volta: a barra não cobre a caixa de texto');
  await page.click('.rde-barra__ver');
  await espera(800);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'o-est-titulo' && document.getElementById('o-rde').getBoundingClientRect().top < innerHeight / 2), '"Ver radar": rola até o cartão e o foco vai para o título dele');
  ok(!(await barra()).visivel, 'com o radar à vista a barra sai');
  /* o foco do teclado não fica atrás da barra: um botão logo abaixo do menu (o radar já saiu por cima) desce para a vista ao receber o foco */
  await page.evaluate(() => { const q = document.getElementById('o-quero-modelos'); window.scrollTo(0, q.getBoundingClientRect().top + window.scrollY - 72); });
  await espera(700);
  const antesDoFoco = await barra();
  await page.focus('#o-quero-modelos');
  await espera(400);
  const foco = await page.evaluate(() => { const q = document.getElementById('o-quero-modelos').getBoundingClientRect(), b = document.querySelector('.rde-barra').getBoundingClientRect(); return { topo: Math.round(q.top), barra: Math.round(b.bottom), visivel: document.querySelector('.rde-barra').classList.contains('is-visivel') }; });
  ok(antesDoFoco.visivel && (!foco.visivel || foco.topo >= foco.barra), 'foco num botão que estava atrás da barra: ele desce para a vista (' + JSON.stringify(foco) + ')');
  await page.focus('#o-texto');
  await espera(300);
  ok(!(await barra()).visivel, 'foco num campo de escrever: a barra sai');
  await page.evaluate(() => document.activeElement.blur());
  ok(await lateral(page), 'sem rolagem lateral com a barra');
  await foto(page, '390-4-conversa');
  await foto(page.locator('#o-rde'), '390-4-radar-conversa');
  /* "Quero os três modelos" grava o pacote, mas a etapa segue "estimativa" até o contato: o radar NÃO fica branco nem volta atrás */
  const antesDoQuero = await radar(page);
  await page.click('#o-quero-modelos');
  await page.waitForSelector(PASSO, { timeout: 20000 });   /* (o pedido abre na conversa, PR 3) */
  await espera(800);
  r = await radar(page);
  ok(r.estado === 'estimativa' && niveis(r) === '1111' && r.selo === antesDoQuero.selo && r.valor === antesDoQuero.valor && JSON.stringify(r.cantos) === JSON.stringify(antesDoQuero.cantos), 'pacote gravado, sem contato ainda: segue "estimativa" (ciano), igual a antes (' + r.estado + ' ' + niveis(r) + ')');
  /* os detalhes (o contato): agora a pessoa confirmou; proposta configurada, tudo branco */
  await fazerPedido(page, { negocio: 'Clínica Radar E2E', vende: 'Consultas', telefone: telefoneNovo() });
  await page.waitForFunction(() => document.getElementById('o-rde').getAttribute('data-estado') === 'proposta', null, { timeout: 20000 }).catch(() => {});
  r = await radar(page);
  ok(r.estado === 'proposta' && r.selo === 'Proposta configurada' && niveis(r) === '2222' && r.agora === 'Proposta', 'com o contato (a pessoa confirmou): proposta configurada, as 4 dimensões confirmadas (branco) (' + r.estado + ' ' + niveis(r) + ')');
  await page.locator('#o-rde').scrollIntoViewIfNeeded();
  await foto(page.locator('#o-rde'), '390-5-proposta');
  /* o ouro: um estado sintético (a etapa real exige o pagamento), só para ver o desenho; o próximo render volta ao real */
  await page.evaluate(() => window.BZOrcEscopo.atualizar({ conversa: { etapa: 'aguardando_pagamento' }, mensagens: [], estimativa: { valor_total: 8350, prazo_dias: 9, detalhes: { formato: { chave: 'institucional', paginas_incluidas: 5 }, itens: [{ chave: 'agendamento', qtd: 1 }], multiplicadores: { urgencia: false } } }, proposta: { valor_total: 8350 } }));
  await espera(1400);
  r = await radar(page);
  ok(r.ouro && r.estado === 'confirmada' && r.selo === 'Proposta confirmada', 'confirmada (sintético): o ouro, só aqui');
  await foto(page.locator('#o-rde'), '390-6-confirmada');
  await semConsole(erros, '390');
  await ctx.close();
}

/* ---------- 2. AS LARGURAS: capturas, rolagem lateral e o aceite do computador ---------- */
for (const larg of SO_CLS ? [] : LARGURAS) {
  console.log('\n== ' + larg + ' x ' + ALTURAS[larg] + ' ==');
  const { ctx, page, erros } = await abrir({ larg });
  await perguntas(page);
  await page.waitForFunction(() => document.getElementById('o-rde').getAttribute('data-estado') === 'estimativa', null, { timeout: 20000 });
  await espera(1300);
  ok(await lateral(page), larg + ': sem rolagem lateral');
  await page.click('#o-conversar');
  await page.evaluate(() => { window.scrollTo(0, document.querySelector('.orc-mesa').getBoundingClientRect().top + window.scrollY - 80); document.querySelector('.orc-painel').scrollTop = 0; });
  await espera(500);
  await foto(page, larg + '-janela');
  await foto(page.locator('#o-rde'), larg + '-radar');
  if (larg >= 900) {
    const g = await page.evaluate(() => {
      const p = document.querySelector('.orc-painel').getBoundingClientRect(), v = document.getElementById('o-rde-valor').getBoundingClientRect(), q = document.getElementById('o-quero-modelos').getBoundingClientRect();
      const dentro = (e) => e.top >= Math.max(p.top, 0) - 1 && e.bottom <= Math.min(p.bottom, innerHeight) + 1 && e.height > 0;
      return { valor: dentro(v), quero: dentro(q), queroBase: Math.round(q.bottom), painelBase: Math.round(Math.min(p.bottom, innerHeight)), rolagem: document.querySelector('.orc-painel').scrollTop, tab: document.querySelector('.orc-painel').getAttribute('tabindex') };
    });
    ok(g.valor && g.quero && g.rolagem === 0, larg + ': ACEITE: o valor do radar e "Quero os três modelos" à vista no painel sem rolar o painel (' + JSON.stringify(g) + ')');
    ok(g.tab === '0', larg + ': o painel que rola por dentro é alcançável pelo teclado (tabindex="0")');
  }
  if (larg === 390) {
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await espera(500);
    const largo = await page.evaluate(() => { const W = document.documentElement.clientWidth; return { sw: document.documentElement.scrollWidth, iw: innerWidth, fora: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.passagem, .rde-barra'); }).slice(0, 6).map((e) => (e.id || e.className) + ':' + Math.round(e.getBoundingClientRect().right)) }; });
    ok(await lateral(page), '390 com a fonte a 200%: nada passa da largura ' + JSON.stringify(largo));
    await page.locator('#o-rde').scrollIntoViewIfNeeded();
    await foto(page.locator('#o-rde'), '390-fonte200-radar');
  }
  await semConsole(erros, String(larg));
  await ctx.close();
}
if (!SO_CLS) {
  const { ctx, page } = await abrir({ larg: 1280, alt: 2400 });
  await perguntas(page);
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 });
  await espera(600);
  ok(await page.evaluate(() => document.querySelector('.orc-painel').getAttribute('tabindex')) === null, '1280 x 2400: o painel não rola, então não tem tabindex');
  await ctx.close();
}

/* ---------- 3. MOVIMENTO REDUZIDO ---------- */
if (!SO_CLS) {
  console.log('\n== movimento reduzido, 390 ==');
  const { ctx, page, erros, ctl } = await abrir({ larg: 390, reduzido: true });
  const voo = await emVoo(page, () => perguntas(page).then(() => page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 })), ctl, 'atrasoSimular');
  ok(voo.some((v) => v.ativo) && voo.every((v) => !v.varre), 'reduzido: a atividade é marcada, mas o ponteiro não existe');
  await page.click('#o-ajustar-abrir');
  await page.check('#o-x-imagens');
  await page.waitForFunction(() => document.getElementById('o-rde-selo').textContent === 'Proposta atualizada', null, { timeout: 15000 });
  ok((await radar(page)).valor === 'R$ 8.600', 'reduzido: o valor novo aparece direto, sem contar');
  ok(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && document.getElementById('o-rde').contains(a.effect && a.effect.target)).length === 0), 'reduzido: nenhuma animação no radar');
  await semConsole(erros, 'reduzido');
  await ctx.close();
}

/* ---------- 4. CLS: com e sem o módulo do radar ---------- */
{
  console.log('\n== CLS (390), ' + RODADAS + ' rodadas ==');
  const medir = async (semEscopo) => {
    const { ctx, page } = await abrir({ larg: 390, semEscopo });
    await espera(1500);
    await page.evaluate(() => { window.__t0 = performance.now(); });
    await perguntas(page);
    await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 });
    await espera(1500);
    await page.click('#o-ajustar-abrir'); await page.check('#o-x-imagens');
    await page.waitForFunction(() => /8\.600/.test(document.getElementById('o-est-valor').textContent), null, { timeout: 15000 });
    await espera(1500);
    const v = await cls(page);
    await ctx.close();
    return v;
  };
  const com = [], sem = [];
  for (let i = 0; i < RODADAS; i++) { com.push(await medir(false)); sem.push(await medir(true)); }
  const delta = mediana(com.map((x) => x.uso)) - mediana(sem.map((x) => x.uso));
  console.log('  CLS total (com a carga) com o radar: ' + com.map((x) => x.total.toFixed(4)).join(', ') + ' | sem: ' + sem.map((x) => x.total.toFixed(4)).join(', '));
  console.log('  CLS do uso (perguntas, preço, extra) com o radar: ' + com.map((x) => x.uso.toFixed(4)).join(', ') + ' | sem: ' + sem.map((x) => x.uso.toFixed(4)).join(', ') + ' | delta da mediana: ' + delta.toFixed(4));
  console.log('  deslocamentos com fonte no radar (com o módulo): ' + com.map((x) => x.radar.toFixed(4)).join(', '));
  ok(delta <= 0.01, 'o radar não piora o CLS (delta ' + delta.toFixed(4) + ' <= 0,01)');
  ok(Math.max.apply(null, com.map((x) => x.radar)) <= 0.01, 'nenhum deslocamento que venha do radar passa de 0,01');
}

await nav.close();
console.log(falhou ? '\nFALHOU' : '\nTUDO OK');
process.exit(falhou ? 1 : 0);
