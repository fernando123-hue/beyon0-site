/* O VIGIA (spec 2026-11-15-auto-reparo): confere o site sem IA e avisa o dono sem repetir.
   Aqui: a decisão pura (api/_vigia/decidir.mjs), as conferências do Worker (api/_vigia/conferir.mjs) e a ronda de ponta a ponta
   com o banco local e um canal de e-mail falso (api/_vigia/rondar.mjs).  node --test docs/testes/vigia.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITENS, ESTREIA, BANCO_FORA, SEM_MEMORIA, achadosDe, decidir, decidirSemBanco, lembrarSemBanco } from '../../api/_vigia/decidir.mjs';

const H = 3600e3;
const AGORA = Date.UTC(2026, 10, 15, 13, 23);
const iso = ms => new Date(ms).toISOString();
const LEITURA_OK = { estado: {}, estreia_em: iso(AGORA - 100 * H), falhas_ia_hora: 0, conversas_falha_hora: 0, ultima_falha_conta_em: null,
  ultima_ok_ia_em: iso(AGORA - H), ultima_falha_ia_em: null, ultima_reconciliacao_em: iso(AGORA - H), ultima_diaria_em: iso(AGORA - 7 * H), urgentes: 0 };
const CONF_OK = { paginas: true, configuracao: [], pagamentosLigados: true };
const ativos = a => Object.keys(a).filter(k => a[k]).sort();

/* ---- achadosDe: o que está quebrado agora ---- */
test('achados: tudo em ordem → nada quebrado', () => {
  assert.deepEqual(ativos(achadosDe(LEITURA_OK, CONF_OK, AGORA)), []);
});

test('achados: cada item quebra pelo motivo dele, com texto fixo', () => {
  const a = achadosDe({ ...LEITURA_OK, ultima_reconciliacao_em: iso(AGORA - 7 * H), ultima_diaria_em: iso(AGORA - 27 * H), urgentes: 2,
    falhas_ia_hora: 3, conversas_falha_hora: 2, ultima_falha_ia_em: iso(AGORA - 60e3), ultima_falha_conta_em: iso(AGORA - 30e3) },
  { paginas: false, configuracao: ['anthropic', 'cron'], pagamentosLigados: true }, AGORA);
  assert.deepEqual(ativos(a), ['alertas_urgentes', 'configuracao', 'ia_conta', 'ia_falhando', 'pagamentos', 'paginas', 'rotina_diaria']);
  assert.equal(a.paginas, ITENS.paginas.quebrou);
  assert.match(a.configuracao, /chave da IA, segredo das rotinas\.$/);
  assert.match(a.alertas_urgentes, /^Há 2 alertas urgentes no painel/);
  for (const t of Object.values(a)) assert.ok(!/@|BZ-|\+55/.test(t), t);
});

test('achados: a Anthropic recusar a chave (conferência do Worker) vale como a IA ter recusado a conta, mesmo sem conversa falhando', () => {
  assert.equal(achadosDe(LEITURA_OK, { ...CONF_OK, chaveIaRecusada: true }, AGORA).ia_conta, ITENS.ia_conta.quebrou);
  assert.equal(achadosDe(LEITURA_OK, { ...CONF_OK, chaveIaRecusada: false }, AGORA).ia_conta, null);
  assert.equal(achadosDe(LEITURA_OK, CONF_OK, AGORA).ia_conta, null, 'sem a conferência (servidor local) não alarma');
});

test('achados: os prazos das rotinas contam a partir da estreia do vigia (sem alarme falso no 1º dia)', () => {
  const recemLigado = { ...LEITURA_OK, estreia_em: iso(AGORA - 2 * H), ultima_reconciliacao_em: null, ultima_diaria_em: null };
  assert.deepEqual(ativos(achadosDe(recemLigado, CONF_OK, AGORA)), []);
  assert.deepEqual(ativos(achadosDe({ ...recemLigado, estreia_em: null }, CONF_OK, AGORA)), [], 'a 1ª ronda (sem estreia) também não');
  assert.deepEqual(ativos(achadosDe({ ...recemLigado, estreia_em: iso(AGORA - 30 * H) }, CONF_OK, AGORA)), ['pagamentos', 'rotina_diaria']);
  assert.deepEqual(ativos(achadosDe({ ...LEITURA_OK, ultima_reconciliacao_em: iso(AGORA - 6.4 * H) }, CONF_OK, AGORA)), [], '6 h 24: uma perdida não alarma');
});

