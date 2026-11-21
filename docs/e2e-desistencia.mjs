/* ==========================================================================
   E2E DA DESISTÊNCIA PELO CLIENTE (20/11) num Chromium de verdade, contra o servidor local de verdade (docs/servidor.mjs: banco PGlite, IA e
   Mercado Pago simulados, CSP como na Cloudflare). Nenhuma chamada real ao Mercado Pago.
   O pedido nasce por HTTP (a mesma API que a tela usa): sessão, pacote, detalhes, modelos entregues pelo painel, escopo, entrada paga pelo simulador.
   Depois, no celular (390 px):
     1. a tela do pedido tem SÓ o link discreto: nenhuma palavra de reembolso/devolução, nenhum botão que devolve;
     2. o toque no link abre o painel calmo (captura); "Voltar" fecha e o servidor não é chamado;
     3. o segundo botão devolve a entrada (UMA vez), o fim do pedido diz "Pedido cancelado" e o simulador mostra a order estornada.
   Uso:  node docs/e2e-desistencia.mjs   (CHROMIUM=<caminho do chrome-headless-shell>, PORTA=8897; sobe e derruba o próprio servidor)
   ========================================================================== */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { modelo } from './testes/_ajustes.mjs';

const PORTA = Number(process.env.PORTA || 8897);
const BASE = 'http://127.0.0.1:' + PORTA;
const CHAVE = 'k'.repeat(40);
const PASTA = new URL('./olhar-desistencia/', import.meta.url);
await mkdir(PASTA, { recursive: true });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };

const servidor = spawn(process.execPath, [fileURLToPath(new URL('./servidor.mjs', import.meta.url)), fileURLToPath(new URL('../', import.meta.url)), String(PORTA)],
  { env: { ...process.env, PAINEL_CHAVE: CHAVE, BZ_SEM_CONSULTOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const saida = [];
servidor.stdout.on('data', d => saida.push(String(d))); servidor.stderr.on('data', d => saida.push(String(d)));
const encerrar = () => { try { servidor.kill(); } catch { /* já saiu */ } };
process.on('exit', encerrar);
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(BASE + '/api/vendas?acao=pagamento-config')).ok) break; } catch { /* ainda subindo */ }
  await new Promise(r => setTimeout(r, 300));
  if (i === 99) { console.error('o servidor local não subiu:\n' + saida.join('')); process.exit(2); }
}

