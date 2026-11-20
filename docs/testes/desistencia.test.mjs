/* A DESISTÊNCIA PELO CLIENTE, o lado do SERVIDOR (20/11, dono): "o reembolso não é algo que deva ser facilitado" e "não podemos ter erro nessa parte de pagamento".
   Rota real (/api/vendas?acao=desistir), banco real (PGlite com as migrations) e o Mercado Pago simulado (docs/mp-simulado.mjs): nenhuma chamada de verdade.
   Prova: só com a sessão do próprio cliente; só dentro dos 7 dias, com a entrada paga, o restante em aberto e o site fora do ar; o valor devolvido é o da
   order PAGA (conferida no provedor), nunca o da requisição; duplo clique e duas abas = UM estorno; falha do provedor não encerra nada; o dono é avisado
   sem duplicar.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { criarCenario, BASE } from './_ajustes.mjs';
import { ateEntregaCriada } from './_entrega.mjs';
import { forcarEntrega, PREVIA, SITE, CLIENTE, iniciarRestante, aprovarRestante } from './_previa.mjs';
import { ACOES } from '../../api/vendas.mjs';
import { receber } from '../../api/pagamentos.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { criarMercadoPago, ErroProvedor } from '../../api/_pagamentos/mercadopago.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { textoDoAvisoDePagamento } from '../../api/_aviso.mjs';

let local, cen, sim;
before(async () => { local = await montarLocal({ base: BASE }); cen = criarCenario(local); sim = local.mp.sim; });
const um = async (sql, p) => (await local.db.query(sql, p)).rows[0];

/* um serviço de pagamentos com o aviso ao dono GRAVADO (e, se o teste pedir, o provedor ou o banco trocados) */
function servicoCom({ provedor, banco = local.rpc } = {}) {
  const avisos = [];
  const servico = criarServicoPagamentos({ banco, cfg: configPagamentos({}), provedor, avisar: async a => { avisos.push(a); return true; } });
  return { servico, avisos };
}
/* o provedor real (o mesmo código de produção) falando com o simulador, com um ou outro método trocado */
const provedorCom = trocas => ({ ...criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch }), ...trocas });
/* o pedido com a entrada paga pelo caminho real */
async function pedido({ pagamentos, passo = 'producao', extra } = {}) {
  const r = await ateEntregaCriada(cen, local, { pagamentos, ...(extra || {}) });
  if (passo !== 'producao') await colocarNoPasso(r.c, passo);
  return r;
}
async function colocarNoPasso(c, passo) {
  const agora = new Date().toISOString();
  await forcarEntrega(local.db, { conversa_id: c }, { passo, cliente_captacao: CLIENTE, entrega_ate: '2026-12-01', previa_url: PREVIA, previa_em: agora,
    prazo: JSON.stringify({ entrada_em: agora, numero_em: agora, conta_desde: agora, pausas: [] }),
    ...(['no_ar', 'suspensa'].includes(passo) ? { site_url: SITE, no_ar_em: agora } : {}) });
}
/* a order que pagou a entrada, a tentativa e a proposta */
const entradaDe = c => um(`select t.id as tentativa, t.provedor_order_id as ord, pg.proposta_id as proposta, pg.valor from app.tentativas_pagamento t
  join app.pagamentos pg on pg.id = t.pagamento_id join app.propostas pr on pr.id = pg.proposta_id
  where pr.conversa_id = $1 and pg.parcela = 'sinal' and t.provedor_order_id = pg.gateway_ref`, [c]);
