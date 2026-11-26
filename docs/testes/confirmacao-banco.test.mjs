/* A CONFIRMAÇÃO DA ENTRADA POR E-MAIL no banco (decisões do dono, 14 e 15/11/2026). O e-mail que a pessoa digitou para pagar fica
   na tentativa (app.pagamentos_guardar_pagador) só até a confirmação sair. app.pagamentos_reservar_confirmacao reserva UMA vez (o aviso
   do Mercado Pago, a consulta da página e a reconciliação podem chegar juntos), só para a ENTRADA aprovada, e apaga o e-mail ao
   reservar. A retenção (app.vendas_reter) apaga o que sobrar em 30 dias. Postgres real (PGlite) com as migrations.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
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

/* ======================= O LINK DO PEDIDO NO E-MAIL (decisão do dono, 19/11: "o cliente não tem que se preocupar com nenhum código") =======================
   Depois da reserva, o servidor sorteia o código e entrega ao banco SÓ o hash (app.pagamentos_link_da_confirmacao). O banco cria o link do pedido
   se a conversa ainda não tem um vivo; se o cliente já gerou o dele na página, NÃO troca (o link que ele guardou continua valendo) e o e-mail vai
   sem link. Se o e-mail não saiu de fato, `desfazer` apaga o link criado para ele (ninguém o recebeu). Só o service_role executa. */
const linkDaConfirmacao = p => rpc('pagamentos_link_da_confirmacao', p);
const hexLink = s => createHash('sha256').update('bz-pedido|' + s).digest('hex');
const usarLink = async codigo => {
  const v = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [v]);
  return { v, r: await rpc('vendas_link_pedido_usar', { org_slug: 'beyon-zero', codigo_hash: hexLink(codigo), visitante_id: v }) };
};
const vivos = c => um('select count(*)::int n from app.links_pedido where conversa_id = $1 and revogado_em is null', [c.conversa_id]);
async function reservada(opcoes) {
  const c = await entrada(opcoes);
  assert.equal((await reservar({ provedor_order_id: c.t.provedor_order_id })).itens.length, 1);
  return c;
}

test('link no e-mail: com a entrada reservada e sem link vivo, cria o link do pedido (só o hash), o estado sabe que ele foi por e-mail, e ele abre o pedido certo', async () => {
  const c = await reservada();
  const r = await linkDaConfirmacao({ tentativa_id: c.t.id, codigo_hash: hexLink('EMAIL1') });
  assert.deepEqual(r, { ok: true, criado: true });
  const linha = await um('select * from app.links_pedido where conversa_id = $1', [c.conversa_id]);
  assert.equal(linha.codigo_hash, hexLink('EMAIL1')); assert.equal(linha.pelo_email, true);
  assert.ok(!JSON.stringify(linha).includes('EMAIL1'), 'o banco guarda só o hash');
  assert.ok(linha.valido_ate > new Date(Date.now() + 100 * 864e5), 'vale o pedido inteiro, como o da página');
  const e = (await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: c.visitante_id })).entrega;
  assert.deepEqual([e.link_pedido, e.link_no_email], [true, true], 'a página não pede para gerar outro: o link está no e-mail');
  assert.deepEqual(await linkDaConfirmacao({ tentativa_id: c.t.id, codigo_hash: hexLink('EMAIL1b') }), { ok: true, criado: false, motivo: 'ja_tem_link' }, 'de novo: não troca');
  const u = await usarLink('EMAIL1');
  assert.deepEqual([u.r.ok, u.r.conversa_id], [true, c.conversa_id], 'o link do e-mail abre ESTE pedido');
  assert.equal((await usarLink('EMAIL1b')).r.ok, false, 'o 2º hash nunca virou link');
  /* "Gerar um link novo" na página troca o do e-mail como troca qualquer outro, e o estado deixa de dizer "no e-mail" */
  const novo = await rpc('vendas_link_pedido_criar', { conversa_id: c.conversa_id, visitante_id: u.v, codigo_hash: hexLink('PAGINA1'), forcar: true });
  assert.equal(novo.criado, true);
  assert.equal((await usarLink('EMAIL1')).r.ok, false, 'o do e-mail parou');
  const visitante = (await um('select visitante_id from app.conversas where id = $1', [c.conversa_id])).visitante_id;
  assert.equal((await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: visitante })).entrega.link_no_email, false);
});

test('link no e-mail: o link que o cliente JÁ gerou na página nunca é revogado; o e-mail vai sem link', async () => {
  const c = await entrada();
  assert.equal((await rpc('vendas_link_pedido_criar', { conversa_id: c.conversa_id, visitante_id: c.visitante_id, codigo_hash: hexLink('DOCLIENTE') })).criado, true);
  assert.equal((await reservar({ provedor_order_id: c.t.provedor_order_id })).itens.length, 1);
  assert.deepEqual(await linkDaConfirmacao({ tentativa_id: c.t.id, codigo_hash: hexLink('EMAIL2') }), { ok: true, criado: false, motivo: 'ja_tem_link' });
  assert.equal((await vivos(c)).n, 1);
  assert.equal((await um('select revogado_em from app.links_pedido where codigo_hash = $1', [hexLink('DOCLIENTE')])).revogado_em, null, 'o do cliente segue vivo');
  assert.equal((await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: c.visitante_id })).entrega.link_no_email, false);
  assert.deepEqual([(await usarLink('DOCLIENTE')).r.ok, (await usarLink('EMAIL2')).r.ok], [true, false]);
  assert.equal((await linkDaConfirmacao({ tentativa_id: c.t.id, codigo_hash: hexLink('DOCLIENTE'), desfazer: true })).desfeito, false, 'desfazer nunca apaga o link do cliente');
  assert.equal((await usarLink('DOCLIENTE')).r.ok, true);
});

