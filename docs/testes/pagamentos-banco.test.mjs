/* PAGAMENTOS no banco (Postgres real em PGlite, com as migrations): a última trava do domínio financeiro.
   app.pagamentos_aplicar é a única porta para "pago"; aqui se prova que nenhuma divergência passa,
   que tudo é idempotente, que regressão e duplicidade não liberam nada, que estorno e contestação
   pausam o projeto, e que a auditoria não se reescreve.  npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe } from './_banco.mjs';

const A = 'aaaaaaaa-0000-4000-8000-0000000000a1';    // dono da Beyon Zero
const X = 'cccccccc-0000-4000-8000-0000000000c3';    // dono de OUTRA organização
const V1 = 'eeeeeeee-0000-4000-8000-0000000000e1', V2 = 'ffffffff-0000-4000-8000-0000000000f2';
const ORG = '99999999-0000-4000-8000-000000000099', ORG2 = '88888888-0000-4000-8000-000000000088';
const REGRAS = 'dddddddd-0000-4000-8000-0000000000d0';
let db, seq = 0;
const rpc = (nome, p) => como(db, 'service_role', q => q(`select app.${nome}($1::jsonb) as r`, [JSON.stringify(p)])).then(x => x.rows[0].r);
const um = async (sql, args) => (await db.query(sql, args)).rows[0];

before(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@bz.com'), ('${X}', 'x@outra.com'), ('${V1}', null), ('${V2}', null);
    insert into app.organizacoes (id, slug, nome) values ('${ORG}', 'beyon-zero', 'Beyon Zero'), ('${ORG2}', 'outra', 'Outra');
    insert into app.membros (org_id, user_id, papel) values ('${ORG}', '${A}', 'dono'), ('${ORG2}', '${X}', 'dono');
    insert into app.regras_comerciais (id, org_id, versao, status, regras, aprovada_em) values ('${REGRAS}', '${ORG}', 1, 'ativa', '{"moeda":"BRL"}', now());
  `);
});

/* uma conversa até a cobrança (proposta aceita de R$ 3.000, sinal de R$ 1.500) */
async function ateCobranca(v = V1) {
  const conversa = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  const b = { conversa_id: conversa, visitante_id: v };
  await rpc('vendas_registrar_turno', { ...b, mensagem_visitante: 'oi', mensagem_agente: 'olá', briefing: { projeto: { formato: 'institucional' } }, confianca: 0.8 });
  await rpc('vendas_registrar_estimativa', { ...b, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3000, sinal: 1500, prazo_dias: 10 });
  await rpc('vendas_informar_contato', { ...b, nome: 'Ana', email: 'ana@x.com', aceite: true });
  const g = await rpc('vendas_iniciar_geracao', b);
  for (const d of g.direcoes) await rpc('vendas_concluir_direcao', { direcao_id: d.id, conteudo: { secoes: [] }, modelo: 't' });
  await rpc('vendas_escolher', { ...b, direcao_id: g.direcoes[0].id });
  const pr = (await rpc('vendas_apresentar_escopo', { ...b, titulo: 'Site', escopo: 'Escopo' })).proposta_id;
  await rpc('vendas_confirmar_escopo', { ...b, proposta_id: pr, confirmo: true });
  return { conversa, b, proposta: pr };
}
async function tentativa(c, metodo = 'pix', vincular = true) {
  const t = await rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo, provedor: 'mercadopago' });
  const order = 'ORD' + String(++seq).padStart(4, '0') + t.tentativa_id.replace(/-/g, '').slice(0, 20).toUpperCase();
  if (vincular) await rpc('pagamentos_vincular', { tentativa_id: t.tentativa_id, provedor_order_id: order });
  return { ...t, order };
}
const retrato = (t, mudar = r => r) => {
  const pix = t.metodo === 'pix';
  const r = { order_id: t.order, external_reference: t.tentativa_id, user_id: '777', total_amount: '1500.00', country_code: 'BRA',
    pagamento: { id: 'PAY' + seq, amount: '1500.00', paid_amount: '1500.00', status: 'processed', status_detail: 'accredited',
      metodo_id: pix ? 'pix' : 'visa', metodo_tipo: pix ? 'bank_transfer' : 'credit_card', parcelas: pix ? null : 1 }, estado: 'aprovada' };
  return { provedor: 'mercadopago', origem: 'webhook', conta_esperada: '777', retrato: mudar(r) || r };
};
const ajustar = f => r => { f(r); return r; };
const statusPag = async t => (await um('select status from app.pagamentos where id = $1', [t.pagamento_id])).status;
const statusTent = async t => (await um('select status from app.tentativas_pagamento where id = $1', [t.tentativa_id])).status;
const projetoDe = async c => um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta]);
const auditoria = async (t, evento) => (await um('select count(*)::int n from app.pagamentos_auditoria where tentativa_id = $1 and evento = $2', [t.tentativa_id, evento])).n;

