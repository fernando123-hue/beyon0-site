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
import { entregaEm, forcarEntrega, iniciarRestante, aprovarRestante, codigoDe, versaoDe, PREVIA, SITE } from './_previa.mjs';

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

/* ---------- revisão técnica B: o pedido concluído continua na lista do dono até a passagem do site para a conta do cliente ---------- */
const itemDaLista = async c => { const cod = await codigoDe(db, c); return (await rpc('vendas_entregas_lista', { org_slug: 'beyon-zero' })).itens.find(i => i.codigo === cod); };

test('revisão B: depois do "no ar" o pedido concluído CONTINUA na lista do dono (falta a passagem para a conta do cliente, que é manual)', async () => {
  const c = await aprovadaComRestantePago();
  assert.deepEqual(await noAr(c), { ok: true });
  const it = await itemDaLista(c);
  assert.ok(it, 'o item não pode sumir do painel antes da passagem');
  assert.deepEqual([it.passo, it.bloqueada, it.restante_pago], ['concluida', false, true]);
  assert.ok(it.concluida_em && it.no_ar_em);
});

test('revisão B: uma contestação entre o "no ar" e a passagem aparece na lista (bloqueada), não só no e-mail', async () => {
  const c = await aprovadaComRestantePago();
  await noAr(c);
  await aplicar(c, 'contestada');
  const it = await itemDaLista(c);
  assert.ok(it, 'o item bloqueado continua na lista');
  assert.deepEqual([it.passo, it.bloqueada], ['concluida', true]);
});

test('revisão B: a lista não cresce para sempre: concluída há mais de 30 dias e a encerrada saem', async () => {
  const velha = await aprovadaComRestantePago();
  await noAr(velha);
  await forcarEntrega(db, velha, { concluida_em: new Date(Date.now() - 31 * 864e5).toISOString() });
  assert.equal(await itemDaLista(velha), undefined, 'concluída há 31 dias: fora');
  const nova = await aprovadaComRestantePago();
  await noAr(nova);
  await forcarEntrega(db, nova, { concluida_em: new Date(Date.now() - 29 * 864e5).toISOString() });
  assert.ok(await itemDaLista(nova), 'concluída há 29 dias: ainda à vista');
  const enc = await entregaEm(db, 'producao');
  await rpc('vendas_encerrar', { org_slug: 'beyon-zero', codigo: await codigoDe(db, enc), motivo: 'desistencia' });
  assert.equal(await itemDaLista(enc), undefined, 'encerrada: fora');
});

/* ---------- revisão técnica E: o restante pago numa entrega JÁ bloqueada avisa o dono (e deixa rastro para a rotina, se a resposta se perder) ---------- */
test('revisão E: o restante pago (Pix emitido antes do bloqueio) com a entrega bloqueada devolve o alerta "restante_pago_bloqueada", UMA vez, e deixa o rastro da rotina diária', async () => {
  const c = await entregaEm(db, 'aprovada');
  const pix = await iniciarRestante(db, c);   /* o Pix do restante já existe quando a entrada é estornada */
  assert.equal((await aplicar(c, 'estornada')).aplicado, 'estornada');
  const r = await aprovarRestante(db, pix);
  assert.equal(r.aplicado, 'aprovada');
  assert.deepEqual(r.alerta, { codigo: await codigoDe(db, c), evento: 'restante_pago_bloqueada', parcela: 'restante' });
  assert.equal(await passo(c), 'aprovada', 'nada avançou');
  const rastro = () => um(`select count(*)::int n from app.pagamentos_auditoria a join app.pagamentos pg on pg.id = a.pagamento_id
    where pg.proposta_id = $1 and pg.parcela = 'saldo' and a.evento = 'project.error'`, [c.proposta]);
  assert.equal((await rastro()).n, 1, 'o rastro que a rotina diária (pagamentos_atencao) conta, para o aviso não depender só da resposta');
  assert.ok((await rpc('pagamentos_atencao', { horas: 1 })).eventos['project.error'] >= 1);
  const de_novo = await aprovarRestante(db, pix);
  assert.equal(de_novo.alerta, undefined, 'o aviso repetido do provedor não alerta de novo');
  assert.equal((await rastro()).n, 1, 'nem repete o rastro');
});