test('achados: pagamentos desligados não alarmam a reconciliação (uma causa, um item: só a configuração)', () => {
  const a = achadosDe({ ...LEITURA_OK, ultima_reconciliacao_em: iso(AGORA - 50 * H) }, { paginas: true, configuracao: ['pagamentos'], pagamentosLigados: false }, AGORA);
  assert.deepEqual(ativos(a), ['configuracao']);
});

test('achados: IA falhando só com 3+ falhas na hora de 2+ conversas; e só volta com uma chamada que deu certo depois', () => {
  const falhas = { ...LEITURA_OK, falhas_ia_hora: 5, conversas_falha_hora: 1, ultima_falha_ia_em: iso(AGORA - 60e3) };
  assert.equal(achadosDe(falhas, CONF_OK, AGORA).ia_falhando, null, 'um visitante sozinho não dispara');
  assert.ok(achadosDe({ ...falhas, conversas_falha_hora: 2 }, CONF_OK, AGORA).ia_falhando);
  const jaAtivo = { ia_falhando: { ativo: true, desde: iso(AGORA - 3 * H), avisado_em: iso(AGORA - 3 * H) } };
  const quieto = { ...LEITURA_OK, estado: jaAtivo, falhas_ia_hora: 0, conversas_falha_hora: 0, ultima_falha_ia_em: iso(AGORA - 2 * H), ultima_ok_ia_em: iso(AGORA - 5 * H) };
  assert.ok(achadosDe(quieto, CONF_OK, AGORA).ia_falhando, 'sem conversa nenhuma depois da falha: continua quebrado');
  assert.equal(achadosDe({ ...quieto, ultima_ok_ia_em: iso(AGORA - H) }, CONF_OK, AGORA).ia_falhando, null, 'uma chamada boa depois: voltou');
});

test('achados: conta da IA recusada fica até uma chamada dar certo depois dela', () => {
  assert.ok(achadosDe({ ...LEITURA_OK, ultima_falha_conta_em: iso(AGORA - 50 * H), ultima_ok_ia_em: iso(AGORA - 60 * H) }, CONF_OK, AGORA).ia_conta);
  assert.equal(achadosDe({ ...LEITURA_OK, ultima_falha_conta_em: iso(AGORA - 50 * H), ultima_ok_ia_em: iso(AGORA - 40 * H) }, CONF_OK, AGORA).ia_conta, null);
  assert.ok(achadosDe({ ...LEITURA_OK, ultima_falha_conta_em: iso(AGORA - H), ultima_ok_ia_em: null }, CONF_OK, AGORA).ia_conta);
});

/* ---- decidir: quando escrever ---- */
const NADA = Object.fromEntries(Object.keys(ITENS).map(k => [k, null]));
const ESTRELADO = { estreia: { ativo: false, desde: iso(AGORA - 100 * H), avisado_em: iso(AGORA - 100 * H) } };

test('decidir: a 1ª ronda manda a estreia (o alerta de teste) e grava o item estreia junto do e-mail', () => {
  const d = decidir({}, NADA, AGORA);
  assert.deepEqual(d.linhas, [ESTREIA]);
  assert.deepEqual(d.itens, [{ item: 'estreia', ativo: false, desde: iso(AGORA), avisado_em: iso(AGORA), detalhe: null, noEmail: true }]);
});

test('decidir: sem novidade, nenhuma linha e nada a gravar', () => {
  assert.deepEqual(decidir(ESTRELADO, NADA, AGORA), { linhas: [], itens: [] });
});

