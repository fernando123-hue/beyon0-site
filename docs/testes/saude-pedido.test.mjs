/* SAÚDE ATENDE, MAS NÃO FECHA PELO SITE (decisão do dono, 14/11, 01 Empresa/Decisões.md; achado no teste com a IA real): o pedido de saúde
   pega o contato como qualquer outro, mas não gera os modelos automáticos, não abre a entrada nem o Pix (nem com a pessoa insistindo) e o painel
   o marca "Saúde: com o dono". A advocacia é regulada mas não é saúde: segue fechando. O nicho comum fica igual. Nenhum texto diz o nome de alguém.
   node --test docs/testes/saude-pedido.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { saudeDaSessao } from '../../api/_vendas/agente.mjs';
import { avisoRegulado, nichoRegulado, FECHAMENTO_SAUDE } from '../../api/_vendas/zero.mjs';
import { SAUDE_COM_A_EQUIPE } from '../../api/_vendas/fluxo.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

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
/* a conversa até o pedido enviado (a IA simulada estima por "site mais profissional" e "agendamentos"; o ramo vem do texto) */
async function atePedido(texto) {
  const n = navegador(), c = await n.iniciar();
  const m1 = await n.chamar('POST', 'mensagem', { conversa_id: c, texto });
  assert.equal(m1.status, 200, JSON.stringify(m1.corpo));
  assert.ok(m1.corpo.estimativa, 'estimou');
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Sim, quero ver as propostas' });
  await detalhesEConfirmar(n.chamar, local.rpc, c, { nome: 'Ana' });
  const e = (await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo;
  return { n, c, e };
}
const TEXTO_DENTISTA = 'Tenho uma clínica odontológica em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.';
const TEXTO_PILATES = 'Tenho um estúdio de pilates em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.';

test('quem é saúde: dentista, fisioterapia, psicologia, nutrição, medicina e estética; advocacia e o nicho comum não', () => {
  for (const t of ['Sou dentista', 'Clínica de fisioterapia', 'Atendo como psicóloga', 'Sou nutricionista', 'Consultório médico', 'Clínica de estética'])
    assert.equal(saudeDaSessao({ briefing: {}, mensagens: [{ papel: 'visitante', conteudo: t }] }), true, t);
  for (const t of ['Sou advogado', 'Estúdio de pilates', 'Loja de roupa', 'Pet shop com médico veterinário'])
    assert.equal(saudeDaSessao({ briefing: {}, mensagens: [{ papel: 'visitante', conteudo: t }] }), false, t);
});

test('revisões: o ramo "Saúde" tocado conta, e um nicho anterior (advocacia) não esconde a saúde', () => {
  assert.equal(saudeDaSessao({ briefing: { negocio: { segmento: 'saúde' } }, mensagens: [] }), true, 'só de toques');
  assert.equal(saudeDaSessao({ briefing: { negocio: { segmento: 'Saúde' } }, mensagens: [] }), true);
  assert.equal(saudeDaSessao({ briefing: { negocio: { segmento: 'advocacia' } }, mensagens: [{ papel: 'visitante', conteudo: 'na verdade sou dentista' }] }), true);
  assert.equal(saudeDaSessao({ briefing: { negocio: { segmento: 'beleza' } }, mensagens: [] }), false);
});

test('o aviso de saúde ao modelo diz que não fecha pelo site, sem prazo dos modelos, sem Pix, e sem nome de ninguém; advocacia não recebe', () => {
  const a = avisoRegulado(nichoRegulado('clínica de fisioterapia'));
  assert.equal(a.fechamento, FECHAMENTO_SAUDE);
  assert.match(FECHAMENTO_SAUDE, /não fecha/);
  assert.match(FECHAMENTO_SAUDE, /WhatsApp/);
  assert.equal(avisoRegulado(nichoRegulado('sou advogado')).fechamento, undefined);
  for (const t of [FECHAMENTO_SAUDE, SAUDE_COM_A_EQUIPE]) assert.doesNotMatch(t, /Fernando/);
  const pagina = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../../js/orcamento-detalhes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(pagina, /Fernando/);
});

test('saúde: o pedido entra, mas sem modelos automáticos, sem entrada e sem Pix, nem insistindo', async () => {
  const { n, c, e } = await atePedido(TEXTO_DENTISTA);
  assert.equal(e.pedido.status, 'confirmado', 'o pedido entra (o contato fica com a equipe)');
  assert.equal(e.saude_com_a_equipe, true);
  assert.equal(e.modo_direcoes, 'manual', 'a página segue como a fila manual: nada de geração na hora');
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  assert.equal(g.status, 200, JSON.stringify(g.corpo));
  for (const d of g.corpo.direcoes) {
    const r = await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
    assert.equal(r.corpo.status, 'na_fila', 'nenhum modelo de saúde sai sozinho');
  }
  for (let i = 0; i < 3; i++) {
    const pg = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
    assert.equal(pg.status, 409);
    assert.equal(pg.corpo.erro, SAUDE_COM_A_EQUIPE);
  }
  const tentativas = await local.db.query('select 1 from app.tentativas_pagamento t join app.pagamentos p on p.id = t.pagamento_id join app.propostas pr on pr.id = p.proposta_id where pr.conversa_id = $1', [c]);
  assert.equal(tentativas.rows.length, 0, 'nenhuma tentativa de pagamento criada');
});

test('saúde: o escopo e a confirmação também recusam; o restante depois da entrada não trava', async () => {
  const { n, c } = await atePedido(TEXTO_DENTISTA);
  const esc = await n.chamar('POST', 'escopo', { conversa_id: c });
  assert.equal(esc.status, 409);
  assert.equal(esc.corpo.erro, SAUDE_COM_A_EQUIPE);
  const conf = await n.chamar('POST', 'confirmar', { conversa_id: c, proposta_id: '00000000-0000-4000-8000-000000000000', confirmo: true });
  assert.equal(conf.status, 409);
  assert.equal(conf.corpo.erro, SAUDE_COM_A_EQUIPE);
  /* depois da entrada (etapa em produção) a trava não vale: o restante segue pelo site */
  await local.db.transaction(async (tx) => { await tx.exec("set local bz.transicao_livre = 'on'"); await tx.query("update app.conversas set etapa = 'em_producao' where id = $1", [c]); });
  const pg = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
  assert.notEqual(pg.corpo.erro, SAUDE_COM_A_EQUIPE, 'em produção, a recusa (se houver) é a do restante, não a da saúde');
});

test('nicho comum: igual a antes (gera na hora no modo api e não leva o selo)', async () => {
  const { n, c, e } = await atePedido(TEXTO_PILATES);
  assert.equal(e.saude_com_a_equipe, undefined);
  assert.equal(e.modo_direcoes, 'api');
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  const r = await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: g.corpo.direcoes[0].id });
  assert.equal(r.corpo.status, 'pronta');
});

test('a página e o painel: o texto de saúde, sem prazo prometido, e o selo "Saúde: com o dono"', () => {
  const pag = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8');
  assert.match(pag, /saude_com_a_equipe === true/);
  assert.match(pag, /Os três modelos saem depois que a equipe conferir o seu pedido\./);
  assert.match(fs.readFileSync(new URL('../../js/orcamento-detalhes.js', import.meta.url), 'utf8'), /Na área da saúde a gente confere tudo antes de mandar os modelos, então falamos com você pelo WhatsApp\./);
  assert.match(fs.readFileSync(new URL('../../js/orcamento-preparo.js', import.meta.url), 'utf8'), /saude_com_a_equipe !== true/, 'sem o prazo de 24 horas úteis');
  assert.match(fs.readFileSync(new URL('../../js/painel-fila.js', import.meta.url), 'utf8'), /Saúde: com o dono/);
  assert.match(fs.readFileSync(new URL('../../api/painel.mjs', import.meta.url), 'utf8'), /saudeDaSessao\(\{ briefing: p\.briefing/);
});
