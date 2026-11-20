/* O TESTE DO PIX NÃO CONTAMINA O PEDIDO REAL (servidor inteiro, banco real em PGlite, Mercado Pago simulado).
   1) o aviso (webhook) e a reconciliação de uma order TESTE- são aceitos e IGNORADOS: nenhuma tentativa, pagamento, e-mail
      ao cliente, ocorrência de "order sem dono" nem alarme (pagamentos_atencao) nasce;
   2) a order do pedido REAL continua sendo criada com o valor da tabela e com a referência da tentativa (UUID, nunca "TESTE-"),
      e continua sendo aplicada como paga normalmente (o ignorar-TESTE não a alcança);
   3) uma order desconhecida que NÃO é do teste continua gerando o alarme (a regra de segurança de antes segue valendo).
   npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { receber } from '../../api/pagamentos.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { criarMercadoPago } from '../../api/_pagamentos/mercadopago.mjs';
import { criarConfirmacao } from '../../api/_pagamentos/confirmacao.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { criarTestePix } from '../../api/_pagamentos/teste-pix.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar, zerarRegistroDeIa } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '529.982.247-25' };
let local, sim, cfg, servico, deps, emails, ip = 0;

before(async () => {
  local = await montarLocal({ base: BASE });
  sim = local.mp.sim;
  cfg = { ...configPagamentos({}), intervaloAposRecusaS: 0 };
  emails = [];
  const resend = async (url, init) => { emails.push(String(url)); return new Response(JSON.stringify({ id: 'e1' }), { status: 200 }); };
  servico = criarServicoPagamentos({ banco: local.rpc, cfg, confirmacao: criarConfirmacao({ chave: 're_' + 'x'.repeat(30), fetch: resend }) });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: servico };
  zerarRegistroDeIa(local.db);
});

const contar = async tabela => Number((await local.db.query(`select count(*)::int n from app.${tabela}`)).rows[0].n);
const atencao = async () => (await local.rpc('pagamentos_atencao', { horas: 25 })).total;
const aviso = orderId => {
  const a = sim.aviso(orderId);
  return receber(new Request(BASE + '/api/pagamentos' + a.query, { method: 'POST', headers: a.cabecalhos, body: a.corpo }), {}, { banco: local.rpc, cfg, servico });
};
const reconciliar = () => receber(new Request(BASE + '/api/pagamentos?acao=reconciliar', { method: 'POST', headers: { authorization: 'Bearer ' + local.mp.cronSecret } }), {}, { banco: local.rpc, cfg, servico });

async function pedidoAteCobranca() {
  const meuIp = '198.51.100.' + (++ip % 250);
  let token = null;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': meuIp, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  const s = await chamar('POST', 'sessao', {}); token = s.corpo.token;
  const c = s.corpo.conversa_id;
  await chamar('POST', 'mensagem', { conversa_id: c, texto: 'Tenho um estúdio de pilates e quero um site institucional para agendamentos' });
  await chamar('POST', 'mensagem', { conversa_id: c, texto: 'sim' });
  await detalhesEConfirmar(chamar, local.rpc, c, { nome: 'Ana' });
  const g = await chamar('POST', 'gerar', { conversa_id: c });
  for (const d of g.corpo.direcoes) await chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  await chamar('POST', 'escolher', { conversa_id: c, direcao_id: g.corpo.direcoes[0].id });
  const esc = await chamar('POST', 'escopo', { conversa_id: c });
  await chamar('POST', 'confirmar', { conversa_id: c, proposta_id: esc.corpo.proposta_id, confirmo: true, inicio_imediato: true });
  return { chamar, c };
}

test('o aviso e a reconciliação de uma order TESTE- são aceitos e ignorados: sem tentativa, sem pagamento, sem e-mail, sem alarme', async () => {
  const antes = { tentativas: await contar('tentativas_pagamento'), pagamentos: await contar('pagamentos'), atencao: await atencao() };
  const teste = criarTestePix({ config: () => cfg });
  const r = await teste.mudar({ teste_pix: PAGADOR }, { BZ_TESTE_PIX: '1' });
  assert.equal(r.status, 200);
  const { order_id } = await r.json();
  assert.match(sim.orders.get(order_id).external_reference, /^TESTE-/);
  sim.pagarPix(order_id);   /* o dono pagou o centavo: o Mercado Pago avisa o site */

  const a = await aviso(order_id);
  assert.equal(a.status, 200);
  assert.deepEqual(await a.json(), { ok: true }, 'aceito sem erro');
  const rec = await (await reconciliar()).json();
  assert.equal(rec.desconhecidas, 0, 'a reconciliação não aponta "order sem dono": ' + JSON.stringify(rec));
  assert.equal(rec.erros, 0);

  assert.equal(await contar('tentativas_pagamento'), antes.tentativas, 'nenhuma tentativa nasceu');
  assert.equal(await contar('pagamentos'), antes.pagamentos, 'nenhum pagamento nasceu');
  assert.equal(await atencao(), antes.atencao, 'nenhum alarme (divergência, desconhecida) nasceu');
  const ocorrencias = (await local.db.query(`select evento from app.pagamentos_auditoria where provedor_ref = $1`, [order_id])).rows.map(x => x.evento);
  assert.ok(!ocorrencias.some(e => e !== 'payment.webhook.received'), 'só a trilha do aviso recebido: ' + ocorrencias.join(','));
  assert.deepEqual(emails, [], 'nenhum e-mail de confirmação sai por uma order de teste');
});

