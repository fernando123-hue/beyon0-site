/* O MATERIAL DO PROJETO PARADO (PR 3b-3; decisão do dono de 22/10, publicada em /privacidade#material): "Se o projeto ficar parado esperando o seu material ou a sua
   autorização, ele continua reservado para você. Depois de 6 meses parado, o material é apagado, e avisamos você antes."
   • o "parado" começa no aviso de material parado (aviso_material_em) e é contado por DATA de Campo Grande: aos 5 meses o dono deve o aviso prévio (alarme "avisar antes
     de apagar", só contagem); aos 6 meses E 30 dias corridos depois do aviso prévio registrado, a rotina apaga o material (armazém primeiro, banco depois) e SÓ ele;
   • o pedido, a proposta e o pagamento ficam; o passo continua "material" e a vaga continua do cliente (nunca encerra: 22/10);
   • autorização completa do cliente (número + caixa + UF) ou material enviado (o passo muda) = nada é apagado; o cliente que mexe no material recomeça a contagem.
   Postgres real (PGlite com as migrations).  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, forcarEntrega, codigoDe } from './_previa.mjs';
import { executar } from '../../api/rotinas.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const CRON = 'c'.repeat(40);
const removidos = [];
/* o armazém de mentira apaga o objeto de verdade (storage.objects), como o de produção */
const armazemBom = { remover: async cs => { removidos.push(...cs); await db.query("delete from storage.objects where bucket_id = 'material' and name = any($1)", [cs]); } };
const rodar = (armazem = armazemBom) => executar(new Request('http://x/api/rotinas?acao=diaria', { headers: { authorization: 'Bearer ' + CRON, 'x-forwarded-for': '203.0.113.9' } }),
  { CRON_SECRET: CRON }, { banco: rpc, armazem, metricas: null });
const rodarEVer = async (armazem) => { removidos.length = 0; const r = await rodar(armazem); return { status: r.status, corpo: await r.json(), removidos: [...removidos] }; };

/* o instante em Campo Grande: o início do dia de HOJE, menos `meses` meses e `dias` dias, mais `hora` (HH:MM). Calculado no banco, com o mesmo fuso que as funções usam */
const quando = async ({ meses = 0, dias = 0 }, hora = '00:00') => new Date(1000 * Number((await um(
  "select extract(epoch from (date_trunc('day', now() at time zone 'America/Campo_Grande') - make_interval(months => $1::int, days => $2::int) + $3::interval) at time zone 'America/Campo_Grande') as t",
  [meses, dias, hora])).t)).toISOString();
const dono = async (nome, c, extra = {}) => rpc(nome, { org_slug: 'beyon-zero', codigo: await codigoDe(db, c), ...extra });
const aviso = (c, momento = 'material_apagar') => dono('vendas_aviso_feito', c, { momento });
const naFila = async c => (await rpc('vendas_avisos_lista', { org_slug: 'beyon-zero' })).itens.filter(i => i.conversa_id === c.conversa_id).map(i => i.momento);
const apagavel = async arq => ((await rpc('rotinas_material_pendencias', { limite: 200 })).caminhos).includes(arq);
const linha = c => um('select * from app.entregas where conversa_id = $1', [c.conversa_id]);
const arquivoDe = async arq => um('select status, removido_em from app.material_arquivos where caminho = $1', [arq]);
/* cada teste olha só os pedidos que ele mesmo criou: os dos testes anteriores saem da conta (sem aviso de material parado não há "parado") e os alertas do dia são limpos */
const zerar = () => db.exec("update app.entregas set aviso_material_em = null, aviso_apagar_material_em = null where passo = 'material'; delete from app.alertas;");

