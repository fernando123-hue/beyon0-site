/* A ROTINA DIÁRIA E OS PRAZOS (PR 3b-3; spec §2.1, §5, §10; D4, D5): o alarme de prazo vencido (urgente: a regra devolve a entrada), 30 dias sem material (só enquanto o aviso de material parado não foi registrado),
   os 3 dias do restante (vencido: mais de 3 dias desde o REGISTRO do aviso "no ar"), só com CONTAGEM; a lista de ajustes some 30 dias depois da última atividade; e a prévia parada há um ano NÃO muda de passo nem
   gera alerta (D5); o pedido parado esperando o material (22/10) também NÃO muda de passo nem é encerrado. Sem cron novo.  PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, forcarEntrega } from './_previa.mjs';
import { executar } from '../../api/rotinas.mjs';
import { readFileSync, existsSync } from 'node:fs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const diasAtras = n => new Date(Date.now() - n * 864e5).toISOString();
const CRON = 'c'.repeat(40);
const rodar = () => executar(new Request('http://x/api/rotinas?acao=diaria', { headers: { authorization: 'Bearer ' + CRON, 'x-forwarded-for': '203.0.113.9' } }),
  { CRON_SECRET: CRON }, { banco: rpc, armazem: { remover: async () => {} }, metricas: null });
const alertas = async () => (await db.query('select tipo, nivel, mensagem from app.alertas order by tipo')).rows;

test('os três alarmes viram alerta (só contagem, sem dado pessoal); a prévia parada e o material parado há 400 dias NÃO geram nada e NÃO mudam de passo (D5 e 22/10)', async () => {
  const material = await entregaEm(db, 'material');
  await forcarEntrega(db, material, { prazo: JSON.stringify({ entrada_em: diasAtras(31) }) });
  /* 22/10: o pedido sem material, com o aviso de material parado já registrado, fica PARADO: sem alarme diário, sem prazo vencido, sem encerrar, sem publicar */
  const paradoSemMaterial = await entregaEm(db, 'material');
  await forcarEntrega(db, paradoSemMaterial, { prazo: JSON.stringify({ entrada_em: diasAtras(400) }), aviso_material_em: diasAtras(370) });
  const vencida = await entregaEm(db, 'producao', { prazo: 5 });
  await forcarEntrega(db, vencida, { prazo: JSON.stringify({ entrada_em: diasAtras(20), numero_em: diasAtras(20), conta_desde: diasAtras(20), pausas: [] }) });
  /* M1: o prazo corre até PUBLICAR (captação, entrega.mjs:192-202): aprovada com o prazo vencido também alarma (a pausa fechou quando o cliente aprovou) */
  const aprovada = await entregaEm(db, 'aprovada', { prazo: 5 });
  await forcarEntrega(db, aprovada, { prazo: JSON.stringify({ entrada_em: diasAtras(20), numero_em: diasAtras(20), conta_desde: diasAtras(20), pausas: [{ desde: diasAtras(18), ate: diasAtras(17) }] }) });
  /* 22/10: o restante vale 3 dias do REGISTRO do aviso "no ar": passou do 3º dia, conta; no 3º dia, ou sem o aviso registrado, não */
  const noAr = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, noAr, { no_ar_em: diasAtras(11), aviso_no_ar_feito_em: diasAtras(4) });
  const noTerceiroDia = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, noTerceiroDia, { aviso_no_ar_feito_em: diasAtras(3) });
  const semAviso = await entregaEm(db, 'no_ar');
  await forcarEntrega(db, semAviso, { no_ar_em: diasAtras(30) });
  const parada = await entregaEm(db, 'previa');
  await forcarEntrega(db, parada, { previa_em: diasAtras(400), prazo: JSON.stringify({ entrada_em: diasAtras(400), numero_em: diasAtras(400), conta_desde: diasAtras(400), pausas: [{ desde: diasAtras(399), ate: null }] }) });
  await db.query("update app.entregas set updated_at = now() - interval '400 days' where conversa_id = $1", [parada.conversa_id]);
  const antes = (await db.query('select conversa_id, passo, rodadas_usadas from app.entregas order by conversa_id')).rows;

  const r = await rodar();
  assert.equal(r.status, 200);
  const por = Object.fromEntries((await alertas()).map(a => [a.tipo, a]));
  assert.equal(por.prazo_vencido.nivel, 'urgente'); assert.match(por.prazo_vencido.mensagem, /^2 entrega\(s\) com o prazo vencido/, 'a em produção e a aprovada');
  assert.equal(por.material_30_dias.nivel, 'aviso'); assert.match(por.material_30_dias.mensagem, /^1 pedido\(s\) com 30 dias ou mais sem o material/, 'só o que ainda não teve o aviso de material parado');
  assert.equal(por.restante_3_dias.nivel, 'urgente'); assert.match(por.restante_3_dias.mensagem, /^1 site\(s\) com o prazo de 3 dias do restante vencido/);
  for (const a of Object.values(por)) assert.ok(!/BZ-|@|\d{8}/.test(a.mensagem), 'só contagem, nada pessoal: ' + a.mensagem);
  const depois = (await db.query('select conversa_id, passo, rodadas_usadas from app.entregas order by conversa_id')).rows;
  assert.deepEqual(depois, antes, 'a rotina não mudou o passo de ninguém (D5): nem encerrou o pedido parado esperando o material (22/10)');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [parada.conversa_id])).passo, 'previa');
  assert.equal((await um('select passo from app.entregas where conversa_id = $1', [paradoSemMaterial.conversa_id])).passo, 'material');
});

