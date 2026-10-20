/* PR de correções da auditoria de segurança (run-1, 20/10/2026): cada teste reproduz um furo verificado e tem de ficar
   verde só com a correção. Banco real (PGlite + migrations), IA simulada. npm run testar
   Registros: 06 Operação/Auditoria de segurança/run-1/findings.json. Plano: docs/superpowers/plans/2026-10-20-auditoria-correcoes.md */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { TETOS } from '../../api/_ia/config.mjs';
import { criarFluxo } from '../../api/_vendas/fluxo.mjs';
import { chaveDoIp48 } from '../../api/_vendas/ip.mjs';
import { LIMITES_DE_TESTE } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
const SEGREDO = 'segredo-de-teste';
let local, deps;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: SEGREDO, limitesPedido: LIMITES_DE_TESTE };
});

/* o fluxo direto (sem o freio em memória da API): o que se testa aqui é o freio do BANCO. Uma conversa nova por chamada */
function porIp(ip, textos = ['Tenho uma padaria e quero um site']) {
  const f = criarFluxo(deps);
  const pedido = token => new Request(BASE + '/api/vendas', { headers: { 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) } });
  return async () => {
    const s = await f.sessao({ request: pedido(), corpo: {} });
    try {
      for (const texto of textos) await f.mensagem({ request: pedido(s.token), corpo: { conversa_id: s.conversa_id, texto } });
      return { conversa: s.conversa_id, status: 200 };
    } catch (e) { return { conversa: s.conversa_id, status: e.status, extra: e.extra }; }
  };
}
const seg = n => n.toString(16);

/* ---------- Task 2 (pista 1): o limite diário do consultor também por /48 ---------- */
/* a casa ou a empresa com IPv6 recebe um /48 inteiro (65.536 redes /64) e troca de /64 à vontade; só o /64 contava, e o
   teto de 8 por /64 nunca disparava. O teto do /48 é maior que o do /64 (a casa tem mais de um aparelho), mas fecha */
test('consultor: invariantes do teto por /48 (maior que o do /64 e, somado, abaixo do teto do dia)', () => {
  assert.ok(Number.isInteger(TETOS.conversas_por_ip48_dia), 'TETOS.conversas_por_ip48_dia existe');
  assert.ok(TETOS.conversas_por_ip48_dia > TETOS.conversas_por_ip_dia, 'o /48 tem mais gente que o /64');
  assert.ok(TETOS.conversas_por_ip48_dia * TETOS.conversa_usd < TETOS.dia_usd, 'um /48 sozinho não esgota o teto do dia de todos');
});

test('consultor: conversas de /64 diferentes do mesmo /48 esbarram no teto do /48 (429, WhatsApp, evento no funil)', async () => {
  const teto = TETOS.conversas_por_ip48_dia;
  /* cada conversa de um /64 próprio: o teto de 8 por /64 nunca dispara, só o do /48 */
  for (let i = 1; i <= teto; i++) {
    const r = await porIp('2001:db8:4800:' + seg(i) + '::1')();
    assert.equal(r.status, 200, 'a conversa ' + i + ' do /48 ainda cabe');
  }
  const passou = await porIp('2001:db8:4800:ff::1')();
  assert.equal(passou.status, 429, 'a conversa ' + (teto + 1) + ' do mesmo /48 não chama o modelo');
  assert.equal(passou.extra.whatsapp, true);
  const ev = (await local.db.query(`select dados from app.eventos_funil where conversa_id = $1 and tipo = 'freio_ip'`, [passou.conversa])).rows;
  assert.ok(ev.some(e => e.dados.prefixo === 48), 'o dono vê no funil que foi o /48: ' + JSON.stringify(ev));
  assert.equal((await porIp('2001:db8:4801:1::1')()).status, 200, 'outro /48 segue livre');
});

test('consultor: o /48 conta uma vez por conversa, com o seu próprio uso (ia48), sem dividir o contador do pedido', async () => {
  const ip = '2001:db8:4802:1::1';
  const r = await porIp(ip, ['Tenho uma escola e quero um site', 'quero captar matrículas', 'tem formulário?'])();
  assert.equal(r.status, 200);
  const n = async uso => (await local.db.query('select coalesce(sum(n), 0)::int n from privado.freio_ip where chave = $1', [chaveDoIp48(ip, SEGREDO, new Date(), uso)])).rows[0].n;
  assert.equal(await n('ia48'), 1, 'três mensagens da mesma conversa contam uma vez no /48');
  assert.equal(await n('pedido48'), 0, 'o contador do pedido (uso pedido48) não é tocado');
});

test('consultor: chave do /48 mal formada, ou sem o teto, é recusada (22023) em vez de desligar o freio em silêncio', async () => {
  const s = await porIp('2001:db8:4803:1::1')();
  const vid = (await local.db.query('select visitante_id from app.conversas where id = $1', [s.conversa])).rows[0].visitante_id;
  const base = { conversa_id: s.conversa, visitante_id: vid, max_turnos: TETOS.turnos_por_conversa, teto_usd: TETOS.conversa_usd, segundos: 120 };
  await assert.rejects(local.rpc('vendas_reservar_ia', { ...base, chave_ip48: 'ABC', max_por_ip48: TETOS.conversas_por_ip48_dia }), e => e.codigo === '22023');
  await assert.rejects(local.rpc('vendas_reservar_ia', { ...base, chave_ip48: 'a'.repeat(64) }), e => e.codigo === '22023', 'chave sem o teto');
});
