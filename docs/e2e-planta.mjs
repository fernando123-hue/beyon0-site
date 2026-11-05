/* E2E DA PLANTA NA PÁGINA DE ORÇAMENTO (PR 2c) num Chromium de verdade, contra o servidor local com a IA simulada. Roda as DUAS pontas da flag BZ_PLANTA:
     node docs/servidor.mjs . 8931                           (flag ligada: padrão do servidor local)
     BZ_PLANTA_LOCAL=desligada node docs/servidor.mjs . 8932 (flag desligada: a página de hoje)
     CHROMIUM=... node docs/e2e-planta.mjs [8931] [8932]
   Ligada: a conversa vai até a planta (turno 1 estima, turno 2 leva o gatilho "planta-boa" da IA simulada); a faixa nasce fora da tela, o botão "Ver a planta do seu site"
   fica sob a fala do Zero e SOBREVIVE a um turno novo, "Está certo" manda UMA mensagem, "Quero ajustar" só foca a caixa, o ajuste (estado de uma 2ª versão, forjado na
   rede porque a IA simulada só tem um plano) marca só o id novo, preço fechado desliga os botões, a faixa à vista espera o gesto. Desligada: nada aparece, nenhum módulo
   da planta é baixado, a conversa é a de sempre. Cada rodada cria sessões no freio local (8 por 10 min por IP): o script manda um IP novo por rodada. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ON = 'http://127.0.0.1:' + (process.argv[2] || '8931'), OFF = 'http://127.0.0.1:' + (process.argv[3] || '8932');
const EXEC = process.env.CHROMIUM || (process.env.LOCALAPPDATA + '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
const PASTA = new URL('./olhar-planta/', import.meta.url);
await mkdir(PASTA, { recursive: true });
const foto = (page, nome) => page.screenshot({ path: fileURLToPath(new URL(nome + '.png', PASTA)) });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHOU ') + msg); if (!cond) falhou = true; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + Math.floor(Math.random() * 250) + '.' + (1 + Math.floor(Math.random() * 250));
const MODULOS = /\/(orcamento-planta-forma|planta-pecas|planta-layout|planta-desenho)\.js/;
const nav = await chromium.launch({ executablePath: EXEC });

async function abrir(base, { larg = 390, alt = 844 } = {}) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, isMobile: larg < 500, hasTouch: larg < 500, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const page = await ctx.newPage();
  const baixados = [], erros = [];
  page.on('request', (r) => { if (MODULOS.test(r.url()) || /orcamento-planta\.css/.test(r.url())) baixados.push(r.url().split('/').pop()); });
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /planta|beyon/.test(m.text()))) erros.push(m.text()); });
  page.on('dialog', (d) => { erros.push('diálogo: ' + d.message()); d.dismiss(); });
  await page.goto(base + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#o-perguntas:not([hidden])');
  await page.click('[data-ramo="saude"]'); await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]'); await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]'); await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 20000 });
  await page.click('#o-conversar');
  return { ctx, page, baixados, erros };
}
async function turno(page, texto) {
  const n = await page.locator('#o-log .msg--agente').count();
  await page.fill('#o-texto', texto);
  await page.press('#o-texto', 'Enter');
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--agente').length > k, n, { timeout: 40000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  await espera(300);
}
const lateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const T1 = 'Tenho uma clínica odontológica e quero mais agendamentos, preciso de um site institucional';

/* ---------- flag LIGADA ---------- */
console.log('\n== flag ligada (' + ON + ') ==');
{
  const { ctx, page, baixados, erros } = await abrir(ON);
  await turno(page, T1);
  ok(await page.locator('#o-planta').isHidden() && baixados.length === 0, 'antes da planta: a faixa está escondida e nenhum módulo da planta foi baixado (' + baixados.join(',') + ')');
  await turno(page, 'planta-boa pode desenhar');
  await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro', { timeout: 15000 });
  ok(baixados.filter((b) => MODULOS.test('/' + b)).length === 4 && baixados.includes('orcamento-planta.css'), 'os 4 módulos e o CSS foram baixados, uma vez cada: ' + baixados.join(','));
  ok(await page.locator('.plv-ver').count() === 1, 'o botão "Ver a planta do seu site" aparece uma vez');
  ok((await page.evaluate(() => document.querySelector('.plv-ver').closest('li').textContent)).includes('Desenhei o seu site em planta'), 'o botão está dentro da fala do Zero que trouxe a planta');
  ok(await lateral(page), 'celular com a faixa: sem rolagem lateral');
  ok(await page.evaluate(() => document.querySelectorAll('.plv-lista li').length) >= 9, 'a lista de etapas tem as caixas da planta');
  ok(await page.evaluate(() => [...document.querySelectorAll('.plv-lista li .plv-sr')].every((s) => s.textContent.length > 10)), 'cada etapa leva a frase para o leitor de tela');
  const topoAntes = await page.evaluate(() => Math.round(document.getElementById('o-planta').getBoundingClientRect().top));
  ok(topoAntes > 700, 'a faixa nasceu fora da área visível (topo em ' + topoAntes + ' px, janela de 844)');
  ok(await page.evaluate(() => { const f = document.getElementById('o-planta'); return f.parentNode.lastElementChild === f && f.parentNode.tagName === 'MAIN' && f.getBoundingClientRect().top >= document.querySelector('.orc-mesa').getBoundingClientRect().bottom; }), 'a faixa é a última seção do <main>, depois da mesa (posição B)');
  await page.click('.plv-ver');
  await espera(900);
  const aposToque = await page.evaluate(() => ({ topo: Math.round(document.getElementById('o-planta').getBoundingClientRect().top), foco: document.activeElement.className }));
  ok(aposToque.topo < 200 && aposToque.topo > 0, 'tocar no botão leva a faixa ao topo da tela, abaixo do menu fixo (topo em ' + aposToque.topo + ' px)');
  ok(aposToque.foco.includes('plv-titulo'), 'e o foco vai para o título da faixa');
  await espera(9000);
  await foto(page, 'ligada-390-planta');
  /* um turno novo refaz a lista: o botão e a faixa continuam, sem duplicar */
  await page.evaluate(() => window.scrollTo(0, 0));
  await turno(page, 'E o prazo, como fica?');
  ok(await page.locator('.plv-ver').count() === 1 && await page.locator('#o-planta .plv').count() === 1 && await page.locator('#o-planta:not([hidden])').count() === 1, 'depois de um turno novo: um botão, uma faixa');
  ok((await page.evaluate(() => document.querySelector('.plv-ver').closest('li').textContent)).includes('Desenhei o seu site em planta'), 'o botão segue sob a fala da versão (a lista foi refeita)');
  /* Quero ajustar: só foca */
  const antes = await page.locator('#o-log .msg--visitante').count();
  await page.locator('.plv-btn', { hasText: 'Quero ajustar algo' }).click();
  ok(await page.evaluate(() => document.activeElement.id === 'o-texto' && document.getElementById('o-texto').placeholder === 'Diga o que mudar na planta.'), '"Quero ajustar algo" foca a caixa com a dica');
  ok(await page.waitForFunction(() => { const r = document.getElementById('o-texto').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }, null, { timeout: 4000 }).then(() => true, () => false), '"Quero ajustar algo" traz a caixa de texto de volta para dentro da tela (a faixa fica longe da conversa)');
  ok(await page.locator('#o-log .msg--visitante').count() === antes, '"Quero ajustar algo" não envia nada');
  /* Está certo: uma mensagem */
  await page.locator('.plv-btn', { hasText: 'Está certo' }).click();
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--visitante').length > k, antes, { timeout: 20000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  ok(await page.locator('#o-log .msg--visitante').count() === antes + 1, '"Está certo" manda exatamente uma mensagem');
  ok((await page.locator('#o-log .msg--visitante').last().textContent()).trim() === 'A planta está certa.', 'e é "A planta está certa."');
  await page.locator('.plv-btn', { hasText: 'Está certo' }).click();
  await espera(600);
  ok(await page.locator('#o-log .msg--visitante').count() === antes + 1, 'clicar de novo na mesma versão não manda outra');
  ok(await page.locator('.plv-ver').count() === 1 && await page.locator('#o-planta:not([hidden])').count() === 1, 'a planta continua depois do "Está certo" (o Zero não redesenha)');
  ok(erros.length === 0, 'nenhum erro nem aviso no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

/* ---------- o ajuste: uma 2ª versão no estado (forjada na rede) marca só o id novo; preço fechado desliga os botões ---------- */
console.log('\n== ajuste e preço fechado (estado forjado na rede) ==');
{
  const { ctx, page, erros } = await abrir(ON);
  await turno(page, T1);
  await turno(page, 'planta-boa pode desenhar');
  await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro');
  let modo = null;
  await page.route('**/api/vendas?acao=estado*', async (r) => {
    const resp = await r.fetch(); const j = await resp.json();
    if (modo && j.planta) {
      if (modo === 'ajuste') {
        const p = JSON.parse(JSON.stringify(j.planta.plano));
        p.etapas.splice(2, 0, Object.assign({}, p.etapas[0], { id: 'sinal1', titulo: 'Sinal para segurar o horário', frase: 'A pessoa paga um sinal para garantir o horário.' }));
        p.etapas = p.etapas.slice(0, 8);
        j.planta = { versao: j.planta.versao + 1, origem: 'modelo', n_mensagens: j.mensagens.length - 1, plano: p };
      } else if (modo === 'fechado') j.planta_editavel = false;
    }
    r.fulfill({ response: resp, body: JSON.stringify(j) });
  });
  modo = 'ajuste';
  await turno(page, 'Quero cobrar um sinal');
  await page.waitForSelector('#o-planta .plv-lista li.is-ajustado', { timeout: 15000 });
  const novos = await page.evaluate(() => [...document.querySelectorAll('.plv-lista li.is-ajustado')].map((l) => l.dataset.id));
  ok(JSON.stringify(novos) === '["sinal1"]', 'o ajuste marca só o id novo: ' + novos.join(','));
  ok(await page.locator('.plv-ver').count() === 1, 'o botão passou para a fala da versão nova (um só)');
  ok((await page.evaluate(() => document.querySelector('.plv-ver').closest('li').textContent)).length > 0 && await page.evaluate(() => document.querySelector('.plv-ver').closest('li') === [...document.querySelectorAll('#o-log .msg--agente')].pop()), 'e está sob a última fala do Zero');
  await espera(9000);
  await foto(page, 'ligada-390-ajuste');
  modo = 'fechado';
  await turno(page, 'Entendi, obrigado');
  await espera(500);
  const botoes = await page.evaluate(() => [...document.querySelectorAll('.plv-btn')].slice(0, 2).map((b) => b.disabled || b.hasAttribute('disabled')));
  ok(botoes.length === 2 && botoes.every(Boolean), 'planta_editavel false: "Está certo" e "Quero ajustar algo" desligados');
  ok(await page.locator('#o-planta:not([hidden]) .plv-quadro').count() === 1, 'e a planta segue visível');
  const n = await page.locator('#o-log .msg--visitante').count();
  await page.locator('.plv-btn').first().click({ force: true }).catch(() => {});
  await espera(500);
  ok(await page.locator('#o-log .msg--visitante').count() === n, 'clicar no botão desligado não envia nada');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

/* ---------- "Está certo" só gasta a versão quando o envio entrou (achado 1 das revisões) ---------- */
console.log('\n== "Está certo" com a conversa ocupada e com a rede caindo ==');
{
  const { ctx, page, erros } = await abrir(ON);
  await turno(page, T1);
  await turno(page, 'planta-boa pode desenhar');
  await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro');
  const visitantes = () => page.locator('#o-log .msg--visitante').count();
  const base = await visitantes();
  /* (a) conversa ocupada: uma mensagem normal segura o envio por 2,5 s; o clique em "Está certo" nesse meio tempo não manda nada e não gasta a versão */
  await page.route('**/api/vendas?acao=mensagem*', async (r) => { await espera(2500); r.continue(); });
  await page.fill('#o-texto', 'E o prazo, como fica?'); await page.press('#o-texto', 'Enter');
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--visitante').length > k, base);
  await page.locator('.plv-btn', { hasText: 'Está certo' }).click();
  await espera(300);
  ok(await visitantes() === base + 1, 'com a conversa ocupada, "Está certo" não manda nada (só a mensagem que já estava indo)');
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  await page.unroute('**/api/vendas?acao=mensagem*');
  await page.locator('.plv-btn', { hasText: 'Está certo' }).click();
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--visitante').length > k, base + 1, { timeout: 20000 });
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 40000 });
  ok(await visitantes() === base + 2 && (await page.locator('#o-log .msg--visitante').last().textContent()).trim() === 'A planta está certa.', 'a versão não foi gasta pelo clique recusado: o clique seguinte manda "A planta está certa."');
  await page.locator('.plv-btn', { hasText: 'Está certo' }).click(); await espera(500);
  ok(await visitantes() === base + 2, 'e agora, aceito, a versão está gasta: outro clique não manda');
  ok(erros.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length === 0, 'nenhum erro de página' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}
{
  const { ctx, page } = await abrir(ON);
  await turno(page, T1);
  await turno(page, 'planta-boa pode desenhar');
  await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro');
  const visitantes = () => page.locator('#o-log .msg--visitante').count();
  const base = await visitantes();
  /* (b) a rede cai no envio: o texto volta à caixa e a versão fica livre; com a rede de volta o botão manda */
  let derrubar = true;
  await page.route('**/api/vendas?acao=mensagem*', (r) => (derrubar ? r.abort('failed') : r.continue()));
  await page.locator('.plv-btn', { hasText: 'Está certo' }).click();
  await page.waitForFunction(() => !document.getElementById('o-pensando') || document.getElementById('o-pensando').hidden, null, { timeout: 40000 });
  await espera(1500);
  ok(await visitantes() === base, 'a rede caiu: nenhuma mensagem fica na conversa');
  ok(await page.inputValue('#o-texto') === 'A planta está certa.', 'e o texto voltou à caixa (o aviso da tela oferece tentar de novo)');
  derrubar = false;
  await page.fill('#o-texto', '');
  await page.locator('.plv-btn', { hasText: 'Está certo' }).click();
  await page.waitForFunction((k) => document.querySelectorAll('#o-log .msg--visitante').length > k, base, { timeout: 20000 });
  ok(await visitantes() === base + 1, 'a rede voltou: "Está certo" manda de novo (a versão não foi gasta pela falha)');
  await ctx.close();
}

/* ---------- 320 px e a faixa à vista ---------- */
/* ---------- enviar o formulário com a faixa à vista logo abaixo do botão (achado da medida do 2c-B) ---------- */
console.log('\n== enviar o formulário com a faixa abaixo do botão ==');
{
  const { ctx, page, erros } = await abrir(ON);
  await turno(page, T1);
  await turno(page, 'planta-boa pode desenhar');
  await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro');
  await page.fill('#o-d-negocio', 'Clínica Teste'); await page.fill('#o-d-vende', 'Consultas');
  await page.fill('#o-tel', '(21) 9' + String(1000 + Math.floor(Math.random() * 9000)) + '-' + String(1000 + Math.floor(Math.random() * 9000))); await page.check('#o-aceite');
  const botao = page.locator('#o-detalhes-form button[type=submit]');
  await botao.scrollIntoViewIfNeeded(); await espera(400);
  const visivel = await page.evaluate(() => { const q = document.getElementById('o-planta').getBoundingClientRect(); return Math.round(Math.min(innerHeight, q.bottom) - Math.max(0, q.top)); });
  ok(visivel > 100, 'antes do envio a faixa está à vista logo abaixo do botão (' + visivel + ' px)');
  await page.evaluate(() => { window.__ls2 = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ls2.push([e.value, e.hadRecentInput, (e.sources || []).map((s) => s.node && (s.node.id || s.node.className)).join('+')]))).observe({ type: 'layout-shift', buffered: false }); });
  await botao.click();
  await page.waitForFunction(() => document.getElementById('o-planta').hidden, null, { timeout: 3000 }).then(() => ok(true, 'ao enviar, a faixa se recolhe na hora'), () => ok(false, 'ao enviar, a faixa se recolhe na hora'));
  await espera(6000);
  const cls = await page.evaluate(() => window.__ls2.filter((x) => !x[1] && /plv|o-planta/.test(x[2])).reduce((s, x) => s + x[0], 0));
  ok(cls === 0, 'a troca do bloco de cima não desloca a faixa (CLS da planta ' + cls + ')');
  ok(await page.locator('#o-planta .plv-quadro').count() === 1, 'a faixa segue montada (só estava recolhida), sem erro: ' + erros.join(' | '));
  ok(erros.filter((e) => !/status of 503/.test(e)).length === 0, 'nenhum erro no console (o 503 da geração dos modelos, sem IA configurada no servidor local, é do servidor e não da página)');
  await ctx.close();
}