const refundsDe = order => sim.chamadas.filter(x => x.metodo === 'POST' && x.caminho === '/v1/orders/' + order + '/refund');
const cancelsDe = order => sim.chamadas.filter(x => x.metodo === 'POST' && x.caminho === '/v1/orders/' + order + '/cancel');
const desistir = (n, c, extra = {}) => n.chamar('POST', 'desistir', { conversa_id: c, confirmo: true, ...extra });
const doBanco = async (c, col, tabela = 'app.entregas') => (await um(`select ${col} as v from ${tabela} where ${tabela === 'app.conversas' ? 'id' : 'conversa_id'} = $1`, [c])).v;
const linha = c => um('select * from app.desistencias where conversa_id = $1', [c]);
async function recuar(c, intervalo) {
  const e = await entradaDe(c);
  await local.db.exec('begin; set local session_replication_role = replica;');
  await local.db.query('update app.propostas set respondida_em = respondida_em - $2::interval where id = $1', [e.proposta, intervalo]);
  await local.db.query("update app.pagamentos set pago_em = pago_em - $2::interval where proposta_id = $1 and parcela = 'sinal'", [e.proposta, intervalo]);
  await local.db.exec('commit');
}
/* a frase que a pessoa lê nunca é a mensagem crua do banco nem do provedor */
const semCru = corpo => assert.ok(!/55000|40001|22023|P0002|exception|passo atual|rpc |mercadopago|ORD[0-9A-Z]{8}|dsc-|HTTP|idempot/i.test(JSON.stringify(corpo)), JSON.stringify(corpo));

test('a ação existe, é POST e não há GET que desista', () => {
  assert.equal(ACOES.POST.desistir, 'desistir');
  assert.deepEqual(Object.keys(ACOES.GET).filter(k => /desist/.test(k)), []);
});

/* ---------- o caminho feliz ---------- */
test('desistir de dentro do prazo: o MP devolve a entrada INTEIRA (uma vez, com a chave dsc-<tentativa>), o pedido é encerrado por desistência e o dono recebe UM aviso', async () => {
  const { servico, avisos } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  const r = await desistir(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.ok, true); assert.equal(r.corpo.encerrado, true);
  const pedidos = refundsDe(e.ord);
  assert.equal(pedidos.length, 1, 'um estorno só');
  assert.equal(pedidos[0].chave, 'dsc-' + e.tentativa);
  const order = sim.orders.get(e.ord);
  assert.equal(order.status, 'refunded'); assert.equal(order.transactions.refunds[0].amount, order.total_amount, 'a entrada inteira');
  assert.equal(Number(order.total_amount), Number(e.valor));
  assert.equal(await doBanco(c, 'passo'), 'encerrada'); assert.equal(await doBanco(c, 'encerrada_motivo'), 'desistencia');
  assert.equal(await doBanco(c, 'etapa', 'app.conversas'), 'encerrada');
  assert.equal((await linha(c)).status, 'concluida');
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'sinal'", [e.proposta])).status, 'estornado');
  assert.equal(avisos.length, 1, JSON.stringify(avisos)); assert.equal(avisos[0].evento, 'desistencia'); assert.match(avisos[0].codigo, /^BZ-/);
  const lido = (await cen.estado(n, c)).entrega;
  assert.equal(lido.passo, 'encerrada'); assert.equal(lido.desistiu, true); assert.equal(lido.pode_desistir, false);
  semCru(r.corpo);
});

test('o aviso do Mercado Pago que chega DEPOIS (o estorno que o próprio MP anuncia) não avisa o dono de novo nem mexe em nada', async () => {
  const { servico, avisos } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  await desistir(n, c);
  const a = sim.aviso(e.ord, { acao: 'order.refunded' });
  const r = await receber(new Request(BASE + '/api/pagamentos' + a.query, { method: 'POST', headers: a.cabecalhos, body: a.corpo }), {}, { banco: local.rpc, servico });
  assert.equal(r.status, 200);
  assert.equal(avisos.length, 1, 'continua um aviso só');
  assert.equal(await doBanco(c, 'passo'), 'encerrada');
});

test('o webhook que chega ANTES de o servidor aplicar o estorno (a corrida) também diz "desistencia", e um aviso só', async () => {
  const real = criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch });
  const doServico = {};
  const mp = provedorCom({ async reembolsarOrdem(id, chave) {
    const dados = await real.reembolsarOrdem(id, chave);
    const a = sim.aviso(id, { acao: 'order.refunded' });
    await receber(new Request(BASE + '/api/pagamentos' + a.query, { method: 'POST', headers: a.cabecalhos, body: a.corpo }), {}, { banco: local.rpc, servico: doServico.s });
    return dados;
  } });
  const { servico, avisos } = servicoCom({ provedor: mp });
  doServico.s = servico;
  const { n, c } = await pedido({ pagamentos: servico });
  const r = await desistir(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(avisos.map(x => x.evento), ['desistencia'], JSON.stringify(avisos));
  assert.equal(await doBanco(c, 'passo'), 'encerrada');
});

