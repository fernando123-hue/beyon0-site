/* AS AÇÕES DO CLIENTE NA PRÉVIA (PR 3b-3; spec §2 e §3; D2, D4, D5): mandar a lista de ajustes (conta 1 rodada, a 3ª é recusada, o prazo
   volta a correr) e aprovar. Só no passo "previa"; só o dono da sessão; só com o sinal pago. Nada de aprovação por rotina ou por tempo (D5).
   Postgres real (PGlite) com as migrations.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, forcarEntrega, versaoDe, PREVIA } from './_previa.mjs';
import { WHATSAPP_RUINS, EMAIL_RUINS } from './_contato.mjs';
import { randomUUID } from 'node:crypto';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const base = c => ({ conversa_id: c.conversa_id, visitante_id: c.visitante_id });
const PRAZO = { entrada_em: '2026-10-20T13:00:00Z', numero_em: '2026-10-21T13:00:00-04:00', conta_desde: '2026-10-21T13:00:00-04:00', pausas: [{ desde: '2026-10-22T09:00:00-04:00', ate: '2026-10-23T09:00:00-04:00' }] };
async function lista(c, extra = {}) {
  return rpc('vendas_previa_ajustes', { ...base(c), texto: 'Trocar a foto da capa e o telefone do rodapé.', rodada_base: 0, versao: await versaoDe(db, c),
    agora: new Date().toISOString(), prazo: PRAZO, entrega_ate: '2026-11-09', ...extra });
}

test('o estado traz o que a tela precisa: versão em texto, importada, rodadas 0 de 2, a prévia e o site; nunca o texto da lista', async () => {
  const c = await entregaEm(db, 'previa');
  const est = (await rpc('vendas_estado', base(c))).entrega;
  assert.equal(est.passo, 'previa'); assert.equal(est.importada, true);
  assert.deepEqual(est.rodadas, { usadas: 0, max: 2 });
  assert.equal(est.previa.url, PREVIA);
  assert.deepEqual(Object.keys(est.site).sort(), ['aviso_em', 'dias_do_aviso', 'limite_dias', 'no_ar_em', 'url']);
  assert.equal(est.site.limite_dias, 3); assert.equal(est.site.dias_do_aviso, null, 'a contagem dos 3 dias só começa com o REGISTRO do aviso "no ar"');
  assert.equal(est.versao, await versaoDe(db, c), 'a versão é o updated_at em texto, igual ao do banco');
  await lista(c);
  assert.ok(!JSON.stringify(await rpc('vendas_estado', base(c))).includes('Trocar a foto da capa'), 'o texto da lista fica fora da tela');
});

test('a lista de ajustes: passo "ajustes", 1 rodada, texto guardado, prazo e data novos, evento sem texto', async () => {
  const c = await entregaEm(db, 'previa');
  const r = await lista(c);
  assert.deepEqual(r, { ok: true, rodada: 1 });
  const e = await um('select * from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.passo, e.rodadas_usadas], ['ajustes', 1]);
  assert.equal((await um("select to_char(entrega_ate, 'YYYY-MM-DD') d from app.entregas where conversa_id = $1", [c.conversa_id])).d, '2026-11-09');
  assert.deepEqual(e.prazo.pausas, PRAZO.pausas, 'o prazo vem do servidor (a pausa fechada) e é gravado como veio');
  const a = await um('select * from app.entrega_ajustes where entrega_id = $1', [e.id]);
  assert.deepEqual([a.rodada, a.status, a.texto], [1, 'na_fila', 'Trocar a foto da capa e o telefone do rodapé.']);
  const ev = await um("select dados from app.eventos_funil where conversa_id = $1 and tipo = 'previa_ajustes'", [c.conversa_id]);
  assert.deepEqual(ev.dados, { rodada: 1 }, 'o evento não leva o texto do cliente');
});

test('D2: a 3ª lista é recusada (2 listas; o que passar é orçado à parte) e nada é gravado', async () => {
  const c = await entregaEm(db, 'previa');
  assert.equal((await lista(c)).ok, true);
  await forcarEntrega(db, c, { passo: 'previa' });   // (a produção publicou a nova prévia: é a Task 5; aqui só o passo)
  assert.equal((await lista(c, { rodada_base: 1 })).rodada, 2);
  await forcarEntrega(db, c, { passo: 'previa' });
  const terceira = await lista(c, { rodada_base: 2 });
  assert.deepEqual(terceira, { ok: false, motivo: 'rodadas' });
  const e = await um('select passo, rodadas_usadas from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.passo, e.rodadas_usadas], ['previa', 2]);
  assert.equal((await um('select count(*)::int n from app.entrega_ajustes ea join app.entregas e on e.id = ea.entrega_id where e.conversa_id = $1', [c.conversa_id])).n, 2);
});

test('corrida: a versão ou a rodada que a tela viu não batem com o banco → 40001; texto, prazo e relógio ruins → 22023', async () => {
  const c = await entregaEm(db, 'previa');
  assert.equal((await erroDe(lista(c, { versao: '2020-01-01 00:00:00+00' }))).codigo, '40001');
  assert.equal((await erroDe(lista(c, { rodada_base: 1 }))).codigo, '40001');
  for (const ruim of [{ texto: '' }, { texto: '   ' }, { texto: 'x'.repeat(1501) }, { prazo: null }, { entrega_ate: 'amanhã' }, { agora: '2020-01-01T00:00:00Z' }, { rodada_base: 'a' }]) {
    assert.equal((await erroDe(lista(c, ruim))).codigo, '22023', JSON.stringify(ruim).slice(0, 40));
  }
  assert.equal((await um('select rodadas_usadas n from app.entregas where conversa_id = $1', [c.conversa_id])).n, 0);
});

test('M3 (22/10): o WhatsApp e o e-mail do site chegam em campos PRÓPRIOS, conferidos no banco, guardados à parte do texto e só com a autorização; nada disso volta à tela nem ao funil', async () => {
  const c = await entregaEm(db, 'previa');
  const r = await lista(c, { whatsapp: '+5521977167944', email: 'contato@clinicasol.com.br', autorizacao_versao: '2026-10-22' });
  assert.deepEqual(r, { ok: true, rodada: 1 });
  const a = await um('select a.* from app.entrega_ajustes a join app.entregas e on e.id = a.entrega_id where e.conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([a.contato_whatsapp, a.contato_email, a.contato_autorizacao_versao], ['+5521977167944', 'contato@clinicasol.com.br', '2026-10-22']);
  assert.ok(a.contato_autorizado_em, 'a data da autorização é a do servidor');
  assert.equal(a.texto, 'Trocar a foto da capa e o telefone do rodapé.', 'o texto livre segue à parte, sem o contato');
  const fora = JSON.stringify([await rpc('vendas_estado', base(c)), (await um("select dados from app.eventos_funil where conversa_id = $1 and tipo = 'previa_ajustes'", [c.conversa_id])).dados]);
  assert.ok(!/5521977167944|clinicasol/.test(fora), 'o contato do site não volta à tela nem vai para o funil');
});

test('M3: só o contato do site, sem texto, é uma lista válida; sem texto e sem contato, não', async () => {
  const c = await entregaEm(db, 'previa');
  assert.equal((await erroDe(lista(c, { texto: '' }))).codigo, '22023', 'sem texto e sem contato');
  assert.equal((await lista(c, { texto: '', whatsapp: '+552133334444', autorizacao_versao: '2026-10-22' })).ok, true);
});

test('M3: WhatsApp e e-mail fora do formato (as MESMAS listas da tela e do servidor), sem a versão da autorização ou grandes demais dão 22023 e nada é gravado', async () => {
  const c = await entregaEm(db, 'previa');
  const semEspaco = v => v === v.trim();   /* (a função apara os espaços das pontas, como a tela; o formato "puro" é provado na tabela, em previa-esquema.test.mjs) */
  for (const w of WHATSAPP_RUINS.filter(semEspaco)) assert.equal((await erroDe(lista(c, { whatsapp: w, autorizacao_versao: '2026-10-22' }))).codigo, '22023', 'WhatsApp ' + JSON.stringify(w));
  for (const m of EMAIL_RUINS.filter(semEspaco)) assert.equal((await erroDe(lista(c, { email: m, autorizacao_versao: '2026-10-22' }))).codigo, '22023', 'e-mail ' + JSON.stringify(m));
  assert.equal((await erroDe(lista(c, { whatsapp: '+5521977167944' }))).codigo, '22023', 'sem a versão da autorização');
  assert.equal((await erroDe(lista(c, { email: 'contato@clinicasol.com.br', autorizacao_versao: 'x'.repeat(21) }))).codigo, '22023', 'versão grande demais');
  assert.equal((await um('select count(*)::int n from app.entrega_ajustes a join app.entregas e on e.id = a.entrega_id where e.conversa_id = $1', [c.conversa_id])).n, 0, 'nada foi gravado');
});

