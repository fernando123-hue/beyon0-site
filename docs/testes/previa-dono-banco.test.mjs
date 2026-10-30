/* AS AÇÕES DO DONO (PR 3b-3; spec §2, §5, §6; D1, D4, D5): publicar a prévia (só do projeto desta entrega), pôr no ar (SÓ depois de o cliente aprovar),
   suspender (só 4 dias depois do aviso "no ar", ou seja, à 00:00 depois do 3º dia), encerrar (lista fechada de motivos; nunca por silêncio, D5, nem por falta de material, 22/10), dispensar o material (só com o número AUTORIZADO, resposta 3 da
   captação), os avisos da D1 (inclusive o de material parado e os 2 lembretes do restante).  Postgres real (PGlite).  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, forcarEntrega, codigoDe, versaoDe, CLIENTE, PREVIA, SITE } from './_previa.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const dono = async (nome, c, extra = {}) => rpc(nome, { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), ...extra });
const comVersao = async (nome, c, extra = {}) => dono(nome, c, { versao: await versaoDe(db, c), agora: new Date().toISOString(), ...extra });
const PRAZO = { numero_em: '2026-10-21T13:00:00-04:00', conta_desde: '2026-10-21T13:00:00-04:00', pausas: [{ desde: '2026-10-22T09:00:00-04:00', ate: null }] };
const passoDe = async c => (await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo;
const diasAtras = n => new Date(Date.now() - n * 864e5).toISOString();
/* o instante em Campo Grande: o início do dia de HOJE menos `dias` dias, mais `hora` (HH:MM). Calculado no banco, com o mesmo relógio e o mesmo fuso que as funções usam */
const cg = async (dias, hora) => new Date(1000 * Number((await um("select extract(epoch from (date_trunc('day', now() at time zone 'America/Campo_Grande') - make_interval(days => $1::int) + $2::interval) at time zone 'America/Campo_Grande') as t", [dias, hora])).t)).toISOString();
const prazoEm = iso => ({ entrada_em: iso, numero_em: iso, conta_desde: iso, pausas: [] });
const prazoDe = n => ({ entrada_em: diasAtras(n), numero_em: diasAtras(n), conta_desde: diasAtras(n), pausas: [] });   /* a entrada paga há n dias */

