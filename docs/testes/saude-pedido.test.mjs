/* SAÚDE E ADVOCACIA VENDEM PELO SITE, COM CUIDADO E COM A CIÊNCIA DO DONO (decisão do dono de 15/11; spec docs/superpowers/specs/2026-11-15-
   nicho-regulado-design.md §1 e §9). Sai a trava "saúde não fecha" do #165: o pedido de saúde gera os modelos (com a conferência das regras do
   conselho, docs/testes/nicho-regulado.test.mjs) e chega à entrada pelo Pix como qualquer ramo. O dono fica sabendo: o aviso do pedido diz o ramo e o
   painel traz o selo com o conselho e o registro. Nunca o nome de ninguém da equipe. node --test docs/testes/saude-pedido.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { criarAcoesDoPedido } from '../../api/_vendas/fluxo-pedido.mjs';
import { AVISOS } from '../../api/_aviso.mjs';
import { avisoRegulado, nichoRegulado } from '../../api/_vendas/zero.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar, telefoneDeTeste } from './_pedido.mjs';

const BASE = 'http://127.0.0.1:8899';
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '52998224725' };
let local, deps, ipSeq = 0;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE,
    pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
});
function navegador() {
  const ip = '198.51.100.' + (++ipSeq);
  let token = null;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const TEXTO_DENTISTA = 'Tenho uma clínica odontológica em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.';

test('saúde fecha pelo site: o pedido gera os 3 modelos (conferidos), e a escolha, o escopo e a entrada pelo Pix seguem como em qualquer ramo', async () => {
  const n = navegador(), c = await n.iniciar();
  assert.equal((await n.chamar('POST', 'mensagem', { conversa_id: c, texto: TEXTO_DENTISTA })).status, 200);
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Sim, quero ver as propostas' });
  await detalhesEConfirmar(n.chamar, local.rpc, c, { nome: 'Dra. Ana' });
  const e = (await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo;
  assert.equal(e.modo_direcoes, 'api', 'nada de fila manual por ser saúde');
  assert.equal(e.saude_com_a_equipe, undefined, 'a trava do #165 saiu');
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  const prontas = await Promise.all(g.corpo.direcoes.map((d) => n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id })));
  assert.deepEqual(prontas.map((p) => p.corpo.status), ['pronta', 'pronta', 'pronta'], 'os 3 modelos saem (o dublê segue a norma e passa na conferência)');
  const est = (await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo;
  /* (PR 180) a reserva por código também sai "pronta" e sem depoimentos: sem isto, um gerador que viola a norma passaria despercebido.
     Os três têm de vir do gerador (o dublê), nunca da reserva */
  const modelos = (await local.db.query('select modelo from app.direcoes where conversa_id = $1', [c])).rows.map((r) => r.modelo);
  assert.equal(modelos.length, 3);
  assert.ok(modelos.every((m) => m !== 'reserva-codigo'), 'os modelos vieram do gerador, não da reserva por código: ' + modelos.join(','));
  for (const d of est.direcoes) {
    assert.ok(!d.conteudo.secoes.some((s) => s.tipo === 'depoimentos' || s.tipo === 'numeros'), 'sem depoimentos nem números');
    assert.match(d.conteudo.rodape.texto, /\[número do registro\]|CRO/, 'a identificação no rodapé');
  }
  assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: est.direcoes[0].id })).status, 200);
  const esc = await n.chamar('POST', 'escopo', { conversa_id: c });
  assert.equal(esc.status, 200, JSON.stringify(esc.corpo));
  assert.equal((await n.chamar('POST', 'confirmar', { conversa_id: c, proposta_id: esc.corpo.proposta_id, confirmo: true, inicio_imediato: true })).status, 200);
  const pg = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
  assert.equal(pg.status, 200, JSON.stringify(pg.corpo));
  assert.equal(pg.corpo.tentativa.status, 'aguardando', 'o Pix gerado');
});

