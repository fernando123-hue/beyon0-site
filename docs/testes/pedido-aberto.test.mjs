/* Lapidação do Zero consultor (dono, 25/11: "quero ele perfeitamente lapidado"). Na conversa real gravada em 25/11, depois que o Zero
   abriu os passos do pedido ele continuou fazendo perguntas próprias (pediu o CREFITO duas vezes) enquanto a pergunta dos passos
   voltava ao fim da conversa: duas vozes pedindo duas coisas. Agora o turno que abre os passos marca o caso (pedido_aberto, chave só
   do código) e, dali em diante, o ESTADO diz que a pergunta da vez é a dos passos. Banco real (PGlite + migrations), IA simulada. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { LIMITES_DE_TESTE } from './_pedido.mjs';
import { PASSOS_ABERTOS, proximoPasso } from '../../api/_vendas/consultor.mjs';
import { CHAVES_DO_CODIGO, semChavesDoCodigo, limparAtualizacao } from '../../api/_vendas/briefing.mjs';

let local, deps, ipSeq = 0;
const contextos = [];
const BASE = 'http://127.0.0.1:8899';
before(async () => {
  local = await montarLocal({ base: BASE });
  const sim = criarSimulada();
  const ia = { ...sim, mensagem: p => { if (p.papel === 'conversa') contextos.push(String(p.contexto)); return sim.mensagem(p); } };
  deps = { banco: local.rpc, visitantes: local.auth, ia, direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE };
});
function navegador() {
  const ip = '198.51.100.' + (60 + (++ipSeq));
  let token = null;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const TOQUES = { ramo: 'saude', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'parte' };
const briefingDe = async c => (await local.db.query('select briefing from app.conversas where id = $1', [c])).rows[0].briefing;

test('pedido aberto: o turno que abre os passos marca o caso, e o turno seguinte manda responder sem pergunta própria', async () => {
  const n = navegador(), c = await n.iniciar();
  const t1 = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Os pacientes chegam pelo Instagram e eu respondo tudo na mão', respostas: { ...TOQUES, responde: 'dor' } });
  assert.equal(t1.status, 200, JSON.stringify(t1.corpo));
  const t2 = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Fica em Niterói' });
  assert.ok(t2.corpo.estimativa && t2.corpo.estimativa.valor_total > 0, 'o turno do valor estima');
  assert.notEqual((await briefingDe(c)).pedido_aberto, true, 'antes de abrir os passos, nada marcado');
  const t3 = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'quero ver os modelos' });
  assert.equal(t3.status, 200, JSON.stringify(t3.corpo));
  assert.equal(t3.corpo.pedir_contato, true, 'os passos do pedido abrem');
  assert.equal((await briefingDe(c)).pedido_aberto, true, 'o caso fica marcado');
  const antes = contextos.length;
  const t4 = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'e quanto tempo leva?' });
  assert.equal(t4.status, 200, JSON.stringify(t4.corpo));
  const novos = contextos.slice(antes);
  assert.ok(novos.length && novos[0].includes('Os passos do pedido já estão abertos logo abaixo da sua fala'), 'o ESTADO do turno seguinte avisa que a pergunta da vez é a dos passos');
  assert.ok(contextos.every(x => !x.includes('pedido_aberto')), 'o modelo nunca vê a chave do código');
});

test('pedido aberto: a chave é só do código (o modelo não a vê nem a grava) e o próximo passo muda só com ela', () => {
  assert.ok(CHAVES_DO_CODIGO.includes('pedido_aberto'));
  assert.deepEqual(semChavesDoCodigo({ negocio: { segmento: 'x' }, pedido_aberto: true }), { negocio: { segmento: 'x' } });
  assert.equal(limparAtualizacao({ pedido_aberto: true, negocio: { segmento: 'x' } }).pedido_aberto, undefined, 'o modelo não grava a chave pelo atualizar_briefing');
  const briefing = { negocio: { segmento: 'fisioterapia', descricao: 'clínica' }, objetivos: ['agendamentos'], projeto: { formato: 'landing_page' }, situacao_atual: { como_chegam: 'Instagram' } };
  const estimativa = { valor_total: 3350, sinal: 1340, prazo_dias: 9 };
  const sem = proximoPasso({ etapa: 'estimativa', briefing, estimativa });
  const com = proximoPasso({ etapa: 'estimativa', briefing: { ...briefing, pedido_aberto: true }, estimativa });
  assert.ok(!sem.startsWith(PASSOS_ABERTOS), 'sem a marca, o passo de sempre');
  assert.ok(com.startsWith(PASSOS_ABERTOS), 'com a marca, os passos abertos vêm primeiro');
  assert.match(com, /não chame pedir_contato de novo/);
  assert.match(com, /termine sem pergunta sua/);
  assert.doesNotMatch(com, /Chame pedir_contato/);
});
