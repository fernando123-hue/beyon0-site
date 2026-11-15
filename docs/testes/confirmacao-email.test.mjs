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
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { criarConfirmacao, confirmacaoDoAmbiente, textoDaConfirmacao, escaparHtml, htmlDe, RESEND_URL, REMETENTE, RESPONDER_PARA }
  from '../../api/_pagamentos/confirmacao.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
const CHAVE = 're_teste_0123456789abcdef';
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'Ana@Exemplo.com', documento: '529.982.247-25' };
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
function navegador(servico) {
  const deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: servico };
  const meuIp = '198.51.100.' + (++ip % 250);
  let token = null;
  const chamar = async (metodo, acao, corpo, extra = {}) => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + (extra.query || ''), {
      method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': meuIp, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
    }), {}, metodo, deps);
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
