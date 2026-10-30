/* O RECADO NO BANCO (passo 1 do "Site sem WhatsApp"): o único lugar de feedback do site. Tabela fechada (RLS sem política, só as
   funções do backend), texto com limite, e-mail opcional conferido pela MESMA regra do e-mail do site, a conversa só como
   referência (e só se for deste visitante), freio por IP e teto do dia, lista e "lido" do dono, e a retenção de 60 dias.
   PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
let ipSeq = 0;
const chaveIp = () => String(++ipSeq).padStart(64, 'a');   /* 64 hex como o HMAC do servidor (aqui só precisa do formato) */
const novo = (extra = {}) => rpc('vendas_recado_criar', { org_slug: 'beyon-zero', texto: 'Queria entender como funciona o prazo.', chave_ip: chaveIp(), ...extra });
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });

test('cria o recado: texto aparado, e-mail em minúsculas, origem e sem conversa', async () => {
  const r = await novo({ texto: '  Quero saber o prazo.  ', email: ' Ana@Exemplo.com.br ', origem: 'orcamento' });
  assert.equal(r.ok, true);
  const linha = await um('select * from app.recados where id = $1', [r.id]);
  assert.deepEqual([linha.texto, linha.email, linha.origem, linha.conversa_id, linha.lido_em], ['Quero saber o prazo.', 'ana@exemplo.com.br', 'orcamento', null, null]);
  assert.ok(linha.criado_em);
});

test('o e-mail é opcional; o texto, não: vazio, só espaços ou maior que 1000 caracteres é recusado (22023)', async () => {
  assert.equal((await novo({ email: '' })).ok, true, 'e-mail vazio = sem e-mail');
  assert.equal((await um("select count(*)::int n from app.recados where email = ''")).n, 0, 'vazio vira null, não string vazia');
  for (const texto of ['', '   ', null, 'x'.repeat(1001)]) assert.equal((await erroDe(novo({ texto }))).codigo, '22023', JSON.stringify(texto).slice(0, 20));
  assert.equal((await novo({ texto: 'x'.repeat(1000) })).ok, true, '1000 cabe');
});

test('e-mail inválido é recusado pela regra do e-mail do site (sem domínio, com espaço, vírgula, grande demais)', async () => {
  for (const email of ['a@b', 'a b@c.com', '@x.com', 'a..b@c.com', 'a@b.com, c@d.com', 'mailto:a@b.com', 'x'.repeat(65) + '@a.com', 'a@' + 'b'.repeat(120) + '.com', '<a>@b.com']) {
    assert.equal((await erroDe(novo({ email }))).codigo, '22023', email);
  }
});

test('a origem é um rótulo curto (letras minúsculas, número, _ e -); o resto é recusado', async () => {
  assert.equal((await novo({ origem: 'consultor' })).ok, true);
  for (const origem of ['Orçamento', 'a b', '<x>', 'x'.repeat(31), 'a/b']) assert.equal((await erroDe(novo({ origem }))).codigo, '22023', origem);
});

test('a conversa entra só como REFERÊNCIA e só se for deste visitante; de outro visitante o recado nasce sem ligação (não vaza que a conversa existe)', async () => {
  const dono = randomUUID(), outro = randomUUID();
  for (const v of [dono, outro]) await db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: dono, origem_meio: 'direto' })).conversa_id;
  const ligado = await novo({ conversa_id: c, visitante_id: dono });
  assert.equal((await um('select conversa_id from app.recados where id = $1', [ligado.id])).conversa_id, c);
  const alheio = await novo({ conversa_id: c, visitante_id: outro });
  assert.equal(alheio.ok, true);
  assert.equal((await um('select conversa_id from app.recados where id = $1', [alheio.id])).conversa_id, null);
  const inexistente = await novo({ conversa_id: randomUUID(), visitante_id: dono });
  assert.equal((await um('select conversa_id from app.recados where id = $1', [inexistente.id])).conversa_id, null);
  const semVisitante = await novo({ conversa_id: c });
  assert.equal((await um('select conversa_id from app.recados where id = $1', [semVisitante.id])).conversa_id, null, 'sem visitante conferido não liga');
});

test('freio por IP: 5 recados por hora; o sexto volta { ok: false, motivo: "freio" } e não grava', async () => {
  const chave_ip = chaveIp();
  const antes = (await um('select count(*)::int n from app.recados')).n;
  for (let i = 0; i < 5; i++) assert.equal((await novo({ chave_ip })).ok, true, 'recado ' + (i + 1));
  const sexto = await novo({ chave_ip });
  assert.deepEqual([sexto.ok, sexto.motivo], [false, 'freio']);
  assert.equal((await um('select count(*)::int n from app.recados')).n, antes + 5);
  assert.equal((await novo({ chave_ip: chaveIp() })).ok, true, 'outro IP não é afetado');
});

test('o teto do dia protege o banco de uma enchente: passou de 200 recados no dia, { ok: false, motivo: "cheio" }', async () => {
  await db.exec('delete from app.recados; delete from privado.freio_ip');
  for (let i = 0; i < 200; i++) assert.equal((await novo()).ok, true, 'recado ' + i);
  const r = await novo();
  assert.deepEqual([r.ok, r.motivo], [false, 'cheio']);
  await db.exec('delete from app.recados; delete from privado.freio_ip');
});

