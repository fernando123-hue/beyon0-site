/* O LINK DO PEDIDO no banco (PR 3b-2; spec §1, §2 e §8; achado R2-1): fixo durante o pedido (usar NÃO revoga), troca só
   em "Gerar um link novo" e "Sair deste aparelho", um vivo por conversa, só o hash, 3 por dia, o aparelho antigo perde o
   acesso ao abrir pelo link, e "outro aparelho" é a retomada de 7 dias de uso único.  PGlite real. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { novoBanco, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
const hex = s => createHash('sha256').update(String(s)).digest('hex');
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const novoVisitante = async () => { const v = randomUUID(); await db.query('insert into auth.users (id) values ($1)', [v]); return v; };
const criar = (c, codigo, extra = {}) => rpc('vendas_link_pedido_criar', { conversa_id: c.conversa_id, visitante_id: c.visitante_id, codigo_hash: hex(codigo), ...extra });
const usar = async (codigo, extra = {}) => { const v = await novoVisitante(); return { v, r: await rpc('vendas_link_pedido_usar', { org_slug: 'beyon-zero', codigo_hash: hex(codigo), visitante_id: v, ...extra }) }; };

test('criar: o primeiro cria (só o hash fica); pedir de novo devolve o que existe SEM trocar e sem gastar a cota', async () => {
  const c = await conversaComEntradaPaga(db);
  const a = await criar(c, 'A1');
  assert.deepEqual([a.ok, a.criado], [true, true]);
  const linha = await um('select * from app.links_pedido where conversa_id = $1', [c.conversa_id]);
  assert.equal(linha.codigo_hash, hex('A1')); assert.ok(!JSON.stringify(linha).includes('A1'));
  assert.ok(linha.valido_ate > new Date(Date.now() + 100 * 864e5), 'vale por um pedido inteiro (120 dias)');
  for (let i = 0; i < 6; i++) assert.deepEqual([(await criar(c, 'OUTRO' + i)).ok, (await criar(c, 'OUTRO' + i)).criado], [true, false]);
  assert.equal((await um('select codigo_hash from app.links_pedido where conversa_id = $1 and revogado_em is null', [c.conversa_id])).codigo_hash, hex('A1'), 'o link não mudou');
});

test('R2-1: usar NÃO revoga: o mesmo link abre várias vezes, em aparelhos diferentes; o aparelho de antes perde o acesso', async () => {
  const c = await conversaComEntradaPaga(db);
  await criar(c, 'FIXO');
  const u1 = await usar('FIXO'), u2 = await usar('FIXO'), u3 = await usar('FIXO');
  for (const u of [u1, u2, u3]) assert.deepEqual([u.r.ok, u.r.conversa_id], [true, c.conversa_id]);
  assert.equal((await um('select revogado_em from app.links_pedido where conversa_id = $1', [c.conversa_id])).revogado_em, null, 'nunca revogado pelo uso');
  assert.ok((await um('select ultimo_uso_em from app.links_pedido where conversa_id = $1', [c.conversa_id])).ultimo_uso_em);
  assert.equal((await um('select visitante_id from app.conversas where id = $1', [c.conversa_id])).visitante_id, u3.v, 'a conversa é do último aparelho');
  assert.equal((await erroDe(rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: c.visitante_id }))).codigo, 'P0002', 'o aparelho antigo perde o acesso');
  assert.equal((await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: u3.v })).entrega.passo, 'material');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'link_pedido_usado'", [c.conversa_id])).n, 3);
});

test('B5: cada uso do link renova a validade (janela deslizante); o pedido parado na prévia não perde o link', async () => {
  const c = await conversaComEntradaPaga(db);
  await criar(c, 'DESLIZA');
  await db.query("update app.links_pedido set valido_ate = now() + interval '3 days' where codigo_hash = $1", [hex('DESLIZA')]);
  assert.equal((await usar('DESLIZA')).r.ok, true);
  assert.ok((await um('select valido_ate from app.links_pedido where codigo_hash = $1', [hex('DESLIZA')])).valido_ate > new Date(Date.now() + 100 * 864e5), 'voltou a valer uns 120 dias');
});

test('M3: com o sinal estornado ou contestado, criar link e pedir outro aparelho dão 55000 (o link já guardado ainda abre, só leitura)', async () => {
  for (const status of ['estornado', 'contestado']) {
    const c = await conversaComEntradaPaga(db);
    await criar(c, 'ANTES' + status);
    await db.query("update app.pagamentos set status = $2 where proposta_id = $1 and parcela = 'sinal'", [c.proposta, status]);
    assert.equal((await erroDe(criar(c, 'DEPOIS' + status, { forcar: true }))).codigo, '55000', status + ' criar');
    assert.equal((await erroDe(rpc('vendas_retomada_do_cliente', { conversa_id: c.conversa_id, visitante_id: c.visitante_id, codigo_hash: hex('R' + status) }))).codigo, '55000', status + ' outro aparelho');
    assert.equal((await usar('ANTES' + status)).r.ok, true, status + ': o link guardado abre a página (as ações é que estão fechadas)');
  }
});

test('"Gerar um link novo" revoga o anterior (e só ele); no máximo 3 por dia', async () => {
  const c = await conversaComEntradaPaga(db);
  await criar(c, 'V1');
  const novo = await criar(c, 'V2', { forcar: true });
  assert.deepEqual([novo.ok, novo.criado], [true, true]);
  assert.equal((await usar('V1')).r.ok, false, 'o anterior parou de valer');
  assert.equal((await usar('V2')).r.ok, true);
  assert.equal((await um("select motivo_revogacao from app.links_pedido where codigo_hash = $1", [hex('V1')])).motivo_revogacao, 'novo_a_pedido');
  assert.equal((await um('select count(*)::int n from app.links_pedido where conversa_id = $1 and revogado_em is null', [c.conversa_id])).n, 1, 'um vivo por conversa');
  const atual = (await um('select visitante_id from app.conversas where id = $1', [c.conversa_id])).visitante_id;   /* (os usar() acima levaram a conversa para outro aparelho) */
  const cc = { conversa_id: c.conversa_id, visitante_id: atual };
  assert.equal((await criar(cc, 'V3', { forcar: true })).criado, true);
  assert.deepEqual(await criar(cc, 'V4', { forcar: true }), { ok: false, motivo: 'freio' }, 'a 4ª criação do dia');
});

