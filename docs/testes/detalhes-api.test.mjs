/* Os detalhes pela API (/api/vendas), com o banco real (PGlite) e sem IA: o pedido com código, os freios de verdade
   (IP com segredo, telefone, fila global), o "gerar" do modo manual e os achados do PR 37 (freios separados,
   consulta leve, pacote repetido). Spec: docs/specs/2026-10-11-orcamento-sem-ia.md §0, §3 e §7. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { PEDIDOS } from '../../api/_vendas/pedido.mjs';
import { Recusa } from '../../api/_vendas/recusa.mjs';
import { traduzirErro, Recusa as RecusaDoFluxo } from '../../api/_vendas/fluxo.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarAcoesDoPedido } from '../../api/_vendas/fluxo-pedido.mjs';
import { LIMITES_DE_TESTE, telefoneDeTeste } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
let local, deps, ipSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: null, direcoes: 'manual', segredoFreio: 's'.repeat(32), limitesPedido: { ...LIMITES_DE_TESTE, por_ip_dia: PEDIDOS.por_ip_dia, por_ip48_dia: PEDIDOS.por_ip48_dia } };
});

function navegador(ip = '198.51.100.' + (++ipSeq), extra = {}) {
  let token = null;
  const d = { ...deps, ...extra };
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, d);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const RESP = { ramo: 'saude', cidade: 'Goiânia', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };
const DETALHES = () => ({ negocio: 'Clínica Sol', vende: 'Consultas e exames', telefone: telefoneDeTeste(), aceite: true });
const um = async (sql, params) => (await local.db.query(sql, params)).rows[0];

/* perguntas → preço → "Quero os três modelos" (o pacote gravado) */
async function comPacote(n) {
  const c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  return c;
}

test('detalhes: grava o pedido e devolve só o código e o prazo; o estado traz o pedido e se a fila está cheia', async () => {
  const n = navegador(), c = await comPacote(n);
  const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES(), publico: 'famílias do bairro', redes: { instagram: 'https://instagram.com/clinicasol', linkedin: 'linkedin.com/company/clinica-sol' }, autoriza_redes: true });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(Object.keys(r.corpo).sort(), ['codigo', 'expira_em']);
  assert.match(r.corpo.codigo, /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/);
  const e = await n.chamar('GET', 'estado', undefined, '&conversa=' + c);
  assert.equal(e.corpo.pedido.codigo, r.corpo.codigo);
  assert.equal(e.corpo.pedido.status, 'aguardando');
  assert.equal(e.corpo.fila_cheia, false);
  assert.ok(!('fila_confirmados' in e.corpo), 'o tamanho da fila é interno');
  assert.equal(e.corpo.conversa.tem_contato, true);
  const pd = await um('select redes, telefone_hash from app.pedidos where conversa_id = $1', [c]);
  assert.deepEqual(pd.redes, { instagram: 'clinicasol', linkedin: 'clinica-sol' });
  assert.match(pd.telefone_hash, /^[0-9a-f]{64}$/);
  const b = (await um('select briefing from app.conversas where id = $1', [c])).briefing;
  assert.equal(b.negocio.nome, 'Clínica Sol');
  assert.equal(b.negocio.cidade, 'Goiânia', 'as respostas das perguntas continuam');
  assert.equal(b.publico.descricao, 'famílias do bairro');
});

test('detalhes: antes do pacote é recusado; esquema fechado; redigir; uma vez só', async () => {
  const n = navegador(), c = await n.iniciar();
  assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() })).status, 409, 'antes do "Quero os três modelos"');
  const m = navegador(), d = await comPacote(m);
  const fora = await m.chamar('POST', 'detalhes', { conversa_id: d, ...DETALHES(), valor_total: 1 });
  assert.equal(fora.status, 400);
  assert.match(fora.corpo.erro, /não aceito/);
  const ok = await m.chamar('POST', 'detalhes', { conversa_id: d, ...DETALHES(), vende: 'Consultas, chame no 21 98765-4321' });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.match((await um('select briefing from app.conversas where id = $1', [d])).briefing.negocio.descricao, /\[telefone\]/);
  assert.equal((await m.chamar('POST', 'detalhes', { conversa_id: d, ...DETALHES() })).status, 409, 'a 2ª vez');
});

