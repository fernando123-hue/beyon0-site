/* O ESTADO COM A PLANTA (PR 2a; spec §2.6), pela API de verdade (PGlite + migrations + IA simulada). Prova: o `estado` APAGA planta, leitura e planta_pedidos de
   conversa.briefing SEMPRE; com a flag desligada ele é byte a byte o de hoje; com a flag ligada devolve a planta REVALIDADA (sem motivos nem tentativas) e
   planta_editavel; plano gravado que deixou de ser válido sai como o padrão; e o fluxo passa a flag ao agente.  node --test docs/testes/planta-estado.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

let local, deps;
const BASE = 'http://127.0.0.1:8899';
const LIGADA = { BZ_PLANTA: 'ligada' };
const CHAVES = ['planta', 'leitura', 'planta_pedidos'];
let ipSeq = 100;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
});

/* um "navegador" com o ambiente da vez (o ambiente é por chamada: dá para ligar e desligar a flag na mesma conversa) */
function navegador() {
  const ip = '198.51.100.' + (++ipSeq);
  let token = null;
  const chamar = async (env, metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, {
      method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
    }), env, metodo, deps);
    return { status: r.status, texto: await r.text() };
  };
  const json = async (...a) => { const r = await chamar(...a); return { status: r.status, corpo: JSON.parse(r.texto) }; };
  return {
    chamar, json,
    async iniciar() { const r = await json({}, 'POST', 'sessao', {}); token = r.corpo.token; return r.corpo; },
    estado: (env, c) => chamar(env, 'GET', 'estado', undefined, '&conversa=' + c)
  };
}
const FALA_INICIAL = 'Tenho uma clínica odontológica em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.';

/* uma conversa até a planta: 1º turno estima; 2º turno (a flag ligada) desenha */
async function conversaComPlanta() {
  const n = navegador();
  const c = (await n.iniciar()).conversa_id;
  const m1 = await n.json(LIGADA, 'POST', 'mensagem', { conversa_id: c, texto: FALA_INICIAL });
  assert.equal(m1.status, 200);
  assert.ok(m1.corpo.estimativa, 'o 1º turno estima');
  const e1 = JSON.parse((await n.estado(LIGADA, c)).texto);
  assert.equal(e1.planta, undefined, 'no turno da primeira estimativa a planta ainda não aparece');
  const m2 = await n.json(LIGADA, 'POST', 'mensagem', { conversa_id: c, texto: 'planta-boa' });
  assert.equal(m2.status, 200, JSON.stringify(m2.corpo));
  return { n, c };
}
const briefingNoBanco = async c => (await local.db.query('select briefing from app.conversas where id = $1', [c])).rows[0].briefing;

test('flag ligada: o 2º turno desenha (origem "modelo") e o estado devolve a planta SEM motivos nem tentativas, mais planta_editavel; conversa.briefing sem as chaves', async () => {
  const { n, c } = await conversaComPlanta();
  const gravado = await briefingNoBanco(c);
  assert.equal(gravado.planta.origem, 'modelo');
  assert.equal(gravado.planta.versao, 1);
  assert.ok(Array.isArray(gravado.planta.motivos) && Number.isInteger(gravado.planta.tentativas), 'no banco ficam motivos e tentativas');
  const bruto = (await n.estado(LIGADA, c)).texto;
  const e = JSON.parse(bruto);
  assert.equal(e.planta.versao, 1);
  assert.equal(e.planta.origem, 'modelo');
  assert.equal(e.planta.n_mensagens, gravado.planta.n_mensagens);
  assert.deepEqual(Object.keys(e.planta).sort(), ['n_mensagens', 'origem', 'plano', 'versao']);
  assert.equal(e.planta.plano.etapas[0].titulo, 'Página feita para o seu negócio');
  assert.equal(e.planta_editavel, true);
  for (const k of CHAVES) assert.equal(e.conversa.briefing[k], undefined, 'conversa.briefing.' + k);
  assert.ok(!/motivos|tentativas|planta_pedidos/.test(bruto), 'nada do banco vaza para a tela');
  assert.ok(e.conversa.briefing.negocio, 'o resto do briefing segue (o painel precisa)');
});

