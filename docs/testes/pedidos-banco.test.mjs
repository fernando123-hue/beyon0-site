/* O PEDIDO DE MODELOS no banco (orçamento sem IA, PR 2a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §0, §3 e §7):
   os detalhes viram pedido com código; os freios (uma vez, IP, telefone, fila global) no banco; uma regra só para "o
   pedido ocupa o dono" (privado.pedido_na_fila); a consulta leve do dono da conversa (PR37-T4/S2); as respostas com
   mescla profunda (PR37-S6). Postgres de verdade (PGlite) com as migrations reais. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { telefoneE164DeTeste } from './_pedido.mjs';

const ORG = '99999999-0000-4000-8000-000000000099';
const REGRAS = 'dddddddd-0000-4000-8000-0000000000d0';
const NAO_ACHOU = 'P0002', ETAPA = '55000', REGRA = '23514', INVALIDO = '22023', SEM_PERMISSAO = '42501';
const TODAS = ['descoberta', 'estimativa', 'contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada'];
let db;

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
function detalhes(base, extra = {}) {
  const telefone = extra.telefone || telefoneE164DeTeste();
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
const pedidosDa = async conversa => Number((await um('select count(*) n from app.pedidos where conversa_id = $1', [conversa])).n);   /* (quantos pedidos a conversa tem) */
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
  await forcarEtapa(b.conversa_id, 'estimativa');   /* etapa de volta (só por mão de dono): a trava do pedido único é a própria tabela */
  assert.deepEqual(await detalhes(b), { ok: false, motivo: 'ja_enviado' }, 'conversa que já tem pedido');
  assert.equal(await pedidosDa(b.conversa_id), 1, 'e o pedido continua um só');
  assert.equal((await erroDe(detalhes({ ...(await comPacote()), visitante_id: randomUUID() })))?.codigo, NAO_ACHOU, 'conversa de outro visitante');
});

test('detalhes: os mínimos (nome do negócio, o que vende, WhatsApp) e o tamanho são conferidos no banco', async () => {
  for (const [nome, extra] of [
    ['sem nome do negócio', { briefing: { negocio: { descricao: 'Consultas' } } }],
    ['sem o que vende', { briefing: { negocio: { nome: 'Clínica Sol' } } }],
    ['telefone fora do E.164', { telefone: '21999990000' }],
    ['hash inválido', { telefone_hash: 'x' }],
    ['chave de IP fora do formato (curta)', { chave_ip: 'ABC' }],
    ['chave de IP em hex maiúsculo', { chave_ip: hex('ip').toUpperCase() }],
    ['chave de IP cortada', { chave_ip: hex('ip').slice(0, 63) }],
    ['briefing grande demais', { briefing: { negocio: { nome: 'Clínica Sol', descricao: 'Consultas' }, servicos: Array(400).fill('x'.repeat(40)) } }]
  ]) {
    const b = await comPacote();
    assert.equal((await erroDe(detalhes(b, extra)))?.codigo, INVALIDO, nome);
  }
});

test('freio por telefone: 1 pedido aberto e 2 por dia (recusado: nada gravado)', async () => {
  const telefone = telefoneE164DeTeste();
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
  const linhas = async () => Number((await um('select count(*) n from privado.freio_ip')).n);
  const antes = await linhas();
  assert.equal((await detalhes(await comPacote(), { chave_ip: null })).ok, true, 'sem chave (servidor local sem segredo): não conta');
  assert.equal(await linhas(), antes, 'sem chave: o freio_ip não ganhou linha');
});

/* (revisão final do PR 2a, M2) o banco não pode responder a quem sonda se um número já pediu orçamento: toda tentativa
   gasta a cota do IP (contado ANTES dos testes de telefone) e a mesma conversa tenta no máximo 3 vezes, contadas no banco */
test('detalhes: a mesma conversa tenta no máximo 3 vezes; a 4ª é recusada mesmo com um número novo, sem gravar o pedido', async () => {
  const telefone = telefoneE164DeTeste();
  assert.equal((await detalhes(await comPacote(), { telefone })).ok, true);
  const b = await comPacote();
  for (let i = 1; i <= 3; i++) assert.deepEqual(await detalhes(b, { telefone }), { ok: false, motivo: 'telefone_aberto' }, 'tentativa ' + i);
  assert.deepEqual(await detalhes(b), { ok: false, motivo: 'tentativas' }, 'a 4ª, trocando o telefone');
  assert.equal(await pedidosDa(b.conversa_id), 0, 'nenhum pedido');
  assert.equal((await um('select etapa from app.conversas where id = $1', [b.conversa_id])).etapa, 'estimativa');
});