test('valor e tentativa: o sinal vem da proposta; uma tentativa ativa por pagamento; outro visitante não chega', async () => {
  const c = await ateCobranca();
  const t = await tentativa(c, 'pix', false);
  assert.equal(Number(t.valor), 1500);
  assert.equal(t.external_reference, t.tentativa_id);
  assert.ok(/^bz-[0-9a-f]{32}$/.test(t.chave_idempotencia), 'chave de idempotência gerada pelo banco');
  const outra = await rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'cartao', provedor: 'mercadopago' });
  assert.equal(outra.ativa, true, 'com uma ativa, devolve a mesma');
  assert.equal(outra.tentativa_id, t.tentativa_id);
  assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { conversa_id: c.conversa, visitante_id: V2, metodo: 'pix', provedor: 'mercadopago' })))?.codigo, 'P0002');
  assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'boleto', provedor: 'mercadopago' })))?.codigo, '22023');
  assert.ok(await erroDe(db.query(`insert into app.tentativas_pagamento (org_id, pagamento_id, provedor, metodo, valor, chave_idempotencia) values ($1, $2, 'mercadopago', 'pix', 1500, 'bz-outra-chave-1234567')`, [ORG, t.pagamento_id])), 'segunda ativa barrada pelo índice único');
});

test('conferência: qualquer divergência NÃO paga (e fica registrada)', async () => {
  const c = await ateCobranca();
  const t = await tentativa(c);
  const casos = [
    ['valor total menor', ajustar(r => { r.total_amount = '150.00'; })],
    ['transação com outro valor', ajustar(r => { r.pagamento.amount = '1.00'; })],
    ['pago menos', ajustar(r => { r.pagamento.paid_amount = '1499.99'; })],
    ['pago ausente', ajustar(r => { delete r.pagamento.paid_amount; })],
    ['outra referência', ajustar(r => { r.external_reference = '00000000-0000-4000-8000-000000000000'; })],
    ['outra conta', ajustar(r => { r.user_id = '999'; })],
    ['outro país', ajustar(r => { r.country_code = 'ARG'; })],
    ['outra moeda', ajustar(r => { r.currency = 'USD'; })],
    ['outro meio', ajustar(r => { r.pagamento.metodo_id = 'visa'; r.pagamento.metodo_tipo = 'credit_card'; })],
    ['"aprovada" sem status de aprovação', ajustar(r => { r.pagamento.status = 'action_required'; r.pagamento.status_detail = 'waiting_transfer'; })]
  ];
  for (const [nome, f] of casos) {
    const r = await rpc('pagamentos_aplicar', retrato(t, f));
    assert.ok(r.recusado, nome + ' → ' + JSON.stringify(r));
  }
  assert.equal(await statusPag(t), 'pendente');
  assert.equal(await statusTent(t), 'divergente', 'divergência real: sai da fila ativa e vai para uma pessoa');
  assert.equal(await auditoria(t, 'payment.mismatch'), casos.length - 1, '("pago menos" e "pago ausente" têm o mesmo motivo: uma linha por dia)');
  await rpc('pagamentos_aplicar', retrato(t, casos[0][1]));
  assert.equal(await auditoria(t, 'payment.mismatch'), casos.length - 1, 'a mesma divergência repetida não duplica a trilha (uma por dia)');
  assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'pix', provedor: 'mercadopago' })))?.codigo, '55000', 'em verificação: não abre outra cobrança por cima');
  /* retrato incompleto (campo nulo ou malformado) não decide nada, nem divergência */
  const c2 = await ateCobranca(V2);
  const t2 = await tentativa(c2);
  for (const f of [ajustar(r => { r.total_amount = '1500.00; drop table x'; }), ajustar(r => { delete r.total_amount; }), ajustar(r => { delete r.pagamento.amount; }),
    ajustar(r => { r.pagamento = {}; }), ajustar(r => { delete r.pagamento.metodo_tipo; }), ajustar(r => { delete r.country_code; }), ajustar(r => { delete r.pagamento.status_detail; })]) {
    assert.equal((await rpc('pagamentos_aplicar', retrato(t2, f))).sem_mudanca, true);
  }
  assert.equal(await statusTent(t2), 'criada');
  assert.equal(await statusPag(t2), 'pendente');
  const semConta = retrato(t2); delete semConta.conta_esperada;
  assert.equal((await rpc('pagamentos_aplicar', semConta)).recusado, 'conta esperada não configurada', 'sem a conta esperada: nunca paga');
  assert.equal((await erroDe(rpc('pagamentos_aplicar', retrato(t, ajustar(r => { r.estado = 'pago'; })))))?.codigo, '22023', 'estado fora da lista');
  assert.equal((await erroDe(rpc('pagamentos_aplicar', retrato(t, ajustar(r => { r.order_id = "x' or 1=1"; })))))?.codigo, '22023');
  assert.deepEqual(await rpc('pagamentos_aplicar', retrato({ ...t, order: 'ORDNAOEXISTE123456', tentativa_id: '00000000-0000-4000-8000-000000000000' })), { ignorado: 'order desconhecida' });
});