test('freio por telefone: o mesmo WhatsApp com outra escrita, em outra conversa, é recusado com o WhatsApp à mão', async () => {
  const n = navegador(), a = await comPacote(n);
  assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: a, ...DETALHES(), telefone: '(21) 98888-1234' })).status, 200);
  const m = navegador(), b = await comPacote(m);
  const r = await m.chamar('POST', 'detalhes', { conversa_id: b, ...DETALHES(), telefone: '+55 21 98888 1234' });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.recado, true);
  assert.match(r.corpo.erro, /WhatsApp/);
});

/* (revisão final do PR 2a, M2) a mesma conversa reenviando os detalhes trocando o telefone (para descobrir se um número já
   pediu) para na 4ª tentativa, com o WhatsApp à mão e sem dizer nada do número */
test('detalhes: a 4ª tentativa na mesma conversa leva 429 com o WhatsApp, mesmo com um número novo', async () => {
  const fone = telefoneDeTeste();
  const a = navegador(), ca = await comPacote(a);
  assert.equal((await a.chamar('POST', 'detalhes', { conversa_id: ca, ...DETALHES(), telefone: fone })).status, 200);
  const n = navegador(), c = await comPacote(n);
  for (let i = 1; i <= 3; i++) assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES(), telefone: fone })).status, 409, 'tentativa ' + i);
  const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
  assert.equal(r.status, 429, JSON.stringify(r.corpo));
  assert.equal(r.corpo.recado, true);
  assert.doesNotMatch(r.corpo.erro, /aberto|limite de pedidos de hoje/, 'não fala do número');
});

test('freio por IP: o 4º pedido do mesmo endereço no dia leva 429 (com segredo; IPv6 conta pelo /64)', async () => {
  for (let i = 1; i <= 3; i++) {
    const n = navegador('2001:db8:aa:bb::' + i), c = await comPacote(n);
    assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() })).status, 200, 'pedido ' + i);
  }
  const n = navegador('2001:db8:aa:bb::99'), c = await comPacote(n);
  const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
  assert.equal(r.status, 429, JSON.stringify(r.corpo));
  assert.equal(r.corpo.recado, true);
});

