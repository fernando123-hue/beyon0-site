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

/* decisão do dono: a landing com páginas extras saía mais cara que o institucional. Com 3 páginas ou mais, o pacote
   vira institucional (que já traz 5); a tela recebe o aviso da troca. Os valores vêm da tabela, não daqui */
const TABELA = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const LANDING = TABELA.formatos.landing_page.base, INSTITUCIONAL = TABELA.formatos.institucional.base, PAGINA = TABELA.adicionais.pagina_extra.valor;

test('landing com 3 páginas ou mais vira institucional, com o aviso; com 2 páginas continua landing', async () => {
  const n = navegador(), c = await n.iniciar();
  const tres = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, formato: 'landing_page', extras: { pagina_extra: 2 } });
  assert.equal(tres.status, 200, JSON.stringify(tres.corpo));
  assert.equal(tres.corpo.estimativa.valor_total, INSTITUCIONAL, 'as 3 páginas cabem nas 5 do institucional: sem página extra');
  assert.equal(tres.corpo.recomendacao.trocou_para_institucional, true);
  assert.ok(!tres.corpo.estimativa.itens.some(i => /página extra/i.test(i.nome)));
  const duas = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, formato: 'landing_page', extras: { pagina_extra: 1 } });
  assert.equal(duas.corpo.estimativa.valor_total, LANDING + PAGINA);
  assert.equal(duas.corpo.recomendacao.trocou_para_institucional, false);
  /* além das 5 do institucional, as páginas a mais seguem como extra: landing + 6 extras = 7 páginas = institucional + 2 */
  const sete = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, formato: 'landing_page', extras: { pagina_extra: 6 } });
  assert.equal(sete.corpo.estimativa.valor_total, INSTITUCIONAL + 2 * PAGINA);
  /* e o que se grava é o institucional, com o briefing do formato trocado */
  const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, formato: 'landing_page', extras: { pagina_extra: 2 }, versao: tres.corpo.versao });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.estimativa.valor_total, INSTITUCIONAL);
  const conv = (await local.db.query('select briefing from app.conversas where id = $1', [c])).rows[0];
  assert.equal(conv.briefing.projeto.formato, 'institucional');
});

test('a confiança gravada é a do servidor, nunca a do corpo', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao, confianca: 1 });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  const conv = (await local.db.query('select confianca from app.conversas where id = $1', [c])).rows[0];
  assert.equal(Number(conv.confianca), 0.4);
});