test('publicar a prévia: producao → previa, com o endereço do PROJETO desta entrega, a pausa aberta e o aviso da D1 pendente', async () => {
  const c = await entregaEm(db, 'producao');
  const r = await comVersao('vendas_previa_publicar', c, { url: PREVIA, prazo: PRAZO });
  assert.deepEqual(r, { ok: true });
  const e = await um('select * from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.passo, e.previa_url], ['previa', PREVIA]);
  assert.ok(e.previa_em && e.aviso_previa_desde, 'o aviso da D1 ficou pendente');
  assert.equal(e.prazo.pausas[0].ate, null, 'a pausa do prazo está aberta (esperando a lista)');
});

test('publicar recusa: endereço de outro projeto ou fora do padrão, pedido ainda não importado, passo errado, versão velha', async () => {
  const c = await entregaEm(db, 'producao');
  for (const url of ['https://v1.bz-c-zzzzz2.pages.dev', 'https://evil.pages.dev', 'http://v1.bz-' + CLIENTE + '.pages.dev']) {
    assert.deepEqual(await comVersao('vendas_previa_publicar', c, { url, prazo: PRAZO }), { ok: false, motivo: 'endereco' }, url);
  }
  assert.equal((await erroDe(comVersao('vendas_previa_publicar', c, { url: PREVIA, prazo: PRAZO, versao: '2020-01-01 00:00:00+00' }))).codigo, '40001');
  await forcarEntrega(db, c, { cliente_captacao: null });
  assert.deepEqual(await comVersao('vendas_previa_publicar', c, { url: PREVIA, prazo: PRAZO }), { ok: false, motivo: 'sem_importado' });
  const m = await entregaEm(db, 'material');
  assert.equal((await erroDe(comVersao('vendas_previa_publicar', m, { url: PREVIA, prazo: PRAZO }))).codigo, '55000', 'o material ainda nem chegou à produção');
  assert.equal((await erroDe(rpc('vendas_previa_publicar', { org_slug: 'beyon-zero', codigo: 'BZ-33333', url: PREVIA, prazo: PRAZO, versao: 'x', agora: new Date().toISOString() }))).codigo, 'P0002');
});

test('uma nova prévia depois da lista: ajustes → previa, a lista vira "feito" e o aviso volta a ficar pendente', async () => {
  const c = await entregaEm(db, 'ajustes');
  const e0 = await um('select id, org_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  await db.query("insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto) values ($1, $2, 1, 'Trocar a foto.')", [e0.org_id, e0.id]);
  assert.deepEqual(await comVersao('vendas_previa_publicar', c, { url: 'https://v2.bz-' + CLIENTE + '.pages.dev', prazo: PRAZO }), { ok: true });
  assert.equal(await passoDe(c), 'previa');
  assert.equal((await um('select status from app.entrega_ajustes where entrega_id = $1', [e0.id])).status, 'feito');
  assert.ok((await um('select aviso_previa_desde d from app.entregas where id = $1', [e0.id])).d);
});

test('pôr no ar: SÓ depois de o cliente aprovar (D5: o dono não publica uma prévia sem resposta)', async () => {
  const previa = await entregaEm(db, 'previa');
  assert.equal((await erroDe(comVersao('vendas_no_ar', previa, { url: SITE }))).codigo, '55000', 'prévia sem resposta: o projeto para, não publica');
  const c = await entregaEm(db, 'aprovada');
  assert.deepEqual(await comVersao('vendas_no_ar', c, { url: 'https://evil.com/caminho?x=1' }), { ok: false, motivo: 'endereco' });
  for (const ruim of ['https://localhost', 'https://127.0.0.1', 'https://10.0.0.5/', 'https://intranet', 'https://clinicasol.1']) assert.deepEqual(await comVersao('vendas_no_ar', c, { url: ruim }), { ok: false, motivo: 'endereco' }, 'B4: ' + ruim);
  assert.deepEqual(await comVersao('vendas_no_ar', c, { url: SITE }), { ok: true });
  const e = await um('select * from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.passo, e.site_url], ['no_ar', SITE]); assert.ok(e.no_ar_em && e.aviso_no_ar_desde);
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'site_no_ar'", [c.conversa_id])).n, 1);
});

test('suspender (D4, 22/10): só depois do 3º dia do aviso "no ar" (4 dias corridos desde o REGISTRO, à 00:00); sem o aviso registrado ou antes disso, não; só em no_ar', async () => {
  const c = await entregaEm(db, 'no_ar');
  assert.deepEqual(await dono('vendas_suspender', c), { ok: false, motivo: 'sem_aviso' }, 'a contagem dos 3 dias só começa com o REGISTRO do aviso "no ar"');
  assert.deepEqual(await dono('vendas_aviso_feito', c, { momento: 'no_ar' }), { ok: true });
  assert.deepEqual(await dono('vendas_suspender', c), { ok: false, motivo: 'cedo', dias: 0 });
  for (const n of [1, 2, 3]) {
    await forcarEntrega(db, c, { aviso_no_ar_feito_em: diasAtras(n) });
    assert.equal((await dono('vendas_suspender', c)).motivo, 'cedo', n + ' dia(s) desde o aviso: ainda dentro dos 3 dias');
  }
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: diasAtras(4) });
  assert.deepEqual(await dono('vendas_suspender', c), { ok: true, lembretes: 0 }, '4 dias: passou da 00:00 depois do 3º dia; nenhum lembrete registrado (só avisa, não trava)');
  const e = await um('select passo, suspensa_em from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.equal(e.passo, 'suspensa'); assert.ok(e.suspensa_em);
  assert.equal((await erroDe(dono('vendas_suspender', c))).codigo, '55000', 'já suspensa');
  const previa = await entregaEm(db, 'previa');
  assert.equal((await erroDe(dono('vendas_suspender', previa))).codigo, '55000');
});

test('encerrar: motivo da lista fechada (nunca "sem resposta", D5); encerra a conversa, cancela o projeto e limita o link do pedido a 30 dias', async () => {
  const c = await entregaEm(db, 'previa');
  const ent = await um('select org_id, proposta_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  await db.query("insert into app.links_pedido (org_id, conversa_id, codigo_hash, valido_ate) values ($1, $2, repeat('a', 64), now() + interval '120 days')", [ent.org_id, c.conversa_id]);
  for (const ruim of ['sem_resposta', 'silencio', 'previa_parada', 'sem_material', '', null]) {
    assert.equal((await erroDe(dono('vendas_encerrar', c, { motivo: ruim }))).codigo, '22023', String(ruim));
  }
  assert.equal(await passoDe(c), 'previa', 'a prévia continua parada: nenhum motivo de silêncio encerra');
  assert.deepEqual(await dono('vendas_encerrar', c, { motivo: 'desistencia' }), { ok: true });
  const e = await um('select passo, encerrada_motivo, encerrada_em from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.passo, e.encerrada_motivo], ['encerrada', 'desistencia']); assert.ok(e.encerrada_em);
  assert.equal((await um('select etapa from app.conversas where id = $1', [c.conversa_id])).etapa, 'encerrada');
  assert.equal((await um('select p.status from app.projetos p join app.propostas pr on pr.projeto_id = p.id where pr.id = $1', [ent.proposta_id])).status, 'cancelado', 'o projeto foi cancelado');
  const l = await um("select valido_ate < now() + interval '31 days' as curto, fim_em is not null as fim from app.links_pedido where conversa_id = $1", [c.conversa_id]);
  assert.deepEqual([l.curto, l.fim], [true, true], 'o link do pedido passa a valer só mais 30 dias');
  assert.equal((await erroDe(dono('vendas_encerrar', c, { motivo: 'outro' }))).codigo, '55000', 'não encerra de novo');
});

test('encerrar: concluída não encerra; e NÃO existe encerrar por falta de material (22/10): o pedido sem material fica PARADO', async () => {
  const feita = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, feita, { passo: 'concluida' });
  assert.equal((await erroDe(dono('vendas_encerrar', feita, { motivo: 'outro' }))).codigo, '55000');
  const m = await entregaEm(db, 'material');
  await forcarEntrega(db, m, { prazo: JSON.stringify(prazoDe(400)), aviso_material_em: diasAtras(370) });
  assert.equal((await erroDe(dono('vendas_encerrar', m, { motivo: 'sem_material' }))).codigo, '22023', 'o motivo não existe, nem 370 dias depois do aviso de material parado');
  assert.equal(await passoDe(m), 'material', 'o projeto continua parado esperando o cliente: nada o encerra, nada o publica');
});

test('dispensar o material (dia 30, só com a AUTORIZAÇÃO EXPRESSA do cliente): precisa de 30 dias, do WhatsApp, da caixa MARCADA e da UF; vira producao com o prazo contado de agora; sem autorização, nada é publicado', async () => {
  const c = await entregaEm(db, 'material');
  const dispensar = extra => comVersao('vendas_material_dispensar', c, { prazo: { numero_em: new Date().toISOString(), conta_desde: new Date().toISOString(), pausas: [] }, entrega_ate: '2026-12-10', ...extra });
  await forcarEntrega(db, c, { prazo: JSON.stringify(prazoDe(10)) });
  assert.equal((await dispensar()).motivo, 'cedo', '10 dias');
  await forcarEntrega(db, c, { prazo: JSON.stringify(prazoDe(31)) });
  await db.query("update app.materiais m set autorizacao = '{}' from app.entregas e where e.id = m.entrega_id and e.conversa_id = $1", [c.conversa_id]);
  assert.deepEqual(await dispensar(), { ok: false, motivo: 'sem_numero' }, 'WhatsApp salvo SEM a caixa não é número autorizado (captação, resposta 3)');
  await db.query("update app.materiais m set autorizacao = '{\"marcada\":true,\"texto\":\"Autorizo.\",\"versao\":1}', negocio = '{}' from app.entregas e where e.id = m.entrega_id and e.conversa_id = $1", [c.conversa_id]);
  assert.equal((await dispensar()).motivo, 'sem_numero', 'sem a UF o pacote não monta');
  await db.query("update app.materiais m set negocio = '{\"uf\":\"RJ\"}' from app.entregas e where e.id = m.entrega_id and e.conversa_id = $1", [c.conversa_id]);
  assert.deepEqual(await dispensar(), { ok: true });
  const e = await um("select e.passo, to_char(e.entrega_ate, 'YYYY-MM-DD') as ate, m.status, m.dispensado_em, m.enviado_em from app.entregas e join app.materiais m on m.entrega_id = e.id where e.conversa_id = $1", [c.conversa_id]);
  assert.equal(e.passo, 'producao'); assert.equal(e.status, 'enviado'); assert.ok(e.dispensado_em && e.enviado_em);
  assert.equal(e.ate, '2026-12-10');
});

test('os avisos da D1: a lista traz o contato e o momento; "já avisei" tira; o aviso da prévia some se o cliente já respondeu', async () => {
  const c = await entregaEm(db, 'producao');
  await comVersao('vendas_previa_publicar', c, { url: PREVIA, prazo: PRAZO });
  const antes = (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.find(i => i.conversa_id === c.conversa_id);
  assert.equal(antes.momento, 'previa'); assert.equal(antes.contato.nome, 'Ana Souza'); assert.ok(antes.codigo.startsWith('BZ-'));
  assert.deepEqual(await dono('vendas_aviso_feito', c, { momento: 'previa' }), { ok: true });
  assert.ok(!(await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.some(i => i.conversa_id === c.conversa_id));
  const d = await entregaEm(db, 'previa');
  await forcarEntrega(db, d, { aviso_previa_desde: new Date().toISOString() });
  await forcarEntrega(db, d, { passo: 'aprovada' });
  assert.ok(!(await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.some(i => i.conversa_id === d.conversa_id), 'já aprovou: o aviso perdeu o sentido');
  assert.equal((await erroDe(dono('vendas_aviso_feito', c, { momento: 'qualquer' }))).codigo, '22023');
});

test('A1 (+ 22/10): o aviso de material parado só vale a partir do dia 30 depois da entrada e só SEM número autorizado (a captação: producao.mjs:118); registrado uma vez; e o projeto continua PARADO (sem encerrar, sem publicar)', async () => {
  const m = await entregaEm(db, 'material');   /* (o helper deixa WhatsApp + caixa + UF: número AUTORIZADO) */
  const parado = () => dono('vendas_aviso_feito', m, { momento: 'material_parado' });
  const gravado = async () => (await um('select aviso_material_em u from app.entregas where conversa_id = $1', [m.conversa_id])).u;
  await forcarEntrega(db, m, { prazo: JSON.stringify(prazoDe(10)) });
  assert.deepEqual(await parado(), { ok: false, motivo: 'cedo', dias: 10 }, 'no dia 10 não há aviso de material parado (a captação: só a partir do dia 30 depois da entrada)');
  assert.equal(await gravado(), null, 'nada foi gravado');
  await forcarEntrega(db, m, { prazo: JSON.stringify(prazoDe(29)) });
  assert.equal((await parado()).motivo, 'cedo', 'no dia 29 ainda não');
  await forcarEntrega(db, m, { prazo: JSON.stringify(prazoDe(31)) });
  assert.deepEqual(await parado(), { ok: false, motivo: 'dispensar' }, 'com o número autorizado o caminho é dispensar, não o aviso de material parado');
  await db.query("update app.materiais mt set autorizacao = '{}' from app.entregas e where e.id = mt.entrega_id and e.conversa_id = $1", [m.conversa_id]);
  assert.deepEqual(await parado(), { ok: true });
  assert.ok(await gravado());
  assert.deepEqual(await parado(), { ok: false, motivo: 'ja' });
  assert.equal(await passoDe(m), 'material', 'o aviso não encerra nem publica nada: o projeto fica parado até o cliente mandar o material');
  const c = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, c, { passo: 'concluida', religar_pendente: true });
  assert.deepEqual(await dono('vendas_religado', c), { ok: true });
  assert.equal((await um('select religar_pendente r from app.entregas where conversa_id = $1', [c.conversa_id])).r, false);
  const ainda = await entregaEm(db, 'no_ar');
  assert.equal((await erroDe(dono('vendas_religado', ainda))).codigo, '55000');
  assert.deepEqual(await dono('vendas_aviso_feito', ainda, { momento: 'material_parado' }), { ok: false, motivo: 'estado' }, 'fora do passo material a recusa é de estado, não "já avisado"');
});

test('22/10: o aviso "no ar" registrado dá a data de partida dos 3 dias; os 2 lembretes só valem no 2º e no 3º dia, uma vez cada; a lista de avisos mostra o que está devido', async () => {
  const c = await entregaEm(db, 'no_ar');
  const aviso = momento => dono('vendas_aviso_feito', c, { momento });
  const gravado = async col => (await um(`select ${col} v from app.entregas where conversa_id = $1`, [c.conversa_id])).v;
  assert.deepEqual(await aviso('restante_lembrete_1'), { ok: false, motivo: 'sem_aviso' }, 'sem o aviso "no ar" registrado, não há lembrete');
  assert.deepEqual(await aviso('no_ar'), { ok: true });
  assert.ok(await gravado('aviso_no_ar_feito_em'), 'o registro do aviso "no ar" é a data de partida');
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: diasAtras(1) });
  const inicio = (await gravado('aviso_no_ar_feito_em')).getTime();
  assert.deepEqual(await aviso('no_ar'), { ok: true });
  assert.equal((await gravado('aviso_no_ar_feito_em')).getTime(), inicio, 'registrar de novo não adia o prazo do cliente');
  assert.deepEqual(await aviso('restante_lembrete_1'), { ok: false, motivo: 'cedo', dias: 1 });
  const devidos = async () => (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(i => i.conversa_id === c.conversa_id).map(i => i.momento);
  assert.deepEqual(await devidos(), [], 'no dia 0 e no dia 1 não há lembrete devido');
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: diasAtras(2) });
  assert.deepEqual(await devidos(), ['restante_lembrete_1'], 'no 2º dia: o primeiro lembrete');
  assert.deepEqual(await aviso('restante_lembrete_2'), { ok: false, motivo: 'cedo', dias: 2 }, 'o último lembrete é do 3º dia');
  assert.deepEqual(await aviso('restante_lembrete_1'), { ok: true });
  assert.deepEqual(await aviso('restante_lembrete_1'), { ok: false, motivo: 'ja' });
  assert.deepEqual(await devidos(), []);
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: diasAtras(3) });
  assert.deepEqual(await devidos(), ['restante_lembrete_2'], 'no 3º dia: o último lembrete');
  assert.deepEqual(await aviso('restante_lembrete_2'), { ok: true });
  assert.deepEqual(await devidos(), []);
  assert.equal((await dono('vendas_suspender', c)).motivo, 'cedo', 'o 3º dia ainda não tira o site do ar: só à 00:00 do dia seguinte');
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: diasAtras(4) });
  assert.deepEqual(await dono('vendas_suspender', c), { ok: true, lembretes: 2 });
  const prev = await entregaEm(db, 'previa');
  assert.deepEqual(await dono('vendas_aviso_feito', prev, { momento: 'restante_lembrete_1' }), { ok: false, motivo: 'fora_do_ar' });
});

