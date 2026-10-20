/* O TETO DO DIA pelo gasto REAL do dia (auditoria de segurança run-1, pista 2, 20/10/2026).
   Antes, app.vendas_custo_dia somava o custo da VIDA INTEIRA (custo_ia_usd) de toda conversa com atividade hoje: bastava o
   visitante tocar em muitas conversas antigas (sem chamar o modelo) para o teto de US$ 25 do dia travar a IA para todos.
   Agora a conta é o registro das chamadas (app.ia_chamadas) desde a meia-noite de São Paulo.
   Banco PRÓPRIO deste arquivo: o registro só aceita inserção, e o caso "gasto de hoje no teto" trava o banco para os
   testes seguintes (por isso é o último). npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { TETOS } from '../../api/_ia/config.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
const RESP = { ramo: 'saude', cidade: 'Niterói', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };
const TEXTO = 'Tenho uma clínica e quero um site institucional';
const MEIA_NOITE = `date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`;
let local, deps, ipSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE };
});

/* um "navegador" por IP (os freios são por IP) */
function navegador(d = deps) {
  const ip = '198.51.100.' + (++ipSeq);
  let token = null;
  const chamar = async (metodo, acao, corpo) => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, d);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const q = (sql, p) => local.db.query(sql, p);
const orgId = async () => (await q(`select id from app.organizacoes where slug = 'beyon-zero'`)).rows[0].id;
const custoDoDia = async () => Number((await local.rpc('vendas_custo_dia', { org_slug: 'beyon-zero' })).custo_usd);
const visitanteDe = async c => (await q('select visitante_id from app.conversas where id = $1', [c])).rows[0].visitante_id;
const reservar = async c => local.rpc('vendas_reservar_custo', { conversa_id: c, visitante_id: await visitanteDe(c), valor_usd: 0.01,
  teto_conversa_usd: TETOS.conversa_usd, teto_dia_usd: TETOS.dia_usd, segundos: 600 });
const chamadasRegistradas = async () => (await q('select count(*)::int n from app.ia_chamadas')).rows[0].n;
/* linhas do registro (o registro só aceita inserção); `quando` é uma expressão SQL de timestamptz */
async function registrarGasto(total, partes, quando) {
  const org = await orgId(), conversa = (await q('select id from app.conversas limit 1')).rows[0].id;
  for (let i = 0; i < partes; i++) {
    await q(`insert into app.ia_chamadas (org_id, conversa_id, papel, custo_usd, created_at) values ($1, $2, 'conversa', $3, ${quando})`, [org, conversa, total / partes]);
  }
}

test('teto do dia: conversas antigas que só voltam a ser tocadas hoje (sem IA) não esgotam o dia; slug desconhecido = 0', async () => {
  /* conversas cujo gasto da vida inteira soma o teto do dia (cada uma abaixo do teto da conversa), paradas há 2 dias... */
  const n = Math.ceil(TETOS.dia_usd / TETOS.conversa_usd);
  const antigas = [];
  for (let i = 0; i < n; i++) {
    const nav = navegador(), c = await nav.iniciar();
    await q('update app.conversas set custo_ia_usd = $1 where id = $2', [TETOS.conversa_usd, c]);
    await local.db.exec(`begin; set local bz.restaurando = 'on'; update app.conversas set ultima_atividade = now() - interval '2 days' where id = '${c}'; commit;`);
    antigas.push({ nav, c });
  }
  /* ... e que hoje só confirmam o pacote (o formulário, sem modelo): a atividade de hoje é o que o teto de antes lia */
  const versao = (await antigas[0].nav.chamar('POST', 'simular', { conversa_id: antigas[0].c, respostas: RESP })).corpo.versao;
  const antes = await chamadasRegistradas();
  for (const { nav, c } of antigas) assert.equal((await nav.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao })).status, 200);
  assert.equal(await chamadasRegistradas(), antes, 'confirmar o pacote não chama o modelo');
  const lido = (await q(`select coalesce(sum(custo_ia_usd), 0)::float s from app.conversas where (ultima_atividade at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date`)).rows[0].s;
  assert.ok(lido >= TETOS.dia_usd, 'o cenário da auditoria: a soma da vida inteira das conversas tocadas hoje chega ao teto (' + lido + ')');
  assert.equal(await custoDoDia(), 0, 'o teto do dia lê o gasto de HOJE (nenhuma chamada hoje), não a vida inteira das conversas tocadas');
  const novo = navegador(), cn = await novo.iniciar();
  const r = await novo.chamar('POST', 'mensagem', { conversa_id: cn, texto: TEXTO });
  assert.equal(r.status, 200, 'um visitante novo ainda conversa: ' + JSON.stringify(r.corpo));
  assert.equal((await reservar(cn)).ok, true, 'a reserva de custo também lê o gasto de hoje');
  assert.equal(Number((await local.rpc('vendas_custo_dia', { org_slug: 'nao-existe' })).custo_usd), 0, 'slug desconhecido: 0, nunca nulo (o fluxo lê custo_usd)');
});

