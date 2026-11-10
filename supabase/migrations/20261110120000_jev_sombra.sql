-- ==========================================================================
-- O MODO SOMBRA DO JEV (F3): o classificador Haiku v2 lê cada turno do Zero em segundo plano e só MEDE
-- (api/_classificador/sombra.mjs). Desligado por padrão (JEV_SOMBRA=1 liga). Esta tabela é o registro dessa medição.
--
-- • SEM TEXTO DE NINGUÉM: nem a mensagem, nem a saída do modelo, nem a resposta. Só ids técnicos (a conversa e o pedido
--   que já existem), a tarefa e qual texto foi lido (entrada, saída do modelo, resposta final), os rótulos e
--   probabilidades do Haiku (sinais), o que o código disse (codigo), onde os dois divergem, versões, modelo, custo e tempo.
--   As checagens abaixo recusam qualquer coisa fora desse vocabulário fechado (um texto não cabe em nenhuma coluna).
-- • Tabela fechada, como app.recados: RLS ligado, SEM política, nenhum privilégio; só as funções (service_role).
-- • RETENÇÃO: a da conversa. Apagar a conversa (retenção ou pedido do titular) apaga as linhas dela (FK em cascata).
-- • O teto do dia da sombra (US$ 0,30 no código) é lido por app.vendas_sombra_gasto_dia: o gasto de hoje, em Brasília.
--   Não entra no gasto do Zero (app.ia_chamadas): a sombra não mexe no disjuntor nem no teto da conversa.
-- ==========================================================================