test('revisão E: o restante pago com a entrega bloqueada por contestação ou projeto pausado também alerta; sem bloqueio, continua "restante_pago"', async () => {
  for (const [nome, bloquear] of [['contestada', c => aplicar(c, 'contestada')], ['pausado', pausar]]) {
    const c = await entregaEm(db, 'aprovada');
    const pix = await iniciarRestante(db, c);
    await bloquear(c);
    assert.equal((await aprovarRestante(db, pix)).alerta?.evento, 'restante_pago_bloqueada', nome);
  }
  const livre = await entregaEm(db, 'aprovada');
  assert.equal((await aprovarRestante(db, await iniciarRestante(db, livre))).alerta.evento, 'restante_pago');
});

/* ---------- revisão técnica F: a tela do cliente precisa saber que o restante foi estornado em parte (ou que a entrega está bloqueada), sem ver código nenhum ---------- */
test('revisão F: a leitura do cliente (vendas_estado) diz se cada parcela está quitada e se a entrega está bloqueada: o estorno parcial do restante e o bloqueio aparecem', async () => {
  const c = await aprovadaComRestantePago();
  const saldo = async () => { const e = await rpc('vendas_estado', base(c)); return [e.pagamentos.find(p => p.parcela === 'saldo'), e.entrega]; };
  let [pg, entrega] = await saldo();
  assert.deepEqual([pg.status, pg.quitada, entrega.bloqueada], ['pago', true, false], 'restante pago e limpo');
  await aplicar(c, 'estornada_parcial', 'saldo');
  [pg, entrega] = await saldo();
  assert.equal(pg.status, 'pago', 'o registro continua pago (o estorno foi só de parte)');
  assert.deepEqual([pg.quitada, entrega.bloqueada], [false, true], 'estorno parcial do restante: não quitado e bloqueada');
  const d = await aprovadaComRestantePago();
  await aplicar(d, 'estornada');   /* a entrada estornada: o restante pago está limpo, mas a entrega está bloqueada */
  const e = await rpc('vendas_estado', base(d));
  assert.deepEqual([e.pagamentos.find(p => p.parcela === 'saldo').quitada, e.entrega.bloqueada], [true, true]);
});

/* ---------- revisão técnica H: o que faltava testar ---------- */
/* o retrato do sinal com o estado pedido (a contestação revertida não é um jeito de bloquear sozinha: só faz sentido depois da contestação) */
const retratoDoSinal = async (c, estado) => { const t = await tentativaDe(c); const v = Number(t.valor).toFixed(2); return { order_id: t.order, external_reference: t.id, user_id: '777', total_amount: v, country_code: 'BRA',
  pagamento: { id: 'PAY' + t.order.slice(-6), amount: v, paid_amount: v, status: 'processed', status_detail: 'accredited', metodo_id: 'pix', metodo_tipo: 'bank_transfer', parcelas: null }, estado }; };
test('revisão H: a contestação REVERTIDA a favor da Beyon devolve o pagamento a "pago", mas o projeto segue pausado e a entrega CONTINUA bloqueada (falha fechada, até uma pessoa reativar)', async () => {
  const c = await entregaEm(db, 'producao');
  assert.equal((await aplicar(c, 'contestada')).aplicado, 'contestada');
  const r = await rpc('pagamentos_aplicar', { provedor: 'mercadopago', origem: 'webhook', conta_esperada: '777', retrato: await retratoDoSinal(c, 'contestada_revertida') });
  assert.equal(r.aplicado, 'contestada_revertida');
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'sinal'", [c.proposta])).status, 'pago', 'o pagamento voltou a pago');
  assert.equal((await um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta])).status, 'pausado', 'o projeto segue pausado');
  assert.equal((await erroDe(publicar(c))).codigo, '55000', 'o dono não publica a prévia');
  assert.equal(await passo(c), 'producao');
  const info = await rpc('vendas_entrega_info', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c) });
  assert.equal(info.bloqueada, true);
  assert.equal((await rpc('vendas_estado', base(c))).entrega.bloqueada, true, 'a tela do cliente também sabe');
  const d = await aprovadaComRestantePago();
  await aplicar(d, 'contestada');
  await rpc('pagamentos_aplicar', { provedor: 'mercadopago', origem: 'webhook', conta_esperada: '777', retrato: await retratoDoSinal(d, 'contestada_revertida') });
  assert.equal((await erroDe(noAr(d))).codigo, '55000', 'depois do restante pago, o "no ar" também segue recusado');
  assert.equal(await passo(d), 'aprovada');
});