test('aprovação: idempotente, libera o projeto UMA vez como pronto_para_producao, e não regride', async () => {
  const c = await ateCobranca();
  const t = await tentativa(c);
  assert.equal((await rpc('pagamentos_aplicar', retrato(t))).aplicado, 'aprovada');
  for (let i = 0; i < 3; i++) assert.equal((await rpc('pagamentos_aplicar', retrato(t))).sem_mudanca, true, 'aviso repetido');
  assert.equal(await statusPag(t), 'pago');
  assert.equal((await projetoDe(c)).status, 'pronto_para_producao');
  assert.equal((await um('select count(*)::int n from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.conversa_id = $1', [c.conversa])).n, 1);
  assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa])).etapa, 'em_producao');
  for (const [status, detalhe, estado] of [['action_required', 'waiting_transfer', 'aguardando'], ['failed', 'rejected_by_issuer', 'recusada'], ['canceled', 'canceled', 'cancelada']]) {
    const r = await rpc('pagamentos_aplicar', retrato(t, ajustar(x => { x.pagamento.status = status; x.pagamento.status_detail = detalhe; x.estado = estado; delete x.pagamento.paid_amount; })));
    assert.equal(r.ignorado, 'regressão', estado + ' depois de aprovada (aviso fora de ordem)');
  }
  assert.equal(await statusTent(t), 'aprovada');
  assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'pix', provedor: 'mercadopago' })))?.codigo, '55000', 'pago: não abre outra cobrança');
  assert.ok(await erroDe(db.query(`update app.tentativas_pagamento set status = 'recusada' where id = $1`, [t.tentativa_id])), 'aprovada não vira recusada nem direto no banco');
  assert.ok(await erroDe(db.query(`update app.pagamentos set status = 'pendente' where id = $1`, [t.pagamento_id])), 'pago não volta a pendente');
  assert.ok(await erroDe(db.query(`update app.tentativas_pagamento set valor = 1 where id = $1`, [t.tentativa_id])), 'valor da tentativa não muda');
  assert.ok(await erroDe(db.query(`update app.tentativas_pagamento set provedor_order_id = 'ORDOUTRAORDER1234' where id = $1`, [t.tentativa_id])), 'a order vinculada não muda');
});

