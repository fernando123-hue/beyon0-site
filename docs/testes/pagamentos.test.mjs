/* PAGAMENTOS — servidor inteiro contra o simulador fiel da Orders API (docs/mp-simulado.mjs) e o banco real
   (PGlite + migrations): assinatura (vetores do SDK oficial), estados, provedor, configuração por ambiente,
   Pix, cartão, 3DS, falhas do provedor e do banco, reconciliação, reembolso, e os ataques da especificação.
   npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { receber } from '../../api/pagamentos.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { verificarAssinatura, assinar } from '../../api/_pagamentos/assinatura.mjs';
import { estadoDe } from '../../api/_pagamentos/estados.mjs';
import { configPagamentos, configPublica } from '../../api/_pagamentos/config.mjs';
import { criarMercadoPago, ErroProvedor, retratoDe } from '../../api/_pagamentos/mercadopago.mjs';
import { criarServicoPagamentos, validarPagador } from '../../api/_pagamentos/servico.mjs';
import { ferramentas } from '../../api/_vendas/agente.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
let local, sim, cfg, servico, deps, ip = 0, desvio = 0;
const agora = () => Date.now() + desvio;
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '529.982.247-25' };

before(async () => {
  local = await montarLocal({ base: BASE });
  sim = local.mp.sim;
  cfg = { ...configPagamentos({}), intervaloAposRecusaS: 0 };   /* (o freio de 20 s depois de recusa tem teste próprio) */
  servico = criarServicoPagamentos({ banco: local.rpc, cfg, agora });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: servico };
});

/* ---------- um visitante até a cobrança (sinal de R$ 1.975: institucional 3500 + agendamento 450, 50%) ---------- */
function navegador(d = deps) {
  const meuIp = '198.51.100.' + (++ip % 250);
  let token = null;
  const chamar = async (metodo, acao, corpo, extra = {}) => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + (extra.query || ''), {
      method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': meuIp, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...((extra.token ?? token) ? { authorization: 'Bearer ' + (extra.token ?? token) } : {}) }
    }), {}, metodo, extra.deps || d);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo; } };
}
async function ateCobranca(n = navegador()) {
  const s = await n.iniciar(), c = s.conversa_id;
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Tenho uma clínica e quero um site institucional para agendamentos' });
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'sim' });
  await detalhesEConfirmar(n.chamar, local.rpc, c, { nome: 'Ana' });
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  for (const d of g.corpo.direcoes) await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: g.corpo.direcoes[0].id });
  const esc = await n.chamar('POST', 'escopo', { conversa_id: c });
  await n.chamar('POST', 'confirmar', { conversa_id: c, proposta_id: esc.corpo.proposta_id, confirmo: true, inicio_imediato: true });
  return { n, c };
}
const pagarPix = (n, c, extra = {}) => n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR, ...extra });
const pagarCartao = (n, c, nome, extra = {}, d) => n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'cartao', pagador: PAGADOR, cartao: { token: 'local-' + nome + '-abc12345', meio: 'visa', tipo: 'credit_card', parcelas: 1 }, ...extra }, d ? { deps: d } : {});
const estado = (n, c) => n.chamar('GET', 'pagamento', undefined, { query: '&conversa=' + c });
const tentativaDe = async c => (await local.db.query(`select t.* from app.tentativas_pagamento t join app.pagamentos p on p.id = t.pagamento_id join app.propostas pr on pr.id = p.proposta_id where pr.conversa_id = $1 order by t.created_at desc limit 1`, [c])).rows[0];
const pagamentoDe = async c => (await local.db.query(`select p.* from app.pagamentos p join app.propostas pr on pr.id = p.proposta_id where pr.conversa_id = $1`, [c])).rows[0];
const projetosDe = async c => (await local.db.query(`select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.conversa_id = $1`, [c])).rows;
const aviso = (orderId, opcoes = {}, mexer = x => x) => {
  const a = mexer(sim.aviso(orderId, opcoes));
  return receber(new Request(BASE + '/api/pagamentos' + a.query, { method: 'POST', headers: a.cabecalhos, body: a.corpo }), {}, { banco: local.rpc, cfg, servico });
};