let n = 0;
/* um projeto parado no passo "material": o aviso de material parado em `desde`, o material (campos e uma foto no armazém) guardado antes disso */
async function parada({ desde, apagar = null, material = true, autorizado = false, passo = 'material' }) {
  const c = await entregaEm(db, passo);
  const e = await um('select id, org_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  const antes = new Date(new Date(desde).getTime() - 864e5).toISOString();
  const dados = autorizado ? '{"whatsapp":"+5521999990001","slogan":"Cuidamos de você"}' : material ? '{"slogan":"Cuidamos de você"}' : '{}';
  const negocio = autorizado ? '{"uf":"MS"}' : material ? '{"cidade":"Campo Grande"}' : '{}';
  const autorizacao = autorizado ? '{"marcada":true,"texto":"Autorizo a Beyon Zero a usar este material.","versao":1}' : '{}';
  await db.query('update app.materiais set dados = $2, negocio = $3, autorizacao = $4, updated_at = $5 where entrega_id = $1', [e.id, dados, negocio, autorizacao, antes]);
  let arq = null;
  if (material) {
    arq = e.id + '/00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
    await db.query(`insert into app.material_arquivos (org_id, entrega_id, papel, ordem, caminho, tipo_declarado, tamanho_declarado, tamanho_real, tipo_real, status, created_at, conferido_em)
      values ($1, $2, 'foto', 1, $3, 'image/jpeg', 1000, 1000, 'jpg', 'conferido', $4, $4)`, [e.org_id, e.id, arq, antes]);
    await db.query("insert into storage.objects (bucket_id, name, metadata) values ('material', $1, '{\"size\":1000}')", [arq]);
  }
  await forcarEntrega(db, c, { aviso_material_em: desde, ...(apagar ? { aviso_apagar_material_em: apagar } : {}) });
  return { ...c, entrega: e.id, arq };
}
const SEIS_MESES = { meses: 6, dias: 3 };

test('5 meses parado sem o aviso prévio: entra na fila do dono e vira o alarme "avisar antes de apagar" (só contagem); NADA é apagado', async () => {
  await zerar();
  const p = await parada({ desde: await quando({ meses: 5 }, '12:00') });
  const sem = await parada({ desde: await quando({ meses: 4, dias: 20 }, '12:00') });
  assert.deepEqual(await naFila(p), ['material_apagar']);
  assert.deepEqual(await naFila(sem), [], '4 meses e 20 dias: ainda cedo');
  const r = await rodarEVer();
  assert.equal(r.status, 200);
  const al = (await db.query("select tipo, nivel, mensagem from app.alertas where tipo = 'material_apagar'")).rows;
  assert.equal(al.length, 1);
  assert.equal(al[0].nivel, 'aviso');
  assert.match(al[0].mensagem, /^1 pedido\(s\) parado\(s\) há 5 meses ou mais/);
  assert.ok(!/BZ-|@|\d{8}/.test(al[0].mensagem), 'só contagem, nada pessoal: ' + al[0].mensagem);
  assert.deepEqual(r.removidos, [], 'sem o aviso prévio registrado, nada sai do armazém');
  assert.equal((await arquivoDe(p.arq)).status, 'conferido');
  const e = await linha(p);
  assert.deepEqual([e.passo, e.material_apagado_em, e.aviso_apagar_material_em], ['material', null, null]);
  assert.deepEqual((await um('select dados from app.materiais where entrega_id = $1', [p.entrega])).dados, { slogan: 'Cuidamos de você' });
});

test('6 meses parado, com o aviso prévio há menos de 30 dias: não apaga', async () => {
  await zerar();
  const p = await parada({ desde: await quando(SEIS_MESES, '12:00'), apagar: await quando({ dias: 29 }, '00:00') });
  assert.equal(await apagavel(p.arq), false);
  const r = await rodarEVer();
  assert.deepEqual(r.removidos, []);
  assert.equal((await arquivoDe(p.arq)).status, 'conferido');
  assert.equal((await linha(p)).material_apagado_em, null);
});

test('6 meses parado + aviso prévio há 30 dias ou mais: apaga o material e SÓ ele; o pedido, a proposta e o pagamento ficam e o passo segue "material"; rodar de novo não faz nada', async () => {
  await zerar();
  const p = await parada({ desde: await quando(SEIS_MESES, '12:00'), apagar: await quando({ dias: 31 }, '10:00') });
  const outro = await parada({ desde: await quando({ meses: 7 }, '12:00') });   /* sem aviso prévio registrado: fica */
  const conta = async c => (await um(`select (select count(*) from app.pedidos where conversa_id = $1)::int pedidos, (select count(*) from app.propostas where conversa_id = $1)::int propostas,
      (select count(*) from app.pagamentos pg join app.entregas e on e.proposta_id = pg.proposta_id where e.conversa_id = $1)::int pagamentos,
      (select etapa from app.conversas where id = $1) etapa`, [c.conversa_id]));
  const antes = await conta(p);
  assert.ok(antes.pedidos >= 1 && antes.propostas >= 1 && antes.pagamentos >= 1, 'o pedido, a proposta e o pagamento existem: ' + JSON.stringify(antes));
  const aviso0 = (await linha(p)).aviso_material_em;
  const r = await rodarEVer();
  assert.equal(r.status, 200);
  assert.ok(r.removidos.includes(p.arq), 'o armazém apagou a foto');
  assert.ok(!r.removidos.includes(outro.arq), 'o de 7 meses sem aviso prévio não');
  assert.equal(r.corpo.material.parados, 1, 'o resumo da limpeza conta o material apagado por estar parado');
  assert.equal((await arquivoDe(p.arq)).status, 'removido');
  const m = await um('select status, dados, negocio, autorizacao from app.materiais where entrega_id = $1', [p.entrega]);
  assert.deepEqual([m.status, m.dados, m.negocio], ['rascunho', {}, {}], 'os campos saem; o material continua um rascunho em que o cliente pode voltar a escrever');
  const e = await linha(p);
  assert.deepEqual([e.passo, e.encerrada_em, e.encerrada_motivo], ['material', null, null], 'o passo continua "material" e a vaga continua dele');
  assert.ok(e.material_apagado_em, 'o dia do apagamento ficou registrado');
  assert.equal(e.aviso_material_em.toISOString(), aviso0.toISOString(), 'o aviso de material parado não muda');
  assert.deepEqual(await conta(p), antes, 'o registro do pedido, da proposta e do pagamento não se apaga');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'material_apagado'", [p.conversa_id])).n, 1);
  assert.equal((await arquivoDe(outro.arq)).status, 'conferido');
  assert.equal((await linha(outro)).material_apagado_em, null);
  /* idempotente: a rotina de amanhã não repete nada */
  const feito = (await linha(p)).material_apagado_em.toISOString();
  const r2 = await rodarEVer();
  assert.ok(!r2.removidos.includes(p.arq));
  assert.equal(r2.corpo.material.parados, 0);
  assert.equal((await linha(p)).material_apagado_em.toISOString(), feito);
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'material_apagado'", [p.conversa_id])).n, 1);
  /* o cliente volta e manda o material de novo: o que ele manda agora NÃO é apagado na rotina seguinte (a contagem recomeçou) */
  const nova = p.entrega + '/00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  await db.query(`insert into app.material_arquivos (org_id, entrega_id, papel, ordem, caminho, tipo_declarado, tamanho_declarado, tamanho_real, tipo_real, status, conferido_em)
    select org_id, id, 'foto', 2, $2, 'image/jpeg', 1000, 1000, 'jpg', 'conferido', now() from app.entregas where id = $1`, [p.entrega, nova]);
  await db.query("update app.materiais set dados = '{\"slogan\":\"Voltei\"}', updated_at = now() where entrega_id = $1", [p.entrega]);
  const r3 = await rodarEVer();
  assert.ok(!r3.removidos.includes(nova), 'o material novo do cliente que voltou fica');
  assert.deepEqual((await um('select dados from app.materiais where entrega_id = $1', [p.entrega])).dados, { slogan: 'Voltei' });
});

test('com a autorização completa do cliente (número + caixa + UF), ou com o material já enviado (o passo mudou), nada é apagado nem entra na fila', async () => {
  await zerar();
  const desde = await quando({ meses: 8 }, '12:00'), apagar = await quando({ dias: 60 }, '12:00');
  const autorizado = await parada({ desde, apagar, autorizado: true });
  assert.deepEqual(await naFila(autorizado), []);
  assert.equal(await apagavel(autorizado.arq), false, 'o cliente que autorizou espera a produção dispensar o material: o dele fica');
  /* o material enviado: o passo já é producao; os campos de "parado" velhos não valem mais nada */
  const enviado = await parada({ desde, apagar, passo: 'producao' });
  assert.deepEqual(await naFila(enviado), []);
  assert.equal(await apagavel(enviado.arq), false);
  const r = await rodarEVer();
  assert.deepEqual(r.removidos, []);
  assert.equal((await db.query("select 1 from app.alertas where tipo = 'material_apagar'")).rowCount, 0, 'nenhum dos dois conta no alarme');
  for (const p of [autorizado, enviado]) {
    assert.equal((await arquivoDe(p.arq)).status, 'conferido');
    assert.equal((await linha(p)).material_apagado_em, null);
  }
});

test('o armazém que falha não marca nada: a rotina de amanhã tenta de novo e apaga', async () => {
  await zerar();
  const p = await parada({ desde: await quando(SEIS_MESES, '12:00'), apagar: await quando({ dias: 35 }, '12:00') });
  const r = await rodarEVer({ remover: async () => { throw new Error('armazém caiu'); } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, false, 'a falha vira alerta da rotina');
  assert.equal((await arquivoDe(p.arq)).status, 'conferido', 'não marcou');
  assert.deepEqual((await um('select dados from app.materiais where entrega_id = $1', [p.entrega])).dados, { slogan: 'Cuidamos de você' });
  assert.equal((await linha(p)).material_apagado_em, null);
  const amanha = await rodarEVer();
  assert.ok(amanha.removidos.includes(p.arq));
  assert.equal((await arquivoDe(p.arq)).status, 'removido');
  assert.ok((await linha(p)).material_apagado_em);
});

test('as fronteiras são por DATA de Campo Grande: 5 meses para o aviso prévio, 6 meses para o apagamento e 30 dias corridos depois do aviso', async () => {
  await zerar();
  /* o aviso prévio é devido a partir do dia em que o parado completa 5 meses (23:59 desse dia conta; 00:00 do dia seguinte, ainda não) */
  const cinco = [[{ meses: 5 }, '23:59', true], [{ meses: 5 }, '00:00', true], [{ meses: 5, dias: -1 }, '00:00', false], [{ meses: 5, dias: -1 }, '23:59', false]];
  for (const [d, h, devido] of cinco) {
    const p = await parada({ desde: await quando(d, h) });
    assert.deepEqual(await naFila(p), devido ? ['material_apagar'] : [], 'parado desde ' + JSON.stringify(d) + ' ' + h);
    await db.query('update app.entregas set aviso_material_em = null where conversa_id = $1', [p.conversa_id]);
  }
  /* o apagamento: 6 meses por data (com o aviso prévio já antigo) */
  const apagarAntigo = await quando({ dias: 60 }, '12:00');
  const seis = [[{ meses: 6 }, '23:59', true], [{ meses: 6 }, '00:00', true], [{ meses: 6, dias: -1 }, '00:00', false], [{ meses: 6, dias: -1 }, '23:59', false]];
  for (const [d, h, vai] of seis) {
    const p = await parada({ desde: await quando(d, h), apagar: apagarAntigo });
    assert.equal(await apagavel(p.arq), vai, 'parado desde ' + JSON.stringify(d) + ' ' + h);
    await db.query('update app.entregas set aviso_material_em = null where conversa_id = $1', [p.conversa_id]);
  }
  /* os 30 dias do aviso prévio: o dia 30 conta inteiro (23:59), o dia 29 não (00:00) */
  const trinta = [[{ dias: 30 }, '23:59', true], [{ dias: 30 }, '00:00', true], [{ dias: 29 }, '00:00', false], [{ dias: 29 }, '23:59', false]];
  for (const [d, h, vai] of trinta) {
    const p = await parada({ desde: await quando({ meses: 8 }, '12:00'), apagar: await quando(d, h) });
    assert.equal(await apagavel(p.arq), vai, 'aviso prévio ' + JSON.stringify(d) + ' ' + h);
    await db.query('update app.entregas set aviso_material_em = null where conversa_id = $1', [p.conversa_id]);
  }
});

test('o aviso prévio do dono (material_apagar): só no passo material, só depois do aviso de material parado, nunca com a autorização completa nem sem nada para apagar, só aos 5 meses, só uma vez', async () => {
  await zerar();
  const devido = await quando({ meses: 5 }, '12:00');
  const fora = await parada({ desde: devido, passo: 'producao' });
  assert.deepEqual(await aviso(fora), { ok: false, motivo: 'estado' });
  const semAviso = await parada({ desde: devido });
  await forcarEntrega(db, semAviso, { aviso_material_em: null });
  assert.deepEqual(await aviso(semAviso), { ok: false, motivo: 'sem_aviso' }, 'o aviso de material parado vem antes');
  const autorizado = await parada({ desde: devido, autorizado: true });
  assert.deepEqual(await aviso(autorizado), { ok: false, motivo: 'dispensar' });
  const vazio = await parada({ desde: devido, material: false });
  assert.deepEqual(await aviso(vazio), { ok: false, motivo: 'nada' }, 'sem material não há o que apagar: não se avisa');
  assert.deepEqual(await naFila(vazio), []);
  const cedo = await parada({ desde: await quando({ meses: 5, dias: -1 }, '12:00') });
  assert.deepEqual(await aviso(cedo), { ok: false, motivo: 'cedo' });
  assert.equal((await linha(cedo)).aviso_apagar_material_em, null);
  const p = await parada({ desde: devido });
  assert.deepEqual(await aviso(p), { ok: true });
  const e = await linha(p);
  assert.ok(e.aviso_apagar_material_em, 'o dia do aviso prévio ficou registrado');
  assert.deepEqual(await aviso(p), { ok: false, motivo: 'ja' }, 'uma vez só');
  assert.deepEqual(await naFila(p), [], 'saiu da fila');
  assert.equal((await um("select count(*)::int n from app.eventos_funil where conversa_id = $1 and tipo = 'aviso_registrado' and dados ->> 'momento' = 'material_apagar'", [p.conversa_id])).n, 1);
  await assert.rejects(rpc('vendas_aviso_feito', { org_slug: 'beyon-zero', codigo: await codigoDe(db, p), momento: 'nao_existe' }), /momento fora da lista/);
});

test('o cliente que mexe no material recomeça a contagem; o aviso prévio anterior à mexida não vale', async () => {
  await zerar();
  const desde = await quando({ meses: 8 }, '12:00'), apagar = await quando({ dias: 60 }, '12:00');
  /* salvou um campo há 10 dias: parado há 10 dias, não há 8 meses */
  const salvou = await parada({ desde, apagar });
  await db.query("update app.materiais set updated_at = now() - interval '10 days' where entrega_id = $1", [salvou.entrega]);
  assert.equal(await apagavel(salvou.arq), false);
  assert.deepEqual(await naFila(salvou), []);
  /* mandou uma foto há 3 meses: parado há 3 meses */
  const mandou = await parada({ desde, apagar });
  await db.query("update app.material_arquivos set created_at = $2 where entrega_id = $1", [mandou.entrega, await quando({ meses: 3 }, '12:00')]);
  await db.query("update app.materiais set updated_at = $2 where entrega_id = $1", [mandou.entrega, await quando({ meses: 3 }, '12:00')]);
  assert.equal(await apagavel(mandou.arq), false);
  assert.deepEqual(await naFila(mandou), []);
  /* mexeu há 5 meses e meio, depois do aviso prévio de 7 meses atrás: o aviso ficou velho, o dono deve outro e nada é apagado */
  const velho = await parada({ desde, apagar: await quando({ meses: 7 }, '12:00') });
  await db.query("update app.materiais set updated_at = $2 where entrega_id = $1", [velho.entrega, await quando({ meses: 5, dias: 15 }, '12:00')]);
  assert.equal(await apagavel(velho.arq), false);
  assert.deepEqual(await naFila(velho), ['material_apagar']);
  assert.deepEqual(await aviso(velho), { ok: true }, 'o aviso velho não bloqueia o novo');
});

test('sem material nenhum (o cliente nunca mandou nada) não há alarme nem aviso: o projeto só fica reservado', async () => {
  await zerar();
  const vazio = await parada({ desde: await quando({ meses: 9 }, '12:00'), material: false });
  assert.deepEqual(await naFila(vazio), []);
  const r = await rodarEVer();
  assert.equal((await db.query("select 1 from app.alertas where tipo = 'material_apagar'")).rowCount, 0);
  assert.equal(r.status, 200);
  const e = await linha(vazio);
  assert.deepEqual([e.passo, e.material_apagado_em], ['material', null]);
});