test('decidir: falha nova entra no e-mail; continua por menos de 24 h fica quieta; depois de 24 h lembra', () => {
  const nova = decidir(ESTRELADO, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA);
  assert.deepEqual(nova.linhas, [ITENS.paginas.quebrou]);
  assert.deepEqual(nova.itens, [{ item: 'paginas', ativo: true, desde: iso(AGORA), avisado_em: iso(AGORA), detalhe: ITENS.paginas.quebrou, noEmail: true }]);
  const estado = { ...ESTRELADO, paginas: { ativo: true, desde: iso(AGORA - 5 * H), avisado_em: iso(AGORA - 5 * H), detalhe: ITENS.paginas.quebrou } };
  const quieta = decidir(estado, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA);
  assert.deepEqual(quieta, { linhas: [], itens: [] }, 'nada mudou: não regrava');
  const lembra = decidir({ ...estado, paginas: { ...estado.paginas, avisado_em: iso(AGORA - 24 * H) } }, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA);
  assert.deepEqual(lembra.linhas, [ITENS.paginas.quebrou]);
  assert.equal(lembra.itens[0].desde, iso(AGORA - 5 * H), 'o "desde" é o do começo da falha');
});

test('decidir: o texto mudou enquanto continua quebrado (de 1 para 5 alertas, mais uma configuração faltando) é novidade: avisa já', () => {
  const um = achadosDe({ ...LEITURA_OK, urgentes: 1 }, CONF_OK, AGORA).alertas_urgentes;
  const cinco = achadosDe({ ...LEITURA_OK, urgentes: 5 }, CONF_OK, AGORA).alertas_urgentes;
  const estado = { ...ESTRELADO, alertas_urgentes: { ativo: true, desde: iso(AGORA - 2 * H), avisado_em: iso(AGORA - H), detalhe: um } };
  assert.deepEqual(decidir(estado, { ...NADA, alertas_urgentes: um }, AGORA).linhas, [], 'mesmo texto, avisado há 1 h');
  const d = decidir(estado, { ...NADA, alertas_urgentes: cinco }, AGORA);
  assert.deepEqual(d.linhas, [cinco]);
  assert.equal(d.itens[0].desde, iso(AGORA - 2 * H)); assert.equal(d.itens[0].detalhe, cinco);
});

test('decidir: voltou ao normal depois de avisado → uma linha; a falha que nunca foi avisada volta calada; os alertas do painel voltam calados', () => {
  const estado = { ...ESTRELADO, paginas: { ativo: true, desde: iso(AGORA - 5 * H), avisado_em: iso(AGORA - 5 * H) },
    pagamentos: { ativo: true, desde: iso(AGORA - 2 * H), avisado_em: null },
    alertas_urgentes: { ativo: true, desde: iso(AGORA - 9 * H), avisado_em: iso(AGORA - 9 * H) } };
  const d = decidir(estado, NADA, AGORA);
  assert.deepEqual(d.linhas, [ITENS.paginas.voltou]);
  assert.deepEqual(d.itens.map(i => [i.item, i.ativo, i.desde, i.avisado_em, i.noEmail]).sort(), [
    ['alertas_urgentes', false, null, null, false], ['pagamentos', false, null, null, false], ['paginas', false, null, null, true]]);
  assert.equal(ITENS.alertas_urgentes.voltou, null);
});

test('decidir: falha de novo depois de ter voltado é falha nova (avisa na hora)', () => {
  const estado = { ...ESTRELADO, paginas: { ativo: false, desde: null, avisado_em: null } };
  assert.deepEqual(decidir(estado, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA).linhas, [ITENS.paginas.quebrou]);
});

test('decidir: várias novidades numa ronda viram um e-mail só, urgentes primeiro', () => {
  const d = decidir(ESTRELADO, { ...NADA, rotina_diaria: ITENS.rotina_diaria.quebrou, ia_conta: ITENS.ia_conta.quebrou }, AGORA);
  assert.deepEqual(d.linhas, [ITENS.ia_conta.quebrou, ITENS.rotina_diaria.quebrou]);
});

