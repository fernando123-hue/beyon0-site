/* F3 do JEV, com o banco real (PGlite + migrations) e o fluxo inteiro pela API: a sombra NUNCA muda a resposta (byte a byte),
   falha do motor não afeta o turno, o registro vai para app.jev_sombra sem texto de ninguém, a tabela é fechada e o gasto
   do dia soma só o de hoje. Motor falso: nenhuma chamada à API real.  node --test docs/testes/jev-sombra-banco.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { montarLocal } from '../banco-local.mjs';
import { como, erroDe } from './_banco.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { perguntasDe } from '../../api/_classificador/perguntas.mjs';
import { criarDisjuntor } from '../../api/_classificador/index.mjs';
import { criarSombra } from '../../api/_classificador/sombra.mjs';

let local, deps;
const BASE = 'http://127.0.0.1:8899';
let ipSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32) };
});

function navegador(d) {
  const ip = '198.51.100.' + (++ipSeq);
  let token = null;
  const chamar = async (acao, corpo) => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao, {
      method: 'POST', body: JSON.stringify(corpo), headers: { 'x-forwarded-for': ip, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }
    }), {}, 'POST', d);
    return { status: r.status, texto: await r.text() };
  };
  return { chamar, async iniciar() { const r = JSON.parse((await chamar('sessao', {})).texto); token = r.token; return r.conversa_id; } };
}

const respostaUniforme = tarefa => Object.fromEntries(Object.entries(perguntasDe(tarefa)).map(([n, p]) => [n, Object.fromEntries(p.rotulos.map((r, i) => [r, i === 0 ? 1 : 0]))]));
const LIGADA = Object.freeze({ ligada: true, tetoDiaUsd: 0.3, amostra: 1 });
function sombraDeTeste(chamar) {
  const pedidos = [];
  const criarMotor = aoMedir => ({ nome: 'haiku-falso', modelo: 'claude-haiku-5-5', chamar: async pedido => { pedidos.push(pedido); aoMedir({ custo_usd: 0.0003, ms: 3 }); return chamar ? chamar(pedido) : respostaUniforme(pedido.tarefa); } });
  return { pedidos, sombra: criarSombra({ config: LIGADA, banco: local.rpc, criarMotor, disjuntor: criarDisjuntor(), log: () => {} }) };
}
const MENSAGEM = 'Sou a Bia, bia@exemplo.com. Tenho uma clínica odontológica em Niterói e quero um site com agendamentos.';
/* o código do erro do banco, pelo transporte local (ErroBanco.codigo, como o de produção); null = deu certo */
const falhaDe = p => p.then(() => null, e => e.codigo || 'erro');
const linhasDa = async conversa => (await local.db.query('select * from app.jev_sombra where conversa_id = $1 order by id', [conversa])).rows;

test('a resposta do turno é idêntica byte a byte com e sem a sombra; a sombra roda em segundo plano e grava sem texto', async () => {
  const sem = navegador(deps);
  const semId = await sem.iniciar();
  const r1 = await sem.chamar('mensagem', { conversa_id: semId, texto: MENSAGEM });

  const fundo = [];
  const s = sombraDeTeste();
  const com = navegador({ ...deps, sombra: s.sombra, segundoPlano: p => fundo.push(p) });
  const comId = await com.iniciar();
  const r2 = await com.chamar('mensagem', { conversa_id: comId, texto: MENSAGEM });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, r1.status);
  assert.equal(r2.texto, r1.texto, 'a resposta não muda com a sombra');
  assert.equal(fundo.length, 1, 'uma tarefa de fundo por turno, entregue ao segundo plano (waitUntil no Worker)');
  assert.equal(s.pedidos.length, 0, 'nada da sombra roda antes de a resposta sair');
  await Promise.all(fundo);
  assert.ok(s.pedidos.length >= 2);
  const linhas = await linhasDa(comId);
  assert.ok(linhas.length >= 2);
  assert.deepEqual(linhas.slice(0, 2).map(l => [l.tarefa, l.alvo]), [['entrada_do_visitante', 'entrada'], ['saida_do_zero', 'modelo']]);
  for (const l of linhas) {
    assert.equal(l.disponivel, true);
    assert.equal(Number(l.custo_usd), 0.0003);
    assert.equal(l.modelo, 'claude-haiku-5-5');
    assert.match(l.request_id, /^[0-9a-f-]{36}$/);
  }
  const tudo = JSON.stringify(linhas);
  for (const pedaco of ['Bia', 'bia@', 'clínica', 'odontológica', 'Niterói', 'agendamentos']) assert.ok(!tudo.includes(pedaco), 'vazou: ' + pedaco);
  const resposta = JSON.parse(r2.texto).resposta;
  for (const trecho of resposta.split(/[.!?]/).map(t => t.trim()).filter(t => t.length > 12)) assert.ok(!tudo.includes(trecho), 'vazou a resposta: ' + trecho);
});

test('motor que quebra ou não responde: o turno sai igual, com 200, e a sombra só registra o motivo', async () => {
  for (const chamar of [async () => { throw new Error('fora do ar'); }, async () => ({ torto: true })]) {
    const fundo = [];
    const s = sombraDeTeste(chamar);
    const n = navegador({ ...deps, sombra: s.sombra, segundoPlano: p => fundo.push(p) });
    const id = await n.iniciar();
    const r = await n.chamar('mensagem', { conversa_id: id, texto: MENSAGEM });
    assert.equal(r.status, 200);
    assert.ok(JSON.parse(r.texto).resposta);
    await Promise.all(fundo);
    const linhas = await linhasDa(id);
    assert.ok(linhas.length >= 2);
    for (const l of linhas) { assert.equal(l.disponivel, false); assert.equal(l.sinais, null); assert.ok(['motor falhou', 'resposta incoerente'].includes(l.motivo)); }
  }
});

