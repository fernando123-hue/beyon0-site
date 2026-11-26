/* E2E DO MAPA DO CASO NA PÁGINA DE ORÇAMENTO (PR 5c; refeito para a conversa nova e o mapa v3) num Chromium de verdade, servidor local com a IA
   simulada, nas DUAS pontas da flag BZ_PLANTA:
     node docs/servidor.mjs . 8931                           (flag ligada: padrão do servidor local)
     BZ_PLANTA_LOCAL=desligada node docs/servidor.mjs . 8932 (flag desligada: a página de hoje)
     CHROMIUM=... node docs/e2e-planta.mjs [8931] [8932] [pasta das fotos]
   Ligada, celular (390):
     - a conversa até o mapa (o gatilho "planta-boa" do dublê dá um v3): o mapa monta no cartão, termina em ouro, libera o valor;
     - "Ficou certo?" aparece; "Está certo" vira uma fala na tela e NÃO manda mensagem;
     - ao recarregar, a pergunta volta;
     - "Quero ajustar algo" foca a caixa com a dica do mapa;
     - o AJUSTE: um estado forjado na rede (versão 2 com um nó "ajustado") faz o nó novo aparecer com a marca, sem refazer a entrada.
   Ligada, computador durante a conversa (1366x768, 1366x650, 1280x650 e 930x768): o esboço cabe na caixa ou fica no passo mínimo.
   Ligada, computador (1280x900 e 1366x768): o esboço cabe na caixa e, com o mapa pronto, deixa "em construção" (achado 18); o botão "Ver a planta do seu site" aparece sob a fala do Zero e abre a faixa com o mapa, com o foco no título.
   Regressão do v2: um plano v2 forjado na rede desenha com o módulo antigo (.plv-quadro).
   Desligada: nada da planta é baixado e a conversa é a de sempre.
   Cada rodada usa um IP novo (o freio local de sessões por IP). Sai com 1 se algo falhar. */
import { chromium } from 'playwright';
import { esperarToques, responderAteADor } from './e2e-toques.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ON = 'http://127.0.0.1:' + (process.argv[2] || '8931');
const OFF = 'http://127.0.0.1:' + (process.argv[3] || '8932');
const PASTA = process.argv[4] || null;
const V2 = JSON.parse(await readFile(new URL('./testes/fixtures/planta/clinica.json', import.meta.url), 'utf8'));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };
const MODULOS_DA_PLANTA = /\/(orcamento-planta-forma|orcamento-mapa-forma|planta-layout|planta-desenho|mapa-layout|mapa-desenho|planta-pecas|planta-cresce|planta-esboco|mapa-saber)\.js|orcamento-(planta|mapa)\.css|planta-esboco\.css/;
if (PASTA) await mkdir(PASTA, { recursive: true });
const foto = async (alvo, nome) => { if (PASTA) await alvo.screenshot({ path: path.join(PASTA, nome + '.png') }); };
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

