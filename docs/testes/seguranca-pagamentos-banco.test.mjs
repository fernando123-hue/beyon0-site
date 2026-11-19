/* A SEGURANÇA DOS PAGAMENTOS NA ENTREGA (decisões do dono, 19/11). Postgres real (PGlite) com as migrations.
   1. Reembolso bloqueia a entrega: com a entrada estornada, estornada em parte, contestada ou num estado não reconhecido depois de aprovada,
      ou com o projeto pausado, NADA da entrega avança nem vai ao ar, inclusive pelas ações do DONO (publicar a prévia, pôr no ar).
   2. A ordem nova: o restante abre com a prévia final APROVADA (pronto para publicar) e o site só vai ao ar com o restante pago e limpo.
   3. (c) o estorno parcial não deixa a entrada "paga"; (d) estado não reconhecido depois da aprovação vira contestação (pausa); (e) o banco
      devolve o ALERTA (só o código do pedido e o tipo do evento) para o servidor avisar o dono na hora.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, iniciarRestante, aprovarRestante, codigoDe, versaoDe, PREVIA, SITE } from './_previa.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const base = c => ({ conversa_id: c.conversa_id, visitante_id: c.visitante_id });
const agora = () => new Date().toISOString();

/* a tentativa que pagou a parcela (a do gateway_ref) */
const tentativaDe = (c, parcela = 'sinal') => um(`select t.id, t.provedor_order_id as order, t.valor from app.tentativas_pagamento t
  join app.pagamentos pg on pg.id = t.pagamento_id where pg.proposta_id = $1 and pg.parcela = $2 and t.provedor_order_id = pg.gateway_ref`, [c.proposta, parcela]);
/* o retrato do Mercado Pago para o que aconteceu DEPOIS da aprovação */
const RUINS = Object.freeze({
  estornada: ['refunded', 'refunded'],
  estornada_parcial: ['processed', 'partially_refunded'],
  contestada: ['charged_back', 'in_process'],
  desconhecido: ['processed', 'in_mediation']
});
async function aplicar(c, estado, parcela = 'sinal') {
  const t = await tentativaDe(c, parcela);
  const v = Number(t.valor).toFixed(2), [status, detalhe] = RUINS[estado];
  return rpc('pagamentos_aplicar', { provedor: 'mercadopago', origem: 'webhook', conta_esperada: '777', retrato: {
    order_id: t.order, external_reference: t.id, user_id: '777', total_amount: v, country_code: 'BRA',
    pagamento: { id: 'PAY' + t.order.slice(-6), amount: v, paid_amount: v, status, status_detail: detalhe, metodo_id: 'pix', metodo_tipo: 'bank_transfer', parcelas: null },
    estado } });
}
const pausar = c => db.query("update app.projetos set status = 'pausado' where id = (select projeto_id from app.propostas where id = $1)", [c.proposta]);
/* os cinco jeitos de a entrega ficar bloqueada */
const BLOQUEIOS = [...Object.keys(RUINS).map(e => [e, c => aplicar(c, e)]), ['projeto pausado', pausar]];

const publicar = async c => rpc('vendas_previa_publicar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), url: PREVIA, agora: agora(), versao: await versaoDe(db, c), prazo: {} });
const noAr = async c => rpc('vendas_no_ar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), url: SITE, agora: agora(), versao: await versaoDe(db, c) });
const passo = async c => (await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo;
/* a entrega aprovada com o restante PAGO (a ordem nova: o restante abre na aprovação) */
async function aprovadaComRestantePago() {
  const c = await entregaEm(db, 'aprovada');
  const r = await aprovarRestante(db, await iniciarRestante(db, c));
  assert.equal(r.aplicado, 'aprovada', 'o restante foi pago');
  return c;
}

/* ---------- (a) o bloqueio, inclusive para o dono ---------- */
test('(a) controle: sem estorno, o dono publica a prévia normalmente', async () => {
  const c = await entregaEm(db, 'producao');
  assert.deepEqual(await publicar(c), { ok: true });
});

for (const [nome, bloquear] of BLOQUEIOS) {
  test(`(a) ${nome}: o dono NÃO publica a prévia (55000) e a entrega não anda`, async () => {
    const c = await entregaEm(db, 'producao');
    await bloquear(c);
    assert.equal((await erroDe(publicar(c))).codigo, '55000');
    assert.equal(await passo(c), 'producao');
  });

  test(`(a) ${nome} depois do restante pago: o dono NÃO põe no ar (55000) e a entrega fica aprovada`, async () => {
    const c = await aprovadaComRestantePago();
    await bloquear(c);
    assert.equal((await erroDe(noAr(c))).codigo, '55000');
    assert.equal(await passo(c), 'aprovada');
  });
}

test('(a) projeto pausado: o cliente também não anda (aprovar a prévia dá 55000)', async () => {
  const c = await entregaEm(db, 'previa');
  await pausar(c);
  const r = await erroDe(rpc('vendas_previa_aprovar', { ...base(c), agora: agora(), versao: await versaoDe(db, c), prazo: {} }));
  assert.equal(r.codigo, '55000');
  assert.equal(await passo(c), 'previa');
});

test('(a) bloqueada, o dono ainda ENCERRA o pedido (o caminho da devolução)', async () => {
  const c = await entregaEm(db, 'producao');
  await aplicar(c, 'estornada');
  assert.deepEqual(await rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), motivo: 'desistencia' }), { ok: true });
  assert.equal(await passo(c), 'encerrada');
});

