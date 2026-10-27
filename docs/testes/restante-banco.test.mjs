/* O RESTANTE no banco (PR 3b-3; spec §5): o saldo só abre com o site no ar (no_ar ou suspensa), vale EXATAMENTE valor_total − entrada, o estado olha a
   parcela certa, e o saldo pago conclui a entrega, encerra a conversa e entrega o projeto, sem derrubar o pagamento se a entrega falhar.
   Postgres real (PGlite) com as migrations.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';
import { entregaEm, forcarEntrega, iniciarRestante, aprovarRestante, codigoDe } from './_previa.mjs';
import { randomUUID } from 'node:crypto';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const base = c => ({ conversa_id: c.conversa_id, visitante_id: c.visitante_id });
const iniciar = c => rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'pix', provedor: 'mercadopago' });

test('o restante só abre com o site no ar: em produção, na prévia e aprovada, 55000; no ar, cobra', async () => {
  for (const passo of ['producao', 'previa', 'aprovada']) {
    const c = await entregaEm(db, passo);
    assert.equal((await erroDe(iniciar(c))).codigo, '55000', passo);
  }
  const c = await entregaEm(db, 'no_ar');
  const t = await iniciar(c);
  assert.equal(t.ativa, false); assert.ok(t.tentativa_id);
});

test('B3: o restante é só Pix também no banco (cartão para o saldo dá 22023 e nada é criado); a entrada continua aceitando os dois métodos da 3b-1', async () => {
  const c = await entregaEm(db, 'no_ar');
  assert.equal((await erroDe(rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'cartao', provedor: 'mercadopago' }))).codigo, '22023');
  assert.equal((await um("select count(*)::int n from app.pagamentos where proposta_id = $1 and parcela = 'saldo'", [c.proposta])).n, 0, 'nada foi criado');
  assert.ok((await iniciar(c)).tentativa_id, 'o Pix do restante abre normalmente');
});

test('o valor é EXATAMENTE valor_total − entrada (a diferença fecha o total sem erro de arredondamento) e a cobrança é da parcela "saldo"', async () => {
  const c = await entregaEm(db, 'no_ar', { total: 1999.99, sinal: 800 });
  const t = await iniciar(c);
  const sinal = Number((await um("select valor from app.pagamentos where proposta_id = $1 and parcela = 'sinal'", [c.proposta])).valor);
  const total = Number((await um('select valor_total from app.propostas where id = $1', [c.proposta])).valor_total);
  assert.equal(Math.round((sinal + Number(t.valor)) * 100) / 100, total, 'entrada + restante = total');
  const pg = await um("select parcela, status, valor from app.pagamentos where proposta_id = $1 and parcela = 'saldo'", [c.proposta]);
  assert.deepEqual([pg.parcela, pg.status], ['saldo', 'pendente']);
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'restante_iniciado'", [c.conversa_id])).n, 1);
  const de_novo = await iniciar(c);
  assert.equal(de_novo.ativa, true, 'a mesma cobrança: não abre outra por cima');
});

test('o estado olha a parcela certa: antes do ar, a entrada; no ar, o restante (sem cobrança ainda: nada), e depois da tentativa, o saldo', async () => {
  const antes = await entregaEm(db, 'previa');
  assert.equal((await rpc('pagamentos_estado', base(antes))).pagamento.parcela, 'sinal');
  const c = await entregaEm(db, 'no_ar');
  assert.equal((await rpc('pagamentos_estado', base(c))).pagamento, null, 'no ar, sem cobrança do restante ainda: a tela mostra o formulário');
  await iniciarRestante(db, c);
  const e = await rpc('pagamentos_estado', base(c));
  assert.equal(e.pagamento.parcela, 'saldo'); assert.equal(e.pagamento.status, 'pendente');
});

test('o restante pago conclui: entrega "concluida", conversa "encerrada", projeto "entregue", evento, link do pedido limitado; suspensa pede religação', async () => {
  const c = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, c);
  await db.query("insert into app.links_pedido (org_id, conversa_id, codigo_hash, valido_ate) values ((select org_id from app.conversas where id = $1), $1, repeat('a', 64), now() + interval '120 days')", [c.conversa_id]);
  assert.equal((await aprovarRestante(db, x)).aplicado, 'aprovada');
  const l = await um("select valido_ate < now() + interval '31 days' as curto, fim_em is not null as fim from app.links_pedido where conversa_id = $1", [c.conversa_id]);
  assert.deepEqual([l.curto, l.fim], [true, true], 'o link do pedido passa a valer só mais 30 dias');
  const e = await um('select passo, concluida_em, religar_pendente from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.equal(e.passo, 'concluida'); assert.ok(e.concluida_em); assert.equal(e.religar_pendente, false);
  assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa_id])).etapa, 'encerrada');
  assert.equal((await um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta])).status, 'entregue');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'restante_pago'", [c.conversa_id])).n, 1);
  const s = await entregaEm(db, 'suspensa');
  assert.equal((await aprovarRestante(db, await iniciarRestante(db, s))).aplicado, 'aprovada');
  assert.deepEqual(await um('select passo, religar_pendente from app.entregas where conversa_id = $1', [s.conversa_id]), { passo: 'concluida', religar_pendente: true });
});

test('o gatilho nunca derruba o pagamento: com a entrega quebrada o restante fica pago, o erro vai para a auditoria e a leitura do estado conserta', async () => {
  const c = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, c);
  await db.exec('alter table app.entregas rename to entregas_tmp');
  let r;
  try { r = await aprovarRestante(db, x); } finally { await db.exec('alter table app.entregas_tmp rename to entregas'); }
  assert.equal(r.aplicado, 'aprovada', 'o pagamento passou');
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'saldo'", [c.proposta])).status, 'pago');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo, 'no_ar', 'ainda não concluiu');
  const aud = await um("select a.detalhe from app.pagamentos_auditoria a join app.pagamentos p on p.id = a.pagamento_id where p.proposta_id = $1 and p.parcela = 'saldo' and a.evento = 'project.error'", [c.proposta]);
  assert.match(aud.detalhe.motivo, /entrega não concluída/);
  const est = await rpc('vendas_estado', base(c));
  assert.equal(est.entrega.passo, 'concluida', 'a leitura do estado concluiu o que faltava');
  await rpc('vendas_estado', base(c));
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'restante_pago'", [c.conversa_id])).n, 1, 'idempotente');
});

test('restante pago com a entrega já encerrada: o dinheiro fica registrado, a entrega NÃO reabre e o caso vai para a auditoria', async () => {
  const c = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, c);
  await forcarEntrega(db, c, { passo: 'encerrada' });
  assert.equal((await aprovarRestante(db, x)).aplicado, 'aprovada');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo, 'encerrada');
  assert.ok(await um("select 1 as ok from app.pagamentos_auditoria a join app.pagamentos p on p.id = a.pagamento_id where p.proposta_id = $1 and p.parcela = 'saldo' and a.evento = 'project.error'", [c.proposta]));
});

test('estorno do restante: as regras de hoje (fail closed, auditoria); a entrega concluída NÃO volta sozinha (spec §5)', async () => {
  const c = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, c);
  await aprovarRestante(db, x);
  await aprovarRestante(db, x, 'estornada');
  assert.equal((await um("select status from app.pagamentos where proposta_id = $1 and parcela = 'saldo'", [c.proposta])).status, 'estornado');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo, 'concluida');
});

test('22/10: com o Pix do restante em andamento o site não sai do ar (nem se encerra o pedido); pago o restante, o pedido conclui e já não há o que suspender', async () => {
  const c = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: new Date(Date.now() - 4 * 864e5).toISOString() });   /* passou do 3º dia do aviso "no ar" */
  const dono = (nome, extra = {}) => codigoDe(db, c).then(codigo => rpc(nome, { org_slug: 'beyon-zero', codigo, ...extra }));
  const x = await iniciarRestante(db, c);
  assert.deepEqual(await dono('vendas_suspender'), { ok: false, motivo: 'pagamento_em_andamento' });
  assert.deepEqual(await dono('vendas_encerrar', { motivo: 'outro' }), { ok: false, motivo: 'pagamento_em_andamento' });
  await aprovarRestante(db, x);
  assert.equal((await erroDe(dono('vendas_suspender'))).codigo, '55000', 'a entrega já concluiu: não há o que suspender');
});

