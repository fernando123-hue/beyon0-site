/* OS AJUSTES SEM IA no banco (PR 3a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §4 e §7): a opção pronta (sem preço,
   com a versão aplicada, teto de 30), desfazer (o aplicado mais recente; a versão final ignora o desfeito), o pedido livre
   (até 3, na fila, sem operações) e o lado do dono (lista, "feito" com a base que ele baixou, "recusado", nada depois da
   etapa de ajustes). Postgres de verdade (PGlite) com as migrations reais. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { novoBanco, como, erroDe } from './_banco.mjs';
import { telefoneE164DeTeste } from './_pedido.mjs';

const ORG = '99999999-0000-4000-8000-000000000099';
const REGRAS = 'dddddddd-0000-4000-8000-0000000000d0';
let db;
const rpc = (nome, p) => como(db, 'service_role', q => q(`select app.${nome}($1::jsonb) as r`, [JSON.stringify(p)])).then(x => x.rows[0].r);
const hex = s => createHash('sha256').update(String(s)).digest('hex');
const um = async (sql, params) => (await db.query(sql, params)).rows[0];
/* o código SQLSTATE de uma chamada que deve falhar (erroDe devolve { codigo, msg } ou null) */
const codigoDe = async promessa => (await erroDe(promessa))?.codigo;

