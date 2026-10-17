/* O LINK DE RETOMADA e o LEMBRETE pela API (PR 2b-2): o painel pede o código; o cliente, em outro aparelho, troca o
   código por uma sessão nova da MESMA conversa (uso único, anti-robô e freio como a criação de sessão); o aparelho
   antigo perde o acesso; o lembrete aparece 2 dias depois do aviso e sai com o "Já lembrei". */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { ler, mudar } from '../../api/painel.mjs';
import { novoCodigoRetomada, hashDaRetomada, CODIGO_RETOMADA } from '../../api/_vendas/retomada.mjs';
import { LIMITES_DE_TESTE, telefoneDeTeste } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
const CHAVE = 'k'.repeat(40);
const ENV = { BZ_LOCAL: '1', PAINEL_CHAVE: CHAVE };
let local, ipSeq = 0;
before(async () => { local = await montarLocal({ base: BASE }); });

function navegador(extra = {}) {
  const ip = '203.0.113.' + (++ipSeq);
  let token = null;
  const deps = { banco: local.rpc, visitantes: local.auth, ia: null, direcoes: 'manual', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, ...extra };
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, usar(t) { token = t; }, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const comChave = (opcoes = {}) => ({ ...opcoes, headers: { authorization: 'Bearer ' + CHAVE, 'x-forwarded-for': '192.0.2.9', ...(opcoes.headers || {}) } });
const painelGet = async q => { const r = await ler(new Request(BASE + '/api/painel' + q, comChave()), ENV); return { status: r.status, corpo: await r.json() }; };
const painelPost = async corpo => { const r = await mudar(new Request(BASE + '/api/painel', comChave({ method: 'POST', body: JSON.stringify(corpo) })), ENV); return { status: r.status, corpo: await r.json() }; };
const RESP = { ramo: 'saude', cidade: 'Niterói', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };

/* até o pedido confirmado e com as três direções prontas (a entrega pelo painel, como o dono faz) */
async function prontoParaAvisar() {
  const n = navegador();
  const c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao })).status, 200);
  assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, negocio: 'Clínica Exemplo', vende: 'Fisioterapia', telefone: telefoneDeTeste(), nome: 'Ana Souza', aceite: true })).status, 200);
  assert.equal((await painelPost({ confirmar_whatsapp: c })).status, 200);
  await local.db.exec("set bz.transicao_livre = 'on'");
  await local.db.query("update app.direcoes set status = 'pronta', conteudo = '{}'::jsonb where conversa_id = $1", [c]);
  await local.db.query("update app.conversas set etapa = 'direcoes' where id = $1", [c]);
  await local.db.exec("reset bz.transicao_livre");
  return { n, c };
}

test('módulo: o código tem 32 caracteres base64url e o hash é SHA-256 em hex; dois códigos nunca se repetem', () => {
  const a = novoCodigoRetomada(), b = novoCodigoRetomada();
  assert.match(a, CODIGO_RETOMADA);
  assert.notEqual(a, b);
  assert.match(hashDaRetomada(a), /^[0-9a-f]{64}$/);
  assert.notEqual(hashDaRetomada(a), hashDaRetomada(b));
});

test('retomar: o painel pede o link; outro aparelho troca o código por uma sessão da MESMA conversa; uso único', async () => {
  const { n, c } = await prontoParaAvisar();
  const link = await painelPost({ link_retomada: c });
  assert.equal(link.status, 200, JSON.stringify(link.corpo));
  assert.match(link.corpo.codigo, CODIGO_RETOMADA);
  assert.ok(link.corpo.expira_em);
  const guardado = (await local.db.query('select codigo_hash from app.retomadas where conversa_id = $1', [c])).rows[0].codigo_hash;
  assert.equal(guardado, hashDaRetomada(link.corpo.codigo), 'no banco, só o hash');
  const outro = navegador();
  const r = await outro.chamar('POST', 'retomar', { codigo: link.corpo.codigo });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(Object.keys(r.corpo).sort(), ['conversa_id', 'expira_em', 'refresh', 'token']);
  assert.equal(r.corpo.conversa_id, c);
  outro.usar(r.corpo.token);
  assert.equal((await outro.chamar('GET', 'estado', undefined, '&conversa=' + c)).status, 200, 'o aparelho novo lê o pedido');
  assert.equal((await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).status, 404, 'o antigo perde o acesso');
  const deNovo = await navegador().chamar('POST', 'retomar', { codigo: link.corpo.codigo });
  assert.equal(deNovo.status, 410);
  assert.equal(deNovo.corpo.whatsapp, true);
});