test('a lista de ajustes: "feito" some 30 dias depois da última atividade; a que ainda está na fila NUNCA some (a produção deve); encerrada some', async () => {
  const feita = await entregaEm(db, 'ajustes');
  const fila = await entregaEm(db, 'ajustes');
  const fim = await entregaEm(db, 'ajustes');
  const ins = async (c, status) => {
    const e = await um('select id, org_id from app.entregas where conversa_id = $1', [c.conversa_id]);
    await db.query("insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto, status) values ($1, $2, 1, 'Trocar a foto.', $3)", [e.org_id, e.id, status]);
    await db.query("update app.entregas set updated_at = now() - interval '40 days' where id = $1", [e.id]);
    return e.id;
  };
  const a = await ins(feita, 'feito'), b = await ins(fila, 'na_fila'), cc = await ins(fim, 'na_fila');
  await forcarEntrega(db, fim, { passo: 'encerrada' });
  await db.query("update app.entregas set updated_at = now() - interval '40 days' where id = $1", [cc]);
  const r = await rpc('rotinas_entregas', {});
  assert.ok(r.ajustes_apagados >= 2);
  const resta = id => um('select count(*)::int n from app.entrega_ajustes where entrega_id = $1', [id]).then(x => x.n);
  assert.equal(await resta(a), 0, 'feita há 40 dias: some');
  assert.equal(await resta(b), 1, 'na fila: fica, por mais velha que seja');
  assert.equal(await resta(cc), 0, 'pedido encerrado: some');
});

