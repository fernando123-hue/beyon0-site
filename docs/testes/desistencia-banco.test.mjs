/* A DESISTÊNCIA PELO CLIENTE, o lado do BANCO (20/11, dono). Postgres real (PGlite) com as migrations.
   Até 7 dias depois de aceitar as condições o cliente desiste por qualquer motivo e recebe a ENTRADA de volta (CDC art. 49). O banco decide se pode
   (app.desistencia_preparar), nunca o navegador; guarda UMA desistência por pedido (idempotência); e converte o alerta do estorno em "desistência"
   (o dono não confunde com contestação). O estorno em si e o encerramento são do servidor (docs/testes/desistencia.test.mjs).  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, iniciarRestante, aprovarRestante, codigoDe } from './_previa.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const base = c => ({ conversa_id: c.conversa_id, visitante_id: c.visitante_id });
const preparar = c => rpc('desistencia_preparar', base(c));
const marcar = (id, status, extra = {}) => rpc('desistencia_marcar', { desistencia_id: id, status, ...extra });

/* a tentativa que pagou a entrada */
const tentativaDe = (c, parcela = 'sinal') => um(`select t.id, t.provedor_order_id as order, t.valor from app.tentativas_pagamento t
  join app.pagamentos pg on pg.id = t.pagamento_id where pg.proposta_id = $1 and pg.parcela = $2 and t.provedor_order_id = pg.gateway_ref`, [c.proposta, parcela]);
/* o retrato do Mercado Pago: a entrada estornada */
async function estornar(c, parcela = 'sinal') {
  const t = await tentativaDe(c, parcela), v = Number(t.valor).toFixed(2);
  return rpc('pagamentos_aplicar', { provedor: 'mercadopago', origem: 'webhook', conta_esperada: '777', retrato: {
    order_id: t.order, external_reference: t.id, user_id: '777', total_amount: v, country_code: 'BRA',
    pagamento: { id: 'PAY' + t.order.slice(-6), amount: v, paid_amount: v, status: 'refunded', status_detail: 'refunded', metodo_id: 'pix', metodo_tipo: 'bank_transfer', parcelas: null }, estado: 'estornada' } });
}
/* o relógio anda para trás: as duas marcas da aceitação (a proposta aceita e o pagamento da entrada) recuam. Os gatilhos de imutabilidade ficam de fora só aqui */
async function recuar(c, intervalo, { soAceite = false } = {}) {
  await db.exec('begin; set local session_replication_role = replica;');
  try {
    await db.query('update app.propostas set respondida_em = respondida_em - $2::interval where id = $1', [c.proposta, intervalo]);
    if (!soAceite) await db.query("update app.pagamentos set pago_em = pago_em - $2::interval where proposta_id = $1 and parcela = 'sinal'", [c.proposta, intervalo]);
    await db.exec('commit');
  } catch (e) { await db.exec('rollback'); throw e; }
}
const linhaDe = c => um('select * from app.desistencias where proposta_id = $1', [c.proposta]);

/* ---------- o caminho aberto ---------- */
test('dentro do prazo, com a entrada paga e o restante em aberto: o banco libera e devolve SÓ o que o servidor precisa (a order paga, o valor da entrada, o código do pedido)', async () => {
  const c = await entregaEm(db, 'producao');
  const t = await tentativaDe(c);
  const r = await preparar(c);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.retomar, false);
  assert.equal(r.order_id, t.order, 'a order é a que PAGOU a entrada (o gateway_ref), nunca uma que veio de fora');
  assert.equal(r.tentativa_id, t.id);
  assert.equal(Number(r.valor), 1200);
  assert.equal(r.codigo, await codigoDe(db, c));
  const l = await linhaDe(c);
  assert.equal(l.status, 'pedida'); assert.equal(l.tentativas, 1); assert.ok(l.iniciada_em);
  assert.equal(l.conversa_id, c.conversa_id);
});

