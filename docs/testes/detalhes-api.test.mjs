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
import { LIMITES_DE_TESTE } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
let local, deps, ipSeq = 0, telSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: null, direcoes: 'manual', segredoFreio: 's'.repeat(32), limitesPedido: { ...LIMITES_DE_TESTE, por_ip_dia: PEDIDOS.por_ip_dia } };
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
const telefone = () => '(21) 9' + String(7000 + (++telSeq)) + '-' + String(1000 + telSeq);
const DETALHES = () => ({ negocio: 'Clínica Sol', vende: 'Consultas e exames', telefone: telefone(), aceite: true });
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
  assert.equal(r.corpo.whatsapp, true);
  assert.match(r.corpo.erro, /WhatsApp/);
});

test('freio por IP: o 4º pedido do mesmo endereço no dia leva 429 (com segredo; IPv6 conta pelo /64)', async () => {
  for (let i = 1; i <= 3; i++) {
    const n = navegador('2001:db8:aa:bb::' + i), c = await comPacote(n);
    assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() })).status, 200, 'pedido ' + i);
  }
  const n = navegador('2001:db8:aa:bb::99'), c = await comPacote(n);
  const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
  assert.equal(r.status, 429, JSON.stringify(r.corpo));
  assert.equal(r.corpo.whatsapp, true);
});

test('fila global cheia: a tela sabe antes (estado) e os detalhes recebem 503 com o WhatsApp', async () => {
  const n = navegador(undefined, { limitesPedido: { ...LIMITES_DE_TESTE, fila_confirmados: 0 } }), c = await comPacote(n);
  assert.equal((await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo.fila_cheia, true);
  const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
  assert.equal(r.status, 503);
  assert.equal(r.corpo.fila_cheia, true);
  assert.equal(r.corpo.whatsapp, true);
});

test('produção sem o segredo do freio: os detalhes fecham com 503 e o WhatsApp (nada gravado)', async () => {
  const antes = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    const n = navegador(undefined, { segredoFreio: undefined }), c = await comPacote(n);
    const r = await n.chamar('POST', 'detalhes', { conversa_id: c, ...DETALHES() });
    assert.equal(r.status, 503, JSON.stringify(r.corpo));
    assert.equal(r.corpo.whatsapp, true);
    assert.equal(await um('select 1 from app.pedidos where conversa_id = $1', [c]), undefined);
  } finally { if (antes === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = antes; }
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
  const r = new Recusa(409, 'x', { whatsapp: true });
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
