/* A CONFIRMAÇÃO DA ENTRADA POR E-MAIL (decisões do dono, 14 e 15/11/2026): depois do Pix (ou cartão) da entrada aprovado, quem pagou
   recebe um e-mail do Resend, uma vez só. Aqui, com o fetch do Resend SIMULADO (nenhum e-mail real sai): os campos certos, nada sem a
   chave, nunca duas vezes (aviso repetido, consulta e reconciliação), falha do Resend que não mexe no pagamento, escape de HTML, e a
   reconciliação que recupera a confirmação que ficou para trás. O banco é o real (PGlite) e o Mercado Pago o simulador fiel.
   npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { receber } from '../../api/pagamentos.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { criarServicoPagamentos, validarPagador } from '../../api/_pagamentos/servico.mjs';
import { criarConfirmacao, confirmacaoDoAmbiente, textoDaConfirmacao, escaparHtml, htmlDe, confirmarEntradas, linkDoPedido, RESEND_URL, REMETENTE, RESPONDER_PARA }
  from '../../api/_pagamentos/confirmacao.mjs';
import { CODIGO_LINK, hashDoLink } from '../../api/_vendas/link-pedido.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
const CHAVE = 're_teste_0123456789abcdef';
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'Ana@Exemplo.com', documento: '529.982.247-25' };
/* (revisão de segurança do #172) o e-mail só com caracteres PERMITIDOS: nada de <, >, aspas, vírgula, espaço, quebra de linha */
const EMAILS_RUINS = ['a<b@x.com', 'a>b@x.com', '"a"@x.com', 'a,b@x.com', 'a b@x.com', 'a@b.com\n', 'a@b.com\r\nBcc: c@d.com', 'a@x.com,b@y.com',
  "o'a@x.com", 'a..b@x.com', '.a@x.com', 'a@-x.com', 'a@x', 'a@x.c', 'á@x.com', 'a@x.com>', 'a@[1.2.3.4]'];
const EMAILS_BONS = ['ana@exemplo.com', 'ana.souza+site@empresa.com.br', 'a_b-c%d@sub.dominio-x.com.br'];
const ITEM = { tentativa_id: '5c3803cf-5129-4e83-bb3c-a98590a7e704', email: 'cliente@empresa.com.br', valor: 1200, metodo: 'pix', prazo_dias: 10 };

/* o Resend de mentira: guarda cada chamada e responde como o de verdade (200 com id), ou com a falha pedida */
function resendFalso({ falha = null } = {}) {
  const chamadas = [];
  const buscar = async (url, init = {}) => {
    chamadas.push({ url, metodo: init.method, cabecalhos: init.headers, corpo: JSON.parse(init.body), sinal: init.signal });
    if (falha === 'rede') throw new TypeError('fetch failed');
    if (falha === 'tempo') return new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(init.signal.reason)));
    if (typeof falha === 'number') return new Response(JSON.stringify({ name: 'erro', message: 'x' }), { status: falha });
    return new Response(JSON.stringify({ id: 'email-' + chamadas.length }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { buscar, chamadas };
}
/* o console capturado: o que foi para o log (para provar que a chave e o e-mail não vão) */
async function comLog(fn) {
  const linhas = [], antigos = { error: console.error, warn: console.warn, log: console.log };
  for (const k of Object.keys(antigos)) console[k] = (...a) => linhas.push(a.map(String).join(' '));
  try { return { r: await fn(), linhas }; } finally { Object.assign(console, antigos); }
}

/* ======================= o módulo, sozinho ======================= */
test('envia UMA chamada ao Resend com os campos certos: remetente, resposta, destinatário, assunto, HTML, texto e a chave de idempotência', async () => {
  const f = resendFalso();
  const c = criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true });
  assert.equal(c.ligada, true);
  const r = await c.enviar(ITEM);
  assert.deepEqual(r, { enviado: true, id: 'email-1' });
  assert.equal(f.chamadas.length, 1);
  const [ch] = f.chamadas;
  assert.equal(ch.url, RESEND_URL); assert.equal(RESEND_URL, 'https://api.resend.com/emails');
  assert.equal(ch.metodo, 'POST');
  assert.equal(ch.cabecalhos.authorization, 'Bearer ' + CHAVE);
  assert.equal(ch.cabecalhos['content-type'], 'application/json');
  assert.equal(ch.cabecalhos['idempotency-key'], 'confirmacao-entrada/' + ITEM.tentativa_id, 'o Resend também não manda duas vezes a mesma');
  assert.ok(ch.sinal instanceof AbortSignal, 'com tempo máximo');
  assert.equal(REMETENTE, 'Beyon Zero <pedidos@beyonzero.com.br>'); assert.equal(RESPONDER_PARA, 'contato.beyon.zero@gmail.com');
  assert.deepEqual(Object.keys(ch.corpo).sort(), ['from', 'html', 'reply_to', 'subject', 'text', 'to']);
  assert.equal(ch.corpo.from, REMETENTE);
  assert.equal(ch.corpo.reply_to, RESPONDER_PARA);
  assert.deepEqual(ch.corpo.to, ['cliente@empresa.com.br']);
  assert.match(ch.corpo.subject, /entrada/i);
  assert.match(ch.corpo.html, /^<!DOCTYPE html>/);
  for (const t of [ch.corpo.text, ch.corpo.html.replace('<!DOCTYPE html>', '')]) {
    assert.match(t, /R\$ 1\.200,00/, 'o valor da entrada'); assert.match(t, /Pix/); assert.match(t, /10 dias úteis/, 'o prazo da proposta');
    assert.match(t, /responder este e-mail/, 'como falar com a gente'); assert.match(t, /Beyon Zero/);
    assert.doesNotMatch(t, /Fernando/i, 'anonimato: nunca o nome do dono');
    assert.doesNotMatch(t, /—|pequen[oa]s? (neg[oó]cio|empresa)|\bPME\b|!/, 'sem travessão, sem exclamação, sem "pequenos negócios"');
  }
});

