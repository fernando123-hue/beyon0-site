/* O MATERIAL DE UMA ENTREGA BLOQUEADA (decisão do dono, 20/11, "60 dias"): estorno, estorno parcial, contestação ou projeto pausado bloqueiam a entrega (19/11) e o material que o
   cliente enviou fica GUARDADO por 60 dias contados do bloqueio; depois entra na limpeza normal (arquivos e campos), e o dono é avisado na rotina diária antes (a última semana).
   Desbloqueada, volta à regra de sempre. Reaproveita a rotina de material (privado.material_vencido_pelo_fim, app.rotinas_material_pendencias e _baixar).  PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';
import { contarAlarmes } from '../../api/_entrega/alarmes.mjs';

let db, rpc;
const MB = 1024 * 1024;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });
const limpo = () => db.exec("delete from storage.objects; update app.material_arquivos set status = 'removido' where status in ('reservado', 'conferido', 'recusado')");
let n = 0;
/* uma entrega com um material ENVIADO e uma foto conferida (o que a limpeza leva) */
async function entrega() {
  await limpo();
  const c = await conversaComEntradaPaga(db);
  const e = await um('select id, org_id from app.entregas where conversa_id = $1', [c.conversa_id]);
  await db.query("update app.materiais set status = 'enviado', enviado_em = now() where entrega_id = $1", [e.id]);
  const caminho = e.id + '/00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  await db.query(`insert into app.material_arquivos (org_id, entrega_id, papel, ordem, caminho, tipo_declarado, tamanho_declarado, status, created_at)
    values ($1, $2, 'foto', $3, $4, 'image/jpeg', $5, 'conferido', now() - interval '3 days')`, [e.org_id, e.id, 1 + (n % 50), caminho, MB]);
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('material', $1, $2)", [caminho, JSON.stringify({ size: MB })]);
  return { ...c, entrega: e.id, caminho };
}
const pendencias = async () => (await rpc('rotinas_material_pendencias', {})).caminhos.sort();
/* o carimbo de updated_at do banco volta o relógio para agora; a licença de restauração (só numa conexão SQL do dono) deixa datar o bloqueio */
const datar = (sql, p) => db.transaction(async tx => { await tx.exec("set local bz.restaurando = 'on'"); await tx.query(sql, p); });
const BLOQUEIOS = {
  'o sinal estornado': (c, dias) => datar("update app.pagamentos set status = 'estornado', status_em = now() - make_interval(days => $2) where proposta_id = $1 and parcela = 'sinal'", [c.proposta, dias]),
  'o sinal contestado': (c, dias) => datar("update app.pagamentos set status = 'contestado', status_em = now() - make_interval(days => $2) where proposta_id = $1 and parcela = 'sinal'", [c.proposta, dias]),
  'o projeto pausado': (c, dias) => datar("update app.projetos set status = 'pausado', status_em = now() - make_interval(days => $2) where id = (select projeto_id from app.propostas where id = $1)", [c.proposta, dias]),
  'o estorno PARCIAL (o pagamento segue "pago")': (c, dias) => datar("update app.tentativas_pagamento set status = 'estornada_parcial', status_em = now() - make_interval(days => $2) where id = (select t.id from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id where pg.proposta_id = $1 and pg.parcela = 'sinal' and t.provedor_order_id = pg.gateway_ref)", [c.proposta, dias])
};

for (const [nome, bloquear] of Object.entries(BLOQUEIOS)) {
  test(`60 dias: com ${nome}, o material fica guardado até o 59º dia, entra na limpeza no 61º e a rotina o apaga`, async () => {
    const c = await entrega();
    await bloquear(c, 59); assert.deepEqual(await pendencias(), [], '59 dias: ainda guardado');
    await bloquear(c, 61); assert.deepEqual(await pendencias(), [c.caminho], '61 dias: entra na limpeza');
    const r = await rpc('rotinas_material_baixar', { caminhos: [c.caminho] });
    assert.ok(r.limpos >= 1);
    assert.equal((await um('select status from app.materiais where entrega_id = $1', [c.entrega])).status, 'limpo');
  });
}

test('60 dias: DESBLOQUEADA (o projeto reativado) volta à regra normal: nada de limpeza por ter sido bloqueada há 61 dias', async () => {
  const c = await entrega();
  await BLOQUEIOS['o projeto pausado'](c, 61);
  assert.deepEqual(await pendencias(), [c.caminho]);
  await datar("update app.projetos set status = 'em_producao', updated_at = now() where id = (select projeto_id from app.propostas where id = $1)", [c.proposta]);
  assert.deepEqual(await pendencias(), [], 'projeto reativado: sem bloqueio, o material do pedido ativo não sai');
});

test('60 dias: a regra antiga ("sinal estornado há mais de 1 dia, o material sai no dia seguinte") foi trocada pela janela de 60 dias', async () => {
  const c = await entrega();
  await BLOQUEIOS['o sinal estornado'](c, 2);
  assert.deepEqual(await pendencias(), [], 'estornado há 2 dias: guardado');
});

test('aviso ao dono antes: na última semana da janela (do 53º ao 59º dia) a lista da rotina marca o pedido; antes disso e sem material, não', async () => {
  const marcado = async c => { const it = (await rpc('rotinas_entregas', {})).itens.find(i => i.material_bloqueado_apagar === true); return !!it; };
  const c = await entrega();
  await BLOQUEIOS['o sinal estornado'](c, 40); assert.equal(await marcado(c), false, '40 dias: ainda longe');
  await BLOQUEIOS['o sinal estornado'](c, 55); assert.equal(await marcado(c), true, '55 dias: na última semana');
  await db.exec("update app.material_arquivos set status = 'removido' where entrega_id = '" + c.entrega + "'; update app.materiais set dados = '{}', negocio = '{}' where entrega_id = '" + c.entrega + "'");
  assert.equal(await marcado(c), false, 'sem o que apagar não há o que avisar');
});

test('a rotina conta o aviso e grava o alerta "material_bloqueado" (só contagem, sem dado pessoal)', async () => {
  assert.equal(contarAlarmes([{ passo: 'producao', material_bloqueado_apagar: true }, { passo: 'producao', material_bloqueado_apagar: false }, { passo: 'aprovada', material_bloqueado_apagar: true }], new Date()).material_bloqueado, 2);
  assert.equal(contarAlarmes([], new Date()).material_bloqueado, 0);
  const r = await rpc('rotinas_conferir', { org_slug: 'beyon-zero', entregas: { prazo_vencido: 0, material_30: 0, restante_vencido: 0, material_apagar: 0, material_bloqueado: 2 } });
  const a = r.alertas.find(x => x.tipo === 'material_bloqueado');
  assert.ok(a, JSON.stringify(r.alertas.map(x => x.tipo)));
  assert.equal(a.nivel, 'aviso'); assert.match(a.mensagem, /^2 pedido\(s\) com a entrega bloqueada/); assert.ok(!/BZ-|@|\d{8}/.test(a.mensagem));
  const sem = await rpc('rotinas_conferir', { org_slug: 'beyon-zero', entregas: { prazo_vencido: 0, material_30: 0, restante_vencido: 0, material_apagar: 0, material_bloqueado: 0 } });
  assert.equal(sem.alertas.filter(x => x.tipo === 'material_bloqueado').length, 1, 'zero não cria outro: o do dia já existe e um por dia');
});

test('a lista do dono diz desde quando a entrega está bloqueada (e o terminal explica a guarda de 60 dias do material); sem bloqueio, nulo', async () => {
  const c = await entrega();
  const codigo = (await um('select codigo from app.pedidos where conversa_id = $1', [c.conversa_id])).codigo;
  const meu = async () => (await rpc('vendas_entregas_lista', { org_slug: 'beyon-zero' })).itens.find(i => i.codigo === codigo);
  assert.equal((await meu()).bloqueada_desde, null, 'sem bloqueio');
  await BLOQUEIOS['o sinal estornado'](c, 10);
  const i = await meu();
  assert.equal(i.bloqueada, true);
  const dias = Math.round((Date.now() - new Date(i.bloqueada_desde).getTime()) / 864e5);
  assert.ok(dias >= 9 && dias <= 11, 'bloqueada há cerca de 10 dias: ' + dias);
});

/* ---------- SEGURANÇA-1: a data do bloqueio só anda quando o ESTADO muda, nunca por uma consulta da reconciliação ---------- */
/* a datação do estado do pagamento (a licença de restauração deixa datar; só numa conexão SQL do dono) */
const DATAR_ESTADO = (c, dias) => db.transaction(async tx => {
  await tx.exec("set local bz.restaurando = 'on'");
  await tx.query('update app.tentativas_pagamento set status_em = now() - make_interval(days => $2) where pagamento_id in (select id from app.pagamentos where proposta_id = $1)', [c.proposta, dias]);
  await tx.query('update app.pagamentos set status_em = now() - make_interval(days => $2) where proposta_id = $1', [c.proposta, dias]);
  await tx.query('update app.projetos set status_em = now() - make_interval(days => $2) where id = (select projeto_id from app.propostas where id = $1)', [c.proposta, dias]);
});
/* o retrato que a reconciliação (ou o webhook) aplica, pelo caminho real, não datando direto no banco */
async function aplicarRetrato(c, estado) {
  const t = await um("select t.id, t.provedor_order_id as ordem, t.valor from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id where pg.proposta_id = $1 and pg.parcela = 'sinal' and t.provedor_order_id = pg.gateway_ref", [c.proposta]);
  const v = Number(t.valor).toFixed(2), [status, detalhe] = { estornada: ['refunded', 'refunded'], estornada_parcial: ['processed', 'partially_refunded'], contestada: ['charged_back', 'in_process'] }[estado];
  return rpc('pagamentos_aplicar', { provedor: 'mercadopago', origem: 'reconciliacao', conta_esperada: '777', retrato: {
    order_id: t.ordem, external_reference: t.id, user_id: '777', total_amount: v, country_code: 'BRA',
    pagamento: { id: 'PAY' + t.ordem.slice(-6), amount: v, paid_amount: v, status, status_detail: detalhe, metodo_id: 'pix', metodo_tipo: 'bank_transfer', parcelas: null }, estado } });
}
const vencida = async c => (await um('select privado.material_bloqueado_vencido(e) as v from app.entregas e where e.id = $1', [c.entrega])).v;
const desde = async c => (await um('select privado.entrega_bloqueada_desde(e) as d from app.entregas e where e.id = $1', [c.entrega])).d;

for (const estado of ['estornada_parcial', 'contestada', 'estornada']) {
  test('S1: o ' + estado + ' reaplicado pela reconciliação (mesmo estado) NÃO reinicia a guarda de 60 dias', async () => {
    const c = await entrega();
    await aplicarRetrato(c, estado);
    await DATAR_ESTADO(c, 70);
    assert.equal(await vencida(c), true, '70 dias depois do bloqueio: guarda vencida');
    const antes = await desde(c);
    for (let i = 0; i < 3; i++) await aplicarRetrato(c, estado);
    assert.equal(await vencida(c), true, 'depois de reaplicar o mesmo estado, segue vencida (a consulta não reinicia a contagem)');
    assert.equal(new Date(await desde(c)).getTime(), new Date(antes).getTime(), 'a data do bloqueio não anda');
  });
}