const IP = '203.0.113.' + (10 + Math.floor(Math.random() * 200));
const api = async (metodo, acao, corpo, token, rota = 'vendas', query = '') => {
  const r = await fetch(BASE + '/api/' + rota + '?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { 'x-forwarded-for': IP, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const painel = async corpo => {
  const r = await fetch(BASE + '/api/painel', { method: 'POST', body: JSON.stringify(corpo), headers: { authorization: 'Bearer ' + CHAVE, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9' } });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const exigir = (r, msg) => { if (r.status !== 200) throw new Error(msg + ': ' + r.status + ' ' + JSON.stringify(r.corpo)); return r.corpo; };

/* ---------- o pedido, com a entrada paga ---------- */
const RESP = { ramo: 'beleza', cidade: 'Niterói', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };
const sessao = exigir(await api('POST', 'sessao', {}), 'sessao');
const T = sessao.token, c = sessao.conversa_id;
const s = exigir(await api('POST', 'simular', { conversa_id: c, respostas: RESP }, T), 'simular');
exigir(await api('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.versao }, T), 'confirmar-pacote');
const telefone = '(21) 9' + String(1000 + Math.floor(Math.random() * 9000)) + '-' + String(1000 + Math.floor(Math.random() * 9000));
exigir(await api('POST', 'detalhes', { conversa_id: c, negocio: 'Clínica Exemplo', vende: 'Aulas de pilates', telefone, nome: 'Ana Souza', aceite: true, aceite_versao: 'a1' }, T), 'detalhes');
const dirs = (await api('GET', 'estado', undefined, T, 'vendas', '&conversa=' + c)).corpo.direcoes;
for (const d of dirs) exigir(await painel({ entregar_direcao: d.id, conteudo: modelo(d.numero) }), 'entregar modelo ' + d.numero);
exigir(await api('POST', 'escolher', { conversa_id: c, direcao_id: dirs.find(d => d.numero === 1).id }, T), 'escolher');
const esc = exigir(await api('POST', 'escopo', { conversa_id: c }, T), 'escopo');
exigir(await api('POST', 'confirmar', { conversa_id: c, proposta_id: esc.proposta_id, confirmo: true, inicio_imediato: true }, T), 'confirmar');
const pg = exigir(await api('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '52998224725' } }, T), 'pagar');
exigir(await api('POST', 'simular', { tentativa_id: pg.tentativa.id }, undefined, 'pagamentos'), 'pagar o Pix no simulador');
const antes = (await api('GET', 'estado', undefined, T, 'vendas', '&conversa=' + c)).corpo;
ok(antes.conversa.etapa === 'em_producao' && antes.entrega && antes.entrega.pode_desistir === true, 'o servidor diz que dá para desistir (entrega.pode_desistir)');

/* ---------- o navegador, no celular ---------- */
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-forwarded-for': IP } });
  await ctx.addInitScript(([chave, valor]) => { try { localStorage.setItem(chave, valor); } catch (e) { /* sem armazenamento */ } },
    ['bz-orcamento', JSON.stringify({ token: sessao.token, refresh: sessao.refresh, expira_em: sessao.expira_em, conversa_id: c })]);
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) erros.push(m.text()); });
  page.on('pageerror', e => erros.push(String(e)));
  const refunds = [];
  page.on('request', r => { if (r.method() === 'POST' && /acao=desistir/.test(r.url())) refunds.push(r.url()); });
  const foto = nome => page.screenshot({ path: fileURLToPath(new URL(nome + '.png', PASTA)) });
  const semRolagem = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
  await page.waitForSelector('#o-pedido:not([hidden])', { timeout: 45000 });
  await page.waitForSelector('#o-desiste:not([hidden]) .orc-desiste__abrir', { timeout: 15000 });

  /* 1. a tela principal: só o link discreto */
  const principal = await page.evaluate(() => document.body.innerText);
  ok(!/reembols|devolu|estorn/i.test(principal), 'a tela do pedido NÃO diz reembolso, devolução nem estorno');
  ok(await page.locator('#o-desiste-confirmar').count() === 0, 'o botão que devolve a entrada NÃO existe na página');
  ok((await page.textContent('#o-desiste')).trim() === 'Preciso desistir da compra', 'só o link "Preciso desistir da compra" no lugar da opção');
  const caixa = await page.locator('.orc-desiste__abrir').boundingBox();
  ok(caixa && caixa.height >= 44, 'o link tem alvo de toque de 44 px (' + Math.round(caixa ? caixa.height : 0) + ' px)');
  const corLink = await page.$eval('.orc-desiste__abrir', e => getComputedStyle(e).color + '|' + getComputedStyle(e).fontSize);
  console.log('[e2e-desistencia] estilo do link: ' + corLink);
  ok(await semRolagem(), 'celular: sem rolagem lateral');
  await page.evaluate(() => document.getElementById('o-desiste').scrollIntoView({ block: 'end', behavior: 'instant' }));
  await foto('1-link-cel');

  /* 2. o painel calmo; Voltar não chama o servidor */
  await page.click('.orc-desiste__abrir');
  await page.waitForSelector('#o-desiste-confirmar', { timeout: 5000 });
  const painelTxt = await page.textContent('.orc-desiste__painel');
  ok(/entrada volta pelo mesmo Pix/.test(painelTxt) && /pedido é cancelado/.test(painelTxt) && /apagado em até um dia/.test(painelTxt) && /site não vai ao ar/.test(painelTxt), 'o painel diz o que acontece');
  ok((await page.textContent('#o-desiste-confirmar')) === 'Confirmar desistência e devolver a entrada' && (await page.textContent('#o-desiste-voltar')) === 'Voltar', 'os dois botões, com as palavras combinadas');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'o-desiste-titulo', 'o foco foi para o título do painel');
  ok(await semRolagem(), 'celular com o painel aberto: sem rolagem lateral');
  await page.evaluate(() => document.getElementById('o-desiste').scrollIntoView({ block: 'end', behavior: 'instant' }));
  await foto('2-painel-cel');
  await page.click('#o-desiste-voltar');
  ok(await page.locator('.orc-desiste__painel').count() === 0 && refunds.length === 0, '"Voltar" fecha o painel e o servidor não foi chamado');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.className) === 'orc-desiste__abrir', 'o foco volta ao link');

  /* 3. o segundo botão devolve a entrada */
  await page.click('.orc-desiste__abrir');
  await page.waitForSelector('#o-desiste-confirmar');
  await page.click('#o-desiste-confirmar');
  await page.waitForSelector('#o-fim-encerrado:not([hidden])', { timeout: 60000 });
  ok(refunds.length === 1, 'o servidor foi chamado UMA vez (' + refunds.length + ')');
  ok((await page.textContent('#o-fim-encerrado-titulo')) === 'Pedido cancelado', 'o fim do pedido diz "Pedido cancelado"');
  ok(/A entrada volta pelo Pix; o prazo depende do seu banco\./.test(await page.textContent('#o-fim-desistiu')), 'e a frase combinada: a entrada volta pelo Pix, o prazo depende do banco');
  ok(await page.locator('#o-pedido').isHidden() && await page.locator('#o-desiste .orc-desiste__abrir').count() === 0, 'o pedido e a opção de desistir saíram da tela');
  ok(await semRolagem(), 'celular no fim: sem rolagem lateral');
  await page.evaluate(() => document.getElementById('o-fim').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await foto('3-cancelado-cel');
  const depois = (await api('GET', 'estado', undefined, T, 'vendas', '&conversa=' + c)).corpo;
  ok(depois.conversa.etapa === 'encerrada' && depois.entrega.passo === 'encerrada' && depois.entrega.desistiu === true, 'o servidor: pedido encerrado, desistência registrada');
  page.on('dialog', d => { console.log('[e2e-desistencia] diálogo: ' + d.type() + ' ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  await page.goto(BASE + '/orcamento', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#o-fim-encerrado:not([hidden])', { timeout: 30000 });
  ok((await page.textContent('#o-fim-encerrado-titulo')) === 'Pedido cancelado', 'recarregar continua em "Pedido cancelado"');
  ok(erros.length === 0, 'sem erro de console' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
  await ctx.close();
} finally { await nav.close(); encerrar(); }
console.log(falhou ? '\nE2E DA DESISTÊNCIA: FALHOU' : '\nE2E DA DESISTÊNCIA: tudo certo (capturas em docs/olhar-desistencia/)');
process.exit(falhou ? 1 : 0);