test('28/10: a fila de avisos traz o passo da entrega, e o aviso "no ar" só vale com o site no ar (suspensa, encerrada e concluída não oferecem "O seu site está no ar!")', async () => {
  const fila = async c => (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(i => i.conversa_id === c.conversa_id);
  const c = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, c, { aviso_no_ar_desde: new Date().toISOString() });
  const [item] = await fila(c);
  assert.deepEqual([item.momento, item.passo], ['no_ar', 'no_ar'], 'no ar de verdade: o aviso vale e a fila diz o passo');
  for (const passo of ['suspensa', 'encerrada', 'concluida']) {
    await forcarEntrega(db, c, { passo });
    assert.deepEqual(await fila(c), [], 'passo ' + passo + ' com o aviso pendente: o site NÃO está no ar, a mensagem "no ar" não pode ser oferecida');
  }
  await forcarEntrega(db, c, { passo: 'no_ar' });
  assert.equal((await fila(c)).length, 1, 'de volta ao ar, o aviso pendente volta à fila');
  const previa = await entregaEm(db, 'previa');
  await forcarEntrega(db, previa, { aviso_previa_desde: new Date().toISOString() });
  assert.deepEqual((await fila(previa)).map(i => [i.momento, i.passo]), [['previa', 'previa']]);
  const parado = await entregaEm(db, 'material');
  await db.query("update app.materiais mt set autorizacao = '{}' from app.entregas e where e.id = mt.entrega_id and e.conversa_id = $1", [parado.conversa_id]);
  await forcarEntrega(db, parado, { prazo: JSON.stringify(prazoDe(31)) });
  assert.deepEqual((await fila(parado)).map(i => [i.momento, i.passo]), [['material_parado', 'material']]);
  const lembrete = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, lembrete, { aviso_no_ar_feito_em: diasAtras(2) });
  assert.deepEqual((await fila(lembrete)).map(i => [i.momento, i.passo]), [['restante_lembrete_1', 'no_ar']]);
});