/* ======================= assinatura (vetores do SDK oficial mercadopago/sdk-nodejs 3.6.1) ======================= */
test('assinatura: aceita a do Mercado Pago e recusa tudo o mais', () => {
  const SECRET = 'your_secret_key_here', REQ = '2066ca19-c6f1-498a-be75-1923005edd06', RAW = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', LOWER = 'ord01jq4s4ky8hwq6na5pxb65b3d3', TS = '1742505638683';
  const hash = (id, req, ts, s = SECRET) => createHmac('sha256', s).update((id ? 'id:' + id + ';' : '') + (req ? 'request-id:' + req + ';' : '') + 'ts:' + ts + ';').digest('hex');
  const v = (xSignature, extra = {}) => verificarAssinatura({ xSignature, xRequestId: REQ, dataId: RAW, segredo: SECRET, agora: Number(TS), ...extra });
  assert.equal(v('ts=' + TS + ',v1=' + hash(LOWER, REQ, TS)).valido, true, 'id em minúsculas (documentação de orders)');
  assert.equal(v('ts=' + TS + ',v1=' + hash(RAW, REQ, TS)).valido, true, 'id como veio (SDK)');
  assert.equal(v('ts=' + TS + ',v1=' + hash(LOWER, REQ, TS) + ',v2=aaaa').valido, true, 'versão futura ao lado não atrapalha');
  assert.equal(v('ts=1742505638,v1=' + hash(LOWER, REQ, '1742505638')).valido, true, 'ts em segundos');
  assert.equal(verificarAssinatura({ xSignature: 'ts=' + TS + ',v1=' + hash(undefined, REQ, TS), xRequestId: REQ, dataId: undefined, segredo: SECRET, agora: Number(TS) }).valido, true, 'par ausente sai do manifest');
  const ruins = {
    'sem cabeçalho': [undefined], 'vazio': ['   '], 'lixo': ['isto-nao-e-assinatura'], 'sem ts': ['v1=' + hash(LOWER, REQ, TS)], 'sem v1': ['ts=' + TS],
    'só v2': ['ts=' + TS + ',v2=' + hash(LOWER, REQ, TS)], 'hash adulterado': ['ts=' + TS + ',v1=' + hash(LOWER, REQ, TS).replace(/^./, c => c === '0' ? '1' : '0')],
    'outro segredo': ['ts=' + TS + ',v1=' + hash(LOWER, REQ, TS, 'outro-segredo-qualquer')], 'outro request-id': ['ts=' + TS + ',v1=' + hash(LOWER, 'outro', TS)],
    'outra order': ['ts=' + TS + ',v1=' + hash('ord01outra', REQ, TS)], 'ts trocado': ['ts=1742505638684,v1=' + hash(LOWER, REQ, TS)],
    'ts velho (replay)': ['ts=' + TS + ',v1=' + hash(LOWER, REQ, TS), { agora: Number(TS) + 73 * 3600e3 }],
    'ts não numérico': ['ts=abc,v1=' + hash(LOWER, REQ, 'abc')]
  };
  for (const [nome, [sig, extra]] of Object.entries(ruins)) assert.equal(v(sig, extra).valido, false, nome);
  assert.equal(verificarAssinatura({ xSignature: 'ts=1,v1=' + 'a'.repeat(64), dataId: RAW, segredo: '' }).valido, false, 'sem segredo configurado: nunca válido');
});

/* ======================= estados ======================= */
test('estados: só processed/accredited é aprovado; o resto mapeado; o desconhecido não vira nada', () => {
  const t = [['processed', 'accredited', 'aprovada'], ['processed', 'partially_refunded', 'estornada_parcial'], ['processed', 'qualquer', 'desconhecido'],
    ['action_required', 'waiting_transfer', 'aguardando'], ['action_required', 'pending_challenge', 'requer_acao'], ['action_required', 'novo', 'desconhecido'],
    ['processing', 'in_process', 'processando'], ['in_review', 'in_review', 'processando'], ['failed', 'high_risk', 'recusada'], ['canceled', 'canceled', 'cancelada'],
    ['expired', 'expired', 'expirada'], ['refunded', 'refunded', 'estornada'], ['charged_back', 'reimbursed', 'contestada'], ['charged_back', 'settled', 'contestada'],
    ['approved', 'accredited', 'desconhecido'], [undefined, undefined, 'desconhecido']];
  for (const [s, d, e] of t) assert.equal(estadoDe(s, d), e, s + '/' + d);
  const r = retratoDe({ id: 'ORD123456789', total_amount: '10.00', transactions: { payments: [{ amount: '10.00', status: 'processed', status_detail: 'accredited', payment_method: {} }, { amount: '1.00' }] } });
  assert.equal(r.estado, 'desconhecido', 'order com duas transações: a Beyon Zero nunca cria; não aplica');
});