-- os sinais do Haiku já conferidos (api/_classificador/conferencia.mjs): por pergunta, só { p_sim } ou { escolha, p } ou
-- { nota, p }; números de 0 a 1 (nota de 1 a 5) e o rótulo é um dos nossos (minúsculas e _)
create function privado.jev_sombra_sinais_ok(j jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; c text;
begin
  if j is null then return true; end if;
  if jsonb_typeof(j) <> 'object' or pg_column_size(j) > 2048 then return false; end if;
  for k, v in select * from jsonb_each(j) loop
    if k !~ '^[a-z_]{1,40}$' or jsonb_typeof(v) <> 'object' then return false; end if;
    for c in select jsonb_object_keys(v) loop
      if c not in ('p_sim', 'p', 'escolha', 'nota') then return false; end if;
    end loop;
    if v ? 'p_sim' and (jsonb_typeof(v -> 'p_sim') <> 'number' or (v ->> 'p_sim')::numeric not between 0 and 1) then return false; end if;
    if v ? 'p' and (jsonb_typeof(v -> 'p') <> 'number' or (v ->> 'p')::numeric not between 0 and 1) then return false; end if;
    if v ? 'nota' and (jsonb_typeof(v -> 'nota') <> 'number' or (v ->> 'nota')::numeric not between 1 and 5) then return false; end if;
    if v ? 'escolha' and (jsonb_typeof(v -> 'escolha') <> 'string' or (v ->> 'escolha') !~ '^[a-z_]{1,20}$') then return false; end if;
  end loop;
  return true;
end $$;

-- o que o código disse: por pergunta, só sim/nao (ou regulado/livre no ramo de saúde)
create function privado.jev_sombra_codigo_ok(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(j) = 'object' and pg_column_size(j) <= 1024
    and not exists (select 1 from jsonb_each(j) e where e.key !~ '^[a-z_]{1,40}$' or jsonb_typeof(e.value) <> 'string'
                    or (e.value #>> '{}') not in ('sim', 'nao', 'regulado', 'livre'))
$$;

-- versões e contagens: chaves e valores curtos, sem espaço (versões) ou inteiros pequenos (o que foi mascarado)
create function privado.jev_sombra_versoes_ok(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(j) = 'object' and pg_column_size(j) <= 512
    and not exists (select 1 from jsonb_each(j) e where e.key !~ '^[a-z_]{1,20}$' or jsonb_typeof(e.value) <> 'string'
                    or (e.value #>> '{}') !~ '^[a-z0-9.-]{1,20}$')
$$;
create function privado.jev_sombra_contagens_ok(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(j) = 'object' and pg_column_size(j) <= 256
    and not exists (select 1 from jsonb_each(j) e where e.key not in ('email', 'telefone', 'documento') or jsonb_typeof(e.value) <> 'number'
                    or (e.value #>> '{}')::numeric not between 0 and 1000)
$$;

create table app.jev_sombra (
  id            bigint generated always as identity primary key,
  org_id        uuid not null,
  conversa_id   uuid not null,
  criado_em     timestamptz not null default now(),
  request_id    text check (request_id ~ '^[0-9a-f-]{36}$'),
  tarefa        text not null check (tarefa in ('entrada_do_visitante', 'saida_do_zero')),
  alvo          text not null check (alvo in ('entrada', 'modelo', 'final')),
  disponivel    boolean not null,
  motivo        text check (motivo in ('sem motor', 'disjuntor aberto', 'prazo', 'motor falhou', 'resposta incoerente', 'entrada inválida')),
  sinais        jsonb check (privado.jev_sombra_sinais_ok(sinais)),
  codigo        jsonb not null default '{}' check (privado.jev_sombra_codigo_ok(codigo)),
  divergencias  text[] not null default '{}' check (cardinality(divergencias) <= 12
                  and array_to_string(divergencias, ',') ~ '^([a-z_]{1,40}:(so_haiku|so_codigo)(,|$))*$'),
  versoes       jsonb not null default '{}' check (privado.jev_sombra_versoes_ok(versoes)),
  modelo        text check (modelo ~ '^[a-z0-9.-]{1,60}$'),
  custo_usd     numeric(10, 6) not null default 0 check (custo_usd between 0 and 1),
  ms            integer check (ms between 0 and 120000),
  cortado       boolean not null default false,
  mascarados    jsonb not null default '{}' check (privado.jev_sombra_contagens_ok(mascarados)),
  check (disponivel = (motivo is null)),
  check (disponivel or sinais is null),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade
);
create index jev_sombra_org_criado on app.jev_sombra (org_id, criado_em desc);
create index jev_sombra_conversa on app.jev_sombra (conversa_id);

alter table app.jev_sombra enable row level security;   -- (sem política: só as funções do backend leem e escrevem)
revoke all on app.jev_sombra from public, anon, authenticated, service_role;

-- registrar uma leitura: só para a conversa do próprio visitante (senão P0002); o resto, as checagens da tabela recusam (23514)
create function app.vendas_sombra_registrar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  insert into app.jev_sombra (org_id, conversa_id, request_id, tarefa, alvo, disponivel, motivo, sinais, codigo, divergencias, versoes, modelo, custo_usd, ms, cortado, mascarados)
  values (c.org_id, c.id, p ->> 'request_id', p ->> 'tarefa', p ->> 'alvo', (p ->> 'disponivel')::boolean, p ->> 'motivo',
          case when jsonb_typeof(p -> 'sinais') = 'object' then p -> 'sinais' end,
          coalesce(p -> 'codigo', '{}'),
          coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'divergencias') = 'array' then p -> 'divergencias' else '[]' end) x), '{}'),
          coalesce(p -> 'versoes', '{}'), p ->> 'modelo', coalesce((p ->> 'custo_usd')::numeric, 0), (p ->> 'ms')::integer,
          coalesce((p ->> 'cortado')::boolean, false), coalesce(p -> 'mascarados', '{}'));
  return jsonb_build_object('ok', true);
end $$;

-- o gasto da sombra hoje (dia de Brasília), para o teto do dia; organização desconhecida = 0
create function app.vendas_sombra_gasto_dia(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('custo_usd', coalesce(sum(s.custo_usd), 0))
  from app.jev_sombra s join app.organizacoes o on o.id = s.org_id
  where o.slug = p ->> 'org_slug'
    and s.criado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
$$;

-- a leitura para o relatório (scripts/relatorio-jev-sombra.mjs): as linhas dos últimos N dias (1 a 90), sem ids nem texto
create function app.vendas_sombra_resumo(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_dias integer := coalesce((p ->> 'dias')::integer, 7);
begin
  if v_dias not between 1 and 90 then raise exception 'dias: de 1 a 90' using errcode = '22023'; end if;
  return jsonb_build_object('linhas', coalesce((
    select jsonb_agg(jsonb_build_object('dia', x.dia, 'tarefa', x.tarefa, 'alvo', x.alvo, 'disponivel', x.disponivel, 'motivo', x.motivo,
             'sinais', x.sinais, 'codigo', x.codigo, 'divergencias', to_jsonb(x.divergencias), 'versoes', x.versoes, 'custo_usd', x.custo_usd, 'ms', x.ms))
    from (select (s.criado_em at time zone 'America/Sao_Paulo')::date as dia, s.*
          from app.jev_sombra s join app.organizacoes o on o.id = s.org_id
          where o.slug = p ->> 'org_slug' and s.criado_em > now() - make_interval(days => v_dias)
          order by s.criado_em desc limit 5000) x), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array['jev_sombra_sinais_ok', 'jev_sombra_codigo_ok', 'jev_sombra_versoes_ok', 'jev_sombra_contagens_ok'] loop
    execute format('revoke all on function privado.%I(jsonb) from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['vendas_sombra_registrar', 'vendas_sombra_gasto_dia', 'vendas_sombra_resumo'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