test('"Sair deste aparelho" revoga o link; link vencido não abre e permite criar outro; link sem pedido pago, não', async () => {
  const c = await conversaComEntradaPaga(db);
  await criar(c, 'S1');
  const s = await rpc('vendas_link_pedido_sair', { conversa_id: c.conversa_id, visitante_id: c.visitante_id });
  assert.deepEqual([s.ok, s.revogados], [true, 1]);
  assert.equal((await usar('S1')).r.ok, false);
  assert.equal((await um('select motivo_revogacao from app.links_pedido where codigo_hash = $1', [hex('S1')])).motivo_revogacao, 'sair_do_aparelho');
  const d = await conversaComEntradaPaga(db);
  await criar(d, 'E1');
  await db.query("update app.links_pedido set valido_ate = now() - interval '1 minute' where codigo_hash = $1", [hex('E1')]);
  assert.equal((await usar('E1')).r.ok, false, 'vencido');
  assert.equal((await criar(d, 'E2')).criado, true, 'o vencido não segura o lugar');
  const antes = await conversaComEntradaPaga(db, { semPagar: true });
  assert.equal((await erroDe(criar(antes, 'X1'))).codigo, '55000');
});

test('o dono da sessão: outro visitante é P0002 em criar, sair e outro aparelho; hash malformado é 22023/recusa', async () => {
  const c = await conversaComEntradaPaga(db), outro = await novoVisitante();
  for (const fn of ['vendas_link_pedido_criar', 'vendas_link_pedido_sair', 'vendas_retomada_do_cliente'])
    assert.equal((await erroDe(rpc(fn, { conversa_id: c.conversa_id, visitante_id: outro, codigo_hash: hex('Z') }))).codigo, 'P0002', fn);
  assert.equal(await erroDe(criar(c, 'W')), null, 'o dono da sessão cria sem erro');
  assert.equal((await erroDe(rpc('vendas_link_pedido_criar', { conversa_id: c.conversa_id, visitante_id: c.visitante_id, codigo_hash: 'curto' }))).codigo, '22023');
  assert.deepEqual((await usar('nunca-existiu')).r, { ok: false });
  assert.deepEqual((await rpc('vendas_link_pedido_usar', { org_slug: 'beyon-zero', codigo_hash: 'curto', visitante_id: await novoVisitante() })), { ok: false });
});