test('pagou duas vezes (Pix cancelado aqui, mas pago lá): a 2ª vira duplicada, nada é liberado de novo, alerta para reembolso', async () => {
  const c = await ateCobranca();
  const pix = await tentativa(c, 'pix');
  assert.deepEqual(await rpc('pagamentos_encerrar_tentativa', { tentativa_id: pix.tentativa_id, status: 'cancelada', motivo: 'x' }), { sem_mudanca: true, status: 'criada' }, 'com order vinculada, só o retrato do provedor encerra');
  await rpc('pagamentos_aplicar', retrato(pix, ajustar(r => { r.estado = 'cancelada'; r.pagamento.status = 'canceled'; r.pagamento.status_detail = 'canceled'; delete r.pagamento.paid_amount; })));
  const cartao = await tentativa(c, 'cartao');
  assert.equal((await rpc('pagamentos_aplicar', retrato(cartao))).aplicado, 'aprovada');
  assert.deepEqual(await rpc('pagamentos_aplicar', retrato(pix)), { duplicada: true });
  assert.equal(await statusTent(pix), 'duplicada');
  assert.equal(await auditoria(pix, 'payment.duplicate'), 1);
  assert.equal((await um('select count(*)::int n from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.conversa_id = $1', [c.conversa])).n, 1);
  /* estornar a duplicada não mexe no pagamento nem no projeto */
  await rpc('pagamentos_aplicar', retrato(pix, ajustar(r => { r.estado = 'estornada'; r.pagamento.status = 'refunded'; r.pagamento.status_detail = 'refunded'; })));
  assert.equal(await statusTent(pix), 'estornada');
  assert.equal(await statusPag(cartao), 'pago');
  assert.equal((await projetoDe(c)).status, 'pronto_para_producao');
});

test('estorno e contestação do pagamento que liberou: o pagamento acompanha e o projeto PAUSA', async () => {
  const c1 = await ateCobranca();
  const t1 = await tentativa(c1);
  await rpc('pagamentos_aplicar', retrato(t1));
  await rpc('pagamentos_aplicar', retrato(t1, ajustar(r => { r.estado = 'estornada'; r.pagamento.status = 'refunded'; r.pagamento.status_detail = 'refunded'; })));
  assert.equal(await statusPag(t1), 'estornado');
  assert.equal((await projetoDe(c1)).status, 'pausado');
  assert.equal(await auditoria(t1, 'project.paused'), 1);
  const c2 = await ateCobranca(V2);
  const t2 = await tentativa(c2, 'cartao');
  await rpc('pagamentos_aplicar', retrato(t2));
  await rpc('pagamentos_aplicar', retrato(t2, ajustar(r => { r.estado = 'contestada'; r.pagamento.status = 'charged_back'; r.pagamento.status_detail = 'in_process'; })));
  assert.equal(await statusPag(t2), 'contestado');
  assert.equal((await projetoDe(c2)).status, 'pausado');
  assert.equal(await auditoria(t2, 'payment.chargeback'), 1);
});

test('estorno de algo nunca aprovado e estado desconhecido: nada muda, divergência registrada', async () => {
  const c = await ateCobranca();
  const t = await tentativa(c);
  const r = await rpc('pagamentos_aplicar', retrato(t, ajustar(x => { x.estado = 'estornada'; x.pagamento.status = 'refunded'; x.pagamento.status_detail = 'refunded'; })));
  assert.equal(r.divergencia, true, 'estorno sem aprovação vista: divergência');
  assert.equal(await statusTent(t), 'estornada', 'sai da fila ativa (o visitante não fica travado)');
  assert.equal(await auditoria(t, 'payment.divergence'), 1);
  const d = await rpc('pagamentos_aplicar', retrato(t, ajustar(x => { x.estado = 'desconhecido'; x.pagamento.status = 'mystery'; x.pagamento.status_detail = '?'; })));
  assert.equal(d.sem_mudanca, true);
  assert.equal(await statusPag(t), 'pendente');
  assert.equal(await auditoria(t, 'payment.unknown_status'), 1);
  /* fim sem dinheiro não volta a ativo (retrato velho fora de ordem) */
  const c3 = await ateCobranca(V2);
  const t3 = await tentativa(c3);
  await rpc('pagamentos_aplicar', retrato(t3, ajustar(x => { x.estado = 'cancelada'; x.pagamento.status = 'canceled'; x.pagamento.status_detail = 'canceled'; delete x.pagamento.paid_amount; })));
  const velho = await rpc('pagamentos_aplicar', retrato(t3, ajustar(x => { x.estado = 'aguardando'; x.pagamento.status = 'action_required'; x.pagamento.status_detail = 'waiting_transfer'; delete x.pagamento.paid_amount; })));
  assert.equal(velho.ignorado, 'encerrada');
  assert.equal(await statusTent(t3), 'cancelada');
  assert.equal((await rpc('pagamentos_aplicar', retrato(t3))).aplicado, 'aprovada', 'mas pago depois de cancelado vale: dinheiro real');
});