test('sem a chave (teste, prévia): não envia, não chama o fetch, e diz por quê', async () => {
  const f = resendFalso();
  for (const chave of [undefined, '', '   ', 'com espaço dentro', 'x'.repeat(300)]) {
    const c = criarConfirmacao({ chave, fetch: f.buscar });
    assert.equal(c.ligada, false, String(chave));
    assert.deepEqual(await c.enviar(ITEM), { enviado: false, motivo: 'sem chave' });
  }
  assert.equal(confirmacaoDoAmbiente({}).ligada, false);
  assert.equal(confirmacaoDoAmbiente({ RESEND_API_KEY: CHAVE }).ligada, true, 'lê EXATAMENTE env.RESEND_API_KEY');
  assert.equal(f.chamadas.length, 0);
});

test('falha do Resend (recusa, rede, tempo): nunca lança, devolve o motivo, e nem a chave nem o e-mail vão para o motivo', async () => {
  for (const falha of [500, 422, 'rede', 'tempo']) {
    const f = resendFalso({ falha });
    const c = criarConfirmacao({ chave: CHAVE, fetch: f.buscar, timeoutMs: 30 });
    const r = await c.enviar(ITEM);
    assert.equal(r.enviado, false, String(falha));
    assert.ok(r.motivo, String(falha));
    assert.doesNotMatch(JSON.stringify(r), new RegExp(CHAVE + '|cliente@empresa'), 'nada sensível no motivo');
  }
  const c = criarConfirmacao({ chave: CHAVE, fetch: resendFalso().buscar });
  for (const ruim of [{ ...ITEM, email: 'sem-arroba' }, { ...ITEM, email: 'a@b.com\r\nBcc: x@y.com' }, { ...ITEM, valor: 'abc' }, { ...ITEM, valor: -5 }, { ...ITEM, tentativa_id: 'x' }]) {
    assert.equal((await c.enviar(ruim)).enviado, false, 'dado ruim não sai: ' + JSON.stringify(ruim));
  }
});

