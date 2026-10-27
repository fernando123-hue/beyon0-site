/* A LIMPEZA E A RECONCILIAÇÃO (PR 3b-2; spec §7, §9, §10): reserva com menos de 24 h é poupada (1 h sobrevive, 25 h some),
   objeto sem linha, linha recusada ou removida, importado há mais de 7 dias, pedido nunca importado; o material vira "limpo"
   (campos saem, a prova da autorização fica); o alarme em 70% do balde; remoção em UM pedido; falha no armazém não marca
   nada; a rotina diária faz tudo dentro do orçamento de subpedidos.  PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';
import { limparMaterial } from '../../api/_material/limpeza.mjs';

let db, rpc;
const MB = 1024 * 1024;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
/* cada teste começa sem objetos e sem arquivo vivo de testes anteriores */
const limpo = () => db.exec("delete from storage.objects; update app.material_arquivos set status = 'removido' where status in ('reservado', 'conferido', 'recusado')");
async function entrega() { await limpo(); const c = await conversaComEntradaPaga(db); const e = await um('select id from app.entregas where conversa_id = $1', [c.conversa_id]); return { ...c, entrega: e.id }; }
let n = 0;
const caminho = e => e + '/' + '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
async function arquivo(e, { status = 'reservado', horas = 0, objeto = true, tamanho = MB } = {}) {
  const c = caminho(e.entrega);
  await db.query(`insert into app.material_arquivos (org_id, entrega_id, papel, ordem, caminho, tipo_declarado, tamanho_declarado, status, created_at)
    values ((select org_id from app.entregas where id = $1), $1, 'foto', $2, $3, 'image/jpeg', $4, $5, now() - make_interval(hours => $6))`, [e.entrega, 1 + (n % 50), c, tamanho, status, horas]);
  if (objeto) await db.query("insert into storage.objects (bucket_id, name, metadata) values ('material', $1, $2)", [c, JSON.stringify({ size: tamanho })]);
  return c;
}
const pendencias = async () => (await rpc('rotinas_material_pendencias', {})).caminhos.sort();

test('a reconciliação: reserva de 1 h é poupada, de 25 h some; objeto sem linha, recusada e removida somem; conferida fica', async () => {
  const e = await entrega();
  const poupada = await arquivo(e, { horas: 1 }), vencida = await arquivo(e, { horas: 25 }), conferida = await arquivo(e, { status: 'conferido', horas: 50 });
  const recusada = await arquivo(e, { status: 'recusado' }), removida = await arquivo(e, { status: 'removido' });
  const orfao = caminho(e.entrega); await db.query("insert into storage.objects (bucket_id, name, metadata) values ('material', $1, $2)", [orfao, JSON.stringify({ size: 5 })]);
  const semObjeto = await arquivo(e, { status: 'recusado', objeto: false });
  const lista = await pendencias();
  assert.deepEqual(lista, [vencida, recusada, removida, orfao].sort());
  for (const c of [poupada, conferida, semObjeto]) assert.ok(!lista.includes(c), 'não podia sair: ' + c);
});

test('o importado: com 6 dias ainda fica; com 8 dias os arquivos saem e o material vira "limpo" (campos fora, a autorização fica)', async () => {
  const e = await entrega();
  await db.query("update app.materiais set status = 'importado', importado_em = now() - interval '6 days', dados = '{\"whatsapp\":\"+5521999990001\"}', negocio = '{\"uf\":\"RJ\"}', autorizacao = '{\"marcada\":true,\"texto\":\"Autorizo.\"}' where entrega_id = $1", [e.entrega]);
  const a = await arquivo(e, { status: 'conferido', horas: 24 * 9 }), b = await arquivo(e, { status: 'conferido', horas: 24 * 9 });
  assert.deepEqual(await pendencias(), [], '6 dias: nada');
  await db.query("update app.materiais set importado_em = now() - interval '8 days' where entrega_id = $1", [e.entrega]);
  assert.deepEqual(await pendencias(), [a, b].sort());
  const r = await rpc('rotinas_material_baixar', { caminhos: [a, b] });
  assert.equal(r.baixados, 2); assert.equal(r.limpos, 1);
  const m = await um('select * from app.materiais where entrega_id = $1', [e.entrega]);
  assert.deepEqual([m.status, m.dados, m.negocio], ['limpo', {}, {}]);
  assert.equal(m.autorizacao.marcada, true, 'a prova da autorização fica (5 anos)');
  assert.ok(m.limpo_em && m.enviado_em !== undefined);
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'material_limpo'", [e.conversa_id])).n, 1);
  assert.deepEqual((await rpc('rotinas_material_baixar', { caminhos: [] })), { baixados: 0, limpos: 0, parados: 0 }, 'idempotente');
});

test('pedido nunca importado: 30 dias depois de concluído; encerrado, no dia seguinte', async () => {
  const lic = async (id, passo, dias) => db.transaction(async tx => {
    await tx.exec("set local bz.transicao_livre = 'on'");
    await tx.query("update app.entregas set passo = $2, updated_at = now() - make_interval(days => $3) where id = $1", [id, passo, dias]);
  });
  const e = await entrega(); await db.query("update app.materiais set status = 'enviado', enviado_em = now() where entrega_id = $1", [e.entrega]);
  const a = await arquivo(e, { status: 'conferido', horas: 24 * 40 });
  await lic(e.entrega, 'concluida', 29); assert.deepEqual(await pendencias(), []);
  await lic(e.entrega, 'concluida', 31); assert.deepEqual(await pendencias(), [a]);
  const d = await entrega(); await db.query("update app.materiais set status = 'enviado' where entrega_id = $1", [d.entrega]);
  const b = await arquivo(d, { status: 'conferido' });
  await lic(d.entrega, 'encerrada', 0); assert.deepEqual(await pendencias(), [], 'recém-encerrado: ainda não');
  await lic(d.entrega, 'encerrada', 2); assert.deepEqual(await pendencias(), [b]);
});

