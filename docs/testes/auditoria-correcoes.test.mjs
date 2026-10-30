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
import { executarTurno } from '../../api/_vendas/agente.mjs';
import { ETAPAS_COM_PRECO } from '../../api/_vendas/consultor.mjs';
import { LIMITES_DE_TESTE, telefoneDeTeste } from './_pedido.mjs';
import { criarCenario } from './_ajustes.mjs';

const BASE = 'http://127.0.0.1:8899';
const SEGREDO = 'segredo-de-teste';
let local, deps, cenario;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: SEGREDO, limitesPedido: LIMITES_DE_TESTE };
  cenario = criarCenario(local);
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
const RESP = { ramo: 'saude', cidade: 'Niterói', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };
const visitanteDeConversa = async c => (await local.db.query('select visitante_id from app.conversas where id = $1', [c])).rows[0].visitante_id;

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
  assert.equal(passou.extra.recado, true);
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

/* ---------- Task 4 (pista 4): o consultor não recalcula o preço depois da escolha ---------- */
/* depois da escolha dos modelos nenhum ajuste muda o preço (as opções prontas, PR 3a, recusam estimativa); mas o modelo ainda
   podia chamar `estimar` em "escolhida"/"alteracoes" ("achei caro, dá para começar menor?") e gravar uma estimativa nova, e o
   escopo (que pega a ÚLTIMA estimativa) saía com outro valor, sem o dono ver. Camadas: a lista de ferramentas da etapa
   (consultor.test.mjs), a recusa do agente, o filtro do turno e o banco; um teste por camada onde ela se alcança sozinha */
const regrasAtivasId = async () => (await local.db.query(`select id from app.regras_comerciais where status = 'ativa' limit 1`)).rows[0].id;
const estimativasDe = async c => (await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n;

test('banco: estimativa só até o contato (descoberta, estimativa, contato); em direções, escolhida e alterações é 55000', async () => {
  const { c } = await cenario.ateEscolher();
  const vid = await visitanteDeConversa(c), regras_id = await regrasAtivasId();
  const gravar = () => local.rpc('vendas_registrar_estimativa', { conversa_id: c, visitante_id: vid, regras_id, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 });
  const antes = await estimativasDe(c);
  for (const etapa of ['direcoes', 'escolhida', 'alteracoes']) {
    await cenario.forcarEtapa(c, etapa);
    await assert.rejects(gravar(), e => e.codigo === '55000', etapa + ': o pacote já foi fechado');
  }
  assert.equal(await estimativasDe(c), antes, 'nenhuma estimativa nova');
  /* "contato" nem sempre é antes da confirmação: se as três direções falham, a conversa volta a "contato" com o pedido
     CONFIRMADO (privado.parar_geracao / pedidos_dono.sql); aí o pacote continua fechado */
  await cenario.forcarEtapa(c, 'contato');
  await assert.rejects(gravar(), e => e.codigo === '55000', 'contato com o pedido já confirmado: o pacote está fechado');
  assert.equal(await estimativasDe(c), antes, 'nenhuma estimativa nova');
});

test('banco: com os detalhes enviados o pedido já está confirmado e o preço está fechado', async () => {
  const n = cenario.navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao })).status, 200);
  assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, negocio: 'Clínica Exemplo', vende: 'Fisioterapia', telefone: telefoneDeTeste(), nome: 'Ana Souza', aceite: true })).status, 200);
  const vid = await visitanteDeConversa(c);
  assert.equal((await local.db.query('select status from app.pedidos where conversa_id = $1', [c])).rows[0].status, 'confirmado');
  await assert.rejects(local.rpc('vendas_registrar_estimativa', { conversa_id: c, visitante_id: vid, regras_id: await regrasAtivasId(), fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 }), e => e.codigo === '55000');
});

