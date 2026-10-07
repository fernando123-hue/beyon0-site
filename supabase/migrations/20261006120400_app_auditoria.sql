-- ==========================================================================
-- 5/6 — AUDITORIA (docs/fundacao/01-ARQUITETURA.md §7)
-- Só acréscimo. Quem fez, o quê, em qual registro e QUAIS CAMPOS mudaram.
-- Valores só dos campos seguros que cada tabela declara (situação, papel,
-- valor, datas). Nome, e-mail, telefone, notas, escopo e respostas de
-- briefing nunca são copiados. Login fica no registro do próprio Supabase
-- Auth (auth.audit_log_entries).
-- org_id SEM chave estrangeira: a linha de auditoria sobrevive ao registro
-- (e à organização) que ela descreve.
-- ==========================================================================

create table app.auditoria (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid,
  ator_id      uuid,
  ator_tipo    text not null check (ator_tipo in ('usuario', 'sistema')),
  acao         text not null check (acao in ('criou', 'alterou', 'removeu')),
  tabela       text not null check (tabela ~ '^[a-z_]{1,63}$'),
  registro_id  uuid,
  campos       text[] not null default '{}',
  valores      jsonb not null default '{}' check (jsonb_typeof(valores) = 'object'),
  created_at   timestamptz not null default now()
);
create index auditoria_org on app.auditoria (org_id, created_at desc);
create index auditoria_registro on app.auditoria (tabela, registro_id);

-- os argumentos do gatilho (TG_ARGV) são os campos cujo VALOR pode ir para a auditoria
create function privado.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  antes   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  depois  jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  linha   jsonb := coalesce(depois, antes);
  seguros text[] := coalesce(tg_argv::text[], '{}');
  ignorar text[] := array['created_at', 'updated_at', 'created_by', 'updated_by'];
  campos  text[];
  valores jsonb;
begin
  if privado.restaurando() then return null; end if;   -- a cópia restaurada já traz a auditoria original
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into campos
    from jsonb_each(depois) e (k, v)
    where v is distinct from antes -> k and not k = any (ignorar);
    if cardinality(campos) = 0 then return null; end if;
  else
    select coalesce(array_agg(k order by k), '{}') into campos
    from jsonb_object_keys(linha) k
    where not k = any (ignorar);
  end if;

  select coalesce(jsonb_object_agg(k, linha -> k), '{}') into valores
  from unnest(campos) k
  where k = any (seguros);

  insert into app.auditoria (org_id, ator_id, ator_tipo, acao, tabela, registro_id, campos, valores)
  values (
    case when tg_table_name = 'organizacoes' then (linha ->> 'id')::uuid else (linha ->> 'org_id')::uuid end,
    auth.uid(),
    case when auth.uid() is null then 'sistema' else 'usuario' end,
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'removeu' end,
    tg_table_name,
    (linha ->> 'id')::uuid,
    campos,
    valores
  );
  return null;
end $$;
revoke all on function privado.auditar() from public, anon, authenticated;

create trigger auditar after insert or update or delete on app.organizacoes
  for each row execute function privado.auditar('slug', 'nome');
create trigger auditar after insert or update or delete on app.membros
  for each row execute function privado.auditar('user_id', 'papel');
create trigger auditar after insert or update or delete on app.clientes
  for each row execute function privado.auditar('tipo', 'arquivado_em');
create trigger auditar after insert or update or delete on app.leads
  for each row execute function privado.auditar('status', 'interesse', 'origem_meio', 'origem_fonte', 'campanha', 'cliente_id');
create trigger auditar after insert or update or delete on app.projetos
  for each row execute function privado.auditar('status', 'tipo', 'cliente_id', 'lead_id', 'inicio_em', 'previsto_para', 'entregue_em');
create trigger auditar after insert or update or delete on app.briefings
  for each row execute function privado.auditar('status', 'versao_formulario', 'lead_id', 'projeto_id');
create trigger auditar after insert or update or delete on app.propostas
  for each row execute function privado.auditar('status', 'versao', 'valor_total', 'moeda', 'validade', 'enviada_em', 'respondida_em', 'lead_id', 'projeto_id');
create trigger auditar after insert or update or delete on app.revisoes
  for each row execute function privado.auditar('status', 'origem', 'concluida_em', 'projeto_id');
