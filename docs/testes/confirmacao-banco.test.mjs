/* A CONFIRMAÇÃO DA ENTRADA POR E-MAIL no banco (decisões do dono, 14 e 15/11/2026). O e-mail que a pessoa digitou para pagar fica
   na tentativa (app.pagamentos_guardar_pagador) só até a confirmação sair. app.pagamentos_reservar_confirmacao reserva UMA vez (o aviso
   do Mercado Pago, a consulta da página e a reconciliação podem chegar juntos), só para a ENTRADA aprovada, e apaga o e-mail ao
   reservar. A retenção (app.vendas_reter) apaga o que sobrar em 30 dias. Postgres real (PGlite) com as migrations.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { rpcDe, prepararOrg, conversaComEntradaPaga } from './_entrega.mjs';
import { entregaEm, iniciarRestante, aprovarRestante } from './_previa.mjs';

let db, rpc;
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); });

/* (revisão de segurança do #172) o e-mail só com caracteres PERMITIDOS: nada de <, >, aspas, vírgula, espaço, quebra de linha */
const EMAILS_RUINS = ['a<b@x.com', 'a>b@x.com', '"a"@x.com', 'a,b@x.com', 'a b@x.com', 'a@b.com\n', 'a@b.com\r\nBcc: c@d.com', 'a@x.com,b@y.com',
  "o'a@x.com", 'a..b@x.com', '.a@x.com', 'a@-x.com', 'a@x', 'a@x.c', 'á@x.com', 'a@x.com>', 'a@[1.2.3.4]'];
const EMAILS_BONS = ['ana@exemplo.com', 'ana.souza+site@empresa.com.br', 'a_b-c%d@sub.dominio-x.com.br'];
const ATIVAS = "('criada', 'processando', 'aguardando', 'requer_acao')";
const ultimaAtiva = () => um(`select id from app.tentativas_pagamento where status in ${ATIVAS} order by created_at desc limit 1`);
const tentativaDe = id => um('select * from app.tentativas_pagamento where id = $1', [id]);
const entradaDe = c => um(`select t.* from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id
  join app.propostas pr on pr.id = pg.proposta_id where pr.conversa_id = $1 and pg.parcela = 'sinal' order by t.created_at desc limit 1`, [c.conversa_id]);
const reservar = p => rpc('pagamentos_reservar_confirmacao', { provedor: 'mercadopago', ...p });
const guardar = (tentativa_id, email) => rpc('pagamentos_guardar_pagador', { tentativa_id, email });

/* a entrada pelo caminho real (proposta aceita → tentativa → order → pagamentos_aplicar), com o e-mail guardado ANTES de pagar */
async function entrada({ email = 'cliente@empresa.com.br', pagar = true, ...resto } = {}) {
  const guardarNaAtiva = async () => { if (email) await guardar((await ultimaAtiva()).id, email); };
  const c = await conversaComEntradaPaga(db, { ...resto, semPagar: !pagar, antesDePagar: guardarNaAtiva });
  if (!pagar) await guardarNaAtiva();   /* (com semPagar o ajudante volta antes do gancho) */
  return { ...c, t: await entradaDe(c) };
}
/* esvazia o que outros testes deixaram pendente (a varredura sem order olha a tabela inteira) */
async function esvaziar() { while ((await reservar({ limite: 20 })).itens.length) { /* de novo */ } }

test('guardar: só e-mail válido (vai minúsculo), só em tentativa aberta, só pelo service_role', async () => {
  const c = await entrada({ pagar: false, email: null });
  assert.equal((await erroDe(guardar(c.t.id, 'sem-arroba'))).codigo, '22023');
  assert.equal((await erroDe(guardar(c.t.id, 'a@b.com\r\nBcc: x@y.com'))).codigo, '22023', 'quebra de linha no e-mail');
  assert.equal((await erroDe(guardar(c.t.id, 'a'.repeat(250) + '@b.com'))).codigo, '22023', 'longo demais');
  assert.equal((await erroDe(guardar(c.t.id, 'a'.repeat(65) + '@b.com'))).codigo, '22023', 'parte local acima de 64');
  for (const ruim of EMAILS_RUINS) assert.equal((await erroDe(guardar(c.t.id, ruim)))?.codigo, '22023', 'guardar: ' + JSON.stringify(ruim));
  for (const ruim of EMAILS_RUINS) {
    const e = await erroDe(db.query('update app.tentativas_pagamento set pagador_email = $1 where id = $2', [ruim.toLowerCase(), c.t.id]));
    assert.equal(e?.codigo, '23514', 'a coluna também barra: ' + JSON.stringify(ruim));
  }
  for (const bom of EMAILS_BONS) assert.deepEqual(await guardar(c.t.id, bom), { guardado: true }, bom);
  assert.deepEqual(await guardar(c.t.id, '  Cliente@Empresa.COM.br '), { guardado: true });
  assert.equal((await tentativaDe(c.t.id)).pagador_email, 'cliente@empresa.com.br');
  const paga = await entrada({ email: null });
  assert.deepEqual(await guardar(paga.t.id, 'outro@empresa.com.br'), { guardado: false }, 'tentativa já paga não recebe e-mail');
  assert.equal((await tentativaDe(paga.t.id)).pagador_email, null);
  for (const papel of ['anon', 'eeeeeeee-0000-4000-8000-0000000000e1']) {
    const e = await erroDe(como(db, papel, q => q('select app.pagamentos_guardar_pagador($1::jsonb)', [JSON.stringify({ tentativa_id: c.t.id, email: 'x@y.com' })]), { manter: false }));
    assert.equal(e.codigo, '42501', papel + ' não executa');
  }
});