test('resposta da criação perdida: a order achada pela referência é vinculada e aplicada', async () => {
  const c = await ateCobranca();
  const t = await tentativa(c, 'pix', false);
  const r = await rpc('pagamentos_aplicar', retrato({ ...t, order: 'ORDACHADAPELAREF0001' }, ajustar(x => { x.estado = 'aguardando'; x.pagamento.status = 'action_required'; x.pagamento.status_detail = 'waiting_transfer'; delete x.pagamento.paid_amount; x.pix = { qr: '0002…', qr_base64: 'iVBOR', link: 'https://mp/x', expira_em: new Date(Date.now() + 3600e3).toISOString() }; })));
  assert.equal(r.aplicado, 'aguardando');
  assert.equal((await um('select provedor_order_id from app.tentativas_pagamento where id = $1', [t.tentativa_id])).provedor_order_id, 'ORDACHADAPELAREF0001');
  const e = await rpc('pagamentos_estado', c.b);
  assert.equal(e.tentativa.status, 'aguardando');
  assert.equal(e.tentativa.pix_qr, '0002…', 'o QR só aparece enquanto aguarda');
  assert.equal(e.tentativa.provedor_order_id, undefined, 'o id do provedor não vai ao visitante');
  const lista = await rpc('pagamentos_para_reconciliar', { provedor: 'mercadopago', idade_min_s: 0 });
  assert.ok(lista.some(x => x.tentativa_id === t.tentativa_id), 'tentativa aberta entra na reconciliação');
});

test('auditoria append-only e isolamento: ninguém reescreve; visitante e outra organização não leem', async () => {
  const c = await ateCobranca();
  const t = await tentativa(c);
  await rpc('pagamentos_aplicar', retrato(t));
  for (const sql of [`update app.pagamentos_auditoria set evento = 'payment.failed'`, `delete from app.pagamentos_auditoria`, `truncate app.pagamentos_auditoria`]) {
    assert.ok(await erroDe(como(db, 'service_role', q => q(sql))), 'service_role não reescreve: ' + sql);
    assert.ok(await erroDe(db.query(sql)), 'nem o dono da tabela (trigger): ' + sql);
  }
  for (const sql of [`update app.pagamentos set status = 'pago', pago_em = now() where id = '${t.pagamento_id}'`, `insert into app.pagamentos_auditoria (evento) values ('payment.confirmed')`,
    `update app.tentativas_pagamento set status = 'aprovada' where id = '${t.tentativa_id}'`, `delete from app.pagamentos where id = '${t.pagamento_id}'`]) {
    assert.ok(await erroDe(como(db, 'service_role', q => q(sql))), 'service_role só escreve pelas funções: ' + sql.slice(0, 50));
  }
  await como(db, V1, async q => {
    assert.equal((await q('select 1 from app.tentativas_pagamento')).rows.length, 0, 'visitante não lê tentativas direto');
    assert.equal((await q('select 1 from app.pagamentos_auditoria')).rows.length, 0, 'visitante não lê auditoria');
    assert.ok(await erroDe(q(`select app.pagamentos_aplicar('{}'::jsonb)`)), 'visitante não chama a porta do pago');
  }, { manter: false });
  await como(db, X, async q => {
    assert.equal((await q('select 1 from app.tentativas_pagamento where id = $1', [t.tentativa_id])).rows.length, 0, 'outra organização não vê pelo id exato');
    assert.equal((await q('select 1 from app.pagamentos where id = $1', [t.pagamento_id])).rows.length, 0);
    assert.equal((await q('select 1 from app.pagamentos_auditoria where tentativa_id = $1', [t.tentativa_id])).rows.length, 0);
  }, { manter: false });
  await como(db, A, async q => {
    assert.ok((await q('select 1 from app.pagamentos_auditoria where tentativa_id = $1', [t.tentativa_id])).rows.length >= 2, 'a equipe da organização lê a trilha');
  }, { manter: false });
  const trilha = (await db.query('select evento from app.pagamentos_auditoria where tentativa_id = $1 order by id', [t.tentativa_id])).rows.map(x => x.evento);
  assert.deepEqual(trilha.slice(0, 3), ['payment.created', 'payment.confirmed', 'project.ready']);
  const texto = JSON.stringify((await db.query('select detalhe from app.pagamentos_auditoria')).rows);
  assert.ok(!/APP_USR|Bearer|token/i.test(texto), 'nada de credencial na trilha');
});

