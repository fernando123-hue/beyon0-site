/* MEDE A PLANTA NA PÁGINA REAL DE ORÇAMENTO (PR 2c; plano "PR 2c", spec §4.4): CLS, tarefas longas e bytes, em A/B com a flag BZ_PLANTA.
   Dois servidores locais, o mesmo código: um com a flag ligada, outro com BZ_PLANTA_LOCAL=desligada:
     node docs/servidor.mjs . 8931                           (flag ligada)
     BZ_PLANTA_LOCAL=desligada node docs/servidor.mjs . 8932 (flag desligada = a página de hoje)
   Cada rodada abre um navegador novo, responde as perguntas, abre a conversa e manda os turnos até a planta chegar (ou, com a flag desligada, até onde ela
   chegaria). O ÚLTIMO turno leva 2,5 s de atraso na resposta (como a IA de verdade: sem isso a resposta cai dentro dos 500 ms que o navegador perdoa depois de
   uma tecla e o CLS sairia zero por construção). Mede só a janela do último turno (do envio a +9 s). O CLS é o da métrica (sem deslocamento logo depois de ação da
   pessoa); o bruto também sai. Alterna ligada/desligada a cada rodada (a deriva da máquina não cai toda num lado).
   Posição da faixa: "fora" = a mesa termina abaixo da tela (a faixa nasce fora da área visível, entra na hora); "dentro" = a janela é aumentada até a mesa caber, a faixa
   ficaria à vista, e o módulo ESPERA o gesto (o clique do fim da rodada a insere; o navegador não conta o deslocamento).
   Nichos: clinica, loja, embalagens (plano padrão do nicho: 3 turnos) e boa (a IA simulada desenha o plano "planta-boa": 2 turnos).
   Uso:  CHROMIUM=... node docs/medir-planta.mjs <saida.json> [opções]
     --rodadas N          rodadas por caso (padrão 3)            --larguras 390,320,1280     --alturas 844,640,800
     --nichos a,b         (padrão clinica,loja,embalagens,boa)   --posicoes fora,dentro      --cpu N (estrangulamento, padrão 1)   --paralelo N (rodadas ao mesmo tempo, padrão 1)
     --variante base|sem-svg|sem-texto|adiar   (A/B de CPU do plano; só mexe no que o navegador recebe, nunca no repositório)
     --on 8931 --off 8932    portas dos dois servidores           --so-ligada   (sem a metade desligada)
     --bytes                 só imprime os bytes (gzip -9 e brotli) e a distância preço -> botão do formulário (precisa dos servidores)
   O headless desenha por software: serve para COMPARAR, não como fps de aparelho. A 1ª medição de cada execução é de aquecimento e não entra. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i < 0 ? padrao : (process.argv[i + 1] || ''); };
const tem = (nome) => process.argv.includes('--' + nome);
if (process.argv.includes('--help') || process.argv.length < 3) { console.log('Uso: node docs/medir-planta.mjs <saida.json> [--rodadas N --larguras 390,320,1280 --nichos clinica,loja,embalagens,boa --posicoes fora,dentro --cpu N --variante base|sem-svg|sem-texto|adiar --on 8931 --off 8932 --so-ligada --bytes]'); process.exit(0); }
const SAIDA = process.argv[2];
const ON = 'http://127.0.0.1:' + arg('on', '8931'), OFF = 'http://127.0.0.1:' + arg('off', '8932');
const RODADAS = Number(arg('rodadas', '3'));
const LARGURAS = arg('larguras', '390,320,1280').split(',').map(Number);
const ALTURAS = arg('alturas', '').split(',').filter(Boolean).map(Number);
const NICHOS = arg('nichos', 'clinica,loja,embalagens,boa').split(',');
const POSICOES = arg('posicoes', 'fora,dentro').split(',');
const CPU = Number(arg('cpu', '1'));
const VARIANTE = arg('variante', 'base');
const SO_LIGADA = tem('so-ligada');
const PARALELO = Number(arg('paralelo', '1'));   /* rodadas ao mesmo tempo: bom para o CLS (não depende de CPU); para tarefas longas use 1 */
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const mediana = (v) => { const o = v.slice().sort((a, b) => a - b); return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null; };
const altura = (l) => (ALTURAS[LARGURAS.indexOf(l)] || (l >= 1000 ? 800 : l >= 380 ? 844 : 640));