test('detalhes: a recusa por telefone gasta a cota do IP (as sondas param no freio do IP como qualquer pedido)', async () => {
  const chave_ip = hex('ip-sonda-' + Date.now());
  const telefone = telefoneE164DeTeste();
  assert.equal((await detalhes(await comPacote(), { telefone })).ok, true);
  for (let i = 1; i <= 3; i++) assert.deepEqual(await detalhes(await comPacote(), { telefone, chave_ip }), { ok: false, motivo: 'telefone_aberto' }, 'sonda ' + i);
  assert.deepEqual(await detalhes(await comPacote(), { chave_ip }), { ok: false, motivo: 'freio_ip' }, 'as três sondas gastaram a cota do dia');
});

/* (revisão final do PR 2a, M3c) o IPv6 também por /48: outra chave (outro "uso" no servidor), o mesmo privado.contar_ip */
test('freio por IP (IPv6): além do /64, um teto diário por /48 (10, com chave própria); a chave /48 mal formada é recusada', async () => {
  const chave_ip48 = hex('p48-' + Date.now());
  for (let i = 0; i < 10; i++)
    assert.equal((await detalhes(await comPacote(), { chave_ip: hex('p64-' + Date.now() + '-' + i), chave_ip48 })).ok, true, 'pedido ' + (i + 1) + ', cada um de um /64');
  const b = await comPacote();
  assert.deepEqual(await detalhes(b, { chave_ip: hex('p64-outro-' + Date.now()), chave_ip48 }), { ok: false, motivo: 'freio_ip' }, 'o 11º do mesmo /48');
  assert.deepEqual((await um("select dados from app.eventos_funil where conversa_id = $1 and tipo = 'freio_ip'", [b.conversa_id])).dados, { onde: 'detalhes', prefixo: 48 });
  assert.equal((await detalhes(await comPacote(), { chave_ip48: hex('p48-outro-' + Date.now()) })).ok, true, 'outro /48: livre');
  assert.equal((await erroDe(detalhes(await comPacote(), { chave_ip48: 'ABC' })))?.codigo, INVALIDO, 'chave /48 mal formada: erro, não freio desligado');
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

test('estado: traz o pedido (código, situação, prazo, data da confirmação) e quantos estão na fila; aguardando vencido aparece como expirado', async () => {
  const b = await comPacote();
  assert.equal((await rpc('vendas_estado', b)).pedido, null, 'sem detalhes: sem pedido');
  const r = await detalhes(b);
  const e = await rpc('vendas_estado', b);
  assert.deepEqual(Object.keys(e.pedido).sort(), ['codigo', 'confirmado_em', 'expira_em', 'status']);
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
  /* retrocesso e saída de estado final */
  const x = await comPacote();
  await detalhes(x);
  await db.query("update app.pedidos set status = 'confirmado', confirmado_em = now() where conversa_id = $1", [x.conversa_id]);
  assert.equal((await erroDe(db.query("update app.pedidos set status = 'aguardando' where conversa_id = $1", [x.conversa_id])))?.codigo, REGRA, 'confirmado → aguardando');
  const y = await comPacote();
  await detalhes(y);
  await db.query("update app.pedidos set status = 'expirado', encerrado_em = now() where conversa_id = $1", [y.conversa_id]);
  assert.equal((await erroDe(db.query("update app.pedidos set status = 'confirmado', confirmado_em = now() where conversa_id = $1", [y.conversa_id])))?.codigo, REGRA, 'expirado → confirmado');
  for (const quem of ['anon', b.visitante_id])
    assert.equal((await erroDe(como(db, quem, q => q('select * from app.pedidos'))))?.codigo, SEM_PERMISSAO, String(quem));
});

/* ---------- o lado do dono (20261013120100_pedidos_dono.sql) ---------- */
async function pedidoAguardando(extra) { const b = await comPacote(); const r = await detalhes(b, extra); return { ...b, codigo: r.codigo }; }
const confirmar = conversa_id => rpc('vendas_confirmar_whatsapp', { org_slug: 'beyon-zero', conversa_id });
const mudar = (conversa_id, acao) => rpc('vendas_mudar_pedido', { org_slug: 'beyon-zero', conversa_id, acao });
const pedido = conversa => um('select * from app.pedidos where conversa_id = $1', [conversa]);
async function concluirDirecoes(conversa, extra = { conteudo: { secoes: [] }, modelo: 'teste' }) {
  for (const d of (await db.query("select id from app.direcoes where conversa_id = $1 and status = 'gerando'", [conversa])).rows)
    await rpc('vendas_concluir_direcao', { direcao_id: d.id, ...extra });
}

test('confirmar pelo WhatsApp (só o dono): o pedido entra na fila e as três direções nascem; repetir é recusado', async () => {
  const p = await pedidoAguardando();
  const r = await confirmar(p.conversa_id);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.codigo, p.codigo);
  const d = (await db.query('select status, geracao from app.direcoes where conversa_id = $1', [p.conversa_id])).rows;
  assert.equal(d.length, 3);
  assert.ok(d.every(x => x.status === 'gerando' && x.geracao === 1));
  assert.equal((await um('select etapa from app.conversas where id = $1', [p.conversa_id])).etapa, 'gerando');
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'confirmacao_whatsapp'", [p.conversa_id]));
  assert.equal((await erroDe(confirmar(p.conversa_id)))?.codigo, ETAPA, 'de novo: a etapa já é "gerando"');
  assert.equal((await erroDe(rpc('vendas_confirmar_whatsapp', { org_slug: 'outra', conversa_id: p.conversa_id })))?.codigo, NAO_ACHOU, 'outra organização');
});

test('confirmar: recusa cada etapa fora de "contato"; pedido vencido vira expirado (com o evento) e nada é gerado', async () => {
  for (const etapa of TODAS.filter(e => e !== 'contato')) {
    const p = await pedidoAguardando();
    await forcarEtapa(p.conversa_id, etapa);
    assert.equal((await erroDe(confirmar(p.conversa_id)))?.codigo, ETAPA, etapa);
  }
  const v = await pedidoAguardando();
  await vencer(v.conversa_id);
  assert.deepEqual(await confirmar(v.conversa_id), { ok: false, status: 'expirado' });
  assert.equal((await pedido(v.conversa_id)).status, 'expirado');
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'pedido_expirado'", [v.conversa_id]));
  assert.equal(Number((await um('select count(*) n from app.direcoes where conversa_id = $1', [v.conversa_id])).n), 0);
});

test('gerar antes da confirmação: recusado; sem pedido (o caminho antigo do consultor), o banco TAMBÉM recusa (revisão final, B4)', async () => {
  const p = await pedidoAguardando();
  assert.equal((await erroDe(rpc('vendas_iniciar_geracao', { conversa_id: p.conversa_id, visitante_id: p.visitante_id })))?.codigo, ETAPA);
  const b = await comPacote();
  await rpc('vendas_informar_contato', { ...b, nome: 'Ana', telefone: '+5521999990000', aceite: true });
  assert.equal((await erroDe(rpc('vendas_iniciar_geracao', b)))?.codigo, ETAPA, 'sem linha em app.pedidos: nada nasce');
  assert.equal(Number((await um('select count(*) n from app.direcoes where conversa_id = $1', [b.conversa_id])).n), 0);
});

test('conclusão automática: as três direções falham → o pedido sai da fila, do teto e libera o telefone', async () => {
  const telefone = telefoneE164DeTeste();
  const p = await pedidoAguardando({ telefone });
  await confirmar(p.conversa_id);
  assert.equal((await um('select privado.pedido_na_fila(pd) f from app.pedidos pd where conversa_id = $1', [p.conversa_id])).f, true);
  await concluirDirecoes(p.conversa_id, { erro: 'teste' });
  assert.equal((await um('select etapa from app.conversas where id = $1', [p.conversa_id])).etapa, 'contato');
  assert.ok((await pedido(p.conversa_id)).concluido_em, 'concluído: nada mais a fazer na fila');
  assert.equal((await detalhes(await comPacote(), { telefone })).ok, true, 'o número pode pedir de novo (2º do dia)');
});

test('conclusão automática: o cliente escolhe um modelo antes do "Já avisei" → o pedido conclui', async () => {
  const p = await pedidoAguardando();
  await confirmar(p.conversa_id);
  await concluirDirecoes(p.conversa_id);
  assert.equal((await pedido(p.conversa_id)).concluido_em, null, 'prontas e não avisadas: ainda na fila');
  const d = (await um("select id from app.direcoes where conversa_id = $1 limit 1", [p.conversa_id])).id;
  await rpc('vendas_escolher', { conversa_id: p.conversa_id, visitante_id: p.visitante_id, direcao_id: d });
  assert.ok((await pedido(p.conversa_id)).concluido_em, 'o cliente já viu e escolheu: sai da fila');
});

test('"Já avisei" conclui o pedido: o número pode pedir de novo', async () => {
  const telefone = telefoneE164DeTeste();
  const p = await pedidoAguardando({ telefone });
  await confirmar(p.conversa_id);
  await concluirDirecoes(p.conversa_id);
  assert.deepEqual(await detalhes(await comPacote(), { telefone }), { ok: false, motivo: 'telefone_aberto' }, 'na fila: aberto');
  assert.equal((await rpc('vendas_marcar_avisado', { org_slug: 'beyon-zero', conversa_id: p.conversa_id })).avisadas, 3);
  assert.ok((await pedido(p.conversa_id)).concluido_em);
  assert.equal((await detalhes(await comPacote(), { telefone })).ok, true, 'concluído: pede de novo (2º do dia)');
});

test('pendentes: os não confirmados numa lista separada (mais novos primeiro), com código, WhatsApp, negócio e redes; busca pelo código', async () => {
  const a = await pedidoAguardando({ redes: { instagram: 'clinicasol' } });
  const b = await pedidoAguardando();
  const p = await rpc('vendas_pedidos_pendentes', { org_slug: 'beyon-zero' });
  const ia = p.itens.findIndex(x => x.conversa_id === a.conversa_id), ib = p.itens.findIndex(x => x.conversa_id === b.conversa_id);
  assert.ok(ib >= 0 && ia > ib, 'o mais novo primeiro');
  assert.equal(p.itens[ia].codigo, a.codigo);
  assert.match(p.itens[ia].contato.telefone, /^\+55/);
  assert.equal(p.itens[ia].negocio.nome, 'Clínica Sol');
  assert.deepEqual(p.itens[ia].redes, { instagram: 'clinicasol' });
  assert.ok(p.itens.length <= 50 && p.total >= p.itens.length);
  const busca = await rpc('vendas_pedidos_pendentes', { org_slug: 'beyon-zero', codigo: a.codigo.toLowerCase() });
  assert.deepEqual(busca.itens.map(x => x.conversa_id), [a.conversa_id], 'a busca pelo código acha o pedido (em minúsculas também; o caso de mais de 50 está no teste dos 50 mais novos)');
  assert.equal(busca.total, 1);
  await confirmar(a.conversa_id);
  await mudar(b.conversa_id, 'descartar');
  const depois = (await rpc('vendas_pedidos_pendentes', { org_slug: 'beyon-zero' })).itens.map(x => x.conversa_id);
  assert.ok(!depois.includes(a.conversa_id) && !depois.includes(b.conversa_id));
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'pedido_descartado'", [b.conversa_id]));
});

test('descartar para a geração; arquivar só confirmado, em qualquer etapa depois do contato; etapas recusadas uma a uma', async () => {
  const g = await pedidoAguardando();
  await confirmar(g.conversa_id);
  assert.deepEqual(await mudar(g.conversa_id, 'descartar'), { ok: true, status: 'descartado' });
  const dirs = (await db.query('select status, erro from app.direcoes where conversa_id = $1', [g.conversa_id])).rows;
  assert.ok(dirs.every(d => d.status === 'falhou' && d.erro === 'pedido descartado'), 'nenhuma direção segue "gerando" (nem dono, nem IA)');
  assert.equal((await um('select etapa from app.conversas where id = $1', [g.conversa_id])).etapa, 'contato');
  assert.equal((await erroDe(rpc('vendas_iniciar_geracao', { conversa_id: g.conversa_id, visitante_id: g.visitante_id })))?.codigo, ETAPA, 'descartado não gera');
  const a = await pedidoAguardando();
  assert.equal((await erroDe(mudar(a.conversa_id, 'arquivar')))?.codigo, REGRA, 'arquivar exige confirmado');
  await confirmar(a.conversa_id);
  await forcarEtapa(a.conversa_id, 'aguardando_pagamento');
  assert.deepEqual(await mudar(a.conversa_id, 'arquivar'), { ok: true, status: 'arquivado' }, 'arquivar vale depois do resumo');
  assert.equal((await erroDe(mudar(a.conversa_id, 'descartar')))?.codigo, ETAPA, 'descartar quem já está pagando: não');
  assert.equal((await erroDe(mudar(a.conversa_id, 'apagar')))?.codigo, INVALIDO);
  for (const etapa of ['descoberta', 'estimativa', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada']) {
    const p = await pedidoAguardando();
    await forcarEtapa(p.conversa_id, etapa);
    assert.equal((await erroDe(mudar(p.conversa_id, 'descartar')))?.codigo, ETAPA, 'descartar em ' + etapa);
  }
  for (const etapa of ['descoberta', 'estimativa']) {
    const p = await pedidoAguardando();
    await confirmar(p.conversa_id);
    await forcarEtapa(p.conversa_id, etapa);
    assert.equal((await erroDe(mudar(p.conversa_id, 'arquivar')))?.codigo, ETAPA, 'arquivar em ' + etapa);
  }
});

test('rotina: vence os não confirmados (evento uma vez), apaga o hash do telefone dias depois do encerramento e as redes depois de 60 dias', async () => {
  const p = await pedidoAguardando({ redes: { instagram: 'antiga' } });
  await db.query("update app.pedidos set expira_em = now() - interval '1 hour', created_at = now() - interval '61 days' where conversa_id = $1", [p.conversa_id]);
  const recente = await pedidoAguardando();
  await mudar(recente.conversa_id, 'descartar');
  const velho = await pedidoAguardando();
  await mudar(velho.conversa_id, 'descartar');
  await db.query("update app.pedidos set encerrado_em = now() - interval '3 days' where conversa_id = $1", [velho.conversa_id]);
  const r = await rpc('vendas_expirar_pedidos', {});
  assert.ok(r.expirados >= 1 && r.redes_apagadas >= 1 && r.telefones_apagados >= 1, JSON.stringify(r));
  const pd = await pedido(p.conversa_id);
  assert.equal(pd.status, 'expirado');
  assert.deepEqual(pd.redes, {});
  assert.equal(pd.redes_autorizadas_em, null);
  assert.equal((await pedido(velho.conversa_id)).telefone_hash, null, 'encerrado há 3 dias: o hash sai');
  assert.match((await pedido(recente.conversa_id)).telefone_hash, /^[0-9a-f]{64}$/, 'encerrado hoje: ainda conta para o limite do dia');
  assert.equal((await rpc('vendas_expirar_pedidos', {})).expirados, 0, 'de novo: nada');
  assert.equal(Number((await um("select count(*) n from app.eventos_funil where conversa_id = $1 and tipo = 'pedido_expirado'", [p.conversa_id])).n), 1);
});

/* (revisão final do PR 2a, B9) o confirmado que ninguém conclui (o dono não avisa, o cliente não escolhe) ficava com o
   hash do telefone sem prazo. O hash sai também 30 dias depois do pedido, em qualquer situação: o freio por telefone só
   precisa dele no dia ("2 por dia") e enquanto o pedido está aberto, e um pedido parado há 30 dias na fila é um pedido
   abandonado (o dono o vê na fila; o número só volta a poder pedir) */
test('rotina: o hash do telefone sai também do confirmado que nunca concluiu, 30 dias depois do pedido; o pedido segue na fila', async () => {
  const preso = await pedidoAguardando();
  await confirmar(preso.conversa_id);
  await db.query("update app.pedidos set created_at = now() - interval '31 days', confirmado_em = now() - interval '31 days' where conversa_id = $1", [preso.conversa_id]);
  const recente = await pedidoAguardando();
  await confirmar(recente.conversa_id);
  await db.query("update app.pedidos set created_at = now() - interval '29 days', confirmado_em = now() - interval '29 days' where conversa_id = $1", [recente.conversa_id]);
  const r = await rpc('vendas_expirar_pedidos', {});
  assert.ok(r.telefones_apagados >= 1, JSON.stringify(r));
  const pd = await pedido(preso.conversa_id);
  assert.equal(pd.telefone_hash, null, 'pedido de 31 dias, nunca concluído: o hash sai');
  assert.equal(pd.status, 'confirmado');
  assert.equal((await um('select privado.pedido_na_fila(pd) f from app.pedidos pd where conversa_id = $1', [preso.conversa_id])).f, true, 'só o hash sai: o pedido segue na fila do dono');
  assert.match((await pedido(recente.conversa_id)).telefone_hash, /^[0-9a-f]{64}$/, '29 dias: o hash fica');
});

/* ---------- correções da revisão da Task 2 ---------- */
test('arquivar com a geração em andamento: para as direções e devolve a etapa, como o descartar (nenhuma órfã)', async () => {
  const p = await pedidoAguardando();
  await confirmar(p.conversa_id);
  assert.equal((await um('select etapa from app.conversas where id = $1', [p.conversa_id])).etapa, 'gerando');
  assert.deepEqual(await mudar(p.conversa_id, 'arquivar'), { ok: true, status: 'arquivado' });
  const dirs = (await db.query('select status, erro from app.direcoes where conversa_id = $1', [p.conversa_id])).rows;
  assert.equal(dirs.length, 3);
  assert.ok(dirs.every(d => d.status === 'falhou' && d.erro === 'pedido arquivado'), 'nenhuma direção segue "gerando"');
  assert.equal((await um('select etapa from app.conversas where id = $1', [p.conversa_id])).etapa, 'contato');
  assert.equal((await pedido(p.conversa_id)).status, 'arquivado');
});

test('"Já avisei" com uma direção ainda em "gerando": avisa as prontas mas o pedido segue na fila até a última sair', async () => {
  const p = await pedidoAguardando();
  await confirmar(p.conversa_id);
  const ids = (await db.query("select id from app.direcoes where conversa_id = $1 order by numero", [p.conversa_id])).rows.map(r => r.id);
  for (const id of ids.slice(0, 2)) await rpc('vendas_concluir_direcao', { direcao_id: id, conteudo: { secoes: [] }, modelo: 'teste' });
  assert.equal((await rpc('vendas_marcar_avisado', { org_slug: 'beyon-zero', conversa_id: p.conversa_id })).avisadas, 2);
  assert.equal((await pedido(p.conversa_id)).concluido_em, null, 'falta uma direção: o dono ainda tem trabalho');
  await rpc('vendas_concluir_direcao', { direcao_id: ids[2], conteudo: { secoes: [] }, modelo: 'teste' });
  assert.equal((await rpc('vendas_marcar_avisado', { org_slug: 'beyon-zero', conversa_id: p.conversa_id })).avisadas, 1);
  assert.ok((await pedido(p.conversa_id)).concluido_em, 'nenhuma em "gerando": concluído');
});

test('pendentes: a lista traz só os 50 mais novos, e a busca pelo código acha um pedido que está fora deles', async () => {
  const antigo = await pedidoAguardando();
  for (let i = 0; i < 50; i++) await pedidoAguardando();
  const lista = await rpc('vendas_pedidos_pendentes', { org_slug: 'beyon-zero' });
  assert.equal(lista.itens.length, 50);
  assert.ok(lista.total >= 51);
  assert.ok(!lista.itens.some(x => x.conversa_id === antigo.conversa_id), 'o mais antigo ficou fora dos 50');
  const busca = await rpc('vendas_pedidos_pendentes', { org_slug: 'beyon-zero', codigo: antigo.codigo });
  assert.deepEqual(busca.itens.map(x => x.conversa_id), [antigo.conversa_id]);
  assert.equal(busca.total, 1);
});

test('pedido já encerrado: descartar de novo e descartar expirado são recusados; confirmar o que já foi confirmado devolve a situação', async () => {
  const d = await pedidoAguardando();
  await mudar(d.conversa_id, 'descartar');
  assert.equal((await erroDe(mudar(d.conversa_id, 'descartar')))?.codigo, REGRA, 'descartar duas vezes');
  const e = await pedidoAguardando();
  await vencer(e.conversa_id);
  assert.deepEqual(await confirmar(e.conversa_id), { ok: false, status: 'expirado' });
  assert.equal((await erroDe(mudar(e.conversa_id, 'descartar')))?.codigo, REGRA, 'descartar o expirado');
  const f = await pedidoAguardando();
  await confirmar(f.conversa_id);
  await concluirDirecoes(f.conversa_id, { erro: 'teste' });   /* as três falham: a conversa volta a "contato" */
  assert.equal((await um('select etapa from app.conversas where id = $1', [f.conversa_id])).etapa, 'contato');
  assert.deepEqual(await confirmar(f.conversa_id), { ok: false, status: 'confirmado' }, 'confirmar de novo não regera');
});

/* ---------- a fila só de confirmados (20261013120200_fila_confirmados.sql) ---------- */
const fila = async () => (await rpc('vendas_fila_direcoes', { org_slug: 'beyon-zero' })).itens;

test('fila: só os pedidos na fila (descartado, arquivado, aguardando e concluído ficam fora); prontos para avisar vêm antes', async () => {
  const aguardando = await pedidoAguardando();
  const produzir = await pedidoAguardando({ suspeito: true });
  await confirmar(produzir.conversa_id);
  const avisar = await pedidoAguardando();
  await confirmar(avisar.conversa_id);
  await concluirDirecoes(avisar.conversa_id);
  const descartado = await pedidoAguardando();
  await confirmar(descartado.conversa_id);
  await mudar(descartado.conversa_id, 'descartar');
  const arquivado = await pedidoAguardando();
  await confirmar(arquivado.conversa_id);
  await mudar(arquivado.conversa_id, 'arquivar');
  const f = await fila(), ids = f.map(x => x.conversa_id);
  for (const [nome, p] of [['aguardando', aguardando], ['descartado', descartado], ['arquivado', arquivado]])
    assert.ok(!ids.includes(p.conversa_id), nome + ': fora da fila de trabalho');
  const i = ids.indexOf(avisar.conversa_id), j = ids.indexOf(produzir.conversa_id);
  assert.ok(i >= 0 && j >= 0 && i < j, 'prontos para avisar antes dos que faltam produzir');
  assert.equal(f[i].prioridade, 1);
  assert.equal(f[j].prioridade, 2);
  assert.equal(f[j].codigo, produzir.codigo);
  assert.equal(f[j].suspeito, true);
  assert.ok(f[j].contato.telefone && f[j].briefing.negocio.nome, 'o que o dono precisa para produzir');
});

test('fila: nunca esconde nem sobra — o total é exatamente o número de pedidos na fila (a mesma regra do teto), sem o corte de 50', async () => {
  for (let k = 0; k < 52; k++) await confirmar((await pedidoAguardando()).conversa_id);
  const r = await rpc('vendas_fila_direcoes', { org_slug: 'beyon-zero' });
  assert.equal(r.total, r.itens.length);
  assert.equal(r.total, await naFila(), 'fila = pedido_na_fila');
  assert.ok(r.total >= 52);
});

/* ---------- a conferência da promoção: nenhuma conversa do fluxo antigo some da fila (docs/revisoes/fila-antiga-vazia.sql) ---------- */
/* o arquivo tem DUAS consultas, uma por linha: (1) direção na fila antiga, sem pedido; (2) conversa antiga parada em 'contato' (com lead, sem pedido) */
const [CONSULTA_FILA_ANTIGA, CONSULTA_CONTATO_ANTIGO, ...SOBRA] = fs.readFileSync(new URL('../revisoes/fila-antiga-vazia.sql', import.meta.url), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const contar = async (banco, consulta) => Number((await banco.query(consulta)).rows[0].count);
const filaAntiga = banco => contar(banco, CONSULTA_FILA_ANTIGA);
const contatoAntigo = banco => contar(banco, CONSULTA_CONTATO_ANTIGO);
/* uma conversa montada do jeito antigo: sem linha em app.pedidos, com as direções que o teste pedir */
async function conversaAntiga(etapa, direcoes) {
  const b = await comPacote();
  await forcarEtapa(b.conversa_id, etapa);
  for (const d of direcoes)
    await db.query(`insert into app.direcoes (org_id, conversa_id, geracao, numero, estrategia, status, conteudo, avisada_em)
      values ($1, $2, $3, $4, $5, $6, $7, $8)`, [ORG, b.conversa_id, d.geracao ?? 1, d.numero, ['conversao', 'autoridade', 'experiencia'][d.numero - 1], d.status,
      d.status === 'pronta' ? '{"secoes":[]}' : null, d.avisada_em ?? null]);
  return b.conversa_id;
}

test('promoção: a consulta da fila antiga dá 0 num banco sem conversa antiga e conta SÓ o que a fila antiga mostrava', async () => {
  const vazio = await novoBanco();
  assert.equal(await filaAntiga(vazio), 0, 'banco sem conversa antiga');
  await vazio.close?.();
  const base = await filaAntiga(db);
  const nova = async (etapa, direcoes) => { await conversaAntiga(etapa, direcoes); return (await filaAntiga(db)) - base; };
  const tres = status => [1, 2, 3].map(numero => ({ numero, status }));
  const tresProntas = avisada_em => [1, 2, 3].map(numero => ({ numero, status: 'pronta', avisada_em }));
  assert.equal(await nova('gerando', tres('gerando')), 1, 'direção na fila (gerando), etapa da lista, sem pedido');
  const depois1 = await filaAntiga(db);
  await conversaAntiga('direcoes', tresProntas(null));
  assert.equal(await filaAntiga(db), depois1 + 1, 'pronta e não avisada');
  await conversaAntiga('direcoes', tresProntas(new Date().toISOString()));
  assert.equal(await filaAntiga(db), depois1 + 1, 'pronta e já avisada: fora');
  await conversaAntiga('gerando', [...tres('gerando'), ...[1, 2, 3].map(numero => ({ geracao: 2, numero, status: 'falhou' }))]);
  assert.equal(await filaAntiga(db), depois1 + 1, 'só a ÚLTIMA geração conta: a antiga ainda "gerando" não vale');
  await conversaAntiga('encerrada', tres('gerando'));
  await conversaAntiga('estimativa', tres('gerando'));
  assert.equal(await filaAntiga(db), depois1 + 1, 'etapa fora da lista da fila antiga: fora');
  const comPedido = await pedidoAguardando();
  await confirmar(comPedido.conversa_id);   /* (as três direções nascem "gerando", mas há pedido: aparece na fila nova) */
  assert.equal(await filaAntiga(db), depois1 + 1, 'com linha em app.pedidos: fora');
  assert.equal(await um('select count(*) n from app.direcoes where conversa_id = $1 and status = $2', [comPedido.conversa_id, 'gerando']).then(r => Number(r.n)), 3);
});

test('promoção: a conversa antiga parada em "contato" (lead, sem pedido) é contada; com pedido, sem lead ou em outra etapa, não', async () => {
  assert.equal(SOBRA.length, 0, 'o arquivo tem exatamente duas consultas');
  assert.match(CONSULTA_CONTATO_ANTIGO, /^select count\(\*\) from app\.conversas c where c\.etapa = 'contato' and c\.lead_id is not null and not exists/);
  const vazio = await novoBanco();
  assert.equal(await contatoAntigo(vazio), 0, 'banco sem conversa antiga');
  await vazio.close?.();
  const base = await contatoAntigo(db);
  const b = await comPacote();
  await rpc('vendas_informar_contato', { ...b, nome: 'Ana', telefone: '+5521999990000', aceite: true });   /* o fluxo antigo: contato sem pedido */
  assert.equal((await um('select etapa from app.conversas where id = $1', [b.conversa_id])).etapa, 'contato');
  assert.equal(await contatoAntigo(db), base + 1, 'contato + lead, sem pedido: conta');
  await pedidoAguardando();   /* contato + lead + pedido: fora */
  assert.equal(await contatoAntigo(db), base + 1, 'com pedido: fora');
  const semLead = await comPacote();
  await forcarEtapa(semLead.conversa_id, 'contato');
  assert.equal(await contatoAntigo(db), base + 1, 'em contato, mas sem lead: fora');
  const outra = await comPacote();
  await rpc('vendas_informar_contato', { ...outra, nome: 'Bia', telefone: '+5521999990001', aceite: true });
  await forcarEtapa(outra.conversa_id, 'encerrada');
  assert.equal(await contatoAntigo(db), base + 1, 'lead sem pedido, mas fora de "contato": fora');
});

test('promoção: o cabeçalho da migration e o plano citam o MESMO texto das DUAS consultas', () => {
  const migration = fs.readFileSync(new URL('../../supabase/migrations/20261013120200_fila_confirmados.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const plano = fs.readFileSync(new URL('../superpowers/plans/2026-10-13-orcamento-sem-ia-pr2a.md', import.meta.url), 'utf8');
  const pendencias = fs.readFileSync(new URL('../revisoes/pr1-pendencias.md', import.meta.url), 'utf8');
  for (const [nome, consulta] of [['fila antiga', CONSULTA_FILA_ANTIGA], ['contato antigo', CONSULTA_CONTATO_ANTIGO]]) {
    assert.ok(migration.includes('--   ' + consulta + '\n'), 'cabeçalho da migration: ' + nome);
    assert.ok(plano.includes('`' + consulta + '`'), 'linha PR2a da Task 9: ' + nome);
    assert.ok(pendencias.includes('`' + consulta + '`'), 'linha PR2a de docs/revisoes/pr1-pendencias.md: ' + nome);
  }
});

/* PR 2b-1, pendências PR2a-teto-pacotes, PR2a-ordem-trava, PR2a-dono-leitura e PR2a-testes-borda */
test('estimativa (o caminho do consultor): o mesmo teto de 30 pacotes por conversa das respostas', async () => {
  const b = await comPacote();   /* (já gravou 1) */
  for (let i = 0; i < 29; i++) await rpc('vendas_registrar_estimativa', { ...b, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 });
  assert.equal((await erroDe(rpc('vendas_registrar_estimativa', { ...b, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 })))?.codigo, REGRA, 'a 31ª é recusada');
});

test('trava das direções em ordem fixa (sem espera circular) e a consulta leve do dono sem trava', async () => {
  const fonte = async nome => (await um("select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = $1", [nome])).prosrc;
  assert.match(await fonte('vendas_mudar_pedido'), /order by d\.id\s+for update of d/i, 'PR2a-ordem-trava');
  /* a ordem importa: as direções (por id) travam ANTES da conversa; o contrário reabre a espera circular com vendas_concluir_direcao */
  const mudar = await fonte('vendas_mudar_pedido');
  assert.ok(mudar.indexOf('for update of d') !== -1 && mudar.indexOf('for update of d') < mudar.indexOf('conversa_da_org('), 'as direções travam antes da conversa');
  const dono = await fonte('vendas_conversa_dono');
  assert.doesNotMatch(dono, /for update|conversa_do\(/i, 'PR2a-dono-leitura: a leitura não trava a conversa');
  const b = await comPacote();
  assert.equal((await rpc('vendas_conversa_dono', { ...b, etapas: ['estimativa'] })).etapa, 'estimativa', 'continua funcionando');
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, visitante_id: randomUUID(), etapas: ['estimativa'] })))?.codigo, NAO_ACHOU, 'outro visitante');
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, etapas: ['contato'] })))?.codigo, ETAPA, 'etapa fora da lista');
});

test('bordas das funções do PR 2a (PR2a-testes-borda): outro visitante ou organização → P0002 (respostas, mudar_pedido, marcar_avisado); entrada inválida → 22023', async () => {
  const b = await comPacote();
  assert.equal((await erroDe(rpc('vendas_registrar_respostas', { ...b, visitante_id: randomUUID(), briefing: {}, confianca: 0 })))?.codigo, NAO_ACHOU);
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, etapas: { estimativa: true } })))?.codigo, INVALIDO, 'etapas que não são lista');
  assert.equal((await erroDe(rpc('vendas_mudar_pedido', { org_slug: 'outra', conversa_id: b.conversa_id, acao: 'arquivar' })))?.codigo, NAO_ACHOU);
  /* o "Já avisei" de outra organização não acha a conversa: P0002, e nada é avisado (não devolve { avisadas: 0 }) */
  assert.equal((await erroDe(rpc('vendas_marcar_avisado', { org_slug: 'outra', conversa_id: b.conversa_id })))?.codigo, NAO_ACHOU, 'marcar_avisado de outra organização');
});
