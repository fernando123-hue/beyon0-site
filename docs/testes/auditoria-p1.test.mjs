/* P1 da auditoria do Harness (06 Operação/Auditoria do Harness — 2026-10-07.md): a máquina de estados da conversa
   num lugar só (privado.transicoes_conversa + gatilho), e o registro das chamadas de IA (app.ia_chamadas).
   Banco real (PGlite + migrations).  npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { ErroIA } from '../../api/_ia/provedor.mjs';
import { executar as rotinas } from '../../api/rotinas.mjs';
import { semPrecoNoTexto } from '../../api/_vendas/seguranca.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';
/* segredo do cron nos testes: 40 caracteres de baixa entropia (uma string "aleatória" vira falso positivo no gitleaks) */
const SEGREDO_CRON_TESTE = 'teste'.repeat(8);

let local;
before(async () => { local = await montarLocal({ base: 'http://127.0.0.1:8899' }); });

async function conversaNova() {
  const v = (await local.auth.criar()).visitante_id;
  return (await local.rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v })).conversa_id;
}
const mudarEtapa = (id, etapa) => local.db.query('update app.conversas set etapa = $2 where id = $1', [id, etapa]);

test('P1 transições: pular etapa direto no banco é recusado, venha de onde vier', async () => {
  const c = await conversaNova();
  await assert.rejects(mudarEtapa(c, 'em_producao'), e => /transição de etapa/.test(e.message), 'descoberta → em produção');
  await assert.rejects(mudarEtapa(c, 'aguardando_pagamento'), e => /transição de etapa/.test(e.message));
  await mudarEtapa(c, 'estimativa');   /* (a transição legítima passa) */
  await mudarEtapa(c, 'estimativa');   /* (não mudar não é transição) */
  await assert.rejects(mudarEtapa(c, 'descoberta'), e => /transição de etapa/.test(e.message), 'não volta');
});

test('P1 transições: a tabela é o lugar único e cobre o fluxo inteiro', async () => {
  const t = (await local.db.query('select de, para from privado.transicoes_conversa')).rows.map(r => r.de + '→' + r.para);
  for (const esperada of ['descoberta→estimativa', 'estimativa→contato', 'contato→gerando', 'gerando→direcoes', 'direcoes→escolhida',
    'escolhida→alteracoes', 'alteracoes→escopo', 'escopo→aguardando_pagamento', 'aguardando_pagamento→em_producao'])
    assert.ok(t.includes(esperada), 'falta ' + esperada);
  assert.ok(!t.includes('alteracoes→gerando'), 'gerar de novo depois do ajuste continua fechado (P0)');
});