/* o texto de cada nicho; o 1º turno estima, os seguintes deixam o servidor pedir a planta */
const TEXTOS = {
  clinica: ['Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional', 'Pode seguir', 'Combinado, pode seguir'],
  loja: ['Tenho uma loja de roupas e quero vender online, preciso de uma loja virtual', 'Pode seguir', 'Combinado, pode seguir'],
  embalagens: ['Tenho uma fábrica de embalagens e quero captar mais clientes, preciso de um site institucional', 'Pode seguir', 'Combinado, pode seguir'],
  boa: ['Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional', 'planta-boa pode desenhar']
};

/* o espião da página: cada layout-shift (valor, instante, se veio logo depois de ação da pessoa, quem se moveu) e cada tarefa longa */
const ESPIAO = () => {
  window.__ls = []; window.__longas = [];
  const desc = (n) => (n ? n.nodeName + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : '') : '?');
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ls.push({ v: e.value, t: Math.round(e.startTime), recente: e.hadRecentInput, fontes: (e.sources || []).map((s) => desc(s.node)) }))).observe({ type: 'layout-shift', buffered: true });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longas.push({ ms: Math.round(e.duration), t: Math.round(e.startTime) }))).observe({ type: 'longtask', buffered: true }); } catch (e) { /* sem longtask */ }
};

/* a variante de CPU: só o que o navegador recebe */
const CSS_VARIANTE = { 'sem-svg': '.plv-svg { display: none !important; }', 'sem-texto': '.plv-lista { display: none !important; }' };

async function perguntas(page) {
  await page.waitForSelector('#o-perguntas:not([hidden])');
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 });
}
async function turno(page, texto) {
  const n = await page.locator('#o-log .msg--agente').count();
  await page.fill('#o-texto', texto);
  await page.press('#o-texto', 'Enter');
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
}