test('revisão H: estorno, estorno parcial ou contestação do RESTANTE (já pago) também alertam o dono (parcela "restante") e bloqueiam a entrega', async () => {
  const esperado = { estornada: 'estorno', estornada_parcial: 'estorno_parcial', contestada: 'contestacao', desconhecido: 'contestacao' };
  for (const [estado, evento] of Object.entries(esperado)) {
    const c = await aprovadaComRestantePago();
    const r = await aplicar(c, estado, 'saldo');
    assert.deepEqual(r.alerta, { codigo: await codigoDe(db, c), evento, parcela: 'restante' }, estado);
    assert.equal((await aplicar(c, estado, 'saldo')).alerta, undefined, estado + ': repetido, não alerta de novo');
    const info = await rpc('vendas_entrega_info', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c) });
    assert.deepEqual([info.bloqueada, info.restante_pago], [true, false], estado + ': bloqueada e o restante não conta como pago');
    assert.equal((await erroDe(noAr(c))).codigo, '55000', estado + ': o dono não põe no ar');
    assert.equal(await passo(c), 'aprovada', estado);
  }
});

test('revisão H: a fila de avisos não oferece o aviso (prévia pronta, site no ar) de uma entrega bloqueada', async () => {
  const momentosDe = async c => { const cod = await codigoDe(db, c); return (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(a => a.codigo === cod).map(a => a.momento); };
  const p = await entregaEm(db, 'producao');
  assert.deepEqual(await publicar(p), { ok: true });
  assert.deepEqual(await momentosDe(p), ['previa'], 'controle: sem bloqueio, o aviso da prévia está na fila');
  await aplicar(p, 'estornada');
  assert.deepEqual(await momentosDe(p), [], 'bloqueada: sem aviso na fila');
  const n = await aprovadaComRestantePago();
  assert.deepEqual(await noAr(n), { ok: true });
  assert.deepEqual(await momentosDe(n), ['no_ar']);
  await aplicar(n, 'contestada');
  assert.deepEqual(await momentosDe(n), [], 'bloqueada depois do "no ar": sem o aviso "seu site está no ar"');
});

test('revisão H: as funções novas desta migration nascem fechadas: as de dentro (privado e a base) sem execute para ninguém; as do servidor só para service_role', async () => {
  const pode = async (fn, papel) => (await um('select has_function_privilege($1, $2::regprocedure, $3) as ok', [papel, fn, 'execute'])).ok;
  for (const fn of ['privado.parcela_quitada(uuid,text)', 'privado.entrega_bloqueada(app.entregas)', 'privado.entrega_do_dono_travar(jsonb,text[])',
                    'privado.conversa_retomavel(app.conversas)', 'app.pagamentos_aplicar_base(jsonb)']) {
    for (const papel of ['anon', 'authenticated', 'service_role']) assert.equal(await pode(fn, papel), false, fn + ' não é de ' + papel);
  }
  for (const fn of ['app.pagamentos_aplicar(jsonb)', 'app.vendas_estado(jsonb)', 'app.vendas_no_ar(jsonb)', 'app.vendas_entregas_lista(jsonb)']) {
    assert.deepEqual([await pode(fn, 'anon'), await pode(fn, 'authenticated'), await pode(fn, 'service_role')], [false, false, true], fn);
  }
});

test('revisão H: o restante estornado, em parte ou contestado bloqueia a entrega MESMO quando o projeto não está numa etapa que o estorno pausa (a regra do restante vale sozinha)', async () => {
  for (const estado of ['estornada', 'estornada_parcial', 'contestada']) {
    const c = await aprovadaComRestantePago();
    await db.query("update app.projetos set status = 'entregue', entregue_em = current_date where id = (select projeto_id from app.propostas where id = $1)", [c.proposta]);   /* (fora de pronto, em produção e em revisão: o estorno não pausa) */
    await aplicar(c, estado, 'saldo');
    assert.equal((await um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta])).status, 'entregue', estado + ': o projeto não foi pausado');
    const info = await rpc('vendas_entrega_info', { org_slug: 'beyon-zero', codigo: await codigoDe(db, c) });
    assert.equal(info.bloqueada, true, estado + ': bloqueada só pela regra do restante');
    assert.equal((await erroDe(noAr(c))).codigo, '55000', estado);
  }
});