/* ======================= configuração por ambiente ======================= */
test('credenciais: teste e produção nunca se misturam; faltou algo, pagamento desligado; o segredo não vai ao navegador', () => {
  const base = { MP_ACCESS_TOKEN: 'APP_USR-1234567890123456-abc', MP_PUBLIC_KEY: 'APP_USR-pub-1234567890123456', MP_WEBHOOK_SEGREDO: 'segredo-muito-longo-123', MP_USER_ID: '123456' };
  const salvo = globalThis.__BZ_LOCAL; globalThis.__BZ_LOCAL = undefined;
  try {
    assert.equal(configPagamentos({ ...base, VERCEL: '1', VERCEL_ENV: 'production', MP_AMBIENTE: 'teste' }).ativo, false, 'produção com credencial de teste');
    assert.equal(configPagamentos({ ...base, VERCEL: '1', VERCEL_ENV: 'preview', MP_AMBIENTE: 'producao' }).ativo, false, 'prévia com credencial de produção');
    assert.equal(configPagamentos({ ...base, MP_AMBIENTE: 'producao' }).ativo, false, 'produção fora da Vercel');
    assert.equal(configPagamentos({ ...base, VERCEL: '1', VERCEL_ENV: 'production', MP_AMBIENTE: 'producao', MP_USER_ID: '' }).ativo, false, 'produção sem a conta esperada');
    assert.equal(configPagamentos({ ...base, VERCEL: '1', VERCEL_ENV: 'preview' }).ativo, false, 'ambiente não declarado');
    assert.equal(configPagamentos({ ...base, VERCEL: '1', VERCEL_ENV: 'preview', MP_AMBIENTE: 'teste', MP_WEBHOOK_SEGREDO: '' }).ativo, false, 'sem segredo do webhook');
    const ok = configPagamentos({ ...base, VERCEL: '1', VERCEL_ENV: 'production', MP_AMBIENTE: 'producao' });
    assert.equal(ok.ativo, true);
    /* o segredo da reconciliação vem de api/_cron.mjs (revisão do PR 11): 32+ depois de aparar, senão desligada */
    const cron = v => configPagamentos({ ...base, VERCEL: '1', VERCEL_ENV: 'production', MP_AMBIENTE: 'producao', CRON_SECRET: v }).cronSecret;
    assert.equal(cron('x'.repeat(20)), null, 'segredo de 20 caracteres não autoriza a reconciliação');
    assert.equal(cron(' ' + 'y'.repeat(40) + '\n'), 'y'.repeat(40));
    const pub = JSON.stringify(configPublica(ok));
    assert.ok(!pub.includes(base.MP_ACCESS_TOKEN) && !pub.includes(base.MP_WEBHOOK_SEGREDO), 'só a Public Key vai ao navegador');
    assert.ok(pub.includes(base.MP_PUBLIC_KEY));
  } finally { globalThis.__BZ_LOCAL = salvo; }
});

/* ======================= provedor ======================= */
test('provedor: idempotência, erros classificados, token nunca em mensagem de erro', async () => {
  const mp = criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch });
  const pedido = chave => mp.criarOrdem({ chave, referencia: 'ref-prov-1', valor: 10, pagador: { email: 'test@testuser.com', nome: 'APRO', sobrenome: 'T', documentoTipo: 'CPF', documento: '52998224725' }, metodo: 'pix' });
  const a = await pedido('bz-chave-idem-0001'), b = await pedido('bz-chave-idem-0001');
  assert.equal(a.order.id, b.order.id, 'mesma chave + mesmo corpo = a mesma order');
  await assert.rejects(mp.criarOrdem({ chave: 'bz-chave-idem-0001', referencia: 'outra', valor: 99, pagador: { email: 'test@testuser.com', nome: 'A', sobrenome: 'B', documentoTipo: 'CPF', documento: '1' }, metodo: 'pix' }), e => e.tipo === 'conflito');
  const errado = criarMercadoPago({ token: 'APP_USR-token-errado-0000000000', fetch: local.mp.fetch });
  await assert.rejects(errado.consultarOrdem(a.order.id), e => e.tipo === 'credencial' && !e.message.includes('APP_USR'));
  await assert.rejects(mp.consultarOrdem('ORDNAOEXISTE00000000'), e => e.tipo === 'nao_encontrado');
  await assert.rejects(mp.consultarOrdem('../../users/me'), e => e.tipo === 'invalido', 'id fora do formato nem sai do servidor');
  for (const [falha, tipo] of [['tempo', 'tempo'], ['rede', 'rede'], [500, 'indisponivel'], [429, 'limite']]) {
    sim.falhar(falha);
    await assert.rejects(mp.consultarOrdem(a.order.id), e => e instanceof ErroProvedor && e.tipo === tipo && !e.message.includes(local.mp.token), String(falha));
  }
});