/* ---------- nada vem da requisição ---------- */
test('o corpo não manda em nada: valor, order, tentativa e proposta de fora são ignorados; o estorno vai para a order que PAGOU e pelo valor dela', async () => {
  const { servico } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico });
  const outra = await pedido({ pagamentos: servico });
  const e = await entradaDe(c), eOutra = await entradaDe(outra.c);
  const r = await desistir(n, c, { valor: 1, order_id: eOutra.ord, tentativa_id: eOutra.tentativa, proposta_id: eOutra.proposta, motivo: 'qualquer', amount: '0.01' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(refundsDe(e.ord).length, 1);
  assert.equal(refundsDe(eOutra.ord).length, 0, 'a order de outro pedido não é tocada');
  assert.equal(sim.orders.get(e.ord).transactions.refunds[0].amount, sim.orders.get(e.ord).total_amount);
  assert.equal(sim.orders.get(eOutra.ord).status, 'processed');
  const corpoDoRefund = sim.chamadas.filter(x => x.caminho === '/v1/orders/' + e.ord + '/refund');
  assert.equal(corpoDoRefund.length, 1);
});

test('sem o "confirmo": nada acontece (o segundo clique é o que pede)', async () => {
  const { servico } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  for (const corpo of [{ conversa_id: c }, { conversa_id: c, confirmo: 'true' }, { conversa_id: c, confirmo: false }, { conversa_id: c, confirmo: 1 }]) {
    const r = await n.chamar('POST', 'desistir', corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
  assert.equal(refundsDe(e.ord).length, 0); assert.equal(await linha(c), undefined);
});

/* ---------- de quem é o pedido ---------- */
test('sem sessão: 401, nenhum estorno; com a sessão de OUTRO cliente: 404, nenhum estorno e nenhuma linha', async () => {
  const { servico } = servicoCom();
  const a = await pedido({ pagamentos: servico }), b = await pedido({ pagamentos: servico });
  const e = await entradaDe(a.c);
  const semToken = cen.navegador({ pagamentos: servico, env: { BZ_ENTREGA: 'ligada' } });   /* (nunca abriu sessão: sem token) */
  assert.equal((await desistir(semToken, a.c)).status, 401);
  const alheio = await desistir(b.n, a.c);
  assert.equal(alheio.status, 404, JSON.stringify(alheio.corpo));
  assert.equal(refundsDe(e.ord).length, 0); assert.equal(await linha(a.c), undefined);
  assert.equal(await doBanco(a.c, 'passo'), 'material');
});

/* ---------- a janela, o restante, o site no ar ---------- */
test('fora dos 7 dias: o servidor recusa com uma frase humana (recado) e NÃO estorna; na fronteira, 2h59 depois dos 7 dias ainda vale e 3h01 não', async () => {
  const { servico } = servicoCom();
  const dentro = await pedido({ pagamentos: servico });
  await recuar(dentro.c, '7 days 2 hours 59 minutes');
  assert.equal((await desistir(dentro.n, dentro.c)).status, 200, 'ainda dentro (margem a favor do cliente)');
  const fora = await pedido({ pagamentos: servico });
  const e = await entradaDe(fora.c);
  await recuar(fora.c, '7 days 3 hours 1 minute');
  const r = await desistir(fora.n, fora.c);
  assert.equal(r.status, 409, JSON.stringify(r.corpo)); assert.equal(r.corpo.recado, true); semCru(r.corpo);
  assert.equal(refundsDe(e.ord).length, 0); assert.equal(await doBanco(fora.c, 'passo'), 'material'); assert.equal(await linha(fora.c), undefined);
  const ontem = await pedido({ pagamentos: servico });
  await recuar(ontem.c, '8 days');
  assert.equal((await desistir(ontem.n, ontem.c)).status, 409);
  const velha = await pedido({ pagamentos: servico });
  await recuar(velha.c, '6 days');
  assert.equal((await desistir(velha.n, velha.c)).status, 200);
});

test('restante PAGO: recusa e não estorna a entrada (o dono resolve à mão)', async () => {
  const { servico, avisos } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico, passo: 'aprovada' });
  const e = await entradaDe(c);
  const t = await iniciarRestante(local.db, { conversa_id: c, visitante_id: (await um('select visitante_id as v from app.conversas where id = $1', [c])).v });
  assert.equal((await aprovarRestante(local.db, t)).aplicado, 'aprovada');
  avisos.length = 0;
  const r = await desistir(n, c);
  assert.equal(r.status, 409); assert.equal(r.corpo.recado, true); semCru(r.corpo);
  assert.equal(refundsDe(e.ord).length, 0); assert.equal(await doBanco(c, 'passo'), 'aprovada');
  assert.deepEqual(avisos, []);
});