test('sem sombra (o padrão): nenhuma tarefa de fundo e nenhuma linha', async () => {
  const fundo = [];
  const n = navegador({ ...deps, segundoPlano: p => fundo.push(p) });
  const id = await n.iniciar();
  assert.equal((await n.chamar('mensagem', { conversa_id: id, texto: MENSAGEM })).status, 200);
  assert.equal(fundo.length, 0);
  assert.equal((await linhasDa(id)).length, 0);
});

/* ---------- as funções do banco ---------- */
async function conversaNova() {
  const v = randomUUID();
  await local.db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await local.rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  return { v, c };
}
const registro = (c, v, extra = {}) => ({ conversa_id: c, visitante_id: v, request_id: randomUUID(), tarefa: 'saida_do_zero', alvo: 'modelo', disponivel: true, motivo: null,
  sinais: { promete_desconto: { p_sim: 0.9 } }, codigo: { promete_desconto: 'sim' }, divergencias: ['escreve_valor:so_haiku'],
  versoes: { perguntas: 'saida-1', protecao: 'p1', politica: 'pol-1', instrucao: 'v2' }, modelo: 'claude-haiku-5-5', custo_usd: 0.0004, ms: 1300, cortado: false,
  mascarados: { email: 0, telefone: 0, documento: 0 }, ...extra });

test('registrar: só para a conversa do próprio visitante; valores fora do combinado são recusados', async () => {
  const { v, c } = await conversaNova();
  assert.equal((await local.rpc('vendas_sombra_registrar', registro(c, v))).ok, true);
  assert.equal(await falhaDe(local.rpc('vendas_sombra_registrar', registro(c, randomUUID()))), 'P0002');
  for (const ruim of [{ tarefa: 'outra' }, { alvo: 'x' }, { motivo: 'texto livre qualquer' }, { divergencias: ['Olá, tudo bem?'] }, { custo_usd: -1 }, { ms: -5 },
    { modelo: 'x'.repeat(61) }, { codigo: { promete_desconto: 'talvez a pessoa queira' } }, { sinais: { promete_desconto: { p_sim: 'muito' } } }, { request_id: 'abc' }]) {
    assert.ok(await falhaDe(local.rpc('vendas_sombra_registrar', registro(c, v, ruim))), JSON.stringify(ruim));
  }
});

test('gasto do dia: soma só o de hoje (horário de Brasília) e só da organização', async () => {
  const antes = Number((await local.rpc('vendas_sombra_gasto_dia', { org_slug: 'beyon-zero' })).custo_usd);
  const { v, c } = await conversaNova();
  await local.rpc('vendas_sombra_registrar', registro(c, v, { custo_usd: 0.002 }));
  await local.db.query("insert into app.jev_sombra (org_id, conversa_id, tarefa, alvo, disponivel, versoes, custo_usd, criado_em) select org_id, id, 'saida_do_zero', 'modelo', true, '{}', 0.5, now() - interval '2 days' from app.conversas where id = $1", [c]);
  const depois = Number((await local.rpc('vendas_sombra_gasto_dia', { org_slug: 'beyon-zero' })).custo_usd);
  assert.ok(Math.abs(depois - antes - 0.002) < 1e-9, 'o de dois dias atrás não conta');
  assert.equal(Number((await local.rpc('vendas_sombra_gasto_dia', { org_slug: 'outra' })).custo_usd), 0);
});

test('resumo: devolve as linhas dos últimos dias sem nenhum texto e com o limite de dias', async () => {
  const { v, c } = await conversaNova();
  await local.rpc('vendas_sombra_registrar', registro(c, v));
  const r = await local.rpc('vendas_sombra_resumo', { org_slug: 'beyon-zero', dias: 7 });
  assert.ok(Array.isArray(r.linhas) && r.linhas.length >= 1);
  assert.deepEqual(Object.keys(r.linhas[0]).sort(), ['alvo', 'codigo', 'custo_usd', 'dia', 'disponivel', 'divergencias', 'motivo', 'ms', 'sinais', 'tarefa', 'versoes']);
  assert.equal(await falhaDe(local.rpc('vendas_sombra_resumo', { org_slug: 'beyon-zero', dias: 400 })), '22023', 'mais de 90 dias é recusado');
});

test('tabela fechada: ninguém lê nem escreve direto (nem service_role); as funções só para service_role', async () => {
  for (const quem of ['anon', 'service_role', randomUUID()]) {
    assert.ok(await erroDe(como(local.db, quem, q => q('select * from app.jev_sombra'), { manter: false })), quem + ' leu a tabela');
  }
  for (const f of ['vendas_sombra_registrar', 'vendas_sombra_gasto_dia', 'vendas_sombra_resumo']) {
    for (const quem of ['anon', randomUUID()]) {
      assert.ok(await erroDe(como(local.db, quem, q => q(`select app.${f}('{}'::jsonb)`), { manter: false })), quem + ' executou ' + f);
    }
  }
});

test('apagar a conversa apaga as linhas da sombra dela (a retenção segue a da conversa)', async () => {
  const { v, c } = await conversaNova();
  await local.rpc('vendas_sombra_registrar', registro(c, v));
  await local.db.query('delete from app.conversas where id = $1', [c]);
  assert.equal((await linhasDa(c)).length, 0);
});