test('em QUALQUER passo antes do ar a desistência abre: material, produção, prévia, ajustes e prévia aprovada', async () => {
  for (const passo of ['material', 'producao', 'previa', 'ajustes', 'aprovada']) {
    const c = await entregaEm(db, passo);
    assert.equal((await preparar(c)).ok, true, passo);
  }
});

test('com o site no ar, suspenso, concluído ou o pedido encerrado: recusa, sem tocar em nada', async () => {
  for (const passo of ['no_ar', 'suspensa']) {
    const c = await entregaEm(db, passo);
    assert.deepEqual(await preparar(c), { ok: false, motivo: 'passo' }, passo);
    assert.equal(await linhaDe(c), undefined, passo + ': nada foi gravado');
  }
  const e = await entregaEm(db, 'producao');
  await rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, e), motivo: 'outro' });
  assert.notEqual((await erroDe(preparar(e)))?.codigo ?? 'ok', 'ok', 'encerrado: a etapa da conversa já não é a de produção');
});

/* ---------- de quem é o pedido ---------- */
test('pedido de OUTRO cliente: o banco não acha (P0002), nada é gravado', async () => {
  const a = await entregaEm(db, 'producao'), b = await entregaEm(db, 'producao');
  const erro = await erroDe(rpc('desistencia_preparar', { conversa_id: a.conversa_id, visitante_id: b.visitante_id }));
  assert.equal(erro.codigo, 'P0002');
  assert.equal(await linhaDe(a), undefined);
});

test('conversa que ainda não pagou a entrada (aguardando pagamento): 55000, nada gravado', async () => {
  const { conversaComEntradaPaga } = await import('./_entrega.mjs');
  const c = await conversaComEntradaPaga(db, { semPagar: true });
  const erro = await erroDe(preparar(c));
  assert.equal(erro.codigo, '55000');
});

/* ---------- a janela de 7 dias ---------- */
test('a janela: 6 dias, 7 dias exatos e 7 dias mais 2h59 passam (a margem de 3 horas é a favor do cliente); 7 dias mais 3h01 e 8 dias recusam', async () => {
  const caso = async (intervalo, esperado) => {
    const c = await entregaEm(db, 'producao');
    await recuar(c, intervalo);
    const r = await preparar(c);
    if (esperado) assert.equal(r.ok, true, intervalo + ': ' + JSON.stringify(r));
    else assert.deepEqual(r, { ok: false, motivo: 'prazo' }, intervalo);
    if (!esperado) assert.equal(await linhaDe(c), undefined, intervalo + ': recusada não grava');
  };
  await caso('6 days', true);
  await caso('7 days', true);
  await caso('7 days 2 hours 59 minutes', true);
  await caso('7 days 3 hours 1 minute', false);
  await caso('8 days', false);
  await caso('30 days', false);
});

test('a contagem sai da marca MAIS ANTIGA entre a aceitação das condições e o pagamento: aceite há 8 dias, pago agora, já passou', async () => {
  const c = await entregaEm(db, 'producao');
  await recuar(c, '8 days', { soAceite: true });
  assert.deepEqual(await preparar(c), { ok: false, motivo: 'prazo' });
  const d = await entregaEm(db, 'producao');
  await db.exec('begin; set local session_replication_role = replica;');
  await db.query("update app.pagamentos set pago_em = pago_em - interval '8 days' where proposta_id = $1 and parcela = 'sinal'", [d.proposta]);
  await db.exec('commit');
  assert.deepEqual(await preparar(d), { ok: false, motivo: 'prazo' }, 'pago há 8 dias, aceite recente: vale a mais antiga');
});

/* ---------- o restante pago, a entrega bloqueada ---------- */
test('restante PAGO: recusa (o cliente já recebeu o site pronto; o dono resolve à mão)', async () => {
  const c = await entregaEm(db, 'aprovada');
  assert.equal((await aprovarRestante(db, await iniciarRestante(db, c))).aplicado, 'aprovada');
  assert.deepEqual(await preparar(c), { ok: false, motivo: 'restante' });
  assert.equal(await linhaDe(c), undefined);
});

