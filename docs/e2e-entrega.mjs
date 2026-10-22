/* A ENTREGA no E2E do orçamento (PR 3b-2). Recebe a página na tela do recibo (entrada paga, #o-pronto visível), no celular
   (390 px): confere o "Seu pedido", o link do pedido, o material (a logo e duas fotos vão DIRETO ao armazém local, não pelo
   Worker), o envio, a volta pelo link com o armazenamento apagado e as ações do link. Mesmo servidor do resto do E2E (armazém local,
   docs/servidor.mjs). Fica fora de docs/e2e-orcamento.mjs, que já passou do teto de 800 linhas. */
const FREIO_MS = 61e3;   /* o freio de 90 chamadas por minuto por IP (api/vendas.mjs): o resto do E2E já gasta a janela */

/* uma imagem de verdade, desenhada no próprio navegador (nada de arquivo no repositório) */
async function imagem(page, tipo, cor) {
  const bytes = await page.evaluate(async ([t, c]) => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
    const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 64, 48); g.fillStyle = '#fff'; g.fillRect(8, 8, 24, 16);
    const blob = await new Promise(r => cv.toBlob(r, t, 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, [tipo, cor]);
  return Buffer.from(bytes);
}
const passosDe = page => page.$$eval('#o-ped-passos .orc-passo', l => l.map(x => x.className.replace('orc-passo ', '')));

export async function passoDaEntrega(page, { ok, espera, foto, semRolagemLateral }) {
  const browser = page.context().browser();
  const origem = new URL(page.url()).origin;
  const novoAparelho = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); return { c, p: await c.newPage() }; };
  console.log('[e2e-entrega] esperando a janela do freio por IP esvaziar (61 s)');
  await new Promise(r => setTimeout(r, FREIO_MS));

  /* 1. Seu pedido */
  await page.waitForSelector('#o-pedido:not([hidden])', { timeout: 30000 });
  ok(/^Seu pedido · BZ-/.test((await page.textContent('#o-pedido .orc-pedido__rotulo')).trim()), 'Seu pedido: o código do pedido no topo');
  ok(JSON.stringify(await passosDe(page)) === JSON.stringify(['is-feito', 'is-agora', 'is-depois', 'is-depois']), 'Seu pedido: entrada feita, material agora, o resto depois');
  ok(/O prazo começa quando você enviar\./.test(await page.textContent('#o-ped-passos')), 'Seu pedido: "O prazo começa quando você enviar."');
  ok(!/A Beyon Zero fala com você/.test(await page.textContent('#o-pronto')), 'o recibo não manda esperar contato do dono (D1)');
  ok(await semRolagemLateral(page), 'celular em Seu pedido: sem rolagem lateral');
  await foto(page, '5-pedido-cel');

  /* 2. o link do pedido: num campo de leitura, nunca num href */
  await page.waitForSelector('#o-link:not([hidden])', { timeout: 20000 });
  let link = await page.inputValue('#o-link-campo');
  ok(/\/orcamento#pedido=[A-Za-z0-9_-]{32}$/.test(link), 'link do pedido: a forma e o código no # (' + link.replace(/#.*/, '#…') + ')');
  const codigoDe = l => l.split('#pedido=')[1];
  let codigo = codigoDe(link);
  ok(!(await page.$$eval('a[href], [data-wa]', l => l.some(a => (a.getAttribute('href') || '').includes('pedido=')))), 'nenhum href da página com o código do link');
  ok(!(await page.content()).includes('wa.me/?text'), 'nenhum wa.me/?text= na página');
  ok(await page.locator('#o-link-enviar').isHidden() || await page.evaluate(() => typeof navigator.share === 'function'), '"Mandar para mim" só aparece se o aparelho tem compartilhamento');
  /* 2b. M4: recarregou ANTES de copiar. O servidor já tem o link, mas o código só aparece uma vez: a tela não pode ficar sem saída */
  const linkAntes = link;
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-link:not([hidden])', { timeout: 30000 });
  ok(/Você ainda não guardou o link do seu pedido/.test(await page.textContent('#o-link-titulo')) && await page.locator('#o-link-gerar').isVisible() && await page.locator('#o-link-campo').isHidden(),
    'link que sumiu: depois de recarregar sem copiar, o cartão avisa e oferece "Gerar o link e guardar"');
  await page.click('#o-link-gerar');
  await page.waitForSelector('#o-link-campo:not([hidden])', { timeout: 20000 });
  link = await page.inputValue('#o-link-campo'); codigo = codigoDe(link);
  ok(link !== linkAntes && /\/orcamento#pedido=[A-Za-z0-9_-]{32}$/.test(link), 'link que sumiu: o link novo é outro (o anterior deixou de valer) e aparece para guardar');
  await page.click('#o-link-copiar');
  ok(await espera(page, () => document.getElementById('o-link').hidden || /copiad|selecionado/.test(document.getElementById('o-link-aviso').textContent), 8000), 'copiar o link: o cartão guarda e avisa');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-pedido:not([hidden])', { timeout: 30000 });
  ok(await page.locator('#o-link').isHidden(), 'depois de copiar, recarregar não mostra o cartão de novo (este aparelho lembra que guardou)');

  /* 3. o material */
  await page.waitForSelector('#o-material:not([hidden]) .orc-mat__bloco', { timeout: 20000 });
  const titulos = await page.$$eval('#o-mat-corpo .orc-mat__titulo', l => l.map(x => x.textContent));
  ok(JSON.stringify(titulos) === JSON.stringify(['1 · Logo e fotos', '2 · Contatos do site', '3 · Serviços', '4 · Onde e quando', '5 · Provas e depoimentos', '6 · Cor e envio']), 'material: os 6 blocos na ordem da spec');
  const salvo = () => espera(page, () => [...document.querySelectorAll('.orc-mat__salvo')].some(s => s.textContent === 'Salvo'), 10000);
  await page.check('#o-mat-whatsapp-pedido');
  ok(await espera(page, () => /\(\d{2}\) \d{4,5}-\d{4}/.test(document.getElementById('o-mat-whatsapp').value), 15000), 'material: "Usar o mesmo número do pedido" preenche o WhatsApp dos botões');
  await page.fill('#o-mat-corpo [aria-label="Serviço"]', 'Fisioterapia');
  ok(await salvo(), 'material: o campo é salvo sozinho ("Salvo")');
  await page.selectOption('#o-mat-negocio-uf', 'RJ');
  await page.fill('#o-mat-corpo [aria-label="Prova"]', 'orçamento por escrito');
  await salvo();
  const logo = await imagem(page, 'image/png', '#1a7f5a'), f1 = await imagem(page, 'image/jpeg', '#7a3e0b'), f2 = await imagem(page, 'image/jpeg', '#0b3e7a');
  await page.locator('#o-mat-corpo input[type=file]:not([multiple])').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
  await page.locator('#o-mat-corpo input[type=file][multiple]').setInputFiles([{ name: 'IMG_2231.jpg', mimeType: 'image/jpeg', buffer: f1 }, { name: 'IMG_2232.jpg', mimeType: 'image/jpeg', buffer: f2 }]);
  ok(await espera(page, () => document.querySelectorAll('#o-arq-logo .is-enviado, #o-arq-fotos .is-enviado').length === 3, 40000), 'material: 1 logo e 2 fotos enviadas direto ao armazém e conferidas');
  ok(await page.$$eval('#o-material .orc-arq__mini img', l => l.length === 3), 'material: as miniaturas saem do arquivo no aparelho (blob:, sem erro de CSP)');
  ok((await page.textContent('#o-arq-contador')).trim() === '2 de 20', 'material: "2 de 20" fotos');
  await page.locator('#o-mat-corpo input[type=file][multiple]').setInputFiles({ name: 'desenho.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  ok(await espera(page, () => /Use JPG, PNG ou WebP/.test(document.getElementById('o-arq-fotos').textContent), 8000), 'material: SVG recusado na linha do arquivo, em palavra simples');
  await page.click('#o-arq-fotos .is-erro .orc-arq__tirar');
  ok(/Falta: marcar a autorização \(6\)\./.test(await page.textContent('#o-mat-falta')) && await page.getAttribute('#o-mat-enviar', 'aria-disabled') === 'true', 'material: "Falta: marcar a autorização (6)." e o Enviar desligado');
  await page.check('#o-mat-aut');
  ok(await espera(page, () => document.getElementById('o-mat-falta').textContent === '' && document.getElementById('o-mat-enviar').getAttribute('aria-disabled') === 'false', 10000), 'material: com a caixa marcada o Enviar liga');
  /* celular primeiro: 390, depois 320 */
  const medidas = await page.evaluate(() => {
    const ctrl = [...document.querySelectorAll('#o-material button, #o-material select, #o-material input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=color])')].filter(e => e.offsetParent);
    return { baixos: ctrl.filter(e => e.offsetHeight < 44 && getComputedStyle(e).display !== 'none').map(e => e.tagName + ':' + (e.id || e.className)).slice(0, 5),
      miudos: [...document.querySelectorAll('#o-material input, #o-material select')].filter(e => e.offsetParent && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'file' && parseFloat(getComputedStyle(e).fontSize) < 16).length,
      borrado: [...document.querySelectorAll('#o-pedido, #o-pedido *, #o-material, #o-material *')].filter(e => { const s = getComputedStyle(e); return /blur/.test(s.filter + ' ' + s.backdropFilter) || /\)\s-?[\d.]+px\s-?[\d.]+px\s[1-9]/.test(s.boxShadow); }).length };
  });
  ok(medidas.baixos.length === 0, 'material: botões e campos com 44 px ou mais (' + medidas.baixos.join(', ') + ')');
  ok(medidas.miudos === 0, 'material: campos com 16 px ou mais (o iPhone não dá zoom)');
  ok(medidas.borrado === 0, 'Seu pedido e material: nenhum desfoque nem sombra difusa');
  ok(await semRolagemLateral(page), 'celular no material: sem rolagem lateral');
  await page.locator('#o-material').scrollIntoViewIfNeeded();
  await foto(page, '5a-material-cel');
  await page.setViewportSize({ width: 320, height: 700 });
  ok(await semRolagemLateral(page), '320 px no material: sem rolagem lateral');
  await foto(page, '5b-material-320');
  await page.setViewportSize({ width: 390, height: 844 });

  /* 4. enviar */
  await page.click('#o-mat-enviar');
  ok(await espera(page, () => /Recebido\. Previsão do seu site: \d+ de \w+\. Você vê a prévia aqui mesmo\./.test(document.getElementById('o-mat-corpo').textContent), 20000), 'enviar: "Recebido. Previsão do seu site: [data]. Você vê a prévia aqui mesmo."');
  ok(JSON.stringify(await passosDe(page)) === JSON.stringify(['is-feito', 'is-feito', 'is-agora', 'is-depois']), 'enviar: o passo 2 fecha e o 3 fica "agora"');
  ok(/Previsão do seu site: \d+ de \w+\./.test(await page.textContent('#o-ped-passos')), 'enviar: a data prevista também está nos passos');
  ok(await page.locator('#o-ped-agenda').isVisible(), 'enviar: "Pôr na minha agenda" aparece com a data');
  await foto(page, '5c-enviado-cel');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-material:not([hidden]) .orc-bloco__lead', { timeout: 20000 });
  ok(/Recebido\./.test(await page.textContent('#o-mat-corpo')) && await page.$$eval('#o-material img', l => l.length === 0), 'recarregar: o material vira só leitura, sem miniaturas (a página nunca baixa os arquivos de volta)');

  /* 5. o armazenamento apagado: volta pelo link guardado (o caso do Safari do iPhone) */
  console.log('[e2e-entrega] esperando a janela do freio por IP esvaziar (61 s)');
  await new Promise(r => setTimeout(r, FREIO_MS));
  const erros = [];
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('about:blank');
  await page.goto(origem + '/orcamento#pedido=' + codigo, { waitUntil: 'load' });
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.waitForSelector('#o-retomada:not([hidden])', { timeout: 20000 });
  ok(!page.url().includes('pedido='), 'volta pelo link: o código saiu da barra de endereço');
  ok(await page.locator('#o-ret-abrir').isVisible(), 'volta pelo link: "Abrir o meu pedido" (um toque da pessoa)');
  await page.click('#o-ret-abrir');
  await page.waitForSelector('#o-pedido:not([hidden])', { timeout: 30000 });
  ok(JSON.stringify(await passosDe(page)) === JSON.stringify(['is-feito', 'is-feito', 'is-agora', 'is-depois']), 'armazenamento apagado: o pedido volta pelo link, no passo em que parou');

  /* 6. o link é FIXO: abre em outro aparelho, de novo, e o primeiro perde o acesso */
  const b = await novoAparelho();
  await b.p.goto(origem + '/orcamento#pedido=' + codigo, { waitUntil: 'load' });
  await b.p.waitForSelector('#o-ret-abrir', { timeout: 20000 }); await b.p.click('#o-ret-abrir');
  await b.p.waitForSelector('#o-pedido:not([hidden])', { timeout: 30000 });
  ok(true, 'link fixo: o MESMO link abriu de novo em outro aparelho (usar não troca o link)');
  ok(await page.evaluate(() => window.BZOrcamento.estado().then(() => 0, e => e.status)) !== 0, 'o aparelho anterior perde o acesso ao abrir pelo link, como na retomada');

  /* 7. gerar um link novo (2 toques); o antigo morre */
  await b.p.click('#o-link-mais summary');
  await b.p.click('#o-link-novo');
  ok(/Confirmar/.test(await b.p.textContent('#o-link-novo')), 'link novo: o 1º toque pede a confirmação');
  await b.p.click('#o-link-novo');
  await b.p.waitForSelector('#o-link:not([hidden])', { timeout: 15000 });
  const novo = await b.p.inputValue('#o-link-campo');
  ok(novo !== link && /#pedido=/.test(novo), 'link novo: um código diferente, para guardar');
  const c = await novoAparelho();
  await c.p.goto(origem + '/orcamento#pedido=' + codigo, { waitUntil: 'load' });
  await c.p.waitForSelector('#o-ret-abrir', { timeout: 20000 }); await c.p.click('#o-ret-abrir');
  ok(await espera(c.p, () => /não vale mais|usado|venceu/.test(document.getElementById('o-ret-estado').textContent), 15000), 'link novo: o link antigo parou de valer');
  await c.c.close();
  link = novo; codigo = codigoDe(link);

  /* 8. continuar no computador: a retomada de 7 dias, uso único */
  await b.p.click('#o-link-outro');
  ok(await espera(b.p, () => /#retomar=/.test(document.getElementById('o-link-outro-campo').value), 15000), 'continuar no computador: o link de retomada aparece');
  const retomada = await b.p.inputValue('#o-link-outro-campo');
  const d = await novoAparelho();
  await d.p.goto(retomada, { waitUntil: 'load' });
  await d.p.waitForSelector('#o-ret-abrir', { timeout: 20000 }); await d.p.click('#o-ret-abrir');
  await d.p.waitForSelector('#o-pedido:not([hidden])', { timeout: 30000 });
  ok(true, 'continuar no computador: o pedido abriu no outro aparelho');
  const e2 = await novoAparelho();
  await e2.p.goto(retomada, { waitUntil: 'load' });
  await e2.p.waitForSelector('#o-ret-abrir', { timeout: 20000 }); await e2.p.click('#o-ret-abrir');
  ok(await espera(e2.p, () => /já foi usado|venceu|não vale/.test(document.getElementById('o-ret-estado').textContent), 15000), 'continuar no computador: uso único (a 2ª vez não abre)');
  for (const x of [d, e2]) await x.c.close();

  /* 9. sair deste aparelho: o link guardado deixa de valer, o aparelho esquece o pedido e a sessão morre no servidor (logout global; provado na Task 9) */
  await b.p.click('#o-link-sair');
  ok(/peça um link novo à Beyon Zero/.test(await b.p.textContent('#o-link-aviso')), 'sair deste aparelho: o aviso diz como voltar (pedir um link novo), sem link de WhatsApp (D3)');
  await b.p.click('#o-link-sair');
  await b.p.waitForSelector('#o-perguntas:not([hidden])', { timeout: 30000 });
  ok(await b.p.evaluate(() => localStorage.getItem('bz-orcamento')) === null, 'sair deste aparelho: a sessão foi esquecida');
  const f = await novoAparelho();
  await f.p.goto(origem + '/orcamento#pedido=' + codigo, { waitUntil: 'load' });
  await f.p.waitForSelector('#o-ret-abrir', { timeout: 20000 }); await f.p.click('#o-ret-abrir');
  ok(await espera(f.p, () => /não vale mais|usado|venceu/.test(document.getElementById('o-ret-estado').textContent), 15000), 'sair deste aparelho: o link guardado deixou de valer');
  for (const x of [b, f]) await x.c.close();
  ok(erros.length === 0, 'volta pelo link: sem erro de console' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
}