test('o e-mail só passa com caracteres permitidos, igual na página (validarPagador) e no envio', async () => {
  const c = criarConfirmacao({ chave: CHAVE, fetch: resendFalso().buscar });
  /* (a página apara as pontas: "a@b.com\n" chega como "a@b.com"; a quebra de linha não sobra) */
  assert.equal(validarPagador({ nome: 'Ana', sobrenome: 'Souza', email: 'a@b.com\n', documento: '529.982.247-25' }).dados.email, 'a@b.com');
  for (const ruim of EMAILS_RUINS) {
    if (ruim.trim() === ruim) assert.equal(validarPagador({ nome: 'Ana', sobrenome: 'Souza', email: ruim, documento: '529.982.247-25' }).erro, 'Informe um e-mail válido.', 'pagar: ' + JSON.stringify(ruim));
    assert.deepEqual(await c.enviar({ ...ITEM, email: ruim }), { enviado: false, motivo: 'dado inválido' }, 'enviar: ' + JSON.stringify(ruim));
  }
  for (const bom of EMAILS_BONS) {
    assert.equal(validarPagador({ nome: 'Ana', sobrenome: 'Souza', email: bom, documento: '529.982.247-25' }).erro, undefined, bom);
    assert.equal((await c.enviar({ ...ITEM, email: bom })).enviado, true, bom);
  }
  assert.equal(validarPagador({ nome: 'Ana', sobrenome: 'Souza', email: 'a'.repeat(65) + '@x.com', documento: '529.982.247-25' }).erro, 'Informe um e-mail válido.', 'parte local acima de 64');
});

test('escape de HTML em tudo o que entra no corpo; método e prazo fora do esperado somem em vez de entrar crus', () => {
  assert.equal(escaparHtml(`<script>alert("x")</script> & 'y'`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  const html = htmlDe(['a <b>negrito</b> & "aspas"']);
  assert.match(html, /a &lt;b&gt;negrito&lt;\/b&gt; &amp; &quot;aspas&quot;/);
  assert.doesNotMatch(html, /<b>|<script/i);
  const t = textoDaConfirmacao({ valor: 1200, metodo: '<img src=x onerror=alert(1)>', prazoDias: '<b>9</b>', entrega: true });
  assert.doesNotMatch(t.html + t.texto, /<img|onerror|<b>9/);
  assert.doesNotMatch(t.texto, /dias úteis/, 'prazo inválido: a frase do prazo sai (não se inventa prazo)');
  assert.doesNotMatch(textoDaConfirmacao({ valor: 1200, metodo: 'pix', prazoDias: null, entrega: true }).texto, /dias úteis/);
  assert.doesNotMatch(textoDaConfirmacao({ valor: 1200, metodo: 'pix', prazoDias: 61, entrega: true }).texto, /dias úteis/, 'acima do máximo do banco');
  assert.match(textoDaConfirmacao({ valor: 1200, metodo: 'cartao', prazoDias: 1, entrega: true }).texto, /no cartão.*\n[\s\S]*1 dia útil/);
});

test('o próximo passo segue o interruptor da entrega: ligada, o material pela página do pedido; desligada, a gente entra em contato', () => {
  const ligada = textoDaConfirmacao({ valor: 1200, metodo: 'pix', prazoDias: 10, entrega: true }).texto;
  const desligada = textoDaConfirmacao({ valor: 1200, metodo: 'pix', prazoDias: 10, entrega: false }).texto;
  assert.match(ligada, /página do pedido/); assert.doesNotMatch(desligada, /página do pedido/);
  assert.match(desligada, /entra(r)? em contato|vai falar com você/);
  assert.equal(confirmacaoDoAmbiente({ RESEND_API_KEY: CHAVE }).entrega, false, 'BZ_ENTREGA ausente = desligada');
  assert.equal(confirmacaoDoAmbiente({ RESEND_API_KEY: CHAVE, BZ_ENTREGA: 'ligada' }).entrega, true);
});

/* ======================= o caminho inteiro: página → Pix → aviso do Mercado Pago → banco → e-mail ======================= */
let local, sim, cfg, ip = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  sim = local.mp.sim;
  cfg = { ...configPagamentos({}), intervaloAposRecusaS: 0 };
});
const servicoCom = (confirmacao, banco = local.rpc) => criarServicoPagamentos({ banco, cfg, confirmacao });
function navegador(servico, env = {}) {
  const deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: servico };
  const meuIp = '198.51.100.' + (++ip % 250);
  let token = null;
  const chamar = async (metodo, acao, corpo, extra = {}) => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + (extra.query || ''), {
      method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': meuIp, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
    }), env, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo; } };
}
/* até o Pix gerado (sinal de R$ 3.340: institucional 7900 + agendamento 450, 40%) */
async function ateOPix(servico) {
  const n = navegador(servico);
  const s = await n.iniciar(), c = s.conversa_id;
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Tenho um estúdio de pilates e quero um site institucional para agendamentos' });
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'sim' });
  await detalhesEConfirmar(n.chamar, local.rpc, c, { nome: 'Ana' });
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  for (const d of g.corpo.direcoes) await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: g.corpo.direcoes[0].id });
  const esc = await n.chamar('POST', 'escopo', { conversa_id: c });
  await n.chamar('POST', 'confirmar', { conversa_id: c, proposta_id: esc.corpo.proposta_id, confirmo: true, inicio_imediato: true });
  const r = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return { n, c, t: await tentativaDe(c) };
}
const tentativaDe = async c => (await local.db.query(`select t.* from app.tentativas_pagamento t join app.pagamentos p on p.id = t.pagamento_id join app.propostas pr on pr.id = p.proposta_id where pr.conversa_id = $1 order by t.created_at desc limit 1`, [c])).rows[0];
const pagamentoDe = async c => (await local.db.query(`select p.* from app.pagamentos p join app.propostas pr on pr.id = p.proposta_id where pr.conversa_id = $1`, [c])).rows[0];
const aviso = (servico, orderId) => {
  const a = sim.aviso(orderId);
  return receber(new Request(BASE + '/api/pagamentos' + a.query, { method: 'POST', headers: a.cabecalhos, body: a.corpo }), {}, { banco: local.rpc, cfg, servico });
};
const paraResend = f => f.chamadas.filter(x => x.url === RESEND_URL);

