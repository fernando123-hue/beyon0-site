/* O PEDIDO DE MODELOS no banco (orçamento sem IA, PR 2a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §0, §3 e §7):
   os detalhes viram pedido com código; os freios (uma vez, IP, telefone, fila global) no banco; uma regra só para "o
   pedido ocupa o dono" (privado.pedido_na_fila); a consulta leve do dono da conversa (PR37-T4/S2); as respostas com
   mescla profunda (PR37-S6). Postgres de verdade (PGlite) com as migrations reais. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { novoBanco, como, erroDe } from './_banco.mjs';

const ORG = '99999999-0000-4000-8000-000000000099';
const REGRAS = 'dddddddd-0000-4000-8000-0000000000d0';
const NAO_ACHOU = 'P0002', ETAPA = '55000', REGRA = '23514', INVALIDO = '22023', SEM_PERMISSAO = '42501';
const TODAS = ['descoberta', 'estimativa', 'contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada'];
let db, seq = 0;

/* o backend chama cada passo como service_role, passando o visitante tirado do token conferido */
const rpc = (nome, p) => como(db, 'service_role', q => q(`select app.${nome}($1::jsonb) as r`, [JSON.stringify(p)])).then(x => x.rows[0].r);
const hex = s => createHash('sha256').update(String(s)).digest('hex');
const um = async (sql, params) => (await db.query(sql, params)).rows[0];