test('a rotina cabe no orçamento (não fica "parcial") e não ganha cron novo', async () => {
  const r = await (await rodar()).json();
  assert.equal(r.parcial, false);
  /* B8: os agendamentos vivem em vercel.json (Vercel) e, depois da migração, em wrangler.jsonc (Cloudflare): cada arquivo que existir mantém os dois de hoje e nenhum novo */
  const arq = f => new URL('../../' + f, import.meta.url);
  const vercel = JSON.parse(readFileSync(arq('vercel.json'), 'utf8'));
  assert.deepEqual(vercel.crons.map(c => c.schedule).sort(), ['17 9 * * *', '41 6 * * *'], 'os dois crons de hoje na Vercel: reconciliação e rotina diária');
  for (const nome of ['wrangler.jsonc', 'wrangler.json']) {
    if (!existsSync(arq(nome))) continue;
    const bloco = /"crons"\s*:\s*\[([^\]]*)\]/.exec(readFileSync(arq(nome), 'utf8'));
    assert.ok(bloco, nome + ': sem a lista de crons');
    assert.deepEqual([...bloco[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort(), ['23 */3 * * *', '41 6 * * *'], nome + ': os dois crons da Cloudflare, nenhum novo');
  }
});

test('só o backend (service_role) executa as funções da rotina: anon e authenticated recebem 42501', async () => {
  for (const papel of ['anon', 'authenticated']) {
    for (const [fn, arg] of [['rotinas_entregas', "'{}'::jsonb"], ['rotinas_conferir', "'{\"org_slug\":\"beyon-zero\"}'::jsonb"]]) {
      const e = await erroDe(como(db, papel, q => q(`select app.${fn}(${arg})`)));
      assert.equal(e && e.codigo, '42501', papel + ' não executa ' + fn);
    }
  }
  const ok = await como(db, 'service_role', q => q("select app.rotinas_entregas('{}'::jsonb) r"));
  assert.ok(Array.isArray(ok.rows[0].r.itens), 'service_role executa');
});

test('se rotinas_entregas falhar, o histórico do dia guarda entregas = null (não zeros que parecem "tudo em dia") e o alerta rotina_falhou sai', async () => {
  await db.exec('delete from app.alertas; delete from app.rotinas_execucoes');
  const banco = (nome, args) => { if (nome === 'rotinas_entregas') throw new Error('banco caiu'); return rpc(nome, args); };
  const r = await executar(new Request('http://x/api/rotinas?acao=diaria', { headers: { authorization: 'Bearer ' + CRON, 'x-forwarded-for': '203.0.113.9' } }),
    { CRON_SECRET: CRON }, { banco, armazem: { remover: async () => {} }, metricas: null });
  assert.equal(r.status, 200);
  const x = await um("select resultado, jsonb_typeof(resultado -> 'entregas') tipo from app.rotinas_execucoes where rotina = 'diaria'");
  assert.equal(x.tipo, 'null', 'entregas = null no histórico: ' + JSON.stringify(x.resultado));
  assert.ok((await alertas()).some(a => a.tipo === 'rotina_falhou'));
  await db.exec('delete from app.alertas; delete from app.rotinas_execucoes');
});

/* M1 (revisão de segurança, fix wave 2): a lista de ajustes some com a retenção, mas a PROVA de que o cliente autorizou o contato no site (quando, com qual versão do texto)
   é cópia à parte (app.entrega_contato_autorizacoes), feita ANTES do DELETE, uma vez por (entrega, rodada); ninguém lê a tabela pelo banco (nem service_role) */
test('M1: a lista com contato autorizado é apagada pela rotina e a PROVA da autorização fica; a sem contato não gera prova; rodar duas vezes não duplica', async () => {
  const com = await entregaEm(db, 'ajustes');
  const sem = await entregaEm(db, 'ajustes');
  const e1 = await um('select id, org_id from app.entregas where conversa_id = $1', [com.conversa_id]);
  const e2 = await um('select id, org_id from app.entregas where conversa_id = $1', [sem.conversa_id]);
  const autorizadoEm = '2026-09-01T12:00:00.000Z';
  await db.query(`insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto, contato_whatsapp, contato_email, contato_autorizado_em, contato_autorizacao_versao, status)
    values ($1, $2, 1, 'Trocar a foto.', '+5511987654321', 'a@b.com.br', $3, 'v2', 'feito')`, [e1.org_id, e1.id, autorizadoEm]);
  await db.query("insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto, status) values ($1, $2, 1, 'Só texto.', 'feito')", [e2.org_id, e2.id]);
  await db.query("update app.entregas set updated_at = now() - interval '40 days' where id in ($1, $2)", [e1.id, e2.id]);
  await rpc('rotinas_entregas', {});
  await rpc('rotinas_entregas', {});   // idempotente
  const resta = id => um('select count(*)::int n from app.entrega_ajustes where entrega_id = $1', [id]).then(x => x.n);
  assert.equal(await resta(e1.id), 0, 'a lista foi apagada');
  const provas = (await db.query('select * from app.entrega_contato_autorizacoes where entrega_id = $1', [e1.id])).rows;
  assert.equal(provas.length, 1, 'uma prova só, mesmo com a rotina rodando duas vezes');
  assert.equal(provas[0].rodada, 1); assert.equal(provas[0].org_id, e1.org_id);
  assert.equal(provas[0].contato_whatsapp, '+5511987654321'); assert.equal(provas[0].contato_email, 'a@b.com.br');
  assert.equal(new Date(provas[0].contato_autorizado_em).toISOString(), autorizadoEm); assert.equal(provas[0].contato_autorizacao_versao, 'v2');
  assert.ok(provas[0].copiado_em, 'quando a cópia foi feita');
  assert.equal((await um('select count(*)::int n from app.entrega_contato_autorizacoes where entrega_id = $1', [e2.id])).n, 0, 'lista sem contato: nada a provar');
});

test('M1: ninguém (anon, authenticated, service_role) lê ou escreve a tabela da prova; RLS ligada e sem política', async () => {
  for (const papel of ['anon', 'authenticated', 'service_role']) {
    const lido = await erroDe(como(db, papel, q => q('select * from app.entrega_contato_autorizacoes')));
    assert.ok(lido && ['42501', '3F000'].includes(lido.codigo), papel + ' não lê: ' + (lido && lido.codigo));
    const escrito = await erroDe(como(db, papel, q => q('delete from app.entrega_contato_autorizacoes')));
    assert.ok(escrito && ['42501', '3F000'].includes(escrito.codigo), papel + ' não apaga: ' + (escrito && escrito.codigo));
  }
  const t = await um("select relrowsecurity, (select count(*)::int from pg_policies where schemaname = 'app' and tablename = 'entrega_contato_autorizacoes') politicas from pg_class where oid = 'app.entrega_contato_autorizacoes'::regclass");
  assert.equal(t.relrowsecurity, true); assert.equal(t.politicas, 0);
});
