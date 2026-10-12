/* ==========================================================================
   E2E do ORÇAMENTO COM IA (/orcamento) num Chromium de verdade, contra o
   servidor local (docs/servidor.mjs: banco PGlite, IA simulada, gateway
   simulado). Celular primeiro (390px), depois 320px e desktop.
   Cobre: as perguntas → preço (motivo, vizinho, "Quer ajustar?" ao vivo) →
   conta que falha não muda o que se grava → pacote gravado → contato → 3 modelos → visor (abrir,
   trocar, aparelho, Escape devolve o foco) → escolha → ajuste → retomada
   depois de recarregar → escopo (exige a confirmação) → pagamento simulado
   → projeto em produção. À parte: o pacote que pede conversa (sem valor) e
   a landing de até 3 páginas. Com CONSULTOR=1, também a conversa: texto com HTML
   vira texto, Enter repetido, dúvidas no resumo e no sinal.
   Uso: servidor local com BZ_SEM_CONSULTOR=1, depois
   BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/e2e-orcamento.mjs
   (CONSULTOR=1 com o servidor local SEM BZ_SEM_CONSULTOR)
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
/* CONSULTOR=1: o servidor local com a IA simulada mostrando o consultor (sem BZ_SEM_CONSULTOR); as checagens da
   conversa só valem aí. Sem ele, o caminho é só o das perguntas (rodar o servidor com BZ_SEM_CONSULTOR=1) */