/* ======================= Pix ======================= */
test('Pix: QR gerado; pedir de novo devolve o MESMO; pago só pelo aviso + consulta; projeto pronto_para_producao uma vez', async () => {
  const { n, c } = await ateCobranca();
  const r1 = await pagarPix(n, c);
  assert.equal(r1.status, 200, JSON.stringify(r1.corpo));
  assert.equal(r1.corpo.tentativa.status, 'aguardando');
  assert.ok(r1.corpo.tentativa.pix_qr && r1.corpo.tentativa.pix_qr_base64);
  assert.equal(Number(r1.corpo.pagamento.valor), 1975);
  const r2 = await pagarPix(n, c);
  assert.equal(r2.corpo.tentativa.id, r1.corpo.tentativa.id, 'o mesmo Pix, nenhuma order nova');
  assert.equal(sim.chamadas.filter(x => x.metodo === 'POST' && x.caminho === '/v1/orders').length >= 1, true);
  const t = await tentativaDe(c);
  assert.equal(sim.orders.get(t.provedor_order_id).payer === undefined, true);
  sim.pagarPix(t.provedor_order_id);
  for (let i = 0; i < 3; i++) assert.equal((await aviso(t.provedor_order_id)).status, 200, 'aviso repetido aceito');
  assert.equal((await pagamentoDe(c)).status, 'pago');
  assert.deepEqual(await projetosDe(c), [{ status: 'pronto_para_producao' }], 'um projeto, mesmo com três avisos');
  assert.equal((await estado(n, c)).corpo.tentativa.pix_qr, null, 'pago: o QR some');
});

/* ======================= cartão ======================= */
test('cartão: aprovado na criação; recusado mostra o motivo e libera nova tentativa; 3DS e análise resolvem pela consulta', async () => {
  const a = await ateCobranca();
  const ok = await pagarCartao(a.n, a.c, 'APRO');
  assert.equal(ok.corpo.pagamento.status, 'pago');
  assert.equal(ok.corpo.tentativa.status, 'aprovada');

  const b = await ateCobranca();
  const recusado = await pagarCartao(b.n, b.c, 'FUND');
  assert.equal(recusado.corpo.tentativa.status, 'recusada');
  assert.equal(recusado.corpo.tentativa.detalhe, 'insufficient_amount');
  assert.equal(recusado.corpo.pagamento.status, 'pendente');
  assert.equal((await pagarCartao(b.n, b.c, 'APRO')).corpo.pagamento.status, 'pago', 'outra tentativa depois da recusa');

  const c = await ateCobranca();
  const des = await pagarCartao(c.n, c.c, 'CHAL');
  assert.equal(des.corpo.tentativa.status, 'requer_acao');
  assert.ok(/^https:\/\//.test(des.corpo.tentativa.desafio_url));
  assert.equal((await pagarPix(c.n, c.c)).corpo.tentativa.status, 'requer_acao', 'com 3DS pendente não abre outra cobrança');
  sim.concluirDesafio((await tentativaDe(c.c)).provedor_order_id, true);
  desvio += 11e3;   /* a consulta ao provedor tem intervalo mínimo */
  assert.equal((await estado(c.n, c.c)).corpo.pagamento.status, 'pago', 'sem aviso: a consulta da página resolve');

  const d = await ateCobranca();
  assert.equal((await pagarCartao(d.n, d.c, 'CONT')).corpo.tentativa.status, 'processando');
  sim.aprovarAnalise((await tentativaDe(d.c)).provedor_order_id);
  assert.equal((await aviso((await tentativaDe(d.c)).provedor_order_id)).status, 200);
  assert.equal((await pagamentoDe(d.c)).status, 'pago');
});

test('trocar de Pix para cartão: o Pix é cancelado no provedor ANTES; se ele foi pago no meio, nada é cobrado de novo', async () => {
  const a = await ateCobranca();
  await pagarPix(a.n, a.c);
  const pix = await tentativaDe(a.c);
  assert.equal((await pagarCartao(a.n, a.c, 'APRO')).corpo.pagamento.status, 'pago');
  assert.equal(sim.orders.get(pix.provedor_order_id).status, 'canceled', 'Pix cancelado no Mercado Pago');

  const b = await ateCobranca();
  await pagarPix(b.n, b.c);
  const pixB = await tentativaDe(b.c);
  sim.pagarPix(pixB.provedor_order_id);   /* pagou o Pix enquanto escolhia o cartão */
  const r = await pagarCartao(b.n, b.c, 'APRO');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.pagamento.status, 'pago');
  assert.equal(r.corpo.tentativa.metodo, 'pix', 'ficou o Pix pago; nenhuma cobrança no cartão');
  const tentativasB = (await local.db.query('select metodo from app.tentativas_pagamento where pagamento_id = $1', [pixB.pagamento_id])).rows.map(x => x.metodo);
  assert.deepEqual(tentativasB, ['pix'], 'nenhuma tentativa (nem order) de cartão foi criada');
});