test('fila global cheia: a tela sabe antes (estado) e os detalhes recebem 503 com o WhatsApp', async () => {
  const n = navegador(undefined, { limitesPedido: { ...LIMITES_DE_TESTE, fila_confirmados: 0 } }), c = await comPacote(n);
  assert.equal((await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo.fila_cheia, true);
  const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
  assert.equal(r.status, 503);
  assert.equal(r.corpo.fila_cheia, true);
  assert.equal(r.corpo.recado, true);
});

test('produção sem o segredo do freio: os detalhes fecham com 503 e o WhatsApp (nada gravado)', async () => {
  /* a produção vem pelo env do pedido (o código não lê mais process.env: api/_ambiente.mjs) */
  const PRODUCAO = { VERCEL_ENV: 'production' };
  {
    const n = navegador(undefined, { segredoFreio: undefined, env: PRODUCAO }), c = await comPacote(n);
    const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
    assert.equal(r.status, 503, JSON.stringify(r.corpo));
    assert.equal(r.corpo.recado, true);
    assert.equal(await um('select 1 from app.pedidos where conversa_id = $1', [c]), undefined);
  }
});

/* (revisão final do PR 2a, M3a) sem uma chave de IP (cabeçalho ausente ou que não é IP) o freio do IP sumiria em silêncio:
   em produção os detalhes fecham, como sem o segredo do telefone; no servidor local, seguem sem o freio do IP */
test('produção com o segredo, mas sem IP que dê chave: os detalhes fecham com 503 e o WhatsApp (nada gravado); no local, seguem', async () => {
  const PRODUCAO = { VERCEL_ENV: 'production' };
  {
    const n = navegador('desconhecido', { env: PRODUCAO }), c = await comPacote(n);
    const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
    assert.equal(r.status, 503, JSON.stringify(r.corpo));
    assert.equal(r.corpo.recado, true);
    assert.equal(await um('select 1 from app.pedidos where conversa_id = $1', [c]), undefined);
    assert.deepEqual(await um('select etapa, tentativas_detalhes from app.conversas where id = $1', [c]), { etapa: 'estimativa', tentativas_detalhes: 0 }, 'nem a tentativa foi ao banco');
  }
  const m = navegador('desconhecido'), d = await comPacote(m);
  assert.equal((await m.chamar('POST', 'detalhes', { conversa_id: d, ...DETALHES() })).status, 200, 'fora da Vercel: pula o freio do IP');
});

/* (A6 da migração para a Cloudflare) sem o ambiente do pedido, as travas fecham: com o segredo presente mas sem cabeçalho de IP,
   o detalhes recusa (503 + WhatsApp) e o banco nem é chamado. Prova a sabotagem "detalhes sem ambiente abrem a trava do IP" */
test('criarAcoesDoPedido SEM env, com o segredo e sem cabeçalho de IP: detalhes lança Recusa 503 e o banco não é chamado', async () => {
  let chamadas = 0;
  const banco = async () => { chamadas++; return {}; };
  const acoes = criarAcoesDoPedido({ banco, visitante: async () => '11111111-1111-4111-8111-111111111111', segredoFreio: 's'.repeat(32) });
  const request = new Request(BASE + '/api/vendas?acao=detalhes', { method: 'POST' });   /* (nenhum x-forwarded-for: ipDe devolve "local") */
  await assert.rejects(acoes.detalhes({ request, corpo: { conversa_id: '22222222-2222-4222-8222-222222222222', ...DETALHES() } }),
    e => e instanceof Recusa && e.status === 503 && e.extra?.recado === true);
  assert.equal(chamadas, 0, 'o banco não foi chamado');
});

/* (revisão final do PR 2a, M3c) o IPv6 de uma casa ou empresa costuma ser um /48 inteiro: trocar de /64 não escapa */
test('freio por IP (IPv6): o 11º pedido do mesmo /48 no dia leva 429, mesmo vindo de /64 diferentes', async () => {
  for (let i = 1; i <= PEDIDOS.por_ip48_dia; i++) {
    const n = navegador('2001:db8:48:' + i.toString(16) + '::1'), c = await comPacote(n);
    assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() })).status, 200, 'pedido ' + i);
  }
  const n = navegador('2001:db8:48:ff::1'), c = await comPacote(n);
  const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
  assert.equal(r.status, 429, JSON.stringify(r.corpo));
  assert.equal(r.corpo.recado, true);
  const o = navegador('2001:db8:49::1'), co = await comPacote(o);
  assert.equal((await o.chamar('POST', 'detalhes', { conversa_id: co, ...DETALHES() })).status, 200, 'outro /48: livre');
});

test('modo manual: nada é gerado antes da confirmação; depois dela, uma geração só por conversa', async () => {
  const n = navegador(), c = await comPacote(n);
  await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
  assert.equal((await n.chamar('POST', 'gerar', { conversa_id: c })).status, 409, 'aguardando a confirmação');
  assert.equal((await local.rpc('vendas_confirmar_whatsapp', { org_slug: 'beyon-zero', conversa_id: c })).ok, true);
  const e = await n.chamar('GET', 'estado', undefined, '&conversa=' + c);
  assert.equal(e.corpo.direcoes.length, 3);
  assert.equal(e.corpo.pedido.status, 'confirmado');
  /* as três falham: o modo manual não abre uma 2ª geração pela tela */
  for (const d of e.corpo.direcoes) await local.rpc('vendas_concluir_direcao', { direcao_id: d.id, erro: 'teste' });
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  assert.equal(g.status, 409, 'a 2ª geração no modo manual: ' + JSON.stringify(g.corpo));
});

test('PR37-S3: "Quero" repetido com o mesmo pacote não grava outra estimativa; pacote diferente grava', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  for (let i = 0; i < 3; i++) assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao })).status, 200);
  const conta = async () => (await um('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).n;
  assert.equal(await conta(), 1);
  assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, extras: { imagens: 1 }, versao: s.corpo.versao })).status, 200);
  assert.equal(await conta(), 2);
});

