/* O ATENDENTE DE IA NO SITE DO CLIENTE, NO BANCO (fase 0): tabelas fechadas (RLS sem política), isolamento entre clientes (inclusive
   uuid de conversa adivinhado), tetos (IP, mensagens da conversa, gasto do dia), contato, domínios sem curinga e retenção. PGlite real.
   node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';

let db, rpc, A, B;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
let ipSeq = 0;
const ip = () => String(++ipSeq).padStart(64, 'b');
const salvar = (extra = {}) => rpc('atendente_cliente_salvar', { org_slug: 'beyon-zero', nome: 'Clínica Teste', whatsapp: '5521999990000', dominios: ['clinica-teste.com.br'],
  base: [{ tipo: 'pergunta', pergunta: 'Qual o horário?', resposta: 'De segunda a sexta, das 8h às 18h.' }, { tipo: 'preco', item: 'Limpeza', preco_centavos: 18000 }], ...extra });
const turno = (c, extra = {}) => rpc('atendente_turno_abrir', { publico: c.publico, chave_ip: ip(), ...extra });
const gravar = (c, conversa_id, extra = {}) => rpc('atendente_turno_gravar', { publico: c.publico, conversa_id, texto_visitante: 'oi', texto_atendente: 'olá', custo_usd: 0, ...extra });
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); A = await salvar(); B = await salvar({ nome: 'Outra Loja', dominios: ['outra.com.br'] }); });

test('o cliente nasce com id público no formato esperado; a config traz base e domínios', async () => {
  assert.match(A.publico, /^at_[0-9a-f]{32}$/);
  const c = await rpc('atendente_config', { publico: A.publico });
  assert.deepEqual(c.dominios, ['clinica-teste.com.br']);
  assert.equal(c.base.length, 2);
  assert.equal(c.base[1].preco_centavos, 18000);
  assert.equal(await rpc('atendente_config', { publico: 'at_' + '0'.repeat(32) }), null, 'id desconhecido = null');
});

test('as tabelas são fechadas: nenhum papel (nem service_role) lê direto', async () => {
  for (const t of ['atendente_clientes', 'atendente_base', 'atendente_conversas', 'atendente_mensagens', 'atendente_contatos', 'atendente_gasto', 'atendente_dominios']) {
    for (const quem of ['anon', 'authenticated', 'service_role']) {
      const e = await erroDe(como(db, quem, q => q('select * from app.' + t)));
      assert.equal(e.codigo, '42501', quem + ' em ' + t);
    }
  }
});

test('domínio com curinga, esquema, porta ou barra é recusado', async () => {
  for (const d of ['*', '*.com.br', 'https://a.com', 'a.com:8080', 'a.com/x', 'a b.com', 'a..com']) {
    assert.equal((await erroDe(salvar({ dominios: [d] }))).codigo, '23514', d);
  }
});

test('preço sem valor e pergunta sem resposta são recusados', async () => {
  assert.equal((await erroDe(salvar({ base: [{ tipo: 'preco', item: 'X' }] }))).codigo, '23514');
  assert.equal((await erroDe(salvar({ base: [{ tipo: 'pergunta', pergunta: 'X' }] }))).codigo, '23514');
});

test('ISOLAMENTO: a conversa de um cliente não abre, não grava e não recebe contato pelo outro cliente (uuid adivinhado)', async () => {
  const t = await turno(A);
  await gravar(A, t.conversa_id, { texto_visitante: 'segredo da clínica' });
  const t2 = await turno(B, { conversa_id: t.conversa_id });
  assert.notEqual(t2.conversa_id, t.conversa_id, 'nasce conversa nova');
  assert.deepEqual(t2.historico, [], 'sem o histórico do outro');
  assert.equal((await erroDe(gravar(B, t.conversa_id))).codigo, 'P0002');
  assert.equal((await erroDe(rpc('atendente_contato_criar', { publico: B.publico, conversa_id: t.conversa_id, nome: 'Ana', telefone: '21999990000' }))).codigo, 'P0002');
  const msgs = await um('select count(*)::int n from app.atendente_mensagens where cliente_id = $1', [B.id]);
  assert.equal(msgs.n, 0);
});

test('o painel só vê o cliente da própria organização e conversas do cliente pedido', async () => {
  const t = await turno(A);
  await gravar(A, t.conversa_id, { texto_visitante: 'pergunta da A' });
  const pA = await rpc('atendente_painel_conversas', { org_slug: 'beyon-zero', id: A.id });
  assert.ok(pA.conversas.some(c => c.mensagens.some(m => m.texto === 'pergunta da A')));
  const pB = await rpc('atendente_painel_conversas', { org_slug: 'beyon-zero', id: B.id });
  assert.ok(!JSON.stringify(pB).includes('pergunta da A'));
  await db.exec("insert into app.organizacoes (id, slug, nome) values (gen_random_uuid(), 'outra-org', 'Outra')");
  assert.equal((await erroDe(rpc('atendente_painel_cliente', { org_slug: 'outra-org', id: A.id }))).codigo, 'P0002');
  assert.equal((await erroDe(rpc('atendente_cliente_salvar', { org_slug: 'outra-org', id: A.id, nome: 'Sequestro' }))).codigo, 'P0002');
});

test('teto de mensagens por conversa: a partir do limite responde motivo conversa', async () => {
  const t = await turno(A);
  for (let i = 0; i < 3; i++) await gravar(A, t.conversa_id);
  assert.equal((await turno(A, { conversa_id: t.conversa_id, max_msgs: 4 })).ok, true);
  const r = await turno(A, { conversa_id: t.conversa_id, max_msgs: 3 });
  assert.deepEqual([r.ok, r.motivo], [false, 'conversa']);
});

test('teto por IP na hora: passou, motivo ip; outro IP segue', async () => {
  const mesmo = ip();
  for (let i = 0; i < 3; i++) assert.equal((await turno(A, { chave_ip: mesmo, max_ip_hora: 3 })).ok, true);
  const r = await turno(A, { chave_ip: mesmo, max_ip_hora: 3 });
  assert.deepEqual([r.ok, r.motivo], [false, 'ip']);
  assert.equal((await turno(A, { max_ip_hora: 3 })).ok, true);
  assert.equal((await turno(B, { chave_ip: mesmo, max_ip_hora: 3 })).ok, true, 'a cota do IP é por cliente');
});

test('teto de gasto por cliente por dia: bateu, motivo gasto; o outro cliente segue', async () => {
  const C = await salvar({ nome: 'Cara', teto_dia_usd: 0.5, dominios: ['cara.com.br'] });
  const t = await turno(C);
  await gravar(C, t.conversa_id, { custo_usd: 0.3 });
  assert.equal((await turno(C)).ok, true);
  await gravar(C, t.conversa_id, { custo_usd: 0.3 });
  const r = await turno(C);
  assert.deepEqual([r.ok, r.motivo], [false, 'gasto']);
  assert.equal((await turno(A)).ok, true);
});

test('contato: grava nome e só os dígitos do telefone, valida e limita a 3 por conversa', async () => {
  const t = await turno(A);
  const c = { publico: A.publico, conversa_id: t.conversa_id };
  assert.equal((await rpc('atendente_contato_criar', { ...c, nome: ' Ana ', telefone: '(21) 99999-0000' })).ok, true);
  const l = await um('select nome, telefone from app.atendente_contatos where conversa_id = $1', [t.conversa_id]);
  assert.deepEqual([l.nome, l.telefone], ['Ana', '21999990000']);
  assert.equal((await erroDe(rpc('atendente_contato_criar', { ...c, nome: 'Ana', telefone: '123' }))).codigo, '22023');
  assert.equal((await erroDe(rpc('atendente_contato_criar', { ...c, nome: '', telefone: '21999990000' }))).codigo, '22023');
  await rpc('atendente_contato_criar', { ...c, nome: 'B', telefone: '21999990001' });
  await rpc('atendente_contato_criar', { ...c, nome: 'C', telefone: '21999990002' });
  assert.equal((await rpc('atendente_contato_criar', { ...c, nome: 'D', telefone: '21999990003' })).motivo, 'limite');
});

test('cliente desligado: config null e turno recusado (P0002)', async () => {
  const D = await salvar({ nome: 'Off', dominios: ['off.com.br'], ativo: false });
  assert.equal(await rpc('atendente_config', { publico: D.publico }), null);
  assert.equal((await erroDe(turno(D))).codigo, 'P0002');
});

test('retenção: conversas velhas (e as mensagens) saem; recente fica; mínimo de 30 dias', async () => {
  const velha = await turno(A), nova = await turno(A);
  await gravar(A, velha.conversa_id); await gravar(A, nova.conversa_id);
  await db.query("update app.atendente_conversas set ultima_em = now() - interval '61 days' where id = $1", [velha.conversa_id]);
  const r = await rpc('rotinas_atendente', {});
  assert.ok(r.conversas >= 1);
  assert.equal((await um('select count(*)::int n from app.atendente_conversas where id = $1', [velha.conversa_id])).n, 0);
  assert.equal((await um('select count(*)::int n from app.atendente_mensagens where conversa_id = $1', [velha.conversa_id])).n, 0);
  assert.equal((await um('select count(*)::int n from app.atendente_conversas where id = $1', [nova.conversa_id])).n, 1);
  assert.equal((await erroDe(rpc('rotinas_atendente', { dias: 10 }))).codigo, '22023');
});