/* ======================= falhas do provedor e do banco ======================= */
test('falhas: tempo esgotado e provedor fora NÃO viram recusa nem pagamento; a order perdida é achada pela referência', async () => {
  const a = await ateCobranca();
  sim.falhar('tempo');
  const r = await pagarPix(a.n, a.c);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.aguarde, true);
  const t = await tentativaDe(a.c);
  assert.equal(t.status, 'criada', 'inconclusiva: fica como está');
  assert.equal((await pagarCartao(a.n, a.c, 'APRO')).status, 409, 'dentro de 90 s: não abre outra cobrança');
  desvio += 6 * 60e3;
  assert.equal((await estado(a.n, a.c)).corpo.tentativa.status, 'cancelada', 'sem order no provedor depois de 5 min: libera');
  assert.equal((await pagarCartao(a.n, a.c, 'APRO')).corpo.pagamento.status, 'pago');

  /* a order FOI criada, mas a resposta se perdeu */
  const b = await ateCobranca();
  const real = local.mp.fetch;
  const perdeResposta = { ...cfg, fetch: async (u, i) => { const resp = await real(u, i); if (i && i.method === 'POST' && new URL(u).pathname === '/v1/orders') { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; } return resp; } };
  const servPerde = criarServicoPagamentos({ banco: local.rpc, cfg: perdeResposta, agora });
  assert.equal((await b.n.chamar('POST', 'pagar', { conversa_id: b.c, metodo: 'pix', pagador: PAGADOR }, { deps: { ...deps, pagamentos: servPerde } })).status, 503);
  desvio += 2 * 60e3;
  const e = await estado(b.n, b.c);
  assert.equal(e.corpo.tentativa.status, 'aguardando', 'achada pela referência e vinculada: o mesmo Pix');
  assert.equal([...sim.orders.values()].filter(o => o.external_reference === e.corpo.tentativa.id).length, 1, 'nenhuma order em dobro');

  /* provedor fora na hora do aviso: 500 (o MP reenvia) e nada muda; depois volta e aplica */
  const tb = await tentativaDe(b.c);
  sim.pagarPix(tb.provedor_order_id);
  sim.falhar(500);
  assert.equal((await aviso(tb.provedor_order_id)).status, 500);
  assert.equal((await pagamentoDe(b.c)).status, 'pendente');
  assert.equal((await aviso(tb.provedor_order_id)).status, 200);
  assert.equal((await pagamentoDe(b.c)).status, 'pago');

  /* banco fora: 500, sem nada aplicado */
  const c = await ateCobranca();
  await pagarPix(c.n, c.c);
  const tc = await tentativaDe(c.c);
  sim.pagarPix(tc.provedor_order_id);
  const bancoFora = async (nome, p) => { if (nome === 'pagamentos_aplicar') throw Object.assign(new Error('conexão'), { codigo: '08006' }); return local.rpc(nome, p); };
  const a2 = sim.aviso(tc.provedor_order_id);
  const r2 = await receber(new Request(BASE + '/api/pagamentos' + a2.query, { method: 'POST', headers: a2.cabecalhos, body: a2.corpo }), {}, { banco: bancoFora, cfg, servico: criarServicoPagamentos({ banco: bancoFora, cfg, agora }) });
  assert.equal(r2.status, 500);
  assert.equal((await pagamentoDe(c.c)).status, 'pendente');

  /* credencial recusada: pagamento indisponível, a vaga é liberada */
  const d = await ateCobranca();
  const servErrado = criarServicoPagamentos({ banco: local.rpc, cfg: { ...cfg, token: 'APP_USR-token-errado-0000000000' }, agora });
  const re = await d.n.chamar('POST', 'pagar', { conversa_id: d.c, metodo: 'pix', pagador: PAGADOR }, { deps: { ...deps, pagamentos: servErrado } });
  assert.equal(re.status, 503);
  assert.equal((await tentativaDe(d.c)).status, 'cancelada');
});