test('a reconciliação não gasta subpedido do orçamento com order TESTE- (a listagem a descarta antes de consultar)', async () => {
  const teste = criarTestePix({ config: () => cfg });
  const { order_id } = await (await teste.mudar({ teste_pix: PAGADOR }, { BZ_TESTE_PIX: '1' })).json();
  sim.pagarPix(order_id);
  const antes = sim.chamadas.filter(c => c.caminho === '/v1/orders/' + order_id).length;
  await reconciliar();
  assert.equal(sim.chamadas.filter(c => c.caminho === '/v1/orders/' + order_id).length, antes, 'a order de teste não foi consultada de novo pela varredura');
});

test('contraste: uma order desconhecida que NÃO é do teste continua gerando o alarme de antes', async () => {
  const mp = criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch });
  const { order } = await mp.criarOrdem({ chave: 'bz-fora-do-site-iso01', referencia: 'fora-do-site', valor: 50, pagador: { email: 'test@testuser.com', nome: 'APRO', sobrenome: 'X', documentoTipo: 'CPF', documento: '52998224725' }, metodo: 'pix' });
  sim.pagarPix(order.id);
  assert.equal((await aviso(order.id)).status, 200);
  const divergencias = (await local.db.query(`select count(*)::int n from app.pagamentos_auditoria where provedor_ref = $1 and evento = 'payment.divergence'`, [order.id])).rows[0].n;
  assert.equal(divergencias, 1, 'order desconhecida sem o prefixo de teste segue sendo apontada');
  assert.ok((await atencao()) >= 1);
});

test('defesa em profundidade: order TESTE- de OUTRO valor (não é a do teste de R$ 0,01) NÃO é engolida: cai na divergência e alarma', async () => {
  const mp = criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch });
  const { order } = await mp.criarOrdem({ chave: 'bz-teste-valor-iso01', referencia: 'TESTE-' + 'f'.repeat(24), valor: 50, pagador: { email: 'test@testuser.com', nome: 'APRO', sobrenome: 'X', documentoTipo: 'CPF', documento: '52998224725' }, metodo: 'pix' });
  sim.pagarPix(order.id);
  assert.equal((await aviso(order.id)).status, 200);
  const divergencias = (await local.db.query(`select count(*)::int n from app.pagamentos_auditoria where provedor_ref = $1 and evento = 'payment.divergence'`, [order.id])).rows[0].n;
  assert.equal(divergencias, 1, 'dinheiro de valor normal com cara de teste nunca passa em silêncio');
});

test('o pedido REAL: a order sai com o valor da tabela e a referência da tentativa (UUID, nunca TESTE-) e é aplicada como paga', async () => {
  const { chamar, c } = await pedidoAteCobranca();
  const r = await chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const t = (await local.db.query(`select t.* from app.tentativas_pagamento t join app.pagamentos p on p.id = t.pagamento_id join app.propostas pr on pr.id = p.proposta_id where pr.conversa_id = $1 order by t.created_at desc limit 1`, [c])).rows[0];
  const order = sim.porReferencia(t.id);
  assert.ok(order, 'a order real foi criada com a referência da tentativa');
  assert.match(order.external_reference, UUID);
  assert.ok(!order.external_reference.startsWith('TESTE-'));
  assert.equal(order.total_amount, '3340.00', 'o valor é o da tabela (entrada de 40% sobre 7900 + 450), nunca R$ 0,01');
  assert.equal(order.transactions.payments[0].amount, '3340.00');
  sim.pagarPix(order.id);
  assert.equal((await aviso(order.id)).status, 200);
  const pago = (await local.db.query(`select p.status from app.pagamentos p join app.propostas pr on pr.id = p.proposta_id where pr.conversa_id = $1`, [c])).rows[0];
  assert.equal(pago.status, 'pago', 'a ordem real continua sendo aplicada pelo aviso');
});