test('PR37-T4/S2: freios separados (muitas contas não travam o "Quero"); catálogo com freio; consulta leve recusa depois do contato', async () => {
  const n = navegador(), c = await n.iniciar();
  const primeira = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  let ultima;
  for (let i = 0; i < 60; i++) ultima = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  assert.equal(ultima.status, 429, 'a 61ª conta na hora');
  assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: primeira.corpo.versao })).status, 200, 'o "Quero" tem o seu próprio freio');
  const m = navegador(), d = await m.iniciar();
  let cat;
  for (let i = 0; i < 61; i++) cat = await m.chamar('GET', 'catalogo', undefined, '&conversa=' + d + '&formato=institucional&ramo=saude');
  assert.equal(cat.status, 429, 'o catálogo também tem freio');
  const k = navegador(), e = await comPacote(k);
  assert.equal((await k.chamar('POST', 'detalhes', { conversa_id: e, ...DETALHES() })).status, 200);
  assert.equal((await k.chamar('POST', 'simular', { conversa_id: e, respostas: RESP })).status, 409);
  assert.equal((await k.chamar('GET', 'catalogo', undefined, '&conversa=' + e + '&formato=institucional&ramo=saude')).status, 409);
});

test('PR37-T4: catálogo, preço e "Quero" usam a consulta leve; o vendas_estado (pesado) não é chamado; a tabela é lida uma vez (cache)', async () => {
  const chamadas = [];
  const espiao = (nome, p) => { chamadas.push(nome); return local.rpc(nome, p); };
  const n = navegador(undefined, { banco: espiao }), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  await n.chamar('GET', 'catalogo', undefined, '&conversa=' + c + '&formato=institucional&ramo=saude');
  assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao })).status, 200);
  assert.ok(!chamadas.includes('vendas_estado'), 'chamadas: ' + chamadas.join(', '));
  assert.equal(chamadas.filter(x => x === 'vendas_conversa_dono').length, 3);
  assert.equal(chamadas.filter(x => x === 'vendas_regras_ativas').length, 1, 'simular, catálogo e "Quero" dividem a leitura da tabela');
});

test('a mensagem (conversa com a IA) lê a tabela do banco a cada vez, sem o cache', async () => {
  const chamadas = [];
  const espiao = (nome, p) => { chamadas.push(nome); return local.rpc(nome, p); };
  const n = navegador(undefined, { banco: espiao, ia: criarSimulada() }), c = await n.iniciar();
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Tenho uma clínica e quero um site institucional' });
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Pode ser com agendamento' });
  assert.equal(chamadas.filter(x => x === 'vendas_regras_ativas').length, 2);
});

/* a Recusa é UMA classe só (api/_vendas/recusa.mjs): se o fluxo tivesse a sua cópia, toda Recusa do pedido
   não seria reconhecida por traduzirErro e viraria 500 */
test('Recusa compartilhada: traduzirErro reconhece a do pedido e o fluxo não tem classe própria', () => {
  const r = new Recusa(409, 'x', { recado: true });
  assert.equal(traduzirErro(r), r);
  assert.equal(RecusaDoFluxo, Recusa);
  const fonte = fs.readFileSync(new URL('../../api/_vendas/fluxo.mjs', import.meta.url), 'utf8');
  assert.ok(!/class\s+Recusa\b/.test(fonte), 'fluxo.mjs não pode declarar outra Recusa');
});

/* O "Quero" com o cache de até 30 s: a tabela trocada há pouco não pode voltar um 409 com a versao_nova VELHA.
   Num banco só deste teste (a troca da tabela ativa não vale para os outros) e com a leitura guardada de propósito */
