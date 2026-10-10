/* Fase 2 — o fluxo de vendas no banco: as funções (o que o backend chama), as regras de etapa, a idempotência,
   o isolamento entre visitantes e o RLS. Postgres de verdade (PGlite) com as migrations reais.  npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe } from './_banco.mjs';

const A = 'aaaaaaaa-0000-4000-8000-0000000000a1';    // dono da Beyon Zero
const B = 'bbbbbbbb-0000-4000-8000-0000000000b2';    // membro comum
const V1 = 'eeeeeeee-0000-4000-8000-0000000000e1';   // visitante anônimo 1
const V2 = 'ffffffff-0000-4000-8000-0000000000f2';   // visitante anônimo 2
const ORG = '99999999-0000-4000-8000-000000000099';
const REGRAS = 'dddddddd-0000-4000-8000-0000000000d0';
const RASCUNHO = 'dddddddd-0000-4000-8000-0000000000d1';
const SEM_PERMISSAO = '42501', NAO_ACHOU = 'P0002', ETAPA = '55000', REGRA = '23514', INVALIDO = '22023';
let db;

/* o backend chama cada passo como service_role, passando o visitante tirado do token conferido */
const rpc = (nome, p) => como(db, 'service_role', q => q(`select app.${nome}($1::jsonb) as r`, [JSON.stringify(p)])).then(x => x.rows[0].r);