/* ---- conferir: o que o Worker confere sozinho (sem rede externa) ---- */
import { conferir, PAGINAS } from '../../api/_vigia/conferir.mjs';
import { avisarDonoLinhas } from '../../api/_aviso.mjs';

const ENV_CONF = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_CHAVE_SECRETA: 's'.repeat(40), SUPABASE_CHAVE_PUBLICA: 'p'.repeat(40),
  ANTHROPIC_API_KEY: 'k', CRON_SECRET: 'c'.repeat(40), MP_AMBIENTE: 'teste', MP_ACCESS_TOKEN: 'TEST-' + 'a'.repeat(30) + '-123456', MP_PUBLIC_KEY: 'b'.repeat(30),
  MP_WEBHOOK_SEGREDO: 'w'.repeat(20), MP_USER_ID: '123456' };
const assets = resposta => { const vistos = []; return { vistos, fetch: async req => { vistos.push(new URL(req.url).pathname); return resposta(new URL(req.url).pathname, vistos.length); } }; };
const pagina = () => new Response('<!doctype html><html lang="pt-BR"><body>ok</body></html>', { status: 200 });
const semEspera = async () => {};
const aceita = async () => new Response('{}', { status: 200 });

test('conferir: páginas pelo ASSETS (sem rede), todas com 200 e <html; configuração completa → nada falta', async () => {
  const a = assets(pagina);
  const r = await conferir({ ...ENV_CONF, ASSETS: a }, { esperar: semEspera, buscar: aceita });
  assert.deepEqual(r, { paginas: true, configuracao: [], pagamentosLigados: true, chaveIaRecusada: false });
  assert.deepEqual(a.vistos, PAGINAS);
  assert.deepEqual(PAGINAS, ['/', '/sites', '/automacao', '/orcamento']);
});

test('conferir: página com erro ou sem <html falha (depois da 2ª tentativa); uma falha passageira não', async () => {
  for (const ruim of [() => new Response('x', { status: 500 }), () => new Response('vazio', { status: 200 }), () => { throw new Error('caiu'); }]) {
    const r = await conferir({ ...ENV_CONF, ASSETS: assets((p) => (p === '/sites' ? ruim() : pagina())) }, { esperar: semEspera, buscar: aceita });
    assert.equal(r.paginas, false);
  }
  let vez = 0;
  const passageira = assets(p => (p === '/orcamento' && vez++ === 0 ? new Response('x', { status: 503 }) : pagina()));
  assert.equal((await conferir({ ...ENV_CONF, ASSETS: passageira }, { esperar: semEspera, buscar: aceita })).paginas, true);
  assert.deepEqual(passageira.vistos.filter(p => p === '/orcamento').length, 2);
});

test('conferir: sem ASSETS (servidor local, testes) as páginas não são conferidas; cada configuração que falta aparece pelo nome', async () => {
  assert.equal((await conferir(ENV_CONF, { esperar: semEspera })).paginas, true);
  const falta = async tirar => (await conferir(Object.fromEntries(Object.entries(ENV_CONF).filter(([k]) => !tirar.includes(k))), { esperar: semEspera }));
  assert.deepEqual((await falta(['SUPABASE_URL'])).configuracao, ['supabase']);
  assert.deepEqual((await falta(['ANTHROPIC_API_KEY'])).configuracao, ['anthropic']);
  assert.deepEqual((await conferir({ ...ENV_CONF, CRON_SECRET: 'curto' }, { esperar: semEspera })).configuracao, ['cron']);
  const semMp = await falta(['MP_ACCESS_TOKEN']);
  assert.deepEqual(semMp.configuracao, ['pagamentos']); assert.equal(semMp.pagamentosLigados, false);
  assert.deepEqual((await conferir({}, { esperar: semEspera })).configuracao, ['supabase', 'anthropic', 'cron', 'pagamentos']);
});