test('flag DESLIGADA: plano gravado não aparece (nem planta, nem leitura, nem planta_editavel, nem em conversa.briefing) e o estado é byte a byte o do briefing sem as chaves', async () => {
  const { n, c } = await conversaComPlanta();
  await local.db.query(`update app.conversas set briefing = briefing || '{"leitura":{"eixos":[]}}'::jsonb where id = $1`, [c]);
  const comChaves = await briefingNoBanco(c);
  assert.ok(CHAVES.filter(k => comChaves[k] !== undefined).length >= 2, 'o banco tem a planta e a leitura gravadas');
  const desligada = (await n.estado({}, c)).texto;
  const e = JSON.parse(desligada);
  for (const k of ['planta', 'leitura', 'planta_editavel']) assert.equal(e[k], undefined, k);
  for (const k of CHAVES) assert.equal(e.conversa.briefing[k], undefined, 'conversa.briefing.' + k);
  assert.ok(!/"(planta|leitura|planta_pedidos|planta_editavel|n_mensagens|motivos|tentativas)":/.test(desligada), 'nenhuma chave da planta no JSON da resposta');
  /* o MESMO estado depois de tirar as chaves do banco: igual, byte a byte */
  await local.db.query(`update app.conversas set briefing = briefing - 'planta' - 'leitura' - 'planta_pedidos' where id = $1`, [c]);
  assert.equal((await n.estado({}, c)).texto, desligada);
  /* e a flag explicitamente desligada ou com qualquer outro valor também */
  assert.equal((await n.estado({ BZ_PLANTA: '' }, c)).texto, desligada);
  assert.equal((await n.estado({ BZ_PLANTA: 'sim' }, c)).texto, desligada);
});

test('plano gravado que deixou de ser válido sai como o padrão do nicho (a planta é revalidada a cada leitura)', async () => {
  const { n, c } = await conversaComPlanta();
  await local.db.query(`update app.conversas set briefing = jsonb_set(briefing, '{planta,plano,etapas,0,titulo}', '"Passo 1 da pagina"') where id = $1`, [c]);
  const e = JSON.parse((await n.estado(LIGADA, c)).texto);
  assert.equal(e.planta.origem, 'padrao');
  assert.deepEqual(e.planta.plano, planoPadrao('saude_agenda'));
  assert.equal(e.planta.versao, 1, 'a versão e a posição da fala seguem');
  /* lixo no lugar do plano: também vira o padrão, nunca derruba o estado */
  await local.db.query(`update app.conversas set briefing = jsonb_set(briefing, '{planta,plano}', '"lixo"') where id = $1`, [c]);
  const lixo = await n.estado(LIGADA, c);
  assert.equal(lixo.status, 200);
  assert.equal(JSON.parse(lixo.texto).planta.origem, 'padrao');
  /* chave planta com forma errada: sem planta */
  await local.db.query(`update app.conversas set briefing = jsonb_set(briefing, '{planta}', '7') where id = $1`, [c]);
  const sete = JSON.parse((await n.estado(LIGADA, c)).texto);
  assert.equal(sete.planta, undefined);
  assert.equal(sete.conversa.briefing.planta, undefined);
});

test('sem plano e com a flag ligada: sem "planta" no estado e planta_editavel acompanha o preço aberto; depois do pedido confirmado vira false e o plano segue visível', async () => {
  const n = navegador();
  const c = (await n.iniciar()).conversa_id;
  const vazio = JSON.parse((await n.estado(LIGADA, c)).texto);
  assert.equal(vazio.planta, undefined);
  assert.equal(vazio.leitura, undefined);
  assert.equal(vazio.planta_editavel, true, 'conversa nova: o preço está aberto');
  await n.json(LIGADA, 'POST', 'mensagem', { conversa_id: c, texto: FALA_INICIAL });
  await n.json(LIGADA, 'POST', 'mensagem', { conversa_id: c, texto: 'planta-boa' });
  assert.equal(JSON.parse((await n.estado(LIGADA, c)).texto).planta_editavel, true);
  await detalhesEConfirmar((...a) => n.json(LIGADA, ...a), local.rpc, c, { nome: 'Dra. Ana' });
  const fechado = JSON.parse((await n.estado(LIGADA, c)).texto);
  assert.equal(fechado.planta_editavel, false, 'pedido confirmado: sem ajuste');
  assert.equal(fechado.planta.versao, 1, 'o plano segue visível');
});