test('restante estornado ou contestado: recusa também (a parcela já teve dinheiro)', async () => {
  const c = await entregaEm(db, 'aprovada');
  await aprovarRestante(db, await iniciarRestante(db, c));
  await estornar(c, 'saldo');
  const r = await preparar(c);
  assert.equal(r.ok, false); assert.ok(['restante', 'bloqueada'].includes(r.motivo), r.motivo);
});

test('Pix do restante ABERTO (ainda não pago) não impede: o estorno da entrada manda cancelá-lo', async () => {
  const c = await entregaEm(db, 'aprovada');
  await iniciarRestante(db, c);
  assert.equal((await preparar(c)).ok, true);
});

test('entrega bloqueada (projeto pausado, entrada já estornada ou contestada): recusa e manda falar com a equipe', async () => {
  const pausado = await entregaEm(db, 'producao');
  await db.query("update app.projetos set status = 'pausado' where id = (select projeto_id from app.propostas where id = $1)", [pausado.proposta]);
  assert.equal((await preparar(pausado)).ok, false);
  const estornada = await entregaEm(db, 'producao');
  await estornar(estornada);
  const r = await preparar(estornada);
  assert.equal(r.ok, false); assert.ok(['entrada', 'bloqueada'].includes(r.motivo), r.motivo);
});

/* ---------- idempotência: UMA desistência por pedido ---------- */
test('duas chamadas seguidas: a segunda vê a primeira em andamento e NÃO libera outro estorno', async () => {
  const c = await entregaEm(db, 'producao');
  const [a, b] = await Promise.all([preparar(c), preparar(c)]);
  assert.equal([a, b].filter(x => x.ok).length, 1, JSON.stringify([a, b]));
  assert.deepEqual([a, b].find(x => !x.ok), { ok: false, motivo: 'em_andamento' });
  assert.equal((await db.query('select 1 from app.desistencias where proposta_id = $1', [c.proposta])).rows.length, 1);
});

test('passada a trava de 2 minutos sem resposta, a nova tentativa continua a MESMA desistência (a mesma tentativa, a mesma chave no provedor)', async () => {
  const c = await entregaEm(db, 'producao');
  const primeira = await preparar(c);
  await db.query("update app.desistencias set iniciada_em = now() - interval '3 minutes' where proposta_id = $1", [c.proposta]);
  const segunda = await preparar(c);
  assert.equal(segunda.ok, true); assert.equal(segunda.tentativa_id, primeira.tentativa_id); assert.equal(segunda.desistencia_id, primeira.desistencia_id);
  assert.equal((await linhaDe(c)).tentativas, 2);
});

test('falhou no provedor: a trava solta (a pessoa pode tentar de novo), a falha fica no rastro e a desistência continua a mesma', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id } = await preparar(c);
  assert.deepEqual(await marcar(desistencia_id, 'falhou', { detalhe: 'indisponivel' }), { ok: true });
  const l = await linhaDe(c);
  assert.equal(l.status, 'pedida'); assert.equal(l.iniciada_em, null); assert.equal(l.falhas, 1); assert.equal(l.falha, 'indisponivel');
  assert.equal((await preparar(c)).desistencia_id, desistencia_id);
});

test('as marcas só andam para a frente: pedida → estornada → concluida; "concluida" direto da pedida e voltar atrás são recusados', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(c);
  assert.equal((await erroDe(marcar(id, 'concluida'))).codigo, '55000');
  assert.equal((await erroDe(marcar(id, 'qualquer'))).codigo, '22023');
  assert.deepEqual(await marcar(id, 'estornada'), { ok: true });
  assert.equal((await erroDe(marcar(id, 'falhou'))).codigo, '55000');
  assert.deepEqual(await marcar(id, 'concluida'), { ok: true });
  assert.equal((await erroDe(marcar(id, 'estornada'))).codigo, '55000');
  const l = await linhaDe(c);
  assert.equal(l.status, 'concluida'); assert.ok(l.estornada_em); assert.ok(l.concluida_em);
});

