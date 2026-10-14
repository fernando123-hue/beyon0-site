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
  const linhas = async () => Number((await um('select count(*) n from privado.freio_ip')).n);
  const antes = await linhas();
  assert.equal((await detalhes(await comPacote(), { chave_ip: null })).ok, true, 'sem chave (servidor local sem segredo): não conta');
  assert.equal(await linhas(), antes, 'sem chave: o freio_ip não ganhou linha');
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

test('gerar antes da confirmação: recusado; sem pedido (o caminho antigo do consultor), o banco ainda aceita (a API recusa, Task 7)', async () => {
  const p = await pedidoAguardando();
  assert.equal((await erroDe(rpc('vendas_iniciar_geracao', { conversa_id: p.conversa_id, visitante_id: p.visitante_id })))?.codigo, ETAPA);
  const b = await comPacote();
  await rpc('vendas_informar_contato', { ...b, nome: 'Ana', telefone: '+5521999990000', aceite: true });
  assert.equal((await rpc('vendas_iniciar_geracao', b)).nova, true);
});

test('conclusão automática: as três direções falham → o pedido sai da fila, do teto e libera o telefone', async () => {
  const telefone = telefoneNovo();
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
  const telefone = telefoneNovo();
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
  assert.deepEqual(busca.itens.map(x => x.conversa_id), [a.conversa_id], 'a busca acha o pedido mesmo fora dos 50 mais novos');
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