test('só no passo "previa": em produção, em ajustes (a 2ª batida do mesmo toque) e já aprovada, 55000', async () => {
  const c = await entregaEm(db, 'producao');
  assert.equal((await erroDe(lista(c))).codigo, '55000', 'ainda em produção: não há prévia');
  await forcarEntrega(db, c, { passo: 'previa' });
  assert.equal((await lista(c)).ok, true);
  assert.equal((await erroDe(lista(c, { rodada_base: 1 }))).codigo, '55000', 'o toque repetido não gasta a 2ª lista');
  await forcarEntrega(db, c, { passo: 'previa' }); await forcarEntrega(db, c, { passo: 'aprovada' });
  assert.equal((await erroDe(lista(c, { rodada_base: 1 }))).codigo, '55000');
});

test('só o dono da sessão (P0002) e só com o sinal pago (55000 se estornado)', async () => {
  const c = await entregaEm(db, 'previa');
  const outro = randomUUID(); await db.query('insert into auth.users (id) values ($1)', [outro]);
  assert.equal((await erroDe(lista({ ...c, visitante_id: outro }))).codigo, 'P0002');
  await db.query("update app.pagamentos set status = 'estornado' where parcela = 'sinal' and proposta_id = $1", [c.proposta]);
  assert.equal((await erroDe(lista(c))).codigo, '55000', 'o cliente que desistiu e recebeu a entrada de volta não segue mandando lista');
});

