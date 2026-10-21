/* O PIX no E2E do orçamento (A7 do PR A da Cloudflare; o PR 3b-1 acrescenta a ele). Fica fora de docs/e2e-orcamento.mjs, que já passou do teto de 800 linhas
   (pendência PR2b2-M3): o trecho do pagamento saiu de lá para cá. Recebe a página na tela da entrada (#o-pagamento
   visível), no celular (390 px), e a deixa com a entrada paga (#o-pronto visível).
   O servidor diz se o cartão vale (MP_METODOS, decisão do dono de 21/10): com os dois (o padrão do servidor local), o
   cartão é recusado e depois vem o Pix, como antes; só com o Pix (servidor local subido com MP_METODOS=pix), a tela
   não tem seletor nem cartão, e o servidor recusa o cartão com 400. */
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '529.982.247-25' };

async function cartaoRecusado(page, ok) {
  ok(await page.locator('#o-pag-metodos').isVisible(), 'cartão ligado (servidor local padrão): o seletor aparece');
  await page.click('[data-metodo="cartao"]');
  ok(await page.locator('#o-pag-local').isVisible(), 'modo local: nomes de teste no lugar dos campos do Mercado Pago');
  await page.fill('#o-titular', 'FUND');
  await page.click('#o-pag-enviar');
  await page.waitForFunction(() => /limite/.test(document.getElementById('o-pag-status').textContent), null, { timeout: 15000 });
  ok(true, 'cartão recusado: motivo em português, nada liberado');
  ok(await page.locator('#o-pronto').isHidden(), 'recusa não libera');
  await page.click('[data-metodo="pix"]');
}

async function cartaoDesligado(page, ok, forcar) {
  ok(await page.locator('#o-pag-metodos').isHidden(), 'só Pix: sem o seletor de forma de pagamento');
  forcar(true);   /* (o 400 esperado aparece no console do Chrome; o E2E já tolera 400 enquanto `falhaForcada`) */
  const status = await page.evaluate(p => window.BZOrcamento.pagar('cartao', p, { token: 'local-APRO-abc12345', meio: 'visa', tipo: 'credit_card', parcelas: 1 })
    .then(() => 0, e => e.status), PAGADOR);
  await page.waitForTimeout(300);   /* (o evento do console chega um instante depois da resposta) */
  forcar(false);
  ok(status === 400, 'só Pix: o servidor recusa o cartão antes do banco (status ' + status + ')');
}

/* (PR 3b-1) proposta sem percentual: a resposta do estado é trocada só neste trecho; a tela não cobra nem inventa um número */
async function semPercentual(page, ok, espera) {
  const eEstado = url => url.searchParams.get('acao') === 'estado';
  await page.route(eEstado, async rota => {
    const real = await rota.fetch();
    const corpo = await real.json();
    if (corpo && corpo.proposta) corpo.proposta = { ...corpo.proposta, sinal_percentual: null };
    await rota.fulfill({ response: real, json: corpo });
  });
  await page.reload({ waitUntil: 'load' });
  ok(await espera(page, () => !document.getElementById('o-pag-indisponivel').hidden && document.getElementById('o-pag-form').hidden, 15000),
    'proposta sem percentual: a tela não cobra (sem formulário, com o aviso)');
  ok(!/\d+\s?%/.test(await page.textContent('#o-pag-lead')), 'proposta sem percentual: nenhum percentual inventado no texto');
  await page.unroute(eEstado);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-pag-form:not([hidden])', { timeout: 15000 });
}