test('a cobrança do restante só existe para o dono da sessão (P0002 para outro visitante)', async () => {
  const c = await entregaEm(db, 'no_ar');
  const outro = randomUUID(); await db.query('insert into auth.users (id) values ($1)', [outro]);
  assert.equal((await erroDe(iniciar({ ...c, visitante_id: outro }))).codigo, 'P0002');
});

/* ---- acréscimos da execução (revisão da Task 4, B3, idempotência) ---- */
const pagamento = async (c, parcela) => um('select status, valor from app.pagamentos where proposta_id = $1 and parcela = $2', [c.proposta, parcela]);
const eventos = async (c, tipo) => (await um('select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = $2', [c.conversa_id, tipo])).n;
const erros = async c => (await um("select count(*)::int n from app.pagamentos_auditoria a join app.pagamentos p on p.id = a.pagamento_id where p.proposta_id = $1 and a.evento = 'project.error'", [c.proposta])).n;

test('a tela lê o aviso do ar com a data real: aviso_em e dias_do_aviso contados pela DATA de Campo Grande, não por 24 horas', async () => {
  const c = await entregaEm(db, 'no_ar');
  const site = async () => (await rpc('vendas_estado', base(c))).entrega.site;
  const sem = await site();
  assert.equal(sem.aviso_em, null); assert.equal(sem.dias_do_aviso, null, 'sem aviso registrado não há contagem');
  /* a meia-noite de hoje em Campo Grande, como instante */
  const meia = (await um("select ((date_trunc('day', now() at time zone 'America/Campo_Grande')) at time zone 'America/Campo_Grande') as t")).t;
  const aviso = async (ms) => { const t = new Date(meia.getTime() + ms); await forcarEntrega(db, c, { aviso_no_ar_feito_em: t.toISOString() }); return t; };
  const t0 = await aviso(0);                     /* hoje, quase 24h atrás se for noite: ainda é o dia 0 */
  let s = await site();
  assert.equal(s.dias_do_aviso, 0); assert.equal(new Date(s.aviso_em).getTime(), t0.getTime());
  const t1 = await aviso(-60e3);                 /* um minuto antes da meia-noite: ontem, dia 1, mesmo com poucos minutos de relógio */
  s = await site();
  assert.equal(s.dias_do_aviso, 1); assert.equal(new Date(s.aviso_em).getTime(), t1.getTime());
  await aviso(-2 * 864e5 - 60e3);                /* dois dias e um minuto antes da meia-noite: 3 datas atrás */
  assert.equal((await site()).dias_do_aviso, 3);
});

