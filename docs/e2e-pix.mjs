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
  ok(!/d+s?%/.test(await page.textContent('#o-pag-lead')), 'proposta sem percentual: nenhum percentual inventado no texto');
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
  await page.click('#o-pag-enviar');
  ok((await page.textContent('#o-pag-erro')).includes('nome'), 'pagador sem dados: recusado com motivo');
  await page.fill('#o-pag-nome', PAGADOR.nome); await page.fill('#o-pag-sobrenome', PAGADOR.sobrenome);
  await page.fill('#o-pag-email', PAGADOR.email); await page.fill('#o-pag-doc', PAGADOR.documento);
  if (comCartao) await cartaoRecusado(page, ok); else await cartaoDesligado(page, ok, forcar);
  await page.click('#o-pag-enviar');
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 15000 });
  if (!comCartao) ok(await page.locator('#o-pix-trocar').isHidden(), 'só Pix: sem "Prefiro pagar com cartão"');
  ok((await page.inputValue('#o-pix-codigo')).startsWith('000201'), 'Pix copia e cola');
  ok(await page.locator('#o-pix-qr').isVisible(), 'QR do Pix');
  ok(await semRolagemLateral(page), 'celular no Pix: sem rolagem lateral');
  await page.locator('#o-pix').scrollIntoViewIfNeeded();
  await foto(page, comCartao ? '4-pix-cel' : '4-pix-so-pix-cel');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 15000 });
  ok(true, 'recarregar: o mesmo Pix volta (nenhuma cobrança nova)');
  ok(await page.locator('#o-pronto').isHidden(), 'voltar para a página não confirma nada sozinho');
  await page.click('#o-pix-simular');
  await page.waitForSelector('#o-pronto:not([hidden])', { timeout: 20000 });
  ok(true, 'Pix confirmado pelo aviso assinado + consulta: projeto liberado');
}