test('22/10: o aviso de material parado entra na fila de avisos no dia 30 (só sem número autorizado) e sai quando o dono registra', async () => {
  const m = await entregaEm(db, 'material');
  const na = async c => (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(i => i.conversa_id === c.conversa_id).map(i => i.momento);
  await db.query("update app.materiais mt set autorizacao = '{}' from app.entregas e where e.id = mt.entrega_id and e.conversa_id = $1", [m.conversa_id]);
  await forcarEntrega(db, m, { prazo: JSON.stringify(prazoDe(20)) });
  assert.deepEqual(await na(m), [], 'dia 20: cedo');
  await forcarEntrega(db, m, { prazo: JSON.stringify(prazoDe(31)) });
  assert.deepEqual(await na(m), ['material_parado']);
  assert.deepEqual(await dono('vendas_aviso_feito', m, { momento: 'material_parado' }), { ok: true });
  assert.deepEqual(await na(m), [], 'registrado, sai da fila: o projeto só espera, sem alarme nem aviso diário');
  const a = await entregaEm(db, 'material');   /* com o número AUTORIZADO o caminho é dispensar, não o aviso */
  await forcarEntrega(db, a, { prazo: JSON.stringify(prazoDe(31)) });
  assert.deepEqual(await na(a), []);
});

test('a lista do painel e a lista de ajustes: campos novos; a concluída com religação pendente continua à vista; o texto da lista chega como DADO', async () => {
  const c = await entregaEm(db, 'ajustes');
  const e = await um('select id, org_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  await db.query("insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto, contato_whatsapp, contato_autorizado_em, contato_autorizacao_versao) values ($1, $2, 1, 'Trocar a foto da capa.', '+5521977167944', now(), '2026-10-22')", [e.org_id, e.id]);
  const cod = await codigoDe(db, c);
  const item = (await rpc('vendas_entregas_lista', { org_slug: 'beyon-zero' })).itens.find(i => i.codigo === cod);
  assert.deepEqual([item.passo, item.rodadas, item.ajustes_na_fila, item.ajustes_com_contato, item.autorizacao_marcada], ['ajustes', { usadas: 0, max: 2 }, 1, 1, true]);
  const aj = await dono('vendas_ajustes_da_entrega', c);
  assert.deepEqual(aj.ajustes.map(a => [a.rodada, a.texto, a.contato.whatsapp, a.contato.email, a.contato.autorizacao_versao]), [[1, 'Trocar a foto da capa.', '+5521977167944', null, '2026-10-22']]);
  const fim = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, fim, { passo: 'concluida', religar_pendente: true });
  assert.ok((await rpc('vendas_entregas_lista', { org_slug: 'beyon-zero' })).itens.some(i => i.religar_pendente === true));
});

test('as funções do dono são só do servidor: anon e authenticated não executam; service_role sim; a trava interna não é de ninguém', async () => {
  const fns = ['vendas_entrega_info', 'vendas_previa_publicar', 'vendas_no_ar', 'vendas_suspender', 'vendas_encerrar', 'vendas_material_dispensar',
               'vendas_aviso_feito', 'vendas_religado', 'vendas_avisos_lista', 'vendas_ajustes_da_entrega', 'vendas_entregas_lista'];
  for (const f of fns) {
    const r = await um(`select has_function_privilege('anon', 'app.${f}(jsonb)', 'execute') as anon, has_function_privilege('authenticated', 'app.${f}(jsonb)', 'execute') as auth,
                               has_function_privilege('service_role', 'app.${f}(jsonb)', 'execute') as srv`);
    assert.deepEqual([r.anon, r.auth, r.srv], [false, false, true], f);
  }
  const t = await um("select has_function_privilege('service_role', 'privado.entrega_do_dono(jsonb, text[])', 'execute') as srv, has_function_privilege('authenticated', 'privado.entrega_do_dono(jsonb, text[])', 'execute') as auth");
  assert.deepEqual([t.srv, t.auth], [false, false]);
});

/* ---------- o dinheiro: o Pix do restante em andamento trava o encerrar e o suspender ---------- */
const VIVAS = ['criada', 'processando', 'aguardando', 'requer_acao'];
const novaTentativa = (pagamento, org, status) => db.query('delete from app.tentativas_pagamento where pagamento_id = $1', [pagamento]).then(() =>
  db.query("insert into app.tentativas_pagamento (org_id, pagamento_id, provedor, metodo, valor, chave_idempotencia, status) values ($1, $2, 'mercadopago', 'pix', 1800, $3, $4)", [org, pagamento, 'chave-saldo-' + pagamento + '-' + status, status]));
async function semearSaldo(c, statusTentativa) {
  const e = await um('select org_id, proposta_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  const pg = await um("insert into app.pagamentos (org_id, proposta_id, parcela, valor, gateway) values ($1, $2, 'saldo', 1800, 'mercadopago') returning id", [e.org_id, e.proposta_id]);
  await novaTentativa(pg.id, e.org_id, statusTentativa);
  return { pagamento: pg.id, org: e.org_id };
}
const saldoDe = async c => (await um("select pg.status from app.pagamentos pg join app.entregas e on e.proposta_id = pg.proposta_id where e.conversa_id = $1 and pg.parcela = 'saldo'", [c.conversa_id])).status;

test('encerrar e suspender recusam com o Pix do restante em andamento (qualquer tentativa viva); sem tentativa viva passam, e o encerrar cancela o saldo pendente', async () => {
  const p = await entregaEm(db, 'previa');
  const sp = await semearSaldo(p, 'criada');
  for (const st of VIVAS) {
    await novaTentativa(sp.pagamento, sp.org, st);
    assert.deepEqual(await dono('vendas_encerrar', p, { motivo: 'desistencia' }), { ok: false, motivo: 'pagamento_em_andamento' }, 'encerrar com a tentativa ' + st);
  }
  assert.equal(await passoDe(p), 'previa', 'a recusa não mexeu no passo');
  assert.equal(await saldoDe(p), 'pendente', 'nem no saldo');
  const n = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, n, { aviso_no_ar_feito_em: diasAtras(4) });
  const sn = await semearSaldo(n, 'aguardando');
  for (const st of VIVAS) {
    await novaTentativa(sn.pagamento, sn.org, st);
    assert.deepEqual(await dono('vendas_suspender', n), { ok: false, motivo: 'pagamento_em_andamento' }, 'suspender com a tentativa ' + st);
  }
  assert.equal(await passoDe(n), 'no_ar', 'o cliente pode estar pagando: o site continua no ar');
  await novaTentativa(sn.pagamento, sn.org, 'expirada');
  assert.deepEqual(await dono('vendas_suspender', n), { ok: true, lembretes: 0 }, 'a tentativa expirou: pode suspender');
  await novaTentativa(sp.pagamento, sp.org, 'expirada');
  assert.deepEqual(await dono('vendas_encerrar', p, { motivo: 'desistencia' }), { ok: true });
  assert.equal(await saldoDe(p), 'cancelado', 'encerrar cancela a cobrança do restante que ainda estava pendente');
});

/* ---------- a conta é por DATA de Campo Grande (dias corridos, o dia do evento é o dia 0), não por tempo corrido ---------- */
test('suspender conta a DATA de Campo Grande: 23:59 do dia 4 já vale (menos de 4 dias de relógio); 00:00 e 23:59 do dia 3, não', async () => {
  const c = await entregaEm(db, 'no_ar');
  for (const [d, h] of [[3, '00:00'], [3, '23:59'], [2, '23:59']]) {
    await forcarEntrega(db, c, { aviso_no_ar_feito_em: await cg(d, h) });
    const r = await dono('vendas_suspender', c);
    assert.deepEqual([r.ok, r.motivo, r.dias], [false, 'cedo', d], 'aviso às ' + h + ' do dia -' + d);
  }
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: await cg(4, '23:59') });   /* a 00:00 depois do 3º dia já passou, mesmo com menos de 96 h de relógio */
  assert.deepEqual(await dono('vendas_suspender', c), { ok: true, lembretes: 0 });
});