test('as etapas com preço do JS (ETAPAS_COM_PRECO) são as mesmas do banco (vendas_registrar_estimativa)', async () => {
  const fonte = (await local.db.query(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = 'vendas_registrar_estimativa'`)).rows[0].prosrc;
  const lista = /exigir_etapa\(c, array\[([^\]]+)\]\)/.exec(fonte);
  assert.ok(lista, 'a função confere a etapa');
  assert.deepEqual(lista[1].split(',').map(s => s.trim().replace(/'/g, '')), ETAPAS_COM_PRECO);
});

test('agente: estimar e pedir_contato depois da confirmação do pedido são recusados com motivo próprio, sem estimativa; até o contato seguem valendo', async () => {
  const regras = (await local.rpc('vendas_regras_ativas', { org_slug: 'beyon-zero' })).regras;
  const turno = async (etapa, pedidoStatus) => {
    const vistos = [];
    let rodada = 0;
    const ia = { mensagem: async p => {
      if (rodada++ > 0) { vistos.push(...p.mensagens.at(-1).content.map(r => JSON.parse(r.content))); return { texto: 'Certo.', chamadas: [], conteudo: [], parada: 'fim', custo_usd: 0 }; }
      const chamadas = [{ id: 't1', nome: 'estimar', entrada: { formato: 'institucional' } }, { id: 't2', nome: 'pedir_contato', entrada: {} }];
      return { texto: '', chamadas, conteudo: chamadas.map(x => ({ type: 'tool_use', id: x.id, name: x.nome, input: x.entrada })), parada: 'ferramenta', custo_usd: 0 };
    } };
    const conversa = { etapa, pedido_status: pedidoStatus, briefing: { negocio: { segmento: 'saúde' }, objetivos: ['agendamentos'], projeto: { formato: 'institucional' } }, mensagens: [],
      estimativa: { prazo_dias: 8, detalhes: { itens: [] } } };
    const r = await executarTurno({ ia, regras, conversa, mensagem: 'Achei caro, dá para começar menor?' });
    return { r, vistos };
  };
  for (const etapa of ['direcoes', 'escolhida', 'alteracoes']) {
    const { r, vistos } = await turno(etapa);
    assert.equal(r.estimativa, null, etapa);
    assert.equal(r.pedir_contato, false, etapa);
    assert.deepEqual(vistos.map(v => v.motivo), ['o pacote já foi fechado', 'o pacote já foi fechado'], etapa);
  }
  /* as três direções falharam: a conversa voltou a "contato" com o pedido já CONFIRMADO; o pacote segue fechado */
  const fechado = await turno('contato', 'confirmado');
  assert.equal(fechado.r.estimativa, null, 'contato com o pedido confirmado');
  assert.equal(fechado.r.pedir_contato, false);
  assert.deepEqual(fechado.vistos.map(v => v.motivo), ['o pacote já foi fechado', 'o pacote já foi fechado']);
  const { r } = await turno('contato', 'aguardando');
  assert.ok(r.estimativa, 'no contato, com o pedido esperando a confirmação pelo WhatsApp, o modelo ainda recalcula');
  assert.equal(r.pedir_contato, true);
});

test('consultor: a conversa volta a "contato" com o pedido confirmado (três direções falharam): "achei caro" não gera estimativa nova', async () => {
  const { n, c } = await cenario.ateEscolher({ ia: criarSimulada() });
  await cenario.forcarEtapa(c, 'contato');
  const antes = await estimativasDe(c);
  const r = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Achei caro, dá para começar menor?' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.estimativa, null, 'nenhum cartão de preço novo na tela');
  assert.equal(await estimativasDe(c), antes, 'nenhuma estimativa nova no banco');
});

test('consultor: depois da escolha, "achei caro" não gera estimativa nova e o escopo sai da estimativa de antes', async () => {
  const { n, c } = await cenario.ateEscolher({ ia: criarSimulada() });
  const antes = await estimativasDe(c);
  const ultimoValor = async () => Number((await local.db.query('select valor_total from app.estimativas where conversa_id = $1 order by created_at desc limit 1', [c])).rows[0].valor_total);
  const valor = await ultimoValor();
  const r = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Achei caro, dá para começar menor?' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.estimativa, null, 'nenhum cartão de preço novo na tela');
  assert.equal(await estimativasDe(c), antes, 'nenhuma estimativa nova no banco');
  const esc = await n.chamar('POST', 'escopo', { conversa_id: c });
  assert.equal(esc.status, 200, JSON.stringify(esc.corpo));
  assert.equal(Number(esc.corpo.valor_total), valor, 'o escopo traz o valor da estimativa de antes');
});
