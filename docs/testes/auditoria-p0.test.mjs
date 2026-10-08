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
import { TIPOS_SECAO } from '../../api/_vendas/direcao.mjs';
import { executar as rotinas } from '../../api/rotinas.mjs';
/* segredo do cron nos testes: 40 caracteres de baixa entropia (uma string "aleatória" vira falso positivo no gitleaks) */
const SEGREDO_CRON_TESTE = 'teste'.repeat(8);

let local, deps;
const BASE = 'http://127.0.0.1:8899';
let ipSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
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
  await n.chamar('POST', 'contato', { conversa_id: c, nome: 'Rita', email: 'rita@x.com', aceite: true });
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  for (const d of g.corpo.direcoes) await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  return { c, dirs: g.corpo.direcoes };
}
const conversa = async c => (await local.db.query('select etapa, custo_ia_usd::float custo, contato_aceite_em from app.conversas where id = $1', [c])).rows[0];
const alteracoes = async c => (await local.db.query('select count(*)::int n from app.alteracoes where conversa_id = $1', [c])).rows[0].n;

/* uma IA que traduz o pedido de ajuste para operações fixas (o resto segue o simulado) e conta as chamadas */
function iaDeAjuste(mudancas, custo = 0.01) {
  const base = criarSimulada();
  const ia = { ...base, chamadas: 0, mensagem: async p => {
    if (p.papel === 'extracao' && String(p.mensagens?.[0]?.content || '').startsWith('DIREÇÕES:')) {
      ia.chamadas++;
      return { json: { mudancas, resposta: 'ok' }, parada: 'fim', custo_usd: custo, modelo: 'claude-sonnet-5-5' };
    }
    return base.mensagem(p);
  } };
  return ia;
}

/* ---------- 1. troca de direção depois do 1º ajuste: o contrato descrevia A e a proposta gravava B ---------- */
test('P0 troca de direção: depois de um ajuste não há nova geração (nem escolha de outra)', async () => {
  const n = navegador();
  const { c, dirs } = await ateDirecoes(n);
  assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id })).status, 200);
  assert.equal((await n.chamar('POST', 'alterar', { conversa_id: c, pedido: 'quero os depoimentos antes dos serviços' })).status, 200);
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

/* ---------- 2. ajuste que o motor de preço recusa entrava no contrato sem entrar no preço ---------- */
test('P0 ajuste fora do preço: motor recusa → nada aplicado, 422, e o custo da IA é somado', async () => {
  const ia = iaDeAjuste([{ tipo: 'escopo', operacao: 'paginas', valor: '99' }]);
  const n = navegador({ ...deps, ia });
  const { c, dirs } = await ateDirecoes(n);
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id });
  const antes = await conversa(c);
  const r = await n.chamar('POST', 'alterar', { conversa_id: c, pedido: 'quero 99 páginas' });
  assert.equal(r.status, 422, JSON.stringify(r.corpo));
  assert.equal(await alteracoes(c), 0, 'nenhuma alteração gravada como aplicada');
  assert.ok((await conversa(c)).custo > antes.custo, 'a chamada ao modelo foi paga: o custo entra no teto');
});

/* ---------- 3. custo de IA que escapava do teto ---------- */
test('P0 custo: ajuste que falha na validação (422) soma o custo da chamada', async () => {
  const ia = iaDeAjuste(TIPOS_SECAO.filter(s => s !== 'hero').map(s => ({ tipo: 'estrutura', operacao: 'remover_secao', secao: s })));
  const n = navegador({ ...deps, ia });
  const { c, dirs } = await ateDirecoes(n);
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id });
  const antes = await conversa(c);
  const r = await n.chamar('POST', 'alterar', { conversa_id: c, pedido: 'tira tudo' });
  assert.equal(r.status, 422, JSON.stringify(r.corpo));
  assert.equal(ia.chamadas, 1);
  assert.ok((await conversa(c)).custo > antes.custo, 'custo da chamada que falhou entrou na conta');
});

test('P0 custo: ajuste fora da etapa não chama o modelo', async () => {
  const ia = iaDeAjuste([{ tipo: 'visual', operacao: 'tema', valor: 'claro' }]);
  const n = navegador({ ...deps, ia });
  const { c, dirs } = await ateDirecoes(n);
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id });
  await local.db.exec(`begin; set local bz.transicao_livre = 'on'; update app.conversas set etapa = 'escopo' where id = '${c}'; commit;`);
  const r = await n.chamar('POST', 'alterar', { conversa_id: c, pedido: 'quero tema claro' });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(ia.chamadas, 0, 'nenhum gasto numa etapa que não aceita ajuste');
});

test('P0 custo: modelo fora da tabela de preços conta como o mais caro, nunca zero', () => {
  const uso = { entrada: 1e6, saida: 1e6 };
  const maisCaro = Math.max(...Object.keys(PRECO_POR_MILHAO).map(m => custoUsd(m, uso)));
  assert.equal(custoUsd('modelo-desconhecido', uso), maisCaro);
  assert.equal(custoUsd('modelo-desconhecido', null), 0, 'sem uso, sem custo');
});

