/* O MATERIAL no banco (PR 3b-2; spec §2, §7 e §8): salvar campo a campo, reservar com cotas (21ª foto, 31ª reserva, 150 MB,
   teto do balde pelo tamanho real), conferir só linha em "reservado" com tipo e tamanho reais, remover, enviar (passo
   material → producao), freios por hora, dono da sessão em toda ação e o passo exigido em cada uma.  PGlite real. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { novoBanco, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
const MB = 1024 * 1024;
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
/* cada teste começa com o balde vazio: as reservas abertas de testes anteriores (que contam pelo limite do papel) saem de cena */
const nova = async o => {
  await db.exec("update app.material_arquivos set status = 'removido' where status = 'reservado'");
  const c = await conversaComEntradaPaga(db, o);
  return { ...c, b: { conversa_id: c.conversa_id, visitante_id: c.visitante_id } };
};
const reservar = (c, extra = {}) => rpc('vendas_material_reservar', { ...c.b, papel: 'foto', tipo: 'image/jpeg', tamanho: 1 * MB, ...extra });
const material = async c => um('select m.* from app.materiais m join app.entregas e on e.id = m.entrega_id where e.conversa_id = $1', [c.conversa_id]);

test('salvar: campo a campo, mescla; null limpa; o número do pedido vem do contato; versão do material anda', async () => {
  const c = await nova();
  assert.deepEqual(await rpc('vendas_material_salvar', { ...c.b, dados: { servicos: [{ nome: 'Fisioterapia' }], cor: '#1a7f5a' } }), { ok: true });
  await rpc('vendas_material_salvar', { ...c.b, dados: { cor: null, bairros: ['Centro'] }, negocio: { uf: 'RJ' }, autorizacao: { fotos_com_pessoas: 'sim' } });
  const m = await material(c);
  assert.deepEqual(m.dados, { servicos: [{ nome: 'Fisioterapia' }], bairros: ['Centro'] });
  assert.deepEqual([m.negocio, m.autorizacao], [{ uf: 'RJ' }, { fotos_com_pessoas: 'sim' }]);
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'material_salvo'", [c.conversa_id])).n, 1, 'o evento é só da 1ª vez');
  const r = await rpc('vendas_material_salvar', { ...c.b, usar_numero_do_pedido: true });
  assert.equal(r.ok, true);
  assert.equal((await material(c)).dados.whatsapp, '+5521999990001');
  const sem = await nova({ telefone: '+12345678' });
  assert.deepEqual(await rpc('vendas_material_salvar', { ...sem.b, usar_numero_do_pedido: true }), { ok: false, motivo: 'numero' });
});

test('toda ação: outro visitante é P0002; conversa que não é a dele também', async () => {
  const c = await nova(), outro = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [outro]);
  for (const [fn, p] of [['vendas_material_salvar', { dados: {} }], ['vendas_material_reservar', { papel: 'foto', tipo: 'image/jpeg', tamanho: 1000 }], ['vendas_material_enviar', { versao: '2026-01-01T00:00:00Z', agora: new Date().toISOString(), prazo: {}, entrega_ate: '2026-11-01' }]])
    assert.equal((await erroDe(rpc(fn, { conversa_id: c.conversa_id, visitante_id: outro, ...p }))).codigo, 'P0002', fn);
});