/* ======================= ataques ======================= */
test('ataques ao webhook: forjado, sem assinatura, velho, adulterado, de outra order, de outro tipo, gigante — nada paga', async () => {
  const { n, c } = await ateCobranca();
  await pagarPix(n, c);
  const t = await tentativaDe(c);
  const id = t.provedor_order_id;
  const casos = [
    ['assinatura forjada', 401, {}, a => ({ ...a, cabecalhos: { ...a.cabecalhos, 'x-signature': a.cabecalhos['x-signature'].replace(/.$/, ch => ch === '0' ? '1' : '0') } })],
    ['sem assinatura', 401, {}, a => { const h = { ...a.cabecalhos }; delete h['x-signature']; return { ...a, cabecalhos: h }; }],
    ['outro segredo', 401, { assinaturaDe: 'segredo-de-atacante-12345' }, a => a],
    ['velho (replay de 4 dias)', 401, { ts: String(Date.now() - 96 * 3600e3) }, a => a],
    ['request-id trocado', 401, {}, a => ({ ...a, cabecalhos: { ...a.cabecalhos, 'x-request-id': 'outro' } })],
    ['data.id do corpo ≠ query', 400, {}, a => ({ ...a, corpo: a.corpo.replace(id, 'ORDOUTRAORDER00000000') })],
    ['tipo payment', 400, {}, a => ({ ...a, query: a.query.replace('type=order', 'type=payment') })],
    ['id fora do formato', 400, {}, a => ({ ...a, query: '?data.id=1%27%20or%201%3D1&type=order' })],
    ['corpo não-JSON', 400, {}, a => ({ ...a, corpo: '<xml/>' })],
    ['corpo gigante', 413, {}, a => ({ ...a, corpo: JSON.stringify({ type: 'order', data: { id }, lixo: 'x'.repeat(70000) }) })]
  ];
  sim.pagarPix(id);   /* mesmo com o MP dizendo pago, só o aviso legítimo aplica */
  for (const [nome, status, opcoes, mexer] of casos) assert.equal((await aviso(id, opcoes, mexer)).status, status, nome);
  assert.equal((await pagamentoDe(c)).status, 'pendente', 'nenhum aviso inválido pagou');
  assert.equal((await local.db.query(`select count(*)::int n from app.pagamentos_auditoria where evento = 'payment.webhook.rejected'`)).rows[0].n, 0, 'aviso sem assinatura válida não grava nada (não dá para encher a trilha sem o segredo)');

  /* aviso legítimo com o corpo "dizendo" pago de outra order não importa: vale a consulta */
  const outra = await ateCobranca();
  await pagarPix(outra.n, outra.c);
  const t2 = await tentativaDe(outra.c);
  const r = await aviso(t2.provedor_order_id, { acao: 'order.processed' }, a => ({ ...a, corpo: a.corpo.replace(/"status":"[^"]+"/, '"status":"processed"') }));
  assert.equal(r.status, 200);
  assert.equal((await pagamentoDe(outra.c)).status, 'pendente', 'o corpo do aviso não decide: o MP ainda diz aguardando');

  /* order de outra conta (não existe para o nosso token): 200 e ignorada */
  const fantasma = 'ORD' + 'Z'.repeat(26);
  const sig = assinar({ dataId: fantasma.toLowerCase(), requestId: 'r1', ts: String(Date.now()), segredo: local.mp.segredo });
  const rf = await receber(new Request(BASE + '/api/pagamentos?data.id=' + fantasma + '&type=order', { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig, 'x-request-id': 'r1' }, body: JSON.stringify({ type: 'order', data: { id: fantasma } }) }), {}, { banco: local.rpc, cfg, servico });
  assert.equal(rf.status, 503, 'order que o MP não devolve (ainda): pede reenvio, nada aplicado');
});

test('ataques financeiros: valor, conta, referência e moeda adulterados no provedor não pagam; valor do navegador é ignorado', async () => {
  const casos = [['valor menor', o => { o.total_amount = '182.50'; o.transactions.payments[0].amount = '182.50'; }],
    ['pago a menos', o => { o.transactions.payments[0].paid_amount = '1.00'; }],
    ['outra conta', o => { o.user_id = '999999'; }],
    ['outra referência', o => { o.external_reference = '00000000-0000-4000-8000-000000000000'; }],
    ['outro país', o => { o.country_code = 'ARG'; }],
    ['outra moeda', o => { o.currency = 'USD'; }]];
  for (const [nome, adulterar] of casos) {
    const { n, c } = await ateCobranca();
    await pagarPix(n, c, { valor: 1, amount: '1.00', pagamento: { valor: 1 } });
    const t = await tentativaDe(c);
    assert.equal(Number(t.valor), 1975, 'o valor veio da proposta, não do corpo');
    sim.pagarPix(t.provedor_order_id);
    sim.editar(t.provedor_order_id, adulterar);
    assert.equal((await aviso(t.provedor_order_id)).status, 200);
    assert.equal((await pagamentoDe(c)).status, 'pendente', nome + ': não pagou');
    assert.deepEqual(await projetosDe(c), [], nome + ': nenhum projeto');
  }
});

test('ataques de acesso: outro visitante, sem sessão, chamada direta, IA sem ferramenta financeira', async () => {
  const { n, c } = await ateCobranca();
  const intruso = navegador();
  await intruso.iniciar();
  assert.equal((await intruso.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR })).status, 404);
  assert.equal((await intruso.chamar('GET', 'pagamento', undefined, { query: '&conversa=' + c })).status, 404);
  assert.equal((await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR }, { token: '' })).status, 401);
  assert.equal((await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'boleto', pagador: PAGADOR })).status, 400);
  assert.equal((await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: { ...PAGADOR, documento: '111.111.111-11' } })).status, 400);
  assert.equal((await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'cartao', pagador: PAGADOR, cartao: { token: 'x', meio: 'visa', tipo: 'credit_card', parcelas: 99 } })).status, 400);
  assert.equal(validarPagador({ ...PAGADOR, email: 'sem-arroba' }).erro, 'Informe um e-mail válido.');
  const nomes = ferramentas({ adicionais: {}, formatos: {} }).map(f => f.name).join(' ');
  assert.ok(!/pag|cobr|pre[cç]o|desconto|reemb/i.test(nomes), 'nenhuma ferramenta da IA toca em pagamento: ' + nomes);
  const cron = await receber(new Request(BASE + '/api/pagamentos?acao=reconciliar', { method: 'POST' }), {}, { banco: local.rpc, cfg, servico });
  assert.equal(cron.status, 401, 'reconciliação sem a chave do agendador');
  const errada = await receber(new Request(BASE + '/api/pagamentos?acao=reconciliar', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(48) } }), {}, { banco: local.rpc, cfg, servico });
  assert.equal(errada.status, 401);
});

