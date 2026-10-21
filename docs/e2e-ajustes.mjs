/* O PASSO DOS AJUSTES no E2E do orçamento (PR 3a). Fica fora de docs/e2e-orcamento.mjs, que já passou do teto de 800 linhas
   (pendência PR2b2-M3). Recebe a página na etapa "escolhida" (modelo 2), no celular (390 px), e a deixa com um ajuste
   aplicado e um pedido livre na fila. Sem IA: o mesmo caminho com e sem o consultor (CONSULTOR=1). */
export async function passoDosAjustes(page, { ok, espera, foto, semRolagemLateral, forcar }) {
  const aj = page.locator('#o-ajustes');
  const cores1 = aj.getByRole('button', { name: 'Usar as cores do modelo 1' });
  ok(await cores1.isVisible(), 'ajustes: as cores dos outros modelos (o 1, com o 2 escolhido)');
  ok(Math.round((await cores1.boundingBox()).height) >= 44, 'ajustes: botão com 44 px de altura ou mais');
  ok(await aj.getByText('Seu pedido entra junto; não atrasa o início.').isVisible(), 'pedido livre: a frase de que não atrasa o início');
  ok(await aj.getByText('Não escreva seu nome, telefone, e-mail, CPF nem dados de outras pessoas.').isVisible(), 'pedido livre: o aviso manda não escrever nome nem contato');
  ok(await page.evaluate(() => ['o-livre-resposta', 'o-livre-erro'].every(id => getComputedStyle(document.getElementById(id)).display !== 'none')), 'pedido livre: as regiões vivas (resposta e erro) ficam na árvore de acessibilidade, vazias e sem display:none');
  ok(await page.evaluate(() => document.getElementById('o-livre-fora').hidden), 'pedido livre: com o pedido confirmado, o formulário vale (a frase do WhatsApp fica escondida)');
  await aj.scrollIntoViewIfNeeded();
  await foto(page, '8-ajustes-topo');
  await cores1.click();
  const aviso = page.locator('#o-aj-aviso');
  ok(await aviso.isVisible() && (await aviso.textContent()).includes('Depois disso, não dá para trocar de modelo. Continuar?'), 'ajustes: o 1º ajuste pergunta antes');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'o-aj-aviso-nao'), 'ajustes: o foco começa em "Voltar"');
  await foto(page, '8-ajustes-aviso');
  /* Esc equivale a "Voltar": fecha sem ajustar e o foco volta ao botão tocado */
  await page.keyboard.press('Escape');
  ok(await aviso.isHidden() && await page.evaluate(() => document.activeElement && document.activeElement.textContent === 'Usar as cores do modelo 1'), 'ajustes: Esc fecha o aviso e o foco volta ao botão tocado');
  ok(await page.locator('#o-mudancas li').count() === 0, 'ajustes: Esc não aplicou nada');
  /* os botões novos falam como gente: Sora, frase normal, 16 px ou mais (o .btn de base.css é mono e caixa alta) */
  const estilo = await cores1.evaluate(b => { const s = getComputedStyle(b); return { fonte: s.fontFamily, caixa: s.textTransform, tamanho: parseFloat(s.fontSize) }; });
  ok(/Sora/.test(estilo.fonte) && estilo.caixa === 'none' && estilo.tamanho >= 16, 'ajustes: botão em Sora, frase normal e 16 px ou mais (' + estilo.fonte.split(',')[0] + ', ' + estilo.caixa + ', ' + estilo.tamanho + ' px)');
  /* F2: a resposta se perde na volta (o servidor JÁ gravou o ajuste): a tela relê, vê que entrou e não manda tentar de novo */
  const eAjustar = url => url.searchParams.get('acao') === 'ajustar';
  forcar(true);   /* (o erro de rede que o próprio teste força não é erro da página) */
  await page.route(eAjustar, async rota => { await rota.fetch(); await rota.abort('timedout'); });
  await cores1.click();
  await page.click('#o-aj-aviso-sim');
  ok(await espera(page, () => document.querySelectorAll('#o-mudancas li.is-ok').length === 1, 15000), 'ajustes: a opção pronta aplicada e listada');
  await page.unroute(eAjustar);
  forcar(false);
  ok((await page.textContent('#o-aj-resposta')).trim() === 'Feito: Cores do modelo 1.', 'ajustes: a resposta diz o que foi feito');
  ok(await page.locator('#o-aviso').isHidden() && await page.locator('#o-mudancas li').count() === 1, 'ajustes: resposta perdida na volta, mas o ajuste entrou: sem aviso de erro e sem repetir (1 só na lista)');
  ok(await page.getByRole('button', { name: 'Escolher esta' }).count() === 0, 'ajustes: depois do 1º ajuste não há mais troca de modelo');
  await page.click('#o-aj-desfazer');
  ok(await espera(page, () => !!document.querySelector('#o-mudancas li.is-desfeita') && !document.querySelector('#o-versao button'), 15000), 'ajustes: desfazer volta a versão anterior (sem "Abrir a sua versão")');
  ok(await espera(page, () => document.getElementById('o-aj-desfazer').hidden && document.activeElement && document.activeElement.id === 'o-aj-titulo', 5000), 'ajustes: sem nada para desfazer, o botão some e o foco vai para o título da seção (não se perde)');
  await aj.getByRole('button', { name: /^Descer a seção/ }).first().click();
  ok(await aviso.isHidden(), 'ajustes: depois do 1º, sem a pergunta de novo');
  ok(await espera(page, () => document.querySelectorAll('#o-mudancas li.is-ok').length === 1 && !!document.querySelector('#o-versao button'), 15000), 'ajustes: outra opção aplicada (a versão volta)');
  await page.fill('#o-livre-texto', 'Quero o mapa da clínica no rodapé');
  await page.click('#o-livre-form button[type=submit]');
  ok(await espera(page, () => /Você pode fazer mais 2 pedidos\./.test(document.getElementById('o-livre-conta').textContent)
    && [...document.querySelectorAll('#o-mudancas li')].some(li => li.textContent === 'Aguardando: Quero o mapa da clínica no rodapé'), 15000),
    'pedido livre: enviado, na lista como "Aguardando" e com a conta de pedidos');
  ok((await page.textContent('#o-livre-resposta')).trim() === 'Pedido enviado. Você pode fazer mais 2 pedidos.' && await page.locator('#o-aj-resposta').textContent() === '', 'pedido livre: a confirmação aparece junto do formulário');
  ok(await page.locator('#o-aviso').isHidden(), 'pedido livre: nenhum aviso de erro');
  ok(await semRolagemLateral(page), 'ajustes: celular sem rolagem lateral');
  await aj.scrollIntoViewIfNeeded();
  await foto(page, '8-ajustes-cel');
  await page.setViewportSize({ width: 320, height: 700 });
  ok(await semRolagemLateral(page) && await aj.evaluate(e => e.getBoundingClientRect().right <= innerWidth), 'ajustes: 320 px, nada mais largo que a tela');
  await foto(page, '8-ajustes-320');
  await page.setViewportSize({ width: 390, height: 844 });
}
