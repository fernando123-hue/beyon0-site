/* O ALARME "RESTANTE PAGO E O SITE AINDA NÃO FOI AO AR" (revisão técnica, 20/11): o prazo da Beyon PARA na aprovação da prévia, então a `aprovada` saiu da contagem de
   prazo vencido. Se o e-mail único do restante pago falhar (só vai ao log), o pedido ficaria parado sem ninguém ver. A rotina diária conta as entregas `aprovada` com o
   restante pago há mais de SITE_PARADO_DIAS dias corridos (o padrão do `restante_vencido`: só contagem, o código do pedido aparece no `listar`).  PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { entregaEm, iniciarRestante, aprovarRestante } from './_previa.mjs';
import { contarAlarmes, LIMITES } from '../../api/_entrega/alarmes.mjs';
import { alertasDe } from '../../scripts/entregas-lib.mjs';

const AGORA = new Date('2026-11-20T12:00:00-04:00');
const dias = n => new Date(AGORA.getTime() - n * 864e5).toISOString();

test('a constante: o site parado vale a partir de 2 dias corridos com o restante pago', () => {
  assert.equal(LIMITES.site_parado_dias, 2);
});

test('contarAlarmes: aprovada com o restante pago há MAIS de 2 dias conta "site_parado"; 2 dias ou menos, sem restante pago e outros passos, não', () => {
  const itens = [
    { passo: 'aprovada', restante_pago_em: dias(3) },     // conta
    { passo: 'aprovada', restante_pago_em: dias(2) },     // exatamente 2: ainda não (o dia do pagamento é o dia 0)
    { passo: 'aprovada', restante_pago_em: null },        // restante não pago: a espera é do cliente
    { passo: 'aprovada' },
    { passo: 'producao', restante_pago_em: dias(9) },
    { passo: 'concluida', restante_pago_em: dias(9) }
  ];
  const r = contarAlarmes(itens, AGORA);
  assert.equal(r.site_parado, 1);
  assert.equal(contarAlarmes([], AGORA).site_parado, 0);
  assert.equal(contarAlarmes([{ passo: 'aprovada', restante_pago_em: 'lixo' }], AGORA).ilegiveis, 1, 'data torta vira ilegível, não derruba o resto');
});

test('o terminal: aprovada com o restante pago há mais de 2 dias diz que o site está parado, sem repetir a frase de aprovada dentro do prazo', () => {
  const base = extra => ({ codigo: 'BZ-K7M3Q', passo: 'aprovada', prazo_dias: 10, entrega_ate: '2026-12-05', prazo: { conta_desde: '2026-10-20T12:00:00-04:00', pausas: [] }, restante_pago: true, ...extra });
  const recente = alertasDe(base({ restante_pago_em: dias(1) }), AGORA).join(' | ');
  assert.ok(!/parado/.test(recente), recente);
  const parado = alertasDe(base({ restante_pago_em: dias(4) }), AGORA).join(' | ');
  assert.match(parado, /parado há 4 dia\(s\) com o restante pago/);
  assert.match(parado, /no-ar BZ-K7M3Q/);
  assert.ok(!/parado há/.test(alertasDe(base({ restante_pago: false, restante_pago_em: null }), AGORA).join(' ')));
});

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });

test('o banco: a lista da rotina e a do painel trazem restante_pago_em (quando a parcela foi quitada), nulo antes', async () => {
  const c = await entregaEm(db, 'aprovada');
  const doPedido = async () => (await rpc('rotinas_entregas', {})).itens.filter(i => i.passo === 'aprovada');
  const antes = await doPedido();
  assert.ok(antes.every(i => i.restante_pago_em === null), 'antes de pagar o restante, nulo');
  const r = await aprovarRestante(db, await iniciarRestante(db, c));
  assert.equal(r.aplicado, 'aprovada');
  const depois = (await doPedido()).filter(i => i.restante_pago_em);
  assert.equal(depois.length, 1);
  assert.ok(Math.abs(Date.now() - new Date(depois[0].restante_pago_em).getTime()) < 60e3, 'pago agora');
  const codigo = (await um('select codigo from app.pedidos where conversa_id = $1', [c.conversa_id])).codigo;
  const lista = (await rpc('vendas_entregas_lista', { org_slug: 'beyon-zero' })).itens.find(i => i.codigo === codigo);
  assert.ok(lista.restante_pago_em, 'o painel e o terminal também trazem a data');
});

test('o banco: a conferência do dia grava o alerta "site_parado" (só contagem, sem dado pessoal), um por dia', async () => {
  const entregas = n => ({ prazo_vencido: 0, material_30: 0, restante_vencido: 0, material_apagar: 0, material_bloqueado: 0, site_parado: n });
  const r = await rpc('rotinas_conferir', { org_slug: 'beyon-zero', entregas: entregas(2) });
  const a = r.alertas.find(x => x.tipo === 'site_parado');
  assert.ok(a, JSON.stringify(r.alertas.map(x => x.tipo)));
  assert.equal(a.nivel, 'urgente');
  assert.match(a.mensagem, /^2 pedido\(s\) com o restante pago e o site ainda fora do ar/);
  assert.ok(!/BZ-|@|\d{8}/.test(a.mensagem));
});