test('freio por IP ao abrir: 30 por hora com a mesma chave (o HMAC do servidor)', async () => {
  const chave = 'cd'.repeat(32);
  let ultimo;
  for (let i = 0; i < 31; i++) ultimo = (await usar('nunca-existe-' + i, { chave_ip: chave })).r;
  assert.deepEqual(ultimo, { ok: false, motivo: 'freio' });
});

test('outro aparelho: a retomada de 7 dias, uso único (a do PR 2b-2), 3 por dia', async () => {
  const c = await conversaComEntradaPaga(db);
  const r = await rpc('vendas_retomada_do_cliente', { conversa_id: c.conversa_id, visitante_id: c.visitante_id, codigo_hash: hex('R1') });
  assert.equal(r.ok, true);
  assert.ok(new Date(r.expira_em) > new Date(Date.now() + 6 * 864e5) && new Date(r.expira_em) < new Date(Date.now() + 8 * 864e5));
  const v = await novoVisitante();
  assert.equal((await rpc('vendas_usar_retomada', { org_slug: 'beyon-zero', codigo_hash: hex('R1'), visitante_id: v })).ok, true);
  assert.equal((await rpc('vendas_usar_retomada', { org_slug: 'beyon-zero', codigo_hash: hex('R1'), visitante_id: await novoVisitante() })).ok, false, 'uso único');
  const atual = { conversa_id: c.conversa_id, visitante_id: v };
  await rpc('vendas_retomada_do_cliente', { ...atual, codigo_hash: hex('R2') }); await rpc('vendas_retomada_do_cliente', { ...atual, codigo_hash: hex('R3') });
  assert.deepEqual(await rpc('vendas_retomada_do_cliente', { ...atual, codigo_hash: hex('R4') }), { ok: false, motivo: 'freio' });
});

test('encerrar_links_do_pedido (para a 3b-3): o link passa a valer só mais N dias', async () => {
  const c = await conversaComEntradaPaga(db);
  await criar(c, 'F1');
  await db.query('select privado.encerrar_links_do_pedido($1, 30)', [c.conversa_id]);
  const linha = await um('select valido_ate from app.links_pedido where conversa_id = $1', [c.conversa_id]);
  assert.ok(linha.valido_ate < new Date(Date.now() + 31 * 864e5) && linha.valido_ate > new Date(Date.now() + 29 * 864e5));
});

test('M5 (revisão): depois de encerrar_links_do_pedido o uso NÃO renova a validade (o fim de 30 dias vale mesmo com o link usado)', async () => {
  const c = await conversaComEntradaPaga(db);
  await criar(c, 'FIM1');
  await db.query('select privado.encerrar_links_do_pedido($1, 30)', [c.conversa_id]);
  const antes = (await um('select valido_ate, fim_em from app.links_pedido where conversa_id = $1', [c.conversa_id]));
  assert.ok(antes.fim_em, 'a marca de fim fica registrada');
  for (let i = 0; i < 2; i++) assert.equal((await usar('FIM1')).r.ok, true, 'ainda abre (leitura) dentro dos 30 dias');
  const depois = (await um('select valido_ate from app.links_pedido where conversa_id = $1', [c.conversa_id])).valido_ate;
  assert.equal(depois.getTime(), antes.valido_ate.getTime(), 'usar não estende o prazo do fim');
  assert.ok(depois < new Date(Date.now() + 31 * 864e5), 'continua em ~30 dias, não em 120');
  await db.query("update app.links_pedido set valido_ate = now() - interval '1 minute' where conversa_id = $1", [c.conversa_id]);
  assert.equal((await usar('FIM1')).r.ok, false, 'passados os 30 dias o link morre');
});