test('retomar: código fora do formato é 400 sem tocar no banco; desconhecido é 410; o freio de sessão vale', async () => {
  const n = navegador();
  for (const codigo of [undefined, '', 'curto', 'x'.repeat(33), 'a'.repeat(31) + '!', { a: 1 }]) {
    assert.equal((await n.chamar('POST', 'retomar', { codigo })).status, 400, JSON.stringify(codigo));
  }
  assert.equal((await navegador().chamar('POST', 'retomar', { codigo: novoCodigoRetomada() })).status, 410);
  const insistente = navegador();
  const status = [];
  for (let i = 0; i < 10; i++) status.push((await insistente.chamar('POST', 'retomar', { codigo: novoCodigoRetomada() })).status);
  assert.ok(status.includes(429), 'o freioSessao (8 a cada 10 min por IP) segura: ' + status.join(','));
});

test('retomar: com o anti-robô ligado, sem token não troca o código', async () => {
  /* (exigido: true é o que configTurnstile devolve com as duas chaves; o siteverify falso recusa) */
  const n = navegador({ cfgTurnstile: { exigido: true, siteKey: 'x', segredo: 'y' }, buscarTurnstile: async () => new Response(JSON.stringify({ success: false }), { status: 200 }) });
  const r = await n.chamar('POST', 'retomar', { codigo: novoCodigoRetomada() });
  assert.equal(r.status, 403);
});

test('painel: link só para pedido confirmado; id inválido 400; conversa inexistente 404; sem a chave 401', async () => {
  assert.equal((await painelPost({ link_retomada: 'x' })).status, 400);
  assert.equal((await painelPost({ link_retomada: '00000000-0000-4000-8000-000000000000' })).status, 404);
  const n = navegador();
  const c = await n.iniciar();
  assert.equal((await painelPost({ link_retomada: c })).status, 409, 'sem pedido confirmado');
  const semChave = await mudar(new Request(BASE + '/api/painel', { method: 'POST', body: JSON.stringify({ link_retomada: c }), headers: { 'x-forwarded-for': '192.0.2.80' } }), ENV);
  assert.equal(semChave.status, 401);
});

test('painel: o lembrete aparece 2 dias depois do aviso e sai com o "Já lembrei"', async () => {
  const { c } = await prontoParaAvisar();
  assert.equal((await painelPost({ avisado: c })).status, 200);
  assert.ok(!(await painelGet('?fila=lembretes')).corpo.lembretes.some(l => l.conversa_id === c), 'logo depois do aviso, não');
  await local.db.query("update app.direcoes set avisada_em = now() - interval '2 days 1 minute' where conversa_id = $1", [c]);
  const l = await painelGet('?fila=lembretes');
  assert.equal(l.status, 200, JSON.stringify(l.corpo));
  const item = l.corpo.lembretes.find(x => x.conversa_id === c);
  assert.ok(item, 'aparece');
  assert.equal(item.contato.nome, 'Ana Souza');
  assert.equal((await painelPost({ lembrado: 'x' })).status, 400);
  const feito = await painelPost({ lembrado: c });
  assert.deepEqual(feito.corpo, { ok: true, lembrados: 1 });
  assert.ok(!(await painelGet('?fila=lembretes')).corpo.lembretes.some(x => x.conversa_id === c));
});