async function rodada({ base, larg, alt, nicho, posicao, cpu, variante }) {
  const movel = larg < 500;
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: movel, hasTouch: movel, deviceScaleFactor: 1, extraHTTPHeaders: { 'x-forwarded-for': '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250)) } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /planta/.test(m.text()))) erros.push(m.text()); });
  await page.addInitScript(ESPIAO);
  if (cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  if (CSS_VARIANTE[variante]) await page.route('**/css/orcamento-planta.css', async (r) => { const resp = await r.fetch(); r.fulfill({ response: resp, body: (await resp.text()) + '\n' + CSS_VARIANTE[variante] }); });
  if (variante === 'adiar') await page.route('**/js/planta-desenho.js', async (r) => {
    const resp = await r.fetch(); let js = await resp.text();
    const a = '        programaEntrada();\n        inst.anims.forEach(function (a) { try { a.pause(); } catch (e) { aviso(e); } });\n        if (!inst.io || inst.visivel) iniciar();';
    const k = js.replace(/\r\n/g, '\n');
    if (!k.includes(a)) throw new Error('variante adiar: trecho não encontrado em planta-desenho.js (o módulo mudou)');
    r.fulfill({ response: resp, body: k.replace(a, '        var go = function () { programaEntrada(); inst.anims.forEach(function (a) { try { a.pause(); } catch (e) { aviso(e); } }); iniciar(); };\n        if (!inst.io || inst.visivel) go(); else inst.adiado = go;').replace('function iniciar() {\n      if (!inst || inst.iniciada) return;', 'function iniciar() {\n      if (!inst || inst.iniciada) return;\n      if (inst.adiado) { var g2 = inst.adiado; inst.adiado = null; g2(); return; }') });
  });
  let ultimoAtraso = false;
  await page.route('**/api/vendas?acao=mensagem*', async (r) => { if (ultimoAtraso) await espera(2500); r.continue(); });
  await page.goto(base + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await perguntas(page);
  await page.click('#o-conversar');
  const textos = TEXTOS[nicho];
  for (let i = 0; i < textos.length - 1; i++) await turno(page, textos[i]);
  if (posicao === 'dentro') {
    const fim = await page.evaluate(() => document.querySelector('.orc-mesa').getBoundingClientRect().bottom + window.scrollY);
    await page.setViewportSize({ width: larg, height: Math.ceil(fim + 500) });
    await page.evaluate(() => window.scrollTo(0, 0));
    await espera(400);
  }
  if (posicao === 'fora') { await page.evaluate(() => window.scrollTo(0, document.getElementById('o-conversa').getBoundingClientRect().top + window.scrollY - 80)); await espera(300); }   /* a conversa no alto: a base da mesa fica abaixo da tela (a posição "fora" não depende de onde o foco da caixa deixou a rolagem) */
  const antes = await page.evaluate(() => ({ t: Math.round(performance.now()), ls: window.__ls.length, longas: window.__longas.length }));
  ultimoAtraso = true;
  await turno(page, textos[textos.length - 1]);
  await espera(9000);
  let viaGesto = null;
  if (posicao === 'dentro') {
    const escondida = await page.evaluate(() => document.getElementById('o-planta').hidden);
    await page.mouse.click(2, 2);   /* o gesto da pessoa: o módulo insere a faixa que esperava */
    await espera(1500);
    viaGesto = { esperava: escondida, inseriu: await page.evaluate(() => !document.getElementById('o-planta').hidden) };
  }
  const r = await page.evaluate((a) => {
    const f = document.getElementById('o-planta');
    const quadro = document.querySelector('.plv-quadro');
    const recursos = performance.getEntriesByType('resource').map((e) => e.name.split('/').pop().split('?')[0]).filter((n) => /planta-(forma|pecas|layout|desenho)/.test(n));
    return {
      ls: window.__ls.slice(a.ls).filter((x) => x.t >= a.t - 5), longas: window.__longas.slice(a.longas).filter((x) => x.t >= a.t),
      faixaVisivel: !!f && !f.hidden, nos: quadro ? quadro.querySelectorAll('*').length : 0, alturaFaixa: f && !f.hidden ? Math.round(f.getBoundingClientRect().height) : 0,
      botoes: document.querySelectorAll('.plv-ver').length, recursos, primeiroTitulo: (document.querySelector('.plv-lista li:nth-child(2) .plv-tit') || {}).textContent || null,
      larguraDoc: document.documentElement.scrollWidth, larguraJanela: window.innerWidth
    };
  }, antes);
  await ctx.close();
  const conta = (lista, com) => +lista.filter((x) => com || !x.recente).reduce((s, x) => s + x.v, 0).toFixed(6);
  const tbt = r.longas.reduce((s, x) => s + Math.max(0, x.ms - 50), 0);
  /* o CLS que é DA planta: só os deslocamentos em que algum nó que se moveu é da faixa (#o-planta, plv-) ou do botão do chat; o resto é a página de sempre (por exemplo o bloco de contato, que aparece com a resposta do Zero também com a flag desligada) */
  const daPlanta = r.ls.filter((x) => !x.recente && x.fontes.some((n) => /plv|o-planta/.test(n)));
  return { cls: conta(r.ls, false), clsPlanta: conta(daPlanta, false), clsBruto: conta(r.ls, true), deslocamentos: r.ls, longas: r.longas, tbt, maiorTarefa: r.longas.reduce((m, x) => Math.max(m, x.ms), 0), faixaVisivel: r.faixaVisivel, nos: r.nos, alturaFaixa: r.alturaFaixa,
    botoes: r.botoes, recursos: r.recursos, primeiroTitulo: r.primeiroTitulo, viaGesto, erros, rolagemLateral: r.larguraDoc > r.larguraJanela + 1 };
}

/* bytes do JS e do CSS da planta (o que o navegador baixa só com a planta), com gzip -9 e brotli; e a distância preço -> botão do formulário */
function bytes() {
  const arquivos = ['js/orcamento-planta-forma.js', 'js/planta-pecas.js', 'js/planta-layout.js', 'js/planta-desenho.js', 'js/orcamento-planta.js', 'css/orcamento-planta.css'];
  const linhas = arquivos.map((f) => { const b = readFileSync(new URL('../' + f, import.meta.url)); return { f, cru: b.length, gzip9: gzipSync(b, { level: 9 }).length, brotli: brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length }; });
  const soma = (pred, k) => linhas.filter((l) => pred(l.f)).reduce((s, l) => s + l[k], 0);
  return { arquivos: linhas, desenho3: { gzip9: soma((f) => /planta-(pecas|layout|desenho)/.test(f), 'gzip9'), brotli: soma((f) => /planta-(pecas|layout|desenho)/.test(f), 'brotli') },
    jsDaFaixa: { gzip9: soma((f) => f.endsWith('.js') && f !== 'js/orcamento-planta.js', 'gzip9'), brotli: soma((f) => f.endsWith('.js') && f !== 'js/orcamento-planta.js', 'brotli') },
    jsTotal: { gzip9: soma((f) => f.endsWith('.js'), 'gzip9'), brotli: soma((f) => f.endsWith('.js'), 'brotli') }, css: { gzip9: soma((f) => f.endsWith('.css'), 'gzip9'), brotli: soma((f) => f.endsWith('.css'), 'brotli') } };
}
async function distancias(larg, alt) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: larg < 500, hasTouch: larg < 500, extraHTTPHeaders: { 'x-forwarded-for': '10.7.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250)) } });
  const page = await ctx.newPage();
  await page.goto(ON + '/orcamento', { waitUntil: 'load' });
  await perguntas(page); await page.click('#o-conversar');
  for (const t of TEXTOS.boa) await turno(page, t);
  await espera(1500);
  const r = await page.evaluate(() => {
    document.getElementById('o-contato').hidden = false;   /* só para medir a geometria: o formulário aparece depois do pacote gravado */
    const y = (el) => el.getBoundingClientRect().top + window.scrollY, fundo = (el) => el.getBoundingClientRect().bottom + window.scrollY;
    const preco = document.getElementById('o-est'), botao = document.querySelector('#o-detalhes-form button[type=submit]'), faixa = document.getElementById('o-planta'), contato = document.getElementById('o-contato');
    const A = y(botao) - fundo(preco), H = innerHeight, alturaFaixa = Math.round(faixa.getBoundingClientRect().height);
    contato.parentNode.insertBefore(faixa, contato.nextSibling);   /* posição B: a faixa DEPOIS do formulário */
    const B = y(botao) - fundo(preco);
    return { A: Math.round(A), B: Math.round(B), alturaFaixa, janela: H, A_em_telas: +(A / H).toFixed(2), B_em_telas: +(B / H).toFixed(2) };
  });
  await ctx.close();
  return r;
}

const nav = await chromium.launch({ executablePath: EXEC });
const resultado = { quando: new Date().toISOString(), cpu: CPU, variante: VARIANTE, rodadas: RODADAS, bytes: bytes(), casos: [], distancias: [] };
console.log('bytes (gzip -9 / brotli):', JSON.stringify(resultado.bytes.arquivos.map((a) => [a.f, a.gzip9, a.brotli])), '\n  desenho (3 módulos):', JSON.stringify(resultado.bytes.desenho3), ' js da faixa (forma + 3):', JSON.stringify(resultado.bytes.jsDaFaixa), ' js total com a ligação:', JSON.stringify(resultado.bytes.jsTotal), ' css:', JSON.stringify(resultado.bytes.css));
if (tem('bytes')) {
  for (const l of LARGURAS) { const d = await distancias(l, altura(l)); resultado.distancias.push({ larg: l, ...d }); console.log('distância preço -> botão do formulário em ' + l + ' px: A (faixa antes) ' + d.A + ' px = ' + d.A_em_telas + ' tela(s); B (faixa depois) ' + d.B + ' px = ' + d.B_em_telas + ' tela(s); faixa ' + d.alturaFaixa + ' px; janela ' + d.janela + ' px'); }
  await nav.close(); writeFileSync(SAIDA, JSON.stringify(resultado, null, 2)); process.exit(0);
}
/* aquecimento: não entra na conta */
await rodada({ base: ON, larg: LARGURAS[0], alt: altura(LARGURAS[0]), nicho: NICHOS[0], posicao: 'fora', cpu: CPU, variante: VARIANTE }).catch((e) => console.log('aquecimento falhou:', e.message));
for (const larg of LARGURAS) for (const nicho of NICHOS) for (const posicao of POSICOES) {
  const por = { ligada: [], desligada: [] };
  const fila = [];
  for (let i = 0; i < RODADAS; i++) for (const flag of SO_LIGADA ? ['ligada'] : (i % 2 ? ['desligada', 'ligada'] : ['ligada', 'desligada'])) fila.push(flag);
  const trabalhadores = Array.from({ length: Math.max(1, PARALELO) }, async () => {
    for (let flag = fila.shift(); flag; flag = fila.shift()) {
      try { por[flag].push(await rodada({ base: flag === 'ligada' ? ON : OFF, larg, alt: altura(larg), nicho, posicao, cpu: CPU, variante: VARIANTE })); }
      catch (e) { console.log('rodada falhou (' + [larg, nicho, posicao, flag].join(' ') + '): ' + e.message.split('\n')[0]); }
    }
  });
  await Promise.all(trabalhadores);
  const col = (flag, k) => por[flag].map((x) => x[k]);
  const caso = { larg, nicho, posicao, ligada: por.ligada, desligada: por.desligada,
    resumo: { clsLigada: mediana(col('ligada', 'cls')), clsDesligada: mediana(col('desligada', 'cls')), clsMaxLigada: Math.max(0, ...col('ligada', 'cls')), clsPlantaMax: Math.max(0, ...col('ligada', 'clsPlanta')), clsBrutoLigada: mediana(col('ligada', 'clsBruto')),
      tbtLigada: mediana(col('ligada', 'tbt')), tbtDesligada: mediana(col('desligada', 'tbt')), maiorLigada: mediana(col('ligada', 'maiorTarefa')), maiorDesligada: mediana(col('desligada', 'maiorTarefa')),
      faixaApareceu: por.ligada.filter((x) => x.faixaVisivel).length + '/' + por.ligada.length, desligadaSemFaixa: por.desligada.every((x) => !x.faixaVisivel && x.botoes === 0 && x.recursos.length === 0), nos: mediana(col('ligada', 'nos')), titulo: por.ligada[0] && por.ligada[0].primeiroTitulo } };
  caso.resumo.deltaCls = +((caso.resumo.clsLigada || 0) - (caso.resumo.clsDesligada || 0)).toFixed(6);
  resultado.casos.push(caso);
  const s = caso.resumo;
  console.log(`${String(larg).padStart(4)} ${nicho.padEnd(10)} ${posicao.padEnd(6)} CLS lig ${s.clsLigada} (máx ${s.clsMaxLigada}, bruto ${s.clsBrutoLigada}; da planta ${s.clsPlantaMax}) deslig ${s.clsDesligada} delta ${s.deltaCls} ${Math.abs(s.deltaCls) <= 0.01 ? 'ok' : 'ACIMA'} | TBT med lig ${s.tbtLigada} deslig ${s.tbtDesligada}; maior tarefa lig ${s.maiorLigada} deslig ${s.maiorDesligada} | faixa ${s.faixaApareceu}, nós ${s.nos}, deslig sem nada baixado: ${s.desligadaSemFaixa}`);
  const erros = [].concat(...por.ligada.map((x) => x.erros), ...por.desligada.map((x) => x.erros));
  if (erros.length) console.log('   erros/avisos:', [...new Set(erros)].slice(0, 4).join(' | '));
  writeFileSync(SAIDA, JSON.stringify(resultado, null, 2));
}
await nav.close();
writeFileSync(SAIDA, JSON.stringify(resultado, null, 2));
const acima = resultado.casos.filter((c) => Math.abs(c.resumo.deltaCls) > 0.01);
console.log(acima.length ? '\n' + acima.length + ' caso(s) com delta de CLS acima de 0,01.' : '\nTodos os casos com delta de CLS <= 0,01.');