test('B3 (entrada): a entrada continua aceitando cartão (a cobrança que já existe volta como ativa, sem erro)', async () => {
  const c = await conversaComEntradaPaga(db, { semPagar: true });
  const r = await rpc('pagamentos_iniciar_tentativa', { ...base(c), metodo: 'cartao', provedor: 'mercadopago' });
  assert.equal(r.ativa, true);
});

test('o saldo ainda pendente não conclui nada: nem a leitura do estado', async () => {
  const c = await entregaEm(db, 'no_ar');
  await iniciarRestante(db, c);
  const e = await rpc('vendas_estado', base(c));
  assert.equal(e.entrega.passo, 'no_ar'); assert.equal(e.conversa.etapa, 'em_producao');
  assert.equal(await eventos(c, 'restante_pago'), 0);
});

test('idempotência: o mesmo aviso do saldo repetido, e a contestação revertida, não concluem de novo nem repetem o evento', async () => {
  const c = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, c);
  await aprovarRestante(db, x);
  const antes = await um('select concluida_em, updated_at from app.entregas where conversa_id = $1', [c.conversa_id]);
  await aprovarRestante(db, x);                  /* o webhook de novo */
  await aprovarRestante(db, x, 'contestada');
  assert.equal((await pagamento(c, 'saldo')).status, 'contestado');
  await aprovarRestante(db, x, 'contestada_revertida');   /* volta a "pago": o gatilho dispara de novo, e nada acontece */
  assert.equal((await pagamento(c, 'saldo')).status, 'pago');
  const depois = await um('select passo, concluida_em, updated_at from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.equal(depois.passo, 'concluida');
  assert.deepEqual([depois.concluida_em, depois.updated_at], [antes.concluida_em, antes.updated_at], 'a conclusão não foi refeita');
  assert.equal(await eventos(c, 'restante_pago'), 1);
  assert.equal(await erros(c), 0, 'repetir não é caso para a equipe');
  /* a função em si: a segunda chamada diz que não havia o que fazer */
  assert.equal((await um('select privado.concluir_entrega($1) as r', [c.proposta])).r, false);
  assert.equal((await um('select privado.concluir_pendente($1) as r', [c.conversa_id])).r, false);
  assert.equal(await eventos(c, 'restante_pago'), 1);
});

