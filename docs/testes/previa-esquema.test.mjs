/* O ESQUEMA DA PRÉVIA ATÉ O FIM (PR 3b-3; spec §2): as colunas novas com os padrões certos, as transições do passo (e SÓ elas), a
   conversa que pode encerrar, o endereço da prévia que o banco confere, a lista de ajustes fechada para o backend e a regra da D5:
   a prévia só sai por ação do cliente ou pelo encerrar do painel, nunca por rotina.  Postgres real (PGlite) com as migrations.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';
import { entregaEm, forcarEntrega } from './_previa.mjs';
import { WHATSAPP_BONS, WHATSAPP_RUINS, EMAIL_BONS, EMAIL_RUINS } from './_contato.mjs';

let db;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); await prepararOrg(db); });

test('a entrega nasce com 2 listas de ajuste (D2) e as colunas novas vazias', async () => {
  const c = await conversaComEntradaPaga(db);
  const e = await um('select * from app.entregas where conversa_id = $1', [c.conversa_id]);
  assert.deepEqual([e.rodadas_usadas, e.rodadas_max], [0, 2]);
  for (const k of ['previa_url', 'previa_em', 'aprovada_em', 'site_url', 'no_ar_em', 'suspensa_em', 'concluida_em', 'encerrada_em', 'encerrada_motivo',
    'aviso_previa_desde', 'aviso_no_ar_desde', 'aviso_no_ar_feito_em', 'lembrete_restante_1_em', 'lembrete_restante_2_em', 'aviso_material_em']) assert.equal(e[k], null, k);
  assert.equal(e.religar_pendente, false);
  assert.equal((await um('select dispensado_em from app.materiais where entrega_id = $1', [e.id])).dispensado_em, null);
});

test('as transições do passo são EXATAMENTE as da spec §2 (nada além)', async () => {
  const lidas = (await db.query('select de, para from privado.transicoes_entrega')).rows.map(r => r.de + '>' + r.para).sort();
  const esperadas = ['material>producao', 'producao>previa', 'ajustes>previa', 'previa>ajustes', 'previa>aprovada', 'aprovada>no_ar', 'no_ar>suspensa', 'no_ar>concluida', 'suspensa>concluida',
    ...['material', 'producao', 'previa', 'ajustes', 'aprovada', 'no_ar', 'suspensa'].map(p => p + '>encerrada')].sort();
  assert.deepEqual(lidas, esperadas);
});

test('o passo anda só pelas transições: producao → previa → aprovada sim; pular, voltar e sair de concluida/encerrada, não', async () => {
  const c = await entregaEm(db, 'producao');
  const passo = async () => (await um('select passo from app.entregas where conversa_id = $1', [c.conversa_id])).passo;
  const ir = para => db.query('update app.entregas set passo = $2 where conversa_id = $1', [c.conversa_id, para]);
  assert.equal((await erroDe(ir('aprovada'))).codigo, '55000', 'producao → aprovada pula a prévia');
  assert.equal((await erroDe(ir('no_ar'))).codigo, '55000');
  await ir('previa'); assert.equal(await passo(), 'previa');
  assert.equal((await erroDe(ir('no_ar'))).codigo, '55000', 'previa → no_ar pula a aprovação');
  assert.equal((await erroDe(ir('producao'))).codigo, '55000', 'não volta');
  await ir('aprovada'); await ir('no_ar'); await ir('concluida');
  assert.equal((await erroDe(ir('no_ar'))).codigo, '55000', 'concluida é o fim');
  assert.equal((await erroDe(ir('encerrada'))).codigo, '55000', 'concluida não encerra');
});

test('D5: a prévia só tem 3 saídas (a lista do cliente, a aprovação do cliente e o encerrar do painel); nenhuma é de rotina', async () => {
  const r = (await db.query("select para, quem from privado.transicoes_entrega where de = 'previa' order by para")).rows;
  assert.deepEqual(r.map(x => x.para), ['ajustes', 'aprovada', 'encerrada']);
  const quem = Object.fromEntries(r.map(x => [x.para, x.quem]));
  assert.deepEqual(quem, { ajustes: 'vendas_previa_ajustes', aprovada: 'vendas_previa_aprovar', encerrada: 'vendas_encerrar' });
});

test('D5: nenhuma função de rotina (rotinas_*) muda o passo da entrega', async () => {
  const funcoes = (await db.query("select p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'rotinas%'")).rows;
  assert.ok(funcoes.length >= 4, 'as funções de rotina existem (' + funcoes.length + ')');
  for (const f of funcoes) assert.ok(!/update\s+app\.entregas[^;]*\bpasso\b/i.test(f.def), f.proname + ' não pode mudar o passo');
});

test('a conversa em produção pode encerrar (a conclusão do restante e o encerrar do painel); encerrada não volta', async () => {
  const c = await entregaEm(db, 'no_ar');
  await db.query("update app.conversas set etapa = 'encerrada' where id = $1", [c.conversa_id]);
  assert.equal((await erroDe(db.query("update app.conversas set etapa = 'em_producao' where id = $1", [c.conversa_id]))).codigo, '55000');
});

test('o endereço da prévia que o banco aceita: https, vN.bz-c-xxxxxx.pages.dev; qualquer outro é recusado', async () => {
  const c = await entregaEm(db, 'previa');
  for (const url of ['http://v1.bz-c-k7m3qa.pages.dev', 'https://evil.pages.dev', 'https://v1.bz-c-k7m3qa.pages.dev/caminho', 'https://v123.bz-c-k7m3qa.pages.dev', 'https://v1.bz-c-k7m3qi.pages.dev']) {
    const e = await erroDe(forcarEntrega(db, c, { previa_url: url }));
    assert.equal(e && e.codigo, '23514', url);
  }
  await forcarEntrega(db, c, { previa_url: 'https://v2.bz-c-k7m3qa.pages.dev/' });
});

test('22/10: não existe encerrar por falta de material: o motivo "sem_material" não existe na lista fechada (o pedido sem material fica PARADO)', async () => {
  const c = await entregaEm(db, 'material');
  assert.equal((await erroDe(forcarEntrega(db, c, { encerrada_motivo: 'sem_material' }))).codigo, '23514');
  for (const ok of ['desistencia', 'atraso', 'producao_manual', 'outro']) await forcarEntrega(db, c, { encerrada_motivo: ok });
});

test('a lista de ajustes: uma por rodada, de 1 a 1.500 caracteres (ou só o contato do site), e o backend não lê nem escreve por fora das funções', async () => {
  const c = await entregaEm(db, 'previa');
  const e = await um('select id, org_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  const inserir = (rodada, texto) => db.query('insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto) values ($1, $2, $3, $4)', [e.org_id, e.id, rodada, texto]);
  await inserir(1, 'Trocar a foto da capa.');
  assert.equal((await erroDe(inserir(1, 'de novo'))).codigo, '23505', 'uma lista por rodada');
  assert.equal((await erroDe(inserir(2, ''))).codigo, '23514', 'sem texto e sem contato do site, não é uma lista');
  assert.equal((await erroDe(inserir(2, 'x'.repeat(1501)))).codigo, '23514');
  await inserir(2, 'x'.repeat(1500));
  const lido = await erroDe(como(db, 'service_role', q => q('select * from app.entrega_ajustes')));
  assert.equal(lido && lido.codigo, '42501', 'service_role não lê a tabela por fora das funções');
});

test('M3 (22/10): o WhatsApp e o e-mail do site têm colunas PRÓPRIAS, com o formato da tela e do servidor, e só existem com a autorização de uso no site', async () => {
  const c = await entregaEm(db, 'previa');
  const e = await um('select id, org_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  const AUT = { contato_autorizado_em: new Date().toISOString(), contato_autorizacao_versao: '2026-10-22' };
  /* tenta gravar e apaga: devolve o código do erro (ou null) */
  const tenta = async (extra, texto = 'Trocar a foto.') => {
    const cols = ['org_id', 'entrega_id', 'rodada', 'texto', ...Object.keys(extra)];
    const r = await erroDe(db.query(`insert into app.entrega_ajustes (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, [e.org_id, e.id, 1, texto, ...Object.values(extra)]));
    await db.query('delete from app.entrega_ajustes where entrega_id = $1', [e.id]);
    return r ? r.codigo : null;
  };
  for (const w of WHATSAPP_BONS) assert.equal(await tenta({ contato_whatsapp: w, ...AUT }), null, 'WhatsApp bom: ' + w);
  for (const w of WHATSAPP_RUINS) assert.equal(await tenta({ contato_whatsapp: w, ...AUT }), '23514', 'WhatsApp ruim: ' + JSON.stringify(w));
  for (const m of EMAIL_BONS) assert.equal(await tenta({ contato_email: m, ...AUT }), null, 'e-mail bom: ' + m);
  for (const m of EMAIL_RUINS) assert.equal(await tenta({ contato_email: m, ...AUT }), '23514', 'e-mail ruim: ' + JSON.stringify(m));
  assert.equal(await tenta({ contato_whatsapp: '+5521977167944' }), '23514', 'sem a autorização de uso, o contato não existe');
  assert.equal(await tenta({ contato_email: 'contato@clinicasol.com.br', contato_autorizado_em: AUT.contato_autorizado_em }), '23514', 'a autorização precisa da versão');
  assert.equal(await tenta({ contato_email: 'contato@clinicasol.com.br', contato_autorizado_em: AUT.contato_autorizado_em, contato_autorizacao_versao: 'x'.repeat(21) }), '23514', 'versão grande demais');
  assert.equal(await tenta({ contato_whatsapp: '+5521977167944', ...AUT }, ''), null, 'só o contato do site, sem texto, é uma lista válida');
  assert.equal(await tenta({}, ''), '23514', 'sem texto e sem contato, não');
});

test('os eventos novos existem no funil (sem texto do cliente)', async () => {
  const c = await conversaComEntradaPaga(db);
  const org = (await um('select org_id from app.conversas where id = $1', [c.conversa_id])).org_id;
  for (const t of ['material_dispensado', 'previa_pronta', 'previa_ajustes', 'previa_aprovada', 'site_no_ar', 'restante_iniciado', 'restante_pago', 'entrega_suspensa', 'entrega_encerrada', 'aviso_registrado']) {
    await db.query('select privado.evento($1, $2, $3)', [org, c.conversa_id, t]);
  }
  assert.equal((await erroDe(db.query("select privado.evento($1, $2, 'previa_sem_resposta')", [org, c.conversa_id]))).codigo, '23514', 'a D5 não tem evento de "sem resposta"');
});
