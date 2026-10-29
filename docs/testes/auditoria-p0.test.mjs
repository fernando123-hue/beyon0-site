/* P0 da auditoria do Harness (06 Operação/Auditoria do Harness — 2026-10-07.md): cada teste reproduz um furo
   verificado no código e tem de ficar verde só com a correção. Banco real (PGlite + migrations), IA simulada.
   npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { custoUsd, PRECO_POR_MILHAO, TETOS } from '../../api/_ia/config.mjs';
import { criarFluxo } from '../../api/_vendas/fluxo.mjs';
import { executarTurno } from '../../api/_vendas/agente.mjs';
import { chaveDoIp } from '../../api/_vendas/ip.mjs';
import { ErroIA } from '../../api/_ia/provedor.mjs';
import { executar as rotinas } from '../../api/rotinas.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';
/* segredo do cron nos testes: 40 caracteres de baixa entropia (uma string "aleatória" vira falso positivo no gitleaks) */
const SEGREDO_CRON_TESTE = 'teste'.repeat(8);

let local, deps;
const BASE = 'http://127.0.0.1:8899';
let ipSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
});

function navegador(d = deps, ip = '192.0.2.' + (++ipSeq)) {
  let token = null;
  const chamar = async (metodo, acao, corpo, extra = {}) => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + (extra.query || ''), {
      method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
    }), {}, metodo, extra.deps || d);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo; } };
}
async function ateDirecoes(n) {
  const s = await n.iniciar();
  const c = s.conversa_id;
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Tenho uma clínica e quero um site institucional para agendamentos' });
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'sim' });
  await detalhesEConfirmar(n.chamar, local.rpc, c);
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  for (const d of g.corpo.direcoes) await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  return { c, dirs: g.corpo.direcoes };
}
const conversa = async c => (await local.db.query('select etapa, custo_ia_usd::float custo, contato_aceite_em from app.conversas where id = $1', [c])).rows[0];
const alteracoes = async c => (await local.db.query('select count(*)::int n from app.alteracoes where conversa_id = $1', [c])).rows[0].n;

/* ---------- 1. troca de direção depois do 1º ajuste: o contrato descrevia A e a proposta gravava B ---------- */
test('P0 troca de direção: depois de um ajuste não há nova geração (nem escolha de outra)', async () => {
  const n = navegador();
  const { c, dirs } = await ateDirecoes(n);
  assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id })).status, 200);
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'mover_antes_de', secao: 'depoimentos', referencia: 'servicos' } })).status, 200);
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  assert.equal(g.status, 409, 'gerar de novo depois do ajuste abria a troca de direção: ' + JSON.stringify(g.corpo));
  assert.equal((await conversa(c)).etapa, 'alteracoes');
});

test('P0 troca de direção: só vale escolher uma direção da geração ATUAL', async () => {
  const n = navegador();
  const { c, dirs } = await ateDirecoes(n);
  const g2 = await n.chamar('POST', 'gerar', { conversa_id: c });   /* nova geração antes de escolher: permitido */
  for (const d of g2.corpo.direcoes) await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  const velha = await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id });
  assert.equal(velha.status, 404, 'direção da geração anterior não pode ser escolhida: ' + JSON.stringify(velha.corpo));
});

/* ---------- 3. custo de IA que escapava do teto ---------- */
test('P0 custo: modelo fora da tabela de preços conta como o mais caro, nunca zero', () => {
  const uso = { entrada: 1e6, saida: 1e6 };
  const maisCaro = Math.max(...Object.keys(PRECO_POR_MILHAO).map(m => custoUsd(m, uso)));
  assert.equal(custoUsd('modelo-desconhecido', uso), maisCaro);
  assert.equal(custoUsd('modelo-desconhecido', null), 0, 'sem uso, sem custo');
});