test('Pix pago: o e-mail que a pessoa digitou fica guardado até a confirmação, que sai UMA vez com avisos repetidos, a consulta da página e a reconciliação', async () => {
  const f = resendFalso();
  const servico = servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true }));
  const { n, c, t } = await ateOPix(servico);
  assert.equal(t.pagador_email, 'ana@exemplo.com', 'guardado (minúsculo) antes de pagar');
  assert.equal(paraResend(f).length, 0, 'nada antes de pagar');
  sim.pagarPix(t.provedor_order_id);
  for (let i = 0; i < 3; i++) assert.equal((await aviso(servico, t.provedor_order_id)).status, 200);
  await n.chamar('GET', 'pagamento', undefined, { query: '&conversa=' + c });
  await servico.reconciliar({});
  assert.equal((await pagamentoDe(c)).status, 'pago');
  const enviados = paraResend(f);
  assert.equal(enviados.length, 1, 'uma vez só');
  assert.deepEqual(enviados[0].corpo.to, ['ana@exemplo.com'], 'para quem pagou (no teste o Mercado Pago recebe o e-mail de teste; a confirmação vai ao real)');
  assert.match(enviados[0].corpo.text, /R\$ 3\.340,00/);
  const depois = await tentativaDe(c);
  assert.equal(depois.pagador_email, null, 'usado, apagado');
  assert.ok(depois.confirmacao_email_em);
});

test('falha do Resend não desfaz nem segura o pagamento: o aviso responde 200, a entrada fica paga, e não há segunda tentativa', async () => {
  const f = resendFalso({ falha: 500 });
  const servico = servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar }));
  const { c, t } = await ateOPix(servico);
  sim.pagarPix(t.provedor_order_id);
  const { r, linhas } = await comLog(() => aviso(servico, t.provedor_order_id));
  assert.equal(r.status, 200);
  assert.equal((await pagamentoDe(c)).status, 'pago');
  assert.equal((await tentativaDe(c)).status, 'aprovada');
  assert.ok(linhas.some(l => /confirmação/.test(l)), 'o erro vai para o log: ' + linhas.join(' | '));
  /* (revisão de segurança do #172) uma linha estruturada fácil de achar pelo dono e pelo vigia: origem, falha, o motivo e o id da tentativa */
  const estruturadas = linhas.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(o => o && o.origem === 'confirmacao' && o.falha === true);
  assert.equal(estruturadas.length, 1, 'uma linha estruturada: ' + linhas.join(' | '));
  assert.equal(estruturadas[0].tentativa_id, t.id);
  assert.equal(estruturadas[0].motivo, 'http 500');
  assert.deepEqual(Object.keys(estruturadas[0]).sort(), ['evento', 'falha', 'motivo', 'nivel', 'origem', 'tentativa_id'], 'só isto: nada de e-mail, chave ou valor');
  assert.ok(!linhas.some(l => l.includes(CHAVE) || /ana@exemplo/i.test(l)), 'sem a chave nem o e-mail no log');
  await aviso(servico, t.provedor_order_id);
  await servico.reconciliar({});
  assert.equal(paraResend(f).length, 1, 'tentou uma vez; não repete');
});