test('site no ar ou suspenso: recusa e não estorna', async () => {
  const { servico } = servicoCom();
  for (const passo of ['no_ar', 'suspensa']) {
    const { n, c } = await pedido({ pagamentos: servico, passo });
    const e = await entradaDe(c);
    const r = await desistir(n, c);
    assert.equal(r.status, 409, passo); assert.equal(r.corpo.recado, true);
    assert.equal(refundsDe(e.ord).length, 0, passo);
  }
});

test('interruptor da entrega desligado: o mesmo 503 das outras ações do pedido, sem estorno', async () => {
  const { servico } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico, extra: { env: {} } });
  const e = await entradaDe(c);
  const r = await desistir(n, c);
  assert.equal(r.status, 503, JSON.stringify(r.corpo));
  assert.equal(refundsDe(e.ord).length, 0); assert.equal(await linha(c), undefined);
});

/* ---------- duplo clique e duas abas ---------- */
test('duplo clique / duas abas ao mesmo tempo: UM estorno no provedor, um 200 e o outro 409 ("já estamos cuidando"); depois, "já foi cancelado"', async () => {
  const { servico, avisos } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  const [a, b] = await Promise.all([desistir(n, c), desistir(n, c)]);
  const status = [a.status, b.status].sort();
  assert.deepEqual(status, [200, 409], JSON.stringify([a.corpo, b.corpo]));
  assert.equal(refundsDe(e.ord).length, 1, 'um estorno só no provedor');
  const terceira = await desistir(n, c);
  assert.equal(terceira.status, 409); semCru(terceira.corpo);
  assert.equal(refundsDe(e.ord).length, 1);
  assert.equal(avisos.filter(x => x.evento === 'desistencia').length, 1);
  assert.equal((await um('select count(*)::int n from app.desistencias where conversa_id = $1', [c])).n, 1);
});

/* ---------- o que o provedor devolve manda ---------- */
test('a order consultada não é a paga (conta errada, valor diferente, referência de outro pedido, estado não aprovado): NADA é estornado, nada é encerrado, o dono é avisado', async () => {
  const defeitos = {
    'conta de outro Mercado Pago': o => { o.user_id = '999'; },
    'valor da order diferente do cobrado': o => { o.total_amount = '1.00'; o.transactions.payments[0].amount = '1.00'; },
    'referência de outro pedido': o => { o.external_reference = '00000000-0000-4000-8000-00000000abcd'; },
    'contestada': o => { o.status = 'charged_back'; o.transactions.payments[0].status = 'charged_back'; },
    'já estornada em parte': o => { o.transactions.payments[0].status_detail = 'partially_refunded'; }
  };
  for (const [nome, estraga] of Object.entries(defeitos)) {
    const { servico, avisos } = servicoCom();
    const { n, c } = await pedido({ pagamentos: servico });
    const e = await entradaDe(c);
    sim.editar(e.ord, estraga);
    const r = await desistir(n, c);
    assert.ok(r.status >= 400, nome + ': ' + r.status);
    assert.equal(refundsDe(e.ord).length, 0, nome + ': nenhum estorno');
    assert.equal(await doBanco(c, 'passo'), 'material', nome);
    assert.notEqual(await doBanco(c, 'passo'), 'encerrada', nome);
    assert.ok(avisos.some(a => a.evento === 'desistencia_falhou' || a.evento === 'contestacao'), nome + ': ' + JSON.stringify(avisos));
    semCru(r.corpo);
  }
});