test('conferir: no Worker, a chave da IA é provada com a chamada gratuita de listar modelos; só 401 conta como recusada', async () => {
  const chamadas = [];
  const buscar = status => async (url, opcoes) => { chamadas.push({ url, ...opcoes }); return new Response('{}', { status }); };
  const com = status => conferir({ ...ENV_CONF, ASSETS: assets(pagina) }, { esperar: semEspera, buscar: buscar(status) });
  assert.equal((await com(401)).chaveIaRecusada, true);
  assert.equal(chamadas[0].url, 'https://api.anthropic.com/v1/models?limit=1');
  assert.equal(chamadas[0].headers['x-api-key'], 'k');
  assert.equal(chamadas[0].headers['anthropic-version'], '2023-06-01');
  assert.ok(!chamadas[0].method || chamadas[0].method === 'GET');
  for (const status of [200, 403, 429, 500, 529]) assert.equal((await com(status)).chaveIaRecusada, false, 'status ' + status + ' não prova chave ruim');
  const caiu = await conferir({ ...ENV_CONF, ASSETS: assets(pagina) }, { esperar: semEspera, buscar: async () => { throw new Error('rede'); } });
  assert.equal(caiu.chaveIaRecusada, false, 'sem resposta da Anthropic não há prova');
});

test('conferir: sem chave configurada ou sem ASSETS (servidor local, testes) não chama a Anthropic', async () => {
  let n = 0;
  const buscar = async () => { n++; return new Response('{}', { status: 401 }); };
  assert.equal((await conferir({ ...ENV_CONF, ASSETS: assets(pagina), ANTHROPIC_API_KEY: '' }, { esperar: semEspera, buscar })).chaveIaRecusada, false);
  assert.equal((await conferir(ENV_CONF, { esperar: semEspera, buscar })).chaveIaRecusada, false);
  assert.equal(n, 0);
});

/* ---- o e-mail de várias linhas (mesmo canal e mesmo modelo dos outros avisos) ---- */
class EmailFalso { constructor(de, para, bruto) { Object.assign(this, { de, para, bruto }); } }
const corpoDe = bruto => Buffer.from(bruto.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
const assuntoDe = bruto => Buffer.from(/Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(bruto)[1], 'base64').toString('utf8');

test('aviso em linhas: um e-mail com as linhas na ordem e o link do painel; assunto curto da 1ª linha', async () => {
  const enviados = [];
  const env = { AVISO_EMAIL: { send: async m => { enviados.push(m); } }, AVISO_PARA: 'dono@exemplo.com' };
  assert.equal(await avisarDonoLinhas(env, [ITENS.ia_conta.quebrou, ITENS.paginas.voltou], { EmailMessage: EmailFalso }), true);
  assert.equal(enviados.length, 1);
  const corpo = corpoDe(enviados[0].bruto);
  assert.ok(corpo.startsWith(ITENS.ia_conta.quebrou + '\n' + ITENS.paginas.voltou + '\n\nAbra o painel: https://beyonzero.com.br/painel'), corpo);
  assert.ok(assuntoDe(enviados[0].bruto).length <= 36);
});

test('aviso em linhas: sem linhas, sem canal, endereço estranho ou envio que falha → false, sem lançar e sem fetch', async () => {
  const salvo = globalThis.fetch; let rede = 0;
  globalThis.fetch = async () => { rede++; return new Response('x'); };
  try {
    const canal = { send: async () => { throw new Error('caiu'); } };
    assert.equal(await avisarDonoLinhas({ AVISO_EMAIL: { send: async () => {} }, AVISO_PARA: 'a@b.com' }, [], { EmailMessage: EmailFalso }), false);
    assert.equal(await avisarDonoLinhas({}, ['x'], { EmailMessage: EmailFalso }), false);
    assert.equal(await avisarDonoLinhas({ AVISO_EMAIL: { send: async () => {} }, AVISO_PARA: 'a@b.com, c@d.com' }, ['x'], { EmailMessage: EmailFalso }), false);
    assert.equal(await avisarDonoLinhas({ AVISO_EMAIL: canal, AVISO_PARA: 'a@b.com' }, ['x'], { EmailMessage: EmailFalso }), false);
    assert.equal(rede, 0);
  } finally { globalThis.fetch = salvo; }
});

/* ---- banco fora: sem memória, regra fixa ---- */
test('banco fora: só nas rondas das 01, 07, 13 e 19 UTC e nunca duas vezes em 24 h no mesmo isolado', () => {
  const memoria = new Map();
  const as = h => Date.UTC(2026, 10, 15, h, 23);
  assert.deepEqual(decidirSemBanco(as(2), memoria, ['x']), []);
  assert.deepEqual(decidirSemBanco(as(13), memoria, ['x']), [BANCO_FORA, 'x']);
  assert.deepEqual(decidirSemBanco(as(19), memoria, ['x']), [BANCO_FORA, 'x'], 'o e-mail não saiu (não lembrou): tenta de novo no horário');
  lembrarSemBanco(memoria, as(13));
  assert.deepEqual(decidirSemBanco(as(19), memoria, ['x']), [], 'mesmo isolado, menos de 24 h');
  assert.deepEqual(decidirSemBanco(as(13) + 24 * H, memoria, []), [BANCO_FORA]);
  assert.deepEqual(decidirSemBanco(as(7), new Map(), []), [BANCO_FORA], 'isolado novo: sem memória, vale o horário');
});

/* ---- rondar: ponta a ponta com o banco local (PGlite, migrations reais) e um canal falso ---- */
import { rondar } from '../../api/_vigia/rondar.mjs';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg, ORG } from './_entrega.mjs';
import { ErroBanco } from '../../api/_vendas/transporte.mjs';

