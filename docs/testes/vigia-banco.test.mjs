/* O VIGIA NO BANCO (spec 2026-11-15-auto-reparo, D2): a memória do vigia (app.vigia) e a leitura dos números que ele confere,
   numa função só (app.rotinas_vigia_ler), e a gravação do estado (app.rotinas_vigia_gravar). Só service_role; sem dado pessoal:
   só item, datas e contagens.  PGlite real.  node --test docs/testes/vigia-banco.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg, ORG } from './_entrega.mjs';

const C1 = '11111111-0000-4000-8000-000000000001';
const C2 = '11111111-0000-4000-8000-000000000002';
const C3 = '11111111-0000-4000-8000-000000000003';
const LER = { org_slug: 'beyon-zero' };

async function banco() {
  const db = await novoBanco();
  await prepararOrg(db);
  return { db, rpc: rpcDe(db) };
}
const chamada = (db, conversa, erro, minutosAtras) => db.query(
  `insert into app.ia_chamadas (org_id, conversa_id, papel, erro, created_at) values ($1, $2, 'conversa', $3, now() - make_interval(mins => $4))`,
  [ORG, conversa, erro, minutosAtras]);

test('vigia: com tudo vazio (chamadas de IA só de mais de 30 dias: fora da janela), a leitura devolve estado vazio, contagens zero e datas nulas', async () => {
  const { db, rpc } = await banco();
  await chamada(db, C1, 'indisponivel', 60 * 24 * 31); await chamada(db, C1, null, 60 * 24 * 40);
  const r = await rpc('rotinas_vigia_ler', LER);
  assert.deepEqual(r, { estado: {}, estreia_em: null, falhas_ia_hora: 0, conversas_falha_hora: 0, ultima_falha_conta_em: null,
    ultima_ok_ia_em: null, ultima_falha_ia_em: null, ultima_reconciliacao_em: null, ultima_diaria_em: null, urgentes: 0 });
});

test('vigia: conta as falhas do provedor da última hora e de quantas conversas; a falha de conta e o último sucesso, sem janela', async () => {
  const { db, rpc } = await banco();
  await chamada(db, C1, 'tempo', 5); await chamada(db, C1, 'falha', 10); await chamada(db, C2, 'limite', 50);
  await chamada(db, C3, 'tempo', 120);               /* fora da hora */
  await chamada(db, C3, 'entrada', 1);               /* do conteúdo: não conta */
  await chamada(db, C3, 'indisponivel', 3000);       /* conta recusada há dois dias */
  await chamada(db, C2, null, 30);                   /* deu certo */
  const r = await rpc('rotinas_vigia_ler', LER);
  assert.equal(r.falhas_ia_hora, 3); assert.equal(r.conversas_falha_hora, 2);
  const minutos = iso => Math.round((Date.now() - Date.parse(iso)) / 60e3);
  assert.equal(minutos(r.ultima_falha_ia_em), 5); assert.equal(minutos(r.ultima_ok_ia_em), 30); assert.equal(minutos(r.ultima_falha_conta_em), 3000);
});

test('vigia: a última reconciliação, a última rotina diária e os alertas urgentes abertos dos últimos 7 dias', async () => {
  const { db, rpc } = await banco();
  await db.query(`insert into app.pagamentos_auditoria (evento, origem, created_at) values ('payment.reconciled', 'reconciliacao', now() - interval '2 hours'),
    ('payment.reconciled', 'reconciliacao', now() - interval '9 hours'), ('payment.created', 'criacao', now())`);
  await db.query(`insert into app.rotinas_execucoes (dia, rotina, ok, updated_at) values (current_date - 1, 'diaria', true, now() - interval '20 hours')`);
  await db.query(`insert into app.alertas (org_id, dia, tipo, nivel, mensagem, resolvido_em) values
    ($1, current_date - 3, 'pagamento_atencao', 'urgente', 'x', null),
    ($1, current_date - 2, 'rotina_falhou', 'urgente', 'x', now()),
    ($1, current_date - 8, 'prazo_vencido', 'urgente', 'x', null),
    ($1, current_date, 'freio_ip', 'aviso', 'x', null)`, [ORG]);
  const r = await rpc('rotinas_vigia_ler', LER);
  const horas = iso => Math.round((Date.now() - Date.parse(iso)) / 3600e3);
  assert.equal(horas(r.ultima_reconciliacao_em), 2); assert.equal(horas(r.ultima_diaria_em), 20);
  assert.equal(r.urgentes, 1, 'só o urgente aberto dos últimos 7 dias');
});

test('vigia: grava o estado e lê de volta; a estreia vem do item "estreia"; regravar atualiza', async () => {
  const { rpc } = await banco();
  const agora = new Date('2026-11-15T10:00:00Z').toISOString();
  const r = await rpc('rotinas_vigia_gravar', { itens: [
    { item: 'estreia', ativo: false, desde: agora, avisado_em: agora },
    { item: 'paginas', ativo: true, desde: agora, avisado_em: null }] });
  assert.equal(r.gravados, 2);
  await rpc('rotinas_vigia_gravar', { itens: [{ item: 'paginas', ativo: false, desde: null, avisado_em: agora }] });
  await rpc('rotinas_vigia_gravar', { itens: [{ item: 'alertas_urgentes', ativo: true, desde: agora, avisado_em: agora, detalhe: 'Há 2 alertas urgentes no painel esperando você.' }] });
  const l = await rpc('rotinas_vigia_ler', LER);
  assert.equal(l.estado.alertas_urgentes.detalhe, 'Há 2 alertas urgentes no painel esperando você.', 'o texto avisado volta na leitura');
  assert.equal(l.estado.paginas.detalhe, null);
  delete l.estado.alertas_urgentes;
  assert.equal(Date.parse(l.estreia_em), Date.parse(agora));
  assert.deepEqual(Object.keys(l.estado).sort(), ['estreia', 'paginas']);
  assert.equal(l.estado.paginas.ativo, false); assert.equal(l.estado.paginas.desde, null); assert.equal(Date.parse(l.estado.paginas.avisado_em), Date.parse(agora));
});

test('vigia: item fora da lista, lista vazia ou grande demais é recusado (22023)', async () => {
  const { db } = await banco();
  const tentar = p => como(db, 'service_role', q => q('select app.rotinas_vigia_gravar($1::jsonb)', [JSON.stringify(p)]), { manter: false });
  for (const p of [{ itens: [{ item: 'qualquer', ativo: true }] }, { itens: [] }, { itens: 'x' }, {},
    { itens: Array.from({ length: 21 }, () => ({ item: 'paginas', ativo: true })) }]) {
    assert.equal((await erroDe(tentar(p)))?.codigo, '22023', JSON.stringify(p).slice(0, 60));
  }
});

test('vigia: anon e authenticated não leem a tabela nem chamam as funções', async () => {
  const { db } = await banco();
  for (const quem of ['anon', '22222222-0000-4000-8000-000000000002']) {
    for (const sql of ['select * from app.vigia', `select app.rotinas_vigia_ler('{"org_slug":"beyon-zero"}'::jsonb)`,
      `select app.rotinas_vigia_gravar('{"itens":[{"item":"paginas","ativo":true}]}'::jsonb)`]) {
      assert.equal((await erroDe(como(db, quem, q => q(sql), { manter: false })))?.codigo, '42501', quem + ': ' + sql);
    }
  }
});