test('o DINHEIRO primeiro: se criar o projeto falhar, o pagamento continua pago e o erro fica na trilha', async () => {
  const c = await ateCobranca();
  await db.query(`update app.conversas set briefing = jsonb_set(briefing, '{negocio}', '{"nome":"   "}') where id = $1`, [c.conversa]);
  const t = await tentativa(c);
  assert.equal((await rpc('pagamentos_aplicar', retrato(t))).aplicado, 'aprovada');
  assert.equal(await statusPag(t), 'pago');
  assert.equal((await projetoDe(c)).status, 'pronto_para_producao', 'nomes em branco viram o padrão, sem erro');
  /* forçar o erro na criação do projeto: o pagamento continua pago, project.error registrado */
  const c2 = await ateCobranca(V2);
  const t2 = await tentativa(c2);
  await db.query(`alter table app.projetos add constraint teste_sem_projeto check (tipo <> 'site_institucional') not valid`);
  try {
    assert.equal((await rpc('pagamentos_aplicar', retrato(t2))).aplicado, 'aprovada');
    assert.equal(await statusPag(t2), 'pago', 'o dinheiro ficou gravado');
    assert.equal(await auditoria(t2, 'project.error'), 1);
  } finally { await db.query('alter table app.projetos drop constraint teste_sem_projeto'); }
});

test('teste de cartões: 5 tentativas de cartão por pagamento, intervalo depois de recusa, e o cartão pausa com muitas recusas', async () => {
  const c = await ateCobranca();
  const recusar = async t => rpc('pagamentos_aplicar', retrato(t, ajustar(r => { r.estado = 'recusada'; r.pagamento.status = 'failed'; r.pagamento.status_detail = 'rejected_by_issuer'; delete r.pagamento.paid_amount; })));
  const t1 = await tentativa(c, 'cartao');
  await recusar(t1);
  assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'cartao', provedor: 'mercadopago' })))?.codigo, '55P03', 'logo depois de uma recusa: aguarde');
  assert.equal((await rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'pix', provedor: 'mercadopago' })).ativa, false, 'o Pix não tem esse freio');
  const pix = (await db.query(`select id from app.tentativas_pagamento where pagamento_id = $1 and metodo = 'pix'`, [t1.pagamento_id])).rows[0].id;
  await db.query(`update app.tentativas_pagamento set status = 'expirada' where id = $1`, [pix]);
  for (let i = 0; i < 4; i++) {
    const t = await rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'cartao', provedor: 'mercadopago', intervalo_s: 0 });
    await rpc('pagamentos_vincular', { tentativa_id: t.tentativa_id, provedor_order_id: 'ORDCART' + i + t.tentativa_id.slice(0, 8).toUpperCase() });
    await recusar({ ...t, order: 'ORDCART' + i + t.tentativa_id.slice(0, 8).toUpperCase() });
  }
  assert.match((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...c.b, metodo: 'cartao', provedor: 'mercadopago', intervalo_s: 0 })))?.msg || '', /tentativas esgotadas/, '6ª de cartão: barrada');
  const outro = await ateCobranca(V2);
  assert.match((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...outro.b, metodo: 'cartao', provedor: 'mercadopago', max_recusas_hora: 5 })))?.msg || '', /cartão pausado/, 'recusas demais na organização: cartão pausado para todos');
  assert.equal((await rpc('pagamentos_iniciar_tentativa', { ...outro.b, metodo: 'pix', provedor: 'mercadopago', max_recusas_hora: 5 })).ativa, false, 'o Pix segue');
});