const CONSULTOR = process.env.CONSULTOR === '1';
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhou = true; };
const semRolagemLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
/* espera uma condição na página sem derrubar o resto do teste: devolve se ela chegou a valer */
const espera = (page, fn, ms = 8000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
const daAcao = acao => url => url.searchParams.get('acao') === acao;
const SIMULAR = daAcao('simular'), GRAVAR = daAcao('confirmar-pacote');
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
  let falhaForcada = false;   /* (o 503 que o próprio teste força numa conta não é erro da página) */
  page.on('console', m => { if (m.type() === 'error' && !(falhaForcada && /status of 503/.test(m.text()))) erros.push(m.text()); });
  page.on('pageerror', e => erros.push(String(e)));
  page.on('dialog', d => { erros.push('diálogo inesperado: ' + d.message()); d.dismiss(); });

  await page.goto(BASE + '/orcamento', { waitUntil: 'load', timeout: 90000 });
  ok(await page.locator('h1').isVisible(), 'celular: título visível');
  ok(await semRolagemLateral(page), 'celular: sem rolagem lateral');
  ok(await page.evaluate(() => localStorage.getItem('bz-orcamento') === null), 'nenhuma sessão criada só por abrir a página');
  await foto(page, '1-inicio-cel');

  /* orçamento sem IA (spec 2026-10-11): 4 perguntas → preço → ajustar → quero os três modelos */
  await page.waitForSelector('#o-perguntas:not([hidden])');
  ok(await page.locator('#o-conversa').isHidden(), 'sem IA: a conversa com o consultor não aparece');
  await page.locator('#o-perguntas').scrollIntoViewIfNeeded();
  await foto(page, '1a-perguntas-cel');
  await page.click('[data-ramo="saude"]');
  await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-objetivo="agendamentos"]');
  await page.click('.orc-p:not([hidden]) .orc-p__seguir');
  await page.click('[data-site-atual="instagram"]');
  await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 15000 });
  ok((await page.textContent('#o-est-valor')).includes('3.950'), 'preço pela tabela: R$ 3.950');
  ok(/agend/i.test(await page.textContent('#o-est-motivo')), 'o motivo da recomendação, nas palavras da pessoa');
  ok(await page.locator('#o-vizinhos [data-formato="landing_page"]').isVisible(), 'o formato vizinho ao lado (âncora honesta)');
  ok(/não paga nada/i.test(await page.textContent('#o-est-sem-risco')), 'sem risco até confirmar');
  ok(await semRolagemLateral(page), 'celular no preço: sem rolagem lateral');
  ok(await page.evaluate(() => document.querySelector('#o-etapas [aria-current]').dataset.passo) === 'estimativa', 'com o preço na tela, a etapa já é "Preço"');
  await foto(page, '1b-preco-cel');
  await page.click('#o-ajustar-abrir');
  ok(await page.isChecked('#o-x-agendamento'), 'ajustar: o extra da recomendação (agendamento) já vem marcado');
  /* (a tabela limita a fase a 10 dias: institucional 8 + agendamento 1 deixa espaço para as imagens, meio dia; o blog,
     de 2 dias, vai para a fase seguinte e o total desta fase não muda) */
  await page.check('#o-x-imagens');
  await page.waitForFunction(() => document.getElementById('o-est-valor').textContent.includes('4.200'));
  ok(true, 'ajustar: o preço muda na hora pelo servidor (3.950 + imagens 250)');
  await page.locator('#o-ajustar').scrollIntoViewIfNeeded();
  await foto(page, '1c-ajustar-cel');
  await page.uncheck('#o-x-imagens');
  await page.waitForFunction(() => document.getElementById('o-est-valor').textContent.includes('3.950'));
  await page.check('#o-x-blog');
  await page.waitForSelector('#o-est-fase:not([hidden])');
  ok(/blog/i.test(await page.textContent('#o-est-fase')), 'ajustar: o que passa do prazo vai para a fase seguinte (blog), pelo servidor');
  await page.uncheck('#o-x-blog');
  await page.waitForSelector('#o-est-fase', { state: 'hidden' });
  /* trocar de formato e voltar não perde o extra da recomendação (o servidor só o soma no formato recomendado) */
  await page.click('#o-vizinhos [data-formato="landing_page"]');
  await page.waitForFunction(() => document.getElementById('o-est-valor').textContent.includes('1.950'));
  ok(true, 'vizinho: site de uma página com o agendamento (1.500 + 450)');
  await page.click('#o-vizinhos [data-formato="institucional"]');
  await page.waitForFunction(() => document.getElementById('o-est-valor').textContent.includes('3.950'));
  ok(true, 'voltar ao recomendado: o agendamento continua (3.950)');
  /* uma conta que falha (rede, 429, tempo) não muda o que se grava: vale o último preço que apareceu na tela */
  let falharSimular = true;
  falhaForcada = true;
  const simularQueFalha = route => falharSimular
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ erro: 'O serviço está lento agora.' }) })
    : route.continue();
  await page.route(SIMULAR, simularQueFalha);
  await page.click('#o-vizinhos [data-formato="landing_page"]');
  const errou = await espera(page, () => document.getElementById('o-est-erro').textContent.length > 0);
  ok(errou && (await page.textContent('#o-est-valor')).includes('3.950'), 'conta que falha: o erro aparece e o preço na tela continua o último (3.950)');
  falharSimular = false;
  await page.unroute(SIMULAR, simularQueFalha);
  falhaForcada = false;
  /* gravar demora um pouco aqui, para ver o botão e os controles enquanto isso */
  const gravarDevagar = async route => { await new Promise(r => setTimeout(r, 800)); await route.continue(); };
  await page.route(GRAVAR, gravarDevagar);
  const pedidoGravar = page.waitForRequest(r => GRAVAR(new URL(r.url())));
  /* a corrida: marcar imagens e clicar "Quero" ainda dentro da espera da conta. "Quero" espera a conta terminar e grava
     o pedido do preço que ela mostrou (com imagens), nunca o de antes */
  await page.check('#o-x-imagens');
  await page.click('#o-quero-modelos');
  const corpoGravar = JSON.parse((await pedidoGravar).postData() || '{}');
  ok(corpoGravar.formato === 'institucional' && corpoGravar.extras && corpoGravar.extras.agendamento === 1 && corpoGravar.extras.imagens === 1,
    'Quero com conta pendente: espera e grava o pedido do último preço (institucional, agendamento e imagens), não o da conta que falhou nem o de antes: ' + JSON.stringify({ formato: corpoGravar.formato, extras: corpoGravar.extras }));
  ok(await page.textContent('#o-quero-modelos') === 'Guardando…', 'enquanto grava, o botão diz "Guardando…"');
  ok(await page.evaluate(() => document.getElementById('o-ajustar-principais').disabled && document.getElementById('o-x-urgencia').disabled), 'enquanto grava, os extras ficam travados');
  await page.waitForSelector('#o-contato:not([hidden])');
  await page.unroute(GRAVAR, gravarDevagar);
  ok(true, 'pacote gravado: segue para o contato');
  ok((await page.textContent('#o-est-valor')).includes('4.200'), 'o cartão depois de gravar mostra o preço gravado (3.950 + imagens 250 = 4.200)');
  ok((await page.textContent('#o-contato-form button[type=submit]')).trim() === 'Quero os três modelos', 'contato: o botão diz "Quero os três modelos"');
  ok(await page.evaluate(() => document.querySelector('#o-etapas [aria-current]').dataset.passo) === 'estimativa', 'etapa atual: preço');
  ok(await page.locator('#o-ajustar').isHidden() && await page.locator('#o-quero-modelos').isHidden(), 'pacote gravado: os controles do preço saem de cena');

  if (CONSULTOR) {
    /* com o consultor: "Prefere conversar?" abre a conversa. Segurança na tela: HTML digitado aparece como texto */
    await page.click('#o-conversar');
    const respostas = await page.locator('#o-log .msg--agente').count();
    await page.fill('#o-texto', '<img src=x onerror=alert(1)> Tenho uma clínica odontológica e quero mais agendamentos');
    await page.press('#o-texto', 'Enter');
    await page.waitForFunction(n => document.querySelectorAll('#o-log .msg--agente').length > n, respostas, { timeout: 30000 });
    ok(await page.locator('#o-log img').count() === 0, 'texto com HTML vira texto (nenhuma <img> criada)');
    const antes = await page.locator('#o-log .msg--visitante').count();
    await page.fill('#o-texto', 'Sim, quero ver os modelos');
    await page.press('#o-texto', 'Enter');
    await page.press('#o-texto', 'Enter');   /* Enter repetido */
    await page.waitForSelector('#o-pensando[hidden]', { state: 'attached', timeout: 30000 });
    ok(await page.locator('#o-log .msg--visitante').count() === antes + 1, 'Enter repetido não manda dois turnos');
  } else {
    ok(await page.locator('#o-conversar').isHidden(), 'sem consultor: nenhum convite para conversar');
  }
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
  if (CONSULTOR) ok(await page.locator('#o-log .msg').count() >= 5, 'recarregar: a conversa volta');
  else ok(await page.locator('#o-conversa').isHidden() && await page.locator('#o-perguntas').isHidden(), 'recarregar: nem conversa nem perguntas de novo');
  ok(await page.locator('#o-versao button').isVisible(), 'recarregar: a versão ajustada volta');

  ok((await page.textContent('#o-fechar-escopo')).trim() === 'Está bom assim: ver o resumo', 'ajustes: o botão diz "ver o resumo"');
  await page.click('#o-fechar-escopo');
  await page.waitForSelector('#o-escopo:not([hidden])');
  ok((await page.textContent('#o-esc-titulo')).trim() === 'Resumo do que será feito', 'o título é "Resumo do que será feito"');
  ok((await page.textContent('#o-esc-texto')).includes('INVESTIMENTO'), 'resumo com investimento');
  ok(!(await page.textContent('#o-esc-texto')).includes('hero'), 'escopo sem nome técnico de seção');
  if (CONSULTOR) {
    /* no escopo a conversa também fica aberta para dúvidas, com o lembrete do cartão na caixa (revisões do PR 34) */
    ok(await page.locator('#o-form').isVisible() && await page.locator('#o-conversa-fechada').isHidden(), 'escopo: a caixa da conversa continua');
    ok(/dados de cartão/.test(await page.getAttribute('#o-texto', 'placeholder')), 'escopo: a dica da caixa lembra de não escrever dados de cartão');
    ok(await page.locator('#o-escopo [data-perguntar]').isVisible(), 'escopo: "Pergunte ao consultor" no bloco');
  } else ok(await page.locator('#o-escopo [data-perguntar]').isHidden(), 'sem consultor: o resumo não oferece "Pergunte ao consultor"');
  await page.click('#o-esc-form button[type=submit]');
  ok((await page.textContent('#o-esc-erro')).length > 0, 'escopo sem confirmação: recusado');
  await page.check('#o-confirmo');
  await page.click('#o-esc-form button[type=submit]');
  await page.waitForSelector('#o-pagamento:not([hidden])');
  await foto(page, '4-pagamento-cel');

  if (CONSULTOR) {
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
  } else ok(await page.locator('#o-pagamento [data-perguntar]').isHidden(), 'sem consultor: a tela do sinal não oferece "Pergunte ao consultor"');

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

  /* o pacote que pede conversa (estimativa nula com diagnóstico, como passar do limite automático): forçado aqui pela
     resposta do servidor, porque a tabela de teste não chega ao limite pelos botões da tela */
  {
    const c = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    let forcar = true;
    await p.route(SIMULAR, async route => {
      if (!forcar) return route.continue();
      const real = await route.fetch();
      const corpo = await real.json();
      await route.fulfill({ response: real, json: { ...corpo, estimativa: null, diagnostico: { itens: [] } } });
    });
    /* (as respostas ficam ao voltar por "Mudar as respostas": o objetivo só é marcado na 1ª vez) */
    const verOPreco = async primeira => {
      await p.click('.orc-p:not([hidden]) .orc-p__seguir');   /* (o ramo é a saúde marcada pela seta, abaixo) */
      if (primeira) await p.click('[data-objetivo="agendamentos"]');   /* (com saúde, a recomendação traz o agendamento: um extra que não pode sumir) */
      await p.click('.orc-p:not([hidden]) .orc-p__seguir');
      await p.click('#o-p-ver-preco');
    };
    const emConversa = () => !document.getElementById('o-est-vazio').hidden && /precisa de uma conversa/i.test(document.getElementById('o-est-vazio').textContent)
      && document.getElementById('o-est-cheio').hidden;
    await p.goto(BASE + '/orcamento', { waitUntil: 'load' });
    await p.waitForSelector('#o-perguntas:not([hidden])');
    /* escolha única é grupo de rádio: as setas marcam a vizinha e levam o foco */
    await p.focus('[data-ramo="servicos"]');
    await p.keyboard.press('ArrowDown');
    ok(await p.evaluate(() => { const b = document.querySelector('[data-ramo="saude"]'); return b === document.activeElement && b.getAttribute('aria-checked') === 'true' && b.tabIndex === 0
      && document.querySelector('[data-ramo="servicos"]').getAttribute('aria-checked') === 'false' && b.closest('[role="radiogroup"]') !== null; }), 'ramo: grupo de rádio, a seta marca o próximo');
    await verOPreco(true);
    ok(await espera(p, emConversa), 'diagnóstico no 1º preço: o cartão diz que o pacote precisa de uma conversa');
    ok(await p.locator('#o-p-refazer').isVisible(), 'diagnóstico no 1º preço: "Mudar as respostas" continua ao alcance');
    ok(await p.locator('#o-quero-modelos').isHidden(), 'diagnóstico: sem "Quero os três modelos"');
    ok(await espera(p, () => /conversa/i.test(document.getElementById('o-voz').textContent)), 'diagnóstico: o leitor de tela ouve que precisa de uma conversa');
    ok(await semRolagemLateral(p), 'diagnóstico: sem rolagem lateral');
    await foto(p, '7-diagnostico-cel');
    /* 1º preço sem valor e depois um ajuste (liga e desliga a urgência): os extras da recomendação continuam no pacote.
       O preço que fica é comparado abaixo com o da recomendação pura (depois de "Mudar as respostas") */
    forcar = false;
    await p.click('#o-ajustar-abrir');
    await p.check('#o-x-urgencia');
    await p.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 15000 });
    const comUrgencia = (await p.textContent('#o-est-valor')).trim();
    await p.uncheck('#o-x-urgencia');
    await p.waitForFunction(u => document.getElementById('o-est-valor').textContent.trim() !== u, comUrgencia, { timeout: 8000 });
    const depoisDoDiagnostico = (await p.textContent('#o-est-valor')).trim();
    /* de um preço de verdade para o diagnóstico e de volta: o preço velho não fica na tela */
    forcar = false;
    await p.click('#o-p-refazer');
    await verOPreco();
    await p.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 15000 });
    const valor = (await p.textContent('#o-est-valor')).trim();
    ok(await p.evaluate(() => /agendamento/i.test(document.getElementById('o-est-itens').textContent)), 'a recomendação traz um extra (agendamento nos itens): o teste abaixo tem o que provar');
    ok(depoisDoDiagnostico === valor,'diagnóstico no 1º preço e um ajuste: os extras da recomendação não somem (' + depoisDoDiagnostico + ' = ' + valor + ')');
    await p.click('#o-ajustar-abrir');
    forcar = true;
    await p.check('#o-x-imagens');
    ok(await espera(p, emConversa), 'diagnóstico depois de um preço: o valor, o prazo e os itens velhos saem do cartão');
    ok(await p.locator('#o-quero-modelos').isHidden() && await p.locator('#o-p-refazer').isVisible(), 'diagnóstico depois de um preço: sem "Quero", com "Mudar as respostas"');
    forcar = false;
    await p.uncheck('#o-x-imagens');
    ok(await espera(p, () => !document.getElementById('o-est-cheio').hidden), 'desmarcar: o preço volta ao cartão');
    ok((await p.textContent('#o-est-valor')).trim() === valor && await p.locator('#o-quero-modelos').isVisible(), 'desmarcar: o mesmo preço de antes, com "Quero os três modelos" (' + valor + ')');
    /* a landing vai até 3 páginas: o servidor (de verdade) recusa a 4ª e a tela oferece o site com várias páginas */
    const comPaginas = async route => {
      const corpo = JSON.parse(route.request().postData() || '{}');
      if (corpo.formato !== 'landing_page') return route.continue();
      await route.continue({ postData: JSON.stringify({ ...corpo, extras: { ...corpo.extras, pagina_extra: 3 } }) });
    };
    const formatoNaTela = async () => (await p.textContent('#o-est-formato')).trim();
    const doRecomendado = await formatoNaTela();
    /* (a) de outro formato para a landing grande: a tela volta ao formato mostrado; se ele já é o indicado, sem botão */
    await p.route(SIMULAR, comPaginas);
    await p.click('#o-vizinhos [data-formato="landing_page"]');
    ok(await espera(p, () => /até 3 páginas/.test(document.getElementById('o-est-erro').textContent)), 'landing com 4 páginas: a recusa do servidor aparece no cartão');
    ok((await p.textContent('#o-est-valor')).trim() === valor && await formatoNaTela() === doRecomendado, 'landing recusada: o preço e o formato na tela continuam os últimos (' + valor + ', ' + doRecomendado + ')');
    if (doRecomendado === 'Site com várias páginas') ok(await p.locator('#o-est-sugerido').isHidden(), 'já no site com várias páginas: sem o botão que não levaria a lugar nenhum');
    /* (b) na landing (até 3 páginas, aceita), uma conta que passa de 3 é recusada e o botão TROCA o formato */
    await p.unroute(SIMULAR, comPaginas);
    await p.click('#o-vizinhos [data-formato="landing_page"]');
    ok(await espera(p, () => !document.getElementById('o-est-erro').textContent && document.getElementById('o-est-formato').textContent.trim() === 'Site de uma página'), 'landing até 3 páginas: aceita, com o preço');
    await p.route(SIMULAR, comPaginas);
    await p.click('#o-x-urgencia');
    ok(await espera(p, () => /até 3 páginas/.test(document.getElementById('o-est-erro').textContent) && !document.getElementById('o-est-sugerido').hidden), 'na landing, passar de 3 páginas: recusa com o botão');
    ok(/várias páginas/.test(await p.textContent('#o-est-sugerido')), 'o botão diz para onde vai');
    await p.unroute(SIMULAR, comPaginas);
    await p.click('#o-est-sugerido');
    ok(await espera(p, () => !document.getElementById('o-est-erro').textContent && document.getElementById('o-est-sugerido').hidden && !document.getElementById('o-est-cheio').hidden
      && document.getElementById('o-est-formato').textContent.trim() === 'Site com várias páginas'), 'o botão troca para o site com várias páginas e o erro sai');
    await c.close();
  }

  /* 320px e desktop: o layout das perguntas, do preço e do "Quer ajustar?" */
  for (const [w, h, nome] of [[320, 640, '5-inicio-320'], [1440, 900, '6-inicio-desktop']]) {
    const c = await nav.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    await p.goto(BASE + '/orcamento', { waitUntil: 'load' });
    ok(await semRolagemLateral(p), w + 'px: sem rolagem lateral');
    await foto(p, nome);
    await p.waitForSelector('#o-perguntas:not([hidden])');
    await p.locator('#o-perguntas').scrollIntoViewIfNeeded();
    await foto(p, nome + '-perguntas');
    await p.click('[data-naosei="1"]');
    await p.click('[data-objetivo="pedidos_whatsapp"]');
    await p.click('.orc-p:not([hidden]) .orc-p__seguir');
    await foto(p, nome + '-passo3');
    await p.click('#o-p-ver-preco');
    await p.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 15000 });
    ok(/escolhi por você/i.test(await p.textContent('#o-est-assumido')), w + 'px: o "Não sei" assumido aparece escrito');
    ok(await semRolagemLateral(p), w + 'px no preço: sem rolagem lateral');
    await foto(p, nome + '-preco');
    await p.click('#o-ajustar-abrir');
    await p.waitForSelector('#o-x-imagens');   /* (sem ramo, só os extras de qualquer ramo ficam à vista) */
    await p.locator('#o-ajustar').scrollIntoViewIfNeeded();
    ok(await semRolagemLateral(p), w + 'px no ajustar: sem rolagem lateral');
    await foto(p, nome + '-ajustar');
    await p.click('#o-p-refazer');
    ok(await p.locator('#o-perguntas').isVisible() && await p.locator('#o-ajustar').isHidden(), w + 'px: "Mudar as respostas" volta às perguntas');
    ok(await p.evaluate(() => document.querySelector('#o-etapas [aria-current]').dataset.passo) === 'conversa', w + 'px: e a etapa volta para "Perguntas"');
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
