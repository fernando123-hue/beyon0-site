-- ==========================================================================
-- 6/6 — CONCESSÕES E RLS (docs/fundacao/01-ARQUITETURA.md §4)
-- Camada 1: concessões por papel (anon não tem nada; authenticated só o que a
-- tabela permite; service_role é o backend). Camada 2: RLS por organização e
-- papel. Camada 3 (já nas migrations anteriores): chaves compostas, checks e
-- gatilhos. Cada uma vale sozinha se outra falhar.
-- ==========================================================================

revoke all on all tables in schema app from public, anon, authenticated;

-- authenticated: o que cada tabela permite (o RLS decide QUAIS linhas)
grant select, update on app.organizacoes to authenticated;   -- criar e apagar organização: só o backend
grant select, insert, update, delete on app.membros, app.clientes, app.leads, app.projetos, app.briefings, app.propostas, app.revisoes to authenticated;
grant select on app.auditoria to authenticated;                -- escrita só pelo gatilho; ninguém altera nem apaga

-- service_role: o backend (a chave secreta ignora o RLS; usada só para tarefas do sistema)
grant select, insert, update, delete on all tables in schema app to service_role;
revoke update, delete on app.auditoria from service_role;    -- nem o backend reescreve a auditoria

alter table app.organizacoes enable row level security;
alter table app.membros      enable row level security;
alter table app.clientes     enable row level security;
alter table app.leads        enable row level security;
alter table app.projetos     enable row level security;
alter table app.briefings    enable row level security;
alter table app.propostas    enable row level security;
alter table app.revisoes     enable row level security;
alter table app.auditoria    enable row level security;

-- ---------- organizações: membro vê; dono e admin editam ----------
create policy organizacoes_ler on app.organizacoes for select to authenticated
  using (id in (select privado.minhas_orgs()));
create policy organizacoes_editar on app.organizacoes for update to authenticated
  using (id in (select privado.minhas_orgs(array['dono', 'admin'])))
  with check (id in (select privado.minhas_orgs(array['dono', 'admin'])));

-- ---------- membros: membro vê a equipe; só o dono gerencia ----------
create policy membros_ler on app.membros for select to authenticated
  using (org_id in (select privado.minhas_orgs()));
create policy membros_criar on app.membros for insert to authenticated
  with check (org_id in (select privado.minhas_orgs(array['dono'])));
create policy membros_editar on app.membros for update to authenticated
  using (org_id in (select privado.minhas_orgs(array['dono'])))
  with check (org_id in (select privado.minhas_orgs(array['dono'])));
create policy membros_apagar on app.membros for delete to authenticated
  using (org_id in (select privado.minhas_orgs(array['dono'])));

-- ---------- o negócio: membro lê, cria e edita; apagar só dono e admin ----------
do $$
declare t text;
begin
  foreach t in array array['clientes', 'leads', 'projetos', 'briefings', 'propostas', 'revisoes'] loop
    execute format('create policy %I on app.%I for select to authenticated using (org_id in (select privado.minhas_orgs()))', t || '_ler', t);
    execute format('create policy %I on app.%I for insert to authenticated with check (org_id in (select privado.minhas_orgs()))', t || '_criar', t);
    execute format('create policy %I on app.%I for update to authenticated using (org_id in (select privado.minhas_orgs())) with check (org_id in (select privado.minhas_orgs()))', t || '_editar', t);
    execute format('create policy %I on app.%I for delete to authenticated using (org_id in (select privado.minhas_orgs(array[''dono'', ''admin''])))', t || '_apagar', t);
  end loop;
end $$;

-- ---------- auditoria: dono e admin leem a da própria organização ----------
create policy auditoria_ler on app.auditoria for select to authenticated
  using (org_id in (select privado.minhas_orgs(array['dono', 'admin'])));