test('banco fora na hora da reserva: o pagamento passa do mesmo jeito (o e-mail é depois de gravar e nunca derruba)', async () => {
  const f = resendFalso();
  const quebrado = (nome, p) => nome === 'pagamentos_reservar_confirmacao' ? Promise.reject(Object.assign(new Error('x'), { codigo: '08006' })) : local.rpc(nome, p);
  const servico = servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar }), quebrado);
  const { c, t } = await ateOPix(servico);
  sim.pagarPix(t.provedor_order_id);
  const { r } = await comLog(() => aviso(servico, t.provedor_order_id));
  assert.equal(r.status, 200);
  assert.equal((await pagamentoDe(c)).status, 'pago');
  assert.equal(paraResend(f).length, 0);
  /* e a reconciliação com o banco de volta recupera */
  await servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar })).reconciliar({});
  assert.equal(paraResend(f).length, 1, 'recuperada pela varredura');
});

test('sem a chave: o pagamento segue, nada é enviado nem reservado; com a chave, a reconciliação recupera a confirmação que ficou para trás', async () => {
  const f = resendFalso();
  const semChave = servicoCom(criarConfirmacao({ chave: undefined, fetch: f.buscar }));
  const { c, t } = await ateOPix(semChave);
  sim.pagarPix(t.provedor_order_id);
  const { r, linhas } = await comLog(() => aviso(semChave, t.provedor_order_id));
  assert.equal(r.status, 200);
  assert.ok(linhas.some(l => /RESEND_API_KEY/.test(l)), 'o aviso diz o que falta');
  assert.equal(f.chamadas.length, 0);
  const t2 = await tentativaDe(c);
  assert.equal(t2.confirmacao_email_em, null, 'não reservou');
  assert.equal(t2.pagador_email, 'ana@exemplo.com');
  await semChave.reconciliar({});
  assert.equal(f.chamadas.length, 0, 'a reconciliação sem chave também não');
  const resumo = await servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar })).reconciliar({});
  assert.equal(paraResend(f).length, 1);
  assert.deepEqual(paraResend(f)[0].corpo.to, ['ana@exemplo.com']);
  assert.ok(resumo.confirmacoes >= 1, JSON.stringify(resumo));
});

test('a reconciliação respeita o orçamento de subpedidos: sem folga, não reserva (o que não coube fica para a próxima)', async () => {
  const f = resendFalso();
  const semChave = servicoCom(criarConfirmacao({ chave: undefined, fetch: f.buscar }));
  const { c, t } = await ateOPix(semChave);
  sim.pagarPix(t.provedor_order_id);
  await comLog(() => aviso(semChave, t.provedor_order_id));
  const comChave = servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar }));
  await comChave.reconciliar({ orcamento: 3, varrerDias: 0 });
  assert.equal((await tentativaDe(c)).confirmacao_email_em, null, 'o orçamento acabou na lista: não reservou');
  /* (lista vazia: sobra 1 subpedido, que daria a reserva mas não o envio; reservar sem poder enviar perderia a confirmação) */
  const r = await comChave.reconciliar({ orcamento: 4, limite: 0, varrerDias: 0 });
  assert.equal(r.confirmacoes, 0);
  assert.equal((await tentativaDe(c)).confirmacao_email_em, null, 'sem folga para reserva + envio: não reservou');
  await comChave.reconciliar({});
  assert.equal(paraResend(f).filter(x => x.corpo.to[0] === 'ana@exemplo.com').length >= 1, true);
  assert.ok((await tentativaDe(c)).confirmacao_email_em);
});