test('depois do estorno (e antes de encerrar) a nova chamada RETOMA só o encerramento: sem outro estorno; depois de concluída, "já desistiu"', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(c);
  await marcar(id, 'estornada');
  const r = await preparar(c);
  assert.equal(r.ok, true); assert.equal(r.retomar, true); assert.equal(r.codigo, await codigoDe(db, c));
  await marcar(id, 'concluida');
  assert.deepEqual(await preparar(c), { ok: false, motivo: 'ja_desistiu' });
});

test('UMA desistência por pedido: o banco recusa a segunda linha', async () => {
  const c = await entregaEm(db, 'producao');
  await preparar(c);
  const erro = await erroDe(db.query(`insert into app.desistencias (org_id, proposta_id, conversa_id, tentativa_id, order_id, valor)
    select org_id, proposta_id, conversa_id, tentativa_id, order_id, valor from app.desistencias where proposta_id = $1`, [c.proposta]));
  assert.equal(erro.codigo, '23505');
});

/* ---------- o estorno da desistência: o bloqueio do #196 e o alerta certo ---------- */
test('o estorno da entrada de uma desistência: bloqueia a entrega, cancela o Pix do restante e o ALERTA diz "desistencia" (não "estorno")', async () => {
  const c = await entregaEm(db, 'aprovada');
  const { t, order } = await iniciarRestante(db, c);
  await preparar(c);
  const r = await estornar(c);
  assert.equal(r.aplicado, 'estornada');
  assert.deepEqual(r.alerta, { codigo: await codigoDe(db, c), evento: 'desistencia', parcela: 'entrada' });
  assert.deepEqual(r.cancelar_restante, [{ tentativa_id: t.tentativa_id, order }], 'o #196 manda cancelar o Pix do restante');
  assert.equal((await um('select privado.entrega_bloqueada(e) as b from app.entregas e where conversa_id = $1', [c.conversa_id])).b, true);
  assert.equal((await estornar(c)).alerta, undefined, 'o aviso repetido do provedor não alerta de novo');
});

test('o estorno sem desistência (o cliente estornou no banco, o dono estornou à mão) continua sendo "estorno": o alerta antigo não muda', async () => {
  const c = await entregaEm(db, 'producao');
  assert.deepEqual((await estornar(c)).alerta, { codigo: await codigoDe(db, c), evento: 'estorno', parcela: 'entrada' });
});

test('estornada a entrada, o pedido encerra pelo MESMO caminho do dono (vendas_encerrar, motivo desistência): entrega encerrada, conversa encerrada, projeto cancelado', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(c);
  await estornar(c); await marcar(id, 'estornada');
  assert.deepEqual(await rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), motivo: 'desistencia' }), { ok: true });
  const e = await um('select passo, encerrada_motivo from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.passo, e.encerrada_motivo], ['encerrada', 'desistencia']);
  assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa_id])).etapa, 'encerrada');
  assert.equal((await um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta])).status, 'cancelado');
});

/* ---------- o que a tela lê ---------- */
test('a leitura do cliente diz se a opção existe: aberta dentro dos 7 dias; sumida fora deles, com o restante pago, no ar, depois de pedida, e o pedido desistido é marcado', async () => {
  const pode = async c => (await rpc('vendas_estado', base(c))).entrega;
  const aberta = await entregaEm(db, 'producao');
  assert.equal((await pode(aberta)).pode_desistir, true);
  assert.equal((await pode(aberta)).desistiu, false);
  const velha = await entregaEm(db, 'producao');
  await recuar(velha, '8 days');
  assert.equal((await pode(velha)).pode_desistir, false);
  const noar = await entregaEm(db, 'no_ar');
  assert.equal((await pode(noar)).pode_desistir, false);
  const paga = await entregaEm(db, 'aprovada');
  await aprovarRestante(db, await iniciarRestante(db, paga));
  assert.equal((await pode(paga)).pode_desistir, false);
  const pedida = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(pedida);
  assert.equal((await pode(pedida)).pode_desistir, false, 'já pedida: o link some');
  await estornar(pedida); await marcar(id, 'estornada');
  await rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, pedida), motivo: 'desistencia' });
  await marcar(id, 'concluida');
  const depois = await pode(pedida);
  assert.equal(depois.pode_desistir, false); assert.equal(depois.desistiu, true);
});