before(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@bz.com'), ('${B}', 'b@bz.com'), ('${V1}', null), ('${V2}', null);
    insert into app.organizacoes (id, slug, nome) values ('${ORG}', 'beyon-zero', 'Beyon Zero');
    insert into app.membros (org_id, user_id, papel) values ('${ORG}', '${A}', 'dono'), ('${ORG}', '${B}', 'membro');
    insert into app.regras_comerciais (id, org_id, versao, status, regras, aprovada_em) values
      ('${REGRAS}', '${ORG}', 1, 'ativa', '{"moeda":"BRL"}', now()),
      ('${RASCUNHO}', '${ORG}', 2, 'rascunho', '{"moeda":"BRL"}', null);
  `);
});

/* leva uma conversa nova até a etapa pedida; devolve os ids */
async function conversaAte(visitante, ate) {
  const ids = {};
  ids.conversa = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: visitante, origem_meio: 'anuncio', origem_fonte: 'google', campanha: 'sites-rj', codigo_visita: null })).conversa_id;
  const base = { conversa_id: ids.conversa, visitante_id: visitante };
  if (ate === 'iniciada') return ids;
  await rpc('vendas_registrar_turno', { ...base, mensagem_visitante: 'Tenho uma clínica odontológica e só tenho Instagram', mensagem_agente: 'Entendi. Qual é o principal objetivo do site?', briefing: { negocio: { nome: 'Clínica Sorriso', segmento: 'odontologia' }, projeto: { formato: 'institucional' } }, confianca: 0.75, custo_usd: 0.01 });
  ids.estimativa = (await rpc('vendas_registrar_estimativa', { ...base, regras_id: REGRAS, fatores: { formato: 'institucional', paginas: 5 }, valor_total: 3000, sinal: 1500, prazo_dias: 10 })).estimativa_id;
  if (ate === 'estimativa') return ids;
  ids.lead = (await rpc('vendas_informar_contato', { ...base, nome: 'Dra. Ana', telefone: '+5521999990000', aceite: true })).lead_id;
  if (ate === 'contato') return ids;
  const g = await rpc('vendas_iniciar_geracao', base);
  ids.direcoes = g.direcoes.map(d => d.id);
  if (ate === 'gerando') return ids;
  for (const d of ids.direcoes) await rpc('vendas_concluir_direcao', { direcao_id: d, conteudo: { secoes: [], paleta: {} }, modelo: 'teste' });
  if (ate === 'direcoes') return ids;
  await rpc('vendas_escolher', { ...base, direcao_id: ids.direcoes[1] });
  if (ate === 'escolhida') return ids;
  await rpc('vendas_registrar_alteracao', { ...base, pedido: 'quero a cor da primeira', mudancas: [{ tipo: 'visual', instrucao: 'usar paleta da direção 1' }], resultado: { secoes: [], paleta: { cor: 'x' } } });
  ids.proposta = (await rpc('vendas_apresentar_escopo', { ...base, titulo: 'Site institucional — Clínica Sorriso', escopo: 'Site institucional de 5 páginas', valor_total: 1 })).proposta_id;
  if (ate === 'escopo') return ids;
  await rpc('vendas_confirmar_escopo', { ...base, proposta_id: ids.proposta, confirmo: true, inicio_imediato: true });
  if (ate === 'confirmada') return ids;
  const cob = await rpc('pagamentos_iniciar_tentativa', { ...base, metodo: 'pix', provedor: 'mercadopago' });
  ids.pagamento = cob.pagamento_id;
  ids.tentativa = cob.tentativa_id;
  ids.ref = 'ORD' + ids.tentativa.replace(/-/g, '').slice(0, 26).toUpperCase();
  await rpc('pagamentos_vincular', { tentativa_id: ids.tentativa, provedor_order_id: ids.ref });
  return ids;
}

/* o retrato de uma order aprovada (o que o serviço monta depois de CONSULTAR o provedor) */
const aprovada = (ids, valor = '1500.00') => ({ provedor: 'mercadopago', origem: 'webhook', conta_esperada: '1', retrato: { order_id: ids.ref, external_reference: ids.tentativa, user_id: '1', total_amount: valor, country_code: 'BRA',
  pagamento: { id: 'PAY1', amount: valor, paid_amount: valor, status: 'processed', status_detail: 'accredited', metodo_id: 'pix', metodo_tipo: 'bank_transfer' }, estado: 'aprovada' } });

/* ======================= o caminho inteiro ======================= */
test('fluxo completo: conversa → estimativa → contato → 3 direções → escolha → alteração → escopo → confirmação → sinal pago → projeto em produção', async () => {
  const ids = await conversaAte(V1, 'cobranca');
  const r = await rpc('pagamentos_aplicar', aprovada(ids));
  assert.ok(r.projeto_id, 'o sinal pago criou o projeto');
  const estado = await rpc('vendas_estado', { conversa_id: ids.conversa, visitante_id: V1 });
  assert.equal(estado.conversa.etapa, 'em_producao');
  assert.equal(estado.proposta.status, 'aceita');
  assert.equal(estado.pagamentos[0].status, 'pago');
  const db2 = await db.query(`select l.status, l.cliente_id is not null as tem_cliente, p.status as projeto, p.tipo, p.previsto_para - p.inicio_em as dias,
    pr.projeto_id is not null as proposta_ligada, pr.inicio_imediato_em is not null as consentiu
    from app.leads l join app.projetos p on p.lead_id = l.id join app.propostas pr on pr.projeto_id = p.id where l.id = $1`, [ids.lead]);
  assert.deepEqual(db2.rows[0], { status: 'ganho', tem_cliente: true, projeto: 'pronto_para_producao', tipo: 'site_institucional', dias: 10, proposta_ligada: true, consentiu: true });
  const funil = (await db.query(`select tipo from app.eventos_funil where conversa_id = $1 order by created_at, tipo`, [ids.conversa])).rows.map(x => x.tipo);
  for (const t of ['conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado', 'direcoes_solicitadas', 'direcoes_prontas', 'direcao_escolhida', 'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado', 'pagamento_confirmado']) {
    assert.ok(funil.includes(t), 'funil registrou ' + t);
  }
});

/* ======================= preço ======================= */
test('preço: o escopo usa a ÚLTIMA ESTIMATIVA, nunca o valor enviado na chamada; a cobrança usa o sinal da proposta', async () => {
  const ids = await conversaAte(V1, 'escopo');
  const pr = (await db.query('select valor_total, sinal_percentual, prazo_dias from app.propostas where id = $1', [ids.proposta])).rows[0];
  assert.equal(Number(pr.valor_total), 3000, 'o valor_total: 1 da chamada foi ignorado');
  assert.equal(pr.sinal_percentual, 50);
  await rpc('vendas_confirmar_escopo', { conversa_id: ids.conversa, visitante_id: V1, proposta_id: ids.proposta, confirmo: true });
  const cob = await rpc('pagamentos_iniciar_tentativa', { conversa_id: ids.conversa, visitante_id: V1, metodo: 'pix', provedor: 'mercadopago', valor: 1 });
  assert.equal(Number(cob.valor), 1500, 'o valor da cobrança vem da proposta, não da chamada');
  assert.equal((await erroDe(rpc('vendas_registrar_estimativa', { conversa_id: ids.conversa, visitante_id: V1, regras_id: RASCUNHO, fatores: {}, valor_total: 1, sinal: 0, prazo_dias: 10 })))?.codigo, ETAPA, 'estimativa depois da confirmação: recusada');
  const v = await conversaAte(V2, 'iniciada');
  assert.equal((await erroDe(rpc('vendas_registrar_estimativa', { conversa_id: v.conversa, visitante_id: V2, regras_id: RASCUNHO, fatores: {}, valor_total: 1, sinal: 0, prazo_dias: 10 })))?.codigo, ETAPA, 'tabela em rascunho não gera estimativa para visitante');
});

/* (o PGlite tem uma conexão só e põe as transações em fila: aqui se prova o resultado de dois pedidos seguidos. No Postgres
   real, a corrida de verdade é barrada pelo FOR UPDATE na conversa e pelos índices únicos (uma geração por número, uma
   cobrança viva por parcela), que valem mesmo se duas transações chegarem juntas.) */
test('concorrência: dois pedidos de geração e duas cobranças ao mesmo tempo dão uma geração e uma cobrança', async () => {
  const ids = await conversaAte(V2, 'contato');
  const base = { conversa_id: ids.conversa, visitante_id: V2 };
  const [g1, g2] = await Promise.all([rpc('vendas_iniciar_geracao', base), rpc('vendas_iniciar_geracao', base)]);
  assert.equal(g1.geracao, g2.geracao);
  assert.equal([g1.nova, g2.nova].filter(Boolean).length, 1, 'só uma criou');
  assert.equal((await db.query('select count(*)::int n from app.direcoes where conversa_id = $1', [ids.conversa])).rows[0].n, 3);
  const v = await conversaAte(V2, 'confirmada');
  const pedir = () => rpc('pagamentos_iniciar_tentativa', { conversa_id: v.conversa, visitante_id: V2, metodo: 'pix', provedor: 'mercadopago' });
  const [c1, c2] = await Promise.all([pedir(), pedir()]);
  assert.equal(c1.pagamento_id, c2.pagamento_id, 'o mesmo pagamento');
  assert.equal(c1.tentativa_id, c2.tentativa_id, 'a mesma tentativa (uma ativa por pagamento)');
});

/* ======================= etapas e limites ======================= */
test('etapas: cada passo só depois do anterior; o limite de gerações vale', async () => {
  const ids = await conversaAte(V1, 'estimativa');
  const base = { conversa_id: ids.conversa, visitante_id: V1 };
  assert.equal((await erroDe(rpc('vendas_iniciar_geracao', base)))?.codigo, ETAPA, 'direções sem contato');
  assert.equal((await erroDe(rpc('vendas_escolher', { ...base, direcao_id: ids.conversa })))?.codigo, ETAPA, 'escolher antes das direções');
  assert.equal((await erroDe(rpc('vendas_apresentar_escopo', { ...base, escopo: 'x' })))?.codigo, ETAPA, 'escopo antes da escolha');
  const d = await conversaAte(V1, 'direcoes');
  const b2 = { conversa_id: d.conversa, visitante_id: V1 };
  assert.equal((await erroDe(rpc('vendas_confirmar_escopo', { ...b2, proposta_id: d.conversa, confirmo: true })))?.codigo, ETAPA);
  for (let i = 0; i < 2; i++) {
    const g = await rpc('vendas_iniciar_geracao', b2);
    for (const x of g.direcoes) await rpc('vendas_concluir_direcao', { direcao_id: x.id, erro: 'falha simulada' });
  }
  assert.equal((await erroDe(rpc('vendas_iniciar_geracao', b2)))?.codigo, REGRA, 'a 4ª geração passa do limite');
  const e = await conversaAte(V1, 'escopo');
  assert.equal((await erroDe(rpc('vendas_confirmar_escopo', { conversa_id: e.conversa, visitante_id: V1, proposta_id: e.proposta, confirmo: false })))?.codigo, INVALIDO, 'sem confirmação explícita');
});

test('IA falhou: as 3 direções falhando devolvem a conversa para tentar de novo, sem inventar proposta', async () => {
  const ids = await conversaAte(V2, 'gerando');
  for (const d of ids.direcoes) await rpc('vendas_concluir_direcao', { direcao_id: d, erro: 'tempo esgotado' });
  const estado = await rpc('vendas_estado', { conversa_id: ids.conversa, visitante_id: V2 });
  assert.equal(estado.conversa.etapa, 'contato');
  assert.ok(estado.direcoes.every(d => d.status === 'falhou' && d.conteudo === null));
  assert.ok((await db.query(`select 1 from app.eventos_funil where conversa_id = $1 and tipo = 'direcoes_falharam'`, [ids.conversa])).rows.length);
  assert.deepEqual(await rpc('vendas_concluir_direcao', { direcao_id: ids.direcoes[0], conteudo: { secoes: [] } }), { ignorado: true, status: 'falhou' }, 'resposta atrasada não ressuscita uma direção');
});

/* ======================= isolamento entre visitantes e RLS ======================= */
test('isolamento: o visitante 2 não lê nem mexe na conversa do visitante 1 (mesmo erro de "não existe")', async () => {
  const ids = await conversaAte(V1, 'cobranca');
  const de2 = { conversa_id: ids.conversa, visitante_id: V2 };
  for (const [nome, extra] of [['vendas_estado', {}], ['vendas_registrar_turno', { mensagem_visitante: 'x', mensagem_agente: 'y' }], ['vendas_informar_contato', { nome: 'x' }],
    ['vendas_iniciar_geracao', {}], ['vendas_confirmar_escopo', { proposta_id: ids.proposta, confirmo: true }], ['pagamentos_iniciar_tentativa', { metodo: 'pix', provedor: 'mercadopago' }], ['pagamentos_estado', {}]]) {
    assert.equal((await erroDe(rpc(nome, { ...de2, ...extra })))?.codigo, NAO_ACHOU, nome);
  }
  await como(db, V2, async q => {
    for (const t of ['conversas', 'mensagens', 'estimativas', 'direcoes', 'escolhas', 'alteracoes', 'propostas']) {
      assert.equal((await q(`select 1 from app.${t} where ${t === 'conversas' ? 'id' : 'conversa_id'} = $1`, [ids.conversa])).rows.length, 0, 'V2 lendo ' + t + ' de V1');
    }
    /* o pagamento de V1 pelo id exato (manipulação de ID) */
    assert.equal((await q('select 1 from app.pagamentos where id = $1', [ids.pagamento])).rows.length, 0, 'V2 lendo o pagamento de V1 pelo id');
  }, { manter: false });
  await como(db, V1, async q => {
    assert.equal((await q('select 1 from app.pagamentos where id = $1', [ids.pagamento])).rows.length, 1, 'V1 vê o próprio pagamento');
  }, { manter: false });
});

test('RLS: o visitante só LÊ o que é dele e não escreve nem executa nada; a equipe vê o funil; anon nada', async () => {
  const ids = await conversaAte(V1, 'escopo');
  await como(db, V1, async q => {
    assert.equal((await q('select etapa from app.conversas where id = $1', [ids.conversa])).rows[0].etapa, 'escopo');
    assert.ok((await q('select 1 from app.mensagens where conversa_id = $1', [ids.conversa])).rows.length >= 2);
    assert.equal((await q('select 1 from app.propostas where conversa_id = $1', [ids.conversa])).rows.length, 1, 'vê a proposta dele');
    assert.equal((await q('select 1 from app.eventos_funil')).rows.length, 0, 'o funil é interno');
    assert.equal((await q('select 1 from app.regras_comerciais')).rows.length, 0, 'as regras são internas');
  }, { manter: false });
  for (const sql of [`insert into app.mensagens (org_id, conversa_id, papel, conteudo) values ('${ORG}', '${ids.conversa}', 'agente', 'forjada')`,
    `update app.conversas set etapa = 'em_producao' where id = '${ids.conversa}'`,
    `update app.propostas set valor_total = 1 where conversa_id = '${ids.conversa}'`,
    `select app.pagamentos_aplicar('{}'::jsonb)`]) {
    const e = await erroDe(como(db, V1, q => q(sql)));
    assert.ok(e && [SEM_PERMISSAO].includes(e.codigo) || (await como(db, V1, q => q(sql).then(r => r.affectedRows === 0).catch(() => true))), 'visitante não escreve: ' + sql.slice(0, 50));
  }
  assert.equal((await erroDe(como(db, 'anon', q => q('select * from app.conversas'))))?.codigo, SEM_PERMISSAO);
  assert.equal((await erroDe(como(db, V1, q => q(`select app.vendas_iniciar('{}'::jsonb)`))))?.codigo, SEM_PERMISSAO, 'visitante não chama as funções do backend');
  await como(db, A, async q => {
    assert.ok((await q('select 1 from app.conversas where id = $1', [ids.conversa])).rows.length, 'a equipe vê a conversa');
    assert.ok((await q('select 1 from app.eventos_funil where conversa_id = $1', [ids.conversa])).rows.length, 'e o funil');
  }, { manter: false });
});

test('regras comerciais: dono cria rascunho, membro não; aprovada não muda; uma ativa por organização', async () => {
  await como(db, A, q => q(`insert into app.regras_comerciais (org_id, versao, regras) values ($1, 10, '{"a":1}')`, [ORG]), { manter: false });
  assert.equal((await erroDe(como(db, B, q => q(`insert into app.regras_comerciais (org_id, versao, regras) values ($1, 11, '{}')`, [ORG]))))?.codigo, SEM_PERMISSAO);
  assert.equal((await erroDe(db.query(`update app.regras_comerciais set regras = '{"moeda":"USD"}' where id = '${REGRAS}'`)))?.codigo, REGRA, 'ativa não muda');
  assert.ok(await erroDe(db.query(`update app.regras_comerciais set status = 'ativa', aprovada_em = now() where id = '${RASCUNHO}'`)), 'duas ativas');
  assert.ok(await erroDe(db.query(`insert into app.regras_comerciais (org_id, versao, status, regras) values ('${ORG}', 12, 'ativa', '{}')`)), 'ativa sem aprovação');
});

/* (auditoria 2026-10-09, segurança 10) a política de privacidade diz que os pedidos de ajuste saem aos 2 meses; a
   retenção apagava o pedido, mas as operações (com o texto novo que a pessoa pediu) e a direção ajustada ficavam */
test('retenção: o ajuste de conversa parada fica sem o texto inteiro (pedido, operações e direção ajustada); o registro e a prévia seguem', async () => {
  const V3 = 'cccccccc-0000-4000-8000-0000000000c3';
  await db.exec(`insert into auth.users (id) values ('${V3}')`);
  const ids = await conversaAte(V3, 'escopo');
  const antes = (await db.query('select mudancas, resultado, status from app.alteracoes where conversa_id = $1', [ids.conversa])).rows[0];
  assert.equal(antes.status, 'aplicada');
  assert.ok(antes.mudancas.length && antes.resultado, 'o caso de partida tem operações e direção ajustada');
  await db.exec(`begin; set local bz.restaurando = 'on'; set local bz.transicao_livre = 'on';
    update app.conversas set ultima_atividade = now() - interval '70 days' where id = '${ids.conversa}'; commit;`);
  await rpc('vendas_reter', {});
  const depois = (await db.query('select pedido, mudancas, resultado, status from app.alteracoes where conversa_id = $1', [ids.conversa])).rows;
  assert.deepEqual(depois, [{ pedido: '[apagado]', mudancas: [], resultado: null, status: 'aplicada' }], 'fica só o registro de que houve um ajuste');
  const e = await rpc('vendas_estado', { conversa_id: ids.conversa, visitante_id: V3 });
  assert.equal(e.versao_final, null, 'sem a direção ajustada, a prévia volta à direção escolhida (não quebra)');
  assert.deepEqual(e.alteracoes.map(a => [a.pedido, a.mudancas]), [['[apagado]', []]]);
  /* a regra "aplicada tem resultado" continua valendo para ajuste novo */
  assert.ok(await erroDe(db.query(`insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, status) values ('${ORG}', '${ids.conversa}', '${ids.direcoes[1]}', 'x', 'aplicada')`)), 'ajuste aplicado sem resultado: recusado');
});

test('conversa aberta até o pagamento: no escopo e no sinal o turno grava pergunta e resposta, mas não mexe no briefing nem na confiança; em produção, nada (PROPOSTA de 2026-10-09, §4, 3b)', async () => {
  const esc = await conversaAte(V1, 'escopo');
  const pag = await conversaAte(V1, 'confirmada');
  for (const ids of [esc, pag]) {
    const base = { conversa_id: ids.conversa, visitante_id: V1 };
    const ler = async () => (await db.query('select etapa, briefing, confianca, turnos from app.conversas where id = $1', [ids.conversa])).rows[0];
    const antes = await ler();
    await rpc('vendas_registrar_turno', { ...base, mensagem_visitante: 'O sinal pode ser no cartão?', mensagem_agente: 'Pode, por Pix ou cartão, aqui na tela.', briefing: { negocio: { segmento: 'advocacia' } }, confianca: 0.1, custo_usd: 0.002 });
    const depois = await ler();
    assert.equal(depois.etapa, antes.etapa);
    assert.deepEqual(depois.briefing, antes.briefing, antes.etapa + ': o briefing do escopo confirmado não muda');
    assert.equal(Number(depois.confianca), Number(antes.confianca), antes.etapa);
    assert.equal(depois.turnos, antes.turnos + 1, antes.etapa + ': o turno conta (teto de turnos)');
  }
  assert.equal((await db.query('select etapa from app.conversas where id = $1', [pag.conversa])).rows[0].etapa, 'aguardando_pagamento');
  await db.exec(`begin; set local bz.transicao_livre = 'on'; update app.conversas set etapa = 'em_producao' where id = '${pag.conversa}'; commit;`);
  assert.equal((await erroDe(rpc('vendas_registrar_turno', { conversa_id: pag.conversa, visitante_id: V1, mensagem_visitante: 'x', mensagem_agente: 'y' })))?.codigo, ETAPA, 'em produção: a conversa com o agente acabou');
});