/* ======================= O LINK DO PEDIDO NO E-MAIL (decisão do dono, 19/11: "o cliente não tem que se preocupar com nenhum código, com nada") =======================
   Com a entrega ligada, o e-mail leva <origem>/orcamento#pedido=<código>: o MESMO formato que a página abre em outro aparelho (js/orcamento-entrega.js,
   linkDoPedido; js/orcamento-retomada.js, o prefixo #pedido= → abrir-pedido). O código só existe na memória do servidor e no e-mail: nunca no log,
   no banco (só o hash) ou na resposta da API. */
const LINK_NO_TEXTO = /https:\/\/beyonzero\.com\.br\/orcamento#pedido=([A-Za-z0-9_-]{32})/;
const CODIGO_EXEMPLO = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

test('o texto com o link: diz que é o link do pedido, que serve para o material e para acompanhar, que não se repassa; sem a palavra "código"', () => {
  const link = linkDoPedido(CODIGO_EXEMPLO);
  assert.equal(link, 'https://beyonzero.com.br/orcamento#pedido=' + CODIGO_EXEMPLO, 'o formato que a página abre (#pedido=, no fragmento)');
  const t = textoDaConfirmacao({ valor: 1200, metodo: 'pix', prazoDias: 10, entrega: true, link });
  for (const corpo of [t.texto, t.html.replace('<!DOCTYPE html>', '')]) {
    assert.ok(corpo.includes(link), 'o link inteiro');
    assert.match(corpo, /link do seu pedido/);
    assert.match(corpo, /material/); assert.match(corpo, /acompanh/);
    assert.match(corpo, /não repasse/i);
    assert.doesNotMatch(corpo, /c[óo]digo/i, 'o cliente não lida com código nenhum');
    assert.doesNotMatch(corpo, /—|!|Fernando/i);
    assert.match(corpo, /10 dias úteis/); assert.match(corpo, /responder este e-mail/);
  }
  assert.doesNotMatch(t.texto, /mesma em que fez o pagamento/, 'com o link, a frase antiga sai');
  assert.ok(t.html.includes('<a href="' + link + '">' + link + '</a>'), 'no HTML, um link de verdade (sem estilo, sem rastreio)');
  assert.doesNotMatch(t.html, /style=/i);
});

