/* O orçamento sem IA pela API (/api/vendas), com o banco real (PGlite + migrations) e SEM IA (deps.ia = null).
   Spec: docs/specs/2026-10-11-orcamento-sem-ia.md §1–§3 e §7. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { modoDirecoes } from '../../api/_ia/config.mjs';

let local, deps, ipSeq = 0;
const BASE = 'http://127.0.0.1:8899';
before(async () => { local = await montarLocal({ base: BASE }); deps = { banco: local.rpc, visitantes: local.auth, ia: null }; });

function navegador() {
  const ip = '198.51.100.' + (200 + (++ipSeq));
  let token = null;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const RESP = { ramo: 'saude', cidade: 'Goiânia', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };

test('sem IA: simular recomenda e calcula pelo motor, sem gravar nada', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  assert.equal(s.status, 200, JSON.stringify(s.corpo));
  assert.equal(s.corpo.recomendacao.formato, 'institucional');
  assert.equal(s.corpo.estimativa.valor_total, 3950, 'institucional 3500 + agendamento 450, pela tabela');
  assert.ok(s.corpo.versao);
  assert.equal((await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n, 0, 'simular não grava');
});

test('o navegador não manda preço nem complexidade: valores do corpo são ignorados ou recusados', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, valor_total: 1, complexidade: 'normal', extras: { agendamento: 1 } });
  assert.equal(s.corpo.estimativa.valor_total, 3950);
  const alta = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, fatores: { complexidade: 'alta' } });
  assert.equal(alta.corpo.estimativa.valor_total, 3950, 'complexidade nunca vem do corpo');
  const dep = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, extras: { area_documentos: 1 } });
  assert.equal(dep.status, 400, 'dependente sem o item de que depende: recusado com motivo');
  assert.match(dep.corpo.erro, /área restrita/i);
  const fora = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, extras: { sistema_sob_medida: 1 } });
  assert.equal(fora.status, 200);
  assert.equal(fora.corpo.estimativa, null);
  assert.ok(fora.corpo.diagnostico, 'fora do automático: fale comigo, sem preço');
  assert.ok(!JSON.stringify(fora.corpo).includes('sob medida'), 'o nome de tela do catálogo, não o da tabela');
});

test('confirmar-pacote grava uma vez, com a versão da tabela; versão velha → 409 com a nova; depois do contato → 409', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  const velha = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: '00000000-0000-4000-8000-000000000000' });
  assert.equal(velha.status, 409);
  assert.equal(velha.corpo.versao_nova, s.corpo.versao);
  const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.estimativa.valor_total, 3950);
  const conv = (await local.db.query('select etapa, briefing, turnos from app.conversas where id = $1', [c])).rows[0];
  assert.equal(conv.etapa, 'estimativa');
  assert.equal(conv.briefing.negocio.cidade, 'Goiânia');
  assert.equal(conv.turnos, 0);
  assert.equal((await n.chamar('POST', 'contato', { conversa_id: c, nome: 'Ana', telefone: '(62) 99999-0000', aceite: true })).status, 200);
  assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao })).status, 409, 'depois do contato o pacote não muda por aqui');
});

test('catálogo com sessão e sem nada interno; sessao-config diz se há consultor', async () => {
  const n = navegador(), c = await n.iniciar();
  const cat = await n.chamar('GET', 'catalogo', undefined, '&conversa=' + c + '&formato=institucional&ramo=saude');
  assert.equal(cat.status, 200);
  assert.ok(!JSON.stringify(cat.corpo).includes('prioridade'));
  const semToken = await atender(new Request(BASE + '/api/vendas?acao=catalogo&conversa=' + c), {}, 'GET', deps);
  assert.equal(semToken.status, 401);
  const cfg = await atender(new Request(BASE + '/api/vendas?acao=sessao-config'), {}, 'GET', deps);
  assert.equal((await cfg.json()).consultor, false);
});

test('BZ_SEM_CONSULTOR desliga o consultor da tela só no servidor local, nunca na Vercel', async () => {
  const comIA = { ...deps, ia: {} };
  const cfg = async env => (await (await atender(new Request(BASE + '/api/vendas?acao=sessao-config'), env, 'GET', comIA)).json()).consultor;
  assert.equal(await cfg({}), true, 'com IA: há consultor');
  assert.equal(await cfg({ BZ_LOCAL: '1', BZ_SEM_CONSULTOR: '1' }), false, 'local com a chave: a tela sem consultor');
  assert.equal(await cfg({ BZ_SEM_CONSULTOR: '1' }), true, 'sem BZ_LOCAL: a chave não vale');
  assert.equal(await cfg({ BZ_LOCAL: '1', BZ_SEM_CONSULTOR: '1', VERCEL: '1', VERCEL_ENV: 'production' }), true, 'na Vercel: a chave não vale');
});

test('sem chave da Anthropic, os modelos saem sempre pela fila manual', () => {
  assert.equal(modoDirecoes({}), 'manual');
  assert.equal(modoDirecoes({ BZ_DIRECOES: 'api' }), 'manual', 'sem chave, mesmo pedindo api');
  assert.equal(modoDirecoes({ ANTHROPIC_API_KEY: 'x', BZ_DIRECOES: 'api' }), 'api');
  assert.equal(modoDirecoes({ ANTHROPIC_API_KEY: 'x', BZ_DIRECOES: 'manual' }), 'manual');
  assert.equal(modoDirecoes({ BZ_IA: 'simulada' }), 'api', 'o simulador local segue gerando');
  /* a mesma condição de criarIA: na produção da Vercel o simulador nunca liga, então sem chave é fila manual */
  assert.equal(modoDirecoes({ BZ_IA: 'simulada', VERCEL: '1', VERCEL_ENV: 'production' }), 'manual');
  assert.equal(modoDirecoes({ BZ_IA: 'simulada', VERCEL: '1', VERCEL_ENV: 'preview' }), 'api');
});