test('a leitura do cliente não vaza o que o banco usou para decidir: só dois booleanos novos, nenhuma data nem order', async () => {
  const c = await entregaEm(db, 'producao');
  const antes = JSON.stringify((await rpc('vendas_estado', base(c))).entrega);
  await preparar(c);
  const depois = (await rpc('vendas_estado', base(c))).entrega;
  assert.ok(!/ORD|desistenc|iniciada|dsc-/.test(JSON.stringify(depois).replace(/pode_desistir|desistiu/g, '')), JSON.stringify(depois));
  assert.ok(antes.includes('pode_desistir'));
});

/* ---------- só o servidor ---------- */
test('as funções novas são só do servidor (service_role): anon e authenticated não executam; a tabela não tem política', async () => {
  const { como } = await import('./_banco.mjs');
  for (const fn of ['desistencia_preparar', 'desistencia_marcar']) {
    for (const quem of ['anon', '00000000-0000-4000-8000-000000000042']) {
      if (quem !== 'anon') await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [quem]);
      const erro = await erroDe(como(db, quem, q => q(`select app.${fn}('{}'::jsonb)`), { manter: false }));
      assert.ok(erro && /permission denied|42501/.test(erro.msg + erro.codigo), fn + ' para ' + quem + ': ' + JSON.stringify(erro));
    }
  }
  const lido = await erroDe(como(db, '00000000-0000-4000-8000-000000000042', q => q('select * from app.desistencias'), { manter: false }));
  assert.ok(lido && /permission denied/.test(lido.msg), 'a tabela fica só para o servidor');
});

/* ---------- as correções das revisões (20/11): o prazo na retomada, o que fica pela metade, o restante ---------- */
const recuarPedida = (c, intervalo) => db.query('update app.desistencias set pedida_em = pedida_em - $2::interval, iniciada_em = null where conversa_id = $1', [c.conversa_id, intervalo]);

test('retomada: uma desistência que FALHOU só pode ser retomada pela pessoa em 24 horas do pedido; passado isso (e 40 dias depois) o banco recusa por prazo', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(c);
  await marcar(id, 'falhou', { detalhe: 'indisponivel' });
  await recuarPedida(c, '23 hours');
  assert.equal((await preparar(c)).ok, true, 'dentro de 24 horas do pedido: segue');
  await marcar(id, 'falhou', { detalhe: 'indisponivel' });
  await recuarPedida(c, '2 hours');
  assert.deepEqual(await preparar(c), { ok: false, motivo: 'prazo' });
  await recuar(c, '40 days');
  await recuarPedida(c, '40 days');
  assert.deepEqual(await preparar(c), { ok: false, motivo: 'prazo' }, 'a janela de 7 dias não reabre por causa de uma falha antiga');
});

test('depois de 3 falhas o banco para de liberar (a equipe resolve): nenhuma consulta nova ao Mercado Pago por cliente insistente', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(c);
  for (let i = 0; i < 3; i++) { await marcar(id, 'falhou', { detalhe: 'x' }); if (i < 2) assert.equal((await preparar(c)).ok, true); }
  assert.deepEqual(await preparar(c), { ok: false, motivo: 'prazo' });
});

test('a entrada já devolvida e o dono encerrou o pedido à mão: a desistência se dá por concluída (não fica presa em "estornada")', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(c);
  await estornar(c); await marcar(id, 'estornada');
  await rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), motivo: 'desistencia' });
  assert.deepEqual(await preparar(c), { ok: false, motivo: 'ja_desistiu' });
  assert.equal((await linhaDe(c)).status, 'concluida');
});