const CONF_FALSA = r => async () => ({ paginas: true, configuracao: [], pagamentosLigados: true, ...r });
async function cenario() {
  const db = await novoBanco();
  await prepararOrg(db);
  const enviados = [];
  let canalOk = true;
  const avisar = async linhas => { if (!canalOk) return false; enviados.push(linhas); return true; };
  const ronda = (agora, conf = {}) => rondar({}, { banco: rpcDe(db), avisar, agora, conferir: CONF_FALSA(conf), esperar: semEspera, memoria: new Map() });
  return { db, enviados, ronda, quebrarCanal: v => { canalOk = !v; } };
}

test('ronda: a 1ª manda a estreia e grava; a 2ª, sem novidade, não manda nada', async () => {
  const c = await cenario();
  const r1 = await c.ronda(AGORA);
  assert.deepEqual(r1.linhas, [ESTREIA]); assert.equal(r1.enviado, true);
  const r2 = await c.ronda(AGORA + H);
  assert.deepEqual(r2.linhas, []);
  assert.equal(c.enviados.length, 1);
  assert.deepEqual((await c.db.query('select item from app.vigia')).rows.map(x => x.item), ['estreia']);
});

test('ronda: e-mail que não saiu não marca nada como avisado; a ronda seguinte repete', async () => {
  const c = await cenario();
  c.quebrarCanal(true);
  assert.equal((await c.ronda(AGORA, { paginas: false })).enviado, false);
  assert.equal((await c.db.query('select count(*)::int as n from app.vigia')).rows[0].n, 0);
  c.quebrarCanal(false);
  assert.deepEqual((await c.ronda(AGORA + H, { paginas: false })).linhas, [ESTREIA, ITENS.paginas.quebrou]);
  assert.deepEqual((await c.ronda(AGORA + 2 * H, { paginas: false })).linhas, [], 'já avisado há 1 h');
  assert.deepEqual((await c.ronda(AGORA + 3 * H)).linhas, [ITENS.paginas.voltou]);
});

test('ronda: a falha real da IA nas conversas vira aviso (sem chamar modelo nenhum)', async () => {
  const c = await cenario();
  await c.ronda(Date.now());
  await c.db.query("insert into app.ia_chamadas (org_id, conversa_id, papel, erro, created_at) values ($1, '11111111-0000-4000-8000-000000000001', 'conversa', 'indisponivel', now())", [ORG]);
  assert.deepEqual((await c.ronda(Date.now() + 60e3)).linhas, [ITENS.ia_conta.quebrou]);
});