test('(a) a leitura do dono diz que a entrega está bloqueada e se o restante está pago (o painel explica antes de tentar)', async () => {
  const c = await aprovadaComRestantePago();
  const info = () => codigoDe(db, c).then(codigo => rpc('vendas_entrega_info', { org_slug: 'beyon-zero', codigo }));
  assert.deepEqual([(await info()).bloqueada, (await info()).restante_pago], [false, true]);
  await aplicar(c, 'contestada');
  assert.equal((await info()).bloqueada, true);
});

/* ---------- (b) a ordem nova: restante na aprovação, ar só com ele pago ---------- */
test('(b) o restante só abre com a prévia final aprovada: em produção, prévia e ajustes, 55000; aprovada, cobra', async () => {
  for (const p of ['producao', 'previa', 'ajustes']) {
    const c = await entregaEm(db, p);
    assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'pix', provedor: 'mercadopago' }))).codigo, '55000', p);
  }
  const c = await entregaEm(db, 'aprovada');
  const t = await rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'pix', provedor: 'mercadopago' });
  assert.equal(t.ativa, false); assert.ok(t.tentativa_id);
  assert.equal((await rpc('pagamentos_estado', base(c))).parcela, 'saldo', 'aprovada: o estado olha o restante');
});

test('(b) o restante pago com a prévia aprovada: a entrega espera o "no ar" do dono, sem erro na auditoria', async () => {
  const c = await aprovadaComRestantePago();
  assert.equal(await passo(c), 'aprovada');
  assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa_id])).etapa, 'em_producao');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'restante_pago'", [c.conversa_id])).n, 1);
  assert.equal((await um(`select count(*)::int n from app.pagamentos_auditoria a join app.pagamentos pg on pg.id = a.pagamento_id
    where pg.proposta_id = $1 and a.evento = 'project.error'`, [c.proposta])).n, 0, 'restante pago antes do ar é o caminho normal');
});

test('(b) pôr no ar SEM o restante pago é recusado (nem com o Pix gerado); a entrega fica aprovada', async () => {
  const c = await entregaEm(db, 'aprovada');
  assert.deepEqual(await noAr(c), { ok: false, motivo: 'sem_restante' });
  await iniciarRestante(db, c);
  assert.deepEqual(await noAr(c), { ok: false, motivo: 'sem_restante' }, 'o Pix gerado não é o Pix pago');
  assert.equal(await passo(c), 'aprovada');
});

test('(b) o restante estornado depois de pago: não vai ao ar', async () => {
  const c = await aprovadaComRestantePago();
  await aplicar(c, 'estornada', 'saldo');
  assert.notDeepEqual(await noAr(c).catch(e => ({ codigo: e.codigo })), { ok: true });
  assert.equal(await passo(c), 'aprovada');
});

test('(b) com o restante pago, o dono põe no ar: o pedido conclui e o aviso "no ar" fica para o dono mandar', async () => {
  const c = await aprovadaComRestantePago();
  assert.deepEqual(await noAr(c), { ok: true });
  const e = await um('select passo, site_url, no_ar_em, concluida_em, aviso_no_ar_desde from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.equal(e.passo, 'concluida'); assert.equal(e.site_url, SITE); assert.ok(e.no_ar_em); assert.ok(e.concluida_em); assert.ok(e.aviso_no_ar_desde);
  assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa_id])).etapa, 'encerrada');
  assert.equal((await um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta])).status, 'entregue');
  const codigo = await codigoDe(db, c);
  const avisos = (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(a => a.codigo === codigo);
  assert.deepEqual(avisos.map(a => a.momento), ['no_ar'], 'o aviso "seu site está no ar" na fila do dono');
});

/* ---------- (c) o estorno parcial ---------- */
test('(c) estorno parcial da entrada: a entrada deixa de contar como paga e o restante não abre', async () => {
  const c = await entregaEm(db, 'aprovada');
  await aplicar(c, 'estornada_parcial');
  assert.equal((await um('select privado.sinal_pago($1) as ok', [c.proposta])).ok, false);
  assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'pix', provedor: 'mercadopago' }))).codigo, '55000');
});

/* ---------- (d) estado não reconhecido depois da aprovação ---------- */
test('(d) estado não reconhecido DEPOIS da aprovação vira contestação: pagamento contestado, projeto pausado, trilha', async () => {
  const c = await entregaEm(db, 'producao');
  const r = await aplicar(c, 'desconhecido');
  assert.equal(r.aplicado, 'contestada');
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'sinal'", [c.proposta])).status, 'contestado');
  assert.equal((await tentativaDe(c)).id && (await um('select status from app.tentativas_pagamento where id = $1', [(await tentativaDe(c)).id])).status, 'contestada');
  assert.equal((await um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta])).status, 'pausado');
  const ev = (await db.query(`select evento from app.pagamentos_auditoria a join app.pagamentos pg on pg.id = a.pagamento_id where pg.proposta_id = $1`, [c.proposta])).rows.map(x => x.evento);
  assert.ok(ev.includes('payment.unknown_status') && ev.includes('payment.chargeback') && ev.includes('project.paused'), ev.join(','));
});

