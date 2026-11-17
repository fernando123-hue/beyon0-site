/* CLÍNICA OU CONSULTÓRIO SEM A PROFISSÃO (M3, achado da revisão de segurança do #173, 16/11): com a geração automática em produção, "clínica"
   sem dizer se é dentista, médico ou psicólogo passava sem o bloco regulado e sem a conferência. Agora é saúde genérica até a pessoa dizer a
   profissão (aí vale o nicho dela); veterinária, carro e aparelho ficam de fora. nichoRegulado (o detector que o classificador mede) não muda.
   node --test docs/testes/nicho-sem-profissao.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { ramoSemProfissao, nichoRegulado, avisoRegulado, NICHO_GENERICO } from '../../api/_vendas/zero.mjs';
import { nichoDaSessao, nichoReguladoDaSessao } from '../../api/_vendas/agente.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

const visitante = (conteudo) => ({ papel: 'visitante', conteudo });

test('clínica ou consultório sem a profissão é ramo sem profissão; veterinária, carro, aparelho e outros ramos não', () => {
  for (const t of ['tenho uma clínica em Niterói', 'meu consultório atende adultos', 'Clínica Sol', 'CONSULTÓRIO', 'clínicas populares']) assert.equal(ramoSemProfissao(t), true, t);
  for (const t of ['clínica veterinária', 'consultório veterinário', 'clínica do celular', 'clínica de notebook e informática', 'clínica automotiva', 'padaria artesanal', 'loja de roupa', '', null, undefined])
    assert.equal(ramoSemProfissao(t), false, String(t));
});

test('o detector que o classificador mede não muda: "clínica" sozinha continua sem nicho', () => {
  assert.equal(nichoRegulado('tenho uma clínica em Niterói'), null);
  assert.equal(nichoRegulado('consultório'), null);
  assert.equal(nichoRegulado('clínica odontológica').chave, 'odontologia');
});

test('a sessão: clínica sem profissão vira saúde genérica; a profissão, de qualquer fonte, vence; o consultório jurídico é advocacia', () => {
  const generico = nichoDaSessao({ briefing: {}, mensagens: [visitante('Tenho uma clínica em Niterói e quero mais agendamentos')] });
  assert.equal(generico, NICHO_GENERICO);
  assert.equal(nichoDaSessao({ briefing: { negocio: { segmento: 'clínica' } } }), NICHO_GENERICO, 'o segmento que o modelo registrou');
  assert.equal(nichoDaSessao({ briefing: {}, mensagem: 'meu consultório é pequeno' }), NICHO_GENERICO, 'a mensagem de agora');
  assert.equal(nichoDaSessao({ briefing: {}, mensagens: [visitante('Tenho uma clínica'), visitante('Sou dentista')] }).chave, 'odontologia', 'depois de dizer a profissão');
  assert.equal(nichoDaSessao({ briefing: { negocio: { segmento: 'clínica' }, servicos: ['fisioterapia'] } }).chave, 'fisioterapia', 'a profissão nos serviços');
  assert.equal(nichoDaSessao({ briefing: {}, mensagens: [visitante('Tenho um consultório jurídico')] }).chave, 'advocacia');
  assert.equal(nichoDaSessao({ briefing: {}, mensagens: [visitante('Tenho uma clínica veterinária')] }), null);
  assert.equal(nichoDaSessao({ briefing: {}, mensagens: [visitante('Tenho uma padaria')] }), null);
});

test('a geração e o selo: o nome "Clínica Sol" com segmento genérico também fecha para o lado das regras; o nicho comum não muda', () => {
  assert.deepEqual(nichoReguladoDaSessao({ briefing: { negocio: { nome: 'Clínica Sol', segmento: 'serviços' } }, mensagens: [] }), { chave: 'saude_generica' });
  assert.deepEqual(nichoReguladoDaSessao({ briefing: { negocio: { nome: 'Consultório Bem Estar' } } }), { chave: 'saude_generica' });
  assert.deepEqual(nichoReguladoDaSessao({ briefing: { negocio: { segmento: 'clínica' } } }), { chave: 'saude_generica' });
  assert.equal(nichoReguladoDaSessao({ briefing: { negocio: { nome: 'Clínica Sol', segmento: 'odontologia' } } }).chave, 'odontologia', 'a profissão vence o nome');
  for (const b of [{ negocio: { nome: 'Padaria Sol', segmento: 'serviços' } }, { negocio: { nome: 'Clínica do Celular', segmento: 'conserto' } }, { negocio: { nome: 'Clínica Pet Feliz' } }])
    assert.equal(nichoReguladoDaSessao({ briefing: b, mensagens: [] }), null, JSON.stringify(b));
});

test('o Zero: com clínica sem profissão, o aviso traz as regras e manda perguntar a profissão UMA vez; com a profissão, não', () => {
  const a = avisoRegulado(NICHO_GENERICO);
  assert.match(a.profissao_a_confirmar, /ainda não disse a profissão/);
  assert.match(a.profissao_a_confirmar, /UMA vez/);
  assert.ok(a.regras_do_conselho && a.nunca.includes('antes e depois'), 'as regras valem até lá');
  assert.equal(avisoRegulado(nichoRegulado('sou dentista')).profissao_a_confirmar, undefined);
});

/* ---- pelo fluxo de verdade (API, banco local e dublê): a geração sai com as regras e o aviso do dono diz o ramo ---- */
const BASE = 'http://127.0.0.1:8899';
let local, deps, ipSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE,
    pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
});
function navegador() {
  const ip = '198.51.100.' + (150 + (++ipSeq));
  let token = null;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
async function geradosPor(texto, negocio) {
  const n = navegador(), c = await n.iniciar();
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto });
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Sim, quero ver as propostas' });
  await detalhesEConfirmar(n.chamar, local.rpc, c, { negocio, vende: 'Produtos e encomendas' });
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  const prontas = await Promise.all(g.corpo.direcoes.map((d) => n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id })));
  assert.deepEqual(prontas.map((p) => p.corpo.status), ['pronta', 'pronta', 'pronta']);
  return (await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo.direcoes;
}

test('clínica sem profissão pelo fluxo: os 3 modelos saem pela geração regulada (sem depoimentos nem números, com o registro ou o marcador no rodapé)', async () => {
  const dirs = await geradosPor('Tenho uma clínica em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.', 'Espaço Sol');
  for (const d of dirs) {
    assert.ok(!d.conteudo.secoes.some((s) => s.tipo === 'depoimentos' || s.tipo === 'numeros'), 'sem depoimentos nem números');
    assert.ok(d.conteudo.rodape.texto.includes('[número do registro]'), 'a identificação no rodapé (o marcador, até a pessoa dar o registro)');
  }
});

test('o mesmo pedido de um ramo comum segue como sempre: sem a linha de registro no rodapé', async () => {
  const dirs = await geradosPor('Tenho uma padaria artesanal em Niterói e quero um site mais profissional porque hoje só tenho Instagram.', 'Padaria Sol');
  for (const d of dirs) assert.ok(!d.conteudo.rodape.texto.includes('[número do registro]'), 'o ramo comum não leva o marcador do registro');
});