test('os lembretes do restante contam a DATA de Campo Grande: o 1º vale no dia 2 (23:59 do dia -2 já), o 2º no dia 3; um dia antes não', async () => {
  const c = await entregaEm(db, 'no_ar');
  const aviso = momento => dono('vendas_aviso_feito', c, { momento });
  const devidos = async () => (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(i => i.conversa_id === c.conversa_id).map(i => i.momento);
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: await cg(1, '23:59') });
  assert.deepEqual(await aviso('restante_lembrete_1'), { ok: false, motivo: 'cedo', dias: 1 });
  assert.deepEqual(await devidos(), []);
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: await cg(2, '23:59') });
  assert.deepEqual(await devidos(), ['restante_lembrete_1'], 'dia 2 por data (menos de 48 h de relógio)');
  assert.deepEqual(await aviso('restante_lembrete_1'), { ok: true });
  assert.deepEqual(await aviso('restante_lembrete_2'), { ok: false, motivo: 'cedo', dias: 2 });
  await forcarEntrega(db, c, { aviso_no_ar_feito_em: await cg(3, '23:59') });
  assert.deepEqual(await devidos(), ['restante_lembrete_2'], 'dia 3 por data (menos de 72 h de relógio)');
  assert.deepEqual(await aviso('restante_lembrete_2'), { ok: true });
});