/* ---------- o registro das chamadas de IA (ledger) e o id de correlação ---------- */
async function navegar(deps) {
  let token = null;
  return async (metodo, acao, corpo) => {
    const r = await atender(new Request('http://127.0.0.1:8899/api/vendas?acao=' + acao, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': '192.0.2.' + Math.floor(Math.random() * 250), ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    const j = await r.json();
    if (acao === 'sessao') token = j.token;
    return { status: r.status, corpo: j, id: r.headers.get('x-request-id') };
  };
}

test('P1 ledger: cada chamada ao modelo fica registrada com o id do pedido (sucesso e falha), sem conteúdo', async () => {
  const deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE };
  const n = await navegar(deps);
  const s = await n('POST', 'sessao', {});
  assert.match(s.id || '', /^[0-9a-f-]{36}$/, 'toda resposta leva o x-request-id');
  const m = await n('POST', 'mensagem', { conversa_id: s.corpo.conversa_id, texto: 'Tenho uma clínica odontológica em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.' });
  assert.equal(m.status, 200);
  const linhas = (await local.db.query('select * from app.ia_chamadas where request_id = $1', [m.id])).rows;
  assert.ok(linhas.length >= 1, 'o turno deixou registro');
  assert.equal(linhas[0].papel, 'conversa');
  assert.equal(linhas[0].conversa_id, s.corpo.conversa_id);
  assert.ok(linhas.some(l => (l.ferramentas || []).includes('estimar')), 'as ferramentas pedidas ficam (o porquê do preço)');
  assert.ok(!JSON.stringify(linhas).includes('Niterói'), 'sem o texto da pessoa');
  const quebrada = { ...deps, ia: { mensagem: async () => { throw new ErroIA('tempo', 'tempo esgotado', 0.07); } } };
  const n2 = await navegar(quebrada);
  const s2 = await n2('POST', 'sessao', {});
  const f = await n2('POST', 'mensagem', { conversa_id: s2.corpo.conversa_id, texto: 'oi, quero um site' });
  assert.equal(f.status, 503);
  const erro = (await local.db.query('select erro, custo_usd::float custo from app.ia_chamadas where request_id = $1', [f.id])).rows[0];
  assert.deepEqual(erro, { erro: 'tempo', custo: 0.07 }, 'a falha também fica, com o custo');
});

/* ---------- alertas: a rotina diária confere a saúde, grava e avisa o dono (ntfy.sh, grátis, sem conta) ---------- */
test('P1 ledger: apagar o visitante (LGPD) apaga a conversa mesmo com chamadas de IA registradas', async () => {
  const c = await conversaNova();
  const vid = (await local.db.query('select visitante_id from app.conversas where id = $1', [c])).rows[0].visitante_id;
  await local.rpc('vendas_registrar_ia', { conversa_id: c, visitante_id: vid, chamadas: [{ papel: 'conversa', parada: 'fim', custo_usd: 0.01, ms: 5 }] });
  await local.db.query('delete from auth.users where id = $1', [vid]);
  assert.equal((await local.db.query('select count(*)::int n from app.conversas where id = $1', [c])).rows[0].n, 0, 'a conversa saiu');
  assert.equal((await local.db.query('select count(*)::int n from app.ia_chamadas where conversa_id = $1', [c])).rows[0].n, 1, 'o número fica (sem dado pessoal)');
  await assert.rejects(local.db.query('delete from app.ia_chamadas where conversa_id = $1', [c]), e => /não se altera nem se apaga/.test(e.message));
});

test('P1 alertas: pagamento que pede uma pessoa e teto de IA perto do fim viram alerta, gravado e enviado uma vez por dia', async () => {
  const org = (await local.db.query(`select id from app.organizacoes where slug = 'beyon-zero'`)).rows[0].id;
  await local.db.query(`insert into app.pagamentos_auditoria (org_id, evento, origem) values ($1, 'payment.divergence', 'operacao')`, [org]);
  const c = await conversaNova();
  const vidC = (await local.db.query('select visitante_id from app.conversas where id = $1', [c])).rows[0].visitante_id;
  await local.rpc('vendas_registrar_ia', { conversa_id: c, visitante_id: vidC, chamadas: [{ papel: 'geracao', parada: 'fim', custo_usd: 21, ms: 9 }] });   /* (o gasto das últimas 24 h vem do registro) */
  const enviados = [];
  const env = { CRON_SECRET: SEGREDO_CRON_TESTE, ALERTA_NTFY_TOPICO: 'beyon-alertas-teste-0123456789' };
  const pedir = () => rotinas(new Request('http://x/api/rotinas?acao=diaria', { headers: { authorization: 'Bearer ' + SEGREDO_CRON_TESTE } }), env,
    { banco: local.rpc, enviarAlerta: async (topico, texto) => enviados.push({ topico, texto }) });
  const r = await (await pedir()).json();
  const tipos = r.saude.alertas.map(a => a.tipo);
  assert.ok(tipos.includes('pagamento_atencao') && tipos.includes('teto_ia'), JSON.stringify(r.saude));
  assert.equal(enviados.length, 1, 'um aviso só, com o resumo');
  assert.equal(enviados[0].topico, env.ALERTA_NTFY_TOPICO);
  assert.match(enviados[0].texto, /pagamento/i);
  await pedir();
  assert.equal(enviados.length, 1, 'a mesma rotina no mesmo dia não repete o aviso');
  const painel = await local.rpc('rotinas_painel', { org_slug: 'beyon-zero' });
  assert.ok(painel.ultima_rotina, 'o painel sabe quando a rotina rodou (silêncio não parece saúde)');
  assert.ok(painel.alertas.some(a => a.tipo === 'pagamento_atencao'));
});

test('P1 rotina: etapa que falha vira alerta urgente e as outras seguem (envio do aviso que falha não derruba a rotina)', async () => {
  const env = { CRON_SECRET: SEGREDO_CRON_TESTE, ALERTA_NTFY_TOPICO: 'beyon-alertas-teste-0123456789' };
  const quebraRetencao = (nome, p) => nome === 'vendas_reter' ? Promise.reject(Object.assign(new Error('x'), { codigo: '08006' })) : local.rpc(nome, p);
  const r = await (await rotinas(new Request('http://x/api/rotinas?acao=diaria', { headers: { authorization: 'Bearer ' + SEGREDO_CRON_TESTE } }), env,
    { banco: quebraRetencao, enviarAlerta: async () => { throw new Error('ntfy fora'); } })).json();
  assert.equal(r.ok, false);
  assert.ok(r.saude.alertas.some(a => a.tipo === 'rotina_falhou' && a.nivel === 'urgente'), JSON.stringify(r.saude.alertas));
});

test('P1 ledger: a geração registra a chamada (papel geracao); o ajuste por opção pronta não chama modelo nenhum', async () => {
  const deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE };
  const n = await navegar(deps);
  const s = await n('POST', 'sessao', {});
  const c = s.corpo.conversa_id;
  await n('POST', 'mensagem', { conversa_id: c, texto: 'Tenho uma clínica e quero um site institucional para agendamentos' });
  await n('POST', 'mensagem', { conversa_id: c, texto: 'sim' });
  await detalhesEConfirmar(n, local.rpc, c);
  const g = await n('POST', 'gerar', { conversa_id: c });
  for (const d of g.corpo.direcoes) await n('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  assert.ok((await local.db.query(`select 1 from app.ia_chamadas where conversa_id = $1 and papel = 'geracao'`, [c])).rows.length, 'a geração registrou');
  await n('POST', 'escolher', { conversa_id: c, direcao_id: g.corpo.direcoes[0].id });
  const a = await n('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'mover_antes_de', secao: 'depoimentos', referencia: 'servicos' } });
  assert.equal(a.status, 200, JSON.stringify(a.corpo));
  assert.equal((await local.db.query(`select count(*)::int n from app.ia_chamadas where conversa_id = $1 and papel = 'extracao'`, [c])).rows[0].n, 0, 'o ajuste não chamou modelo');
});

test('P1 dinheiro por extenso também sai do texto do agente', () => {
  for (const t of ['fica em dois mil e quinhentos reais', 'uns três mil reais', 'Custa cinco mil reais.', 'um milhão de reais'])
    assert.ok(!/reais/i.test(semPrecoNoTexto(t)), t + ' → ' + semPrecoNoTexto(t));
  assert.equal(semPrecoNoTexto('são dois sites e três páginas'), 'são dois sites e três páginas', 'número que não é dinheiro fica');
});

/* ---------- disjuntor (por último no arquivo: ele abre para a organização inteira) ---------- */
test('P1 disjuntor: 5 falhas seguidas da IA em 10 min param as chamadas e oferecem o WhatsApp; 4 não', async () => {
  let chamadas = 0;
  const base = criarSimulada();
  const deps = { banco: local.rpc, visitantes: local.auth, direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, ia: { ...base, mensagem: p => { chamadas++; return base.mensagem(p); } } };
  const n = await navegar(deps);
  const s = await n('POST', 'sessao', {});
  const vid = (await local.db.query('select visitante_id from app.conversas where id = $1', [s.corpo.conversa_id])).rows[0].visitante_id;
  const outra = await conversaNova();
  const vidOutra = (await local.db.query('select visitante_id from app.conversas where id = $1', [outra])).rows[0].visitante_id;
  const falhar = (k, erro = 'indisponivel', conversa = s.corpo.conversa_id, visit = vid) => local.rpc('vendas_registrar_ia', { conversa_id: conversa, visitante_id: visit, chamadas: Array.from({ length: k }, () => ({ papel: 'conversa', erro, custo_usd: 0, ms: 1 })) });
  await local.rpc('vendas_registrar_ia', { conversa_id: s.corpo.conversa_id, visitante_id: vid, chamadas: [{ papel: 'conversa', parada: 'fim', custo_usd: 0, ms: 1 }] });   /* (uma que deu certo: as falhas de outros testes não contam) */
  await falhar(4);
  assert.equal((await n('POST', 'mensagem', { conversa_id: s.corpo.conversa_id, texto: 'Tenho uma loja e quero um site' })).status, 200, '4 falhas: segue chamando');
  await falhar(5);
  assert.equal((await n('POST', 'mensagem', { conversa_id: s.corpo.conversa_id, texto: 'quero vender online' })).status, 200, '5 falhas de UMA conversa só não derrubam o agente de todos');
  await falhar(5, 'entrada', outra, vidOutra);
  assert.equal((await n('POST', 'mensagem', { conversa_id: s.corpo.conversa_id, texto: 'e entregar em casa' })).status, 200, 'erro de entrada (4xx do conteúdo) não conta');
  await falhar(3, 'indisponivel', outra, vidOutra);
  await falhar(2);
  const antes = chamadas;
  const r = await n('POST', 'mensagem', { conversa_id: s.corpo.conversa_id, texto: 'quero vender online' });
  assert.equal(r.status, 503);
  assert.equal(r.corpo.whatsapp, true);
  assert.equal(chamadas, antes, 'com o disjuntor aberto, o modelo não é chamado');
  /* depois de 10 minutos as falhas saem da janela e a IA volta sozinha (meio aberto) */
  await local.db.exec(`alter table app.ia_chamadas disable trigger ia_chamadas_so_acrescimo;
    update app.ia_chamadas set created_at = created_at - interval '11 minutes';
    alter table app.ia_chamadas enable trigger ia_chamadas_so_acrescimo;`);
  assert.equal((await n('POST', 'mensagem', { conversa_id: s.corpo.conversa_id, texto: 'e entregar no bairro' })).status, 200, 'o disjuntor não fica preso');
});

test('P1 transições: montar cenário de teste ou manutenção à mão exige licença explícita, numa transação', async () => {
  const c = await conversaNova();
  await local.db.exec(`begin; set local bz.transicao_livre = 'on'; update app.conversas set etapa = 'em_producao' where id = '${c}'; commit;`);
  assert.equal((await local.db.query('select etapa from app.conversas where id = $1', [c])).rows[0].etapa, 'em_producao');
  await assert.rejects(mudarEtapa(c, 'descoberta'), e => /transição de etapa/.test(e.message), 'a licença acabou com a transação');
});