before(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into app.organizacoes (id, slug, nome) values ('${ORG}', 'beyon-zero', 'Beyon Zero');
    insert into app.organizacoes (id, slug, nome) values ('99999999-0000-4000-8000-000000000098', 'outra', 'Outra');
    insert into app.regras_comerciais (id, org_id, versao, status, regras, aprovada_em) values ('${REGRAS}', '${ORG}', 1, 'ativa', '{"moeda":"BRL"}', now());
  `);
});

async function forcarEtapa(conversa, etapa) {
  await db.transaction(async tx => {
    await tx.exec("set local bz.transicao_livre = 'on'");
    await tx.query('update app.conversas set etapa = $1 where id = $2', [etapa, conversa]);
  });
}
/* um pedido confirmado (a confirmação já cria as três direções "gerando") */
async function pedidoPronto() {
  const v = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [v]);
  const c = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: v, origem_meio: 'direto' })).conversa_id;
  const base = { conversa_id: c, visitante_id: v };
  await rpc('vendas_registrar_estimativa', { ...base, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 });
  const telefone = telefoneE164DeTeste();
  /* (a função BASE, sem a confirmação automática: estes testes confirmam à mão e testam o que vem depois) */
  const d = (await db.query('select app.vendas_registrar_detalhes_base($1::jsonb) as r', [JSON.stringify({ ...base, telefone, telefone_hash: hex('tel|' + telefone), nome: 'Ana Souza', aceite: true,
    briefing: { negocio: { nome: 'Clínica Sol', descricao: 'Consultas e exames' } }, redes: {}, suspeito: false, chave_ip: null, max_por_ip: 3, max_por_telefone_dia: 2, teto_fila: 1000, horas: 72 })])).rows[0].r;
  assert.equal(d.ok, true, JSON.stringify(d));
  await rpc('vendas_confirmar_whatsapp', { org_slug: 'beyon-zero', conversa_id: c });
  return { ...base, codigo: d.codigo };
}
async function comDirecoesProntas(b) {
  await forcarEtapa(b.conversa_id, 'direcoes');
  await db.query(`update app.direcoes set status = 'pronta', conteudo = jsonb_build_object('nome_conceito', 'Modelo ' || numero) where conversa_id = $1`, [b.conversa_id]);
}
const dele = b => ({ conversa_id: b.conversa_id, visitante_id: b.visitante_id });
/* o pedido com as três prontas e o modelo 1 escolhido (etapa "escolhida") */
async function escolhido() {
  const b = await pedidoPronto();
  await comDirecoesProntas(b);
  const d = await um('select id from app.direcoes where conversa_id = $1 and numero = 1', [b.conversa_id]);
  await rpc('vendas_escolher', { ...dele(b), direcao_id: d.id });
  return { ...b, direcao_id: d.id };
}
const VERSAO = n => ({ nome_conceito: 'Versão ' + n, secoes: [] });
const estado = b => rpc('vendas_estado', dele(b));
/* a opção pronta, sobre a versão de agora (a base é o ajuste aplicado mais recente que o estado mostra, como faz a API) */
const opcao = async (b, n = 1, extra = {}) => rpc('vendas_registrar_alteracao', { ...dele(b), direcao_id: b.direcao_id, pedido: 'Cores do modelo 2',
  mudancas: [{ operacao: 'usar_paleta_de', direcao: 2, aplicada: true }], resultado: VERSAO(n), origem: 'opcao', base_id: (await estado(b)).ajuste_atual, ...extra });
const livre = (b, texto = 'Quero o mapa no rodapé') => rpc('vendas_pedido_livre', { ...dele(b), texto });
const desfazer = b => rpc('vendas_desfazer_alteracao', dele(b));
const resolver = (id, extra) => rpc('vendas_resolver_pedido_livre', { org_slug: 'beyon-zero', alteracao_id: id, ...extra });
const ETAPAS_FORA = ['descoberta', 'estimativa', 'contato', 'gerando', 'direcoes', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada'];
const lista = async () => (await rpc('vendas_pedidos_livres', { org_slug: 'beyon-zero' })).itens;

test('opção pronta: grava com a origem e a data da aplicação; sem a versão, com preço ou com outra origem, 22023; sem origem ou com origem "ia" também (a porta antiga fechou: auditoria run-1)', async () => {
  const b = await escolhido();
  const r = await opcao(b);
  assert.equal(r.status, 'aplicada');
  const linha = await um('select origem, status, aplicada_em from app.alteracoes where id = $1', [r.alteracao_id]);
  assert.equal(linha.origem, 'opcao');
  assert.ok(linha.aplicada_em, 'a data da aplicação');
  assert.equal(await codigoDe(opcao(b, 2, { resultado: null })), '22023', 'sem a versão aplicada');
  assert.equal(await codigoDe(opcao(b, 2, { estimativa: { regras_id: REGRAS, fatores: {}, valor_total: 1, sinal: 1, prazo_dias: 1 } })), '22023', 'opção pronta nunca muda o preço');
  assert.equal(await codigoDe(opcao(b, 2, { origem: 'livre' })), '22023', 'o pedido livre tem a função dele');
  assert.equal(await codigoDe(opcao(b, 2, { origem: 'qualquer' })), '22023');
  assert.equal((await estado(b)).ajuste_atual, r.alteracao_id, 'o estado diz qual é a base de agora');
  assert.equal(await codigoDe(opcao(b, 2, { base_id: null })), '40001', 'opção montada sobre uma versão velha (outra aba, ou o dono no meio)');
  /* a porta antiga (o código da promoção anterior): sem origem valia 'ia', sem o teto de 30 e aceitando estimativa. Com a
     produção sem API não há código antigo a proteger, e o modelo chegava ao preço por aqui. Agora só a opção pronta grava */
  const antiga = { ...dele(b), direcao_id: b.direcao_id, pedido: 'quero tema claro', mudancas: [], resultado: VERSAO(3) };
  const estimativaDeIa = { regras_id: REGRAS, fatores: {}, valor_total: 1, sinal: 1, prazo_dias: 1 };
  const estimativas = async () => (await um('select count(*)::int n from app.estimativas where conversa_id = $1', [b.conversa_id])).n;
  const antes = await estimativas();
  assert.equal(await codigoDe(rpc('vendas_registrar_alteracao', antiga)), '22023', 'sem origem');
  assert.equal(await codigoDe(rpc('vendas_registrar_alteracao', { ...antiga, origem: 'ia' })), '22023', "origem 'ia'");
  assert.equal(await codigoDe(rpc('vendas_registrar_alteracao', { ...antiga, origem: 'ia', estimativa: estimativaDeIa })), '22023', "origem 'ia' com estimativa");
  assert.equal(await estimativas(), antes, 'nenhuma estimativa nova');
  assert.equal((await um("select count(*)::int n from app.alteracoes where conversa_id = $1 and origem <> 'opcao'", [b.conversa_id])).n, 0, 'nada gravado por outra origem');
  const e = await estado(b);
  assert.deepEqual(Object.keys(e.alteracoes[0]).sort(), ['created_at', 'id', 'mudancas', 'origem', 'pedido', 'status']);
});

test('teto: 30 opções prontas por conversa (as desfeitas contam); a 31ª é 23514', async () => {
  const b = await escolhido();
  for (let i = 1; i <= 30; i++) await opcao(b, i);
  assert.equal((await desfazer(b)).ok, true);
  assert.equal(await codigoDe(opcao(b, 31)), '23514');
  assert.equal((await um("select count(*)::int n from app.alteracoes where conversa_id = $1 and origem = 'opcao'", [b.conversa_id])).n, 30);
});

test('desfazer: o aplicado mais recente vira "desfeita"; a versão final ignora o desfeito; sem nada, ok:false; só na etapa "alteracoes"', async () => {
  const b = await escolhido();
  assert.equal(await codigoDe(desfazer(b)), '55000', 'na etapa "escolhida" ainda não há ajuste');
  const a1 = await opcao(b, 1), a2 = await opcao(b, 2);
  assert.deepEqual((await estado(b)).versao_final, VERSAO(2));
  assert.equal((await estado(b)).pode_desfazer, true);
  assert.deepEqual(await desfazer(b), { ok: true, alteracao_id: a2.alteracao_id });
  assert.deepEqual((await estado(b)).versao_final, VERSAO(1));
  assert.deepEqual(await desfazer(b), { ok: true, alteracao_id: a1.alteracao_id });
  const e = await estado(b);
  assert.equal(e.versao_final, null, 'sem ajuste aplicado, a prévia volta ao modelo escolhido');
  assert.equal(e.ajuste_atual, null);
  assert.equal(e.pode_desfazer, false);
  assert.equal(e.conversa.etapa, 'alteracoes', 'a etapa fica: a troca de modelo continua travada (o aviso disse isso)');
  assert.deepEqual(e.alteracoes.map(a => a.status), ['desfeita', 'desfeita']);
  assert.deepEqual(await desfazer(b), { ok: false });
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'ajuste_desfeito'", [b.conversa_id]));
  assert.equal(await codigoDe(rpc('vendas_escolher', { ...dele(b), direcao_id: b.direcao_id })), '55000', 'trocar de modelo continua recusado');
});

test('pedido livre: na fila, sem operações, leva a etapa a "alteracoes"; até 3 (23514); 1 a 300 caracteres sem controle (22023); só depois da escolha, antes do resumo e com o pedido confirmado (55000)', async () => {
  const b = await escolhido();
  const r = await livre(b);
  assert.equal(r.restantes, 2);
  const linha = await um('select origem, status, mudancas, pedido, resultado from app.alteracoes where id = $1', [r.alteracao_id]);
  assert.deepEqual(linha, { origem: 'livre', status: 'na_fila', mudancas: [], pedido: 'Quero o mapa no rodapé', resultado: null });
  const e = await estado(b);
  assert.equal(e.conversa.etapa, 'alteracoes', 'o pedido livre também trava a troca de modelo');
  assert.equal(e.versao_final, null, 'na fila não vira versão');
  for (const texto of ['', '   ', 'a\u0001b', 'x'.repeat(301), null]) assert.equal(await codigoDe(livre(b, texto)), '22023', JSON.stringify(texto));
  assert.equal((await livre(b, 'Segundo')).restantes, 1);
  assert.equal((await livre(b, 'Terceiro')).restantes, 0);
  assert.equal(await codigoDe(livre(b, 'Quarto')), '23514');
  const ev = await um("select dados from app.eventos_funil where conversa_id = $1 and tipo = 'pedido_livre' limit 1", [b.conversa_id]);
  assert.ok(ev && !JSON.stringify(ev.dados).includes('mapa'), 'o funil registra o pedido, nunca o texto');
  const c = await pedidoPronto();
  await comDirecoesProntas(c);
  assert.equal(await codigoDe(livre(c)), '55000', 'antes de escolher');
  const d = await escolhido();
  await forcarEtapa(d.conversa_id, 'escopo');
  assert.equal(await codigoDe(livre(d)), '55000', 'depois do resumo');
  const arq = await escolhido();
  await rpc('vendas_mudar_pedido', { org_slug: 'beyon-zero', conversa_id: arq.conversa_id, acao: 'arquivar' });
  assert.equal(await codigoDe(livre(arq)), '55000', 'pedido arquivado: ninguém atenderia (a fila do dono só tem confirmados)');
});

test('dono: a fila traz só pedido confirmado na etapa de ajustes, com o texto, a estratégia, a versão atual e a base', async () => {
  const b = await escolhido();
  const l1 = await livre(b);
  let item = (await lista()).find(i => i.alteracao_id === l1.alteracao_id);
  assert.ok(item, 'na fila');
  assert.equal(item.conversa_id, b.conversa_id);
  assert.equal(item.codigo, b.codigo);
  assert.equal(item.texto, 'Quero o mapa no rodapé');
  assert.equal(item.estrategia, 'conversao');
  assert.equal(item.base_id, null, 'nenhum ajuste aplicado: a base é o modelo escolhido');
  assert.deepEqual(item.versao, { nome_conceito: 'Modelo 1' });
  const a1 = await opcao(b, 1);
  item = (await lista()).find(i => i.alteracao_id === l1.alteracao_id);
  assert.equal(item.base_id, a1.alteracao_id);
  assert.deepEqual(item.versao, VERSAO(1));
  /* isolamento entre organizações (enquanto o pedido está na fila): a fila de outra organização não o enxerga (guarda
     a.org_id = v_org); slug que não existe é P0002 */
  const daOrg = await rpc('vendas_pedidos_livres', { org_slug: 'beyon-zero' });
  assert.ok(daOrg.total >= 1, 'a organização do pedido o vê');
  const deOutra = await rpc('vendas_pedidos_livres', { org_slug: 'outra' });
  assert.equal(deOutra.total, 0, 'outra organização: fila vazia');
  assert.deepEqual(deOutra.itens, []);
  assert.equal(await codigoDe(rpc('vendas_pedidos_livres', { org_slug: 'nao-existe' })), 'P0002', 'organização desconhecida');
  await rpc('vendas_mudar_pedido', { org_slug: 'beyon-zero', conversa_id: b.conversa_id, acao: 'arquivar' });
  assert.ok(!(await lista()).some(i => i.conversa_id === b.conversa_id), 'pedido arquivado sai da fila de ajustes');
});

test('dono: a fila traz no máximo 50 (os mais antigos primeiro) e o total é o da fila inteira', async () => {
  const b = await escolhido();
  const primeiro = await livre(b, 'Pedido mais antigo');
  /* 51 a mais direto na tabela (pelo fluxo seriam 51 conversas); saem no fim */
  await db.query(`insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, mudancas, status, origem)
    select org_id, conversa_id, direcao_id, 'extra ' || g, '[]', 'na_fila', 'livre' from app.alteracoes, generate_series(1, 51) g where id = $1`, [primeiro.alteracao_id]);
  try {
    const r = await rpc('vendas_pedidos_livres', { org_slug: 'beyon-zero' });
    assert.equal(r.itens.length, 50, 'a página é de 50');
    assert.ok(r.total >= 52, 'o total conta a fila inteira: ' + r.total);
    const meu = r.itens.find(i => i.alteracao_id === primeiro.alteracao_id);
    assert.ok(meu, 'o mais antigo está na página (a fila anda de frente para trás)');
    assert.equal(meu.versao.nome_conceito, 'Modelo 1', 'cada item leva a versão atual');
    assert.ok(!r.itens[0].texto.startsWith('extra '), 'os acrescentados depois vêm por último');
    assert.ok(r.itens.at(-1).texto.startsWith('extra '), 'e o corte cai neles');
  } finally { await db.query("delete from app.alteracoes where pedido like 'extra %'"); }
  assert.ok((await rpc('vendas_pedidos_livres', { org_slug: 'beyon-zero' })).total < 50, 'sem os extras, o total volta ao normal');
});

test('dono: "feito" com a base certa aplica e vale pela data de aplicação; base velha é 40001; "recusado" recusa; resolver de novo, ok:false', async () => {
  const b = await escolhido();
  const l1 = await livre(b), l2 = await livre(b, 'Quero o horário no topo');
  const a1 = await opcao(b, 1);   /* (feita DEPOIS do pedido livre: a versão do dono, aplicada depois, tem de valer) */
  assert.equal(await codigoDe(resolver(l1.alteracao_id, { acao: 'feito', resultado: VERSAO(9), base_id: null })), '40001', 'o dono baixou antes do ajuste do cliente');
  assert.deepEqual(await resolver(l1.alteracao_id, { acao: 'feito', resultado: VERSAO(9), base_id: a1.alteracao_id }), { ok: true, status: 'aplicada' });
  assert.deepEqual((await estado(b)).versao_final, VERSAO(9), 'pela data de aplicação, não pela do pedido');
  assert.deepEqual(await resolver(l1.alteracao_id, { acao: 'feito', resultado: VERSAO(10), base_id: l1.alteracao_id }), { ok: false, status: 'aplicada' });
  assert.deepEqual(await desfazer(b), { ok: false, motivo: 'dono' }, 'o trabalho do dono não se desfaz pelo botão do cliente');
  assert.equal((await estado(b)).pode_desfazer, false, 'e a tela sabe disso pelo estado');
  assert.deepEqual(await resolver(l2.alteracao_id, { acao: 'recusado' }), { ok: true, status: 'recusada' });
  assert.ok(await um("select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'pedido_livre_resolvido'", [b.conversa_id]));
  for (const extra of [{ acao: 'x' }, { acao: 'feito', resultado: 'texto' }, { acao: 'feito' }])
    assert.equal(await codigoDe(resolver(l1.alteracao_id, extra)), '22023', JSON.stringify(extra));
  assert.equal(await codigoDe(rpc('vendas_resolver_pedido_livre', { org_slug: 'outra', alteracao_id: l2.alteracao_id, acao: 'recusado' })), 'P0002');
  assert.equal(await codigoDe(resolver(a1.alteracao_id, { acao: 'recusado' })), 'P0002', 'só pedido livre se resolve por aqui');
});

test('dono: depois da etapa de ajustes (ou com o pedido encerrado) não resolve (55000) e o ajuste some da fila', async () => {
  const b = await escolhido();
  const l = await livre(b);
  for (const etapa of ETAPAS_FORA) {   /* (uma a uma: cada recusa desfaz a transação e o ajuste segue na fila) */
    await forcarEtapa(b.conversa_id, etapa);
    assert.ok(!(await lista()).some(i => i.alteracao_id === l.alteracao_id), etapa + ': fora da fila');
    for (const acao of ['feito', 'recusado'])
      assert.equal(await codigoDe(resolver(l.alteracao_id, { acao, resultado: VERSAO(1), base_id: null })), '55000', etapa + ' ' + acao);
  }
  assert.equal((await um('select status from app.alteracoes where id = $1', [l.alteracao_id])).status, 'na_fila');
  const d = await escolhido();
  const ld = await livre(d);
  await rpc('vendas_mudar_pedido', { org_slug: 'beyon-zero', conversa_id: d.conversa_id, acao: 'descartar' });
  assert.equal(await codigoDe(resolver(ld.alteracao_id, { acao: 'recusado' })), '55000', 'pedido descartado');
});

test('anon e authenticated não executam as funções novas', async () => {
  for (const papel of ['anon', 'authenticated']) {
    for (const f of ['vendas_desfazer_alteracao', 'vendas_pedido_livre', 'vendas_pedidos_livres', 'vendas_resolver_pedido_livre', 'vendas_registrar_alteracao']) {
      assert.equal(await codigoDe(como(db, papel, q => q(`select app.${f}('{}'::jsonb)`))), '42501', papel + ' ' + f);
    }
  }
});

/* (PR2b-avisado, PR2b1-escolher-trava) a ORDEM ÚNICA de travas: as direções por id, depois a conversa. O PGlite tem uma
   conexão só e a corrida não se reproduz aqui: prova-se a ordem no texto de cada função (falha se alguém inverter) e que
   elas continuam funcionando */
const fonteDe = async (esquema, nome) => (await um('select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2', [esquema, nome])).prosrc;
const vemAntes = (texto, a, b) => texto.indexOf(a) >= 0 && texto.indexOf(b) >= 0 && texto.indexOf(a) < texto.indexOf(b);

test('ordem de travas: em toda função que trava direção e conversa, as direções vêm antes', async () => {
  for (const f of ['vendas_escolher', 'vendas_registrar_alteracao', 'vendas_pedido_livre', 'vendas_apresentar_escopo'])
    assert.ok(vemAntes(await fonteDe('app', f), 'privado.travar_direcoes', 'privado.conversa_do'), f);
  for (const f of ['vendas_mudar_pedido', 'vendas_resolver_pedido_livre'])
    assert.ok(vemAntes(await fonteDe('app', f), 'order by d.id for update', 'privado.conversa_da_org'), f);
  assert.ok(vemAntes(await fonteDe('app', 'vendas_marcar_avisado'), 'order by d.id for update', 'update app.direcoes set avisada_em'), 'vendas_marcar_avisado');
  const trava = await fonteDe('privado', 'travar_direcoes');
  assert.match(trava, /cv\.visitante_id = p_visitante/, 'só as direções da conversa do próprio visitante');
  assert.match(trava, /order by d\.id for update of d/);
});

test('ordem de travas: escolher, avisar e o resumo continuam funcionando; escolher pela conversa de outro visitante é P0002', async () => {
  const b = await pedidoPronto();
  await comDirecoesProntas(b);
  const d = await um('select id from app.direcoes where conversa_id = $1 and numero = 2', [b.conversa_id]);
  assert.equal(await codigoDe(rpc('vendas_escolher', { conversa_id: b.conversa_id, visitante_id: randomUUID(), direcao_id: d.id })), 'P0002');
  assert.deepEqual(await rpc('vendas_marcar_avisado', { org_slug: 'beyon-zero', conversa_id: b.conversa_id }), { avisadas: 3 });
  assert.deepEqual(await rpc('vendas_escolher', { ...dele(b), direcao_id: d.id }), { direcao_id: d.id });
  const est = await um('select id from app.estimativas where conversa_id = $1 order by created_at desc limit 1', [b.conversa_id]);
  const r = await rpc('vendas_apresentar_escopo', { ...dele(b), titulo: 'Site', escopo: 'Resumo', estimativa_id: est.id });
  assert.ok(r.proposta_id, JSON.stringify(r));
  assert.equal((await estado(b)).conversa.etapa, 'escopo');
});