console.log('\n== 320 px ==');
{
  const { ctx, page, erros } = await abrir(ON, { larg: 320, alt: 640 });
  await turno(page, T1);
  await turno(page, 'planta-boa pode desenhar');
  await page.waitForSelector('#o-planta:not([hidden]) .plv-quadro');
  ok(await lateral(page), '320 px com a faixa: sem rolagem lateral');
  await page.click('.plv-ver'); await espera(10000);
  await foto(page, 'ligada-320-planta');
  ok(await lateral(page), '320 px depois de tocar no botão: sem rolagem lateral');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}
console.log('\n== faixa à vista (janela alta): espera o gesto ==');
{
  const { ctx, page } = await abrir(ON, { larg: 390, alt: 844 });
  await turno(page, T1);
  const fim = await page.evaluate(() => document.querySelector('.orc-mesa').getBoundingClientRect().bottom + window.scrollY);
  /* a janela alta cobre a mesa E o formulário #o-contato (a faixa vem depois dele e ele aparece com a resposta do Zero: cerca de 1.700 px): a posição da faixa fica à vista */
  await page.setViewportSize({ width: 390, height: Math.ceil(fim + 2200) });
  await page.evaluate(() => window.scrollTo(0, 0)); await espera(300);
  await turno(page, 'planta-boa pode desenhar');
  await espera(1500);
  ok(await page.locator('#o-planta').isHidden(), 'com a mesa inteira à vista a faixa NÃO é inserida sozinha');
  ok(await page.locator('.plv-ver').count() === 1, 'mas o botão do chat está lá');
  await page.mouse.click(2, 2); await espera(800);
  ok(await page.locator('#o-planta:not([hidden]) .plv-quadro').count() === 1, 'o gesto seguinte da pessoa insere a faixa');
  await foto(page, 'ligada-390-alta-apos-gesto');
  await ctx.close();
}