test('teto do dia: chamadas registradas ANTES da meia-noite de São Paulo não contam', async () => {
  await registrarGasto(TETOS.dia_usd, 5, `(${MEIA_NOITE}) - interval '1 hour'`);
  assert.ok(await custoDoDia() < TETOS.dia_usd, 'o gasto de ontem não trava hoje: ' + await custoDoDia());
  const novo = navegador(), c = await novo.iniciar();
  assert.equal((await novo.chamar('POST', 'mensagem', { conversa_id: c, texto: TEXTO })).status, 200);
});

/* a janela sem conta: a reserva saía ANTES de o registro da chamada ser gravado; entre as duas o gasto não estava nem nas
   reservas nem no registro (antes não importava, porque o custo já estava em custo_ia_usd) */
test('teto do dia: o registro da chamada é gravado ANTES de a reserva sair (sem janela sem conta)', async () => {
  const ordem = [];
  const nav = navegador({ ...deps, banco: async (nome, p) => { ordem.push(nome); return deps.banco(nome, p); } });
  const c = await nav.iniciar();
  assert.equal((await nav.chamar('POST', 'mensagem', { conversa_id: c, texto: TEXTO })).status, 200);
  const registro = ordem.indexOf('vendas_registrar_ia'), liberar = ordem.indexOf('vendas_liberar_reserva');
  assert.ok(registro >= 0 && liberar >= 0, 'as duas chamadas aconteceram: ' + ordem.join(', '));
  assert.ok(registro < liberar, 'o registro vem antes de liberar a reserva: ' + ordem.join(', '));
  assert.equal((await q('select count(*)::int n from privado.reservas_ia where conversa_id = $1', [c])).rows[0].n, 0, 'reserva liberada depois do registro');
});

test('teto do dia: se o registro da chamada não grava, a reserva NÃO é liberada (vence sozinha) e a resposta segue', async () => {
  const nav = navegador({ ...deps, banco: async (nome, p) => {
    if (nome === 'vendas_registrar_ia') throw Object.assign(new Error('x'), { codigo: '57014' });
    return deps.banco(nome, p);
  } });
  const c = await nav.iniciar();
  const r = await nav.chamar('POST', 'mensagem', { conversa_id: c, texto: TEXTO });
  assert.equal(r.status, 200, 'a falha do registro não derruba a conversa: ' + JSON.stringify(r.corpo));
  assert.equal((await q('select count(*)::int n from privado.reservas_ia where conversa_id = $1', [c])).rows[0].n, 1, 'a reserva fica, em vez de zerar a conta na hora');
  await q('delete from privado.reservas_ia where conversa_id = $1', [c]);
});

/* a geração (Opus, a chamada mais cara) tinha um segundo gravarChamadas, de dentro, que esvaziava a lista e ignorava a falha;
   o de comReserva achava a lista vazia e liberava a reserva na hora (revisões finais da auditoria run-1) */
test('teto do dia: na geração de direção, se o registro da chamada não grava, a reserva também NÃO é liberada', async () => {
  const nav = navegador({ ...deps, banco: async (nome, p) => {
    if (nome === 'vendas_registrar_ia') throw Object.assign(new Error('x'), { codigo: '57014' });
    return deps.banco(nome, p);
  } });
  const c = await nav.iniciar();
  const versao = (await nav.chamar('POST', 'simular', { conversa_id: c, respostas: RESP })).corpo.versao;
  assert.equal((await nav.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao })).status, 200);
  await detalhesEConfirmar(nav.chamar, local.rpc, c);
  const g = await nav.chamar('POST', 'gerar', { conversa_id: c });
  assert.equal(g.corpo.direcoes.length, 3);
  const r = await nav.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: g.corpo.direcoes[0].id });
  assert.equal(r.corpo.status, 'pronta', 'a falha do registro não derruba a geração: ' + JSON.stringify(r.corpo));
  assert.equal((await q('select count(*)::int n from privado.reservas_ia where conversa_id = $1', [c])).rows[0].n, 1, 'a reserva da geração fica até vencer');
  await q('delete from privado.reservas_ia where conversa_id = $1', [c]);
});

/* POR ÚLTIMO: o registro só aceita inserção, e este caso trava o dia deste banco */
test('teto do dia: o gasto REAL de hoje (chamadas registradas) no teto trava o dia, com o WhatsApp', async () => {
  const gastoAntes = await custoDoDia();
  await registrarGasto(TETOS.dia_usd, 5, 'now()');
  assert.ok(await custoDoDia() >= TETOS.dia_usd, 'o gasto de hoje chega ao teto: ' + await custoDoDia() + ' (antes ' + gastoAntes + ')');
  const novo = navegador(), c = await novo.iniciar();
  const r = await novo.chamar('POST', 'mensagem', { conversa_id: c, texto: TEXTO });
  assert.equal(r.status, 503, JSON.stringify(r.corpo));
  assert.equal(r.corpo.whatsapp, true);
  assert.deepEqual(await reservar(c), { ok: false, motivo: 'dia' });
});