test('"Quero" com a tabela trocada há pouco: lê de novo sem o cache antes do 409 (nunca versao_nova velha)', async () => {
  const outro = await montarLocal({ base: BASE });
  try {
    const banco = Object.assign((nome, p) => outro.rpc(nome, p), { chaveCache: 'teste-tabela-trocada' });
    const n = navegador(undefined, { banco, visitantes: outro.auth });
    const c = await n.iniciar();
    const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });   /* a tabela velha fica no cache */
    const velha = s.corpo.versao;
    await outro.db.query(`update app.regras_comerciais set status = 'arquivada' where status = 'ativa'`);
    await outro.db.query(`insert into app.regras_comerciais (org_id, versao, status, regras, fontes, aprovada_em)
      select org_id, 2, 'ativa', regras, 'teste', now() from app.regras_comerciais where versao = 1`);
    const nova = (await outro.db.query(`select id from app.regras_comerciais where status = 'ativa'`)).rows[0].id;
    assert.notEqual(nova, velha);
    /* 1) a pessoa já viu a tabela nova (outra instância): o "Quero" passa, com o preço da nova */
    const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: nova });
    assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
    assert.equal((await outro.db.query('select regras_id from app.estimativas where conversa_id = $1', [c])).rows[0].regras_id, nova);
    /* 2) a pessoa tem uma versão que nunca existiu e o cache está velho: 409 com a versão REAL de agora */
    await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });   /* (guarda a leitura da nova) */
    await outro.db.query(`update app.regras_comerciais set status = 'arquivada' where status = 'ativa'`);
    await outro.db.query(`insert into app.regras_comerciais (org_id, versao, status, regras, fontes, aprovada_em)
      select org_id, 3, 'ativa', regras, 'teste', now() from app.regras_comerciais where versao = 1`);
    const mais = (await outro.db.query(`select id from app.regras_comerciais where status = 'ativa'`)).rows[0].id;
    const velho = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, extras: { imagens: 1 }, versao: velha });
    assert.equal(velho.status, 409, JSON.stringify(velho.corpo));
    assert.equal(velho.corpo.versao_nova, mais, 'a versão de agora, e não a que estava guardada (' + nova + ')');
  } finally { globalThis.__BZ_LOCAL = local; }
});

test('a ação "contato" saiu e gerar exige o pedido confirmado, nos dois modos (nenhum caminho cria direções sem os freios)', async () => {
  const { criarSimulada } = await import('../../api/_ia/simulado.mjs');
  for (const extra of [{}, { direcoes: 'api', ia: criarSimulada() }]) {
    const n = navegador(undefined, extra), c = await comPacote(n);
    assert.equal((await n.chamar('POST', 'contato', { conversa_id: c, nome: 'Ana', telefone: '(21) 99999-0000', aceite: true })).status, 404, 'contato: ação inválida');
    /* o caminho antigo, direto no banco (lead sem pedido): a API não gera */
    const vid = (await um('select visitante_id from app.conversas where id = $1', [c])).visitante_id;
    await local.rpc('vendas_informar_contato', { conversa_id: c, visitante_id: vid, nome: 'Ana', telefone: '+5521999990000', aceite: true });
    const g = await n.chamar('POST', 'gerar', { conversa_id: c });
    assert.equal(g.status, 409, (extra.direcoes || 'manual') + ': ' + JSON.stringify(g.corpo));
    assert.match(g.corpo.erro, /confirmado/);
    assert.equal(Number((await um('select count(*) n from app.direcoes where conversa_id = $1', [c])).n), 0);
  }
  /* com a IA ligada: detalhes sem confirmação também não gera (D2) */
  const n = navegador(undefined, { direcoes: 'api', ia: criarSimulada() }), c = await comPacote(n);
  assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() })).status, 200);
  assert.equal((await n.chamar('POST', 'gerar', { conversa_id: c })).status, 409);
});

/* PR 2b-1, PR2a-22P02: parâmetro malformado que chega ao banco é 400, não 500 */
test('traduzirErro: 22P02 (texto que não converte) vira 400 "Dados inválidos."', async () => {
  const { traduzirErro } = await import('../../api/_vendas/fluxo.mjs');
  const { ErroBanco } = await import('../../api/_vendas/transporte.mjs');
  const r = traduzirErro(new ErroBanco('22P02', 'invalid input syntax for type uuid'));
  assert.equal(r?.status, 400);
  assert.equal(r?.message, 'Dados inválidos.');
});