/* ---------- flag DESLIGADA ---------- */
console.log('\n== flag desligada (' + OFF + ') ==');
{
  const { ctx, page, baixados, erros } = await abrir(OFF);
  await turno(page, T1);
  await turno(page, 'planta-boa pode desenhar');
  await turno(page, 'Pode seguir');
  await espera(1500);
  ok(await page.locator('#o-planta').isHidden(), 'a faixa fica escondida');
  ok(await page.locator('.plv-ver').count() === 0 && await page.locator('#o-planta *').count() === 0, 'nenhum botão e nada dentro da faixa');
  ok(baixados.length === 0, 'nenhum módulo da planta nem o CSS foi baixado');
  ok(await page.evaluate(() => !window.BZPlanta && !window.BZPlantaForma), 'os módulos nem existem na página');
  ok(await page.locator('#o-log .msg--agente').count() >= 4 && await lateral(page), 'a conversa segue normal, sem rolagem lateral');
  await foto(page, 'desligada-390-conversa');
  ok(erros.length === 0, 'nenhum erro no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();
}

await nav.close();
console.log(falhou ? '\nE2E DA PLANTA: FALHOU' : '\nE2E da planta: tudo ok. Capturas em docs/olhar-planta/');
process.exit(falhou ? 1 : 0);