/* ---------- revisão 2, itens 2 e 4: o restante pago NÃO conclui uma entrega bloqueada (nem pelo gatilho nem pela leitura), com UM rastro só ---------- */
const rastrosDoRestante = c => um(`select count(*)::int n from app.pagamentos_auditoria a join app.pagamentos pg on pg.id = a.pagamento_id
  where pg.proposta_id = $1 and pg.parcela = 'saldo' and a.evento = 'project.error'`, [c.proposta]);

test('revisão 2/2 e 2/4: o restante pago (Pix emitido antes) com a entrega ANTIGA no ar e a entrada estornada NÃO conclui o pedido e deixa UM rastro, não dois', async () => {
  for (const p of ['no_ar', 'suspensa']) {
    const c = await entregaEm(db, p);
    const pix = await iniciarRestante(db, c);
    await aplicar(c, 'estornada');
    const r = await aprovarRestante(db, pix);
    assert.equal(r.aplicado, 'aprovada', p);
    assert.equal(await passo(c), p, p + ': não concluiu');
    assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa_id])).etapa, 'em_producao', p + ': a conversa segue aberta');
    assert.equal((await rastrosDoRestante(c)).n, 1, p + ': um rastro só para a rotina diária (o gatilho não grava o dele além do novo)');
    assert.equal(r.alerta?.evento, 'restante_pago_bloqueada', p);
  }
});

test('revisão 2/2: a leitura do cliente (concluir_pendente) não conclui a entrega no ar com o restante estornado em parte, e não grava rastro a cada leitura', async () => {
  const c = await entregaEm(db, 'aprovada');
  assert.equal((await aprovarRestante(db, await iniciarRestante(db, c))).aplicado, 'aprovada');
  await forcarEntrega(db, c, { passo: 'no_ar', site_url: SITE, no_ar_em: agora() });   /* (o restante pago e o site no ar, a conclusão ainda por fazer: o caso que a leitura conserta) */
  await aplicar(c, 'estornada_parcial', 'saldo');
  const antes = (await rastrosDoRestante(c)).n;
  for (let i = 0; i < 3; i++) await rpc('vendas_estado', base(c));
  assert.equal(await passo(c), 'no_ar', 'a leitura não concluiu');
  assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa_id])).etapa, 'em_producao');
  assert.equal((await rastrosDoRestante(c)).n, antes, 'ler não grava rastro');
});

test('revisão 2/2: controle — com tudo limpo, o restante pago com a entrega no ar continua concluindo, sem rastro', async () => {
  const c = await entregaEm(db, 'no_ar');
  assert.equal((await aprovarRestante(db, await iniciarRestante(db, c))).aplicado, 'aprovada');
  assert.equal(await passo(c), 'concluida');
  assert.equal((await rastrosDoRestante(c)).n, 0);
});

test('revisão 2/5: se a montagem do alerta falhar (aqui: a tabela de pedidos some por um instante), o pagamento NÃO cai e o rastro da rotina diária já está gravado', async () => {
  const c = await entregaEm(db, 'aprovada');
  const pix = await iniciarRestante(db, c);
  await aplicar(c, 'estornada');
  await db.exec('alter table app.pedidos rename to pedidos_fora');
  let r;
  try { r = await aprovarRestante(db, pix); } finally { await db.exec('alter table app.pedidos_fora rename to pedidos'); }
  assert.equal(r.aplicado, 'aprovada', 'o pagamento foi aplicado mesmo assim');
  assert.equal(r.alerta, undefined, 'sem o alerta (a montagem falhou)');
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'saldo'", [c.proposta])).status, 'pago');
  assert.equal((await rastrosDoRestante(c)).n, 1, 'o rastro foi gravado ANTES do trecho que pode falhar: a rotina diária conta e o dono vê no painel');
});