/* ---------- falhas ---------- */
test('o provedor RECUSA o estorno: o pedido continua pago e aberto, a trava solta, a falha fica no rastro, o dono é avisado e a mensagem é humana; a nova tentativa usa a MESMA chave', async () => {
  const falha = new ErroProvedor('indisponivel', 503);
  let falhar = true;
  const mp = provedorCom({ async reembolsarOrdem(id, chave) { if (falhar) throw falha; return criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch }).reembolsarOrdem(id, chave); } });
  const { servico, avisos } = servicoCom({ provedor: mp });
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  const r = await desistir(n, c);
  assert.equal(r.status, 503, JSON.stringify(r.corpo)); assert.equal(r.corpo.recado, true); semCru(r.corpo);
  assert.equal(await doBanco(c, 'passo'), 'material'); assert.equal(await doBanco(c, 'etapa', 'app.conversas'), 'em_producao');
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'sinal'", [e.proposta])).status, 'pago');
  const l = await linha(c);
  assert.equal(l.status, 'pedida'); assert.equal(l.falhas, 1); assert.equal(l.iniciada_em, null);
  assert.deepEqual(avisos.map(a => a.evento), ['desistencia_falhou']);
  falhar = false;
  const de_novo = await desistir(n, c);
  assert.equal(de_novo.status, 200, JSON.stringify(de_novo.corpo));
  assert.equal(refundsDe(e.ord).length, 1);
  assert.equal((await linha(c)).tentativas, 2);
  assert.deepEqual(avisos.map(a => a.evento), ['desistencia_falhou', 'desistencia']);
});

test('o provedor falha na CONSULTA antes de estornar: nada é estornado e nada muda', async () => {
  const mp = provedorCom({ async consultarOrdem() { throw new ErroProvedor('tempo'); } });
  const { servico, avisos } = servicoCom({ provedor: mp });
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  const r = await desistir(n, c);
  assert.equal(r.status, 503); semCru(r.corpo);
  assert.equal(refundsDe(e.ord).length, 0); assert.equal(await doBanco(c, 'passo'), 'material');
  assert.deepEqual(avisos.map(a => a.evento), ['desistencia_falhou']);
});