test('P0 custo: o modelo que recusa responder também é pago (turno e geração)', async () => {
  const base = criarSimulada();
  const recusa = { ...base, mensagem: async p => p.papel === 'conversa' || p.papel === 'geracao'
    ? { texto: '', json: null, chamadas: [], conteudo: [], parada: 'recusa', modelo: 'claude-sonnet-5-5', uso: {}, custo_usd: 0.02 }
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
  assert.equal(passou.extra.whatsapp, true);
  assert.ok((await local.db.query(`select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'freio_ip'`, [passou.conversa])).rows.length, 'o dono vê o freio no funil');
  assert.equal((await porIp('203.0.113.78')('Tenho uma padaria e quero um site')).status, 200, 'outro IP segue livre');
  const chaves = (await local.db.query('select chave from privado.freio_ip')).rows.map(r => r.chave);
  assert.ok(chaves.length >= 2 && chaves.every(c => /^[0-9a-f]{64}$/.test(c) && !c.includes('203')), 'só o HMAC (64 hex), nunca o IP');
});

test('P0 freio: a mesma conversa conta uma vez só; sem segredo ou servidor local, não conta', async () => {
  const f = criarFluxo({ ...deps, segredoFreio: 'segredo-de-teste' });
  const pedido = (ip, token) => new Request(BASE + '/api/vendas', { headers: { 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) } });
  const s = await f.sessao({ request: pedido('198.51.100.200'), corpo: {} });
  for (const texto of ['Tenho uma escola e quero um site', 'quero captar matrículas', 'tem formulário?']) await f.mensagem({ request: pedido('198.51.100.200', s.token), corpo: { conversa_id: s.conversa_id, texto } });
  const n = async () => (await local.db.query('select coalesce(sum(n), 0)::int n from privado.freio_ip')).rows[0].n;
  const antes = await n();
  await porIp('local')('Tenho uma escola e quero um site');
  await porIp('198.51.100.201', { ...deps })('Tenho uma escola e quero um site');   /* (sem segredo) */
  assert.equal(await n(), antes, 'servidor local e sem segredo: nada contado');
  assert.ok(antes >= 1);
  const ipv6 = ['2001:db8:a:b:1::1', '2001:db8:a:b:ffff::9'].map(ip => chaveDoIp(ip, 'k'));
  assert.equal(ipv6[0], ipv6[1], 'IPv6: a casa inteira (/64) conta junto');
  assert.notEqual(chaveDoIp('203.0.113.1', 'k'), chaveDoIp('203.0.113.1', 'outro'), 'sem o segredo, a chave não se refaz');
});

/* ---------- 7. custo em falhas que ainda escapavam (revisão técnica) ---------- */
test('P0 custo: o modelo que recusa traduzir o ajuste também é pago (503 e custo somado)', async () => {
  const base = criarSimulada();
  const recusa = { ...base, mensagem: async p => String(p.mensagens?.[0]?.content || '').startsWith('DIREÇÕES:')
    ? { texto: '', json: null, chamadas: [], conteudo: [], parada: 'recusa', modelo: 'claude-sonnet-5-5', uso: {}, custo_usd: 0.03 }
    : base.mensagem(p) };
  const n = navegador();
  const { c, dirs } = await ateDirecoes(n);
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id });
  const antes = (await conversa(c)).custo;
  const r = await n.chamar('POST', 'alterar', { conversa_id: c, pedido: 'quero tema claro' }, { deps: { ...deps, ia: recusa } });
  assert.equal(r.status, 503);
  assert.ok(Math.abs((await conversa(c)).custo - antes - 0.03) < 1e-9);
});

test('P0 custo: falha numa rodada do agente leva o custo das rodadas anteriores', async () => {
  let rodada = 0;
  const ia = { mensagem: async () => {
    rodada++;
    if (rodada === 1) return { texto: '', json: null, conteudo: [], parada: 'ferramenta', modelo: 'claude-sonnet-5-5', uso: {}, custo_usd: 0.05,
      chamadas: [{ id: 't1', nome: 'atualizar_briefing', entrada: { negocio: { segmento: 'padaria' } } }] };
    throw new ErroIA('tempo', 'tempo esgotado', 0.01);
  } };
  const regras = (await local.rpc('vendas_regras_ativas', { org_slug: 'beyon-zero' })).regras;
  await assert.rejects(executarTurno({ ia, regras, conversa: { etapa: 'descoberta', briefing: {}, mensagens: [] }, mensagem: 'oi' }),
    e => e instanceof ErroIA && Math.abs(e.custo_usd - 0.06) < 1e-9);
});

/* ---------- 8. corrida "alterar" × "escolher": o ajuste montado sobre A não grava se B foi escolhida no meio ---------- */
test('P0 troca de direção: escolher outra enquanto o modelo traduz o ajuste não deixa o ajuste gravar na outra', async () => {
  const base = criarSimulada();
  let troca;
  const lenta = { ...base, mensagem: async p => {
    if (String(p.mensagens?.[0]?.content || '').startsWith('DIREÇÕES:')) { await troca(); return { json: { mudancas: [{ tipo: 'visual', operacao: 'tema', valor: 'claro' }], resposta: 'ok' }, parada: 'fim', custo_usd: 0, modelo: 'claude-sonnet-5-5' }; }
    return base.mensagem(p);
  } };
  const n = navegador();
  const { c, dirs } = await ateDirecoes(n);
  await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[0].id });
  troca = async () => assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs[1].id })).status, 200);
  const r = await n.chamar('POST', 'alterar', { conversa_id: c, pedido: 'quero tema claro' }, { deps: { ...deps, ia: lenta } });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(await alteracoes(c), 0);
});

/* ---------- 5. prova de consentimento ---------- */
test('P0 consentimento: informar o contato de novo não apaga a data do 1º aceite', async () => {
  const n = navegador();
  const s = await n.iniciar();
  const c = s.conversa_id;
  await n.chamar('POST', 'contato', { conversa_id: c, nome: 'Ana', email: 'ana@x.com', aceite: true });
  await local.db.query(`update app.conversas set contato_aceite_em = now() - interval '3 days' where id = $1`, [c]);
  const primeiro = (await conversa(c)).contato_aceite_em.getTime();
  await n.chamar('POST', 'contato', { conversa_id: c, nome: 'Ana Souza', email: 'ana@x.com', aceite: true });
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