test('custo: Haiku 5.5 tem duas tabelas, pela soma da entrada do pedido (até 100 mil tokens e acima)', () => {
  /* referência da API (2026-10-06): US$ 0,10 / 0,50 por milhão até 100K de prompt; 0,50 / 2,50 acima;
     leitura de cache 0,1× e escrita de 5 min 1,25× a entrada da mesma tabela */
  const perto = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(perto(custoUsd('claude-haiku-5-5', { entrada: 10000, saida: 1000 }), 0.001 + 0.0005), 'curto: tabela de baixo');
  assert.ok(perto(custoUsd('claude-haiku-5-5', { entrada: 2000, cache_leitura: 8000, cache_escrita: 1000, saida: 0 }), 0.0002 + 0.00008 + 0.000125), 'cache na tabela de baixo');
  /* o limite conta a entrada INTEIRA (sem cache + lida do cache + escrita no cache) */
  assert.ok(perto(custoUsd('claude-haiku-5-5', { entrada: 20000, cache_leitura: 90000, saida: 1000 }), 0.01 + 0.0045 + 0.0025), 'acima de 100K: tabela de cima');
  assert.ok(perto(custoUsd('claude-haiku-5-5', { entrada: 100000, saida: 0 }), 0.01), '100K exatos ainda é a de baixo');
});

test('P0 custo: o modelo que recusa responder também é pago (turno e geração)', async () => {
  const base = criarSimulada();
  const recusa = { ...base, mensagem: async p => p.papel === 'conversa' || p.papel === 'geracao'
    ? { texto: '', json: null, chamadas: [], conteudo: [], parada: 'recusa', modelo: 'claude-haiku-5-5', uso: {}, custo_usd: 0.02 }
    : base.mensagem(p) };
  const n = navegador();
  const { c, dirs } = await ateDirecoes(n);
  const antes = (await conversa(c)).custo;
  const r = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'pode explicar melhor?' }, { deps: { ...deps, ia: recusa } });
  assert.equal(r.status, 503);
  const depoisTurno = (await conversa(c)).custo;
  assert.ok(Math.abs(depoisTurno - antes - 0.02) < 1e-9, 'a recusa do turno entrou na conta: ' + (depoisTurno - antes));
  await local.db.query(`update app.direcoes set status = 'gerando', conteudo = null, iniciada_em = null where id = $1`, [dirs[0].id]);
  await local.db.exec(`begin; set local bz.transicao_livre = 'on'; update app.conversas set etapa = 'gerando' where id = '${c}'; commit;`);
  const g = await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: dirs[0].id }, { deps: { ...deps, ia: recusa } });
  assert.equal(g.corpo.status, 'falhou');
  assert.ok((await conversa(c)).custo > depoisTurno, 'a recusa da geração entrou na conta');
});

/* ---------- 4. abuso: dezenas de conversas de um mesmo IP derrubavam o teto do dia para todos ---------- */
/* o fluxo direto (sem o freio em memória de 8 sessões por 10 min da API): o que se testa aqui é o freio do BANCO */
function porIp(ip, d = { ...deps, segredoFreio: 'segredo-de-teste' }) {
  const f = criarFluxo(d);
  const pedido = token => new Request(BASE + '/api/vendas', { headers: { 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) } });
  return async texto => {
    const s = await f.sessao({ request: pedido(), corpo: {} });
    try { await f.mensagem({ request: pedido(s.token), corpo: { conversa_id: s.conversa_id, texto } }); return { conversa: s.conversa_id, status: 200 }; }
    catch (e) { return { conversa: s.conversa_id, status: e.status, extra: e.extra }; }
  };
}

test('P0 freio no banco: conversas que usam a IA por IP por dia têm limite; o IP não chega ao banco', async () => {
  const conversar = porIp('203.0.113.77');
  for (let i = 0; i < TETOS.conversas_por_ip_dia; i++) assert.equal((await conversar('Tenho uma padaria e quero um site')).status, 200);
  const passou = await conversar('Tenho uma padaria e quero um site');
  assert.equal(passou.status, 429, 'a conversa a mais do mesmo IP no dia não chama o modelo');
  assert.equal(passou.extra.recado, true);
  assert.ok((await local.db.query(`select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'freio_ip'`, [passou.conversa])).rows.length, 'o dono vê o freio no funil');
  assert.equal((await porIp('203.0.113.78')('Tenho uma padaria e quero um site')).status, 200, 'outro IP segue livre');
  const chaves = (await local.db.query('select chave from privado.freio_ip')).rows.map(r => r.chave);
  assert.ok(chaves.length >= 2 && chaves.every(c => /^[0-9a-f]{64}$/.test(c) && !c.includes('203.0.113')), 'só o HMAC (64 hex), nunca o IP');   /* (o IP inteiro: um hex qualquer pode conter "203" por acaso, e a chave muda com o dia; em 2026-10-11 continha) */
});