before(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into app.organizacoes (id, slug, nome) values ('${ORG}', 'beyon-zero', 'Beyon Zero');
    insert into app.regras_comerciais (id, org_id, versao, status, regras, aprovada_em) values ('${REGRAS}', '${ORG}', 1, 'ativa', '{"moeda":"BRL"}', now());
  `);
});

/* um visitante novo com o pacote gravado (etapa "estimativa"), como o formulário das perguntas deixa */
async function comPacote() {
  const v = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  const base = { conversa_id: c, visitante_id: v };
  await rpc('vendas_registrar_respostas', { ...base, briefing: { negocio: { segmento: 'saúde', cidade: 'Goiânia' }, projeto: { formato: 'institucional' } }, confianca: 0.4 });
  await rpc('vendas_registrar_estimativa', { ...base, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 });
  return base;
}
/* os detalhes como o servidor manda: o telefone já em E.164 e o hash feito lá */
const telefoneNovo = () => '+55219' + String(80000000 + (++seq));
function detalhes(base, extra = {}) {
  const telefone = extra.telefone || telefoneNovo();
  return rpc('vendas_registrar_detalhes', { ...base, telefone, telefone_hash: hex('tel|' + telefone), nome: 'Ana', aceite: true,
    briefing: { negocio: { nome: 'Clínica Sol', descricao: 'Consultas e exames' } }, redes: {}, suspeito: false,
    chave_ip: null, max_por_ip: 3, max_por_telefone_dia: 2, teto_fila: 1000, horas: 72, ...extra });
}
/* montar cenário: mudar a etapa à mão (o gatilho de transições aceita com a licença do dono, numa transação) */
async function forcarEtapa(conversa, etapa) {
  await db.transaction(async tx => {
    await tx.exec("set local bz.transicao_livre = 'on'");
    await tx.query('update app.conversas set etapa = $1 where id = $2', [etapa, conversa]);
  });
}
const vencer = conversa => db.query("update app.pedidos set expira_em = now() - interval '1 minute' where conversa_id = $1", [conversa]);
const naFila = async () => Number((await um('select count(*) n from app.pedidos pd where privado.pedido_na_fila(pd)')).n);

test('detalhes: viram pedido com código BZ-XXXXX, lead com o WhatsApp e o aceite, briefing mesclado e a etapa "contato"', async () => {
  const b = await comPacote();
  const r = await detalhes(b, { redes: { instagram: 'clinicasol' }, suspeito: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.codigo, /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/);
  const horas = (new Date(r.expira_em) - Date.now()) / 36e5;
  assert.ok(horas > 71.9 && horas <= 72, 'expira em 72 h: ' + horas);
  const c = await um('select etapa, briefing, lead_id, contato_aceite_em from app.conversas where id = $1', [b.conversa_id]);
  assert.equal(c.etapa, 'contato');
  assert.deepEqual(c.briefing.negocio, { segmento: 'saúde', cidade: 'Goiânia', nome: 'Clínica Sol', descricao: 'Consultas e exames' }, 'mescla profunda: as respostas das perguntas ficam');
  assert.ok(c.contato_aceite_em, 'a data do aceite (prova do consentimento)');
  assert.match((await um('select telefone from app.leads where id = $1', [c.lead_id])).telefone, /^\+55219/);
  const pd = await um('select status, suspeito, redes, redes_autorizadas_em from app.pedidos where conversa_id = $1', [b.conversa_id]);
  assert.equal(pd.status, 'aguardando');
  assert.equal(pd.suspeito, true);
  assert.deepEqual(pd.redes, { instagram: 'clinicasol' });
  assert.ok(pd.redes_autorizadas_em, 'redes só com a data da autorização');
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'contato_informado'", [b.conversa_id]));
});

test('detalhes: só antes do contato (uma recusa por etapa), só com o pacote gravado, uma vez, e só do dono da conversa', async () => {
  for (const etapa of TODAS.filter(e => !['descoberta', 'estimativa'].includes(e))) {
    const b = await comPacote();
    await forcarEtapa(b.conversa_id, etapa);
    assert.equal((await erroDe(detalhes(b)))?.codigo, ETAPA, etapa);
  }
  const v = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  assert.equal((await erroDe(detalhes({ conversa_id: c, visitante_id: v })))?.codigo, ETAPA, 'descoberta sem o pacote');
  const b = await comPacote();
  assert.equal((await detalhes(b)).ok, true);
  assert.equal((await erroDe(detalhes(b)))?.codigo, ETAPA, 'a 2ª vez: a conversa já está no contato');
  assert.equal((await erroDe(detalhes({ ...(await comPacote()), visitante_id: randomUUID() })))?.codigo, NAO_ACHOU, 'conversa de outro visitante');
});

test('detalhes: os mínimos (nome do negócio, o que vende, WhatsApp) e o tamanho são conferidos no banco', async () => {
  for (const [nome, extra] of [
    ['sem nome do negócio', { briefing: { negocio: { descricao: 'Consultas' } } }],
    ['sem o que vende', { briefing: { negocio: { nome: 'Clínica Sol' } } }],
    ['telefone fora do E.164', { telefone: '21999990000' }],
    ['hash inválido', { telefone_hash: 'x' }],
    ['briefing grande demais', { briefing: { negocio: { nome: 'Clínica Sol', descricao: 'Consultas' }, servicos: Array(400).fill('x'.repeat(40)) } }]
  ]) {
    const b = await comPacote();
    assert.equal((await erroDe(detalhes(b, extra)))?.codigo, INVALIDO, nome);
  }
});

test('freio por telefone: 1 pedido aberto e 2 por dia (recusado: nada gravado)', async () => {
  const telefone = telefoneNovo();
  const a = await comPacote();
  assert.equal((await detalhes(a, { telefone })).ok, true);
  const b = await comPacote();
  assert.deepEqual(await detalhes(b, { telefone }), { ok: false, motivo: 'telefone_aberto' });
  assert.equal((await um('select etapa from app.conversas where id = $1', [b.conversa_id])).etapa, 'estimativa', 'recusado: nada gravado');
  await vencer(a.conversa_id);
  assert.equal((await detalhes(b, { telefone })).ok, true, 'o 1º venceu sem confirmação: o número volta a poder pedir');
  await vencer(b.conversa_id);
  assert.deepEqual(await detalhes(await comPacote(), { telefone }), { ok: false, motivo: 'telefone_dia' }, 'o 3º no mesmo dia');
});

test('freio por IP: o 4º pedido do mesmo IP no dia é recusado, com o evento freio_ip (sem o IP); sem chave, não conta', async () => {
  const chave_ip = hex('ip-de-teste-' + Date.now());
  for (let i = 0; i < 3; i++) assert.equal((await detalhes(await comPacote(), { chave_ip })).ok, true, 'pedido ' + (i + 1));
  const b = await comPacote();
  assert.deepEqual(await detalhes(b, { chave_ip }), { ok: false, motivo: 'freio_ip' });
  assert.deepEqual((await um("select dados from app.eventos_funil where conversa_id = $1 and tipo = 'freio_ip'", [b.conversa_id])).dados, { onde: 'detalhes' });
  assert.equal((await detalhes(await comPacote(), { chave_ip: null })).ok, true, 'sem chave (servidor local sem segredo): não conta');
});

test('fila global: o teto conta pela regra da fila (pedido_na_fila); aguardando e concluído não ocupam', async () => {
  const a = await comPacote();
  await detalhes(a);
  const teto = (await naFila()) + 1;
  assert.equal((await detalhes(await comPacote(), { teto_fila: teto })).ok, true, 'aguardando não ocupa a fila');
  await db.query("update app.pedidos set status = 'confirmado', confirmado_em = now() where conversa_id = $1", [a.conversa_id]);
  assert.deepEqual(await detalhes(await comPacote(), { teto_fila: teto }), { ok: false, motivo: 'fila_cheia' });
  await db.query('update app.pedidos set concluido_em = now() where conversa_id = $1', [a.conversa_id]);
  assert.equal((await detalhes(await comPacote(), { teto_fila: teto })).ok, true, 'concluído: saiu da fila e do teto');
});

test('estado: traz o pedido (código, situação, prazo) e quantos estão na fila; aguardando vencido aparece como expirado', async () => {
  const b = await comPacote();
  assert.equal((await rpc('vendas_estado', b)).pedido, null, 'sem detalhes: sem pedido');
  const r = await detalhes(b);
  const e = await rpc('vendas_estado', b);
  assert.deepEqual(Object.keys(e.pedido).sort(), ['codigo', 'expira_em', 'status']);
  assert.equal(e.pedido.codigo, r.codigo);
  assert.equal(e.pedido.status, 'aguardando');
  assert.equal(e.fila_confirmados, await naFila(), 'a mesma regra da fila');
  assert.equal(e.conversa.etapa, 'contato', 'o resto do estado continua igual');
  assert.ok(Array.isArray(e.mensagens) && 'estimativa' in e && 'direcoes' in e);
  await vencer(b.conversa_id);
  assert.equal((await rpc('vendas_estado', b)).pedido.status, 'expirado');
  assert.equal((await erroDe(rpc('vendas_estado', { ...b, visitante_id: randomUUID() })))?.codigo, NAO_ACHOU);
});

test('consulta leve do dono da conversa (PR37-T4/S2): etapa e o último pacote; recusa cada etapa fora da lista e o outro visitante', async () => {
  const b = await comPacote();
  const r = await rpc('vendas_conversa_dono', { ...b, etapas: ['descoberta', 'estimativa'] });
  assert.equal(r.etapa, 'estimativa');
  assert.equal(r.estimativa.regras_id, REGRAS);
  assert.deepEqual(r.estimativa.fatores, { formato: 'institucional' });
  for (const etapa of TODAS.filter(e => e !== 'estimativa')) {
    const x = await comPacote();
    await forcarEtapa(x.conversa_id, etapa);
    assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...x, etapas: ['estimativa'] })))?.codigo, ETAPA, etapa);
  }
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, etapas: [] })))?.codigo, ETAPA, 'lista vazia: fecha');
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, visitante_id: randomUUID(), etapas: ['estimativa'] })))?.codigo, NAO_ACHOU);
});

test('respostas (PR37-S6 e S3): mescla profunda, a confiança só sobe, briefing grande recusado, teto de 30 pacotes, etapas recusadas', async () => {
  const b = await comPacote();
  await rpc('vendas_registrar_respostas', { ...b, briefing: { negocio: { segmento: 'beleza' }, projeto: { paginas: 5 } }, confianca: 0.6 });
  await rpc('vendas_registrar_respostas', { ...b, briefing: {}, confianca: 0.2 });
  const c = await um('select briefing, confianca from app.conversas where id = $1', [b.conversa_id]);
  assert.deepEqual(c.briefing.negocio, { segmento: 'beleza', cidade: 'Goiânia' }, 'negocio mesclado, não trocado inteiro');
  assert.deepEqual(c.briefing.projeto, { formato: 'institucional', paginas: 5 });
  assert.equal(Number(c.confianca), 0.6, 'a confiança não desce');
  assert.equal((await erroDe(rpc('vendas_registrar_respostas', { ...b, briefing: { servicos: Array(500).fill('y'.repeat(40)) }, confianca: 0 })))?.codigo, INVALIDO);
  for (let i = 0; i < 29; i++) await rpc('vendas_registrar_estimativa', { ...b, regras_id: REGRAS, fatores: { i }, valor_total: 1, sinal: 0, prazo_dias: 1 });
  assert.equal((await erroDe(rpc('vendas_registrar_respostas', { ...b, briefing: {}, confianca: 0 })))?.codigo, REGRA, '30 pacotes gravados: chega');
  for (const etapa of TODAS.filter(e => !['descoberta', 'estimativa'].includes(e))) {
    const x = await comPacote();
    await forcarEtapa(x.conversa_id, etapa);
    assert.equal((await erroDe(rpc('vendas_registrar_respostas', { ...x, briefing: {}, confianca: 0 })))?.codigo, ETAPA, etapa);
  }
});

test('pedido: a situação só anda para a frente; código e conversa não mudam; o hash do telefone só pode ser apagado; ninguém lê pela API', async () => {
  const b = await comPacote();
  await detalhes(b);
  assert.equal((await erroDe(db.query("update app.pedidos set status = 'arquivado' where conversa_id = $1", [b.conversa_id])))?.codigo, REGRA, 'aguardando → arquivado');
  assert.equal((await erroDe(db.query("update app.pedidos set codigo = 'BZ-AAAAA' where conversa_id = $1", [b.conversa_id])))?.codigo, REGRA);
  assert.equal((await erroDe(db.query("update app.pedidos set telefone_hash = $2 where conversa_id = $1", [b.conversa_id, hex('outro')])))?.codigo, REGRA, 'trocar o hash');
  await db.query('update app.pedidos set telefone_hash = null where conversa_id = $1', [b.conversa_id]);   /* (apagar pode: a rotina faz) */
  assert.equal((await erroDe(db.query("update app.pedidos set status = 'confirmado' where conversa_id = $1", [b.conversa_id])))?.codigo, REGRA, 'confirmado sem a data');
  for (const quem of ['anon', b.visitante_id])
    assert.equal((await erroDe(como(db, quem, q => q('select * from app.pedidos'))))?.codigo, SEM_PERMISSAO, String(quem));
});
