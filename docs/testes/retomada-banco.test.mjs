/* O LINK DE RETOMADA e o LEMBRETE no banco (PR 2b-2; spec docs/specs/2026-10-11-orcamento-sem-ia.md §3, "Espera útil"):
   o código guardado só como hash, um valendo por vez, uso único, validade, a conversa passa para o visitante do novo
   aparelho; o lembrete 2 dias depois do aviso, uma vez. Postgres de verdade (PGlite) com as migrations reais. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { telefoneE164DeTeste } from './_pedido.mjs';

const ORG = '99999999-0000-4000-8000-000000000099';
const REGRAS = 'dddddddd-0000-4000-8000-0000000000d0';
let db;
const rpc = (nome, p) => como(db, 'service_role', q => q(`select app.${nome}($1::jsonb) as r`, [JSON.stringify(p)])).then(x => x.rows[0].r);
const hex = s => createHash('sha256').update(String(s)).digest('hex');
const um = async (sql, params) => (await db.query(sql, params)).rows[0];
/* o código SQLSTATE de uma chamada que deve falhar (erroDe devolve { codigo, msg } ou null) */
const codigoDe = async promessa => (await erroDe(promessa))?.codigo;

before(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into app.organizacoes (id, slug, nome) values ('${ORG}', 'beyon-zero', 'Beyon Zero');
    insert into app.organizacoes (id, slug, nome) values ('99999999-0000-4000-8000-000000000098', 'outra', 'Outra');
    insert into app.regras_comerciais (id, org_id, versao, status, regras, aprovada_em) values ('${REGRAS}', '${ORG}', 1, 'ativa', '{"moeda":"BRL"}', now());
  `);
});

async function forcarEtapa(conversa, etapa) {
  await db.transaction(async tx => {
    await tx.exec("set local bz.transicao_livre = 'on'");
    await tx.query('update app.conversas set etapa = $1 where id = $2', [etapa, conversa]);
  });
}
/* um pedido confirmado, na etapa "direcoes", com as três direções prontas (como o dono deixa depois de entregar) */
async function pedidoPronto({ confirmar = true } = {}) {
  const v = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  const base = { conversa_id: c, visitante_id: v };
  await rpc('vendas_registrar_estimativa', { ...base, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 });
  const telefone = telefoneE164DeTeste();
  /* (a função BASE, sem a confirmação automática: estes testes confirmam à mão e testam o que vem depois) */
  const d = (await db.query('select app.vendas_registrar_detalhes_base($1::jsonb) as r', [JSON.stringify({ ...base, telefone, telefone_hash: hex('tel|' + telefone), nome: 'Ana Souza', aceite: true,
    briefing: { negocio: { nome: 'Clínica Sol', descricao: 'Consultas e exames' } }, redes: {}, suspeito: false, chave_ip: null, max_por_ip: 3, max_por_telefone_dia: 2, teto_fila: 1000, horas: 72 })])).rows[0].r;
  assert.equal(d.ok, true, JSON.stringify(d));
  if (confirmar) await rpc('vendas_confirmar_whatsapp', { org_slug: 'beyon-zero', conversa_id: c });
  return { ...base, codigo: d.codigo };
}
/* a confirmação do dono já deixa as três direções "gerando" na fila; aqui elas ficam prontas (e avisadas, se for o caso) */
async function comDirecoesProntas(b, { avisadaHa = null } = {}) {
  await forcarEtapa(b.conversa_id, 'direcoes');
  await db.query(`update app.direcoes set status = 'pronta', conteudo = '{}'::jsonb, avisada_em = $2 where conversa_id = $1`,
    [b.conversa_id, avisadaHa === null ? null : new Date(Date.now() - avisadaHa)]);
}
const criar = (b, codigo, extra = {}) => rpc('vendas_criar_retomada', { org_slug: 'beyon-zero', conversa_id: b.conversa_id, codigo_hash: hex(codigo), dias: 7, ...extra });
const usar = async (codigo) => {
  const novo = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [novo]);
  return { novo, r: await rpc('vendas_usar_retomada', { org_slug: 'beyon-zero', codigo_hash: hex(codigo), visitante_id: novo }) };
};

test('retomada: criar guarda só o hash, com validade; usar passa a conversa para o visitante novo, uma vez', async () => {
  const b = await pedidoPronto();
  await comDirecoesProntas(b);
  const r = await criar(b, 'codigo-1');
  const dias = (new Date(r.expira_em) - Date.now()) / 864e5;
  assert.ok(dias > 6.99 && dias <= 7, 'vale 7 dias: ' + dias);
  const linha = await um('select codigo_hash, usada_em from app.retomadas where conversa_id = $1', [b.conversa_id]);
  assert.equal(linha.codigo_hash, hex('codigo-1'), 'só o hash, nunca o código');
  assert.equal(linha.usada_em, null);
  const { novo, r: u } = await usar('codigo-1');
  assert.deepEqual(u, { ok: true, conversa_id: b.conversa_id });
  assert.equal((await um('select visitante_id from app.conversas where id = $1', [b.conversa_id])).visitante_id, novo);
  const estado = await rpc('vendas_estado', { conversa_id: b.conversa_id, visitante_id: novo });
  assert.equal(estado.conversa.id, b.conversa_id, 'o visitante novo lê o estado');
  assert.equal(await codigoDe(rpc('vendas_estado', { conversa_id: b.conversa_id, visitante_id: b.visitante_id })), 'P0002', 'o aparelho antigo perde o acesso');
  assert.deepEqual((await usar('codigo-1')).r, { ok: false }, 'uso único');
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'retomada_usada'", [b.conversa_id]));
});

test('retomada: um link valendo por vez, vencido não abre, código desconhecido não abre', async () => {
  const b = await pedidoPronto();
  await comDirecoesProntas(b);
  await criar(b, 'velho');
  await criar(b, 'novo');
  assert.deepEqual((await usar('velho')).r, { ok: false }, 'o novo apaga o que não foi usado');
  await db.query("update app.retomadas set expira_em = now() - interval '1 minute' where conversa_id = $1", [b.conversa_id]);
  assert.deepEqual((await usar('novo')).r, { ok: false }, 'vencido');
  assert.deepEqual((await usar('nunca-existiu')).r, { ok: false });
});

test('retomada: só pedido confirmado e nas etapas do pedido; de outra organização, P0002; parâmetros fora do formato, 22023', async () => {
  const semConfirmar = await pedidoPronto({ confirmar: false });
  assert.equal(await codigoDe(criar(semConfirmar, 'x')), '55000');
  const b = await pedidoPronto();
  await comDirecoesProntas(b);
  assert.equal(await codigoDe(rpc('vendas_criar_retomada', { org_slug: 'outra', conversa_id: b.conversa_id, codigo_hash: hex('x'), dias: 7 })), 'P0002');
  assert.equal(await codigoDe(criar(b, 'x', { codigo_hash: 'nao-e-hash' })), '22023');
  assert.equal(await codigoDe(criar(b, 'x', { dias: 30 })), '22023');
  await criar(b, 'no-pagamento');
  await forcarEtapa(b.conversa_id, 'aguardando_pagamento');
  assert.deepEqual((await usar('no-pagamento')).r, { ok: false }, 'fora das etapas do pedido, o link não abre');
  assert.equal(await codigoDe(criar(b, 'y')), '55000');
  const d = await pedidoPronto();
  await comDirecoesProntas(d);
  await criar(d, 'descartado');
  await rpc('vendas_mudar_pedido', { org_slug: 'beyon-zero', conversa_id: d.conversa_id, acao: 'descartar' });
  assert.deepEqual((await usar('descartado')).r, { ok: false }, 'pedido descartado não reabre');
});

test('retomada: anon e authenticated não executam as funções novas', async () => {
  for (const papel of ['anon', 'authenticated']) {
    for (const f of ['vendas_criar_retomada', 'vendas_usar_retomada', 'vendas_lembretes', 'vendas_marcar_lembrete']) {
      assert.equal(await codigoDe(como(db, papel, q => q(`select app.${f}('{}'::jsonb)`))), '42501', papel + ' ' + f);
    }
  }
});

test('lembrete: só avisados há 2 dias ou mais, ainda sem escolha e sem lembrete; marcar uma vez tira da lista', async () => {
  const pronto = await pedidoPronto();
  await comDirecoesProntas(pronto, { avisadaHa: 2 * 864e5 + 60e3 });
  const cedo = await pedidoPronto();
  await comDirecoesProntas(cedo, { avisadaHa: 864e5 });
  const semAviso = await pedidoPronto();
  await comDirecoesProntas(semAviso);
  const escolheu = await pedidoPronto();
  await comDirecoesProntas(escolheu, { avisadaHa: 3 * 864e5 });
  await forcarEtapa(escolheu.conversa_id, 'escolhida');
  const l = await rpc('vendas_lembretes', { org_slug: 'beyon-zero', dias: 2 });
  const ids = l.itens.map(i => i.conversa_id);
  assert.ok(ids.includes(pronto.conversa_id));
  for (const fora of [cedo, semAviso, escolheu]) assert.ok(!ids.includes(fora.conversa_id));
  const item = l.itens.find(i => i.conversa_id === pronto.conversa_id);
  assert.equal(item.codigo, pronto.codigo);
  assert.equal(item.contato.nome, 'Ana Souza');
  assert.match(item.contato.telefone, /^\+55/);
  assert.deepEqual(await rpc('vendas_marcar_lembrete', { org_slug: 'beyon-zero', conversa_id: pronto.conversa_id }), { lembrados: 1 });
  assert.deepEqual(await rpc('vendas_marcar_lembrete', { org_slug: 'beyon-zero', conversa_id: pronto.conversa_id }), { lembrados: 0 }, 'uma vez');
  assert.ok(!(await rpc('vendas_lembretes', { org_slug: 'beyon-zero', dias: 2 })).itens.some(i => i.conversa_id === pronto.conversa_id));
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'lembrete_enviado'", [pronto.conversa_id]));
});

test('estado: o pedido traz a data da confirmação (a espera útil calcula o prazo por ela)', async () => {
  const b = await pedidoPronto();
  const e = await rpc('vendas_estado', { conversa_id: b.conversa_id, visitante_id: b.visitante_id });
  assert.ok(e.pedido.confirmado_em, JSON.stringify(e.pedido));
  assert.equal(e.pedido.status, 'confirmado');
});