test('fechado: anon e usuário logado não leem nem escrevem na tabela nem chamam as funções; só o backend (service_role)', async () => {
  const qualquer = randomUUID();
  for (const quem of ['anon', qualquer]) {
    for (const sql of ['select * from app.recados', "insert into app.recados (org_id, texto) values (gen_random_uuid(), 'x')", 'delete from app.recados']) {
      const e = await erroDe(como(db, quem, q => q(sql)));
      assert.equal(e && e.codigo, '42501', quem + ': ' + sql);
    }
    for (const f of ['vendas_recado_criar', 'vendas_recados_listar', 'vendas_recado_marcar', 'rotinas_recados']) {
      const e = await erroDe(como(db, quem, q => q(`select app.${f}('{}'::jsonb)`)));
      assert.equal(e && e.codigo, '42501', quem + ': ' + f);
    }
  }
  assert.equal((await um("select relrowsecurity from pg_class where oid = 'app.recados'::regclass")).relrowsecurity, true);
  assert.equal((await um("select count(*)::int n from pg_policies where schemaname = 'app' and tablename = 'recados'")).n, 0, 'sem política: nada passa pelo RLS');
});

test('a lista do dono: mais novo primeiro, com o código do pedido e o da conversa quando há; filtra os não lidos; conta os não lidos', async () => {
  await db.exec('delete from app.recados; delete from privado.freio_ip');
  const v = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  await db.query(`insert into app.pedidos (org_id, conversa_id, codigo, status, expira_em) select org_id, id, 'BZ-K7M3Q', 'aguardando', now() + interval '72 hours' from app.conversas where id = $1`, [c]);
  const a = await novo({ texto: 'primeiro', email: 'a@b.com.br' });
  const b = await novo({ texto: 'segundo', conversa_id: c, visitante_id: v, origem: 'orcamento' });
  await db.query("update app.recados set criado_em = now() - interval '1 hour' where id = $1", [a.id]);
  const lista = await rpc('vendas_recados_listar', { org_slug: 'beyon-zero' });
  assert.deepEqual(lista.itens.map(i => i.texto), ['segundo', 'primeiro']);
  assert.deepEqual([lista.total, lista.nao_lidos], [2, 2]);
  const seg = lista.itens[0];
  assert.deepEqual([seg.pedido_codigo, seg.conversa, seg.origem, seg.email, seg.lido_em], ['BZ-K7M3Q', c.slice(0, 8), 'orcamento', null, null]);
  assert.equal(lista.itens[1].email, 'a@b.com.br');
  assert.equal(lista.itens[1].conversa, null);
  await rpc('vendas_recado_marcar', { org_slug: 'beyon-zero', id: b.id });
  const naoLidos = await rpc('vendas_recados_listar', { org_slug: 'beyon-zero', so_nao_lidos: true });
  assert.deepEqual(naoLidos.itens.map(i => i.texto), ['primeiro']);
  assert.deepEqual([naoLidos.total, naoLidos.nao_lidos], [1, 1]);
  const todos = await rpc('vendas_recados_listar', { org_slug: 'beyon-zero' });
  assert.deepEqual([todos.total, todos.nao_lidos], [2, 1]);
  assert.equal((await rpc('vendas_recados_listar', { org_slug: 'beyon-zero', limite: 1 })).itens.length, 1);
});

test('marcar como lido grava a hora uma vez só; desmarcar volta a não lido; id que não existe é P0002', async () => {
  const r = await novo();
  const m1 = await rpc('vendas_recado_marcar', { org_slug: 'beyon-zero', id: r.id });
  assert.equal(m1.ok, true);
  const hora = (await um('select lido_em from app.recados where id = $1', [r.id])).lido_em;
  assert.ok(hora);
  await rpc('vendas_recado_marcar', { org_slug: 'beyon-zero', id: r.id });
  assert.equal(+(await um('select lido_em from app.recados where id = $1', [r.id])).lido_em, +hora, 'marcar de novo não muda a hora');
  await rpc('vendas_recado_marcar', { org_slug: 'beyon-zero', id: r.id, lido: false });
  assert.equal((await um('select lido_em from app.recados where id = $1', [r.id])).lido_em, null);
  assert.equal((await erroDe(rpc('vendas_recado_marcar', { org_slug: 'beyon-zero', id: randomUUID() }))).codigo, 'P0002');
  assert.equal((await erroDe(rpc('vendas_recado_marcar', { org_slug: 'beyon-zero', id: 'não-é-uuid' }))).codigo, '22P02');
});

test('retenção: 60 dias depois de criado o recado é apagado (lido ou não); 59 fica; o mínimo aceito é 30 dias', async () => {
  await db.exec('delete from app.recados; delete from privado.freio_ip');
  const velho = await novo({ texto: 'velho', email: 'v@b.com.br' }), quase = await novo({ texto: 'quase' }), lidoVelho = await novo({ texto: 'lido velho' });
  await db.query("update app.recados set criado_em = now() - interval '61 days' where id in ($1, $2)", [velho.id, lidoVelho.id]);
  await db.query("update app.recados set criado_em = now() - interval '59 days' where id = $1", [quase.id]);
  await rpc('vendas_recado_marcar', { org_slug: 'beyon-zero', id: lidoVelho.id });
  assert.equal((await erroDe(rpc('rotinas_recados', { dias: 29 }))).codigo, '22023');
  const r = await rpc('rotinas_recados', {});
  assert.deepEqual([r.apagados, r.dias], [2, 60]);
  assert.deepEqual((await db.query('select texto from app.recados')).rows.map(x => x.texto), ['quase']);
  assert.equal((await rpc('rotinas_recados', {})).apagados, 0, 'idempotente');
});

test('apagar a conversa leva os recados ligados a ela (direito de apagar do titular); os sem ligação ficam', async () => {
  await db.exec('delete from app.recados; delete from privado.freio_ip');
  const v = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  await novo({ texto: 'ligado', conversa_id: c, visitante_id: v });
  await novo({ texto: 'solto' });
  await db.query('delete from app.conversas where id = $1', [c]);
  assert.deepEqual((await db.query('select texto from app.recados')).rows.map(x => x.texto), ['solto']);
});