test('reservar: tipo fora da lista e tamanho acima do limite do papel são 22023/recusa; SVG nunca', async () => {
  const c = await nova();
  assert.equal((await erroDe(reservar(c, { tipo: 'image/svg+xml' }))).codigo, '22023');
  assert.equal((await erroDe(reservar(c, { tipo: 'image/gif' }))).codigo, '22023');
  assert.deepEqual(await reservar(c, { tamanho: 10 * MB + 1 }), { ok: false, motivo: 'tamanho' });
  assert.deepEqual(await reservar(c, { papel: 'logo', tamanho: 5 * MB + 1 }), { ok: false, motivo: 'tamanho' });
  assert.deepEqual(await reservar(c, { tamanho: 0 }), { ok: false, motivo: 'tamanho' });
  const ok = await reservar(c, { papel: 'logo', tamanho: 5 * MB });
  assert.equal(ok.ok, true); assert.match(ok.caminho, /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  assert.equal(ok.caminho.split('/')[0], (await um('select id from app.entregas where conversa_id = $1', [c.conversa_id])).id, 'o caminho é <entrega>/<sorteio>, nunca o nome do arquivo');
  assert.deepEqual(await reservar(c, { papel: 'logo' }), { ok: false, motivo: 'logo' }, 'uma logo só');
});

test('cotas: 21ª foto, 31ª reserva, 150 MB por pedido', async () => {
  const c = await nova();
  for (let i = 0; i < 20; i++) assert.equal((await reservar(c)).ok, true, 'foto ' + (i + 1));
  assert.deepEqual(await reservar(c), { ok: false, motivo: 'fotos' });
  const d = await nova();
  for (let i = 0; i < 15; i++) assert.equal((await reservar(d, { tamanho: 10 * MB })).ok, true);   /* 150 MB */
  assert.deepEqual(await reservar(d, { tamanho: 1 }), { ok: false, motivo: 'pedido' }, '151 MB');
  const e = await nova();
  for (let i = 0; i < 20; i++) assert.equal((await reservar(e)).ok, true);
  const logo = await reservar(e, { papel: 'logo' });
  /* reservas removidas contam nas 30: 9 viram "removido" e continuam contando */
  const arqs = (await db.query("select id from app.material_arquivos where entrega_id = (select id from app.entregas where conversa_id = $1) and papel = 'foto' limit 9", [e.conversa_id])).rows;
  for (const a of arqs) await rpc('vendas_material_remover', { ...e.b, arquivo_id: a.id });
  for (let i = 0; i < 9; i++) assert.equal((await reservar(e)).ok, true, 'reserva ' + (22 + i));   /* 21..29 de fotos vivas <= 20 */
  assert.deepEqual(await reservar(e), { ok: false, motivo: 'reservas' }, 'a 31ª reserva (30 contando as removidas)');
  assert.equal(logo.ok, true);
});

test('o teto do balde conta o tamanho REAL dos objetos e as reservas abertas', async () => {
  const c = await nova();
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('material', 'x/um', $1)", [JSON.stringify({ size: 799 * MB })]);
  assert.equal((await reservar(c, { tamanho: 1 * MB })).ok, true, '799 MB + 1 MB cabe');
  assert.deepEqual(await reservar(c, { tamanho: 1 * MB }), { ok: false, motivo: 'balde' }, 'as reservas abertas contam pelo limite do papel (10 MB): passa do teto');
  await db.query("delete from storage.objects where name = 'x/um'");
  assert.equal((await reservar(c, { tamanho: 1 * MB })).ok, true);
});

test('freio por sessão: depois de 40 pedidos de reserva na hora (aceitos ou recusados), recusa', async () => {
  const c = await nova();
  for (let i = 0; i < 20; i++) await reservar(c);
  for (let i = 0; i < 20; i++) assert.deepEqual(await reservar(c), { ok: false, motivo: 'fotos' });
  assert.deepEqual(await reservar(c), { ok: false, motivo: 'freio' });
});

test('freio por IP: 60 por hora somando as sessões (a chave é o HMAC feito no servidor)', async () => {
  const chave = 'ab'.repeat(32);
  const a = await nova(), b = await nova();
  for (let i = 0; i < 30; i++) { await reservar(a, { chave_ip: chave, tamanho: 1 }); await reservar(b, { chave_ip: chave, tamanho: 1 }); }
  assert.deepEqual(await reservar(a, { chave_ip: chave }), { ok: false, motivo: 'freio' });
});

test('conferir: só linha em "reservado"; tipo e tamanho reais iguais ao declarado; senão recusa e marca', async () => {
  const c = await nova();
  const r = await reservar(c, { tamanho: 1000 });
  const arq = await rpc('vendas_material_arquivo', { ...c.b, arquivo_id: r.arquivo_id });
  assert.deepEqual([arq.caminho, arq.status, arq.tamanho_declarado, arq.tipo_declarado], [r.caminho, 'reservado', 1000, 'image/jpeg']);
  const ok = await rpc('vendas_material_conferir', { ...c.b, arquivo_id: r.arquivo_id, tipo_real: 'jpg', tamanho_real: 1000 });
  assert.deepEqual([ok.ok, ok.status], [true, 'conferido']);
  assert.deepEqual((await rpc('vendas_material_conferir', { ...c.b, arquivo_id: r.arquivo_id, tipo_real: 'jpg', tamanho_real: 1000 })).motivo, 'estado', 'conferir de novo: a linha já não está em reservado');
  const menor = await reservar(c, { tamanho: 5000 });
  const rm = await rpc('vendas_material_conferir', { ...c.b, arquivo_id: menor.arquivo_id, tipo_real: 'jpg', tamanho_real: 1 });
  assert.deepEqual([rm.ok, rm.status, rm.motivo, rm.caminho], [false, 'recusado', 'tamanho', menor.caminho], 'menor também é recusado: não se segura cota mandando 1 KB');
  const outroTipo = await reservar(c, { tamanho: 100 });
  for (const t of ['png', null, 'svg']) {
    const x = await reservar(c, { tamanho: 100 });
    const rt = await rpc('vendas_material_conferir', { ...c.b, arquivo_id: x.arquivo_id, tipo_real: t, tamanho_real: 100 });
    assert.deepEqual([rt.status, rt.motivo], ['recusado', 'tipo'], String(t));
  }
  assert.equal((await um('select status from app.material_arquivos where id = $1', [outroTipo.arquivo_id])).status, 'reservado');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'material_recusado'", [c.conversa_id])).n, 4, 'uma por tamanho e três por tipo');
});

test('remover: marca "removido" e devolve o caminho; depois de recusada ou removida a linha não volta', async () => {
  const c = await nova();
  const r = await reservar(c);
  const x = await rpc('vendas_material_remover', { ...c.b, arquivo_id: r.arquivo_id });
  assert.deepEqual([x.ok, x.caminho], [true, r.caminho]);
  assert.deepEqual(await rpc('vendas_material_remover', { ...c.b, arquivo_id: r.arquivo_id }), { ok: false });
  assert.equal((await rpc('vendas_material_conferir', { ...c.b, arquivo_id: r.arquivo_id, tipo_real: 'jpg', tamanho_real: MB })).motivo, 'estado');
});

test('B3: reserva com mais de 23 h não é conferida (a limpeza de 24 h pode estar apagando o objeto)', async () => {
  const c = await nova();
  const r = await reservar(c, { tamanho: 1000 });
  await db.query("update app.material_arquivos set created_at = now() - interval '24 hours' where id = $1", [r.arquivo_id]);
  assert.equal((await rpc('vendas_material_conferir', { ...c.b, arquivo_id: r.arquivo_id, tipo_real: 'jpg', tamanho_real: 1000 })).motivo, 'estado');
});

test('B4: o freio da conferência conta na leitura do arquivo (antes de qualquer pedido ao armazém): 60 por hora', async () => {
  const c = await nova();
  const r = await reservar(c, { tamanho: 1000 });
  for (let i = 0; i < 60; i++) assert.equal((await rpc('vendas_material_arquivo', { ...c.b, arquivo_id: r.arquivo_id })).ok, true);
  assert.deepEqual(await rpc('vendas_material_arquivo', { ...c.b, arquivo_id: r.arquivo_id }), { ok: false, motivo: 'freio' });
});

test('M3: com o sinal estornado ou contestado nenhuma ação do cliente passa (55000) e o material fica como está', async () => {
  for (const status of ['estornado', 'contestado']) {
    const c = await nova();
    await rpc('vendas_material_salvar', { ...c.b, dados: { cor: '#1a7f5a' } });
    await db.query("update app.pagamentos set status = $2 where proposta_id = $1 and parcela = 'sinal'", [c.proposta, status]);
    for (const [fn, p] of [['vendas_material_salvar', { dados: { cor: '#7a3e0b' } }], ['vendas_material_reservar', { papel: 'foto', tipo: 'image/jpeg', tamanho: 1000 }], ['vendas_material_remover', { arquivo_id: randomUUID() }]])
      assert.equal((await erroDe(rpc(fn, { ...c.b, ...p }))).codigo, '55000', status + ' ' + fn);
    assert.equal((await material(c)).dados.cor, '#1a7f5a');
  }
});

const ENVIO = async (c, extra = {}) => {
  const m = await material(c);
  return { ...c.b, versao: m.updated_at.toISOString(), agora: new Date().toISOString(), prazo: { numero_em: new Date().toISOString(), conta_desde: new Date().toISOString() }, entrega_ate: '2026-11-05', ...extra };
};
test('enviar: exige o WhatsApp e a caixa; não envia com arquivo ainda em envio; a versão velha é 40001', async () => {
  const c = await nova();
  assert.deepEqual(await rpc('vendas_material_enviar', await ENVIO(c)), { ok: false, motivo: 'faltam_campos' });
  await rpc('vendas_material_salvar', { ...c.b, dados: { whatsapp: '+5521999990001' } });
  assert.deepEqual(await rpc('vendas_material_enviar', await ENVIO(c)), { ok: false, motivo: 'faltam_campos' }, 'só o WhatsApp: falta a caixa de autorização');
  await rpc('vendas_material_salvar', { ...c.b, autorizacao: { marcada: true, texto: 'Autorizo.', versao: 'v', marcada_em: '2026-10-22T09:00:00-04:00' } });
  const r = await reservar(c);
  assert.deepEqual(await rpc('vendas_material_enviar', await ENVIO(c)), { ok: false, motivo: 'enviando' });
  await rpc('vendas_material_remover', { ...c.b, arquivo_id: r.arquivo_id });
  const velha = await ENVIO(c);
  await rpc('vendas_material_salvar', { ...c.b, dados: { cor: '#1a7f5a' } });
  assert.equal((await erroDe(rpc('vendas_material_enviar', velha))).codigo, '40001');
  assert.equal((await erroDe(rpc('vendas_material_enviar', await ENVIO(c, { agora: '2020-01-01T00:00:00Z' })))).codigo, '22023', 'o relógio do servidor manda');
});

test('enviar: o material vira "enviado", o passo vai a "producao", a data prevista fica; depois nada se salva (55000)', async () => {
  const c = await nova();
  await rpc('vendas_material_salvar', { ...c.b, dados: { whatsapp: '+5521999990001' }, autorizacao: { marcada: true, texto: 'Autorizo.', versao: 'v', marcada_em: '2026-10-22T09:00:00-04:00' } });
  const f1 = await reservar(c), f2 = await reservar(c), l = await reservar(c, { papel: 'logo' });
  for (const r of [f1, f2, l]) await rpc('vendas_material_conferir', { ...c.b, arquivo_id: r.arquivo_id, tipo_real: 'jpg', tamanho_real: MB });
  await rpc('vendas_material_remover', { ...c.b, arquivo_id: f1.arquivo_id });
  const r = await rpc('vendas_material_enviar', await ENVIO(c));
  assert.equal(r.ok, true);
  const e = await um('select * from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.passo, String(e.entrega_ate.toISOString ? e.entrega_ate.toISOString().slice(0, 10) : e.entrega_ate).slice(0, 10)], ['producao', '2026-11-05']);
  assert.ok(e.prazo.numero_em && e.prazo.conta_desde && e.prazo.entrada_em, 'as datas que contam ficam');
  assert.equal((await material(c)).status, 'enviado');
  assert.deepEqual((await db.query("select ordem from app.material_arquivos where entrega_id = $1 and papel = 'foto' and status = 'conferido'", [e.id])).rows.map(x => x.ordem), [1], 'a ordem das fotos fica compacta');
  for (const [fn, p] of [['vendas_material_salvar', { dados: { cor: '#1a7f5a' } }], ['vendas_material_reservar', { papel: 'foto', tipo: 'image/jpeg', tamanho: 1000 }], ['vendas_material_remover', { arquivo_id: f2.arquivo_id }]])
    assert.equal((await erroDe(rpc(fn, { ...c.b, ...p }))).codigo, '55000', fn + ' depois do envio');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'material_enviado'", [c.conversa_id])).n, 1);
});

test('o estado devolve o material salvo e a lista de arquivos (sem caminho), e o transporte de produção só leva o SQLSTATE', async () => {
  const c = await nova();
  await rpc('vendas_material_salvar', { ...c.b, dados: { bairros: ['Centro'] } });
  const r = await reservar(c);
  const est = await rpc('vendas_estado', c.b);
  assert.deepEqual(est.entrega.material.dados, { bairros: ['Centro'] });
  assert.deepEqual(est.entrega.material.arquivos.map(a => [a.id, a.papel, a.status]), [[r.arquivo_id, 'foto', 'reservado']]);
  assert.ok(!JSON.stringify(est.entrega).includes(r.caminho), 'o caminho do balde nunca vai ao navegador');
});
