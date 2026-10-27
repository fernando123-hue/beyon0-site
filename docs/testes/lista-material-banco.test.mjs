/* A LISTA DO PAINEL E O MATERIAL PARADO (PR 3b-3; decisão do dono de 22/10): vendas_entregas_lista devolve o aviso prévio do apagamento (aviso_apagar_material_em),
   o dia em que o material foi apagado (material_apagado_em) e se o aviso prévio é DEVIDO agora (apagar_material_devido: a mesma conta da rotina diária e do alarme),
   para o `listar` do terminal mostrar o próximo passo.  Só leitura: a função segue só do servidor.  Postgres real (PGlite com as migrations).  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, forcarEntrega, codigoDe } from './_previa.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const quando = async ({ meses = 0, dias = 0 }, hora = '12:00') => new Date(1000 * Number((await um(
  "select extract(epoch from (date_trunc('day', now() at time zone 'America/Campo_Grande') - make_interval(months => $1::int, days => $2::int) + $3::interval) at time zone 'America/Campo_Grande') as t",
  [meses, dias, hora])).t)).toISOString();
const itemDe = async c => (await rpc('vendas_entregas_lista', { org_slug: 'beyon-zero' })).itens.find(i => i.codigo === codigoDe_(c));
const codigos = new Map();
const codigoDe_ = c => codigos.get(c.conversa_id);
/* um projeto parado no passo "material": sem autorização completa, com um campo guardado (há o que apagar) mexido antes do aviso de parado */
async function parado({ desde, ...campos }) {
  const c = await entregaEm(db, 'material');
  codigos.set(c.conversa_id, await codigoDe(db, c));
  const e = await um('select id from app.entregas where conversa_id = $1', [c.conversa_id]);
  const antes = new Date(new Date(desde).getTime() - 864e5).toISOString();
  await db.query(`update app.materiais set dados = '{"slogan":"Cuidamos de você"}', negocio = '{}', autorizacao = '{}', updated_at = $2 where entrega_id = $1`, [e.id, antes]);
  await forcarEntrega(db, c, { aviso_material_em: desde, ...campos });
  return c;
}

test('o item da lista traz o aviso prévio do apagamento, o dia em que o material foi apagado e se o aviso prévio é devido', async () => {
  const novo = await entregaEm(db, 'material');
  codigos.set(novo.conversa_id, await codigoDe(db, novo));
  assert.deepEqual(await itemDe(novo).then(i => [i.aviso_apagar_material_em, i.material_apagado_em, i.apagar_material_devido]), [null, null, false], 'recém-chegado: nada disso');

  const quatro = await parado({ desde: await quando({ meses: 4, dias: 20 }) });
  assert.equal((await itemDe(quatro)).apagar_material_devido, false, '4 meses e 20 dias: ainda cedo');

  const cinco = await parado({ desde: await quando({ meses: 5 }) });
  const i5 = await itemDe(cinco);
  assert.deepEqual([i5.apagar_material_devido, i5.aviso_apagar_material_em, i5.material_apagado_em], [true, null, null], '5 meses parado, sem o aviso prévio: devido');

  const avisado = await parado({ desde: await quando({ meses: 5 }), aviso_apagar_material_em: await quando({ dias: 1 }) });
  const ia = await itemDe(avisado);
  assert.deepEqual([ia.apagar_material_devido, typeof ia.aviso_apagar_material_em], [false, 'string'], 'aviso prévio registrado depois da última mexida: não é mais devido, e a data vem');

  const apagado = await parado({ desde: await quando({ meses: 7 }), aviso_apagar_material_em: await quando({ meses: 1, dias: 5 }), material_apagado_em: await quando({ dias: 2 }) });
  assert.equal(typeof (await itemDe(apagado)).material_apagado_em, 'string', 'o dia do apagamento vem');
});

test('a lista segue só do servidor (anon e authenticated não executam) e o resto do item não mudou', async () => {
  const r = await um(`select has_function_privilege('anon', 'app.vendas_entregas_lista(jsonb)', 'execute') as anon, has_function_privilege('authenticated', 'app.vendas_entregas_lista(jsonb)', 'execute') as auth,
                             has_function_privilege('service_role', 'app.vendas_entregas_lista(jsonb)', 'execute') as srv`);
  assert.deepEqual([r.anon, r.auth, r.srv], [false, false, true]);
  const c = await entregaEm(db, 'previa');
  codigos.set(c.conversa_id, await codigoDe(db, c));
  const it = await itemDe(c);
  for (const k of ['codigo', 'passo', 'material_status', 'entrega_ate', 'prazo', 'dias_desde_entrada', 'rodadas', 'previa_url', 'dias_na_previa', 'aviso_material_em', 'dias_do_aviso', 'religar_pendente']) assert.ok(k in it, 'continua trazendo ' + k);
});
