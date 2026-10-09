/* ==========================================================================
   E2E do ORÇAMENTO COM IA (/orcamento) num Chromium de verdade, contra o
   servidor local (docs/servidor.mjs: banco PGlite, IA simulada, gateway
   simulado). Celular primeiro (390px), depois 320px e desktop.
   Cobre: conversa → investimento → contato → 3 direções → visor (abrir,
   trocar, aparelho, Escape devolve o foco) → escolha → ajuste → retomada
   depois de recarregar → escopo (exige a confirmação) → pagamento simulado
   → projeto em produção. E segurança na tela: texto com HTML vira texto.
   Uso: BASE=http://127.0.0.1:8899 CHROMIUM=... npm run e2e:orcamento
   ========================================================================== */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
/* só servidor local: contra um site de verdade este teste cria conversa, chama a IA paga e cria pedido de pagamento */
const hostDe = url => { try { return new URL(url).hostname; } catch { return null; } };
const origemDe = url => { try { return new URL(url).origin; } catch { return '(não é URL)'; } };   /* (sem usuário, senha nem query) */
if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostDe(BASE))) {
  console.error('Recusado: BASE precisa ser o servidor local (127.0.0.1, localhost ou [::1]), não "' + origemDe(BASE) + '". Ver docs/PROCESSO.md, passo 4.');
  process.exit(2);
}
const EXEC = process.env.CHROMIUM || undefined;
const PASTA = new URL('./olhar-orcamento/', import.meta.url);
await mkdir(PASTA, { recursive: true });
const nav = await chromium.launch({ executablePath: EXEC });
let falhou = false;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };
const semRolagemLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
/* diagnóstico: as últimas chamadas à API e o estado da tela aparecem quando o teste quebra */
let pagina = null;
const diario = [];
const foto = (page, nome) => page.screenshot({ path: fileURLToPath(new URL(nome + '.png', PASTA)) });   /* (pathname deixa %20 no caminho) */