test('aprovar: só o cliente, só em "previa"; vira "aprovada" com a pausa fechada; a 2ª vez e a produção não aprovam', async () => {
  const c = await entregaEm(db, 'previa');
  const aprovar = async extra => rpc('vendas_previa_aprovar', { ...base(c), versao: await versaoDe(db, c), agora: new Date().toISOString(), prazo: PRAZO, ...extra });
  assert.deepEqual(await aprovar(), { ok: true });
  const e = await um('select passo, aprovada_em, prazo from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.equal(e.passo, 'aprovada'); assert.ok(e.aprovada_em); assert.deepEqual(e.prazo.pausas, PRAZO.pausas);
  assert.equal((await erroDe(aprovar())).codigo, '55000', 'aprovar duas vezes');
  const p = await entregaEm(db, 'producao');
  assert.equal((await erroDe(rpc('vendas_previa_aprovar', { ...base(p), versao: await versaoDe(db, p), agora: new Date().toISOString(), prazo: PRAZO }))).codigo, '55000', 'sem prévia, nada a aprovar');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'previa_aprovada'", [c.conversa_id])).n, 1);
});

test('D5: nenhum tempo aprova: com a prévia parada há 400 dias a entrega continua em "previa"', async () => {
  const c = await entregaEm(db, 'previa');
  await forcarEntrega(db, c, { previa_em: new Date(Date.now() - 400 * 864e5).toISOString() });
  await db.query("update app.entregas set updated_at = now() - interval '400 days' where conversa_id = $1", [c.conversa_id]);
  const r = await rpc('vendas_estado', base(c));   // (ler o estado, a lista de entregas e a retomada nunca mudam o passo)
  assert.equal(r.entrega.passo, 'previa');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo, 'previa');
});