test('reserva UMA vez: o e-mail, o valor da entrada, o método e o prazo; depois nada; o e-mail sai da tentativa', async () => {
  const c = await entrada({ sinal: 1200, prazo: 10 });
  assert.equal(c.aplicado.aplicado, 'aprovada');
  const r1 = await reservar({ provedor_order_id: c.t.provedor_order_id });
  assert.equal(r1.itens.length, 1, JSON.stringify(r1));
  const [item] = r1.itens;
  assert.deepEqual({ ...item, valor: Number(item.valor) }, { tentativa_id: c.t.id, email: 'cliente@empresa.com.br', valor: 1200, metodo: 'pix', prazo_dias: 10 });
  assert.deepEqual(await reservar({ provedor_order_id: c.t.provedor_order_id }), { itens: [] }, 'a 2ª reserva (o aviso repetido) não devolve nada');
  assert.deepEqual(await reservar({ limite: 20 }), { itens: [] }, 'nem a varredura');
  const t = await tentativaDe(c.t.id);
  assert.equal(t.pagador_email, null, 'o e-mail não fica guardado depois de usado');
  assert.ok(t.confirmacao_email_em, 'a marca de enviada');
  assert.equal(t.status, 'aprovada', 'o pagamento não muda');
});

test('não reserva o que não é entrada paga: sem pagar, sem e-mail, o restante pago e a entrada estornada', async () => {
  await esvaziar();
  const semPagar = await entrada({ pagar: false });
  assert.deepEqual(await reservar({ provedor_order_id: semPagar.t.provedor_order_id }), { itens: [] }, 'sem pagar');
  const semEmail = await entrada({ email: null });
  assert.deepEqual(await reservar({ provedor_order_id: semEmail.t.provedor_order_id }), { itens: [] }, 'sem e-mail');

  const noAr = await entregaEm(db, 'no_ar');
  const x = await iniciarRestante(db, noAr);
  await guardar(x.t.tentativa_id, 'cliente@empresa.com.br');
  assert.equal((await aprovarRestante(db, x)).aplicado, 'aprovada');
  assert.deepEqual(await reservar({ provedor_order_id: x.order }), { itens: [] }, 'o restante (saldo) não é a entrada');

  const estornada = await entrada();
  const r = await aprovarRestante(db, { t: { valor: estornada.t.valor, tentativa_id: estornada.t.id }, order: estornada.t.provedor_order_id }, 'estornada');
  assert.equal(r.aplicado, 'estornada');
  assert.deepEqual(await reservar({ provedor_order_id: estornada.t.provedor_order_id }), { itens: [] }, 'estornada antes do envio');
  assert.deepEqual(await reservar({ limite: 20 }), { itens: [] }, 'a varredura também não pega nenhum deles');
});

test('a varredura (sem order) pega as entradas pagas das últimas 48 h que ficaram sem confirmação, até o limite, cada uma uma vez', async () => {
  await esvaziar();
  const [a, b, velha] = [await entrada(), await entrada(), await entrada()];
  await db.query("update app.tentativas_pagamento set aprovada_em = now() - interval '3 days' where id = $1", [velha.t.id]);
  const r1 = await reservar({ limite: 1 });
  assert.equal(r1.itens.length, 1, 'o limite vale');
  const r2 = await reservar({ limite: 20 });
  assert.deepEqual([...r1.itens, ...r2.itens].map(i => i.tentativa_id).sort(), [a.t.id, b.t.id].sort(), 'as duas recentes, cada uma uma vez');
  assert.deepEqual(await reservar({ limite: 20 }), { itens: [] });
  assert.equal((await tentativaDe(velha.t.id)).confirmacao_email_em, null, 'a de 3 dias atrás não recebe confirmação atrasada');
});

test('entrada inválida: order fora do formato e limite absurdo', async () => {
  assert.equal((await erroDe(reservar({ provedor_order_id: "x' or 1=1" }))).codigo, '22023');
  assert.equal((await erroDe(reservar({ limite: 'muitos' }))).codigo, '22023');
  for (const papel of ['anon', 'eeeeeeee-0000-4000-8000-0000000000e1']) {
    const e = await erroDe(como(db, papel, q => q('select app.pagamentos_reservar_confirmacao($1::jsonb)', [JSON.stringify({ limite: 1 })]), { manter: false }));
    assert.equal(e.codigo, '42501', papel + ' não executa');
  }
});

test('retenção: vendas_reter apaga o e-mail do pagador guardado há mais de 30 dias (pago ou não); o recente fica', async () => {
  const velha = await entrada({ pagar: false }), recente = await entrada({ pagar: false });
  await db.exec('alter table app.tentativas_pagamento disable trigger carimbar');
  try { await db.query("update app.tentativas_pagamento set created_at = now() - interval '31 days' where id = $1", [velha.t.id]); }
  finally { await db.exec('alter table app.tentativas_pagamento enable trigger carimbar'); }
  const r = await rpc('vendas_reter', {});
  assert.ok(r.pagadores_apagados >= 1, JSON.stringify(r));
  assert.equal((await tentativaDe(velha.t.id)).pagador_email, null);
  assert.equal((await tentativaDe(recente.t.id)).pagador_email, 'cliente@empresa.com.br');
  assert.equal((await rpc('vendas_reter', {})).pagadores_apagados, 0, 'rodar de novo não acha nada');
});