test('concorrência: dois "pagar" ao mesmo tempo dão UMA order', async () => {
  const { n, c } = await ateCobranca();
  const antes = sim.orders.size;
  const [a, b] = await Promise.all([pagarPix(n, c), pagarPix(n, c)]);
  assert.ok([a.status, b.status].includes(200));
  assert.equal(sim.orders.size - antes, 1);
});

/* ======================= reconciliação e reembolso ======================= */
test('reconciliação: pago sem aviso é aplicado; order desconhecida da conta é apontada; reembolso não devolve duas vezes e pausa o projeto', async () => {
  const { n, c } = await ateCobranca();
  await pagarPix(n, c);
  const t = await tentativaDe(c);
  sim.pagarPix(t.provedor_order_id);   /* o aviso se perdeu */
  /* uma order na conta que o banco não conhece (criada fora do site) */
  const mp = criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch });
  await mp.criarOrdem({ chave: 'bz-fora-do-site-000001', referencia: 'fora-do-site', valor: 50, pagador: { email: 'test@testuser.com', nome: 'APRO', sobrenome: 'X', documentoTipo: 'CPF', documento: '52998224725' }, metodo: 'pix' });
  desvio += 3 * 60e3;
  const r = await receber(new Request(BASE + '/api/pagamentos?acao=reconciliar', { method: 'POST', headers: { authorization: 'Bearer ' + local.mp.cronSecret } }), {}, { banco: local.rpc, cfg, servico });
  assert.equal(r.status, 200);
  const resumo = await r.json();
  assert.ok(resumo.aplicadas >= 1 && resumo.desconhecidas >= 1, JSON.stringify(resumo));
  assert.ok(resumo.atencao >= 1, 'a order desconhecida conta como algo que pede uma pessoa');
  assert.equal((await pagamentoDe(c)).status, 'pago');
  /* reembolso duas vezes: uma devolução só (a 2ª é recusada antes de chegar ao provedor) */
  await servico.reembolsar({ orderId: t.provedor_order_id });
  await assert.rejects(servico.reembolsar({ orderId: t.provedor_order_id }), e => e.status === 409);
  await assert.rejects(servico.reembolsar({ orderId: 'ORDDEOUTROSISTEMA0000' }), e => e.status === 404 || e.codigo === 'P0002', 'order que não é tentativa nossa: nunca reembolsa');
  const reembolsos = sim.chamadas.filter(x => x.caminho === '/v1/orders/' + t.provedor_order_id + '/refund');
  assert.equal(reembolsos.length, 1);
  assert.deepEqual(reembolsos.map(x => x.chave), ['rf-' + t.provedor_order_id], 'chave de idempotência fixa por order');
  assert.equal(sim.orders.get(t.provedor_order_id).transactions.refunds.length, 1, 'o provedor devolveu UMA vez');
  assert.equal((await pagamentoDe(c)).status, 'estornado');
  assert.deepEqual(await projetosDe(c), [{ status: 'pausado' }]);
  const trilha = (await local.db.query(`select evento from app.pagamentos_auditoria where tentativa_id = $1 order by id`, [t.id])).rows.map(x => x.evento);
  for (const ev of ['payment.created', 'payment.pending', 'payment.confirmed', 'project.ready', 'payment.refunded', 'project.paused']) assert.ok(trilha.includes(ev), 'trilha: ' + ev);
});

