-- ==========================================================================
-- 3/6 — NÚCLEO DO MULTI-ORGANIZAÇÃO: organizações, membros e as funções de
-- segurança que as políticas usam (docs/fundacao/01-ARQUITETURA.md §2–§4).
-- ==========================================================================

-- ---------- gatilhos comuns ----------

-- MODO RESTAURAÇÃO (docs/fundacao/02-OPERACAO.md §5): ao restaurar uma cópia,
-- as datas, a autoria e a auditoria originais têm de ficar como estavam. Só
-- vale SEM usuário (auth.uid() nulo: o dono rodando direto no banco, nunca
-- uma requisição da API) e com "set bz.restaurando = on" na sessão.
create function privado.restaurando() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is null and coalesce(current_setting('bz.restaurando', true), '') = 'on'
$$;

-- created_at/updated_at e created_by/updated_by vêm do banco, nunca do cliente:
-- o valor enviado na requisição é ignorado. Sem usuário (backend com a chave
-- secreta), a autoria fica nula = "sistema".
create function privado.carimbar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if privado.restaurando() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- o tenant de um registro não muda depois de criado (mover um registro para
-- outra organização seria um caminho de vazamento entre organizações)
create function privado.org_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- organizações ----------
create table app.organizacoes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  nome        text not null check (char_length(btrim(nome)) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null
);
create trigger carimbar before insert or update on app.organizacoes
  for each row execute function privado.carimbar();

-- ---------- membros ----------
create table app.membros (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references app.organizacoes (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  papel       text not null check (papel in ('dono', 'admin', 'membro')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,
  unique (org_id, user_id)
);
create index membros_user on app.membros (user_id);
create trigger carimbar before insert or update on app.membros
  for each row execute function privado.carimbar();
create trigger org_imutavel before update on app.membros
  for each row execute function privado.org_imutavel();

-- a organização nunca fica sem dono (rebaixar ou remover o último dono é
-- recusado; quando a própria organização está sendo apagada, a cascata passa).
-- SECURITY DEFINER: a contagem de donos não pode depender do que o RLS deixa o usuário ver
create function privado.manter_um_dono() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.papel <> 'dono' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.papel = 'dono' then return new; end if;
  if not exists (select 1 from app.organizacoes o where o.id = old.org_id) then return coalesce(new, old); end if;
  -- trava a organização: duas transações rebaixando dois donos ao mesmo tempo não podem, cada uma,
  -- enxergar a outra como "o dono que sobra" (revisão de banco, 2026-10-06)
  perform 1 from app.organizacoes o where o.id = old.org_id for update;
  if not exists (select 1 from app.membros m where m.org_id = old.org_id and m.papel = 'dono' and m.id <> old.id) then
    raise exception 'a organização precisa de pelo menos um dono' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger manter_um_dono before update or delete on app.membros
  for each row execute function privado.manter_um_dono();

-- ---------- as funções que as políticas usam ----------
-- SECURITY DEFINER: leem app.membros sem cair no RLS da própria tabela
-- (recursão). search_path vazio: nada de objeto com o mesmo nome em outro
-- esquema sequestrando a função. STABLE e em subconsulta nas políticas
-- (`org_id in (select privado.minhas_orgs())`): roda uma vez por consulta.

-- as organizações em que o usuário atual está; com p_papeis, só onde tem um desses papéis
create function privado.minhas_orgs(p_papeis text[] default null) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.org_id
  from app.membros m
  where m.user_id = auth.uid()
    and (p_papeis is null or m.papel = any (p_papeis))
$$;

revoke all on function privado.minhas_orgs(text[]) from public, anon;
grant execute on function privado.minhas_orgs(text[]) to authenticated, service_role;
revoke all on function privado.carimbar() from public, anon, authenticated;
revoke all on function privado.restaurando() from public, anon;
grant execute on function privado.restaurando() to authenticated, service_role;
revoke all on function privado.org_imutavel() from public, anon, authenticated;
revoke all on function privado.manter_um_dono() from public, anon, authenticated;