test('P0 freio: a mesma conversa conta uma vez só; sem segredo ou servidor local, não conta', async () => {
  const f = criarFluxo({ ...deps, segredoFreio: 'segredo-de-teste' });
  const pedido = (ip, token) => new Request(BASE + '/api/vendas', { headers: { 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) } });
  const s = await f.sessao({ request: pedido('198.51.100.200'), corpo: {} });
  for (const texto of ['Tenho uma escola e quero um site', 'quero captar matrículas', 'tem formulário?']) await f.mensagem({ request: pedido('198.51.100.200', s.token), corpo: { conversa_id: s.conversa_id, texto } });
  const n = async () => (await local.db.query('select coalesce(sum(n), 0)::int n from privado.freio_ip')).rows[0].n;
  const antes = await n();
  await porIp('local')('Tenho uma escola e quero um site');
  await porIp('198.51.100.201', { ...deps, segredoFreio: undefined })('Tenho uma escola e quero um site');   /* (sem segredo) */
  assert.equal(await n(), antes, 'servidor local e sem segredo: nada contado');
  assert.ok(antes >= 1);
  const ipv6 = ['2001:db8:a:b:1::1', '2001:db8:a:b:ffff::9'].map(ip => chaveDoIp(ip, 'k'));
  assert.equal(ipv6[0], ipv6[1], 'IPv6: a casa inteira (/64) conta junto');
  assert.notEqual(chaveDoIp('203.0.113.1', 'k'), chaveDoIp('203.0.113.1', 'outro'), 'sem o segredo, a chave não se refaz');
});

/* ---------- 7. custo em falhas que ainda escapavam (revisão técnica) ---------- */
test('P0 custo: falha numa rodada do agente leva o custo das rodadas anteriores', async () => {
  let rodada = 0;
  const ia = { mensagem: async () => {
    rodada++;
    if (rodada === 1) return { texto: '', json: null, conteudo: [], parada: 'ferramenta', modelo: 'claude-haiku-5-5', uso: {}, custo_usd: 0.05,
      chamadas: [{ id: 't1', nome: 'atualizar_briefing', entrada: { negocio: { segmento: 'padaria' } } }] };
    throw new ErroIA('tempo', 'tempo esgotado', 0.01);
  } };
  const regras = (await local.rpc('vendas_regras_ativas', { org_slug: 'beyon-zero' })).regras;
  await assert.rejects(executarTurno({ ia, regras, conversa: { etapa: 'descoberta', briefing: {}, mensagens: [] }, mensagem: 'oi' }),
    e => e instanceof ErroIA && Math.abs(e.custo_usd - 0.06) < 1e-9);
});

/* ---------- 8. corrida "ajuste" × "escolher": o ajuste montado sobre A não grava se B foi escolhida no meio. Desde o PR 3a
   o ajuste não espera modelo, mas a regra fica no banco (vendas_registrar_alteracao confere a direção que o servidor leu) ---------- */
test('P0 troca de direção: ajuste montado sobre uma direção não grava se outra foi escolhida no meio (40001)', async () => {
  const n = navegador();
  const { c, dirs } = await ateDirecoes(n);
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id });
  assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[1].id })).status, 200);
  const vid = (await local.db.query('select visitante_id from app.conversas where id = $1', [c])).rows[0].visitante_id;
  await assert.rejects(local.rpc('vendas_registrar_alteracao', { conversa_id: c, visitante_id: vid, direcao_id: dirs[0].id, pedido: 'Cores do modelo 2',
    mudancas: [], resultado: { nome_conceito: 'x' }, origem: 'opcao' }), e => e.codigo === '40001');
  assert.equal(await alteracoes(c), 0);
});