/* decisão do dono (2026-10-12): a landing page vai até 3 páginas (até 2 extras); de 4 em diante, só o site com várias
   páginas. Nada troca sozinho: o servidor recusa e diz qual formato serve. Os valores vêm da tabela, não daqui */
const TABELA = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const LANDING = TABELA.formatos.landing_page.base, PAGINA = TABELA.adicionais.pagina_extra.valor;

test('landing com até 2 páginas extras: continua landing, pelo preço da tabela', async () => {
  const n = navegador(), c = await n.iniciar();
  const tres = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, formato: 'landing_page', extras: { pagina_extra: 2 } });
  assert.equal(tres.status, 200, JSON.stringify(tres.corpo));
  assert.equal(tres.corpo.estimativa.valor_total, LANDING + 2 * PAGINA, 'a landing + 2 páginas extras, pela tabela');
  assert.ok(!('trocou_para_institucional' in tres.corpo.recomendacao), 'nada troca de formato sozinho');
  const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, formato: 'landing_page', extras: { pagina_extra: 2 }, versao: tres.corpo.versao });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.estimativa.valor_total, LANDING + 2 * PAGINA);
  const conv = (await local.db.query('select briefing from app.conversas where id = $1', [c])).rows[0];
  assert.equal(conv.briefing.projeto.formato, 'landing_page');
});

test('landing com 3 páginas extras ou mais: recusada, com o formato que serve', async () => {
  const n = navegador(), c = await n.iniciar();
  for (const acao of ['simular', 'confirmar-pacote']) {
    const r = await n.chamar('POST', acao, { conversa_id: c, respostas: RESP, formato: 'landing_page', extras: { pagina_extra: 3 }, versao: 'x' });
    assert.equal(r.status, 400, acao + ': ' + JSON.stringify(r.corpo));
    assert.equal(r.corpo.formato_sugerido, 'institucional');
    assert.match(r.corpo.erro, /até 3 páginas/);
  }
  assert.equal((await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n, 0, 'nada gravado');
});

test('o catálogo da landing oferece no máximo 2 páginas extras; o do institucional, o da tabela', async () => {
  const n = navegador(), c = await n.iniciar();
  const pagina = async formato => (await n.chamar('GET', 'catalogo', undefined, '&conversa=' + c + '&formato=' + formato + '&ramo=saude')).corpo.extras.principais.find(x => x.chave === 'pagina_extra');
  assert.equal((await pagina('landing_page')).max, 2);
  assert.equal((await pagina('institucional')).max, TABELA.adicionais.pagina_extra.max);
});

test('os itens do cartão trazem a chave do extra (a tela casa pela chave, não pelo nome)', async () => {
  const n = navegador(), c = await n.iniciar();
  /* (institucional 8 + agendamento 1 + blog 2 passa do teto de 10 dias: o blog vai para a fase seguinte) */
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, extras: { blog: 1 } });
  assert.equal(s.status, 200, JSON.stringify(s.corpo));
  assert.deepEqual(s.corpo.estimativa.itens.map(i => i.chave), ['agendamento']);
  assert.deepEqual(s.corpo.estimativa.fase_seguinte.itens.map(i => i.chave), ['blog']);
});

test('a confiança gravada é a do servidor, nunca a do corpo', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao, confianca: 1 });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  const conv = (await local.db.query('select confianca from app.conversas where id = $1', [c])).rows[0];
  assert.equal(Number(conv.confianca), 0.4);
});