test('o dia 30 do dispensar e do material parado é a DATA de Campo Grande: dia 29 (00:00 ou 23:59) não, 23:59 do dia 30 sim; sem entrada_em a trava fecha', async () => {
  const c = await entregaEm(db, 'material');
  const agora = new Date().toISOString();
  const dispensar = () => comVersao('vendas_material_dispensar', c, { prazo: { numero_em: agora, conta_desde: agora, pausas: [] }, entrega_ate: '2026-12-10' });
  for (const [d, h] of [[29, '00:00'], [29, '23:59']]) {
    await forcarEntrega(db, c, { prazo: JSON.stringify(prazoEm(await cg(d, h))) });
    assert.deepEqual(await dispensar(), { ok: false, motivo: 'cedo', dias: 29 }, 'entrada às ' + h + ' do dia -' + d);
  }
  await forcarEntrega(db, c, { prazo: JSON.stringify({ numero_em: agora, conta_desde: agora, pausas: [] }) });
  assert.deepEqual(await dispensar(), { ok: false, motivo: 'cedo', dias: 0 }, 'sem entrada_em não se pula a trava dos 30 dias');
  await forcarEntrega(db, c, { prazo: JSON.stringify(prazoEm(await cg(30, '23:59'))) });
  await db.query("update app.materiais m set dados = '{}' from app.entregas e where e.id = m.entrega_id and e.conversa_id = $1", [c.conversa_id]);
  assert.equal((await dispensar()).motivo, 'sem_numero', 'sem o WhatsApp salvo');
  await db.query("update app.materiais m set dados = '{\"whatsapp\":\"+5521999990001\"}' from app.entregas e where e.id = m.entrega_id and e.conversa_id = $1", [c.conversa_id]);
  assert.deepEqual(await dispensar(), { ok: true }, 'dia 30 por data (menos de 30 dias de relógio)');

  const m = await entregaEm(db, 'material');
  await db.query("update app.materiais mt set autorizacao = '{}' from app.entregas e where e.id = mt.entrega_id and e.conversa_id = $1", [m.conversa_id]);
  const parado = () => dono('vendas_aviso_feito', m, { momento: 'material_parado' });
  const naFila = async () => (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(i => i.conversa_id === m.conversa_id).map(i => i.momento);
  for (const h of ['00:00', '23:59']) {
    await forcarEntrega(db, m, { prazo: JSON.stringify(prazoEm(await cg(29, h))) });
    assert.deepEqual(await parado(), { ok: false, motivo: 'cedo', dias: 29 }, 'aviso de material parado, entrada às ' + h + ' do dia -29');
    assert.deepEqual(await naFila(), []);
  }
  await forcarEntrega(db, m, { prazo: JSON.stringify({ numero_em: agora, conta_desde: agora, pausas: [] }) });
  assert.deepEqual(await parado(), { ok: false, motivo: 'cedo', dias: 0 }, 'sem entrada_em também não');
  await forcarEntrega(db, m, { prazo: JSON.stringify(prazoEm(await cg(30, '23:59'))) });
  assert.deepEqual(await naFila(), ['material_parado'], 'dia 30 por data');
  assert.deepEqual(await parado(), { ok: true });
});

/* B5 (revisão de segurança, fix wave 2): publicar e dispensar juntavam o `prazo` INTEIRO que chega; agora só as chaves fechadas (publicar: conta_desde e pausas; dispensar: numero_em e conta_desde).
   A entrada do pedido (entrada_em) e qualquer chave estranha não entram, mesmo vindo do backend. */
test('B5: publicar só mescla conta_desde e pausas; dispensar só mescla numero_em e conta_desde (entrada_em e chave estranha são ignoradas)', async () => {
  const intruso = { entrada_em: '1999-01-01T00:00:00Z', chave_solta: 'x', novas_datas: [{ data: '1999-01-01' }] };
  const p = await entregaEm(db, 'producao');
  const entradaP = (await um('select prazo ->> \'entrada_em\' e from app.entregas where conversa_id = $1', [p.conversa_id])).e;
  assert.deepEqual(await comVersao('vendas_previa_publicar', p, { url: PREVIA, prazo: { ...PRAZO, ...intruso } }), { ok: true });
  const ep = await um('select prazo from app.entregas where conversa_id = $1', [p.conversa_id]);
  assert.deepEqual(ep.prazo.pausas, PRAZO.pausas, 'publicar: as pausas entram'); assert.equal(ep.prazo.conta_desde, PRAZO.conta_desde, 'publicar: a conta entra');
  assert.equal(ep.prazo.entrada_em, entradaP, 'publicar: a entrada do pedido não é reescrita');
  for (const k of ['chave_solta', 'novas_datas']) assert.ok(!(k in ep.prazo), 'publicar: ' + k + ' fica de fora');

  const d = await entregaEm(db, 'material');
  await forcarEntrega(db, d, { prazo: JSON.stringify(prazoDe(31)) });
  const entradaD = (await um('select prazo ->> \'entrada_em\' e from app.entregas where conversa_id = $1', [d.conversa_id])).e;
  const agora = new Date().toISOString();
  assert.deepEqual(await comVersao('vendas_material_dispensar', d, { prazo: { numero_em: agora, conta_desde: agora, pausas: [{ desde: agora, ate: null }], ...intruso }, entrega_ate: '2026-12-10' }), { ok: true });
  const ed = await um('select prazo from app.entregas where conversa_id = $1', [d.conversa_id]);
  assert.equal(ed.prazo.numero_em, agora, 'dispensar: o dia do número entra'); assert.equal(ed.prazo.conta_desde, agora, 'dispensar: a conta entra');
  assert.equal(ed.prazo.entrada_em, entradaD, 'dispensar: a entrada do pedido não é reescrita');
  for (const k of ['chave_solta', 'novas_datas']) assert.ok(!(k in ed.prazo), 'dispensar: ' + k + ' fica de fora');
  assert.equal(ed.prazo.pausas.length, 0, 'dispensar: a pausa que veio de fora não entra (a produção começa sem pausa)');
});