/* ---------- 5. prova de consentimento ---------- */
test('P0 consentimento: informar o contato de novo não apaga a data do 1º aceite', async () => {
  const n = navegador();
  const s = await n.iniciar();
  const c = s.conversa_id;
  const vid = (await local.db.query('select visitante_id from app.conversas where id = $1', [c])).rows[0].visitante_id;
  await local.rpc('vendas_informar_contato', { conversa_id: c, visitante_id: vid, nome: 'Ana', telefone: '+5521999990000', aceite: true });
  await local.db.query(`update app.conversas set contato_aceite_em = now() - interval '3 days' where id = $1`, [c]);
  const primeiro = (await conversa(c)).contato_aceite_em.getTime();
  await local.rpc('vendas_informar_contato', { conversa_id: c, visitante_id: vid, nome: 'Ana Souza', telefone: '+5521999990000', aceite: true });
  assert.equal((await conversa(c)).contato_aceite_em.getTime(), primeiro);
});

/* ---------- 6. a retenção prometida na privacidade (90 dias na época; 60 desde a migration 20261008120500) passa a rodar sozinha (rotina diária, com segredo) ---------- */
test('P0 rotina diária: só com o segredo do cron; roda a retenção', async () => {
  const env = { CRON_SECRET: SEGREDO_CRON_TESTE };
  const pedir = auth => rotinas(new Request(BASE + '/api/rotinas?acao=diaria', { headers: auth ? { authorization: auth } : {} }), env, { banco: local.rpc });
  assert.equal((await pedir()).status, 401);
  assert.equal((await pedir('Bearer errado')).status, 401);
  const ok = await pedir('Bearer ' + SEGREDO_CRON_TESTE);
  assert.equal(ok.status, 200);
  const corpo = await ok.json();
  assert.equal(typeof corpo.retencao.mensagens_apagadas, 'number', JSON.stringify(corpo));
});

test('segredo das rotinas: 32+ caracteres, espaço colado não atrapalha, tentativas erradas freiam (revisão do PR 1, segurança B3)', async () => {
  const pedir = (env, auth, ip = '198.51.100.90') => rotinas(new Request(BASE + '/api/rotinas?acao=diaria', { headers: { 'x-forwarded-for': ip, ...(auth ? { authorization: auth } : {}) } }), env, { banco: local.rpc });
  const curto = 'a'.repeat(31);
  assert.equal((await pedir({ CRON_SECRET: curto }, 'Bearer ' + curto)).status, 401, '31 caracteres: rotina desligada');
  const forte = 'b'.repeat(40);
  assert.equal((await pedir({ CRON_SECRET: '  ' + forte + '\n' }, 'Bearer ' + forte)).status, 200, 'espaço/quebra colados no segredo da Vercel não desligam');
  /* tentativas erradas do mesmo IP: depois de 10 em 10 min, 429 (o certo de outro IP continua passando) */
  const ip = '198.51.100.91';
  const erros = [];
  for (let i = 0; i < 12; i++) erros.push((await pedir({ CRON_SECRET: forte }, 'Bearer chute-' + i, ip)).status);
  assert.deepEqual(erros.slice(0, 10), Array(10).fill(401));
  assert.deepEqual(erros.slice(10), [429, 429], 'a 11ª tentativa errada é freada');
  assert.equal((await pedir({ CRON_SECRET: forte }, 'Bearer ' + forte, '198.51.100.92')).status, 200, 'o cron de verdade (outro IP) não é afetado');
  /* a reconciliação de pagamentos lê o segredo pela mesma função (api/_pagamentos/config.mjs → api/_cron.mjs) */
  const { segredoDoCron } = await import('../../api/_cron.mjs');
  assert.equal(segredoDoCron({ CRON_SECRET: curto }), null);
  assert.equal(segredoDoCron({ CRON_SECRET: ' ' + forte + ' ' }), forte);
  assert.equal(segredoDoCron({}), null);
});