test('o estorno saiu mas a reconsulta falhou: o pedido NÃO é encerrado nem dado como devolvido; a nova tentativa NÃO estorna de novo e conclui', async () => {
  const real = criarMercadoPago({ token: local.mp.token, fetch: local.mp.fetch });
  let estornou = false, derrubar = true;
  const mp = provedorCom({
    async reembolsarOrdem(id, chave) { estornou = true; return real.reembolsarOrdem(id, chave); },
    async consultarOrdem(id) { if (estornou && derrubar) { derrubar = false; throw new ErroProvedor('rede'); } return real.consultarOrdem(id); }
  });
  const { servico, avisos } = servicoCom({ provedor: mp });
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  const r = await desistir(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.equal(r.corpo.aguardando, true); assert.equal(r.corpo.encerrado, false); semCru(r.corpo);
  assert.equal(await doBanco(c, 'passo'), 'material');
  assert.equal((await linha(c)).status, 'pedida');
  await local.db.query("update app.desistencias set iniciada_em = now() - interval '3 minutes' where conversa_id = $1", [c]);
  const depois = await desistir(n, c);
  assert.equal(depois.status, 200, JSON.stringify(depois.corpo));
  assert.equal(refundsDe(e.ord).length, 1, 'o segundo estorno nunca sai: a order já estava estornada');
  assert.equal(await doBanco(c, 'passo'), 'encerrada');
  assert.equal(avisos.filter(a => a.evento === 'desistencia').length, 1);
});

test('o dono já tinha estornado a entrada à mão e o cliente clica: NENHUM novo estorno, o pedido encerra (a devolução já existe)', async () => {
  const { servico } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  sim.estornar(e.ord);
  const r = await desistir(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(refundsDe(e.ord).length, 0);
  assert.equal(await doBanco(c, 'passo'), 'encerrada');
});

test('o estorno saiu e o pedido não pôde encerrar (o Pix do restante ainda ativo): a entrada está devolvida e o dono recebe o aviso de encerrar à mão; a nova chamada só encerra', async () => {
  let recusar = true;
  const banco = async (nome, p) => (nome === 'vendas_encerrar' && recusar ? { ok: false, motivo: 'pagamento_em_andamento' } : local.rpc(nome, p));
  const { servico, avisos } = servicoCom({ banco });
  const { n, c } = await pedido({ pagamentos: servico });
  const e = await entradaDe(c);
  const r = await desistir(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.equal(r.corpo.encerrado, false);
  assert.equal(refundsDe(e.ord).length, 1); assert.equal((await linha(c)).status, 'estornada');
  assert.ok(avisos.some(a => a.evento === 'desistencia_nao_encerrada'), JSON.stringify(avisos));
  recusar = false;
  const fecha = await desistir(n, c);
  assert.equal(fecha.status, 200, JSON.stringify(fecha.corpo)); assert.equal(fecha.corpo.encerrado, true);
  assert.equal(refundsDe(e.ord).length, 1, 'encerrar não estorna de novo');
  assert.equal(await doBanco(c, 'passo'), 'encerrada'); assert.equal((await linha(c)).status, 'concluida');
});

/* ---------- o bloqueio e a limpeza do #196 ---------- */
test('o estorno da desistência aciona o #196: o Pix do restante ainda aberto é CANCELADO no provedor (cx-<tentativa>) e a entrega encerra', async () => {
  const { servico } = servicoCom();
  const { n, c } = await pedido({ pagamentos: servico, passo: 'aprovada' });
  const vid = (await um('select visitante_id as v from app.conversas where id = $1', [c])).v;
  const rest = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '52998224725' } });
  assert.equal(rest.status, 200, JSON.stringify(rest.corpo));
  const tRest = await um(`select t.id, t.provedor_order_id as ord from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id
    where pg.parcela = 'saldo' and pg.proposta_id = (select proposta_id from app.entregas where conversa_id = $1)`, [c]);
  assert.equal(sim.orders.get(tRest.ord).status, 'action_required');
  void vid;
  const r = await desistir(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(cancelsDe(tRest.ord).length, 1); assert.equal(cancelsDe(tRest.ord)[0].chave, 'cx-' + tRest.id);
  assert.equal(sim.orders.get(tRest.ord).status, 'canceled');
  assert.equal(await doBanco(c, 'passo'), 'encerrada');
});

/* ---------- o texto do aviso ao dono ---------- */
test('os três avisos novos ao dono: texto fixo, só o código do pedido; "desistência" diz que a entrada foi devolvida e NÃO diz contestação', () => {
  const codigo = 'BZ-ACDEF';
  const a = textoDoAvisoDePagamento({ codigo, evento: 'desistencia', parcela: 'entrada' });
  assert.match(a, /BZ-ACDEF/); assert.match(a, /desist/i); assert.match(a, /devolvid/i); assert.doesNotMatch(a, /conteste|disputa|URGENTE/i);
  const b = textoDoAvisoDePagamento({ codigo, evento: 'desistencia_falhou', parcela: 'entrada' });
  assert.match(b, /URGENTE/); assert.match(b, /BZ-ACDEF/); assert.match(b, /não devolveu|não foi devolvid/i);
  const c = textoDoAvisoDePagamento({ codigo, evento: 'desistencia_nao_encerrada', parcela: 'entrada' });
  assert.match(c, /URGENTE/); assert.match(c, /encerr/i);
  for (const t of [a, b, c]) assert.ok(!/[\r\n]|R\$|@|\+55/.test(t), t);
  assert.ok(!/BZ-ACDEF\r\n/.test(textoDoAvisoDePagamento({ codigo: 'BZ-ACDEF\r\nBcc: x@y.com', evento: 'desistencia', parcela: 'entrada' })));
});