test('revisão 2/3: com mais de 100 itens, a lista do dono mostra os pedidos em aberto primeiro (os concluídos que esperam a passagem ficam por último e é deles que o corte tira)', async () => {
  const db2 = await novoBanco(); const rpc2 = rpcDe(db2); await prepararOrg(db2);
  const concluidos = [];
  for (let i = 0; i < 100; i++) {
    const c = await entregaEm(db2, 'producao');
    await forcarEntrega(db2, c, { passo: 'concluida', site_url: SITE, no_ar_em: agora(), concluida_em: agora() });
    concluidos.push(c);
  }
  const ativa = await entregaEm(db2, 'producao');   /* a mais NOVA de todas: com a ordem por criação ela era a 101ª e caía fora */
  const codigoAtiva = await codigoDe(db2, ativa);
  const lista = await rpc2('vendas_entregas_lista', { org_slug: 'beyon-zero' });
  assert.equal(lista.itens.length, 100, 'o limite de 100 continua');
  assert.ok(lista.itens.some(i => i.codigo === codigoAtiva), 'o pedido em aberto, mesmo o mais novo, está na lista');
  assert.equal(lista.itens.filter(i => i.passo === 'concluida').length, 99, 'o corte tirou um concluído');
  const ordem = lista.itens.map(i => i.criada_em);
  assert.deepEqual(ordem, [...ordem].sort(), 'a lista sai ordenada por criação');
});

/* ---------- C (20/11, dono): sem botão no painel. O que destrava sozinho e como destravar à mão ---------- */
const infoDe = c => codigoDe(db, c).then(codigo => rpc('vendas_entrega_info', { org_slug: 'beyon-zero', codigo }));
const reverter = async c => rpc('pagamentos_aplicar', { provedor: 'mercadopago', origem: 'webhook', conta_esperada: '777', retrato: await retratoDoSinal(c, 'contestada_revertida') });

test('C: a contestação REVERTIDA destrava sozinha quando não há projeto a reativar (projeto_id nulo); com projeto, segue bloqueada até a reativação manual (falha fechada)', async () => {
  const semProjeto = await entregaEm(db, 'producao');
  /* (a proposta enviada não solta o projeto; o caso "sem projeto" é o do pedido que nunca teve um: aqui se desliga o gatilho só para montá-lo) */
  await db.exec('alter table app.propostas disable trigger proposta_imutavel');
  try { await db.query('update app.propostas set projeto_id = null where id = $1', [semProjeto.proposta]); } finally { await db.exec('alter table app.propostas enable trigger proposta_imutavel'); }
  await aplicar(semProjeto, 'contestada');
  assert.equal((await infoDe(semProjeto)).bloqueada, true, 'contestada: bloqueada (a tentativa não está quitada)');
  await reverter(semProjeto);
  assert.equal((await infoDe(semProjeto)).bloqueada, false, 'revertida e sem projeto: destravou sozinha');
  assert.deepEqual(await publicar(semProjeto), { ok: true }, 'e o dono publica a prévia');
  const comProjeto = await entregaEm(db, 'producao');
  await aplicar(comProjeto, 'contestada');
  await reverter(comProjeto);
  assert.equal((await infoDe(comProjeto)).bloqueada, true, 'com projeto: o pausado só volta pela mão');
});

test('C: como destravar À MÃO (o dono avisa; o agente roda um programa pequeno): contestação = reaplicar a reversão e reativar o projeto; estorno parcial = a tentativa que pagou vai a "contestada_revertida" (a única saída permitida) e o projeto volta a "em_producao"', async () => {
  const reativar = c => db.query("update app.projetos set status = 'em_producao' where id = (select projeto_id from app.propostas where id = $1)", [c.proposta]);
  const parcial = await entregaEm(db, 'producao');
  await aplicar(parcial, 'estornada_parcial');
  assert.equal((await infoDe(parcial)).bloqueada, true);
  await db.query("update app.tentativas_pagamento set status = 'contestada_revertida' where id = $1", [(await tentativaDe(parcial)).id]);
  assert.equal((await infoDe(parcial)).bloqueada, true, 'só a tentativa não basta: o projeto ainda está pausado');
  await reativar(parcial);
  assert.equal((await infoDe(parcial)).bloqueada, false, 'estorno parcial: destravada à mão');
  assert.deepEqual(await publicar(parcial), { ok: true });
  const contestada = await entregaEm(db, 'producao');
  await aplicar(contestada, 'contestada');
  await reverter(contestada); await reativar(contestada);
  assert.equal((await infoDe(contestada)).bloqueada, false, 'contestação revertida + projeto reativado: destravada');
  assert.deepEqual(await publicar(contestada), { ok: true });
  const estornada = await entregaEm(db, 'producao');
  await aplicar(estornada, 'estornada');
  assert.equal((await infoDe(estornada)).bloqueada, true, 'estorno INTEIRO não destrava: o dinheiro voltou e o pagamento fica "estornado"');
});