test('link no e-mail: só para a entrada paga e RESERVADA há pouco; sem reserva, estornada ou tentativa estranha, não cria', async () => {
  const semReserva = await entrada();
  assert.deepEqual(await linkDaConfirmacao({ tentativa_id: semReserva.t.id, codigo_hash: hexLink('SR') }), { ok: true, criado: false, motivo: 'fora_da_confirmacao' }, 'sem a reserva da confirmação');
  const velha = await reservada();
  await db.query("update app.tentativas_pagamento set confirmacao_email_em = now() - interval '2 hours' where id = $1", [velha.t.id]);
  assert.equal((await linkDaConfirmacao({ tentativa_id: velha.t.id, codigo_hash: hexLink('VELHA') })).criado, false, 'reserva antiga: não vira gerador de link');
  const estornada = await reservada();
  await db.query("update app.pagamentos set status = 'estornado' where proposta_id = $1 and parcela = 'sinal'", [estornada.proposta]);
  assert.equal((await linkDaConfirmacao({ tentativa_id: estornada.t.id, codigo_hash: hexLink('EST') })).criado, false, 'sinal estornado');
  assert.equal((await linkDaConfirmacao({ tentativa_id: randomUUID(), codigo_hash: hexLink('X') })).criado, false, 'tentativa que não existe');
  for (const c of [semReserva, velha, estornada]) assert.equal((await vivos(c)).n, 0);
  assert.equal((await erroDe(linkDaConfirmacao({ tentativa_id: semReserva.t.id, codigo_hash: 'nao-e-hash' }))).codigo, '22023');
  assert.equal((await erroDe(linkDaConfirmacao({ tentativa_id: 'x', codigo_hash: hexLink('X') }))).codigo, '22023');
  for (const papel of ['anon', 'eeeeeeee-0000-4000-8000-0000000000e1']) {
    const e = await erroDe(como(db, papel, q => q('select app.pagamentos_link_da_confirmacao($1::jsonb)', [JSON.stringify({ tentativa_id: semReserva.t.id, codigo_hash: hexLink('X') })]), { manter: false }));
    assert.equal(e.codigo, '42501', papel + ' não executa');
  }
});

test('link no e-mail: desfazer (o e-mail não saiu) apaga só o link criado para ele e ainda não usado; a página volta a gerar o dela', async () => {
  const c = await reservada();
  assert.equal((await linkDaConfirmacao({ tentativa_id: c.t.id, codigo_hash: hexLink('NAOSAIU') })).criado, true);
  assert.deepEqual(await linkDaConfirmacao({ tentativa_id: c.t.id, codigo_hash: hexLink('NAOSAIU'), desfazer: true }), { ok: true, desfeito: true });
  assert.equal((await vivos(c)).n, 0);
  assert.equal((await rpc('vendas_estado', { conversa_id: c.conversa_id, visitante_id: c.visitante_id })).entrega.link_pedido, false, 'a página vai gerar e mostrar o dela');
  assert.equal((await rpc('vendas_link_pedido_criar', { conversa_id: c.conversa_id, visitante_id: c.visitante_id, codigo_hash: hexLink('PAGINA2') })).criado, true);
  /* o link do e-mail que já foi usado (então o e-mail chegou) não é desfeito */
  const d = await reservada();
  await linkDaConfirmacao({ tentativa_id: d.t.id, codigo_hash: hexLink('USADO') });
  assert.equal((await usarLink('USADO')).r.ok, true);
  assert.equal((await linkDaConfirmacao({ tentativa_id: d.t.id, codigo_hash: hexLink('USADO'), desfazer: true })).desfeito, false);
  assert.equal((await usarLink('USADO')).r.ok, true);
  /* o envio lento: passada a 1 hora da reserva, desfazer ainda vale (criar, não) */
  const lenta = await reservada();
  await linkDaConfirmacao({ tentativa_id: lenta.t.id, codigo_hash: hexLink('LENTA') });
  await db.query("update app.tentativas_pagamento set confirmacao_email_em = now() - interval '2 hours' where id = $1", [lenta.t.id]);
  assert.equal((await linkDaConfirmacao({ tentativa_id: lenta.t.id, codigo_hash: hexLink('LENTA'), desfazer: true })).desfeito, true);
  assert.equal((await vivos(lenta)).n, 0);
  /* nem o de outra conversa */
  const e = await reservada();
  await linkDaConfirmacao({ tentativa_id: e.t.id, codigo_hash: hexLink('DOOUTRO') });
  assert.equal((await linkDaConfirmacao({ tentativa_id: c.t.id, codigo_hash: hexLink('DOOUTRO'), desfazer: true })).desfeito, false);
  assert.equal((await usarLink('DOOUTRO')).r.ok, true);
});