/* ======================= correções da auditoria adversarial ======================= */
test('transporte REAL (PostgREST) aceita as funções de pagamento, recusa outras e não fica preso no banco travado', async () => {
  const { criarTransporte } = await import('../../api/_vendas/transporte.mjs');
  const original = globalThis.fetch;
  const chamadas = [];
  try {
    globalThis.fetch = async (url, init) => { chamadas.push(url); if (init.signal) assert.ok(init.signal instanceof AbortSignal, 'com tempo limite'); return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); };
    const rpc = criarTransporte({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_CHAVE_SECRETA: 'sb_secret_teste' });
    assert.deepEqual(await rpc('pagamentos_aplicar', {}), { ok: true });
    assert.deepEqual(await rpc('vendas_estado', {}), { ok: true });
    await assert.rejects(rpc('apagar_tudo', {}), e => e.codigo === '22023');
    await assert.rejects(rpc('pagamentos_aplicar; drop', {}), e => e.codigo === '22023');
    assert.deepEqual(chamadas, ['https://x.supabase.co/rest/v1/rpc/pagamentos_aplicar', 'https://x.supabase.co/rest/v1/rpc/vendas_estado']);
    globalThis.fetch = async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; };
    await assert.rejects(rpc('pagamentos_aplicar', {}), e => e.codigo === '08006', 'banco travado vira erro rápido');
  } finally { globalThis.fetch = original; }
});

test('credencial: a conta é obrigatória em teste também, e o token de outra conta desliga o pagamento', () => {
  const salvo = globalThis.__BZ_LOCAL; globalThis.__BZ_LOCAL = undefined;
  try {
    const base = { VERCEL: '1', VERCEL_ENV: 'preview', MP_AMBIENTE: 'teste', MP_PUBLIC_KEY: 'APP_USR-pub-1234567890123456', MP_WEBHOOK_SEGREDO: 'segredo-muito-longo-123' };
    assert.equal(configPagamentos({ ...base, MP_ACCESS_TOKEN: 'APP_USR-1234-100124-abcdef-123456' }).ativo, false, 'sem MP_USER_ID');
    assert.equal(configPagamentos({ ...base, MP_ACCESS_TOKEN: 'APP_USR-1234-100124-abcdef-999999', MP_USER_ID: '123456' }).ativo, false, 'token de OUTRA conta (ex.: produção colada na prévia)');
    assert.equal(configPagamentos({ ...base, MP_ACCESS_TOKEN: 'APP_USR-1234-100124-abcdef-123456', MP_USER_ID: '123456' }).ativo, true);
  } finally { globalThis.__BZ_LOCAL = salvo; }
});

test('webhook: order ainda não legível pede reenvio (503) por algumas horas; cabeçalho estranho não derruba a função', async () => {
  const fantasma = 'ORD' + 'Y'.repeat(26);
  const enviar = ts => { const sig = assinar({ dataId: fantasma.toLowerCase(), requestId: 'r9', ts: String(ts), segredo: local.mp.segredo });
    return receber(new Request(BASE + '/api/pagamentos?data.id=' + fantasma + '&type=order', { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig, 'x-request-id': 'r9' }, body: JSON.stringify({ type: 'order', data: { id: fantasma } }) }), {}, { banco: local.rpc, cfg, servico }); };
  assert.equal((await enviar(Date.now())).status, 503, 'recente: o MP reenvia');
  assert.equal((await enviar(Date.now() - 7 * 3600e3)).status, 200, 'velho: desiste (a reconciliação cobre)');
  const r = await receber(new Request(BASE + '/api/pagamentos?acao=reconciliar', { method: 'POST', headers: { authorization: 'Bearer çãõ' + 'x'.repeat(40) } }), {}, { banco: local.rpc, cfg, servico });
  assert.equal(r.status, 401);
});

test('teste de cartões pela API: logo depois de uma recusa, espera; o Pix segue livre', async () => {
  const comFreio = criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}), agora });
  const { n, c } = await ateCobranca();
  const d = { ...deps, pagamentos: comFreio };
  assert.equal((await pagarCartao(n, c, 'FUND', {}, d)).corpo.tentativa.status, 'recusada');
  const de_novo = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'cartao', pagador: PAGADOR, cartao: { token: 'local-APRO-abc12345', meio: 'visa', tipo: 'credit_card', parcelas: 1 } }, { deps: d });
  assert.equal(de_novo.status, 429);
  assert.match(de_novo.corpo.erro, /Espere/);
  assert.equal((await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR }, { deps: d })).corpo.tentativa.status, 'aguardando');
});
