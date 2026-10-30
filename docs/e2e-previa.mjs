/* A PRÉVIA, O AR E O RESTANTE no E2E do orçamento (PR 3b-3c). Recebe a página que acabou o passoDaEntrega (o material já ENVIADO; o pedido em produção) e a conversa;
   cada aparelho de que a pessoa precisa nasce aqui, com o seu IP, e entra pelo link de retomada de uso único que o dono gera no painel (o caminho real do aviso da D1).
   O dono age pela API do painel com a PAINEL_CHAVE do servidor local. Celular primeiro (390 px), depois 320 px.
   Fica fora de docs/e2e-orcamento.mjs, que já passou do teto de 800 linhas. Os helpers (ok, espera, foto, semRolagemLateral) são os do E2E; passosDe vem do e2e-entrega. */
import { FRASE_DESLIGADA } from '../api/_material/interruptor.mjs';
import { passosDe } from './e2e-entrega.mjs';

const CLIENTE = 'c-k7m3qa', PREVIA = 'https://v1.bz-c-k7m3qa.pages.dev', PREVIA2 = 'https://v2.bz-c-k7m3qa.pages.dev', SITE = 'https://clinicasol.com.br';
const CODIGO_LINK = /^[A-Za-z0-9_-]{32}$/;
const ESPERA = 30000;
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '52998224725' };

/* o dono, pelo painel, com a PAINEL_CHAVE do servidor local (nunca em arquivo do repositório) */
const HOSTS_LOCAIS = ['127.0.0.1', 'localhost', '[::1]'];
export function painelDe(origem, chave) {
  if (!HOSTS_LOCAIS.includes(new URL(origem).hostname)) throw new Error('painelDe: a chave do painel só vai para o servidor local (127.0.0.1, localhost ou [::1]), não para ' + new URL(origem).origin);
  return async (metodo, caminho, corpo) => {
    const r = await fetch(origem + '/api/painel' + (caminho || ''), { method: metodo, headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json().catch(() => ({})) };
  };
}
const voltaAba = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   /* o cliente voltou à aba (do WhatsApp): o estado recarrega */
const altura = (page, sel) => page.locator(sel).boundingBox().then(b => (b ? b.height : 0));
const aoTopo = (page, sel) => page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'start', behavior: 'instant' }), sel);
const reais = valor => 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: Number.isInteger(valor) ? 0 : 2, maximumFractionDigits: 2 }).format(valor);   /* como a tela escreve o dinheiro (sem os centavos quando são ,00) */
const semEspacoEstranho = t => t.replace(/\s/g, ' ');
/* "escondido" só vale se o id existe UMA vez na página: um id renomeado faria o isHidden() passar sem provar nada */
export const escondido = async (page, sel) => (await page.locator(sel).count()) === 1 && await page.locator(sel).isHidden();
const FRASE_AUTORIZACAO = 'Autorizo a Beyon Zero a usar este material';   /* o começo da frase fixa da autorização (a do material): conferida em literal, não só contra a constante do cliente */
const FRASE_FREIO = /Você já gerou links demais hoje\./;   /* api/_vendas/fluxo-link.mjs: o único 429 esperado */

/* a rodada com a entrega DESLIGADA (BZ_ENTREGA_LOCAL=desligada): só a frase do recibo e nada de Seu pedido, prévia nem site no ar */
export async function passoSemEntrega(page, { ok, semRolagemLateral }) {
  await page.waitForSelector('#o-pronto:not([hidden])', { timeout: ESPERA });
  ok((await page.textContent('#o-recibo .recibo__lead')).trim() === FRASE_DESLIGADA, 'entrega desligada: o recibo diz a frase "' + FRASE_DESLIGADA + '"');
  for (const id of ['o-pedido', 'o-material', 'o-previa', 'o-noar', 'o-fim']) ok(await escondido(page, '#' + id), 'entrega desligada: #' + id + ' existe e não aparece');
  ok(await semRolagemLateral(page), 'entrega desligada: sem rolagem lateral no recibo');
}