test('ronda: banco fora → regra fixa (só no horário, uma vez por isolado), com as conferências do Worker juntas', async () => {
  const fora = async () => { throw new ErroBanco('08006', 'banco indisponível'); };
  const enviados = [], memoria = new Map();
  const ronda = (h, conf = {}) => rondar({}, { banco: fora, avisar: async l => { enviados.push(l); return true; }, agora: Date.UTC(2026, 10, 15, h, 23), conferir: CONF_FALSA(conf), esperar: semEspera, memoria });
  assert.deepEqual((await ronda(2)).linhas, []);
  const r = await ronda(7, { paginas: false });
  assert.equal(r.semBanco, true); assert.deepEqual(r.linhas, [BANCO_FORA, ITENS.paginas.quebrou]);
  assert.deepEqual((await ronda(13)).linhas, []);
  assert.equal(enviados.length, 1);
});

/* (revisões do PR #168) sem memória o vigia NÃO fica calado: a migration ausente e o banco não configurado avisam pela mesma
   regra fixa de horário do banco fora, com a linha do caso (a migration ausente não é "banco fora") e o que o Worker viu sozinho */
const semMemoria = (banco, h) => {
  const enviados = [];
  return rondar({}, { banco, avisar: async l => { enviados.push(l); return true; }, agora: Date.UTC(2026, 10, 15, h, 23), conferir: CONF_FALSA({ paginas: false }), esperar: semEspera, memoria: new Map() })
    .then(r => ({ ...r, enviados }));
};

test('ronda: a migration do vigia ainda não aplicada avisa que ela falta (não diz "banco fora"), só no horário', async () => {
  const semFuncao = async () => { throw new ErroBanco('PGRST202', 'rpc rotinas_vigia_ler: HTTP 404'); };
  assert.deepEqual((await semMemoria(semFuncao, 2)).enviados, []);
  const r = await semMemoria(semFuncao, 7);
  assert.deepEqual(r.linhas, [SEM_MEMORIA, ITENS.paginas.quebrou]);
  assert.ok(!r.linhas.includes(BANCO_FORA));
});

test('ronda: sem banco configurado não lança e avisa no horário (o staging não tem canal de e-mail: lá nada sai)', async () => {
  assert.deepEqual((await semMemoria(null, 2)).enviados, []);
  assert.deepEqual((await semMemoria(null, 13)).linhas, [BANCO_FORA, ITENS.paginas.quebrou]);
});

test('ronda: o e-mail saiu e a gravação falhou uma vez → a 2ª tentativa grava (a ronda seguinte não repete o aviso)', async () => {
  const c = await cenario();
  const real = rpcDe(c.db);
  let falhas = 1;
  const oscila = async (nome, p) => { if (nome === 'rotinas_vigia_gravar' && falhas-- > 0) throw new ErroBanco('HTTP503', 'rpc: HTTP 503'); return real(nome, p); };
  const enviados = [];
  const ronda = agora => rondar({}, { banco: oscila, avisar: async l => { enviados.push(l); return true; }, agora, conferir: CONF_FALSA({}), esperar: semEspera, memoria: new Map() });
  assert.deepEqual((await ronda(AGORA)).linhas, [ESTREIA]);
  assert.deepEqual((await ronda(AGORA + H)).linhas, [], 'gravou na 2ª tentativa');
  assert.equal(enviados.length, 1);
});

test('aviso em linhas: linha com \\r também é recusada (nada de quebra no corpo)', async () => {
  const env = { AVISO_EMAIL: { send: async () => {} }, AVISO_PARA: 'a@b.com' };
  assert.equal(await avisarDonoLinhas(env, ['ok\rcabeçalho: x'], { EmailMessage: EmailFalso }), false);
});