test('a ciência do dono: o pedido de saúde ou advocacia leva o aviso próprio (texto fixo, sem dado); o comum segue com o de sempre', async () => {
  assert.match(AVISOS.pedido_regulado, /saúde ou advocacia/);
  assert.doesNotMatch(AVISOS.pedido_regulado, /[@\d]|Fernando|[Cc]onfira o registro/, 'o e-mail não promete o selo');
  for (const [regulado, esperado] of [[async () => true, 'pedido_regulado'], [async () => false, 'pedido'], [async () => { throw new Error('banco fora'); }, 'pedido']]) {
    const avisos = [];
    const acoes = criarAcoesDoPedido({ banco: async () => ({ ok: true, codigo: 'BZ-ACDEF', fila_cheia: false }), visitante: async () => '11111111-1111-4111-8111-111111111111',
      segredoFreio: 's'.repeat(32), avisar: async (_env, tipo) => { avisos.push(tipo); return true; }, segundoPlano: (p) => p, regulado });
    const request = new Request(BASE + '/api/vendas?acao=detalhes', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.7' } });
    const r = await acoes.detalhes({ request, corpo: { conversa_id: '22222222-2222-4222-8222-222222222222', negocio: 'Clínica Sol', vende: 'Consultas', telefone: telefoneDeTeste(), aceite: true, aceite_versao: 'a1' } });
    assert.equal(r.status, 'confirmado');
    await new Promise((s) => setTimeout(s, 0));
    assert.deepEqual(avisos, [esperado]);
  }
  /* o banco lento na leitura do ramo não segura a confirmação do pedido */
  const lenta = criarAcoesDoPedido({ banco: async () => ({ ok: true, codigo: 'BZ-ACDEF', fila_cheia: false }), visitante: async () => '11111111-1111-4111-8111-111111111111',
    segredoFreio: 's'.repeat(32), avisar: async () => true, segundoPlano: () => {}, regulado: () => new Promise(() => {}) });
  const req = new Request(BASE + '/api/vendas?acao=detalhes', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.8' } });
  const corrida = await Promise.race([lenta.detalhes({ request: req, corpo: { conversa_id: '22222222-2222-4222-8222-222222222222', negocio: 'Clínica Sol', vende: 'Consultas', telefone: telefoneDeTeste(), aceite: true, aceite_versao: 'a1' } }),
    new Promise((s) => setTimeout(() => s('esperou'), 500))]);
  assert.equal(corrida?.status, 'confirmado', 'o pedido não espera a leitura do ramo');
});

test('o Zero não diz mais "não fecha pelo site" e nunca cita o nome de ninguém da equipe', () => {
  for (const t of ['sou dentista', 'sou advogada', 'clínica de fisioterapia']) {
    const a = avisoRegulado(nichoRegulado(t));
    assert.equal(a.fechamento, undefined, t);
    assert.doesNotMatch(JSON.stringify(a), /Fernando|não fecha/, t);
  }
  const pagina = ['js/orcamento.js', 'js/orcamento-detalhes.js', 'js/orcamento-preparo.js'].map((f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(pagina, /saude_com_a_equipe|Na área da saúde a gente confere/, 'os textos da trava saíram da página');
});

test('o painel: o selo de saúde ou advocacia com o conselho e o registro (ou a falta dele), sem texto do visitante', () => {
  const api = fs.readFileSync(new URL('../../api/painel.mjs', import.meta.url), 'utf8');
  assert.match(api, /regulado: \{ tipo: c\.tipo, conselho: c\.conselho, registro: registroDoNicho\(/);
  const js = fs.readFileSync(new URL('../../js/painel-fila.js', import.meta.url), 'utf8');
  assert.match(js, /conferir antes de produzir/);
  assert.match(js, /conselho da profissão/, 'o ramo sem conselho próprio não mostra a palavra solta');
  assert.doesNotMatch(js, /com o dono\. Não fecha pelo site/);
});
