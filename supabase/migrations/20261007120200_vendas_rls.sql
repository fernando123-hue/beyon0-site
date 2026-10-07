-- ==========================================================================
-- FASE 2 — 3/3: CONCESSÕES E RLS DO AGENTE DE VENDAS
-- VISITANTE (usuário anônimo): só LÊ a própria conversa e o que pende dela.
--   Não escreve direto em nada: toda escrita passa pelas funções de
--   …_vendas_funcoes.sql, chamadas pelo backend depois de conferir o token.
-- EQUIPE (membros): lê o funil inteiro da organização; dono e admin mantêm
--   as regras comerciais (criar rascunho, aprovar, arquivar).
-- anon: nada. service_role: o backend.
-- ==========================================================================

-- as conversas do usuário atual (o visitante). SECURITY DEFINER pelo mesmo motivo de minhas_orgs.
create function privado.minhas_conversas() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from app.conversas c where c.visitante_id = auth.uid()
$$;
revoke all on function privado.minhas_conversas() from public, anon;
grant execute on function privado.minhas_conversas() to authenticated, service_role;

revoke all on app.regras_comerciais, app.conversas, app.mensagens, app.estimativas, app.direcoes, app.escolhas,
  app.alteracoes, app.pagamentos, app.eventos_pagamento, app.eventos_funil from public, anon, authenticated;

grant select on app.conversas, app.mensagens, app.estimativas, app.direcoes, app.escolhas, app.alteracoes,
  app.pagamentos, app.eventos_funil to authenticated;
grant select, insert, update on app.regras_comerciais to authenticated;
grant select, insert, update, delete on app.regras_comerciais, app.conversas, app.mensagens, app.estimativas,
  app.direcoes, app.escolhas, app.alteracoes, app.pagamentos, app.eventos_pagamento, app.eventos_funil to service_role;
-- os eventos do gateway são só do backend; nem a equipe precisa ler pela API
revoke update, delete on app.eventos_pagamento from service_role;
grant update (pagamento_id, resultado) on app.eventos_pagamento to service_role;

alter table app.regras_comerciais enable row level security;
alter table app.conversas         enable row level security;
alter table app.mensagens         enable row level security;
alter table app.estimativas       enable row level security;
alter table app.direcoes          enable row level security;
alter table app.escolhas          enable row level security;
alter table app.alteracoes        enable row level security;
alter table app.pagamentos        enable row level security;
alter table app.eventos_pagamento enable row level security;
alter table app.eventos_funil     enable row level security;

-- ---------- regras: a equipe lê; dono e admin escrevem ----------
create policy regras_ler on app.regras_comerciais for select to authenticated
  using (org_id in (select privado.minhas_orgs()));
create policy regras_criar on app.regras_comerciais for insert to authenticated
  with check (org_id in (select privado.minhas_orgs(array['dono', 'admin'])));
create policy regras_editar on app.regras_comerciais for update to authenticated
  using (org_id in (select privado.minhas_orgs(array['dono', 'admin'])))
  with check (org_id in (select privado.minhas_orgs(array['dono', 'admin'])));

-- ---------- conversas: o visitante vê a dele; a equipe vê as da organização ----------
create policy conversas_ler on app.conversas for select to authenticated
  using (visitante_id = (select auth.uid()) or org_id in (select privado.minhas_orgs()));

-- ---------- o que pende de uma conversa ----------
do $$
declare t text;
begin
  foreach t in array array['mensagens', 'estimativas', 'direcoes', 'escolhas', 'alteracoes', 'eventos_funil'] loop
    execute format('create policy %I on app.%I for select to authenticated using (conversa_id in (select privado.minhas_conversas()) or org_id in (select privado.minhas_orgs()))', t || '_ler', t);
  end loop;
end $$;
-- (o visitante não vê o funil: é métrica interna. Sobrescreve a política acima para eventos_funil)
drop policy eventos_funil_ler on app.eventos_funil;
create policy eventos_funil_ler on app.eventos_funil for select to authenticated
  using (org_id in (select privado.minhas_orgs()));

-- ---------- pagamentos: o visitante vê os da proposta da conversa dele; a equipe, os da organização ----------
create policy pagamentos_ler on app.pagamentos for select to authenticated
  using (
    org_id in (select privado.minhas_orgs())
    or proposta_id in (select p.id from app.propostas p where p.conversa_id in (select privado.minhas_conversas()))
  );

-- ---------- propostas: o visitante passa a ver o escopo final da conversa dele ----------
grant select on app.propostas to authenticated;   -- (já concedido na Fase 1; reafirmado)
create policy propostas_ler_visitante on app.propostas for select to authenticated
  using (conversa_id in (select privado.minhas_conversas()));
