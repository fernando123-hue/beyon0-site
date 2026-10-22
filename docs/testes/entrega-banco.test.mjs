/* A ENTREGA no banco (PR 3b-2; spec §2): nasce com a entrada paga (gatilho), nunca derruba o pagamento, só anda pelas
   transições da tabela, o estado traz o que a tela precisa, a retomada passa a valer em em_producao, e o backend
   (service_role) não escreve nas tabelas por fora das funções.  Postgres real (PGlite) com as migrations. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';
import { createHash, randomUUID } from 'node:crypto';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });

test('o sinal pago cria a entrega no passo "material" (prazo da proposta, entrada em UTC); o material nasce em rascunho', async () => {
  const c = await conversaComEntradaPaga(db, { prazo: 8 });
  assert.equal(c.aplicado.aplicado, 'aprovada');
  const e = await um('select * from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.equal(e.passo, 'material'); assert.equal(e.prazo_dias, 8); assert.equal(e.proposta_id, c.proposta); assert.equal(e.entrega_ate, null);
  assert.match(e.prazo.entrada_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'o instante fica em UTC; o -04:00 é posto no JS (isoNoFuso)');
  const m = await um('select * from app.materiais where entrega_id = $1', [e.id]);
  assert.deepEqual([m.status, m.dados, m.negocio, m.autorizacao], ['rascunho', {}, {}, {}]);
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'entrega_criada'", [c.conversa_id])).n, 1);
});

test('o gatilho nunca derruba o pagamento: com a criação quebrada o sinal fica pago, e a leitura do estado conserta', async () => {
  const c = await conversaComEntradaPaga(db, { antesDePagar: () => db.exec('alter table app.entregas rename to entregas_tmp') });
  await db.exec('alter table app.entregas_tmp rename to entregas');
  assert.equal(c.aplicado.aplicado, 'aprovada', 'o pagamento passou');
  assert.equal((await um("select p.status from app.pagamentos p join app.propostas pr on pr.id = p.proposta_id where pr.id = $1 and p.parcela = 'sinal'", [c.proposta])).status, 'pago');
  assert.equal((await um('select count(*)::int n from app.entregas where conversa_id = $1', [c.conversa_id])).n, 0, 'sem entrega ainda');
  const est = await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: c.visitante_id });
  assert.equal(est.entrega.passo, 'material', 'a leitura do estado criou a entrega');
  await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: c.visitante_id });
  assert.equal((await um('select count(*)::int n from app.entregas where conversa_id = $1', [c.conversa_id])).n, 1, 'idempotente');
});

test('uma entrega por proposta; e o aviso de pagamento repetido não cria outra', async () => {
  const c = await conversaComEntradaPaga(db);
  await db.query('select privado.criar_entrega($1)', [c.proposta]);
  assert.equal((await um('select count(*)::int n from app.entregas where proposta_id = $1', [c.proposta])).n, 1);
  assert.equal((await um('select count(*)::int n from app.materiais m join app.entregas e on e.id = m.entrega_id where e.proposta_id = $1', [c.proposta])).n, 1);
});

test('o passo só anda pelas transições da tabela: material → producao sim; material → previa, não', async () => {
  const c = await conversaComEntradaPaga(db);
  const erro = await erroDe(db.query("update app.entregas set passo = 'previa' where conversa_id = $1", [c.conversa_id]));
  assert.equal(erro && erro.codigo, '55000');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo, 'material');
  await db.query("update app.entregas set passo = 'producao' where conversa_id = $1", [c.conversa_id]);
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo, 'producao');
  assert.equal((await erroDe(db.query("update app.entregas set passo = 'material' where conversa_id = $1", [c.conversa_id]))).codigo, '55000', 'não volta');
});

test('o estado traz a entrega: passo, percentuais da proposta, material em rascunho; outro visitante não vê (P0002)', async () => {
  const c = await conversaComEntradaPaga(db, { total: 3000, sinal: 1200 });
  const est = await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: c.visitante_id });
  assert.equal(est.entrega.passo, 'material');
  assert.deepEqual(est.entrega.percentuais, { entrada: 40, restante: 60 });
  assert.equal(est.entrega.material.status, 'rascunho');
  assert.deepEqual(est.entrega.material.arquivos, []);
  assert.equal(est.entrega.link_pedido, false);
  assert.match(est.entrega.entrada_paga_em, /Z$/);
  assert.ok(est.entrega.material.updated_at, 'a versão do material (a corrida do envio)');
  const outro = randomUUID(); await db.query('insert into auth.users (id) values ($1)', [outro]);
  assert.equal((await erroDe(rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: outro }))).codigo, 'P0002');
  const antes = await conversaComEntradaPaga(db, { semPagar: true });
  const sem = await rpc('vendas_estado', { conversa_id: antes.conversa_id, visitante_id: antes.visitante_id });
  assert.equal(sem.entrega, null, 'sem entrada paga, sem entrega');
});

test('a retomada passa a valer em em_producao (e continua recusada no pagamento)', async () => {
  const c = await conversaComEntradaPaga(db);
  const hash = createHash('sha256').update('codigo-' + c.conversa_id).digest('hex');
  const r = await rpc('vendas_criar_retomada', { org_slug: 'beyon-zero', conversa_id: c.conversa_id, codigo_hash: hash, dias: 7 });
  assert.ok(r.expira_em, 'o aviso da D1 pode levar o link de retomada depois da entrada');
  const pre = await conversaComEntradaPaga(db, { semPagar: true });
  const erro = await erroDe(rpc('vendas_criar_retomada', { org_slug: 'beyon-zero', conversa_id: pre.conversa_id, codigo_hash: createHash('sha256').update('x' + pre.conversa_id).digest('hex'), dias: 7 }));
  assert.equal(erro && erro.codigo, '55000', 'no pagamento, o Pix está no aparelho de quem pagou e não muda de dono por link');
});

test('o backend (service_role) não escreve nas tabelas da entrega por fora das funções', async () => {
  const c = await conversaComEntradaPaga(db);
  for (const sql of ["update app.entregas set passo = 'producao'", "update app.materiais set status = 'enviado'", "delete from app.material_arquivos", "insert into app.links_pedido (org_id, conversa_id, codigo_hash, valido_ate) values (gen_random_uuid(), gen_random_uuid(), repeat('a', 64), now())"]) {
    const e = await erroDe(como(db, 'service_role', q => q(sql)));
    assert.equal(e && e.codigo, '42501', sql);
  }
  assert.ok(c);
});