test('com a flag desligada o fluxo não passa a planta ao agente: o 2º turno com "planta-boa" não desenha nada e nenhuma chave nasce no banco', async () => {
  const n = navegador();
  const c = (await n.iniciar()).conversa_id;
  await n.json({}, 'POST', 'mensagem', { conversa_id: c, texto: FALA_INICIAL });
  await n.json({}, 'POST', 'mensagem', { conversa_id: c, texto: 'planta-boa' });
  await n.json({}, 'POST', 'mensagem', { conversa_id: c, texto: 'e agora?' });
  const b = await briefingNoBanco(c);
  for (const k of CHAVES) assert.equal(b[k], undefined, k);
});

test('com a flag ligada, o modelo que esquece duas vezes ganha o padrão do nicho no banco (motivo nao_chamou) e o estado mostra o exemplo', async () => {
  const n = navegador();
  const c = (await n.iniciar()).conversa_id;
  await n.json(LIGADA, 'POST', 'mensagem', { conversa_id: c, texto: FALA_INICIAL });
  await n.json(LIGADA, 'POST', 'mensagem', { conversa_id: c, texto: 'Me conta mais sobre como funciona' });
  assert.equal((await briefingNoBanco(c)).planta_pedidos, 1);
  await n.json(LIGADA, 'POST', 'mensagem', { conversa_id: c, texto: 'E depois, o que acontece?' });
  const b = await briefingNoBanco(c);
  assert.equal(b.planta.origem, 'padrao');
  assert.deepEqual(b.planta.motivos, ['nao_chamou']);
  const e = JSON.parse((await n.estado(LIGADA, c)).texto);
  assert.equal(e.planta.origem, 'padrao');
  assert.deepEqual(e.planta.plano, planoPadrao('saude_agenda'));
});

test('leitura gravada: só aparece com a flag ligada, validada na forma e nos textos; inválida some', async () => {
  const { n, c } = await conversaComPlanta();
  const leitura = { eixos: [
    { eixo: 'volume', nivel: 'comentou', evidencia: 'tem procura todo dia' }, { eixo: 'repeticao', nivel: 'nao_falou', evidencia: 'isto não deve aparecer' },
    { eixo: 'urgencia', nivel: 'nao_falou' }, { eixo: 'pessoas', nivel: 'deixou_claro', evidencia: 'só eu atendo' }, { eixo: 'informacao', nivel: 'nao_falou' }] };
  await local.db.query(`update app.conversas set briefing = briefing || jsonb_build_object('leitura', $2::jsonb) where id = $1`, [c, JSON.stringify(leitura)]);
  const e = JSON.parse((await n.estado(LIGADA, c)).texto);
  assert.deepEqual(e.leitura.eixos.map(x => x.eixo), ['volume', 'repeticao', 'urgencia', 'pessoas', 'informacao']);
  assert.equal(e.leitura.eixos[1].evidencia, undefined, 'evidência de eixo "não falou" não é devolvida');
  assert.equal(e.leitura.eixos[0].evidencia, 'tem procura todo dia');
  assert.equal(JSON.parse((await n.estado({}, c)).texto).leitura, undefined);
  /* evidência com número: a leitura inteira some (o radar nunca repete número) */
  leitura.eixos[0].evidencia = 'tem 30 pedidos por dia';
  await local.db.query(`update app.conversas set briefing = briefing || jsonb_build_object('leitura', $2::jsonb) where id = $1`, [c, JSON.stringify(leitura)]);
  assert.equal(JSON.parse((await n.estado(LIGADA, c)).texto).leitura, undefined);
  /* forma errada (4 eixos) também */
  await local.db.query(`update app.conversas set briefing = briefing || jsonb_build_object('leitura', '{"eixos":[]}'::jsonb) where id = $1`, [c]);
  assert.equal(JSON.parse((await n.estado(LIGADA, c)).texto).leitura, undefined);
});