export async function passoDoPix(page, { ok, espera, foto, semRolagemLateral, forcar = () => {} }) {
  const cfg = await page.evaluate(() => window.BZOrcamento.pagamentoConfig());
  const comCartao = Array.isArray(cfg.metodos) && cfg.metodos.includes('cartao');
  console.log('[e2e-pix] formas de pagamento do servidor: ' + JSON.stringify(cfg.metodos));
  /* (freio de 90 chamadas por minuto por IP, api/vendas.mjs) o "sem percentual" recarrega 2 vezes: conta as chamadas
     do trecho e espera a janela esvaziar antes do resto, como as outras esperas deste E2E (docs/e2e-orcamento.mjs, antes do pagamento) */
  let chamadas = 0;
  const contar = req => { if (new URL(req.url()).pathname === '/api/vendas') chamadas++; };
  page.on('request', contar);
  await semPercentual(page, ok, espera);
  console.log('[e2e-pix] chamadas a /api/vendas no "sem percentual": ' + chamadas);
  page.off('request', contar);
  await new Promise(r => setTimeout(r, 61e3));
  ok(/a entrada de 40%: /.test(await page.textContent('#o-pag-lead')), 'entrada: o percentual vem da proposta (o servidor local usa o rascunho, a 40)');
  const perguntasAntes = page.locator('#o-antes');
  ok(await perguntasAntes.isVisible(), 'perguntas antes de pagar: na tela da entrada');
  const desistir = perguntasAntes.locator('summary', { hasText: 'Posso desistir?' });
  ok(Math.round((await desistir.boundingBox()).height) >= 44, 'perguntas: cada pergunta com 44 px ou mais');
  await desistir.click();
  ok(await perguntasAntes.getByText('Até 7 dias depois de aceitar', { exact: false }).isVisible(), 'perguntas: "Posso desistir?" abre a resposta');
  ok(parseFloat(await perguntasAntes.locator('.orc-antes__resposta').first().evaluate(p => getComputedStyle(p).fontSize)) >= 16, 'perguntas: resposta com 16 px ou mais');
  await desistir.click();
  ok(await perguntasAntes.locator('summary', { hasText: 'Quantos ajustes?' }).isVisible(), 'perguntas: "Quantos ajustes?"');
  await page.click('#o-pagamento a[href="#o-antes"]');
  ok(await espera(page, () => { const r = document.getElementById('o-antes').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), 'o atalho "Perguntas antes de pagar" leva às perguntas');
  await page.click('#o-pag-enviar');
  ok((await page.textContent('#o-pag-erro')).includes('nome'), 'pagador sem dados: recusado com motivo');
  await page.fill('#o-pag-nome', PAGADOR.nome); await page.fill('#o-pag-sobrenome', PAGADOR.sobrenome);
  await page.fill('#o-pag-email', PAGADOR.email); await page.fill('#o-pag-doc', PAGADOR.documento);
  if (comCartao) await cartaoRecusado(page, ok); else await cartaoDesligado(page, ok, forcar);
  await page.click('#o-pag-enviar');
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 15000 });
  if (!comCartao) ok(await page.locator('#o-pix-trocar').isHidden(), 'só Pix: sem "Prefiro pagar com cartão"');
  ok((await page.inputValue('#o-pix-codigo')).startsWith('000201'), 'Pix copia e cola');
  ok(/^R\$\s?[\d.]+(,\d{2})? · 40% do total, por Pix$/.test((await page.textContent('#o-pix-valor')).trim()), 'Pix: valor e percentual vindos da proposta');
  const valorPx = await page.locator('#o-pix-valor').evaluate(p => { const s = getComputedStyle(p); return { tamanho: parseFloat(s.fontSize), caixa: s.textTransform }; });
  ok(valorPx.tamanho >= 16 && valorPx.caixa === 'none', 'Pix: o valor a pagar legível, 16 px ou mais e sem caixa alta (' + valorPx.tamanho + ' px)');
  ok(await page.getByText('Fernando Ferreira Dos Santos', { exact: true }).isVisible(), 'Pix: o nome que aparece no banco');
  ok((await page.textContent('#o-pix-copiar')).trim() === 'Copiar o código Pix', 'Pix: o botão diz o que copia');
  ok(Math.round((await page.locator('#o-pix-copiar').boundingBox()).height) >= 44, 'Pix: botão de copiar com 44 px ou mais');
  const estilo = await page.locator('#o-pix-copiar').evaluate(b => { const s = getComputedStyle(b); return { fonte: s.fontFamily, caixa: s.textTransform, tamanho: parseFloat(s.fontSize) }; });
  ok(/Sora/.test(estilo.fonte) && estilo.caixa === 'none' && estilo.tamanho >= 16, 'Pix: botão em Sora, frase normal, 16 px ou mais (' + estilo.fonte.split(',')[0] + ', ' + estilo.caixa + ', ' + estilo.tamanho + ' px)');
  ok(await page.locator('.pix__passos li').count() === 3, 'Pix: os 3 passos no app do banco');
  ok(await espera(page, () => document.getElementById('o-pag-status').textContent === 'Esperando o pagamento. Esta tela muda sozinha quando ele cair.'), 'Pix: o status diz que a tela muda sozinha');
  ok(!(await page.$eval('#o-pix-outro', d => d.open)) && await page.locator('#o-pix-qr').isHidden(), 'celular: o QR fica fechado em "Pagar por outro aparelho"');
  const outro = page.locator('#o-pix-outro summary');
  ok(Math.round((await outro.boundingBox()).height) >= 44, '"Pagar por outro aparelho": 44 px ou mais');
  /* teclado (BAIXO-6): chega-se ao "Pagar por outro aparelho" por Tab, com o contorno de foco, e o Enter abre */
  await page.focus('#o-pix-copiar');
  for (let i = 0; i < 8 && !(await outro.evaluate(s => s === document.activeElement)); i++) await page.keyboard.press('Tab');
  ok(await outro.evaluate(s => s === document.activeElement && s.matches(':focus-visible') && getComputedStyle(s).outlineStyle !== 'none'),
    '"Pagar por outro aparelho": chega-se por Tab, com o contorno de foco');
  await page.keyboard.press('Enter');
  ok(await page.locator('#o-pix-qr').isVisible(), 'QR do Pix, aberto pelo teclado (Enter)');
  ok(await page.evaluate(() => [...document.querySelectorAll('#o-pagamento, #o-pagamento *')].every(e => {
    const s = getComputedStyle(e);
    return !/blur/.test(s.filter + ' ' + s.backdropFilter) && !/\)\s-?[\d.]+px\s-?[\d.]+px\s[1-9]/.test(s.boxShadow);
  })), 'Pix: nenhum desfoque nem sombra difusa');
  ok(await semRolagemLateral(page), 'celular no Pix: sem rolagem lateral');
  await page.locator('#o-pix').scrollIntoViewIfNeeded();
  await foto(page, comCartao ? '4-pix-cel' : '4-pix-so-pix-cel');
  await page.setViewportSize({ width: 320, height: 700 });
  ok(await semRolagemLateral(page), '320 px no Pix: sem rolagem lateral');
  await foto(page, comCartao ? '4-pix-320' : '4-pix-so-pix-320');
  /* a partir de 768 px o QR já vem aberto (a decisão é por carga: recarrega na largura nova). Esta recarga SUBSTITUI a
     que já existia (nenhuma a mais no freio). Nela, a configuração falha uma vez: o configDeNovo() chama
     tela.mostrar(valor) com um argumento só, e o percentual não pode sumir da linha do Pix (MÉDIO-2 da revisão) */
  let configFalhou = false;
  const eConfig = url => url.searchParams.get('acao') === 'pagamento-config';
  forcar(true);   /* (o erro de rede que o próprio teste força não é erro da página) */
  await page.route(eConfig, rota => { if (configFalhou) return rota.continue(); configFalhou = true; return rota.abort('failed'); });
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 45000 });   /* (o configDeNovo tenta de novo em 15 s) */
  await page.unroute(eConfig);
  forcar(false);
  ok(true, 'recarregar: o mesmo Pix volta (nenhuma cobrança nova)');
  ok(configFalhou && /40% do total/.test(await page.textContent('#o-pix-valor')), 'configuração que falhou e voltou (configDeNovo): o percentual continua na linha do Pix');
  ok(await page.$eval('#o-pix-outro', d => d.open) && await page.locator('#o-pix-qr').isVisible(), '1024 px: o QR já vem aberto');
  await page.setViewportSize({ width: 390, height: 844 });
  ok(await page.locator('#o-pronto').isHidden(), 'voltar para a página não confirma nada sozinho');
  await page.click('#o-pix-simular');
  await page.waitForSelector('#o-pronto:not([hidden])', { timeout: 20000 });
  ok(true, 'Pix confirmado pelo aviso assinado + consulta: projeto liberado');
}
