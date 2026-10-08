-- ==========================================================================
-- RESERVA DE CUSTO DA IA antes de chamar o modelo (revisão de segurança do
-- PR #1, B6). Antes, o teto era LIDO antes e SOMADO depois: chamadas em
-- paralelo (as 3 direções de site, muitas conversas ao mesmo tempo) passavam
-- todas pela leitura e o teto da conversa e o do dia estouravam sem limite.
-- Agora cada chamada reserva um valor REALISTA (RESERVA_USD em api/_ia/config.mjs)
-- numa transação que trava a organização: só começa se (gasto + reservas em
-- aberto) ainda está ABAIXO do teto — da conversa e do dia. O estouro fica no que
-- as chamadas já em voo gastarem além das reservas; o freio de última instância
-- é o limite de gasto no console da Anthropic. Depois da chamada, o custo
-- real é somado (como antes) e a reserva é liberada; reserva esquecida (a
-- função caiu no meio) vence sozinha e deixa de contar.
-- ==========================================================================
create table privado.reservas_ia (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id  uuid not null references app.conversas (id) on delete cascade,
  valor_usd    numeric(10, 4) not null check (valor_usd > 0 and valor_usd <= 10),
  criada_em    timestamptz not null default now(),
  expira_em    timestamptz not null
);
create index reservas_ia_org on privado.reservas_ia (org_id, expira_em);
create index reservas_ia_conversa on privado.reservas_ia (conversa_id);
alter table privado.reservas_ia enable row level security;   -- (sem política: ninguém lê por API; só as funções do dono)
revoke all on table privado.reservas_ia from public, anon, authenticated, service_role;
-- a soma do gasto do dia roda dentro da trava: com índice
create index if not exists conversas_org_atividade on app.conversas (org_id, ultima_atividade);

-- p = { conversa_id, visitante_id, valor_usd, teto_conversa_usd, teto_dia_usd, segundos }
-- → { ok: true, reserva_id } | { ok: false, motivo: 'conversa' | 'dia' }
create function app.vendas_reservar_custo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.conversas;
  v_valor numeric := (p ->> 'valor_usd')::numeric;
  v_teto_conv numeric := (p ->> 'teto_conversa_usd')::numeric;
  v_teto_dia numeric := (p ->> 'teto_dia_usd')::numeric;
  v_segundos integer := coalesce((p ->> 'segundos')::integer, 600);
  v_reservado_conv numeric;
  v_reservado_org numeric;
  v_gasto_dia numeric;
  v_id uuid;
begin
  if v_valor is null or v_valor <= 0 or v_valor > 10 then raise exception 'valor da reserva inválido' using errcode = '22023'; end if;
  if v_teto_conv is null or v_teto_conv <= 0 or v_teto_dia is null or v_teto_dia <= 0 then raise exception 'teto inválido' using errcode = '22023'; end if;
  if v_segundos < 30 or v_segundos > 900 then raise exception 'validade da reserva inválida' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  -- uma reserva por vez na organização inteira (o teto do dia é da organização). "for no key update": exclui as
  -- outras reservas sem bloquear quem só cria linhas que apontam para a organização (conversas, eventos)
  perform set_config('lock_timeout', '2000', true);   -- (fila longa na trava: desiste em 2 s, e o servidor responde 503 com WhatsApp)
  perform 1 from app.organizacoes where id = c.org_id for no key update;
  delete from privado.reservas_ia where org_id = c.org_id and expira_em < now();
  select coalesce(sum(valor_usd), 0) into v_reservado_conv from privado.reservas_ia where conversa_id = c.id;
  if c.custo_ia_usd + v_reservado_conv >= v_teto_conv then return jsonb_build_object('ok', false, 'motivo', 'conversa'); end if;
  select coalesce(sum(valor_usd), 0) into v_reservado_org from privado.reservas_ia where org_id = c.org_id;
  -- o gasto do dia: a mesma conta de app.vendas_custo_dia
  select coalesce(sum(x.custo_ia_usd), 0) into v_gasto_dia from app.conversas x
  where x.org_id = c.org_id
    and x.ultima_atividade >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  if v_gasto_dia + v_reservado_org >= v_teto_dia then return jsonb_build_object('ok', false, 'motivo', 'dia'); end if;
  insert into privado.reservas_ia (org_id, conversa_id, valor_usd, expira_em)
  values (c.org_id, c.id, v_valor, now() + make_interval(secs => v_segundos))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'reserva_id', v_id);
end $$;

-- p = { reserva_id, conversa_id, visitante_id }: só a conversa dona libera
create function app.vendas_liberar_reserva(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  delete from privado.reservas_ia where id = (p ->> 'reserva_id')::uuid and conversa_id = c.id;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['vendas_reservar_custo', 'vendas_liberar_reserva'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