/* revisão final: o 22P02 virou 400 neste PR e, com isso, saiu do log (só 500 ou erro sem tradução logava). Um uuid malformado
   que chega ao banco é sinal de bug ou de sondagem, e a equipe precisa ver. O log leva o código e a ação, nunca a mensagem
   do banco (ela cita o valor que o visitante mandou) */
test('22P02 do banco: a resposta é 400 e o log tem o aviso, sem a mensagem do erro (ela cita o valor do visitante)', async () => {
  const { ErroBanco } = await import('../../api/_vendas/transporte.mjs');
  let quebrar = false;
  const banco = async (nome, params) => {
    if (quebrar) throw new ErroBanco('22P02', 'invalid input syntax for type uuid: "valor-do-visitante-123"');
    return local.rpc(nome, params);
  };
  const n = navegador(undefined, { banco }), c = await n.iniciar();
  const logs = [], original = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    quebrar = true;
    const r = await n.chamar('GET', 'estado', undefined, '&conversa=' + c);
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(r.corpo.erro, 'Dados inválidos.');
  } finally { console.error = original; }
  const aviso = logs.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(l => l && l.evento === 'parâmetro malformado no banco (22P02)');
  assert.ok(aviso, 'o log tem o aviso: ' + logs.join(' | '));
  assert.equal(aviso.origem, 'vendas');
  assert.equal(aviso.nivel, 'aviso');
  assert.equal(aviso.codigo, '22P02');
  assert.equal(aviso.acao, 'estado');
  assert.match(aviso.request_id, /\S/);
  assert.ok(!logs.join('\n').includes('valor-do-visitante-123'), 'a mensagem do banco não vai para o log: ' + logs.join(' | '));
});

/* PR2a-motivo-log: motivo que o servidor não conhece vira 409, mas com log (antes sumia) */
test('detalhes: motivo desconhecido do banco vira o 409 de "só uma vez" com log do motivo', async () => {
  const { recusaDoMotivo } = await import('../../api/_vendas/fluxo-pedido.mjs');
  const logs = [], original = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const r = recusaDoMotivo({ ok: false, motivo: 'motivo_novo' });
    assert.equal(r.status, 409);
    assert.ok(logs.some(l => l.includes('motivo_novo')), 'o motivo aparece no log: ' + logs.join(' | '));
    logs.length = 0;
    assert.equal(recusaDoMotivo({ ok: false, motivo: 'fila_cheia' }).status, 503);
    assert.equal(logs.length, 0, 'motivo conhecido não loga');
  } finally { console.error = original; }
});

/* PR2b1-motivo-request: o log do motivo desconhecido leva o request_id (filtra-se o caso no painel da Vercel) */
test('detalhes: o log do motivo desconhecido leva o request_id do pedido', async () => {
  const { recusaDoMotivo, criarAcoesDoPedido } = await import('../../api/_vendas/fluxo-pedido.mjs');
  const logs = [], original = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    recusaDoMotivo({ ok: false, motivo: 'motivo_novo' }, 'req-123');
    assert.equal(JSON.parse(logs[0]).request_id, 'req-123');
    logs.length = 0;
    recusaDoMotivo({ ok: false, motivo: 'motivo_novo' });
    assert.equal(JSON.parse(logs[0]).request_id, null, 'sem o pedido, null (o campo existe para filtrar)');
    logs.length = 0;
    const acoes = criarAcoesDoPedido({ banco: async () => ({ ok: false, motivo: 'motivo_de_amanha' }), visitante: async () => '11111111-1111-4111-8111-111111111111',
      segredoFreio: 's'.repeat(32), requestId: 'req-do-pedido' });
    const pedido = new Request('http://127.0.0.1:8899/api/vendas?acao=detalhes', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.250' } });
    await assert.rejects(acoes.detalhes({ request: pedido, corpo: { conversa_id: '22222222-2222-4222-8222-222222222222', negocio: 'Clínica Sol', vende: 'Consultas', telefone: '(21) 98765-0000', aceite: true } }),
      e => e.status === 409);
    assert.equal(JSON.parse(logs.find(l => l.includes('motivo_de_amanha'))).request_id, 'req-do-pedido');
  } finally { console.error = original; }
});