test('M3: sinal estornado há mais de 1 dia: o material nunca importado sai (a frase "no dia seguinte, se você desistir")', async () => {
  const e = await entrega();
  await db.query("update app.materiais set status = 'enviado' where entrega_id = $1", [e.entrega]);
  const a = await arquivo(e, { status: 'conferido' });
  /* (o carimbo de updated_at do banco volta o relógio para agora; a licença de restauração, só numa conexão SQL do dono, deixa datar o estorno) */
  const estornar = dias => db.transaction(async tx => {
    await tx.exec("set local bz.restaurando = 'on'");
    await tx.query("update app.pagamentos set status = 'estornado', updated_at = now() - make_interval(days => $2) where proposta_id = (select proposta_id from app.entregas where id = $1) and parcela = 'sinal'", [e.entrega, dias]);
  });
  await estornar(0); assert.deepEqual(await pendencias(), [], 'recém-estornado: ainda não');
  await estornar(2); assert.deepEqual(await pendencias(), [a]);
  const r = await rpc('rotinas_material_baixar', { caminhos: [a] });
  assert.ok(r.limpos >= 1, 'conta também os pedidos vencidos de testes anteriores, que dividem o banco');
  assert.equal((await um('select status from app.materiais where entrega_id = $1', [e.entrega])).status, 'limpo');
});

test('alarme do balde em 70% pelo tamanho REAL dos objetos', async () => {
  await limpo();
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('material', 'a/b', $1)", [JSON.stringify({ size: 100 * MB })]);
  assert.deepEqual([(await rpc('rotinas_material_pendencias', {})).alarme, (await rpc('rotinas_material_pendencias', {})).balde_pct], [false, 13]);
  await db.query("update storage.objects set metadata = $1 where name = 'a/b'", [JSON.stringify({ size: 600 * MB })]);
  const p = await rpc('rotinas_material_pendencias', {});
  assert.deepEqual([p.alarme, p.balde_pct], [true, 75]);
  await limpo();
});

test('os links do pedido vencidos há mais de 30 dias saem na limpeza', async () => {
  const e = await entrega();
  await db.query(`insert into app.links_pedido (org_id, conversa_id, codigo_hash, valido_ate) select org_id, conversa_id, repeat('a', 64), now() - interval '31 days' from app.entregas where id = $1`, [e.entrega]);
  await rpc('rotinas_material_baixar', { caminhos: [] });
  assert.equal((await um('select count(*)::int n from app.links_pedido where conversa_id = $1', [e.conversa_id])).n, 0);
});

test('a rotina diária: limpa o armazém dentro do orçamento de subpedidos, e o alarme do balde vira alerta (falha da rotina)', async () => {
  const { executar } = await import('../../api/rotinas.mjs');
  const e = await entrega();
  const a = await arquivo(e, { horas: 30 });
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('material', 'a/b', $1)", [JSON.stringify({ size: 600 * MB })]);
  const removidos = [];
  const CRON = 'c'.repeat(40);
  const r = await executar(new Request('http://x/api/rotinas?acao=diaria', { headers: { authorization: 'Bearer ' + CRON, 'x-forwarded-for': '203.0.113.9' } }),
    { CRON_SECRET: CRON }, { banco: rpc, armazem: { remover: async cs => { removidos.push(...cs); } }, metricas: null });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.ok(removidos.includes(a), 'apagou a reserva vencida, em um pedido só');
  assert.ok(j.material && j.material.removidos >= 1 && j.material.alarme === true);
  assert.equal(j.ok, false, 'o alarme do balde conta como falha da rotina: vira alerta no painel');
  await limpo();
});

test('limparMaterial: remove em UM pedido, depois marca; com o armazém quebrado nada é marcado (repete amanhã)', async () => {
  const e = await entrega();
  const a = await arquivo(e, { horas: 30 }), b = await arquivo(e, { horas: 40 });
  const chamadas = [];
  const armazem = { remover: async cs => { chamadas.push(cs); } };
  const banco = (nome, p) => rpc(nome, p);
  const r = await limparMaterial({ banco, armazem });
  assert.equal(chamadas.length, 1); assert.deepEqual(chamadas[0].sort(), [a, b].sort());
  assert.equal(r.removidos, 2);
  assert.equal((await um("select count(*)::int n from app.material_arquivos where entrega_id = $1 and status = 'removido'", [e.entrega])).n, 2);
  const f = await arquivo(e, { horas: 30 });
  await assert.rejects(limparMaterial({ banco, armazem: { remover: async () => { throw new Error('armazém caiu'); } } }));
  assert.equal((await um('select status from app.material_arquivos where caminho = $1', [f])).status, 'reservado', 'não marcou: a próxima rotina tenta de novo');
  const lote = await limparMaterial({ banco, armazem, lote: 1 });
  assert.equal(lote.resto, true);
});