export async function passoDaPrevia(page, args) {
  const aparelhos = [];
  try { await rodar(page, args, aparelhos); } finally { for (const a of aparelhos) await a.ctx.close().catch(() => {}); }
}

async function rodar(page, { ok, espera, foto, semRolagemLateral, chave, conversaId }, aparelhos) {
  const browser = page.context().browser();
  const origem = new URL(page.url()).origin;
  const painel = painelDe(origem, chave);
  const erros = [];
  /* o link do pedido tem um limite por dia e por pedido (api/_vendas/fluxo-link.mjs, 429 com a saída pelo WhatsApp): o resto do E2E já gerou vários, então o 429 da criação automática do link neste aparelho é ESPERADO e a tela o trata em silêncio (garantirLink). Qualquer outro 429 é erro */
  const cont429 = { genericos: 0, links: 0, outros: 0 };
  let seqIp = 150;
  const novoAparelho = async () => {   /* (cada aparelho com o seu IP: o freio de sessão do servidor local é por IP) */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.' + (++seqIp) } });
    const p = await ctx.newPage();
    const aparelho = { ctx, p, perdeu: false };
    aparelhos.push(aparelho);
    p.on('console', m => { if (m.type() !== 'error' || /favicon/.test(m.text())) return; if (/status of 429/.test(m.text())) cont429.genericos++; else if (!(aparelho.perdeu && /status of 404/.test(m.text()))) erros.push(m.text()); });
    p.on('pageerror', e => erros.push(String(e)));
    p.on('response', async r => {
      if (r.status() !== 429) return;
      const u = new URL(r.url()), corpo = await r.json().catch(() => ({}));
      if (u.searchParams.get('acao') === 'link-pedido' && FRASE_FREIO.test(String(corpo.erro || ''))) cont429.links++;   /* só o freio do link, com a frase dele */
      else { cont429.outros++; erros.push('429 em ' + r.request().method() + ' ' + u.pathname + u.search + ' (' + String(corpo.erro || 'sem frase').slice(0, 60) + ')'); }   /* (diz QUAL chamada levou o freio) */
    });
    return aparelho;
  };
  const entrarPeloLink = async aparelho => {   /* o dono gera o link de retomada (uso único), o aparelho sem armazenamento o abre e toca "Abrir o meu pedido" */
    const r = await painel('POST', '', { link_retomada: conversaId });
    ok(r.status === 200 && CODIGO_LINK.test(r.corpo.codigo || ''), 'o dono gera o link de retomada de uso único');
    await aparelho.p.goto(origem + '/orcamento#retomar=' + r.corpo.codigo, { waitUntil: 'load', timeout: 90000 });
    await aparelho.p.waitForSelector('#o-ret-abrir', { timeout: 20000 });
    await aparelho.p.click('#o-ret-abrir');
    return r.corpo.codigo;
  };

  /* o link do WhatsApp do site (data-wa) leva só uma frase fixa em ?text=, com o código PÚBLICO do pedido (BZ-…, o mesmo que o cliente lê na tela e que o dono pede): nunca o código de retomada, o id da conversa nem um endereço com #. O que nunca pode existir é href com retomar= ou pedido= */
  const varrerLinks = async (p, onde, retomada) => {
    const hrefs = await p.$$eval('a[href]', l => l.map(a => a.getAttribute('href')));
    const textos = hrefs.filter(h => /[?&]text=/.test(h)).map(h => decodeURIComponent(h.split(/[?&]text=/)[1] || ''));
    const ruins = hrefs.filter(h => /retomar=|pedido=/.test(h)).concat(textos.filter(x => x.includes(retomada) || x.includes(conversaId) || /retomar=|pedido=|#/.test(x)));
    ok(ruins.length === 0, onde + ': nenhum link da página leva o código nem dado do pedido (' + hrefs.length + ' links, ' + textos.length + ' com frase fixa em ?text=)' + (ruins.length ? ': ' + ruins.slice(0, 3).join(' | ') : ''));
  };

  const codigo = ((await page.textContent('#o-ped-codigo').catch(() => '')) || '').trim() || ((await painel('GET', '?fila=entregas')).corpo.entregas || [])[0]?.codigo;
  ok(/^BZ-/.test(codigo || ''), 'a prévia: o código do pedido (' + codigo + ')');

  /* 0. o primeiro aparelho: o cliente abre o pedido (material enviado, prévia ainda não) */
  const A = await novoAparelho();
  await entrarPeloLink(A);
  await A.p.waitForSelector('#o-pedido:not([hidden])', { timeout: ESPERA });
  ok(JSON.stringify(await passosDe(A.p)) === JSON.stringify(['is-feito', 'is-feito', 'is-agora', 'is-depois']), 'antes da prévia: o passo 3 é o "agora"');
  ok(await escondido(A.p, '#o-previa') && await escondido(A.p, '#o-noar'), 'antes da prévia: nem prévia nem site no ar na tela');

  /* 1. o dono importa e publica; D5: ele NÃO põe no ar antes de o cliente aprovar, e a prévia de outro projeto é recusada */
  ok((await painel('POST', '', { importado: codigo, cliente: CLIENTE })).status === 200, 'o dono marca o pedido como importado');
  const cedo = await painel('POST', '', { no_ar: codigo, url: SITE });
  ok(cedo.status === 409 && /ainda não aprovou a prévia/.test(cedo.corpo.erro || ''), 'D5: sem prévia nenhuma, o dono não põe no ar (' + cedo.status + ': ' + (cedo.corpo.erro || '') + ')');
  const outro = await painel('POST', '', { previa: codigo, url: 'https://v1.bz-c-zzzzz2.pages.dev' });
  ok(outro.status === 422 && /de outro projeto/.test(outro.corpo.erro || ''), 'a prévia de outro projeto é recusada com o motivo (' + outro.status + ': ' + (outro.corpo.erro || '') + ')');
  ok((await painel('POST', '', { previa: codigo, url: PREVIA })).status === 200, 'o dono publica a prévia');
  const calado = await painel('POST', '', { no_ar: codigo, url: SITE });   /* D5 de verdade: a prévia está PUBLICADA e o cliente calado */
  ok(((await painel('GET', '?fila=entregas')).corpo.entregas || []).find(e => e.codigo === codigo)?.passo === 'previa', 'D5: a entrega está em "previa" (publicada, o cliente ainda não respondeu)');
  ok(calado.status === 409 && /ainda não aprovou a prévia/.test(calado.corpo.erro || ''), 'D5: com a prévia publicada e o cliente calado, o dono também não põe no ar (' + calado.status + ': ' + (calado.corpo.erro || '') + ')');

  /* 2. a volta à aba traz a prévia */
  await voltaAba(A.p);
  await A.p.waitForSelector('#o-previa:not([hidden])', { timeout: ESPERA });
  ok(/Sua prévia está pronta/.test(await A.p.textContent('#o-prv-titulo')), 'prévia: o título');
  ok(/Seu site só segue depois da sua resposta\./.test(await A.p.textContent('#o-prv-texto')), 'prévia: D5, "só segue depois da sua resposta"');
  ok(!/aprovad[ao]? (sozinh|automátic)|conta como aprovad|aprovação automática/i.test(await A.p.textContent('#o-previa')), 'prévia: nenhuma aprovação automática na tela');
  const ver = A.p.locator('#o-prv-ver');
  ok(await ver.getAttribute('href') === PREVIA && await ver.getAttribute('target') === '_blank' && /noopener/.test(await ver.getAttribute('rel')) && /noreferrer/.test(await ver.getAttribute('rel')), 'prévia: "Ver a prévia" abre em outra aba, seguro, no endereço conferido');
  ok(await altura(A.p, '#o-prv-aprovar') >= 44 && await altura(A.p, '#o-prv-ajustes') >= 44 && await altura(A.p, '#o-prv-ver') >= 44, 'prévia: os botões têm 44 px ou mais');
  ok(JSON.stringify(await passosDe(A.p)) === JSON.stringify(['is-feito', 'is-feito', 'is-agora', 'is-depois']), 'prévia: a lista de passos mantém o 3 "agora"');
  ok(await semRolagemLateral(A.p), 'celular na prévia: sem rolagem lateral');
  await aoTopo(A.p, '#o-previa');
  await foto(A.p, '6-previa-cel');
  await A.p.setViewportSize({ width: 320, height: 640 });
  ok(await semRolagemLateral(A.p), '320 px na prévia: sem rolagem lateral');
  await aoTopo(A.p, '#o-previa');
  await foto(A.p, '6b-previa-320');
  await A.p.setViewportSize({ width: 390, height: 844 });

  /* 3. a lista de ajustes: CPF recusado antes de enviar; a boa vai, o prazo volta a correr ("Previsão") e o dono a lê como DADO */
  await A.p.click('#o-prv-ajustes');
  ok(/Esta é a lista 1 de 2\./.test(await A.p.textContent('#o-prv-lista-n')), 'ajustes: "esta é a lista 1 de 2"');
  ok(/Enquanto espero a sua lista de ajustes, o prazo fica parado\./.test(await A.p.textContent('#o-prv-prazo')), 'ajustes: D4, o prazo fica parado');
  ok(/Telefone e e-mail escritos aqui são apagados\./.test(await A.p.textContent('#o-prv-aviso')) && /use os campos abaixo\./.test(await A.p.textContent('#o-prv-aviso')), 'ajustes: M3, o aviso de que telefone e e-mail escritos na lista são apagados e a saída pelos campos');
  await A.p.fill('#o-prv-lista', 'Meu CPF é 123.456.789-09'); await A.p.click('#o-prv-enviar');
  ok(/CPF/.test(await A.p.textContent('#o-prv-erro-form')), 'ajustes: CPF recusado na tela');
  ok(((await painel('GET', '?ajustes-previa=' + codigo)).corpo.ajustes || ['x']).length === 0, 'ajustes: nada foi enviado com o CPF');
  ok(await altura(A.p, '#o-prv-wa') >= 44 && await altura(A.p, '#o-prv-email') >= 44 && await altura(A.p, '#o-prv-lista') >= 44, 'ajustes: o texto e os campos do telefone e do e-mail têm 44 px ou mais');
  await A.p.fill('#o-prv-lista', 'Trocar a foto da capa e pôr o horário de sábado.');
  await A.p.fill('#o-prv-wa', 'abc'); await A.p.click('#o-prv-enviar');
  ok(/WhatsApp/.test(await A.p.textContent('#o-prv-erro-form')), 'ajustes: WhatsApp fora do formato é recusado na tela');
  await A.p.fill('#o-prv-wa', '(21) 97716-7944'); await A.p.fill('#o-prv-email', 'contato@clinicasol.com.br'); await A.p.click('#o-prv-enviar');
  ok(/autorização/i.test(await A.p.textContent('#o-prv-erro-form')), 'ajustes: trocar o contato exige a autorização de uso');
  const frase = await A.p.evaluate(() => window.BZMaterialEsquema.AUTORIZACAO.texto);
  const fraseNaTela = (await A.p.textContent('#o-prv-autoriza-texto')).trim();
  ok(fraseNaTela === frase && fraseNaTela.startsWith(FRASE_AUTORIZACAO) && frase.length > 20, 'ajustes: a frase da autorização é a constante do material e começa com "' + FRASE_AUTORIZACAO + '", inteira');
  ok(await A.p.evaluate(() => { const t = document.getElementById('o-prv-autoriza-texto'); return t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().right <= innerWidth; }), 'ajustes: a frase da autorização cabe inteira na tela');
  ok(await semRolagemLateral(A.p), 'celular na lista de ajustes com os campos: sem rolagem lateral');
  await aoTopo(A.p, '#o-prv-contato');
  await foto(A.p, '6c0-contato-cel');
  await A.p.check('#o-prv-autoriza'); await A.p.click('#o-prv-enviar');
  await A.p.waitForFunction(() => /Recebemos a sua lista/.test(document.getElementById('o-prv-titulo').textContent), null, { timeout: ESPERA });
  const textoRecebido = await A.p.textContent('#o-prv-texto');
  ok(/A nova prévia aparece aqui\./.test(textoRecebido) && /Previsão: \d+ de \S+\./.test(textoRecebido) && !/Pronto até/.test(textoRecebido), 'ajustes: recebido, com a "Previsão" (nunca "Pronto até", M2): ' + textoRecebido.trim());
  await aoTopo(A.p, '#o-previa');
  await foto(A.p, '6c-ajustes-cel');
  const lista = (await painel('GET', '?ajustes-previa=' + codigo)).corpo;
  const aj = (lista.ajustes || [])[0] || {};
  ok((lista.ajustes || []).length === 1 && aj.suspeito === false && /Trocar a foto/.test(aj.texto || ''), 'ajustes: o dono lê a lista como dado, sem selo de suspeito');
  ok(!!aj.contato && aj.contato.whatsapp === '+5521977167944' && aj.contato.email === 'contato@clinicasol.com.br' && !!aj.contato.autorizado_em && !/97716|clinicasol/.test(aj.texto || ''), 'ajustes (M3): telefone e e-mail chegam ao dono como dado à parte do texto, com a autorização');
  ok((await painel('POST', '', { previa: codigo, url: PREVIA2 })).status === 200, 'o dono publica a 2ª prévia');
  await voltaAba(A.p);
  await A.p.waitForFunction(() => /Esta é a lista 2 de 2\./.test(document.getElementById('o-prv-lista-n').textContent), null, { timeout: ESPERA });
  ok(/É a última/.test(await A.p.textContent('#o-prv-lista-n')), 'ajustes: a 2ª lista avisa que é a última (D2)');
  ok(await A.p.locator('#o-prv-ver').getAttribute('href') === PREVIA2, 'a 2ª prévia: "Ver a prévia" aponta para a prévia nova');

  /* 4. o aviso da D1 e a volta por ele: um aparelho SEM armazenamento (como o iPhone que apagou os dados) abre o link de retomada de uso único */
  const aviso = ((await painel('GET', '?fila=avisos')).corpo.itens || []).find(i => i.codigo === codigo);
  ok(!!aviso && aviso.momento === 'previa' && aviso.conversa_id === conversaId, 'D1: o aviso da prévia pronta está na fila do painel, com a conversa');
  A.perdeu = true;   /* (o aparelho B vai tomar o acesso: a aba A, parada, leva 404 se reler) */
  const B = await novoAparelho();
  const codigoDeB = await entrarPeloLink(B);
  await B.p.waitForSelector('#o-previa:not([hidden])', { timeout: ESPERA });
  ok(true, 'D1: o aparelho sem armazenamento caiu na prévia pelo link do aviso');
  await varrerLinks(B.p, 'na prévia', codigoDeB);
  ok(!B.p.url().includes('retomar='), 'o código de retomada saiu da barra de endereço');
  ok((await painel('POST', '', { aviso_feito: codigo, momento: 'previa' })).status === 200, 'D1: "já avisei" tira da fila');
  ok(!((await painel('GET', '?fila=avisos')).corpo.itens || []).some(i => i.codigo === codigo && i.momento === 'previa'), 'D1: o aviso da prévia saiu da fila');

  /* 5. aprovar (D5: só o cliente), com o <dialog>: Esc fecha e devolve o foco ao botão */
  await B.p.click('#o-prv-aprovar');
  ok(await B.p.evaluate(() => document.getElementById('o-prv-dialogo').open), 'aprovar: o dialog abre');
  ok(/Depois de aprovar, o próximo passo é pôr o site no ar\./.test(await B.p.textContent('#o-prv-dialogo')), 'aprovar: a frase do contrato no dialog');
  const fundo = await B.p.evaluate(() => {
    const x = getComputedStyle(document.getElementById('o-prv-dialogo'), '::backdrop');
    const regras = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).filter(r => r.selectorText && /::backdrop/.test(r.selectorText));
    return { cor: x.backgroundColor, filtro: x.backdropFilter + ' ' + x.filter, regras: regras.length, comBlur: regras.filter(r => /blur|backdrop-filter|filter/.test(r.cssText)).length };
  });
  ok(fundo.regras >= 1 && fundo.comBlur === 0 && !/blur/.test(fundo.filtro) && fundo.cor !== 'rgba(0, 0, 0, 0)' && fundo.cor !== 'transparent', 'aprovar: o fundo do dialog escurece (' + fundo.cor + ', ' + fundo.regras + ' regra de ::backdrop) sem desfoque nenhum');
  await B.p.keyboard.press('Escape');
  ok(await B.p.evaluate(() => !document.getElementById('o-prv-dialogo').open && document.activeElement.id === 'o-prv-aprovar'), 'aprovar: Esc fecha e o foco volta ao botão');
  ok((await painel('GET', '?fila=entregas')).corpo.entregas.find(e => e.codigo === codigo).passo === 'previa', 'aprovar: nada foi aprovado só por abrir e fechar o dialog');
  await B.p.click('#o-prv-aprovar'); await B.p.click('#o-prv-confirmar');
  await B.p.waitForFunction(() => /Prévia aprovada/.test(document.getElementById('o-prv-titulo').textContent), null, { timeout: ESPERA });
  ok(await escondido(B.p, '#o-prv-botoes'), 'aprovada: os botões de aprovar e de ajustes somem');
  await aoTopo(B.p, '#o-previa');
  await foto(B.p, '6d-aprovada-cel');

  /* 6. o dono põe no ar; o aviso do ar; o cliente vê o ar e o Pix do restante (o mesmo componente da entrada, só Pix) */
  ok((await painel('POST', '', { no_ar: codigo, url: SITE })).status === 200, 'o dono põe o site no ar');
  const avisos = (await painel('GET', '?fila=avisos')).corpo.itens || [];
  ok(avisos.some(i => i.codigo === codigo && i.momento === 'no_ar') && !avisos.some(i => i.codigo === codigo && i.momento === 'previa'), 'D1: o aviso do site no ar está na fila (e o da prévia não)');
  ok((await painel('POST', '', { aviso_feito: codigo, momento: 'no_ar' })).status === 200, 'D1 (22/10): o dono registra o aviso "site no ar": daqui contam os 3 dias do restante');
  const susp = await painel('POST', '', { suspender: codigo });
  ok(susp.status === 409 && /Ainda não: o aviso do site no ar foi há/.test(susp.corpo.erro || ''), '22/10: o site não sai do ar antes do fim do 3º dia do aviso (' + susp.status + ': ' + (susp.corpo.erro || '') + ')');
  await voltaAba(B.p);
  await B.p.waitForSelector('#o-noar:not([hidden])', { timeout: ESPERA });
  ok(/Seu site está no ar/.test(await B.p.textContent('#o-noar-titulo')), 'no ar: o título');
  ok(await B.p.locator('#o-noar-endereco').textContent() === SITE, 'no ar: o endereço do site em texto');
  ok(await B.p.getAttribute('#o-noar-abrir', 'href') === SITE && /noopener/.test(await B.p.getAttribute('#o-noar-abrir', 'rel')) && await B.p.getAttribute('#o-noar-abrir', 'target') === '_blank', 'no ar: "Abrir o site" abre em outra aba, seguro');
  ok(/Se o restante não for pago em 3 dias depois do meu aviso de que o site está no ar, o site sai do ar até o pagamento\./.test(await B.p.textContent('#o-noar')), 'no ar: a frase da D4 (3 dias, 22/10) exata');
  ok(await B.p.evaluate(() => { const n = document.getElementById('o-noar'), p = document.getElementById('o-pagamento'); return !p.hidden && !!(n.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'restante: o Pix vem depois do "no ar" no DOM e está visível');
  ok(await escondido(B.p, '#o-previa') && await escondido(B.p, '#o-fim'), 'no ar: a prévia e o fim não aparecem');
  ok(await escondido(B.p, '#o-pag-metodos') && await escondido(B.p, '#o-pix-trocar'), 'restante: só Pix (o seletor de cartão e o "trocar" ficam escondidos)');
  ok(/Falta o restante/.test(await B.p.textContent('#o-pag-titulo')), 'restante: o título "Falta o restante"');
  const conta = await B.p.evaluate(async () => { const E = await window.BZOrcamento.estado(); const paga = (E.pagamentos || []).find(p => p.parcela === 'sinal' && p.status === 'pago'); return { total: Number(E.proposta.valor_total), entrada: paga ? Number(paga.valor) : null }; });
  const esperado = reais(Math.round((conta.total - conta.entrada) * 100) / 100);
  const botao = semEspacoEstranho((await B.p.textContent('#o-pag-enviar')).trim());
  ok(conta.entrada > 0 && botao === 'Gerar o Pix de ' + esperado, 'restante: o botão traz total − entrada (' + reais(conta.total) + ' − ' + reais(conta.entrada) + ' = ' + esperado + '): "' + botao + '"');
  ok(await altura(B.p, '#o-pag-enviar') >= 44 && await altura(B.p, '#o-noar-abrir') >= 44, 'no ar: "Abrir o site" e o botão do Pix têm 44 px ou mais');
  ok(await B.p.evaluate(() => [...document.querySelectorAll('#o-noar, #o-noar *, #o-pagamento, #o-pagamento *')].every(e => { const s = getComputedStyle(e); return !/blur/.test(s.filter + ' ' + s.backdropFilter) && !/\)\s-?[\d.]+px\s-?[\d.]+px\s[1-9]/.test(s.boxShadow); })), 'no ar: nenhum desfoque nem sombra difusa');
  await varrerLinks(B.p, 'no ar', codigoDeB);
  ok(await semRolagemLateral(B.p), 'celular no ar: sem rolagem lateral');
  await aoTopo(B.p, '#o-noar');
  await foto(B.p, '7-noar-cel');
  await B.p.setViewportSize({ width: 320, height: 640 });
  ok(await semRolagemLateral(B.p), '320 px no ar: sem rolagem lateral');
  await aoTopo(B.p, '#o-noar');
  await foto(B.p, '7b-noar-320');
  await B.p.setViewportSize({ width: 390, height: 844 });

  /* 7. o restante: o pagador, o Pix e o simulador local (o aviso assinado passa pelo caminho real) */
  await B.p.fill('#o-pag-nome', PAGADOR.nome); await B.p.fill('#o-pag-sobrenome', PAGADOR.sobrenome);
  await B.p.fill('#o-pag-email', PAGADOR.email); await B.p.fill('#o-pag-doc', PAGADOR.documento);
  await B.p.click('#o-pag-enviar');
  await B.p.waitForSelector('#o-pix:not([hidden])', { timeout: ESPERA });
  ok(semEspacoEstranho(await B.p.textContent('#o-pix-valor')).includes(esperado), 'restante: o Pix mostra o mesmo valor (' + esperado + ')');
  ok(await escondido(B.p, '#o-pix-trocar'), 'restante: no Pix, sem "Prefiro pagar com cartão"');
  await aoTopo(B.p, '#o-pix');
  await foto(B.p, '7c-pix-restante-cel');
  ok(await escondido(B.p, '#o-fim'), 'restante: antes de pagar o fim continua escondido');
  ok(((await painel('GET', '?fila=entregas')).corpo.entregas || []).some(e => e.codigo === codigo), 'restante: antes de pagar o pedido ainda está na lista do dono');
  await B.p.click('#o-pix-simular');
  await B.p.waitForSelector('#o-fim:not([hidden])', { timeout: 40000 });
  ok(/Pedido concluído/.test(await B.p.textContent('#o-fim-titulo')), 'fim: "Pedido concluído"');
  const entradaTxt = semEspacoEstranho(await B.p.textContent('#o-fim-entrada')), restanteTxt = semEspacoEstranho(await B.p.textContent('#o-fim-restante')), totalTxt = semEspacoEstranho(await B.p.textContent('#o-fim-total'));
  ok(entradaTxt === reais(conta.entrada) && restanteTxt === esperado && totalTxt === reais(conta.total), 'fim: as duas partes ✓ e o total conferem (' + entradaTxt + ' + ' + restanteTxt + ' = ' + totalTxt + ')');
  ok(/Entrada paga/.test(await B.p.textContent('#o-fim-partes')) && /Restante pago/.test(await B.p.textContent('#o-fim-partes')), 'fim: "Entrada paga" e "Restante pago"');
  ok(await B.p.locator('#o-fim-endereco').textContent() === SITE && await B.p.getAttribute('#o-fim-abrir', 'href') === SITE, 'fim: o endereço e "Abrir o site"');
  ok(await escondido(B.p, '#o-noar') && await escondido(B.p, '#o-pagamento') && await escondido(B.p, '#o-pedido') && await escondido(B.p, '#o-previa'), 'fim: o ar, o Pix, o pedido e a prévia saem de cena');
  ok(await B.p.evaluate(() => document.querySelector('#o-etapas [aria-current]').dataset.passo) === 'pagamento', 'fim: a barra de etapas fica no passo "pagamento"');
  await varrerLinks(B.p, 'no fim', codigoDeB);
  ok(await semRolagemLateral(B.p), 'celular no fim: sem rolagem lateral');
  await aoTopo(B.p, '#o-fim');
  await foto(B.p, '8-fim-cel');
  await B.p.setViewportSize({ width: 320, height: 640 });
  ok(await semRolagemLateral(B.p), '320 px no fim: sem rolagem lateral');
  await aoTopo(B.p, '#o-fim');
  await foto(B.p, '8b-fim-320');
  await B.p.setViewportSize({ width: 390, height: 844 });

  /* 8. o dono não vê mais o pedido na lista; ao recarregar o fim continua; nenhuma tela deu erro de console */
  ok(!((await painel('GET', '?fila=entregas')).corpo.entregas || []).some(e => e.codigo === codigo), 'o pedido concluído sai da lista do dono');
  await B.p.reload({ waitUntil: 'load' });
  await B.p.waitForSelector('#o-fim:not([hidden])', { timeout: ESPERA });
  ok(/Pedido concluído/.test(await B.p.textContent('#o-fim-titulo')) && await escondido(B.p, '#o-pagamento'), 'fim: recarregar a página continua no pedido concluído, sem Pix');
  if (cont429.genericos > cont429.links + cont429.outros) erros.push('429 no console sem chamada que o explique (' + cont429.genericos + ' avisos, ' + cont429.links + ' do link do pedido, ' + cont429.outros + ' outras)');
  console.log('[e2e-previa] 429 do limite diário do link do pedido, tratados em silêncio pela tela: ' + cont429.links);
  ok(erros.length === 0, 'prévia ao fim: sem erro de console' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
}