test('(d) ANTES da aprovação o estado não reconhecido continua sem mudar nada (nunca vira pago nem contestado)', async () => {
  const c = await entregaEm(db, 'aprovada');
  const { t, order } = await iniciarRestante(db, c);
  const r = await aprovarRestante(db, { t, order }, 'desconhecido');
  assert.equal(r.sem_mudanca, true);
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'saldo'", [c.proposta])).status, 'pendente');
});

/* ---------- (e) o alerta para o aviso na hora ---------- */
test('(e) estorno, estorno parcial, contestação e estado desconhecido devolvem o ALERTA: só o código do pedido, o evento e a parcela', async () => {
  const esperado = { estornada: 'estorno', estornada_parcial: 'estorno_parcial', contestada: 'contestacao', desconhecido: 'contestacao' };
  for (const [estado, evento] of Object.entries(esperado)) {
    const c = await entregaEm(db, 'producao');
    const r = await aplicar(c, estado);
    assert.deepEqual(r.alerta, { codigo: await codigoDe(db, c), evento, parcela: 'entrada' }, estado);
    const de_novo = await aplicar(c, estado);
    assert.equal(de_novo.alerta, undefined, estado + ': o mesmo aviso repetido não alerta de novo');
  }
});

test('(e) o restante pago devolve o alerta "restante_pago" (o dono põe no ar); a entrada paga não alerta', async () => {
  const c = await entregaEm(db, 'aprovada');
  assert.equal(c.aplicado.aplicado, 'aprovada'); assert.equal(c.aplicado.alerta, undefined, 'a entrada paga não alerta');
  const r = await aprovarRestante(db, await iniciarRestante(db, c));
  assert.deepEqual(r.alerta, { codigo: await codigoDe(db, c), evento: 'restante_pago', parcela: 'restante' });
});

/* ---------- acréscimos da revisão técnica ---------- */
test('revisão: o restante pago por uma order que ainda não estava vinculada (a resposta da criação se perdeu) também devolve o alerta', async () => {
  const c = await entregaEm(db, 'aprovada');
  const t = await rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'pix', provedor: 'mercadopago' });
  const order = 'ORDSOLTA' + t.tentativa_id.replace(/-/g, '').slice(0, 16).toUpperCase();
  const r = await aprovarRestante(db, { t, order });   /* (sem pagamentos_vincular: a base acha pela referência e vincula) */
  assert.equal(r.aplicado, 'aprovada');
  assert.deepEqual(r.alerta, { codigo: await codigoDe(db, c), evento: 'restante_pago', parcela: 'restante' });
});

test('revisão: o restante pago de uma entrega ANTIGA (no ar) conclui sozinho e não pede "ponha no ar" ao dono', async () => {
  const c = await entregaEm(db, 'no_ar');
  const r = await aprovarRestante(db, await iniciarRestante(db, c));
  assert.equal(r.aplicado, 'aprovada'); assert.equal(r.alerta, undefined);
  assert.equal(await passo(c), 'concluida');
});

test('revisão: encerrar com o restante PAGO é recusado (motivo restante_pago); estornado o restante, encerra', async () => {
  const c = await aprovadaComRestantePago();
  const encerrar = async () => rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), motivo: 'atraso' });
  assert.deepEqual(await encerrar(), { ok: false, motivo: 'restante_pago' });
  assert.equal(await passo(c), 'aprovada');
  await aplicar(c, 'estornada', 'saldo');
  assert.deepEqual(await encerrar(), { ok: true });
});

test('revisão: o pedido concluído pela ordem nova aceita o link de retomada do aviso "no ar" (criar e usar); o encerrado por desistência, não', async () => {
  const c = await aprovadaComRestantePago();
  assert.deepEqual(await noAr(c), { ok: true });
  const hash = h => h.repeat(64);
  const r = await rpc('vendas_criar_retomada', { org_slug: 'beyon-zero', conversa_id: c.conversa_id, codigo_hash: hash('a'), dias: 7 });
  assert.ok(r.expira_em);
  const novo = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query('insert into auth.users (id) values ($1)', [novo]);
  assert.deepEqual(await rpc('vendas_usar_retomada', { org_slug: 'beyon-zero', codigo_hash: hash('a'), visitante_id: novo }), { ok: true, conversa_id: c.conversa_id });
  const d = await entregaEm(db, 'producao');
  assert.deepEqual(await rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, d), motivo: 'desistencia' }), { ok: true });
  assert.equal((await erroDe(rpc('vendas_criar_retomada', { org_slug: 'beyon-zero', conversa_id: d.conversa_id, codigo_hash: hash('b'), dias: 7 }))).codigo, '55000');
});