test('com a desistência pedida (ou a entrada devolvida) NENHUMA cobrança nova do restante abre: a frase é a da entrega bloqueada', async () => {
  const c = await entregaEm(db, 'aprovada');
  await preparar(c);
  const erro = await erroDe(rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'pix', provedor: 'mercadopago' }));
  assert.equal(erro.codigo, '55000'); assert.match(erro.msg, /bloqueada/);
  const normal = await entregaEm(db, 'aprovada');
  assert.equal((await rpc('pagamentos_iniciar_tentativa', { ...base(normal), metodo: 'pix', provedor: 'mercadopago' })).ativa, false, 'sem desistência, o restante cobra como sempre');
});

test('desistencia_restante: lista os Pix do restante abertos e diz se o restante foi pago (a conferência de ANTES de estornar)', async () => {
  const sem = await entregaEm(db, 'aprovada');
  const { desistencia_id: idSem } = await preparar(sem);
  assert.deepEqual(await rpc('desistencia_restante', { desistencia_id: idSem }), { restante_pago: false, abertas: [] });
  const c = await entregaEm(db, 'aprovada');
  const { t, order } = await iniciarRestante(db, c);
  const { desistencia_id } = await preparar(c);
  assert.deepEqual(await rpc('desistencia_restante', { desistencia_id }), { restante_pago: false, abertas: [{ tentativa_id: t.tentativa_id, order }] });
  await aprovarRestante(db, { t, order });
  assert.equal((await rpc('desistencia_restante', { desistencia_id })).restante_pago, true);
});

test('desistencia_pendentes: só o que ficou pela metade, há mais de 10 e menos de 3 dias, sem trava viva; reserva a trava; nunca o que já está concluído ou fora do passo', async () => {
  const recente = await entregaEm(db, 'producao'); await preparar(recente);
  const meio = await entregaEm(db, 'producao'); const m = await preparar(meio); await recuarPedida(meio, '11 minutes');
  const estornada = await entregaEm(db, 'producao'); const e = await preparar(estornada); await marcar(e.desistencia_id, 'estornada'); await recuarPedida(estornada, '20 minutes');
  const antiga = await entregaEm(db, 'producao'); await preparar(antiga); await recuarPedida(antiga, '4 days');
  const noAr = await entregaEm(db, 'producao'); await preparar(noAr); await recuarPedida(noAr, '30 minutes'); await db.query("update app.entregas set passo = 'no_ar' where conversa_id = $1", [noAr.conversa_id]).catch(() => {});
  const lista = (await rpc('desistencia_pendentes', {})).itens;
  const ids = lista.map(x => x.desistencia_id);
  assert.ok(ids.includes(m.desistencia_id) && ids.includes(e.desistencia_id), 'a pela metade e a estornada entram');
  assert.ok(!ids.includes((await linhaDe(recente)).id), 'a recente (menos de 10 minutos) não');
  assert.ok(!ids.includes((await linhaDe(antiga)).id), 'a de mais de 3 dias fica para o dono');
  assert.ok(lista.length <= 3);
  for (const x of lista) assert.match(x.codigo, /^BZ-/);
  assert.equal((await rpc('desistencia_pendentes', {})).itens.filter(x => x.desistencia_id === m.desistencia_id).length, 0, 'a trava foi reservada: a segunda leitura não a devolve');
});

test('a marca "liberada" só solta a trava da pedida (nada mais anda)', async () => {
  const c = await entregaEm(db, 'producao');
  const { desistencia_id: id } = await preparar(c);
  assert.deepEqual(await marcar(id, 'liberada'), { ok: true });
  assert.equal((await linhaDe(c)).iniciada_em, null); assert.equal((await linhaDe(c)).status, 'pedida');
  await marcar(id, 'estornada');
  assert.equal((await erroDe(marcar(id, 'liberada'))).codigo, '55000');
});