test('o cliente que abre a tela depois do restante pago lê a conversa encerrada e a entrega concluída (e o pagamento do saldo)', async () => {
  const c = await entregaEm(db, 'no_ar');
  await aprovarRestante(db, await iniciarRestante(db, c));
  const e = await rpc('vendas_estado', base(c));
  assert.equal(e.conversa.etapa, 'encerrada'); assert.equal(e.entrega.passo, 'concluida');
  const p = await rpc('pagamentos_estado', base(c));
  assert.equal(p.pagamento.parcela, 'saldo'); assert.equal(p.pagamento.status, 'pago');
});

test('uma conclusão que falha SEMPRE não derruba nem o pagamento nem a leitura da tela; tirado o defeito, a próxima leitura conclui', async () => {
  const c = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, c);
  await db.exec("alter table app.entregas add constraint tmp_sem_conclusao check (passo <> 'concluida') not valid");
  try {
    assert.equal((await aprovarRestante(db, x)).aplicado, 'aprovada');
    assert.equal((await pagamento(c, 'saldo')).status, 'pago');
    assert.equal(await erros(c), 1, 'o gatilho anotou o caso para a equipe');
    const e = await rpc('vendas_estado', base(c));   /* a leitura tenta de novo, falha de novo e mesmo assim responde */
    assert.equal(e.entrega.passo, 'no_ar'); assert.equal(e.conversa.etapa, 'em_producao');
  } finally { await db.exec('alter table app.entregas drop constraint tmp_sem_conclusao'); }
  assert.equal((await rpc('vendas_estado', base(c))).entrega.passo, 'concluida');
  assert.equal(await eventos(c, 'restante_pago'), 1);
});

/* ---- correção da revisão da Task 6: sem a entrada PAGA o restante não abre (fecha fail closed, como privado.sinal_pago); projeto fora de produção; proposta ---- */
test('entrada estornada ou contestada: o restante NÃO abre (55000) e nenhum saldo é criado (a equipe resolve)', async () => {
  for (const status of ['estornado', 'contestado']) {
    const c = await entregaEm(db, 'no_ar');
    await db.query("update app.pagamentos set status = $2 where proposta_id = $1 and parcela = 'sinal'", [c.proposta, status]);
    assert.equal((await erroDe(iniciar(c))).codigo, '55000', status);
    assert.equal((await um("select count(*)::int n from app.pagamentos where proposta_id = $1 and parcela = 'saldo'", [c.proposta])).n, 0, 'nada foi criado: ' + status);
  }
});

test('o restante pago com o projeto fora de produção (pausado): a entrega conclui, o projeto não muda e o caso vai para a auditoria', async () => {
  const c = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, c);
  await db.query("update app.projetos set status = 'pausado' where id = (select projeto_id from app.propostas where id = $1)", [c.proposta]);
  assert.equal((await aprovarRestante(db, x)).aplicado, 'aprovada');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo, 'concluida');
  assert.equal((await um('select pj.status from app.projetos pj join app.propostas pr on pr.projeto_id = pj.id where pr.id = $1', [c.proposta])).status, 'pausado');
  const aud = await um("select a.detalhe from app.pagamentos_auditoria a join app.pagamentos p on p.id = a.pagamento_id where p.proposta_id = $1 and p.parcela = 'saldo' and a.evento = 'project.error'", [c.proposta]);
  assert.match(aud.detalhe.motivo, /projeto fora de produção/);
});

test('o restante só cobra a proposta da entrega: com outra proposta aceita mais nova na conversa, 55000 e nenhum saldo é criado', async () => {
  const c = await entregaEm(db, 'no_ar');
  await db.query('create temp table _p as select * from app.propostas where id = $1', [c.proposta]);
  await db.exec('update _p set id = gen_random_uuid(), versao = versao + 1; insert into app.propostas select * from _p; drop table _p;');
  /* a proposta nova também tem a entrada paga: sem a conferência da proposta da entrega, o restante abriria para ela */
  const nova = (await um('select id from app.propostas where conversa_id = (select conversa_id from app.entregas where proposta_id = $1) and id <> $1', [c.proposta])).id;
  await db.query("create temp table _g as select * from app.pagamentos where proposta_id = $1 and parcela = 'sinal'", [c.proposta]);
  await db.query('update _g set id = gen_random_uuid(), proposta_id = $1, gateway_ref = null', [nova]);
  await db.exec('insert into app.pagamentos select * from _g; drop table _g;');
  assert.equal((await erroDe(iniciar(c))).codigo, '55000');
  assert.equal((await um("select count(*)::int n from app.pagamentos where parcela = 'saldo' and proposta_id in (select id from app.propostas where conversa_id = (select conversa_id from app.entregas where proposta_id = $1))", [c.proposta])).n, 0);
});
