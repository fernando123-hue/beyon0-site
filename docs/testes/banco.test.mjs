/* Fundação de dados: integridade, autorização, isolamento entre organizações e auditoria, com Postgres de verdade
   (docs/testes/_banco.mjs). Cada teste diz o que deve PASSAR e o que deve ser RECUSADO.  npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, como, erroDe, erroNaTx } from './_banco.mjs';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';   // dono da O1
const B = 'bbbbbbbb-0000-4000-8000-000000000002';   // membro comum da O1
const C = 'cccccccc-0000-4000-8000-000000000003';   // dono da O2 (outro tenant)
const D = 'dddddddd-0000-4000-8000-000000000004';   // logado, sem organização
const O1 = '11111111-0000-4000-8000-000000000001';
const O2 = '22222222-0000-4000-8000-000000000002';
const CLI1 = 'c1111111-0000-4000-8000-000000000001';
const CLI2 = 'c2222222-0000-4000-8000-000000000002';
const RLS = '42501';          // insufficient_privilege: RLS e falta de concessão
const FK = '23503', RESTRITO = '23001', UNICO = '23505', CHECK = '23514';
let db;

before(async () => {
  db = await novoBanco();
  /* o estado inicial entra como o backend faria (sem usuário = sistema) */
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@x.com'), ('${B}', 'b@x.com'), ('${C}', 'c@x.com'), ('${D}', 'd@x.com');
    insert into app.organizacoes (id, slug, nome) values ('${O1}', 'beyon-zero', 'Beyon Zero'), ('${O2}', 'outra', 'Outra Agência');
    insert into app.membros (org_id, user_id, papel) values ('${O1}', '${A}', 'dono'), ('${O1}', '${B}', 'membro'), ('${O2}', '${C}', 'dono');
    insert into app.clientes (id, org_id, nome, email) values ('${CLI1}', '${O1}', 'Padaria Sol', 'contato@padaria.com'), ('${CLI2}', '${O2}', 'Cliente da O2', null);
  `);
});

/* ======================= estrutura ======================= */
test('o banco nasce do zero só pelas migrations, com o public vazio', async () => {
  const r = await db.query("select table_schema s, count(*)::int n from information_schema.tables where table_schema in ('app','metricas','public') group by 1");
  const n = Object.fromEntries(r.rows.map(x => [x.s, x.n]));
  assert.equal(n.app, 33, '9 da Fase 1 + 10 do agente de vendas (Fase 2) + 2 de pagamentos (tentativas e auditoria) + registro das chamadas de IA + rotinas e alertas + o pedido de modelos (PR 2a) + as retomadas (PR 2b-2) + as 4 da entrega (PR 3b-2: entregas, materiais, material_arquivos, links_pedido) + entrega_ajustes (PR 3b-3) + entrega_contato_autorizacoes (a prova do contato do site, fix wave 2 do 3b-3b)');
  assert.equal(n.metricas, 2);
  assert.equal(n.public, undefined);
  const semRls = await db.query("select relname from pg_class c join pg_namespace s on s.oid = c.relnamespace where nspname in ('app','metricas') and relkind = 'r' and not relrowsecurity");
  assert.deepEqual(semRls.rows, [], 'toda tabela de app e metricas tem RLS ligado');
});

/* ======================= integridade ======================= */
test('integridade: checks de formato recusam lixo', async () => {
  assert.equal((await erroDe(db.query("insert into app.organizacoes (slug, nome) values ('Com Espaço', 'x')")))?.codigo, CHECK);
  assert.equal((await erroDe(db.query("insert into app.organizacoes (slug, nome) values ('beyon-zero', 'dup')")))?.codigo, UNICO);
  assert.equal((await erroDe(db.query(`insert into app.clientes (org_id, nome, email) values ('${O1}', 'x', 'Maiusculo@X.com')`)))?.codigo, CHECK);
  assert.equal((await erroDe(db.query(`insert into app.clientes (org_id, nome, telefone) values ('${O1}', 'x', '21 97716-7944')`)))?.codigo, CHECK);
  assert.equal((await erroDe(db.query(`insert into app.leads (org_id) values ('${O1}')`)))?.codigo, CHECK, 'lead sem nenhum contato');
  assert.equal((await erroDe(db.query(`insert into app.leads (org_id, nome, status) values ('${O1}', 'x', 'ganho')`)))?.codigo, CHECK, 'ganho sem cliente');
  assert.equal((await erroDe(db.query(`insert into app.leads (org_id, nome, codigo_visita) values ('${O1}', 'x', 'abc12')`)))?.codigo, CHECK, 'código de visita fora do alfabeto');
  assert.equal((await erroDe(db.query(`insert into app.propostas (org_id, lead_id, titulo, escopo, valor_total) values ('${O1}', null, 't', 'e', 10)`)))?.codigo, CHECK, 'proposta sem lead nem projeto');
  assert.equal((await erroDe(db.query(`insert into app.projetos (org_id, cliente_id, nome, tipo, inicio_em, previsto_para) values ('${O1}', '${CLI1}', 'x', 'landing_page', '2026-10-10', '2026-10-01')`)))?.codigo, CHECK, 'prazo antes do início');
});

test('integridade: nada aponta para registro de OUTRA organização, nem com o ID certo', async () => {
  /* projeto na O1 com o cliente da O2 */
  assert.equal((await erroDe(db.query(`insert into app.projetos (org_id, cliente_id, nome, tipo) values ('${O1}', '${CLI2}', 'x', 'landing_page')`)))?.codigo, FK);
  /* lead da O2 "ganho" pelo cliente da O1 */
  assert.equal((await erroDe(db.query(`insert into app.leads (org_id, nome, status, cliente_id) values ('${O2}', 'x', 'ganho', '${CLI1}')`)))?.codigo, FK);
});

test('integridade: exclusões fazem o que a arquitetura diz', async () => {
  await db.transaction(async tx => {
    const lead = (await tx.query(`insert into app.leads (org_id, nome) values ('${O1}', 'Lead X') returning id`)).rows[0].id;
    const proj = (await tx.query(`insert into app.projetos (org_id, cliente_id, lead_id, nome, tipo) values ('${O1}', '${CLI1}', '${lead}', 'Site', 'site_institucional') returning id`)).rows[0].id;
    const soLead = (await tx.query(`insert into app.briefings (org_id, lead_id) values ('${O1}', '${lead}') returning id`)).rows[0].id;
    const comProj = (await tx.query(`insert into app.briefings (org_id, lead_id, projeto_id) values ('${O1}', '${lead}', '${proj}') returning id`)).rows[0].id;
    /* cliente com projeto: não apaga */
    assert.equal((await erroNaTx(tx, `delete from app.clientes where id = '${CLI1}'`))?.codigo, FK);
    await tx.query(`delete from app.leads where id = '${lead}'`);
    const p = (await tx.query(`select org_id, lead_id from app.projetos where id = '${proj}'`)).rows[0];
    assert.equal(p.org_id, O1, 'o projeto continua na organização');
    assert.equal(p.lead_id, null, 'só a referência ao lead sai');
    assert.equal((await tx.query(`select 1 from app.briefings where id = '${soLead}'`)).rows.length, 0, 'briefing que só existia pelo lead foi junto');
    assert.equal((await tx.query(`select lead_id from app.briefings where id = '${comProj}'`)).rows[0].lead_id, null, 'briefing do projeto ficou');
    await tx.rollback();
  });
});

test('integridade: proposta enviada é imutável e a situação só anda para a frente', async () => {
  await db.transaction(async tx => {
    const lead = (await tx.query(`insert into app.leads (org_id, nome) values ('${O1}', 'Lead P') returning id`)).rows[0].id;
    const prop = (await tx.query(`insert into app.propostas (org_id, lead_id, titulo, escopo, valor_total) values ('${O1}', '${lead}', 'Site', 'Escopo', 3000) returning id`)).rows[0].id;
    assert.equal((await erroNaTx(tx, `update app.propostas set status = 'aceita', respondida_em = now(), enviada_em = now() where id = '${prop}'`))?.codigo, CHECK, 'rascunho não vira aceita direto');
    await tx.query(`update app.propostas set status = 'enviada', enviada_em = now() where id = '${prop}'`);
    assert.equal((await erroNaTx(tx, `update app.propostas set valor_total = 2500 where id = '${prop}'`))?.codigo, CHECK, 'valor de proposta enviada não muda');
    await tx.query(`update app.propostas set status = 'aceita', respondida_em = now() where id = '${prop}'`);
    assert.equal((await erroNaTx(tx, `insert into app.propostas (org_id, lead_id, titulo, escopo, valor_total) values ('${O1}', '${lead}', 'Dup', 'E', 1)`))?.codigo, UNICO, 'mesma versão duas vezes');
    await tx.query(`insert into app.propostas (org_id, lead_id, versao, titulo, escopo, valor_total) values ('${O1}', '${lead}', 2, 'V2', 'E', 1)`);
    await tx.rollback();
  });
});

test('integridade: a organização nunca fica sem dono, mas pode ser apagada inteira', async () => {
  await db.transaction(async tx => {
    assert.equal((await erroNaTx(tx, `update app.membros set papel = 'admin' where user_id = '${C}'`))?.codigo, CHECK);
    assert.equal((await erroNaTx(tx, `delete from app.membros where user_id = '${C}'`))?.codigo, CHECK);
    await tx.query(`delete from app.organizacoes where id = '${O2}'`);
    assert.equal((await tx.query(`select 1 from app.clientes where org_id = '${O2}'`)).rows.length, 0, 'a cascata leva tudo da organização');
    await tx.rollback();
  });
});

/* ======================= autorização e isolamento ======================= */
test('permitido: o membro vê e cria na PRÓPRIA organização, e a autoria vem do banco', async () => {
  await como(db, B, async q => {
    const r = await q('select id from app.clientes');
    assert.deepEqual(r.rows.map(x => x.id), [CLI1], 'B vê só o cliente da O1');
    const novo = await q(`insert into app.leads (org_id, nome, created_by) values ($1, 'Lead do B', $2) returning created_by`, [O1, C]);
    assert.equal(novo.rows[0].created_by, B, 'o created_by enviado (C) foi ignorado');
  }, { manter: false });
});

test('negado: usuário de OUTRA organização não lê, não cria, não altera e não apaga', async () => {
  await como(db, C, async q => {
    assert.equal((await q(`select 1 from app.clientes where id = $1`, [CLI1])).rows.length, 0, 'ler pelo ID exato');
    assert.equal((await q(`select 1 from app.organizacoes where id = $1`, [O1])).rows.length, 0);
    assert.equal((await q(`select 1 from app.membros where org_id = $1`, [O1])).rows.length, 0);
    assert.equal((await q(`update app.clientes set nome = 'hack' where id = $1`, [CLI1])).affectedRows, 0);
    assert.equal((await q(`delete from app.clientes where id = $1`, [CLI1])).affectedRows, 0);
  }, { manter: false });
  assert.equal((await erroDe(como(db, C, q => q(`insert into app.leads (org_id, nome) values ($1, 'intruso')`, [O1]))))?.codigo, RLS, 'criar na O1');
  assert.equal((await erroDe(como(db, C, q => q(`insert into app.membros (org_id, user_id, papel) values ($1, $2, 'dono')`, [O1, C]))))?.codigo, RLS, 'se colocar como dono da O1');
  /* manipulação de ID: na própria organização, apontando para o cliente da outra */
  assert.equal((await erroDe(como(db, C, q => q(`insert into app.projetos (org_id, cliente_id, nome, tipo) values ($1, $2, 'x', 'outro')`, [O2, CLI1]))))?.codigo, FK);
  /* mover um registro da O1 para a O2 */
  assert.ok(await erroDe(como(db, A, q => q(`update app.clientes set org_id = $1 where id = $2`, [O2, CLI1]))), 'trocar o org_id é recusado');
  const ainda = await db.query(`select nome, org_id from app.clientes where id = '${CLI1}'`);
  assert.deepEqual(ainda.rows[0], { nome: 'Padaria Sol', org_id: O1 }, 'nada mudou de verdade');
});

test('negado: usuário comum não faz operação de administração', async () => {
  await como(db, B, async q => {
    assert.equal((await q(`delete from app.clientes where id = $1`, [CLI1])).affectedRows, 0, 'membro não apaga');
    assert.equal((await q(`update app.membros set papel = 'dono' where user_id = $1`, [B])).affectedRows, 0, 'membro não se promove');
    assert.equal((await q(`select 1 from app.auditoria`)).rows.length, 0, 'membro não vê a auditoria');
    assert.equal((await q(`update app.organizacoes set nome = 'x' where id = $1`, [O1])).affectedRows, 0, 'membro não edita a organização');
  }, { manter: false });
  assert.equal((await erroDe(como(db, B, q => q(`insert into app.membros (org_id, user_id, papel) values ($1, $2, 'membro')`, [O1, D]))))?.codigo, RLS, 'membro não convida');
  assert.equal((await erroDe(como(db, A, q => q(`insert into app.organizacoes (slug, nome) values ('nova', 'Nova')`))))?.codigo, RLS, 'nem o dono cria organização (só o backend)');
  assert.equal((await erroDe(como(db, A, q => q(`delete from app.organizacoes where id = $1`, [O1]))))?.codigo, RLS, 'nem o dono apaga a organização pela API');
  /* o dono pode o que é dele */
  await como(db, A, async q => {
    await q(`insert into app.membros (org_id, user_id, papel) values ($1, $2, 'membro')`, [O1, D]);
    assert.ok((await q(`select 1 from app.auditoria where org_id = $1`, [O1])).rows.length > 0, 'dono lê a auditoria');
  }, { manter: false });
});

test('negado: sem login (anon) e logado sem organização não acessam nada privado', async () => {
  for (const sql of ['select * from app.clientes', 'select * from app.organizacoes', 'select * from app.auditoria', 'select * from metricas.paginas', 'select * from metricas.contatos']) {
    assert.equal((await erroDe(como(db, 'anon', q => q(sql))))?.codigo, RLS, 'anon: ' + sql);
  }
  assert.equal((await erroDe(como(db, 'anon', q => q('select * from privado.minhas_orgs()'))))?.codigo, RLS, 'anon não chama as funções de segurança');
  await como(db, D, async q => {
    for (const t of ['organizacoes', 'membros', 'clientes', 'leads', 'projetos', 'briefings', 'propostas', 'revisoes', 'auditoria']) {
      assert.equal((await q(`select 1 from app.${t}`)).rows.length, 0, 'D (sem organização) em ' + t);
    }
  }, { manter: false });
  assert.equal((await erroDe(como(db, A, q => q('select * from metricas.paginas'))))?.codigo, RLS, 'logado não lê as métricas (só o backend)');
});

test('auditoria: registra quem e o quê, sem dado pessoal, e ninguém a altera', async () => {
  await como(db, A, async q => {
    const id = (await q(`insert into app.clientes (org_id, nome, email, telefone) values ($1, 'Maria Silva', 'maria@x.com', '+5521999990000') returning id`, [O1])).rows[0].id;
    await q(`update app.clientes set telefone = '+5521888880000', tipo = 'pessoa' where id = $1`, [id]);
    const log = (await q(`select acao, ator_id, ator_tipo, campos, valores::text from app.auditoria where registro_id = $1 order by created_at, acao`, [id])).rows;
    assert.equal(log.length, 2);
    assert.equal(log[0].ator_id, A);
    assert.equal(log[0].ator_tipo, 'usuario');
    const alterou = log.find(l => l.acao === 'alterou');
    assert.deepEqual(alterou.campos, ['telefone', 'tipo'], 'os nomes dos campos alterados');
    const tudo = JSON.stringify(log);
    for (const pessoal of ['Maria', 'maria@x.com', '99999', '88888']) assert.ok(!tudo.includes(pessoal), 'sem dado pessoal: ' + pessoal);
    assert.ok(alterou.valores.includes('"tipo": "pessoa"'), 'valor de campo seguro registrado');
  }, { manter: false });
  assert.equal((await erroDe(como(db, A, q => q(`update app.auditoria set acao = 'criou'`))))?.codigo, RLS, 'dono não altera a auditoria');
  assert.equal((await erroDe(como(db, A, q => q(`delete from app.auditoria`))))?.codigo, RLS, 'dono não apaga a auditoria');
  assert.equal((await erroDe(como(db, A, q => q(`insert into app.auditoria (ator_tipo, acao, tabela) values ('sistema', 'criou', 'x')`))))?.codigo, RLS, 'ninguém forja linha de auditoria');
});

test('backend (service_role): faz as tarefas do sistema, como gravar métricas', async () => {
  await como(db, 'service_role', async q => {
    await q(`insert into metricas.paginas (id, visita, codigo, pagina, inicio, dispositivo) values ('pv-12345678', 'vi-12345678', 'K7Q4M', '/sites', now(), 'celular')`);
    assert.equal((await q('select count(*)::int n from app.clientes')).rows[0].n, 2, 'vê as duas organizações');
  }, { manter: false });
});

test('restauração: sem usuário e com o modo ligado, datas, autoria e auditoria originais ficam; pela API não liga', async () => {
  const antigo = '2025-01-02T03:04:05.000Z';
  await db.transaction(async tx => {
    await tx.exec("set local bz.restaurando = 'on'");
    const n0 = (await tx.query('select count(*)::int n from app.auditoria')).rows[0].n;
    const r = await tx.query(`insert into app.clientes (org_id, nome, created_at, created_by) values ($1, 'Restaurado', $2, $3) returning created_at, created_by`, [O1, antigo, A]);
    assert.equal(r.rows[0].created_at.toISOString(), antigo, 'a data original ficou');
    assert.equal(r.rows[0].created_by, A, 'a autoria original ficou');
    assert.equal((await tx.query('select count(*)::int n from app.auditoria')).rows[0].n, n0, 'a restauração não inventa auditoria');
    await tx.rollback();
  });
  /* um usuário logado com o mesmo ajuste na sessão continua carimbado e auditado */
  await como(db, A, async q => {
    await q("select set_config('bz.restaurando', 'on', true)");
    const r = await q(`insert into app.clientes (org_id, nome, created_at, created_by) values ($1, 'Forjado', $2, $3) returning id, created_at, created_by`, [O1, antigo, C]);
    assert.equal(r.rows[0].created_by, A, 'a autoria forjada foi ignorada');
    assert.notEqual(r.rows[0].created_at.toISOString(), antigo, 'a data forjada foi ignorada');
    assert.equal((await q('select count(*)::int n from app.auditoria where registro_id = $1', [r.rows[0].id])).rows[0].n, 1, 'auditado');
  }, { manter: false });
});

test('revisão de banco: lead, cliente e organização apagáveis do jeito certo; proposta enviada sem volta', async () => {
  await db.transaction(async tx => {
    const cli = (await tx.query(`insert into app.clientes (org_id, nome) values ('${O1}', 'Cliente Z') returning id`)).rows[0].id;
    const lead = (await tx.query(`insert into app.leads (org_id, nome, status, cliente_id) values ('${O1}', 'Lead Z', 'ganho', '${cli}') returning id`)).rows[0].id;
    const proj = (await tx.query(`insert into app.projetos (org_id, cliente_id, lead_id, nome, tipo) values ('${O1}', '${cli}', '${lead}', 'Z', 'landing_page') returning id`)).rows[0].id;
    const prop = (await tx.query(`insert into app.propostas (org_id, lead_id, projeto_id, titulo, escopo, valor_total, status, enviada_em) values ('${O1}', '${lead}', '${proj}', 'T', 'E', 900, 'enviada', now()) returning id`)).rows[0].id;
    /* a data de envio não volta no tempo */
    assert.equal((await erroNaTx(tx, `update app.propostas set enviada_em = now() - interval '30 days' where id = '${prop}'`))?.codigo, CHECK);
    /* o lead não troca por outro, mas pode sair (lead apagado) */
    const outro = (await tx.query(`insert into app.leads (org_id, nome) values ('${O1}', 'Outro') returning id`)).rows[0].id;
    assert.equal((await erroNaTx(tx, `update app.propostas set lead_id = '${outro}' where id = '${prop}'`))?.codigo, CHECK);
    /* cliente que um lead ganhou (sem projeto nenhum): não se apaga sozinho, com erro de chave estrangeira */
    const cliSo = (await tx.query(`insert into app.clientes (org_id, nome) values ('${O1}', 'Só do lead') returning id`)).rows[0].id;
    await tx.query(`insert into app.leads (org_id, nome, status, cliente_id) values ('${O1}', 'Ganho', 'ganho', '${cliSo}')`);
    assert.equal((await erroNaTx(tx, `delete from app.clientes where id = '${cliSo}'`))?.codigo, FK);
    /* apagar o lead com proposta ENVIADA ligada também ao projeto: a proposta fica, só sem o lead */
    await tx.query(`delete from app.leads where id = '${lead}'`);
    assert.equal((await tx.query(`select lead_id, status from app.propostas where id = '${prop}'`)).rows[0].lead_id, null);
    await tx.rollback();
  });
  /* pela API, proposta nova nasce rascunho */
  assert.equal((await erroDe(como(db, A, async q => {
    const l = (await q(`insert into app.leads (org_id, nome) values ($1, 'L') returning id`, [O1])).rows[0].id;
    await q(`insert into app.propostas (org_id, lead_id, titulo, escopo, valor_total, status, enviada_em, respondida_em) values ($1, $2, 'T', 'E', 1, 'aceita', now(), now())`, [O1, l]);
  })))?.codigo, CHECK, 'aceita direto no insert');
  /* nem o backend reescreve a auditoria */
  assert.equal((await erroDe(como(db, 'service_role', q => q(`update app.auditoria set acao = 'criou'`))))?.codigo, RLS);
  assert.equal((await erroDe(como(db, 'service_role', q => q(`delete from app.auditoria`))))?.codigo, RLS);
  /* a organização inteira, com lead ganho, projeto e proposta enviada, apaga em cascata */
  await db.transaction(async tx => {
    const o = (await tx.query(`insert into app.organizacoes (slug, nome) values ('temporaria', 'Temp') returning id`)).rows[0].id;
    await tx.query(`insert into app.membros (org_id, user_id, papel) values ('${o}', '${D}', 'dono')`);
    const cli = (await tx.query(`insert into app.clientes (org_id, nome) values ('${o}', 'C') returning id`)).rows[0].id;
    const lead = (await tx.query(`insert into app.leads (org_id, nome, status, cliente_id) values ('${o}', 'L', 'ganho', '${cli}') returning id`)).rows[0].id;
    const proj = (await tx.query(`insert into app.projetos (org_id, cliente_id, lead_id, nome, tipo) values ('${o}', '${cli}', '${lead}', 'P', 'outro') returning id`)).rows[0].id;
    await tx.query(`insert into app.propostas (org_id, lead_id, projeto_id, titulo, escopo, valor_total, status, enviada_em) values ('${o}', '${lead}', '${proj}', 'T', 'E', 1, 'enviada', now())`);
    await tx.query(`delete from app.organizacoes where id = '${o}'`);
    assert.equal((await tx.query(`select count(*)::int n from app.clientes where org_id = '${o}'`)).rows[0].n, 0);
    await tx.rollback();
  });
});

test('nenhuma função de privado ou app executável por PUBLIC (o padrão do Postgres; cada uma revoga explicitamente)', async () => {
  const r = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('privado', 'app')
      and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))`);
  assert.ok(r.rows.length === 0, 'executáveis por PUBLIC: ' + r.rows.map(x => x.proname).join(', '));
  const total = await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'privado'`);
  assert.ok(total.rows[0].n >= 8, 'a consulta enxerga as funções de privado');
});