/* forja o estado: troca o plano (e a versão) da planta na resposta de "estado", a partir do momento em que `ligar()` é chamado */
async function forjarEstado(page, troca) {
  const ctl = { ativo: false };
  await page.route('**/api/vendas?acao=estado*', async (route) => {
    const r = await route.fetch();
    if (!ctl.ativo) return route.fulfill({ response: r });
    const j = await r.json();
    if (j && j.planta && j.planta.plano) troca(j.planta);
    return route.fulfill({ response: r, json: j });
  });
  return { ligar: () => { ctl.ativo = true; } };
}
async function abrir(base, { larg = 390, alt = 844 } = {}) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: larg < 500, hasTouch: larg < 500, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  const baixados = [], erros = [], mensagens = [];
  page.on('request', (r) => {
    if (MODULOS_DA_PLANTA.test(r.url())) baixados.push(r.url().split('/').pop());
    if (/acao=mensagem/.test(r.url()) && r.method() === 'POST') mensagens.push(r.postData() || '');
  });
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /planta|beyon/.test(m.text()))) erros.push(m.text()); });
  await page.addInitScript(() => { window.__prontas = 0; document.addEventListener('bz:planta-pronta', () => { window.__prontas++; }); });
  return { ctx, page, baixados, erros, mensagens };
}
async function conversarAteOMapa(page, base) {
  await page.goto(base + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await esperarToques(page);
  await responderAteADor(page);
  await turno(page, 'Pelo Instagram e por indicação, e muita gente pergunta e some');
  await turno(page, 'planta-boa pode desenhar');
}
async function turno(page, texto) {
  const n = await page.locator('#o-log .msg--agente').count();
  await page.fill('#o-texto', texto);
  await page.press('#o-texto', 'Enter');
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
}
/* leva o cartão à vista: no computador a caixa rola; no celular (desde a conversa que cresce com a página, 25/11) a caixa não rola e quem anda é a página */
const rolarAoCartao = (page) => page.evaluate(() => {
  const li = document.querySelector('#o-log .lv-item'), c = document.getElementById('o-log-caixa');
  if (!li || !c) return;
  if (getComputedStyle(c).overflowY !== 'visible') c.scrollTop += li.getBoundingClientRect().top - c.getBoundingClientRect().top - 8;
  else window.scrollBy(0, li.getBoundingClientRect().top - 80);
});
const lateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/* ---------- ligada, celular ---------- */
console.log('\n== flag ligada, celular 390 (' + ON + ') ==');
{
  const { ctx, page, erros, mensagens } = await abrir(ON);
  const forja = await forjarEstado(page, (planta) => {
    /* o ajuste: versão 2, o mesmo mapa com um nó "ajustado" entre a ação e o objetivo */
    const p = planta.plano, acao = p.nos[p.nos.length - 1];
    p.nos.push({ id: 'lembrete', papel: 'ajustado', icone: 'lembrete', titulo: 'Lembrete na véspera', frase: 'A pessoa recebe um aviso antes do horário' });
    p.setas = p.setas.filter((s) => !(s.de === acao.id && s.para === 'objetivo'));
    p.setas.push({ de: acao.id, para: 'lembrete', rotulo: 'avisa antes' }, { de: 'lembrete', para: 'objetivo', rotulo: 'confirma' });
    planta.versao = 2;
  });
  await conversarAteOMapa(page, ON);
  await rolarAoCartao(page);
  await page.waitForSelector('#o-log .lv-item .mpc-quadro', { timeout: 20000 });
  await espera(9000);
  const q = await page.evaluate(() => { const x = document.querySelector('#o-log .lv-item .mpc-quadro'); return { h: Math.round(x.getBoundingClientRect().height), ouro: x.classList.contains('is-ouro'), prontas: window.__prontas }; });
  ok(q.ouro && q.prontas >= 1, 'o mapa monta no cartão, termina em ouro e libera o valor');
  ok(q.h <= 440, 'o quadro cabe na caixa da conversa (' + q.h + ' px)');
  ok(await lateral(page), 'sem rolagem lateral');
  const acoes = page.locator('#o-log .lv-item .mpc-acoes');
  ok(await acoes.isVisible() && /Ficou certo\?/.test(await acoes.textContent()), '"Ficou certo?" aparece');
  await foto(page.locator('#o-log .lv-item'), 'e2e-390-pronto');
  const antes = mensagens.length;
  await page.getByRole('button', { name: 'Está certo', exact: true }).click();
  await espera(2000);
  ok(mensagens.length === antes, '"Está certo" não manda mensagem (não gasta IA)');
  ok(/Está certo\./.test(await acoes.textContent()), '"Está certo" vira uma fala na tela');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-log .lv-item .mpc-quadro', { timeout: 30000 });
  await rolarAoCartao(page);
  await page.waitForSelector('#o-log .lv-item .mpc-acoes:not(.is-espera)', { timeout: 30000 });
  ok(await page.getByRole('button', { name: 'Está certo', exact: true }).count() === 1, 'ao recarregar, a pergunta volta (nada foi gravado)');
  await page.getByRole('button', { name: 'Quero ajustar algo', exact: true }).click();
  const caixa = await page.evaluate(() => ({ foco: document.activeElement && document.activeElement.id, dica: document.getElementById('o-texto').placeholder }));
  ok(caixa.foco === 'o-texto' && caixa.dica === 'Diga o que mudar no mapa.', '"Quero ajustar algo" foca a caixa com a dica do mapa (' + JSON.stringify(caixa) + ')');
  /* o ajuste: o próximo estado traz a versão 2 com o nó novo */
  forja.ligar();
  const prontasAntes = await page.evaluate(() => window.__prontas);
  await turno(page, 'quero um lembrete na véspera');
  await rolarAoCartao(page);
  await page.waitForSelector('#o-log .lv-item .mpc-no--ajustado', { timeout: 20000 });
  await espera(3000);
  const aj = await page.evaluate(() => ({ marca: (document.querySelector('.lv-item .mpc-no--ajustado') || {}).textContent || '', ouro: document.querySelector('.lv-item .mpc-quadro').classList.contains('is-ouro'), prontas: window.__prontas }));
  ok(/Ajustado/.test(aj.marca) && /Lembrete na véspera/.test(aj.marca), 'o ajuste: o nó novo aparece com a marca "Ajustado"');
  ok(aj.ouro && aj.prontas === prontasAntes, 'o ajuste não refaz a entrada (o ouro fica; o valor não é liberado de novo)');
  await foto(page.locator('#o-log .lv-item'), 'e2e-390-ajuste');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

/* ---------- ligada, computador (1280x900 e o notebook comum, 1366x768) ---------- */
/* o esboço que fica na conversa (no computador a caixa ROLA e corta, css/orcamento.css): achado 18 (26/11), em 1366x768 o cartão de 506 px não cabia
   na caixa de 459 (o objetivo e a legenda fora) e seguia "em construção" para sempre, com o objetivo preso na fila, depois do mapa pronto na faixa */
const esbocoNaCaixa = (page) => page.evaluate(() => {
  const card = document.querySelector('#o-log .lv-item'), caixa = document.getElementById('o-log-caixa');
  if (!card || !caixa) return null;
  const cs = getComputedStyle(caixa), util = caixa.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return { kicker: (card.querySelector('.lv-kicker') || {}).textContent || '', alto: Math.round(card.getBoundingClientRect().height), util: Math.round(util),
    objetivo: !!card.querySelector('.lv-txt--led.is-aceso') };
});
for (const [larg, alt] of [[1280, 900], [1366, 768]]) {
console.log('\n== flag ligada, computador ' + larg + 'x' + alt + ' ==');
{
  const { ctx, page, erros } = await abrir(ON, { larg, alt });
  await conversarAteOMapa(page, ON);
  await page.waitForFunction(() => !!window.BZMapa, null, { timeout: 20000 });
  const ver = page.locator('.plv-ver');
  await ver.first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await ver.count() === 1, 'o botão "Ver a planta do seu site" aparece sob a fala do Zero');
  if (await ver.count()) await ver.first().click();
  await page.waitForSelector('#o-planta .mpc-quadro', { timeout: 20000 }).catch(() => {});
  const f = await page.evaluate(() => ({ faixa: !document.getElementById('o-planta').hidden, mapa: !!document.querySelector('#o-planta .mpc-quadro'), foco: document.activeElement && document.activeElement.tagName }));
  ok(f.faixa && f.mapa, 'o botão abre a faixa com o mapa');
  ok(f.foco === 'H2', 'o foco vai ao título do mapa');
  await espera(9000);
  await foto(page.locator('#o-planta'), 'e2e-' + larg + '-faixa');
  const esb = await esbocoNaCaixa(page);
  ok(!!esb && esb.alto <= esb.util, 'o esboço cabe inteiro na caixa da conversa (' + JSON.stringify(esb) + ')');
  ok(!!esb && !/em construção/.test(esb.kicker) && esb.objetivo, 'com o mapa pronto na faixa, o esboço deixa "em construção" e imprime o objetivo');
  await foto(page.locator('#o-log .lv-item'), 'e2e-' + larg + '-esboco');
  ok(await lateral(page), 'sem rolagem lateral');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}
}

/* ---------- computador, DURANTE a conversa: o esboço compacto pela altura da caixa (revisão do achado 18) ---------- */
/* num notebook de 768 de verdade (navegador e barra de tarefas) a janela útil tem ~650 e a caixa (60vh) ~362 úteis: o passo do esboço sai da altura
   útil da caixa, de 44 a 36; abaixo do que o passo 36 alcança o cartão fica no mínimo (a medida sai no log). 930: a caixa já rola e a legenda tem 84 */
for (const [larg, alt] of [[1366, 768], [1366, 650], [1280, 650], [930, 768]]) {
  console.log('\n== computador ' + larg + 'x' + alt + ', o esboço durante a conversa ==');
  const { ctx, page, erros } = await abrir(ON, { larg, alt });
  await page.goto(ON + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await esperarToques(page);
  await responderAteADor(page);
  await turno(page, 'Pelo Instagram e por indicação, e muita gente pergunta e some');
  await page.waitForSelector('#o-log .lv-item .lv-quadro', { timeout: 20000 });
  await espera(4000);
  const esb = await esbocoNaCaixa(page);
  const passo = await page.evaluate(() => { const t = [...document.querySelectorAll('#o-log .lv-item .lv-lista .lv-txt')].map((li) => parseFloat(li.style.top)); return t.length > 1 ? Math.round(t[1] - t[0]) : 0; });
  ok(!!esb && (esb.alto <= esb.util || passo === 36), 'o esboço cabe na caixa ou fica no passo mínimo (' + JSON.stringify(Object.assign({ passo }, esb)) + ')');
  ok(!!esb && /em construção/.test(esb.kicker), 'durante a conversa, "em construção"');
  await foto(page.locator('#o-log .lv-item'), 'e2e-' + larg + 'x' + alt + '-conversa');
  ok(await lateral(page), 'sem rolagem lateral');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

/* ---------- regressão do v2 (plano antigo gravado numa conversa) ---------- */
console.log('\n== regressão: um plano v2 desenha com o módulo antigo ==');
{
  const { ctx, page, erros } = await abrir(ON);
  const forja = await forjarEstado(page, (planta) => { planta.plano = JSON.parse(JSON.stringify(V2)); });
  forja.ligar();
  await conversarAteOMapa(page, ON);
  await rolarAoCartao(page);
  await page.waitForSelector('#o-log .lv-item .plv-quadro', { timeout: 20000 }).catch(() => {});
  ok(await page.locator('#o-log .lv-item .plv-quadro').count() === 1, 'o v2 monta no cartão com o desenho antigo');
  ok(await page.locator('.mpc-quadro').count() === 0, 'nada do desenho novo');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

/* ---------- desligada ---------- */
console.log('\n== flag desligada (' + OFF + ') ==');
{
  const { ctx, page, baixados, erros } = await abrir(OFF);
  await page.goto(OFF + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await esperarToques(page);
  await responderAteADor(page);
  await turno(page, 'Pelo Instagram e por indicação');
  await turno(page, 'planta-boa pode desenhar');
  await espera(1500);
  ok(baixados.length === 0, 'nenhum arquivo da planta baixado (' + baixados.join(',') + ')');
  ok(await page.locator('.lv-item, .mpc-quadro, .plv-quadro, .plv-ver').count() === 0, 'nada da planta na tela');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

await nav.close();
console.log(falhou ? '\nFALHOU' : '\ntudo certo');
process.exit(falhou ? 1 : 0);