test('o link só entra no formato exato; qualquer outra coisa some e fica a frase de antes; sem entrega ligada, nunca há link', () => {
  for (const ruim of ['javascript:alert(1)', 'https://outro.site/orcamento#pedido=' + CODIGO_EXEMPLO, 'https://beyonzero.com.br/orcamento#pedido=curto',
    'https://beyonzero.com.br/orcamento#pedido=' + CODIGO_EXEMPLO + '"><script>', 42, null]) {
    const t = textoDaConfirmacao({ valor: 1200, metodo: 'pix', prazoDias: 10, entrega: true, link: ruim });
    assert.doesNotMatch(t.texto + t.html, /<script|javascript:|outro\.site|#pedido=/, JSON.stringify(ruim));
    assert.match(t.texto, /página do pedido, a mesma em que fez o pagamento/, 'a frase de antes: ' + JSON.stringify(ruim));
  }
  const desligada = textoDaConfirmacao({ valor: 1200, metodo: 'pix', prazoDias: 10, entrega: false, link: linkDoPedido(CODIGO_EXEMPLO) });
  assert.doesNotMatch(desligada.texto, /#pedido=/, 'entrega desligada: as ações do link estão fechadas, então o link não vai');  /* o link aponta para a produção: só a produção o manda (numa prévia com chave de teste, ele abriria a produção sem o pedido) */
  const CF = { RESEND_API_KEY: CHAVE, BZ_ENTREGA: 'ligada', BZ_PLATAFORMA: 'cloudflare' };
  assert.equal(confirmacaoDoAmbiente(CF).link, true, 'produção (Cloudflare sem BZ_AMBIENTE=previa)');
  assert.equal(confirmacaoDoAmbiente({ ...CF, BZ_AMBIENTE: 'previa' }).link, false, 'prévia');
  assert.equal(confirmacaoDoAmbiente({ RESEND_API_KEY: CHAVE, BZ_ENTREGA: 'ligada' }).link, false, 'local');
  assert.equal(confirmacaoDoAmbiente({ ...CF, BZ_ENTREGA: undefined }).link, false, 'entrega desligada');
});

/* o banco de mentira das unidades: a reserva devolve ITEM; o link responde o que o teste pedir; guarda o que recebeu */
function bancoFalso({ link = { ok: true, criado: true }, quebrarLink = false } = {}) {
  const chamadas = [];
  const banco = async (nome, p) => {
    chamadas.push({ nome, p });
    if (nome === 'pagamentos_reservar_confirmacao') return { itens: [ITEM] };
    if (nome === 'pagamentos_link_da_confirmacao') {
      if (quebrarLink) throw Object.assign(new Error('banco fora'), { codigo: '08006' });
      return p.desfazer ? { ok: true, desfeito: true } : link;
    }
    throw new Error('inesperado: ' + nome);
  };
  return { banco, chamadas };
}

test('confirmarEntradas: o banco recebe só o hash; o e-mail leva o link; o código não aparece em log nenhum', async () => {
  const f = resendFalso(), b = bancoFalso();
  const { r, linhas } = await comLog(() => confirmarEntradas({ banco: b.banco, confirmacao: criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true }), provedor: 'mercadopago', filtro: { provedor_order_id: 'ORD1234' } }));
  assert.deepEqual(r, { enviadas: 1, falhas: 0 });
  const codigo = LINK_NO_TEXTO.exec(f.chamadas[0].corpo.text)?.[1];
  assert.match(codigo || '', CODIGO_LINK, 'o link foi no e-mail');
  const pedido = b.chamadas.find(x => x.nome === 'pagamentos_link_da_confirmacao');
  assert.deepEqual(Object.keys(pedido.p).sort(), ['codigo_hash', 'tentativa_id']);
  assert.equal(pedido.p.codigo_hash, hashDoLink(codigo), 'só o hash vai ao banco');
  assert.ok(!JSON.stringify(b.chamadas).includes(codigo), 'o código em claro nunca vai ao banco');
  assert.ok(!linhas.some(l => l.includes(codigo)), 'nem ao log');
});

test('confirmarEntradas: a conversa já tem link (o cliente gerou o dele) ou o banco falhou ao criar: o e-mail sai do mesmo jeito, sem link, com a frase de antes', async () => {
  for (const b of [bancoFalso({ link: { ok: true, criado: false, motivo: 'ja_tem_link' } }), bancoFalso({ quebrarLink: true })]) {
    const f = resendFalso();
    const { r, linhas } = await comLog(() => confirmarEntradas({ banco: b.banco, confirmacao: criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true }), provedor: 'mercadopago', filtro: { provedor_order_id: 'ORD1234' } }));
    assert.deepEqual(r, { enviadas: 1, falhas: 0 });
    assert.doesNotMatch(f.chamadas[0].corpo.text, /#pedido=/);
    assert.match(f.chamadas[0].corpo.text, /página do pedido, a mesma em que fez o pagamento/);
    assert.ok(!b.chamadas.some(x => x.p && x.p.desfazer), 'nada a desfazer');
    assert.ok(!linhas.some(l => /cliente@empresa/.test(l)), 'sem o e-mail no log');
  }
});

test('confirmarEntradas: o Resend recusou (o e-mail não saiu): o link criado para ele é desfeito; no tempo esgotado ele pode ter saído, então fica', async () => {
  for (const [falha, desfaz] of [[500, true], [422, true], ['tempo', false], ['rede', false]]) {
    const f = resendFalso({ falha }), b = bancoFalso();
    const { linhas } = await comLog(() => confirmarEntradas({ banco: b.banco, confirmacao: criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true, timeoutMs: 30 }), provedor: 'mercadopago', filtro: { provedor_order_id: 'ORD1234' } }));
    const desfeito = b.chamadas.filter(x => x.p && x.p.desfazer === true);
    assert.equal(desfeito.length, desfaz ? 1 : 0, String(falha));
    const codigo = LINK_NO_TEXTO.exec(f.chamadas[0].corpo.text)?.[1];
    if (desfaz) assert.equal(desfeito[0].p.codigo_hash, hashDoLink(codigo), 'desfaz o MESMO link');
    assert.ok(!linhas.some(l => l.includes(codigo)), 'o código não vai ao log nem na falha');
  }
});