try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  pagina = page;
  page.on('requestfinished', async r => { if (!r.url().includes('/api/')) return; const t = r.timing(); const resp = await r.response(); diario.push(`${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search} → ${resp ? resp.status() : '?'} em ${Math.round(t.responseEnd)} ms`); });
  page.on('requestfailed', r => { if (r.url().includes('/api/')) diario.push(`${r.method()} ${new URL(r.url()).pathname} → falhou: ${r.failure()?.errorText}`); });
  const erros = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', e => erros.push(String(e)));
  page.on('dialog', d => { erros.push('diálogo inesperado: ' + d.message()); d.dismiss(); });

  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  ok(await page.locator('h1').isVisible(), 'celular: título visível');
  ok(await semRolagemLateral(page), 'celular: sem rolagem lateral');
  ok(await page.evaluate(() => localStorage.getItem('bz-orcamento') === null), 'nenhuma sessão criada só por abrir a página');
  await foto(page, '1-inicio-cel');

  /* segurança na tela: HTML digitado aparece como texto */
  await page.fill('#o-texto', '<img src=x onerror=alert(1)> Tenho uma clínica odontológica e quero um site institucional para mais agendamentos');
  await page.press('#o-texto', 'Enter');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 30000 });
  ok(await page.locator('#o-log img').count() === 0, 'texto com HTML vira texto (nenhuma <img> criada)');
  const valor = await page.textContent('#o-est-valor');
  ok(/^R\$\s?\d/.test(valor.trim()), 'investimento vem do motor: ' + valor.trim());
  ok(await page.evaluate(() => document.querySelector('#o-etapas [aria-current]').dataset.passo) === 'estimativa', 'etapa atual: investimento');

  const antes = await page.locator('#o-log .msg--visitante').count();
  await page.fill('#o-texto', 'Sim, quero ver as propostas');
  await page.press('#o-texto', 'Enter');
  await page.press('#o-texto', 'Enter');   /* Enter repetido */
  await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 30000 });
  ok(await page.locator('#o-log .msg--visitante').count() === antes + 1, 'Enter repetido não manda dois turnos');
  await page.waitForSelector('#o-contato:not([hidden])', { timeout: 30000 });
  await page.fill('#o-nome', 'Teste E2E');
  await page.fill('#o-tel', '(21) 99999-0000');
  await page.click('#o-contato-form button[type=submit]');
  ok((await page.textContent('#o-contato-erro')).includes('concordar'), 'contato sem aceite: recusado com motivo');
  await page.check('#o-aceite');
  await page.click('#o-contato-form button[type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('.dir .dir__nome').length === 3, null, { timeout: 120000 });
  ok(true, '3 direções prontas');
  ok(await page.evaluate(() => [...document.querySelectorAll('.dir__mini .pv-tela')].every(t => /scale/.test(t.style.transform))), 'miniaturas encaixadas no cartão');
  ok(await semRolagemLateral(page), 'celular com direções: sem rolagem lateral');
  await page.locator('#o-direcoes').scrollIntoViewIfNeeded();
  await foto(page, '2-direcoes-cel');

  /* o visor */
  const abrir = page.locator('.dir').first().getByRole('button', { name: 'Abrir prévia' });
  await abrir.click();
  ok(await page.locator('#o-visor').isVisible(), 'visor abre');
  ok(await page.evaluate(() => document.activeElement.id) === 'o-visor-fechar', 'foco vai para o fechar');
  await page.locator('#o-visor-abas .chip').nth(1).click();
  ok((await page.textContent('#o-visor-titulo')).startsWith('Direção 2'), 'troca para a direção 2');
  await page.click('[data-aparelho="1280"]');
  ok(await page.evaluate(() => document.querySelector('#o-visor-palco .pv-menu') && getComputedStyle(document.querySelector('#o-visor-palco .pv-menu')).display === 'flex'), 'modo computador: menu da prévia aparece (container query)');
  await foto(page, '3-visor-cel');
  await page.keyboard.press('Escape');
  ok(await page.locator('#o-visor').isHidden(), 'Escape fecha o visor');
  ok(await abrir.evaluate(b => b === document.activeElement), 'foco volta ao botão que abriu');

  await abrir.click();
  await page.locator('#o-visor-abas .chip').nth(1).click();
  await page.click('#o-visor-escolher');
  await page.waitForSelector('#o-ajustes:not([hidden])');
  ok(await page.locator('.dir.is-escolhida .dir__estrategia').textContent().then(t => t.startsWith('02')), 'direção 2 escolhida');

  await page.fill('#o-aj-texto', 'Quero a cor da primeira e os depoimentos antes dos serviços');
  await page.click('#o-aj-form button[type=submit]');
  await page.waitForSelector('#o-mudancas li', { timeout: 30000 });
  ok(await page.locator('#o-mudancas li.is-ok').count() >= 1, 'ajuste aplicado e listado');
  await page.waitForFunction(() => !document.querySelector('.dir .btn--primary'));
  ok(true, 'depois do ajuste não há mais troca de direção');

  /* sair e voltar */
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-ajustes:not([hidden])', { timeout: 30000 });
  ok(await page.locator('#o-log .msg').count() >= 5, 'recarregar: a conversa volta');
  ok(await page.locator('#o-versao button').isVisible(), 'recarregar: a versão ajustada volta');

  await page.click('#o-fechar-escopo');
  await page.waitForSelector('#o-escopo:not([hidden])');
  ok((await page.textContent('#o-esc-texto')).includes('INVESTIMENTO'), 'escopo final com investimento');
  ok(!(await page.textContent('#o-esc-texto')).includes('hero'), 'escopo sem nome técnico de seção');
  /* no escopo a conversa também fica aberta para dúvidas, com o lembrete do cartão na caixa (revisões do PR 34) */
  ok(await page.locator('#o-form').isVisible() && await page.locator('#o-conversa-fechada').isHidden(), 'escopo: a caixa da conversa continua');
  ok(/dados de cartão/.test(await page.getAttribute('#o-texto', 'placeholder')), 'escopo: a dica da caixa lembra de não escrever dados de cartão');
  ok(await page.locator('#o-escopo [data-perguntar]').isVisible(), 'escopo: "Pergunte ao consultor" no bloco');
  await page.click('#o-esc-form button[type=submit]');
  ok((await page.textContent('#o-esc-erro')).length > 0, 'escopo sem confirmação: recusado');
  await page.check('#o-confirmo');
  await page.click('#o-esc-form button[type=submit]');
  await page.waitForSelector('#o-pagamento:not([hidden])');
  await foto(page, '4-pagamento-cel');

  /* a conversa segue aberta para dúvidas até o sinal (PROPOSTA de 2026-10-09, §4, 3b) */
  ok(await page.locator('#o-form').isVisible(), 'tela do sinal: a caixa da conversa continua');
  ok(await page.locator('#o-conversa-fechada').isHidden(), 'tela do sinal: sem o aviso de conversa fechada');
  const respostasAntes = await page.locator('#o-log .msg--agente').count();
  await page.click('#o-pagamento [data-perguntar]');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'o-texto'), '"Pergunte ao consultor" leva à caixa da conversa');
  await page.fill('#o-texto', 'Quando eu pago o restante?');
  await page.click('#o-enviar');
  await page.waitForFunction(n => document.querySelectorAll('#o-log .msg--agente').length > n, respostasAntes, { timeout: 30000 });
  const fim = await page.$$eval('#o-log .msg', l => l.slice(-2).map(x => x.className.replace('msg msg--', '') + ': ' + x.textContent));
  ok(/^visitante: Quando eu pago/.test(fim[0]) && /^agente: /.test(fim[1]), 'tela do sinal: a resposta vem logo depois da pergunta (' + JSON.stringify(fim) + ')');
  await page.waitForFunction(() => !document.getElementById('o-pagamento').hidden && document.getElementById('o-pronto').hidden);
  ok(true, 'a dúvida não muda a etapa: o sinal continua esperando');
  await page.waitForTimeout(800);   /* (a caixa da conversa rola com suavidade até a resposta) */
  await foto(page, '4b-duvida-no-sinal-cel');

  /* pagamento: dados do pagador, cartão recusado, depois Pix (QR) e a confirmação SÓ pelo aviso do provedor */
  await page.click('#o-pag-enviar');
  ok((await page.textContent('#o-pag-erro')).includes('nome'), 'pagador sem dados: recusado com motivo');
  await page.fill('#o-pag-nome', 'Ana'); await page.fill('#o-pag-sobrenome', 'Souza');
  await page.fill('#o-pag-email', 'ana@exemplo.com'); await page.fill('#o-pag-doc', '529.982.247-25');
  await page.click('[data-metodo="cartao"]');
  ok(await page.locator('#o-pag-local').isVisible(), 'modo local: nomes de teste no lugar dos campos do Mercado Pago');
  await page.fill('#o-titular', 'FUND');
  await page.click('#o-pag-enviar');
  await page.waitForFunction(() => /limite/.test(document.getElementById('o-pag-status').textContent), null, { timeout: 15000 });
  ok(true, 'cartão recusado: motivo em português, nada liberado');
  ok(await page.locator('#o-pronto').isHidden(), 'recusa não libera');
  await page.click('[data-metodo="pix"]');
  await page.click('#o-pag-enviar');
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 15000 });
  ok((await page.inputValue('#o-pix-codigo')).startsWith('000201'), 'Pix copia e cola');
  ok(await page.locator('#o-pix-qr').isVisible(), 'QR do Pix');
  ok(await semRolagemLateral(page), 'celular no Pix: sem rolagem lateral');
  await page.locator('#o-pix').scrollIntoViewIfNeeded();
  await foto(page, '4-pix-cel');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 15000 });
  ok(true, 'recarregar: o mesmo Pix volta (nenhuma cobrança nova)');
  ok(await page.locator('#o-pronto').isHidden(), 'voltar para a página não confirma nada sozinho');
  await page.click('#o-pix-simular');
  await page.waitForSelector('#o-pronto:not([hidden])', { timeout: 20000 });
  ok(true, 'Pix confirmado pelo aviso assinado + consulta: projeto liberado');
  ok(erros.length === 0, 'sem erro de console' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  /* 320px e desktop: só o layout */
  for (const [w, h, nome] of [[320, 640, '5-inicio-320'], [1440, 900, '6-inicio-desktop']]) {
    const c = await nav.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    await p.goto(BASE + '/orcamento', { waitUntil: 'load' });
    ok(await semRolagemLateral(p), w + 'px: sem rolagem lateral');
    await foto(p, nome);
    await c.close();
  }

  /* sem JS: a página avisa e oferece o WhatsApp */
  const sj = await nav.newContext({ javaScriptEnabled: false });
  const ps = await sj.newPage();
  await ps.goto(BASE + '/orcamento', { waitUntil: 'load' });
  ok(await ps.locator('.orc-aviso--semjs').isVisible(), 'sem JS: aviso com o WhatsApp visível');
  ok(await ps.locator('.orc-mesa').isHidden(), 'sem JS: a conversa (que não funcionaria) some');
  await sj.close();
} catch (e) {
  ok(false, 'exceção: ' + (e && e.message ? e.message.split('\n').slice(0, 3).join(' | ') : e));
  console.log('  últimas chamadas à API:\n    ' + diario.slice(-10).join('\n    '));
  if (diario.some(l => l.includes('→ 429'))) console.log('  (429 = o freio por IP de api/vendas.mjs, que é real: rodadas seguidas somam no mesmo minuto.\n   Espere 1 minuto entre rodadas ou reinicie o servidor local; não é defeito do fluxo.)');
  if (pagina) {
    const tela = await pagina.evaluate(() => JSON.stringify({
      etapa: document.querySelector('#o-etapas [aria-current]')?.dataset.passo,
      abertos: ['o-est-cheio', 'o-contato', 'o-ajustes', 'o-escopo', 'o-pagamento', 'o-pix', 'o-pronto'].filter(id => document.getElementById(id) && !document.getElementById(id).hidden),
      erroEscopo: document.getElementById('o-esc-erro')?.textContent || '',
      ultimaMensagem: [...document.querySelectorAll('#o-log .msg')].pop()?.textContent.slice(0, 160) || '',
    })).catch(x => 'sem leitura: ' + x.message);
    console.log('  tela: ' + tela);
  }
} finally {
  await nav.close();
}
process.exit(falhou ? 1 : 0);