test('Pix pago com a entrega ligada: o e-mail leva o link do pedido, o link abre ESTE pedido em outro aparelho, e o código não fica em log, banco ou resposta', async () => {
  const f = resendFalso();
  const servico = servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true }));
  const { r: tudo, linhas } = await comLog(async () => {
    const { n, c, t } = await ateOPix(servico);
    sim.pagarPix(t.provedor_order_id);
    const respostas = [await aviso(servico, t.provedor_order_id), await aviso(servico, t.provedor_order_id)];
    const consulta = await n.chamar('GET', 'pagamento', undefined, { query: '&conversa=' + c });
    return { c, respostas: await Promise.all(respostas.map(x => x.text())), consulta };
  });
  const enviados = paraResend(f);
  assert.equal(enviados.length, 1);
  const codigo = LINK_NO_TEXTO.exec(enviados[0].corpo.text)?.[1];
  assert.match(codigo || '', CODIGO_LINK, 'o link no texto: ' + enviados[0].corpo.text);
  assert.ok(enviados[0].corpo.html.includes('#pedido=' + codigo));
  assert.ok(!linhas.some(l => l.includes(codigo)), 'nada no log');
  assert.ok(!JSON.stringify(tudo).includes(codigo), 'nem na resposta do aviso ou da consulta');
  const linha = (await local.db.query('select * from app.links_pedido where conversa_id = $1', [tudo.c])).rows;
  assert.equal(linha.length, 1); assert.equal(linha[0].codigo_hash, hashDoLink(codigo)); assert.equal(linha[0].pelo_email, true);
  const eventos = (await local.db.query('select dados from app.eventos_funil where conversa_id = $1', [tudo.c])).rows;
  assert.ok(!JSON.stringify(eventos).includes(codigo));
  /* o cliente abre o e-mail em outro aparelho: o link leva ao pedido dele */
  const outro = navegador(servico, { BZ_ENTREGA: 'ligada' });
  const aberto = await outro.chamar('POST', 'abrir-pedido', { codigo });
  assert.equal(aberto.status, 200, JSON.stringify(aberto.corpo));
  assert.equal(aberto.corpo.conversa_id, tudo.c, 'o pedido certo');
});

test('Pix pago, Resend fora: o pagamento segue, e o link criado para o e-mail que não saiu é desfeito (a página volta a oferecer o dela)', async () => {
  const f = resendFalso({ falha: 503 });
  const servico = servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true }));
  const { c, t } = await ateOPix(servico);
  sim.pagarPix(t.provedor_order_id);
  const { r } = await comLog(() => aviso(servico, t.provedor_order_id));
  assert.equal(r.status, 200);
  assert.equal((await pagamentoDe(c)).status, 'pago');
  assert.equal(paraResend(f).length, 1);
  assert.equal((await local.db.query('select count(*)::int n from app.links_pedido where conversa_id = $1', [c])).rows[0].n, 0);
});

test('a reconciliação conta o link: com a entrega ligada, só reserva se couberem a reserva, o link, o envio e o desfazer', async () => {
  const f = resendFalso();
  const semChave = servicoCom(criarConfirmacao({ chave: undefined, fetch: f.buscar }));
  const { c, t } = await ateOPix(semChave);
  sim.pagarPix(t.provedor_order_id);
  await comLog(() => aviso(semChave, t.provedor_order_id));
  const comChave = servicoCom(criarConfirmacao({ chave: CHAVE, fetch: f.buscar, entrega: true }));
  /* (orcamento 5, lista vazia: sobram 2, que davam reserva + envio; com o link não cabe) */
  await comChave.reconciliar({ orcamento: 5, limite: 0, varrerDias: 0 });
  assert.equal((await tentativaDe(c)).confirmacao_email_em, null, 'sem folga para o link: não reservou');
  await comChave.reconciliar({});
  const meu = paraResend(f).filter(x => x.corpo.to[0] === 'ana@exemplo.com');
  assert.ok(meu.some(x => LINK_NO_TEXTO.test(x.corpo.text)), 'a varredura também leva o link');
});
